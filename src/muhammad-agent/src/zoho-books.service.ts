import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, Method } from 'axios';

/**
 * ZohoBooksService
 * ----------------
 * Direct REST access to Zoho Books with:
 *  - self-managed OAuth (refresh-token -> short-lived access token, cached),
 *  - a hard write gate: every POST/PUT/DELETE is blocked unless
 *    ZOHO_WRITES_ENABLED=true, so the agent can be run safely against the LIVE
 *    org in read/preview mode until you explicitly turn writes on.
 *
 * NTBFLLC org: books.zoho.COM, Standard plan (see project memory). Use the
 * .com accounts/api domains (the defaults here), not .ae.
 */
@Injectable()
export class ZohoBooksService implements OnModuleInit {
  /**
   * The ONE Zoho org this platform may ever talk to (NTBFLLC, .com DC).
   * Hard-coded on purpose: a misconfigured ZOHO_ORGANIZATION_ID (a stale/wrong
   * id, or the deleted second org) must NEVER be used.
   */
  private static readonly EXPECTED_ORG_ID = '928751913';
  private readonly logger = new Logger(ZohoBooksService.name);
  private http: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: this.config.get<string>('ZOHO_API_DOMAIN', 'https://www.zohoapis.com'),
      timeout: 20_000,
    });
  }

  private get writesEnabled(): boolean {
    return this.config.get<string>('ZOHO_WRITES_ENABLED', 'false') === 'true';
  }

  private get orgId(): string {
    return this.config.get<string>('ZOHO_ORGANIZATION_ID', '');
  }

  /**
   * Fail closed at STARTUP: a non-empty org that isn't ours crashes the app,
   * rather than ever risk talking to the wrong org. (An unset org still boots
   * but is refused at call time by assertOrgAllowed.)
   */
  onModuleInit(): void {
    const configured = this.orgId;
    if (configured && configured !== ZohoBooksService.EXPECTED_ORG_ID) {
      throw new Error(
        `FATAL: ZOHO_ORGANIZATION_ID='${configured}' is not the allowed NTBF org ` +
          `${ZohoBooksService.EXPECTED_ORG_ID}. Refusing to start.`,
      );
    }
  }

  /** Refuse ANY Zoho call unless the configured org is exactly the allowed one. */
  private assertOrgAllowed(): void {
    if (this.orgId !== ZohoBooksService.EXPECTED_ORG_ID) {
      throw new Error(
        `zoho_org_guard: refusing Zoho call — configured org ` +
          `'${this.orgId || '(unset)'}' != allowed ${ZohoBooksService.EXPECTED_ORG_ID}.`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // OAuth
  // -------------------------------------------------------------------------

  private async getAccessToken(): Promise<string> {
    // 60s safety margin before expiry. Capture into a local so TS narrows the
    // nullable class property reliably.
    const cached = this.accessToken;
    if (cached && Date.now() < this.tokenExpiresAt - 60_000) {
      return cached;
    }
    const accountsDomain = this.config.get<string>(
      'ZOHO_ACCOUNTS_DOMAIN',
      'https://accounts.zoho.com',
    );
    const params = new URLSearchParams({
      refresh_token: this.config.get<string>('ZOHO_REFRESH_TOKEN', ''),
      client_id: this.config.get<string>('ZOHO_CLIENT_ID', ''),
      client_secret: this.config.get<string>('ZOHO_CLIENT_SECRET', ''),
      grant_type: 'refresh_token',
    });
    try {
      const res = await axios.post(`${accountsDomain}/oauth/v2/token?${params.toString()}`);
      const token = res.data.access_token as string;
      this.accessToken = token;
      this.tokenExpiresAt = Date.now() + (res.data.expires_in ?? 3600) * 1000;
      this.logger.log('Refreshed Zoho access token');
      return token;
    } catch (err) {
      this.logger.error(`Zoho token refresh failed: ${this.errMsg(err)}`);
      throw new Error('zoho_auth_failed');
    }
  }

  // -------------------------------------------------------------------------
  // Generic request (write-gated)
  // -------------------------------------------------------------------------

  /**
   * Low-level Zoho Books call. Reads always allowed; writes require the flag.
   * When writes are disabled, a write returns a synthetic "preview" result and
   * logs what WOULD have been sent — nothing hits the live org.
   */
  async request<T = any>(
    method: Method,
    path: string,
    body?: unknown,
  ): Promise<{ data: T | null; previewed?: boolean }> {
    this.assertOrgAllowed();
    const isWrite = ['POST', 'PUT', 'DELETE'].includes(method.toUpperCase());
    if (isWrite && !this.writesEnabled) {
      this.logger.warn(
        `[ZOHO WRITE BLOCKED] ${method} ${path} — ZOHO_WRITES_ENABLED=false. Payload: ${this.preview(body)}`,
      );
      return { data: null, previewed: true };
    }
    const token = await this.getAccessToken();
    const sep = path.includes('?') ? '&' : '?';
    try {
      const res = await this.http.request<T>({
        method,
        url: `${path}${sep}organization_id=${this.orgId}`,
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        data: body,
      });
      return { data: res.data };
    } catch (err) {
      this.logger.error(`Zoho ${method} ${path} failed: ${this.errMsg(err)}`);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Convenience wrappers (extend as needed)
  // -------------------------------------------------------------------------

  /** Raise an invoice from an order. Returns null (previewed) if writes are off. */
  async createInvoice(payload: Record<string, unknown>): Promise<{ invoiceId: string | null }> {
    const { data, previewed } = await this.request<any>('POST', '/books/v3/invoices', payload);
    if (previewed) return { invoiceId: null };
    return { invoiceId: data?.invoice?.invoice_id ?? null };
  }

  /** Create a purchase order (owner-approved reorders). Previewed when writes off. */
  async createPurchaseOrder(payload: Record<string, unknown>): Promise<{ poId: string | null }> {
    const { data, previewed } = await this.request<any>('POST', '/books/v3/purchaseorders', payload);
    if (previewed) return { poId: null };
    return { poId: data?.purchaseorder?.purchaseorder_id ?? null };
  }

  /** Read-only: list items to check stock levels. Always allowed. */
  async listItems(page = 1): Promise<any[]> {
    try {
      const { data } = await this.request<any>('GET', `/books/v3/items?page=${page}&per_page=200`);
      return data?.items ?? [];
    } catch {
      return [];
    }
  }

  private preview(body: unknown): string {
    try {
      const s = JSON.stringify(body ?? {});
      return s.length > 200 ? `${s.slice(0, 197)}...` : s;
    } catch {
      return '[unserialisable]';
    }
  }

  private errMsg(err: unknown): string {
    if (axios.isAxiosError(err)) {
      return `${err.response?.status ?? ''} ${JSON.stringify(err.response?.data ?? err.message)}`;
    }
    return err instanceof Error ? err.message : String(err);
  }
}
