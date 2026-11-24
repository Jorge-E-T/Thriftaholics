/* =========================================================
   SKU labels with QR codes + camera scanning
   - QR codes hold a link to the item (…/#sku=123), so any phone
     camera app opens the item; the in-app scanner reads them too.
   ========================================================= */
(function (global) {
  'use strict';
  const esc = (s) => U.esc(s);
  const Labels = {};

  Labels.FORMATS = {
    avery5160: { name: 'Avery 5160 / 8160 sheet (30 per page, 1" × 2⅝")' },
    avery5163: { name: 'Avery 5163 sheet (10 per page, 2" × 4")' },
    thermal2x1: { name: 'Label printer 2" × 1" (one per label)' },
    thermal4x6: { name: 'Label printer 4" × 6" (one per label)' }
  };

  Labels.itemUrl = (it) => {
    const base = location.origin + location.pathname;
    return it.sku ? `${base}#sku=${encodeURIComponent(it.sku)}` : `${base}#id=${encodeURIComponent(it.id)}`;
  };
  Labels.qrSvg = (text) => {
    if (!global.qrcode) return '';
    const qr = global.qrcode(0, 'M');
    qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
  };

  /** Print labels for items. ctx: { format, money, platformLabel } */
  Labels.print = (items, ctx = {}) => {
    if (!items.length) { U.toast('Select items to print labels for.'); return; }
    const fmt = ctx.format || 'avery5160';
    const money = ctx.money || ((n) => (n == null ? '' : '$' + (+n).toFixed(2)));
    const thermal = fmt.startsWith('thermal');
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    const co = esc(ctx.company || '');
    const big = fmt === 'thermal4x6' || fmt === 'avery5163';
    const brandRow = co ? `<div class="brand">${big ? `<img src="${ctx.logo || base + 'icons/brand-mark.png'}" alt="">` : ''}<span>${co}</span></div>` : '';
    const label = (it) => `<div class="lbl"><div class="qr">${Labels.qrSvg(Labels.itemUrl(it))}</div><div class="tx">
        ${brandRow}<div class="sku">${it.sku ? 'SKU ' + esc(it.sku) : ''}${it.location ? `<span class="loc">${esc(it.location)}</span>` : ''}</div>
        <div class="nm">${esc(it.name)}</div>
        <div class="meta">${[it.brand, it.size ? 'Size ' + it.size : ''].filter(Boolean).map(esc).join(' · ')}</div>
        ${it.sellingPrice != null ? `<div class="pr">${esc(money(it.sellingPrice))}</div>` : ''}</div></div>`;
    const css = {
      avery5160: `@page { size: letter; margin: 0.5in 0.1875in 0 0.1875in; } .sheet { display: grid; grid-template-columns: repeat(3, 2.625in); column-gap: 0.125in; grid-auto-rows: 1in; }
        .lbl { padding: 0.06in 0.1in; gap: 0.08in; } .qr { width: 0.82in; height: 0.82in; } .nm { font-size: 7.5pt; -webkit-line-clamp: 2; } .sku { font-size: 9pt; } .meta { font-size: 6.5pt; } .pr { font-size: 8.5pt; }`,
      avery5163: `@page { size: letter; margin: 0.5in 0.15625in 0 0.15625in; } .sheet { display: grid; grid-template-columns: repeat(2, 4in); column-gap: 0.1875in; grid-auto-rows: 2in; }
        .lbl { padding: 0.15in 0.2in; gap: 0.15in; } .qr { width: 1.6in; height: 1.6in; } .nm { font-size: 11pt; -webkit-line-clamp: 3; } .sku { font-size: 14pt; } .meta { font-size: 9pt; } .pr { font-size: 13pt; }`,
      thermal2x1: `@page { size: 2in 1in; margin: 0; } .sheet { display: block; } .lbl { width: 2in; height: 1in; padding: 0.05in 0.07in; gap: 0.06in; page-break-after: always; break-after: page; }
        .qr { width: 0.86in; height: 0.86in; } .nm { font-size: 6.5pt; -webkit-line-clamp: 2; } .sku { font-size: 9pt; } .meta { font-size: 6pt; } .pr { font-size: 8pt; }`,
      thermal4x6: `@page { size: 4in 6in; margin: 0; } .sheet { display: block; } .lbl { width: 4in; height: 6in; padding: 0.3in; gap: 0.25in; flex-direction: column; justify-content: center; text-align: center; page-break-after: always; break-after: page; }
        .qr { width: 2.6in; height: 2.6in; } .nm { font-size: 16pt; -webkit-line-clamp: 3; } .sku { font-size: 22pt; justify-content: center; } .meta { font-size: 12pt; } .pr { font-size: 20pt; }`
    }[fmt];
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Labels</title><style>
      * { box-sizing: border-box; } html, body { margin: 0; } body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .lbl { display: flex; align-items: center; overflow: hidden; } .qr { flex: none; } .qr svg { width: 100%; height: 100%; display: block; }
      .tx { min-width: 0; line-height: 1.15; } .sku { font-weight: 800; display: flex; gap: 6px; align-items: center; }
      .loc { font-size: 0.8em; font-weight: 700; border: 1px solid #000; border-radius: 3px; padding: 0 3px; }
      .nm { font-weight: 600; display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; margin-top: 1px; }
      .meta { color: #333; margin-top: 1px; } .pr { font-weight: 800; margin-top: 1px; }
      @font-face { font-family: "Pacifico"; src: url(${base}fonts/pacifico.woff2) format("woff2"); }
      .brand { font-family: "Pacifico", cursive; color: ${thermal ? '#000' : '#164e47'}; font-size: ${big ? '13pt' : '7.5pt'}; line-height: 1.25; display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; }
      .brand img { height: ${fmt === 'thermal4x6' ? '0.9in' : '0.42in'}; width: auto; ${thermal ? 'filter: grayscale(1);' : ''} }
      ${fmt === 'thermal4x6' ? '.brand { flex-direction: column; font-size: 20pt; }' : ''}
      ${thermal ? '' : '.lbl { border-left: 3px solid #e7b84f; } .pr { color: #164e47; }'}
      ${css}</style></head><body><div class="sheet">${items.map(label).join('')}</div></body></html>`;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const ready = Promise.race([Promise.all([...[...doc.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))), doc.fonts ? doc.fonts.ready : 0]), new Promise((r) => setTimeout(r, 2500))]);
    Labels.lastHtml = html;
    ready.then(() => setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { U.toast('Printing failed: ' + e.message, 'err'); }
      setTimeout(() => frame.remove(), 60000);
    }, 150));
    U.toast(`${items.length} label(s) sent to the printer — choose “Actual size” / 100% scale`, 'ok');
  };

  /** Read a SKU (or item id) from scanned text: a label link, or a plain SKU / barcode. */
  Labels.parse = (text) => {
    const t = String(text || '').trim();
    const m = /#(sku|id)=([^&\s]+)/.exec(t);
    if (m) return { [m[1]]: decodeURIComponent(m[2]) };
    return { sku: t };
  };

  /** Open the camera and scan a label. Calls onCode(text). */
  Labels.scan = async (onCode) => {
    const supported = 'BarcodeDetector' in global && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    const body = document.createElement('div');
    body.innerHTML = supported
      ? '<div class="scan-wrap"><video playsinline muted></video><div class="scan-frame"></div></div><p class="muted small" style="text-align:center">Point the camera at a label’s QR code or a barcode.</p><label class="field"><span>…or type a SKU</span><input data-manual placeholder="e.g. 147"></label>'
      : `<p>This browser can’t scan codes inside the app. That’s fine — <b>open your phone’s camera app and point it at a label’s QR code</b>; it opens the item here directly.</p>
         <label class="field"><span>Or type a SKU</span><input data-manual placeholder="e.g. 147"></label>`;
    let stream = null, stop = false;
    const finish = (code) => { stop = true; if (stream) stream.getTracks().forEach((t) => t.stop()); U.closeModal(code); };
    const p = U.modal({ title: 'Scan a label', body, buttons: [{ label: 'Close', value: null, cls: 'btn-ghost' }, { label: 'Find SKU', cls: 'btn-primary', value: (b) => b.querySelector('[data-manual]').value.trim() || null }] });
    if (supported) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const video = body.querySelector('video');
        video.srcObject = stream; await video.play();
        const formats = (await global.BarcodeDetector.getSupportedFormats?.()) || ['qr_code'];
        const det = new global.BarcodeDetector({ formats: formats.filter((f) => ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'].includes(f)) });
        const tick = async () => {
          if (stop) return;
          try { const codes = await det.detect(video); if (codes.length) { finish(codes[0].rawValue); return; } } catch (_) { /* keep trying */ }
          setTimeout(tick, 220);
        };
        tick();
      } catch (e) {
        body.querySelector('.scan-wrap').innerHTML = `<p class="muted">Camera unavailable (${esc(e.message)}). Allow camera access, or type the SKU below.</p>`;
      }
    }
    const res = await p;
    stop = true; if (stream) stream.getTracks().forEach((t) => t.stop());
    if (res) onCode(res);
  };

  global.Labels = Labels;
})(window);
