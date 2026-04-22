import type { FastifyInstance } from "fastify";
import { prisma } from "@clawster/db";
import { listConversations, listMessages } from "./chatbot.service";

export async function chatbotRoutes(app: FastifyInstance) {
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
}
