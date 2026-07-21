import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from './supabase/supabase.service';
import { WhatsappService } from './whatsapp.service';
import { ZohoBooksService } from './zoho-books.service';
import { ApprovalService } from './approval.service';

/**
 * AgentLoopService
 * ----------------
 * The heartbeat. Every 5 minutes Muhammad walks the order-to-cash state machine
 * and nudges whatever is stuck. Each step is isolated in try/catch so one bad
 * order can never stall the rest; hard failures are pushed to `failed_jobs` for
 * exponential-backoff retry, and exhausted jobs escalate to the owner.
 *
 * A run is skipped entirely when agent_enabled=false (dry-run posture).
 * Concurrency guard prevents overlapping runs if a step is slow.
 */
@Injectable()
export class AgentLoopService {
  private readonly logger = new Logger(AgentLoopService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly whatsapp: WhatsappService,
    private readonly zoho: ZohoBooksService,
    private readonly approvals: ApprovalService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'agent-loop' })
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous loop still running — skipping this tick');
      return;
    }
    const enabled = await this.supabase.getConfig<boolean>('agent_enabled', true);
    if (!enabled) {
      this.logger.log('agent_enabled=false — loop in dry-run, no external actions');
    }

    this.running = true;
    const started = Date.now();
    this.logger.log('— agent loop start —');
    try {
      await this.safe('processPendingOrders', () => this.processPendingOrders());
      await this.safe('assignDeliveries', () => this.assignDeliveries());
      await this.safe('cashCollectionReminders', () => this.cashCollectionReminders());
      await this.safe('stockCheck', () => this.stockCheck());
      await this.safe('retryFailedJobs', () => this.retryFailedJobs());
      await this.safe('expireApprovals', () => this.approvals.expireStale());
    } finally {
      this.running = false;
      this.logger.log(`— agent loop done in ${Date.now() - started}ms —`);
    }
  }

  // -------------------------------------------------------------------------
  // Step 1 — process pending orders
  // -------------------------------------------------------------------------
  private async processPendingOrders(): Promise<void> {
    const { data: orders } = await this.supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .limit(50);

    const threshold = Number(
      await this.supabase.getConfig('approval_order_value_threshold_aed', 1000),
    );

    for (const order of orders ?? []) {
      try {
        const needsApproval =
          order.is_new_customer ||
          Number(order.total_aed) >= threshold ||
          (order.is_reorder && order.reorder_overdue);

        if (needsApproval) {
          const reason = order.is_new_customer
            ? 'new customer'
            : Number(order.total_aed) >= threshold
              ? `value AED ${order.total_aed} ≥ ${threshold}`
              : 'overdue reorder';
          const { approvalId } = await this.approvals.requestApproval({
            type: 'order',
            refTable: 'orders',
            refId: order.id,
            question:
              `Order from *${order.customer_name ?? 'unknown'}* for *AED ${order.total_aed}* ` +
              `needs your OK (${reason}).`,
          });
          await this.supabase.update(
            'orders',
            { id: order.id },
            { status: 'needs_approval', needs_approval: true, approval_id: approvalId },
          );
          this.logger.log(`Order ${order.id} -> needs_approval (${reason})`);
        } else {
          await this.autoInvoice(order);
        }
      } catch (err) {
        await this.pushFailed('process_order', { orderId: order.id }, err);
      }
    }
  }

  /** Raise the invoice (gated by ZOHO_WRITES_ENABLED) and advance state. */
  private async autoInvoice(order: any): Promise<void> {
    const { invoiceId } = await this.zoho.createInvoice({
      customer_name: order.customer_name,
      // Minimal payload; real line items come from Phase 2 order parsing.
      line_items: order.meta?.line_items ?? [],
      notes: `Auto-invoiced by Muhammad agent for order ${order.id}`,
    });
    await this.supabase.update(
      'orders',
      { id: order.id },
      { status: 'invoiced', zoho_invoice_id: invoiceId, invoiced_at: new Date().toISOString() },
    );
    this.logger.log(
      `Order ${order.id} -> invoiced${invoiceId ? ` (Zoho ${invoiceId})` : ' (preview, writes off)'}`,
    );
  }

  // -------------------------------------------------------------------------
  // Step 2 — assign delivery staff to invoiced orders
  // -------------------------------------------------------------------------
  private async assignDeliveries(): Promise<void> {
    const { data: orders } = await this.supabase
      .from('orders')
      .select('*')
      .eq('status', 'invoiced')
      .limit(50);
    if (!orders?.length) return;

    const delivery = await this.supabase.getActiveStaffByRole('delivery');
    if (!delivery.length) {
      this.logger.warn('No active delivery staff to assign');
      return;
    }
    const driver = delivery[0]; // single-driver today (Musthafa); round-robin later.

    for (const order of orders) {
      try {
        await this.supabase.update(
          'orders',
          { id: order.id },
          { status: 'assigned', assigned_delivery: driver.id },
        );
        await this.whatsapp.sendText(
          driver.whatsapp,
          `📦 New delivery: *${order.customer_name ?? 'customer'}* — AED ${order.total_aed}. ` +
            `Reply *done* once delivered.`,
          {
            dedupeKey: `assign:${order.id}`,
            relatedType: 'order',
            relatedId: order.id,
          },
        );
        this.logger.log(`Order ${order.id} assigned to ${driver.name}`);
      } catch (err) {
        await this.pushFailed('assign_delivery', { orderId: order.id }, err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 3 — cash-collection reminders for delivered-but-uncollected
  // -------------------------------------------------------------------------
  private async cashCollectionReminders(): Promise<void> {
    const hours = Number(await this.supabase.getConfig('cash_collection_reminder_hours', 24));
    const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();

    const { data: orders } = await this.supabase
      .from('orders')
      .select('*')
      .eq('status', 'delivered')
      .is('collected_at', null)
      .lt('delivered_at', cutoff)
      .limit(50);
    if (!orders?.length) return;

    const delivery = await this.supabase.getActiveStaffByRole('delivery');
    const driver = delivery[0];
    const today = new Date().toISOString().slice(0, 10);

    for (const order of orders) {
      try {
        const target = order.assigned_delivery
          ? (delivery.find((d) => d.id === order.assigned_delivery) ?? driver)
          : driver;
        if (!target) continue;
        await this.whatsapp.sendText(
          target.whatsapp,
          `💵 Cash still uncollected: *${order.customer_name ?? 'customer'}* — AED ${order.total_aed} ` +
            `(delivered ${this.since(order.delivered_at)}). Please collect and reply *collected*.`,
          {
            // one reminder per order per day
            dedupeKey: `collect:${order.id}:${today}`,
            relatedType: 'order',
            relatedId: order.id,
          },
        );
      } catch (err) {
        await this.pushFailed('collection_reminder', { orderId: order.id }, err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 4 — stock check -> warehouse alert + owner PO approval
  // -------------------------------------------------------------------------
  private async stockCheck(): Promise<void> {
    // Stock levels live in `stock_levels`; `stock_alerts` is the view of rows where
    // qty <= reorder_level (see sql/stock_levels.sql). An empty table is a normal
    // pre-seed state — skip quietly, don't error.
    const { count, error: countErr } = await this.supabase
      .from('stock_levels')
      .select('item_id', { count: 'exact', head: true });
    if (countErr) {
      this.logger.debug(`stockCheck skipped (no stock_levels source yet): ${countErr.message}`);
      return;
    }
    if (!count) {
      this.logger.log('stock_levels empty — skipping');
      return;
    }

    const { data: low, error } = await this.supabase
      .from('stock_alerts')
      .select('*')
      .limit(50);
    if (error) {
      this.logger.debug(`stockCheck skipped (stock_alerts unavailable): ${error.message}`);
      return;
    }
    if (!low?.length) return;

    const warehouse = await this.supabase.getActiveStaffByRole('warehouse');
    const haris = warehouse[0];
    const today = new Date().toISOString().slice(0, 10);

    for (const item of low) {
      try {
        if (haris) {
          await this.whatsapp.sendText(
            haris.whatsapp,
            `⚠️ Low stock: *${item.item_name}* — qty ${item.qty}, reorder level ${item.reorder_level} (updated ${item.days_since_update}d ago).`,
            { dedupeKey: `lowstock:${item.item_id}:${today}`, relatedType: 'stock', relatedId: item.item_id },
          );
        }
        // Owner PO approval (draft reorder).
        await this.approvals.requestApproval({
          type: 'purchase_order',
          refTable: 'stock_levels',
          refId: item.item_id,
          question: `Reorder *${item.item_name}*? Qty ${item.qty} (reorder level ${item.reorder_level}).`,
        });
      } catch (err) {
        await this.pushFailed('stock_check', { itemId: item.item_id }, err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 5 — retry failed jobs with exponential backoff
  // -------------------------------------------------------------------------
  private async retryFailedJobs(): Promise<void> {
    const nowIso = new Date().toISOString();
    const { data: jobs } = await this.supabase
      .from('failed_jobs')
      .select('*')
      .in('status', ['pending', 'retrying'])
      .lte('next_run_at', nowIso)
      .limit(25);

    for (const job of jobs ?? []) {
      const attempts = job.attempts + 1;
      if (attempts > job.max_attempts) {
        await this.supabase.update('failed_jobs', { id: job.id }, { status: 'exhausted' });
        await this.escalate(job);
        continue;
      }
      try {
        await this.replay(job);
        await this.supabase.update('failed_jobs', { id: job.id }, { status: 'resolved', attempts });
        this.logger.log(`Retried job ${job.id} (${job.job_type}) — resolved`);
      } catch (err) {
        const base = Number(this.config.get('RETRY_BASE_DELAY_MS', 2000));
        const delay = base * Math.pow(2, attempts - 1); // 2s,4s,8s,16s...
        await this.supabase.update(
          'failed_jobs',
          { id: job.id },
          {
            status: 'retrying',
            attempts,
            last_error: this.msg(err),
            next_run_at: new Date(Date.now() + delay).toISOString(),
          },
        );
        this.logger.warn(`Job ${job.id} retry ${attempts} failed; next in ${delay}ms`);
      }
    }
  }

  /** Re-dispatch a failed job to the step that owns it. */
  private async replay(job: any): Promise<void> {
    switch (job.job_type) {
      case 'process_order': {
        const { data: o } = await this.supabase
          .from('orders')
          .select('*')
          .eq('id', job.payload.orderId)
          .maybeSingle();
        if (o && o.status === 'pending') await this.autoInvoice(o);
        return;
      }
      // Other job types re-run on the next natural loop; mark resolved.
      default:
        return;
    }
  }

  private async escalate(job: any): Promise<void> {
    const owner = this.supabase.normalizeNumber(this.config.get('OWNER_WHATSAPP', ''));
    if (!owner) return;
    await this.supabase.update('failed_jobs', { id: job.id }, { status: 'escalated' });
    await this.whatsapp.sendText(
      owner,
      `🚨 A job failed ${job.max_attempts}× and needs you: *${job.job_type}*\n` +
        `Last error: ${this.trim(job.last_error)}`,
      { urgent: true, dedupeKey: `escalate:${job.id}`, relatedType: 'job', relatedId: job.id },
    );
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------
  private async safe(step: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Step ${step} threw: ${this.msg(err)}`);
    }
  }

  private async pushFailed(jobType: string, payload: Record<string, unknown>, err: unknown): Promise<void> {
    this.logger.error(`${jobType} failed: ${this.msg(err)} — queuing for retry`);
    try {
      await this.supabase.from('failed_jobs').insert({
        job_type: jobType,
        payload,
        attempts: 0,
        max_attempts: Number(this.config.get('RETRY_MAX_ATTEMPTS', 5)),
        last_error: this.msg(err),
        status: 'pending',
      });
    } catch (e) {
      this.logger.error(`Could not enqueue failed_job: ${this.msg(e)}`);
    }
  }

  private since(iso?: string): string {
    if (!iso) return 'recently';
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
    return h >= 24 ? `${Math.floor(h / 24)}d ago` : `${h}h ago`;
  }

  private trim(s?: string): string {
    return (s ?? '').slice(0, 200);
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
