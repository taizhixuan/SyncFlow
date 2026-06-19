import { BoardsService } from './boards.service';

describe('BoardsService.getMemberRole', () => {
  it('returns the role for a member of a live board', async () => {
    const prisma = {
      board: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
      boardMember: { findUnique: jest.fn().mockResolvedValue({ role: 'editor' }) },
    };
    const svc = new BoardsService(prisma as never, {} as never);
    expect(await svc.getMemberRole('b1', 'u1')).toBe('editor');
  });

  it('returns null for a non-member', async () => {
    const prisma = {
      board: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
      boardMember: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = new BoardsService(prisma as never, {} as never);
    expect(await svc.getMemberRole('b1', 'u1')).toBeNull();
  });

  it('returns null for a missing/deleted board', async () => {
    const prisma = {
      board: { findFirst: jest.fn().mockResolvedValue(null) },
      boardMember: { findUnique: jest.fn() },
    };
    const svc = new BoardsService(prisma as never, {} as never);
    expect(await svc.getMemberRole('b1', 'u1')).toBeNull();
  });
});
