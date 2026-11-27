/* =========================================================
   Inventory & Sales Ledger — application
   ========================================================= */
(function () {
  'use strict';
  const { $, $$, esc } = U;

  /* ---------------- defaults ---------------- */
  const DEFAULT_SETTINGS = {
    companyName: 'Thriftaholics',
    theme: 'auto',
    viewMode: 'auto',
    showName: true,
    tagline: 'Inventory & Sales',
    currency: 'USD',
    agingDays: 90,
    staleDays: 180,
    incomeTaxRate: 12,
    seTaxRate: 15.3,
    salesTaxRate: 0,
    autoLockMin: 15,
    encryptBackup: false,
    categories: ['tops', 'bottoms', 'dress/romper/set', 'sweaters and jackets', 'intimates and sleep', 'shoes', 'accessories', 'bags'],
    platforms: ['poshmark', 'depop', 'ebay', 'mercari', 'facebook marketplace', 'vinted', 'in person'],
    statuses: ['available', 'pending', 'sold', 'returned', 'donated'],
    expenseCategories: ['Shipping supplies', 'Postage / labels', 'Platform subscriptions', 'Advertising / promotions', 'Cleaning & repair', 'Mileage / travel', 'Storage', 'Equipment', 'Software', 'Other'],
    hiddenCols: [],
    tableHeights: { inv: 'fit', ord: 'fit', exp: 'fit' },
    rowSize: 'comfortable',
    excelPhotos: true,
    celebrate: true,
    // 1. stale stock
    markdown: { steps: [{ days: 60, pct: 10 }, { days: 120, pct: 15 }, { days: 180, pct: 20 }], minGapDays: 21, relistDays: 60, decideDays: 365, deepDiscountPct: 40, rounding: 'whole' },
    // 3. listing text
    templates: {
      title: '{brand} {name} {size}',
      description: '{brand} {name}\nSize: {size}\nColor: {color}\nCondition: {condition}\nMaterial: {material}\nMeasurements: {measurements}\n\n{notes}\n\nSKU {sku} · Ships fast!'
    },
    conditions: ['New with tags', 'New without tags', 'Excellent', 'Good', 'Fair'],
    materials: ['Cotton', 'Polyester', 'Linen', 'Wool', 'Cashmere', 'Silk', 'Rayon', 'Viscose', 'Nylon', 'Spandex', 'Denim', 'Leather', 'Faux leather', 'Suede', 'Acrylic', 'Velvet', 'Corduroy', 'Satin', 'Lace', 'Modal', 'Lyocell'],
    // 7. backups / sync
    backupReminderDays: 7, backupSnoozeUntil: '', sync: { enabled: false, clientId: '', lastSync: '' },
    // 8. taxes & goals
    mileageRates: [{ from: '2025-01-01', rate: 0.70 }, { from: '2026-01-01', rate: 0.725 }, { from: '2026-07-01', rate: 0.76 }],
    taxPayments: [], goals: { sales: 0, profit: 0, items: 0 }, taxReminderDays: 21,
    labelFormat: 'avery5160',
    shopUrl: '', socialHandle: '', slipFormat: 'letter',
    thankYouMessage: 'Thank you for shopping secondhand with us. We hope you love it!',
    packages: [
      { id: 'pk-poly8', name: 'Poly mailer · up to 8 oz', oz: 8, cost: null },
      { id: 'pk-poly16', name: 'Poly mailer · up to 1 lb', oz: 16, cost: null },
      { id: 'pk-box2', name: 'Small box · up to 2 lb', oz: 32, cost: null },
      { id: 'pk-box5', name: 'Medium box · up to 5 lb', oz: 80, cost: null }
    ],
    routineOn: true,
    routine: [
      { id: 'rt-share', text: 'Share your Poshmark closet', on: true },
      { id: 'rt-offers', text: 'Send offers to likers / watchers', on: true },
      { id: 'rt-relist', text: 'Refresh or relist 5 stale items', on: true },
      { id: 'rt-new', text: 'List 3 new items', on: true },
      { id: 'rt-ship', text: 'Ship today’s orders', on: true }
    ],
    routineDone: {},
    milestones: {},
    invSort: [{ key: 'sku', dir: 'asc' }],
    ordSort: [{ key: 'dateSold', dir: 'desc' }],
    expSort: [{ key: 'date', dir: 'desc' }]
  };

  const state = { items: [], expenses: [], mileage: [], activity: [], redo: [], settings: U.clone(DEFAULT_SETTINGS), logo: null, meta: {}, thumbs: {}, selection: new Set(), undo: [] };
  const S = () => state.settings;

  /* ---------------- persistence ---------------- */
  let pending = 0;
  function saving(delta) {
    pending += delta;
    const el = $('#saveState');
    if (pending > 0) { el.textContent = 'Saving…'; el.classList.add('saving'); }
    else { el.textContent = 'All changes saved'; el.classList.remove('saving'); }
  }
  async function persist(fn) {
    saving(1);
    try { await fn(); } catch (e) { console.error(e); U.toast('Save failed: ' + e.message, 'err'); } finally { saving(-1); }
  }
  /* Each shared setting remembers when it last changed (settings._ts), so sync can merge the two
     devices' settings one by one instead of the newest copy replacing everything. */
  const SETTINGS_LOCAL = new Set(['sync', 'cloud', 'yourName', 'viewMode', 'theme', 'tableHeights', 'rowSize', 'invSort', 'invHideSold', 'invGroupSku', 'invSortSku', 'ordSort', 'expSort', 'mileSort', 'hiddenCols', 'backupSnoozeUntil', 'updatedAt', '_ts']);
  let settingsBase = {};
  function settingsBaseline() { settingsBase = {}; for (const [k, v] of Object.entries(state.settings || {})) if (!SETTINGS_LOCAL.has(k)) settingsBase[k] = JSON.stringify(v); }
  function stampSettings() {
    const now = Date.now(), ts = (state.settings._ts && typeof state.settings._ts === 'object') ? state.settings._ts : (state.settings._ts = {});
    for (const [k, v] of Object.entries(state.settings)) {
      if (SETTINGS_LOCAL.has(k)) continue;
      const j = JSON.stringify(v);
      if (settingsBase[k] !== j) { ts[k] = now; settingsBase[k] = j; }
    }
  }
  // backup for the sort-button row in Cards/Gallery: a mouse wheel scrolls it sideways when it overflows
  document.addEventListener('wheel', (e) => {
    const tr = e.target.closest && e.target.closest('.cards-mode .grid thead tr');
    if (!tr || tr.scrollWidth <= tr.clientWidth + 1 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const before = tr.scrollLeft; tr.scrollLeft += e.deltaY;
    if (tr.scrollLeft !== before) e.preventDefault();
  }, { passive: false });
  const saveSettings = U.debounce(() => { stampSettings(); state.settings.updatedAt = Date.now(); persist(() => Store.putVault('settings', state.settings)); if (window.Sync) Sync.changed(); }, 250);

  /** Apply item/expense changes with undo support. changes: [{ id, after }] (after=null deletes) */
  function commit(kind, changes, { undoable = true, label = '', log = true, keepRedo = false } = {}) {
    const who = myName();
    const list = kind === 'items' ? state.items : kind === 'mileage' ? state.mileage : state.expenses;
    const before = [];
    const puts = [], dels = [];
    changes.forEach(({ id, after }) => {
      const idx = list.findIndex((x) => x.id === id);
      before.push({ id, rec: idx >= 0 ? U.clone(list[idx]) : null });
      if (after) {
        after.updatedAt = Date.now(); if (log) after.editedBy = who;
        // price history: record every selling-price change (not when undoing)
        if (kind === 'items' && idx >= 0 && undoable && list[idx].sellingPrice !== after.sellingPrice && after.sellingPrice != null && list[idx].sellingPrice != null) {
          after.priceHistory = [...(after.priceHistory || list[idx].priceHistory || []), { date: U.todayISO(), from: list[idx].sellingPrice, to: after.sellingPrice, reason: after._priceReason || label || 'edit', by: who }].slice(-30);
        }
        delete after._priceReason;
        if (idx >= 0) list[idx] = after; else list.push(after);
        puts.push(after);
      } else if (idx >= 0) { list.splice(idx, 1); dels.push(id); }
    });
    // deletions are remembered (tombstones) so sync can apply them on other devices
    if (dels.length) { const t = (state.meta.tombstones ||= {}); t[kind] = { ...(t[kind] || {}) }; dels.forEach((id) => { t[kind][id] = Date.now(); }); Store.putVault('tombstones', t).catch(() => {}); }
    puts.forEach((r) => { const t = state.meta.tombstones && state.meta.tombstones[kind]; if (t && t[r.id]) delete t[r.id]; });
    if (log) logActivity(kind, before, changes, label, who);
    if (window.Ext && Ext.afterCommit) Ext.afterCommit(kind, changes, label);
    if (window.Sync) Sync.changed();
    if (undoable) { state.undo.push({ kind, before, label, ids: changes.map((c) => c.id) }); if (state.undo.length > 50) state.undo.shift(); if (!keepRedo) state.redo = []; }
    updateUndoUI();
    persist(async () => {
      if (kind === 'mileage') { await Store.putVault('mileage', state.mileage); return; }
      if (puts.length) await Store.putMany(kind, puts);
      if (dels.length) await Store.deleteMany(kind, dels);
    });
  }
  const listOf = (kind) => (kind === 'items' ? state.items : kind === 'mileage' ? state.mileage : state.expenses);
  const stepName = (step) => {
    const l = String(step.label || '').replace(/^edit /, 'edit ');
    const n = step.before.length;
    const noun = step.kind === 'items' ? 'items' : step.kind === 'mileage' ? 'trips' : 'expenses';
    if (l) return n > 1 && !/\d/.test(l) ? `${l} (${n} ${noun})` : l;
    return n > 1 ? `change ${n} ${noun}` : 'last change';
  };
  function undo() {
    if (!$('#modal').classList.contains('hidden')) return;
    const step = state.undo.pop();
    if (!step) { U.toast('Nothing to undo'); updateUndoUI(); return; }
    const list = listOf(step.kind);
    // remember how things are now, so Redo can put them back
    state.redo.push({ kind: step.kind, label: step.label, after: step.before.map(({ id }) => ({ id, rec: (() => { const r = list.find((x) => x.id === id); return r ? U.clone(r) : null; })() })) });
    if (state.redo.length > 50) state.redo.shift();
    commit(step.kind, step.before.map(({ id, rec }) => ({ id, after: rec ? U.clone(rec) : null })), { undoable: false, label: 'undo' + (step.label ? ': ' + step.label : '') });
    renderAll(); updateUndoUI();
    U.toast('Undone: ' + stepName(step), 'ok');
  }
  function redo() {
    if (!$('#modal').classList.contains('hidden')) return;
    const step = state.redo.pop();
    if (!step) { U.toast('Nothing to redo'); updateUndoUI(); return; }
    commit(step.kind, step.after.map(({ id, rec }) => ({ id, after: rec ? U.clone(rec) : null })), { label: step.label ? 'redo: ' + step.label : 'redo', keepRedo: true });
    // keep the original label on the new undo step
    const top = state.undo[state.undo.length - 1]; if (top) top.label = step.label;
    renderAll(); updateUndoUI();
    U.toast('Redone: ' + stepName({ ...step, before: step.after }), 'ok');
  }
  function updateUndoUI() {
    const dock = $('#undoDock'); if (!dock) return;
    const u = state.undo[state.undo.length - 1], r = state.redo[state.redo.length - 1];
    const mod = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
    $('#btnUndo').disabled = !u; $('#btnRedo').disabled = !r;
    $('#undoWhat').textContent = u ? stepName(u) : 'Nothing to undo';
    $('#btnUndo').title = u ? `Undo: ${stepName(u)} (${mod}+Z)` : 'Nothing to undo yet';
    $('#btnRedo').title = r ? `Redo: ${stepName({ ...r, before: r.after })} (${mod}+Shift+Z)` : 'Nothing to redo';
    const c = $('#undoCount'); c.textContent = state.undo.length > 1 ? state.undo.length : ''; c.classList.toggle('hidden', state.undo.length < 2);
    if (u && updateUndoUI.lastLen !== undefined && state.undo.length > updateUndoUI.lastLen) { dock.classList.remove('pop'); void dock.offsetWidth; dock.classList.add('pop'); }
    updateUndoUI.lastLen = state.undo.length;
  }


  /* =========================================================
     Activity history — who changed what (synced between users)
     ========================================================= */
  const ACT_DAYS = 365, ACT_MAX = 3000, ACT_GROUP = 25;
  const FIELD_LABEL = { name: 'name', category: 'category', sku: 'SKU', purchasePrice: 'cost', sellingPrice: 'price', status: 'status', platform: 'platform', datePosted: 'date listed', dateSold: 'date sold',
    totalAfterFees: 'after-fees total', shippingCost: 'shipping', notes: 'notes', listings: 'listings', brand: 'brand', size: 'size', color: 'color', condition: 'condition', material: 'material', measurements: 'measurements',
    weight: 'weight', location: 'location', source: 'source', purchaseDate: 'purchase date', minPrice: 'lowest price', bundle: 'bundle', lastRelisted: 'relisted', disposedDate: 'write-off date',
    date: 'date', vendor: 'vendor', description: 'description', amount: 'amount', payment: 'payment', purpose: 'purpose', from: 'from', to: 'to', miles: 'miles', roundTrip: 'round trip' };
  const MONEY_F = new Set(['purchasePrice', 'sellingPrice', 'totalAfterFees', 'shippingCost', 'minPrice', 'amount']);
  function myName() {
    const n = (S().yourName || '').trim();
    if (n) return n;
    const e = window.Sync && Sync.email && Sync.email();
    if (e) { const l = e.split('@')[0].replace(/[._\d]+/g, ' ').trim(); return l ? l.charAt(0).toUpperCase() + l.slice(1) : e; }
    return 'This device';
  }
  const recTitle = (kind, r) => !r ? '' : kind === 'items' ? (r.name || (r.sku ? 'SKU ' + r.sku : 'an item')) : kind === 'expenses' ? (r.description || r.vendor || r.category || 'an expense') : `${r.miles || 0} mi trip${r.purpose ? ' (' + r.purpose + ')' : ''}`;
  const fmtVal = (f, v) => v === null || v === undefined || v === '' ? '—' : MONEY_F.has(f) ? U.money(v) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : Array.isArray(v) ? `${v.length}` : String(v).slice(0, 60);
  function diffRec(a, b) {
    const out = [];
    for (const f of Object.keys(FIELD_LABEL)) {
      if (!(f in a) && !(f in b)) continue;
      const x = a[f], y = b[f];
      if (JSON.stringify(x ?? '') === JSON.stringify(y ?? '')) continue;
      out.push({ f, from: f === 'listings' ? (x || []).map((l) => l.platform + ':' + l.status).join(', ') : x ?? null, to: f === 'listings' ? (y || []).map((l) => l.platform + ':' + l.status).join(', ') : y ?? null });
    }
    return out;
  }
  function describe(e) {
    const what = e.kind === 'items' ? '' : e.kind === 'expenses' ? 'expense ' : 'mileage ';
    if (e.kind === 'platforms') return e.label;
    if (e.n) return `${e.label || 'changed'} — ${e.n} ${e.kind === 'items' ? 'items' : e.kind === 'expenses' ? 'expenses' : 'trips'}`;
    if (e.act === 'added') return `added ${what}“${e.title}”`;
    if (e.act === 'deleted') return `deleted ${what}“${e.title}”`;
    const c = e.changes || [];
    const sold = c.find((x) => x.f === 'status' && x.to === 'sold');
    if (sold) { const p = c.find((x) => x.f === 'sellingPrice'); return `marked “${e.title}” sold${p ? ' for ' + U.money(p.to) : ''}`; }
    if (c.length === 1 && c[0].f === 'sellingPrice') return `changed the price of “${e.title}” ${fmtVal('sellingPrice', c[0].from)} → ${fmtVal('sellingPrice', c[0].to)}`;
    if (c.length === 1) return `changed ${FIELD_LABEL[c[0].f]} of “${e.title}” to ${fmtVal(c[0].f, c[0].to)}`;
    return `edited ${what}“${e.title}” (${c.slice(0, 3).map((x) => FIELD_LABEL[x.f]).join(', ')}${c.length > 3 ? ` +${c.length - 3}` : ''})`;
  }
  function logActivity(kind, before, changes, label, who) {
    const t = Date.now();
    const entries = [];
    if (changes.length > ACT_GROUP) {
      entries.push({ id: U.uid(), t, who, kind, n: changes.length, label: label || 'bulk change' });
    } else {
      changes.forEach(({ id, after }, i) => {
        const prev = before[i] && before[i].rec;
        if (!prev && !after) return;
        const act = !prev ? 'added' : !after ? 'deleted' : 'edited';
        const e = { id: U.uid(), t, who, kind, rid: id, act, title: recTitle(kind, after || prev), label: label || '' };
        if (act === 'edited') { e.changes = diffRec(prev, after); if (!e.changes.length) return; }
        if (prev) { const b = U.clone(prev); delete b.priceHistory; e.before = b; }
        if (after && act === 'added') e.after = { updatedAt: after.updatedAt };
        entries.push(e);
      });
    }
    if (!entries.length) return;
    addActivity(entries);
  }
  function addActivity(entries) {
    const have = new Set(state.activity.map((e) => e.id));
    entries.forEach((e) => { if (e && e.id && !have.has(e.id)) { state.activity.push(e); have.add(e.id); } });
    const cut = Date.now() - ACT_DAYS * 864e5;
    state.activity = state.activity.filter((e) => e.t > cut).sort((a, b) => a.t - b.t).slice(-ACT_MAX);
    persist(() => Store.putVault('activity', state.activity));
    if ($('#view-dashboard') && $('#view-dashboard').classList.contains('active')) renderActivityFeed();
  }
  function activityFor(id) {
    return state.activity.filter((e) => e.rid === id).map((e) => ({ t: e.t, by: e.who, text: describe(e), priceOnly: !!(e.changes && e.changes.length && e.changes.every((c) => c.f === 'sellingPrice')) }));
  }
  const PALETTE = ['#2a7a70', '#c9952e', '#6b6fa8', '#c2413b', '#3f7fb5', '#8a5a9e'];
  const whoColor = (n) => PALETTE[[...String(n)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  const avatar = (n) => `<span class="av" style="--av:${whoColor(n)}">${esc(String(n || '?').trim().charAt(0).toUpperCase())}</span>`;
  function actRow(e, withRevert) {
    const can = withRevert && !e.n && (e.before || e.act === 'added');
    const open = e.kind === 'items' && e.rid && findItem(e.rid) ? ` data-sheet="${esc(e.rid)}"` : '';
    return `<li class="act"${open}>${avatar(e.who)}<div class="act-t"><b>${esc(e.who)}</b> ${esc(describe(e))}${e.label && /^undo|^revert/.test(e.label) ? ` <span class="muted">(${esc(e.label)})</span>` : ''}
      <span class="act-when" title="${esc(new Date(e.t).toLocaleString())}">${esc(timeAgo(e.t))}</span></div>${can ? `<button class="btn btn-sm btn-ghost" type="button" data-revert="${esc(e.id)}" title="Put this record back the way it was before this change">Revert</button>` : ''}</li>`;
  }
  function renderActivityFeed() {
    const box = $('#activityFeed'); if (!box) return;
    const list = state.activity.slice(-7).reverse();
    box.innerHTML = list.length ? `<ul class="acts">${list.map((e) => actRow(e, false)).join('')}</ul>`
      : Dash.empty('No activity yet', 'Changes you and anyone you sync with make will show up here.', '🕘');
    if (!(S().yourName || '').trim()) box.insertAdjacentHTML('beforeend', `<p class="muted small act-nudge">Changes made here are labeled “${esc(myName())}”. <button type="button" class="linklike" data-goto-name>Set your name</button></p>`);
  }
  async function revertActivity(e) {
    const kind = e.kind;
    const list = kind === 'items' ? state.items : kind === 'expenses' ? state.expenses : state.mileage;
    const cur = list.find((x) => x.id === e.rid);
    const later = state.activity.filter((x) => x.rid === e.rid && x.t > e.t).length;
    const msg = e.act === 'added' ? `Remove “${esc(e.title)}” again (undo adding it)?`
      : e.act === 'deleted' ? `Bring back “${esc(e.title)}”?`
      : `Put “${esc(e.title)}” back the way it was before ${esc(e.who)}’s change on ${esc(new Date(e.t).toLocaleString())}?`;
    const warn = later ? `<p class="muted small">⚠️ It was changed ${later} more time${later === 1 ? '' : 's'} after this; those later changes will be replaced too.</p>` : '';
    if (!(await U.confirm('Revert change', `<p>${msg}</p>${warn}<p class="muted small">You can undo the revert, too.</p>`, 'Revert'))) return false;
    let after = null;
    if (e.act !== 'added') {
      after = U.clone(e.before);
      if (cur && kind === 'items') after.priceHistory = cur.priceHistory || [];
    }
    if (e.act === 'added' && !cur) { U.toast('That record is already gone.'); return false; }
    commit(kind, [{ id: e.rid, after }], { label: 'revert' });
    renderAll(); U.toast('Reverted', 'ok');
    return true;
  }
  function openActivityLog() {
    const people = [...new Set(state.activity.map((e) => e.who))].sort();
    const body = `<div class="act-filters">
        <select id="actWho"><option value="">Everyone</option>${people.map((p) => `<option>${esc(p)}</option>`).join('')}</select>
        <select id="actKind"><option value="">Everything</option><option value="items">Inventory</option><option value="expenses">Expenses</option><option value="mileage">Mileage</option></select>
        <input type="search" id="actQ" placeholder="Search…"></div>
      <div id="actList" class="act-scroll"></div>
      <p class="muted small">Kept for one year. ${window.Sync && Sync.signedIn && Sync.signedIn() ? 'Shared with everyone signed in to your cloud sync.' : 'Turn on cloud sync to share it with your other devices and users.'}</p>`;
    const draw = (root) => {
      const who = $('#actWho', root).value, kind = $('#actKind', root).value, q = $('#actQ', root).value.trim().toLowerCase();
      const rows = state.activity.filter((e) => (!who || e.who === who) && (!kind || e.kind === kind) && (!q || (e.who + ' ' + describe(e)).toLowerCase().includes(q))).slice(-300).reverse();
      let day = '';
      $('#actList', root).innerHTML = rows.length ? `<ul class="acts">${rows.map((e) => { const d = new Date(e.t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); const h = d !== day ? `<li class="act-day">${esc(d)}</li>` : ''; day = d; return h + actRow(e, true); }).join('')}</ul>` : Dash.empty('Nothing matches', 'Try another person or filter.', '🔎');
    };
    U.modal({ title: 'Activity history', wide: true, body, buttons: [{ label: 'Close', value: null, cls: 'btn-ghost' }], onOpen: (root) => {
      draw(root);
      ['#actWho', '#actKind'].forEach((s) => $(s, root).addEventListener('change', () => draw(root)));
      $('#actQ', root).addEventListener('input', U.debounce(() => draw(root), 120));
      $('#actList', root).addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-revert]'); if (!b) return;
        ev.stopPropagation();
        const e = state.activity.find((x) => x.id === b.dataset.revert);
        if (e) { await revertActivity(e); openActivityLog(); }
      }, true);
    } });
  }

  /* =========================================================
     Generic editable, sortable grid
     ========================================================= */
  function createGrid(o) {
    const table = o.table;
    const thead = table.tHead, tbody = table.tBodies[0], tfoot = table.tFoot;
    let rowsCache = [];

    const visibleCols = () => o.columns.filter((c) => !(o.hidden && o.hidden().includes(c.key)));
    /* phones show each row as a card: a title, then the most useful fields (o.phoneCols) in two columns */
    const phoneSet = o.phoneCols ? new Set(o.phoneCols) : null;
    const titleKey = () => o.titleKey || (o.phoneCols && o.phoneCols[0]) || (visibleCols()[0] || {}).key;
    /** card position of each visible column: the title, then phoneCols in their listed order, two per line */
    function phoneLayout() {
      const t = titleKey(), keep = o.phoneKeep || [];
      const cols = visibleCols().filter((c) => c.key !== t && !keep.includes(c.key) && (!phoneSet || phoneSet.has(c.key)));
      if (o.phoneCols) cols.sort((a, b) => o.phoneCols.indexOf(a.key) - o.phoneCols.indexOf(b.key));
      const m = {}; cols.forEach((c, i) => { m[c.key] = { cls: i % 2 ? 'f-b' : 'f-a', order: i }; });
      // fields that stay visible on a closed card (e.g. status, price, SKU), in one line under the title
      keep.filter((k) => visibleCols().some((c) => c.key === k)).forEach((k, i) => { m[k] = { cls: 'f-k f-k' + (i + 1), order: -9 + i }; });
      m[t] = { cls: 'f-first', order: -10 };
      return m;
    }
    const isPhone = () => document.documentElement.classList.contains('cards-mode');
    const openCards = new Set();
    const photoOn = () => !!o.photo && !(o.hidden && o.hidden().includes('_photo'));
    const CAMERA = '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
    function photoCell(r) {
      const t = o.photo.get(r);
      return `<td class="col-photo" data-photo>${o.photo.badge ? o.photo.badge(r) : ''}<div class="thumb ${t ? 'has' : ''}" title="${t ? 'Click to view / replace · drop a new image to replace' : 'Click to upload or drag & drop an image'}">${t ? `<img src="${t}" alt="" loading="lazy" draggable="false">` : `${CAMERA}<span>Add photo</span>`}</div></td>`;
    }
    /** Freeze checkbox, photo and columns up to o.sticky on the left while scrolling sideways. */
    function applySticky() {
      const hr = thead.rows[0];
      if (!hr) return;
      let n = (o.selectable ? 1 : 0) + (photoOn() ? 1 : 0);
      if (o.sticky) { const i = visibleCols().findIndex((c) => c.key === o.sticky); if (i >= 0) n += i + 1; }
      if (!n) return;
      // offsets from widths (offsetLeft is unreliable once a cell is already sticky)
      const lefts = []; let acc = 0;
      Array.from(hr.cells).slice(0, n).forEach((c) => { lefts.push(acc); acc += c.getBoundingClientRect().width; });
      Array.from(table.rows).forEach((tr) => {
        if (tr.cells.length < n || (tr.cells[0] && tr.cells[0].colSpan > 1)) return;
        for (let i = 0; i < n; i++) {
          const c = tr.cells[i];
          c.classList.add('stk'); c.classList.toggle('stk-last', i === n - 1);
          c.style.left = lefts[i] + 'px';
        }
      });
    }
    const val = (c, r) => (c.get ? c.get(r) : r[c.key]);

    function display(c, r) {
      if (c.render) return c.render(r);
      const v = val(c, r);
      switch (c.type) {
        case 'money': return v === null || v === undefined || v === '' ? '<span class="muted">—</span>' : esc(U.money(v));
        case 'date': return v ? esc(U.fmtDate(v)) : '<span class="muted">—</span>';
        case 'int': return v === null || v === undefined ? '<span class="muted">—</span>' : esc(U.int(v));
        case 'pct': return v === null || v === undefined ? '<span class="muted">—</span>' : esc(U.pct(v));
        case 'dec': return v === null || v === undefined ? '<span class="muted">—</span>' : esc((+v).toFixed(1));
        default: return v === null || v === undefined || v === '' ? '' : esc(v);
      }
    }
    function cmp(a, b, c) {
      let x = val(c, a), y = val(c, b);
      const ex = x === null || x === undefined || x === '', ey = y === null || y === undefined || y === '';
      if (ex && ey) return 0; if (ex) return 1; if (ey) return -1;
      if (typeof x === 'number' && typeof y === 'number') return x - y;
      return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
    }
    function sorted(rows) {
      const sort = o.getSort();
      // o.group: rows are kept in groups (e.g. active items before sold ones), whatever the column sort
      if (!sort.length && !o.groupCmp && !o.defaultSort) return rows;
      const cols = sort.map((s) => ({ c: o.columns.find((c) => c.key === s.key), d: s.dir === 'desc' ? -1 : 1 })).filter((x) => x.c);
      return [...rows].sort((a, b) => {
        if (o.groupCmp) { const g = o.groupCmp(a, b); if (g) return g; }
        for (const { c, d } of cols) {
          const r = cmp(a, b, c);
          if (r !== 0) { const ea = val(c, a), eb = val(c, b); const empty = (v) => v === null || v === undefined || v === ''; return (empty(ea) || empty(eb)) ? r : r * d; }
        }
        return o.defaultSort ? o.defaultSort(a, b) : 0;
      });
    }

    function headHTML() {
      const sort = o.getSort();
      const cols = visibleCols();
      let h = '<tr>';
      if (o.selectable) h += `<th class="col-check nosort"><div class="th"><input type="checkbox" data-checkall aria-label="Select all"></div></th>`;
      if (photoOn()) h += '<th class="col-photo nosort"><div class="th">Photo</div></th>';
      cols.forEach((c) => {
        const si = sort.findIndex((s) => s.key === c.key);
        const ind = si >= 0 ? `${sort[si].dir === 'asc' ? '▲' : '▼'}${sort.length > 1 ? `<sup>${si + 1}</sup>` : ''}` : '';
        const isNum = ['money', 'int', 'pct', 'dec'].includes(c.type);
        h += `<th class="${isNum ? 'num' : ''} ${c.computed ? 'computed' : ''} ${phoneSet && !phoneSet.has(c.key) && c.key !== titleKey() ? 'm-off' : ''}" style="${c.width ? `min-width:${c.width}px` : ''}" data-sort="${c.key}" title="${c.computed ? 'Calculated' : 'Click to sort · Shift+click to add'}"><div class="th">${esc(c.label)}<span class="sort">${ind}</span></div></th>`;
      });
      if (o.actions) h += '<th class="col-actions nosort"><div class="th"></div></th>';
      return h + '</tr>';
    }
    function rowInner(r) {
      const cols = visibleCols();
      let h = '';
      if (o.selectable) h += `<td class="col-check"><input type="checkbox" data-check ${o.selection.has(r.id) ? 'checked' : ''} aria-label="Select row"></td>`;
      if (photoOn()) h += photoCell(r);
      const pl = phoneLayout();
      cols.forEach((c) => {
        const isNum = ['money', 'int', 'pct', 'dec'].includes(c.type);
        const ro = c.computed || c.readonly;
        const p = pl[c.key] || { cls: 'm-off', order: 99 };
        h += `<td class="${isNum ? 'num' : ''} ${ro ? 'ro' : 'ed'} ${p.cls}" style="--o:${p.order}" data-key="${c.key}" data-label="${esc(c.label)}"><span class="cell" title="${ro ? '' : 'Click to edit'}">${display(c, r)}</span></td>`;
      });
      if (o.actions) {
        h += '<td class="col-actions"><div class="row-actions">' + o.actions.filter((a) => !a.show || a.show(r)).map((a, i) =>
          `<button type="button" data-act="${o.actions.indexOf(a)}" title="${esc(a.title)}" class="${a.cls || ''}">${a.icon}</button>`).join('') + '</div></td>';
      }
      return h;
    }
    function rowClass(r) { return (o.rowClass ? o.rowClass(r) : '') + (o.selection && o.selection.has(r.id) ? ' selected' : '') + (openCards.has(r.id) ? ' open' : ''); }

    function footHTML(rows) {
      if (!o.footer) return '';
      const cols = visibleCols();
      let h = '<tr>';
      if (o.selectable) h += '<td></td>';
      if (photoOn()) h += '<td></td>';
      let labelPlaced = false;
      cols.forEach((c) => {
        const isNum = ['money', 'int', 'pct', 'dec'].includes(c.type);
        let content = '';
        if (c.total) {
          // o.totalRows: totals can cover rows that are only hidden from view; c.totalIf: which rows a total counts
          const vals = (o.totalRows ? o.totalRows() : rows).filter((r) => !c.totalIf || c.totalIf(r)).map((r) => val(c, r)).filter((v) => typeof v === 'number');
          let t = c.total === 'avg' ? (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null) : vals.reduce((a, b) => a + b, 0);
          content = c.type === 'money' ? U.money0(t) : c.type === 'dec' ? (+t || 0).toFixed(1) : c.type === 'int' ? (t === null ? '—' : (c.total === 'avg' ? 'avg ' : '') + U.int(t)) : U.int(t);
          if (c.totalLabel) content = `<span class="muted small" style="font-weight:500">${c.totalLabel}</span><br>${content}`;
        } else if (!labelPlaced) { content = `Totals · ${rows.length} row${rows.length === 1 ? '' : 's'}`; labelPlaced = true; }
        h += `<td class="${isNum ? 'num' : ''} ${c.total && !c.totalLabel ? 'ft-l' : ''}" ${c.total && !c.totalLabel ? `data-label="${esc(c.label)}"` : ''}>${content}</td>`;
      });
      if (o.actions) h += '<td></td>';
      return h + '</tr>';
    }

    function render() {
      rowsCache = sorted(o.rows());
      table.classList.toggle('m-nophoto', !photoOn()); table.classList.toggle('m-nosel', !o.selectable);
      thead.innerHTML = headHTML();
      if (!rowsCache.length) {
        const span = visibleCols().length + (o.selectable ? 1 : 0) + (photoOn() ? 1 : 0) + (o.actions ? 1 : 0);
        tbody.innerHTML = `<tr><td colspan="${span}"><div class="empty">${o.emptyText || 'No rows'}</div></td></tr>`;
      } else {
        tbody.innerHTML = rowsCache.map((r, i) => `<tr data-id="${esc(r.id)}" class="${rowClass(r)}${o.groupClass && i > 0 ? o.groupClass(r, rowsCache[i - 1]) : ''}">${rowInner(r)}</tr>`).join('');
      }
      tfoot.innerHTML = footHTML(rowsCache);
      applySticky();
      syncCheckAll();
      if (o.afterRender) o.afterRender(rowsCache);
    }
    function refreshRow(id) {
      const tr = tbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
      const r = o.find(id);
      if (!tr || !r) { render(); return; }
      tr.className = rowClass(r);
      tr.innerHTML = rowInner(r);
      tfoot.innerHTML = footHTML(rowsCache.map((x) => o.find(x.id)).filter(Boolean));
      applySticky();
    }
    function syncCheckAll() {
      if (!o.selectable) return;
      const ca = thead.querySelector('[data-checkall]');
      if (!ca) return;
      const ids = rowsCache.map((r) => r.id);
      const n = ids.filter((id) => o.selection.has(id)).length;
      ca.checked = n > 0 && n === ids.length; ca.indeterminate = n > 0 && n < ids.length;
    }

    /* --- sorting --- */
    thead.addEventListener('click', (e) => {
      if (e.target.matches('[data-checkall]')) {
        const on = e.target.checked;
        rowsCache.forEach((r) => (on ? o.selection.add(r.id) : o.selection.delete(r.id)));
        render(); o.onSelect && o.onSelect();
        return;
      }
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const key = th.dataset.sort;
      let sort = [...o.getSort()];
      const i = sort.findIndex((s) => s.key === key);
      if (e.shiftKey) {
        if (i < 0) sort.push({ key, dir: 'asc' });
        else if (sort[i].dir === 'asc') sort[i] = { key, dir: 'desc' };
        else sort.splice(i, 1);
      } else {
        if (i < 0 || sort.length > 1) sort = [{ key, dir: 'asc' }];
        else if (sort[i].dir === 'asc') sort = [{ key, dir: 'desc' }];
        else sort = [];
      }
      o.setSort(sort);
      render();
    });

    /* --- selection + actions --- */
    tbody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      if (e.target.matches('[data-check]')) {
        e.target.checked ? o.selection.add(id) : o.selection.delete(id);
        tr.classList.toggle('selected', e.target.checked);
        syncCheckAll(); o.onSelect && o.onSelect();
        return;
      }
      if (o.onOpen && document.documentElement.classList.contains('gallery-mode')) { o.onOpen(o.find(id)); return; }
      if (o.photo && e.target.closest('[data-photo]')) { o.photo.onClick(o.find(id)); return; }
      const act = e.target.closest('[data-act]');
      if (act) { o.actions[+act.dataset.act].fn(o.find(id)); return; }
      if (e.target.closest('a[href]')) return; // listing links open normally
      // phones: tapping a closed card (or any card's title) opens / closes it
      if (isPhone() && (!tr.classList.contains('open') || e.target.closest('td.f-first'))) {
        if (openCards.has(id)) openCards.delete(id); else openCards.add(id);
        tr.classList.toggle('open', openCards.has(id));
        return;
      }
      const td = e.target.closest('td.ed');
      if (td && !td.querySelector('.cell-input')) startEdit(td);
    });

    /* --- drag & drop an image onto any row --- */
    if (o.photo) {
      const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      let over = null;
      const clear = () => { if (over) over.classList.remove('drop-target'); over = null; };
      tbody.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
        if (over !== tr) { clear(); over = tr; tr.classList.add('drop-target'); }
      });
      tbody.addEventListener('dragleave', (e) => { if (over && !over.contains(e.relatedTarget)) clear(); });
      tbody.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        const tr = e.target.closest('tr[data-id]');
        clear();
        if (!tr) return;
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(U.isImageFile);
        if (!files.length) { U.toast('Drop an image file (JPG, PNG, WebP…).', 'err'); return; }
        o.photo.onDrop(o.find(tr.dataset.id), files[0], files);
      });
    }

    /** Scroll the table window just enough to show a cell, keeping it clear of the frozen columns and header. */
    function revealCell(td) {
      const wrap = table.closest('.table-wrap'); if (!wrap) return;
      const w = wrap.getBoundingClientRect(), c = td.getBoundingClientRect();
      const frozen = Array.from(td.parentElement.cells).filter((x) => x.classList.contains('stk')).reduce((a, x) => a + x.getBoundingClientRect().width, 0);
      const headH = thead.getBoundingClientRect().height, footH = tfoot.getBoundingClientRect().height;
      let dx = 0, dy = 0;
      if (!td.classList.contains('stk')) {
        if (c.left < w.left + frozen) dx = c.left - (w.left + frozen) - 8;
        else if (c.right > w.right) dx = c.right - w.right + 8;
      }
      if (c.top < w.top + headH) dy = c.top - (w.top + headH) - 4;
      else if (c.bottom > w.bottom - footH) dy = c.bottom - (w.bottom - footH) + 4;
      if (dx || dy) wrap.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
    }

    /* --- inline editing --- */
    function startEdit(td) {
      const tr = td.closest('tr');
      const id = tr.dataset.id, key = td.dataset.key;
      const c = o.columns.find((x) => x.key === key);
      const r = o.find(id);
      if (!c || !r) return;
      if (c.editor) { c.editor(r); return; }
      const cur = r[key];
      let input;
      if (c.type === 'list' && !c.free) {
        input = document.createElement('select');
        const opts = c.list();
        const set = new Set(opts);
        if (cur && !set.has(cur)) opts.unshift(cur);
        input.innerHTML = (c.allowEmpty ? '<option value=""></option>' : '') + opts.map((x) => `<option value="${esc(x)}" ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
      } else {
        input = document.createElement('input');
        if (c.type === 'date') { input.type = 'date'; input.value = cur || ''; }
        else if (c.type === 'money' || c.type === 'int' || c.type === 'dec') { input.type = 'text'; input.inputMode = 'decimal'; input.value = cur ?? ''; }
        else { input.type = 'text'; input.value = cur ?? ''; }
        if (c.type === 'list' && c.free) {
          const dl = document.createElement('datalist');
          dl.id = 'dl-' + key + '-' + Math.random().toString(36).slice(2);
          dl.innerHTML = c.list().map((x) => `<option value="${esc(x)}">`).join('');
          td.appendChild(dl); input.setAttribute('list', dl.id);
        }
      }
      input.className = 'cell-input';
      const span = td.querySelector('.cell');
      span.style.display = 'none';
      td.appendChild(input);
      input.focus({ preventScroll: true }); // don't let the browser jump the table
      revealCell(td);
      if (input.select && input.type === 'text') input.select();

      let done = false;
      const finish = (save, move) => {
        if (done) return; done = true;
        if (save) {
          let v = input.value;
          if (c.type === 'money') v = v.trim() === '' ? null : U.round2(U.num(v) ?? 0);
          else if (c.type === 'int') v = v.trim() === '' ? null : Math.round(U.num(v) ?? 0);
          else if (c.type === 'dec') v = v.trim() === '' ? null : U.round2(U.num(v) ?? 0);
          else if (c.type === 'list') v = c.lower ? v.trim().toLowerCase() : v.trim();
          else if (c.type !== 'date') v = v.trim();
          if (v !== (cur ?? (c.type === 'money' || c.type === 'int' ? null : ''))) o.onEdit(r, key, v);
        }
        refreshRow(id);
        if (move) {
          const tr2 = tbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
          if (!tr2) return;
          const eds = $$('td.ed', tr2);
          const i = eds.findIndex((x) => x.dataset.key === key);
          let next = eds[i + move];
          if (!next) {
            const sib = move > 0 ? tr2.nextElementSibling : tr2.previousElementSibling;
            if (sib) { const e2 = $$('td.ed', sib); next = move > 0 ? e2[0] : e2[e2.length - 1]; }
          }
          if (next) startEdit(next);
        }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true, 0); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false, 0); }
        else if (e.key === 'Tab') { e.preventDefault(); finish(true, e.shiftKey ? -1 : 1); }
      });
      input.addEventListener('blur', () => setTimeout(() => finish(true, 0), 0));
      if (input.tagName === 'SELECT') input.addEventListener('change', () => input.blur());
    }

    return { render, refreshRow, applySticky, rows: () => rowsCache };
  }

  /* =========================================================
     Item helpers
     ========================================================= */
  const findItem = (id) => state.items.find((x) => x.id === id);
  const findExp = (id) => state.expenses.find((x) => x.id === id);
  function nextSku() {
    const nums = state.items.map((i) => parseInt(i.sku, 10)).filter((n) => !isNaN(n));
    return String(nums.length ? Math.max(...nums) + 1 : 1);
  }
  function blankItem(over = {}) {
    return { id: U.uid(), name: '', category: '', sku: nextSku(), purchasePrice: null, sellingPrice: null, status: 'available', platform: '', listings: [], datePosted: U.todayISO(), dateSold: '', totalAfterFees: null, shippingCost: null, notes: '',
      brand: '', size: '', color: '', condition: '', material: '', measurements: '', weight: '', location: '', source: '', purchaseDate: '', minPrice: null,
      priceHistory: [], markdownStep: 0, lastMarkdown: '', lastRelisted: '', disposedDate: '', decideSnooze: '', bundle: false, createdAt: Date.now(), updatedAt: Date.now(), ...over };
  }
  function normalizeItem(raw) {
    const it = blankItem({ sku: '' });
    Object.assign(it, {
      id: raw.id || U.uid(),
      name: String(raw.name ?? '').trim(), category: String(raw.category ?? '').trim(), sku: raw.sku === null || raw.sku === undefined ? '' : String(raw.sku).trim(),
      purchasePrice: U.num(raw.purchasePrice), sellingPrice: U.num(raw.sellingPrice),
      status: String(raw.status || 'available').trim().toLowerCase(), platform: String(raw.platform ?? '').trim().toLowerCase(),
      datePosted: U.toISO(raw.datePosted || ''), dateSold: U.toISO(raw.dateSold || ''),
      totalAfterFees: U.num(raw.totalAfterFees), shippingCost: U.num(raw.shippingCost), notes: String(raw.notes ?? ''),
      listings: normListings(raw.listings),
      brand: String(raw.brand ?? '').trim(), size: String(raw.size ?? '').trim(), color: String(raw.color ?? '').trim(), condition: String(raw.condition ?? '').trim(), material: String(raw.material ?? '').trim(),
      measurements: String(raw.measurements ?? '').trim(), weight: String(raw.weight ?? '').trim(), location: String(raw.location ?? '').trim(), source: String(raw.source ?? '').trim(),
      purchaseDate: U.toISO(raw.purchaseDate || ''), minPrice: U.num(raw.minPrice),
      priceHistory: Array.isArray(raw.priceHistory) ? raw.priceHistory.filter((h) => h && h.date) : [],
      markdownStep: +raw.markdownStep || 0, lastMarkdown: U.toISO(raw.lastMarkdown || ''), lastRelisted: U.toISO(raw.lastRelisted || ''),
      disposedDate: U.toISO(raw.disposedDate || ''), decideSnooze: U.toISO(raw.decideSnooze || ''), bundle: !!raw.bundle,
      photos: Array.isArray(raw.photos) ? raw.photos.filter((x) => typeof x === 'string') : [],
      offers: Array.isArray(raw.offers) ? raw.offers.filter((o) => o && o.amount != null).map((o) => ({ id: o.id || U.uid(), date: U.toISO(o.date || '') || U.todayISO(), platform: String(o.platform || '').toLowerCase(), amount: U.num(o.amount) ?? 0, status: o.status || 'pending', counter: U.num(o.counter), note: String(o.note || '') })) : [],
      refunds: Array.isArray(raw.refunds) ? raw.refunds.filter(Boolean).map((r) => ({ id: r.id || U.uid(), date: U.toISO(r.date || '') || U.todayISO(), amount: U.num(r.amount) ?? 0, returnShip: U.num(r.returnShip) ?? 0, note: String(r.note || '') })) : [],
      orderId: String(raw.orderId || ''), orderSize: +raw.orderSize || 0,
      buyer: raw.buyer && typeof raw.buyer === 'object' ? { name: String(raw.buyer.name || ''), email: String(raw.buyer.email || ''), address: String(raw.buyer.address || '') } : null,
      invoice: raw.invoice && typeof raw.invoice === 'object' && raw.invoice.no ? raw.invoice : null,
      haulId: String(raw.haulId || ''), pkg: String(raw.pkg || ''),
      createdAt: raw.createdAt || Date.now(), updatedAt: raw.updatedAt || Date.now(), editedBy: String(raw.editedBy || '')
    });
    return it;
  }
  function normListings(arr) {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    return arr.filter((l) => l && typeof l === 'object').map((l) => {
      const url = U.normUrl(l.url || l.link || '');
      const platform = String(l.platform || l.name || '').trim().toLowerCase() || U.platformFromUrl(url);
      const status = ['active', 'delisted', 'sold', 'expired'].includes(l.status) ? l.status : 'active';
      const out = { platform, url, status, statusDate: l.statusDate || '' };
      if (l.price !== undefined && l.price !== null && l.price !== '' && !isNaN(+l.price)) out.price = +l.price;
      return out;
    }).filter((l) => { const k = l.platform + '|' + l.url; if ((!l.platform && !l.url) || seen.has(k)) return false; seen.add(k); return true; });
  }
  function normalizeTrip(raw) {
    return { id: raw.id || U.uid(), date: U.toISO(raw.date || '') || U.todayISO(), purpose: String(raw.purpose || 'Sourcing'), from: String(raw.from || ''), to: String(raw.to || ''),
      miles: U.num(raw.miles) ?? 0, roundTrip: !!raw.roundTrip, notes: String(raw.notes || ''), createdAt: raw.createdAt || Date.now(), updatedAt: raw.updatedAt || Date.now(), editedBy: String(raw.editedBy || '') };
  }
  function normalizeExpense(raw) {
    return { id: raw.id || U.uid(), date: U.toISO(raw.date || '') || U.todayISO(), category: String(raw.category || 'Other'), vendor: String(raw.vendor || ''), description: String(raw.description || ''), amount: U.num(raw.amount) ?? 0, payment: String(raw.payment || ''), notes: String(raw.notes || ''), createdAt: raw.createdAt || Date.now(), updatedAt: raw.updatedAt || Date.now(), editedBy: String(raw.editedBy || '') };
  }
  /** Money burst when items become sold (Settings → Business → “Celebrate sales”). */
  function celebrateSale(list) {
    list = list.filter(Boolean);
    if (S().celebrate === false || !list.length || !window.Celebrate) return;
    Celebrate.sale({
      amount: U.round2(list.reduce((a, i) => a + (i.sellingPrice || 0), 0)),
      profit: U.round2(list.reduce((a, i) => a + (Calc.profit(i) || 0), 0)),
      count: list.length
    });
  }
  function updateItem(it, patch, label) {
    const after = { ...U.clone(it), ...patch };
    // smart status / date coupling
    if ('status' in patch && patch.status === 'sold' && !after.dateSold) after.dateSold = U.todayISO();
    if ('dateSold' in patch && patch.dateSold && after.status === 'available') { after.status = 'sold'; U.toast('Status set to “sold” because a Date Sold was entered.'); }
    if ('status' in patch && patch.status === 'available' && it.status === 'sold') { after.dateSold = ''; after.listings = (after.listings || []).map((l) => (l.status === 'sold' ? { ...l, status: 'active' } : l)); }
    const becameSold = after.status === 'sold' && (it.status || '').toLowerCase() !== 'sold';
    if (becameSold || ('platform' in patch && after.status === 'sold')) markListingsSold(after);
    commit('items', [{ id: it.id, after }], { label });
    if (becameSold) { celebrateSale([after]); if (needsDelist(after)) setTimeout(() => delistChecklist(after), S().celebrate === false ? 200 : 2500); }
    return after;
  }
  const addListValue = (listKey, v) => {
    if (!v) return;
    if (listKey === 'platforms') {
      if (!profileFor(v)) { profiles().push(blankPlatform(titleCase(v), profiles().length)); saveSettings(); populateFilters(); }
      return;
    }
    const arr = S()[listKey];
    if (!arr.some((x) => x.toLowerCase() === String(v).toLowerCase())) { arr.push(v); saveSettings(); populateFilters(); }
  };
  const allCats = () => uniq([...S().categories, ...state.items.map((i) => i.category)]);
  const allPlatforms = () => uniq([...profiles().filter((p) => p.active !== false).map((p) => p.name), ...state.items.map((i) => i.platform), ...state.items.flatMap((i) => (i.listings || []).map((l) => l.platform))]);
  const allStatuses = () => uniq([...S().statuses, ...state.items.map((i) => i.status)]);
  const uniqVals = (k) => uniq(state.items.map((i) => i[k]).filter(Boolean)).sort((a, b) => String(a).localeCompare(String(b)));
  /** Fill {placeholders} from an item; blank lines left by empty fields are removed. */
  function fillTemplate(tpl, it) {
    const vals = { name: it.name, brand: it.brand, size: it.size, color: it.color, condition: it.condition, material: it.material, measurements: it.measurements, weight: it.weight,
      category: it.category, sku: it.sku, notes: it.notes, location: it.location, price: it.sellingPrice != null ? U.money(it.sellingPrice) : '' };
    const reEsc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameHas = (v) => v && it.name && new RegExp(`(^|\\W)${reEsc(v)}(\\W|$)`, 'i').test(String(it.name));
    return String(tpl || '').split('\n').map((line) => {
      const keys = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      // don't repeat words the item name already contains (e.g. brand “Zara” in “Zara Linen Shirt”)
      const out = line.replace(/\{(\w+)\}/g, (_, k) => (['brand', 'color'].includes(k) && keys.includes('name') && nameHas(vals[k]) ? '' : (vals[k] ?? ''))).replace(/\s{2,}/g, ' ').trim();
      return keys.length && keys.every((k) => !vals[k]) ? null : out.replace(/^[^A-Za-z0-9$#]*:\s*$/, '');
    }).filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function uniq(a) { const seen = new Set(); return a.filter((x) => { if (!x) return false; const k = String(x).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); }

  const ICON = {
    sold: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 9h16M8 13h5M8 16h8"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/></svg>',
    refund: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v8M9.5 10.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.6c0 2.3-5 1.2-5 3.4 0 1 1 1.6 2.5 1.6s2.5-.5 2.5-1.5"/></svg>',
    xlist: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/></svg>'
  };
  const statusBadge = (s) => { const k = (s || '').toLowerCase(); return `<span class="badge ${k === 'sold' ? 'b-sold' : k === 'available' ? 'b-available' : 'b-other'}">${esc(s || '—')}</span>`; };

  /* =========================================================
     INVENTORY VIEW
     ========================================================= */
  /* ---- shared SKUs ---- */
  const skuKey = (s) => String(s ?? '').trim().toLowerCase();
  // SKUs are reused once an item sells, so only items still in stock count as sharing one
  const skuActive = (i) => !Calc.isSold(i) && (i.status || '').toLowerCase() !== 'donated';
  const sameSku = (sku, exceptId) => {
    const k = skuKey(sku); if (!k) return [];
    const me = exceptId ? state.items.find((i) => i.id === exceptId) : null;
    if (me && !skuActive(me)) return [];
    return state.items.filter((i) => i.id !== exceptId && skuKey(i.sku) === k && skuActive(i));
  };
  const skuDupNote = (sku, exceptId) => { const o = sameSku(sku, exceptId); return o.length ? `SKU ${sku} is also used by ${o.slice(0, 2).map((x) => `“${x.name || 'an item'}”`).join(', ')}${o.length > 2 ? ` and ${o.length - 2} more` : ''}. That’s allowed — each item stays separate.` : ''; };
  const INV_COLS = [
    { key: 'name', label: 'Item Name', type: 'text', width: 230 },
    { key: 'category', label: 'Category', type: 'list', free: true, lower: true, list: allCats, render: (r) => esc(r.category || '') },
    { key: 'brand', label: 'Brand', type: 'list', free: true, list: () => uniqVals('brand') },
    { key: 'size', label: 'Size', type: 'list', free: true, list: () => uniqVals('size') },
    { key: 'sku', label: 'SKU', type: 'text', get: (r) => { const n = Number(r.sku); return r.sku !== '' && !isNaN(n) ? n : (r.sku || null); }, render: (r) => { const d = r.sku ? sameSku(r.sku, r.id).length : 0; return `${esc(r.sku || '')}${d ? ` <span class="sku-dup" title="${d + 1} items share this SKU">×${d + 1}</span>` : ''}`; } },
    { key: 'location', label: 'Location', type: 'list', free: true, list: () => uniqVals('location'), render: (r) => (r.location ? `<span class="loc">${esc(r.location)}</span>` : '') },
    { key: 'purchasePrice', label: 'Purchase Price', type: 'money', total: 'sum', totalLabel: 'Total Purchase' },
    { key: 'sellingPrice', label: 'Selling Price', type: 'money', total: 'sum', totalLabel: 'Inventory Estimate', totalIf: (r) => invGroup(r) === 0, render: (r) => (r.sellingPrice == null && !sitePrices(r) ? '<span class="muted">—</span>' : `${sitePrices(r) ? `<span class="lp-range" title="${esc(sitePrices(r).tip)}">${esc(priceText(r))}</span>` : esc(U.money(r.sellingPrice))}${(r.priceHistory || []).length ? `<span class="ph-dot" title="Price changed ${r.priceHistory.length}× — last: ${esc(U.money(r.priceHistory[r.priceHistory.length - 1].from))} → ${esc(U.money(r.priceHistory[r.priceHistory.length - 1].to))}">↓</span>` : ''}`) },
    { key: 'minPrice', label: 'Lowest Price', type: 'money' },
    { key: 'status', label: 'Status', type: 'list', lower: true, list: allStatuses, render: (r) => statusBadge(r.status) },
    { key: 'platform', label: 'Platform it sold', type: 'list', free: true, lower: true, list: allPlatforms, render: (r) => platformTag(r.platform) },
    { key: 'listings', label: 'Listed On', type: 'custom', width: 180, get: (r) => (r.listings || []).map((l) => platformLabel(l.platform)).join(', ') || null, render: (r) => listingsChips(r), editor: (r) => (needsDelist(r) ? delistChecklist(r) : listingsDialog(r)) },
    { key: 'datePosted', label: 'Date Posted', type: 'date' },
    { key: 'daysActive', label: 'Days Active', type: 'int', computed: true, total: 'avg', get: (r) => Calc.daysActive(r), render: (r) => { const d = Calc.daysActive(r); if (d === null) return '<span class="muted">—</span>'; const a = Calc.ageClass(r, S()); return `<span class="age age-${a}">${U.int(d)}</span>`; } },
    { key: 'dateSold', label: 'Date Sold', type: 'date' },
    { key: 'totalAfterFees', label: 'Total After Fees', type: 'money', total: 'sum', totalLabel: 'Total Made' },
    { key: 'fees', label: 'Fees', type: 'money', computed: true, total: 'sum', get: (r) => Calc.fees(r) },
    { key: 'shippingCost', label: 'Shipping Cost', type: 'money', total: 'sum' },
    { key: 'profit', label: 'Profit', type: 'money', computed: true, total: 'sum', get: (r) => Calc.profit(r), render: (r) => { const p = Calc.profit(r); return p === null ? '<span class="muted">—</span>' : `<span class="${p < 0 ? 'neg' : 'pos'}">${esc(U.money(p))}</span>`; } },
    { key: 'color', label: 'Color', type: 'text' },
    { key: 'condition', label: 'Condition', type: 'list', free: true, list: () => uniq([...(S().conditions || []), ...uniqVals('condition')]) },
    { key: 'material', label: 'Material', type: 'list', free: true, list: () => uniq([...uniqVals('material'), ...(S().materials || DEFAULT_SETTINGS.materials)]) },
    { key: 'measurements', label: 'Measurements', type: 'text', width: 160 },
    { key: 'weight', label: 'Weight', type: 'text' },
    { key: 'source', label: 'Source', type: 'list', free: true, list: () => uniqVals('source') },
    { key: 'purchaseDate', label: 'Purchase Date', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'text', width: 160 }
  ];

  /* active items first (by SKU), then donated, then sold (newest sale first) */
  const invGroup = (it) => (Calc.isSold(it) ? 2 : (it.status || '').toLowerCase() === 'donated' ? 1 : 0);
  const skuCmp = (a, b) => {
    const ea = !String(a.sku || '').trim(), eb = !String(b.sku || '').trim();
    if (ea !== eb) return ea ? 1 : -1;
    return String(a.sku || '').localeCompare(String(b.sku || ''), undefined, { numeric: true, sensitivity: 'base' }) || (a.name || '').localeCompare(b.name || '');
  };
  const invDefaultSort = (a, b) => (invGroup(a) === 2 && invGroup(b) === 2 ? (b.dateSold || '').localeCompare(a.dateSold || '') || skuCmp(a, b) : skuCmp(a, b));
  /* “Group by SKU”: every item with SKU 1 (active first, then sold), then SKU 2, … — items without a SKU last */
  const skuOnly = (a, b) => {
    const ka = String(a.sku || '').trim(), kb = String(b.sku || '').trim();
    if (!ka !== !kb) return ka ? -1 : 1;
    return ka.localeCompare(kb, undefined, { numeric: true, sensitivity: 'base' });
  };
  const invGroupCmp = (a, b) => (S().invGroupSku ? skuOnly(a, b) : 0) || (invGroup(a) - invGroup(b));
  const invGroupClass = (r, prev) => {
    if (S().invGroupSku) return skuOnly(r, prev) ? ' sku-start' : (invGroup(r) !== invGroup(prev) ? ' sku-sold' : '');
    return invGroup(r) !== invGroup(prev) ? ' grp-start' : '';
  };
  function paintGroupSku() {
    const b = $('#btnGroupSku'); if (!b) return;
    const on = !!S().invGroupSku;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.innerHTML = on ? '🔢 Grouped by SKU' : '🔢 Group by SKU';
    b.title = on ? 'Items are grouped by SKU (active first within each SKU). Click to list all active items first instead.' : 'Group items by SKU: SKU 1 (active, then sold), SKU 2, …';
  }
  /** “Hide sold” is on, and no status filter asks for sold items */
  const hidingSold = () => !!S().invHideSold && !$('#fStatus').value && $('#fAge').value !== 'sold';
  let ignoreHide = false;
  /** the same rows with “Hide sold” off — footer totals don’t change when sold items are hidden */
  const invTotalRows = () => { ignoreHide = true; try { return invFiltered(); } finally { ignoreHide = false; } };
  function paintHideSold() {
    const b = $('#btnHideSold'); if (!b) return;
    const on = !!S().invHideSold;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.innerHTML = on ? '👁 Show sold' : '🙈 Hide sold';
    b.title = on ? 'Sold and donated items are hidden — click to show everything (active items stay on top)' : 'Hide sold and donated items to see only your active inventory';
  }
  /* SKU search: a number (“1”), “#1” or “sku 1” finds that exact SKU; “1*” finds SKUs starting with 1.
     A number no item uses as a SKU — or anything in quotes — is searched as ordinary text. */
  function skuQuery(raw) {
    raw = String(raw || '').trim();
    if (!raw || /^["']/.test(raw)) return null;
    const m = /^(#|sku\s*:?\s*)?([a-z0-9][a-z0-9._-]*?)(\*)?$/i.exec(raw); if (!m) return null;
    const explicit = !!m[1], code = m[2].toLowerCase(), prefix = !!m[3];
    if (!explicit && !prefix && !/^\d+$/.test(code)) return null;
    const test = (sku) => { const k = String(sku || '').trim().toLowerCase().replace(/^#/, ''); return prefix ? k.startsWith(code) : k === code; };
    if (!explicit && !prefix && !state.items.some((i) => test(i.sku))) return null;
    return test;
  }
  const textQuery = (raw) => String(raw || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
  function invFiltered() {
    const skuT = skuQuery($('#invSearch').value);
    const q = skuT ? '' : textQuery($('#invSearch').value);
    const fs = $('#fStatus').value, fc = $('#fCategory').value, fp = $('#fPlatform').value, fa = $('#fAge').value;
    const hide = !ignoreHide && hidingSold();
    return state.items.filter((it) => {
      if (hide && invGroup(it) > 0) return false;
      if (fs && (it.status || '').toLowerCase() !== fs.toLowerCase()) return false;
      if (fc && (it.category || '').toLowerCase() !== fc.toLowerCase()) return false;
      if (fp && ![it.platform, ...(it.listings || []).map((l) => l.platform)].some((x) => (x || '').toLowerCase() === fp.toLowerCase())) return false;
      if (fa === 'dupsku') { if (!it.sku || !sameSku(it.sku, it.id).length) return false; } else if (fa && Calc.ageClass(it, S()) !== fa) return false;
      if (skuT && !skuT(it.sku)) return false;
      if (q) {
        const hay = [it.name, it.sku, it.category, it.platform, it.status, it.notes, it.brand, it.size, it.color, it.location, it.source, ...(it.listings || []).flatMap((l) => [l.platform, l.url])].join(' ').toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }

  let invGrid;
  function setupInventory() {
    invGrid = createGrid({
      table: $('#invTable'),
      columns: INV_COLS, phoneKeep: ['status', 'sellingPrice', 'sku'], phoneCols: ['name', 'status', 'sellingPrice', 'purchasePrice', 'listings', 'daysActive', 'dateSold', 'totalAfterFees', 'profit', 'sku', 'location'],
      photo: photoConfig,
      sticky: 'name',
      rows: invFiltered,
      groupCmp: invGroupCmp,
      totalRows: invTotalRows,
      groupClass: invGroupClass,
      defaultSort: invDefaultSort,
      find: findItem,
      hidden: () => S().hiddenCols || [],
      // once per device: switch to SKU order (active items first is built in)
      getSort: () => { if (!S().invSortSku) { S().invSort = [{ key: 'sku', dir: 'asc' }]; S().invSortSku = 1; } return S().invSort || []; },
      setSort: (s) => { S().invSort = s; saveSettings(); },
      rowClass: (r) => 'r-' + Calc.ageClass(r, S()),
      selectable: true,
      selection: state.selection,
      onSelect: updateBulkBar,
      footer: true,
      emptyText: 'No items match. Adjust filters or click “+ Add item”.',
      onEdit: (r, key, v) => {
        updateItem(r, { [key]: v }, 'edit ' + key);
        if (key === 'sku' && v && sameSku(v, r.id).length) U.toast(skuDupNote(v, r.id), 'warn');
        if (key === 'category') addListValue('categories', v);
        if (key === 'platform') addListValue('platforms', v);
        renderCounts();
      },
      onOpen: (r) => openItemSheet(r),
      actions: [
        { icon: ICON.open, title: 'Item details', fn: (r) => openItemSheet(r) },
        { icon: ICON.xlist, title: 'Cross-list to other sites', show: (r) => !Calc.isSold(r), fn: (r) => crossListDialog([r]) },
        { icon: ICON.sold, title: 'Mark as sold…', show: (r) => !Calc.isSold(r), fn: (r) => markSoldDialog([r]) },
        { icon: ICON.edit, title: 'Edit all fields', fn: (r) => itemDialog(r) },
        { icon: ICON.dup, title: 'Duplicate', fn: (r) => duplicateItems([r]) },
        { icon: ICON.del, title: 'Delete', cls: 'del', fn: (r) => deleteItems([r]) }
      ],
      afterRender: (rows) => {
        const tot = state.items.length;
        const hid = hidingSold() ? state.items.filter((i) => invGroup(i) > 0).length : 0;
        $('#invFootNote').textContent = `Showing ${rows.length} of ${tot} items${hid ? ` · ${hid} sold/donated hidden` : ''} · ${S().invGroupSku ? 'grouped by SKU, active first in each' : 'active items first'} · Ctrl/⌘+Z to undo`;
      }
    });

    const rerender = () => invGrid.render();
    $('#invSearch').addEventListener('input', U.debounce(rerender, 120));
    ['#fStatus', '#fCategory', '#fPlatform', '#fAge'].forEach((s) => $(s).addEventListener('change', rerender));
    $('#btnHideSold').onclick = () => { S().invHideSold = !S().invHideSold; saveSettings(); paintHideSold(); rerender(); };
    $('#btnGroupSku').onclick = () => { S().invGroupSku = !S().invGroupSku; saveSettings(); paintGroupSku(); rerender(); };
    paintHideSold(); paintGroupSku();
    $('#btnClearFilters').onclick = () => { $('#invSearch').value = ''; ['#fStatus', '#fCategory', '#fPlatform', '#fAge'].forEach((s) => ($(s).value = '')); rerender(); };
    $('#btnAddItem').onclick = () => itemDialog(null);
    $('#btnColumns').onclick = (e) => columnsPopover(e.currentTarget);
    $('#btnImportXlsx').onclick = () => $('#importXlsxInput').click();
    $('#importXlsxInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importExcel(f); };

    // the selection bar lives on <body> so 'position: fixed' is relative to the screen, not an animated view
    document.body.appendChild($('#bulkBar'));
    $('#bulkBar').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-bulk]'); if (!b) return;
      const sel = state.items.filter((i) => state.selection.has(i.id));
      const a = b.dataset.bulk;
      if (a === 'clear') { state.selection.clear(); invGrid.render(); updateBulkBar(); return; }
      if (!sel.length) return;
      if (a === 'sold') markSoldDialog(sel.filter((x) => !Calc.isSold(x)));
      if (a === 'available') { commit('items', sel.map((it) => ({ id: it.id, after: { ...U.clone(it), status: 'available', dateSold: '', buyer: Calc.isSold(it) ? null : it.buyer, invoice: Calc.isSold(it) ? null : it.invoice, platform: Calc.isSold(it) ? '' : it.platform, totalAfterFees: Calc.isSold(it) ? null : it.totalAfterFees } })), { label: 'mark available' }); renderAll(); }
      if (a === 'category') {
        const v = await U.prompt('Set category', `Category for ${sel.length} item(s)`, { list: allCats() });
        if (v) { const c = v.trim().toLowerCase(); commit('items', sel.map((it) => ({ id: it.id, after: { ...U.clone(it), category: c } })), { label: 'set category' }); addListValue('categories', c); renderAll(); }
      }
      if (a === 'duplicate') duplicateItems(sel);
      if (a === 'photos' && window.Ext && Ext.photoBulkRemove) await Ext.photoBulkRemove(sel);
      if (a === 'price') bulkPriceDialog(sel.filter((x) => !Calc.isSold(x)));
      if (a === 'labels') Labels.print(sel, labelCtx());
      if (a === 'xlist') crossListDialog(sel.filter((x) => !Calc.isSold(x)));
      if (a === 'slips') Print.packingSlip(sel, printCtx());
      if (a === 'thanks') Print.thankYou(sel, printCtx());
      if (a === 'refreshed') { commit('items', sel.map((it) => ({ id: it.id, after: { ...U.clone(it), lastRelisted: U.todayISO() } })), { label: 'refreshed' }); renderAll(); U.toast(`${sel.length} marked refreshed`, 'ok'); }
      if (a === 'location') {
        const v = await U.prompt('Set storage location', `Location for ${sel.length} item(s)`, { list: uniqVals('location'), placeholder: 'e.g. Bin 4' });
        if (v !== null && v !== undefined) { commit('items', sel.map((it) => ({ id: it.id, after: { ...U.clone(it), location: v.trim() } })), { label: 'set location' }); renderAll(); }
      }
      if (a === 'delete') deleteItems(sel);
    });
  }
  function updateBulkBar() {
    // drop selections of items that no longer exist
    [...state.selection].forEach((id) => { if (!findItem(id)) state.selection.delete(id); });
    const n = state.selection.size;
    $('#bulkBar').classList.toggle('hidden', n === 0);
    document.body.classList.toggle('has-bulkbar', n > 0 && currentView() === 'inventory');
    $('#bulkCount').textContent = `${n} selected`;
    requestAnimationFrame(() => document.documentElement.style.setProperty('--bbh', (n ? $('#bulkBar').offsetHeight : 0) + 'px'));
  }
  function duplicateItems(list) {
    let sku = parseInt(nextSku(), 10);
    const copies = list.map((it) => ({ ...U.clone(it), id: U.uid(), sku: String(sku++), status: 'available', dateSold: '', platform: '', orderId: '', orderSize: 0, refunds: [], buyer: null, invoice: null, totalAfterFees: null, listings: [], datePosted: U.todayISO(), name: it.name + ' (copy)', createdAt: Date.now() }));
    commit('items', copies.map((c) => ({ id: c.id, after: c })), { label: 'duplicate' });
    copies.forEach((c, i) => {
      const src = list[i].id;
      if (!state.thumbs[src]) return;
      state.thumbs[c.id] = { ...state.thumbs[src] };
      persist(async () => { const ph = await Store.getPhoto(src); await Store.putPhoto(c.id, { ...state.thumbs[src], full: ph ? ph.full : state.thumbs[src].thumb }); });
    });
    renderAll();
    U.toast(`Duplicated ${copies.length} item(s)`, 'ok');
  }
  async function deleteItems(list) {
    if (!list.length) return;
    if (list.length > 1 && !(await U.confirm('Delete items', `Delete <b>${list.length}</b> items? You can undo right after.`, 'Delete', true))) return;
    commit('items', list.map((it) => ({ id: it.id, after: null })), { label: 'delete' });
    list.forEach((it) => state.selection.delete(it.id));
    renderAll(); updateBulkBar();
    U.toast(`Deleted ${list.length === 1 ? '“' + (list[0].name || 'item') + '”' : list.length + ' items'}`, '');
  }

  function columnsPopover(anchor) {
    const pop = $('#colPopover');
    if (!pop.classList.contains('hidden')) { pop.classList.add('hidden'); return; }
    const hidden = new Set(S().hiddenCols || []);
    pop.innerHTML = '<h4>Show columns</h4>' + `<label><input type="checkbox" data-col="_photo" ${hidden.has('_photo') ? '' : 'checked'}> Photo</label>` + INV_COLS.map((c) => `<label><input type="checkbox" data-col="${c.key}" ${hidden.has(c.key) ? '' : 'checked'} ${c.key === 'name' ? 'disabled' : ''}> ${esc(c.label)}${c.computed ? ' <span class="muted small">(calc)</span>' : ''}</label>`).join('');
    const r = anchor.getBoundingClientRect();
    pop.style.top = r.bottom + 6 + 'px'; pop.style.left = Math.max(10, r.right - 240) + 'px';
    pop.classList.remove('hidden');
    pop.onchange = (e) => {
      const k = e.target.dataset.col; if (!k) return;
      const set = new Set(S().hiddenCols || []);
      e.target.checked ? set.delete(k) : set.add(k);
      S().hiddenCols = [...set]; saveSettings(); invGrid.render();
    };
    setTimeout(() => document.addEventListener('mousedown', function h(ev) { if (!pop.contains(ev.target) && ev.target !== anchor) { pop.classList.add('hidden'); document.removeEventListener('mousedown', h); } }), 0);
  }

  /* ---------- item dialog ---------- */
  function listOptions(arr, cur, allowEmpty) {
    const a = [...arr]; if (cur && !a.some((x) => x.toLowerCase() === cur.toLowerCase())) a.unshift(cur);
    return (allowEmpty ? '<option value=""></option>' : '') + a.map((x) => `<option value="${esc(x)}" ${String(x).toLowerCase() === String(cur || '').toLowerCase() ? 'selected' : ''}>${esc(x)}</option>`).join('');
  }
  const dl = (id, arr) => `<datalist id="${id}">${arr.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
  const numVal = (v) => (v === null || v === undefined ? '' : v);

  async function itemDialog(item, opts = {}) {
    // opts.prefill: starting values for a new item; opts.files: photos already chosen (from Quick add)
    const it = item ? U.clone(item) : blankItem(opts.prefill || {});
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="photo-field">
        <div class="thumb thumb-lg" data-drop tabindex="0" title="Click to upload or drag & drop an image"></div>
        <div>
          <b>Product photos</b>
          <p class="muted small">Drag &amp; drop one or more images here, or click the box to choose files. Photos are resized and stored encrypted.</p>
          <button type="button" class="btn btn-sm" data-photo-camera>📷 Take photo</button>
          <button type="button" class="btn btn-sm btn-ghost" data-photo-remove>Remove photo</button>
          <div class="pd-choice hidden" data-photo-choice></div>
        </div>
      </div>
      <div class="form-grid">
        <label class="field span-2"><span>Item Name *</span><input name="name" value="${esc(it.name)}" required></label>
        <label class="field"><span>Category</span><input name="category" list="dlCat" value="${esc(it.category)}"></label>
        <label class="field"><span>SKU</span><input name="sku" value="${esc(it.sku)}"><small class="sku-warn" data-skuwarn="${esc(it.id)}">${esc(skuDupNote(it.sku, it.id))}</small></label>
        <label class="field"><span>Purchase Price</span><input name="purchasePrice" inputmode="decimal" value="${numVal(it.purchasePrice)}"></label>
        <label class="field"><span>Selling Price</span><input name="sellingPrice" inputmode="decimal" value="${numVal(it.sellingPrice)}"></label>
        <label class="field"><span>Status</span><select name="status">${listOptions(allStatuses(), it.status)}</select></label>
        <label class="field"><span>Platform it sold</span><input name="platform" list="dlPlat" value="${esc(it.platform)}"></label>
        <label class="field"><span>Date Posted</span><input type="date" name="datePosted" value="${esc(it.datePosted)}"></label>
        <label class="field"><span>Date Sold</span><input type="date" name="dateSold" value="${esc(it.dateSold)}"></label>
        <label class="field"><span>Total After Fees</span><input name="totalAfterFees" inputmode="decimal" value="${numVal(it.totalAfterFees)}"></label>
        <label class="field"><span>Shipping Cost (paid by you)</span><input name="shippingCost" inputmode="decimal" value="${numVal(it.shippingCost)}"></label>
        <div class="span-2 det-box">
          <div class="lst-head"><b>Details</b><span class="muted small">used for listing text, labels and “what sells” reports</span></div>
          <div class="form-grid g3">
            <label class="field"><span>Brand</span><input name="brand" list="dlBrand" value="${esc(it.brand)}"></label>
            <label class="field"><span>Size</span><input name="size" list="dlSize" value="${esc(it.size)}"></label>
            <label class="field"><span>Color</span><input name="color" value="${esc(it.color)}"></label>
            <label class="field"><span>Condition</span><input name="condition" list="dlCond" value="${esc(it.condition)}"></label>
            <label class="field"><span>Material</span><input name="material" list="dlMat" value="${esc(it.material || '')}" placeholder="e.g. 100% cotton"></label>
            <label class="field"><span>Measurements</span><input name="measurements" value="${esc(it.measurements)}" placeholder="e.g. pit-to-pit 20in, length 26in"></label>
            <label class="field"><span>Weight</span><input name="weight" value="${esc(it.weight)}" placeholder="e.g. 12 oz"></label>
            <label class="field"><span>Package</span><select name="pkg"><option value="">—</option>${(S().packages || []).map((p) => `<option value="${esc(p.id)}" ${it.pkg === p.id ? 'selected' : ''}>${esc(p.name)}${p.cost != null && p.cost !== '' ? ' · ' + esc(U.money(p.cost)) : ''}</option>`).join('')}</select></label>
            <label class="field"><span>Storage location</span><input name="location" list="dlLoc" value="${esc(it.location)}" placeholder="e.g. Bin 4, Shelf B"></label>
            <label class="field"><span>Source (where you bought it)</span><input name="source" list="dlSrc" value="${esc(it.source)}" placeholder="e.g. Goodwill Main St"></label>
            <label class="field"><span>Purchase date</span><input type="date" name="purchaseDate" value="${esc(it.purchaseDate)}"></label>
            <label class="field"><span>Lowest acceptable price</span><input name="minPrice" inputmode="decimal" value="${numVal(it.minPrice)}" placeholder="for offers & markdowns"></label>
          </div>
        </div>
        <div class="span-2" data-research></div>
        <div class="span-2" data-listings></div>
        <div class="span-2 det-box">
          <div class="lst-head"><b>Listing text</b><span class="muted small">from your templates (Settings → Listing templates)</span></div>
          <label class="field"><span>Title <button type="button" class="linklike" data-copy="title">Copy</button></span><input data-tpl="title" readonly></label>
          <label class="field"><span>Description <button type="button" class="linklike" data-copy="desc">Copy</button></span><textarea data-tpl="desc" rows="5" readonly></textarea></label>
        </div>
        ${(it.priceHistory || []).length ? `<div class="span-2 det-box"><div class="lst-head"><b>Price history</b></div><div class="ph-list">${it.priceHistory.slice().reverse().map((h) => `<div><span>${esc(U.fmtDate(h.date))}</span><span>${esc(U.money(h.from))} → <b>${esc(U.money(h.to))}</b></span><span class="muted small">${esc(h.reason || '')}</span></div>`).join('')}</div></div>` : ''}
        <label class="field span-2"><span>Notes</span><textarea name="notes" rows="2">${esc(it.notes)}</textarea></label>
      </div>
      <div class="calc-box"><div>Days Active<b data-c="days">—</b></div><div>Fees<b data-c="fees">—</b></div><div>Profit<b data-c="profit">—</b></div></div>
      ${dl('dlCat', allCats())}${dl('dlPlat', allPlatforms())}${dl('dlBrand', uniqVals('brand'))}${dl('dlSize', uniqVals('size'))}${dl('dlMat', uniq([...uniqVals('material'), ...(S().materials || DEFAULT_SETTINGS.materials)]))}${dl('dlCond', uniq([...(S().conditions || []), ...uniqVals('condition')]))}${dl('dlLoc', uniqVals('location'))}${dl('dlSrc', uniqVals('source'))}`;
    const read = () => {
      const f = (n) => body.querySelector(`[name="${n}"]`).value;
      return { ...it, name: f('name').trim(), category: f('category').trim().toLowerCase(), sku: f('sku').trim(), purchasePrice: f('purchasePrice').trim() === '' ? null : U.round2(U.num(f('purchasePrice')) ?? 0), sellingPrice: f('sellingPrice').trim() === '' ? null : U.round2(U.num(f('sellingPrice')) ?? 0), status: f('status').toLowerCase(), platform: f('platform').trim().toLowerCase(), datePosted: f('datePosted'), dateSold: f('dateSold'), totalAfterFees: f('totalAfterFees').trim() === '' ? null : U.round2(U.num(f('totalAfterFees')) ?? 0), shippingCost: f('shippingCost').trim() === '' ? null : U.round2(U.num(f('shippingCost')) ?? 0), notes: f('notes') };
    };
    const calc = () => { const x = read(); const d = Calc.daysActive(x), fe = Calc.fees(x), p = Calc.profit(x); body.querySelector('[data-c=days]').textContent = d ?? '—'; body.querySelector('[data-c=fees]').textContent = fe === null ? '—' : U.money(fe); body.querySelector('[data-c=profit]').textContent = p === null ? '—' : U.money(p); };
    body.addEventListener('input', calc); calc();
    // photo zone: undefined = unchanged, null = remove, File = new image
    let pendingPhoto;
    const zone = body.querySelector('[data-drop]');
    const rmBtn = body.querySelector('[data-photo-remove]');
    const showZone = (src) => {
      zone.classList.toggle('has', !!src);
      zone.innerHTML = src ? `<img src="${src}" alt="">` : '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Drop image or click</span>';
      rmBtn.classList.toggle('hidden', !src);
    };
    showZone(state.thumbs[it.id] ? state.thumbs[it.id].thumb : null);
    // new images waiting to be saved: added to the carousel or replacing the cover (asked only if a photo already exists)
    let pendingFiles = [], pendingMode = 'add';
    const existingCount = () => (window.Ext && Ext.photoKeys ? Ext.photoKeys(it).length : (state.thumbs[it.id] ? 1 : 0));
    const choiceBox = body.querySelector('[data-photo-choice]');
    const saveLabel = item ? 'Save changes' : 'Add item';
    // the Save button gently pulses while new photos are waiting to be saved
    const pulseSave = (on) => { const sb = document.querySelector('#modalFoot .btn-primary'); if (!sb) return; sb.classList.remove('pulse-save'); if (on) { void sb.offsetWidth; sb.classList.add('pulse-save'); } };
    let cancelWarned = false;
    const paintChoice = (popMode) => {
      const n = existingCount(), k = pendingFiles.length;
      cancelWarned = false;
      if (!k) { choiceBox.classList.add('hidden'); choiceBox.innerHTML = ''; pulseSave(false); return; }
      choiceBox.classList.remove('hidden');
      const what = k === 1 ? 'The new photo' : `The ${k} new photos`;
      const note = `<p class="pd-pending" data-pending>⏳ ${what} will be ${!n || pendingMode === 'add' ? 'added to this item’s photos' : 'used as the new cover'} when you tap <b>${saveLabel}</b>.</p>`;
      if (!n) { choiceBox.innerHTML = note; pulseSave(true); return; }
      choiceBox.innerHTML = `<span>This item already has ${n === 1 ? 'a photo' : n + ' photos'}. ${what} will:</span>
        <div class="seg"><button type="button" data-pm="add" class="${pendingMode === 'add' ? 'on' : ''}${popMode === 'add' ? ' pop' : ''}">➕ Add to photos</button><button type="button" data-pm="replace" class="${pendingMode === 'replace' ? 'on' : ''}${popMode === 'replace' ? ' pop' : ''}">🔁 Replace cover</button><button type="button" data-pm="keep">✕ Keep current</button></div>${note}`;
      pulseSave(true);
    };
    choiceBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pm]'); if (!b) return;
      if (b.dataset.pm === 'keep') { pendingFiles = []; pendingMode = 'add'; pendingPhoto = undefined; showZone(state.thumbs[it.id] ? state.thumbs[it.id].thumb : null); paintChoice(); return; }
      pendingMode = b.dataset.pm; paintChoice(pendingMode);
    });
    const lstEd = listingsEditor(body.querySelector('[data-listings]'), it.listings || []);
    const readDetails = () => {
      const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
      return { brand: g('brand'), size: g('size'), color: g('color'), condition: g('condition'), material: g('material'), measurements: g('measurements'), weight: g('weight'),
        location: g('location'), source: g('source'), purchaseDate: g('purchaseDate'), minPrice: g('minPrice') === '' ? null : U.round2(U.num(g('minPrice')) ?? 0), pkg: g('pkg') };
    };
    const researchBox = body.querySelector('[data-research]');
    const researchRefresh = () => { if (!window.Ext) return; const x = { ...it, ...read(), ...readDetails() }; const h = (Ext.suggestHtml ? Ext.suggestHtml(x, true) : '') + (Ext.researchHtml ? Ext.researchHtml(x, true) : ''); if (h !== researchBox._h) { researchBox.innerHTML = h; researchBox._h = h; } };
    researchRefresh(); body.addEventListener('change', (e) => { if (['name', 'brand', 'size', 'category', 'sellingPrice', 'purchasePrice'].includes(e.target.name)) researchRefresh(); });
    const tplRefresh = () => { const x = { ...read(), ...readDetails() }; body.querySelector('[data-tpl=title]').value = fillTemplate(S().templates.title, x); body.querySelector('[data-tpl=desc]').value = fillTemplate(S().templates.description, x); };
    body.addEventListener('input', tplRefresh); tplRefresh();
    body.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-copy]'); if (!c) return;
      e.preventDefault();
      const v = body.querySelector(c.dataset.copy === 'title' ? '[data-tpl=title]' : '[data-tpl=desc]').value;
      try { await navigator.clipboard.writeText(v); U.toast('Copied to clipboard', 'ok'); } catch (_) { const t = body.querySelector(c.dataset.copy === 'title' ? '[data-tpl=title]' : '[data-tpl=desc]'); t.select(); document.execCommand('copy'); U.toast('Copied', 'ok'); }
    });
    const takeFiles = (fs) => {
      fs = (fs || []).filter(U.isImageFile); if (!fs.length) { U.toast('Choose an image file.', 'err'); return; }
      pendingFiles = [...pendingFiles, ...fs]; pendingPhoto = undefined;
      showZone(URL.createObjectURL(pendingFiles[pendingFiles.length - 1]));
      if (pendingFiles.length > 1 || existingCount()) zone.insertAdjacentHTML('beforeend', `<span class="pd-badge">+${pendingFiles.length} new</span>`);
      paintChoice();
    };
    const takeFile = (f) => takeFiles([f]);
    attachDropZone(body.querySelector('.photo-field') || zone, (f, fs) => takeFiles(fs || [f]));
    zone.addEventListener('click', async () => { if (window.Ext && Ext.pickFiles) { const fs = await Ext.pickFiles('image/*', true); if (fs.length) takeFiles(fs); } else { const f = await U.pickFile('image/*'); if (f) takeFile(f); } });
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zone.click(); } });
    if (opts.files && opts.files.length) setTimeout(() => takeFiles(opts.files), 0); // after the window is open, so the Save button can pulse
    rmBtn.addEventListener('click', () => { if (pendingFiles.length) { pendingFiles = []; pendingMode = 'add'; paintChoice(); showZone(state.thumbs[it.id] ? state.thumbs[it.id].thumb : null); return; } pendingPhoto = null; showZone(null); });
    body.querySelector('[data-photo-camera]').addEventListener('click', async () => { const f = await U.pickFile('image/*', 'environment'); if (f) takeFile(f); });
    const res = await U.modal({
      title: item ? 'Edit item' : 'Add inventory item', body, wide: true,
      buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost', validate: () => {
        if (!pendingFiles.length || cancelWarned) return true;
        cancelWarned = true;
        const p = choiceBox.querySelector('[data-pending]');
        if (p) { p.classList.add('warn'); p.innerHTML = `⚠️ ${pendingFiles.length === 1 ? 'The new photo isn’t' : `The ${pendingFiles.length} new photos aren’t`} saved yet. Tap <b>${saveLabel}</b> to keep ${pendingFiles.length === 1 ? 'it' : 'them'}, or <b>Cancel</b> again to discard.`; p.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        pulseSave(true);
        return false;
      } }, { label: item ? 'Save changes' : 'Add item', cls: 'btn-primary', validate: (b) => { const n = b.querySelector('[name=name]'); if (!n.value.trim()) { n.focus(); n.classList.add('shake'); setTimeout(() => n.classList.remove('shake'), 400); return false; } return true; }, value: () => ({ ...read(), ...readDetails(), listings: lstEd.get() }) }]
    });
    if (!res) return;
    if (res.dateSold && res.status === 'available') res.status = 'sold';
    if (res.status === 'sold' && !res.dateSold) res.dateSold = U.todayISO();
    const newlySold = res.status === 'sold' && (!item || !Calc.isSold(item));
    if (newlySold) markListingsSold(res);
    commit('items', [{ id: res.id, after: res }], { label: item ? 'edit item' : 'add item' });
    if (newlySold) { celebrateSale([res]); if (needsDelist(res)) setTimeout(() => delistChecklist(res), S().celebrate === false ? 200 : 2500); }
    if (pendingFiles.length) { if (window.Ext && Ext.photoDrop) Ext.photoDrop(res, pendingFiles, { mode: existingCount() ? pendingMode : 'add' }); else setPhoto(res, pendingFiles[0]); }
    else if (pendingPhoto instanceof File) setPhoto(res, pendingPhoto);
    else if (pendingPhoto === null && state.thumbs[res.id]) removePhoto(res.id);
    addListValue('categories', res.category); addListValue('platforms', res.platform);
    (res.listings || []).forEach((l) => addListValue('platforms', l.platform));
    renderAll();
    flashRow(res.id);
    U.toast(item ? 'Item updated' : 'Item added', 'ok');
  }

  /* ---------- mark sold dialog (single or bulk) ---------- */
  /* =========================================================
     ITEM DETAIL SHEET — photo, money breakdown, price history, timeline
     ========================================================= */
  function bestEstimate(it) {
    const names = [...(it.listings || []).filter((l) => l.status !== 'removed').map((l) => l.platform), it.platform].filter(Boolean);
    const price = it.sellingPrice || 0;
    let best = null;
    names.forEach((n) => { const p = profileFor(n); if (!p) return; const e = Calc.platformEstimate(p, price); const keep = e.payout - (e.sellerShip || 0); if (!best || keep > best.keep) best = { p, e, keep }; });
    return best;
  }
  function moneyFlow(it) {
    const sold = Calc.isSold(it), price = it.sellingPrice || 0, cost = it.purchasePrice || 0;
    let fees, ship, label;
    if (sold) { fees = U.round2(price - Calc.net(it)); ship = it.shippingCost || 0; label = 'Profit'; }
    else { const b = bestEstimate(it); fees = b ? b.e.fees : 0; ship = b ? (b.e.sellerShip || 0) : (it.shippingCost || 0); label = b ? `Estimated profit on ${b.p.name}` : 'Estimated profit (before fees)'; }
    const profit = U.round2(price - fees - ship - cost);
    const steps = [
      { l: sold ? 'Sold for' : 'Listed at', v: price, kind: 'start' },
      { l: sold ? 'Platform fees' : 'Estimated fees', v: -fees },
      { l: 'Your shipping', v: -ship },
      { l: 'Item cost', v: -cost },
      { l: label, v: profit, kind: 'end' }
    ].filter((x) => x.kind || x.v);
    const max = Math.max(price, Math.abs(profit), 1);
    let run = 0;
    const bars = steps.map((x) => {
      let left, width, cls;
      if (x.kind === 'start') { left = 0; width = x.v; run = x.v; cls = 'wf-start'; }
      else if (x.kind === 'end') { left = Math.min(0, x.v); width = Math.abs(x.v); cls = x.v < 0 ? 'wf-neg' : 'wf-end'; }
      else { run += x.v; left = run; width = -x.v; cls = 'wf-cost'; }
      return `<div class="wf-row"><span class="wf-l">${esc(x.l)}</span><span class="wf-track"><span class="wf-bar ${cls}" style="left:${(Math.max(0, left) / max * 100).toFixed(2)}%;width:${(width / max * 100).toFixed(2)}%"></span></span><span class="wf-v ${x.v < 0 && x.kind !== 'end' ? 'muted' : x.v < 0 ? 'neg' : ''}">${x.kind || x.v >= 0 ? '' : '−'}${U.money(Math.abs(x.v))}</span></div>`;
    }).join('');
    const margin = price ? profit / price : null;
    return `<div class="wf">${bars}</div><div class="muted small">${margin !== null ? `${U.pct(margin)} of the ${sold ? 'sale' : 'list'} price${cost ? ` · ${U.pct(cost ? profit / cost : 0)} return on cost` : ''}` : ''}</div>`;
  }
  function priceChart(it) {
    const h = (it.priceHistory || []).filter((x) => x.date);
    if (!h.length) return '';
    const pts = [{ d: it.datePosted || h[0].date, v: h[0].from }, ...h.map((x) => ({ d: x.date, v: x.to }))];
    if (Calc.isSold(it) && it.dateSold) pts.push({ d: it.dateSold, v: it.sellingPrice });
    else pts.push({ d: U.todayISO(), v: it.sellingPrice });
    const t = pts.map((p) => +U.parseISO(p.d)), v = pts.map((p) => +p.v || 0);
    const t0 = Math.min(...t), t1 = Math.max(...t, t0 + 1), vmax = Math.max(...v) * 1.15 || 1;
    const W = 520, H = 120, X = (x) => 8 + (x - t0) / (t1 - t0) * (W - 16), Y = (y) => H - 18 - (y / vmax) * (H - 32);
    let d = ''; pts.forEach((p, i) => { const x = X(t[i]), y = Y(v[i]); d += i ? ` H${x.toFixed(1)} V${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`; });
    const dots = pts.map((p, i) => `<circle cx="${X(t[i]).toFixed(1)}" cy="${Y(v[i]).toFixed(1)}" r="3.5"><title>${esc(U.fmtDate(p.d))}: ${esc(U.money(v[i]))}</title></circle><text x="${X(t[i]).toFixed(1)}" y="${(Y(v[i]) - 8).toFixed(1)}" text-anchor="${X(t[i]) > W - 44 ? 'end' : X(t[i]) < 44 ? 'start' : 'middle'}">${esc(U.money0(v[i]))}</text>`).join('');
    return `<svg class="pchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none"/>${dots}<text x="8" y="${H - 3}" class="ax">${esc(U.fmtDate(pts[0].d))}</text><text x="${W - 8}" y="${H - 3}" text-anchor="end" class="ax">${esc(U.fmtDate(pts[pts.length - 1].d))}</text></svg>`;
  }
  function itemTimeline(it) {
    const ev = [];
    if (it.purchaseDate) ev.push({ d: it.purchaseDate, i: '🛍️', t: `Bought${it.purchasePrice != null ? ' for ' + U.money(it.purchasePrice) : ''}${it.source ? ' at ' + it.source : ''}` });
    if (it.datePosted) ev.push({ d: it.datePosted, i: '📸', t: `Listed${it.sellingPrice != null && !(it.priceHistory || []).length ? ' at ' + U.money(it.sellingPrice) : (it.priceHistory || []).length ? ' at ' + U.money(it.priceHistory[0].from) : ''}` });
    (it.priceHistory || []).forEach((h) => ev.push({ d: h.date, i: h.to < h.from ? '🏷️' : '⬆️', t: `Price ${h.to < h.from ? 'lowered' : 'raised'} ${U.money(h.from)} → ${U.money(h.to)}${h.reason && h.reason !== 'edit' && !/^edit /.test(h.reason) ? ` (${h.reason})` : ''}${h.by ? ' · ' + h.by : ''}` }));
    if (it.lastRelisted) ev.push({ d: it.lastRelisted, i: '🔁', t: 'Relisted' });
    if (Calc.isSold(it) && it.dateSold) ev.push({ d: it.dateSold, i: '💰', t: `Sold on ${platformLabel(it.platform) || 'an unknown platform'} for ${U.money(it.sellingPrice)}` });
    if (typeof activityFor === 'function') activityFor(it.id).filter((a) => !a.priceOnly).forEach((a) => ev.push({ d: U.toISO(new Date(a.t)), at: a.t, i: '👤', t: `${a.by}: ${a.text}`, who: true }));
    ev.sort((a, b) => (a.d || '').localeCompare(b.d || '') || (a.at || 0) - (b.at || 0));
    if (!ev.length) return '<div class="muted small">No dates recorded yet.</div>';
    return `<ol class="tl">${ev.map((e) => `<li class="${e.who ? 'tl-who' : ''}"><span class="tl-i">${e.i}</span><span class="tl-d">${esc(U.fmtDate(e.d))}</span><span class="tl-t">${esc(e.t)}</span></li>`).join('')}</ol>`;
  }
  async function openItemSheet(itOrId) {
    const id = typeof itOrId === 'string' ? itOrId : itOrId && itOrId.id;
    const it = state.items.find((x) => x.id === id); if (!it) return;
    let photo = state.thumbs[id] && state.thumbs[id].thumb;
    try { const ph = await Store.getPhoto(id); if (ph && ph.full) photo = ph.full; } catch (_) { /* thumbnail is fine */ }
    const sold = Calc.isSold(it), d = Calc.daysActive(it), age = Calc.ageClass(it, S());
    const facts = [['SKU', it.sku], ['Category', it.category], ['Brand', it.brand], ['Size', it.size], ['Color', it.color], ['Condition', it.condition], ['Material', it.material], ['Location', it.location], ['Bought', it.purchaseDate ? U.fmtDate(it.purchaseDate) : ''], ['Source', it.source]]
      .filter(([, v]) => v).map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
    const lst = (it.listings || []).filter((l) => l.platform || l.url);
    const edited = it.editedBy ? `<div class="sh-edited">Last edited by <b>${esc(it.editedBy)}</b>${it.updatedAt ? ' · ' + esc(timeAgo(it.updatedAt)) : ''}</div>` : '';
    const body = `<div class="sheet" data-item="${esc(it.id)}">
      <div class="sh-photo ${photo ? '' : 'none'}">${photo ? `<img src="${photo}" alt="">` : `<button type="button" class="sh-add" data-sh="photo">${ICON.camera || ''}<span>Add a photo</span><em>or drag &amp; drop images here</em></button>`}
        <span class="sh-age age-${age}">${sold ? 'Sold' : d !== null ? d + ' days listed' : 'Not listed yet'}</span></div>
      <div class="sh-main">
        <div class="sh-top">${statusBadge(it.status)}${it.bundle ? ' <span class="badge b-other">bundle</span>' : ''}<span class="sh-price"${sitePrices(it) ? ` title="${esc(sitePrices(it).tip)}"` : ''}>${esc(priceText(it))}</span></div>
        <div class="sh-facts">${facts || '<span class="muted small">No details yet — add brand, size and more with Edit.</span>'}</div>
        ${lst.length ? `<div class="sh-listed">${lst.map((l) => `<span class="sh-lp st-${esc(l.status || 'active')}">${platformTag(l.platform)}${l.status === 'active' && listPrice(it, l) != null ? `<b>${esc(U.money(listPrice(it, l)))}</b>` : `<em>${esc(l.status || '')}</em>`}${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="Open listing">↗</a>` : ''}</span>`).join('')}</div>` : ''}
        <div class="sh-actions">
          <button class="btn btn-primary btn-sm" data-sh="edit">${ICON.edit} Edit all fields</button>
          ${sold ? `<button class="btn btn-sm btn-gold" data-sh="invoice">🧾 Invoice</button><button class="btn btn-sm" data-sh="slip">Packing slip</button><button class="btn btn-sm" data-sh="thanks">Thank-you card</button>` : `<button class="btn btn-gold btn-sm" data-sh="sold">${ICON.sold} Mark sold</button>`}
          ${sold ? '' : `<button class="btn btn-sm btn-xl" data-sh="xlist">${ICON.xlist} Cross-list</button>`}
          <button class="btn btn-sm" data-sh="photos">📷 Photos${(it.photos || []).length ? ' (' + ((it.photos || []).length + (state.thumbs[it.id] ? 1 : 0)) + ')' : ''}</button>
          ${sold ? `<button class="btn btn-sm" data-sh="refund">Refund / return</button>` : ''}
          <button class="btn btn-sm" data-sh="share">📣 Share card</button>
          <button class="btn btn-sm" data-sh="label">QR label</button>
          <button class="btn btn-sm btn-ghost" data-sh="dup">${ICON.dup} Duplicate</button>
        </div>
        ${edited}
      </div>
      ${window.Ext && Ext.sheetTop ? Ext.sheetTop(it) : ''}
      <div class="sh-card"><h4>Where the money goes</h4>${moneyFlow(it)}</div>
      <div class="sh-card"><h4>Timeline</h4>${itemTimeline(it)}</div>
      ${(it.priceHistory || []).length ? `<div class="sh-card sh-wide"><h4>Price history</h4>${priceChart(it)}</div>` : ''}
      ${it.notes || it.description ? `<div class="sh-card sh-wide"><h4>Notes</h4><div class="sh-notes">${esc(it.description || '')}${it.description && it.notes ? '<br><br>' : ''}${esc(it.notes || '')}</div></div>` : ''}
      ${window.Ext && Ext.sheetBottom ? Ext.sheetBottom(it) : ''}
    </div>`;
    let sheetDrop = null;
    const go = await U.modal({
      title: it.name || 'Item', wide: 'xl', body, buttons: [{ label: 'Close', value: null, cls: 'btn-ghost' }],
      onOpen: (b) => {
        // drop images anywhere on the item details to add them (asks before replacing an existing photo)
        attachDropZone(b, (f, fs) => { sheetDrop = fs || [f]; U.closeModal('__drop'); });
        b.addEventListener('click', (e) => { const a = e.target.closest('[data-sh]'); if (a) U.closeModal(a.dataset.sh); });
        if (window.Ext && Ext.sheetGallery) Ext.sheetGallery(b, it.id);
        else b.querySelectorAll('.sh-strip img[data-ph]').forEach((im) => im.addEventListener('click', () => { const main = b.querySelector('.sh-photo img'); if (main) main.src = im.dataset.full || im.src; b.querySelectorAll('.sh-strip img').forEach((x) => x.classList.toggle('on', x === im)); }));
      }
    });
    if (go === 'edit') itemDialog(it);
    else if (go === 'sold') markSoldDialog([it]);
    else if (go === 'dup') duplicateItems([it]);
    else if (go === 'label') Labels.print([it], labelCtx());
    else if (go === 'xlist') crossListDialog([it]);
    else if (go && window.Ext && Ext.sheetAction && Ext.sheetAction(go, it)) { /* handled by an add-on */ }
    else if (go === 'slip' && typeof Print !== 'undefined') Print.packingSlip([it], printCtx());
    else if (go === 'thanks' && typeof Print !== 'undefined') Print.thankYou([it], printCtx());
    else if (go === '__drop' && sheetDrop) { if (window.Ext && Ext.photoDrop) await Ext.photoDrop(it, sheetDrop); else await setPhoto(it, sheetDrop[0]); openItemSheet(it.id); }
    else if (go === 'photo') { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.onchange = async () => { const fs = [...inp.files]; if (fs.length) { if (window.Ext && Ext.photoDrop) await Ext.photoDrop(it, fs); else await setPhoto(it, fs[0]); openItemSheet(it.id); } }; inp.click(); }
  }
  function timeAgo(ms) {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 86400 * 7) return Math.round(s / 86400) + ' d ago';
    return U.fmtDate(U.toISO(new Date(ms)));
  }


  /* =========================================================
     Cross-listing helper — everything ready to paste into each site
     ========================================================= */
  async function copyText(t, what) {
    try { await navigator.clipboard.writeText(t); }
    catch (_) { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (__) { /* ignore */ } ta.remove(); }
    U.toast(`${what || 'Text'} copied — paste it on the site`, 'ok');
  }
  const STOP = new Set(['the', 'and', 'with', 'for', 'size', 'womens', 'mens', 'women', 'men', 'new', 'from', 'this', 'that', 'top']);
  function hashtagsFor(it, n) {
    if (!n) return '';
    const words = [it.brand, ...String(it.category || '').split(/[\s/,&+-]+/), it.color, ...String(it.name || '').split(/[\s/,&+-]+/)].filter(Boolean)
      .map((w) => String(w).toLowerCase().replace(/[^a-z0-9]/g, '')).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
    return uniq(words).slice(0, n).map((w) => '#' + w).join(' ');
  }
  const cutTo = (t, max) => { t = String(t || '').trim(); if (!max || t.length <= max) return t; const c = t.slice(0, max + 1); const sp = c.lastIndexOf(' '); return (sp > max * 0.6 ? c.slice(0, sp) : t.slice(0, max)).trim(); };
  /** the price on this platform that pays you the same as `target` */
  function priceToKeep(p, target) {
    let lo = 0, hi = Math.max(10, target * 4);
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (Calc.platformEstimate(p, m).payout >= target) hi = m; else lo = m; }
    return Math.ceil(hi);
  }
  function xlDraft(it, p) {
    const tpl = S().templates || {};
    const baseTitle = fillTemplate(tpl.title || '{name}', it) || it.name || '';
    let desc = fillTemplate(tpl.description || '', it) || it.name || '';
    if (p.noTitle && !desc.toLowerCase().startsWith(baseTitle.toLowerCase())) desc = `${baseTitle}\n\n${desc}`.trim();
    const tags = hashtagsFor(it, +p.hashtags || 0);
    if (tags) desc = `${desc}\n\n${tags}`;
    if (p.descMax && desc.length > p.descMax) desc = desc.slice(0, p.descMax);
    return { title: cutTo(baseTitle, p.titleMax), fullTitle: baseTitle, desc, price: it.sellingPrice ?? '' };
  }
  const xlTargets = () => profiles().filter((p) => p.active !== false && !/^in person$/i.test(p.name));
  async function crossListDialog(items) {
    items = (items || []).filter(Boolean);
    if (!items.length) { U.toast('Select unsold items to cross-list'); return; }
    const targets = xlTargets();
    if (!targets.length) { U.toast('Add your platforms on the Platforms tab first', 'err'); return; }
    let idx = 0;
    const root = document.createElement('div');
    root.className = 'xl';
    let cur = null, pid = null, draft = null, photo = null;
    const listingFor = (it, p) => (it.listings || []).find((l) => (l.platform || '').toLowerCase() === p.name.toLowerCase());
    const pick = (it) => { const firstOpen = targets.find((p) => { const l = listingFor(it, p); return !l || l.status !== 'active'; }); return (firstOpen || targets[0]).id; };
    const load = async () => {
      cur = findItem(items[idx].id) || items[idx];
      photo = null;
      try { const ph = await Store.getPhoto(cur.id); photo = ph && (ph.full || ph.thumb); } catch (_) { /* none */ }
      if (!photo && state.thumbs[cur.id]) photo = state.thumbs[cur.id].thumb;
      pid = pick(cur); draft = null; draw();
    };
    const draw = () => {
      const p = targets.find((x) => x.id === pid) || targets[0];
      if (!draft || draft.pid !== p.id) draft = { pid: p.id, ...xlDraft(cur, p) };
      const done = targets.filter((x) => (listingFor(cur, x) || {}).status === 'active').length;
      const L = listingFor(cur, p);
      const est = Calc.platformEstimate(p, U.num(draft.price) || 0);
      const keep = cur.sellingPrice != null ? priceToKeep(p, cur.sellingPrice) : null;
      const sell = p.sellUrl || p.url;
      const tLen = draft.title.length, dLen = draft.desc.length;
      const facts = [['Brand', cur.brand], ['Size', cur.size], ['Color', cur.color], ['Condition', cur.condition], ['Material', cur.material], ['Category', cur.category], ['Measurements', cur.measurements], ['Weight', cur.weight], ['SKU', cur.sku]].filter(([, v]) => v);
      root.innerHTML = `
        <div class="xl-top">
          <div class="xl-ph">${photo ? `<img src="${photo}" alt="">` : '<span>No photo</span>'}</div>
          <div class="xl-it"><b>${esc(cur.name)}</b><span class="muted small">${cur.sku ? 'SKU ' + esc(cur.sku) + ' · ' : ''}${esc(U.money(cur.sellingPrice))}${items.length > 1 ? ` · item ${idx + 1} of ${items.length}` : ''}</span>
            <div class="xl-prog"><i style="width:${(done / targets.length) * 100}%"></i></div><span class="small">Listed on <b>${done}</b> of ${targets.length} sites</span></div>
        </div>
        <div class="xl-plats">${targets.map((x) => { const l = listingFor(cur, x); const st = l ? l.status : ''; return `<button type="button" class="xl-pl ${x.id === p.id ? 'on' : ''} ${st === 'active' ? 'done' : ''}" data-xp="${esc(x.id)}" style="--pc:${esc(x.color)}"><span class="plat-dot"></span>${esc(x.name)}${st === 'active' ? ' <i>✓</i>' : st ? ` <em>${esc(st)}</em>` : ''}</button>`; }).join('')}</div>
        ${L && L.status === 'active' ? `<div class="xl-already">✓ Already listed on ${esc(p.name)}${L.url ? ` — <a href="${esc(L.url)}" target="_blank" rel="noopener noreferrer">open the listing ↗</a>` : ''}. You can still copy the details or update the link below.</div>` : ''}
        <ol class="xl-steps">
          <li><div class="xl-sh"><b>Save the photo</b><span class="muted small">Upload it on ${esc(p.name)}${/depop|poshmark/i.test(p.name) ? ' (square photos look best there)' : ''}.</span></div>
            <div class="xl-row">${photo ? `<button type="button" class="btn btn-sm" data-xa="dl">⬇ Save ${window.Ext && Ext.photoKeys && Ext.photoKeys(cur).length > 1 ? 'all ' + Ext.photoKeys(cur).length + ' photos' : 'photo'}</button>${navigator.canShare ? '<button type="button" class="btn btn-sm" data-xa="share">Share / save to Photos</button>' : ''}` : '<span class="muted small">No photo yet — add one from the item’s details, or use your phone’s photos directly.</span>'}</div></li>
          <li><div class="xl-sh"><b>Open ${esc(p.name)}</b><span class="muted small">Starts a new listing in another tab — keep this window open.</span></div>
            <div class="xl-row">${sell ? `<a class="btn btn-primary btn-sm" href="${esc(U.normUrl(sell))}" target="_blank" rel="noopener noreferrer" data-xa="open">Open ${esc(p.name)} “sell” page ↗</a>` : `<span class="muted small">No link saved for ${esc(p.name)} — add its “Sell an item” page in Platforms → Edit.</span>`}</div></li>
          <li><div class="xl-sh"><b>Copy &amp; paste the details</b><span class="muted small">Edit here first if you like — changes are just for this listing.</span></div>
            ${p.noTitle ? `<p class="xl-note">${esc(p.name)} has no title field, so the title is at the top of the description.</p>` : `
            <div class="xl-field"><div class="xl-lab"><span>Title</span><span class="xl-cnt ${p.titleMax && tLen > p.titleMax ? 'over' : ''}">${tLen}${p.titleMax ? ' / ' + p.titleMax : ''}</span></div>
              <div class="xl-in"><input data-xf="title" value="${esc(draft.title)}"><button type="button" class="btn btn-sm" data-xc="title">Copy</button></div>
              ${p.titleMax && draft.fullTitle.length > p.titleMax ? `<span class="muted small">Shortened to fit ${esc(p.name)}’s ${p.titleMax}-character limit.</span>` : ''}</div>`}
            <div class="xl-field"><div class="xl-lab"><span>Description${+p.hashtags ? ` (with ${+p.hashtags} hashtags)` : ''}</span><span class="xl-cnt ${p.descMax && dLen > p.descMax ? 'over' : ''}">${dLen}${p.descMax ? ' / ' + p.descMax : ''}</span></div>
              <div class="xl-in"><textarea data-xf="desc" rows="6">${esc(draft.desc)}</textarea><button type="button" class="btn btn-sm" data-xc="desc">Copy</button></div></div>
            <div class="xl-field"><div class="xl-lab"><span>Price on ${esc(p.name)}</span></div>
              <div class="xl-in xl-price"><input data-xf="price" inputmode="decimal" value="${esc(draft.price)}"><button type="button" class="btn btn-sm" data-xc="price">Copy</button></div>
              <span class="small">You’d keep about <b>${U.money(est.payout)}</b> here (fees ${U.money(est.fees)}).${keep && keep !== +draft.price ? ` <button type="button" class="linklike" data-xa="keep" data-v="${keep}">Use ${U.money0(keep)} to keep ${U.money(cur.sellingPrice)} after fees</button>` : ''}</span></div>
            ${facts.length ? `<div class="xl-facts">${facts.map(([k, v]) => `<button type="button" class="xl-fact" data-xcopy="${esc(v)}" data-xname="${esc(k)}" title="Copy ${esc(k)}"><span>${esc(k)}</span>${esc(v)}</button>`).join('')}</div>` : ''}
            <div class="xl-row"><button type="button" class="btn btn-sm btn-ghost" data-xa="all">Copy everything at once</button></div></li>
          <li><div class="xl-sh"><b>Publish it on ${esc(p.name)}, then paste the listing link here</b><span class="muted small">That marks the item as listed there, so the delist checklist can find it when it sells elsewhere.</span></div>
            <div class="xl-in"><input data-xf="url" placeholder="Paste the ${esc(p.name)} listing link (optional)" value="${esc(L && L.url ? L.url : '')}"><button type="button" class="btn btn-gold btn-sm" data-xa="mark">✓ Mark listed on ${esc(p.name)}</button></div>
            <span class="xl-warn small" data-xwarn></span></li>
        </ol>`;
    };
    const markListed = () => {
      const p = targets.find((x) => x.id === pid);
      const url = root.querySelector('[data-xf="url"]').value.trim();
      const from = url ? U.platformFromUrl(url) : '';
      if (from && profileFor(from) && from.toLowerCase() !== p.name.toLowerCase()) {
        root.querySelector('[data-xwarn]').textContent = `That link looks like ${platformLabel(from)}, not ${p.name}. Check it, or pick ${platformLabel(from)} above.`;
        return;
      }
      const it = U.clone(findItem(cur.id));
      const price = U.num(draft.price);
      it.listings = (it.listings || []).map((l) => ({ ...l }));
      let l = it.listings.find((x) => (x.platform || '').toLowerCase() === p.name.toLowerCase());
      if (!l) { l = { platform: p.name.toLowerCase(), url: '', status: 'active', statusDate: '' }; it.listings.push(l); }
      l.status = 'active'; l.statusDate = U.todayISO(); if (url) l.url = U.normUrl(url);
      if (price !== null && price !== it.sellingPrice) l.price = price; else delete l.price;
      if (!it.datePosted) it.datePosted = U.todayISO();
      commit('items', [{ id: it.id, after: it }], { label: 'cross-listed on ' + p.name });
      cur = findItem(it.id);
      renderView(currentView());
      U.toast(`Marked as listed on ${p.name}`, 'ok');
      const next = targets.find((x) => { const ll = listingFor(cur, x); return !ll || ll.status !== 'active'; });
      if (next) { pid = next.id; draft = null; }
      draw();
      if (!next) U.toast('Listed everywhere! 🎉', 'ok');
    };
    root.addEventListener('input', (e) => {
      const f = e.target.closest('[data-xf]'); if (!f || f.dataset.xf === 'url') return;
      draft[f.dataset.xf] = f.value;
      if (f.dataset.xf === 'price') { const pos = f.selectionStart; draw(); const n = root.querySelector('[data-xf="price"]'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { /* ignore */ } return; }
      const cnt = f.closest('.xl-field').querySelector('.xl-cnt'); const p = targets.find((x) => x.id === pid); const max = f.dataset.xf === 'title' ? p.titleMax : p.descMax;
      if (cnt) { cnt.textContent = f.value.length + (max ? ' / ' + max : ''); cnt.classList.toggle('over', !!max && f.value.length > max); }
    });
    root.addEventListener('click', async (e) => {
      const pl = e.target.closest('[data-xp]'); if (pl) { pid = pl.dataset.xp; draft = null; draw(); return; }
      const c = e.target.closest('[data-xc]'); if (c) { const k = c.dataset.xc; copyText(String(draft[k] ?? ''), { title: 'Title', desc: 'Description', price: 'Price' }[k]); return; }
      const fc = e.target.closest('[data-xcopy]'); if (fc) { copyText(fc.dataset.xcopy, fc.dataset.xname); return; }
      const a = e.target.closest('[data-xa]'); if (!a) return;
      const p = targets.find((x) => x.id === pid);
      const fname = `${U.slug(cur.sku || cur.name || 'item')}.jpg`;
      const allPh = window.Ext && Ext.photoFiles ? await Ext.photoFiles(cur) : [{ name: fname, data: photo }];
      if (a.dataset.xa === 'dl') allPh.forEach((p, i) => setTimeout(() => { const link = document.createElement('a'); link.href = p.data; link.download = p.name; document.body.appendChild(link); link.click(); link.remove(); }, i * 350));
      if (a.dataset.xa === 'share') { try { const files = await Promise.all(allPh.map(async (p) => { const blob = await (await fetch(p.data)).blob(); return new File([blob], p.name, { type: blob.type || 'image/jpeg' }); })); if (navigator.canShare({ files })) await navigator.share({ files, title: cur.name }); else U.toast('This device can’t share photos — use Save photos instead'); } catch (_) { /* cancelled */ } }
      if (a.dataset.xa === 'keep') { draft.price = a.dataset.v; draw(); }
      if (a.dataset.xa === 'all') copyText([p.noTitle ? '' : draft.title, draft.desc, draft.price !== '' ? 'Price: ' + U.money(U.num(draft.price)) : ''].filter(Boolean).join('\n\n'), 'Everything');
      if (a.dataset.xa === 'mark') markListed();
    });
    await load();
    for (;;) {
      const last = idx >= items.length - 1;
      const r = await U.modal({ title: `Cross-list${items.length > 1 ? ` (${idx + 1}/${items.length})` : ''}`, wide: 'xl', body: root,
        buttons: [{ label: 'Close', value: null, cls: 'btn-ghost' }, ...(last ? [] : [{ label: 'Next item →', value: 'next', cls: 'btn-primary' }])] });
      if (r !== 'next') break;
      idx++; await load();
    }
  }

  async function markSoldDialog(list, { pick = false } = {}) {
    if (!list.length && !pick) { U.toast('No unsold items selected'); return; }
    const single = list.length === 1 || pick;
    const it = single && list[0] ? list[0] : null;
    const avail = state.items.filter((x) => !Calc.isSold(x)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const body = document.createElement('div');
    body.innerHTML = `
      ${pick ? `<label class="field"><span>Item *</span><select name="item"><option value="">Choose an unsold item…</option>${avail.map((x) => `<option value="${esc(x.id)}">${esc((x.sku ? '#' + x.sku + ' · ' : '') + x.name)} — ${esc(U.money(x.sellingPrice))}</option>`).join('')}</select></label>` : ''}
      ${!single ? `<div class="bundle-pick">
          <label class="radio-card"><input type="radio" name="mode" value="each" checked><span><b>Separate sales</b><em>Each item sold on its own and keeps its own price.</em></span></label>
          <label class="radio-card"><input type="radio" name="mode" value="bundle"><span><b>One order (bundle)</b><em>The buyer bought all ${list.length} together — enter the order total and the app splits it.</em></span></label></div>
        <div data-each><label class="check"><input type="checkbox" name="fillEst" checked> Fill in Total After Fees with each item’s estimated payout (from the platform’s fee settings)</label></div>
        <div data-bundle class="hidden">
          <div class="form-grid g3">
            <label class="field"><span>Order total (what the buyer paid for the items)</span><input name="bTotal" inputmode="decimal" value="${U.round2(list.reduce((a, x) => a + (+x.sellingPrice || 0), 0))}"></label>
            <label class="field"><span>Order payout (after fees)</span><input name="bNet" inputmode="decimal" placeholder="estimated from fees"></label>
            <label class="field"><span>Shipping you paid (whole order)</span><input name="bShip" inputmode="decimal" placeholder="0"></label>
          </div>
          <label class="field"><span>Split the order between the items</span><select name="bSplit"><option value="price">In proportion to their list prices</option><option value="even">Evenly</option><option value="cost">In proportion to what you paid</option></select></label>
          <div class="bundle-prev" data-bprev></div>
        </div>` : ''}
      ${it && (it.listings || []).length ? `<div class="sold-on">Listed on: ${(it.listings || []).map((l) => `<button type="button" class="chip-btn" data-plat="${esc(l.platform)}" style="--c:${platformColor(l.platform)}">${esc(platformLabel(l.platform))}${l.price != null ? ` · ${esc(U.money(l.price))}` : ''}</button>`).join('')}</div>` : ''}
      <div class="form-grid">
        <label class="field"><span>Platform it sold</span><input name="platform" list="dlPlat2" value="${esc(platformLabel(it?.platform || (it?.listings || [])[0]?.platform || ''))}"></label>
        <label class="field"><span>Date Sold</span><input type="date" name="dateSold" value="${U.todayISO()}"></label>
        ${single ? `
        <label class="field"><span>Sale Price</span><input name="sellingPrice" inputmode="decimal" value="${numVal(it ? listPrice(it, (it.listings || []).find((l) => l.platform === (it.platform || (it.listings || [])[0]?.platform || ''))) : null)}"></label>
        <label class="field"><span>Total After Fees (payout)</span><input name="totalAfterFees" inputmode="decimal" value=""></label>
        <label class="field"><span>Shipping Cost (paid by you)</span><input name="shippingCost" inputmode="decimal" value="${numVal(it?.shippingCost)}"></label>
        <label class="field"><span>Purchase Price</span><input name="purchasePrice" inputmode="decimal" value="${numVal(it?.purchasePrice)}"></label>` : ''}
      </div>
      ${single ? '<p class="est-hint" data-est></p><div class="calc-box"><div>Fees<b data-c="fees">—</b></div><div>Profit<b data-c="profit">—</b></div><div>Margin<b data-c="margin">—</b></div></div>' : ''}
      ${dl('dlPlat2', allPlatforms())}`;
    let target = it;
    const f = (n) => body.querySelector(`[name="${n}"]`);
    const calc = () => {
      if (!single) return;
      const sp = U.num(f('sellingPrice').value), net = U.num(f('totalAfterFees').value), cost = U.num(f('purchasePrice').value) || 0, ship = U.num(f('shippingCost').value) || 0;
      const n = net ?? sp ?? 0;
      const fees = sp !== null && net !== null ? sp - net : null;
      const profit = n - cost - ship;
      body.querySelector('[data-c=fees]').textContent = fees === null ? '—' : U.money(fees);
      body.querySelector('[data-c=profit]').textContent = U.money(profit);
      body.querySelector('[data-c=margin]').textContent = sp ? U.pct(profit / sp) : '—';
    };
    if (pick) f('item').addEventListener('change', (e) => {
      target = findItem(e.target.value);
      if (target) { f('sellingPrice').value = numVal(target.sellingPrice); f('purchasePrice').value = numVal(target.purchasePrice); f('shippingCost').value = numVal(target.shippingCost); f('platform').value = platformLabel(target.platform || (target.listings || [])[0]?.platform || ''); }
      estimate(); calc();
    });
    // estimate payout from the platform's fee settings until the user types their own figure
    let netTouched = false, shipTouched = false;
    const estimate = () => {
      if (!single) return;
      const hint = body.querySelector('[data-est]');
      const pname = f('platform').value.trim();
      const prof = profileFor(pname);
      const sp = U.num(f('sellingPrice').value);
      if (!prof) { hint.innerHTML = pname ? `No fee settings for “${esc(pname)}” yet — add them on the Platforms tab to get estimates.` : ''; return; }
      if (sp === null) { hint.textContent = ''; return; }
      const e = Calc.platformEstimate(prof, sp);
      hint.innerHTML = `<span class="plat-dot" style="--pc:${esc(prof.color)}"></span> Estimated ${esc(prof.name)} fees <b>${U.money(e.fees)}</b> (${U.pct(e.rate)}) → payout <b>${U.money(e.payout)}</b>${e.sellerShip ? ` · your shipping <b>${U.money(e.sellerShip)}</b>` : ''}${netTouched ? ' · using the payout you entered' : ' · filled in below, edit to match your actual payout'}`;
      if (!netTouched) f('totalAfterFees').value = e.payout.toFixed(2);
      if (!shipTouched && e.sellerShip && (f('shippingCost').value.trim() === '' || f('shippingCost').dataset.auto)) { f('shippingCost').value = e.sellerShip.toFixed(2); f('shippingCost').dataset.auto = '1'; }
    };
    body.addEventListener('input', (e) => {
      if (e.target.name === 'totalAfterFees') netTouched = e.target.value.trim() !== '';
      if (e.target.name === 'shippingCost') { shipTouched = true; delete e.target.dataset.auto; }
      if (['platform', 'sellingPrice', 'totalAfterFees'].includes(e.target.name)) estimate();
      if (e.target.name === 'bNet') bNetTouched = e.target.value.trim() !== '';
      calc(); bundlePrev();
    });
    let bNetTouched = false;
    const splitShares = (total, how) => {
      const w = list.map((x) => how === 'even' ? 1 : how === 'cost' ? (+x.purchasePrice || 0) : (+x.sellingPrice || 0));
      const sum = w.reduce((a, b) => a + b, 0) || list.length;
      const ws = w.map((x) => (sum === list.length && !w.some(Boolean) ? 1 : x));
      const tot = ws.reduce((a, b) => a + b, 0);
      const raw = ws.map((x) => U.round2(total * x / tot));
      const diff = U.round2(total - raw.reduce((a, b) => a + b, 0)); raw[raw.length - 1] = U.round2(raw[raw.length - 1] + diff);
      return raw;
    };
    const bundlePrev = () => {
      if (single || !f('mode')) return;
      const bundle = body.querySelector('[name=mode]:checked').value === 'bundle';
      body.querySelector('[data-each]').classList.toggle('hidden', bundle);
      body.querySelector('[data-bundle]').classList.toggle('hidden', !bundle);
      if (!bundle) return;
      const total = U.num(f('bTotal').value) || 0;
      const prof = profileFor(f('platform').value.trim());
      if (!bNetTouched) f('bNet').value = prof ? Calc.platformEstimate(prof, total).payout.toFixed(2) : '';
      const net = U.num(f('bNet').value) ?? total, ship = U.num(f('bShip').value) || 0, how = f('bSplit').value;
      const P = splitShares(total, how), N = splitShares(net, how), Sh = splitShares(ship, how);
      const profit = U.round2(net - ship - list.reduce((a, x) => a + (+x.purchasePrice || 0), 0));
      body.querySelector('[data-bprev]').innerHTML = `<table class="mini-t"><tr><th>Item</th><th class="n">Price share</th><th class="n">Payout</th><th class="n">Profit</th></tr>${list.map((x, i) => `<tr><td>${esc(x.name)}</td><td class="n">${U.money(P[i])}</td><td class="n">${U.money(N[i])}</td><td class="n">${U.money(N[i] - Sh[i] - (+x.purchasePrice || 0))}</td></tr>`).join('')}<tr class="tot"><td>Order</td><td class="n">${U.money(total)}</td><td class="n">${U.money(net)}</td><td class="n">${U.money(profit)}</td></tr></table>`;
    };
    body.addEventListener('change', (e) => { if (['mode', 'bSplit'].includes(e.target.name)) bundlePrev(); });
    // picking the site it sold on fills in that site's listed price (until you type a price yourself)
    let priceTyped = false;
    if (f('sellingPrice')) f('sellingPrice').addEventListener('input', () => { priceTyped = true; });
    const sitePrice = () => {
      const cur = it && (findItem(it.id) || it); if (!cur || priceTyped || !f('sellingPrice')) return;
      const key = String(f('platform').value || '').trim().toLowerCase();
      const l = (cur.listings || []).find((x) => x.platform === key || platformLabel(x.platform).toLowerCase() === key);
      const v = l ? listPrice(cur, l) : cur.sellingPrice;
      if (v != null) { f('sellingPrice').value = numVal(v); f('sellingPrice').dispatchEvent(new Event('input', { bubbles: true })); priceTyped = false; }
    };
    if (f('platform')) f('platform').addEventListener('change', () => { sitePrice(); });
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-plat]'); if (b) { f('platform').value = platformLabel(b.dataset.plat); sitePrice(); estimate(); calc(); } });
    // offers on this item → one tap fills the price
    if (single && it && (it.offers || []).some((o) => o.status !== 'declined')) {
      const box = document.createElement('div'); box.className = 'offer-fill';
      box.innerHTML = `<span class="muted small">Offers:</span> ${(it.offers || []).filter((o) => o.status !== 'declined').slice(-4).map((o) => `<button type="button" class="chip-btn" data-offer="${esc(o.counter ?? o.amount)}" data-oplat="${esc(o.platform)}">${esc(U.money(o.counter ?? o.amount))}${o.platform ? ' · ' + esc(platformLabel(o.platform)) : ''}${o.status === 'accepted' ? ' ✓' : ''}</button>`).join(' ')}`;
      body.insertBefore(box, body.querySelector('.form-grid'));
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-offer]'); if (!b) return; f('sellingPrice').value = b.dataset.offer; if (b.dataset.oplat) f('platform').value = platformLabel(b.dataset.oplat); netTouched = false; estimate(); calc(); });
    }
    // the item's package → shipping cost when you pay shipping on that site
    const pkgShip = () => {
      if (!single || !target || shipTouched) return;
      const pk = (S().packages || []).find((p) => p.id === target.pkg); const prof = profileFor(f('platform').value.trim());
      if (pk && pk.cost != null && pk.cost !== '' && prof && prof.shipPaidBy !== 'buyer' && (f('shippingCost').value.trim() === '' || f('shippingCost').dataset.auto)) { f('shippingCost').value = (+pk.cost).toFixed(2); f('shippingCost').dataset.auto = '1'; }
    };
    body.addEventListener('input', (e) => { if (e.target.name === 'platform') { pkgShip(); calc(); } });
    estimate(); pkgShip(); calc(); bundlePrev();
    const ok = await U.modal({
      title: single ? (it ? `Record sale — ${it.name}` : 'Record a sale') : 'Mark items as sold', body,
      buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'Record sale', cls: 'btn-primary', validate: () => { if (pick && !target) { f('item').focus(); return false; } return true; } }]
    });
    if (!ok) return;
    const platform = f('platform').value.trim().toLowerCase();
    const dateSold = f('dateSold').value || U.todayISO();
    if (single) {
      const t = target;
      const patch = { status: 'sold', platform, dateSold, sellingPrice: f('sellingPrice').value.trim() === '' ? t.sellingPrice : U.round2(U.num(f('sellingPrice').value) ?? 0), totalAfterFees: f('totalAfterFees').value.trim() === '' ? null : U.round2(U.num(f('totalAfterFees').value) ?? 0), shippingCost: f('shippingCost').value.trim() === '' ? null : U.round2(U.num(f('shippingCost').value) ?? 0), purchasePrice: f('purchasePrice').value.trim() === '' ? t.purchasePrice : U.round2(U.num(f('purchasePrice').value) ?? 0) };
      commit('items', [{ id: t.id, after: markListingsSold({ ...U.clone(t), ...patch }) }], { label: 'record sale' });
      if (!Calc.isSold(t)) celebrateSale([findItem(t.id)]);
      if (needsDelist(findItem(t.id))) setTimeout(() => delistChecklist(findItem(t.id)), S().celebrate === false ? 200 : 2500);
      if (t.location) setTimeout(() => U.toast(`📦 Pull it from ${t.location}`, 'ok', { ms: 8000 }), 1200);
    } else if (f('mode') && body.querySelector('[name=mode]:checked').value === 'bundle') {
      const total = U.num(f('bTotal').value) || 0, net = U.num(f('bNet').value) ?? total, ship = U.num(f('bShip').value) || 0, how = f('bSplit').value;
      const P = splitShares(total, how), N = splitShares(net, how), Sh = splitShares(ship, how);
      const orderId = 'ord-' + U.uid().slice(0, 8);
      commit('items', list.map((x, i) => ({ id: x.id, after: markListingsSold({ ...U.clone(x), status: 'sold', platform: platform || x.platform || ((x.listings || [])[0] || {}).platform || '', dateSold, sellingPrice: P[i], totalAfterFees: N[i], shippingCost: Sh[i], orderId, orderSize: list.length }) })), { label: `bundle sale (${list.length} items)` });
      celebrateSale(list.filter((x) => !Calc.isSold(x)).map((x) => findItem(x.id)));
      const bins = uniq(list.map((x) => x.location).filter(Boolean));
      if (bins.length) setTimeout(() => U.toast(`📦 Pull them from ${bins.join(', ')}`, 'ok', { ms: 9000 }), 1200);
      const nDel = list.filter((x) => needsDelist(findItem(x.id))).length;
      if (nDel) setTimeout(() => U.toast(`${nDel} of the bundled items are still listed elsewhere — see the Action Center to delist.`, '', { label: 'Open', fn: () => showView('actions') }), 2000);
    } else {
      const fill = f('fillEst') && f('fillEst').checked;
      commit('items', list.map((x) => {
        const after = { ...U.clone(x), status: 'sold', platform: platform || x.platform || ((x.listings || [])[0] || {}).platform || '', dateSold };
        const prof = profileFor(after.platform);
        if (fill && prof && after.totalAfterFees == null && after.sellingPrice != null) {
          const e = Calc.platformEstimate(prof, after.sellingPrice);
          after.totalAfterFees = e.payout;
          if (after.shippingCost == null && e.sellerShip) after.shippingCost = e.sellerShip;
        }
        return { id: x.id, after: markListingsSold(after) };
      }), { label: 'mark sold' });
      celebrateSale(list.filter((x) => !Calc.isSold(x)).map((x) => findItem(x.id)));
      const nDel = list.filter((x) => needsDelist(findItem(x.id))).length;
      if (nDel) setTimeout(() => U.toast(`${nDel} sold item(s) are still listed elsewhere — see the Action Center to delist.`, '', { label: 'Open', fn: () => showView('actions') }), 1800);
    }
    addListValue('platforms', platform);
    renderAll();
    U.toast(single ? 'Sale recorded' : (f('mode') && body.querySelector('[name=mode]:checked').value === 'bundle' ? `Bundle of ${list.length} recorded as one order` : `${list.length} items marked sold`), 'ok');
  }

  function flashRow(id) {
    requestAnimationFrame(() => {
      const tr = $(`#invTable tr[data-id="${CSS.escape(id)}"]`);
      if (tr) {
        const wrap = tr.closest('.table-wrap');
        const w = wrap.getBoundingClientRect(), r = tr.getBoundingClientRect();
        if (r.top < w.top + 40 || r.bottom > w.bottom - 40) wrap.scrollBy({ top: r.top - w.top - w.height / 2 + r.height / 2, behavior: 'smooth' });
        tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1300);
      }
    });
  }

  /* =========================================================
     PRODUCT PHOTOS
     ========================================================= */
  const thumbOf = (r) => (r && state.thumbs[r.id] ? state.thumbs[r.id].thumb : null);
  function refreshPhotoRow(id) {
    const v = currentView();
    if (v === 'inventory') invGrid.refreshRow(id);
    else if (v === 'orders') ordGrid.refreshRow(id);
  }
  async function setPhoto(item, file) {
    if (!item || !file) return;
    saving(1);
    try {
      const ph = await U.processImage(file);
      await Store.putPhoto(item.id, ph);
      state.thumbs[item.id] = { thumb: ph.thumb, w: ph.w, h: ph.h };
      refreshPhotoRow(item.id); if (window.Sync) Sync.changed();
      U.toast('Photo saved' + (item.name ? ' for “' + item.name + '”' : ''), 'ok');
    } catch (e) { console.error(e); U.toast(e.message, 'err'); } finally { saving(-1); }
  }
  async function removePhoto(id) {
    delete state.thumbs[id];
    await persist(() => Store.deletePhotos([id]));
    refreshPhotoRow(id); if (window.Sync) Sync.changed();
  }
  function attachDropZone(el, onFile) {
    const has = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    el.addEventListener('dragover', (e) => { if (!has(e)) return; e.preventDefault(); e.stopPropagation(); el.classList.add('dragging'); });
    el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('dragging'); });
    el.addEventListener('drop', (e) => {
      if (!has(e)) return;
      e.preventDefault(); e.stopPropagation(); el.classList.remove('dragging');
      const fs = Array.from(e.dataTransfer.files).filter(U.isImageFile);
      if (fs.length) onFile(fs[0], fs); else U.toast('Drop an image file (JPG, PNG, WebP…).', 'err');
    });
  }
  async function viewPhoto(item) {
    const body = document.createElement('div');
    body.innerHTML = `<div class="photo-view" data-drop><img src="${thumbOf(item)}" alt="${esc(item.name)}"></div>
      <p class="muted small" style="text-align:center">Drop new images here to add them or replace this one.</p>`;
    const img = body.querySelector('img');
    Store.getPhoto(item.id).then((p) => { if (p && p.full) img.src = p.full; }).catch(() => {});
    let dropped = null;
    attachDropZone(body.querySelector('[data-drop]'), (f, fs) => { dropped = fs || [f]; U.closeModal('dropped'); });
    const res = await U.modal({
      title: item.name || 'Photo', body, wide: true,
      buttons: [
        ...(window.Ext && Ext.photoManager ? [{ label: '📷 All photos', value: 'all', cls: 'btn-ghost' }] : []),
        { label: 'Remove', value: 'remove', cls: 'btn-ghost' },
        { label: 'Download', value: 'download', cls: 'btn-ghost' },
        { label: 'Replace…', value: 'replace', cls: 'btn-ghost' },
        { label: 'Close', value: null, cls: 'btn-primary' }
      ]
    });
    if (res === 'dropped' && dropped) { if (window.Ext && Ext.photoDrop) Ext.photoDrop(item, dropped); else setPhoto(item, dropped[0]); return; }
    if (res === 'all') { Ext.photoManager(item.id); return; }
    if (res === 'remove' && (await U.confirm('Remove photo', `Remove the photo for “${esc(item.name)}”?`, 'Remove', true))) removePhoto(item.id);
    if (res === 'replace') { const f = await U.pickFile('image/*'); if (f) { if (window.Ext && Ext.photoDrop) Ext.photoDrop(item, [f], { mode: 'replace' }); else setPhoto(item, f); } }
    if (res === 'download') {
      const p = await Store.getPhoto(item.id);
      if (p) U.download(await (await fetch(p.full)).blob(), `${U.slug(item.name)}${item.sku ? '-sku' + item.sku : ''}.jpg`);
    }
  }
  const photoConfig = {
    get: thumbOf,
    onClick: async (r) => {
      if (thumbOf(r)) { viewPhoto(r); return; }
      if (window.Ext && Ext.pickFiles && Ext.photoDrop) { const fs = await Ext.pickFiles('image/*', true); if (fs.length) Ext.photoDrop(r, fs); }
      else { const f = await U.pickFile('image/*'); if (f) setPhoto(r, f); }
    },
    onDrop: (r, f, fs) => (window.Ext && Ext.photoDrop ? Ext.photoDrop(r, fs || [f]) : setPhoto(r, f)),
    badge: (r) => (r && String(r.sku || '').trim() ? `<span class="g-sku">SKU ${esc(String(r.sku).trim())}</span>` : '')
  };

  /* =========================================================
     RESIZABLE TABLE WINDOWS
     ========================================================= */
  const HEIGHT_PRESETS = { s: 340, m: 540, l: 800 };
  function fitHeight(wrap) {
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    return Math.max(window.innerWidth < 720 ? Math.round(window.innerHeight * 0.72) : 240, Math.round(window.innerHeight - top - 70));
  }
  function applyHeights() {
    const hs = S().tableHeights || {};
    applyViewMode();
    $$('.table-wrap[data-rz]').forEach((w) => {
      if (!w.offsetParent) return; // hidden view
      const v = hs[w.dataset.rz] ?? 'fit';
      const px = v === 'fit' ? fitHeight(w) : (HEIGHT_PRESETS[v] || +v || 540);
      w.style.maxHeight = px + 'px';
      const bar = w.nextElementSibling;
      if (bar && bar.classList.contains('resize-bar')) {
        $$('[data-h]', bar).forEach((b) => b.classList.toggle('on', b.dataset.h === String(v)));
        $$('[data-rows]', bar).forEach((b) => b.classList.toggle('on', b.dataset.rows === S().rowSize));
        $$('[data-viewmode]', bar).forEach((b) => b.classList.toggle('on', b.dataset.viewmode === (S().viewMode || 'auto')));
      }
    });
    $$('table.grid').forEach((t) => (t.dataset.rows = S().rowSize || 'comfortable'));
  }
  /** Table or card view: "auto" = cards on phones, table on computers (saved per device) */
  function applyViewMode() {
    const m = S().viewMode || 'auto';
    const cards = m === 'cards' || m === 'gallery' || (m !== 'table' && window.matchMedia('(max-width: 720px)').matches);
    document.documentElement.classList.toggle('cards-mode', cards);
    document.documentElement.classList.toggle('gallery-mode', m === 'gallery');
    document.documentElement.classList.toggle('table-mode', !cards);
  }
  function setupResizable(wrap, key, { rows = false } = {}) {
    wrap.dataset.rz = key;
    const bar = document.createElement('div');
    bar.className = 'resize-bar';
    bar.innerHTML = `
      <div class="resize-grip" title="Drag to resize · double-click to fit the window"><span>Drag to resize</span></div>
      <span class="rz-label rz-h">Window</span>
      <div class="seg rz-h">${[['fit', 'Fit screen'], ['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([k, l]) => `<button type="button" data-h="${k}">${l}</button>`).join('')}</div>
      ${rows ? `<span class="rz-label rz-h rz-rows">Rows</span><div class="seg rz-h rz-rows">${[['compact', 'Compact'], ['comfortable', 'Comfortable'], ['large', 'Large']].map(([k, l]) => `<button type="button" data-rows="${k}">${l}</button>`).join('')}</div>
      <span class="rz-label">View</span><div class="seg">${[['auto', 'Auto', 'Cards on phones, table on computers'], ['table', '☰ Table', 'Spreadsheet-style rows'], ['cards', '▦ Cards', 'Tap-to-open cards, like the phone app'], ...(key === 'inv' ? [['gallery', '▣ Gallery', 'Photo grid — tap a photo for the full item page']] : [])].map(([k, l, t]) => `<button type="button" data-viewmode="${k}" title="${t}">${l}</button>`).join('')}</div>` : ''}`;
    wrap.after(bar);
    const save = (v) => { S().tableHeights = { ...(S().tableHeights || {}), [key]: v }; saveSettings(); applyHeights(); };
    bar.addEventListener('click', (e) => {
      const h = e.target.closest('[data-h]'); if (h) save(h.dataset.h);
      const r = e.target.closest('[data-rows]');
      if (r) { S().rowSize = r.dataset.rows; saveSettings(); applyHeights(); renderView(currentView()); }
      const vm = e.target.closest('[data-viewmode]');
      if (vm) { S().viewMode = vm.dataset.viewmode; saveSettings(); applyHeights(); renderView(currentView()); }
    });
    const grip = bar.querySelector('.resize-grip');
    grip.addEventListener('dblclick', () => save('fit'));
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const startY = e.clientY, startH = wrap.offsetHeight;
      bar.classList.add('dragging'); document.body.classList.add('resizing');
      const move = (ev) => { wrap.style.maxHeight = Math.max(180, startH + ev.clientY - startY) + 'px'; };
      const up = () => {
        grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        bar.classList.remove('dragging'); document.body.classList.remove('resizing');
        save(Math.round(parseFloat(wrap.style.maxHeight)));
      };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
  }

  /* =========================================================
     PLATFORMS — fee profiles, listings, calculator
     ========================================================= */
  const PLAT_COLORS = ['#8c2f39', '#d1492e', '#3a6ea5', '#7b4fa0', '#1f7a5c', '#c98a12', '#2c6e6a', '#5b6472', '#b5527f', '#4a7c2a'];
  // US fee rules as published in Nov 2026 — every value is editable on the Platforms tab.
  const C = 'Nov 2026';
  const PLATFORM_PRESETS = {
    poshmark: { name: 'Poshmark', color: '#8c2f39', url: 'https://poshmark.com', sellUrl: 'https://poshmark.com/create-listing', titleMax: 80,  feePct: 20, smallThreshold: 15, smallFlat: 2.95, shipPaidBy: 'buyer', shipCharge: 6.49, checked: C,
      notes: 'Flat $2.95 on sales under $15; 20% on $15 and up, on the sale price only. No separate processing fee. The buyer pays the prepaid USPS label ($6.49, up to 5 lb). You pay the upgrade for heavier boxes (+$5 for 5–10 lb, +$10 for 10–15 lb) and any shipping discount you offer — enter those under “My extra shipping cost”.' },
    depop: { name: 'Depop', color: '#d1492e', url: 'https://www.depop.com', sellUrl: 'https://www.depop.com/products/create/', noTitle: true, descMax: 1000, hashtags: 5,  feePct: 0, procPct: 3.3, procFixed: 0.45, feeOnShipping: true, procOnShipping: true, shipPaidBy: 'buyer', checked: C,
      notes: 'US: no selling fee. Payment processing 3.3% + $0.45 on the full order (item + shipping + tax). Boosted listings cost 12% of a boosted sale — add it under Additional costs if you boost. Buyers pay a separate marketplace fee that doesn’t come out of your payout.' },
    ebay: { name: 'eBay', color: '#3a6ea5', url: 'https://www.ebay.com', sellUrl: 'https://www.ebay.com/sl/sell', titleMax: 80,  feePct: 13.6, feeFixed: 0.40, smallThreshold: 10.01, smallFixed: 0.30, feeOnShipping: true, shipPaidBy: 'buyer', checked: C,
      notes: 'Most categories incl. clothing, shoes & accessories, no Store: 13.6% of the order total (item + shipping + tax) up to $7,500 (2.35% above), plus $0.40 per order ($0.30 on orders of $10 or less). Processing is included. Athletic sneakers $150+: 8% with no per-order fee. 250 free listings a month, then $0.35 each. Store plans and some categories differ.' },
    mercari: { name: 'Mercari', color: '#7b4fa0', url: 'https://www.mercari.com', sellUrl: 'https://www.mercari.com/sell/', titleMax: 80,  feePct: 10, feeOnShipping: true, shipPaidBy: 'buyer', checked: C,
      notes: '10% selling fee on the item price + the shipping the buyer pays. No seller processing fee. Buyers pay a separate buyer-protection fee. Instant Pay cash-outs cost $3 (standard direct deposit is free).' },
    'facebook marketplace': { name: 'Facebook Marketplace', color: '#1f6fd1', url: 'https://www.facebook.com/marketplace', sellUrl: 'https://www.facebook.com/marketplace/create/item',  feePct: 10, feeMin: 0.80, feeOnShipping: true, shipPaidBy: 'buyer', checked: C,
      notes: 'Shipped (checkout) orders: 10% of the order total, minimum $0.80; processing is included. Local pickup paid in person is free — create a separate “Facebook local” platform with 0% if you sell both ways.' },
    vinted: { name: 'Vinted', color: '#1f7a5c', url: 'https://www.vinted.com', sellUrl: 'https://www.vinted.com/items/new',  feePct: 0, shipPaidBy: 'buyer', checked: C,
      notes: 'No seller fees in the US — you keep the full item price. The buyer pays the Vinted fee (about 5% + $0.70) and the shipping label. Optional Bumps / Closet spotlight are paid promotions.' },
    amazon: { name: 'Amazon', color: '#e88a00', url: 'https://sellercentral.amazon.com', feePct: 17, feeTiers: [{ max: 15, pct: 5 }, { max: 20, pct: 10 }], feeMin: 0.30, feeOnShipping: true, shipPaidBy: 'varies', checked: C,
      extras: [{ id: 'amz-indiv', label: 'Individual plan — per item sold', amount: 0.99, kind: 'order' }],
      notes: 'Clothing & Accessories referral fee: 5% if the total (item + shipping you charge) is $15 or less, 10% from $15 to $20, 17% above $20; $0.30 minimum. Processing is included. Individual plan: +$0.99 per item sold. Professional plan: $39.99/month instead — delete the $0.99 cost and add $39.99 per month. Most other categories are 15%. FBA fulfillment and storage fees are extra.' },
    etsy: { name: 'Etsy', color: '#f1641e', url: 'https://www.etsy.com', sellUrl: 'https://www.etsy.com/your/shops/me/tools/listings/create', titleMax: 140,  feePct: 6.5, feeOnShipping: true, procPct: 3, procFixed: 0.25, procOnShipping: true, listingFee: 0.20, shipPaidBy: 'buyer', checked: C,
      notes: 'US: $0.20 to list (renews every 4 months or when it sells), 6.5% transaction fee on item + shipping + gift wrap, and payment processing of 3% + $0.25 on the order total. Offsite Ads add 15% (12% if you sold $10k+ in the last year) on sales they bring in. Items must be vintage (20+ years), handmade or craft supplies.' },
    grailed: { name: 'Grailed', color: '#111111', url: 'https://www.grailed.com', sellUrl: 'https://www.grailed.com/sell',  feePct: 9, feeTiers: [{ max: 119.99, pct: 6 }], feeMin: 1.99, procPct: 3.49, procFixed: 0.49, procOnShipping: true, shipPaidBy: 'buyer', checked: C,
      notes: 'Commission: 6% (minimum $1.99) on sales under $120, 9% from $120 (since May 20, 2026). With a Grailed label the commission is on the item price only. Payment processing 3.49% + $0.49 on the total incl. shipping (4.99% + $0.49 for international buyers).' },
    whatnot: { name: 'Whatnot', color: '#c9a400', url: 'https://www.whatnot.com', feePct: 8, procPct: 2.9, procFixed: 0.30, procOnShipping: true, shipPaidBy: 'buyer', checked: C,
      notes: 'Commission 8% of the item’s final price (not shipping) for sellers under $15k in the last 4 weeks; bigger sellers pay less, coins 4%. Payment processing 2.9% + $0.30 on the whole order incl. shipping and tax. No listing fees.' },
    'tiktok shop': { name: 'TikTok Shop', color: '#111111', url: 'https://seller-us.tiktok.com', feePct: 6, shipPaidBy: 'varies', checked: C,
      notes: 'US referral fee 6% for most categories (5% for some jewelry and pre-owned) on what the buyer pays + platform discounts, excluding tax and shipping; processing is included. Several seller sources report 8% since Aug 4, 2026 — check the rate in Seller Center. Affiliate creator commissions (often 10–20%) are extra; add one under Additional costs if you use them.' },
    'vestiaire collective': { name: 'Vestiaire Collective', color: '#2b2b2b', url: 'https://us.vestiairecollective.com', feePct: 17, smallThreshold: 75, smallFlat: 12, procPct: 3, procMin: 3, shipPaidBy: 'buyer', checked: C,
      notes: 'US, items listed from Oct 15, 2026: under $75 a flat $12 selling fee + $3 processing; $75–$15,000: 17% + 3% processing (over $15,000: flat $2,500 + 3%). Minimum price $18. Each listing keeps the fee in force when you listed it.' },
    'the realreal': { name: 'The RealReal', color: '#4a4a4a', url: 'https://www.therealreal.com', feePct: 40, feeTiers: [{ max: 99.99, pct: 80 }, { max: 149.99, pct: 70 }, { max: 199.99, pct: 55 }, { max: 299.99, pct: 45 }], shipPaidBy: 'seller', sellerShipCost: 0, checked: C,
      notes: 'Consignment — they price, photograph and ship it. Fee shown is what TRR keeps, based on its published clothing schedule (you earn 20% under $100, 30% $100–149, 45% $150–199, 55% $200–299, 60% $300–749). Rates vary by category and RealReal Rewards tier; promos change them. Check your consignor agreement and edit.' },
    stockx: { name: 'StockX', color: '#006340', url: 'https://stockx.com', feePct: 9, procPct: 3, shipPaidBy: 'seller', sellerShipCost: 5, checked: C,
      notes: 'Verified Marketplace, Seller Level 1: 9% transaction fee + 3% payment processing on the sale price (Level 2 8.5%, 3 8%, 4 7.5%, 5 7%). US sellers pay a $5 shipping fee per sale. New, unworn items only.' },
    offerup: { name: 'OfferUp', color: '#00a87e', url: 'https://offerup.com', feePct: 0, shipPaidBy: 'varies', checked: C,
      notes: 'Local pickup only — OfferUp ended nationwide shipping on Sept 23, 2025, so there are no selling fees. Collect payment at the meetup. Optional paid promotions.' },
    shopify: { name: 'Shopify', color: '#5e8e3e', url: 'https://www.shopify.com', feePct: 0, procPct: 2.9, procFixed: 0.30, procOnShipping: true, shipPaidBy: 'varies', checked: C,
      extras: [{ id: 'shp-basic', label: 'Basic plan', amount: 39, kind: 'month' }],
      notes: 'Your own online store. Basic plan $39/month ($29 paid yearly). Shopify Payments: 2.9% + $0.30 per online card sale (3.5% for premium cards, +1% international). Using another payment provider adds 2%.' },
    'in person': { name: 'In person', color: '#5b6472', feePct: 0, shipPaidBy: 'varies', notes: 'Cash / local sales.' }
  };
  // fee values the six original presets shipped with — used to tell untouched profiles from ones you edited
  const PRESET_V1 = {
    poshmark: { feePct: 20, smallThreshold: 15, smallFlat: 2.95 }, depop: { feePct: 0, procPct: 3.3, procFixed: 0.45, feeOnShipping: true },
    ebay: { feePct: 13.6, feeFixed: 0.40, smallThreshold: 10.01, smallFixed: 0.30, feeOnShipping: true }, mercari: { feePct: 10, feeOnShipping: true },
    'facebook marketplace': { feePct: 10, feeMin: 0.80, feeOnShipping: true }, vinted: { feePct: 0 }
  };
  const FEE_KEYS = ['feePct', 'feeFixed', 'feeMin', 'feeTiers', 'smallThreshold', 'smallFlat', 'smallFixed', 'feeOnShipping', 'procPct', 'procFixed', 'procMin', 'procOnShipping', 'listingFee', 'extras', 'shipPaidBy', 'shipCharge', 'sellerShipCost', 'notes', 'checked'];
  const presetFor = (name) => { const k = String(name || '').trim().toLowerCase(); return PLATFORM_PRESETS[k] || Object.values(PLATFORM_PRESETS).find((x) => x.name.toLowerCase() === k) || null; };
  const titleCase = (v) => String(v || '').trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  function blankPlatform(name, i = 0) {
    return { id: U.uid(), name, color: PLAT_COLORS[i % PLAT_COLORS.length], active: true, url: '',
      feePct: 0, feeFixed: 0, feeMin: 0, feeTiers: [], smallThreshold: null, smallFlat: null, smallFixed: null, feeOnShipping: false,
      procPct: 0, procFixed: 0, procMin: 0, procOnShipping: false, listingFee: 0, extras: [], shipPaidBy: 'buyer', shipCharge: null, sellerShipCost: 0, notes: '', checked: '',
      sellUrl: '', titleMax: null, descMax: null, hashtags: 0, noTitle: false };
  }
  const profiles = () => (Array.isArray(S().platformProfiles) ? S().platformProfiles : (S().platformProfiles = []));
  const profileFor = (name) => { const k = String(name || '').trim().toLowerCase(); return k ? profiles().find((p) => p.name.toLowerCase() === k) || null : null; };
  const platformLabel = (name) => (profileFor(name) || {}).name || titleCase(name) || '';
  const platformColor = (name) => (profileFor(name) || {}).color || '#8a938f';
  const platformTag = (name) => (name ? `<span class="ptag" style="--c:${esc(platformColor(name))}">${esc(platformLabel(name))}</span>` : '');
  /** Build profiles the first time (from the old comma list + items), using presets for known platforms. */
  const FEE_COMPARE = FEE_KEYS.filter((k) => !['notes', 'checked', 'shipCharge'].includes(k));
  const normFee = (k, v) => k === 'feeTiers' ? JSON.stringify((v || []).map((t) => [+t.max || 0, +t.pct || 0])) : k === 'extras' ? JSON.stringify((v || []).map((x) => [String(x.label || ''), +x.amount || 0, x.kind || ''])) : k === 'shipPaidBy' ? (v || 'buyer') : typeof v === 'boolean' || k.endsWith('OnShipping') ? !!v : (v === null || v === undefined || v === '' ? null : +v || 0);
  const feeSnap = (p) => Object.fromEntries(FEE_COMPARE.map((k) => [k, normFee(k, p[k])]));
  const sameFees = (a, b) => FEE_COMPARE.every((k) => JSON.stringify(normFee(k, a[k])) === JSON.stringify(normFee(k, b[k])));
  const XL_KEYS = ['sellUrl', 'titleMax', 'descMax', 'hashtags', 'noTitle'];
  const fromPreset = (pre, i) => { const p = { ...blankPlatform(pre.name, i), ...U.clone(pre), extras: (pre.extras || []).map((x) => ({ ...x, id: U.uid() })) }; p.feeBase = feeSnap(p); return p; };
  function ensurePlatformProfiles() {
    if (Array.isArray(S().platformProfiles) && S().platformProfiles.length) return upgradePlatformPresets();
    const names = uniq([...(S().platforms || []), ...Object.keys(PLATFORM_PRESETS), ...state.items.map((i) => i.platform)].filter(Boolean).map((n) => n.toLowerCase()));
    S().platformProfiles = names.map((n, i) => { const pre = presetFor(n); return pre ? fromPreset(pre, i) : blankPlatform(titleCase(n), i); });
    S().platformPresetsV = 3;
    return true;
  }
  /** One-time upgrade for existing data: add the new default platforms and refresh fee facts
      on the original presets you never edited. Anything you changed yourself is left alone. */
  function upgradePlatformPresets() {
    const v = S().platformPresetsV || 1;
    if (v >= 3) return false;
    if (v === 2) { upgradeCrossListFields(); S().platformPresetsV = 3; return true; }
    const ps = profiles();
    const same = (a, b) => (+a || 0) === (+b || 0);
    ps.forEach((p) => {
      const k = Object.keys(PRESET_V1).find((key) => presetFor(key).name.toLowerCase() === p.name.toLowerCase());
      if (!k) return;
      const old = { ...blankPlatform(''), ...PRESET_V1[k] };
      const untouched = ['feePct', 'feeFixed', 'feeMin', 'smallThreshold', 'smallFlat', 'smallFixed', 'procPct', 'procFixed'].every((f) => same(p[f], old[f])) && !!p.feeOnShipping === !!old.feeOnShipping && !(p.extras || []).length;
      if (!untouched) return;
      const pre = fromPreset(PLATFORM_PRESETS[k], 0);
      FEE_KEYS.forEach((f) => { if (f === 'shipCharge' && hasVal(p.shipCharge)) return; p[f] = pre[f]; });
    });
    Object.values(PLATFORM_PRESETS).forEach((pre) => { if (!ps.some((p) => p.name.toLowerCase() === pre.name.toLowerCase())) ps.push(fromPreset(pre, ps.length)); });
    upgradeCrossListFields();
    S().platformPresetsV = 3;
    return true;
  }
  /** v3: cross-listing details (sell page, title limit…) and a record of the published fees each platform started from. */
  function upgradeCrossListFields() {
    profiles().forEach((p) => {
      const pre = presetFor(p.name);
      XL_KEYS.forEach((k) => { if (p[k] === undefined) p[k] = pre && pre[k] !== undefined ? pre[k] : blankPlatform('')[k]; });
      if (!p.feeBase && pre && sameFees(p, pre)) p.feeBase = feeSnap(p);
    });
  }

  /* =========================================================
     Fee updates — compare your platforms with the shared fee list
     (platform-fees.json in the app's own folder; update that file when a
     marketplace changes its fees and every device can pick it up)
     ========================================================= */
  const FEE_LIST_URL = 'platform-fees.json';
  const FEE_CHECK_KEY = 'thrift-fee-check';
  const FEE_LABEL = { feePct: 'Selling fee %', feeFixed: 'Fixed fee per order', feeMin: 'Minimum fee', feeTiers: 'Price tiers', smallThreshold: 'Small-order threshold', smallFlat: 'Small-order flat fee', smallFixed: 'Small-order fixed fee',
    feeOnShipping: 'Fee charged on shipping', procPct: 'Processing %', procFixed: 'Processing fixed', procMin: 'Processing minimum', procOnShipping: 'Processing on shipping', listingFee: 'Listing fee', extras: 'Additional costs',
    shipPaidBy: 'Who pays shipping', sellerShipCost: 'Your extra shipping cost' };
  const MONEYISH = new Set(['feeFixed', 'feeMin', 'smallThreshold', 'smallFlat', 'smallFixed', 'procFixed', 'procMin', 'listingFee', 'sellerShipCost']);
  function feeVal(k, v) {
    if (k === 'feeTiers') { const t = (v || []).filter((x) => +x.max > 0); return t.length ? t.map((x) => `${+x.pct}% up to ${U.money(+x.max)}`).join('; ') : 'none'; }
    if (k === 'extras') { const e = v || []; return e.length ? e.map((x) => `${x.label || 'Cost'} ${x.kind === 'pct' ? +x.amount + '%' : U.money(+x.amount) + (x.kind === 'month' ? '/mo' : '/sale')}`).join('; ') : 'none'; }
    if (k === 'shipPaidBy') return { buyer: 'buyer', seller: 'you', varies: 'varies' }[v || 'buyer'];
    if (typeof v === 'boolean' || k.endsWith('OnShipping')) return v ? 'yes' : 'no';
    if (v === null || v === undefined || v === '') return '—';
    return MONEYISH.has(k) ? U.money(+v) : (+v) + '%';
  }
  async function loadFeeList() {
    try {
      const r = await fetch(`${FEE_LIST_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j || typeof j.platforms !== 'object') throw new Error('bad file');
      return { ...j, source: 'online' };
    } catch (e) {
      return { updated: '', checked: C, platforms: PLATFORM_PRESETS, source: 'built-in', error: e.message };
    }
  }
  /** What would change on each of your platforms if you took the fee list's numbers. */
  function feeDiffs(list) {
    const out = [];
    const entries = Object.values(list.platforms || {});
    profiles().forEach((p) => {
      const pub = entries.find((x) => x && x.name && x.name.toLowerCase() === p.name.toLowerCase());
      if (!pub) return;
      const changes = FEE_COMPARE.filter((k) => JSON.stringify(normFee(k, p[k])) !== JSON.stringify(normFee(k, pub[k] ?? blankPlatform('')[k])))
        .map((k) => ({ k, label: FEE_LABEL[k] || k, from: feeVal(k, p[k]), to: feeVal(k, pub[k] ?? blankPlatform('')[k]) }));
      if (!changes.length) return;
      const base = p.feeBase;
      const customized = base ? FEE_COMPARE.some((k) => JSON.stringify(normFee(k, p[k])) !== JSON.stringify(base[k])) : true;
      out.push({ p, pub, changes, customized });
    });
    const missing = entries.filter((x) => x && x.name && !profiles().some((p) => p.name.toLowerCase() === x.name.toLowerCase()));
    return { diffs: out, missing };
  }
  function applyFees(p, pub) {
    const pre = fromPreset(pub, 0);
    FEE_KEYS.forEach((f) => { if (f === 'shipCharge' && hasVal(p.shipCharge)) return; p[f] = pre[f]; });
    XL_KEYS.forEach((k) => { if (!hasVal(p[k]) && hasVal(pre[k])) p[k] = pre[k]; });
    p.feeBase = feeSnap(p);
  }
  function renderFeeStrip(list, res) {
    const el = $('#feeStrip'); if (!el) return;
    const when = list && list.updated ? U.fmtDate(list.updated) : '';
    const fresh = res ? res.diffs.filter((d) => !d.customized) : [];
    const mine = res ? res.diffs.filter((d) => d.customized) : [];
    const n = fresh.length + (res ? res.missing.filter((m) => !(S().feeDismissed || []).includes(m.name.toLowerCase())).length : 0);
    const mineNote = mine.length ? ` ${esc(mine.map((d) => d.p.name).join(', '))} ${mine.length === 1 ? 'uses' : 'use'} your own numbers.` : '';
    el.innerHTML = n ? `<div class="fee-alert"><span class="fa-ico">🔔</span><div><b>Fee updates available</b> for ${esc([...fresh.map((d) => d.p.name), ...res.missing.filter((m) => !(S().feeDismissed || []).includes(m.name.toLowerCase())).map((m) => m.name + ' (new)')].join(', '))}${when ? ` · fee list of ${esc(when)}` : ''}</div><button type="button" class="btn btn-sm btn-gold" data-fee-review>Review &amp; update</button></div>`
      : `<div class="fee-ok muted small">✓ ${list ? `Your platforms match the shared fee list${when ? ` (updated ${esc(when)})` : ''}.${mineNote}` : 'Fees as published Nov 2026.'} <button type="button" class="linklike" data-fee-review>Check now</button></div>`;
  }
  /** quietly look for a newer fee list once a day when Platforms opens */
  async function autoFeeCheck() {
    let last = 0; try { last = +localStorage.getItem(FEE_CHECK_KEY) || 0; } catch (_) { /* ignore */ }
    if (Date.now() - last < 864e5 && autoFeeCheck.cache) { renderFeeStrip(autoFeeCheck.cache.list, feeDiffs(autoFeeCheck.cache.list)); return; }
    const list = await loadFeeList();
    if (list.source !== 'online') { renderFeeStrip(null, null); return; }
    try { localStorage.setItem(FEE_CHECK_KEY, String(Date.now())); } catch (_) { /* ignore */ }
    autoFeeCheck.cache = { list };
    if (currentView() === 'platforms') renderFeeStrip(list, feeDiffs(list));
  }
  async function feeUpdateDialog() {
    const btn = $('#btnFeeCheck'); const was = btn.textContent; btn.disabled = true; btn.textContent = 'Checking…';
    const list = await loadFeeList();
    btn.disabled = false; btn.textContent = was;
    autoFeeCheck.cache = { list };
    try { localStorage.setItem(FEE_CHECK_KEY, String(Date.now())); } catch (_) { /* ignore */ }
    const res = feeDiffs(list);
    renderFeeStrip(list, res);
    const when = list.updated ? U.fmtDate(list.updated) : list.checked;
    const src = list.source === 'online' ? `the shared fee list (updated ${esc(when)})` : `the fees built into this version (${esc(list.checked)}) — the online list couldn’t be reached`;
    if (!res.diffs.length && !res.missing.length) {
      await U.modal({ title: 'Fees are up to date', body: `<p>✓ Every platform matches ${src}.</p><p class="muted small">Marketplaces announce fee changes a few times a year. When one does, the shared list is updated and this button brings the new numbers in — on every device, through sync.</p>`, buttons: [{ label: 'OK', cls: 'btn-primary', value: true }] });
      return;
    }
    const body = `<p class="muted">Compared with ${src}. Ticked platforms get the new numbers; your shop links, colors and anything you set for shipping stay as they are.</p>
      <div class="fee-diffs">${res.diffs.map((d, i) => `<label class="fee-diff ${d.customized ? 'mine' : ''}">
        <input type="checkbox" data-fd="${i}" ${d.customized ? '' : 'checked'}>
        <div><div class="fd-h"><span class="plat-dot" style="--pc:${esc(d.p.color)}"></span><b>${esc(d.p.name)}</b>${d.customized ? '<span class="badge b-other">you edited this one</span>' : ''}</div>
          <ul>${d.changes.map((c) => `<li>${esc(c.label)}: <s>${esc(c.from)}</s> → <b>${esc(c.to)}</b></li>`).join('')}</ul>
          ${d.customized ? '<p class="muted small">You changed these fees yourself. Updating replaces your numbers with the published ones.</p>' : ''}
          ${d.pub.notes ? `<details><summary class="small">What the new fees mean</summary><p class="small">${esc(d.pub.notes)}</p></details>` : ''}</div></label>`).join('')}
      ${res.missing.length ? `<div class="fee-new"><b>Also available:</b> ${res.missing.map((m, i) => `<label class="check"><input type="checkbox" data-fn="${i}"> ${esc(m.name)}</label>`).join(' ')}</div>` : ''}</div>`;
    const pick = await U.modal({ title: 'Fee updates', wide: true, body,
      buttons: [{ label: 'Not now', value: null, cls: 'btn-ghost' }, { label: 'Update ticked platforms', cls: 'btn-primary', value: (b) => ({ d: [...b.querySelectorAll('[data-fd]:checked')].map((x) => +x.dataset.fd), n: [...b.querySelectorAll('[data-fn]:checked')].map((x) => +x.dataset.fn) }) }] });
    if (pick) { const skipped = res.missing.filter((m, i) => !pick.n.includes(i)).map((m) => m.name.toLowerCase()); if (skipped.length) { S().feeDismissed = uniq([...(S().feeDismissed || []), ...skipped]); saveSettings(); renderFeeStrip(list, feeDiffs(list)); } }
    if (!pick || (!pick.d.length && !pick.n.length)) return;
    const names = [];
    pick.d.forEach((i) => { const d = res.diffs[i]; applyFees(d.p, d.pub); names.push(d.p.name); });
    pick.n.forEach((i) => { const m = res.missing[i]; profiles().push(fromPreset(m, profiles().length)); names.push(m.name + ' (new)'); });
    saveSettings(); populateFilters(); renderPlatforms(); renderFeeStrip(list, feeDiffs(list));
    addActivity([{ id: U.uid(), t: Date.now(), who: myName(), kind: 'platforms', n: 0, label: `updated platform fees: ${names.join(', ')}` }]);
    const synced = window.Sync && Sync.signedIn && Sync.signedIn();
    U.toast(`Updated ${names.join(', ')}${synced ? ' — your other devices get it through sync' : ''}`, 'ok');
  }

  /* ---- per-site prices: a listing may have its own price; blank = the item’s main selling price ---- */
  const listPrice = (it, l) => (l && l.price != null ? l.price : it.sellingPrice);
  /** Prices the item is actually listed at (active listings), or null when there's nothing different to show. */
  function sitePrices(it) {
    if (Calc.isSold(it)) return null;
    const act = (it.listings || []).filter((l) => l.status === 'active' && l.platform);
    if (!act.length || !act.some((l) => l.price != null)) return null;
    const ps = act.map((l) => listPrice(it, l)).filter((v) => v != null);
    if (!ps.length) return null;
    const mn = Math.min(...ps), mx = Math.max(...ps);
    if (mn === mx && mn === it.sellingPrice) return null;
    return { mn, mx, tip: act.map((l) => `${platformLabel(l.platform)} ${U.money(listPrice(it, l))}`).join(' · ') + (it.sellingPrice != null ? ` · main price ${U.money(it.sellingPrice)}` : '') };
  }
  const priceText = (it) => { const sp = sitePrices(it); return sp ? (sp.mn === sp.mx ? U.money(sp.mn) : `${U.money(sp.mn)}–${U.money(sp.mx)}`) : U.money(it.sellingPrice); };
  /* ---- listings (where an item is listed, with links) ---- */
  function listingsChips(r) {
    const ls = r.listings || [];
    if (!ls.length) return '<span class="add-listing">+ Add listing</span>';
    const warn = needsDelist(r) ? `<span class="chip-warn" title="Sold — still active on other sites. Click to open the delist checklist.">Delist ${ls.filter((l) => l.status === 'active').length}</span>` : '';
    const label = { active: '', sold: '✓ ', delisted: '', expired: '' };
    return '<span class="chips">' + warn + ls.map((l) => `<span class="chip st-${esc(l.status || 'active')}" style="--c:${esc(platformColor(l.platform))}" title="${esc(platformLabel(l.platform))}: ${esc(l.status || 'active')}${l.statusDate ? ' ' + esc(U.fmtDate(l.statusDate)) : ''}">${label[l.status] || ''}${esc(platformLabel(l.platform) || 'Link')}${l.price != null && l.price !== r.sellingPrice && l.status !== 'sold' ? `<b class="lp">${esc(U.money(l.price))}</b>` : ''}${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="Open listing: ${esc(l.url)}">↗</a>` : ''}</span>`).join('') + '</span>';
  }
  /* ---- cross-listing safety ---- */
  const needsDelist = (it) => Calc.isSold(it) && (it.listings || []).some((l) => l.status === 'active');
  /** When an item sells: its listing on the selling platform becomes "sold" (others stay active until delisted). */
  function markListingsSold(it) {
    const p = (it.platform || '').toLowerCase();
    it.listings = (it.listings || []).map((l) => ({ ...l }));
    if (p) {
      const hit = it.listings.find((l) => l.platform === p);
      if (hit) { hit.status = 'sold'; hit.statusDate = it.dateSold || U.todayISO(); }
      else it.listings.push({ platform: p, url: '', status: 'sold', statusDate: it.dateSold || U.todayISO() });
    }
    return it;
  }
  /** Checklist of other sites to take a sold item down from. */
  async function delistChecklist(item) {
    item = findItem(item.id) || item;
    const act = (item.listings || []).map((l, i) => ({ ...l, i })).filter((l) => l.status === 'active');
    if (!act.length) return;
    const body = document.createElement('div');
    body.innerHTML = `<p style="margin-top:0">“${esc(item.name)}” sold${item.platform ? ` on <b>${esc(platformLabel(item.platform))}</b>` : ''}. Take it down from these sites so it can’t sell twice:</p>
      <div class="delist">${act.map((l) => `<label class="delist-row"><input type="checkbox" data-i="${l.i}"><span class="plat-dot" style="--pc:${esc(platformColor(l.platform))}"></span><b>${esc(platformLabel(l.platform) || 'Listing')}</b>
        ${l.url ? `<a class="btn btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Open listing ↗</a>` : '<span class="muted small">no link saved — open the site and find it</span>'}<span class="spacer"></span><span class="muted small">tick when removed</span></label>`).join('')}</div>
      <p class="muted small">Unticked sites stay on your Action Center list until you delist them.</p>`;
    const res = await U.modal({ title: 'Delist checklist', body, wide: true, buttons: [
      { label: 'Remind me later', value: null, cls: 'btn-ghost' },
      { label: 'All removed', value: 'all' },
      { label: 'Save', cls: 'btn-primary', value: (b) => [...b.querySelectorAll('input:checked')].map((x) => +x.dataset.i) }
    ] });
    if (!res) return;
    const idx = res === 'all' ? act.map((l) => l.i) : res;
    if (!idx.length) return;
    const cur = findItem(item.id); if (!cur) return;
    const after = U.clone(cur);
    after.listings = after.listings.map((l, i) => (idx.includes(i) ? { ...l, status: 'delisted', statusDate: U.todayISO() } : l));
    commit('items', [{ id: cur.id, after }], { label: 'delist' });
    renderAll();
    U.toast(needsDelist(after) ? 'Saved — some sites still need delisting' : 'All other listings removed ✓', 'ok');
  }

  /** Editable list of { platform, url } rows: one row per site the item is listed on. */
  function listingsEditor(container, initial, opts = {}) {
    const rows = (initial || []).map((l) => ({ platform: platformLabel(l.platform), url: l.url || '', status: l.status || 'active', statusDate: l.statusDate || '', price: l.price != null ? String(l.price) : '' }));
    const rootOf = () => { let r = container; while (r.parentElement) r = r.parentElement; return r; };
    const priceField = () => rootOf().querySelector('[name="sellingPrice"]');
    const mainPrice = () => { const v = priceField(); return v ? U.num(v.value) : (typeof opts.mainPrice === 'number' ? opts.mainPrice : null); };
    const dlId = 'dlL-' + Math.random().toString(36).slice(2);
    const draw = (focusLast) => {
      const used = new Set(rows.map((r) => r.platform.toLowerCase()));
      const quick = profiles().filter((p) => p.active !== false && !used.has(p.name.toLowerCase()));
      const n = rows.filter((r) => r.platform.trim() || r.url.trim()).length;
      container.innerHTML = `<div class="lst-box">
        <div class="lst-head"><b>Where it’s listed</b><span class="lst-count ${n ? 'on' : ''}">${n ? `Listed on ${n} site${n === 1 ? '' : 's'}` : 'Not listed yet'}</span></div>
        <p class="muted small lst-help">Add each site this item is posted on with “+ Add another site” or a Quick add button. Give a site its own <b>price</b> if it’s listed for a different amount there — leave it blank to use the main price. Paste a listing link and the site name is filled in for you.</p>
        ${rows.map((r, i) => `<div class="lst-row" data-i="${i}">
          <span class="lst-num" style="--pc:${esc(platformColor(r.platform))}">${i + 1}</span>
          <input class="lst-p" list="${dlId}" placeholder="Site (e.g. Poshmark)" value="${esc(r.platform)}" aria-label="Site ${i + 1}">
          <input class="lst-pr" inputmode="decimal" placeholder="${mainPrice() != null ? esc(U.money(mainPrice())) : '$ price'}" value="${esc(r.price || '')}" aria-label="Price on site ${i + 1}" title="Price on this site (blank = main price)">
          <input class="lst-u" placeholder="Link to the listing on this site (https://…)" value="${esc(r.url)}" aria-label="Listing link ${i + 1}">
          <select class="lst-s st-${esc(r.status || 'active')}" aria-label="Status ${i + 1}">${['active', 'delisted', 'sold', 'expired'].map((st) => `<option value="${st}" ${r.status === st ? 'selected' : ''}>${st[0].toUpperCase() + st.slice(1)}</option>`).join('')}</select>
          ${r.url ? `<a class="btn btn-sm btn-ghost" href="${esc(U.normUrl(r.url))}" target="_blank" rel="noopener noreferrer" title="Open this listing">↗</a>` : '<span class="lst-gap"></span>'}
          <button type="button" class="btn btn-sm btn-ghost lst-del" title="Remove this site" aria-label="Remove site ${i + 1}">✕</button></div>`).join('')}
        <div class="lst-actions">
          <button type="button" class="btn btn-sm" data-add-row>+ Add ${rows.length ? 'another' : 'a'} site</button>
        </div>
        ${quick.length ? `<div class="lst-add"><span class="muted small">Quick add:</span>${quick.map((p) => `<button type="button" class="chip-btn" data-q="${esc(p.name)}" style="--c:${esc(p.color)}">+ ${esc(p.name)}</button>`).join('')}</div>` : ''}
      </div><datalist id="${dlId}">${allPlatforms().map((x) => `<option value="${esc(platformLabel(x))}">`).join('')}</datalist>`;
      if (focusLast) { const sel = container.querySelectorAll(focusLast); sel[sel.length - 1]?.focus(); }
    };
    container.addEventListener('input', (e) => {
      const row = e.target.closest('.lst-row'); if (!row) return;
      const r = rows[+row.dataset.i];
      if (e.target.classList.contains('lst-p')) r.platform = e.target.value;
      if (e.target.classList.contains('lst-pr')) r.price = e.target.value;
      if (e.target.classList.contains('lst-s')) { r.status = e.target.value; r.statusDate = U.todayISO(); e.target.className = 'lst-s st-' + r.status; }
      if (e.target.classList.contains('lst-u')) {
        r.url = e.target.value;
        if (!r.platform.trim()) { const g = U.platformFromUrl(r.url); if (g) { r.platform = platformLabel(g); row.querySelector('.lst-p').value = r.platform; } }
      }
    });
    // refresh only the edited row (a full redraw here would swallow the click that caused the blur)
    container.addEventListener('change', (e) => {
      const row = e.target.closest('.lst-row'); if (!row) return;
      const r = rows[+row.dataset.i];
      row.querySelector('.lst-num').style.setProperty('--pc', platformColor(r.platform));
      const slot = row.children[5];
      const html = r.url ? `<a class="btn btn-sm btn-ghost" href="${esc(U.normUrl(r.url))}" target="_blank" rel="noopener noreferrer" title="Open this listing">↗</a>` : '<span class="lst-gap"></span>';
      const tmp = document.createElement('div'); tmp.innerHTML = html; slot.replaceWith(tmp.firstElementChild);
      const n = rows.filter((x) => x.platform.trim() || x.url.trim()).length;
      const c = container.querySelector('.lst-count'); if (c) { c.textContent = n ? `Listed on ${n} site${n === 1 ? '' : 's'}` : 'Not listed yet'; c.classList.toggle('on', !!n); }
    });
    container.addEventListener('click', (e) => {
      const del = e.target.closest('.lst-del');
      if (del) { rows.splice(+del.closest('.lst-row').dataset.i, 1); draw(); return; }
      if (e.target.closest('[data-add-row]')) { rows.push({ platform: '', url: '', status: 'active' }); draw('.lst-p'); return; }
      const q = e.target.closest('[data-q]');
      if (q) { rows.push({ platform: q.dataset.q, url: '', status: 'active' }); draw('.lst-u'); }
    });
    draw();
    // keep the price boxes' hint in step with the main price field
    const sp = priceField();
    if (sp) sp.addEventListener('input', () => container.querySelectorAll('.lst-pr').forEach((x) => { x.placeholder = mainPrice() != null ? U.money(mainPrice()) : '$ price'; }));
    return { get: () => normListings(rows.map((r) => { const v = U.num(r.price); const m = mainPrice(); return { platform: r.platform, url: r.url, status: r.status, statusDate: r.statusDate, price: v == null || v === m ? null : v }; })) };
  }
  async function listingsDialog(item) {
    const body = document.createElement('div');
    body.innerHTML = `<p class="muted small" style="margin-top:0">Where “${esc(item.name)}” is listed. Main price: <b>${esc(U.money(item.sellingPrice) || '—')}</b> — give a site its own price if it’s different there. Paste a link to open the listing straight from the inventory table.</p><div data-listings></div>`;
    const ed = listingsEditor(body.querySelector('[data-listings]'), item.listings || [], { mainPrice: item.sellingPrice });
    const res = await U.modal({ title: 'Listed on', body, wide: true, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'Save', cls: 'btn-primary', value: () => ed.get() }] });
    if (!res) return;
    commit('items', [{ id: item.id, after: { ...U.clone(item), listings: res } }], { label: 'edit listings' });
    res.forEach((l) => addListValue('platforms', l.platform));
    renderAll();
  }

  /* ---- Platforms tab ---- */
  const nz = (v) => +v || 0;
  const hasVal = (v) => v !== null && v !== undefined && v !== '';
  const procOnShip = (p) => (p.procOnShipping === undefined || p.procOnShipping === null ? !!p.feeOnShipping : !!p.procOnShipping);
  function feeSummary(p) {
    const parts = [];
    const main = nz(p.feePct) || nz(p.feeFixed) ? `${nz(p.feePct)}%${nz(p.feeFixed) ? ' + ' + U.money(p.feeFixed) : ''}${p.feeOnShipping ? ' of item + shipping' : ' of sale'}` : 'No selling fee';
    const tiers = (p.feeTiers || []).filter((t) => nz(t.max) > 0).sort((a, b) => nz(a.max) - nz(b.max));
    if (tiers.length) parts.push(tiers.map((t) => `${nz(t.pct)}% up to ${U.money(t.max)}`).join('; ') + `; ${main} above`);
    else if (nz(p.smallThreshold) && hasVal(p.smallFlat)) parts.push(`${U.money(p.smallFlat)} flat under ${U.money(p.smallThreshold)}; ${main} above`);
    else if (nz(p.smallThreshold) && hasVal(p.smallFixed)) parts.push(`${main} (${U.money(p.smallFixed)} per order under ${U.money(p.smallThreshold)})`);
    else parts.push(main);
    if (nz(p.feeMin)) parts.push(`min ${U.money(p.feeMin)}`);
    return parts.join(', ');
  }
  function shipSummary(p) {
    const who = { buyer: 'Buyer pays', seller: 'You pay', varies: 'Varies' }[p.shipPaidBy] || 'Buyer pays';
    return `${who}${hasVal(p.shipCharge) ? ' · typically ' + U.money(p.shipCharge) : ''}${nz(p.sellerShipCost) ? ' · your extra cost ' + U.money(p.sellerShipCost) + '/order' : ''}`;
  }
  function platformStats(p) {
    const k = p.name.toLowerCase();
    const sold = state.items.filter((i) => Calc.isSold(i) && (i.platform || '').toLowerCase() === k);
    const gross = sold.reduce((a, i) => a + (i.sellingPrice || 0), 0);
    const net = sold.reduce((a, i) => a + Calc.net(i), 0);
    const listed = state.items.filter((i) => !Calc.isSold(i) && (i.listings || []).some((l) => (l.platform || '').toLowerCase() === k)).length;
    return { sold: sold.length, gross, fees: gross - net, listed, avg: gross ? (gross - net) / gross : null };
  }
  function renderPlatforms() {
    const ps = profiles();
    $('#platGrid').innerHTML = ps.length ? ps.map((p) => {
      const st = platformStats(p);
      const e40 = Calc.platformEstimate(p, 40);
      const monthly = e40.monthly;
      return `<div class="plat-card ${p.active === false ? 'inactive' : ''}" style="--pc:${esc(p.color)}" data-pid="${esc(p.id)}">
        <div class="plat-head"><span class="plat-dot"></span><h3>${esc(p.name)}</h3>${p.active === false ? '<span class="badge b-other">Hidden</span>' : ''}<span class="spacer"></span>${p.url ? `<a class="linklike" href="${esc(U.normUrl(p.url))}" target="_blank" rel="noopener noreferrer">Open site ↗</a>` : ''}</div>
        <dl class="plat-dl">
          <dt>Selling fee</dt><dd>${esc(feeSummary(p))}</dd>
          <dt>Processing</dt><dd>${nz(p.procPct) || nz(p.procFixed) ? `${nz(p.procPct)}%${nz(p.procFixed) ? ' + ' + U.money(nz(p.procFixed)) : ''}${nz(p.procMin) ? ', min ' + U.money(p.procMin) : ''}${procOnShip(p) ? ' (incl. shipping)' : ''}` : '<span class="muted">Included / none</span>'}</dd>
          ${nz(p.listingFee) ? `<dt>Listing fee</dt><dd>${U.money(p.listingFee)} per listing</dd>` : ''}
          <dt>Shipping</dt><dd>${esc(shipSummary(p))}</dd>
          ${(p.extras || []).length ? `<dt>Additional</dt><dd>${p.extras.map((x) => `${esc(x.label || 'Cost')}: ${x.kind === 'pct' ? nz(x.amount) + '% of sale' : U.money(x.amount) + (x.kind === 'month' ? ' / month' : ' / sale')}`).join('<br>')}</dd>` : ''}
          <dt>On a $40 sale</dt><dd>fees <b>${U.money(e40.fees)}</b> · you get <b>${U.money(e40.payout)}</b>${e40.sellerShip ? ` · minus ${U.money(e40.sellerShip)} shipping` : ''}</dd>
          ${monthly ? `<dt>Monthly</dt><dd>${U.money(monthly)} (record it under Expenses)</dd>` : ''}
        </dl>
        ${p.notes ? `<p class="plat-notes">${esc(p.notes)}</p>` : ''}
        <div class="plat-stats">
          <div><b>${st.listed}</b><span>listed now</span></div>
          <div><b>${st.sold}</b><span>sold</span></div>
          <div><b>${U.money0(st.gross)}</b><span>gross sales</span></div>
          <div><b>${st.avg === null ? '—' : U.pct(st.avg)}</b><span>actual avg fee</span></div>
        </div>
        <div class="plat-foot"><span class="muted small">${p.checked ? 'Fees last checked ' + esc(p.checked) : 'Fees not set yet'} · <a class="linklike" href="https://www.google.com/search?q=${encodeURIComponent(p.name + ' seller fees')}" target="_blank" rel="noopener noreferrer" title="Search for this platform’s current published fees">Look up current fees ↗</a></span><span class="spacer"></span>
          <button class="btn btn-sm" data-pact="edit">Edit</button>
          <button class="btn btn-sm btn-ghost" data-pact="toggle">${p.active === false ? 'Show' : 'Hide'}</button>
          <button class="btn btn-sm btn-ghost danger-text" data-pact="delete">Delete</button></div>
      </div>`;
    }).join('') : '<div class="empty card">No platforms yet. Click “+ Add platform”.</div>';
    renderFeeCalc();
  }
  function renderFeeCalc() {
    const price = U.num($('#pcPrice').value), cost = U.num($('#pcCost').value) || 0, shipIn = $('#pcShip').value.trim();
    const ps = profiles().filter((p) => p.active !== false);
    if (price === null || !ps.length) { $('#pcTable').innerHTML = '<div class="empty">Enter a sale price to compare platforms.</div>'; return; }
    const rows = ps.map((p) => { const e = Calc.platformEstimate(p, price, shipIn === '' ? null : U.num(shipIn)); return { p, e, profit: U.round2(e.payout - cost - e.sellerShip) }; }).sort((a, b) => b.profit - a.profit);
    const best = rows[0].profit;
    $('#pcTable').innerHTML = `<table class="pl calc-t"><tr class="hdr"><td>Platform</td><td>Fees</td><td>Effective rate</td><td>You receive</td><td>Your shipping</td><td>Profit</td></tr>
      ${rows.map(({ p, e, profit }) => `<tr><td><span class="plat-dot" style="--pc:${esc(p.color)}"></span> ${esc(p.name)} ${profit === best ? '<span class="badge b-sold">best</span>' : ''}</td><td>${U.money(e.fees)}</td><td>${U.pct(e.rate)}</td><td>${U.money(e.payout)}</td><td>${e.sellerShip ? U.money(e.sellerShip) : '—'}</td><td class="${profit < 0 ? 'neg' : 'pos'}">${U.money(profit)}</td></tr>`).join('')}</table>
      <p class="note muted small">Estimates from each platform’s fee settings. Buyer-paid shipping counts toward fees only where a platform charges fees on shipping.</p>`;
  }
  async function platformDialog(p) {
    const isNew = !p;
    const cur = p ? U.clone(p) : blankPlatform('', profiles().length);
    const v = (x) => (hasVal(x) ? x : '');
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <label class="field"><span>Platform name *</span><input name="name" value="${esc(cur.name)}" placeholder="e.g. Poshmark"></label>
        <div class="form-grid" style="grid-template-columns:auto 1fr;gap:0 12px">
          <label class="field"><span>Color</span><input type="color" name="color" value="${esc(cur.color)}" style="height:38px;width:58px;padding:3px"></label>
          <label class="check" style="margin-top:22px"><input type="checkbox" name="active" ${cur.active !== false ? 'checked' : ''}> Show in lists &amp; calculator</label>
        </div>
        <label class="field span-2"><span>Website / your shop link</span><input name="url" value="${esc(cur.url)}" placeholder="https://…"></label>
      </div>
      <h4 class="sec">Selling fee</h4>
      <div class="form-grid g3">
        <label class="field"><span>Percentage (%)</span><input name="feePct" inputmode="decimal" value="${v(cur.feePct)}"></label>
        <label class="field"><span>Fixed fee per order ($)</span><input name="feeFixed" inputmode="decimal" value="${v(cur.feeFixed)}"></label>
        <label class="field"><span>Minimum fee ($)</span><input name="feeMin" inputmode="decimal" value="${v(cur.feeMin)}"></label>
        <label class="field"><span>Small orders: sales under ($)</span><input name="smallThreshold" inputmode="decimal" value="${v(cur.smallThreshold)}" placeholder="optional"></label>
        <label class="field"><span>…pay a flat fee instead ($)</span><input name="smallFlat" inputmode="decimal" value="${v(cur.smallFlat)}" placeholder="e.g. 2.95"></label>
        <label class="field"><span>…or a different fixed fee ($)</span><input name="smallFixed" inputmode="decimal" value="${v(cur.smallFixed)}" placeholder="e.g. 0.30"></label>
      </div>
      <div class="tier-box"><span class="muted small">Price tiers (optional) — a different % for lower prices, e.g. Amazon clothing 5% up to $15, 10% up to $20:</span>
        ${[0, 1, 2].map((i) => { const t = (cur.feeTiers || [])[i] || {}; return `<div class="tier-row">Up to $<input name="tierMax${i}" inputmode="decimal" value="${v(t.max)}" placeholder="price"> charge <input name="tierPct${i}" inputmode="decimal" value="${v(t.pct)}" placeholder="%"> %</div>`; }).join('')}
        <span class="muted small">Above the last tier, the Percentage above applies.</span></div>
      <label class="check"><input type="checkbox" name="feeOnShipping" ${cur.feeOnShipping ? 'checked' : ''}> Selling fee is also charged on the shipping the buyer pays</label>
      <h4 class="sec">Payment processing &amp; listing</h4>
      <div class="form-grid g3">
        <label class="field"><span>Processing (%)</span><input name="procPct" inputmode="decimal" value="${v(cur.procPct)}"></label>
        <label class="field"><span>Processing fixed ($)</span><input name="procFixed" inputmode="decimal" value="${v(cur.procFixed)}"></label>
        <label class="field"><span>Processing minimum ($)</span><input name="procMin" inputmode="decimal" value="${v(cur.procMin)}" placeholder="optional"></label>
        <label class="field"><span>Listing / insertion fee ($)</span><input name="listingFee" inputmode="decimal" value="${v(cur.listingFee)}"></label>
      </div>
      <label class="check"><input type="checkbox" name="procOnShipping" ${procOnShip(cur) ? 'checked' : ''}> Processing is also charged on the shipping the buyer pays</label>
      <h4 class="sec">Shipping</h4>
      <div class="form-grid g3">
        <label class="field"><span>Who usually pays</span><select name="shipPaidBy"><option value="buyer" ${cur.shipPaidBy === 'buyer' ? 'selected' : ''}>Buyer</option><option value="seller" ${cur.shipPaidBy === 'seller' ? 'selected' : ''}>Me (seller)</option><option value="varies" ${cur.shipPaidBy === 'varies' ? 'selected' : ''}>Varies</option></select></label>
        <label class="field"><span>Typical shipping charge ($)</span><input name="shipCharge" inputmode="decimal" value="${v(cur.shipCharge)}" placeholder="e.g. label price"></label>
        <label class="field"><span>My extra shipping cost / order ($)</span><input name="sellerShipCost" inputmode="decimal" value="${v(cur.sellerShipCost)}" placeholder="discounts, upgrades"></label>
      </div>
      <h4 class="sec">Additional costs</h4>
      <div data-extras></div>
      <h4 class="sec">Cross-listing helper</h4>
      <div class="form-grid g3">
        <label class="field span-2"><span>“Sell an item” page</span><input name="sellUrl" value="${esc(cur.sellUrl || '')}" placeholder="the page where you create a listing"></label>
        <label class="field"><span>Title limit (characters)</span><input name="titleMax" inputmode="numeric" value="${v(cur.titleMax)}" placeholder="no limit"></label>
        <label class="field"><span>Description limit (characters)</span><input name="descMax" inputmode="numeric" value="${v(cur.descMax)}" placeholder="no limit"></label>
        <label class="field"><span>Hashtags to add</span><input name="hashtags" inputmode="numeric" value="${cur.hashtags || ''}" placeholder="0"></label>
      </div>
      <label class="check"><input type="checkbox" name="noTitle" ${cur.noTitle ? 'checked' : ''}> This site has no title field — put the title at the top of the description</label>
      <h4 class="sec">Notes</h4>
      <div class="form-grid">
        <label class="field span-2"><span>Notes</span><textarea name="notes" rows="3">${esc(cur.notes)}</textarea></label>
        <label class="field"><span>Fees last checked</span><input name="checked" value="${esc(cur.checked || '')}" placeholder="e.g. Nov 2026"></label>
      </div>
      <div class="calc-box" data-example></div>`;
    const extras = (cur.extras || []).map((x) => ({ ...x }));
    const exBox = body.querySelector('[data-extras]');
    const drawExtras = () => {
      exBox.innerHTML = extras.map((x, i) => `<div class="ex-row" data-i="${i}"><input class="ex-l" placeholder="What is it? e.g. Boosted listing, Store subscription" value="${esc(x.label || '')}"><input class="ex-a" inputmode="decimal" placeholder="Amount" value="${hasVal(x.amount) ? x.amount : ''}"><select class="ex-k"><option value="pct" ${x.kind === 'pct' ? 'selected' : ''}>% of sale</option><option value="order" ${x.kind === 'order' ? 'selected' : ''}>$ per sale</option><option value="month" ${x.kind === 'month' ? 'selected' : ''}>$ per month</option></select><button type="button" class="btn btn-sm btn-ghost ex-del" title="Remove">✕</button></div>`).join('')
        + '<button type="button" class="btn btn-sm btn-ghost" data-ex-add>+ Add a cost</button>';
    };
    drawExtras();
    exBox.addEventListener('input', (e) => { const row = e.target.closest('.ex-row'); if (!row) return; const x = extras[+row.dataset.i]; if (e.target.classList.contains('ex-l')) x.label = e.target.value; if (e.target.classList.contains('ex-a')) x.amount = e.target.value; });
    exBox.addEventListener('change', (e) => { const row = e.target.closest('.ex-row'); if (row && e.target.classList.contains('ex-k')) extras[+row.dataset.i].kind = e.target.value; example(); });
    exBox.addEventListener('click', (e) => {
      if (e.target.closest('[data-ex-add]')) { extras.push({ id: U.uid(), label: '', amount: '', kind: 'order' }); drawExtras(); exBox.querySelectorAll('.ex-l')[extras.length - 1].focus(); }
      const d = e.target.closest('.ex-del'); if (d) { extras.splice(+d.closest('.ex-row').dataset.i, 1); drawExtras(); example(); }
    });
    const f = (n) => body.querySelector(`[name="${n}"]`);
    const numOr = (n, def = 0) => { const t = f(n).value.trim(); return t === '' ? def : (U.num(t) ?? def); };
    const read = () => ({
      ...cur, name: f('name').value.trim(), color: f('color').value, active: f('active').checked, url: f('url').value.trim() ? U.normUrl(f('url').value) : '',
      feePct: numOr('feePct'), feeFixed: numOr('feeFixed'), feeMin: numOr('feeMin'), smallThreshold: numOr('smallThreshold', null), smallFlat: numOr('smallFlat', null), smallFixed: numOr('smallFixed', null),
      feeOnShipping: f('feeOnShipping').checked, procPct: numOr('procPct'), procFixed: numOr('procFixed'), procMin: numOr('procMin'), procOnShipping: f('procOnShipping').checked, listingFee: numOr('listingFee'),
      feeTiers: [0, 1, 2].map((i) => ({ max: numOr('tierMax' + i, null), pct: numOr('tierPct' + i, null) })).filter((t) => t.max > 0 && t.pct !== null).sort((a, b) => a.max - b.max),
      shipPaidBy: f('shipPaidBy').value, shipCharge: numOr('shipCharge', null), sellerShipCost: numOr('sellerShipCost'),
      extras: extras.filter((x) => (x.label || '').trim() || hasVal(x.amount)).map((x) => ({ id: x.id || U.uid(), label: (x.label || '').trim(), amount: U.num(x.amount) ?? 0, kind: x.kind || 'order' })),
      notes: f('notes').value.trim(), checked: f('checked').value.trim(),
      sellUrl: f('sellUrl').value.trim() ? U.normUrl(f('sellUrl').value) : '', titleMax: numOr('titleMax', null) || null, descMax: numOr('descMax', null) || null,
      hashtags: Math.max(0, Math.min(30, Math.round(numOr('hashtags', 0)))), noTitle: f('noTitle').checked
    });
    const example = () => {
      const p2 = read();
      const ex = [15, 40, 100].map((pr) => { const e = Calc.platformEstimate(p2, pr); return `<div>On ${U.money0(pr)}<b>${U.money(e.payout)}</b><span class="muted small">fees ${U.money(e.fees)} (${U.pct(e.rate)})</span></div>`; }).join('');
      body.querySelector('[data-example]').innerHTML = ex;
    };
    body.addEventListener('input', example); body.addEventListener('change', example); example();
    const res = await U.modal({
      title: isNew ? 'Add platform' : `Edit ${cur.name}`, body, wide: true,
      buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, {
        label: isNew ? 'Add platform' : 'Save', cls: 'btn-primary',
        validate: () => {
          const n = f('name').value.trim();
          if (!n) { f('name').focus(); return false; }
          const clash = profiles().find((x) => x.name.toLowerCase() === n.toLowerCase() && x.id !== cur.id);
          if (clash) { U.toast(`A platform named “${n}” already exists.`, 'err'); f('name').focus(); return false; }
          return true;
        },
        value: () => read()
      }]
    });
    if (!res) return;
    const list = profiles();
    const idx = list.findIndex((x) => x.id === res.id);
    if (idx >= 0) {
      const oldKey = list[idx].name.toLowerCase(), newKey = res.name.toLowerCase();
      list[idx] = res;
      if (oldKey !== newKey) {
        const changes = [];
        state.items.forEach((it) => {
          const hitP = (it.platform || '').toLowerCase() === oldKey;
          const hitL = (it.listings || []).some((l) => l.platform === oldKey);
          if (hitP || hitL) changes.push({ id: it.id, after: { ...U.clone(it), platform: hitP ? newKey : it.platform, listings: (it.listings || []).map((l) => (l.platform === oldKey ? { ...l, platform: newKey } : l)) } });
        });
        if (changes.length) { commit('items', changes, { label: 'rename platform' }); U.toast(`Renamed on ${changes.length} item(s)`, 'ok'); }
      }
    } else list.push(res);
    saveSettings(); populateFilters(); renderPlatforms(); renderCounts();
    U.toast(isNew ? `${res.name} added` : `${res.name} saved`, 'ok');
  }
  function setupPlatforms() {
    $('#btnAddPlatform').onclick = () => platformDialog(null);
    $('#btnFeeCheck').onclick = feeUpdateDialog;
    $('#feeStrip').addEventListener('click', (e) => { if (e.target.closest('[data-fee-review]')) feeUpdateDialog(); });
    ['#pcPrice', '#pcCost', '#pcShip'].forEach((sel) => $(sel).addEventListener('input', renderFeeCalc));
    $('#platGrid').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pact]'); if (!b) return;
      const p = profiles().find((x) => x.id === b.closest('[data-pid]').dataset.pid); if (!p) return;
      if (b.dataset.pact === 'edit') platformDialog(p);
      if (b.dataset.pact === 'toggle') { p.active = p.active === false; saveSettings(); populateFilters(); renderPlatforms(); }
      if (b.dataset.pact === 'delete') {
        const k = p.name.toLowerCase();
        const n = state.items.filter((i) => (i.platform || '').toLowerCase() === k || (i.listings || []).some((l) => l.platform === k)).length;
        if (!(await U.confirm('Delete platform', `Delete <b>${esc(p.name)}</b> and its fee settings?${n ? ` ${n} item(s) mention it — they keep the name as text. Use <b>Hide</b> instead if you just want it out of the way.` : ''}`, 'Delete', true))) return;
        S().platformProfiles = profiles().filter((x) => x.id !== p.id); saveSettings(); populateFilters(); renderPlatforms();
        U.toast(`${p.name} deleted`);
      }
    });
  }

  /* =========================================================
     ACTION CENTER — stale stock, delisting, taxes, backups
     ========================================================= */
  const daysSince = (iso) => (iso ? U.daysBetween(iso, U.todayISO()) : null);
  function roundPrice(v, mode) {
    if (!(v > 0)) return 0;
    if (mode === 'whole') return Math.max(1, Math.floor(v));
    if (mode === '99') return Math.max(0.99, Math.floor(v) - 0.01 + (v - Math.floor(v) >= 0.99 ? 1 : 0));
    return U.round2(v);
  }
  /** Next markdown for an item, or null if none is due. */
  function markdownDue(it) {
    const md = S().markdown || {};
    if (Calc.isSold(it) || (it.status || '').toLowerCase() !== 'available' || !(it.sellingPrice > 0)) return null;
    const steps = (md.steps || []).filter((x) => x.days > 0 && x.pct > 0).sort((a, b) => a.days - b.days);
    const step = steps[it.markdownStep || 0];
    if (!step) return null;
    const age = Calc.daysActive(it);
    if (age === null || age < step.days) return null;
    if (it.lastMarkdown && daysSince(it.lastMarkdown) < (md.minGapDays || 0)) return null;
    let to = roundPrice(it.sellingPrice * (1 - step.pct / 100), md.rounding);
    if (it.minPrice != null && to < it.minPrice) to = it.minPrice;
    if (to >= it.sellingPrice) return null;
    return { step: (it.markdownStep || 0) + 1, of: steps.length, pct: step.pct, from: it.sellingPrice, to, age };
  }
  const relistDue = (it) => !Calc.isSold(it) && (it.status || '').toLowerCase() === 'available' && (S().markdown.relistDays || 0) > 0 && daysSince(it.lastRelisted || it.datePosted) >= S().markdown.relistDays;
  const decideDue = (it) => !Calc.isSold(it) && (it.status || '').toLowerCase() === 'available' && !it.bundle && Calc.daysActive(it) >= (S().markdown.decideDays || 365) && !(it.decideSnooze && it.decideSnooze > U.todayISO());
  function upcomingTax() {
    const today = U.todayISO(), y = +today.slice(0, 4);
    const qs = [...Calc.quarterTaxes(state.items, state.expenses, S(), state.mileage, y - 1), ...Calc.quarterTaxes(state.items, state.expenses, S(), state.mileage, y)];
    return qs.filter((q) => q.due >= today).sort((a, b) => a.due.localeCompare(b.due))[0] || null;
  }
  function actionCounts() {
    const items = state.items;
    return { delist: items.filter(needsDelist).length, markdown: items.filter((i) => markdownDue(i)).length, relist: items.filter(relistDue).length, decide: items.filter(decideDue).length, bundle: items.filter((i) => i.bundle && !Calc.isSold(i)).length };
  }
  const actState = { limit: { markdown: 25, relist: 25, decide: 25 }, mdSel: new Set() };
  function renderActions() {
    const c = actionCounts();
    const items = state.items;
    const tax = upcomingTax();
    const lb = state.meta.lastBackup, bdays = lb ? daysSince(lb.slice(0, 10)) : null;
    const md = S().markdown;
    const row = (it, right, extra = '') => `<div class="act-row" data-aid="${esc(it.id)}">${state.thumbs[it.id] ? `<img class="act-thumb" src="${state.thumbs[it.id].thumb}" alt="">` : '<span class="act-thumb ph"></span>'}
      <div class="act-main"><div class="act-name">${esc(it.name)}</div><div class="muted small">${[it.sku ? 'SKU ' + esc(it.sku) : '', it.brand ? esc(it.brand) : '', it.size ? 'Size ' + esc(it.size) : '', it.location ? '📍 ' + esc(it.location) : ''].filter(Boolean).join(' · ')}${extra}</div></div>${right}</div>`;
    const more = (key, total) => (total > actState.limit[key] ? `<button class="linklike act-more" data-more="${key}">Show all ${total}</button>` : '');

    const delist = items.filter(needsDelist);
    const mdList = items.map((i) => ({ i, d: markdownDue(i) })).filter((x) => x.d).sort((a, b) => b.d.age - a.d.age);
    const rel = items.filter(relistDue).sort((a, b) => daysSince(b.lastRelisted || b.datePosted) - daysSince(a.lastRelisted || a.datePosted));
    const dec = items.filter(decideDue).sort((a, b) => Calc.daysActive(b) - Calc.daysActive(a));
    const bun = items.filter((i) => i.bundle && !Calc.isSold(i));
    const mdSavings = mdList.reduce((a, x) => a + (x.d.from - x.d.to), 0);

    $('#actKpis').innerHTML = [
      kpi('Delist needed', U.int(c.delist), 'sold, still live elsewhere', c.delist ? 'var(--danger)' : 'var(--sold)', false),
      kpi('Price drops due', U.int(c.markdown), mdList.length ? `−${U.money0(mdSavings)} total` : 'none right now', 'var(--aging)'),
      kpi('Refresh / relist', U.int(c.relist), `not refreshed in ${md.relistDays}+ days`, 'var(--fresh)'),
      kpi('Decide', U.int(c.decide), `listed ${md.decideDays}+ days`, 'var(--stale)'),
      kpi('Next est. tax', tax ? U.money0(tax.owed) : '—', tax ? `Q${tax.q} ${tax.year} due ${U.fmtDate(tax.due)}` : '', 'var(--pending)')
    ].join('');

    $('#actBody').innerHTML = (window.Ext && Ext.actionsTop ? Ext.actionsTop() : '') + `
      <section class="card act-card ${delist.length ? 'urgent' : ''}">
        <div class="card-head"><h3>🔴 Delist needed <span class="pill">${delist.length}</span></h3><span class="muted small">Sold items that are still active on other sites — remove them so they can’t sell twice.</span></div>
        ${delist.length ? delist.map((it) => row(it, `<div class="act-btns"><span class="chips">${(it.listings || []).filter((l) => l.status === 'active').map((l) => `<span class="chip" style="--c:${esc(platformColor(l.platform))}">${esc(platformLabel(l.platform))}${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">↗</a>` : ''}</span>`).join('')}</span><button class="btn btn-sm btn-primary" data-act="delist">Checklist</button></div>`, ` · sold ${esc(U.fmtDate(it.dateSold))}${it.platform ? ' on ' + esc(platformLabel(it.platform)) : ''}`)).join('') : '<div class="empty">Nothing to delist ✓</div>'}
      </section>

      <section class="card act-card">
        <div class="card-head"><h3>🏷️ Price drops due <span class="pill">${mdList.length}</span></h3>
          <span class="muted small">Your plan: ${(md.steps || []).map((x) => `−${x.pct}% at ${x.days} days`).join(', ')} · at least ${md.minGapDays} days apart · never below the item’s lowest price. <button class="linklike" data-goto="settings">Change plan</button></span></div>
        ${mdList.length ? `<div class="act-tools"><label class="check"><input type="checkbox" data-md-all ${actState.mdSel.size && mdList.every((x) => actState.mdSel.has(x.i.id)) ? 'checked' : ''}> Select all</label><span class="spacer"></span>
            <button class="btn btn-sm" data-md="skip">Skip selected</button><button class="btn btn-sm btn-primary" data-md="apply">Apply selected</button><button class="btn btn-sm btn-gold" data-md="applyall">Apply all ${mdList.length}</button></div>
          ${mdList.slice(0, actState.limit.markdown).map(({ i, d }) => row(i, `<div class="act-btns"><span class="md-price"><s>${esc(U.money(d.from))}</s> → <b>${esc(U.money(d.to))}</b></span><span class="badge b-other">step ${d.step}/${d.of} · −${d.pct}%</span><input type="checkbox" data-md-sel="${esc(i.id)}" ${actState.mdSel.has(i.id) ? 'checked' : ''} aria-label="Select"></div>`, ` · ${U.int(d.age)} days listed${i.minPrice != null ? ' · lowest ' + esc(U.money(i.minPrice)) : ''}`)).join('')}${more('markdown', mdList.length)}`
          : '<div class="empty">No price drops due.</div>'}
      </section>

      <section class="card act-card">
        <div class="card-head"><h3>🔁 Refresh / relist <span class="pill">${rel.length}</span></h3><span class="muted small">Listings not refreshed in ${md.relistDays}+ days. Relisting or sharing pushes them back to the top of search.</span></div>
        ${rel.length ? `<div class="act-tools"><span class="spacer"></span><button class="btn btn-sm" data-rel-all>Mark all ${rel.length} refreshed today</button></div>`
          + rel.slice(0, actState.limit.relist).map((it) => row(it, `<div class="act-btns"><span class="chips">${(it.listings || []).filter((l) => l.status === 'active' && l.url).map((l) => `<span class="chip" style="--c:${esc(platformColor(l.platform))}">${esc(platformLabel(l.platform))}<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">↗</a></span>`).join('')}</span><button class="btn btn-sm" data-act="relisted">Refreshed</button></div>`, ` · last refreshed ${U.int(daysSince(it.lastRelisted || it.datePosted))} days ago`)).join('') + more('relist', rel.length)
          : '<div class="empty">Everything was refreshed recently.</div>'}
      </section>

      <section class="card act-card">
        <div class="card-head"><h3>🤔 Decide <span class="pill">${dec.length}</span></h3><span class="muted small">Listed ${md.decideDays}+ days. Bundle it, discount it hard, donate it (written off at cost), or keep it for 90 more days.</span></div>
        ${dec.length ? dec.slice(0, actState.limit.decide).map((it) => row(it, `<div class="act-btns"><span class="md-price">${esc(U.money(it.sellingPrice))}</span>
            <button class="btn btn-sm" data-act="bundle">Bundle</button><button class="btn btn-sm" data-act="deep">−${md.deepDiscountPct}%</button><button class="btn btn-sm" data-act="donate">Donate</button><button class="btn btn-sm btn-ghost" data-act="keep">Keep 90 days</button></div>`, ` · ${U.int(Calc.daysActive(it))} days listed · cost ${esc(U.money(it.purchasePrice) || '$0.00')}`)).join('') + more('decide', dec.length)
          : '<div class="empty">No items to decide on.</div>'}
      </section>

      ${bun.length ? `<section class="card act-card"><div class="card-head"><h3>🎁 Bundle candidates <span class="pill">${bun.length}</span></h3><span class="muted small">Total list value ${U.money0(bun.reduce((a, i) => a + (i.sellingPrice || 0), 0))} · cost ${U.money0(bun.reduce((a, i) => a + (i.purchasePrice || 0), 0))}</span></div>
        ${bun.map((it) => row(it, `<div class="act-btns"><span class="md-price">${esc(U.money(it.sellingPrice))}</span><button class="btn btn-sm btn-ghost" data-act="unbundle">Remove</button></div>`)).join('')}</section>` : ''}

      <section class="card act-card">
        <div class="card-head"><h3>🧾 Estimated taxes</h3><span class="muted small">Based on profit in each IRS period and the rates in Settings. <button class="linklike" data-goto="reports">Full table in Reports</button></span></div>
        ${tax ? `<div class="act-row"><div class="act-main"><div class="act-name">Q${tax.q} ${tax.year} — due ${esc(U.fmtDate(tax.due))} (${U.int(U.daysBetween(U.todayISO(), tax.due))} days)</div><div class="muted small">Profit ${esc(U.fmtDate(tax.from))} – ${esc(U.fmtDate(tax.to))}: ${esc(U.money(tax.profit))} · estimate ${esc(U.money(tax.tax))} · paid ${esc(U.money(tax.paid))}</div></div><div class="act-btns"><span class="md-price"><b>${esc(U.money(tax.owed))}</b> left</span><button class="btn btn-sm" data-taxpay="${tax.year}-${tax.q}">Record payment</button></div></div>` : '<div class="empty">No upcoming payment.</div>'}
      </section>

      <section class="card act-card">
        <div class="card-head"><h3>💾 Backups</h3></div>
        <div class="act-row"><div class="act-main"><div class="act-name">${lb ? `Last backup ${U.int(bdays)} day(s) ago` : 'No backup yet'}</div><div class="muted small">${S().sync.enabled ? 'Google Drive sync is on' + (S().sync.lastSync ? ' · last synced ' + esc(new Date(S().sync.lastSync).toLocaleString()) : '') + '. ' : ''}Keep a JSON backup somewhere private, too.</div></div><div class="act-btns"><button class="btn btn-sm btn-primary" data-act-backup>Back up now</button></div></div>
      </section>`;
    renderCounts();
  }
  function setupActions() {
    $('#view-actions').addEventListener('click', async (e) => {
      const more = e.target.closest('[data-more]'); if (more) { actState.limit[more.dataset.more] = 1e9; renderActions(); return; }
      if (e.target.closest('[data-act-backup]')) { exportJSON().then(renderActions); return; }
      const tp = e.target.closest('[data-taxpay]'); if (tp) { const [y, q] = tp.dataset.taxpay.split('-'); recordTaxPayment(+y, +q); return; }
      if (e.target.closest('[data-rel-all]')) {
        const list = state.items.filter(relistDue);
        commit('items', list.map((it) => ({ id: it.id, after: { ...U.clone(it), lastRelisted: U.todayISO() } })), { label: 'mark refreshed' });
        renderActions(); U.toast(`${list.length} items marked refreshed`, 'ok'); return;
      }
      const mdBtn = e.target.closest('[data-md]');
      if (mdBtn) {
        const all = state.items.filter((i) => markdownDue(i));
        const list = mdBtn.dataset.md === 'applyall' ? all : all.filter((i) => actState.mdSel.has(i.id));
        if (!list.length) { U.toast('Select items first (tick the boxes on the right).'); return; }
        if (mdBtn.dataset.md === 'skip') {
          commit('items', list.map((it) => ({ id: it.id, after: { ...U.clone(it), lastMarkdown: U.todayISO() } })), { label: 'skip markdown' });
          U.toast(`Skipped ${list.length} — they’ll come back after ${S().markdown.minGapDays} days`);
        } else {
          if (mdBtn.dataset.md === 'applyall' && !(await U.confirm('Apply price drops', `Lower the price of <b>${list.length}</b> items by your markdown plan? Remember to update the prices on each site too. You can undo right after.`, 'Apply all'))) return;
          commit('items', list.map((it) => { const d = markdownDue(it); return { id: it.id, after: { ...U.clone(it), sellingPrice: d.to, markdownStep: d.step, lastMarkdown: U.todayISO(), _priceReason: `markdown −${d.pct}%` } }; }), { label: 'markdown' });
          U.toast(`Lowered ${list.length} price(s). Update them on each site too.`, 'ok');
        }
        actState.mdSel.clear(); renderActions(); return;
      }
      const ar = e.target.closest('[data-aid]');
      const a = e.target.closest('button[data-act]');
      if (!a || !ar) {
        const nm = e.target.closest('.act-name'); if (nm && ar) itemDialog(findItem(ar.dataset.aid));
        return;
      }
      const it = findItem(ar.dataset.aid); if (!it) return;
      const md = S().markdown;
      const save = (patch, label, msg) => { commit('items', [{ id: it.id, after: { ...U.clone(it), ...patch } }], { label }); renderActions(); if (msg) U.toast(msg, 'ok'); };
      switch (a.dataset.act) {
        case 'delist': delistChecklist(it); break;
        case 'relisted': save({ lastRelisted: U.todayISO() }, 'refreshed'); break;
        case 'bundle': save({ bundle: true }, 'bundle', 'Added to bundle candidates'); break;
        case 'unbundle': save({ bundle: false }, 'unbundle'); break;
        case 'keep': { const d = new Date(); d.setDate(d.getDate() + 90); save({ decideSnooze: U.toISO(d) }, 'keep', 'Kept — it will come back in 90 days'); break; }
        case 'deep': { let to = roundPrice(it.sellingPrice * (1 - md.deepDiscountPct / 100), md.rounding); if (it.minPrice != null && to < it.minPrice) to = it.minPrice; save({ sellingPrice: to, lastMarkdown: U.todayISO(), _priceReason: `deep discount −${md.deepDiscountPct}%` }, 'deep discount', `Price set to ${U.money(to)} — update it on each site`); break; }
        case 'donate':
          if (!(await U.confirm('Donate item', `Mark “${esc(it.name)}” as donated? It leaves your inventory and its cost (${esc(U.money(it.purchasePrice) || '$0.00')}) is written off. Remember to delist it everywhere.`, 'Donate'))) return;
          save({ status: 'donated', disposedDate: U.todayISO(), listings: (it.listings || []).map((l) => (l.status === 'active' ? { ...l, status: 'delisted', statusDate: U.todayISO() } : l)) }, 'donate', 'Marked donated');
          break;
      }
    });
    $('#view-actions').addEventListener('change', (e) => {
      const s1 = e.target.closest('[data-md-sel]'); if (s1) { e.target.checked ? actState.mdSel.add(s1.dataset.mdSel) : actState.mdSel.delete(s1.dataset.mdSel); return; }
      if (e.target.matches('[data-md-all]')) { state.items.filter((i) => markdownDue(i)).forEach((i) => (e.target.checked ? actState.mdSel.add(i.id) : actState.mdSel.delete(i.id))); renderActions(); }
    });
  }
  async function recordTaxPayment(year, q) {
    const v = await U.prompt(`Record payment — Q${q} ${year}`, 'Amount paid to the IRS', { type: 'text', placeholder: '0.00', okLabel: 'Save' });
    const amt = U.num(v); if (amt === null) return;
    S().taxPayments = [...(S().taxPayments || []), { id: U.uid(), year, q, amount: U.round2(amt), date: U.todayISO() }];
    saveSettings(); renderView(currentView()); U.toast('Payment recorded', 'ok');
  }

  /* ---- bulk price change ---- */
  async function bulkPriceDialog(list) {
    if (!list.length) return;
    const md = S().markdown;
    const body = document.createElement('div');
    body.innerHTML = `<div class="form-grid g3">
        <label class="field"><span>Change</span><select name="mode"><option value="pctoff">% off</option><option value="amtoff">$ off</option><option value="set">Set price to</option><option value="pctup">% increase</option></select></label>
        <label class="field"><span>Amount</span><input name="amt" inputmode="decimal" value="10"></label>
        <label class="field"><span>Rounding</span><select name="round"><option value="none">Exact cents</option><option value="whole" ${md.rounding === 'whole' ? 'selected' : ''}>Whole dollars</option><option value="99" ${md.rounding === '99' ? 'selected' : ''}>.99 endings</option></select></label>
      </div>
      <label class="check"><input type="checkbox" name="floor" checked> Never go below each item’s lowest acceptable price</label>
      <div class="imp-prev" data-prev style="margin-top:10px"></div>`;
    const f = (n) => body.querySelector(`[name="${n}"]`);
    const calcNew = (it) => {
      const a = U.num(f('amt').value) || 0, p = it.sellingPrice || 0;
      let v = { pctoff: p * (1 - a / 100), amtoff: p - a, set: a, pctup: p * (1 + a / 100) }[f('mode').value];
      v = roundPrice(Math.max(0, v), f('round').value);
      if (f('floor').checked && it.minPrice != null && v < it.minPrice) v = it.minPrice;
      return v;
    };
    const prev = () => {
      const ch = list.filter((it) => it.sellingPrice != null && calcNew(it) !== it.sellingPrice);
      body.querySelector('[data-prev]').innerHTML = `<table><thead><tr><th>Item</th><th>Now</th><th>New</th></tr></thead><tbody>${list.slice(0, 8).map((it) => `<tr><td>${esc(it.name)}</td><td>${esc(U.money(it.sellingPrice) || '—')}</td><td><b>${it.sellingPrice == null ? '—' : esc(U.money(calcNew(it)))}</b></td></tr>`).join('')}</tbody></table>${list.length > 8 ? `<p class="muted small">…and ${list.length - 8} more</p>` : ''}<p class="muted small"><b>${ch.length}</b> of ${list.length} prices will change. Each change is saved to the item’s price history.</p>`;
    };
    body.addEventListener('input', prev); body.addEventListener('change', prev); prev();
    const ok = await U.modal({ title: `Change price — ${list.length} item(s)`, body, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'Apply', cls: 'btn-primary' }] });
    if (!ok) return;
    const reason = { pctoff: `${f('amt').value}% off`, amtoff: `$${f('amt').value} off`, set: 'price set', pctup: `${f('amt').value}% increase` }[f('mode').value];
    const changes = list.filter((it) => it.sellingPrice != null || f('mode').value === 'set').map((it) => ({ id: it.id, after: { ...U.clone(it), sellingPrice: calcNew(it), lastMarkdown: U.todayISO(), _priceReason: reason } })).filter((c) => c.after.sellingPrice !== findItem(c.id).sellingPrice);
    commit('items', changes, { label: 'bulk price' });
    renderAll();
    U.toast(`Updated ${changes.length} price(s) — update them on each site too`, 'ok');
  }

  /* =========================================================
     LABELS, SCANNING, LINKS TO ITEMS
     ========================================================= */
  const logoURL = () => (state.logo && state.logo.dataURL) || '';
  const labelCtx = () => ({ format: S().labelFormat || 'avery5160', money: U.money, platformLabel, logo: logoURL(), company: (S().companyName ?? '').trim() });
  const printCtx = () => ({ items: state.items, expenses: state.expenses, mileage: state.mileage, settings: S(), platformLabel, logo: logoURL(), company: (S().companyName ?? '').trim() });
  function openItemFromCode(text) {
    { const m = /#bin=([^&\s]+)/.exec(String(text || '')); if (m && window.Ext && Ext.openBin) { Ext.openBin(decodeURIComponent(m[1])); return; } }
    const q = Labels.parse(text);
    let it = q.id ? findItem(q.id) : null;
    if (!it && q.sku) {
      const hits = state.items.filter((i) => skuKey(i.sku) === skuKey(q.sku));
      if (hits.length > 1) { pickSkuItem(q.sku, hits); return; }
      it = hits[0];
    }
    if (!it) { U.toast(q.id ? 'That item isn’t in this inventory (it may have been deleted)' : `No item with SKU “${q.sku}”`, 'err'); return; }
    showView('inventory'); $('#btnClearFilters').click(); flashRow(it.id); itemDialog(it);
  }
  document.addEventListener('input', (e) => {
    if (!e.target.matches('#modalBody [name=sku]')) return;
    const w = e.target.parentElement.querySelector('[data-skuwarn]'); if (w) w.textContent = skuDupNote(e.target.value.trim(), w.dataset.skuwarn);
  });
  async function pickSkuItem(sku, hits) {
    const order = [...hits].sort((a, b) => Number(Calc.isSold(a)) - Number(Calc.isSold(b)) || (a.name || '').localeCompare(b.name || ''));
    const body = `<p class="muted">${hits.length} items share SKU <b>${esc(sku)}</b>. Which one is it?</p>
      <div class="sku-pick">${order.map((x) => { const t = state.thumbs[x.id]; return `<button type="button" class="sku-opt" data-pick="${esc(x.id)}"><span class="so-ph">${t ? `<img src="${t.thumb}" alt="">` : ''}</span><span class="so-t"><b>${esc(x.name || 'Untitled')}</b><em>${[x.brand, x.size ? 'Size ' + x.size : '', x.color, x.location ? '📍 ' + x.location : ''].filter(Boolean).map(esc).join(' · ')}</em></span><span class="so-r">${statusBadge(x.status)}<b>${esc(U.money(x.sellingPrice))}</b></span></button>`; }).join('')}</div>`;
    const id = await U.modal({ title: 'Which item?', body, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }],
      onOpen: (b) => b.addEventListener('click', (e) => { const p = e.target.closest('[data-pick]'); if (p) U.closeModal(p.dataset.pick); }) });
    const it = id && findItem(id);
    if (it) { showView('inventory'); $('#btnClearFilters').click(); flashRow(it.id); itemDialog(it); }
  }
  function handleHash() {
    const h = location.hash;
    if (/^#bin=/.test(h) && Store.unlocked && window.Ext && Ext.openBin) { history.replaceState(null, '', location.pathname + location.search); Ext.openBin(decodeURIComponent(h.slice(5))); return; }
    if (!/^#(sku|id)=/.test(h) || !Store.unlocked) return;
    history.replaceState(null, '', location.pathname + location.search);
    openItemFromCode(h);
  }
  window.addEventListener('hashchange', handleHash);

  /* =========================================================
     MILEAGE LOG (Expenses tab)
     ========================================================= */
  const findTrip = (id) => state.mileage.find((t) => t.id === id);
  const MILE_COLS = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'purpose', label: 'Purpose', type: 'list', free: true, list: () => uniq(['Sourcing', 'Post office / drop-off', 'Supplies run', 'Other', ...state.mileage.map((t) => t.purpose)]) },
    { key: 'from', label: 'From', type: 'text' },
    { key: 'to', label: 'To', type: 'text', width: 140 },
    { key: 'miles', label: 'Miles (one way)', type: 'dec' },
    { key: 'roundTrip', label: 'Round trip', type: 'custom', render: (t) => (t.roundTrip ? '✓ Yes' : '<span class="muted">No</span>'), editor: (t) => { commit('mileage', [{ id: t.id, after: { ...U.clone(t), roundTrip: !t.roundTrip } }], { label: 'round trip' }); mileGrid.render(); } },
    { key: 'total', label: 'Total Miles', type: 'dec', computed: true, total: 'sum', get: (t) => Calc.tripMiles(t) },
    { key: 'rate', label: 'IRS Rate', type: 'money', computed: true, get: (t) => Calc.mileageRate(t.date, S().mileageRates), render: (t) => `$${Calc.mileageRate(t.date, S().mileageRates).toFixed(3)}` },
    { key: 'deduction', label: 'Deduction', type: 'money', computed: true, total: 'sum', get: (t) => Calc.tripDeduction(t, S().mileageRates) },
    { key: 'notes', label: 'Notes', type: 'text', width: 160 }
  ];
  let mileGrid;
  function setupMileage() {
    mileGrid = createGrid({
      table: $('#mileTable'), columns: MILE_COLS, titleKey: 'purpose', phoneKeep: ['date', 'total', 'deduction'], phoneCols: ['purpose', 'date', 'to', 'total', 'deduction', 'roundTrip'], rows: () => { const y = $('#mileYear').value; return state.mileage.filter((t) => !y || t.date.startsWith(y)); }, find: findTrip,
      getSort: () => S().mileSort || [{ key: 'date', dir: 'desc' }], setSort: (v) => { S().mileSort = v; saveSettings(); },
      footer: true, emptyText: 'No trips yet. Log sourcing runs, post-office trips and supply runs — they’re deductible.',
      onEdit: (t, key, v) => { commit('mileage', [{ id: t.id, after: { ...U.clone(t), [key]: key === 'miles' ? (v ?? 0) : v } }], { label: 'edit trip' }); renderMileSummary(); },
      actions: [
        { icon: ICON.dup, title: 'Repeat this trip today', fn: (t) => { const c = { ...U.clone(t), id: U.uid(), date: U.todayISO(), createdAt: Date.now() }; commit('mileage', [{ id: c.id, after: c }], { label: 'repeat trip' }); mileGrid.render(); renderMileSummary(); } },
        { icon: ICON.del, title: 'Delete', cls: 'del', fn: (t) => { commit('mileage', [{ id: t.id, after: null }], { label: 'delete trip' }); mileGrid.render(); renderMileSummary(); U.toast('Trip deleted', ''); } }
      ],
      afterRender: renderMileSummary
    });
    $('#btnAddTrip').onclick = async () => {
      const body = document.createElement('div');
      body.innerHTML = `<div class="form-grid">
        <label class="field"><span>Date</span><input type="date" name="date" value="${U.todayISO()}"></label>
        <label class="field"><span>Purpose</span><input name="purpose" list="dlPurp" value="Sourcing"></label>
        <label class="field"><span>From</span><input name="from" placeholder="Home"></label>
        <label class="field"><span>To</span><input name="to" placeholder="e.g. Goodwill Main St"></label>
        <label class="field"><span>Miles (one way)</span><input name="miles" inputmode="decimal"></label>
        <label class="check" style="margin-top:24px"><input type="checkbox" name="roundTrip" checked> Round trip (doubles the miles)</label>
        <label class="field span-2"><span>Notes</span><input name="notes"></label></div>
        ${dl('dlPurp', ['Sourcing', 'Post office / drop-off', 'Supplies run', 'Other'])}
        <p class="muted small">Deduction uses the IRS standard business rate in effect on the trip date (Settings → Taxes). If you deduct mileage, you can’t also deduct gas or car repairs.</p>`;
      const f = (n) => body.querySelector(`[name="${n}"]`);
      const ok = await U.modal({ title: 'Log a trip', body, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'Add trip', cls: 'btn-primary', validate: () => { if (!(U.num(f('miles').value) > 0)) { f('miles').focus(); return false; } return true; } }] });
      if (!ok) return;
      const t = normalizeTrip({ date: f('date').value, purpose: f('purpose').value, from: f('from').value, to: f('to').value, miles: U.num(f('miles').value), roundTrip: f('roundTrip').checked, notes: f('notes').value });
      commit('mileage', [{ id: t.id, after: t }], { label: 'add trip' });
      mileGrid.render(); U.toast(`Trip logged — ${U.money(Calc.tripDeduction(t, S().mileageRates))} deduction`, 'ok');
    };
    $('#mileYear').addEventListener('change', () => mileGrid.render());
  }
  function renderMileSummary() {
    const y = $('#mileYear').value;
    const ys = uniq([String(new Date().getFullYear()), ...state.mileage.map((t) => t.date.slice(0, 4))]).sort().reverse();
    $('#mileYear').innerHTML = '<option value="">All years</option>' + ys.map((x) => `<option ${x === y ? 'selected' : ''}>${x}</option>`).join('');
    const list = state.mileage.filter((t) => !y || t.date.startsWith(y));
    const miles = list.reduce((a, t) => a + Calc.tripMiles(t), 0), ded = list.reduce((a, t) => a + Calc.tripDeduction(t, S().mileageRates), 0);
    $('#mileSummary').textContent = `${list.length} trip(s) · ${miles.toFixed(1)} miles · ${U.money0(ded)} deduction`;
  }

  /* =========================================================
     REPORT EXTRAS: quarterly taxes, 1099-K, what sells, sourcing
     ========================================================= */
  function reportExtrasHTML() {
    const y = +($('#repYear') && $('#repYear').value) || new Date().getFullYear();
    const years = uniq([String(new Date().getFullYear()), ...state.items.filter(Calc.isSold).map((i) => (i.dateSold || '').slice(0, 4)).filter(Boolean)]).sort().reverse();
    const qs = Calc.quarterTaxes(state.items, state.expenses, S(), state.mileage, y);
    const today = U.todayISO();
    const plat = Calc.platformYear(state.items, y);
    const perf = (fn) => Calc.groupPerf(state.items, fn).sort((a, b) => b.sold - a.sold || b.items - a.items).slice(0, 12);
    const perfTable = (title, rows) => `<div><h4 class="sec" style="border:0;padding:0;margin-top:0">${title}</h4><table class="pl perf"><tr class="hdr"><td></td><td>Items</td><td>Sold</td><td>Sell-thru</td><td>Avg days</td><td>Profit</td></tr>
      ${rows.map((r) => `<tr><td>${esc(r.key)}</td><td>${r.items}</td><td>${r.sold}</td><td>${U.pct(r.sellThrough)}</td><td>${r.avgDays === null ? '—' : U.int(r.avgDays)}</td><td class="${r.profit < 0 ? 'neg' : ''}">${U.money0(r.profit)}</td></tr>`).join('')}</table></div>`;
    const src = Calc.groupPerf(state.items, (i) => i.source).sort((a, b) => b.profit - a.profit);
    return `
      <div class="report-wide card">
        <div class="card-head"><h3>Quarterly estimated taxes</h3><span class="muted small">Year <select id="repYear">${years.map((x) => `<option ${+x === y ? 'selected' : ''}>${x}</option>`).join('')}</select></span></div>
        <table class="pl qt"><tr class="hdr"><td>Period</td><td>Profit earned</td><td>Est. tax</td><td>Paid</td><td>Still owed</td><td>Due</td><td></td></tr>
        ${qs.map((q) => `<tr class="${q.due < today && q.owed > 0 ? 'late' : ''}"><td>Q${q.q}: ${esc(U.fmtDate(q.from))} – ${esc(U.fmtDate(q.to))}</td><td>${U.money(q.profit)}</td><td>${U.money(q.tax)}</td><td>${U.money(q.paid)}</td><td><b>${U.money(q.owed)}</b></td><td>${esc(U.fmtDate(q.due))}${q.due < today ? ' <span class="muted small">(passed)</span>' : ''}</td><td><button class="btn btn-sm" data-taxpay="${y}-${q.q}">Record payment</button></td></tr>`).join('')}</table>
        <p class="note">Each period’s estimate applies your tax rates to the profit earned in that IRS period (Q2 covers only April–May, Q4 covers September–December). Due dates falling on a weekend move to Monday; holidays aren’t adjusted. Planning estimates only.</p>
      </div>
      <div class="report-wide card">
        <div class="card-head"><h3>Sales by platform — ${y} (Form 1099-K check)</h3></div>
        ${plat.length ? `<table class="pl"><tr class="hdr"><td>Platform</td><td>Transactions</td><td>Gross sales</td><td>Net after fees</td><td>1099-K expected?</td></tr>
          ${plat.map((p) => `<tr><td>${esc(platformLabel(p.platform))}</td><td>${p.count}</td><td>${U.money(p.gross)}</td><td>${U.money(p.net)}</td><td>${p.over ? '<b>Yes</b>' : `No <span class="muted small">(${U.pct(Math.min(p.gross / 20000, 1))} of $20,000 · ${p.count}/200 sales)</span>`}</td></tr>`).join('')}</table>` : '<div class="empty">No sales in this year.</div>'}
        <p class="note">Federal rule: a platform must send a 1099-K when your gross payments exceed $20,000 <i>and</i> you have more than 200 transactions in the year. Some states use lower thresholds. All sales income is reportable either way.</p>
      </div>
      <div class="report-wide card">
        <div class="card-head"><h3>What sells</h3><span class="muted small">All items · sell-through = sold ÷ (sold + in stock). Fill in Brand and Size on items to see more.</span></div>
        <div class="perf-grid">${perfTable('By brand', perf((i) => i.brand))}${perfTable('By size', perf((i) => i.size))}${perfTable('By category', perf((i) => i.category))}</div>
      </div>
      <div class="report-wide card">
        <div class="card-head"><h3>Profit by source</h3><span class="muted small">Where you buy — set “Source” on items (bulk-editable in the table).</span></div>
        <table class="pl perf"><tr class="hdr"><td>Source</td><td>Items</td><td>Spent</td><td>Sold</td><td>Sell-thru</td><td>Gross</td><td>Profit</td><td>ROI on spend</td></tr>
        ${src.map((r) => `<tr><td>${esc(r.key)}</td><td>${r.items}</td><td>${U.money0(r.cost)}</td><td>${r.sold}</td><td>${U.pct(r.sellThrough)}</td><td>${U.money0(r.gross)}</td><td class="${r.profit < 0 ? 'neg' : ''}">${U.money0(r.profit)}</td><td>${r.roi === null ? '—' : U.pct(r.roi)}</td></tr>`).join('')}</table>
      </div>`;
  }

  /* =========================================================
     GOALS (Dashboard) + REMINDER BANNER
     ========================================================= */
  function renderGoals() {
    const g = S().goals || {};
    const el = $('#goalsCard'); if (!el) return;
    const r = U.rangePreset('month');
    const m = Calc.metrics(state.items, state.expenses, S(), r.from, r.to, state.mileage);
    const t = new Date(), dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(), pace = t.getDate() / dim;
    const bar = (label, val, goal, fmt) => { const f = goal ? val / goal : 0; const ahead = goal && f >= pace; const col = f >= 1 ? 'var(--sold)' : ahead ? 'var(--ink-3)' : 'var(--aging)'; return `<div class="goal goal-r">${Dash.ring(f, col, pace)}<div><div class="goal-label">${label}</div><div class="goal-val"><b>${fmt(val)}</b> <span class="muted">of ${fmt(goal)}</span></div><div class="muted small">${goal ? (val >= goal ? '🎉 Goal reached!' : `${fmt(Math.max(0, goal - val))} to go · ${ahead ? 'ahead of' : 'behind'} pace`) : ''}</div></div></div>`; };
    el.innerHTML = (g.sales || g.profit || g.items)
      ? `<div class="card goals"><div class="card-head"><h3>${t.toLocaleDateString(undefined, { month: 'long' })} goals</h3><span class="muted small">day ${t.getDate()} of ${dim} · <button class="linklike" data-goto="settings">edit goals</button></span></div><div class="goal-grid">
          ${g.sales ? bar('Gross sales', m.gross, g.sales, U.money0) : ''}${g.profit ? bar('Net profit', m.netProfit, g.profit, U.money0) : ''}${g.items ? bar('Items sold', m.soldCount, g.items, (n) => U.int(n)) : ''}</div></div>`
      : `<div class="card goals goals-empty"><span>🎯 Set monthly goals for sales, profit and items sold to track your progress here.</span><button class="btn btn-sm" data-goto="settings">Set goals</button></div>`;
  }
  /** shimmering placeholders while the encrypted data is being opened */
  function showSkeleton() {
    $('#lock').classList.add('hidden'); $('#app').classList.remove('hidden');
    document.querySelectorAll('.view').forEach((x) => x.classList.toggle('active', x.id === 'view-dashboard'));
    const sk = (h, w = '100%') => `<div class="skel" style="height:${h}px;width:${w}"></div>`;
    $('#kpis').innerHTML = Array.from({ length: 4 }, () => `<div class="kpi">${sk(12, '45%')}${sk(28, '70%')}${sk(10, '55%')}</div>`).join('');
    ['#goalsCard', '#milestonesCard'].forEach((q) => { const e = $(q); if (e) e.innerHTML = `<div class="card">${sk(16, '30%')}<div style="height:10px"></div>${sk(70)}</div>`; });
    ['#platformDonut', '#salesCal', '#bestStrip'].forEach((q) => { const e = $(q); if (e) e.innerHTML = sk(140); });
  }
  function renderBanner() {
    const el = $('#banner'); if (!el || !Store.unlocked) return;
    const msgs = [];
    const lb = state.meta.lastBackup, days = lb ? daysSince(lb.slice(0, 10)) : null, every = +S().backupReminderDays || 0;
    if (every && state.items.length && (days === null || days >= every) && !(S().backupSnoozeUntil && S().backupSnoozeUntil > U.todayISO()))
      msgs.push(`<span>💾 ${days === null ? 'You haven’t made a backup yet.' : `Your last backup was ${days} days ago.`} ${window.Sync && Sync.signedIn() ? 'Your data is also synced to the cloud, but a backup file is your safety net.' : 'Data lives only in this browser.'}</span><button class="btn btn-sm btn-gold" data-ban="backup">Back up now</button><button class="btn btn-sm btn-ghost" data-ban="snooze">Remind me tomorrow</button>`);
    if (state.meta.hasRecovery === false && state.items.length)
      msgs.push(`<span>🔑 Set up <b>password reset questions</b> so you can get back in if you ever forget your password.</span><button class="btn btn-sm btn-gold" data-ban="recovery">Set up now</button>`);
    const tax = upcomingTax();
    if (tax && tax.owed > 0 && U.daysBetween(U.todayISO(), tax.due) <= (+S().taxReminderDays || 21))
      msgs.push(`<span>🧾 Estimated tax for Q${tax.q} ${tax.year} is due <b>${esc(U.fmtDate(tax.due))}</b> — about <b>${esc(U.money(tax.owed))}</b> left to pay.</span><button class="btn btn-sm" data-ban="tax" data-taxpay="${tax.year}-${tax.q}">Record payment</button>`);
    el.innerHTML = msgs.map((m) => `<div class="banner-row">${m}</div>`).join('');
    el.classList.toggle('hidden', !msgs.length);
  }

  /* =========================================================
     SETTINGS: selling plan, templates, goals, taxes, labels
     ========================================================= */
  function renderPlanSettings() {
    const md = S().markdown;
    $('#mdSteps').innerHTML = md.steps.map((st, i) => `<div class="md-step" data-i="${i}">After <input data-k="days" inputmode="numeric" value="${st.days}"> days, lower the price <input data-k="pct" inputmode="decimal" value="${st.pct}">% <button type="button" class="btn btn-sm btn-ghost" data-step-del title="Remove">✕</button></div>`).join('');
    $('#mdGap').value = md.minGapDays; $('#mdRelist').value = md.relistDays; $('#mdDecide').value = md.decideDays; $('#mdDeep').value = md.deepDiscountPct; $('#mdRound').value = md.rounding;
    $('#tplTitle').value = S().templates.title; $('#tplDesc').value = S().templates.description; $('#setConditions').value = (S().conditions || []).join(', ');
    const g = S().goals || {}; $('#goalSales').value = g.sales || ''; $('#goalProfit').value = g.profit || ''; $('#goalItems').value = g.items || '';
    $('#mileRates').innerHTML = (S().mileageRates || []).slice().sort((a, b) => a.from.localeCompare(b.from)).map((r, i) => `<div class="md-step" data-r="${i}">From <input type="date" data-k="from" value="${esc(r.from)}"> rate $<input data-k="rate" inputmode="decimal" value="${r.rate}"> per mile <button type="button" class="btn btn-sm btn-ghost" data-rate-del>✕</button></div>`).join('');
    $('#setTaxRemind').value = S().taxReminderDays; $('#setBackupRemind').value = S().backupReminderDays; $('#setLabelFmt').value = S().labelFormat || 'avery5160';
    $('#setShopUrl').value = S().shopUrl || ''; $('#setSocial').value = S().socialHandle || ''; $('#setThanksMsg').value = S().thankYouMessage || ''; $('#setSlipFmt').value = S().slipFormat || 'letter';
  }
  function setupPlanSettings() {
    $('#setLabelFmt').innerHTML = Object.entries(Labels.FORMATS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('');
    const md = () => S().markdown;
    $('#mdSteps').addEventListener('change', (e) => { const row = e.target.closest('[data-i]'); if (!row || !e.target.dataset.k) return; md().steps[+row.dataset.i][e.target.dataset.k] = Math.max(0, U.num(e.target.value) || 0); md().steps.sort((a, b) => a.days - b.days); saveSettings(); renderPlanSettings(); renderCounts(); });
    $('#mdSteps').addEventListener('click', (e) => { if (!e.target.closest('[data-step-del]')) return; md().steps.splice(+e.target.closest('[data-i]').dataset.i, 1); saveSettings(); renderPlanSettings(); });
    $('#mdAddStep').onclick = () => { const last = md().steps[md().steps.length - 1] || { days: 30, pct: 10 }; md().steps.push({ days: last.days + 60, pct: last.pct + 5 }); saveSettings(); renderPlanSettings(); };
    [['#mdGap', 'minGapDays'], ['#mdRelist', 'relistDays'], ['#mdDecide', 'decideDays'], ['#mdDeep', 'deepDiscountPct']].forEach(([sel, k]) => $(sel).addEventListener('change', (e) => { md()[k] = Math.max(0, U.num(e.target.value) || 0); saveSettings(); renderCounts(); }));
    $('#mdRound').addEventListener('change', (e) => { md().rounding = e.target.value; saveSettings(); });
    $('#tplTitle').addEventListener('change', (e) => { S().templates.title = e.target.value; saveSettings(); });
    $('#tplDesc').addEventListener('change', (e) => { S().templates.description = e.target.value; saveSettings(); });
    $('#tplReset').onclick = () => { S().templates = U.clone(DEFAULT_SETTINGS.templates); saveSettings(); renderPlanSettings(); };
    $('#setConditions').addEventListener('change', (e) => { S().conditions = uniq(U.splitList(e.target.value)); saveSettings(); });
    [['#goalSales', 'sales'], ['#goalProfit', 'profit'], ['#goalItems', 'items']].forEach(([sel, k]) => $(sel).addEventListener('change', (e) => { S().goals = { ...(S().goals || {}), [k]: Math.max(0, U.num(e.target.value) || 0) }; saveSettings(); }));
    $('#mileRates').addEventListener('change', (e) => { const row = e.target.closest('[data-r]'); if (!row) return; const list = S().mileageRates.slice().sort((a, b) => a.from.localeCompare(b.from)); const r = list[+row.dataset.r]; if (e.target.dataset.k === 'from') r.from = e.target.value; else r.rate = U.num(e.target.value) || 0; S().mileageRates = list; saveSettings(); });
    $('#mileRates').addEventListener('click', (e) => { if (!e.target.closest('[data-rate-del]')) return; const list = S().mileageRates.slice().sort((a, b) => a.from.localeCompare(b.from)); list.splice(+e.target.closest('[data-r]').dataset.r, 1); S().mileageRates = list; saveSettings(); renderPlanSettings(); });
    $('#mileAddRate').onclick = () => { S().mileageRates = [...S().mileageRates, { from: `${new Date().getFullYear() + 1}-01-01`, rate: (S().mileageRates.slice(-1)[0] || {}).rate || 0.7 }]; saveSettings(); renderPlanSettings(); };
    $('#setTaxRemind').addEventListener('change', (e) => { S().taxReminderDays = Math.max(0, parseInt(e.target.value, 10) || 0); saveSettings(); renderBanner(); });
    $('#setBackupRemind').addEventListener('change', (e) => { S().backupReminderDays = Math.max(0, parseInt(e.target.value, 10) || 0); saveSettings(); renderBanner(); });
    $('#setLabelFmt').addEventListener('change', (e) => { S().labelFormat = e.target.value; saveSettings(); });
    [['#setShopUrl', 'shopUrl'], ['#setSocial', 'socialHandle'], ['#setThanksMsg', 'thankYouMessage'], ['#setSlipFmt', 'slipFormat']].forEach(([sel, k]) =>
      $(sel).addEventListener('change', (e) => { let v = e.target.value.trim(); if (k === 'shopUrl' && v && !/^https?:\/\//i.test(v)) v = 'https://' + v; S()[k] = v; e.target.value = v; saveSettings(); }));
    $('#banner').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ban]'); if (!b) return;
      if (b.dataset.ban === 'backup') exportJSON().then(renderBanner);
      if (b.dataset.ban === 'recovery') setupRecoveryFromSettings();
      if (b.dataset.ban === 'snooze') { const d = new Date(); d.setDate(d.getDate() + 1); S().backupSnoozeUntil = U.toISO(d); saveSettings(); renderBanner(); }
      if (b.dataset.ban === 'tax') { const [y, q] = b.dataset.taxpay.split('-'); recordTaxPayment(+y, +q).then(renderBanner); }
    });
    document.addEventListener('click', (e) => { const tp = e.target.closest('#reportBody [data-taxpay]'); if (tp) { const [y, q] = tp.dataset.taxpay.split('-'); recordTaxPayment(+y, +q); } });
    document.addEventListener('change', (e) => { if (e.target.id === 'repYear') renderReport(); });
  }

  /* =========================================================
     SYNC BRIDGE (js/cloud-sync.js)
     ========================================================= */
  let syncApplying = false;
  const syncApi = {
    settings: () => S(),
    saveSettingsQuiet: () => persist(() => Store.putVault('settings', state.settings)),
    applying: () => syncApplying,
    takeSnapshot: (r) => takeSnapshot(r),
    async snapshot() {
      const live = new Set(state.items.map((i) => i.id));
      return { questionAnswers: await Store.getQuestionAnswers().catch(() => null), items: state.items, expenses: state.expenses, mileage: state.mileage, settings: state.settings, tombstones: state.meta.tombstones || {}, logo: state.logo, activity: state.activity,
        photos: Object.fromEntries(Object.entries(state.thumbs).filter(([id]) => live.has(id.split('~')[0])).map(([id, t]) => [id, { thumb: t.thumb, w: t.w, h: t.h }])) };
    },
    async apply(m) {
      syncApplying = true;
      try {
        state.items = (m.items || []).map(normalizeItem); state.expenses = (m.expenses || []).map(normalizeExpense); state.mileage = (m.mileage || []).map(normalizeTrip);
        state.settings = { ...U.clone(DEFAULT_SETTINGS), ...m.settings }; state.logo = m.logo || state.logo;
        state.meta.tombstones = m.tombstones || {};
        await Store.replaceAll({ items: state.items, expenses: state.expenses, settings: state.settings, logo: state.logo, meta: { ...state.meta, mileage: state.mileage, activity: state.activity }, photos: null });
        for (const [id, ph] of Object.entries(m.photos || {})) {
          if (!state.thumbs[id] && ph && ph.thumb) { await Store.putPhoto(id, { thumb: ph.thumb, full: ph.thumb, w: ph.w, h: ph.h }); state.thumbs[id] = { thumb: ph.thumb, w: ph.w, h: ph.h }; }
        }
        state.undo = []; state.redo = []; updateUndoUI();
        applySettingsToUI(); renderAll();
        U.toast('Updated with changes from your other device', 'ok');
      } finally { syncApplying = false; }
    }
  };
  /** Changes that arrived from the cloud: put them into this device without triggering another upload. */
  syncApi.applyCloud = async (a, password) => {
    syncApplying = true;
    try {
      if (a.wipe) {
        const ids = { items: state.items.map((x) => x.id), expenses: state.expenses.map((x) => x.id) };
        state.items = []; state.expenses = []; state.mileage = []; state.meta.tombstones = {}; state.selection.clear(); state.activity = []; await Store.putVault('activity', []);
        const photoIds = Object.keys(state.thumbs); state.thumbs = {};
        await Store.deleteMany('items', ids.items); await Store.deleteMany('expenses', ids.expenses); await Store.putVault('mileage', []);
        if (photoIds.length) await Store.deletePhotos(photoIds);
        U.toast('The cloud copy was erased on another device, so this device was cleared too. A safety snapshot was saved first.', 'ok');
      }
      const t = (state.meta.tombstones ||= {});
      for (const kind of ['items', 'expenses', 'mileage']) {
        const k = a[kind]; if (!k || !(k.put.length || k.del.length || k.untomb.length)) continue;
        const list = kind === 'items' ? state.items : kind === 'expenses' ? state.expenses : state.mileage;
        const norm = kind === 'items' ? normalizeItem : kind === 'expenses' ? normalizeExpense : normalizeTrip;
        t[kind] = { ...(t[kind] || {}) };
        const puts = k.put.map((r) => { const rec = norm(r); rec.updatedAt = r.updatedAt; return rec; });
        puts.forEach((rec) => { const i = list.findIndex((x) => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec); delete t[kind][rec.id]; });
        k.del.forEach(({ id, t: ts }) => { const i = list.findIndex((x) => x.id === id); if (i >= 0) list.splice(i, 1); if (ts) t[kind][id] = ts; state.selection.delete(id); });
        k.untomb.forEach((id) => { delete t[kind][id]; });
        if (kind === 'mileage') await Store.putVault('mileage', state.mileage);
        else { if (puts.length) await Store.putMany(kind, puts); if (k.del.length) await Store.deleteMany(kind, k.del.map((d) => d.id)); }
      }
      await Store.putVault('tombstones', t);
      if (a.settings) { state.settings = { ...U.clone(DEFAULT_SETTINGS), ...a.settings, ...Object.fromEntries(['sync', 'yourName', 'viewMode', 'theme', 'tableHeights', 'rowSize', 'invSort', 'invHideSold', 'invGroupSku', 'invSortSku', 'ordSort', 'expSort', 'mileSort', 'hiddenCols', 'backupSnoozeUntil'].filter((x) => x in state.settings).map((x) => [x, state.settings[x]])) }; settingsBaseline(); await Store.putVault('settings', state.settings); }
      if ('logo' in a) { state.logo = a.logo || null; await Store.putVault('logo', state.logo); }
      for (const p of a.photos.put) { await Store.putPhoto(p.id, { thumb: p.thumb, full: p.thumb, w: p.w, h: p.h }); state.thumbs[p.id] = { thumb: p.thumb, w: p.w, h: p.h }; }
      if (a.photos.del.length) { a.photos.del.forEach((id) => delete state.thumbs[id]); await Store.deletePhotos(a.photos.del); }
      if (a.recovery && password) await syncApi.adoptRecovery(a.recovery, password);
      if (a.activity && a.activity.length) addActivity(a.activity);
      state.undo = []; state.redo = []; updateUndoUI();
      applySettingsToUI(); renderLogo(); renderAll();
    } finally { syncApplying = false; }
  };
  /** First sign-in on a device that already has data. */
  syncApi.firstConnect = async ({ cloud, local }) => {
    const r = await U.modal({
      title: 'This device already has data',
      body: `<p style="margin-top:0">The cloud already has <b>${cloud.items} items</b> and <b>${cloud.expenses} expenses</b>. This device has <b>${local.items} items</b> and <b>${local.expenses} expenses</b>.</p>
        <p><b>Use the cloud data (recommended)</b>: this device becomes an exact copy of the cloud. A safety snapshot of this device is saved first.</p>
        <p><b>Combine both</b>: anything only on this device is uploaded; for records on both, the most recently edited version wins.</p>`,
      buttons: [{ label: 'Cancel (sign out)', value: null, cls: 'btn-ghost' }, { label: 'Combine both', value: 'combine' }, { label: 'Use the cloud data', value: 'cloud', cls: 'btn-primary' }]
    });
    return r || null;
  };
  syncApi.confirmMassDelete = async (what) => {
    const r = await U.modal({
      title: 'Delete everywhere?',
      body: `<p style="margin-top:0">This change would delete <b>${U.esc(what)}</b> from the cloud and from every device. That usually happens after restoring an older backup.</p><p>Choose <b>No, bring them back</b> to restore them on this device from the cloud instead.</p>`,
      buttons: [{ label: 'No, bring them back', value: 'no', cls: 'btn-ghost' }, { label: 'Yes, delete everywhere', value: 'yes', cls: 'btn-danger' }]
    });
    return r === 'yes';
  };
  syncApi.openCloud = () => { showView('settings'); setTimeout(() => { const c = document.getElementById('cloudCard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60); };
  syncApi.adoptRecovery = async (qa, password) => { await Store.setupQuestions(password, qa.questions, qa.answers, true); state.meta.hasRecovery = true; renderBanner(); };
  /** The Drive copy was locked with a different password (it was changed on another device). */
  syncApi.passwordMismatch = async (knownCurrent) => {
    const body = document.createElement('div');
    body.innerHTML = `<p style="margin-top:0">The cloud copy is locked with a different app password — it was set or changed on your other device. Enter that password and this device will use it too.</p>
      <label class="field"><span>App password used on your other device</span><input type="password" data-new></label>
      ${knownCurrent ? '' : '<label class="field"><span>This device’s current password</span><input type="password" data-cur></label>'}
      <p class="lock-error" data-err></p>`;
    const r = await U.modal({ title: 'Different app password in the cloud', body, buttons: [{ label: 'Later', value: null, cls: 'btn-ghost' }, { label: 'Update this device', cls: 'btn-primary', value: (b) => ({ nw: b.querySelector('[data-new]').value, cur: knownCurrent || b.querySelector('[data-cur]').value }) }] });
    if (!r || !r.nw) return null;
    if (!(await Store.changePassword(r.cur, r.nw))) { U.toast('This device’s current password was wrong.', 'err'); return null; }
    U.toast('Password updated on this device', 'ok');
    return r.nw;
  };
  function renderSyncSettings() { /* the Cloud sync card renders itself (js/cloud-sync.js) */ }
  function setupSyncSettings() { Sync.init(syncApi); }

  /* =========================================================
     ORDERS VIEW
     ========================================================= */
  const ORD_COLS = [
    { key: 'dateSold', label: 'Date Sold', type: 'date' },
    { key: 'name', label: 'Item Name', type: 'text', width: 220, render: (r) => `${esc(r.name)}${r.orderSize > 1 ? ` <span class="ord-b" title="Sold together in one order of ${r.orderSize} items">bundle ×${r.orderSize}</span>` : ''}${(r.refunds || []).length ? ' <span class="ord-b ref" title="Refund recorded">refund</span>' : ''}` },
    { key: 'sku', label: 'SKU', type: 'text', get: (r) => { const n = Number(r.sku); return r.sku !== '' && !isNaN(n) ? n : (r.sku || null); } },
    { key: 'category', label: 'Category', type: 'list', free: true, lower: true, list: allCats },
    { key: 'platform', label: 'Platform', type: 'list', free: true, lower: true, list: allPlatforms, render: (r) => platformTag(r.platform) },
    { key: 'sellingPrice', label: 'Sale Price', type: 'money', total: 'sum' },
    { key: 'fees', label: 'Fees', type: 'money', computed: true, total: 'sum', get: (r) => Calc.fees(r) },
    { key: 'totalAfterFees', label: 'Total After Fees', type: 'money', total: 'sum' },
    { key: 'purchasePrice', label: 'Cost', type: 'money', total: 'sum' },
    { key: 'shippingCost', label: 'Shipping', type: 'money', total: 'sum' },
    { key: 'profit', label: 'Profit', type: 'money', computed: true, total: 'sum', get: (r) => Calc.profit(r), render: (r) => { const p = Calc.profit(r); return `<span class="${p < 0 ? 'neg' : 'pos'}">${esc(U.money(p))}</span>`; } },
    { key: 'margin', label: 'Margin', type: 'pct', computed: true, get: (r) => Calc.margin(r) },
    { key: 'daysActive', label: 'Days to Sell', type: 'int', computed: true, total: 'avg', get: (r) => Calc.daysActive(r) }
  ];
  function ordFiltered() {
    const skuT = skuQuery($('#ordSearch').value);
    const q = skuT ? '' : textQuery($('#ordSearch').value), p = $('#ordPlatform').value, from = $('#ordFrom').value, to = $('#ordTo').value;
    return state.items.filter((it) => {
      if (!Calc.isSold(it)) return false;
      if (p && (it.platform || '').toLowerCase() !== p.toLowerCase()) return false;
      if ((from || to) && !U.inRange(it.dateSold, from, to)) return false;
      if (skuT && !skuT(it.sku)) return false;
      if (q && !q.split(/\s+/).every((w) => [it.name, it.sku, it.category, it.platform, it.notes].join(' ').toLowerCase().includes(w))) return false;
      return true;
    });
  }
  let ordGrid;
  function setupOrders() {
    ordGrid = createGrid({
      table: $('#ordTable'), columns: ORD_COLS, titleKey: 'name', phoneKeep: ['dateSold', 'sellingPrice', 'profit'], phoneCols: ['name', 'dateSold', 'platform', 'sellingPrice', 'totalAfterFees', 'profit', 'fees', 'daysActive'], rows: ordFiltered, find: findItem, photo: photoConfig, sticky: 'name',
      getSort: () => S().ordSort || [], setSort: (s) => { S().ordSort = s; saveSettings(); },
      rowClass: () => 'r-sold', footer: true, emptyText: 'No sales yet. Click “+ Record sale” or use the ✓ button on any inventory row.',
      onEdit: (r, key, v) => { updateItem(r, { [key]: v }, 'edit sale'); renderOrderKpis(); renderCounts(); },
      actions: [
        { icon: ICON.open, title: 'Details, packing slip & thank-you card', fn: (r) => openItemSheet(r) },
        { icon: ICON.edit, title: 'Edit all fields', fn: (r) => itemDialog(r) },
        { icon: ICON.refund, title: 'Refund or return', fn: (r) => window.Ext && Ext.refundDialog && Ext.refundDialog(r) },
        { icon: ICON.back, title: 'Return to inventory (undo sale)', fn: (r) => { commit('items', [{ id: r.id, after: { ...U.clone(r), status: 'available', dateSold: '', platform: '', buyer: null, invoice: null, totalAfterFees: null, listings: (r.listings || []).map((l) => (l.status === 'sold' ? { ...l, status: 'active', statusDate: U.todayISO() } : l)) } }], { label: 'return to inventory' }); renderAll(); U.toast('Returned to inventory', ''); } },
        { icon: ICON.del, title: 'Delete', cls: 'del', fn: (r) => deleteItems([r]) }
      ],
      afterRender: renderOrderKpis
    });
    const rr = () => ordGrid.render();
    $('#ordSearch').addEventListener('input', U.debounce(rr, 120));
    ['#ordPlatform', '#ordFrom', '#ordTo'].forEach((s) => $(s).addEventListener('change', rr));
    $('#ordClear').onclick = () => { ['#ordSearch', '#ordPlatform', '#ordFrom', '#ordTo'].forEach((s) => ($(s).value = '')); rr(); };
    $('#btnNewOrder').onclick = () => markSoldDialog([], { pick: true });
  }
  function renderOrderKpis() {
    const rows = ordFiltered();
    const sum = (f) => rows.reduce((a, r) => a + (+f(r) || 0), 0);
    const gross = sum((r) => r.sellingPrice), net = sum(Calc.net), profit = sum((r) => Calc.profit(r));
    const days = rows.map(Calc.daysActive).filter((d) => d !== null);
    $('#ordKpis').innerHTML = [
      kpi('Orders', U.int(rows.length), '', 'var(--ink-3)'),
      kpi('Gross sales', U.money0(gross), '', 'var(--sold)'),
      kpi('Fees', U.money0(gross - net), gross ? U.pct((gross - net) / gross) + ' of gross' : '', 'var(--aging)'),
      kpi('Profit', U.money0(profit), gross ? U.pct(profit / gross) + ' margin' : '', profit < 0 ? 'var(--danger)' : 'var(--gold-2)', profit < 0),
      kpi('Avg days to sell', days.length ? U.int(days.reduce((a, b) => a + b, 0) / days.length) : '—', '', 'var(--pending)')
    ].join('');
  }

  /* =========================================================
     EXPENSES VIEW
     ========================================================= */
  const EXP_COLS = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'category', label: 'Category', type: 'list', free: true, list: () => uniq([...S().expenseCategories, ...state.expenses.map((e) => e.category)]) },
    { key: 'vendor', label: 'Vendor', type: 'text' },
    { key: 'description', label: 'Description', type: 'text', width: 220 },
    { key: 'payment', label: 'Payment', type: 'list', free: true, list: () => uniq(['Card', 'Cash', 'PayPal', 'Bank transfer', 'Platform balance', ...state.expenses.map((e) => e.payment)]) },
    { key: 'amount', label: 'Amount', type: 'money', total: 'sum' },
    { key: 'notes', label: 'Notes', type: 'text', width: 160 }
  ];
  function expFiltered() {
    const q = $('#expSearch').value.trim().toLowerCase(), c = $('#expCatFilter').value, from = $('#expFrom').value, to = $('#expTo').value;
    return state.expenses.filter((e) => {
      if (c && e.category !== c) return false;
      if ((from || to) && !U.inRange(e.date, from, to)) return false;
      if (q && ![e.category, e.vendor, e.description, e.notes, e.payment].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }
  let expGrid;
  function setupExpenses() {
    expGrid = createGrid({
      table: $('#expTable'), columns: EXP_COLS, titleKey: 'description', phoneKeep: ['date', 'category', 'amount'], phoneCols: ['description', 'date', 'category', 'amount', 'vendor', 'payment'], rows: expFiltered, find: findExp, sticky: 'date',
      getSort: () => S().expSort || [], setSort: (s) => { S().expSort = s; saveSettings(); },
      footer: true, emptyText: 'No expenses recorded. Click “+ Add expense”.',
      onEdit: (r, key, v) => {
        commit('expenses', [{ id: r.id, after: { ...U.clone(r), [key]: v } }], { label: 'edit expense' });
        if (key === 'category' && v && !S().expenseCategories.includes(v)) { S().expenseCategories.push(v); saveSettings(); }
        renderExpByCat();
      },
      actions: [
        { icon: ICON.dup, title: 'Duplicate', fn: (r) => { const c = { ...U.clone(r), id: U.uid(), date: U.todayISO(), createdAt: Date.now() }; commit('expenses', [{ id: c.id, after: c }], { label: 'duplicate expense' }); renderExpenses(); } },
        { icon: ICON.del, title: 'Delete', cls: 'del', fn: (r) => { commit('expenses', [{ id: r.id, after: null }], { label: 'delete expense' }); renderExpenses(); U.toast('Expense deleted', ''); } }
      ],
      afterRender: renderExpByCat
    });
    const rr = () => expGrid.render();
    $('#expSearch').addEventListener('input', U.debounce(rr, 120));
    ['#expCatFilter', '#expFrom', '#expTo'].forEach((s) => $(s).addEventListener('change', rr));
    $('#btnAddExpense').onclick = expenseDialog;
  }
  async function expenseDialog() {
    const cats = uniq([...S().expenseCategories, ...state.expenses.map((e) => e.category)]);
    const body = document.createElement('div');
    body.innerHTML = `<div class="form-grid">
      <label class="field"><span>Date</span><input type="date" name="date" value="${U.todayISO()}"></label>
      <label class="field"><span>Amount *</span><input name="amount" inputmode="decimal" placeholder="0.00"></label>
      <label class="field"><span>Category</span><input name="category" list="dlExpCat" value="${esc(cats[0] || 'Other')}"></label>
      <label class="field"><span>Vendor</span><input name="vendor"></label>
      <label class="field span-2"><span>Description</span><input name="description" placeholder="e.g. 100 poly mailers"></label>
      <label class="field"><span>Payment</span><input name="payment" list="dlPay"></label>
      <label class="field"><span>Notes</span><input name="notes"></label>
    </div>${dl('dlExpCat', cats)}${dl('dlPay', ['Card', 'Cash', 'PayPal', 'Bank transfer', 'Platform balance'])}`;
    const f = (n) => body.querySelector(`[name="${n}"]`).value;
    const ok = await U.modal({ title: 'Add expense', body, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'Add expense', cls: 'btn-primary', validate: (b) => { const a = b.querySelector('[name=amount]'); if (U.num(a.value) === null) { a.focus(); return false; } return true; } }] });
    if (!ok) return;
    const e = normalizeExpense({ date: f('date'), amount: U.round2(U.num(f('amount'))), category: f('category').trim() || 'Other', vendor: f('vendor').trim(), description: f('description').trim(), payment: f('payment').trim(), notes: f('notes').trim() });
    commit('expenses', [{ id: e.id, after: e }], { label: 'add expense' });
    if (!S().expenseCategories.includes(e.category)) { S().expenseCategories.push(e.category); saveSettings(); }
    renderExpenses();
    U.toast('Expense added', 'ok');
  }
  function renderExpByCat() {
    const by = {};
    expFiltered().forEach((e) => { by[e.category || 'Other'] = (by[e.category || 'Other'] || 0) + (+e.amount || 0); });
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    Charts.hbars($('#expByCat'), Object.entries(by).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value, sub: total ? U.pct(value / total) : '', color: 'var(--stale)' })), U.money0);
  }
  function renderExpenses() {
    const sel = $('#expCatFilter'), cur = sel.value;
    sel.innerHTML = '<option value="">All categories</option>' + uniq([...S().expenseCategories, ...state.expenses.map((e) => e.category)]).map((c) => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
    expGrid.render();
  }

  /* =========================================================
     DASHBOARD
     ========================================================= */
  function kpi(label, value, sub, accent, neg, x = {}) {
    return `<div class="kpi" style="--accent:${accent}"><div class="kpi-top"><div class="kpi-label">${esc(label)}</div>${x.delta || ''}</div><div class="kpi-value ${neg ? 'neg' : ''}" ${x.count !== undefined ? `data-count="${x.count}" data-fmt="${x.fmt || 'money'}"` : ''}>${value}</div><div class="kpi-sub">${sub || '&nbsp;'}</div>${x.spark || ''}</div>`;
  }
  let dashAnimated = false;
  function renderDashboard() {
    renderGoals();
    const r = U.rangePreset($('#dashRange').value);
    $('#dashRangeLabel').textContent = r.label + (r.from ? ` · ${U.fmtDate(r.from)} – ${U.fmtDate(r.to)}` : '');
    const m = Calc.metrics(state.items, state.expenses, S(), r.from, r.to, state.mileage);
    const stock = state.items.filter((i) => Calc.isAsset(i, ''));
    const stale = stock.filter((i) => Calc.ageClass(i, S()) === 'stale');
    // compare with the period before (same length); "all time" compares the last 30 days with the 30 before
    const today = U.todayISO(), shift = (iso, d) => { const x = U.parseISO(iso); x.setDate(x.getDate() + d); return U.toISO(x); };
    let cur = m, prevM, cmpLabel;
    if (r.from) {
      const len = U.daysBetween(r.from, r.to || today) + 1;
      prevM = Calc.metrics(state.items, state.expenses, S(), shift(r.from, -len), shift(r.from, -1), state.mileage);
      cmpLabel = `vs the ${len} days before`;
    } else {
      cur = Calc.metrics(state.items, state.expenses, S(), shift(today, -29), today, state.mileage);
      prevM = Calc.metrics(state.items, state.expenses, S(), shift(today, -59), shift(today, -30), state.mileage);
      cmpLabel = 'last 30 days vs the 30 before';
    }
    const twelve = Calc.monthly(state.items, state.expenses, U.toISO(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1)), today);
    const sp = (k, c) => Dash.spark(twelve.map((x) => x[k]), c);
    const dl = (k) => Dash.delta(cur[k], prevM[k], cmpLabel);
    $('#kpis').innerHTML = [
      kpi('Gross sales', U.money0(m.gross), `${m.soldCount} item${m.soldCount === 1 ? '' : 's'} sold`, 'var(--sold)', false, { delta: dl('gross'), spark: sp('gross', 'var(--sold)'), count: m.gross }),
      kpi('Net after fees', U.money0(m.net), `${U.money0(m.fees)} in fees`, 'var(--ink-3)', false, { delta: dl('net'), spark: sp('net', 'var(--ink-3)'), count: m.net }),
      kpi('Net profit', U.money0(m.netProfit), `After ${U.money0(m.cogs + m.shipping)} COGS/shipping & ${U.money0(m.expenseTotal)} expenses`, m.netProfit < 0 ? 'var(--danger)' : 'var(--gold-2)', m.netProfit < 0, { delta: dl('netProfit'), spark: sp('profit', 'var(--gold-2)'), count: m.netProfit }),
      kpi('Est. taxes', U.money0(m.totalTax), `${U.money0(m.afterTax)} after tax`, 'var(--pending)', false, { count: m.totalTax }),
      kpi('Inventory at cost', U.money0(m.invCost), `${m.assets.length} items in stock (asset)`, 'var(--fresh)', false, { count: m.invCost }),
      kpi('Inventory at list', U.money0(m.invRetail), `${U.money0(m.invPotential)} potential profit`, 'var(--ink)', false, { count: m.invRetail }),
      kpi('Sell-through', U.pct(m.sellThrough), m.avgDaysToSell === null ? '' : `${U.int(m.avgDaysToSell)} avg days to sell`, 'var(--aging)', false, { delta: dl('soldCount'), spark: sp('count', 'var(--aging)') }),
      kpi('Stale items', U.int(stale.length), `${S().staleDays}+ days · ${U.money0(stale.reduce((a, i) => a + (i.purchasePrice || 0), 0))} at cost`, 'var(--stale)', false, { count: stale.length, fmt: 'int' })
    ].join('');
    if (!dashAnimated) { dashAnimated = true; Dash.countUp($('#kpis')); }

    const mon = Calc.monthly(state.items, state.expenses, r.from, r.to);
    $('#chartRangeLabel').textContent = mon.length ? `${mon[0].label} – ${mon[mon.length - 1].label}` : '';
    Charts.combo($('#chartMonthly'), mon.map((x) => ({ label: x.label, bar: x.gross, line: x.profit })), { barLabel: 'Gross sales', lineLabel: 'Net profit', fmt: U.money0 });

    const byP = {};
    m.sold.forEach((i) => { const p = i.platform || 'unspecified'; byP[p] ||= { g: 0, n: 0 }; byP[p].g += i.sellingPrice || 0; byP[p].n++; });
    $('#platformDonut').innerHTML = Dash.donut(Object.entries(byP).sort((a, b) => b[1].g - a[1].g).map(([name, v]) => ({ name: platformLabel(name) || 'Unspecified', value: v.g, sub: ` · ${v.n} sold`, color: platformColor(name) || '#8a938f' })), U.money0);

    // sales calendar (always the last 12 months)
    const daily = {};
    state.items.forEach((i) => { if (Calc.isSold(i) && i.dateSold) { const d = (daily[i.dateSold] ||= { g: 0, n: 0 }); d.g += i.sellingPrice || 0; d.n++; } });
    const cal = Dash.calendar(daily, U.money0);
    $('#salesCal').innerHTML = cal.svg;
    $('#calSum').textContent = cal.days ? `${cal.days} selling day${cal.days === 1 ? '' : 's'} · ${U.money0(cal.total)} in the last 12 months${cal.best ? ` · best day ${U.fmtDate(cal.best.iso)} (${U.money0(cal.best.g)})` : ''}` : 'No sales in the last 12 months yet';
    requestAnimationFrame(() => { const sc = $('#salesCal'); if (sc) sc.scrollLeft = sc.scrollWidth; });

    // best sellers with photos
    const best = [...m.sold].map((i) => ({ i, p: Calc.profit(i) })).filter((x) => x.p !== null).sort((a, b) => b.p - a.p).slice(0, 12);
    $('#bestStrip').innerHTML = best.length ? best.map(({ i, p }, n) => { const th = state.thumbs[i.id]; const d = Calc.daysActive(i); return `<button type="button" class="best" data-sheet="${esc(i.id)}" style="--d:${n * 40}ms">
        <span class="best-ph">${th ? `<img src="${th.thumb}" alt="">` : '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-2h6l2 2h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>'}<span class="best-rank">${n + 1}</span></span>
        <span class="best-name">${esc(i.name)}</span>
        <span class="best-meta"><b class="${p < 0 ? 'neg' : 'pos'}">${p >= 0 ? '+' : ''}${U.money0(p)}</b> profit</span>
        <span class="best-meta">${U.money0(i.sellingPrice)} · ${esc(platformLabel(i.platform) || '—')}${d !== null ? ` · ${d} d` : ''}</span></button>`; }).join('') : Dash.empty('No sales in this period yet', 'Your most profitable sales will show up here, with their photos.', 'tag');

    const buckets = [
      { l: '0–30 d', min: 0, max: 30 }, { l: '31–60 d', min: 31, max: 60 }, { l: '61–90 d', min: 61, max: 90 },
      { l: '91–180 d', min: 91, max: 180 }, { l: '181–365 d', min: 181, max: 365 }, { l: '1 yr +', min: 366, max: Infinity }
    ];
    const avail = state.items.filter((i) => (i.status || '').toLowerCase() === 'available');
    buckets.forEach((b) => { b.n = avail.filter((i) => { const d = Calc.daysActive(i); return d !== null && d >= b.min && d <= b.max; }).length; });
    const bmax = Math.max(1, ...buckets.map((b) => b.n));
    const colorFor = (b) => b.min >= S().staleDays ? 'var(--stale)' : b.min >= S().agingDays ? 'var(--aging)' : 'var(--ink-3)';
    $('#agingBars').innerHTML = buckets.map((b) => `<div class="aging-col"><span class="aging-n">${b.n}</span><div class="aging-bar" style="height:${(b.n / bmax * 140).toFixed(0)}px;background:${colorFor(b)}"></div><span class="aging-l">${b.l}</span></div>`).join('');

    const staleSorted = [...stale].sort((a, b) => (Calc.daysActive(b) || 0) - (Calc.daysActive(a) || 0)).slice(0, 7);
    const mini = (i) => { const th = state.thumbs[i.id]; return `<span class="mini-ph">${th ? `<img src="${th.thumb}" alt="">` : ''}</span>`; };
    $('#staleList').innerHTML = staleSorted.length ? staleSorted.map((i) => `<div class="mini-row" data-sheet="${esc(i.id)}">${mini(i)}<div class="mini-main"><div class="mini-name">${esc(i.name)}</div><div class="mini-meta">${esc(i.category || '')} · SKU ${esc(i.sku || '—')} · listed ${U.fmtDate(i.datePosted)}</div></div><div class="mini-right"><span class="age age-stale">${U.int(Calc.daysActive(i))} d</span><div class="mini-meta">${U.money(i.sellingPrice)}</div></div></div>`).join('') : Dash.empty('Nothing stale — nice work!', 'Items listed longer than your stale limit show up here.', 'spark');

    const byC = {};
    state.items.forEach((i) => { const c = i.category || 'uncategorized'; byC[c] ||= { stock: 0, cost: 0, list: 0, sold: 0, profit: 0 }; if (Calc.isSold(i)) { byC[c].sold++; byC[c].profit += Calc.profit(i) || 0; } else if (Calc.isAsset(i, '')) { byC[c].stock++; byC[c].cost += i.purchasePrice || 0; byC[c].list += i.sellingPrice || 0; } });
    const cr = Object.entries(byC).sort((a, b) => b[1].list - a[1].list);
    $('#categoryTable').innerHTML = cr.length ? `<table class="pl"><tr class="hdr"><td>Category</td><td style="text-align:right">In stock</td><td style="text-align:right">Cost</td><td style="text-align:right">List value</td><td style="text-align:right">Sold</td><td>Profit</td></tr>${cr.map(([c, v]) => `<tr><td style="text-transform:capitalize">${esc(c)}</td><td style="text-align:right">${v.stock}</td><td style="text-align:right">${U.money0(v.cost)}</td><td style="text-align:right">${U.money0(v.list)}</td><td style="text-align:right">${v.sold}</td><td class="${v.profit < 0 ? 'neg' : ''}">${U.money0(v.profit)}</td></tr>`).join('')}</table>` : '<div class="empty">No items yet</div>';

    const recent = state.items.filter(Calc.isSold).sort((a, b) => (b.dateSold || '').localeCompare(a.dateSold || '')).slice(0, 7);
    $('#recentSales').innerHTML = recent.length ? recent.map((i) => { const p = Calc.profit(i); return `<div class="mini-row" data-sheet="${esc(i.id)}">${mini(i)}<div class="mini-main"><div class="mini-name">${esc(i.name)}</div><div class="mini-meta">${U.fmtDate(i.dateSold)} · ${esc(i.platform || '—')}</div></div><div class="mini-right">${U.money(i.sellingPrice)}<div class="mini-meta ${p < 0 ? 'neg' : 'pos'}">${p === null ? '' : (p >= 0 ? '+' : '') + U.money(p)}</div></div></div>`; }).join('') : Dash.empty('No sales yet', 'Mark an item sold and it appears here.', 'tag');
    if (typeof renderActivityFeed === 'function') renderActivityFeed();
    if (window.Ext && Ext.afterDashboard) Ext.afterDashboard();
  }

  /* =========================================================
     REPORTS
     ========================================================= */
  function reportRange() {
    const preset = $('#repPreset').value;
    if (preset) { const r = U.rangePreset(preset); return r; }
    const from = $('#repFrom').value, to = $('#repTo').value;
    return { from, to, label: from || to ? 'Custom period' : 'All time' };
  }
  function renderReport() {
    const r = reportRange();
    if ($('#repPreset').value) { $('#repFrom').value = r.from; $('#repTo').value = r.to; }
    const m = Calc.metrics(state.items, state.expenses, S(), r.from, r.to, state.mileage);
    const row = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="${v < 0 ? 'neg' : ''}">${U.money(v)}</td></tr>`;
    const exps = Object.entries(m.expByCat).sort((a, b) => b[1] - a[1]);
    $('#reportBody').innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Profit &amp; Loss</h3><span class="muted small">${esc(r.label)}${r.from || r.to ? ` · ${U.fmtDate(r.from) || 'start'} – ${U.fmtDate(r.to) || 'today'}` : ''}</span></div>
        <table class="pl">
          <tr class="hdr"><td>Revenue</td><td></td></tr>
          ${row('Gross sales <span class="muted small">(' + m.soldCount + ' items)</span>', m.gross, 'strong')}
          ${row('Less: platform fees &amp; adjustments', -m.fees, 'sub')}
          ${row('Net sales (total after fees)', m.net, 'strong')}
          <tr class="hdr"><td>Cost of sales</td><td></td></tr>
          ${row('Cost of goods sold (purchase price)', -m.cogs, 'sub')}
          ${row('Shipping costs', -m.shipping, 'sub')}
          ${m.refunds ? row('Refunds &amp; return shipping', -m.refunds, 'sub') : ''}
          ${row('Gross profit', m.grossProfit, 'strong')}
          <tr class="hdr"><td>Operating expenses</td><td></td></tr>
          ${exps.length ? exps.map(([c, v]) => row(esc(c), -v, 'sub')).join('') : row('No expenses recorded', 0, 'sub')}
          ${m.mileageDeduction ? row(`Mileage (${U.int(m.miles)} mi at the IRS standard rate)`, -m.mileageDeduction, 'sub') : ''}
          ${m.writeOffs ? row(`Inventory written off (${m.writtenOff.length} donated/lost, at cost)`, -m.writeOffs, 'sub') : ''}
          ${row('Net profit before tax', m.netProfit, 'total')}
        </table>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-head"><h3>Estimated taxes</h3></div>
          <table class="pl">
            ${row('Taxable profit', m.taxable)}
            ${row(`Self-employment tax (${S().seTaxRate}% × 92.35%)`, m.seTax, 'sub')}
            ${row(`Income tax (${S().incomeTaxRate}%)`, m.incomeTax, 'sub')}
            ${row('Total estimated income taxes', m.totalTax, 'strong')}
            ${row('Net profit after tax', m.afterTax, 'total')}
            ${S().salesTaxRate ? row(`Sales tax collected (${S().salesTaxRate}%) — pass-through`, m.salesTax, 'sub') : ''}
          </table>
          <p class="note">Estimates use the rates in Settings and are for planning only, not tax advice.</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>Assets</h3><span class="muted small">as of ${U.fmtDate(m.asOf)}</span></div>
          <table class="pl">
            <tr><td>Unsold items on hand</td><td>${U.int(m.assets.length)}</td></tr>
            ${row('Inventory at cost', m.invCost, 'strong')}
            ${row('Inventory at list value', m.invRetail)}
            ${row('Potential gross profit on hand', m.invPotential, 'sub')}
            <tr><td>Average days listed</td><td>${m.avgAge === null ? '—' : U.int(m.avgAge)}</td></tr>
            <tr class="hdr"><td>Key metrics</td><td></td></tr>
            <tr><td>Average sale</td><td>${U.money0(m.avgSale)}</td></tr>
            <tr><td>Gross margin</td><td>${U.pct(m.margin)}</td></tr>
            <tr><td>Sell-through rate</td><td>${U.pct(m.sellThrough)}</td></tr>
            <tr><td>Inventory purchased in period</td><td>${U.money0(m.purchaseTotal)}</td></tr>
          </table>
          <p class="note">The Excel export includes sheets for Summary, Sales, Itemized Costs, Assets, Taxes (monthly), Expenses and the Full Inventory — with live formulas and your logo.</p>
        </div>
      </div>` + reportExtrasHTML();
  }
  async function exportExcel() {
    const release = holdLock('an Excel report');
    try { return await exportExcelInner(); } finally { release(); }
  }
  async function exportExcelInner() {
    const viewIsReports = $('#view-reports').classList.contains('active');
    const r = viewIsReports ? reportRange() : U.rangePreset('all');
    try {
      U.toast('Building Excel report…');
      const blob = await Reports.exportWorkbook({ items: state.items, expenses: state.expenses, settings: S(), logo: state.logo, photos: S().excelPhotos ? state.thumbs : null, platforms: profiles().map((p) => ({ ...p, ruleText: feeSummary(p) })), mileage: state.mileage, from: r.from, to: r.to, label: r.label });
      U.download(blob, `${U.slug(S().companyName || 'Thriftaholics')}-financial-report-${U.stamp()}.xlsx`);
      U.toast('Excel report downloaded', 'ok');
    } catch (e) { console.error(e); U.toast('Excel export failed: ' + e.message, 'err'); }
  }

  /* =========================================================
     IMPORT / EXPORT
     ========================================================= */
  /* Backups can take a while with many photos: the Backup buttons spin and lock, and a status card
     says what's happening, so nobody clicks again and again.
     Backups are written one record per line (header, core data, then one line per photo) so they
     work at any size — a single giant JSON string fails in browsers past ~500 MB. */
  let backupBusy = false;
  function busyCard(title, text) {
    let card = document.getElementById('backupBusy');
    if (title === null) { if (card) card.remove(); return; }
    if (!card) { card = document.createElement('div'); card.id = 'backupBusy'; card.className = 'bk-busy'; card.setAttribute('role', 'status'); card.innerHTML = '<span class="spin big" aria-hidden="true"></span><div><b data-bkt></b><small data-bk></small></div>'; document.body.appendChild(card); }
    card.querySelector('[data-bkt]').textContent = title; card.querySelector('[data-bk]').textContent = text || '';
  }
  function backupUI(on, text) {
    const btns = ['#btnExportJson', '#btnExportJson2'].map((sel) => $(sel)).filter(Boolean);
    btns.forEach((b) => {
      if (on) { if (!b.dataset.label) b.dataset.label = b.innerHTML; b.classList.add('is-busy'); b.disabled = true; b.setAttribute('aria-busy', 'true'); b.innerHTML = '<span class="spin" aria-hidden="true"></span>Backing up…'; }
      else { b.classList.remove('is-busy'); b.disabled = false; b.removeAttribute('aria-busy'); if (b.dataset.label) { b.innerHTML = b.dataset.label; delete b.dataset.label; } }
    });
    busyCard(on ? 'Building your backup…' : null, text);
  }
  const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  async function exportJSON() {
    if (backupBusy) { U.toast('The backup is already being built — hang on a moment'); return; }
    let pw = null;
    if (S().encryptBackup) {
      pw = await U.prompt('Encrypt backup', 'Password for this backup file (you will need it to restore)', { type: 'password', okLabel: 'Encrypt & download' });
      if (!pw) return;
    }
    backupBusy = true; const release = holdLock('a backup');
    try {
      backupUI(true, 'Getting ready… please don’t close the app.'); await nextPaint();
      const kk = pw ? await Store.backupLineKey(pw) : null;
      const seal = async (obj) => JSON.stringify(kk ? { e: await Store.encLine(kk.key, obj) } : obj) + '\n';
      const parts = []; const total = Object.keys(state.thumbs).length;
      const head = { format: 'inventory-ledger-backup', version: 3, layout: 'lines', app: 'Inventory & Sales Ledger', exportedAt: new Date().toISOString(),
        counts: { items: state.items.length, expenses: state.expenses.length, photos: total }, encrypted: !!kk, ...(kk ? { kdf: 'PBKDF2-SHA256', iterations: kk.iterations, salt: kk.salt } : {}) };
      parts.push(JSON.stringify(head) + '\n');
      parts.push(await seal({ t: 'core', data: { items: state.items, expenses: state.expenses, mileage: state.mileage, settings: state.settings, logo: state.logo } }));
      let n = 0, last = 0;
      await Store.eachPhoto(async (id, ph) => {
        parts.push(await seal({ t: 'photo', id, p: ph })); n++;
        if (Date.now() - last > 400) { last = Date.now(); backupUI(true, `Adding photos… ${n} of ${total}`); await nextPaint(); }
      });
      parts.push(JSON.stringify({ t: 'end', photos: n }) + '\n');
      backupUI(true, 'Saving the file…'); await nextPaint();
      const blob = new Blob(parts, { type: 'application/json' }); parts.length = 0;
      U.download(blob, `${U.slug(S().companyName || 'Thriftaholics')}-backup-${U.stamp()}${pw ? '-encrypted' : ''}.json`);
      state.meta.lastBackup = new Date().toISOString();
      persist(() => Store.putVault('lastBackup', state.meta.lastBackup));
      renderSettings(); renderBanner();
      U.toast(`Backup downloaded (${n} photos, ${Math.round(blob.size / 1048576)} MB)` + (pw ? ' — encrypted' : ' — store it somewhere private'), 'ok');
    } catch (e) {
      console.error(e); U.toast('Backup failed: ' + (e && e.message || e), 'err');
    } finally {
      backupBusy = false; backupUI(false); release();
    }
  }
  /** Read a line-by-line backup (version 3) in chunks; returns { format, data } like an ordinary backup, or null if cancelled. */
  async function readLineBackup(file) {
    const CHUNK = 8 * 1048576; const dec = new TextDecoder();
    let pos = 0, carry = '', head = null, key = null, core = null, ended = false; const photos = {}; let n = 0, last = 0;
    const handle = async (line) => {
      if (!line.trim()) return;
      let rec = JSON.parse(line);
      if (!head) {
        head = rec;
        if (head.encrypted) {
          busyCard(null);
          const pw = await U.prompt('Encrypted backup', 'Enter the password used for this backup', { type: 'password', okLabel: 'Decrypt' });
          if (!pw) throw Object.assign(new Error('cancelled'), { cancelled: true });
          key = (await Store.backupLineKey(pw, head.salt, head.iterations)).key;
          busyCard('Reading the backup…', 'Checking the password…');
        }
        return;
      }
      if (rec.e) { try { rec = await Store.decLine(key, rec.e); } catch (_) { throw Object.assign(new Error('Wrong password for that backup.'), { friendly: true }); } }
      if (rec.t === 'core') core = rec.data;
      else if (rec.t === 'photo' && rec.id && rec.p) { photos[rec.id] = rec.p; n++; }
      else if (rec.t === 'end') ended = true;
    };
    busyCard('Reading the backup…', 'Opening the file…'); await nextPaint();
    try {
      while (pos < file.size) {
        const buf = await file.slice(pos, pos + CHUNK).arrayBuffer(); pos += CHUNK;
        const text = carry + dec.decode(buf, { stream: pos < file.size });
        const lines = text.split('\n'); carry = lines.pop();
        for (const ln of lines) await handle(ln);
        if (Date.now() - last > 400) { last = Date.now(); busyCard('Reading the backup…', `${Math.min(100, Math.round(100 * pos / file.size))}% · ${n} photos`); await nextPaint(); }
      }
      if (carry) await handle(carry);
    } catch (e) {
      busyCard(null);
      if (e.cancelled) return null;
      throw e;
    }
    busyCard(null);
    if (!core) throw new Error('This backup file is incomplete.');
    if (!ended) U.toast('This backup looks cut off at the end — some photos may be missing.', 'err');
    return { format: 'inventory-ledger-backup', data: { ...core, photos } };
  }
  /* A listing-update file only adds listing links and per-site prices to existing items — nothing else
     about the items changes, so edits made since (SKUs, names, notes…) are safe. It saves like a normal
     edit, so it syncs to the other phone and can be undone. Entry: { id, listings: [{platform, url, status, price, statusDate}] } */
  async function applyListingPatch(patch, note) {
    const changes = []; const perPlat = {}; let missing = 0, linksAdded = 0, pricesSet = 0, already = 0;
    for (const p of patch) {
      const cur = p && findItem(p.id); if (!cur) { missing++; continue; }
      const it = U.clone(cur); it.listings = Array.isArray(it.listings) ? it.listings : [];
      let touched = false;
      for (const l of p.listings || []) {
        if (!l || !l.platform || !l.url) continue;
        const url = String(l.url).trim(); const price = l.price == null || l.price === '' ? null : +l.price;
        const sitePrice = price != null && Math.abs(price - (+it.sellingPrice || 0)) > 0.009 ? price : null;
        const same = it.listings.find((x) => x.url && x.url.replace(/\/$/, '') === url.replace(/\/$/, ''));
        if (same) {
          if ((same.price ?? null) !== sitePrice) { same.price = sitePrice; pricesSet++; touched = true; } else already++;
          continue;
        }
        const blank = it.listings.find((x) => x.platform === l.platform && !x.url);
        if (blank) { blank.url = url; if (sitePrice != null) blank.price = sitePrice; linksAdded++; touched = true; }
        else { it.listings.push({ platform: l.platform, url, status: l.status || 'active', statusDate: l.statusDate || U.todayISO(), price: sitePrice }); linksAdded++; touched = true; }
        perPlat[l.platform] = (perPlat[l.platform] || 0) + 1;
      }
      if (touched) changes.push({ id: it.id, after: it });
    }
    const sites = Object.entries(perPlat).map(([k, n]) => `${n} ${esc(platformLabel(k))}`).join(', ');
    if (!changes.length) { U.toast(`Nothing to update — ${already ? 'all those links are already there' : 'no matching items found'}.`); return; }
    const ok = await U.confirm('Add listing links',
      `${note ? `${esc(note)}<br><br>` : ''}This adds <b>${linksAdded}</b> listing links${sites ? ` (${sites})` : ''}${pricesSet ? ` and updates <b>${pricesSet}</b> site prices` : ''} on <b>${changes.length}</b> items.<br><br>Nothing else about the items changes.${missing ? ` ${missing} items in the file aren’t in this inventory and will be skipped.` : ''}`,
      'Add links');
    if (!ok) return;
    commit('items', changes, { label: 'add listing links' });
    renderAll();
    U.toast(`Added ${linksAdded} listing links to ${changes.length} items`, 'ok');
  }
  async function importJSON(file) {
    const release = holdLock('a restore');
    try { return await importJSONInner(file); } finally { release(); }
  }
  async function importJSONInner(file) {
    let obj;
    const peek = await file.slice(0, 400).text().catch(() => '');
    if (/^\{"format":"inventory-ledger-backup","version":3/.test(peek)) {
      try { obj = await readLineBackup(file); } catch (e) { console.error(e); U.toast(e.friendly ? e.message : 'Could not read that backup: ' + e.message, 'err'); return; }
      if (!obj) return;
    } else {
      try { obj = JSON.parse(await U.readFile(file)); } catch (e) { U.toast(/string length|memory/i.test(String(e && e.message)) ? 'That file is too large to open as a single JSON file.' : 'That file is not valid JSON.', 'err'); return; }
    }
    try {
      if (obj && obj.encrypted) {
        const pw = await U.prompt('Encrypted backup', 'Enter the password used for this backup', { type: 'password', okLabel: 'Decrypt' });
        if (!pw) return;
        try { obj = await Store.decryptBackup(obj, pw); } catch (_) { U.toast('Wrong password for that backup.', 'err'); return; }
      }
      if (!(obj && obj.format === 'inventory-ledger-backup')) {
        // a file from another program (or a hand-made list): open the field-mapping importer
        await LegacyImport.run(obj, file.name, importCtx);
        return;
      }
      let data;
      if (Array.isArray(obj)) data = { items: obj };
      else if (obj.data) data = obj.data;
      else if (obj.items) data = obj;
      else throw new Error('Unrecognized backup format');
      if (Array.isArray(data.listingPatch)) { await applyListingPatch(data.listingPatch, data.note); return; }
      const items = (data.items || []).map(normalizeItem);
      const expenses = (data.expenses || []).map(normalizeExpense);
      const choice = await U.modal({
        title: 'Restore backup',
        body: `<p>This backup contains <b>${items.length}</b> items, <b>${expenses.length}</b> expenses${data.photos ? `, <b>${Object.keys(data.photos).length}</b> photos` : ''}${data.photoLinks ? `, <b>${Object.keys(data.photoLinks).length}</b> photo links (downloaded after the restore)` : ''}${data.settings ? ', settings' : ''}${data.logo ? ' and a logo' : ''}.</p>
               <p><b>Replace</b> erases current data on this device and restores the backup exactly.<br><b>Merge</b> keeps current data, adding new records and updating ones with matching IDs.</p>`,
        buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'Merge', value: 'merge' }, { label: 'Replace all', value: 'replace', cls: 'btn-danger' }]
      });
      if (!choice) return;
      await takeSnapshot(`Before restoring ${file.name} (${choice})`);
      const trips = (data.mileage || []).map(normalizeTrip);
      if (choice === 'replace') {
        const prev = { items: state.items, expenses: state.expenses, mileage: state.mileage };
        state.items = items; state.expenses = expenses; state.mileage = trips;
        if (data.settings) { state.settings = { ...U.clone(DEFAULT_SETTINGS), ...data.settings, sync: S().sync }; delete state.settings._ts; settingsBase = {}; }
        if (data.logo !== undefined) state.logo = data.logo || null;
        markReplaced(prev);
      } else {
        const mergeInto = (list, incoming) => { const map = new Map(list.map((x) => [x.id, x])); incoming.forEach((x) => map.set(x.id, x)); return [...map.values()]; };
        state.items = mergeInto(state.items, items); state.expenses = mergeInto(state.expenses, expenses); state.mileage = mergeInto(state.mileage, trips);
        // a restore file may also list items to remove (e.g. ones it added by mistake earlier); they're tombstoned so sync removes them everywhere
        if (Array.isArray(data.itemDelete) && data.itemDelete.length) {
          const del = new Set(data.itemDelete.filter((id) => typeof id === 'string'));
          const gone = state.items.filter((r) => del.has(r.id));
          if (gone.length) {
            const t = (state.meta.tombstones ||= {}); t.items = { ...(t.items || {}) }; const now = Date.now();
            gone.forEach((r) => { t.items[r.id] = now; }); Store.putVault('tombstones', t).catch(() => {});
            state.items = state.items.filter((r) => !del.has(r.id));
            data.photoDelete = [...(data.photoDelete || []), ...gone.flatMap((r) => [r.id, ...(r.photos || [])])];
          }
        }
        if (data.logo && !state.logo) state.logo = data.logo;
      }
      state.undo = []; state.redo = []; updateUndoUI(); state.selection.clear();
      await persist(async () => {
        await Store.replaceAll({ items: state.items, expenses: state.expenses, settings: state.settings, logo: state.logo, meta: { ...state.meta, mileage: state.mileage, activity: state.activity }, photos: choice === 'replace' ? (data.photos || null) : null });
        if (choice === 'merge' && data.photos) for (const [pid, ph] of Object.entries(data.photos)) if (ph && ph.thumb) await Store.putPhoto(pid, { ...ph, full: ph.full || ph.thumb });
        // a restore file may name photos to remove first (e.g. to replace pictures that were added by mistake)
        if (choice === 'merge' && Array.isArray(data.photoDelete) && data.photoDelete.length) await Store.deletePhotos(data.photoDelete.filter((k) => typeof k === 'string' && k));
        state.thumbs = (await Store.loadAll()).thumbs;
      });
      S().listingsMigrated = false; S().soldListingsFixed = false;
      const moved = migrateListings();
      applySettingsToUI(); renderAll();
      addActivity([{ id: U.uid(), t: Date.now(), who: myName(), kind: 'items', n: items.length, label: choice === 'replace' ? 'restored a backup (replace all)' : 'restored a backup (merge)' }]);
      U.toast(`Restored ${items.length} items and ${expenses.length} expenses (${choice})`, 'ok');
      if (window.Sync) Sync.changed();
      if (data.photoLinks && window.Ext && Ext.fetchPhotoLinks) Ext.fetchPhotoLinks(data.photoLinks, data.photoOpts || {});
    } catch (e) { console.error(e); U.toast('Import failed: ' + e.message, 'err'); }
  }
  /** Used by the importer for other programs' JSON (js/importer.js). */
  const importCtx = {
    settings: () => S(),
    saveSettings: () => saveSettings(),
    async apply(kind, records, mode) {
      await takeSnapshot(`Before importing from another program (${mode})`);
      const res = { added: 0, updated: 0, skipped: 0, photos: 0 };
      const list = kind === 'items' ? state.items : state.expenses;
      const byId = new Map(list.map((x) => [x.id, x]));
      const changes = [];
      const incoming = new Set(records.map((r) => r.id));
      let sku = parseInt(nextSku(), 10);
      const photoJobs = [];
      records.forEach(({ id, rec, photo }) => {
        const existing = byId.get(id);
        if (existing && mode === 'new') { res.skipped++; return; }
        let after;
        if (kind === 'items') {
          after = normalizeItem({ ...(existing || {}), ...rec, id, createdAt: existing ? existing.createdAt : Date.now() });
          if (!after.sku) after.sku = existing && existing.sku ? existing.sku : String(sku++);
          addListValue('categories', after.category); addListValue('platforms', after.platform);
        } else {
          after = normalizeExpense({ ...(existing || {}), ...rec, id });
          if (after.category && !S().expenseCategories.includes(after.category)) S().expenseCategories.push(after.category);
        }
        changes.push({ id, after });
        existing ? res.updated++ : res.added++;
        if (photo && kind === 'items') photoJobs.push({ id, photo });
      });
      if (mode === 'replace' && kind === 'items') state.items.forEach((it) => { if (!incoming.has(it.id)) changes.push({ id: it.id, after: null }); });
      commit(kind, changes, { label: 'import' });
      for (const job of photoJobs) {
        try {
          const blob = await (await fetch(job.photo)).blob();
          const ph = await U.processImage(new File([blob], 'photo', { type: blob.type || 'image/jpeg' }));
          await Store.putPhoto(job.id, ph);
          state.thumbs[job.id] = { thumb: ph.thumb, w: ph.w, h: ph.h };
          res.photos++; if (window.Sync) Sync.changed();
        } catch (_) { /* unreadable image data — skip */ }
      }
      saveSettings();
      renderAll();
      return res;
    }
  };

  /* ---------- matching imported rows to existing items (keeps IDs, so photos & links stay attached) ---------- */
  const splitPlatforms = (v) => String(v || '').split(/\s*[,;\/|\n]\s*|\s+&\s+|\s+and\s+/i).map((x) => x.trim().toLowerCase()).filter(Boolean);
  function makeMatcher(items) {
    const bySku = new Map(), byNameDate = new Map(), byName = new Map();
    items.forEach((it) => {
      if (it.sku) { const k = String(it.sku).trim().toLowerCase(); (bySku.get(k) || bySku.set(k, []).get(k)).push(it); }
      const n = (it.name || '').trim().toLowerCase();
      byNameDate.set(n + '|' + (it.datePosted || ''), it);
      (byName.get(n) || byName.set(n, []).get(n)).push(it);
    });
    const used = new Set();
    return (r) => {
      const n = (r.name || '').trim().toLowerCase();
      let hit = null;
      const skuList = r.sku ? (bySku.get(String(r.sku).trim().toLowerCase()) || []).filter((x) => !used.has(x.id)) : [];
      if (skuList.length) { const named = skuList.filter((c) => (c.name || '').trim().toLowerCase() === n); if (named.length === 1) hit = named[0]; }
      if (!hit) { const c = byNameDate.get(n + '|' + (r.datePosted || '')); if (c && !used.has(c.id)) hit = c; }
      // a SKU alone only counts as a match when exactly one item uses it — shared SKUs need the name too
      if (!hit && skuList.length === 1 && (bySku.get(String(r.sku).trim().toLowerCase()) || []).length === 1) hit = skuList[0];
      if (!hit) { const same = (byName.get(n) || []).filter((x) => !used.has(x.id)); if (same.length === 1) hit = same[0]; }
      if (hit && used.has(hit.id)) hit = null;
      if (hit) used.add(hit.id);
      return hit;
    };
  }
  /** Merge an imported row into an existing item: sheet values win, but empty cells never erase platforms, links or notes. */
  function mergeImported(existing, r, cols) {
    const after = U.clone(existing);
    const take = (k) => { if (cols.includes(k) && r[k] !== undefined) after[k] = r[k]; };
    ['name', 'category', 'sku', 'purchasePrice', 'sellingPrice', 'status', 'datePosted', 'totalAfterFees'].forEach(take);
    ['brand', 'size', 'color', 'condition', 'material', 'measurements', 'weight', 'location', 'source', 'purchaseDate', 'minPrice'].forEach((k) => { if (cols.includes(k) && r[k] !== undefined && r[k] !== '' && r[k] !== null) after[k] = r[k]; });
    if (cols.includes('dateSold') || cols.includes('status')) after.dateSold = r.dateSold || (after.status === 'sold' ? existing.dateSold : '');
    if (r.platform) after.platform = r.platform;
    if (cols.includes('shippingCost') && r.shippingCost !== null && r.shippingCost !== undefined) after.shippingCost = r.shippingCost;
    if (r.notes) after.notes = r.notes;
    const L = (existing.listings || []).map((l) => ({ ...l }));
    (r.listings || []).forEach((l) => {
      const same = L.find((x) => x.platform === l.platform && (!x.url || !l.url || x.url === l.url));
      if (same) { if (!same.url && l.url) same.url = l.url; } else L.push(l);
    });
    after.listings = normListings(L);
    return normalizeItem(after);
  }

  async function importExcel(file) {
    try {
      const sheet = await Reports.loadInventorySheet(await U.readFile(file, 'buffer'));
      const sig = 'xl-' + sheet.headers.map((h) => h.key).join('|');
      S().excelProfiles = S().excelProfiles || {};
      const saved = S().excelProfiles[sig];
      const colMap = { ...sheet.auto, ...(saved || {}) };
      let rows, plan;
      const body = document.createElement('div');
      body.className = 'imp';
      const evaluate = () => {
        rows = sheet.parse(colMap);
        const match = makeMatcher(state.items);
        plan = rows.map((r) => ({ r, hit: match(r) }));
      };
      const draw = () => {
        evaluate();
        const unsold = rows.filter((r) => r.status !== 'sold');
        const unsoldPlat = unsold.filter((r) => r.platform || (r.listings || []).length).length;
        const links = rows.reduce((a, r) => a + (r.listings || []).filter((l) => l.url).length, 0);
        const matched = plan.filter((x) => x.hit).length;
        const sample = rows.filter((r) => r.status !== 'sold' && (r.listings || []).length).slice(0, 5);
        body.innerHTML = `
          ${saved ? '<div class="imp-note ok">✓ Using the column choices you saved for this spreadsheet layout.</div>' : '<div class="imp-note">Check that each field points at the right column of your sheet — especially <b>Platform</b>. Your choices are remembered for next time.</div>'}
          <div class="imp-cols">
            <div>
              <h4>Columns in “${esc(sheet.sheetName)}”</h4>
              <div class="imp-map"><table><thead><tr><th>App field</th><th>Your sheet’s column</th></tr></thead><tbody>
                ${sheet.fields.map((f) => `<tr class="${colMap[f.key] ? '' : 'unmapped'}"><td>${esc(f.label)}</td><td><select data-xl="${f.key}"><option value="">— none —</option>${sheet.headers.map((h) => `<option value="${h.i}" ${+colMap[f.key] === h.i ? 'selected' : ''}>${esc(h.label)}</option>`).join('')}</select></td></tr>`).join('')}
              </tbody></table></div>
            </div>
            <div>
              <h4>What will be imported</h4>
              <div class="imp-stats">
                <div><b>${rows.length}</b><span>items</span></div>
                <div><b>${rows.length - unsold.length}</b><span>sold</span></div>
                <div class="${unsold.length && !unsoldPlat ? 'warn' : ''}"><b>${unsoldPlat} / ${unsold.length}</b><span>unsold with platform</span></div>
                <div><b>${links}</b><span>listing links</span></div>
                <div><b>${matched}</b><span>already in app</span></div>
              </div>
              ${!colMap.platform && !colMap.listedOn ? '<div class="imp-note warn">No column is set for <b>Platform</b>. Pick the column where you wrote the platform(s) on the left.</div>' : ''}
              ${sample.length ? `<div class="imp-prev"><table><thead><tr><th>Unsold item</th><th>Platform it sold</th><th>Listed On</th></tr></thead><tbody>${sample.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(platformLabel(r.platform)) || '—'}</td><td>${(r.listings || []).map((l) => esc(platformLabel(l.platform) || 'link') + (l.url ? ' ↗' : '')).join(', ')}</td></tr>`).join('')}</tbody></table></div>` : ''}
              <div class="imp-note ok" style="margin-top:12px"><b>Update (recommended)</b> updates matching items in place and adds new ones. Platforms in your sheet are filled into both <b>Platform it sold</b> and <b>Listed On</b>. Empty cells never erase platforms, links, notes or photos already in the app.</div>
              <p class="muted small"><b>Add new only</b> skips items you already have. <b>Replace inventory</b> also removes items that aren’t in the sheet. A safety snapshot is saved first.</p>
            </div>
          </div>`;
      };
      body.addEventListener('change', (e) => { const k = e.target.dataset.xl; if (!k) return; if (e.target.value) colMap[k] = +e.target.value; else delete colMap[k]; draw(); });
      draw();
      const choice = await U.modal({
        title: `Import from Excel — ${file.name}`, body, wide: 'xl',
        buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'Replace inventory', value: 'replace', cls: 'btn-danger' }, { label: 'Add new only', value: 'append' }, { label: 'Update', value: 'update', cls: 'btn-primary' }]
      });
      if (!choice) return;
      S().excelProfiles[sig] = { ...colMap }; saveSettings();
      evaluate();
      const cols = rows.columns || [];
      await takeSnapshot(`Before Excel import (${choice}) of ${file.name}`);
      let sku = parseInt(nextSku(), 10);
      const changes = [];
      let added = 0, updated = 0, skipped = 0;
      const keep = new Set();
      plan.forEach(({ r, hit }) => {
        if (hit) {
          keep.add(hit.id);
          if (choice === 'append') { skipped++; return; }
          changes.push({ id: hit.id, after: mergeImported(hit, r, cols) }); updated++;
        } else {
          const it = normalizeItem(r);
          if (!it.sku) it.sku = String(sku++);
          changes.push({ id: it.id, after: it }); added++;
        }
      });
      let removed = 0;
      if (choice === 'replace') state.items.forEach((it) => { if (!keep.has(it.id)) { changes.push({ id: it.id, after: null }); removed++; } });
      commit('items', changes, { label: 'Excel import' });
      changes.forEach((c) => { if (c.after) { addListValue('categories', c.after.category); addListValue('platforms', c.after.platform); (c.after.listings || []).forEach((l) => addListValue('platforms', l.platform)); } });
      renderAll();
      const withPlat = state.items.filter((i) => !Calc.isSold(i) && i.platform).length;
      U.toast(`Excel import: ${added} added, ${updated} updated${skipped ? `, ${skipped} skipped` : ''}${removed ? `, ${removed} removed` : ''} · ${withPlat} unsold items now show a platform.`, 'ok');
    } catch (e) { console.error(e); U.toast('Excel import failed: ' + e.message, 'err'); }
  }

  /* =========================================================
     SAFETY SNAPSHOTS — automatic restore points
     ========================================================= */
  const APP_VERSION = '2026.11.27m';
  const MAX_SNAPSHOTS = 10;
  async function takeSnapshot(reason) {
    if (!state.items.length && !state.expenses.length) return;
    try {
      const snaps = Array.isArray(state.meta.snapshots) ? state.meta.snapshots : [];
      snaps.unshift({ id: U.uid(), at: new Date().toISOString(), reason, app: APP_VERSION,
        counts: { items: state.items.length, expenses: state.expenses.length, withPlatform: state.items.filter((i) => i.platform || (i.listings || []).length).length },
        items: U.clone(state.items), expenses: U.clone(state.expenses), mileage: U.clone(state.mileage), settings: U.clone(state.settings) });
      state.meta.snapshots = snaps.slice(0, MAX_SNAPSHOTS);
      await Store.putVault('snapshots', state.meta.snapshots);
    } catch (e) { console.error('snapshot failed', e); }
  }
  function renderSnapshots() {
    const box = $('#snapList'); if (!box) return;
    const snaps = state.meta.snapshots || [];
    box.innerHTML = snaps.length ? snaps.map((sn) => `<div class="snap-row" data-sid="${esc(sn.id)}">
        <div><b>${esc(new Date(sn.at).toLocaleString())}</b><div class="muted small">${esc(sn.reason)} · ${sn.counts.items} items, ${sn.counts.expenses} expenses${sn.counts.withPlatform !== undefined ? `, ${sn.counts.withPlatform} with platforms` : ''}</div></div>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm btn-ghost" data-snap="download">Download</button>
        <button type="button" class="btn btn-sm" data-snap="restore">Restore</button></div>`).join('')
      : '<p class="muted small">No snapshots yet. One is saved automatically before every import, restore, and app update.</p>';
  }
  async function snapshotAction(id, act) {
    const sn = (state.meta.snapshots || []).find((x) => x.id === id); if (!sn) return;
    if (act === 'download') {
      const payload = { format: 'inventory-ledger-backup', version: 2, app: 'Inventory & Sales Ledger', exportedAt: sn.at, snapshot: sn.reason, counts: sn.counts, data: { items: sn.items, expenses: sn.expenses, mileage: sn.mileage || [], settings: sn.settings } };
      U.download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${U.slug(S().companyName || 'Thriftaholics')}-snapshot-${sn.at.slice(0, 16).replace(/[:T]/g, '-')}.json`);
      U.toast('Snapshot downloaded — keep it private', 'ok');
      return;
    }
    if (!(await U.confirm('Restore snapshot', `Restore your inventory, expenses and settings to <b>${esc(new Date(sn.at).toLocaleString())}</b> (${esc(sn.reason)})? Your current data is snapshotted first, so this can be undone the same way. Photos stay attached.`, 'Restore'))) return;
    await takeSnapshot('Before restoring snapshot from ' + new Date(sn.at).toLocaleString());
    const prev = { items: state.items, expenses: state.expenses, mileage: state.mileage };
    state.items = sn.items.map(normalizeItem); state.expenses = sn.expenses.map(normalizeExpense); state.mileage = (sn.mileage || []).map(normalizeTrip);
    state.settings = { ...U.clone(DEFAULT_SETTINGS), ...U.clone(sn.settings), sync: S().sync };
    markReplaced(prev);
    state.undo = []; state.redo = []; updateUndoUI(); state.selection.clear();
    await persist(() => Store.replaceAll({ items: state.items, expenses: state.expenses, settings: state.settings, logo: state.logo, meta: { ...state.meta, mileage: state.mileage, activity: state.activity }, photos: null }));
    applySettingsToUI(); renderAll(); renderSnapshots();
    U.toast('Snapshot restored', 'ok');
    if (window.Sync) Sync.changed();
  }
  /** After a Replace-all restore: make the restored data win over the Google Drive copy.
      Records that were on this device but aren't in the restore are marked deleted (so sync removes them
      everywhere instead of bringing them back), and restored records/settings count as edited now. */
  function markReplaced(prev) {
    const now = Date.now();
    const t = (state.meta.tombstones ||= {});
    [['items', state.items], ['expenses', state.expenses], ['mileage', state.mileage]].forEach(([k, list]) => {
      const keep = new Set(list.map((r) => r.id));
      t[k] = { ...(t[k] || {}) };
      (prev[k] || []).forEach((r) => { if (!keep.has(r.id)) t[k][r.id] = now; });
      list.forEach((r) => { r.updatedAt = now + 1; delete t[k][r.id]; });
    });
    state.settings.updatedAt = now + 1;
  }
  /** One-time: items that already name a platform get it in "Listed On" too (nothing is removed). */
  function migrateListings() {
    const changes = [];
    if (!S().listingsMigrated) {
      state.items.forEach((it) => {
        if ((it.listings || []).length || !it.platform) return;
        // a sold item's platform is where it SOLD: that listing is done, not something to delist
        const sold = Calc.isSold(it);
        changes.push({ id: it.id, after: { ...U.clone(it), listings: splitPlatforms(it.platform).map((p) => ({ platform: p, url: '', status: sold ? 'sold' : 'active', statusDate: sold ? (it.dateSold || '') : '' })) } });
      });
      S().listingsMigrated = true;
    }
    fixSoldListings(changes);
    S().soldListingsFixed = true; saveSettings();
    if (changes.length) commit('items', changes.map((c) => ({ id: c.id, after: c.after })), { undoable: false, log: false });
    return changes.filter((c) => !c.repair).length;
  }
  /** Repair: a sold item still "active" on the very platform it sold on (made by older restores) → mark that listing sold. */
  function fixSoldListings(changes) {
    if (S().soldListingsFixed) return;
    const pending = new Map(changes.map((c) => [c.id, c]));
    state.items.forEach((it) => {
      const cur = pending.has(it.id) ? pending.get(it.id).after : it;
      if (!Calc.isSold(cur) || !cur.platform) return;
      const sold = new Set(splitPlatforms(cur.platform));
      if (!(cur.listings || []).some((l) => l.status === 'active' && sold.has(l.platform))) return;
      const after = { ...U.clone(cur), listings: cur.listings.map((l) => (l.status === 'active' && sold.has(l.platform) ? { ...l, status: 'sold', statusDate: l.statusDate || cur.dateSold || '' } : l)) };
      if (pending.has(it.id)) pending.get(it.id).after = after; else { const c = { id: it.id, after, repair: true }; changes.push(c); pending.set(it.id, c); }
    });
  }

  /* =========================================================
     LOGO
     ========================================================= */
  async function uploadLogo(file) {
    if (!file) return;
    if (file.type !== 'image/png' && !/\.png$/i.test(file.name)) { U.toast('Please choose a PNG file.', 'err'); return; }
    if (file.size > 1024 * 1024) { U.toast('Logo must be under 1 MB.', 'err'); return; }
    const dataURL = await U.readFile(file, 'dataURL');
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataURL; }).catch(() => null);
    if (!img.naturalWidth) { U.toast('That PNG could not be read.', 'err'); return; }
    state.logo = { dataURL, width: img.naturalWidth, height: img.naturalHeight, name: file.name };
    persist(() => Store.putVault('logo', state.logo));
    renderLogo(); if (window.Sync) Sync.changed();
    U.toast('Logo saved', 'ok');
  }
  function renderLogo() {
    const has = !!(state.logo && state.logo.dataURL);
    $('#logoImg').classList.toggle('hidden', !has);
    $('#logoPh').classList.toggle('hidden', has);
    $('#logoSlot').classList.toggle('has-logo', has);
    if (has) $('#logoImg').src = state.logo.dataURL; else $('#logoImg').removeAttribute('src');
    $('#logoPreview').innerHTML = has ? `<img src="${state.logo.dataURL}" alt="Logo preview">` : '<span class="muted small">No logo</span>';
  }

  /* =========================================================
     SETTINGS
     ========================================================= */
  /** Light / dark / auto — saved per device (also kept outside the encrypted data so the lock screen matches) */
  function applyTheme() {
    const t = (state.settings && S().theme) || 'auto';
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const before = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('thrift-theme', t); } catch (_) { /* ignore */ }
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#0f2a27' : '#164e47');
    if (before !== document.documentElement.getAttribute('data-theme') && Store.unlocked && currentView() === 'dashboard') renderDashboard();
  }
  function applySettingsToUI() {
    applyTheme();
    if (ensurePlatformProfiles()) saveSettings();
    if (!S().colsV3) { S().hiddenCols = uniq([...(S().hiddenCols || []), 'minPrice', 'color', 'condition', 'material', 'measurements', 'weight', 'source', 'purchaseDate']); S().colsV3 = true; saveSettings(); }
    // Material (new field): column starts hidden (Columns → Material shows it), and listing descriptions get a Material line
    if (!S().colsMat) { S().hiddenCols = uniq([...(S().hiddenCols || []), 'material']); S().colsMat = true; saveSettings(); }
    if (!S().tplMat && S().templates && typeof S().templates.description === 'string') {
      const d = S().templates.description;
      if (!/\{material\}/.test(d)) S().templates.description = /^.*\{condition\}.*$/m.test(d) ? d.replace(/^(.*\{condition\}.*)$/m, '$1\nMaterial: {material}') : d;
      S().tplMat = true; saveSettings();
    }
    U.setCurrency(S().currency);
    if (S().companyName === 'My Company') { S().companyName = ''; saveSettings(); } // the old placeholder default
    $('#companyName').value = S().companyName || '';
    $('#companyName').classList.toggle('hidden', !S().companyName);
    $('#companyTag').textContent = S().tagline || '';
    document.querySelector('.topbar').classList.toggle('name-hidden', S().showName === false);
    document.title = `${S().companyName || 'Thriftaholics'} — Inventory & Sales`;
    $('#lgAging').textContent = S().agingDays; $('#lgStale').textContent = S().staleDays;
    populateFilters(); renderSettings(); renderLogo(); armAutoLock();
  }
  function renderSettings() {
    const s = S();
    $('#setCompany').value = s.companyName; $('#setTagline').value = s.tagline || ''; $('#setShowName').checked = s.showName !== false; $('#setYourName').value = s.yourName || ''; $('#setTheme').value = s.theme || 'auto'; $('#setCurrency').value = s.currency;
    $('#setAging').value = s.agingDays; $('#setStale').value = s.staleDays;
    $('#setCategories').value = s.categories.join(', ');
    $('#setStatuses').value = s.statuses.join(', '); $('#setExpCats').value = s.expenseCategories.join(', ');
    $('#setIncomeTax').value = s.incomeTaxRate; $('#setSETax').value = s.seTaxRate; $('#setSalesTax').value = s.salesTaxRate;
    $('#setAutoLock').value = s.autoLockMin; $('#setEncryptBackup').checked = !!s.encryptBackup; $('#setExcelPhotos').checked = s.excelPhotos !== false; $('#setCelebrate').checked = s.celebrate !== false;
    const lb = state.meta.lastBackup;
    renderSnapshots();
    const profs = Object.values(s.importProfiles || {});
    $('#importProfilesNote').textContent = profs.length ? `Saved import formats: ${profs.map((p) => p.name).join(', ')}` : 'No saved import formats yet.';
    $('#lastBackup').textContent = lb ? `Last backup: ${new Date(lb).toLocaleString()}` : 'No backup made yet on this device.';
  }
  function setupSettings() {
    const bind = (sel, key, conv = (v) => v) => $(sel).addEventListener('change', (e) => {
      const v = e.target.type === 'checkbox' ? e.target.checked : conv(e.target.value);
      S()[key] = v; saveSettings(); applySettingsToUI(); renderAll();
    });
    bind('#setCompany', 'companyName', (v) => v.trim());
    bind('#setTagline', 'tagline', (v) => v.trim());
    bind('#setShowName', 'showName');
    $('#setYourName').addEventListener('change', (e) => { S().yourName = e.target.value.trim(); saveSettings(); renderActivityFeed(); });
    $('#btnAllActivity').addEventListener('click', openActivityLog);
    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);
    $('#activityFeed').addEventListener('click', (e) => { if (!e.target.closest('[data-goto-name]')) return; showView('settings'); setTimeout(() => { $('#setYourName').scrollIntoView({ block: 'center' }); $('#setYourName').focus(); }, 80); });
    $('#setTheme').addEventListener('change', (e) => { S().theme = e.target.value; saveSettings(); applyTheme(); });
    $('#btnTheme').addEventListener('click', () => {
      S().theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      saveSettings(); applyTheme(); $('#setTheme').value = S().theme;
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ((S().theme || 'auto') === 'auto') applyTheme(); });
    bind('#setCurrency', 'currency');
    bind('#setAging', 'agingDays', (v) => Math.max(1, parseInt(v, 10) || 90));
    bind('#setStale', 'staleDays', (v) => Math.max(1, parseInt(v, 10) || 180));
    bind('#setIncomeTax', 'incomeTaxRate', (v) => Math.max(0, U.num(v) || 0));
    bind('#setSETax', 'seTaxRate', (v) => Math.max(0, U.num(v) || 0));
    bind('#setSalesTax', 'salesTaxRate', (v) => Math.max(0, U.num(v) || 0));
    bind('#setAutoLock', 'autoLockMin', (v) => Math.max(0, parseInt(v, 10) || 0));
    bind('#setEncryptBackup', 'encryptBackup');
    bind('#setExcelPhotos', 'excelPhotos');
    bind('#setCelebrate', 'celebrate');
    $('#btnCelebrateTest').onclick = () => Celebrate.sale({ amount: 40, profit: 31.2, count: 1 });
    $('#snapList').addEventListener('click', (e) => { const b = e.target.closest('[data-snap]'); if (b) snapshotAction(b.closest('[data-sid]').dataset.sid, b.dataset.snap); });
    $('#btnSnapNow').onclick = async () => { await takeSnapshot('Manual snapshot'); renderSnapshots(); U.toast('Snapshot saved', 'ok'); };
    $('#btnForgetMappings').onclick = async () => {
      const n = Object.keys(S().importProfiles || {}).length;
      if (!n) { U.toast('No saved import mappings.'); return; }
      if (!(await U.confirm('Forget import mappings', `Forget ${n} saved field mapping(s)? The next import from another program will be matched automatically again.`, 'Forget'))) return;
      S().importProfiles = {}; saveSettings(); renderSettings(); U.toast('Saved mappings cleared', 'ok');
    };
    bind('#setCategories', 'categories', (v) => uniq(U.splitList(v).map((x) => x.toLowerCase())));
    bind('#setStatuses', 'statuses', (v) => uniq(['available', 'sold', ...U.splitList(v).map((x) => x.toLowerCase())]));
    bind('#setExpCats', 'expenseCategories', (v) => uniq(U.splitList(v)));
    $('#companyName').addEventListener('change', (e) => {
      const v = e.target.value.trim();
      // clearing the name in the header hides it there (handy when the logo already has the name); reports keep the saved name
      if (!v) { S().showName = false; U.toast('Name hidden from the header — it’s still used on reports and file names. Show it again in Settings → Business.', 'ok'); }
      else S().companyName = v;
      saveSettings(); applySettingsToUI();
    });
    $('#companyName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

    $('#logoSlot').onclick = () => $('#logoInput').click();
    attachDropZone($('#logoSlot'), async (f) => {
      if (state.logo && !(await U.confirm('Replace logo?', '<p>Use the image you dropped as your new logo? The current logo will be replaced.</p>', 'Replace logo'))) return;
      uploadLogo(f);
    });
    $('#btnLogoUpload').onclick = () => $('#logoInput').click();
    $('#logoInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; uploadLogo(f); };
    $('#btnLogoRemove').onclick = () => { state.logo = null; persist(() => Store.putVault('logo', null)); renderLogo(); if (window.Sync) Sync.changed(); };

    $('#btnChangePass').onclick = changePassword;
    $('#btnRecNew').onclick = () => setupRecoveryFromSettings();
    $('#setHint').addEventListener('change', async (e) => { const h = e.target.value.trim(); await Store.setHint(h); U.toast(h ? 'Hint saved' : 'Hint removed', 'ok'); });
    $('#btnWipe').onclick = async () => {
      if (!(await U.confirm('Erase all data', 'This permanently deletes every item, expense, setting, logo and your password from this browser. <b>Export a backup first</b> if you may need it.', 'Erase everything', true))) return;
      const t = await U.prompt('Type ERASE to confirm', 'Confirmation', { placeholder: 'ERASE', okLabel: 'Erase' });
      if ((t || '').trim().toUpperCase() !== 'ERASE') return;
      // signed in to the cloud: the same data is also in Firebase — offer to delete it, or it would come back the next time this device signs in
      if (window.Sync && Sync.signedIn() && await U.confirm('Also erase the cloud copy?',
        'This device is signed in to cloud sync, so this data is also in the cloud and on your other devices. <b>Erase the cloud copy too</b> only if this was test data or you are shutting sync down everywhere — it removes the data from <b>every</b> device the next time they sync.<br><br>Choose <b>Cancel</b> to erase only this device.',
        'Erase cloud copy too', true)) {
        try { await Sync.deleteRemote(); U.toast('Cloud copy erased', 'ok'); }
        catch (e) { if (!(await U.confirm('Couldn’t reach the cloud', `The cloud copy wasn’t erased (${U.esc(e.message || e)}). Erase this device anyway?`, 'Erase this device', true))) return; }
      }
      if (window.Sync) { await Sync.signOut(); Sync.forgetDevice(); }
      await Store.wipe(); location.reload();
    };
  }
  async function changePassword() {
    const body = `<label class="field"><span>Current password</span><input type="password" id="cpOld" autocomplete="current-password"></label>
      <label class="field"><span>New password (min 8 characters)</span><input type="password" id="cpNew" autocomplete="new-password"></label>
      <label class="field"><span>Confirm new password</span><input type="password" id="cpNew2" autocomplete="new-password"></label><p class="lock-error" id="cpErr"></p>`;
    const res = await U.modal({
      title: 'Change password', body,
      buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, {
        label: 'Change password', cls: 'btn-primary',
        validate: (b) => { const n = $('#cpNew', b).value; const err = $('#cpErr', b); if (n.length < 8) { err.textContent = 'New password must be at least 8 characters.'; return false; } if (n !== $('#cpNew2', b).value) { err.textContent = 'New passwords do not match.'; return false; } return true; },
        value: (b) => ({ old: $('#cpOld', b).value, nw: $('#cpNew', b).value })
      }]
    });
    if (!res) return;
    saving(1);
    try {
      const ok = await Store.changePassword(res.old, res.nw);
      U.toast(ok ? 'Password changed — all data re-encrypted. Your reset questions still work.' : 'Current password is incorrect', ok ? 'ok' : 'err');
      if (ok && window.Sync) Sync.passwordChanged(res.old, res.nw);
    } catch (e) { U.toast('Password change failed: ' + e.message, 'err'); } finally { saving(-1); }
  }
  function populateFilters() {
    const fill = (sel, label, arr) => { const el = $(sel); const cur = el.value; el.innerHTML = `<option value="">${label}</option>` + arr.map((x) => `<option value="${esc(x)}" ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join(''); };
    fill('#fStatus', 'All statuses', allStatuses());
    fill('#fCategory', 'All categories', allCats());
    fill('#fPlatform', 'All platforms', allPlatforms());
    fill('#ordPlatform', 'All platforms', allPlatforms());
  }

  /* =========================================================
     NAV + RENDER
     ========================================================= */
  function currentView() { return ($('.tab.active') || {}).dataset?.view || 'dashboard'; }
  async function guideCtx() {
    const hint = await Store.getHint().catch(() => '');
    const qa = await Store.getQuestionAnswers().catch(() => null);
    return { recovery: !!(hint || qa), logo: !!(state.logo && state.logo.dataURL), items: state.items.length, sold: state.items.filter((i) => Calc.isSold(i)).length,
      platformsTouched: !!S().platformsSeen, crossListed: state.items.some((i) => (i.listings || []).filter((l) => l.status === 'active').length >= 2), backup: !!state.meta.lastBackup, name: !!(S().yourName || '').trim(), shop: !!S().shopUrl, sync: !!(window.Sync && Sync.signedIn && Sync.signedIn()) };
  }
  function showView(v) {
    document.body.classList.toggle('has-bulkbar', v === 'inventory' && state.selection.size > 0);
    $('#bulkBar').classList.toggle('hidden', v !== 'inventory' || state.selection.size === 0);
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
    renderView(v);
    try { sessionStorage.setItem('ledger:view', v); } catch (_) { /* ignore */ }
  }
  function renderView(v) {
    if (window.Ext) Ext.run('view', v);
    if (v === 'dashboard') renderDashboard();
    else if (v === 'inventory') invGrid.render();
    else if (v === 'orders') ordGrid.render();
    else if (v === 'expenses') { renderExpenses(); mileGrid.render(); }
    else if (v === 'reports') renderReport();
    else if (v === 'settings') { renderSettings(); renderPlanSettings(); renderSyncSettings(); renderRecoverySettings(); }
    else if (v === 'platforms') { renderPlatforms(); autoFeeCheck(); if (!S().platformsSeen) { S().platformsSeen = true; saveSettings(); } }
    else if (v === 'guide') Guide.render($('#guideRoot'), guideCtx);
    else if (v === 'actions') renderActions();
    requestAnimationFrame(() => { applyHeights(); [invGrid, ordGrid, expGrid].forEach((g) => g && g.applySticky()); });
  }
  function renderCounts() {
    const ac = actionCounts(); const urgent = ac.delist + ac.markdown;
    $('#tabActCount').textContent = urgent; $('#tabActCount').classList.toggle('hot', ac.delist > 0);
    $('#tabInvCount').textContent = state.items.filter((i) => Calc.isAsset(i, '')).length;
    $('#tabSoldCount').textContent = state.items.filter(Calc.isSold).length;
  }
  function renderAll() { populateFilters(); renderCounts(); renderView(currentView()); renderBanner(); }

  /* =========================================================
     LOCK / UNLOCK / AUTO-LOCK
     ========================================================= */
  let lastActivity = Date.now(), lockTimer = null;
  /* Long jobs (backup, restore, photo downloads, Excel) hold off the inactivity lock: locking erases the
     key from memory, which would break the job halfway. The countdown restarts when the job ends. */
  const lockHolds = new Map(); let holdSeq = 0;
  function holdLock(why) {
    const id = ++holdSeq; lockHolds.set(id, why || 'busy');
    let done = false;
    return () => { if (done) return; done = true; lockHolds.delete(id); lastActivity = Date.now(); };
  }
  function armAutoLock() {
    clearInterval(lockTimer);
    const min = S().autoLockMin;
    if (!min) return;
    lockTimer = setInterval(() => { if (Store.unlocked && !lockHolds.size && Date.now() - lastActivity > min * 60000) lockApp('Locked after inactivity.'); }, 15000);
  }
  ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'wheel'].forEach((ev) => window.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true, capture: true }));

  function lockApp(msg) {
    Store.lock();
    clearInterval(lockTimer);
    U.closeModal(null);
    state.items = []; state.expenses = []; state.mileage = []; state.logo = null; state.thumbs = {}; state.undo = []; state.redo = []; updateUndoUI(); state.selection.clear();
    if (window.Sync) Sync.lock();
    ['#invTable', '#ordTable', '#expTable'].forEach((t) => { $(t).tHead.innerHTML = ''; $(t).tBodies[0].innerHTML = ''; $(t).tFoot.innerHTML = ''; });
    ['#kpis', '#reportBody', '#staleList', '#recentSales', '#categoryTable', '#platformDonut', '#salesCal', '#bestStrip', '#activityFeed', '#expByCat', '#ordKpis'].forEach((s) => { const el = $(s); if (el) el.innerHTML = ''; }); state.activity = [];
    $('#app').classList.add('hidden'); $('#undoDock').classList.add('hidden');
    showLock('unlock', msg);
  }
  function showLock(mode, msg) {
    const lock = $('#lock');
    lock.classList.remove('hidden');
    lock.dataset.mode = mode;
    $('#lockConfirmWrap').classList.toggle('hidden', mode !== 'setup');
    $('#lockHintWrap').classList.toggle('hidden', mode !== 'setup');
    $('#lockHintShow').classList.add('hidden'); wrongTries = 0;
    $('#lockConfirm').required = mode === 'setup';
    $('#lockPass').autocomplete = mode === 'setup' ? 'new-password' : 'current-password';
    $('#lockPass').minLength = mode === 'setup' ? 8 : 1;
    $('#lockBtn').textContent = mode === 'setup' ? 'Create password & start' : 'Unlock';
    $('#lockSub').textContent = mode === 'setup' ? 'First run: create a password (min 8 characters). It encrypts all data on this device. Add a hint below, and next you’ll pick three reset questions in case you ever forget it.' : (msg || 'Enter your password to unlock your data.');
    $('#lockReset').classList.toggle('hidden', mode === 'setup');
    $('#lockError').textContent = '';
    $('#lockPass').value = ''; $('#lockConfirm').value = '';
    setTimeout(() => $('#lockPass').focus(), 50);
  }
  let wrongTries = 0;
  async function onLockSubmit(e) {
    e.preventDefault();
    const mode = $('#lock').dataset.mode;
    const pw = $('#lockPass').value;
    const err = $('#lockError');
    const btn = $('#lockBtn');
    const fail = (m) => { err.textContent = m; const c = $('.lock-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); btn.disabled = false; btn.textContent = mode === 'setup' ? 'Create password & start' : 'Unlock'; };
    if (!window.crypto || !crypto.subtle) return fail('This page must be opened over https:// (or localhost) for encryption to work.');
    if (mode === 'setup') {
      if (pw.length < 8) return fail('Use at least 8 characters.');
      if (pw !== $('#lockConfirm').value) return fail('Passwords do not match.');
    }
    btn.disabled = true; btn.textContent = mode === 'setup' ? 'Securing…' : 'Unlocking…';
    try {
      if (mode === 'setup') await Store.setup(pw);
      else if (!(await Store.unlock(pw))) {
        wrongTries++;
        const h = await Store.getHint().catch(() => '');
        if (h) { $('#lockHintShow').innerHTML = `💡 Hint: <b>${esc(h)}</b>`; $('#lockHintShow').classList.remove('hidden'); }
        return fail(wrongTries >= 2 ? 'Incorrect password. Forgot it? Click “Forgot password?” below.' : 'Incorrect password.');
      }
      if (mode !== 'setup') showSkeleton();
      const data = await Store.loadAll();
      state.items = data.items.map(normalizeItem);
      state.expenses = data.expenses.map(normalizeExpense);
      state.settings = { ...U.clone(DEFAULT_SETTINGS), ...(data.settings || {}) };
      settingsBaseline();
      state.logo = data.logo || null;
      state.thumbs = data.thumbs || {}; // photos of removed items are kept, so a snapshot restore brings them back
      state.meta = { lastBackup: data.meta.lastBackup || null, snapshots: Array.isArray(data.meta.snapshots) ? data.meta.snapshots : [], appVersion: data.meta.appVersion || null, tombstones: data.meta.tombstones || {} };
      state.mileage = (Array.isArray(data.meta.mileage) ? data.meta.mileage : []).map(normalizeTrip);
      state.activity = Array.isArray(data.meta.activity) ? data.meta.activity : [];
      state.prevVersion = state.meta.appVersion !== APP_VERSION ? (state.meta.appVersion || 'new') : null;
      if (state.meta.appVersion !== APP_VERSION) {
        await takeSnapshot(`Automatic, before first use of app version ${APP_VERSION}`);
        state.meta.appVersion = APP_VERSION;
        Store.putVault('appVersion', APP_VERSION).catch(() => {});
      }
      if (!data.settings) await Store.putVault('settings', state.settings);
      $('#lock').classList.add('hidden');
      $('#app').classList.remove('hidden'); $('#undoDock').classList.remove('hidden'); updateUndoUI();
      lastActivity = Date.now();
      applySettingsToUI();
      let v = 'dashboard'; try { v = sessionStorage.getItem('ledger:view') || 'dashboard'; } catch (_) { /* ignore */ }
      if (mode === 'setup' && !state.items.length) v = 'inventory';
      showView(v); renderCounts();
      if (mode === 'setup') U.toast('Welcome! Use “Restore” for a JSON backup or “Import Excel” to load your spreadsheet.', 'ok');
      const moved = migrateListings();
      if (moved) { renderAll(); U.toast(`Platforms from ${moved} item(s) are now also shown in the “Listed On” column.`, 'ok'); }
      state.meta.hasRecovery = !!(await Store.getQuestions());
      renderBanner();
      setTimeout(handleHash, 300);
      const viaEmail = recoveredVia === 'email'; recoveredVia = '';
      if (recoveredFrom) { const old = recoveredFrom; recoveredFrom = null; if (window.Sync) Sync.passwordChanged(old, pw); U.toast(viaEmail ? 'Password reset — you’re back in. A fresh reset code is being set up for next time.' : 'Password reset — you’re back in. Your questions still work if you forget again.', 'ok'); }
      else if (window.Sync) Sync.unlocked(pw);
      if (window.Ext && Ext.afterUnlock) Ext.afterUnlock(pw, { viaEmail });
      if (mode === 'setup') {
        const h = $('#lockHint').value.trim(); if (h) await Store.setHint(h);
        await setupQuestionsNow(pw, { title: 'One more thing: password reset questions' });
      }
    } catch (e2) { console.error(e2); fail('Error: ' + e2.message); }
    btn.disabled = false;
  }

  /* =========================================================
     FORGOT PASSWORD — hint + security questions (any 2 of 3)
     ========================================================= */
  let recoveredFrom = null; // old password, kept only until the app finishes unlocking after a reset
  let recoveredVia = '';
  // a reset link from the email: #reset=CODE opens "Forgot password" with the code filled in
  function resetFromHash() {
    const m = /^#reset=([A-Za-z0-9-]{16,60})$/.exec(location.hash); if (!m || Store.unlocked) return false;
    history.replaceState(null, '', location.pathname + location.search);
    forgotPassword(m[1]); return true;
  }
  window.addEventListener('hashchange', () => { resetFromHash(); });
  const QUESTION_CHOICES = [
    'What was the name of your first pet?', 'What city were you born in?', 'What was the make of your first car?',
    'What street did you grow up on?', 'What was the name of your elementary school?', 'What is your oldest sibling’s middle name?',
    'What was your childhood nickname?', 'What is the name of your favorite teacher?', 'In what city did your parents meet?'
  ];
  /** Ask for 3 questions + answers. Returns { questions, answers } or null. */
  async function questionsDialog({ title = 'Password reset questions', intro, current } = {}) {
    const body = document.createElement('div');
    const opts = (sel) => QUESTION_CHOICES.map((q) => `<option ${q === sel ? 'selected' : ''}>${esc(q)}</option>`).join('') + `<option value="__own" ${sel && !QUESTION_CHOICES.includes(sel) ? 'selected' : ''}>Write my own question…</option>`;
    const cur = current || [QUESTION_CHOICES[0], QUESTION_CHOICES[1], QUESTION_CHOICES[2]];
    body.innerHTML = `<p style="margin-top:0">${intro || 'If you ever forget your password, answering <b>any two</b> of these lets you set a new one. Pick answers you’ll always remember and that others can’t look up online.'}</p>
      ${cur.map((q, i) => `<div class="qa" data-i="${i}">
        <label class="field"><span>Question ${i + 1}</span><select data-q>${opts(q)}</select></label>
        <input class="${QUESTION_CHOICES.includes(q) ? 'hidden' : ''}" data-own placeholder="Type your own question" value="${QUESTION_CHOICES.includes(q) ? '' : esc(q)}">
        <label class="field"><span>Answer</span><input data-a autocomplete="off" spellcheck="false"></label></div>`).join('')}
      <p class="muted small">Answers don’t care about capital letters, spaces or punctuation (“Mr. Whiskers” = “mr whiskers”).</p>
      <p class="lock-error" data-err></p>`;
    body.addEventListener('change', (e) => { if (e.target.matches('[data-q]')) { const own = e.target.closest('.qa').querySelector('[data-own]'); own.classList.toggle('hidden', e.target.value !== '__own'); if (e.target.value === '__own') own.focus(); } });
    const read = (b) => [...b.querySelectorAll('.qa')].map((row) => { const sel = row.querySelector('[data-q]').value; return { q: sel === '__own' ? row.querySelector('[data-own]').value.trim() : sel, a: row.querySelector('[data-a]').value }; });
    return U.modal({ title, body, wide: true, buttons: [{ label: 'Skip for now', value: null, cls: 'btn-ghost' }, {
      label: 'Save questions', cls: 'btn-primary',
      validate: (b) => {
        const r = read(b), err = b.querySelector('[data-err]');
        if (r.some((x) => !x.q)) { err.textContent = 'Each question needs text.'; return false; }
        if (new Set(r.map((x) => x.q.toLowerCase())).size < 3) { err.textContent = 'Choose three different questions.'; return false; }
        if (r.some((x) => Store.normAnswer(x.a).length < 2)) { err.textContent = 'Answer all three questions.'; return false; }
        return true;
      },
      value: (b) => { const r = read(b); return { questions: r.map((x) => x.q), answers: r.map((x) => x.a) }; }
    }] });
  }
  async function setupQuestionsNow(password, opts) {
    const r = await questionsDialog(opts);
    if (!r) return false;
    await Store.setupQuestions(password, r.questions, r.answers);
    state.meta.hasRecovery = true; renderBanner(); if (window.Sync) Sync.changed();
    U.toast('Saved — if you forget your password, answer two of these questions on the lock screen.', 'ok');
    return true;
  }
  async function forgotPassword(prefillCode) {
    if (typeof prefillCode !== 'string') prefillCode = '';
    const questions = await Store.getQuestions().catch(() => null);
    const er = await Store.getEmailReset().catch(() => null);
    const hasCode = !questions && (await Store.hasRecovery().catch(() => false)); // older versions used a recovery code
    const hint = await Store.getHint().catch(() => '');
    const body = document.createElement('div');
    const who = er ? (er.to ? er.to.replace(/^(.)(.*)(@.*)$/, (m0, a, b2, c) => a + '•'.repeat(Math.min(b2.length, 8)) + c) : 'the shop’s Gmail') : '';
    body.innerHTML = `${hint ? `<div class="hint-box">💡 Your hint: <b>${esc(hint)}</b><div class="muted small">Try again with the hint in mind — or ${er ? 'use one of the ways below' : 'answer your questions below'}.</div></div>` : ''}
      ${er ? `<div class="er-box" style="margin-top:${hint ? '14px' : '0'}"><b>✉️ Reset by email</b>
        <p class="muted small">We’ll email a reset code to <b>${esc(who)}</b>${er.name ? ` for <b>${esc(er.name)}</b>` : ''}. Type it here — or open the email’s button on this device.</p>
        <div class="er-row"><button type="button" class="btn btn-sm" data-er-send>✉️ Email me a reset code</button><span class="small" data-er-msg></span></div>
        <label class="field"><span>Reset code from the email</span><input data-er-code autocomplete="one-time-code" spellcheck="false" style="font-family:var(--mono)" value="${esc(prefillCode)}" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"></label></div>
        ${questions ? '<p class="muted small er-or">— or answer your questions —</p>' : ''}` : ''}
      ${questions ? `<p style="margin-top:${hint ? '14px' : '0'}">Answer <b>at least two</b> of your questions to set a new password.</p>
        ${questions.map((q, i) => `<label class="field"><span>${esc(q)}</span><input data-ans="${i}" autocomplete="off" spellcheck="false"></label>`).join('')}`
      : hasCode ? `<p>Enter the recovery code you saved earlier.</p><label class="field"><span>Recovery code</span><input data-code autocomplete="off" style="font-family:var(--mono)"></label>`
      : er ? '' : `<p>${hint ? '' : 'No hint or reset questions were set up on this device, so the password can’t be reset here. '}If you’re still signed in on another device, make a backup there. As a last resort you can erase this device and restore a backup.</p>`}
      <p class="lock-error" data-err></p>`;
    const canReset = questions || hasCode || er;
    if (er) {
      body.querySelector('[data-er-send]').addEventListener('click', async (e) => {
        const b = e.currentTarget, msg = body.querySelector('[data-er-msg]');
        b.disabled = true; msg.className = 'small muted'; msg.textContent = 'Sending…';
        try {
          const r = await fetch(er.url, { method: 'POST', body: JSON.stringify({ action: 'reset-send', deviceId: er.deviceId, token: er.token }) });
          let j = null; try { j = JSON.parse(await r.text()); } catch (_) { throw new Error('The Gmail script didn’t answer properly.'); }
          if (!j.ok) throw new Error(j.error || 'Could not send.');
          msg.className = 'small ok-text'; msg.textContent = `✓ Sent to ${who}. Check that inbox (and Spam) in a minute.`;
          body.querySelector('[data-er-code]').focus();
          setTimeout(() => { b.disabled = false; b.textContent = '✉️ Send it again'; }, 30000);
        } catch (err2) { b.disabled = false; msg.className = 'small bad-text'; msg.textContent = (/fetch|network|load failed/i.test(String(err2.message)) ? 'No connection — check the internet and try again.' : err2.message); }
      });
    }
    const res = await U.modal({ title: 'Forgot password', body, buttons: [
      { label: 'Erase this device…', value: 'erase', cls: 'btn-ghost danger-text' },
      { label: canReset ? 'Cancel' : 'Back', value: null, cls: canReset ? 'btn-ghost' : 'btn-primary' },
      ...(canReset ? [{ label: 'Continue', cls: 'btn-primary', validate: async (b) => {
        const err = b.querySelector('[data-err]'); err.textContent = 'Checking…';
        const codeIn = er ? b.querySelector('[data-er-code]').value.trim() : '';
        if (codeIn) {
          const pw2 = await Store.recoverWithEmailCode(codeIn);
          if (!pw2) { err.textContent = 'That reset code doesn’t match. Use the newest email, and check you typed it on the same device it was sent for.'; return false; }
          b.dataset.pw = pw2; b.dataset.via = 'email'; return true;
        }
        if (!questions && !hasCode) { err.textContent = 'Tap “Email me a reset code”, then type the code from the email.'; return false; }
        const pw = questions ? await Store.recoverWithAnswers(questions.map((_, i) => b.querySelector(`[data-ans="${i}"]`).value)) : await Store.recoverPassword(b.querySelector('[data-code]').value);
        if (!pw) { err.textContent = questions ? 'Not quite — at least two answers need to match what you saved. Spelling counts, capitals don’t.' : 'That code doesn’t match.'; return false; }
        b.dataset.pw = pw; return true;
      }, value: (b) => ({ pw: b.dataset.pw, via: b.dataset.via || '' }) }] : [])
    ] });
    if (res === 'erase') {
      if (!(await U.confirm('Erase & start over', 'This erases everything this app stored in this browser so you can start fresh, then restore a backup or turn on sync. It cannot be undone.', 'Erase all data', true))) return;
      await Store.wipe(); location.reload(); return;
    }
    if (!res || !res.pw) return;
    const nb = document.createElement('div');
    nb.innerHTML = `<p style="margin-top:0">✓ ${res.via === 'email' ? 'Reset code accepted' : 'Answers accepted'}. Choose a new password (at least 8 characters).</p>
      <label class="field"><span>New password</span><input type="password" data-n1 autocomplete="new-password"></label>
      <label class="field"><span>Confirm new password</span><input type="password" data-n2 autocomplete="new-password"></label>
      <label class="field"><span>Password hint (optional — a reminder only you understand, never the password itself)</span><input data-hint maxlength="120" value="${esc(hint)}"></label>
      <p class="lock-error" data-err></p>`;
    const np = await U.modal({ title: 'Set a new password', body: nb, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, {
      label: 'Save new password', cls: 'btn-primary',
      validate: (b) => { const a = b.querySelector('[data-n1]').value, c = b.querySelector('[data-n2]').value, h = b.querySelector('[data-hint]').value, err = b.querySelector('[data-err]'); if (a.length < 8) { err.textContent = 'Use at least 8 characters.'; return false; } if (a !== c) { err.textContent = 'Passwords don’t match.'; return false; } if (h && h.toLowerCase().includes(a.toLowerCase())) { err.textContent = 'The hint can’t contain the password.'; return false; } return true; },
      value: (b) => ({ nw: b.querySelector('[data-n1]').value, hint: b.querySelector('[data-hint]').value.trim() })
    }] });
    if (!np) return;
    $('#lockError').textContent = 'Resetting password…';
    try {
      if (!(await Store.changePassword(res.pw, np.nw))) throw new Error('reset failed');
      await Store.setHint(np.hint);
      recoveredFrom = res.pw; recoveredVia = res.via || '';
      $('#lockPass').value = np.nw;
      onLockSubmit(new Event('submit'));
    } catch (e) { $('#lockError').textContent = 'Could not reset: ' + e.message; }
  }
  async function setupRecoveryFromSettings() {
    const pw = await U.prompt('Password reset questions', 'Your app password', { type: 'password', okLabel: 'Continue' });
    if (!pw) return;
    if (!(await Store.verify(pw))) { U.toast('That isn’t your app password.', 'err'); return; }
    await setupQuestionsNow(pw, { current: await Store.getQuestions() });
    renderRecoverySettings();
  }
  async function renderRecoverySettings() {
    const qs = await Store.getQuestions().catch(() => null);
    $('#recStatus').innerHTML = qs ? `✓ Reset questions are set:<br>${qs.map((q) => '• ' + esc(q)).join('<br>')}` : '<b class="neg">Not set up yet</b> — if you forget your password, your data can’t be unlocked. Set up your questions now.';
    $('#btnRecNew').textContent = qs ? 'Change questions' : 'Set up reset questions';
    $('#setHint').value = await Store.getHint();
  }

  /* =========================================================
     BOOT
     ========================================================= */
  document.addEventListener('DOMContentLoaded', async () => {
    setupInventory(); setupOrders(); setupExpenses(); setupSettings(); setupPlatforms(); setupActions(); setupMileage(); setupPlanSettings(); setupSyncSettings();
    $('#btnScan').onclick = () => Labels.scan(openItemFromCode);
    setupResizable($('#invWrap'), 'inv', { rows: true });
    setupResizable($('#ordTable').closest('.table-wrap'), 'ord', { rows: true });
    setupResizable($('#expTable').closest('.table-wrap'), 'exp');
    // never let a stray dropped file navigate away from the app
    window.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', (e) => { if (!e.defaultPrevented) { e.preventDefault(); if (Store.unlocked && e.dataTransfer && e.dataTransfer.files.length) U.toast('Drop the image onto an item row (or its photo box).'); } });

    $$('.tab').forEach((t) => (t.onclick = () => showView(t.dataset.view)));
    $('#dashRange').onchange = renderDashboard;
    $('#repPreset').onchange = renderReport;
    ['#repFrom', '#repTo'].forEach((s) => $(s).addEventListener('change', () => { $('#repPreset').value = ''; renderReport(); }));
    document.addEventListener('click', (e) => {
      const g = e.target.closest('[data-goto]'); if (g) { showView(g.dataset.goto); return; }
      const gf = e.target.closest('[data-goto-filter]');
      if (gf) { $('#btnClearFilters').click(); $('#fAge').value = gf.dataset.gotoFilter; showView('inventory'); return; }
      const gi = e.target.closest('[data-goto-item]');
      if (gi) { $('#btnClearFilters').click(); showView('inventory'); flashRow(gi.dataset.gotoItem); }
      const sh = e.target.closest('[data-sheet]');
      if (sh) openItemSheet(sh.dataset.sheet);
    });

    ['#btnExportJson', '#btnExportJson2'].forEach((s) => ($(s).onclick = exportJSON));
    ['#btnImportJson', '#btnImportJson2', '#btnImportOther', '#btnImportOther2'].forEach((s) => ($(s).onclick = () => $('#importJsonInput').click()));
    $('#importJsonInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importJSON(f); };
    ['#btnExportXlsx', '#btnExportXlsx2'].forEach((s) => ($(s).onclick = exportExcel));
    $('#btnPdfMonth').onclick = async () => {
      const to = $('#repTo').value || U.todayISO();
      const v = await U.prompt('Monthly profit summary (PDF)', 'Which month? (YYYY-MM)', { type: 'month', value: to.slice(0, 7), placeholder: 'YYYY-MM', okLabel: 'Create PDF' });
      if (!v) return;
      if (!/^\d{4}-\d{2}$/.test(v.trim())) { U.toast('Type the month as YYYY-MM, e.g. 2026-11', 'err'); return; }
      Print.monthly(printCtx(), v.trim());
    };
    $('#btnPdfTax').onclick = async () => {
      const y0 = +($('#repTo').value || U.todayISO()).slice(0, 4);
      const v = await U.prompt('Tax-year summary (PDF)', 'Which year?', { value: String(y0), placeholder: 'YYYY', okLabel: 'Create PDF' });
      if (!v) return;
      if (!/^\d{4}$/.test(v.trim())) { U.toast('Type a 4-digit year', 'err'); return; }
      Print.taxYear(printCtx(), +v.trim());
    };
    $('#btnLock').onclick = async () => {
      if (lockHolds.size) {
        const what = [...new Set(lockHolds.values())].join(' and ');
        if (!(await U.confirm('Still working', `The app is busy with ${what}. Locking now will stop it partway. Lock anyway?`, 'Lock anyway', true))) return;
        lockHolds.clear();
      }
      lockApp('Locked.');
    };

    $('#lockForm').addEventListener('submit', onLockSubmit);
    $('#lockReset').onclick = () => forgotPassword();

    document.addEventListener('keydown', (e) => {
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && !inField && Store.unlocked && $('#modal').classList.contains('hidden')) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
      }
      if (e.key === '/' && !inField && Store.unlocked && currentView() === 'inventory') { e.preventDefault(); $('#invSearch').focus(); }
    });
    window.addEventListener('resize', U.debounce(() => { if (!Store.unlocked) return; if (currentView() === 'dashboard') renderDashboard(); applyHeights(); }, 200));

    /* ---------- internal API for the add-on modules (js/ext-*.js) ---------- */
    window.TA = {
      holdLock,
      state, S, saveSettings, commit, findItem, renderAll, renderView, currentView, showView, profiles, profileFor, platformLabel, platformColor,
      esc, uniq, uniqVals, statusBadge, thumbOf, skuQuery, setPhoto, removePhoto, refreshPhotoRow, itemDialog, openItemSheet, markSoldDialog, persist, myName, addActivity,
      flashRow, saving, ICON, allPlatforms, allCats, normalizeItem, normalizeTrip, blankItem, nextSku, copyText, labelCtx, printCtx, kpi, timeAgo, crossListDialog,
      numVal, dl, celebrate: (items) => celebrateSale(items), APP_VERSION, get invGrid() { return invGrid; }, get ordGrid() { return ordGrid; }, undoNow: () => undo()
    };
    if (window.Ext && Ext.init) Ext.init();
    try { const su = await Store.isSetUp(); showLock(su ? 'unlock' : 'setup'); if (su) setTimeout(resetFromHash, 200); }
    catch (e) { showLock('unlock'); $('#lockError').textContent = 'Storage unavailable: ' + e.message; }
  });
})();
