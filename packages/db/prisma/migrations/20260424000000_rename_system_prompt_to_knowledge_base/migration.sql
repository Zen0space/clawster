-- Rename system_prompt to knowledge_base. The field's role has shifted from
-- operator-supplied instructions (which could override built-in rules) to
-- operator-supplied business/product knowledge that the bot answers from.
ALTER TABLE "chatbot_configs"
  RENAME COLUMN "system_prompt" TO "knowledge_base";

ALTER TABLE "chatbot_configs"
  RENAME COLUMN "system_prompt_updated_at" TO "knowledge_base_updated_at";
