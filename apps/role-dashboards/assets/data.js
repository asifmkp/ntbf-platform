// Shared live-data loader for all NTBFLLC dashboards.
// Tries the backend (/api/dashboard/summary). If unreachable, falls back to the
// embedded snapshot passed by the caller, so every page still opens from file://.
window.NTBF = {
  get API_BASE() {
    const ls = typeof localStorage !== 'undefined' && localStorage.getItem('ntbf_api');
    if (ls) return ls;
    if (typeof location !== 'undefined' && location.protocol.startsWith('http') && location.port !== '8080') return location.origin;
    return 'http://localhost:3000';
  },
  setApiBase(url) {
    localStorage.setItem('ntbf_api', url);
  },

  // Returns { ...summary, live: boolean }
  async loadSummary(fallback) {
    try {
      const tok = typeof localStorage !== 'undefined' && localStorage.getItem('ntbf_token');
      const headers = tok ? { 'x-api-key': tok } : {};
      const res = await fetch(this.API_BASE + '/api/dashboard/summary', { cache: 'no-store', headers });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      return Object.assign({}, data, { live: true });
    } catch (e) {
      return Object.assign({}, fallback, { live: false });
    }
  },

  // Renders a small Live / Sample chip into an element.
  renderSource(el, live) {
    if (!el) return;
    el.textContent = live ? 'Live · Zoho Books' : 'Sample data';
    el.style.color = live ? 'var(--green)' : 'var(--muted)';
  },

  aed(n) {
    return 'AED ' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  // Pricing classification — same rules as the backend, so live and fallback match.
  classify(item) {
    const rate = Number(item.rate) || 0;
    const cost = Number(item.cost ?? item.purchase_rate) || 0;
    if (!rate) return { status: 'missing', note: 'no sale price set' };
    if (!cost) return { status: 'missing', note: 'no purchase cost set — margin overstated' };
    if (rate - cost < 0) return { status: 'loss', note: 'selling below cost' };
    return { status: 'ok', note: '' };
  },

  deriveItems(summary) {
    return (summary.items || []).map((it) => {
      const rate = Number(it.rate) || 0;
      const cost = Number(it.cost ?? it.purchase_rate) || 0;
      return Object.assign({}, it, { rate, cost, margin: rate && cost ? Math.round((rate - cost) * 100) / 100 : null }, this.classify(it));
    });
  },
};
