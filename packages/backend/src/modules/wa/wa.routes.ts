import type { FastifyInstance } from "fastify";
import { prisma } from "@clawster/db";

import { verifyAccessToken } from "../auth/auth.service";
import { waHub } from "./wa.hub";
import { spawnSession, removeSession } from "./wa.service";
import { createSessionSchema } from "./wa.schema";
import { log } from "../../logger";

export async function waRoutes(app: FastifyInstance) {
  // WebSocket — auth via ?token query param
  app.get("/ws", { websocket: true }, (socket, request) => {
    const token = (request.query as Record<string, string>).token;
    if (!token) { socket.close(1008, "missing token"); return; }

    let userId: string;
    try {
      userId = verifyAccessToken(token).sub;
    } catch {
      socket.close(1008, "invalid token");
      return;
    }

    waHub.subscribe(userId, socket);
  });

  // REST — all require JWT
  app.post("/sessions", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = createSessionSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "validation_error" });

    const session = await prisma.waSession.create({
      data: {
        userId: request.user.sub,
        displayName: body.data.display_name ?? null,
        status: "pending",
      },
    });

    // spawn non-blocking — QR arrives via WebSocket
    spawnSession(session.id, request.user.sub).catch((err) =>
      log.error(`failed to spawn wa session ${session.id}`, err)
    );

    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "session.create", subject: session.id } });
    return { id: session.id, status: session.status };
  });

  app.get("/sessions", { onRequest: [app.authenticate] }, async (request) => {
    return prisma.waSession.findMany({
      where: { userId: request.user.sub, status: { not: "disconnected" } },
      select: {
        id: true,
        displayName: true,
        phoneNumber: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get("/sessions/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await prisma.waSession.findFirst({
      where: { id, userId: request.user.sub },
      select: {
        id: true,
        displayName: true,
        phoneNumber: true,
        jid: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    if (!session) return reply.status(404).send({ error: "not_found" });
    return session;
  });

  app.delete("/sessions/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await prisma.waSession.findFirst({
      where: { id, userId: request.user.sub },
    });
    if (!session) return reply.status(404).send({ error: "not_found" });

    await removeSession(id);
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "session.delete", subject: id } });

    return { ok: true };
  });
}
