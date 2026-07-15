import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Module, Post,
  Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsDefined, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../common/decorators/public.decorator';
import { CATALOG } from '../catalog.data';
import { StaffAuthGuard } from '../staff-auth/staff-auth.module';

// Reverse lookup by exact product name (fallback for older clients that send name, not id).
const NAME_TO_ID: Record<string, string> = {};
for (const k of Object.keys(CATALOG)) NAME_TO_ID[CATALOG[k].name] = k;

// ---- Catalog matcher for WhatsApp free-text order lines ----
// Filler / packaging words that carry no product identity — dropped before scoring.
const INGEST_STOP = new Set(['ctn', 'carton', 'cartons', 'cartoon', 'pc', 'pcs', 'piece', 'pieces', 'of', 'pkt', 'pack', 'packet', 'packets', 'box', 'the', 'and', 'a']);
function ingestToks(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, '$1 $2') // split "cans330" → "cans 330"
    .replace(/([0-9])([a-z])/g, '$1 $2') // split "300ml" → "300 ml"
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !INGEST_STOP.has(t));
}
// Extract volume/size tokens (e.g. "300ml", "1.5l") so a 245ml can never match a 295ml request.
function sizeToks(s: string): string[] {
  const out: string[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(ml|cl|ltr|litre|liter|kg|g|l)\b/gi;
  let m: RegExpExecArray | null;
  const str = String(s || '').toLowerCase();
  while ((m = re.exec(str))) {
    const unit = /^(l|ltr|litre|liter)$/.test(m[2]) ? 'l' : m[2];
    out.push(m[1] + unit);
  }
  return out;
}
const CATALOG_INDEX = Object.keys(CATALOG).map((id) => ({
  id,
  toks: new Set(ingestToks(CATALOG[id].name)),
  sizes: sizeToks(CATALOG[id].name),
}));
// Document frequency per token — lets us tell brand/flavor words (rare) from generic
// descriptors like "carbonated"/"drink" (common), so a brand can't be outvoted by filler.
const CATALOG_DF: Record<string, number> = {};
for (const c of CATALOG_INDEX) for (const t of c.toks) CATALOG_DF[t] = (CATALOG_DF[t] || 0) + 1;
const DISTINCT_MAX = Math.max(8, Math.round(CATALOG_INDEX.length * 0.08));
/** Best catalog id for a free-text product name, or null if no confident match. */
function matchCatalogId(name: string): string | null {
  const q = ingestToks(name);
  if (!q.length) return null;
  const qset = new Set(q);
  const qsizes = sizeToks(name);
  // Distinctive query tokens (brand/flavor/size) the candidate MUST contain. This stops
  // "Pepsi ...295ml" mapping to "7Up ...295ml" on shared filler words. df===0 (typos/noise)
  // is ignored so a stray word can't force a spurious no-match.
  const required = [...qset].filter((t) => CATALOG_DF[t] >= 1 && CATALOG_DF[t] <= DISTINCT_MAX);
  let best: string | null = null;
  let bestCov = 0;
  let bestJac = 0;
  for (const c of CATALOG_INDEX) {
    // Size gate: if the request names a volume/size, the candidate must share one.
    if (qsizes.length && !qsizes.some((z) => c.sizes.indexOf(z) >= 0)) continue;
    if (!required.every((t) => c.toks.has(t))) continue;
    let inter = 0;
    for (const t of qset) if (c.toks.has(t)) inter++;
    if (!inter) continue;
    const cov = inter / qset.size;
    const jac = inter / (qset.size + c.toks.size - inter);
    if (cov > bestCov || (cov === bestCov && jac > bestJac)) { best = c.id; bestCov = cov; bestJac = jac; }
  }
  if (!best) return null;
  const shared = Math.round(bestCov * qset.size);
  if (bestCov >= 1 || (bestCov >= 0.5 && shared >= 2)) return best;
  return null;
}

class RegisterDto {
  @IsString() name: string;
  @IsString() phone: string;
  @IsString() @MinLength(4) password: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() category?: string;
}
class LoginDto { @IsString() phone: string; @IsString() password: string; }
class OrderLineDto { @IsOptional() @IsString() id?: string; @IsOptional() @IsString() name?: string; qty: number; }
class PlaceOrderDto {
  @IsArray() items: OrderLineDto[];
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() note?: string;
}
export const ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
class StatusDto {
  @IsString() id: string;
  @IsString() status: string;
  @IsOptional() cashAmount?: number; // for DELIVERED — actual amount collected
  @IsOptional() @IsString() cashMethod?: string; // CASH_ON_DELIVERY | CHEQUE_ON_DELIVERY
}
class ResolveDto { @IsString() id: string; }

// Role-enforced forward transitions: each target lists the from-status(es) it's valid from
// and the non-admin roles allowed to make it. Admin may make any transition (flagged override).
// CANCELLED is handled separately (sales/admin before packing; admin only after).
const TRANSITIONS: Record<string, { from: string[]; roles: string[] }> = {
  CONFIRMED: { from: ['PLACED'], roles: ['salesman'] },
  PACKED: { from: ['CONFIRMED'], roles: ['warehouse'] },
  OUT_FOR_DELIVERY: { from: ['PACKED'], roles: ['warehouse', 'driver'] },
  DELIVERED: { from: ['OUT_FOR_DELIVERY'], roles: ['driver'] },
};
const hasRole = (roles: string[], r: string) => (roles || []).indexOf(r) >= 0;

// WhatsApp bot → platform. Nested item fields are read manually (not class-validated),
// mirroring PlaceOrderDto, so the bot may include unit_price_aed / line_total_aed freely.
class IngestOrderDto {
  @IsOptional() @IsString() source?: string;
  @IsDefined() external_ref: string | number;
  @IsString() phone: string;
  @IsOptional() @IsString() customer_name?: string;
  @IsOptional() @IsString() address?: string;
  @IsArray() items: any[];
  @IsOptional() total_aed?: number;
  @IsOptional() @IsString() note?: string;
}

/** File-backed store for customer accounts + their orders — isolated from the staff data. */
@Injectable()
export class CustomerStore {
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'customers.json');
  private data: { seq: number; customers: any[]; orders: any[] } = { seq: 1000, customers: [], orders: [] };

  constructor() {
    try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* empty */ }
  }
  private save() {
    // Atomic write: serialise to a temp file then rename, so an interrupted write
    // can never truncate/corrupt the live store (write + rename is atomic on same fs).
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* ignore */ }
  }
  private id(p: string) { this.data.seq += 1; return p + '-' + this.data.seq; }

  findByPhone(phone: string) { return this.data.customers.find((c) => c.phone === phone); }
  createCustomer(c: any) { const rec = { id: this.id('cust'), createdAt: new Date().toISOString(), ...c }; this.data.customers.push(rec); this.save(); return rec; }
  /** items are already server-priced & validated by the service. Total is recomputed from those. */
  addOrder(customerId: string, items: any[], method: string, address?: string, note?: string) {
    const total = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
    const at = new Date().toISOString();
    const o = { id: this.id('ORD'), customerId, items, total: Math.round(total * 100) / 100, method: method || 'CASH_ON_DELIVERY', address: address || '', note: note || '', status: 'PLACED', createdAt: at, statusHistory: [{ from: null, to: 'PLACED', by: 'Customer', role: 'customer', at, override: false }] };
    this.data.orders.unshift(o); this.save(); return o;
  }
  ordersFor(customerId: string) { return this.data.orders.filter((o) => o.customerId === customerId); }
  /** Idempotency lookup for externally-sourced orders (e.g. WhatsApp wa_orders.id). */
  findByRef(source: string, externalRef: string) {
    return this.data.orders.find((o) => o.source === source && String(o.externalRef) === String(externalRef));
  }
  /** Lightweight customer for an unknown phone — flagged guest so staff can reconcile later. */
  createGuestCustomer(name: string | undefined, phone: string) {
    return this.createCustomer({ name: name || 'WhatsApp customer', phone, category: 'RETAIL', guest: true });
  }
  /** items are already resolved & server-priced by the service. Total is recomputed from those. */
  addIngestedOrder(o: { customerId: string; items: any[]; method: string; address?: string; note?: string; source: string; externalRef: string; needsReview: boolean; reviewReasons: string[] }) {
    const total = o.items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
    const at = new Date().toISOString();
    const rec = {
      id: this.id('ORD'), customerId: o.customerId, items: o.items, total: Math.round(total * 100) / 100,
      method: o.method || 'CASH_ON_DELIVERY', address: o.address || '', note: o.note || '', status: 'PLACED',
      source: o.source, externalRef: o.externalRef, needsReview: !!o.needsReview, reviewReasons: o.reviewReasons || [],
      createdAt: at, statusHistory: [{ from: null, to: 'PLACED', by: 'WhatsApp bot', role: 'system', at, override: false }],
    };
    this.data.orders.unshift(rec); this.save(); return rec;
  }
  orderById(id: string) { return this.data.orders.find((x) => x.id === id); }
  /** Apply a status change with an audit entry and optional extra fields (e.g. collected cash). */
  applyStatus(id: string, toStatus: string, entry: any, extra?: any) {
    const o = this.data.orders.find((x) => x.id === id);
    if (!o) return null;
    o.status = toStatus; o.updatedAt = entry.at;
    if (extra) Object.assign(o, extra);
    o.statusHistory = o.statusHistory || [];
    o.statusHistory.push(entry);
    this.save(); return o;
  }
  resolveReview(id: string, entry: any) {
    const o = this.data.orders.find((x) => x.id === id);
    if (!o) return null;
    o.needsReview = false; o.reviewResolvedBy = entry.by; o.reviewResolvedAt = entry.at;
    o.statusHistory = o.statusHistory || [];
    o.statusHistory.push({ from: o.status, to: o.status, by: entry.by, role: entry.role, at: entry.at, note: 'review resolved', override: false });
    this.save(); return o;
  }
  allOrders() {
    return this.data.orders.map((o) => { const c = this.data.customers.find((x) => x.id === o.customerId); return { ...o, customerName: c ? c.name : '—', customerPhone: c ? c.phone : '' }; });
  }
  /** Production cleanup: snapshot all orders (with customers) to an archive file in the data
   *  dir, then empty the live orders. seq is preserved so new order IDs never reuse old ones.
   *  No-op if there are no orders; never clobbers an existing archive file. */
  archiveOrders(baseName: string) {
    const count = this.data.orders.length;
    if (!count) return { archived: 0, seq: this.data.seq, file: null };
    const dir = path.dirname(this.file);
    let file = path.join(dir, baseName);
    let n = 2;
    while (fs.existsSync(file)) { file = path.join(dir, baseName.replace(/\.json$/, '') + '-' + n + '.json'); n++; }
    const snapshot = { archivedAt: new Date().toISOString(), seq: this.data.seq, count, orders: this.data.orders, customers: this.data.customers };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
    this.data.orders = [];
    this.save();
    return { archived: count, seq: this.data.seq, file: path.basename(file) };
  }
}

