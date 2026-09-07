const crypto = require('crypto');
const axios = require('axios');
const config = require('./config');
const { db, transaction, nowIso } = require('./db');
const sse = require('./sse');
const { sendNotificationEmail } = require('./mailer');

function normalizePhone(value) {
  if (!value) return null;
  let digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('5')) digits = `90${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function displayPhone(normalized) {
  if (!normalized) return null;
  if (normalized.startsWith('90') && normalized.length === 12) {
    return `+90 ${normalized.slice(2, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8, 10)} ${normalized.slice(10, 12)}`;
  }
  return `+${normalized}`;
}

function extractPhoneFromText(text) {
  if (!text) return null;
  const matches = String(text).match(/(?:\+?90|0090|0)?\s*5\d{2}(?:[\s().-]*\d){7}/g) || [];
  for (const match of matches) {
    const normalized = normalizePhone(match);
    if (normalized) return normalized;
  }
  return null;
}

function extractEmailFromText(text) {
  if (!text) return null;
  const match = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function inferInterest(text) {
  const value = String(text || '').toLocaleLowerCase('tr-TR');
  const groups = [
    ['Burun Estetiği', ['burun', 'rinoplasti', 'septorinoplasti', 'nazal', 'kemer', 'burun ucu']],
    ['Nefes Problemi', ['nefes', 'deviasyon', 'septum', 'tıkanıklık', 'konka']],
    ['Revizyon Rinoplasti', ['revizyon', 'ikinci ameliyat', 'daha önce ameliyat']],
    ['Randevu', ['randevu', 'muayene', 'görüşme']],
    ['Fiyat Bilgisi', ['fiyat', 'ücret', 'maliyet', 'kaç tl']]
  ];
  for (const [label, keywords] of groups) {
    if (keywords.some(keyword => value.includes(keyword))) return label;
  }
  return null;
}


function chooseInterest(current, incoming) {
  if (!incoming) return current || null;
  if (!current) return incoming;
  const priority = {
    'Burun Estetiği': 100,
    'Revizyon Rinoplasti': 100,
    'Nefes Problemi': 90,
    'Randevu': 20,
    'Fiyat Bilgisi': 10
  };
  return (priority[incoming] || 50) > (priority[current] || 50) ? incoming : current;
}

function latestIso(...values) {
  return values.filter(Boolean).sort().at(-1) || nowIso();
}

function mergeSource(current, incoming) {
  const sources = new Set(String(current || '').split(' + ').map(v => v.trim()).filter(Boolean));
  if (incoming) sources.add(incoming);
  return [...sources].join(' + ');
}

function appendNote(current, incoming) {
  const a = String(current || '').trim();
  const b = String(incoming || '').trim();
  if (!b) return a || null;
  if (!a) return b;
  if (a.includes(b)) return a;
  return `${a}\n\n${b}`;
}

function addActivity(leadId, type, source, title, detail) {
  db.prepare(`INSERT INTO lead_activities (lead_id, type, source, title, detail, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`).run(leadId, type, source || null, title, detail || null, nowIso());
}

function findCampaign(meta = {}) {
  const ids = [
    ['meta_ad_id', meta.ad_id],
    ['meta_adset_id', meta.adset_id],
    ['meta_campaign_id', meta.campaign_id],
    ['form_id', meta.form_id]
  ];
  for (const [column, value] of ids) {
    if (!value) continue;
    const found = db.prepare(`SELECT id FROM campaigns WHERE ${column} = ? LIMIT 1`).get(String(value));
    if (found) return found.id;
  }
  const campaignName = meta.campaign_name || 'Instagram Lead Formları Kampanyası';
  const found = db.prepare('SELECT id FROM campaigns WHERE lower(name) = lower(?) LIMIT 1').get(campaignName);
  if (found) return found.id;
  const ts = nowIso();
  const result = db.prepare(`INSERT INTO campaigns
    (name, platform, status, meta_campaign_id, meta_adset_id, meta_ad_id, form_id, created_at, updated_at)
    VALUES (?, 'Instagram', 'Aktif', ?, ?, ?, ?, ?, ?)`).run(
      campaignName,
      meta.campaign_id || null,
      meta.adset_id || null,
      meta.ad_id || null,
      meta.form_id || null,
      ts,
      ts
    );
  return Number(result.lastInsertRowid);
}

function leadMatches(input) {
  const normalized = normalizePhone(input.phone || input.whatsappId);
  const found = new Map();
  const add = row => { if (row) found.set(row.id, row); };
  if (input.metaLeadId) add(db.prepare('SELECT * FROM leads WHERE meta_lead_id = ?').get(String(input.metaLeadId)));
  if (input.whatsappId) add(db.prepare('SELECT * FROM leads WHERE whatsapp_id = ?').get(String(input.whatsappId)));
  if (input.instagramScopedId) add(db.prepare('SELECT * FROM leads WHERE instagram_scoped_id = ?').get(String(input.instagramScopedId)));
  if (normalized) add(db.prepare('SELECT * FROM leads WHERE phone_normalized = ?').get(normalized));
  if (input.email) add(db.prepare('SELECT * FROM leads WHERE lower(email) = lower(?)').get(String(input.email)));
  return { matches: [...found.values()], normalized };
}

function mergeConversationRows(targetLeadId, sourceLeadId) {
  const conversations = db.prepare('SELECT * FROM conversations WHERE lead_id = ?').all(sourceLeadId);
  for (const conversation of conversations) {
    const existing = db.prepare(`SELECT * FROM conversations
      WHERE lead_id = ? AND platform = ? AND external_contact_id = ? LIMIT 1`).get(
        targetLeadId,
        conversation.platform,
        conversation.external_contact_id
      );
    if (!existing) {
      db.prepare('UPDATE conversations SET lead_id = ? WHERE id = ?').run(targetLeadId, conversation.id);
      continue;
    }
    const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at').all(conversation.id);
    for (const message of messages) {
      db.prepare(`INSERT OR IGNORE INTO messages
        (conversation_id, provider_message_id, direction, message_type, text, media_id, delivery_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
          existing.id,
          message.provider_message_id,
          message.direction,
          message.message_type,
          message.text,
          message.media_id,
          message.delivery_status,
          message.created_at
        );
    }
    db.prepare(`UPDATE conversations SET
      last_message = COALESCE(?, last_message),
      unread_count = unread_count + ?,
      updated_at = CASE WHEN updated_at < ? THEN ? ELSE updated_at END
      WHERE id = ?`).run(
        conversation.last_message,
        conversation.unread_count || 0,
        conversation.updated_at,
        conversation.updated_at,
        existing.id
      );
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conversation.id);
  }
}

