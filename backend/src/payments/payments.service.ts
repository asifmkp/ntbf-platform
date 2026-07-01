import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RecordPaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  private readonly bounceCharge: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.bounceCharge = Number(config.get('CHEQUE_BOUNCE_CHARGE') ?? 250);
  }

  /** Record COD/cheque collection at delivery. */
  async record(collectorId: string, dto: RecordPaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { invoice: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.payment.create({
      data: {
        orderId: dto.orderId,
        invoiceId: order.invoice?.id,
        method: dto.method,
        amount: dto.amount,
        chequeNo: dto.chequeNo,
        chequeDate: dto.chequeDate ? new Date(dto.chequeDate) : undefined,
        status: 'COLLECTED',
        collectedById: collectorId,
        collectedAt: new Date(),
      },
    });
  }

  /**
   * Mark a cheque cleared or bounced.
   * On bounce: apply fixed bounce charge, assign Sales recovery, place the
   * customer account ON_HOLD (no new orders).
   */
  async clearCheque(paymentId: string, cleared: boolean) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { customer: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (cleared) {
      return this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'CLEARED' },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'BOUNCED',
          bounceCharge: this.bounceCharge,
          recoveryOwner: 'SALES',
        },
      });

      const customerId = payment.order?.customer.id;
      if (customerId) {
        await tx.creditTerm.upsert({
          where: { customerId },
          create: { customerId, accountStatus: 'ON_HOLD' },
          update: { accountStatus: 'ON_HOLD' },
        });
      }
      return updated;
    });
  }

  /** Sales marks a bounced payment recovered → auto-release the account hold. */
  async recover(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { customer: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'RECOVERED' },
      });
      const customerId = payment.order?.customer.id;
      if (customerId) {
        await tx.creditTerm.updateMany({
          where: { customerId },
          data: { accountStatus: 'ACTIVE' },
        });
      }
      return updated;
    });
  }

  async receipt(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true, invoice: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return {
      receiptNo: `RCPT-${payment.id.slice(0, 8).toUpperCase()}`,
      method: payment.method,
      amount: payment.amount,
      orderId: payment.orderId,
      invoiceNo: payment.invoice?.invoiceNo,
      collectedAt: payment.collectedAt,
    };
  }
}
