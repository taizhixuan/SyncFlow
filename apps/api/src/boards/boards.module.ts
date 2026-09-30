import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { BoardRoleGuard } from './board-role.guard';
import { BoardAccessEvents } from './board-access-events';

@Module({
  imports: [UsersModule],
  controllers: [BoardsController],
  providers: [BoardsService, BoardRoleGuard, BoardAccessEvents],
  exports: [BoardsService, BoardAccessEvents],
})
export class BoardsModule {}
