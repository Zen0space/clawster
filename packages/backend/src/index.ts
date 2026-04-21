import "dotenv/config";
import "./types/fastify.d.ts";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocketPlugin from "@fastify/websocket";
import { verifyAccessToken } from "./modules/auth/auth.service";
import { authRoutes } from "./modules/auth/auth.routes";
import { waRoutes } from "./modules/wa/wa.routes";
import { contactsRoutes } from "./modules/contacts/contacts.routes";
import { mediaRoutes } from "./modules/media/media.routes";
import { campaignRoutes } from "./modules/campaigns/campaigns.routes";
import { startWorker } from "./modules/worker/sender";
import { reconnectAll } from "./modules/wa/wa.service";

const app = Fastify({ logger: true });

app.decorateRequest("user", null as unknown as { sub: string });
app.decorate("authenticate", async function (request, reply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "unauthorized" });
  }
  try {
    request.user = verifyAccessToken(header.slice(7));
  } catch (err) {
    request.log.warn({ err }, "jwt verify failed");
    return reply.status(401).send({ error: "unauthorized" });
  }
});

app.register(cors, { origin: true, allowedHeaders: ["Authorization", "Content-Type"] });
app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
app.register(websocketPlugin);
app.register(authRoutes, { prefix: "/api/v1/auth" });
app.register(waRoutes, { prefix: "/api/v1/wa" });
app.register(contactsRoutes, { prefix: "/api/v1" });
app.register(mediaRoutes, { prefix: "/api/v1" });
app.register(campaignRoutes, { prefix: "/api/v1" });

app.get("/healthz", async (request) => {
  request.log.info("Desktop connected");
  return { ok: true };
});

app.listen({ port: Number(process.env.PORT ?? 8080), host: "127.0.0.1" }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  reconnectAll().catch((e) => app.log.error(e, "reconnectAll failed"));
  startWorker().catch((e) => app.log.error(e, "Worker failed to start"));
});
