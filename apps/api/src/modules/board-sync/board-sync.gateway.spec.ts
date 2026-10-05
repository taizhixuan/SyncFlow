import * as Y from 'yjs';
import type { Socket } from 'socket.io';
import { SYNC_EVENTS, clockAckSchema } from '@syncflow/shared';
import { BoardSyncGateway } from './board-sync.gateway';
import type { TokenService } from '../../auth/token.service';
import type { BoardsService } from '../../boards/boards.service';
import { BoardAccessEvents, type BoardAccessChange } from '../../boards/board-access-events';
import type { RedisService } from '../../redis/redis.service';
import type { RoomManager } from './room-manager';
import type { BoardSyncBridge, ClaimMessage } from './board-sync-bridge';
import { CLAIM_REFRESH_INTERVAL_MS } from './awareness-guard';
import type { SnapshotService } from './snapshot.service';
import type { BoardLiveState } from './board-live-state';
import { decodeAwarenessEntries, decodeAwarenessUpdate, encodeAwarenessUpdate } from './awareness-codec';
import { ABUSE_DISCONNECT_MS, RATE_LIMITS } from './socket-rate-limiter';

type Role = 'owner' | 'editor' | 'viewer';

function makeRoom() {
  return {
    boardId: 'b1',
    ydoc: new Y.Doc(),
    applyUpdate: jest.fn(),
    encodeState: jest.fn((): Uint8Array => new Uint8Array()),
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
    disconnected: false,
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
    setResyncHandler: jest.fn(),
    setClaimHandler: jest.fn(),
    publishClaims: jest.fn(),
    publish: jest.fn(),
    publishAwareness: jest.fn(),
    publishAwarenessRequest: jest.fn(),
    register: jest.fn(async (): Promise<void> => undefined),
    unregister: jest.fn(),
  };
}

