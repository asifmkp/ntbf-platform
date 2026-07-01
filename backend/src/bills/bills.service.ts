import { Injectable } from '@nestjs/common';
import { AnthropicService, ExtractedBill } from '../ai/anthropic.service';
import { ZohoService } from '../zoho/zoho.service';

export interface LineMatch {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  matchedItemId: string | null;
  matchedName: string | null;
  confidence: number;
}

export interface MatchResult {
  supplier: { name: string; matchedId: string | null; matchedName: string | null; confidence: number };
  lines: LineMatch[];
}

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Token-overlap similarity 0..1 (Jaccard with a containment boost). */
function similarity(a: string, b: string): number {
  const A = new Set(norm(a).split(' ').filter(Boolean));
  const B = new Set(norm(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => { if (B.has(t)) inter += 1; });
  const jaccard = inter / (A.size + B.size - inter);
  const contain = norm(a).includes(norm(b)) || norm(b).includes(norm(a)) ? 0.3 : 0;
  return Math.min(1, jaccard + contain);
}

@Injectable()
export class BillsService {
  constructor(
    private readonly ai: AnthropicService,
    private readonly zoho: ZohoService,
  ) {}

  status() {
    return { anthropicConfigured: this.ai.configured, zohoConfigured: this.zoho.configured };
  }

  extract(imageBase64: string, mediaType: string): Promise<ExtractedBill> {
    return this.ai.extractBill(imageBase64, mediaType);
  }

  /** Match the extracted bill against Zoho vendors and items. */
  async match(bill: ExtractedBill): Promise<MatchResult> {
    const [vendors, items] = await Promise.all([
      this.zoho.listContacts('vendor'),
      this.zoho.listItems(),
    ]);

    const supplier = this.best(bill.supplierName, vendors, (v) => v.contact_name, (v) => v.contact_id);

    const lines: LineMatch[] = bill.lineItems.map((l) => {
      const m = this.best(l.description, items, (i) => i.name, (i) => i.item_id);
      return {
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: l.amount,
        matchedItemId: m.confidence >= 0.34 ? m.matchedId : null,
        matchedName: m.confidence >= 0.34 ? m.matchedName : null,
        confidence: m.confidence,
      };
    });

    return {
      supplier: {
        name: bill.supplierName,
        matchedId: supplier.confidence >= 0.34 ? supplier.matchedId : null,
        matchedName: supplier.confidence >= 0.34 ? supplier.matchedName : null,
        confidence: supplier.confidence,
      },
      lines,
    };
  }

  private best<T>(query: string, list: T[], nameOf: (t: T) => string, idOf: (t: T) => string) {
    let bestScore = 0;
    let bestId: string | null = null;
    let bestName: string | null = null;
    for (const item of list) {
      const score = similarity(query, nameOf(item));
      if (score > bestScore) {
        bestScore = score;
        bestId = idOf(item);
        bestName = nameOf(item);
      }
    }
    return { matchedId: bestId, matchedName: bestName, confidence: Math.round(bestScore * 100) / 100 };
  }

  /** Record the bill in Zoho Books. Creates the vendor if missing and createVendor=true. */
  async record(bill: ExtractedBill, match: MatchResult, createVendor = true): Promise<any> {
    let vendorId = match.supplier.matchedId;
    if (!vendorId && createVendor && bill.supplierName) {
      vendorId = await this.zoho.createVendor(bill.supplierName);
    }

    const lineItems = bill.lineItems.map((l, idx) => {
      const m = match.lines[idx];
      const base: Record<string, unknown> = {
        name: l.description,
        rate: l.unitPrice,
        quantity: l.quantity,
      };
      if (m?.matchedItemId) base.item_id = m.matchedItemId;
      return base;
    });

    const payload: Record<string, unknown> = {
      vendor_id: vendorId,
      bill_number: bill.invoiceNumber || undefined,
      date: bill.invoiceDate || undefined,
      line_items: lineItems,
    };
    return this.zoho.createBill(payload);
  }
}
