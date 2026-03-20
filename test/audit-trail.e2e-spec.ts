import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp, loginAs, createTestUser, cleanupTestData } from './helpers/setup';

const TEST_PASSWORD = 'TestUser@2026!';

describe('Audit Trail (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testUserIds: string[] = [];
  let userToken: string;
  let userId: string;
  let requestTypeId: string;

  beforeAll(async () => {
    app = await setupApp();
    prisma = app.get(PrismaService);

    const hash = await bcrypt.hash(TEST_PASSWORD, 12);

    userId = await createTestUser(prisma, {
      name: 'Audit Test User',
      email: 'test-audit-trail@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-AUDIT-TRAIL-001',
      sectorCode: 'PROT',
      roleSlug: 'protocolo',
    });
    testUserIds.push(userId);

    userToken = await loginAs(app, 'test-audit-trail@e2e.test', TEST_PASSWORD);

    const rt = await prisma.requestType.findFirst({ where: { name: 'Licença Prêmio' } });
    requestTypeId = rt!.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestData(prisma, testUserIds);
    await app.close();
  }, 15000);

  it('login creates LOGIN_SUCCESS audit log', async () => {
    // The loginAs in beforeAll already logged in. Wait for fire-and-forget.
    await new Promise((r) => setTimeout(r, 500));

    const logs = await prisma.auditLog.findMany({
      where: { actorUserId: userId, action: 'LOGIN_SUCCESS' },
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].entityType).toBe('auth');
    expect(logs[0].entityId).toBe(userId);
  });

  it('failed login creates LOGIN_FAILURE audit log', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test-audit-trail@e2e.test', password: 'WrongPassword123!' })
      .expect(401);

    await new Promise((r) => setTimeout(r, 500));

    const logs = await prisma.auditLog.findMany({
      where: { actorUserId: userId, action: 'LOGIN_FAILURE' },
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('creating a request generates audit log with payloadAfter', async () => {
    const res = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ requestTypeId, description: 'Audit trail test request' })
      .expect(201);

    await new Promise((r) => setTimeout(r, 500));

    const logs = await prisma.auditLog.findMany({
      where: {
        actorUserId: userId,
        entityId: res.body.id,
        action: { contains: 'POST' },
      },
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const log = logs[0];
    expect(log.entityType).toBe('requests');
    expect(log.payloadAfter).toBeDefined();
    expect(log.payloadAfter).not.toBeNull();
  });

  it('audit logs are queryable via API', async () => {
    const adminToken = await loginAs(app, 'admin@semed.prainha.pa.gov.br', 'Admin@2026!');

    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ actorUserId: userId, limit: 10 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('viewing dashboard creates audit log', async () => {
    await request(app.getHttpServer())
      .get('/dashboard/overview')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    await new Promise((r) => setTimeout(r, 500));

    const logs = await prisma.auditLog.findMany({
      where: {
        actorUserId: userId,
        action: 'VIEW_DASHBOARD_OVERVIEW',
      },
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
