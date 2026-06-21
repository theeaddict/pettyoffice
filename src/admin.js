import { Chart, registerables } from 'chart.js';
import { checkMilestones } from './milestones.js';
Chart.register(...registerables);

const TOOL_LABELS = {
  sue_brain: 'Sue Brain',
  invoice_ex: 'Invoice Ex',
  breakup_habit: 'Break Up Habit',
  cosmic: 'Universe Contract',
};

const TOOL_ICONS = {
  sue_brain: '⚖️',
  invoice_ex: '💸',
  breakup_habit: '💼',
  cosmic: '📡',
};

const CHART_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

let charts = {};
let adminToken = null;

// ─── Auth ──────────────────────────────────────────────────────

export function initAdmin() {
  adminToken = sessionStorage.getItem('pettyoffice_admin_token');
  if (!adminToken) {
    showLoginView();
    return;
  }
  bootDashboard();
}

function showLoginView() {
  const loginView = document.getElementById('login-view');
  const dashboard = document.getElementById('admin-dashboard');
  const usernameInput = document.getElementById('username-input');
  const input = document.getElementById('password-input');
  const submit = document.getElementById('password-submit');
  const errorEl = document.getElementById('login-error');
  
  loginView.classList.remove('hidden');
  dashboard.classList.add('hidden');
  usernameInput.focus();
  usernameInput.value = '';
  input.value = '';
  errorEl.classList.add('hidden');

  async function check() {
    if (!usernameInput.value || !input.value) return;
    
    submit.disabled = true;
    submit.innerHTML = `<span>Unlocking...</span>`;
    errorEl.classList.add('hidden');
    
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput.value, password: input.value }),
      });
      let json;
      try {
        json = await res.json();
      } catch (parseErr) {
        throw new Error(`Server returned ${res.status}`);
      }
      if (!res.ok || !json.token) {
        throw new Error(json.error || 'Invalid credentials');
      }
      adminToken = json.token;
      sessionStorage.setItem('pettyoffice_admin_token', adminToken);
      loginView.classList.add('hidden');
      bootDashboard();
    } catch (err) {
      sessionStorage.removeItem('pettyoffice_admin_token');
      errorEl.textContent = 'Access denied: ' + err.message;
      errorEl.classList.remove('hidden');
      input.value = '';
      input.focus();
      
      // Reset button
      submit.disabled = false;
      submit.innerHTML = `<span>Unlock Dashboard</span><span class="font-mono tracking-normal">→</span>`;
    }
  }
  
  submit.addEventListener('click', check);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.focus(); });
}

function bootDashboard() {
  document.getElementById('login-view')?.classList.add('hidden');
  document.getElementById('admin-dashboard').classList.remove('hidden');
  document.getElementById('btn-logout')?.addEventListener('click', logout);
  initPasswordModal();
  refreshDashboard();
  initFormsCRUD();
  setInterval(refreshDashboard, 30000);
}

// ─── API helpers ───────────────────────────────────────────────

