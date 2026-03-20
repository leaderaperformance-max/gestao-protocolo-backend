import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

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

  // Swagger — only in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    const config = new DocumentBuilder()
      .setTitle('Sistema de Protocolo e Tramitação')
      .setDescription('API do Sistema de Protocolo e Tramitação Digital — Secretaria Municipal de Educação de Prainha/PA')
      .setVersion('1.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Insira o token JWT obtido em POST /auth/login',
      })
      .addTag('Autenticação', 'Login, logout, renovação de token e dados do usuário')
      .addTag('Perfis de Acesso', 'Gerenciamento de perfis (roles) e permissões')
      .addTag('Usuários', 'Cadastro, consulta e gestão de usuários do sistema')
      .addTag('Setores', 'Gerenciamento de setores da Secretaria')
      .addTag('Tipos de Solicitação', 'Tipos de protocolo com SLA e fluxo de tramitação')
      .addTag('Protocolos', 'Criação, consulta e acompanhamento de protocolos')
      .addTag('Tramitação', 'Encaminhamento, recebimento e alteração de status')
      .addTag('Anexos', 'Upload e download de documentos anexados aos protocolos')
      .addTag('Notificações', 'Notificações in-system do usuário')
      .addTag('Dashboard', 'Indicadores gerenciais e estatísticas')
      .addTag('Relatórios', 'Exportação de relatórios em PDF')
      .addTag('Logs de Auditoria', 'Consulta à trilha de auditoria do sistema')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
    logger.log(`Swagger available at http://localhost:${process.env.PORT ?? 3000}/api`);
  }

  const port = process.env.PORT ?? 3000;
  // Bind to 0.0.0.0 so the app is reachable in containerized environments (Docker, etc.)
  await app.listen(port, '0.0.0.0');
  logger.log(`API running on http://localhost:${port}`);
}
bootstrap();
