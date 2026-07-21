// ---------------------------------------------------------------------------
// Finance module — the NTBF money hub, built on the live "System A"
// (file-backed JSON + staff JWT). Reuses the store / statusHistory / admin-gate
// patterns from the Rashid and customer-portal modules. Never touches the frozen
// WhatsApp order-ingest contract or Zoho; reads orders read-only.
//
//   Stage 1 — Customer receipts (money IN), discount → finance approval.
//   Stage 2 — Cheque lifecycle (received → deposited → cleared / bounced).
//   Stage 3 — Company payments (money OUT): finance creates → admin approves.
//   Stage 4 — Staff-to-staff transfers: receiver confirms; off the approval queue.
//   Stage 5 — Finance overview totals (in / out / net + queues).
// ---------------------------------------------------------------------------
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException,
  Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../common/decorators/public.decorator';
import { StaffAuthGuard, StaffAuthModule, StaffStore } from '../staff-auth/staff-auth.module';
import { CustomerPortalModule, CustomerStore } from '../customer-portal/customer-portal.module';
import { RashidModule, ExpenseStore, AdvanceStore } from '../rashid/rashid.module';

export const RECEIPT_METHODS = ['CASH', 'CHEQUE', 'BANK', 'CARD'];
export const RECEIPT_STATUSES = ['PENDING_APPROVAL', 'COLLECTED', 'CONFIRMED', 'REJECTED'];
export const PAYMENT_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'];
export const TRANSFER_STATUSES = ['PENDING_CONFIRM', 'CONFIRMED', 'DECLINED'];
// Cheque lifecycle (receipts = incoming cheques; payments = outgoing cheques).
export const CHEQUE_STATUSES = ['RECEIVED', 'DEPOSITED', 'CLEARED', 'BOUNCED'];
export const DEFAULT_PAYMENT_CATEGORIES = [
  'Supplier', 'Rent', 'Utilities', 'Salary', 'Transport', 'Fuel', 'Vehicle Maintenance',
  'Government Fees', 'Bank Charges', 'Other',
];

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// ---- EOD (end-of-day cash-up) helpers ----
// Records imported by the July 2026 history backfill carry this origin marker and are
// EXCLUDED from every EOD aggregate: that month is display-only history (it already
// exists in Zoho) and must never surface as "today's cash" for any staff member.
const EOD_EXCLUDED_ORIGIN = 'july-import';
// Live Operations vs Historical Import standard (DEC-017/FACT-026): EVERY operational
// list/summary endpoint defaults to live-only; 'historical'/'combined' must be asked
// for explicitly. Shared by summary + all finance list endpoints (TASK-028).
const viewOf = (view?: string) => (view === 'historical' || view === 'combined' ? view : 'live');
const inView = (v: string) => (x: any) =>
  v === 'combined' ? true : v === 'historical' ? x.origin === EOD_EXCLUDED_ORIGIN : x.origin !== EOD_EXCLUDED_ORIGIN;
/**
 * Day window for a calendar date in Asia/Dubai (UTC+4 year-round, no DST):
 * [00:00 Dubai, next-day 00:00 Dubai) expressed as UTC epoch millis. When no date is
 * given, "today" is the current Dubai calendar date.
 */
function dubaiDayWindow(date?: string) {
  let d = String(date || '').trim();
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException('date must be YYYY-MM-DD');
  if (!d) d = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10); // now shifted +4h → Dubai date
  const startMs = Date.parse(d + 'T00:00:00.000+04:00');
  if (!isFinite(startMs)) throw new BadRequestException('Invalid date');
  return { date: d, startMs, endMs: startMs + 24 * 3600 * 1000 };
}
function inWindow(iso: string, w: { startMs: number; endMs: number }) {
  const t = Date.parse(String(iso || ''));
  return isFinite(t) && t >= w.startMs && t < w.endMs;
}

type Staff = { id: string; roles: string[]; name: string };
const hasRole = (s: Staff, r: string) => !!s && (s.roles || []).indexOf(r) >= 0;
const isAdmin = (s: Staff) => hasRole(s, 'admin');
const isFinance = (s: Staff) => hasRole(s, 'finance') || hasRole(s, 'admin');

// ---- DTOs (global ValidationPipe uses forbidNonWhitelisted: true) ----
class CreateReceiptDto {
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsNumber() collectedAmount: number;
  @IsOptional() @IsNumber() billAmount?: number;
  @IsIn(RECEIPT_METHODS) method: string;
  @IsOptional() @IsObject() cheque?: any;
  @IsOptional() @IsString() narration?: string;
  @IsOptional() @IsString() billPhoto?: string;
  @IsOptional() @IsString() billMediaType?: string;
  // Offline-outbox idempotency key (optional, client-generated uuid). When present and a
  // record with the same clientRef already exists, the create returns THAT record instead
  // of writing a duplicate — a timed-out POST retried from the phone can never double-post.
  @IsOptional() @IsString() clientRef?: string;
}
class CreatePaymentDto {
  @IsString() payee: string;
  @IsNumber() amount: number;
  @IsIn(RECEIPT_METHODS) method: string;
  @IsString() category: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsObject() cheque?: any;
  @IsOptional() @IsString() narration?: string;
  @IsOptional() @IsString() billPhoto?: string;
  @IsOptional() @IsString() billMediaType?: string;
  // Offline-outbox idempotency key — see CreateReceiptDto.clientRef.
  @IsOptional() @IsString() clientRef?: string;
}
class CreateTransferDto {
  @IsString() toStaffId: string;
  @IsNumber() amount: number;
  @IsIn(RECEIPT_METHODS) method: string;
  @IsOptional() @IsString() narration?: string;
  @IsOptional() @IsString() billPhoto?: string;
  @IsOptional() @IsString() billMediaType?: string;
  // Offline-outbox idempotency key — see CreateReceiptDto.clientRef.
  @IsOptional() @IsString() clientRef?: string;
}
class NoteDto { @IsOptional() @IsString() note?: string; }
class RejectDto { @IsString() note: string; }
class ChequeActionDto { @IsIn(['deposit', 'clear', 'bounce']) action: string; @IsOptional() @IsString() note?: string; }
class CategoriesDto { @IsArray() categories: string[]; }
// Finance-originated advance (Stage C): a finance/admin user hands a cash float directly to a
// staff member. Positive amount enforced by @Min AND re-checked in the service.
class IssueAdvanceDto {
  @IsString() employeeId: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() note?: string;
}

