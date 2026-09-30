import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  BoardInviteSummary,
  InviteCreated,
  InvitePreview,
  Paginated,
  PaginationQuery,
} from '@syncflow/shared';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { decodeCursor, pageLimit, toPage } from '../boards/pagination';

/** Emails are stored lowercased (UsersService); invites must compare the same way. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async createInvite(
    boardId: string,
    createdBy: string,
    kind: 'email' | 'share_link',
    role: 'editor' | 'viewer',
    email: string | undefined,
    expiresInHours: number = 168,
  ): Promise<InviteCreated> {
    if (kind === 'email' && !email) {
      throw new BadRequestException('email is required for email invites');
    }

    const { token, tokenHash } = this.tokenService.generateRefreshToken();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await this.prisma.boardInvite.create({
      data: {
        boardId,
        email: kind === 'email' && email ? normalizeEmail(email) : undefined,
        tokenHash,
        role,
        kind,
        expiresAt,
        createdBy,
      },
    });

    const webOrigins = this.config.get('webOrigins', { infer: true });
    const webOrigin = webOrigins[0] ?? 'http://localhost:5173';
    const inviteUrl = `${webOrigin}/invite/${token}`;

    return { token, inviteUrl, role, kind, expiresAt: expiresAt.toISOString() };
  }

  async previewInvite(token: string): Promise<InvitePreview> {
    const tokenHash = this.tokenService.hashRefreshToken(token);
    const invite = await this.prisma.boardInvite.findFirst({
      // A deleted board's invites must not advertise it or let anyone join.
      where: { tokenHash, board: { deletedAt: null } },
      include: {
        board: {
          include: {
            owner: { select: { displayName: true } },
          },
        },
      },
    });

    if (!invite) {
      return { valid: false };
    }

    if (invite.expiresAt < new Date()) {
      return { valid: false, expired: true };
    }

    return {
      valid: true,
      boardTitle: invite.board.title,
      role: invite.role as 'owner' | 'editor' | 'viewer',
      inviterName: invite.board.owner.displayName,
      kind: invite.kind as 'email' | 'share_link',
    };
  }

  async acceptInvite(token: string, userId: string, userEmail: string): Promise<{ boardId: string; role: string }> {
    const tokenHash = this.tokenService.hashRefreshToken(token);
    const invite = await this.prisma.boardInvite.findFirst({
      where: { tokenHash, board: { deletedAt: null } },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.expiresAt < new Date()) {
      throw new GoneException('Invite has expired');
    }

    if (invite.kind === 'email') {
      if (invite.acceptedAt) {
        throw new GoneException('Invite has already been used');
      }
      // Require an exact (normalized) email match unconditionally: a null/empty
      // stored email also rejects, so no logged-in user can accept a corrupted invite.
      if (!invite.email || normalizeEmail(invite.email) !== normalizeEmail(userEmail)) {
        throw new ForbiddenException('This invite is for a different email address');
      }
    }

    // Check if user is already a member — never downgrade an owner
    const existing = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: invite.boardId, userId } },
    });

    if (existing) {
      // Idempotent: already a member — return current role
      return { boardId: invite.boardId, role: existing.role };
    }

    if (invite.kind === 'email') {
      // Consume the single-use invite and add the member atomically: the
      // conditional update is the claim, so concurrent accepts can't both win.
      try {
        await this.prisma.$transaction(async (tx) => {
          const claim = await tx.boardInvite.updateMany({
            where: { id: invite.id, acceptedAt: null },
            data: { acceptedAt: new Date() },
          });
          if (claim.count === 0) {
            throw new GoneException('Invite has already been used');
          }
          await tx.boardMember.create({
            data: { boardId: invite.boardId, userId, role: invite.role, acceptedAt: new Date() },
          });
        });
      } catch (err) {
        // Joined by another route meanwhile: the rollback leaves the invite unused.
        if (!isUniqueViolation(err)) throw err;
        return this.currentMembership(invite.boardId, userId, invite.role);
      }
      return { boardId: invite.boardId, role: invite.role };
    }

    try {
      await this.prisma.boardMember.create({
        data: { boardId: invite.boardId, userId, role: invite.role, acceptedAt: new Date() },
      });
    } catch (err) {
      // A concurrent accept (double click, two tabs) created the membership
      // first; that is success, not a conflict.
      if (!isUniqueViolation(err)) throw err;
      return this.currentMembership(invite.boardId, userId, invite.role);
    }

    return { boardId: invite.boardId, role: invite.role };
  }

  private async currentMembership(
    boardId: string,
    userId: string,
    fallbackRole: string,
  ): Promise<{ boardId: string; role: string }> {
    const member = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    return { boardId, role: member?.role ?? fallbackRole };
  }

  /** Unexpired invites, newest first (id breaks ties). */
  async listInvites(boardId: string, query: PaginationQuery = {}): Promise<Paginated<BoardInviteSummary>> {
    const limit = pageLimit(query.limit);
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const invites = await this.prisma.boardInvite.findMany({
      where: {
        boardId,
        expiresAt: { gt: new Date() },
        ...(after && {
          OR: [{ createdAt: { lt: after.at } }, { createdAt: after.at, id: { lt: after.id } }],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return toPage(
      invites,
      limit,
      (inv) => ({ at: inv.createdAt, id: inv.id }),
      (inv) => ({
        id: inv.id,
        kind: inv.kind,
        email: inv.email ?? undefined,
        role: inv.role,
        expiresAt: inv.expiresAt.toISOString(),
        acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : undefined,
      }),
    );
  }

  async revokeInvite(boardId: string, inviteId: string): Promise<void> {
    const invite = await this.prisma.boardInvite.findFirst({
      where: { id: inviteId, boardId },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    await this.prisma.boardInvite.delete({ where: { id: inviteId } });
  }
}
