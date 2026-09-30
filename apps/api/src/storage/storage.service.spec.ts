import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import type { PresignUploadDto } from './dto/presign-upload.dto';

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

const BOARD = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const upload: PresignUploadDto = { boardId: BOARD, fileName: 'photo.jpg', contentType: 'image/jpeg', size: 2048 };

describe('StorageService', () => {
  let service: StorageService;
  let board: jest.Mock;
  let member: jest.Mock;

  beforeEach(async () => {
    board = jest.fn().mockResolvedValue({ id: BOARD });
    member = jest.fn().mockResolvedValue({ role: 'editor' });
    (PutObjectCommand as unknown as jest.Mock).mockClear();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(mockS3Config) } },
        {
          provide: PrismaService,
          useValue: { board: { findFirst: board }, boardMember: { findUnique: member } },
        },
      ],
    }).compile();

    service = moduleRef.get(StorageService);
  });

  it('returns an uploadUrl from getSignedUrl', async () => {
    const result = await service.presignUpload('user-123', upload);
    expect(result.uploadUrl).toBe('https://minio.example.com/presigned-url');
  });

  it('keys the object under the board, not the user', async () => {
    const result = await service.presignUpload('user-123', upload);
    expect(result.key).toMatch(new RegExp(`^boards/${BOARD}/.+-photo\\.jpg$`));
    expect(result.assetUrl).toBe(`http://localhost:9000/syncflow-assets/${result.key}`);
  });

  it('signs the declared size and type into the URL so S3 rejects anything else', async () => {
    await service.presignUpload('user-123', upload);
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ ContentLength: 2048, ContentType: 'image/jpeg' }),
    );
  });

  it('refuses viewers (403)', async () => {
    member.mockResolvedValue({ role: 'viewer' });
    await expect(service.presignUpload('user-123', upload)).rejects.toThrow(ForbiddenException);
  });

  it('refuses non-members (403)', async () => {
    member.mockResolvedValue(null);
    await expect(service.presignUpload('user-123', upload)).rejects.toThrow(ForbiddenException);
  });

  it('404s for a missing or deleted board', async () => {
    board.mockResolvedValue(null);
    await expect(service.presignUpload('user-123', upload)).rejects.toThrow(NotFoundException);
    expect(board).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });
});
