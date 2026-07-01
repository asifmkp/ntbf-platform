import { Injectable } from '@nestjs/common';
import { AnthropicService } from '../ai/anthropic.service';

interface Tool {
  name: string;
  description: string;
  roles: string[]; // 'all' or specific role
  input_schema: Record<string, unknown>;
}

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties: props,
  required,
});

// Tool SCHEMAS only. Execution happens client-side against the live app store
// (and, in production, against the same Prisma/Zoho-backed endpoints).
const TOOLS: Tool[] = [
  { name: 'get_overview', roles: ['all'], description: 'Business KPIs: revenue, orders, A/R, stock, approvals.', input_schema: obj({}) },
  { name: 'list_customers', roles: ['all'], description: 'List customers with status, credit and outstanding balance.', input_schema: obj({}) },
  { name: 'list_low_stock', roles: ['all'], description: 'Products at or below reorder level.', input_schema: obj({}) },
  { name: 'list_orders', roles: ['all'], description: 'List orders with status and total.', input_schema: obj({ status: { type: 'string', description: 'optional status filter' } }) },
  { name: 'list_pending_approvals', roles: ['all'], description: 'Items awaiting approval.', input_schema: obj({}) },
  { name: 'get_replenishment', roles: ['all'], description: 'AI demand forecast: per product days-of-cover, stock-out risk (critical/warn/ok) and recommended reorder quantity.', input_schema: obj({}) },
  { name: 'auto_replenish', roles: ['purchase', 'admin', 'warehouse'], description: 'Auto-draft purchase requisitions for every product that needs reordering.', input_schema: obj({}) },

  { name: 'create_customer', roles: ['salesman', 'admin'], description: 'Create a customer (pending approval).', input_schema: obj({ name: { type: 'string' }, category: { type: 'string', enum: ['SUPERMARKET_GROCERY', 'RESTAURANT', 'VAN_SALE', 'WAREHOUSE_SALE', 'RETAIL', 'WHOLESALE'] }, credit: { type: 'number' }, creditDays: { type: 'number' } }, ['name', 'category']) },
  { name: 'place_order', roles: ['salesman', 'admin'], description: 'Place an order for a customer. items use product names.', input_schema: obj({ customerName: { type: 'string' }, items: { type: 'array', items: obj({ product: { type: 'string' }, qty: { type: 'number' } }, ['product', 'qty']) }, method: { type: 'string', enum: ['CASH_ON_DELIVERY', 'CHEQUE_ON_DELIVERY'] } }, ['customerName', 'items']) },
  { name: 'log_visit', roles: ['salesman'], description: 'Log a GPS customer visit.', input_schema: obj({ customerName: { type: 'string' }, note: { type: 'string' } }, ['customerName']) },
  { name: 'request_special_price', roles: ['salesman'], description: 'Request a special price for a customer+product.', input_schema: obj({ customerName: { type: 'string' }, product: { type: 'string' }, price: { type: 'number' } }, ['customerName', 'product', 'price']) },

  { name: 'plan_route', roles: ['driver'], description: 'Return the optimized nearest-first delivery route.', input_schema: obj({}) },
  { name: 'mark_delivered', roles: ['driver'], description: 'Mark an order delivered and record collection.', input_schema: obj({ orderId: { type: 'string' }, method: { type: 'string', enum: ['CASH_ON_DELIVERY', 'CHEQUE_ON_DELIVERY'] }, amount: { type: 'number' } }, ['orderId']) },

  { name: 'adjust_stock', roles: ['warehouse', 'admin'], description: 'Adjust product stock by a delta (+/-).', input_schema: obj({ product: { type: 'string' }, delta: { type: 'number' } }, ['product', 'delta']) },
  { name: 'receive_stock', roles: ['warehouse'], description: 'Receive goods into stock (GRN).', input_schema: obj({ product: { type: 'string' }, qty: { type: 'number' } }, ['product', 'qty']) },
  { name: 'advance_dispatch', roles: ['warehouse', 'admin'], description: 'Advance an order through the dispatch pipeline.', input_schema: obj({ orderId: { type: 'string' } }, ['orderId']) },

  { name: 'raise_requisition', roles: ['purchase'], description: 'Raise a purchase requisition for a product.', input_schema: obj({ product: { type: 'string' }, qty: { type: 'number' } }, ['product', 'qty']) },
  { name: 'create_po', roles: ['purchase'], description: 'Create a purchase order.', input_schema: obj({ supplier: { type: 'string' }, product: { type: 'string' }, qty: { type: 'number' }, price: { type: 'number' } }, ['supplier', 'product', 'qty', 'price']) },

  { name: 'clear_cheque', roles: ['finance', 'admin'], description: 'Mark a cheque cleared or bounced (bounce auto-charges 250 and holds the account).', input_schema: obj({ customerName: { type: 'string' }, cleared: { type: 'boolean' } }, ['customerName', 'cleared']) },
  { name: 'approve_item', roles: ['admin', 'finance'], description: 'Approve a pending approval by its label or id.', input_schema: obj({ match: { type: 'string', description: 'label text or id to approve' } }, ['match']) },
  { name: 'hold_customer', roles: ['admin'], description: 'Put a customer account on hold.', input_schema: obj({ customerName: { type: 'string' } }, ['customerName']) },
  { name: 'release_customer', roles: ['admin'], description: 'Release a customer hold.', input_schema: obj({ customerName: { type: 'string' } }, ['customerName']) },
  { name: 'cancel_order', roles: ['admin'], description: 'Cancel an order and restock items.', input_schema: obj({ orderId: { type: 'string' } }, ['orderId']) },

  { name: 'get_collections', roles: ['finance', 'admin'], description: 'Outstanding receivables per customer (undelivered orders + bounced cheques), with on-hold flag.', input_schema: obj({}) },
  { name: 'draft_reminder', roles: ['finance', 'admin'], description: 'Draft a polite payment-reminder message for a customer with an outstanding balance.', input_schema: obj({ customerName: { type: 'string' } }, ['customerName']) },
  { name: 'recover_account', roles: ['finance', 'admin'], description: 'Mark a customer\'s bounced cheques recovered and release the account hold.', input_schema: obj({ customerName: { type: 'string' } }, ['customerName']) },

  { name: 'place_my_order', roles: ['customer'], description: 'Place an order for the signed-in customer. items use product names.', input_schema: obj({ items: { type: 'array', items: obj({ product: { type: 'string' }, qty: { type: 'number' } }, ['product', 'qty']) }, method: { type: 'string', enum: ['CASH_ON_DELIVERY', 'CHEQUE_ON_DELIVERY'] } }, ['items']) },
  { name: 'list_my_orders', roles: ['customer'], description: "List the signed-in customer's orders and their status.", input_schema: obj({}) },
];

