import { Injectable } from '@nestjs/common';

/** Anything that can produce a board's current doc state across all instances. */
export interface LiveStateCollector {
  collect(boardId: string, timeoutMs?: number): Promise<Uint8Array | null>;
}

/**
 * Lets board REST flows (duplicate) read the live, not-yet-persisted doc state
 * without the boards module importing the realtime module, which already
 * imports boards — the same inversion BoardAccessEvents uses in the other
 * direction. The board-sync module registers the real collector at init.
 */
@Injectable()
export class BoardLiveStatePort {
  private collector: LiveStateCollector | null = null;

  register(collector: LiveStateCollector): void {
    this.collector = collector;
  }

  /**
   * The merged live state of the board, or null when it has no content.
   * Throws when nothing registered: silently reading a stale snapshot instead
   * would reintroduce the data loss this port exists to prevent.
   */
  collect(boardId: string, timeoutMs?: number): Promise<Uint8Array | null> {
    if (!this.collector) throw new Error('No live-state collector registered (is BoardSyncModule loaded?)');
    return this.collector.collect(boardId, timeoutMs);
  }
}
