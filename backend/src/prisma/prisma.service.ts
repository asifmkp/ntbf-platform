import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  /** True once a database connection is established. */
  public dbReady = false;

  async onModuleInit() {
    try {
      await this.$connect();
      this.dbReady = true;
    } catch (e) {
      // Boot anyway — the AI copilot, Zoho dashboard, and bill capture don't need the DB.
      this.logger.warn(
        `Database unavailable — running without it. ERP write endpoints are disabled until a DB is configured. (${(e as Error).message})`,
      );
    }
  }
}
