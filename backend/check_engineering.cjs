require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  console.log('drawing_assets:', await prisma.drawing_assets.count());
  console.log('panel_models:', await prisma.panel_models.count());
  console.log('device_geometries:', await prisma.device_geometries.count());
  console.log('terminal_geometries:', await prisma.terminal_geometries.count());
  console.log('duct_nodes:', await prisma.duct_nodes.count());
  console.log('duct_segments:', await prisma.duct_segments.count());
  console.log('cable_route_mappings:', await prisma.cable_route_mappings.count());
}
main().finally(() => prisma.$disconnect());
