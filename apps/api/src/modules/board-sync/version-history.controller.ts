import { Controller, Get, Param, Post, UseGuards, NotFoundException } from '@nestjs/common';
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
    @Param('docVersion') docVersion: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true; docVersion: number }> {
    const restored = await this.snapshots.restoreVersion(id, Number(docVersion), user.userId);
    if (!restored) throw new NotFoundException('Version not found');
    // Reconcile any live in-memory room to the restored snapshot and broadcast a
    // forward, delete-bearing update so connected clients and other instances
    // converge immediately. Best-effort: the durable restore snapshot is already
    // persisted, so a broadcast failure never fails the REST response.
    await this.gateway.restoreAndBroadcast(id, restored.bytes);
    return { ok: true, docVersion: restored.docVersion };
  }
}
