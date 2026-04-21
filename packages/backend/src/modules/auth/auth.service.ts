import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@clawster/db";

const ACCESS_EXPIRY_SEC = 15 * 60;
const REFRESH_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 2,
  });
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function issueAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_EXPIRY_SEC,
  });
}

export function verifyAccessToken(token: string): { sub: string } {
  return jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = randomUUID();
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

  await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });

  return raw;
}

export async function rotateRefreshToken(rawToken: string) {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw Object.assign(new Error("invalid_refresh_token"), { statusCode: 401 });
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const accessToken = issueAccessToken(stored.userId);
  const refreshToken = await issueRefreshToken(stored.userId);

  return { accessToken, refreshToken, userId: stored.userId };
}

export async function revokeRefreshToken(rawToken: string) {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
