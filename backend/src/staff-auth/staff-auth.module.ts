import {
  Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Module,
  Post, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../common/decorators/public.decorator';

/** Roles a staff account can hold. 'admin' = full access (may switch into any role). */
const ROLE_IDS = ['admin', 'salesman', 'driver', 'warehouse', 'purchase', 'finance', 'service'];

class LoginDto { @IsString() username: string; @IsString() password: string; }
class ChangePwDto { @IsString() oldPassword: string; @IsString() @MinLength(4) newPassword: string; }
class CreateStaffDto {
  @IsString() name: string;
  @IsString() username: string;
  @IsString() @MinLength(4) password: string;
  @IsArray() roles: string[];
}
class ResetPwDto { @IsString() id: string; @IsString() @MinLength(4) password: string; }
class RemoveDto { @IsString() id: string; }

/** File-backed staff account store (data/staff.json), seeded with the real team on first run. */
@Injectable()
export class StaffStore {
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'staff.json');
  private data: { seq: number; staff: any[] } = { seq: 100, staff: [] };

  constructor() {
    try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* empty */ }
    if (!this.data.staff || !this.data.staff.length) this.seed();
  }
  private save() {
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  }
  private id() { this.data.seq += 1; return 'stf-' + this.data.seq; }

  /** Initial accounts — TEMPORARY passwords; each staff should change theirs after first login. */
  private seed() {
    const now = new Date().toISOString();
    const mk = (name: string, username: string, password: string, roles: string[]) =>
      ({ id: this.id(), name, username: username.toLowerCase(), roles, passwordHash: bcrypt.hashSync(password, 10), createdAt: now });
    this.data.staff = [
      mk('Asif', 'asif', 'Admin@2026', ['admin']),
      mk('Tahir', 'tahir', 'Sales@2026', ['salesman']),
      mk('Haris', 'haris', 'Store@2026', ['warehouse', 'purchase']),
      mk('Musthafa', 'musthafa', 'Drive@2026', ['driver']),
    ];
    this.save();
  }

  byUsername(u: string) { return this.data.staff.find((s) => s.username === String(u || '').toLowerCase().trim()); }
  byId(id: string) { return this.data.staff.find((s) => s.id === id); }
  list() { return this.data.staff.map((s) => ({ id: s.id, name: s.name, username: s.username, roles: s.roles })); }
  create(name: string, username: string, passwordHash: string, roles: string[]) {
    const rec = { id: this.id(), name, username: username.toLowerCase().trim(), roles, passwordHash, createdAt: new Date().toISOString() };
    this.data.staff.push(rec); this.save(); return rec;
  }
  setPassword(id: string, passwordHash: string) { const s = this.byId(id); if (s) { s.passwordHash = passwordHash; this.save(); } return !!s; }
  remove(id: string) { const n = this.data.staff.length; this.data.staff = this.data.staff.filter((s) => s.id !== id); this.save(); return this.data.staff.length < n; }
}

/** Validates a staff JWT (typ=staff) and attaches {id, roles, name} to the request. */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const auth = String(req.headers['authorization'] || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    try {
      const p: any = this.jwt.verify(token);
      if (p.typ !== 'staff') throw new Error('wrong token type');
      req.staff = { id: p.sub, roles: p.roles || [], name: p.name };
      return true;
    } catch (e) { throw new UnauthorizedException('Please sign in'); }
  }
}

@Injectable()
export class StaffAuthService {
  constructor(private readonly store: StaffStore, private readonly jwt: JwtService) {}

  private session(s: any) {
    const token = this.jwt.sign({ sub: s.id, typ: 'staff', name: s.name, roles: s.roles });
    return { token, staff: { id: s.id, name: s.name, username: s.username, roles: s.roles } };
  }
  async login(dto: LoginDto) {
    const s = this.store.byUsername(dto.username);
    if (!s || !(await bcrypt.compare(dto.password, s.passwordHash))) throw new UnauthorizedException('Wrong username or password');
    return this.session(s);
  }
  me(id: string) { const s = this.store.byId(id); if (!s) throw new UnauthorizedException('Account not found'); return { id: s.id, name: s.name, username: s.username, roles: s.roles }; }
  async changePassword(id: string, dto: ChangePwDto) {
    const s = this.store.byId(id);
    if (!s || !(await bcrypt.compare(dto.oldPassword, s.passwordHash))) throw new UnauthorizedException('Current password is wrong');
    this.store.setPassword(id, await bcrypt.hash(dto.newPassword, 10));
    return { ok: true };
  }
  private assertAdmin(req: any) { if (!req.staff || !req.staff.roles.includes('admin')) throw new ForbiddenException('Admins only'); }

  listTeam(req: any) { this.assertAdmin(req); return this.store.list(); }
  async createStaff(req: any, dto: CreateStaffDto) {
    this.assertAdmin(req);
    if (this.store.byUsername(dto.username)) throw new ForbiddenException('That username is already taken');
    const roles = (dto.roles || []).filter((r) => ROLE_IDS.includes(r));
    if (!roles.length) throw new ForbiddenException('Pick at least one role');
    const s = this.store.create(dto.name, dto.username, await bcrypt.hash(dto.password, 10), roles);
    return { id: s.id, name: s.name, username: s.username, roles: s.roles };
  }
  async resetPassword(req: any, dto: ResetPwDto) {
    this.assertAdmin(req);
    if (!this.store.setPassword(dto.id, await bcrypt.hash(dto.password, 10))) throw new ForbiddenException('Staff not found');
    return { ok: true };
  }
  removeStaff(req: any, dto: RemoveDto) {
    this.assertAdmin(req);
    if (req.staff.id === dto.id) throw new ForbiddenException('You cannot remove your own account');
    if (!this.store.remove(dto.id)) throw new ForbiddenException('Staff not found');
    return { ok: true };
  }
}

@ApiTags('Staff auth')
@Controller('staff')
export class StaffAuthController {
  constructor(private readonly svc: StaffAuthService) {}

  @Public() @Post('login')
  login(@Body() dto: LoginDto) { return this.svc.login(dto); }

  @Public() @UseGuards(StaffAuthGuard) @Get('me')
  me(@Req() req: any) { return this.svc.me(req.staff.id); }

  @Public() @UseGuards(StaffAuthGuard) @Post('password')
  changePw(@Body() dto: ChangePwDto, @Req() req: any) { return this.svc.changePassword(req.staff.id, dto); }

  @Public() @UseGuards(StaffAuthGuard) @Get('team')
  team(@Req() req: any) { return this.svc.listTeam(req); }

  @Public() @UseGuards(StaffAuthGuard) @Post('team')
  create(@Body() dto: CreateStaffDto, @Req() req: any) { return this.svc.createStaff(req, dto); }

  @Public() @UseGuards(StaffAuthGuard) @Post('team/reset')
  resetPw(@Body() dto: ResetPwDto, @Req() req: any) { return this.svc.resetPassword(req, dto); }

  @Public() @UseGuards(StaffAuthGuard) @Post('team/remove')
  remove(@Body() dto: RemoveDto, @Req() req: any) { return this.svc.removeStaff(req, dto); }
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
  controllers: [StaffAuthController],
  providers: [StaffStore, StaffAuthService, StaffAuthGuard],
})
export class StaffAuthModule {}
