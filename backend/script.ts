import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.tech_audit_log.findMany({ where: { action: 'cable_skip' } }).then(console.log).finally(() => prisma.$disconnect());
