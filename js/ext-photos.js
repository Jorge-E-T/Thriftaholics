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
  X.on('init', () => {
    document.addEventListener('click', async (e) => {
      const im = e.target.closest('.sh-strip img[data-ph]'); if (!im) return;
      const main = document.querySelector('#modalBody .sh-photo img'); const full = await fullOf(im.dataset.ph); if (main && full) main.src = full;
    });
  });
})();
