import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/**
 * Lightweight protection for the public-facing demo endpoints (AI copilot, bill
 * capture, dashboard summary). Two layers, both env-configurable:
 *
 *  - Auth gate: if PUBLIC_API_TOKEN is set, requests must EITHER send a matching
 *    `x-api-key` header, OR carry a valid signed-in staff session
 *    (`Authorization: Bearer <staff JWT>`). If PUBLIC_API_TOKEN is unset (local
 *    dev), the gate is open. The staff-JWT path lets the logged-in field app
 *    reach these endpoints without also pasting the shared secret.
 *  - Per-IP rate limit: RATE_LIMIT_MAX requests per RATE_LIMIT_WINDOW_MS
 *    (defaults 30 / 60s) — keeps the paid Claude endpoint from being abused.
 *
 * For full multi-user auth, use the JWT login flow in the `auth` module instead.
 */
@Injectable()
export class ApiGateGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();

    const token = this.config.get<string>('PUBLIC_API_TOKEN');
    if (token) {
      const provided = req.headers['x-api-key'];
      // Accept EITHER the shared secret OR a valid signed-in staff session.
      if (provided !== token && !this.hasValidStaffSession(req)) {
        throw new UnauthorizedException('Invalid or missing API key');
      }
    }

    const max = Number(this.config.get('RATE_LIMIT_MAX') ?? 30);
    const windowMs = Number(this.config.get('RATE_LIMIT_WINDOW_MS') ?? 60_000);
    const ip = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
    const now = Date.now();
    const recent = (this.hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      throw new HttpException('Too many requests — slow down.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(ip, recent);

    return true;
  }

  /**
   * True if the request carries a valid staff JWT — the same check StaffAuthGuard
   * makes (verify against JWT_SECRET and require typ === 'staff'). Verifying here
   * (rather than injecting JwtService) keeps this guard's only dependency
   * ConfigService, so the 5 modules that use it need no DI wiring changes.
   */
  private hasValidStaffSession(req: any): boolean {
    const auth = String(req.headers['authorization'] || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return false;
    try {
      const secret = this.config.get<string>('JWT_SECRET') || 'dev-secret';
      const payload: any = new JwtService({ secret }).verify(token);
      return payload?.typ === 'staff';
    } catch {
      return false;
    }
  }
}
