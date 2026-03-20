import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'notauser@example.com', password: 'wrongpassword' })
        .expect(401);
    });

    it('returns 400 for missing fields', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'notauser@example.com' })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });
  });

  describe('GET /sectors', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get('/sectors').expect(401);
    });
  });
});
