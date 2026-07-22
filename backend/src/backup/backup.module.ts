import { Module } from '@nestjs/common';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuditModule } from '../audit/audit.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupStore } from './backup.store';
import { SupabaseStorageClient } from './supabase-storage.client';

/**
 * TASK-014 / DEC-019: nightly encrypted STATE_DIR/data -> Supabase Storage backups.
 * See ai/BACKUP_DESIGN.md for the full design. ScheduleModule is registered once
 * at the app root (app.module.ts), not here.
 */
@Module({
  imports: [StaffAuthModule, AuditModule],
  controllers: [BackupController],
  providers: [BackupService, BackupStore, SupabaseStorageClient],
})
export class BackupModule {}
