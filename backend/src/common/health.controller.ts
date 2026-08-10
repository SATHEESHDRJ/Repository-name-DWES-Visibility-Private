import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('api/health')
  async legacyHealth() {
    return this.healthService.check();
  }

  @Get('health/live')
  async liveness() {
    return this.healthService.checkLive();
  }

  @Get('health/ready')
  async readiness() {
    return this.healthService.checkReady();
  }

  @Get('api/health/live')
  async apiLiveness() {
    return this.healthService.checkLive();
  }

  @Get('api/health/ready')
  async apiReadiness() {
    return this.healthService.checkReady();
  }
}
