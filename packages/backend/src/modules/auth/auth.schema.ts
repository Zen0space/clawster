import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().optional(),
  licenseKey: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginSchema>;
export type RefreshBody = z.infer<typeof refreshSchema>;
export type RegisterBody = z.infer<typeof registerSchema>;
