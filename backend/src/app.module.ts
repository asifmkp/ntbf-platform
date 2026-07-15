import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ZohoModule } from './zoho/zoho.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BillsModule } from './bills/bills.module';
import { AgentModule } from './agent/agent.module';
import { ProcurementModule } from './procurement/procurement.module';
import { HrModule } from './hr/hr.module';
import { SalesModule } from './sales/sales.module';
import { DeliveryModule } from './delivery/delivery.module';
import { AccountingModule } from './accounting/accounting.module';
import { DocumentsModule } from './documents/documents.module';
import { AppStateModule } from './appstate/appstate.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';
import { StaffAuthModule } from './staff-auth/staff-auth.module';
import { SupportModule } from './support/support.module';
import { RashidModule } from './rashid/rashid.module';
import { MuhammedModule } from './muhammed/muhammed.module';
import { FinanceModule } from './finance/finance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Serve the front-end apps so the whole platform is one deployable service.
    ServeStaticModule.forRoot({
      rootPath: process.env.STATIC_DIR || join(process.cwd(), '..', 'apps'),
      exclude: ['/api/(.*)'],
      // Serve /.well-known/* (Digital Asset Links for the Android TWA); dotfiles are ignored by default.
      serveStaticOptions: {
        dotfiles: 'allow',
        // Cache-busting: app code (html/js/css) is always revalidated (ETag → cheap 304s
        // when unchanged, fresh 200 when deployed), so phones never serve a stale app.js.
        // Images/icons/fonts rarely change, so cache them for a week for speed.
        setHeaders: (res: any, filePath: string) => {
          if (/\.(?:html|js|css)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
          else if (/\.(?:png|jpe?g|gif|svg|ico|webp|woff2?|ttf)$/i.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800');
        },
      },
    }),
    PrismaModule,
    NotificationsModule,
    AuthModule,
    CatalogModule,
    CustomersModule,
    OrdersModule,
    PaymentsModule,
    InventoryModule,
    ZohoModule,
    DashboardModule,
    BillsModule,
    AgentModule,
    ProcurementModule,
    HrModule,
    SalesModule,
    DeliveryModule,
    AccountingModule,
    SupportModule,
    DocumentsModule,
    AppStateModule,
    CustomerPortalModule,
    StaffAuthModule,
    RashidModule,
    MuhammedModule,
    FinanceModule,
  ],
  providers: [
    // Global: authenticate every route (unless @Public), then enforce role/dept/access.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
