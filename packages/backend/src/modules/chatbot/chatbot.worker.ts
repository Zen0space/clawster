import { prisma } from "@clawster/db";
import { boss } from "../worker/boss";
import { waHub } from "../wa/wa.hub";
import { waRegistryGet } from "../wa/wa.registry";
import { getChatClient, getChatModel, isChatConfigured } from "./llm-client";
import { log } from "../../logger";

export const CHAT_REPLY_JOB = "chatbot-reply";
export const CHAT_BOT_REPLY_JOB = "chatbot-bot-reply";

// ── Shared helpers ─────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function randBetween(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const APP_TZ_OFFSET_MIN = 8 * 60;
function getAppHour() { return new Date(Date.now() + APP_TZ_OFFSET_MIN * 60_000).getUTCHours(); }
function isQuietHour(start: number | null, end: number | null) {
  if (start == null || end == null) return false;
  const h = getAppHour();
  return start < end ? (h >= start && h < end) : (h >= start || h < end);
}

// Role + scope definition. Hardcoded in the codebase — the operator cannot override
// behaviour rules, only supply the knowledge base the bot answers from.
const BOT_ROLE_PROMPT = `You are a friendly WhatsApp assistant for the business described in the knowledge base below. Your job is to answer questions about this business, its products/services, policies, and anything else covered in the knowledge base.

Scope rules (non-negotiable):
- Only answer questions that can be answered using the knowledge base provided below.
- If the knowledge base doesn't contain the answer, politely say you don't have that information and offer to connect them with a human. Do NOT guess, assume, or fill in with outside knowledge.
- Never invent prices, features, hours, policies, or any other fact. If it isn't in the knowledge base, say you don't have that info.
- For questions clearly unrelated to the business (weather, news, general trivia), briefly redirect to topics the knowledge base covers.`;

// Appended to every system prompt — language consistency + WhatsApp formatting.
// The few-shot style example is the most reliable way to enforce natural Manglish
// (more effective than describing the style in words alone).
const WHATSAPP_FORMAT_RULES = `

Language & tone (non-negotiable):
- Mirror the user's language register exactly throughout the entire reply. Formal BM user → reply fully formal BM. Casual Manglish user → reply casual Manglish. Never switch register mid-reply.
- Use conversational BM, not textbook BM. Prefer: nak, tak, dah, je, pun, boleh. Avoid: hendak, tidak, sudah, merupakan, ialah when casual alternatives exist.
- Use particles naturally: lah, kan, eh, tu — not randomly sprinkled, but where a real person would use them.
- Keep English technical terms as-is. Do not invent BM translations for established terms.
- Never use non-standard or invented BM words.
- If unsure of the correct BM spelling or official name of an institution, use the English term instead — never guess.

Style example (follow this tone, not the words):
User: boleh explain sikit pasal hibah?
Assistant: Hibah tu basically kau bagi harta masa kau masih hidup lah — lain dengan wasiat yang baru berkuat kuasa bila dah meninggal. Kalau nak pastikan anak-anak atau sesiapa dapat harta terus, hibah lagi selamat sebab tak kena faraid.

WhatsApp formatting (non-negotiable):
- Plain text only. No markdown of any kind.
- Bold: *single asterisks* only. Never **double asterisks**.
- No headers (## ###), no horizontal rules (---), no bullet points (-), no numbered lists.
- No numbered emoji (1️⃣ 2️⃣ 3️⃣) — write options as plain text: "Option pertama... Option kedua...".
- No trailing emoji at end of message.
- No sign-off phrases ("Boleh tanya lagi ye", "Saya sedia membantu").
- Reply only to the user's most recent message. Earlier messages are context only.`;

// Memory compaction — triggered when conversation has enough unsummarized
// turns to make summarizing worthwhile. Keeps last 5 turns as "recent window".
const COMPACT_THRESHOLD_UNSUMMARIZED = 15;
const COMPACT_KEEP_RECENT = 5;
const BATCH_SIZE = 3; // max user messages addressed per bot reply; excess triggers continuation

