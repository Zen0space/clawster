import type { FastifyInstance } from "fastify";
import { prisma } from "@clawster/db";
import { boss } from "../worker/boss";
import { CHAT_REPLY_JOB } from "./chatbot.worker";
import { getChatClient, getChatModel, isChatConfigured } from "./llm-client";
import { listConversations, listMessages, getChatbotConfig, saveChatbotConfig, getChatStats } from "./chatbot.service";


type LastCheck = { ok: boolean; latencyMs?: number; error?: string; checkedAt: string };
let lastCheck: LastCheck | null = null;

async function runHealthCheck(): Promise<LastCheck> {
  const client = getChatClient();
  if (!client) {
    const result: LastCheck = { ok: false, error: "not_configured", checkedAt: new Date().toISOString() };
    lastCheck = result;
    return result;
  }
  const start = Date.now();
  try {
    await client.chat.completions.create({
      model: "ilmu-nemo-nano",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });
    const result: LastCheck = { ok: true, latencyMs: Date.now() - start, checkedAt: new Date().toISOString() };
    lastCheck = result;
    return result;
  } catch (err: unknown) {
    let message = "Could not reach provider";
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 401) message = "Invalid API key — check CHAT_API_KEY on the server";
      else if (status === 404) message = "Model not found — check CHAT_MODEL";
      else if (status === 429) message = "Rate limited / insufficient credit";
      else message = `Provider error ${status}`;
    } else if (err instanceof Error) {
      message = `Could not reach ${process.env.CHAT_BASE_URL ?? "provider"}: ${err.message}`;
    }
    const result: LastCheck = { ok: false, error: message, checkedAt: new Date().toISOString() };
    lastCheck = result;
    return result;
  }
}

export async function chatbotRoutes(app: FastifyInstance) {
  // GET /chat/health — status (never returns CHAT_API_KEY)
  app.get("/chat/health", { onRequest: [app.authenticate] }, async () => {
    return {
      configured: isChatConfigured(),
      ...(isChatConfigured() && {
        baseUrl: process.env.CHAT_BASE_URL,
        model: getChatModel(),
      }),
      lastCheck,
    };
  });

  // POST /chat/health/check — live ping (rate-limited: 5/min per user)
  app.post("/chat/health/check", {
    onRequest: [app.authenticate],
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (_request, reply) => {
    if (!isChatConfigured()) {
      return reply.status(422).send({ ok: false, error: "not_configured" });
    }
    const result = await runHealthCheck();
    return result;
  });

  // GET /chat/config/:waSessionId
  app.get("/chat/config/:waSessionId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { waSessionId } = request.params as { waSessionId: string };
    const session = await prisma.waSession.findFirst({ where: { id: waSessionId, userId: request.user.sub } });
    if (!session) return reply.status(404).send({ error: "not_found" });
    return getChatbotConfig(waSessionId);
  });

  // PUT /chat/config/:waSessionId
  app.put("/chat/config/:waSessionId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { waSessionId } = request.params as { waSessionId: string };
    const session = await prisma.waSession.findFirst({ where: { id: waSessionId, userId: request.user.sub } });
    if (!session) return reply.status(404).send({ error: "not_found" });

    const b = request.body as Record<string, unknown>;
    const systemPrompt = typeof b.systemPrompt === "string" ? b.systemPrompt : "";
    // 0 = omit max_tokens entirely (unconstrained); otherwise clamp to [64, 16384]
    const rawMax = Number(b.maxTokens);
    const maxTokens = rawMax === 0 ? 0 : Math.min(16384, Math.max(64, rawMax || 4096));
    const dailyReplyCap = Math.min(1000, Math.max(1, Number(b.dailyReplyCap) || 200));
    const replyMinDelaySec = Math.min(300, Math.max(1, Number(b.replyMinDelaySec) || 15));
    const replyMaxDelaySec = Math.min(600, Math.max(replyMinDelaySec, Number(b.replyMaxDelaySec) || 45));
    const priorityJids = Array.isArray(b.priorityJids)
      ? (b.priorityJids as unknown[]).filter((j): j is string => typeof j === "string")
      : [];
    const quietStart = b.quietStart == null ? null : Math.min(23, Math.max(0, Number(b.quietStart)));
    // Force quietEnd to null if quietStart is null — keeps the pair consistent
    const quietEnd = quietStart == null ? null : (b.quietEnd == null ? null : Math.min(23, Math.max(0, Number(b.quietEnd))));
    const enabled = Boolean(b.enabled);

    if (systemPrompt.length > 8000) return reply.status(400).send({ error: "system_prompt_too_long" });
    if (quietStart != null && quietEnd == null) return reply.status(400).send({ error: "quiet_hours_incomplete" });

    const config = await saveChatbotConfig(waSessionId, { enabled, systemPrompt, maxTokens, dailyReplyCap, replyMinDelaySec, replyMaxDelaySec, priorityJids, quietStart, quietEnd });
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "chatbot.config.save", subject: waSessionId } });
    return config;
  });

  // GET /chat/stats — token usage for the current user
  app.get("/chat/stats", { onRequest: [app.authenticate] }, async (request) => {
    return getChatStats(request.user.sub);
  });

  // PATCH /chat/conversations/:id/takeover
  app.patch("/chat/conversations/:id/takeover", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const humanTakeover = Boolean(body?.humanTakeover);

    const conversation = await prisma.chatConversation.findFirst({
      where: { id, waSession: { userId: request.user.sub } },
    });
    if (!conversation) return reply.status(404).send({ error: "not_found" });

    const updated = await prisma.chatConversation.update({
      where: { id },
      data: { humanTakeover },
    });
    return updated;
  });

  // GET /chat/conversations?waSessionId=...
  app.get("/chat/conversations", { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    if (!q.waSessionId) return reply.status(400).send({ error: "waSessionId_required" });

    const session = await prisma.waSession.findFirst({
      where: { id: q.waSessionId, userId: request.user.sub },
    });
    if (!session) return reply.status(404).send({ error: "not_found" });

    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));
    return listConversations(q.waSessionId, page, limit);
  });

  // GET /chat/conversations/:id/messages
  app.get("/chat/conversations/:id/messages", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as Record<string, string>;

    const conversation = await prisma.chatConversation.findFirst({
      where: { id, waSession: { userId: request.user.sub } },
    });
    if (!conversation) return reply.status(404).send({ error: "not_found" });

    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    return listMessages(id, page, limit);
  });

  // POST /chat/conversations/:id/messages — send a manual reply
  app.post("/chat/conversations/:id/messages", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) return reply.status(400).send({ error: "content_required" });
    if (content.length > 4096) return reply.status(400).send({ error: "content_too_long" });

    const conversation = await prisma.chatConversation.findFirst({
      where: { id, waSession: { userId: request.user.sub } },
      include: { waSession: { select: { userId: true } } },
    });
    if (!conversation) return reply.status(404).send({ error: "not_found" });

    const message = await prisma.chatMessage.create({
      data: { conversationId: id, role: "human", body: content },
    });

    await prisma.chatConversation.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    });

    await boss.send(CHAT_REPLY_JOB, {
      messageId: message.id,
      conversationId: id,
      waSessionId: conversation.waSessionId,
      userId: conversation.waSession.userId,
      remoteJid: conversation.remoteJid,
      body: content,
    });

    return reply.status(201).send(message);
  });
}
