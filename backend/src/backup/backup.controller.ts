import { Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { StaffAuthGuard } from '../staff-auth/staff-auth.module';
import { AuditActor } from '../audit/audit.types';
import { BackupService } from './backup.service';
import { BackupStore } from './backup.store';

type Staff = { id: string; name: string; roles: string[] };
const isAdmin = (s: Staff) => !!s && (s.roles || []).indexOf('admin') >= 0;

@ApiTags('Backup')
@Controller('admin/backup')
export class BackupController {
  constructor(
    private readonly backup: BackupService,
    private readonly store: BackupStore,
  ) {}

  /** Manual trigger — admin only. Also step 1 of the restore drill in ai/BACKUP_DESIGN.md §6. Recorded by the global AuditInterceptor (state-changing POST). */
  @Public() @UseGuards(StaffAuthGuard) @Post('run')
  async run(@Req() req: any) {
    if (!isAdmin(req.staff)) throw new ForbiddenException('Admins only');
    const actor: AuditActor = { id: req.staff.id, name: req.staff.name, role: 'admin', system: 'staff' };
    return this.backup.runBackup('manual', actor);
  }

  /** Admin-only status: last successful backup + recent run history. */
  @Public() @UseGuards(StaffAuthGuard) @Get('status')
  status(@Req() req: any) {
    if (!isAdmin(req.staff)) throw new ForbiddenException('Admins only');
    return { configured: this.backup.configured, lastSuccessful: this.store.lastSuccessful(), recent: this.store.list(30) };
  }
}