async function maybeCompactMemory(
  conversationId: string,
  existingMemory: string | null,
  memoryMessageCount: number,
): Promise<void> {
  const totalCount = await prisma.chatMessage.count({ where: { conversationId } });
  const unsummarized = totalCount - memoryMessageCount;
  if (unsummarized < COMPACT_THRESHOLD_UNSUMMARIZED) return;

  const toCompactCount = unsummarized - COMPACT_KEEP_RECENT;
  const toCompact = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    skip: memoryMessageCount,
    take: toCompactCount,
  });
  if (toCompact.length === 0) return;

  const client = getChatClient();
  if (!client) return;

  const roleLabel = (r: string) => (r === "user" ? "Contact" : "Bot");
  const prior = existingMemory ? `Previous memory:\n${existingMemory}\n\n` : "";
  const lines = toCompact.map((m) => `${roleLabel(m.role)}: ${m.body}`).join("\n");
  const prompt = `${prior}Summarize this WhatsApp conversation for long-term memory. Keep:
- Facts about the contact (preferences, location, context they gave)
- Questions asked and what was answered
- Any commitments, pending items, or unresolved topics
Be concise — under 300 words. Plain text, no markdown.

Messages to summarize:
${lines}`;

  try {
    const response = await client.chat.completions.create({
      model: getChatModel(),
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
      stream: false,
    });
    const newMemory = response.choices[0]?.message?.content?.trim();
    if (!newMemory) {
      log.warn("compaction returned empty summary — skipping");
      return;
    }
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        memory: newMemory,
        memoryMessageCount: memoryMessageCount + toCompact.length,
      },
    });
    log.info(`memory compacted — ${toCompact.length} msgs into ${newMemory.length}-char summary`);
  } catch (err) {
    log.error("compaction failed — continuing with reply", err);
    // Non-fatal: we'll just fall back to full history for this reply.
  }
}

// ── Manual send job (Phase 2) ──────────────────────────────────────────────

type ChatReplyPayload = {
  messageId: string;
  conversationId: string;
  waSessionId: string;
  userId: string;
  remoteJid: string;
  body: string;
};

async function sendChatReply(payload: ChatReplyPayload) {
  const { messageId, waSessionId, userId, remoteJid, body } = payload;

  const socket = waRegistryGet(waSessionId);
  if (!socket) {
    log.warn(`chat reply skipped — session not connected: ${waSessionId}`);
    return;
  }

  try {
    await socket.sendPresenceUpdate("composing", remoteJid);
    await sleep(randBetween(2000, 8000));
    await socket.sendPresenceUpdate("paused", remoteJid);

    const result = await socket.sendMessage(remoteJid, { text: body });

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { waMessageId: result?.key?.id ?? null },
    });

    waHub.emit(userId, {
      type: "chat.message.sent",
      message_id: messageId,
      conversation_id: payload.conversationId,
    });
  } catch (err) {
    log.error("chat reply failed", err);
  }
}

// ── Bot reply job (Phase 5) ────────────────────────────────────────────────

type ChatBotReplyPayload = {
  conversationId: string;
  waSessionId: string;
  userId: string;
  remoteJid: string;
  attempt?: number;
};

export function buildBotSystemPrompt(knowledgeBase: string): string {
  const knowledge = knowledgeBase.trim() ||
    "(no knowledge base configured yet — tell the user the bot isn't set up and offer a human handover)";
  return BOT_ROLE_PROMPT + WHATSAPP_FORMAT_RULES + `\n\n---\nKNOWLEDGE BASE:\n${knowledge}`;
}

