'use strict';

const App = {
  token: sessionStorage.getItem('klinik_token') || '',
  user: null,
  currentPage: 'dashboard',
  pageTitles: {
    dashboard: 'Dashboard',
    leads: 'Leadler',
    patients: 'Hastalar',
    inbox: 'Mesaj Gelen Kutusu',
    appointments: 'Randevular',
    finance: 'Kasa & Finans',
    campaigns: 'Kampanyalar',
    integrations: 'Meta Entegrasyonu'
  },

  async api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(path, { ...options, headers });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      if (response.status === 401 && !path.includes('/auth/login')) this.showLogin('Oturumunuz sona erdi. Tekrar giriş yapın.');
      const error = new Error(data?.error || data || 'İşlem tamamlanamadı.');
      error.status = response.status;
      throw error;
    }
    return data;
  },

  async init() {
    this.bindEvents();
    this.updateDate();
    if (!this.token) return this.showLogin();
    try {
      const response = await this.api('/api/auth/me');
      this.user = response.user;
      this.showApp();
    } catch {
      this.showLogin();
    }
  },

  bindEvents() {
    document.getElementById('login-form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = document.getElementById('login-btn');
      const errorBox = document.getElementById('login-error');
      button.disabled = true;
      errorBox.textContent = '';
      try {
        const data = await this.api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username: document.getElementById('login-username').value.trim(),
            password: document.getElementById('login-password').value
          })
        });
        this.token = data.token;
        this.user = data.user;
        sessionStorage.setItem('klinik_token', data.token);
        this.showApp();
        this.notify('Giriş başarılı. Hoş geldiniz.', 'success');
      } catch (error) {
        errorBox.innerHTML = `<i class="ri-error-warning-line"></i> ${this.escape(error.message)}`;
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById('toggle-password').addEventListener('click', () => {
      const input = document.getElementById('login-password');
      input.type = input.type === 'password' ? 'text' : 'password';
      document.querySelector('#toggle-password i').className = input.type === 'password' ? 'ri-eye-line' : 'ri-eye-off-line';
    });

    document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', event => {
      event.preventDefault();
      this.navigate(item.dataset.page);
    }));
    document.getElementById('logout-btn').addEventListener('click', () => this.logout());
    document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-overlay').addEventListener('click', event => {
      if (event.target.id === 'modal-overlay') this.closeModal();
    });
    document.getElementById('sidebar-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('collapsed'));
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.add('mobile-open');
      document.getElementById('sidebar-overlay').classList.add('active');
    });
    document.getElementById('sidebar-overlay').addEventListener('click', () => this.closeMobileMenu());
    document.getElementById('refresh-btn').addEventListener('click', () => this.navigate(this.currentPage, true));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.closeModal(); });
  },

  showLogin(message = '') {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
    this.token = '';
    this.user = null;
    sessionStorage.removeItem('klinik_token');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    if (message) document.getElementById('login-error').textContent = message;
  },

  showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('sidebar-username').textContent = this.user?.displayName || this.user?.username || 'Yönetici';
    document.getElementById('sidebar-role').textContent = this.user?.role === 'admin' ? 'Yönetici' : this.user?.role || 'Personel';
    
    // YETKİ KONTROLÜ
    const isAdmin = this.user?.role === 'admin';
    document.querySelectorAll('[data-role="admin"]').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
    
    this.initSSE();
    this.navigate(this.currentPage);
    this.refreshNavCounters();
  },

  async logout() {
    try { await this.api('/api/auth/logout', { method: 'POST' }); } catch { /* oturumu yerelde kapat */ }
    this.showLogin();
  },

  initSSE() {
    if (this.sse) this.sse.close();
    this.sse = new EventSource(`/api/stream?token=${encodeURIComponent(this.token)}`);
    
    this.sse.addEventListener('new_lead', (e) => {
      try {
        const data = JSON.parse(e.data);
        this.notify(`Yeni kişi (${data.source || 'Meta'}): ${data.fullName || 'Kullanıcı'}`, 'success');
        this.refreshNavCounters();
        if (this.currentPage === 'leads' && window.Leads && typeof window.Leads.render === 'function') {
          window.Leads.render();
        }
      } catch (err) {
        console.error('SSE new_lead parse error:', err);
      }
    });

    this.sse.addEventListener('new_message', (e) => {
      try {
        const data = JSON.parse(e.data);
        this.refreshNavCounters();
        if (this.currentPage === 'inbox' && window.Inbox && typeof window.Inbox.onNewMessage === 'function') {
          window.Inbox.onNewMessage(data);
        } else if (this.currentPage === 'inbox' && window.Inbox) {
          window.Inbox.render();
        }
        if (data.message?.direction === 'incoming') {
          this.notify(`Yeni mesaj (${data.platform || 'DM'}): ${data.fullName || 'Kullanıcı'}`, 'info');
        }
      } catch (err) {
        console.error('SSE new_message parse error:', err);
      }
    });

    this.sse.addEventListener('error', () => {
      console.warn('SSE bağlantısı kesildi, yeniden bağlanılıyor...');
    });
  },

  async navigate(page, force = false) {
    this.currentPage = page;
    document.body.classList.toggle('page-inbox', page === 'inbox');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page));
    document.getElementById('page-title').textContent = this.pageTitles[page] || 'Klinik CRM';
    this.closeMobileMenu();
    this.setLoading();
    try {
      const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
      if (navItem && navItem.getAttribute('data-role') === 'admin' && this.user?.role !== 'admin') {
        throw new Error('Bu sayfayı görüntülemek için yetkiniz yok.');
      }

      const moduleMap = {
        dashboard: window.Dashboard,
        leads: window.Leads,
        patients: window.Patients,
        inbox: window.Inbox,
        appointments: window.Appointments,
        finance: window.Finance,
        campaigns: window.Campaigns,
        integrations: window.Integrations,
        users: window.Users
      };
      const module = moduleMap[page];
      if (!module) throw new Error('Sayfa modülü bulunamadı.');
      await module.render(force);
      if (page !== 'dashboard') this.refreshNavCounters();
    } catch (error) {
      document.getElementById('page-content').innerHTML = this.errorState(error.message);
      this.notify(error.message, 'error');
    }
  },

  closeMobileMenu() {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebar-overlay').classList.remove('active');
  },

  setLoading() {
    document.getElementById('page-content').innerHTML = '<div class="page-loader"><i class="ri-loader-4-line"></i><span>Veriler yükleniyor...</span></div>';
  },

  async refreshNavCounters() {
    try {
      const data = await this.api('/api/dashboard');
      this.setNavCount('lead-nav-count', data.stats.newLeads);
      this.setNavCount('inbox-nav-count', data.stats.totalUnread);
    } catch { /* sessiz */ }
  },

  setNavCount(id, value) {
    const element = document.getElementById(id);
    element.textContent = String(value || 0);
    element.classList.toggle('hidden', !value);
  },

  showModal(title, bodyHtml, options = {}) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.querySelector('.modal-container').classList.toggle('modal-wide', Boolean(options.wide));
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  },

  confirm(message) {
    return window.confirm(message);
  },

  notify(message, type = 'info') {
    const icons = { success: 'ri-checkbox-circle-line', error: 'ri-error-warning-line', warning: 'ri-alert-line', info: 'ri-information-line' };
    const element = document.createElement('div');
    element.className = `notification notification-${type}`;
    const icon = document.createElement('i');
    icon.className = icons[type] || icons.info;
    const text = document.createElement('span');
    text.textContent = message;
    element.append(icon, text);
    document.getElementById('notification-container').appendChild(element);
    setTimeout(() => {
      element.classList.add('notification-exit');
      setTimeout(() => element.remove(), 350);
    }, 3600);
  },

  escape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  },

  attr(value) {
    return this.escape(value).replace(/`/g, '&#96;');
  },

  formToObject(form) {
    return Object.fromEntries(new FormData(form).entries());
  },

  formatDate(value, withTime = false) {
    if (!value) return '-';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('tr-TR', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
  },

  formatCurrency(value) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(Number(value || 0));
  },

  formatPhone(phone) {
    if (!phone || phone === '-') return '-';
    const cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('90') && cleaned.length === 12) {
      return `+90 (${cleaned.slice(2, 5)}) ${cleaned.slice(5, 8)} ${cleaned.slice(8, 10)} ${cleaned.slice(10, 12)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
      return `+90 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)} ${cleaned.slice(7, 9)} ${cleaned.slice(9, 11)}`;
    }
    if (cleaned.length === 10 && cleaned.startsWith('5')) {
      return `+90 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8, 10)}`;
    }
    if (cleaned.length >= 14) {
      return '-';
    }
    return phone;
  },

  formatNumber(value) {
    return new Intl.NumberFormat('tr-TR').format(Number(value || 0));
  },

  formatRelative(value) {
    if (!value) return '-';
    const diff = Date.now() - new Date(value).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Şimdi';
    if (minutes < 60) return `${minutes} dk önce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} sa önce`;
    return this.formatDate(value);
  },

  statusBadge(status) {
    const map = {
      'Yeni': 'badge-info', 'İletişime Geçildi': 'badge-warning', 'Randevu Alındı': 'badge-success', 'Ameliyat Oldu': 'badge-primary', 'Kayıp': 'badge-danger',
      'İlgisiz': 'badge-muted',
      'Bekliyor': 'badge-warning', 'Onaylandı': 'badge-success', 'Tamamlandı': 'badge-primary', 'İptal': 'badge-danger',
      'Aktif': 'badge-success', 'Pasif': 'badge-muted', 'Açık': 'badge-success', 'Kapalı': 'badge-muted'
    };
    return `<span class="badge ${map[status] || 'badge-muted'}">${this.escape(status || '-')}</span>`;
  },

  sourceBadge(source) {
    const text = source || 'Belirsiz';
    let cls = 'badge-muted';
    if (text.includes('WhatsApp')) cls = 'badge-success';
    else if (text.includes('Instagram')) cls = 'badge-warning';
    else if (text.includes('Form')) cls = 'badge-primary';
    else if (text.includes('Telefon')) cls = 'badge-info';
    return `<span class="badge ${cls}">${this.escape(text)}</span>`;
  },

  emptyState(icon, title, subtitle = '') {
    return `<div class="empty-state"><i class="${icon}"></i><p>${this.escape(title)}</p>${subtitle ? `<span class="empty-sub">${this.escape(subtitle)}</span>` : ''}</div>`;
  },

  errorState(message) {
    return `<div class="empty-state"><i class="ri-error-warning-line"></i><p>Sayfa yüklenemedi</p><span class="empty-sub">${this.escape(message)}</span><br><button class="btn btn-primary btn-sm" onclick="App.navigate(App.currentPage, true)"><i class="ri-refresh-line"></i> Tekrar Dene</button></div>`;
  },
  
  exportToCsv(filename, columns, data) {
    if (!data || !data.length) return App.notify('Dışa aktarılacak veri bulunamadı.', 'warning');
    
    const BOM = '\\uFEFF';
    let csvContent = BOM + columns.map(c => '"' + String(c.label || c).replace(/"/g, '""') + '"').join(',') + '\\n';
    
    data.forEach(row => {
      const rowData = columns.map(c => {
        let val = typeof c.value === 'function' ? c.value(row) : (row[c.key] || '');
        if (val === null || val === undefined) val = '';
        return '"' + String(val).replace(/"/g, '""').replace(/\\n/g, ' ') + '"';
      });
      csvContent += rowData.join(',') + '\\n';
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename.endsWith('.csv') ? filename : filename + '.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  updateDate() {
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
};

window.App = App;
window.addEventListener('DOMContentLoaded', () => App.init());
