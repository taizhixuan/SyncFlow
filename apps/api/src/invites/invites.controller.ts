import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { BoardInviteSummary, InviteCreated, InvitePreview, Paginated } from '@syncflow/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { BoardRoleGuard, BoardRoles } from '../boards/board-role.guard';
import { PaginationQueryDto } from '../boards/dto/pagination.dto';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/invite.dto';

@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  // POST /boards/:id/invites — owner only
  @Post('boards/:id/invites')
  @UseGuards(JwtAuthGuard, BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.CREATED)
  createInvite(
    @Param('id', ParseUUIDPipe) boardId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInviteDto,
  ): Promise<InviteCreated> {
    return this.invites.createInvite(boardId, user.userId, dto.kind, dto.role, dto.email, dto.expiresInHours);
  }

  // GET /invites/:token — public (no auth required)
  @Get('invites/:token')
  previewInvite(@Param('token') token: string): Promise<InvitePreview> {
    return this.invites.previewInvite(token);
  }

  // POST /invites/:token/accept — must be logged in
  @Post('invites/:token/accept')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  acceptInvite(
    @Param('token') token: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ boardId: string; role: string }> {
    return this.invites.acceptInvite(token, user.userId, user.email);
  }

  // GET /boards/:id/invites — owner only
  @Get('boards/:id/invites')
  @UseGuards(JwtAuthGuard, BoardRoleGuard)
  @BoardRoles('owner')
  listInvites(
    @Param('id', ParseUUIDPipe) boardId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<BoardInviteSummary>> {
    return this.invites.listInvites(boardId, query);
  }

  // DELETE /boards/:id/invites/:inviteId — owner only
  @Delete('boards/:id/invites/:inviteId')
  @UseGuards(JwtAuthGuard, BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvite(
    @Param('id', ParseUUIDPipe) boardId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ): Promise<void> {
    await this.invites.revokeInvite(boardId, inviteId);
  }
}
