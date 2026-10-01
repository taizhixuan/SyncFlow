import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import {
  BOARD_PURGE_INTERVAL_MS,
  BoardPurgeService,
  FIRST_PURGE_DELAY_MS,
} from './board-purge.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-01T00:00:00Z');

describe('BoardPurgeService', () => {
  let findMany: jest.Mock;
  let deleteMany: jest.Mock;
  let deletePrefix: jest.Mock;
  let calls: string[];

  function build(
    nodeEnv: AppConfig['nodeEnv'] = 'production',
    retentionDays = 30,
  ): BoardPurgeService {
    const values: Partial<AppConfig> = { nodeEnv, boardPurgeAfterDays: retentionDays };
    const config = { get: jest.fn((key: keyof AppConfig) => values[key]) };
    return new BoardPurgeService(
      { board: { findMany, deleteMany } } as unknown as PrismaService,
      { deletePrefix } as unknown as StorageService,
      config as unknown as ConfigService<AppConfig, true>,
    );
  }

  beforeEach(() => {
    calls = [];
    findMany = jest.fn().mockResolvedValue([]);
    deleteMany = jest.fn(async ({ where }: { where: { id: string } }) => {
      calls.push(`row:${where.id}`);
      return { count: 1 };
    });
    deletePrefix = jest.fn(async (prefix: string) => {
      calls.push(`s3:${prefix}`);
      return 2;
    });
  });

  it('selects only boards soft-deleted before the retention cutoff, oldest first, bounded', async () => {
    await build('production', 30).purgeExpired(NOW, { maxBoards: 10 });
    const cutoff = new Date(NOW.getTime() - 30 * DAY_MS);
    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: { lt: cutoff } },
      orderBy: { deletedAt: 'asc' },
      take: 10,
      select: { id: true },
    });
  });

  it('defaults to a batch of 50 boards and the configured retention', async () => {
    await build('production', 7).purgeExpired(NOW);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: { lt: new Date(NOW.getTime() - 7 * DAY_MS) } },
        take: 50,
      }),
    );
  });

  it('deletes each board’s assets first, then its row (guarded by the same cutoff)', async () => {
    findMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
    await expect(build().purgeExpired(NOW)).resolves.toEqual({ purged: 2, failed: 0 });
    expect(calls).toEqual(['s3:boards/b1/', 'row:b1', 's3:boards/b2/', 'row:b2']);
    const cutoff = new Date(NOW.getTime() - 30 * DAY_MS);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'b1', deletedAt: { lt: cutoff } } });
  });

  it('keeps a board whose assets could not be deleted, counts it failed, and carries on', async () => {
    findMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
    deletePrefix.mockImplementation(async (prefix: string) => {
      if (prefix === 'boards/b1/') throw new Error('S3 down');
      calls.push(`s3:${prefix}`);
      return 0;
    });
    await expect(build().purgeExpired(NOW)).resolves.toEqual({ purged: 1, failed: 1 });
    expect(calls).toEqual(['s3:boards/b2/', 'row:b2']);
  });

  it('counts a row-delete failure as failed without aborting the batch', async () => {
    findMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
    deleteMany.mockRejectedValueOnce(new Error('db hiccup'));
    await expect(build().purgeExpired(NOW)).resolves.toEqual({ purged: 1, failed: 1 });
  });

  it('does not count a board another instance already purged', async () => {
    findMany.mockResolvedValue([{ id: 'b1' }]);
    deleteMany.mockResolvedValue({ count: 0 });
    await expect(build().purgeExpired(NOW)).resolves.toEqual({ purged: 0, failed: 0 });
  });

  it('purges rows when storage is unconfigured (deletePrefix reports 0 objects)', async () => {
    findMany.mockResolvedValue([{ id: 'b1' }]);
    deletePrefix.mockResolvedValue(0);
    await expect(build().purgeExpired(NOW)).resolves.toEqual({ purged: 1, failed: 0 });
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  describe('scheduling', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('first runs a few minutes after boot, then on an interval that stops on shutdown', async () => {
      const service = build('production');
      service.onModuleInit();
      expect(findMany).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(FIRST_PURGE_DELAY_MS);
      expect(findMany).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(BOARD_PURGE_INTERVAL_MS);
      expect(findMany).toHaveBeenCalledTimes(2);
      service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(BOARD_PURGE_INTERVAL_MS * 2);
      expect(findMany).toHaveBeenCalledTimes(2);
    });

    it('never schedules under NODE_ENV=test (suites invoke purgeExpired directly)', async () => {
      const service = build('test');
      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(BOARD_PURGE_INTERVAL_MS * 2);
      expect(findMany).not.toHaveBeenCalled();
      service.onModuleDestroy();
    });

    it('never throws out of the timer when the database is down', async () => {
      findMany.mockRejectedValue(new Error('db down'));
      const service = build('production');
      service.onModuleInit();
      await expect(jest.advanceTimersByTimeAsync(FIRST_PURGE_DELAY_MS)).resolves.toBeUndefined();
      service.onModuleDestroy();
    });
  });
});
