# Sistema de Protocolo e Tramitacao — Documentacao Completa

> **Secretaria Municipal de Educacao de Prainha - PA (SEMED)**
> Backend API para gestao de protocolos e tramitacao de documentos

---

## Sumario

1. [Visao Geral](#1-visao-geral)
2. [Perfis de Acesso (RBAC)](#2-perfis-de-acesso-rbac)
3. [Fluxo de Vida de um Protocolo](#3-fluxo-de-vida-de-um-protocolo)
4. [Status Possiveis](#4-status-possiveis)
5. [SLA e Alertas de Atraso](#5-sla-e-alertas-de-atraso)
6. [Notificacoes](#6-notificacoes)
7. [Auditoria](#7-auditoria)
8. [Stack Tecnica](#8-stack-tecnica)
9. [Arquitetura de Modulos](#9-arquitetura-de-modulos)
10. [Como Rodar o Projeto](#10-como-rodar-o-projeto)
11. [Autenticacao (JWT)](#11-autenticacao-jwt)
12. [Referencia Completa da API](#12-referencia-completa-da-api)
13. [Schema do Banco de Dados](#13-schema-do-banco-de-dados)
14. [Motor de Tramitacao — Regras de Negocio](#14-motor-de-tramitacao--regras-de-negocio)
15. [Testes](#15-testes)
16. [Decisoes Tecnicas](#16-decisoes-tecnicas)

---

## 1. Visao Geral

### O que e o sistema

O **Sistema de Protocolo e Tramitacao** e uma API REST desenvolvida em NestJS para a Secretaria Municipal de Educacao de Prainha, Para (SEMED Prainha). Ele digitaliza e automatiza todo o ciclo de vida de documentos protocolados, desde a abertura ate a conclusao, passando pela tramitacao entre setores.

### Qual problema resolve

Antes deste sistema, os protocolos da SEMED eram controlados em planilhas ou papel, o que causava:

- **Perda de documentos** durante a tramitacao entre setores
- **Falta de rastreabilidade**: ninguem sabia onde estava um protocolo
- **Prazos estourados** sem nenhum alerta
- **Impossibilidade de gerar relatorios** confiáveis
- **Ausencia de auditoria**: nao havia registro de quem fez o que e quando

O sistema resolve todos esses problemas oferecendo:

- **Numero de protocolo unico** gerado automaticamente (ex: `2026-PROT-000001`)
- **Fluxo de tramitacao definido** por tipo de solicitacao
- **Controle de SLA** com alertas automaticos de atraso
- **Rastreabilidade completa** com timeline publica
- **Auditoria append-only** de todas as acoes
- **Relatorios em PDF** com filtros
- **Dashboard** com indicadores de gestao

### Publico-alvo

- **Servidores da SEMED Prainha**: abrem protocolos e acompanham o andamento
- **Setor de Protocolo**: registra e encaminha documentos
- **Setores internos (RH, Juridico, Gabinete, Administrativo)**: recebem, analisam e decidem
- **Secretario(a) de Educacao**: aprova/indefere e visualiza dashboard
- **Equipe de TI**: administra usuarios, setores e configuracoes

---

## 2. Perfis de Acesso (RBAC)

O sistema utiliza controle de acesso baseado em perfis (Role-Based Access Control). Cada usuario possui exatamente um perfil, e cada perfil define um conjunto de permissoes armazenadas em JSON.

### Tabela de Permissoes

| Perfil | Slug | Criar Protocolo | Encaminhar | Receber | Alterar Status | Aprovar/Indeferir | Gerenciar Usuarios |
|---|---|---|---|---|---|---|---|
| **Administrador** | `admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Protocolo** | `protocolo` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Secretario** | `secretario` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Servidor** | `servidor` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Estrutura do JSON de permissoes

```json
{
  "view": true,
  "edit": true,
  "send": true,
  "receive": true,
  "approve": true,
  "reject": true
}
```

### Mapeamento de permissoes para acoes

| Permissao | Acoes permitidas |
|---|---|
| `view` | Visualizar protocolos, dashboard, notificacoes |
| `edit` | Criar/editar usuarios, setores, tipos de solicitacao, alterar status |
| `send` | Criar protocolos, encaminhar, fazer upload de anexos |
| `receive` | Confirmar recebimento de protocolo no setor |
| `approve` | Deferir solicitacoes |
| `reject` | Indeferir solicitacoes |

### Superadmin

O perfil **Administrador** possui a flag `isSuperadmin: true`, que concede poderes especiais:

- **Pular a validacao de fluxo**: pode encaminhar para qualquer setor, mesmo fora da ordem definida
- **Ignorar restricao de setor**: pode encaminhar/receber protocolos mesmo sem pertencer ao setor atual
- **Acesso total**: todas as rotas protegidas

---

## 3. Fluxo de Vida de um Protocolo

### Diagrama do Fluxo

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│  1. CRIACAO  │────>│ 2. ENCAMINHA │────>│ 3. RECEBIMENTO      │
│ PROTOCOLADO  │     │   MENTO      │     │ RECEBIDO_PELO_SETOR │
└─────────────┘     └──────────────┘     └──────────┬──────────┘
                                                     │
                                                     v
                                          ┌─────────────────┐
                                          │  4. ANALISE      │
                                          │  EM_ANALISE      │
                                          └────────┬────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    v              v              v
                            ┌────────────┐ ┌─────────────┐ ┌──────────────────┐
                            │ DEFERIDO   │ │ INDEFERIDO  │ │ PENDENTE_DOCUMENTO│
                            └─────┬──────┘ └─────────────┘ └──────────────────┘
                                  v
                          ┌─────────────┐
                          │ CONCLUIDO   │
                          └─────────────┘
```

### Descricao detalhada de cada etapa

#### Etapa 1 — Criacao (PROTOCOLADO)

Um usuario com permissao `send` cria um novo protocolo informando:
- O **tipo de solicitacao** (ex: "Licenca Premio")
- A **descricao** do pedido

O sistema automaticamente:
1. Gera um **numero de protocolo unico** no formato `YYYY-CODE-NNNNNN` (ex: `2026-PROT-000001`)
2. Define o **setor atual** como o primeiro setor do fluxo (geralmente "Protocolo")
3. Calcula o **prazo (deadline)** somando `slaDays` a data de criacao
4. Registra o status inicial `PROTOCOLADO` no historico

#### Etapa 2 — Encaminhamento

Um usuario do setor atual (ou superadmin) encaminha o protocolo para o proximo setor definido no fluxo.

Exemplo de fluxo para "Licenca Premio": `PROT -> RH -> GAB`
- Setor Protocolo encaminha para RH
- Usuarios do RH recebem notificacao `FORWARDED`

#### Etapa 3 — Recebimento (RECEBIDO_PELO_SETOR)

Um usuario do setor destino confirma o recebimento. O sistema:
- Registra quem recebeu e quando
- Atualiza o status para `RECEBIDO_PELO_SETOR`

#### Etapa 4 — Analise (EM_ANALISE)

O setor que recebeu altera o status para `EM_ANALISE`, indicando que o documento esta sendo avaliado.

#### Etapa 5 — Decisao

Apos a analise, o protocolo pode ser:
- **DEFERIDO**: solicitacao aprovada (requer permissao `approve`)
- **INDEFERIDO**: solicitacao negada (requer permissao `reject` + justificativa obrigatoria)
- **PENDENTE_DOCUMENTO**: faltam documentos (justificativa obrigatoria)

A cada mudanca de status, o solicitante recebe uma notificacao `STATUS_CHANGED`.

#### Etapa 6 — Conclusao (CONCLUIDO)

Apos deferimento, o protocolo pode ser marcado como `CONCLUIDO`, finalizando o ciclo.

### Exemplo real: Licenca Premio

1. Maria (servidora) pede a Jose (setor Protocolo) para abrir um protocolo de Licenca Premio
2. Jose cria o protocolo → `2026-PROT-000001` (status: PROTOCOLADO)
3. Jose encaminha para o setor RH
4. Ana (RH) confirma recebimento → status: RECEBIDO_PELO_SETOR
5. Ana altera para EM_ANALISE
6. Ana verifica que falta um documento → status: PENDENTE_DOCUMENTO (justificativa: "Falta certidao de tempo de servico")
7. Maria entrega o documento, Ana altera para EM_ANALISE novamente
8. Ana encaminha para o Gabinete (proximo no fluxo)
9. O Secretario recebe, analisa e defere → status: DEFERIDO
10. Protocolo e marcado como CONCLUIDO

---

## 4. Status Possiveis

| Status | Descricao | Quem pode alterar | Justificativa obrigatoria? |
|---|---|---|---|
| `PROTOCOLADO` | Protocolo acabou de ser criado | Sistema (automatico na criacao) | Nao |
| `RECEBIDO_PELO_SETOR` | Setor destino confirmou recebimento | Sistema (automatico ao receber) | Nao |
| `EM_ANALISE` | Documento esta sendo avaliado pelo setor | Usuarios com permissao `edit` | Nao |
| `PENDENTE_DOCUMENTO` | Faltam documentos para dar andamento | Usuarios com permissao `edit` | **Sim** |
| `DEFERIDO` | Solicitacao foi aprovada | Usuarios com permissao `approve` | Nao |
| `INDEFERIDO` | Solicitacao foi negada | Usuarios com permissao `reject` | **Sim** |
| `CONCLUIDO` | Protocolo finalizado | Usuarios com permissao `edit` | Nao |

### Status terminais

Os status `DEFERIDO`, `INDEFERIDO` e `CONCLUIDO` sao considerados **terminais**. Protocolos nestes status:
- Nao geram alertas de atraso
- Nao aparecem na listagem de protocolos atrasados
- Nao sao verificados pelo cron job de SLA

---

## 5. SLA e Alertas de Atraso

### Como o prazo e calculado

Ao criar um protocolo, o sistema calcula:

```
deadlineAt = dataAtual + requestType.slaDays dias
```

Exemplos com os tipos de solicitacao padroes:

| Tipo de Solicitacao | SLA (dias) | Fluxo |
|---|---|---|
| Licenca Premio | 30 | PROT → RH → GAB |
| Licenca Sem Vencimento | 45 | PROT → RH → JUR → GAB |
| Entrega de Documentos | 5 | PROT → ADM |
| Requerimentos Diversos | 15 | PROT → RH |

### Cron job diario

O sistema executa um **job agendado** todos os dias as **8h da manha** (`EVERY_DAY_AT_8AM`) que:

1. Busca todos os protocolos com `deadlineAt < agora` e status **nao terminal**
2. Para cada protocolo atrasado, envia notificacao do tipo `OVERDUE` para:
   - O **solicitante** (quem abriu o protocolo)
   - Todos os **usuarios ativos do setor atual** (onde o protocolo esta parado)
3. Deduplica notificacoes caso o solicitante pertenca ao setor atual

### Protecao contra execucao duplicada

O scheduler possui uma flag `isRunning` que impede execucoes concorrentes. Se o job anterior ainda estiver rodando quando o proximo disparo ocorrer, ele sera ignorado.

### Flag `isOverdue` nas listagens

Ao listar protocolos (`GET /requests`), cada item retornado inclui um campo calculado:

```json
{
  "isOverdue": true,
  "deadlineAt": "2026-03-15T00:00:00.000Z"
}
```

Isso permite que o frontend destaque visualmente os protocolos atrasados.

### Filtro de atrasados

Use o query parameter `isOverdue=true` na listagem para filtrar apenas protocolos atrasados:

```
GET /requests?isOverdue=true
```

---

## 6. Notificacoes

### Tipos de notificacao

| Tipo | Quando e disparada | Destinatarios |
|---|---|---|
| `FORWARDED` | Protocolo e encaminhado para outro setor | Todos os usuarios ativos do setor destino |
| `STATUS_CHANGED` | Status do protocolo muda | O solicitante (quem abriu o protocolo) |
| `OVERDUE` | Protocolo ultrapassa o prazo de SLA | Solicitante + usuarios do setor atual |

### Comportamento fire-and-forget

As notificacoes sao criadas de forma **assincrona e nao-bloqueante** (fire-and-forget). Isso significa que:
- A operacao principal (encaminhar, alterar status) **nunca falha** por causa de notificacao
- Erros na criacao de notificacoes sao silenciosamente ignorados
- O usuario recebe resposta rapida da API

### Endpoints de notificacao

- `GET /notifications` — Lista as ultimas 50 notificacoes do usuario (nao lidas primeiro)
- `GET /notifications/unread-count` — Retorna contagem de nao lidas
- `PATCH /notifications/:id/read` — Marca uma notificacao como lida
- `PATCH /notifications/read-all` — Marca todas como lidas

### Estrutura de uma notificacao

```json
{
  "id": "uuid-da-notificacao",
  "userId": "uuid-do-usuario",
  "title": "Novo protocolo recebido",
  "body": "Protocolo 2026-PROT-000001 foi encaminhado para Recursos Humanos",
  "type": "FORWARDED",
  "relatedRequestId": "uuid-do-protocolo",
  "isRead": false,
  "createdAt": "2026-03-19T14:30:00.000Z"
}
```

---

## 7. Auditoria

O sistema implementa um mecanismo robusto de auditoria que registra **todas as acoes** realizadas na plataforma.

### O que e registrado

#### Eventos de autenticacao (manuais no AuthService)

| Acao | Quando |
|---|---|
| `LOGIN_SUCCESS` | Login bem-sucedido |
| `LOGIN_FAILURE` | Tentativa de login com credenciais invalidas |
| `LOGOUT` | Logout do usuario |
| `TOKEN_REFRESH` | Renovacao de access token |

#### Operacoes de escrita (automaticas via AuditInterceptor)

O `AuditInterceptor` e um interceptor global que captura automaticamente **todas** as requisicoes `POST`, `PATCH`, `PUT` e `DELETE`. Para cada operacao:

- Busca o estado **anterior** da entidade (`payloadBefore`) antes da mutacao
- Registra o corpo da requisicao como estado **posterior** (`payloadAfter`)
- Formato da acao: `METODO:URL` (ex: `POST:/requests`, `PATCH:/users/uuid-aqui`)

Entidades rastreadas para `payloadBefore`:

| Rota | Model Prisma |
|---|---|
| `/requests/*` | `request` |
| `/users/*` | `user` |
| `/roles/*` | `role` |
| `/sectors/*` | `sector` |
| `/request-types/*` | `requestType` |

#### Eventos de dashboard e relatorios (manuais)

| Acao | Quando |
|---|---|
| `VIEW_DASHBOARD_OVERVIEW` | Acesso ao dashboard geral |
| `VIEW_DASHBOARD_BY_PERIOD` | Consulta por periodo |
| `VIEW_DASHBOARD_RESPONSE_TIME` | Consulta de tempo de resposta |
| `VIEW_DASHBOARD_USER_ACTIVITY` | Consulta de atividade de usuarios |
| `VIEW_DASHBOARD_OVERDUE` | Consulta de protocolos atrasados |
| `EXPORT_PDF` | Geracao de relatorio PDF |
| `VIEW_AUDIT_LOGS` | Consulta aos logs de auditoria |

### Dados capturados em cada registro

```json
{
  "id": "uuid",
  "action": "POST:/requests",
  "entityType": "requests",
  "entityId": "uuid-do-protocolo",
  "actorUserId": "uuid-do-usuario",
  "payloadBefore": null,
  "payloadAfter": {
    "requestTypeId": "uuid",
    "description": "Solicito licenca premio"
  },
  "ipAddress": "::1",
  "userAgent": "Mozilla/5.0 ...",
  "createdAt": "2026-03-19T14:30:00.000Z"
}
```

### Append-only (somente insercao)

A tabela `audit_logs` e **somente-insercao**:
- **Nao existe endpoint de DELETE** para logs de auditoria
- **Nao existe endpoint de UPDATE** para logs de auditoria
- Os registros sao imutaveis apos criacao
- Isso garante integridade para fins de compliance e auditoria

### actorUserId nao e FK

O campo `actorUserId` **intencionalmente nao possui chave estrangeira** para a tabela `users`. Isso preserva a integridade dos logs mesmo quando um usuario e excluido ou desativado. O registro de auditoria permanece intacto.

---

## 8. Stack Tecnica

| Componente | Tecnologia | Versao |
|---|---|---|
| Framework | NestJS | 11.x |
| ORM | Prisma | 7.x (com adapter-pg) |
| Banco de dados | PostgreSQL (Supabase) | — |
| Autenticacao | JWT (@nestjs/jwt) | 11.x |
| Hash de senhas | bcrypt | 6.x |
| Armazenamento de arquivos | Supabase Storage | — |
| Geracao de PDF | pdfmake | 0.3.x |
| Agendamento de tarefas | @nestjs/schedule | 6.x |
| Rate limiting | @nestjs/throttler | 6.x |
| Validacao | class-validator + class-transformer | — |
| Documentacao API | @nestjs/swagger (Swagger/OpenAPI) | 11.x |
| Seguranca HTTP | helmet | 8.x |
| Manipulacao de datas | date-fns | 4.x |
| Driver PostgreSQL | pg | 8.x |
| Linguagem | TypeScript (strict mode) | 5.9.x |
| Runtime | Node.js | >= 20.0.0 |
| Testes | Jest + Supertest | Jest 30.x |

---

## 9. Arquitetura de Modulos

### Arvore de diretorios

```
src/
├── app.module.ts                    # Modulo raiz
├── app.controller.ts                # Health check (GET /)
├── main.ts                          # Bootstrap da aplicacao
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts   # @CurrentUser() - extrai usuario do JWT
│   │   ├── public.decorator.ts         # @Public() - marca rota como publica
│   │   └── require-permission.decorator.ts  # @RequirePermission('send')
│   ├── guards/
│   │   ├── jwt-auth.guard.ts           # Guard global de JWT
│   │   └── permission.guard.ts         # Guard de permissoes por rota
│   ├── interceptors/
│   │   └── audit.interceptor.ts        # Interceptor global de auditoria
│   └── strategies/
│       └── jwt.strategy.ts             # Estrategia Passport JWT
├── config/                             # Configuracao do app (env vars)
├── prisma/
│   └── prisma.service.ts              # Prisma client como servico NestJS
└── modules/
    ├── auth/                          # Login, refresh, logout, me
    ├── roles/                         # CRUD de perfis de acesso
    ├── users/                         # CRUD de usuarios
    ├── sectors/                       # CRUD de setores
    ├── request-types/                 # CRUD de tipos de solicitacao
    ├── requests/                      # Criacao, listagem, detalhes de protocolos
    ├── tramitations/                  # Encaminhar, receber, alterar status
    ├── attachments/                   # Upload e download de anexos
    ├── notifications/                 # Notificacoes + SLA scheduler
    ├── dashboard/                     # Indicadores e metricas
    ├── reports/                       # Geracao de relatorios PDF
    └── audit-logs/                    # Consulta de logs de auditoria
```

### Descricao de cada modulo

| Modulo | Responsabilidade |
|---|---|
| **auth** | Autenticacao JWT com access/refresh token, rate limiting no login |
| **roles** | Gerenciamento de perfis de acesso e suas permissoes |
| **users** | Cadastro, edicao e desativacao de usuarios (soft delete) |
| **sectors** | Cadastro e gerenciamento dos setores da SEMED |
| **request-types** | Definicao de tipos de solicitacao com SLA e fluxo de tramitacao |
| **requests** | Abertura de protocolos, listagem com filtros/paginacao, timeline publica |
| **tramitations** | Motor de tramitacao: encaminhar, receber, alterar status |
| **attachments** | Upload de arquivos para Supabase Storage, URLs assinadas |
| **notifications** | Notificacoes in-app + cron job de verificacao de SLA |
| **dashboard** | Metricas: totais por status, por periodo, tempo de resposta, atrasados |
| **reports** | Geracao de relatorio PDF de protocolos com filtros |
| **audit-logs** | Consulta somente-leitura dos logs de auditoria |

---

## 10. Como Rodar o Projeto

### Pre-requisitos

- **Node.js** >= 20.0.0
- **npm** (incluso com Node.js)
- **Conta Supabase** (para banco PostgreSQL e Storage)

### Instalacao

```bash
# 1. Clonar o repositorio
git clone https://github.com/seu-usuario/gestao-protocolo.git
cd gestao-protocolo

# 2. Instalar dependencias
npm install

# 3. Copiar arquivo de variaveis de ambiente
cp .env.example .env

# 4. Configurar as variaveis no .env (ver secao abaixo)

# 5. Executar migracoes do banco de dados
npx prisma migrate deploy

# 6. Executar seed (dados iniciais)
npx prisma db seed

# 7. Iniciar servidor em modo desenvolvimento
npm run start:dev
```

O servidor iniciara em `http://localhost:3000`.

### Dados do seed

O seed cria os seguintes dados iniciais:

**Setores (5):**
| Nome | Codigo |
|---|---|
| Protocolo | PROT |
| Recursos Humanos | RH |
| Juridico | JUR |
| Gabinete | GAB |
| Administrativo | ADM |

**Perfis (4):**
| Nome | Slug | Superadmin |
|---|---|---|
| Administrador | admin | Sim |
| Protocolo | protocolo | Nao |
| Secretario | secretario | Nao |
| Servidor | servidor | Nao |

**Usuario admin:**
| Campo | Valor |
|---|---|
| Nome | Administrador do Sistema |
| Email | admin@semed.prainha.pa.gov.br |
| Senha | Admin@2026! |
| Matricula | 000001 |
| Setor | Protocolo |
| Perfil | Administrador |

> **SEGURANCA**: Altere a senha do admin imediatamente apos o primeiro login!

**Tipos de solicitacao (4):**
| Nome | SLA | Fluxo |
|---|---|---|
| Licenca Premio | 30 dias | PROT → RH → GAB |
| Licenca Sem Vencimento | 45 dias | PROT → RH → JUR → GAB |
| Entrega de Documentos | 5 dias | PROT → ADM |
| Requerimentos Diversos | 15 dias | PROT → RH |

### Variaveis de Ambiente

| Variavel | Descricao | Exemplo |
|---|---|---|
| `DATABASE_URL` | URL de conexao PostgreSQL (com pgbouncer) | `postgresql://USER:PASS@HOST:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | URL direta do PostgreSQL (para migracoes) | `postgresql://USER:PASS@HOST:5432/postgres` |
| `JWT_ACCESS_SECRET` | Segredo para assinar access tokens | `minha-chave-secreta-256bits` |
| `JWT_REFRESH_SECRET` | Segredo para assinar refresh tokens | `outra-chave-secreta-256bits` |
| `JWT_ACCESS_EXPIRES_IN` | Tempo de expiracao do access token | `8h` |
| `JWT_REFRESH_EXPIRES_IN` | Tempo de expiracao do refresh token | `7d` |
| `SUPABASE_URL` | URL do projeto Supabase | `https://abc123.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de servico do Supabase | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_STORAGE_BUCKET` | Nome do bucket para anexos | `attachments` |
| `PORT` | Porta do servidor | `3000` |
| `NODE_ENV` | Ambiente de execucao | `development` ou `production` |
| `CORS_ORIGIN` | Origem permitida para CORS | `http://localhost:5173` |

### Scripts disponiveis

| Comando | Descricao |
|---|---|
| `npm run start:dev` | Inicia servidor em modo dev (hot reload) |
| `npm run start:debug` | Inicia servidor em modo debug |
| `npm run build` | Compila para producao |
| `npm run start:prod` | Inicia servidor compilado |
| `npm run lint` | Executa ESLint com fix |
| `npm run format` | Formata codigo com Prettier |
| `npm run test` | Executa testes unitarios |
| `npm run test:e2e` | Executa testes end-to-end |
| `npm run test:cov` | Executa testes com cobertura |

---

## 11. Autenticacao (JWT)

### Fluxo de autenticacao

1. **Login**: O usuario envia email/senha para `POST /auth/login`
2. O servidor retorna um `access_token` no body e seta um `refresh_token` como cookie httpOnly
3. O cliente envia o `access_token` no header `Authorization: Bearer <token>` em todas as requisicoes
4. Quando o `access_token` expira (8h), o cliente chama `POST /auth/refresh` (o cookie e enviado automaticamente)
5. O servidor rotaciona o refresh token (revoga o antigo, cria um novo)
6. Para sair, o cliente chama `POST /auth/logout`

### Configuracao de tokens

| Token | Duracao | Armazenamento |
|---|---|---|
| Access Token | 8 horas | Body da resposta → cliente guarda em memoria |
| Refresh Token | 7 dias | Cookie httpOnly, secure, sameSite: strict |

### Seguranca de senhas

- **Algoritmo**: bcrypt
- **Cost factor**: 12 rounds
- **Senha minima**: 8 caracteres (para criacao de usuario), 6 caracteres (para login)

### Rate limiting no login

- **Limite**: 5 tentativas a cada 15 minutos por IP
- Protege contra ataques de forca bruta
- Configurado via `@nestjs/throttler`

### Guard global

Todas as rotas sao protegidas por padrao pelo `JwtAuthGuard`. Para tornar uma rota publica, use o decorator `@Public()`.

Rotas publicas no sistema:
- `POST /auth/login` — Login
- `POST /auth/refresh` — Renovacao de token
- `GET /requests/:id/timeline` — Timeline publica do protocolo

---

## 12. Referencia Completa da API

> **Base URL**: `http://localhost:3000` (desenvolvimento)

> **Autenticacao**: Todas as rotas requerem `Authorization: Bearer <access_token>` exceto as marcadas como `@Public`.

### 12.1 Autenticacao (`/auth`)

---

#### `POST /auth/login`

Realiza login e retorna tokens de acesso.

- **Permissao**: Publica (`@Public`)
- **Rate limit**: 5 tentativas / 15 min

**Request Body:**

```json
{
  "email": "admin@semed.prainha.pa.gov.br",
  "password": "Admin@2026!"
}
```

| Campo | Tipo | Obrigatorio | Validacao |
|---|---|---|---|
| `email` | string | Sim | Email valido |
| `password` | string | Sim | Minimo 6 caracteres |

**Response 200:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Administrador do Sistema",
    "email": "admin@semed.prainha.pa.gov.br",
    "registrationNumber": "000001",
    "sectorId": "s1-uuid",
    "roleId": "r1-uuid",
    "isActive": true,
    "createdAt": "2026-03-01T00:00:00.000Z",
    "updatedAt": "2026-03-01T00:00:00.000Z",
    "role": {
      "id": "r1-uuid",
      "name": "Administrador",
      "slug": "admin",
      "permissions": { "view": true, "edit": true, "send": true, "receive": true, "approve": true, "reject": true },
      "isSuperadmin": true
    },
    "sector": {
      "id": "s1-uuid",
      "name": "Protocolo",
      "code": "PROT",
      "isActive": true
    }
  }
}
```

> **Cookie setado**: `refresh_token` (httpOnly, secure em producao, sameSite: strict, max-age: 7 dias)

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 401 | Credenciais invalidas (email nao encontrado, usuario inativo ou senha incorreta) |
| 429 | Rate limit excedido (mais de 5 tentativas em 15 min) |

---

#### `POST /auth/refresh`

Renova o access token usando o refresh token do cookie.

- **Permissao**: Publica (`@Public`)

**Request Body:** Nenhum (o refresh token e lido do cookie `refresh_token`)

**Response 200:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

> O refresh token anterior e revogado e um novo cookie e setado.

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 400 | Refresh token nao fornecido (cookie ausente) |
| 401 | Refresh token invalido, expirado ou ja revogado |

---

#### `POST /auth/logout`

Revoga o refresh token e limpa o cookie.

- **Permissao**: Autenticado (Bearer token)

**Request Body:** Nenhum

**Response 200:**

```json
{
  "message": "Logout realizado com sucesso"
}
```

---

#### `GET /auth/me`

Retorna dados do usuario autenticado (sem passwordHash).

- **Permissao**: Autenticado (Bearer token)

**Response 200:**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Administrador do Sistema",
  "email": "admin@semed.prainha.pa.gov.br",
  "registrationNumber": "000001",
  "sectorId": "s1-uuid",
  "roleId": "r1-uuid",
  "isActive": true,
  "createdAt": "2026-03-01T00:00:00.000Z",
  "updatedAt": "2026-03-01T00:00:00.000Z"
}
```

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 401 | Token invalido ou expirado |

---

### 12.2 Perfis (`/roles`)

---

#### `POST /roles`

Cria um novo perfil de acesso.

- **Permissao**: `edit`

**Request Body:**

```json
{
  "name": "Coordenacao Pedagogica",
  "slug": "coord-pedagogica",
  "permissions": {
    "view": true,
    "edit": true,
    "send": true,
    "receive": true,
    "approve": false,
    "reject": false
  },
  "isSuperadmin": false
}
```

| Campo | Tipo | Obrigatorio | Descricao |
|---|---|---|---|
| `name` | string | Sim | Nome do perfil |
| `slug` | string | Sim | Identificador unico (slug) |
| `permissions` | object | Sim | Objeto com 6 permissoes booleanas |
| `isSuperadmin` | boolean | Nao | Padrao: `false` |

**Response 201:**

```json
{
  "id": "uuid-do-perfil",
  "name": "Coordenacao Pedagogica",
  "slug": "coord-pedagogica",
  "permissions": { "view": true, "edit": true, "send": true, "receive": true, "approve": false, "reject": false },
  "isSuperadmin": false
}
```

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 400 | Dados invalidos ou slug ja existente |
| 401 | Nao autenticado |
| 403 | Sem permissao `edit` |

---

#### `GET /roles`

Lista todos os perfis de acesso.

- **Permissao**: Autenticado

**Response 200:**

```json
[
  {
    "id": "uuid-admin",
    "name": "Administrador",
    "slug": "admin",
    "permissions": { "view": true, "edit": true, "send": true, "receive": true, "approve": true, "reject": true },
    "isSuperadmin": true
  },
  {
    "id": "uuid-protocolo",
    "name": "Protocolo",
    "slug": "protocolo",
    "permissions": { "view": true, "edit": true, "send": true, "receive": true, "approve": false, "reject": false },
    "isSuperadmin": false
  }
]
```

---

#### `GET /roles/:id`

Busca um perfil por ID.

- **Permissao**: Autenticado

**Response 200:**

```json
{
  "id": "uuid-admin",
  "name": "Administrador",
  "slug": "admin",
  "permissions": { "view": true, "edit": true, "send": true, "receive": true, "approve": true, "reject": true },
  "isSuperadmin": true
}
```

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 404 | Perfil nao encontrado |

---

#### `PATCH /roles/:id`

Atualiza um perfil existente.

- **Permissao**: `edit`

**Request Body:** Mesmo formato de `POST /roles` (todos os campos obrigatorios).

**Response 200:** Objeto do perfil atualizado.

---

### 12.3 Usuarios (`/users`)

---

#### `GET /users`

Lista todos os usuarios ativos.

- **Permissao**: Autenticado

**Response 200:**

```json
[
  {
    "id": "uuid-do-usuario",
    "name": "Administrador do Sistema",
    "email": "admin@semed.prainha.pa.gov.br",
    "registrationNumber": "000001",
    "sectorId": "uuid-setor-prot",
    "roleId": "uuid-role-admin",
    "isActive": true,
    "createdAt": "2026-03-01T00:00:00.000Z",
    "updatedAt": "2026-03-01T00:00:00.000Z",
    "sector": { "id": "uuid", "name": "Protocolo", "code": "PROT" },
    "role": { "id": "uuid", "name": "Administrador", "slug": "admin" }
  }
]
```

---

#### `POST /users`

Cria um novo usuario.

- **Permissao**: `edit`

**Request Body:**

```json
{
  "name": "Maria Silva",
  "email": "maria.silva@semed.prainha.pa.gov.br",
  "password": "Senha@123",
  "registrationNumber": "000042",
  "sectorId": "uuid-do-setor-rh",
  "roleId": "uuid-do-perfil-servidor"
}
```

| Campo | Tipo | Obrigatorio | Validacao |
|---|---|---|---|
| `name` | string | Sim | — |
| `email` | string | Sim | Email valido |
| `password` | string | Sim | Minimo 8 caracteres |
| `registrationNumber` | string | Sim | Matricula unica |
| `sectorId` | UUID | Sim | ID de setor existente |
| `roleId` | UUID | Sim | ID de perfil existente |

**Response 201:** Objeto do usuario criado (sem `passwordHash`).

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 400 | Email ou matricula ja cadastrados, dados invalidos |
| 401 | Nao autenticado |
| 403 | Sem permissao `edit` |

---

#### `GET /users/:id`

Busca um usuario por ID.

- **Permissao**: Autenticado

**Response 200:** Objeto do usuario com setor e perfil.

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 404 | Usuario nao encontrado |

---

#### `PATCH /users/:id`

Atualiza um usuario existente.

- **Permissao**: `edit`

**Request Body:** Mesmo formato de `POST /users`.

**Response 200:** Objeto do usuario atualizado.

---

#### `DELETE /users/:id`

Desativa um usuario (soft delete — seta `isActive: false`).

- **Permissao**: `edit`

**Response 200:**

```json
{
  "id": "uuid",
  "name": "Maria Silva",
  "isActive": false
}
```

> **Nota**: O usuario nao e removido do banco. Ele apenas perde acesso ao sistema.

---

### 12.4 Setores (`/sectors`)

---

#### `GET /sectors`

Lista todos os setores ativos.

- **Permissao**: Autenticado

**Response 200:**

```json
[
  { "id": "uuid-prot", "name": "Protocolo", "code": "PROT", "isActive": true },
  { "id": "uuid-rh", "name": "Recursos Humanos", "code": "RH", "isActive": true },
  { "id": "uuid-jur", "name": "Juridico", "code": "JUR", "isActive": true },
  { "id": "uuid-gab", "name": "Gabinete", "code": "GAB", "isActive": true },
  { "id": "uuid-adm", "name": "Administrativo", "code": "ADM", "isActive": true }
]
```

---

#### `POST /sectors`

Cria um novo setor.

- **Permissao**: `edit`

**Request Body:**

```json
{
  "name": "Financeiro",
  "code": "FIN"
}
```

| Campo | Tipo | Obrigatorio | Validacao |
|---|---|---|---|
| `name` | string | Sim | — |
| `code` | string | Sim | Maximo 10 caracteres, unico |

**Response 201:**

```json
{
  "id": "uuid-novo-setor",
  "name": "Financeiro",
  "code": "FIN",
  "isActive": true
}
```

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 400 | Codigo ja existente ou dados invalidos |
| 403 | Sem permissao `edit` |

---

#### `GET /sectors/:id`

Busca um setor por ID.

- **Permissao**: Autenticado

**Response 200:** Objeto do setor.

---

#### `PATCH /sectors/:id`

Atualiza um setor existente.

- **Permissao**: `edit`

**Request Body:** Mesmo formato de `POST /sectors`.

---

#### `DELETE /sectors/:id`

Desativa um setor (soft delete — seta `isActive: false`).

- **Permissao**: `edit`

**Response 200:** Objeto do setor com `isActive: false`.

---

### 12.5 Tipos de Solicitacao (`/request-types`)

---

#### `POST /request-types`

Cria um novo tipo de solicitacao com SLA e fluxo de tramitacao.

- **Permissao**: `edit`

**Request Body:**

```json
{
  "name": "Transferencia de Servidor",
  "slaDays": 20,
  "flow": ["PROT", "RH", "JUR", "GAB"],
  "isActive": true
}
```

| Campo | Tipo | Obrigatorio | Descricao |
|---|---|---|---|
| `name` | string | Sim | Nome do tipo |
| `slaDays` | integer | Sim | Prazo em dias (minimo 1) |
| `flow` | string[] | Sim | Sequencia de codigos de setor |
| `isActive` | boolean | Nao | Padrao: `true` |

**Response 201:**

```json
{
  "id": "uuid-novo-tipo",
  "name": "Transferencia de Servidor",
  "slaDays": 20,
  "flow": ["PROT", "RH", "JUR", "GAB"],
  "isActive": true,
  "createdByUserId": "uuid-do-admin",
  "createdAt": "2026-03-19T10:00:00.000Z"
}
```

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 400 | Dados invalidos (slaDays < 1, flow vazio) |
| 403 | Sem permissao `edit` |

---

#### `GET /request-types`

Lista tipos de solicitacao ativos.

- **Permissao**: Autenticado

**Response 200:**

```json
[
  {
    "id": "uuid-1",
    "name": "Licenca Premio",
    "slaDays": 30,
    "flow": ["PROT", "RH", "GAB"],
    "isActive": true,
    "createdByUserId": "uuid-admin",
    "createdAt": "2026-03-01T00:00:00.000Z"
  },
  {
    "id": "uuid-2",
    "name": "Entrega de Documentos",
    "slaDays": 5,
    "flow": ["PROT", "ADM"],
    "isActive": true,
    "createdByUserId": "uuid-admin",
    "createdAt": "2026-03-01T00:00:00.000Z"
  }
]
```

---

#### `GET /request-types/:id`

Busca tipo de solicitacao por ID.

- **Permissao**: Autenticado

**Response 200:** Objeto do tipo de solicitacao.

---

#### `PATCH /request-types/:id`

Atualiza tipo de solicitacao.

- **Permissao**: `edit`

**Request Body:** Mesmo formato de `POST /request-types`.

---

#### `DELETE /request-types/:id`

Desativa tipo de solicitacao (seta `isActive: false`).

- **Permissao**: `edit`

**Response 200:** Objeto do tipo desativado.

---

### 12.6 Protocolos (`/requests`)

---

#### `POST /requests`

Cria um novo protocolo (solicitacao protocolada).

- **Permissao**: `send`

**Request Body:**

```json
{
  "requestTypeId": "uuid-tipo-licenca-premio",
  "description": "Solicito licenca premio referente ao quinquenio 2021-2026, conforme Art. 87 do Estatuto dos Servidores.",
  "registrationNumber": "000042"
}
```

| Campo | Tipo | Obrigatorio | Descricao |
|---|---|---|---|
| `requestTypeId` | UUID | Sim | ID do tipo de solicitacao |
| `description` | string | Sim | Descricao detalhada do pedido |
| `registrationNumber` | string | Nao | Matricula do solicitante (admin pode criar para outro servidor) |

**Response 201:**

```json
{
  "id": "uuid-do-protocolo",
  "protocolNumber": "2026-PROT-000001",
  "requesterId": "uuid-do-solicitante",
  "sectorOriginId": "uuid-setor-protocolo",
  "requestTypeId": "uuid-tipo-licenca-premio",
  "description": "Solicito licenca premio referente ao quinquenio 2021-2026...",
  "status": "PROTOCOLADO",
  "currentSectorId": "uuid-setor-protocolo",
  "deadlineAt": "2026-04-18T14:30:00.000Z",
  "createdAt": "2026-03-19T14:30:00.000Z",
  "updatedAt": "2026-03-19T14:30:00.000Z",
  "requester": {
    "id": "uuid",
    "name": "Jose Santos",
    "registrationNumber": "000002"
  },
  "requestType": {
    "id": "uuid",
    "name": "Licenca Premio",
    "slaDays": 30
  },
  "sectorOrigin": {
    "id": "uuid",
    "name": "Protocolo",
    "code": "PROT"
  },
  "currentSector": {
    "id": "uuid",
    "name": "Protocolo",
    "code": "PROT"
  }
}
```

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 400 | Tipo de solicitacao sem fluxo configurado, setor inicial nao encontrado |
| 403 | Sem permissao `send` |
| 404 | Tipo de solicitacao nao encontrado ou inativo |

---

#### `GET /requests`

Lista protocolos com filtros e paginacao.

- **Permissao**: Autenticado

**Query Parameters:**

| Parametro | Tipo | Obrigatorio | Descricao | Exemplo |
|---|---|---|---|---|
| `status` | enum | Nao | Filtrar por status | `EM_ANALISE` |
| `sectorCode` | string | Nao | Codigo do setor atual | `RH` |
| `requestTypeId` | UUID | Nao | ID do tipo de solicitacao | `uuid` |
| `from` | ISO 8601 | Nao | Data inicio (createdAt) | `2026-01-01` |
| `to` | ISO 8601 | Nao | Data fim (createdAt) | `2026-03-31` |
| `isOverdue` | boolean | Nao | Apenas atrasados | `true` |
| `page` | integer | Nao | Pagina (padrao: 1) | `1` |
| `limit` | integer | Nao | Itens por pagina (padrao: 20, max: 100) | `20` |

**Exemplo de requisicao:**

```
GET /requests?status=EM_ANALISE&sectorCode=RH&page=1&limit=10
```

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid-do-protocolo",
      "protocolNumber": "2026-PROT-000001",
      "requesterId": "uuid",
      "sectorOriginId": "uuid",
      "requestTypeId": "uuid",
      "description": "Solicito licenca premio...",
      "status": "EM_ANALISE",
      "currentSectorId": "uuid-rh",
      "deadlineAt": "2026-04-18T14:30:00.000Z",
      "createdAt": "2026-03-19T14:30:00.000Z",
      "updatedAt": "2026-03-20T09:00:00.000Z",
      "isOverdue": false,
      "requester": {
        "id": "uuid",
        "name": "Jose Santos",
        "registrationNumber": "000002"
      },
      "requestType": {
        "id": "uuid",
        "name": "Licenca Premio"
      },
      "currentSector": {
        "id": "uuid-rh",
        "name": "Recursos Humanos",
        "code": "RH"
      }
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

---

#### `GET /requests/:id`

Busca protocolo completo por ID, incluindo tramitacoes, historico de status e anexos.

- **Permissao**: Autenticado

**Response 200:**

```json
{
  "id": "uuid-do-protocolo",
  "protocolNumber": "2026-PROT-000001",
  "requesterId": "uuid",
  "sectorOriginId": "uuid",
  "requestTypeId": "uuid",
  "description": "Solicito licenca premio...",
  "status": "EM_ANALISE",
  "currentSectorId": "uuid-rh",
  "deadlineAt": "2026-04-18T14:30:00.000Z",
  "createdAt": "2026-03-19T14:30:00.000Z",
  "updatedAt": "2026-03-20T09:00:00.000Z",
  "isOverdue": false,
  "requester": { "id": "uuid", "name": "Jose Santos", "registrationNumber": "000002" },
  "requestType": { "id": "uuid", "name": "Licenca Premio", "slaDays": 30, "flow": ["PROT", "RH", "GAB"] },
  "sectorOrigin": { "id": "uuid", "name": "Protocolo", "code": "PROT", "isActive": true },
  "currentSector": { "id": "uuid", "name": "Recursos Humanos", "code": "RH", "isActive": true },
  "tramitations": [
    {
      "id": "uuid-tram-1",
      "requestId": "uuid",
      "fromSectorId": "uuid-prot",
      "toSectorId": "uuid-rh",
      "sentByUserId": "uuid-jose",
      "sentAt": "2026-03-19T15:00:00.000Z",
      "receivedByUserId": "uuid-ana",
      "receivedAt": "2026-03-20T08:30:00.000Z",
      "notes": "Documentacao completa, encaminhando para analise",
      "fromSector": { "id": "uuid-prot", "name": "Protocolo", "code": "PROT", "isActive": true },
      "toSector": { "id": "uuid-rh", "name": "Recursos Humanos", "code": "RH", "isActive": true },
      "sentBy": { "id": "uuid-jose", "name": "Jose Santos" },
      "receivedBy": { "id": "uuid-ana", "name": "Ana Oliveira" }
    }
  ],
  "statusHistory": [
    {
      "id": "uuid-sh-1",
      "requestId": "uuid",
      "previousStatus": null,
      "newStatus": "PROTOCOLADO",
      "changedByUserId": "uuid-jose",
      "justification": null,
      "changedAt": "2026-03-19T14:30:00.000Z",
      "changedBy": { "id": "uuid-jose", "name": "Jose Santos" }
    },
    {
      "id": "uuid-sh-2",
      "requestId": "uuid",
      "previousStatus": "PROTOCOLADO",
      "newStatus": "RECEBIDO_PELO_SETOR",
      "changedByUserId": "uuid-ana",
      "justification": null,
      "changedAt": "2026-03-20T08:30:00.000Z",
      "changedBy": { "id": "uuid-ana", "name": "Ana Oliveira" }
    }
  ],
  "attachments": [
    {
      "id": "uuid-att-1",
      "requestId": "uuid",
      "uploadedByUserId": "uuid-jose",
      "filename": "certidao-tempo-servico.pdf",
      "storagePath": "attachments/uuid/certidao-tempo-servico.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 245760,
      "uploadedAt": "2026-03-19T14:35:00.000Z",
      "uploadedBy": { "id": "uuid-jose", "name": "Jose Santos" }
    }
  ]
}
```

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 404 | Protocolo nao encontrado |

---

#### `GET /requests/:id/timeline`

Retorna a timeline publica do protocolo (sem autenticacao necessaria).

- **Permissao**: Publica (`@Public`)

**Response 200:**

```json
{
  "protocolNumber": "2026-PROT-000001",
  "status": "EM_ANALISE",
  "createdAt": "2026-03-19T14:30:00.000Z",
  "deadlineAt": "2026-04-18T14:30:00.000Z",
  "statusHistory": [
    {
      "id": "uuid",
      "previousStatus": null,
      "newStatus": "PROTOCOLADO",
      "justification": null,
      "changedAt": "2026-03-19T14:30:00.000Z",
      "changedBy": { "name": "Jose Santos" }
    }
  ],
  "tramitations": [
    {
      "id": "uuid",
      "sentAt": "2026-03-19T15:00:00.000Z",
      "receivedAt": "2026-03-20T08:30:00.000Z",
      "fromSector": { "name": "Protocolo" },
      "toSector": { "name": "Recursos Humanos" },
      "sentBy": { "name": "Jose Santos" },
      "receivedBy": { "name": "Ana Oliveira" }
    }
  ]
}
```

---

### 12.7 Tramitacao (`/requests/:id`)

---

#### `POST /requests/:id/forward`

Encaminha o protocolo para o proximo setor do fluxo.

- **Permissao**: `send`

**Request Body:**

```json
{
  "toSectorCode": "RH",
  "notes": "Documentacao conferida e completa. Encaminhando para analise do RH."
}
```

| Campo | Tipo | Obrigatorio | Descricao |
|---|---|---|---|
| `toSectorCode` | string | Sim | Codigo do setor destino (deve ser o proximo no fluxo) |
| `notes` | string | Nao | Observacoes sobre o encaminhamento |

**Response 201:**

```json
{
  "id": "uuid-da-tramitacao",
  "requestId": "uuid-do-protocolo",
  "fromSectorId": "uuid-setor-prot",
  "toSectorId": "uuid-setor-rh",
  "sentByUserId": "uuid-do-usuario",
  "sentAt": "2026-03-19T15:00:00.000Z",
  "receivedByUserId": null,
  "receivedAt": null,
  "notes": "Documentacao conferida e completa. Encaminhando para analise do RH."
}
```

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 400 | Setor destino nao e o proximo no fluxo (ex: "O proximo setor no fluxo e 'RH', nao 'GAB'") |
| 403 | Usuario nao pertence ao setor atual do protocolo |
| 404 | Protocolo ou setor nao encontrado |

> **Superadmin**: Pode encaminhar para qualquer setor, ignorando a validacao de fluxo e de setor.

---

#### `POST /requests/:id/receive`

Confirma o recebimento do protocolo no setor atual.

- **Permissao**: `receive`

**Request Body:** Nenhum

**Response 200:**

```json
{
  "id": "uuid-da-tramitacao",
  "requestId": "uuid-do-protocolo",
  "fromSectorId": "uuid-setor-prot",
  "toSectorId": "uuid-setor-rh",
  "sentByUserId": "uuid-remetente",
  "sentAt": "2026-03-19T15:00:00.000Z",
  "receivedByUserId": "uuid-receptor",
  "receivedAt": "2026-03-20T08:30:00.000Z",
  "notes": null
}
```

**Efeitos colaterais:**
- Status do protocolo muda para `RECEBIDO_PELO_SETOR`
- Registro adicionado ao historico de status

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 400 | Nao ha tramitacao pendente de recebimento para este setor |
| 403 | Usuario nao pertence ao setor atual |
| 404 | Protocolo nao encontrado |

---

#### `PATCH /requests/:id/status`

Altera o status do protocolo.

- **Permissao**: `edit`

**Request Body:**

```json
{
  "status": "EM_ANALISE",
  "justification": null
}
```

| Campo | Tipo | Obrigatorio | Descricao |
|---|---|---|---|
| `status` | enum (RequestStatus) | Sim | Novo status |
| `justification` | string | Condicional | Obrigatoria para `INDEFERIDO` e `PENDENTE_DOCUMENTO` |

**Valores aceitos para `status`:**
- `PROTOCOLADO`
- `RECEBIDO_PELO_SETOR`
- `EM_ANALISE`
- `PENDENTE_DOCUMENTO` (requer justificativa)
- `DEFERIDO`
- `INDEFERIDO` (requer justificativa)
- `CONCLUIDO`

**Response 200:**

```json
{
  "message": "Status atualizado com sucesso",
  "status": "EM_ANALISE"
}
```

**Exemplo com justificativa (indeferimento):**

```json
{
  "status": "INDEFERIDO",
  "justification": "Servidor nao completou o quinquenio necessario. Faltam 8 meses de servico efetivo conforme certidao."
}
```

**Erros possiveis:**

| Codigo | Descricao |
|---|---|
| 400 | Justificativa obrigatoria nao fornecida (para INDEFERIDO ou PENDENTE_DOCUMENTO) |
| 403 | Sem permissao `edit` |
| 404 | Protocolo nao encontrado |

---

### 12.8 Anexos (`/requests/:id/attachments`)

---

#### `POST /requests/:id/attachments`

Faz upload de um anexo para o protocolo.

- **Permissao**: `send`
- **Content-Type**: `multipart/form-data`
- **Limite**: 5 MB por arquivo
- **Formatos aceitos**: PDF, JPEG

**Request:**

```
POST /requests/uuid-do-protocolo/attachments
Content-Type: multipart/form-data

file: [arquivo.pdf]
```

| Campo | Tipo | Obrigatorio | Descricao |
|---|---|---|---|
| `file` | File | Sim | Arquivo PDF ou JPEG (max 5MB) |

**Response 201:**

```json
{
  "id": "uuid-do-anexo",
  "requestId": "uuid-do-protocolo",
  "uploadedByUserId": "uuid-do-usuario",
  "filename": "certidao-tempo-servico.pdf",
  "storagePath": "attachments/uuid-protocolo/certidao-tempo-servico.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 245760,
  "uploadedAt": "2026-03-19T14:35:00.000Z"
}
```

---

#### `GET /requests/:id/attachments`

Lista todos os anexos de um protocolo.

- **Permissao**: Autenticado

**Response 200:**

```json
[
  {
    "id": "uuid-att-1",
    "requestId": "uuid",
    "uploadedByUserId": "uuid",
    "filename": "certidao-tempo-servico.pdf",
    "storagePath": "attachments/uuid/certidao-tempo-servico.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 245760,
    "uploadedAt": "2026-03-19T14:35:00.000Z"
  }
]
```

---

#### `GET /attachments/:attachmentId/url`

Obtem uma URL assinada para download do anexo (valida por 1 hora).

- **Permissao**: Autenticado

**Response 200:**

```json
{
  "url": "https://abc123.supabase.co/storage/v1/object/sign/attachments/uuid/certidao.pdf?token=eyJ..."
}
```

---

### 12.9 Notificacoes (`/notifications`)

---

#### `GET /notifications`

Lista as ultimas 50 notificacoes do usuario autenticado (nao lidas primeiro, depois por data).

- **Permissao**: Autenticado

**Response 200:**

```json
[
  {
    "id": "uuid-notif-1",
    "userId": "uuid-do-usuario",
    "title": "Novo protocolo recebido",
    "body": "Protocolo 2026-PROT-000001 foi encaminhado para Recursos Humanos",
    "type": "FORWARDED",
    "relatedRequestId": "uuid-do-protocolo",
    "isRead": false,
    "createdAt": "2026-03-19T15:00:00.000Z"
  },
  {
    "id": "uuid-notif-2",
    "userId": "uuid-do-usuario",
    "title": "Status do protocolo atualizado",
    "body": "Seu protocolo 2026-PROT-000003 agora esta: EM ANALISE",
    "type": "STATUS_CHANGED",
    "relatedRequestId": "uuid-outro-protocolo",
    "isRead": true,
    "createdAt": "2026-03-18T10:00:00.000Z"
  }
]
```

---

#### `GET /notifications/unread-count`

Retorna a contagem de notificacoes nao lidas.

- **Permissao**: Autenticado

**Response 200:**

```json
{
  "count": 5
}
```

---

#### `PATCH /notifications/:id/read`

Marca uma notificacao como lida.

- **Permissao**: Autenticado (apenas notificacoes do proprio usuario)

**Request Body:** Nenhum

**Response 200:**

```json
{
  "count": 1
}
```

---

#### `PATCH /notifications/read-all`

Marca todas as notificacoes do usuario como lidas.

- **Permissao**: Autenticado

**Response 200:**

```json
{
  "updated": 5
}
```

---

### 12.10 Dashboard (`/dashboard`)

---

#### `GET /dashboard/overview`

Visao geral com totais por status e quantidade de protocolos atrasados.

- **Permissao**: Autenticado

**Response 200:**

```json
{
  "total": 127,
  "byStatus": [
    { "status": "PROTOCOLADO", "count": 15 },
    { "status": "RECEBIDO_PELO_SETOR", "count": 8 },
    { "status": "EM_ANALISE", "count": 22 },
    { "status": "PENDENTE_DOCUMENTO", "count": 5 },
    { "status": "DEFERIDO", "count": 45 },
    { "status": "INDEFERIDO", "count": 12 },
    { "status": "CONCLUIDO", "count": 20 }
  ],
  "overdue": 7
}
```

---

#### `GET /dashboard/by-period`

Quantidade de protocolos criados agrupados por periodo.

- **Permissao**: Autenticado

**Query Parameters:**

| Parametro | Tipo | Obrigatorio | Padrao | Descricao |
|---|---|---|---|---|
| `from` | ISO 8601 | Nao | 30 dias atras | Data inicio |
| `to` | ISO 8601 | Nao | Hoje | Data fim |
| `granularity` | enum | Nao | `day` | `day`, `week` ou `month` |

**Exemplo:**

```
GET /dashboard/by-period?from=2026-01-01&to=2026-03-31&granularity=month
```

**Response 200:**

```json
[
  { "period": "2026-01-01T00:00:00.000Z", "total": 42 },
  { "period": "2026-02-01T00:00:00.000Z", "total": 38 },
  { "period": "2026-03-01T00:00:00.000Z", "total": 47 }
]
```

---

#### `GET /dashboard/response-time`

Ranking de setores por tempo medio de recebimento (eficiencia).

- **Permissao**: Autenticado

**Response 200:**

```json
[
  {
    "sector_name": "Protocolo",
    "sector_code": "PROT",
    "avg_hours_to_receive": 2.50,
    "total_received": 89
  },
  {
    "sector_name": "Recursos Humanos",
    "sector_code": "RH",
    "avg_hours_to_receive": 8.75,
    "total_received": 54
  },
  {
    "sector_name": "Gabinete",
    "sector_code": "GAB",
    "avg_hours_to_receive": 24.30,
    "total_received": 31
  }
]
```

> O tempo medio e calculado como a diferenca entre `sentAt` e `receivedAt` de cada tramitacao.

---

#### `GET /dashboard/user-activity`

Usuarios mais ativos nos ultimos 30 dias (baseado em logs de auditoria).

- **Permissao**: Autenticado

**Query Parameters:**

| Parametro | Tipo | Obrigatorio | Padrao | Descricao |
|---|---|---|---|---|
| `limit` | integer | Nao | 10 | Maximo de usuarios retornados (1-100) |

**Response 200:**

```json
[
  {
    "user_name": "Jose Santos",
    "email": "jose.santos@semed.prainha.pa.gov.br",
    "total_actions": 342
  },
  {
    "user_name": "Ana Oliveira",
    "email": "ana.oliveira@semed.prainha.pa.gov.br",
    "total_actions": 187
  }
]
```

---

#### `GET /dashboard/overdue`

Lista todos os protocolos com prazo vencido (nao terminais).

- **Permissao**: Autenticado

**Response 200:**

```json
[
  {
    "id": "uuid",
    "protocolNumber": "2026-PROT-000005",
    "status": "EM_ANALISE",
    "deadlineAt": "2026-03-15T00:00:00.000Z",
    "createdAt": "2026-02-13T00:00:00.000Z",
    "requester": { "name": "Carlos Mendes", "registrationNumber": "000015" },
    "currentSector": { "name": "Juridico", "code": "JUR" },
    "requestType": { "name": "Licenca Sem Vencimento" }
  }
]
```

---

### 12.11 Relatorios (`/reports`)

---

#### `GET /reports/requests`

Gera um relatorio PDF de protocolos com filtros.

- **Permissao**: Autenticado
- **Content-Type da resposta**: `application/pdf`
- **Content-Disposition**: `attachment; filename="protocolos.pdf"`

**Query Parameters:**

| Parametro | Tipo | Obrigatorio | Descricao |
|---|---|---|---|
| `from` | ISO 8601 | Nao | Data inicio |
| `to` | ISO 8601 | Nao | Data fim |
| `sectorCode` | string | Nao | Filtrar por setor |
| `requestTypeId` | UUID | Nao | Filtrar por tipo de solicitacao |
| `status` | enum | Nao | Filtrar por status |

**Exemplo:**

```
GET /reports/requests?from=2026-01-01&to=2026-03-31&status=DEFERIDO
```

**Response 200:** Arquivo PDF binario

> **Auditoria**: Toda geracao de relatorio e registrada com acao `EXPORT_PDF`.

---

### 12.12 Logs de Auditoria (`/audit-logs`)

---

#### `GET /audit-logs`

Consulta logs de auditoria com filtros e paginacao.

- **Permissao**: Autenticado

**Query Parameters:**

| Parametro | Tipo | Obrigatorio | Padrao | Descricao |
|---|---|---|---|---|
| `entityType` | string | Nao | — | Tipo de entidade (ex: `requests`, `auth`, `users`) |
| `entityId` | string | Nao | — | ID da entidade |
| `actorUserId` | string | Nao | — | ID do usuario que executou a acao |
| `from` | ISO 8601 | Nao | — | Data inicio |
| `to` | ISO 8601 | Nao | — | Data fim |
| `page` | integer | Nao | 1 | Pagina |
| `limit` | integer | Nao | 50 | Itens por pagina (max: 100) |

**Exemplo:**

```
GET /audit-logs?entityType=auth&from=2026-03-01&limit=20
```

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid-log-1",
      "action": "LOGIN_SUCCESS",
      "entityType": "auth",
      "entityId": "uuid-do-usuario",
      "actorUserId": "uuid-do-usuario",
      "payloadBefore": null,
      "payloadAfter": null,
      "ipAddress": "192.168.1.10",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
      "createdAt": "2026-03-19T08:00:00.000Z"
    },
    {
      "id": "uuid-log-2",
      "action": "POST:/requests",
      "entityType": "requests",
      "entityId": "uuid-do-protocolo",
      "actorUserId": "uuid-do-usuario",
      "payloadBefore": null,
      "payloadAfter": {
        "requestTypeId": "uuid",
        "description": "Solicito licenca premio..."
      },
      "ipAddress": "192.168.1.10",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2026-03-19T09:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1523,
    "page": 1,
    "limit": 20,
    "totalPages": 77
  }
}
```

---

#### `GET /audit-logs/:entityType/:entityId`

Retorna o historico completo de auditoria de uma entidade especifica.

- **Permissao**: Autenticado

**Exemplo:**

```
GET /audit-logs/requests/uuid-do-protocolo
```

**Response 200:**

```json
[
  {
    "id": "uuid-log-1",
    "action": "POST:/requests",
    "entityType": "requests",
    "entityId": "uuid-do-protocolo",
    "actorUserId": "uuid-jose",
    "payloadBefore": null,
    "payloadAfter": { "requestTypeId": "uuid", "description": "Solicito licenca..." },
    "ipAddress": "192.168.1.10",
    "userAgent": "Mozilla/5.0...",
    "createdAt": "2026-03-19T14:30:00.000Z"
  },
  {
    "id": "uuid-log-2",
    "action": "POST:/requests/uuid/forward",
    "entityType": "requests",
    "entityId": "uuid-do-protocolo",
    "actorUserId": "uuid-jose",
    "payloadBefore": { "status": "PROTOCOLADO", "currentSectorId": "uuid-prot" },
    "payloadAfter": { "toSectorCode": "RH", "notes": "Encaminhando" },
    "ipAddress": "192.168.1.10",
    "userAgent": "Mozilla/5.0...",
    "createdAt": "2026-03-19T15:00:00.000Z"
  }
]
```

---

## 13. Schema do Banco de Dados

O banco de dados PostgreSQL contem 12 modelos (tabelas). Abaixo a descricao completa de cada um.

### 13.1 Role (`roles`)

Perfis de acesso do sistema.

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `name` | String | Nome do perfil (ex: "Administrador") |
| `slug` | String (unique) | Identificador slug (ex: "admin") |
| `permissions` | JSON | Objeto com 6 permissoes booleanas |
| `isSuperadmin` | Boolean | Se `true`, ignora restricoes de fluxo e setor |

**Relacionamentos:**
- `users` → Um perfil pode ter muitos usuarios

---

### 13.2 Sector (`sectors`)

Setores da SEMED.

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `name` | String | Nome do setor |
| `code` | String (unique) | Codigo curto (ex: "RH", "PROT") |
| `isActive` | Boolean | Se o setor esta ativo |

**Relacionamentos:**
- `users` → Um setor pode ter muitos usuarios
- `requestsOrigin` → Protocolos cuja origem e este setor
- `requestsCurrent` → Protocolos atualmente neste setor
- `tramitationsFrom` → Tramitacoes saindo deste setor
- `tramitationsTo` → Tramitacoes chegando neste setor

---

### 13.3 User (`users`)

Usuarios do sistema.

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `name` | String | Nome completo |
| `email` | String (unique) | Email institucional |
| `passwordHash` | String | Hash bcrypt da senha |
| `registrationNumber` | String (unique) | Matricula do servidor |
| `sectorId` | UUID (FK → Sector) | Setor do usuario |
| `roleId` | UUID (FK → Role) | Perfil de acesso |
| `isActive` | Boolean | Se o usuario esta ativo |
| `createdAt` | DateTime | Data de criacao |
| `updatedAt` | DateTime | Data da ultima atualizacao |

**Indices:** `sectorId`, `roleId`

**Relacionamentos:**
- `sector` → Pertence a um setor
- `role` → Pertence a um perfil
- `requestsCreated` → Protocolos criados por este usuario
- `tramitationsSent` → Tramitacoes enviadas
- `tramitationsReceived` → Tramitacoes recebidas
- `statusChanges` → Mudancas de status realizadas
- `attachmentsUploaded` → Anexos enviados
- `notifications` → Notificacoes recebidas
- `refreshTokens` → Tokens de refresh
- `requestTypesCreated` → Tipos de solicitacao criados

---

### 13.4 RefreshToken (`refresh_tokens`)

Tokens de refresh para renovacao de sessao.

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `token` | String (unique) | Valor do token JWT |
| `userId` | UUID (FK → User) | Dono do token |
| `expiresAt` | DateTime | Data de expiracao |
| `revokedAt` | DateTime? | Data de revogacao (null se ativo) |
| `createdAt` | DateTime | Data de criacao |

**Indice:** `userId`

---

### 13.5 RequestType (`request_types`)

Tipos de solicitacao com SLA e fluxo de setores.

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `name` | String | Nome (ex: "Licenca Premio") |
| `slaDays` | Int | Prazo em dias |
| `flow` | JSON (string[]) | Sequencia de codigos de setor |
| `isActive` | Boolean | Se esta ativo |
| `createdByUserId` | UUID (FK → User) | Quem criou |
| `createdAt` | DateTime | Data de criacao |

**Relacionamentos:**
- `createdBy` → Usuario que criou
- `requests` → Protocolos deste tipo

---

### 13.6 ProtocolSequence (`protocol_sequences`)

Sequencia atomica para geracao de numeros de protocolo.

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `year` | Int | Ano (ex: 2026) |
| `sectorCode` | String | Codigo do setor inicial |
| `lastSequence` | Int | Ultimo numero da sequencia |
| `updatedAt` | DateTime | Data da ultima atualizacao |

**Constraint unica:** `(year, sectorCode)`

---

### 13.7 Request (`requests`)

Protocolos (solicitacoes protocoladas).

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `protocolNumber` | String (unique) | Numero do protocolo (ex: `2026-PROT-000001`) |
| `requesterId` | UUID (FK → User) | Solicitante |
| `sectorOriginId` | UUID (FK → Sector) | Setor de origem |
| `requestTypeId` | UUID (FK → RequestType) | Tipo de solicitacao |
| `description` | String | Descricao do pedido |
| `status` | Enum (RequestStatus) | Status atual |
| `currentSectorId` | UUID (FK → Sector) | Setor onde o protocolo esta atualmente |
| `deadlineAt` | DateTime | Prazo (SLA) |
| `createdAt` | DateTime | Data de criacao |
| `updatedAt` | DateTime | Data da ultima atualizacao |

**Indices:** `status`, `currentSectorId`, `requesterId`, `createdAt`, `deadlineAt`

**Relacionamentos:**
- `requester` → Usuario solicitante
- `sectorOrigin` → Setor de origem
- `requestType` → Tipo de solicitacao
- `currentSector` → Setor atual
- `tramitations` → Historico de tramitacoes
- `statusHistory` → Historico de mudancas de status
- `attachments` → Anexos

---

### 13.8 RequestTramitation (`request_tramitations`)

Registro de cada movimentacao do protocolo entre setores.

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `requestId` | UUID (FK → Request) | Protocolo tramitado |
| `fromSectorId` | UUID (FK → Sector) | Setor de saida |
| `toSectorId` | UUID (FK → Sector) | Setor de destino |
| `sentByUserId` | UUID (FK → User) | Quem encaminhou |
| `sentAt` | DateTime | Data/hora do envio |
| `receivedByUserId` | UUID? (FK → User) | Quem recebeu (null ate recebimento) |
| `receivedAt` | DateTime? | Data/hora do recebimento |
| `notes` | String? | Observacoes |

**Indice:** `requestId`

---

### 13.9 RequestStatusHistory (`request_status_history`)

Registro de cada mudanca de status do protocolo.

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `requestId` | UUID (FK → Request) | Protocolo |
| `previousStatus` | Enum? | Status anterior (null para primeiro registro) |
| `newStatus` | Enum | Novo status |
| `changedByUserId` | UUID (FK → User) | Quem alterou |
| `justification` | String? | Justificativa (obrigatoria para INDEFERIDO e PENDENTE_DOCUMENTO) |
| `changedAt` | DateTime | Data/hora da mudanca |

**Indice:** `requestId`

---

### 13.10 Attachment (`attachments`)

Anexos de protocolos armazenados no Supabase Storage.

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `requestId` | UUID (FK → Request) | Protocolo |
| `uploadedByUserId` | UUID (FK → User) | Quem fez upload |
| `filename` | String | Nome original do arquivo |
| `storagePath` | String | Caminho no Supabase Storage |
| `mimeType` | String | Tipo MIME (ex: `application/pdf`) |
| `sizeBytes` | Int | Tamanho em bytes |
| `uploadedAt` | DateTime | Data/hora do upload |

**Indice:** `requestId`

---

### 13.11 AuditLog (`audit_logs`)

Log de auditoria imutavel (append-only).

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `action` | String | Acao realizada (ex: `LOGIN_SUCCESS`, `POST:/requests`) |
| `entityType` | String | Tipo da entidade (ex: `auth`, `requests`) |
| `entityId` | String | ID da entidade afetada |
| `actorUserId` | String | ID do usuario que realizou a acao (**nao e FK**) |
| `payloadBefore` | JSON? | Estado anterior da entidade |
| `payloadAfter` | JSON? | Dados enviados na operacao |
| `ipAddress` | String? | Endereco IP do cliente |
| `userAgent` | String? | User-Agent do navegador |
| `createdAt` | DateTime | Data/hora do registro |

**Indices:** `(entityType, entityId)`, `actorUserId`, `createdAt`

> **Importante**: `actorUserId` nao e uma chave estrangeira. Isso e intencional para preservar logs mesmo quando usuarios sao excluidos.

---

### 13.12 Notification (`notifications`)

Notificacoes in-app para usuarios.

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | UUID (PK) | Identificador unico |
| `userId` | UUID (FK → User) | Destinatario |
| `title` | String | Titulo da notificacao |
| `body` | String | Corpo da mensagem |
| `type` | String | Tipo (`FORWARDED`, `STATUS_CHANGED`, `OVERDUE`) |
| `relatedRequestId` | String? | ID do protocolo relacionado |
| `isRead` | Boolean | Se foi lida |
| `createdAt` | DateTime | Data/hora de criacao |

**Indice:** `(userId, isRead)`

---

## 14. Motor de Tramitacao — Regras de Negocio

### 14.1 Validacao de fluxo

Cada tipo de solicitacao define uma sequencia fixa de setores (campo `flow`). Exemplo:

```json
{
  "name": "Licenca Premio",
  "flow": ["PROT", "RH", "GAB"]
}
```

Ao encaminhar um protocolo, o sistema valida:
1. O setor destino (`toSectorCode`) **deve ser o proximo na sequencia** do fluxo
2. O sistema localiza o setor atual no array `flow` usando `indexOf(currentSector.code)`
3. O proximo setor esperado e `flow[currentIdx + 1]`
4. Se o destino nao corresponde, retorna erro 400

**Exemplo:**
- Protocolo esta no setor `PROT` (indice 0 no fluxo)
- Proximo esperado: `RH` (indice 1)
- Tentativa de enviar para `GAB` → **Erro**: "O proximo setor no fluxo e 'RH', nao 'GAB'"

### 14.2 Autorizacao por setor

Apenas usuarios que pertencem ao setor atual do protocolo podem:
- **Encaminhar** (`forward`) o protocolo
- **Receber** (`receive`) o protocolo

A verificacao compara `currentUser.sectorId` com `request.currentSectorId`.

### 14.3 Bypass do superadmin

Usuarios com `role.isSuperadmin === true` podem:
- **Encaminhar para qualquer setor**, ignorando a validacao de fluxo
- **Encaminhar/receber** mesmo sem pertencer ao setor atual

Isso e essencial para o administrador corrigir tramitacoes incorretas ou agilizar processos urgentes.

### 14.4 Geracao de numero de protocolo

O numero de protocolo e gerado atomicamente usando `upsert` no Prisma:

```
Formato: YYYY-CODE-NNNNNN

Onde:
  YYYY   = Ano atual (ex: 2026)
  CODE   = Codigo do setor inicial do fluxo (ex: PROT)
  NNNNNN = Sequencia com zero-fill de 6 digitos (ex: 000001)
```

**Exemplos:**
- `2026-PROT-000001` — Primeiro protocolo de 2026 com fluxo iniciando em PROT
- `2026-PROT-000002` — Segundo protocolo
- `2026-ADM-000001` — Primeiro protocolo com fluxo iniciando em ADM

**Atomicidade**: O `upsert` com `increment` garante que nao existam numeros duplicados, mesmo com requisicoes concorrentes. A operacao e:
1. Tenta encontrar o registro `(year, sectorCode)` na tabela `protocol_sequences`
2. Se existe, incrementa `lastSequence` em 1
3. Se nao existe, cria com `lastSequence: 1`

### 14.5 Recebimento

Ao receber um protocolo (`POST /requests/:id/receive`):
1. O sistema busca a tramitacao mais recente com `receivedAt: null` para o setor atual
2. Se nao encontrar, retorna erro 400 ("Nao ha tramitacao pendente de recebimento")
3. Atualiza a tramitacao com `receivedByUserId` e `receivedAt`
4. Altera o status do protocolo para `RECEBIDO_PELO_SETOR`
5. Registra a mudanca de status no historico

### 14.6 Calculo do deadline

```typescript
const deadlineAt = addDays(new Date(), requestType.slaDays);
```

O prazo e calculado em **dias corridos** (nao uteis) a partir da data de criacao do protocolo. A funcao `addDays` e do pacote `date-fns`.

---

## 15. Testes

### 15.1 Testes unitarios (21 testes em 6 arquivos)

Os testes unitarios cobrem a logica isolada dos servicos e guards:

| Arquivo | Testes | Cobertura |
|---|---|---|
| `app.controller.spec.ts` | 1 | Health check |
| `users.service.spec.ts` | 2 | Criacao e listagem de usuarios |
| `protocol-number.service.spec.ts` | 3 | Geracao de numeros de protocolo |
| `tramitations.service.spec.ts` | 4 | Encaminhar, receber, alterar status |
| `permission.guard.spec.ts` | 5 | Validacao de permissoes por rota |
| `audit.interceptor.spec.ts` | 6 | Captura automatica de auditoria |

### 15.2 Testes end-to-end (36 testes em 4 arquivos)

Os testes E2E verificam o comportamento completo da API com banco de dados real:

| Arquivo | Testes | Cobertura |
|---|---|---|
| `auth.e2e-spec.ts` | 8 | Login, refresh, logout, me, rate limit |
| `tramitation-flow.e2e-spec.ts` | 10 | Fluxo completo: criar → encaminhar → receber → deferir |
| `permissions.e2e-spec.ts` | 13 | RBAC: cada perfil so acessa o que deve |
| `audit-trail.e2e-spec.ts` | 5 | Verificacao de logs apos operacoes |

### 15.3 Como executar

```bash
# Testes unitarios
npm run test

# Testes unitarios em modo watch
npm run test:watch

# Testes unitarios com cobertura
npm run test:cov

# Testes end-to-end
npm run test:e2e
```

> **Nota**: Os testes E2E rodam com `maxWorkers: 1` (sequencial) para evitar conflitos no banco de dados. O timeout e de 30 segundos por teste.

---

## 16. Decisoes Tecnicas

### 16.1 Por que Prisma 7 com adapter-pg (e nao url/directUrl no schema)

O Prisma 7 introduziu o conceito de **adapters**, que substituem a configuracao `url`/`directUrl` no `schema.prisma`. O `@prisma/adapter-pg` permite:
- Controle direto da conexao PostgreSQL via pacote `pg`
- Compatibilidade com ambientes serverless
- Melhor integracao com Supabase (pgbouncer na porta 6543 para queries, conexao direta na 5432 para migracoes)

No `schema.prisma`, o datasource so precisa de `provider = "postgresql"` — a URL de conexao e fornecida programaticamente via adapter.

### 16.2 Por que actorUserId NAO e FK no AuditLog

Se `actorUserId` fosse uma chave estrangeira para `users`, nao seria possivel:
- Manter logs de tentativas de login com email inexistente (`actorUserId = 'anonymous'`)
- Preservar logs apos desativacao/exclusao de usuarios
- Registrar acoes de sistemas automaticos

A decisao de usar `String` sem FK garante que o log de auditoria e **independente** do ciclo de vida dos usuarios.

### 16.3 Por que fire-and-forget para notificacoes e auditoria

As notificacoes e logs de auditoria sao criados com `void Promise.then().catch(() => {})`, ou seja:
- A operacao principal **nunca falha** por causa de notificacao/auditoria
- O usuario recebe resposta rapida
- Erros sao silenciosamente ignorados (ou logados)

Justificativa: Notificacoes e auditoria sao **efeitos colaterais** — nao devem impactar a experiencia do usuario nem o fluxo principal.

### 16.4 Por que DATE_TRUNC usa Prisma.sql fragments

No dashboard `byPeriod`, usamos `Prisma.sql` (tagged template literal) para construir a funcao `DATE_TRUNC` dinamicamente:

```typescript
const truncFn = granularity === 'week'
  ? Prisma.sql`DATE_TRUNC('week', created_at)`
  : Prisma.sql`DATE_TRUNC('day', created_at)`;
```

Isso e necessario porque:
- `$queryRaw` exige `Prisma.sql` para interpolar fragmentos SQL de forma segura
- Nao e possivel parametrizar nomes de funcoes SQL com `$1` (prepared statements)
- O valor de `granularity` e validado pelo DTO (enum), eliminando risco de SQL injection

### 16.5 Por que maxWorkers: 1 para testes E2E

Os testes E2E compartilham o mesmo banco de dados. Com multiplos workers paralelos, os testes interfeririam uns nos outros (ex: um teste cria um protocolo, outro lista e encontra dados inesperados).

Rodar com `maxWorkers: 1` garante execucao **sequencial** e previsivel, ao custo de maior tempo de execucao.

---

## Apendice: Enum RequestStatus

```typescript
enum RequestStatus {
  PROTOCOLADO           // Protocolo recém-criado
  RECEBIDO_PELO_SETOR   // Setor confirmou recebimento
  EM_ANALISE            // Em análise pelo setor
  PENDENTE_DOCUMENTO    // Aguardando documentação (justificativa obrigatória)
  DEFERIDO              // Aprovado
  INDEFERIDO            // Negado (justificativa obrigatória)
  CONCLUIDO             // Finalizado
}
```

---

## Apendice: Codigos de Erro HTTP

| Codigo | Significado | Quando ocorre |
|---|---|---|
| 200 | Sucesso | Operacao realizada com sucesso |
| 201 | Criado | Recurso criado com sucesso (POST) |
| 400 | Requisicao invalida | Dados invalidos, fluxo incorreto, justificativa faltando |
| 401 | Nao autorizado | Token ausente, invalido ou expirado |
| 403 | Proibido | Usuario nao possui a permissao necessaria |
| 404 | Nao encontrado | Recurso inexistente |
| 429 | Muitas requisicoes | Rate limit excedido (login) |
| 500 | Erro interno | Erro inesperado no servidor |

---

> **Documento gerado para a SEMED Prainha - PA**
> Versao 1.0 | Marco 2026
