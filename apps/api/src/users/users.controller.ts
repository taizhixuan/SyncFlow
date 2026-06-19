import { Body, Controller, Get, NotFoundException, Patch, UseGuards } from '@nestjs/common';
import type { UserPublic } from '@syncflow/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() principal: AuthUser): Promise<UserPublic> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new NotFoundException('User not found');
    return this.users.toPublic(user);
  }

  @Patch('me')
  async update(
    @CurrentUser() principal: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserPublic> {
    const user = await this.users.updateProfile(principal.userId, dto);
    return this.users.toPublic(user);
  }
}
