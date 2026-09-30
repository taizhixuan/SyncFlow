import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Y from 'yjs';
import { BoardLiveStatePort, type LiveStateCollector } from '../../boards/board-live-state-port';
import { BoardSyncBridge, type StateReply } from './board-sync-bridge';
import { RoomManager } from './room-manager';
import { SnapshotService } from './snapshot.service';

/** Long enough for a healthy Redis round trip plus encoding a large doc, short enough for a REST call. */
export const DEFAULT_COLLECT_TIMEOUT_MS = 750;

interface PendingRequest {
  states: Uint8Array[];
  received: number;
  /** Replies to wait for; null until PUBLISH reports its receiver count. */
  expected: number | null;
  settle: () => void;
}

/**
 * The board's current content as the union of everything that holds a piece of
 * it: the latest persisted snapshot, this instance's live room, and the live
 * rooms of every other instance (edits still inside their flush debounce).
 * Yjs merges are commutative and idempotent, so overlapping sources are safe.
 */
@Injectable()
export class BoardLiveState implements LiveStateCollector, OnModuleInit {
  private readonly logger = new Logger(BoardLiveState.name);
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly rooms: RoomManager,
    private readonly snapshots: SnapshotService,
    private readonly bridge: BoardSyncBridge,
    private readonly port: BoardLiveStatePort,
  ) {}

  onModuleInit(): void {
    this.bridge.setStateRequestHandler((boardId, requesterId, requestId) => {
      void this.answer(boardId, requesterId, requestId);
    });
    this.bridge.setStateReplyHandler((reply) => this.onReply(reply));
    this.port.register(this);
  }

  /**
   * Merge the snapshot, the local room and other instances' rooms. Returns null
   * when the board has no content at all.
   *
   * Waiting: PUBLISH returns how many instances are subscribed to the board's
   * request channel — exactly the ones holding a live room — so we wait for
   * that many replies and return immediately when nobody else has the board
   * open. `timeoutMs` only bounds a slow or crashed instance. On Redis Cluster
   * the count is node-local (see requestRemote), so there we wait it out.
   */
  async collect(boardId: string, timeoutMs = DEFAULT_COLLECT_TIMEOUT_MS): Promise<Uint8Array | null> {
    const remote = this.requestRemote(boardId, timeoutMs);
    const [snapshot, local] = await Promise.all([this.snapshots.loadLatest(boardId), this.localState(boardId)]);
    const replies = await remote;
    return this.merge(boardId, [snapshot, local, ...replies]);
  }

  /**
   * Only the other instances' live states, each a well-formed Yjs update, for a
   * caller that applies them to its own room (post-outage catch-up). Skips the
   * snapshot: the local room already holds everything that was ever saved.
   * Never rejects; an unreachable Redis just yields nothing.
   */
  async collectRemote(boardId: string, timeoutMs = DEFAULT_COLLECT_TIMEOUT_MS): Promise<Uint8Array[]> {
    const replies = await this.requestRemote(boardId, timeoutMs);
    return replies.filter((state) => {
      try {
        Y.decodeUpdate(state);
        return true;
      } catch (err) {
        this.logger.warn(`dropped malformed doc state from another instance for board ${boardId}: ${String(err)}`);
        return false;
      }
    });
  }

  private async localState(boardId: string): Promise<Uint8Array | null> {
    const active = this.rooms.getIfActive(boardId);
    if (!active) return null;
    try {
      return (await active).encodeState();
    } catch (err) {
      // A room that failed to load holds nothing the snapshot doesn't.
      this.logger.warn(`local room for board ${boardId} unavailable while collecting: ${String(err)}`);
      return null;
    }
  }

  private requestRemote(boardId: string, timeoutMs: number): Promise<Uint8Array[]> {
    const requestId = randomUUID();
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const request: PendingRequest = {
        states: [],
        received: 0,
        expected: null,
        settle: () => {
          if (timer) clearTimeout(timer);
          this.pending.delete(requestId);
          resolve(request.states);
        },
      };
      // Registered before publishing: a reply can beat PUBLISH's own response.
      this.pending.set(requestId, request);
      timer = setTimeout(() => {
        // Waiting out the window is the normal path on Redis Cluster, not a fault.
        if (!this.bridge.publishCountIsNodeLocal) {
          const missing = (request.expected ?? 0) - request.received;
          this.logger.warn(
            `collected board ${boardId} without ${missing > 0 ? missing : 'some'} instance(s) after ${timeoutMs} ms`,
          );
        }
        request.settle();
      }, timeoutMs);
      this.bridge.publishStateRequest(boardId, requestId).then(
        (receivers) => {
          // PUBLISH's receiver count is what lets us stop waiting early, but on
          // Redis Cluster it counts only subscribers on the node we published
          // to; instances attached to other nodes still receive the request and
          // reply. Trusting it there would drop their state, so wait the window.
          if (this.bridge.publishCountIsNodeLocal) return;
          request.expected = receivers;
          if (request.received >= receivers) request.settle();
        },
        (err: unknown) => {
          this.logger.warn(`state request for board ${boardId} failed, using local state only: ${String(err)}`);
          request.settle();
        },
      );
    });
  }

  private onReply(reply: StateReply): void {
    const request = this.pending.get(reply.requestId);
    if (!request) return; // late (after timeout) or not ours
    request.received += 1;
    if (reply.state.byteLength > 0) request.states.push(reply.state);
    if (request.expected !== null && request.received >= request.expected) request.settle();
  }

  /** Another instance asked: send our live room state, or an empty one so it need not time out. */
  private async answer(boardId: string, requesterId: string, requestId: string): Promise<void> {
    const state = (await this.localState(boardId)) ?? new Uint8Array();
    this.bridge.publishStateReply(requesterId, requestId, state);
  }

  private merge(boardId: string, sources: Array<Uint8Array | null>): Uint8Array | null {
    const doc = new Y.Doc();
    try {
      for (const source of sources) {
        if (!source || source.byteLength === 0) continue;
        try {
          // Decode first: it throws on a malformed update before anything is
          // integrated, so a bad reply cannot leave the merge half-applied.
          Y.decodeUpdate(source);
          Y.applyUpdate(doc, source);
        } catch (err) {
          this.logger.warn(`dropped malformed doc state while collecting board ${boardId}: ${String(err)}`);
        }
      }
      // No structs means no content (deletes only ever target existing structs).
      if (doc.store.clients.size === 0) return null;
      return Y.encodeStateAsUpdate(doc);
    } finally {
      doc.destroy();
    }
  }
}
