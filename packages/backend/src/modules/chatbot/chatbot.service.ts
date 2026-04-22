import { prisma } from "@clawster/db";

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
