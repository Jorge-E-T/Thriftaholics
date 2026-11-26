/* =========================================================
   Encrypted IndexedDB storage
   - Password → PBKDF2-SHA256 (310,000 iterations) → AES-GCM 256 key
   - Every record (items, expenses, settings, logo) is encrypted
     individually before it is written to IndexedDB.
   - The key lives only in memory while unlocked and is not extractable.
   ========================================================= */
(function (global) {
  'use strict';

  const DB_NAME = 'inventory-ledger';
  const DB_VERSION = 2;
  const ITERATIONS = 310000;
  const VERIFIER = 'inventory-ledger:ok';
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let db = null;
  let key = null;

  /* ---------- IndexedDB plumbing ---------- */
  function openDB() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
        if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('expenses')) d.createObjectStore('expenses', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('vault')) d.createObjectStore('vault', { keyPath: 'k' });
        // v2: product photos (small thumbnail loaded at unlock, full image loaded on demand)
        if (!d.objectStoreNames.contains('thumbs')) d.createObjectStore('thumbs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
      };
      req.onsuccess = () => { db = req.result; db.onversionchange = () => { db.close(); db = null; }; resolve(db); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database is open in another tab. Close other tabs and retry.'));
    });
  }
  function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  function txDone(t) { return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction aborted')); }); }
  async function get(store, k) { const d = await openDB(); return reqP(d.transaction(store).objectStore(store).get(k)); }
  async function getAll(store) { const d = await openDB(); return reqP(d.transaction(store).objectStore(store).getAll()); }

  /* ---------- crypto ---------- */
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  const b64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(password, salt, iterations = ITERATIONS) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }
  async function encryptWith(k, obj) {
    const iv = rand(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obj)));
    return { iv, ct };
  }
  async function decryptWith(k, rec) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, k, rec.ct);
    return JSON.parse(dec.decode(pt));
  }
  function requireKey() { if (!key) throw new Error('Locked'); return key; }

  /* ---------- public API ---------- */
  const Store = {
    get unlocked() { return !!key; },

    async isSetUp() { return !!(await get('meta', 'auth')); },

    async setup(password) {
      const salt = rand(16);
      key = await deriveKey(password, salt);
      const verifier = await encryptWith(key, VERIFIER);
      const d = await openDB();
      const t = d.transaction('meta', 'readwrite');
      t.objectStore('meta').put({ k: 'auth', salt, iterations: ITERATIONS, verifier, created: Date.now() });
      await txDone(t);
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) { /* optional */ }
    },

    async unlock(password) {
      const auth = await get('meta', 'auth');
      if (!auth) throw new Error('Not set up');
      const k = await deriveKey(password, auth.salt, auth.iterations);
      try {
        const v = await decryptWith(k, auth.verifier);
        if (v !== VERIFIER) return false;
      } catch (_) { return false; }
      key = k;
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) { /* optional */ }
      return true;
    },

    lock() { key = null; },

    async loadAll() {
      const k = requireKey();
      const [items, expenses, vault, thumbs] = await Promise.all([getAll('items'), getAll('expenses'), getAll('vault'), getAll('thumbs')]);
      const out = { items: [], expenses: [], settings: null, logo: null, meta: {}, thumbs: {} };
      for (const r of thumbs) out.thumbs[r.id] = await decryptWith(k, r);
      for (const r of items) out.items.push(await decryptWith(k, r));
      for (const r of expenses) out.expenses.push(await decryptWith(k, r));
      for (const r of vault) {
        const v = await decryptWith(k, r);
        if (r.k === 'settings') out.settings = v;
        else if (r.k === 'logo') out.logo = v;
        else out.meta[r.k] = v;
      }
      return out;
    },

    async putMany(store, records) {
      const k = requireKey();
      const encrypted = [];
      for (const rec of records) encrypted.push({ id: rec.id, ...(await encryptWith(k, rec)) });
      const d = await openDB();
      const t = d.transaction(store, 'readwrite');
      const os = t.objectStore(store);
      encrypted.forEach((e) => os.put(e));
      await txDone(t);
    },
    putItem(item) { return Store.putMany('items', [item]); },
    putExpense(exp) { return Store.putMany('expenses', [exp]); },

    async deleteMany(store, ids) {
      const d = await openDB();
      const t = d.transaction(store, 'readwrite');
      ids.forEach((id) => t.objectStore(store).delete(id));
      await txDone(t);
    },

    async getVault(k) {
      const kk = requireKey();
      const r = await get('vault', k);
      return r ? decryptWith(kk, r) : null;
    },
    async putVault(k, value) {
      const kk = requireKey();
      const e = await encryptWith(kk, value);
      const d = await openDB();
      const t = d.transaction('vault', 'readwrite');
      if (value === null) t.objectStore('vault').delete(k);
      else t.objectStore('vault').put({ k, ...e });
      await txDone(t);
    },

    /* ---------- photos ---------- */
    /** photo: { thumb, full, w, h } (data URLs). */
    async putPhoto(id, photo) {
      const k = requireKey();
      const t = await encryptWith(k, { thumb: photo.thumb, w: photo.w, h: photo.h });
      const f = await encryptWith(k, { full: photo.full, w: photo.w, h: photo.h });
      const d = await openDB();
      const tx = d.transaction(['thumbs', 'photos'], 'readwrite');
      tx.objectStore('thumbs').put({ id, ...t });
      tx.objectStore('photos').put({ id, ...f });
      await txDone(tx);
    },
    async getPhoto(id) {
      const k = requireKey();
      const r = await get('photos', id);
      return r ? decryptWith(k, r) : null;
    },
    async deletePhotos(ids) {
      if (!ids.length) return;
      const d = await openDB();
      const tx = d.transaction(['thumbs', 'photos'], 'readwrite');
      ids.forEach((id) => { tx.objectStore('thumbs').delete(id); tx.objectStore('photos').delete(id); });
      await txDone(tx);
    },
    /** All photos decrypted: { id: { thumb, full, w, h } } (for backups / Excel). */
    async allPhotos() {
      const k = requireKey();
      const [thumbs, photos] = await Promise.all([getAll('thumbs'), getAll('photos')]);
      const out = {};
      for (const r of thumbs) out[r.id] = await decryptWith(k, r);
      for (const r of photos) { const v = await decryptWith(k, r); out[r.id] = { ...(out[r.id] || {}), full: v.full }; }
      return out;
    },

    /** Replace every record (used by backup restore). photos: { id: { thumb, full, w, h } } or null to keep existing. */
    async replaceAll({ items = [], expenses = [], settings = null, logo = null, meta = {}, photos = null }) {
      const k = requireKey();
      const encItems = [], encExp = [], encVault = [];
      for (const r of items) encItems.push({ id: r.id, ...(await encryptWith(k, r)) });
      for (const r of expenses) encExp.push({ id: r.id, ...(await encryptWith(k, r)) });
      if (settings) encVault.push({ k: 'settings', ...(await encryptWith(k, settings)) });
      if (logo) encVault.push({ k: 'logo', ...(await encryptWith(k, logo)) });
      for (const [mk, mv] of Object.entries(meta || {})) encVault.push({ k: mk, ...(await encryptWith(k, mv)) });
      const encT = [], encP = [];
      if (photos) {
        for (const [id, ph] of Object.entries(photos)) {
          if (!ph || !ph.thumb) continue;
          encT.push({ id, ...(await encryptWith(k, { thumb: ph.thumb, w: ph.w, h: ph.h })) });
          encP.push({ id, ...(await encryptWith(k, { full: ph.full || ph.thumb, w: ph.w, h: ph.h })) });
        }
      }
      const stores = ['items', 'expenses', 'vault', ...(photos ? ['thumbs', 'photos'] : [])];
      const keepRecovery = await get('vault', 'recoveryCode'); // never drop recovery data on restore/sync
      const keepAnswers = await get('vault', 'questionAnswers');
      const keepEmail = await get('vault', 'emailResetCode');
      const keepStash = await get('vault', 'invoiceStash');
      const d = await openDB();
      const t = d.transaction(stores, 'readwrite');
      stores.forEach((s) => t.objectStore(s).clear());
      if (keepRecovery) t.objectStore('vault').put(keepRecovery);
      if (keepAnswers) t.objectStore('vault').put(keepAnswers);
      if (keepEmail) t.objectStore('vault').put(keepEmail);
      if (keepStash) t.objectStore('vault').put(keepStash);
      encItems.forEach((e) => t.objectStore('items').put(e));
      encExp.forEach((e) => t.objectStore('expenses').put(e));
      encVault.forEach((e) => t.objectStore('vault').put(e));
      encT.forEach((e) => t.objectStore('thumbs').put(e));
      encP.forEach((e) => t.objectStore('photos').put(e));
      await txDone(t);
    },

    async changePassword(oldPass, newPass) {
      const auth = await get('meta', 'auth');
      const oldKey = await deriveKey(oldPass, auth.salt, auth.iterations);
      try { await decryptWith(oldKey, auth.verifier); } catch (_) { return false; }
      key = oldKey;
      const data = await Store.loadAll();
      const photos = await Store.allPhotos();
      const salt = rand(16);
      const newKey = await deriveKey(newPass, salt);
      const verifier = await encryptWith(newKey, VERIFIER);
      key = newKey;
      // write new auth + all re-encrypted data in one transaction
      const encItems = [], encExp = [], encVault = [];
      for (const r of data.items) encItems.push({ id: r.id, ...(await encryptWith(newKey, r)) });
      for (const r of data.expenses) encExp.push({ id: r.id, ...(await encryptWith(newKey, r)) });
      if (data.settings) encVault.push({ k: 'settings', ...(await encryptWith(newKey, data.settings)) });
      if (data.logo) encVault.push({ k: 'logo', ...(await encryptWith(newKey, data.logo)) });
      for (const [mk, mv] of Object.entries(data.meta)) encVault.push({ k: mk, ...(await encryptWith(newKey, mv)) });
      const encT = [], encP = [];
      for (const [id, ph] of Object.entries(photos)) {
        encT.push({ id, ...(await encryptWith(newKey, { thumb: ph.thumb, w: ph.w, h: ph.h })) });
        encP.push({ id, ...(await encryptWith(newKey, { full: ph.full || ph.thumb, w: ph.w, h: ph.h })) });
      }
      const d = await openDB();
      const t = d.transaction(['meta', 'items', 'expenses', 'vault', 'thumbs', 'photos'], 'readwrite');
      t.objectStore('meta').put({ k: 'auth', salt, iterations: ITERATIONS, verifier, created: auth.created, changed: Date.now() });
      ['items', 'expenses', 'vault', 'thumbs', 'photos'].forEach((s) => t.objectStore(s).clear());
      encT.forEach((e) => t.objectStore('thumbs').put(e));
      encP.forEach((e) => t.objectStore('photos').put(e));
      encItems.forEach((e) => t.objectStore('items').put(e));
      encExp.forEach((e) => t.objectStore('expenses').put(e));
      encVault.forEach((e) => t.objectStore('vault').put(e));
      await txDone(t);
      await Store.refreshRecovery(newPass);
      return true;
    },

    /* ---------- forgot-password recovery ----------
       A random recovery code (125 bits) locks a copy of the password ("escrow").
       The code itself is stored encrypted with your data, so it can be shown
       again while unlocked and re-used when the password changes. */
    newRecoveryCode() {
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const b = rand(25); let out = '';
      for (let i = 0; i < 25; i++) { out += A[b[i] % 32]; if (i % 5 === 4 && i < 24) out += '-'; }
      return out;
    },
    normCode: (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    async setupRecovery(password, code) {
      requireKey();
      code = code || Store.newRecoveryCode();
      const rsalt = rand(16);
      const k = await deriveKey(Store.normCode(code), rsalt);
      const escrow = await encryptWith(k, password);
      const d = await openDB();
      const t = d.transaction('meta', 'readwrite');
      t.objectStore('meta').put({ k: 'recovery', salt: rsalt, iterations: ITERATIONS, escrow, created: Date.now() });
      await txDone(t);
      await Store.putVault('recoveryCode', code);
      return code;
    },
    async hasRecovery() { return !!(await get('meta', 'recovery')); },
    async getRecoveryCode() { const k = requireKey(); const r = await get('vault', 'recoveryCode'); return r ? decryptWith(k, r) : null; },
    /** Returns the password locked by this recovery code, or null if the code is wrong. */
    async recoverPassword(code) {
      const rec = await get('meta', 'recovery');
      if (!rec) return null;
      try { const k = await deriveKey(Store.normCode(code), rec.salt, rec.iterations); return await decryptWith(k, rec.escrow); } catch (_) { return null; }
    },
    async refreshRecovery(password) {
      const code = await Store.getRecoveryCode().catch(() => null); if (code) await Store.setupRecovery(password, code);
      const qa = await Store.getQuestionAnswers().catch(() => null); if (qa) await Store.setupQuestions(password, qa.questions, qa.answers, true);
      const er = await get('meta', 'emailReset'); const ec = er ? await Store.getEmailResetCode().catch(() => null) : null;
      if (er && ec) await Store.setupEmailReset(password, ec, er);
    },

    /* ---------- reset by email ----------
       A random reset code locks a copy of the password on this device. The code
       itself is kept by the Gmail script in Andy's Google account (and, encrypted,
       in this device's vault so it survives password changes). When the password
       is forgotten, the script emails the code to the account owner; typing it in
       unlocks the copy. The device token below can only ask for that email. */
    async setupEmailReset(password, code, info) {
      requireKey();
      const salt = rand(16);
      const k = await deriveKey(Store.normCode(code), salt);
      const escrow = await encryptWith(k, password);
      const rec = { k: 'emailReset', salt, iterations: ITERATIONS, escrow, deviceId: info.deviceId, token: info.token, url: info.url, name: info.name || '', to: info.to || '', created: info.created || Date.now() };
      const d = await openDB();
      const t = d.transaction('meta', 'readwrite');
      t.objectStore('meta').put(rec);
      await txDone(t);
      await Store.putVault('emailResetCode', code);
    },
    async getEmailReset() { const r = await get('meta', 'emailReset'); if (!r) return null; const { escrow, salt, ...pub } = r; void escrow; void salt; return pub; },
    async getEmailResetCode() { const k = requireKey(); const r = await get('vault', 'emailResetCode'); return r ? decryptWith(k, r) : null; },
    async clearEmailReset() { const d = await openDB(); const t = d.transaction('meta', 'readwrite'); t.objectStore('meta').delete('emailReset'); await txDone(t); if (key) await Store.putVault('emailResetCode', null); },
    /** Returns the password locked by the emailed code, or null if the code is wrong. */
    async recoverWithEmailCode(code) {
      const rec = await get('meta', 'emailReset');
      if (!rec || Store.normCode(code).length < 16) return null;
      try { const k = await deriveKey(Store.normCode(code), rec.salt, rec.iterations); return await decryptWith(k, rec.escrow); } catch (_) { return null; }
    },

    /* ---------- security questions (answer any 2 of 3 to reset the password) ----------
       Each pair of answers locks its own copy of the password, so two correct
       answers are enough. Answers are compared without case, spaces or punctuation. */
    normAnswer: (a) => String(a || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(),
    async setupQuestions(password, questions, answers, alreadyNormalized) {
      requireKey();
      const ans = answers.map((a) => (alreadyNormalized ? a : Store.normAnswer(a)));
      const qsalt = rand(16);
      const escrows = [];
      for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
        const k = await deriveKey(ans[i] + '\u0001' + ans[j], qsalt);
        escrows.push({ i, j, ...(await encryptWith(k, password)) });
      }
      const d = await openDB();
      const t = d.transaction('meta', 'readwrite');
      t.objectStore('meta').put({ k: 'questions', questions, salt: qsalt, iterations: ITERATIONS, escrows, created: Date.now() });
      await txDone(t);
      await Store.putVault('questionAnswers', { questions, answers: ans });
    },
    async getQuestions() { const r = await get('meta', 'questions'); return r ? r.questions : null; },
    async getQuestionAnswers() { const k = requireKey(); const r = await get('vault', 'questionAnswers'); return r ? decryptWith(k, r) : null; },
    /** Returns the password if at least two answers are right, else null. */
    async recoverWithAnswers(answers) {
      const rec = await get('meta', 'questions');
      if (!rec) return null;
      const ans = answers.map(Store.normAnswer);
      for (const e of rec.escrows) {
        if (!ans[e.i] || !ans[e.j]) continue;
        try { const k = await deriveKey(ans[e.i] + '\u0001' + ans[e.j], rec.salt, rec.iterations); return await decryptWith(k, { iv: e.iv, ct: e.ct }); } catch (_) { /* try next pair */ }
      }
      return null;
    },
    async setHint(hint) { const d = await openDB(); const t = d.transaction('meta', 'readwrite'); if (hint) t.objectStore('meta').put({ k: 'hint', text: String(hint).slice(0, 120) }); else t.objectStore('meta').delete('hint'); await txDone(t); },
    async getHint() { const r = await get('meta', 'hint'); return r ? r.text : ''; },

    async wipe() {
      key = null;
      if (db) { db.close(); db = null; }
      await new Promise((res, rej) => {
        const r = indexedDB.deleteDatabase(DB_NAME);
        r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res();
      });
    },

    /** Check a password without changing the session. */
    async verify(password) {
      const auth = await get('meta', 'auth');
      if (!auth) return false;
      try { const k = await deriveKey(password, auth.salt, auth.iterations); return (await decryptWith(k, auth.verifier)) === VERIFIER; } catch (_) { return false; }
    },

    /* ---------- sync encryption (key kept in memory only) ---------- */
    async deriveSyncKey(password, saltB64) {
      const salt = saltB64 ? unb64(saltB64) : rand(16);
      return { key: await deriveKey(password, salt), salt: b64(salt), iterations: ITERATIONS };
    },
    async encryptWithKey(k, obj) { const { iv, ct } = await encryptWith(k, obj); return { iv: b64(iv), data: b64(ct) }; },
    async decryptWithKey(k, rec) { return decryptWith(k, { iv: unb64(rec.iv), ct: unb64(rec.data) }); },

    /* ---------- portable (backup) encryption ---------- */
    async encryptBackup(obj, password) {
      const salt = rand(16);
      const k = await deriveKey(password, salt);
      const { iv, ct } = await encryptWith(k, obj);
      return { format: 'inventory-ledger-backup', version: 1, encrypted: true, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(ct) };
    },
    async decryptBackup(file, password) {
      const k = await deriveKey(password, unb64(file.salt), file.iterations || ITERATIONS);
      return decryptWith(k, { iv: unb64(file.iv), ct: unb64(file.data) });
    }
  };

  global.Store = Store;
})(window);
