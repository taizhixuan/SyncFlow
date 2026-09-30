import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type Board as PrismaBoard,
  type BoardMember as PrismaBoardMember,
  type User,
} from '@prisma/client';
import {
  OWNER_CANNOT_LEAVE_MESSAGE,
  type Board,
  type BoardMember,
  type BoardRole,
  type Paginated,
  type PaginationQuery,
} from '@syncflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { BoardAccessEvents } from './board-access-events';
import { BoardLiveStatePort } from './board-live-state-port';
import { decodeCursor, pageLimit, toPage } from './pagination';

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function toMember(m: PrismaBoardMember & { user: User }): BoardMember {
  return {
    userId: m.userId,
    displayName: m.user.displayName,
    email: m.user.email,
    color: m.user.color,
    role: m.role,
    acceptedAt: m.acceptedAt ? m.acceptedAt.toISOString() : null,
  };
}

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

  /** The caller's boards, most recently updated first (id breaks ties). */
  async listForUser(userId: string, query: PaginationQuery = {}): Promise<Paginated<Board>> {
    const limit = pageLimit(query.limit);
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const boards = await this.prisma.board.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId } },
        ...(after && {
          OR: [{ updatedAt: { lt: after.at } }, { updatedAt: after.at, id: { lt: after.id } }],
        }),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        members: { where: { userId }, select: { role: true } },
        _count: { select: { members: true } },
      },
    });
    return toPage(
      boards,
      limit,
      (b) => ({ at: b.updatedAt, id: b.id }),
      // The `some` filter guarantees the caller's membership row is present.
      (b) => this.toBoard(b, b.members[0]?.role ?? 'viewer', b._count.members),
    );
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

  /** Members in join order (userId breaks ties). */
  async listMembers(boardId: string, query: PaginationQuery = {}): Promise<Paginated<BoardMember>> {
    const limit = pageLimit(query.limit);
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const members = await this.prisma.boardMember.findMany({
      where: {
        boardId,
        ...(after && {
          OR: [{ invitedAt: { gt: after.at } }, { invitedAt: after.at, userId: { gt: after.id } }],
        }),
      },
      include: { user: true },
      orderBy: [{ invitedAt: 'asc' }, { userId: 'asc' }],
      take: limit + 1,
    });
    return toPage(members, limit, (m) => ({ at: m.invitedAt, id: m.userId }), toMember);
  }

  /**
   * Add an existing user by email. An existing membership (the owner's
   * included) is a 409: role changes go through updateMemberRole so they are
   * explicit. A brand-new member has no live sockets, so nothing is announced.
   */
  async addMember(boardId: string, email: string, role: 'editor' | 'viewer'): Promise<BoardMember> {
    const user = await this.users.findByEmail(email);
    if (!user) throw new NotFoundException('No user with that email');
    try {
      const member = await this.prisma.boardMember.create({
        data: { boardId, userId: user.id, role, acceptedAt: new Date() },
        include: { user: true },
      });
      return toMember(member);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('User is already a member of this board');
      throw err;
    }
  }

  /**
   * The caller leaves the board. Only their membership goes: share links and
   * invites belong to the board, not to the leaver. The owner must hand the
   * board over first. The role filter makes check and delete one statement, so
   * a concurrent ownership transfer cannot slip in between.
   */
  async leave(boardId: string, userId: string): Promise<void> {
    const { count } = await this.prisma.boardMember.deleteMany({
      where: { boardId, userId, role: { not: 'owner' } },
    });
    if (count === 0) {
      const membership = await this.prisma.boardMember.findUnique({
        where: { boardId_userId: { boardId, userId } },
      });
      if (membership?.role === 'owner') throw new ConflictException(OWNER_CANNOT_LEAVE_MESSAGE);
      throw new ForbiddenException('Not a member of this board');
    }
    this.access.publish({ boardId, userId });
  }

  /**
   * Hand the board to another member: they become owner, the caller an editor.
   * Claiming the board row with a conditional update (ownerId must still be the
   * caller) serializes concurrent transfers, so a board never gets two owners.
   * Returns the board as the caller now sees it.
   */
  async transferOwnership(boardId: string, currentOwnerId: string, targetUserId: string): Promise<Board> {
    if (targetUserId === currentOwnerId) throw new BadRequestException('You already own this board');
    const board = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.board.updateMany({
        where: { id: boardId, ownerId: currentOwnerId, deletedAt: null },
        data: { ownerId: targetUserId },
      });
      if (claim.count === 0) throw new ForbiddenException('Only the owner can transfer ownership');
      const target = await tx.boardMember.findUnique({
        where: { boardId_userId: { boardId, userId: targetUserId } },
      });
      if (!target) throw new NotFoundException('That user is not a member of this board');
      await tx.boardMember.update({
        where: { boardId_userId: { boardId, userId: targetUserId } },
        data: { role: 'owner' },
      });
      await tx.boardMember.update({
        where: { boardId_userId: { boardId, userId: currentOwnerId } },
        data: { role: 'editor' },
      });
      return tx.board.findUniqueOrThrow({
        where: { id: boardId },
        include: { _count: { select: { members: true } } },
      });
    });
    this.access.publish({ boardId, userId: currentOwnerId });
    this.access.publish({ boardId, userId: targetUserId });
    return this.toBoard(board, 'editor', board._count.members);
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
