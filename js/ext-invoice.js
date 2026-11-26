/* =========================================================
   Invoices for buyers: a branded PDF invoice for a sale (or a
   whole bundle order), sent one of two ways:
   • ✉️ Email — one tap, through a small Google Apps Script that
     runs in YOUR Google account and sends from your Gmail.
   • 📤 Share — the phone's share sheet with the PDF attached
     (always works, no setup). On a computer: download + email.
   ========================================================= */
(function () {
  'use strict';
  const X = window.Ext; if (!X) return;
  const T = () => window.TA;
  const S = () => T().S();
  const esc = (s) => U.esc(s);
  const TEAL = '#164e47', GOLD = '#c9952e', CREAM = '#f6f1e7', INK = '#1d2725', MUTED = '#6b7672';

  /* ---------- settings ---------- */
  const DEF_SUBJECT = 'Your {company} invoice {invoice}';
  const DEF_MESSAGE = 'Hi {buyer},\n\nThank you so much for your purchase! Your invoice {invoice} for {total} is attached.\n\n{thanks}\n\n{company}';
  const cfg = () => {
    const s = S();
    return {
      url: String(s.invoiceUrl || '').trim(), key: String(s.invoiceKey || '').trim(), myEmail: String(s.invoiceMyEmail || '').trim(),
      copyMe: !!s.invoiceCopyMe, ask: s.invoiceAsk !== false, subject: s.invoiceSubject || DEF_SUBJECT, message: s.invoiceMessage || DEF_MESSAGE,
      prefix: s.invoicePrefix ?? 'INV-', seq: +s.invoiceSeq || 1
    };
  };
  /* A protected copy of the Gmail link, key and email in this device's encrypted vault: if a sync or an
     old backup ever drops them from Settings, they're put back automatically. */
  let stash = null, stashLoaded = false;
  async function loadStash() {
    try { stash = await Store.getVault('invoiceStash'); } catch (_) { stash = null; }
    stashLoaded = true;
    const s = S();
    const missing = (k) => s[k] === undefined || s[k] === null || s[k] === '';
    if (stash && ((missing('invoiceUrl') && stash.url) || (missing('invoiceKey') && stash.key) || (missing('invoiceMyEmail') && stash.myEmail))) {
      if (missing('invoiceUrl') && stash.url) s.invoiceUrl = stash.url;
      if (missing('invoiceKey') && stash.key) s.invoiceKey = stash.key;
      if (missing('invoiceMyEmail') && stash.myEmail) s.invoiceMyEmail = stash.myEmail;
      T().saveSettings();
      return true;
    }
    if (!stash && (s.invoiceUrl || s.invoiceKey)) saveStash();
    return false;
  }
  function saveStash() {
    const s = S(); stash = { url: String(s.invoiceUrl || ''), key: String(s.invoiceKey || ''), myEmail: String(s.invoiceMyEmail || '') };
    Store.putVault('invoiceStash', stash).catch(() => {});
  }
  const connected = () => { const c = cfg(); return /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(c.url) && c.key.length >= 8; };
  const newKey = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join(''); };
  const okEmail = (e) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(String(e || '').trim());
  const company = () => (S().companyName || '').trim() || 'Thriftaholics';
  const nextNumber = () => { const c = cfg(); return `${c.prefix}${new Date().getFullYear()}-${String(c.seq).padStart(4, '0')}`; };

  /* ---------- the Google Apps Script (pasted into script.google.com) ---------- */
  function script(key) {
    return `/* Thriftaholics — invoice mailer
   Runs in YOUR Google account and sends invoices from your Gmail.
   It also emails password reset codes to this account (and only to it).
   Keep this private: the secret key below must match the one in
   Thriftaholics → Settings → Email invoices. */
const SECRET = '${key}';

function doPost(e) {
  let out;
  try {
    const d = JSON.parse(e.postData.contents);
    if (d && d.action === 'reset-send') return reply(resetSend(d));
    if (!d || d.key !== SECRET) throw new Error('The secret key does not match. Check Settings → Email invoices.');
    if (d.action === 'reset-register') {
      if (!/^[A-Za-z0-9]{8,40}$/.test(d.deviceId || '') || String(d.token || '').length < 24 || String(d.code || '').length < 20) throw new Error('Bad reset setup.');
      PROPS.setProperty('reset_' + d.deviceId, JSON.stringify({ code: String(d.code), token: String(d.token), name: String(d.name || 'a device').slice(0, 60), url: String(d.appUrl || '').indexOf('https://') === 0 ? String(d.appUrl).slice(0, 300) : '', at: Date.now(), sends: [] }));
      out = { ok: true, to: Session.getEffectiveUser().getEmail() };
    } else if (d.action === 'reset-status') {
      const r = JSON.parse(PROPS.getProperty('reset_' + d.deviceId) || 'null');
      out = { ok: true, registered: !!r && r.token === d.token, to: Session.getEffectiveUser().getEmail() };
    } else if (d.action === 'reset-forget') {
      PROPS.deleteProperty('reset_' + d.deviceId);
      out = { ok: true };
    } else if (d.action === 'ping') {
      out = { ok: true, account: Session.getEffectiveUser().getEmail(), quota: MailApp.getRemainingDailyQuota() };
    } else {
      const to = String(d.to || '').trim();
      if (!/^[^\\s@,;]+@[^\\s@,;]+\\.[^\\s@,;]{2,}$/.test(to)) throw new Error('That buyer email address does not look right.');
      const opts = { name: String(d.fromName || 'Thriftaholics').slice(0, 80), htmlBody: d.html || '', attachments: [] };
      if (d.pdf) opts.attachments.push(Utilities.newBlob(Utilities.base64Decode(d.pdf), 'application/pdf', d.filename || 'invoice.pdf'));
      if (d.logo) opts.inlineImages = { logo: Utilities.newBlob(Utilities.base64Decode(d.logo), 'image/png', 'logo.png') };
      if (d.bcc && d.bcc !== to) opts.bcc = d.bcc;
      if (d.replyTo) opts.replyTo = d.replyTo;
      MailApp.sendEmail(to, String(d.subject || 'Your invoice').slice(0, 250), d.text || '', opts);
      out = { ok: true, quota: MailApp.getRemainingDailyQuota() };
    }
  } catch (err) {
    out = { ok: false, error: explain(err) };
  }
  return reply(out);
}
const PROPS = PropertiesService.getScriptProperties();
function reply(out) { return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON); }

/* Password reset: emails this device's reset code to the owner of this
   Google account (never to anyone else). Asking needs the device's token,
   and is limited to 5 emails a day per device. */
function resetSend(d) {
  try {
    const r = JSON.parse(PROPS.getProperty('reset_' + String(d.deviceId || '')) || 'null');
    if (!r || !d.token || r.token !== d.token) throw new Error('This device isn’t set up for reset by email. Use your reset questions instead.');
    const now = Date.now();
    r.sends = (r.sends || []).filter(function (t) { return now - t < 86400000; });
    if (r.sends.length >= 5) throw new Error('Too many reset emails today. Use the newest email you already have, or try again tomorrow.');
    const me = Session.getEffectiveUser().getEmail();
    const link = r.url ? r.url + '#reset=' + encodeURIComponent(r.code) : '';
    const when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');
    const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1d2725">' +
      '<div style="background:#164e47;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;border-bottom:3px solid #c9952e;font-size:18px;font-weight:bold">Thriftaholics password reset</div>' +
      '<div style="border:1px solid #e7dfcf;border-top:0;border-radius:0 0 12px 12px;padding:20px 22px;line-height:1.5">' +
      '<p>Someone asked to reset the Thriftaholics password on <b>' + esc(r.name) + '</b> (' + when + ').</p>' +
      '<p>Reset code:</p><p style="font-family:Consolas,Menlo,monospace;font-size:22px;font-weight:bold;letter-spacing:1px;background:#f6f1e7;padding:12px 14px;border-radius:8px;text-align:center">' + esc(r.code) + '</p>' +
      '<p>Type it in the <b>Forgot password</b> window on ' + esc(r.name) + '.</p>' +
      (link ? '<p style="text-align:center;margin:20px 0"><a href="' + link + '" style="background:#c9952e;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px;display:inline-block">Open on ' + esc(r.name) + '</a></p><p style="color:#6b7672;font-size:13px">The button only works when opened on that same device.</p>' : '') +
      '<p style="color:#6b7672;font-size:13px">Didn’t ask for this? You can ignore it — nothing changes without the code. Don’t share the code with anyone you don’t trust: with it and the device, the app can be unlocked.</p></div></div>';
    MailApp.sendEmail(me, 'Thriftaholics password reset code', 'Reset code for ' + r.name + ': ' + r.code + '\\n\\nType it in the Forgot password window on that device.' + (link ? '\\n\\nOr open this link on that device: ' + link : '') + '\\n\\nDidn’t ask for this? Ignore it — nothing changes without the code.', { name: 'Thriftaholics', htmlBody: html });
    r.sends.push(now);
    PROPS.setProperty('reset_' + d.deviceId, JSON.stringify(r));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: explain(err) };
  }
}
function explain(err) {
  const m = String((err && err.message) || err);
  if (/permission|authoriz/i.test(m)) return 'The Gmail script isn’t allowed to send email yet. In script.google.com (signed in as the Gmail owner), run “authorize” and tick every box on Google’s permission screen. (' + m.slice(0, 120) + ')';
  return m;
}
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function doGet() {
  return ContentService.createTextOutput('Thriftaholics invoice mailer is running. Paste this page\\'s address into Thriftaholics → Settings → Email invoices.');
}

/* Run this once from the editor (▶ Run) to give the script permission to send email.
   On Google's permission screen, tick EVERY box (or "Select all") before clicking Continue. */
function authorize() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  Logger.log('Ready. Sending as ' + Session.getEffectiveUser().getEmail() + ' — ' + MailApp.getRemainingDailyQuota() + ' emails left today.');
}
`;
  }

  /* ---------- the order behind a sale ---------- */
  function orderItems(it) {
    const items = T().state.items;
    if (it.orderId) { const m = items.filter((x) => x.orderId === it.orderId); if (m.length) return m; }
    return [it];
  }
  const details = (x) => [x.brand, x.size && 'Size ' + x.size, x.condition, x.color].filter(Boolean).join(' · ');
  const fill = (tpl, v) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

  /* ---------- images ---------- */
  const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  async function squareJpeg(src, size, { circle = false, ring = false, bg = '#ffffff', png = false } = {}) {
    const img = await loadImg(src); if (!img) return null;
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
    if (!png) { g.fillStyle = bg; g.fillRect(0, 0, size, size); }
    if (circle) { g.save(); g.beginPath(); g.arc(size / 2, size / 2, size / 2 - (ring ? size * 0.05 : 0), 0, Math.PI * 2); g.closePath(); if (png) { g.fillStyle = '#fff'; g.fill(); } g.clip(); }
    const r = Math.max(size / img.width, size / img.height), w = img.width * r, h = img.height * r;
    g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    if (circle) { g.restore(); if (ring) { g.strokeStyle = GOLD; g.lineWidth = size * 0.05; g.beginPath(); g.arc(size / 2, size / 2, size / 2 - size * 0.05, 0, Math.PI * 2); g.stroke(); } }
    return c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85);
  }
  async function scriptText(text, px, color) {
    try { await Promise.race([document.fonts.load(`${px}px Pacifico`), new Promise((r) => setTimeout(r, 1200))]); } catch (_) { /* default font */ }
    const c = document.createElement('canvas'); const g = c.getContext('2d');
    const font = `${px}px Pacifico, "Brush Script MT", cursive`;
    g.font = font; const w = Math.ceil(g.measureText(text).width) + px * 0.4, h = Math.ceil(px * 1.55);
    c.width = w; c.height = h; g.font = font; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, px * 0.2, h / 2);
    return { data: c.toDataURL('image/png'), w, h };
  }
  const logoSrc = () => (T().state.logo && T().state.logo.dataURL) || 'icons/brand-mark.png';

  /* ---------- PDF ---------- */
  let jsPdfP = null;
  function loadJsPdf() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    return (jsPdfP ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/jspdf.umd.min.js'; s.onload = () => res(window.jspdf); s.onerror = () => { jsPdfP = null; rej(new Error('Could not load the PDF maker')); }; document.head.appendChild(s); }));
  }
  // the PDF's built-in fonts only know Latin letters: swap smart quotes/dashes, drop emoji
  const safe = (s) => String(s ?? '').replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[•·]/g, '·').replace(/ /g, ' ')
    .normalize('NFC').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '').replace(/\s{3,}/g, '  ').trim();

  async function buildPdf(inv) {
    const { jsPDF } = await loadJsPdf();
    const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
    const W = 612, H = 792, M = 40, R = W - M;
    const s = S();
    const [logo, name, thanksImg] = await Promise.all([
      squareJpeg(logoSrc(), 240, { circle: true, ring: true, bg: TEAL }),
      scriptText(safe(company()) || 'Thriftaholics', 64, '#ffffff'),
      scriptText('Thank you!', 56, TEAL)
    ]);
    const thumbs = await Promise.all(inv.items.map((x) => squareJpeg(T().thumbOf(x), 120, { bg: CREAM })));
    const setC = (hex, what = 'text') => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; if (what === 'text') doc.setTextColor(r, g, b); else if (what === 'fill') doc.setFillColor(r, g, b); else doc.setDrawColor(r, g, b); };
    const txt = (t, x, y, { size = 10, bold = false, color = INK, align = 'left', italic = false } = {}) => { doc.setFont('helvetica', bold ? (italic ? 'bolditalic' : 'bold') : italic ? 'italic' : 'normal'); doc.setFontSize(size); setC(color); doc.text(safe(t), x, y, { align }); };
    const label = (t, x, y, align = 'left') => { doc.setCharSpace(1.1); txt(t.toUpperCase(), x, y, { size: 7.5, bold: true, color: MUTED, align }); doc.setCharSpace(0); };

    function header() {
      setC(TEAL, 'fill'); doc.rect(0, 0, W, 118, 'F');
      setC(GOLD, 'fill'); doc.rect(0, 118, W, 3, 'F');
      if (logo) doc.addImage(logo, 'JPEG', M, 22, 74, 74);
      const nh = 40, nw = Math.min(name.w * (nh / name.h), 300);
      doc.addImage(name.data, 'PNG', M + 88, 24, nw, nw * name.h / name.w);
      if (s.tagline) txt(s.tagline, M + 92, 86, { size: 9, color: '#dfe9e6', italic: true });
      doc.setCharSpace(3); txt('INVOICE', R, 52, { size: 22, bold: true, color: GOLD, align: 'right' }); doc.setCharSpace(0);
      txt(`No. ${inv.no}`, R, 72, { size: 10, color: '#ffffff', align: 'right' });
      txt(U.fmtDate(inv.date), R, 87, { size: 10, color: '#dfe9e6', align: 'right' });
    }
    function footer(page, pages) {
      setC('#e7dfcf', 'draw'); doc.setLineWidth(0.6); doc.line(M, H - 44, R, H - 44);
      const bits = [company(), s.shopUrl ? String(s.shopUrl).replace(/^https?:\/\/(www\.)?/, '') : '', s.socialHandle].filter(Boolean).join('   ·   ');
      txt(bits, M, H - 28, { size: 8.5, color: MUTED });
      txt(`Page ${page} of ${pages}`, R, H - 28, { size: 8.5, color: MUTED, align: 'right' });
    }
    header();
    // billed to / payment
    let y = 156;
    label('Billed to', M, y);
    txt(inv.buyer.name || 'Customer', M, y + 18, { size: 13, bold: true });
    let by = y + 33;
    if (inv.buyer.email) { txt(inv.buyer.email, M, by, { size: 9.5, color: MUTED }); by += 13; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    if (inv.buyer.address) doc.splitTextToSize(safe(inv.buyer.address), 250).slice(0, 5).forEach((l) => { txt(l, M, by, { size: 9.5, color: MUTED }); by += 12.5; });
    const px = 340;
    label('Payment', px, y);
    txt('Paid in full', px, y + 18, { size: 13, bold: true, color: '#2f8a57' });
    if (inv.paidVia) txt(`via ${inv.paidVia}`, px, y + 33, { size: 9.5, color: MUTED });
    txt(`Order date: ${U.fmtDate(inv.date)}`, px, y + (inv.paidVia ? 46 : 33), { size: 9.5, color: MUTED });
    // PAID stamp
    doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.85 }));
    setC('#2f8a57', 'draw'); doc.setLineWidth(2); doc.roundedRect(R - 74, y - 10, 74, 30, 6, 6, 'S');
    doc.setCharSpace(3); txt('PAID', R - 37 + 1.5, y + 11, { size: 15, bold: true, color: '#2f8a57', align: 'center' }); doc.setCharSpace(0);
    doc.restoreGraphicsState();

    // items table
    y = Math.max(by, y + 60) + 26;
    const cols = { ph: M, item: M + 50, sku: 410, price: R };
    const tableHead = () => {
      label('Item', cols.item, y); label('SKU', cols.sku, y); label('Price', cols.price, y, 'right');
      setC(TEAL, 'draw'); doc.setLineWidth(1.4); doc.line(M, y + 7, R, y + 7); y += 14;
    };
    tableHead();
    inv.items.forEach((x, i) => {
      if (y + 48 > H - 190 && i < inv.items.length) { doc.addPage(); header(); y = 150; tableHead(); }
      const th = thumbs[i];
      if (th) doc.addImage(th, 'JPEG', cols.ph, y + 6, 38, 38); else { setC(CREAM, 'fill'); doc.roundedRect(cols.ph, y + 6, 38, 38, 4, 4, 'F'); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
      const nameLines = doc.splitTextToSize(safe(x.name || 'Item'), cols.sku - cols.item - 14).slice(0, 2);
      nameLines.forEach((l, k) => txt(l, cols.item, y + 19 + k * 12.5, { size: 10.5, bold: true }));
      const d = details(x); if (d) txt(d.length > 70 ? d.slice(0, 68) + '...' : d, cols.item, y + 19 + nameLines.length * 12.5, { size: 8.5, color: MUTED });
      txt(x.sku ? '#' + x.sku : '', cols.sku, y + 25, { size: 9.5, color: MUTED });
      txt(U.money(inv.prices[i]), cols.price, y + 25, { size: 10.5, bold: true, align: 'right' });
      y += 50; setC('#e7dfcf', 'draw'); doc.setLineWidth(0.6); doc.line(M, y, R, y);
    });

    // totals
    y += 22;
    const tx = 380;
    const row = (k, v, opt = {}) => { txt(k, tx, y, { size: 10, color: opt.color || MUTED }); txt(v, R, y, { size: 10, align: 'right', bold: !!opt.bold }); y += 17; };
    const ty0 = y;
    row(`Subtotal (${inv.items.length} item${inv.items.length === 1 ? '' : 's'})`, U.money(inv.subtotal));
    if (inv.discount) row('Discount', '-' + U.money(inv.discount));
    row('Shipping', inv.shipping ? U.money(inv.shipping) : 'Free');
    if (inv.tax) row('Sales tax', U.money(inv.tax));
    y += 4;
    setC(GOLD, 'fill'); doc.roundedRect(tx - 10, y - 14, R - tx + 20, 30, 7, 7, 'F');
    txt('Total paid', tx, y + 5, { size: 12, bold: true, color: '#ffffff' });
    txt(U.money(inv.total), R, y + 5, { size: 13, bold: true, color: '#ffffff', align: 'right' });
    // note + thank you, on the left of the totals
    let ly = ty0 - 4;
    const leftW = tx - M - 40;
    if (inv.note) {
      label('Note', M, ly); ly += 14;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.splitTextToSize(safe(inv.note), leftW).slice(0, 6).forEach((l) => { txt(l, M, ly, { size: 9.5 }); ly += 12.5; });
      ly += 8;
    }
    const tw = 120; doc.addImage(thanksImg.data, 'PNG', M - 4, ly - 6, tw, tw * thanksImg.h / thanksImg.w); ly += tw * thanksImg.h / thanksImg.w + 4;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5);
    doc.splitTextToSize(safe(s.thankYouMessage || 'Thank you for shopping secondhand!'), leftW).slice(0, 4).forEach((l) => { txt(l, M, ly, { size: 9.5, color: MUTED, italic: true }); ly += 12.5; });

    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) { doc.setPage(p); footer(p, pages); }
    doc.setProperties({ title: `Invoice ${inv.no}`, subject: `Invoice ${inv.no} — ${company()}`, author: company(), creator: 'Thriftaholics' });
    return doc.output('blob');
  }

  /* ---------- the email itself ---------- */
  function vars(inv) {
    const s = S();
    return { buyer: (inv.buyer.name || '').split(/\s+/)[0] || 'there', company: company(), invoice: inv.no, total: U.money(inv.total), items: inv.items.map((x) => x.name).join(', '), thanks: s.thankYouMessage || '', shop: s.shopUrl || '' };
  }
  function emailHtml(inv, message, withLogo) {
    const s = S();
    const rows = inv.items.map((x, i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e7dfcf"><b>${esc(x.name)}</b>${details(x) ? `<br><span style="color:${MUTED};font-size:12px">${esc(details(x))}</span>` : ''}</td><td style="padding:8px 0;border-bottom:1px solid #e7dfcf;text-align:right;white-space:nowrap"><b>${esc(U.money(inv.prices[i]))}</b></td></tr>`).join('');
    const line = (k, v) => `<tr><td style="padding:3px 0;color:${MUTED}">${k}</td><td style="padding:3px 0;text-align:right">${esc(v)}</td></tr>`;
    return `<div style="background:${CREAM};padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7dfcf">
<div style="background:${TEAL};padding:20px 24px;border-bottom:3px solid ${GOLD}"><table role="presentation" width="100%" style="border-collapse:collapse"><tr>
${withLogo ? `<td width="64" style="vertical-align:middle"><img src="cid:logo" width="56" height="56" alt="" style="display:block;border-radius:50%"></td>` : ''}
<td style="vertical-align:middle;color:#ffffff"><div style="font-size:20px;font-weight:800">${esc(company())}</div>${s.tagline ? `<div style="font-size:12px;color:#dfe9e6">${esc(s.tagline)}</div>` : ''}</td>
<td style="vertical-align:middle;text-align:right;color:${GOLD};font-weight:800;letter-spacing:2px;font-size:13px">INVOICE<div style="color:#ffffff;letter-spacing:0;font-weight:600;font-size:12px">${esc(inv.no)}</div></td></tr></table></div>
<div style="padding:22px 24px;font-size:15px;line-height:1.55">${esc(message).replace(/\n/g, '<br>')}</div>
<div style="padding:0 24px 8px"><table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px">${rows}</table>
<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;margin-top:8px">${line('Subtotal', U.money(inv.subtotal))}${inv.discount ? line('Discount', '-' + U.money(inv.discount)) : ''}${line('Shipping', inv.shipping ? U.money(inv.shipping) : 'Free')}${inv.tax ? line('Sales tax', U.money(inv.tax)) : ''}
<tr><td style="padding:10px 0 4px;font-weight:800;font-size:16px">Total paid</td><td style="padding:10px 0 4px;text-align:right;font-weight:800;font-size:16px;color:${GOLD}">${esc(U.money(inv.total))}</td></tr></table></div>
<div style="padding:12px 24px 22px;color:${MUTED};font-size:12px">The PDF invoice is attached.${inv.paidVia ? ` Paid via ${esc(inv.paidVia)}.` : ''}${s.shopUrl ? `<br><a href="${esc(s.shopUrl)}" style="color:${TEAL};font-weight:700">Visit the shop</a>` : ''}${s.socialHandle ? ` · ${esc(s.socialHandle)}` : ''}</div>
</div></div>`;
  }
  const b64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

  async function callScript(payload, { url, key } = cfg()) {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ ...payload, key }), redirect: 'follow' });
    const t = await res.text(); let j;
    try { j = JSON.parse(t); } catch (_) { throw new Error(/<html/i.test(t) ? 'Google answered with a web page instead of the mailer. Check that the script is deployed with access set to “Anyone”, and that you copied the Web app link that ends in /exec.' : 'Unexpected answer from the Gmail script.'); }
    if (!j.ok) {
      if (/do not have permission|Required permissions|isn’t allowed to send/i.test(j.error || '')) throw new Error('Google hasn’t given the Gmail script permission to send email. Fix: open script.google.com signed in as the Gmail owner, open “Thriftaholics Invoices”, pick “authorize” and click ▶ Run, then on Google’s screen tick “Select all” (or every box) and click Continue. Then test again here.');
      throw new Error(j.error || 'The Gmail script could not send the email.');
    }
    return j;
  }
  async function sendGmail(inv, pdf) {
    const c = cfg(), v = vars(inv), message = fill(c.message, v);
    const logo = await squareJpeg(logoSrc(), 112, { circle: true, png: true });
    return callScript({
      to: inv.buyer.email.trim(), subject: fill(c.subject, v), text: message + `\n\nTotal paid: ${U.money(inv.total)}\nThe PDF invoice is attached.`,
      html: emailHtml(inv, message, !!logo), logo: logo ? logo.split(',')[1] : '', pdf: await b64(pdf), filename: fileName(inv),
      fromName: company(), bcc: c.copyMe && okEmail(c.myEmail) ? c.myEmail : '', replyTo: okEmail(c.myEmail) ? c.myEmail : ''
    });
  }
  const openGuide = () => { T().showView('guide'); setTimeout(() => { const el = document.getElementById('g-invoices'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120); };
  const fileName = (inv) => `${safe(company()).replace(/[^\w-]+/g, '-')}-Invoice-${inv.no}.pdf`.replace(/-+/g, '-');

  /* ---------- invoice dialog ---------- */
  async function invoiceDialog(itOrId) {
    const t = T(); const it = typeof itOrId === 'string' ? t.findItem(itOrId) : itOrId; if (!it) return;
    const items = orderItems(it);
    const known = items.find((x) => x.invoice && x.invoice.no) || null;
    const prev = U.clone((known && known.invoice) || {});
    const buyer = (items.find((x) => x.buyer && (x.buyer.email || x.buyer.name)) || {}).buyer || {};
    const subtotal = U.round2(items.reduce((a, x) => a + (+x.sellingPrice || 0), 0));
    const rate = +S().salesTax || 0;
    const plat = t.platformLabel(it.platform || '');
    const c = cfg(), gm = connected();
    const body = document.createElement('div'); body.className = 'inv-dlg';
    body.innerHTML = `
      ${items.length > 1 ? `<p class="muted small">This sale was part of a ${items.length}-item order — the invoice covers all of them.</p>` : ''}
      <div class="inv-items">${items.map((x) => `<div class="inv-it">${t.thumbOf(x) ? `<img src="${t.thumbOf(x)}" alt="">` : '<span class="inv-ph">🏷️</span>'}<span>${esc(x.name)}<em>${esc(details(x))}</em></span><b>${esc(U.money(x.sellingPrice))}</b></div>`).join('')}</div>
      <div class="form-grid">
        <label class="field"><span>Buyer’s name</span><input name="bName" autocomplete="off" value="${esc(buyer.name || '')}" placeholder="e.g. Maria Lopez"></label>
        <label class="field"><span>Buyer’s email ${gm ? '' : '(optional)'}</span><input name="bEmail" type="email" inputmode="email" autocomplete="off" value="${esc(buyer.email || '')}" placeholder="name@example.com"></label>
      </div>
      <label class="field"><span>Ship-to address (optional)</span><textarea name="bAddr" rows="2" placeholder="Street, city, state ZIP">${esc(buyer.address || '')}</textarea></label>
      <div class="form-grid g3">
        <label class="field"><span>Invoice number</span><input name="no" value="${esc(prev.no || nextNumber())}"></label>
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(prev.date || it.dateSold || U.todayISO())}"></label>
        <label class="field"><span>Paid via</span><input name="via" value="${esc(prev.paidVia ?? plat)}" placeholder="e.g. Cash, Venmo, Poshmark"></label>
        <label class="field"><span>Shipping the buyer paid</span><input name="ship" inputmode="decimal" value="${prev.shipping ?? ''}" placeholder="0 = free"></label>
        <label class="field"><span>Discount</span><input name="disc" inputmode="decimal" value="${prev.discount ?? ''}" placeholder="0"></label>
        <label class="field"><span>Sales tax${rate ? ` (${rate}%)` : ''}</span><input name="tax" inputmode="decimal" value="${prev.tax ?? (rate ? U.round2(subtotal * rate / 100) : '')}" placeholder="0"></label>
      </div>
      <label class="field"><span>Note on the invoice (optional)</span><input name="note" value="${esc(prev.note || '')}" placeholder="e.g. Ships Monday · Returns within 7 days"></label>
      <div class="inv-total"><span>Total paid</span><b data-total></b></div>
      <div class="inv-acts">
        <button type="button" class="btn ${gm ? 'btn-primary' : ''}" data-inv="email">✉️ Email invoice${gm ? '' : ' (set up first)'}</button>
        <button type="button" class="btn ${gm ? '' : 'btn-primary'}" data-inv="share">📤 Send / share PDF</button>
        <button type="button" class="btn btn-ghost" data-inv="pdf">⬇ Download PDF</button>
      </div>
      <p class="inv-status muted small" data-status>${gm ? `Sends from your Gmail${c.copyMe && c.myEmail ? `, with a copy to ${esc(c.myEmail)}` : ''}.` : 'One-tap email isn’t set up yet — <button type="button" class="linklike" data-inv="setup">see how</button>. “Send / share” works right away.'}${(prev.sent || []).length ? `<br>Last sent ${esc(U.fmtDate(prev.sent[prev.sent.length - 1].at.slice(0, 10)))} by ${esc(prev.sent[prev.sent.length - 1].via)}.` : ''}</p>`;
    const f = (n) => body.querySelector(`[name="${n}"]`);
    const read = () => {
      const shipping = U.round2(U.num(f('ship').value) || 0), discount = U.round2(U.num(f('disc').value) || 0), tax = U.round2(U.num(f('tax').value) || 0);
      return {
        items, prices: items.map((x) => +x.sellingPrice || 0), subtotal, shipping, discount, tax, total: U.round2(subtotal - discount + shipping + tax),
        no: f('no').value.trim() || nextNumber(), date: f('date').value || U.todayISO(), paidVia: f('via').value.trim(), note: f('note').value.trim(),
        buyer: { name: f('bName').value.trim(), email: f('bEmail').value.trim(), address: f('bAddr').value.trim() }
      };
    };
    // the PDF is made ahead of time, so "Share" can open the share sheet straight from the tap (phones require that)
    let ready = null, readyKey = '', building = null, timer = 0;
    const keyOf = (inv) => JSON.stringify({ ...inv, items: inv.items.map((x) => x.id) });
    const prebuild = () => {
      const inv = read(), k = keyOf(inv); if (k === readyKey && ready) return Promise.resolve(ready);
      const p = buildPdf(inv).then((blob) => { if (keyOf(read()) === k) { ready = new File([blob], fileName(inv), { type: 'application/pdf' }); readyKey = k; } return blob; });
      building = p; return p;
    };
    const status = (h, cls = '') => { const el = body.querySelector('[data-status]'); el.className = 'inv-status small ' + (cls || 'muted'); el.innerHTML = h; };
    const total = () => { body.querySelector('[data-total]').textContent = U.money(read().total); };
    body.addEventListener('input', () => { total(); clearTimeout(timer); timer = setTimeout(() => prebuild().catch(() => {}), 500); });
    total();
    let saved = false;
    const remember = (inv, via) => {
      const at = new Date().toISOString();
      const rec = { no: inv.no, date: inv.date, paidVia: inv.paidVia, shipping: inv.shipping, discount: inv.discount, tax: inv.tax, note: inv.note, total: inv.total, sent: [...(prev.sent || []), ...(via ? [{ at, via, to: inv.buyer.email }] : [])] };
      prev.sent = rec.sent;
      t.commit('items', items.map((x) => ({ id: x.id, after: { ...U.clone(t.findItem(x.id) || x), buyer: { ...inv.buyer }, invoice: rec } })), { label: via ? `invoice ${via}` : 'invoice', undoable: false });
      if (!saved && !known && inv.no === nextNumber()) { S().invoiceSeq = cfg().seq + 1; t.saveSettings(); }
      saved = true;
    };
    const busy = (on) => body.querySelectorAll('[data-inv]').forEach((b) => { b.disabled = on; });
    async function act(kind) {
      const inv = read();
      if (kind === 'setup') { U.closeModal(null); openGuide(); return; }
      if (kind === 'email') {
        if (!connected()) { status('One-tap email needs a one-time setup: <b>Settings → Email invoices</b> (the Guide walks you through it). Meanwhile, use <b>📤 Send / share PDF</b>.', 'warn'); return; }
        if (!okEmail(inv.buyer.email)) { status('Enter the buyer’s email address first.', 'warn'); f('bEmail').focus(); return; }
        busy(true); status('Sending from your Gmail…');
        try {
          const blob = (keyOf(inv) === readyKey && ready) || await buildPdf(inv);
          const r = await sendGmail(inv, blob);
          remember(inv, 'email');
          U.closeModal('sent');
          U.toast(`✉️ Invoice ${inv.no} emailed to ${inv.buyer.email}`, 'ok', { ms: 6000 });
          if (typeof r.quota === 'number' && r.quota < 10) setTimeout(() => U.toast(`Heads-up: Gmail allows ${r.quota} more emails today.`, 'warn'), 1500);
        } catch (e) {
          busy(false);
          status(`Couldn’t email it: ${esc(e.message || e)}<br>You can still use <b>📤 Send / share PDF</b>.`, 'bad');
        }
        return;
      }
      if (kind === 'pdf') {
        busy(true);
        try { const blob = (keyOf(inv) === readyKey && ready) || await buildPdf(inv); download(blob, fileName(inv)); remember(inv, ''); status('PDF downloaded.', 'ok'); } catch (e) { status('Couldn’t make the PDF: ' + esc(e.message || e), 'bad'); }
        busy(false); return;
      }
      if (kind === 'share') {
        const file = keyOf(inv) === readyKey ? ready : null;
        const c2 = cfg(), v = vars(inv);
        const subject = fill(c2.subject, v), text = fill(c2.message, v);
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          // copy the buyer's address so it can be pasted into the To line
          if (okEmail(inv.buyer.email)) { try { navigator.clipboard.writeText(inv.buyer.email).catch(() => {}); } catch (_) { /* ignore */ } }
          navigator.share({ files: [file], title: subject, text }).then(() => { remember(inv, 'share'); U.closeModal('sent'); U.toast(`Invoice ${inv.no} shared`, 'ok'); }).catch((e) => { if (e && e.name === 'AbortError') return; status('Sharing didn’t open — try <b>⬇ Download PDF</b>.', 'warn'); });
          if (okEmail(inv.buyer.email)) status(`📋 Buyer’s email copied — paste it into the <b>To</b> line.`, 'ok');
          return;
        }
        if (!file && navigator.canShare) {
          // not built yet (or just changed): build it, then ask for one more tap
          busy(true); status('Making the PDF…');
          try { await prebuild(); } catch (e) { busy(false); status('Couldn’t make the PDF: ' + esc(e.message || e), 'bad'); return; }
          busy(false);
          if (ready && navigator.canShare({ files: [ready] })) { status('PDF ready — tap <b>📤 Send / share PDF</b> again.', 'ok'); return; }
        }
        // computers (no file sharing): download the PDF and open a pre-filled email
        busy(true);
        try {
          const blob = ready && keyOf(inv) === readyKey ? ready : await buildPdf(inv);
          download(blob, fileName(inv));
          const mail = `mailto:${encodeURIComponent(inv.buyer.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text + '\n\n(Invoice PDF attached)')}`;
          window.location.href = mail;
          remember(inv, 'share');
          status('PDF downloaded and an email opened — attach the PDF from your Downloads folder.', 'ok');
        } catch (e) { status('Couldn’t make the PDF: ' + esc(e.message || e), 'bad'); }
        busy(false);
      }
    }
    const r = await U.modal({
      title: `🧾 Invoice — ${items.length > 1 ? items.length + ' items' : it.name}`, body, wide: true,
      buttons: [{ label: 'Close', value: null, cls: 'btn-ghost' }],
      onOpen: (b) => {
        b.addEventListener('click', (e) => { const a = e.target.closest('[data-inv]'); if (a && !a.disabled) { e.preventDefault(); act(a.dataset.inv); } });
        setTimeout(() => prebuild().catch(() => {}), 50);
      }
    });
    // keep buyer details typed in, even if nothing was sent
    if (r !== 'sent' && !saved) {
      const inv = read();
      if ((inv.buyer.name || inv.buyer.email || inv.buyer.address) && JSON.stringify(inv.buyer) !== JSON.stringify({ name: buyer.name || '', email: buyer.email || '', address: buyer.address || '' })) {
        t.commit('items', items.map((x) => ({ id: x.id, after: { ...U.clone(t.findItem(x.id) || x), buyer: { ...inv.buyer } } })), { label: 'buyer details', undoable: false });
      }
    }
    void building;
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  /* ---------- Settings card ---------- */
  function renderSettings() {
    const host = document.getElementById('pkgCard'); if (!host) return;
    let card = document.getElementById('invoiceCard');
    if (!card) { card = document.createElement('div'); card.className = 'card'; card.id = 'invoiceCard'; host.insertAdjacentElement('afterend', card); }
    const c = cfg(), on = connected();
    card.innerHTML = `
      <h3>✉️ Email invoices</h3>
      <p class="inv-conn ${on ? 'ok' : ''}">${on ? '✓ One-tap email is set up' : 'One-tap email isn’t set up yet. “Send / share PDF” works without it.'} <button type="button" class="linklike" data-invset="guide">How to set it up</button></p>
      <label class="field"><span>Gmail script link (the Web app address ending in /exec)</span><input id="invUrl" value="${esc(c.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span>Secret key (must match the one inside the script)</span><span class="inv-key"><input id="invKey" type="password" value="${esc(c.key)}" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-sm btn-ghost" data-invset="show">Show</button></span></label>
      <div class="btn-row"><button type="button" class="btn btn-sm" data-invset="copy">📋 Copy the Gmail script</button><button type="button" class="btn btn-sm" data-invset="test">✅ Test the connection</button><button type="button" class="btn btn-sm btn-ghost" data-invset="newkey">New key</button></div>
      <p class="muted small" data-invmsg></p>
      <label class="field"><span>Your email (replies go here; test emails and copies too)</span><input id="invMy" type="email" value="${esc(c.myEmail)}" placeholder="you@gmail.com"></label>
      <label class="check"><input type="checkbox" id="invCopy" ${c.copyMe ? 'checked' : ''}> Send me a copy of every invoice</label>
      <label class="check"><input type="checkbox" id="invAsk" ${c.ask ? 'checked' : ''}> After I record a sale, offer to send an invoice</label>
      <div class="form-grid">
        <label class="field"><span>Invoice number prefix</span><input id="invPrefix" value="${esc(c.prefix)}"></label>
        <label class="field"><span>Next number</span><input id="invSeq" inputmode="numeric" value="${c.seq}"></label>
      </div>
      <h3 class="mt">🔑 Password reset by email</h3>
      <p class="muted small">If someone forgets the password on this device, the lock screen can email a reset code to the Gmail account that runs the script. The reset questions and hint still work too.</p>
      <label class="check"><input type="checkbox" id="invReset" ${S().emailReset !== false ? 'checked' : ''}> Allow password reset by email</label>
      <p data-erstate class="er-state"></p>
      <div class="btn-row"><button type="button" class="btn btn-sm" data-invset="eron">🔑 Turn on now</button></div>
      <h3 class="mt">Invoice email wording</h3>
      <label class="field"><span>Email subject</span><input id="invSubject" value="${esc(c.subject)}"></label>
      <label class="field"><span>Email message</span><textarea id="invMessage" rows="6">${esc(c.message)}</textarea></label>
      <p class="muted small">Placeholders: {buyer} (first name) {company} {invoice} {total} {items} {thanks} (your thank-you message) {shop}. <button type="button" class="linklike" data-invset="reset">Reset wording</button></p>`;
    const set = (k, v) => { S()[k] = v; T().saveSettings(); if (['invoiceUrl', 'invoiceKey', 'invoiceMyEmail'].includes(k)) saveStash(); };
    const msg = (h, cls = 'muted') => { const el = card.querySelector('[data-invmsg]'); el.className = 'small ' + cls; el.innerHTML = h; };
    const conn = () => { const el = card.querySelector('.inv-conn'); const ok = connected(); el.classList.toggle('ok', ok); el.firstChild.textContent = ok ? '✓ One-tap email is set up ' : 'One-tap email isn’t set up yet. “Send / share PDF” works without it. '; if (ok && !['on', 'working'].includes(erState().st)) setErState('pending'); else paintEr(); };
    paintEr();
    card.querySelector('#invUrl').addEventListener('change', (e) => { let v = e.target.value.trim(); e.target.value = v; set('invoiceUrl', v); conn(); if (v && !/^https:\/\/script\.google(usercontent)?\.com\//.test(v)) msg('That doesn’t look like a Google Apps Script link — it should start with https://script.google.com/macros/s/ and end with /exec.', 'warn'); else if (v && !/\/exec$/.test(v)) msg('Use the <b>Web app</b> link that ends in <b>/exec</b> (not the editor link, and not /dev).', 'warn'); else msg(''); });
    card.querySelector('#invKey').addEventListener('change', (e) => { set('invoiceKey', e.target.value.trim()); conn(); });
    card.querySelector('#invMy').addEventListener('change', (e) => set('invoiceMyEmail', e.target.value.trim()));
    card.querySelector('#invCopy').addEventListener('change', (e) => set('invoiceCopyMe', e.target.checked));
    card.querySelector('#invAsk').addEventListener('change', (e) => set('invoiceAsk', e.target.checked));
    card.querySelector('#invPrefix').addEventListener('change', (e) => set('invoicePrefix', e.target.value.trim()));
    card.querySelector('#invSeq').addEventListener('change', (e) => { const n = Math.max(1, parseInt(e.target.value, 10) || 1); e.target.value = n; set('invoiceSeq', n); });
    card.querySelector('#invReset').addEventListener('change', async (e) => {
      set('emailReset', e.target.checked);
      if (!e.target.checked) { const er = await Store.getEmailReset().catch(() => null); if (er) { if (connected()) callScript({ action: 'reset-forget', deviceId: er.deviceId }).catch(() => {}); await Store.clearEmailReset().catch(() => {}); } setErState('off'); }
      else setErState('pending');
    });
    card.querySelector('#invSubject').addEventListener('change', (e) => set('invoiceSubject', e.target.value.trim() || DEF_SUBJECT));
    card.querySelector('#invMessage').addEventListener('change', (e) => set('invoiceMessage', e.target.value.trim() || DEF_MESSAGE));
    card.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-invset]'); if (!b) return;
      const k = b.dataset.invset;
      if (k === 'guide') openGuide();
      if (k === 'show') { const i = card.querySelector('#invKey'); i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
      if (k === 'newkey' || (k === 'copy' && !cfg().key)) {
        if (k === 'newkey' && cfg().key && !(await U.confirm('Make a new secret key?', 'The Gmail script you already set up will stop working until you paste the new script (📋 Copy the Gmail script) into it and deploy a new version.', 'Make a new key'))) return;
        const key = newKey(); set('invoiceKey', key); card.querySelector('#invKey').value = key; conn();
        if (k === 'newkey') msg('New key made. Now use <b>📋 Copy the Gmail script</b> and paste it into your Apps Script project.', 'ok');
      }
      if (k === 'copy') { await T().copyText(script(cfg().key), 'Gmail script'); msg('Script copied with your secret key inside. Paste it into script.google.com (the Guide shows each step).', 'ok'); }
      if (k === 'eron') { turnOnNow(); return; }
      if (k === 'reset') { set('invoiceSubject', DEF_SUBJECT); set('invoiceMessage', DEF_MESSAGE); card.querySelector('#invSubject').value = DEF_SUBJECT; card.querySelector('#invMessage').value = DEF_MESSAGE; }
      if (k === 'test') {
        if (!connected()) { msg('Paste the script link and the secret key first.', 'warn'); return; }
        b.disabled = true; msg('Checking…');
        try {
          const r = await callScript({ action: 'ping' });
          const me = cfg().myEmail;
          let extra = '';
          if (okEmail(me) && await U.confirm('Connected ✓', `Your Gmail script is working (sending as ${r.account || 'your Gmail'}; ${r.quota ?? '?'} emails left today).\n\nSend a sample invoice to ${me} to see what buyers get?`, 'Send a sample')) {
            const inv = sample(me); const blob = await buildPdf(inv); await sendGmail(inv, blob); extra = ` A sample invoice was sent to ${esc(me)} — check your inbox.`;
          }
          msg(`✓ Connected — sending as <b>${esc(r.account || 'your Gmail')}</b>, ${r.quota ?? '?'} emails left today.${extra}`, 'ok');
        } catch (err) { msg('✗ ' + esc(err.message || err) + (/Failed to fetch|NetworkError|Load failed/i.test(String(err.message)) ? ' — check the link, and that the script was deployed with “Who has access: Anyone”.' : ''), 'bad'); }
        b.disabled = false;
      }
    });
  }
  function sample(to) {
    const it = { id: 'sample', name: 'Vintage denim jacket', brand: 'Levi’s', size: 'M', condition: 'Excellent', color: 'Blue', sku: '1001', sellingPrice: 38 };
    return { items: [it], prices: [38], subtotal: 38, shipping: 0, discount: 0, tax: 0, total: 38, no: 'SAMPLE-0001', date: U.todayISO(), paidVia: 'Poshmark', note: 'This is a sample invoice from your Thriftaholics app.', buyer: { name: 'Sample Buyer', email: to, address: '' } };
  }

  /* ---------- password reset by email ---------- */
  const ER_KEY = 'thrift-er-state';
  const erState = () => { try { return JSON.parse(localStorage.getItem(ER_KEY) || 'null') || {}; } catch (_) { return {}; } };
  const setErState = (st, extra = {}) => { try { localStorage.setItem(ER_KEY, JSON.stringify({ st, at: Date.now(), ...extra })); } catch (_) { /* ignore */ } paintEr(); };
  const resetWanted = () => connected() && S().emailReset !== false;
  function deviceName() {
    const ua = navigator.userAgent || '';
    const kind = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : 'computer';
    const who = String(S().yourName || '').trim();
    return who ? `${who}’s ${kind}` : `the ${kind}`;
  }
  const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const oldScript = (e) => /buyer email address|Bad reset|Unexpected answer/i.test(String(e && e.message));
  let erBusy = null;
  /** Makes sure this device can be reset by email (needs the password, so it runs right after unlocking). */
  function ensureEmailReset(pw, { force = false } = {}) {
    if (erBusy) return erBusy;
    erBusy = (async () => {
      const er = await Store.getEmailReset().catch(() => null);
      if (!resetWanted()) {
        if (er) { if (connected()) callScript({ action: 'reset-forget', deviceId: er.deviceId }).catch(() => {}); await Store.clearEmailReset().catch(() => {}); }
        setErState(connected() ? 'off' : 'nogmail'); return;
      }
      const c = cfg(), name = deviceName();
      const code = er ? await Store.getEmailResetCode().catch(() => null) : null;
      if (er && code && !force && er.url === c.url && er.name === name) {
        try {
          const r = await callScript({ action: 'reset-status', deviceId: er.deviceId, token: er.token });
          if (r.registered === true) { setErState('on', { to: r.to || er.to, name }); return; }
          if (r.registered === undefined) { setErState('old'); return; }
        } catch (e) { setErState(oldScript(e) ? 'old' : 'error', { msg: String(e.message || e) }); return; }
      }
      const newCode = Store.newRecoveryCode();
      const deviceId = (er && er.deviceId) || newKey().replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
      const token = newKey() + newKey();
      try {
        const r = await callScript({ action: 'reset-register', deviceId, token, code: newCode, name, appUrl: appUrl() });
        if (!r.to) throw new Error('Bad reset setup.');
        await Store.setupEmailReset(pw, newCode, { deviceId, token, url: c.url, name, to: r.to });
        setErState('on', { to: r.to, name });
      } catch (e) { setErState(oldScript(e) ? 'old' : 'error', { msg: String(e.message || e) }); }
    })().finally(() => { erBusy = null; });
    return erBusy;
  }
  X.afterUnlock = (pw, { viaEmail } = {}) => {
    setTimeout(async () => {
      if (await loadStash().catch(() => false)) { U.toast('✉️ Your Gmail invoice settings were restored from this device’s safe copy', 'ok'); if (document.getElementById('invoiceCard')) renderSettings(); }
      ensureEmailReset(pw, { force: !!viaEmail }).catch((e) => console.error('email reset', e));
    }, 1500);
  };
  // after a sync brings in settings, put the Gmail details back if they went missing
  setInterval(() => { if (stashLoaded && Store.unlocked && stash && ((stash.url && !S().invoiceUrl) || (stash.key && !S().invoiceKey))) loadStash().then((r) => { if (r && document.getElementById('invoiceCard')) renderSettings(); }); }, 5000);
  async function turnOnNow() {
    const body = `<p style="margin-top:0">Enter this device’s password to set up reset by email.</p><label class="field"><span>Password</span><input type="password" data-pw autocomplete="current-password"></label><p class="lock-error" data-err></p>`;
    const pw = await U.modal({ title: '🔑 Reset by email', body, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'Set it up', cls: 'btn-primary',
      validate: async (b) => { const v = b.querySelector('[data-pw]').value; if (!(await Store.verify(v))) { b.querySelector('[data-err]').textContent = 'That isn’t the password.'; return false; } return true; },
      value: (b) => b.querySelector('[data-pw]').value }] });
    if (!pw) return;
    setErState('working');
    await ensureEmailReset(pw, { force: true });
    const st = erState().st;
    U.toast(st === 'on' ? '🔑 Reset by email is on for this device' : 'Couldn’t turn on reset by email — see Settings', st === 'on' ? 'ok' : 'warn');
  }
  function erText() {
    const e = erState(), st = !connected() ? 'nogmail' : S().emailReset === false ? 'off' : e.st || 'pending';
    const T2 = {
      on: ['on', `✓ On for this device (${esc(e.name || deviceName())}). Reset codes go to <b>${esc(e.to || 'the Gmail account above')}</b>.`],
      off: ['', 'Off.'],
      nogmail: ['', 'Set up one-tap email above first — reset codes are sent through the same Gmail script.'],
      working: ['', 'Setting it up…'],
      pending: ['warn', 'Turns on the next time this device unlocks — or tap <b>Turn on now</b>.'],
      old: ['warn', 'Your Gmail script needs the update: tap <b>📋 Copy the Gmail script</b>, paste it over the old code in script.google.com, save, then <b>Deploy → Manage deployments → ✏️ → Version: New version → Deploy</b>. Then tap <b>Turn on now</b>.'],
      error: ['warn', `Couldn’t set it up: ${esc(e.msg || 'unknown error')}. Tap <b>Turn on now</b> to try again.`]
    };
    return { st, cls: T2[st][0], html: T2[st][1] };
  }
  function paintEr() {
    const el = document.querySelector('#invoiceCard [data-erstate]'); if (!el) return;
    const t = erText(); el.className = 'er-state ' + t.cls; el.innerHTML = t.html;
    const btn = document.querySelector('#invoiceCard [data-invset=eron]'); if (btn) btn.classList.toggle('hidden', !(connected() && S().emailReset !== false && t.st !== 'on'));
  }

  /* ---------- hooks ---------- */
  X.on('sheetAction', (go, it) => { if (go === 'invoice') { invoiceDialog(it); return true; } return false; });
  X.on('sheetTop', (it) => {
    const inv = it.invoice; if (!inv || !inv.no) return '';
    const last = (inv.sent || [])[(inv.sent || []).length - 1];
    return `<div class="sh-card sh-wide inv-line">🧾 Invoice <b>${esc(inv.no)}</b> · ${esc(U.money(inv.total))}${it.buyer && it.buyer.name ? ` · ${esc(it.buyer.name)}` : ''}${last ? ` — ${last.via === 'email' ? 'emailed' : 'shared'} ${esc(U.fmtDate(last.at.slice(0, 10)))}${last.to ? ' to ' + esc(last.to) : ''}` : ''}</div>`;
  });
  // after a sale: a gentle toast offering the invoice (doesn't interrupt the celebration or delist checklist)
  X.on('commit', (kind, changes, label) => {
    if (kind !== 'items' || !/^(record sale|bundle sale|mark sold)/.test(label || '') || !cfg().ask) return;
    const ids = changes.map((c) => c.after && c.after.status === 'sold' ? c.id : null).filter(Boolean);
    if (!ids.length) return;
    const first = T().findItem(ids[0]); if (!first) return;
    const orders = new Set(ids.map((id) => (T().findItem(id) || {}).orderId || id));
    if (orders.size > 3) return;
    setTimeout(() => U.toast(orders.size > 1 ? `Send invoices? Open each sold item → 🧾 Invoice` : `🧾 Send ${first.orderSize > 1 ? 'an invoice for this order' : 'the buyer an invoice'}?`, 'ok', orders.size > 1 ? { ms: 9000 } : { label: 'Invoice', fn: () => invoiceDialog(first.id), ms: 12000 }), S().celebrate === false ? 600 : 3000);
  });
  X.on('view', (v) => { if (v === 'settings') renderSettings(); });
  X.on('init', () => { if (document.getElementById('view-settings')?.classList.contains('active')) renderSettings(); });

  Object.assign(X, { ensureEmailReset, emailResetState: erState, invoiceDialog, invoicePdf: buildPdf, invoiceScript: script, invoiceSample: sample, invoiceConnected: connected, invoiceEmailHtml: emailHtml });
})();