function makeRooms(room: ReturnType<typeof makeRoom>) {
  return {
    getOrCreate: jest.fn(async () => room),
    // Like RoomManager on a fresh load: the seed runs before the room is handed out.
    acquire: jest.fn(async (_boardId: string, seed?: (r: typeof room) => Promise<void>) => {
      await seed?.(room);
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
  const liveState = {
    collect: jest.fn(async (): Promise<Uint8Array | null> => null),
    collectRemote: jest.fn(async (): Promise<Uint8Array[]> => []),
  };
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
    const bytes = awarenessFrom(42, 1);
    await gateway.onAwareness(socket as unknown as Socket, bytes);
    expect(socket.to).toHaveBeenCalledWith('b1');
    expect(socket.relayEmit).toHaveBeenCalledWith(SYNC_EVENTS.awareness, bytes);
    expect(bridge.publishAwareness).toHaveBeenCalledWith('b1', bytes);
  });

  it('allows viewers to send awareness (no role gate)', async () => {
    const { gateway, socket, bridge } = await setup('viewer');
    const bytes = awarenessFrom(43, 1);
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
  function deferredSetup(room?: ReturnType<typeof makeRoom>) {
    let resolveRole!: (role: Role | null) => void;
    const ctx = build({ room }, () => new Promise<Role | null>((r) => (resolveRole = r)));
    return { ...ctx, resolveRole: (r: Role | null) => resolveRole(r) };
  }

  it('applies a client-sync that arrives before the membership lookup resolves', async () => {
    const { gateway, socket, room, bridge, resolveRole } = deferredSetup(realRoom(new Y.Doc()));
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

  it('leaves no expiry timer behind for a socket that dropped mid-handshake', async () => {
    let resolveRole!: (role: Role | null) => void;
    const future = Math.floor(Date.now() / 1000) + 600;
    const ctx = build(
      { tokenPayload: { sub: 'u1', exp: future } },
      () => new Promise<Role | null>((r) => (resolveRole = r)),
    );
    const connecting = ctx.gateway.handleConnection(ctx.socket as unknown as Socket);
    ctx.socket.disconnected = true;
    const disconnecting = ctx.gateway.handleDisconnect(ctx.socket as unknown as Socket);
    resolveRole('editor');
    await Promise.all([connecting, disconnecting]);
    expect((ctx.gateway as unknown as { expiryTimers: Map<string, unknown> }).expiryTimers.size).toBe(0);
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
function awarenessFrom(clientId: number, clock: number, userId = 'u1'): Uint8Array {
  return encodeAwarenessUpdate([
    { clientId, clock, state: JSON.stringify({ user: { id: userId, name: 'A', color: '#000' } }) },
  ]);
}

describe('BoardSyncGateway awareness cleanup on disconnect', () => {
  it('broadcasts removal of the clientIDs the socket announced', async () => {
    const { gateway, socket, server, bridge } = await setup('editor');
    await gateway.onAwareness(socket as unknown as Socket, awarenessFrom(42, 3));
    await gateway.handleDisconnect(socket as unknown as Socket);

    const call = server.roomEmit.mock.calls.find((c) => c[0] === SYNC_EVENTS.awareness);
    expect(call).toBeDefined();
    // At the last announced clock, not past it: y-protocols applies a null
    // state at an equal clock, and the client's reconnect re-announces at
    // clock + 1, which peers must accept rather than ignore.
    expect(decodeAwarenessUpdate(call![1] as Uint8Array)).toEqual([
      { clientId: 42, clock: 3, removed: true },
    ]);
    const published = bridge.publishAwareness.mock.calls.at(-1)![1] as Uint8Array;
    expect(decodeAwarenessUpdate(published)).toEqual([{ clientId: 42, clock: 3, removed: true }]);
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

  it('tells the client its new role so its board turns read-only, and only on a real change', async () => {
    const ctx = await setup('editor');
    ctx.gateway.afterInit();
    ctx.boards.getMemberRole.mockResolvedValue('viewer');
    await change(ctx.access, { boardId: 'b1', userId: 'u1' });
    expect(ctx.socket.emit).toHaveBeenCalledWith(SYNC_EVENTS.role, { role: 'viewer' });
    ctx.socket.emit.mockClear();
    await change(ctx.access, { boardId: 'b1', userId: 'u1' });
    expect(ctx.socket.emit).not.toHaveBeenCalledWith(SYNC_EVENTS.role, expect.anything());
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

describe('BoardSyncGateway catch-up after a Redis outage', () => {
  /** A room backed by a real doc, so applied states and emitted diffs can be checked. */
  function liveRoom(doc: Y.Doc) {
    const room = makeRoom();
    room.ydoc = doc;
    room.applyUpdate.mockImplementation((u: Uint8Array) => Y.applyUpdate(doc, u));
    room.encodeState.mockImplementation(() => Y.encodeStateAsUpdate(doc));
    return room;
  }

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
  };

  function elementIds(doc: Y.Doc): string[] {
    return Object.keys(doc.getMap('elements').toJSON()).sort();
  }

  async function resyncSetup(local: Y.Doc) {
    const room = liveRoom(local);
    const ctx = await setup({ role: 'editor', room });
    ctx.gateway.afterInit();
    const resync = ctx.bridge.setResyncHandler.mock.calls[0]![0] as (boardIds: string[]) => void;
    return { ...ctx, resync };
  }

  it('wires a resync handler on afterInit', async () => {
    const { bridge, gateway } = await setup('editor');
    gateway.afterInit();
    expect(bridge.setResyncHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  it("merges other instances' live state into the room and fans the missed diff out locally", async () => {
    const base = docWith(['shared']);
    const local = new Y.Doc();
    Y.applyUpdate(local, Y.encodeStateAsUpdate(base));
    local.getMap('elements').set('local-only', new Y.Map());
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(base));
    remote.getMap('elements').set('remote-only', new Y.Map());

    const { resync, liveState, server } = await resyncSetup(local);
    // A local client that, like the room, missed the remote edit.
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(local));
    liveState.collectRemote.mockResolvedValue([Y.encodeStateAsUpdate(remote)]);

    resync(['b1']);
    await settle();

    expect(liveState.collectRemote).toHaveBeenCalledWith('b1');
    expect(elementIds(local)).toEqual(['local-only', 'remote-only', 'shared']);
    const emitted = server.roomEmit.mock.calls.filter((c) => c[0] === SYNC_EVENTS.update);
    expect(emitted).toHaveLength(1);
    Y.applyUpdate(client, emitted[0]![1] as Uint8Array);
    expect(elementIds(client)).toEqual(['local-only', 'remote-only', 'shared']);
  });

  it('publishes what the other instances are missing, so they converge too', async () => {
    const local = docWith(['local-only']);
    const remote = docWith(['remote-only']);
    const { resync, liveState, bridge } = await resyncSetup(local);
    liveState.collectRemote.mockResolvedValue([Y.encodeStateAsUpdate(remote)]);

    resync(['b1']);
    await settle();

    const published = bridge.publish.mock.calls.filter((c) => c[0] === 'b1');
    expect(published).toHaveLength(1);
    Y.applyUpdate(remote, published[0]![1] as Uint8Array);
    expect(elementIds(remote)).toEqual(['local-only', 'remote-only']);
  });

  it('asks every client, here and elsewhere, to re-announce awareness lost in the outage', async () => {
    const { resync, bridge, server } = await resyncSetup(docWith(['a']));
    resync(['b1']);
    await settle();
    expect(server.roomEmit).toHaveBeenCalledWith(SYNC_EVENTS.awarenessRequest);
    expect(bridge.publishAwarenessRequest).toHaveBeenCalledWith('b1');
  });

  it('emits and publishes nothing when no other instance holds the board', async () => {
    const { resync, bridge, server } = await resyncSetup(docWith(['a']));
    resync(['b1']);
    await settle();
    expect(server.roomEmit).not.toHaveBeenCalledWith(SYNC_EVENTS.update, expect.anything());
    expect(bridge.publish).not.toHaveBeenCalled();
  });

  it('skips a board whose room was released in the meantime', async () => {
    const { resync, rooms, liveState } = await resyncSetup(docWith(['a']));
    liveState.collectRemote.mockClear(); // the join's own seeding asked already
    rooms.getIfActive.mockReturnValue(null);
    resync(['b1']);
    await settle();
    expect(liveState.collectRemote).not.toHaveBeenCalled();
  });

  it('logs and carries on when catching up a board fails', async () => {
    const { resync, liveState, room } = await resyncSetup(docWith(['a']));
    liveState.collectRemote.mockResolvedValue([Y.encodeStateAsUpdate(docWith(['b']))]);
    room.applyUpdate.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => resync(['b1'])).not.toThrow();
    await settle();
  });
});

describe('BoardSyncGateway realtime rate limits', () => {
  afterEach(() => jest.restoreAllMocks());

  function warnSpy(gateway: BoardSyncGateway): jest.SpyInstance {
    return jest.spyOn((gateway as unknown as { logger: { warn: () => void } }).logger, 'warn');
  }

  it('drops updates beyond the burst and warns once for the streak, not per message', async () => {
    // Frozen clock: the bucket refills in real time, so a slow runner could
    // earn an extra token mid-loop and let burst + 1 updates through.
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { gateway, socket, room } = await setup('editor');
    const warn = warnSpy(gateway);
    const update = validUpdate();
    const sends = RATE_LIMITS.update.burst + 50;
    for (let i = 0; i < sends; i += 1) await gateway.onUpdate(socket as unknown as Socket, update);
    expect(room.applyUpdate).toHaveBeenCalledTimes(RATE_LIMITS.update.burst);
    expect(warn.mock.calls.filter(([m]) => String(m).includes('rate limit'))).toHaveLength(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('limits each event class separately', async () => {
    const { gateway, socket, bridge } = await setup('editor');
    for (let i = 0; i < RATE_LIMITS.clock.burst; i += 1) await gateway.onClock(socket as unknown as Socket);
    await expect(gateway.onClock(socket as unknown as Socket)).resolves.toBeUndefined();
    await gateway.onAwareness(socket as unknown as Socket, awarenessFrom(42, 1));
    expect(bridge.publishAwareness).toHaveBeenCalled();
  });

  it('allows only a handful of full-state client-syncs per socket', async () => {
    const { gateway, socket, room } = await setup('editor');
    for (let i = 0; i < RATE_LIMITS.sync.burst + 2; i += 1) {
      await gateway.onClientSync(socket as unknown as Socket, validUpdate());
    }
    expect(room.applyUpdate).toHaveBeenCalledTimes(RATE_LIMITS.sync.burst);
  });

  it('disconnects a socket that keeps flooding past the abuse window, with an error code', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { gateway, socket } = await setup('editor');
    for (let t = 0; t <= ABUSE_DISCONNECT_MS + 2_000; t += 100) {
      for (let i = 0; i < 20; i += 1) await gateway.onClock(socket as unknown as Socket);
      now += 100;
    }
    expect(socket.emit).toHaveBeenCalledWith(SYNC_EVENTS.error, expect.objectContaining({ code: 'rate-limited' }));
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('forgets the buckets of a socket when it disconnects', async () => {
    const { gateway, socket } = await setup('editor');
    await gateway.onClock(socket as unknown as Socket);
    const limiters = (gateway as unknown as { limiters: Map<string, unknown> }).limiters;
    expect(limiters.has(socket.id)).toBe(true);
    await gateway.handleDisconnect(socket as unknown as Socket);
    expect(limiters.has(socket.id)).toBe(false);
  });
});

describe('BoardSyncGateway awareness validation', () => {
  /** A second socket on the same gateway, authenticated as `userId`. */
  async function connectOther(ctx: Awaited<ReturnType<typeof setup>>, userId: string) {
    const other = makeSocket();
    other.id = 's2';
    ctx.server.sockets.sockets.set(other.id, other);
    ctx.tokens.verifyAccessToken.mockReturnValueOnce({ sub: userId, email: 'x@t' });
    await ctx.gateway.handleConnection(other as unknown as Socket);
    return other;
  }

  function relayedEntries(socket: ReturnType<typeof makeSocket>) {
    return socket.relayEmit.mock.calls
      .filter((c) => c[0] === SYNC_EVENTS.awareness)
      .flatMap((c) => decodeAwarenessEntries(c[1] as Uint8Array) ?? []);
  }

  it("drops a state claiming another user's identity: nothing is relayed or published", async () => {
    const { gateway, socket, bridge } = await setup('viewer');
    await gateway.onAwareness(socket as unknown as Socket, awarenessFrom(42, 1, 'victim'));
    expect(socket.relayEmit).not.toHaveBeenCalledWith(SYNC_EVENTS.awareness, expect.anything());
    expect(bridge.publishAwareness).not.toHaveBeenCalled();
  });

  it('drops a malformed awareness update and logs it', async () => {
    const { gateway, socket, bridge } = await setup('editor');
    const warn = jest.spyOn((gateway as unknown as { logger: { warn: () => void } }).logger, 'warn');
    await gateway.onAwareness(socket as unknown as Socket, new Uint8Array([1, 2, 3, 42]));
    expect(bridge.publishAwareness).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('malformed awareness'));
  });

  it('relays only the valid entries of a mixed update, re-encoded', async () => {
    const { gateway, socket, bridge } = await setup('editor');
    const mixed = encodeAwarenessUpdate([
      { clientId: 42, clock: 1, state: JSON.stringify({ user: { id: 'u1', name: 'N', color: '#000' } }) },
      { clientId: 43, clock: 1, state: JSON.stringify({ user: { id: 'victim', name: 'N', color: '#000' } }) },
    ]);
    await gateway.onAwareness(socket as unknown as Socket, mixed);
    expect(relayedEntries(socket).map((e) => e.clientId)).toEqual([42]);
    const published = bridge.publishAwareness.mock.calls.at(-1)![1] as Uint8Array;
    expect(decodeAwarenessEntries(published)?.map((e) => e.clientId)).toEqual([42]);
  });

  it("refuses a clientID bound to another user's socket, for states and removals alike", async () => {
    const ctx = await setup('editor');
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 1));
    const attacker = await connectOther(ctx, 'u2');
    ctx.bridge.publishAwareness.mockClear();

    await ctx.gateway.onAwareness(attacker as unknown as Socket, awarenessFrom(42, 5, 'u2'));
    const nul = encodeAwarenessUpdate([{ clientId: 42, clock: 9, state: 'null' }]);
    await ctx.gateway.onAwareness(attacker as unknown as Socket, nul);

    expect(attacker.relayEmit).not.toHaveBeenCalledWith(SYNC_EVENTS.awareness, expect.anything());
    expect(ctx.bridge.publishAwareness).not.toHaveBeenCalled();
  });

  it('frees the clientIDs of a socket once it disconnects', async () => {
    const ctx = await setup('editor');
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 1));
    await ctx.gateway.handleDisconnect(ctx.socket as unknown as Socket);
    const next = await connectOther(ctx, 'u2');
    await ctx.gateway.onAwareness(next as unknown as Socket, awarenessFrom(42, 7, 'u2'));
    expect(relayedEntries(next).map((e) => e.clientId)).toEqual([42]);
  });

  it('does not deliver remote awareness for a clientID a local socket owns', async () => {
    const ctx = await setup('editor');
    ctx.gateway.afterInit();
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 1));
    const handler = ctx.bridge.setAwarenessHandler.mock.calls[0]![0] as (b: string, u: Uint8Array) => void;

    handler('b1', encodeAwarenessUpdate([{ clientId: 42, clock: 9, state: 'null' }]));
    expect(ctx.server.roomEmit).not.toHaveBeenCalledWith(SYNC_EVENTS.awareness, expect.anything());

    const foreign = awarenessFrom(77, 1, 'u9');
    handler('b1', foreign);
    expect(ctx.server.roomEmit).toHaveBeenCalledWith(SYNC_EVENTS.awareness, foreign);
  });
});

describe('BoardSyncGateway cluster-wide awareness claims', () => {
  const A = '123e4567-e89b-12d3-a456-426614174000';
  type ClaimHandler = (boardId: string, instanceId: string, msg: ClaimMessage) => void;

  async function claimSetup() {
    const ctx = await setup('editor');
    ctx.gateway.afterInit();
    const onClaim = ctx.bridge.setClaimHandler.mock.calls[0]![0] as ClaimHandler;
    return { ...ctx, onClaim };
  }

  async function connectOther(ctx: Awaited<ReturnType<typeof setup>>, userId: string, id = 's2') {
    const other = makeSocket();
    other.id = id;
    ctx.server.sockets.sockets.set(other.id, other);
    ctx.tokens.verifyAccessToken.mockReturnValueOnce({ sub: userId, email: 'x@t' });
    await ctx.gateway.handleConnection(other as unknown as Socket);
    return other;
  }

  const published = (ctx: { bridge: ReturnType<typeof makeBridge> }): ClaimMessage[] =>
    ctx.bridge.publishClaims.mock.calls.map((c) => c[1] as ClaimMessage);

  afterEach(() => jest.useRealTimers());

  it('announces a newly bound clientID before relaying the awareness that uses it', async () => {
    const ctx = await claimSetup();
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 1));
    expect(ctx.bridge.publishClaims).toHaveBeenCalledWith('b1', { op: 'claim', claims: [{ clientId: 42, userId: 'u1' }] });
    const claimAt = ctx.bridge.publishClaims.mock.invocationCallOrder[0]!;
    const relayAt = ctx.bridge.publishAwareness.mock.invocationCallOrder[0]!;
    expect(claimAt).toBeLessThan(relayAt);
    // Re-announcing the same clientID's state is not a new claim.
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 2));
    expect(ctx.bridge.publishClaims).toHaveBeenCalledTimes(1);
  });

  it('releases a clientID on its removal and every claimed clientID on disconnect', async () => {
    const ctx = await claimSetup();
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 1));
    await ctx.gateway.onAwareness(
      ctx.socket as unknown as Socket,
      encodeAwarenessUpdate([{ clientId: 42, clock: 2, state: 'null' }]),
    );
    expect(published(ctx)).toContainEqual({ op: 'release', clientIds: [42] });
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(43, 1));
    await ctx.gateway.handleDisconnect(ctx.socket as unknown as Socket);
    expect(published(ctx).at(-1)).toEqual({ op: 'release', clientIds: [43] });
  });

  it("refuses a local bind of a clientID another user claimed on another instance, until it is released", async () => {
    const ctx = await claimSetup();
    ctx.onClaim('b1', A, { op: 'claim', claims: [{ clientId: 42, userId: 'victim' }] });
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 1));
    expect(ctx.bridge.publishAwareness).not.toHaveBeenCalled();

    ctx.onClaim('b1', A, { op: 'release', clientIds: [42] });
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 2));
    expect(ctx.bridge.publishAwareness).toHaveBeenCalled();
  });

  it('answers a refresh request with its local claims for that board', async () => {
    const ctx = await claimSetup();
    ctx.onClaim('b1', A, { op: 'refresh' });
    expect(ctx.bridge.publishClaims).not.toHaveBeenCalled(); // nothing to announce yet
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 1));
    ctx.bridge.publishClaims.mockClear();
    ctx.onClaim('b1', A, { op: 'refresh' });
    expect(published(ctx)).toEqual([{ op: 'claim', claims: [{ clientId: 42, userId: 'u1' }] }]);
  });

  it('re-announces its claims and asks for everyone else\'s after a Redis resync', async () => {
    const ctx = await claimSetup();
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 1));
    ctx.bridge.publishClaims.mockClear();
    const resync = ctx.bridge.setResyncHandler.mock.calls[0]![0] as (boardIds: string[]) => void;
    resync(['b1']);
    expect(published(ctx)).toEqual([
      { op: 'claim', claims: [{ clientId: 42, userId: 'u1' }] },
      { op: 'refresh' },
    ]);
  });

  it('re-announces its claims periodically so they outlive the remote TTL', async () => {
    jest.useFakeTimers();
    const ctx = await claimSetup();
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 1));
    ctx.bridge.publishClaims.mockClear();
    jest.advanceTimersByTime(CLAIM_REFRESH_INTERVAL_MS);
    expect(published(ctx)).toEqual([{ op: 'claim', claims: [{ clientId: 42, userId: 'u1' }] }]);
    await ctx.gateway.onModuleDestroy();
    ctx.bridge.publishClaims.mockClear();
    jest.advanceTimersByTime(CLAIM_REFRESH_INTERVAL_MS * 2);
    expect(ctx.bridge.publishClaims).not.toHaveBeenCalled();
  });

  it('forgets remote claims for a board once its last local socket leaves', async () => {
    const ctx = await claimSetup();
    ctx.onClaim('b1', A, { op: 'claim', claims: [{ clientId: 42, userId: 'victim' }] });
    await ctx.gateway.handleDisconnect(ctx.socket as unknown as Socket);
    const next = await connectOther(ctx, 'u2');
    await ctx.gateway.onAwareness(next as unknown as Socket, awarenessFrom(42, 1, 'u2'));
    expect(ctx.bridge.publishAwareness).toHaveBeenCalled();
  });

  it('keeps its own owner on a conflicting remote claim, and logs it', async () => {
    const ctx = await claimSetup();
    const warn = jest.spyOn((ctx.gateway as unknown as { logger: { warn: () => void } }).logger, 'warn');
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 1));
    ctx.onClaim('b1', A, { op: 'claim', claims: [{ clientId: 42, userId: 'attacker' }] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('conflicting'));
    await ctx.gateway.onAwareness(ctx.socket as unknown as Socket, awarenessFrom(42, 2));
    expect(ctx.bridge.publishAwareness).toHaveBeenCalledTimes(2);
  });
});

