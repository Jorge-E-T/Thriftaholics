/* =========================================================
   Voice typing: tap the microphone and speak instead of typing.
   Uses the browser's built-in speech recognition (Chrome on Android,
   Safari on iPhone). Where the browser can't do it, the phone
   keyboard's own microphone still works in every field.
   ========================================================= */
(function () {
  'use strict';
  const X = window.Ext;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iosInstalled = isIOS && (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);
  // Safari exposes the API in home-screen apps but it doesn't work there, so treat it as unavailable
  const supported = !!SR && !iosInstalled;
  const KEY = 'thrift-voice';
  const enabled = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (_) { return true; } };
  X.voice = { supported, iosInstalled, isIOS, enabled };

  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>';
  let rec = null, target = null, btnActive = null, base = '', bubble = null;

  const isTextField = (el) => el && ((el.tagName === 'TEXTAREA' && !el.readOnly) || (el.tagName === 'INPUT' && !el.readOnly && !el.disabled && ['text', 'search', ''].includes((el.getAttribute('type') || '').toLowerCase()) && el.type !== 'password'));
  const numeric = (el) => /decimal|numeric/.test(el.getAttribute('inputmode') || '');

  function cleanNumber(t) {
    const words = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
    let s = String(t).toLowerCase().replace(/dollars?|bucks?|\$/g, ' ').replace(/ and /g, ' ').replace(/(\d),(\d)/g, '$1$2');
    s = s.replace(/(\d+)\s*(?:cents?)/, '0.$1').replace(/ point /g, '.');
    const m = s.match(/\d+(?:\.\d+)?/);
    if (m) {
      const c = s.match(/(\d+)\s+(\d{1,2})\b/); // "25 50" → 25.50
      return c && !m[0].includes('.') ? `${c[1]}.${c[2].padStart(2, '0')}` : m[0];
    }
    let n = 0, any = false; s.split(/[\s-]+/).forEach((w) => { if (w in words) { n += words[w]; any = true; } else if (w === 'hundred') n *= 100; });
    return any ? String(n) : t.trim();
  }
  function insert(el, text) {
    if (numeric(el)) { el.value = cleanNumber(text); }
    else {
      const sep = base && !/\s$/.test(base) ? ' ' : '';
      let t = text.trim(); if (!base.trim() && t) t = t.charAt(0).toUpperCase() + t.slice(1);
      el.value = base + sep + t;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function showBubble(text) {
    if (!bubble) { bubble = document.createElement('div'); bubble.className = 'vc-bubble'; document.body.appendChild(bubble); }
    bubble.innerHTML = `<span class="vc-dot"></span><span>${X.esc(text || 'Listening… speak now')}</span>`;
    const r = (target || document.body).getBoundingClientRect();
    bubble.style.left = Math.max(8, Math.min(window.innerWidth - 280, r.left)) + 'px';
    bubble.style.top = (r.top > 70 ? r.top - 44 : r.bottom + 8) + 'px';
  }
  function stop() { if (rec) { try { rec.stop(); } catch (_) { /* ignore */ } } }
  function finish() {
    rec = null;
    if (btnActive) btnActive.classList.remove('on');
    btnActive = null;
    if (bubble) { bubble.remove(); bubble = null; }
    if (target) { target.dispatchEvent(new Event('change', { bubbles: true })); try { target.focus(); } catch (_) { /* ignore */ } }
  }
  function listen(el, btn) {
    if (rec) { stop(); return; }
    if (!supported) { help(); return; }
    target = el; btnActive = btn; base = numeric(el) ? '' : el.value;
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let txt = ''; let final = false;
      for (let i = 0; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) final = true; }
      insert(el, txt); showBubble(final ? '✓ ' + txt : txt);
    };
    rec.onerror = (e) => {
      const msg = { 'not-allowed': 'Microphone blocked. Allow the microphone for this site in your browser settings, then try again.', 'service-not-allowed': isIOS ? 'Voice typing is off. Turn on Siri & Dictation in Settings, or use the microphone on your keyboard.' : 'Voice typing isn’t available here — use the microphone on your keyboard.', 'no-speech': 'Didn’t hear anything — tap the microphone and try again.', 'audio-capture': 'No microphone found.', network: 'Voice typing needs an internet connection.' }[e.error];
      if (msg) U.toast(msg, e.error === 'no-speech' ? '' : 'err', { ms: 6000 });
    };
    rec.onend = finish;
    try { rec.start(); btn.classList.add('on'); showBubble(); }
    catch (e) { finish(); U.toast('Couldn’t start voice typing: ' + e.message, 'err'); }
  }
  function help() {
    U.modal({ title: 'Voice typing', body: `<p>This browser can’t use the app’s microphone button${iosInstalled ? ' inside the home-screen app' : ''}.</p>
      <p><b>Use your keyboard’s microphone instead</b> — it works in every box in the app:</p>
      <ul><li><b>iPhone:</b> tap a box, then the 🎤 key at the bottom of the keyboard. (If it’s missing: Settings → General → Keyboard → Enable Dictation.)</li>
      <li><b>Android:</b> tap a box, then the 🎤 on the keyboard (top-right of Gboard).</li></ul>`, buttons: [{ label: 'OK', value: true, cls: 'btn-primary' }] });
  }

  /* ---------- floating mic next to whichever text box has focus ---------- */
  let fab = null, fabFor = null, hideT = 0;
  function placeFab() {
    if (!fab || !fabFor) return;
    const r = fabFor.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > window.innerHeight) { fab.classList.add('hidden'); return; }
    fab.classList.remove('hidden');
    const s = 34, tall = fabFor.tagName === 'TEXTAREA';
    // boxes with a suggestion list (Brand, Size…) or a spinner/picker have the browser's own arrow at the
    // right edge — sit just left of it so a click on the arrow never turns the microphone on
    const gap = hasArrow(fabFor) ? 26 : 0;
    fab.style.left = (r.right - s - 4 - gap) + 'px';
    fab.style.top = (tall ? r.bottom - s - 4 : r.top + (r.height - s) / 2) + 'px';
  }
  const hasArrow = (el) => el.tagName === 'INPUT' && (el.hasAttribute('list') || /^(number|date|time|datetime-local|month|week)$/.test(el.type));
  function showFab(el) {
    if (!enabled() || !supported || el.closest('.vc-skip') || el.hasAttribute('data-vc-inline')) return;
    if (!fab) {
      fab = document.createElement('button'); fab.type = 'button'; fab.className = 'vc-fab'; fab.title = 'Speak instead of typing'; fab.innerHTML = MIC;
      fab.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the focus in the box
      fab.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (fabFor) listen(fabFor, fab); });
      document.body.appendChild(fab);
    }
    clearTimeout(hideT); fabFor = el; el.classList.add('vc-pad'); el.classList.toggle('vc-pad-arrow', hasArrow(el)); placeFab();
    [60, 180, 360, 600].forEach((ms) => setTimeout(placeFab, ms)); // windows slide in, so re-check the spot
  }
  function hideFab() { hideT = setTimeout(() => { if (rec) return; if (fab) fab.classList.add('hidden'); if (fabFor) fabFor.classList.remove('vc-pad', 'vc-pad-arrow'); fabFor = null; }, 150); }

  /* ---------- built-in mic buttons in the search boxes ---------- */
  function inlineMic(input, cls) {
    if (!input || input.dataset.vcInline || !supported || !enabled()) return;
    input.setAttribute('data-vc-inline', '1');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'vc-inline ' + (cls || ''); b.title = 'Search by voice'; b.innerHTML = MIC;
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); input.focus(); listen(input, b); });
    input.insertAdjacentElement('afterend', b);
  }
  X.voiceInline = inlineMic;

  function renderSetting() {
    const anchor = document.getElementById('setShowName'); if (!anchor || document.getElementById('setVoice')) return;
    const lab = document.createElement('label'); lab.className = 'check';
    lab.innerHTML = `<input type="checkbox" id="setVoice" ${enabled() ? 'checked' : ''}> 🎤 Voice typing buttons on this device <span class="muted small">${supported ? '(a microphone appears in text boxes and searches)' : iosInstalled ? '— not available in the iPhone home-screen app; use the keyboard’s 🎤' : '— not available in this browser; use the keyboard’s 🎤'}</span>`;
    anchor.closest('label').insertAdjacentElement('afterend', lab);
    lab.querySelector('input').addEventListener('change', (e) => { try { localStorage.setItem(KEY, e.target.checked ? 'on' : 'off'); } catch (_) { /* ignore */ } U.toast(e.target.checked ? 'Voice typing on — reopen a screen to see the microphones' : 'Voice typing off', 'ok'); if (!e.target.checked) document.querySelectorAll('.vc-inline').forEach((b) => b.remove()); });
  }

  X.on('init', () => {
    document.addEventListener('focusin', (e) => { if (isTextField(e.target)) showFab(e.target); });
    document.addEventListener('focusout', (e) => { if (e.target === fabFor) hideFab(); });
    window.addEventListener('scroll', placeFab, true); window.addEventListener('resize', placeFab);
    inlineMic(document.getElementById('invSearch'), 'in-inv');
    renderSetting();
    // the search-everything box is created when it opens
    new MutationObserver((ms) => { if (ms.some((m) => [...m.addedNodes].some((n) => n.classList && n.classList.contains('ck')))) inlineMic(document.querySelector('.ck-in input'), 'in-ck'); }).observe(document.body, { childList: true });
  });
  X.on('view', (v) => { setTimeout(() => { if (v === 'settings') renderSetting(); if (v === 'guide') inlineMic(document.getElementById('gSearch'), 'in-guide'); }, 0); });

  /* =====================================================
     READ ALOUD: press and hold any text box, then let go
     ===================================================== */
  const TTS = window.speechSynthesis;
  const TKEY = 'thrift-readaloud', RKEY = 'thrift-readrate';
  const ttsOn = () => { try { return localStorage.getItem(TKEY) !== 'off'; } catch (_) { return true; } };
  const rate = () => { try { return +(localStorage.getItem(RKEY) || 1); } catch (_) { return 1; } };
  X.readAloud = { supported: !!TTS, enabled: ttsOn };
  let say = null;
  const isReadable = (el) => el && (isTextField(el) || (el.tagName === 'INPUT' && ['date', 'number', 'email', 'url', 'tel'].includes(el.type)) || el.tagName === 'SELECT');
  function labelOf(el) {
    const lab = el.closest('label'); let t = '';
    if (lab) { const sp = lab.querySelector('span'); t = (sp ? sp.textContent : lab.textContent.replace(el.value || '', '')).trim(); }
    if (!t && el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t = l.textContent.trim(); }
    if (!t) t = el.getAttribute('aria-label') || el.placeholder || '';
    return t.replace(/\s*\*$/, '').replace(/\s+/g, ' ').slice(0, 60);
  }
  function valueOf(el) {
    if (el.tagName === 'SELECT') return el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '';
    if (el.type === 'date' && el.value) return new Date(el.value + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const v = String(el.value || '').trim();
    if (/decimal/.test(el.getAttribute('inputmode') || '') && /^-?\d+(\.\d+)?$/.test(v)) return U.money(+v);
    return v;
  }
  function speak(text, from) {
    if (!TTS) return;
    TTS.cancel();
    say = new SpeechSynthesisUtterance(text);
    say.lang = navigator.language || 'en-US'; say.rate = rate();
    const voices = TTS.getVoices(); const v = voices.find((x) => x.lang === say.lang && x.localService) || voices.find((x) => x.lang && x.lang.startsWith(say.lang.slice(0, 2)));
    if (v) say.voice = v;
    showSpeaking(text, from);
    say.onend = say.onerror = () => { say = null; hideSpeaking(); };
    TTS.speak(say);
  }
  X.speak = speak;
  let sb = null;
  function showSpeaking(text, from) {
    hideSpeaking();
    sb = document.createElement('div'); sb.className = 'tts-bubble';
    sb.innerHTML = `<span class="tts-ico">🔊</span><span class="tts-t">${X.esc(text.length > 140 ? text.slice(0, 140) + '…' : text)}</span><button type="button" class="tts-stop" aria-label="Stop reading">■ Stop</button>`;
    document.body.appendChild(sb);
    sb.querySelector('.tts-stop').addEventListener('click', () => { TTS.cancel(); hideSpeaking(); });
    if (from) { const r = from.getBoundingClientRect(); sb.style.left = Math.max(8, Math.min(window.innerWidth - 300, r.left)) + 'px'; sb.style.top = (r.top > 80 ? r.top - 56 : r.bottom + 8) + 'px'; }
  }
  function hideSpeaking() { if (sb) { sb.remove(); sb = null; } }
  function readField(el) {
    const lab = labelOf(el), val = valueOf(el);
    speak(val ? (lab ? `${lab}: ${val}` : val) : `${lab || 'This box'} is empty.`, el);
  }
  /* ---------- whole items, sales, expenses and trips ---------- */
  const T = () => window.TA;
  const dlong = (iso) => (iso ? new Date(iso + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '');
  function itemSummary(it) {
    const t = T(); if (!it) return '';
    const parts = [it.name || 'Untitled item'];
    const st = (it.status || '').toLowerCase();
    if (Calc.isSold(it)) {
      parts.push(`Sold for ${U.money(it.sellingPrice)}${it.platform ? ' on ' + t.platformLabel(it.platform) : ''}${it.dateSold ? ', ' + dlong(it.dateSold) : ''}`);
      const p = Calc.profit(it); if (p != null) parts.push(`${p < 0 ? 'Loss' : 'Profit'} ${U.money(Math.abs(p))}`);
      if (it.orderSize > 1) parts.push(`Part of a bundle of ${it.orderSize}`);
    } else {
      parts.push(`${st ? st.charAt(0).toUpperCase() + st.slice(1) : 'Available'}, price ${U.money(it.sellingPrice)}`);
      const d = Calc.daysActive(it); if (d != null) parts.push(`${d} day${d === 1 ? '' : 's'} old`);
      const live = (it.listings || []).filter((l) => l.status === 'active').map((l) => t.platformLabel(l.platform));
      if (live.length) parts.push('Listed on ' + live.join(', ')); else if (it.platform) parts.push('Platform ' + t.platformLabel(it.platform)); else parts.push('No marketplace recorded');
    }
    if (it.purchasePrice != null) parts.push(`Cost ${U.money(it.purchasePrice)}`);
    [['SKU', it.sku], ['Brand', it.brand], ['Size', it.size], ['Color', it.color], ['Condition', it.condition], ['Material', it.material], ['Category', it.category], ['In', it.location]].forEach(([k, v]) => { if (v) parts.push(`${k} ${v}`); });
    if ((it.offers || []).some((o) => o.status === 'pending')) parts.push('Has an offer waiting');
    return parts.join('. ') + '.';
  }
  function expenseSummary(e) { return e ? `Expense. ${e.description || e.category}. ${U.money(e.amount)}${e.vendor ? ' at ' + e.vendor : ''}, ${dlong(e.date)}. Category ${e.category}.` : ''; }
  function tripSummary(m) { return m ? `Trip. ${Calc.tripMiles(m)} miles${m.roundTrip ? ', round trip' : ''}${m.to ? ' to ' + m.to : ''}, ${dlong(m.date)}. ${m.purpose || ''}.` : ''; }
  X.itemSummary = itemSummary;
  // what can be read by holding it: text boxes, or a whole item card / row / tile
  function containerOf(target) {
    const t = T(); if (!t) return null;
    const row = target.closest('tr[data-id]');
    if (row) {
      const tbl = row.closest('table'), id = row.dataset.id;
      if (tbl && (tbl.id === 'invTable' || tbl.id === 'ordTable')) { const it = t.findItem(id); return it && { el: row, text: () => itemSummary(t.findItem(id)) }; }
      if (tbl && tbl.id === 'expTable') return { el: row, text: () => expenseSummary(t.state.expenses.find((e) => e.id === id)) };
      if (tbl && tbl.id === 'mileTable') return { el: row, text: () => tripSummary(t.state.mileage.find((m) => m.id === id)) };
    }
    const c = target.closest('[data-aid], [data-sheet], .sh-main, .sh-photo');
    if (c) {
      const id = c.dataset.aid || c.dataset.sheet || ((c.closest('[data-item]') || {}).dataset || {}).item;
      if (id && t.findItem(id)) return { el: c, text: () => itemSummary(t.findItem(id)) };
    }
    return null;
  }

  // press-and-hold detection; the speech starts when you let go (phones only allow sound from a tap)
  let hold = null;
  const HOLD_MS = 550;
  function down(e) {
    if (!TTS || !ttsOn() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    let el = e.target.closest('input, textarea, select'), read = null;
    if (isReadable(el)) read = () => readField(el);
    else { if (e.target.closest('button, a, .row-actions, .col-check')) return; const c = containerOf(e.target); if (!c) return; el = c.el; read = () => speak(c.text(), el); }
    hold = { el, read, x: e.clientX, y: e.clientY, t: Date.now(), ready: false, timer: setTimeout(() => { if (!hold) return; hold.ready = true; el.classList.add('tts-ready'); try { navigator.vibrate && navigator.vibrate(18); } catch (_) { /* ignore */ } }, HOLD_MS) };
  }
  function move(e) { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 12) cancelHold(); }
  // a long press shouldn't also open / collapse the card it was on
  function swallowClick() {
    const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, true), 400);
  }
  function cancelHold() { if (!hold) return; clearTimeout(hold.timer); hold.el.classList.remove('tts-ready'); hold = null; }
  function up(e) {
    if (!hold) return;
    const h = hold; cancelHold();
    if (h.ready || Date.now() - h.t >= HOLD_MS) { e.preventDefault(); swallowClick(); h.read(); }
  }
  X.on('init', () => {
    if (!TTS) return;
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', (e) => { // iOS cancels the pointer when it shows the text loupe; still read it
      if (hold && hold.ready) { const h = hold; cancelHold(); swallowClick(); h.read(); } else cancelHold();
    }, true);
    document.addEventListener('contextmenu', (e) => { if (hold || (e.target.closest && e.target.closest('.tts-ready'))) e.preventDefault(); }, true);
    if (TTS.getVoices().length === 0 && 'onvoiceschanged' in TTS) TTS.onvoiceschanged = () => {};
  });
  function renderTtsSetting() {
    const after = document.getElementById('setVoice'); if (!after || document.getElementById('setTts')) return;
    const lab = document.createElement('div'); lab.className = 'tts-set';
    lab.innerHTML = TTS ? `<label class="check"><input type="checkbox" id="setTts" ${ttsOn() ? 'checked' : ''}> 🔊 Read aloud: press and hold any box to hear what’s in it</label>
      <label class="field tts-rate"><span>Reading speed</span><select id="setTtsRate">${[[0.8, 'Slower'], [1, 'Normal'], [1.2, 'Faster']].map(([v, t]) => `<option value="${v}" ${rate() === v ? 'selected' : ''}>${t}</option>`).join('')}</select><button type="button" class="btn btn-sm" id="btnTtsTest">▶ Try it</button></label>`
      : '<p class="muted small">🔊 Read aloud isn’t available in this browser.</p>';
    after.closest('label').insertAdjacentElement('afterend', lab);
    if (!TTS) return;
    lab.querySelector('#setTts').addEventListener('change', (e) => { try { localStorage.setItem(TKEY, e.target.checked ? 'on' : 'off'); } catch (_) { /* ignore */ } });
    lab.querySelector('#setTtsRate').addEventListener('change', (e) => { try { localStorage.setItem(RKEY, e.target.value); } catch (_) { /* ignore */ } });
    lab.querySelector('#btnTtsTest').addEventListener('click', (e) => speak('Hi! This is how Thriftaholics reads a box out loud. Press and hold any box to hear it.', e.target));
  }
  X.on('view', (v) => { if (v === 'settings') setTimeout(renderTtsSetting, 10); });
})();