/** Validates a customer JWT (typ=customer) and attaches customerId to the request. */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const auth = String(req.headers['authorization'] || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    try {
      const payload: any = this.jwt.verify(token);
      if (payload.typ !== 'customer') throw new Error('wrong token type');
      req.customerId = payload.sub;
      return true;
    } catch (e) {
      throw new UnauthorizedException('Please sign in');
    }
  }
}

/** Guards the WhatsApp ingest endpoint with a shared secret (env WHATSAPP_INGEST_TOKEN). */
@Injectable()
export class IngestGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = String(req.headers['x-ingest-token'] || '');
    const expected = process.env.WHATSAPP_INGEST_TOKEN || '';
    if (!expected || token !== expected) throw new UnauthorizedException('Invalid ingest token');
    return true;
  }
}

@Injectable()
export class CustomerPortalService {
  constructor(private readonly store: CustomerStore, private readonly jwt: JwtService) {}

  async register(dto: RegisterDto) {
    if (this.store.findByPhone(dto.phone)) throw new UnauthorizedException('Phone already registered — please sign in');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const c = this.store.createCustomer({ name: dto.name, phone: dto.phone, email: dto.email, category: dto.category || 'RETAIL', passwordHash });
    return this.session(c);
  }
  async login(dto: LoginDto) {
    const c = this.store.findByPhone(dto.phone);
    if (!c || !(await bcrypt.compare(dto.password, c.passwordHash))) throw new UnauthorizedException('Wrong phone or password');
    return this.session(c);
  }
  private session(c: any) {
    const token = this.jwt.sign({ sub: c.id, typ: 'customer', name: c.name });
    return { token, customer: { id: c.id, name: c.name, phone: c.phone, category: c.category } };
  }
  placeOrder(customerId: string, dto: PlaceOrderDto) {
    // SECURITY: never trust client-sent prices. Resolve each line to the canonical
    // product (by id, or exact name for older clients) and price it server-side.
    const resolved: any[] = [];
    for (const line of dto.items || []) {
      const qty = Math.floor(Number(line.qty) || 0);
      if (qty <= 0 || qty > 100000) continue;
      const key = line.id && CATALOG[line.id] ? line.id : (line.name ? NAME_TO_ID[line.name] : undefined);
      if (!key) continue;
      const p = CATALOG[key];
      resolved.push({ id: key, name: p.name, unit: p.unit, qty, price: p.price });
    }
    if (!resolved.length) throw new BadRequestException('No valid items in your order');
    return this.store.addOrder(customerId, resolved, dto.method || 'CASH_ON_DELIVERY', dto.address, dto.note);
  }
  myOrders(customerId: string) { return this.store.ordersFor(customerId); }
  allOrders() { return this.store.allOrders(); }
  updateStatus(dto: StatusDto, staff: { id: string; roles: string[]; name: string }) {
    const to = dto.status;
    if (ORDER_STATUSES.indexOf(to) < 0) throw new BadRequestException('Invalid status');
    const o = this.store.orderById(dto.id);
    if (!o) throw new BadRequestException('Order not found');
    const from = o.status;
    const roles = staff.roles || [];
    const isAdmin = hasRole(roles, 'admin');
    if (to === from) throw new BadRequestException('Order is already ' + from);

    // Needs-review gate: an order can't be confirmed until the review is resolved.
    if (to === 'CONFIRMED' && o.needsReview) {
      throw new ForbiddenException('This order needs review first — open it and resolve the flagged items before confirming.');
    }

    let override = false;
    let actingRole = isAdmin ? 'admin' : (roles[0] || 'staff');
    if (to === 'CANCELLED') {
      if (from === 'DELIVERED' || from === 'CANCELLED') throw new BadRequestException('This order can no longer be cancelled');
      const beforePacked = from === 'PLACED' || from === 'CONFIRMED';
      if (beforePacked && hasRole(roles, 'salesman')) { actingRole = 'salesman'; }
      else if (isAdmin) { override = !(beforePacked && hasRole(roles, 'salesman')); actingRole = 'admin'; }
      else throw new ForbiddenException(beforePacked ? 'Only sales or admin can cancel an order' : 'After packing, only an admin can cancel');
    } else {
      const t = TRANSITIONS[to];
      const fromOk = !!t && t.from.indexOf(from) >= 0;
      const roleMatch = t ? t.roles.find((r) => hasRole(roles, r)) : undefined;
      if (fromOk && roleMatch) { actingRole = roleMatch; }
      else if (isAdmin) { override = true; actingRole = 'admin'; }
      else if (!fromOk) throw new BadRequestException(`Can't move an order from ${from} to ${to}`);
      else throw new ForbiddenException(`Your role can't perform ${from} → ${to}`);
    }

    const at = new Date().toISOString();
    const entry: any = { from, to, by: staff.name, byId: staff.id, role: actingRole, at, override };
    const extra: any = {};
    if (to === 'DELIVERED') {
      const amt = Number(dto.cashAmount);
      const amount = (isFinite(amt) && amt >= 0) ? Math.round(amt * 100) / 100 : o.total;
      extra.collected = { amount, method: dto.cashMethod || o.method || 'CASH_ON_DELIVERY', at, by: staff.name };
    }
    const updated = this.store.applyStatus(dto.id, to, entry, extra);
    return { id: (updated as any).id, status: (updated as any).status, override };
  }
  archiveTestOrders(staff: { roles: string[] }) {
    if (!hasRole(staff.roles || [], 'admin')) throw new ForbiddenException('Admins only');
    const date = new Date().toISOString().slice(0, 10);
    return this.store.archiveOrders(`orders-archive-test-${date}.json`);
  }
  resolveReview(dto: ResolveDto, staff: { id: string; roles: string[]; name: string }) {
    const roles = staff.roles || [];
    if (!hasRole(roles, 'salesman') && !hasRole(roles, 'admin')) throw new ForbiddenException('Only sales or admin can resolve a review');
    const o = this.store.orderById(dto.id);
    if (!o) throw new BadRequestException('Order not found');
    if (!o.needsReview) return { id: o.id, needsReview: false };
    const at = new Date().toISOString();
    const actingRole = hasRole(roles, 'salesman') ? 'salesman' : 'admin';
    this.store.resolveReview(dto.id, { by: staff.name, role: actingRole, at });
    return { id: o.id, needsReview: false };
  }
  /** Ingest a confirmed WhatsApp order into the same pipeline as web orders. */
  ingest(dto: IngestOrderDto) {
    const ref = String(dto.external_ref);
    const existing = this.store.findByRef('whatsapp', ref);
    if (existing) {
      // Idempotent: same wa_orders.id already ingested — return it, don't duplicate.
      return { ok: true, order_id: existing.id, status: existing.status, needsReview: !!existing.needsReview, reasons: existing.reviewReasons || [] };
    }
    const reasons: string[] = [];
    const items: any[] = [];
    for (const line of dto.items || []) {
      const qty = Math.floor(Number(line.qty_cartons) || 0);
      if (qty <= 0 || qty > 100000) continue;
      const key = matchCatalogId(line.name);
      if (!key) {
        // Keep the line visible for staff, but unpriced and flagged.
        items.push({ id: null, name: String(line.name || 'Unknown item'), unit: '', qty, price: 0, unmatched: true });
        reasons.push(`No catalog match for "${line.name}" — needs manual mapping`);
        continue;
      }
      const p = CATALOG[key];
      if (!(p.price > 0)) reasons.push(`No platform price for "${p.name}"`);
      items.push({ id: key, name: p.name, unit: p.unit, qty, price: p.price || 0, matchedFrom: String(line.name || '') });
    }
    if (!items.length) throw new BadRequestException('No valid items to ingest');
    let c = this.store.findByPhone(dto.phone);
    if (!c) {
      c = this.store.createGuestCustomer(dto.customer_name, dto.phone);
      reasons.push(`New WhatsApp customer ${dto.phone} — created as guest, verify details`);
    }
    const needsReview = reasons.length > 0;
    const o = this.store.addIngestedOrder({
      customerId: c.id, items, method: 'CASH_ON_DELIVERY', address: dto.address, note: dto.note,
      source: 'whatsapp', externalRef: ref, needsReview, reviewReasons: reasons,
    });
    return { ok: true, order_id: o.id, status: o.status, needsReview, reasons };
  }
}

