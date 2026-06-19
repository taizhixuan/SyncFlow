import { Injectable } from '@nestjs/common';
import { API_VERSION, type HealthStatus } from '@syncflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: the process is up and serving. Cheap, no dependency checks. */
  liveness(): HealthStatus {
    return {
      status: 'ok',
      service: 'syncflow-api',
      version: API_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: can we actually serve requests? Checks Postgres + Redis. */
  async readiness(): Promise<HealthStatus> {
    const [dbUp, redisUp] = await Promise.all([this.prisma.isHealthy(), this.redis.isHealthy()]);

    const allUp = dbUp && redisUp;
    return {
      status: allUp ? 'ok' : 'down',
      service: 'syncflow-api',
      version: API_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      details: {
        database: dbUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
      },
    };
  }
}
