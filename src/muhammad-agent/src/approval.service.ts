import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase/supabase.service';
import { WhatsappService } from './whatsapp.service';

export interface ApprovalRequest {
  type: 'order' | 'purchase_order' | 'reorder';
  refTable: string;
  refId: string;
  question: string;
  /** Hours before the request auto-expires (default 24). */
  expiresInHours?: number;
}

export interface ApprovalReplyResult {
  handled: boolean;
  decision?: 'approved' | 'rejected';
  approvalId?: string;
  refTable?: string;
  refId?: string;
  type?: string;
}

/**
 * ApprovalService
 * ---------------
 * The human control point. Anything that touches money or makes an external
 * commitment routes here: the agent asks the OWNER on WhatsApp and waits for a
 * YES/NO. Nothing proceeds until the owner replies.
 *
 * Owner number comes from OWNER_WHATSAPP (+91 82814 36921 -> 918281436921).
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly whatsapp: WhatsappService,
  ) {}

  private get ownerNumber(): string {
    return this.supabase.normalizeNumber(this.config.get<string>('OWNER_WHATSAPP', ''));
  }

  /**
   * Create a pending approval and WhatsApp the owner. Idempotent per (refTable,
   * refId): if a pending approval already exists it is reused, not duplicated.
   */
  async requestApproval(req: ApprovalRequest): Promise<{ approvalId: string | null }> {
    // Reuse an existing pending approval for the same ref.
    const { data: existing } = await this.supabase
      .from('approvals')
      .select('id')
      .eq('ref_table', req.refTable)
      .eq('ref_id', req.refId)
      .eq('status', 'pending')
      .maybeSingle();
    if (existing) {
      this.logger.log(`Approval already pending for ${req.refTable}:${req.refId}`);
      return { approvalId: existing.id };
    }

    const expiresAt = new Date(
      Date.now() + (req.expiresInHours ?? 24) * 3600_000,
    ).toISOString();

    let approval: any;
    try {
      approval = await this.supabase.insert('approvals', {
        type: req.type,
        ref_table: req.refTable,
        ref_id: req.refId,
        requested_to: this.ownerNumber,
        question: req.question,
        status: 'pending',
        expires_at: expiresAt,
      });
    } catch (err) {
      this.logger.error(`Could not create approval row: ${this.msg(err)}`);
      return { approvalId: null };
    }

    const body =
      `🔔 *Approval needed*\n\n${req.question}\n\n` +
      `Reply *YES* to approve or *NO* to reject.\n_Ref: ${approval.id.slice(0, 8)}_`;

    await this.whatsapp.sendText(this.ownerNumber, body, {
      urgent: true, // approvals bypass quiet hours
      dedupeKey: `approval:${approval.id}`,
      relatedType: 'approval',
      relatedId: approval.id,
    });

    this.logger.log(`Requested ${req.type} approval ${approval.id} for ${req.refTable}:${req.refId}`);
    return { approvalId: approval.id };
  }

  /**
   * Handle an inbound owner reply. Matches YES/NO to the most recent pending
   * approval (optionally by the short ref code in the message) and records the
   * decision. Returns what was decided so callers can advance the ref record.
   */
  async handleOwnerReply(fromNumber: string, text: string): Promise<ApprovalReplyResult> {
    if (this.supabase.normalizeNumber(fromNumber) !== this.ownerNumber) {
      return { handled: false };
    }
    const decision = this.parseDecision(text);
    if (!decision) return { handled: false };

    // Prefer an approval whose short id appears in the message; else newest pending.
    const shortRef = this.extractShortRef(text);
    let query = this.supabase
      .from('approvals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    const { data: rows, error } = await query;
    if (error) {
      this.logger.error(`handleOwnerReply query failed: ${this.msg(error)}`);
      return { handled: false };
    }
    let approval = rows?.[0];

    if (shortRef) {
      const { data: matched } = await this.supabase
        .from('approvals')
        .select('*')
        .eq('status', 'pending')
        .ilike('id', `${shortRef}%`)
        .maybeSingle();
      if (matched) approval = matched;
    }

    if (!approval) {
      this.logger.log('Owner replied YES/NO but no pending approval found');
      await this.whatsapp.sendText(
        this.ownerNumber,
        'Thanks — but I have no pending approval waiting right now.',
        { urgent: true },
      );
      return { handled: false };
    }

    const newStatus = decision === 'approved' ? 'approved' : 'rejected';
    await this.supabase.update(
      'approvals',
      { id: approval.id },
      {
        status: newStatus,
        decided_at: new Date().toISOString(),
        decided_via: decision === 'approved' ? 'whatsapp_yes' : 'whatsapp_no',
      },
    );

    this.logger.log(`Approval ${approval.id} -> ${newStatus} by owner`);
    await this.whatsapp.sendText(
      this.ownerNumber,
      decision === 'approved' ? '✅ Approved. Proceeding.' : '❌ Rejected. I will hold it.',
      { urgent: true },
    );

    return {
      handled: true,
      decision,
      approvalId: approval.id,
      refTable: approval.ref_table,
      refId: approval.ref_id,
      type: approval.type,
    };
  }

  /** Count still-pending approvals (used by the 8:30pm owner reminder). */
  async listPending(): Promise<any[]> {
    const { data } = await this.supabase
      .from('approvals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    return data ?? [];
  }

  /** Expire approvals past their expires_at (called from the loop). */
  async expireStale(): Promise<number> {
    const nowIso = new Date().toISOString();
    const { data } = await this.supabase
      .from('approvals')
      .select('id')
      .eq('status', 'pending')
      .lt('expires_at', nowIso);
    for (const row of data ?? []) {
      await this.supabase.update('approvals', { id: row.id }, { status: 'expired' });
    }
    return data?.length ?? 0;
  }

  // -------------------------------------------------------------------------

  private parseDecision(text: string): 'approved' | 'rejected' | null {
    const t = (text ?? '').trim().toLowerCase();
    if (/^(y|yes|approve|approved|ok|okay|👍|✅)\b/.test(t)) return 'approved';
    if (/^(n|no|reject|rejected|deny|denied|👎|❌)\b/.test(t)) return 'rejected';
    return null;
  }

  private extractShortRef(text: string): string | null {
    const m = (text ?? '').match(/\b([0-9a-f]{8})\b/i);
    return m ? m[1].toLowerCase() : null;
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
