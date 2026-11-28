/* =========================================================
   Fix spellings — keeps the suggestion lists (Brand, Color, Size,
   Material) consistent. The suggestions are built from what's typed on
   items, so a misspelling on one item keeps showing up as a choice.
   This lists every value with how many items use it, points out
   look-alikes (“Shien” / “SHEIN”, “Lulu Lemon” / “lululemon”), and
   renames a value on every item at once — optionally inside item names
   too. One undoable change that syncs to the other phone.
   ========================================================= */
(function () {
  'use strict';
  const X = window.Ext; if (!X) return;
  const T = () => window.TA;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FIELDS = { brand: 'Brands', color: 'Colors', size: 'Sizes', material: 'Materials' };

  // “same thing, typed differently”: case, accents, spaces, punctuation, &/and, a trailing s
  const key = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').replace(/s$/, '');
  // edit distance where swapping two neighbouring letters (Shien / Shein) counts as one typo
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  // “one typo apart”: long enough words, same first letter, and either a swap or a single slip in a 6+ letter word
  const near = (k, w) => k[0] === w[0] && Math.min(k.length, w.length) >= 5 && lev(k, w) <= 1 && (Math.min(k.length, w.length) >= 6 || (k.length === w.length && [...k].sort().join('') === [...w].sort().join('')));
  const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRx = (v) => new RegExp(`(^|[^\\p{L}\\p{N}])(${escRx(v)})(?=$|[^\\p{L}\\p{N}])`, 'giu');

  function counts(field) {
    const m = new Map();
    for (const it of T().state.items) { const v = String(it[field] || '').trim(); if (v) m.set(v, (m.get(v) || 0) + 1); }
    return m;
  }
  function lookalikes(m) {
    const vals = [...m.keys()]; const groups = []; const used = new Set();
    for (const v of vals) {
      if (used.has(v)) continue;
      const k = key(v); if (!k) continue;
      const g = vals.filter((w) => !used.has(w) && (key(w) === k || near(k, key(w))));
      if (g.length > 1) { g.forEach((w) => used.add(w)); groups.push(g.sort((a, b) => m.get(b) - m.get(a))); }
    }
    return groups;
  }
  const inNames = (val) => T().state.items.filter((it) => wordRx(val).test(it.name || '')).length;

  function rename(field, from, to, fixNames) {
    const t = T(); to = String(to || '').trim();
    const froms = (Array.isArray(from) ? from : [from]).filter((f) => f && f !== to);
    if (!to || !froms.length) return 0;
    const changes = [];
    for (const it of t.state.items) {
      const cur = String(it[field] || '').trim();
      const hit = froms.includes(cur);
      let name = it.name || '';
      if (fixNames) for (const f of froms) name = name.replace(wordRx(f), (m0, pre) => pre + to);
      const nameHit = name !== (it.name || '');
      if (!hit && !nameHit) continue;
      const n = { ...it };
      if (hit) n[field] = to;
      if (nameHit) n.name = name;
      changes.push({ id: it.id, after: n });
    }
    // keep the settings list in step too (materials have a saved list)
    const S = t.state.settings, lists = { material: 'materials' };
    if (lists[field] && Array.isArray(S[lists[field]]) && S[lists[field]].some((x) => froms.includes(x))) { S[lists[field]] = [...new Set(S[lists[field]].map((x) => (froms.includes(x) ? to : x)))]; t.saveSettings(); }
    if (changes.length) { t.commit('items', changes, { label: `fix spelling: ${froms.join(', ')} → ${to}` }); t.renderAll(); }
    return changes.length;
  }

  async function open(field = 'brand') {
    const body = document.createElement('div'); body.className = 'tidy';
    const paint = () => {
      const m = counts(field), groups = lookalikes(m), q = (body.querySelector('.tidy-q') || {}).value || '';
      const all = [...m.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).filter((v) => !q || v.toLowerCase().includes(q.toLowerCase()));
      body.innerHTML = `
        <div class="tidy-tabs" role="tablist">${Object.entries(FIELDS).map(([f, l]) => `<button type="button" role="tab" class="chip ${f === field ? 'on' : ''}" data-f="${f}" aria-selected="${f === field}">${l}</button>`).join('')}</div>
        ${groups.length ? `<div class="tidy-sec"><h4>Look-alikes <span class="muted small">— tap the right spelling to use it for all of them</span></h4>${groups.map((g, gi) => `<div class="tidy-grp">${g.map((v) => `<button type="button" class="tidy-pick" data-g="${gi}" data-v="${esc(v)}"><b>${esc(v)}</b><small>${m.get(v)} item${m.get(v) > 1 ? 's' : ''}</small></button>`).join('')}</div>`).join('')}</div>`
          : `<p class="muted small tidy-ok">✓ No look-alike ${FIELDS[field].toLowerCase()} found.</p>`}
        <div class="tidy-sec"><h4>All ${FIELDS[field].toLowerCase()} <span class="muted small">(${m.size})</span></h4>
          <input class="tidy-q" type="search" placeholder="Filter…" value="${esc(q)}" aria-label="Filter">
          <div class="tidy-list">${all.map((v) => `<div class="tidy-row"><span><b>${esc(v)}</b> <small class="muted">${m.get(v)} item${m.get(v) > 1 ? 's' : ''}</small></span><button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(v)}">Rename…</button></div>`).join('') || '<p class="muted small">Nothing yet.</p>'}</div></div>
        <datalist id="tidyDl">${[...m.keys()].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
      const qq = body.querySelector('.tidy-q'); if (q) { qq.focus(); qq.setSelectionRange(q.length, q.length); }
      body._groups = groups;
    };
    const editor = (row, from) => {
      body.querySelectorAll('.tidy-edit').forEach((e) => e.remove());
      const n = inNames(from), cnt = counts(field).get(from) || 0;
      const ed = document.createElement('div'); ed.className = 'tidy-edit';
      ed.innerHTML = `<label class="field"><span>Change “${esc(from)}” to</span><input class="tidy-to" list="tidyDl" value="${esc(from)}" autocapitalize="words"></label>
        ${n ? `<label class="check"><input type="checkbox" class="tidy-names" checked> Also fix it in item names (${n})</label>` : ''}
        <div class="tidy-act"><button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button><button type="button" class="btn btn-primary btn-sm" data-apply="${esc(from)}">Change ${cnt} item${cnt > 1 ? 's' : ''}</button></div>`;
      row.insertAdjacentElement('afterend', ed);
      const inp = ed.querySelector('.tidy-to'); inp.focus(); inp.select();
    };
    body.addEventListener('input', (e) => { if (e.target.classList.contains('tidy-q')) paint(); });
    body.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-f]'); if (f) { field = f.dataset.f; paint(); return; }
      const ed = e.target.closest('[data-edit]'); if (ed) { editor(ed.closest('.tidy-row'), ed.dataset.edit); return; }
      if (e.target.closest('[data-cancel]')) { e.target.closest('.tidy-edit').remove(); return; }
      const ap = e.target.closest('[data-apply]');
      if (ap) {
        const box = ap.closest('.tidy-edit'), to = box.querySelector('.tidy-to').value.trim(), nm = box.querySelector('.tidy-names');
        if (!to) { U.toast('Type the correct spelling', 'err'); return; }
        const n = rename(field, ap.dataset.apply, to, nm ? nm.checked : false);
        U.toast(n ? `Fixed ${n} item${n > 1 ? 's' : ''}: “${ap.dataset.apply}” → “${to}”` : 'Nothing to change', 'ok'); paint(); return;
      }
      const pk = e.target.closest('.tidy-pick');
      if (pk) {
        const g = body._groups[+pk.dataset.g] || [], keep = pk.dataset.v, others = g.filter((v) => v !== keep);
        const total = others.reduce((a, v) => a + (counts(field).get(v) || 0), 0);
        const names = others.reduce((a, v) => a + inNames(v), 0);
        const ok = await confirmInline(pk.closest('.tidy-grp'), `Use “${keep}” instead of ${others.map((v) => `“${v}”`).join(', ')} on ${total} item${total > 1 ? 's' : ''}?`, names);
        if (!ok) return;
        const n = rename(field, others, keep, ok.names);
        U.toast(`Fixed ${n} item${n > 1 ? 's' : ''} — now all “${keep}”`, 'ok'); paint();
      }
    });
    // a small yes/no right under the group (a second pop-up would close this one)
    const confirmInline = (host, msg, names) => new Promise((res) => {
      body.querySelectorAll('.tidy-edit').forEach((x) => x.remove());
      const d = document.createElement('div'); d.className = 'tidy-edit';
      d.innerHTML = `<p class="small">${esc(msg)}</p>${names ? `<label class="check"><input type="checkbox" class="tidy-names" checked> Also fix it in item names (${names})</label>` : ''}<div class="tidy-act"><button type="button" class="btn btn-ghost btn-sm" data-no>Cancel</button><button type="button" class="btn btn-primary btn-sm" data-yes>Fix them</button></div>`;
      host.insertAdjacentElement('afterend', d);
      d.querySelector('[data-no]').onclick = (ev) => { ev.stopPropagation(); d.remove(); res(false); };
      d.querySelector('[data-yes]').onclick = (ev) => { ev.stopPropagation(); const c = d.querySelector('.tidy-names'); d.remove(); res({ names: c ? c.checked : false }); };
    });
    paint();
    await U.modal({ title: '🧹 Fix spellings', body, wide: true, buttons: [{ label: 'Done', value: true, cls: 'btn-primary' }] });
  }
  X.fixSpellings = open;

  function renderCard() {
    const host = document.getElementById('setCategories'); if (!host || document.getElementById('tidyCard')) return;
    const card = host.closest('.card'); if (!card) return;
    const box = document.createElement('div'); box.className = 'card'; box.id = 'tidyCard';
    box.innerHTML = `<h3>🧹 Fix spellings</h3><p class="muted small">The Brand, Color, Size and Material suggestions come from what’s typed on your items — so a typo on one item keeps showing up as a choice. Rename it here and it’s fixed on every item at once (and in item names, if you like). You can Undo it.</p>
      <div class="row-wrap">${Object.entries(FIELDS).map(([f, l]) => `<button type="button" class="btn btn-sm" data-tidy="${f}">${l}</button>`).join('')}</div>`;
    card.insertAdjacentElement('afterend', box);
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-tidy]'); if (b) open(b.dataset.tidy); });
  }
  X.on('init', () => setTimeout(renderCard, 0));
  X.on('view', (v) => { if (v === 'settings') setTimeout(renderCard, 0); });
})();
