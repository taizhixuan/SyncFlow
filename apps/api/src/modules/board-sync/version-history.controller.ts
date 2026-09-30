import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { BoardRoleGuard, BoardRoles } from '../../boards/board-role.guard';
import type { BoardVersion } from '@syncflow/shared';
import { SnapshotService } from './snapshot.service';
import { BoardSyncGateway } from './board-sync.gateway';

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class VersionHistoryController {
  constructor(
    private readonly snapshots: SnapshotService,
    private readonly gateway: BoardSyncGateway,
  ) {}

  @Get(':id/versions')
  @UseGuards(BoardRoleGuard)
  list(@Param('id') id: string): Promise<BoardVersion[]> {
    return this.snapshots.list(id);
  }

  @Post(':id/versions/:docVersion/restore')
  @UseGuards(BoardRoleGuard)
  @BoardRoles('owner', 'editor')
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
