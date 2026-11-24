/* =========================================================
   Dashboard drawings: sparklines, goal rings, sales calendar,
   platform donut, number count-up. Plain SVG, themed with CSS variables.
   ========================================================= */
(function (global) {
  'use strict';
  const Dash = {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** tiny trend line for a KPI tile */
  Dash.spark = function (values, color) {
    const v = (values || []).map((n) => +n || 0);
    if (v.length < 2 || v.every((n) => n === 0)) return '';
    const W = 120, H = 30, min = Math.min(0, ...v), max = Math.max(...v), span = max - min || 1;
    const pts = v.map((n, i) => [(i / (v.length - 1)) * W, H - 3 - ((n - min) / span) * (H - 6)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${line} L${W} ${H} L0 ${H} Z" fill="${color}" opacity=".12" stroke="none"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${color}" stroke="none"/></svg>`;
  };

  /** ▲ 12% / ▼ 8% badge comparing this period with the one before */
  Dash.delta = function (cur, prev, label, invert) {
    if (!prev && !cur) return '';
    if (!prev) return `<span class="delta up" title="${esc(label)}">new</span>`;
    const p = (cur - prev) / Math.abs(prev);
    if (!isFinite(p)) return '';
    const good = invert ? p < 0 : p > 0;
    const cls = Math.abs(p) < 0.005 ? 'flat' : good ? 'up' : 'down';
    return `<span class="delta ${cls}" title="${esc(label)}">${p > 0.005 ? '▲' : p < -0.005 ? '▼' : '•'} ${Math.abs(p * 100) >= 100 ? Math.round(Math.abs(p * 100)) : Math.abs(p * 100).toFixed(0)}%</span>`;
  };

  /** circular progress ring */
  Dash.ring = function (frac, color, paceFrac) {
    const r = 30, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
    const pace = paceFrac === undefined ? '' : (() => { const a = paceFrac * 2 * Math.PI - Math.PI / 2; return `<circle cx="${40 + r * Math.cos(a)}" cy="${40 + r * Math.sin(a)}" r="3" fill="var(--text-3)" stroke="var(--surface)" stroke-width="1.5"><title>Even pace</title></circle>`; })();
    return `<svg class="ring" viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--line)" stroke-width="8"/>
      <circle class="ring-fill" cx="40" cy="40" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - f)).toFixed(1)}" transform="rotate(-90 40 40)" style="--c:${c.toFixed(1)}"/>
      ${pace}<text x="40" y="45" text-anchor="middle" class="ring-pct">${Math.round((frac || 0) * 100)}%</text></svg>`;
  };

  /** GitHub-style calendar of daily sales for the last 53 weeks */
  Dash.calendar = function (daily, fmt) {
    const cell = 12, gap = 3, step = cell + gap;
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - 7 * 52 - end.getDay());
    const vals = Object.values(daily).map((d) => d.g).filter((n) => n > 0).sort((a, b) => a - b);
    const q = (p) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0;
    const t = [q(0.25), q(0.5), q(0.75)];
    const level = (g) => (!g ? 0 : g <= t[0] ? 1 : g <= t[1] ? 2 : g <= t[2] ? 3 : 4);
    let rects = '', months = '', lastM = -1, total = 0, days = 0, best = null;
    const d = new Date(start);
    for (let w = 0; w < 53; w++) {
      for (let dow = 0; dow < 7; dow++) {
        if (d > end) break;
        const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const x = daily[iso] || { g: 0, n: 0 };
        if (x.n) { total += x.g; days++; if (!best || x.g > best.g) best = { iso, ...x }; }
        const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + (x.n ? ` · ${fmt(x.g)} (${x.n} sale${x.n === 1 ? '' : 's'})` : ' · no sales');
        rects += `<rect x="${30 + w * step}" y="${18 + dow * step}" width="${cell}" height="${cell}" rx="3" class="cal-l${level(x.g)}" data-day="${iso}"><title>${esc(label)}</title></rect>`;
        if (dow === 0 && d.getMonth() !== lastM && d.getDate() <= 7) { lastM = d.getMonth(); months += `<text x="${30 + w * step}" y="11" class="cal-m">${d.toLocaleDateString(undefined, { month: 'short' })}</text>`; }
        d.setDate(d.getDate() + 1);
      }
    }
    const dl = ['Mon', 'Wed', 'Fri'].map((n, i) => `<text x="0" y="${18 + (1 + i * 2) * step + 10}" class="cal-m">${n}</text>`).join('');
    const W = 30 + 53 * step, H = 18 + 7 * step;
    return {
      svg: `<svg class="cal" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Sales calendar">${months}${dl}${rects}</svg>`,
      total, days, best
    };
  };

  /** donut of platform share */
  Dash.donut = function (rows, fmt) {
    const total = rows.reduce((a, r) => a + r.value, 0);
    if (!total) return '<div class="empty-art small">No sales in this period yet</div>';
    const R = 54, C = 2 * Math.PI * R;
    let off = 0;
    const arcs = rows.map((r) => {
      const len = (r.value / total) * C;
      const s = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${r.color}" stroke-width="22" stroke-dasharray="${Math.max(0, len - 1.5).toFixed(2)} ${(C - Math.max(0, len - 1.5)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)"><title>${esc(r.name)}: ${esc(fmt(r.value))} (${Math.round(r.value / total * 100)}%)</title></circle>`;
      off += len; return s;
    }).join('');
    const legend = rows.map((r) => `<div class="dn-row"><span class="dn-dot" style="background:${r.color}"></span><span class="dn-name">${esc(r.name)}</span><span class="dn-pct">${Math.round(r.value / total * 100)}%</span><span class="dn-val">${esc(fmt(r.value))}<small>${esc(r.sub || '')}</small></span></div>`).join('');
    return `<div class="donut-wrap"><svg class="donut" viewBox="0 0 140 140" aria-hidden="true">${arcs}<text x="70" y="66" text-anchor="middle" class="dn-total">${esc(fmt(total))}</text><text x="70" y="84" text-anchor="middle" class="dn-cap">total sales</text></svg><div class="dn-legend">${legend}</div></div>`;
  };

  /** numbers roll up from zero the first time they appear */
  Dash.countUp = function (root) {
    const els = root.querySelectorAll('[data-count]');
    if (reduced()) return;
    els.forEach((el) => {
      const to = +el.dataset.count, fmt = el.dataset.fmt || 'money';
      if (!isFinite(to) || Math.abs(to) < 1) return;
      const f = (n) => (fmt === 'int' ? Math.round(n).toLocaleString() : fmt === 'pct' ? (n * 100).toFixed(1) + '%' : (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() + (fmt === 'money2' ? '.' + String(Math.round(Math.abs(n) * 100) % 100).padStart(2, '0') : ''));
      const final = el.textContent, t0 = performance.now(), dur = 700;
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = k < 1 ? f(to * e) : final;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  /** friendly empty state with a small illustration */
  Dash.empty = function (title, sub, icon) {
    const art = {
      box: '<path d="M8 22l24-12 24 12v24L32 58 8 46z" fill="var(--surface-3)" stroke="var(--line-3)" stroke-width="2"/><path d="M8 22l24 12 24-12M32 34v24" stroke="var(--line-3)" stroke-width="2" fill="none"/><path d="M20 16l24 12" stroke="var(--gold)" stroke-width="3" stroke-linecap="round"/>',
      tag: '<path d="M14 30L34 10h18v18L32 48z" fill="var(--surface-3)" stroke="var(--line-3)" stroke-width="2"/><circle cx="44" cy="18" r="4" fill="var(--gold)"/><path d="M22 52c6 2 14 0 18-6" stroke="var(--ink-3)" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      spark: '<path d="M32 8l5 15 15 5-15 5-5 15-5-15-15-5 15-5z" fill="var(--gold)" opacity=".85"/><circle cx="50" cy="46" r="4" fill="var(--ink-3)" opacity=".6"/><circle cx="14" cy="48" r="3" fill="var(--ink-3)" opacity=".4"/>'
    }[icon || 'box'];
    return `<div class="empty-art"><svg viewBox="0 0 64 64" aria-hidden="true">${art}</svg><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  };

  global.Dash = Dash;
})(window);
