import { Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { StaffAuthGuard } from '../staff-auth/staff-auth.module';
import { AuditExporter } from './audit.exporter';
import { AuditService } from './audit.service';
import { AuditStore } from './audit.store';

/**
 * Admin-only read/verify surface for the audit log. Same auth pattern as the
 * Muhammed / Rashid owner endpoints: @Public() bypasses the global JWT guard,
 * StaffAuthGuard attaches req.staff, then we assert the 'admin' role by hand.
 */
@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(
    private readonly svc: AuditService,
    private readonly store: AuditStore,
    private readonly exporter: AuditExporter,
  ) {}

  private assertAdmin(req: any) {
    if (!req.staff || !(req.staff.roles || []).includes('admin')) throw new ForbiddenException('Owner only');
  }

  /** Newest-first page of audit entries. ?limit= (default 100) &offset= (default 0). */
  @Public() @UseGuards(StaffAuthGuard) @Get()
  list(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    this.assertAdmin(req);
    const l = Math.max(1, Math.min(1000, parseInt(String(limit), 10) || 100));
    const o = Math.max(0, parseInt(String(offset), 10) || 0);
    return this.svc.list(l, o);
  }

  /** Recompute the hash chain and report whether it is intact. */
  @Public() @UseGuards(StaffAuthGuard) @Get('verify')
  verify(@Req() req: any) {
    this.assertAdmin(req);
    return this.store.verifyChain();
  }

  /** Stage 3: off-box exporter status (gated, fail-open — reports only). */
  @Public() @UseGuards(StaffAuthGuard) @Get('export-status')
  exportStatus(@Req() req: any) {
    this.assertAdmin(req);
    const head = this.store.head();
    const s = this.exporter.status();
    return {
      enabled: s.enabled,
      localHeadHash: head.headHash,
      localCount: head.count,
      exportedSeq: s.exportedSeq,
      queued: s.queued,
      lastError: s.lastError,
    };
  }
}
