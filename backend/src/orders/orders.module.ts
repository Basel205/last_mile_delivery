import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderStatusService } from './order-status.service';
import { RescheduleService } from './reschedule.service';
import { AssignmentModule } from '../assignment/assignment.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AssignmentModule, NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStatusService, RescheduleService],
  exports: [OrdersService, OrderStatusService],
})
export class OrdersModule {}
