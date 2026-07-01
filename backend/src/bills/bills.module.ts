import { Module } from '@nestjs/common';
import { AnthropicService } from '../ai/anthropic.service';
import { ZohoModule } from '../zoho/zoho.module';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';

@Module({
  imports: [ZohoModule],
  controllers: [BillsController],
  providers: [BillsService, AnthropicService],
})
export class BillsModule {}
