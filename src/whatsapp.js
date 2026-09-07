const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { db, normalizePhone, storeIncomingMessage, upsertLead, extractEmailFromText, inferInterest } = require('./meta');

let whatsappClient = null;
let qrCodeDataUrl = null;
let clientReady = false;

function initializeWhatsApp() {
  if (whatsappClient) {
    try {
      whatsappClient.destroy();
    } catch (e) {
      console.log('Eski WhatsApp istemcisi kapatılamadı:', e.message);
    }
  }

  whatsappClient = new Client({
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu']
    },
    authStrategy: new LocalAuth({
      dataPath: './data/whatsapp-session'
    })
  });

  whatsappClient.on('qr', async (qr) => {
    try {
      qrCodeDataUrl = await qrcode.toDataURL(qr);
      console.log('WhatsApp QR Kodu güncellendi. Arayüzden okutabilirsiniz.');
      clientReady = false;
    } catch (err) {
      console.error('QR Kod oluşturulamadı:', err);
    }
  });

  whatsappClient.on('ready', () => {
    console.log('WhatsApp Web istemcisi hazır!');
    qrCodeDataUrl = null;
    clientReady = true;
  });

  whatsappClient.on('authenticated', () => {
    console.log('WhatsApp kimlik doğrulaması başarılı.');
  });

  whatsappClient.on('auth_failure', (msg) => {
    console.error('WhatsApp kimlik doğrulama hatası (oturum düşmüş olabilir):', msg);
    clientReady = false;
    qrCodeDataUrl = null;
    // Note: LocalAuth normally requires manual folder deletion if corrupted,
    // but destroying and re-initializing will prompt for new QR if session is invalid.
    setTimeout(initializeWhatsApp, 5000);
  });

  whatsappClient.on('message_create', async (message) => {
    if (message.from === 'status@broadcast' || message.to === 'status@broadcast') return;
    
    // Check if message is outgoing (sent from the phone)
    const isOutgoing = message.fromMe;
    const waId = isOutgoing ? message.to : message.from;
    if (!waId || waId.endsWith('@g.us')) return; // Ignore groups

    let phoneNumeric = waId.split('@')[0];
    let fullName = 'WhatsApp Kullanıcısı';

    try {
      const contact = await whatsappClient.getContactById(waId);
      if (contact) {
        fullName = contact.pushname || contact.name || fullName;
        phoneNumeric = contact.number || phoneNumeric;
      }
    } catch (e) {
      // Ignore if contact can't be fetched
    }

    let text = message.body || '';
    if (message.type === 'location') text = '[Konum Paylaşıldı]';
    if (message.type === 'vcard') text = '[Kişi Kartı Paylaşıldı]';

    const timestamp = new Date().toISOString();
    
    let mediaId = null;
    let messageType = message.type || 'text';

    if (message.hasMedia) {
      try {
        const media = await message.downloadMedia();
        if (media && media.data) {
          const fs = require('fs');
          const path = require('path');
          let ext = media.mimetype ? media.mimetype.split('/')[1] : 'bin';
          if (ext && ext.includes(';')) ext = ext.split(';')[0];
          const filename = `wa_${message.id?.id || Date.now()}.${ext}`;
          const uploadPath = path.join(__dirname, '../public/uploads', filename);
          fs.writeFileSync(uploadPath, Buffer.from(media.data, 'base64'));
          mediaId = `/uploads/${filename}`;
        }
      } catch (err) {
        console.error('WhatsApp medya indirme hatası:', err.message);
      }
    }

    // Only update interest and email if it's an incoming message
    const interest = isOutgoing ? null : inferInterest(text);
    const email = isOutgoing ? null : extractEmailFromText(text);
    const firstMessage = isOutgoing ? null : text;

    const lead = upsertLead({
      fullName,
      phone: normalizePhone(phoneNumeric),
      whatsappId: waId,
      source: 'WhatsApp',
      interest,
      email,
      firstMessage,
      lastContactAt: timestamp
    });

    storeIncomingMessage({
      leadId: lead.leadId,
      platform: 'WhatsApp',
      externalContactId: waId,
      providerMessageId: message.id.id,
      messageType: messageType,
      text: text,
      mediaId: mediaId,
      timestamp,
      direction: isOutgoing ? 'outgoing' : 'incoming'
    });
  });

  whatsappClient.on('disconnected', async (reason) => {
    console.log('WhatsApp bağlantısı koptu:', reason);
    clientReady = false;
    qrCodeDataUrl = null;
    
    try {
      await whatsappClient.destroy();
    } catch (e) {}

    // Yeniden bağlanmaya çalış
    setTimeout(initializeWhatsApp, 5000);
  });

  whatsappClient.initialize().catch(err => {
    console.error('WhatsApp başlatma hatası:', err.message);
  });
}

