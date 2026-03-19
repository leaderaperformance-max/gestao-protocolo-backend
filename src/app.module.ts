import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { appConfig } from './config/app.config';
import { AuthModule } from './modules/auth/auth.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { SectorsModule } from './modules/sectors/sectors.module';
import { RequestTypesModule } from './modules/request-types/request-types.module';
import { RequestsModule } from './modules/requests/requests.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TramitationsModule } from './modules/tramitations/tramitations.module';
import { SupabaseModule } from './supabase/supabase.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    SupabaseModule,
    AuthModule,
    RolesModule,
    UsersModule,
    SectorsModule,
    RequestTypesModule,
    RequestsModule,
    NotificationsModule,
    TramitationsModule,
    AttachmentsModule,
    DashboardModule,
    ReportsModule,
    AuditLogsModule,
  ],
})
export class AppModule {}
