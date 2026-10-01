import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Board, BoardMember, BoardRole, Paginated } from '@syncflow/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ApiAccessToken } from '../common/openapi/api-auth';
import { ApiErrors, ApiNoContent, ApiZodResponse } from '../common/openapi/api-responses';
import { BoardsService } from './boards.service';
import { BoardRoleGuard, BoardRoles, CurrentBoardRole } from './board-role.guard';
import {
  AddMemberDto,
  CreateBoardDto,
  TransferOwnershipDto,
  UpdateBoardDto,
  UpdateMemberRoleDto,
} from './dto/board.dto';
import { PaginationQueryDto } from './dto/pagination.dto';

@Controller('boards')
@UseGuards(JwtAuthGuard)
@ApiAccessToken()
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a board' })
  @ApiZodResponse(HttpStatus.CREATED, 'Board', 'The new board, owned by the caller')
  @ApiErrors(401, 422, 429)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBoardDto): Promise<Board> {
    return this.boards.create(user.userId, dto.title);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's boards" })
  @ApiZodResponse(
    HttpStatus.OK,
    'BoardListResponse',
    "The caller's boards, most recently updated first",
  )
  @ApiErrors([400, 'Invalid cursor'], 401, [422, 'Invalid limit'], 429)
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto): Promise<Paginated<Board>> {
    return this.boards.listForUser(user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a board' })
  @UseGuards(BoardRoleGuard)
  @ApiZodResponse(HttpStatus.OK, 'Board', "The board with the caller's role")
  @ApiErrors(400, 401, 403, 404, 429)
  get(@Param('id') id: string, @CurrentBoardRole() role: BoardRole): Promise<Board> {
    return this.boards.get(id, role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a board' })
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  @ApiZodResponse(HttpStatus.OK, 'Board', 'The renamed board')
  @ApiErrors(400, 401, 403, 404, 422, 429)
  rename(@Param('id') id: string, @Body() dto: UpdateBoardDto): Promise<Board> {
    return this.boards.rename(id, dto.title);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a board' })
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent('Board deleted')
  @ApiErrors(400, 401, 403, 404, 429)
  async remove(@Param('id') id: string): Promise<void> {
    await this.boards.softDelete(id);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a board' })
  @UseGuards(BoardRoleGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiZodResponse(HttpStatus.CREATED, 'Board', 'The copy, owned by the caller')
  @ApiErrors(400, 401, 403, 404, 429)
  duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Board> {
    return this.boards.duplicate(user.userId, id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List board members' })
  @UseGuards(BoardRoleGuard)
  @ApiZodResponse(HttpStatus.OK, 'BoardMemberListResponse', 'Members in join order')
  @ApiErrors(
    [400, 'Malformed board id or invalid cursor'],
    401,
    403,
    404,
    [422, 'Invalid limit'],
    429,
  )
  members(@Param('id') id: string, @Query() query: PaginationQueryDto): Promise<Paginated<BoardMember>> {
    return this.boards.listMembers(id, query);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member by email' })
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.CREATED)
  @ApiZodResponse(HttpStatus.CREATED, 'BoardMember', 'The new member')
  @ApiErrors(
    400,
    401,
    403,
    [404, 'Board not found, or no user with that email'],
    [409, 'User is already a member of this board'],
    422,
    429,
  )
  addMember(@Param('id') id: string, @Body() dto: AddMemberDto): Promise<BoardMember> {
    return this.boards.addMember(id, dto.email, dto.role);
  }

  // Declared before ':id/members/:userId' so "me" never reaches the owner-only route.
  @Delete(':id/members/me')
  @ApiOperation({ summary: 'Leave a board' })
  @UseGuards(BoardRoleGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent('The caller left the board')
  @ApiErrors(400, 401, 403, 404, [409, 'Transfer ownership before leaving'], 429)
  async leave(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.boards.leave(id, user.userId);
  }

  @Post(':id/transfer-ownership')
  @ApiOperation({ summary: 'Transfer ownership to another member' })
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.OK)
  @ApiZodResponse(HttpStatus.OK, 'Board', 'The board, now owned by the target member')
  @ApiErrors(
    [400, 'Malformed board id, or the caller already owns the board'],
    401,
    403,
    [404, 'Board not found, or the target is not a member'],
    422,
    429,
  )
  transferOwnership(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TransferOwnershipDto,
  ): Promise<Board> {
    return this.boards.transferOwnership(id, user.userId, dto.userId);
  }

  @Patch(':id/members/:userId')
  @ApiOperation({ summary: "Change a member's role" })
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  @ApiZodResponse(HttpStatus.OK, 'OkResponse', 'Role updated')
  @ApiErrors(400, 401, [403, "Not the owner, or targets the owner's own membership"], 404, 422, 429)
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<{ ok: true }> {
    await this.boards.updateMemberRole(id, userId, dto.role);
    return { ok: true };
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a member' })
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent('Member removed, along with invites that would let them rejoin')
  @ApiErrors(400, 401, [403, "Not the owner, or targets the owner's own membership"], 404, 429)
  async removeMember(@Param('id') id: string, @Param('userId') userId: string): Promise<void> {
    await this.boards.removeMember(id, userId);
  }
}
