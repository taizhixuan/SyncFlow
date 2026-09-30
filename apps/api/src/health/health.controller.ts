import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { HealthStatus } from '@syncflow/shared';
import { HealthService } from './health.service';

// Render probes every few seconds from a shared IP; rate-limiting them could
// mark a healthy instance as down.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): HealthStatus {
    return this.health.liveness();
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const status = await this.health.readiness();
    // Probes rely on the status code, not just the body.
    res.status(status.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return status;
  }
}
