import { Module } from '@nestjs/common';
import { AnthropicService } from '../ai/anthropic.service';
import { AppStateModule } from '../appstate/appstate.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { MuhammedController } from './muhammed.controller';
import { MuhammedService } from './muhammed.service';
import { MuhammedLog } from './muhammed.log';

/**
 * Muhammed — the team's AI colleague. Channel-agnostic brain (read-only tools
 * over appstate, per-person sessions, conversation logging). Reached in-app via
 * POST /api/muhammed/ask, and on WhatsApp via POST /api/muhammed/wa, which the
 * Supabase bot's staff pre-check calls on the shared 360dialog number.
 */
@Module({
  imports: [StaffAuthModule, AppStateModule],
  controllers: [MuhammedController],
  providers: [MuhammedService, AnthropicService, MuhammedLog],
})
export class MuhammedModule {}
