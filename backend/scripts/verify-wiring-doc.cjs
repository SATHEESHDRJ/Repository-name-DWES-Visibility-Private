/** Read-only verification: generate wiring doc in memory, report stats. Run after `npm run build`. */
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { WiringDocumentService } = require('../dist/projects/wiring-document.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const wiringDoc = app.get(WiringDocumentService);
  const prisma = app.get(PrismaService);

  const code = 'SAS_132KV_KSA_RIYADH_2026_001';
  const frameId = 'frame_1782907252683';
  const framePath = path.join(process.cwd(), 'uploads', code, 'frames', `${frameId}.json`);
  const frame = JSON.parse(fs.readFileSync(framePath, 'utf-8'));
  const expectedRows = frame.cables.length;

  const before = await prisma.projects.findUnique({ where: { code }, select: { project_state: true } });
  const { buffer, filename } = await wiringDoc.generateFrameDocument(code, frameId, 'Verify Script');
  const after = await prisma.projects.findUnique({ where: { code }, select: { project_state: true } });

  const pdfDoc = await PDFDocument.load(buffer);
  const pageCount = pdfDoc.getPageCount();

  console.log(JSON.stringify({
    ok: expectedRows === 657 && pageCount >= 14 && before?.project_state === after?.project_state,
    filename,
    expectedCableRows: expectedRows,
    pdfBytes: buffer.length,
    pdfPages: pageCount,
    projectStateUnchanged: before?.project_state === after?.project_state,
    projectState: after?.project_state,
  }, null, 2));

  await app.close();
}

main().catch(e => { console.error(e); process.exit(1); });
