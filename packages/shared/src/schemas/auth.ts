import { z } from "zod";

// Email is canonicalized at the schema layer so register and login agree on
// what "the same email" means. Postgres findUnique is case-sensitive — without
// this, `Foo@x.com` registered + `foo@x.com` login = 401 invalid_credentials.
// trim + lowercase BEFORE the email format check so that input like
// "  User@Example.com  " (common from clipboard paste) is normalized rather
// than rejected as malformed.
const normalizedEmail = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().email());

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
