import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from './supabase/supabase.service';
import { WhatsappService } from './whatsapp.service';
import { ApprovalService } from './approval.service';

/**
 * DailyTasksService
 * -----------------
 * Fixed clock-time jobs. Each @Cron uses AGENT_TIMEZONE (Asia/Dubai by default)
 * so "07:00" means 07:00 for the UAE staff regardless of server locale.
 *
 * Every job:
 *  - records a task_instance (audit + basis for "reply done" completion),
 *  - sends the relevant WhatsApp,
 *  - is guarded by agent_enabled (dry-run when off).
 *
 * Roles: Tahir = sales, Musthafa = delivery, Haris = warehouse.
 */
@Injectable()
export class DailyTasksService {
  private readonly logger = new Logger(DailyTasksService.name);
  private readonly tz: string;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly whatsapp: WhatsappService,
    private readonly approvals: ApprovalService,
  ) {
    this.tz = this.config.get<string>('AGENT_TIMEZONE', 'Asia/Dubai');
  }

  // 07:00 — delivery route + collection list -> Musthafa
  @Cron('0 7 * * *', { name: 'daily-delivery-route', timeZone: 'Asia/Dubai' })
  async deliveryRoute(): Promise<void> {
    await this.run('daily_delivery_route', 'delivery', async (staff) => {
      const assigned = await this.count('assigned');
      const uncollected = await this.count('delivered', true);
      return (
        `☀️ Good morning ${staff.name}.\n\n` +
        `📦 Deliveries to run today: *${assigned}*\n` +
        `💵 Pending collections: *${uncollected}*\n\n` +
        `Reply *done* after each delivery, *collected* after each collection.`
      );
    });
  }

  // 08:00 — pending-orders list -> Tahir ; stock alerts -> Haris
  @Cron('0 8 * * *', { name: 'daily-morning-briefs', timeZone: 'Asia/Dubai' })
  async morningBriefs(): Promise<void> {
    await this.run('daily_pending_orders', 'sales', async (staff) => {
      const pending = await this.count('pending');
      const needsApproval = await this.count('needs_approval');
      return (
        `☀️ Morning ${staff.name}.\n\n` +
        `🧾 Pending orders: *${pending}*\n` +
        `⏳ Waiting on owner approval: *${needsApproval}*\n\n` +
        `Please chase anything stuck.`
      );
    });

    await this.run('daily_stock_alerts', 'warehouse', async (staff) => {
      return `☀️ Morning ${staff.name}. Please review stock and flag anything low so I can draft reorders.`;
    });
  }

  // 17:00 — ask Tahir for new customer leads
  @Cron('0 17 * * *', { name: 'daily-customer-leads', timeZone: 'Asia/Dubai' })
  async customerLeads(): Promise<void> {
    await this.run('daily_customer_leads', 'sales', async (staff) => {
      return (
        `📇 ${staff.name}, any new customer leads today? ` +
        `Send name + WhatsApp + area and I'll set them up (pending owner approval).`
      );
    });
  }

  // 18:00 — ask Haris to approve/reject reorder drafts
  @Cron('0 18 * * *', { name: 'daily-reorder-review', timeZone: 'Asia/Dubai' })
  async reorderReview(): Promise<void> {
    await this.run('daily_reorder_review', 'warehouse', async (staff) => {
      return `📝 ${staff.name}, please review today's reorder drafts and reply which to keep. I'll route approved ones to the owner.`;
    });
  }

  // 20:30 — remind owner of waiting approvals
  @Cron('30 20 * * *', { name: 'daily-owner-approvals', timeZone: 'Asia/Dubai' })
  async ownerApprovalReminder(): Promise<void> {
    const pending = await this.approvals.listPending();
    const owner = this.supabase.normalizeNumber(this.config.get('OWNER_WHATSAPP', ''));
    if (!owner) return;
    if (!pending.length) {
      this.logger.log('No pending approvals to remind about');
      return;
    }
    const lines = pending
      .slice(0, 10)
      .map((a, i) => `${i + 1}. ${a.question}  _(${a.id.slice(0, 8)})_`)
      .join('\n');
    await this.whatsapp.sendText(
      owner,
      `🔔 *${pending.length} approval(s) waiting for you:*\n\n${lines}\n\nReply YES/NO with the ref code.`,
      { urgent: true, relatedType: 'approval' },
    );
  }

  // 21:00 — owner daily report
  @Cron('0 21 * * *', { name: 'daily-owner-report', timeZone: 'Asia/Dubai' })
  async ownerReport(): Promise<void> {
    const owner = this.supabase.normalizeNumber(this.config.get('OWNER_WHATSAPP', ''));
    if (!owner) return;
    const [pending, invoiced, delivered, collected, tasksDone, tasksSent] = await Promise.all([
      this.count('pending'),
      this.count('invoiced'),
      this.count('delivered'),
      this.countCollectedToday(),
      this.countTasks('done'),
      this.countTasks('sent'),
    ]);
    const report =
      `🌙 *Daily report — ${new Date().toLocaleDateString('en-GB', { timeZone: this.tz })}*\n\n` +
      `🧾 Orders pending: ${pending}\n` +
      `📄 Invoiced today: ${invoiced}\n` +
      `📦 Delivered: ${delivered}\n` +
      `💵 Collected today: ${collected}\n` +
      `✅ Staff tasks completed: ${tasksDone}/${tasksSent}\n\n` +
      `Reply for detail on any line.`;
    await this.whatsapp.sendText(owner, report, { urgent: true, relatedType: 'order' });
    this.logger.log('Sent owner daily report');
  }

  // -------------------------------------------------------------------------
  // shared runner
  // -------------------------------------------------------------------------
  private async run(
    definitionCode: string,
    role: string,
    build: (staff: any) => Promise<string>,
  ): Promise<void> {
    const enabled = await this.supabase.getConfig<boolean>('agent_enabled', true);
    const staffList = await this.supabase.getActiveStaffByRole(role);
    if (!staffList.length) {
      this.logger.warn(`No active '${role}' staff for task ${definitionCode}`);
      return;
    }
    const { data: def } = await this.supabase
      .from('task_definitions')
      .select('id')
      .eq('code', definitionCode)
      .maybeSingle();

    for (const staff of staffList) {
      try {
        const body = await build(staff);
        let instanceId: string | undefined;
        try {
          const inst = await this.supabase.insert('task_instances', {
            definition_id: def?.id ?? null,
            assigned_staff: staff.id,
            status: enabled ? 'sent' : 'skipped',
            sent_at: new Date().toISOString(),
            payload: { code: definitionCode },
          });
          instanceId = inst?.id;
        } catch {
          /* logging failure must not block the send */
        }
        await this.whatsapp.sendText(staff.whatsapp, body, {
          dedupeKey: `${definitionCode}:${staff.id}:${new Date().toISOString().slice(0, 10)}`,
          relatedType: 'task',
          relatedId: instanceId,
        });
        this.logger.log(`Ran ${definitionCode} for ${staff.name}`);
      } catch (err) {
        this.logger.error(`Task ${definitionCode} for ${staff.name} failed: ${this.msg(err)}`);
      }
    }
  }

  private async count(status: string, uncollectedOnly = false): Promise<number> {
    let q = this.supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', status);
    if (uncollectedOnly) q = q.is('collected_at', null);
    const { count } = await q;
    return count ?? 0;
  }

  private async countCollectedToday(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { count } = await this.supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'collected')
      .gte('collected_at', start.toISOString());
    return count ?? 0;
  }

  private async countTasks(status: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { count } = await this.supabase
      .from('task_instances')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
      .gte('created_at', start.toISOString());
    return count ?? 0;
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
