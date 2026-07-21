import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * SupabaseService
 * ----------------
 * Wraps the Supabase JS client (service-role key, server-side only) and adds:
 *  - a small in-memory cache of the `agent_config` table (refreshed periodically),
 *  - convenience helpers for the tables Muhammad uses,
 *  - consistent error logging.
 *
 * The service-role key bypasses RLS, so this must NEVER run in a browser.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client?: SupabaseClient;
  private configCache = new Map<string, unknown>();
  private configLoadedAt = 0;
  private readonly CONFIG_TTL_MS = 60_000; // re-read agent_config at most once a minute

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      // Don't hard-crash the boot (createClient throws on an empty URL). Leave
      // the client unset and fail loudly only when something actually tries to
      // use it — so the app can start and show this message clearly.
      this.logger.error(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — set them in .env before running. ' +
          'Supabase is DISABLED until then.',
      );
      return;
    }
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.logger.log('Supabase client initialised');
  }

  /** Raw client for advanced/ad-hoc queries. Throws a clear error if unconfigured. */
  get db(): SupabaseClient {
    if (!this.client) {
      throw new Error('Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    }
    return this.client;
  }

  /** Shorthand for `this.db.from(table)`. */
  from(table: string) {
    return this.db.from(table);
  }

  // -------------------------------------------------------------------------
  // agent_config caching
  // -------------------------------------------------------------------------

  /**
   * Read a config value, DB first (cached) then .env fallback then default.
   * Values in agent_config are jsonb; env values are strings.
   */
  async getConfig<T = unknown>(key: string, fallback?: T): Promise<T> {
    await this.ensureConfigFresh();
    if (this.configCache.has(key)) {
      return this.configCache.get(key) as T;
    }
    const envKey = key.toUpperCase();
    const envVal = this.config.get<string>(envKey);
    if (envVal !== undefined) return this.coerce(envVal) as T;
    return fallback as T;
  }

  private async ensureConfigFresh(): Promise<void> {
    if (Date.now() - this.configLoadedAt < this.CONFIG_TTL_MS && this.configCache.size) {
      return;
    }
    try {
      const { data, error } = await this.db.from('agent_config').select('key, value');
      if (error) throw error;
      this.configCache.clear();
      for (const row of data ?? []) {
        this.configCache.set(row.key, row.value);
      }
      this.configLoadedAt = Date.now();
    } catch (err) {
      // Non-fatal: fall back to env/defaults. Log once per failure.
      this.logger.warn(`Could not refresh agent_config: ${this.msg(err)}`);
    }
  }

  private coerce(v: string): unknown {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v !== '' && !isNaN(Number(v))) return Number(v);
    return v;
  }

  // -------------------------------------------------------------------------
  // staff helpers
  // -------------------------------------------------------------------------

  async getActiveStaffByRole(role: string) {
    const { data, error } = await this.db
      .from('staff')
      .select('*')
      .eq('role', role)
      .eq('active', true);
    if (error) {
      this.logger.error(`getActiveStaffByRole(${role}) failed: ${this.msg(error)}`);
      return [];
    }
    return data ?? [];
  }

  async getStaffByWhatsapp(whatsapp: string) {
    const { data, error } = await this.db
      .from('staff')
      .select('*')
      .eq('whatsapp', this.normalizeNumber(whatsapp))
      .maybeSingle();
    if (error) {
      this.logger.error(`getStaffByWhatsapp failed: ${this.msg(error)}`);
      return null;
    }
    return data;
  }

  // -------------------------------------------------------------------------
  // generic insert/update with logging
  // -------------------------------------------------------------------------

  async insert<T = any>(table: string, row: Record<string, unknown>): Promise<T | null> {
    const { data, error } = await this.db.from(table).insert(row).select().maybeSingle();
    if (error) {
      this.logger.error(`insert into ${table} failed: ${this.msg(error)}`);
      throw error;
    }
    return data as T;
  }

  async update(table: string, match: Record<string, unknown>, patch: Record<string, unknown>) {
    let q = this.db.from(table).update(patch);
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v as any);
    const { error } = await q;
    if (error) {
      this.logger.error(`update ${table} failed: ${this.msg(error)}`);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // utils
  // -------------------------------------------------------------------------

  /** Strip '+' and spaces so numbers compare consistently (E.164 digits only). */
  normalizeNumber(n: string): string {
    return (n ?? '').replace(/[^0-9]/g, '');
  }

  private msg(err: unknown): string {
    if (err instanceof Error) return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
}
