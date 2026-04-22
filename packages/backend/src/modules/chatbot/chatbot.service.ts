import { prisma } from "@clawster/db";

type ChatbotConfigInput = {
  enabled: boolean;
  systemPrompt: string;
  maxTokens: number;
  dailyReplyCap: number;
  replyMinDelaySec: number;
  replyMaxDelaySec: number;
  priorityJids: string[];
  quietStart: number | null;
  quietEnd: number | null;
};

const CONFIG_DEFAULTS: Omit<ChatbotConfigInput, "enabled"> = {
  systemPrompt: "",
  maxTokens: 1024,
  dailyReplyCap: 200,
  replyMinDelaySec: 15,
  replyMaxDelaySec: 45,
  priorityJids: [],
  quietStart: null,
  quietEnd: null,
};

type ChatbotConfigRow = ChatbotConfigInput & {
  id?: string;
  waSessionId: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export async function getChatbotConfig(waSessionId: string): Promise<ChatbotConfigRow> {
  const config = await prisma.chatbotConfig.findUnique({ where: { waSessionId } });
  return config
    ? { ...config, priorityJids: config.priorityJids as string[] }
    : { waSessionId, enabled: false, ...CONFIG_DEFAULTS };
}

export async function saveChatbotConfig(waSessionId: string, data: ChatbotConfigInput): Promise<ChatbotConfigRow> {
  const result = await prisma.chatbotConfig.upsert({
    where: { waSessionId },
    update: data,
    create: { waSessionId, ...data },
  });
  return { ...result, priorityJids: result.priorityJids as string[] };
}

export async function listConversations(waSessionId: string, page: number, limit: number) {
  const [items, total] = await prisma.$transaction([
    prisma.chatConversation.findMany({
      where: { waSessionId },
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.chatConversation.count({ where: { waSessionId } }),
  ]);
  return { items, total, page, limit };
}

export async function listMessages(conversationId: string, page: number, limit: number) {
  const [items, total] = await prisma.$transaction([
    prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.chatMessage.count({ where: { conversationId } }),
  ]);
  return { items, total, page, limit };
}
