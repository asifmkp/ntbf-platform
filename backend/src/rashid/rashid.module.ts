// ---------------------------------------------------------------------------
// Rashid module — Employee Expenses & Advances (Stage 1).
//
// An "employee" here is simply an existing staff account (data/staff.json,
// managed by the Staff-auth "Manage team" screen); there is NO separate employee
// entity. This module adds two file-backed stores — expenses.json and
// advances.json — and reuses the staff JWT + statusHistory audit patterns from
// the customer-portal module. It never touches the WhatsApp ingest pipeline.
// ---------------------------------------------------------------------------
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException,
  Param, Post, Put, Req, UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../common/decorators/public.decorator';
import { StaffAuthGuard, StaffAuthModule, StaffStore } from '../staff-auth/staff-auth.module';

// Fixed enums (Stage 1). Admin-editable category lists + category→ledger mapping
// arrive in Stage 4, so these stay hard-coded for now.
export const EXPENSE_CATEGORIES = [
  'Fuel', 'Salik', 'Parking', 'Vehicle Maintenance', 'Government Fees', 'Office', 'Hospitality', 'Other',
];
export const PAID_FROM = ['advance', 'own_money', 'company_card'];
export const EXPENSE_STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED'];
export const ADVANCE_STATUSES = ['ISSUED', 'ACKNOWLEDGED', 'SETTLED'];
const DEFAULT_THRESHOLD = 50; // AED — expenses at/under this auto-approve on submit.

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// ---- DTOs (global ValidationPipe runs with forbidNonWhitelisted: true, so every
//      accepted field must be declared here or the request is rejected 400). ----
class CreateExpenseDto {
  @IsString() date: string; // expense date, YYYY-MM-DD
  @IsNumber() amount: number; // AED
  @IsIn(EXPENSE_CATEGORIES) category: string;
  @IsIn(PAID_FROM) paidFrom: string;
  @IsOptional() @IsString() remark?: string;
  @IsOptional() @IsString() billPhoto?: string; // base64 data URL; stored on disk, not in the JSON
  @IsOptional() @IsString() billMediaType?: string;
  @IsOptional() @IsObject() ocr?: any; // what Claude prefilled (audit only)
}
class NoteDto { @IsOptional() @IsString() note?: string; }
class RejectDto { @IsString() note: string; } // rejection must carry a reason
class ConfigDto { @IsNumber() @Min(0) autoApproveThreshold: number; }
class IssueAdvanceDto {
  @IsString() employeeId: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() remark?: string;
}
class SettleDto { @IsOptional() @IsString() note?: string; }

type Staff = { id: string; roles: string[]; name: string };
const isAdmin = (s: Staff) => !!s && (s.roles || []).indexOf('admin') >= 0;

