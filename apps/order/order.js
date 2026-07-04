// National Trading — customer ordering app. Talks only to the secure /api/portal/* API.
(function () {
  const API = localStorage.getItem('ntbf_api') || ((location.protocol.startsWith('http') && location.port !== '8080') ? location.origin : 'http://localhost:3000');
  const products = (window.NTBF_CATALOG || []).filter((p) => p.price > 0);
  const byId = {}; products.forEach((p) => { byId[p.id] = p; });

  // Category presentation (emoji + accent colour).
  const CATS = {
    'Carbonated Drinks': { e: '🥤', c: '#1478c6' },
    'Juice': { e: '🧃', c: '#e0872e' },
    'Energy Drinks': { e: '⚡', c: '#8b3fd6' },
    'Chips': { e: '🍟', c: '#c9a227' },
    'confectionery': { e: '🍬', c: '#d6478f' },
    'Food': { e: '🍽️', c: '#1a9e75' },
  };
  const catInfo = (cat) => CATS[cat] || { e: '📦', c: '#8592a0' };
  const catLabel = (cat) => (cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Other');
  const CAT_LIST = ['All'].concat(products.reduce((a, p) => (p.category && a.indexOf(p.category) < 0 ? a.concat(p.category) : a), []));

  let view = 'shop';
  let authMode = 'login';
  let activeCat = 'All';
  let searchQ = '';
  let cart = {};
  let orders = [];
  const $ = (s) => document.querySelector(s);
  const app = () => document.getElementById('app');
  const token = () => localStorage.getItem('ntbf_ctoken');
  const customer = () => { try { return JSON.parse(localStorage.getItem('ntbf_cust') || 'null'); } catch (e) { return null; } };
  const aed = (n) => 'AED ' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const cartCount = () => Object.values(cart).reduce((s, v) => s + v.qty, 0);
  const cartTotal = () => Object.values(cart).reduce((s, v) => s + v.qty * v.price, 0);

  async function api(path, method, body, auth) {
    const headers = { 'content-type': 'application/json' };
    if (auth && token()) headers['authorization'] = 'Bearer ' + token();
    const r = await fetch(API + path, { method: method || 'GET', headers, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data && data.message) || ('Error ' + r.status));
    return data;
  }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }

  function render() {
    if (!token()) { renderAuth(); return; }
    const c = customer();
    const first = c ? String(c.name).split(' ')[0] : '';
    app().innerHTML = `
      <div class="top">
        <div class="row">
          <img class="logo" src="/icons/icon-192.png" alt="" />
          <div class="ttl"><h1>Hi, ${esc(first) || 'there'} 👋</h1><p>National Trading · Ajman</p></div>
          <span class="u" data-act="logout">Sign out</span>
        </div>
      </div>
      <div id="view"></div>
      ${view === 'shop' ? cartBar() : ''}
      <div class="nav">
        <button class="${view === 'shop' ? 'on' : ''}" data-act="view" data-v="shop"><span class="i">🛒</span>Shop</button>
        <button class="${view === 'orders' ? 'on' : ''}" data-act="view" data-v="orders"><span class="i">🧾</span>My orders</button>
      </div>`;
    if (view === 'shop') renderShop(); else renderOrders();
    updateNavBadge();
  }

  function renderAuth() {
    const isLogin = authMode === 'login';
    app().innerHTML = `
      <div class="auth">
        <div class="brand">
          <img src="/icons/icon-192.png" alt="National Trading" />
          <h1>National Trading</h1>
          <p>Wholesale beverages &amp; foodstuff · Ajman, UAE</p>
        </div>
        <div class="card">
          <h3>${isLogin ? 'Welcome back' : 'Create your account'}</h3>
          ${isLogin ? '' : '<label class="fld"><span>Business name</span><input id="a_name" placeholder="e.g. Corner Shop LLC" /></label>'}
          <label class="fld"><span>Phone number</span><input id="a_phone" type="tel" placeholder="+9715..." /></label>
          <label class="fld"><span>Password</span><input id="a_pass" type="password" placeholder="At least 4 characters" /></label>
          ${isLogin ? '' : '<label class="fld"><span>Business type</span><select id="a_cat"><option value="RETAIL">Retail shop</option><option value="SUPERMARKET_GROCERY">Supermarket / Grocery</option><option value="RESTAURANT">Restaurant / Cafe</option><option value="WHOLESALE">Wholesale</option></select></label>'}
          <button class="btn" data-act="${isLogin ? 'login' : 'register'}">${isLogin ? 'Sign in' : 'Create account'}</button>
          <div class="link" data-act="toggleAuth">${isLogin ? "New customer? Create an account" : 'Already have an account? Sign in'}</div>
        </div>
      </div>`;
  }

  function cartBar() {
    const n = cartCount(); if (!n) return '';
    return `<div class="cartbar"><div class="inner">
      <div class="ci">🛒<span class="badge">${n}</span></div>
      <div class="t"><b>${aed(cartTotal())}</b><span>${n} item${n === 1 ? '' : 's'} · Cash on delivery</span></div>
      <button class="go" data-act="placeOrder">Place order</button>
    </div></div>`;
  }

  function qtcHtml(p) {
    const qv = cart[p.name] ? cart[p.name].qty : 0;
    if (qv <= 0) return `<button class="add" data-act="inc" data-n="${esc(p.name)}" data-p="${p.price}" data-u="${esc(p.unit || '')}" data-i="${p.id}">+</button>`;
    return `<button data-act="dec" data-n="${esc(p.name)}" data-i="${p.id}">−</button><b>${qv}</b><button data-act="inc" data-n="${esc(p.name)}" data-p="${p.price}" data-u="${esc(p.unit || '')}" data-i="${p.id}">+</button>`;
  }

  function prodHtml(p) {
    const info = catInfo(p.category);
    return `<div class="prod">
      <div class="tile" style="background:${info.c}1a;color:${info.c}">${info.e}</div>
      <div class="m">
        <b>${esc(p.name)}</b>
        <div class="meta">${esc(p.unit || '')}</div>
        <div class="price">${aed(p.price)}</div>
      </div>
      <div class="qtc" data-qtc="${p.id}">${qtcHtml(p)}</div>
    </div>`;
  }

  function renderShop() {
    const q = searchQ.toLowerCase();
    const list = products.filter((p) =>
      (activeCat === 'All' || p.category === activeCat) && p.name.toLowerCase().includes(q)
    ).slice(0, 80);
    const chips = CAT_LIST.map((c) => {
      const info = c === 'All' ? { e: '🛍️' } : catInfo(c);
      return `<div class="chip ${c === activeCat ? 'on' : ''}" data-act="cat" data-c="${esc(c)}"><span class="e">${info.e}</span>${c === 'All' ? 'All' : esc(catLabel(c))}</div>`;
    }).join('');
    $('#view').innerHTML = `
      <div class="cats">${chips}</div>
      <div class="search"><span class="ic">🔍</span><input id="q" placeholder="Search ${products.length} products…" value="${esc(searchQ)}" /></div>
      <div class="plist">${list.length ? list.map(prodHtml).join('') :
        '<div class="empty"><div class="big">🔎</div><p>No products match. Try another search or category.</p></div>'}</div>`;
    const qi = $('#q');
    if (qi) qi.addEventListener('input', (e) => { searchQ = e.target.value; const pos = e.target.selectionStart; renderShop(); const n = $('#q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } });
  }

  async function renderOrders() {
    $('#view').innerHTML = `<div class="body"><div class="sect">My orders</div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`;
    try { orders = await api('/api/portal/orders', 'GET', null, true); } catch (e) { orders = []; }
    const track = { PLACED: 'Order received', CONFIRMED: 'Confirmed', PACKED: 'Preparing', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered' };
    const cls = (s) => (s === 'DELIVERED' ? 'done' : (s === 'OUT_FOR_DELIVERY' ? 'way' : ''));
    const icon = (s) => (s === 'DELIVERED' ? '✓ ' : (s === 'OUT_FOR_DELIVERY' ? '🚚 ' : ''));
    $('#view').innerHTML = `<div class="body">
      <div class="sect">My orders ${orders.length ? '(' + orders.length + ')' : ''}</div>
      ${orders.length ? orders.map((o) => `<div class="ord">
        <div class="h"><b>${esc(o.id)}</b><span class="tag ${cls(o.status)}">${icon(o.status)}${track[o.status] || esc(o.status)}</span></div>
        <div class="s">${o.items.length} item${o.items.length === 1 ? '' : 's'} · <b style="color:var(--ink)">${aed(o.total)}</b> · ${new Date(o.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
      </div>`).join('') : '<div class="empty"><div class="big">🧾</div><p>No orders yet.<br/>Head to Shop to place your first order.</p></div>'}
    </div>`;
  }

  function refreshProd(id) {
    const box = document.querySelector(`[data-qtc="${id}"]`);
    if (box && byId[id]) box.innerHTML = qtcHtml(byId[id]);
    updateCartUI();
  }
  function updateCartUI() {
    const holder = document.querySelector('.nav');
    const existing = document.querySelector('.cartbar');
    const html = cartBar();
    if (existing) existing.outerHTML = html || '';
    else if (html && holder) holder.insertAdjacentHTML('beforebegin', html);
    updateNavBadge();
  }
  function updateNavBadge() {
    const shopBtn = document.querySelector('.nav button[data-v="shop"]');
    if (!shopBtn) return;
    const c = cartCount();
    let b = shopBtn.querySelector('.ncount');
    if (c) { if (!b) { b = document.createElement('span'); b.className = 'ncount'; shopBtn.appendChild(b); } b.textContent = c; }
    else if (b) { b.remove(); }
  }

  const ACT = {
    toggleAuth: () => { authMode = authMode === 'login' ? 'register' : 'login'; renderAuth(); },
    cat: (d) => { activeCat = d.c; searchQ = ''; renderShop(); },
    login: async () => {
      try { const r = await api('/api/portal/login', 'POST', { phone: $('#a_phone').value.trim(), password: $('#a_pass').value }); saveSession(r); }
      catch (e) { toast(e.message); }
    },
    register: async () => {
      const name = ($('#a_name') || {}).value; if (!name || !name.trim()) return toast('Enter your business name');
      try { const r = await api('/api/portal/register', 'POST', { name: name.trim(), phone: $('#a_phone').value.trim(), password: $('#a_pass').value, category: ($('#a_cat') || {}).value }); saveSession(r); }
      catch (e) { toast(e.message); }
    },
    logout: () => { localStorage.removeItem('ntbf_ctoken'); localStorage.removeItem('ntbf_cust'); cart = {}; render(); },
    view: (d) => { view = d.v; render(); },
    inc: (d) => { const n = d.n; cart[n] = cart[n] || { qty: 0, price: +d.p, unit: d.u }; cart[n].qty++; refreshProd(d.i); },
    dec: (d) => { const n = d.n; if (cart[n]) { cart[n].qty--; if (cart[n].qty <= 0) delete cart[n]; } refreshProd(d.i); },
    placeOrder: async () => {
      const items = Object.entries(cart).map(([name, v]) => ({ name, qty: v.qty, price: v.price }));
      if (!items.length) return toast('Your cart is empty');
      try { const o = await api('/api/portal/orders', 'POST', { items, method: 'CASH_ON_DELIVERY' }, true); cart = {}; view = 'orders'; render(); toast('Order ' + o.id + ' placed! 🎉'); }
      catch (e) { toast(e.message); }
    },
  };
  function saveSession(r) { localStorage.setItem('ntbf_ctoken', r.token); localStorage.setItem('ntbf_cust', JSON.stringify(r.customer)); cart = {}; view = 'shop'; render(); toast('Welcome, ' + String(r.customer.name).split(' ')[0] + '!'); }

  document.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (!t) return; const fn = ACT[t.dataset.act]; if (fn) fn(t.dataset); });
  render();
})();
