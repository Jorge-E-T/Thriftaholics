/* =========================================================
   Photos: several per item, cover photo, reorder,
   and a simple editor (rotate, square crop, brightness, contrast)
   Cover photo is stored under the item id; extra photos under
   "<itemId>~<n>" and listed in item.photos (in order).
   ========================================================= */
(function () {
  'use strict';
  const X = window.Ext, esc = X.esc;
  const T = () => window.TA;
  const keysOf = (it) => [...(T().state.thumbs[it.id] ? [it.id] : []), ...(it.photos || []).filter((k) => T().state.thumbs[k])];
  X.photoKeys = keysOf;

  async function fullOf(key) { try { const p = await Store.getPhoto(key); if (p && p.full) return p.full; } catch (_) { /* fall back */ } const t = T().state.thumbs[key]; return t ? t.thumb : null; }
  X.photoFiles = async (it) => {
    const out = []; const keys = keysOf(it);
    for (let i = 0; i < keys.length; i++) { const d = await fullOf(keys[i]); if (d) out.push({ name: `${U.slug(it.sku || it.name || 'item')}${keys.length > 1 ? '-' + (i + 1) : ''}.jpg`, data: d }); }
    return out;
  };
  async function putKey(key, ph) {
    await Store.putPhoto(key, ph);
    T().state.thumbs[key] = { thumb: ph.thumb, w: ph.w, h: ph.h };
  }
  async function addFiles(it, files) {
    const t = T(); let cur = t.findItem(it.id); const extra = [...(cur.photos || [])];
    t.saving(1);
    try {
      for (const f of files.filter(U.isImageFile)) {
        const ph = await U.processImage(f);
        if (!t.state.thumbs[cur.id]) await putKey(cur.id, ph);
        else { const k = `${cur.id}~${U.uid().slice(0, 6)}`; await putKey(k, ph); extra.push(k); }
      }
      t.commit('items', [{ id: cur.id, after: { ...U.clone(cur), photos: extra } }], { label: 'added photos' });
      t.refreshPhotoRow(cur.id); if (window.Sync) Sync.changed();
    } catch (e) { U.toast(e.message, 'err'); } finally { t.saving(-1); }
  }
  async function swap(a, b) {
    const [pa, pb] = await Promise.all([Store.getPhoto(a), Store.getPhoto(b)]);
    const ta = T().state.thumbs[a], tb = T().state.thumbs[b];
    await putKey(a, { ...tb, full: pb ? pb.full : tb.thumb });
    await putKey(b, { ...ta, full: pa ? pa.full : ta.thumb });
  }
  async function removeKey(it, key) {
    const t = T(); const cur = t.findItem(it.id); const extra = [...(cur.photos || [])];
    if (key === cur.id) {
      if (extra.length) { const first = extra.shift(); await swap(cur.id, first); delete t.state.thumbs[first]; await Store.deletePhotos([first]); }
      else { await t.removePhoto(cur.id); return; }
    } else { extra.splice(extra.indexOf(key), 1); delete t.state.thumbs[key]; await Store.deletePhotos([key]); }
    t.commit('items', [{ id: cur.id, after: { ...U.clone(cur), photos: extra } }], { label: 'removed a photo' });
    t.refreshPhotoRow(cur.id); if (window.Sync) Sync.changed();
  }

  /* ---------- one way to add photos everywhere (drag & drop or file picker) ----------
     No photo yet → the first image becomes the cover, the rest go in the carousel.
     Already has photos → ask: add to the carousel, replace the cover, or keep things as they are. */
  async function replaceCover(it, file) {
    const t = T(); const ph = await U.processImage(file);
    await putKey(it.id, ph); t.refreshPhotoRow(it.id); if (window.Sync) Sync.changed();
  }
  async function askPhotoMode(it, files) {
    const t = T(), keys = keysOf(it), urls = files.slice(0, 6).map((f) => URL.createObjectURL(f));
    const n = files.length, many = n > 1;
    const body = `<div class="pdq">
        <div><span class="muted small">Now (${keys.length} photo${keys.length === 1 ? '' : 's'})</span><div class="pdq-row">${keys.slice(0, 4).map((k, i) => `<figure class="${i === 0 ? 'cover' : ''}"><img src="${t.state.thumbs[k].thumb}" alt="">${i === 0 ? '<span>★ Cover</span>' : ''}</figure>`).join('')}${keys.length > 4 ? `<b>+${keys.length - 4}</b>` : ''}</div></div>
        <div><span class="muted small">New (${n})</span><div class="pdq-row">${urls.map((u) => `<figure class="new"><img src="${u}" alt=""></figure>`).join('')}${n > 6 ? `<b>+${n - 6}</b>` : ''}</div></div>
      </div>
      <p class="small" style="margin:12px 0 0">“${esc(it.name || 'This item')}” already has ${keys.length === 1 ? 'a photo' : keys.length + ' photos'}. What should ${many ? 'these photos' : 'this photo'} do?</p>
      <ul class="pdq-help muted small"><li><b>Add to photos</b> keeps everything and adds ${many ? 'them' : 'it'} to the item’s photo carousel.</li><li><b>Replace cover</b> swaps the main photo for ${many ? 'the first new one (the rest are added)' : 'the new one'}; the old cover is deleted.</li><li><b>Keep current</b> changes nothing.</li></ul>`;
    const r = await U.modal({ title: '📷 Add photo' + (many ? 's' : ''), body, buttons: [
      { label: 'Keep current', value: null, cls: 'btn-ghost' },
      { label: '🔁 Replace cover', value: 'replace', cls: '' },
      { label: '➕ Add to photos', value: 'add', cls: 'btn-primary' }] });
    urls.forEach((u) => URL.revokeObjectURL(u));
    return r;
  }
  async function photoDrop(itOrId, files, { ask = true, mode = null } = {}) {
    const t = T(); const it = t.findItem(typeof itOrId === 'string' ? itOrId : itOrId && itOrId.id); if (!it) return false;
    files = (files || []).filter(U.isImageFile);
    if (!files.length) { U.toast('Drop an image file (JPG, PNG, WebP, HEIC…).', 'err'); return false; }
    if (!mode) mode = keysOf(it).length && ask ? await askPhotoMode(it, files) : 'add';
    if (!mode) return false;
    t.saving(1);
    try {
      if (mode === 'replace' && keysOf(it).length) {
        await replaceCover(it, files[0]);
        if (files.length > 1) await addFiles(t.findItem(it.id), files.slice(1));
        U.toast(`New cover photo for “${it.name}”${files.length > 1 ? ` (+${files.length - 1} added)` : ''}`, 'ok');
      } else {
        await addFiles(it, files);
        U.toast(`${files.length} photo${files.length === 1 ? '' : 's'} added to “${it.name}”`, 'ok');
      }
      return true;
    } catch (e) { U.toast(e.message, 'err'); return false; } finally { t.saving(-1); }
  }
  X.photoDrop = photoDrop;
  X.photoAdd = (it, files) => addFiles(it, files);
  X.photoReplaceCover = replaceCover;

  async function manager(itemId) {
    const t = T(); const it = t.findItem(itemId); if (!it) return;
    const keys = keysOf(it);
    const body = `<p class="muted small">The first photo is the <b>cover</b> — it shows in the table, gallery, labels and reports. Drag photos onto this window or use the buttons to add more.</p>
      <div class="ph-grid" data-drop>${keys.map((k, i) => `<figure class="ph-tile ${i === 0 ? 'cover' : ''}" data-k="${esc(k)}"><img src="${t.state.thumbs[k].thumb}" alt="">${i === 0 ? '<span class="ph-cv">★ Cover</span>' : ''}
        <figcaption>${i > 0 ? `<button type="button" data-pa="cover" title="Make cover">★</button>` : ''}${i > 1 ? `<button type="button" data-pa="left" title="Move left">◀</button>` : ''}${i > 0 && i < keys.length - 1 ? `<button type="button" data-pa="right" title="Move right">▶</button>` : ''}<button type="button" data-pa="edit" title="Edit: crop, rotate, brightness">✎</button><button type="button" data-pa="del" title="Delete" class="del">🗑</button></figcaption></figure>`).join('')}
        <button type="button" class="ph-add" data-pa="add"><span>＋</span>Add photos</button></div>
      <div class="btn-row mt"><button type="button" class="btn btn-sm" data-pa="camera">📷 Take photo</button>${keys.length ? '<button type="button" class="btn btn-sm" data-pa="saveall">⬇ Save all</button>' : ''}</div>`;
    const r = await U.modal({ title: `Photos — ${it.name}`, wide: true, body, buttons: [{ label: 'Done', value: null, cls: 'btn-primary' }],
      onOpen: (b) => {
        b.addEventListener('click', (e) => { const a = e.target.closest('[data-pa]'); if (!a) return; const k = (a.closest('[data-k]') || {}).dataset; U.closeModal({ a: a.dataset.pa, k: k && k.k }); });
        const z = b.querySelector('[data-drop]');
        z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('dragging'); });
        z.addEventListener('dragleave', () => z.classList.remove('dragging'));
        z.addEventListener('drop', (e) => { e.preventDefault(); U.closeModal({ a: 'files', files: [...e.dataTransfer.files] }); });
      } });
    if (!r) { t.refreshPhotoRow(itemId); return; }
    const cur = t.findItem(itemId), extra = [...(cur.photos || [])];
    if (r.a === 'add' || r.a === 'camera') { const files = await X.pickFiles('image/*', r.a === 'add', r.a === 'camera'); if (files.length) await addFiles(cur, files); }
    else if (r.a === 'files') await addFiles(cur, r.files);
    else if (r.a === 'cover') { await swap(cur.id, r.k); t.refreshPhotoRow(cur.id); if (window.Sync) Sync.changed(); U.toast('New cover photo', 'ok'); }
    else if (r.a === 'left' || r.a === 'right') { const i = extra.indexOf(r.k), j = i + (r.a === 'left' ? -1 : 1); if (i >= 0 && j >= 0 && j < extra.length) { [extra[i], extra[j]] = [extra[j], extra[i]]; t.commit('items', [{ id: cur.id, after: { ...U.clone(cur), photos: extra } }], { label: 'reordered photos' }); } }
    else if (r.a === 'del') { if (await U.confirm('Delete photo', '<p>Delete this photo?</p>', 'Delete', true)) await removeKey(cur, r.k); }
    else if (r.a === 'edit') await editor(cur, r.k);
    else if (r.a === 'saveall') { const fs = await X.photoFiles(cur); fs.forEach((f, i) => setTimeout(() => { const a = document.createElement('a'); a.href = f.data; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }, i * 350)); }
    manager(itemId);
  }
  X.photoManager = manager;

  /* ---------- editor ---------- */
  async function editor(it, key) {
    const src = await fullOf(key); if (!src) return;
    const img = new Image(); img.src = src; await img.decode().catch(() => {});
    let rot = 0, crop = 'orig', bri = 0, con = 0;
    const body = document.createElement('div');
    body.innerHTML = `<div class="ped"><div class="ped-cv"><canvas></canvas></div>
      <div class="ped-tools">
        <div class="ped-g"><span>Rotate</span><div class="btn-row"><button type="button" class="btn btn-sm" data-e="rl">⟲ Left</button><button type="button" class="btn btn-sm" data-e="rr">⟳ Right</button></div></div>
        <div class="ped-g"><span>Shape</span><div class="seg"><button type="button" data-crop="orig" class="on">Original</button><button type="button" data-crop="sq">Square (crop)</button><button type="button" data-crop="sqfit">Square (white edges)</button></div><em class="small muted">Poshmark &amp; Depop show square photos.</em></div>
        <label class="ped-g"><span>Brightness <b data-v="bri">0</b></span><input type="range" min="-50" max="50" value="0" data-r="bri"></label>
        <label class="ped-g"><span>Contrast <b data-v="con">0</b></span><input type="range" min="-50" max="50" value="0" data-r="con"></label>
        <button type="button" class="btn btn-sm btn-ghost" data-e="auto">✨ Auto-brighten</button>
      </div></div>`;
    const cv = body.querySelector('canvas'), ctx = cv.getContext('2d');
    const draw = (maxSide = 900) => {
      const W0 = rot % 180 ? img.naturalHeight : img.naturalWidth, H0 = rot % 180 ? img.naturalWidth : img.naturalHeight;
      const side = Math.min(W0, H0), big = Math.max(W0, H0);
      const outW = crop === 'orig' ? W0 : crop === 'sq' ? side : big, outH = crop === 'orig' ? H0 : outW;
      const sc = Math.min(1, maxSide / Math.max(outW, outH));
      cv.width = Math.round(outW * sc); cv.height = Math.round(outH * sc);
      ctx.save();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.filter = `brightness(${100 + bri}%) contrast(${100 + con}%)`;
      ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(rot * Math.PI / 180); ctx.scale(sc, sc);
      const dw = img.naturalWidth, dh = img.naturalHeight;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    };
    const auto = () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 64);
      const d = g.getImageData(0, 0, 64, 64).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const avg = sum / (d.length / 4); bri = Math.max(-30, Math.min(40, Math.round((150 - avg) / 2.2))); con = 8;
      body.querySelector('[data-r=bri]').value = bri; body.querySelector('[data-r=con]').value = con;
    };
    const sync = () => { body.querySelector('[data-v=bri]').textContent = bri; body.querySelector('[data-v=con]').textContent = con; body.querySelectorAll('[data-crop]').forEach((b) => b.classList.toggle('on', b.dataset.crop === crop)); draw(); };
    body.addEventListener('input', (e) => { if (e.target.dataset.r === 'bri') bri = +e.target.value; if (e.target.dataset.r === 'con') con = +e.target.value; sync(); });
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-e],[data-crop]'); if (!b) return; if (b.dataset.crop) crop = b.dataset.crop; if (b.dataset.e === 'rl') rot = (rot + 270) % 360; if (b.dataset.e === 'rr') rot = (rot + 90) % 360; if (b.dataset.e === 'auto') auto(); sync(); });
    sync();
    const ok = await U.modal({ title: 'Edit photo', wide: true, body, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'Save photo', cls: 'btn-primary', value: true }] });
    if (!ok) return;
    draw(2000);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
    const ph = await U.processImage(new File([blob], 'edited.jpg', { type: 'image/jpeg' }));
    await putKey(key, ph);
    T().refreshPhotoRow(it.id); if (window.Sync) Sync.changed();
    U.toast('Photo saved', 'ok');
  }

  /* ---------- item sheet: thumbnail strip ---------- */
  X.on('sheetTop', (it) => {
    const keys = keysOf(it); if (keys.length < 2) return '';
    return `<div class="sh-card sh-wide"><h4>Photos <span class="pill">${keys.length}</span></h4><div class="sh-strip">${keys.map((k, i) => `<img src="${T().state.thumbs[k].thumb}" data-ph="${esc(k)}" class="${i === 0 ? 'on' : ''}" alt="">`).join('')}</div></div>`;
  });
  X.on('sheetAction', (go, it) => { if (go === 'photos') { manager(it.id); return true; } return false; });

  /* ---------- item details: swipe / arrows / dots through all of an item's photos ---------- */
  X.sheetGallery = (b, itemId) => {
    const it = T().findItem(itemId); if (!it) return;
    const keys = keysOf(it); const box = b.querySelector('.sh-photo'); const main = box && box.querySelector('img');
    if (!main || keys.length < 2) return;
    let i = 0, token = 0;
    box.classList.add('sh-gal');
    box.insertAdjacentHTML('beforeend', `<button type="button" class="sg-nav sg-prev" aria-label="Previous photo">‹</button><button type="button" class="sg-nav sg-next" aria-label="Next photo">›</button>
      <div class="sg-dots">${keys.map((k, n) => `<button type="button" data-dot="${n}" class="${n === 0 ? 'on' : ''}" aria-label="Photo ${n + 1}"></button>`).join('')}</div><span class="sg-count">1 / ${keys.length}</span>`);
    const show = async (n) => {
      i = (n + keys.length) % keys.length; const my = ++token;
      main.classList.remove('sg-in'); void main.offsetWidth;
      main.src = T().state.thumbs[keys[i]].thumb; main.classList.add('sg-in');
      box.querySelectorAll('[data-dot]').forEach((d) => d.classList.toggle('on', +d.dataset.dot === i));
      box.querySelector('.sg-count').textContent = `${i + 1} / ${keys.length}`;
      b.querySelectorAll('.sh-strip img[data-ph]').forEach((im) => im.classList.toggle('on', im.dataset.ph === keys[i]));
      const full = await fullOf(keys[i]); if (my === token && full) main.src = full;
    };
    box.addEventListener('click', (e) => {
      if (e.target.closest('.sg-prev')) { e.stopPropagation(); show(i - 1); }
      else if (e.target.closest('.sg-next')) { e.stopPropagation(); show(i + 1); }
      else if (e.target.closest('[data-dot]')) { e.stopPropagation(); show(+e.target.closest('[data-dot]').dataset.dot); }
    });
    // swipe (finger or mouse drag)
    let x0 = null, y0 = 0;
    box.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; });
    box.addEventListener('pointerup', (e) => { if (x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(i + (dx < 0 ? 1 : -1)); });
    box.addEventListener('pointercancel', () => { x0 = null; });
    main.draggable = false;
    // ← → keys while the details window is open
    const onKey = (e) => {
      if (!b.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
      if (e.key === 'ArrowRight') { show(i + 1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { show(i - 1); e.preventDefault(); }
    };
    document.addEventListener('keydown', onKey);
    b.addEventListener('click', (e) => { const im = e.target.closest('.sh-strip img[data-ph]'); if (im) { e.stopPropagation(); show(keys.indexOf(im.dataset.ph)); } }, true);
  };

  /* ---------- “Photos on cards”: cover only, slideshow, or slideshow on hover ---------- */
  const CP_KEY = 'thrift-cardphotos';
  const cpDefaults = { mode: 'cover', speed: 5, fx: 'fade' };
  const cp = () => { try { return { ...cpDefaults, ...JSON.parse(localStorage.getItem(CP_KEY) || '{}') }; } catch (_) { return { ...cpDefaults }; } };
  const cpSave = (v) => { try { localStorage.setItem(CP_KEY, JSON.stringify({ ...cp(), ...v })); } catch (_) { /* ignore */ } restartSlides(); };
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = () => window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const slideState = new Map(); // row element → { i, next }
  let slideTimer = 0, lastScroll = 0, hoverRow = null;

  function swapThumb(row, key, fx) {
    const th = row.querySelector('td[data-photo] .thumb.has'); if (!th) return;
    const cur = th.querySelector('img:not(.sl-old)'); const src = (T().state.thumbs[key] || {}).thumb; if (!cur || !src || cur.getAttribute('src') === src) return;
    if (fx === 'none') { cur.src = src; return; }
    th.querySelectorAll('img.sl-old').forEach((x) => x.remove());
    const nw = document.createElement('img'); nw.src = src; nw.alt = ''; nw.draggable = false; nw.className = 'sl-new sl-' + fx;
    cur.classList.add('sl-old', 'sl-' + fx); th.appendChild(nw);
    requestAnimationFrame(() => requestAnimationFrame(() => th.classList.add('sl-go')));
    setTimeout(() => { cur.remove(); nw.classList.remove('sl-new', 'sl-' + fx); th.classList.remove('sl-go'); }, 650);
  }
  function resetRow(row) {
    const st = slideState.get(row); if (!st) return; slideState.delete(row);
    const it = T().findItem(row.dataset.id); if (it && st.i) swapThumb(row, keysOf(it)[0], cp().fx);
  }
  function tick() {
    const c = cp(); const html = document.documentElement;
    const active = c.mode !== 'cover' && !reduced() && html.classList.contains('cards-mode') && !document.hidden
      && document.getElementById('modal').classList.contains('hidden') && Date.now() - lastScroll > 900;
    if (!active) return;
    const rows = c.mode === 'hover' ? (hoverRow && hoverRow.isConnected ? [hoverRow] : []) : [...document.querySelectorAll('.view.active .grid tbody tr[data-id]')];
    const vh = window.innerHeight, now = Date.now(), period = (+c.speed || 5) * 1000;
    rows.forEach((row) => {
      const it = T().findItem(row.dataset.id); if (!it) return;
      const keys = keysOf(it); if (keys.length < 2) return;
      if (c.mode !== 'hover') { const r = row.getBoundingClientRect(); if (r.bottom < 0 || r.top > vh || r.width === 0) return; }
      let st = slideState.get(row);
      // stagger: each card starts at its own moment so they don't all change together
      if (!st) { st = { i: 0, next: now + (c.mode === 'hover' ? 700 : period * (0.35 + Math.random() * 0.9)) }; slideState.set(row, st); }
      if (now < st.next) return;
      st.i = (st.i + 1) % keys.length; st.next = now + period;
      swapThumb(row, keys[st.i], c.fx);
    });
    // forget rows the table replaced
    for (const row of slideState.keys()) if (!row.isConnected) slideState.delete(row);
  }
  function restartSlides() {
    clearInterval(slideTimer); slideTimer = 0;
    [...slideState.keys()].forEach(resetRow);
    if (cp().mode !== 'cover') slideTimer = setInterval(tick, 250);
  }
  window.addEventListener('scroll', () => { lastScroll = Date.now(); }, { capture: true, passive: true });
  document.addEventListener('mouseover', (e) => {
    if (cp().mode !== 'hover') return;
    const row = e.target.closest && e.target.closest('.cards-mode .grid tbody tr[data-id]');
    if (row === hoverRow) return;
    if (hoverRow) resetRow(hoverRow);
    hoverRow = row || null;
  });

  function renderCardPhotoSetting() {
    const anchor = document.getElementById('setSeason') || document.getElementById('setShowName');
    if (!anchor || document.getElementById('setCardPhotos')) return;
    const c = cp();
    const div = document.createElement('div'); div.id = 'setCardPhotos'; div.className = 'cp-set';
    const seg = (name, opts, val) => `<div class="seg" data-cp="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(val) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    div.innerHTML = `<b>🖼️ Photos on cards</b> <span class="muted small">(this device · Cards and Gallery views, items with 2+ photos)</span>
      ${seg('mode', [['cover', 'Cover only'], ['slideshow', 'Slideshow'], ['hover', 'On hover']], c.mode)}
      <div class="cp-more ${c.mode === 'cover' ? 'hidden' : ''}">
        <span class="small">Change every</span>${seg('speed', [[3, '3 s'], [5, '5 s'], [8, '8 s']], c.speed)}
        <span class="small">Transition</span>${seg('fx', [['fade', 'Fade'], ['slide', 'Slide'], ['none', 'None']], c.fx)}
      </div>
      <p class="muted small cp-note">${reduced() ? 'Your device is set to reduce motion, so photos stay still.' : 'Cover only keeps every card still. On hover cycles a card’s photos while the mouse is over it (computers).'}</p>`;
    anchor.closest('label').insertAdjacentElement('afterend', div);
    div.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cp] [data-v]'); if (!btn) return;
      const k = btn.closest('[data-cp]').dataset.cp; let v = btn.dataset.v; if (k === 'speed') v = +v;
      cpSave({ [k]: v });
      btn.closest('[data-cp]').querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === btn));
      if (k === 'mode') div.querySelector('.cp-more').classList.toggle('hidden', v === 'cover');
    });
  }
  X.on('view', (v) => { if (v === 'settings') setTimeout(renderCardPhotoSetting, 0); });
  X.cardPhotos = { get: cp, set: cpSave };

  X.on('init', () => {
    restartSlides();
    if (document.getElementById('view-settings') && document.getElementById('view-settings').classList.contains('active')) setTimeout(renderCardPhotoSetting, 0);
  });
})();
