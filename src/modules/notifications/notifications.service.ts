import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateNotificationData {
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
