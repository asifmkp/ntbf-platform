// ---------------------------------------------------------------------------
// Admin: July 2026 history backfill (SERVER-ONLY, display-only history).
//
// Imports the July 1–20 2026 transactions (validated against the books) into
// the app's file-backed stores so the owner sees them in Documents / Finance
// oversight, receipts, expenses and orders lists. Mirrors the clear-test-data
// module's gating: admin JWT (403 otherwise) + an explicit confirm token.
//
//   POST /api/admin/backfill-july   body { mode: 'dry-run'|'write'|'remove', confirm? }
//     dry-run : validate the bundled JSON, resolve staff, dedupe by reference,
//               report per-type counts + sums vs the expected totals. NO writes.
//     write   : confirm must be 'IMPORT'. Idempotent import (refs already in a
//               store are skipped) — safe to re-run. Same report shape.
//     remove  : confirm must be 'REMOVE-JULY'. Deletes ONLY records whose
//               origin === JULY_IMPORT_ORIGIN from all five stores.
//
// ⚠️  ZOHO DOUBLE-POST GUARD — READ BEFORE BUILDING ANY APP→ZOHO SYNC ⚠️
// July 2026 ALREADY EXISTS IN ZOHO BOOKS. Every record this module writes is
// tagged origin === JULY_IMPORT_ORIGIN ('july-import'). Any future app→Zoho
// sync MUST exclude records carrying this origin — pushing them would post the
// entire month a second time. This import is history-display only.
//
// Mapping (store record shapes copied from the live create paths):
//   orders    → CustomerStore.orders   status DELIVERED, one summary line, total = gross
//   receipts  → ReceiptStore           status CONFIRMED, collector = resolved staff
//   payments  → PaymentStore           status APPROVED, payee = vendor, category Supplier
//   expenses  → ExpenseStore           status APPROVED, paidFrom 'company_card' (a
//               NON-advance value: balanceFor() only counts paidFrom==='advance'
//               and reimbursement only 'own_money', so advance math is untouched)
//   transfers → TransferStore          status CONFIRMED; cash boxes with no app staff
//               account become display-name-only parties (fromId/toId = null) —
//               staff accounts are NEVER invented.
// Every record: origin marker + reference + ONE honest statusHistory entry
// (null → terminal status, by "July import", at the record's real July date).
// ---------------------------------------------------------------------------
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, Post, Req, UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { StaffAuthGuard, StaffAuthModule, StaffStore } from '../staff-auth/staff-auth.module';
import { CustomerPortalModule, CustomerStore } from '../customer-portal/customer-portal.module';
import { RashidModule, ExpenseStore } from '../rashid/rashid.module';
import { FinanceModule, ReceiptStore, PaymentStore, TransferStore } from '../finance/finance.module';
import * as backfillData from './july-backfill.data.json';

/**
 * Origin marker stamped on every imported record.
 * ⚠️ Any future app→Zoho sync MUST exclude records with this origin — July
 * already exists in Zoho; syncing them would double-post the month.
 */
export const JULY_IMPORT_ORIGIN = 'july-import';

const WRITE_TOKEN = 'IMPORT';
const REMOVE_TOKEN = 'REMOVE-JULY';

type Staff = { id: string; roles: string[]; name: string };
const isAdmin = (s: Staff) => !!s && (s.roles || []).indexOf('admin') >= 0;
const isFinanceOrAdmin = (s: Staff) => !!s && (s.roles || []).some((r) => r === 'admin' || r === 'finance');
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

class BackfillDto {
  @IsIn(['dry-run', 'write', 'remove']) mode: string;
  @IsOptional() @IsString() confirm?: string;
}

type TypeReport = {
  expected: { count: number; sum: number };
  toImport: number; toImportSum: number;
  alreadyPresent: number;
  imported: number;
  skipped: { ref: string; reason: string }[];
};

@Injectable()
export class JulyBackfillService {
  constructor(
    private readonly orders: CustomerStore,
    private readonly receipts: ReceiptStore,
    private readonly payments: PaymentStore,
    private readonly expenses: ExpenseStore,
    private readonly transfers: TransferStore,
    private readonly staffStore: StaffStore,
  ) {}

  private assertAdmin(s: Staff) { if (!isAdmin(s)) throw new ForbiddenException('Admins only'); }

