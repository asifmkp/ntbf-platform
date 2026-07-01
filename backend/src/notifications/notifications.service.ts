import { Injectable, Logger } from '@nestjs/common';

export type NotificationType =
  | 'ORDER_PLACED'
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_DELIVERED'
  | 'PAYMENT_DUE'
  | 'FLEET_RENEWAL_DUE';

/**
 * Push notification dispatch (TRD: Firebase Cloud Messaging).
 * Stubbed to logging for now; swap `deliver()` for the FCM Admin SDK call.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async send(userId: string, type: NotificationType, payload: Record<string, unknown>) {
    return this.deliver(userId, type, payload);
  }

  private async deliver(userId: string, type: NotificationType, payload: Record<string, unknown>) {
    this.logger.log(`[FCM] -> user=${userId} type=${type} ${JSON.stringify(payload)}`);
    return { delivered: true, userId, type };
  }
}
