import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp, loginAs, createTestUser, cleanupTestData } from './helpers/setup';

const TEST_PASSWORD = 'TestUser@2026!';

describe('RBAC Permissions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testUserIds: string[] = [];
  let servidorToken: string;
  let protocoloToken: string;
  let adminToken: string;
  let rhUserToken: string;
  let requestTypeId: string;
  let requestId: string;

  beforeAll(async () => {
    app = await setupApp();
    prisma = app.get(PrismaService);

    const hash = await bcrypt.hash(TEST_PASSWORD, 12);

    // Servidor — only has 'view', no send/receive/approve
    const servidorId = await createTestUser(prisma, {
      name: 'Servidor Test',
      email: 'test-servidor-perm@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-SERV-PERM-001',
      sectorCode: 'PROT',
      roleSlug: 'servidor',
    });
    testUserIds.push(servidorId);

    // Protocolo — has send+receive, no approve
    const protocoloId = await createTestUser(prisma, {
      name: 'Protocolo Test',
      email: 'test-protocolo-perm@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-PROTO-PERM-001',
      sectorCode: 'PROT',
      roleSlug: 'protocolo',
    });
    testUserIds.push(protocoloId);

    // RH user for wrong-sector tests
    const rhUserId = await createTestUser(prisma, {
      name: 'RH User Test',
      email: 'test-rh-perm@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-RH-PERM-001',
      sectorCode: 'RH',
      roleSlug: 'protocolo',
    });
    testUserIds.push(rhUserId);

    servidorToken = await loginAs(app, 'test-servidor-perm@e2e.test', TEST_PASSWORD);
    protocoloToken = await loginAs(app, 'test-protocolo-perm@e2e.test', TEST_PASSWORD);
    adminToken = await loginAs(app, 'admin@semed.prainha.pa.gov.br', 'Admin@2026!');
    rhUserToken = await loginAs(app, 'test-rh-perm@e2e.test', TEST_PASSWORD);

    const rt = await prisma.requestType.findFirst({ where: { name: 'Licença Prêmio' } });
    requestTypeId = rt!.id;

    // Create a request as protocolo user (has 'send' permission)
    const res = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${protocoloToken}`)
      .send({ requestTypeId, description: 'Permission test request' })
      .expect(201);
    requestId = res.body.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestData(prisma, testUserIds);
    await app.close();
  }, 15000);

  describe('Servidor (view-only) cannot perform write operations', () => {
    it('cannot create requests (no send permission)', async () => {
      await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${servidorToken}`)
        .send({ requestTypeId, description: 'Should be forbidden' })
        .expect(403);
    });

    it('cannot forward requests (no send permission)', async () => {
      await request(app.getHttpServer())
        .post(`/requests/${requestId}/forward`)
        .set('Authorization', `Bearer ${servidorToken}`)
        .send({ toSectorCode: 'RH' })
        .expect(403);
    });

    it('cannot receive requests (no receive permission)', async () => {
      await request(app.getHttpServer())
        .post(`/requests/${requestId}/receive`)
        .set('Authorization', `Bearer ${servidorToken}`)
        .expect(403);
    });

    it('CAN view requests (has view — GET endpoints have no permission requirement)', async () => {
      await request(app.getHttpServer())
        .get('/requests')
        .set('Authorization', `Bearer ${servidorToken}`)
        .expect(200);
    });

    it('CAN view timeline (public endpoint)', async () => {
      await request(app.getHttpServer())
        .get(`/requests/${requestId}/timeline`)
        .expect(200);
    });
  });

  describe('Wrong sector cannot act on request', () => {
    it('RH user cannot forward request currently in PROT sector', async () => {
      await request(app.getHttpServer())
        .post(`/requests/${requestId}/forward`)
        .set('Authorization', `Bearer ${rhUserToken}`)
        .send({ toSectorCode: 'RH' })
        .expect(403);
    });

    it('RH user cannot receive request currently in PROT sector', async () => {
      await request(app.getHttpServer())
        .post(`/requests/${requestId}/receive`)
        .set('Authorization', `Bearer ${rhUserToken}`)
        .expect(403);
    });
  });

  describe('Flow validation', () => {
    it('cannot forward to wrong next sector in flow', async () => {
      // Flow is PROT → RH → GAB, trying to skip to GAB
      await request(app.getHttpServer())
        .post(`/requests/${requestId}/forward`)
        .set('Authorization', `Bearer ${protocoloToken}`)
        .send({ toSectorCode: 'GAB' })
        .expect(400);
    });

    it('cannot forward to non-existent sector', async () => {
      await request(app.getHttpServer())
        .post(`/requests/${requestId}/forward`)
        .set('Authorization', `Bearer ${protocoloToken}`)
        .send({ toSectorCode: 'INVALID' })
        .expect(404);
    });
  });

  describe('Status change validation', () => {
    it('INDEFERIDO requires justification', async () => {
      await request(app.getHttpServer())
        .patch(`/requests/${requestId}/status`)
        .set('Authorization', `Bearer ${protocoloToken}`)
        .send({ status: 'INDEFERIDO' })
        .expect(400);
    });

    it('PENDENTE_DOCUMENTO requires justification', async () => {
      await request(app.getHttpServer())
        .patch(`/requests/${requestId}/status`)
        .set('Authorization', `Bearer ${protocoloToken}`)
        .send({ status: 'PENDENTE_DOCUMENTO' })
        .expect(400);
    });

    it('INDEFERIDO works WITH justification', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/requests/${requestId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INDEFERIDO', justification: 'Documentação insuficiente' })
        .expect(200);

      expect(res.body.status).toBe('INDEFERIDO');
    });
  });

  describe('Superadmin bypass', () => {
    it('admin can forward out of flow order', async () => {
      // Reset status so we can test forward
      await request(app.getHttpServer())
        .patch(`/requests/${requestId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'EM_ANALISE' });

      // Admin can skip flow — request is in PROT, forward directly to JUR
      const res = await request(app.getHttpServer())
        .post(`/requests/${requestId}/forward`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ toSectorCode: 'JUR', notes: 'Encaminhamento extraordinário' })
        .expect(201);

      expect(res.body.toSectorId).toBeDefined();
    });
  });
});
