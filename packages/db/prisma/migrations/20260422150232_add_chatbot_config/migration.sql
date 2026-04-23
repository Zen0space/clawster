-- CreateTable
CREATE TABLE "chatbot_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wa_session_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "system_prompt" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'nemo-super',
    "max_tokens" INTEGER NOT NULL DEFAULT 1024,
    "daily_reply_cap" INTEGER NOT NULL DEFAULT 200,
    "quiet_start" INTEGER,
    "quiet_end" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_configs_wa_session_id_key" ON "chatbot_configs"("wa_session_id");

-- AddForeignKey
ALTER TABLE "chatbot_configs" ADD CONSTRAINT "chatbot_configs_wa_session_id_fkey" FOREIGN KEY ("wa_session_id") REFERENCES "wa_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
