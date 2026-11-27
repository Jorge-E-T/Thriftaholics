/* =========================================================
   Quick add (phones & tablets)
   • A floating “＋ Add item” button, always within reach on every tab.
     It shrinks to a round “+” while you scroll down and grows back when
     you scroll up; it hides while a window is open.
   • Tapping it asks how to start: 📷 photos first · ✍️ type it in ·
     ⧉ copy an existing item.
   • Quick add is a short form (photos, name, prices, brand, size,
     category, condition, colour, SKU) with “Save & add another” for
     entering a whole haul, and “More details” to open the full editor
     with everything carried over.
   ========================================================= */
(function () {
  'use strict';
  const X = window.Ext; if (!X) return;
  const T = () => window.TA;
  const S = () => T().state.settings;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STICKY = 'thrift-quickadd';
  const sticky = () => { try { return JSON.parse(localStorage.getItem(STICKY) || '{}') || {}; } catch (_) { return {}; } };
  const saveSticky = (o) => { try { localStorage.setItem(STICKY, JSON.stringify(o)); } catch (_) {} };

  /* ---------- floating button ---------- */
  let fab = null;
  function buildFab() {
    fab = document.createElement('button');
    fab.type = 'button'; fab.id = 'fabAdd'; fab.className = 'fab-add';
    fab.setAttribute('aria-label', 'Add an item');
    fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Add item</span>';
    fab.addEventListener('click', openChooser);
    document.body.appendChild(fab);
    // shrink while scrolling down, grow back when scrolling up / near the top.
    // The app scrolls inside its lists (and the body), not the window, so listen to scrolling anywhere.
    const lastTop = new WeakMap(); let ticking = false;
    document.addEventListener('scroll', (e) => {
      const el = e.target === document ? document.scrollingElement : e.target;
      if (!el || ticking || (el.closest && el.closest('#modal, .qa-back'))) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = el.scrollTop, prev = lastTop.has(el) ? lastTop.get(el) : 0, dy = y - prev;
        if (Math.abs(dy) > 6) { fab.classList.toggle('mini', dy > 0 && y > 120); lastTop.set(el, y); }
        if (y < 60) { fab.classList.remove('mini'); lastTop.set(el, y); }
        ticking = false;
      });
    }, { passive: true, capture: true });
    // only while the app is unlocked and no window is open
    const app = document.getElementById('app'), modal = document.getElementById('modal');
    const sync = () => {
      document.body.classList.toggle('qa-app-on', !!app && !app.classList.contains('hidden'));
      document.body.classList.toggle('qa-modal-open', !!modal && !modal.classList.contains('hidden'));
    };
    const mo = new MutationObserver(sync);
    if (app) mo.observe(app, { attributes: true, attributeFilter: ['class'] });
    if (modal) mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  /* ---------- “how do you want to start?” sheet ---------- */
  function openChooser() {
    if (document.querySelector('.qa-back')) return;
    const back = document.createElement('div'); back.className = 'qa-back';
    back.innerHTML = `<div class="qa-sheet" role="dialog" aria-modal="true" aria-labelledby="qaTitle">
        <div class="qa-grab" aria-hidden="true"></div>
        <h3 id="qaTitle">Add an item</h3>
        <button type="button" class="qa-opt" data-qa="photos"><span class="qa-ic">📷</span><span><b>Start with photos</b><small>Take or choose the pictures first — quickest for listing</small></span></button>
        <button type="button" class="qa-opt" data-qa="type"><span class="qa-ic">✍️</span><span><b>Type it in</b><small>A short form with just the essentials</small></span></button>
        <button type="button" class="qa-opt" data-qa="copy"><span class="qa-ic">⧉</span><span><b>Copy an item</b><small>Start from one you already have — same brand, size, prices</small></span></button>
        <button type="button" class="btn btn-ghost qa-cancel" data-qa="cancel">Cancel</button>
      </div>`;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('in'));
    const close = () => { back.classList.remove('in'); document.removeEventListener('keydown', onKey); setTimeout(() => back.remove(), 220); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', async (e) => {
      if (e.target === back) { close(); return; }
      const b = e.target.closest('[data-qa]'); if (!b) return;
      const a = b.dataset.qa; close();
      if (a === 'photos') {
        const files = await X.pickFiles('image/*', true);
        if (files.length) quickAdd({ files });
      } else if (a === 'type') quickAdd({});
      else if (a === 'copy') { const src = await pickItem(); if (src) quickAdd({ from: src }); }
    });
    setTimeout(() => { const f = back.querySelector('.qa-opt'); if (f) f.focus(); }, 60);
  }

  /* ---------- pick an item to copy ---------- */
  async function pickItem() {
    const t = T();
    const all = [...t.state.items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const body = document.createElement('div');
    body.innerHTML = `<input class="qa-search" type="search" placeholder="Search name, brand or SKU…" aria-label="Search items" autocomplete="off">
      <div class="qa-list" role="listbox" aria-label="Items"></div><p class="small muted qa-hint">Newest first. Photos, listings and sale details are not copied.</p>`;
    const list = body.querySelector('.qa-list'), q = body.querySelector('.qa-search');
    const paint = () => {
      const s = q.value.trim().toLowerCase();
      let rows = all;
      if (s) {
        const sk = t.skuQuery ? t.skuQuery(s) : null;   // "12", "#12", "sku 12", "1*"
        rows = sk ? all.filter((i) => sk(i.sku)) : all.filter((i) => [i.name, i.brand, i.sku, i.size, i.color].some((v) => String(v || '').toLowerCase().includes(s)));
      }
      rows = rows.slice(0, 60);
      list.innerHTML = rows.length ? rows.map((i) => {
        const th = t.state.thumbs[i.id];
        const meta = [i.sku ? '#' + i.sku : '', i.brand, i.size, i.sellingPrice != null ? '$' + i.sellingPrice : ''].filter(Boolean).map(esc).join(' · ');
        return `<button type="button" class="qa-row" data-id="${esc(i.id)}" role="option">${th ? `<img src="${th.thumb}" alt="">` : '<span class="qa-noimg">👕</span>'}<span><b>${esc(i.name || 'Untitled')}</b><small>${meta}</small></span></button>`;
      }).join('') : '<p class="muted small" style="padding:12px">No items match.</p>';
    };
    paint(); q.addEventListener('input', paint);
    list.addEventListener('click', (e) => { const r = e.target.closest('.qa-row'); if (r) U.closeModal(r.dataset.id); });
    const id = await U.modal({ title: '⧉ Copy an item', body, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }] });
    return typeof id === 'string' ? t.findItem(id) : null;
  }

  /* ---------- the quick form ---------- */
  const num = (v) => { const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
  async function quickAdd({ files = [], from = null, values = null } = {}) {
    const t = T(), st = sticky();
    const cats = t.allCats ? t.allCats() : (S().categories || []);
    const conds = [...new Set([...(S().conditions || []), ...t.uniqVals('condition')])];
    const base = values || (from ? {
      name: from.name, brand: from.brand, size: from.size, color: from.color, category: from.category, condition: from.condition,
      sellingPrice: from.sellingPrice, purchasePrice: from.purchasePrice, material: from.material, source: from.source, location: from.location,
      haulId: from.haulId, purchaseDate: from.purchaseDate
    } : { category: st.category || '', condition: st.condition || '' });
    const v = { name: '', brand: '', size: '', color: '', category: '', condition: '', sellingPrice: null, purchasePrice: null, ...base };
    const sku = values && values.sku != null ? values.sku : t.nextSku();
    let shots = [...files];
    const opt = (arr, cur) => `<option value="">—</option>` + [...new Set([...arr, ...(cur && !arr.includes(cur) ? [cur] : [])])].map((x) => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const body = document.createElement('div'); body.className = 'qa-form';
    body.innerHTML = `
      <div class="qa-shots" data-shots aria-label="Photos"></div>
      ${from ? `<p class="qa-from small">Copied from <b>${esc(from.name)}</b> — change what’s different.</p>` : ''}
      <label class="field"><span>Item name *</span><input name="name" value="${esc(v.name)}" autocapitalize="words" enterkeyhint="next" required placeholder="e.g. Zara Floral Mini Dress"></label>
      <div class="qa-2">
        <label class="field"><span>Price</span><input name="sellingPrice" inputmode="decimal" value="${v.sellingPrice ?? ''}" placeholder="$0"></label>
        <label class="field"><span>Cost</span><input name="purchasePrice" inputmode="decimal" value="${v.purchasePrice ?? ''}" placeholder="$0"></label>
      </div>
      <div class="qa-2">
        <label class="field"><span>Brand</span><input name="brand" list="qaBrand" value="${esc(v.brand)}" autocapitalize="words"></label>
        <label class="field"><span>Size</span><input name="size" list="qaSize" value="${esc(v.size)}"></label>
      </div>
      <div class="qa-2">
        <label class="field"><span>Category</span><select name="category">${opt(cats, v.category)}</select></label>
        <label class="field"><span>Condition</span><select name="condition">${opt(conds, v.condition)}</select></label>
      </div>
      <div class="qa-2">
        <label class="field"><span>Color</span><input name="color" list="qaColor" value="${esc(v.color)}" autocapitalize="words"></label>
        <label class="field"><span>SKU</span><input name="sku" value="${esc(sku)}" inputmode="numeric"></label>
      </div>
      <datalist id="qaBrand">${t.uniqVals('brand').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <datalist id="qaSize">${t.uniqVals('size').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <datalist id="qaColor">${t.uniqVals('color').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
    const urls = new Map();
    const paintShots = () => {
      const box = body.querySelector('[data-shots]');
      box.innerHTML = shots.map((f, i) => { if (!urls.has(f)) urls.set(f, URL.createObjectURL(f)); return `<span class="qa-shot${i === 0 ? ' cover' : ''}"><img src="${urls.get(f)}" alt="Photo ${i + 1}">${i === 0 ? '<em>Cover</em>' : ''}<button type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">×</button></span>`; }).join('')
        + `<button type="button" class="qa-addshot" data-pick="lib"><span>＋</span>${shots.length ? 'More' : 'Photos'}</button><button type="button" class="qa-addshot" data-pick="cam"><span>📷</span>Camera</button>`;
    };
    paintShots();
    body.addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { shots.splice(+rm.dataset.rm, 1); paintShots(); return; }
      const pk = e.target.closest('[data-pick]');
      if (pk) { const fs = (await X.pickFiles('image/*', pk.dataset.pick === 'lib', pk.dataset.pick === 'cam')).filter(U.isImageFile); if (fs.length) { shots = [...shots, ...fs]; paintShots(); } }
    });
    const read = (b) => {
      const g = (n) => (b.querySelector(`[name="${n}"]`) || {}).value || '';
      return { name: g('name').trim(), brand: g('brand').trim(), size: g('size').trim(), color: g('color').trim(), category: g('category'), condition: g('condition'),
        sellingPrice: num(g('sellingPrice')), purchasePrice: num(g('purchasePrice')), sku: g('sku').trim() };
    };
    const needName = (b) => {
      const n = b.querySelector('[name="name"]');
      if (n.value.trim()) return true;
      n.classList.add('qa-err'); n.focus(); U.toast('Give the item a name', 'err'); setTimeout(() => n.classList.remove('qa-err'), 1600);
      return false;
    };
    const res = await U.modal({
      title: from ? '⧉ Copy an item' : '＋ Quick add',
      body,
      buttons: [
        { label: 'More details', cls: 'btn-ghost qa-more', value: (b) => ({ act: 'more', v: read(b) }) },
        { label: 'Save & add another', cls: 'qa-again', validate: needName, value: (b) => ({ act: 'again', v: read(b) }) },
        { label: 'Save', cls: 'btn-primary', validate: needName, value: (b) => ({ act: 'save', v: read(b) }) }
      ],
      onOpen: (b) => { if (!v.name) setTimeout(() => { const n = b.querySelector('[name="name"]'); if (n) n.focus(); }, 80); }
    });
    urls.forEach((u) => URL.revokeObjectURL(u));
    if (!res || !res.act) return;
    const extra = from ? { material: from.material || '', source: from.source || '', location: from.location || '', haulId: from.haulId || '', purchaseDate: from.purchaseDate || '' } : {};
    if (res.act === 'more') { await t.itemDialog(null, { prefill: { ...extra, ...clean(res.v) }, files: shots }); return; }
    const it = t.blankItem({ ...extra, ...clean(res.v) });
    t.commit('items', [{ id: it.id, after: it }], { label: 'add item' });
    saveSticky({ category: it.category, condition: it.condition });
    if (shots.length && X.photoDrop) await X.photoDrop(it, shots, { mode: 'add' });
    t.renderAll(); if (t.flashRow) t.flashRow(it.id);
    U.toast(`Added “${it.name}”${it.sku ? ` · SKU ${it.sku}` : ''}`, 'ok');
    if (res.act === 'again') {
      // keep what usually repeats in a haul; clear the rest
      setTimeout(() => quickAdd({ values: { category: it.category, condition: it.condition, purchasePrice: it.purchasePrice, brand: '', size: '', color: '' } }), 250);
    }
  }
  const clean = (v) => ({ ...v });   // a blank SKU stays blank (Andy can fill it in later)
  X.quickAdd = quickAdd; X.addChooser = openChooser;

  X.on('init', () => { buildFab(); });
})();
