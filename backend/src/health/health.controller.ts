import { Controller, Get, HttpCode } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { Public } from '../common/decorators/public.decorator';
import { ZohoService } from '../zoho/zoho.service';

@Controller('health')
export class HealthController {
  private readonly bootedAt = Date.now();

  // The file-store directory every module writes to
  // (STATE_DIR/data on Render; cwd/data locally). Postgres/Prisma is
  // intentionally unused, so storage health = this dir existing + writable.
  private readonly storageDir = path.join(
    process.env.STATE_DIR || process.cwd(),
    'data',
  );

  constructor(private readonly zoho: ZohoService) {}

  /**
   * Liveness/readiness probe. Returns HTTP 200 always; overall `status` is
   * "ok" only when every sub-check passes, else "degraded".
   *
   * Shape: {
   *   status: 'ok' | 'degraded',
   *   uptime_s: number,           // seconds since process boot
   *   total_ms: number,           // time spent running the checks
   *   checks: {
   *     storage:     { ok, ms, detail },  // file-store dir writable (file-store mode)
   *     zoho_config: { ok, detail },      // ZOHO_* env present
   *   }
   * }
   */
  @Public()
  @Get()
  @HttpCode(200)
  async check() {
    const started = Date.now();
    const checks: Record<string, { ok: boolean; ms?: number; detail?: string }> = {};

    const storeStart = Date.now();
    try {
      await fs.promises.access(this.storageDir, fs.constants.W_OK);
      checks.storage = {
        ok: true,
        ms: Date.now() - storeStart,
        detail: `file-store mode: ${this.storageDir}`,
      };
    } catch (err) {
      checks.storage = {
        ok: false,
        ms: Date.now() - storeStart,
        detail: `file-store not writable: ${(err as Error).message}`,
      };
    }

    checks.zoho_config = {
      ok: this.zoho.configured,
      detail: this.zoho.configured ? 'env present' : 'missing ZOHO_* env',
    };

    const allOk = Object.values(checks).every((c) => c.ok);
    return {
      status: allOk ? 'ok' : 'degraded',
      uptime_s: Math.floor((Date.now() - this.bootedAt) / 1000),
      total_ms: Date.now() - started,
      checks,
    };
  }
}