async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${adminToken || ''}`,
    },
  });
  if (res.status === 401) {
    sessionStorage.removeItem('pettyoffice_admin_token');
    adminToken = null;
    showLoginView();
    throw new Error('Session expired');
  }
  return res;
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    throw new Error(`Server returned ${res.status} with no JSON body`);
  }
}

async function fetchStats() {
  const res = await authFetch('/api/stats');
  const json = await parseJson(res);
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load stats');
  return json;
}

// ─── Helpers ───────────────────────────────────────────────────

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getDailyBuckets(data, days) {
  const buckets = {};
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    buckets[key] = 0;
  }
  for (const row of data) {
    const date = new Date(row.date).toISOString().split('T')[0];
    if (date in buckets) buckets[date] += row.count;
  }
  return buckets;
}

// ─── Dashboard Refresh ─────────────────────────────────────────

async function refreshDashboard() {
  const updateEl = document.getElementById('admin-update-time');
  try {
    const stats = await fetchStats();

    animateStat('stat-total', stats.total);
    animateStat('stat-today', stats.today);
    animateStat('stat-week', stats.week);
    animateStat('stat-visitors', stats.visitors);

    checkMilestones(stats.total);

    renderBarChart(stats.toolCounts);
    renderLineChart(stats.dailyTrend || []);
    renderPieChart(stats.devices);
    renderCountriesTable(stats.topCountries || [], stats.total);
    renderActivityFeed(stats);

    updateEl.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error('Admin dashboard refresh failed:', err);
    updateEl.textContent = 'Update failed';
  }
}

function animateStat(id, target) {
  const el = document.getElementById(id);
  const currentText = el.textContent.replace(/[,\s]/g, '');
  const current = parseInt(currentText, 10) || 0;
  if (current === target) {
    if (el.textContent === '—') el.textContent = target.toLocaleString();
    return;
  }
  const startTime = performance.now();
  const duration = 800;
  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const val = Math.floor(current + (target - current) * eased);
    el.textContent = val.toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── Charts ────────────────────────────────────────────────────

function renderBarChart(toolMap) {
  const ctx = document.getElementById('chart-bar').getContext('2d');
  if (charts.bar) charts.bar.destroy();

  const sorted = Object.entries(toolMap)
    .sort((a, b) => b[1] - a[1]);
  const sortedLabels = sorted.map(([k]) => TOOL_LABELS[k] || k);
  const sortedValues = sorted.map(([, v]) => v);
  const sortedColors = sorted.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  charts.bar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedLabels,
      datasets: [{
        label: 'Generations',
        data: sortedValues,
        backgroundColor: sortedColors.map(c => c + '80'),
        borderColor: sortedColors,
        borderWidth: 2,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { size: 9, family: 'JetBrains Mono' } },
          grid: { display: false },
        },
        y: {
          ticks: { color: '#64748b', font: { size: 9, family: 'JetBrains Mono' }, stepSize: 1 },
          grid: { color: 'rgba(51, 65, 85, 0.3)' },
          beginAtZero: true,
        },
      },
    },
  });
}

function renderLineChart(dailyTrend) {
  const ctx = document.getElementById('chart-line').getContext('2d');
  if (charts.line) charts.line.destroy();

  const buckets = getDailyBuckets(dailyTrend, 30);
  const dates = Object.keys(buckets);
  const values = Object.values(buckets);
  const shortLabels = dates.map(d => {
    const [_, m, day] = d.split('-');
    return `${m}/${day}`;
  });

  charts.line = new Chart(ctx, {
    type: 'line',
    data: {
      labels: shortLabels,
      datasets: [{
        label: 'Generations',
        data: values,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointBackgroundColor: '#10b981',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { size: 8, family: 'JetBrains Mono' }, maxTicksLimit: 10 },
          grid: { display: false },
        },
        y: {
          ticks: { color: '#64748b', font: { size: 9, family: 'JetBrains Mono' }, stepSize: 1 },
          grid: { color: 'rgba(51, 65, 85, 0.3)' },
          beginAtZero: true,
        },
      },
    },
  });
}

function renderPieChart(devices) {
  const ctx = document.getElementById('chart-pie').getContext('2d');
  if (charts.pie) charts.pie.destroy();

  const mobile = devices?.mobile || 0;
  const desktop = devices?.desktop || 0;

  charts.pie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Mobile 📱', 'Desktop 💻'],
      datasets: [{
        data: [mobile, desktop],
        backgroundColor: ['#6366f1', '#10b981'],
        borderColor: ['#4f46e5', '#059669'],
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', font: { size: 9, family: 'JetBrains Mono' }, padding: 12 },
        },
      },
    },
  });
}

// ─── Countries Table ───────────────────────────────────────────

function renderCountriesTable(topCountries, total) {
  const tbody = document.getElementById('countries-tbody');
  const sorted = topCountries || [];

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-slate-600 text-[10px] font-mono py-4">No data yet</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map(({ country, count }, i) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    const barWidth = Math.max((count / (sorted[0].count || 1)) * 100, 5);
    return `<tr>
      <td>
        <span class="text-slate-200 text-[11px]">${country}</span>
      </td>
      <td class="text-right text-slate-300 font-mono">${count.toLocaleString()}</td>
      <td class="text-right">
        <span class="text-[10px] font-mono text-emerald-400">${pct}%</span>
        <div class="w-full h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
          <div class="h-full bg-emerald-500/50 rounded-full" style="width:${barWidth}%"></div>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── Activity Feed ─────────────────────────────────────────────