// ---- Generic file-backed store (shared by receipts / payments / transfers) ----
class JsonStore {
  protected data: { seq: number; settings?: any; items: any[] };
  private readonly file: string;
  private readonly billsDir: string;
  private readonly prefix: string;

  constructor(fileName: string, prefix: string, seqStart: number, settings?: any) {
    this.file = path.join(process.env.STATE_DIR || process.cwd(), 'data', fileName);
    this.billsDir = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'finance-bills');
    this.prefix = prefix;
    this.data = { seq: seqStart, settings, items: [] };
    try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* empty */ }
    if (!Array.isArray(this.data.items)) this.data.items = [];
    if (typeof this.data.seq !== 'number') this.data.seq = seqStart;
    if (settings && !this.data.settings) this.data.settings = settings;
  }
  protected save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* ignore */ }
  }
  protected id() { this.data.seq += 1; return this.prefix + '-' + this.data.seq; }

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

  /** Admin "clear test data": drop every record; keep seq (IDs never reuse) and settings (e.g. payment categories). */
  clear() { const n = this.data.items.length; this.data.items = []; this.save(); return n; }

  create(rec: any) { rec.id = this.id(); this.data.items.unshift(rec); this.save(); return rec; }
  byId(id: string) { return this.data.items.find((x) => x.id === id); }
  /** Idempotency lookup for offline-outbox retries. Records without a clientRef never match. */
  byClientRef(ref: string) { return ref ? this.data.items.find((x) => x.clientRef === ref) : undefined; }
  all() { return this.data.items.slice(); }
  /** Selective unwind for imported history: remove only records matching the predicate. */
  removeWhere(pred: (x: any) => boolean) {
    const n = this.data.items.length;
    this.data.items = this.data.items.filter((x) => !pred(x));
    this.save();
    return n - this.data.items.length;
  }
  applyStatus(id: string, to: string, entry: any, extra?: any) {
    const x = this.byId(id); if (!x) return null;
    x.status = to; x.updatedAt = entry.at;
    if (extra) Object.assign(x, extra);
    x.statusHistory = x.statusHistory || [];
    x.statusHistory.push(entry);
    this.save(); return x;
  }
  // Persist an in-place field change (e.g. cheque sub-status) with an audit entry.
  patch(id: string, extra: any, entry?: any) {
    const x = this.byId(id); if (!x) return null;
    if (extra) Object.assign(x, extra);
    if (entry) { x.statusHistory = x.statusHistory || []; x.statusHistory.push(entry); x.updatedAt = entry.at; }
    this.save(); return x;
  }
}

@Injectable() export class ReceiptStore extends JsonStore { constructor() { super('finance-receipts.json', 'RCPT', 4000); } }
@Injectable() export class PaymentStore extends JsonStore {
  constructor() { super('finance-payments.json', 'PAY', 5000, { categories: DEFAULT_PAYMENT_CATEGORIES.slice() }); }
  categories(): string[] { return (this.data.settings && this.data.settings.categories) || DEFAULT_PAYMENT_CATEGORIES.slice(); }
  setCategories(list: string[]) { this.data.settings = this.data.settings || {}; this.data.settings.categories = list; this.save(); return this.categories(); }
}
@Injectable() export class TransferStore extends JsonStore { constructor() { super('finance-transfers.json', 'TRF', 6000); } }

@Injectable()
export class FinanceService {
  private readonly bounceCharge: number;
  constructor(
    private readonly receipts: ReceiptStore,
    private readonly payments: PaymentStore,
    private readonly transfers: TransferStore,
    private readonly orders: CustomerStore,
    private readonly staffStore: StaffStore,
    private readonly advances: AdvanceStore, // shared singleton from RashidModule (also feeds balanceFor/ledgerFor)
    private readonly expenses: ExpenseStore, // read-only: staff cash expenses feed the EOD cash-up
    config: ConfigService,
  ) { this.bounceCharge = Number(config.get('CHEQUE_BOUNCE_CHARGE') ?? 250); }

  private assertFinance(s: Staff) { if (!isFinance(s)) throw new ForbiddenException('Finance or admin only'); }
  private assertAdmin(s: Staff) { if (!isAdmin(s)) throw new ForbiddenException('Admins only'); }
  private hist(from: string | null, to: string, s: Staff, role: string, note?: string) {
    const e: any = { from, to, by: s.name, byId: s.id, role, at: new Date().toISOString() };
    if (note) e.note = note;
    return e;
  }
  private withPhoto(x: any) { return x ? { ...x, hasPhoto: !!x.billPhoto } : x; }

