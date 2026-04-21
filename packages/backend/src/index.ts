import "dotenv/config";
import "./types/fastify.d.ts";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocketPlugin from "@fastify/websocket";
import { verifyAccessToken } from "./modules/auth/auth.service";
import { authRoutes } from "./modules/auth/auth.routes";
import { waRoutes } from "./modules/wa/wa.routes";
import { reconnectAll } from "./modules/wa/wa.service";

const app = Fastify({ logger: true });

app.decorateRequest("user", null);
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
app.register(websocketPlugin);
app.register(authRoutes, { prefix: "/api/v1/auth" });
app.register(waRoutes, { prefix: "/api/v1/wa" });

app.get("/healthz", async (request) => {
  request.log.info("Desktop connected");
  return { ok: true };
});

app.listen({ port: Number(process.env.PORT ?? 8080), host: "127.0.0.1" }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  reconnectAll().catch((e) => app.log.error(e, "reconnectAll failed"));
});
