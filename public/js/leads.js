'use strict';

window.Leads = {
  filters: { status: 'all', source: 'all', interest: 'all', search: '' },
  items: [],

  async render() {
    const params = new URLSearchParams();
    Object.entries(this.filters).forEach(([key, value]) => { if (value && value !== 'all') params.set(key, value); });
    const data = await App.api(`/api/leads?${params}`);
    this.items = data.items;
    const counts = this.items.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
    
    const uniqueInterests = [...new Set([
      'Burun Estetiği', 'Nefes Problemi', 'Revizyon Rinoplasti', 'Meme Estetiği', 'Vücut Şekillendirme', 'Botoks/Dolgu', 'Göz Kapağı Estetiği', 'Randevu', 'Fiyat Bilgisi',
      ...this.items.map(i => i.interest).filter(i => i && i !== '-')
    ])].sort();

    document.getElementById('page-content').innerHTML = `
      <div class="animate-fade-in">
        <div class="page-header">
          <div></div>
          <div class="page-header-actions">
            <button class="btn btn-outline" onclick="Leads.exportData()"><i class="ri-file-excel-2-line"></i> Excel İndir</button>
            <button class="btn btn-primary" onclick="Leads.showForm()"><i class="ri-add-line"></i> Yeni Kişi</button>
          </div>
        </div>
        <div class="stats-grid compact-stats">
          ${this.miniStat('İletişime Geçildi', counts['İletişime Geçildi'] || 0, 'ri-phone-line')}
          ${this.miniStat('Randevu Alındı', counts['Randevu Alındı'] || 0, 'ri-calendar-check-line')}
          ${this.miniStat('Ameliyat Oldu', counts['Ameliyat Oldu'] || 0, 'ri-heart-pulse-line')}
          ${this.miniStat('Kayıp', counts.Kayıp || 0, 'ri-user-unfollow-line')}
        </div>
    <div class="filter-bar">
      <div class="filter-group"><label>Durum</label><select id="lead-status-filter"><option value="all">Aktif Olanlar (Tümü)</option><option value="all_with_ilgisiz">Hepsi (İlgisiz Dahil)</option>${['Yeni','İletişime Geçildi','Randevu Alındı','Ameliyat Oldu','Kayıp', 'İlgisiz'].map(v => `<option ${this.filters.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="filter-group"><label>İşlem</label><select id="lead-interest-filter"><option value="all">Tümü</option>${uniqueInterests.map(v => `<option ${this.filters.interest === v ? 'selected' : ''}>${App.escape(v)}</option>`).join('')}</select></div>
      <div class="filter-group"><label>Kaynak</label><select id="lead-source-filter"><option value="all">Tümü</option>${['Instagram Formu','Instagram DM','Instagram Formu + Instagram DM','WhatsApp','Manuel','Telefon'].map(v => `<option ${this.filters.source === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="filter-group grow"><label>Ara</label><input id="lead-search" value="${App.attr(this.filters.search)}" placeholder="Ad, telefon, e-posta veya notlar"></div>
      <button class="btn btn-outline btn-sm filter-button" id="lead-filter-btn"><i class="ri-search-line"></i> Filtrele</button>
    </div>
    
    <div id="bulk-action-bar" style="display: none; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); padding: 10px 16px; border-radius: 8px; margin-bottom: 12px; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <i class="ri-checkbox-multiple-line" style="color: var(--primary-color);"></i>
        <span id="bulk-action-count" style="font-weight: 500; font-size: 13px;">0 kişi seçildi</span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <select id="bulk-status-select" class="form-control" style="width: 140px; height: 32px; padding: 0 8px; font-size: 13px;">
          <option value="">Durum Değiştir...</option>
          ${['Yeni','İletişime Geçildi','Randevu Alındı','Ameliyat Oldu','Kayıp', 'İlgisiz'].map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="Leads.bulkUpdateStatus()" style="height: 32px;"><i class="ri-check-line"></i> Uygula</button>
        <div style="width: 1px; height: 16px; background: rgba(255,255,255,0.1); margin: 0 4px;"></div>
        <button class="btn btn-outline btn-sm danger" onclick="Leads.bulkDelete()" style="height: 32px; border-color: rgba(239, 68, 68, 0.3); color: #ef4444;"><i class="ri-delete-bin-line"></i> Seçilenleri Sil</button>
      </div>
    </div>

    <div class="data-table-container"><div class="data-table-wrapper"><table class="data-table"><thead><tr><th style="width: 40px; text-align: center;"><input type="checkbox" id="bulk-select-all" onclick="Leads.toggleBulkSelectAll(this)"></th><th>Kişi</th><th>İletişim</th><th>İlgilendiği İşlem</th><th>Kaynak</th><th>Kampanya</th><th>Durum</th><th style="text-align: right; padding-right: 20px;">İşlemler</th></tr></thead><tbody>
          ${this.items.length ? this.items.map(item => this.row(item)).join('') : `<tr><td colspan="7">${App.emptyState('ri-user-search-line', 'Kriterlere uygun kişi bulunamadı', 'Meta entegrasyonunu test sayfasından simüle edebilirsiniz.')}</td></tr>`}
        </tbody></table></div></div>
      </div>`;
    document.getElementById('lead-filter-btn').addEventListener('click', () => this.applyFilters());
    document.getElementById('lead-search').addEventListener('keydown', event => { if (event.key === 'Enter') this.applyFilters(); });
  },

  miniStat(label, value, icon) {
    return `<div class="stat-card"><div class="stat-card-icon"><i class="${icon}"></i></div><div class="stat-card-info"><div class="stat-card-label">${label}</div><div class="stat-card-value">${value}</div></div></div>`;
  },

  row(item) {
    return `<tr>
      <td style="text-align: center;"><input type="checkbox" class="bulk-row-check" value="${item.id}" onclick="event.stopPropagation(); Leads.updateBulkCount()"></td>
      <td class="clickable-cell" onclick="Leads.showDetail(${item.id})"><strong>${App.escape(item.full_name)}</strong><small>#${item.id} · ${App.formatRelative(item.created_at)}</small></td>
      <td class="truncate-cell"><span>${App.escape(App.formatPhone(item.phone))}</span><small class="truncate-cell">${App.escape(item.email || '')}</small></td>
      <td class="truncate-cell" title="${App.escape(item.interest || '')}">${App.escape(item.interest || '-')}</td>
      <td>${App.sourceBadge(item.source)}</td>
      <td class="truncate-cell" title="${App.escape(item.campaign_name || '')}">${App.escape(item.campaign_name || '-')}</td>
      <td><select class="inline-select" onclick="event.stopPropagation()" onchange="Leads.quickStatus(${item.id}, this.value)">${['Yeni','İletişime Geçildi','Randevu Alındı','Ameliyat Oldu','Kayıp', 'İlgisiz'].map(v => `<option ${item.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td class="actions" style="text-align: right; padding-right: 20px;">
        <select class="inline-select" style="width: 140px; font-weight: 500;" onclick="event.stopPropagation()" onchange="Leads.handleAction(${item.id}, this.value, '${App.escape(item.full_name)}', '${App.escape(item.phone || '')}', '${App.escape(item.email || '')}'); this.value=''">
          <option value="">Hızlı İşlem...</option>
          <option value="patient">➕ Hastaya Çevir</option>
          <option value="appointment">📅 Randevu Ver</option>
          <option value="edit">✏️ Düzenle</option>
          <option value="delete">🗑️ Sil</option>
        </select>
      </td>
    </tr>`;
  },

  toggleBulkSelectAll(el) {
    const checks = document.querySelectorAll('.bulk-row-check');
    checks.forEach(c => c.checked = el.checked);
    this.updateBulkCount();
  },

  updateBulkCount() {
    const count = document.querySelectorAll('.bulk-row-check:checked').length;
    const bar = document.getElementById('bulk-action-bar');
    const label = document.getElementById('bulk-action-count');
    if (bar && label) {
      bar.style.display = count > 0 ? 'flex' : 'none';
      label.textContent = `${count} kişi seçildi`;
    }
  },

  getBulkIds() {
    return Array.from(document.querySelectorAll('.bulk-row-check:checked')).map(c => Number(c.value));
  },

  async bulkUpdateStatus() {
    const ids = this.getBulkIds();
    if (!ids.length) return;
    const status = document.getElementById('bulk-status-select').value;
    if (!status) return App.showNotification('Lütfen bir durum seçin', 'warning');
    
    try {
      await App.api('/api/leads/bulk', { method: 'POST', body: JSON.stringify({ action: 'status', ids, status }) });
      App.showNotification(`${ids.length} kişinin durumu güncellendi`, 'success');
      this.render();
    } catch (e) {
      App.showNotification('Hata: ' + e.message, 'error');
    }
  },

  async bulkDelete() {
    const ids = this.getBulkIds();
    if (!ids.length) return;
    if (!confirm(`Seçilen ${ids.length} kişiyi kalıcı olarak silmek istediğinize emin misiniz?`)) return;
    
    try {
      await App.api('/api/leads/bulk', { method: 'POST', body: JSON.stringify({ action: 'delete', ids }) });
      App.showNotification(`${ids.length} kişi silindi`, 'success');
      this.render();
    } catch (e) {
      App.showNotification('Hata: ' + e.message, 'error');
    }
  },

  handleAction(id, action, fullName, phone, email) {
    if (!action) return;
    if (action === 'patient') {
      App.navigate('patients');
      setTimeout(() => Patients.openNewPatientModal(id, { full_name: fullName, phone: phone, email: email }), 250);
    } else if (action === 'appointment') {
      App.navigate('appointments');
      setTimeout(() => Appointments.showForm(null, id), 250);
    } else if (action === 'edit') {
      this.showForm(id);
    } else if (action === 'delete') {
      this.remove(id);
    }
  },

  applyFilters() {
    this.filters.status = document.getElementById('lead-status-filter').value;
    this.filters.source = document.getElementById('lead-source-filter').value;
    this.filters.interest = document.getElementById('lead-interest-filter').value;
    this.filters.search = document.getElementById('lead-search').value.trim();
    this.render();
  },

  async showForm(id = null) {
    const [campaigns, detail] = await Promise.all([
      App.api('/api/campaigns'),
      id ? App.api(`/api/leads/${id}`) : Promise.resolve(null)
    ]);
    const lead = detail || {};
    
    const standardProcs = ['Botoks', 'Dolgu', 'Lazer Epilasyon', 'Cilt Bakımı', 'Göz Kapağı Estetiği', 'Diğer'];
    const currentProc = lead.interest || '';
    let selectProcValue = standardProcs.includes(currentProc) ? currentProc : (currentProc ? 'Diğer' : '');
    const isCustomProc = selectProcValue === 'Diğer' && currentProc !== 'Diğer';

    App.showModal(id ? 'Kişi Düzenle' : 'Yeni Kişi Ekle', `
      <form id="lead-form" class="form-grid">
        <div class="form-group form-full"><label>Ad Soyad *</label><input name="fullName" required maxlength="150" value="${App.attr(lead.full_name || '')}"></div>
        <div class="form-group">
          <label>Telefon</label>
          <input name="phone" id="lead-phone-input" maxlength="20" value="${App.attr(lead.phone || '')}" placeholder="Örn: 05xxxxxxxxx">
          <small id="lead-phone-error" class="text-danger hidden" style="display:block; margin-top:4px; font-size:11px;">Lütfen 10 veya 11 haneli telefon numarası girin.</small>
        </div>
        <div class="form-group"><label>E-posta</label><input name="email" type="email" maxlength="150" value="${App.attr(lead.email || '')}"></div>
        
        <div class="form-group">
          <label>İlgilendiği İşlem</label>
          <select id="lead-procedure-select" onchange="const o=document.getElementById('lead-procedure-other'); if(this.value==='Diğer'){o.classList.remove('hidden');o.required=true}else{o.classList.add('hidden');o.required=false;o.value=''}">
        <option value="">Seçiniz</option>
        <option value="Burun Estetiği" ${selectProcValue === 'Burun Estetiği' ? 'selected' : ''}>Burun Estetiği</option>
        <option value="Revizyon Rinoplasti" ${selectProcValue === 'Revizyon Rinoplasti' ? 'selected' : ''}>Revizyon Rinoplasti</option>
        <option value="Nefes Problemi" ${selectProcValue === 'Nefes Problemi' ? 'selected' : ''}>Nefes Problemi</option>
        <option value="Botoks" ${selectProcValue === 'Botoks' ? 'selected' : ''}>Botoks</option>
        <option value="Dolgu" ${selectProcValue === 'Dolgu' ? 'selected' : ''}>Dolgu</option>
        <option value="Diğer" ${selectProcValue === 'Diğer' ? 'selected' : ''}>Diğer</option>
      </select>
          <input type="text" id="lead-procedure-other" class="${isCustomProc ? '' : 'hidden'}" placeholder="Lütfen işlemi yazın..." maxlength="150" style="margin-top: 8px;" value="${isCustomProc ? App.attr(currentProc) : ''}">
        </div>

        <div class="form-group">
          <label>Kaynak</label>
          <select name="source">
            ${['Instagram', 'Diğer'].map(s => {
              const src = lead.source || 'Diğer';
              let isSelected = false;
              if (s === 'Instagram' && src.toLowerCase().includes('instagram')) isSelected = true;
              else if (s === 'Diğer' && !src.toLowerCase().includes('instagram')) isSelected = true;
              return '<option value="' + s + '" ' + (isSelected ? 'selected' : '') + '>' + s + '</option>';
            }).join('')}
          </select>
        </div>

        <div class="form-group"><label>Durum</label><select name="status">${['Yeni','İletişime Geçildi','Randevu Alındı','Ameliyat Oldu','Kayıp', 'İlgisiz'].map(v => `<option ${lead.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label>Kampanya</label><select name="campaignId"><option value="">Kampanya yok</option>${campaigns.items.map(c => `<option value="${c.id}" ${Number(lead.campaign_id) === c.id ? 'selected' : ''}>${App.escape(c.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Açık Rıza / İzin</label><input name="consentStatus" maxlength="100" value="${App.attr(lead.consent_status || 'Belirtilmedi')}"></div>
        <div class="form-group form-full"><label>Notlar</label><textarea name="notes" rows="4" maxlength="3000">${App.escape(lead.notes || '')}</textarea></div>
        <div class="modal-footer form-full"><button type="button" class="btn btn-outline" onclick="App.closeModal()">Vazgeç</button><button class="btn btn-primary" type="submit"><i class="ri-save-line"></i> Kaydet</button></div>
      </form>`);

    const procedureSelect = document.getElementById('lead-procedure-select');
    const procedureOther = document.getElementById('lead-procedure-other');
    if (procedureSelect && procedureOther) {
      procedureSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Diğer') {
          procedureOther.classList.remove('hidden');
          procedureOther.required = true;
        } else {
          procedureOther.classList.add('hidden');
          procedureOther.required = false;
          procedureOther.value = '';
        }
      });
    }

    const phoneInput = document.getElementById('lead-phone-input');
    const phoneError = document.getElementById('lead-phone-error');
    if (phoneInput) {
      phoneInput.addEventListener('input', e => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        if (val.length > 0 && (val.length < 10 || val.length > 11)) {
          e.target.style.borderColor = 'var(--danger)';
          if (phoneError) phoneError.classList.remove('hidden');
        } else {
          e.target.style.borderColor = '';
          if (phoneError) phoneError.classList.add('hidden');
        }
      });
    }

    document.getElementById('lead-form').addEventListener('submit', async event => {
      event.preventDefault();
      
      const form = event.currentTarget;
      const phoneInput = form.elements.phone.value.replace(/[^0-9]/g, '');
      if (phoneInput && (phoneInput.length < 10 || phoneInput.length > 11)) {
        const errorEl = document.getElementById('lead-phone-error');
        if (errorEl) errorEl.classList.remove('hidden');
        return;
      }
      const errorEl = document.getElementById('lead-phone-error');
      if (errorEl) errorEl.classList.add('hidden');

      const payload = App.formToObject(form);
      
      const procVal = procedureSelect ? procedureSelect.value : '';
      if (procVal === 'Diğer') {
        payload.interest = procedureOther ? procedureOther.value.trim() : '';
      } else {
        payload.interest = procVal;
      }

      try {
        const result = await App.api(id ? `/api/leads/${id}` : '/api/leads', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        App.closeModal();
        App.notify(result.merged ? 'Aynı kişi bulundu; bilgiler tek kayıtta birleştirildi.' : 'Kişi kaydedildi.', 'success');
        this.render();
      } catch (error) { App.notify(error.message, 'error'); }
    });
  },

  async showDetail(id) {
    const lead = await App.api(`/api/leads/${id}`);
    App.showModal(lead.full_name, `
      <div class="lead-detail-grid">
        <div class="detail-card"><span>Telefon</span><strong>${App.escape(lead.phone || '-')}</strong></div>
        <div class="detail-card"><span>E-posta</span><strong>${App.escape(lead.email || '-')}</strong></div>
        <div class="detail-card"><span>İlgi</span><strong>${App.escape(lead.interest || '-')}</strong></div>
        <div class="detail-card"><span>Kaynak</span><strong>${App.escape(lead.source)}</strong></div>
        <div class="detail-card"><span>Kampanya</span><strong>${App.escape(lead.campaign_name || '-')}</strong></div>
        <div class="detail-card"><span>Durum</span><strong>${App.escape(lead.status)}</strong></div>
      </div>
      ${lead.first_message ? `<div class="note-panel"><h4>İlk Mesaj</h4><p>${App.escape(lead.first_message)}</p></div>` : ''}
      ${lead.notes ? `<div class="note-panel"><h4>Notlar</h4><p>${App.escape(lead.notes).replace(/\n/g, '<br>')}</p></div>` : ''}
      <div class="timeline"><h4>İletişim Geçmişi</h4>${lead.activities.length ? lead.activities.map(activity => `<div class="timeline-item"><i class="ri-checkbox-blank-circle-fill"></i><div><strong>${App.escape(activity.title)}</strong><p>${App.escape(activity.detail || '')}</p><small>${App.formatDate(activity.created_at, true)}</small></div></div>`).join('') : '<p class="text-muted">Henüz hareket yok.</p>'}</div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="App.closeModal()">Kapat</button>
        <button class="btn btn-primary" onclick="App.closeModal(); Leads.showForm(${id})"><i class="ri-pencil-line"></i> Düzenle</button>
        <button class="btn btn-info" onclick="App.closeModal(); Leads.showReminderForm(${id}, '${App.escape(lead.full_name)}')"><i class="ri-notification-3-line"></i> Hatırlatıcı Ekle</button>
        <button class="btn btn-warning" onclick="App.closeModal(); App.navigate('patients'); setTimeout(() => Patients.openNewPatientModal(${id}, { full_name: '${App.escape(lead.full_name)}', phone: '${App.escape(lead.phone || '')}', email: '${App.escape(lead.email || '')}' }), 250)"><i class="ri-user-add-line"></i> Hastaya Çevir</button>
        <button class="btn btn-success" onclick="App.closeModal(); App.navigate('appointments'); setTimeout(() => Appointments.showForm(null, ${id}), 250)"><i class="ri-calendar-add-line"></i> Randevu Oluştur</button>
      </div>
    `, { wide: true });
  },

  showReminderForm(leadId, leadName) {
    App.showModal('Hatırlatıcı Ekle', `
      <form id="reminder-form" class="form-grid">
        <div class="form-group form-full">
          <label>Kişi</label>
          <input type="text" value="${App.attr(leadName)}" disabled>
        </div>
        <div class="form-group form-full">
          <label>Görev Başlığı / Konu *</label>
          <input name="title" required maxlength="255" placeholder="Örn: Hafta sonu tekrar aranacak">
        </div>
        <div class="form-group form-full">
          <label>Hatırlatma Tarihi ve Saati</label>
          <input name="due_date" type="datetime-local">
        </div>
        <div class="modal-footer form-full">
          <button type="button" class="btn btn-outline" onclick="App.closeModal()">Vazgeç</button>
          <button class="btn btn-primary" type="submit"><i class="ri-save-line"></i> Kaydet</button>
        </div>
      </form>
    `);

    document.getElementById('reminder-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = App.formToObject(form);
      payload.lead_id = leadId;
      try {
        await App.api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
        App.closeModal();
        App.notify('Hatırlatıcı başarıyla eklendi.', 'success');
      } catch (error) {
        App.notify(error.message, 'error');
      }
    });
  },

  exportData() {
    const columns = [
      { key: 'id', label: 'ID' },
      { key: 'full_name', label: 'Ad Soyad' },
      { key: 'phone', label: 'Telefon' },
      { key: 'email', label: 'E-posta' },
      { key: 'interest', label: 'İlgilendiği İşlem' },
      { key: 'source', label: 'Kaynak' },
      { key: 'status', label: 'Durum' },
      { key: 'campaign_name', label: 'Kampanya' },
      { key: 'created_at', label: 'Oluşturulma Tarihi', value: r => App.formatDate(r.created_at, true) }
    ];
    App.exportToCsv('Kişiler', columns, this.items);
  },

  async quickStatus(id, status) {
    const lead = this.items.find(item => item.id === id);
    if (!lead) return;
    try {
      await App.api(`/api/leads/${id}`, { method: 'PUT', body: JSON.stringify({
        fullName: lead.full_name, phone: lead.phone, email: lead.email, interest: lead.interest,
        source: lead.source, status, campaignId: lead.campaign_id, consentStatus: lead.consent_status, notes: lead.notes
      }) });
      lead.status = status;
      App.notify('Kişi durumu güncellendi.', 'success');
      App.refreshNavCounters();
    } catch (error) { App.notify(error.message, 'error'); this.render(); }
  },

  async remove(id) {
    if (!App.confirm('Bu kişi ve bağlı konuşma geçmişi silinsin mi?')) return;
    try { await App.api(`/api/leads/${id}`, { method: 'DELETE' }); App.notify('Kişi silindi.', 'success'); this.render(); }
    catch (error) { App.notify(error.message, 'error'); }
  }
};
