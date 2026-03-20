import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupApp, loginAs } from './helpers/setup';

describe('Auth Flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupApp();
  }, 30000);

  afterAll(() => app.close());

  describe('POST /auth/login', () => {
    it('returns access token for valid admin credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@semed.prainha.pa.gov.br', password: 'Admin@2026!' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe('admin@semed.prainha.pa.gov.br');
      expect(res.body.user.role.slug).toBe('admin');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('returns 401 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@test.com', password: 'wrong123' })
        .expect(401);
    });

    it('returns 401 for wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@semed.prainha.pa.gov.br', password: 'WrongPassword!' })
        .expect(401);
    });

    it('returns 400 for missing fields', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@semed.prainha.pa.gov.br' })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('returns user data with valid token', async () => {
      const token = await loginAs(app, 'admin@semed.prainha.pa.gov.br', 'Admin@2026!');

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.name).toBe('Administrador do Sistema');
      expect(res.body.role.slug).toBe('admin');
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });

    it('returns 401 with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalidtoken123')
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('returns success message', async () => {
      const token = await loginAs(app, 'admin@semed.prainha.pa.gov.br', 'Admin@2026!');

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.message).toBe('Logout realizado com sucesso');
    });
  });
});
