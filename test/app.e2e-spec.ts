import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupApp } from './helpers/setup';

describe('Route Protection (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupApp();
  }, 30000);

  afterAll(() => app.close());

  it.each([
    '/sectors',
    '/users',
    '/roles',
    '/request-types',
    '/requests',
    '/dashboard/overview',
    '/notifications',
    '/audit-logs',
  ])('GET %s returns 401 without token', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
  });
});
