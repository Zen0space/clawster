-- Conversation-level memory for long-term context.
-- Older messages get summarized into `memory` so the LLM can still
-- answer "what did i ask earlier?" without dragging every turn into
-- the prompt and mimicking past style.
ALTER TABLE "chat_conversations"
  ADD COLUMN "memory" TEXT,
  ADD COLUMN "memory_message_count" INTEGER NOT NULL DEFAULT 0;