/** A room backed by a real doc, so applied states and relayed diffs can be checked. */
function realRoom(doc: Y.Doc) {
  const room = makeRoom();
  room.ydoc = doc;
  room.applyUpdate.mockImplementation((u: Uint8Array) => Y.applyUpdate(doc, u));
  room.encodeState.mockImplementation(() => Y.encodeStateAsUpdate(doc));
  return room;
}

function idsOf(update: Uint8Array): string[] {
  const d = new Y.Doc();
  Y.applyUpdate(d, update);
  return Object.keys(d.getMap('elements').toJSON()).sort();
}

const settleAll = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};

describe("BoardSyncGateway opening a room with other instances' live state", () => {
  it('waits for the Redis subscription, then merges their live rooms before the first server-sync', async () => {
    const ctx = build({ role: 'editor', room: realRoom(new Y.Doc()) }, async () => 'editor');
    let subscribed!: () => void;
    ctx.bridge.register.mockImplementation(() => new Promise<void>((r) => (subscribed = r)));
    ctx.liveState.collectRemote.mockResolvedValue([Y.encodeStateAsUpdate(docWith(['unsaved-elsewhere']))]);

    const connecting = ctx.gateway.handleConnection(ctx.socket as unknown as Socket);
    await settleAll();
    // Asking before the SUBSCRIBE is live would lose updates published in between.
    expect(ctx.liveState.collectRemote).not.toHaveBeenCalled();
    expect(ctx.socket.emit).not.toHaveBeenCalledWith(SYNC_EVENTS.serverSync, expect.anything());
    subscribed();
    await connecting;

    expect(ctx.liveState.collectRemote).toHaveBeenCalledWith('b1');
    const sync = ctx.socket.emit.mock.calls.find((c) => c[0] === SYNC_EVENTS.serverSync);
    expect(idsOf(sync![1] as Uint8Array)).toEqual(['unsaved-elsewhere']);
  });

  it('publishes what the other instances lack from a room kept here', async () => {
    const remote = docWith(['theirs']);
    const ctx = build({ role: 'editor', room: realRoom(docWith(['kept-here'])) }, async () => 'editor');
    ctx.liveState.collectRemote.mockResolvedValue([Y.encodeStateAsUpdate(remote)]);
    await ctx.gateway.handleConnection(ctx.socket as unknown as Socket);

    const published = ctx.bridge.publish.mock.calls.filter((c) => c[0] === 'b1');
    expect(published).toHaveLength(1);
    Y.applyUpdate(remote, published[0]![1] as Uint8Array);
    expect(Object.keys(remote.getMap('elements').toJSON()).sort()).toEqual(['kept-here', 'theirs']);
  });

  it('publishes nothing when the other instances already hold everything this room has', async () => {
    const ctx = build({ role: 'editor', room: realRoom(new Y.Doc()) }, async () => 'editor');
    ctx.liveState.collectRemote.mockResolvedValue([Y.encodeStateAsUpdate(docWith(['theirs']))]);
    await ctx.gateway.handleConnection(ctx.socket as unknown as Socket);
    expect(ctx.bridge.publish).not.toHaveBeenCalled();
  });
});

