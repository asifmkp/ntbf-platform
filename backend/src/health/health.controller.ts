import { Controller, Get, HttpCode } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ZohoService } from '../zoho/zoho.service';

@Controller('health')
export class HealthController {
  private readonly bootedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly zoho: ZohoService,
  ) {}

  @Public()
  @Get()
  @HttpCode(200)
  async check() {
    const started = Date.now();
    const checks: Record<string, { ok: boolean; ms?: number; detail?: string }> = {};

    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = { ok: true, ms: Date.now() - dbStart };
    } catch (err) {
      checks.db = { ok: false, ms: Date.now() - dbStart, detail: (err as Error).message };
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
