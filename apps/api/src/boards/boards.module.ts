import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { BoardRoleGuard } from './board-role.guard';
import { BoardAccessEvents } from './board-access-events';
import { BoardLiveStatePort } from './board-live-state-port';

@Module({
  imports: [UsersModule],
  controllers: [BoardsController],
  providers: [BoardsService, BoardRoleGuard, BoardAccessEvents, BoardLiveStatePort],
  exports: [BoardsService, BoardAccessEvents, BoardLiveStatePort],
})
export class BoardsModule {}