export async function enqueueBotReply(params: Omit<ChatBotReplyPayload, "attempt">) {
  if (!isChatConfigured()) {
    log.warn("bot skipped — CHAT_API_KEY / CHAT_BASE_URL not configured");
    return;
  }

  const [config, conversation] = await Promise.all([
    prisma.chatbotConfig.findUnique({ where: { waSessionId: params.waSessionId } }),
    prisma.chatConversation.findUnique({ where: { id: params.conversationId } }),
  ]);

  if (!config) {
    log.info(`bot skipped — no chatbot config for session ${params.waSessionId}`);
    return;
  }
  if (!config.enabled) {
    log.info(`bot skipped — disabled for session ${params.waSessionId}`);
    return;
  }
  if (conversation?.humanTakeover) {
    log.info(`bot skipped — human takeover on conversation ${params.conversationId}`);
    return;
  }

  const phone = "+" + params.remoteJid.split("@")[0];
  const priorityList = Array.isArray(config.priorityJids) ? (config.priorityJids as string[]) : [];
  const isPriority = priorityList.includes(phone);

  log.info(`bot reply enqueued for ${params.conversationId}${isPriority ? " (priority)" : ""}`);
  await boss.send(CHAT_BOT_REPLY_JOB, params, {
    priority: isPriority ? 10 : 0,
    singletonKey: `bot:${params.conversationId}`,
    startAfter: 30, // seconds — coalesces burst messages into one reply, feels more human
  });
}

