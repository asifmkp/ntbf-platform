import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

/** The ONLY Zoho organization this platform is ever allowed to write to (NTBFLLC). */
export const ALLOWED_ZOHO_ORG_ID = '928751913';

/**
 * Thin Zoho Books client (.com data center by default).
 * Uses the OAuth refresh-token grant; caches the access token until it expires.
 *
 * Required env:
 *   ZOHO_ORG_ID, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
 * Optional env (defaults target the .com DC):
 *   ZOHO_ACCOUNTS_HOST=https://accounts.zoho.com
 *   ZOHO_API_HOST=https://www.zohoapis.com
 */
@Injectable()
export class ZohoService {
  private readonly logger = new Logger(ZohoService.name);
  private token: TokenCache | null = null;

  constructor(private readonly config: ConfigService) {}

  get orgId(): string {
    return this.config.get<string>('ZOHO_ORG_ID') ?? '';
  }

  /** Confirmed chart-of-account IDs for org 928751913 (env-overridable). */
  get accounts() {
    return {
      sales: this.config.get<string>('ZOHO_SALES_ACCOUNT') ?? '416943000000000388', // Sales (income)
      cogs: this.config.get<string>('ZOHO_COGS_ACCOUNT') ?? '416943000000034003', // Cost of Goods Sold
      inventory: this.config.get<string>('ZOHO_INVENTORY_ACCOUNT') ?? '416943000000034001', // Inventory Asset
      expense: this.config.get<string>('ZOHO_EXPENSE_ACCOUNT') ?? '',
      cash: this.config.get<string>('ZOHO_CASH_ACCOUNT') ?? '416943000000000361', // Petty Cash
    };
  }

  get configured(): boolean {
    return Boolean(
      this.config.get('ZOHO_ORG_ID') &&
        this.config.get('ZOHO_CLIENT_ID') &&
        this.config.get('ZOHO_CLIENT_SECRET') &&
        this.config.get('ZOHO_REFRESH_TOKEN'),
    );
  }

  /** Hard write-lock: even with confirm=true, no record is created unless this is on. */
  get writesEnabled(): boolean {
    return this.config.get('ZOHO_WRITES_ENABLED') === 'true';
  }

  private get accountsHost(): string {
    return this.config.get<string>('ZOHO_ACCOUNTS_HOST') ?? 'https://accounts.zoho.com';
  }

  private get apiHost(): string {
    return this.config.get<string>('ZOHO_API_HOST') ?? 'https://www.zohoapis.com';
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.accessToken;
    }
    if (!this.configured) {
      throw new ServiceUnavailableException('Zoho is not configured (missing env vars)');
    }

    const params = new URLSearchParams({
      refresh_token: this.config.get<string>('ZOHO_REFRESH_TOKEN')!,
      client_id: this.config.get<string>('ZOHO_CLIENT_ID')!,
      client_secret: this.config.get<string>('ZOHO_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
    });

    const res = await fetch(`${this.accountsHost}/oauth/v2/token?${params.toString()}`, {
      method: 'POST',
    });
    const data: any = await res.json();
    if (!data.access_token) {
      this.logger.error(`Zoho token refresh failed: ${JSON.stringify(data)}`);
      throw new ServiceUnavailableException('Could not obtain Zoho access token');
    }
    this.token = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return this.token.accessToken;
  }

  /** GET a Zoho Books endpoint (e.g. 'items', 'invoices'), returns parsed JSON. */
  async get<T = any>(path: string, query: Record<string, string | number> = {}): Promise<T> {
    const token = await this.getAccessToken();
    const params = new URLSearchParams({ organization_id: this.orgId });
    for (const [k, v] of Object.entries(query)) params.set(k, String(v));

    const res = await fetch(`${this.apiHost}/books/v3/${path}?${params.toString()}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ServiceUnavailableException(`Zoho ${path} failed: ${res.status} ${body}`);
    }
    return res.json() as Promise<T>;
  }

  // --- Convenience reads used by the dashboard ---
  async listItems(): Promise<any[]> {
    const data = await this.get('items', { per_page: 200 });
    return (data as any).items ?? [];
  }

  async invoiceSummary(): Promise<{ total: number; balance: number; count: number }> {
    const data: any = await this.get('invoices', { per_page: 1, response_option: 3 });
    const sums = data.page_context?.sum_columns ?? { total: 0, balance: 0 };
    return { total: sums.total ?? 0, balance: sums.balance ?? 0, count: data.page_context?.total ?? 0 };
  }

  async listContacts(type: 'customer' | 'vendor'): Promise<any[]> {
    const data: any = await this.get('contacts', { per_page: 200, contact_type: type });
    return data.contacts ?? [];
  }

  async countContacts(type: 'customer' | 'vendor'): Promise<number> {
    return (await this.listContacts(type)).length;
  }

  /** POST a Zoho Books endpoint (e.g. 'bills', 'contacts').
   *  Choke point for ALL writes: enforces the write-lock AND the org allow-list here,
   *  so no code path can write to Zoho — or to any org other than 928751913 — by mistake. */
  async post<T = any>(path: string, payload: Record<string, unknown>): Promise<T> {
    if (!this.writesEnabled) {
      throw new ServiceUnavailableException('Zoho writes are disabled (ZOHO_WRITES_ENABLED is off). Nothing was written.');
    }
    if (this.orgId !== ALLOWED_ZOHO_ORG_ID) {
      throw new ForbiddenException(`Zoho write blocked: configured org '${this.orgId || '(unset)'}' is not the allowed org ${ALLOWED_ZOHO_ORG_ID}.`);
    }
    const token = await this.getAccessToken();
    const params = new URLSearchParams({ organization_id: this.orgId });
    const res = await fetch(`${this.apiHost}/books/v3/${path}?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data: any = await res.json();
    if (!res.ok || (data.code && data.code !== 0)) {
      throw new ServiceUnavailableException(`Zoho POST ${path} failed: ${JSON.stringify(data)}`);
    }
    return data as T;
  }

  /** Create a vendor bill in Zoho Books. */
  async createBill(payload: Record<string, unknown>): Promise<any> {
    return this.post('bills', payload);
  }

  /** Create an expense in Zoho Books. */
  async createExpense(payload: Record<string, unknown>): Promise<any> {
    return this.post('expenses', payload);
  }

  /** Create a purchase order in Zoho Books. */
  async createPurchaseOrder(payload: Record<string, unknown>): Promise<any> {
    return this.post('purchaseorders', payload);
  }

  /** Attach a document (base64) to a Zoho record for audit. */
  async attachToRecord(module: string, recordId: string, base64: string, filename: string): Promise<any> {
    // Placeholder: Zoho attachment API is multipart; wire when going live.
    this.logger.log(`[attach] ${module}/${recordId} <- ${filename} (${Math.round(base64.length / 1024)}KB)`);
    return { attached: true, module, recordId, filename };
  }

  /** Create a vendor contact, returns the new contact_id. */
  async createVendor(name: string): Promise<string> {
    const data: any = await this.post('contacts', { contact_name: name, contact_type: 'vendor' });
    return data.contact?.contact_id;
  }

  async countList(path: 'salesorders' | 'purchaseorders'): Promise<number> {
    const data: any = await this.get(path, { per_page: 200 });
    return (data[path] ?? []).length;
  }
}
