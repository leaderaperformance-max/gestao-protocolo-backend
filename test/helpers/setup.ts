import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  sectorCode: string;
  roleSlug: string;
}

export async function setupApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

export async function loginAs(app: INestApplication, email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.accessToken;
}

export async function createTestUser(
  prisma: PrismaService,
  data: {
    name: string;
    email: string;
    passwordHash: string;
    registrationNumber: string;
    sectorCode: string;
    roleSlug: string;
  },
): Promise<string> {
  const sector = await prisma.sector.findUnique({ where: { code: data.sectorCode } });
  if (!sector) throw new Error(`Sector ${data.sectorCode} not found`);
  const role = await prisma.role.findUnique({ where: { slug: data.roleSlug } });
  if (!role) throw new Error(`Role ${data.roleSlug} not found`);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      registrationNumber: data.registrationNumber,
      sectorId: sector.id,
      roleId: role.id,
    },
  });
  return user.id;
}

export async function cleanupTestData(prisma: PrismaService, testUserIds: string[]) {
  if (testUserIds.length === 0) return;

  await prisma.notification.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: testUserIds } } });

  const testRequests = await prisma.request.findMany({
    where: { requesterId: { in: testUserIds } },
    select: { id: true },
  });
  const testRequestIds = testRequests.map((r) => r.id);

  if (testRequestIds.length > 0) {
    await prisma.attachment.deleteMany({ where: { requestId: { in: testRequestIds } } });
    await prisma.requestStatusHistory.deleteMany({ where: { requestId: { in: testRequestIds } } });
    await prisma.requestTramitation.deleteMany({ where: { requestId: { in: testRequestIds } } });
    await prisma.request.deleteMany({ where: { id: { in: testRequestIds } } });
  }

  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [...testUserIds, 'anonymous'] } } });
  await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
}
