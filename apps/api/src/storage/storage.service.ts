import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignedUpload } from '@syncflow/shared';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import {
  assetKeyFromUrl,
  assetUrlFor,
  avatarKeyFor,
  boardAssetPrefix,
  objectKeyFor,
} from './storage.helpers';
import type { PresignAvatarUploadDto, PresignUploadDto } from './dto/presign-upload.dto';

const PRESIGN_EXPIRES_IN = 300; // 5 minutes
// S3's hard cap on keys per DeleteObjects request (ListObjectsV2 pages match it).
const DELETE_BATCH_SIZE = 1000;

export type { PresignedUpload };

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
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

  /**
   * Delete every object under `prefix`; returns how many were deleted and
   * throws on any S3 failure, so a caller can keep the records that point at
   * the objects and retry later instead of orphaning them.
   *
   * Without a bucket and credentials (local dev or CI with no MinIO) there is
   * nothing this deployment could have stored, so it is a no-op returning 0.
   */
  async deletePrefix(prefix: string): Promise<number> {
    // An empty prefix matches the whole bucket; never let a bad caller wipe it.
    if (!prefix) throw new Error('deletePrefix requires a non-empty prefix');
    const { bucket, accessKey, secretKey } = this.s3Config;
    if (!bucket || !accessKey || !secretKey) {
      this.logger.debug(`Storage not configured; skipping delete of ${prefix}`);
      return 0;
    }

    let deleted = 0;
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ...(continuationToken && { ContinuationToken: continuationToken }),
        }),
      );
      const keys = (page.Contents ?? []).flatMap((object) =>
        object.Key ? [{ Key: object.Key }] : [],
      );
      for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
        deleted += await this.deleteBatch(bucket, keys.slice(i, i + DELETE_BATCH_SIZE));
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return deleted;
  }

  /**
   * Copy one of `fromBoardId`'s uploads under `toBoardId`'s prefix, server side
   * (no download), and return the copy's public URL. A duplicated board needs
   * its own copies: the source's objects are deleted when the source is purged.
   *
   * Returns null, copying nothing, for any URL that is not a direct upload of
   * `fromBoardId` in this bucket (external images, other boards' or legacy
   * user-keyed uploads) and when storage is not configured. Throws on an S3
   * failure so the caller can decide to keep the original URL.
   */
  async copyBoardAsset(
    assetUrl: string,
    fromBoardId: string,
    toBoardId: string,
  ): Promise<string | null> {
    const { bucket, accessKey, secretKey } = this.s3Config;
    if (!bucket || !accessKey || !secretKey) return null;
    const key = assetKeyFromUrl(this.s3Config, assetUrl);
    const prefix = boardAssetPrefix(fromBoardId);
    if (!key?.startsWith(prefix)) return null;
    const name = key.slice(prefix.length);
    // Uploads are `{prefix}{uuid}-{name}` with no further separators; anything
    // else was not written by presignUpload.
    if (!name || name.includes('/')) return null;

    const target = `${boardAssetPrefix(toBoardId)}${name}`;
    await this.client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: target,
        // CopySource is a URL path: the key must be percent-encoded, separators kept.
        CopySource: `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`,
      }),
    );
    return assetUrlFor(this.s3Config, target);
  }

  private async deleteBatch(bucket: string, objects: { Key: string }[]): Promise<number> {
    const result = await this.client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
    );
    // DeleteObjects reports per-key failures in a 200 response rather than throwing.
    const failure = result.Errors?.[0];
    if (failure) {
      throw new Error(
        `Failed to delete ${result.Errors?.length ?? 1} object(s), e.g. ${failure.Key ?? '?'}: ${failure.Code ?? 'unknown error'}`,
      );
    }
    return objects.length;
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
