import {
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { UserPublic } from '@syncflow/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ApiAccessToken } from '../common/openapi/api-auth';
import { ApiErrors, ApiZodResponse } from '../common/openapi/api-responses';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiAccessToken()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the signed-in user' })
  @ApiZodResponse(HttpStatus.OK, 'UserPublic', 'The signed-in user')
  @ApiErrors(401, 404, 429)
  async me(@CurrentUser() principal: AuthUser): Promise<UserPublic> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new NotFoundException('User not found');
    return this.users.toPublic(user);
  }

  @Patch('me')
  @ApiOperation({ summary: "Update the signed-in user's profile" })
  @ApiZodResponse(HttpStatus.OK, 'UserPublic', 'The updated profile')
  @ApiErrors(401, 422, 429)
  async update(
    @CurrentUser() principal: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserPublic> {
    const user = await this.users.updateProfile(principal.userId, dto);
    return this.users.toPublic(user);
  }
}
