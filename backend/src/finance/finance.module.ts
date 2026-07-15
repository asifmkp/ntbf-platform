// ---------------------------------------------------------------------------
// Finance module — Stage 1: Customer Receipts (money IN from customers).
//
// Built on the live "System A" (file-backed JSON + staff JWT), reusing the exact
// store / statusHistory / admin-gate patterns from the Rashid and customer-portal
// modules. It NEVER touches the frozen WhatsApp order-ingest contract, and it only
// READS orders (to match a receipt to the real bill) — it never mutates them.
//
// Roadmap (each later stage is plan-first → approval → code):
//   Stage 2 = cheque lifecycle (received→deposited→cleared/bounced)
//   Stage 3 = company payments (finance creates → admin approves)
//   Stage 4 = staff-to-staff transfers (mutual confirm, off the approval queue)
//   Stage 5 = finance overview (pending queues + totals in/out/net)
// ---------------------------------------------------------------------------
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException,
  Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../common/decorators/public.decorator';
import { StaffAuthGuard, StaffAuthModule } from '../staff-auth/staff-auth.module';
import { CustomerPortalModule, CustomerStore } from '../customer-portal/customer-portal.module';

// Payment methods offered on a receipt. Cheque carries extra detail (Stage 2 adds
// the full received→deposited→cleared/bounced lifecycle; Stage 1 just captures it).
export const RECEIPT_METHODS = ['CASH', 'CHEQUE', 'BANK', 'CARD'];

// Customer-receipt states:
//   PENDING_APPROVAL — collected < bill (a discount): held for FINANCE approval.
//   COLLECTED        — recorded & (if discounted) discount-approved; awaits office confirmation.
//   CONFIRMED        — office/finance confirmed the money reached the company (terminal).
//   REJECTED         — finance rejected the discount / receipt (terminal).
export const RECEIPT_STATUSES = ['PENDING_APPROVAL', 'COLLECTED', 'CONFIRMED', 'REJECTED'];

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type Staff = { id: string; roles: string[]; name: string };
const hasRole = (s: Staff, r: string) => !!s && (s.roles || []).indexOf(r) >= 0;
const isAdmin = (s: Staff) => hasRole(s, 'admin');
// Finance authority = a finance user OR an admin (admin can always act).
const isFinance = (s: Staff) => hasRole(s, 'finance') || hasRole(s, 'admin');

// ---- DTOs (global ValidationPipe uses forbidNonWhitelisted: true — every accepted
//      field MUST be declared here or the request is rejected 400). ----
class CreateReceiptDto {
  @IsOptional() @IsString() orderId?: string; // ORD-#### — when set, the bill is pulled server-side
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() customerName?: string; // walk-in / ad-hoc receipt with no order
  @IsOptional() @IsString() customerPhone?: string;
  @IsNumber() collectedAmount: number; // AED actually collected
  @IsOptional() @IsNumber() billAmount?: number; // used only when there is no orderId
  @IsIn(RECEIPT_METHODS) method: string;
  @IsOptional() @IsObject() cheque?: any; // { no, bank, date } — Stage 2 formalises the lifecycle
  @IsOptional() @IsString() narration?: string;
  @IsOptional() @IsString() billPhoto?: string; // base64 data URL; stored on disk, not in the JSON
  @IsOptional() @IsString() billMediaType?: string;
}
class NoteDto { @IsOptional() @IsString() note?: string; }
class RejectDto { @IsString() note: string; } // a rejection must carry a reason

