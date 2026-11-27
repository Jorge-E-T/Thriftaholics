/* =========================================================
   Joy: share cards for social media, seasonal touches,
   monthly-goal celebrations & streaks, smart price suggestions,
   and "What's new" after updates.
   ========================================================= */
(function () {
  'use strict';
  const X = window.Ext, esc = X.esc;
  const T = () => window.TA;
  const S = () => window.TA.S();
  const m0 = (v) => U.money(Math.round(+v || 0)).replace(/\.00$/, '');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =====================================================
     SHARE CARDS (Instagram / Facebook / Stories)
     ===================================================== */
  const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function cover(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  function fitText(ctx, text, maxW, size, weight, family, minSize = 28) {
    let s = size; do { ctx.font = `${weight} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) return s; s -= 2; } while (s > minSize);
    return s;
  }
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/); const lines = []; let line = '';
    words.forEach((w) => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
    return lines;
  }
  async function drawCard(it, { kind = 'sale', format = 'post' } = {}) {
    const t = T();
    const W = 1080, H = format === 'story' ? 1920 : 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    try { await Promise.race([document.fonts.load('64px Pacifico'), new Promise((r) => setTimeout(r, 1200))]); } catch (_) { /* fall back to the default font */ }
    const fam = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    const full = X.photoFiles ? (await X.photoFiles(it))[0] : null;
    const photo = await loadImg((full && full.data) || t.thumbOf(it));
    const logo = await loadImg((t.state.logo && t.state.logo.dataURL) || 'icons/brand-mark.png');
    const sold = kind === 'sold';
    // background
    c.fillStyle = '#f6f1e7'; c.fillRect(0, 0, W, H);
    const photoH = format === 'story' ? 1240 : 830;
    if (photo) cover(c, photo, 0, 0, W, photoH); else { const g = c.createLinearGradient(0, 0, W, photoH); g.addColorStop(0, '#2a7a70'); g.addColorStop(1, '#164e47'); c.fillStyle = g; c.fillRect(0, 0, W, photoH); c.font = `200px ${fam}`; c.textAlign = 'center'; c.fillText('👗', W / 2, photoH / 2 + 70); }
    // soft fade into the panel
    const fade = c.createLinearGradient(0, photoH - 220, 0, photoH); fade.addColorStop(0, 'rgba(22,78,71,0)'); fade.addColorStop(1, 'rgba(22,78,71,.55)'); c.fillStyle = fade; c.fillRect(0, photoH - 220, W, 220);
    // panel
    c.fillStyle = '#164e47'; c.fillRect(0, photoH, W, H - photoH);
    c.fillStyle = '#e7b84f'; c.fillRect(0, photoH, W, 12);
    // logo badge
    if (logo) { c.save(); c.beginPath(); c.arc(110, 110, 74, 0, Math.PI * 2); c.fillStyle = '#fff8ec'; c.fill(); c.lineWidth = 8; c.strokeStyle = '#e7b84f'; c.stroke(); c.clip(); cover(c, logo, 36, 36, 148, 148); c.restore(); }
    // sold ribbon / price tag
    if (sold) {
      c.save(); c.translate(W - 210, 150); c.rotate(Math.PI / 4);
      c.fillStyle = '#c2413b'; c.fillRect(-330, -58, 660, 116);
      c.fillStyle = '#fff'; c.font = `900 64px ${fam}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SOLD', 0, 4); c.restore();
    } else if (it.sellingPrice != null) {
      const txt = U.money(it.sellingPrice).replace(/\.00$/, '');
      c.font = `900 72px ${fam}`; const tw = c.measureText(txt).width + 70;
      rr(c, W - tw - 40, 50, tw, 120, 60); c.fillStyle = '#e7b84f'; c.fill();
      c.fillStyle = '#2a1f05'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, W - tw / 2 - 40, 114);
    }
    // text block — measured first so it sits nicely in the panel
    const pad = 70, maxW = W - pad * 2, panelTop = photoH + 12, footH = 96;
    const kicker = sold ? 'Just sold!' : (Calc.daysActive(it) !== null && Calc.daysActive(it) > 30 ? 'Still available' : 'New in the shop');
    c.font = `800 60px ${fam}`; const lines = wrap(c, it.name || 'Thrift find', maxW, 2);
    const chips = [it.brand, it.size ? 'Size ' + it.size : '', it.condition, it.color].filter(Boolean).slice(0, 4);
    const blockH = 70 + lines.length * 70 + (chips.length ? 92 : 0);
    let y = panelTop + Math.max(40, (H - panelTop - footH - blockH) / 2) + 58;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#e7b84f'; c.font = `400 ${fitText(c, kicker, maxW, 62, 400, 'Pacifico')}px Pacifico`; c.fillText(kicker, pad, y);
    c.fillStyle = '#fff8ec'; c.font = `800 60px ${fam}`;
    lines.forEach((l) => { y += 72; c.fillText(l, pad, y); });
    if (chips.length) {
      y += 32; let x = pad; c.font = `700 34px ${fam}`;
      chips.forEach((ch) => { const w = c.measureText(ch).width + 44; if (x + w > W - pad) return; rr(c, x, y, w, 62, 31); c.fillStyle = 'rgba(255,248,236,.14)'; c.fill(); c.fillStyle = '#fff8ec'; c.fillText(ch, x + 22, y + 43); x += w + 14; });
    }
    // footer: shop link on the left, company wordmark on the right
    c.fillStyle = 'rgba(255,248,236,.12)'; c.fillRect(pad, H - footH, maxW, 2);
    const shop = (S().socialHandle || '') || String(S().shopUrl || '').replace(/^https?:\/\/(www\.)?/, '');
    const company = S().companyName || 'Thriftaholics';
    c.font = `400 40px Pacifico`; const cw = c.measureText(company).width;
    c.fillStyle = '#e7b84f'; c.textAlign = 'right'; c.fillText(company, W - pad, H - 34);
    const live = T().uniq((it.listings || []).filter((l) => l.status === 'active').map((l) => T().platformLabel(l.platform))).slice(0, 3);
    let foot = sold ? `Thanks for shopping secondhand 💚${shop ? '  ·  ' + shop : ''}` : [shop ? 'Shop ' + shop : '', live.length ? 'on ' + live.join(', ') : ''].filter(Boolean).join('  ·  ');
    c.textAlign = 'left'; c.fillStyle = 'rgba(255,248,236,.8)'; c.font = `600 30px ${fam}`;
    const room = maxW - cw - 30;
    while (foot && c.measureText(foot).width > room) foot = foot.slice(0, -2).trimEnd() + '…';
    if (foot) c.fillText(foot.replace(/……$/, '…'), pad, H - 38);
    return cv;
  }
  async function shareCard(itemId) {
    const it = T().findItem(itemId); if (!it) return;
    let kind = Calc.isSold(it) ? 'sold' : 'sale', format = 'post', blob = null, url = '';
    const body = document.createElement('div');
    body.innerHTML = `<div class="sc-wrap"><div class="sc-prev"><div class="skel sc-skel"></div></div>
      <div class="sc-tools"><div class="ped-g"><span>Card</span><div class="seg" data-k="kind"><button type="button" data-v="sale">For sale</button><button type="button" data-v="sold">Just sold!</button></div></div>
        <div class="ped-g"><span>Size</span><div class="seg" data-k="format"><button type="button" data-v="post">Post (4:5)</button><button type="button" data-v="story">Story (9:16)</button></div></div>
        <p class="small muted">Uses the cover photo, your logo and shop link (Settings → Labels). Share it straight to Instagram, Facebook or Messages, or save it.</p>
        <div class="btn-row"><button type="button" class="btn btn-primary" data-sc="share">📤 Share</button><button type="button" class="btn" data-sc="save">⬇ Save image</button></div></div></div>`;
    let token = 0;
    const draw = async () => {
      const my = ++token;
      body.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === (b.parentElement.dataset.k === 'kind' ? kind : format)));
      const prev = body.querySelector('.sc-prev'); prev.innerHTML = '<div class="skel sc-skel"></div>';
      const cv = await drawCard(it, { kind, format });
      if (my !== token) return; // a newer choice is already drawing
      blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      if (my !== token) return;
      if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob);
      prev.innerHTML = `<img src="${url}" alt="Share card preview" class="${format}">`;
      X.lastShareCard = cv;
    };
    const fname = () => `${U.slug(it.sku || it.name || 'item')}-${kind === 'sold' ? 'sold' : 'for-sale'}-${format}.png`;
    body.addEventListener('click', async (e) => {
      const sb = e.target.closest('.seg button'); if (sb) { if (sb.parentElement.dataset.k === 'kind') kind = sb.dataset.v; else format = sb.dataset.v; draw(); return; }
      const a = e.target.closest('[data-sc]'); if (!a || !blob) return;
      if (a.dataset.sc === 'save') { const l = document.createElement('a'); l.href = url; l.download = fname(); document.body.appendChild(l); l.click(); l.remove(); return; }
      const file = new File([blob], fname(), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: it.name, text: [it.name, S().shopUrl].filter(Boolean).join(' — ') }); } catch (_) { /* cancelled */ } }
      else { U.toast('Sharing isn’t available here — saved the image instead', ''); a.parentElement.querySelector('[data-sc=save]').click(); }
    });
    draw();
    await U.modal({ title: `Share card — ${it.name}`, wide: true, body, buttons: [{ label: 'Done', value: null, cls: 'btn-ghost' }] });
    if (url) URL.revokeObjectURL(url);
  }
  X.shareCard = shareCard;
  X.drawCard = drawCard;
  X.on('sheetAction', (go, it) => { if (go === 'share') { shareCard(it.id); return true; } return false; });

  /* =====================================================
     SEASONAL TOUCHES (in the header only, can be turned off)
     ===================================================== */
  const SKEY = 'thrift-season';
  const seasonOn = () => { try { return localStorage.getItem(SKEY) !== 'off'; } catch (_) { return true; } };
  function season(d = new Date()) {
    const m = d.getMonth() + 1, day = d.getDate(), md = m * 100 + day;
    if (md >= 1201 || md <= 105) return { k: 'snow', name: 'Winter snow', icons: ['❄', '❅', '✻'], colors: ['#ffffff', '#e6f2ff', '#d8ecff'] };
    if (md >= 207 && md <= 214) return { k: 'hearts', name: 'Valentine hearts', icons: ['♥'], colors: ['#ff8fa3', '#ffb3c1', '#e7b84f'] };
    if (md >= 320 && md <= 531) return { k: 'petals', name: 'Spring petals', icons: ['❀', '✿'], colors: ['#ffd1dc', '#fff0f5', '#ffe4a8'] };
    if (md >= 701 && md <= 705) return { k: 'stars', name: 'Summer stars', icons: ['★', '✦'], colors: ['#ffffff', '#e7b84f', '#ff8f8f'] };
    if (md >= 1001 && md <= 1130) return { k: 'leaves', name: 'Autumn leaves', icons: ['🍂', '🍁'], colors: [] };
    return null;
  }
  X.season = season;
  let seasonRaf = 0;
  function startSeason() {
    stopSeason();
    const sn = season(); const bar = document.querySelector('.topbar');
    if (!sn || !seasonOn() || reduced() || !bar) return;
    const cv = document.createElement('canvas'); cv.className = 'season-fx'; cv.setAttribute('aria-hidden', 'true');
    bar.appendChild(cv);
    const ctx = cv.getContext('2d'); const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => { cv.width = bar.clientWidth * dpr; cv.height = bar.clientHeight * dpr; };
    size(); window.addEventListener('resize', size);
    const n = Math.max(8, Math.min(22, Math.round(bar.clientWidth / 60)));
    const P = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8, v: 0.08 + Math.random() * 0.12, w: Math.random() * Math.PI * 2, i: Math.floor(Math.random() * sn.icons.length), c: sn.colors.length ? sn.colors[Math.floor(Math.random() * sn.colors.length)] : null, r: Math.random() * Math.PI }));
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(50, now - last) / 1000; last = now;
      const Wc = cv.width, Hc = cv.height; ctx.clearRect(0, 0, Wc, Hc);
      P.forEach((p) => {
        p.y += p.v * dt * (sn.k === 'stars' ? 0.4 : 1); p.w += dt * 1.4; p.r += dt * 0.6;
        if (p.y > 1.15) { p.y = -0.15; p.x = Math.random(); }
        const x = (p.x + Math.sin(p.w) * 0.015) * Wc, y = p.y * Hc;
        ctx.save(); ctx.translate(x, y); ctx.rotate(sn.k === 'leaves' || sn.k === 'petals' ? Math.sin(p.r) * 0.8 : 0);
        ctx.globalAlpha = sn.k === 'stars' ? 0.5 + Math.sin(p.w * 2) * 0.4 : 0.75;
        ctx.font = `${Math.round(14 * p.s * dpr)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (p.c) ctx.fillStyle = p.c; ctx.fillText(sn.icons[p.i], 0, 0); ctx.restore();
      });
      seasonRaf = requestAnimationFrame(tick);
    };
    seasonRaf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(seasonRaf); else if (document.querySelector('.season-fx')) { last = performance.now(); seasonRaf = requestAnimationFrame(tick); } });
  }
  function stopSeason() { cancelAnimationFrame(seasonRaf); document.querySelectorAll('.season-fx').forEach((c) => c.remove()); }
  function renderSeasonSetting() {
    const anchor = document.getElementById('setShowName'); if (!anchor || document.getElementById('setSeason')) return;
    const sn = season();
    const lab = document.createElement('label'); lab.className = 'check';
    lab.innerHTML = `<input type="checkbox" id="setSeason" ${seasonOn() ? 'checked' : ''}> ✨ Seasonal touches in the header <span class="muted small">${sn ? `(now: ${sn.name})` : '(snow in winter, petals in spring, leaves in fall…)'}</span>`;
    anchor.closest('label').insertAdjacentElement('afterend', lab);
    lab.querySelector('input').addEventListener('change', (e) => { try { localStorage.setItem(SKEY, e.target.checked ? 'on' : 'off'); } catch (_) { /* ignore */ } if (e.target.checked) startSeason(); else stopSeason(); });
  }

  /* =====================================================
     MONTHLY GOALS: celebration + streaks
     ===================================================== */
  const GOALS = [['sales', 'sales', (m) => m.gross, (v) => m0(v)], ['profit', 'profit', (m) => m.netProfit, (v) => m0(v)], ['items', 'items-sold', (m) => m.soldCount, (v) => U.int(v)]];
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  function monthMetrics(d) {
    const t = T(); const y = d.getFullYear(), mo = d.getMonth();
    const from = `${y}-${String(mo + 1).padStart(2, '0')}-01`, to = `${y}-${String(mo + 1).padStart(2, '0')}-${String(new Date(y, mo + 1, 0).getDate()).padStart(2, '0')}`;
    return Calc.metrics(t.state.items, t.state.expenses, S(), from, to, t.state.mileage);
  }
  function streak(key) {
    const g = (S().goals || {})[key]; if (!g) return 0;
    const get = GOALS.find((x) => x[0] === key)[2];
    const d = new Date(); d.setDate(1); let n = 0;
    if (get(monthMetrics(d)) < g) d.setMonth(d.getMonth() - 1); // this month isn't done yet — count from last month
    for (let i = 0; i < 60; i++) { if (get(monthMetrics(d)) >= g) { n++; d.setMonth(d.getMonth() - 1); } else break; }
    return n;
  }
  X.goalStreak = streak;
  let goalTimer = 0;
  function checkGoals(quiet) {
    if (!Store.unlocked) return;
    const g = S().goals || {}; if (!g.sales && !g.profit && !g.items) return;
    const now = new Date(), m = monthMetrics(now), hits = (S().goalHits ||= {}); const fresh = [];
    GOALS.forEach(([k, label, get, fmt]) => { const key = `${ym(now)}:${k}`; if (g[k] && get(m) >= g[k] && !hits[key]) { hits[key] = U.todayISO(); fresh.push({ k, label, v: fmt(get(m)), goal: fmt(g[k]) }); } });
    if (!fresh.length) return;
    const keys = Object.keys(hits).sort(); while (keys.length > 72) delete hits[keys.shift()];
    T().saveSettings();
    if (quiet) return;
    setTimeout(() => goalParty(fresh), 1800);
  }
  function goalParty(list) {
    const g = list[0]; const st = streak(g.k);
    const month = new Date().toLocaleDateString(undefined, { month: 'long' });
    const el = document.createElement('div'); el.className = 'ms-pop goal-pop';
    el.innerHTML = `<div class="ms-card"><div class="ms-badge">🎯</div><div class="ms-kick">${esc(month)} goal reached</div><div class="ms-t">${esc(g.v)} ${g.k === 'items' ? 'items sold' : g.k}</div><div class="ms-more">Your goal was ${esc(g.goal)}${st > 1 ? ` · 🔥 ${st} months in a row!` : ''}</div>${list.length > 1 ? `<div class="ms-more">+ ${list.length - 1} more goal${list.length > 2 ? 's' : ''} hit</div>` : ''}</div>
      ${Array.from({ length: 40 }, (_, i) => `<i class="cf" style="--x:${Math.random() * 100}vw;--d:${0.5 + Math.random() * 1.4}s;--r:${Math.random() * 720 - 360}deg;--c:${['#e7b84f', '#2a7a70', '#c2413b', '#6b6fa8', '#2f8a57', '#ff8fa3'][i % 6]}"></i>`).join('')}`;
    document.body.appendChild(el);
    el.addEventListener('click', () => el.remove());
    setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 4800);
  }
  X.goalParty = goalParty;
  // a streak line on the goals card
  X.on('dashboard', () => {
    const card = document.querySelector('#goalsCard .card.goals:not(.goals-empty)'); if (!card) return;
    const parts = GOALS.map(([k, label]) => { const n = streak(k); return n >= 2 ? `🔥 ${label} goal ${n} months in a row` : ''; }).filter(Boolean);
    const now = new Date(), hits = S().goalHits || {};
    const done = GOALS.filter(([k]) => hits[`${ym(now)}:${k}`]).map(([, l]) => l);
    if (parts.length || done.length) card.insertAdjacentHTML('beforeend', `<div class="goal-streak">${done.length ? `<span class="gs-done">✓ ${esc(done.join(' & '))} goal${done.length > 1 ? 's' : ''} reached this month</span>` : ''}${parts.map((p) => `<span>${esc(p)}</span>`).join('')}</div>`);
  });
  X.on('commit', (kind) => { if (kind !== 'items' && kind !== 'expenses') return; clearTimeout(goalTimer); goalTimer = setTimeout(() => checkGoals(false), 500); });

  /* =====================================================
     SMART PRICE SUGGESTIONS (from your own sales)
     ===================================================== */
  const low = (s) => String(s || '').trim().toLowerCase();
  function priceSuggest(it) {
    const sold = T().state.items.filter((i) => Calc.isSold(i) && i.id !== it.id && +i.sellingPrice > 0);
    if (sold.length < 3) return null;
    const b = low(it.brand), c = low(it.category), z = low(it.size);
    const tiers = [
      [b && c, (i) => low(i.brand) === b && low(i.category) === c, () => `${it.brand} ${it.category}`],
      [b, (i) => low(i.brand) === b, () => it.brand],
      [c && z, (i) => low(i.category) === c && low(i.size) === z, () => `${it.category} in size ${it.size}`],
      [c, (i) => low(i.category) === c, () => it.category]
    ];
    for (const [ok, match, label] of tiers) {
      if (!ok) continue;
      const m = sold.filter(match); if (m.length < 3) continue;
      const prices = m.map((i) => +i.sellingPrice).sort((x, y) => x - y);
      const mid = prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
      const days = m.map((i) => Calc.daysActive(i)).filter((d) => d !== null).sort((x, y) => x - y);
      const dmid = days.length ? days[Math.floor(days.length / 2)] : null;
      const all = T().state.items.filter(match);
      const thru = all.length ? m.length / all.length : null;
      const suggested = Math.max(1, Math.round(mid));
      return { price: suggested, n: m.length, label: label(), lo: prices[0], hi: prices[prices.length - 1], days: dmid, thru, profit: it.purchasePrice != null ? suggested - it.purchasePrice : null };
    }
    return null;
  }
  X.priceSuggest = priceSuggest;
  X.suggestHtml = (it, inEditor) => {
    const p = priceSuggest(it);
    if (!p) return (it.brand || it.category) && inEditor ? '<div class="sugg none"><span>💡</span><div class="small muted">Price suggestions appear once you’ve sold 3 or more similar items (same brand or category).</div></div>' : '';
    const diff = it.sellingPrice != null ? it.sellingPrice - p.price : null;
    return `<div class="sugg"><span class="sg-ico">💡</span><div class="sg-t"><b>Suggested price ${m0(p.price)}</b>
      <span class="small">From ${p.n} ${esc(p.label)} you sold: ${m0(p.lo)}–${m0(p.hi)}${p.days !== null ? `, usually sold in ${p.days} day${p.days === 1 ? '' : 's'}` : ''}${p.thru !== null && p.thru < 1 ? `, ${Math.round(p.thru * 100)}% sell-through` : ''}.${diff !== null && Math.abs(diff) >= 1 ? ` Yours is ${m0(Math.abs(diff))} ${diff > 0 ? 'higher' : 'lower'}.` : ''}</span></div>
      ${inEditor ? `<button type="button" class="btn btn-sm" data-use-price="${p.price}">Use ${m0(p.price)}</button>` : ''}</div>`;
  };
  X.on('init', () => {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-use-price]'); if (!b) return;
      const f = document.querySelector('#modalBody [name=sellingPrice]'); if (!f) return;
      f.value = b.dataset.usePrice; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }));
      U.toast(`Price set to ${m0(+b.dataset.usePrice)}`, 'ok');
    });
  });
  X.on('sheetTop', (it) => { if (Calc.isSold(it)) return ''; const h = X.suggestHtml(it, false); return h ? `<div class="sh-card">${h.replace('class="sugg"', 'class="sugg flat"')}</div>` : ''; });

  /* =====================================================
     WHAT'S NEW (once per device after each update)
     ===================================================== */
  const CHANGES = [
    { v: '2026.11.27j', d: 'Nov 27, 2026', items: [
      ['🎯', 'Tidier select-all', 'In card and gallery views the select-all checkbox now sits centered in its bubble, labelled “All”.']
    ] },
    { v: '2026.11.27i', d: 'Nov 27, 2026', items: [
      ['🔐', 'No auto-lock mid-job', 'Auto-lock now waits while a backup, restore, photo download or Excel report is running, and the countdown restarts when it finishes. Pressing Lock during one asks first.']
    ] },
    { v: '2026.11.27h', d: 'Nov 27, 2026', items: [
      ['💾', 'Backups of any size', 'Backups are now written one record per line, so they work no matter how many photos you have (the old way failed past about 500 MB). Restoring reads them a piece at a time with a progress card. Older backups still restore as before.']
    ] },
    { v: '2026.11.27g', d: 'Nov 27, 2026', items: [
      ['⏳', 'Backup spinner', 'While a backup is being built the Backup button spins and locks, and a card at the bottom shows what it’s doing — no more wondering whether to click again. Backups are also a little smaller and faster to make.']
    ] },
    { v: '2026.11.27f', d: 'Nov 27, 2026', items: [
      ['🧹', 'Restore files can fix mistakes', 'A restore file can now remove photos or items that were added by mistake before bringing in the right ones.']
    ] },
    { v: '2026.11.27d', d: 'Nov 27, 2026', items: [
      ['📥', 'Photos from links', 'Restore files can now bring in photos by link — the app downloads and saves them for you, with a progress bar. Used to pull in the pictures from your Poshmark and Depop listings.']
    ] },
    { v: '2026.11.27c', d: 'Nov 27, 2026', items: [
      ['🔎', 'Research prices: sold AND listed', 'Each site now has Sold and Listed buttons (eBay, Poshmark, Mercari), plus Vinted, ThredUp, Facebook Marketplace and Etsy. ★ Ours opens your own listing, and ⚙ Sites picks which sites show.']
    ] },
    { v: '2026.11.27b', d: 'Nov 27, 2026', items: [
      ['🧬', 'Duplicate photo protection', 'Adding a photo an item already has is skipped — even if it was renamed, resized or came from the other phone. The app compares the pictures themselves, so different shots of the same item are still added.']
    ] },
    { v: '2026.11.27', d: 'Nov 27, 2026', items: [
      ['⏳', 'Clearer photo saving in the editor', 'After you add photos in the item editor, a note says what will happen and the Save button pulses until you save. Cancel warns you once before throwing new photos away.']
    ] },
    { v: '2026.11.26j', d: 'Nov 26, 2026', items: [
      ['🧵', 'Material field', 'Items now have a Material field (right after Condition) for fabric content like “95% cotton, 5% spandex”. It shows in item details, the cross-list helper, listing descriptions ({material}), spreadsheet import/export and the Excel report. Turn on the column in Inventory → Columns.']
    ] },
    { v: '2026.11.26i', d: 'Nov 26, 2026', items: [
      ['🗑️', 'Delete several photos at once', 'In an item’s photo manager, tick photos (or Select all) and tap Delete selected.'],
      ['🧹', 'Remove photos from many items', 'Select items in Inventory → Remove photos… to delete all their photos, or only the extras and keep the covers.']
    ] },
    { v: '2026.11.26h', d: 'Nov 26, 2026', items: [
      ['💵', 'A price for each site', 'Give each listing its own price. The price column shows the range (like $29–$32), site chips show each price, and recording a sale fills in the price of the site it sold on.']
    ] },
    { v: '2026.11.26g', d: 'Nov 26, 2026', items: [
      ['#️⃣', 'Search by SKU', 'Typing a SKU number now shows exactly that SKU (in stock and sold). Add * to see every SKU that starts with it — like 1* for 1, 10–19, 100–199…'],
      ['🏷️', 'SKU on gallery cards', 'Gallery cards show the SKU in a dark pill on the top right of the photo.']
    ] },
    { v: '2026.11.26f', d: 'Nov 26, 2026', items: [
      ['👆', 'Swipe through photos', 'In item details, swipe the photo (or use ‹ › , the dots or the arrow keys) to see all of an item’s photos.'],
      ['🖼️', 'Photos on cards', 'New setting (Settings → Business): keep cards on the cover photo, run a slideshow, or cycle on hover — with your choice of speed and fade, slide or no transition.']
    ] },
    { v: '2026.11.26e', d: 'Nov 26, 2026', items: [
      ['🖼️', 'Drag & drop photos everywhere', 'Drop one or more images onto an item row, card, gallery tile, the item details window, the photo viewer, the item editor or your logo box.'],
      ['❓', 'Add, replace or keep', 'If the item already has a photo, you choose: add the new ones to its photo carousel, replace the cover, or keep what’s there.'],
      ['🛠️', 'Item details buttons fixed', '“Add a photo”, “Packing slip” and “Thank-you card” in the item details window work again.']
    ] },
    { v: '2026.11.26d', d: 'Nov 26, 2026', items: [
      ['🖱️', 'Sort buttons on computers', 'In Cards and Gallery view, the row of sort buttons now wraps onto a second line on computers, so every button is reachable.']
    ] },
    { v: '2026.11.26c', d: 'Nov 26, 2026', items: [
      ['🔒', 'Settings stay put', 'Sync now merges the two phones’ settings one by one, so a setting one phone doesn’t have (like the Gmail invoice link and key) is never wiped. Each device also keeps a protected copy of the Gmail details and puts them back if they go missing.']
    ] },
    { v: '2026.11.26', d: 'Nov 26, 2026', items: [
      ['🔢', 'Group by SKU', 'A new Inventory button shows every item with the same SKU together — the ones you still have first, then the sold ones.'],
      ['🧮', 'Inventory Estimate fixed', 'The Inventory Estimate total now counts only items still in stock, and totals stay the same when sold items are hidden.'],
      ['🛠️', 'Delist fix', 'Sold items no longer ask to be delisted from the site they sold on. Restoring a backup had marked those as still listed; that’s repaired automatically.']
    ] },
    { v: '2026.11.25f', d: 'Nov 25, 2026', items: [
      ['🔐', 'Clearer Gmail permission help', 'If Google hasn’t given the Gmail script permission to send email, the app now explains exactly how to fix it.']
    ] },
    { v: '2026.11.25e', d: 'Nov 25, 2026', items: [
      ['📋', 'Active items first', 'Inventory now lists the items you still have first, in SKU order, with sold items below a gold line.'],
      ['🙈', 'Hide sold', 'One tap hides sold and donated items for a clean view of your active inventory.']
    ] },
    { v: '2026.11.25d', d: 'Nov 25, 2026', items: [
      ['🔑', 'Reset your password by email', 'Forgot the password? On the lock screen, tap “Email me a reset code” — it goes to the shop’s Gmail. Reset questions and the hint still work too.']
    ] },
    { v: '2026.11.25c', d: 'Nov 25, 2026', items: [
      ['🧾', 'Invoices for buyers', 'Sold item → 🧾 Invoice makes a branded PDF invoice (one item or a whole bundle order) with the buyer’s name, shipping, tax and a PAID stamp.'],
      ['✉️', 'One-tap email from your Gmail', 'After a one-time setup (Settings → Email invoices), invoices go straight to the buyer from your own Gmail, with the PDF attached. Free — up to 100 emails a day.'],
      ['📤', 'Send / share PDF', 'Works with no setup: opens your phone’s share sheet with the invoice attached — pick Gmail, Messages or WhatsApp. On a computer it downloads the PDF and opens an email.'],
      ['🔔', 'Invoice reminder', 'After you record a sale, a small “Send the buyer an invoice?” button pops up (turn it off in Settings).']
    ] },
    { v: '2026.11.25b', d: 'Nov 25, 2026', items: [
      ['📣', 'Share cards', 'Item details → 📣 Share card makes a polished image for Instagram, Facebook or Stories — “For sale” or “Just sold!”, with your photo, logo, price and shop link.'],
      ['💡', 'Smart price suggestions', 'When you add or edit an item, the app suggests a price from what similar items (same brand or category) sold for — with how fast they sold.'],
      ['🎯', 'Goal celebrations', 'Confetti when you hit a monthly goal, plus “🔥 months in a row” streaks on the Dashboard.'],
      ['✨', 'Seasonal touches', 'Snow in winter, petals in spring, leaves in fall — gently, in the header. Turn off in Settings → Business.'],
      ['⏳', 'Smoother start', 'Shimmering placeholders while your data unlocks, instead of a blank screen.'],
      ['🆕', 'What’s new', 'This note — after each update, once per device.']] },
    { v: '2026.11.25', d: 'Nov 25, 2026', items: [['📖', 'Guide', 'Help for Samsung phones (set Google as voice input) and turning on Siri & Dictation on iPhone.']] },
    { v: '2026.11.24m', d: 'Nov 24, 2026', items: [['🔊', 'Read aloud', 'Press and hold any box — or a whole item card, row or tile — and let go to hear it.']] },
    { v: '2026.11.24k', d: 'Nov 24, 2026', items: [['🎤', 'Voice typing', 'Tap the microphone in text boxes and searches and speak instead of typing.']] },
    { v: '2026.11.24j', d: 'Nov 24, 2026', items: [['🗓️', 'Year in Review tabs', 'Pick any year from a row of tabs.']] },
    { v: '2026.11.24h', d: 'Nov 24, 2026', items: [['🎁', 'Bundles, offers & returns', 'One order for several items, logged offers, refunds and returns.'], ['🛍️', 'Hauls & bins', 'Sourcing trips with cost splitting; storage bins with printable labels.'], ['📸', 'More photos', 'Several photos per item with a cover and a photo editor.'], ['🔎', 'Search everything', 'Ctrl+K / ⌘K finds items, sales, settings and help.'], ['🏆', 'Milestones & Year in Review', 'Badges, celebrations and an animated yearly recap.']] }
  ];
  X.changes = CHANGES;
  function whatsNew(since) {
    const list = since && since !== 'new' ? CHANGES.filter((c) => c.v > since) : CHANGES.slice(0, 1);
    if (!list.length) return;
    const body = `<div class="wn">${list.map((c, i) => `<section class="wn-rel"><div class="wn-h"><b>${i === 0 && c.v === T().APP_VERSION ? 'This update' : 'Earlier'}</b><span class="muted small">${esc(c.d)} · version ${esc(c.v)}</span></div>
      <div class="wn-items">${c.items.map(([ic, t, d]) => `<div class="wn-it"><span class="wn-ic">${ic}</span><div><b>${esc(t)}</b><p>${esc(d)}</p></div></div>`).join('')}</div></section>`).join('')}</div>`;
    U.modal({ title: '🆕 What’s new in Thriftaholics', wide: true, body, buttons: [{ label: 'Open the Guide', value: 'guide', cls: 'btn-ghost' }, { label: 'Got it', value: null, cls: 'btn-primary' }] })
      .then((r) => { if (r === 'guide') T().showView('guide'); });
  }
  X.whatsNew = whatsNew;

  /* ---------- wiring ---------- */
  X.on('init', () => {
    const wait = setInterval(() => {
      if (!Store.unlocked || !T().state.settings) return;
      clearInterval(wait);
      startSeason();
      checkGoals(!S().goalHitsSeen); if (!S().goalHitsSeen) { S().goalHitsSeen = true; T().saveSettings(); }
      // after an update (not on a brand-new install), once the welcome dialogs are out of the way
      const prev = T().state.prevVersion;
      if (prev && prev !== 'new' && !navigator.webdriver) {
        let n = 0; const iv = setInterval(() => { if (++n > 60) clearInterval(iv); if (document.getElementById('modal').classList.contains('hidden') && !document.querySelector('.tour')) { clearInterval(iv); setTimeout(() => whatsNew(prev), 700); } }, 1000);
      }
    }, 700);
  });
  X.on('view', (v) => { if (v === 'settings') setTimeout(() => { renderSeasonSetting(); renderWnButton(); }, 20); });
  function renderWnButton() {
    const card = document.getElementById('setShowName'); if (!card || document.getElementById('btnWhatsNew')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'btnWhatsNew'; b.className = 'btn btn-sm'; b.textContent = `🆕 What’s new (version ${T().APP_VERSION})`;
    b.addEventListener('click', () => whatsNew(CHANGES[3] ? CHANGES[3].v : null));
    card.closest('.card').appendChild(b);
  }
})();
