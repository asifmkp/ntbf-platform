import { Module } from '@nestjs/common';
import { AnthropicService } from '../ai/anthropic.service';
import { AppStateModule } from '../appstate/appstate.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { MuhammedController } from './muhammed.controller';
import { MuhammedService } from './muhammed.service';
import { MuhammedLog } from './muhammed.log';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

/**
 * Muhammed — the team's AI colleague. Channel-agnostic brain (read-only tools
 * over appstate, per-person sessions, conversation logging). The live WhatsApp
 * (360dialog) front door is added later as a thin adapter that calls
 * MuhammedService.handle().
 */
@Module({
  imports: [StaffAuthModule, AppStateModule],
  controllers: [MuhammedController, WhatsappController],
  providers: [MuhammedService, AnthropicService, MuhammedLog, WhatsappService],
})
export class MuhammedModule {}
