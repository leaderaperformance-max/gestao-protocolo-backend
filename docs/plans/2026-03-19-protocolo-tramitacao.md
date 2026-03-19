# Sistema de Protocolo e Tramitação Digital — Plano de Implementação

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Construir uma API REST robusta e escalável em NestJS para digitalizar o protocolo e tramitação de solicitações internas da Secretaria Municipal de Educação de Prainha, Pará.

**Architecture:** API REST modular com NestJS, RBAC via JWT customizado, fluxo de tramitação configurável por tipo de solicitação, log de auditoria append-only com validade jurídica, e dashboard gerencial com queries SQL otimizadas.

**Tech Stack:** NestJS + TypeScript, Prisma ORM, PostgreSQL (Supabase), bcrypt, @nestjs/jwt, @nestjs/throttler, @nestjs/schedule, Supabase Storage SDK, pdfmake, Swagger/OpenAPI, Jest + Supertest.

---

## Variáveis de Ambiente Necessárias

Criar `.env` na raiz do projeto:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/postgres?schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"

JWT_ACCESS_SECRET="sua-chave-secreta-access-256bits"
JWT_REFRESH_SECRET="sua-chave-secreta-refresh-256bits"
JWT_ACCESS_EXPIRES_IN="8h"
JWT_REFRESH_EXPIRES_IN="7d"

SUPABASE_URL="https://SEU-PROJETO.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key"
SUPABASE_STORAGE_BUCKET="attachments"

PORT=3000
NODE_ENV="development"
CORS_ORIGIN="http://localhost:5173"
```

---

## Fase 1 — Fundação (Infraestrutura)

### Task 1: Scaffold do Projeto NestJS

**Files:**
- Create: `package.json`, `tsconfig.json`, `src/main.ts`, `src/app.module.ts`

**Step 1: Instalar NestJS CLI e criar o projeto**

```bash
npm install -g @nestjs/cli
nest new gestao-protocolo --package-manager npm --skip-git
cd gestao-protocolo
```

Quando perguntado sobre package manager, escolha `npm`.

**Step 2: Instalar todas as dependências de uma vez**

```bash
npm install \
  @nestjs/config \
  @nestjs/jwt \
  @nestjs/passport \
  @nestjs/throttler \
  @nestjs/schedule \
  @nestjs/swagger \
  @prisma/client \
  @supabase/supabase-js \
  bcrypt \
  class-transformer \
  class-validator \
  cookie-parser \
  helmet \
  pdfmake \
  passport \
  passport-jwt

npm install -D \
  @types/bcrypt \
  @types/cookie-parser \
  @types/pdfmake \
  @types/passport-jwt \
  prisma
```

**Step 3: Verificar que o projeto inicia**

```bash
npm run start:dev
```

Esperado: `Application is running on: http://[::1]:3000`

**Step 4: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold nestjs project with all dependencies"
```

---

### Task 2: Configurar Prisma + Schema Completo

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env`
- Modify: `src/app.module.ts`
- Create: `src/prisma/prisma.module.ts`
- Create: `src/prisma/prisma.service.ts`

**Step 1: Inicializar Prisma**

```bash
npx prisma init
```

Isso cria `prisma/schema.prisma` e `.env`.

**Step 2: Substituir o conteúdo de `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ==========================================
// ROLES & PERMISSIONS
// ==========================================

model Role {
  id           String  @id @default(uuid())
  name         String
  slug         String  @unique
  permissions  Json
  isSuperadmin Boolean @default(false)

  users User[]

  @@map("roles")
}

// ==========================================
// SECTORS
// ==========================================

model Sector {
  id       String  @id @default(uuid())
  name     String
  code     String  @unique
  isActive Boolean @default(true)

  users              User[]
  requestsOrigin     Request[] @relation("SectorOrigin")
  requestsCurrent    Request[] @relation("SectorCurrent")
  tramitationsFrom   RequestTramitation[] @relation("TramitationFrom")
  tramitationsTo     RequestTramitation[] @relation("TramitationTo")

  @@map("sectors")
}

// ==========================================
// USERS
// ==========================================

model User {
  id                 String   @id @default(uuid())
  name               String
  email              String   @unique
  passwordHash       String
  registrationNumber String   @unique
  sectorId           String
  roleId             String
  isActive           Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  sector   Sector @relation(fields: [sectorId], references: [id])
  role     Role   @relation(fields: [roleId], references: [id])

  requestsCreated      Request[]              @relation("Requester")
  tramitationsSent     RequestTramitation[]   @relation("SentBy")
  tramitationsReceived RequestTramitation[]   @relation("ReceivedBy")
  statusChanges        RequestStatusHistory[]
  attachmentsUploaded  Attachment[]
  notifications        Notification[]
  refreshTokens        RefreshToken[]

  @@map("users")
}

model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@map("refresh_tokens")
}

// ==========================================
// REQUEST TYPES
// ==========================================

model RequestType {
  id        String   @id @default(uuid())
  name      String
  slaDays   Int
  flow      Json
  isActive  Boolean  @default(true)
  createdBy String
  createdAt DateTime @default(now())

  requests Request[]

  @@map("request_types")
}

// ==========================================
// PROTOCOL SEQUENCES
// ==========================================

model ProtocolSequence {
  id           String @id @default(uuid())
  year         Int
  sectorCode   String
  lastSequence Int    @default(0)

  @@unique([year, sectorCode])
  @@map("protocol_sequences")
}

// ==========================================
// REQUESTS (PROTOCOLOS)
// ==========================================

enum RequestStatus {
  PROTOCOLADO
  RECEBIDO_PELO_SETOR
  EM_ANALISE
  PENDENTE_DOCUMENTO
  DEFERIDO
  INDEFERIDO
  CONCLUIDO
}

model Request {
  id             String        @id @default(uuid())
  protocolNumber String        @unique
  requesterId    String
  sectorOriginId String
  requestTypeId  String
  description    String
  status         RequestStatus @default(PROTOCOLADO)
  currentSectorId String
  deadlineAt     DateTime
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  requester     User        @relation("Requester", fields: [requesterId], references: [id])
  sectorOrigin  Sector      @relation("SectorOrigin", fields: [sectorOriginId], references: [id])
  requestType   RequestType @relation(fields: [requestTypeId], references: [id])
  currentSector Sector      @relation("SectorCurrent", fields: [currentSectorId], references: [id])

  tramitations  RequestTramitation[]
  statusHistory RequestStatusHistory[]
  attachments   Attachment[]

  @@map("requests")
}

model RequestTramitation {
  id               String    @id @default(uuid())
  requestId        String
  fromSectorId     String
  toSectorId       String
  sentByUserId     String
  sentAt           DateTime  @default(now())
  receivedByUserId String?
  receivedAt       DateTime?
  notes            String?

  request   Request @relation(fields: [requestId], references: [id])
  fromSector Sector @relation("TramitationFrom", fields: [fromSectorId], references: [id])
  toSector   Sector @relation("TramitationTo", fields: [toSectorId], references: [id])
  sentBy     User   @relation("SentBy", fields: [sentByUserId], references: [id])
  receivedBy User?  @relation("ReceivedBy", fields: [receivedByUserId], references: [id])

  @@map("request_tramitations")
}

model RequestStatusHistory {
  id              String         @id @default(uuid())
  requestId       String
  previousStatus  RequestStatus?
  newStatus       RequestStatus
  changedByUserId String
  justification   String?
  changedAt       DateTime       @default(now())

  request   Request @relation(fields: [requestId], references: [id])
  changedBy User    @relation(fields: [changedByUserId], references: [id])

  @@map("request_status_history")
}

// ==========================================
// ATTACHMENTS
// ==========================================

model Attachment {
  id               String   @id @default(uuid())
  requestId        String
  uploadedByUserId String
  filename         String
  storagePath      String
  mimeType         String
  sizeBytes        Int
  uploadedAt       DateTime @default(now())

  request    Request @relation(fields: [requestId], references: [id])
  uploadedBy User    @relation(fields: [uploadedByUserId], references: [id])

  @@map("attachments")
}

// ==========================================
// AUDIT LOGS (APPEND-ONLY)
// ==========================================

model AuditLog {
  id            String   @id @default(uuid())
  actorUserId   String
  action        String
  entityType    String
  entityId      String
  payloadBefore Json?
  payloadAfter  Json?
  ipAddress     String?
  createdAt     DateTime @default(now())

  @@map("audit_logs")
}

// ==========================================
// NOTIFICATIONS
// ==========================================

model Notification {
  id               String   @id @default(uuid())
  userId           String
  title            String
  body             String
  type             String
  relatedRequestId String?
  isRead           Boolean  @default(false)
  createdAt        DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@map("notifications")
}
```