// ---- Receipt store (data/finance-receipts.json) ----
@Injectable()
export class ReceiptStore {
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'finance-receipts.json');
  private readonly billsDir = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'finance-bills');
  private data: { seq: number; items: any[] } = { seq: 4000, items: [] };

  constructor() {
    try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* empty */ }
    if (!Array.isArray(this.data.items)) this.data.items = [];
    if (typeof this.data.seq !== 'number') this.data.seq = 4000;
  }
  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* ignore */ }
  }
  private id() { this.data.seq += 1; return 'RCPT-' + this.data.seq; }

  /** Write a bill photo (base64 data URL or raw base64) to disk and record its relative path. */
  attachPhoto(id: string, dataUrl: string, mediaType?: string): boolean {
    const rec = this.byId(id); if (!rec) return false;
    try {
      const raw = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const mt = mediaType || (dataUrl.startsWith('data:') ? dataUrl.slice(5, dataUrl.indexOf(';')) : 'image/jpeg');
      const ext = mt.indexOf('png') >= 0 ? 'png' : 'jpg';
      fs.mkdirSync(this.billsDir, { recursive: true });
      fs.writeFileSync(path.join(this.billsDir, id + '.' + ext), Buffer.from(raw, 'base64'));
      rec.billPhoto = path.join('finance-bills', id + '.' + ext);
      rec.billMediaType = mt;
      this.save();
      return true;
    } catch (e) { return false; }
  }
  readBillPhoto(rec: any): string | null {
    if (!rec || !rec.billPhoto) return null;
    try {
      const abs = path.join(process.env.STATE_DIR || process.cwd(), 'data', rec.billPhoto);
      const buf = fs.readFileSync(abs);
      return 'data:' + (rec.billMediaType || 'image/jpeg') + ';base64,' + buf.toString('base64');
    } catch (e) { return null; }
  }

  create(rec: any) { rec.id = this.id(); this.data.items.unshift(rec); this.save(); return rec; }
  byId(id: string) { return this.data.items.find((x) => x.id === id); }
  listByCollector(collectorId: string) { return this.data.items.filter((x) => x.collectedById === collectorId); }
  list(filter?: { status?: string }) {
    return this.data.items.filter((x) => !filter?.status || x.status === filter.status);
  }
  applyStatus(id: string, to: string, entry: any, extra?: any) {
    const x = this.byId(id); if (!x) return null;
    x.status = to; x.updatedAt = entry.at;
    if (extra) Object.assign(x, extra);
    x.statusHistory = x.statusHistory || [];
    x.statusHistory.push(entry);
    this.save(); return x;
  }
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly receipts: ReceiptStore,
    private readonly orders: CustomerStore, // read-only: match a receipt to the real bill
  ) {}

  private assertFinance(staff: Staff) { if (!isFinance(staff)) throw new ForbiddenException('Finance or admin only'); }
  private histEntry(from: string | null, to: string, staff: Staff, actingRole: string, note?: string, override = false) {
    const e: any = { from, to, by: staff.name, byId: staff.id, role: actingRole, at: new Date().toISOString(), override };
    if (note) e.note = note;
    return e;
  }
  private publicReceipt(x: any) { return { ...x, hasPhoto: !!x.billPhoto }; }

  /** Bill lookup for prefilling a receipt — any staff may look up an order to collect against. */
  orderLookup(orderId: string) {
    const o = this.orders.allOrders().find((x: any) => x.id === orderId);
    if (!o) throw new NotFoundException('Order not found');
    return {
      orderId: o.id, customerId: o.customerId, customerName: o.customerName, customerPhone: o.customerPhone,
      billAmount: round2(o.total), status: o.status,
      collected: o.collected || null,
      items: (o.items || []).map((i: any) => ({ name: i.name, unit: i.unit, qty: i.qty, price: i.price })),
    };
  }

  createReceipt(staff: Staff, dto: CreateReceiptDto) {
    const collected = round2(dto.collectedAmount);
    if (!(collected > 0)) throw new BadRequestException('Collected amount must be greater than 0');

    // Resolve the bill. If an order is referenced, the bill total + customer come from the
    // real order server-side (so the receipt "matches the bill exactly"); the client cannot
    // fake the bill. Ad-hoc receipts (no order) may carry a typed billAmount + customer.
    let orderId: string | null = null;
    let customerId = dto.customerId || null;
    let customerName = dto.customerName || '';
    let customerPhone = dto.customerPhone || '';
    let billAmount = dto.billAmount != null ? round2(dto.billAmount) : null;
    let billItems: any[] | null = null;

    if (dto.orderId) {
      const o = this.orders.allOrders().find((x: any) => x.id === dto.orderId);
      if (!o) throw new BadRequestException('Order not found');
      orderId = o.id;
      customerId = o.customerId;
      customerName = o.customerName || customerName;
      customerPhone = o.customerPhone || customerPhone;
      billAmount = round2(o.total);
      billItems = (o.items || []).map((i: any) => ({ name: i.name, unit: i.unit, qty: i.qty, price: i.price }));
    }

    // Discount = the shortfall against the bill. Only meaningful when a bill is known.
    const discount = billAmount != null ? round2(billAmount - collected) : 0;
    if (billAmount != null && collected - billAmount > 0.001) {
      throw new BadRequestException('Collected amount is more than the bill — check the figures');
    }
    const hasDiscount = discount > 0.001;

    const at = new Date().toISOString();
    const status = hasDiscount ? 'PENDING_APPROVAL' : 'COLLECTED';
    const actingRole = staff.roles?.[0] || 'staff';
    const rec: any = {
      id: '', type: 'CUSTOMER',
      orderId, customerId, customerName, customerPhone,
      billAmount, billItems, collectedAmount: collected, discount: round2(Math.max(0, discount)),
      method: dto.method, cheque: dto.cheque || null, narration: dto.narration || '',
      billPhoto: null, billMediaType: null,
      collectedBy: staff.name, collectedById: staff.id, collectedByRole: actingRole,
      status, createdAt: at, updatedAt: at,
      statusHistory: [this.histEntry(null, status, staff, actingRole,
        hasDiscount ? `collected AED ${collected} of AED ${billAmount} — discount AED ${round2(discount)} awaiting finance approval` : undefined)],
    };
    const created = this.receipts.create(rec);
    if (dto.billPhoto) this.receipts.attachPhoto(created.id, dto.billPhoto, dto.billMediaType);
    return this.publicReceipt(this.receipts.byId(created.id));
  }

  listMine(staff: Staff) { return this.receipts.listByCollector(staff.id).map((x) => this.publicReceipt(x)); }
  listAll(staff: Staff, status?: string) {
    this.assertFinance(staff);
    return this.receipts.list({ status }).map((x) => this.publicReceipt(x));
  }
  receiptPhoto(staff: Staff, id: string) {
    const x = this.receipts.byId(id);
    if (!x) throw new NotFoundException('Receipt not found');
    if (!isFinance(staff) && x.collectedById !== staff.id) throw new ForbiddenException('Not your receipt');
    const dataUrl = this.receipts.readBillPhoto(x);
    if (!dataUrl) throw new NotFoundException('No photo on this receipt');
    return { dataUrl };
  }

  /** Finance approves a discounted receipt → the discount is accepted; receipt becomes COLLECTED. */
  approveDiscount(staff: Staff, id: string, note?: string) {
    this.assertFinance(staff);
    const x = this.receipts.byId(id);
    if (!x) throw new NotFoundException('Receipt not found');
    if (x.status !== 'PENDING_APPROVAL') throw new BadRequestException(`Receipt is already ${x.status.toLowerCase().replace('_', ' ')}`);
    return this.publicReceipt(this.receipts.applyStatus(id, 'COLLECTED',
      this.histEntry('PENDING_APPROVAL', 'COLLECTED', staff, 'finance', note || `discount of AED ${x.discount} approved`)));
  }
  rejectReceipt(staff: Staff, id: string, note: string) {
    this.assertFinance(staff);
    const x = this.receipts.byId(id);
    if (!x) throw new NotFoundException('Receipt not found');
    if (x.status === 'CONFIRMED' || x.status === 'REJECTED') throw new BadRequestException(`Receipt is already ${x.status.toLowerCase()}`);
    return this.publicReceipt(this.receipts.applyStatus(id, 'REJECTED',
      this.histEntry(x.status, 'REJECTED', staff, 'finance', note)));
  }
  /** The universal "Confirm received" — office/finance confirms the cash reached the company. */
  confirmReceived(staff: Staff, id: string, note?: string) {
    this.assertFinance(staff);
    const x = this.receipts.byId(id);
    if (!x) throw new NotFoundException('Receipt not found');
    if (x.status === 'PENDING_APPROVAL') throw new BadRequestException('Approve the discount first, then confirm');
    if (x.status !== 'COLLECTED') throw new BadRequestException(`Receipt is already ${x.status.toLowerCase()}`);
    return this.publicReceipt(this.receipts.applyStatus(id, 'CONFIRMED',
      this.histEntry('COLLECTED', 'CONFIRMED', staff, 'finance', note || 'money received & reconciled')));
  }
}

