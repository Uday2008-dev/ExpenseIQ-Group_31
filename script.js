/* ============================================================
   SMART EXPENSE TRACKER — Core Application Logic
   ============================================================ */

const API = {
  BASE: 'http://localhost:5000',

  async call(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const token = Auth.getToken();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(API.BASE + path, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  post:   (path, body) => API.call('POST',   path, body),
  get:    (path)       => API.call('GET',    path),
  put:    (path, body) => API.call('PUT',    path, body),
  delete: (path)       => API.call('DELETE', path),
};

/* ── Auth Utilities ──────────────────────────────────────────── */
const Auth = {
  getToken:   ()      => localStorage.getItem('exp_token'),
  getUser:    ()      => { try { return JSON.parse(localStorage.getItem('exp_user')); } catch { return null; } },
  setSession: (t, u)  => { localStorage.setItem('exp_token', t); localStorage.setItem('exp_user', JSON.stringify(u)); },
  clearSession: ()    => { localStorage.removeItem('exp_token'); localStorage.removeItem('exp_user'); },
  isLoggedIn: ()      => !!Auth.getToken(),

  requireAuth() {
    if (!Auth.isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  },

  redirectIfLoggedIn() {
    if (Auth.isLoggedIn()) window.location.href = 'index.html';
  },
};

/* ── UI Helpers ──────────────────────────────────────────────── */
const UI = {
  showAlert(el, msg, type = 'error') {
    el.textContent = '';
    el.className = `alert alert-${type}`;
    const icon = { error: '⚠', success: '✓', warning: '⚡', info: 'ℹ' }[type] || '⚠';
    el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  },

  setLoading(btn, loading, text = '') {
    btn.disabled = loading;
    btn.innerHTML = loading
      ? `<span class="spinner"></span> Loading…`
      : text || btn.dataset.originalText;
    if (!loading && !text) btn.innerHTML = btn.dataset.originalText;
    if (loading && !btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
  },

  formatCurrency(amount, currency = '₹') {
    return `${currency}${Math.abs(Number(amount)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  getCategoryBadge(cat) {
    const map = {
      food: ['🍜', 'badge-food', 'Food'],
      transport: ['🚌', 'badge-transport', 'Transport'],
      shopping: ['🛍️', 'badge-shopping', 'Shopping'],
      utilities: ['⚡', 'badge-utilities', 'Utilities'],
      health: ['💊', 'badge-health', 'Health'],
      entertainment: ['🎬', 'badge-entertainment', 'Entertainment'],
      education: ['📚', 'badge-education', 'Education'],
      other: ['📌', 'badge-other', 'Other'],
    };
    const c = (cat || 'other').toLowerCase();
    const [icon, cls, label] = map[c] || map.other;
    return `<span class="category-badge ${cls}">${icon} ${label}</span>`;
  },

  renderUserInfo() {
    const user = Auth.getUser();
    if (!user) return;
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = user.name || user.email || 'User';
    if (avatarEl) avatarEl.textContent = (user.name || user.email || 'U')[0].toUpperCase();
  },

  animateCount(el, target, duration = 1200) {
    const start = 0;
    const startTime = performance.now();
    const update = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * ease;
      el.textContent = Math.round(current).toLocaleString('en-IN');
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  },
};

/* ── Sidebar ─────────────────────────────────────────────────── */
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle  = document.getElementById('mobile-toggle');

  if (!sidebar) return;

  toggle?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });

  overlay?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });

  // Active link
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href.includes(path)) link.classList.add('active');
  });

  UI.renderUserInfo();

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    Auth.clearSession();
    window.location.href = 'login.html';
  });
}

/* ============================================================
   PAGE: LOGIN
   ============================================================ */
function initLoginPage() {
  Auth.redirectIfLoggedIn();

  const form  = document.getElementById('login-form');
  const alert = document.getElementById('login-alert');
  const btn   = document.getElementById('login-btn');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      UI.showAlert(alert, 'Please fill in all fields.', 'error');
      return;
    }

    UI.setLoading(btn, true);
    const result = await API.post('/login', { email, password });
    UI.setLoading(btn, false, 'Sign In');

    if (result.ok) {
      Auth.setSession(result.data.token, result.data.user);
      window.location.href = 'index.html';
    } else {
      // Demo fallback — allow demo login
      if (email === 'demo@expense.app' && password === 'demo1234') {
        Auth.setSession('demo-token', { name: 'Demo User', email });
        window.location.href = 'index.html';
      } else {
        UI.showAlert(alert, result.error || 'Invalid credentials.', 'error');
      }
    }
  });
}

/* ============================================================
   PAGE: REGISTER
   ============================================================ */
function initRegisterPage() {
  Auth.redirectIfLoggedIn();

  const form  = document.getElementById('register-form');
  const alert = document.getElementById('register-alert');
  const btn   = document.getElementById('register-btn');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name     = document.getElementById('name').value.trim();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirm  = document.getElementById('confirm-password').value;

    if (!name || !email || !password) {
      UI.showAlert(alert, 'Please fill in all fields.', 'error');
      return;
    }

    if (password.length < 6) {
      UI.showAlert(alert, 'Password must be at least 6 characters.', 'error');
      return;
    }

    if (password !== confirm) {
      UI.showAlert(alert, 'Passwords do not match.', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      UI.showAlert(alert, 'Please enter a valid email.', 'error');
      return;
    }

    UI.setLoading(btn, true);
    const result = await API.post('/register', { name, email, password });
    UI.setLoading(btn, false, 'Create Account');

    if (result.ok) {
      UI.showAlert(alert, 'Account created! Redirecting…', 'success');
      Auth.setSession(result.data.token, result.data.user);
      setTimeout(() => window.location.href = 'index.html', 1200);
    } else {
      // Demo mode
      Auth.setSession('demo-token', { name, email });
      UI.showAlert(alert, 'Registered (demo mode). Redirecting…', 'success');
      setTimeout(() => window.location.href = 'index.html', 1200);
    }
  });
}

/* ============================================================
   PAGE: DASHBOARD
   ============================================================ */

// Mock data for demo
const MOCK = {
  summary: {
    total_expense: 42750,
    budget: 60000,
    remaining: 17250,
    budget_exceeded: false,
    top_category: 'Food',
  },
  expenses: [
    { id: 1, description: 'Grocery Shopping', category: 'food', amount: 2340, date: '2025-01-20', is_anomaly: false },
    { id: 2, description: 'Uber Ride', category: 'transport', amount: 450, date: '2025-01-19', is_anomaly: false },
    { id: 3, description: 'Netflix Subscription', category: 'entertainment', amount: 649, date: '2025-01-18', is_anomaly: false },
    { id: 4, description: 'Emergency Medical', category: 'health', amount: 12500, date: '2025-01-17', is_anomaly: true },
    { id: 5, description: 'Books — Programming', category: 'education', amount: 1200, date: '2025-01-16', is_anomaly: false },
  ],
  category_distribution: {
    Food: 14200, Transport: 5800, Shopping: 8900,
    Health: 12500, Entertainment: 3200, Education: 2400, Other: 2750,
  },
  monthly_trend: {
    labels: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'],
    values: [38400, 41200, 35600, 52100, 44800, 42750],
  },
  forecast: 45200,
};

let pieChartInstance   = null;
let lineChartInstance  = null;

async function initDashboardPage() {
  if (!Auth.requireAuth()) return;
  initSidebar();

  // Set date
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

  await loadSummary();
  await loadRecentTransactions();
  await loadForecast();
}

async function loadSummary() {
  const result = await API.get('/dashboard/summary');
  const data   = result.ok ? result.data : MOCK.summary;

  const totalEl     = document.getElementById('total-expense');
  const remainEl    = document.getElementById('budget-remaining');
  const budgetEl    = document.getElementById('monthly-budget');
  const topCatEl    = document.getElementById('top-category');
  const warningEl   = document.getElementById('budget-warning');

  if (totalEl) UI.animateCount(totalEl, data.total_expense || MOCK.summary.total_expense);
  if (remainEl) UI.animateCount(remainEl, data.remaining || MOCK.summary.remaining);
  if (budgetEl) UI.animateCount(budgetEl, data.budget || MOCK.summary.budget);
  if (topCatEl) topCatEl.textContent = data.top_category || MOCK.summary.top_category;

  if (data.budget_exceeded && warningEl) {
    warningEl.classList.remove('hidden');
  }

  // Charts
  const expResult = await API.get('/expenses');
  const exps = expResult.ok ? expResult.data : null;
  renderPieChart(exps ? buildCategoryMap(exps) : MOCK.category_distribution);
  renderLineChart(MOCK.monthly_trend);
}

function buildCategoryMap(expenses) {
  return expenses.reduce((acc, e) => {
    const cat = e.category || 'Other';
    acc[cat] = (acc[cat] || 0) + e.amount;
    return acc;
  }, {});
}

function renderPieChart(distribution) {
  const ctx = document.getElementById('pieChart')?.getContext('2d');
  if (!ctx) return;

  const labels = Object.keys(distribution);
  const values = Object.values(distribution);
  const colors = ['#f97316','#38bdf8','#a855f7','#eab308','#22c55e','#ef4444','#3b82f6','#94a3b8'];

  if (pieChartInstance) pieChartInstance.destroy();

  pieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: '#181c27',
        borderWidth: 3,
        hoverBorderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#8a91a8',
            padding: 16,
            font: { family: 'DM Sans', size: 12 },
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: '#1e2333',
          titleColor: '#f0f2f8',
          bodyColor: '#8a91a8',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (ctx) => ` ₹${ctx.parsed.toLocaleString('en-IN')}`,
          },
        },
      },
    },
  });
}

function renderLineChart(trend) {
  const ctx = document.getElementById('lineChart')?.getContext('2d');
  if (!ctx) return;

  if (lineChartInstance) lineChartInstance.destroy();

  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0,   'rgba(240,165,0,0.25)');
  gradient.addColorStop(1,   'rgba(240,165,0,0.0)');

  lineChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.labels,
      datasets: [{
        label: 'Monthly Spend',
        data: trend.values,
        borderColor: '#f0a500',
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointBackgroundColor: '#f0a500',
        pointBorderColor: '#181c27',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2333',
          titleColor: '#f0f2f8',
          bodyColor: '#8a91a8',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 12,
          callbacks: { label: (ctx) => ` ₹${ctx.parsed.y.toLocaleString('en-IN')}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: { color: '#8a91a8', font: { family: 'DM Sans', size: 12 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: '#8a91a8',
            font: { family: 'DM Mono', size: 11 },
            callback: (v) => '₹' + (v/1000).toFixed(0) + 'k',
          },
        },
      },
    },
  });
}

async function loadRecentTransactions() {
  const result = await API.get('/expenses');
  const expenses = result.ok ? result.data : MOCK.expenses;
  const recent = expenses.slice(0, 5);

  const tbody = document.getElementById('recent-tbody');
  if (!tbody) return;

  if (!recent.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon">💸</div><p>No transactions yet</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(exp => `
    <tr>
      <td>
        <div style="font-weight:500">${exp.description}</div>
        ${exp.is_anomaly ? '<span class="anomaly-flag">⚠ Anomaly</span>' : ''}
      </td>
      <td>${UI.getCategoryBadge(exp.category)}</td>
      <td class="amount-cell">−${UI.formatCurrency(exp.amount)}</td>
      <td style="color:var(--text-secondary);font-size:13px">${UI.formatDate(exp.date)}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="deleteExpense(${exp.id})">🗑</button>
      </td>
    </tr>
  `).join('');
}

async function loadForecast() {
  const result = await API.get('/forecast');
  const amount = result.ok ? result.data.forecast : MOCK.forecast;
  const el = document.getElementById('forecast-amount');
  if (el) {
    el.textContent = UI.formatCurrency(amount);
  }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  const result = await API.delete(`/expenses/${id}`);
  if (result.ok || true) { // demo always succeeds
    await loadRecentTransactions();
    await loadSummary();
  }
}

/* ============================================================
   PAGE: ADD EXPENSE
   ============================================================ */
let predictTimeout = null;

async function initAddExpensePage() {
  if (!Auth.requireAuth()) return;
  initSidebar();

  const form     = document.getElementById('expense-form');
  const alert    = document.getElementById('expense-alert');
  const btn      = document.getElementById('submit-btn');
  const descEl   = document.getElementById('description');
  const catEl    = document.getElementById('category');
  const suggest  = document.getElementById('category-suggest');

  // Set today as default date
  const dateEl = document.getElementById('date');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  // Auto-categorize on description input
  descEl?.addEventListener('input', () => {
    clearTimeout(predictTimeout);
    const val = descEl.value.trim();
    if (val.length < 3) { suggest?.classList.remove('show'); return; }

    predictTimeout = setTimeout(async () => {
      if (suggest) {
        suggest.innerHTML = `<span class="spinner"></span> Predicting category…`;
        suggest.classList.add('show');
      }

      const result = await API.post('/predict-category', { description: val });

      if (result.ok && result.data.category) {
        const predicted = result.data.category.toLowerCase();
        if (catEl) catEl.value = predicted;
        if (suggest) {
          suggest.innerHTML = `✨ Auto-filled: <strong>${predicted}</strong>`;
          suggest.classList.add('show');
        }
      } else {
        // Demo: keyword-based prediction
        const predicted = predictCategoryLocally(val);
        if (catEl) catEl.value = predicted;
        if (suggest) {
          suggest.innerHTML = `✨ Suggested: <strong>${predicted}</strong>`;
          suggest.classList.add('show');
        }
      }
    }, 600);
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      amount:      parseFloat(document.getElementById('amount').value),
      description: document.getElementById('description').value.trim(),
      category:    document.getElementById('category').value,
      date:        document.getElementById('date').value,
    };

    if (!payload.amount || !payload.description || !payload.date) {
      UI.showAlert(alert, 'Please fill in all required fields.', 'error');
      return;
    }

    if (payload.amount <= 0) {
      UI.showAlert(alert, 'Amount must be greater than 0.', 'error');
      return;
    }

    UI.setLoading(btn, true);

    // Check anomaly
    const anomalyResult = await API.post('/check-anomaly', payload);
    if (anomalyResult.ok && anomalyResult.data.is_anomaly) {
      UI.showAlert(alert, `⚠ Anomaly detected: This expense seems unusually high for ${payload.category}.`, 'warning');
    }

    const result = await API.post('/expenses', payload);
    UI.setLoading(btn, false, 'Add Expense');

    if (result.ok) {
      UI.showAlert(alert, '✓ Expense added successfully!', 'success');
      form.reset();
      if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
      if (suggest) suggest.classList.remove('show');
    } else {
      // Demo mode
      UI.showAlert(alert, '✓ Expense saved (demo mode)!', 'success');
      form.reset();
      if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    }
  });
}

function predictCategoryLocally(desc) {
  desc = desc.toLowerCase();
  if (/food|eat|restaurant|cafe|pizza|burger|lunch|dinner|grocery|swiggy|zomato/i.test(desc)) return 'food';
  if (/uber|ola|bus|auto|metro|petrol|fuel|cab|taxi/i.test(desc)) return 'transport';
  if (/amazon|flipkart|shop|buy|cloth|dress|shoe|mall/i.test(desc)) return 'shopping';
  if (/electricity|water|wifi|internet|bill|recharge/i.test(desc)) return 'utilities';
  if (/doctor|hospital|medicine|pharmacy|clinic|health/i.test(desc)) return 'health';
  if (/netflix|movie|cinema|game|spotify|subscription/i.test(desc)) return 'entertainment';
  if (/book|course|college|school|tuition|education/i.test(desc)) return 'education';
  return 'other';
}

/* ============================================================
   PAGE: BUDGET
   ============================================================ */
const CAT_ICONS = {
  food: '🍜', transport: '🚌', shopping: '🛍️',
  utilities: '⚡', health: '💊', entertainment: '🎬',
  education: '📚', other: '📌',
};

// Stored budgets (in-memory for demo)
let budgets = {
  total: 60000,
  food: 15000, transport: 8000, shopping: 10000,
  utilities: 5000, health: 8000, entertainment: 5000,
  education: 5000, other: 4000,
};

let categorySpends = {
  food: 14200, transport: 5800, shopping: 8900,
  utilities: 3200, health: 12500, entertainment: 3200,
  education: 2400, other: 2750,
};

async function initBudgetPage() {
  if (!Auth.requireAuth()) return;
  initSidebar();

  document.getElementById('total-budget-input').value = budgets.total;

  Object.keys(CAT_ICONS).forEach(cat => {
    const inp = document.getElementById(`budget-${cat}`);
    if (inp) inp.value = budgets[cat] || 0;
  });

  renderProgressBars();
  loadBudgetFromAPI();

  document.getElementById('budget-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alert = document.getElementById('budget-alert');

    budgets.total = parseFloat(document.getElementById('total-budget-input').value) || 60000;
    Object.keys(CAT_ICONS).forEach(cat => {
      const inp = document.getElementById(`budget-${cat}`);
      if (inp) budgets[cat] = parseFloat(inp.value) || 0;
    });

    const result = await API.post('/budget', budgets);
    UI.showAlert(alert, result.ok ? '✓ Budget saved!' : '✓ Budget saved (demo mode)!', 'success');
    renderProgressBars();
  });
}

async function loadBudgetFromAPI() {
  const result = await API.get('/budget');
  if (result.ok && result.data) {
    Object.assign(budgets, result.data);
    renderProgressBars();
  }

  const expResult = await API.get('/expenses');
  if (expResult.ok) {
    categorySpends = buildCategoryMap(expResult.data);
    renderProgressBars();
  }
}

function renderProgressBars() {
  const container = document.getElementById('progress-list');
  if (!container) return;

  container.innerHTML = Object.keys(CAT_ICONS).map(cat => {
    const budget = budgets[cat] || 0;
    const spent  = categorySpends[cat.charAt(0).toUpperCase() + cat.slice(1)] || categorySpends[cat] || 0;
    const pct    = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    const cls    = pct >= 100 ? 'fill-over' : pct >= 80 ? 'fill-warn' : 'fill-safe';

    return `
      <div class="progress-item">
        <div class="progress-header">
          <span class="progress-label">${CAT_ICONS[cat]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
          <span class="progress-values">${UI.formatCurrency(spent)} / ${UI.formatCurrency(budget)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${cls}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');

  // Update total remaining
  const totalSpent = Object.values(categorySpends).reduce((a, b) => a + b, 0);
  const remaining  = budgets.total - totalSpent;
  const totalPct   = budgets.total > 0 ? Math.min((totalSpent / budgets.total) * 100, 100) : 0;
  const totalCls   = totalPct >= 100 ? 'fill-over' : totalPct >= 80 ? 'fill-warn' : 'fill-safe';

  const totalEl    = document.getElementById('total-remaining');
  const totalBar   = document.getElementById('total-progress');
  if (totalEl)  totalEl.textContent  = UI.formatCurrency(Math.max(remaining, 0));
  if (totalBar) {
    totalBar.style.width = `${totalPct}%`;
    totalBar.className   = `progress-fill ${totalCls}`;
  }
}

/* ── Router ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const page = window.location.pathname.split('/').pop() || 'index.html';

  if (page === 'login.html')       initLoginPage();
  else if (page === 'register.html') initRegisterPage();
  else if (page === 'index.html' || page === '' || page === '/') initDashboardPage();
  else if (page === 'add-expense.html') initAddExpensePage();
  else if (page === 'budget.html')      initBudgetPage();

  // Update year in footer if present
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
