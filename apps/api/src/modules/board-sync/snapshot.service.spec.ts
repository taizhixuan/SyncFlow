import { SnapshotService, nextDocVersion } from './snapshot.service';

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
    const prisma = { boardSnapshot: { findMany: jest.fn().mockResolvedValue([
      { docVersion: 2, reason: 'autosave', createdBy: null, createdAt: new Date('2026-01-02') },
      { docVersion: 1, reason: 'manual', createdBy: 'u1', createdAt: new Date('2026-01-01') },
    ]) } };
    const svc = new SnapshotService(prisma as never);
    const out = await svc.list('b1');
    expect(out[0]!.docVersion).toBe(2);
    expect(out[1]!.reason).toBe('manual');
    expect(typeof out[0]!.createdAt).toBe('string');
  });
});

describe('SnapshotService.restoreVersion', () => {
  it('writes the chosen state as a new restore snapshot and returns its bytes', async () => {
    const created: unknown[] = [];
    const prisma = { boardSnapshot: {
      findUnique: jest.fn().mockResolvedValue({ yjsState: Buffer.from([7, 7]) }), // the version to restore
      findFirst: jest.fn().mockResolvedValue({ docVersion: 5 }),                  // latest for nextDocVersion
      create: jest.fn().mockImplementation((a: unknown) => { created.push(a); return Promise.resolve({}); }),
    } };
    const svc = new SnapshotService(prisma as never);
    const out = await svc.restoreVersion('b1', 3, 'u1');
    expect(Array.from(out!)).toEqual([7, 7]);
    const arg = created[0] as { data: { docVersion: number; reason: string; createdBy: string } };
    expect(arg.data.docVersion).toBe(6);
    expect(arg.data.reason).toBe('restore');
    expect(arg.data.createdBy).toBe('u1');
  });
  it('returns null when the version is missing', async () => {
    const prisma = { boardSnapshot: { findUnique: jest.fn().mockResolvedValue(null) } };
    const svc = new SnapshotService(prisma as never);
    expect(await svc.restoreVersion('b1', 99)).toBeNull();
  });
});
