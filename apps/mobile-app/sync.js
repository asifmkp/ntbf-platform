// ---------------------------------------------------------------------------
// Shared-data sync — keeps every device on one live dataset via the backend.
// Pulls on load + every few seconds, pushes local changes (debounced).
// Document photos stay on the device that captured them (kept out of the sync
// payload to stay lean); everything else syncs across all phones.
// ---------------------------------------------------------------------------
(function () {
  if (!window.Store) return;
  const API = localStorage.getItem('ntbf_api') || ((location.protocol.startsWith('http') && location.port !== '8080') ? location.origin : 'http://localhost:3000');
  const REVKEY = 'ntbf_rev';
  let rev = +(localStorage.getItem(REVKEY) || 0);
  let suppress = false;
  let pushTimer = null;
  let online = false;

  function headers() {
    const t = localStorage.getItem('ntbf_token');
    return Object.assign({ 'content-type': 'application/json' }, t ? { 'x-api-key': t } : {});
  }

  // Strip heavy base64 photos before sending; keep metadata.
  function lean(state) {
    const s = JSON.parse(JSON.stringify(state));
    (s.documents || []).forEach((d) => { if (d.image) { d.image = null; d.hasImage = true; } });
    return s;
  }

  function adopt(remote, newRev) {
    // Preserve any photos this device holds locally.
    const localImgs = {};
    (Store.state.documents || []).forEach((d) => { if (d.image) localImgs[d.id] = d.image; });
    suppress = true;
    Store.state = remote;
    (Store.state.documents || []).forEach((d) => { if (!d.image && localImgs[d.id]) d.image = localImgs[d.id]; });
    localStorage.setItem('ntbf_app_v1', JSON.stringify(Store.state));
    rev = newRev; localStorage.setItem(REVKEY, rev);
    suppress = false;
    if (window.renderApp) window.renderApp();
    setStatus(true);
  }

  async function pull() {
    try {
      const r = await fetch(API + '/api/appstate', { headers: headers(), cache: 'no-store' });
      if (!r.ok) throw new Error('http ' + r.status);
      const d = await r.json();
      setStatus(true);
      if (d && d.state && d.rev > rev) {
        const localSeedV = (Store.state && Store.state.seedVersion) || 0;
        if ((d.state.seedVersion || 0) < localSeedV) {
          // Remote blob predates our seed (e.g. a stale device pushed the old
          // demo dataset). Never adopt it — record its rev and push our clean
          // versioned state so the server (last-write-wins) converges on it.
          rev = d.rev; localStorage.setItem(REVKEY, rev);
          push();
        } else adopt(d.state, d.rev);
      } else if (d && (!d.state || d.rev === 0) && rev === 0) push(); // seed empty server with local
    } catch (e) { setStatus(false); }
  }

  async function push() {
    if (suppress) return;
    try {
      const r = await fetch(API + '/api/appstate', { method: 'PUT', headers: headers(), body: JSON.stringify({ state: lean(Store.state), rev }) });
      if (!r.ok) throw new Error('http ' + r.status);
      const d = await r.json();
      if (d && typeof d.rev === 'number') { rev = d.rev; localStorage.setItem(REVKEY, rev); }
      setStatus(true);
    } catch (e) { setStatus(false); }
  }

  function schedulePush() { if (suppress) return; clearTimeout(pushTimer); pushTimer = setTimeout(push, 900); }

  function setStatus(up) {
    if (up === online) return;
    online = up;
    let dot = document.getElementById('sync-dot');
    if (!dot) {
      dot = document.createElement('div');
      dot.id = 'sync-dot';
      dot.style.cssText = 'position:fixed;top:6px;right:8px;z-index:90;font-size:10px;padding:2px 8px;border-radius:20px;pointer-events:none';
      document.body.appendChild(dot);
    }
    dot.textContent = up ? '● synced' : '○ offline';
    dot.style.background = up ? 'rgba(26,158,117,.15)' : 'rgba(226,75,74,.15)';
    dot.style.color = up ? '#1a9e75' : '#e24b4a';
  }

  Store.on(schedulePush);
  pull();
  setInterval(pull, 6000);
  window.NTBF_SYNC = { pull, push, rev: () => rev };
})();
