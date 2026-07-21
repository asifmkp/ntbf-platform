import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { SupabaseService } from './supabase/supabase.service';
import { WhatsappService } from './whatsapp.service';
import { ZohoBooksService } from './zoho-books.service';
import { ApprovalService } from './approval.service';
import { AgentLoopService } from './agent-loop.service';
import { DailyTasksService } from './daily-tasks.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

/**
 * MuhammadAgentModule
 * ===================
 * Bundles the whole agent: services, the inbound webhook controller, and the
 * cron schedulers (5-minute loop + daily tasks).
 *
 * ── HOW TO WIRE IT IN ────────────────────────────────────────────────────
 *
 * Option A — run STANDALONE (simplest; matches this folder's package.json):
 *   This module is imported by src/main.ts, which boots its own Nest app on
 *   PORT (default 3005). Deploy it as its own service on Render/your VPS.
 *   Point the 360dialog inbound webhook at:  https://<host>/webhooks/whatsapp
 *
 * Option B — MOUNT into the existing foodstuffs-backend (one process):
 *   1. In backend/package.json add deps: @nestjs/schedule @supabase/supabase-js axios
 *   2. Copy this folder to backend/src/muhammad-agent
 *   3. In backend/src/app.module.ts:
 *        import { MuhammadAgentModule } from './muhammad-agent/muhammad-agent.module';
 *        @Module({ imports: [ ...existing, MuhammadAgentModule ] })
 *   4. Ensure ScheduleModule is only initialised once. If the backend already
 *      calls ScheduleModule.forRoot(), REMOVE it from the imports array below
 *      to avoid a double registration.
 *   5. Add the muhammad env vars to the backend .env.
 *
 * Either way, the DB schema (sql/001_muhammad_schema.sql) must be applied to
 * your Supabase project first.
 * ─────────────────────────────────────────────────────────────────────────
 */
@Module({
  imports: [
    // Loads .env and makes ConfigService available. If mounting into a backend
    // that already calls ConfigModule.forRoot({ isGlobal: true }), this is a
    // harmless no-op; you may remove it in that case.
    ConfigModule.forRoot({ isGlobal: true }),

    // Registers the cron scheduler. REMOVE this line if the host app already
    // calls ScheduleModule.forRoot() (Option B, step 4).
    ScheduleModule.forRoot(),
  ],
  controllers: [WhatsappWebhookController],
  providers: [
    SupabaseService,
    WhatsappService,
    ZohoBooksService,
    ApprovalService,
    AgentLoopService,
    DailyTasksService,
  ],
  exports: [SupabaseService, WhatsappService, ApprovalService],
})
export class MuhammadAgentModule {}
