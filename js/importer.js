/* =========================================================
   Import from other programs' JSON backups
   - Finds the list(s) of records anywhere in the file
   - Matches the old field names to this app's columns
   - Lets you review / change the mapping with a live preview
   - Remembers the mapping per file format, so later imports are one click
   - Gives each record a stable ID, so re-importing updates instead of duplicating
   ========================================================= */
(function (global) {
  'use strict';
  const esc = (s) => U.esc(s);
  const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

  /* ---------- target fields + the names other programs commonly use ---------- */
  const ITEM_FIELDS = [
    { key: 'name', label: 'Item Name', syn: ['itemname', 'name', 'item', 'title', 'product', 'productname', 'itemtitle', 'listingtitle', 'listing', 'description'] },
    { key: 'category', label: 'Category', syn: ['category', 'cat', 'categoryname', 'type', 'itemtype', 'producttype', 'department', 'group'] },
    { key: 'sku', label: 'SKU', syn: ['sku', 'skunumber', 'itemnumber', 'itemno', 'itemnum', 'stocknumber', 'stockno', 'code', 'barcode', 'upc', 'inventorynumber', 'number', 'no'] },
    { key: 'purchasePrice', label: 'Purchase Price', type: 'money', syn: ['purchaseprice', 'cost', 'costprice', 'purchasecost', 'itemcost', 'unitcost', 'paid', 'pricepaid', 'amountpaid', 'buyprice', 'boughtfor', 'cogs', 'purchase'] },
    { key: 'sellingPrice', label: 'Selling Price', type: 'money', syn: ['sellingprice', 'saleprice', 'soldprice', 'soldfor', 'listprice', 'listingprice', 'askingprice', 'sellprice', 'retailprice', 'retail', 'price'] },
    { key: 'status', label: 'Status', type: 'status', syn: ['status', 'itemstatus', 'state', 'sold', 'issold', 'availability', 'available', 'listingstatus'] },
    { key: 'platform', label: 'Platform it sold', syn: ['platformitsold', 'platform', 'marketplace', 'soldon', 'channel', 'site', 'venue', 'store', 'wheresold', 'salesplatform'] },
    { key: 'datePosted', label: 'Date Posted', type: 'date', syn: ['dateposted', 'posted', 'posteddate', 'datelisted', 'listeddate', 'listed', 'listdate', 'dateadded', 'added', 'createdat', 'created', 'datecreated', 'datepurchased', 'purchasedate', 'acquired', 'dateacquired'] },
    { key: 'dateSold', label: 'Date Sold', type: 'date', syn: ['datesold', 'solddate', 'saledate', 'dateofsale', 'soldat', 'soldon_date', 'solddatetime'] },
    { key: 'totalAfterFees', label: 'Total After Fees', type: 'money', syn: ['totalafterfees', 'afterfees', 'netafterfees', 'net', 'netamount', 'netsale', 'netsales', 'totalnet', 'payout', 'earnings', 'received', 'amountreceived', 'totalmade', 'made', 'proceeds'] },
    { key: 'shippingCost', label: 'Shipping Cost', type: 'money', syn: ['shippingcost', 'shipping', 'postage', 'shippingfee', 'shippingpaid', 'label', 'labelcost'] },
    { key: 'notes', label: 'Notes', syn: ['notes', 'note', 'comments', 'comment', 'memo', 'details', 'remarks', 'description'] },
    { key: 'brand', label: 'Brand', syn: ['brand', 'brandname', 'designer', 'maker'] },
    { key: 'size', label: 'Size', syn: ['size', 'itemsize'] },
    { key: 'color', label: 'Color', syn: ['color', 'colour'] },
    { key: 'condition', label: 'Condition', syn: ['condition', 'itemcondition'] },
    { key: 'material', label: 'Material', syn: ['material', 'materials', 'fabric', 'fabriccontent', 'composition'] },
    { key: 'measurements', label: 'Measurements', syn: ['measurements', 'measurement', 'dimensions'] },
    { key: 'weight', label: 'Weight', syn: ['weight', 'shippingweight'] },
    { key: 'location', label: 'Storage location', syn: ['location', 'storagelocation', 'bin', 'shelf', 'storage'] },
    { key: 'source', label: 'Source', syn: ['source', 'sourcedfrom', 'boughtat', 'supplier', 'purchasedfrom'] },
    { key: 'purchaseDate', label: 'Purchase date', type: 'date', syn: ['purchasedate', 'datepurchased', 'boughton', 'acquiredon'] },
    { key: 'minPrice', label: 'Lowest acceptable price', type: 'money', syn: ['minprice', 'lowestprice', 'floorprice', 'minimumprice'] },
    { key: '_link', label: 'Listing link (URL)', syn: ['listingurl', 'listinglink', 'itemurl', 'itemlink', 'producturl', 'url', 'link', 'links', 'urls', 'permalink', 'href'] },
    { key: '_listedOn', label: 'Listed on (platforms)', syn: ['listedon', 'platforms', 'crosslistedon', 'crosslisted', 'listedplatforms', 'channels', 'marketplaces', 'listings'] },
    { key: '_photo', label: 'Photo (image data)', syn: ['photo', 'image', 'img', 'picture', 'pic', 'thumbnail', 'thumb', 'photos', 'images', 'imageurl', 'photourl', 'imagedata', 'photodata'] },
    { key: '_fees', label: 'Fees → calculates Total After Fees', type: 'money', syn: ['fees', 'fee', 'platformfee', 'platformfees', 'sellingfee', 'sellingfees', 'commission'] },
    { key: '_profit', label: 'Profit → calculates Total After Fees', type: 'money', syn: ['profit', 'netprofit', 'gain'] },
    { key: '_ignore', label: 'Skip (calculated in this app)', syn: ['daysactive', 'days', 'daysonmarket', 'daysposted', 'daysactivelisted', 'age', 'margin', 'roi'] }
  ];
  const EXP_FIELDS = [
    { key: 'date', label: 'Date', type: 'date', syn: ['date', 'expensedate', 'paidon', 'datepaid', 'purchasedate', 'created', 'createdat', 'when'] },
    { key: 'category', label: 'Category', syn: ['category', 'type', 'expensetype', 'account', 'expensecategory'] },
    { key: 'vendor', label: 'Vendor', syn: ['vendor', 'merchant', 'store', 'payee', 'seller', 'supplier', 'paidto', 'company'] },
    { key: 'description', label: 'Description', syn: ['description', 'item', 'name', 'title', 'details', 'what', 'purpose'] },
    { key: 'amount', label: 'Amount', type: 'money', syn: ['amount', 'total', 'cost', 'price', 'value', 'sum', 'spent', 'expense'] },
    { key: 'payment', label: 'Payment', syn: ['payment', 'paymentmethod', 'method', 'paidwith', 'card', 'paymenttype'] },
    { key: 'notes', label: 'Notes', syn: ['notes', 'note', 'comments', 'comment', 'memo'] }
  ];
  const ID_KEYS = ['id', 'uuid', '_id', 'guid', 'itemid', 'key', 'recordid', 'productid', 'expenseid'];
  const FIELDS = { items: ITEM_FIELDS, expenses: EXP_FIELDS };

  /* ---------- find record lists anywhere in the JSON ---------- */
  function flatten(obj, prefix = '', out = {}, depth = 0) {
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && depth < 2) flatten(v, key, out, depth + 1);
      else out[key] = v;
    }
    return out;
  }
  function findLists(root) {
    const found = [];
    const seen = new Set();
    const visit = (node, path, depth) => {
      if (!node || typeof node !== 'object' || depth > 6 || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        const objs = node.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
        if (objs.length && objs.length >= node.length * 0.8) found.push({ path: path || '(top level)', records: objs });
        node.slice(0, 50).forEach((x, i) => visit(x, `${path}[${i}]`, depth + 1));
        return;
      }
      const vals = Object.values(node);
      // dictionary of records: { "abc": {...}, "def": {...} }
      const objVals = vals.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
      if (vals.length >= 2 && objVals.length === vals.length) {
        // records don't need identical fields — just a shared core (e.g., unsold items lack a sale date)
        const sampleVals = objVals.slice(0, 50);
        const counts = new Map();
        sampleVals.forEach((o) => Object.keys(o).forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
        const shared = [...counts.values()].filter((c) => c >= sampleVals.length * 0.8).length;
        if (shared >= 2 && sampleVals.every((o) => Object.keys(o).length >= 2)) {
          found.push({ path: (path || '(top level)') + ' {…}', records: Object.entries(node).map(([k, v]) => ({ __key: k, ...v })) });
        }
      }
      for (const [k, v] of Object.entries(node)) visit(v, path ? `${path}.${k}` : k, depth + 1);
    };
    visit(root, '', 0);
    // ignore lists nested inside a record (e.g., each item's "tags") when a parent list exists
    return found
      .map((l) => ({ ...l, flat: l.records.map((r) => flatten(r)) }))
      .filter((l) => keysOf(l.flat).length >= 2)
      .sort((a, b) => b.records.length - a.records.length);
  }
  function keysOf(flat) {
    const counts = new Map();
    flat.slice(0, 500).forEach((r) => Object.keys(r).forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
    return [...counts.keys()];
  }

  /* ---------- automatic field matching ---------- */
  function score(sourceKey, field) {
    const last = norm(String(sourceKey).split('.').pop());
    const full = norm(sourceKey);
    let best = 0;
    field.syn.forEach((syn, i) => {
      const bonus = (field.syn.length - i) / (field.syn.length * 10); // earlier synonyms win ties
      if (last === syn || full === syn) best = Math.max(best, 3 + bonus);
      else if (syn.length >= 4 && (last.startsWith(syn) || last.endsWith(syn))) best = Math.max(best, 2 + bonus);
      else if (syn.length >= 5 && last.includes(syn)) best = Math.max(best, 1 + bonus);
    });
    return best;
  }
  function autoMap(keys, kind) {
    const fields = FIELDS[kind];
    const pairs = [];
    keys.forEach((k) => {
      if (k === '__key' || ID_KEYS.includes(norm(k))) return;
      fields.forEach((f) => { const s = score(k, f); if (s > 0) pairs.push({ k, f: f.key, s }); });
    });
    pairs.sort((a, b) => b.s - a.s);
    const map = {}, used = new Set();
    pairs.forEach(({ k, f }) => { if (map[k] || used.has(f)) return; map[k] = f; if (!f.startsWith('_ignore')) used.add(f); });
    keys.forEach((k) => { if (!map[k]) map[k] = ''; });
    return map;
  }
  function guessKind(list) {
    const keys = keysOf(list.flat);
    const cover = (kind) => Object.values(autoMap(keys, kind)).filter((v) => v && v !== '_ignore').length;
    if (/expense|cost|spend|purchase(s)?$/i.test(list.path) && !/item|inventory|product/i.test(list.path)) return 'expenses';
    return cover('items') >= cover('expenses') ? 'items' : 'expenses';
  }
  function signature(keys) { return 'fmt-' + hash(keys.map(norm).sort().join('|')); }
  function idKeyOf(keys) { return keys.find((k) => ID_KEYS.includes(norm(k))) || (keys.includes('__key') ? '__key' : null); }
  function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }

  /* ---------- value conversion ---------- */
  function toDate(v) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) return U.toISO(v);
    if (typeof v === 'number') {
      const fromMs = (ms) => { const d = new Date(ms); return ms % 86400000 === 0 ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` : U.toISO(d); };
      if (v > 1e11) return fromMs(v);          // epoch milliseconds (midnight UTC = that calendar date)
      if (v > 1e9) return fromMs(v * 1000);    // epoch seconds
      if (v > 20000 && v < 80000) return U.toISO(new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000)); // Excel serial
      return '';
    }
    const s = String(v).trim();
    let m;
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) return U.toISO(new Date(+m[1], +m[2] - 1, +m[3]));
    if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s))) {        // US style M/D/Y (D/M/Y when first part > 12)
      let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
      const [mo, d] = a > 12 ? [b, a] : [a, b];
      return U.toISO(new Date(y, mo - 1, d));
    }
    if (/^\d{10,13}$/.test(s)) return toDate(+s);
    const p = Date.parse(s);
    return isNaN(p) ? '' : U.toISO(new Date(p));
  }
  const BOOL_TRUE = ['true', 'yes', 'y', '1', 'sold', 'x', '✓', 'done'];
  const BOOL_FALSE = ['false', 'no', 'n', '0', '', 'unsold', 'notsold'];
  function toStatus(v, sourceKey) {
    if (v === null || v === undefined) return '';
    const isBoolField = /^(is)?sold$|^available$/i.test(norm(String(sourceKey).split('.').pop()));
    const s = norm(v);
    if (typeof v === 'boolean' || (isBoolField && (BOOL_TRUE.includes(s) || BOOL_FALSE.includes(s)))) {
      const t = typeof v === 'boolean' ? v : BOOL_TRUE.includes(s);
      return /available/i.test(sourceKey) ? (t ? 'available' : 'sold') : (t ? 'sold' : 'available');
    }
    if (['sold', 'complete', 'completed', 'shipped', 'delivered', 'paid', 'closed', 'done', 'fulfilled'].includes(s)) return 'sold';
    if (['available', 'active', 'listed', 'forsale', 'instock', 'unsold', 'open', 'draft', 'new', 'inventory', 'live', 'notlisted', 'unlisted'].includes(s)) return 'available';
    if (['pending', 'reserved', 'onhold', 'hold', 'offer', 'offeraccepted', 'awaitingpayment', 'processing'].includes(s)) return 'pending';
    if (['returned', 'return', 'refunded'].includes(s)) return 'returned';
    if (['donated', 'donate', 'gaveaway', 'givenaway'].includes(s)) return 'donated';
    return String(v).trim().toLowerCase();
  }
  const money = (v) => { if (v === null || v === undefined || v === '') return null; const n = U.num(v); return n === null ? null : U.round2(n); };
  const text = (v) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.filter((x) => typeof x !== 'object').join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v).trim());
  function photoData(v) {
    const first = Array.isArray(v) ? v.find(Boolean) : v;
    const s = typeof first === 'object' && first ? (first.dataURL || first.data || first.src || first.url || first.full || first.thumb || '') : String(first || '');
    if (/^data:image\//i.test(s)) return { dataURL: s };
    const raw = s.replace(/\s/g, '');
    if (raw.length > 200 && /^[A-Za-z0-9+/=]+$/.test(raw)) {
      const mime = raw.startsWith('/9j/') ? 'image/jpeg' : raw.startsWith('iVBOR') ? 'image/png' : raw.startsWith('UklGR') ? 'image/webp' : raw.startsWith('R0lGOD') ? 'image/gif' : 'image/jpeg';
      return { dataURL: `data:${mime};base64,${raw}` };
    }
    if (/^https?:\/\//i.test(s)) return { url: s };
    return null;
  }

  /** Convert one flattened source record using a mapping. */
  function convert(flat, mapping, kind, opts) {
    const out = {}, extras = [], fields = FIELDS[kind];
    let fees = null, profit = null, photo = null;
    const links = [], listedOn = [];
    for (const [k, v] of Object.entries(flat)) {
      const t = mapping[k];
      if (!t) {
        if (opts.extrasToNotes && k !== '__key' && !ID_KEYS.includes(norm(k)) && v !== null && v !== '') {
          const sv = Array.isArray(v) ? v.filter((x) => x !== null && typeof x !== 'object').join(', ') : typeof v === 'object' ? '' : String(v);
          if (sv && sv.length <= 200 && !/^data:/.test(sv)) extras.push(`${k}: ${sv}`);
        }
        continue;
      }
      if (t === '_ignore') continue;
      const f = fields.find((x) => x.key === t);
      if (t === '_fees') { fees = money(v); continue; }
      if (t === '_profit') { profit = money(v); continue; }
      if (t === '_photo') { photo = photoData(v); continue; }
      if (t === '_link') {
        (Array.isArray(v) ? v : String(v ?? '').split(/[\s,]+/)).forEach((x) => {
          const u = typeof x === 'object' && x ? (x.url || x.link || '') : x;
          if (u && /^(https?:\/\/|www\.)/i.test(String(u).trim())) links.push(String(u).trim());
        });
        continue;
      }
      if (t === '_listedOn') {
        (Array.isArray(v) ? v : String(v ?? '').split(/[,;/|]+/)).forEach((x) => {
          if (x && typeof x === 'object') listedOn.push({ platform: text(x.platform || x.name || x.site || x.marketplace || ''), url: text(x.url || x.link || '') });
          else if (String(x ?? '').trim()) listedOn.push({ platform: String(x).trim(), url: '' });
        });
        continue;
      }
      if (!f) continue;
      let val;
      if (f.type === 'money') val = money(v);
      else if (f.type === 'date') val = toDate(v);
      else if (f.type === 'status') val = toStatus(v, k);
      else val = text(v);
      if (t === 'notes' && out.notes) out.notes += ' · ' + val; else if (val !== '' && val !== null) out[t] = val;
    }
    if (kind === 'items') {
      if (typeof out.category === 'string') out.category = out.category.toLowerCase();
      if (typeof out.platform === 'string') out.platform = out.platform.toLowerCase();
      if (typeof out.sku === 'number') out.sku = String(out.sku);
      if (out.sku && /^\d+\.0+$/.test(out.sku)) out.sku = out.sku.replace(/\.0+$/, '');
      if (!out.status) out.status = out.dateSold || out.totalAfterFees != null ? 'sold' : 'available';
      if (out.status === 'sold' && out.totalAfterFees == null) {
        if (fees != null && out.sellingPrice != null) out.totalAfterFees = U.round2(out.sellingPrice - fees);
        else if (profit != null) out.totalAfterFees = U.round2(profit + (out.purchasePrice || 0) + (out.shippingCost || 0));
      }
      if (out.status !== 'sold') out.dateSold = out.dateSold || '';
      if (photo && photo.url) extras.push(`Photo URL: ${photo.url}`);
      if (links.length || listedOn.length) {
        const L = listedOn.map((l) => ({ platform: l.platform.toLowerCase(), url: l.url }));
        links.forEach((u) => {
          const g = U.platformFromUrl(u);
          const slot = L.find((l) => !l.url && (!g || l.platform === g));
          if (slot) { slot.url = u; if (!slot.platform) slot.platform = g; }
          else L.push({ platform: g || (out.platform || ''), url: u });
        });
        out.listings = L;
      }
    }
    if (extras.length) out.notes = [out.notes, extras.join('; ')].filter(Boolean).join(' · ');
    return { rec: out, photo: photo && photo.dataURL ? photo.dataURL : null };
  }

  /* ---------- the import dialog ---------- */
  /* The old Thriftaholicss_ program (IndexedDB "AndysShopDB": inventory + balanceSheet + categories),
     as saved by its Backup button or by Thriftaholics Data Rescue. Reshape it so the right fields line up:
     the sale price wins over the list price, and only balance-sheet expenses you typed yourself become
     expenses (the program added sale / cost-of-goods / fee lines automatically for every sale). */
  function oldThriftFormat(root) {
    const idb = root && root.indexedDB;
    if (!idb || !Array.isArray(idb.inventory) || !Array.isArray(idb.balanceSheet)) return root;
    const items = idb.inventory.map((it) => {
      const o = { ...it };
      const sold = String(it.status || '').toLowerCase() === 'sold';
      o.sellingPrice = sold && it.soldPrice ? it.soldPrice : it.price;
      if (sold && it.soldPrice && it.price && +it.soldPrice !== +it.price) o.listPrice = it.price;
      delete o.price; delete o.soldPrice;
      if (Array.isArray(it.locations) && it.locations.length) o.location = it.locations.join(', ');
      if (Array.isArray(it.purchaseDates) && it.purchaseDates.length) o.purchaseDate = it.purchaseDates[0];
      if (it.feeBreakdown && +it.feeBreakdown.shipping) o.shippingCost = +it.feeBreakdown.shipping;
      delete o.locations; delete o.purchaseDates; delete o.feeBreakdown; delete o.daysPosted;
      return o;
    });
    const expenses = idb.balanceSheet.filter((e) => e && e.type === 'credit' && !e.relatedItemId)
      .map((e) => ({ id: e.id, date: e.date, description: e.description, amount: e.amount, category: 'Supplies' }));
    const out = { 'Inventory items (old Thriftaholicss_ program)': items };
    if (expenses.length) out['Expenses you entered (old balance sheet)'] = expenses;
    return out;
  }

  async function run(root, fileName, ctx) {
    root = oldThriftFormat(root);
    const lists = findLists(root);
    // inventory-looking lists first, then the biggest
    const invLike = (l) => /inventor|items?\b|product/i.test(l.path) ? 1 : 0;
    lists.sort((a, b) => invLike(b) - invLike(a) || b.records.length - a.records.length);
    if (!lists.length) { U.toast('No list of records was found in that JSON file.', 'err'); return; }
    const S = ctx.settings();
    S.importProfiles = S.importProfiles || {};

    // initial choice: largest list; restore saved profile when the format matches
    let li = 0;
    let kind = guessKind(lists[0]);
    let mapping, opts, savedUsed = false;
    const keysFor = (i) => keysOf(lists[i].flat);
    const loadMapping = () => {
      const keys = keysFor(li), sig = signature(keys), prof = S.importProfiles[sig];
      if (prof && prof.kind === kind) {
        mapping = { ...autoMap(keys, kind), ...prof.mapping };
        opts = { extrasToNotes: true, mode: 'update', ...prof.opts };
        savedUsed = true;
      } else { mapping = autoMap(keys, kind); opts = opts || { extrasToNotes: true, mode: 'update' }; savedUsed = false; }
    };
    // if a saved profile exists for any list, prefer it
    for (let i = 0; i < lists.length; i++) { const p = S.importProfiles[signature(keysFor(i))]; if (p) { li = i; kind = p.kind; break; } }
    loadMapping();

    const body = document.createElement('div');
    body.className = 'imp';
    const render = () => {
      const list = lists[li], keys = keysFor(li), fields = FIELDS[kind];
      const sample = (k) => list.flat.map((r) => r[k]).filter((v) => v !== null && v !== undefined && v !== '').slice(0, 3)
        .map((v) => { const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /^data:image|^[A-Za-z0-9+/=]{300,}$/.test(s) ? '[image data]' : s.length > 38 ? s.slice(0, 36) + '…' : s; });
      const res = preview();
      body.innerHTML = `
        ${savedUsed ? '<div class="imp-note ok">✓ Recognized this file format — using the field mapping you saved last time. Review the preview and click Import.</div>' : '<div class="imp-note">Fields were matched automatically. Check each one, change any that are wrong, and the mapping will be remembered for next time.</div>'}
        <div class="imp-top">
          <label class="field"><span>Records found in ${esc(fileName)}</span>
            <select data-list>${lists.map((l, i) => `<option value="${i}" ${i === li ? 'selected' : ''}>${esc(l.path)} — ${l.records.length} records</option>`).join('')}</select></label>
          <label class="field"><span>Import as</span>
            <select data-kind><option value="items" ${kind === 'items' ? 'selected' : ''}>Inventory items</option><option value="expenses" ${kind === 'expenses' ? 'selected' : ''}>Expenses</option></select></label>
          <label class="field"><span>When a record was imported before</span>
            <select data-mode>
              <option value="update" ${opts.mode === 'update' ? 'selected' : ''}>Update it, and add new records</option>
              <option value="new" ${opts.mode === 'new' ? 'selected' : ''}>Keep mine, only add new records</option>
              ${kind === 'items' ? `<option value="replace" ${opts.mode === 'replace' ? 'selected' : ''}>Replace my whole inventory</option>` : ''}
            </select></label>
        </div>
        <div class="imp-cols">
          <div>
            <h4>Field mapping</h4>
            <div class="imp-map">
              <table><thead><tr><th>Field in old file</th><th>Example values</th><th>Goes to</th></tr></thead><tbody>
              ${keys.filter((k) => k !== '__key').map((k) => `<tr class="${mapping[k] ? '' : 'unmapped'}"><td><code>${esc(k)}</code>${ID_KEYS.includes(norm(k)) ? ' <span class="muted small">(record ID)</span>' : ''}</td><td class="muted small">${sample(k).map(esc).join('<br>') || '—'}</td>
                <td>${ID_KEYS.includes(norm(k)) ? '<span class="muted small">Used to match on re-import</span>' : `<select data-map="${esc(k)}"><option value="">— Don’t import —</option>${fields.map((f) => `<option value="${f.key}" ${mapping[k] === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select>`}</td></tr>`).join('')}
              </tbody></table>
            </div>
            <label class="check"><input type="checkbox" data-extras ${opts.extrasToNotes ? 'checked' : ''}> Add fields marked “Don’t import” to Notes (so nothing is lost)</label>
          </div>
          <div>
            <h4>Preview</h4>
            <div class="imp-stats">${res.statsHTML}</div>
            ${res.warnHTML}
            <div class="imp-prev">${res.tableHTML}</div>
          </div>
        </div>`;
    };
    function preview() {
      const conv = lists[li].flat.map((f) => convert(f, mapping, kind, opts));
      const fields = FIELDS[kind];
      const req = kind === 'items' ? 'name' : 'amount';
      const ok = conv.filter((c) => c.rec[req] !== undefined && c.rec[req] !== '' && c.rec[req] !== null);
      const warn = [];
      if (!Object.values(mapping).includes(req)) warn.push(`Choose which field is the <b>${kind === 'items' ? 'Item Name' : 'Amount'}</b> — it’s required.`);
      if (conv.length - ok.length && Object.values(mapping).includes(req)) warn.push(`${conv.length - ok.length} record(s) have no ${kind === 'items' ? 'name' : 'amount'} and will be skipped.`);
      const dateKeys = Object.entries(mapping).filter(([, t]) => fields.find((f) => f.key === t && f.type === 'date')).map(([k]) => k);
      let badDates = 0;
      lists[li].flat.forEach((f) => dateKeys.forEach((k) => { if (f[k] !== null && f[k] !== undefined && f[k] !== '' && !toDate(f[k])) badDates++; }));
      if (badDates) warn.push(`${badDates} date value(s) couldn’t be read and will be left blank.`);
      const photos = ok.filter((c) => c.photo).length;
      let statsHTML;
      if (kind === 'items') {
        const sum = (k) => U.money0(ok.reduce((a, c) => a + (c.rec[k] || 0), 0));
        const sold = ok.filter((c) => c.rec.status === 'sold').length;
        statsHTML = `<div><b>${ok.length}</b><span>items</span></div><div><b>${sold}</b><span>sold</span></div><div><b>${sum('purchasePrice')}</b><span>Total Purchase</span></div><div><b>${sum('sellingPrice')}</b><span>Inventory Estimate</span></div><div><b>${sum('totalAfterFees')}</b><span>Total Made</span></div>${photos ? `<div><b>${photos}</b><span>photos</span></div>` : ''}`;
      } else {
        statsHTML = `<div><b>${ok.length}</b><span>expenses</span></div><div><b>${U.money0(ok.reduce((a, c) => a + (c.rec.amount || 0), 0))}</b><span>total</span></div>`;
      }
      const cols = kind === 'items'
        ? [['name', 'Item'], ['category', 'Category'], ['sku', 'SKU'], ['purchasePrice', 'Cost', 'm'], ['sellingPrice', 'Price', 'm'], ['status', 'Status'], ['platform', 'Platform'], ['datePosted', 'Posted', 'd'], ['dateSold', 'Sold', 'd'], ['totalAfterFees', 'Net', 'm']]
        : [['date', 'Date', 'd'], ['category', 'Category'], ['vendor', 'Vendor'], ['description', 'Description'], ['amount', 'Amount', 'm']];
      const tableHTML = `<table><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${ok.slice(0, 8).map((c) => `<tr>${cols.map(([k, , t]) => { const v = c.rec[k]; return `<td class="${t === 'm' ? 'num' : ''}">${v === undefined || v === null || v === '' ? '<span class="muted">—</span>' : esc(t === 'm' ? U.money(v) : t === 'd' ? U.fmtDate(v) : v)}</td>`; }).join('')}</tr>`).join('')}</tbody></table>${ok.length > 8 ? `<p class="muted small">…and ${ok.length - 8} more</p>` : ''}`;
      return { conv, ok, statsHTML, tableHTML, warnHTML: warn.length ? `<div class="imp-note warn">${warn.join('<br>')}</div>` : '', valid: Object.values(mapping).includes(req) && ok.length > 0 };
    }
    body.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-list]')) { li = +t.value; kind = guessKind(lists[li]); loadMapping(); }
      else if (t.matches('[data-kind]')) { kind = t.value; if (kind === 'expenses' && opts.mode === 'replace') opts.mode = 'update'; loadMapping(); }
      else if (t.matches('[data-mode]')) opts.mode = t.value;
      else if (t.matches('[data-extras]')) opts.extrasToNotes = t.checked;
      else if (t.matches('[data-map]')) {
        const k = t.dataset.map, v = t.value;
        if (v && v !== '_ignore') Object.keys(mapping).forEach((o) => { if (o !== k && mapping[o] === v) mapping[o] = ''; }); // one source per field
        mapping[k] = v; savedUsed = false;
      }
      const scroll = body.querySelector('.imp-map')?.scrollTop || 0;
      render();
      const m = body.querySelector('.imp-map'); if (m) m.scrollTop = scroll;
    });
    render();

    const go = await U.modal({
      title: 'Import from another program', body, wide: 'xl',
      buttons: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, {
        label: 'Import', cls: 'btn-primary',
        validate: () => { const r = preview(); if (!r.valid) { U.toast('Map the required field first (Item Name for items, Amount for expenses).', 'err'); return false; } return true; }
      }]
    });
    if (!go) return;

    // remember mapping for this format
    const keys = keysFor(li);
    S.importProfiles[signature(keys)] = { kind, mapping, opts, name: fileName, saved: new Date().toISOString() };
    ctx.saveSettings();

    const idKey = idKeyOf(keys);
    const srcTag = 'imp-' + hash(signature(keys)) + '-';
    const stableId = (flat, rec) => srcTag + hash(idKey && flat[idKey] !== undefined && flat[idKey] !== null && flat[idKey] !== ''
      ? 'id:' + flat[idKey]
      : 'sig:' + [norm(rec.name || rec.description || ''), rec.sku || '', rec.datePosted || rec.date || '', rec.amount ?? ''].join('|'));
    const req = kind === 'items' ? 'name' : 'amount';
    const conv = lists[li].flat.map((f) => ({ f, ...convert(f, mapping, kind, opts) }))
      .filter((c) => c.rec[req] !== undefined && c.rec[req] !== null && c.rec[req] !== '');
    const seenIds = new Map();
    const records = conv.map((c) => {
      let id = stableId(c.f, c.rec);
      const n = (seenIds.get(id) || 0) + 1; seenIds.set(id, n);
      if (n > 1) id += '-' + n; // identical rows in the source stay separate
      return { id, rec: c.rec, photo: c.photo };
    });
    const result = await ctx.apply(kind, records, opts.mode);
    U.toast(`Imported from ${fileName}: ${result.added} added, ${result.updated} updated${result.skipped ? `, ${result.skipped} kept as-is` : ''}${result.photos ? `, ${result.photos} photos` : ''}.`, 'ok');
  }

  global.LegacyImport = { run, _test: { findLists, autoMap, toDate, toStatus, convert, keysOf } };
})(window);
