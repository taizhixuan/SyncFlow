import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  it("announces a self-leave so the leaver's live sockets are dropped", async () => {
    const prisma = makePrisma();
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const { svc, access } = makeService({ ...prisma, boardMember: { ...prisma.boardMember, deleteMany } } as never);
    await svc.leave('b1', 'u2');
    expect(deleteMany).toHaveBeenCalledWith({ where: { boardId: 'b1', userId: 'u2', role: { not: 'owner' } } });
    expect(access.publish).toHaveBeenCalledWith({ boardId: 'b1', userId: 'u2' });
    expect(prisma.boardInvite.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to let the owner leave (409) and announces nothing', async () => {
    const prisma = makePrisma();
    const boardMember = {
      ...prisma.boardMember,
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue({ role: 'owner' }),
    };
    const { svc, access } = makeService({ ...prisma, boardMember } as never);
    await expect(svc.leave('b1', 'owner')).rejects.toBeInstanceOf(ConflictException);
    expect(access.publish).not.toHaveBeenCalled();
  });

  it('does not announce anything when the change is rejected', async () => {
    const { svc, access } = makeService();
    await expect(svc.removeMember('b1', 'owner')).rejects.toThrow();
    expect(access.publish).not.toHaveBeenCalled();
  });
});

describe('BoardsService.addMember', () => {
  const user = { id: 'u2', email: 'u2@t.app', displayName: 'Two', color: '#fff' };

  it('creates the member and returns it in list-item shape', async () => {
    const acceptedAt = new Date('2026-01-01T00:00:00.000Z');
    const prisma = {
      boardMember: { create: jest.fn().mockResolvedValue({ userId: 'u2', role: 'viewer', acceptedAt, user }) },
    };
    const users = { findByEmail: jest.fn().mockResolvedValue(user) };
    const svc = new BoardsService(prisma as never, users as never, { publish: jest.fn() } as never, {} as never);
    await expect(svc.addMember('b1', 'u2@t.app', 'viewer')).resolves.toEqual({
      userId: 'u2',
      displayName: 'Two',
      email: 'u2@t.app',
      color: '#fff',
      role: 'viewer',
      acceptedAt: acceptedAt.toISOString(),
    });
  });

  it('maps an existing membership to 409 instead of silently changing the role', async () => {
    const clash = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
    const prisma = { boardMember: { create: jest.fn().mockRejectedValue(clash) } };
    const users = { findByEmail: jest.fn().mockResolvedValue(user) };
    const svc = new BoardsService(prisma as never, users as never, { publish: jest.fn() } as never, {} as never);
    await expect(svc.addMember('b1', 'u2@t.app', 'editor')).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s for an unknown email', async () => {
    const users = { findByEmail: jest.fn().mockResolvedValue(null) };
    const svc = new BoardsService({} as never, users as never, { publish: jest.fn() } as never, {} as never);
    await expect(svc.addMember('b1', 'x@t.app', 'editor')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BoardsService.transferOwnership', () => {
  function makeTransfer(opts: { claimed: number; target: unknown }) {
    const tx = {
      board: {
        updateMany: jest.fn().mockResolvedValue({ count: opts.claimed }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'b1', title: 'T', ownerId: 'u2', thumbnailUrl: null, isPublic: false,
          createdAt: new Date(), updatedAt: new Date(), _count: { members: 2 },
        }),
      },
      boardMember: {
        findUnique: jest.fn().mockResolvedValue(opts.target),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
    const access = { publish: jest.fn() };
    const svc = new BoardsService(prisma as never, {} as never, access as never, {} as never);
    return { svc, tx, access };
  }

  it('swaps roles and the board owner atomically, then announces both users', async () => {
    const { svc, tx, access } = makeTransfer({ claimed: 1, target: { role: 'viewer' } });
    const board = await svc.transferOwnership('b1', 'u1', 'u2');
    expect(tx.board.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', ownerId: 'u1', deletedAt: null },
      data: { ownerId: 'u2' },
    });
    expect(tx.boardMember.update).toHaveBeenCalledWith({
      where: { boardId_userId: { boardId: 'b1', userId: 'u2' } },
      data: { role: 'owner' },
    });
    expect(tx.boardMember.update).toHaveBeenCalledWith({
      where: { boardId_userId: { boardId: 'b1', userId: 'u1' } },
      data: { role: 'editor' },
    });
    expect(board).toMatchObject({ ownerId: 'u2', role: 'editor', memberCount: 2 });
    expect(access.publish).toHaveBeenCalledWith({ boardId: 'b1', userId: 'u1' });
    expect(access.publish).toHaveBeenCalledWith({ boardId: 'b1', userId: 'u2' });
  });

  it('rejects a transfer to yourself (400)', async () => {
    const { svc } = makeTransfer({ claimed: 1, target: {} });
    await expect(svc.transferOwnership('b1', 'u1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s for a non-member target and announces nothing', async () => {
    const { svc, access } = makeTransfer({ claimed: 1, target: null });
    await expect(svc.transferOwnership('b1', 'u1', 'u9')).rejects.toBeInstanceOf(NotFoundException);
    expect(access.publish).not.toHaveBeenCalled();
  });

  it('403s when the caller no longer owns the board (a concurrent transfer won)', async () => {
    const { svc } = makeTransfer({ claimed: 0, target: { role: 'viewer' } });
    await expect(svc.transferOwnership('b1', 'u1', 'u2')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('BoardsService pagination', () => {
  it('fetches one extra row and returns a cursor only when more rows exist', async () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    const row = (id: string) => ({
      id, title: id, ownerId: 'u1', thumbnailUrl: null, isPublic: false, createdAt: at, updatedAt: at,
      members: [{ role: 'owner' }], _count: { members: 1 },
    });
    const ids = ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002'];
    const prisma = { board: { findMany: jest.fn().mockResolvedValue(ids.map(row)) } };
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, {} as never);
    const page = await svc.listForUser('u1', { limit: 1 });
    expect(prisma.board.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(page.items.map((b) => b.id)).toEqual([ids[0]]);
    expect(page.nextCursor).toEqual(expect.any(String));

    await svc.listForUser('u1', { limit: 1, cursor: page.nextCursor! });
    const where = (prisma.board.findMany.mock.calls[1]![0] as { where: Record<string, unknown> }).where;
    expect(where.OR).toEqual([{ updatedAt: { lt: at } }, { updatedAt: at, id: { lt: ids[0] } }]);
  });

  it('rejects a malformed cursor with 400', async () => {
    const svc = new BoardsService({} as never, {} as never, { publish: jest.fn() } as never, {} as never);
    await expect(svc.listForUser('u1', { cursor: 'garbage' })).rejects.toBeInstanceOf(BadRequestException);
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
