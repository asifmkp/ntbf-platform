import { Body, Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { StaffAuthGuard, StaffStore } from '../staff-auth/staff-auth.module';
import { MuhammedService } from './muhammed.service';
import { MuhammedLog } from './muhammed.log';

class AskDto {
  @IsString() text: string;
  @IsOptional() @IsBoolean() reset?: boolean;
}
class SetPhoneDto {
  @IsString() staffId: string;
  @IsString() phone: string;
}

/**
 * Muhammed — the team's AI colleague. This controller is the API surface used
 * for testing from the app / curl; the live WhatsApp (360dialog) front door will
 * call MuhammedService.handle() with the same identity shape once wired.
 */
@ApiTags('Muhammed')
@Controller('muhammed')
export class MuhammedController {
  constructor(
    private readonly muhammed: MuhammedService,
    private readonly staff: StaffStore,
    private readonly log: MuhammedLog,
  ) {}

  @Public()
  @Get('status')
  status(@Query('ping') ping?: string) {
    if (ping === '1' || ping === 'true') return this.muhammed.ping();
    return this.muhammed.status();
  }

  /** Chat with Muhammed as the signed-in staff member (identity = the staff JWT). */
  @Public()
  @UseGuards(StaffAuthGuard)
  @Post('ask')
  ask(@Body() dto: AskDto, @Req() req: any) {
    const s = req.staff;
    return this.muhammed.handle({ id: s.id, name: s.name, roles: s.roles || [] }, dto.text, { reset: dto.reset });
  }

  // ---- admin (owner) only: identity registry + team-report log ----
  private assertAdmin(req: any) {
    if (!req.staff || !(req.staff.roles || []).includes('admin')) throw new ForbiddenException('Owner only');
  }

  /** Map a WhatsApp phone number to a staff account, so the 360dialog front door can identify the sender. */
  @Public()
  @UseGuards(StaffAuthGuard)
  @Post('identity')
  setPhone(@Body() dto: SetPhoneDto, @Req() req: any) {
    this.assertAdmin(req);
    if (!this.staff.setPhone(dto.staffId, dto.phone)) throw new ForbiddenException('Staff not found');
    return { ok: true };
  }

  @Public()
  @UseGuards(StaffAuthGuard)
  @Get('identities')
  identities(@Req() req: any) {
    this.assertAdmin(req);
    return this.staff.listWithPhones();
  }

  @Public()
  @UseGuards(StaffAuthGuard)
  @Get('logs')
  logs(@Req() req: any, @Query('unanswered') unanswered?: string) {
    this.assertAdmin(req);
    return this.log.query({ unansweredOnly: unanswered === '1' || unanswered === 'true' });
  }
}
