/**
 * OpenForce CRM — Modern Vanilla JS Single Page Application
 */

(function () {
  'use strict';

  // State Management
  const state = {
    token: localStorage.getItem('openforce_token') || null,
    user: JSON.parse(localStorage.getItem('openforce_user') || 'null'),
    org: JSON.parse(localStorage.getItem('openforce_org') || 'null'),
    currentView: 'dashboard',
    stages: [],
    currencySymbol: '$',
    currencyCode: 'USD',
    searchTimeout: null
  };

  // Security: HTML entity encoding for dynamic text & attribute injection prevention
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Security: URL sanitizer to block javascript: and data: URI vectors
  function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return escapeHtml(trimmed);
    }
    return '#';
  }

  // API helper with automatic auth header and error handling
  async function api(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    try {
      const res = await fetch(endpoint, { ...options, headers });
      if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
        // Token expired or invalid, auto-login with default demo account
        console.warn('Session expired, logging in as demo admin...');
        await loginWithCredentials('admin@openforce.local', 'AdminPass123!');
        return api(endpoint, options);
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Request failed with status ' + res.status);
      }
      return data;
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    }
  }

  // Toast Notification System
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: ${type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)'};
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 8px;
      animation: fadeIn 0.2s ease-out;
    `;
    toast.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Persona / Demo User Switcher
  window.switchDemoUser = async function (role) {
    let email = 'admin@openforce.local';
    let pass = 'AdminPass123!';

    if (role === 'sarah') {
      email = 'sarah@openforce.local';
      pass = 'SarahPass123!';
    } else if (role === 'auditor') {
      email = 'auditor@openforce.local';
      pass = 'AuditPass123!';
    }

    // Update buttons UI
    document.querySelectorAll('.demo-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`demo-btn-${role === 'admin' ? 'admin' : (role === 'sarah' ? 'rep' : 'audit')}`);
    if (btn) btn.classList.add('active');

    await loginWithCredentials(email, pass);
    showToast(`Switched persona to ${state.user.first_name} (${state.user.role})`);
    renderCurrentView();
  };

  async function loginWithCredentials(email, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      state.token = data.token;
      state.user = data.user;
      state.org = data.org;
      state.currencySymbol = data.org?.currency_symbol || '$';
      state.currencyCode = data.org?.currency_code || 'USD';

      localStorage.setItem('openforce_token', data.token);
      localStorage.setItem('openforce_user', JSON.stringify(data.user));
      localStorage.setItem('openforce_org', JSON.stringify(data.org));

      updateUserHeader();
    } catch (e) {
      console.error('Demo login failed:', e);
    }
  }

  function updateUserHeader() {
    if (!state.user) return;
    const nameEl = document.getElementById('current-user-name');
    const roleEl = document.getElementById('current-user-role');
    const avatarEl = document.getElementById('current-user-avatar');

    if (nameEl) nameEl.textContent = `${state.user.first_name} ${state.user.last_name}`;
    if (roleEl) roleEl.textContent = state.user.role;
    if (avatarEl) avatarEl.textContent = `${state.user.first_name[0]}${state.user.last_name[0]}`;
  }

  // Navigation Controller
  function initNavigation() {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const view = item.dataset.view;
        state.currentView = view;
        renderCurrentView();
      });
    });
  }

  function renderCurrentView() {
    const main = document.getElementById('main-content');
    if (!main) return;

    switch (state.currentView) {
      case 'dashboard':
        renderDashboardView(main);
        break;
      case 'pipeline':
        renderPipelineView(main);
        break;
      case 'leads':
        renderLeadsView(main);
        break;
      case 'accounts':
        renderAccountsView(main);
        break;
      case 'contacts':
        renderContactsView(main);
        break;
      case 'activities':
        renderActivitiesView(main);
        break;
      case 'reports':
        renderReportsView(main);
        break;
      case 'settings':
        renderSettingsView(main);
        break;
      default:
        renderDashboardView(main);
    }
  }

  function formatCurrency(amount) {
    const num = Number(amount) || 0;
    return `${escapeHtml(state.currencySymbol)}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  // ==========================================================================
  // VIEW: Dashboard
  // ==========================================================================
  async function renderDashboardView(container) {
    container.innerHTML = `<div style="display:flex; justify-content:center; padding: 40px; color: var(--text-muted);">Loading live dashboard metrics...</div>`;
    try {
      const data = await api('/api/reports/dashboard');
      const { kpis, stages_breakdown, leads_by_source, recent_activities } = data;

      container.innerHTML = `
        <div style="margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h1 style="font-size: 24px; font-weight: 800; color: #fff;">Sales Cloud Executive Dashboard</h1>
            <p style="color: var(--text-muted); font-size: 13px;">Real-time pipeline overview, conversion rates, and recent activity feed.</p>
          </div>
          <div>
            <button class="btn btn-primary" onclick="window.openNewLeadModal()">+ New Lead</button>
          </div>
        </div>

        <!-- KPI Grid -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-title">Active Pipeline</span>
              <div class="kpi-icon-badge" style="background: rgba(2, 132, 199, 0.2); color: #38bdf8;">📈</div>
            </div>
            <div class="kpi-value">${formatCurrency(kpis.open_pipeline_value)}</div>
            <div class="kpi-subtext">${kpis.open_deals_count} open opportunities</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-title">Weighted Forecast</span>
              <div class="kpi-icon-badge" style="background: rgba(139, 92, 246, 0.2); color: #a78bfa;">🎯</div>
            </div>
            <div class="kpi-value">${formatCurrency(kpis.weighted_forecast)}</div>
            <div class="kpi-subtext">Probability-adjusted expectation</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-title">Closed Won Revenue</span>
              <div class="kpi-icon-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">🏆</div>
            </div>
            <div class="kpi-value" style="color: var(--accent-emerald);">${formatCurrency(kpis.won_value)}</div>
            <div class="kpi-subtext">Win rate: <strong style="color: #fff;">${kpis.win_rate}%</strong> (${kpis.won_deals_count} won)</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-title">Lead Qualification</span>
              <div class="kpi-icon-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">⚡</div>
            </div>
            <div class="kpi-value">${kpis.active_leads_count}</div>
            <div class="kpi-subtext">Conversion rate: <strong style="color: #fff;">${kpis.lead_conversion_rate}%</strong> (${kpis.converted_leads_count} converted)</div>
          </div>
        </div>

        <!-- Pipeline Stages Breakdown & Leads Source -->
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 24px;">
          <!-- Stages Card -->
          <div class="data-table-card" style="padding: 20px;">
            <h2 style="font-size: 15px; font-weight: 700; margin-bottom: 16px; color: #fff;">Pipeline Distribution by Stage</h2>
            <div style="display: flex; flex-direction: column; gap: 14px;">
              ${stages_breakdown.map(s => {
                const maxVal = Math.max(...stages_breakdown.map(x => x.total_amount), 1);
                const pct = Math.round((s.total_amount / maxVal) * 100);
                return `
                  <div>
                    <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                      <span style="font-weight: 600;">${escapeHtml(s.stage_name)} <span style="color: var(--text-muted); font-size: 11px;">(${s.deal_count} deals)</span></span>
                      <span style="font-weight: 700; color: ${s.is_won ? 'var(--accent-emerald)' : '#fff'};">${formatCurrency(s.total_amount)}</span>
                    </div>
                    <div style="height: 8px; background: var(--bg-surface-elevated); border-radius: 4px; overflow: hidden;">
                      <div style="height: 100%; width: ${pct}%; background: ${s.is_won ? 'var(--accent-emerald)' : 'var(--brand-blue)'}; border-radius: 4px;"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Leads Source Card -->
          <div class="data-table-card" style="padding: 20px;">
            <h2 style="font-size: 15px; font-weight: 700; margin-bottom: 16px; color: #fff;">Leads by Source</h2>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${leads_by_source.map(src => `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-surface-elevated); border-radius: var(--radius-md);">
                  <span style="font-size: 13px; font-weight: 500;">${escapeHtml(src.source || 'Direct')}</span>
                  <span class="badge badge-new">${src.count} leads</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Recent Activities Feed -->
        <div class="data-table-card" style="padding: 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <h2 style="font-size: 15px; font-weight: 700; color: #fff;">Recent Activity Timeline</h2>
            <button class="btn btn-secondary btn-sm" onclick="window.openNewActivityModal()">+ Log Activity</button>
          </div>
          <div class="timeline">
            ${recent_activities.map(a => `
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-header">
                  <div class="timeline-title">${escapeHtml(a.activity_type)}: ${escapeHtml(a.subject)}</div>
                  <div class="timeline-time">${new Date(a.created_at).toLocaleDateString()}</div>
                </div>
                <div class="timeline-body">${escapeHtml(a.description || 'No description provided.')}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
                  Logged by: <span style="color: var(--text-secondary);">${escapeHtml(a.author_first || 'User')} ${escapeHtml(a.author_last || '')}</span>
                  ${a.related_to_type ? ` • Related to ${escapeHtml(a.related_to_type)}` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div style="color: var(--accent-rose); padding: 20px;">Failed to load dashboard: ${escapeHtml(e.message)}</div>`;
    }
  }

  // ==========================================================================
  // VIEW: Pipeline (Kanban Board)
  // ==========================================================================
  async function renderPipelineView(container) {
    container.innerHTML = `<div style="display:flex; justify-content:center; padding: 40px; color: var(--text-muted);">Loading sales pipeline...</div>`;
    try {
      const data = await api('/api/opportunities/pipeline');
      const { stages, summary } = data;
      state.stages = stages;

      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-size: 22px; font-weight: 800; color: #fff;">Opportunity Pipeline Kanban</h1>
            <p style="color: var(--text-muted); font-size: 13px;">
              Active: <strong style="color:#fff;">${formatCurrency(summary.total_pipeline_value)}</strong> • 
              Weighted: <strong style="color:#38bdf8;">${formatCurrency(summary.weighted_pipeline_value)}</strong> • 
              Total Deals: <strong style="color:#fff;">${summary.total_open_count}</strong>
            </p>
          </div>
          <div style="display: flex; gap: 10px;">
            <a href="/api/csv/export/opportunities" class="btn btn-secondary btn-sm" download>📥 Export Deals</a>
            <button class="btn btn-primary btn-sm" onclick="window.openNewOpportunityModal()">+ New Deal</button>
          </div>
        </div>

        <div class="kanban-board-container">
          ${stages.map(st => `
            <div class="kanban-column" data-stage-id="${st.id}">
              <div class="kanban-column-header">
                <div class="kanban-column-title">
                  <span>${escapeHtml(st.name)}</span>
                  <span class="kanban-count-pill">${st.deals_count}</span>
                </div>
                <div class="kanban-column-total">${formatCurrency(st.total_amount)}</div>
              </div>
              <div class="kanban-card-list">
                ${st.deals.map(deal => `
                  <div class="kanban-card" data-deal-id="${deal.id}">
                    <div class="kanban-card-title">${escapeHtml(deal.name)}</div>
                    <div class="kanban-card-account">🏢 ${escapeHtml(deal.account_name)}</div>
                    <div class="kanban-card-footer">
                      <div class="kanban-card-amount">${formatCurrency(deal.amount)}</div>
                      <div class="kanban-card-date">📅 ${escapeHtml(deal.close_date || 'No date')}</div>
                    </div>
                    <div style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between;">
                      <span style="font-size: 11px; color: var(--text-muted);">${deal.probability}% Prob</span>
                      <select class="filter-select" style="height: 24px; font-size: 11px; padding: 0 4px;" onchange="window.moveDealStage(${deal.id}, this.value)">
                        ${stages.map(optStage => `
                          <option value="${optStage.id}" ${optStage.id === deal.stage_id ? 'selected' : ''}>
                            Move to: ${escapeHtml(optStage.name)}
                          </option>
                        `).join('')}
                      </select>
                    </div>
                  </div>
                `).join('')}
                ${st.deals.length === 0 ? `<div style="text-align: center; padding: 24px 0; color: var(--text-muted); font-size: 12px;">No deals in this stage</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div style="color: var(--accent-rose); padding: 20px;">Failed to load pipeline: ${escapeHtml(e.message)}</div>`;
    }
  }

  window.moveDealStage = async function (dealId, targetStageId) {
    try {
      await api(`/api/opportunities/${dealId}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage_id: Number(targetStageId) })
      });
      showToast('Deal stage updated successfully');
      renderPipelineView(document.getElementById('main-content'));
    } catch (e) {
      // error handled by api()
    }
  };

  // ==========================================================================
  // VIEW: Leads (with Salesforce 1-Click Conversion)
  // ==========================================================================
  async function renderLeadsView(container, filterStatus = '') {
    container.innerHTML = `<div style="display:flex; justify-content:center; padding: 40px; color: var(--text-muted);">Loading leads...</div>`;
    try {
      const url = filterStatus ? `/api/leads?status=${encodeURIComponent(filterStatus)}` : '/api/leads';
      const data = await api(url);
      const leads = data.leads || [];

      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-size: 22px; font-weight: 800; color: #fff;">Leads Management</h1>
            <p style="color: var(--text-muted); font-size: 13px;">Capture, qualify, and convert prospects into revenue opportunities.</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="window.openCsvImportModal('leads')">📥 Import CSV</button>
            <a href="/api/csv/export/leads" class="btn btn-secondary btn-sm" download>📤 Export CSV</a>
            <button class="btn btn-primary btn-sm" onclick="window.openNewLeadModal()">+ New Lead</button>
          </div>
        </div>

        <div class="data-table-card">
          <div class="table-toolbar">
            <div class="table-toolbar-left">
              <span style="font-size: 13px; color: var(--text-secondary);">Filter Status:</span>
              <select class="filter-select" id="lead-status-filter" onchange="window.filterLeadsByStatus(this.value)">
                <option value="" ${filterStatus === '' ? 'selected' : ''}>All Active Leads</option>
                <option value="New" ${filterStatus === 'New' ? 'selected' : ''}>New</option>
                <option value="Contacted" ${filterStatus === 'Contacted' ? 'selected' : ''}>Contacted</option>
                <option value="Qualified" ${filterStatus === 'Qualified' ? 'selected' : ''}>Qualified</option>
                <option value="Unqualified" ${filterStatus === 'Unqualified' ? 'selected' : ''}>Unqualified</option>
              </select>
            </div>
            <div style="font-size: 13px; color: var(--text-muted);">${leads.length} leads found</div>
          </div>

          <table class="data-table">
            <thead>
              <tr>
                <th>Lead Name</th>
                <th>Company</th>
                <th>Status</th>
                <th>Rating</th>
                <th>Source</th>
                <th>Email / Phone</th>
                <th>Assigned Rep</th>
                <th style="text-align: right;">Salesforce Action</th>
              </tr>
            </thead>
            <tbody>
              ${leads.map(l => {
                window._activeLeads = window._activeLeads || new Map();
                window._activeLeads.set(l.id, l);
                let badgeClass = 'badge-new';
                if (l.status === 'Contacted') badgeClass = 'badge-contacted';
                if (l.status === 'Qualified') badgeClass = 'badge-qualified';
                if (l.status === 'Unqualified') badgeClass = 'badge-unqualified';

                return `
                  <tr>
                    <td style="font-weight: 600; color: #fff;">
                      ${escapeHtml(l.first_name)} ${escapeHtml(l.last_name)}
                      ${l.title ? `<div style="font-size: 11px; color: var(--text-muted); font-weight: 400;">${escapeHtml(l.title)}</div>` : ''}
                    </td>
                    <td><strong>${escapeHtml(l.company)}</strong></td>
                    <td><span class="badge ${badgeClass}">${escapeHtml(l.status)}</span></td>
                    <td><span style="font-weight: 600; color: ${l.rating === 'Hot' ? 'var(--accent-rose)' : 'var(--text-secondary)'};">${escapeHtml(l.rating || 'Warm')}</span></td>
                    <td>${escapeHtml(l.source)}</td>
                    <td style="font-size: 12px; color: var(--text-secondary);">
                      <div>${escapeHtml(l.email || '—')}</div>
                      <div style="color: var(--text-muted);">${escapeHtml(l.phone || '')}</div>
                    </td>
                    <td>${escapeHtml(l.assigned_first || 'Sarah')} ${escapeHtml(l.assigned_last || '')}</td>
                    <td style="text-align: right;">
                      <button class="btn btn-success btn-sm" onclick="window.openConvertLeadModalById(${l.id})">
                        ⚡ Convert Lead
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
              ${leads.length === 0 ? `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No leads matching this filter</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div style="color: var(--accent-rose); padding: 20px;">Failed to load leads: ${escapeHtml(e.message)}</div>`;
    }
  }

  window.filterLeadsByStatus = function (status) {
    renderLeadsView(document.getElementById('main-content'), status);
  };

  // ==========================================================================
  // VIEW: Accounts (Companies 360)
  // ==========================================================================
  async function renderAccountsView(container) {
    container.innerHTML = `<div style="display:flex; justify-content:center; padding: 40px; color: var(--text-muted);">Loading accounts...</div>`;
    try {
      const data = await api('/api/accounts');
      const accounts = data.accounts || [];

      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-size: 22px; font-weight: 800; color: #fff;">Accounts (Companies)</h1>
            <p style="color: var(--text-muted); font-size: 13px;">Manage corporate accounts, organizational hierarchies, and account intelligence.</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="window.openCsvImportModal('accounts')">📥 Import CSV</button>
            <a href="/api/csv/export/accounts" class="btn btn-secondary btn-sm" download>📤 Export CSV</a>
            <button class="btn btn-primary btn-sm" onclick="window.openNewAccountModal()">+ New Account</button>
          </div>
        </div>

        <div class="data-table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Industry</th>
                <th>Annual Revenue</th>
                <th>Employees</th>
                <th>Location</th>
                <th>Contacts</th>
                <th>Deals</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${accounts.map(a => `
                <tr>
                  <td style="font-weight: 700; color: #fff;">
                    ${escapeHtml(a.name)}
                    ${a.website ? `<div style="font-size: 11px;"><a href="${sanitizeUrl(a.website)}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: none;">${escapeHtml(a.website.replace(/^https?:\/\//i, ''))}</a></div>` : ''}
                  </td>
                  <td>${escapeHtml(a.industry || '—')}</td>
                  <td style="font-weight: 600; color: var(--accent-emerald);">${formatCurrency(a.annual_revenue)}</td>
                  <td>${a.employees ? a.employees.toLocaleString() : '—'}</td>
                  <td>${escapeHtml(a.billing_city ? `${a.billing_city}, ${a.billing_country || ''}` : '—')}</td>
                  <td><span class="badge badge-new">${a.contacts_count || 0} Contacts</span></td>
                  <td><span class="badge badge-qualified">${a.opportunities_count || 0} Deals</span></td>
                  <td style="text-align: right;">
                    <button class="btn btn-secondary btn-sm" onclick="window.viewAccountDetail(${a.id})">View 360°</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div style="color: var(--accent-rose); padding: 20px;">Failed to load accounts: ${escapeHtml(e.message)}</div>`;
    }
  }

  window.viewAccountDetail = async function (id) {
    try {
      const data = await api(`/api/accounts/${id}`);
      const { account, contacts, opportunities, activities } = data;

      openModal(`Account 360°: ${escapeHtml(account.name)}`, `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
          <div style="background: var(--bg-surface-elevated); padding: 12px; border-radius: var(--radius-md);">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Industry</div>
            <div style="font-size: 14px; font-weight: 600;">${escapeHtml(account.industry || '—')}</div>
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 12px; border-radius: var(--radius-md);">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Annual Revenue</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--accent-emerald);">${formatCurrency(account.annual_revenue)}</div>
          </div>
        </div>

        <h4 style="font-size: 14px; font-weight: 700; margin-bottom: 10px; color: #fff;">Associated Contacts (${contacts.length})</h4>
        <div style="margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px;">
          ${contacts.map(c => `
            <div style="padding: 8px 12px; background: var(--bg-surface-elevated); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong>${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</strong>
                <span style="color: var(--text-muted); font-size: 12px;"> — ${escapeHtml(c.title || 'No Title')}</span>
              </div>
              <div style="font-size: 12px; color: #38bdf8;">${escapeHtml(c.email || '')}</div>
            </div>
          `).join('')}
          ${contacts.length === 0 ? `<div style="color: var(--text-muted); font-size: 12px;">No contacts linked yet.</div>` : ''}
        </div>

        <h4 style="font-size: 14px; font-weight: 700; margin-bottom: 10px; color: #fff;">Linked Opportunities (${opportunities.length})</h4>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${opportunities.map(o => `
            <div style="padding: 8px 12px; background: var(--bg-surface-elevated); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong>${escapeHtml(o.name)}</strong>
                <span class="badge badge-qualified" style="margin-left: 8px;">${escapeHtml(o.stage_name)}</span>
              </div>
              <div style="font-weight: 700; color: var(--accent-emerald);">${formatCurrency(o.amount)}</div>
            </div>
          `).join('')}
          ${opportunities.length === 0 ? `<div style="color: var(--text-muted); font-size: 12px;">No deals linked.</div>` : ''}
        </div>
      `);
    } catch (e) {
      // error handled by api()
    }
  };

  // ==========================================================================
  // VIEW: Contacts
  // ==========================================================================
  async function renderContactsView(container) {
    container.innerHTML = `<div style="display:flex; justify-content:center; padding: 40px; color: var(--text-muted);">Loading contacts...</div>`;
    try {
      const data = await api('/api/contacts');
      const contacts = data.contacts || [];

      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-size: 22px; font-weight: 800; color: #fff;">Contacts Directory</h1>
            <p style="color: var(--text-muted); font-size: 13px;">Manage client relationships, key stakeholders, and decision makers.</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="window.openCsvImportModal('contacts')">📥 Import CSV</button>
            <a href="/api/csv/export/contacts" class="btn btn-secondary btn-sm" download>📤 Export CSV</a>
            <button class="btn btn-primary btn-sm" onclick="window.openNewContactModal()">+ New Contact</button>
          </div>
        </div>

        <div class="data-table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Contact Name</th>
                <th>Company / Account</th>
                <th>Title / Department</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Primary</th>
              </tr>
            </thead>
            <tbody>
              ${contacts.map(c => `
                <tr>
                  <td style="font-weight: 700; color: #fff;">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</td>
                  <td><strong>${escapeHtml(c.account_name || 'Individual')}</strong></td>
                  <td>${escapeHtml(c.title || '—')} ${c.department ? `<span style="color: var(--text-muted);">(${escapeHtml(c.department)})</span>` : ''}</td>
                  <td><a href="mailto:${escapeHtml(c.email)}" style="color: #38bdf8; text-decoration: none;">${escapeHtml(c.email || '—')}</a></td>
                  <td>${escapeHtml(c.phone || '—')}</td>
                  <td>${c.is_primary ? `<span class="badge badge-won">Primary</span>` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div style="color: var(--accent-rose); padding: 20px;">Failed to load contacts: ${escapeHtml(e.message)}</div>`;
    }
  }

  // ==========================================================================
  // VIEW: Activities & Tasks
  // ==========================================================================
  async function renderActivitiesView(container) {
    container.innerHTML = `<div style="display:flex; justify-content:center; padding: 40px; color: var(--text-muted);">Loading tasks & activities...</div>`;
    try {
      const data = await api('/api/activities');
      const activities = data.activities || [];

      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-size: 22px; font-weight: 800; color: #fff;">Activities & Tasks</h1>
            <p style="color: var(--text-muted); font-size: 13px;">Track sales action items, call logs, customer meetings, and strategic notes.</p>
          </div>
          <div>
            <button class="btn btn-primary btn-sm" onclick="window.openNewActivityModal()">+ Log Activity / Task</button>
          </div>
        </div>

        <div class="data-table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px;">Status</th>
                <th>Type</th>
                <th>Subject & Description</th>
                <th>Priority</th>
                <th>Due Date</th>
                <th>Related To</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              ${activities.map(act => `
                <tr>
                  <td>
                    <input 
                      type="checkbox" 
                      ${act.status === 'Completed' ? 'checked' : ''} 
                      style="cursor: pointer; width: 16px; height: 16px;" 
                      onchange="window.toggleActivityStatus(${act.id}, this.checked)"
                    />
                  </td>
                  <td>
                    <span class="badge ${act.activity_type === 'Call' ? 'badge-new' : (act.activity_type === 'Meeting' ? 'badge-contacted' : 'badge-qualified')}">
                      ${escapeHtml(act.activity_type)}
                    </span>
                  </td>
                  <td>
                    <div style="font-weight: 600; color: #fff; ${act.status === 'Completed' ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                      ${escapeHtml(act.subject)}
                    </div>
                    ${act.description ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(act.description)}</div>` : ''}
                  </td>
                  <td>
                    <span style="font-weight: 600; color: ${act.priority === 'High' ? 'var(--accent-rose)' : (act.priority === 'Medium' ? 'var(--accent-amber)' : 'var(--text-secondary)')};">
                      ${escapeHtml(act.priority)}
                    </span>
                  </td>
                  <td style="font-size: 12px; color: var(--text-muted);">
                    ${act.due_date ? new Date(act.due_date).toLocaleDateString() : 'No date'}
                  </td>
                  <td>
                    ${act.related_to_type ? `<span class="badge badge-new">${escapeHtml(act.related_to_type)}</span>` : '—'}
                  </td>
                  <td>${escapeHtml(act.author_first || 'Sarah')} ${escapeHtml(act.author_last || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div style="color: var(--accent-rose); padding: 20px;">Failed to load activities: ${escapeHtml(e.message)}</div>`;
    }
  }

  window.toggleActivityStatus = async function (id, isChecked) {
    try {
      await api(`/api/activities/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: isChecked ? 'Completed' : 'Pending' })
      });
      showToast(isChecked ? 'Task marked as completed!' : 'Task set to pending.');
      renderActivitiesView(document.getElementById('main-content'));
    } catch (e) {
      // error handled by api()
    }
  };

  // ==========================================================================
  // VIEW: Reports
  // ==========================================================================
  async function renderReportsView(container) {
    container.innerHTML = `<div style="display:flex; justify-content:center; padding: 40px; color: var(--text-muted);">Loading sales analytics...</div>`;
    try {
      const data = await api('/api/reports/dashboard');
      const { kpis, stages_breakdown, leads_by_source } = data;

      container.innerHTML = `
        <div style="margin-bottom: 24px;">
          <h1 style="font-size: 24px; font-weight: 800; color: #fff;">Sales Performance & Pipeline Analytics</h1>
          <p style="color: var(--text-muted); font-size: 13px;">Executive visibility into revenue forecasting, stage progression, and conversion velocity.</p>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-title">Win Rate Ratio</div>
            <div class="kpi-value" style="color: var(--accent-emerald);">${kpis.win_rate}%</div>
            <div class="kpi-subtext">${kpis.won_deals_count} Won / ${kpis.lost_deals_count} Lost</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Lead Conversion Efficiency</div>
            <div class="kpi-value" style="color: var(--brand-cyan);">${kpis.lead_conversion_rate}%</div>
            <div class="kpi-subtext">${kpis.converted_leads_count} Converted / ${kpis.active_leads_count} Active</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Pipeline Coverage</div>
            <div class="kpi-value">${formatCurrency(kpis.open_pipeline_value)}</div>
            <div class="kpi-subtext">Across ${kpis.open_deals_count} live opportunities</div>
          </div>
        </div>

        <div class="data-table-card" style="padding: 20px; margin-bottom: 24px;">
          <h2 style="font-size: 15px; font-weight: 700; margin-bottom: 16px; color: #fff;">Pipeline Stage Matrix & Velocity</h2>
          <table class="data-table">
            <thead>
              <tr>
                <th>Stage Order</th>
                <th>Stage Name</th>
                <th>Probability</th>
                <th>Active Deals</th>
                <th>Total Value</th>
                <th>Weighted Forecast</th>
              </tr>
            </thead>
            <tbody>
              ${stages_breakdown.map(st => `
                <tr>
                  <td>#${st.stage_order}</td>
                  <td style="font-weight: 700; color: #fff;">${escapeHtml(st.stage_name)}</td>
                  <td>${st.probability}%</td>
                  <td>${st.deal_count}</td>
                  <td style="font-weight: 600; color: var(--accent-emerald);">${formatCurrency(st.total_amount)}</td>
                  <td style="color: #38bdf8;">${formatCurrency(st.total_amount * (st.probability / 100))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div style="color: var(--accent-rose); padding: 20px;">Failed to load reports: ${escapeHtml(e.message)}</div>`;
    }
  }

  // ==========================================================================
  // VIEW: Org Settings
  // ==========================================================================
  async function renderSettingsView(container) {
    container.innerHTML = `<div style="display:flex; justify-content:center; padding: 40px; color: var(--text-muted);">Loading settings...</div>`;
    try {
      const data = await api('/api/org');
      const usersData = await api('/api/auth/users');
      const { org, stages } = data;
      const users = usersData.users || [];

      container.innerHTML = `
        <div style="margin-bottom: 24px;">
          <h1 style="font-size: 24px; font-weight: 800; color: #fff;">Organization & Workspace Settings</h1>
          <p style="color: var(--text-muted); font-size: 13px;">Manage company profile, pipeline stage definitions, and user permissions.</p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <!-- Workspace Profile -->
          <div class="data-table-card" style="padding: 20px;">
            <h2 style="font-size: 16px; font-weight: 700; margin-bottom: 16px; color: #fff;">Workspace Profile</h2>
            <form id="org-profile-form" onsubmit="window.saveOrgProfile(event)">
              <div class="form-group">
                <label class="form-label">Organization Name</label>
                <input type="text" class="form-input" id="org-name-input" value="${escapeHtml(org.name)}" required />
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                  <label class="form-label">Currency Symbol</label>
                  <input type="text" class="form-input" id="org-symbol-input" value="${escapeHtml(org.currency_symbol || '$')}" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Currency Code</label>
                  <input type="text" class="form-input" id="org-code-input" value="${escapeHtml(org.currency_code || 'USD')}" required />
                </div>
              </div>
              <button type="submit" class="btn btn-primary" style="margin-top: 8px;">Save Settings</button>
            </form>
          </div>

          <!-- Team Members -->
          <div class="data-table-card" style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h2 style="font-size: 16px; font-weight: 700; color: #fff;">Team Members (${users.length})</h2>
              <button class="btn btn-secondary btn-sm" onclick="window.openInviteUserModal()">+ Add User</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${users.map(u => `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bg-surface-elevated); border-radius: var(--radius-md);">
                  <div>
                    <div style="font-weight: 600; color: #fff;">${escapeHtml(u.first_name)} ${escapeHtml(u.last_name)}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(u.email)}</div>
                  </div>
                  <span class="badge ${u.role === 'Admin' ? 'badge-qualified' : 'badge-new'}">${escapeHtml(u.role)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div style="color: var(--accent-rose); padding: 20px;">Failed to load settings: ${escapeHtml(e.message)}</div>`;
    }
  }

  window.saveOrgProfile = async function (e) {
    e.preventDefault();
    const name = document.getElementById('org-name-input').value;
    const symbol = document.getElementById('org-symbol-input').value;
    const code = document.getElementById('org-code-input').value;

    try {
      await api('/api/org', {
        method: 'PUT',
        body: JSON.stringify({ name, currency_symbol: symbol, currency_code: code })
      });
      state.currencySymbol = symbol;
      state.currencyCode = code;
      showToast('Organization settings updated successfully!');
    } catch (err) {
      // handled
    }
  };

  // ==========================================================================
  // Salesforce Core: 1-Click Lead Conversion Modal
  // ==========================================================================
  window.openConvertLeadModalById = function (leadId) {
    const lead = window._activeLeads && window._activeLeads.get(leadId);
    if (lead) {
      window.openConvertLeadModal(lead);
    }
  };

  window.openConvertLeadModal = function (lead) {
    openModal(`⚡ Convert Lead: ${escapeHtml(lead.first_name)} ${escapeHtml(lead.last_name)}`, `
      <div style="margin-bottom: 16px; color: var(--text-secondary); font-size: 13px;">
        Converting this lead implements the core Salesforce Sales Cloud conversion engine: it creates an Account and Contact, and optionally opens an Opportunity deal in your pipeline.
      </div>

      <div class="conversion-preview-box">
        <div class="conversion-step-title">🏢 1. Account (Company)</div>
        <div style="font-size: 13px; font-weight: 600; color: #fff;">${escapeHtml(lead.company)}</div>
        <div style="font-size: 12px; color: var(--text-muted);">Will create or link Account record.</div>
      </div>

      <div class="conversion-preview-box">
        <div class="conversion-step-title">📇 2. Contact</div>
        <div style="font-size: 13px; font-weight: 600; color: #fff;">${escapeHtml(lead.first_name)} ${escapeHtml(lead.last_name)}</div>
        <div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(lead.email || 'No email')} • ${escapeHtml(lead.phone || 'No phone')}</div>
      </div>

      <div class="conversion-preview-box" style="background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.25);">
        <div class="conversion-step-title" style="color: #34d399;">📈 3. Opportunity (Deal)</div>
        <div class="form-group" style="margin-top: 10px;">
          <label class="form-label">Deal Name</label>
          <input type="text" class="form-input" id="convert-opp-name" value="${escapeHtml(lead.company)} - Deal" />
        </div>
        <div class="form-group">
          <label class="form-label">Deal Amount (${escapeHtml(state.currencySymbol)})</label>
          <input type="number" class="form-input" id="convert-opp-amount" value="50000" />
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button class="btn btn-success" onclick="window.executeLeadConversion(${lead.id})">
          ⚡ Complete Conversion
        </button>
      </div>
    `);
  };

  window.executeLeadConversion = async function (leadId) {
    const oppName = document.getElementById('convert-opp-name').value;
    const oppAmount = document.getElementById('convert-opp-amount').value;

    try {
      const result = await api(`/api/leads/${leadId}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          create_opportunity: true,
          opportunity_name: oppName,
          opportunity_amount: Number(oppAmount) || 0
        })
      });

      closeModal();
      showToast('🎉 Lead converted successfully! Created Account, Contact, and Deal.');
      // Switch view to Pipeline to see new deal
      state.currentView = 'pipeline';
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.remove('active'));
      const pipelineNav = document.getElementById('nav-pipeline');
      if (pipelineNav) pipelineNav.classList.add('active');
      renderCurrentView();
    } catch (e) {
      // handled
    }
  };

  // ==========================================================================
  // Universal Global Search Controller
  // ==========================================================================
  function initGlobalSearch() {
    const searchInput = document.getElementById('global-search-input');
    const dropdown = document.getElementById('search-dropdown');
    if (!searchInput || !dropdown) return;

    // Keyboard shortcut Cmd+K or Ctrl+K
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });

    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      clearTimeout(state.searchTimeout);

      if (q.length < 2) {
        dropdown.classList.remove('active');
        dropdown.innerHTML = '';
        return;
      }

      state.searchTimeout = setTimeout(async () => {
        try {
          const results = await api(`/api/search?q=${encodeURIComponent(q)}`);
          renderSearchResults(results, dropdown);
        } catch (err) {
          console.error(err);
        }
      }, 200);
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });
  }

  function renderSearchResults(data, container) {
    const { accounts, contacts, leads, opportunities } = data;
    const total = accounts.length + contacts.length + leads.length + opportunities.length;

    if (total === 0) {
      container.innerHTML = `<div style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center;">No matches found</div>`;
      container.classList.add('active');
      return;
    }

    let html = '';

    if (accounts.length > 0) {
      html += `<div class="search-section-header">🏢 Accounts (${accounts.length})</div>`;
      accounts.forEach(a => {
        html += `
          <div class="search-result-item" onclick="window.viewAccountDetail(${a.id})">
            <div>
              <div style="font-weight: 600; color: #fff;">${escapeHtml(a.name)}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(a.industry || 'No industry')}</div>
            </div>
            <span class="badge badge-new">Account</span>
          </div>
        `;
      });
    }

    if (contacts.length > 0) {
      html += `<div class="search-section-header">📇 Contacts (${contacts.length})</div>`;
      contacts.forEach(c => {
        html += `
          <div class="search-result-item" onclick="window.navigateToContacts()">
            <div>
              <div style="font-weight: 600; color: #fff;">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(c.account_name || 'Individual')} • ${escapeHtml(c.email || '')}</div>
            </div>
            <span class="badge badge-qualified">Contact</span>
          </div>
        `;
      });
    }

    if (leads.length > 0) {
      html += `<div class="search-section-header">🎯 Leads (${leads.length})</div>`;
      leads.forEach(l => {
        html += `
          <div class="search-result-item" onclick="window.navigateToLeads()">
            <div>
              <div style="font-weight: 600; color: #fff;">${escapeHtml(l.first_name)} ${escapeHtml(l.last_name)} (${escapeHtml(l.company)})</div>
              <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(l.status)} • ${escapeHtml(l.email || '')}</div>
            </div>
            <span class="badge badge-contacted">Lead</span>
          </div>
        `;
      });
    }

    if (opportunities.length > 0) {
      html += `<div class="search-section-header">📈 Opportunities (${opportunities.length})</div>`;
      opportunities.forEach(o => {
        html += `
          <div class="search-result-item" onclick="window.navigateToPipeline()">
            <div>
              <div style="font-weight: 600; color: #fff;">${escapeHtml(o.name)}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(o.account_name)} • ${escapeHtml(o.stage_name)}</div>
            </div>
            <span style="font-weight: 700; color: var(--accent-emerald); font-size: 13px;">${formatCurrency(o.amount)}</span>
          </div>
        `;
      });
    }

    container.innerHTML = html;
    container.classList.add('active');
  }

  window.navigateToContacts = function () {
    document.getElementById('search-dropdown').classList.remove('active');
    state.currentView = 'contacts';
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-contacts')?.classList.add('active');
    renderCurrentView();
  };

  window.navigateToLeads = function () {
    document.getElementById('search-dropdown').classList.remove('active');
    state.currentView = 'leads';
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-leads')?.classList.add('active');
    renderCurrentView();
  };

  window.navigateToPipeline = function () {
    document.getElementById('search-dropdown').classList.remove('active');
    state.currentView = 'pipeline';
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-pipeline')?.classList.add('active');
    renderCurrentView();
  };

  // ==========================================================================
  // Modal Management
  // ==========================================================================
  function openModal(title, contentHtml) {
    const modal = document.getElementById('main-modal');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    if (!modal || !titleEl || !bodyEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = contentHtml;
    modal.classList.add('active');
  }

  window.closeModal = function () {
    const modal = document.getElementById('main-modal');
    if (modal) modal.classList.remove('active');
  };

  // Quick Create Modal
  window.openQuickCreateModal = function () {
    openModal('⚡ Quick Create Record', `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <button class="btn btn-secondary" style="padding: 16px; flex-direction: column;" onclick="window.closeModal(); window.openNewLeadModal();">
          <span style="font-size: 24px;">🎯</span>
          <span style="font-weight: 700;">New Lead</span>
        </button>
        <button class="btn btn-secondary" style="padding: 16px; flex-direction: column;" onclick="window.closeModal(); window.openNewAccountModal();">
          <span style="font-size: 24px;">🏢</span>
          <span style="font-weight: 700;">New Account</span>
        </button>
        <button class="btn btn-secondary" style="padding: 16px; flex-direction: column;" onclick="window.closeModal(); window.openNewOpportunityModal();">
          <span style="font-size: 24px;">📈</span>
          <span style="font-weight: 700;">New Deal</span>
        </button>
        <button class="btn btn-secondary" style="padding: 16px; flex-direction: column;" onclick="window.closeModal(); window.openNewActivityModal();">
          <span style="font-size: 24px;">📝</span>
          <span style="font-weight: 700;">Log Task / Call</span>
        </button>
      </div>
    `);
  };

  // Modal: New Lead
  window.openNewLeadModal = function () {
    openModal('🎯 Create New Lead', `
      <form onsubmit="window.submitNewLead(event)">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">First Name *</label>
            <input type="text" class="form-input" id="lead-first" required />
          </div>
          <div class="form-group">
            <label class="form-label">Last Name *</label>
            <input type="text" class="form-input" id="lead-last" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Company Name *</label>
          <input type="text" class="form-input" id="lead-company" required />
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" id="lead-email" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="text" class="form-input" id="lead-phone" />
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="lead-status">
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Qualified">Qualified</option>
              <option value="Unqualified">Unqualified</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Rating</label>
            <select class="form-select" id="lead-rating">
              <option value="Hot">Hot 🔥</option>
              <option value="Warm" selected>Warm ⚡</option>
              <option value="Cold">Cold ❄️</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Lead</button>
        </div>
      </form>
    `);
  };

  window.submitNewLead = async function (e) {
    e.preventDefault();
    const payload = {
      first_name: document.getElementById('lead-first').value,
      last_name: document.getElementById('lead-last').value,
      company: document.getElementById('lead-company').value,
      email: document.getElementById('lead-email').value,
      phone: document.getElementById('lead-phone').value,
      status: document.getElementById('lead-status').value,
      rating: document.getElementById('lead-rating').value
    };

    try {
      await api('/api/leads', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      showToast('Lead created successfully!');
      if (state.currentView === 'leads') renderCurrentView();
    } catch (e) {
      // handled
    }
  };

  // Modal: New Account
  window.openNewAccountModal = function () {
    openModal('🏢 Create New Account', `
      <form onsubmit="window.submitNewAccount(event)">
        <div class="form-group">
          <label class="form-label">Company Name *</label>
          <input type="text" class="form-input" id="acc-name" required />
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Industry</label>
            <input type="text" class="form-input" id="acc-industry" placeholder="e.g. Technology" />
          </div>
          <div class="form-group">
            <label class="form-label">Annual Revenue (${escapeHtml(state.currencySymbol)})</label>
            <input type="number" class="form-input" id="acc-revenue" placeholder="0" />
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Website</label>
            <input type="url" class="form-input" id="acc-website" placeholder="https://" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="text" class="form-input" id="acc-phone" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Account</button>
        </div>
      </form>
    `);
  };

  window.submitNewAccount = async function (e) {
    e.preventDefault();
    const payload = {
      name: document.getElementById('acc-name').value,
      industry: document.getElementById('acc-industry').value,
      annual_revenue: document.getElementById('acc-revenue').value,
      website: document.getElementById('acc-website').value,
      phone: document.getElementById('acc-phone').value
    };

    try {
      await api('/api/accounts', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      showToast('Account created successfully!');
      if (state.currentView === 'accounts') renderCurrentView();
    } catch (e) {
      // handled
    }
  };

  // Modal: New Opportunity
  window.openNewOpportunityModal = async function () {
    try {
      const accData = await api('/api/accounts');
      const accounts = accData.accounts || [];

      openModal('📈 Create New Deal (Opportunity)', `
        <form onsubmit="window.submitNewOpportunity(event)">
          <div class="form-group">
            <label class="form-label">Deal Name *</label>
            <input type="text" class="form-input" id="opp-name" required placeholder="e.g. Platform License Contract" />
          </div>
          <div class="form-group">
            <label class="form-label">Account (Company) *</label>
            <select class="form-select" id="opp-account" required>
              ${accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Amount (${escapeHtml(state.currencySymbol)}) *</label>
              <input type="number" class="form-input" id="opp-amount" value="25000" required />
            </div>
            <div class="form-group">
              <label class="form-label">Pipeline Stage *</label>
              <select class="form-select" id="opp-stage">
                ${state.stages.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${s.probability}%)</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Expected Close Date</label>
            <input type="date" class="form-input" id="opp-date" value="${new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0]}" />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Deal</button>
          </div>
        </form>
      `);
    } catch (e) {
      // handled
    }
  };

  window.submitNewOpportunity = async function (e) {
    e.preventDefault();
    const payload = {
      name: document.getElementById('opp-name').value,
      account_id: document.getElementById('opp-account').value,
      amount: document.getElementById('opp-amount').value,
      stage_id: document.getElementById('opp-stage').value,
      close_date: document.getElementById('opp-date').value
    };

    try {
      await api('/api/opportunities', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      showToast('Opportunity created successfully!');
      if (state.currentView === 'pipeline') renderCurrentView();
    } catch (e) {
      // handled
    }
  };

  // Modal: New Activity
  window.openNewActivityModal = function () {
    openModal('📝 Log Activity / Task', `
      <form onsubmit="window.submitNewActivity(event)">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label">Activity Type *</label>
            <select class="form-select" id="act-type">
              <option value="Task">Task 📌</option>
              <option value="Call">Phone Call 📞</option>
              <option value="Meeting">Customer Meeting 🤝</option>
              <option value="Note">Internal Note 📝</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select class="form-select" id="act-priority">
              <option value="High">High 🔴</option>
              <option value="Medium" selected>Medium 🟡</option>
              <option value="Low">Low ⚪</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Subject *</label>
          <input type="text" class="form-input" id="act-subject" required placeholder="e.g. Follow up on proposal" />
        </div>
        <div class="form-group">
          <label class="form-label">Details / Notes</label>
          <textarea class="form-textarea" id="act-desc"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Activity</button>
        </div>
      </form>
    `);
  };

  window.submitNewActivity = async function (e) {
    e.preventDefault();
    const payload = {
      activity_type: document.getElementById('act-type').value,
      priority: document.getElementById('act-priority').value,
      subject: document.getElementById('act-subject').value,
      description: document.getElementById('act-desc').value
    };

    try {
      await api('/api/activities', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      showToast('Activity logged successfully!');
      if (state.currentView === 'activities' || state.currentView === 'dashboard') renderCurrentView();
    } catch (e) {
      // handled
    }
  };

  // Modal: CSV Import
  window.openCsvImportModal = function (entity) {
    openModal(`📥 Import ${entity.toUpperCase()} via CSV`, `
      <form onsubmit="window.submitCsvImport(event, '${entity}')">
        <div style="margin-bottom: 12px; font-size: 13px; color: var(--text-secondary);">
          Paste CSV contents below or select a file. The first row must contain column headers (e.g. <code>First Name, Last Name, Company, Email</code>).
        </div>
        <div class="form-group">
          <label class="form-label">Choose CSV File</label>
          <input type="file" accept=".csv" class="form-input" onchange="window.handleCsvFile(event)" />
        </div>
        <div class="form-group">
          <label class="form-label">Or Paste CSV Text</label>
          <textarea class="form-textarea" id="csv-text-input" style="height: 120px; font-family: monospace; font-size: 12px;" placeholder="First Name,Last Name,Company,Email,Phone&#10;John,Doe,Acme Corp,john@acme.com,555-0199"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Import Records</button>
        </div>
      </form>
    `);
  };

  window.handleCsvFile = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      const textarea = document.getElementById('csv-text-input');
      if (textarea) textarea.value = e.target.result;
    };
    reader.readAsText(file);
  };

  window.submitCsvImport = async function (e, entity) {
    e.preventDefault();
    const csvData = document.getElementById('csv-text-input').value;
    if (!csvData.trim()) {
      showToast('Please provide CSV data', 'error');
      return;
    }

    try {
      const res = await api(`/api/csv/import/${entity}`, {
        method: 'POST',
        body: JSON.stringify({ csv_data: csvData })
      });
      closeModal();
      showToast(res.message);
      renderCurrentView();
    } catch (err) {
      // handled
    }
  };

  // App Initialization
  async function init() {
    initNavigation();
    initGlobalSearch();

    // Auto-login if no token
    if (!state.token) {
      await loginWithCredentials('admin@openforce.local', 'AdminPass123!');
    } else {
      updateUserHeader();
    }

    renderCurrentView();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
