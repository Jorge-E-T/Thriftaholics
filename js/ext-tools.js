/* =========================================================
   Tools: sold-price research links, and "search everything"
   (Ctrl+K / ⌘K) for items, sales, expenses, actions, settings
   and Guide topics.
   ========================================================= */
(function () {
  'use strict';
  const X = window.Ext, esc = X.esc;
  const T = () => window.TA;

  /* ---------- price research ---------- */
  function query(it) {
    const words = []; const seen = new Set();
    [it.brand, it.name].join(' ')
      .split(/\s+/).forEach((w) => { const k = w.toLowerCase().replace(/[^a-z0-9]/g, ''); if (k && !seen.has(k)) { seen.add(k); words.push(w); } });
    return words.slice(0, 9).join(' ').trim();
  }
  const SITES = [
    { n: 'eBay', sub: 'sold', c: '#3a6ea5', u: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1` },
    { n: 'Poshmark', sub: 'sold', c: '#8c2f39', u: (q) => `https://poshmark.com/search?query=${encodeURIComponent(q)}&availability=sold_out` },
    { n: 'Mercari', sub: 'sold', c: '#7b4fa0', u: (q) => `https://www.mercari.com/search/?keyword=${encodeURIComponent(q)}&itemStatuses=2` },
    { n: 'Depop', sub: 'listed', c: '#d1492e', u: (q) => `https://www.depop.com/search/?q=${encodeURIComponent(q)}` },
    { n: 'Google', sub: 'shopping', c: '#4b8a3c', u: (q) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}` }
  ];
  X.researchLinks = (q) => SITES.map((s) => `<a class="rs-link" style="--c:${s.c}" href="${esc(s.u(q))}" target="_blank" rel="noopener noreferrer"><b>${s.n}</b><em>${s.sub}</em></a>`).join('');
  X.researchHtml = (it, compact) => {
    const q = query(it); if (!q) return '';
    return `<div class="${compact ? 'det-box' : ''} research"><div class="lst-head"><b>🔎 Research sold prices</b><span class="muted small">what similar items actually sold for</span></div>
      <div class="rs-q"><input value="${esc(q)}" data-rsq aria-label="Search words"></div><div class="rs-links" data-rsl>${X.researchLinks(q)}</div>
      <p class="small muted">Opens each site in a new tab. Sold results show real prices buyers paid — the best guide for pricing.</p></div>`;
  };
  X.on('sheetBottom', (it) => (Calc.isSold(it) ? '' : `<div class="sh-card sh-wide">${X.researchHtml(it, false)}</div>`));
  X.on('init', () => {
    document.addEventListener('input', (e) => { const q = e.target.closest('[data-rsq]'); if (!q) return; const box = q.closest('.research').querySelector('[data-rsl]'); box.innerHTML = X.researchLinks(q.value.trim()); });
  });

  /* ---------- search everything ---------- */
  const norm = (s) => String(s || '').toLowerCase();
  function actions() {
    const t = T(); const go = (v) => () => t.showView(v);
    const click = (sel) => () => { const b = document.querySelector(sel); if (b) b.click(); };
    return [
      ['＋', 'Add an item', 'inventory', () => { t.showView('inventory'); click('#btnAddItem')(); }],
      ['💸', 'Record a sale', 'sale sold', () => t.markSoldDialog([], { pick: true })],
      ['🛍️', 'New haul', 'sourcing thrift trip', () => X.haulsDialog && X.haulsDialog()],
      ['📦', 'Storage bins', 'location bin shelf', () => X.binsDialog && X.binsDialog()],
      ['🏆', 'Year in Review', 'recap wrapped summary', () => X.yearInReview && X.yearInReview()],
      ['⬇', 'Make a backup', 'export save download', click('#btnExportJson')],
      ['📊', 'Excel report', 'export workbook', click('#btnExportXlsx')],
      ['↻', 'Check for fee updates', 'platform fees', () => { t.showView('platforms'); click('#btnFeeCheck')(); }],
      ['🌙', 'Switch light / dark', 'theme dark mode', click('#btnTheme')],
      ['🧭', 'Take the tour', 'help tutorial', () => X.startTour && X.startTour(true)],
      ['🔒', 'Lock the app', 'lock password', click('#btnLock')],
      ...[['dashboard', '📈', 'Dashboard'], ['inventory', '👗', 'Inventory'], ['actions', '✅', 'Action Center'], ['orders', '💰', 'Orders & Sales'], ['platforms', '🏪', 'Platforms'], ['expenses', '🧾', 'Expenses & mileage'], ['reports', '📑', 'Reports'], ['settings', '⚙️', 'Settings'], ['guide', '📖', 'Guide']]
        .map(([v, i, n]) => [i, 'Go to ' + n, 'tab ' + v, go(v)])
    ].map(([icon, title, kw, fn]) => ({ type: 'Actions', icon, title, sub: '', hay: norm(title + ' ' + kw), fn }));
  }
  function settingsTargets() {
    return X.$$('#view-settings .card h3, #view-settings .card h3.mt').map((h) => ({ type: 'Settings', icon: '⚙️', title: h.textContent.trim(), sub: 'Settings', hay: norm(h.textContent + ' ' + (h.closest('.card').textContent || '').slice(0, 400)),
      fn: () => { T().showView('settings'); setTimeout(() => { h.scrollIntoView({ block: 'center', behavior: 'smooth' }); h.closest('.card').classList.add('flash-card'); setTimeout(() => h.closest('.card').classList.remove('flash-card'), 1600); }, 80); } }));
  }
  function guideTargets() {
    return (window.Guide && Guide.chapters || []).map((c) => ({ type: 'Guide', icon: c.icon, title: c.title, sub: 'Guide chapter', hay: norm(c.title + ' ' + c.lead + ' ' + JSON.stringify(c.blocks).replace(/<[^>]+>/g, ' ')),
      fn: () => { T().showView('guide'); setTimeout(() => { const el = document.getElementById('g-' + c.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150); } }));
  }
  function search(q) {
    const t = T(); q = norm(q).trim();
    const words = q.split(/\s+/).filter(Boolean);
    const hit = (hay) => words.every((w) => hay.includes(w));
    const out = [];
    const acts = actions(); out.push(...(q ? acts.filter((a) => hit(a.hay)) : acts.slice(0, 6)));
    if (q) {
      const items = t.state.items.filter((i) => hit(norm([i.name, i.sku, i.brand, i.category, i.size, i.color, i.location, i.source, i.notes, (i.listings || []).map((l) => l.platform).join(' ')].join(' '))))
        .sort((a, b) => Number(Calc.isSold(a)) - Number(Calc.isSold(b))).slice(0, 12);
      out.push(...items.map((i) => ({ type: Calc.isSold(i) ? 'Sales' : 'Items', thumb: t.thumbOf(i), icon: Calc.isSold(i) ? '💰' : '👗', title: i.name || 'Untitled', sub: [i.sku ? 'SKU ' + i.sku : '', Calc.isSold(i) ? `sold ${U.fmtDate(i.dateSold)} on ${t.platformLabel(i.platform) || '—'} · ${U.money(i.sellingPrice)}` : U.money(i.sellingPrice), i.location ? '📍 ' + i.location : ''].filter(Boolean).join(' · '), fn: () => t.openItemSheet(i.id) })));
      const ex = t.state.expenses.filter((e) => hit(norm([e.description, e.vendor, e.category, e.notes, e.amount].join(' ')))).slice(0, 5);
      out.push(...ex.map((e) => ({ type: 'Expenses', icon: '🧾', title: e.description || e.vendor || e.category, sub: `${U.fmtDate(e.date)} · ${e.category} · ${U.money(e.amount)}`, fn: () => t.showView('expenses') })));
      out.push(...settingsTargets().filter((s) => hit(s.hay)).slice(0, 5));
      out.push(...guideTargets().filter((g) => hit(g.hay)).slice(0, 4));
    }
    return out;
  }
  let pal = null, sel = 0, res = [];
  function draw() {
    const box = pal.querySelector('.ck-res');
    if (!res.length) { box.innerHTML = '<div class="ck-none">Nothing found. Try a name, SKU, brand, bin, expense or setting.</div>'; return; }
    let last = '';
    box.innerHTML = res.map((r, i) => { const h = r.type !== last ? `<div class="ck-grp">${r.type}</div>` : ''; last = r.type; return h + `<button type="button" class="ck-row ${i === sel ? 'on' : ''}" data-i="${i}">${r.thumb ? `<img src="${r.thumb}" alt="">` : `<span class="ck-ic">${r.icon}</span>`}<span class="ck-t"><b>${esc(r.title)}</b>${r.sub ? `<em>${esc(r.sub)}</em>` : ''}</span><span class="ck-go">↵</span></button>`; }).join('');
    const on = box.querySelector('.ck-row.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function run(i) { const r = res[i]; if (!r) return; close(); setTimeout(r.fn, 30); }
  function close() { if (pal) { pal.classList.add('out'); const p = pal; pal = null; setTimeout(() => p.remove(), 160); } }
  function open() {
    if (pal || !Store.unlocked) return;
    if (!document.getElementById('modal').classList.contains('hidden')) return;
    pal = document.createElement('div'); pal.className = 'ck';
    pal.innerHTML = `<div class="ck-box" role="dialog" aria-label="Search everything"><div class="ck-in"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input placeholder="Search items, sales, expenses, settings, help… or type a command" autocomplete="off"><kbd>Esc</kbd></div><div class="ck-res"></div>
      <div class="ck-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>`;
    document.body.appendChild(pal);
    const inp = pal.querySelector('input');
    const upd = () => { res = search(inp.value); sel = 0; draw(); };
    inp.addEventListener('input', upd);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(res.length - 1, sel + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    pal.addEventListener('click', (e) => { const r = e.target.closest('.ck-row'); if (r) run(+r.dataset.i); else if (!e.target.closest('.ck-box')) close(); });
    upd(); inp.focus();
  }
  X.openSearch = open;
  X.on('init', () => {
    X.$('#btnSearch').addEventListener('click', open);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (pal) close(); else open(); }
    });
  });
})();
