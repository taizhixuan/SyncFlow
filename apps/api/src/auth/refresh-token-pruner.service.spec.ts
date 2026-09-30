import type { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenPrunerService } from './refresh-token-pruner.service';

describe('RefreshTokenPrunerService', () => {
  function build(deleteMany: jest.Mock): RefreshTokenPrunerService {
    return new RefreshTokenPrunerService({ refreshToken: { deleteMany } } as unknown as PrismaService);
  }

  it('deletes only rows past their expiry (revoked-but-live rows stay for reuse detection)', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const now = new Date('2026-01-01T00:00:00Z');
    await expect(build(deleteMany).prune(now)).resolves.toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } });
  });

  it('sweeps at startup and on an unref’d interval that stops on shutdown', () => {
    jest.useFakeTimers();
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = build(deleteMany);
    service.onModuleInit();
    expect(deleteMany).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(deleteMany).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    jest.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(deleteMany).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('never throws out of the timer when the database is down', async () => {
    const deleteMany = jest.fn().mockRejectedValue(new Error('db down'));
    const service = build(deleteMany);
    expect(() => service.onModuleInit()).not.toThrow();
    service.onModuleDestroy();
    await Promise.resolve();
  });
});
