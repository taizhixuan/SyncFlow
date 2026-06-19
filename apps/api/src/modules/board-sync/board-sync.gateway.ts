import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { SYNC_EVENTS } from '@syncflow/shared';
import { TokenService } from '../../auth/token.service';
import { BoardsService } from '../../boards/boards.service';
import { RoomManager } from './room-manager';

interface SocketState {
  userId: string;
  boardId: string;
  role: 'owner' | 'editor' | 'viewer';
}

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class BoardSyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(BoardSyncGateway.name);
  private readonly state = new Map<string, SocketState>(); // socket.id -> state

  constructor(
    private readonly tokens: TokenService,
    private readonly boards: BoardsService,
    private readonly rooms: RoomManager,
  ) {}

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
      // initial server → client sync (full state)
      socket.emit(SYNC_EVENTS.serverSync, room.encodeState());
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
    // fan out to everyone else in the room (this instance only — Redis in S2)
    socket.to(st.boardId).emit(SYNC_EVENTS.update, update);
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const st = this.state.get(socket.id);
    if (!st) return;
    this.state.delete(socket.id);
    const room = await this.rooms.getOrCreate(st.boardId);
    const remaining = room.removeClient();
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