@ApiTags('Customer portal')
@Controller('portal')
export class CustomerPortalController {
  constructor(private readonly svc: CustomerPortalService) {}

  @Public() @Post('register')
  register(@Body() dto: RegisterDto) { return this.svc.register(dto); }

  @Public() @Post('login')
  login(@Body() dto: LoginDto) { return this.svc.login(dto); }

  @Public() @UseGuards(CustomerAuthGuard) @Post('orders')
  place(@Body() dto: PlaceOrderDto, @Req() req: any) { return this.svc.placeOrder(req.customerId, dto); }

  @Public() @UseGuards(CustomerAuthGuard) @Get('orders')
  mine(@Req() req: any) { return this.svc.myOrders(req.customerId); }

  // Staff-only (logged-in staff): incoming customer orders + status updates.
  @Public() @UseGuards(StaffAuthGuard) @Get('orders/all')
  all() { return this.svc.allOrders(); }

  @Public() @UseGuards(StaffAuthGuard) @Post('orders/status')
  setStatus(@Body() dto: StatusDto, @Req() req: any) { return this.svc.updateStatus(dto, req.staff); }

  @Public() @UseGuards(StaffAuthGuard) @Post('orders/resolve-review')
  resolveReview(@Body() dto: ResolveDto, @Req() req: any) { return this.svc.resolveReview(dto, req.staff); }

  // One-time production cleanup (admin only): archive all test orders, empty the live queue.
  @Public() @UseGuards(StaffAuthGuard) @Post('orders/archive')
  archive(@Req() req: any) { return this.svc.archiveTestOrders(req.staff); }

  // WhatsApp bot ingest (shared-secret guarded): confirmed WA orders join the same queue.
  @Public() @UseGuards(IngestGuard) @Post('orders/ingest')
  ingest(@Body() dto: IngestOrderDto) { return this.svc.ingest(dto); }
}

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [CustomerPortalController],
  providers: [CustomerStore, CustomerPortalService, CustomerAuthGuard, StaffAuthGuard, IngestGuard],
  // Exported so the Finance module can read orders/bills (read-only) to match receipts to the real bill.
  exports: [CustomerStore],
})
export class CustomerPortalModule {}