**Step 3: Criar `src/prisma/prisma.service.ts`**

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

**Step 4: Criar `src/prisma/prisma.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

**Step 5: Configurar `.env` com suas credenciais do Supabase**

Acesse o Supabase → Settings → Database → Connection String. Use a string de conexão "Transaction" para `DATABASE_URL` e "Session" para `DIRECT_URL`.

**Step 6: Rodar a migration inicial**

```bash
npx prisma migrate dev --name init
```

Esperado: `Your database is now in sync with your schema.`

**Step 7: Gerar o cliente Prisma**

```bash
npx prisma generate
```

**Step 8: Commit**

```bash
git add prisma/ src/prisma/ .env.example
git commit -m "feat: add prisma schema with all entities and initial migration"
```

---

### Task 3: Configurar Global Middleware (Helmet, CORS, Validação, Throttler)

**Files:**
- Modify: `src/main.ts`
- Modify: `src/app.module.ts`
- Create: `src/config/app.config.ts`

**Step 1: Criar `src/config/app.config.ts`**

```typescript
export const appConfig = () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '8h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'attachments',
  },
});
```

**Step 2: Substituir `src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Protocolo Digital — SEMED Prainha')
    .setDescription('API do Sistema de Protocolo e Tramitação Digital')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
  console.log(`Swagger on http://localhost:${port}/api`);
}
bootstrap();
```

**Step 3: Atualizar `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { appConfig } from './config/app.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
  ],
})
export class AppModule {}
```

**Step 4: Verificar que a aplicação inicia corretamente**

```bash
npm run start:dev
```

Acesse `http://localhost:3000/api` e verifique se o Swagger carrega.

**Step 5: Commit**

```bash
git add src/main.ts src/app.module.ts src/config/
git commit -m "feat: configure helmet, cors, validation pipe, swagger, throttler"
```

---

### Task 4: AuditInterceptor Global

**Files:**
- Create: `src/common/interceptors/audit.interceptor.ts`
- Create: `src/common/interceptors/index.ts`
- Modify: `src/app.module.ts`

**Step 1: Criar `src/common/interceptors/audit.interceptor.ts`**

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, ip, body } = request;

    if (!WRITE_METHODS.includes(method) || !user) {
      return next.handle();
    }

    const action = `${method}:${url}`;
    const startPayload = { ...body };

    return next.handle().pipe(
      tap({
        next: (responseData) => {
          // Fire-and-forget audit log
          this.prisma.auditLog
            .create({
              data: {
                actorUserId: user.id,
                action,
                entityType: this.extractEntityType(url),
                entityId: responseData?.id ?? 'unknown',
                payloadBefore: null,
                payloadAfter: startPayload,
                ipAddress: ip,
              },
            })
            .catch(() => {}); // Never fail the request due to audit
        },
      }),
    );
  }

  private extractEntityType(url: string): string {
    const segments = url.split('/').filter(Boolean);
    return segments[0] ?? 'unknown';
  }
}
```

**Step 2: Escrever teste unitário `src/common/interceptors/audit.interceptor.spec.ts`**

```typescript
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor', () => {
  it('should be defined', () => {
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } } as any;
    const interceptor = new AuditInterceptor(prisma);
    expect(interceptor).toBeDefined();
  });

  it('should extract entity type from URL', () => {
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } } as any;
    const interceptor = new AuditInterceptor(prisma) as any;
    expect(interceptor.extractEntityType('/requests/123')).toBe('requests');
    expect(interceptor.extractEntityType('/auth/login')).toBe('auth');
  });
});
```

**Step 3: Rodar o teste**

```bash
npm run test -- audit.interceptor --verbose
```

Esperado: PASS

**Step 4: Commit**

```bash
git add src/common/
git commit -m "feat: add global audit interceptor for append-only juridical logging"
```

---

### Task 5: Guards de Auth e Permissão

**Files:**
- Create: `src/common/guards/jwt-auth.guard.ts`
- Create: `src/common/guards/permission.guard.ts`
- Create: `src/common/decorators/current-user.decorator.ts`
- Create: `src/common/decorators/require-permission.decorator.ts`
- Create: `src/common/decorators/public.decorator.ts`

**Step 1: Criar `src/common/decorators/public.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

**Step 2: Criar `src/common/decorators/current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

**Step 3: Criar `src/common/decorators/require-permission.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
export const PERMISSION_KEY = 'permission';
export type Permission = 'view' | 'edit' | 'send' | 'receive' | 'approve' | 'reject';
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);
```

**Step 4: Criar `src/common/guards/jwt-auth.guard.ts`**

```typescript
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) throw err ?? new UnauthorizedException('Token inválido ou expirado');
    return user;
  }
}
```

**Step 5: Criar `src/common/guards/permission.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, Permission } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<Permission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) throw new ForbiddenException('Sem autenticação');
    if (user.role?.isSuperadmin) return true;

    const permissions = user.role?.permissions as Record<string, boolean> | undefined;
    if (!permissions?.[requiredPermission]) {
      throw new ForbiddenException(
        `Permissão insuficiente: requer '${requiredPermission}'`,
      );
    }

    return true;
  }
}
```

**Step 6: Escrever teste para PermissionGuard**

```typescript
// src/common/guards/permission.guard.spec.ts
import { PermissionGuard } from './permission.guard';
import { Reflector } from '@nestjs/core';

