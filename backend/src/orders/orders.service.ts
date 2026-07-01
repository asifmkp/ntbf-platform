import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlaceOrderDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Customer places an order: prices resolved by the customer's category, stock checked & decremented. */
  async place(userId: string, dto: PlaceOrderDto) {
    const profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
      include: { creditTerm: true },
    });
    if (!profile) throw new ForbiddenException('Only customers can place orders');
    if (profile.creditTerm?.accountStatus === 'ON_HOLD') {
      throw new ForbiddenException('Account is on hold (bounced cheque) — no new orders until recovery');
    }
    if (!dto.items.length) throw new BadRequestException('Order has no items');

    const order = await this.prisma.$transaction(async (tx) => {
      const lines: Prisma.OrderItemCreateManyOrderInput[] = [];
      let total = new Prisma.Decimal(0);

      for (const line of dto.items) {
        const product = await tx.product.findUnique({
          where: { id: line.productId },
          include: { prices: true },
        });
        if (!product || product.status !== 'ACTIVE') {
          throw new BadRequestException(`Product ${line.productId} unavailable`);
        }
        if (product.stockQty < line.quantity) {
          throw new BadRequestException(`Insufficient stock for ${product.name}`);
        }
        const priceRow = product.prices.find((p) => p.category === profile.category);
        if (!priceRow) {
          throw new BadRequestException(`No ${profile.category} price set for ${product.name}`);
        }

        const subtotal = priceRow.price.mul(line.quantity);
        total = total.add(subtotal);
        lines.push({
          productId: product.id,
          quantity: line.quantity,
          unitPrice: priceRow.price,
          subtotal,
        });

        await tx.product.update({
          where: { id: product.id },
          data: { stockQty: { decrement: line.quantity } },
        });
      }

      // Default expected delivery: next day.
      const expected = new Date();
      expected.setDate(expected.getDate() + 1);

      // Auto-assign driver from the delivery address's zone (TRD §4.5/§4.8).
      let assignedDriverId: string | undefined;
      if (dto.addressId) {
        const address = await tx.customerAddress.findUnique({
          where: { id: dto.addressId },
          include: { zone: true },
        });
        assignedDriverId = address?.zone?.assignedDriverId ?? undefined;
      }

      const created = await tx.order.create({
        data: {
          customerId: profile.id,
          addressId: dto.addressId,
          paymentMethod: dto.paymentMethod,
          totalAmount: total,
          expectedDeliveryDate: expected,
          assignedDriverId,
          items: { createMany: { data: lines } },
        },
        include: { items: true },
      });

      // Generate invoice immediately.
      await tx.invoice.create({
        data: {
          orderId: created.id,
          invoiceNo: `INV-${created.id.slice(0, 8).toUpperCase()}`,
          totalAmount: total,
          dueDate: profile.creditTerm
            ? this.addDays(new Date(), profile.creditTerm.creditPeriodDays)
            : expected,
          paymentTerms: profile.creditTerm
            ? `${profile.creditTerm.creditPeriodDays} days`
            : 'On delivery',
        },
      });

      return created;
    });

    await this.notifications.send(userId, 'ORDER_PLACED', {
      orderId: order.id,
      expectedDeliveryDate: order.expectedDeliveryDate,
    });

    return order;
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, invoice: true, delivery: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Customer-facing tracking: once OUT_FOR_DELIVERY, exposes driver + live GPS + ETA. */
  async tracking(id: string) {
    const order = await this.findOne(id);
    let driver: { name: string; vehicle?: string; lat: number | null; lng: number | null } | null =
      null;
    if (order.status === 'OUT_FOR_DELIVERY' && order.assignedDriverId) {
      const d = await this.prisma.driver.findUnique({
        where: { id: order.assignedDriverId },
        include: { user: true, assignedVehicle: true },
      });
      if (d) {
        driver = {
          name: d.user.name,
          vehicle: d.assignedVehicle?.registrationNo,
          lat: d.currentLat,
          lng: d.currentLng,
        };
      }
    }
    return {
      orderId: order.id,
      status: order.status,
      expectedDeliveryDate: order.expectedDeliveryDate,
      eta: order.delivery?.eta ?? null,
      driver,
    };
  }

  async history(userId: string) {
    const profile = await this.prisma.customerProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Not a customer');
    return this.prisma.order.findMany({
      where: { customerId: profile.id },
      include: { invoice: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin/driver status update. Marking DELIVERED triggers the customer push notification. */
  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status,
        deliveredNotificationSent: status === 'DELIVERED' ? true : order.deliveredNotificationSent,
      },
    });

    if (status === 'DELIVERED' && !order.deliveredNotificationSent) {
      await this.notifications.send(order.customer.userId, 'ORDER_DELIVERED', { orderId: id });
    }
    return updated;
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
}
