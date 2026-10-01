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
import { ApiOperation } from '@nestjs/swagger';
import type { BoardInviteSummary, InviteCreated, InvitePreview, Paginated } from '@syncflow/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { ApiAccessToken, ApiPublic } from '../common/openapi/api-auth';
import { ApiErrors, ApiNoContent, ApiZodResponse } from '../common/openapi/api-responses';
import { BoardRoleGuard, BoardRoles } from '../boards/board-role.guard';
import { PaginationQueryDto } from '../boards/dto/pagination.dto';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/invite.dto';

@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  // POST /boards/:id/invites — owner only
  @Post('boards/:id/invites')
  @ApiAccessToken()
  @ApiOperation({ summary: 'Create an email or share-link invite' })
  @UseGuards(JwtAuthGuard, BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.CREATED)
  @ApiZodResponse(HttpStatus.CREATED, 'InviteCreated', 'The invite token and its URL')
  @ApiErrors(
    [400, 'Malformed board id, or an email invite without an email'],
    401,
    403,
    404,
    422,
    429,
  )
  createInvite(
    @Param('id', ParseUUIDPipe) boardId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInviteDto,
  ): Promise<InviteCreated> {
    return this.invites.createInvite(boardId, user.userId, dto.kind, dto.role, dto.email, dto.expiresInHours);
  }

  // GET /invites/:token — public (no auth required)
  @Get('invites/:token')
  @ApiPublic()
  @ApiOperation({ summary: 'Preview an invite (public)' })
  @ApiZodResponse(
    HttpStatus.OK,
    'InvitePreview',
    'Preview; `valid: false` for unknown or expired tokens',
  )
  @ApiErrors(429)
  previewInvite(@Param('token') token: string): Promise<InvitePreview> {
    return this.invites.previewInvite(token);
  }

  // POST /invites/:token/accept — must be logged in
  @Post('invites/:token/accept')
  @ApiAccessToken()
  @ApiOperation({ summary: 'Accept an invite' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiZodResponse(HttpStatus.CREATED, 'InviteAccepted', 'The board joined and the role granted')
  @ApiErrors(
    401,
    [403, 'This invite is for a different email address'],
    [404, 'Invite not found'],
    410,
    429,
  )
  acceptInvite(
    @Param('token') token: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ boardId: string; role: string }> {
    return this.invites.acceptInvite(token, user.userId, user.email);
  }

  // GET /boards/:id/invites — owner only
  @Get('boards/:id/invites')
  @ApiAccessToken()
  @ApiOperation({ summary: 'List unexpired invites' })
  @UseGuards(JwtAuthGuard, BoardRoleGuard)
  @BoardRoles('owner')
  @ApiZodResponse(HttpStatus.OK, 'BoardInviteListResponse', 'Unexpired invites, newest first')
  @ApiErrors(
    [400, 'Malformed board id or invalid cursor'],
    401,
    403,
    404,
    [422, 'Invalid limit'],
    429,
  )
  listInvites(
    @Param('id', ParseUUIDPipe) boardId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<BoardInviteSummary>> {
    return this.invites.listInvites(boardId, query);
  }

  // DELETE /boards/:id/invites/:inviteId — owner only
  @Delete('boards/:id/invites/:inviteId')
  @ApiAccessToken()
  @ApiOperation({ summary: 'Revoke an invite' })
  @UseGuards(JwtAuthGuard, BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent('Invite revoked')
  @ApiErrors(
    [400, 'Malformed board or invite id'],
    401,
    403,
    [404, 'Board or invite not found'],
    429,
  )
  async revokeInvite(
    @Param('id', ParseUUIDPipe) boardId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ): Promise<void> {
    await this.invites.revokeInvite(boardId, inviteId);
  }
}