const mockContext = (user: any) => ({
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
  getHandler: () => ({}),
  getClass: () => ({}),
}) as any;

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionGuard(reflector);
  });

  it('should allow when no permission required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({}))).toBe(true);
  });

  it('should allow superadmin', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('approve');
    const user = { role: { isSuperadmin: true } };
    expect(guard.canActivate(mockContext(user))).toBe(true);
  });

  it('should deny user without permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('approve');
    const user = { role: { isSuperadmin: false, permissions: { approve: false } } };
    expect(() => guard.canActivate(mockContext(user))).toThrow('Permissão insuficiente');
  });

  it('should allow user with permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('receive');
    const user = { role: { isSuperadmin: false, permissions: { receive: true } } };
    expect(guard.canActivate(mockContext(user))).toBe(true);
  });
});
```

**Step 7: Rodar os testes**

```bash
npm run test -- permission.guard --verbose
```

Esperado: PASS (4 testes)

**Step 8: Commit**

```bash
git add src/common/
git commit -m "feat: add jwt guard, permission guard, and auth decorators"
```

---

## Fase 2 — Auth e Controle de Acesso

### Task 6: Módulo Auth (Login, JWT, Refresh, Logout, /me)

**Files:**
- Create: `src/modules/auth/auth.module.ts`
- Create: `src/modules/auth/auth.controller.ts`
- Create: `src/modules/auth/auth.service.ts`
- Create: `src/modules/auth/strategies/jwt.strategy.ts`
- Create: `src/modules/auth/dto/login.dto.ts`
- Create: `src/modules/auth/dto/auth-response.dto.ts`
- Create: `src/modules/auth/auth.service.spec.ts`
- Modify: `src/app.module.ts`

**Step 1: Criar `src/modules/auth/dto/login.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@semed.pa.gov.br' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'senha123' })
  @IsString()
  @MinLength(6)
  password: string;
}
```

**Step 2: Criar `src/modules/auth/strategies/jwt.strategy.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, isActive: true },
      include: { role: true, sector: true },
    });
    if (!user) throw new UnauthorizedException('Usuário não encontrado ou inativo');
    return user;
  }
}
```

**Step 3: Criar `src/modules/auth/auth.service.ts`**

```typescript
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true, sector: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const tokens = await this.generateTokens(user.id, user.email);

    // Store refresh token
    await this.prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Set refresh token as httpOnly cookie
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.get('nodeEnv') === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const { passwordHash, ...userWithoutPassword } = user;
    return { accessToken: tokens.accessToken, user: userWithoutPassword };
  }

  async refresh(refreshToken: string, res: Response) {
    if (!refreshToken) throw new BadRequestException('Refresh token não fornecido');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });

      const tokens = await this.generateTokens(payload.sub, payload.email);

      // Rotate refresh token
      await this.prisma.refreshToken.update({
        where: { token: refreshToken },
        data: { revokedAt: new Date() },
      });

      await this.prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: payload.sub,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      res.cookie('refresh_token', tokens.refreshToken, {
        httpOnly: true,
        secure: this.config.get('nodeEnv') === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return { accessToken: tokens.accessToken };
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  async logout(refreshToken: string, res: Response) {
    if (refreshToken) {
      await this.prisma.refreshToken
        .update({
          where: { token: refreshToken },
          data: { revokedAt: new Date() },
        })
        .catch(() => {});
    }
    res.clearCookie('refresh_token');
    return { message: 'Logout realizado com sucesso' };
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessExpiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpiresIn'),
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
```

**Step 4: Criar `src/modules/auth/auth.controller.ts`**

```typescript
import { Controller, Post, Body, Req, Res, Get, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts / 15 min
  @ApiOperation({ summary: 'Login com email e senha' })
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(dto, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar access token via refresh token (cookie)' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.refresh(req.cookies?.refresh_token, res);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout e invalidação do refresh token' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req.cookies?.refresh_token, res);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  me(@CurrentUser() user: any) {
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
```

**Step 5: Criar `src/modules/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
```

**Step 6: Escrever teste e2e básico para auth**

```typescript
// test/auth.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
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

  it('POST /auth/login with invalid credentials returns 401', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'naoexiste@test.com', password: '123456' })
      .expect(401);
  });

  it('GET /auth/me without token returns 401', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
```

**Step 7: Adicionar AuthModule ao AppModule**

```typescript
// Em src/app.module.ts, adicionar AuthModule ao array imports:
import { AuthModule } from './modules/auth/auth.module';
// ...
imports: [..., AuthModule],
```

**Step 8: Rodar os testes**

```bash
npm run test:e2e -- --testPathPattern=auth
```

Esperado: PASS

**Step 9: Commit**

```bash
git add src/modules/auth/ test/auth.e2e-spec.ts
git commit -m "feat: add auth module with JWT login, refresh, logout and /me endpoint"
```

---

### Task 7: Módulo Roles (CRUD)

**Files:**
- Create: `src/modules/roles/roles.module.ts`
- Create: `src/modules/roles/roles.controller.ts`
- Create: `src/modules/roles/roles.service.ts`
- Create: `src/modules/roles/dto/create-role.dto.ts`
- Create: `src/modules/roles/dto/update-role.dto.ts`

**Step 1: Criar `src/modules/roles/dto/create-role.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class PermissionsDto {
  @IsBoolean() view: boolean;
  @IsBoolean() edit: boolean;
  @IsBoolean() send: boolean;
  @IsBoolean() receive: boolean;
  @IsBoolean() approve: boolean;
  @IsBoolean() reject: boolean;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'Setor RH' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'rh' })
  @IsString()
  slug: string;

  @ApiProperty()
  @IsObject()
  permissions: PermissionsDto;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  isSuperadmin?: boolean;
}
```

**Step 2: Criar `src/modules/roles/roles.service.ts`**

```typescript
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Role com slug '${dto.slug}' já existe`);
    return this.prisma.role.create({ data: dto });
  }

  findAll() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role não encontrado');
    return role;
  }

  async update(id: string, dto: Partial<CreateRoleDto>) {
    await this.findOne(id);
    return this.prisma.role.update({ where: { id }, data: dto });
  }
}
```

**Step 3: Criar `src/modules/roles/roles.controller.ts`**

```typescript
import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Criar novo perfil de acesso' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os perfis' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar perfil por ID' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Atualizar perfil' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateRoleDto>) {
    return this.rolesService.update(id, dto);
  }
}
```

**Step 4: Criar módulo, adicionar ao AppModule, rodar testes, commit**

```bash
# Adicionar RolesModule ao AppModule
git add src/modules/roles/
git commit -m "feat: add roles module with CRUD and permission-based access"
```

---

### Task 8: Módulo Users (CRUD + Soft Delete)

**Files:**
- Create: `src/modules/users/users.module.ts`
- Create: `src/modules/users/users.controller.ts`
- Create: `src/modules/users/users.service.ts`
- Create: `src/modules/users/dto/create-user.dto.ts`

**Step 1: Criar `src/modules/users/dto/create-user.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: 'Matrícula do servidor' })
  @IsString()
  registrationNumber: string;

  @ApiProperty()
  @IsUUID()
  sectorId: string;

  @ApiProperty()
  @IsUUID()
  roleId: string;
}
```

**Step 2: Criar `src/modules/users/users.service.ts`**

```typescript
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { registrationNumber: dto.registrationNumber }] },
    });
    if (existing) throw new ConflictException('Email ou matrícula já cadastrados');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { password, ...rest } = dto;
    const user = await this.prisma.user.create({
      data: { ...rest, passwordHash },
      include: { role: true, sector: true },
    });
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  findAll() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, email: true, registrationNumber: true,
        isActive: true, createdAt: true,
        sector: { select: { id: true, name: true, code: true } },
        role: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true, sector: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async update(id: string, dto: Partial<CreateUserDto>) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
      delete data.password;
    }
    const updated = await this.prisma.user.update({
      where: { id }, data,
      include: { role: true, sector: true },
    });
    const { passwordHash, ...rest } = updated;
    return rest;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { message: 'Usuário desativado com sucesso' };
  }
}
```

**Step 3: Criar controller, módulo, adicionar ao AppModule**

```typescript
// users.controller.ts — estrutura igual ao roles.controller.ts
// Endpoints: GET /, POST /, GET /:id, PATCH /:id, DELETE /:id
```

**Step 4: Escrever teste unitário para UsersService.create**

```typescript
// src/modules/users/users.service.spec.ts
describe('UsersService.create', () => {
  it('should hash the password before saving', async () => {
    const prismaMock = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'uuid', name: 'Test', email: 'test@test.com',
          registrationNumber: '12345', passwordHash: 'hashed',
          isActive: true, role: {}, sector: {}, createdAt: new Date(),
        }),
      },
    } as any;

    const service = new UsersService(prismaMock);
    const result = await service.create({
      name: 'Test', email: 'test@test.com', password: 'senha12345',
      registrationNumber: '12345', sectorId: 'uuid1', roleId: 'uuid2',
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: expect.any(String) }),
      }),
    );
    expect(result).not.toHaveProperty('passwordHash');
  });
});
```

**Step 5: Rodar testes e commit**

```bash
npm run test -- users.service --verbose
git add src/modules/users/
git commit -m "feat: add users module with CRUD, bcrypt hashing and soft delete"
```

---

### Task 9: Módulo Sectors (CRUD)

**Files:**
- Create: `src/modules/sectors/` (estrutura igual a roles)

**Step 1: Criar DTO, Service, Controller, Module**

```typescript
// dto/create-sector.dto.ts
export class CreateSectorDto {
  @IsString() name: string;
  @IsString() code: string; // "RH", "JUR", "GAB"
}
```

```typescript
// sectors.service.ts — CRUD padrão com findAll filtrando isActive: true
```

**Step 2: Commit**

```bash
git add src/modules/sectors/
git commit -m "feat: add sectors module"
```

---

### Task 10: Seed Inicial (Dados base)

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json`

**Step 1: Criar `prisma/seed.ts`**

```typescript
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Criar setores
  const sectors = await Promise.all([
    prisma.sector.upsert({ where: { code: 'PROT' }, update: {}, create: { name: 'Protocolo', code: 'PROT' } }),
    prisma.sector.upsert({ where: { code: 'RH' }, update: {}, create: { name: 'Recursos Humanos', code: 'RH' } }),
    prisma.sector.upsert({ where: { code: 'JUR' }, update: {}, create: { name: 'Jurídico', code: 'JUR' } }),
    prisma.sector.upsert({ where: { code: 'GAB' }, update: {}, create: { name: 'Gabinete', code: 'GAB' } }),
    prisma.sector.upsert({ where: { code: 'ADM' }, update: {}, create: { name: 'Setor Administrativo', code: 'ADM' } }),
  ]);

  // Criar role admin
  const adminRole = await prisma.role.upsert({
    where: { slug: 'admin' },
    update: {},
    create: {
      name: 'Administrador do Sistema',
      slug: 'admin',
      isSuperadmin: true,
      permissions: { view: true, edit: true, send: true, receive: true, approve: true, reject: true },
    },
  });

  // Criar roles padrão
  await Promise.all([
    prisma.role.upsert({
      where: { slug: 'protocolo' }, update: {},
      create: { name: 'Protocolo', slug: 'protocolo', permissions: { view: true, edit: true, send: true, receive: true, approve: false, reject: false } },
    }),
    prisma.role.upsert({
      where: { slug: 'servidor' }, update: {},
      create: { name: 'Servidor Solicitante', slug: 'servidor', permissions: { view: true, edit: false, send: false, receive: false, approve: false, reject: false } },
    }),
    prisma.role.upsert({
      where: { slug: 'secretario' }, update: {},
      create: { name: 'Secretário', slug: 'secretario', permissions: { view: true, edit: false, send: true, receive: true, approve: true, reject: true } },
    }),
  ]);

  // Criar usuário admin
  await prisma.user.upsert({
    where: { email: 'admin@semed.prainha.pa.gov.br' },
    update: {},
    create: {
      name: 'Administrador Master',
      email: 'admin@semed.prainha.pa.gov.br',
      passwordHash: await bcrypt.hash('Admin@2026!', 12),
      registrationNumber: '000001',
      sectorId: sectors[0].id, // PROT
      roleId: adminRole.id,
    },
  });

  // Criar tipos de solicitação iniciais
  await Promise.all([
    prisma.requestType.upsert({
      where: { id: 'rt-licenca-premio' },
      update: {},
      create: {
        id: 'rt-licenca-premio',
        name: 'Licença Prêmio',
        slaDays: 30,
        flow: ['PROT', 'RH', 'JUR', 'GAB'],
        createdBy: 'seed',
      },
    }),
    prisma.requestType.upsert({
      where: { id: 'rt-licenca-sem-vencimento' },
      update: {},
      create: {
        id: 'rt-licenca-sem-vencimento',
        name: 'Licença Sem Vencimento',
        slaDays: 15,
        flow: ['PROT', 'RH', 'GAB'],
        createdBy: 'seed',
      },
    }),
    prisma.requestType.upsert({
      where: { id: 'rt-entrega-documentos' },
      update: {},
      create: {
        id: 'rt-entrega-documentos',
        name: 'Entrega de Documentos',
        slaDays: 5,
        flow: ['PROT', 'ADM'],
        createdBy: 'seed',
      },
    }),
    prisma.requestType.upsert({
      where: { id: 'rt-requerimentos' },
      update: {},
      create: {
        id: 'rt-requerimentos',
        name: 'Requerimentos Diversos',
        slaDays: 10,
        flow: ['PROT', 'RH'],
        createdBy: 'seed',
      },
    }),
  ]);

  console.log('Seed concluído com sucesso!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

**Step 2: Adicionar script ao `package.json`**

```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

**Step 3: Rodar o seed**

```bash
npx prisma db seed
```

Esperado: `Seed concluído com sucesso!`

**Step 4: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat: add database seed with initial sectors, roles, admin user and request types"
```

---

## Fase 3 — Núcleo de Protocolos

### Task 11: Módulo Request Types (CRUD + SLA + Fluxo)

**Files:**
- Create: `src/modules/request-types/` (estrutura padrão)

**Step 1: Criar DTO**

```typescript
export class CreateRequestTypeDto {
  @IsString() name: string;
  @IsInt() @Min(1) slaDays: number;
  @IsArray() @IsString({ each: true }) flow: string[]; // ['PROT', 'RH', 'JUR']
}
```

**Step 2: Service valida que cada código no `flow` existe como setor**

```typescript
async create(dto: CreateRequestTypeDto, userId: string) {
  // Validate all sector codes in flow exist
  for (const code of dto.flow) {
    const sector = await this.prisma.sector.findUnique({ where: { code } });
    if (!sector) throw new BadRequestException(`Setor '${code}' não encontrado`);
  }
  return this.prisma.requestType.create({
    data: { ...dto, flow: dto.flow, createdBy: userId },
  });
}
```

**Step 3: Commit**

```bash
git add src/modules/request-types/
git commit -m "feat: add request-types module with SLA and flow validation"
```

---

### Task 12: Serviço de Numeração de Protocolo (Transacional)

**Files:**
- Create: `src/modules/requests/protocol-number.service.ts`
- Create: `src/modules/requests/protocol-number.service.spec.ts`

**Step 1: Criar `src/modules/requests/protocol-number.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProtocolNumberService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(sectorCode: string): Promise<string> {
    const year = new Date().getFullYear();

    const record = await this.prisma.$transaction(async (tx) => {
      return tx.protocolSequence.upsert({
        where: { year_sectorCode: { year, sectorCode } },
        update: { lastSequence: { increment: 1 } },
        create: { year, sectorCode, lastSequence: 1 },
      });
    });

    return `${year}-${sectorCode}-${String(record.lastSequence).padStart(6, '0')}`;
  }
}
```

**Step 2: Escrever teste unitário**

```typescript
// protocol-number.service.spec.ts
describe('ProtocolNumberService', () => {
  it('should generate protocol number in correct format', async () => {
    const prismaMock = {
      $transaction: jest.fn().mockImplementation(async (fn) => {
        return fn({
          protocolSequence: {
            upsert: jest.fn().mockResolvedValue({ year: 2026, sectorCode: 'RH', lastSequence: 123 }),
          },
        });
      }),
    } as any;

    const service = new ProtocolNumberService(prismaMock);
    const result = await service.generate('RH');
    expect(result).toBe('2026-RH-000123');
  });

  it('should pad sequence to 6 digits', async () => {
    const prismaMock = {
      $transaction: jest.fn().mockImplementation(async (fn) =>
        fn({ protocolSequence: { upsert: jest.fn().mockResolvedValue({ year: 2026, sectorCode: 'PROT', lastSequence: 1 }) } })
      ),
    } as any;
    const service = new ProtocolNumberService(prismaMock);
    expect(await service.generate('PROT')).toBe('2026-PROT-000001');
  });
});
```

**Step 3: Rodar testes**

```bash
npm run test -- protocol-number --verbose
```

Esperado: PASS (2 testes)

**Step 4: Commit**

```bash
git add src/modules/requests/protocol-number.service.ts src/modules/requests/protocol-number.service.spec.ts
git commit -m "feat: add transactional protocol number generator (YYYY-SECTOR-XXXXXX)"
```

---

### Task 13: Módulo Requests — Criação e Listagem

**Files:**
- Create: `src/modules/requests/requests.module.ts`
- Create: `src/modules/requests/requests.service.ts`
- Create: `src/modules/requests/requests.controller.ts`
- Create: `src/modules/requests/dto/create-request.dto.ts`
- Create: `src/modules/requests/dto/list-requests.dto.ts`

**Step 1: Criar `src/modules/requests/dto/create-request.dto.ts`**

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRequestDto {
  @ApiProperty()
  @IsUUID()
  requestTypeId: string;

  @ApiProperty({ description: 'Descrição da solicitação' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Matrícula do solicitante (admin pode criar para outro)' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;
}
```

**Step 2: Criar `src/modules/requests/dto/list-requests.dto.ts`**

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
import { RequestStatus } from '@prisma/client';

export class ListRequestsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectorCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filtrar apenas protocolos atrasados' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isOverdue?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number = 20;
}
```

**Step 3: Criar `src/modules/requests/requests.service.ts`**

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProtocolNumberService } from './protocol-number.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { RequestStatus } from '@prisma/client';
import { addDays } from 'date-fns';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly protocolNumber: ProtocolNumberService,
  ) {}

  async create(dto: CreateRequestDto, currentUser: any) {
    const requestType = await this.prisma.requestType.findUnique({
      where: { id: dto.requestTypeId, isActive: true },
    });
    if (!requestType) throw new NotFoundException('Tipo de solicitação não encontrado');

    const flow = requestType.flow as string[];
    if (flow.length === 0) throw new BadRequestException('Tipo de solicitação sem fluxo configurado');

    const firstSectorCode = flow[0];
    const firstSector = await this.prisma.sector.findUnique({ where: { code: firstSectorCode } });
    if (!firstSector) throw new BadRequestException(`Setor inicial '${firstSectorCode}' não encontrado`);

    const protocolNumber = await this.protocolNumber.generate(firstSectorCode);
    const deadlineAt = addDays(new Date(), requestType.slaDays);

    return this.prisma.request.create({
      data: {
        protocolNumber,
        requesterId: currentUser.id,
        sectorOriginId: currentUser.sectorId,
        requestTypeId: dto.requestTypeId,
        description: dto.description,
        currentSectorId: firstSector.id,
        deadlineAt,
        statusHistory: {
          create: {
            newStatus: RequestStatus.PROTOCOLADO,
            changedByUserId: currentUser.id,
          },
        },
      },
      include: {
        requester: { select: { id: true, name: true, registrationNumber: true } },
        requestType: { select: { id: true, name: true, slaDays: true } },
        sectorOrigin: { select: { id: true, name: true, code: true } },
        currentSector: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async findAll(query: ListRequestsDto) {
    const { status, sectorCode, requestTypeId, from, to, isOverdue, page = 1, limit = 20 } = query;
    const now = new Date();

    const where: any = {};
    if (status) where.status = status;
    if (requestTypeId) where.requestTypeId = requestTypeId;
    if (sectorCode) where.currentSector = { code: sectorCode };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (isOverdue) {
      where.deadlineAt = { lt: now };
      where.status = { notIn: [RequestStatus.DEFERIDO, RequestStatus.INDEFERIDO, RequestStatus.CONCLUIDO] };
    }

    const [data, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: { select: { id: true, name: true, registrationNumber: true } },
          requestType: { select: { id: true, name: true } },
          currentSector: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.request.count({ where }),
    ]);

    return {
      data: data.map((r) => ({ ...r, isOverdue: r.deadlineAt < now })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, registrationNumber: true } },
        requestType: true,
        sectorOrigin: true,
        currentSector: true,
        tramitations: {
          include: {
            fromSector: true,
            toSector: true,
            sentBy: { select: { id: true, name: true } },
            receivedBy: { select: { id: true, name: true } },
          },
          orderBy: { sentAt: 'asc' },
        },
        statusHistory: {
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { changedAt: 'asc' },
        },
        attachments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!request) throw new NotFoundException('Protocolo não encontrado');
    return { ...request, isOverdue: request.deadlineAt < new Date() };
  }

  async getTimeline(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      select: {
        protocolNumber: true,
        status: true,
        createdAt: true,
        deadlineAt: true,
        statusHistory: {
          include: { changedBy: { select: { name: true } } },
          orderBy: { changedAt: 'asc' },
        },
        tramitations: {
          include: {
            fromSector: { select: { name: true } },
            toSector: { select: { name: true } },
            sentBy: { select: { name: true } },
            receivedBy: { select: { name: true } },
          },
          orderBy: { sentAt: 'asc' },
        },
      },
    });
    if (!request) throw new NotFoundException('Protocolo não encontrado');
    return request;
  }
}
```

**Step 4: Criar controller com os endpoints**

```typescript
@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @RequirePermission('send')
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: any) {
    return this.requestsService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: ListRequestsDto) {
    return this.requestsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.requestsService.findOne(id);
  }

  @Get(':id/timeline')
  @Public() // Solicitante pode ver sem precisar de conta
  getTimeline(@Param('id') id: string) {
    return this.requestsService.getTimeline(id);
  }
}
```

**Step 5: Instalar date-fns**

```bash
npm install date-fns
```

**Step 6: Commit**

```bash
git add src/modules/requests/
git commit -m "feat: add requests module with protocol creation, listing and timeline"
```

---

### Task 14: Tramitação (Forward, Receive, Status Change)

**Files:**
- Create: `src/modules/tramitations/tramitations.service.ts`
- Create: `src/modules/tramitations/tramitations.controller.ts` (endpoints em /requests/:id/)
- Create: `src/modules/tramitations/dto/forward.dto.ts`
- Create: `src/modules/tramitations/dto/change-status.dto.ts`

**Step 1: Criar DTOs**

```typescript
// forward.dto.ts
export class ForwardDto {
  @IsString()
  @ApiProperty({ description: 'Código do setor destino. Ex: RH, JUR, GAB' })
  toSectorCode: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

// change-status.dto.ts
export class ChangeStatusDto {
  @IsEnum(RequestStatus)
  status: RequestStatus;

