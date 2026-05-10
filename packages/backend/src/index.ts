import "dotenv/config";
import { env } from "./env";
import Fastify from "fastify";
import { prisma } from "@clawster/db";
import { boss } from "./modules/worker/boss";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocketPlugin from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { verifyAccessToken } from "./modules/auth/auth.service";
import { authRoutes } from "./modules/auth/auth.routes";
import { waRoutes } from "./modules/wa/wa.routes";
import { contactsRoutes } from "./modules/contacts/contacts.routes";
import { mediaRoutes } from "./modules/media/media.routes";
import { campaignRoutes } from "./modules/campaigns/campaigns.routes";
import { chatbotRoutes } from "./modules/chatbot/chatbot.routes";
import { startWorker } from "./modules/worker/sender";
import { reconnectAll } from "./modules/wa/wa.service";
import { registry, httpRequestsTotal } from "./metrics";
import { log } from "./logger";

const app = Fastify({
  logger: false,
  disableRequestLogging: true,
  bodyLimit: 1024 * 1024, // 1 MB JSON body cap (multipart has its own limit)
});

declare module "fastify" {
  interface FastifyRequest {
    _startedAt?: number;
  }
}

app.addHook("onRequest", (req, _reply, done) => {
  req._startedAt = performance.now();
  done();
});

app.addHook("onResponse", (req, reply, done) => {
  const url = req.routeOptions?.url ?? req.url;
  // Skip noise from preflight + health + metrics scrapes
  if (req.method !== "OPTIONS" && url !== "/healthz" && url !== "/readyz" && url !== "/metrics") {
    const durMs = req._startedAt ? performance.now() - req._startedAt : 0;
    log.api(req.method, req.url, reply.statusCode, durMs);
  }
  done();
});

// ── Rate limiting ────────────────────────────────────────────────────────────
app.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: "1 minute",
  keyGenerator: (req) => req.ip,
  errorResponseBuilder: () => ({ error: "too_many_requests" }),
});

// ── Auth ─────────────────────────────────────────────────────────────────────
app.decorateRequest("user", null as unknown as { sub: string });
app.decorate("authenticate", async function (request, reply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "unauthorized" });
  }
  try {
    request.user = verifyAccessToken(header.slice(7));
  } catch (err) {
    log.warn("jwt verify failed", err);
    return reply.status(401).send({ error: "unauthorized" });
  }
});

// ── Metrics hook ─────────────────────────────────────────────────────────────
app.addHook("onResponse", (request, reply, done) => {
  httpRequestsTotal.inc({
    method: request.method,
    route: request.routeOptions?.url ?? request.url,
    status: String(reply.statusCode),
  });
  done();
});

// ── Plugins ───────────────────────────────────────────────────────────────────
// Dev (no WEBAPP_ORIGIN, NODE_ENV != production): allow everything for `pnpm dev:webapp` + Tauri.
// Prod: env.ts requires WEBAPP_ORIGIN, so this branch is the only one taken.
if (env.WEBAPP_ORIGIN) {
  const allowed: Array<string | RegExp> = [env.WEBAPP_ORIGIN];
  if (env.WEBAPP_PREVIEW_PATTERN) allowed.push(new RegExp(env.WEBAPP_PREVIEW_PATTERN));
  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowed.some((a) => (a instanceof RegExp ? a.test(origin) : a === origin))) {
        cb(null, true);
      } else {
        cb(new Error("origin not allowed"), false);
      }
    },
    allowedHeaders: ["Authorization", "Content-Type"],
  });
} else {
  app.register(cors, { origin: true, allowedHeaders: ["Authorization", "Content-Type"] });
}
app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
app.register(websocketPlugin);

// ── Routes ────────────────────────────────────────────────────────────────────
app.register(authRoutes, { prefix: "/api/v1/auth" });
app.register(waRoutes, { prefix: "/api/v1/wa" });
app.register(contactsRoutes, { prefix: "/api/v1" });
app.register(mediaRoutes, { prefix: "/api/v1" });
app.register(campaignRoutes, { prefix: "/api/v1" });
app.register(chatbotRoutes, { prefix: "/api/v1" });

// ── Healthcheck ───────────────────────────────────────────────────────────────
// Liveness: process is up and Fastify can serve. No DB roundtrip — used by the
// container runtime / load balancer; we don't want a transient DB hiccup to
// kill an otherwise-healthy pod.
app.get("/healthz", async () => ({ ok: true }));

// Readiness: dependencies the app needs before it can serve real traffic.
// Compose's wait_for_healthy and any "ready to take requests" probe should hit
// this one. 503 if Postgres is unreachable.
app.get("/readyz", async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    log.error("readyz: database unreachable", err);
    return reply.status(503).send({ ok: false, error: "database_unreachable" });
  }
});

// ── Metrics (Prometheus) ─────────────────────────────────────────────────────
app.get("/metrics", async (_request, reply) => {
  reply.header("Content-Type", registry.contentType);
  return reply.send(await registry.metrics());
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen({ port: env.PORT, host: env.HOST }, (err, address) => {
  if (err) { log.error("server failed to start", err); process.exit(1); }
  log.success(`server listening on ${address}`);
  reconnectAll().catch((e) => log.error("reconnectAll failed", e));
  startWorker().catch((e) => log.error("worker failed to start", e));
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// SIGTERM (compose stop, k8s pod termination) and SIGINT (ctrl-c). Close
// Fastify first so in-flight requests drain, then pg-boss workers, then
// Prisma. 10s overall budget — past that, force-exit so a stuck connection
// doesn't block container teardown.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`received ${signal}, shutting down`);
  const timeout = setTimeout(() => {
    log.error("shutdown timed out after 10s, forcing exit");
    process.exit(1);
  }, 10_000);
  try {
    await app.close();
    await boss.stop({ graceful: true, timeout: 5_000 }).catch((e) => log.error("boss.stop failed", e));
    await prisma.$disconnect().catch((e) => log.error("prisma.$disconnect failed", e));
    clearTimeout(timeout);
    log.success("shutdown complete");
    process.exit(0);
  } catch (e) {
    log.error("shutdown error", e);
    clearTimeout(timeout);
    process.exit(1);
  }
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
