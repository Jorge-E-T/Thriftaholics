/* =========================================================
   Calculations + Excel (xlsx) report export via ExcelJS
   ========================================================= */
(function (global) {
  'use strict';

  const NON_ASSET_STATUSES = ['sold', 'donated', 'archived', 'lost'];

  const Calc = {
    isSold: (it) => (it.status || '').toLowerCase() === 'sold',

    daysActive(it) {
      if (!it.datePosted) return null;
      const end = it.dateSold || U.todayISO();
      return U.daysBetween(it.datePosted, end);
    },
    ageClass(it, s) {
      if (Calc.isSold(it)) return 'sold';
      if ((it.status || '').toLowerCase() !== 'available') return 'pending';
      const d = Calc.daysActive(it);
      if (d === null) return 'fresh';
      if (d >= s.staleDays) return 'stale';
      if (d >= s.agingDays) return 'aging';
      return 'fresh';
    },
    net(it) { return it.totalAfterFees ?? it.sellingPrice ?? 0; },
    /** money given back to buyers (partial refunds) and return-shipping you paid */
    refunded(it) { return U.round2((it.refunds || []).reduce((a, r) => a + (+r.amount || 0), 0)); },
    returnShip(it) { return U.round2((it.refunds || []).reduce((a, r) => a + (+r.returnShip || 0), 0)); },
    fees(it) {
      if (!Calc.isSold(it) || it.sellingPrice == null || it.totalAfterFees == null) return null;
      return U.round2(it.sellingPrice - it.totalAfterFees);
    },
    profit(it) {
      if (!Calc.isSold(it)) return null;
      return U.round2(Calc.net(it) - (it.purchasePrice || 0) - (it.shippingCost || 0) - Calc.refunded(it) - Calc.returnShip(it));
    },
    margin(it) {
      const p = Calc.profit(it);
      const g = it.sellingPrice;
      return p == null || !g ? null : p / g;
    },
    /**
     * Estimated platform fees for a sale.
     * p: platform profile (see app.js PLATFORM_PRESETS); price: item sale price;
     * shipping: buyer-paid shipping (defaults to the platform's typical charge).
     */
    platformEstimate(p, price, shipping) {
      const n = (v) => (v === null || v === undefined || v === '' || isNaN(v) ? 0 : +v);
      price = n(price);
      const buyerShip = p.shipPaidBy === 'seller' ? 0 : (shipping === null || shipping === undefined || shipping === '' ? n(p.shipCharge) : n(shipping));
      const base = price + (p.feeOnShipping ? buyerShip : 0);
      const procOnShip = p.procOnShipping === undefined || p.procOnShipping === null ? !!p.feeOnShipping : !!p.procOnShipping;
      const procBase = price + (procOnShip ? buyerShip : 0);
      const small = n(p.smallThreshold) > 0 && price < n(p.smallThreshold);
      // price tiers, e.g. Amazon clothing 5% up to $15, 10% up to $20, then feePct
      const tier = (Array.isArray(p.feeTiers) ? p.feeTiers : []).filter((t) => t && n(t.max) > 0).sort((a, b) => n(a.max) - n(b.max)).find((t) => price <= n(t.max));
      const pct = tier ? n(tier.pct) : n(p.feePct);
      let commission;
      if (small && p.smallFlat !== null && p.smallFlat !== undefined && p.smallFlat !== '') commission = n(p.smallFlat);
      else commission = base * pct / 100 + (small && p.smallFixed !== null && p.smallFixed !== undefined && p.smallFixed !== '' ? n(p.smallFixed) : n(p.feeFixed));
      if (n(p.feeMin) && price > 0) commission = Math.max(commission, n(p.feeMin));
      let processing = (n(p.procPct) || n(p.procFixed)) && price > 0 ? procBase * n(p.procPct) / 100 + n(p.procFixed) : 0;
      if (n(p.procMin) && price > 0) processing = Math.max(processing, n(p.procMin));
      const extras = (p.extras || []).reduce((a, x) => a + (x.kind === 'pct' ? price * n(x.amount) / 100 : x.kind === 'order' ? n(x.amount) : 0), 0);
      const listing = n(p.listingFee);
      const fees = U.round2(commission + processing + extras + listing);
      const sellerShip = U.round2(p.shipPaidBy === 'seller' ? n(p.shipCharge) + n(p.sellerShipCost) : n(p.sellerShipCost));
      return {
        commission: U.round2(commission), processing: U.round2(processing), extras: U.round2(extras), listing: U.round2(listing),
        fees, payout: U.round2(price - fees), sellerShip, buyerShip: U.round2(buyerShip), rate: price ? fees / price : 0,
        monthly: U.round2((p.extras || []).reduce((a, x) => a + (x.kind === 'month' ? n(x.amount) : 0), 0))
      };
    },
    potentialProfit(it) {
      if (Calc.isSold(it) || it.sellingPrice == null) return null;
      return U.round2(it.sellingPrice - (it.purchasePrice || 0));
    },
    isAsset(it, asOf) {
      const st = (it.status || '').toLowerCase();
      if (asOf && it.datePosted && it.datePosted > asOf) return false;
      if (st === 'sold') return !!(asOf && it.dateSold && it.dateSold > asOf);
      return !NON_ASSET_STATUSES.includes(st);
    },

    /** IRS standard mileage rate in effect on a date (rates: [{ from, rate }]). */
    mileageRate(date, rates) {
      const list = [...(rates || [])].filter((r) => r && r.from).sort((a, b) => a.from.localeCompare(b.from));
      let rate = list.length ? list[0].rate : 0;
      list.forEach((r) => { if (!date || r.from <= date) rate = r.rate; });
      return +rate || 0;
    },
    tripMiles: (t) => (+t.miles || 0) * (t.roundTrip ? 2 : 1),
    tripDeduction(t, rates) { return U.round2(Calc.tripMiles(t) * Calc.mileageRate(t.date, rates)); },
    WRITE_OFF: ['donated', 'lost'],

    /** Full set of metrics for a period. */
    metrics(items, expenses, settings, from = '', to = '', mileage = []) {
      const all = !from && !to;
      const sold = items.filter((it) => Calc.isSold(it) && (all ? true : U.inRange(it.dateSold, from, to)));
      const sum = (arr, f) => U.round2(arr.reduce((a, x) => a + (+f(x) || 0), 0));
      const gross = sum(sold, (i) => i.sellingPrice);
      const net = sum(sold, Calc.net);
      const fees = U.round2(gross - net);
      const cogs = sum(sold, (i) => i.purchasePrice);
      const refunds = U.round2(sum(sold, Calc.refunded) + sum(sold, Calc.returnShip)); // partial refunds + return shipping
      const shipping = sum(sold, (i) => i.shippingCost);
      const grossProfit = U.round2(net - refunds - cogs - shipping);
      const exps = expenses.filter((e) => all ? true : U.inRange(e.date, from, to));
      const expenseTotal = sum(exps, (e) => e.amount);
      const expByCat = {};
      exps.forEach((e) => { const c = e.category || 'Other'; expByCat[c] = U.round2((expByCat[c] || 0) + (+e.amount || 0)); });
      const trips = (mileage || []).filter((t) => all ? true : U.inRange(t.date, from, to));
      const miles = trips.reduce((a, t) => a + Calc.tripMiles(t), 0);
      const mileageDeduction = U.round2(trips.reduce((a, t) => a + Calc.tripDeduction(t, settings.mileageRates), 0));
      const writtenOff = items.filter((i) => Calc.WRITE_OFF.includes((i.status || '').toLowerCase()) && (all ? true : U.inRange(i.disposedDate, from, to)));
      const writeOffs = sum(writtenOff, (i) => i.purchasePrice);
      const netProfit = U.round2(grossProfit - expenseTotal - mileageDeduction - writeOffs);
      const taxable = Math.max(0, netProfit);
      const salesTax = U.round2(gross * (settings.salesTaxRate || 0) / 100);
      const seBase = U.round2(taxable * 0.9235);
      const seTax = U.round2(seBase * (settings.seTaxRate || 0) / 100);
      const incomeTax = U.round2(taxable * (settings.incomeTaxRate || 0) / 100);
      const totalTax = U.round2(seTax + incomeTax);
      const asOf = to || U.todayISO();
      const assets = items.filter((it) => Calc.isAsset(it, to || ''));
      const invCost = sum(assets, (i) => i.purchasePrice);
      const invRetail = sum(assets, (i) => i.sellingPrice);
      const purchased = items.filter((it) => all ? true : U.inRange(it.datePosted, from, to));
      const purchaseTotal = sum(purchased, (i) => i.purchasePrice);
      const daysToSell = sold.map(Calc.daysActive).filter((d) => d !== null);
      const avgDaysToSell = daysToSell.length ? daysToSell.reduce((a, b) => a + b, 0) / daysToSell.length : null;
      const unsoldAges = assets.map((it) => U.daysBetween(it.datePosted, asOf)).filter((d) => d !== null);
      const avgAge = unsoldAges.length ? unsoldAges.reduce((a, b) => a + b, 0) / unsoldAges.length : null;
      return {
        from, to, sold, gross, net, fees, refunds, cogs, shipping, grossProfit, expenses: exps, expenseTotal, expByCat,
        netProfit, taxable, salesTax, trips, miles: U.round2(miles), mileageDeduction, writtenOff, writeOffs, seBase, seTax, incomeTax, totalTax, afterTax: U.round2(netProfit - totalTax),
        assets, invCost, invRetail, invPotential: U.round2(invRetail - invCost), purchaseTotal, purchasedCount: purchased.length,
        soldCount: sold.length, avgSale: sold.length ? gross / sold.length : 0, avgProfit: sold.length ? grossProfit / sold.length : 0,
        margin: gross ? grossProfit / gross : null, netMargin: gross ? netProfit / gross : null,
        sellThrough: (sold.length + assets.length) ? sold.length / (sold.length + assets.length) : null,
        avgDaysToSell, avgAge, asOf,
        totalMadeAllTime: sum(items.filter(Calc.isSold), Calc.net)
      };
    },

    /** Performance grouped by any key (brand, size, source…). */
    groupPerf(items, keyFn, asOf) {
      const g = new Map();
      items.forEach((it) => {
        const k = (keyFn(it) || '').toString().trim() || '(not set)';
        const r = g.get(k) || { key: k, items: 0, inStock: 0, sold: 0, cost: 0, gross: 0, net: 0, profit: 0, days: [] };
        r.items++; r.cost += it.purchasePrice || 0;
        if (Calc.isSold(it)) { r.sold++; r.gross += it.sellingPrice || 0; r.net += Calc.net(it); r.profit += Calc.profit(it) || 0; const d = Calc.daysActive(it); if (d !== null) r.days.push(d); }
        else if (Calc.isAsset(it, asOf || '')) r.inStock++;
        g.set(k, r);
      });
      return [...g.values()].map((r) => ({ ...r, gross: U.round2(r.gross), profit: U.round2(r.profit), cost: U.round2(r.cost),
        sellThrough: r.sold + r.inStock ? r.sold / (r.sold + r.inStock) : 0, avgDays: r.days.length ? r.days.reduce((a, b) => a + b, 0) / r.days.length : null,
        roi: r.cost ? r.profit / r.cost : null }));
    },
    /** IRS estimated-tax periods for a tax year (due date moves to Monday if it falls on a weekend). */
    taxQuarters(year) {
      const due = (y, m, d) => { const dt = new Date(y, m - 1, d); while ([0, 6].includes(dt.getDay())) dt.setDate(dt.getDate() + 1); return U.toISO(dt); };
      return [
        { q: 1, from: `${year}-01-01`, to: `${year}-03-31`, due: due(year, 4, 15) },
        { q: 2, from: `${year}-04-01`, to: `${year}-05-31`, due: due(year, 6, 15) },
        { q: 3, from: `${year}-06-01`, to: `${year}-08-31`, due: due(year, 9, 15) },
        { q: 4, from: `${year}-09-01`, to: `${year}-12-31`, due: due(year + 1, 1, 15) }
      ];
    },
    /** Estimated tax per quarter, based on profit earned in that period, minus payments recorded for it. */
    quarterTaxes(items, expenses, settings, mileage, year) {
      return Calc.taxQuarters(year).map((q) => {
        const m = Calc.metrics(items, expenses, settings, q.from, q.to, mileage);
        const paid = (settings.taxPayments || []).filter((p) => +p.year === +year && +p.q === q.q).reduce((a, p) => a + (+p.amount || 0), 0);
        return { ...q, year, profit: m.netProfit, tax: m.totalTax, paid: U.round2(paid), owed: U.round2(Math.max(0, m.totalTax - paid)) };
      });
    },
    /** Gross sales and transaction counts per platform for a calendar year (for comparing with Form 1099-K). */
    platformYear(items, year) {
      const g = new Map();
      items.filter((i) => Calc.isSold(i) && (i.dateSold || '').startsWith(String(year))).forEach((i) => {
        const k = (i.platform || '(not set)').toLowerCase();
        const r = g.get(k) || { platform: k, count: 0, gross: 0, net: 0 };
        r.count++; r.gross += i.sellingPrice || 0; r.net += Calc.net(i); g.set(k, r);
      });
      return [...g.values()].map((r) => ({ ...r, gross: U.round2(r.gross), net: U.round2(r.net), over: r.gross > 20000 && r.count > 200 })).sort((a, b) => b.gross - a.gross);
    },

    monthly(items, expenses, from = '', to = '') {
      const out = [];
      const t = U.parseISO(to) || new Date();
      let start;
      if (from) start = U.parseISO(from);
      else {
        const dates = [...items.filter((i) => Calc.isSold(i) && i.dateSold).map((i) => i.dateSold), ...expenses.map((e) => e.date)].filter(Boolean).sort();
        start = dates.length ? U.parseISO(dates[0]) : new Date(t.getFullYear(), t.getMonth() - 11, 1);
      }
      let months = (t.getFullYear() - start.getFullYear()) * 12 + t.getMonth() - start.getMonth() + 1;
      months = Math.min(36, Math.max(from ? 1 : 6, months));
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
        const key = U.toISO(d).slice(0, 7);
        out.push({ key, label: U.monthLabel(key), gross: 0, net: 0, cost: 0, exp: 0, count: 0 });
      }
      const idx = Object.fromEntries(out.map((o, i) => [o.key, i]));
      items.forEach((it) => {
        if (!Calc.isSold(it) || !it.dateSold) return;
        const i = idx[U.monthKey(it.dateSold)]; if (i === undefined) return;
        out[i].gross += it.sellingPrice || 0; out[i].net += Calc.net(it); out[i].cost += (it.purchasePrice || 0) + (it.shippingCost || 0); out[i].count++;
      });
      expenses.forEach((e) => { const i = idx[U.monthKey(e.date)]; if (i !== undefined) out[i].exp += +e.amount || 0; });
      out.forEach((o) => { o.profit = U.round2(o.net - o.cost - o.exp); o.gross = U.round2(o.gross); });
      return out;
    }
  };

  /* ================= Excel export ================= */
  const C = { ink: 'FF123C3A', ink3: 'FF2C6E6A', gold: 'FFE9C46A', soft: 'FFF4F3EE', line: 'FFE4E1D8', sold: 'FFE8F5EC', aging: 'FFFFF6DF', stale: 'FFFDECEB', pending: 'FFEFEFF8', white: 'FFFFFFFF', text2: 'FF55605D' };
  const SYMBOL = { USD: '$', CAD: '$', AUD: '$', MXN: '$', EUR: '€', GBP: '£' };

  function moneyFmt(cur) { const s = SYMBOL[cur] || '$'; return `"${s}"#,##0.00;[Red]-"${s}"#,##0.00`; }
  const DATE_FMT = 'mmm d, yyyy';
  const PCT_FMT = '0.0%';
  const toDate = (iso) => { const d = U.parseISO(iso); return d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null; };
  const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  function styleHeader(row) {
    row.height = 30;
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: C.white }, size: 10.5 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: C.gold } } };
    });
  }
  function styleTotal(row) {
    row.eachCell({ includeEmpty: true }, (c) => {
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.soft } };
      c.border = { top: { style: 'thin', color: { argb: 'FF1B2422' } }, bottom: { style: 'double', color: { argb: 'FF1B2422' } } };
    });
  }
  function titleBlock(ws, title, subtitle, ctx, lastCol) {
    const startCol = ws.name === 'Summary' ? 2 : 1;
    if (ctx.logoId != null) {
      // letterhead style: logo anchored top-right of the title block
      const h = 52, w = Math.min(170, Math.round(h * ctx.logoRatio));
      ws.addImage(ctx.logoId, { tl: { col: Math.max(startCol, lastCol - 2), row: 0.2 }, ext: { width: w, height: h }, editAs: 'oneCell' });
    }
    ws.getRow(1).height = 26; ws.getRow(2).height = 18; ws.getRow(3).height = 16;
    const t = ws.getCell(1, startCol); t.value = ctx.company; t.font = { bold: true, size: 16, color: { argb: C.ink } };
    const s = ws.getCell(2, startCol); s.value = title; s.font = { bold: true, size: 12, color: { argb: C.ink3 } };
    const p = ws.getCell(3, startCol); p.value = subtitle; p.font = { size: 9.5, italic: true, color: { argb: C.text2 } };
    for (let c = 1; c <= lastCol; c++) ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: C.gold } } };
  }

  function addTable(ws, startRow, headers, rows, opts = {}) {
    const hr = ws.getRow(startRow);
    headers.forEach((h, i) => { hr.getCell(i + 1).value = h.label; });
    styleHeader(hr);
    rows.forEach((r, ri) => {
      const row = ws.getRow(startRow + 1 + ri);
      headers.forEach((h, i) => {
        const cell = row.getCell(i + 1);
        let v = typeof h.get === 'function' ? h.get(r, startRow + 1 + ri) : r[h.key];
        if (h.type === 'date') v = toDate(v);
        cell.value = (v === undefined || v === '') ? null : v;
        if (h.fmt) cell.numFmt = h.fmt;
        if (h.align) cell.alignment = { horizontal: h.align };
      });
      if (opts.rowFill) { const f = opts.rowFill(r); if (f) row.eachCell({ includeEmpty: true }, (c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f } }; }); }
      row.eachCell({ includeEmpty: true }, (c) => { c.border = { bottom: { style: 'hair', color: { argb: C.line } } }; });
    });
    const first = startRow + 1, last = startRow + rows.length;
    let totalRowNum = null;
    if (opts.totals) {
      totalRowNum = last + 1;
      const tr = ws.getRow(totalRowNum);
      tr.getCell(1).value = opts.totalsLabel || 'TOTAL';
      headers.forEach((h, i) => {
        if (!h.total) return;
        const L = colLetter(i + 1);
        const cell = tr.getCell(i + 1);
        const result = rows.reduce((a, r, ri) => { const v = typeof h.get === 'function' ? h.get(r, first + ri) : r[h.key]; return a + (typeof v === 'number' ? v : (v && typeof v.result === 'number' ? v.result : 0)); }, 0);
        if (h.total === 'avg') cell.value = rows.length ? { formula: `IFERROR(AVERAGE(${L}${first}:${L}${last}),0)`, result: result / rows.length } : 0;
        else cell.value = rows.length ? { formula: `SUM(${L}${first}:${L}${last})`, result: U.round2(result) } : 0;
        if (h.fmt) cell.numFmt = h.fmt;
      });
      styleTotal(tr);
    }
    headers.forEach((h, i) => { ws.getColumn(i + 1).width = h.width || 14; });
    if (rows.length) ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: last, column: headers.length } };
    ws.views = [{ state: 'frozen', ySplit: startRow, xSplit: opts.freezeCols || 0 }];
    return { first, last, totalRow: totalRowNum };
  }

  async function exportWorkbook({ items, expenses, settings, logo, photos, platforms = [], mileage = [], from, to, label }) {
    if (!global.ExcelJS) throw new Error('Excel library failed to load.');
    const m = Calc.metrics(items, expenses, settings, from, to, mileage);
    const money = moneyFmt(settings.currency);
    const wb = new global.ExcelJS.Workbook();
    wb.creator = settings.companyName || 'Inventory Ledger';
    wb.created = new Date();
    wb.title = 'Financial Report';
    const ctx = { company: settings.companyName ?? '', logoId: null, logoRatio: 1 };
    if (logo && logo.dataURL) {
      try {
        ctx.logoId = wb.addImage({ base64: logo.dataURL, extension: 'png' });
        ctx.logoRatio = logo.width && logo.height ? logo.width / logo.height : 1;
      } catch (_) { ctx.logoId = null; }
    }
    const periodText = `Period: ${label}${from || to ? ` (${from ? U.fmtDate(from) : 'start'} – ${to ? U.fmtDate(to) : 'today'})` : ''} · Generated ${new Date().toLocaleString()}`;

    // Create Summary first so it is the first tab; it is filled in after the detail sheets.
    const ws = wb.addWorksheet('Summary', { properties: { tabColor: { argb: C.ink } }, views: [{ showGridLines: false }] });

    /* ---------- Sales ---------- */
    const wsSales = wb.addWorksheet('Sales', { properties: { tabColor: { argb: 'FF2F8A57' } } });
    const salesRows = [...m.sold].sort((a, b) => (a.dateSold || '').localeCompare(b.dateSold || ''));
    titleBlock(wsSales, 'Gross Sales — itemized', periodText, ctx, 14);
    const S = addTable(wsSales, 6, [
      { label: 'Date Sold', key: 'dateSold', type: 'date', fmt: DATE_FMT, width: 14 },
      { label: 'Item Name', key: 'name', width: 38 },
      { label: 'SKU', key: 'sku', width: 9, align: 'center' },
      { label: 'Category', key: 'category', width: 18 },
      { label: 'Platform', key: 'platform', width: 12 },
      { label: 'Date Posted', key: 'datePosted', type: 'date', fmt: DATE_FMT, width: 14 },
      { label: 'Days Active', get: (r) => Calc.daysActive(r), width: 10, total: 'avg', fmt: '0' },
      { label: 'Sale Price', get: (r) => r.sellingPrice ?? 0, fmt: money, total: true, width: 13 },
      { label: 'Fees', get: (r, rn) => ({ formula: `H${rn}-J${rn}`, result: U.round2((r.sellingPrice ?? 0) - Calc.net(r)) }), fmt: money, total: true, width: 12 },
      { label: 'Total After Fees', get: (r) => Calc.net(r), fmt: money, total: true, width: 14 },
      { label: 'Purchase Cost', get: (r) => r.purchasePrice ?? 0, fmt: money, total: true, width: 13 },
      { label: 'Shipping', get: (r) => r.shippingCost ?? 0, fmt: money, total: true, width: 11 },
      { label: 'Profit', get: (r, rn) => ({ formula: `J${rn}-K${rn}-L${rn}`, result: Calc.profit(r) }), fmt: money, total: true, width: 13 },
      { label: 'Margin', get: (r, rn) => ({ formula: `IFERROR(M${rn}/H${rn},0)`, result: Calc.margin(r) || 0 }), fmt: PCT_FMT, width: 9 }
    ], salesRows, { totals: true, freezeCols: 2 });
    const ST = S.totalRow;

    /* ---------- Itemized costs ---------- */
    const wsCost = wb.addWorksheet('Itemized Costs', { properties: { tabColor: { argb: 'FFC2413B' } } });
    titleBlock(wsCost, 'Itemized Costs — cost of goods sold, shipping & operating expenses', periodText, ctx, 7);
    const costRows = [];
    salesRows.forEach((r) => {
      costRows.push({ date: r.dateSold, type: 'Cost of goods sold', category: r.category || '', desc: r.name, ref: r.sku != null && r.sku !== '' ? 'SKU ' + r.sku : '', platform: r.platform || '', amount: r.purchasePrice || 0 });
      if (r.shippingCost) costRows.push({ date: r.dateSold, type: 'Shipping', category: r.category || '', desc: r.name, ref: r.sku != null && r.sku !== '' ? 'SKU ' + r.sku : '', platform: r.platform || '', amount: r.shippingCost });
    });
    [...m.expenses].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach((e) => {
      costRows.push({ date: e.date, type: 'Operating expense', category: e.category || 'Other', desc: e.description || '', ref: e.vendor || '', platform: e.payment || '', amount: +e.amount || 0 });
    });
    const CT = addTable(wsCost, 6, [
      { label: 'Date', key: 'date', type: 'date', fmt: DATE_FMT, width: 14 },
      { label: 'Cost Type', key: 'type', width: 20 },
      { label: 'Category', key: 'category', width: 20 },
      { label: 'Description', key: 'desc', width: 40 },
      { label: 'Reference / Vendor', key: 'ref', width: 20 },
      { label: 'Platform / Payment', key: 'platform', width: 18 },
      { label: 'Amount', key: 'amount', fmt: money, total: true, width: 14 }
    ], costRows, { totals: true, rowFill: (r) => r.type === 'Operating expense' ? C.pending : null });
    const costRange = `'Itemized Costs'!$B$${CT.first}:$B$${Math.max(CT.last, CT.first)}`;
    const costAmt = `'Itemized Costs'!$G$${CT.first}:$G$${Math.max(CT.last, CT.first)}`;

    /* ---------- Assets ---------- */
    const wsA = wb.addWorksheet('Assets', { properties: { tabColor: { argb: 'FFE9C46A' } } });
    titleBlock(wsA, `Inventory Assets — unsold stock as of ${U.fmtDate(m.asOf)}`, `Valued at cost (purchase price) and at list (selling price). ${periodText}`, ctx, 10);
    const assetRows = [...m.assets].sort((a, b) => (a.datePosted || '').localeCompare(b.datePosted || ''));
    const A = addTable(wsA, 6, [
      { label: 'SKU', key: 'sku', width: 9, align: 'center' },
      { label: 'Item Name', key: 'name', width: 38 },
      { label: 'Category', key: 'category', width: 18 },
      { label: 'Status', key: 'status', width: 11 },
      { label: 'Date Posted', key: 'datePosted', type: 'date', fmt: DATE_FMT, width: 14 },
      { label: 'Days Listed', get: (r) => r.datePosted ? U.daysBetween(r.datePosted, m.asOf) : null, fmt: '0', width: 11, total: 'avg' },
      { label: 'Age', get: (r) => { const d = r.datePosted ? U.daysBetween(r.datePosted, m.asOf) : 0; return d >= settings.staleDays ? 'Stale' : d >= settings.agingDays ? 'Aging' : 'Fresh'; }, width: 9, align: 'center' },
      { label: 'Cost (Purchase)', get: (r) => r.purchasePrice ?? 0, fmt: money, total: true, width: 14 },
      { label: 'List Value', get: (r) => r.sellingPrice ?? 0, fmt: money, total: true, width: 13 },
      { label: 'Potential Profit', get: (r, rn) => ({ formula: `I${rn}-H${rn}`, result: U.round2((r.sellingPrice ?? 0) - (r.purchasePrice ?? 0)) }), fmt: money, total: true, width: 14 }
    ], assetRows, {
      totals: true, freezeCols: 2,
      rowFill: (r) => { const d = r.datePosted ? U.daysBetween(r.datePosted, m.asOf) : 0; return d >= settings.staleDays ? C.stale : d >= settings.agingDays ? C.aging : null; }
    });

    /* ---------- Summary (first tab) ---------- */
    ws.getColumn(1).width = 3; ws.getColumn(2).width = 44; ws.getColumn(3).width = 18; ws.getColumn(4).width = 4; ws.getColumn(5).width = 34; ws.getColumn(6).width = 18;
    titleBlock(ws, 'Financial Summary — Profit & Loss, Taxes and Assets', periodText, ctx, 6);
    let r = 6;
    const section = (row, col, text) => { const c = ws.getCell(row, col); c.value = text; c.font = { bold: true, color: { argb: C.white } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } }; const c2 = ws.getCell(row, col + 1); c2.fill = c.fill; };
    const line = (row, col, label, value, { bold, indent, fmt = money, total, note } = {}) => {
      const a = ws.getCell(row, col), b = ws.getCell(row, col + 1);
      a.value = label; a.alignment = { indent: indent ? 2 : 0 }; b.value = value; b.numFmt = fmt;
      a.font = { bold: !!bold, color: indent ? { argb: C.text2 } : undefined }; b.font = { bold: !!bold };
      a.border = b.border = { bottom: { style: 'hair', color: { argb: C.line } } };
      if (total) { [a, b].forEach((c) => { c.border = { top: { style: 'thin' }, bottom: { style: 'double' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.soft } }; }); }
      if (note) { a.note = note; }
      return `${colLetter(col + 1)}${row}`;
    };
    const salesCol = (L) => ST ? `Sales!${L}${ST}` : '0';
    // P&L on columns B/C
    section(r, 2, 'PROFIT & LOSS'); r++;
    const rGross = line(r++, 2, 'Gross sales', { formula: salesCol('H'), result: m.gross }, { bold: true });
    const rFees = line(r++, 2, 'Less: platform fees & adjustments', { formula: `-${salesCol('I')}`, result: -m.fees }, { indent: true });
    const rNet = line(r++, 2, 'Net sales (total after fees)', { formula: `${rGross}+${rFees}`, result: m.net }, { bold: true });
    const rCogs = line(r++, 2, 'Less: cost of goods sold', { formula: `-${salesCol('K')}`, result: -m.cogs }, { indent: true });
    const rShip = line(r++, 2, 'Less: shipping costs', { formula: `-${salesCol('L')}`, result: -m.shipping }, { indent: true });
    const rRef = m.refunds ? line(r++, 2, 'Less: refunds & return shipping', { formula: `${-m.refunds}`, result: -m.refunds }, { indent: true }) : null;
    const rGP = line(r++, 2, 'Gross profit', { formula: `${rNet}+${rCogs}+${rShip}${rRef ? '+' + rRef : ''}`, result: m.grossProfit }, { bold: true });
    const expCats = Object.entries(m.expByCat).sort((a, b) => b[1] - a[1]);
    const expRefs = [];
    expCats.forEach(([cat, amt]) => {
      const safe = cat.replace(/"/g, '""');
      expRefs.push(line(r++, 2, `Less: ${cat}`, { formula: `-SUMIFS(${costAmt},${costRange},"Operating expense",'Itemized Costs'!$C$${CT.first}:$C$${Math.max(CT.last, CT.first)},"${safe}")`, result: -amt }, { indent: true }));
    });
    if (!expCats.length) expRefs.push(line(r++, 2, 'Less: operating expenses', 0, { indent: true }));
    if (m.mileageDeduction) expRefs.push(line(r++, 2, `Less: mileage (${U.int(m.miles)} mi, IRS standard rate)`, { formula: m.trips.length ? `-Mileage!H${6 + m.trips.length + 1}` : '0', result: -m.mileageDeduction }, { indent: true }));
    if (m.writeOffs) expRefs.push(line(r++, 2, `Less: inventory written off (${m.writtenOff.length} donated/lost)`, -m.writeOffs, { indent: true }));
    const rNP = line(r++, 2, 'Net profit (before tax)', { formula: `${rGP}+${expRefs.join('+')}`, result: m.netProfit }, { bold: true, total: true });
    r++;
    section(r, 2, 'ESTIMATED TAXES'); r++;
    const rTaxable = line(r++, 2, 'Taxable profit (if positive)', { formula: `MAX(0,${rNP})`, result: m.taxable });
    const rSE = line(r++, 2, `Self-employment tax (${settings.seTaxRate || 0}% × 92.35%)`, { formula: `ROUND(${rTaxable}*0.9235*${(settings.seTaxRate || 0) / 100},2)`, result: m.seTax }, { indent: true });
    const rInc = line(r++, 2, `Income tax (${settings.incomeTaxRate || 0}%)`, { formula: `ROUND(${rTaxable}*${(settings.incomeTaxRate || 0) / 100},2)`, result: m.incomeTax }, { indent: true });
    const rTT = line(r++, 2, 'Total estimated income taxes', { formula: `${rSE}+${rInc}`, result: m.totalTax }, { bold: true });
    line(r++, 2, 'Net profit after estimated taxes', { formula: `${rNP}-${rTT}`, result: m.afterTax }, { bold: true, total: true });
    line(r++, 2, `Sales tax collected (${settings.salesTaxRate || 0}% of gross)`, { formula: `ROUND(${rGross}*${(settings.salesTaxRate || 0) / 100},2)`, result: m.salesTax }, { indent: true, note: 'Pass-through liability; not included in profit. Leave the rate at 0% if marketplaces collect sales tax for you.' });
    const pnlEnd = r;

    // Assets & KPIs on columns E/F
    let r2 = 6;
    section(r2, 5, `ASSETS (as of ${U.fmtDate(m.asOf)})`); r2++;
    const aT = A.totalRow;
    line(r2++, 5, 'Unsold items', m.assets.length, { fmt: '0' });
    line(r2++, 5, 'Inventory at cost', { formula: aT ? `Assets!H${aT}` : '0', result: m.invCost }, { bold: true });
    line(r2++, 5, 'Inventory at list value', { formula: aT ? `Assets!I${aT}` : '0', result: m.invRetail });
    line(r2++, 5, 'Potential gross profit on hand', { formula: aT ? `Assets!J${aT}` : '0', result: m.invPotential });
    line(r2++, 5, 'Average days listed (unsold)', m.avgAge ?? 0, { fmt: '0' });
    r2++;
    section(r2, 5, 'KEY METRICS'); r2++;
    line(r2++, 5, 'Items sold', m.soldCount, { fmt: '0' });
    line(r2++, 5, 'Average sale price', m.avgSale, {});
    line(r2++, 5, 'Average gross profit per item', m.avgProfit, {});
    line(r2++, 5, 'Gross margin', m.margin ?? 0, { fmt: PCT_FMT });
    line(r2++, 5, 'Net margin', m.netMargin ?? 0, { fmt: PCT_FMT });
    line(r2++, 5, 'Sell-through rate', m.sellThrough ?? 0, { fmt: PCT_FMT });
    line(r2++, 5, 'Average days to sell', m.avgDaysToSell ?? 0, { fmt: '0' });
    line(r2++, 5, 'Inventory purchased in period', m.purchaseTotal, { note: 'Sum of purchase prices for items with a Date Posted in the period.' });
    line(r2++, 5, 'Operating expenses in period', m.expenseTotal, {});

    let rn = Math.max(pnlEnd, r2) + 2;
    const n1 = ws.getCell(rn, 2);
    n1.value = 'Tax figures are planning estimates based on the rates in Settings and are not tax advice. Formulas link to the Sales, Itemized Costs and Assets sheets.';
    n1.font = { italic: true, size: 9, color: { argb: C.text2 } };
    ws.mergeCells(rn, 2, rn, 6);

    /* ---------- Taxes (monthly) ---------- */
    const wsT = wb.addWorksheet('Taxes', { properties: { tabColor: { argb: 'FF6B6FA8' } } });
    titleBlock(wsT, 'Taxes — monthly breakdown of estimated liability', periodText, ctx, 9);
    const byMonth = {};
    m.sold.forEach((it) => { const k = U.monthKey(it.dateSold) || 'Undated'; (byMonth[k] ||= { gross: 0, net: 0, cost: 0, exp: 0 }); byMonth[k].gross += it.sellingPrice || 0; byMonth[k].net += Calc.net(it); byMonth[k].cost += (it.purchasePrice || 0) + (it.shippingCost || 0); });
    m.expenses.forEach((e) => { const k = U.monthKey(e.date) || 'Undated'; (byMonth[k] ||= { gross: 0, net: 0, cost: 0, exp: 0 }); byMonth[k].exp += +e.amount || 0; });
    const monthRows = Object.keys(byMonth).sort().map((k) => ({ k, ...byMonth[k] }));
    const se = (settings.seTaxRate || 0) / 100, inc = (settings.incomeTaxRate || 0) / 100, stx = (settings.salesTaxRate || 0) / 100;
    addTable(wsT, 6, [
      { label: 'Month', get: (x) => x.k === 'Undated' ? 'Undated' : U.monthLabel(x.k), width: 12 },
      { label: 'Gross Sales', get: (x) => U.round2(x.gross), fmt: money, total: true, width: 14 },
      { label: 'Net After Fees', get: (x) => U.round2(x.net), fmt: money, total: true, width: 14 },
      { label: 'COGS + Shipping', get: (x) => U.round2(x.cost), fmt: money, total: true, width: 15 },
      { label: 'Expenses', get: (x) => U.round2(x.exp), fmt: money, total: true, width: 13 },
      { label: 'Net Profit', get: (x, row) => ({ formula: `C${row}-D${row}-E${row}`, result: U.round2(x.net - x.cost - x.exp) }), fmt: money, total: true, width: 13 },
      { label: 'Est. SE Tax', get: (x, row) => ({ formula: `ROUND(MAX(0,F${row})*0.9235*${se},2)`, result: U.round2(Math.max(0, x.net - x.cost - x.exp) * 0.9235 * se) }), fmt: money, total: true, width: 13 },
      { label: 'Est. Income Tax', get: (x, row) => ({ formula: `ROUND(MAX(0,F${row})*${inc},2)`, result: U.round2(Math.max(0, x.net - x.cost - x.exp) * inc) }), fmt: money, total: true, width: 14 },
      { label: 'Sales Tax Collected', get: (x, row) => ({ formula: `ROUND(B${row}*${stx},2)`, result: U.round2(x.gross * stx) }), fmt: money, total: true, width: 15 }
    ], monthRows, { totals: true });
    const note = wsT.getCell(6 + monthRows.length + 3, 1);
    note.value = `Rates: income ${settings.incomeTaxRate || 0}%, self-employment ${settings.seTaxRate || 0}% on 92.35% of profit, sales tax ${settings.salesTaxRate || 0}%. Monthly estimates treat each month independently (losses are not carried forward); the Summary sheet nets the full period.`;
    note.font = { italic: true, size: 9, color: { argb: C.text2 } };

    /* ---------- Expenses ---------- */
    const wsE = wb.addWorksheet('Expenses');
    titleBlock(wsE, 'Operating Expenses', periodText, ctx, 7);
    addTable(wsE, 6, [
      { label: 'Date', key: 'date', type: 'date', fmt: DATE_FMT, width: 14 },
      { label: 'Category', key: 'category', width: 20 },
      { label: 'Vendor', key: 'vendor', width: 20 },
      { label: 'Description', key: 'description', width: 40 },
      { label: 'Payment', key: 'payment', width: 14 },
      { label: 'Amount', get: (e) => +e.amount || 0, fmt: money, total: true, width: 13 },
      { label: 'Notes', key: 'notes', width: 30 }
    ], [...m.expenses].sort((a, b) => (a.date || '').localeCompare(b.date || '')), { totals: true });

    /* ---------- Mileage ---------- */
    if (m.trips.length) {
      const wsM = wb.addWorksheet('Mileage', { properties: { tabColor: { argb: 'FF5B6472' } } });
      titleBlock(wsM, 'Mileage log — business miles at the IRS standard rate', periodText, ctx, 9);
      addTable(wsM, 6, [
        { label: 'Date', key: 'date', type: 'date', fmt: DATE_FMT, width: 13 },
        { label: 'Purpose', key: 'purpose', width: 22 },
        { label: 'From', key: 'from', width: 20 },
        { label: 'To', key: 'to', width: 20 },
        { label: 'Miles', get: (t) => Calc.tripMiles(t), fmt: '0.0', total: true, width: 9 },
        { label: 'Round Trip', get: (t) => (t.roundTrip ? 'Yes' : 'No'), width: 10, align: 'center' },
        { label: 'Rate', get: (t) => Calc.mileageRate(t.date, settings.mileageRates), fmt: '"$"0.000', width: 9 },
        { label: 'Deduction', get: (t, rn) => ({ formula: `ROUND(E${rn}*G${rn},2)`, result: Calc.tripDeduction(t, settings.mileageRates) }), fmt: money, total: true, width: 12 },
        { label: 'Notes', key: 'notes', width: 30 }
      ], [...m.trips].sort((a, b) => a.date.localeCompare(b.date)), { totals: true });
    }

    /* ---------- What sells: brand, size, category, source ---------- */
    {
      const wsW = wb.addWorksheet('What Sells', { properties: { tabColor: { argb: 'FFB5527F' } } });
      titleBlock(wsW, 'What sells — performance by brand, size, category and source (all items)', `Sell-through = sold ÷ (sold + in stock). Generated ${new Date().toLocaleString()}`, ctx, 10);
      let row = 6;
      const block = (title, rows) => {
        const t = wsW.getCell(row, 1); t.value = title; t.font = { bold: true, size: 12, color: { argb: C.ink } }; row += 1;
        const res = addTable(wsW, row, [
          { label: title.replace(/^By /, ''), key: 'key', width: 26 },
          { label: 'Items', key: 'items', width: 8 },
          { label: 'In Stock', key: 'inStock', width: 9 },
          { label: 'Sold', key: 'sold', width: 8 },
          { label: 'Sell-through', key: 'sellThrough', fmt: PCT_FMT, width: 12 },
          { label: 'Avg Days to Sell', get: (r) => (r.avgDays === null ? null : Math.round(r.avgDays)), fmt: '0', width: 12 },
          { label: 'Cost (all)', key: 'cost', fmt: money, width: 12 },
          { label: 'Gross Sales', key: 'gross', fmt: money, width: 12 },
          { label: 'Profit', key: 'profit', fmt: money, width: 12 },
          { label: 'ROI', get: (r) => r.roi, fmt: PCT_FMT, width: 9 }
        ], rows, {});
        row = res.last + 3;
      };
      const sortRows = (rows) => rows.sort((a, b) => b.sold - a.sold || b.items - a.items);
      block('By Brand', sortRows(Calc.groupPerf(items, (i) => i.brand)));
      block('By Size', sortRows(Calc.groupPerf(items, (i) => i.size)));
      block('By Category', sortRows(Calc.groupPerf(items, (i) => i.category)));
      block('By Source', sortRows(Calc.groupPerf(items, (i) => i.source)));
      wsW.autoFilter = undefined; wsW.views = [];
    }

    /* ---------- Platform sales by year (compare with Form 1099-K) ---------- */
    {
      const years = [...new Set(items.filter(Calc.isSold).map((i) => (i.dateSold || '').slice(0, 4)).filter(Boolean))].sort().reverse();
      if (years.length) {
        const wsK = wb.addWorksheet('1099-K Check', { properties: { tabColor: { argb: 'FF7B4FA0' } } });
        titleBlock(wsK, 'Sales by platform and year — compare with any Form 1099-K you receive', 'A platform must send a 1099-K when your gross payments exceed $20,000 AND you have more than 200 transactions in the year (federal threshold; some states are lower).', ctx, 6);
        const rows = years.flatMap((y) => Calc.platformYear(items, y).map((r) => ({ ...r, year: y })));
        addTable(wsK, 6, [
          { label: 'Year', key: 'year', width: 8 },
          { label: 'Platform', key: 'platform', width: 22 },
          { label: 'Transactions', key: 'count', width: 12 },
          { label: 'Gross Sales', key: 'gross', fmt: money, width: 14 },
          { label: 'Net After Fees', key: 'net', fmt: money, width: 14 },
          { label: 'Over 1099-K Threshold?', get: (r) => (r.over ? 'Yes — expect a 1099-K' : 'No'), width: 22 }
        ], rows, {});
      }
    }

    /* ---------- Platforms (fee settings + performance in period) ---------- */
    if (platforms.length) {
      const wsP = wb.addWorksheet('Platforms', { properties: { tabColor: { argb: 'FF3A7BD5' } } });
      titleBlock(wsP, 'Platforms — fee settings and results for the period', periodText, ctx, 17);
      const lc = (s) => String(s || '').toLowerCase();
      const pRows = platforms.map((p) => {
        const sold = m.sold.filter((i) => lc(i.platform) === lc(p.name));
        const gross = sold.reduce((a, i) => a + (i.sellingPrice || 0), 0);
        const net = sold.reduce((a, i) => a + Calc.net(i), 0);
        const listed = items.filter((i) => !Calc.isSold(i) && (i.listings || []).some((l) => lc(l.platform) === lc(p.name))).length;
        const est = Calc.platformEstimate(p, 40);
        return { ...p, soldN: sold.length, gross: U.round2(gross), fees: U.round2(gross - net), listed, est40: est.fees,
          rule: [`${+p.feePct || 0}%`, +p.feeFixed ? `+ ${U.money(p.feeFixed)}` : '', +p.feeMin ? `(min ${U.money(p.feeMin)})` : '', +p.smallThreshold ? `under ${U.money(p.smallThreshold)}: ${p.smallFlat !== null && p.smallFlat !== '' && p.smallFlat !== undefined ? U.money(p.smallFlat) + ' flat' : (p.smallFixed !== null && p.smallFixed !== '' && p.smallFixed !== undefined ? '+' + U.money(p.smallFixed) : '')}` : ''].filter(Boolean).join(' '),
          proc: +p.procPct || +p.procFixed ? `${+p.procPct || 0}% + ${U.money(+p.procFixed || 0)}` : '—',
          extrasText: (p.extras || []).map((x) => `${x.label || 'Cost'}: ${x.kind === 'pct' ? (+x.amount || 0) + '%' : U.money(x.amount) + (x.kind === 'month' ? '/mo' : '/sale')}`).join('; ') };
      });
      addTable(wsP, 6, [
        { label: 'Platform', key: 'name', width: 20 },
        { label: 'Active', get: (r) => (r.active === false ? 'Hidden' : 'Yes'), width: 8, align: 'center' },
        { label: 'Selling Fee Rule', get: (r) => r.ruleText || r.rule, width: 34 },
        { label: 'Payment Processing', key: 'proc', width: 16 },
        { label: 'Fees on Shipping', get: (r) => (r.feeOnShipping ? 'Yes' : 'No'), width: 10, align: 'center' },
        { label: 'Listing Fee', get: (r) => +r.listingFee || 0, fmt: money, width: 11 },
        { label: 'Additional Costs', key: 'extrasText', width: 32 },
        { label: 'Shipping Paid By', get: (r) => ({ buyer: 'Buyer', seller: 'Seller', varies: 'Varies' })[r.shipPaidBy] || 'Buyer', width: 11 },
        { label: 'Typical Shipping', get: (r) => (r.shipCharge === null || r.shipCharge === '' || r.shipCharge === undefined ? null : +r.shipCharge), fmt: money, width: 12 },
        { label: 'Your Shipping Cost', get: (r) => +r.sellerShipCost || 0, fmt: money, width: 12 },
        { label: 'Est. Fees on $40', key: 'est40', fmt: money, width: 12 },
        { label: 'Listed Now', key: 'listed', width: 9, total: true },
        { label: 'Sold (period)', key: 'soldN', width: 9, total: true },
        { label: 'Gross (period)', key: 'gross', fmt: money, width: 13, total: true },
        { label: 'Actual Fees (period)', key: 'fees', fmt: money, width: 13, total: true },
        { label: 'Avg Fee %', get: (r, rn) => ({ formula: `IFERROR(O${rn}/N${rn},0)`, result: r.gross ? r.fees / r.gross : 0 }), fmt: PCT_FMT, width: 9 },
        { label: 'Notes', key: 'notes', width: 50 }
      ], pRows, { totals: true, freezeCols: 1 });
      wsP.eachRow((row, rn) => { if (rn > 6) row.eachCell((c) => { c.alignment = { ...(c.alignment || {}), vertical: 'top', wrapText: true }; }); });
    }

    /* ---------- Full inventory (all columns) ---------- */
    const wsI = wb.addWorksheet('Full Inventory');
    const invRows = [...items].sort((a, b) => (a.datePosted || '').localeCompare(b.datePosted || ''));
    const withPhotos = !!photos && invRows.some((r) => photos[r.id]);
    titleBlock(wsI, 'Full Inventory — every item, all columns', `Green = sold · Amber = aging (${settings.agingDays}+ days) · Red = stale (${settings.staleDays}+ days). Generated ${new Date().toLocaleString()}`, ctx, withPhotos ? 28 : 27);
    const fillFor = (it) => ({ sold: C.sold, aging: C.aging, stale: C.stale, pending: C.pending })[Calc.ageClass(it, settings)] || null;
    const FI = addTable(wsI, 6, [
      ...(withPhotos ? [{ label: 'Photo', get: () => null, width: 11 }] : []),
      { label: 'Item Name', key: 'name', width: 38 },
      { label: 'Category', key: 'category', width: 18 },
      { label: 'SKU', key: 'sku', width: 8, align: 'center' },
      { label: 'Purchase Price', get: (r) => r.purchasePrice ?? null, fmt: money, total: true, width: 13 },
      { label: 'Selling Price', get: (r) => r.sellingPrice ?? null, fmt: money, total: true, width: 13 },
      { label: 'Status', key: 'status', width: 11 },
      { label: 'Platform it sold', key: 'platform', width: 13 },
      { label: 'Listed On', get: (r) => (r.listings || []).map((l) => l.platform).filter(Boolean).join(', ') || null, width: 20 },
      { label: 'Listing Links', get: (r) => (r.listings || []).map((l) => l.url).filter(Boolean).join('\n') || null, width: 44 },
      { label: 'Date Posted', key: 'datePosted', type: 'date', fmt: DATE_FMT, width: 14 },
      { label: 'Days Active', get: (r) => Calc.daysActive(r), fmt: '0', width: 10 },
      { label: 'Date Sold', key: 'dateSold', type: 'date', fmt: DATE_FMT, width: 14 },
      { label: 'Total After Fees', get: (r) => r.totalAfterFees ?? null, fmt: money, total: true, width: 14 },
      { label: 'Fees', get: (r) => Calc.fees(r), fmt: money, total: true, width: 11 },
      { label: 'Shipping Cost', get: (r) => r.shippingCost ?? null, fmt: money, total: true, width: 12 },
      { label: 'Profit', get: (r) => Calc.profit(r), fmt: money, total: true, width: 12 },
      { label: 'Brand', key: 'brand', width: 16 }, { label: 'Size', key: 'size', width: 8 }, { label: 'Color', key: 'color', width: 10 }, { label: 'Condition', key: 'condition', width: 14 }, { label: 'Material', key: 'material', width: 14 },
      { label: 'Measurements', key: 'measurements', width: 22 }, { label: 'Weight', key: 'weight', width: 9 }, { label: 'Location', key: 'location', width: 12 },
      { label: 'Source', key: 'source', width: 18 }, { label: 'Purchase Date', key: 'purchaseDate', type: 'date', fmt: DATE_FMT, width: 13 },
      { label: 'Lowest Price', get: (r) => r.minPrice ?? null, fmt: money, width: 11 },
      { label: 'Notes', key: 'notes', width: 30 }
    ], invRows, { totals: true, totalsLabel: 'TOTAL  (Total Purchase · Inventory Estimate · Total Made)', freezeCols: withPhotos ? 2 : 1, rowFill: fillFor });
    if (withPhotos) {
      invRows.forEach((r, i) => {
        const ph = photos[r.id];
        const rowNum = FI.first + i;
        const row = wsI.getRow(rowNum);
        row.height = 50;
        row.eachCell({ includeEmpty: true }, (c) => { c.alignment = { ...(c.alignment || {}), vertical: 'middle' }; });
        if (!ph || !ph.thumb) return;
        try {
          const id = wb.addImage({ base64: ph.thumb, extension: 'jpeg' });
          const ratio = ph.w && ph.h ? ph.w / ph.h : 1;
          const box = 60, w = ratio >= 1 ? box : Math.round(box * ratio), h = ratio >= 1 ? Math.round(box / ratio) : box;
          wsI.addImage(id, { tl: { col: 0.12 + (box - w) / 2 / 80, row: rowNum - 1 + 0.08 + (box - h) / 2 / 66 }, ext: { width: w, height: h }, editAs: 'oneCell' });
        } catch (_) { /* skip unreadable image */ }
      });
    }

    // print setup
    wb.worksheets.forEach((w) => { w.pageSetup = { orientation: w.name === 'Summary' ? 'portrait' : 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .2, footer: .2 } }; w.headerFooter = { oddFooter: `&L${ctx.company}&C${w.name}&RPage &P of &N` }; });

    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ================= Excel import (your original sheet layout) ================= */
  /* Fields the Excel importer can fill, with the header names it looks for (exact/starts-with first, then "contains"). */
  const XL_FIELDS = [
    { key: 'name', label: 'Item Name', names: ['item name', 'item', 'name', 'title', 'product', 'description'] },
    { key: 'category', label: 'Category', names: ['category', 'type'] },
    { key: 'sku', label: 'SKU', names: ['sku', 'item #', 'item number', 'stock'] },
    { key: 'purchasePrice', label: 'Purchase Price', names: ['purchase price', 'purchase', 'cost', 'paid'] },
    { key: 'sellingPrice', label: 'Selling Price', names: ['selling price', 'sale price', 'list price', 'listing price', 'asking price', 'price'] },
    { key: 'status', label: 'Status', names: ['status', 'sold?', 'state'] },
    { key: 'platform', label: 'Platform (it sold / is listed on)', names: ['platform it sold', 'platform sold', 'platform', 'platforms', 'sold on', 'selling platform', 'sales platform', 'listing platform', 'marketplace', 'site', 'where listed', 'where sold', 'channel'] },
    { key: 'listedOn', label: 'Listed On (extra platforms)', names: ['listed on', 'listings', 'where listed', 'cross listed', 'crosslisted', 'also listed'] },
    { key: 'links', label: 'Listing Links (URLs)', names: ['listing links', 'listing link', 'listing url', 'links', 'link', 'url', 'urls'] },
    { key: 'datePosted', label: 'Date Posted', names: ['date posted', 'posted', 'date listed', 'listed date', 'list date'] },
    { key: 'dateSold', label: 'Date Sold', names: ['date sold', 'sold date', 'sale date'] },
    { key: 'totalAfterFees', label: 'Total After Fees', names: ['total after fees', 'after fees', 'net', 'payout', 'total made'] },
    { key: 'shippingCost', label: 'Shipping Cost', names: ['shipping cost', 'shipping', 'postage'] },
    { key: 'brand', label: 'Brand', names: ['brand', 'designer', 'maker', 'label'] },
    { key: 'size', label: 'Size', names: ['size'] },
    { key: 'color', label: 'Color', names: ['color', 'colour'] },
    { key: 'condition', label: 'Condition', names: ['condition'] },
    { key: 'material', label: 'Material', names: ['material', 'materials', 'fabric', 'fabric content'] },
    { key: 'measurements', label: 'Measurements', names: ['measurements', 'measurement'] },
    { key: 'weight', label: 'Weight', names: ['weight'] },
    { key: 'location', label: 'Storage Location', names: ['location', 'storage', 'bin', 'shelf'] },
    { key: 'source', label: 'Source', names: ['source', 'sourced', 'bought at', 'store', 'where bought'] },
    { key: 'purchaseDate', label: 'Purchase Date', names: ['purchase date', 'date purchased', 'bought on', 'acquired'] },
    { key: 'minPrice', label: 'Lowest Price', names: ['lowest price', 'min price', 'minimum price', 'floor'] },
    { key: 'notes', label: 'Notes', names: ['notes', 'note', 'comments'] }
  ];
  function autoColumns(headers) {
    const col = {}, used = new Set();
    const tryMatch = (f, mode) => {
      for (const n of f.names) {
        const h = headers.find((x) => !used.has(x.i) && (mode === 'exact' ? x.key === n : mode === 'start' ? x.key.startsWith(n) : n.length >= 4 && x.key.includes(n)));
        if (h) return h;
      }
      return null;
    };
    ['exact', 'start', 'contains'].forEach((mode) => XL_FIELDS.forEach((f) => {
      if (col[f.key]) return;
      const h = tryMatch(f, mode);
      if (h) { col[f.key] = h.i; used.add(h.i); }
    }));
    return col;
  }

  /** Open a workbook and locate the inventory sheet. Returns headers, auto-detected columns and a parse(columns) function. */
  async function loadInventorySheet(arrayBuffer) {
    if (!global.ExcelJS) throw new Error('Excel library failed to load.');
    const wb = new global.ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const findHeader = (ws) => {
      for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
        const vals = ws.getRow(r).values.map((v) => String(cellVal(v) ?? '').trim().toLowerCase());
        if (vals.some((v) => v.startsWith('item name') || v === 'item' || v === 'name' || v === 'title')) return { r, vals };
      }
      return null;
    };
    const sheets = [...wb.worksheets].sort((a, b) => (b.name === 'Full Inventory') - (a.name === 'Full Inventory'));
    let ws = null, hdr = null;
    for (const w of sheets) { const h = findHeader(w); if (h) { ws = w; hdr = h; break; } }
    if (!ws) throw new Error('Could not find a header row with an "Item Name" column in any sheet.');
    const headerRow = hdr.r;
    const headers = [];
    ws.getRow(headerRow).eachCell({ includeEmpty: false }, (c, i) => { const label = String(cellVal(c.value) ?? '').trim(); if (label) headers.push({ i, label, key: label.toLowerCase().replace(/\s+/g, ' ') }); });
    const auto = autoColumns(headers);
    const splitPlatforms = (v) => String(v || '').split(/\s*[,;\/|\n]\s*|\s+&\s+|\s+and\s+/i).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const isUrl = (x) => /^(https?:\/\/|www\.)/i.test(String(x || '').trim());

    function parse(col) {
      const out = [];
      ws.eachRow((row, rn) => {
        if (rn <= headerRow) return;
        const g = (c) => (c ? cellVal(row.getCell(c).value) : null);
        const link = (c) => { if (!c) return ''; const cell = row.getCell(c); const h = cell.hyperlink || (cell.value && cell.value.hyperlink); return h && isUrl(h) ? String(h).trim() : ''; };
        const name = g(col.name);
        if (name === null || String(name).trim() === '' || /^total/i.test(String(name).trim())) return;
        const rawStatus = String(g(col.status) ?? '').trim().toLowerCase();
        let dateSold = toISOFromCell(g(col.dateSold));
        const status = rawStatus || (dateSold ? 'sold' : 'available');
        if (status !== 'sold') dateSold = ''; // original sheet uses =TODAY() for unsold rows
        const platCell = g(col.platform);
        const platforms = splitPlatforms(platCell).filter((x) => !isUrl(x));
        const listedOn = splitPlatforms(g(col.listedOn)).filter((x) => !isUrl(x));
        const links = [
          ...String(g(col.links) || '').split(/[\s,]+/), ...String(platCell || '').split(/[\s,]+/), ...String(g(col.listedOn) || '').split(/[\s,]+/),
          link(col.links), link(col.platform), link(col.listedOn), link(col.name)
        ].map((x) => String(x || '').trim()).filter(isUrl);
        // listings: every platform named (platform column + Listed On), plus links (hyperlinked cells count too)
        const listings = [];
        [...platforms, ...listedOn].forEach((p) => { if (!listings.some((l) => l.platform === p)) listings.push({ platform: p, url: '' }); });
        [...new Set(links)].forEach((u) => {
          const guess = U.platformFromUrl(u);
          const slot = listings.find((l) => !l.url && (!guess || l.platform === guess));
          if (slot) { slot.url = u; } else listings.push({ platform: guess, url: u });
        });
        const rec = { name: String(name).trim(), status, platform: platforms[0] || listedOn[0] || '', dateSold, listings };
        const set = (k, v) => { if (col[k]) rec[k] = v; };
        set('category', String(g(col.category) || '').trim().toLowerCase());
        set('sku', g(col.sku) === null || g(col.sku) === '' ? '' : String(typeof g(col.sku) === 'number' ? Math.round(g(col.sku)) : g(col.sku)).trim());
        set('purchasePrice', U.num(g(col.purchasePrice)));
        set('sellingPrice', U.num(g(col.sellingPrice)));
        set('datePosted', toISOFromCell(g(col.datePosted)));
        set('totalAfterFees', U.num(g(col.totalAfterFees)));
        set('shippingCost', U.num(g(col.shippingCost)));
        set('notes', String(g(col.notes) || '').trim());
        ['brand', 'size', 'color', 'condition', 'material', 'measurements', 'weight', 'location', 'source'].forEach((k) => set(k, String(g(col[k]) ?? '').trim()));
        set('purchaseDate', toISOFromCell(g(col.purchaseDate)));
        set('minPrice', U.num(g(col.minPrice)));
        out.push(rec);
      });
      out.sheetName = ws.name;
      out.columns = Object.keys(col).filter((k) => col[k]);
      if (out.columns.includes('platform') || out.columns.includes('listedOn')) out.columns.push('platform');
      return out;
    }
    return { sheetName: ws.name, headers, auto, fields: XL_FIELDS, parse };
  }
  /** Back-compat helper: parse with auto-detected columns. */
  async function importInventoryXlsx(arrayBuffer) { const sh = await loadInventorySheet(arrayBuffer); return sh.parse(sh.auto); }

  function cellVal(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if ('result' in v) return v.result instanceof Date || typeof v.result !== 'object' ? (v.result ?? null) : null;
      if ('formula' in v || 'sharedFormula' in v) return null;
      if ('richText' in v) return v.richText.map((t) => t.text).join('');
      if ('text' in v) return typeof v.text === 'object' && v.text && v.text.richText ? v.text.richText.map((t) => t.text).join('') : v.text; // hyperlinked cell
    }
    return v;
  }
  function toISOFromCell(v) {
    if (!v) return '';
    if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return toISOFromCell(d); }
    return U.toISO(String(v));
  }

  global.Calc = Calc;
  global.Reports = { exportWorkbook, importInventoryXlsx, loadInventorySheet };
})(window);
