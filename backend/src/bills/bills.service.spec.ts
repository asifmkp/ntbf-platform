import { BillsService } from './bills.service';

describe('BillsService.match', () => {
  const ai: any = {};
  const zoho: any = {
    listContacts: async () => [
      { contact_id: 'v1', contact_name: 'Gulf Beverages Trading' },
      { contact_id: 'v2', contact_name: 'Emirates Cola Distributors' },
    ],
    listItems: async () => [
      { item_id: 'i1', name: 'Coca Cola 2 Litre' },
      { item_id: 'i2', name: '7Up 1.5 Litre' },
      { item_id: 'i3', name: 'Barbican Apple 330ml' },
    ],
  };
  const svc = new BillsService(ai, zoho);

  it('matches the supplier by fuzzy name', async () => {
    const bill: any = { supplierName: 'Gulf Beverages', lineItems: [] };
    const m = await svc.match(bill);
    expect(m.supplier.matchedId).toBe('v1');
    expect(m.supplier.confidence).toBeGreaterThanOrEqual(0.34);
  });

  it('matches line items to the right catalog product', async () => {
    const bill: any = { supplierName: 'x', lineItems: [{ description: 'Coca Cola 2L', quantity: 10, unitPrice: 28, amount: 280 }] };
    const m = await svc.match(bill);
    expect(m.lines[0].matchedItemId).toBe('i1');
  });

  it('leaves an unknown line unmatched (below threshold)', async () => {
    const bill: any = { supplierName: 'x', lineItems: [{ description: 'Unknown Sparkling Water 500ml', quantity: 1, unitPrice: 5, amount: 5 }] };
    const m = await svc.match(bill);
    expect(m.lines[0].matchedItemId).toBeNull();
  });
});
