import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ApiAccessToken } from '../common/openapi/api-auth';
import { ApiErrors, ApiZodResponse } from '../common/openapi/api-responses';
import { StorageService, type PresignedUpload } from './storage.service';
import { PresignAvatarUploadDto, PresignUploadDto } from './dto/presign-upload.dto';

@Controller('storage')
@UseGuards(JwtAuthGuard)
@ApiAccessToken()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Presign an image for a board; the caller must be its owner or an editor. */
  @Post('uploads')
  @ApiOperation({ summary: 'Presign a board image upload' })
  @HttpCode(HttpStatus.CREATED)
  @ApiZodResponse(
    HttpStatus.CREATED,
    'PresignedUpload',
    'Presigned PUT URL and the public asset URL',
  )
  @ApiErrors(401, 403, [404, 'Board not found'], 422, 429)
  presignUpload(
    @CurrentUser() user: AuthUser,
    @Body() dto: PresignUploadDto,
  ): Promise<PresignedUpload> {
    return this.storage.presignUpload(user.userId, dto);
  }

  /** Presign the caller's own profile avatar. */
  @Post('avatar-uploads')
  @ApiOperation({ summary: 'Presign a profile avatar upload' })
  @HttpCode(HttpStatus.CREATED)
  @ApiZodResponse(
    HttpStatus.CREATED,
    'PresignedUpload',
    'Presigned PUT URL and the public asset URL',
  )
  @ApiErrors(401, 422, 429)
  presignAvatarUpload(
    @CurrentUser() user: AuthUser,
    @Body() dto: PresignAvatarUploadDto,
  ): Promise<PresignedUpload> {
    return this.storage.presignAvatarUpload(user.userId, dto);
  }
}
