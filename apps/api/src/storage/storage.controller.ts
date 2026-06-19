import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { StorageService } from './storage.service';
import { PresignUploadDto } from './dto/presign-upload.dto';

@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('uploads')
  @HttpCode(HttpStatus.CREATED)
  presignUpload(
    @CurrentUser() user: AuthUser,
    @Body() dto: PresignUploadDto,
  ): Promise<{ uploadUrl: string; assetUrl: string; key: string }> {
    return this.storage.presignUpload(user.userId, dto.fileName, dto.contentType);
  }
}
