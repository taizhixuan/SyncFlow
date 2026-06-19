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
