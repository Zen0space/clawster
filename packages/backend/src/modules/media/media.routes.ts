import type { FastifyInstance } from "fastify";
import { uploadMedia, getMediaAsset, getMediaStream } from "./media.service";

export async function mediaRoutes(app: FastifyInstance) {
  // POST /media — multipart upload
  app.post("/media", { onRequest: [app.authenticate] }, async (request, reply) => {
    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let mimeType = "application/octet-stream";
    let originalName = "upload";

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        fileBuffer = await part.toBuffer();
        mimeType = part.mimetype;
        originalName = part.filename || "upload";
      }
    }

    if (!fileBuffer) return reply.status(400).send({ error: "file is required" });
    if (fileBuffer.length > 16 * 1024 * 1024) return reply.status(413).send({ error: "file too large (max 16MB)" });

    const asset = await uploadMedia({
      userId: request.user.sub,
      buffer: fileBuffer,
      mimeType,
      originalName,
    });

    return reply.status(201).send({
      id: asset.id,
      mimeType: asset.mimeType,
      byteSize: Number(asset.byteSize),
      sha256: asset.sha256,
    });
  });

  // GET /media/:id — metadata
  app.get("/media/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const asset = await getMediaAsset(id, request.user.sub);
    if (!asset) return reply.status(404).send({ error: "not_found" });
    return {
      id: asset.id,
      mimeType: asset.mimeType,
      byteSize: Number(asset.byteSize),
      sha256: asset.sha256,
      createdAt: asset.createdAt,
    };
  });

  // GET /media/:id/download — authenticated stream
  app.get("/media/:id/download", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const asset = await getMediaAsset(id, request.user.sub);
    if (!asset) return reply.status(404).send({ error: "not_found" });
    const stream = getMediaStream(asset.storagePath);
    reply.header("Content-Type", asset.mimeType);
    reply.header("Content-Disposition", `attachment; filename="${id}"`);
    return reply.send(stream);
  });
}
