/* =========================================================
   Utilities: formatting, dates, DOM helpers, toasts, modal
   ========================================================= */
(function (global) {
  'use strict';

  const U = {};
  let currency = 'USD';

  U.setCurrency = (c) => { currency = c || 'USD'; moneyFmt = makeMoneyFmt(); };
  const makeMoneyFmt = () => new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let moneyFmt = makeMoneyFmt();
  const intFmt = new Intl.NumberFormat();

  const z = (n) => (Math.abs(+n) < 0.005 ? 0 : +n);
  U.money = (n) => (n === null || n === undefined || n === '' || isNaN(n)) ? '' : moneyFmt.format(z(n));
  U.money0 = (n) => moneyFmt.format(z(n || 0));
  U.int = (n) => (n === null || n === undefined || isNaN(n)) ? '' : intFmt.format(Math.round(n));
  U.pct = (n) => (n === null || n === undefined || !isFinite(n)) ? '—' : (n * 100).toFixed(1) + '%';
  U.round2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;
  U.num = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).replace(/[^0-9.\-]/g, '');
    if (s === '' || s === '-' || s === '.') return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };

  /* ---- dates (stored as YYYY-MM-DD strings, local time) ---- */
  U.todayISO = () => U.toISO(new Date());
  U.toISO = (d) => {
    if (!d) return '';
    if (typeof d === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      const p = new Date(d); if (isNaN(p)) return ''; d = p;
    }
    if (!(d instanceof Date) || isNaN(d)) return '';
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  U.parseISO = (s) => {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  U.fmtDate = (s) => {
    const d = U.parseISO(s);
    return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  };
  U.daysBetween = (a, b) => {
    const da = U.parseISO(a), db = U.parseISO(b);
    if (!da || !db) return null;
    return Math.round((db - da) / 86400000);
  };
  U.monthKey = (s) => (s || '').slice(0, 7);
  U.monthLabel = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  };
  U.rangePreset = (p) => {
    const t = new Date(); const y = t.getFullYear(); const today = U.toISO(t);
    switch (p) {
      case 'ytd': return { from: `${y}-01-01`, to: today, label: `Year to date (${y})` };
      case 'lastyear': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: `Calendar year ${y - 1}` };
      case 'month': return { from: U.toISO(new Date(y, t.getMonth(), 1)), to: today, label: t.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
      case 'q': { const q = Math.floor(t.getMonth() / 3); return { from: U.toISO(new Date(y, q * 3, 1)), to: today, label: `Q${q + 1} ${y}` }; }
      case '30': case '90': { const d = new Date(t); d.setDate(d.getDate() - (+p - 1)); return { from: U.toISO(d), to: today, label: `Last ${p} days` }; }
      default: return { from: '', to: '', label: 'All time' };
    }
  };
  U.inRange = (iso, from, to) => {
    if (!iso) return false;
    if (from && iso < from) return false;
    if (to && iso > to) return false;
    return true;
  };

  /* ---- misc ---- */
  U.uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  U.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  U.download = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  };
  U.readFile = (file, as = 'text') => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(r.error);
    if (as === 'dataURL') r.readAsDataURL(file);
    else if (as === 'buffer') r.readAsArrayBuffer(file);
    else r.readAsText(file);
  });
  U.splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  U.stamp = () => {
    const d = new Date();
    return U.toISO(d) + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  };
  U.slug = (s) => String(s || 'company').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company';

  /* ---- images: resize a picked/dropped file into a thumbnail + display copy ---- */
  U.isImageFile = (f) => !!f && (/^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|heic|avif)$/i.test(f.name || ''));
  U.processImage = async (file, { full = 1400, thumb = 240, quality = 0.84 } = {}) => {
    if (!U.isImageFile(file)) throw new Error('That file is not an image.');
    if (file.size > 25 * 1024 * 1024) throw new Error('Image is larger than 25 MB.');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This browser cannot read that image format.')); i.src = url; });
      const render = (max) => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); // flatten transparency for JPEG
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        return { data: c.toDataURL('image/jpeg', quality), w, h };
      };
      const f = render(full), t = render(thumb);
      return { full: f.data, thumb: t.data, w: f.w, h: f.h };
    } finally { URL.revokeObjectURL(url); }
  };
  U.pickFile = (accept, capture) => new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    if (capture) inp.setAttribute('capture', capture); // opens the camera on phones
    inp.onchange = () => { resolve(inp.files[0] || null); inp.remove(); };
    document.body.appendChild(inp); inp.click();
  });

  /* ---- marketplace links ---- */
  const HOSTS = [['poshmark', 'poshmark'], ['posh.mk', 'poshmark'], ['depop', 'depop'], ['ebay', 'ebay'], ['ebay.us', 'ebay'], ['mercari', 'mercari'], ['facebook', 'facebook marketplace'], ['fb.com', 'facebook marketplace'], ['vinted', 'vinted'], ['etsy', 'etsy'], ['grailed', 'grailed'], ['therealreal', 'the realreal'], ['thredup', 'thredup'], ['tradesy', 'tradesy'], ['shopify', 'shopify'], ['whatnot', 'whatnot'], ['instagram', 'instagram'], ['amazon', 'amazon'], ['amzn', 'amazon'], ['tiktok', 'tiktok shop'], ['vestiairecollective', 'vestiaire collective'], ['stockx', 'stockx'], ['offerup', 'offerup'], ['goat.com', 'goat']];
  U.normUrl = (u) => {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(javascript|data|vbscript):/i.test(u)) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    return u;
  };
  U.platformFromUrl = (u) => {
    let host = '';
    try { host = new URL(U.normUrl(u)).hostname.toLowerCase(); } catch (_) { return ''; }
    const hit = HOSTS.find(([h]) => host.includes(h));
    return hit ? hit[1] : '';
  };

  /* ---- toasts ---- */
  U.toast = (msg, kind = '', action) => {
    const box = U.$('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<span>${U.esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = () => { action.fn(); el.remove(); };
      el.appendChild(b);
    }
    box.appendChild(el);
    setTimeout(() => el.remove(), action ? 7000 : 3500);
  };

  /* ---- modal ---- */
  let modalResolve = null;
  U.modal = ({ title, body, buttons = [], onOpen, wide }) => new Promise((resolve) => {
    const m = U.$('#modal');
    U.$('#modalTitle').textContent = title;
    const bodyEl = U.$('#modalBody');
    bodyEl.innerHTML = '';
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const foot = U.$('#modalFoot');
    foot.innerHTML = '';
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn ' + (b.cls || '');
      el.textContent = b.label;
      el.onclick = async () => {
        if (b.validate) { const ok = await b.validate(bodyEl); if (!ok) return; }
        const val = b.value !== undefined ? (typeof b.value === 'function' ? b.value(bodyEl) : b.value) : true;
        close(val);
      };
      foot.appendChild(el);
    });
    U.$('.modal', m).style.width = wide === 'xl' ? 'min(1120px, 100%)' : wide ? 'min(820px, 100%)' : '';
    m.classList.remove('hidden');
    modalResolve = resolve;
    const first = U.$('input, select, textarea', bodyEl);
    // focus the first field — unless the cursor is already inside the window (autofill / fast typing)
    setTimeout(() => { if (!m.contains(document.activeElement)) (first || foot.lastElementChild)?.focus(); }, 30);
    if (onOpen) onOpen(bodyEl);
  });
  function close(val) {
    U.$('#modal').classList.add('hidden');
    const r = modalResolve; modalResolve = null;
    if (r) r(val);
  }
  U.closeModal = close;
  document.addEventListener('DOMContentLoaded', () => {
    U.$('#modalClose').onclick = () => close(null);
    U.$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') close(null); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !U.$('#modal').classList.contains('hidden')) close(null);
      if (e.key === 'Enter' && !U.$('#modal').classList.contains('hidden') && e.target.tagName === 'INPUT' && e.target.type !== 'file') {
        const primary = U.$('#modalFoot .btn-primary, #modalFoot .btn-danger');
        if (primary) { e.preventDefault(); primary.click(); }
      }
    });
  });
  U.confirm = (title, message, okLabel = 'Confirm', danger = false) => U.modal({
    title, body: `<p>${message}</p>`,
    buttons: [{ label: 'Cancel', value: false, cls: 'btn-ghost' }, { label: okLabel, value: true, cls: danger ? 'btn-danger' : 'btn-primary' }]
  }).then((v) => v === true);
  U.prompt = (title, label, { type = 'text', value = '', placeholder = '', okLabel = 'OK', list } = {}) => {
    const listId = list ? 'pl-' + Math.random().toString(36).slice(2) : '';
    const dl = list ? `<datalist id="${listId}">${list.map((o) => `<option value="${U.esc(o)}">`).join('')}</datalist>` : '';
    return U.modal({
      title,
      body: `<label class="field"><span>${U.esc(label)}</span><input id="promptIn" type="${type}" value="${U.esc(value)}" placeholder="${U.esc(placeholder)}" ${list ? `list="${listId}"` : ''}/></label>${dl}`,
      buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: okLabel, cls: 'btn-primary', value: (b) => U.$('#promptIn', b).value }]
    });
  };

  global.U = U;
})(window);
