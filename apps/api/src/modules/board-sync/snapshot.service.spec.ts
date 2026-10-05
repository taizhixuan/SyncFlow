import { Prisma } from '@prisma/client';
import {
  SnapshotService,
  nextDocVersion,
  selectSnapshotsToPrune,
  VERSION_LIST_LIMIT,
  type PruneCandidate,
} from './snapshot.service';

describe('nextDocVersion', () => {
  it('starts at 1 and increments', () => {
    expect(nextDocVersion(null)).toBe(1);
    expect(nextDocVersion(4)).toBe(5);
  });
});

describe('SnapshotService.save', () => {
  it('inserts the next version as a Buffer', async () => {
    const created: unknown[] = [];
    const prisma = {
      boardSnapshot: {
        findFirst: jest.fn().mockResolvedValue({ docVersion: 2 }),
        create: jest.fn().mockImplementation((args: unknown) => { created.push(args); return Promise.resolve({}); }),
      },
      board: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const svc = new SnapshotService(prisma as never);
    await svc.save('board-1', new Uint8Array([9, 9]), 'user-1');
    expect(prisma.boardSnapshot.create).toHaveBeenCalledTimes(1);
    const arg = created[0] as { data: { boardId: string; docVersion: number; reason: string; yjsState: Buffer; createdBy: string } };
    expect(arg.data.docVersion).toBe(3);
    expect(arg.data.boardId).toBe('board-1');
    expect(arg.data.reason).toBe('autosave');
    expect(Buffer.isBuffer(arg.data.yjsState)).toBe(true);
    expect(arg.data.createdBy).toBe('user-1');
  });
});

describe('SnapshotService.save marks the board as edited', () => {
  function makePrisma() {
    return {
      boardSnapshot: {
        findFirst: jest.fn().mockResolvedValue({ docVersion: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      board: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
  }

  it("bumps the board's updatedAt so dashboards order by the last content edit", async () => {
    const prisma = makePrisma();
    const before = Date.now();
    await new SnapshotService(prisma as never).save('b1', new Uint8Array([1]));
    expect(prisma.board.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.board.updateMany.mock.calls[0]![0] as { where: unknown; data: { updatedAt: Date } };
    expect(arg.where).toEqual({ id: 'b1' });
    expect(arg.data.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('still reports the saved version when the bump fails (the snapshot is what matters)', async () => {
    const prisma = makePrisma();
    prisma.board.updateMany.mockRejectedValue(new Error('db blip'));
    await expect(new SnapshotService(prisma as never).save('b1', new Uint8Array([1]))).resolves.toBe(2);
  });

  it('does not bump the board when the snapshot insert fails', async () => {
    const prisma = makePrisma();
    prisma.boardSnapshot.create.mockRejectedValue(new Error('db down'));
    await expect(new SnapshotService(prisma as never).save('b1', new Uint8Array([1]))).rejects.toThrow('db down');
    expect(prisma.board.updateMany).not.toHaveBeenCalled();
  });
});

describe('SnapshotService.loadLatest', () => {
  it('returns a Uint8Array when a row exists', async () => {
    const prisma = {
      boardSnapshot: { findFirst: jest.fn().mockResolvedValue({ yjsState: Buffer.from([1, 2, 3]) }) },
    };
    const svc = new SnapshotService(prisma as never);
    const out = await svc.loadLatest('b');
    expect(Array.from(out!)).toEqual([1, 2, 3]);
  });

  it('returns null when no snapshot exists', async () => {
    const prisma = { boardSnapshot: { findFirst: jest.fn().mockResolvedValue(null) } };
    const svc = new SnapshotService(prisma as never);
    expect(await svc.loadLatest('b')).toBeNull();
  });
});

describe('SnapshotService.getByVersion', () => {
  it('returns a Uint8Array of the row bytes when found', async () => {
    const prisma = { boardSnapshot: { findUnique: jest.fn().mockResolvedValue({ yjsState: Buffer.from([1, 2, 3]) }) } };
    const svc = new SnapshotService(prisma as never);
    expect(Array.from((await svc.getByVersion('b1', 2))!)).toEqual([1, 2, 3]);
  });

  it('returns null when the version is missing', async () => {
    const prisma = { boardSnapshot: { findUnique: jest.fn().mockResolvedValue(null) } };
    const svc = new SnapshotService(prisma as never);
    expect(await svc.getByVersion('b1', 99)).toBeNull();
  });
});

describe('SnapshotService.list', () => {
  it('returns versions newest-first as DTOs', async () => {
    const prisma = {
      boardSnapshot: { findMany: jest.fn().mockResolvedValue([
        { docVersion: 2, reason: 'autosave', createdBy: null, createdAt: new Date('2026-01-02') },
        { docVersion: 1, reason: 'manual', createdBy: 'u1', createdAt: new Date('2026-01-01') },
      ]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new SnapshotService(prisma as never);
    const out = await svc.list('b1');
    expect(out[0]!.docVersion).toBe(2);
    expect(out[1]!.reason).toBe('manual');
    expect(typeof out[0]!.createdAt).toBe('string');
  });

  it('caps the list to the newest VERSION_LIST_LIMIT rows', async () => {
    const prisma = {
      boardSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new SnapshotService(prisma as never);
    await svc.list('b1');
    expect(VERSION_LIST_LIMIT).toBe(100);
    expect(prisma.boardSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: VERSION_LIST_LIMIT, orderBy: { docVersion: 'desc' } }),
    );
  });
});

describe('SnapshotService.list author names', () => {
  it('resolves every author with one batched user lookup', async () => {
    const prisma = {
      boardSnapshot: { findMany: jest.fn().mockResolvedValue([
        { docVersion: 4, reason: 'restore', createdBy: 'u1', createdAt: new Date('2026-01-04') },
        { docVersion: 3, reason: 'autosave', createdBy: null, createdAt: new Date('2026-01-03') },
        { docVersion: 2, reason: 'manual', createdBy: 'gone', createdAt: new Date('2026-01-02') },
        { docVersion: 1, reason: 'manual', createdBy: 'u1', createdAt: new Date('2026-01-01') },
      ]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', displayName: 'Ada' }]) },
    };
    const svc = new SnapshotService(prisma as never);
    const out = await svc.list('b1');
    expect(out.map((v) => v.createdByName)).toEqual(['Ada', null, null, 'Ada']);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'gone'] } },
      select: { id: true, displayName: true },
    });
  });

  it('skips the user lookup when no version has an author', async () => {
    const prisma = {
      boardSnapshot: { findMany: jest.fn().mockResolvedValue([
        { docVersion: 1, reason: 'autosave', createdBy: null, createdAt: new Date('2026-01-01') },
      ]) },
      user: { findMany: jest.fn() },
    };
    const svc = new SnapshotService(prisma as never);
    const out = await svc.list('b1');
    expect(out[0]!.createdByName).toBeNull();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('SnapshotService.save version allocation', () => {
  function clash(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
  }

  it('retries with a fresh version when another writer took the number', async () => {
    const prisma = { boardSnapshot: {
      findFirst: jest.fn().mockResolvedValueOnce({ docVersion: 4 }).mockResolvedValueOnce({ docVersion: 5 }),
      create: jest.fn().mockRejectedValueOnce(clash()).mockResolvedValueOnce({}),
    }, board: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const svc = new SnapshotService(prisma as never);
    await expect(svc.save('b1', new Uint8Array([1]))).resolves.toBe(6);
    expect(prisma.boardSnapshot.create).toHaveBeenCalledTimes(2);
  });

  it('gives up after repeated clashes instead of looping forever', async () => {
    const prisma = { boardSnapshot: {
      findFirst: jest.fn().mockResolvedValue({ docVersion: 1 }),
      create: jest.fn().mockRejectedValue(clash()),
    } };
    const svc = new SnapshotService(prisma as never);
    await expect(svc.save('b1', new Uint8Array([1]))).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('does not retry unrelated errors', async () => {
    const prisma = { boardSnapshot: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue(new Error('db down')),
    } };
    const svc = new SnapshotService(prisma as never);
    await expect(svc.save('b1', new Uint8Array([1]))).rejects.toThrow('db down');
    expect(prisma.boardSnapshot.create).toHaveBeenCalledTimes(1);
  });

  it('records the given reason (restore snapshots share the allocator)', async () => {
    const prisma = { boardSnapshot: {
      findFirst: jest.fn().mockResolvedValue({ docVersion: 5 }),
      create: jest.fn().mockResolvedValue({}),
    }, board: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const svc = new SnapshotService(prisma as never);
    await expect(svc.save('b1', new Uint8Array([7]), 'u1', 'restore')).resolves.toBe(6);
    expect(prisma.boardSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ docVersion: 6, reason: 'restore', createdBy: 'u1' }),
    });
  });
});

describe('selectSnapshotsToPrune (retention thinning)', () => {
  const NOW = new Date('2026-09-30T12:00:00.000Z');
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  let seq = 0;
  function row(ageMs: number, reason: 'autosave' | 'restore' | 'manual' = 'autosave'): PruneCandidate {
    seq += 1;
    return { id: `s${seq}`, docVersion: seq, reason, createdAt: new Date(NOW.getTime() - ageMs) };
  }

  it('keeps everything from the last 24 hours', () => {
    const rows = [row(23 * HOUR), row(23 * HOUR + 1), row(1000)];
    expect(selectSnapshotsToPrune(rows, NOW, 999)).toEqual([]);
  });

  it('keeps only the newest autosave per hour between 24h and 30d', () => {
    // Three saves in one clock hour two days ago, one in the next hour.
    const base = Math.floor((NOW.getTime() - 2 * DAY) / HOUR) * HOUR;
    const at = (ms: number): PruneCandidate => row(NOW.getTime() - (base + ms));
    const older = at(5 * 60_000);
    const middle = at(20 * 60_000);
    const newest = at(50 * 60_000);
    const nextHour = at(HOUR + 60_000);
    const doomed = selectSnapshotsToPrune([older, middle, newest, nextHour], NOW, 999);
    expect(doomed.sort()).toEqual([older.id, middle.id].sort());
  });

  it('keeps only the newest autosave per day beyond 30 days', () => {
    const dayStart = Math.floor((NOW.getTime() - 40 * DAY) / DAY) * DAY;
    const at = (ms: number): PruneCandidate => row(NOW.getTime() - (dayStart + ms));
    const morning = at(2 * HOUR);
    const noon = at(12 * HOUR);
    const night = at(23 * HOUR);
    expect(selectSnapshotsToPrune([morning, noon, night], NOW, 999).sort()).toEqual([morning.id, noon.id].sort());
  });

  it('never prunes restore or manual snapshots, and they do not take a bucket slot', () => {
    const dayStart = Math.floor((NOW.getTime() - 40 * DAY) / DAY) * DAY;
    const at = (ms: number, reason: 'autosave' | 'restore' | 'manual'): PruneCandidate =>
      row(NOW.getTime() - (dayStart + ms), reason);
    const auto1 = at(HOUR, 'autosave');
    const manual = at(2 * HOUR, 'manual');
    const auto2 = at(3 * HOUR, 'autosave');
    const restore = at(4 * HOUR, 'restore');
    expect(selectSnapshotsToPrune([auto1, manual, auto2, restore], NOW, 999)).toEqual([auto1.id]);
  });

  it("never prunes the board's latest snapshot, even when it is old", () => {
    const dayStart = Math.floor((NOW.getTime() - 40 * DAY) / DAY) * DAY;
    const a = row(NOW.getTime() - (dayStart + HOUR));
    const b = row(NOW.getTime() - (dayStart + 2 * HOUR));
    // `a` is (artificially) the highest version: it survives, and so does b as its bucket's newest.
    expect(selectSnapshotsToPrune([a, b], NOW, a.docVersion)).toEqual([]);
  });
});

describe('SnapshotService.pruneHistory', () => {
  it('thins each board with bounded work and only deletes autosaves that are not the latest', async () => {
    const NOW = new Date('2026-09-30T12:00:00.000Z');
    const DAY = 24 * 60 * 60 * 1000;
    const old = (hoursIntoDay: number) => new Date(Math.floor((NOW.getTime() - 40 * DAY) / DAY) * DAY + hoursIntoDay * 3_600_000);
    const prisma = {
      boardSnapshot: {
        groupBy: jest.fn().mockResolvedValue([{ boardId: 'b1' }]),
        findFirst: jest.fn().mockResolvedValue({ docVersion: 10 }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'x1', docVersion: 1, reason: 'autosave', createdAt: old(1) },
          { id: 'x2', docVersion: 2, reason: 'autosave', createdAt: old(2) },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const svc = new SnapshotService(prisma as never);
    await expect(svc.pruneHistory(NOW, { maxBoards: 5, maxRowsPerBoard: 7 })).resolves.toEqual({ boards: 1, deleted: 1 });
    expect(prisma.boardSnapshot.groupBy).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    expect(prisma.boardSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 7 }));
    expect(prisma.boardSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { boardId: 'b1', id: { in: ['x1'] }, reason: 'autosave', docVersion: { not: 10 } },
    });
  });

  it('schedules an unref-ed sweep and clears it on shutdown', () => {
    jest.useFakeTimers();
    try {
      const prisma = { boardSnapshot: { groupBy: jest.fn().mockResolvedValue([]) } };
      const svc = new SnapshotService(prisma as never);
      svc.onModuleInit();
      expect(jest.getTimerCount()).toBeGreaterThan(0);
      svc.onModuleDestroy();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('logs and swallows a failed sweep instead of crashing the process', async () => {
    const prisma = { boardSnapshot: { groupBy: jest.fn().mockRejectedValue(new Error('db down')) } };
    const svc = new SnapshotService(prisma as never);
    await expect(svc.pruneSafely()).resolves.toBeUndefined();
  });
});
