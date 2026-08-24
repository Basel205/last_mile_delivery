import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RescheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async requestReschedule(orderId: string, newDate: Date, requestedBy: string, actorRole: 'CUSTOMER' | 'ADMIN') {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new BadRequestException('Order not found');
      if (order.status !== 'FAILED') throw new BadRequestException('Order must be in FAILED status to reschedule');

      if (actorRole === 'CUSTOMER' && order.deliveryAttempts >= 3) {
        throw new BadRequestException('Max delivery attempts reached. Contact support.');
      }

      const today = new Date();
      today.setHours(0,0,0,0);
      if (newDate < today) throw new BadRequestException('Cannot reschedule to a past date');

      const result = await tx.order.updateMany({
        where: { id: orderId, statusVersion: order.statusVersion },
        data: {
          status: 'RESCHEDULED',
          scheduledDeliveryDate: newDate,
          statusVersion: { increment: 1 }
        }
      });

      if (result.count === 0) throw new BadRequestException('Concurrent modification detected');

      await tx.rescheduleRequest.create({
        data: {
          orderId,
          previousScheduledDate: order.scheduledDeliveryDate,
          newScheduledDate: newDate,
          requestedBy
        }
      });

      await tx.orderTrackingEvent.create({
        data: {
          orderId,
          status: 'RESCHEDULED',
          actorId: requestedBy,
          actorRole,
          note: `Rescheduled for ${newDate.toISOString().split('T')[0]}`
        }
      });

      // Assignment will be triggered asynchronously or here
      return tx.order.findUnique({ where: { id: orderId } });
    });
  }
}
