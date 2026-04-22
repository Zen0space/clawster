import OpenAI from "openai";

let client: OpenAI | null = null;

export function getChatClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.CHAT_API_KEY;
  const baseURL = process.env.CHAT_BASE_URL;
  if (!apiKey || !baseURL) return null;
  client = new OpenAI({ apiKey, baseURL });
  return client;
}

export function getChatModel(): string {
  return process.env.CHAT_MODEL ?? "nemo-super";
}

export function isChatConfigured(): boolean {
  return Boolean(process.env.CHAT_API_KEY && process.env.CHAT_BASE_URL);
}
