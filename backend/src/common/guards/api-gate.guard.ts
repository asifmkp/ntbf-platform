import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Lightweight protection for the public-facing demo endpoints (AI copilot, bill
 * capture, dashboard summary). Two layers, both env-configurable:
 *
 *  - Shared-secret gate: if PUBLIC_API_TOKEN is set, requests must send a
 *    matching `x-api-key` header. If it's unset (local dev), the gate is open.
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
      if (provided !== token) {
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
}
