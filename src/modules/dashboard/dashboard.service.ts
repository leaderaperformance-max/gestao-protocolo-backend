import { Injectable } from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const TERMINAL = [RequestStatus.DEFERIDO, RequestStatus.INDEFERIDO, RequestStatus.CONCLUIDO];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const now = new Date();
    const [total, byStatusRaw, overdue] = await Promise.all([
      this.prisma.request.count(),
      this.prisma.request.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.request.count({
        where: {
          deadlineAt: { lt: now },
          status: { notIn: TERMINAL },
        },
      }),
    ]);

    const byStatus = byStatusRaw.map((r) => ({
      status: r.status,
      count: r._count.status,
    }));

    return { total, byStatus, overdue };
  }

  async byPeriod(from: Date, to: Date, granularity: 'day' | 'week' | 'month' = 'day') {
    const truncFn =
      granularity === 'week'  ? Prisma.sql`DATE_TRUNC('week',  created_at)` :
      granularity === 'month' ? Prisma.sql`DATE_TRUNC('month', created_at)` :
                                Prisma.sql`DATE_TRUNC('day',   created_at)`;

    return this.prisma.$queryRaw<Array<{ period: Date; total: number }>>`
      SELECT ${truncFn} AS period, COUNT(*)::int AS total
      FROM requests
      WHERE created_at BETWEEN ${from} AND ${to}
      GROUP BY period
      ORDER BY period ASC
    `;
  }

  async responseTimeBySector() {
    return this.prisma.$queryRaw<Array<{
      sector_name: string;
      sector_code: string;
      avg_hours_to_receive: number;
      total_received: number;
    }>>`
      SELECT
        s.name AS sector_name,
        s.code AS sector_code,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (rt.received_at - rt.sent_at)) / 3600)::numeric, 2
        ) AS avg_hours_to_receive,
        COUNT(rt.id)::int AS total_received
      FROM request_tramitations rt
      JOIN sectors s ON s.id = rt.to_sector_id
      WHERE rt.received_at IS NOT NULL
      GROUP BY s.id, s.name, s.code
      ORDER BY avg_hours_to_receive ASC
    `;
  }

  async userActivity(limit = 10) {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    return this.prisma.$queryRaw<Array<{
      user_name: string;
      email: string;
      total_actions: number;
    }>>`
      SELECT
        u.name AS user_name,
        u.email,
        COUNT(al.id)::int AS total_actions
      FROM audit_logs al
      JOIN users u ON u.id = al.actor_user_id
      WHERE al.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY u.id, u.name, u.email
      ORDER BY total_actions DESC
      LIMIT ${safeLimit}
    `;
  }

  async overdue() {
    return this.prisma.request.findMany({
      where: {
        deadlineAt: { lt: new Date() },
        status: { notIn: TERMINAL },
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