function mergeLeadRows(target, source) {
  if (!source || target.id === source.id) return target;
  mergeConversationRows(target.id, source.id);
  db.prepare('UPDATE lead_activities SET lead_id = ? WHERE lead_id = ?').run(target.id, source.id);
  db.prepare('UPDATE appointments SET lead_id = ? WHERE lead_id = ?').run(target.id, source.id);
  const combined = {
    ...target,
    full_name: target.full_name && target.full_name !== 'İsimsiz Lead' ? target.full_name : source.full_name,
    phone: target.phone || source.phone,
    phone_normalized: target.phone_normalized || source.phone_normalized,
    email: target.email || source.email,
    interest: target.interest || source.interest,
    source: mergeSource(target.source, source.source),
    campaign_id: target.campaign_id || source.campaign_id,
    meta_lead_id: target.meta_lead_id || source.meta_lead_id,
    whatsapp_id: target.whatsapp_id || source.whatsapp_id,
    instagram_username: target.instagram_username || source.instagram_username,
    instagram_scoped_id: target.instagram_scoped_id || source.instagram_scoped_id,
    consent_status: target.consent_status !== 'Belirtilmedi' ? target.consent_status : source.consent_status,
    first_message: target.first_message || source.first_message,
    notes: appendNote(target.notes, source.notes),
    first_contact_at: [target.first_contact_at, source.first_contact_at].filter(Boolean).sort()[0] || target.created_at,
    last_contact_at: [target.last_contact_at, source.last_contact_at].filter(Boolean).sort().at(-1) || target.updated_at
  };
  db.prepare('DELETE FROM leads WHERE id = ?').run(source.id);
  db.prepare(`UPDATE leads SET full_name = ?, phone = ?, phone_normalized = ?, email = ?, interest = ?, source = ?,
    campaign_id = ?, meta_lead_id = ?, whatsapp_id = ?, instagram_username = ?, instagram_scoped_id = ?,
    consent_status = ?, first_message = ?, notes = ?, first_contact_at = ?, last_contact_at = ?, updated_at = ?
    WHERE id = ?`).run(
      combined.full_name,
      combined.phone,
      combined.phone_normalized,
      combined.email,
      combined.interest,
      combined.source,
      combined.campaign_id,
      combined.meta_lead_id,
      combined.whatsapp_id,
      combined.instagram_username,
      combined.instagram_scoped_id,
      combined.consent_status || 'Belirtilmedi',
      combined.first_message,
      combined.notes,
      combined.first_contact_at,
      combined.last_contact_at,
      nowIso(),
      target.id
    );
  addActivity(target.id, 'lead_merged', 'Otomatik Eşleştirme', 'Mükerrer kişi kayıtları otomatik birleştirildi', `Birleştirilen kayıt: ${source.id}`);
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(target.id);
}

