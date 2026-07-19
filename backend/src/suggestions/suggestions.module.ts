// ---------------------------------------------------------------------------
// Suggestions module — a field-driven improvement inbox.
//
// Lets ANY authenticated staff submit improvement ideas / feature requests from
// inside the app so the owner receives live requirements. Built on the same
// "System A" foundation as the Rashid/Finance modules: a file-backed JSON store
// (data/suggestions.json) with atomic temp-write+rename save(), a monotonic seq,
// an id prefix (SUG-), staff-JWT @Public() @UseGuards(StaffAuthGuard) routes, and
// a statusHistory built via a hist() helper. Purely additive — it never touches
// orders, the WhatsApp ingest contract, Zoho, prices, or any existing route.
// ---------------------------------------------------------------------------
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../common/decorators/public.decorator';
import { StaffAuthGuard, StaffAuthModule } from '../staff-auth/staff-auth.module';

// Status lifecycle: NEW → REVIEWING → PLANNED → DONE, plus DECLINED (a terminal
// side-exit). Transitions are kept deliberately simple — any allowed value can be
// set by an admin; every change is recorded in statusHistory for the audit trail.
export const SUGGESTION_STATUSES = ['NEW', 'REVIEWING', 'PLANNED', 'DONE', 'DECLINED'];
// A small suggested set; category is a free string capped in length, so the UI can
// offer these while custom values still validate. Default 'Other'.
export const SUGGESTION_CATEGORIES = ['Orders', 'Delivery', 'Stock', 'Finance', 'App', 'Other'];
const TEXT_MAX = 1000;
const CATEGORY_MAX = 40;

type Staff = { id: string; roles: string[]; name: string };
const hasRole = (s: Staff, r: string) => !!s && (s.roles || []).indexOf(r) >= 0;
const isAdmin = (s: Staff) => hasRole(s, 'admin');

// ---- DTOs (global ValidationPipe runs with forbidNonWhitelisted: true, so every
//      accepted field must be declared here or the request is rejected 400). ----
class CreateSuggestionDto {
  @IsString() text: string; // required; emptiness + length enforced in the service
  @IsOptional() @IsString() category?: string;
}
class UpdateStatusDto {
  @IsIn(SUGGESTION_STATUSES) status: string;
  @IsOptional() @IsString() note?: string;
}

// ---- Suggestion store (data/suggestions.json) ----
@Injectable()
export class SuggestionStore {
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'suggestions.json');
  private data: { seq: number; items: any[] } = { seq: 5000, items: [] };

  constructor() {
    try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* empty */ }
    if (!Array.isArray(this.data.items)) this.data.items = [];
    if (typeof this.data.seq !== 'number') this.data.seq = 5000;
  }
  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* ignore */ }
  }
  private id() { this.data.seq += 1; return 'SUG-' + this.data.seq; }

  // Newest first: items are unshifted on create, so array order already reflects that.
  create(rec: any) { rec.id = this.id(); this.data.items.unshift(rec); this.save(); return rec; }
  byId(id: string) { return this.data.items.find((x) => x.id === id); }
  listByStaff(staffId: string) { return this.data.items.filter((x) => x.staffId === staffId); }
  list(filter?: { status?: string }) {
    return this.data.items.filter((x) => (!filter?.status || x.status === filter.status));
  }
  applyStatus(id: string, to: string, entry: any) {
    const x = this.byId(id); if (!x) return null;
    x.status = to; x.updatedAt = entry.at;
    x.statusHistory = x.statusHistory || [];
    x.statusHistory.push(entry);
    this.save(); return x;
  }
}

@Injectable()
export class SuggestionsService {
  constructor(private readonly store: SuggestionStore) {}

  private assertAdmin(staff: Staff) { if (!isAdmin(staff)) throw new ForbiddenException('Admins only'); }
  private hist(from: string | null, to: string, staff: Staff, note?: string) {
    const e: any = { from, to, by: staff.name, byId: staff.id, role: staff.roles?.[0] || 'staff', at: new Date().toISOString() };
    if (note) e.note = note;
    return e;
  }

  // ANY authenticated staff may submit.
  create(staff: Staff, dto: CreateSuggestionDto) {
    const text = String(dto.text || '').trim();
    if (!text) throw new BadRequestException('Please write your idea first');
    if (text.length > TEXT_MAX) throw new BadRequestException(`Please keep it under ${TEXT_MAX} characters`);
    let category = String(dto.category || '').trim() || 'Other';
    if (category.length > CATEGORY_MAX) category = category.slice(0, CATEGORY_MAX);
    const at = new Date().toISOString();
    const rec: any = {
      id: '', text, category,
      staffId: staff.id, staffName: staff.name, role: staff.roles?.[0] || 'staff',
      status: 'NEW', createdAt: at, updatedAt: at,
      statusHistory: [this.hist(null, 'NEW', staff)],
    };
    return this.store.create(rec);
  }

  // The caller's own submissions, newest first (store already keeps newest-first order).
  listMine(staff: Staff) { return this.store.listByStaff(staff.id); }

  // Admin only: all submissions, newest first, optional ?status= filter, plus a
  // lightweight count-by-status summary for the header.
  listAll(staff: Staff, status?: string) {
    this.assertAdmin(staff);
    const items = this.store.list(status ? { status } : undefined);
    const summary: Record<string, number> = {};
    for (const s of SUGGESTION_STATUSES) summary[s] = 0;
    for (const x of this.store.list()) summary[x.status] = (summary[x.status] || 0) + 1;
    return { items, summary, total: this.store.list().length };
  }

  // Admin only: move a suggestion along the lifecycle; append to statusHistory.
  updateStatus(staff: Staff, id: string, dto: UpdateStatusDto) {
    this.assertAdmin(staff);
    if (SUGGESTION_STATUSES.indexOf(dto.status) < 0) throw new BadRequestException('Invalid status');
    const x = this.store.byId(id);
    if (!x) throw new NotFoundException('Suggestion not found');
    const from = x.status;
    return this.store.applyStatus(id, dto.status, this.hist(from, dto.status, staff, dto.note));
  }
}

@ApiTags('Staff suggestions')
@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly svc: SuggestionsService) {}

  // ANY authenticated staff submits.
  @Public() @UseGuards(StaffAuthGuard) @Post()
  create(@Body() dto: CreateSuggestionDto, @Req() req: any) { return this.svc.create(req.staff, dto); }

  // The caller's own submissions (literal 'mine' declared before any ':id' route).
  @Public() @UseGuards(StaffAuthGuard) @Get('mine')
  mine(@Req() req: any) { return this.svc.listMine(req.staff); }

  // Admin only — all submissions with optional ?status= filter + summary counts.
  @Public() @UseGuards(StaffAuthGuard) @Get()
  all(@Query('status') status: string, @Req() req: any) { return this.svc.listAll(req.staff, status); }

  // Admin only — change status.
  @Public() @UseGuards(StaffAuthGuard) @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Req() req: any) {
    return this.svc.updateStatus(req.staff, id, dto);
  }
}

@Module({
  imports: [
    StaffAuthModule, // shares the single StaffStore instance / staff JWT verification
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [SuggestionsController],
  providers: [SuggestionStore, SuggestionsService, StaffAuthGuard],
  exports: [SuggestionStore],
})
export class SuggestionsModule {}