// ---- Expense store (data/expenses.json) ----
@Injectable()
export class ExpenseStore {
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'expenses.json');
  private readonly billsDir = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'expense-bills');
  private data: { seq: number; settings: { autoApproveThreshold: number }; items: any[] } =
    { seq: 2000, settings: { autoApproveThreshold: DEFAULT_THRESHOLD }, items: [] };

  constructor() {
    try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* empty */ }
    if (!this.data.settings) this.data.settings = { autoApproveThreshold: DEFAULT_THRESHOLD };
    if (typeof this.data.settings.autoApproveThreshold !== 'number') this.data.settings.autoApproveThreshold = DEFAULT_THRESHOLD;
    if (!Array.isArray(this.data.items)) this.data.items = [];
    if (typeof this.data.seq !== 'number') this.data.seq = 2000;
  }
  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* ignore */ }
  }
  private id() { this.data.seq += 1; return 'EXP-' + this.data.seq; }

  threshold() { return this.data.settings.autoApproveThreshold; }
  setThreshold(n: number) { this.data.settings.autoApproveThreshold = round2(n); this.save(); return this.data.settings.autoApproveThreshold; }

  /** Write a bill photo (base64 data URL or raw base64) to disk and record its path on the expense. */
  attachPhoto(id: string, dataUrl: string, mediaType?: string): boolean {
    const rec = this.byId(id); if (!rec) return false;
    try {
      const raw = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const mt = mediaType || (dataUrl.startsWith('data:') ? dataUrl.slice(5, dataUrl.indexOf(';')) : 'image/jpeg');
      const ext = mt.indexOf('png') >= 0 ? 'png' : 'jpg';
      fs.mkdirSync(this.billsDir, { recursive: true });
      fs.writeFileSync(path.join(this.billsDir, id + '.' + ext), Buffer.from(raw, 'base64'));
      rec.billPhoto = path.join('expense-bills', id + '.' + ext);
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
  listByEmployee(employeeId: string) { return this.data.items.filter((x) => x.employeeId === employeeId); }
  list(filter?: { status?: string; employeeId?: string }) {
    return this.data.items.filter((x) =>
      (!filter?.status || x.status === filter.status) && (!filter?.employeeId || x.employeeId === filter.employeeId));
  }
  applyStatus(id: string, to: string, entry: any) {
    const x = this.byId(id); if (!x) return null;
    x.status = to; x.updatedAt = entry.at;
    x.statusHistory = x.statusHistory || [];
    x.statusHistory.push(entry);
    this.save(); return x;
  }
}

// ---- Advance store (data/advances.json) ----
@Injectable()
export class AdvanceStore {
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'advances.json');
  private data: { seq: number; items: any[] } = { seq: 3000, items: [] };

  constructor() {
    try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* empty */ }
    if (!Array.isArray(this.data.items)) this.data.items = [];
    if (typeof this.data.seq !== 'number') this.data.seq = 3000;
  }
  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* ignore */ }
  }
  private id() { this.data.seq += 1; return 'ADV-' + this.data.seq; }

  create(rec: any) { rec.id = this.id(); this.data.items.unshift(rec); this.save(); return rec; }
  byId(id: string) { return this.data.items.find((x) => x.id === id); }
  listByEmployee(employeeId: string) { return this.data.items.filter((x) => x.employeeId === employeeId); }
  list() { return this.data.items.slice(); }
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
export class RashidService {
  constructor(
    private readonly expenses: ExpenseStore,
    private readonly advances: AdvanceStore,
    private readonly staffStore: StaffStore,
  ) {}

  private assertAdmin(staff: Staff) { if (!isAdmin(staff)) throw new ForbiddenException('Admins only'); }
  private histEntry(from: string | null, to: string, staff: Staff, actingRole: string, note?: string, override = false) {
    const e: any = { from, to, by: staff.name, byId: staff.id, role: actingRole, at: new Date().toISOString(), override };
    if (note) e.note = note;
    return e;
  }

