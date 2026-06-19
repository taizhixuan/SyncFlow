import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from '../config/configuration';
import { objectKeyFor, assetUrlFor } from './storage.helpers';

const PRESIGN_EXPIRES_IN = 300; // 5 minutes

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly s3Config: AppConfig['s3'];

  constructor(private readonly config: ConfigService<AppConfig, true>) {
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

  async presignUpload(
    userId: string,
    fileName: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; assetUrl: string; key: string }> {
    const key = objectKeyFor(userId, fileName);
    const command = new PutObjectCommand({
      Bucket: this.s3Config.bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_EXPIRES_IN,
    });
    const assetUrl = assetUrlFor(this.s3Config, key);
    return { uploadUrl, assetUrl, key };
  }
}
