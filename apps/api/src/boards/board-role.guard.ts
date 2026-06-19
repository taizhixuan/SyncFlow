import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { BoardRole } from '@syncflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/current-user.decorator';

export const BOARD_ROLES_KEY = 'boardRoles';
/** Restrict a board-scoped route to specific roles (default: any member). */
export const BoardRoles = (...roles: BoardRole[]) => SetMetadata(BOARD_ROLES_KEY, roles);

type BoardRequest = Request & { user?: AuthUser; boardRole?: BoardRole };

/** The caller's role on the board (set by BoardRoleGuard). */
export const CurrentBoardRole = createParamDecorator((_data: unknown, ctx: ExecutionContext): BoardRole => {
  return ctx.switchToHttp().getRequest<BoardRequest>().boardRole!;
});

@Injectable()
export class BoardRoleGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<BoardRequest>();
    const userId = req.user?.userId;
    const boardId = req.params.id ?? req.params.boardId;
    if (!userId || !boardId) throw new ForbiddenException();

    const board = await this.prisma.board.findFirst({ where: { id: boardId, deletedAt: null } });
    if (!board) throw new NotFoundException('Board not found');

    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this board');

    const required = this.reflector.get<BoardRole[] | undefined>(BOARD_ROLES_KEY, ctx.getHandler());
    if (required && required.length > 0 && !required.includes(membership.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    req.boardRole = membership.role;
    return true;
  }
}
