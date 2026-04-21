import path from "node:path";
import fs from "node:fs/promises";
import type { IStorage } from "./storage.interface";

const MEDIA_ROOT = process.env.MEDIA_ROOT ?? path.join(process.cwd(), "data", "media");

class LocalFsStorage implements IStorage {
  async put(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const abs = path.join(MEDIA_ROOT, key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(path.join(MEDIA_ROOT, key)) as Promise<Buffer>;
  }

  async remove(key: string): Promise<void> {
    await fs.unlink(path.join(MEDIA_ROOT, key)).catch(() => {});
  }

}

export const storage: IStorage = new LocalFsStorage();
