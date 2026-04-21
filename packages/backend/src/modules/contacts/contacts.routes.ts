import type { FastifyInstance } from "fastify";
import { prisma } from "@clawster/db";
import {
  importContacts,
  createContactList,
  addSingleContact,
  listContactLists,
  getContactList,
  deleteContactList,
  listContacts,
} from "./contacts.service";
import { importSchema } from "./contacts.schema";

export async function contactsRoutes(app: FastifyInstance) {
  // POST /contacts/import — multipart: file + name
  app.post("/contacts/import", { onRequest: [app.authenticate] }, async (request, reply) => {
    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let fileName = "upload.xlsx";
    let listName = "";
    let defaultRegion = "MY";

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        fileBuffer = await part.toBuffer();
        fileName = part.filename || "upload.xlsx";
      } else if (part.type === "field") {
        if (part.fieldname === "name") listName = String(part.value);
        if (part.fieldname === "defaultRegion") defaultRegion = String(part.value);
      }
    }

    if (!fileBuffer) return reply.status(400).send({ error: "file is required" });
    if (fileBuffer.length > 25 * 1024 * 1024) return reply.status(413).send({ error: "file too large (max 25MB)" });

    const parsed = importSchema.safeParse({ name: listName, defaultRegion });
    if (!parsed.success) return reply.status(400).send({ error: "validation_error", issues: parsed.error.issues });

    try {
      const result = await importContacts({
        userId: request.user.sub,
        listName: parsed.data.name,
        fileBuffer,
        fileName,
        defaultRegion: parsed.data.defaultRegion,
      });
      await prisma.auditLog.create({ data: { userId: request.user.sub, action: "contacts.import", subject: result.list_id, meta: { total: result.total, imported: result.imported } } });
      return reply.status(201).send(result);
    } catch (err: unknown) {
      if (err instanceof Error && (err as Error & { status?: number }).status === 422) {
        return reply.status(422).send({ error: err.message });
      }
      throw err;
    }
  });

  // POST /contact-lists — create empty list
  app.post("/contact-lists", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = request.body as { name?: string };
    const name = String(body?.name ?? "").trim();
    if (!name || name.length > 100) return reply.status(400).send({ error: "name is required (max 100 chars)" });
    const list = await createContactList(request.user.sub, name);
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "contacts.list.create", subject: list.id } });
    return reply.status(201).send(list);
  });

  // POST /contact-lists/:id/contacts — add single contact
  app.post("/contact-lists/:id/contacts", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { phone?: string; name?: string; defaultRegion?: string };
    const phone = String(body?.phone ?? "").trim();
    if (!phone) return reply.status(400).send({ error: "phone is required" });
    const result = await addSingleContact({
      listId: id,
      userId: request.user.sub,
      phone,
      name: body?.name ? String(body.name).trim() : undefined,
      defaultRegion: body?.defaultRegion ? String(body.defaultRegion) : "MY",
    });
    if (!result.ok) return reply.status(422).send({ error: result.error });
    return reply.status(201).send(result);
  });

  // GET /contact-lists
  app.get("/contact-lists", { onRequest: [app.authenticate] }, async (request) => {
    const q = request.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    return listContactLists(request.user.sub, page, limit);
  });

  // GET /contact-lists/:id
  app.get("/contact-lists/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const list = await getContactList(id, request.user.sub);
    if (!list) return reply.status(404).send({ error: "not_found" });
    return list;
  });

  // DELETE /contact-lists/:id
  app.delete("/contact-lists/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await deleteContactList(id, request.user.sub);
    if (!ok) return reply.status(404).send({ error: "not_found" });
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "contacts.list.delete", subject: id } });
    return { ok: true };
  });

  // GET /contact-lists/:id/contacts
  app.get("/contact-lists/:id/contacts", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    const result = await listContacts(id, request.user.sub, page, limit);
    if (!result) return reply.status(404).send({ error: "not_found" });
    return result;
  });
}
