import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import type {
  AuthenticationCreds,
  SignalDataTypeMap,
  SignalKeyStoreWithTransaction,
} from "@whiskeysockets/baileys";
import { prisma } from "@clawster/db";
import { encrypt, decrypt } from "./wa.crypto";

export async function useDBAuthState(sessionId: string) {
  const row = await prisma.waSession.findUnique({ where: { id: sessionId } });

  let creds: AuthenticationCreds;
  let keys: Record<string, Record<string, unknown>> = {};

  if (row?.sessionBlob) {
    try {
      const parsed = JSON.parse(
        decrypt(Buffer.from(row.sessionBlob as Uint8Array)),
        BufferJSON.reviver
      );
      creds = parsed.creds;
      keys = parsed.keys ?? {};
    } catch {
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
  }

  async function saveState() {
    const blob = encrypt(JSON.stringify({ creds, keys }, BufferJSON.replacer));
    await prisma.waSession.update({
      where: { id: sessionId },
      // Prisma Bytes field accepts Buffer — cast to satisfy strict ArrayBuffer typing
      data: { sessionBlob: blob as unknown as Uint8Array<ArrayBuffer> },
    });
  }

  const keyStore: SignalKeyStoreWithTransaction = {
    get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) =>
      ids.reduce(
        (acc, id) => {
          const val = (keys[type] ?? {})[id];
          if (val !== undefined) acc[id] = val as SignalDataTypeMap[T];
          return acc;
        },
        {} as { [id: string]: SignalDataTypeMap[T] }
      ),

    set: async (data) => {
      for (const [type, entries] of Object.entries(data)) {
        keys[type] ??= {};
        for (const [id, val] of Object.entries(
          entries as Record<string, unknown>
        )) {
          if (val != null) keys[type][id] = val;
          else delete keys[type][id];
        }
      }
      await saveState();
    },

    clear: async () => {
      keys = {};
      await saveState();
    },

    isInTransaction: () => false,
    transaction: async (cb) => cb(),
  };

  return {
    state: { creds, keys: keyStore },
    saveCreds: saveState,
  };
}
