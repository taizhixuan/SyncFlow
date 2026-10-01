import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { ApiOperation } from '@nestjs/swagger';
import type { BoardVersion } from '@syncflow/shared';
import { BoardRoleGuard, BoardRoles } from '../../boards/board-role.guard';
import { ApiAccessToken } from '../../common/openapi/api-auth';
import { ApiErrors, ApiZodResponse } from '../../common/openapi/api-responses';
import { SnapshotService } from './snapshot.service';
import { BoardSyncGateway } from './board-sync.gateway';

@Controller('boards')
@UseGuards(JwtAuthGuard)
@ApiAccessToken()
export class VersionHistoryController {
  constructor(
    private readonly snapshots: SnapshotService,
    private readonly gateway: BoardSyncGateway,
  ) {}

  @Get(':id/versions')
  @ApiOperation({ summary: "List a board's saved versions" })
  @UseGuards(BoardRoleGuard)
  @ApiZodResponse(HttpStatus.OK, 'BoardVersionList', 'Saved versions, newest first')
  @ApiErrors(400, 401, 403, 404, 429)
  list(@Param('id') id: string): Promise<BoardVersion[]> {
    return this.snapshots.list(id);
  }

  @Post(':id/versions/:docVersion/restore')
  @ApiOperation({ summary: 'Restore a saved version' })
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner', 'editor')
  @ApiZodResponse(HttpStatus.CREATED, 'VersionRestored', 'Restored as a new forward version')
  @ApiErrors(
    [400, 'Malformed board id or docVersion'],
    401,
    403,
    [404, 'Board or version not found'],
    [422, 'This version cannot be restored'],
    429,
  )
  async restore(
    @Param('id') id: string,
    @Param('docVersion', ParseIntPipe) docVersion: number,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true; docVersion: number }> {
    // The gateway owns the live rooms, so it reconciles, broadcasts (locally and
    // cross-instance) and persists the restore as one forward version.
    const restored = await this.gateway.restoreVersion(id, docVersion, user.userId);
    if (restored === null) throw new NotFoundException('Version not found');
    return { ok: true, docVersion: restored };
  }
}
