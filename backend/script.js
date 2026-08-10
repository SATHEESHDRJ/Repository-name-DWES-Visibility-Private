"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
prisma.tech_audit_log.findMany({ where: { action: 'cable_skip' } }).then(console.log).finally(() => prisma.$disconnect());
//# sourceMappingURL=script.js.map