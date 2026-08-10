"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function run() {
    const records = await prisma.tech_audit_log.findMany({
        where: { action: 'cable_skip' }
    });
    console.log('cable_skip records:', JSON.stringify(records, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
//# sourceMappingURL=check_audit.js.map