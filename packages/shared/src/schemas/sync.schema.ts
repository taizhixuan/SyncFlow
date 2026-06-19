import { z } from 'zod';

/** Socket.io event names for the board sync channel. Colon-namespaced kebab. */
export const SYNC_EVENTS = {
  /** client → server, after connect, to join the board room */
  join: 'board:join',
  /** server → client, full Yjs state on join (Y.encodeStateAsUpdate) */
  serverSync: 'board:sync',
  /** client → server, the client's full state on join (merges offline edits) */
  clientSync: 'board:client-sync',
  /** both directions, an incremental Yjs update (Y.encodeStateAsUpdate diff) */
  update: 'board:update',
  /** server → client, a fatal handshake/authorization error */
  error: 'board:error',
  /** both directions, Yjs Awareness update (ephemeral cursor/selection/presence) */
  awareness: 'board:awareness',
  /**
   * server → existing clients, emitted when a new client joins the room.
   * The relay holds no awareness state, so existing peers must re-broadcast
   * their full Awareness so the newcomer can render their cursors/names.
   */
  awarenessRequest: 'board:awareness-request',
} as const;

export type SyncEvent = (typeof SYNC_EVENTS)[keyof typeof SYNC_EVENTS];

export const syncErrorSchema = z.object({
  code: z.enum(['unauthorized', 'forbidden', 'not-found']),
  message: z.string(),
});
export type SyncErrorPayload = z.infer<typeof syncErrorSchema>;

export const presenceUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});
export type PresenceUser = z.infer<typeof presenceUserSchema>;

export interface PresenceState {
  user: PresenceUser;
  cursor: { x: number; y: number } | null;
  selection: string[];
  /** Laser pointer position with timestamp for fade-out. Ephemeral — Awareness only. */
  laser?: { x: number; y: number; t: number } | null;
  /** Current slide the presenter is on. Ephemeral — Awareness only, never in the doc. */
  presenting?: { slideIndex: number; frameId: string } | null;
}
