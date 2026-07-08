"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function main() {
    const prisma = new client_1.PrismaClient();
    try {
        const usersCount = await prisma.users.count();
        console.log('Users count:', usersCount);
        const projectsCount = await prisma.projects.count();
        console.log('Projects count:', projectsCount);
    }
    catch (e) {
        console.error(e);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=check_db.js.map