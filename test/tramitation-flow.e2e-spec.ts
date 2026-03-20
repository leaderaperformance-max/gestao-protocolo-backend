import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp, loginAs, createTestUser, cleanupTestData } from './helpers/setup';

const TEST_PASSWORD = 'TestUser@2026!';

describe('Tramitation Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testUserIds: string[] = [];
  let protUserToken: string;
  let rhUserToken: string;
  let gabUserToken: string;
  let requestTypeId: string;
  let requestId: string;

  beforeAll(async () => {
    app = await setupApp();
    prisma = app.get(PrismaService);

    const hash = await bcrypt.hash(TEST_PASSWORD, 12);

    // Create test users in different sectors
    // 'protocolo' role has send+receive permissions
    const protUserId = await createTestUser(prisma, {
      name: 'Test User PROT',
      email: 'test-prot@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-PROT-001',
      sectorCode: 'PROT',
      roleSlug: 'protocolo',
    });
    testUserIds.push(protUserId);

    const rhUserId = await createTestUser(prisma, {
      name: 'Test User RH',
      email: 'test-rh@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-RH-001',
      sectorCode: 'RH',
      roleSlug: 'protocolo',
    });
    testUserIds.push(rhUserId);

    // 'secretario' role has approve permission
    const gabUserId = await createTestUser(prisma, {
      name: 'Test User GAB',
      email: 'test-gab@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-GAB-001',
      sectorCode: 'GAB',
      roleSlug: 'secretario',
    });
    testUserIds.push(gabUserId);

    protUserToken = await loginAs(app, 'test-prot@e2e.test', TEST_PASSWORD);
    rhUserToken = await loginAs(app, 'test-rh@e2e.test', TEST_PASSWORD);
    gabUserToken = await loginAs(app, 'test-gab@e2e.test', TEST_PASSWORD);

    // Find "Licença Prêmio" request type (flow: PROT → RH → GAB)
    const rt = await prisma.requestType.findFirst({ where: { name: 'Licença Prêmio' } });
    requestTypeId = rt!.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestData(prisma, testUserIds);
    await app.close();
  }, 15000);

  it('Step 1: PROT user creates a request', async () => {
    const res = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${protUserToken}`)
      .send({
        requestTypeId,
        description: 'E2E test — licença prêmio por tempo de serviço',
      })
      .expect(201);

    expect(res.body.protocolNumber).toMatch(/^2026-PROT-\d{6}$/);
    expect(res.body.status).toBe('PROTOCOLADO');
    expect(res.body.currentSector.code).toBe('PROT');
    requestId = res.body.id;
  });

  it('Step 2: PROT user forwards to RH', async () => {
    const res = await request(app.getHttpServer())
      .post(`/requests/${requestId}/forward`)
      .set('Authorization', `Bearer ${protUserToken}`)
      .send({ toSectorCode: 'RH' })
      .expect(201);

    expect(res.body.toSectorId).toBeDefined();
  });

  it('Step 3: RH user receives the request', async () => {
    const res = await request(app.getHttpServer())
      .post(`/requests/${requestId}/receive`)
      .set('Authorization', `Bearer ${rhUserToken}`)
      .expect(201);

    expect(res.body.receivedByUserId).toBeDefined();
    expect(res.body.receivedAt).toBeDefined();
  });

  it('Step 4: RH user changes status to EM_ANALISE', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${rhUserToken}`)
      .send({ status: 'EM_ANALISE' })
      .expect(200);

    expect(res.body.status).toBe('EM_ANALISE');
  });

  it('Step 5: RH user forwards to GAB', async () => {
    await request(app.getHttpServer())
      .post(`/requests/${requestId}/forward`)
      .set('Authorization', `Bearer ${rhUserToken}`)
      .send({ toSectorCode: 'GAB' })
      .expect(201);
  });

  it('Step 6: GAB user receives the request', async () => {
    await request(app.getHttpServer())
      .post(`/requests/${requestId}/receive`)
      .set('Authorization', `Bearer ${gabUserToken}`)
      .expect(201);
  });

  it('Step 7: GAB user defers (DEFERIDO)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${gabUserToken}`)
      .send({ status: 'DEFERIDO' })
      .expect(200);

    expect(res.body.status).toBe('DEFERIDO');
  });

  it('Step 8: Request detail shows full history', async () => {
    const res = await request(app.getHttpServer())
      .get(`/requests/${requestId}`)
      .set('Authorization', `Bearer ${protUserToken}`)
      .expect(200);

    expect(res.body.status).toBe('DEFERIDO');
    expect(res.body.tramitations).toHaveLength(2); // PROT→RH, RH→GAB
    expect(res.body.statusHistory.length).toBeGreaterThanOrEqual(4);
  });

  it('Step 9: Public timeline shows all events', async () => {
    const res = await request(app.getHttpServer())
      .get(`/requests/${requestId}/timeline`)
      .expect(200);

    expect(res.body.protocolNumber).toBeDefined();
    expect(res.body.status).toBe('DEFERIDO');
    expect(res.body.tramitations).toHaveLength(2);
    expect(res.body.statusHistory.length).toBeGreaterThanOrEqual(4);
  });

  it('Step 10: Dashboard reflects the new request', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard/overview')
      .set('Authorization', `Bearer ${protUserToken}`)
      .expect(200);

    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.byStatus).toBeDefined();
  });
});
