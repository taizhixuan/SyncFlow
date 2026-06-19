import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import type { BoardInviteSummary, InviteCreated, InvitePreview } from '@syncflow/shared';

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
        email: kind === 'email' ? email : undefined,
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
    const invite = await this.prisma.boardInvite.findUnique({
      where: { tokenHash },
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
    const invite = await this.prisma.boardInvite.findUnique({
      where: { tokenHash },
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
      // Require exact email match unconditionally: a null/empty stored email also
      // rejects, preventing any logged-in user from accepting a corrupted invite.
      if (invite.email !== userEmail) {
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

    await this.prisma.boardMember.create({
      data: {
        boardId: invite.boardId,
        userId,
        role: invite.role,
        acceptedAt: new Date(),
      },
    });

    // Mark email invite as used (single-use)
    if (invite.kind === 'email') {
      await this.prisma.boardInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    }

    return { boardId: invite.boardId, role: invite.role };
  }

  async listInvites(boardId: string): Promise<BoardInviteSummary[]> {
    const invites = await this.prisma.boardInvite.findMany({
      where: { boardId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });

    return invites.map((inv) => ({
      id: inv.id,
      kind: inv.kind as 'email' | 'share_link',
      email: inv.email ?? undefined,
      role: inv.role as 'owner' | 'editor' | 'viewer',
      expiresAt: inv.expiresAt.toISOString(),
      acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : undefined,
    }));
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
