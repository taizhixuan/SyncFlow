import { z } from 'zod';
import { boardRoleSchema } from './board.schema';

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
  /**
   * client → server with a socket.io acknowledgement; the server acks with a
   * ClockAck. Client wall clocks disagree, so shared timers run on server time.
   */
  clock: 'board:clock',
  /**
   * server → client, the socket's role on the board changed while connected
   * (e.g. an owner demoted an editor to viewer). The client switches between
   * editable and read-only instead of having its edits silently dropped.
   */
  role: 'board:role',
} as const;

export type SyncEvent = (typeof SYNC_EVENTS)[keyof typeof SYNC_EVENTS];

export const syncErrorSchema = z.object({
  // 'rate-limited' is not terminal: the client backs off and reconnects.
  code: z.enum(['unauthorized', 'forbidden', 'not-found', 'rate-limited']),
  message: z.string(),
});
export type SyncErrorPayload = z.infer<typeof syncErrorSchema>;

export const roleChangeSchema = z.object({ role: boardRoleSchema });
export type RoleChangePayload = z.infer<typeof roleChangeSchema>;

/** Acknowledgement of a `board:clock` request: the server's Date.now() in epoch ms. */
export const clockAckSchema = z.object({
  serverNow: z.number().int().nonnegative(),
});
export type ClockAck = z.infer<typeof clockAckSchema>;

/** Longer than any id we issue (UUIDs, element ids), short enough to bound a state. */
export const MAX_PRESENCE_ID_LENGTH = 128;
/** Display names are shown on cursor labels and avatars; longer ones only serve to deface them. */
export const MAX_PRESENCE_NAME_LENGTH = 100;
/** Enough for any CSS color notation, including hsl()/rgb() with spaces. */
export const MAX_PRESENCE_COLOR_LENGTH = 32;
/** A select-all on a large board; the relay's byte cap on a whole state binds well before this. */
export const MAX_PRESENCE_SELECTION = 10_000;

const coordinate = z.number().finite();

export const presenceUserSchema = z.object({
  id: z.string().min(1).max(MAX_PRESENCE_ID_LENGTH),
  name: z.string().max(MAX_PRESENCE_NAME_LENGTH),
  color: z.string().max(MAX_PRESENCE_COLOR_LENGTH),
});
export type PresenceUser = z.infer<typeof presenceUserSchema>;

export const presenceCursorSchema = z.object({ x: coordinate, y: coordinate });
export type PresenceCursor = z.infer<typeof presenceCursorSchema>;

/** Laser pointer position with the sender's timestamp. */
export const presenceLaserSchema = z.object({ x: coordinate, y: coordinate, t: coordinate });
export type PresenceLaser = z.infer<typeof presenceLaserSchema>;

/** The slide a presenter is on (`frameId` '__board__' = the whole board). */
export const presencePresentingSchema = z.object({
  slideIndex: z.number().int().nonnegative(),
  frameId: z.string().max(MAX_PRESENCE_ID_LENGTH),
});
export type PresencePresenting = z.infer<typeof presencePresentingSchema>;

/**
 * One client's Awareness state as it travels between peers (`board:awareness`).
 * Any member, viewers included, controls their own state, so the relay screens
 * it and every peer re-checks it before rendering. Each field may be absent: a
 * client publishes selection before its identity is known, and peers render
 * only states that carry a `user`. Unknown fields are tolerated (and dropped).
 */
export const awarenessStateSchema = z.object({
  user: presenceUserSchema.nullish(),
  cursor: presenceCursorSchema.nullish(),
  selection: z.array(z.string().max(MAX_PRESENCE_ID_LENGTH)).max(MAX_PRESENCE_SELECTION).optional(),
  laser: presenceLaserSchema.nullish(),
  presenting: presencePresentingSchema.nullish(),
});
export type AwarenessState = z.infer<typeof awarenessStateSchema>;

/** A remote peer's presence as the UI renders it: a valid AwarenessState with a user. */
export interface PresenceState {
  user: PresenceUser;
  cursor: PresenceCursor | null;
  selection: string[];
  /** Ephemeral — Awareness only. */
  laser?: PresenceLaser | null;
  /** Ephemeral — Awareness only, never in the doc. */
  presenting?: PresencePresenting | null;
}