function renderActivityFeed(stats) {
  const feed = document.getElementById('activity-feed');
  if (!stats || !stats.toolCounts) {
    feed.innerHTML = '<div class="text-center text-slate-600 text-[10px] font-mono py-4">No activity data</div>';
    return;
  }
  // Build a synthetic recent activity list from tool counts (since we no longer expose raw rows)
  const rows = Object.entries(stats.toolCounts).map(([tool, count]) => ({
    tool,
    count,
    created_at: new Date().toISOString(),
  })).sort((a, b) => b.count - a.count).slice(0, 20);

  if (rows.length === 0) {
    feed.innerHTML = '<div class="text-center text-slate-600 text-[10px] font-mono py-4">No activity yet</div>';
    return;
  }
  feed.innerHTML = rows.map(r => {
    const icon = TOOL_ICONS[r.tool] || '📄';
    const label = TOOL_LABELS[r.tool] || r.tool;
    const ago = timeAgo(r.created_at);

    let pillClass = 'pill-emerald';
    if (r.tool === 'sue_brain') pillClass = 'pill-emerald';
    else if (r.tool === 'invoice_ex') pillClass = 'pill-amber';
    else if (r.tool === 'breakup_habit') pillClass = 'pill-rose';
    else if (r.tool === 'cosmic') pillClass = 'pill-indigo';

    return `<div class="activity-fade flex items-center justify-between py-1.5 px-2 rounded-lg bg-slate-800/20">
      <div class="flex items-center space-x-2 min-w-0">
        <span class="text-sm shrink-0">${icon}</span>
        <span class="text-[11px] text-slate-300 font-medium truncate">${label}</span>
      </div>
      <div class="flex items-center space-x-2 shrink-0">
        <span class="text-[9px] font-mono text-slate-500">${r.count.toLocaleString()} total</span>
        <span class="text-[9px] font-mono text-slate-600">${ago}</span>
      </div>
    </div>`;
  }).join('');
}

// ─── Forms Metadata CRUD ────────────────────────────────────────────

async function adminApi(method, body) {
  const res = await authFetch('/api/admin/forms', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await parseJson(res);
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function loadFormsTable() {
  const tbody = document.getElementById('forms-tbody');
  const status = document.getElementById('forms-status');
  try {
    const json = await adminApi('GET');
    const rows = json.data || [];
    status.textContent = `${rows.length} options`;
    status.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-semibold font-mono bg-emerald-500/10 text-emerald-400';

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-600 text-[10px] font-mono py-4">No forms metadata yet. Create one above.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr data-id="${r.id}">
        <td class="text-slate-500 font-mono text-[10px]">${r.id}</td>
        <td><span class="text-[10px] font-mono text-indigo-400">${r.module_type}</span></td>
        <td class="text-slate-200 font-medium text-[11px] max-w-[200px] truncate">${r.category_name}</td>
        <td class="text-lg text-center">${r.emoji_or_icon}</td>
        <td class="text-slate-400 text-[10px] max-w-[220px] truncate">${r.description_text || '—'}</td>
        <td class="text-center">
          <button class="toggle-active text-[10px] font-mono px-2 py-0.5 rounded-full border transition ${r.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}" data-id="${r.id}" data-active="${r.is_active}">
            ${r.is_active ? 'ON' : 'OFF'}
          </button>
        </td>
        <td class="text-slate-400 font-mono text-[10px] text-center">${r.display_order ?? 0}</td>
        <td class="text-center">
          <div class="flex items-center justify-center space-x-1">
            <button class="btn-edit-form text-[9px] font-mono text-slate-500 hover:text-slate-300 bg-slate-800/40 hover:bg-slate-800 px-2 py-1 rounded border border-slate-800 transition" data-id="${r.id}">✎</button>
            <button class="btn-delete-form text-[9px] font-mono text-rose-500 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded border border-rose-500/20 transition" data-id="${r.id}">⬤ WIPE</button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.toggle-active').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const current = btn.dataset.active === 'true';
        try {
          await adminApi('PUT', { id, is_active: !current });
          loadFormsTable();
        } catch (err) {
          alert('Failed to toggle: ' + err.message);
        }
      });
    });

    tbody.querySelectorAll('.btn-edit-form').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr');
        const id = parseInt(btn.dataset.id);
        const title = row.querySelector('td:nth-child(3)').textContent;
        const desc = row.querySelector('td:nth-child(5)').textContent;
        const newTitle = prompt('Edit title:', title);
        if (newTitle && newTitle !== title) {
          adminApi('PUT', { id, category_name: newTitle }).then(loadFormsTable).catch(err => alert('Update failed: ' + err.message));
        }
        const newDesc = prompt('Edit description:', desc);
        if (newDesc && newDesc !== desc) {
          adminApi('PUT', { id, description_text: newDesc }).then(loadFormsTable).catch(err => alert('Update failed: ' + err.message));
        }
      });
    });

    tbody.querySelectorAll('.btn-delete-form').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        if (!confirm('Are you sure you want to permanently delete option #' + id + '? This cannot be undone.')) return;
        try {
          await adminApi('DELETE', { id });
          loadFormsTable();
        } catch (err) {
          alert('Delete failed: ' + err.message);
        }
      });
    });

  } catch (err) {
    status.textContent = 'Offline';
    status.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-semibold font-mono bg-rose-500/10 text-rose-400';
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-rose-400 text-[10px] font-mono py-4">Failed to load: ${err.message}</td></tr>`;
  }
}

