import { Body, Controller, Get, Module, Param, Patch, Post, Query, Injectable, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessLevel, Department } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Departments, MinAccessLevel } from '../common/decorators/access.decorator';
import {
  CreateGrnDto,
  CreatePurchaseOrderDto,
  CreateQuotationDto,
  CreateRequisitionDto,
  CreateSupplierDto,
  CreateSupplierInvoiceDto,
  UpdateSupplierDto,
} from './dto/procurement.dto';

@Injectable()
export class ProcurementService {
  constructor(private readonly prisma: PrismaService) {}

  // suppliers
  createSupplier(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: { ...dto, productsSupplied: dto.productsSupplied ?? [] } });
  }
  listSuppliers(product?: string, rating?: string) {
    return this.prisma.supplier.findMany({
      where: { status: 'ACTIVE', ...(rating ? { rating: { gte: Number(rating) } } : {}) },
      orderBy: { rating: 'desc' },
    });
  }
  updateSupplier(id: string, dto: UpdateSupplierDto) {
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  // requisitions
  createRequisition(userId: string, dto: CreateRequisitionDto) {
    return this.prisma.purchaseRequisition.create({
      data: { requestedById: userId, sourceDepartment: dto.sourceDepartment, items: dto.items as any },
    });
  }
  approveRequisition(id: string, approverId: string) {
    return this.prisma.purchaseRequisition.update({ where: { id }, data: { status: 'APPROVED', approvedById: approverId } });
  }

  // quotations
  addQuotation(requisitionId: string, dto: CreateQuotationDto) {
    return this.prisma.quotation.create({ data: { requisitionId, ...dto } });
  }
  compareQuotations(requisitionId: string) {
    return this.prisma.quotation.findMany({ where: { requisitionId }, include: { supplier: true }, orderBy: { quotedPrice: 'asc' } });
  }
  async selectQuotation(quotationId: string, userId: string) {
    const q = await this.prisma.quotation.findUnique({ where: { id: quotationId }, include: { requisition: true } });
    if (!q) throw new NotFoundException('Quotation not found');
    await this.prisma.quotation.update({ where: { id: quotationId }, data: { status: 'SELECTED' } });
    // Auto-generate a PO from the selected quote.
    return this.prisma.purchaseOrder.create({
      data: {
        poNumber: 'PO-' + Date.now().toString().slice(-8),
        supplierId: q.supplierId,
        requisitionId: q.requisitionId,
        selectionMethod: 'QUOTATION_COMPARISON',
        items: q.requisition.items as any,
        paymentTerms: q.paymentTerms,
        createdById: userId,
        status: 'DRAFT',
      },
    });
  }

  // purchase orders
  createPo(userId: string, dto: CreatePurchaseOrderDto) {
    const total = dto.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    return this.prisma.purchaseOrder.create({
      data: {
        poNumber: 'PO-' + Date.now().toString().slice(-8),
        supplierId: dto.supplierId,
        requisitionId: dto.requisitionId,
        selectionMethod: dto.selectionMethod ?? 'DIRECT_SELECTION',
        items: dto.items as any,
        totalAmount: total,
        paymentTerms: dto.paymentTerms,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        createdById: userId,
      },
    });
  }
  listPos() {
    return this.prisma.purchaseOrder.findMany({ include: { supplier: true }, orderBy: { createdAt: 'desc' } });
  }
  sendPo(id: string) {
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'SENT' } });
  }

  // goods received note + comparison
  createGrn(userId: string, dto: CreateGrnDto) {
    return this.prisma.goodsReceivedNote.create({
      data: { poId: dto.poId, recordedById: userId, itemsReceived: dto.itemsReceived as any, notes: dto.notes },
    });
  }
  async grnComparison(poId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { grns: true } });
    if (!po) throw new NotFoundException('PO not found');
    return { ordered: po.items, received: po.grns.map((g) => g.itemsReceived) };
  }
  acceptGrn(id: string, accepted: boolean) {
    return this.prisma.goodsReceivedNote.update({ where: { id }, data: { accepted, comparisonResult: accepted ? 'MATCHED' : 'SHORT' } });
  }

  // supplier invoices + three-way match
  async createSupplierInvoice(dto: CreateSupplierInvoiceDto) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id: dto.poId } });
    if (!po) throw new NotFoundException('PO not found');
    return this.prisma.supplierInvoice.create({ data: { ...dto, supplierId: po.supplierId } });
  }
  async threeWayMatch(invoiceId: string) {
    const inv = await this.prisma.supplierInvoice.findUnique({
      where: { id: invoiceId },
      include: { po: true, grn: true },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    const poTotal = Number(inv.po.totalAmount);
    const matched = Math.abs(poTotal - Number(inv.amount)) < 0.01;
    await this.prisma.supplierInvoice.update({ where: { id: invoiceId }, data: { matchedStatus: matched ? 'MATCHED' : 'MISMATCHED' } });
    return { invoice: Number(inv.amount), poTotal, grn: inv.grn?.itemsReceived ?? null, matched };
  }
  approveInvoice(id: string, approverId: string) {
    // Super Admin only (guarded at controller).
    return this.prisma.supplierInvoice.update({ where: { id }, data: { status: 'APPROVED', approvedForPaymentById: approverId } });
  }
}

@ApiTags('Procurement')
@ApiBearerAuth()
@Controller()
export class ProcurementController {
  constructor(private readonly svc: ProcurementService) {}

  // Suppliers
  @Departments(Department.PURCHASE, Department.MANAGEMENT)
  @Post('suppliers')
  createSupplier(@Body() dto: CreateSupplierDto) { return this.svc.createSupplier(dto); }

  @Departments(Department.PURCHASE, Department.WAREHOUSE, Department.MANAGEMENT)
  @Get('suppliers')
  listSuppliers(@Query('product') product?: string, @Query('rating') rating?: string) { return this.svc.listSuppliers(product, rating); }

  @Departments(Department.PURCHASE, Department.MANAGEMENT)
  @Patch('suppliers/:id')
  updateSupplier(@Param('id') id: string, @Body() dto: UpdateSupplierDto) { return this.svc.updateSupplier(id, dto); }

  // Requisitions — Purchase staff or Warehouse Incharge raise; Purchase Admin approves.
  @Departments(Department.PURCHASE, Department.WAREHOUSE)
  @Post('requisitions')
  createReq(@CurrentUser('id') uid: string, @Body() dto: CreateRequisitionDto) { return this.svc.createRequisition(uid, dto); }

  @Departments(Department.PURCHASE)
  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch('requisitions/:id/approve')
  approveReq(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.svc.approveRequisition(id, uid); }

  // Quotations
  @Departments(Department.PURCHASE)
  @Post('requisitions/:id/quotations')
  addQuote(@Param('id') id: string, @Body() dto: CreateQuotationDto) { return this.svc.addQuotation(id, dto); }

  @Departments(Department.PURCHASE)
  @Get('requisitions/:id/quotations')
  compareQuotes(@Param('id') id: string) { return this.svc.compareQuotations(id); }

  @Departments(Department.PURCHASE)
  @Patch('quotations/:id/select')
  selectQuote(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.svc.selectQuotation(id, uid); }

  // Purchase orders
  @Departments(Department.PURCHASE)
  @Post('purchase-orders')
  createPo(@CurrentUser('id') uid: string, @Body() dto: CreatePurchaseOrderDto) { return this.svc.createPo(uid, dto); }

  @Departments(Department.PURCHASE, Department.MANAGEMENT)
  @Get('purchase-orders')
  listPos() { return this.svc.listPos(); }

  @Departments(Department.PURCHASE)
  @Patch('purchase-orders/:id/send')
  sendPo(@Param('id') id: string) { return this.svc.sendPo(id); }

  // GRN — Warehouse records receipt against the PO.
  @Departments(Department.WAREHOUSE)
  @Post('grn')
  createGrn(@CurrentUser('id') uid: string, @Body() dto: CreateGrnDto) { return this.svc.createGrn(uid, dto); }

  @Departments(Department.WAREHOUSE, Department.PURCHASE)
  @Get('purchase-orders/:id/grn-comparison')
  grnComparison(@Param('id') id: string) { return this.svc.grnComparison(id); }

  @Departments(Department.WAREHOUSE)
  @Patch('grn/:id/accept')
  acceptGrn(@Param('id') id: string, @Body('accepted') accepted: boolean) { return this.svc.acceptGrn(id, accepted ?? true); }

  // Supplier invoices + three-way match
  @Departments(Department.PURCHASE, Department.FINANCE)
  @Post('supplier-invoices')
  createInvoice(@Body() dto: CreateSupplierInvoiceDto) { return this.svc.createSupplierInvoice(dto); }

  @Departments(Department.PURCHASE, Department.FINANCE)
  @Get('supplier-invoices/:id/match')
  match(@Param('id') id: string) { return this.svc.threeWayMatch(id); }

  // Final approval for payment — Super Admin only.
  @MinAccessLevel(AccessLevel.SUPER_ADMIN)
  @Patch('supplier-invoices/:id/approve')
  approveInvoice(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.svc.approveInvoice(id, uid); }
}

@Module({
  controllers: [ProcurementController],
  providers: [ProcurementService],
})
export class ProcurementModule {}
