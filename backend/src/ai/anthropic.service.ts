import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExtractedLine {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ExtractedBill {
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  lineItems: ExtractedLine[];
}

const BILL_TOOL = {
  name: 'record_bill',
  description: 'Record the structured contents of a supplier bill / purchase invoice.',
  input_schema: {
    type: 'object',
    properties: {
      supplierName: { type: 'string', description: 'Vendor / supplier business name' },
      invoiceNumber: { type: 'string', description: 'Invoice or bill number' },
      invoiceDate: { type: 'string', description: 'Invoice date in YYYY-MM-DD (best guess)' },
      currency: { type: 'string', description: 'Currency code, e.g. AED' },
      subtotal: { type: 'number', description: 'Net amount before tax' },
      taxAmount: { type: 'number', description: 'VAT / tax amount' },
      total: { type: 'number', description: 'Grand total payable' },
      lineItems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unitPrice: { type: 'number' },
            amount: { type: 'number' },
          },
          required: ['description', 'quantity', 'unitPrice', 'amount'],
        },
      },
    },
    required: ['supplierName', 'invoiceNumber', 'total', 'lineItems'],
  },
};

/**
 * Claude vision extraction. Needs ANTHROPIC_API_KEY.
 * ANTHROPIC_MODEL defaults to claude-sonnet-4-6 (fast, capable for document extraction).
 */
@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.config.get('ANTHROPIC_API_KEY'));
  }

  /** Generic Claude Messages API passthrough (used by the copilot agent). */
  async createMessage(body: Record<string, unknown>): Promise<any> {
    if (!this.configured) throw new ServiceUnavailableException('ANTHROPIC_API_KEY not set');
    const model = this.config.get<string>('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.config.get<string>('ANTHROPIC_API_KEY')!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, max_tokens: 1024, ...body }),
        signal: controller.signal,
      });
    } catch (e) {
      this.logger.error(`Anthropic request failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Claude request timed out or failed');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const t = await res.text();
      this.logger.error(`Anthropic API error ${res.status}: ${t}`);
      throw new ServiceUnavailableException(`Claude request failed: ${res.status}`);
    }
    return res.json();
  }

  async extractBill(imageBase64: string, mediaType: string): Promise<ExtractedBill> {
    if (!this.configured) {
      throw new ServiceUnavailableException('ANTHROPIC_API_KEY not set');
    }
    const model = this.config.get<string>('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.get<string>('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        tools: [BILL_TOOL],
        tool_choice: { type: 'tool', name: 'record_bill' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: imageBase64 },
              },
              {
                type: 'text',
                text:
                  'This is a supplier bill / purchase invoice for a UAE beverage distributor. ' +
                  'Extract every line item and the totals accurately. Amounts are in the bill currency ' +
                  '(usually AED). If a value is unclear, give your best estimate. Call record_bill.',
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Anthropic API error ${res.status}: ${body}`);
      throw new ServiceUnavailableException(`Claude extraction failed: ${res.status}`);
    }

    const data: any = await res.json();
    const toolUse = (data.content || []).find((b: any) => b.type === 'tool_use');
    if (!toolUse) throw new ServiceUnavailableException('No structured extraction returned');

    const b = toolUse.input as ExtractedBill;
    return {
      supplierName: b.supplierName || '',
      invoiceNumber: b.invoiceNumber || '',
      invoiceDate: b.invoiceDate || '',
      currency: b.currency || 'AED',
      subtotal: Number(b.subtotal) || 0,
      taxAmount: Number(b.taxAmount) || 0,
      total: Number(b.total) || 0,
      lineItems: (b.lineItems || []).map((l) => ({
        description: l.description || '',
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        amount: Number(l.amount) || 0,
      })),
    };
  }
}
