import type { FastifyInstance } from "fastify";
import { prisma } from "@clawster/db";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schema";
import {
  hashPassword,
  verifyPassword,
  issueAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "./auth.service";

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    const body = registerSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "validation_error" });

    const existing = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (existing) return reply.status(409).send({ error: "email_taken" });

    const passwordHash = await hashPassword(body.data.password);
    const user = await prisma.user.create({
      data: { email: body.data.email, passwordHash, fullName: body.data.fullName ?? null },
    });

    const accessToken = issueAccessToken(user.id);
    const refreshToken = await issueRefreshToken(user.id);

    await prisma.auditLog.create({
      data: { userId: user.id, action: "auth.register", subject: user.email },
    });

    request.log.info({ userId: user.id }, "User registered");

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  });

  app.post("/login", async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "validation_error" });

    const user = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (!user || !user.isActive) {
      return reply.status(401).send({ error: "invalid_credentials" });
    }

    const valid = await verifyPassword(user.passwordHash, body.data.password);
    if (!valid) return reply.status(401).send({ error: "invalid_credentials" });

    const accessToken = issueAccessToken(user.id);
    const refreshToken = await issueRefreshToken(user.id);

    await prisma.auditLog.create({
      data: { userId: user.id, action: "auth.login", subject: user.email },
    });

    request.log.info({ userId: user.id }, "User logged in");

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  });

  app.post("/refresh", async (request, reply) => {
    const body = refreshSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "validation_error" });

    try {
      const tokens = await rotateRefreshToken(body.data.refresh_token);
      return { access_token: tokens.accessToken, refresh_token: tokens.refreshToken };
    } catch {
      return reply.status(401).send({ error: "invalid_refresh_token" });
    }
  });

  app.post("/logout", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = refreshSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "validation_error" });

    await revokeRefreshToken(body.data.refresh_token);

    await prisma.auditLog.create({
      data: { userId: request.user.sub, action: "auth.logout" },
    });

    return { ok: true };
  });

  app.get("/me", { onRequest: [app.authenticate] }, async (request) => {
    return prisma.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    });
  });
}
