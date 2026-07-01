import { Body, Controller, Get, Module, Param, Patch, Post, Injectable, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Department, UserRole } from '@prisma/client';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Departments, Roles } from '../common/decorators/access.decorator';

class ZoneDto { @IsString() name: string; @IsOptional() @IsString() areaBoundary?: string; @IsOptional() @IsString() assignedDriverId?: string; }
class VehicleDto { @IsString() registrationNo: string; @IsOptional() @IsString() makeModel?: string; @IsOptional() @IsString() capacity?: string; @IsOptional() @IsString() assignedDriverId?: string; }
class LocationDto { @IsNumber() lat: number; @IsNumber() lng: number; }
class ServiceRecordDto { @IsString() serviceDate: string; @IsOptional() @IsString() serviceType?: string; @IsOptional() @IsNumber() cost?: number; @IsOptional() @IsNumber() mileageAtService?: number; }
class SalesReturnDto { @IsString() orderId: string; itemsReturned: any[]; }
class EodDto { @IsString() date: string; }

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  createZone(dto: ZoneDto) { return this.prisma.deliveryZone.create({ data: dto }); }
  createVehicle(dto: VehicleDto) {
    const { assignedDriverId, ...rest } = dto;
    return this.prisma.vehicle.create({ data: { ...rest, ...(assignedDriverId ? { driver: { connect: { id: assignedDriverId } } } : {}) } });
  }
  updateVehicle(id: string, data: any) {
    const dates = ['insuranceExpiryDate', 'registrationExpiryDate', 'nextServiceDueDate', 'lastServiceDate'];
    dates.forEach((k) => { if (data[k]) data[k] = new Date(data[k]); });
    return this.prisma.vehicle.update({ where: { id }, data });
  }
  addServiceRecord(vehicleId: string, dto: ServiceRecordDto) {
    return this.prisma.vehicleServiceRecord.create({ data: { vehicleId, serviceDate: new Date(dto.serviceDate), serviceType: dto.serviceType, cost: dto.cost ?? 0, mileageAtService: dto.mileageAtService } });
  }
  async renewalsDue() {
    const soon = new Date(); soon.setDate(soon.getDate() + 30);
    return this.prisma.vehicle.findMany({
      where: { OR: [{ insuranceExpiryDate: { lte: soon } }, { registrationExpiryDate: { lte: soon } }, { nextServiceDueDate: { lte: soon } }] },
    });
  }

  updateDriverLocation(driverId: string, dto: LocationDto) {
    return this.prisma.driver.update({ where: { id: driverId }, data: { currentLat: dto.lat, currentLng: dto.lng } });
  }

  /** Auto-sequence a driver's pending stops nearest-km-first from current GPS (TRD §4.8). */
  async optimizeRoute(driverId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    let cur = { lat: driver.currentLat ?? 25.4052, lng: driver.currentLng ?? 55.5136 };
    const deliveries = await this.prisma.delivery.findMany({
      where: { driverId, status: 'PENDING' },
      include: { order: { include: { address: true } } },
    });
    const stops = deliveries.map((d) => ({ id: d.id, orderId: d.orderId, lat: d.order.address?.lat ?? cur.lat, lng: d.order.address?.lng ?? cur.lng }));
    const seq: any[] = [];
    while (stops.length) {
      let bi = 0, bd = Infinity;
      stops.forEach((s, i) => { const dist = km(cur, s); if (dist < bd) { bd = dist; bi = i; } });
      const n = stops.splice(bi, 1)[0];
      seq.push({ ...n, distanceKm: Math.round(bd * 10) / 10, stopSequence: seq.length + 1 });
      cur = n;
    }
    // persist sequence
    await Promise.all(seq.map((s) => this.prisma.delivery.update({ where: { id: s.id }, data: { stopSequence: s.stopSequence, distanceToStopKm: s.distanceKm } })));
    return seq;
  }

  verifyLoad(dispatchId: string) {
    return this.prisma.dispatchRecord.update({ where: { id: dispatchId }, data: { dispatchStatus: 'READY_FOR_PICKUP' } });
  }
  dispatchOrder(orderId: string, userId: string) {
    return this.prisma.dispatchRecord.upsert({
      where: { orderId }, create: { orderId, pickedById: userId, dispatchStatus: 'PACKED' }, update: { dispatchStatus: 'PACKED', packedById: userId, dispatchedAt: new Date() },
    });
  }

  salesReturn(driverId: string, dto: SalesReturnDto) {
    return this.prisma.salesReturn.create({ data: { orderId: dto.orderId, driverId, itemsReturned: dto.itemsReturned } });
  }

  async eodReport(driverId: string, dto: EodDto) {
    const payments = await this.prisma.payment.findMany({ where: { collectedById: driverId } });
    const cash = payments.filter((p) => p.method === 'CASH_ON_DELIVERY').reduce((s, p) => s + Number(p.amount), 0);
    const cheque = payments.filter((p) => p.method === 'CHEQUE_ON_DELIVERY').reduce((s, p) => s + Number(p.amount), 0);
    const delivered = await this.prisma.delivery.count({ where: { driverId, status: 'DELIVERED' } });
    return this.prisma.endOfDayReport.create({ data: { driverId, date: new Date(dto.date), totalDelivered: delivered, totalCashCollected: cash, totalChequeCollected: cheque } });
  }
  submitEodToFinance(reportId: string) {
    return this.prisma.endOfDayReport.update({ where: { id: reportId }, data: { submittedToFinance: true } });
  }

  pendingDeliveries() { return this.prisma.delivery.findMany({ where: { status: 'PENDING' }, include: { order: true } }); }
  deliveredOrders() { return this.prisma.delivery.findMany({ where: { status: 'DELIVERED' }, include: { order: true } }); }
  failedDeliveries() { return this.prisma.delivery.findMany({ where: { status: 'FAILED' }, include: { order: true } }); }
}

