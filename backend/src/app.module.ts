import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ZonesModule } from './zones/zones.module';
import { RateCardsModule } from './rate-cards/rate-cards.module';
import { OrdersModule } from './orders/orders.module';
import { AssignmentModule } from './assignment/assignment.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    PrismaModule,
    AdminModule,
    AuthModule, 
    UsersModule, 
    ZonesModule, 
    RateCardsModule, 
    OrdersModule, 
    AssignmentModule, 
    NotificationsModule, 
    RealtimeModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
