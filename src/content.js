// Label Studio AWP auto-fill content script.
// Assumes src/rules.js is loaded first (manifest order).

(() => {
  const LOG_PREFIX = '[LS-AutoFill]';
  const log = (...a) => console.log(LOG_PREFIX, ...a);

  const SETTINGS_KEYS = { enabled: 'enabled', autoSubmit: 'autoSubmit' };
  const DEFAULTS = { enabled: true, autoSubmit: false };

  // ---------- data loading ----------
  let catalogPromise = null;
  function loadCatalog() {
    if (!catalogPromise) {
      const url = chrome.runtime.getURL('data/relevancia.json');
      catalogPromise = fetch(url)
        .then((r) => r.json())
        .then((j) => j.documents)
        .catch((e) => {
          log('failed to load catalog', e);
          return {};
        });
    }
    return catalogPromise;
  }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (v) => resolve({ ...DEFAULTS, ...v }));
    });
  }

  // ---------- DOM helpers ----------
  function getPdfFilename() {
    // Looks for "Fuente: <name>.pdf" anywhere on the page.
    const root = document.body;
    if (!root) return null;
    const match = root.innerText.match(/Fuente:\s*([^\s(][^\n(]*\.pdf)/i);
    return match ? match[1].trim() : null;
  }

  function getPdfBodyText() {
    // The classification panel sits in a div with class "classification".
    // Everything outside of it on the labeling view is treated as PDF body.
    const classification = document.querySelector('.classification');
    if (!classification) return document.body.innerText || '';
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('.classification').forEach((n) => n.remove());
    return clone.innerText || '';
  }

  function getTaskId() {
    // Bottom-left shows "#2387 \n 63 of 100". Grab the first #<digits>.
    const txt = document.body.innerText || '';
    const m = txt.match(/#(\d+)\s+\d+\s+of\s+\d+/);
    return m ? m[1] : null;
  }

  function findCheckbox(name) {
    return document.querySelector(
      `input.ant-checkbox-input[name="${CSS.escape(name)}"]`,
    );
  }

  function setCheckbox(name, shouldBeChecked) {
    const input = findCheckbox(name);
    if (!input) return false;
    if (input.checked !== shouldBeChecked) input.click();
    return true;
  }

  function findSubmitButton() {
    // The Submit button in Label Studio has visible text "Submit".
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      const t = (b.textContent || '').trim();
      if (t === 'Submit') return b;
    }
    return null;
  }

  // ---------- main fill action ----------
  const RELEVANCIA_NAMES = ['Alta', 'Media', 'Baja', 'No relevante'];
  const APLICABILIDAD_NAMES = ['Práctico', 'Teórico', 'No aplica'];

  async function fillCurrentTask({ trigger } = { trigger: 'auto' }) {
    const settings = await getSettings();
    if (!settings.enabled && trigger === 'auto') return { skipped: 'disabled' };

    const filename = getPdfFilename();
    if (!filename) return { skipped: 'no-pdf-name' };

    const catalog = await loadCatalog();
    const entry = catalog[filename];
    if (!entry) {
      log('documento no encontrado en el catálogo:', filename);
      return { skipped: 'not-in-catalog', filename };
    }

    const pdfText = getPdfBodyText();
    const desired = window.LSRules.computeDesiredState({
      relevancia: entry.relevancia,
      aplicabilidad: entry.aplicabilidad,
      pdfText,
    });

    // Clear the unwanted ones first, then set the desired ones.
    for (const n of RELEVANCIA_NAMES) setCheckbox(n, n === desired.relevancia);
    for (const n of APLICABILIDAD_NAMES)
      setCheckbox(n, n === desired.aplicabilidad);
    for (const n of window.LSRules.AWP_CATEGORIES)
      setCheckbox(n, desired.awp.includes(n));

    log('rellenado', filename, desired);

    if (settings.autoSubmit && trigger === 'auto') {
      setTimeout(() => {
        const btn = findSubmitButton();
        if (btn) btn.click();
      }, 600);
    }

    return { filled: true, filename, desired };
  }

  // ---------- task change observer ----------
  let lastTaskId = null;
  let pending = false;

  function maybeRunOnTaskChange() {
    const id = getTaskId();
    if (!id || id === lastTaskId) return;
    lastTaskId = id;
    if (pending) return;
    pending = true;
    // Wait a tick for the form to finish mounting.
    setTimeout(() => {
      pending = false;
      fillCurrentTask({ trigger: 'auto' }).catch((e) => log('error', e));
    }, 250);
  }

  const observer = new MutationObserver(() => maybeRunOnTaskChange());
  observer.observe(document.body, { childList: true, subtree: true });
  maybeRunOnTaskChange();

  // ---------- popup messaging ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'fill-now') {
      fillCurrentTask({ trigger: 'manual' }).then(sendResponse);
      return true; // async
    }
    if (msg && msg.type === 'status') {
      sendResponse({
        filename: getPdfFilename(),
        taskId: getTaskId(),
      });
      return false;
    }
  });

  log('content script cargado');
})();
