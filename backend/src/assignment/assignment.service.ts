import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async autoAssign(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'CREATED' || order.assignedAgentId) {
      this.logger.log(`Skipping assignment for order ${orderId} - not eligible`);
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Fetch candidates with active order count
        // Note: Prisma raw query is required to do FOR UPDATE gracefully and get aggregate counts
        const candidates: any[] = await tx.$queryRaw`
          SELECT a.id, a.zone_id, a."current_lat", a."current_lng", a.max_concurrent_orders,
                 (SELECT COUNT(*) FROM orders o WHERE o.assigned_agent_id = a.id AND o.status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED')) as active_orders
          FROM agents a
          WHERE a.status = 'AVAILABLE'
        `;

        if (candidates.length === 0) {
          this.logger.log(`No available agents for order ${orderId}`);
          return;
        }

        // Filter out agents at capacity
        const eligible = candidates.filter(c => Number(c.active_orders) < c.max_concurrent_orders);
        if (eligible.length === 0) {
          this.logger.log(`All available agents are at capacity for order ${orderId}`);
          return;
        }

        // Rank candidates
        // 1. Same zone
        // 2. Fewest active orders
        // (Skipping Haversine distance for simplicity if coordinates are null)
        eligible.sort((a, b) => {
          const aSameZone = a.zone_id === order.pickupZoneId ? 1 : 0;
          const bSameZone = b.zone_id === order.pickupZoneId ? 1 : 0;
          
          if (aSameZone !== bSameZone) return bSameZone - aSameZone;
          
          return Number(a.active_orders) - Number(b.active_orders);
        });

        const topAgent = eligible[0];

        // Concurrency guard: SELECT ... FOR UPDATE on the chosen agent
        const lockedAgent: any[] = await tx.$queryRaw`
          SELECT id, status, max_concurrent_orders,
                 (SELECT COUNT(*) FROM orders o WHERE o.assigned_agent_id = id AND o.status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED')) as active_orders
          FROM agents
          WHERE id = ${topAgent.id}::uuid
          FOR UPDATE
        `;

        if (!lockedAgent || lockedAgent.length === 0 || lockedAgent[0].status !== 'AVAILABLE' || Number(lockedAgent[0].active_orders) >= lockedAgent[0].max_concurrent_orders) {
          // The agent was taken or went offline concurrently.
          // Throwing will rollback this attempt, and the caller could retry or leave it unassigned.
          throw new Error('Concurrent assignment conflict - agent no longer eligible');
        }

        // Assign the agent
        const updatedOrder = await tx.order.update({
          where: { id: orderId, statusVersion: order.statusVersion },
          data: {
            assignedAgentId: topAgent.id,
            assignmentType: 'AUTO',
            statusVersion: { increment: 1 }
          }
        });

        await tx.orderTrackingEvent.create({
          data: {
            orderId: orderId,
            status: updatedOrder.status,
            actorRole: 'SYSTEM',
            note: `Auto-assigned to agent ${topAgent.id}`,
          }
        });

        // Flip status to ON_DELIVERY if they hit capacity
        if (Number(lockedAgent[0].active_orders) + 1 >= lockedAgent[0].max_concurrent_orders) {
          await tx.agent.update({
            where: { id: topAgent.id },
            data: { status: 'ON_DELIVERY' }
          });
        }

        this.logger.log(`Order ${orderId} auto-assigned to ${topAgent.id}`);
      });
    } catch (e: any) {
      this.logger.warn(`Auto-assignment failed for order ${orderId}: ${e.message}`);
    }
  }
}
