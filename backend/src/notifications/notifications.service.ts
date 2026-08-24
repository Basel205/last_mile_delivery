import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private workerInterval: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Background worker: process pending notifications every 30 seconds
    this.workerInterval = setInterval(() => this.processPending(), 30_000);
    this.logger.log('Notification worker started');
  }

  onModuleDestroy() {
    if (this.workerInterval) clearInterval(this.workerInterval);
  }

  /**
   * Enqueue a notification row. Called by OrderStatusService after every status change.
   * Decoupled from the HTTP request cycle — if this write fails, it won't affect the status update.
   */
  async enqueue(orderId: string | null, channel: 'EMAIL' | 'SMS' | 'IN_APP', recipient: string, eventType: string) {
    try {
      await this.prisma.notification.create({
        data: { orderId, channel, recipient, eventType, status: 'PENDING' },
      });
    } catch (e: any) {
      this.logger.error(`Failed to enqueue notification: ${e.message}`);
    }
  }

  /**
   * Process pending notifications. In production, swap the send logic with
   * Nodemailer/Resend for email or Twilio for SMS. The architecture (table + worker) stays the same.
   */
  private async processPending() {
    const pending = await this.prisma.notification.findMany({
      where: { status: 'PENDING', attempts: { lt: 3 } },
      take: 50,
    });

    for (const notification of pending) {
      try {
        await this.send(notification);
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
        });
      } catch (e: any) {
        const attempts = notification.attempts + 1;
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            attempts: { increment: 1 },
            lastError: e.message,
            status: attempts >= 3 ? 'FAILED' : 'PENDING',
          },
        });
      }
    }
  }

  /**
   * Stub send implementation. Swap this function body to use a real email/SMS provider.
   * Architecture around it (table, worker, retry) requires no changes.
   */
  private async send(notification: any) {
    switch (notification.channel) {
      case 'EMAIL':
        this.logger.log(
          `[EMAIL STUB] To: ${notification.recipient} | Event: ${notification.eventType} | OrderId: ${notification.orderId}`
        );
        // Real implementation: await nodemailer.sendMail({ to: notification.recipient, subject: notification.eventType, ... })
        break;
      case 'SMS':
        this.logger.log(
          `[SMS STUB] To: ${notification.recipient} | Event: ${notification.eventType}`
        );
        // Real implementation: await twilioClient.messages.create({ to: notification.recipient, body: ... })
        break;
      case 'IN_APP':
        // In-app notifications are handled by Socket.io; nothing to send here
        break;
    }
  }
}