describe('BoardSyncGateway role on (re)connect', () => {
  it("tells a connecting client its current role right after the server-sync", async () => {
    // A role change made while the socket was down sent nothing to it; the
    // handshake is where it learns the current one.
    const { socket } = await setup('viewer');
    const events = socket.emit.mock.calls.map((c) => c[0]);
    expect(events.indexOf(SYNC_EVENTS.role)).toBe(events.indexOf(SYNC_EVENTS.serverSync) + 1);
    expect(socket.emit).toHaveBeenCalledWith(SYNC_EVENTS.role, { role: 'viewer' });
  });
});

describe('BoardSyncGateway client-sync fan-out', () => {
  it('relays only what a client-sync added to the room, and nothing for a redundant one', async () => {
    const roomDoc = docWith(['shared']);
    const ctx = await setup({ role: 'editor', room: realRoom(roomDoc) });
    const peer = new Y.Doc(); // another client, in sync with the room
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(roomDoc));

    // A reconnect with nothing new: no multi-MB echo to every peer and Redis.
    await ctx.gateway.onClientSync(ctx.socket as unknown as Socket, Y.encodeStateAsUpdate(roomDoc));
    expect(ctx.socket.relayEmit).not.toHaveBeenCalledWith(SYNC_EVENTS.update, expect.anything());
    expect(ctx.bridge.publish).not.toHaveBeenCalled();

    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(roomDoc));
    client.getMap('elements').set('offline', new Y.Map());
    const full = Y.encodeStateAsUpdate(client);
    await ctx.gateway.onClientSync(ctx.socket as unknown as Socket, full);

    const relayed = ctx.socket.relayEmit.mock.calls.find((c) => c[0] === SYNC_EVENTS.update)![1] as Uint8Array;
    expect(Y.decodeUpdate(relayed).structs.length).toBeLessThan(Y.decodeUpdate(full).structs.length);
    expect(ctx.bridge.publish).toHaveBeenCalledWith('b1', relayed);
    Y.applyUpdate(peer, relayed);
    expect(Object.keys(peer.getMap('elements').toJSON()).sort()).toEqual(['offline', 'shared']);
  });

  it('still relays incremental updates as sent', async () => {
    const ctx = await setup({ role: 'editor', room: realRoom(new Y.Doc()) });
    const update = validUpdate();
    await ctx.gateway.onUpdate(ctx.socket as unknown as Socket, update);
    expect(ctx.socket.relayEmit).toHaveBeenCalledWith(SYNC_EVENTS.update, update);
    expect(ctx.bridge.publish).toHaveBeenCalledWith('b1', update);
  });
});
