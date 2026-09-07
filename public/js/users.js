'use strict';

window.Users = {
  items: [],

  async render() {
    try {
      const data = await App.api('/api/users');
      this.items = data.items;
      
      document.getElementById('page-content').innerHTML = `
        <div class="animate-fade-in">
          <div class="page-header">
            <div><p class="page-header-title">Klinik personeli ve yetki yönetimi</p></div>
            <div class="page-header-actions">
              <button class="btn btn-primary" onclick="Users.showForm()"><i class="ri-user-add-line"></i> Yeni Personel Ekle</button>
            </div>
          </div>
          <div class="data-table-container">
            <div class="data-table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Ad Soyad</th>
                    <th>Kullanıcı Adı</th>
                    <th>Yetki Rolü</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.items.length ? this.items.map(item => `
                    <tr>
                      <td><strong>${App.escape(item.display_name)}</strong></td>
                      <td>${App.escape(item.username)}</td>
                      <td>${item.role === 'admin' ? '<span class="status-badge status-active">Yönetici (Admin)</span>' : '<span class="status-badge status-pending">Asistan</span>'}</td>
                      <td>${item.active ? '<span style="color:var(--success-color)"><i class="ri-check-line"></i> Aktif</span>' : '<span style="color:var(--danger-color)"><i class="ri-close-line"></i> Pasif</span>'}</td>
                      <td class="actions">
                        <button class="btn-icon" onclick="Users.showForm(${item.id})" title="Düzenle"><i class="ri-pencil-line"></i></button>
                        ${App.user && App.user.id !== item.id ? `<button class="btn-icon danger" onclick="Users.remove(${item.id})" title="Sil"><i class="ri-delete-bin-line"></i></button>` : ''}
                      </td>
                    </tr>
                  `).join('') : `<tr><td colspan="5">${App.emptyState('ri-user-line', 'Personel bulunamadı')}</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
    } catch (error) {
      App.notify(error.message, 'error');
    }
  },

  showForm(id = null) {
    const item = id ? this.items.find(row => row.id === id) || {} : {};
    App.showModal(id ? 'Personel Düzenle' : 'Yeni Personel', `
      <form id="user-form" class="form-grid">
        <div class="form-group form-full">
          <label>Ad Soyad *</label>
          <input name="displayName" required maxlength="100" value="${App.attr(item.display_name || '')}">
        </div>
        <div class="form-group">
          <label>Kullanıcı Adı (Giriş için) *</label>
          <input name="username" required maxlength="50" value="${App.attr(item.username || '')}" ${id ? 'readonly style="background:#f1f5f9"' : ''}>
        </div>
        <div class="form-group">
          <label>Şifre ${id ? '(Sıfırlamak için girin)' : '*'}</label>
          <input name="password" type="password" ${id ? '' : 'required'} placeholder="******">
        </div>
        <div class="form-group">
          <label>Yetki Rolü</label>
          <select name="role">
            <option value="admin" ${item.role === 'admin' ? 'selected' : ''}>Yönetici (Tam Yetki)</option>
            <option value="assistant" ${item.role === 'assistant' ? 'selected' : ''}>Asistan (Finans/Reklam Gizli)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Durum</label>
          <select name="active">
            <option value="1" ${item.active !== 0 ? 'selected' : ''}>Aktif</option>
            <option value="0" ${item.active === 0 ? 'selected' : ''}>Pasif</option>
          </select>
        </div>
        <div class="modal-footer form-full">
          <button type="button" class="btn btn-outline" onclick="App.closeModal()">Vazgeç</button>
          <button class="btn btn-primary" type="submit"><i class="ri-save-line"></i> Kaydet</button>
        </div>
      </form>
    `);

    document.getElementById('user-form').addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const payload = App.formToObject(event.currentTarget);
        payload.active = Number(payload.active);
        await App.api(id ? `/api/users/${id}` : '/api/users', { 
          method: id ? 'PUT' : 'POST', 
          body: JSON.stringify(payload) 
        });
        App.closeModal();
        App.notify('Personel kaydedildi.', 'success');
        this.render();
      } catch (error) {
        App.notify(error.message, 'error');
      }
    });
  },

  async remove(id) {
    if (!App.confirm('Bu personeli silmek istediğinize emin misiniz?')) return;
    try {
      await App.api(`/api/users/${id}`, { method: 'DELETE' });
      App.notify('Personel silindi.', 'success');
      this.render();
    } catch (error) {
      App.notify(error.message, 'error');
    }
  }
};
