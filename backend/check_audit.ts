import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const records = await prisma.tech_audit_log.findMany({
    where: { action: 'cable_skip' }
  });
  console.log('cable_skip records:', JSON.stringify(records, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
