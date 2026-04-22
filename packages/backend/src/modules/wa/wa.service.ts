import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { prisma } from "@clawster/db";
import { waRegistrySet, waRegistryGet, waRegistryRemove } from "./wa.registry";
import { waHub } from "./wa.hub";
import { useDBAuthState } from "./wa.auth";
import { silentLogger } from "../../logger";

export async function spawnSession(sessionId: string, userId: string): Promise<void> {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useDBAuthState(sessionId);

  const socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Clawster", "Desktop", "1.0.0"],
    logger: silentLogger,
  });

  waRegistrySet(sessionId, socket);

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
    if (type !== "notify") return;
    for (const msg of msgs) {
      if (msg.key.fromMe || !msg.key.remoteJid || !msg.message) continue;
      const remoteJid = msg.key.remoteJid;
      if (remoteJid.endsWith("@g.us") || remoteJid.endsWith("@broadcast")) continue;

      const body =
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        "[media]";

      try {
        const conversation = await prisma.chatConversation.upsert({
          where: { waSessionId_remoteJid: { waSessionId: sessionId, remoteJid } },
          update: {
            lastMessageAt: new Date(),
            ...(msg.pushName ? { displayName: msg.pushName } : {}),
          },
          create: { waSessionId: sessionId, remoteJid, displayName: msg.pushName ?? null },
        });

        const chatMessage = await prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            role: "user",
            body,
            waMessageId: msg.key.id ?? null,
          },
        });

        waHub.emit(userId, {
          type: "chat.message.received",
          conversation_id: conversation.id,
          message_id: chatMessage.id,
          session_id: sessionId,
          remote_jid: remoteJid,
        });
      } catch {
        // don't crash the WA connection on inbox errors
      }
    }
  });

  socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      waHub.emit(userId, { type: "wa.qr", session_id: sessionId, qr });
    }

    if (connection === "open") {
      const phoneNumber = socket.user?.id?.split(":")[0] ?? null;
      const jid = socket.user?.id ?? null;

      await prisma.waSession.update({
        where: { id: sessionId },
        data: { status: "connected", phoneNumber, jid, lastSeenAt: new Date() },
      });

      waHub.emit(userId, {
        type: "wa.status",
        session_id: sessionId,
        status: "connected",
        phone_number: phoneNumber,
      });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      waRegistryRemove(sessionId);

      if (loggedOut) {
        await prisma.waSession.update({
          where: { id: sessionId },
          data: { status: "disconnected", sessionBlob: null },
        });
        waHub.emit(userId, { type: "wa.status", session_id: sessionId, status: "disconnected" });
      } else {
        // transient disconnect — reconnect
        await prisma.waSession.update({
          where: { id: sessionId },
          data: { status: "disconnected" },
        });
        setTimeout(() => spawnSession(sessionId, userId), 3000);
      }
    }
  });
}

export async function reconnectAll(): Promise<void> {
  const sessions = await prisma.waSession.findMany({
    where: { status: "connected" },
    select: { id: true, userId: true },
  });

  await Promise.allSettled(
    sessions.map((s) => spawnSession(s.id, s.userId))
  );
}

export async function removeSession(sessionId: string): Promise<void> {
  const socket = waRegistryGet(sessionId);
  if (socket) {
    await socket.logout().catch(() => {});
    waRegistryRemove(sessionId);
  }
  await prisma.waSession.update({
    where: { id: sessionId },
    data: { status: "disconnected", sessionBlob: null },
  });
}
