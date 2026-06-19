import { Controller, Get, Logger, Param, Post, UseGuards, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { BoardRoleGuard, BoardRoles } from '../../boards/board-role.guard';
import type { BoardVersion } from '@syncflow/shared';
import { SnapshotService } from './snapshot.service';
import { RoomManager } from './room-manager';

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class VersionHistoryController {
  private readonly logger = new Logger(VersionHistoryController.name);

  constructor(
    private readonly snapshots: SnapshotService,
    private readonly rooms: RoomManager,
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
    @Param('docVersion') docVersion: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true; docVersion: number }> {
    const bytes = await this.snapshots.restoreVersion(id, Number(docVersion), user.userId);
    if (!bytes) throw new NotFoundException('Version not found');
    // Best-effort: push restored state to any live in-memory room so connected
    // clients converge immediately. Errors here don't fail the REST response —
    // the snapshot is already persisted and clients will reload on reconnect.
    try {
      const room = await this.rooms.getOrCreate(id);
      room.applyUpdate(bytes);
    } catch (err) {
      this.logger.warn(`applyUpdate failed for board ${id} after restore: ${String(err)}`);
    }
    const versions = await this.snapshots.list(id);
    const head = versions[0];
    if (!head) throw new InternalServerErrorException('Restore succeeded but head version is missing');
    return { ok: true, docVersion: head.docVersion };
  }
}
