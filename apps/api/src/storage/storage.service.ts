import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignedUpload } from '@syncflow/shared';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { avatarKeyFor, objectKeyFor, assetUrlFor } from './storage.helpers';
import type { PresignAvatarUploadDto, PresignUploadDto } from './dto/presign-upload.dto';

const PRESIGN_EXPIRES_IN = 300; // 5 minutes

export type { PresignedUpload };

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly s3Config: AppConfig['s3'];

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    this.s3Config = this.config.get('s3', { infer: true });
    this.client = new S3Client({
      endpoint: this.s3Config.endpoint,
      region: this.s3Config.region,
      forcePathStyle: this.s3Config.forcePathStyle,
      credentials:
        this.s3Config.accessKey && this.s3Config.secretKey
          ? {
              accessKeyId: this.s3Config.accessKey,
              secretAccessKey: this.s3Config.secretKey,
            }
          : undefined,
    });
  }

  async presignUpload(userId: string, dto: PresignUploadDto): Promise<PresignedUpload> {
    await this.assertCanUpload(userId, dto.boardId);
    return this.presign(objectKeyFor(dto.boardId, dto.fileName), dto);
  }

  /** Avatars belong to a user, not a board: `avatars/{userId}/{uuid}-{name}`. */
  presignAvatarUpload(userId: string, dto: PresignAvatarUploadDto): Promise<PresignedUpload> {
    return this.presign(avatarKeyFor(userId, dto.fileName), dto);
  }

  private async presign(
    key: string,
    file: { contentType: string; size: number },
  ): Promise<PresignedUpload> {
    // ContentLength and ContentType become signed headers: S3 rejects a PUT
    // whose body size or type differs from what was validated here.
    const command = new PutObjectCommand({
      Bucket: this.s3Config.bucket,
      Key: key,
      ContentType: file.contentType,
      ContentLength: file.size,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_EXPIRES_IN,
      // Keep Content-Type a signed header rather than a hoisted query param,
      // so the browser's PUT must carry exactly the validated type.
      signableHeaders: new Set(['content-length', 'content-type']),
    });
    return { uploadUrl, assetUrl: assetUrlFor(this.s3Config, key), key };
  }

  /**
   * Only people who can edit a board may add images to it; otherwise any
   * account could use the bucket as free hosting. Mirrors BoardRoleGuard's
   * owner/editor check (the board id arrives in the body, not the route).
   */
  private async assertCanUpload(userId: string, boardId: string): Promise<void> {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, deletedAt: null },
      select: { id: true },
    });
    if (!board) throw new NotFoundException('Board not found');

    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenException('Not a member of this board');
    if (membership.role !== 'owner' && membership.role !== 'editor') {
      throw new ForbiddenException('Insufficient permissions');
    }
  }
}
