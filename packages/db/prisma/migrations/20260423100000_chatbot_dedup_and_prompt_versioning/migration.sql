-- 1. Inbound dedup: Baileys can redeliver the same message.
-- Partial unique index so existing NULL rows and future manual/bot rows
-- (which have no wa_message_id at insert time) are unaffected.
CREATE UNIQUE INDEX "chat_messages_wa_message_id_key"
  ON "chat_messages" ("wa_message_id")
  WHERE "wa_message_id" IS NOT NULL;

-- 2. Conversation-level timestamp for reply freshness check.
ALTER TABLE "chat_conversations"
  ADD COLUMN "last_bot_reply_at" TIMESTAMP(3);

-- 3. Track when the system prompt was last modified, so the worker
-- can filter stale assistant history out of the LLM context.
ALTER TABLE "chatbot_configs"
  ADD COLUMN "system_prompt_updated_at" TIMESTAMP(3);

-- Backfill existing non-empty prompts so we don't accidentally drop
-- history from pre-existing configs on first run.
UPDATE "chatbot_configs"
  SET "system_prompt_updated_at" = "updated_at"
  WHERE "system_prompt" <> '';
