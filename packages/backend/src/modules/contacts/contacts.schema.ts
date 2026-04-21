import { z } from "zod";

export const importSchema = z.object({
  name: z.string().min(1).max(100),
  defaultRegion: z.string().length(2).default("MY"),
});
