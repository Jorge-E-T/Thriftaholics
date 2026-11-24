/* =========================================================
   Branded printables: monthly profit report, tax-year summary,
   packing slips and thank-you cards.
   Each opens the browser's print window — choose "Save as PDF"
   to keep a PDF, or pick a printer.
   ========================================================= */
(function (global) {
  'use strict';
  const esc = (s) => U.esc(s);
  const Print = {};
  const base = () => location.origin + location.pathname.replace(/[^/]*$/, '');

  function qr(text, size) {
    if (!global.qrcode || !text) return '';
    const q = global.qrcode(0, 'M'); q.addData(text); q.make();
    return `<div class="qr" style="width:${size};height:${size}">${q.createSvgTag({ cellSize: 2, margin: 0, scalable: true })}</div>`;
  }
  const brandCss = `
    @font-face { font-family: "Pacifico"; src: url(${base()}fonts/pacifico.woff2) format("woff2"); }
    * { box-sizing: border-box; } html, body { margin: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1d2725; font-size: 10.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .script { font-family: "Pacifico", cursive; font-weight: 400; }
    .qr svg { width: 100%; height: 100%; display: block; }
    .teal { color: #164e47; } .gold { color: #c9952e; } .muted { color: #6b7672; } .neg { color: #b83a32; } .pos { color: #2f8a57; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #6b7672; border-bottom: 1.5pt solid #164e47; padding: 5pt 6pt; }
    td { padding: 4.5pt 6pt; border-bottom: 0.6pt solid #e7dfcf; vertical-align: top; }
    td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
    tr.tot td { font-weight: 800; border-top: 1.2pt solid #164e47; border-bottom: 0; }
    tr.sub td { font-weight: 700; background: #f6f1e7; }`;

  function brand(ctx) {
    return ctx.logo ? `<img class="logo" src="${ctx.logo}" alt="">` : `<img class="logo" src="${base()}icons/brand-mark.png" alt="">`;
  }

  /** open a print window with the given HTML */
  function send(html, title, note) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const go = () => {
      try { frame.contentWindow.document.title = title; frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { U.toast('Printing failed: ' + e.message, 'err'); }
      setTimeout(() => frame.remove(), 60000);
    };
    // wait for the logo and the script font, so they appear in the PDF
    const imgs = [...doc.images].map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = r; })));
    Promise.race([Promise.all([...imgs, doc.fonts ? doc.fonts.ready : Promise.resolve()]), new Promise((r) => setTimeout(r, 2500))]).then(() => setTimeout(go, 150));
    U.toast(note || 'Opening the print window — choose “Save as PDF” to keep a PDF copy.', 'ok');
    Print.lastHtml = html; // for tests
  }

  /* ---------------- reports ---------------- */
  function reportPage(ctx, title, period, inner) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${brandCss}
      @page { size: letter; margin: 0.55in 0.6in; }
      .head { display: flex; align-items: center; gap: 14pt; border-bottom: 3pt solid #164e47; padding-bottom: 10pt; margin-bottom: 16pt; position: relative; }
      .head::after { content: ""; position: absolute; left: 0; right: 0; bottom: -6pt; height: 1.5pt; background: #e7b84f; }
      .logo { height: 58pt; width: auto; }
      .co { font-size: 24pt; color: #164e47; line-height: 1.1; }
      .ttl { margin-left: auto; text-align: right; } .ttl b { display: block; font-size: 15pt; } .ttl span { color: #6b7672; font-size: 9.5pt; }
      .kp { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-bottom: 14pt; }
      .kp div { border: 0.8pt solid #e7dfcf; border-left: 3pt solid var(--c, #164e47); border-radius: 6pt; padding: 7pt 9pt; background: #fbf7ef; }
      .kp span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: #6b7672; font-weight: 700; }
      .kp b { font-size: 14pt; }
      h3 { font-size: 11pt; color: #164e47; margin: 16pt 0 6pt; text-transform: uppercase; letter-spacing: .07em; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16pt; }
      .bars { display: flex; align-items: flex-end; gap: 2pt; height: 70pt; border-bottom: 0.8pt solid #d6cdb9; margin: 6pt 0 2pt; }
      .bars i { flex: 1; background: #2a7a70; border-radius: 2pt 2pt 0 0; min-height: 0.5pt; }
      .bars i.z { background: #ece5d7; }
      .ax { display: flex; justify-content: space-between; font-size: 7.5pt; color: #6b7672; }
      .note { font-size: 8pt; color: #6b7672; margin-top: 14pt; border-top: 0.6pt solid #e7dfcf; padding-top: 6pt; }
      .foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 7.5pt; color: #8b9490; display: flex; justify-content: space-between; }
      tr { break-inside: avoid; } h3 { break-after: avoid; }
    </style></head><body>
      <div class="head">${brand(ctx)}${ctx.company ? `<div class="co script">${esc(ctx.company)}</div>` : ''}<div class="ttl"><b>${esc(title)}</b><span>${esc(period)}</span></div></div>
      ${inner}
      <div class="foot"><span>${ctx.company ? esc(ctx.company) + ' · ' : ''}prepared ${esc(U.fmtDate(U.todayISO()))}</span><span>Figures from the Thriftaholics app</span></div>
    </body></html>`;
  }
  const kp = (label, v, c) => `<div style="--c:${c || '#164e47'}"><span>${esc(label)}</span><b>${esc(v)}</b></div>`;

  Print.monthly = (ctx, ym) => {
    const [y, mo] = ym.split('-').map(Number);
    const from = `${ym}-01`, last = new Date(y, mo, 0).getDate(), to = `${ym}-${String(last).padStart(2, '0')}`;
    const m = Calc.metrics(ctx.items, ctx.expenses, ctx.settings, from, to, ctx.mileage);
    const label = new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    // daily sales bars
    const daily = Array.from({ length: last }, () => 0);
    m.sold.forEach((i) => { const d = +(i.dateSold || '').slice(8, 10); if (d) daily[d - 1] += i.sellingPrice || 0; });
    const dmax = Math.max(1, ...daily);
    const bars = `<div class="bars">${daily.map((v, i) => `<i class="${v ? '' : 'z'}" style="height:${v ? Math.max(3, v / dmax * 100) : 1.5}%" title="${i + 1}: ${U.money(v)}"></i>`).join('')}</div><div class="ax"><span>1</span><span>${Math.ceil(last / 2)}</span><span>${last}</span></div>`;
    const byP = {};
    m.sold.forEach((i) => { const k = ctx.platformLabel(i.platform) || 'Unspecified'; const r = (byP[k] ||= { n: 0, g: 0, net: 0, p: 0 }); r.n++; r.g += i.sellingPrice || 0; r.net += Calc.net(i); r.p += Calc.profit(i) || 0; });
    const plat = Object.entries(byP).sort((a, b) => b[1].g - a[1].g);
    const exps = Object.entries(m.expByCat).sort((a, b) => b[1] - a[1]);
    const sales = [...m.sold].sort((a, b) => (a.dateSold || '').localeCompare(b.dateSold || ''));
    const inner = `
      <div class="kp">${kp('Gross sales', U.money(m.gross), '#2f8a57')}${kp('Fees', U.money(m.fees), '#c2413b')}${kp('Net profit', U.money(m.netProfit), m.netProfit < 0 ? '#b83a32' : '#c9952e')}${kp('Items sold', U.int(m.soldCount), '#2a7a70')}
        ${kp('Net after fees', U.money(m.net))}${kp('Cost of goods', U.money(m.cogs))}${kp('Avg sale', U.money(m.avgSale))}${kp('Profit margin', m.netMargin === null ? '—' : U.pct(m.netMargin))}</div>
      <h3>Daily sales</h3>${bars}
      <div class="two"><div><h3>Profit &amp; loss</h3><table>
        <tr><td>Gross sales</td><td class="n">${U.money(m.gross)}</td></tr><tr><td>Platform fees</td><td class="n">−${U.money(m.fees)}</td></tr>
        <tr class="sub"><td>Net sales</td><td class="n">${U.money(m.net)}</td></tr><tr><td>Cost of goods sold</td><td class="n">−${U.money(m.cogs)}</td></tr>
        <tr><td>Shipping</td><td class="n">−${U.money(m.shipping)}</td></tr>${m.refunds ? `<tr><td>Refunds &amp; return shipping</td><td class="n">−${U.money(m.refunds)}</td></tr>` : ''}<tr><td>Expenses</td><td class="n">−${U.money(m.expenseTotal)}</td></tr>
        ${m.mileageDeduction ? `<tr><td>Mileage (${U.int(m.miles)} mi)</td><td class="n">−${U.money(m.mileageDeduction)}</td></tr>` : ''}
        <tr class="tot"><td>Net profit</td><td class="n ${m.netProfit < 0 ? 'neg' : ''}">${U.money(m.netProfit)}</td></tr></table></div>
        <div><h3>By platform</h3>${plat.length ? `<table><tr><th>Platform</th><th class="n">Sold</th><th class="n">Gross</th><th class="n">Profit</th></tr>${plat.map(([k, r]) => `<tr><td>${esc(k)}</td><td class="n">${r.n}</td><td class="n">${U.money(r.g)}</td><td class="n">${U.money(r.p)}</td></tr>`).join('')}</table>` : '<p class="muted">No sales this month.</p>'}
        ${exps.length ? `<h3>Expenses</h3><table>${exps.map(([k, v]) => `<tr><td style="text-transform:capitalize">${esc(k)}</td><td class="n">${U.money(v)}</td></tr>`).join('')}</table>` : ''}</div></div>
      <h3>Sales (${sales.length})</h3>${sales.length ? `<table><tr><th>Date</th><th>Item</th><th>Platform</th><th class="n">Price</th><th class="n">Fees</th><th class="n">Profit</th></tr>
        ${sales.map((i) => { const p = Calc.profit(i); return `<tr><td>${esc(U.fmtDate(i.dateSold))}</td><td>${esc(i.name)}${i.sku ? ` <span class="muted">· ${esc(i.sku)}</span>` : ''}</td><td>${esc(ctx.platformLabel(i.platform) || '—')}</td><td class="n">${U.money(i.sellingPrice)}</td><td class="n">${U.money((i.sellingPrice || 0) - Calc.net(i))}</td><td class="n ${p < 0 ? 'neg' : ''}">${U.money(p)}</td></tr>`; }).join('')}
        <tr class="tot"><td colspan="3">Total</td><td class="n">${U.money(m.gross)}</td><td class="n">${U.money(m.fees)}</td><td class="n">${U.money(m.grossProfit)}</td></tr></table>` : '<p class="muted">No sales recorded this month.</p>'}`;
    send(reportPage(ctx, 'Monthly profit summary', label, inner), `${ctx.company} — ${label}`);
  };

  Print.taxYear = (ctx, year) => {
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const m = Calc.metrics(ctx.items, ctx.expenses, ctx.settings, from, to, ctx.mileage);
    const qs = Calc.quarterTaxes(ctx.items, ctx.expenses, ctx.settings, ctx.mileage, year);
    const py = Calc.platformYear(ctx.items, year);
    const exps = Object.entries(m.expByCat).sort((a, b) => b[1] - a[1]);
    const inner = `
      <div class="kp">${kp('Gross receipts', U.money(m.gross), '#2f8a57')}${kp('Total deductions', U.money(m.fees + m.cogs + m.shipping + m.expenseTotal + (m.mileageDeduction || 0)), '#c2413b')}${kp('Net profit', U.money(m.netProfit), '#c9952e')}${kp('Estimated tax', U.money(m.totalTax), '#6b6fa8')}</div>
      <h3>Income &amp; cost of goods</h3><table>
        <tr><td>Gross receipts (sales)</td><td class="n">${U.money(m.gross)}</td></tr>
        <tr><td>Platform selling &amp; processing fees</td><td class="n">${U.money(m.fees)}</td></tr>
        <tr><td>Cost of goods sold (${m.soldCount} items)</td><td class="n">${U.money(m.cogs)}</td></tr>
        <tr><td>Shipping paid</td><td class="n">${U.money(m.shipping)}</td></tr>
        ${m.refunds ? `<tr><td>Refunds &amp; return shipping</td><td class="n">${U.money(m.refunds)}</td></tr>` : ''}
        <tr class="sub"><td>Gross profit</td><td class="n">${U.money(m.grossProfit)}</td></tr></table>
      <div class="two"><div><h3>Business expenses</h3>${exps.length ? `<table>${exps.map(([k, v]) => `<tr><td style="text-transform:capitalize">${esc(k)}</td><td class="n">${U.money(v)}</td></tr>`).join('')}<tr class="tot"><td>Total expenses</td><td class="n">${U.money(m.expenseTotal)}</td></tr></table>` : '<p class="muted">No expenses recorded.</p>'}
          ${m.miles ? `<h3>Vehicle mileage</h3><table><tr><td>Business miles</td><td class="n">${U.int(m.miles)}</td></tr><tr><td>Standard mileage deduction</td><td class="n">${U.money(m.mileageDeduction)}</td></tr></table>` : ''}
          ${m.writeOffs ? `<h3>Inventory written off</h3><table><tr><td>Donated / lost / damaged (at cost)</td><td class="n">${U.money(m.writeOffs)}</td></tr></table>` : ''}</div>
        <div><h3>Estimated tax</h3><table>
          <tr><td>Net profit</td><td class="n">${U.money(m.netProfit)}</td></tr>
          <tr><td>Self-employment tax (est.)</td><td class="n">${U.money(m.seTax)}</td></tr>
          <tr><td>Income tax (est. at your rate)</td><td class="n">${U.money(m.incomeTax)}</td></tr>
          <tr class="tot"><td>Total estimated tax</td><td class="n">${U.money(m.totalTax)}</td></tr></table>
          <h3>Quarterly payments</h3><table><tr><th>Quarter</th><th>Due</th><th class="n">Est. tax</th><th class="n">Paid</th></tr>
          ${qs.map((q) => `<tr><td>Q${q.q}</td><td>${esc(U.fmtDate(q.due))}</td><td class="n">${U.money(q.tax)}</td><td class="n">${U.money(q.paid)}</td></tr>`).join('')}</table></div></div>
      <h3>Sales by platform (compare with any Form 1099-K)</h3>${py.length ? `<table><tr><th>Platform</th><th class="n">Transactions</th><th class="n">Gross sales</th><th class="n">After fees</th></tr>${py.map((r) => `<tr><td>${esc(ctx.platformLabel(r.platform) || r.platform)}</td><td class="n">${r.count}</td><td class="n">${U.money(r.gross)}</td><td class="n">${U.money(r.net)}</td></tr>`).join('')}</table>` : '<p class="muted">No sales this year.</p>'}
      <div class="note">Estimates only, from the numbers entered in the app; not tax advice. Your tax professional may treat inventory, home-office use and other items differently. A 1099-K reports gross payments and can include shipping and sales tax collected.</div>`;
    send(reportPage(ctx, `${year} tax-year summary`, `January 1 – December 31, ${year}`, inner), `${ctx.company} — ${year} tax summary`);
  };

  /* ---------------- packing slips & thank-you cards ---------------- */
  Print.packingSlip = (items, ctx) => {
    if (!items.length) return;
    const shop = ctx.settings.shopUrl || '';
    const fmt = ctx.settings.slipFormat || 'letter';
    const css = fmt === '4x6' ? '@page { size: 4in 6in; margin: 0.25in; } .slip { height: 5.5in; } .logo { height: 54pt; } .co { font-size: 20pt; }'
      : '@page { size: letter; margin: 0.6in; } .slip { min-height: 9.6in; } .logo { height: 70pt; } .co { font-size: 28pt; }';
    const slip = (it) => `<section class="slip">
      <div class="top">${brand(ctx)}<div>${ctx.company ? `<div class="co script teal">${esc(ctx.company)}</div>` : ''}<div class="muted">${esc(shop.replace(/^https?:\/\//, ''))}</div></div><div class="ps">PACKING SLIP</div></div>
      <table class="meta"><tr><td><span>Order date</span>${esc(U.fmtDate(it.dateSold) || U.fmtDate(U.todayISO()))}</td><td><span>Sold on</span>${esc(ctx.platformLabel(it.platform) || '—')}</td><td><span>Item #</span>${esc(it.sku || it.id.slice(0, 6))}</td></tr></table>
      <table><tr><th>Item</th><th>Details</th><th class="n">Qty</th></tr>
        <tr><td><b>${esc(it.name)}</b></td><td>${[it.brand, it.size ? 'Size ' + it.size : '', it.color, it.condition].filter(Boolean).map(esc).join(' · ') || '—'}</td><td class="n">1</td></tr></table>
      <div class="thanks"><div class="script teal big">Thank you!</div><p>${esc(ctx.settings.thankYouMessage || 'Thank you for shopping secondhand with us. We hope you love it!')}</p></div>
      ${shop ? `<div class="shop">${qr(shop, '0.9in')}<div><b>Shop more finds</b><br><span class="muted">${esc(shop.replace(/^https?:\/\//, ''))}</span>${ctx.settings.socialHandle ? `<br><span class="muted">${esc(ctx.settings.socialHandle)}</span>` : ''}</div></div>` : ''}
    </section>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Packing slips</title><style>${brandCss} ${css}
      .slip { display: flex; flex-direction: column; gap: 14pt; page-break-after: always; break-after: page; }
      .top { display: flex; align-items: center; gap: 12pt; border-bottom: 3pt solid #164e47; padding-bottom: 8pt; }
      .ps { margin-left: auto; font-weight: 800; letter-spacing: .18em; color: #c9952e; font-size: 10pt; }
      .meta td { border: 0; padding: 0 12pt 0 0; } .meta span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: #6b7672; font-weight: 700; }
      .thanks { margin-top: auto; text-align: center; background: #f6f1e7; border-radius: 10pt; padding: 12pt; } .big { font-size: 26pt; } .thanks p { margin: 4pt 0 0; }
      .shop { display: flex; align-items: center; gap: 10pt; justify-content: center; }
    </style></head><body>${items.map(slip).join('')}</body></html>`;
    send(html, 'Packing slips', `${items.length} packing slip${items.length === 1 ? '' : 's'} — print, or choose “Save as PDF”.`);
  };

  Print.thankYou = (items, ctx) => {
    const shop = ctx.settings.shopUrl || '';
    const list = items.length ? items : [{ name: '' }];
    const card = (it) => `<section class="card">
      <div class="l">${brand(ctx)}${ctx.company ? `<div class="co script teal">${esc(ctx.company)}</div>` : ''}</div>
      <div class="r"><div class="script teal big">Thank you!</div>
        ${it.name ? `<p class="for">for giving <b>${esc(it.name)}</b> a second home</p>` : ''}
        <p>${esc(ctx.settings.thankYouMessage || 'Thank you for shopping secondhand with us. We hope you love it!')}</p>
        ${shop ? `<div class="shop">${qr(shop, '0.75in')}<div><b>Shop more finds</b><br><span class="muted">${esc(shop.replace(/^https?:\/\//, ''))}</span>${ctx.settings.socialHandle ? `<br><span class="muted">${esc(ctx.settings.socialHandle)}</span>` : ''}</div></div>` : ''}</div>
    </section>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Thank-you cards</title><style>${brandCss}
      @page { size: 6in 4in; margin: 0; }
      .card { width: 6in; height: 4in; display: grid; grid-template-columns: 2.1in 1fr; page-break-after: always; break-after: page; overflow: hidden; }
      .l { background: #164e47; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8pt; border-right: 4pt solid #e7b84f; }
      .l .logo { width: 1.45in; height: auto; } .l .co { color: #fff8ec !important; font-size: 17pt; }
      .r { padding: 0.35in 0.35in 0.3in; display: flex; flex-direction: column; gap: 6pt; background: #fffdf8; }
      .big { font-size: 30pt; line-height: 1.45; margin-bottom: 2pt; } .for { margin: 0; color: #56625e; } .r p { margin: 0; font-size: 10.5pt; }
      .shop { margin-top: auto; display: flex; gap: 10pt; align-items: center; font-size: 9pt; }
    </style></head><body>${list.map(card).join('')}</body></html>`;
    send(html, 'Thank-you cards', 'Thank-you card ready — print on 4×6 card stock, or choose “Save as PDF”.');
  };

  global.Print = Print;
})(window);
