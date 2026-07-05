// National Trading — customer ordering app (reorder-first). Talks only to /api/portal/*.
(function () {
  'use strict';
  var API = safeLS('ntbf_api') || ((location.protocol.startsWith('http') && location.port !== '8080') ? location.origin : 'http://localhost:3000');
  var products = (window.NTBF_CATALOG || []).filter(function (p) { return p.price > 0; });
  var byId = {}; products.forEach(function (p) { byId[p.id] = p; });
  var byName = {}; products.forEach(function (p) { byName[p.name] = p; });

  var CATS = {
    'Carbonated Drinks': { e: '🥤', c: '#1364b0' },
    'Juice': { e: '🧃', c: '#c07016' },
    'Energy Drinks': { e: '⚡', c: '#7b3fd6' },
    'Chips': { e: '🍟', c: '#b58a12' },
    'confectionery': { e: '🍬', c: '#c0407f' },
    'Food': { e: '🍽️', c: '#12855f' }
  };
  function catInfo(c) { return CATS[c] || { e: '📦', c: '#5f6d7e' }; }
  function catLabel(c) { return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Other'; }
  var CAT_LIST = products.reduce(function (a, p) { if (p.category && a.indexOf(p.category) < 0) a.push(p.category); return a; }, []);
  var catCount = {}; products.forEach(function (p) { catCount[p.category] = (catCount[p.category] || 0) + 1; });

  // ---- state ----
  var view = 'home', authMode = 'login', activeCat = 'All', searchQ = '', shopLimit = 40;
  var cart = {}, orders = [], ordersLoaded = false, placing = false, showPw = false;
  var searchTimer = null;

  // ---- helpers ----
  function $(s) { return document.querySelector(s); }
  function app() { return document.getElementById('app'); }
  function safeLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function delLS(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function token() { return safeLS('ntbf_ctoken'); }
  function customer() { try { return JSON.parse(safeLS('ntbf_cust') || 'null'); } catch (e) { return null; } }
  function aed(n) { return 'AED ' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function firstName() { var c = customer(); return c && c.name ? String(c.name).split(' ')[0] : ''; }
  function cartKey() { var c = customer(); return 'ntbf_cart_' + (c ? c.id : 'anon'); }
  function loadCart() { try { cart = JSON.parse(safeLS(cartKey()) || '{}') || {}; } catch (e) { cart = {}; } }
  function saveCart() { setLS(cartKey(), JSON.stringify(cart)); }
  function cartCount() { return Object.keys(cart).reduce(function (s, id) { return s + (cart[id] || 0); }, 0); }
  function cartTotal() { return Object.keys(cart).reduce(function (s, id) { return s + (byId[id] ? byId[id].price * cart[id] : 0); }, 0); }
  function perPiece(p) {
    var m = String(p.unit || '').match(/(?:of\s+)?(\d+)\s*(?:pieces|pcs|pc)\b/i);
    var n = m ? +m[1] : 0;
    return n > 1 ? p.price / n : 0;
  }
  // Resolve an order line (which may be old {name} or new {id}) to a current product.
  function resolveLine(line) { return (line.id && byId[line.id]) || byName[line.name] || null; }

  function api(path, method, body, auth) {
    var headers = { 'content-type': 'application/json' };
    if (auth && token()) headers['authorization'] = 'Bearer ' + token();
    return fetch(API + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.status === 401 && auth) { sessionExpired(); throw new Error('__auth__'); }
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) throw new Error((data && data.message) || ('Error ' + r.status));
          return data;
        });
      });
  }
  function sessionExpired() {
    delLS('ntbf_ctoken'); delLS('ntbf_cust');
    render(); toast('Your session expired — please sign in again');
  }
  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2400); }

  // =================== render ===================
  function render() {
    if (!token()) { renderAuth(); return; }
    loadCart();
    var showBar = (view === 'home' || view === 'shop');
    app().innerHTML =
      '<div class="hd"><img src="/icons/icon-192.png" alt="" /><div class="nm"><b>National Trading</b><span>Ajman · Wholesale</span></div><span class="u" data-act="settings">Account</span></div>' +
      '<div id="view"></div>' +
      (showBar ? cartBar() : '') +
      '<div class="nav">' +
      navBtn('home', '🏠', 'Home') + navBtn('shop', '🛍️', 'Shop') +
      navBtn('cart', '🛒', 'Cart') + navBtn('orders', '🧾', 'Orders') +
      '</div>';
    var vE = $('#view'); if (vE) vE.classList.add('vin'); // view transition
    if (view === 'home') renderHome();
    else if (view === 'shop') renderShop();
    else if (view === 'cart') renderCart();
    else renderOrders();
    updateNavBadge();
  }
  function navBtn(v, i, label) {
    return '<button class="' + (view === v ? 'on' : '') + '" data-act="view" data-v="' + v + '"><span class="i">' + i + '</span>' + label + '</button>';
  }

  function renderAuth() {
    var isLogin = authMode === 'login';
    app().innerHTML =
      '<div class="auth"><div class="brand"><img src="/icons/icon-192.png" alt="National Trading" />' +
      '<h1>National Trading</h1><p>Beverage &amp; Foodstuff · Ajman</p></div>' +
      '<div class="card"><h3>' + (isLogin ? 'Welcome back' : 'Create your account') + '</h3>' +
      (isLogin ? '' : '<label class="fld"><span>Business name</span><input id="a_name" placeholder="e.g. Corner Shop LLC" /></label>') +
      '<label class="fld"><span>Phone number</span><input id="a_phone" type="tel" inputmode="tel" autocomplete="username" placeholder="+9715..." /></label>' +
      '<label class="fld"><span>Password</span><div class="pwwrap"><input id="a_pass" type="' + (showPw ? 'text' : 'password') + '" autocomplete="current-password" placeholder="At least 4 characters" />' +
      '<button type="button" class="eye" data-act="togglePw">' + (showPw ? '🙈' : '👁️') + '</button></div></label>' +
      (isLogin ? '' : '<label class="fld"><span>Business type</span><select id="a_cat"><option value="RETAIL">Retail shop</option><option value="SUPERMARKET_GROCERY">Supermarket / Grocery</option><option value="RESTAURANT">Restaurant / Cafe</option><option value="WHOLESALE">Wholesale</option></select></label>') +
      '<button class="btn" data-act="' + (isLogin ? 'login' : 'register') + '" id="authbtn">' + (isLogin ? 'Sign in' : 'Create account') + '</button>' +
      '<div class="link" data-act="toggleAuth">' + (isLogin ? 'New customer? Create an account' : 'Already have an account? Sign in') + '</div>' +
      '</div></div>';
    var pass = $('#a_pass');
    if (pass) pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') ACT[isLogin ? 'login' : 'register'](); });
  }

  function cartBar() {
    var n = cartCount(); if (!n) return '';
    return '<div class="cartbar"><div class="inner" data-act="view" data-v="cart">' +
      '<div class="ci">🛒<span class="badge">' + n + '</span></div>' +
      '<div class="t"><b>' + aed(cartTotal()) + '</b><span>' + n + ' item' + (n === 1 ? '' : 's') + ' · review &amp; order</span></div>' +
      '<button class="go" data-act="view" data-v="cart">Review</button></div></div>';
  }

  // ---------- HOME (reorder-first) ----------
  function renderHome() {
    var v = $('#view'); v.innerHTML = '<div class="obody"><div class="skel"></div></div>';
    ensureOrders().then(function () {
      var html = '';
      var last = orders[0];
      if (last) {
        var names = last.items.map(function (l) { return l.name; }).slice(0, 3).join(', ');
        html += '<div class="repeat"><div class="lab">Order again</div>' +
          '<h3>Repeat your last order</h3>' +
          '<div class="meta">' + last.items.length + ' item' + (last.items.length === 1 ? '' : 's') + ' · ' + aed(last.total) + ' · ' + fmtDate(last.createdAt) + '</div>' +
          '<div class="prev">' + esc(names) + (last.items.length > 3 ? ' +' + (last.items.length - 3) + ' more' : '') + '</div>' +
          '<button data-act="reorder" data-o="' + esc(last.id) + '">Add all to cart →</button></div>';
      } else {
        html += '<div class="repeat"><div class="lab">Welcome</div><h3>Your first order</h3>' +
          '<div class="prev">Browse the catalogue and build your order. Pay cash on delivery.</div>' +
          '<button data-act="view" data-v="shop">Browse catalogue →</button></div>';
      }
      // Your usual items (from history frequency)
      var usual = usualItems();
      if (usual.length) {
        html += '<div class="shead"><div class="eyebrow">Quick add</div><h2>Your usual items</h2></div>' +
          '<div class="plist stagger">' + usual.map(prow).join('') + '</div>';
      }
      // Shop by category
      html += '<div class="shead"><div class="eyebrow">Browse</div><h2>Shop by category</h2></div><div class="cgrid stagger">' +
        CAT_LIST.map(function (c) {
          var info = catInfo(c);
          return '<div class="ctile" data-act="gocat" data-c="' + esc(c) + '"><div class="e">' + info.e + '</div><b>' + esc(catLabel(c)) + '</b><span>' + (catCount[c] || 0) + ' items</span></div>';
        }).join('') + '</div>';
      var vv = $('#view'); if (vv) vv.innerHTML = html; // guard: session may have expired mid-load
    });
  }
  function usualItems() {
    var freq = {};
    orders.forEach(function (o) { o.items.forEach(function (l) { var p = resolveLine(l); if (p) freq[p.id] = (freq[p.id] || 0) + (l.qty || 1); }); });
    return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 6).map(function (id) { return byId[id]; }).filter(Boolean);
  }

  // ---------- SHOP ----------
  function renderShop() {
    var chips = '<div class="chip ' + (activeCat === 'All' ? 'on' : '') + '" data-act="cat" data-c="All"><span class="e">🛍️</span>All</div>' +
      CAT_LIST.map(function (c) { var i = catInfo(c); return '<div class="chip ' + (c === activeCat ? 'on' : '') + '" data-act="cat" data-c="' + esc(c) + '"><span class="e">' + i.e + '</span>' + esc(catLabel(c)) + '</div>'; }).join('');
    $('#view').innerHTML =
      '<div class="shead"><div class="eyebrow">' + (activeCat === 'All' ? 'Full range' : esc(catLabel(activeCat))) + '</div><h2>Shop the catalogue</h2></div>' +
      '<div class="cats">' + chips + '</div>' +
      '<div class="search"><span class="ic">🔍</span><input id="q" inputmode="search" placeholder="Search ' + products.length + ' products…" value="' + esc(searchQ) + '" />' +
      (searchQ ? '<button class="clr" data-act="clearSearch">✕</button>' : '') + '</div>' +
      '<div id="plist" class="plist"></div><div id="pfoot"></div>';
    renderList();
    var qi = $('#q');
    if (qi) qi.addEventListener('input', function (e) {
      searchQ = e.target.value; shopLimit = 40;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { renderList(); toggleClear(); }, 130);
    });
  }
  function filteredProducts() {
    var q = searchQ.toLowerCase();
    return products.filter(function (p) {
      return (activeCat === 'All' || p.category === activeCat) && (!q || p.name.toLowerCase().indexOf(q) >= 0);
    });
  }
  function renderList() {
    var list = filteredProducts();
    var shown = list.slice(0, shopLimit);
    var el = $('#plist'); if (!el) return;
    el.innerHTML = shown.length ? shown.map(prow).join('') : '<div class="empty"><div class="big">🔎</div><p>No products match your search.</p><button class="btn sec" data-act="clearSearch">Clear search</button></div>';
    var foot = $('#pfoot');
    if (foot) {
      if (list.length > shopLimit) foot.innerHTML = '<div class="loadmore"><button data-act="more">Load more (' + (list.length - shopLimit) + ' more)</button></div>';
      else if (list.length) foot.innerHTML = '<div class="shown">Showing all ' + list.length + ' products</div>';
      else foot.innerHTML = '';
    }
  }
  function toggleClear() {
    var s = $('.search'); if (!s) return;
    var has = s.querySelector('.clr');
    if (searchQ && !has) s.insertAdjacentHTML('beforeend', '<button class="clr" data-act="clearSearch">✕</button>');
    else if (!searchQ && has) has.remove();
  }
  function prow(p) {
    var info = catInfo(p.category); var pp = perPiece(p);
    return '<div class="prow"><div class="tile" style="background:' + info.c + '18;color:' + info.c + '">' + info.e + '</div>' +
      '<div class="m"><b>' + esc(p.name) + '</b><div class="meta">' + esc(p.unit || '') + '</div>' +
      '<div class="price">' + aed(p.price) + (pp ? '<small>' + aed(pp).replace('AED ', '') + '/pc</small>' : '') + '</div></div>' +
      qcHtml(p.id) + '</div>';
  }
  function qcHtml(id) {
    var q = cart[id] || 0;
    if (q <= 0) return '<button class="addbtn" data-act="add" data-i="' + id + '">Add</button>';
    return '<div class="qc" data-qc="' + id + '"><button data-act="dec" data-i="' + id + '">−</button>' +
      '<input inputmode="numeric" data-act="setqty" data-i="' + id + '" value="' + q + '" />' +
      '<button data-act="inc" data-i="' + id + '">+</button></div>';
  }
  function refreshQty(id) {
    // update just this product's control(s) in place — no scroll reset, no focus loss elsewhere
    document.querySelectorAll('[data-qc="' + id + '"]').forEach(function (n) { n.outerHTML = qcHtml(id); });
    document.querySelectorAll('.prow, .cline').forEach(function () {});
    // rows currently in "Add" state need swapping too
    document.querySelectorAll('.addbtn[data-i="' + id + '"]').forEach(function (n) { if (cart[id]) n.outerHTML = qcHtml(id); });
    updateCartBar(); updateNavBadge();
  }

  // ---------- CART (review) ----------
  function renderCart() {
    var ids = Object.keys(cart).filter(function (id) { return byId[id] && cart[id] > 0; });
    if (!ids.length) {
      $('#view').innerHTML = '<div class="shead"><div class="eyebrow">Your basket</div><h2>Cart</h2></div>' +
        '<div class="empty"><div class="big">🛒</div><p>Your cart is empty.<br/>Add products, then review and order here.</p><button class="btn" data-act="view" data-v="shop">Browse catalogue</button></div>';
      return;
    }
    var sub = cartTotal(), vat = sub * 0.05, tot = sub + vat;
    var c = customer();
    var lines = ids.map(function (id) {
      var p = byId[id];
      return '<div class="cline"><div class="m"><b>' + esc(p.name) + '</b><div class="meta">' + esc(p.unit || '') + ' · ' + aed(p.price) + '</div></div>' +
        qcHtml(id) + '<button class="rm" data-act="removeLine" data-i="' + id + '">🗑</button></div>';
    }).join('');
    $('#view').innerHTML = '<div class="shead"><div class="eyebrow">Your basket</div><h2>Review your order</h2></div>' +
      '<div class="cart stagger">' + lines +
      '<div class="summary"><div class="r"><span>Subtotal</span><span>' + aed(sub) + '</span></div>' +
      '<div class="r"><span>VAT (5%)</span><span>' + aed(vat) + '</span></div>' +
      '<div class="r big"><span>Total (cash on delivery)</span><b>' + aed(tot) + '</b></div></div>' +
      '<label class="fld"><span>Delivery address</span><textarea id="c_addr" placeholder="Shop name, area, Ajman…">' + esc((c && c.address) || '') + '</textarea></label>' +
      '<label class="fld"><span>Note for the driver (optional)</span><input id="c_note" placeholder="e.g. call on arrival" /></label>' +
      '<button class="btn" data-act="placeOrder" id="placebtn">Place order · ' + aed(tot) + '</button>' +
      '<div class="link" data-act="view" data-v="shop">+ Add more items</div></div>';
  }

  // ---------- ORDERS ----------
  function renderOrders() {
    $('#view').innerHTML = '<div class="shead"><div class="eyebrow">Your history</div><h2>My orders</h2></div><div class="obody"><div class="skel"></div><div class="skel"></div></div>';
    ensureOrders(true).then(function () {
      var track = { PLACED: 'Order received', CONFIRMED: 'Confirmed', PACKED: 'Preparing', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered' };
      var cls = function (s) { return s === 'DELIVERED' ? 'done' : (s === 'OUT_FOR_DELIVERY' ? 'way' : ''); };
      var body = orders.length ? orders.map(function (o) {
        var lines = o.items.map(function (l) { return '<div class="oline"><span><span class="q">' + (l.qty || 1) + '×</span>' + esc(l.name) + '</span><span>' + aed((l.price || 0) * (l.qty || 1)) + '</span></div>'; }).join('');
        return '<div class="ord" data-oid="' + esc(o.id) + '"><div class="h" data-act="toggleOrder" data-o="' + esc(o.id) + '">' +
          '<div><b>' + esc(o.id) + '</b><div class="s">' + o.items.length + ' item' + (o.items.length === 1 ? '' : 's') + ' · ' + aed(o.total) + ' · ' + fmtDate(o.createdAt) + '</div></div>' +
          '<span class="tag ' + cls(o.status) + '">' + (track[o.status] || esc(o.status)) + '</span></div>' +
          '<div class="olines">' + lines + (o.address ? '<div class="oline" style="margin-top:6px"><span class="q">Deliver to</span><span style="text-align:right;max-width:60%">' + esc(o.address) + '</span></div>' : '') +
          '<button class="reorder" data-act="reorder" data-o="' + esc(o.id) + '">🔁 Reorder these items</button></div></div>';
      }).join('') : '<div class="empty"><div class="big">🧾</div><p>No orders yet.<br/>Start your first order now.</p><button class="btn" data-act="view" data-v="shop">Order now</button></div>';
      var vv = $('#view'); if (!vv) return; // guard: session may have expired mid-load
      vv.innerHTML = '<div class="shead"><div class="eyebrow">Your history</div><h2>My orders ' + (orders.length ? '(' + orders.length + ')' : '') + '</h2></div><div class="obody stagger">' + body + '</div>';
    });
  }

  function ensureOrders(force) {
    if (ordersLoaded && !force) return Promise.resolve();
    return api('/api/portal/orders', 'GET', null, true).then(function (r) { orders = r || []; ordersLoaded = true; })
      .catch(function (e) { if (e.message !== '__auth__') { orders = orders || []; } });
  }
  function fmtDate(s) { try { return new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch (e) { return ''; } }

  function updateCartBar() {
    var holder = document.querySelector('.nav'); var existing = document.querySelector('.cartbar');
    if (view !== 'home' && view !== 'shop') { if (existing) existing.remove(); return; }
    var html = cartBar();
    if (existing) existing.outerHTML = html || ''; else if (html && holder) holder.insertAdjacentHTML('beforebegin', html);
  }
  function updateNavBadge() {
    var btn = document.querySelector('.nav button[data-v="cart"]'); if (!btn) return;
    var n = cartCount(); var b = btn.querySelector('.ncount');
    if (n) { if (!b) { b = document.createElement('span'); b.className = 'ncount'; btn.appendChild(b); } b.textContent = n; }
    else if (b) b.remove();
  }

  // =================== actions ===================
  var ACT = {
    togglePw: function () { showPw = !showPw; renderAuth(); },
    toggleAuth: function () { authMode = authMode === 'login' ? 'register' : 'login'; renderAuth(); },
    login: function () {
      var btn = $('#authbtn'); if (btn) btn.disabled = true;
      api('/api/portal/login', 'POST', { phone: ($('#a_phone').value || '').trim(), password: $('#a_pass').value })
        .then(saveSession).catch(function (e) { if (btn) btn.disabled = false; if (e.message !== '__auth__') toast(e.message); });
    },
    register: function () {
      var name = ($('#a_name') || {}).value; if (!name || !name.trim()) return toast('Enter your business name');
      if (($('#a_pass').value || '').length < 4) return toast('Password must be at least 4 characters');
      var btn = $('#authbtn'); if (btn) btn.disabled = true;
      api('/api/portal/register', 'POST', { name: name.trim(), phone: ($('#a_phone').value || '').trim(), password: $('#a_pass').value, category: ($('#a_cat') || {}).value })
        .then(saveSession).catch(function (e) { if (btn) btn.disabled = false; if (e.message !== '__auth__') toast(e.message); });
    },
    logout: function () { delLS('ntbf_ctoken'); delLS('ntbf_cust'); cart = {}; view = 'home'; ordersLoaded = false; render(); },
    settings: function () { accountSheet(); },
    view: function (d) { view = d.v; if (d.v === 'orders') ordersLoaded = false; render(); },
    gocat: function (d) { activeCat = d.c; searchQ = ''; shopLimit = 40; view = 'shop'; render(); },
    cat: function (d) { activeCat = d.c; shopLimit = 40; renderShop(); },
    clearSearch: function () { searchQ = ''; shopLimit = 40; renderShop(); },
    more: function () { shopLimit += 40; renderList(); },
    add: function (d) { cart[d.i] = (cart[d.i] || 0) + 1; saveCart(); refreshQty(d.i); toastAdd(d.i); },
    inc: function (d) { cart[d.i] = (cart[d.i] || 0) + 1; saveCart(); refreshOrCart(d.i); },
    dec: function (d) { cart[d.i] = (cart[d.i] || 0) - 1; if (cart[d.i] <= 0) delete cart[d.i]; saveCart(); refreshOrCart(d.i); },
    setqty: function () {}, // handled by input listener
    removeLine: function (d) { delete cart[d.i]; saveCart(); renderCart(); updateNavBadge(); },
    reorder: function (d) {
      var o = orders.filter(function (x) { return x.id === d.o; })[0]; if (!o) return;
      var added = 0;
      o.items.forEach(function (l) { var p = resolveLine(l); if (p) { cart[p.id] = (cart[p.id] || 0) + (l.qty || 1); added++; } });
      saveCart();
      if (!added) return toast('Those items are no longer available');
      view = 'cart'; render(); toast('Added ' + added + ' item' + (added === 1 ? '' : 's') + ' to cart');
    },
    toggleOrder: function (d) { var el = document.querySelector('.ord[data-oid="' + cssEsc(d.o) + '"]'); if (el) el.classList.toggle('open'); },
    placeOrder: function () {
      if (placing) return;
      var ids = Object.keys(cart).filter(function (id) { return byId[id] && cart[id] > 0; });
      if (!ids.length) return toast('Your cart is empty');
      var items = ids.map(function (id) { return { id: id, qty: cart[id] }; });
      var addr = ($('#c_addr') || {}).value || '', note = ($('#c_note') || {}).value || '';
      placing = true; var btn = $('#placebtn'); if (btn) { btn.disabled = true; btn.textContent = 'Placing order…'; }
      api('/api/portal/orders', 'POST', { items: items, method: 'CASH_ON_DELIVERY', address: addr, note: note }, true)
        .then(function (o) {
          cart = {}; saveCart(); placing = false; ordersLoaded = false; view = 'orders'; render();
          toast('Order ' + o.id + ' placed! 🎉');
        })
        .catch(function (e) { placing = false; if (btn) { btn.disabled = false; } renderCart(); if (e.message !== '__auth__') toast(e.message || 'Could not place order — please retry'); });
    }
  };
  function refreshOrCart(id) { if (view === 'cart') renderCart(); else refreshQty(id); updateNavBadge(); }
  function toastAdd(id) { var p = byId[id]; if (p) toast((p.name.length > 30 ? p.name.slice(0, 30) + '…' : p.name) + ' added'); }
  function cssEsc(s) { return String(s).replace(/"/g, '\\"'); }

  function saveSession(r) {
    setLS('ntbf_ctoken', r.token); setLS('ntbf_cust', JSON.stringify(r.customer));
    loadCart(); view = 'home'; ordersLoaded = false; render(); toast('Welcome, ' + String(r.customer.name).split(' ')[0] + '!');
  }

  function accountSheet() {
    var c = customer() || {};
    toast('Signed in as ' + esc(c.name || ''));
    if (confirm('Signed in as ' + (c.name || '') + ' (' + (c.phone || '') + ').\n\nSign out?')) ACT.logout();
  }

  // qty type-in listener (delegated, on input)
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.dataset && t.dataset.act === 'setqty') {
      var v = parseInt(String(t.value).replace(/[^0-9]/g, ''), 10);
      if (isNaN(v) || v < 0) v = 0;
      if (v > 99999) v = 99999;
      var id = t.dataset.i;
      if (v <= 0) { delete cart[id]; } else { cart[id] = v; }
      saveCart(); updateCartBar(); updateNavBadge();
    }
  });
  // fly a little dot from the tapped Add button to the cart tab, then pop the badge
  function flyToCart(el) {
    try {
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (!el.animate) return;
      var target = document.querySelector('.nav [data-v="cart"]'); if (!target) return;
      var a = el.getBoundingClientRect(), b = target.getBoundingClientRect();
      var f = document.createElement('div'); f.className = 'flyer'; f.textContent = '+';
      f.style.left = (a.left + a.width / 2 - 10) + 'px'; f.style.top = (a.top + a.height / 2 - 10) + 'px';
      document.body.appendChild(f);
      var dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      f.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.35)', opacity: .4 }],
        { duration: 540, easing: 'cubic-bezier(.4,.05,.3,1)' }).onfinish = function () { f.remove(); popBadge(); };
    } catch (e) {}
  }
  function popBadge() { var b = document.querySelector('.nav [data-v="cart"] .ncount'); if (b && b.classList) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    if (t.dataset.act === 'add') flyToCart(t);
    var fn = ACT[t.dataset.act]; if (fn) fn(t.dataset);
  });

  render();
})();
