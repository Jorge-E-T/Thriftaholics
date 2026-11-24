/* =========================================================
   Fun: milestones (badges + celebration), Year in Review,
   and the guided first-launch tour.
   ========================================================= */
(function () {
  'use strict';
  const X = window.Ext, esc = X.esc;
  const T = () => window.TA;
  const S = () => window.TA.S();

  /* =====================================================
     MILESTONES
     ===================================================== */
  function facts() {
    const t = T(), items = t.state.items, sold = items.filter((i) => Calc.isSold(i));
    const byMonth = {}; sold.forEach((i) => { const k = (i.dateSold || '').slice(0, 7); if (k) byMonth[k] = (byMonth[k] || 0) + (+i.sellingPrice || 0); });
    const profit = sold.reduce((a, i) => a + (Calc.profit(i) || 0), 0);
    const maxSites = Math.max(0, ...items.map((i) => (i.listings || []).filter((l) => l.status === 'active' || l.status === 'sold').length));
    const hauls = Object.values(S().hauls || {});
    const haulBack = hauls.some((h) => { const its = items.filter((i) => i.haulId === h.id); const paid = +h.total || its.reduce((a, i) => a + (+i.purchasePrice || 0), 0); const net = its.filter((i) => Calc.isSold(i)).reduce((a, i) => a + Calc.net(i), 0); return paid > 0 && net >= paid; });
    return { sales: sold.length, bestMonth: Math.max(0, ...Object.values(byMonth)), profit, maxSites, bundles: sold.some((i) => i.orderSize > 1), haulBack, streak: X.routineStreak ? X.routineStreak() : 0, stock: items.length, health: X.health ? X.health() : { score: 0, n: 0 } };
  }
  const DEFS = [
    ...[[1, 'First sale!', '🎉'], [10, '10 sales', '🔟'], [25, '25 sales', '⭐'], [50, '50 sales', '🌟'], [100, '100 sales', '💯'], [250, '250 sales', '🚀'], [500, '500 sales', '👑'], [1000, '1,000 sales', '🏆']]
      .map(([n, t, i]) => ({ k: 'sales' + n, t, i, g: 'Sales', v: (f) => f.sales, goal: n })),
    ...[[500, '$500 month', '📅'], [1000, '$1,000 month', '💵'], [2500, '$2,500 month', '💰'], [5000, '$5,000 month', '🤑']].map(([n, t, i]) => ({ k: 'month' + n, t, i, g: 'Best month', v: (f) => f.bestMonth, goal: n, money: true })),
    ...[[1000, '$1k profit', '📈'], [5000, '$5k profit', '💎'], [10000, '$10k profit', '🏅'], [25000, '$25k profit', '🦄']].map(([n, t, i]) => ({ k: 'profit' + n, t, i, g: 'Total profit', v: (f) => f.profit, goal: n, money: true })),
    { k: 'xlist3', t: 'Cross-lister', i: '🔗', g: 'Skills', d: 'One item on 3+ sites', v: (f) => f.maxSites, goal: 3 },
    { k: 'bundle', t: 'Bundle boss', i: '🎁', g: 'Skills', d: 'Sold a bundle', v: (f) => (f.bundles ? 1 : 0), goal: 1 },
    { k: 'haul', t: 'Haul hero', i: '🛍️', g: 'Skills', d: 'A haul paid for itself', v: (f) => (f.haulBack ? 1 : 0), goal: 1 },
    { k: 'tidy', t: 'Spotless', i: '✨', g: 'Skills', d: 'Inventory health 90+', v: (f) => (f.health.n >= 10 ? f.health.score : 0), goal: 90 },
    { k: 'stock100', t: 'Big closet', i: '👗', g: 'Skills', d: '100 items in the app', v: (f) => f.stock, goal: 100 },
    { k: 'streak7', t: '7-day streak', i: '🔥', g: 'Routine', d: 'Daily routine 7 days running', v: (f) => f.streak, goal: 7 },
    { k: 'streak30', t: '30-day streak', i: '☄️', g: 'Routine', d: 'Daily routine 30 days running', v: (f) => f.streak, goal: 30 }
  ];
  let checkTimer = null;
  function check(quiet) {
    if (!Store.unlocked) return;
    const m = (S().milestones ||= {}); const f = facts(); const fresh = [];
    const first = quiet || !S().milestonesSeen;
    DEFS.forEach((d) => { if (!m[d.k] && d.v(f) >= d.goal) { m[d.k] = first ? 'earlier' : U.todayISO(); fresh.push(d); } });
    if (!fresh.length) { if (first && !S().milestonesSeen) { S().milestonesSeen = true; T().saveSettings(); } return; }
    T().saveSettings();
    if (first) { S().milestonesSeen = true; T().saveSettings(); return; }
    setTimeout(() => celebrate(fresh), 1600);
  }
  function celebrate(list) {
    const d = list[list.length - 1];
    const el = document.createElement('div'); el.className = 'ms-pop';
    el.innerHTML = `<div class="ms-card"><div class="ms-badge">${d.i}</div><div class="ms-kick">Milestone unlocked</div><div class="ms-t">${esc(d.t)}</div>${list.length > 1 ? `<div class="ms-more">+ ${list.length - 1} more</div>` : ''}</div>${Array.from({ length: 26 }, (_, i) => `<i class="cf" style="--x:${Math.random() * 100}vw;--d:${0.6 + Math.random() * 1.2}s;--r:${Math.random() * 720 - 360}deg;--c:${['#e7b84f', '#2a7a70', '#c2413b', '#6b6fa8', '#2f8a57'][i % 5]}"></i>`).join('')}`;
    document.body.appendChild(el);
    el.addEventListener('click', () => el.remove());
    setTimeout(() => el.classList.add('out'), 3400); setTimeout(() => el.remove(), 4000);
  }
  function renderCard() {
    const box = X.$('#milestonesCard'); if (!box) return;
    const m = S().milestones || {}, f = facts();
    const earned = DEFS.filter((d) => m[d.k]);
    // next goal in each group
    const groups = [...new Set(DEFS.map((d) => d.g))];
    const next = groups.map((g) => DEFS.find((d) => d.g === g && !m[d.k])).filter(Boolean).slice(0, 4);
    box.innerHTML = `<div class="card ms-card-dash">
      <div class="card-head"><h3>🏆 Milestones <span class="pill">${earned.length}/${DEFS.length}</span></h3><button type="button" class="btn btn-sm btn-gold" data-yir>✨ Year in Review</button></div>
      <div class="ms-row">${earned.slice(-8).reverse().map((d) => `<div class="ms-b on" title="${esc(d.t)}"><span>${d.i}</span><b>${esc(d.t)}</b><em>${/^\d{4}-/.test(m[d.k]) ? esc(U.fmtDate(m[d.k])) : 'Earned'}</em></div>`).join('')}
        ${next.map((d) => { const v = d.v(f), p = Math.min(1, v / d.goal); return `<div class="ms-b" title="${esc(d.d || d.t)}"><span>${d.i}</span><b>${esc(d.t)}</b><em>${d.money ? U.money0(v) + ' / ' + U.money0(d.goal) : Math.floor(v) + ' / ' + d.goal}</em><i class="ms-p"><i style="width:${p * 100}%"></i></i></div>`; }).join('')}</div></div>`;
  }
  X.on('dashboard', () => { renderCard(); });
  X.on('commit', () => { clearTimeout(checkTimer); checkTimer = setTimeout(() => check(false), 400); });
  X.on('routineDone', () => check(false));
  X.on('init', () => {
    document.addEventListener('click', (e) => { if (e.target.closest('[data-yir]')) yearInReview(); });
    // first look after unlock: mark what's already earned without fanfare
    const wait = setInterval(() => { if (Store.unlocked && T().state.items) { clearInterval(wait); setTimeout(() => check(!S().milestonesSeen), 1500); } }, 800);
  });

  /* =====================================================
     YEAR IN REVIEW
     ===================================================== */
  function yearData(y) {
    const t = T(); const sold = t.state.items.filter((i) => Calc.isSold(i) && (i.dateSold || '').startsWith(String(y)));
    const m = Calc.metrics(t.state.items, t.state.expenses, S(), `${y}-01-01`, `${y}-12-31`, t.state.mileage);
    const months = Array.from({ length: 12 }, (_, k) => sold.filter((i) => +i.dateSold.slice(5, 7) === k + 1).reduce((a, i) => a + (+i.sellingPrice || 0), 0));
    const bestM = months.indexOf(Math.max(...months));
    const count = (key) => { const c = {}; sold.forEach((i) => { const v = (i[key] || '').trim(); if (v) c[v] = (c[v] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0] || null; };
    const flips = sold.filter((i) => i.purchasePrice != null).map((i) => ({ i, p: Calc.profit(i), roi: i.purchasePrice > 0 ? Calc.profit(i) / i.purchasePrice : null }));
    const best = flips.sort((a, b) => b.p - a.p)[0] || null;
    const bestRoi = flips.filter((x) => x.roi !== null).sort((a, b) => b.roi - a.roi)[0] || null;
    const fast = sold.map((i) => ({ i, d: Calc.daysActive(i) })).filter((x) => x.d !== null).sort((a, b) => a.d - b.d)[0] || null;
    const plat = {}; sold.forEach((i) => { const k = t.platformLabel(i.platform) || 'Other'; plat[k] = (plat[k] || 0) + (+i.sellingPrice || 0); });
    const dow = [0, 0, 0, 0, 0, 0, 0]; sold.forEach((i) => { const d = new Date(i.dateSold + 'T12:00'); if (!isNaN(d)) dow[d.getDay()]++; });
    const ms = Object.entries(S().milestones || {}).filter(([, d]) => (d || '').startsWith(String(y))).map(([k]) => DEFS.find((x) => x.k === k)).filter(Boolean);
    return { y, sold, m, months, bestM, brand: count('brand'), cat: count('category'), best, bestRoi, fast, plat, dow, ms };
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  function slides(d) {
    const t = T(); const th = (i) => (t.thumbOf(i) ? `<img class="yr-ph" src="${t.thumbOf(i)}" alt="">` : '<span class="yr-ph none">👗</span>');
    const S_ = [];
    S_.push(`<div class="yr-c"><img class="yr-logo" src="${(t.state.logo && t.state.logo.dataURL) || 'icons/brand-mark.png'}" alt=""><div class="yr-k">${esc(S().companyName || 'Thriftaholics')}</div><h2 class="script">Your ${d.y} in thrift</h2><p>Tap or press → to begin</p></div>`);
    if (!d.sold.length) { S_.push(d.y >= new Date().getFullYear() ? `<div class="yr-c"><h2>No sales in ${d.y} yet</h2><p>Come back when the first ones roll in — this recap fills itself in.</p></div>` : `<div class="yr-c"><h2>No sales recorded in ${d.y}</h2><p>Pick another year above to see its recap.</p></div>`); return S_; }
    S_.push(`<div class="yr-c"><div class="yr-k">You sold</div><div class="yr-big" data-count="${d.sold.length}">${d.sold.length}</div><div class="yr-k">${d.sold.length === 1 ? 'item' : 'items'} for</div><div class="yr-big gold" data-count="${d.m.gross}" data-money>${U.money0(d.m.gross)}</div></div>`);
    S_.push(`<div class="yr-c"><div class="yr-k">and kept</div><div class="yr-big" data-count="${d.m.netProfit}" data-money>${U.money0(d.m.netProfit)}</div><div class="yr-k">in profit${d.m.netMargin != null ? ` · a ${U.pct(d.m.netMargin)} margin` : ''}</div>${d.m.miles ? `<p>…after ${U.int(d.m.miles)} business miles and ${U.money0(d.m.expenseTotal)} of expenses.</p>` : ''}</div>`);
    const mx = Math.max(1, ...d.months);
    S_.push(`<div class="yr-c"><div class="yr-k">Your best month was</div><h2>${new Date(d.y, d.bestM, 1).toLocaleDateString(undefined, { month: 'long' })}</h2><div class="yr-bars">${d.months.map((v, k) => `<div class="${k === d.bestM ? 'top' : ''}"><i style="height:${Math.max(2, v / mx * 100)}%"></i><span>${MONTHS[k][0]}</span></div>`).join('')}</div><p>${U.money0(d.months[d.bestM])} in sales</p></div>`);
    if (d.brand || d.cat) S_.push(`<div class="yr-c"><div class="yr-k">Buyers couldn’t get enough of</div>${d.brand ? `<h2>${esc(d.brand[0])}</h2><p>${d.brand[1]} sold</p>` : ''}${d.cat ? `<div class="yr-k mt">Top category</div><h2 style="text-transform:capitalize">${esc(d.cat[0])}</h2><p>${d.cat[1]} sold</p>` : ''}</div>`);
    if (d.best) S_.push(`<div class="yr-c"><div class="yr-k">Flip of the year</div>${th(d.best.i)}<h3>${esc(d.best.i.name)}</h3><p>Bought for <b>${U.money(d.best.i.purchasePrice)}</b> · sold for <b>${U.money(d.best.i.sellingPrice)}</b></p><div class="yr-big gold">+${U.money0(d.best.p)}</div>${d.bestRoi && d.bestRoi.i !== d.best.i && d.bestRoi.roi > 1 ? `<p class="small">Best return: ${esc(d.bestRoi.i.name)} — ${Math.round(d.bestRoi.roi * 100)}% back on what you paid</p>` : ''}</div>`);
    if (d.fast) S_.push(`<div class="yr-c"><div class="yr-k">Fastest sale</div>${th(d.fast.i)}<h3>${esc(d.fast.i.name)}</h3><div class="yr-big">${d.fast.d === 0 ? 'Same day!' : d.fast.d + (d.fast.d === 1 ? ' day' : ' days')}</div><p>from listing to sold</p></div>`);
    const plat = Object.entries(d.plat).sort((a, b) => b[1] - a[1]);
    S_.push(`<div class="yr-c"><div class="yr-k">Where it sold</div><div class="yr-plats">${plat.slice(0, 6).map(([k, v], i) => `<div style="--w:${(v / plat[0][1]) * 100}%;--c:${(T().profileFor(k) || {}).color || '#2a7a70'};--i:${i}"><b>${esc(k)}</b><span>${U.money0(v)}</span></div>`).join('')}</div></div>`);
    const bd = d.dow.indexOf(Math.max(...d.dow));
    S_.push(`<div class="yr-c"><div class="yr-k">Your lucky day</div><h2>${DAYS[bd]}</h2><p>${d.dow[bd]} sales landed on a ${DAYS[bd].slice(0, -1)}.</p></div>`);
    if (d.ms.length) S_.push(`<div class="yr-c"><div class="yr-k">Milestones unlocked</div><div class="yr-ms">${d.ms.map((x) => `<div><span>${x.i}</span><b>${esc(x.t)}</b></div>`).join('')}</div></div>`);
    S_.push(`<div class="yr-c"><h2 class="script">Here’s to ${d.y + 1}!</h2><p>Thank you for keeping great clothes in circulation. 💚</p><div class="btn-row center"><button type="button" class="btn btn-gold" data-yr="pdf">Save as PDF</button><button type="button" class="btn" data-yr="close">Close</button></div></div>`);
    return S_;
  }
  async function yearInReview(year) {
    const t = T();
    // every year from your first record to this year, each with its number of sales
    const now = new Date().getFullYear();
    const yearsOf = (arr) => arr.map((v) => +String(v || '').slice(0, 4)).filter((v) => v > 1990 && v <= now);
    const first = Math.min(now, ...yearsOf(t.state.items.flatMap((i) => [i.dateSold, i.datePosted, i.purchaseDate])), ...yearsOf(t.state.expenses.map((e) => e.date)));
    const salesIn = {}; t.state.items.forEach((i) => { if (Calc.isSold(i) && i.dateSold) { const k = +i.dateSold.slice(0, 4); salesIn[k] = (salesIn[k] || 0) + 1; } });
    const years = []; for (let v = now; v >= first; v--) years.push(v);
    const withSales = years.filter((v) => salesIn[v]);
    let y = year || (salesIn[now] ? now : withSales[0] || now);
    const ov = document.createElement('div'); ov.className = 'yr';
    let idx = 0, ss = [];
    const render = () => {
      const d = yearData(y); ss = slides(d); idx = Math.min(idx, ss.length - 1);
      ov.innerHTML = `<div class="yr-top"><div class="yr-prog">${ss.map((_, i) => `<i class="${i < idx ? 'done' : i === idx ? 'on' : ''}"></i>`).join('')}</div>
          <div class="yr-bar"><div class="yr-years" role="tablist" aria-label="Year">${years.map((v) => `<button type="button" role="tab" class="yr-yt ${v === y ? 'on' : ''}" data-yy="${v}" aria-selected="${v === y}">${v}<em>${salesIn[v] ? salesIn[v] + ' sold' : 'no sales'}</em></button>`).join('')}</div><button type="button" class="yr-x" data-yr="close" aria-label="Close">✕</button></div></div>
        <div class="yr-stage"><button type="button" class="yr-nav l" data-yr="prev" aria-label="Back">‹</button><div class="yr-slide" style="--h:${(idx * 37) % 360}">${ss[idx]}</div><button type="button" class="yr-nav r" data-yr="next" aria-label="Next">›</button></div>`;
      ov.querySelectorAll('[data-count]').forEach((el) => { const to = +el.dataset.count, money = el.hasAttribute('data-money'); const t0 = performance.now(); const step = (n) => { const k = Math.min(1, (n - t0) / 900), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = money ? U.money0(v) : Math.round(v); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); });
      X.yrData = d;
    };
    const go = (n) => { idx = Math.max(0, Math.min(ss.length - 1, idx + n)); render(); };
    const close = () => { ov.classList.add('out'); document.removeEventListener('keydown', key); setTimeout(() => ov.remove(), 250); };
    const key = (e) => { if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') close(); };
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-yr]');
      const yt = e.target.closest('[data-yy]'); if (yt) { y = +yt.dataset.yy; idx = 0; render(); return; }
      if (b) { const a = b.dataset.yr; if (a === 'close') close(); else if (a === 'next') go(1); else if (a === 'prev') go(-1); else if (a === 'pdf') printYear(yearData(y)); return; }
      if (e.target.closest('.yr-top')) return;
      if (e.target.closest('.yr-stage')) go(e.clientX > window.innerWidth / 3 ? 1 : -1);
    });
    document.addEventListener('keydown', key);
    document.body.appendChild(ov); render();
  }
  X.yearInReview = yearInReview;
  function printYear(d) {
    const t = T(); const ctx = t.printCtx(); const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    const plat = Object.entries(d.plat).sort((a, b) => b[1] - a[1]); const mx = Math.max(1, ...d.months);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${d.y} Year in Review</title><style>
      @font-face { font-family: "Pacifico"; src: url(${base}fonts/pacifico.woff2) format("woff2"); }
      @page { size: letter; margin: 0.5in; } * { box-sizing: border-box; } body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1d2725; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .hero { background: linear-gradient(135deg, #164e47, #2a7a70); color: #fff8ec; border-radius: 18px; padding: 26px 30px; display: flex; gap: 22px; align-items: center; border-bottom: 6px solid #e7b84f; }
      .hero img { width: 90px; height: 90px; border-radius: 50%; background: #fff8ec; } .s { font-family: "Pacifico", cursive; } .hero h1 { margin: 0; font-size: 34pt; font-weight: 400; } .hero p { margin: 4px 0 0; opacity: .85; }
      .k { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; } .k div { border: 1px solid #e7dfcf; border-left: 5px solid #c9952e; border-radius: 10px; padding: 10px 12px; background: #fbf7ef; } .k span { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #6b7672; font-weight: 700; } .k b { font-size: 17pt; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; } h3 { color: #164e47; font-size: 11pt; text-transform: uppercase; letter-spacing: .08em; margin: 14px 0 8px; }
      .bars { display: flex; align-items: flex-end; gap: 4px; height: 110px; border-bottom: 1px solid #d6cdb9; } .bars div { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; } .bars i { width: 100%; background: #2a7a70; border-radius: 3px 3px 0 0; } .bars .top i { background: #e7b84f; } .bars span { font-size: 7pt; color: #6b7672; }
      .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #efe8da; font-size: 10.5pt; } .hl { background: #f6f1e7; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; } .hl b { color: #164e47; }
      .ft { margin-top: 18px; text-align: center; color: #8b9490; font-size: 8pt; }
    </style></head><body>
      <div class="hero"><img src="${ctx.logo || base + 'icons/brand-mark.png'}" alt=""><div><div style="text-transform:uppercase;letter-spacing:.2em;font-size:9pt;color:#e7b84f;font-weight:800">${esc(ctx.company || 'Thriftaholics')}</div><h1 class="s">${d.y} Year in Review</h1><p>${d.sold.length} items found new homes.</p></div></div>
      <div class="k"><div><span>Items sold</span><b>${d.sold.length}</b></div><div><span>Gross sales</span><b>${U.money0(d.m.gross)}</b></div><div><span>Net profit</span><b>${U.money0(d.m.netProfit)}</b></div><div><span>Avg sale</span><b>${U.money(d.m.avgSale)}</b></div></div>
      <h3>Sales by month</h3><div class="bars">${d.months.map((v, k) => `<div class="${k === d.bestM ? 'top' : ''}"><i style="height:${Math.max(1, v / mx * 100)}%"></i><span>${MONTHS[k]}</span></div>`).join('')}</div>
      <div class="two"><div><h3>Highlights</h3>
        ${d.best ? `<div class="hl">🏆 <b>Flip of the year:</b> ${esc(d.best.i.name)} — bought ${U.money(d.best.i.purchasePrice)}, sold ${U.money(d.best.i.sellingPrice)} (+${U.money(d.best.p)})</div>` : ''}
        ${d.fast ? `<div class="hl">⚡ <b>Fastest sale:</b> ${esc(d.fast.i.name)} in ${d.fast.d} day${d.fast.d === 1 ? '' : 's'}</div>` : ''}
        ${d.brand ? `<div class="hl">🏷️ <b>Top brand:</b> ${esc(d.brand[0])} (${d.brand[1]} sold)</div>` : ''}
        ${d.cat ? `<div class="hl">🗂️ <b>Top category:</b> ${esc(d.cat[0])} (${d.cat[1]} sold)</div>` : ''}
        <div class="hl">📅 <b>Best month:</b> ${MONTHS[d.bestM]} · <b>Lucky day:</b> ${DAYS[d.dow.indexOf(Math.max(...d.dow))]}</div></div>
        <div><h3>Where it sold</h3>${plat.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${U.money(v)}</b></div>`).join('')}
        ${d.ms.length ? `<h3>Milestones</h3>${d.ms.map((x) => `<div class="row"><span>${x.i} ${esc(x.t)}</span></div>`).join('')}` : ''}</div></div>
      <div class="ft">Made with the Thriftaholics app · ${esc(U.fmtDate(U.todayISO()))}</div></body></html>`;
    const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(fr);
    fr.contentWindow.document.open(); fr.contentWindow.document.write(html); fr.contentWindow.document.close();
    X.lastYearHtml = html;
    setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (_) { /* ignore */ } setTimeout(() => fr.remove(), 60000); }, 900);
    U.toast('Choose “Save as PDF” in the print window', 'ok');
  }

  /* =====================================================
     FIRST-LAUNCH TOUR
     ===================================================== */
  const TOUR_KEY = 'thrift-tour-done';
  const STEPS = [
    { title: 'Welcome to Thriftaholics! 👋', text: 'A 60-second tour of the essentials. You can skip it now and replay it any time from the Guide tab.' },
    { sel: '.tabs', title: 'Everything lives in these tabs', text: 'Dashboard for the big picture, Inventory for your items, Action Center for today’s to-dos, and Orders, Platforms, Expenses, Reports and Settings.' },
    { sel: '#btnAddItem', view: 'inventory', title: 'Add your items', text: 'Add one at a time — or bring in your spreadsheet with Import Excel. Click any cell to edit it like a spreadsheet.' },
    { sel: '#btnHauls', view: 'inventory', title: 'Back from a thrift run?', text: 'Hauls records the trip and spreads what you paid across the items, so every item has a cost and you can see when the haul pays for itself.' },
    { sel: '.tab[data-view="actions"]', title: 'Your daily to-do list', text: 'The Action Center lists what needs you: delists after a sale, price drops, relists, your daily routine and an inventory health score.' },
    { sel: '#btnSearch', title: 'Find anything', text: 'Search items, sales, expenses, settings and help from anywhere — or press Ctrl+K (⌘K on a Mac).' },
    { sel: '#undoDock', title: 'Mistakes? Undo.', text: 'Undo and Redo are always here, on every tab, and say exactly what they’ll undo.' },
    { sel: '#syncState', title: 'Share between devices', text: 'Cloud sync keeps phones and computers in step — encrypted with your app password. Click this to set it up.' },
    { sel: '.tab[data-view="guide"]', title: 'Want the details?', text: 'The Guide explains every feature step by step, with “Show me” buttons that point to the right spot. Happy thrifting!' }
  ];
  function startTour(force) {
    if (!force && (localStorage.getItem(TOUR_KEY) || navigator.webdriver)) return;
    let i = 0;
    const ov = document.createElement('div'); ov.className = 'tour';
    ov.innerHTML = '<div class="tour-ring"></div><div class="tour-card"></div>';
    document.body.appendChild(ov);
    const ring = ov.querySelector('.tour-ring'), card = ov.querySelector('.tour-card');
    let raf = 0;
    const place = () => {
      const st = STEPS[i]; const el = st.sel && document.querySelector(st.sel);
      const vis = el && el.getClientRects().length;
      if (vis) {
        const r = el.getBoundingClientRect(); const pad = 6;
        Object.assign(ring.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
        const cw = Math.min(360, window.innerWidth - 24), below = r.bottom + 16 + 190 < window.innerHeight;
        card.style.width = cw + 'px';
        card.style.left = Math.max(12, Math.min(window.innerWidth - cw - 12, r.left + r.width / 2 - cw / 2)) + 'px';
        if (window.innerWidth < 700) card.style.top = (r.top + r.height / 2 > window.innerHeight / 2 ? 16 : window.innerHeight - card.offsetHeight - 16) + 'px';
        else card.style.top = (below ? r.bottom + 16 : Math.max(12, r.top - 16 - card.offsetHeight)) + 'px';
        ov.classList.remove('center');
      } else { ring.style.display = 'none'; ov.classList.add('center'); card.style.left = ''; card.style.top = ''; card.style.width = ''; }
      raf = requestAnimationFrame(place);
    };
    const show = () => {
      const st = STEPS[i];
      if (st.view) T().showView(st.view);
      const el = st.sel && document.querySelector(st.sel); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
      card.innerHTML = `${i === 0 ? '<img class="tour-logo" src="icons/brand-mark.png" alt="">' : ''}<div class="tour-step">${i + 1} of ${STEPS.length}</div><h3>${st.title}</h3><p>${st.text}</p>
        <div class="tour-dots">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="tour-btns"><button type="button" class="btn btn-ghost btn-sm" data-t="skip">${i === STEPS.length - 1 ? 'Close' : 'Skip tour'}</button><span class="spacer"></span>${i ? '<button type="button" class="btn btn-sm" data-t="back">Back</button>' : ''}<button type="button" class="btn btn-primary btn-sm" data-t="next">${i === 0 ? 'Show me around' : i === STEPS.length - 1 ? 'Finish 🎉' : 'Next'}</button></div>`;
    };
    const end = () => { cancelAnimationFrame(raf); localStorage.setItem(TOUR_KEY, '1'); ov.classList.add('out'); document.removeEventListener('keydown', key); setTimeout(() => ov.remove(), 250); };
    const key = (e) => { if (e.key === 'Escape') end(); else if (e.key === 'ArrowRight') next(1); else if (e.key === 'ArrowLeft') next(-1); };
    const next = (n) => { i += n; if (i >= STEPS.length) { end(); T().showView('dashboard'); return; } i = Math.max(0, i); show(); };
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; if (b.dataset.t === 'skip') end(); else next(b.dataset.t === 'next' ? 1 : -1); });
    document.addEventListener('keydown', key);
    show(); place();
  }
  X.startTour = startTour;
  X.on('init', () => {
    // offer the tour once, after the first unlock and any welcome dialogs
    let tries = 0;
    const iv = setInterval(() => {
      if (++tries > 120) { clearInterval(iv); return; }
      if (!Store.unlocked || !document.getElementById('modal').classList.contains('hidden')) return;
      clearInterval(iv); setTimeout(() => { if (Store.unlocked && document.getElementById('modal').classList.contains('hidden')) startTour(false); }, 900);
    }, 1000);
  });
})();
