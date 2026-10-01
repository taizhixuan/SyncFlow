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

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
  ListObjectsV2Command: jest.fn().mockImplementation((input: unknown) => ({ list: input })),
  DeleteObjectsCommand: jest.fn().mockImplementation((input: unknown) => ({ del: input })),
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

describe('StorageService.deletePrefix', () => {
  type ListPage = { Contents?: { Key?: string }[]; IsTruncated?: boolean; NextContinuationToken?: string };
  interface SentCommand {
    list?: { Bucket: string; Prefix: string; ContinuationToken?: string };
    del?: { Bucket: string; Delete: { Objects: { Key: string }[]; Quiet: boolean } };
  }

  async function build(s3: Partial<typeof mockS3Config> = {}): Promise<StorageService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue({ ...mockS3Config, ...s3 }) } },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();
    return moduleRef.get(StorageService);
  }

  const keys = (from: number, count: number): { Key: string }[] =>
    Array.from({ length: count }, (_, i) => ({ Key: `boards/b1/${from + i}.png` }));

  /** Answers list calls from `pages` in order and acknowledges every delete. */
  function serve(pages: ListPage[]): SentCommand[] {
    const sent: SentCommand[] = [];
    let page = 0;
    mockSend.mockImplementation(async (command: SentCommand) => {
      sent.push(command);
      if (command.list) return pages[page++] ?? { Contents: [], IsTruncated: false };
      return { Errors: [] };
    });
    return sent;
  }

  beforeEach(() => mockSend.mockReset());

  it('follows continuation tokens and deletes in batches of at most 1000', async () => {
    const sent = serve([
      { Contents: keys(0, 1000), IsTruncated: true, NextContinuationToken: 't1' },
      { Contents: keys(1000, 500), IsTruncated: false },
    ]);
    const service = await build();

    await expect(service.deletePrefix('boards/b1/')).resolves.toBe(1500);

    const lists = sent.filter((c) => c.list).map((c) => c.list);
    expect(lists).toEqual([
      { Bucket: 'syncflow-assets', Prefix: 'boards/b1/' },
      { Bucket: 'syncflow-assets', Prefix: 'boards/b1/', ContinuationToken: 't1' },
    ]);
    const deletes = sent.filter((c) => c.del).map((c) => c.del?.Delete.Objects.length);
    expect(deletes).toEqual([1000, 500]);
    expect(sent.every((c) => !c.del || c.del.Bucket === 'syncflow-assets')).toBe(true);
  });

  it('returns 0 without a delete call when nothing is stored under the prefix', async () => {
    const sent = serve([{ IsTruncated: false }]);
    const service = await build();
    await expect(service.deletePrefix('boards/empty/')).resolves.toBe(0);
    expect(sent.filter((c) => c.del)).toHaveLength(0);
  });

  it('throws when S3 reports per-object delete errors, so callers keep their records', async () => {
    mockSend.mockImplementation(async (command: SentCommand) =>
      command.list
        ? { Contents: keys(0, 2), IsTruncated: false }
        : { Errors: [{ Key: 'boards/b1/0.png', Code: 'AccessDenied' }] },
    );
    const service = await build();
    await expect(service.deletePrefix('boards/b1/')).rejects.toThrow(/AccessDenied/);
  });

  it('propagates S3 transport errors', async () => {
    mockSend.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const service = await build();
    await expect(service.deletePrefix('boards/b1/')).rejects.toThrow('ECONNREFUSED');
  });

  it('refuses an empty prefix rather than wiping the whole bucket', async () => {
    const service = await build();
    await expect(service.deletePrefix('')).rejects.toThrow();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it.each([
    ['no bucket', { bucket: undefined }],
    ['no credentials', { accessKey: undefined, secretKey: undefined }],
  ])('returns 0 without calling S3 when storage is not configured (%s)', async (_label, s3) => {
    const service = await build(s3);
    await expect(service.deletePrefix('boards/b1/')).resolves.toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
