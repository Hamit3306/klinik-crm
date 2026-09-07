'use strict';

window.Integrations = {
  async render() {
    const data = await App.api('/api/integrations/status');
    const leadReady = data.instagram.leadAdsConfigured && data.webhook.verifyTokenConfigured;
    const instagramDmReady = data.instagram.messagingConfigured && data.webhook.verifyTokenConfigured;
    const whatsappReady = data.whatsapp && data.whatsapp.ready;
    document.getElementById('page-content').innerHTML = `
      <div class="animate-fade-in">
        <div class="page-header">
          <div><p class="page-header-title">@${App.escape(data.instagram.username)} için tam otomatik Meta mesaj ve lead bağlantısı</p></div>
          <div class="page-header-actions"><a class="btn btn-outline btn-sm" href="${App.attr(data.instagram.profileUrl)}" target="_blank" rel="noopener"><i class="ri-instagram-line"></i> Profili Aç</a></div>
        </div>
        <div class="integration-grid">
          ${this.integrationCard('ri-file-user-line','Instagram Lead Formları', leadReady, leadReady ? 'Form gönderimleri otomatik olarak kişi kartına işlenir.' : 'Page Access Token ve Page ID bekleniyor.', [
            ['Instagram hesabı', `@${data.instagram.username}`, true],
            ['Page ID', data.instagram.pageIdConfigured ? 'Tanımlı' : 'Eksik', data.instagram.pageIdConfigured],
            ['Lead erişim tokenı', data.instagram.leadAdsConfigured ? 'Tanımlı' : 'Eksik', data.instagram.leadAdsConfigured]
          ])}
          ${this.integrationCard('ri-instagram-line','Instagram DM', instagramDmReady, instagramDmReady ? 'Gelen DM mesajları otomatik olarak kişi ve konuşma kaydı oluşturur.' : 'Instagram Messaging API kimlikleri bekleniyor.', [
            ['Access Token', data.instagram.messagingConfigured ? 'Tanımlı' : 'Eksik', data.instagram.messagingConfigured],
            ['Instagram Account ID', data.instagram.accountIdConfigured ? 'Tanımlı' : 'Eksik', data.instagram.accountIdConfigured],
            ['Webhook', data.webhook.verifyTokenConfigured ? 'Hazır' : 'Eksik', data.webhook.verifyTokenConfigured]
          ])}
          ${this.integrationCard('ri-shield-check-line','Webhook Güvenliği', data.webhook.verifyTokenConfigured && data.webhook.signatureVerification, data.webhook.signatureVerification ? 'Meta imza doğrulaması etkin.' : 'App Secret girildiğinde imza doğrulaması etkinleşir.', [
            ['Callback URL', data.webhook.callbackUrl, true],
            ['Verify Token', data.webhook.verifyTokenConfigured ? 'Tanımlı' : 'Eksik', data.webhook.verifyTokenConfigured],
            ['İmza doğrulama', data.webhook.signatureVerification ? 'Etkin' : 'Geliştirme modu', data.webhook.signatureVerification]
          ])}
          <div class="integration-card ${whatsappReady ? 'ready' : 'pending'}">
            <div class="integration-card-top">
              <div class="integration-icon"><i class="ri-whatsapp-line"></i></div>
              <span class="integration-state"><i class="${whatsappReady ? 'ri-checkbox-circle-fill' : 'ri-time-line'}"></i>${whatsappReady ? 'Hazır' : 'Bağlantı Bekleniyor'}</span>
            </div>
            <h3>WhatsApp Web</h3>
            <p>${whatsappReady ? 'Telefonunuz bağlandı. Mesajlar hem telefona hem buraya düşecek.' : 'Aşağıdaki QR kodu okutarak telefonunuzu bağlayın.'}</p>
            ${data.whatsapp && data.whatsapp.qr && !whatsappReady ? `<div style="text-align: center; margin-top: 15px;"><img src="${data.whatsapp.qr}" style="max-width: 100%; border-radius: 8px;" alt="WhatsApp QR Kod" /><p style="font-size: 12px; color: #666; margin-top: 5px;">Bağlı Cihazlar menüsünden okutun</p></div>` : ''}
          </div>
        </div>

        <div class="setup-layout">
          <div class="setup-card">
            <div class="setup-card-header"><h3><i class="ri-settings-4-line"></i> Canlı Meta Kurulumu</h3><span class="badge badge-primary">Graph API ${App.escape(data.graphVersion)}</span></div>
            <div class="copy-field"><label>Ortak Callback URL</label><div><code id="callback-url">${App.escape(data.webhook.callbackUrl)}</code><button class="btn-icon" onclick="Integrations.copy('callback-url')"><i class="ri-file-copy-line"></i></button></div></div>
            <ol class="setup-steps">
              <li>Meta uygulamasında ilgili Facebook Sayfası ve profesyonel Instagram hesabını bağlayın.</li>
              <li>Lead Ads için Page nesnesindeki <strong>leadgen</strong> alanına abone olun.</li>
              <li>Instagram Messaging için <strong>messages</strong> ve <strong>messaging_postbacks</strong> webhook alanlarına abone olun.</li>
              <li>Lead Access Manager içinde uygulamaya lead erişimi verin.</li>
              <li><code>.env</code> dosyasındaki Meta kimliklerini doldurup uygulamayı yeniden başlatın.</li>
            </ol>
            <div class="integration-note"><i class="ri-robot-2-line"></i><p>Canlı bağlantıdan sonra klinik personeli kişi eklemez. Formlar ve mesajlar webhook üzerinden otomatik gelir; telefon numarası Instagram DM'de kullanıcı mesajında paylaşırsa otomatik algılanır.</p></div>
          </div>

          <div class="setup-card">
            <div class="setup-card-header"><h3><i class="ri-flask-line"></i> Yerel Test</h3><span class="badge badge-warning">Simülasyon</span></div>
            <p class="card-description">Gerçek Meta bağlantısı kurulmadan iş otomatik akışı yerel bilgisayarda doğrulayın.</p>
            <div class="test-actions">
              <button class="btn btn-primary" onclick="Integrations.simulateLead()"><i class="ri-file-user-line"></i> Form Lead'i</button>
              <button class="btn btn-primary" onclick="Integrations.simulateInstagram()"><i class="ri-instagram-line"></i> Instagram DM</button>
            </div>
            <div class="event-status">
              <h4>Son Webhook Durumu</h4>
              ${data.webhook.lastEvent ? `<div class="event-row"><span>${App.escape(data.webhook.lastEvent.event_type)}</span>${App.statusBadge(data.webhook.lastEvent.processing_status === 'processed' ? 'Tamamlandı' : data.webhook.lastEvent.processing_status)}<time>${App.formatDate(data.webhook.lastEvent.received_at, true)}</time></div>${data.webhook.lastEvent.error_message ? `<p class="error-text">${App.escape(data.webhook.lastEvent.error_message)}</p>` : ''}` : '<p class="text-muted">Henüz webhook olayı alınmadı.</p>'}
              ${data.webhook.failedEvents ? `<p class="error-text">${data.webhook.failedEvents} başarısız webhook kaydı bulunuyor.</p>` : ''}
            </div>
          </div>
        </div>
      </div>`;
  },

  integrationCard(icon, title, ready, description, rows) {
    return `<div class="integration-card ${ready ? 'ready' : 'pending'}"><div class="integration-card-top"><div class="integration-icon"><i class="${icon}"></i></div><span class="integration-state"><i class="${ready ? 'ri-checkbox-circle-fill' : 'ri-time-line'}"></i>${ready ? 'Hazır' : 'Kurulum Bekliyor'}</span></div><h3>${title}</h3><p>${App.escape(description)}</p><div class="integration-rows">${rows.map(([label,value,ok]) => `<div><span>${App.escape(label)}</span><strong class="${ok ? 'ok' : 'missing'}">${App.escape(value)}</strong></div>`).join('')}</div></div>`;
  },

  copy(id) {
    navigator.clipboard.writeText(document.getElementById(id).textContent).then(() => App.notify('Callback URL kopyalandı.', 'success')).catch(() => App.notify('Kopyalama başarısız.', 'error'));
  },

  async simulateLead() {
    try {
      await App.api('/api/demo/simulate/lead', { method: 'POST', body: JSON.stringify({ phone: '05551234567', fullName: 'Otomatik Test Kişisi' }) });
      App.notify('Instagram form bilgileri otomatik işlendi.', 'success');
      App.refreshNavCounters();
    } catch (error) { App.notify(error.message, 'error'); }
  },

  async simulateInstagram() {
    try {
      await App.api('/api/demo/simulate/instagram', { method: 'POST', body: JSON.stringify({ instagramScopedId: 'demo-instagram-5551234567', message: 'Merhaba, burun estetiği hakkında bilgi istiyorum. Telefonum 0555 123 45 67' }) });
      App.notify('Instagram DM otomatik olarak kişi ve konuşma kaydına dönüştü.', 'success');
      App.refreshNavCounters();
    } catch (error) { App.notify(error.message, 'error'); }
  }
};
