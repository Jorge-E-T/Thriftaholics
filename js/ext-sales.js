/* =========================================================
   Sales add-ons: bundle orders info, offers, refunds & returns
   ========================================================= */
(function () {
  'use strict';
  const X = window.Ext, esc = X.esc;
  const OFFER_ST = { pending: ['Waiting', '#c9952e'], countered: ['Countered', '#3f7fb5'], accepted: ['Accepted', '#2f8a57'], declined: ['Declined', '#8b9490'] };

  /* ---------- bundle / order info in the item sheet ---------- */
  X.on('sheetTop', (it) => {
    if (!it.orderId || !(it.orderSize > 1)) return '';
    const T = window.TA;
    const mates = T.state.items.filter((x) => x.orderId === it.orderId);
    const tot = mates.reduce((a, x) => a + (+x.sellingPrice || 0), 0), net = mates.reduce((a, x) => a + Calc.net(x), 0), pr = mates.reduce((a, x) => a + (Calc.profit(x) || 0), 0);
    return `<div class="sh-card sh-wide"><h4>Sold as a bundle of ${mates.length}</h4>
      <div class="bundle-mates">${mates.map((x) => `<button type="button" class="bm ${x.id === it.id ? 'me' : ''}" data-sheet="${esc(x.id)}">${T.thumbOf(x) ? `<img src="${T.thumbOf(x)}" alt="">` : '<span></span>'}<b>${esc(x.name)}</b><em>${U.money(x.sellingPrice)} share</em></button>`).join('')}</div>
      <p class="small muted">Order total ${U.money(tot)} · payout ${U.money(net)} · profit <b>${U.money(pr)}</b>. Each item carries its share, so reports stay right.</p></div>`;
  });

  /* ---------- offers ---------- */
  X.on('sheetBottom', (it) => {
    const T = window.TA;
    if (Calc.isSold(it) && !(it.offers || []).length && !(it.refunds || []).length) return '';
    const offers = (it.offers || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const offerCard = Calc.isSold(it) && !offers.length ? '' : `<div class="sh-card"><h4>Offers ${offers.length ? `<span class="pill">${offers.length}</span>` : ''}</h4>
      ${offers.length ? `<ul class="offers">${offers.map((o) => { const st = OFFER_ST[o.status] || OFFER_ST.pending; const pctOff = it.sellingPrice ? Math.round((1 - o.amount / it.sellingPrice) * 100) : null; return `<li><span class="of-amt">${U.money(o.amount)}</span><span class="of-meta">${esc(U.fmtDate(o.date))}${o.platform ? ' · ' + esc(T.platformLabel(o.platform)) : ''}${pctOff !== null && pctOff > 0 ? ` · ${pctOff}% off` : ''}${o.counter != null ? ` · you countered ${U.money(o.counter)}` : ''}${o.note ? ' · ' + esc(o.note) : ''}</span><span class="of-st" style="--c:${st[1]}">${st[0]}</span><button type="button" class="linklike small" data-sh="offer:${esc(o.id)}">Edit</button></li>`; }).join('')}</ul>` : '<p class="muted small">No offers recorded. Log offers to see what buyers will pay — and fill the sale price in one tap when you accept.</p>'}
      ${Calc.isSold(it) ? '' : '<button type="button" class="btn btn-sm" data-sh="offer:new">+ Log an offer</button>'}
      ${it.minPrice != null ? `<p class="small muted">Your lowest acceptable price: <b>${U.money(it.minPrice)}</b></p>` : ''}</div>`;
    const refunds = it.refunds || [];
    const refundCard = refunds.length ? `<div class="sh-card"><h4>Refunds &amp; returns</h4><ul class="offers">${refunds.map((r) => `<li><span class="of-amt neg">−${U.money((+r.amount || 0) + (+r.returnShip || 0))}</span><span class="of-meta">${esc(U.fmtDate(r.date))}${r.amount ? ` · refund ${U.money(r.amount)}` : ''}${r.returnShip ? ` · return shipping ${U.money(r.returnShip)}` : ''}${r.note ? ' · ' + esc(r.note) : ''}</span></li>`).join('')}</ul><p class="small muted">Profit already includes these.</p></div>` : '';
    return offerCard + refundCard;
  });

  async function offerDialog(it, offerId) {
    const T = window.TA;
    const cur = (it.offers || []).find((o) => o.id === offerId) || { id: U.uid(), date: U.todayISO(), platform: ((it.listings || []).find((l) => l.status === 'active') || {}).platform || '', amount: null, status: 'pending', counter: null, note: '' };
    const isNew = !(it.offers || []).some((o) => o.id === cur.id);
    const body = document.createElement('div');
    const live = (it.listings || []).filter((l) => l.status === 'active').map((l) => l.platform);
    body.innerHTML = `<div class="form-grid">
        <label class="field"><span>Offer amount</span><input name="amount" inputmode="decimal" value="${cur.amount ?? ''}" placeholder="what the buyer offered"></label>
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(cur.date)}"></label>
        <label class="field"><span>Platform</span><input name="platform" list="dlOffPlat" value="${esc(T.platformLabel(cur.platform))}"></label>
        <label class="field"><span>Status</span><select name="status">${Object.entries(OFFER_ST).map(([k, v]) => `<option value="${k}" ${cur.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
        <label class="field"><span>Your counter-offer (optional)</span><input name="counter" inputmode="decimal" value="${cur.counter ?? ''}"></label>
        <label class="field"><span>Note</span><input name="note" value="${esc(cur.note)}" placeholder="e.g. bundle with 2 others"></label>
      </div>
      <p class="small" data-hint></p>
      ${T.dl('dlOffPlat', T.uniq([...live.map(T.platformLabel), ...T.allPlatforms().map(T.platformLabel)]))}`;
    const f = (n) => body.querySelector(`[name=${n}]`);
    const hint = () => {
      const a = U.num(f('counter').value) ?? U.num(f('amount').value); const p = T.profileFor(f('platform').value.trim());
      if (a == null) { body.querySelector('[data-hint]').textContent = ''; return; }
      const e = p ? Calc.platformEstimate(p, a) : null;
      const pr = e ? U.round2(e.payout - (it.purchasePrice || 0) - (e.sellerShip || 0)) : null;
      body.querySelector('[data-hint]').innerHTML = `${e ? `At ${U.money(a)} you’d keep about <b>${U.money(e.payout)}</b> after ${esc(p.name)} fees` : ''}${pr !== null ? ` — profit <b class="${pr < 0 ? 'neg' : ''}">${U.money(pr)}</b>` : ''}${it.minPrice != null && a < it.minPrice ? ` <span class="neg">· below your lowest price (${U.money(it.minPrice)})</span>` : ''}`;
    };
    body.addEventListener('input', hint); hint();
    const r = await U.modal({ title: isNew ? `Log an offer — ${it.name}` : 'Edit offer', body, buttons: [
      ...(isNew ? [] : [{ label: 'Delete', value: 'delete', cls: 'btn-danger' }]),
      { label: 'Cancel', value: null, cls: 'btn-ghost' },
      { label: 'Save', cls: 'btn-primary', value: 'save', validate: () => { if (U.num(f('amount').value) == null) { f('amount').focus(); return false; } return true; } }] });
    if (!r) return;
    const after = U.clone(T.findItem(it.id));
    after.offers = (after.offers || []).filter((o) => o.id !== cur.id);
    if (r === 'save') {
      const o = { ...cur, amount: U.round2(U.num(f('amount').value)), date: f('date').value || U.todayISO(), platform: f('platform').value.trim().toLowerCase(), status: f('status').value, counter: U.num(f('counter').value), note: f('note').value.trim() };
      after.offers.push(o);
      T.commit('items', [{ id: it.id, after }], { label: o.status === 'accepted' ? 'accepted an offer' : 'logged an offer' });
      if (o.status === 'accepted' && !Calc.isSold(after)) {
        const go = await U.confirm('Offer accepted', `<p>Record the sale now at <b>${U.money(o.counter ?? o.amount)}</b>?</p>`, 'Record sale');
        if (go) { T.renderAll(); T.markSoldDialog([T.findItem(it.id)]); return; }
      }
    } else T.commit('items', [{ id: it.id, after }], { label: 'deleted an offer' });
    T.renderAll(); T.openItemSheet(it.id);
  }

  /* ---------- refunds & returns ---------- */
  async function refundDialog(it) {
    const T = window.TA;
    it = T.findItem(it.id);
    if (!Calc.isSold(it)) { U.toast('Refunds are for sold items'); return; }
    const body = document.createElement('div');
    body.innerHTML = `<div class="bundle-pick">
        <label class="radio-card"><input type="radio" name="kind" value="partial" checked><span><b>Partial refund</b><em>The buyer keeps the item; you give some money back (e.g. a flaw they found).</em></span></label>
        <label class="radio-card"><input type="radio" name="kind" value="return"><span><b>Returned — back in stock</b><em>The item came back. It returns to inventory to sell again; return shipping you paid is recorded as an expense.</em></span></label>
        <label class="radio-card"><input type="radio" name="kind" value="lost"><span><b>Refunded — item not coming back</b><em>Full refund; the item is lost or kept by the buyer. The sale is reversed and its cost written off.</em></span></label></div>
      <div class="form-grid g3">
        <label class="field" data-k="amount"><span>Amount refunded to the buyer</span><input name="amount" inputmode="decimal" placeholder="0.00"></label>
        <label class="field"><span>Return shipping you paid</span><input name="returnShip" inputmode="decimal" placeholder="0.00"></label>
        <label class="field"><span>Date</span><input type="date" name="date" value="${U.todayISO()}"></label>
      </div>
      <label class="field"><span>Note</span><input name="note" placeholder="e.g. stain not shown in photos"></label>
      <p class="small muted" data-hint></p>`;
    const f = (n) => body.querySelector(`[name=${n}]`);
    const kind = () => body.querySelector('[name=kind]:checked').value;
    const upd = () => {
      body.querySelector('[data-k=amount]').classList.toggle('hidden', kind() !== 'partial');
      const amt = U.num(f('amount').value) || 0, rs = U.num(f('returnShip').value) || 0;
      body.querySelector('[data-hint]').innerHTML = kind() === 'partial' ? `Profit on this sale goes from <b>${U.money(Calc.profit(it))}</b> to <b>${U.money(Calc.profit(it) - amt - rs)}</b>.`
        : kind() === 'return' ? `The sale is removed from your totals and “${esc(it.name)}” goes back to Available${it.location ? ` (it was in ${esc(it.location)})` : ''}.${rs ? ` ${U.money(rs)} return shipping is added to Expenses.` : ''}`
          : `The sale is removed from your totals and the item is marked Lost (its cost ${U.money(it.purchasePrice)} is written off).${rs ? ` ${U.money(rs)} return shipping is added to Expenses.` : ''}`;
    };
    body.addEventListener('input', upd); body.addEventListener('change', upd); upd();
    const ok = await U.modal({ title: `Refund or return — ${it.name}`, body, buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'Save', cls: 'btn-primary', validate: () => kind() !== 'partial' || (U.num(f('amount').value) || U.num(f('returnShip').value)) ? true : (f('amount').focus(), false) }] });
    if (!ok) return;
    const date = f('date').value || U.todayISO(), rs = U.round2(U.num(f('returnShip').value) || 0), note = f('note').value.trim();
    const after = U.clone(it);
    if (kind() === 'partial') {
      after.refunds = [...(after.refunds || []), { id: U.uid(), date, amount: U.round2(U.num(f('amount').value) || 0), returnShip: rs, note }];
      T.commit('items', [{ id: it.id, after }], { label: 'recorded a refund' });
      U.toast('Refund recorded — profit updated', 'ok');
    } else {
      Object.assign(after, { status: kind() === 'return' ? 'available' : 'lost', dateSold: '', totalAfterFees: null, orderId: '', orderSize: 0, refunds: [], buyer: null, invoice: null, disposedDate: kind() === 'lost' ? date : '',
        notes: [after.notes, `${kind() === 'return' ? 'Returned' : 'Refunded (not returned)'} ${U.fmtDate(date)} — was sold on ${T.platformLabel(after.platform) || 'a site'} for ${U.money(after.sellingPrice)}${note ? ': ' + note : ''}`].filter(Boolean).join('\n') });
      if (kind() === 'return') { after.platform = ''; after.listings = (after.listings || []).map((l) => (l.status === 'sold' ? { ...l, status: 'delisted' } : l)); }
      T.commit('items', [{ id: it.id, after }], { label: kind() === 'return' ? 'item returned' : 'refunded, not returned' });
      const eid = U.uid();
      if (rs) T.commit('expenses', [{ id: eid, after: { id: eid, date, category: 'Postage / labels', vendor: T.platformLabel(it.platform) || '', description: `Return shipping — ${it.name}`, amount: rs, payment: '', notes: note, createdAt: Date.now(), updatedAt: Date.now() } }], { label: 'return shipping' });
      U.toast(kind() === 'return' ? `“${it.name}” is back in inventory${it.location ? ' — put it back in ' + it.location : ''}` : 'Sale reversed and the item written off', 'ok', { ms: 7000 });
    }
    T.renderAll();
  }
  X.refundDialog = refundDialog;

  X.on('sheetAction', (go, it) => {
    if (go === 'refund') { refundDialog(it); return true; }
    if (go.startsWith('offer:')) { const id = go.slice(6); offerDialog(window.TA.findItem(it.id), id === 'new' ? null : id); return true; }
    return false;
  });
  // the app's original Ext.refundDialog name
  window.Ext.refundDialog = refundDialog;
})();
