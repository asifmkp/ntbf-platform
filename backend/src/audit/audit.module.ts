import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AuditStore } from './audit.store';

/**
 * Audit module (Stage 1) — additive, fail-open, local-only.
 *
 * Registering AuditInterceptor via APP_INTERCEPTOR at the module level wires it
 * as a GLOBAL interceptor across every route in the app, with full DI (so it can
 * inject AuditService). StaffAuthModule is imported so the admin read/verify
 * endpoints can reuse the shared StaffAuthGuard.
 */
@Module({
  imports: [StaffAuthModule],
  controllers: [AuditController],
  providers: [
    AuditStore,
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
