import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

export type StockLabel = 'in_stock' | 'low_stock' | 'out_of_stock';
const LOW_STOCK_THRESHOLD = 10;

function stockLabel(qty: number): StockLabel {
  if (qty <= 0) return 'out_of_stock';
  if (qty <= LOW_STOCK_THRESHOLD) return 'low_stock';
  return 'in_stock';
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    const { prices, expiryDate, ...rest } = dto;
    return this.prisma.product.create({
      data: {
        ...rest,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        prices: { create: prices },
      },
      include: { prices: true },
    });
  }

  /**
   * Public catalog listing. When a customer category is supplied, each product
   * is returned with the price for that category and a real-time stock label.
   */
  async list(opts: { category?: string; inStockOnly?: boolean; customerCategory?: CustomerCategory }) {
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };
    if (opts.category) where.category = opts.category;
    if (opts.inStockOnly) where.stockQty = { gt: 0 };

    const products = await this.prisma.product.findMany({
      where,
      include: { prices: true },
      orderBy: { name: 'asc' },
    });

    return products.map((p) => this.decorate(p, opts.customerCategory));
  }

  async findOne(id: string, customerCategory?: CustomerCategory) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { prices: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.decorate(product, customerCategory);
  }

  async update(id: string, dto: UpdateProductDto) {
    const { prices, expiryDate, ...rest } = dto;
    await this.ensureExists(id);

    if (prices) {
      // Upsert each category price.
      await Promise.all(
        prices.map((pr) =>
          this.prisma.productPrice.upsert({
            where: { productId_category: { productId: id, category: pr.category } },
            create: { productId: id, category: pr.category, price: pr.price },
            update: { price: pr.price },
          }),
        ),
      );
    }

    return this.prisma.product.update({
      where: { id },
      data: { ...rest, expiryDate: expiryDate ? new Date(expiryDate) : undefined },
      include: { prices: true },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    // Soft-deactivate rather than hard-delete (preserves order history references).
    return this.prisma.product.update({ where: { id }, data: { status: 'INACTIVE' } });
  }

  private decorate(
    product: Prisma.ProductGetPayload<{ include: { prices: true } }>,
    customerCategory?: CustomerCategory,
  ) {
    const priceForCategory = customerCategory
      ? product.prices.find((p) => p.category === customerCategory)?.price ?? null
      : null;
    return {
      ...product,
      stockLabel: stockLabel(product.stockQty),
      orderable: product.stockQty > 0 && product.status === 'ACTIVE',
      priceForCategory,
    };
  }

  private async ensureExists(id: string) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Product not found');
  }
}
