'use strict';

window.Inbox = {
  items: [],
  selectedId: null,
  platformFilter: 'Tümü',
  searchQuery: '',
  pollTimer: null,
  lastMessageId: 0,
  isSending: false,
  activeTemplateKey: 'burun',

  templates: {
    burun: {
      title: '👃 Burun Estetiği',
      text: "Merhaba efendim, Prof. Dr. Esin Yalçınkaya Kliniği'ne hoş geldiniz. Burun estetiği (rinoplasti) operasyonlarımız kişiye özel olarak planlanmaktadır. Kliniğimizde ön muayene ücretsizdir. Detaylı değerlendirme ve 3D simülasyon randevusu oluşturmak için size nasıl yardımcı olabiliriz?"
    },
    fiyat: {
      title: '💰 Fiyat / Ön Muayene',
      text: "Merhaba efendim, operasyon ve işlem ücretlerimiz hastamızın burun anatomisi ve uygulanacak cerrahi tekniğe göre hekim değerlendirmesi sonrası netleşmektedir. Kliniğimizde ön muayene ücretsizdir. Ücretsiz ön muayene randevusu planlamak ister misiniz?"
    },
    randevu: {
      title: '📅 Randevu Talebi',
      text: "Merhaba efendim, kliniğimizde ön muayene ücretsizdir. Ücretsiz ön muayene ve görüşme randevunuzu oluşturmaktan memnuniyet duyarız. Sizin için bu hafta içi mi yoksa hafta sonu mu daha uygun olur?"
    },
    botoks: {
      title: '💉 Botoks & Dolgu',
      text: "Merhaba efendim, kliniğimizde Allergan ve Dysport orijinal FDA onaylı botoks ve dolgu uygulamaları Prof. Dr. Esin Yalçınkaya tarafından gerçekleştirilmektedir. Kliniğimizde ön muayene ücretsizdir. Randevu için yardımcı olalım mı?"
    },
    adres: {
      title: '📍 Konum',
      text: "Merhaba efendim, kliniğimizde ön muayene ücretsizdir. Klinik konumumuza ve yol tarifine aşağıdaki linkten ulaşabilirsiniz:\n\n📍 https://examplecrm.com/konum\n\nRandevu oluşturmak için yardımcı olmamızı ister misiniz?"
    },
    karsilama: {
      title: '👋 Karşılama',
      text: "Merhaba efendim, Prof. Dr. Esin Yalçınkaya Kliniği ile iletişime geçtiğiniz için teşekkür ederiz. Kliniğimizde ön muayene ücretsizdir. Hangi işlemimiz hakkında detaylı bilgi almak istersiniz?"
    }
  },

  async render() {
    this.stopPolling();
    try {
      const data = await App.api('/api/conversations');
      this.items = data.items || [];
    } catch (e) {
      console.error('Konuşmalar yüklenemedi:', e);
      this.items = [];
    }
    
    const visible = this.getVisibleItems();
    if (!visible.some(item => item.id === this.selectedId)) {
      this.selectedId = visible[0]?.id || null;
    }

    document.getElementById('page-content').innerHTML = `
      <div class="inbox-shell animate-fade-in" style="height: calc(100vh - 90px) !important; max-height: calc(100vh - 90px) !important; min-height: 0 !important; display: grid !important; grid-template-columns: 340px minmax(0, 1fr) !important; border: 1px solid var(--glass-border); border-radius: var(--radius); overflow: hidden !important; background: var(--glass-bg);">
        <aside class="conversation-list" style="height: 100% !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; overflow: hidden !important; border-right: 1px solid var(--glass-border); background: rgba(8,12,36,.35);">
          <div class="conversation-list-header" style="flex: 0 0 auto !important; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--glass-border);">
            <div>
              <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary);">Gelen Kutusu</h3>
              <small style="color: var(--text-muted); font-size: 11px;">${visible.length} aktif konuşma</small>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <span id="inbox-live-indicator" class="portal-status-badge badge-communication" style="padding: 2px 8px; font-size: 10px;" title="Canlı Anlık Bağlantı">
                <span class="portal-dot"></span> Canlı
              </span>
              <button class="btn-icon" onclick="Inbox.render()" title="Yenile" style="width: 28px; height: 28px;"><i class="ri-refresh-line"></i></button>
            </div>
          </div>

          <div class="inbox-channel-tabs" style="flex: 0 0 auto !important;">
            ${['Tümü', 'Instagram', 'WhatsApp'].map(channel => `<button class="${this.platformFilter === channel ? 'active' : ''}" onclick="Inbox.setPlatform('${channel}')">${channel}</button>`).join('')}
          </div>

          <div style="flex: 0 0 auto !important; padding: 10px; border-bottom: 1px solid var(--border-color); background: var(--bg-color);">
            <div class="search-wrapper" style="position: relative;">
              <i class="ri-search-line" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
              <input type="text" placeholder="İsim veya numara ara..." value="${App.attr(this.searchQuery || '')}" oninput="Inbox.setSearch(this.value)" style="width: 100%; padding: 8px 10px 8px 30px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; background: var(--panel-bg); color: var(--text-color);">
            </div>
          </div>

          <div id="conversation-items" style="flex: 1 1 auto !important; min-height: 0 !important; overflow-y: auto !important;">
            ${this.renderConversationListHtml(visible)}
          </div>
        </aside>

        <section id="conversation-panel" class="conversation-panel" style="height: 100% !important; max-height: 100% !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; overflow: hidden !important;">
          ${this.selectedId
            ? '<div class="page-loader"><i class="ri-loader-4-line"></i><span>Mesajlar yükleniyor...</span></div>'
            : App.emptyState('ri-chat-3-line', 'Bir konuşma seçin', 'Görüşmek istediğiniz hastayı sol listeden seçin.')}
        </section>
      </div>`;

    if (this.selectedId) {
      await this.open(this.selectedId);
    }
  },

  getVisibleItems() {
    const searchQuery = (this.searchQuery || '').toLowerCase();
    return this.items.filter(item => {
      if (this.platformFilter !== 'Tümü' && item.platform !== this.platformFilter) return false;
      if (searchQuery) {
        return (item.full_name || '').toLowerCase().includes(searchQuery) ||
               (item.phone || '').includes(searchQuery) ||
               (item.external_contact_id || '').includes(searchQuery);
      }
      return true;
    });
  },

  renderConversationListHtml(visible) {
    if (!visible.length) {
      return App.emptyState('ri-chat-3-line', 'Henüz konuşma yok', 'Canlı Meta webhook veya WhatsApp bağlantısından gelen mesajlar burada görünür.');
    }
    return visible.map(item => this.conversationItem(item)).join('');
  },

  setPlatform(platform) {
    this.platformFilter = platform;
    this.selectedId = null;
    this.render();
  },

  setSearch(query) {
    this.searchQuery = query;
    const listEl = document.getElementById('conversation-items');
    if (!listEl) return;
    const visible = this.getVisibleItems();
    listEl.innerHTML = this.renderConversationListHtml(visible);
  },

  platformMeta(platform) {
    if (platform === 'Instagram') return { icon: 'ri-instagram-line', label: 'Instagram', className: 'instagram' };
    if (platform === 'WhatsApp') return { icon: 'ri-whatsapp-line', label: 'WhatsApp', className: 'whatsapp' };
    return { icon: 'ri-chat-3-line', label: platform, className: '' };
  },

  conversationItem(item) {
    const meta = this.platformMeta(item.platform);
    const secondary = item.platform === 'Instagram'
      ? (item.phone ? App.formatPhone(item.phone) : `@${item.external_contact_id}`)
      : (item.phone ? App.formatPhone(item.phone) : item.external_contact_id);
    return `<button id="conv-item-${item.id}" class="conversation-item ${this.selectedId === item.id ? 'active' : ''}" onclick="Inbox.open(${item.id})">
      <div class="conversation-avatar ${meta.className}"><i class="${meta.icon}"></i></div>
      <div class="conversation-summary">
        <div class="conversation-name"><strong>${App.escape(item.full_name || 'İsimsiz')}</strong><time>${App.formatRelative(item.updated_at)}</time></div>
        <p class="conv-last-msg">${this.formatMessageText(item.last_message, null, true)}</p>
        <small><span class="channel-label ${meta.className}">${meta.label}</span>${App.escape(secondary || '')}</small>
      </div>
      ${item.unread_count ? `<span class="unread-badge">${item.unread_count}</span>` : ''}
    </button>`;
  },

  linkify(text) {
    if (!text) return '';
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    return text.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: underline; font-weight: 500; word-break: break-all;">${url}</a>`);
  },

  formatMessageText(text, type, isPreview = false) {
    if (!text) return '<i>(Mesaj içeriği yok)</i>';
    if (!text.startsWith('[')) {
      const escaped = App.escape(text);
      if (isPreview) {
        return escaped.replace(/\n/g, ' ');
      }
      return this.linkify(escaped).replace(/\n/g, '<br>');
    }
    const resolvedType = type || (text || '').replace('[', '').replace(']', '');
    switch(resolvedType.toLowerCase()) {
      case 'image': return '📷 <i>Fotoğraf</i>';
      case 'video': return '🎥 <i>Video</i>';
      case 'audio': case 'ptt': return '🎵 <i>Ses Kaydı</i>';
      case 'document': return '📄 <i>Belge/Dosya</i>';
      case 'sticker': return '🎨 <i>Çıkartma</i>';
      case 'template': return '🤖 <i>Otomatik Şablon</i>';
      case 'interactive': return '👆 <i>Etkileşimli Menü</i>';
      case 'reaction': return '❤️ <i>İfade</i>';
      case 'location': return '📍 <i>Konum</i>';
      default: return App.escape(text);
    }
  },

  renderMessageContent(message) {
    let html = '';
    if (message.media_id) {
      const type = message.message_type;
      const url = message.media_id;
      if (type === 'image' || url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || (url.includes('scontent') && !url.includes('mp4'))) {
        html += `<div class="message-media" style="margin-bottom: 6px;"><a href="${App.attr(url)}" target="_blank" rel="noopener"><img src="${App.attr(url)}" alt="Görsel" loading="lazy" style="max-width: 100%; max-height: 220px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></a></div>`;
      } else if (type === 'video' || url.match(/\.(mp4|webm|ogg)$/i) || url.includes('mp4')) {
        html += `<div class="message-media" style="margin-bottom: 6px;"><video src="${App.attr(url)}" controls style="max-width: 100%; max-height: 220px; border-radius: 10px;"></video></div>`;
      } else if (type === 'audio' || type === 'ptt' || url.match(/\.(mp3|ogg|wav)$/i)) {
        html += `<div class="message-media" style="margin-bottom: 6px;"><audio src="${App.attr(url)}" controls style="max-width: 240px;"></audio></div>`;
      } else {
        html += `<div class="message-media" style="margin-bottom: 6px;"><a href="${App.attr(url)}" target="_blank" class="btn btn-outline btn-sm" style="display:inline-flex; align-items:center; gap: 4px; padding: 4px 10px; font-size: 11px;"><i class="ri-attachment-2"></i> Ekli Dosyayı Aç</a></div>`;
      }
    }
    
    const text = this.formatMessageText(message.text, message.message_type);
    if (text) {
      html += `<p style="margin:0; word-break: break-word;">${text}</p>`;
    }
    return html;
  },

  renderSingleMessageBubble(message) {
    const isOut = message.direction === 'outgoing';
    const statusIcon = isOut 
      ? (message.delivery_status === 'sending' ? '<i class="ri-loader-4-line ri-spin"></i>' : (message.delivery_status === 'failed' ? '<i class="ri-error-warning-line" style="color:#ef4444;"></i>' : '<i class="ri-check-double-line" style="color:#10b981;"></i>'))
      : '';
    const statusText = message.delivery_status === 'sending' ? 'Gönderiliyor...' : (message.delivery_status === 'failed' ? 'Başarısız' : App.escape(message.delivery_status || 'iletildi'));
    
    return `<div id="msg-${message.id || message.localId}" class="message-row ${message.direction} animate-fade-in" data-mid="${message.id || 0}">
      <div class="message-bubble">
        ${this.renderMessageContent(message)}
        <span style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; font-size: 10px; opacity: 0.7; margin-top: 4px;">
          ${App.formatDate(message.created_at, true)} · ${statusText} ${statusIcon}
        </span>
      </div>
    </div>`;
  },

  detectSuggestionKey(conv, messages = []) {
    const lastMsg = (messages.filter(m => m.direction === 'incoming').at(-1)?.text || conv.last_message || '').toLowerCase();
    
    if (lastMsg.includes('fiyat') || lastMsg.includes('ücret') || lastMsg.includes('ne kadar') || lastMsg.includes('maliyet') || lastMsg.includes('pahalı')) {
      return 'fiyat';
    }
    if (lastMsg.includes('randevu') || lastMsg.includes('tarih') || lastMsg.includes('gün') || lastMsg.includes('saat') || lastMsg.includes('gelmek') || lastMsg.includes('muayene')) {
      return 'randevu';
    }
    if (lastMsg.includes('botoks') || lastMsg.includes('dolgu') || lastMsg.includes('allergan') || lastMsg.includes('dysport') || lastMsg.includes('dudak')) {
      return 'botoks';
    }
    if (lastMsg.includes('nerede') || lastMsg.includes('adres') || lastMsg.includes('konum') || lastMsg.includes('yeriniz') || lastMsg.includes('nasıl gelebilirim')) {
      return 'adres';
    }
    if (lastMsg.includes('burun') || lastMsg.includes('rinoplasti') || lastMsg.includes('kemer') || lastMsg.includes('estetik') || lastMsg.includes('ameliyat') || lastMsg.includes('revizyon')) {
      return 'burun';
    }
    return 'karsilama';
  },

  getFormattedTemplate(key) {
    const tmpl = this.templates[key] || this.templates.burun;
    return tmpl.text;
  },

  selectTemplateChip(key, fullName) {
    this.activeTemplateKey = key;
    document.querySelectorAll('.chat-chip').forEach(el => {
      el.classList.toggle('active', el.dataset.key === key);
    });
    const textEl = document.getElementById('chat-suggestion-preview-text');
    if (textEl) {
      textEl.textContent = this.getFormattedTemplate(key, fullName);
    }
  },

  fillMessageToComposer(fullName) {
    const text = this.getFormattedTemplate(this.activeTemplateKey, fullName);
    const input = document.getElementById('message-input');
    if (input) {
      input.value = text;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      input.focus();
      input.setSelectionRange(text.length, text.length);
      App.notify('Şablon metni mesaj alanına dolduruldu. Düzenleyip Gönder butonuna basabilirsiniz.', 'info');
    }
  },

  async open(id) {
    this.selectedId = id;
    document.querySelectorAll('.conversation-item').forEach(item => {
      item.classList.toggle('active', item.id === `conv-item-${id}`);
    });

    const panel = document.getElementById('conversation-panel');
    if (!panel) return;

    try {
      const data = await App.api(`/api/conversations/${id}/messages`);
      const conv = data.conversation;
      const meta = this.platformMeta(conv.platform);
      const identifier = conv.platform === 'Instagram'
        ? (conv.phone ? App.formatPhone(conv.phone) : `Instagram ID: ${conv.external_contact_id}`)
        : (conv.phone ? App.formatPhone(conv.phone) : conv.external_contact_id);

      // Detect smart suggestion intent
      this.activeTemplateKey = this.detectSuggestionKey(conv, data.items || []);
      const suggestedText = this.getFormattedTemplate(this.activeTemplateKey, conv.full_name);

      // Track highest message ID for delta polling
      const msgIds = (data.items || []).map(m => m.id).filter(Boolean);
      this.lastMessageId = msgIds.length ? Math.max(...msgIds) : 0;

      panel.style.cssText = "height: 100% !important; max-height: 100% !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; overflow: hidden !important;";
      panel.innerHTML = `
        <!-- Chat Header -->
        <div class="chat-header" style="flex: 0 0 auto !important; min-height: 65px !important; display: flex !important; align-items: center !important; gap: 12px !important; padding: 12px 20px !important; border-bottom: 1px solid var(--glass-border); background: rgba(17,22,56,.88);">
          <div class="conversation-avatar ${meta.className}"><i class="${meta.icon}"></i></div>
          <div>
            <strong style="font-size: 15px; color: #ffffff; display: block; line-height: 1.2;">${App.escape(conv.full_name || 'Kullanıcı')}</strong>
            <span style="font-size: 11px; color: #94a3b8;">${App.escape(identifier)}</span>
            <small class="channel-label ${meta.className}" style="margin-left: 6px;">${meta.label}</small>
          </div>
          <div style="margin-left: auto; display: flex; gap: 8px; align-items: center;">
            <button class="btn btn-sm" style="background: rgba(255,255,255,0.08); color: #f8fafc; border: 1px solid rgba(255,255,255,0.15); font-weight: 500;" onclick="App.navigate('leads'); setTimeout(() => Leads.showDetail(${conv.lead_id}), 250)">
              <i class="ri-user-line" style="margin-right: 3px;"></i> Kişi Kartı
            </button>
            <button class="btn btn-sm" style="background: rgba(245, 158, 11, 0.15); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.35); font-weight: 500;" onclick="App.navigate('patients'); setTimeout(() => Patients.openNewPatientModal(${conv.lead_id}, { full_name: '${App.escape(conv.full_name)}', phone: '${App.escape(conv.phone || '')}' }), 250)">
              <i class="ri-user-add-line" style="margin-right: 3px;"></i> Hastaya Çevir
            </button>
            <button class="btn btn-sm" style="background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.35); font-weight: 500;" onclick="App.navigate('appointments'); setTimeout(() => Appointments.showForm(null, ${conv.lead_id}), 250)">
              <i class="ri-calendar-add-line" style="margin-right: 3px;"></i> Randevu Ver
            </button>
          </div>
        </div>

        <!-- Chat Message List -->
        <div id="message-list" class="message-list" style="flex: 1 1 auto !important; min-height: 0 !important; max-height: 100% !important; overflow-y: auto !important; padding: 20px !important;">
          ${data.items.length
            ? data.items.map(m => this.renderSingleMessageBubble(m)).join('')
            : App.emptyState('ri-message-3-line', 'Mesaj bulunamadı', 'Bu konuşmada henüz bir mesaj bulunmuyor.')}
        </div>

        <!-- Smart Personnel Assistant (100% Manual & Safe - Suggestion Bar) -->
        <div class="chat-assistant-bar">
          <div class="chat-assistant-header">
            <div class="chat-assistant-chips">
              <span class="chat-assistant-badge"><i class="ri-sparkling-fill"></i> Akıllı Yanıt Asistanı:</span>
              ${Object.entries(this.templates).map(([key, t]) => `
                <button type="button" class="chat-chip ${key === this.activeTemplateKey ? 'active' : ''}" data-key="${key}" onclick="Inbox.selectTemplateChip('${key}', '${App.escape(conv.full_name)}')">
                  ${t.title}
                </button>
              `).join('')}
            </div>
            <span class="chat-assistant-safety-tag" title="Otomatik gönderilmez; personelin onayına sunulur.">
              <i class="ri-shield-check-line" style="color: #10b981;"></i> Manuel Onaylı
            </span>
          </div>
          <div class="chat-suggestion-box">
            <div id="chat-suggestion-preview-text" class="chat-suggestion-text">${App.escape(suggestedText)}</div>
            <button type="button" class="chat-fill-btn" onclick="Inbox.fillMessageToComposer('${App.escape(conv.full_name)}')">
              <i class="ri-edit-2-line"></i> Mesaja Doldur
            </button>
          </div>
        </div>

        <!-- Chat Composer -->
        <form id="message-form" class="message-composer" style="flex: 0 0 auto !important; flex-shrink: 0 !important; display: flex !important; align-items: flex-end !important; gap: 10px !important; padding: 14px 18px !important; border-top: 1px solid var(--glass-border); background: rgba(17,22,56,.88);">
          <textarea id="message-input" name="text" rows="1" maxlength="4096" placeholder="${meta.label} üzerinden yanıt yazın... (Enter ile gönder)" required style="flex: 1 !important; min-height: 44px !important; max-height: 120px !important; border-radius: 10px; padding: 10px 14px; font-size: 13px; resize: none; background: rgba(255,255,255,0.06); color: #ffffff; border: 1px solid var(--glass-border);"></textarea>
          <button id="message-send-btn" class="btn btn-primary" type="submit" style="flex: 0 0 auto !important; height: 44px !important; padding: 0 20px !important; border-radius: 10px; display: flex !important; align-items: center !important; gap: 6px !important; font-weight: 600;">
            <i class="ri-send-plane-2-fill"></i>
            <span>Gönder</span>
          </button>
        </form>`;

      this.scrollToBottom();
      this.bindComposer(id);
      this.startPolling(id);
      App.refreshNavCounters();

    } catch (error) {
      console.error('Konuşma açılamadı:', error);
      panel.innerHTML = App.emptyState('ri-error-warning-line', 'Konuşma yüklenemedi', error.message);
    }
  },

  scrollToBottom(smooth = false) {
    const list = document.getElementById('message-list');
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }
  },

  bindComposer(id) {
    const form = document.getElementById('message-form');
    if (!form) return;
    const input = document.getElementById('message-input');

    // Auto resize textarea
    if (input) {
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          form.requestSubmit();
        }
      });
      input.focus();
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || this.isSending) return;

      this.isSending = true;
      const btn = document.getElementById('message-send-btn');
      if (btn) btn.disabled = true;

      // Optimistic message append
      const localId = 'temp-' + Date.now();
      const optimisticMsg = {
        id: 0,
        localId,
        conversation_id: id,
        direction: 'outgoing',
        message_type: 'text',
        text,
        delivery_status: 'sending',
        created_at: new Date().toISOString()
      };

      const list = document.getElementById('message-list');
      if (list) {
        const empty = list.querySelector('.empty-state');
        if (empty) empty.remove();
        list.insertAdjacentHTML('beforeend', this.renderSingleMessageBubble(optimisticMsg));
        this.scrollToBottom(true);
      }

      input.value = '';
      input.style.height = '44px';

      try {
        const result = await App.api(`/api/conversations/${id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text })
        });

        // Update optimistic bubble
        const bubble = document.getElementById(`msg-${localId}`) || document.querySelector(`.message-row.outgoing[data-mid="0"]`);
        if (bubble) {
          bubble.id = `msg-${result.message?.id || Date.now()}`;
          bubble.setAttribute('data-mid', result.message?.id || 0);
          const timeSpan = bubble.querySelector('span');
          if (timeSpan) {
            timeSpan.innerHTML = `${App.formatDate(result.message?.created_at || new Date().toISOString(), true)} · iletildi <i class="ri-check-double-line" style="color:#10b981;"></i>`;
          }
        }

        if (result.message?.id) {
          this.lastMessageId = Math.max(this.lastMessageId || 0, result.message.id);
        }

        // Update last message in sidebar
        this.updateSidebarItem(id, text, new Date().toISOString(), 0);

      } catch (error) {
        console.error('Mesaj gönderme hatası:', error);
        App.notify('Mesaj gönderilemedi: ' + error.message, 'error');
        const bubble = document.getElementById(`msg-${localId}`);
        if (bubble) {
          const timeSpan = bubble.querySelector('span');
          if (timeSpan) {
            timeSpan.innerHTML = `<span style="color:#ef4444;"><i class="ri-error-warning-fill"></i> Gönderilemedi</span>`;
          }
        }
      } finally {
        this.isSending = false;
        if (btn) btn.disabled = false;
      }
    });
  },

  updateSidebarItem(conversationId, lastMessage, timestamp, unreadDelta = 0) {
    const conv = this.items.find(c => c.id === conversationId);
    if (conv) {
      conv.last_message = lastMessage;
      conv.updated_at = timestamp || new Date().toISOString();
      if (unreadDelta !== 0 && this.selectedId !== conversationId) {
        conv.unread_count = (conv.unread_count || 0) + unreadDelta;
      }
    }
    const itemEl = document.getElementById(`conv-item-${conversationId}`);
    if (itemEl) {
      const msgP = itemEl.querySelector('.conv-last-msg');
      if (msgP) msgP.innerHTML = this.formatMessageText(lastMessage, null);
      const timeEl = itemEl.querySelector('time');
      if (timeEl) timeEl.textContent = App.formatRelative(timestamp);
      
      let badge = itemEl.querySelector('.unread-badge');
      if (conv && conv.unread_count > 0 && this.selectedId !== conversationId) {
        if (!badge) {
          itemEl.insertAdjacentHTML('beforeend', `<span class="unread-badge">${conv.unread_count}</span>`);
        } else {
          badge.textContent = conv.unread_count;
        }
      } else if (badge && this.selectedId === conversationId) {
        badge.remove();
      }
    }
  },

  onNewMessage(data) {
    if (!data) return;
    const { conversationId, message, fullName, platform } = data;
    if (!conversationId) return;

    // Update or insert conversation in this.items
    const existing = this.items.find(c => c.id === conversationId);
    if (existing) {
      existing.last_message = message?.text || existing.last_message;
      existing.updated_at = message?.created_at || new Date().toISOString();
      if (this.selectedId !== conversationId && message?.direction === 'incoming') {
        existing.unread_count = (existing.unread_count || 0) + 1;
      }
    } else {
      this.items.unshift({
        id: conversationId,
        full_name: fullName || 'Yeni Kullanıcı',
        platform: platform || 'Instagram',
        last_message: message?.text || '',
        unread_count: message?.direction === 'incoming' ? 1 : 0,
        updated_at: message?.created_at || new Date().toISOString()
      });
      const listEl = document.getElementById('conversation-items');
      if (listEl) {
        listEl.innerHTML = this.renderConversationListHtml(this.getVisibleItems());
      }
    }

    this.updateSidebarItem(conversationId, message?.text, message?.created_at, message?.direction === 'incoming' ? 1 : 0);

    // If this conversation is currently open
    if (this.selectedId === conversationId && message) {
      const list = document.getElementById('message-list');
      if (list) {
        // Check if there's an existing matching message or pending optimistic bubble
        const alreadyExists = message.id && list.querySelector(`[data-mid="${message.id}"]`);
        if (alreadyExists) return;

        // If it's an outgoing message, check if a pending optimistic bubble is waiting to be matched
        if (message.direction === 'outgoing') {
          const pendingBubble = list.querySelector('.message-row.outgoing[data-mid="0"]');
          if (pendingBubble) {
            pendingBubble.id = `msg-${message.id}`;
            pendingBubble.setAttribute('data-mid', message.id);
            const timeSpan = pendingBubble.querySelector('span');
            if (timeSpan) {
              timeSpan.innerHTML = `${App.formatDate(message.created_at, true)} · ${App.escape(message.delivery_status || 'iletildi')} <i class="ri-check-double-line" style="color:#10b981;"></i>`;
            }
            this.lastMessageId = Math.max(this.lastMessageId || 0, message.id || 0);
            return;
          }
        }

        const empty = list.querySelector('.empty-state');
        if (empty) empty.remove();
        list.insertAdjacentHTML('beforeend', this.renderSingleMessageBubble(message));
        this.scrollToBottom(true);
        this.lastMessageId = Math.max(this.lastMessageId || 0, message.id || 0);
      }
    }
  },

  startPolling(id) {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      if (this.selectedId !== id || App.currentPage !== 'inbox') {
        this.stopPolling();
        return;
      }
      try {
        const data = await App.api(`/api/conversations/${id}/messages?since_id=${this.lastMessageId || 0}`);
        if (data && data.items && data.items.length > 0) {
          const list = document.getElementById('message-list');
          if (list) {
            for (const msg of data.items) {
              if (!list.querySelector(`[data-mid="${msg.id}"]`)) {
                // If this is an outgoing msg matching a pending bubble, resolve it
                if (msg.direction === 'outgoing') {
                  const pending = list.querySelector('.message-row.outgoing[data-mid="0"]');
                  if (pending) {
                    pending.id = `msg-${msg.id}`;
                    pending.setAttribute('data-mid', msg.id);
                    this.lastMessageId = Math.max(this.lastMessageId, msg.id);
                    continue;
                  }
                }
                const empty = list.querySelector('.empty-state');
                if (empty) empty.remove();
                list.insertAdjacentHTML('beforeend', this.renderSingleMessageBubble(msg));
                this.lastMessageId = Math.max(this.lastMessageId, msg.id);
              }
            }
            this.scrollToBottom(true);
          }
        }
      } catch (err) {
        // Silently continue polling
      }
    }, 3500);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
};
