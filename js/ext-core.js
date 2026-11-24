/* =========================================================
   Add-on registry: lets the ext-*.js modules plug into the app.
   The app calls Ext.<hook>(…); each module registers with Ext.on().
   ========================================================= */
(function (global) {
  'use strict';
  const hooks = {};
  const Ext = {
    on(name, fn) { (hooks[name] ||= []).push(fn); },
    run(name, ...a) { (hooks[name] || []).forEach((f) => { try { f(...a); } catch (e) { console.error('ext ' + name, e); } }); },
    html(name, ...a) { return (hooks[name] || []).map((f) => { try { return f(...a) || ''; } catch (e) { console.error('ext ' + name, e); return ''; } }).join(''); },
    init() { Ext.run('init'); },
    afterCommit(...a) { Ext.run('commit', ...a); },
    afterDashboard() { Ext.run('dashboard'); },
    actionsTop() { return Ext.html('actionsTop'); },
    sheetTop(it) { return Ext.html('sheetTop', it); },
    sheetBottom(it) { return Ext.html('sheetBottom', it); },
    sheetAction(go, it) { for (const f of hooks.sheetAction || []) { try { if (f(go, it)) return true; } catch (e) { console.error(e); } } return false; },
    /* tiny helpers shared by the modules */
    $: (s, r = document) => r.querySelector(s),
    $$: (s, r = document) => [...r.querySelectorAll(s)],
    esc: (s) => U.esc(s),
    money: (v) => U.money(v),
    pickFiles(accept = 'image/*', multiple = true, capture = false) {
      return new Promise((res) => {
        const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; if (capture) i.capture = 'environment';
        i.onchange = () => res([...(i.files || [])]); i.click();
      });
    }
  };
  global.Ext = Ext;
})(window);
