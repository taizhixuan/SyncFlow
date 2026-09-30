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
import type { Board, BoardMember, BoardRole, Paginated } from '@syncflow/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
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
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBoardDto): Promise<Board> {
    return this.boards.create(user.userId, dto.title);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto): Promise<Paginated<Board>> {
    return this.boards.listForUser(user.userId, query);
  }

  @Get(':id')
  @UseGuards(BoardRoleGuard)
  get(@Param('id') id: string, @CurrentBoardRole() role: BoardRole): Promise<Board> {
    return this.boards.get(id, role);
  }

  @Patch(':id')
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  rename(@Param('id') id: string, @Body() dto: UpdateBoardDto): Promise<Board> {
    return this.boards.rename(id, dto.title);
  }

  @Delete(':id')
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.boards.softDelete(id);
  }

  @Post(':id/duplicate')
  @UseGuards(BoardRoleGuard)
  @HttpCode(HttpStatus.CREATED)
  duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Board> {
    return this.boards.duplicate(user.userId, id);
  }

  @Get(':id/members')
  @UseGuards(BoardRoleGuard)
  members(@Param('id') id: string, @Query() query: PaginationQueryDto): Promise<Paginated<BoardMember>> {
    return this.boards.listMembers(id, query);
  }

  @Post(':id/members')
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.CREATED)
  addMember(@Param('id') id: string, @Body() dto: AddMemberDto): Promise<BoardMember> {
    return this.boards.addMember(id, dto.email, dto.role);
  }

  // Declared before ':id/members/:userId' so "me" never reaches the owner-only route.
  @Delete(':id/members/me')
  @UseGuards(BoardRoleGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.boards.leave(id, user.userId);
  }

  @Post(':id/transfer-ownership')
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.OK)
  transferOwnership(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TransferOwnershipDto,
  ): Promise<Board> {
    return this.boards.transferOwnership(id, user.userId, dto.userId);
  }

  @Patch(':id/members/:userId')
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<{ ok: true }> {
    await this.boards.updateMemberRole(id, userId, dto.role);
    return { ok: true };
  }

  @Delete(':id/members/:userId')
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(@Param('id') id: string, @Param('userId') userId: string): Promise<void> {
    await this.boards.removeMember(id, userId);
  }
}
