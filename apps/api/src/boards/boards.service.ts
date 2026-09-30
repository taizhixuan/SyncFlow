import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Board, BoardMember, BoardRole } from '@syncflow/shared';
import type { Prisma, Board as PrismaBoard } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { BoardAccessEvents } from './board-access-events';
import { BoardLiveStatePort } from './board-live-state-port';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly access: BoardAccessEvents,
    private readonly liveState: BoardLiveStatePort,
  ) {}

  private toBoard(board: PrismaBoard, role: BoardRole, memberCount: number): Board {
    return {
      id: board.id,
      title: board.title,
      ownerId: board.ownerId,
      role,
      thumbnailUrl: board.thumbnailUrl,
      isPublic: board.isPublic,
      memberCount,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
    };
  }

  async create(userId: string, title?: string): Promise<Board> {
    const board = await this.prisma.board.create({
      data: {
        ownerId: userId,
        title: title ?? 'Untitled board',
        members: { create: { userId, role: 'owner' } },
      },
      include: { _count: { select: { members: true } } },
    });
    return this.toBoard(board, 'owner', board._count.members);
  }

  async listForUser(userId: string): Promise<{ items: Board[] }> {
    const memberships = await this.prisma.boardMember.findMany({
      where: { userId, board: { deletedAt: null } },
      include: { board: { include: { _count: { select: { members: true } } } } },
      orderBy: { board: { updatedAt: 'desc' } },
    });
    return {
      items: memberships.map((m) => this.toBoard(m.board, m.role, m.board._count.members)),
    };
  }

  async get(boardId: string, role: BoardRole): Promise<Board> {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, deletedAt: null },
      include: { _count: { select: { members: true } } },
    });
    if (!board) throw new NotFoundException('Board not found');
    return this.toBoard(board, role, board._count.members);
  }

  async rename(boardId: string, title: string): Promise<Board> {
    const board = await this.prisma.board.update({
      where: { id: boardId },
      data: { title },
      include: { _count: { select: { members: true } } },
    });
    return this.toBoard(board, 'owner', board._count.members);
  }

  async softDelete(boardId: string): Promise<void> {
    await this.prisma.board.update({ where: { id: boardId }, data: { deletedAt: new Date() } });
    this.access.publish({ boardId, userId: null });
  }

  /**
   * Copy a board, including its content: the merged live state (latest
   * snapshot + every instance's live room, so edits still inside a flush
   * debounce are included) becomes version 1 of the copy. It is collected
   * before the transaction so a cross-instance wait never holds a DB
   * transaction open. Board + membership + snapshot land in one transaction so
   * a failure never leaves an empty "(copy)" behind.
   */
  async duplicate(userId: string, boardId: string): Promise<Board> {
    const state = await this.liveState.collect(boardId);
    const copy = await this.prisma.$transaction(async (tx) => {
      const source = await tx.board.findFirst({ where: { id: boardId, deletedAt: null } });
      if (!source) throw new NotFoundException('Board not found');
      return tx.board.create({
        data: {
          ownerId: userId,
          title: `${source.title} (copy)`,
          members: { create: { userId, role: 'owner' } },
          ...(state && {
            snapshots: {
              create: { docVersion: 1, yjsState: Buffer.from(state), reason: 'manual', createdBy: userId },
            },
          }),
        },
        include: { _count: { select: { members: true } } },
      });
    });
    return this.toBoard(copy, 'owner', copy._count.members);
  }

  async listMembers(boardId: string): Promise<BoardMember[]> {
    const members = await this.prisma.boardMember.findMany({
      where: { boardId },
      include: { user: true },
      orderBy: { invitedAt: 'asc' },
    });
    return members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      email: m.user.email,
      color: m.user.color,
      role: m.role,
      acceptedAt: m.acceptedAt ? m.acceptedAt.toISOString() : null,
    }));
  }

  async addMember(boardId: string, email: string, role: 'editor' | 'viewer'): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) throw new NotFoundException('No user with that email');
    if (user.id === (await this.ownerId(boardId))) {
      throw new ConflictException('User is already the owner');
    }
    await this.prisma.boardMember.upsert({
      where: { boardId_userId: { boardId, userId: user.id } },
      create: { boardId, userId: user.id, role, acceptedAt: new Date() },
      update: { role },
    });
    // The upsert may have changed an existing member's role.
    this.access.publish({ boardId, userId: user.id });
  }

  async updateMemberRole(boardId: string, userId: string, role: 'editor' | 'viewer'): Promise<void> {
    await this.assertNotOwner(boardId, userId);
    await this.prisma.boardMember.update({
      where: { boardId_userId: { boardId, userId } },
      data: { role },
    });
    this.access.publish({ boardId, userId });
  }

  /**
   * Remove a member and every invite that would let them straight back in: the
   * board's reusable share links (anyone holding one, including the removed
   * member, could rejoin) and pending email invites addressed to them. Share
   * links are per board, not per person, so the owner must mint a new link for
   * the remaining audience.
   */
  async removeMember(boardId: string, userId: string): Promise<void> {
    await this.assertNotOwner(boardId, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const reentry: Prisma.BoardInviteWhereInput[] = [{ kind: 'share_link' }];
    if (user) reentry.push({ kind: 'email', email: user.email, acceptedAt: null });
    await this.prisma.$transaction([
      this.prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId } } }),
      this.prisma.boardInvite.deleteMany({ where: { boardId, OR: reentry } }),
    ]);
    this.access.publish({ boardId, userId });
  }

  async getMemberRole(boardId: string, userId: string): Promise<BoardRole | null> {
    const board = await this.prisma.board.findFirst({ where: { id: boardId, deletedAt: null } });
    if (!board) return null;
    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    return membership?.role ?? null;
  }

  private async ownerId(boardId: string): Promise<string | undefined> {
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });
    return board?.ownerId;
  }

  private async assertNotOwner(boardId: string, userId: string): Promise<void> {
    if (userId === (await this.ownerId(boardId))) {
      throw new ForbiddenException("Cannot modify the board owner's membership");
    }
  }
}
