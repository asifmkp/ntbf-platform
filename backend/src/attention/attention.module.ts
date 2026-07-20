// ---------------------------------------------------------------------------
// Attention module — one lightweight, read-only "what needs me right now"
// endpoint for the mobile app's tab badges and nudges.
//
//   GET /api/attention/mine  (any authenticated staff)
//
// Returns ONLY the counters the CALLER's roles entitle them to see; everything
// else is simply absent. All counts are cheap in-memory scans of the existing
// file-backed stores (CustomerStore orders, finance receipts/payments/transfers,
// Rashid expenses, suggestions) — it NEVER writes and never touches Zoho, the
// WhatsApp ingest contract, or any existing flow. Records imported from the
// July 2026 history backfill (origin === 'july-import') are excluded from every
// count, belt-and-braces — they are display-only history.
// ---------------------------------------------------------------------------
import { Controller, Get, Injectable, Module, Req, UseGuards } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { StaffAuthGuard, StaffAuthModule } from '../staff-auth/staff-auth.module';
import { CustomerPortalModule, CustomerStore } from '../customer-portal/customer-portal.module';
import { FinanceModule, ReceiptStore, PaymentStore, TransferStore } from '../finance/finance.module';
import { RashidModule, ExpenseStore } from '../rashid/rashid.module';
import { SuggestionsModule, SuggestionStore } from '../suggestions/suggestions.module';

type Staff = { id: string; roles: string[]; name: string };
const hasRole = (s: Staff, r: string) => !!s && (s.roles || []).indexOf(r) >= 0;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
// Same belt-and-braces exclusion the EOD cash-up uses: imported July history is
// terminal display-only data and must never raise an attention badge.
const notImported = (x: any) => x && x.origin !== 'july-import';

@Injectable()
export class AttentionService {
  constructor(
    private readonly orders: CustomerStore,     // read-only: order queues
    private readonly receipts: ReceiptStore,    // read-only: receipt queues
    private readonly payments: PaymentStore,    // read-only: payment approvals
    private readonly transfers: TransferStore,  // read-only: handovers awaiting confirm
    private readonly expenses: ExpenseStore,    // read-only: SUBMITTED expense queue
    private readonly suggestions: SuggestionStore, // read-only: NEW suggestions
  ) {}

  /** Role-scoped attention counters for the calling staff member. */
  mine(staff: Staff) {
    const admin = hasRole(staff, 'admin');
    const out: any = { at: new Date().toISOString() };

    // ---- Everyone: cash handovers waiting for MY confirmation (the EOD nudge).
    const toConfirm = this.transfers.all().filter(
      (x) => notImported(x) && x.toId === staff.id && x.status === 'PENDING_CONFIRM');
    out.transfersToConfirm = {
      count: toConfirm.length,
      total: round2(toConfirm.reduce((s, x) => s + (Number(x.amount) || 0), 0)),
    };

    // ---- Order queues (rawOrders: no customer join needed for counting).
    const needsOrders = admin || hasRole(staff, 'salesman') || hasRole(staff, 'warehouse') || hasRole(staff, 'driver');
    const orders = needsOrders ? this.orders.rawOrders().filter(notImported) : [];

    if (admin || hasRole(staff, 'salesman')) {
      out.ordersNeedsReview = orders.filter((o) => o.needsReview && o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;
      // "Incoming" mirrors the Online tab's Incoming section: PLACED and not flagged for review.
      const incoming = orders.filter((o) => o.status === 'PLACED' && !o.needsReview);
      out.ordersIncoming = incoming.length;
      let oldest: number | null = null;
      for (const o of incoming) {
        const t = Date.parse(o.createdAt || '');
        if (isFinite(t) && (oldest === null || t < oldest)) oldest = t;
      }
      out.oldestIncomingMinutes = oldest === null ? 0 : Math.max(0, Math.floor((Date.now() - oldest) / 60000));
    }
    if (admin || hasRole(staff, 'warehouse')) {
      out.ordersToPack = orders.filter((o) => o.status === 'CONFIRMED').length;
    }
    if (admin || hasRole(staff, 'driver')) {
      out.ordersOutForDelivery = orders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length;
    }

    // ---- Finance queues (finance or admin).
    if (admin || hasRole(staff, 'finance')) {
      const rcpts = this.receipts.all().filter(notImported);
      out.receiptsPendingApproval = rcpts.filter((x) => x.status === 'PENDING_APPROVAL').length;
      out.receiptsAwaitingConfirm = rcpts.filter((x) => x.status === 'COLLECTED').length;
      out.paymentsPending = this.payments.all().filter((x) => notImported(x) && x.status === 'PENDING_APPROVAL').length;
      out.expensesPending = this.expenses.list({ status: 'SUBMITTED' }).filter(notImported).length;
    }
    if (admin) {
      out.suggestionsNew = this.suggestions.list({ status: 'NEW' }).filter(notImported).length;
    }
    return out;
  }
}

@ApiTags('Attention')
@Controller('attention')
export class AttentionController {
  constructor(private readonly svc: AttentionService) {}

  @Public() @UseGuards(StaffAuthGuard) @Get('mine')
  mine(@Req() req: any) { return this.svc.mine(req.staff); }
}

@Module({
  imports: [
    StaffAuthModule,
    CustomerPortalModule, // exports CustomerStore
    FinanceModule,        // exports ReceiptStore / PaymentStore / TransferStore
    RashidModule,         // exports ExpenseStore
    SuggestionsModule,    // exports SuggestionStore
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AttentionController],
  providers: [AttentionService, StaffAuthGuard],
})
export class AttentionModule {}
