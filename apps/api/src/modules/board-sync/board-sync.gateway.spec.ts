import * as Y from 'yjs';
import type { Socket } from 'socket.io';
import { SYNC_EVENTS, clockAckSchema } from '@syncflow/shared';
import { BoardSyncGateway } from './board-sync.gateway';
import type { TokenService } from '../../auth/token.service';
import type { BoardsService } from '../../boards/boards.service';
import { BoardAccessEvents, type BoardAccessChange } from '../../boards/board-access-events';
import type { RedisService } from '../../redis/redis.service';
import type { RoomManager } from './room-manager';
import type { BoardSyncBridge } from './board-sync-bridge';
import type { SnapshotService } from './snapshot.service';
import type { BoardLiveState } from './board-live-state';
import { decodeAwarenessUpdate } from './awareness-codec';

type Role = 'owner' | 'editor' | 'viewer';

function makeRoom() {
  return {
    boardId: 'b1',
    ydoc: new Y.Doc(),
    applyUpdate: jest.fn(),
    encodeState: jest.fn(() => new Uint8Array()),
    addClient: jest.fn(),
    removeClient: jest.fn(() => 0),
    clients: jest.fn(() => 1),
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
    setAwarenessRequestHandler: jest.fn(),
    setAccessHandler: jest.fn(),
    publish: jest.fn(),
    publishAwareness: jest.fn(),
    publishAwarenessRequest: jest.fn(),
    register: jest.fn(),
    unregister: jest.fn(),
  };
}

function makeRooms(room: ReturnType<typeof makeRoom>) {
  return {
    getOrCreate: jest.fn(async () => room),
    acquire: jest.fn(async () => {
      room.addClient();
      return room;
    }),
    getIfActive: jest.fn((): Promise<ReturnType<typeof makeRoom>> | null => Promise.resolve(room)),
    releaseIdle: jest.fn(async () => undefined),
    flushAll: jest.fn(async () => undefined),
  };
}

function makeServer() {
  const roomEmit = jest.fn();
  return {
    to: jest.fn(() => ({ emit: roomEmit })),
    sockets: { sockets: new Map<string, unknown>() },
    roomEmit,
  };
}

function makeAccess(): BoardAccessEvents {
  const redis = { getClient: () => ({ publish: jest.fn(async () => 1) }) };
  return new BoardAccessEvents(redis as unknown as RedisService);
}

function makeSnapshots() {
  return {
    getByVersion: jest.fn(async (): Promise<Uint8Array | null> => null),
    loadLatest: jest.fn(async (): Promise<Uint8Array | null> => null),
    save: jest.fn(async () => 7),
  };
}

interface Deps {
  role?: Role;
  room?: ReturnType<typeof makeRoom>;
  tokenPayload?: Record<string, unknown>;
  revoked?: boolean;
}

function build(deps: Deps, role: () => Promise<Role | null>) {
  const room = deps.room ?? makeRoom();
  const tokens = {
    verifyAccessToken: jest.fn(() => deps.tokenPayload ?? { sub: 'u1', email: 'e@t' }),
    isAccessTokenRevoked: jest.fn(async () => deps.revoked ?? false),
  };
  const boards = { getMemberRole: jest.fn(role) };
  const rooms = makeRooms(room);
  const bridge = makeBridge();
  const snapshots = makeSnapshots();
  const access = makeAccess();
  const server = makeServer();
  const liveState = { collect: jest.fn(async (): Promise<Uint8Array | null> => null) };
  const gateway = new BoardSyncGateway(
    tokens as unknown as TokenService,
    boards as unknown as BoardsService,
    rooms as unknown as RoomManager,
    bridge as unknown as BoardSyncBridge,
    snapshots as unknown as SnapshotService,
    access,
    liveState as unknown as BoardLiveState,
  );
  (gateway as unknown as { server: typeof server }).server = server;
  const socket = makeSocket();
  server.sockets.sockets.set(socket.id, socket);
  return { gateway, socket, room, tokens, boards, rooms, bridge, snapshots, access, server, liveState };
}