  @IsString()
  @IsOptional()
  justification?: string;
}
```

**Step 2: Criar `src/modules/tramitations/tramitations.service.ts`**

```typescript
import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RequestStatus } from '@prisma/client';
import { ForwardDto } from './dto/forward.dto';
import { ChangeStatusDto } from './dto/change-status.dto';

const STATUS_REQUIRES_JUSTIFICATION: RequestStatus[] = [
  RequestStatus.INDEFERIDO,
  RequestStatus.PENDENTE_DOCUMENTO,
];

@Injectable()
export class TramitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async forward(requestId: string, dto: ForwardDto, currentUser: any) {
    const request = await this.getRequestOrThrow(requestId);

    // Only users in current sector can forward (superadmin can bypass)
    if (!currentUser.role.isSuperadmin && currentUser.sectorId !== request.currentSectorId) {
      throw new ForbiddenException('Apenas o setor atual pode encaminhar este protocolo');
    }

    const toSector = await this.prisma.sector.findUnique({ where: { code: dto.toSectorCode } });
    if (!toSector) throw new NotFoundException(`Setor '${dto.toSectorCode}' não encontrado`);

    const flow = request.requestType.flow as string[];
    const currentSectorCode = request.currentSector.code;
    const currentIdx = flow.indexOf(currentSectorCode);
    const expectedNextCode = flow[currentIdx + 1];