  /**
   * Read-only aggregates of the imported July history (origin === JULY_IMPORT_ORIGIN)
   * across all five stores — feeds the owner's "Historical Imported Data" card
   * (Live-vs-Historical standard, FACT-026). Computed live from the stores, never
   * from the bundled JSON, so it stays honest if history is ever removed.
   */
  historySummary(staff: Staff) {
    if (!isFinanceOrAdmin(staff)) throw new ForbiddenException('Finance or admin only');
    const byOrigin = (x: any) => x && x.origin === JULY_IMPORT_ORIGIN;
    const orders = this.orders.rawOrders().filter(byOrigin);
    const receipts = this.receipts.all().filter(byOrigin);
    const payments = this.payments.all().filter(byOrigin);
    const expenses = this.expenses.list().filter(byOrigin);
    const transfers = this.transfers.all().filter(byOrigin);
    const sum = (xs: any[], f: string) => round2(xs.reduce((s, x) => s + (Number(x[f]) || 0), 0));
    const dates = [...orders, ...receipts, ...payments, ...expenses, ...transfers]
      .map((x) => String(x.createdAt || '')).filter(Boolean).sort();
    const documents = receipts.length + payments.length + expenses.length + transfers.length;
    return {
      origin: JULY_IMPORT_ORIGIN,
      period: dates.length ? { from: dates[0].slice(0, 10), to: dates[dates.length - 1].slice(0, 10) } : null,
      // Live import executed 2026-07-21 (owner-run, PR #19 — recorded in /ai STATUS/AGENT_LOG).
      importDate: '2026-07-21',
      counts: { orders: orders.length, receipts: receipts.length, payments: payments.length, expenses: expenses.length, transfers: transfers.length, documents, total: orders.length + documents },
      totals: {
        revenue: sum(orders, 'total'),
        collections: sum(receipts, 'collectedAmount'),
        supplierPayments: sum(payments, 'amount'),
        expenses: sum(expenses, 'amount'),
        transfers: sum(transfers, 'amount'),
        documentsTotal: round2(sum(receipts, 'collectedAmount') + sum(payments, 'amount') + sum(expenses, 'amount') + sum(transfers, 'amount')),
      },
    };
  }

  /** One honest audit entry: null → terminal status, dated the record's real July date. */
  private hist(to: string, adminId: string, at: string, ref: string) {
    return { from: null, to, by: 'July import', byId: adminId, role: 'import', at, override: false, note: `Imported from July 2026 books (ref ${ref})` };
  }

  /** Resolve an app username to the live staff account, or null (never invents staff). */
  private staffByUsername(username: string | null) {
    return username ? (this.staffStore.byUsername(username) || null) : null;
  }

  private newReport(expected: { count: number; sum: number }): TypeReport {
    return { expected, toImport: 0, toImportSum: 0, alreadyPresent: 0, imported: 0, skipped: [] };
  }

