import { prisma } from "@clawster/db";

type ChatbotConfigInput = {
  enabled: boolean;
  knowledgeBase: string;
  maxTokens: number;
  dailyReplyCap: number;
  replyMinDelaySec: number;
  replyMaxDelaySec: number;
  priorityJids: string[];
  quietStart: number | null;
  quietEnd: number | null;
};

const CONFIG_DEFAULTS: Omit<ChatbotConfigInput, "enabled"> = {
  knowledgeBase: "",
  maxTokens: 4096,
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
  const existing = await prisma.chatbotConfig.findUnique({ where: { waSessionId } });
  const knowledgeChanged = !existing || existing.knowledgeBase !== data.knowledgeBase;
  const now = new Date();
  const result = await prisma.chatbotConfig.upsert({
    where: { waSessionId },
    update: {
      ...data,
      ...(knowledgeChanged ? { knowledgeBaseUpdatedAt: now } : {}),
    },
    create: {
      waSessionId,
      ...data,
      knowledgeBaseUpdatedAt: data.knowledgeBase ? now : null,
    },
  });
  return { ...result, priorityJids: result.priorityJids as string[] };
}

export async function getChatStats(userId: string) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const where = (since: Date) => ({
    role: "assistant" as const,
    createdAt: { gte: since },
    conversation: { waSession: { userId } },
  });

  const [today, month] = await Promise.all([
    prisma.chatMessage.aggregate({ where: where(todayStart), _sum: { tokensIn: true, tokensOut: true }, _count: true }),
    prisma.chatMessage.aggregate({ where: where(monthStart), _sum: { tokensIn: true, tokensOut: true }, _count: true }),
  ]);

  return {
    todayReplies: today._count,
    todayTokens: (today._sum.tokensIn ?? 0) + (today._sum.tokensOut ?? 0),
    monthReplies: month._count,
    monthTokens: (month._sum.tokensIn ?? 0) + (month._sum.tokensOut ?? 0),
  };
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
  // Fetch latest 'limit' messages (newest-first), then reverse so the UI
  // always shows the most recent messages with chronological (oldest→newest) order.
  const [items, total] = await prisma.$transaction([
    prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.chatMessage.count({ where: { conversationId } }),
  ]);
  return { items: [...items].reverse(), total, page, limit };
}
