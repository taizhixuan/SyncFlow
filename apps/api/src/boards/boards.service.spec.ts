import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Y from 'yjs';
import { BoardsService } from './boards.service';

describe('BoardsService.getMemberRole', () => {
  it('returns the role for a member of a live board', async () => {
    const prisma = {
      board: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
      boardMember: { findUnique: jest.fn().mockResolvedValue({ role: 'editor' }) },
    };
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, {} as never, {} as never);
    expect(await svc.getMemberRole('b1', 'u1')).toBe('editor');
  });

  it('returns null for a non-member', async () => {
    const prisma = {
      board: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
      boardMember: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, {} as never, {} as never);
    expect(await svc.getMemberRole('b1', 'u1')).toBeNull();
  });

  it('returns null for a missing/deleted board', async () => {
    const prisma = {
      board: { findFirst: jest.fn().mockResolvedValue(null) },
      boardMember: { findUnique: jest.fn() },
    };
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, {} as never, {} as never);
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      boardInvite: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2', email: 'u2@t.app' }) },
      $transaction: jest.fn(),
    };
    // Interactive transactions run against the same mocks.
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    return prisma;
  }

  function makeService(prisma = makePrisma()) {
    const access = { publish: jest.fn() };
    const users = { findByEmail: jest.fn().mockResolvedValue({ id: 'u2', email: 'u2@t.app' }) };
    const svc = new BoardsService(prisma as never, users as never, access as never, {} as never, {} as never);
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
    const prisma = makePrisma();
    prisma.boardMember.deleteMany.mockResolvedValue({ count: 0 });
    prisma.boardMember.findUnique.mockResolvedValue({ role: 'owner' });
    const { svc, access } = makeService(prisma);
    await expect(svc.removeMember('b1', 'owner')).rejects.toThrow();
    expect(access.publish).not.toHaveBeenCalled();
  });
});

