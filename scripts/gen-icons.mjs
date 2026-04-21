/**
 * Generates a placeholder source PNG then uses the Tauri CLI to produce
 * all required icon formats (32x32.png, 128x128.png, icon.ico, icon.icns …).
 * Run once: node scripts/gen-icons.mjs
 * Replace packages/desktop/src-tauri/icons/_source.png with your real logo later.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── minimal PNG encoder ───────────────────────────────────────────────────────
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function makeChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}
function solidPNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const off = y * (1 + size * 3);
    raw[off] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      raw[off + 1 + x * 3] = r;
      raw[off + 1 + x * 3 + 1] = g;
      raw[off + 1 + x * 3 + 2] = b;
    }
  }
  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", deflateSync(raw)),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── write source PNG ──────────────────────────────────────────────────────────
const iconsDir = resolve(root, "packages/desktop/src-tauri/icons");
mkdirSync(iconsDir, { recursive: true });

const src = resolve(iconsDir, "_source.png");
writeFileSync(src, solidPNG(512, 34, 197, 94)); // green-500 placeholder
console.log("✓ source PNG written →", src);
console.log("  Replace _source.png with your real logo, then re-run this script.\n");

// ── run tauri icon ────────────────────────────────────────────────────────────
console.log("Running: pnpm exec tauri icon …");
execSync(`pnpm exec tauri icon "${src}"`, {
  cwd: resolve(root, "packages/desktop"),
  stdio: "inherit",
});
console.log("\n✓ Icons generated in packages/desktop/src-tauri/icons/");
