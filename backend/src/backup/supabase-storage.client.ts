import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface StorageObject {
  name: string;
  updated_at: string | null;
  created_at: string | null;
  metadata: { size?: number } | null;
}

/**
 * Thin Supabase Storage REST client (no @supabase/supabase-js dependency —
 * a handful of fetch calls doesn't justify the SDK weight). Talks to the
 * SAME Supabase project as the WhatsApp bot (FACT-011), reusing that vendor
 * relationship rather than provisioning a second one (ai/BACKUP_DESIGN.md §2).
 */
@Injectable()
export class SupabaseStorageClient {
  private readonly logger = new Logger(SupabaseStorageClient.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.url && this.serviceKey && this.bucket);
  }

  private get url(): string {
    return (this.config.get<string>('SUPABASE_URL') || '').replace(/\/+$/, '');
  }

  private get serviceKey(): string {
    return this.config.get<string>('SUPABASE_SERVICE_KEY') || '';
  }

  get bucket(): string {
    return this.config.get<string>('SUPABASE_BACKUP_BUCKET') || 'ntbf-backups';
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }

  async upload(objectPath: string, body: Buffer): Promise<void> {
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${objectPath}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/octet-stream' }),
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`Supabase Storage upload failed: ${res.status} ${await res.text().catch(() => '')}`);
  }

  async list(prefix: string): Promise<StorageObject[]> {
    const res = await fetch(`${this.url}/storage/v1/object/list/${this.bucket}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix, limit: 200, sortBy: { column: 'name', order: 'desc' } }),
    });
    if (!res.ok) throw new Error(`Supabase Storage list failed: ${res.status} ${await res.text().catch(() => '')}`);
    const rows = (await res.json()) as any[];
    // The list endpoint returns bare filenames within the prefix; re-attach it so
    // callers can pass full object paths straight to remove()/move().
    return rows.filter((r) => r && r.name).map((r) => ({ ...r, name: `${prefix}${r.name}` }));
  }

  async remove(objectPaths: string[]): Promise<void> {
    if (!objectPaths.length) return;
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}`, {
      method: 'DELETE',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: objectPaths }),
    });
    if (!res.ok) throw new Error(`Supabase Storage remove failed: ${res.status} ${await res.text().catch(() => '')}`);
  }

  /** Moves (not copies) an object between prefixes — used to promote a daily backup into weekly/monthly without duplicating storage. */
  async move(sourceKey: string, destinationKey: string): Promise<void> {
    const res = await fetch(`${this.url}/storage/v1/object/move`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ bucketId: this.bucket, sourceKey, destinationKey }),
    });
    if (!res.ok) throw new Error(`Supabase Storage move failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
}
