import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { InvitesService } from './invites.service';

// Minimal stub types that satisfy the mocked Prisma calls used in acceptInvite
type InviteRow = {
  id: string;
  boardId: string;
  kind: string;
  email: string | null;
  role: string;
  expiresAt: Date;
  acceptedAt: Date | null;
};

function makePrisma(invite: InviteRow | null, existingMember: { role: string } | null = null) {
  const prisma = {
    boardInvite: {
      findFirst: jest.fn().mockResolvedValue(invite),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    boardMember: {
      findUnique: jest.fn().mockResolvedValue(existingMember),
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
  return prisma;
}

function makeTokenService(hash = 'some-hash') {
  return { hashRefreshToken: jest.fn().mockReturnValue(hash) };
}

function makeConfig() {
  return { get: jest.fn().mockReturnValue(['http://localhost:5173']) };
}

function buildService(prisma: ReturnType<typeof makePrisma>) {
  return new InvitesService(
    prisma as never,
    makeTokenService() as never,
    makeConfig() as never,
  );
}

const FUTURE = new Date(Date.now() + 60_000);
const USER_EMAIL = 'user@example.com';

describe('InvitesService.acceptInvite — email-kind security', () => {
  it('rejects when invite.email is null (corrupted record) — defense-in-depth', async () => {
    const invite: InviteRow = {
      id: 'inv1',
      boardId: 'b1',
      kind: 'email',
      email: null, // corrupted: email-kind invite with no stored email
      role: 'editor',
      expiresAt: FUTURE,
      acceptedAt: null,
    };
    const svc = buildService(makePrisma(invite));
    await expect(svc.acceptInvite('tok', 'u1', USER_EMAIL)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when invite.email is an empty string', async () => {
    const invite: InviteRow = {
      id: 'inv2',
      boardId: 'b1',
      kind: 'email',
      email: '',
      role: 'editor',
      expiresAt: FUTURE,
      acceptedAt: null,
    };
    const svc = buildService(makePrisma(invite));
    await expect(svc.acceptInvite('tok', 'u1', USER_EMAIL)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when invite.email does not match the accepting user email', async () => {
    const invite: InviteRow = {
      id: 'inv3',
      boardId: 'b1',
      kind: 'email',
      email: 'other@example.com',
      role: 'viewer',
      expiresAt: FUTURE,
      acceptedAt: null,
    };
    const svc = buildService(makePrisma(invite));
    await expect(svc.acceptInvite('tok', 'u1', USER_EMAIL)).rejects.toThrow(ForbiddenException);
  });

  it('allows accept when invite.email exactly matches the accepting user email', async () => {
    const invite: InviteRow = {
      id: 'inv4',
      boardId: 'b1',
      kind: 'email',
      email: USER_EMAIL,
      role: 'viewer',
      expiresAt: FUTURE,
      acceptedAt: null,
    };
    const svc = buildService(makePrisma(invite));
    const result = await svc.acceptInvite('tok', 'u1', USER_EMAIL);
    expect(result.boardId).toBe('b1');
    expect(result.role).toBe('viewer');
  });

  it('matches emails case-insensitively (users are stored lowercased)', async () => {
    const invite: InviteRow = {
      id: 'inv7',
      boardId: 'b1',
      kind: 'email',
      email: 'User@Example.COM',
      role: 'viewer',
      expiresAt: FUTURE,
      acceptedAt: null,
    };
    const svc = buildService(makePrisma(invite));
    await expect(svc.acceptInvite('tok', 'u1', USER_EMAIL)).resolves.toEqual({ boardId: 'b1', role: 'viewer' });
  });

  it('throws Gone when a concurrent accept consumed the invite first', async () => {
    const invite: InviteRow = {
      id: 'inv8',
      boardId: 'b1',
      kind: 'email',
      email: USER_EMAIL,
      role: 'editor',
      expiresAt: FUTURE,
      acceptedAt: null,
    };
    const prisma = makePrisma(invite);
    prisma.boardInvite.updateMany.mockResolvedValue({ count: 0 });
    await expect(buildService(prisma).acceptInvite('tok', 'u1', USER_EMAIL)).rejects.toThrow(GoneException);
    expect(prisma.boardMember.create).not.toHaveBeenCalled();
  });

  it('throws Gone when email-kind invite was already accepted', async () => {
    const invite: InviteRow = {
      id: 'inv5',
      boardId: 'b1',
      kind: 'email',
      email: USER_EMAIL,
      role: 'editor',
      expiresAt: FUTURE,
      acceptedAt: new Date(),
    };
    const svc = buildService(makePrisma(invite));
    await expect(svc.acceptInvite('tok', 'u1', USER_EMAIL)).rejects.toThrow(GoneException);
  });

  it('throws NotFound when invite token is unknown', async () => {
    const svc = buildService(makePrisma(null));
    await expect(svc.acceptInvite('tok', 'u1', USER_EMAIL)).rejects.toThrow(NotFoundException);
  });

  it('share_link invite is accepted by any logged-in user regardless of email', async () => {
    const invite: InviteRow = {
      id: 'inv6',
      boardId: 'b1',
      kind: 'share_link',
      email: null, // share_link has no email
      role: 'editor',
      expiresAt: FUTURE,
      acceptedAt: null,
    };
    const svc = buildService(makePrisma(invite));
    // Any user email should be fine for share_link
    const result = await svc.acceptInvite('tok', 'u1', 'anyone@example.com');
    expect(result.boardId).toBe('b1');
    expect(result.role).toBe('editor');
  });
});
