// ---------------------------------------------------------------------------
// Admin: clear test data — a one-shot, admin-only reset of every TRANSACTIONAL
// file-backed store so the platform can go from testing to live with a clean
// slate. It reuses each store's own clear() (atomic temp-write+rename save, seq
// preserved so IDs never reuse) and touches NOTHING else:
//
//   CLEARED : portal/sales orders (app + WhatsApp-ingested), employee expenses,
//             advances, finance receipts, finance payments, staff transfers
//             (cheques live inside receipts/payments — cleared with them),
//             staff suggestions, and the shared synced app dataset (appstate)
//             used by the mobile app's sync.js.
//   KEPT    : staff accounts (data/staff.json), the hash-chained audit log
//             (data/audit-log.json + audit-export.json — this POST itself is
//             recorded there by the global AuditInterceptor), the Muhammed Q&A
//             report log, store settings (expense auto-approve threshold,
//             payment categories), and anything in Supabase/Zoho.
//
// Safety: admin JWT required (403 otherwise) AND the body must be
// { confirm: "CLEAR" } — anything else is rejected 400.
// ---------------------------------------------------------------------------
import {
  BadRequestException, Body, Controller, ForbiddenException, Injectable, Module, Post, Req, UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { StaffAuthGuard, StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AppStateModule, AppStateService } from '../appstate/appstate.module';
import { CustomerPortalModule, CustomerStore } from '../customer-portal/customer-portal.module';
import { RashidModule, ExpenseStore, AdvanceStore } from '../rashid/rashid.module';
import { FinanceModule, ReceiptStore, PaymentStore, TransferStore } from '../finance/finance.module';
import { SuggestionsModule, SuggestionStore } from '../suggestions/suggestions.module';

type Staff = { id: string; roles: string[]; name: string };
const isAdmin = (s: Staff) => !!s && (s.roles || []).indexOf('admin') >= 0;

// The exact confirmation token the caller must send — a typo-proof safety latch.
const CONFIRM_TOKEN = 'CLEAR';

class ClearTestDataDto { @IsString() confirm: string; }

@Injectable()
export class ClearTestDataService {
  constructor(
    private readonly orders: CustomerStore,      // portal/sales orders (app + WhatsApp)
    private readonly expenses: ExpenseStore,     // employee expenses
    private readonly advances: AdvanceStore,     // employee advances
    private readonly receipts: ReceiptStore,     // finance money-in (incl. incoming cheques)
    private readonly payments: PaymentStore,     // finance money-out (incl. outgoing cheques)
    private readonly transfers: TransferStore,   // staff-to-staff transfers
    private readonly suggestions: SuggestionStore, // improvement inbox (test ideas)
    private readonly appstate: AppStateService,  // shared synced dataset (sync.js)
  ) {}

  clearAll(staff: Staff, confirm: string) {
    if (!isAdmin(staff)) throw new ForbiddenException('Admins only');
    if (confirm !== CONFIRM_TOKEN) throw new BadRequestException(`Type ${CONFIRM_TOKEN} to confirm`);
    // Each clear() saves atomically on its own; a name is recorded only after
    // its store has been cleared, so the response reflects what actually ran.
    const cleared: string[] = [];
    this.orders.clearOrders(); cleared.push('orders');
    this.expenses.clear(); cleared.push('expenses');
    this.advances.clear(); cleared.push('advances');
    this.receipts.clear(); cleared.push('finance-receipts');
    this.payments.clear(); cleared.push('finance-payments');
    this.transfers.clear(); cleared.push('finance-transfers');
    this.suggestions.clear(); cleared.push('suggestions');
    this.appstate.clear(); cleared.push('appstate');
    return { cleared, at: new Date().toISOString() };
  }
}

@ApiTags('Admin')
@Controller('admin')
export class ClearTestDataController {
  constructor(private readonly svc: ClearTestDataService) {}

  // POST /api/admin/clear-test-data — admin only; body must be { confirm: "CLEAR" }.
  // The global AuditInterceptor records this POST (actor + outcome) in the audit log.
  @Public() @UseGuards(StaffAuthGuard) @Post('clear-test-data')
  clear(@Body() dto: ClearTestDataDto, @Req() req: any) { return this.svc.clearAll(req.staff, dto.confirm); }
}

@Module({
  imports: [
    StaffAuthModule,
    AppStateModule,       // exports AppStateService
    CustomerPortalModule, // exports CustomerStore
    RashidModule,         // exports ExpenseStore + AdvanceStore
    FinanceModule,        // exports ReceiptStore + PaymentStore + TransferStore
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
  controllers: [ClearTestDataController],
  providers: [ClearTestDataService, StaffAuthGuard],
})
export class ClearTestDataModule {}
