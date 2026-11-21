/* =========================================================
   Encrypted sync through Google Drive (hidden app folder)
   - Data is encrypted with your app password BEFORE upload; Google only
     ever stores ciphertext. The key lives in memory while unlocked.
   - Merge is per record (newest edit wins); deletions travel as
     "tombstones"; photos travel as thumbnails.
   - Needs a Google OAuth Client ID (Settings → Sync explains how).
   ========================================================= */
(function (global) {
  'use strict';
  const FILE = 'inventory-ledger-sync.json';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  let api = null;           // provided by app.js
  let key = null, salt = null, iterations = 0;
  let token = null, tokenExp = 0, fileId = null;
  let timer = null, busy = false, again = false, pausedForAuth = false, appliedSnapshot = false;

  const S = () => api.settings();
  const enabled = () => !!(S().sync && S().sync.enabled && S().sync.clientId);
  const hash = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };

  function setStatus(text, kind) {
    const el = document.getElementById('syncState');
    if (!el) return;
    el.classList.toggle('hidden', !enabled());
    el.classList.toggle('err', kind === 'err');
    el.textContent = text;
  }

  /* ---------------- transport: Google Drive (or a test mock) ---------------- */
  function loadGis() {
    if (global.google && global.google.accounts && global.google.accounts.oauth2) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('Could not load Google sign-in (offline?)'));
      document.head.appendChild(s);
    });
  }
  async function getToken(interactive) {
    if (token && Date.now() < tokenExp - 60000) return token;
    await loadGis();
    return new Promise((resolve, reject) => {
      const client = global.google.accounts.oauth2.initTokenClient({
        client_id: S().sync.clientId.trim(), scope: SCOPE,
        callback: (r) => { if (r.error) reject(new Error(r.error_description || r.error)); else { token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000; resolve(token); } },
        error_callback: (e) => reject(new Error(e && e.type === 'popup_closed' ? 'Sign-in window was closed' : (e && (e.message || e.type)) || 'Google sign-in failed'))
      });
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }
  async function gfetch(url, opts = {}, interactive = false) {
    const t = await getToken(interactive);
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
    if (res.status === 401) { token = null; throw Object.assign(new Error('Google sign-in expired'), { auth: true }); }
    if (!res.ok) throw new Error(`Google Drive error ${res.status}`);
    return res;
  }
  const Drive = {
    async read(interactive) {
      const q = encodeURIComponent(`name='${FILE}'`);
      const list = await (await gfetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`, {}, interactive)).json();
      const f = (list.files || [])[0];
      if (!f) { fileId = null; return null; }
      fileId = f.id;
      return (await gfetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json();
    },
    async write(obj) {
      const body = JSON.stringify(obj);
      if (fileId) {
        await gfetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      } else {
        const boundary = 'b' + Math.random().toString(36).slice(2);
        const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
        const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        const r = await (await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart })).json();
        fileId = r.id;
      }
    }
  };
  const transport = () => global.__syncMock || Drive;

  /* ---------------- merge ---------------- */
  const LOCAL_ONLY = ['sync', 'tableHeights', 'rowSize', 'invSort', 'ordSort', 'expSort', 'mileSort', 'hiddenCols', 'backupSnoozeUntil'];
  function core(d) {
    const sortById = (a) => [...(a || [])].sort((x, y) => String(x.id).localeCompare(String(y.id)));
    const st = { ...(d.settings || {}) }; LOCAL_ONLY.forEach((k) => delete st[k]);
    return JSON.stringify([sortById(d.items), sortById(d.expenses), sortById(d.mileage), d.tombstones || {}, st, Object.keys(d.photos || {}).sort()]);
  }
  function mergeKind(a = [], b = [], tombA = {}, tombB = {}) {
    const tomb = { ...tombA }; Object.entries(tombB).forEach(([id, t]) => { tomb[id] = Math.max(tomb[id] || 0, t); });
    const map = new Map();
    [...a, ...b].forEach((r) => { const cur = map.get(r.id); if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) map.set(r.id, r); });
    const out = [...map.values()].filter((r) => !(tomb[r.id] && tomb[r.id] >= (r.updatedAt || 0)));
    // keep only tombstones younger than 180 days
    const cutoff = Date.now() - 180 * 864e5; Object.keys(tomb).forEach((id) => { if (tomb[id] < cutoff) delete tomb[id]; });
    return { list: out, tomb };
  }
  function merge(local, remote) {
    if (!remote) return local;
    const t = { items: {}, expenses: {}, mileage: {} };
    const out = { photos: { ...(remote.photos || {}), ...(local.photos || {}) } };
    ['items', 'expenses', 'mileage'].forEach((k) => {
      const m = mergeKind(local[k], remote[k], (local.tombstones || {})[k], (remote.tombstones || {})[k]);
      out[k] = m.list; t[k] = m.tomb;
    });
    out.tombstones = t;
    const ls = local.settings || {}, rs = remote.settings || {};
    out.settings = (rs.updatedAt || 0) > (ls.updatedAt || 0) ? { ...rs } : { ...ls };
    LOCAL_ONLY.forEach((k) => { if (k in ls) out.settings[k] = ls[k]; else delete out.settings[k]; });
    out.logo = local.logo || remote.logo || null;
    out.questionAnswers = remote.questionAnswers || local.questionAnswers || null; // same reset questions on all your devices
    return out;
  }

  /* ---------------- sync cycle ---------------- */
  async function ensureKey(remoteFile, password) {
    if (key && (!remoteFile || remoteFile.salt === salt)) return true;
    if (!password) return false;
    const k = await Store.deriveSyncKey(password, remoteFile ? remoteFile.salt : null);
    key = k.key; salt = k.salt; iterations = k.iterations;
    return true;
  }
  async function syncNow({ interactive = false, password = null } = {}) {
    if (!enabled() || !Store.unlocked) return;
    if (busy) { again = true; return; }
    busy = true; setStatus('Syncing…');
    try {
      const file = await transport().read(interactive);
      if (!(await ensureKey(file, password))) {
        // the Drive copy was re-locked (password changed on another device) — ask for the new password
        setStatus('Sync: password changed elsewhere', 'err');
        key = null;
        const newPw = await api.passwordMismatch(null);
        if (newPw) setTimeout(() => syncNow({ password: newPw }), 50);
        return;
      }
      let remote = null;
      if (file) {
        try { remote = await Store.decryptWithKey(key, file); }
        catch (_) {
          setStatus('Sync: password changed elsewhere', 'err');
          key = null;
          const newPw = await api.passwordMismatch(password);
          if (newPw) setTimeout(() => syncNow({ password: newPw }), 50);
          return;
        }
      }
      const local = await api.snapshot();
      const merged = merge(local, remote);
      if (password && merged.questionAnswers && JSON.stringify(merged.questionAnswers) !== JSON.stringify(local.questionAnswers)) await api.adoptRecovery(merged.questionAnswers, password);
      if (remote && core(merged) !== core(local)) {
        if (!appliedSnapshot) { await api.takeSnapshot('Before applying changes from Google Drive sync'); appliedSnapshot = true; }
        await api.apply(merged, local);
      }
      if (!remote || core(merged) !== core(remote)) {
        const enc = await Store.encryptWithKey(key, { v: 1, ...merged });
        await transport().write({ format: 'inventory-ledger-sync', v: 1, salt, iterations, updatedAt: new Date().toISOString(), digest: hash(core(merged)), ...enc });
      }
      S().sync.lastSync = new Date().toISOString(); api.saveSettingsQuiet();
      pausedForAuth = false;
      setStatus('Synced ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (e) {
      console.error('sync', e);
      if (e.auth || /sign-in|popup|consent|access/i.test(e.message)) { pausedForAuth = true; setStatus('Sync paused — click to reconnect', 'err'); }
      else setStatus('Sync failed — click to retry', 'err');
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(() => syncNow(), 500); }
    }
  }

  const Sync = {
    init(a) {
      api = a;
      document.addEventListener('click', (e) => { if (e.target.id === 'syncState') syncNow({ interactive: pausedForAuth }); });
      window.addEventListener('online', () => { if (enabled() && key) syncNow(); });
    },
    unlocked(password) { if (!enabled()) { setStatus(''); return; } setStatus('Syncing…'); syncNow({ password }); },
    lock() { key = null; salt = null; token = null; tokenExp = 0; fileId = null; clearTimeout(timer); appliedSnapshot = false; setStatus(''); },
    changed() { if (!enabled() || !key || api.applying()) return; clearTimeout(timer); timer = setTimeout(() => syncNow(), 12000); setStatus('Changes waiting to sync…'); },
    now: (opts) => syncNow(opts || {}),
    /** After a password change/reset: merge using the old password, then re-lock the Drive copy with the new one. */
    async passwordChanged(oldPw, newPw) {
      if (!enabled()) return;
      key = null; salt = null;
      await syncNow({ password: oldPw });
      const k = await Store.deriveSyncKey(newPw, null);
      key = k.key; salt = k.salt; iterations = k.iterations;
      try {
        const snap = await api.snapshot();
        const enc = await Store.encryptWithKey(key, { v: 1, ...snap });
        await transport().write({ format: 'inventory-ledger-sync', v: 1, salt, iterations, updatedAt: new Date().toISOString(), digest: hash(core(snap)), ...enc });
        setStatus('Synced ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      } catch (e) { console.error(e); setStatus('Sync failed — click to retry', 'err'); }
    },
    async enable(clientId, password) {
      S().sync = { ...(S().sync || {}), clientId: clientId.trim(), enabled: true };
      api.saveSettingsQuiet();
      key = null; token = null;
      await getToken(true).catch((e) => { if (!global.__syncMock) throw e; });
      await syncNow({ interactive: true, password });
    },
    disable() { S().sync = { ...(S().sync || {}), enabled: false }; api.saveSettingsQuiet(); Sync.lock(); },
    _merge: merge, _core: core
  };
  global.Sync = Sync;
})(window);
