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
    const root = document.body;
    if (!root) return null;
    // Capture everything after "Fuente:" up to and including ".pdf".
    const match = root.innerText.match(/Fuente:\s*([^\n]+?\.pdf)/i);
    if (!match) return null;
    const raw = match[1].trim();
    // Strip URL/path prefix (e.g. gs://bucket/path/file.pdf → file.pdf).
    const slash = raw.lastIndexOf('/');
    return slash >= 0 ? raw.slice(slash + 1) : raw;
  }

  function getImageFilename() {
    const txt = document.body?.innerText || '';
    const match = txt.match(/Archivo:\s*([^\n]+?\.(?:png|jpg|jpeg|webp))/i);
    if (!match) return null;
    const raw = match[1].trim();
    const slash = raw.lastIndexOf('/');
    return slash >= 0 ? raw.slice(slash + 1) : raw;
  }

  // CII-166-4_2017__p64_2.png → CII-166-4_2017.pdf
  function imageFilenameToDocname(imgName) {
    return imgName.replace(/__p\d+_\d+\.(png|jpg|jpeg|webp)$/i, '.pdf');
  }

  function getDocFilename() {
    const pdf = getPdfFilename();
    if (pdf) return pdf;
    const img = getImageFilename();
    if (img) return imageFilenameToDocname(img);
    return null;
  }

  function getPdfBodyText() {
    // Label Studio renders the PDF body inside .lsf-htx-richtext as a sequence
    // of <span class="lsf-richtext__line"> elements. Join them with spaces so
    // codes split across line breaks (CWA\nP) don't accidentally concatenate.
    const container = document.querySelector('.lsf-htx-richtext');
    if (container) {
      const lines = container.querySelectorAll('.lsf-richtext__line');
      if (lines.length) {
        return [...lines].map((n) => n.textContent || '').join(' ');
      }
      return container.innerText || '';
    }
    // Fallback: strip the classification panel and read the rest.
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

  function getTaskProgress() {
    const txt = document.body.innerText || '';
    // Try several formats Label Studio may use for the task counter.
    const patterns = [
      /#\d+\s+(\d+)\s+of\s+(\d+)/,   // #2387 63 of 100
      /(\d+)\s+of\s+(\d+)/,           // 63 of 100
      /(\d+)\s*\/\s*(\d+)/,           // 63/100
      /(\d+)\s+de\s+(\d+)/,           // 63 de 100 (Spanish)
    ];
    for (const re of patterns) {
      const m = txt.match(re);
      if (m) return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
    }
    log('progreso no detectado — fragmento de texto:', txt.slice(0, 300));
    return null;
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

  function findSkipButton() {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').trim() === 'Skip') return b;
    }
    return null;
  }

  function findSubmitButton() {
    const span = document.querySelector(
      'span.inline-flex.flex-1.whitespace-pre.items-center.px-tight',
    );
    if (span && span.textContent.trim() === 'Submit') {
      const btn = span.closest('button');
      if (btn) return btn;
    }
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').trim() === 'Submit') return b;
    }
    return null;
  }

  // Waits until the Submit button exists AND is not disabled (Label Studio
  // disables it while auto-saving the draft after checkbox changes).
  function waitForSubmitReady(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function poll() {
        const btn = findSubmitButton();
        if (btn && !btn.disabled) return resolve(btn);
        if (Date.now() - start > timeout) return reject(new Error('submit-timeout'));
        setTimeout(poll, 100);
      })();
    });
  }

  // ---------- main fill action ----------
  const RELEVANCIA_NAMES = ['Alta', 'Media', 'Baja', 'No relevante'];
  const APLICABILIDAD_NAMES = ['Práctico', 'Teórico', 'No aplica'];

  async function fillCurrentTask({ trigger } = { trigger: 'auto' }) {
    const settings = await getSettings();
    if (!settings.enabled && trigger === 'auto') return { skipped: 'disabled' };

    const filename = getDocFilename();
    if (!filename) return { skipped: 'no-filename' };

    const catalog = await loadCatalog();
    const entry = catalog[filename];
    if (!entry) {
      log('documento no encontrado en el catálogo, saltando:', filename);
      const skipBtn = findSkipButton();
      if (skipBtn && !skipBtn.disabled) skipBtn.click();
      return { skipped: 'not-in-catalog', filename };
    }

    const desired = window.LSRules.computeDesiredState({
      relevancia: entry.relevancia,
      aplicabilidad: entry.aplicabilidad,
      awp: entry.awp || [],
    });

    // Clear the unwanted ones first, then set the desired ones.
    for (const n of RELEVANCIA_NAMES) setCheckbox(n, n === desired.relevancia);
    for (const n of APLICABILIDAD_NAMES)
      setCheckbox(n, n === desired.aplicabilidad);
    for (const n of window.LSRules.AWP_CATEGORIES)
      setCheckbox(n, desired.awp.includes(n));

    log('rellenado', filename, desired);

    if (settings.autoSubmit) {
      waitForSubmitReady()
        .then((btn) => {
          if (taskStartTime) {
            const dur = Date.now() - taskStartTime;
            recentDurations.push(dur);
            if (recentDurations.length > 5) recentDurations.shift();
            taskStartTime = null;
          }
          submitCooldown = true;
          btn.click();
          setTimeout(() => { submitCooldown = false; }, 3000);
        })
        .catch(() => log('submit button no disponible'));
    }

    return { filled: true, filename, desired };
  }

  // ---------- task change observer ----------
  // Label Studio recreates checkbox DOM nodes for each new task, even when the
  // URL and filename stay the same. Tracking the node reference reliably
  // detects a new task regardless of URL or PDF name.
  let lastFormNode = null;
  let fillPending = false;
  let submitCooldown = false;
  let taskStartTime = null;
  const recentDurations = []; // rolling window of last 5 task durations (ms)

  function waitForForm(timeout = 8000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function poll() {
        const node = findCheckbox('Alta');
        if (node) return resolve(node);
        if (Date.now() - start > timeout) return reject(new Error('form-timeout'));
        setTimeout(poll, 100);
      })();
    });
  }

  function maybeAutoFill() {
    if (fillPending || submitCooldown) return;
    const filename = getDocFilename();
    if (!filename) return;
    const node = findCheckbox('Alta');
    // Same DOM node = same task already filled, skip.
    if (!node || node === lastFormNode) return;
    taskStartTime = Date.now();
    fillPending = true;
    log('nueva tarea detectada:', filename);
    waitForForm()
      .then((n) => {
        lastFormNode = n;
        return fillCurrentTask({ trigger: 'auto' });
      })
      .then((r) => {
        if (r && r.filled) {
          // Increment the manual task counter stored in chrome.storage.
          chrome.storage.sync.get({ currentTask: 1 }, (s) => {
            chrome.storage.sync.set({ currentTask: s.currentTask + 1 });
          });
        }
      })
      .catch((e) => log('error en autofill:', e))
      .finally(() => { fillPending = false; });
  }

  setInterval(maybeAutoFill, 500);
  maybeAutoFill();

  // ---------- popup messaging ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'fill-now') {
      fillCurrentTask({ trigger: 'manual' })
        .then((r) => {
          if (r && r.filled) lastFormNode = findCheckbox('Alta');
          sendResponse(r);
        })
        .catch((e) => {
          log('error en fill-now:', e);
          sendResponse({ skipped: 'error', message: e.message });
        });
      return true; // async
    }
    if (msg && msg.type === 'status') {
      const avgMs = recentDurations.length
        ? Math.round(recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length)
        : null;
      chrome.storage.sync.get({ currentTask: 1, totalTasks: 684 }, (s) => {
        sendResponse({
          filename: getDocFilename(),
          taskId: getTaskId(),
          currentTask: s.currentTask,
          totalTasks: s.totalTasks,
          avgMs,
        });
      });
      return true; // async
    }
  });

  log('content script cargado');
})();
