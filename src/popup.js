const DEFAULTS = { enabled: true, autoSubmit: false };

const enabledEl = document.getElementById('enabled');
const autoSubmitEl = document.getElementById('autoSubmit');
const fillBtn = document.getElementById('fill-now');
const statusEl = document.getElementById('status');

chrome.storage.sync.get(DEFAULTS, (s) => {
  enabledEl.checked = s.enabled;
  autoSubmitEl.checked = s.autoSubmit;
});

enabledEl.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledEl.checked });
});
autoSubmitEl.addEventListener('change', () => {
  chrome.storage.sync.set({ autoSubmit: autoSubmitEl.checked });
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshStatus() {
  const tab = await activeTab();
  if (!tab || !tab.id) {
    statusEl.textContent = 'No hay pestaña activa.';
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'status' }, (res) => {
    if (chrome.runtime.lastError || !res) {
      statusEl.textContent =
        'No se detectó Label Studio en esta pestaña. Abrí una tarea de etiquetado.';
      return;
    }
    const { filename, taskId } = res;
    statusEl.innerHTML = `
      <div>Tarea: <strong>${taskId ? '#' + taskId : '—'}</strong></div>
      <div>PDF: <strong>${filename || '—'}</strong></div>
    `;
  });
}

fillBtn.addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab || !tab.id) return;
  fillBtn.disabled = true;
  chrome.tabs.sendMessage(tab.id, { type: 'fill-now' }, (res) => {
    fillBtn.disabled = false;
    if (chrome.runtime.lastError || !res) {
      statusEl.innerHTML = '<span class="miss">No se pudo contactar la página.</span>';
      return;
    }
    if (res.filled) {
      statusEl.innerHTML = `<span class="ok">✓ Rellenado: ${res.filename}</span>`;
    } else if (res.skipped === 'not-in-catalog') {
      statusEl.innerHTML = `<span class="miss">✗ "${res.filename}" no está en el catálogo.</span>`;
    } else if (res.skipped === 'no-pdf-name') {
      statusEl.innerHTML =
        '<span class="miss">No se pudo detectar el nombre del PDF.</span>';
    } else {
      statusEl.textContent = JSON.stringify(res);
    }
  });
});

refreshStatus();
