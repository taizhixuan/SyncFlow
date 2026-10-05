import { UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { UsersService } from '../users/users.service';
import { AuthService, REFRESH_REUSE_GRACE_MS } from './auth.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';

interface Row {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  revoked: boolean;
  rotatedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

type Where = Record<string, unknown>;

/** Just enough of Prisma's `where` semantics for the shapes AuthService uses. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key as keyof Row];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      const op = expected as { not?: unknown; gte?: Date };
      if ('not' in op) return actual !== op.not;
      if (op.gte) return actual instanceof Date && actual.getTime() >= op.gte.getTime();
    }
    return actual === expected;
  });
}

/** An in-memory refresh_tokens table behind the slice of PrismaService AuthService touches. */
function fakePrisma(rows: Row[]): PrismaService {
  let nextId = rows.length;
  const first = async ({ where }: { where: Where }): Promise<Row | null> =>
    rows.find((r) => matches(r, where)) ?? null;
  const refreshToken = {
    findUnique: jest.fn(first),
    findFirst: jest.fn(first),
    updateMany: jest.fn(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const row of hit) Object.assign(row, data);
      return { count: hit.length };
    }),
    create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
      nextId += 1;
      const row: Row = {
        id: `t${nextId}`,
        userId: data.userId!,
        familyId: data.familyId!,
        tokenHash: data.tokenHash!,
        revoked: false,
        rotatedAt: null,
        expiresAt: data.expiresAt!,
        createdAt: new Date(),
      };
      rows.push(row);
      return row;
    }),
  };
  const prisma = {
    refreshToken,
    $transaction: (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma),
  };
  return prisma as unknown as PrismaService;
}

const USER = { id: 'u1', email: 'maya@syncflow.app' } as User;

function serviceWith(rows: Row[]): { auth: AuthService; rows: Row[] } {
  let minted = 0;
  const tokens = {
    hashRefreshToken: (token: string) => `hash:${token}`,
    generateRefreshToken: () => {
      minted += 1;
      return { token: `new${minted}`, tokenHash: `hash:new${minted}` };
    },
    refreshTtlSeconds: 3600,
    accessTtlSeconds: 900,
    signAccessTokenWithId: () => ({ token: 'access', jti: 'jti', exp: 0 }),
    trackFamilyAccessToken: jest.fn().mockResolvedValue(undefined),
    revokeFamilyAccessTokens: jest.fn().mockResolvedValue(undefined),
  } as unknown as TokenService;
  const users = {
    findById: jest.fn().mockResolvedValue(USER),
    toPublic: (user: User) => ({ id: user.id }),
  } as unknown as UsersService;
  const auth = new AuthService(users, {} as PasswordService, tokens, fakePrisma(rows));
  return { auth, rows };
}

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    userId: USER.id,
    familyId: 'fam',
    tokenHash: `hash:${id}`,
    revoked: false,
    rotatedAt: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    ...overrides,
  };
}

const ago = (ms: number): Date => new Date(Date.now() - ms);

describe('AuthService.refresh — rotation and reuse grace', () => {
  it('stamps the spent token with when it was rotated', async () => {
    const { auth, rows } = serviceWith([row('r1')]);
    await auth.refresh('r1');
    const spent = rows.find((r) => r.id === 'r1')!;
    expect(spent.revoked).toBe(true);
    expect(spent.rotatedAt).toBeInstanceOf(Date);
    expect(Date.now() - spent.rotatedAt!.getTime()).toBeLessThan(1_000);
  });

  it('honours a token re-presented moments after its own rotation (two tabs racing)', async () => {
    const { auth, rows } = serviceWith([
      row('r1', { revoked: true, rotatedAt: ago(2_000) }),
      row('r2'),
    ]);
    const session = await auth.refresh('r1');
    expect(session.refreshToken).toBe('new1');
    expect(rows.filter((r) => r.familyId === 'fam' && !r.revoked)).toHaveLength(2);
  });

  it('treats a token spent long ago as theft, even right after its family rotated', async () => {
    const { auth, rows } = serviceWith([
      row('r1', { revoked: true, rotatedAt: ago(REFRESH_REUSE_GRACE_MS * 6) }),
      row('r2', { revoked: true, rotatedAt: ago(1_000) }),
      // Minted a second ago by the legitimate tab's rotation of r2.
      row('r3', { createdAt: ago(1_000) }),
    ]);
    await expect(auth.refresh('r1')).rejects.toThrow(UnauthorizedException);
    expect(rows.every((r) => r.revoked)).toBe(true);
  });

  it('gives no grace to a token revoked without being rotated (logout)', async () => {
    const { auth, rows } = serviceWith([
      row('r1', { revoked: true }),
      row('r2', { createdAt: ago(500) }),
    ]);
    await expect(auth.refresh('r1')).rejects.toThrow(UnauthorizedException);
    expect(rows.every((r) => r.revoked)).toBe(true);
  });

  it('gives no grace once the family is dead, however recent the rotation', async () => {
    const { auth } = serviceWith([
      row('r1', { revoked: true, rotatedAt: ago(1_000) }),
      row('r2', { revoked: true }),
    ]);
    await expect(auth.refresh('r1')).rejects.toThrow(UnauthorizedException);
  });
});