function upsertLead(input) {
  return transaction(() => {
    const { matches, normalized } = leadMatches(input);
    const ts = nowIso();
    let existing = null;
    if (matches.length) {
      existing = [...matches].sort((a, b) => {
        const score = row => Number(Boolean(row.meta_lead_id)) * 8 + Number(Boolean(row.phone_normalized)) * 4 + Number(Boolean(row.instagram_scoped_id)) * 2 + Number(Boolean(row.whatsapp_id));
        return score(b) - score(a) || a.id - b.id;
      })[0];
      for (const duplicate of matches) {
        if (duplicate.id !== existing.id) existing = mergeLeadRows(existing, duplicate);
      }
    }

    if (existing) {
      const genericNames = new Set(['İsimsiz Lead', 'WhatsApp Kullanıcısı', 'Instagram Kullanıcısı']);
      const fullName = input.fullName && !genericNames.has(input.fullName)
        ? input.fullName
        : existing.full_name || input.fullName || 'İsimsiz Lead';
      const mergedSource = mergeSource(existing.source, input.source);
      const mergedNotes = appendNote(existing.notes, input.notes);
      const previousPhoneNormalized = existing.phone_normalized;
      db.prepare(`UPDATE leads SET
        full_name = ?, phone = ?, phone_normalized = ?, email = ?, interest = ?, source = ?,
        campaign_id = COALESCE(?, campaign_id), meta_lead_id = COALESCE(?, meta_lead_id),
        whatsapp_id = COALESCE(?, whatsapp_id), instagram_username = COALESCE(?, instagram_username),
        instagram_scoped_id = COALESCE(?, instagram_scoped_id), consent_status = ?,
        first_message = COALESCE(first_message, ?), notes = ?, last_contact_at = ?, updated_at = ? WHERE id = ?`).run(
          fullName,
          normalized ? displayPhone(normalized) : existing.phone,
          normalized || existing.phone_normalized,
          input.email || existing.email,
          chooseInterest(existing.interest, input.interest),
          mergedSource,
          input.campaignId || null,
          input.metaLeadId || null,
          input.whatsappId || null,
          input.instagramUsername || null,
          input.instagramScopedId || null,
          input.consentStatus || existing.consent_status || 'Belirtilmedi',
          input.firstMessage || null,
          mergedNotes,
          latestIso(existing.last_contact_at, input.lastContactAt, ts),
          ts,
          existing.id
        );
      addActivity(existing.id, 'lead_updated', input.source, `${input.source || 'Kanal'} bilgisi kişi kartına otomatik işlendi`, input.firstMessage || null);
      sse.broadcast('new_message', { leadId: existing.id, source: input.source, fullName });
      
      if (!previousPhoneNormalized && normalized) {
        sendNotificationEmail({
          fullName,
          phone: displayPhone(normalized),
          phone_normalized: normalized,
          interest: chooseInterest(existing.interest, input.interest),
          source: mergedSource,
          status: existing.status
        });
      }
      
      return { leadId: existing.id, created: false };
    }

    const spamKeywords = [
      'eczane', 'hastane', 'hospital', 'kargo', 'fatura', 'borç', 'sayın müşterimiz', 'kurye', 
      'sipariş', 'onay kodu', 'iptal', 'kampanya', 'satış', 'losante', 'lösante', 'medikal', 
      'klinik', 'ticaret', 'ltd', 'şti', 'ajans', 'sigorta', 'bank', 'reklam', 'işbirliği', 
      'kolay gelsin', 'trendyol', 'hepsiburada', 'amazon', 'iş başvurusu', 'cv', 'esin yalçınkaya'
    ];
    
    let initialStatus = 'Yeni';
    
    // Hem isme hem de ilk mesaja göre "İlgisiz" (B2B veya Spam) filtresi yapalım
    const nameToCheck = (input.fullName || '').toLowerCase();
    const msgToCheck = (input.firstMessage || '').toLowerCase();
    
    if (spamKeywords.some(kw => nameToCheck.includes(kw) || msgToCheck.includes(kw))) {
      initialStatus = 'İlgisiz';
    }

    const result = db.prepare(`INSERT INTO leads
      (full_name, phone, phone_normalized, email, interest, source, status, campaign_id, meta_lead_id,
       whatsapp_id, instagram_username, instagram_scoped_id, consent_status, first_message, notes,
       first_contact_at, last_contact_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        input.fullName || 'İsimsiz Lead',
        displayPhone(normalized),
        normalized,
        input.email || null,
        input.interest || null,
        input.source || 'Otomatik',
        initialStatus,
        input.campaignId || null,
        input.metaLeadId || null,
        input.whatsappId || null,
        input.instagramUsername || null,
        input.instagramScopedId || null,
        input.consentStatus || 'Belirtilmedi',
        input.firstMessage || null,
        input.notes || null,
        input.firstContactAt || ts,
        input.lastContactAt || ts,
        ts,
        ts
      );
    const leadId = Number(result.lastInsertRowid);
    addActivity(leadId, 'lead_created', input.source, `Yeni ${input.source || 'lead'} kaydı otomatik oluşturuldu`, input.firstMessage || null);
    sse.broadcast('new_lead', { leadId, source: input.source, fullName: input.fullName || 'İsimsiz Lead' });
    
    if (normalized) {
      sendNotificationEmail({
        fullName: input.fullName || 'İsimsiz Lead',
        phone: displayPhone(normalized),
        phone_normalized: normalized,
        interest: input.interest || null,
        source: input.source || 'Otomatik',
        status: 'Yeni'
      });
    }
    
    return { leadId, created: true };
  });
}

function flattenFieldData(fieldData = []) {
  const values = {};
  for (const field of fieldData) {
    const key = String(field.name || '').toLocaleLowerCase('tr-TR');
    const value = Array.isArray(field.values) ? field.values.join(', ') : String(field.values || '');
    values[key] = value;
  }
  return values;
}

function firstMatching(values, names) {
  for (const name of names) {
    if (values[name]) return values[name];
  }
  const key = Object.keys(values).find(k => names.some(name => k.includes(name)));
  return key ? values[key] : null;
}

async function fetchLeadDetails(leadgenId) {
  if (!config.meta.pageAccessToken) throw new Error('META_PAGE_ACCESS_TOKEN tanımlı değil.');
  const baseUrl = `https://graph.facebook.com/${config.meta.graphVersion}`;
  const response = await axios.get(`${baseUrl}/${encodeURIComponent(leadgenId)}`, {
    params: {
      fields: 'id,created_time,ad_id,form_id,field_data',
      access_token: config.meta.pageAccessToken
    },
    timeout: 15000
  });
  const details = response.data;
  if (details.ad_id) {
    try {
      const adResponse = await axios.get(`${baseUrl}/${encodeURIComponent(details.ad_id)}`, {
        params: {
          fields: 'id,name,adset{id,name},campaign{id,name}',
          access_token: config.meta.pageAccessToken
        },
        timeout: 15000
      });
      const ad = adResponse.data || {};
      details.ad_name = ad.name || null;
      details.adset_id = ad.adset?.id || null;
      details.adset_name = ad.adset?.name || null;
      details.campaign_id = ad.campaign?.id || null;
      details.campaign_name = ad.campaign?.name || null;
    } catch (error) {
      console.warn('Meta reklam ayrıntısı alınamadı:', error.response?.data?.error?.message || error.message);
    }
  }
  return details;
}

async function processLeadgen(change) {
  const value = change.value || {};
  const leadgenId = value.leadgen_id;
  if (!leadgenId) return null;
  const details = await fetchLeadDetails(leadgenId);
  const fields = flattenFieldData(details.field_data);
  const campaignId = findCampaign(details);
  const fullName = firstMatching(fields, ['full_name', 'name', 'ad_soyad', 'isim']);
  const phone = firstMatching(fields, ['phone_number', 'phone', 'telefon']);
  const email = firstMatching(fields, ['email', 'e_posta']);
  const interest = firstMatching(fields, ['interest', 'procedure', 'treatment', 'islem', 'işlem', 'ilgilenilen']);
  const consent = firstMatching(fields, ['consent', 'izin', 'kvkk']) || 'Meta formu üzerinden alındı';
  const extras = Object.entries(fields)
    .filter(([key]) => !['full_name', 'name', 'phone_number', 'phone', 'email'].includes(key))
    .map(([key, val]) => `${key}: ${val}`).join('\n');

  return upsertLead({
    fullName,
    phone,
    email,
    interest,
    source: 'Instagram Formu',
    campaignId,
    metaLeadId: details.id || leadgenId,
    instagramUsername: config.meta.instagramUsername,
    consentStatus: consent,
    notes: extras || null,
    firstContactAt: details.created_time || nowIso(),
    lastContactAt: details.created_time || nowIso()
  });
}

function extractMessageText(message = {}) {
  if (message.text?.body) return message.text.body;
  if (typeof message.text === 'string') return message.text;
  if (message.button?.text) return message.button.text;
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title;
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title;
  if (message.image?.caption) return message.image.caption;
  if (message.document?.caption) return message.document.caption;
  if (message.quick_reply?.payload) return message.quick_reply.payload;
  if (message.referral?.headline) return message.referral.headline;
  if (message.reaction?.emoji) return message.reaction.emoji;
  if (message.attachments?.length) return `[${message.attachments[0]?.type || 'ek'}]`;
  return `[${message.type || 'mesaj'}]`;
}

function storeIncomingMessage({ leadId, platform, externalContactId, providerMessageId, messageType, text, mediaId, timestamp, direction = 'incoming' }) {
  let conversation = db.prepare('SELECT * FROM conversations WHERE platform = ? AND external_contact_id = ?').get(platform, externalContactId);
  const unreadIncrement = direction === 'incoming' ? 1 : 0;
  
  if (!conversation) {
    const created = db.prepare(`INSERT INTO conversations
      (lead_id, platform, external_contact_id, last_message, unread_count, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Açık', ?, ?)`).run(leadId, platform, externalContactId, text, unreadIncrement, timestamp, timestamp);
    conversation = { id: Number(created.lastInsertRowid), lead_id: leadId, platform, external_contact_id: externalContactId };
  } else {
    db.prepare(`UPDATE conversations SET lead_id = ?, last_message = ?, unread_count = unread_count + ?, updated_at = ? WHERE id = ?`).run(
      leadId,
      text,
      unreadIncrement,
      timestamp,
      conversation.id
    );
  }
  
  // Check if identical message was already saved recently (within 25 seconds)
  const recentDup = db.prepare(`
    SELECT * FROM messages 
    WHERE conversation_id = ? 
      AND direction = ? 
      AND text = ? 
      AND abs(strftime('%s', created_at) - strftime('%s', ?)) <= 25
    ORDER BY id DESC LIMIT 1
  `).get(conversation.id, direction, text, timestamp);

  let messageId;
  let isNew = false;

  if (recentDup) {
    messageId = recentDup.id;
    if (providerMessageId && !recentDup.provider_message_id) {
      db.prepare('UPDATE messages SET provider_message_id = ? WHERE id = ?').run(providerMessageId, messageId);
    }
  } else {
    const insertResult = db.prepare(`INSERT OR IGNORE INTO messages
      (conversation_id, provider_message_id, direction, message_type, text, media_id, delivery_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        conversation.id,
        providerMessageId || null,
        direction,
        messageType || 'text',
        text,
        mediaId || null,
        direction === 'incoming' ? 'received' : 'sent',
        timestamp
      );
    messageId = Number(insertResult.lastInsertRowid || 0);
    isNew = true;

    if (direction === 'incoming') {
      addActivity(leadId, 'message_received', platform, `${platform} mesajı otomatik alındı`, text);
    } else {
      addActivity(leadId, 'message_sent', platform, `${platform} üzerinden mesaj gönderildi (Harici cihaz)`, text);
    }
  }

  if (isNew) {
    const lead = db.prepare('SELECT full_name, phone FROM leads WHERE id = ?').get(leadId);
    const msgObj = {
      id: messageId,
      conversation_id: conversation.id,
      provider_message_id: providerMessageId || null,
      direction,
      message_type: messageType || 'text',
      text,
      media_id: mediaId || null,
      delivery_status: direction === 'incoming' ? 'received' : 'sent',
      created_at: timestamp
    };

    sse.broadcast('new_message', {
      conversationId: conversation.id,
      leadId,
      platform,
      externalContactId,
      fullName: lead?.full_name || 'Kullanıcı',
      phone: lead?.phone || null,
      message: msgObj
    });
  }
  
  return conversation.id;
}

async function fetchInstagramProfile(instagramScopedId) {
  const token = config.instagram.accessToken || config.meta.pageAccessToken;
  if (!token || !instagramScopedId) return null;
  const candidates = [
    `${config.instagram.apiBase}/${config.meta.graphVersion}/${encodeURIComponent(instagramScopedId)}`,
    `${config.instagram.apiBase}/${encodeURIComponent(instagramScopedId)}`,
    `https://graph.facebook.com/${config.meta.graphVersion}/${encodeURIComponent(instagramScopedId)}`
  ];
  for (const url of candidates) {
    try {
      const response = await axios.get(url, {
        params: { fields: 'name,username,profile_pic', access_token: token },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
      if (response.data) return response.data;
    } catch (error) {
      const status = error.response?.status;
      if (status && status !== 400 && status !== 404) console.warn('Instagram profil bilgisi alınamadı:', error.response?.data?.error?.message || error.message);
    }
  }
  return null;
}

function normalizeInstagramMessageEvent(event) {
  const message = event.message || event.value?.message || {};
  const senderId = event.sender?.id || event.value?.sender?.id || event.from?.id || event.value?.from?.id;
  const recipientId = event.recipient?.id || event.value?.recipient?.id || event.to?.id || event.value?.to?.id;
  const timestampRaw = event.timestamp || event.time || event.value?.timestamp || Date.now();
  const timestamp = Number(timestampRaw) > 10_000_000_000
    ? new Date(Number(timestampRaw)).toISOString()
    : new Date(Number(timestampRaw) * 1000).toISOString();
  return {
    senderId,
    recipientId,
    timestamp,
    message,
    postback: event.postback || event.value?.postback || null,
    reaction: event.reaction || event.value?.reaction || null
  };
}

async function processInstagramMessagingEvents(events = []) {
  const results = [];
  for (const rawEvent of events) {
    const event = normalizeInstagramMessageEvent(rawEvent);
    if (!event.senderId || !event.recipientId) continue;
    
    // Mesaj, buton tıklaması (postback) veya reaksiyon (emoji) işleme
    const hasMessage = Boolean(rawEvent.message || event.message?.mid || event.message?.text || event.message?.attachments);
    const hasPostback = Boolean(event.postback);
    const hasReaction = Boolean(event.reaction);

    if (!hasMessage && !hasPostback && !hasReaction) {
      continue; // read, delivery vb. olayları yoksay
    }

    const isOutgoing = (event.message?.is_echo === true) || 
                       (config.instagram.accountId && String(event.senderId) === String(config.instagram.accountId));

    const externalContactId = isOutgoing ? event.recipientId : event.senderId;

    // Kendimize mesaj atmışsak (veya echo değilse bile sender=recipient) yoksay
    if (String(externalContactId) === String(config.instagram.accountId)) continue;

    const profile = await fetchInstagramProfile(externalContactId);
    let text = '';
    let messageType = 'text';

    if (hasReaction) {
      messageType = 'reaction';
      text = event.reaction?.action === 'unreact' ? '[İfade Kaldırıldı]' : `[İfade: ${event.reaction?.emoji || '❤️'}]`;
    } else if (hasPostback) {
      messageType = 'postback';
      text = event.postback?.title || event.postback?.payload || '[Menü Seçimi]';
    } else {
      text = extractMessageText(event.message);
      if (event.message?.attachments?.length) {
        messageType = event.message.attachments[0]?.type || 'image';
      }
    }

    const phone = extractPhoneFromText(text);
    const email = extractEmailFromText(text);
    
    const lead = upsertLead({
        fullName: profile?.name || profile?.username || 'Instagram Kullanıcısı',
        phone,
        email: isOutgoing ? null : email,
        interest: isOutgoing ? null : inferInterest(text),
        source: 'Instagram DM',
        instagramUsername: profile?.username || null,
        instagramScopedId: String(externalContactId),
        firstMessage: isOutgoing ? null : text,
        notes: (!isOutgoing && phone) ? 'Telefon numarası Instagram mesajından otomatik algılandı.' : null,
        lastContactAt: event.timestamp
    });
    
    const attachment = event.message?.attachments?.[0];
    const mediaId = attachment?.payload?.url || attachment?.payload?.id || null;

    const conversationId = storeIncomingMessage({
        leadId: lead.leadId,
        platform: 'Instagram',
        externalContactId: String(externalContactId),
        providerMessageId: event.message?.mid || rawEvent.mid || event.reaction?.mid || null,
        messageType,
        text,
        mediaId,
        timestamp: event.timestamp,
        direction: isOutgoing ? 'outgoing' : 'incoming'
    });
    results.push({ ...lead, conversationId });
  }
  return results;
}

function isWhatsAppValue(value = {}) {
  return value.messaging_product === 'whatsapp' || Boolean(value.metadata?.phone_number_id) || Array.isArray(value.contacts) || Array.isArray(value.statuses);
}

function verifySignature(rawBody, signature) {
  if (!config.meta.appSecret) return true;
  if (!signature || !signature.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', config.meta.appSecret).update(rawBody).digest('hex');
  const actual = signature.slice(7);
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function saveWebhookEvent(provider, eventType, payload) {
  const raw = JSON.stringify(payload);
  const eventHash = crypto.createHash('sha256').update(raw).digest('hex');
  const result = db.prepare(`INSERT OR IGNORE INTO webhook_events
    (event_hash, provider, event_type, payload, processing_status, received_at)
    VALUES (?, ?, ?, ?, 'received', ?)`).run(eventHash, provider, eventType, raw, nowIso());
  return { eventHash, inserted: result.changes > 0 };
}

async function processLeadgen(change = {}) {
  const value = change.value || {};
  const leadgenId = value.leadgen_id;
  const formId = value.form_id;
  const adId = value.ad_id;

  if (!leadgenId) return null;

  const token = config.meta.adAccessToken || config.meta.pageAccessToken || config.instagram.accessToken;
  let leadData = null;

  if (token) {
    const urls = [
      `https://graph.facebook.com/${config.meta.graphVersion}/${encodeURIComponent(leadgenId)}`,
      `https://graph.facebook.com/${encodeURIComponent(leadgenId)}`,
      `https://graph.instagram.com/${config.meta.graphVersion}/${encodeURIComponent(leadgenId)}`
    ];

    for (const url of urls) {
      try {
        const response = await axios.get(url, {
          params: { access_token: token.trim() },
          headers: { Authorization: `Bearer ${token.trim()}` },
          timeout: 15000
        });
        if (response.data) {
          leadData = response.data;
          break;
        }
      } catch (err) {
        // continue
      }
    }
  }

  let fullName = 'Meta Lead Ads Formu';
  let phone = null;
  let email = null;
  let interest = 'Burun Estetiği';
  const customFields = {};

  if (leadData && Array.isArray(leadData.field_data)) {
    for (const field of leadData.field_data) {
      const name = (field.name || '').toLowerCase();
      const val = Array.isArray(field.values) ? field.values[0] : field.values;
      if (!val) continue;

      if (name.includes('full_name') || name.includes('name') || name.includes('ad') || name.includes('isim')) {
        fullName = String(val).trim();
      } else if (name.includes('phone') || name.includes('tel') || name.includes('numara')) {
        phone = String(val).trim();
      } else if (name.includes('email') || name.includes('posta') || name.includes('mail')) {
        email = String(val).trim();
      } else if (name.includes('interest') || name.includes('islem') || name.includes('işlem') || name.includes('tedavi')) {
        interest = String(val).trim();
      } else {
        customFields[field.name] = val;
      }
    }
  }

  let campaignId = null;
  if (formId) {
    const camp = db.prepare('SELECT id FROM campaigns WHERE form_id = ? OR meta_ad_id = ?').get(formId, adId);
    if (camp) campaignId = camp.id;
  }

  const result = upsertLead({
    fullName,
    phone: normalizePhone(phone) || phone,
    email,
    interest: interest || inferInterest(Object.values(customFields).join(' ')),
    source: 'Meta Lead Ads Formu',
    campaignId,
    metaLeadId: String(leadgenId),
    consentStatus: 'Form Onaylandı',
    firstMessage: Object.keys(customFields).length ? JSON.stringify(customFields) : null,
    notes: `Form ID: ${formId || '-'}, Reklam ID: ${adId || '-'}`
  });

  return result;
}

async function processWebhook(payload) {
  const object = payload.object || 'unknown';
  const saved = saveWebhookEvent('Meta', object, payload);
  if (!saved.inserted) return { duplicate: true, processed: 0 };
  let processed = 0;
  try {
    for (const entry of payload.entry || []) {
      if (Array.isArray(entry.messaging) && entry.messaging.length) {
        processed += (await processInstagramMessagingEvents(entry.messaging)).length;
      }
      for (const change of entry.changes || []) {
        if (change.field === 'leadgen') {
          await processLeadgen(change);
          processed += 1;
          continue;
        }
        if (change.field === 'messages') {
          const value = change.value || {};
          const events = Array.isArray(value.messages)
            ? value.messages.map(message => ({ ...value, message }))
            : [value];
          processed += (await processInstagramMessagingEvents(events)).length;
        }
      }
    }
    db.prepare(`UPDATE webhook_events SET processing_status = 'processed', processed_at = ? WHERE event_hash = ?`).run(nowIso(), saved.eventHash);
    return { duplicate: false, processed };
  } catch (error) {
    db.prepare(`UPDATE webhook_events SET processing_status = 'failed', error_message = ?, processed_at = ? WHERE event_hash = ?`).run(
      String(error.message || error).slice(0, 1000),
      nowIso(),
      saved.eventHash
    );
    throw error;
  }
}



async function sendInstagramMessage(to, text) {
  const token = (config.instagram.accessToken || config.meta.pageAccessToken || '').trim();
  const accountId = config.instagram.accountId || config.meta.pageId;
  if (!token) return { demo: true, id: `demo-ig-${Date.now()}`, status: 'mock-sent' };

  const attempts = [
    {
      url: `https://graph.instagram.com/${config.meta.graphVersion}/me/messages`,
      body: { recipient: { id: String(to) }, message: { text } }
    },
    {
      url: `https://graph.instagram.com/me/messages`,
      body: { recipient: { id: String(to) }, message: { text } }
    },
    {
      url: `${config.instagram.apiBase}/${config.meta.graphVersion}/${encodeURIComponent(accountId)}/messages`,
      body: { recipient: { id: String(to) }, message: { text } }
    },
    {
      url: `https://graph.facebook.com/${config.meta.graphVersion}/me/messages`,
      body: { recipient: { id: String(to) }, message: { text }, messaging_type: 'RESPONSE' }
    }
  ];
  let lastError;
  for (const attempt of attempts) {
    try {
      const response = await axios.post(attempt.url, attempt.body, {
        params: { access_token: token },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });
      return {
        demo: false,
        id: response.data?.message_id || response.data?.messages?.[0]?.id || `ig-${Date.now()}`,
        status: 'sent',
        raw: response.data
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError?.response?.data?.error?.message || lastError?.message || 'Instagram mesajı gönderilemedi.');
}

async function syncCampaignsFromMeta() {
  const accountId = config.meta.adAccountId;
  const token = config.meta.adAccessToken;
  
  if (!accountId || !token) {
    throw new Error('META_AD_ACCOUNT_ID veya yetkili Access Token bulunamadı. Lütfen sistem ayarlarından Reklam Hesabı kimlik bilgilerinizi girin (Eksik yetki).');
  }

  const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const baseUrl = `https://graph.facebook.com/${config.meta.graphVersion}`;
  let allCampaigns = [];
  
  try {
    let nextUrl = `${baseUrl}/${encodeURIComponent(actId)}/campaigns?fields=id,name,status,start_time,stop_time,insights{spend,impressions,clicks,actions}&limit=100&access_token=${token}`;
    
    while (nextUrl) {
      const response = await axios.get(nextUrl, { timeout: 20000 });
      if (response.data && response.data.data) {
        allCampaigns = allCampaigns.concat(response.data.data);
      }
      nextUrl = response.data?.paging?.next || null;
    }

    let syncedCount = 0;
    for (const camp of allCampaigns) {
      const insights = camp.insights?.data?.[0] || {};
      const spend = insights.spend || 0;
      const impressions = insights.impressions || 0;
      const clicks = insights.clicks || 0;
      let metaResults = 0;
      
      if (insights.actions) {
        const leadAction = insights.actions.find(a => a.action_type === 'lead');
        if (leadAction) metaResults = leadAction.value;
      }
      
      const statusMap = {
        'ACTIVE': 'Aktif',
        'PAUSED': 'Duraklatıldı',
        'DELETED': 'Silindi',
        'ARCHIVED': 'Arşivlendi'
      };
      const status = statusMap[camp.status] || 'Bilinmiyor';
      
      const existing = db.prepare('SELECT id FROM campaigns WHERE meta_campaign_id = ?').get(camp.id);
      const ts = nowIso();
      
      if (existing) {
        db.prepare('UPDATE campaigns SET name = ?, status = ?, spent = ?, impressions = ?, clicks = ?, meta_results = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?')
          .run(camp.name, status, Number(spend), Number(impressions), Number(clicks), Number(metaResults), camp.start_time || null, camp.stop_time || null, ts, existing.id);
      } else {
        db.prepare(`INSERT INTO campaigns (name, platform, status, meta_campaign_id, spent, impressions, clicks, meta_results, start_date, end_date, created_at, updated_at) 
                    VALUES (?, 'Instagram', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(camp.name, status, camp.id, Number(spend), Number(impressions), Number(clicks), Number(metaResults), camp.start_time || null, camp.stop_time || null, ts, ts);
      }
      syncedCount++;
    }
    
    // Ad Sets
    let allAdsets = [];
    let nextAdsetUrl = `${baseUrl}/${encodeURIComponent(actId)}/adsets?fields=id,name,status,campaign_id,insights{spend,impressions,clicks,actions}&limit=100&access_token=${token}`;
    while (nextAdsetUrl) {
      const response = await axios.get(nextAdsetUrl, { timeout: 20000 });
      if (response.data && response.data.data) allAdsets = allAdsets.concat(response.data.data);
      nextAdsetUrl = response.data?.paging?.next || null;
    }

    for (const adset of allAdsets) {
       const campRow = db.prepare('SELECT id FROM campaigns WHERE meta_campaign_id = ?').get(adset.campaign_id);
       if (!campRow) continue;
       const insights = adset.insights?.data?.[0] || {};
       let metaResults = 0;
       if (insights.actions) {
         const leadAction = insights.actions.find(a => a.action_type === 'lead');
         if (leadAction) metaResults = leadAction.value;
       }
       const statusMap = { 'ACTIVE': 'Aktif', 'PAUSED': 'Duraklatıldı', 'DELETED': 'Silindi', 'ARCHIVED': 'Arşivlendi' };
       const status = statusMap[adset.status] || 'Bilinmiyor';
       
       const existingAdset = db.prepare('SELECT id FROM meta_adsets WHERE meta_adset_id = ?').get(adset.id);
       const ts = nowIso();
       if (existingAdset) {
         db.prepare('UPDATE meta_adsets SET name = ?, status = ?, spent = ?, impressions = ?, clicks = ?, meta_results = ?, updated_at = ? WHERE id = ?')
           .run(adset.name, status, Number(insights.spend || 0), Number(insights.impressions || 0), Number(insights.clicks || 0), Number(metaResults), ts, existingAdset.id);
       } else {
         db.prepare(`INSERT INTO meta_adsets (campaign_id, meta_adset_id, name, status, spent, impressions, clicks, meta_results, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
           .run(campRow.id, adset.id, adset.name, status, Number(insights.spend || 0), Number(insights.impressions || 0), Number(insights.clicks || 0), Number(metaResults), ts, ts);
       }
    }

    // Ads
    let allAds = [];
    let nextAdUrl = `${baseUrl}/${encodeURIComponent(actId)}/ads?fields=id,name,status,adset_id,insights{spend,impressions,clicks,actions}&limit=100&access_token=${token}`;
    while (nextAdUrl) {
      const response = await axios.get(nextAdUrl, { timeout: 20000 });
      if (response.data && response.data.data) allAds = allAds.concat(response.data.data);
      nextAdUrl = response.data?.paging?.next || null;
    }

    for (const ad of allAds) {
       const adsetRow = db.prepare('SELECT id FROM meta_adsets WHERE meta_adset_id = ?').get(ad.adset_id);
       if (!adsetRow) continue;
       const insights = ad.insights?.data?.[0] || {};
       let metaResults = 0;
       if (insights.actions) {
         const leadAction = insights.actions.find(a => a.action_type === 'lead');
         if (leadAction) metaResults = leadAction.value;
       }
       const statusMap = { 'ACTIVE': 'Aktif', 'PAUSED': 'Duraklatıldı', 'DELETED': 'Silindi', 'ARCHIVED': 'Arşivlendi' };
       const status = statusMap[ad.status] || 'Bilinmiyor';
       
       const existingAd = db.prepare('SELECT id FROM meta_ads WHERE meta_ad_id = ?').get(ad.id);
       const ts = nowIso();
       if (existingAd) {
         db.prepare('UPDATE meta_ads SET name = ?, status = ?, spent = ?, impressions = ?, clicks = ?, meta_results = ?, updated_at = ? WHERE id = ?')
           .run(ad.name, status, Number(insights.spend || 0), Number(insights.impressions || 0), Number(insights.clicks || 0), Number(metaResults), ts, existingAd.id);
       } else {
         db.prepare(`INSERT INTO meta_ads (adset_id, meta_ad_id, name, status, spent, impressions, clicks, meta_results, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
           .run(adsetRow.id, ad.id, ad.name, status, Number(insights.spend || 0), Number(insights.impressions || 0), Number(insights.clicks || 0), Number(metaResults), ts, ts);
       }
    }

    return { success: true, message: `${syncedCount} kampanya, ${allAdsets.length} reklam seti ve ${allAds.length} reklam başarıyla senkronize edildi.` };
  } catch (error) {
    console.error('Meta Campaign Sync Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || error.message || 'Kampanyalar senkronize edilirken bir hata oluştu.');
  }
}

module.exports = {
  db,
  normalizePhone,
  displayPhone,
  extractPhoneFromText,
  extractEmailFromText,
  inferInterest,
  upsertLead,
  storeIncomingMessage,
  processWebhook,
  processInstagramMessagingEvents,
  syncCampaignsFromMeta,
  verifySignature,
  sendInstagramMessage,
  addActivity
};