async function handleBotReply(payload: ChatBotReplyPayload) {
  const { conversationId, waSessionId, userId, remoteJid } = payload;
  const attempt = payload.attempt ?? 0;

  log.info(`bot job starting (conv ${conversationId}, attempt ${attempt})`);

  const [config, conversation] = await Promise.all([
    prisma.chatbotConfig.findUnique({ where: { waSessionId } }),
    prisma.chatConversation.findUnique({ where: { id: conversationId } }),
  ]);

  if (!conversation) { log.warn(`bot job skipped — conversation ${conversationId} not found`); return; }
  if (!config?.enabled) { log.info("bot job skipped — config disabled"); return; }
  if (conversation.humanTakeover) { log.info("bot job skipped — human takeover"); return; }
  if (isQuietHour(config.quietStart, config.quietEnd)) {
    log.info(`bot job skipped — quiet hours (${config.quietStart}-${config.quietEnd})`);
    return;
  }

  // Find unanswered user messages (since the last bot reply).
  // Using a count-based check instead of "last role == user" so that continuation
  // batches work correctly: after batch 1 the last message IS an assistant reply,
  // but there are still unanswered user messages for batch 2.
  const unanswered = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      role: "user",
      ...(conversation.lastBotReplyAt ? { createdAt: { gt: conversation.lastBotReplyAt } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (unanswered.length === 0) {
    log.info("bot job skipped — no unanswered user messages");
    return;
  }
  const hasMoreAfterBatch = unanswered.length > BATCH_SIZE;
  log.info(`bot job: ${unanswered.length} unanswered msgs, processing up to ${BATCH_SIZE}`);

  // Shared today boundary used by all daily checks below
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  // Daily reply cap (per-session)
  const todayReplies = await prisma.chatMessage.count({
    where: { role: "assistant", createdAt: { gte: todayStart }, conversation: { waSessionId } },
  });
  if (todayReplies >= config.dailyReplyCap) {
    log.warn(`chatbot daily reply cap reached for session ${waSessionId}`);
    return;
  }

  // Monthly token cap — fixed system limit, not user-configurable
  const MONTHLY_TOKEN_CAP = 1_000_000;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const tokenAgg = await prisma.chatMessage.aggregate({
    where: { role: "assistant", createdAt: { gte: monthStart }, conversation: { waSession: { userId } } },
    _sum: { tokensIn: true, tokensOut: true },
  });
  const usedThisMonth = (tokenAgg._sum.tokensIn ?? 0) + (tokenAgg._sum.tokensOut ?? 0);
  if (usedThisMonth >= MONTHLY_TOKEN_CAP) {
    log.warn(`monthly token cap reached for user ${userId} (${usedThisMonth}/${MONTHLY_TOKEN_CAP})`);
    waHub.emit(userId, { type: "chat.bot.token_cap_reached", session_id: waSessionId });
    return;
  }

  // Loop guard — auto-takeover if bot has sent too many replies to this conversation today
  const LOOP_DAILY_THRESHOLD = 15;
  const botRepliesToday = await prisma.chatMessage.count({
    where: { conversationId, role: "assistant", createdAt: { gte: todayStart } },
  });
  if (botRepliesToday >= LOOP_DAILY_THRESHOLD) {
    await prisma.chatConversation.update({ where: { id: conversationId }, data: { humanTakeover: true } });
    waHub.emit(userId, { type: "chat.bot.loop_detected", conversation_id: conversationId, session_id: waSessionId });
    log.warn(`loop guard triggered for conv ${conversationId} (${botRepliesToday} replies today) — auto-paused`);
    return;
  }

  // Reply rate limiting — skip for priority contacts
  const phone = "+" + remoteJid.split("@")[0];
  const isPriority = (config.priorityJids as string[]).includes(phone);

  if (!isPriority) {
    const lastOutbound = await prisma.chatMessage.findFirst({
      where: {
        role: { in: ["assistant", "human"] },
        conversation: { waSessionId },
      },
      orderBy: { createdAt: "desc" },
    });

    if (lastOutbound) {
      const elapsedSec = (Date.now() - new Date(lastOutbound.createdAt).getTime()) / 1000;
      if (elapsedSec < config.replyMinDelaySec) {
        const jitter = randBetween(0, Math.max(0, config.replyMaxDelaySec - config.replyMinDelaySec));
        const waitSec = Math.ceil(config.replyMinDelaySec - elapsedSec) + jitter;
        if (waitSec > 60) {
          log.warn(`bot job skipped — rate limit wait ${waitSec}s > 60s; next inbound will re-trigger`);
          return;
        }
        log.info(`bot pacing — sleeping ${waitSec}s before LLM call`);
        await sleep(waitSec * 1000);
        // Re-check after the wait — human may have replied or conversation may have been taken over.
        const recheckCount = await prisma.chatMessage.count({
          where: {
            conversationId,
            role: "user",
            ...(conversation.lastBotReplyAt ? { createdAt: { gt: conversation.lastBotReplyAt } } : {}),
          },
        });
        if (recheckCount === 0) {
          log.info("bot job skipped after pacing — no unanswered messages remaining");
          return;
        }
      }
    }
  }

  // Compact older turns into conversation memory if the unsummarized window
  // has grown too long. This runs inline so the immediate reply uses fresh memory.
  await maybeCompactMemory(conversationId, conversation.memory, conversation.memoryMessageCount);

  // Re-read the conversation to pick up any memory update from compaction above.
  const conv = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  const memoryCount = conv?.memoryMessageCount ?? 0;
  const memoryText = conv?.memory ?? null;

  // Recent window: messages after the compacted range.
  const recent = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    skip: memoryCount,
    take: 20,
  });

  if (recent.length === 0) return;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: buildBotSystemPrompt(config.knowledgeBase ?? "") },
  ];

  if (memoryText) {
    messages.push({
      role: "system",
      content: `[Summary of earlier conversation — facts and questions already answered, provided as context]\n${memoryText}`,
    });
  }

  messages.push(
    ...recent.map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    })),
  );

  const client = getChatClient();
  if (!client) return;

  log.info(`bot calling LLM (model ${getChatModel()}, ${recent.length} recent msgs${memoryText ? " + memory" : ""})`);
  const llmStart = Date.now();

  try {
    // Omit max_tokens entirely when set to 0 — useful for reasoning models
    // that burn tokens on internal thinking before producing visible output.
    const response = config.maxTokens > 0
      ? await client.chat.completions.create({
          model: getChatModel(),
          messages,
          max_tokens: config.maxTokens,
          temperature: 0.6,
          stream: false,
        })
      : await client.chat.completions.create({
          model: getChatModel(),
          messages,
          temperature: 0.6,
          stream: false,
        });

    const elapsed = Date.now() - llmStart;
    const choice = response.choices[0];
    const rawContent = choice?.message?.content;
    // Some OpenAI-compatible providers return content as an array of parts.
    let replyText: string | undefined;
    if (typeof rawContent === "string") {
      replyText = rawContent.trim();
    } else if (Array.isArray(rawContent)) {
      replyText = (rawContent as Array<{ type?: string; text?: string }>)
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("")
        .trim();
    }
    log.info(`bot LLM responded in ${elapsed}ms (prompt=${response.usage?.prompt_tokens ?? "?"} completion=${response.usage?.completion_tokens ?? "?"} finish=${choice?.finish_reason})`);

    if (!replyText) {
      log.warn(`bot LLM returned empty reply — finish=${choice?.finish_reason}, keys=${Object.keys(choice?.message ?? {}).join(",")}`);
      const errorMsg = choice?.finish_reason === "length"
        ? `model ran out of tokens mid-response — try raising max reply tokens above ${config.maxTokens} in chatbot config`
        : "model returned an empty reply";
      waHub.emit(userId, {
        type: "chat.bot.error",
        conversation_id: conversationId,
        session_id: waSessionId,
        error: errorMsg,
      });
      return;
    }

    const tokensIn = response.usage?.prompt_tokens ?? null;
    const tokensOut = response.usage?.completion_tokens ?? null;

    const botMessage = await prisma.chatMessage.create({
      data: { conversationId, role: "assistant", body: replyText, tokensIn, tokensOut },
    });

    const now = new Date();
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, lastBotReplyAt: now },
    });

    // Reuse the existing manual send job for typing sim + WA delivery
    await boss.send(CHAT_REPLY_JOB, {
      messageId: botMessage.id,
      conversationId,
      waSessionId,
      userId,
      remoteJid,
      body: replyText,
    });

    waHub.emit(userId, {
      type: "chat.bot.replied",
      conversation_id: conversationId,
      message_id: botMessage.id,
      session_id: waSessionId,
    });

    // If more unanswered messages remain beyond this batch, schedule the next one.
    // singletonKey ":cont" is separate from ":initial" so new inbounds and
    // continuations don't collide.
    if (hasMoreAfterBatch) {
      log.info(`scheduling continuation batch (${unanswered.length - BATCH_SIZE} msgs remaining)`);
      await boss.send(CHAT_BOT_REPLY_JOB, payload, {
        priority: isPriority ? 10 : 0,
        singletonKey: `bot:${conversationId}:cont`,
        startAfter: 2,
      });
    }

  } catch (err) {
    log.error(`bot LLM call failed (attempt ${attempt})`, err);
    if (attempt < 2) {
      const backoffSec = Math.pow(2, attempt + 1) * 30; // 60s, 120s
      await boss.sendAfter(CHAT_BOT_REPLY_JOB, { ...payload, attempt: attempt + 1 }, {}, backoffSec);
    } else {
      waHub.emit(userId, {
        type: "chat.bot.error",
        conversation_id: conversationId,
        session_id: waSessionId,
        error: err instanceof Error ? err.message : "LLM call failed after retries",
      });
    }
  }
}

// ── Worker registration ────────────────────────────────────────────────────

export async function registerChatWorker() {
  await boss.createQueue(CHAT_REPLY_JOB);
  await boss.work<ChatReplyPayload>(CHAT_REPLY_JOB, async (jobs) => {
    for (const job of jobs) await sendChatReply(job.data);
  });

  await boss.createQueue(CHAT_BOT_REPLY_JOB);
  await boss.work<ChatBotReplyPayload>(CHAT_BOT_REPLY_JOB, async (jobs) => {
    for (const job of jobs) {
      // Swallow any unexpected error so pg-boss doesn't auto-retry and
      // cause duplicate replies. handleBotReply has its own retry logic
      // (attempt counter in the payload) for LLM failures specifically.
      try {
        await handleBotReply(job.data);
      } catch (err) {
        log.error(`unhandled error in bot job (conv ${job.data.conversationId})`, err);
      }
    }
  });

  log.success("chat worker registered");
}
