// ---------------------------------------------------------------------------
// National Trading Copilot — role-aware assistant on every screen.
// The backend runs Claude + tool schemas; this client executes the returned
// tool calls against the live store, then loops back with the results.
// ---------------------------------------------------------------------------
(function () {
  const S = window.Store;
  const API = localStorage.getItem('ntbf_api') || ((location.protocol.startsWith('http') && location.port !== '8080') ? location.origin : 'http://localhost:3000');
  const money = window.aed;
  let messages = [];
  let busy = false;

  // ---- inject styles + DOM ----
  const css = `
  .cop-fab{position:fixed;bottom:88px;left:50%;transform:translateX(calc(-50% + 162px));z-index:40;
    width:52px;height:52px;border-radius:50%;background:#1f6feb;color:#fff;border:none;font-size:23px;
    display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(31,111,235,.45)}
  .cop-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60;display:none}
  .cop-scrim.show{display:block}
  .cop-panel{position:fixed;left:0;right:0;bottom:0;max-width:440px;margin:0 auto;background:var(--panel,#fff);
    border-radius:18px 18px 0 0;z-index:61;display:none;flex-direction:column;height:82vh;transform:translateY(100%);transition:transform .25s}
  .cop-panel.show{display:flex;transform:translateY(0)}
  .cop-head{display:flex;align-items:center;gap:9px;padding:14px 16px;border-bottom:1px solid var(--line,#e6e9ec)}
  .cop-head .av{width:30px;height:30px;border-radius:8px;background:#1f6feb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px}
  .cop-head b{font-size:15px}.cop-head small{color:var(--muted,#8a949c);font-size:11.5px;display:block}
  .cop-head .x{margin-left:auto;background:none;border:none;font-size:22px;color:var(--muted,#8a949c)}
  .cop-msgs{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:9px}
  .cop-msg{max-width:84%;padding:9px 12px;border-radius:13px;font-size:13.5px;line-height:1.45;white-space:pre-wrap}
  .cop-msg.user{align-self:flex-end;background:#1f6feb;color:#fff;border-bottom-right-radius:4px}
  .cop-msg.bot{align-self:flex-start;background:var(--bg,#eef0f3);color:var(--ink,#11181c);border-bottom-left-radius:4px}
  .cop-chip{align-self:flex-start;font-size:11px;color:var(--muted,#8a949c);background:var(--bg,#eef0f3);border:1px solid var(--line,#e6e9ec);padding:3px 9px;border-radius:20px}
  .cop-alerts{display:flex;flex-direction:column;gap:6px;padding:2px 14px 8px}
  .cop-alert{display:flex;align-items:center;gap:8px;font-size:12.5px;background:var(--bg,#eef0f3);border:1px solid var(--line,#e6e9ec);border-radius:10px;padding:9px 11px;cursor:pointer}
  .cop-alert:active{transform:scale(.99)}
  .cop-alert .gt{margin-left:auto;color:var(--muted,#8a949c)}
  .cop-sug{display:flex;gap:7px;flex-wrap:wrap;padding:0 14px 8px}
  .cop-sug button{font-size:11.5px;border:1px solid var(--line,#e6e9ec);background:var(--panel,#fff);color:var(--ink,#11181c);border-radius:20px;padding:6px 11px}
  .cop-in{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line,#e6e9ec)}
  .cop-in input{flex:1;padding:11px 13px;border:1px solid var(--line,#e6e9ec);border-radius:22px;background:var(--bg,#eef0f3);color:var(--ink,#11181c);font-size:14px}
  .cop-in button{width:42px;height:42px;border-radius:50%;border:none;background:#1f6feb;color:#fff;font-size:18px}
  .cop-dots{align-self:flex-start;color:var(--muted,#8a949c);font-size:13px;padding:4px 6px}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const fab = document.createElement('button'); fab.className = 'cop-fab'; fab.innerHTML = '✦'; fab.title = 'Ask Copilot';
  const scrim = document.createElement('div'); scrim.className = 'cop-scrim';
  const panel = document.createElement('div'); panel.className = 'cop-panel';
  document.body.append(fab, scrim, panel);

  const ROLE_HINTS = {
    salesman: ['Sales today?', 'Create customer Sunrise Mart, retail, 4000 credit', 'Top selling products'],
    driver: ['Plan my route', 'How much cash have I collected?', 'What stops are left?'],
    warehouse: ['What is below reorder?', 'Receive 100 of Coca Cola 2 Litre', 'Show dispatch queue'],
    purchase: ['What needs reordering?', 'Raise requisition 200 7Up 1.5 Litre', 'Open purchase orders'],
    finance: ['Show collections', 'Draft reminder for Al Madina', 'Any bounced cheques?'],
    admin: ['Business overview', 'Approve all pending', 'Which customers are on hold?'],
    customer: ['Order 10 Coca Cola 2 Litre', 'Track my orders', 'What do you have in stock?'],
  };

  function role() { return (window.currentRole && window.currentRole()) || localStorage.getItem('ntbf_role') || 'admin'; }

  // Proactive, role-specific insights computed from live data.
  function proactive(r) {
    const out = [];
    const risk = S.forecast().filter((x) => x.status === 'critical' || x.status === 'warn');
    const appr = S.pendingApprovals().length;
    const hold = S.state.customers.filter((c) => c.onHold).length;
    const pendCheques = S.state.payments.filter((p) => p.method === 'CHEQUE_ON_DELIVERY' && p.status === 'PENDING').length;
    const stops = S.driverStops().length;
    if (['warehouse', 'purchase', 'admin'].includes(r) && risk.length) out.push({ label: `⚠ ${risk.length} product(s) at stock-out risk`, cmd: 'what should I reorder?' });
    if (r === 'driver' && stops) out.push({ label: `🚚 ${stops} stop(s) on your route`, cmd: 'plan my route' });
    if (['finance', 'admin'].includes(r) && pendCheques) out.push({ label: `🧾 ${pendCheques} cheque(s) awaiting clearance`, cmd: 'pending approvals' });
    if (['finance', 'admin', 'salesman'].includes(r) && appr) out.push({ label: `✓ ${appr} approval(s) pending`, cmd: 'pending approvals' });
    if (['admin', 'finance'].includes(r) && hold) out.push({ label: `⏸ ${hold} account(s) on hold`, cmd: 'on hold' });
    if (r === 'salesman') { const sales = S.state.orders.filter((o) => o.createdBy === 'sales').reduce((s, o) => s + o.total, 0); out.push({ label: `📈 Sales so far: ${money(sales)}`, cmd: 'overview' }); }
    if (['finance', 'admin'].includes(r)) { const col = S.collections(); const owed = col.reduce((s, x) => s + x.outstanding, 0); if (owed > 0) out.push({ label: `📨 ${money(owed)} outstanding to collect`, cmd: 'show collections' }); }
    if (r === 'customer') { const c = window.curCustomer && window.curCustomer(); const cid = c && c.id; const live = S.state.orders.filter((o) => o.customerId === cid && o.status === 'OUT_FOR_DELIVERY').length; if (live) out.push({ label: `🚚 ${live} order(s) out for delivery`, cmd: 'track my orders' }); out.push({ label: '🛒 Reorder your usual', cmd: 'order 10 Coca Cola 2 Litre and 5 7Up 1.5 Litre' }); }
    if (!out.length) out.push({ label: '✓ All clear — nothing needs attention', cmd: 'overview' });
    return out.slice(0, 3);
  }

  function open() {
    const r = role();
    const ins = proactive(r);
    panel.innerHTML = `
      <div class="cop-head"><div class="av">✦</div><div><b>National Trading Copilot</b><small id="cop-stat">helping the ${r}</small></div><button class="x" id="cop-x">✕</button></div>
      <div class="cop-msgs" id="cop-msgs"></div>
      <div class="cop-alerts" id="cop-alerts">${ins.map((a, i) => `<div class="cop-alert" data-i="${i}">${a.label}<span class="gt">›</span></div>`).join('')}</div>
      <div class="cop-sug" id="cop-sug">${(ROLE_HINTS[r] || ROLE_HINTS.admin).map((s) => `<button>${s}</button>`).join('')}</div>
      <div class="cop-in"><input id="cop-input" placeholder="Ask or tell me to do something…" /><button id="cop-send">➤</button></div>`;
    scrim.classList.add('show'); panel.classList.add('show');
    if (!messages.length) addBot(`Hi — I'm your ${r} copilot. Tap an insight above or tell me what to do.`);
    panel.querySelector('#cop-x').onclick = close;
    panel.querySelector('#cop-send').onclick = onSend;
    panel.querySelector('#cop-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') onSend(); });
    panel.querySelectorAll('#cop-sug button').forEach((b) => b.onclick = () => { panel.querySelector('#cop-input').value = b.textContent; onSend(); });
    panel.querySelectorAll('#cop-alerts .cop-alert').forEach((el) => el.onclick = () => { panel.querySelector('#cop-input').value = ins[+el.dataset.i].cmd; onSend(); });
    redrawMsgs();
    checkLive(r);
  }
  async function checkLive(r) {
    const el = panel.querySelector('#cop-stat'); if (!el) return;
    try {
      const s = await (await fetch(API + '/api/agent/status', { cache: 'no-store' })).json();
      el.textContent = (s.configured ? '● live AI · ' : '○ local mode · ') + 'helping the ' + r;
      el.style.color = s.configured ? '#1a9e75' : '';
    } catch (e) { el.textContent = '○ backend offline · helping the ' + r; }
  }
  function close() { scrim.classList.remove('show'); panel.classList.remove('show'); }
  fab.onclick = open; scrim.onclick = close;

  // ---- message rendering + persistence ----
  const CKEY = 'ntbf_chat';
  const view = [];
  function persist() { try { localStorage.setItem(CKEY, JSON.stringify({ messages, view })); } catch (e) { /* quota */ } }
  function loadChat() { try { const d = JSON.parse(localStorage.getItem(CKEY)); if (d) { messages = d.messages || []; if (Array.isArray(d.view)) view.push(...d.view); } } catch (e) { /* ignore */ } }
  function addUser(t) { view.push({ k: 'user', t }); persist(); redrawMsgs(); }
  function addBot(t) { view.push({ k: 'bot', t }); persist(); redrawMsgs(); }
  function addChip(t) { view.push({ k: 'chip', t }); persist(); redrawMsgs(); }
  loadChat();
  window.copilotClear = () => { messages.length = 0; view.length = 0; localStorage.removeItem(CKEY); if (panel.classList.contains('show')) redrawMsgs(); };
  function redrawMsgs() {
    const box = panel.querySelector('#cop-msgs'); if (!box) return;
    box.innerHTML = view.map((m) => m.k === 'chip' ? `<div class="cop-chip">⚙ ${m.t}</div>` : `<div class="cop-msg ${m.k === 'user' ? 'user' : 'bot'}">${escapeHtml(m.t)}</div>`).join('') + (busy ? '<div class="cop-dots" id="cop-dots">…thinking</div>' : '');
    box.scrollTop = box.scrollHeight;
  }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  async function onSend() {
    const input = panel.querySelector('#cop-input'); const text = input.value.trim();
    if (!text || busy) return;
    input.value = ''; addUser(text);
    messages.push({ role: 'user', content: text });
    busy = true; redrawMsgs();
    try { await runTurns(0); }
    catch (e) { addBot('⚠ ' + (e.message || 'Something went wrong')); }
    busy = false; redrawMsgs();
  }

  async function runTurns(depth) {
    if (depth > 6) { addBot('(stopped — too many steps)'); return; }
    let resp;
    try {
      const tok = localStorage.getItem('ntbf_token');
      const headers = Object.assign({ 'content-type': 'application/json' }, tok ? { 'x-api-key': tok } : {});
      const r = await fetch(API + '/api/agent/chat', { method: 'POST', headers, body: JSON.stringify({ role: role(), messages }) });
      if (!r.ok) throw new Error('http ' + r.status);
      resp = await r.json();
    } catch (e) {
      return offline(messages[messages.length - 1]);
    }
    const blocks = resp.content || [];
    const texts = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    const tools = blocks.filter((b) => b.type === 'tool_use');
    if (texts) addBot(texts);
    if (!tools.length) return;
    messages.push({ role: 'assistant', content: blocks });
    const results = tools.map((tu) => {
      let out; try { out = execTool(tu.name, tu.input || {}); } catch (e) { out = { error: e.message }; }
      addChip(labelFor(tu.name, tu.input, out));
      return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 1800) };
    });
    messages.push({ role: 'user', content: results });
    persist();
    if (window.renderApp) window.renderApp();
    redrawMsgs();
    await runTurns(depth + 1);
  }

  function labelFor(name, input, out) {
    if (out && out.error) return name + ' — ' + out.error;
    const m = { create_customer: 'Created customer', place_order: 'Placed order', adjust_stock: 'Adjusted stock', receive_stock: 'Received stock', mark_delivered: 'Marked delivered', clear_cheque: 'Updated cheque', approve_item: 'Approved', hold_customer: 'Held account', release_customer: 'Released hold', cancel_order: 'Cancelled order', raise_requisition: 'Raised requisition', create_po: 'Created PO', log_visit: 'Logged visit', request_special_price: 'Requested price', advance_dispatch: 'Advanced order', plan_route: 'Planned route' };
    return (m[name] || name);
  }

  // ---- offline fallback (no backend / no key) ----
  // Local agent: parse the instruction, execute the matching tool on live data.
  function offline(lastUserMsg) {
    const raw = (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '');
    const q = raw.toLowerCase().trim();
    const did = (name, input, msg) => { const r = execTool(name, input); addChip(labelFor(name, input, r)); if (window.renderApp) window.renderApp(); addBot(r && r.error ? '⚠ ' + r.error : msg(r)); };
    let m;

    // ---- customer self-service ----
    if (role() === 'customer') {
      if (/track|my order|where.*order|status/.test(q)) { const os = execTool('list_my_orders', {}); addBot(os.length ? 'Your orders:\n' + os.map((o) => `• ${o.id} — ${o.status.toLowerCase().replace(/_/g, ' ')} (${money(o.total)})`).join('\n') : "You haven't placed any orders yet."); return; }
      if ((m = raw.match(/order\s+(.+)/i)) && /\d/.test(m[1])) {
        const items = m[1].split(/,|\band\b/).map((s) => { const mm = s.trim().match(/(\d+)\s*(?:x|cartons?|ctn)?\s+(.+)/i); return mm ? { product: mm[2].trim(), qty: +mm[1] } : null; }).filter(Boolean);
        if (items.length) return did('place_my_order', { items, method: /cheque/i.test(raw) ? 'CHEQUE_ON_DELIVERY' : 'CASH_ON_DELIVERY' }, (r) => `Order ${r.id} placed — ${money(r.total)}. Track it in My orders.`);
      }
      if (/stock|product|catalog|have|sell/.test(q)) { addBot('In stock:\n' + S.state.products.filter((p) => p.stock > 0 && p.price > 0).map((p) => `• ${p.name} — ${money(p.price)}`).join('\n')); return; }
    }

    // ---- collections ----
    if (/collection|receivable|overdue|who owes|outstanding/.test(q)) { const c = execTool('get_collections', {}); addBot(c.length ? 'Outstanding receivables:\n' + c.map((x) => `• ${x.name}: ${money(x.outstanding)}${x.onHold ? ' (on hold)' : ''}`).join('\n') : 'No outstanding receivables.'); return; }
    if ((m = raw.match(/(?:draft|send|write)\s+(?:a\s+)?reminder\s+(?:to|for)\s+(.+)/i))) { const r = execTool('draft_reminder', { customerName: m[1].trim() }); addBot(r.error ? '⚠ ' + r.error : r.message); return; }
    if ((m = raw.match(/recover\s+(?:account\s+(?:for\s+)?)?(.+)/i)) && /recover/.test(q)) { return did('recover_account', { customerName: m[1].trim() }, (r) => `Recovered — hold released on ${r.released}.`); }

    // ---- actions ----
    if (/auto.?(draft|replenish|reorder)|draft (all )?requisition/.test(q)) { return did('auto_replenish', {}, (r) => r.drafted ? `Drafted ${r.drafted} requisition(s) for the at-risk products. See the Reqs tab.` : 'Nothing needs reordering right now.'); }
    if (/reorder|replenish|forecast|run.?out|stock.?out|what.*(to )?order/.test(q)) { const f = execTool('get_replenishment', {}).filter((x) => x.reorderQty > 0); addBot(f.length ? 'Reorder suggestions:\n' + f.map((x) => `• ${x.product}: ${x.daysCover}d cover → order ${x.reorderQty} (${x.risk})`).join('\n') + '\n\nSay "auto-draft requisitions" to create them.' : 'Stock is healthy — nothing to reorder.'); return; }
    if (/plan.*route|my route|optimi.*route|^route\b|deliver.*order/.test(q)) { const r = execTool('plan_route', {}); addBot(r.length ? 'Optimized route (nearest first):\n' + r.map((s) => `${s.stop}. ${s.customer} — ${s.km} km`).join('\n') : 'No stops assigned right now.'); return; }

    if ((m = raw.match(/(?:create|add|new)\s+customer\s+(.+)/i))) {
      const after = m[1]; const name = after.split(',')[0].trim();
      const credit = (after.match(/(\d[\d,]*)\s*(?:aed)?\s*(?:credit)?/i) || [])[1];
      const lc = after.toLowerCase(); let cat = 'RETAIL';
      if (/supermarket|grocery/.test(lc)) cat = 'SUPERMARKET_GROCERY'; else if (/restaurant/.test(lc)) cat = 'RESTAURANT'; else if (/van/.test(lc)) cat = 'VAN_SALE'; else if (/warehouse/.test(lc)) cat = 'WAREHOUSE_SALE'; else if (/wholesale/.test(lc)) cat = 'WHOLESALE';
      return did('create_customer', { name, category: cat, credit: credit ? +credit.replace(/,/g, '') : 0 }, () => `Created ${name} (${cat}) — pending Sales Admin approval.`);
    }
    if ((m = raw.match(/order\s+for\s+(.+?)\s*[:\-]\s*(.+)/i))) {
      const method = /cheque/i.test(raw) ? 'CHEQUE_ON_DELIVERY' : 'CASH_ON_DELIVERY';
      const items = m[2].split(/,|\band\b/).map((s) => { const mm = s.trim().match(/(\d+)\s*(?:x|cartons?|ctn)?\s+(.+)/i); return mm ? { product: mm[2].trim(), qty: +mm[1] } : null; }).filter(Boolean);
      return did('place_order', { customerName: m[1].trim(), items, method }, (r) => `Order ${r.id} placed for ${m[1].trim()} — ${money(r.total)}.`);
    }
    if ((m = raw.match(/receive\s+(\d+)\s+(?:of\s+)?(.+)/i))) return did('receive_stock', { product: m[2].trim(), qty: +m[1] }, (r) => `Received ${m[1]} — stock now ${r.stock}.`);
    if ((m = raw.match(/(?:raise\s+)?requisition\s+(?:for\s+)?(\d+)\s+(?:of\s+)?(.+)/i))) return did('raise_requisition', { product: m[2].trim(), qty: +m[1] }, () => 'Requisition raised.');
    if ((m = raw.match(/adjust\s+(.+?)\s+([+-]?\d+)/i))) return did('adjust_stock', { product: m[1].trim(), delta: +m[2] }, (r) => `Adjusted — stock now ${r.stock}.`);
    if (/release|unhold/i.test(q) && (m = raw.match(/(?:release|unhold)\s+(?:hold\s+(?:on|for)\s+)?(.+)/i))) return did('release_customer', { customerName: m[1].trim() }, () => `Released hold on ${m[1].trim()}.`);
    if (/hold/i.test(q) && (m = raw.match(/(?:put|place)?\s*(.+?)\s+on\s+hold/i) || raw.match(/hold\s+(.+)/i))) return did('hold_customer', { customerName: m[1].trim() }, () => `Put ${m[1].trim()} on hold.`);
    if ((m = raw.match(/(bounce|clear)\s+(?:the\s+)?cheque\s+(?:from|for|of)\s+(.+)/i))) return did('clear_cheque', { customerName: m[2].trim(), cleared: /clear/i.test(m[1]) }, (r) => `Cheque ${r.result}.`);
    if (/approve\s+all/i.test(q)) { const a = S.pendingApprovals().slice(); a.forEach((x) => S.approve(x.id)); if (window.renderApp) window.renderApp(); addBot(`Approved ${a.length} item(s).`); return; }
    if ((m = raw.match(/approve\s+(.+)/i))) return did('approve_item', { match: m[1].trim() }, (r) => `Approved: ${r.approved}`);
    if ((m = raw.match(/cancel\s+(?:order\s+)?(so-?\d+)/i))) return did('cancel_order', { orderId: m[1].toUpperCase().replace(/^SO-?/, 'SO-') }, () => `Cancelled ${m[1].toUpperCase()} — stock restored.`);
    if ((m = raw.match(/(?:dispatch|advance)\s+(so-?\d+)/i))) return did('advance_dispatch', { orderId: m[1].toUpperCase().replace(/^SO-?/, 'SO-') }, (r) => `Advanced to ${r.status}.`);

    // ---- reads ----
    if (/overview|kpi|summary|business|how.*doing|sales today|revenue/.test(q)) { addBot(summary()); return; }
    if (/low|below reorder/.test(q)) { const l = S.lowStock(); addBot(l.length ? 'Below reorder: ' + l.map((p) => p.name + ' (' + p.stock + ')').join(', ') : 'Nothing below reorder.'); return; }
    if (/approval|pending/.test(q)) { const a = S.pendingApprovals(); addBot(a.length ? a.length + ' pending:\n' + a.map((x) => '• ' + x.label).join('\n') + '\n\nSay "approve all" to clear.' : 'No pending approvals.'); return; }
    if (/on hold|bounced/.test(q)) { const h = S.state.customers.filter((c) => c.onHold); addBot(h.length ? 'On hold: ' + h.map((c) => c.name).join(', ') : 'No accounts on hold.'); return; }
    if (/cash|collect/.test(q)) { addBot('Collected ' + money(S.state.payments.reduce((s, p) => s + p.amount, 0)) + ' so far today.'); return; }
    if (/customer/.test(q)) { addBot(S.state.customers.map((c) => '• ' + c.name + ' — ' + c.status + (c.onHold ? ' (on hold)' : '')).join('\n')); return; }
    if (/order/.test(q)) { addBot(S.state.orders.slice(0, 8).map((o) => { const c = S.customer(o.customerId); return '• ' + o.id + ' ' + (c ? c.name : '') + ' — ' + o.status + ' ' + money(o.total); }).join('\n') || 'No orders.'); return; }
    if (/stock|inventory/.test(q)) { addBot(S.state.products.map((p) => '• ' + p.name + ': ' + p.stock).join('\n')); return; }

    addBot('I can take actions and answer questions. Try:\n• "create customer Sunrise Mart, retail, 4000 credit"\n• "order for Al Madina: 10 Coca Cola 2 Litre, 5 7Up 1.5"\n• "what should I reorder?" then "auto-draft requisitions"\n• "plan my route" · "receive 100 Coca Cola"\n• "bounce cheque from Corniche Bakery" · "approve all"\n• "overview" · "low stock" · "orders" · "customers"\n\nAdd an Anthropic API key in backend/.env for free-form conversation.');
  }
  function summary() {
    const rev = S.state.orders.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0);
    const coll = S.state.payments.reduce((s, p) => s + p.amount, 0);
    return `Revenue ${money(rev)} · collected ${money(coll)} · ${S.state.orders.length} orders · ${S.state.customers.length} customers · ${S.lowStock().length} items low · ${S.pendingApprovals().length} approvals pending.`;
  }

  // ---- name resolution ----
  function findCustomer(name) {
    const n = (name || '').toLowerCase();
    return S.state.customers.find((c) => c.name.toLowerCase() === n) || S.state.customers.find((c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()));
  }
  function findProduct(name) {
    const n = (name || '').toLowerCase();
    let best = null, score = 0;
    S.state.products.forEach((p) => {
      const A = new Set(p.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/));
      const B = new Set(n.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean));
      let i = 0; B.forEach((t) => { if (A.has(t)) i++; });
      const s = B.size ? i / B.size : 0;
      if (s > score) { score = s; best = p; }
    });
    return score >= 0.4 ? best : null;
  }
  function km(a, b) { const R = 6371, r = (x) => x * Math.PI / 180; const dla = r(b.lat - a.lat), dln = r(b.lng - a.lng); const s = Math.sin(dla / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dln / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }

  // ---- tool execution against the live store ----
  function execTool(name, a) {
    switch (name) {
      case 'get_overview': return JSON.parse(JSON.stringify({ revenue: S.state.orders.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0), collected: S.state.payments.reduce((s, p) => s + p.amount, 0), orders: S.state.orders.length, customers: S.state.customers.length, lowStock: S.lowStock().length, pendingApprovals: S.pendingApprovals().length }));
      case 'list_customers': return S.state.customers.map((c) => ({ name: c.name, category: c.category, status: c.status, onHold: c.onHold, credit: c.credit }));
      case 'list_low_stock': return S.lowStock().map((p) => ({ name: p.name, stock: p.stock, reorder: 40 }));
      case 'list_orders': return S.state.orders.filter((o) => !a.status || o.status === a.status).map((o) => { const c = S.customer(o.customerId); return { id: o.id, customer: c && c.name, status: o.status, total: o.total }; });
      case 'list_pending_approvals': return S.pendingApprovals().map((x) => ({ id: x.id, label: x.label, type: x.type }));
      case 'get_replenishment': return S.forecast().map((x) => ({ product: x.name, stock: x.stock, perDay: x.velocity, daysCover: x.cover, risk: x.status, reorderQty: x.recommend }));
      case 'auto_replenish': { const n = S.autoReplenish(); return { ok: true, drafted: n }; }

      case 'create_customer': { const id = S.createCustomer({ name: a.name, category: a.category || 'RETAIL', credit: a.credit || 0, creditDays: a.creditDays || 0, lat: 25.4052, lng: 55.5136 }); return { ok: true, id, status: 'PENDING approval' }; }
      case 'place_order': {
        const c = findCustomer(a.customerName); if (!c) return { error: 'customer not found' };
        const lines = (a.items || []).map((it) => { const p = findProduct(it.product); return p ? { pid: p.id, qty: it.qty } : null; }).filter(Boolean);
        if (!lines.length) return { error: 'no products matched' };
        try { const id = S.placeOrder({ customerId: c.id, lines, method: a.method || 'CASH_ON_DELIVERY' }); const o = S.order(id); return { ok: true, id, total: o.total }; } catch (e) { return { error: e.message }; }
      }
      case 'log_visit': { const c = findCustomer(a.customerName); if (!c) return { error: 'customer not found' }; S.checkInVisit(c.id, a.note || ''); return { ok: true }; }
      case 'request_special_price': { const c = findCustomer(a.customerName); const p = findProduct(a.product); if (!c || !p) return { error: 'customer or product not found' }; S.specialPrice({ customerId: c.id, pid: p.id, price: a.price }); return { ok: true }; }

      case 'plan_route': { const dl = S.state.driverLoc || { lat: 25.4052, lng: 55.5136 }; const stops = S.driverStops().map((o) => { const c = S.customer(o.customerId) || {}; return { id: o.id, name: c.name, lat: c.lat || dl.lat, lng: c.lng || dl.lng, total: o.total }; }); const seq = []; let cur = dl, rem = stops.slice(); while (rem.length) { let bi = 0, bd = 1e9; rem.forEach((s, i) => { const d = km(cur, s); if (d < bd) { bd = d; bi = i; } }); const n = rem.splice(bi, 1)[0]; n.km = Math.round(bd * 10) / 10; seq.push(n); cur = n; } return seq.map((s, i) => ({ stop: i + 1, customer: s.name, id: s.id, km: s.km })); }
      case 'mark_delivered': { const o = S.order(a.orderId); if (!o) return { error: 'order not found' }; S.deliver(a.orderId, { method: a.method || o.method, amount: a.amount || o.total }); return { ok: true }; }

      case 'adjust_stock': { const p = findProduct(a.product); if (!p) return { error: 'product not found' }; S.adjustStock(p.id, a.delta); return { ok: true, stock: S.product(p.id).stock }; }
      case 'receive_stock': { const p = findProduct(a.product); if (!p) return { error: 'product not found' }; S.receiveGrn(p.id, a.qty); return { ok: true, stock: S.product(p.id).stock }; }
      case 'advance_dispatch': { if (!S.order(a.orderId)) return { error: 'order not found' }; S.advanceDispatch(a.orderId); return { ok: true, status: S.order(a.orderId).status }; }

      case 'raise_requisition': { const p = findProduct(a.product); if (!p) return { error: 'product not found' }; S.raiseRequisition(p.id, a.qty); return { ok: true }; }
      case 'create_po': { const p = findProduct(a.product); if (!p) return { error: 'product not found' }; S.createPo({ supplier: a.supplier, pid: p.id, qty: a.qty, price: a.price }); return { ok: true }; }

      case 'clear_cheque': { const c = findCustomer(a.customerName); if (!c) return { error: 'customer not found' }; const pay = S.state.payments.find((p) => p.customerId === c.id && p.method === 'CHEQUE_ON_DELIVERY' && p.status === 'PENDING'); if (!pay) return { error: 'no pending cheque for ' + c.name }; S.clearCheque(pay.id, !!a.cleared); return { ok: true, result: a.cleared ? 'cleared' : 'bounced (250 charge, on hold)' }; }
      case 'approve_item': { const m = (a.match || '').toLowerCase(); const item = S.state.approvals.find((x) => x.status === 'PENDING' && (x.id.toLowerCase() === m || x.label.toLowerCase().includes(m))); if (!item) return { error: 'no matching pending approval' }; S.approve(item.id); return { ok: true, approved: item.label }; }
      case 'hold_customer': { const c = findCustomer(a.customerName); if (!c) return { error: 'customer not found' }; S.setHold(c.id, true); return { ok: true }; }
      case 'release_customer': { const c = findCustomer(a.customerName); if (!c) return { error: 'customer not found' }; S.setHold(c.id, false); return { ok: true }; }
      case 'cancel_order': { if (!S.order(a.orderId)) return { error: 'order not found' }; S.cancelOrder(a.orderId); return { ok: true }; }

      case 'get_collections': return S.collections().map((x) => ({ name: x.name, outstanding: x.outstanding, onHold: x.onHold, items: x.items }));
      case 'draft_reminder': { const c = findCustomer(a.customerName); if (!c) return { error: 'customer not found' }; const col = S.collections().find((x) => x.id === c.id) || { outstanding: 0 }; return { ok: true, message: `Dear ${c.name}, this is a reminder from National Trading regarding your outstanding balance of AED ${col.outstanding.toFixed(2)}. Kindly arrange payment at your earliest convenience. Thank you — National Trading Accounts, Ajman.` }; }
      case 'recover_account': { const c = findCustomer(a.customerName); if (!c) return { error: 'customer not found' }; S.recoverCustomer(c.id); return { ok: true, released: c.name }; }

      case 'place_my_order': { const c = window.curCustomer && window.curCustomer(); if (!c) return { error: 'no customer selected' }; const lines = (a.items || []).map((it) => { const p = findProduct(it.product); return p ? { pid: p.id, qty: it.qty } : null; }).filter(Boolean); if (!lines.length) return { error: 'no products matched' }; try { const id = S.placeOrder({ customerId: c.id, lines, method: a.method || 'CASH_ON_DELIVERY' }); return { ok: true, id, total: S.order(id).total }; } catch (e) { return { error: e.message }; } }
      case 'list_my_orders': { const c = window.curCustomer && window.curCustomer(); if (!c) return []; return S.state.orders.filter((o) => o.customerId === c.id).map((o) => ({ id: o.id, status: o.status, total: o.total })); }
      default: return { error: 'unknown tool ' + name };
    }
  }
})();
