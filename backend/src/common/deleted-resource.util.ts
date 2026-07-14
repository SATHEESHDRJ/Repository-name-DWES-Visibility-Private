import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const PANEL_DELETION_FILE_TYPE = 'panel_deleted';

export function panelDeletionHash(projectCode: string, frameId: string): string {
  return crypto.createHash('sha256').update(`${projectCode}\0${frameId}`).digest('hex');
}

export function panelDeletionRecord(projectCode: string, frameId: string) {
  return {
    file_hash: panelDeletionHash(projectCode, frameId),
    file_name: frameId,
    file_type: PANEL_DELETION_FILE_TYPE,
    project_code: projectCode,
  };
}

export async function deletedPanelIds(
  prisma: PrismaService,
  projectCode: string,
): Promise<Set<string>> {
  const rows = await prisma.file_hashes.findMany({
    where: { project_code: projectCode, file_type: PANEL_DELETION_FILE_TYPE },
    select: { file_name: true },
  });
  return new Set(rows.map(row => row.file_name));
}

export async function isPanelDeleted(
  prisma: PrismaService,
  projectCode: string,
  frameId: string,
): Promise<boolean> {
  const row = await prisma.file_hashes.findFirst({
    where: {
      project_code: projectCode,
      file_type: PANEL_DELETION_FILE_TYPE,
      file_name: frameId,
    },
    select: { id: true },
  });
  return !!row;
}
