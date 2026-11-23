/* =========================================================
   Lightweight canvas charts (no external dependencies)
   ========================================================= */
(function (global) {
  'use strict';

  const Charts = {};

  function niceMax(v) {
    if (v <= 0) return 10;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * p;
  }

  /**
   * Bars (gross sales) + line (profit) by month.
   * data: [{ label, bar, line }]
   */
  Charts.combo = function (canvas, data, { barLabel = 'Gross sales', lineLabel = 'Profit', fmt = (n) => n } = {}) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = '100%'; canvas.style.display = 'block';  // CSS size stays fixed; only the pixel buffer scales with the screen
    const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    const cssH = +(canvas.dataset.h || (canvas.dataset.h = canvas.getAttribute('height'))) || 260;
    canvas.style.height = cssH + 'px';
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink-3').trim() || '#2c6e6a';
    const gold = css.getPropertyValue('--gold-2').trim() || '#d9a93d';
    const line = css.getPropertyValue('--line').trim() || '#e4e1d8';
    const text2 = css.getPropertyValue('--text-2').trim() || '#55605d';
    const danger = css.getPropertyValue('--danger').trim() || '#b83a32';
    const font = '11px ' + (css.getPropertyValue('--font').trim() || 'sans-serif');

    const pad = { l: 58, r: 12, t: 30, b: 30 };
    const W = cssW - pad.l - pad.r, H = cssH - pad.t - pad.b;
    const hi = Math.max(1, ...data.map((d) => Math.max(d.bar, d.line)));
    const lo = Math.min(0, ...data.map((d) => Math.min(d.bar, d.line)));
    const ticks = 4;
    const step = niceMax((hi - lo) / ticks);
    const minN = Math.floor(lo / step) * step;
    const maxV = Math.max(minN + step * ticks, Math.ceil(hi / step) * step);
    const range = maxV - minN;
    const y = (v) => pad.t + H - ((v - minN) / range) * H;

    // grid
    ctx.font = font; ctx.fillStyle = text2; ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = minN; v <= maxV + step / 2; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(pad.l + W, yy); ctx.stroke();
      ctx.fillText(fmt(v).replace(/\.00$/, ''), pad.l - 8, yy);
    }
    if (minN < 0) { ctx.strokeStyle = '#bdb8ab'; ctx.beginPath(); ctx.moveTo(pad.l, y(0) + .5); ctx.lineTo(pad.l + W, y(0) + .5); ctx.stroke(); }

    const n = data.length || 1;
    const slot = W / n;
    const bw = Math.min(34, slot * 0.58);
    // bars
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 52)))); // labels never closer than ~52px
    data.forEach((d, i) => {
      const x = pad.l + slot * i + (slot - bw) / 2;
      const y0 = y(0), y1 = y(d.bar);
      ctx.fillStyle = ink; ctx.globalAlpha = 0.85;
      roundRect(ctx, x, Math.min(y0, y1), bw, Math.max(1, Math.abs(y0 - y1)), 4);
      ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = text2; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      if (i % every === 0) ctx.fillText(d.label, pad.l + slot * i + slot / 2, pad.t + H + 9);
    });
    // line
    ctx.strokeStyle = gold; ctx.lineWidth = 2.5; ctx.beginPath();
    data.forEach((d, i) => { const x = pad.l + slot * i + slot / 2; i ? ctx.lineTo(x, y(d.line)) : ctx.moveTo(x, y(d.line)); });
    ctx.stroke();
    data.forEach((d, i) => {
      const x = pad.l + slot * i + slot / 2;
      ctx.beginPath(); ctx.arc(x, y(d.line), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = d.line < 0 ? danger : gold; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
    // legend
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '600 11.5px ' + (css.getPropertyValue('--font').trim() || 'sans-serif');
    ctx.fillStyle = ink; roundRect(ctx, pad.l, 8, 12, 12, 3); ctx.fill();
    ctx.fillStyle = text2; ctx.fillText(barLabel, pad.l + 18, 14);
    const off = pad.l + 30 + ctx.measureText(barLabel).width;
    ctx.strokeStyle = gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(off, 14); ctx.lineTo(off + 16, 14); ctx.stroke();
    ctx.fillText(lineLabel, off + 22, 14);

    // tooltip via title attr fallback
    canvas.onmousemove = (e) => {
      const r = canvas.getBoundingClientRect();
      const i = Math.floor((e.clientX - r.left - pad.l) / slot);
      if (i >= 0 && i < n) canvas.title = `${data[i].label}\n${barLabel}: ${fmt(data[i].bar)}\n${lineLabel}: ${fmt(data[i].line)}`;
    };
  };

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** Horizontal bars into a container. rows: [{ name, value, sub, color }] */
  Charts.hbars = function (el, rows, fmt) {
    if (!rows.length) { el.innerHTML = '<div class="empty">No data yet</div>'; return; }
    const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
    el.innerHTML = rows.map((r) => `
      <div class="hbar">
        <div class="hbar-name" title="${U.esc(r.name)}">${U.esc(r.name)}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${(Math.abs(r.value) / max * 100).toFixed(1)}%;${r.color ? 'background:' + r.color : ''}"></div></div>
        <div class="hbar-val">${fmt(r.value)}${r.sub ? `<small>${U.esc(r.sub)}</small>` : ''}</div>
      </div>`).join('');
  };

  global.Charts = Charts;
})(window);
