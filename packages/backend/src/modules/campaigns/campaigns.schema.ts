import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  waSessionId: z.string().uuid(),
  contactListId: z.string().uuid(),
  messageTemplate: z.string().min(1).max(4096),
  mediaAssetId: z.string().uuid().nullable().optional(),
  minDelaySec: z.number().int().min(5).max(3600).default(30),
  maxDelaySec: z.number().int().min(5).max(7200).default(180),
  dailyCap: z.number().int().min(1).max(1000).default(500),
  quietStart: z.number().int().min(0).max(23).nullable().optional(),
  quietEnd: z.number().int().min(0).max(23).nullable().optional(),
  typingSim: z.boolean().default(true),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
