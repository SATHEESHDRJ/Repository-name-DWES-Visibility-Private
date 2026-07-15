import * as fs from 'fs';
import * as path from 'path';
import { MockStore } from '../data/mock-store';
import { PrismaService } from '../prisma/prisma.service';
import { FrameStore } from '../frames/frame-store';

export interface PermanentProjectDeleteResult {
  success: true;
  project_code: string;
  deleted: {
    inspections: number;
    assignments: number;
    file_hashes: number;
    audit_logs: number;
    session_logs: number;
    project_row: number;
    uploads_removed: boolean;
    folder_removed: boolean;
  };
  message: string;
  ts: string;
}

export async function permanentlyDeleteProject(
  prisma: PrismaService,
  code: string,
  uploadBase: string,
): Promise<PermanentProjectDeleteResult> {
  const projectUploadsDir = path.join(uploadBase, code);

  const assignments = await prisma.tech_assignments.findMany({
    where: { project_code: code },
    select: { id: true },
  });
  const assignmentIds = assignments.map(a => a.id);

  const [inspectionDelete, assignmentDelete, hashDelete, auditDelete, sessionDelete, projectDelete] = await prisma.$transaction([
    assignmentIds.length
      ? prisma.panel_inspections.deleteMany({ where: { assignment_id: { in: assignmentIds } } })
      : prisma.panel_inspections.deleteMany({ where: { id: { in: [] } } }),
    prisma.tech_assignments.deleteMany({ where: { project_code: code } }),
    prisma.file_hashes.deleteMany({ where: { project_code: code } }),
    prisma.tech_audit_log.deleteMany({ where: { project_code: code } }),
    prisma.session_log.deleteMany({ where: { project_code: code } }),
    // Hard delete — startup project seeding was removed (2026-07-15), so nothing
    // recreates a project code after a restart and no tombstone row is kept.
    prisma.projects.deleteMany({ where: { code } }),
  ]);

  FrameStore.blockProject(code);
  MockStore.frames = MockStore.frames.filter(frame => frame.project_code !== code);
  MockStore.drawings = MockStore.drawings.filter(drawing => drawing.project_code !== code);
  MockStore.drawingPackages = MockStore.drawingPackages.filter(record => record.project_code !== code);
  MockStore.directorReports = MockStore.directorReports.filter(report => report.project_code !== code);

  let folderRemoved = false;
  if (fs.existsSync(projectUploadsDir)) {
    fs.rmSync(projectUploadsDir, { recursive: true, force: true });
    folderRemoved = true;
  }

  return {
    success: true,
    project_code: code,
    deleted: {
      inspections: inspectionDelete.count,
      assignments: assignmentDelete.count,
      file_hashes: hashDelete.count,
      audit_logs: auditDelete.count,
      session_logs: sessionDelete.count,
      project_row: projectDelete.count,
      uploads_removed: folderRemoved,
      folder_removed: folderRemoved,
    },
    message: `Project "${code}" permanently deleted from database and storage.`,
    ts: new Date().toISOString(),
  };
}
