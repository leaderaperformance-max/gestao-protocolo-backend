# Testes E2E Robustos + Auditoria Completa — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive e2e tests covering full tramitation flow, RBAC permissions, and route protection. Enhance audit logging to capture before/after state, auth events, and sensitive read operations.

**Architecture:** Two parallel tracks: (1) AuditService centralizado que pode ser chamado por qualquer serviço, substituindo o interceptor simplista atual. O interceptor continua existindo para captura automática, mas agora busca o estado anterior antes de mutações. (2) Testes e2e que rodam contra o banco Supabase real, criando dados temporários no beforeAll e limpando no afterAll.

**Tech Stack:** NestJS e2e testing (supertest), Prisma (banco real Supabase), Jest

---

## Contexto Importante

- Banco: Supabase PostgreSQL real (mesmas credenciais do `.env`)
- Seed já criou: admin user, 5 setores (PROT/RH/JUR/GAB/ADM), 4 roles (admin/protocolo/servidor/secretario), 4 request types
- AuditLog model: `actorUserId` NÃO é FK (intencional — preserva log após deleção de user)
- `AuditInterceptor` está registrado como `APP_INTERCEPTOR` no `app.module.ts`
- Fluxo do RequestType "Licença Prêmio": `['PROT', 'RH', 'GAB']`
- Fluxo do RequestType "Licença Sem Vencimento": `['PROT', 'RH', 'JUR', 'GAB']`
- Endpoints de auth são `@Public()` (login, refresh)
- Timeline é `@Public()` (sem autenticação)

---

### Task 1: Adicionar campo `userAgent` no schema AuditLog + migration

**Files:**
- Modify: `prisma/schema.prisma:231-249`

**Step 1: Adicionar campo userAgent ao AuditLog**

Em `prisma/schema.prisma`, dentro do model `AuditLog`, adicionar:

```prisma
model AuditLog {
  id            String   @id @default(uuid())
  action        String
  entityType    String
  entityId      String
  payloadBefore Json?
  payloadAfter  Json?
  ipAddress     String?
  userAgent     String?     // NEW — identificar browser/app de onde veio o acesso
  createdAt     DateTime @default(now())

  actorUserId String

  @@index([entityType, entityId])
  @@index([actorUserId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

**Step 2: Gerar e aplicar migration**

Run: `npx prisma migrate dev --name add-user-agent-to-audit-log`
Expected: Migration criada e aplicada com sucesso

**Step 3: Verificar que build continua passando**

Run: `npm run build`
Expected: 0 errors

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add userAgent field to AuditLog for device tracking"
```

---

### Task 2: Criar AuditService centralizado

**Files:**
- Create: `src/modules/audit-logs/audit.service.ts`
- Modify: `src/modules/audit-logs/audit-logs.module.ts`

**Step 1: Criar o AuditService**

Criar `src/modules/audit-logs/audit.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEventData {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  payloadBefore?: Record<string, unknown> | null;
  payloadAfter?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

const SENSITIVE_KEYS = new Set([
  'password', 'currentPassword', 'newPassword',
  'passwordHash', 'token', 'refreshToken',
]);

function sanitize(obj: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!obj) return Prisma.JsonNull;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, SENSITIVE_KEYS.has(k) ? '[REDACTED]' : v]),
  ) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an audit event. Fire-and-forget — never throws.
   */
  log(data: AuditEventData): void {
    this.prisma.auditLog
      .create({
        data: {
          actorUserId: data.actorUserId,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          payloadBefore: sanitize(data.payloadBefore),
          payloadAfter: sanitize(data.payloadAfter),
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
        },
      })
      .catch((err: unknown) => {
        this.logger.error('Audit log write failed', err instanceof Error ? err.stack : String(err));
      });
  }
}
```

**Step 2: Exportar AuditService no módulo**

Modificar `src/modules/audit-logs/audit-logs.module.ts` para incluir e exportar `AuditService`:

```typescript
import { Module } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsController } from './audit-logs.controller';
import { AuditService } from './audit.service';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditService],
  exports: [AuditService],
})
export class AuditLogsModule {}
```

**Step 3: Verificar build**

Run: `npm run build`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/modules/audit-logs/audit.service.ts src/modules/audit-logs/audit-logs.module.ts
git commit -m "feat: add centralized AuditService for explicit audit logging"
```

---

### Task 3: Melhorar AuditInterceptor — capturar userAgent + payloadBefore

**Files:**
- Modify: `src/common/interceptors/audit.interceptor.ts`

**Step 1: Atualizar o interceptor**

Substituir o conteúdo de `src/common/interceptors/audit.interceptor.ts`:

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../modules/audit-logs/audit.service';

const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

// Map URL entity types to Prisma model names for fetching payloadBefore
const ENTITY_MODEL_MAP: Record<string, string> = {
  requests: 'request',
  users: 'user',
  roles: 'role',
  sectors: 'sector',
  'request-types': 'requestType',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private readonly logger = new Logger(AuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: { id: string };
      ip: string;
      body: Record<string, unknown>;
      headers: Record<string, string>;
    }>();
    const { method, url, user, ip, body, headers } = request;

    if (!WRITE_METHODS.includes(method) || !user) {
      return next.handle();
    }

    const entityType = this.extractEntityType(url);
    const entityId = this.extractEntityId(url);
    const userAgent = headers['user-agent'] ?? null;

    // Try to fetch the current state BEFORE the mutation
    const beforePromise = this.fetchBefore(entityType, entityId);

    return next.handle().pipe(
      tap({
        next: (responseData: { id?: string } | null) => {
          const resolvedEntityId = entityId || responseData?.id || 'unknown';

          beforePromise
            .then((payloadBefore) => {
              this.auditService.log({
                actorUserId: user.id,
                action: `${method}:${url}`,
                entityType,
                entityId: resolvedEntityId,
                payloadBefore,
                payloadAfter: { ...body },
                ipAddress: ip,
                userAgent: userAgent ?? undefined,
              });
            })
            .catch((err: unknown) => {
              this.logger.error(
                'Failed to fetch before-state for audit',
                err instanceof Error ? err.stack : String(err),
              );
              // Still log even if we couldn't fetch the before state
              this.auditService.log({
                actorUserId: user.id,
                action: `${method}:${url}`,
                entityType,
                entityId: resolvedEntityId,
                payloadBefore: null,
                payloadAfter: { ...body },
                ipAddress: ip,
                userAgent: userAgent ?? undefined,
              });
            });
        },
      }),
    );
  }

  private extractEntityType(url: string): string {
    const segments = url.split('/').filter(Boolean);
    return segments[0] ?? 'unknown';
  }

  private extractEntityId(url: string): string {
    const segments = url.split('/').filter(Boolean);
    // URL pattern: /entity/:id or /entity/:id/action
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return segments.find((s) => UUID_REGEX.test(s)) ?? '';
  }

  private async fetchBefore(entityType: string, entityId: string): Promise<Record<string, unknown> | null> {
    if (!entityId) return null;
    const modelName = ENTITY_MODEL_MAP[entityType];
    if (!modelName) return null;

    try {
      const model = (this.prisma as Record<string, unknown>)[modelName] as
        | { findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null> }
        | undefined;
      if (!model?.findUnique) return null;
      return await model.findUnique({ where: { id: entityId } });
    } catch {
      return null;
    }
  }
}
```

**Step 2: Verificar build e testes unitários**

Run: `npm run build && npm run test`
Expected: Build limpo, todos os testes passam (pode precisar atualizar audit.interceptor.spec.ts para injetar AuditService)

**Step 3: Atualizar o teste unitário do interceptor**

O arquivo `src/common/interceptors/audit.interceptor.spec.ts` precisa ser atualizado para injetar o novo `AuditService` como dependência. Adicionar mock do AuditService.

**Step 4: Commit**

