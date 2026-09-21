import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FrameStore } from '../frames/frame-store';
import type { User } from '../data/mock-store';

export async function assertTechnicianAssignedToFrame(
  prisma: PrismaService,
  user: User,
  projectCode: string,
  frameId: string,
): Promise<void> {
  if (user.role !== 'wiring_technician') return;

  const project = await prisma.projects.findFirst({
    where: { code: projectCode, is_active: true },
    select: { code: true },
  });
  if (!project || FrameStore.isBlocked(projectCode, frameId)) {
    throw new ForbiddenException('You are not assigned to this panel');
  }

  const assignment = await prisma.tech_assignments.findFirst({
    where: {
      project_code: projectCode,
      frame_id: frameId,
      technician_id: user.id,
      is_hidden: { not: true },
      changeover_locked: { not: true },
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new ForbiddenException('You are not assigned to this panel');
  }
}
