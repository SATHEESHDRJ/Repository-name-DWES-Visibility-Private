import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Apply default throttler limits; login uses @Throttle override on controller. */
@Injectable()
export class DwesThrottlerGuard extends ThrottlerGuard {}
