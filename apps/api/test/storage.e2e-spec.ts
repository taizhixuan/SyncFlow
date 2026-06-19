import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';

const PREFIX = '/api/v1';

interface Account { token: string; userId: string; }

describe('Storage (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let user: Account;

  async function signup(email: string): Promise<Account> {
    const res = await http
      .post(`${PREFIX}/auth/signup`)
      .send({ email, password: 'storage-password', displayName: 'Storage User' })
      .expect(201);
    return { token: res.body.accessToken, userId: res.body.user.id };
  }

  const auth = (a: Account) => ({ Authorization: `Bearer ${a.token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "users","boards","board_members","refresh_tokens" RESTART IDENTITY CASCADE',
    );
    http = request(app.getHttpServer());
    user = await signup('storage@syncflow.app');
  });

  afterAll(async () => { await app.close(); });

  it('POST /storage/uploads with valid image → 201 with uploadUrl and assetUrl', async () => {
    const res = await http
      .post(`${PREFIX}/storage/uploads`)
      .set(auth(user))
      .send({ fileName: 'photo.jpg', contentType: 'image/jpeg', size: 1024 })
      .expect(201);
    expect(typeof res.body.uploadUrl).toBe('string');
    expect(res.body.uploadUrl.length).toBeGreaterThan(0);
    expect(typeof res.body.assetUrl).toBe('string');
    expect(res.body.assetUrl).toContain('syncflow-assets');
    expect(typeof res.body.key).toBe('string');
    expect(res.body.key).toContain('uploads/');
  });

  it('unauthenticated → 401', async () => {
    await http
      .post(`${PREFIX}/storage/uploads`)
      .send({ fileName: 'photo.jpg', contentType: 'image/jpeg', size: 1024 })
      .expect(401);
  });

  it('non-image contentType → 422', async () => {
    await http
      .post(`${PREFIX}/storage/uploads`)
      .set(auth(user))
      .send({ fileName: 'doc.pdf', contentType: 'application/pdf', size: 1024 })
      .expect(422);
  });
});
