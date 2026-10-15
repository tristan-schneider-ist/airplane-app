/* Single-notebook lock-down for JupyterLite (Notebook 7 UI).
 * - only the notebook named in window.__LOCKED_NOTEBOOK__ can be shown
 * - menus/toolbars hidden (lockdown.css), replaced by a minimal bar
 * - kernel started automatically, notebook optionally run on load
 */
(function () {
  const NB = window.__LOCKED_NOTEBOOK__;
  const AUTORUN = window.__AUTORUN__ !== false;
  const q = new URLSearchParams(location.search);
  if (q.get('path') !== NB) { location.replace('?path=' + encodeURIComponent(NB)); return; }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 60000) => {
    const t0 = Date.now();
    for (;;) { try { const v = fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > ms) return null; await sleep(100); }
  };

  const bar = document.createElement('div');
  bar.id = 'lockbar';
  bar.innerHTML = '<span class="t"></span><span class="s" id="lockstatus">loading…</span>' +
    '<button id="lbRun" disabled>▶ Run all</button>' +
    '<button id="lbRestart" class="sec" disabled>↻ Restart &amp; run all</button>' +
    '<button id="lbReset" class="sec" title="Discard your edits and restore the original notebook">⟲ Reset notebook</button>';
  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(bar); bar.querySelector('.t').textContent = window.__TITLE__; });
  const status = s => { const e = document.getElementById('lockstatus'); if (e) e.textContent = s; };

  // block everything that navigates away from this notebook
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && !a.href.startsWith('javascript:') && !a.target && new URL(a.href, location.href).origin === location.origin
        && !a.href.includes('#')) e.preventDefault();
  }, true);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['o', 'p'].includes(e.key.toLowerCase())) e.preventDefault();
  }, true);

  async function runAll(restart) {
    const app = window.jupyterapp, w = app.shell.currentWidget, sc = w.sessionContext;
    if (restart) await sc.restartKernel();
    await app.commands.execute('notebook:run-all-cells');
  }

  async function main() {
    const app = await until(() => window.jupyterapp && window.jupyterapp.shell.currentWidget && window.jupyterapp);
    if (!app) return status('failed to start');
    // The browser keeps its own copy of the notebook; if the site ships a different notebook, drop the stale copy.
    const KEY = 'lockdown:notebook-version:' + NB, VER = window.__NB_VERSION__;
    let stored = null; try { stored = localStorage.getItem(KEY); } catch (e) {}
    if (VER && stored !== VER) {
      let saved = false;
      try { localStorage.setItem(KEY, VER); saved = localStorage.getItem(KEY) === VER; } catch (e) {}
      if (saved) {                       // (without working localStorage we would reload forever)
        status('updating notebook…');
        try { await app.serviceManager.contents.delete(NB); } catch (e) {}
        location.reload(); return;
      }
    }
    const w = app.shell.currentWidget, sc = w.sessionContext;
    await w.revealed; await sleep(300);
    // the kernel-picker dialog can appear before kernelspecs are known: dismiss it and start Python ourselves
    const dlg = document.querySelector('.jp-Dialog .jp-mod-reject'); if (dlg) dlg.click();
    await sc.ready.catch(() => {});
    if (!sc.session || !sc.session.kernel) await sc.changeKernel({ name: 'python' });
    const run = document.getElementById('lbRun'), rs = document.getElementById('lbRestart');
    run.disabled = rs.disabled = false; status('ready');
    const wrap = restart => async () => {
      run.disabled = rs.disabled = true; status('running…');
      try { await runAll(restart); status('done'); } catch (e) { status('error – see output'); }
      run.disabled = rs.disabled = false;
    };
    run.onclick = wrap(false); rs.onclick = wrap(true);
    if (AUTORUN) wrap(false)();
  }
  main();

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('lbReset').onclick = async () => {
      if (!confirm('Discard all your changes to this notebook and restore the original?')) return;
      const app = window.jupyterapp;
      try { await app.serviceManager.contents.delete(NB); } catch (e) {}
      location.reload();
    };
  });
})();
