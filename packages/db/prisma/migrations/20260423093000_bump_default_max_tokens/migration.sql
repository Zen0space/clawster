-- Bump default max_tokens to 4096 — ILMU/reasoning models need more room.
-- Also migrate existing rows stuck at the old 1024 default so existing bots
-- stop returning empty replies without requiring the user to re-save config.
ALTER TABLE "chatbot_configs" ALTER COLUMN "max_tokens" SET DEFAULT 4096;
UPDATE "chatbot_configs" SET "max_tokens" = 4096 WHERE "max_tokens" = 1024;