@Injectable()
export class AgentService {
  constructor(private readonly ai: AnthropicService) {}

  status() {
    return { configured: this.ai.configured };
  }

  toolsForRole(role: string) {
    return TOOLS.filter((t) => t.roles.includes('all') || t.roles.includes(role)).map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  }

  private system(role: string): string {
    return [
      'You are the NTBFLLC Copilot — the AI assistant inside a foodstuffs & beverage distribution platform in Ajman, UAE.',
      'Currency is AED; VAT is 5%. Keep replies short and mobile-friendly (a few lines max, no markdown tables).',
      `The current user is a ${role.toUpperCase()}.`,
      'Use the provided tools to READ data before answering questions about the business, and to PERFORM actions the user asks for.',
      'Resolve customers and products by name. After an action succeeds, confirm in one short sentence with the key number.',
      'For destructive actions (cancel, hold, bounce) act when clearly asked, and state what you did. If a request is ambiguous, ask one brief clarifying question instead of guessing.',
      'Never invent data — if a tool returns nothing, say so.',
    ].join(' ');
  }

  async chat(role: string, messages: any[]) {
    const resp = await this.ai.createMessage({
      system: this.system(role || 'admin'),
      tools: this.toolsForRole(role || 'admin'),
      tool_choice: { type: 'auto' },
      messages,
    });
    return resp;
  }
}
