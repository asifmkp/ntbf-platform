import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ApiGateGuard } from '../common/guards/api-gate.guard';
import { ZohoService } from '../zoho/zoho.service';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly zoho: ZohoService,
  ) {}

  /**
   * Live dashboard summary aggregated from Zoho Books.
   * Public so the static role dashboards can fetch it during development;
   * tighten with @Departments/@MinAccessLevel before production.
   */
  @Public()
  @UseGuards(ApiGateGuard)
  @Get('summary')
  async summary() {
    if (!this.zoho.configured) {
      throw new ServiceUnavailableException(
        'Zoho not configured. Set ZOHO_ORG_ID / ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN in .env',
      );
    }
    return this.dashboard.getSummary();
  }

  @Public()
  @Get('health')
  health() {
    return { zohoConfigured: this.zoho.configured };
  }
}
