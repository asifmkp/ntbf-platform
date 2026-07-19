import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AuditActor } from './audit.types';

// Only state-changing verbs are audited; reads pass through untouched.
const AUDITED_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];
// Keys whose values must never be written to the audit log (redacted in-place).
const REDACT_RE = /password|token|secret|jwt|authorization|api[-_]?key|image|photo|base64|refresh/i;
const SUMMARY_CAP = 800;

/**
 * Global, passive audit interceptor. It observes write requests and records a
 * hash-chained AuditEntry after they resolve (success or error). It is
 * exhaustively FAIL-OPEN: the entire body is wrapped so that if ANYTHING in the
 * audit path throws, it is swallowed and the untouched next.handle() stream is
 * returned. The interceptor never alters the response nor surfaces an error, and
 * the record() call happens in a tap side-effect off the business stream.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    try {
      if (ctx.getType() !== 'http') return next.handle();

      const req: any = ctx.switchToHttp().getRequest();
      const method = String(req?.method || '').toUpperCase();
      if (!AUDITED_METHODS.includes(method)) return next.handle();

      // Resolve everything BEFORE subscribing so the tap callbacks stay trivial.
      const actor = this.resolveActor(req);
      const route = this.resolveRoute(req);
      const module = this.resolveModule(route);
      const summary = this.summarize(req?.body);
      const entityId = (req?.params && req.params.id != null ? req.params.id : undefined)
        ?? (req?.body && req.body.id != null ? req.body.id : undefined)
        ?? null;
      const meta = {
        ip: this.resolveIp(req),
        requestId: (req?.headers && (req.headers['x-request-id'] || null)) || null,
      };
      const base = {
        actor,
        action: { method, route, module, summary },
        entity: { type: module, id: entityId == null ? null : String(entityId) },
        meta,
      };

      return next.handle().pipe(
        tap({
          next: () => {
            try {
              const status = (req?.res && typeof req.res.statusCode === 'number') ? req.res.statusCode : 200;
              this.audit.record({ ...base, outcome: { status, ok: status < 400 } });
            } catch (e) { /* swallow — never affect the response */ }
          },
          error: (err: any) => {
            try {
              const status = (err && (err.status || err.statusCode)) || 500;
              this.audit.record({ ...base, outcome: { status, ok: false } });
            } catch (e) { /* swallow — never affect the error surfaced to the client */ }
          },
        }),
      );
    } catch (e) {
      // Any failure while setting up auditing must leave the business request
      // completely unaffected. next.handle() is only ever subscribed once.
      return next.handle();
    }
  }

  /** Pick the actor from whichever identity the request carried (see module map). */
  private resolveActor(req: any): AuditActor {
    try {
      if (req?.staff) {
        const s = req.staff;
        const role = Array.isArray(s.roles) ? (s.roles[0] ?? null) : (s.roles ?? null);
        return { id: s.id ?? null, name: s.name ?? null, role, system: 'staff' };
      }
      if (req?.user) {
        const u = req.user;
        return { id: u.id ?? u.sub ?? null, name: u.name ?? null, role: u.role ?? null, system: 'user' };
      }
      if (req?.customerId) {
        return { id: String(req.customerId), name: null, role: null, system: 'customer' };
      }
      if (req?.headers && req.headers['x-ingest-token']) {
        return { id: null, name: null, role: null, system: 'ingest' };
      }
    } catch (e) { /* fall through to anonymous */ }
    return { id: null, name: null, role: null, system: 'anonymous' };
  }

  private resolveRoute(req: any): string {
    const raw = String(req?.originalUrl || req?.url || '');
    const q = raw.indexOf('?');
    return q >= 0 ? raw.slice(0, q) : raw;
  }

  /** First path segment after /api/ (e.g. /api/expenses/123 → "expenses"). */
  private resolveModule(route: string): string | null {
    const m = route.match(/\/api\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  private resolveIp(req: any): string | null {
    try {
      const fwd = req?.headers && req.headers['x-forwarded-for'];
      if (fwd) return String(Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim() || null;
      return req?.ip || (req?.socket && req.socket.remoteAddress) || null;
    } catch (e) { return null; }
  }

  /** Redacted, capped, shallow view of the request body for the audit summary. */
  private summarize(body: any): string {
    try {
      if (body == null) return '';
      if (typeof body !== 'object') return String(body).slice(0, SUMMARY_CAP);
      const redacted: any = Array.isArray(body) ? [] : {};
      for (const key of Object.keys(body)) {
        redacted[key] = REDACT_RE.test(key) ? '[redacted]' : body[key];
      }
      const json = JSON.stringify(redacted);
      return json && json.length > SUMMARY_CAP ? json.slice(0, SUMMARY_CAP) : (json || '');
    } catch (e) {
      return '';
    }
  }
}
