import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ZohoModule } from '../zoho/zoho.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, ZohoModule],
  controllers: [HealthController],
})
export class HealthModule {}
