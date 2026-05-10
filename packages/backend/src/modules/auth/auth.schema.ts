// Schemas live in @clawster/shared so clients can validate before posting and
// backend remains the source of truth for what's actually accepted.
export {
  loginSchema,
  refreshSchema,
  registerSchema,
  type LoginBody,
  type RefreshBody,
  type RegisterBody,
} from "@clawster/shared/schemas/auth";