  // ===================== RECEIPTS (money IN) =====================
  orderLookup(orderId: string) {
    const o = this.orders.allOrders().find((x: any) => x.id === orderId);
    if (!o) throw new NotFoundException('Order not found');
    return {
      orderId: o.id, customerId: o.customerId, customerName: o.customerName, customerPhone: o.customerPhone,
      billAmount: round2(o.total), status: o.status, collected: o.collected || null,
      items: (o.items || []).map((i: any) => ({ name: i.name, unit: i.unit, qty: i.qty, price: i.price })),
    };
  }
  createReceipt(staff: Staff, dto: CreateReceiptDto) {
    // Idempotent retry: a queued/timed-out save re-POSTed with the same clientRef returns
    // the record that first attempt already created — no duplicate is ever written.
    if (dto.clientRef) { const dup = this.receipts.byClientRef(dto.clientRef); if (dup) return this.withPhoto(dup); }
    const collected = round2(dto.collectedAmount);
    if (!(collected > 0)) throw new BadRequestException('Collected amount must be greater than 0');
    let orderId: string | null = null;
    let customerId = dto.customerId || null;
    let customerName = dto.customerName || '';
    let customerPhone = dto.customerPhone || '';
    let billAmount = dto.billAmount != null ? round2(dto.billAmount) : null;
    let billItems: any[] | null = null;
    if (dto.orderId) {
      const o = this.orders.allOrders().find((x: any) => x.id === dto.orderId);
      if (!o) throw new BadRequestException('Order not found');
      orderId = o.id; customerId = o.customerId; customerName = o.customerName || customerName;
      customerPhone = o.customerPhone || customerPhone; billAmount = round2(o.total);
      billItems = (o.items || []).map((i: any) => ({ name: i.name, unit: i.unit, qty: i.qty, price: i.price }));
    }
    const discount = billAmount != null ? round2(billAmount - collected) : 0;
    if (billAmount != null && collected - billAmount > 0.001) throw new BadRequestException('Collected amount is more than the bill — check the figures');
    const hasDiscount = discount > 0.001;
    const at = new Date().toISOString();
    const status = hasDiscount ? 'PENDING_APPROVAL' : 'COLLECTED';
    const role = staff.roles?.[0] || 'staff';
    const cheque = dto.method === 'CHEQUE'
      ? { no: (dto.cheque && dto.cheque.no) || '', bank: (dto.cheque && dto.cheque.bank) || '', date: (dto.cheque && dto.cheque.date) || '', status: 'RECEIVED', bounceCharge: 0 }
      : (dto.cheque || null);
    const rec: any = {
      id: '', type: 'CUSTOMER', orderId, customerId, customerName, customerPhone,
      billAmount, billItems, collectedAmount: collected, discount: round2(Math.max(0, discount)),
      method: dto.method, cheque, narration: dto.narration || '', billPhoto: null, billMediaType: null,
      clientRef: dto.clientRef || null,
      collectedBy: staff.name, collectedById: staff.id, collectedByRole: role,
      status, createdAt: at, updatedAt: at,
      statusHistory: [this.hist(null, status, staff, role, hasDiscount ? `collected AED ${collected} of AED ${billAmount} — discount AED ${round2(discount)} awaiting finance approval` : undefined)],
    };
    const created = this.receipts.create(rec);
    if (dto.billPhoto) this.receipts.attachPhoto(created.id, dto.billPhoto, dto.billMediaType);
    return this.withPhoto(this.receipts.byId(created.id));
  }
  listMyReceipts(staff: Staff, view?: string) { return this.receipts.all().filter(inView(viewOf(view))).filter((x) => x.collectedById === staff.id).map((x) => this.withPhoto(x)); }
  listReceipts(staff: Staff, status?: string, view?: string) { this.assertFinance(staff); return this.receipts.all().filter(inView(viewOf(view))).filter((x) => !status || x.status === status).map((x) => this.withPhoto(x)); }
  receiptPhoto(staff: Staff, id: string) {
    const x = this.receipts.byId(id); if (!x) throw new NotFoundException('Receipt not found');
    if (!isFinance(staff) && x.collectedById !== staff.id) throw new ForbiddenException('Not your receipt');
    const dataUrl = this.receipts.readBillPhoto(x); if (!dataUrl) throw new NotFoundException('No photo on this receipt');
    return { dataUrl };
  }
  approveDiscount(staff: Staff, id: string, note?: string) {
    this.assertFinance(staff);
    const x = this.receipts.byId(id); if (!x) throw new NotFoundException('Receipt not found');
    if (x.status !== 'PENDING_APPROVAL') throw new BadRequestException(`Receipt is already ${String(x.status).toLowerCase().replace('_', ' ')}`);
    return this.withPhoto(this.receipts.applyStatus(id, 'COLLECTED', this.hist('PENDING_APPROVAL', 'COLLECTED', staff, 'finance', note || `discount of AED ${x.discount} approved`)));
  }
  rejectReceipt(staff: Staff, id: string, note: string) {
    this.assertFinance(staff);
    const x = this.receipts.byId(id); if (!x) throw new NotFoundException('Receipt not found');
    if (x.status === 'CONFIRMED' || x.status === 'REJECTED') throw new BadRequestException(`Receipt is already ${String(x.status).toLowerCase()}`);
    return this.withPhoto(this.receipts.applyStatus(id, 'REJECTED', this.hist(x.status, 'REJECTED', staff, 'finance', note)));
  }
  confirmReceived(staff: Staff, id: string, note?: string) {
    this.assertFinance(staff);
    const x = this.receipts.byId(id); if (!x) throw new NotFoundException('Receipt not found');
    if (x.status === 'PENDING_APPROVAL') throw new BadRequestException('Approve the discount first, then confirm');
    if (x.status !== 'COLLECTED') throw new BadRequestException(`Receipt is already ${String(x.status).toLowerCase()}`);
    return this.withPhoto(this.receipts.applyStatus(id, 'CONFIRMED', this.hist('COLLECTED', 'CONFIRMED', staff, 'finance', note || 'money received & reconciled')));
  }

  // ===================== CHEQUE LIFECYCLE (receipts & payments) =====================
  private chequeAdvance(store: JsonStore, id: string, action: string, staff: Staff, note?: string) {
    this.assertFinance(staff);
    const x = store.byId(id); if (!x) throw new NotFoundException('Record not found');
    if (x.method !== 'CHEQUE' || !x.cheque) throw new BadRequestException('This is not a cheque transaction');
    const cur = x.cheque.status || 'RECEIVED';
    if (cur === 'CLEARED' || cur === 'BOUNCED') throw new BadRequestException(`Cheque is already ${cur.toLowerCase()}`);
    const flow: Record<string, { from: string[]; to: string }> = {
      deposit: { from: ['RECEIVED'], to: 'DEPOSITED' },
      clear: { from: ['RECEIVED', 'DEPOSITED'], to: 'CLEARED' },
      bounce: { from: ['RECEIVED', 'DEPOSITED'], to: 'BOUNCED' },
    };
    const step = flow[action];
    if (!step) throw new BadRequestException('Unknown cheque action');
    if (step.from.indexOf(cur) < 0) throw new BadRequestException(`Cannot ${action} a cheque that is ${cur.toLowerCase()}`);
    const cheque = { ...x.cheque, status: step.to };
    let extraNote = note;
    if (step.to === 'BOUNCED') { cheque.bounceCharge = this.bounceCharge; extraNote = (note ? note + ' · ' : '') + `bounce charge AED ${this.bounceCharge}`; }
    const entry = this.hist(cur, step.to, staff, 'finance', `cheque ${step.to.toLowerCase()}${extraNote ? ' · ' + extraNote : ''}`);
    return this.withPhoto(store.patch(id, { cheque }, entry));
  }
  receiptCheque(staff: Staff, id: string, action: string, note?: string) { return this.chequeAdvance(this.receipts, id, action, staff, note); }
  paymentCheque(staff: Staff, id: string, action: string, note?: string) { return this.chequeAdvance(this.payments, id, action, staff, note); }
  listCheques(staff: Staff, status?: string, view?: string) {
    this.assertFinance(staff);
    // Imported July records are CASH with cheque:null so they never match, but the
    // view filter is applied anyway — uniform convention across every list endpoint.
    const f = inView(viewOf(view));
    const tag = (x: any, kind: string) => ({
      id: x.id, kind, party: kind === 'in' ? (x.customerName || '—') : (x.payee || '—'),
      amount: x.collectedAmount != null ? x.collectedAmount : x.amount,
      cheque: x.cheque, chequeStatus: (x.cheque && x.cheque.status) || 'RECEIVED', createdAt: x.createdAt,
    });
    const inC = this.receipts.all().filter(f).filter((x) => x.method === 'CHEQUE' && x.cheque).map((x) => tag(x, 'in'));
    const outC = this.payments.all().filter(f).filter((x) => x.method === 'CHEQUE' && x.cheque).map((x) => tag(x, 'out'));
    const list = inC.concat(outC);
    return status ? list.filter((c) => c.chequeStatus === status) : list;
  }

