import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('POST /auth/login with invalid credentials returns 401', async () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'naoexiste@test.com', password: '123456' })
      .expect(401);
  });

  it('GET /auth/me without token returns 401', async () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