@ApiTags('Finance — receipts')
@Controller('finance')
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  // Any staff may look up an order to collect against.
  @Public() @UseGuards(StaffAuthGuard) @Get('orders/:id/lookup')
  lookup(@Param('id') id: string) { return this.svc.orderLookup(id); }

  // Any staff may create a customer receipt.
  @Public() @UseGuards(StaffAuthGuard) @Post('receipts')
  create(@Body() dto: CreateReceiptDto, @Req() req: any) { return this.svc.createReceipt(req.staff, dto); }

  @Public() @UseGuards(StaffAuthGuard) @Get('receipts/mine')
  mine(@Req() req: any) { return this.svc.listMine(req.staff); }

  @Public() @UseGuards(StaffAuthGuard) @Get('receipts')
  all(@Query('status') status: string, @Req() req: any) { return this.svc.listAll(req.staff, status); }

  @Public() @UseGuards(StaffAuthGuard) @Get('receipts/:id/photo')
  photo(@Param('id') id: string, @Req() req: any) { return this.svc.receiptPhoto(req.staff, id); }

  // Finance/admin: approve a discount, reject, or confirm the money was received.
  @Public() @UseGuards(StaffAuthGuard) @Post('receipts/:id/approve')
  approve(@Param('id') id: string, @Body() dto: NoteDto, @Req() req: any) { return this.svc.approveDiscount(req.staff, id, dto?.note); }

  @Public() @UseGuards(StaffAuthGuard) @Post('receipts/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto, @Req() req: any) { return this.svc.rejectReceipt(req.staff, id, dto.note); }

  @Public() @UseGuards(StaffAuthGuard) @Post('receipts/:id/confirm')
  confirm(@Param('id') id: string, @Body() dto: NoteDto, @Req() req: any) { return this.svc.confirmReceived(req.staff, id, dto?.note); }
}

@Module({
  imports: [
    StaffAuthModule,        // shared StaffAuthGuard + JWT
    CustomerPortalModule,   // shared CustomerStore (read-only order/bill lookups)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [FinanceController],
  providers: [ReceiptStore, FinanceService, StaffAuthGuard],
})
export class FinanceModule {}