  // ===================== PAYMENTS (money OUT) =====================
  paymentCategories(staff: Staff) { this.assertFinance(staff); return { categories: this.payments.categories() }; }
  setPaymentCategories(staff: Staff, list: string[]) {
    this.assertAdmin(staff);
    const clean = (list || []).map((c) => String(c || '').trim()).filter(Boolean);
    if (!clean.length) throw new BadRequestException('Provide at least one category');
    return { categories: this.payments.setCategories(clean) };
  }
  createPayment(staff: Staff, dto: CreatePaymentDto) {
    this.assertFinance(staff); // created by finance (or admin)
    // Idempotent retry — see createReceipt.
    if (dto.clientRef) { const dup = this.payments.byClientRef(dto.clientRef); if (dup) return this.withPhoto(dup); }
    const amount = round2(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than 0');
    const payee = String(dto.payee || '').trim();
    if (!payee) throw new BadRequestException('Enter who is being paid');
    const category = String(dto.category || '').trim() || 'Other';
    const at = new Date().toISOString();
    const role = isAdmin(staff) ? 'admin' : 'finance';
    const cheque = dto.method === 'CHEQUE'
      ? { no: (dto.cheque && dto.cheque.no) || '', bank: (dto.cheque && dto.cheque.bank) || '', date: (dto.cheque && dto.cheque.date) || '', status: 'RECEIVED', bounceCharge: 0 }
      : (dto.cheque || null);
    const rec: any = {
      id: '', payee, amount, method: dto.method, category, date: dto.date || at.slice(0, 10),
      cheque, narration: dto.narration || '', billPhoto: null, billMediaType: null,
      clientRef: dto.clientRef || null,
      createdBy: staff.name, createdById: staff.id, createdByRole: role,
      status: 'PENDING_APPROVAL', createdAt: at, updatedAt: at,
      statusHistory: [this.hist(null, 'PENDING_APPROVAL', staff, role, `payment of AED ${amount} to ${payee} awaiting admin approval`)],
    };
    const created = this.payments.create(rec);
    if (dto.billPhoto) this.payments.attachPhoto(created.id, dto.billPhoto, dto.billMediaType);
    return this.withPhoto(this.payments.byId(created.id));
  }
  listPayments(staff: Staff, status?: string, view?: string) { this.assertFinance(staff); return this.payments.all().filter(inView(viewOf(view))).filter((x) => !status || x.status === status).map((x) => this.withPhoto(x)); }
  paymentPhoto(staff: Staff, id: string) {
    this.assertFinance(staff);
    const x = this.payments.byId(id); if (!x) throw new NotFoundException('Payment not found');
    const dataUrl = this.payments.readBillPhoto(x); if (!dataUrl) throw new NotFoundException('No photo on this payment');
    return { dataUrl };
  }
  approvePayment(staff: Staff, id: string, note?: string) {
    this.assertAdmin(staff); // every payment needs admin approval
    const x = this.payments.byId(id); if (!x) throw new NotFoundException('Payment not found');
    if (x.status !== 'PENDING_APPROVAL') throw new BadRequestException(`Payment is already ${String(x.status).toLowerCase()}`);
    return this.withPhoto(this.payments.applyStatus(id, 'APPROVED', this.hist('PENDING_APPROVAL', 'APPROVED', staff, 'admin', note)));
  }
  rejectPayment(staff: Staff, id: string, note: string) {
    this.assertAdmin(staff);
    const x = this.payments.byId(id); if (!x) throw new NotFoundException('Payment not found');
    if (x.status !== 'PENDING_APPROVAL') throw new BadRequestException(`Payment is already ${String(x.status).toLowerCase()}`);
    return this.withPhoto(this.payments.applyStatus(id, 'REJECTED', this.hist('PENDING_APPROVAL', 'REJECTED', staff, 'admin', note)));
  }

  // ===================== STAFF-TO-STAFF TRANSFERS =====================
  createTransfer(staff: Staff, dto: CreateTransferDto) {
    // Idempotent retry — see createReceipt.
    if (dto.clientRef) { const dup = this.transfers.byClientRef(dto.clientRef); if (dup) return this.withPhoto(dup); }
    const amount = round2(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than 0');
    if (dto.toStaffId === staff.id) throw new BadRequestException('You cannot pay yourself');
    const to = this.staffStore.byId(dto.toStaffId);
    if (!to) throw new BadRequestException('Colleague not found');
    const at = new Date().toISOString();
    const rec: any = {
      id: '', fromId: staff.id, fromName: staff.name, toId: to.id, toName: to.name,
      amount, method: dto.method, narration: dto.narration || '', billPhoto: null, billMediaType: null,
      clientRef: dto.clientRef || null,
      status: 'PENDING_CONFIRM', createdAt: at, updatedAt: at,
      statusHistory: [this.hist(null, 'PENDING_CONFIRM', staff, staff.roles?.[0] || 'staff', `paid AED ${amount} to ${to.name}`)],
    };
    const created = this.transfers.create(rec);
    if (dto.billPhoto) this.transfers.attachPhoto(created.id, dto.billPhoto, dto.billMediaType);
    return this.withPhoto(this.transfers.byId(created.id));
  }
  listMyTransfers(staff: Staff, view?: string) { return this.transfers.all().filter(inView(viewOf(view))).filter((x) => x.fromId === staff.id || x.toId === staff.id).map((x) => this.withPhoto(x)); }
  transferPhoto(staff: Staff, id: string) {
    const x = this.transfers.byId(id); if (!x) throw new NotFoundException('Transfer not found');
    if (x.fromId !== staff.id && x.toId !== staff.id && !isFinance(staff)) throw new ForbiddenException('Not your transfer');
    const dataUrl = this.transfers.readBillPhoto(x); if (!dataUrl) throw new NotFoundException('No photo on this transfer');
    return { dataUrl };
  }
  private actTransfer(staff: Staff, id: string, to: string) {
    const x = this.transfers.byId(id); if (!x) throw new NotFoundException('Transfer not found');
    if (x.toId !== staff.id) throw new ForbiddenException('Only the person paid can confirm or decline');
    if (x.status !== 'PENDING_CONFIRM') throw new BadRequestException(`Transfer is already ${String(x.status).toLowerCase().replace('_', ' ')}`);
    return this.withPhoto(this.transfers.applyStatus(id, to, this.hist('PENDING_CONFIRM', to, staff, staff.roles?.[0] || 'staff', to === 'CONFIRMED' ? 'received confirmed' : 'declined')));
  }
  confirmTransfer(staff: Staff, id: string) { return this.actTransfer(staff, id, 'CONFIRMED'); }
  declineTransfer(staff: Staff, id: string) { return this.actTransfer(staff, id, 'DECLINED'); }
  /** Colleague picker for transfers — any staff may see names/roles (not passwords) to pay a coworker. */
  colleagues(staff: Staff) { return this.staffStore.list().filter((s: any) => s.id !== staff.id).map((s: any) => ({ id: s.id, name: s.name, roles: s.roles })); }

  // ===================== EOD (END-OF-DAY CASH-UP) =====================
  /**
   * One staff member's real cash day, derived READ-ONLY from the live stores
   * (nothing is written; no existing flow is touched). All aggregates:
   *   - are scoped to one Asia/Dubai calendar day (see dubaiDayWindow), and
   *   - EXCLUDE records with origin === 'july-import' (display-only history that
   *     already exists in Zoho — it must never count as live cash).
   *
   * cashOnHand — the physical company cash this person should be holding for the day:
   *     deliveredCash                  cash (not cheque) collected on orders THEY delivered
   *   + receiptsCash                   CASH-method receipts they collected (non-rejected)
   *   − paidOut                        cash they paid out: CASH company payments they created
   *                                    (non-rejected) + their APPROVED/SUBMITTED expenses paid
   *                                    from the advance float (own_money / company_card don't
   *                                    move company cash, so they are excluded)
   *   − transfersSentConfirmed         handovers they made that the receiver CONFIRMED
   *   + transfersReceivedConfirmed     cash handed TO them that they confirmed receiving
   * PENDING_CONFIRM sent transfers are NOT deducted — the cash is still formally theirs
   * until the receiver confirms; they are listed separately as "awaiting confirmation"
   * (all pending ones, not date-scoped, since yesterday's unconfirmed handover is still open).
   * Cheque collections are reported separately and never enter cashOnHand.
   */
  private eodCompute(employeeId: string, employeeName: string, dateStr?: string) {
    const w = dubaiDayWindow(dateStr);
    const notImported = (x: any) => x.origin !== EOD_EXCLUDED_ORIGIN;

    // ---- Orders delivered by this person today (actor = the statusHistory entry that
    //      moved the order to DELIVERED with byId === employeeId; cash figures come from
    //      the `collected` block written by updateStatus, falling back to the order total).
    const deliveredList: any[] = [];
    let deliveredCash = 0;
    let deliveredCheque = 0;
    for (const o of this.orders.allOrders()) {
      if (!notImported(o)) continue;
      if (o.status !== 'DELIVERED') continue;
      const h = (o.statusHistory || []).find((e: any) => e && e.to === 'DELIVERED' && e.byId === employeeId && inWindow(e.at, w));
      if (!h) continue;
      const amount = round2(o.collected && o.collected.amount != null ? o.collected.amount : o.total);
      const method = (o.collected && o.collected.method) || o.method || 'CASH_ON_DELIVERY';
      if (method === 'CHEQUE_ON_DELIVERY') deliveredCheque = round2(deliveredCheque + amount);
      else deliveredCash = round2(deliveredCash + amount);
      deliveredList.push({ orderId: o.id, customer: o.customerName || '—', total: round2(o.total), cashAmount: amount, cashMethod: method, at: h.at });
    }

    // ---- Receipts they collected today (all methods reported; REJECTED excluded —
    //      finance voided the record; only CASH-method receipts enter cashOnHand).
    const myReceipts = this.receipts.all().filter((x) =>
      notImported(x) && x.collectedById === employeeId && x.status !== 'REJECTED' && inWindow(x.createdAt, w));
    const receiptsTotal = round2(myReceipts.reduce((s, x) => s + (Number(x.collectedAmount) || 0), 0));
    const receiptsCash = round2(myReceipts.filter((x) => x.method === 'CASH').reduce((s, x) => s + (Number(x.collectedAmount) || 0), 0));

    // ---- Cash they paid out today.
    //      Payments: CASH-method company payments they created (REJECTED excluded); dated
    //      by their explicit `date` field, falling back to createdAt.
    const myPayments = this.payments.all().filter((x) =>
      notImported(x) && x.createdById === employeeId && x.method === 'CASH' && x.status !== 'REJECTED' &&
      (x.date ? x.date === w.date : inWindow(x.createdAt, w)));
    const paymentsTotal = round2(myPayments.reduce((s, x) => s + (Number(x.amount) || 0), 0));
    //      Expenses: their own expenses paid FROM the advance/cash float (paidFrom 'advance');
    //      REJECTED excluded. own_money / company_card don't reduce company cash held.
    const myExpenses = this.expenses.list({ employeeId }).filter((x) =>
      notImported(x) && x.paidFrom === 'advance' && x.status !== 'REJECTED' &&
      (x.date ? x.date === w.date : inWindow(x.createdAt, w)));
    const expensesTotal = round2(myExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0));
    const paidOutTotal = round2(paymentsTotal + expensesTotal);

    // ---- Staff-to-staff transfers (the existing dual-control handover flow).
    const allTrf = this.transfers.all().filter(notImported);
    const sentConfirmed = round2(allTrf.filter((x) => x.fromId === employeeId && x.status === 'CONFIRMED' && inWindow(x.createdAt, w))
      .reduce((s, x) => s + (Number(x.amount) || 0), 0));
    const receivedConfirmed = round2(allTrf.filter((x) => x.toId === employeeId && x.status === 'CONFIRMED' && inWindow(x.createdAt, w))
      .reduce((s, x) => s + (Number(x.amount) || 0), 0));
    // ALL of their still-pending sent handovers (not date-scoped — still outstanding).
    const sentPending = allTrf.filter((x) => x.fromId === employeeId && x.status === 'PENDING_CONFIRM')
      .map((x) => ({ id: x.id, toId: x.toId, toName: x.toName, amount: round2(x.amount), method: x.method, narration: x.narration || '', createdAt: x.createdAt }));
    const sentPendingTotal = round2(sentPending.reduce((s, x) => s + x.amount, 0));

    // cashOnHand per the formula documented above.
    const cashOnHand = round2(deliveredCash + receiptsCash - paidOutTotal - sentConfirmed + receivedConfirmed);

    return {
      date: w.date,
      employeeId,
      employeeName,
      delivered: { count: deliveredList.length, cashTotal: deliveredCash, chequeTotal: deliveredCheque, list: deliveredList },
      receiptsCollected: { count: myReceipts.length, total: receiptsTotal, cashTotal: receiptsCash },
      paidOut: {
        count: myPayments.length + myExpenses.length, total: paidOutTotal,
        payments: { count: myPayments.length, total: paymentsTotal },
        expenses: { count: myExpenses.length, total: expensesTotal },
      },
      transfers: { sentConfirmedTotal: sentConfirmed, receivedConfirmedTotal: receivedConfirmed, sentPendingTotal, sentPending },
      cashOnHand,
    };
  }
  /** Any authenticated staff — but ONLY their own day. */
  eodMine(staff: Staff, date?: string) { return this.eodCompute(staff.id, staff.name, date); }
  /** Another staff member's day — finance or admin only (same gate as the other finance reads). */
  eodForEmployee(staff: Staff, employeeId: string, date?: string) {
    this.assertFinance(staff);
    const emp = this.staffStore.byId(employeeId);
    if (!emp) throw new NotFoundException('Employee not found');
    return this.eodCompute(emp.id, emp.name, date);
  }

  // ===================== FINANCE-ORIGINATED ADVANCE (Stage C) =====================
  /**
   * Finance (or admin) hands a cash float DIRECTLY to a staff member. The record is written
   * to the SAME AdvanceStore (data/advances.json) the staff/Rashid flow uses, with the SAME
   * field set as RashidService.issueAdvance, so balanceFor()/ledgerFor() pick it up as a
   * normal `advance_issued` credit with NO changes to those functions. The only additions are
   * an optional `source:'finance'` marker (absent on older records — non-breaking for readers)
   * and a histEntry note recording that finance issued it, plus the actor id/name/role.
   */
  issueAdvance(staff: Staff, dto: IssueAdvanceDto) {
    this.assertFinance(staff); // finance||admin only — NOT the ordinary staff guard
    const emp = this.staffStore.byId(dto.employeeId);
    if (!emp) throw new BadRequestException('Employee not found');
    const amount = round2(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than 0');
    const at = new Date().toISOString();
    const role = isAdmin(staff) ? 'admin' : 'finance';
    const note = dto.note ? `finance-issued float · ${dto.note}` : 'finance-issued float';
    const rec: any = {
      id: '', employeeId: emp.id, employeeName: emp.name,
      amount, remark: dto.note || '',
      issuedBy: staff.name, issuedById: staff.id, issuedAt: at,
      source: 'finance', // optional origin marker; old records simply lack it
      status: 'ISSUED', acknowledgedAt: null, settledAt: null,
      updatedAt: at, statusHistory: [this.hist(null, 'ISSUED', staff, role, note)],
    };
    return this.advances.create(rec);
  }

  // ===================== OVERVIEW =====================
  summary(staff: Staff, view?: string) {
    this.assertFinance(staff);
    // Live Operations vs Historical Import standard (FACT-026, closes FACT-021/RISK-009):
    // DEFAULT is live-only — imported July records (origin:'july-import') were written with
    // exactly the statuses summed here (CONFIRMED/APPROVED) and must not read as live cash
    // flow. 'historical' = imported only; 'combined' = both, only on explicit request.
    const v = viewOf(view);
    const receipts = this.receipts.all().filter(inView(v));
    const payments = this.payments.all().filter(inView(v));
    const moneyIn = round2(receipts.filter((x) => x.status === 'CONFIRMED').reduce((s, x) => s + (Number(x.collectedAmount) || 0), 0));
    const moneyOut = round2(payments.filter((x) => x.status === 'APPROVED').reduce((s, x) => s + (Number(x.amount) || 0), 0));
    const chequesOutstanding = receipts.concat(payments)
      .filter((x) => x.method === 'CHEQUE' && x.cheque && (x.cheque.status === 'RECEIVED' || x.cheque.status === 'DEPOSITED'));
    const chequesBounced = receipts.concat(payments).filter((x) => x.cheque && x.cheque.status === 'BOUNCED').length;
    return {
      view: v,
      moneyIn, moneyOut, net: round2(moneyIn - moneyOut),
      receiptsPendingApproval: receipts.filter((x) => x.status === 'PENDING_APPROVAL').length,
      receiptsToConfirm: receipts.filter((x) => x.status === 'COLLECTED').length,
      paymentsPending: payments.filter((x) => x.status === 'PENDING_APPROVAL').length,
      chequesOutstanding: chequesOutstanding.length,
      chequesOutstandingAmount: round2(chequesOutstanding.reduce((s, x) => s + (Number(x.collectedAmount != null ? x.collectedAmount : x.amount) || 0), 0)),
      chequesBounced,
      receiptsCount: receipts.length, paymentsCount: payments.length,
    };
  }
}

@ApiTags('Finance')
@Controller('finance')
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  // ----- receipts -----
  @Public() @UseGuards(StaffAuthGuard) @Get('orders/:id/lookup')
  lookup(@Param('id') id: string) { return this.svc.orderLookup(id); }
  @Public() @UseGuards(StaffAuthGuard) @Post('receipts')
  createReceipt(@Body() dto: CreateReceiptDto, @Req() req: any) { return this.svc.createReceipt(req.staff, dto); }
  @Public() @UseGuards(StaffAuthGuard) @Get('receipts/mine')
  myReceipts(@Req() req: any, @Query('view') view?: string) { return this.svc.listMyReceipts(req.staff, view); }
  @Public() @UseGuards(StaffAuthGuard) @Get('receipts')
  allReceipts(@Query('status') status: string, @Req() req: any, @Query('view') view?: string) { return this.svc.listReceipts(req.staff, status, view); }
  @Public() @UseGuards(StaffAuthGuard) @Get('receipts/:id/photo')
  receiptPhoto(@Param('id') id: string, @Req() req: any) { return this.svc.receiptPhoto(req.staff, id); }
  @Public() @UseGuards(StaffAuthGuard) @Post('receipts/:id/approve')
  approveReceipt(@Param('id') id: string, @Body() dto: NoteDto, @Req() req: any) { return this.svc.approveDiscount(req.staff, id, dto?.note); }
  @Public() @UseGuards(StaffAuthGuard) @Post('receipts/:id/reject')
  rejectReceipt(@Param('id') id: string, @Body() dto: RejectDto, @Req() req: any) { return this.svc.rejectReceipt(req.staff, id, dto.note); }
  @Public() @UseGuards(StaffAuthGuard) @Post('receipts/:id/confirm')
  confirmReceipt(@Param('id') id: string, @Body() dto: NoteDto, @Req() req: any) { return this.svc.confirmReceived(req.staff, id, dto?.note); }
  @Public() @UseGuards(StaffAuthGuard) @Post('receipts/:id/cheque')
  receiptCheque(@Param('id') id: string, @Body() dto: ChequeActionDto, @Req() req: any) { return this.svc.receiptCheque(req.staff, id, dto.action, dto?.note); }

  // ----- cheques -----
  @Public() @UseGuards(StaffAuthGuard) @Get('cheques')
  cheques(@Query('status') status: string, @Req() req: any, @Query('view') view?: string) { return this.svc.listCheques(req.staff, status, view); }

  // ----- payments -----
  @Public() @UseGuards(StaffAuthGuard) @Get('payments/categories')
  paymentCategories(@Req() req: any) { return this.svc.paymentCategories(req.staff); }
  @Public() @UseGuards(StaffAuthGuard) @Put('payments/categories')
  setPaymentCategories(@Body() dto: CategoriesDto, @Req() req: any) { return this.svc.setPaymentCategories(req.staff, dto.categories); }
  @Public() @UseGuards(StaffAuthGuard) @Post('payments')
  createPayment(@Body() dto: CreatePaymentDto, @Req() req: any) { return this.svc.createPayment(req.staff, dto); }
  @Public() @UseGuards(StaffAuthGuard) @Get('payments')
  allPayments(@Query('status') status: string, @Req() req: any, @Query('view') view?: string) { return this.svc.listPayments(req.staff, status, view); }
  @Public() @UseGuards(StaffAuthGuard) @Get('payments/:id/photo')
  paymentPhoto(@Param('id') id: string, @Req() req: any) { return this.svc.paymentPhoto(req.staff, id); }
  @Public() @UseGuards(StaffAuthGuard) @Post('payments/:id/approve')
  approvePayment(@Param('id') id: string, @Body() dto: NoteDto, @Req() req: any) { return this.svc.approvePayment(req.staff, id, dto?.note); }
  @Public() @UseGuards(StaffAuthGuard) @Post('payments/:id/reject')
  rejectPayment(@Param('id') id: string, @Body() dto: RejectDto, @Req() req: any) { return this.svc.rejectPayment(req.staff, id, dto.note); }
  @Public() @UseGuards(StaffAuthGuard) @Post('payments/:id/cheque')
  paymentCheque(@Param('id') id: string, @Body() dto: ChequeActionDto, @Req() req: any) { return this.svc.paymentCheque(req.staff, id, dto.action, dto?.note); }

  // ----- transfers -----
  @Public() @UseGuards(StaffAuthGuard) @Get('colleagues')
  colleagues(@Req() req: any) { return this.svc.colleagues(req.staff); }
  @Public() @UseGuards(StaffAuthGuard) @Post('transfers')
  createTransfer(@Body() dto: CreateTransferDto, @Req() req: any) { return this.svc.createTransfer(req.staff, dto); }
  @Public() @UseGuards(StaffAuthGuard) @Get('transfers/mine')
  myTransfers(@Req() req: any, @Query('view') view?: string) { return this.svc.listMyTransfers(req.staff, view); }
  @Public() @UseGuards(StaffAuthGuard) @Get('transfers/:id/photo')
  transferPhoto(@Param('id') id: string, @Req() req: any) { return this.svc.transferPhoto(req.staff, id); }
  @Public() @UseGuards(StaffAuthGuard) @Post('transfers/:id/confirm')
  confirmTransfer(@Param('id') id: string, @Req() req: any) { return this.svc.confirmTransfer(req.staff, id); }
  @Public() @UseGuards(StaffAuthGuard) @Post('transfers/:id/decline')
  declineTransfer(@Param('id') id: string, @Req() req: any) { return this.svc.declineTransfer(req.staff, id); }

  // ----- EOD (end-of-day cash-up) -----
  // 'eod/mine' is declared BEFORE 'eod/:employeeId' so the literal wins the route match.
  @Public() @UseGuards(StaffAuthGuard) @Get('eod/mine')
  eodMine(@Query('date') date: string, @Req() req: any) { return this.svc.eodMine(req.staff, date); }
  @Public() @UseGuards(StaffAuthGuard) @Get('eod/:employeeId')
  eodFor(@Param('employeeId') employeeId: string, @Query('date') date: string, @Req() req: any) { return this.svc.eodForEmployee(req.staff, employeeId, date); }

  // ----- advances (finance-originated float, Stage C) -----
  @Public() @UseGuards(StaffAuthGuard) @Post('advances/issue')
  issueAdvance(@Body() dto: IssueAdvanceDto, @Req() req: any) { return this.svc.issueAdvance(req.staff, dto); }

  // ----- overview -----
  @Public() @UseGuards(StaffAuthGuard) @Get('summary')
  summary(@Req() req: any, @Query('view') view?: string) { return this.svc.summary(req.staff, view); }
}

// ---------------------------------------------------------------------------
// Oversight — a read-only finance + admin dashboard that unions all five
// staff-uploaded document stores (expenses, advances, receipts, payments,
// transfers) into one normalized list, each with its photo endpoint and its
// statusHistory trail. It NEVER writes: no create/transition/patch calls, no
// guard changes on the write routes it reads from. Stores are injected as-is
// (ExpenseStore/AdvanceStore come from RashidModule, which exports them).
// ---------------------------------------------------------------------------
type OversightDoc = {
  docType: 'expense' | 'receipt' | 'payment' | 'transfer' | 'advance';
  id: string;
  staff: { id: string; name: string };
  amount: number;
  date: string;
  status: string;
  category: string | null;
  paidFrom?: string;
  summary: string;
  hasPhoto: boolean;
  photoUrl: string | null;
  statusHistory: any[];
};

@Injectable()
export class OversightService {
  constructor(
    private readonly receipts: ReceiptStore,
    private readonly payments: PaymentStore,
    private readonly transfers: TransferStore,
    private readonly expenses: ExpenseStore,
    private readonly advances: AdvanceStore,
  ) {}

