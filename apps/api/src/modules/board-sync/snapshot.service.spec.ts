import { Prisma } from '@prisma/client';
import { SnapshotService, nextDocVersion, VERSION_LIST_LIMIT } from './snapshot.service';

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
    } };
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
    } };
    const svc = new SnapshotService(prisma as never);
    await expect(svc.save('b1', new Uint8Array([7]), 'u1', 'restore')).resolves.toBe(6);
    expect(prisma.boardSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ docVersion: 6, reason: 'restore', createdBy: 'u1' }),
    });
  });
});
