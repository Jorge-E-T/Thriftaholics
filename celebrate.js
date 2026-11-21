/* =========================================================
   Sale celebration — dollar bills burst across the screen
   Pure canvas, no images; never blocks clicks (pointer-events: none).
   ========================================================= */
(function (global) {
  'use strict';

  let canvas = null, ctx = null, particles = [], raf = 0, billSprite = null, spriteScale = 0;
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Draw one stylized bill once into an offscreen canvas, then stamp copies. */
  function makeBill(scale) {
    const W = 64, H = 30;
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const g = c.getContext('2d');
    g.scale(scale, scale);
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#5fae7a'); grad.addColorStop(0.5, '#3f8f5d'); grad.addColorStop(1, '#2f7a4c');
    rr(0.5, 0.5, W - 1, H - 1, 3); g.fillStyle = grad; g.fill();
    g.lineWidth = 1; g.strokeStyle = '#225c3a'; g.stroke();
    rr(4, 4, W - 8, H - 8, 2); g.strokeStyle = 'rgba(230,245,232,.55)'; g.stroke();
    // corner numerals
    g.fillStyle = 'rgba(235,248,238,.85)'; g.font = 'bold 6px system-ui, sans-serif';
    g.fillText('1', 7, 11); g.fillText('1', W - 11, H - 6);
    // center seal
    g.beginPath(); g.ellipse(W / 2, H / 2, 9, 9, 0, 0, Math.PI * 2);
    g.fillStyle = '#e9f5ec'; g.fill(); g.strokeStyle = '#2f7a4c'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = '#2f7a4c'; g.font = 'bold 13px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('$', W / 2, H / 2 + 1);
    // side ovals
    g.strokeStyle = 'rgba(230,245,232,.45)';
    [[14, H / 2], [W - 14, H / 2]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 5, 7, 0, 0, Math.PI * 2); g.stroke(); });
    return { img: c, W, H };
  }

  function ensureCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'celebrate-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
    }
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!billSprite || spriteScale !== dpr * 1.5) { spriteScale = dpr * 1.5; billSprite = makeBill(spriteScale); }
  }

  function spawn(n, ox, oy) {
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.35; // mostly upward fan
      const speed = 7 + Math.random() * 11;
      particles.push({
        x: ox + (Math.random() - 0.5) * 30, y: oy + (Math.random() - 0.5) * 16,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed - 2,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.25,
        flip: Math.random() * Math.PI * 2, vflip: 0.12 + Math.random() * 0.18, // 3-D flutter
        sway: Math.random() * Math.PI * 2,
        scale: 0.75 + Math.random() * 0.55,
        delay: Math.floor(Math.random() * 10),
        life: 0, max: 105 + Math.random() * 50
      });
    }
    // a few sparkles
    for (let i = 0; i < Math.round(n / 3); i++) {
      const ang = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
      particles.push({ spark: true, x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: 40 + Math.random() * 25, r: 1.5 + Math.random() * 2.5 });
    }
  }

  function frame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    particles = particles.filter((p) => p.life < p.max && p.y < innerHeight + 80);
    for (const p of particles) {
      if (p.delay) { p.delay--; continue; }
      p.life++;
      const fade = Math.min(1, (p.max - p.life) / 25);
      if (p.spark) {
        p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy = p.vy * 0.93 + 0.12;
        ctx.globalAlpha = fade; ctx.fillStyle = '#e9c46a';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      // physics: launch, then drift down with air drag and a gentle side-to-side sway
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
      if (p.vy > 2.6) p.vy = 2.6 + (p.vy - 2.6) * 0.8; // terminal-ish velocity like paper
      p.sway += 0.06;
      p.x += p.vx + Math.sin(p.sway) * 0.9; p.y += p.vy;
      p.rot += p.vr; p.flip += p.vflip;
      const { img, W, H } = billSprite;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.scale(p.scale, p.scale * Math.max(0.12, Math.abs(Math.cos(p.flip))));
      ctx.drawImage(img, -W / 2, -H / 2, W, H);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (particles.length) raf = requestAnimationFrame(frame);
    else { cancelAnimationFrame(raf); raf = 0; canvas.remove(); canvas = null; ctx = null; }
  }

  function badge({ title = 'SOLD!', amount, profit, count }) {
    const el = document.createElement('div');
    el.className = 'sold-badge';
    el.setAttribute('role', 'status');
    const fmt = (n) => (window.U ? U.money(n) : '$' + (+n).toFixed(2));
    el.innerHTML = `<div class="sb-title">${title}</div>`
      + (amount != null ? `<div class="sb-amt">${count > 1 ? `${count} items · ` : ''}${fmt(amount)}</div>` : '')
      + (profit != null ? `<div class="sb-profit ${profit < 0 ? 'neg' : ''}">${profit >= 0 ? '+' : ''}${fmt(profit)} profit</div>` : '');
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 1500);
    setTimeout(() => el.remove(), 2000);
  }

  /**
   * Celebrate a sale.
   * opts: { amount, profit, count, x, y }  (x/y = burst origin in viewport px; defaults to screen center)
   */
  function sale(opts = {}) {
    try {
      badge(opts);
      if (reduceMotion()) return;
      ensureCanvas();
      const n = Math.min(110, 46 + 14 * Math.max(0, (opts.count || 1) - 1));
      spawn(n, opts.x ?? innerWidth / 2, opts.y ?? innerHeight * 0.58);
      if (!raf) raf = requestAnimationFrame(frame);
    } catch (e) { console.error(e); }
  }

  global.Celebrate = { sale };
})(window);