async function setup(roleOrDeps: Role | Deps, roomArg?: ReturnType<typeof makeRoom>) {
  const deps: Deps =
    typeof roleOrDeps === 'string' ? { role: roleOrDeps, room: roomArg } : roleOrDeps;
  const ctx = build(deps, async () => deps.role ?? 'editor');
  await ctx.gateway.handleConnection(ctx.socket as unknown as Socket);
  return ctx;
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

  it('asks peers on other instances for their awareness too', async () => {
    const { bridge } = await setup('editor');
    expect(bridge.publishAwarenessRequest).toHaveBeenCalledWith('b1');
  });

  it('calls bridge.unregister with the board id on disconnect', async () => {
    const { gateway, socket, bridge } = await setup('editor');
    await gateway.handleDisconnect(socket as unknown as Socket);
    expect(bridge.unregister).toHaveBeenCalledWith('b1');
  });

  it('releases the bridge subscription when loading the room fails', async () => {
    const ctx = build({ role: 'editor' }, async () => 'editor');
    ctx.rooms.acquire.mockRejectedValueOnce(new Error('db down'));
    await ctx.gateway.handleConnection(ctx.socket as unknown as Socket);
    expect(ctx.bridge.register).toHaveBeenCalledWith('b1');
    expect(ctx.bridge.unregister).toHaveBeenCalledWith('b1');
    expect(ctx.socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('wires every bridge handler on afterInit', async () => {
    const { gateway, bridge } = await setup('editor');
    gateway.afterInit();
    expect(bridge.setUpdateHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(bridge.setAwarenessHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(bridge.setAwarenessRequestHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(bridge.setAccessHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  it('relays a remote awareness request to local clients of the board', async () => {
    const { gateway, bridge, server } = await setup('editor');
    gateway.afterInit();
    const handler = bridge.setAwarenessRequestHandler.mock.calls[0]![0] as (b: string) => void;
    handler('b1');
    expect(server.to).toHaveBeenCalledWith('b1');
    expect(server.roomEmit).toHaveBeenCalledWith(SYNC_EVENTS.awarenessRequest);
  });

  it('ignores a remote update for a board with no live room here', async () => {
    const { gateway, bridge, rooms, room } = await setup('editor');
    gateway.afterInit();
    rooms.getIfActive.mockReturnValue(null);
    const handler = bridge.setUpdateHandler.mock.calls[0]![0] as (b: string, u: Uint8Array) => void;
    handler('other-board', validUpdate());
    await new Promise((r) => setImmediate(r));
    expect(rooms.getOrCreate).not.toHaveBeenCalled();
    expect(room.applyUpdate).not.toHaveBeenCalled();
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

describe('BoardSyncGateway handshake race', () => {
  // The real client emits client-sync (and flushes buffered offline updates) the
  // moment socket.io reports 'connect' — which is before handleConnection has
  // finished its async membership lookup. Those messages must wait, not vanish.
  function deferredSetup() {
    let resolveRole!: (role: Role | null) => void;
    const ctx = build({}, () => new Promise<Role | null>((r) => (resolveRole = r)));
    return { ...ctx, resolveRole: (r: Role | null) => resolveRole(r) };
  }

  it('applies a client-sync that arrives before the membership lookup resolves', async () => {
    const { gateway, socket, room, bridge, resolveRole } = deferredSetup();
    const connecting = gateway.handleConnection(socket as unknown as Socket);
    const update = validUpdate();
    const syncing = gateway.onClientSync(socket as unknown as Socket, update);
    resolveRole('editor');
    await Promise.all([connecting, syncing]);
    expect(room.applyUpdate).toHaveBeenCalledWith(update);
    expect(bridge.publish).toHaveBeenCalledWith('b1', update);
  });

  it('still drops an early update from a viewer once the role resolves', async () => {
    const { gateway, socket, room, resolveRole } = deferredSetup();
    const connecting = gateway.handleConnection(socket as unknown as Socket);
    const updating = gateway.onUpdate(socket as unknown as Socket, validUpdate());
    resolveRole('viewer');
    await Promise.all([connecting, updating]);
    expect(room.applyUpdate).not.toHaveBeenCalled();
  });

  it('drops early messages from a socket whose handshake is rejected', async () => {
    const { gateway, socket, room, resolveRole } = deferredSetup();
    const connecting = gateway.handleConnection(socket as unknown as Socket);
    const syncing = gateway.onClientSync(socket as unknown as Socket, validUpdate());
    resolveRole(null);
    await Promise.all([connecting, syncing]);
    expect(room.applyUpdate).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('releases the room client slot when the socket drops mid-handshake', async () => {
    const { gateway, socket, room, rooms, resolveRole } = deferredSetup();
    const connecting = gateway.handleConnection(socket as unknown as Socket);
    const disconnecting = gateway.handleDisconnect(socket as unknown as Socket);
    resolveRole('editor');
    await Promise.all([connecting, disconnecting]);
    expect(room.addClient).toHaveBeenCalledTimes(1);
    expect(room.removeClient).toHaveBeenCalledTimes(1);
    expect(rooms.releaseIdle).toHaveBeenCalledWith('b1');
  });
});

describe('BoardSyncGateway options', () => {
  it('raises the socket payload cap above the 1 MB default, but bounded', () => {
    const opts = Reflect.getMetadata('websockets:gateway_options', BoardSyncGateway) as {
      maxHttpBufferSize?: number;
    };
    expect(opts.maxHttpBufferSize).toBe(8 * 1024 * 1024);
  });
});

/** An awareness update announcing `clientId` at `clock` with a non-null state. */
function awarenessFrom(clientId: number, clock: number): Uint8Array {
  const json = Buffer.from('{"user":{"name":"A"}}', 'utf8');
  return new Uint8Array([1, clientId, clock, json.length, ...json]);
}

describe('BoardSyncGateway awareness cleanup on disconnect', () => {
  it('broadcasts removal of the clientIDs the socket announced', async () => {
    const { gateway, socket, server, bridge } = await setup('editor');
    await gateway.onAwareness(socket as unknown as Socket, awarenessFrom(42, 3));
    await gateway.handleDisconnect(socket as unknown as Socket);

    const call = server.roomEmit.mock.calls.find((c) => c[0] === SYNC_EVENTS.awareness);
    expect(call).toBeDefined();
    expect(decodeAwarenessUpdate(call![1] as Uint8Array)).toEqual([
      { clientId: 42, clock: 4, removed: true },
    ]);
    const published = bridge.publishAwareness.mock.calls.at(-1)![1] as Uint8Array;
    expect(decodeAwarenessUpdate(published)).toEqual([{ clientId: 42, clock: 4, removed: true }]);
  });

  it('sends nothing for a client that already announced its own removal', async () => {
    const { gateway, socket, server } = await setup('editor');
    const nul = Buffer.from('null', 'utf8');
    await gateway.onAwareness(socket as unknown as Socket, awarenessFrom(42, 3));
    await gateway.onAwareness(
      socket as unknown as Socket,
      new Uint8Array([1, 42, 4, nul.length, ...nul]),
    );
    await gateway.handleDisconnect(socket as unknown as Socket);
    expect(server.roomEmit).not.toHaveBeenCalledWith(SYNC_EVENTS.awareness, expect.anything());
  });
});

describe('BoardSyncGateway access token expiry', () => {
  it('drops writes and disconnects once the access token has expired', async () => {
    const past = Math.floor(Date.now() / 1000) - 1;
    const { gateway, socket, room } = await setup({
      role: 'editor',
      tokenPayload: { sub: 'u1', exp: past },
    });
    await gateway.onUpdate(socket as unknown as Socket, validUpdate());
    expect(room.applyUpdate).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      SYNC_EVENTS.error,
      expect.objectContaining({ code: 'unauthorized' }),
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('accepts writes while the token is still valid', async () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const { gateway, socket, room } = await setup({
      role: 'editor',
      tokenPayload: { sub: 'u1', exp: future },
    });
    await gateway.onUpdate(socket as unknown as Socket, validUpdate());
    expect(room.applyUpdate).toHaveBeenCalledTimes(1);
    await gateway.handleDisconnect(socket as unknown as Socket); // clears the expiry timer
  });
});

describe('BoardSyncGateway membership changes', () => {
  async function change(access: BoardAccessEvents, c: BoardAccessChange): Promise<void> {
    access.publish(c);
    await new Promise((r) => setImmediate(r));
  }

  it('stops writes immediately when an editor is demoted to viewer', async () => {
    const ctx = await setup('editor');
    ctx.gateway.afterInit();
    ctx.boards.getMemberRole.mockResolvedValue('viewer');
    await change(ctx.access, { boardId: 'b1', userId: 'u1' });
    await ctx.gateway.onUpdate(ctx.socket as unknown as Socket, validUpdate());
    expect(ctx.room.applyUpdate).not.toHaveBeenCalled();
    expect(ctx.socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects the sockets of a removed member', async () => {
    const ctx = await setup('editor');
    ctx.gateway.afterInit();
    ctx.boards.getMemberRole.mockResolvedValue(null);
    await change(ctx.access, { boardId: 'b1', userId: 'u1' });
    expect(ctx.socket.emit).toHaveBeenCalledWith(
      SYNC_EVENTS.error,
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(ctx.socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects everyone when the board is deleted (userId null)', async () => {
    const ctx = await setup('owner');
    ctx.gateway.afterInit();
    ctx.boards.getMemberRole.mockResolvedValue(null);
    await change(ctx.access, { boardId: 'b1', userId: null });
    expect(ctx.socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('leaves other users and other boards alone', async () => {
    const ctx = await setup('editor');
    ctx.gateway.afterInit();
    ctx.boards.getMemberRole.mockResolvedValue(null);
    await change(ctx.access, { boardId: 'b1', userId: 'someone-else' });
    await change(ctx.access, { boardId: 'b2', userId: 'u1' });
    expect(ctx.socket.disconnect).not.toHaveBeenCalled();
  });

  it('routes access messages from other instances through BoardAccessEvents', async () => {
    const ctx = await setup('editor');
    ctx.gateway.afterInit();
    ctx.boards.getMemberRole.mockResolvedValue(null);
    const handler = ctx.bridge.setAccessHandler.mock.calls[0]![0] as (
      b: string,
      p: Uint8Array,
    ) => void;
    handler('b1', Buffer.from(JSON.stringify({ origin: 'another-instance', userId: 'u1' })));
    await new Promise((r) => setImmediate(r));
    expect(ctx.socket.disconnect).toHaveBeenCalledWith(true);
  });
});

describe('BoardSyncGateway shutdown', () => {
  it('flushes every room before the app shuts down', async () => {
    const { gateway, rooms } = await setup('editor');
    await gateway.onModuleDestroy();
    expect(rooms.flushAll).toHaveBeenCalledTimes(1);
  });
});

function docWith(ids: string[]): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => {
    for (const id of ids) {
      const el = new Y.Map<unknown>();
      el.set('id', id);
      doc.getMap('elements').set(id, el);
    }
  });
  return doc;
}

describe('BoardSyncGateway.restoreVersion', () => {
  it('returns null for a missing version', async () => {
    const { gateway, snapshots } = await setup('editor');
    await expect(gateway.restoreVersion('b1', 9, 'u1')).resolves.toBeNull();
    expect(snapshots.save).not.toHaveBeenCalled();
  });

  it('reconciles against the merged live state of every instance, and publishes it', async () => {
    const { gateway, snapshots, rooms, bridge, liveState } = await setup('editor');
    rooms.getIfActive.mockReturnValue(null);
    // `latest` includes an edit (b) that only another instance's room holds so far.
    const latest = docWith(['a', 'b']);
    const target = new Y.Doc();
    Y.applyUpdate(target, Y.encodeStateAsUpdate(latest));
    target.getMap('elements').delete('b');
    snapshots.getByVersion.mockResolvedValue(Y.encodeStateAsUpdate(target));
    liveState.collect.mockResolvedValue(Y.encodeStateAsUpdate(latest));

    await expect(gateway.restoreVersion('b1', 1, 'u1')).resolves.toBe(7);
    expect(liveState.collect).toHaveBeenCalledWith('b1');
    expect(snapshots.loadLatest).not.toHaveBeenCalled();

    // A live room on another instance (holding `latest`) converges on the publish.
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(latest));
    const published = bridge.publish.mock.calls.at(-1)![1] as Uint8Array;
    Y.applyUpdate(peer, published);
    expect(Object.keys(peer.getMap('elements').toJSON())).toEqual(['a']);
    // The persisted restore is the reconciled forward state, not the old bytes.
    const saved = snapshots.save.mock.calls.at(-1) as unknown as [string, Uint8Array, string, string];
    expect(saved[2]).toBe('u1');
    expect(saved[3]).toBe('restore');
    const persisted = new Y.Doc();
    Y.applyUpdate(persisted, saved[1]);
    expect(Object.keys(persisted.getMap('elements').toJSON())).toEqual(['a']);
  });

  it('applies the restore to the local live room and fans it out locally and cross-instance', async () => {
    const room = makeRoom();
    const current = Y.encodeStateAsUpdate(docWith(['a', 'b']));
    const { gateway, snapshots, bridge, server, liveState } = await setup({ role: 'editor', room });
    liveState.collect.mockResolvedValue(current);
    snapshots.getByVersion.mockResolvedValue(Y.encodeStateAsUpdate(docWith(['a'])));
    await gateway.restoreVersion('b1', 1, 'u1');

    const update = room.applyUpdate.mock.calls.at(-1)![0] as Uint8Array;
    expect(server.roomEmit).toHaveBeenCalledWith(SYNC_EVENTS.update, update);
    expect(bridge.publish).toHaveBeenCalledWith('b1', update);
    const client = new Y.Doc();
    Y.applyUpdate(client, current);
    Y.applyUpdate(client, update);
    expect(Object.keys(client.getMap('elements').toJSON())).toEqual(['a']);
  });
});

describe('BoardSyncGateway revoked access tokens', () => {
  // Logout and refresh-reuse detection denylist the access token's jti; a
  // socket must not be able to open a session with it until it expires.
  it('rejects a handshake whose token was revoked', async () => {
    const { socket, boards, tokens } = await setup({
      role: 'editor',
      tokenPayload: { sub: 'u1', email: 'e@t', jti: 'j-1' },
      revoked: true,
    });
    expect(tokens.isAccessTokenRevoked).toHaveBeenCalledWith('j-1');
    expect(socket.emit).toHaveBeenCalledWith(
      SYNC_EVENTS.error,
      expect.objectContaining({ code: 'unauthorized' }),
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(boards.getMemberRole).not.toHaveBeenCalled();
  });

  it('admits a token whose jti is not revoked', async () => {
    const { socket, boards } = await setup({
      role: 'editor',
      tokenPayload: { sub: 'u1', email: 'e@t', jti: 'j-2' },
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(boards.getMemberRole).toHaveBeenCalledWith('b1', 'u1');
  });
});

describe('BoardSyncGateway server clock', () => {
  it('acks an admitted socket with the server time, viewers included', async () => {
    const { gateway, socket } = await setup('viewer');
    const before = Date.now();
    const ack = await gateway.onClock(socket as unknown as Socket);
    expect(clockAckSchema.parse(ack).serverNow).toBeGreaterThanOrEqual(before);
    expect(ack!.serverNow).toBeLessThanOrEqual(Date.now());
  });

  it('waits for the handshake before answering', async () => {
    let resolveRole!: (r: Role) => void;
    const ctx = build({}, () => new Promise<Role>((r) => (resolveRole = r)));
    const connecting = ctx.gateway.handleConnection(ctx.socket as unknown as Socket);
    const pending = ctx.gateway.onClock(ctx.socket as unknown as Socket);
    resolveRole('editor');
    await connecting;
    await expect(pending).resolves.toEqual({ serverNow: expect.any(Number) });
  });

  it('does not ack a socket whose handshake was rejected', async () => {
    const ctx = build({}, async () => null);
    await ctx.gateway.handleConnection(ctx.socket as unknown as Socket);
    await expect(ctx.gateway.onClock(ctx.socket as unknown as Socket)).resolves.toBeUndefined();
  });
});
