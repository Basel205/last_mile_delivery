import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrderStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private readonly TRANSITIONS: Record<string, string[]> = {
    CREATED:          ['PICKED_UP', 'CANCELLED'],
    PICKED_UP:        ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT:       ['OUT_FOR_DELIVERY', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED', 'CANCELLED'],
    FAILED:           ['RESCHEDULED'],
    RESCHEDULED:      ['PICKED_UP'],
    DELIVERED:        [],
    CANCELLED:        [],
  };

  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    actorId: string,
    actorRole: 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SYSTEM',
    note?: string,
    lat?: number,
    lng?: number,
    cancellationReason?: string,
  ) {
    const order = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { customer: { select: { email: true, name: true } } },
      });
      if (!order) throw new BadRequestException('Order not found');

      // Idempotency: if already at this status, no-op
      if (order.status === newStatus) return order;

      // State machine check (admin can override)
      if (actorRole !== 'ADMIN') {
        const allowed = this.TRANSITIONS[order.status] || [];
        if (!allowed.includes(newStatus as string)) {
          throw new BadRequestException(`Invalid transition from ${order.status} to ${newStatus}`);
        }
      }

      if (newStatus === 'CANCELLED') {
        if (!cancellationReason) throw new BadRequestException('cancellationReason is required');
        if (actorRole === 'CUSTOMER' && order.status !== 'CREATED') {
          throw new BadRequestException('Customers can only cancel before pickup');
        }
      }

      if (newStatus === 'FAILED' && !note) {
        throw new BadRequestException('note is required for FAILED status');
      }

      const updateData: any = { status: newStatus, statusVersion: { increment: 1 } };
      if (newStatus === 'CANCELLED') updateData.cancellationReason = cancellationReason;
      if (newStatus === 'FAILED') updateData.deliveryAttempts = { increment: 1 };

      // Optimistic locking
      const result = await tx.order.updateMany({
        where: { id: orderId, statusVersion: order.statusVersion },
        data: updateData,
      });

      if (result.count === 0) throw new ConflictException('Status was updated concurrently — please refresh and retry');

      const updatedOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { customer: { select: { email: true, name: true } } },
      });

      await tx.orderTrackingEvent.create({
        data: { orderId, status: newStatus, actorId, actorRole, note, latitude: lat, longitude: lng },
      });

      // Agent auto-flip back to AVAILABLE when last active order closes
      if (updatedOrder!.assignedAgentId && ['DELIVERED', 'FAILED', 'CANCELLED'].includes(newStatus)) {
        const agent = await tx.agent.findUnique({ where: { id: updatedOrder!.assignedAgentId } });
        if (agent) {
          const activeCount = await tx.order.count({
            where: { assignedAgentId: agent.id, status: { notIn: ['DELIVERED', 'FAILED', 'CANCELLED'] } },
          });
          if (activeCount < agent.maxConcurrentOrders && agent.status !== 'AVAILABLE') {
            await tx.agent.update({ where: { id: agent.id }, data: { status: 'AVAILABLE' } });
          }
        }
      }

      return updatedOrder!;
    });

    // Enqueue email notification AFTER transaction commits
    if (order.customer?.email) {
      this.notificationsService.enqueue(
        orderId,
        'EMAIL',
        order.customer.email,
        `ORDER_${newStatus}`,
      ).catch(() => {});
    }

    return order;
  }
}
