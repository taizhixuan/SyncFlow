import * as Y from 'yjs';
import type { Socket } from 'socket.io';
import { SYNC_EVENTS } from '@syncflow/shared';
import { BoardSyncGateway } from './board-sync.gateway';
import type { Room } from './room-manager';
import type { TokenService } from '../../auth/token.service';
import type { BoardsService } from '../../boards/boards.service';
import type { RoomManager } from './room-manager';
import type { BoardSyncBridge } from './board-sync-bridge';

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

function makeBridge() {
  return {
    setUpdateHandler: jest.fn(),
    setAwarenessHandler: jest.fn(),
    publish: jest.fn(),
    publishAwareness: jest.fn(),
    register: jest.fn(),
    unregister: jest.fn(),
  };
}

async function setup(role: Role, room = makeRoom()) {
  const tokens = { verifyAccessToken: jest.fn(() => ({ sub: 'u1', email: 'e@t' })) };
  const boards = { getMemberRole: jest.fn(async () => role) };
  const rooms = { getOrCreate: jest.fn(async () => room), flushNow: jest.fn() };
  const bridge = makeBridge();
  const gateway = new BoardSyncGateway(
    tokens as unknown as TokenService,
    boards as unknown as BoardsService,
    rooms as unknown as RoomManager,
    bridge as unknown as BoardSyncBridge,
  );
  const socket = makeSocket();
  await gateway.handleConnection(socket as unknown as Socket);
  return { gateway, socket, room, tokens, boards, rooms, bridge };
}

describe('BoardSyncGateway guard branches', () => {
  it('drops viewer writes: no applyUpdate, no relay broadcast', async () => {
    const { gateway, socket, room } = await setup('viewer');
    await gateway.onUpdate(socket as unknown as Socket, new Uint8Array([0]));
    await gateway.onClientSync(socket as unknown as Socket, new Uint8Array([0]));
    expect(room.applyUpdate).not.toHaveBeenCalled();
    // No doc broadcast from a viewer write. (socket.to is used at connect for the
    // awareness-request, so assert specifically that no update was relayed.)
    expect(socket.relayEmit).not.toHaveBeenCalledWith(SYNC_EVENTS.update, expect.anything());
  });

  it('editor happy path: applyUpdate once and broadcast to others', async () => {
    const { gateway, socket, room, bridge } = await setup('editor');
    const update = validUpdate();
    await gateway.onUpdate(socket as unknown as Socket, update);
    expect(room.applyUpdate).toHaveBeenCalledTimes(1);
    expect(socket.to).toHaveBeenCalledWith('b1');
    expect(socket.relayEmit).toHaveBeenCalledWith(SYNC_EVENTS.update, expect.any(Uint8Array));
    expect(bridge.publish).toHaveBeenCalledWith('b1', expect.any(Uint8Array));
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

describe('BoardSyncGateway bridge wiring', () => {
  it('calls bridge.register with the board id on successful connection', async () => {
    const { bridge } = await setup('editor');
    expect(bridge.register).toHaveBeenCalledWith('b1');
  });

  it('asks existing peers to re-broadcast awareness when a new client joins', async () => {
    // The relay keeps no awareness state, so a join must prompt present peers to
    // re-send theirs — otherwise the newcomer never sees idle cursors/names.
    const { socket } = await setup('editor');
    expect(socket.to).toHaveBeenCalledWith('b1');
    expect(socket.relayEmit).toHaveBeenCalledWith(SYNC_EVENTS.awarenessRequest);
  });

  it('calls bridge.unregister with the board id on disconnect', async () => {
    const { gateway, socket, bridge } = await setup('editor');
    await gateway.handleDisconnect(socket as unknown as Socket);
    expect(bridge.unregister).toHaveBeenCalledWith('b1');
  });

  it('wires both bridge handlers (update + awareness) on afterInit', async () => {
    const { gateway, bridge } = await setup('editor');
    gateway.afterInit();
    expect(bridge.setUpdateHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(bridge.setAwarenessHandler).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe('BoardSyncGateway awareness relay', () => {
  it('relays awareness to same-instance peers and publishes via bridge', async () => {
    const { gateway, socket, bridge } = await setup('editor');
    const bytes = new Uint8Array([1, 2]);
    await gateway.onAwareness(socket as unknown as Socket, bytes);
    expect(socket.to).toHaveBeenCalledWith('b1');
    expect(socket.relayEmit).toHaveBeenCalledWith(SYNC_EVENTS.awareness, bytes);
    expect(bridge.publishAwareness).toHaveBeenCalledWith('b1', bytes);
  });

  it('allows viewers to send awareness (no role gate)', async () => {
    const { gateway, socket, bridge } = await setup('viewer');
    const bytes = new Uint8Array([3]);
    await gateway.onAwareness(socket as unknown as Socket, bytes);
    expect(bridge.publishAwareness).toHaveBeenCalledWith('b1', bytes);
  });

  it('drops non-binary awareness payload without throwing', async () => {
    const { gateway, socket, bridge } = await setup('editor');
    await expect(
      gateway.onAwareness(socket as unknown as Socket, 'not-binary'),
    ).resolves.toBeUndefined();
    expect(bridge.publishAwareness).not.toHaveBeenCalled();
  });
});
