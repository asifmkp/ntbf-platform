import { Body, Controller, Get, Module, Param, Patch, Post, Query, Injectable } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessLevel, Department } from '@prisma/client';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Departments, MinAccessLevel } from '../common/decorators/access.decorator';

class SpecialPriceDto { @IsString() customerId: string; @IsString() productId: string; @IsNumber() requestedPrice: number; @IsNumber() standardPrice: number; @IsOptional() @IsString() reason?: string; }
class VisitDto { @IsString() customerId: string; @IsOptional() @IsNumber() gpsLat?: number; @IsOptional() @IsNumber() gpsLng?: number; @IsOptional() @IsString() notes?: string; }

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  submitSpecialPrice(userId: string, dto: SpecialPriceDto) {
    return this.prisma.specialPriceRequest.create({ data: { ...dto, requestedById: userId } });
  }
  decideSpecialPrice(id: string, approve: boolean, approverId: string, validUntil?: string) {
    return this.prisma.specialPriceRequest.update({
      where: { id },
      data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: approverId, validFrom: approve ? new Date() : undefined, validUntil: validUntil ? new Date(validUntil) : undefined },
    });
  }

  logVisit(userId: string, dto: VisitDto) {
    return this.prisma.customerVisit.create({
      data: { customerId: dto.customerId, salesmanId: userId, checkInTime: new Date(), gpsLat: dto.gpsLat, gpsLng: dto.gpsLng, notes: dto.notes },
    });
  }
  visits(salesmanId?: string, date?: string) {
    const where: any = {};
    if (salesmanId) where.salesmanId = salesmanId;
    if (date) { const d = new Date(date); const n = new Date(d); n.setDate(n.getDate() + 1); where.visitDate = { gte: d, lt: n }; }
    return this.prisma.customerVisit.findMany({ where, orderBy: { visitDate: 'desc' } });
  }

  async dailyReport(date?: string) {
    const d = date ? new Date(date) : new Date(); d.setHours(0, 0, 0, 0);
    const n = new Date(d); n.setDate(n.getDate() + 1);
    const orders = await this.prisma.order.findMany({ where: { createdAt: { gte: d, lt: n }, status: { not: 'CANCELLED' } }, include: { customer: true } });
    const revenue = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
    return { date: d.toISOString().slice(0, 10), orderCount: orders.length, revenue, avgOrderValue: orders.length ? revenue / orders.length : 0, orders };
  }
  async monthlyReport(month?: string) {
    const base = month ? new Date(month + '-01') : new Date();
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const orders = await this.prisma.order.findMany({ where: { createdAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } } });
    const revenue = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
    return { month: start.toISOString().slice(0, 7), orderCount: orders.length, revenue };
  }
  async byCustomer() {
    const orders = await this.prisma.order.findMany({ where: { status: { not: 'CANCELLED' } }, include: { customer: true } });
    const map: Record<string, { customer: string; orders: number; revenue: number }> = {};
    orders.forEach((o) => { const k = o.customerId; map[k] = map[k] || { customer: o.customer.businessName, orders: 0, revenue: 0 }; map[k].orders++; map[k].revenue += Number(o.totalAmount); });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }
  async productPerformance() {
    const items = await this.prisma.orderItem.findMany({ include: { product: true } });
    const map: Record<string, { product: string; qty: number; revenue: number }> = {};
    items.forEach((i) => { const k = i.productId; map[k] = map[k] || { product: i.product.name, qty: 0, revenue: 0 }; map[k].qty += i.quantity; map[k].revenue += Number(i.subtotal); });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }
}

@ApiTags('Sales')
@ApiBearerAuth()
@Controller()
export class SalesController {
  constructor(private readonly svc: SalesService) {}

  @Departments(Department.SALES)
  @Post('special-price-requests')
  submitSpecial(@CurrentUser('id') uid: string, @Body() dto: SpecialPriceDto) { return this.svc.submitSpecialPrice(uid, dto); }

  @Departments(Department.SALES)
  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch('special-price-requests/:id/approve')
  decideSpecial(@Param('id') id: string, @Body('approve') approve: boolean, @Body('validUntil') validUntil: string, @CurrentUser('id') uid: string) { return this.svc.decideSpecialPrice(id, approve ?? true, uid, validUntil); }

  @Departments(Department.SALES)
  @Post('visits')
  logVisit(@CurrentUser('id') uid: string, @Body() dto: VisitDto) { return this.svc.logVisit(uid, dto); }

  @Departments(Department.SALES, Department.MANAGEMENT)
  @Get('visits')
  visits(@Query('salesman') s?: string, @Query('date') d?: string) { return this.svc.visits(s, d); }

  @Departments(Department.SALES, Department.MANAGEMENT, Department.FINANCE)
  @Get('reports/sales/daily')
  daily(@Query('date') date?: string) { return this.svc.dailyReport(date); }

  @Departments(Department.SALES, Department.MANAGEMENT, Department.FINANCE)
  @Get('reports/sales/monthly')
  monthly(@Query('month') month?: string) { return this.svc.monthlyReport(month); }

  @Departments(Department.SALES, Department.MANAGEMENT, Department.FINANCE)
  @Get('reports/sales/by-customer')
  byCustomer() { return this.svc.byCustomer(); }

  @Departments(Department.SALES, Department.MANAGEMENT, Department.FINANCE)
  @Get('reports/sales/product-performance')
  productPerf() { return this.svc.productPerformance(); }
}

@Module({ controllers: [SalesController], providers: [SalesService] })
export class SalesModule {}
