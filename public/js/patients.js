'use strict';

window.Patients = {
  async render(force = false) {
    document.getElementById('page-content').innerHTML = `
      <div class="animate-fade-in">
        <div class="page-header">
          <h2>Hastalar (HBYS)</h2>
          <div class="page-header-actions" style="display: flex; gap: 10px;">
            <div class="search-box">
              <i class="ri-search-line"></i>
              <input type="text" id="patient-search" placeholder="İsim, TC veya Telefon ara...">
            </div>
            <button class="btn btn-outline" onclick="Patients.exportData()"><i class="ri-file-excel-2-line"></i> Excel İndir</button>
            <button class="btn btn-primary" onclick="Patients.openNewPatientModal()">
              <i class="ri-add-line"></i> Yeni Hasta
            </button>
          </div>
        </div>
        
        <div class="data-table-container">
          <div class="data-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>TC Kimlik</th>
                  <th>Ad Soyad</th>
                  <th>Telefon</th>
                  <th>Kayıt Tarihi</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody id="patients-table-body">
                <tr><td colspan="5" style="text-align: center;">Yükleniyor...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    await this.loadPatients();
    
    let searchTimeout;
    const searchInput = document.getElementById('patient-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.loadPatients(searchInput.value);
        }, 500);
      });
    }
  },

  async loadPatients(search = '') {
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const patients = await App.api(`/api/patients${query}`);
      
      const tbody = document.getElementById('patients-table-body');
      if (!tbody) return;
      
      if (patients.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">Hasta bulunamadı.</td></tr>`;
        return;
      }
      
      tbody.innerHTML = patients.map(p => `
        <tr class="clickable-row" onclick="Patients.openPatientDetail(${p.id})">
          <td>${App.escape(p.tc_kimlik_no || '-')}</td>
          <td style="font-weight: 500;">${App.escape(p.full_name)}</td>
          <td>${App.escape(p.phone || '-')}</td>
          <td>${App.formatDate(p.created_at)}</td>
          <td style="text-align: right;">
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Patients.openPatientDetail(${p.id})">Detay</button>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      App.notify(error.message, 'error');
    }
  },

  openNewPatientModal(leadId = null, leadData = null) {
    const data = leadData || {};
    const content = `
      <form id="new-patient-form" class="form-grid" onsubmit="Patients.saveNewPatient(event, ${leadId})">
        <div class="form-group form-full">
          <label>Ad Soyad *</label>
          <input type="text" id="p-name" value="${App.attr(data.full_name || '')}" required>
        </div>
        <div class="form-group">
          <label>TC Kimlik No</label>
          <input type="text" id="p-tc" maxlength="11" oninput="Patients.validateTc()">
          <small id="p-tc-error" class="text-danger" style="display:none; margin-top:4px; font-size:11px; color: #ef4444;">Lütfen tam 11 haneli TC Kimlik girin.</small>
        </div>
        <div class="form-group">
          <label>Telefon</label>
          <input type="text" id="p-phone" placeholder="Örn: 05xxxxxxxxx" maxlength="20" oninput="Patients.validatePhone()" value="${App.attr(data.phone || '')}">
          <small id="p-phone-error" class="text-danger" style="display:none; margin-top:4px; font-size:11px; color: #ef4444;">Lütfen 10 veya 11 haneli telefon numarası girin.</small>
        </div>
        <div class="form-group">
          <label>E-posta</label>
          <input type="email" id="p-email" value="${App.attr(data.email || '')}">
        </div>
        <div class="form-group">
          <label>Doğum Tarihi</label>
          <input type="date" id="p-dob">
        </div>
        <div class="form-group">
          <label>Cinsiyet</label>
          <select id="p-gender">
            <option value="">Seçiniz</option>
            <option value="Kadın">Kadın</option>
            <option value="Erkek">Erkek</option>
          </select>
        </div>
        <div class="form-group form-full">
          <label>Alerjiler / Kronik Hastalıklar <small style="color: var(--text-secondary); font-weight: normal; font-size: 11px;">(Birden fazla seçebilirsiniz)</small></label>
          <div style="border: 1px solid var(--border-color); border-radius: 8px; height: 140px; overflow-y: auto; padding: 12px; background: var(--bg-primary); display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Yok (Bilinen rahatsızlığı yok)" onchange="Patients.handleHealthChange(this)" checked> Yok (Bilinen rahatsızlığı yok)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Diyabet (Şeker)" onchange="Patients.handleHealthChange(this)"> Diyabet (Şeker)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Hipertansiyon (Tansiyon)" onchange="Patients.handleHealthChange(this)"> Hipertansiyon (Tansiyon)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Kalp Hastalığı" onchange="Patients.handleHealthChange(this)"> Kalp Hastalığı
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Astım / KOAH" onchange="Patients.handleHealthChange(this)"> Astım / KOAH
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Tiroid Bozuklukları" onchange="Patients.handleHealthChange(this)"> Tiroid Bozuklukları
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Penisilin Alerjisi" onchange="Patients.handleHealthChange(this)"> Penisilin Alerjisi
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Lokal Anestezi Alerjisi" onchange="Patients.handleHealthChange(this)"> Lokal Anestezi Alerjisi
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Ağrı Kesici Alerjisi" onchange="Patients.handleHealthChange(this)"> Ağrı Kesici Alerjisi
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Kanama Bozukluğu" onchange="Patients.handleHealthChange(this)"> Kanama Bozukluğu
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Epilepsi (Sara)" onchange="Patients.handleHealthChange(this)"> Epilepsi (Sara)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; margin:0;">
              <input type="checkbox" class="health-cb" style="width: auto !important; margin: 0;" value="Diğer" onchange="Patients.handleHealthChange(this)"> Diğer...
            </label>
          </div>
          <input type="text" id="p-health-other" placeholder="Lütfen diğer rahatsızlıkları yazınız..." style="display: none; margin-top: 8px;">
        </div>
        <div class="form-group form-full" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
          <button type="button" class="btn btn-outline" onclick="App.closeModal()">İptal</button>
          <button type="submit" class="btn btn-primary">Kaydet</button>
        </div>
      </form>
    `;
    App.showModal('Yeni Hasta Kaydı', content, { wide: true });
  },

  handleHealthChange(checkbox) {
    const checkboxes = document.querySelectorAll('.health-cb');
    const isYok = checkbox.value.includes('Yok');
    
    if (isYok && checkbox.checked) {
      checkboxes.forEach(cb => {
        if (!cb.value.includes('Yok')) cb.checked = false;
      });
    } else if (!isYok && checkbox.checked) {
      checkboxes.forEach(cb => {
        if (cb.value.includes('Yok')) cb.checked = false;
      });
    }
    
    // Check if everything is unchecked, then check 'Yok' by default
    const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
    if (!anyChecked) {
      checkboxes.forEach(cb => {
        if (cb.value.includes('Yok')) cb.checked = true;
      });
    }

    // Handle 'Diğer' text input visibility
    const otherCheckbox = Array.from(checkboxes).find(cb => cb.value === 'Diğer');
    const otherInput = document.getElementById('p-health-other');
    if (otherCheckbox && otherInput) {
      if (otherCheckbox.checked) {
        otherInput.style.display = 'block';
        if (checkbox.value === 'Diğer') otherInput.focus();
      } else {
        otherInput.style.display = 'none';
        otherInput.value = '';
      }
    }
  },

  validateTc() {
    const tcInput = document.getElementById('p-tc');
    const tcError = document.getElementById('p-tc-error');
    if (!tcInput || !tcError) return true;
    
    let tcVal = tcInput.value.trim();
    if (tcVal && tcVal.length !== 11) {
      tcError.style.display = 'block';
      return false;
    } else {
      tcError.style.display = 'none';
      return true;
    }
  },

  validatePhone() {
    const phoneInput = document.getElementById('p-phone');
    const phoneError = document.getElementById('p-phone-error');
    if (!phoneInput || !phoneError) return true;
    
    let phoneVal = phoneInput.value.trim().replace(/[\s-()]/g, '');
    if (phoneVal && (phoneVal.length < 10 || phoneVal.length > 11)) {
      phoneError.style.display = 'block';
      return false;
    } else {
      phoneError.style.display = 'none';
      return true;
    }
  },

  async saveNewPatient(e, presetLeadId = null) {
    e.preventDefault();
    
    const isPhoneValid = this.validatePhone();
    const isTcValid = this.validateTc();
    
    if (!isPhoneValid || !isTcValid) {
      return;
    }

    const selectedAllergiesArr = Array.from(document.querySelectorAll('.health-cb:checked'))
                                      .map(cb => cb.value);

    const otherInput = document.getElementById('p-health-other');
    if (selectedAllergiesArr.includes('Diğer') && otherInput && otherInput.value.trim()) {
      const idx = selectedAllergiesArr.indexOf('Diğer');
      selectedAllergiesArr[idx] = `Diğer: ${otherInput.value.trim()}`;
    }
    
    const allergiesStr = selectedAllergiesArr.join(', ');

    const data = {
      full_name: document.getElementById('p-name').value.trim(),
      tc_kimlik_no: document.getElementById('p-tc').value.trim(),
      phone: document.getElementById('p-phone').value.trim(),
      email: document.getElementById('p-email').value.trim(),
      dob: document.getElementById('p-dob').value,
      gender: document.getElementById('p-gender').value,
      allergies: allergiesStr,
      lead_id: presetLeadId
    };
    
    try {
      const res = await App.api('/api/patients', { method: 'POST', body: JSON.stringify(data) });
      if (!res.id) throw new Error(res.error || 'Kaydedilemedi');
      App.notify('Hasta başarıyla kaydedildi.', 'success');
      App.closeModal();
      this.loadPatients();
    } catch (error) {
      App.notify(error.message, 'error');
    }
  },

  async openPatientDetail(id) {
    try {
      const patient = await App.api(`/api/patients/${id}`);
      
      const content = `
        <div class="patient-detail-container" style="display: flex; flex-direction: column; gap: 20px;">
          <div class="patient-header-card" style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
            <h3 style="margin: 0 0 10px 0; color: var(--text-primary); font-size: 1.2rem;">${App.escape(patient.full_name)}</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem; color: var(--text-secondary);">
              <div><strong>TC:</strong> ${patient.tc_kimlik_no || '-'}</div>
              <div><strong>Tel:</strong> ${patient.phone || '-'}</div>
              <div><strong>Yaş/D.Tarihi:</strong> ${patient.dob || '-'}</div>
              <div><strong>Cinsiyet:</strong> ${patient.gender || '-'}</div>
            </div>
            ${patient.allergies ? `<div style="margin-top: 10px; color: #ef4444; font-size: 0.9rem;"><i class="ri-error-warning-line"></i> <strong>Alerji/Kronik:</strong> ${App.escape(patient.allergies)}</div>` : ''}
          </div>
          
          <div class="patient-tabs" style="display: flex; gap: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
            <button class="btn btn-sm btn-primary" id="tab-records" onclick="Patients.loadPatientRecords(${id})">Tıbbi Kayıtlar (Muayene)</button>
            <button class="btn btn-sm btn-outline" id="tab-payments" onclick="Patients.loadPatientPayments(${id})">Geçmiş Ödemeler</button>
          </div>
          
          <div id="patient-tab-content">
            <div style="text-align:center; padding: 20px;">Yükleniyor...</div>
          </div>
        </div>
      `;
      
      App.showModal('Hasta Detayı (HBYS)', content, { wide: true });
      this.loadPatientRecords(id);
      
    } catch (error) {
      App.notify(error.message, 'error');
    }
  },

  async loadPatientRecords(id) {
    document.getElementById('tab-records').className = 'btn btn-sm btn-primary';
    document.getElementById('tab-payments').className = 'btn btn-sm btn-outline';
    
    const contentDiv = document.getElementById('patient-tab-content');
    contentDiv.innerHTML = '<div style="text-align:center; padding: 20px;">Yükleniyor...</div>';
    
    try {
      const records = await App.api(`/api/patients/${id}/records`);
      
      let html = `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 15px;">
          <button class="btn btn-sm btn-success" onclick="Patients.openNewRecordModal(${id})"><i class="ri-add-line"></i> Yeni Muayene Ekle</button>
        </div>
      `;
      
      if (records.length === 0) {
        html += `<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Henüz tıbbi kayıt bulunmuyor.</div>`;
      } else {
        html += `<div style="display: flex; flex-direction: column; gap: 15px;">`;
        records.forEach(r => {
          html += `
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                <strong style="color: var(--accent-primary);"><i class="ri-calendar-line"></i> ${App.formatDate(r.visit_date)}</strong>
              </div>
              <div style="margin-bottom: 8px;"><strong>Teşhis:</strong> ${App.escape(r.diagnosis || '-')}</div>
              <div style="margin-bottom: 8px;"><strong>Uygulanan Tedavi:</strong> ${App.escape(r.treatment || '-')}</div>
              <div style="margin-bottom: 8px;"><strong>Reçete:</strong> ${App.escape(r.prescription || '-')}</div>
              ${r.doctor_notes ? `<div style="margin-top: 10px; font-style: italic; color: var(--text-secondary); font-size: 0.9rem;">Not: ${App.escape(r.doctor_notes)}</div>` : ''}
            </div>
          `;
        });
        html += `</div>`;
      }
      contentDiv.innerHTML = html;
    } catch (err) {
      contentDiv.innerHTML = `<div style="color:red;">Kayıtlar yüklenemedi.</div>`;
    }
  },

  async loadPatientPayments(id) {
    document.getElementById('tab-records').className = 'btn btn-sm btn-outline';
    document.getElementById('tab-payments').className = 'btn btn-sm btn-primary';
    
    const contentDiv = document.getElementById('patient-tab-content');
    contentDiv.innerHTML = '<div style="text-align:center; padding: 20px;">Yükleniyor...</div>';
    
    try {
      const payments = await App.api(`/api/patients/${id}/payments`);
      
      let html = `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 15px;">
          <button class="btn btn-sm btn-success" onclick="Patients.openNewPaymentModal(${id})"><i class="ri-add-line"></i> Yeni Tahsilat Ekle</button>
        </div>
        <table class="table" style="font-size: 0.9rem;">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Tutar</th>
              <th>Yöntem</th>
              <th>Açıklama</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      if (payments.length === 0) {
        html += `<tr><td colspan="4" style="text-align:center;">Geçmiş ödeme bulunmuyor.</td></tr>`;
      } else {
        payments.forEach(p => {
          html += `
            <tr>
              <td>${App.formatDate(p.payment_date)}</td>
              <td style="color: #10b981; font-weight: bold;">₺${p.amount.toLocaleString('tr-TR')}</td>
              <td>${App.escape(p.payment_method)}</td>
              <td>${App.escape(p.description || '-')}</td>
            </tr>
          `;
        });
      }
      
      html += `</tbody></table>`;
      contentDiv.innerHTML = html;
    } catch (err) {
      contentDiv.innerHTML = `<div style="color:red;">Ödemeler yüklenemedi.</div>`;
    }
  },

  openNewRecordModal(id) {
    const content = `
      <form class="form-grid" onsubmit="Patients.saveNewRecord(event, ${id})">
        <div class="form-group">
          <label>Muayene Tarihi *</label>
          <input type="date" id="r-date" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Teşhis / Tanı</label>
          <input type="text" id="r-diagnosis">
        </div>
        <div class="form-group form-full">
          <label>Uygulanan Tedavi / İşlem</label>
          <textarea id="r-treatment" rows="2"></textarea>
        </div>
        <div class="form-group form-full">
          <label>Reçete</label>
          <textarea id="r-prescription" rows="2"></textarea>
        </div>
        <div class="form-group form-full" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
          <button type="button" class="btn btn-outline" onclick="Patients.openPatientDetail(${id})">İptal</button>
          <button type="submit" class="btn btn-primary">Kaydet</button>
        </div>
      </form>
    `;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-title').innerText = 'Yeni Muayene Kaydı';
  },

  async saveNewRecord(e, id) {
    e.preventDefault();
    const data = {
      visit_date: document.getElementById('r-date').value,
      diagnosis: document.getElementById('r-diagnosis').value,
      treatment: document.getElementById('r-treatment').value,
      prescription: document.getElementById('r-prescription').value
    };
    
    try {
      const res = await App.api(`/api/patients/${id}/records`, { method: 'POST', body: JSON.stringify(data) });
      if (!res.id) throw new Error('Kaydedilemedi');
      App.notify('Muayene kaydedildi.', 'success');
      this.openPatientDetail(id);
    } catch (error) {
      App.notify(error.message, 'error');
    }
  },

  openNewPaymentModal(id) {
    const content = `
      <form class="form-grid" onsubmit="Patients.saveNewPayment(event, ${id})">
        <div class="form-group">
          <label>Ödeme Tarihi *</label>
          <input type="date" id="pay-date" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Tutar (₺) *</label>
          <input type="number" id="pay-amount" required min="0" step="0.01">
        </div>
        <div class="form-group">
          <label>Ödeme Yöntemi *</label>
          <select id="pay-method" required>
            <option value="Kredi Kartı">Kredi Kartı</option>
            <option value="Nakit">Nakit</option>
            <option value="Havale/EFT">Havale/EFT</option>
          </select>
        </div>
        <div class="form-group">
          <label>Açıklama (Hangi işlem için?)</label>
          <input type="text" id="pay-desc">
        </div>
        <div class="form-group form-full" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
          <button type="button" class="btn btn-outline" onclick="Patients.openPatientDetail(${id})">İptal</button>
          <button type="submit" class="btn btn-primary">Tahsil Et</button>
        </div>
      </form>
    `;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-title').innerText = 'Yeni Tahsilat (Ödeme Al)';
  },

  async saveNewPayment(e, id) {
    e.preventDefault();
    const data = {
      patient_id: id,
      payment_date: document.getElementById('pay-date').value,
      amount: document.getElementById('pay-amount').value,
      payment_method: document.getElementById('pay-method').value,
      description: document.getElementById('pay-desc').value
    };
    
    try {
      const res = await App.api(`/api/payments`, { method: 'POST', body: JSON.stringify(data) });
      if (!res.id) throw new Error('Kaydedilemedi');
      App.notify('Tahsilat başarıyla eklendi.', 'success');
      this.openPatientDetail(id);
      setTimeout(() => this.loadPatientPayments(id), 100);
    } catch (error) {
      App.notify(error.message, 'error');
    }
  },

  async exportData() {
    try {
      const patients = await App.api('/api/patients');
      const columns = [
        { key: 'id', label: 'ID' },
        { key: 'tc_kimlik_no', label: 'TC Kimlik' },
        { key: 'full_name', label: 'Ad Soyad' },
        { key: 'phone', label: 'Telefon' },
        { key: 'email', label: 'E-posta' },
        { key: 'dob', label: 'Doğum Tarihi' },
        { key: 'gender', label: 'Cinsiyet' },
        { key: 'blood_type', label: 'Kan Grubu' },
        { key: 'allergies', label: 'Alerjiler/Kronik Hastalıklar' },
        { key: 'created_at', label: 'Kayıt Tarihi', value: r => App.formatDate(r.created_at, true) }
      ];
      App.exportToCsv('Hastalar', columns, patients);
    } catch (error) {
      App.notify('Dışa aktarma başarısız oldu.', 'error');
    }
  }
};
