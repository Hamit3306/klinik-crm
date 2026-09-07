'use strict';

window.Dashboard = {
  statsData: null,
  currentView: 'main', // 'main' | 'reklam' | 'iletisim'

  async render() {
    try {
      if (!this.statsData) {
        const data = await App.api('/api/dashboard');
        this.statsData = data;
      }
      const data = this.statsData;
      const { stats } = data;

      // Safe values
      const totalLeads = stats.totalLeads || 0;
      const newLeads = stats.newLeads || 0;
      const activeCampaigns = stats.activeCampaigns || 0;
      const totalSpent = stats.totalSpent || 0;
      const convertedLeads = stats.convertedLeads || 0;
      const surgeryLeads = stats.surgeryLeads || 0;
      const costPerSurgery = stats.costPerSurgery || (surgeryLeads > 0 ? totalSpent / surgeryLeads : 0);
      const costPerLead = totalLeads > 0 ? totalSpent / totalLeads : 0;

      const totalUnread = stats.totalUnread || 0;
      const igUnread = stats.instagramUnread || 0;
      const waUnread = stats.whatsappUnread || 0;
      const responseTime = stats.responseTimeIG || stats.responseTimeWA || 8;
      const conversionRate = stats.conversionRate || (totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : 0);

      const topCampaigns = (data.campaignPerformance || []).slice(0, 5);
      const maxLeadsInCamp = Math.max(...topCampaigns.map(c => c.leads || 0), 1);
      const recentLeads = (data.recentLeads || []).slice(0, 6);

      let html = '';

      // =========================================================================
      // GÖRÜNÜM 1: ANA PORTAL (Sadece 2 Sade, Prestijli Master Kart)
      // =========================================================================
      if (this.currentView === 'main') {
        html = `
          <div class="dash-portal-container animate-fade-in">
            <div class="dash-portal-grid">
              
              <!-- 1. KART: PAZARLAMA & REKLAM YÖNETİMİ -->
              <div class="dash-portal-card card-marketing" onclick="Dashboard.setView('reklam')">
                <div class="portal-card-top">
                  <div class="portal-icon-wrap icon-marketing">
                    <i class="ri-megaphone-fill"></i>
                  </div>
                  <span class="portal-status-badge badge-marketing">
                    <span class="portal-dot"></span> ${activeCampaigns} Aktif Kampanya
                  </span>
                </div>

                <div class="portal-card-body">
                  <h2 class="portal-card-title">Pazarlama & Reklam Yönetimi</h2>
                  <p class="portal-card-desc">Meta Lead Ads formları, kampanya bütçeleri, lead maliyetleri ve ROI dönüşüm analizleri</p>

                  <!-- 3 Özet Metrik -->
                  <div class="portal-summary-pills">
                    <div class="portal-pill">
                      <i class="ri-user-received-2-line text-primary"></i>
                      <span><b>${totalLeads}</b> Reklam Talebi</span>
                    </div>
                    <div class="portal-pill">
                      <i class="ri-funds-line text-danger"></i>
                      <span><b>${App.formatCurrency(totalSpent)}</b> Harcama</span>
                    </div>
                    <div class="portal-pill">
                      <i class="ri-heart-pulse-line text-warning"></i>
                      <span><b>${surgeryLeads}</b> Ameliyat</span>
                    </div>
                  </div>
                </div>

                <div class="portal-card-footer">
                  <span class="portal-cta-text">Reklam Detaylarını Aç & Yönet</span>
                  <div class="portal-cta-arrow">
                    <i class="ri-arrow-right-line"></i>
                  </div>
                </div>
              </div>

              <!-- 2. KART: MÜŞTERİ İLETİŞİM MERKEZİ -->
              <div class="dash-portal-card card-communication" onclick="Dashboard.setView('iletisim')">
                <div class="portal-card-top">
                  <div class="portal-icon-wrap icon-communication">
                    <i class="ri-chat-3-fill"></i>
                  </div>
                  <span class="portal-status-badge badge-communication">
                    <span class="portal-dot"></span> Canlı Kanallar
                  </span>
                </div>

                <div class="portal-card-body">
                  <h2 class="portal-card-title">Müşteri İletişim Merkezi</h2>
                  <p class="portal-card-desc">Instagram DM ve WhatsApp mesajlaşması, anlık gelen kutusu ve randevuya dönüşüm oranları</p>

                  <!-- 3 Özet Metrik -->
                  <div class="portal-summary-pills">
                    <div class="portal-pill">
                      <i class="ri-mail-unread-line text-danger"></i>
                      <span><b>${totalUnread}</b> Bekleyen Mesaj</span>
                    </div>
                    <div class="portal-pill">
                      <i class="ri-timer-flash-line text-success"></i>
                      <span><b>${this.formatTime(responseTime)}</b> Yanıt Hızı</span>
                    </div>
                    <div class="portal-pill">
                      <i class="ri-percent-line text-info"></i>
                      <span><b>%${conversionRate}</b> Dönüşüm</span>
                    </div>
                  </div>
                </div>

                <div class="portal-card-footer">
                  <span class="portal-cta-text">İletişim Merkezini Aç & Yanıtla</span>
                  <div class="portal-cta-arrow">
                    <i class="ri-arrow-right-line"></i>
                  </div>
                </div>
              </div>

            </div>

            <!-- GÜNLÜK GÖREVLER / HATIRLATICILAR -->
            <div class="dash-panel" style="margin-top: 24px;">
              <div class="dash-panel-header">
                <div class="dash-panel-title">
                  <i class="ri-calendar-todo-line text-warning"></i>
                  <span>Günlük Görevler & Hatırlatıcılar</span>
                </div>
              </div>
              <div class="dash-panel-body">
                ${data.tasks && data.tasks.length ? `
                  <div class="task-list" style="display: flex; flex-direction: column; gap: 12px;">
                    ${data.tasks.map(t => `
                      <div class="task-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: rgba(248,250,252,0.6); border: 1px solid #e2e8f0; border-radius: 8px;">
                        <div>
                          <div style="font-weight: 600; color: #1e293b; margin-bottom: 4px;">${App.escape(t.title)}</div>
                          <div style="font-size: 13px; color: #64748b;">
                            ${t.lead_name ? `<i class="ri-user-line" style="vertical-align: text-bottom; margin-right: 4px;"></i>${App.escape(t.lead_name)} • ` : ''}
                            <i class="ri-time-line" style="vertical-align: text-bottom; margin-right: 4px;"></i>${App.formatDate(t.due_date, true)}
                          </div>
                        </div>
                        <button class="btn btn-outline btn-sm" onclick="Dashboard.completeTask(${t.id})" title="Tamamlandı İşaretle" style="padding: 6px 12px;">
                          <i class="ri-check-line"></i> Tamamla
                        </button>
                      </div>
                    `).join('')}
                  </div>
                ` : `
                  <div class="dash-empty-state">
                    <i class="ri-check-double-line" style="font-size: 32px; color: #10b981; margin-bottom: 8px;"></i>
                    <p style="color: #64748b; font-weight: 500;">Harika! Bekleyen hiçbir göreviniz yok.</p>
                  </div>
                `}
              </div>
            </div>

          </div>
        `;
      }

      // =========================================================================
      // GÖRÜNÜM 2: REKLAM & PAZARLAMA DETAYI
      // =========================================================================
      else if (this.currentView === 'reklam') {
        html = `
          <div class="dash-detail-container animate-fade-in">
            
            <!-- Üst Navigasyon & Başlık Çubuğu -->
            <div class="dash-detail-topbar">
              <div class="dash-detail-left">
                <button class="btn btn-outline btn-sm dash-back-btn" onclick="Dashboard.setView('main')">
                  <i class="ri-arrow-left-line"></i>
                  <span>Ana Sayfaya Dön</span>
                </button>
                <div class="dash-detail-heading">
                  <div class="dash-badge-icon icon-marketing">
                    <i class="ri-megaphone-fill"></i>
                  </div>
                  <div>
                    <h2>Pazarlama & Meta Reklam Yönetimi</h2>
                    <p>Meta Lead Ads • Kampanya ROI • Harcamalar & Dönüşümler</p>
                  </div>
                </div>
              </div>

              <div class="dash-detail-right">
                <div class="dash-view-toggle">
                  <button class="toggle-btn active"><i class="ri-megaphone-line"></i> Reklamlar</button>
                  <button class="toggle-btn" onclick="Dashboard.setView('iletisim')"><i class="ri-chat-3-line"></i> İletişim Merkezi</button>
                </div>
                <button class="btn btn-primary btn-sm" onclick="App.navigate('campaigns')">
                  <i class="ri-sound-module-line"></i>
                  <span>Kampanyaları Yönet</span>
                </button>
              </div>
            </div>

            <!-- KPI Kartları (4'lü Izgara) -->
            <div class="dash-kpis-grid">
              <div class="dash-kpi-card" onclick="App.navigate('leads')" style="cursor: pointer;" title="Kişiler listesine git">
                <div class="dash-kpi-header">
                  <span class="dash-kpi-label"><i class="ri-user-received-2-line"></i> Reklam Talepleri</span>
                  ${newLeads > 0 ? `<span class="kpi-pill pill-primary">+${newLeads} Yeni</span>` : `<span class="kpi-pill pill-neutral">Aktif</span>`}
                </div>
                <div class="dash-kpi-value text-primary">${totalLeads}</div>
                <div class="dash-kpi-footer">
                  <span>Toplam gelen potansiyel hasta</span>
                  <i class="ri-arrow-right-s-line"></i>
                </div>
              </div>

              <div class="dash-kpi-card" onclick="App.navigate('campaigns')" style="cursor: pointer;" title="Kampanyalar detayına git">
                <div class="dash-kpi-header">
                  <span class="dash-kpi-label"><i class="ri-funds-box-line"></i> Toplam Harcama</span>
                  <span class="kpi-pill ${activeCampaigns > 0 ? 'pill-success' : 'pill-neutral'}">${activeCampaigns} Aktif</span>
                </div>
                <div class="dash-kpi-value text-danger">${App.formatCurrency(totalSpent)}</div>
                <div class="dash-kpi-footer">
                  <span>Lead Başı: <b>${costPerLead > 0 ? App.formatCurrency(costPerLead) : '-'}</b></span>
                  <i class="ri-arrow-right-s-line"></i>
                </div>
              </div>

              <div class="dash-kpi-card" onclick="App.navigate('appointments')" style="cursor: pointer;" title="Randevulara git">
                <div class="dash-kpi-header">
                  <span class="dash-kpi-label"><i class="ri-calendar-check-line"></i> Randevu & Ameliyat</span>
                  <span class="kpi-pill pill-warning">${surgeryLeads} Ameliyat</span>
                </div>
                <div class="dash-kpi-value text-warning">${convertedLeads} <span class="dash-kpi-unit">Randevu</span></div>
                <div class="dash-kpi-footer">
                  <span>Dönüşen hasta randevuları</span>
                  <i class="ri-arrow-right-s-line"></i>
                </div>
              </div>

              <div class="dash-kpi-card">
                <div class="dash-kpi-header">
                  <span class="dash-kpi-label"><i class="ri-shield-star-line"></i> Ameliyat Maliyeti (CAC)</span>
                  <span class="kpi-pill pill-success">ROI</span>
                </div>
                <div class="dash-kpi-value text-success">${costPerSurgery > 0 ? App.formatCurrency(costPerSurgery) : (totalSpent > 0 ? App.formatCurrency(totalSpent) : '0 ₺')}</div>
                <div class="dash-kpi-footer">
                  <span>Hasta başı reklam edinim tutarı</span>
                </div>
              </div>
            </div>

            <!-- Kampanya Performansı Detay Tablosu -->
            <div class="dash-panel" style="margin-top: 20px;">
              <div class="dash-panel-header">
                <div class="dash-panel-title">
                  <i class="ri-bar-chart-grouped-line text-primary"></i>
                  <span>Kampanya Performans & ROI Tablosu</span>
                </div>
                <button class="btn btn-xs btn-outline" onclick="App.navigate('integrations')"><i class="ri-refresh-line"></i> Meta ile Eşitle</button>
              </div>
              <div class="dash-panel-body" style="padding: 0;">
                <div class="table-responsive">
                  <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                      <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 14px 20px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase;">Kampanya Adı</th>
                        <th style="padding: 14px 20px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; text-align: right;">Harcama</th>
                        <th style="padding: 14px 20px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; text-align: center;">Gelen Kişi</th>
                        <th style="padding: 14px 20px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; text-align: center;">Randevu</th>
                        <th style="padding: 14px 20px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; text-align: center;">Ameliyat</th>
                        <th style="padding: 14px 20px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; text-align: right;">Hasta Başı Gider</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${topCampaigns.length ? topCampaigns.map(c => `
                        <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor='transparent'">
                          <td style="padding: 16px 20px; font-size: 14px; font-weight: 600; color: #1e293b;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                              <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(99, 102, 241, 0.1); display: flex; align-items: center; justify-content: center; color: #4f46e5; font-size: 16px;">
                                <i class="ri-megaphone-line"></i>
                              </div>
                              ${App.escape(c.name)}
                            </div>
                          </td>
                          <td style="padding: 16px 20px; text-align: right; color: #dc2626; font-weight: 700; font-size: 15px;">${App.formatCurrency(c.spent)}</td>
                          <td style="padding: 16px 20px; text-align: center;">
                            <span class="kpi-pill pill-primary" style="font-size: 12px; padding: 4px 12px;">${c.leads || 0}</span>
                          </td>
                          <td style="padding: 16px 20px; text-align: center;">
                            <span class="kpi-pill pill-warning" style="font-size: 12px; padding: 4px 12px;">${c.appointments || 0}</span>
                          </td>
                          <td style="padding: 16px 20px; text-align: center;">
                            <span class="kpi-pill pill-success" style="font-size: 12px; padding: 4px 12px;">${c.surgeries || 0}</span>
                          </td>
                          <td style="padding: 16px 20px; text-align: right;">
                            <span style="font-weight: 700; color: ${(c.surgeries || 0) > 0 ? '#059669' : '#94a3b8'}; font-size: 14px;">
                              ${(c.surgeries || 0) > 0 ? App.formatCurrency(c.spent / c.surgeries) : '-'}
                            </span>
                          </td>
                        </tr>
                      `).join('') : `
                        <tr><td colspan="6" style="text-align: center; padding: 36px; color: #94a3b8;">Henüz kampanya verisi bulunmamaktadır.</td></tr>
                      `}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        `;
      }

      // =========================================================================
      // GÖRÜNÜM 3: MÜŞTERİ İLETİŞİM DETAYI
      // =========================================================================
      else if (this.currentView === 'iletisim') {
        html = `
          <div class="dash-detail-container animate-fade-in">
            
            <!-- Üst Navigasyon & Başlık Çubuğu -->
            <div class="dash-detail-topbar">
              <div class="dash-detail-left">
                <button class="btn btn-outline btn-sm dash-back-btn" onclick="Dashboard.setView('main')">
                  <i class="ri-arrow-left-line"></i>
                  <span>Ana Sayfaya Dön</span>
                </button>
                <div class="dash-detail-heading">
                  <div class="dash-badge-icon icon-communication">
                    <i class="ri-chat-3-fill"></i>
                  </div>
                  <div>
                    <h2>Müşteri İletişim & Mesajlaşma Merkezi</h2>
                    <p>Instagram DM • WhatsApp Cloud • Anlık İletişim & Yanıt</p>
                  </div>
                </div>
              </div>

              <div class="dash-detail-right">
                <div class="dash-view-toggle">
                  <button class="toggle-btn" onclick="Dashboard.setView('reklam')"><i class="ri-megaphone-line"></i> Reklamlar</button>
                  <button class="toggle-btn active"><i class="ri-chat-3-line"></i> İletişim Merkezi</button>
                </div>
                <button class="btn btn-success btn-sm" onclick="App.navigate('inbox')">
                  <i class="ri-chat-voice-line"></i>
                  <span>Gelen Kutusunu Aç</span>
                </button>
              </div>
            </div>

            <!-- KPI Kartları (4'lü Izgara) -->
            <div class="dash-kpis-grid">
              <div class="dash-kpi-card" onclick="App.navigate('inbox')" style="cursor: pointer;" title="Gelen kutusuna git">
                <div class="dash-kpi-header">
                  <span class="dash-kpi-label"><i class="ri-mail-unread-line"></i> Okunmamış Mesaj</span>
                  <span class="kpi-pill ${totalUnread > 0 ? 'pill-danger' : 'pill-success'}">${totalUnread} Bekleyen</span>
                </div>
                <div class="dash-kpi-value text-danger">${totalUnread}</div>
                <div class="dash-kpi-footer">
                  <span>IG: <b>${igUnread}</b> • WA: <b>${waUnread}</b></span>
                  <i class="ri-arrow-right-s-line"></i>
                </div>
              </div>

              <div class="dash-kpi-card">
                <div class="dash-kpi-header">
                  <span class="dash-kpi-label"><i class="ri-timer-flash-line"></i> Yanıt Hızı</span>
                  <span class="kpi-pill pill-success">Hızlı Akış</span>
                </div>
                <div class="dash-kpi-value text-success">${this.formatTime(responseTime)}</div>
                <div class="dash-kpi-footer">
                  <span>İlk mesaja dönüş süresi</span>
                </div>
              </div>

              <div class="dash-kpi-card">
                <div class="dash-kpi-header">
                  <span class="dash-kpi-label"><i class="ri-percent-line"></i> Dönüşüm Oranı</span>
                  <span class="kpi-pill pill-info">${convertedLeads} Randevu</span>
                </div>
                <div class="dash-kpi-value text-info">%${conversionRate}</div>
                <div class="dash-kpi-footer">
                  <span>Mesajdan randevuya dönüşüm</span>
                </div>
              </div>

              <div class="dash-kpi-card" onclick="App.navigate('leads')" style="cursor: pointer;" title="Kişi havuzunu gör">
                <div class="dash-kpi-header">
                  <span class="dash-kpi-label"><i class="ri-contacts-book-2-line"></i> İletişim Havuzu</span>
                  <span class="kpi-pill pill-primary">7/24 Aktif</span>
                </div>
                <div class="dash-kpi-value text-primary">${totalLeads}</div>
                <div class="dash-kpi-footer">
                  <span>Kayıtlı aktif hasta diyaloğu</span>
                  <i class="ri-arrow-right-s-line"></i>
                </div>
              </div>
            </div>

            <!-- Canlı Kanallar & Son Mesaj Talepleri -->
            <div class="dash-panel" style="margin-top: 20px;">
              <div class="dash-panel-header">
                <div class="dash-panel-title">
                  <i class="ri-chat-check-fill text-success"></i>
                  <span>Son Gelen Mesajlar & İletişim Talepleri</span>
                </div>
                <div class="dash-channel-badges">
                  <span class="channel-live-badge ig"><i class="ri-instagram-line"></i> Instagram Aktif</span>
                  <span class="channel-live-badge wa"><i class="ri-whatsapp-line"></i> WhatsApp Aktif</span>
                </div>
              </div>
              <div class="dash-panel-body">
                ${recentLeads.length ? `
                  <div class="dash-recent-lead-list">
                    ${recentLeads.map(l => {
                      const platform = l.platform || (l.source && l.source.includes('Instagram') ? 'Instagram' : 'WhatsApp');
                      const isIg = platform === 'Instagram';
                      const initial = (l.full_name || 'K')[0].toUpperCase();
                      const statusClass = l.status === 'Yeni' ? 'status-new' : (l.status === 'Randevu Alındı' ? 'status-appt' : 'status-contacted');
                      return `
                        <div class="dash-recent-lead-item" onclick="App.navigate('inbox')" style="cursor: pointer;" title="Mesajlaşmayı aç">
                          <div class="dash-lead-avatar ${isIg ? 'avatar-ig' : 'avatar-wa'}">
                            <span>${initial}</span>
                            <i class="${isIg ? 'ri-instagram-fill' : 'ri-whatsapp-fill'} avatar-badge"></i>
                          </div>
                          <div class="dash-lead-details">
                            <div class="dash-lead-row">
                              <span class="dash-lead-name">${App.escape(l.full_name || 'İsimsiz Aday')}</span>
                              <span class="dash-lead-status ${statusClass}">${App.escape(l.status || 'Yeni')}</span>
                            </div>
                            <div class="dash-lead-sub">
                              <span>${App.escape(l.interest || 'Genel Bilgi')}</span>
                              ${l.campaign_name ? `• <span class="dash-lead-camp">${App.escape(l.campaign_name)}</span>` : ''}
                            </div>
                          </div>
                          <button class="btn-quick-reply" onclick="event.stopPropagation(); App.navigate('inbox');" title="Mesajı Aç">
                            <i class="ri-chat-1-line"></i>
                          </button>
                        </div>
                      `;
                    }).join('')}
                  </div>
                ` : `
                  <div class="dash-empty-state">
                    <i class="ri-chat-smile-2-line"></i>
                    <p>Henüz gelen yeni mesaj bulunmuyor.</p>
                  </div>
                `}
              </div>
            </div>

          </div>
        `;
      }

      const container = document.getElementById('page-content');
      if (container) {
        container.innerHTML = html;
      }

      App.setNavCount('lead-nav-count', newLeads);
      App.setNavCount('inbox-nav-count', totalUnread);

    } catch (err) {
      console.error('Dashboard yükleme hatası:', err);
      const container = document.getElementById('page-content');
      if (container) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="ri-error-warning-line text-danger"></i>
            <h3>Dashboard verileri alınamadı</h3>
            <p>${App.escape(err.message)}</p>
            <button class="btn btn-primary" onclick="Dashboard.render()">Tekrar Dene</button>
          </div>`;
      }
    }
  },

  setView(viewName) {
    this.currentView = viewName;
    this.render();
  },

  formatTime(minutes) {
    if (!minutes || minutes <= 0) return '0 dk';
    if (minutes < 60) return `${minutes} dk`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h} sa ${m} dk` : `${h} saat`;
  },
  
  async completeTask(id) {
    try {
      await App.api(`/api/tasks/${id}/complete`, { method: 'PUT' });
      App.notify('Görev tamamlandı!', 'success');
      this.statsData = null; // force reload
      this.render();
    } catch (error) {
      App.notify(error.message, 'error');
    }
  }
};
