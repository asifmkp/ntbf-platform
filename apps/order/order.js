// National Trading — customer ordering app. Talks only to the secure /api/portal/* API.
(function () {
  const API = localStorage.getItem('ntbf_api') || ((location.protocol.startsWith('http') && location.port !== '8080') ? location.origin : 'http://localhost:3000');
  const products = (window.NTBF_CATALOG || []).filter((p) => p.price > 0);
  let view = 'shop';
  let authMode = 'login';
  let cart = {};
  let orders = [];
  const $ = (s) => document.querySelector(s);
  const app = () => document.getElementById('app');
  const token = () => localStorage.getItem('ntbf_ctoken');
  const customer = () => { try { return JSON.parse(localStorage.getItem('ntbf_cust') || 'null'); } catch (e) { return null; } };
  const aed = (n) => 'AED ' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

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
    app().innerHTML = `
      <div class="top"><span class="u" data-act="logout">${esc(c ? c.name : '')} ·  Sign out</span><h1>National Trading</h1><p>Beverage &amp; foodstuff distribution · Ajman</p></div>
      <div class="body" id="view"></div>
      ${view === 'shop' ? cartBar() : ''}
      <div class="nav">
        <button class="${view === 'shop' ? 'on' : ''}" data-act="view" data-v="shop"><span class="i">🛒</span>Shop</button>
        <button class="${view === 'orders' ? 'on' : ''}" data-act="view" data-v="orders"><span class="i">▣</span>My orders</button>
      </div>`;
    if (view === 'shop') renderShop(); else renderOrders();
  }

  function renderAuth() {
    const isLogin = authMode === 'login';
    app().innerHTML = `
      <div class="top"><h1>National Trading</h1><p>Order beverages &amp; foodstuff online · Ajman, UAE</p></div>
      <div class="body">
        <div class="card">
          <h3 style="margin-bottom:14px;font-size:16px">${isLogin ? 'Sign in' : 'Create account'}</h3>
          ${isLogin ? '' : '<label class="fld"><span>Business name</span><input id="a_name" placeholder="Corner Shop LLC" /></label>'}
          <label class="fld"><span>Phone</span><input id="a_phone" placeholder="+9715..." /></label>
          <label class="fld"><span>Password</span><input id="a_pass" type="password" placeholder="At least 4 characters" /></label>
          ${isLogin ? '' : '<label class="fld"><span>Business type</span><select id="a_cat"><option>RETAIL</option><option>WHOLESALE</option><option>SUPERMARKET_GROCERY</option><option>RESTAURANT</option></select></label>'}
          <button class="btn" data-act="${isLogin ? 'login' : 'register'}">${isLogin ? 'Sign in' : 'Create account'}</button>
          <div class="link" data-act="toggleAuth">${isLogin ? "New customer? Create an account" : 'Already have an account? Sign in'}</div>
        </div>
      </div>`;
  }

  function cartBar() {
    const n = Object.values(cart).reduce((s, v) => s + v.qty, 0);
    const t = Object.values(cart).reduce((s, v) => s + v.qty * v.price, 0);
    if (!n) return '';
    return `<div class="cartbar"><div class="t"><b>${aed(t)}</b><span>${n} item${n === 1 ? '' : 's'} in cart</span></div><button class="btn sm" data-act="placeOrder">Place order</button></div>`;
  }

  function renderShop(filter) {
    const q = (filter || '').toLowerCase();
    const list = products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 60);
    $('#view').innerHTML = `
      <div class="search"><input id="q" placeholder="Search ${products.length} products…" value="${esc(filter || '')}" /></div>
      <div class="card">${list.map((p) => {
      const qv = cart[p.name] ? cart[p.name].qty : 0;
      return `<div class="prod"><div class="m"><b>${esc(p.name)}</b><span>${aed(p.price)} · ${esc(p.unit || '')}</span></div>
        <div class="qtc"><button data-act="dec" data-n="${esc(p.name)}">−</button><b>${qv}</b><button data-act="inc" data-n="${esc(p.name)}" data-p="${p.price}" data-u="${esc(p.unit || '')}">+</button></div></div>`;
    }).join('')}</div>`;
    const qi = $('#q'); if (qi) qi.addEventListener('input', (e) => { renderShop(e.target.value); $('#q').focus(); });
  }

  async function renderOrders() {
    $('#view').innerHTML = `<div class="sect">My orders</div><div class="card"><div class="empty">Loading…</div></div>`;
    try { orders = await api('/api/portal/orders', 'GET', null, true); } catch (e) { orders = []; }
    const track = { PLACED: 'Order received', CONFIRMED: 'Confirmed', PACKED: 'Preparing', OUT_FOR_DELIVERY: 'Out for delivery 🚚', DELIVERED: 'Delivered ✓' };
    $('#view').innerHTML = `<div class="sect">My orders (${orders.length})</div>
      <div class="card">${orders.length ? orders.map((o) => `<div class="ord"><div style="display:flex;justify-content:space-between"><b>${o.id}</b><span class="tag">${track[o.status] || o.status}</span></div><div class="s">${o.items.length} item(s) · ${aed(o.total)} · ${new Date(o.createdAt).toLocaleDateString()}</div></div>`).join('') : '<div class="empty">No orders yet — start shopping.</div>'}</div>`;
  }

  const ACT = {
    toggleAuth: () => { authMode = authMode === 'login' ? 'register' : 'login'; renderAuth(); },
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
    inc: (d) => { const n = d.n; cart[n] = cart[n] || { qty: 0, price: +d.p, unit: d.u }; cart[n].qty++; renderShop($('#q') ? $('#q').value : ''); updateBar(); },
    dec: (d) => { const n = d.n; if (cart[n]) { cart[n].qty--; if (cart[n].qty <= 0) delete cart[n]; } renderShop($('#q') ? $('#q').value : ''); updateBar(); },
    placeOrder: async () => {
      const items = Object.entries(cart).map(([name, v]) => ({ name, qty: v.qty, price: v.price }));
      if (!items.length) return toast('Your cart is empty');
      try { const o = await api('/api/portal/orders', 'POST', { items, method: 'CASH_ON_DELIVERY' }, true); cart = {}; view = 'orders'; render(); toast('Order ' + o.id + ' placed!'); }
      catch (e) { toast(e.message); }
    },
  };
  function saveSession(r) { localStorage.setItem('ntbf_ctoken', r.token); localStorage.setItem('ntbf_cust', JSON.stringify(r.customer)); cart = {}; view = 'shop'; render(); toast('Welcome, ' + r.customer.name); }
  function updateBar() { const nav = document.querySelector('.cartbar'); const holder = document.querySelector('.nav'); /* re-render bar */ const existing = document.querySelector('.cartbar'); const html = cartBar(); if (existing) existing.outerHTML = html || ''; else if (html && holder) holder.insertAdjacentHTML('beforebegin', html); }

  document.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (!t) return; const fn = ACT[t.dataset.act]; if (fn) fn(t.dataset); });
  render();
})();
