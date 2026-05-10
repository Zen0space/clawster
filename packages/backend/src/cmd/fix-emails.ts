import "dotenv/config";
import { prisma } from "@clawster/db";

// Backfill: lowercase + trim every User.email that isn't already canonical.
//
// Background: register/login originally looked up users by raw email
// (case-sensitive). Anyone who registered with mixed case ended up with a row
// that the new normalized lookup can't find. This script idempotently fixes
// existing rows; safe to run repeatedly. If two rows would normalize to the
// same value (e.g. Foo@x.com and foo@x.com both exist), it refuses to write
// and asks the operator to resolve.

async function main() {
  const all = await prisma.user.findMany({ select: { id: true, email: true } });
  const needsFix = all.filter((u) => u.email !== u.email.trim().toLowerCase());

  if (needsFix.length === 0) {
    console.log("✓ all user emails are already normalized");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${needsFix.length} user(s) with non-canonical email:`);
  needsFix.forEach((u) =>
    console.log(`  ${u.id}  ${u.email}  →  ${u.email.trim().toLowerCase()}`)
  );

  // Collision check: refuse to write if a normalized target already exists on
  // a different row. The operator must merge or delete duplicates manually.
  const targetEmails = needsFix.map((u) => u.email.trim().toLowerCase());
  const existing = await prisma.user.findMany({
    where: { email: { in: targetEmails } },
    select: { id: true, email: true },
  });
  const conflicts = existing.filter(
    (e) => !needsFix.some((u) => u.id === e.id)
  );
  if (conflicts.length > 0) {
    console.error("\n✗ refusing to update — these target emails already exist on other rows:");
    conflicts.forEach((c) => console.error(`  ${c.id}  ${c.email}`));
    console.error("\nResolve manually (delete or merge the duplicate accounts) before re-running.");
    process.exit(1);
  }

  let updated = 0;
  for (const u of needsFix) {
    await prisma.user.update({
      where: { id: u.id },
      data: { email: u.email.trim().toLowerCase() },
    });
    updated++;
  }

  console.log(`\n✓ updated ${updated} user email(s)`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
