import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../../env";

const ALGO = "aes-256-gcm";
const KEY = Buffer.from(env.MASTER_KEY, "hex");

export function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]); // 12 + 16 + n bytes
}

export function decrypt(data: Buffer): string {
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}
