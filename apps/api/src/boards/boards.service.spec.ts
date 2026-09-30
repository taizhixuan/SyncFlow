import { BoardsService } from './boards.service';

describe('BoardsService.getMemberRole', () => {
  it('returns the role for a member of a live board', async () => {
    const prisma = {
      board: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
      boardMember: { findUnique: jest.fn().mockResolvedValue({ role: 'editor' }) },
    };
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, {} as never);
    expect(await svc.getMemberRole('b1', 'u1')).toBe('editor');
  });

  it('returns null for a non-member', async () => {
    const prisma = {
      board: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
      boardMember: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, {} as never);
    expect(await svc.getMemberRole('b1', 'u1')).toBeNull();
  });

  it('returns null for a missing/deleted board', async () => {
    const prisma = {
      board: { findFirst: jest.fn().mockResolvedValue(null) },
      boardMember: { findUnique: jest.fn() },
    };
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, {} as never);
    expect(await svc.getMemberRole('b1', 'u1')).toBeNull();
  });
});

describe('BoardsService access notifications', () => {
  function makePrisma() {
    const prisma = {
      board: {
        findUnique: jest.fn().mockResolvedValue({ id: 'b1', ownerId: 'owner' }),
        update: jest.fn().mockResolvedValue({}),
      },
      boardMember: {
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
      boardInvite: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2', email: 'u2@t.app' }) },
      $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
    };
    return prisma;
  }

  function makeService(prisma = makePrisma()) {
    const access = { publish: jest.fn() };
    const users = { findByEmail: jest.fn().mockResolvedValue({ id: 'u2', email: 'u2@t.app' }) };
    const svc = new BoardsService(prisma as never, users as never, access as never, {} as never);
    return { svc, access, prisma };
  }

  it('announces a role change so live sockets adopt the new role', async () => {
    const { svc, access } = makeService();
    await svc.updateMemberRole('b1', 'u2', 'viewer');
    expect(access.publish).toHaveBeenCalledWith({ boardId: 'b1', userId: 'u2' });
  });

  it("announces a removal so the member's live sockets are dropped", async () => {
    const { svc, access } = makeService();
    await svc.removeMember('b1', 'u2');
    expect(access.publish).toHaveBeenCalledWith({ boardId: 'b1', userId: 'u2' });
  });

  it("revokes reusable share links and the member's pending email invites on removal", async () => {
    const { svc, prisma } = makeService();
    await svc.removeMember('b1', 'u2');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.boardInvite.deleteMany).toHaveBeenCalledWith({
      where: {
        boardId: 'b1',
        OR: [{ kind: 'share_link' }, { kind: 'email', email: 'u2@t.app', acceptedAt: null }],
      },
    });
  });

  it('announces a board deletion to every member (userId null)', async () => {
    const { svc, access } = makeService();
    await svc.softDelete('b1');
    expect(access.publish).toHaveBeenCalledWith({ boardId: 'b1', userId: null });
  });

  it('announces a role change made through addMember on an existing member', async () => {
    const { svc, access } = makeService();
    await svc.addMember('b1', 'u2@t.app', 'editor');
    expect(access.publish).toHaveBeenCalledWith({ boardId: 'b1', userId: 'u2' });
  });

  it('does not announce anything when the change is rejected', async () => {
    const { svc, access } = makeService();
    await expect(svc.removeMember('b1', 'owner')).rejects.toThrow();
    expect(access.publish).not.toHaveBeenCalled();
  });
});

describe('BoardsService.duplicate', () => {
  function makeDuplicate(live: Uint8Array | null) {
    const created: Array<{ data: Record<string, unknown> }> = [];
    const tx = {
      board: {
        findFirst: jest.fn().mockResolvedValue({ id: 'b1', title: 'Plan' }),
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          created.push(args);
          return {
            id: 'b2', title: 'Plan (copy)', ownerId: 'u1', thumbnailUrl: null, isPublic: false,
            createdAt: new Date(), updatedAt: new Date(), _count: { members: 1 },
          };
        }),
      },
      boardSnapshot: { findFirst: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
    const liveState = { collect: jest.fn(async () => live) };
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, liveState as never);
    return { svc, created, liveState, tx };
  }

  it('copies the merged live state (unsaved edits included), not only the latest snapshot', async () => {
    const live = new Uint8Array([1, 2, 3]);
    const { svc, created, liveState, tx } = makeDuplicate(live);
    await svc.duplicate('u1', 'b1');
    expect(liveState.collect).toHaveBeenCalledWith('b1');
    expect(tx.boardSnapshot.findFirst).not.toHaveBeenCalled();
    const snapshots = created[0]!.data.snapshots as { create: { yjsState: Buffer; docVersion: number } };
    expect(Array.from(snapshots.create.yjsState)).toEqual([1, 2, 3]);
    expect(snapshots.create.docVersion).toBe(1);
  });

  it('creates no snapshot for an empty board', async () => {
    const { svc, created } = makeDuplicate(null);
    await svc.duplicate('u1', 'b1');
    expect(created[0]!.data.snapshots).toBeUndefined();
  });
});