```bash
git add src/common/interceptors/audit.interceptor.ts src/common/interceptors/audit.interceptor.spec.ts
git commit -m "feat: capture payloadBefore and userAgent in AuditInterceptor"
```

---

### Task 4: Adicionar audit logging no AuthService (login success/failure, refresh, logout)

**Files:**
- Modify: `src/modules/auth/auth.service.ts`
- Modify: `src/modules/auth/auth.module.ts`

**Step 1: Injetar AuditService no AuthService**

Adicionar `AuditLogsModule` aos imports do `auth.module.ts`.
Injetar `AuditService` no construtor do `AuthService`.

**Step 2: Adicionar logs de auditoria no AuthService**

No método `login()`:
- Após autenticação BEM-SUCEDIDA: `this.auditService.log({ action: 'LOGIN_SUCCESS', entityType: 'auth', entityId: user.id, ... })`
- Após falha (catch do password mismatch): `this.auditService.log({ action: 'LOGIN_FAILURE', entityType: 'auth', entityId: dto.email, ... })` — note que entityId é o email pois o userId pode não existir

O `login()` recebe `LoginDto` e `Response`. Precisamos também do `ip` e `userAgent` que vêm do request. O controller precisa passar essas informações. Modificar o controller para injetar `@Req()` e passar `ip` e `user-agent`:

No `auth.controller.ts`, modificar o método `login()`:
```typescript
@Post('login')
@Public()
@HttpCode(200)
@Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
login(
  @Body() dto: LoginDto,
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
) {
  return this.authService.login(dto, res, req.ip, req.headers['user-agent']);
}
```

E no `auth.service.ts`, o método `login()`:
```typescript
async login(dto: LoginDto, res: Response, ip?: string, userAgent?: string) {
  const user = await this.prisma.user.findUnique({
    where: { email: dto.email },
    include: { role: true, sector: true },
  });

  if (!user || !user.isActive) {
    this.auditService.log({
      actorUserId: 'anonymous',
      action: 'LOGIN_FAILURE',
      entityType: 'auth',
      entityId: dto.email,
      payloadAfter: { reason: 'user_not_found_or_inactive', email: dto.email },
      ipAddress: ip,
      userAgent,
    });
    throw new UnauthorizedException('Credenciais inválidas');
  }

  const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
  if (!passwordMatch) {
    this.auditService.log({
      actorUserId: user.id,
      action: 'LOGIN_FAILURE',
      entityType: 'auth',
      entityId: user.id,
      payloadAfter: { reason: 'invalid_password', email: dto.email },
      ipAddress: ip,
      userAgent,
    });
    throw new UnauthorizedException('Credenciais inválidas');
  }

  // ... gerar tokens normalmente ...

  this.auditService.log({
    actorUserId: user.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'auth',
    entityId: user.id,
    payloadAfter: { email: user.email },
    ipAddress: ip,
    userAgent,
  });

  // ... return tokens ...
}
```

Aplicar padrão similar ao `refresh()` e `logout()`:
- `refresh`: log `TOKEN_REFRESH` com `actorUserId` do payload JWT
- `logout`: log `LOGOUT` com `actorUserId` do JWT (precisará do `@CurrentUser()` no controller)

**Step 3: Verificar build e testes**

Run: `npm run build && npm run test`

**Step 4: Commit**

```bash
git add src/modules/auth/auth.service.ts src/modules/auth/auth.controller.ts src/modules/auth/auth.module.ts
git commit -m "feat: add audit logging for login success/failure, refresh, and logout"
```

---

### Task 5: Adicionar audit logging para consultas sensíveis (dashboard, reports, audit-logs)

**Files:**
- Modify: `src/modules/dashboard/dashboard.controller.ts`
- Modify: `src/modules/dashboard/dashboard.module.ts`
- Modify: `src/modules/reports/reports.controller.ts`
- Modify: `src/modules/reports/reports.module.ts`
- Modify: `src/modules/audit-logs/audit-logs.controller.ts`

