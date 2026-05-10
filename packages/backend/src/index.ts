import "dotenv/config";
import { env } from "./env";
import Fastify from "fastify";
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
  if (req.method !== "OPTIONS" && url !== "/healthz" && url !== "/metrics") {
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
app.get("/healthz", async () => ({ ok: true }));

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
