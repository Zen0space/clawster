import ExcelJS from "exceljs";
import libphonenumber from "google-libphonenumber";
import { prisma, type Prisma } from "@clawster/db";
import { storage } from "../storage/localfs.storage";

const phoneUtil = libphonenumber.PhoneNumberUtil.getInstance();
const PNF = libphonenumber.PhoneNumberFormat;

const PHONE_COLS = new Set(["phone", "mobile", "tel", "telephone", "number", "no", "hp", "whatsapp", "wa", "handphone"]);
const NAME_COLS = new Set(["name", "nama", "fullname", "full_name", "full name"]);

function cellToStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text: string }>).map((r) => r.text).join("");
    }
    if ("result" in obj) return String(obj.result ?? "");
    if ("error" in obj) return "";
  }
  return String(v);
}

function normalizePhone(raw: string, region: string): { e164: string } | { error: string } {
  try {
    const cleaned = raw.trim();
    if (!cleaned) return { error: "empty" };
    const num = phoneUtil.parseAndKeepRawInput(cleaned, region);
    if (!phoneUtil.isValidNumber(num)) return { error: "invalid number" };
    return { e164: phoneUtil.format(num, PNF.E164) };
  } catch {
    return { error: "unparseable" };
  }
}

async function parseXlsx(buffer: Buffer): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const wb = new ExcelJS.Workbook();
  // @ts-expect-error — ExcelJS types predate the Buffer generic in @types/node ≥22
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("no worksheets found in file");

  const rawHeaders: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    rawHeaders[col - 1] = cellToStr(cell.value).toLowerCase().trim();
  });
  const headers = rawHeaders.filter(Boolean);

  const rows: Record<string, string>[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    const obj: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const h = rawHeaders[col - 1];
      if (h) obj[h] = cellToStr(cell.value);
    });
    rows.push(obj);
  });

  return { headers, rows };
}

export type ImportResult = {
  list_id: string;
  total: number;
  imported: number;
  invalid: { row: number; reason: string }[];
};

export async function importContacts(opts: {
  userId: string;
  listName: string;
  fileBuffer: Buffer;
  fileName: string;
  defaultRegion: string;
}): Promise<ImportResult> {
  const { headers, rows } = await parseXlsx(opts.fileBuffer);

  const phoneCol = headers.find((h) => PHONE_COLS.has(h) || h.startsWith("phone") || h.startsWith("mobile"));
  if (!phoneCol) {
    const err = Object.assign(
      new Error("no phone column — name it 'phone', 'mobile', or 'tel'"),
      { status: 422 }
    );
    throw err;
  }

  const nameCol = headers.find((h) => NAME_COLS.has(h));
  const customCols = headers.filter((h) => h !== phoneCol && h !== nameCol);

  const safeName = opts.fileName.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
  const fileKey = `imports/${opts.userId}/${Date.now()}-${safeName}`;
  await storage.put(fileKey, opts.fileBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  const list = await prisma.contactList.create({
    data: { userId: opts.userId, name: opts.listName, sourceFile: fileKey, rowCount: 0 },
  });

  let imported = 0;
  const invalid: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawPhone = row[phoneCol] ?? "";

    const norm = normalizePhone(rawPhone, opts.defaultRegion);
    if ("error" in norm) {
      invalid.push({ row: i + 2, reason: rawPhone ? `"${rawPhone}": ${norm.error}` : "empty phone" });
      continue;
    }

    const customFields: Record<string, string> = {};
    for (const col of customCols) {
      if (row[col]) customFields[col] = row[col];
    }

    await prisma.contact.upsert({
      where: { contactListId_phoneE164: { contactListId: list.id, phoneE164: norm.e164 } },
      create: {
        contactListId: list.id,
        phoneE164: norm.e164,
        name: nameCol ? (row[nameCol] || null) : null,
        customFields,
        isValid: true,
      },
      update: {
        name: nameCol ? (row[nameCol] || null) : null,
        customFields,
        isValid: true,
      },
    });
    imported++;
  }

  await prisma.contactList.update({ where: { id: list.id }, data: { rowCount: imported } });

  return { list_id: list.id, total: rows.length, imported, invalid };
}

export async function listContactLists(userId: string, page: number, limit: number) {
  const [items, total] = await Promise.all([
    prisma.contactList.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, name: true, rowCount: true, createdAt: true },
    }),
    prisma.contactList.count({ where: { userId } }),
  ]);
  return { items, total, page, limit };
}

export async function getContactList(id: string, userId: string) {
  return prisma.contactList.findFirst({
    where: { id, userId },
    select: { id: true, name: true, rowCount: true, sourceFile: true, createdAt: true },
  });
}

export async function deleteContactList(id: string, userId: string): Promise<boolean> {
  const list = await prisma.contactList.findFirst({ where: { id, userId } });
  if (!list) return false;
  if (list.sourceFile) await storage.remove(list.sourceFile);
  await prisma.contactList.delete({ where: { id } });
  return true;
}

type ContactRow = { id: string; phoneE164: string; name: string | null; customFields: Prisma.JsonValue; isValid: boolean };

export async function createContactList(userId: string, name: string) {
  return prisma.contactList.create({
    data: { userId, name, rowCount: 0 },
    select: { id: true, name: true, rowCount: true, createdAt: true },
  });
}

export async function addSingleContact(opts: {
  listId: string;
  userId: string;
  phone: string;
  name?: string;
  defaultRegion?: string;
}): Promise<{ ok: true; phoneE164: string } | { ok: false; error: string }> {
  const list = await prisma.contactList.findFirst({ where: { id: opts.listId, userId: opts.userId } });
  if (!list) return { ok: false, error: "list not found" };

  const norm = normalizePhone(opts.phone, opts.defaultRegion ?? "MY");
  if ("error" in norm) return { ok: false, error: `invalid phone: ${norm.error}` };

  await prisma.contact.upsert({
    where: { contactListId_phoneE164: { contactListId: opts.listId, phoneE164: norm.e164 } },
    create: { contactListId: opts.listId, phoneE164: norm.e164, name: opts.name || null, customFields: {}, isValid: true },
    update: { name: opts.name || null, isValid: true },
  });

  const count = await prisma.contact.count({ where: { contactListId: opts.listId } });
  await prisma.contactList.update({ where: { id: opts.listId }, data: { rowCount: count } });

  return { ok: true, phoneE164: norm.e164 };
}

export async function listContacts(
  listId: string,
  userId: string,
  page: number,
  limit: number
): Promise<{ items: ContactRow[]; total: number; page: number; limit: number } | null> {
  const list = await prisma.contactList.findFirst({ where: { id: listId, userId } });
  if (!list) return null;

  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where: { contactListId: listId },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, phoneE164: true, name: true, customFields: true, isValid: true },
    }),
    prisma.contact.count({ where: { contactListId: listId } }),
  ]);
  return { items, total, page, limit };
}
