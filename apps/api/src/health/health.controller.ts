import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { HealthStatus } from '@syncflow/shared';
import { ApiPublic } from '../common/openapi/api-auth';
import { ApiZodResponse } from '../common/openapi/api-responses';
import { HealthService } from './health.service';

// Render probes every few seconds from a shared IP; rate-limiting them could
// mark a healthy instance as down.
@SkipThrottle()
@Controller('health')
@ApiPublic()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiZodResponse(HttpStatus.OK, 'HealthStatus', 'The process is up')
  live(): HealthStatus {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (Postgres and Redis)' })
  @ApiZodResponse(HttpStatus.OK, 'HealthStatus', 'Postgres and Redis are reachable')
  @ApiZodResponse(
    HttpStatus.SERVICE_UNAVAILABLE,
    'HealthStatus',
    'A dependency is down; see details',
  )
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const status = await this.health.readiness();
    // Probes rely on the status code, not just the body.
    res.status(status.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return status;
  }
}
