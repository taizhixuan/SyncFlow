import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export function nextDocVersion(latest: number | null): number {
  return (latest ?? 0) + 1;
}

@Injectable()
export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async loadLatest(boardId: string): Promise<Uint8Array | null> {
    const row = await this.prisma.boardSnapshot.findFirst({
      where: { boardId },
      orderBy: { docVersion: 'desc' },
      select: { yjsState: true },
    });
    return row ? new Uint8Array(row.yjsState) : null;
  }

  async save(boardId: string, state: Uint8Array, createdBy?: string): Promise<void> {
    // Read-then-insert is not atomic, but the RoomManager is the sole caller and
    // debounces saves per board, so there is at most one in-flight save per board.
    // Revisit with an upsert / advisory lock if multiple writers per board ever land.
    const latest = await this.prisma.boardSnapshot.findFirst({
      where: { boardId },
      orderBy: { docVersion: 'desc' },
      select: { docVersion: true },
    });
    await this.prisma.boardSnapshot.create({
      data: {
        boardId,
        docVersion: nextDocVersion(latest?.docVersion ?? null),
        yjsState: Buffer.from(state),
        reason: 'autosave',
        createdBy: createdBy ?? null,
      },
    });
  }
}