  private assertFinance(s: Staff) { if (!isFinance(s)) throw new ForbiddenException('Finance or admin only'); }

  // Newest-first ordering key: prefer an explicit create/issue timestamp.
  private tsOf(x: any): string { return x.createdAt || x.issuedAt || x.updatedAt || x.date || ''; }

  private normExpense(x: any): OversightDoc {
    return {
      docType: 'expense', id: x.id,
      staff: { id: x.employeeId, name: x.employeeName || x.employeeId },
      amount: round2(x.amount), date: x.date || (x.createdAt || '').slice(0, 10),
      status: x.status, category: x.category || null, paidFrom: x.paidFrom,
      summary: x.remark || '',
      hasPhoto: !!x.billPhoto, photoUrl: x.billPhoto ? `/api/expenses/${x.id}/photo` : null,
      statusHistory: x.statusHistory || [],
    };
  }
  private normReceipt(x: any): OversightDoc {
    return {
      docType: 'receipt', id: x.id,
      staff: { id: x.collectedById, name: x.collectedBy || x.collectedById },
      amount: round2(x.collectedAmount != null ? x.collectedAmount : x.billAmount),
      date: (x.createdAt || '').slice(0, 10),
      status: x.status, category: x.method || null,
      summary: x.customerName || x.narration || '',
      hasPhoto: !!x.billPhoto, photoUrl: x.billPhoto ? `/api/finance/receipts/${x.id}/photo` : null,
      statusHistory: x.statusHistory || [],
    };
  }
  private normPayment(x: any): OversightDoc {
    return {
      docType: 'payment', id: x.id,
      staff: { id: x.createdById, name: x.createdBy || x.createdById },
      amount: round2(x.amount), date: x.date || (x.createdAt || '').slice(0, 10),
      status: x.status, category: x.category || x.method || null,
      summary: x.payee || x.narration || '',
      hasPhoto: !!x.billPhoto, photoUrl: x.billPhoto ? `/api/finance/payments/${x.id}/photo` : null,
      statusHistory: x.statusHistory || [],
    };
  }
  private normTransfer(x: any): OversightDoc {
    return {
      docType: 'transfer', id: x.id,
      staff: { id: x.fromId, name: x.fromName || x.fromId },
      amount: round2(x.amount), date: (x.createdAt || '').slice(0, 10),
      status: x.status, category: x.method || null,
      summary: x.narration || (x.toName ? `to ${x.toName}` : ''),
      hasPhoto: !!x.billPhoto, photoUrl: x.billPhoto ? `/api/finance/transfers/${x.id}/photo` : null,
      statusHistory: x.statusHistory || [],
    };
  }
  private normAdvance(x: any): OversightDoc {
    return {
      docType: 'advance', id: x.id,
      staff: { id: x.employeeId, name: x.employeeName || x.employeeId },
      amount: round2(x.amount), date: (x.issuedAt || '').slice(0, 10),
      status: x.status, category: null,
      summary: x.settlementNote || x.remark || '',
      hasPhoto: false, photoUrl: null,
      statusHistory: x.statusHistory || [],
    };
  }

