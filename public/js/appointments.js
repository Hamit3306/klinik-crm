'use strict';

window.Appointments = {
  filters: { status: 'all', search: '' },
  items: [],

  async render() {
    const params = new URLSearchParams();
    if (this.filters.status !== 'all') params.set('status', this.filters.status);
    if (this.filters.search) params.set('search', this.filters.search);
    const data = await App.api(`/api/appointments?${params}`);
    this.items = data.items;
    document.getElementById('page-content').innerHTML = `
      <div class="animate-fade-in">
        <div class="page-header"><div></div><div class="page-header-actions"><button class="btn btn-primary" onclick="Appointments.showForm()"><i class="ri-calendar-add-line"></i> Yeni Randevu</button></div></div>
        <div class="filter-bar"><div class="filter-group"><label>Durum</label><select id="appointment-status-filter"><option value="all">Tümü</option>${['Bekliyor','Onaylandı','Tamamlandı','İptal'].map(v => `<option ${this.filters.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="filter-group grow"><label>Ara</label><input id="appointment-search" value="${App.attr(this.filters.search)}" placeholder="Hasta, telefon veya işlem"></div><button id="appointment-filter-btn" class="btn btn-outline btn-sm filter-button"><i class="ri-search-line"></i> Filtrele</button></div>
        <div class="data-table-container"><div class="data-table-wrapper"><table class="data-table"><thead><tr><th>Hasta</th><th>İşlem</th><th>Tarih</th><th>Saat</th><th>Kaynak</th><th>Kampanya</th><th>Durum</th><th>Not</th><th>İşlem</th></tr></thead><tbody>
          ${this.items.length ? this.items.map(item => `<tr><td><strong>${App.escape(item.patient_name)}</strong><small>${App.escape(item.phone || '')}</small></td><td>${App.escape(item.procedure)}</td><td>${App.formatDate(item.appointment_date)}</td><td>${App.escape(item.appointment_time)}</td><td>${App.sourceBadge(item.source)}</td><td>${App.escape(item.campaign_name || '-')}</td><td>${App.statusBadge(item.status)}</td><td class="truncate-cell">${App.escape(item.notes || '-')}</td><td class="actions"><button class="btn-icon" onclick="Appointments.showForm(${item.id})"><i class="ri-pencil-line"></i></button><button class="btn-icon danger" onclick="Appointments.remove(${item.id})"><i class="ri-delete-bin-line"></i></button></td></tr>`).join('') : `<tr><td colspan="9">${App.emptyState('ri-calendar-line', 'Randevu bulunamadı')}</td></tr>`}
        </tbody></table></div></div>
      </div>`;
    document.getElementById('appointment-filter-btn').addEventListener('click', () => this.applyFilters());
    document.getElementById('appointment-search').addEventListener('keydown', event => { if (event.key === 'Enter') this.applyFilters(); });
  },

  applyFilters() {
    this.filters.status = document.getElementById('appointment-status-filter').value;
    this.filters.search = document.getElementById('appointment-search').value.trim();
    this.render();
  },

  async showForm(id = null, leadIdPreset = null) {
    const [campaigns, leads] = await Promise.all([App.api('/api/campaigns'), App.api('/api/leads')]);
    const item = id ? this.items.find(row => row.id === id) || {} : {};
    const leadId = leadIdPreset || item.lead_id || '';
    const selectedLead = leads.items.find(lead => lead.id === Number(leadId));
    const procOptions = ['Burun Estetiği', 'Dudak Dolgusu', 'Botoks', 'Sıvı Yüz Germe', 'Mezoterapi', 'Kapalı Teknik Rinoplasti', 'Burun Eğriliği (Septoplasti)', 'Kepçe Kulak Estetiği', 'Göz Kapağı Estetiği', 'KBB Tedavileri', 'Diğer'];
    const currentProc = item.procedure || selectedLead?.interest || 'Burun Estetiği';
    const isCustomProc = currentProc && !procOptions.includes(currentProc);
    const selectProcValue = isCustomProc ? 'Diğer' : currentProc;

    App.showModal(id ? 'Randevu Düzenle' : 'Yeni Randevu', `
      <form id="appointment-form" class="form-grid">
        <div class="form-group form-full"><label>Kişi / Hasta Kaydı</label><select name="leadId" id="appointment-lead"><option value="">Manuel hasta</option>${leads.items.map(lead => `<option value="${lead.id}" ${Number(leadId) === lead.id ? 'selected' : ''}>${App.escape(lead.full_name)} — ${App.escape(lead.phone || lead.email || '')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Hasta Adı *</label><input name="patientName" required maxlength="150" value="${App.attr(item.patient_name || selectedLead?.full_name || '')}"></div>
        <div class="form-group">
          <label>Telefon</label>
          <input name="phone" id="phone-input" maxlength="20" value="${App.attr(item.phone || selectedLead?.phone || '')}" placeholder="Örn: 05xxxxxxxxx">
          <small id="phone-error" class="text-danger hidden" style="display:block; margin-top:4px; font-size:11px;">Lütfen 10 veya 11 haneli telefon numarası girin.</small>
        </div>
        <div class="form-group">
          <label>İşlem *</label>
          <select name="procedure" id="procedure-select" required>
            ${procOptions.map(p => 
              `<option value="${p}" ${selectProcValue === p ? 'selected' : ''}>${p}</option>`
            ).join('')}
          </select>
          <input type="text" id="procedure-other" class="${isCustomProc ? '' : 'hidden'}" placeholder="Lütfen işlemi yazın..." maxlength="150" style="margin-top: 8px;" value="${isCustomProc ? App.attr(currentProc) : ''}" ${isCustomProc ? 'required' : ''}>
        </div>
        <div class="form-group"><label>Durum</label><select name="status">${['Bekliyor','Onaylandı','Tamamlandı','İptal'].map(v => `<option ${item.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label>Tarih *</label><input name="date" type="date" required value="${App.attr(item.appointment_date || '')}"></div>
        <div class="form-group">
          <label>Saat *</label>
          <select name="time" required>
            <option value="">Saat Seçin</option>
            ${['09:00','09:15','09:30','09:45','10:00','10:15','10:30','10:45','11:00','11:15','11:30','11:45','12:00','12:15','12:30','12:45','13:00','13:15','13:30','13:45','14:00','14:15','14:30','14:45','15:00','15:15','15:30','15:45','16:00','16:15','16:30','16:45','17:00','17:15','17:30','17:45','18:00'].map(t => 
              `<option value="${t}" ${item.appointment_time === t ? 'selected' : ''}>${t}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Kaynak</label>
          <select name="source">
            ${['Instagram', 'WhatsApp', 'Diğer'].map(s => {
              const src = item.source || selectedLead?.source || 'Diğer';
              let isSelected = false;
              if (s === 'Instagram' && src.toLowerCase().includes('instagram')) isSelected = true;
              else if (s === 'WhatsApp' && src.toLowerCase().includes('whatsapp')) isSelected = true;
              else if (s === 'Diğer' && !src.toLowerCase().includes('instagram') && !src.toLowerCase().includes('whatsapp')) isSelected = true;
              return '<option value="' + s + '" ' + (isSelected ? 'selected' : '') + '>' + s + '</option>';
            }).join('')}
          </select>
        </div>
        <div class="form-group"><label>Kampanya</label><select name="campaignId"><option value="">Kampanya yok</option>${campaigns.items.map(c => `<option value="${c.id}" ${Number(item.campaign_id || selectedLead?.campaign_id) === c.id ? 'selected' : ''}>${App.escape(c.name)}</option>`).join('')}</select></div>
        <div class="form-group form-full"><label>Notlar</label><textarea name="notes" rows="3" maxlength="2000">${App.escape(item.notes || '')}</textarea></div>
        <div class="modal-footer form-full"><button type="button" class="btn btn-outline" onclick="App.closeModal()">Vazgeç</button><button class="btn btn-primary" type="submit"><i class="ri-save-line"></i> Kaydet</button></div>
      </form>`);
    document.getElementById('appointment-lead').addEventListener('change', event => {
      const lead = leads.items.find(row => row.id === Number(event.target.value));
      if (!lead) return;
      const form = document.getElementById('appointment-form');
      form.elements.patientName.value = lead.full_name || '';
      form.elements.phone.value = lead.phone || '';
      form.elements.procedure.value = lead.interest || 'Burun Estetiği';
      
      const incomingSource = lead.source || 'Diğer';
      if (incomingSource.toLowerCase().includes('instagram')) {
        form.elements.source.value = 'Instagram';
      } else {
        form.elements.source.value = 'Diğer';
      }
      
      form.elements.campaignId.value = lead.campaign_id || '';
    });
    const procedureSelect = document.getElementById('procedure-select');
    const procedureOther = document.getElementById('procedure-other');
    if (procedureSelect && procedureOther) {
      procedureSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Diğer') {
          procedureOther.classList.remove('hidden');
          procedureOther.required = true;
          procedureOther.focus();
        } else {
          procedureOther.classList.add('hidden');
          procedureOther.required = false;
        }
      });
    }

    const phoneInput = document.getElementById('phone-input');
    const phoneError = document.getElementById('phone-error');
    if (phoneInput) {
      phoneInput.addEventListener('input', e => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        if (val.length > 0 && (val.length < 10 || val.length > 11)) {
          e.target.style.borderColor = 'var(--danger)';
          phoneError.classList.remove('hidden');
        } else {
          e.target.style.borderColor = '';
          phoneError.classList.add('hidden');
        }
      });
    }

    document.getElementById('appointment-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      
      // Telefon hane sayısı kontrolü (Sadece rakamları sayar)
      if (form.elements.phone && form.elements.phone.value.trim() !== '') {
        const digitsOnly = form.elements.phone.value.replace(/[^0-9]/g, '');
        if (digitsOnly.length < 10 || digitsOnly.length > 11) {
          App.notify('Lütfen geçerli uzunlukta bir telefon numarası girin (10 veya 11 hane).', 'error');
          form.elements.phone.focus();
          return;
        }
      }

      const payload = App.formToObject(form);
      if (payload.procedure === 'Diğer') {
        const otherVal = document.getElementById('procedure-other').value.trim();
        if (otherVal) payload.procedure = otherVal;
      }

      try { 
        await App.api(id ? `/api/appointments/${id}` : '/api/appointments', { 
          method: id ? 'PUT' : 'POST', 
          body: JSON.stringify(payload) 
        }); 
        App.closeModal(); 
        App.notify('Randevu kaydedildi.', 'success'); 
        this.render(); 
      }
      catch (error) { App.notify(error.message, 'error'); }
    });
  },

  async remove(id) {
    if (!App.confirm('Randevu silinsin mi?')) return;
    try { await App.api(`/api/appointments/${id}`, { method: 'DELETE' }); App.notify('Randevu silindi.', 'success'); this.render(); }
    catch (error) { App.notify(error.message, 'error'); }
  }
};
