import { NotFoundException } from '@nestjs/common';

/** True when backend DEMO_MODE=true (local/demo deployments only). */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

/** Hard-refuse when not in demo mode — returns 404 (invisible in production). */
export function assertDemoMode(): void {
  if (!isDemoMode()) throw new NotFoundException();
}

/** Allow canonical user/project seeding at startup (local demo only). */
export function allowStartupSeed(): boolean {
  return isDemoMode() || process.env.NODE_ENV !== 'production';
}
