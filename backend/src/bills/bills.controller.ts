import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { ExtractedBill } from '../ai/anthropic.service';
import { Public } from '../common/decorators/public.decorator';
import { ApiGateGuard } from '../common/guards/api-gate.guard';
import { StaffAuthGuard } from '../staff-auth/staff-auth.module';
import { BillsService, MatchResult } from './bills.service';

class ExtractDto {
  @IsString()
  imageBase64: string;

  @IsOptional()
  @IsString()
  mediaType: string;
}
class MatchDto {
  @IsObject()
  bill: ExtractedBill;
}
class RecordDto {
  @IsObject()
  bill: ExtractedBill;

  @IsObject()
  match: MatchResult;

  @IsOptional()
  @IsBoolean()
  createVendor?: boolean;
}

/**
 * Purchase bill capture: photo -> Claude extracts -> match Zoho -> record.
 * Every route requires a signed-in staff session (StaffAuthGuard) — the same
 * guard that protects Finance, Rashid, and the live customer-portal order
 * pipeline. ApiGateGuard stays layered on top for its rate-limiting.
 */
@ApiTags('Purchase bills')
@UseGuards(ApiGateGuard)
@Controller('bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Public()
  @UseGuards(StaffAuthGuard)
  @Get('status')
  status() {
    return this.bills.status();
  }

  @Public()
  @UseGuards(StaffAuthGuard)
  @Post('extract')
  extract(@Body() dto: ExtractDto) {
    const data = dto.imageBase64.includes(',') ? dto.imageBase64.split(',')[1] : dto.imageBase64;
    return this.bills.extract(data, dto.mediaType || 'image/jpeg');
  }

  @Public()
  @UseGuards(StaffAuthGuard)
  @Post('match')
  match(@Body() dto: MatchDto) {
    return this.bills.match(dto.bill);
  }

  @Public()
  @UseGuards(StaffAuthGuard)
  @Post('record')
  record(@Body() dto: RecordDto) {
    return this.bills.record(dto.bill, dto.match, dto.createVendor ?? true);
  }
}