  /** Union all five stores into normalized docs, newest-first. Empty stores → []. */
  private allDocs(): OversightDoc[] {
    const rows: { ts: string; doc: OversightDoc }[] = [];
    const push = (raw: any[], fn: (x: any) => OversightDoc) => {
      for (const x of raw || []) rows.push({ ts: this.tsOf(x), doc: fn(x) });
    };
    try { push(this.expenses.list(), (x) => this.normExpense(x)); } catch (e) { /* empty store */ }
    try { push(this.advances.list(), (x) => this.normAdvance(x)); } catch (e) { /* empty store */ }
    try { push(this.receipts.all(), (x) => this.normReceipt(x)); } catch (e) { /* empty store */ }
    try { push(this.payments.all(), (x) => this.normPayment(x)); } catch (e) { /* empty store */ }
    try { push(this.transfers.all(), (x) => this.normTransfer(x)); } catch (e) { /* empty store */ }
    rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)); // newest first
    return rows.map((r) => r.doc);
  }

  listDocuments(staff: Staff, f: { type?: string; staff?: string; status?: string; from?: string; to?: string }) {
    this.assertFinance(staff);
    const q = (f.staff || '').trim().toLowerCase();
    return this.allDocs().filter((d) => {
      if (f.type && d.docType !== f.type) return false;
      if (f.status && d.status !== f.status) return false;
      if (q && d.staff.id !== f.staff && !(d.staff.name || '').toLowerCase().includes(q)) return false;
      const day = (d.date || '').slice(0, 10);
      if (f.from && day && day < f.from) return false;
      if (f.to && day && day > f.to) return false;
      return true;
    });
  }

  documentsSummary(staff: Staff) {
    this.assertFinance(staff);
    const docs = this.allDocs();
    const byType: Record<string, number> = { expense: 0, receipt: 0, payment: 0, transfer: 0, advance: 0 };
    const byStatus: Record<string, number> = {};
    let totalValue = 0;
    let withPhotos = 0;
    for (const d of docs) {
      byType[d.docType] = (byType[d.docType] || 0) + 1;
      byStatus[d.status] = (byStatus[d.status] || 0) + 1;
      totalValue += Number(d.amount) || 0;
      if (d.hasPhoto) withPhotos += 1;
    }
    return { total: docs.length, byType, byStatus, totalValue: round2(totalValue), withPhotos };
  }
}

@ApiTags('Finance')
@Controller('finance')
export class OversightController {
  constructor(private readonly svc: OversightService) {}

  @Public() @UseGuards(StaffAuthGuard) @Get('documents')
  documents(
    @Query('type') type: string, @Query('staff') staff: string, @Query('status') status: string,
    @Query('from') from: string, @Query('to') to: string, @Req() req: any,
  ) { return this.svc.listDocuments(req.staff, { type, staff, status, from, to }); }

  @Public() @UseGuards(StaffAuthGuard) @Get('documents/summary')
  documentsSummary(@Req() req: any) { return this.svc.documentsSummary(req.staff); }
}

@Module({
  imports: [
    StaffAuthModule,
    CustomerPortalModule,
    RashidModule, // read-only reuse of ExpenseStore + AdvanceStore (no circular dep: rashid does not import finance)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [FinanceController, OversightController],
  providers: [ReceiptStore, PaymentStore, TransferStore, FinanceService, OversightService, StaffAuthGuard],
  exports: [ReceiptStore, PaymentStore, TransferStore], // reused by the admin clear-test-data module
})
export class FinanceModule {}