@ApiTags('Delivery & Fleet')
@ApiBearerAuth()
@Controller()
export class DeliveryController {
  constructor(private readonly svc: DeliveryService) {}

  @Departments(Department.DELIVERY, Department.MANAGEMENT)
  @Post('zones')
  createZone(@Body() dto: ZoneDto) { return this.svc.createZone(dto); }

  @Departments(Department.DELIVERY, Department.MANAGEMENT)
  @Post('vehicles')
  createVehicle(@Body() dto: VehicleDto) { return this.svc.createVehicle(dto); }

  @Departments(Department.DELIVERY, Department.MANAGEMENT)
  @Patch('vehicles/:id')
  updateVehicle(@Param('id') id: string, @Body() data: any) { return this.svc.updateVehicle(id, data); }

  @Departments(Department.DELIVERY, Department.MANAGEMENT)
  @Post('vehicles/:id/service-records')
  addService(@Param('id') id: string, @Body() dto: ServiceRecordDto) { return this.svc.addServiceRecord(id, dto); }

  @Departments(Department.DELIVERY, Department.MANAGEMENT)
  @Get('vehicles/renewals-due')
  renewals() { return this.svc.renewalsDue(); }

  @Roles(UserRole.DRIVER)
  @Patch('drivers/:id/location')
  location(@Param('id') id: string, @Body() dto: LocationDto) { return this.svc.updateDriverLocation(id, dto); }

  @Get('routes/:driverId/optimize')
  optimize(@Param('driverId') id: string) { return this.svc.optimizeRoute(id); }

  @Roles(UserRole.DRIVER)
  @Post('dispatch/:id/verify-load')
  verifyLoad(@Param('id') id: string) { return this.svc.verifyLoad(id); }

  @Departments(Department.WAREHOUSE)
  @Post('orders/:id/dispatch')
  dispatch(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.svc.dispatchOrder(id, uid); }

  @Roles(UserRole.DRIVER)
  @Post('sales-returns')
  salesReturn(@CurrentUser('id') uid: string, @Body() dto: SalesReturnDto) { return this.svc.salesReturn(uid, dto); }

  @Roles(UserRole.DRIVER)
  @Post('drivers/:id/eod-report')
  eod(@Param('id') id: string, @Body() dto: EodDto) { return this.svc.eodReport(id, dto); }

  @Roles(UserRole.DRIVER)
  @Post('drivers/:id/eod-report/submit-finance')
  eodSubmit(@Body('reportId') reportId: string) { return this.svc.submitEodToFinance(reportId); }

  @Departments(Department.DELIVERY, Department.MANAGEMENT)
  @Get('deliveries/pending')
  pending() { return this.svc.pendingDeliveries(); }

  @Departments(Department.DELIVERY, Department.MANAGEMENT)
  @Get('deliveries/delivered')
  delivered() { return this.svc.deliveredOrders(); }

  @Departments(Department.DELIVERY, Department.MANAGEMENT)
  @Get('deliveries/failed')
  failed() { return this.svc.failedDeliveries(); }
}

@Module({ controllers: [DeliveryController], providers: [DeliveryService] })
export class DeliveryModule {}
