import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://minio.example.com/presigned-url'),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

const mockS3Config = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'syncflow-assets',
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
  forcePathStyle: true,
};

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockS3Config),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(StorageService);
  });

  it('presignUpload returns an uploadUrl from getSignedUrl', async () => {
    const result = await service.presignUpload('user-123', 'photo.jpg', 'image/jpeg');
    expect(result.uploadUrl).toBe('https://minio.example.com/presigned-url');
  });

  it('presignUpload returns an assetUrl containing the bucket and userId', async () => {
    const result = await service.presignUpload('user-123', 'photo.jpg', 'image/jpeg');
    expect(result.assetUrl).toContain('syncflow-assets');
    expect(result.key).toContain('user-123');
  });

  it('presignUpload returns a key that starts with uploads/{userId}/', async () => {
    const result = await service.presignUpload('user-abc', 'photo.jpg', 'image/jpeg');
    expect(result.key).toMatch(/^uploads\/user-abc\//);
  });

  it('presignUpload result key ends with the sanitized filename', async () => {
    const result = await service.presignUpload('user-123', 'photo.jpg', 'image/jpeg');
    expect(result.key).toMatch(/photo\.jpg$/);
  });

  it('constructs an assetUrl that includes endpoint, bucket, and key', async () => {
    const result = await service.presignUpload('user-123', 'photo.jpg', 'image/jpeg');
    expect(result.assetUrl).toBe(
      `http://localhost:9000/syncflow-assets/${result.key}`,
    );
  });
});