// ─── Logout ─────────────────────────────────────────────────────

function logout() {
  sessionStorage.removeItem('pettyoffice_admin_token');
  adminToken = null;
  showLoginView();
}

// ─── Change Password ────────────────────────────────────────────

function initPasswordModal() {
  const modal = document.getElementById('password-modal');
  const btnOpen = document.getElementById('btn-change-password');
  const btnClose = document.getElementById('btn-close-password-modal');
  const btnSubmit = document.getElementById('btn-pw-submit');
  const inputCurrent = document.getElementById('pw-current');
  const inputNew = document.getElementById('pw-new');
  const inputConfirm = document.getElementById('pw-confirm');
  const errorEl = document.getElementById('password-modal-error');
  const successEl = document.getElementById('password-modal-success');

  function showError(msg) {
    successEl.classList.add('hidden');
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function showSuccess(msg) {
    errorEl.classList.add('hidden');
    successEl.textContent = msg;
    successEl.classList.remove('hidden');
  }

  function hideAll() {
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');
  }

  function openModal() {
    inputCurrent.value = '';
    inputNew.value = '';
    inputConfirm.value = '';
    hideAll();
    modal.classList.remove('hidden');
    inputCurrent.focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  btnOpen.addEventListener('click', openModal);
  btnClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  btnSubmit.addEventListener('click', async () => {
    const current = inputCurrent.value;
    const newPw = inputNew.value;
    const confirm = inputConfirm.value;

    if (!current || !newPw || !confirm) {
      showError('All fields are required');
      return;
    }

    if (newPw !== confirm) {
      showError('New passwords do not match');
      return;
    }

    if (newPw.length < 6) {
      showError('New password must be at least 6 characters');
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Updating...';
    hideAll();

    try {
      const res = await authFetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      });
      const json = await parseJson(res);
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Change failed');
      }
      showSuccess('Password changed successfully!');
      inputCurrent.value = '';
      inputNew.value = '';
      inputConfirm.value = '';
    } catch (err) {
      showError(err.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Update Password';
    }
  });
}

function initFormsCRUD() {
  loadFormsTable();
  document.getElementById('btn-refresh-forms').addEventListener('click', loadFormsTable);
  document.getElementById('btn-create-form').addEventListener('click', async () => {
    const module_type = document.getElementById('form-module-type').value;
    const category_name = document.getElementById('form-category-name').value.trim();
    const emoji_or_icon = document.getElementById('form-emoji').value.trim();
    const description_text = document.getElementById('form-description').value.trim();
    const display_order = parseInt(document.getElementById('form-display-order').value, 10) || 0;

    if (!category_name || !description_text) {
      alert('Title and Description are required');
      return;
    }

    try {
      const btn = document.getElementById('btn-create-form');
      btn.disabled = true;
      btn.textContent = '⬤ Injecting...';
      await adminApi('POST', { module_type, category_name, emoji_or_icon, description_text, display_order });
      document.getElementById('form-category-name').value = '';
      document.getElementById('form-emoji').value = '📋';
      document.getElementById('form-description').value = '';
      document.getElementById('form-display-order').value = '0';
      loadFormsTable();
      btn.disabled = false;
      btn.innerHTML = '<span>⬤</span><span>Inject Into Database</span>';
    } catch (err) {
      alert('Create failed: ' + err.message);
      document.getElementById('btn-create-form').disabled = false;
      document.getElementById('btn-create-form').innerHTML = '<span>⬤</span><span>Inject Into Database</span>';
    }
  });
}
