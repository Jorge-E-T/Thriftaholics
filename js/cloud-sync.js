/* =========================================================
   Cloud sync through Firebase (Firestore + e-mail sign-in)
   - Every item, expense, trip and photo is its own Firestore document, so
     changes reach your other devices within seconds (live listeners).
   - Each document is encrypted with your app password BEFORE upload
     (AES-256). Firebase only ever stores scrambled data plus a timestamp.
   - Newest edit wins per record; deletions travel as small markers.
   - Setup: fill in firebase-config.js and publish firestore.rules
     (see the Cloud Sync Setup Guide).
   ========================================================= */
(function (global) {
  'use strict';
  const KINDS = ['items', 'expenses', 'mileage'];
  const COLLS = ['items', 'expenses', 'mileage', 'photos', 'app'];
  const LOCAL_ONLY = ['sync', 'cloud', 'tableHeights', 'rowSize', 'invSort', 'ordSort', 'expSort', 'mileSort', 'hiddenCols', 'backupSnoozeUntil', 'updatedAt'];
  const MAX_DOC = 900000;        // Firestore's limit is 1 MiB per document
  const LIB = ['lib/firebase/firebase-app-compat.js', 'lib/firebase/firebase-auth-compat.js', 'lib/firebase/firebase-firestore-compat.js'];

  let api = null, adapter = null, cfg = null, cfgOk = false, loadErr = null, inited = false;
  let user = null, authKnown = false, unlockedPw = null;
  let key = null, keyId = null, password = null, keyProblem = null;
  let running = false, unsubs = [], mirror = {}, ready = new Set(), offline = !navigator.onLine;
  let pending = 0, lastErr = null, lastSync = null, schedTimer = null, reconciling = false, again = false;
  let askingKey = false, oversizeWarned = false;
  const decCache = new Map();

  /* ---------------- small helpers ---------------- */
  const S = () => api.settings();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function hash(str) {
    str = String(str || ''); let h = 0x811c9dc5, g = 0x01000193;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, g); }
    return str.length.toString(36) + '-' + (h >>> 0).toString(36);
  }
  const configured = (c) => !!(c && c.apiKey && c.projectId && c.appId && !/PASTE_/.test(JSON.stringify(c)));
  function friendly(e) {
    const code = (e && (e.code || '')) + '';
    const msg = (e && e.message) || String(e);
    if (/permission-denied|insufficient permissions/i.test(code + msg)) return 'This cloud account is not allowed. Check the e-mail list in the Firestore rules.';
    if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/i.test(code)) return 'Wrong e-mail or password.';
    if (/too-many-requests/i.test(code)) return 'Too many tries. Wait a few minutes, or reset the password.';
    if (/operation-not-allowed/i.test(code)) return 'E-mail/password sign-in is not turned on in Firebase (Authentication → Sign-in method).';
    if (/network-request-failed|unavailable/i.test(code)) return 'No connection to the cloud. Check the internet and try again.';
    if (/referer|api-key|API key/i.test(code + msg)) return 'Firebase refused this website. Check Authorized domains and any API-key restriction.';
    if (/resource-exhausted|quota/i.test(code + msg)) return 'The free daily cloud limit was reached. Work continues here and syncs after midnight Pacific time.';
    return msg.replace(/^Firebase:\s*/, '');
  }
  const seenKey = () => `thrift-cloud:${(cfg && cfg.projectId) || 'x'}:${(user && user.email) || 'x'}`;
  function loadSeen() { try { return JSON.parse(localStorage.getItem(seenKey()) || '{}') || {}; } catch (_) { return {}; } }
  function saveSeen(s) { try { localStorage.setItem(seenKey(), JSON.stringify(s)); } catch (_) { /* ignore */ } }

  /* ---------------- transport: Firebase (or a test mock) ---------------- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  function firebaseAdapter() {
    let auth, db;
    return {
      async init(c) {
        if (!global.firebase) { for (const src of LIB) await loadScript(src); }
        const fb = global.firebase;
        if (!fb.apps.length) fb.initializeApp(c);
        auth = fb.auth(); db = fb.firestore();
      },
      onAuth(cb) { return auth.onAuthStateChanged((u) => cb(u ? { email: String(u.email || '').toLowerCase() } : null)); },
      async signIn(email, pw) { await auth.signInWithEmailAndPassword(email, pw); },
      async signOut() { await auth.signOut(); },
      async resetPassword(email) { await auth.sendPasswordResetEmail(email); },
      listen(coll, onChanges, onError) {
        return db.collection(coll).onSnapshot({ includeMetadataChanges: true }, (snap) => {
          const changes = snap.docChanges().map((c) => ({ type: c.type, id: c.doc.id, data: c.type === 'removed' ? null : c.doc.data() }));
          onChanges(changes, { fromCache: snap.metadata.fromCache });
        }, onError);
      },
      async commit(ops) {
        for (let i = 0; i < ops.length; i += 400) {
          const b = db.batch();
          ops.slice(i, i + 400).forEach((o) => { const ref = db.collection(o.coll).doc(o.id); if (o.data) b.set(ref, o.data); else b.delete(ref); });
          await b.commit();
        }
      }
    };
  }

  /* ---------------- status pill + card ---------------- */
  function statusInfo() {
    if (!cfgOk) return { kind: 'off', text: 'Cloud sync not set up', hidden: true };
    if (loadErr) return { kind: 'err', text: 'Cloud unavailable' };
    if (!user) return { kind: 'off', text: 'Not signed in' };
    if (keyProblem) return { kind: 'err', text: 'Cloud sync problem' };
    if (lastErr) return { kind: 'err', text: 'Cloud sync problem' };
    if (offline) return { kind: 'warn', text: 'Offline: saving on this device' };
    if (!running || ready.size < COLLS.length) return { kind: 'busy', text: 'Connecting…' };
    if (pending || reconciling || schedTimer) return { kind: 'busy', text: 'Syncing…' };
    return { kind: 'ok', text: 'Up to date' };
  }
  function render() {
    const st = statusInfo();
    const pill = document.getElementById('syncState');
    if (pill) {
      pill.classList.toggle('hidden', !!st.hidden);
      pill.className = pill.className.replace(/\bcs-\w+\b/g, '').trim() + ' cs-' + st.kind;
      pill.textContent = '☁ ' + st.text;
      pill.title = 'Cloud sync — click for details';
    }
    renderCard(st);
  }
  function renderCard(st) {
    const el = document.getElementById('cloudCard');
    if (!el || el.contains(document.activeElement) && el.querySelector('input:focus')) { if (el) updateCardStatus(st); return; }
    if (!cfgOk) {
      el.innerHTML = `<div class="cs-box cs-note"><b>Cloud sync is not set up.</b> firebase-config.js still has PASTE_ values or wasn’t uploaded. Follow the Cloud Sync Setup Guide, Parts 1–6.</div>`;
      return;
    }
    if (loadErr) {
      el.innerHTML = `<div class="cs-box cs-note cs-bad"><b>Cloud unavailable.</b> ${esc(loadErr)} The app keeps working on this device. Reload once you’re online.</div>`;
      return;
    }
    if (!user) {
      el.innerHTML = `<div class="cs-box">
        <p class="small" style="margin-top:0">Sign in with the cloud e-mail and password created for you in Firebase (not your Gmail password). Each device signs in once and is remembered.</p>
        <label class="field"><span>Cloud e-mail</span><input id="csEmail" type="email" autocomplete="username" inputmode="email" placeholder="you@gmail.com"></label>
        <label class="field"><span>Cloud password</span><input id="csPass" type="password" autocomplete="current-password"></label>
        <p class="lock-error" id="csErr"></p>
        <div class="btn-row"><button class="btn btn-primary btn-sm" id="csSignIn" type="button">☁ Sign in to cloud</button>
        <button class="linklike small" id="csForgot" type="button">Forgot password?</button></div></div>`;
      return;
    }
    el.innerHTML = `<div class="cs-box">
      <p style="margin-top:0">Signed in as <b>${esc(user.email)}</b></p>
      <p class="small"><span class="cs-dot cs-${st.kind}"></span> <span id="csStatus">${esc(st.text)}</span><span id="csLast" class="muted">${lastSync ? ' · last change synced ' + esc(lastSync.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) : ''}</span></p>
      <p class="lock-error" id="csErr">${esc(keyProblem || lastErr || '')}</p>
      <div class="btn-row"><button class="btn btn-sm" id="csNow" type="button">⟳ Sync now</button>
      <button class="btn btn-ghost btn-sm" id="csOut" type="button">Sign out of cloud</button></div></div>`;
  }
  function updateCardStatus(st) {
    const s = document.getElementById('csStatus'); if (s) s.textContent = st.text;
  }
  function wireCard() {
    document.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.id === 'syncState') { api.openCloud(); if (user && (lastErr || keyProblem)) Sync.now(); return; }
      if (t.id === 'csSignIn') {
        const email = document.getElementById('csEmail').value.trim(), pw = document.getElementById('csPass').value;
        const err = document.getElementById('csErr');
        if (!email || !pw) { err.textContent = 'Enter the cloud e-mail and password.'; return; }
        t.disabled = true; t.textContent = 'Signing in…'; err.textContent = '';
        try { await adapter.signIn(email, pw); }
        catch (x) { err.textContent = friendly(x); t.disabled = false; t.textContent = '☁ Sign in to cloud'; }
      }
      if (t.id === 'csForgot') {
        const email = (document.getElementById('csEmail').value || '').trim();
        const err = document.getElementById('csErr');
        if (!email) { err.textContent = 'Type your cloud e-mail first, then click Forgot password.'; return; }
        try { await adapter.resetPassword(email); err.textContent = ''; global.U && U.toast('If that e-mail has a cloud account, a reset link is on its way.', 'ok'); }
        catch (x) { err.textContent = friendly(x); }
      }
      if (t.id === 'csNow') Sync.now();
      if (t.id === 'csOut') {
        if (global.U && !(await U.confirm('Sign out of cloud', 'Stop syncing this device? Its data stays here, and the cloud copy stays in Firebase. You can sign in again any time.', 'Sign out'))) return;
        await Sync.signOut();
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target.id === 'csPass' || e.target.id === 'csEmail')) document.getElementById('csSignIn')?.click(); });
  }

  /* ---------------- connect / disconnect ---------------- */
  function canStart() { return cfgOk && adapter && user && unlockedPw && !running; }
  function start() {
    if (!canStart()) { render(); return; }
    running = true; password = unlockedPw; mirror = {}; ready = new Set(); lastErr = null; decCache.clear();
    COLLS.forEach((c) => {
      mirror[c] = {};
      unsubs.push(adapter.listen(c, (changes, meta) => {
        changes.forEach((ch) => { if (ch.type === 'removed') delete mirror[c][ch.id]; else mirror[c][ch.id] = ch.data; });
        if (!meta.fromCache) { ready.add(c); offline = false; } else if (ready.has(c) && !navigator.onLine) offline = true;
        if (ready.size === COLLS.length) {
          if (c === 'app' && changes.some((ch) => ch.id === 'crypto') && key && mirror.app.crypto && mirror.app.crypto.k !== keyId) { key = null; keyId = null; }
          if (changes.length || !key) schedule(150);
        }
        render();
      }, (err) => { lastErr = friendly(err); console.error('cloud listen', c, err); render(); }));
    });
    render();
  }
  function stop() {
    unsubs.forEach((u) => { try { u(); } catch (_) { /* ignore */ } });
    unsubs = []; running = false; mirror = {}; ready = new Set(); key = null; keyId = null; password = null; keyProblem = null;
    clearTimeout(schedTimer); schedTimer = null; decCache.clear();
    render();
  }
  function schedule(ms) {
    if (!running) return;
    clearTimeout(schedTimer);
    schedTimer = setTimeout(() => { schedTimer = null; reconcile(); }, ms);
    render();
  }

  /* ---------------- encryption key ---------------- */
  const keyIdOf = (salt) => hash(salt).slice(-8);
  async function ensureKey() {
    if (key) return true;
    const c = mirror.app && mirror.app.crypto;
    if (!c) {
      // empty cloud: lock it with this device's password
      const k = await Store.deriveSyncKey(password, null);
      const check = await Store.encryptWithKey(k.key, { ok: 'thriftaholics' });
      key = k.key; keyId = keyIdOf(k.salt);
      const data = { v: 1, salt: k.salt, it: k.iterations, k: keyId, check: { iv: check.iv, ct: check.data }, u: Date.now() };
      mirror.app.crypto = data;
      await send([{ coll: 'app', id: 'crypto', data }]);
      return true;
    }
    const k = await Store.deriveSyncKey(password, c.salt);
    try { await Store.decryptWithKey(k.key, { iv: c.check.iv, data: c.check.ct }); key = k.key; keyId = c.k; keyProblem = null; return true; }
    catch (_) { /* different password */ }
    if (askingKey) return false;
    askingKey = true;
    keyProblem = 'The cloud copy is locked with a different app password. Click Sync now to enter it.';
    render();
    try {
      const nw = await api.passwordMismatch(password);
      if (!nw) return false;
      password = nw; unlockedPw = nw;
      const k2 = await Store.deriveSyncKey(nw, c.salt);
      await Store.decryptWithKey(k2.key, { iv: c.check.iv, data: c.check.ct });
      key = k2.key; keyId = c.k; keyProblem = null; decCache.clear();
      return true;
    } catch (_) { return false; }
    finally { askingKey = false; render(); }
  }
  async function encDoc(obj, u, extra) {
    const e = await Store.encryptWithKey(key, obj);
    return { u, d: false, k: keyId, iv: e.iv, ct: e.data, ...(extra || {}) };
  }
  async function dec(coll, id, C) {
    const ck = coll + '/' + id, hit = decCache.get(ck);
    if (hit && hit.ct === C.ct) return hit.v;
    const v = await Store.decryptWithKey(key, { iv: C.iv, data: C.ct });
    decCache.set(ck, { ct: C.ct, v });
    return v;
  }
  async function send(ops) {
    if (!ops.length) return;
    ops.forEach((o) => { if (o.data) mirror[o.coll][o.id] = o.data; else delete mirror[o.coll][o.id]; });
    pending++; render();
    try { await adapter.commit(ops); lastSync = new Date(); lastErr = null; }
    catch (e) { lastErr = friendly(e); console.error('cloud write', e); }
    finally { pending--; render(); }
  }

  /* ---------------- shrink images so they fit in one document ---------------- */
  async function shrinkDataURL(url, maxW, type) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const sc = Math.min(1, maxW / img.naturalWidth);
    const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return { url: cv.toDataURL(type || 'image/png', 0.85), w: cv.width, h: cv.height };
  }

  /* ---------------- reconcile local ↔ cloud ---------------- */
  async function reconcile() {
    if (!running || ready.size < COLLS.length) return;
    if (reconciling) { again = true; return; }
    reconciling = true; render();
    try {
      if (!(await ensureKey())) return;
      const seen = loadSeen();
      /* the cloud copy was erased from another device: clear this device's records too (once) */
      const R = mirror.app.reset;
      if (R && (seen.resetAt || 0) < R.u) {
        if (seen.linked) { await api.takeSnapshot('Before clearing data — the cloud copy was erased on another device'); await api.applyCloud({ wipe: true, items: { put: [], del: [], untomb: [] }, expenses: { put: [], del: [], untomb: [] }, mileage: { put: [], del: [], untomb: [] }, photos: { put: [], del: [] } }, password); seen.photos = {}; }
        seen.resetAt = R.u; saveSeen(seen);
      }
      const snap = await api.snapshot();
      const localCount = KINDS.reduce((n, k) => n + (snap[k] || []).length, 0);
      const cloudCount = KINDS.reduce((n, k) => n + Object.values(mirror[k]).filter((d) => !d.d).length, 0);
      let mode = 'normal';
      if (!seen.linked && localCount && cloudCount) {
        const r = await api.firstConnect({
          cloud: { items: Object.values(mirror.items).filter((d) => !d.d).length, expenses: Object.values(mirror.expenses).filter((d) => !d.d).length },
          local: { items: (snap.items || []).length, expenses: (snap.expenses || []).length }
        });
        if (!r) { await Sync.signOut(); return; }
        mode = r; // 'cloud' | 'combine'
        if (mode === 'cloud') await api.takeSnapshot('Before replacing this device’s data with the cloud copy');
      }
      const apply = { items: { put: [], del: [], untomb: [] }, expenses: { put: [], del: [], untomb: [] }, mileage: { put: [], del: [], untomb: [] }, photos: { put: [], del: [] } };
      const ops = [];
      const dels = {};
      /* records */
      for (const kind of KINDS) {
        const local = new Map((snap[kind] || []).map((r) => [r.id, r]));
        const tomb = (snap.tombstones || {})[kind] || {};
        const cloud = mirror[kind];
        const ids = new Set([...local.keys(), ...Object.keys(tomb), ...Object.keys(cloud)]);
        dels[kind] = [];
        for (const id of ids) {
          const L = local.get(id), C = cloud[id];
          if (C && !C.d && C.k && C.k !== keyId) continue; // re-locked by another device right now; wait for its new key
          let lt = L ? (L.updatedAt || 1) : (tomb[id] || 0);
          const ct = C ? (C.u || 0) : 0;
          if (mode === 'cloud') lt = 0;
          if (ct > lt || (mode === 'cloud' && L && !C)) {
            if (!C) { apply[kind].del.push({ id, t: 0 }); continue; }
            if (C.d) { if (L || !tomb[id]) apply[kind].del.push({ id, t: ct }); continue; }
            try { const rec = await dec(kind, id, C); rec.updatedAt = ct; apply[kind].put.push(rec); }
            catch (_) { if (L) ops.push({ coll: kind, id, data: await encDoc(L, lt) }); }
          } else if (lt > ct) {
            if (L) ops.push({ coll: kind, id, data: await encDoc(L, lt) });
            else if (C && !C.d) { ops.push({ coll: kind, id, data: { u: lt, d: true, k: keyId } }); dels[kind].push(id); }
            else if (C) ops.push({ coll: kind, id, data: { u: lt, d: true, k: keyId } });
          }
        }
      }
      /* safety: one change deleting lots of records everywhere (usually after restoring an old backup) */
      const big = KINDS.filter((k) => { const live = Object.values(mirror[k]).filter((d) => !d.d).length; return dels[k].length >= 5 && dels[k].length > live * 0.2; });
      if (big.length) {
        const what = big.map((k) => `${dels[k].length} ${k === 'items' ? 'items' : k === 'expenses' ? 'expenses' : 'mileage trips'}`).join(' and ');
        const yes = await api.confirmMassDelete(what);
        if (!yes) {
          for (const k of big) {
            const gone = new Set(dels[k]);
            for (let i = ops.length - 1; i >= 0; i--) if (ops[i].coll === k && gone.has(ops[i].id)) ops.splice(i, 1);
            for (const id of gone) { try { const C = mirror[k][id]; const rec = await dec(k, id, C); rec.updatedAt = C.u; apply[k].put.push(rec); apply[k].untomb.push(id); } catch (_) { /* skip */ } }
          }
        }
      }
      /* settings */
      const cS = mirror.app.settings, lS = snap.settings || {};
      if (!(cS && cS.k && cS.k !== keyId)) {
        // a device connecting for the first time takes the cloud's settings, so fresh defaults never overwrite them
        const lu = lS.updatedAt || 1, cu = cS ? cS.u || 0 : 0;
        if (cS && (cu > lu || mode === 'cloud' || !seen.linked)) { try { apply.settings = { ...(await dec('app', 'settings', cS)), updatedAt: cu }; } catch (_) { /* ignore */ } }
        else if (!cS || lu > cu) { const st = { ...lS }; LOCAL_ONLY.forEach((k) => delete st[k]); ops.push({ coll: 'app', id: 'settings', data: await encDoc(st, lu) }); }
      }
      /* blobs: photos, logo, reset questions — last-known state decides which side changed */
      seen.photos = seen.photos || {}; seen.blobs = seen.blobs || {};
      const liveItems = new Set([...(snap.items || []).map((i) => i.id), ...apply.items.put.map((i) => i.id)]);
      apply.items.del.forEach((d) => liveItems.delete(d.id));
      const blob = async (coll, id, localVal, toLocalHashable, seenMap, applyFn, fit) => {
        const C = mirror[coll][id];
        if (C && C.k && C.k !== keyId) return;
        const lh = localVal ? hash(toLocalHashable(localVal)) : '';
        const ch = C && !C.d ? C.h : '';
        const s = seenMap[id];
        if (lh === (s && s.l) && ch === (s && s.c)) return;
        let localWins;
        if (!s) localWins = !C;
        else localWins = lh !== s.l && ch === s.c;
        if (!C) localWins = true;   // nothing in the cloud yet: this device's copy goes up
        if (lh && ch && lh === ch) { seenMap[id] = { l: lh, c: ch }; return; }
        if (localWins) {
          if (localVal) {
            const up = await fit(localVal);
            if (!up) return;
            const data = await encDoc(up, Date.now(), { h: hash(toLocalHashable(up)) });
            if (JSON.stringify(data).length > MAX_DOC) { if (!oversizeWarned) { oversizeWarned = true; global.U && U.toast('A picture is too large to sync; it stays on this device.', 'err'); } return; }
            ops.push({ coll, id, data }); seenMap[id] = { l: lh, c: data.h };
          } else if (C) { ops.push({ coll, id, data: { u: Date.now(), d: true, k: keyId } }); seenMap[id] = { l: '', c: '' }; }
        } else if (C) {
          if (C.d) { await applyFn(null); seenMap[id] = { l: '', c: '' }; }
          else { try { const v = await dec(coll, id, C); await applyFn(v); seenMap[id] = { l: hash(toLocalHashable(v)), c: C.h }; } catch (_) { /* skip */ } }
        }
      };
      const photoIds = new Set([...Object.keys(snap.photos || {}), ...Object.keys(mirror.photos)]);
      for (const id of photoIds) {
        if (!liveItems.has(id)) { if (mirror.photos[id] && !(mirror.items[id] && !mirror.items[id].d)) ops.push({ coll: 'photos', id, data: null }); continue; }
        await blob('photos', id, (snap.photos || {})[id], (p) => p.thumb, seen.photos,
          async (v) => { if (v) apply.photos.put.push({ id, ...v }); else apply.photos.del.push(id); },
          async (p) => p);
      }
      await blob('app', 'logo', snap.logo, (l) => l.dataURL, seen.blobs,
        async (v) => { apply.logo = v; },
        async (l) => {
          if (l.dataURL.length < 600000) return l;
          const s = await shrinkDataURL(l.dataURL, 1000).catch(() => null);
          return s && s.url.length < 800000 ? { ...l, dataURL: s.url, width: s.w, height: s.h } : null;
        });
      await blob('app', 'recovery', snap.questionAnswers, (q) => JSON.stringify(q), seen.blobs,
        async (v) => { if (v) apply.recovery = v; },
        async (q) => q);
      /* apply cloud → this device, then this device → cloud */
      const touched = KINDS.some((k) => apply[k].put.length || apply[k].del.length || apply[k].untomb.length) || apply.photos.put.length || apply.photos.del.length || apply.settings || 'logo' in apply || apply.recovery;
      if (touched) await api.applyCloud(apply, password);
      seen.linked = true; saveSeen(seen);
      if (ops.length) await send(ops);
      if (!ops.length && !touched) lastSync = lastSync || new Date();
    } catch (e) {
      console.error('cloud sync', e); lastErr = friendly(e);
    } finally {
      reconciling = false; render();
      if (again) { again = false; schedule(200); }
    }
  }

  /* ---------------- public API ---------------- */
  const Sync = {
    async init(a) {
      api = a;
      if (inited) return; inited = true;
      wireCard();
      window.addEventListener('online', () => { offline = false; render(); if (running) schedule(500); });
      window.addEventListener('offline', () => { offline = true; render(); });
      cfg = global.FIREBASE_CONFIG || null;
      cfgOk = configured(cfg) || !!global.__cloudMock;
      if (!cfgOk) { render(); return; }
      adapter = global.__cloudMock || firebaseAdapter();
      try { await adapter.init(cfg); }
      catch (e) { loadErr = friendly(e); adapter = null; render(); return; }
      adapter.onAuth((u) => {
        const was = user && user.email;
        user = u; authKnown = true;
        if (!u) { stop(); return; }
        if (was && was !== u.email) stop();
        start();
      });
      render();
    },
    unlocked(pw) { unlockedPw = pw; start(); },
    lock() { unlockedPw = null; stop(); },
    changed() { if (!running || api.applying()) return; schedule(1500); },
    now() { lastErr = null; if (keyProblem) { keyProblem = null; key = null; } if (running) schedule(0); else start(); render(); return Promise.resolve(); },
    status: () => statusInfo(),
    signedIn: () => !!user,
    async signOut() { try { if (adapter) await adapter.signOut(); } catch (_) { /* ignore */ } user = null; stop(); },
    /** After a password change/reset on this device: re-lock the whole cloud copy with the new password. */
    async passwordChanged(oldPw, newPw) {
      unlockedPw = newPw;
      if (!running || ready.size < COLLS.length) { password = newPw; key = null; return; }
      while (reconciling) await new Promise((r) => setTimeout(r, 100));
      if (!key) { password = oldPw; if (!(await ensureKey())) { password = newPw; return; } }
      await reconcile();               // bring both sides level with the old key first
      password = newPw;
      const k = await Store.deriveSyncKey(newPw, null);
      const check = await Store.encryptWithKey(k.key, { ok: 'thriftaholics' });
      key = k.key; keyId = keyIdOf(k.salt); decCache.clear();
      const snap = await api.snapshot();
      const ops = [];
      for (const kind of KINDS) {
        for (const r of snap[kind] || []) ops.push({ coll: kind, id: r.id, data: await encDoc(r, r.updatedAt || 1) });
        for (const [id, t] of Object.entries((snap.tombstones || {})[kind] || {})) ops.push({ coll: kind, id, data: { u: t, d: true, k: keyId } });
      }
      const st = { ...(snap.settings || {}) }; LOCAL_ONLY.forEach((x) => delete st[x]);
      ops.push({ coll: 'app', id: 'settings', data: await encDoc(st, (snap.settings || {}).updatedAt || 1) });
      const seen = loadSeen(); seen.photos = {}; seen.blobs = {};
      for (const [id, p] of Object.entries(snap.photos || {})) { const d = await encDoc(p, Date.now(), { h: hash(p.thumb) }); if (JSON.stringify(d).length < MAX_DOC) { ops.push({ coll: 'photos', id, data: d }); seen.photos[id] = { l: d.h, c: d.h }; } }
      for (const [id, C] of Object.entries(mirror.photos)) if (!(snap.photos || {})[id] && C) ops.push({ coll: 'photos', id, data: null });
      if (snap.logo && mirror.app.logo && !mirror.app.logo.d) { const d = await encDoc(snap.logo, Date.now(), { h: hash(snap.logo.dataURL) }); if (JSON.stringify(d).length < MAX_DOC) { ops.push({ coll: 'app', id: 'logo', data: d }); seen.blobs.logo = { l: d.h, c: d.h }; } }
      if (snap.questionAnswers) { const d = await encDoc(snap.questionAnswers, Date.now(), { h: hash(JSON.stringify(snap.questionAnswers)) }); ops.push({ coll: 'app', id: 'recovery', data: d }); seen.blobs.recovery = { l: d.h, c: d.h }; }
      ops.push({ coll: 'app', id: 'crypto', data: { v: 1, salt: k.salt, it: k.iterations, k: keyId, check: { iv: check.iv, ct: check.data }, u: Date.now() } });
      saveSeen(seen);
      await send(ops);
    },
    /** Erase everything in the cloud (Settings → Erase all data). */
    async deleteRemote() {
      if (!running || ready.size < COLLS.length) throw new Error('Not connected to the cloud — sign in and wait for “Up to date” first.');
      // remove every record, then leave a "reset" note so every other signed-in device clears its copy too
      const ops = [];
      ['items', 'expenses', 'mileage', 'photos'].forEach((c) => Object.keys(mirror[c]).forEach((id) => ops.push({ coll: c, id, data: null })));
      ops.push({ coll: 'app', id: 'reset', data: { u: Date.now() } });
      await adapter.commit(ops);
      try { localStorage.removeItem(seenKey()); } catch (_) { /* ignore */ }
    },
    forgetDevice() { try { Object.keys(localStorage).filter((k) => k.startsWith('thrift-cloud:')).forEach((k) => localStorage.removeItem(k)); } catch (_) { /* ignore */ } }
  };
  global.Sync = Sync;
})(window);