    if (!currentUser.role.isSuperadmin && dto.toSectorCode !== expectedNextCode) {
      throw new BadRequestException(
        `O próximo setor no fluxo é '${expectedNextCode}', não '${dto.toSectorCode}'`,
      );
    }

    const [tramitation] = await this.prisma.$transaction([
      this.prisma.requestTramitation.create({
        data: {
          requestId,
          fromSectorId: request.currentSectorId,
          toSectorId: toSector.id,
          sentByUserId: currentUser.id,
          notes: dto.notes,
        },
      }),
      this.prisma.request.update({
        where: { id: requestId },
        data: { currentSectorId: toSector.id },
      }),
    ]);

    // Notify users in the destination sector
    const destUsers = await this.prisma.user.findMany({
      where: { sectorId: toSector.id, isActive: true },
    });
    await Promise.all(
      destUsers.map((u) =>
        this.notifications.create({
          userId: u.id,
          title: 'Novo protocolo recebido',
          body: `Protocolo ${request.protocolNumber} foi encaminhado para ${toSector.name}`,
          type: 'FORWARDED',
          relatedRequestId: requestId,
        }),
      ),
    );

    return tramitation;
  }

  async receive(requestId: string, currentUser: any) {
    const request = await this.getRequestOrThrow(requestId);

    if (!currentUser.role.isSuperadmin && currentUser.sectorId !== request.currentSectorId) {
      throw new ForbiddenException('Apenas o setor atual pode receber este protocolo');
    }

    const pendingTramitation = await this.prisma.requestTramitation.findFirst({
      where: { requestId, toSectorId: request.currentSectorId, receivedAt: null },
      orderBy: { sentAt: 'desc' },
    });

    if (!pendingTramitation) {
      throw new BadRequestException('Não há tramitação pendente de recebimento para este setor');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.requestTramitation.update({
        where: { id: pendingTramitation.id },
        data: { receivedByUserId: currentUser.id, receivedAt: new Date() },
      }),
      this.prisma.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.RECEBIDO_PELO_SETOR },
      }),
      this.prisma.requestStatusHistory.create({
        data: {
          requestId,
          previousStatus: request.status,
          newStatus: RequestStatus.RECEBIDO_PELO_SETOR,
          changedByUserId: currentUser.id,
        },
      }),
    ]);

    return updated;
  }

  async changeStatus(requestId: string, dto: ChangeStatusDto, currentUser: any) {
    const request = await this.getRequestOrThrow(requestId);

    if (STATUS_REQUIRES_JUSTIFICATION.includes(dto.status) && !dto.justification?.trim()) {
      throw new BadRequestException(`Justificativa obrigatória para status '${dto.status}'`);
    }

    await this.prisma.$transaction([
      this.prisma.request.update({
        where: { id: requestId },
        data: { status: dto.status },
      }),
      this.prisma.requestStatusHistory.create({
        data: {
          requestId,
          previousStatus: request.status,
          newStatus: dto.status,
          changedByUserId: currentUser.id,
          justification: dto.justification,
        },
      }),
    ]);

    // Notify requester
    await this.notifications.create({
      userId: request.requesterId,
      title: 'Status do protocolo atualizado',
      body: `Seu protocolo ${request.protocolNumber} agora está: ${dto.status}`,
      type: 'STATUS_CHANGED',
      relatedRequestId: requestId,
    });

    return { message: 'Status atualizado com sucesso', status: dto.status };
  }

  private async getRequestOrThrow(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        requestType: true,
        currentSector: true,
      },
    });
    if (!request) throw new NotFoundException('Protocolo não encontrado');
    return request;
  }
}
```

**Step 3: Escrever testes para changeStatus**

```typescript
describe('TramitationsService.changeStatus', () => {
  it('should throw when status requires justification and none provided', async () => {
    const mockRequest = {
      id: 'req-1', status: 'EM_ANALISE', requesterId: 'user-1',
      protocolNumber: '2026-RH-000001', currentSector: { id: 'sec-1' },
      requestType: { flow: ['PROT', 'RH'] },
    };
    const prismaMock = {
      request: { findUnique: jest.fn().mockResolvedValue(mockRequest) },
      $transaction: jest.fn(),
    } as any;
    const notifMock = { create: jest.fn() } as any;
    const service = new TramitationsService(prismaMock, notifMock);

    await expect(
      service.changeStatus('req-1', { status: 'INDEFERIDO' as any, justification: '' }, {}),
    ).rejects.toThrow('Justificativa obrigatória');
  });
});
```

**Step 4: Commit**

```bash
git add src/modules/tramitations/
git commit -m "feat: add tramitations service with forward, receive, and status change"
```

---

### Task 15: Módulo Attachments (Supabase Storage)

**Files:**
- Create: `src/modules/attachments/attachments.service.ts`
- Create: `src/modules/attachments/attachments.controller.ts`
- Create: `src/supabase/supabase.service.ts`
- Create: `src/supabase/supabase.module.ts`

**Step 1: Criar `src/supabase/supabase.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;
  readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.client = createClient(
      config.get<string>('supabase.url')!,
      config.get<string>('supabase.serviceRoleKey')!,
    );
    this.bucket = config.get<string>('supabase.bucket') ?? 'attachments';
  }

  get storage() {
    return this.client.storage;
  }
}
```

**Step 2: Criar `src/modules/attachments/attachments.service.ts`**

```typescript
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../supabase/supabase.service';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async upload(requestId: string, file: Express.Multer.File, userId: string) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Apenas PDF e JPEG são permitidos');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('Arquivo excede o limite de 5MB');
    }

    const request = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Protocolo não encontrado');

    const ext = file.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
    const storagePath = `${requestId}/${Date.now()}-${file.originalname}.${ext}`;

    const { error } = await this.supabase.storage
      .from(this.supabase.bucket)
      .upload(storagePath, file.buffer, { contentType: file.mimetype });

    if (error) throw new BadRequestException(`Erro no upload: ${error.message}`);

    return this.prisma.attachment.create({
      data: {
        requestId,
        uploadedByUserId: userId,
        filename: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
  }

  async getSignedUrl(attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new NotFoundException('Anexo não encontrado');

    const { data, error } = await this.supabase.storage
      .from(this.supabase.bucket)
      .createSignedUrl(attachment.storagePath, 3600); // 1 hora

    if (error) throw new BadRequestException(`Erro ao gerar URL: ${error.message}`);
    return { url: data.signedUrl, filename: attachment.filename };
  }
}
```

**Step 3: Criar controller com Multer**

```typescript
// attachments.controller.ts
@Post('requests/:id/attachments')
@RequirePermission('send')
@UseInterceptors(FileInterceptor('file'))
@ApiConsumes('multipart/form-data')
upload(
  @Param('id') id: string,
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: any,
) {
  return this.attachmentsService.upload(id, file, user.id);
}

@Get('requests/:id/attachments/:attachmentId')
getSignedUrl(@Param('attachmentId') attachmentId: string) {
  return this.attachmentsService.getSignedUrl(attachmentId);
}
```

**Step 4: Instalar multer**

```bash
npm install multer @nestjs/platform-express
npm install -D @types/multer
```

**Step 5: Commit**

```bash
git add src/modules/attachments/ src/supabase/
git commit -m "feat: add attachments module with Supabase Storage (PDF/JPEG, 5MB limit)"
```

---

## Fase 4 — Observabilidade e Valor

### Task 16: Módulo Notifications

**Files:**
- Create: `src/modules/notifications/notifications.service.ts`
- Create: `src/modules/notifications/notifications.controller.ts`
- Create: `src/modules/notifications/notifications.module.ts`

**Step 1: Criar `src/modules/notifications/notifications.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateNotificationData {
  userId: string;
  title: string;
  body: string;
  type: string;
  relatedRequestId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateNotificationData) {
    return this.prisma.notification.create({ data });
  }

  findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: count };
  }
}
```

**Step 2: Criar controller com endpoints**

```typescript
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  // GET /notifications
  // GET /notifications/unread-count
  // PATCH /notifications/:id/read
  // PATCH /notifications/read-all
}
```

**Step 3: Commit**

```bash
git add src/modules/notifications/
git commit -m "feat: add notifications module with in-system notification system"
```

---

### Task 17: Cron Job de SLA/Atraso

**Files:**
- Create: `src/modules/notifications/sla.scheduler.ts`

**Step 1: Criar `src/modules/notifications/sla.scheduler.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { RequestStatus } from '@prisma/client';