async function syncWhatsAppHistory(waId, leadId) {
  if (!clientReady || !whatsappClient) {
    console.log('[WA-SYNC] Atlandı: clientReady=', clientReady);
    return;
  }
  try {
    console.log('[WA-SYNC] Başlatılıyor:', waId);
    const chat = await whatsappClient.getChatById(waId);
    if (!chat) {
      console.log('[WA-SYNC] Chat bulunamadı:', waId);
      return;
    }
    const messages = await chat.fetchMessages({ limit: 50 });
    console.log('[WA-SYNC] Çekilen mesaj sayısı:', messages.length);
    const { db } = require('./db');
    
    // Get conversation id for this waId
    const conv = db.prepare('SELECT id FROM conversations WHERE platform = ? AND external_contact_id = ?').get('WhatsApp', waId);
    if (!conv) {
      console.log('[WA-SYNC] Sistemde Conversation kaydı bulunamadı:', waId);
      return;
    }
    
    let inserted = 0, updated = 0, skipped = 0;
    
    for (const msg of messages) {
      if (msg.from === 'status@broadcast' || msg.to === 'status@broadcast') continue;
      
      const isOutgoing = msg.fromMe;
      const direction = isOutgoing ? 'outgoing' : 'incoming';
      const deliveryStatus = isOutgoing ? 'sent' : 'received';
      const messageType = msg.type || 'text';
      const msgTimestamp = new Date(msg.timestamp * 1000).toISOString();
      
      let text = msg.body || '';
      if (messageType === 'location') text = '[Konum Paylaşıldı]';
      if (messageType === 'vcard') text = '[Kişi Kartı Paylaşıldı]';
      if (messageType === 'e2e_notification' || messageType === 'gp2') continue; // Sistem/Güvenlik mesajlarını atla
      
      // Check if message already exists in DB
      const existing = db.prepare('SELECT id, direction FROM messages WHERE provider_message_id = ?').get(msg.id.id);
      
      if (existing) {
        // Fix direction if it was stored incorrectly (due to previous bug)
        if (existing.direction !== direction) {
          db.prepare('UPDATE messages SET direction = ?, delivery_status = ? WHERE id = ?')
            .run(direction, deliveryStatus, existing.id);
          updated++;
        } else {
          skipped++;
        }
        continue;
      }
      
      // New message not yet in DB — insert directly. We skip downloading media for old synced messages to save disk and API time.
      db.prepare(`INSERT OR IGNORE INTO messages
        (conversation_id, provider_message_id, direction, message_type, text, media_id, delivery_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
          conv.id,
          msg.id.id,
          direction,
          messageType,
          text,
          null, // skip old media downloads
          deliveryStatus,
          msgTimestamp
        );
      inserted++;
    }
    
    console.log(`[WA-SYNC] Tamamlandı: ${inserted} yeni mesaj eklendi, ${updated} yöneltme düzeltildi, ${skipped} zaten var.`);
    
    // Update conversation last_message from most recent message
    const lastMsg = db.prepare('SELECT text, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(conv.id);
    if (lastMsg) {
      db.prepare('UPDATE conversations SET last_message = ?, updated_at = ? WHERE id = ?').run(lastMsg.text, lastMsg.created_at, conv.id);
    }
  } catch (err) {
    console.error('[WA-SYNC] Hata:', err.message);
  }
}

async function sendWhatsAppMessage(to, text) {
  if (!whatsappClient) {
    throw new Error('WhatsApp servisi başlatılmamış.');
  }
  
  if (!clientReady) {
    // Wait up to 6 seconds for client to finish ready state
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (clientReady) break;
    }
  }

  if (!clientReady) {
    throw new Error('WhatsApp istemcisi henüz hazır değil. Lütfen birkaç saniye sonra tekrar deneyin veya Ayarlar bölümünden bağlantı durumunu kontrol edin.');
  }
  let chatId = to;
  if (!chatId.includes('@')) {
    if (chatId.startsWith('+')) chatId = chatId.substring(1);
    // WhatsApp's new LID format is often used for certain business interactions and has 15 digits
    if (chatId.length > 14) {
      chatId = `${chatId}@lid`;
    } else {
      chatId = `${chatId}@c.us`;
    }
  }
  
  try {
    const response = await whatsappClient.sendMessage(chatId, text);
    const msgId = response?.id?.id || `local-${Date.now()}`;
    return { demo: false, id: msgId, status: 'sent' };
  } catch (err) {
    console.error('WhatsApp Gönderme Hatası:', err);
    throw new Error('Mesaj gönderilemedi: ' + err.message);
  }
}

module.exports = {
  initializeWhatsApp,
  getWhatsAppStatus: () => ({ ready: clientReady, qr: qrCodeDataUrl }),
  sendWhatsAppMessage,
  syncWhatsAppHistory
};
