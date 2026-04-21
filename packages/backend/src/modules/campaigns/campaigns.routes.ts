import type { FastifyInstance } from "fastify";
import { prisma } from "@clawster/db";
import { createCampaignSchema } from "./campaigns.schema";
import {
  createCampaign,
  listCampaigns,
  getCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignMessages,
} from "./campaigns.service";

export async function campaignRoutes(app: FastifyInstance) {
  // POST /campaigns — create draft
  app.post("/campaigns", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = createCampaignSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "validation_error", issues: body.error.issues });
    const campaign = await createCampaign(request.user.sub, body.data);
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "campaign.create", subject: campaign.id } });
    return reply.status(201).send(campaign);
  });

  // GET /campaigns — list
  app.get("/campaigns", { onRequest: [app.authenticate] }, async (request) => {
    const q = request.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));
    return listCampaigns(request.user.sub, page, limit);
  });

  // GET /campaigns/:id — detail with progress
  app.get("/campaigns/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const campaign = await getCampaign(id, request.user.sub);
    if (!campaign) return reply.status(404).send({ error: "not_found" });
    return campaign;
  });

  // DELETE /campaigns/:id — delete draft only
  app.delete("/campaigns/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await deleteCampaign(id, request.user.sub);
    if (!ok) return reply.status(404).send({ error: "not_found or not a draft" });
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "campaign.delete", subject: id } });
    return { ok: true };
  });

  // POST /campaigns/:id/start
  app.post("/campaigns/:id/start", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await startCampaign(id, request.user.sub);
    if (!result.ok) return reply.status(422).send({ error: result.error });
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "campaign.start", subject: id } });
    return { ok: true };
  });

  // POST /campaigns/:id/pause
  app.post("/campaigns/:id/pause", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await pauseCampaign(id, request.user.sub);
    if (!ok) return reply.status(422).send({ error: "campaign is not running" });
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "campaign.pause", subject: id } });
    return { ok: true };
  });

  // POST /campaigns/:id/resume
  app.post("/campaigns/:id/resume", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await resumeCampaign(id, request.user.sub);
    if (!ok) return reply.status(422).send({ error: "campaign is not paused" });
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "campaign.resume", subject: id } });
    return { ok: true };
  });

  // POST /campaigns/:id/cancel
  app.post("/campaigns/:id/cancel", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await cancelCampaign(id, request.user.sub);
    if (!ok) return reply.status(404).send({ error: "not_found" });
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "campaign.cancel", subject: id } });
    return { ok: true };
  });

  // GET /stats — dashboard summary counts
  app.get("/stats", { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const [completedCampaigns, failedCampaigns, runningCampaigns, connectedDevices] = await Promise.all([
      prisma.campaign.count({ where: { userId, status: "completed" } }),
      prisma.campaign.count({ where: { userId, status: "failed" } }),
      prisma.campaign.count({ where: { userId, status: "running" } }),
      prisma.waSession.count({ where: { userId, status: "connected" } }),
    ]);
    return { completedCampaigns, failedCampaigns, runningCampaigns, connectedDevices };
  });

  // GET /campaigns/:id/messages — paginated per-recipient status
  app.get("/campaigns/:id/messages", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    const result = await getCampaignMessages(id, request.user.sub, page, limit);
    if (!result) return reply.status(404).send({ error: "not_found" });
    return result;
  });
}