const TERMINAL_STATUSES = [RequestStatus.DEFERIDO, RequestStatus.INDEFERIDO, RequestStatus.CONCLUIDO];

@Injectable()
export class SlaScheduler {
  private readonly logger = new Logger(SlaScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkOverdueRequests() {
    this.logger.log('Verificando protocolos atrasados...');
    const now = new Date();

    const overdueRequests = await this.prisma.request.findMany({
      where: {
        deadlineAt: { lt: now },
        status: { notIn: TERMINAL_STATUSES },
      },
      include: {
        requester: true,
        currentSector: { include: { users: { where: { isActive: true } } } },
      },
    });

    this.logger.log(`Encontrados ${overdueRequests.length} protocolos atrasados`);

    for (const request of overdueRequests) {
      const usersToNotify = [
        request.requester,
        ...request.currentSector.users,
      ];

      await Promise.all(
        usersToNotify.map((user) =>
          this.notifications.create({
            userId: user.id,
            title: '⚠️ Protocolo com prazo vencido',
            body: `O protocolo ${request.protocolNumber} está atrasado. Prazo era: ${request.deadlineAt.toLocaleDateString('pt-BR')}`,
            type: 'OVERDUE',
            relatedRequestId: request.id,
          }),
        ),
      );
    }
  }
}
```

**Step 2: Registrar no NotificationsModule e commit**

```bash
git add src/modules/notifications/sla.scheduler.ts
git commit -m "feat: add daily SLA cron job to notify overdue requests at 8am"
```

---

### Task 18: Módulo Dashboard

**Files:**
- Create: `src/modules/dashboard/dashboard.service.ts`
- Create: `src/modules/dashboard/dashboard.controller.ts`

**Step 1: Criar `src/modules/dashboard/dashboard.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const now = new Date();
    const [total, byStatus, bySector, overdue] = await Promise.all([
      this.prisma.request.count(),
      this.prisma.request.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.request.groupBy({
        by: ['currentSectorId'],
        _count: { id: true },
      }),
      this.prisma.request.count({
        where: {
          deadlineAt: { lt: now },
          status: { notIn: [RequestStatus.DEFERIDO, RequestStatus.INDEFERIDO, RequestStatus.CONCLUIDO] },
        },
      }),
    ]);

