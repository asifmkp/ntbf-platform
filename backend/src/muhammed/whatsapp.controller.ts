import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { WhatsappService } from './whatsapp.service';

/**
 * The single inbound WhatsApp (360dialog) webhook for the shared number.
 * Acknowledges 200 immediately, then processes async so slow AI replies never
 * cause WhatsApp retries / duplicate answers.
 */
@ApiTags('Muhammed')
@Controller('wa')
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  /** Webhook verification handshake (360dialog / Meta): echo the challenge. */
  @Public()
  @Get('webhook')
  verify(@Query() query: Record<string, any>): string {
    const challenge = this.wa.verify(query);
    if (challenge === null) throw new ForbiddenException('verification failed');
    return challenge;
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  inbound(@Body() body: any, @Query('token') token?: string) {
    if (!this.wa.secretOk(token)) throw new ForbiddenException('bad webhook secret');
    // Fire-and-forget: reply fast; process (identify sender → Muhammed or forward) in the background.
    void this.wa.process(body);
    return { received: true };
  }
}
