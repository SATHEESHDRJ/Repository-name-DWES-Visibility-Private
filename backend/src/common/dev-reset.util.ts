import { ForbiddenException, NotFoundException } from '@nestjs/common';

/** True when dev hard-reset is explicitly allowed (never in production deploys). */
export function isDevHardResetAllowed(): boolean {
  return (
    process.env.DEMO_MODE === 'true' ||
    process.env.ALLOW_DEV_HARD_RESET === 'true'
  );
}

/** Refuse hard-reset when neither DEMO_MODE nor ALLOW_DEV_HARD_RESET is set. */
export function assertDevHardResetAllowed(): void {
  if (!isDevHardResetAllowed()) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    throw new ForbiddenException('Dev hard reset is disabled. Set DEMO_MODE=true or ALLOW_DEV_HARD_RESET=true.');
  }
}