    return { total, byStatus, bySector, overdue };
  }

  async byPeriod(from: Date, to: Date, granularity: 'day' | 'week' | 'month' = 'day') {
    const truncMap = { day: 'day', week: 'week', month: 'month' };
    const trunc = truncMap[granularity];

    return this.prisma.$queryRaw`
      SELECT
        DATE_TRUNC(${trunc}, created_at) AS period,
        COUNT(*)::int AS total
      FROM requests
      WHERE created_at BETWEEN ${from} AND ${to}
      GROUP BY period
      ORDER BY period ASC
    `;
  }

  async responseTimeBySector() {
    return this.prisma.$queryRaw`
      SELECT
        s.name AS sector_name,
        s.code AS sector_code,
        AVG(
          EXTRACT(EPOCH FROM (rt.received_at - rt.sent_at)) / 3600
        )::numeric(10,2) AS avg_hours_to_receive,
        COUNT(rt.id)::int AS total_received
      FROM request_tramitations rt
      JOIN sectors s ON s.id = rt.to_sector_id
      WHERE rt.received_at IS NOT NULL
      GROUP BY s.id, s.name, s.code
      ORDER BY avg_hours_to_receive ASC
    `;
  }

  async userActivity(limit = 10) {
    return this.prisma.$queryRaw`
      SELECT
        u.name AS user_name,
        u.email,
        COUNT(al.id)::int AS total_actions
      FROM audit_logs al
      JOIN users u ON u.id = al.actor_user_id
      WHERE al.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY u.id, u.name, u.email
      ORDER BY total_actions DESC
      LIMIT ${limit}
    `;
  }

  async overdue() {
    return this.prisma.request.findMany({
      where: {
        deadlineAt: { lt: new Date() },
        status: { notIn: [RequestStatus.DEFERIDO, RequestStatus.INDEFERIDO, RequestStatus.CONCLUIDO] },
      },
      include: {
        requester: { select: { name: true, registrationNumber: true } },
        currentSector: { select: { name: true, code: true } },
        requestType: { select: { name: true } },
      },
      orderBy: { deadlineAt: 'asc' },
    });
  }
}
```

**Step 2: Controller com todos os endpoints de dashboard**

**Step 3: Commit**

```bash
git add src/modules/dashboard/
git commit -m "feat: add dashboard module with overview, period stats, response time ranking"
```

---

### Task 19: Módulo Relatórios PDF

**Files:**
- Create: `src/modules/reports/reports.service.ts`
- Create: `src/modules/reports/reports.controller.ts`

**Step 1: Criar `src/modules/reports/reports.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PdfPrinter from 'pdfmake';
import { RequestStatus } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateRequestsReport(filters: {
    from?: string;
    to?: string;
    sectorCode?: string;
    requestTypeId?: string;
    status?: RequestStatus;
  }): Promise<Buffer> {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.requestTypeId) where.requestTypeId = filters.requestTypeId;
    if (filters.sectorCode) where.currentSector = { code: filters.sectorCode };
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const requests = await this.prisma.request.findMany({
      where,
      include: {
        requester: { select: { name: true, registrationNumber: true } },
        requestType: { select: { name: true } },
        currentSector: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const fonts = {
      Roboto: {
        normal: 'node_modules/pdfmake/build/vfs_fonts.js',
      },
    };

    const printer = new PdfPrinter(fonts);
    const now = new Date();

    const docDefinition: any = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      content: [
        { text: 'Secretaria Municipal de Educação de Prainha - PA', style: 'header' },
        { text: 'Relatório de Protocolos', style: 'subheader' },
        { text: `Gerado em: ${now.toLocaleString('pt-BR')}`, style: 'meta' },
        { text: `Total de registros: ${requests.length}`, style: 'meta', margin: [0, 0, 0, 16] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Protocolo', bold: true },
                { text: 'Solicitante', bold: true },
                { text: 'Tipo', bold: true },
                { text: 'Status', bold: true },
                { text: 'Setor Atual', bold: true },
                { text: 'Data', bold: true },
              ],
              ...requests.map((r) => [
                r.protocolNumber,
                `${r.requester.name} (${r.requester.registrationNumber})`,
                r.requestType.name,
                r.status.replace(/_/g, ' '),
                r.currentSector.name,
                r.createdAt.toLocaleDateString('pt-BR'),
              ]),
            ],
          },
        },
      ],
      styles: {
        header: { fontSize: 14, bold: true, alignment: 'center' },
        subheader: { fontSize: 12, alignment: 'center', margin: [0, 4, 0, 4] },
        meta: { fontSize: 9, color: '#666', alignment: 'center' },
      },
    };

    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }
}
```

**Step 2: Criar controller que retorna o PDF como stream**

```typescript
@Get('reports/requests')
@Header('Content-Type', 'application/pdf')
@Header('Content-Disposition', 'attachment; filename="protocolos.pdf"')
async generatePdf(@Query() query: any, @Res() res: Response) {
  const buffer = await this.reportsService.generateRequestsReport(query);
  res.send(buffer);
}
```

**Step 3: Commit**

```bash
git add src/modules/reports/
git commit -m "feat: add PDF report generation with filters for period, sector, type and status"
```

---

### Task 20: Módulo Audit Logs

**Files:**
- Create: `src/modules/audit-logs/audit-logs.service.ts`
- Create: `src/modules/audit-logs/audit-logs.controller.ts`

**Step 1: Service com query filtrada (READONLY)**

```typescript
@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: {
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { entityType, entityId, actorUserId, from, to, page = 1, limit = 50 } = filters;
    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (actorUserId) where.actorUserId = actorUserId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
```

**Step 2: Commit**

```bash
git add src/modules/audit-logs/
git commit -m "feat: add audit-logs module with read-only access to juridical log"
```

---

### Task 21: Verificação Final e Smoke Test

**Step 1: Rodar todos os testes unitários**

```bash
npm run test
```

Esperado: Todos os testes PASS

**Step 2: Rodar testes e2e**

```bash
npm run test:e2e
```

**Step 3: Verificar a API no Swagger**

```bash
npm run start:dev
# Acesse http://localhost:3000/api
```

Verificar:
- `POST /auth/login` com `admin@semed.prainha.pa.gov.br` / `Admin@2026!` → retorna access_token
- `GET /auth/me` com o token → retorna dados do admin
- `GET /sectors` → retorna 5 setores
- `GET /request-types` → retorna 4 tipos
- `POST /requests` → cria protocolo com número no formato `2026-PROT-000001`
- `GET /requests/:id/timeline` → retorna timeline (endpoint público)
- `GET /dashboard/overview` → retorna totais

**Step 4: Verificar no Supabase**

- Acessar Supabase → Table Editor → verificar tabelas criadas
- Verificar `audit_logs` com os registros das ações realizadas

**Step 5: Commit final**

```bash
git add .
git commit -m "feat: complete protocol and tramitation system backend API v1.0"
```

---

## Referência Rápida

| Endpoint | Módulo | Permissão |
|---|---|---|
| POST /auth/login | auth | public |
| GET /requests | requests | view |
| POST /requests | requests | send |
| POST /requests/:id/forward | tramitations | send |
| POST /requests/:id/receive | tramitations | receive |
| PATCH /requests/:id/status | tramitations | edit |
| GET /dashboard/overview | dashboard | view |
| GET /reports/requests | reports | view |
| GET /audit-logs | audit-logs | admin |

## Credenciais do Seed

- **Admin:** `admin@semed.prainha.pa.gov.br` / `Admin@2026!`
