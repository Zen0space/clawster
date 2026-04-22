-- Add human takeover flag to conversations
ALTER TABLE "chat_conversations" ADD COLUMN "human_takeover" BOOLEAN NOT NULL DEFAULT false;

-- Add token tracking to messages (only populated for bot-generated replies)
ALTER TABLE "chat_messages" ADD COLUMN "tokens_in" INTEGER;
ALTER TABLE "chat_messages" ADD COLUMN "tokens_out" INTEGER;
