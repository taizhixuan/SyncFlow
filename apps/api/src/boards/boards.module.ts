import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { BoardRoleGuard } from './board-role.guard';

@Module({
  imports: [UsersModule],
  controllers: [BoardsController],
  providers: [BoardsService, BoardRoleGuard],
  exports: [BoardsService],
})
export class BoardsModule {}
