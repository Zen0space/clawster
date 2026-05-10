import { z } from "zod";

const normalizedEmail = z
  .string()
  .email()
  .transform((s) => s.trim().toLowerCase());

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const registerSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(8),
  fullName: z.string().optional(),
  licenseKey: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginSchema>;
export type RefreshBody = z.infer<typeof refreshSchema>;
export type RegisterBody = z.infer<typeof registerSchema>;
