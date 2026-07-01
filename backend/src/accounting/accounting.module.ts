import { Body, Controller, Get, Module, Param, Patch, Post, Query, Injectable } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessLevel, Department } from '@prisma/client';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Departments, MinAccessLevel } from '../common/decorators/access.decorator';

class ExpenseDto { @IsString() expenseType: string; @IsNumber() amount: number; @IsOptional() @IsString() description?: string; }

function ageBucket(due?: Date | null): string {
  if (!due) return 'current';
  const days = Math.floor((Date.now() - new Date(due).getTime()) / 86400000);
  if (days <= 0) return 'current';
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  return '60+';
}

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  ledger() { return this.prisma.ledgerEntry.findMany({ orderBy: { date: 'desc' }, take: 200 }); }

  prepareExpense(userId: string, dto: ExpenseDto) {
    return this.prisma.expensePayment.create({ data: { expenseType: dto.expenseType, amount: dto.amount, description: dto.description, preparedById: userId } });
  }
  approveExpense(id: string, approverId: string) {
    // Super Admin only (guarded at controller).
    return this.prisma.expensePayment.update({ where: { id }, data: { status: 'APPROVED', approvedForPaymentById: approverId } });
  }

  async pnl(from?: string, to?: string) {
    const where = dateRange(from, to);
    const invoices = await this.prisma.invoice.findMany({ where: where ? { createdAt: where } : {} });
    const expenses = await this.prisma.expensePayment.findMany({ where: where ? { createdAt: where } : {} });
    const income = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const expense = expenses.reduce((s, e) => s + Number(e.amount), 0);
    return { income, expense, profit: income - expense };
  }
  async arAging() {
    const invoices = await this.prisma.invoice.findMany({ where: { status: { not: 'PAID' } }, include: { order: { include: { customer: true } } } });
    const buckets: Record<string, number> = { current: 0, '0-30': 0, '31-60': 0, '60+': 0 };
    invoices.forEach((i) => { buckets[ageBucket(i.dueDate)] += Number(i.totalAmount); });
    return buckets;
  }
  async apAging() {
    const inv = await this.prisma.supplierInvoice.findMany({ where: { status: { notIn: ['PAID'] } } });
    const total = inv.reduce((s, i) => s + Number(i.amount), 0);
    return { outstanding: total, count: inv.length };
  }
  async cashFlow(from?: string, to?: string) {
    const range = dateRange(from, to);
    const payments = await this.prisma.payment.findMany({ where: range ? { createdAt: range } : {} });
    const expenses = await this.prisma.expensePayment.findMany({ where: range ? { createdAt: range } : {} });
    const cashIn = payments.reduce((s, p) => s + Number(p.amount), 0);
    const cashOut = expenses.reduce((s, e) => s + Number(e.amount), 0);
    return { cashIn, cashOut, net: cashIn - cashOut };
  }
  async vatSummary(from?: string, to?: string) {
    const range = dateRange(from, to);
    const invoices = await this.prisma.invoice.findMany({ where: range ? { createdAt: range } : {} });
    return { vatCollected: invoices.reduce((s, i) => s + Number(i.taxAmount), 0), invoiceCount: invoices.length };
  }
  async balanceSheet() {
    const entries = await this.prisma.ledgerEntry.findMany({ include: { account: true } });
    const totals: Record<string, number> = {};
    entries.forEach((e) => { const t = e.account.accountType; totals[t] = (totals[t] || 0) + Number(e.debit) - Number(e.credit); });
    return totals;
  }
  pendingPos() { return this.prisma.purchaseOrder.findMany({ where: { status: { in: ['SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] } }, include: { supplier: true } }); }

  // Finance Admin's own approval queues.
  async myPending() {
    const [credit, supplierInvoices] = await Promise.all([
      this.prisma.creditTerm.findMany({ where: { approvedById: null } }),
      this.prisma.supplierInvoice.findMany({ where: { status: 'VERIFIED' } }),
    ]);
    return { creditTermRequests: credit.length, supplierInvoicesAwaiting: supplierInvoices.length, items: { credit, supplierInvoices } };
  }
}

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const r: any = {};
  if (from) r.gte = new Date(from);
  if (to) r.lte = new Date(to);
  return r;
}

@ApiTags('Accounting')
@ApiBearerAuth()
@Controller()
export class AccountingController {
  constructor(private readonly svc: AccountingService) {}

  @Departments(Department.FINANCE, Department.MANAGEMENT)
  @Get('ledger/entries')
  ledger() { return this.svc.ledger(); }

  @Departments(Department.FINANCE)
  @Post('expense-payments')
  prepareExpense(@CurrentUser('id') uid: string, @Body() dto: ExpenseDto) { return this.svc.prepareExpense(uid, dto); }

  @MinAccessLevel(AccessLevel.SUPER_ADMIN)
  @Patch('expense-payments/:id/approve')
  approveExpense(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.svc.approveExpense(id, uid); }

  @Departments(Department.FINANCE, Department.MANAGEMENT)
  @Get('reports/pnl')
  pnl(@Query('from') f?: string, @Query('to') t?: string) { return this.svc.pnl(f, t); }

  @Departments(Department.FINANCE, Department.MANAGEMENT)
  @Get('reports/balance-sheet')
  balance() { return this.svc.balanceSheet(); }

  @Departments(Department.FINANCE, Department.MANAGEMENT)
  @Get('reports/ar-aging')
  ar() { return this.svc.arAging(); }

  @Departments(Department.FINANCE, Department.MANAGEMENT)
  @Get('reports/ap-aging')
  ap() { return this.svc.apAging(); }

  @Departments(Department.FINANCE, Department.MANAGEMENT)
  @Get('reports/cash-flow')
  cash(@Query('from') f?: string, @Query('to') t?: string) { return this.svc.cashFlow(f, t); }

  @Departments(Department.FINANCE, Department.MANAGEMENT)
  @Get('reports/vat-summary')
  vat(@Query('from') f?: string, @Query('to') t?: string) { return this.svc.vatSummary(f, t); }

  @Departments(Department.PURCHASE, Department.FINANCE, Department.MANAGEMENT)
  @Get('reports/purchase/pending-po')
  pendingPo() { return this.svc.pendingPos(); }

  @Departments(Department.FINANCE)
  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Get('approvals/me/pending')
  myPending() { return this.svc.myPending(); }
}

// --------- Cross-department approvals (Super Admin oversight, §6.10) ---------
@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  async allPending() {
    const [requisitions, specialPrices, leave, advances, supplierInvoices, expenses] = await Promise.all([
      this.prisma.purchaseRequisition.findMany({ where: { status: 'PENDING' } }),
      this.prisma.specialPriceRequest.findMany({ where: { status: 'PENDING' } }),
      this.prisma.leaveRequest.findMany({ where: { status: 'PENDING' } }),
      this.prisma.salaryAdvanceRequest.findMany({ where: { status: 'PENDING' } }),
      this.prisma.supplierInvoice.findMany({ where: { status: { in: ['PENDING', 'VERIFIED'] } } }),
      this.prisma.expensePayment.findMany({ where: { status: 'PENDING' } }),
    ]);
    return {
      counts: { requisitions: requisitions.length, specialPrices: specialPrices.length, leave: leave.length, advances: advances.length, supplierInvoices: supplierInvoices.length, expenses: expenses.length },
      requisitions, specialPrices, leave, advances, supplierInvoices, expenses,
    };
  }

  /** Super Admin override: approve any department's item by type + id. */
  async override(type: string, id: string, approve: boolean, uid: string) {
    const st = approve ? 'APPROVED' : 'REJECTED';
    switch (type) {
      case 'requisition': return this.prisma.purchaseRequisition.update({ where: { id }, data: { status: st, approvedById: uid } });
      case 'special_price': return this.prisma.specialPriceRequest.update({ where: { id }, data: { status: st, approvedById: uid } });
      case 'leave': return this.prisma.leaveRequest.update({ where: { id }, data: { status: st, approvedById: uid } });
      case 'advance': return this.prisma.salaryAdvanceRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: uid } });
      case 'supplier_invoice': return this.prisma.supplierInvoice.update({ where: { id }, data: { status: 'APPROVED', approvedForPaymentById: uid } });
      case 'expense': return this.prisma.expensePayment.update({ where: { id }, data: { status: 'APPROVED', approvedForPaymentById: uid } });
      default: return { error: 'unknown approval type' };
    }
  }
}

@ApiTags('Approvals')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

  @MinAccessLevel(AccessLevel.SUPER_ADMIN)
  @Get('pending')
  pending() { return this.svc.allPending(); }

  @MinAccessLevel(AccessLevel.SUPER_ADMIN)
  @Patch(':id/override')
  override(@Param('id') id: string, @Body('type') type: string, @Body('approve') approve: boolean, @CurrentUser('id') uid: string) { return this.svc.override(type, id, approve ?? true, uid); }
}

@Module({
  controllers: [AccountingController, ApprovalsController],
  providers: [AccountingService, ApprovalsService],
})
export class AccountingModule {}
