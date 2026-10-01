import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { TokenService } from '../src/auth/token.service';
import { BoardPurgeService } from '../src/boards/board-purge.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';

const PREFIX = '/api/v1';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Board purge (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  // CI has no MinIO, so the S3 side is stubbed; its behaviour is unit-tested.
  const deletePrefix = jest.fn<Promise<number>, [string]>();

  let token: string;
  let ownerId: string;
  let editorId: string;

  async function seedUser(email: string): Promise<{ id: string; token: string }> {
    const user = await prisma.user.create({
      data: {
        email,
        displayName: email.split('@')[0] ?? email,
        color: '#3B5BFF',
        passwordHash: 'x',
      },
    });
    return { id: user.id, token: app.get(TokenService).signAccessToken({ sub: user.id, email }) };
  }

  /** A board with an owner + editor membership, a snapshot and a pending invite. */
  async function seedBoard(title: string, createdBy: string): Promise<string> {
    const res = await http
      .post(`${PREFIX}/boards`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ title })
      .expect(201);
    const boardId = res.body.id as string;
    await prisma.boardMember.create({ data: { boardId, userId: editorId, role: 'editor' } });
    await prisma.boardSnapshot.create({
      data: { boardId, yjsState: Buffer.from([0, 0]), docVersion: 1 },
    });
    await prisma.boardInvite.create({
      data: {
        boardId,
        tokenHash: randomBytes(16).toString('hex'),
        role: 'viewer',
        kind: 'share_link',
        expiresAt: new Date(Date.now() + DAY_MS),
        createdBy,
      },
    });
    return boardId;
  }

  async function softDelete(boardId: string, daysAgo: number): Promise<void> {
    await http
      .delete(`${PREFIX}/boards/${boardId}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect((res) => expect(res.status).toBeLessThan(300));
    await prisma.board.update({
      where: { id: boardId },
      data: { deletedAt: new Date(Date.now() - daysAgo * DAY_MS) },
    });
  }

  async function dependents(boardId: string): Promise<number[]> {
    return Promise.all([
      prisma.boardMember.count({ where: { boardId } }),
      prisma.boardSnapshot.count({ where: { boardId } }),
      prisma.boardInvite.count({ where: { boardId } }),
    ]);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue({ deletePrefix })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "users","boards","board_members","board_snapshots","board_invites","refresh_tokens" RESTART IDENTITY CASCADE',
    );
    http = request(app.getHttpServer());
    const owner = await seedUser('purge-owner@syncflow.app');
    token = owner.token;
    ownerId = owner.id;
    editorId = (await seedUser('purge-editor@syncflow.app')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('hard-deletes only boards soft-deleted past retention, with their dependents and assets', async () => {
    const expired = await seedBoard('Expired', ownerId);
    const recent = await seedBoard('Recently deleted', ownerId);
    const live = await seedBoard('Live', ownerId);
    await softDelete(expired, 40);
    await softDelete(recent, 1);
    deletePrefix.mockResolvedValue(3);

    await expect(app.get(BoardPurgeService).purgeExpired()).resolves.toEqual({
      purged: 1,
      failed: 0,
    });

    expect(deletePrefix).toHaveBeenCalledTimes(1);
    expect(deletePrefix).toHaveBeenCalledWith(`boards/${expired}/`);
    expect(await prisma.board.findUnique({ where: { id: expired } })).toBeNull();
    expect(await dependents(expired)).toEqual([0, 0, 0]);

    for (const kept of [recent, live]) {
      expect(await prisma.board.findUnique({ where: { id: kept } })).not.toBeNull();
      expect(await dependents(kept)).toEqual([2, 1, 1]);
    }
    expect(await prisma.user.count()).toBe(2);
  });

  it('keeps an expired board when its assets cannot be deleted, then purges it on retry', async () => {
    const board = await seedBoard('Stubborn', ownerId);
    await softDelete(board, 31);
    const service = app.get(BoardPurgeService);

    deletePrefix.mockReset().mockRejectedValueOnce(new Error('S3 unavailable'));
    await expect(service.purgeExpired()).resolves.toEqual({ purged: 0, failed: 1 });
    expect(await prisma.board.findUnique({ where: { id: board } })).not.toBeNull();
    expect(await dependents(board)).toEqual([2, 1, 1]);

    deletePrefix.mockResolvedValue(0);
    await expect(service.purgeExpired()).resolves.toEqual({ purged: 1, failed: 0 });
    expect(await prisma.board.findUnique({ where: { id: board } })).toBeNull();
  });
});
