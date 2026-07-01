import { Module } from '@nestjs/common';
import { ZohoModule } from '../zoho/zoho.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ZohoModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
