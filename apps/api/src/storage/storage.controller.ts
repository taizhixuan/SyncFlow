import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { StorageService, type PresignedUpload } from './storage.service';
import { PresignAvatarUploadDto, PresignUploadDto } from './dto/presign-upload.dto';

@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Presign an image for a board; the caller must be its owner or an editor. */
  @Post('uploads')
  @HttpCode(HttpStatus.CREATED)
  presignUpload(
    @CurrentUser() user: AuthUser,
    @Body() dto: PresignUploadDto,
  ): Promise<PresignedUpload> {
    return this.storage.presignUpload(user.userId, dto);
  }

  /** Presign the caller's own profile avatar. */
  @Post('avatar-uploads')
  @HttpCode(HttpStatus.CREATED)
  presignAvatarUpload(
    @CurrentUser() user: AuthUser,
    @Body() dto: PresignAvatarUploadDto,
  ): Promise<PresignedUpload> {
    return this.storage.presignAvatarUpload(user.userId, dto);
  }
}
