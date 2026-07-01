import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { ExtractedBill } from '../ai/anthropic.service';
import { Public } from '../common/decorators/public.decorator';
import { ApiGateGuard } from '../common/guards/api-gate.guard';
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
 * Public so the field app can call it during development; gate with
 * @Departments(PURCHASE) before production.
 */
@ApiTags('Purchase bills')
@UseGuards(ApiGateGuard)
@Controller('bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Public()
  @Get('status')
  status() {
    return this.bills.status();
  }

  @Public()
  @Post('extract')
  extract(@Body() dto: ExtractDto) {
    const data = dto.imageBase64.includes(',') ? dto.imageBase64.split(',')[1] : dto.imageBase64;
    return this.bills.extract(data, dto.mediaType || 'image/jpeg');
  }

  @Public()
  @Post('match')
  match(@Body() dto: MatchDto) {
    return this.bills.match(dto.bill);
  }

  @Public()
  @Post('record')
  record(@Body() dto: RecordDto) {
    return this.bills.record(dto.bill, dto.match, dto.createVendor ?? true);
  }
}
