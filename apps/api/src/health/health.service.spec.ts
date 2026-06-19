import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('HealthService', () => {
  const buildService = async (dbUp: boolean, redisUp: boolean): Promise<HealthService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { isHealthy: jest.fn().mockResolvedValue(dbUp) } },
        { provide: RedisService, useValue: { isHealthy: jest.fn().mockResolvedValue(redisUp) } },
      ],
    }).compile();
    return moduleRef.get(HealthService);
  };

  it('liveness is always ok regardless of dependencies', async () => {
    const service = await buildService(false, false);
    const result = service.liveness();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('syncflow-api');
  });

  it('readiness is ok when both Postgres and Redis are up', async () => {
    const service = await buildService(true, true);
    const result = await service.readiness();
    expect(result.status).toBe('ok');
    expect(result.details).toEqual({ database: 'up', redis: 'up' });
  });

  it('readiness is down when Redis is unreachable', async () => {
    const service = await buildService(true, false);
    const result = await service.readiness();
    expect(result.status).toBe('down');
    expect(result.details).toEqual({ database: 'up', redis: 'down' });
  });

  it('readiness is down when Postgres is unreachable', async () => {
    const service = await buildService(false, true);
    const result = await service.readiness();
    expect(result.status).toBe('down');
    expect(result.details?.database).toBe('down');
  });
});
