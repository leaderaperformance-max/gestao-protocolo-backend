import { Injectable } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
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
    const requests = await this.prisma.request.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    });

    const buckets = new Map<string, number>();
    for (const r of requests) {
      const d = new Date(r.createdAt);
      let key: string;
      if (granularity === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      } else if (granularity === 'week') {
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((day + 6) % 7));
        key = monday.toISOString().slice(0, 10);
      } else {
        key = d.toISOString().slice(0, 10);
      }
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return Array.from(buckets.entries())
      .map(([period, total]) => ({ period, total }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  async responseTimeBySector() {
    const tramitations = await this.prisma.requestTramitation.findMany({
      where: { receivedAt: { not: null } },
      select: {
        sentAt: true,
        receivedAt: true,
        toSector: { select: { name: true, code: true } },
      },
    });

    const sectorMap = new Map<string, { name: string; code: string; totalHours: number; count: number }>();
    for (const t of tramitations) {
      if (!t.receivedAt || !t.sentAt) continue;
      const key = t.toSector.code;
      const hours = (t.receivedAt.getTime() - t.sentAt.getTime()) / (1000 * 60 * 60);
      const existing = sectorMap.get(key);
      if (existing) {
        existing.totalHours += hours;
        existing.count += 1;
      } else {
        sectorMap.set(key, { name: t.toSector.name, code: t.toSector.code, totalHours: hours, count: 1 });
      }
    }

    return Array.from(sectorMap.values())
      .map((s) => ({
        sector_name: s.name,
        sector_code: s.code,
        avg_hours_to_receive: Math.round((s.totalHours / s.count) * 100) / 100,
        total_received: s.count,
      }))
      .sort((a, b) => a.avg_hours_to_receive - b.avg_hours_to_receive);
  }

  async userActivity(limit = 10) {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const logs = await this.prisma.auditLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { actorUserId: true },
    });

    const countMap = new Map<string, number>();
    for (const log of logs) {
      if (!log.actorUserId) continue;
      countMap.set(log.actorUserId, (countMap.get(log.actorUserId) ?? 0) + 1);
    }

    const topUsers = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, safeLimit);

    if (topUsers.length === 0) return [];

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validIds = topUsers.filter(([id]) => uuidRegex.test(id)).map(([id]) => id);

    const users = await this.prisma.user.findMany({
      where: { id: { in: validIds } },
      select: { id: true, name: true, email: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    return topUsers.map(([id, count]) => ({
      user_name: userMap.get(id)?.name ?? 'Desconhecido',
      email: userMap.get(id)?.email ?? '',
      total_actions: count,
    }));
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
