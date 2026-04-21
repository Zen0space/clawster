import { prisma } from "@clawster/db";
import { boss } from "../worker/boss";
import type { CreateCampaignInput } from "./campaigns.schema";

export const TICK_JOB = "campaign-tick";

// ── types ──────────────────────────────────────────────────────────────────

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  waSessionId: string;
  contactListId: string;
  messageTemplate: string;
  minDelaySec: number;
  maxDelaySec: number;
  dailyCap: number;
  quietStart: number | null;
  quietEnd: number | null;
  typingSim: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type CampaignProgress = {
  sent: number;
  failed: number;
  remaining: number;
  total: number;
};

// ── template rendering ──────────────────────────────────────────────────────

export function renderTemplate(
  template: string,
  contact: { name: string | null; phoneE164: string; customFields: unknown }
): string {
  const fields =
    contact.customFields &&
    typeof contact.customFields === "object" &&
    !Array.isArray(contact.customFields)
      ? (contact.customFields as Record<string, unknown>)
      : {};

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key === "name") return contact.name ?? "";
    if (key === "phone") return contact.phoneE164;
    const val = fields[key];
    return val != null ? String(val) : "";
  });
}

// ── progress helper ─────────────────────────────────────────────────────────

export async function getProgress(campaignId: string): Promise<CampaignProgress> {
  const [sent, failed, remaining] = await Promise.all([
    prisma.campaignMessage.count({ where: { campaignId, status: "sent" } }),
    prisma.campaignMessage.count({ where: { campaignId, status: "failed" } }),
    prisma.campaignMessage.count({ where: { campaignId, status: { in: ["queued", "sending"] } } }),
  ]);
  return { sent, failed, remaining, total: sent + failed + remaining };
}

// ── CRUD ───────────────────────────────────────────────────────────────────

export async function createCampaign(
  userId: string,
  data: CreateCampaignInput
): Promise<CampaignRow> {
  return prisma.campaign.create({
    data: {
      userId,
      name: data.name,
      waSessionId: data.waSessionId,
      contactListId: data.contactListId,
      messageTemplate: data.messageTemplate,
      mediaAssetId: data.mediaAssetId ?? null,
      minDelaySec: data.minDelaySec,
      maxDelaySec: data.maxDelaySec,
      dailyCap: data.dailyCap,
      quietStart: data.quietStart ?? null,
      quietEnd: data.quietEnd ?? null,
      typingSim: data.typingSim,
      status: "draft",
    },
  }) as Promise<CampaignRow>;
}

export async function listCampaigns(
  userId: string,
  page: number,
  limit: number
): Promise<{ items: (CampaignRow & { progress: CampaignProgress })[]; total: number }> {
  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }) as Promise<CampaignRow[]>,
    prisma.campaign.count({ where: { userId } }),
  ]);

  const items = await Promise.all(
    campaigns.map(async (c) => ({ ...c, progress: await getProgress(c.id) }))
  );
  return { items, total };
}

export async function getCampaign(
  id: string,
  userId: string
): Promise<(CampaignRow & { progress: CampaignProgress }) | null> {
  const campaign = (await prisma.campaign.findFirst({
    where: { id, userId },
  })) as CampaignRow | null;
  if (!campaign) return null;
  return { ...campaign, progress: await getProgress(id) };
}

export async function deleteCampaign(id: string, userId: string): Promise<boolean> {
  const c = await prisma.campaign.findFirst({ where: { id, userId, status: "draft" } });
  if (!c) return false;
  await prisma.campaign.delete({ where: { id } });
  return true;
}

// ── state transitions ───────────────────────────────────────────────────────

export async function startCampaign(
  id: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const campaign = (await prisma.campaign.findFirst({
    where: { id, userId, status: "draft" },
  })) as CampaignRow | null;
  if (!campaign) return { ok: false, error: "campaign not found or not in draft" };

  const contacts = await prisma.contact.findMany({
    where: { contactListId: campaign.contactListId, isValid: true },
  });
  if (contacts.length === 0) return { ok: false, error: "contact list is empty" };

  await prisma.campaignMessage.createMany({
    data: contacts.map((c) => ({
      campaignId: id,
      contactId: c.id,
      renderedBody: renderTemplate(campaign.messageTemplate, {
        name: c.name,
        phoneE164: c.phoneE164,
        customFields: c.customFields,
      }),
      status: "queued",
    })),
    skipDuplicates: true,
  });

  await prisma.campaign.update({
    where: { id },
    data: { status: "running", startedAt: new Date() },
  });

  await boss.sendAfter(TICK_JOB, { campaignId: id }, null, 2);
  return { ok: true };
}

export async function pauseCampaign(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.campaign.updateMany({
    where: { id, userId, status: "running" },
    data: { status: "paused" },
  });
  return result.count > 0;
}

export async function resumeCampaign(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.campaign.updateMany({
    where: { id, userId, status: "paused" },
    data: { status: "running" },
  });
  if (result.count === 0) return false;
  await boss.sendAfter(TICK_JOB, { campaignId: id }, null, 1);
  return true;
}

export async function cancelCampaign(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.campaign.updateMany({
    where: { id, userId, status: { in: ["running", "paused", "draft"] } },
    data: { status: "failed", completedAt: new Date() },
  });
  return result.count > 0;
}

export async function getCampaignMessages(
  id: string,
  userId: string,
  page: number,
  limit: number
) {
  const campaign = await prisma.campaign.findFirst({ where: { id, userId } });
  if (!campaign) return null;

  const [items, total] = await Promise.all([
    prisma.campaignMessage.findMany({
      where: { campaignId: id },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        contact: { select: { phoneE164: true, name: true } },
      },
    }),
    prisma.campaignMessage.count({ where: { campaignId: id } }),
  ]);
  return { items, total, page, limit };
}
