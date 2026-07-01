import { Injectable } from '@nestjs/common';
import { StockAdjustmentReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  byWarehouse(warehouseId: string) {
    return this.prisma.inventory.findMany({
      where: { warehouseId },
      include: { product: true },
    });
  }

  /** Real-time availability check across all warehouses (Purchase view). */
  async availability(productId: string) {
    const rows = await this.prisma.inventory.findMany({ where: { productId } });
    const onHand = rows.reduce((s, r) => s + r.quantityOnHand, 0);
    return { productId, onHand, belowReorder: rows.some((r) => r.quantityOnHand <= r.reorderPoint) };
  }

  /** Log a stock adjustment (damage/expiry/stocktake) and reflect it in inventory + product stock. */
  async adjust(params: {
    productId: string;
    warehouseId: string;
    quantityChange: number;
    reason: StockAdjustmentReason;
    adjustedById?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.create({ data: params });

      await tx.inventory.upsert({
        where: { warehouseId_productId: { warehouseId: params.warehouseId, productId: params.productId } },
        create: {
          warehouseId: params.warehouseId,
          productId: params.productId,
          quantityOnHand: Math.max(0, params.quantityChange),
        },
        update: { quantityOnHand: { increment: params.quantityChange } },
      });

      await tx.product.update({
        where: { id: params.productId },
        data: { stockQty: { increment: params.quantityChange } },
      });

      return adjustment;
    });
  }

  /** Initiate a stock transfer between warehouses. */
  transfer(params: {
    productId: string;
    quantity: number;
    fromWarehouseId: string;
    toWarehouseId: string;
    initiatedById?: string;
  }) {
    return this.prisma.stockTransfer.create({ data: params });
  }

  async receiveTransfer(id: string, receivedById?: string) {
    const transfer = await this.prisma.stockTransfer.update({
      where: { id },
      data: { status: 'RECEIVED', receivedById },
    });
    await this.prisma.$transaction([
      this.prisma.inventory.upsert({
        where: {
          warehouseId_productId: {
            warehouseId: transfer.toWarehouseId,
            productId: transfer.productId,
          },
        },
        create: {
          warehouseId: transfer.toWarehouseId,
          productId: transfer.productId,
          quantityOnHand: transfer.quantity,
        },
        update: { quantityOnHand: { increment: transfer.quantity } },
      }),
      this.prisma.inventory.updateMany({
        where: { warehouseId: transfer.fromWarehouseId, productId: transfer.productId },
        data: { quantityOnHand: { decrement: transfer.quantity } },
      }),
    ]);
    return transfer;
  }
}
