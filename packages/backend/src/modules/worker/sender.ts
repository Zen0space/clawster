import { prisma } from "@clawster/db";
import { boss } from "./boss";
import { TICK_JOB } from "../campaigns/campaigns.service";
import { waHub } from "../wa/wa.hub";
import { waRegistryGet } from "../wa/wa.registry";
import { storage } from "../storage/localfs.storage";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function randBetween(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function addJitter(sec: number, factor = 0.15) { return Math.max(1, Math.floor(sec + sec * factor * (Math.random() * 2 - 1))); }

function isQuietHour(quietStart: number | null, quietEnd: number | null): boolean {
  if (quietStart == null || quietEnd == null) return false;
  const h = new Date().getHours();
  return quietStart < quietEnd ? (h >= quietStart && h < quietEnd) : (h >= quietStart || h < quietEnd);
}

function quietResumeDate(quietEnd: number): Date {
  const d = new Date(); d.setHours(quietEnd, 1, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d;
}

async function broadcastProgress(campaignId: string, userId: string) {
  const [sent, failed, remaining] = await Promise.all([
    prisma.campaignMessage.count({ where: { campaignId, status: "sent" } }),
    prisma.campaignMessage.count({ where: { campaignId, status: "failed" } }),
    prisma.campaignMessage.count({ where: { campaignId, status: { in: ["queued", "sending"] } } }),
  ]);
  waHub.emit(userId, { type: "campaign.progress", campaign_id: campaignId, sent, failed, remaining });
}

export async function processCampaignTick(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== "running") return;

  // Quiet hours — reschedule
  if (isQuietHour(campaign.quietStart, campaign.quietEnd)) {
    await boss.sendAfter(TICK_JOB, { campaignId }, null, quietResumeDate(campaign.quietEnd!));
    return;
  }

  // Daily cap check
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sentToday = await prisma.campaignMessage.count({
    where: { campaignId, status: "sent", sentAt: { gte: today } },
  });
  if (sentToday >= campaign.dailyCap) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 5, 0, 0);
    await boss.sendAfter(TICK_JOB, { campaignId }, null, tomorrow);
    return;
  }

  // Find next queued message
  const msg = await prisma.campaignMessage.findFirst({
    where: { campaignId, status: "queued" },
    orderBy: { scheduledAt: "asc" },
    include: { contact: { select: { phoneE164: true } } },
  });

  if (!msg) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "completed", completedAt: new Date() } });
    const [sent, failed] = await Promise.all([
      prisma.campaignMessage.count({ where: { campaignId, status: "sent" } }),
      prisma.campaignMessage.count({ where: { campaignId, status: "failed" } }),
    ]);
    waHub.emit(campaign.userId, { type: "campaign.done", campaign_id: campaignId, sent, failed });
    return;
  }

  await prisma.campaignMessage.update({ where: { id: msg.id }, data: { status: "sending" } });

  const socket = waRegistryGet(campaign.waSessionId);
  if (!socket) {
    await prisma.campaignMessage.update({ where: { id: msg.id }, data: { status: "queued" } });
    await boss.sendAfter(TICK_JOB, { campaignId }, null, 60);
    return;
  }

  const jid = msg.contact.phoneE164.replace("+", "") + "@s.whatsapp.net";

  // Load media asset if this campaign has an image attached
  let mediaBuffer: Buffer | null = null;
  if (campaign.mediaAssetId) {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: campaign.mediaAssetId } });
    if (asset) {
      try { mediaBuffer = await storage.get(asset.storagePath) as Buffer; } catch { /* skip if file missing */ }
    }
  }

  try {
    if (campaign.typingSim) {
      await socket.sendPresenceUpdate("composing", jid);
      await sleep(randBetween(2000, 6000));
    }
    const content = mediaBuffer
      ? { image: mediaBuffer, caption: msg.renderedBody }
      : { text: msg.renderedBody };
    const result = await socket.sendMessage(jid, content);
    await prisma.campaignMessage.update({
      where: { id: msg.id },
      data: { status: "sent", waMessageId: result?.key?.id ?? null, sentAt: new Date() },
    });
  } catch (err) {
    await prisma.campaignMessage.update({
      where: { id: msg.id },
      data: { status: "failed", attempts: { increment: 1 }, error: err instanceof Error ? err.message : String(err) },
    });
  }

  await broadcastProgress(campaignId, campaign.userId);

  const delaySec = addJitter(randBetween(campaign.minDelaySec, campaign.maxDelaySec));
  await boss.sendAfter(TICK_JOB, { campaignId }, null, delaySec);
}

export async function startWorker() {
  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();
  await boss.createQueue(TICK_JOB);
  await boss.work<{ campaignId: string }>(TICK_JOB, async (jobs) => {
    for (const job of jobs) {
      await processCampaignTick(job.data.campaignId);
    }
  });
}
