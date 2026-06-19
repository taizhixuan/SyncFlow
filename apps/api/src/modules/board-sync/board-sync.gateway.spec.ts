import * as Y from 'yjs';
import type { Socket } from 'socket.io';
import { SYNC_EVENTS } from '@syncflow/shared';
import { BoardSyncGateway } from './board-sync.gateway';
import type { Room } from './room-manager';
import type { TokenService } from '../../auth/token.service';
import type { BoardsService } from '../../boards/boards.service';
import type { RoomManager } from './room-manager';

type Role = 'owner' | 'editor' | 'viewer';

function makeRoom() {
  return {
    boardId: 'b1',
    ydoc: new Y.Doc(),
    applyUpdate: jest.fn(),
    encodeState: jest.fn(() => new Uint8Array()),
    addClient: jest.fn(),
    removeClient: jest.fn(() => 0),
  };
}

function makeSocket() {
  const relayEmit = jest.fn();
  return {
    id: 's1',
    handshake: { auth: { token: 't' }, query: { boardId: 'b1' } },
    join: jest.fn(),
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: relayEmit })),
    disconnect: jest.fn(),
    relayEmit,
  };
}

function validUpdate(): Uint8Array {
  const d = new Y.Doc();
  d.getMap('elements').set('a', new Y.Map());
  return Y.encodeStateAsUpdate(d);
}

async function setup(role: Role, room = makeRoom()) {
  const tokens = { verifyAccessToken: jest.fn(() => ({ sub: 'u1', email: 'e@t' })) };
  const boards = { getMemberRole: jest.fn(async () => role) };
  const rooms = { getOrCreate: jest.fn(async () => room), flushNow: jest.fn() };
  const gateway = new BoardSyncGateway(
    tokens as unknown as TokenService,
    boards as unknown as BoardsService,
    rooms as unknown as RoomManager,
  );
  const socket = makeSocket();
  await gateway.handleConnection(socket as unknown as Socket);
  return { gateway, socket, room, tokens, boards, rooms };
}

describe('BoardSyncGateway guard branches', () => {
  it('drops viewer writes: no applyUpdate, no relay broadcast', async () => {
    const { gateway, socket, room } = await setup('viewer');
    await gateway.onUpdate(socket as unknown as Socket, new Uint8Array([0]));
    await gateway.onClientSync(socket as unknown as Socket, new Uint8Array([0]));
    expect(room.applyUpdate).not.toHaveBeenCalled();
    expect(socket.to).not.toHaveBeenCalled();
  });

  it('editor happy path: applyUpdate once and broadcast to others', async () => {
    const { gateway, socket, room } = await setup('editor');
    const update = validUpdate();
    await gateway.onUpdate(socket as unknown as Socket, update);
    expect(room.applyUpdate).toHaveBeenCalledTimes(1);
    expect(socket.to).toHaveBeenCalledWith('b1');
    expect(socket.relayEmit).toHaveBeenCalledWith(SYNC_EVENTS.update, expect.any(Uint8Array));
  });

  it('drops a non-binary payload without throwing and without applyUpdate', async () => {
    const { gateway, socket, room } = await setup('editor');
    await expect(
      gateway.onUpdate(socket as unknown as Socket, 'not-binary'),
    ).resolves.toBeUndefined();
    expect(room.applyUpdate).not.toHaveBeenCalled();
  });

  it('is non-fatal when applyUpdate throws on an unparseable update', async () => {
    const room = makeRoom();
    room.applyUpdate = jest.fn(() => {
      throw new Error('bad');
    });
    const { gateway, socket } = await setup('editor', room);
    await expect(
      gateway.onUpdate(socket as unknown as Socket, validUpdate()),
    ).resolves.toBeUndefined();
    expect(room.applyUpdate).toHaveBeenCalledTimes(1);
  });
});
