import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';
import { SYNC_EVENTS } from '@syncflow/shared';

describe('BoardSyncAwareness (e2e)', () => {
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
      data: {
        email: `awareness-${Date.now()}@t.app`,
        displayName: 'Awareness',
        color: '#abc',
        passwordHash: 'x',
      },
    });
    const board = await prisma.board.create({
      data: {
        ownerId: user.id,
        title: 'awareness-test',
        members: { create: { userId: user.id, role: 'owner' } },
      },
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
      s.on(SYNC_EVENTS.error, (e: unknown) =>
        reject(new Error(`gateway rejected handshake: ${JSON.stringify(e)}`)),
      );
      s.on('connect_error', reject);
    });
  }

  it('relays awareness bytes from client A to client B', async () => {
    const a = await client();
    const b = await client();

    // A small awareness update payload — arbitrary bytes sufficient to prove relay.
    const sentBytes = new Uint8Array([1, 2, 3, 42]);

    await new Promise<void>((resolve, reject) => {
      const guard = setTimeout(
        () =>
          reject(
            new Error(
              'Timed out after 4 s: client B never received the awareness update from client A',
            ),
          ),
        4000,
      );

      b.on(SYNC_EVENTS.awareness, (payload: ArrayBuffer) => {
        const received = new Uint8Array(payload);
        // Verify the relayed payload contains our sent bytes.
        let match = received.length >= sentBytes.length;
        for (let i = 0; i < sentBytes.length && match; i++) {
          if (received[i] !== sentBytes[i]) match = false;
        }
        if (match) {
          clearTimeout(guard);
          resolve();
        }
      });

      // Both clients are fully connected and in the room (client() waited for each
      // serverSync), so A's awareness update will be relayed and fanned out to B.
      a.emit(SYNC_EVENTS.awareness, sentBytes);
    });

    a.disconnect();
    b.disconnect();
  }, 10000);
});
