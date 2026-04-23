-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wa_session_id" UUID NOT NULL,
    "remote_jid" TEXT NOT NULL,
    "display_name" TEXT,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "wa_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_conversations_wa_session_id_last_message_at_idx" ON "chat_conversations"("wa_session_id", "last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversations_wa_session_id_remote_jid_key" ON "chat_conversations"("wa_session_id", "remote_jid");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_wa_session_id_fkey" FOREIGN KEY ("wa_session_id") REFERENCES "wa_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
