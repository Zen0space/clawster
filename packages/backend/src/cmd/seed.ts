import "dotenv/config";
import { prisma } from "@clawster/db";
import { hashPassword } from "../modules/auth/auth.service";

async function seed() {
  const email = process.argv[2] ?? "admin@example.com";
  const password = process.argv[3];

  if (!password) {
    console.error("Usage: tsx src/cmd/seed.ts <email> <password>");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User already exists: ${email}`);
    await prisma.$disconnect();
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName: "Admin", role: "admin" },
  });

  console.log(`Admin created: ${user.email} (${user.id})`);
  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
