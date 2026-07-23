import { Module } from '@nestjs/common';
import { ZohoModule } from '../zoho/zoho.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ZohoModule],
  controllers: [HealthController],
})
export class HealthModule {}
