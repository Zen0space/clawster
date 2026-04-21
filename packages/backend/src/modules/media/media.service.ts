import { createReadStream, type ReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma, type Prisma } from "@clawster/db";
import { storage } from "../storage/localfs.storage";

export async function uploadMedia(opts: {
  userId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) {
  const sha256 = crypto.createHash("sha256").update(opts.buffer).digest("hex");
  const ext = path.extname(opts.originalName) || "";
  const key = `media/${opts.userId}/${sha256}${ext}`;

  await storage.put(key, opts.buffer, opts.mimeType);

  return prisma.mediaAsset.create({
    data: {
      userId: opts.userId,
      storagePath: key,
      mimeType: opts.mimeType,
      byteSize: BigInt(opts.buffer.length),
      sha256,
    },
  });
}

export function getMediaAsset(id: string, userId: string): Promise<Prisma.MediaAssetGetPayload<Record<never, never>> | null> {
  return prisma.mediaAsset.findFirst({ where: { id, userId } });
}

export function getMediaStream(storagePath: string): ReadStream {
  return createReadStream(storage.absolutePath(storagePath));
}
