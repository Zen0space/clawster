import { z } from "zod";

export const createSessionSchema = z.object({
  display_name: z.string().min(1).optional(),
});