describe('BoardsService member changes vs. a concurrent ownership transfer', () => {
  // The guard on the write itself (role != owner) is what makes these safe: a
  // transfer committing between a separate owner check and the write would
  // otherwise leave the board's new owner demoted or removed.
  function makePrisma(count: number, membership: { role: string } | null) {
    const prisma = {
      board: { findUnique: jest.fn().mockResolvedValue({ id: 'b1', ownerId: 'someone-else' }) },
      boardMember: {
        updateMany: jest.fn().mockResolvedValue({ count }),
        deleteMany: jest.fn().mockResolvedValue({ count }),
        findUnique: jest.fn().mockResolvedValue(membership),
        update: jest.fn(),
        delete: jest.fn(),
      },
      boardInvite: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2', email: 'u2@t.app' }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    return prisma;
  }

  function makeService(prisma: ReturnType<typeof makePrisma>) {
    const access = { publish: jest.fn() };
    const svc = new BoardsService(prisma as never, {} as never, access as never, {} as never, {} as never);
    return { svc, access };
  }

  it('changes a role with one conditional write that can never touch the owner', async () => {
    const prisma = makePrisma(1, null);
    const { svc, access } = makeService(prisma);
    await svc.updateMemberRole('b1', 'u2', 'viewer');
    expect(prisma.boardMember.updateMany).toHaveBeenCalledWith({
      where: { boardId: 'b1', userId: 'u2', role: { not: 'owner' } },
      data: { role: 'viewer' },
    });
    expect(prisma.boardMember.update).not.toHaveBeenCalled();
    expect(access.publish).toHaveBeenCalledWith({ boardId: 'b1', userId: 'u2' });
  });

  it('refuses (403) to demote a member who became the owner meanwhile, and announces nothing', async () => {
    const { svc, access } = makeService(makePrisma(0, { role: 'owner' }));
    await expect(svc.updateMemberRole('b1', 'u2', 'viewer')).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.publish).not.toHaveBeenCalled();
  });

  it('404s a role change for someone who is not a member', async () => {
    const { svc } = makeService(makePrisma(0, null));
    await expect(svc.updateMemberRole('b1', 'u9', 'viewer')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes with one conditional delete inside the transaction that revokes re-entry invites', async () => {
    const prisma = makePrisma(1, null);
    const { svc, access } = makeService(prisma);
    await svc.removeMember('b1', 'u2');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.boardMember.deleteMany).toHaveBeenCalledWith({
      where: { boardId: 'b1', userId: 'u2', role: { not: 'owner' } },
    });
    expect(prisma.boardMember.delete).not.toHaveBeenCalled();
    expect(access.publish).toHaveBeenCalledWith({ boardId: 'b1', userId: 'u2' });
  });

  it('refuses (403) to remove a member who became the owner meanwhile, keeping the invites', async () => {
    const prisma = makePrisma(0, { role: 'owner' });
    const { svc, access } = makeService(prisma);
    await expect(svc.removeMember('b1', 'u2')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.boardInvite.deleteMany).not.toHaveBeenCalled();
    expect(access.publish).not.toHaveBeenCalled();
  });

  it('404s a removal of someone who is not a member', async () => {
    const prisma = makePrisma(0, null);
    const { svc } = makeService(prisma);
    await expect(svc.removeMember('b1', 'u9')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.boardInvite.deleteMany).not.toHaveBeenCalled();
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
    const svc = new BoardsService(prisma as never, users as never, { publish: jest.fn() } as never, {} as never, {} as never);
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
    const svc = new BoardsService(prisma as never, users as never, { publish: jest.fn() } as never, {} as never, {} as never);
    await expect(svc.addMember('b1', 'u2@t.app', 'editor')).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s for an unknown email', async () => {
    const users = { findByEmail: jest.fn().mockResolvedValue(null) };
    const svc = new BoardsService({} as never, users as never, { publish: jest.fn() } as never, {} as never, {} as never);
    await expect(svc.addMember('b1', 'x@t.app', 'editor')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BoardsService.transferOwnership', () => {
  function makeTransfer(opts: { claimed: number; target: unknown }) {
    const order: string[] = [];
    const tx = {
      board: {
        updateMany: jest.fn(async () => {
          order.push('claim');
          return { count: opts.claimed };
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'b1', title: 'T', ownerId: 'u2', thumbnailUrl: null, isPublic: false,
          createdAt: new Date(), updatedAt: new Date(), _count: { members: 2 },
        }),
      },
      boardMember: {
        updateMany: jest.fn(async () => {
          order.push('promote');
          return { count: opts.target ? 1 : 0 };
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
    const access = { publish: jest.fn() };
    const svc = new BoardsService(prisma as never, {} as never, access as never, {} as never, {} as never);
    return { svc, tx, access, order };
  }

  it('swaps roles and the board owner atomically, then announces both users', async () => {
    const { svc, tx, access } = makeTransfer({ claimed: 1, target: { role: 'viewer' } });
    const board = await svc.transferOwnership('b1', 'u1', 'u2');
    expect(tx.board.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', ownerId: 'u1', deletedAt: null },
      data: { ownerId: 'u2' },
    });
    expect(tx.boardMember.updateMany).toHaveBeenCalledWith({
      where: { boardId: 'b1', userId: 'u2' },
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

  it('checks the target is a member before pointing the board at them (a non-user is a 404, not an FK 500)', async () => {
    const { svc, tx, order } = makeTransfer({ claimed: 1, target: null });
    await expect(
      svc.transferOwnership('b1', 'u1', '99999999-9999-4999-8999-999999999999'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.board.updateMany).not.toHaveBeenCalled();
    expect(order).toEqual(['promote']);
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
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, {} as never, {} as never);
    const page = await svc.listForUser('u1', { limit: 1 });
    expect(prisma.board.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(page.items.map((b) => b.id)).toEqual([ids[0]]);
    expect(page.nextCursor).toEqual(expect.any(String));

    await svc.listForUser('u1', { limit: 1, cursor: page.nextCursor! });
    const where = (prisma.board.findMany.mock.calls[1]![0] as { where: Record<string, unknown> }).where;
    expect(where.OR).toEqual([{ updatedAt: { lt: at } }, { updatedAt: at, id: { lt: ids[0] } }]);
  });

  it('filters on the server by ownership and a case-insensitive title search', async () => {
    const prisma = { board: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, {} as never, {} as never);
    const whereOf = (call: number): Record<string, unknown> =>
      (prisma.board.findMany.mock.calls[call]![0] as { where: Record<string, unknown> }).where;

    await svc.listForUser('u1', { role: 'owned', q: '  Road ' });
    expect(whereOf(0)).toEqual({
      deletedAt: null,
      members: { some: { userId: 'u1', role: 'owner' } },
      title: { contains: 'Road', mode: 'insensitive' },
    });

    await svc.listForUser('u1', { role: 'shared' });
    expect(whereOf(1)).toEqual({
      deletedAt: null,
      members: { some: { userId: 'u1', role: { not: 'owner' } } },
    });

    await svc.listForUser('u1', { q: '   ' });
    expect(whereOf(2)).toEqual({ deletedAt: null, members: { some: { userId: 'u1' } } });
  });

  it('keeps keyset pagination working under a filter', async () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    const id = '00000000-0000-4000-8000-000000000003';
    const prisma = { board: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = new BoardsService(prisma as never, {} as never, { publish: jest.fn() } as never, {} as never, {} as never);
    const cursor = Buffer.from(JSON.stringify({ t: at.toISOString(), id })).toString('base64url');
    await svc.listForUser('u1', { role: 'shared', q: 'retro', cursor });
    const where = (prisma.board.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({
      title: { contains: 'retro', mode: 'insensitive' },
      OR: [{ updatedAt: { lt: at } }, { updatedAt: at, id: { lt: id } }],
    });
  });

  it('rejects a malformed cursor with 400', async () => {
    const svc = new BoardsService({} as never, {} as never, { publish: jest.fn() } as never, {} as never, {} as never);
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
    const storage = {
      copyBoardAsset: jest.fn<Promise<string | null>, [string, string, string]>(async () => null),
      deletePrefix: jest.fn(async () => 0),
    };
    const svc = new BoardsService(
      prisma as never,
      {} as never,
      { publish: jest.fn() } as never,
      liveState as never,
      storage as never,
    );
    return { svc, created, liveState, tx, storage };
  }

  const SOURCE = '11111111-1111-4111-8111-111111111111';
  const BASE = 'http://s3/bucket';

  function docWith(elements: Record<string, Record<string, unknown>>): Uint8Array {
    const doc = new Y.Doc();
    const map = doc.getMap<Y.Map<unknown>>('elements');
    for (const [id, fields] of Object.entries(elements)) {
      const inner = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(fields)) inner.set(k, v);
      map.set(id, inner);
    }
    return Y.encodeStateAsUpdate(doc);
  }

  function assetUrlsIn(state: Buffer): Record<string, unknown> {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(state));
    const out: Record<string, unknown> = {};
    doc.getMap<Y.Map<unknown>>('elements').forEach((inner, id) => {
      out[id] = inner.get('assetUrl');
    });
    return out;
  }

  function savedState(created: Array<{ data: Record<string, unknown> }>): Buffer {
    return (created[0]!.data.snapshots as { create: { yjsState: Buffer } }).create.yjsState;
  }

  it("gives the copy its own copies of the source board's images, so purging the source cannot break it", async () => {
    const live = docWith({
      a: { id: 'a', type: 'image', assetUrl: `${BASE}/boards/${SOURCE}/x-a.png` },
      // The same upload placed twice is copied once.
      b: { id: 'b', type: 'image', assetUrl: `${BASE}/boards/${SOURCE}/x-a.png` },
      c: { id: 'c', type: 'image', assetUrl: 'https://images.example.com/cat.png' },
      d: { id: 'd', type: 'rect' },
    });
    const { svc, created, storage } = makeDuplicate(live);
    storage.copyBoardAsset.mockImplementation(async (url: string, from: string, to: string) =>
      url.includes(`/boards/${from}/`) ? url.replace(`/boards/${from}/`, `/boards/${to}/`) : null,
    );

    await svc.duplicate('u1', SOURCE);

    const copyId = created[0]!.data.id as string;
    expect(copyId).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.copyBoardAsset).toHaveBeenCalledTimes(2);
    expect(storage.copyBoardAsset).toHaveBeenCalledWith(`${BASE}/boards/${SOURCE}/x-a.png`, SOURCE, copyId);
    expect(assetUrlsIn(savedState(created))).toEqual({
      a: `${BASE}/boards/${copyId}/x-a.png`,
      b: `${BASE}/boards/${copyId}/x-a.png`,
      c: 'https://images.example.com/cat.png',
      d: undefined,
    });
  });

  it('keeps the original URL when one image fails to copy, and still duplicates the board', async () => {
    const live = docWith({
      a: { id: 'a', type: 'image', assetUrl: `${BASE}/boards/${SOURCE}/x-a.png` },
      b: { id: 'b', type: 'image', assetUrl: `${BASE}/boards/${SOURCE}/x-b.png` },
    });
    const { svc, created, storage } = makeDuplicate(live);
    storage.copyBoardAsset.mockImplementation(async (url: string, from: string, to: string) => {
      if (url.endsWith('x-a.png')) throw new Error('NoSuchKey');
      return url.replace(`/boards/${from}/`, `/boards/${to}/`);
    });

    await expect(svc.duplicate('u1', SOURCE)).resolves.toMatchObject({ title: 'Plan (copy)' });

    const copyId = created[0]!.data.id as string;
    expect(assetUrlsIn(savedState(created))).toEqual({
      a: `${BASE}/boards/${SOURCE}/x-a.png`,
      b: `${BASE}/boards/${copyId}/x-b.png`,
    });
  });

  it("removes the copied images again when the copy's row cannot be written", async () => {
    const live = docWith({ a: { id: 'a', type: 'image', assetUrl: `${BASE}/boards/${SOURCE}/x-a.png` } });
    const { svc, tx, storage } = makeDuplicate(live);
    storage.copyBoardAsset.mockImplementation(async (url: string, from: string, to: string) =>
      url.replace(`/boards/${from}/`, `/boards/${to}/`),
    );
    tx.board.findFirst.mockResolvedValue(null);

    await expect(svc.duplicate('u1', SOURCE)).rejects.toBeInstanceOf(NotFoundException);
    const copyId = (storage.copyBoardAsset.mock.calls[0] as unknown[])[2] as string;
    expect(storage.deletePrefix).toHaveBeenCalledWith(`boards/${copyId}/`);
  });

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
