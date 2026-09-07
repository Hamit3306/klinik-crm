'use strict';

window.Finance = {
  async render(force = false) {
    document.getElementById('page-content').innerHTML = `
      <div class="animate-fade-in">
        <div class="page-header">
          <h2>Kasa ve Finans (HBYS)</h2>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px;">
          <div class="card stat-card">
            <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;"><i class="ri-money-dollar-circle-line"></i></div>
            <div class="stat-content">
              <h3>Toplam Tahsilat</h3>
              <p id="total-revenue">₺0,00</p>
            </div>
          </div>
          <div class="card stat-card">
            <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;"><i class="ri-bank-card-line"></i></div>
            <div class="stat-content">
              <h3>Kredi Kartı</h3>
              <p id="total-cc">₺0,00</p>
            </div>
          </div>
          <div class="card stat-card">
            <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b;"><i class="ri-wallet-3-line"></i></div>
            <div class="stat-content">
              <h3>Nakit</h3>
              <p id="total-cash">₺0,00</p>
            </div>
          </div>
        </div>
        
        <div class="data-table-container">
          <div class="data-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Hasta Adı</th>
                  <th>Yöntem</th>
                  <th>Açıklama</th>
                  <th style="text-align: right;">Tutar</th>
                </tr>
              </thead>
              <tbody id="finance-table-body">
                <tr><td colspan="5" style="text-align: center;">Yükleniyor...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    await this.loadFinanceData();
  },

  async loadFinanceData() {
    try {
      const payments = await App.api(`/api/payments`);
      
      let totalRevenue = 0;
      let totalCC = 0;
      let totalCash = 0;
      
      const tbody = document.getElementById('finance-table-body');
      if (!tbody) return;
      
      if (payments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">Henüz tahsilat bulunmuyor.</td></tr>`;
      } else {
        tbody.innerHTML = payments.map(p => {
          totalRevenue += p.amount;
          if (p.payment_method === 'Kredi Kartı') totalCC += p.amount;
          if (p.payment_method === 'Nakit') totalCash += p.amount;
          
          return `
            <tr>
              <td>${App.formatDate(p.payment_date)}</td>
              <td style="font-weight: 500;">${App.escape(p.patient_name || '-')}</td>
              <td><span class="badge" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">${p.payment_method}</span></td>
              <td>${App.escape(p.description || '-')}</td>
              <td style="text-align: right; color: #10b981; font-weight: bold;">₺${p.amount.toLocaleString('tr-TR')}</td>
            </tr>
          `;
        }).join('');
      }
      
      document.getElementById('total-revenue').innerText = `₺${totalRevenue.toLocaleString('tr-TR')}`;
      document.getElementById('total-cc').innerText = `₺${totalCC.toLocaleString('tr-TR')}`;
      document.getElementById('total-cash').innerText = `₺${totalCash.toLocaleString('tr-TR')}`;
      
    } catch (error) {
      App.notify(error.message, 'error');
    }
  }
};