  /**
   * Shared dry-run / write walk. For each type: dedupe by reference against the
   * live store, resolve staff, and (write mode only) insert the pre-shaped record.
   */
  private run(staff: Staff, write: boolean) {
    const data: any = backfillData;
    const adminAcct = this.staffStore.byUsername('asif');
    const adminId = adminAcct ? adminAcct.id : staff.id;

    const existingRefs = {
      orders: new Set(this.orders.rawOrders().map((o: any) => o.reference).filter(Boolean)),
      receipts: new Set(this.receipts.all().map((x: any) => x.reference).filter(Boolean)),
      payments: new Set(this.payments.all().map((x: any) => x.reference).filter(Boolean)),
      expenses: new Set(this.expenses.list().map((x: any) => x.reference).filter(Boolean)),
      transfers: new Set(this.transfers.all().map((x: any) => x.reference).filter(Boolean)),
    };

    const rep = {
      orders: this.newReport(data.expected.orders),
      receipts: this.newReport(data.expected.receipts),
      payments: this.newReport(data.expected.payments),
      expenses: this.newReport(data.expected.expenses),
      transfers: this.newReport(data.expected.transfers),
    };
    const nameOnlyTransferParties = new Set<string>();

    // ---- Orders (sales history) → CustomerStore ----
    for (const s of data.orders) {
      if (existingRefs.orders.has(s.ref)) { rep.orders.alreadyPresent++; continue; }
      const actor = this.staffByUsername(s.user);
      if (!actor) { rep.orders.skipped.push({ ref: s.ref, reason: `skipped: no matching staff account (${s.user})` }); continue; }
      rep.orders.toImport++; rep.orders.toImportSum = round2(rep.orders.toImportSum + s.total);
      if (!write) continue;
      // Link to an existing customer ONLY on a trivial (exact, case-insensitive) name
      // match; otherwise the name rides on the order record itself (no accounts created).
      const cust = this.orders.findCustomerByExactName(s.customer);
      this.orders.importOrder({
        customerId: cust ? cust.id : null,
        customerName: s.customer, customerPhone: cust ? cust.phone || '' : '',
        items: [{ id: null, name: `July 2026 sale — ${s.ref}`, unit: '', qty: 1, price: s.total, imported: true }],
        total: s.total, method: 'CASH_ON_DELIVERY', address: '',
        note: `Imported from July 2026 books (ref ${s.ref})`,
        status: 'DELIVERED', origin: JULY_IMPORT_ORIGIN, source: JULY_IMPORT_ORIGIN,
        reference: s.ref, importUser: s.user,
        createdAt: s.at, updatedAt: s.at,
        statusHistory: [this.hist('DELIVERED', adminId, s.at, s.ref)],
      });
      rep.orders.imported++;
    }

    // ---- Receipts (money in) → ReceiptStore ----
    for (const s of data.receipts) {
      if (existingRefs.receipts.has(s.ref)) { rep.receipts.alreadyPresent++; continue; }
      const collector = this.staffByUsername(s.user);
      if (!collector) { rep.receipts.skipped.push({ ref: s.ref, reason: `skipped: no matching staff account (${s.user})` }); continue; }
      rep.receipts.toImport++; rep.receipts.toImportSum = round2(rep.receipts.toImportSum + s.amount);
      if (!write) continue;
      this.receipts.create({
        id: '', type: 'CUSTOMER', orderId: null, customerId: null,
        customerName: s.customer, customerPhone: '',
        billAmount: null, billItems: null, collectedAmount: s.amount, discount: 0,
        method: 'CASH', cheque: null,
        narration: `Imported from July 2026 books (ref ${s.ref})${s.cashLabel ? ' · ' + s.cashLabel : ''}`,
        billPhoto: null, billMediaType: null,
        collectedBy: collector.name, collectedById: collector.id, collectedByRole: (collector.roles || [])[0] || 'staff',
        origin: JULY_IMPORT_ORIGIN, reference: s.ref, importUser: s.user,
        status: 'CONFIRMED', createdAt: s.at, updatedAt: s.at,
        statusHistory: [this.hist('CONFIRMED', adminId, s.at, s.ref)],
      });
      rep.receipts.imported++;
    }

    // ---- Vendor payments (money out) → PaymentStore ----
    for (const s of data.payments) {
      if (existingRefs.payments.has(s.ref)) { rep.payments.alreadyPresent++; continue; }
      const creator = this.staffByUsername(s.user);
      if (!creator) { rep.payments.skipped.push({ ref: s.ref, reason: `skipped: no matching staff account (${s.user})` }); continue; }
      rep.payments.toImport++; rep.payments.toImportSum = round2(rep.payments.toImportSum + s.amount);
      if (!write) continue;
      this.payments.create({
        id: '', payee: s.payee, amount: s.amount, method: 'CASH', category: 'Supplier',
        date: s.date, cheque: null,
        narration: `Imported from July 2026 books (ref ${s.ref})${s.narration ? ' · ' + s.narration : ''}`,
        billPhoto: null, billMediaType: null,
        createdBy: creator.name, createdById: creator.id, createdByRole: (creator.roles || [])[0] || 'staff',
        origin: JULY_IMPORT_ORIGIN, reference: s.ref, importUser: s.user,
        status: 'APPROVED', createdAt: s.at, updatedAt: s.at,
        statusHistory: [this.hist('APPROVED', adminId, s.at, s.ref)],
      });
      rep.payments.imported++;
    }

    // ---- Expenses → ExpenseStore ----
    // paidFrom 'company_card' (company cash, NON-advance): RashidService.balanceFor()
    // counts only paidFrom==='advance' into the advance float and only 'own_money'
    // into reimbursementOwed, so these records leave the advance math untouched.
    for (const s of data.expenses) {
      if (existingRefs.expenses.has(s.ref)) { rep.expenses.alreadyPresent++; continue; }
      const emp = this.staffByUsername(s.user);
      if (!emp) { rep.expenses.skipped.push({ ref: s.ref, reason: `skipped: no matching staff account (${s.user})` }); continue; }
      rep.expenses.toImport++; rep.expenses.toImportSum = round2(rep.expenses.toImportSum + s.amount);
      if (!write) continue;
      this.expenses.create({
        id: '', employeeId: emp.id, employeeName: emp.name,
        date: s.date, amount: s.amount, category: s.category, paidFrom: 'company_card',
        remark: `${s.label}${s.narration ? ' — ' + s.narration : ''} (ref ${s.ref}, July 2026 import)`,
        billPhoto: null, billMediaType: null, ocr: null,
        origin: JULY_IMPORT_ORIGIN, reference: s.ref, importUser: s.user,
        status: 'APPROVED', autoApproved: false,
        createdAt: s.at, updatedAt: s.at,
        statusHistory: [this.hist('APPROVED', adminId, s.at, s.ref)],
      });
      rep.expenses.imported++;
    }

    // ---- Transfers (contras) → TransferStore ----
    // The transfer shape tolerates a display-name-only party (oversight shows
    // fromName/toName; confirm/decline never run on terminal CONFIRMED records),
    // so cash boxes without an app staff account keep their label with a null id.
    for (const s of data.transfers) {
      if (existingRefs.transfers.has(s.ref)) { rep.transfers.alreadyPresent++; continue; }
      const from = this.staffByUsername(s.fromUser);
      const to = this.staffByUsername(s.toUser);
      if (!from) nameOnlyTransferParties.add(s.fromLabel);
      if (!to) nameOnlyTransferParties.add(s.toLabel);
      rep.transfers.toImport++; rep.transfers.toImportSum = round2(rep.transfers.toImportSum + s.amount);
      if (!write) continue;
      this.transfers.create({
        id: '',
        fromId: from ? from.id : null, fromName: from ? from.name : s.fromLabel,
        toId: to ? to.id : null, toName: to ? to.name : s.toLabel,
        amount: s.amount, method: 'CASH',
        narration: `Imported from July 2026 books (ref ${s.ref}) · ${s.fromLabel} → ${s.toLabel}`,
        billPhoto: null, billMediaType: null,
        origin: JULY_IMPORT_ORIGIN, reference: s.ref, importUser: s.user,
        status: 'CONFIRMED', createdAt: s.at, updatedAt: s.at,
        statusHistory: [this.hist('CONFIRMED', adminId, s.at, s.ref)],
      });
      rep.transfers.imported++;
    }

    const types = ['orders', 'receipts', 'payments', 'expenses', 'transfers'] as const;
    const totals = {
      toImport: types.reduce((n, t) => n + rep[t].toImport, 0),
      toImportSum: round2(types.reduce((n, t) => n + rep[t].toImportSum, 0)),
      alreadyPresent: types.reduce((n, t) => n + rep[t].alreadyPresent, 0),
      imported: types.reduce((n, t) => n + rep[t].imported, 0),
      skipped: types.reduce((n, t) => n + rep[t].skipped.length, 0),
      expectedCount: types.reduce((n, t) => n + rep[t].expected.count, 0),
      expectedSum: round2(types.reduce((n, t) => n + rep[t].expected.sum, 0)),
    };
    return {
      mode: write ? 'write' : 'dry-run',
      origin: JULY_IMPORT_ORIGIN,
      zohoWarning: 'July 2026 already exists in Zoho — records with origin "july-import" must be EXCLUDED from any future app→Zoho sync.',
      types: rep,
      totals,
      nameOnlyTransferParties: Array.from(nameOnlyTransferParties),
      at: new Date().toISOString(),
    };
  }

