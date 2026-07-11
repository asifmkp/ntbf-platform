import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, Get, Injectable, Module, Post,
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
/** Best catalog id for a free-text product name, or null if no confident match. */
function matchCatalogId(name: string): string | null {
  const q = ingestToks(name);
  if (!q.length) return null;
  const qset = new Set(q);
  const qsizes = sizeToks(name);
  let best: string | null = null;
  let bestCov = 0;
  let bestJac = 0;
  for (const c of CATALOG_INDEX) {
    // Size gate: if the request names a volume/size, the candidate must share one.
    if (qsizes.length && !qsizes.some((z) => c.sizes.indexOf(z) >= 0)) continue;
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
class StatusDto { @IsString() id: string; @IsString() status: string; }

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
    const o = { id: this.id('ORD'), customerId, items, total: Math.round(total * 100) / 100, method: method || 'CASH_ON_DELIVERY', address: address || '', note: note || '', status: 'PLACED', createdAt: new Date().toISOString() };
    this.data.orders.unshift(o); this.save(); return o;
  }
  ordersFor(customerId: string) { return this.data.orders.filter((o) => o.customerId === customerId); }
  /** Idempotency lookup for externally-sourced orders (e.g. WhatsApp wa_orders.id). */
  findByRef(source: string, externalRef: string) {
    return this.data.orders.find((o) => o.source === source && String(o.externalRef) === String(externalRef));
  }
  /** Lightweight customer for an unknown phone — flagged guest so staff can reconcile later. */
  createGuestCustomer(name: string, phone: string) {
    return this.createCustomer({ name: name || 'WhatsApp customer', phone, category: 'RETAIL', guest: true });
  }
  /** items are already resolved & server-priced by the service. Total is recomputed from those. */
  addIngestedOrder(o: { customerId: string; items: any[]; method: string; address?: string; note?: string; source: string; externalRef: string; needsReview: boolean; reviewReasons: string[] }) {
    const total = o.items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
    const rec = {
      id: this.id('ORD'), customerId: o.customerId, items: o.items, total: Math.round(total * 100) / 100,
      method: o.method || 'CASH_ON_DELIVERY', address: o.address || '', note: o.note || '', status: 'PLACED',
      source: o.source, externalRef: o.externalRef, needsReview: !!o.needsReview, reviewReasons: o.reviewReasons || [],
      createdAt: new Date().toISOString(),
    };
    this.data.orders.unshift(rec); this.save(); return rec;
  }
  updateStatus(id: string, status: string) {
    const o = this.data.orders.find((x) => x.id === id);
    if (!o) return null;
    o.status = status; o.updatedAt = new Date().toISOString();
    this.save(); return o;
  }
  allOrders() {
    return this.data.orders.map((o) => { const c = this.data.customers.find((x) => x.id === o.customerId); return { ...o, customerName: c ? c.name : '—', customerPhone: c ? c.phone : '' }; });
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
  updateStatus(id: string, status: string) {
    if (ORDER_STATUSES.indexOf(status) < 0) throw new BadRequestException('Invalid status');
    const o = this.store.updateStatus(id, status);
    if (!o) throw new BadRequestException('Order not found');
    return { id: o.id, status: o.status };
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
  setStatus(@Body() dto: StatusDto) { return this.svc.updateStatus(dto.id, dto.status); }

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
})
export class CustomerPortalModule {}
