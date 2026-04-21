import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "@clawster/db";
import { hashPassword } from "../modules/auth/auth.service";

function generateLicenseKey(): string {
  const hex = randomBytes(10).toString("hex").toUpperCase();
  return `${hex.slice(0, 5)}-${hex.slice(5, 10)}-${hex.slice(10, 15)}-${hex.slice(15, 20)}`;
}

async function seed() {
  // ── license keys ──────────────────────────────────────────────────────────
  const existingCount = await prisma.licenseKey.count();
  if (existingCount === 0) {
    const keys = Array.from({ length: 20 }, () => ({ key: generateLicenseKey() }));
    await prisma.licenseKey.createMany({ data: keys, skipDuplicates: true });
    console.log("License keys seeded:");
    keys.forEach((k) => console.log(" ", k.key));
  } else {
    console.log(`License keys already seeded (${existingCount} found)`);
  }

  // ── admin user (optional) ─────────────────────────────────────────────────
  const email = process.argv[2];
  const password = process.argv[3];

  if (email && password) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`User already exists: ${email}`);
    } else {
      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: { email, passwordHash, fullName: "Admin", role: "admin" },
      });
      console.log(`Admin created: ${user.email} (${user.id})`);
    }
  }

  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
