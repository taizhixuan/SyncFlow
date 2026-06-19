import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { BoardsModule } from '../../boards/boards.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { BoardSyncGateway } from './board-sync.gateway';
import { BoardSyncBridge } from './board-sync-bridge';
import { RoomManager } from './room-manager';
import { SnapshotService } from './snapshot.service';

@Module({
  imports: [AuthModule, BoardsModule, PrismaModule],
  providers: [
    BoardSyncGateway,
    BoardSyncBridge,
    SnapshotService,
    { provide: RoomManager, useFactory: (s: SnapshotService) => new RoomManager(s), inject: [SnapshotService] },
  ],
})
export class BoardSyncModule {}
