function formatTime(ms) {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const DEFAULTS = { enabled: true, autoSubmit: false, currentTask: 1, totalTasks: 684 };

const enabledEl = document.getElementById('enabled');
const autoSubmitEl = document.getElementById('autoSubmit');
const fillBtn = document.getElementById('fill-now');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');
const currentTaskEl = document.getElementById('currentTask');
const totalTasksEl = document.getElementById('totalTasks');

chrome.storage.sync.get(DEFAULTS, (s) => {
  enabledEl.checked = s.enabled;
  autoSubmitEl.checked = s.autoSubmit;
  currentTaskEl.value = s.currentTask;
  totalTasksEl.value = s.totalTasks;
});

enabledEl.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledEl.checked });
});
autoSubmitEl.addEventListener('change', () => {
  chrome.storage.sync.set({ autoSubmit: autoSubmitEl.checked });
});
currentTaskEl.addEventListener('change', () => {
  const v = parseInt(currentTaskEl.value, 10);
  if (v > 0) chrome.storage.sync.set({ currentTask: v });
});
totalTasksEl.addEventListener('change', () => {
  const v = parseInt(totalTasksEl.value, 10);
  if (v > 0) chrome.storage.sync.set({ totalTasks: v });
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
      progressEl.style.display = 'none';
      return;
    }
    const { filename, taskId, currentTask, totalTasks, avgMs } = res;
    // Keep inputs in sync with storage values updated by content script.
    if (currentTask) currentTaskEl.value = currentTask;
    if (totalTasks) totalTasksEl.value = totalTasks;
    statusEl.innerHTML = `
      <div>PDF: <strong>${filename || '—'}</strong></div>
    `;
    const cur = currentTask || parseInt(currentTaskEl.value, 10) || 1;
    const tot = totalTasks || parseInt(totalTasksEl.value, 10) || 684;
    const remaining = tot - cur + 1;
    const pct = Math.min(100, Math.round(((cur - 1) / tot) * 100));
    const estMs = avgMs ? avgMs * remaining : null;
    const estText = estMs ? ` · ~${formatTime(estMs)} restantes` : '';
    progressEl.style.display = 'block';
    progressEl.innerHTML = `
      <strong>${cur} de ${tot}</strong> — ${remaining} restantes${estText}
      <div class="progress-bar-wrap">
        <div class="progress-bar" style="width:${pct}%"></div>
      </div>
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
setInterval(refreshStatus, 3000);
