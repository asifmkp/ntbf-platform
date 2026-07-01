// Offline fallback — live Zoho snapshot of NTBFLLC (30 Jun 2026).
// Matches the shape returned by GET /api/dashboard/summary.
window.NTBF_SNAPSHOT = {
  org: { name: 'NTBFLLC', currency: 'AED', vat: 5, state: 'Ajman, UAE' },
  counts: { products: 10, customers: 0, vendors: 0, salesOrders: 0, purchaseOrders: 0, invoices: 0 },
  totals: { revenueMtd: 0, outstanding: 0, stockUnits: 0, inventoryValue: 0 },
  items: [
    { name: '7Up Carbonated Drink 1.5 Litre', sku: 'C000949', unit: 'Ctn of 6', rate: 25.71, cost: 24.76, stockOnHand: 0 },
    { name: '7Up Carbonated Drink 1.5 Litre-Zero', sku: '—', unit: 'Ctn of 6', rate: 17.62, cost: 16.19, stockOnHand: 0 },
    { name: '7Up Carbonated Drink 2.28 Litre', sku: '—', unit: 'Ctn of 6', rate: 39, cost: 41, stockOnHand: 0 },
    { name: 'Barbican Apple Malt Beverage 330ml', sku: 'C000960', unit: 'Ctn of 24', rate: 72.38, cost: 70.48, stockOnHand: 0 },
    { name: 'Capri Sun Mango 200ml', sku: 'C001052', unit: 'Ctn of 40', rate: 0, cost: 29.05, stockOnHand: 0 },
    { name: 'Coca Cola Pet Bottle 2 Litre', sku: 'C001122', unit: 'Ctn of 6', rate: 32.38, cost: 28.57, stockOnHand: 0 },
    { name: 'Fanta Orange Pet 300ml', sku: '—', unit: 'Ctn of 30', rate: 0.56, cost: 40.01, stockOnHand: 0 },
    { name: 'Lipton Zero Sugar Peach Iced Tea 290ml', sku: '—', unit: '—', rate: 53.33, cost: 0, stockOnHand: 0 },
    { name: 'Mirinda Orange 1.5 Litre', sku: '—', unit: '—', rate: 24.76, cost: 0, stockOnHand: 0 },
    { name: 'Mirinda Orange Cans 245ml', sku: '—', unit: '—', rate: 33.81, cost: 36.4, stockOnHand: 0 },
  ],
  source: 'snapshot',
};