**Step 1: Injetar AuditService nos controllers de consultas sensíveis**

Adicionar `AuditLogsModule` aos imports dos módulos Dashboard e Reports.

**Step 2: Adicionar logs nos controllers**

No `dashboard.controller.ts`, cada método GET deve logar:

```typescript
@Get('overview')
async overview(@CurrentUser() user: { id: string }, @Req() req: Request) {
  this.auditService.log({
    actorUserId: user.id,
    action: 'VIEW_DASHBOARD_OVERVIEW',
    entityType: 'dashboard',
    entityId: 'overview',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  return this.dashboardService.overview();
}
```

Padrão similar para: `by-period`, `response-time`, `user-activity`, `overdue`.

No `reports.controller.ts`:
```typescript
this.auditService.log({
  actorUserId: user.id,
  action: 'EXPORT_PDF',
  entityType: 'reports',
  entityId: 'requests',
  payloadAfter: { ...query } as Record<string, unknown>,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});
```

No `audit-logs.controller.ts`, o `findAll`:
```typescript
this.auditService.log({
  actorUserId: user.id,
  action: 'VIEW_AUDIT_LOGS',
  entityType: 'audit-logs',
  entityId: 'search',
  payloadAfter: { ...query } as Record<string, unknown>,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});
```

**Step 3: Verificar build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/modules/dashboard/ src/modules/reports/ src/modules/audit-logs/
git commit -m "feat: add audit logging for dashboard, reports, and audit-log views"
```

---

### Task 6: Helper de teste — setupE2EApp + createTestUsers

**Files:**
- Create: `test/helpers/setup.ts`

**Step 1: Criar o helper**

Criar `test/helpers/setup.ts` com funções auxiliares para os testes e2e:

```typescript
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

/**
 * Login as an existing user and return the access token.
 */
export async function loginAs(app: INestApplication, email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.accessToken;
}

/**
 * Create a test user in the database directly via Prisma.
 * Returns the user id.
 */
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

/**
 * Clean up all test data created during test run.
 * Deletes in correct FK order.
 */
export async function cleanupTestData(prisma: PrismaService, testUserIds: string[]) {
  if (testUserIds.length === 0) return;

  // Delete in FK-safe order
  await prisma.notification.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: testUserIds } } });

  // Find requests created by test users
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

  // Clean protocol sequences generated during test
  // (don't delete — just leave them, they're harmless)

  // Clean audit logs from test users
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: testUserIds } } });

  // Finally delete users
  await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
}
```

**Step 2: Verificar build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add test/helpers/setup.ts
git commit -m "feat: add e2e test helpers for app setup, login, user creation, and cleanup"
```

---

### Task 7: Teste E2E — Fluxo completo de autenticação

**Files:**
- Modify: `test/auth.e2e-spec.ts` (reescrever)

**Step 1: Reescrever os testes de auth**

Substituir `test/auth.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupApp, loginAs } from './helpers/setup';

describe('Auth Flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupApp();
  });

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
        .send({ email: 'ghost@test.com', password: 'wrong' })
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
```

**Step 2: Rodar testes**

Run: `npm run test:e2e -- --testPathPattern auth`
Expected: Todos os testes passam

**Step 3: Commit**

```bash
git add test/auth.e2e-spec.ts
git commit -m "test: add comprehensive auth flow e2e tests"
```

---

### Task 8: Teste E2E — Fluxo completo de tramitação

**Files:**
- Create: `test/tramitation-flow.e2e-spec.ts`

**Step 1: Criar o teste de fluxo completo**

Criar `test/tramitation-flow.e2e-spec.ts`:

Este é o teste mais importante — valida o fluxo de vida inteiro de um protocolo:

```typescript
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

    // Create test users in different sectors with role 'protocolo' (has send+receive)
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

    const gabUserId = await createTestUser(prisma, {
      name: 'Test User GAB',
      email: 'test-gab@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-GAB-001',
      sectorCode: 'GAB',
      roleSlug: 'secretario',  // has approve permission
    });
    testUserIds.push(gabUserId);

    // Login all test users
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
    // PROTOCOLADO → RECEBIDO_PELO_SETOR → EM_ANALISE → RECEBIDO_PELO_SETOR → DEFERIDO
  });

  it('Step 9: Public timeline shows all events', async () => {
    const res = await request(app.getHttpServer())
      .get(`/requests/${requestId}/timeline`)
      .expect(200);  // No auth needed — @Public()

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
```

**Step 2: Rodar o teste**

Run: `npm run test:e2e -- --testPathPattern tramitation`
Expected: Todos os 10 passos passam

**Step 3: Commit**

```bash
git add test/tramitation-flow.e2e-spec.ts
git commit -m "test: add full tramitation flow e2e test (create → forward → receive → defer)"
```

---

### Task 9: Teste E2E — Permissões RBAC

**Files:**
- Create: `test/permissions.e2e-spec.ts`

**Step 1: Criar o teste de permissões**

Criar `test/permissions.e2e-spec.ts`:

