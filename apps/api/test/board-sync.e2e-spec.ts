import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';
import { SYNC_EVENTS } from '@syncflow/shared';

describe('BoardSync (e2e)', () => {
  let app: INestApplication;
  let url: string;
  let token: string;
  let boardId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.listen(0);
    const addr = app.getHttpServer().address();
    url = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 0}`;

    const prisma = app.get(PrismaService);
    const user = await prisma.user.create({
      data: { email: `sync-${Date.now()}@t.app`, displayName: 'Sync', color: '#fff', passwordHash: 'x' },
    });
    const board = await prisma.board.create({
      data: { ownerId: user.id, title: 'sync', members: { create: { userId: user.id, role: 'owner' } } },
    });
    boardId = board.id;
    token = app.get(TokenService).signAccessToken({ sub: user.id, email: user.email });
  });

  afterAll(async () => {
    await app.close();
  });

  // Resolve only after the gateway's connection handler has fully run for this
  // socket: it sets the socket's authz state, joins the board room, and then emits
  // serverSync as the last step. Waiting for serverSync (not the transport connect
  // event, which fires earlier) guarantees the server is ready to both relay this
  // client's updates and deliver fan-out to it — closing the room-join race.
  function client(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = io(url, { auth: { token }, query: { boardId, token }, transports: ['websocket'] });
      s.on(SYNC_EVENTS.serverSync, () => resolve(s));
      s.on(SYNC_EVENTS.error, (e: unknown) => reject(new Error(`gateway rejected handshake: ${JSON.stringify(e)}`)));
      s.on('connect_error', reject);
    });
  }

  it('propagates one client\'s element to another', async () => {
    const a = await client();
    const b = await client();
    const ydocB = new Y.Doc();

    await new Promise<void>((resolve, reject) => {
      const guard = setTimeout(
        () => reject(new Error('Timed out after 10 s: client B never received the relayed update from client A')),
        10000,
      );
      b.on(SYNC_EVENTS.update, (u: ArrayBuffer) => {
        Y.applyUpdate(ydocB, new Uint8Array(u));
        if (ydocB.getMap('elements').has('shape-1')) {
          clearTimeout(guard);
          resolve();
        }
      });
      // Both clients are fully connected and in the room (client() waited for each
      // serverSync), so a's update will be relayed and fanned out to b.
      const ydocA = new Y.Doc();
      const inner = new Y.Map();
      ydocA.transact(() => {
        inner.set('id', 'shape-1');
        ydocA.getMap('elements').set('shape-1', inner);
      });
      a.emit(SYNC_EVENTS.update, Y.encodeStateAsUpdate(ydocA));
    });

    expect(ydocB.getMap('elements').has('shape-1')).toBe(true);
    a.disconnect();
    b.disconnect();
  }, 15000);
});
