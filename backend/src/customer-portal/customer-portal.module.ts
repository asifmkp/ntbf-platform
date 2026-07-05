import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, Get, Injectable, Module, Post,
  Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../common/decorators/public.decorator';
import { ApiGateGuard } from '../common/guards/api-gate.guard';
import { CATALOG } from '../catalog.data';

// Reverse lookup by exact product name (fallback for older clients that send name, not id).
const NAME_TO_ID: Record<string, string> = {};
for (const k of Object.keys(CATALOG)) NAME_TO_ID[CATALOG[k].name] = k;

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

  // Staff-only (behind the shared API token): incoming customer orders.
  @Public() @UseGuards(ApiGateGuard) @Get('orders/all')
  all() { return this.svc.allOrders(); }
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
  providers: [CustomerStore, CustomerPortalService, CustomerAuthGuard],
})
export class CustomerPortalModule {}
