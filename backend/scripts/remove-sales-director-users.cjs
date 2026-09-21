#!/usr/bin/env node
/**
 * Local dev/test cleanup: deactivate users with role sales_director.
 * Does NOT convert them to ops_director — preserves audit identity via is_active=false.
 *
 * Usage (from backend/):
 *   node scripts/remove-sales-director-users.cjs
 *   node scripts/remove-sales-director-users.cjs --dry-run
 */
const { PrismaClient } = require('@prisma/client');

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.users.findMany({
    where: { role: 'sales_director' },
    select: { id: true, username: true, full_name: true, role: true, is_active: true },
  });

  if (users.length === 0) {
    console.log('[DWES] No sales_director users found — nothing to do.');
    return;
  }

  console.log(`[DWES] Found ${users.length} sales_director user(s):`);
  for (const u of users) {
    console.log(`  - id=${u.id} username=${u.username} active=${u.is_active}`);
  }

  if (dryRun) {
    console.log('[DWES] Dry run — no changes written.');
    return;
  }

  const result = await prisma.users.updateMany({
    where: { role: 'sales_director' },
    data: { is_active: false },
  });

  console.log(`[DWES] Deactivated ${result.count} sales_director user(s).`);
  console.log('[DWES] Historical audit rows retain the original role text.');
}

main()
  .catch(err => {
    console.error('[DWES] Cleanup failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