  backfill(staff: Staff, dto: BackfillDto) {
    this.assertAdmin(staff);
    if (dto.mode === 'dry-run') return this.run(staff, false);
    if (dto.mode === 'write') {
      if (dto.confirm !== WRITE_TOKEN) throw new BadRequestException(`Type ${WRITE_TOKEN} to confirm`);
      return this.run(staff, true);
    }
    // mode === 'remove' — selective unwind: ONLY origin==='july-import' records go.
    if (dto.confirm !== REMOVE_TOKEN) throw new BadRequestException(`Type ${REMOVE_TOKEN} to confirm`);
    const byOrigin = (x: any) => x && x.origin === JULY_IMPORT_ORIGIN;
    const removed = {
      orders: this.orders.removeOrdersWhere(byOrigin),
      receipts: this.receipts.removeWhere(byOrigin),
      payments: this.payments.removeWhere(byOrigin),
      expenses: this.expenses.removeWhere(byOrigin),
      transfers: this.transfers.removeWhere(byOrigin),
    };
    const total = Object.values(removed).reduce((a, b) => a + b, 0);
    return { mode: 'remove', origin: JULY_IMPORT_ORIGIN, removed, total, at: new Date().toISOString() };
  }
}

@ApiTags('Admin')
@Controller('admin')
export class JulyBackfillController {
  constructor(private readonly svc: JulyBackfillService) {}

  // POST /api/admin/backfill-july — admin only (403 otherwise). The global
  // AuditInterceptor records this POST (actor + outcome) in the audit log.
  @Public() @UseGuards(StaffAuthGuard) @Post('backfill-july')
  backfill(@Body() dto: BackfillDto, @Req() req: any) { return this.svc.backfill(req.staff, dto); }

  // GET /api/admin/july-history/summary — finance/admin. Read-only aggregates of the
  // imported history for the Historical Imported Data card (FACT-026 standard).
  @Public() @UseGuards(StaffAuthGuard) @Get('july-history/summary')
  historySummary(@Req() req: any) { return this.svc.historySummary(req.staff); }
}

@Module({
  imports: [
    StaffAuthModule,      // StaffStore (resolve collectors/actors) + guard
    CustomerPortalModule, // CustomerStore (orders)
    RashidModule,         // ExpenseStore
    FinanceModule,        // ReceiptStore + PaymentStore + TransferStore
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [JulyBackfillController],
  providers: [JulyBackfillService, StaffAuthGuard],
})
export class JulyBackfillModule {}
