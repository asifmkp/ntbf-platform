import { Body, Controller, Get, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsBoolean } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { ApiGateGuard } from '../common/guards/api-gate.guard';
import { ZohoModule } from '../zoho/zoho.module';
import { ZohoService } from '../zoho/zoho.service';

class PostDocDto {
  @IsString() type: string;
  @IsObject() fields: Record<string, string>;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsBoolean() confirm?: boolean;
}

function num(v: any): number {
  return Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;
}

/**
 * Maps a captured document to the right Zoho Books record and posts it.
 * SAFETY: writes to Zoho ONLY when Zoho is configured AND confirm===true AND the
 * type is auto-postable. Otherwise it returns a preview of exactly what would be
 * posted (using NTBFLLC's real account IDs) — so extraction can be verified first.
 */
@Injectable()
export class DocumentsService {
  constructor(private readonly zoho: ZohoService) {}

  status() {
    const a = this.zoho.accounts;
    return {
      zohoConfigured: this.zoho.configured,
      accounts: a,
      expenseReady: Boolean(a.expense && a.cash),
    };
  }

  map(type: string, fields: Record<string, string>) {
    const a = this.zoho.accounts;
    switch (type) {
      case 'supplier_bill':
        return {
          target: 'Vendor Bill', module: 'bills', canAutoPost: true,
          payload: {
            vendor_name: fields.vendor,
            bill_number: fields.invoiceNo || undefined,
            date: fields.date || undefined,
            line_items: [{ account_id: a.inventory, name: 'Goods for resale', rate: num(fields.total), quantity: 1 }],
          },
        };
      case 'cash_voucher':
        return {
          target: 'Expense (paid through Cash)', module: 'expenses', canAutoPost: Boolean(a.expense && a.cash),
          payload: {
            account_id: a.expense || '<set ZOHO_EXPENSE_ACCOUNT>',
            paid_through_account_id: a.cash || '<set ZOHO_CASH_ACCOUNT>',
            amount: num(fields.amount),
            description: [fields.category, fields.paidTo].filter(Boolean).join(' — '),
          },
        };
      case 'purchase_order':
        return {
          target: 'Purchase Order', module: 'purchaseorders', canAutoPost: true,
          payload: {
            vendor_name: fields.vendor,
            reference_number: fields.ref || undefined,
            line_items: [{ account_id: a.inventory, name: 'Goods', rate: num(fields.total), quantity: 1 }],
          },
        };
      case 'purchase_voucher':
        return {
          target: 'Vendor Payment (needs a linked bill)', module: 'vendorpayments', canAutoPost: false,
          payload: { vendor_name: fields.vendor, amount: num(fields.amount), reference_number: fields.ref },
        };
      case 'delivery_note':
        return {
          target: 'Attachment to Sales Order / Invoice', module: 'attachment', canAutoPost: false,
          payload: { customer: fields.customer, reference: fields.ref, received_by: fields.received },
        };
      default:
        return { target: 'Unknown type', module: null, canAutoPost: false, payload: {} };
    }
  }

  preview(type: string, fields: Record<string, string>) {
    const m = this.map(type, fields);
    return { mode: 'preview', ...m };
  }

  async post(dto: PostDocDto) {
    const m = this.map(dto.type, dto.fields || {});
    if (!this.zoho.configured || !this.zoho.writesEnabled || !dto.confirm || !m.canAutoPost) {
      const note = !this.zoho.configured
        ? 'Zoho not connected — this is what WOULD be posted. Nothing was written.'
        : !this.zoho.writesEnabled
          ? 'Preview only — Zoho writing is locked (ZOHO_WRITES_ENABLED is off). Nothing was written.'
          : !dto.confirm
            ? 'Preview only. Send confirm:true to post to Zoho.'
            : 'This document type is prepared for manual posting / attachment.';
      return { mode: 'preview', target: m.target, module: m.module, payload: m.payload, note };
    }

    // Live write (Zoho connected + confirmed + auto-postable).
    let payload: Record<string, unknown> = { ...m.payload };
    if (m.module === 'bills') {
      if (dto.fields.vendor) {
        const vid = await this.zoho.createVendor(dto.fields.vendor).catch(() => null);
        if (vid) { delete payload.vendor_name; payload.vendor_id = vid; }
      }
      const res = await this.zoho.createBill(payload);
      const billId = res?.bill?.bill_id;
      if (dto.image && billId) await this.zoho.attachToRecord('bills', billId, dto.image, 'document.jpg');
      return { mode: 'posted', target: m.target, zoho: res?.bill ?? res };
    }
    if (m.module === 'expenses') {
      const res = await this.zoho.createExpense(payload);
      return { mode: 'posted', target: m.target, zoho: res?.expense ?? res };
    }
    if (m.module === 'purchaseorders') {
      const res = await this.zoho.createPurchaseOrder(payload);
      return { mode: 'posted', target: m.target, zoho: res?.purchaseorder ?? res };
    }
    return { mode: 'preview', target: m.target, payload: m.payload, note: 'No auto-post handler for this module.' };
  }
}

@ApiTags('Document capture → Zoho')
@UseGuards(ApiGateGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Public()
  @Get('status')
  status() { return this.svc.status(); }

  @Public()
  @Post('preview')
  preview(@Body() dto: PostDocDto) { return this.svc.preview(dto.type, dto.fields || {}); }

  @Public()
  @Post('post')
  post(@Body() dto: PostDocDto) { return this.svc.post(dto); }
}

@Module({
  imports: [ZohoModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
