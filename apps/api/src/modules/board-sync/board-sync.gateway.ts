import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { SYNC_EVENTS } from '@syncflow/shared';
import { TokenService } from '../../auth/token.service';
import { BoardsService } from '../../boards/boards.service';
import { RoomManager } from './room-manager';
import { BoardSyncBridge } from './board-sync-bridge';
import { reconcileToSnapshot } from './restore-reconcile';

interface SocketState {
  userId: string;
  boardId: string;
  role: 'owner' | 'editor' | 'viewer';
}

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class BoardSyncGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(BoardSyncGateway.name);
  private readonly state = new Map<string, SocketState>(); // socket.id -> state
  @WebSocketServer() private server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly boards: BoardsService,
    private readonly rooms: RoomManager,
    private readonly bridge: BoardSyncBridge,
  ) {}

  afterInit(): void {
    // Apply updates from other instances to our in-memory room doc and fan them
    // out to our local clients for this board.
    this.bridge.setUpdateHandler((boardId, update) => {
      void this.applyRemote(boardId, update);
    });
    // Relay awareness (cursors/presence) from other instances to local clients.
    // Awareness is never applied to the room doc or persisted.
    this.bridge.setAwarenessHandler((boardId, update) => {
      this.server.to(boardId).emit(SYNC_EVENTS.awareness, update);
    });
  }

  private async applyRemote(boardId: string, update: Uint8Array): Promise<void> {
    try {
      const room = await this.rooms.getOrCreate(boardId);
      room.applyUpdate(update);
      this.server.to(boardId).emit(SYNC_EVENTS.update, update);
    } catch (err) {
      this.logger.warn(`dropped remote update for board ${boardId}: ${String(err)}`);
    }
  }

  /**
   * Reconcile the live room doc to a restored snapshot's elements (deletes +
   * sets) and broadcast the produced update through the normal sync path so all
   * local clients and other instances converge. Wrapped in try/catch: a
   * bad/legacy snapshot (e.g. non-Yjs bytes) must never crash the REST request —
   * the durable restore snapshot is already persisted before this runs.
   */
  async restoreAndBroadcast(boardId: string, snapshotBytes: Uint8Array): Promise<void> {
    try {
      const room = await this.rooms.getOrCreate(boardId);
      const update = reconcileToSnapshot(room.ydoc, snapshotBytes);
      if (!update) return;
      this.server.to(boardId).emit(SYNC_EVENTS.update, update); // local clients
      this.bridge.publish(boardId, update); // other instances apply + emit
    } catch (err) {
      this.logger.warn(`restoreAndBroadcast failed for board ${boardId}: ${String(err)}`);
    }
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as string | undefined;
      const boardId = socket.handshake.query?.boardId as string | undefined;
      if (!token || !boardId) return this.fail(socket, 'unauthorized', 'Missing token or board');

      let userId: string;
      try {
        userId = this.tokens.verifyAccessToken(token).sub;
      } catch {
        return this.fail(socket, 'unauthorized', 'Invalid token');
      }

      const role = await this.boards.getMemberRole(boardId, userId);
      if (!role) return this.fail(socket, 'forbidden', 'Not a member of this board');

      this.state.set(socket.id, { userId, boardId, role });
      await socket.join(boardId);

      const room = await this.rooms.getOrCreate(boardId);
      room.addClient();
      this.bridge.register(boardId);
      // initial server → client sync (full state)
      socket.emit(SYNC_EVENTS.serverSync, room.encodeState());
      // Ask peers already in the room (this instance) to re-broadcast their
      // Awareness so this newcomer renders their cursors/names right away.
      // The doc is delivered above; awareness has no server-side state to replay.
      socket.to(boardId).emit(SYNC_EVENTS.awarenessRequest);
    } catch (err) {
      this.logger.error(`connection error: ${String(err)}`);
      this.fail(socket, 'unauthorized', 'Connection failed');
    }
  }

  @SubscribeMessage(SYNC_EVENTS.clientSync)
  async onClientSync(@ConnectedSocket() socket: Socket, @MessageBody() update: unknown): Promise<void> {
    const st = this.state.get(socket.id);
    if (!st) return;
    if (st.role === 'viewer') {
      this.logger.warn(`dropped client-sync from viewer ${st.userId} on board ${st.boardId}`);
      return;
    }
    await this.safeRelay(socket, st, update);
  }

  @SubscribeMessage(SYNC_EVENTS.update)
  async onUpdate(@ConnectedSocket() socket: Socket, @MessageBody() update: unknown): Promise<void> {
    const st = this.state.get(socket.id);
    if (!st) return;
    if (st.role === 'viewer') {
      this.logger.warn(`dropped update from viewer ${st.userId} on board ${st.boardId}`);
      return;
    }
    await this.safeRelay(socket, st, update);
  }

  /**
   * Relay awareness (cursors, selections) from one client to all other clients in
   * the room — both on this instance and on other instances via Redis.
   * Awareness is NOT applied to the room doc and NOT persisted.
   * Viewers are allowed: they have cursors too.
   */
  @SubscribeMessage(SYNC_EVENTS.awareness)
  async onAwareness(@ConnectedSocket() socket: Socket, @MessageBody() raw: unknown): Promise<void> {
    const st = this.state.get(socket.id);
    if (!st) return;
    const bytes =
      raw instanceof Uint8Array ? raw
      : raw instanceof ArrayBuffer ? new Uint8Array(raw)
      : ArrayBuffer.isView(raw) ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
      : null;
    if (!bytes) return; // drop non-binary
    socket.to(st.boardId).emit(SYNC_EVENTS.awareness, bytes); // same-instance peers
    this.bridge.publishAwareness(st.boardId, bytes);           // other instances
  }

  /** Validate, parse, apply and fan out an inbound binary payload; never throws. */
  private async safeRelay(socket: Socket, st: SocketState, raw: unknown): Promise<void> {
    const bytes =
      raw instanceof Uint8Array
        ? raw
        : raw instanceof ArrayBuffer
          ? new Uint8Array(raw)
          : ArrayBuffer.isView(raw)
            ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
            : null;
    if (!bytes) {
      this.logger.warn(`dropped non-binary payload on board ${st.boardId}`);
      return;
    }
    try {
      await this.relay(socket, st, bytes);
    } catch (err) {
      this.logger.warn(`dropped unparseable update on board ${st.boardId}: ${String(err)}`);
    }
  }

  private async relay(socket: Socket, st: SocketState, update: Uint8Array): Promise<void> {
    const room = await this.rooms.getOrCreate(st.boardId);
    room.applyUpdate(update);
    // fan out to other clients on THIS instance...
    socket.to(st.boardId).emit(SYNC_EVENTS.update, update);
    // ...and to clients on OTHER instances via Redis.
    this.bridge.publish(st.boardId, update);
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const st = this.state.get(socket.id);
    if (!st) return;
    this.state.delete(socket.id);
    const room = await this.rooms.getOrCreate(st.boardId);
    const remaining = room.removeClient();
    this.bridge.unregister(st.boardId);
    if (remaining === 0) {
      try {
        await this.rooms.flushNow(st.boardId);
      } catch (err) {
        this.logger.warn(`snapshot flush on disconnect failed for board ${st.boardId}: ${String(err)}`);
      }
    }
  }

  private fail(socket: Socket, code: 'unauthorized' | 'forbidden' | 'not-found', message: string): void {
    socket.emit(SYNC_EVENTS.error, { code, message });
    socket.disconnect(true);
  }
}
