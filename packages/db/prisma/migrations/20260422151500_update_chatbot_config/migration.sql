-- Remove model column (model is now controlled by CHAT_MODEL env var)
ALTER TABLE "chatbot_configs" DROP COLUMN "model";

-- Add reply pacing columns
ALTER TABLE "chatbot_configs" ADD COLUMN "reply_min_delay_sec" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "chatbot_configs" ADD COLUMN "reply_max_delay_sec" INTEGER NOT NULL DEFAULT 45;

-- Add priority JIDs (JSON array of phone numbers)
ALTER TABLE "chatbot_configs" ADD COLUMN "priority_jids" JSONB NOT NULL DEFAULT '[]';
