/* =========================================================
   Stock add-ons: hauls (sourcing trips), storage bins,
   inventory health check, daily routine, shipping packages
   ========================================================= */
(function () {
  'use strict';
  const X = window.Ext, esc = X.esc;
  const T = () => window.TA;
  const S = () => window.TA.S();
  const avail = () => T().state.items.filter((i) => !Calc.isSold(i) && !Calc.WRITE_OFF.includes((i.status || '').toLowerCase()));

  /* =====================================================
     HAULS
     ===================================================== */
  const hauls = () => (S().hauls ||= {});
  function haulStats(h) {
    const items = T().state.items.filter((i) => i.haulId === h.id);
    const sold = items.filter((i) => Calc.isSold(i));
    const net = sold.reduce((a, i) => a + Calc.net(i) - (i.shippingCost || 0) - Calc.refunded(i) - Calc.returnShip(i), 0);
    const paid = +h.total || items.reduce((a, i) => a + (+i.purchasePrice || 0), 0);
    const listValue = items.filter((i) => !Calc.isSold(i)).reduce((a, i) => a + (+i.sellingPrice || 0), 0);
    return { items, sold, net: U.round2(net), paid: U.round2(paid), profit: U.round2(net - paid), back: paid ? net / paid : null, listValue: U.round2(listValue) };
  }
  function splitCost(total, items, how) {
    const w = items.map((i) => how === 'even' ? 1 : how === 'weight' ? (parseFloat(String(i.weight || '').replace(/[^\d.]/g, '')) || 0) : (+i.sellingPrice || 0));
    const use = w.some((x) => x > 0) ? w : items.map(() => 1);
    const tot = use.reduce((a, b) => a + b, 0) || 1;
    const out = use.map((x) => U.round2(total * x / tot));
    if (out.length) out[out.length - 1] = U.round2(out[out.length - 1] + U.round2(total - out.reduce((a, b) => a + b, 0)));
    return out;
  }
  async function haulsDialog() {
    const list = Object.values(hauls()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const rows = list.map((h) => {
      const st = haulStats(h); const pct = st.back === null ? 0 : Math.min(100, Math.round(st.back * 100));
      return `<button type="button" class="haul" data-haul="${esc(h.id)}">
        <div class="h-top"><b>${esc(h.store || 'Haul')}</b><span class="muted small">${esc(U.fmtDate(h.date))}</span></div>
        <div class="h-nums"><span><em>Paid</em>${U.money(st.paid)}</span><span><em>Items</em>${st.items.length}</span><span><em>Sold</em>${st.sold.length}</span><span><em>Earned</em>${U.money(st.net)}</span><span class="${st.profit < 0 ? 'neg' : 'pos'}"><em>Profit</em>${U.money(st.profit)}</span></div>
        <div class="h-bar"><i style="width:${pct}%"></i></div><span class="small muted">${st.back === null ? '' : st.back >= 1 ? `Paid for itself — ${Math.round(st.back * 100)}% earned back 🎉` : `${pct}% of the cost earned back`}${st.listValue ? ` · ${U.money(st.listValue)} still listed` : ''}</span></button>`;
    }).join('');
    const r = await U.modal({ title: 'Hauls', wide: true, body: `<p class="muted">A haul is one sourcing trip: where you went, what you paid in total, and the items you brought home. The cost is spread across the items, and each haul shows when it has paid for itself.</p>
        <div class="hauls">${rows || X.esc('') + Dash.empty('No hauls yet', 'Start one when you get home from a thrift run.', '🛍️')}</div>`,
      buttons: [{ label: 'Close', value: null, cls: 'btn-ghost' }, { label: '+ New haul', value: 'new', cls: 'btn-primary' }],
      onOpen: (b) => b.addEventListener('click', (e) => { const h = e.target.closest('[data-haul]'); if (h) U.closeModal('open:' + h.dataset.haul); }) });
    if (r === 'new') haulEditor(null);
    else if (r && r.startsWith('open:')) haulDetail(r.slice(5));
  }
  async function haulEditor(id) {
    const t = T();
    const h = id ? { ...hauls()[id] } : { id: 'h-' + U.uid().slice(0, 8), store: '', date: U.todayISO(), total: null, split: 'price', miles: null, roundTrip: true };
    const linked = id ? t.state.items.filter((i) => i.haulId === id) : [];
    const loose = t.state.items.filter((i) => !i.haulId && !Calc.isSold(i)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 300);
    const body = document.createElement('div');
    body.innerHTML = `<div class="form-grid g3">
        <label class="field"><span>Store / source</span><input name="store" list="dlHaulSrc" value="${esc(h.store)}" placeholder="e.g. Goodwill Main St"></label>
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(h.date)}"></label>
        <label class="field"><span>Total paid (receipt total)</span><input name="total" inputmode="decimal" value="${h.total ?? ''}" placeholder="0.00"></label>
        ${id ? '' : `<label class="field"><span>Miles driven (optional)</span><input name="miles" inputmode="decimal" placeholder="logs a mileage trip"></label>
        <label class="check"><input type="checkbox" name="roundTrip" checked> Round trip</label>`}
        <label class="field"><span>Spread the cost</span><select name="split"><option value="price">By list price (pricier items carry more cost)</option><option value="even">Evenly</option><option value="weight">By weight</option></select></label>
      </div>
      <div class="det-box"><div class="lst-head"><b>New items from this haul</b><span class="muted small">one row each — you can fill in the rest later</span></div>
        <div class="qa-rows" data-rows></div><button type="button" class="btn btn-sm" data-add-row>+ Another item</button></div>
      ${loose.length ? `<details class="det-box"><summary><b>Add items already in your inventory</b> <span class="muted small">(${linked.length} linked)</span></summary>
        <input type="search" placeholder="Filter…" data-lf class="mt-s"><div class="loose">${[...linked, ...loose].map((i) => `<label class="check" data-ln="${esc((i.name + ' ' + (i.sku || '')).toLowerCase())}"><input type="checkbox" value="${esc(i.id)}" ${i.haulId === id && id ? 'checked' : ''}> ${esc(i.name)} <span class="muted small">${i.sku ? 'SKU ' + esc(i.sku) + ' · ' : ''}${U.money(i.sellingPrice)}</span></label>`).join('')}</div></details>` : ''}
      <div class="bundle-prev" data-prev></div>
      ${t.dl('dlHaulSrc', t.uniqVals('source'))}${t.dl('dlHaulCat', t.allCats())}`;
    body.querySelector('[name=split]').value = h.split || 'price';
    const rows = body.querySelector('[data-rows]');
    const addRow = () => { const d = document.createElement('div'); d.className = 'qa-row'; d.innerHTML = '<input placeholder="Item name" data-q="name"><input placeholder="Category" list="dlHaulCat" data-q="category"><input placeholder="Size" data-q="size"><input placeholder="List price" inputmode="decimal" data-q="price"><button type="button" class="btn btn-sm btn-ghost" data-del-row title="Remove">✕</button>'; rows.appendChild(d); };
    if (!id) { addRow(); addRow(); addRow(); }
    const f = (n) => body.querySelector(`[name=${n}]`);
    const gather = () => {
      const newRows = [...rows.querySelectorAll('.qa-row')].map((r) => ({ name: r.querySelector('[data-q=name]').value.trim(), category: r.querySelector('[data-q=category]').value.trim().toLowerCase(), size: r.querySelector('[data-q=size]').value.trim(), sellingPrice: U.num(r.querySelector('[data-q=price]').value) })).filter((r) => r.name);
      const picked = [...body.querySelectorAll('.loose input:checked')].map((c) => t.findItem(c.value)).filter(Boolean);
      return { newRows, picked };
    };
    const prev = () => {
      const { newRows, picked } = gather(); const all = [...picked, ...newRows];
      const total = U.num(f('total').value) || 0;
      const shares = splitCost(total, all, f('split').value);
      body.querySelector('[data-prev]').innerHTML = all.length && total ? `<table class="mini-t"><tr><th>Item</th><th class="n">List price</th><th class="n">Cost share</th></tr>${all.map((i, k) => `<tr><td>${esc(i.name)}</td><td class="n">${i.sellingPrice != null ? U.money(i.sellingPrice) : '—'}</td><td class="n">${U.money(shares[k])}</td></tr>`).join('')}<tr class="tot"><td>${all.length} items</td><td></td><td class="n">${U.money(total)}</td></tr></table>` : `<p class="muted small">${all.length ? 'Enter the total paid to see each item’s cost.' : 'Add the items you bought.'}</p>`;
    };
    body.addEventListener('input', (e) => { if (e.target.matches('[data-lf]')) { const q = e.target.value.toLowerCase(); body.querySelectorAll('[data-ln]').forEach((l) => l.classList.toggle('hidden', !!q && !l.dataset.ln.includes(q))); return; } prev(); });
    body.addEventListener('change', prev);
    body.addEventListener('click', (e) => { if (e.target.closest('[data-add-row]')) { addRow(); rows.lastChild.querySelector('input').focus(); } const d = e.target.closest('[data-del-row]'); if (d) { d.parentElement.remove(); prev(); } });
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('.qa-row')) { e.preventDefault(); if (e.target.closest('.qa-row') === rows.lastChild) addRow(); e.target.closest('.qa-row').nextSibling.querySelector('input').focus(); } });
    prev();
    const ok = await U.modal({ title: id ? 'Edit haul' : 'New haul', wide: true, body, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: id ? 'Save haul' : 'Create haul', cls: 'btn-primary', validate: () => { const g = gather(); if (!f('store').value.trim()) { f('store').focus(); return false; } if (!g.newRows.length && !g.picked.length) { U.toast('Add at least one item', 'err'); return false; } return true; } }] });
    if (!ok) return;
    const { newRows, picked } = gather();
    Object.assign(h, { store: f('store').value.trim(), date: f('date').value || U.todayISO(), total: U.num(f('total').value), split: f('split').value });
    const all = [...picked.map((i) => ({ old: i })), ...newRows.map((r) => ({ row: r }))];
    const shares = h.total != null ? splitCost(h.total, all.map((x) => x.old || x.row), h.split) : [];
    let skuN = parseInt(t.nextSku(), 10);
    const changes = all.map((x, k) => {
      const base = x.old ? U.clone(x.old) : t.normalizeItem({ ...t.blankItem(), ...x.row, datePosted: '', sku: isNaN(skuN) ? '' : String(skuN++) });
      Object.assign(base, { haulId: h.id, source: base.source || h.store, purchaseDate: base.purchaseDate || h.date });
      if (h.total != null) base.purchasePrice = shares[k];
      return { id: base.id, after: base };
    });
    // items un-ticked from this haul are unlinked (their cost stays)
    if (id) t.state.items.filter((i) => i.haulId === id && !picked.some((p) => p.id === i.id)).forEach((i) => changes.push({ id: i.id, after: { ...U.clone(i), haulId: '' } }));
    hauls()[h.id] = h; t.saveSettings();
    t.commit('items', changes, { label: id ? `updated haul: ${h.store}` : `new haul: ${h.store}` });
    const miles = !id && U.num(f('miles') && f('miles').value);
    if (miles) { const trip = t.normalizeTrip({ date: h.date, purpose: 'Sourcing', to: h.store, miles, roundTrip: f('roundTrip').checked, notes: 'Logged with a haul' }); t.commit('mileage', [{ id: trip.id, after: trip }], { label: 'sourcing trip' }); }
    t.renderAll();
    U.toast(`${id ? 'Haul updated' : 'Haul created'} — ${all.length} item${all.length === 1 ? '' : 's'}${h.total != null ? ', cost spread ' + ({ price: 'by list price', even: 'evenly', weight: 'by weight' })[h.split] : ''}${miles ? ', trip logged' : ''}`, 'ok');
    haulDetail(h.id);
  }
  async function haulDetail(id) {
    const t = T(); const h = hauls()[id]; if (!h) return;
    const st = haulStats(h);
    const r = await U.modal({ title: `${h.store || 'Haul'} · ${U.fmtDate(h.date)}`, wide: true, body: `
      <div class="kpis kpis-sm">${[['Paid', U.money(st.paid)], ['Earned so far', U.money(st.net)], ['Profit', U.money(st.profit)], ['Sold', `${st.sold.length} of ${st.items.length}`]].map(([l, v]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div></div>`).join('')}</div>
      <div class="h-bar big"><i style="width:${Math.min(100, Math.round((st.back || 0) * 100))}%"></i></div>
      <table class="mini-t clickable"><tr><th>Item</th><th>Status</th><th class="n">Cost</th><th class="n">Price</th><th class="n">Profit</th></tr>
        ${st.items.map((i) => `<tr data-sheet="${esc(i.id)}"><td>${esc(i.name)}</td><td>${t.statusBadge(i.status)}</td><td class="n">${U.money(i.purchasePrice)}</td><td class="n">${U.money(i.sellingPrice)}</td><td class="n">${Calc.isSold(i) ? U.money(Calc.profit(i)) : '—'}</td></tr>`).join('')}</table>`,
      buttons: [{ label: 'Delete haul', value: 'del', cls: 'btn-ghost' }, { label: '← All hauls', value: 'back', cls: 'btn-ghost' }, { label: 'Edit / add items', value: 'edit', cls: 'btn-primary' }] });
    if (r === 'edit') haulEditor(id);
    else if (r === 'back') haulsDialog();
    else if (r === 'del' && await U.confirm('Delete haul', `<p>Remove the haul “${esc(h.store)}”? The items stay in your inventory with their costs; they’re just no longer grouped.</p>`, 'Delete haul', true)) {
      t.commit('items', st.items.map((i) => ({ id: i.id, after: { ...U.clone(i), haulId: '' } })), { label: 'deleted a haul' });
      delete hauls()[id]; t.saveSettings(); t.renderAll(); haulsDialog();
    }
  }
  X.on('sheetTop', (it) => {
    if (!it.haulId || !hauls()[it.haulId]) return '';
    const h = hauls()[it.haulId], st = haulStats(h);
    return `<div class="sh-card"><h4>From a haul</h4><p><b>${esc(h.store)}</b> · ${esc(U.fmtDate(h.date))}<br><span class="small muted">${st.items.length} items · paid ${U.money(st.paid)} · ${st.back === null ? '' : Math.round(st.back * 100) + '% earned back'}</span></p><button type="button" class="btn btn-sm" data-sh="haul:${esc(h.id)}">Open haul</button></div>`;
  });
  X.on('sheetAction', (go) => { if (go.startsWith('haul:')) { haulDetail(go.slice(5)); return true; } return false; });

  /* =====================================================
     BINS (storage locations)
     ===================================================== */
  function binList() {
    const m = new Map();
    T().state.items.forEach((i) => {
      const k = (i.location || '').trim(); if (!k) return;
      const r = m.get(k) || { name: k, avail: 0, sold: 0, value: 0 };
      if (Calc.isSold(i)) r.sold++; else { r.avail++; r.value += +i.sellingPrice || 0; }
      m.set(k, r);
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  function openBin(name) {
    const t = T();
    t.showView('inventory');
    const s = X.$('#invSearch'); if (s) { X.$('#btnClearFilters').click(); s.value = name; s.dispatchEvent(new Event('input', { bubbles: true })); }
    U.toast(`Showing everything in ${name}`, 'ok');
  }
  X.openBin = openBin;
  async function binsDialog() {
    const bins = binList(), t = T();
    const noBin = avail().filter((i) => !i.location).length;
    const r = await U.modal({ title: 'Storage bins', wide: true, body: `<p class="muted">Bins come from each item’s <b>Storage location</b>. Print a label for each bin — scanning its QR code lists what’s inside.</p>
      ${bins.length ? `<div class="bins">${bins.map((b) => `<div class="bin"><label class="check"><input type="checkbox" data-bin="${esc(b.name)}" checked></label><button type="button" class="bin-name" data-open="${esc(b.name)}"><b>📦 ${esc(b.name)}</b><span class="muted small">${b.avail} in stock · ${U.money(b.value)}${b.sold ? ` · ${b.sold} sold` : ''}</span></button><button type="button" class="btn btn-sm btn-ghost" data-ren="${esc(b.name)}">Rename</button></div>`).join('')}</div>` : Dash.empty('No bins yet', 'Fill in “Storage location” on your items (e.g. Bin 4, Shelf B).', '📦')}
      ${noBin ? `<p class="small muted mt">${noBin} item${noBin === 1 ? ' has' : 's have'} no location yet. Select them in Inventory → <b>Set location…</b></p>` : ''}`,
      buttons: [{ label: 'Close', value: null, cls: 'btn-ghost' }, ...(bins.length ? [{ label: 'Print bin labels', cls: 'btn-primary', value: (b) => 'print:' + JSON.stringify(X.$$('[data-bin]:checked', b).map((c) => c.dataset.bin)) }] : [])],
      onOpen: (b) => b.addEventListener('click', (e) => { const o = e.target.closest('[data-open]'); if (o) U.closeModal('open:' + o.dataset.open); const rn = e.target.closest('[data-ren]'); if (rn) U.closeModal('ren:' + rn.dataset.ren); }) });
    if (!r) return;
    if (r.startsWith('open:')) openBin(r.slice(5));
    else if (r.startsWith('print:')) printBins(JSON.parse(r.slice(6)));
    else if (r.startsWith('ren:')) {
      const old = r.slice(4); const nv = await U.prompt('Rename bin', `New name for “${old}”`, { value: old, okLabel: 'Rename' });
      if (nv && nv.trim() && nv.trim() !== old) { const ch = t.state.items.filter((i) => (i.location || '').trim() === old).map((i) => ({ id: i.id, after: { ...U.clone(i), location: nv.trim() } })); t.commit('items', ch, { label: `renamed bin ${old} → ${nv.trim()}` }); t.renderAll(); U.toast(`Renamed — ${ch.length} items updated`, 'ok'); }
      binsDialog();
    }
  }
  function printBins(names) {
    if (!names.length) return;
    const base = location.origin + location.pathname;
    const ctx = T().printCtx();
    const bins = binList().filter((b) => names.includes(b.name));
    const qr = (txt) => { const q = window.qrcode(0, 'M'); q.addData(txt); q.make(); return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }); };
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bin labels</title><style>
      @font-face { font-family: "Pacifico"; src: url(${location.origin + location.pathname.replace(/[^/]*$/, '')}fonts/pacifico.woff2) format("woff2"); }
      @page { size: letter; margin: 0.4in; } body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .g { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25in; }
      .b { border: 3px solid #164e47; border-radius: 14px; height: 3.1in; display: grid; grid-template-columns: 1fr 1.5in; align-items: center; padding: 0.25in; break-inside: avoid; position: relative; }
      .b::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: #e7b84f; border-radius: 0 0 10px 10px; }
      .n { font-size: 44pt; font-weight: 900; color: #164e47; line-height: 1; word-break: break-word; } .s { font-family: "Pacifico", cursive; color: #c9952e; font-size: 13pt; margin-top: 8px; } .c { color: #6b7672; font-size: 10pt; margin-top: 6px; }
      .q svg { width: 1.45in; height: 1.45in; }
    </style></head><body><div class="g">${bins.map((b) => `<div class="b"><div><div class="n">${esc(b.name)}</div><div class="s">${esc(ctx.company || 'Thriftaholics')}</div><div class="c">Scan to see what’s inside</div></div><div class="q">${qr(base + '#bin=' + encodeURIComponent(b.name))}</div></div>`).join('')}</div></body></html>`;
    const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(fr);
    fr.contentWindow.document.open(); fr.contentWindow.document.write(html); fr.contentWindow.document.close();
    X.lastBinHtml = html;
    setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (_) { /* ignore */ } setTimeout(() => fr.remove(), 60000); }, 600);
    U.toast(`${bins.length} bin label${bins.length === 1 ? '' : 's'} — print, or choose “Save as PDF”`, 'ok');
  }

  /* =====================================================
     INVENTORY HEALTH (top of the Action Center)
     ===================================================== */
  const CHECKS = [
    { k: 'cost', t: 'Missing cost', d: 'No purchase price — profit and taxes can’t be right.', bad: (i) => i.purchasePrice == null },
    { k: 'price', t: 'Missing price', d: 'No selling price.', bad: (i) => i.sellingPrice == null },
    { k: 'photo', t: 'No photo', d: 'Items with photos sell faster.', bad: (i) => !T().state.thumbs[i.id] },
    { k: 'size', t: 'No size', d: 'Buyers filter by size.', bad: (i) => !i.size },
    { k: 'brand', t: 'No brand', d: 'Brand is the #1 search word.', bad: (i) => !i.brand },
    { k: 'meas', t: 'No measurements', d: 'Fewer questions and returns.', bad: (i) => !i.measurements },
    { k: 'listed', t: 'Not listed anywhere', d: 'No active listing on any site.', bad: (i) => !(i.listings || []).some((l) => l.status === 'active') },
    { k: 'link', t: 'Listing without a link', d: 'Delisting is harder without the link.', bad: (i) => (i.listings || []).some((l) => l.status === 'active' && !l.url) },
    { k: 'bin', t: 'No storage location', d: 'You’ll have to hunt for it when it sells.', bad: (i) => !i.location }
  ];
  function health() {
    const items = avail();
    const res = CHECKS.map((c) => ({ ...c, items: items.filter(c.bad) }));
    const total = items.length * CHECKS.length;
    const bad = res.reduce((a, r) => a + r.items.length, 0);
    return { score: total ? Math.round((1 - bad / total) * 100) : 100, res, n: items.length };
  }
  X.health = health;
  X.on('actionsTop', () => {
    const h = health();
    if (!h.n) return '';
    const col = h.score >= 85 ? 'var(--sold)' : h.score >= 60 ? 'var(--aging)' : 'var(--stale)';
    const issues = h.res.filter((r) => r.items.length).sort((a, b) => b.items.length - a.items.length);
    return `<section class="card health-card">
      <div class="health-head">${Dash.ring(h.score / 100, col)}<div><h3>Inventory health <span class="hs" style="color:${col}">${h.score}</span><span class="muted small">/100</span></h3>
        <p class="muted small">${issues.length ? `How complete your ${h.n} unsold items are. Fix the biggest gaps first — each one opens the items that need it.` : 'Every unsold item has a cost, price, photo, details, a live listing and a home. Beautiful.'}</p></div></div>
      ${issues.length ? `<div class="health-issues">${issues.map((r) => `<button type="button" class="hi" data-health="${r.k}"><b>${r.items.length}</b><span><em>${esc(r.t)}</em>${esc(r.d)}</span></button>`).join('')}</div>` : ''}
    </section>`;
  });
  async function healthList(k) {
    const t = T(); const c = CHECKS.find((x) => x.k === k); if (!c) return;
    const items = avail().filter(c.bad);
    const r = await U.modal({ title: `${c.t} — ${items.length} item${items.length === 1 ? '' : 's'}`, wide: true, body: `<p class="muted small">${esc(c.d)} Click an item to fix it.</p>
      <div class="sku-pick">${items.map((x) => `<button type="button" class="sku-opt" data-fix="${esc(x.id)}"><span class="so-ph">${t.thumbOf(x) ? `<img src="${t.thumbOf(x)}" alt="">` : ''}</span><span class="so-t"><b>${esc(x.name || 'Untitled')}</b><em>${[x.sku ? 'SKU ' + x.sku : '', x.brand, x.size ? 'Size ' + x.size : '', x.location ? '📍 ' + x.location : ''].filter(Boolean).map(esc).join(' · ')}</em></span><span class="so-r"><b>${esc(U.money(x.sellingPrice))}</b></span></button>`).join('')}</div>`,
      buttons: [{ label: 'Close', value: null, cls: 'btn-ghost' }],
      onOpen: (b) => b.addEventListener('click', (e) => { const p = e.target.closest('[data-fix]'); if (p) U.closeModal(p.dataset.fix); }) });
    if (r) { const it = t.findItem(r); if (k === 'listed' || k === 'link') t.crossListDialog([it]); else await t.itemDialog(it); }
  }

  /* =====================================================
     DAILY ROUTINE
     ===================================================== */
  const today = () => U.todayISO();
  const doneToday = () => ((S().routineDone || {})[today()] || []);
  function streak() {
    const tasks = (S().routine || []).filter((r) => r.on); if (!tasks.length) return 0;
    const done = S().routineDone || {}; let n = 0; const d = new Date();
    const full = (iso) => tasks.every((t) => (done[iso] || []).includes(t.id));
    if (!full(U.toISO(d))) d.setDate(d.getDate() - 1);
    while (full(U.toISO(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  X.routineStreak = streak;
  X.on('actionsTop', () => {
    if (S().routineOn === false) return '';
    const tasks = (S().routine || []).filter((r) => r.on); if (!tasks.length) return '';
    const dn = doneToday(), n = tasks.filter((t) => dn.includes(t.id)).length, st = streak();
    return `<section class="card routine-card ${n === tasks.length ? 'all' : ''}">
      <div class="card-head"><h3>☀️ Today’s routine <span class="pill">${n}/${tasks.length}</span></h3><span class="small">${st ? `🔥 <b>${st}-day streak</b>` : '<span class="muted">Finish them all to start a streak</span>'} · <button type="button" class="linklike" data-goto-routine>Edit</button></span></div>
      <div class="rt-bar"><i style="width:${(n / tasks.length) * 100}%"></i></div>
      <div class="rt-list">${tasks.map((t) => `<label class="rt ${dn.includes(t.id) ? 'done' : ''}"><input type="checkbox" data-rt="${esc(t.id)}" ${dn.includes(t.id) ? 'checked' : ''}><span>${esc(t.text)}</span></label>`).join('')}</div>
    </section>`;
  });
  function toggleRoutine(id, on) {
    const d = (S().routineDone ||= {}); const k = today();
    d[k] = on ? [...new Set([...(d[k] || []), id])] : (d[k] || []).filter((x) => x !== id);
    const keys = Object.keys(d).sort(); while (keys.length > 120) delete d[keys.shift()];
    T().saveSettings();
    const tasks = (S().routine || []).filter((r) => r.on);
    if (on && tasks.every((t) => (d[k] || []).includes(t.id))) { U.toast(`Routine done! 🔥 ${streak()}-day streak`, 'ok'); X.run('routineDone'); }
    T().renderView('actions');
  }
  function renderRoutineCard() {
    const el = X.$('#routineCard'); if (!el) return;
    const r = S().routine || [];
    el.innerHTML = `<h3>Daily routine</h3><p class="muted small">A short checklist in the Action Center each day, with a streak for finishing it. Shared with everyone you sync with.</p>
      <label class="check"><input type="checkbox" data-rt-on ${S().routineOn !== false ? 'checked' : ''}> Show the routine in the Action Center</label>
      <div class="rt-edit">${r.map((t, i) => `<div class="rt-e"><input type="checkbox" data-rt-en="${i}" ${t.on ? 'checked' : ''} title="Include this task"><input data-rt-tx="${i}" value="${esc(t.text)}"><button type="button" class="btn btn-sm btn-ghost" data-rt-del="${i}" title="Remove">✕</button></div>`).join('')}</div>
      <button type="button" class="btn btn-sm" data-rt-add>+ Add a task</button>`;
  }
  /* =====================================================
     SHIPPING PACKAGES
     ===================================================== */
  function renderPkgCard() {
    const el = X.$('#pkgCard'); if (!el) return;
    const p = S().packages || [];
    el.innerHTML = `<h3>Shipping packages</h3><p class="muted small">Your usual packages and what shipping one usually costs <b>you</b>. Pick a package on each item (Edit → Package). When a sale is on a site where you pay shipping, its cost fills in automatically. Check your carrier for current rates.</p>
      <div class="pk-edit"><div class="pk-h"><span>Package</span><span>Max weight (oz)</span><span>Your cost</span><span></span></div>${p.map((x, i) => `<div class="pk-e"><input data-pk="name" data-i="${i}" value="${esc(x.name)}"><input data-pk="oz" data-i="${i}" inputmode="decimal" value="${x.oz ?? ''}"><input data-pk="cost" data-i="${i}" inputmode="decimal" value="${x.cost ?? ''}" placeholder="$"><button type="button" class="btn btn-sm btn-ghost" data-pk-del="${i}" title="Remove">✕</button></div>`).join('')}</div>
      <button type="button" class="btn btn-sm" data-pk-add>+ Add a package</button>`;
  }
  X.on('sheetTop', (it) => {
    const pk = (S().packages || []).find((p) => p.id === it.pkg);
    if (!pk || Calc.isSold(it)) return '';
    return `<div class="sh-card"><h4>Shipping</h4><p><b>${esc(pk.name)}</b>${pk.cost != null && pk.cost !== '' ? `<br><span class="small muted">About ${U.money(pk.cost)} when you pay shipping${it.sellingPrice ? ` — keeps ${U.money(it.sellingPrice - pk.cost)} before fees` : ''}</span>` : '<br><span class="small muted">Add your usual cost in Settings → Shipping packages.</span>'}</p></div>`;
  });

  /* =====================================================
     wiring
     ===================================================== */
  X.on('init', () => {
    X.$('#btnHauls').addEventListener('click', haulsDialog);
    X.$('#btnBins').addEventListener('click', binsDialog);
    X.$('#view-actions').addEventListener('click', (e) => {
      const h = e.target.closest('[data-health]'); if (h) { healthList(h.dataset.health); return; }
      if (e.target.closest('[data-goto-routine]')) { T().showView('settings'); setTimeout(() => X.$('#routineCard').scrollIntoView({ block: 'center', behavior: 'smooth' }), 80); }
    });
    X.$('#view-actions').addEventListener('change', (e) => { const c = e.target.closest('[data-rt]'); if (c) toggleRoutine(c.dataset.rt, c.checked); });
    const rc = X.$('#routineCard');
    rc.addEventListener('change', (e) => {
      const r = S().routine || [];
      if (e.target.matches('[data-rt-on]')) S().routineOn = e.target.checked;
      else if (e.target.matches('[data-rt-en]')) r[+e.target.dataset.rtEn].on = e.target.checked;
      else if (e.target.matches('[data-rt-tx]')) r[+e.target.dataset.rtTx].text = e.target.value.trim() || r[+e.target.dataset.rtTx].text;
      else return;
      T().saveSettings();
    });
    rc.addEventListener('click', (e) => {
      const r = (S().routine ||= []);
      if (e.target.closest('[data-rt-add]')) { r.push({ id: 'rt-' + U.uid().slice(0, 6), text: 'New task', on: true }); T().saveSettings(); renderRoutineCard(); X.$$('[data-rt-tx]', rc).pop().select(); }
      const d = e.target.closest('[data-rt-del]'); if (d) { r.splice(+d.dataset.rtDel, 1); T().saveSettings(); renderRoutineCard(); }
    });
    const pc = X.$('#pkgCard');
    pc.addEventListener('change', (e) => {
      const i = e.target.dataset.i; if (i === undefined) return;
      const p = S().packages[+i], k = e.target.dataset.pk;
      p[k] = k === 'name' ? (e.target.value.trim() || p.name) : (e.target.value.trim() === '' ? null : U.num(e.target.value));
      T().saveSettings();
    });
    pc.addEventListener('click', (e) => {
      const p = (S().packages ||= []);
      if (e.target.closest('[data-pk-add]')) { p.push({ id: 'pk-' + U.uid().slice(0, 6), name: 'New package', oz: null, cost: null }); T().saveSettings(); renderPkgCard(); }
      const d = e.target.closest('[data-pk-del]'); if (d) { p.splice(+d.dataset.pkDel, 1); T().saveSettings(); renderPkgCard(); }
    });
  });
  X.on('view', (v) => { if (v === 'settings') { renderRoutineCard(); renderPkgCard(); } });
  X.haulsDialog = haulsDialog; X.binsDialog = binsDialog; X.healthList = healthList;
})();