  // ---- Expenses ----
  createExpense(staff: Staff, dto: CreateExpenseDto) {
    const amount = round2(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than 0');
    const at = new Date().toISOString();
    const threshold = this.expenses.threshold();
    const autoApproved = amount <= threshold;
    const rec: any = {
      id: '', employeeId: staff.id, employeeName: staff.name,
      date: dto.date, amount, category: dto.category, paidFrom: dto.paidFrom,
      remark: dto.remark || '', billPhoto: null, billMediaType: null, ocr: dto.ocr || null,
      status: autoApproved ? 'APPROVED' : 'SUBMITTED', autoApproved,
      createdAt: at, updatedAt: at,
      statusHistory: [this.histEntry(null, 'SUBMITTED', staff, staff.roles?.[0] || 'staff')],
    };
    if (autoApproved) {
      rec.statusHistory.push({ from: 'SUBMITTED', to: 'APPROVED', by: 'System', byId: 'system', role: 'system', at, override: false, note: `auto-approved (≤ AED ${threshold})` });
    }
    const created = this.expenses.create(rec);
    // Persist the bill photo to disk under the real id (kept out of the JSON store to keep it lean).
    if (dto.billPhoto) this.expenses.attachPhoto(created.id, dto.billPhoto, dto.billMediaType);
    return this.publicExpense(created);
  }
  private publicExpense(x: any) { return { ...x, hasPhoto: !!x.billPhoto }; }

  listMyExpenses(staff: Staff) { return this.expenses.listByEmployee(staff.id).map((x) => this.publicExpense(x)); }
  listAllExpenses(staff: Staff, status?: string, employeeId?: string) {
    this.assertAdmin(staff);
    return this.expenses.list({ status, employeeId }).map((x) => this.publicExpense(x));
  }
  expensePhoto(staff: Staff, id: string) {
    const x = this.expenses.byId(id);
    if (!x) throw new NotFoundException('Expense not found');
    if (!isAdmin(staff) && x.employeeId !== staff.id) throw new ForbiddenException('Not your expense');
    const dataUrl = this.expenses.readBillPhoto(x);
    if (!dataUrl) throw new NotFoundException('No photo on this expense');
    return { dataUrl };
  }
  approveExpense(staff: Staff, id: string, note?: string) {
    this.assertAdmin(staff);
    const x = this.expenses.byId(id);
    if (!x) throw new NotFoundException('Expense not found');
    if (x.status !== 'SUBMITTED') throw new BadRequestException(`Expense is already ${x.status.toLowerCase()}`);
    const updated = this.expenses.applyStatus(id, 'APPROVED', this.histEntry('SUBMITTED', 'APPROVED', staff, 'admin', note));
    return this.publicExpense(updated);
  }
  rejectExpense(staff: Staff, id: string, note: string) {
    this.assertAdmin(staff);
    const x = this.expenses.byId(id);
    if (!x) throw new NotFoundException('Expense not found');
    if (x.status !== 'SUBMITTED') throw new BadRequestException(`Expense is already ${x.status.toLowerCase()}`);
    const updated = this.expenses.applyStatus(id, 'REJECTED', this.histEntry('SUBMITTED', 'REJECTED', staff, 'admin', note));
    return this.publicExpense(updated);
  }
  getConfig(staff: Staff) { this.assertAdmin(staff); return { autoApproveThreshold: this.expenses.threshold() }; }
  setConfig(staff: Staff, dto: ConfigDto) { this.assertAdmin(staff); return { autoApproveThreshold: this.expenses.setThreshold(dto.autoApproveThreshold) }; }

  // ---- Advances ----
  issueAdvance(staff: Staff, dto: IssueAdvanceDto) {
    this.assertAdmin(staff);
    const emp = this.staffStore.byId(dto.employeeId);
    if (!emp) throw new BadRequestException('Employee not found');
    const at = new Date().toISOString();
    const rec: any = {
      id: '', employeeId: emp.id, employeeName: emp.name,
      amount: round2(dto.amount), remark: dto.remark || '',
      issuedBy: staff.name, issuedById: staff.id, issuedAt: at,
      status: 'ISSUED', acknowledgedAt: null, settledAt: null,
      updatedAt: at, statusHistory: [this.histEntry(null, 'ISSUED', staff, 'admin', dto.remark)],
    };
    return this.advances.create(rec);
  }
  listMyAdvances(staff: Staff) {
    return { advances: this.advances.listByEmployee(staff.id), balance: this.balanceFor(staff.id) };
  }
  ackAdvance(staff: Staff, id: string) {
    const x = this.advances.byId(id);
    if (!x) throw new NotFoundException('Advance not found');
    if (x.employeeId !== staff.id) throw new ForbiddenException('Not your advance');
    if (x.status !== 'ISSUED') throw new BadRequestException(`Advance is already ${x.status.toLowerCase()}`);
    return this.advances.applyStatus(id, 'ACKNOWLEDGED', { ...this.histEntry('ISSUED', 'ACKNOWLEDGED', staff, staff.roles?.[0] || 'staff', 'receipt acknowledged'), }, { acknowledgedAt: new Date().toISOString() });
  }
  settleAdvance(staff: Staff, id: string, note?: string) {
    this.assertAdmin(staff);
    const x = this.advances.byId(id);
    if (!x) throw new NotFoundException('Advance not found');
    if (x.status === 'SETTLED') throw new BadRequestException('Advance is already settled');
    return this.advances.applyStatus(id, 'SETTLED', this.histEntry(x.status, 'SETTLED', staff, 'admin', note), { settledAt: new Date().toISOString(), settlementNote: note || '' });
  }
  listAllAdvances(staff: Staff) { this.assertAdmin(staff); return this.advances.list(); }

  /**
   * Running balance for one employee (AED):
   *   outstanding advances (ISSUED + ACKNOWLEDGED)  −  approved advance-paid expenses.
   * SETTLED advances drop out of the running figure. A negative balance means the
   * company owes the employee (advance-paid expenses exceeded advances held).
   * reimbursementOwed tracks approved own_money expenses (company owes the employee,
   * separate from the advance float).
   */
  balanceFor(employeeId: string) {
    const advs = this.advances.listByEmployee(employeeId);
    const exps = this.expenses.listByEmployee(employeeId);
    const advanced = advs.filter((a) => a.status === 'ISSUED' || a.status === 'ACKNOWLEDGED').reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const settled = advs.filter((a) => a.status === 'SETTLED').reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const spentFromAdvance = exps.filter((e) => e.status === 'APPROVED' && e.paidFrom === 'advance').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const reimbursementOwed = exps.filter((e) => e.status === 'APPROVED' && e.paidFrom === 'own_money').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return {
      advanced: round2(advanced), settled: round2(settled), spentFromAdvance: round2(spentFromAdvance),
      balance: round2(advanced - spentFromAdvance), reimbursementOwed: round2(reimbursementOwed),
    };
  }
  /** Admin dashboard: one balance row per employee who has any advance or expense. */
  balances(staff: Staff) {
    this.assertAdmin(staff);
    const ids = new Set<string>();
    for (const a of this.advances.list()) ids.add(a.employeeId);
    for (const e of this.expenses.list()) ids.add(e.employeeId);
    const rows: any[] = [];
    for (const id of ids) {
      const emp = this.staffStore.byId(id);
      const anyAdv = this.advances.listByEmployee(id)[0];
      const anyExp = this.expenses.listByEmployee(id)[0];
      const name = (emp && emp.name) || (anyAdv && anyAdv.employeeName) || (anyExp && anyExp.employeeName) || id;
      rows.push({ employeeId: id, name, ...this.balanceFor(id) });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }
}

@ApiTags('Employee expenses & advances')
@Controller()
export class RashidController {
  constructor(private readonly svc: RashidService) {}

  // ----- Expenses -----
  @Public() @UseGuards(StaffAuthGuard) @Post('expenses')
  createExpense(@Body() dto: CreateExpenseDto, @Req() req: any) { return this.svc.createExpense(req.staff, dto); }

  @Public() @UseGuards(StaffAuthGuard) @Get('expenses/mine')
  myExpenses(@Req() req: any) { return this.svc.listMyExpenses(req.staff); }

  @Public() @UseGuards(StaffAuthGuard) @Get('expenses/config')
  getConfig(@Req() req: any) { return this.svc.getConfig(req.staff); }

  @Public() @UseGuards(StaffAuthGuard) @Put('expenses/config')
  setConfig(@Body() dto: ConfigDto, @Req() req: any) { return this.svc.setConfig(req.staff, dto); }

  @Public() @UseGuards(StaffAuthGuard) @Get('expenses')
  allExpenses(@Req() req: any) {
    const status = req.query?.status; const employeeId = req.query?.employeeId;
    return this.svc.listAllExpenses(req.staff, status, employeeId);
  }

  @Public() @UseGuards(StaffAuthGuard) @Get('expenses/:id/photo')
  photo(@Param('id') id: string, @Req() req: any) { return this.svc.expensePhoto(req.staff, id); }

  @Public() @UseGuards(StaffAuthGuard) @Post('expenses/:id/approve')
  approve(@Param('id') id: string, @Body() dto: NoteDto, @Req() req: any) { return this.svc.approveExpense(req.staff, id, dto?.note); }

  @Public() @UseGuards(StaffAuthGuard) @Post('expenses/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto, @Req() req: any) { return this.svc.rejectExpense(req.staff, id, dto.note); }

  // ----- Advances -----
  @Public() @UseGuards(StaffAuthGuard) @Post('advances')
  issue(@Body() dto: IssueAdvanceDto, @Req() req: any) { return this.svc.issueAdvance(req.staff, dto); }

  @Public() @UseGuards(StaffAuthGuard) @Get('advances/mine')
  myAdvances(@Req() req: any) { return this.svc.listMyAdvances(req.staff); }

  @Public() @UseGuards(StaffAuthGuard) @Get('advances/balances')
  balances(@Req() req: any) { return this.svc.balances(req.staff); }

  @Public() @UseGuards(StaffAuthGuard) @Get('advances')
  allAdvances(@Req() req: any) { return this.svc.listAllAdvances(req.staff); }

  @Public() @UseGuards(StaffAuthGuard) @Post('advances/:id/ack')
  ack(@Param('id') id: string, @Req() req: any) { return this.svc.ackAdvance(req.staff, id); }

  @Public() @UseGuards(StaffAuthGuard) @Post('advances/:id/settle')
  settle(@Param('id') id: string, @Body() dto: SettleDto, @Req() req: any) { return this.svc.settleAdvance(req.staff, id, dto?.note); }
}

@Module({
  imports: [
    StaffAuthModule, // shares the single StaffStore instance (so newly-created staff are visible)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [RashidController],
  providers: [ExpenseStore, AdvanceStore, RashidService, StaffAuthGuard],
  exports: [ExpenseStore, AdvanceStore], // read-only reuse by the finance oversight dashboard
})
export class RashidModule {}
