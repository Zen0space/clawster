import { prisma } from "@clawster/db";
import { boss } from "../worker/boss";
import { waHub } from "../wa/wa.hub";
import { waRegistryGet } from "../wa/wa.registry";
import { log } from "../../logger";

export const CHAT_REPLY_JOB = "chatbot-reply";

type ChatReplyPayload = {
  messageId: string;
  conversationId: string;
  waSessionId: string;
  userId: string;
  remoteJid: string;
  body: string;
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function randBetween(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

export async function registerChatWorker() {
  await boss.createQueue(CHAT_REPLY_JOB);
  await boss.work<ChatReplyPayload>(CHAT_REPLY_JOB, async (jobs) => {
    for (const job of jobs) {
      await sendChatReply(job.data);
    }
  });
  log.success("chat worker registered");
}

async function sendChatReply(payload: ChatReplyPayload) {
  const { messageId, waSessionId, userId, remoteJid, body } = payload;

  const socket = waRegistryGet(waSessionId);
  if (!socket) {
    log.warn("chat reply skipped — session not connected", { waSessionId });
    return;
  }

  try {
    await socket.sendPresenceUpdate("composing", remoteJid);
    await sleep(randBetween(2000, 8000));
    await socket.sendPresenceUpdate("paused", remoteJid);

    const result = await socket.sendMessage(remoteJid, { text: body });

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { waMessageId: result?.key?.id ?? null },
    });

    waHub.emit(userId, {
      type: "chat.message.sent",
      message_id: messageId,
      conversation_id: payload.conversationId,
    });
  } catch (err) {
    log.error("chat reply failed", err);
  }
}
