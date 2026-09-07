'use strict';

window.Campaigns = {
  items: [],

  startDate: '',
  endDate: '',

  async render() {
    let url = '/api/campaigns';
    if (this.startDate && this.endDate) {
      url += `?startDate=${this.startDate}&endDate=${this.endDate}`;
    }
    const data = await App.api(url);
    this.items = data.items;
    
    const totalSpent = this.items.reduce((sum, item) => sum + Number(item.spent || 0), 0);
    const totalRevenue = this.items.reduce((sum, item) => sum + Number(item.total_revenue || 0), 0);
    const totalLeads = this.items.reduce((sum, item) => sum + Number(item.lead_count || 0), 0);
    const totalAppointments = this.items.reduce((sum, item) => sum + Number(item.appointment_count || 0), 0);
    const overallRoas = totalSpent > 0 ? (totalRevenue / totalSpent).toFixed(2) : 0;

    document.getElementById('page-content').innerHTML = `
      <div class="animate-fade-in">
        <div class="page-header" style="flex-wrap: wrap; gap: 15px;">
          <div><p class="page-header-title">Meta kampanya kimlikleriyle otomatik eşleşen performans takibi</p></div>
          <div class="date-filter" style="display: flex; gap: 10px; align-items: center; background: var(--bg-card); padding: 5px 10px; border-radius: 8px; border: 1px solid var(--border-color);">
            <input type="date" id="camp-start-date" value="${this.startDate}" class="form-control" style="width: auto; padding: 4px 8px; font-size: 13px;">
            <span>-</span>
            <input type="date" id="camp-end-date" value="${this.endDate}" class="form-control" style="width: auto; padding: 4px 8px; font-size: 13px;">
            <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px;" onclick="Campaigns.applyDateFilter()">Filtrele</button>
            <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px;" onclick="Campaigns.clearDateFilter()">Temizle</button>
          </div>
          <div class="page-header-actions" style="display: flex; gap: 10px;">
            <button class="btn btn-outline" onclick="Campaigns.syncFromMeta()"><i class="ri-refresh-line"></i> Meta'dan Reklamları Çek</button>
            <button class="btn btn-primary" onclick="Campaigns.showForm()"><i class="ri-add-line"></i> Kampanya Ekle</button>
          </div>
        </div>
        <div class="stats-grid compact-stats">
          ${this.summary('ri-megaphone-line','Kampanya',this.items.length)}
          ${this.summary('ri-user-received-line','Toplam Kişi',totalLeads)}
          ${this.summary('ri-funds-box-line','Harcama',App.formatCurrency(totalSpent))}
          ${this.summary('ri-line-chart-line','Ciro (ROAS)', `${App.formatCurrency(totalRevenue)} <small>(${overallRoas}x)</small>`)}
        </div>
        <div class="data-table-container"><div class="data-table-wrapper"><table class="data-table"><thead><tr><th>Kampanya</th><th>Metrikler (Gösterim/Tık)</th><th>Bütçe / Harcama</th><th>Kişi / Randevu</th><th>Kişi Maliyeti</th><th>Ciro (ROAS)</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>
          ${this.items.length ? this.items.map(item => `<tr>
            <td>
              <strong><a href="#" onclick="Campaigns.showAdsModal(${item.id}); return false;" style="color: var(--primary-color); text-decoration: none;">${App.escape(item.name)}</a></strong>
              <small>ID: ${App.escape(item.meta_campaign_id || '-')}</small>
              <small>${App.formatDate(item.start_date)} - ${item.end_date ? App.formatDate(item.end_date) : 'Devam'}</small>
            </td>
            <td>Gösterim: <strong>${item.impressions?.toLocaleString('tr-TR')}</strong><br>Tıklama: <strong>${item.clicks?.toLocaleString('tr-TR')}</strong><br>Meta Lead: <strong>${item.meta_results}</strong></td>
            <td>Bütçe: ${App.formatCurrency(item.budget)}<br>Harcama: <strong>${App.formatCurrency(item.spent)}</strong></td>
            <td>CRM Lead: <strong>${item.lead_count}</strong><br>Randevu: <strong>${item.appointment_count}</strong></td>
            <td>${App.formatCurrency(item.cost_per_lead)}</td>
            <td><strong>${App.formatCurrency(item.total_revenue)}</strong><br><small style="color: ${item.roas > 2 ? 'var(--success-color)' : 'var(--text-muted)'}">${item.roas}x ROAS</small></td>
            <td>${App.statusBadge(item.status)}</td>
            <td class="actions">
              <button class="btn-icon" onclick="Campaigns.showForm(${item.id})" title="Düzenle"><i class="ri-pencil-line"></i></button>
              <button class="btn-icon danger" onclick="Campaigns.remove(${item.id})" title="Sil"><i class="ri-delete-bin-line"></i></button>
            </td>
          </tr>`).join('') : `<tr><td colspan="8">${App.emptyState('ri-megaphone-line', 'Kampanya bulunamadı')}</td></tr>`}
        </tbody></table></div></div>
      </div>`;
  },

  applyDateFilter() {
    this.startDate = document.getElementById('camp-start-date').value;
    this.endDate = document.getElementById('camp-end-date').value;
    this.render();
  },

  clearDateFilter() {
    this.startDate = '';
    this.endDate = '';
    this.render();
  },

  async showAdsModal(campaignId) {
    const campaign = this.items.find(c => c.id === campaignId);
    if (!campaign) return;
    App.showModal('Kampanya Detayı: ' + campaign.name, '<div style="padding: 20px; text-align: center;"><i class="ri-loader-4-line ri-spin" style="font-size: 24px;"></i><p>Reklam setleri yükleniyor...</p></div>');
    try {
      const data = await App.api('/api/campaigns/' + campaignId + '/ads');
      const { adsets, ads } = data;
      
      let html = `<div style="margin-bottom: 20px;">
        <h4 style="margin-bottom: 10px; color: var(--primary-color);">Reklam Setleri (Ad Sets)</h4>
        <div class="data-table-container"><table class="data-table" style="font-size: 13px;"><thead><tr><th>Ad Set Adı</th><th>Durum</th><th>Gösterim</th><th>Tıklama</th><th>Meta Sonuç</th><th>Harcama</th></tr></thead><tbody>
        ${adsets.length ? adsets.map(a => `<tr><td><strong>${App.escape(a.name)}</strong><small>ID: ${a.meta_adset_id}</small></td><td>${App.statusBadge(a.status)}</td><td>${a.impressions}</td><td>${a.clicks}</td><td>${a.meta_results}</td><td>${App.formatCurrency(a.spent)}</td></tr>`).join('') : '<tr><td colspan="6">Reklam seti bulunamadı.</td></tr>'}
        </tbody></table></div>
      </div>
      <div>
        <h4 style="margin-bottom: 10px; color: var(--primary-color);">Reklamlar (Ads)</h4>
        <div class="data-table-container"><table class="data-table" style="font-size: 13px;"><thead><tr><th>Reklam Adı</th><th>Durum</th><th>Gösterim</th><th>Tıklama</th><th>Meta Sonuç</th><th>Harcama</th></tr></thead><tbody>
        ${ads.length ? ads.map(a => `<tr><td><strong>${App.escape(a.name)}</strong><small>ID: ${a.meta_ad_id}</small></td><td>${App.statusBadge(a.status)}</td><td>${a.impressions}</td><td>${a.clicks}</td><td>${a.meta_results}</td><td>${App.formatCurrency(a.spent)}</td></tr>`).join('') : '<tr><td colspan="6">Reklam bulunamadı.</td></tr>'}
        </tbody></table></div>
      </div>`;
      
      document.getElementById('modal-body').innerHTML = html;
    } catch (err) {
      document.getElementById('modal-body').innerHTML = `<div class="form-error">${err.message}</div>`;
    }
  },

  async syncFromMeta() {
    const btn = document.querySelector('.page-header-actions .btn-outline');
    if (btn) btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Çekiliyor...';
    try {
      const result = await App.api('/api/meta/campaigns/sync', { method: 'POST' });
      App.notify(result.message || 'Kampanyalar senkronize edildi.', 'success');
      this.render();
    } catch (error) {
      App.notify(error.message || 'Meta Marketing API bağlantı hatası.', 'warning');
      this.showAdAccountModal();
    } finally {
      if (btn) btn.innerHTML = '<i class="ri-refresh-line"></i> Meta\'dan Reklamları Çek';
    }
  },

  showAdAccountModal() {
    App.showModal('Meta Reklam Hesabı Bağlantısı', `
      <form id="ad-account-form" class="form-grid">
        <div class="form-full" style="margin-bottom: 10px;">
          <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
            Meta Reklam Yöneticisi'ndeki (Ads Manager) aktif kampanyalarınızı otomatik çekmek için Meta Reklam Hesabı Kimliğinizi (Ad Account ID) girin.
          </p>
        </div>
        <div class="form-group form-full">
          <label>Meta Reklam Hesabı ID (Ad Account ID) *</label>
          <input name="adAccountId" required placeholder="Örn: 123456789012345 veya act_123456789012345" />
          <small style="font-size: 11px; color: var(--text-muted);">Meta Ads Manager panelindeki URL'de veya hesap adının altında yer alan numaradır.</small>
        </div>
        <div class="form-group form-full">
          <label>Meta Ads Access Token (İsteğe Bağlı)</label>
          <input name="adAccessToken" placeholder="EAA... ile başlayan Marketing API erişim tokenı (Varsa)" />
          <small style="font-size: 11px; color: var(--text-muted);">Boş bırakılırsa sistemdeki mevcut Meta tokenı kullanılır.</small>
        </div>
        <div class="modal-footer form-full">
          <button type="button" class="btn btn-outline" onclick="App.closeModal()">Vazgeç</button>
          <button class="btn btn-primary" type="submit"><i class="ri-refresh-line"></i> Bağla ve Kampanyaları Çek</button>
        </div>
      </form>`);

    document.getElementById('ad-account-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Bağlanıyor...';
      try {
        const payload = App.formToObject(form);
        const result = await App.api('/api/meta/ad-account', { method: 'POST', body: JSON.stringify(payload) });
        App.closeModal();
        App.notify(result.message || 'Kampanyalar başarıyla çekildi.', 'success');
        this.render();
      } catch (error) {
        App.notify(error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ri-refresh-line"></i> Bağla ve Kampanyaları Çek';
      }
    });
  },

  summary(icon,label,value) { return `<div class="stat-card"><div class="stat-card-icon"><i class="${icon}"></i></div><div class="stat-card-info"><div class="stat-card-label">${label}</div><div class="stat-card-value">${value}</div></div></div>`; },

  showForm(id = null) {
    const item = id ? this.items.find(row => row.id === id) || {} : {};
    App.showModal(id ? 'Kampanya Düzenle' : 'Yeni Kampanya', `
      <form id="campaign-form" class="form-grid">
        <div class="form-group form-full"><label>Kampanya Adı *</label><input name="name" required maxlength="180" value="${App.attr(item.name || '')}" placeholder="Burun Estetiği - Temmuz"></div>
        <div class="form-group"><label>Platform</label><select name="platform">${['Instagram','Facebook','Google','Diğer'].map(v => `<option ${item.platform === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label>Durum</label><select name="status"><option ${item.status !== 'Pasif' ? 'selected' : ''}>Aktif</option><option ${item.status === 'Pasif' ? 'selected' : ''}>Pasif</option></select></div>
        <div class="form-group"><label>Başlangıç</label><input name="startDate" type="date" value="${App.attr(item.start_date || '')}"></div>
        <div class="form-group"><label>Bitiş</label><input name="endDate" type="date" value="${App.attr(item.end_date || '')}"></div>
        <div class="form-group"><label>Bütçe (₺)</label><input name="budget" type="number" min="0" step="0.01" value="${App.attr(item.budget || 0)}"></div>
        <div class="form-group"><label>Harcama (₺)</label><input name="spent" type="number" min="0" step="0.01" value="${App.attr(item.spent || 0)}"></div>
        <div class="form-section-title form-full">Meta Eşleştirme Kimlikleri</div>
        <div class="form-group"><label>Campaign ID</label><input name="metaCampaignId" maxlength="100" value="${App.attr(item.meta_campaign_id || '')}"></div>
        <div class="form-group"><label>Ad Set ID</label><input name="metaAdsetId" maxlength="100" value="${App.attr(item.meta_adset_id || '')}"></div>
        <div class="form-group"><label>Ad ID</label><input name="metaAdId" maxlength="100" value="${App.attr(item.meta_ad_id || '')}"></div>
        <div class="form-group"><label>Kişi Form ID</label><input name="formId" maxlength="100" value="${App.attr(item.form_id || '')}"></div>
        <div class="modal-footer form-full"><button type="button" class="btn btn-outline" onclick="App.closeModal()">Vazgeç</button><button class="btn btn-primary" type="submit"><i class="ri-save-line"></i> Kaydet</button></div>
      </form>`);
    document.getElementById('campaign-form').addEventListener('submit', async event => {
      event.preventDefault();
      try { await App.api(id ? `/api/campaigns/${id}` : '/api/campaigns', { method: id ? 'PUT' : 'POST', body: JSON.stringify(App.formToObject(event.currentTarget)) }); App.closeModal(); App.notify('Kampanya kaydedildi.', 'success'); this.render(); }
      catch (error) { App.notify(error.message, 'error'); }
    });
  },

  async remove(id) {
    if (!App.confirm('Kampanya silinsin mi? Bağlı kişi ve randevular silinmez, kampanya bağlantıları kaldırılır.')) return;
    try { await App.api(`/api/campaigns/${id}`, { method: 'DELETE' }); App.notify('Kampanya silindi.', 'success'); this.render(); }
    catch (error) { App.notify(error.message, 'error'); }
  }
};