```typescript
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
      email: 'test-servidor@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-SERV-001',
      sectorCode: 'PROT',
      roleSlug: 'servidor',
    });
    testUserIds.push(servidorId);

    // Protocolo — has send+receive, no approve
    const protocoloId = await createTestUser(prisma, {
      name: 'Protocolo Test',
      email: 'test-protocolo@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-PROTO-001',
      sectorCode: 'PROT',
      roleSlug: 'protocolo',
    });
    testUserIds.push(protocoloId);

    // RH user for sector-wrong-sector tests
    const rhUserId = await createTestUser(prisma, {
      name: 'RH User Test',
      email: 'test-rh-perm@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-RH-PERM-001',
      sectorCode: 'RH',
      roleSlug: 'protocolo',
    });
    testUserIds.push(rhUserId);

    servidorToken = await loginAs(app, 'test-servidor@e2e.test', TEST_PASSWORD);
    protocoloToken = await loginAs(app, 'test-protocolo@e2e.test', TEST_PASSWORD);
    adminToken = await loginAs(app, 'admin@semed.prainha.pa.gov.br', 'Admin@2026!');
    rhUserToken = await loginAs(app, 'test-rh-perm@e2e.test', TEST_PASSWORD);

    const rt = await prisma.requestType.findFirst({ where: { name: 'Licença Prêmio' } });
    requestTypeId = rt!.id;

    // Create a request as protocolo user (has 'send' permission)
    const res = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${protocoloToken}`)
      .send({ requestTypeId, description: 'Permissão test request' })
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

    it('CAN view requests (has view permission)', async () => {
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
      // Use admin to change status (has all permissions)
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
      // First reset status so we can test forward
      await request(app.getHttpServer())
        .patch(`/requests/${requestId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'EM_ANALISE' });

      // Admin can skip flow and forward from PROT directly to GAB
      const res = await request(app.getHttpServer())
        .post(`/requests/${requestId}/forward`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ toSectorCode: 'JUR', notes: 'Encaminhamento extraordinário' })
        .expect(201);

      expect(res.body.toSectorId).toBeDefined();
    });
  });
});
```

**Step 2: Rodar o teste**

Run: `npm run test:e2e -- --testPathPattern permissions`
Expected: Todos os testes passam

**Step 3: Commit**

```bash
git add test/permissions.e2e-spec.ts
git commit -m "test: add RBAC permissions e2e tests (servidor, wrong-sector, flow, superadmin)"
```

---

### Task 10: Teste E2E — Trilha de Auditoria

**Files:**
- Create: `test/audit-trail.e2e-spec.ts`

**Step 1: Criar o teste de auditoria**

Criar `test/audit-trail.e2e-spec.ts`:

```typescript
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
      email: 'test-audit@e2e.test',
      passwordHash: hash,
      registrationNumber: 'E2E-AUDIT-001',
      sectorCode: 'PROT',
      roleSlug: 'protocolo',
    });
    testUserIds.push(userId);

    userToken = await loginAs(app, 'test-audit@e2e.test', TEST_PASSWORD);

    const rt = await prisma.requestType.findFirst({ where: { name: 'Licença Prêmio' } });
    requestTypeId = rt!.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestData(prisma, testUserIds);
    await app.close();
  }, 15000);

  it('login creates LOGIN_SUCCESS audit log', async () => {
    // The loginAs in beforeAll already logged in. Check audit logs.
    // Wait briefly for fire-and-forget to complete
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
      .send({ email: 'test-audit@e2e.test', password: 'WrongPassword!' })
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
```

**Step 2: Rodar o teste**

Run: `npm run test:e2e -- --testPathPattern audit-trail`
Expected: Todos os testes passam

**Step 3: Commit**

```bash
git add test/audit-trail.e2e-spec.ts
git commit -m "test: add audit trail e2e tests (login events, mutations, read tracking)"
```

---

### Task 11: Aumentar timeout do Jest E2E e rodar suite completa

**Files:**
- Modify: `test/jest-e2e.json`

**Step 1: Configurar timeout adequado**

Atualizar `test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "testTimeout": 30000,
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

**Step 2: Rodar testes unitários + e2e + build**

Run: `npm run test && npm run test:e2e && npm run build`
Expected: Todos os testes passam, build limpo

**Step 3: Commit final**

```bash
git add test/jest-e2e.json
git commit -m "test: configure e2e test timeout and verify full test suite passes"
```

---

## Resumo de Cobertura Final

| Cenário | Teste | Arquivo |
|---|---|---|
| Login válido retorna token | ✅ | `auth.e2e-spec.ts` |
| Login inválido retorna 401 | ✅ | `auth.e2e-spec.ts` |
| Token inválido retorna 401 | ✅ | `auth.e2e-spec.ts` |
| Logout funciona | ✅ | `auth.e2e-spec.ts` |
| Criar protocolo gera número | ✅ | `tramitation-flow.e2e-spec.ts` |
| Encaminhar PROT→RH | ✅ | `tramitation-flow.e2e-spec.ts` |
| RH recebe protocolo | ✅ | `tramitation-flow.e2e-spec.ts` |
| Mudar status para EM_ANALISE | ✅ | `tramitation-flow.e2e-spec.ts` |
| Encaminhar RH→GAB | ✅ | `tramitation-flow.e2e-spec.ts` |
| Deferir protocolo | ✅ | `tramitation-flow.e2e-spec.ts` |
| Timeline mostra tudo | ✅ | `tramitation-flow.e2e-spec.ts` |
| Dashboard reflete dados | ✅ | `tramitation-flow.e2e-spec.ts` |
| Servidor não pode criar | ✅ | `permissions.e2e-spec.ts` |
| Servidor não pode encaminhar | ✅ | `permissions.e2e-spec.ts` |
| Servidor não pode receber | ✅ | `permissions.e2e-spec.ts` |
| Servidor pode visualizar | ✅ | `permissions.e2e-spec.ts` |
| Setor errado não pode encaminhar | ✅ | `permissions.e2e-spec.ts` |
| Setor errado não pode receber | ✅ | `permissions.e2e-spec.ts` |
| Não pode pular setor no fluxo | ✅ | `permissions.e2e-spec.ts` |
| INDEFERIDO sem justificativa = 400 | ✅ | `permissions.e2e-spec.ts` |
| Admin bypassa fluxo | ✅ | `permissions.e2e-spec.ts` |
| Login success gera audit log | ✅ | `audit-trail.e2e-spec.ts` |
| Login failure gera audit log | ✅ | `audit-trail.e2e-spec.ts` |
| Criar request gera audit log | ✅ | `audit-trail.e2e-spec.ts` |
| Dashboard view gera audit log | ✅ | `audit-trail.e2e-spec.ts` |
| Audit logs consultáveis via API | ✅ | `audit-trail.e2e-spec.ts` |
