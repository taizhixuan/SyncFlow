import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardRoleGuard } from '../boards/board-role.guard';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  imports: [AuthModule],
  controllers: [InvitesController],
  providers: [InvitesService, BoardRoleGuard],
})
export class InvitesModule {}
