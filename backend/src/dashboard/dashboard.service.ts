import { Injectable, Logger } from '@nestjs/common';
import { ZohoService } from '../zoho/zoho.service';

export type PricingStatus = 'ok' | 'loss' | 'missing';

export interface DashboardItem {
  name: string;
  sku: string;
  unit: string;
  rate: number;
  cost: number;
  stockOnHand: number;
  margin: number | null;
  status: PricingStatus;
  note: string;
}

export interface DashboardSummary {
  org: { name: string; currency: string; vat: number; state: string };
  counts: {
    products: number;
    customers: number;
    vendors: number;
    salesOrders: number;
    purchaseOrders: number;
    invoices: number;
  };
  totals: { revenueMtd: number; outstanding: number; stockUnits: number; inventoryValue: number };
  items: DashboardItem[];
  source: 'zoho' | 'unavailable';
  generatedAt: string;
}

function classify(rate: number, cost: number): { status: PricingStatus; note: string } {
  if (!rate) return { status: 'missing', note: 'no sale price set' };
  if (!cost) return { status: 'missing', note: 'no purchase cost set — margin overstated' };
  if (rate - cost < 0) return { status: 'loss', note: 'selling below cost' };
  return { status: 'ok', note: '' };
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly zoho: ZohoService) {}

  async getSummary(): Promise<DashboardSummary> {
    const rawItems = await this.zoho.listItems();
    const items: DashboardItem[] = rawItems.map((it) => {
      const rate = Number(it.rate) || 0;
      const cost = Number(it.purchase_rate) || 0;
      const { status, note } = classify(rate, cost);
      return {
        name: it.name,
        sku: it.sku || '—',
        unit: it.unit || '—',
        rate,
        cost,
        stockOnHand: Number(it.stock_on_hand) || 0,
        margin: rate && cost ? Math.round((rate - cost) * 100) / 100 : null,
        status,
        note,
      };
    });

    const [invoice, customers, vendors, salesOrders, purchaseOrders] = await Promise.all([
      this.zoho.invoiceSummary(),
      this.zoho.countContacts('customer'),
      this.zoho.countContacts('vendor'),
      this.zoho.countList('salesorders'),
      this.zoho.countList('purchaseorders'),
    ]);

    const stockUnits = items.reduce((s, i) => s + i.stockOnHand, 0);
    const inventoryValue = Math.round(items.reduce((s, i) => s + i.stockOnHand * i.cost, 0) * 100) / 100;

    return {
      org: { name: 'NTBFLLC', currency: 'AED', vat: 5, state: 'Ajman, UAE' },
      counts: {
        products: items.length,
        customers,
        vendors,
        salesOrders,
        purchaseOrders,
        invoices: invoice.count,
      },
      totals: {
        revenueMtd: invoice.total,
        outstanding: invoice.balance,
        stockUnits,
        inventoryValue,
      },
      items,
      source: 'zoho',
      generatedAt: new Date().toISOString(),
    };
  }
}
