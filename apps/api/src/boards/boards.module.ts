import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { BoardRoleGuard } from './board-role.guard';
import { BoardAccessEvents } from './board-access-events';
import { BoardLiveStatePort } from './board-live-state-port';
import { BoardPurgeService } from './board-purge.service';

@Module({
  imports: [UsersModule, StorageModule],
  controllers: [BoardsController],
  providers: [
    BoardsService,
    BoardRoleGuard,
    BoardAccessEvents,
    BoardLiveStatePort,
    BoardPurgeService,
  ],
  exports: [BoardsService, BoardAccessEvents, BoardLiveStatePort],
})
export class BoardsModule {}
