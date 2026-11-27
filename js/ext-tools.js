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
  /* Each site: which searches it supports. Only eBay, Poshmark and Mercari let a
     link filter to SOLD results (Depop, Vinted, etc. have no sold filter). */
  const E = encodeURIComponent;
  const SITES = [
    { id: 'ebay', n: 'eBay', c: '#3a6ea5', m: /ebay/i, sold: (q) => `https://www.ebay.com/sch/i.html?_nkw=${E(q)}&LH_Sold=1&LH_Complete=1`, listed: (q) => `https://www.ebay.com/sch/i.html?_nkw=${E(q)}` },
    { id: 'poshmark', n: 'Poshmark', c: '#8c2f39', m: /posh/i, sold: (q) => `https://poshmark.com/search?query=${E(q)}&availability=sold_out`, listed: (q) => `https://poshmark.com/search?query=${E(q)}&availability=available` },
    { id: 'mercari', n: 'Mercari', c: '#7b4fa0', m: /mercari/i, sold: (q) => `https://www.mercari.com/search/?keyword=${E(q)}&itemStatuses=2`, listed: (q) => `https://www.mercari.com/search/?keyword=${E(q)}&itemStatuses=1` },
    { id: 'depop', n: 'Depop', c: '#d1492e', m: /depop/i, listed: (q) => `https://www.depop.com/search/?q=${E(q)}` },
    { id: 'vinted', n: 'Vinted', c: '#0b8a8f', m: /vinted/i, listed: (q) => `https://www.vinted.com/catalog?search_text=${E(q)}` },
    { id: 'thredup', n: 'ThredUp', c: '#2f6f5e', m: /thred/i, listed: (q) => `https://www.thredup.com/women?text=${E(q)}` },
    { id: 'facebook', n: 'Facebook', c: '#1877f2', m: /facebook|fb\b|marketplace/i, listed: (q) => `https://www.facebook.com/marketplace/search/?query=${E(q)}` },
    { id: 'etsy', n: 'Etsy', c: '#d35400', m: /etsy/i, listed: (q) => `https://www.etsy.com/search?q=${E(q)}` },
    { id: 'google', n: 'Google', c: '#4b8a3c', m: /^google/i, listed: (q) => `https://www.google.com/search?tbm=shop&q=${E(q)}`, listedLabel: 'Shopping' }
  ];
  const DEFAULT_SITES = ['ebay', 'poshmark', 'mercari', 'depop', 'vinted', 'thredup', 'google'];
  X.researchSites = SITES;
  const chosen = () => { const s = T() && T().state.settings; const ids = s && Array.isArray(s.researchSites) && s.researchSites.length ? s.researchSites : DEFAULT_SITES; return SITES.filter((x) => ids.includes(x.id)); };
  // the item's own live listing on that site (so you can jump straight to it)
  const ownUrl = (it, site) => {
    const l = (it && it.listings || []).find((x) => x && x.url && site.m.test(String(x.platform || '') + ' ' + x.url) && x.status === 'active');
    return l ? l.url : '';
  };
  const a = (href, label, cls, title) => `<a class="rs-b ${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(title)}">${label}</a>`;
  X.researchLinks = (q, it) => chosen().map((s) => {
    const own = ownUrl(it, s);
    return `<div class="rs-site" style="--c:${s.c}"><b>${s.n}</b><span class="rs-bs">${
      s.sold ? a(s.sold(q), 'Sold', 'sold', `${s.n}: sold listings (real prices paid)`) : ''}${
      a(s.listed(q), s.listedLabel || 'Listed', 'listed', `${s.n}: items for sale now`)}${
      own ? a(own, '★ Ours', 'ours', `Open our own ${s.n} listing`) : ''}</span></div>`;
  }).join('');
  X.researchHtml = (it, compact) => {
    const q = query(it); if (!q) return '';
    return `<div class="${compact ? 'det-box' : ''} research" data-rsit="${esc(it.id || '')}"><div class="lst-head"><b>🔎 Research prices</b><span class="muted small">sold = what buyers paid · listed = competition now</span><button type="button" class="btn btn-ghost btn-sm rs-edit" data-rsedit title="Choose which sites show here">⚙ Sites</button></div>
      <div class="rs-q"><input value="${esc(q)}" data-rsq aria-label="Search words"></div><div class="rs-links" data-rsl>${X.researchLinks(q, it)}</div>
      <p class="small muted">Opens in a new tab. <b>Sold</b> is the best pricing guide — only eBay, Poshmark and Mercari can filter to sold items; Depop and the others show what’s listed now.${chosen().some((s) => ownUrl(it, s)) ? ' <b>★ Ours</b> opens your own listing.' : ''}</p></div>`;
  };
  const itemFor = (box) => { const id = box && box.dataset.rsit; return (id && T().findItem && T().findItem(id)) || null; };
  const repaint = () => document.querySelectorAll('.research').forEach((box) => { const q = box.querySelector('[data-rsq]'); box.querySelector('[data-rsl]').innerHTML = X.researchLinks(q.value.trim(), itemFor(box)); });
  // inline picker (a pop-up would replace the item editor when opened from there)
  function toggleSites(box) {
    const open = box.querySelector('.rs-pick');
    if (open) { open.remove(); return; }
    const cur = chosen().map((s) => s.id);
    const el = document.createElement('div'); el.className = 'rs-pick';
    el.innerHTML = `<div class="small muted">Show these sites (shared with the other phone):</div><div class="rs-opts">${SITES.map((s) => `<label class="rs-opt" style="--c:${s.c}"><input type="checkbox" value="${s.id}" ${cur.includes(s.id) ? 'checked' : ''}><b>${s.n}</b><em>${s.sold ? 'sold + listed' : (s.listedLabel ? 'shopping' : 'listed')}</em></label>`).join('')}</div>
      <div class="rs-pact"><button type="button" class="btn btn-ghost btn-sm" data-rsreset>Reset</button><button type="button" class="btn btn-primary btn-sm" data-rsdone>Done</button></div>`;
    box.querySelector('.rs-q').before(el);
  }
  function saveSites(box, reset) {
    const t = T();
    if (reset) delete t.state.settings.researchSites;
    else {
      const picked = [...box.querySelectorAll('.rs-pick input:checked')].map((x) => x.value);
      if (!picked.length) { if (U.toast) U.toast('Pick at least one site'); return false; }
      t.state.settings.researchSites = SITES.map((s) => s.id).filter((id) => picked.includes(id));
    }
    t.saveSettings(); repaint(); return true;
  }
  X.on('sheetBottom', (it) => (Calc.isSold(it) ? '' : `<div class="sh-card sh-wide">${X.researchHtml(it, false)}</div>`));
  X.on('init', () => {
    document.addEventListener('input', (e) => { const q = e.target.closest('[data-rsq]'); if (!q) return; const box = q.closest('.research'); box.querySelector('[data-rsl]').innerHTML = X.researchLinks(q.value.trim(), itemFor(box)); });
    document.addEventListener('click', (e) => {
      const box = e.target.closest('.research'); if (!box) return;
      if (e.target.closest('[data-rsedit]')) { e.preventDefault(); toggleSites(box); }
      else if (e.target.closest('[data-rsreset]')) { e.preventDefault(); saveSites(box, true); const p = box.querySelector('.rs-pick'); if (p) p.remove(); }
      else if (e.target.closest('[data-rsdone]')) { e.preventDefault(); if (saveSites(box, false)) { const p = box.querySelector('.rs-pick'); if (p) p.remove(); } }
    });
    document.addEventListener('change', (e) => { const i = e.target.closest('.rs-pick input'); if (i) { const box = i.closest('.research'); if (box.querySelectorAll('.rs-pick input:checked').length) saveSites(box, false); } });
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
      ['🖼️', 'Photos on cards (slideshow)', 'photos cards slideshow carousel fade slide hover', () => { T().showView('settings'); setTimeout(() => { const c = document.getElementById('setCardPhotos'); if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 200); }],
      ['🧾', 'Email invoices settings', 'invoice gmail email buyer receipt setup', () => { T().showView('settings'); setTimeout(() => { const c = document.getElementById('invoiceCard'); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 150); }],
      ['🆕', 'What’s new', 'update changes version release notes', () => X.whatsNew && X.whatsNew(X.changes[3].v)],
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
      const skuT = t.skuQuery ? t.skuQuery(q) : null;
      const items = t.state.items.filter((i) => skuT ? skuT(i.sku) : hit(norm([i.name, i.sku, i.brand, i.category, i.size, i.color, i.location, i.source, i.notes, (i.listings || []).map((l) => l.platform).join(' ')].join(' '))))
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
  function onKey(e) { if (pal && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
  function close() {
    document.removeEventListener('keydown', onKey, true);
    if (pal) { pal.classList.add('out'); const p = pal; pal = null; setTimeout(() => p.remove(), 160); }
  }
  function open() {
    if (pal || !Store.unlocked) return;
    if (!document.getElementById('modal').classList.contains('hidden')) return;
    pal = document.createElement('div'); pal.className = 'ck';
    pal.innerHTML = `<div class="ck-box" role="dialog" aria-label="Search everything"><div class="ck-in"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input placeholder="Search items, sales, expenses, settings, help… or type a command" autocomplete="off"><button type="button" class="ck-esc" data-ck-close title="Close (Esc)">Esc</button></div><div class="ck-res"></div>
      <div class="ck-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>`;
    document.body.appendChild(pal);
    const inp = pal.querySelector('input');
    const upd = () => { res = search(inp.value); sel = 0; draw(); };
    inp.addEventListener('input', upd);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(res.length - 1, sel + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    });
    pal.addEventListener('click', (e) => {
      if (e.target.closest('[data-ck-close]') || !e.target.closest('.ck-box')) { close(); return; }
      const r = e.target.closest('.ck-row'); if (r) { run(+r.dataset.i); return; }
      inp.focus(); // clicks on empty parts of the window keep typing in the search box
    });
    // Esc closes it wherever the focus is
    document.addEventListener('keydown', onKey, true);
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
