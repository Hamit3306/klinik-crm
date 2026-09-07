const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./src/config');
const { db, nowIso } = require('./src/db');
const { authenticate, requireAuth, logout, cleanupSessions } = require('./src/auth');

const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gereklidir.' });
};

const sse = require('./src/sse');
const whatsappService = require('./src/whatsapp');
const {
  normalizePhone,
  displayPhone,
  upsertLead,
  processWebhook,
  processInstagramMessagingEvents,
  verifySignature,
  sendInstagramMessage,
  syncCampaignsFromMeta,
  addActivity
} = require('./src/meta');
const { runBackup } = require('./src/backup');

const app = express();
app.set('trust proxy', 1);

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: false // Disabled for now to prevent breaking inline scripts/styles and CDNs
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per `window`
  message: { error: 'Çok fazla istek gönderdiniz. Lütfen daha sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 login requests
  message: { error: 'Çok fazla giriş denemesi. Lütfen daha sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const allowedOrigins = config.corsOrigin.split(',').map(value => value.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Bu kaynaktan erişime izin verilmiyor.'));
  },
  credentials: false
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
  next();
});

app.use(express.json({
  limit: '2mb',
  verify(req, _res, buffer) {
    req.rawBody = buffer;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));

app.use('/api', apiLimiter);

function cleanString(value, max = 500) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function idValue(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function audit(userId, action, entityType, entityId, detail = null) {
  db.prepare(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(userId || null, action, entityType, entityId ? String(entityId) : null, detail, nowIso());
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '3.0.0', time: nowIso() });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const username = cleanString(req.body.username, 80);
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
  const result = authenticate(username, password);
  if (!result) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  audit(result.user.id, 'login', 'session', null, 'Başarılı giriş');
  res.json(result);
});

app.get('/api/stream', (req, res, next) => {
  // EventSource API cannot send Authorization headers, so we accept token via query param
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token gereklidir.' });
  const { getSession } = require('./src/auth');
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Oturum geçersiz.' });
  req.user = session;
  sse.addClient(req, res);
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  audit(req.user.id, 'logout', 'session', req.user.sessionId, 'Çıkış yapıldı');
  logout(req);
  res.json({ ok: true });
});

// Users Management API
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  const items = db.prepare('SELECT id, display_name, username, role, active, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ items });
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const { displayName, username, password, role, active } = req.body;
  if (!displayName || !username || !password) return res.status(400).json({ error: 'Ad soyad, kullanıcı adı ve şifre zorunludur.' });
  const hash = crypto.createHash('sha256').update(String(password)).digest('hex');
  try {
    const result = db.prepare('INSERT INTO users (display_name, username, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(cleanString(displayName, 100), cleanString(username, 50), hash, role === 'admin' ? 'admin' : 'assistant', active === 0 ? 0 : 1, nowIso(), nowIso());
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
    else throw error;
  }
});

app.put('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = idValue(req.params.id);
  const { displayName, password, role, active } = req.body;
  if (password) {
    const hash = crypto.createHash('sha256').update(String(password)).digest('hex');
    db.prepare('UPDATE users SET display_name = ?, password_hash = ?, role = ?, active = ?, updated_at = ? WHERE id = ?')
      .run(cleanString(displayName, 100), hash, role === 'admin' ? 'admin' : 'assistant', active === 0 ? 0 : 1, nowIso(), id);
  } else {
    db.prepare('UPDATE users SET display_name = ?, role = ?, active = ?, updated_at = ? WHERE id = ?')
      .run(cleanString(displayName, 100), role === 'admin' ? 'admin' : 'assistant', active === 0 ? 0 : 1, nowIso(), id);
  }
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = idValue(req.params.id);
  if (req.user.id === id) return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  const stats = {
    totalLeads: db.prepare("SELECT COUNT(*) AS value FROM leads WHERE status != 'İlgisiz'").get().value,
    newLeads: db.prepare("SELECT COUNT(*) AS value FROM leads WHERE status = 'Yeni'").get().value,
    totalUnread: db.prepare('SELECT COALESCE(SUM(unread_count), 0) AS value FROM conversations').get().value,
    whatsappUnread: db.prepare("SELECT COALESCE(SUM(unread_count), 0) AS value FROM conversations WHERE platform = 'WhatsApp'").get().value,
    instagramUnread: db.prepare("SELECT COALESCE(SUM(unread_count), 0) AS value FROM conversations WHERE platform = 'Instagram'").get().value,
    appointments: db.prepare('SELECT COUNT(*) AS value FROM appointments').get().value,
    upcomingAppointments: db.prepare("SELECT COUNT(*) AS value FROM appointments WHERE appointment_date >= date('now') AND status NOT IN ('İptal', 'Tamamlandı')").get().value,
    convertedLeads: db.prepare("SELECT COUNT(*) AS value FROM leads WHERE status = 'Randevu Alındı'").get().value,
    totalSpent: db.prepare('SELECT COALESCE(SUM(spent), 0) AS value FROM campaigns').get().value,
    activeCampaigns: db.prepare("SELECT COUNT(*) AS value FROM campaigns WHERE status = 'Aktif'").get().value,
    surgeryLeads: db.prepare("SELECT COUNT(*) AS value FROM leads WHERE status = 'Ameliyat Oldu'").get().value
  };

  const responseTimeQuery = `
    SELECT c.platform, AVG(
      (julianday((
        SELECT MIN(created_at) FROM messages m_out WHERE m_out.conversation_id = m_in.conversation_id AND m_out.direction = 'outgoing' AND m_out.created_at > m_in.created_at
      )) - julianday(m_in.created_at)) * 24 * 60
    ) AS avg_time
    FROM messages m_in
    JOIN conversations c ON c.id = m_in.conversation_id
    WHERE m_in.direction = 'incoming'
      AND (SELECT MIN(created_at) FROM messages m_out WHERE m_out.conversation_id = m_in.conversation_id AND m_out.direction = 'outgoing' AND m_out.created_at > m_in.created_at) IS NOT NULL
    GROUP BY c.platform
  `;
  const responseTimes = db.prepare(responseTimeQuery).all();
  stats.responseTimeWA = Math.round(responseTimes.find(r => r.platform === 'WhatsApp')?.avg_time || 0);
  stats.responseTimeIG = Math.round(responseTimes.find(r => r.platform === 'Instagram')?.avg_time || 0);
  
  stats.conversionRate = stats.totalLeads ? Number(((stats.convertedLeads / stats.totalLeads) * 100).toFixed(1)) : 0;
  stats.costPerSurgery = stats.surgeryLeads > 0 ? stats.totalSpent / stats.surgeryLeads : 0;

  const sourceDistribution = db.prepare(`SELECT source AS label, COUNT(*) AS value FROM leads GROUP BY source ORDER BY value DESC`).all();
  const interestDistribution = db.prepare(`SELECT interest AS label, COUNT(*) AS value FROM leads WHERE interest IS NOT NULL AND interest != '-' GROUP BY interest ORDER BY value DESC`).all();
  const statusDistribution = db.prepare(`SELECT status AS label, COUNT(*) AS value FROM leads WHERE status != 'İlgisiz' GROUP BY status ORDER BY value DESC`).all();
  
  const campaignPerformance = db.prepare(`
    SELECT c.id, c.name,
      COUNT(DISTINCT l.id) AS leads,
      COUNT(DISTINCT a.id) AS appointments,
      COUNT(DISTINCT CASE WHEN l.status = 'Ameliyat Oldu' THEN l.id END) AS surgeries,
      c.spent
    FROM campaigns c
    LEFT JOIN leads l ON l.campaign_id = c.id
    LEFT JOIN appointments a ON a.campaign_id = c.id
    GROUP BY c.id ORDER BY leads DESC, c.created_at DESC LIMIT 10
  `).all();
  const recentLeads = db.prepare(`
    SELECT l.*, c.name AS campaign_name FROM leads l
    LEFT JOIN campaigns c ON c.id = l.campaign_id
    ORDER BY l.created_at DESC LIMIT 8
  `).all();
  const upcoming = db.prepare(`
    SELECT * FROM appointments
    WHERE appointment_date >= date('now') AND status NOT IN ('İptal', 'Tamamlandı')
    ORDER BY appointment_date, appointment_time LIMIT 8
  `).all();
  
  const tasks = db.prepare(`
    SELECT t.*, l.full_name as lead_name
    FROM tasks t
    LEFT JOIN leads l ON l.id = t.lead_id
    WHERE t.status != 'Tamamlandı'
    ORDER BY t.due_date ASC, t.created_at DESC
    LIMIT 10
  `).all();

  res.json({ stats, sourceDistribution, interestDistribution, statusDistribution, campaignPerformance, recentLeads, upcoming, tasks });
});

app.get('/api/leads', requireAuth, (req, res) => {
  const filters = [];
  const params = [];
  if (req.query.status === 'all_with_ilgisiz') {
    // No status filter
  } else if (req.query.status && req.query.status !== 'all') { 
    filters.push('l.status = ?'); 
    params.push(req.query.status); 
  } else {
    filters.push("l.status != 'İlgisiz'");
  }

  if (req.query.source && req.query.source !== 'all') { filters.push('l.source LIKE ?'); params.push(`%${req.query.source}%`); }
  if (req.query.interest && req.query.interest !== 'all') { filters.push('l.interest LIKE ?'); params.push(`%${req.query.interest}%`); }
  if (req.query.search) {
    filters.push(`(l.full_name LIKE ? OR l.phone LIKE ? OR l.email LIKE ? OR l.interest LIKE ? OR l.notes LIKE ?)`);
    const search = `%${cleanString(req.query.search, 100)}%`;
    params.push(search, search, search, search, search);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT l.*, c.name AS campaign_name,
      (SELECT COUNT(*) FROM lead_activities a WHERE a.lead_id = l.id) AS activity_count
    FROM leads l LEFT JOIN campaigns c ON c.id = l.campaign_id
    ${where} ORDER BY CASE l.status WHEN 'Yeni' THEN 0 WHEN 'İletişime Geçildi' THEN 1 ELSE 2 END, l.updated_at DESC
    LIMIT 1000
  `).all(...params);
  res.json({ items: rows });
});

// Otomatik Yedekleme Zamanlayıcısı (Her gece 03:00'te)
let lastBackupDate = '';
setInterval(() => {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (now.getHours() >= 3 && lastBackupDate !== todayStr) {
    lastBackupDate = todayStr;
    console.log('[YEDEKLEME ZAMANLAYICI] Gece yedeklemesi başlatılıyor...');
    runBackup().catch(console.error);
  }
}, 60 * 1000); // Her dakika kontrol et


app.get('/api/leads/:id', requireAuth, (req, res) => {
  const id = idValue(req.params.id);
  const lead = db.prepare(`SELECT l.*, c.name AS campaign_name FROM leads l LEFT JOIN campaigns c ON c.id = l.campaign_id WHERE l.id = ?`).get(id);
  if (!lead) return res.status(404).json({ error: 'Lead bulunamadı.' });
  const activities = db.prepare('SELECT * FROM lead_activities WHERE lead_id = ? ORDER BY created_at DESC').all(id);
  res.json({ ...lead, activities });
});

app.post('/api/leads', requireAuth, (req, res) => {
  const fullName = cleanString(req.body.fullName, 150);
  if (!fullName) return res.status(400).json({ error: 'Ad soyad gereklidir.' });
  const result = upsertLead({
    fullName,
    phone: cleanString(req.body.phone, 50),
    email: cleanString(req.body.email, 150),
    interest: cleanString(req.body.interest, 150),
    source: cleanString(req.body.source, 80) || 'Manuel',
    campaignId: idValue(req.body.campaignId),
    notes: cleanString(req.body.notes, 3000),
    consentStatus: cleanString(req.body.consentStatus, 100) || 'Belirtilmedi'
  });
  audit(req.user.id, 'create', 'lead', result.leadId, result.created ? 'Yeni lead' : 'Mevcut lead birleştirildi');
  res.status(result.created ? 201 : 200).json({ id: result.leadId, merged: !result.created });
});

app.put('/api/leads/:id', requireAuth, (req, res) => {
  const id = idValue(req.params.id);
  const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Lead bulunamadı.' });
  const fullName = cleanString(req.body.fullName, 150) || existing.full_name;
  const phoneRaw = cleanString(req.body.phone, 50);
  const normalized = phoneRaw ? normalizePhone(phoneRaw) : existing.phone_normalized;
  try {
    db.prepare(`UPDATE leads SET full_name = ?, phone = ?, phone_normalized = ?, email = ?, interest = ?, source = ?,
      status = ?, campaign_id = ?, consent_status = ?, notes = ?, updated_at = ? WHERE id = ?`)
      .run(
        fullName,
        phoneRaw ? displayPhone(normalized) : existing.phone,
        normalized,
        cleanString(req.body.email, 150),
        cleanString(req.body.interest, 150),
        cleanString(req.body.source, 80) || existing.source,
        cleanString(req.body.status, 50) || existing.status,
        idValue(req.body.campaignId),
        cleanString(req.body.consentStatus, 100) || existing.consent_status,
        cleanString(req.body.notes, 3000),
        nowIso(), id
      );
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu telefon numarası başka bir lead kaydında kullanılıyor.' });
    throw error;
  }
  addActivity(id, 'lead_updated', 'Panel', 'Lead bilgileri güncellendi', `Durum: ${cleanString(req.body.status, 50) || existing.status}`);
  audit(req.user.id, 'update', 'lead', id, 'Lead güncellendi');
  res.json({ ok: true });
});

app.post('/api/leads/bulk', requireAuth, (req, res) => {
  const { action, ids, status } = req.body;
  if (!ids || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
  
  try {
    if (action === 'delete') {
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`).run(...ids);
      res.json({ success: true, message: `${ids.length} kayıt silindi.` });
    } else if (action === 'status') {
      if (!status) return res.status(400).json({ error: 'Durum belirtilmedi.' });
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE leads SET status = ?, updated_at = ? WHERE id IN (${placeholders})`).run(status, new Date().toISOString(), ...ids);
      res.json({ success: true, message: `${ids.length} kaydın durumu güncellendi.` });
    } else {
      res.status(400).json({ error: 'Geçersiz işlem.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Toplu işlem sırasında hata oluştu.', details: error.message });
  }
});

app.delete('/api/leads/:id', requireAuth, (req, res) => {
  const id = idValue(req.params.id);
  const result = db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  if (!result.changes) return res.status(404).json({ error: 'Lead bulunamadı.' });
  audit(req.user.id, 'delete', 'lead', id, 'Lead silindi');
  res.json({ ok: true });
});

app.get('/api/campaigns', requireAuth, requireAdmin, (req, res) => {
  const { startDate, endDate } = req.query;
  
  let leadsFilter = '';
  let apptsFilter = '';
  let paymentsFilter = '';
  const params = [];
  
  if (startDate && endDate) {
    leadsFilter = ' AND date(created_at) >= ? AND date(created_at) <= ?';
    apptsFilter = ' AND date(appointment_date) >= ? AND date(appointment_date) <= ?';
    paymentsFilter = ' AND date(payment_date) >= ? AND date(payment_date) <= ?';
    params.push(startDate, endDate, startDate, endDate, startDate, endDate);
  }
  
  const items = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(id) FROM leads WHERE campaign_id = c.id AND status != 'İlgisiz' ${leadsFilter}) AS lead_count,
      (SELECT COUNT(id) FROM appointments WHERE campaign_id = c.id ${apptsFilter}) AS appointment_count,
      (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE patient_id IN (SELECT id FROM patients WHERE lead_id IN (SELECT id FROM leads WHERE campaign_id = c.id)) ${paymentsFilter}) AS total_revenue
    FROM campaigns c
    ORDER BY c.created_at DESC
  `).all(...params);
  
  items.forEach(item => {
    item.cost_per_lead = item.lead_count > 0 ? Number((item.spent / item.lead_count).toFixed(2)) : 0;
    item.roas = item.spent > 0 ? Number((item.total_revenue / item.spent).toFixed(2)) : 0;
  });
  
  res.json({ items });
});

app.get('/api/campaigns/:id/ads', requireAuth, requireAdmin, (req, res) => {
  const adsets = db.prepare('SELECT * FROM meta_adsets WHERE campaign_id = ?').all(req.params.id);
  const ads = db.prepare('SELECT a.* FROM meta_ads a JOIN meta_adsets s ON a.adset_id = s.id WHERE s.campaign_id = ?').all(req.params.id);
  res.json({ adsets, ads });
});

app.post('/api/meta/campaigns/sync', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const result = await syncCampaignsFromMeta();
  res.json(result);
}));

app.post('/api/campaigns', requireAuth, requireAdmin, (req, res) => {
  const name = cleanString(req.body.name, 180);
  if (!name) return res.status(400).json({ error: 'Kampanya adı gereklidir.' });
  const ts = nowIso();
  const result = db.prepare(`INSERT INTO campaigns
    (name, platform, status, start_date, end_date, budget, spent, meta_campaign_id, meta_adset_id, meta_ad_id, form_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, cleanString(req.body.platform, 50) || 'Instagram', cleanString(req.body.status, 30) || 'Aktif',
      cleanString(req.body.startDate, 20), cleanString(req.body.endDate, 20), numberValue(req.body.budget), numberValue(req.body.spent),
      cleanString(req.body.metaCampaignId, 100), cleanString(req.body.metaAdsetId, 100), cleanString(req.body.metaAdId, 100), cleanString(req.body.formId, 100), ts, ts);
  audit(req.user.id, 'create', 'campaign', result.lastInsertRowid, name);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/campaigns/:id', requireAuth, requireAdmin, (req, res) => {
  const id = idValue(req.params.id);
  const existing = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Kampanya bulunamadı.' });
  db.prepare(`UPDATE campaigns SET name = ?, platform = ?, status = ?, start_date = ?, end_date = ?, budget = ?, spent = ?,
    meta_campaign_id = ?, meta_adset_id = ?, meta_ad_id = ?, form_id = ?, updated_at = ? WHERE id = ?`)
    .run(cleanString(req.body.name, 180) || existing.name, cleanString(req.body.platform, 50) || existing.platform,
      cleanString(req.body.status, 30) || existing.status, cleanString(req.body.startDate, 20), cleanString(req.body.endDate, 20),
      numberValue(req.body.budget), numberValue(req.body.spent), cleanString(req.body.metaCampaignId, 100),
      cleanString(req.body.metaAdsetId, 100), cleanString(req.body.metaAdId, 100), cleanString(req.body.formId, 100), nowIso(), id);
  audit(req.user.id, 'update', 'campaign', id, 'Kampanya güncellendi');
  res.json({ ok: true });
});

app.delete('/api/campaigns/:id', requireAuth, requireAdmin, (req, res) => {
  const id = idValue(req.params.id);
  const result = db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
  if (!result.changes) return res.status(404).json({ error: 'Kampanya bulunamadı.' });
  audit(req.user.id, 'delete', 'campaign', id, 'Kampanya silindi');
  res.json({ ok: true });
});

app.get('/api/appointments', requireAuth, (req, res) => {
  const filters = [];
  const params = [];
  if (req.query.status && req.query.status !== 'all') { filters.push('a.status = ?'); params.push(req.query.status); }
  if (req.query.search) {
    filters.push('(a.patient_name LIKE ? OR a.phone LIKE ? OR a.procedure LIKE ?)');
    const search = `%${cleanString(req.query.search, 100)}%`;
    params.push(search, search, search);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const items = db.prepare(`
    SELECT a.*, c.name AS campaign_name FROM appointments a
    LEFT JOIN campaigns c ON c.id = a.campaign_id
    ${where} ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 1000
  `).all(...params);
  res.json({ items });
});

function validateAppointment(body, ignoreId = null) {
  const patientName = cleanString(body.patientName, 150);
  const procedure = cleanString(body.procedure, 150);
  const date = cleanString(body.date, 10);
  const time = cleanString(body.time, 5);
  if (!patientName || !procedure || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) {
    return { error: 'Hasta, işlem, tarih ve saat alanları geçerli şekilde doldurulmalıdır.' };
  }
  const conflict = ignoreId
    ? db.prepare("SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status != 'İptal' AND id != ?").get(date, time, ignoreId)
    : db.prepare("SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status != 'İptal'").get(date, time);
  if (conflict) return { error: 'Aynı tarih ve saatte başka bir randevu bulunuyor.' };
  return { patientName, procedure, date, time };
}

app.post('/api/appointments', requireAuth, (req, res) => {
  const valid = validateAppointment(req.body);
  if (valid.error) return res.status(409).json({ error: valid.error });
  const leadId = idValue(req.body.leadId);
  const lead = leadId ? db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId) : null;
  const ts = nowIso();
  const result = db.prepare(`INSERT INTO appointments
    (lead_id, patient_name, phone, procedure, appointment_date, appointment_time, status, source, campaign_id, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(leadId, valid.patientName, cleanString(req.body.phone, 50) || lead?.phone || null, valid.procedure, valid.date, valid.time,
      cleanString(req.body.status, 30) || 'Bekliyor', cleanString(req.body.source, 80) || lead?.source || 'Manuel',
      idValue(req.body.campaignId) || lead?.campaign_id || null, cleanString(req.body.notes, 2000), ts, ts);
  if (leadId) {
    db.prepare("UPDATE leads SET status = 'Randevu Alındı', updated_at = ? WHERE id = ?").run(ts, leadId);
    addActivity(leadId, 'appointment_created', 'Panel', 'Randevu oluşturuldu', `${valid.date} ${valid.time} — ${valid.procedure}`);
  }
  audit(req.user.id, 'create', 'appointment', result.lastInsertRowid, valid.patientName);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/appointments/:id', requireAuth, (req, res) => {
  const id = idValue(req.params.id);
  const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Randevu bulunamadı.' });
  const valid = validateAppointment(req.body, id);
  if (valid.error) return res.status(409).json({ error: valid.error });
  db.prepare(`UPDATE appointments SET lead_id = ?, patient_name = ?, phone = ?, procedure = ?, appointment_date = ?,
    appointment_time = ?, status = ?, source = ?, campaign_id = ?, notes = ?, updated_at = ? WHERE id = ?`)
    .run(idValue(req.body.leadId), valid.patientName, cleanString(req.body.phone, 50), valid.procedure, valid.date, valid.time,
      cleanString(req.body.status, 30) || existing.status, cleanString(req.body.source, 80) || existing.source,
      idValue(req.body.campaignId), cleanString(req.body.notes, 2000), nowIso(), id);
  audit(req.user.id, 'update', 'appointment', id, 'Randevu güncellendi');
  res.json({ ok: true });
});

app.delete('/api/appointments/:id', requireAuth, (req, res) => {
  const id = idValue(req.params.id);
  const result = db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
  if (!result.changes) return res.status(404).json({ error: 'Randevu bulunamadı.' });
  audit(req.user.id, 'delete', 'appointment', id, 'Randevu silindi');
  res.json({ ok: true });
});

// Tasks (Hatırlatıcılar) API
app.get('/api/tasks', requireAuth, (req, res) => {
  const items = db.prepare(`
    SELECT t.*, l.full_name as lead_name
    FROM tasks t
    LEFT JOIN leads l ON l.id = t.lead_id
    WHERE t.status != 'Tamamlandı'
    ORDER BY t.due_date ASC, t.created_at DESC
  `).all();
  res.json({ items });
});

app.post('/api/tasks', requireAuth, (req, res) => {
  const { lead_id, title, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Görev başlığı zorunludur.' });
  
  const ts = nowIso();
  const info = db.prepare(`
    INSERT INTO tasks (lead_id, user_id, title, due_date, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Bekliyor', ?, ?)
  `).run(idValue(lead_id) || null, req.user.id, cleanString(title, 255), cleanString(due_date, 50), ts, ts);
  
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put('/api/tasks/:id/complete', requireAuth, (req, res) => {
  const id = idValue(req.params.id);
  db.prepare("UPDATE tasks SET status = 'Tamamlandı', updated_at = ? WHERE id = ?").run(nowIso(), id);
  res.json({ ok: true });
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const id = idValue(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/conversations', requireAuth, (_req, res) => {
  const items = db.prepare(`
    SELECT c.*, l.full_name, l.phone, l.status AS lead_status
    FROM conversations c JOIN leads l ON l.id = c.lead_id
    ORDER BY c.updated_at DESC LIMIT 500
  `).all();
  res.json({ items });
});

app.get('/api/conversations/:id/messages', requireAuth, asyncRoute(async (req, res) => {
  const id = idValue(req.params.id);
  const conversation = db.prepare(`SELECT c.*, l.full_name, l.phone FROM conversations c JOIN leads l ON l.id = c.lead_id WHERE c.id = ?`).get(id);
  if (!conversation) return res.status(404).json({ error: 'Konuşma bulunamadı.' });
  
  const sinceId = idValue(req.query.since_id);
  
  // WhatsApp konuşmalarında ilk açılışta geçmişi senkronize et
  if (conversation.platform === 'WhatsApp' && !sinceId) {
    await whatsappService.syncWhatsAppHistory(conversation.external_contact_id, conversation.lead_id);
  }
  
  const items = sinceId
    ? db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY created_at ASC').all(id, sinceId)
    : db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id);
    
  if (!sinceId) {
    db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(id);
  }
  res.json({ conversation, items });
}));

app.post('/api/conversations/:id/messages', requireAuth, asyncRoute(async (req, res) => {
  const id = idValue(req.params.id);
  const text = cleanString(req.body.text, 4096);
  if (!text) return res.status(400).json({ error: 'Mesaj boş olamaz.' });
  const conversation = db.prepare('SELECT c.*, l.full_name FROM conversations c JOIN leads l ON l.id = c.lead_id WHERE c.id = ?').get(id);
  if (!conversation) return res.status(404).json({ error: 'Konuşma bulunamadı.' });
  let result;
  if (conversation.platform === 'WhatsApp') result = await whatsappService.sendWhatsAppMessage(conversation.external_contact_id, text);
  else if (conversation.platform === 'Instagram') result = await sendInstagramMessage(conversation.external_contact_id, text);
  else return res.status(400).json({ error: 'Bu mesaj kanalı desteklenmiyor.' });
  const ts = nowIso();
  
  // Check if provider event already recorded this outgoing message
  let msgObj = db.prepare(`
    SELECT * FROM messages 
    WHERE conversation_id = ? 
      AND direction = 'outgoing' 
      AND text = ? 
      AND abs(strftime('%s', created_at) - strftime('%s', ?)) <= 20
    ORDER BY id DESC LIMIT 1
  `).get(id, text, ts);

  if (msgObj) {
    if (result.id && !msgObj.provider_message_id) {
      db.prepare('UPDATE messages SET provider_message_id = ?, delivery_status = ? WHERE id = ?')
        .run(result.id, result.status || 'sent', msgObj.id);
      msgObj.provider_message_id = result.id;
      msgObj.delivery_status = result.status || 'sent';
    }
  } else {
    const insertResult = db.prepare(`INSERT INTO messages
      (conversation_id, provider_message_id, direction, message_type, text, delivery_status, created_at)
      VALUES (?, ?, 'outgoing', 'text', ?, ?, ?)`)
      .run(id, result.id || `local-${crypto.randomUUID()}`, text, result.status || 'sent', ts);
    
    msgObj = {
      id: Number(insertResult.lastInsertRowid),
      conversation_id: id,
      provider_message_id: result.id || null,
      direction: 'outgoing',
      message_type: 'text',
      text,
      delivery_status: result.status || 'sent',
      created_at: ts
    };

    sse.broadcast('new_message', {
      conversationId: id,
      leadId: conversation.lead_id,
      platform: conversation.platform,
      externalContactId: conversation.external_contact_id,
      fullName: conversation.full_name,
      message: msgObj
    });
  }

  db.prepare('UPDATE conversations SET last_message = ?, updated_at = ? WHERE id = ?').run(text, ts, id);
  addActivity(conversation.lead_id, 'message_sent', conversation.platform, `${conversation.platform} mesajı gönderildi`, text);
  audit(req.user.id, 'send', 'message', result.id, `${conversation.platform} konuşması ${id}`);

  res.status(201).json({ ok: true, demo: result.demo, platform: conversation.platform, providerMessageId: result.id, message: msgObj });
}));

app.get('/api/integrations/status', requireAuth, requireAdmin, (_req, res) => {
  const webhookPath = '/webhooks/meta';
  const failedEvents = db.prepare("SELECT COUNT(*) AS value FROM webhook_events WHERE processing_status = 'failed'").get().value;
  const lastEvent = db.prepare('SELECT provider, event_type, processing_status, received_at, error_message FROM webhook_events ORDER BY id DESC LIMIT 1').get() || null;
  res.json({
    instagram: {
      username: config.meta.instagramUsername,
      profileUrl: `https://www.instagram.com/${config.meta.instagramUsername}/`,
      leadAdsConfigured: Boolean(config.meta.pageAccessToken && config.meta.pageId),
      pageIdConfigured: Boolean(config.meta.pageId),
      messagingConfigured: Boolean((config.instagram.accessToken || config.meta.pageAccessToken) && (config.instagram.accountId || config.meta.pageId)),
      accountIdConfigured: Boolean(config.instagram.accountId || config.meta.pageId)
    },
    whatsapp: whatsappService.getWhatsAppStatus(),
    webhook: {
      callbackUrl: `${config.appUrl}${webhookPath}`,
      verifyTokenConfigured: Boolean(config.meta.verifyToken),
      signatureVerification: Boolean(config.meta.appSecret),
      failedEvents,
      lastEvent
    },
    graphVersion: config.meta.graphVersion,
    environment: config.nodeEnv
  });
});

app.post('/api/meta/ad-account', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const adAccountId = cleanString(req.body.adAccountId, 100);
  const adAccessToken = cleanString(req.body.adAccessToken, 500);
  if (!adAccountId) return res.status(400).json({ error: 'Meta Reklam Hesabı Kimliği (Ad Account ID) zorunludur.' });
  
  const formattedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  config.saveEnvVars({
    META_AD_ACCOUNT_ID: formattedId,
    ...(adAccessToken ? { META_AD_ACCESS_TOKEN: adAccessToken } : {})
  });
  
  const result = await syncCampaignsFromMeta();
  res.json({ ok: true, message: result.message });
}));

app.post('/api/demo/simulate/lead', requireAuth, (req, res) => {
  let campaign = db.prepare('SELECT id FROM campaigns ORDER BY id LIMIT 1').get();
  if (!campaign) {
    const ts = nowIso();
    const result = db.prepare(`INSERT INTO campaigns
      (name, platform, status, created_at, updated_at)
      VALUES ('Instagram Lead Formları Kampanyası', 'Instagram', 'Aktif', ?, ?)`).run(ts, ts);
    campaign = { id: Number(result.lastInsertRowid) };
  }
  const suffix = String(Date.now()).slice(-7);
  const result = upsertLead({
    fullName: cleanString(req.body.fullName, 150) || 'Demo Instagram Lead',
    phone: cleanString(req.body.phone, 50) || `0555${suffix}`,
    email: cleanString(req.body.email, 150) || `demo${suffix}@example.com`,
    interest: cleanString(req.body.interest, 150) || 'Burun Estetiği',
    source: 'Instagram Formu',
    campaignId: campaign.id,
    metaLeadId: `demo-lead-${Date.now()}`,
    instagramUsername: config.meta.instagramUsername,
    consentStatus: 'Demo form onayı'
  });
  audit(req.user.id, 'simulate', 'leadgen', result.leadId, 'Demo Instagram formu');
  res.status(201).json({ id: result.leadId });
});


app.post('/api/demo/simulate/instagram', requireAuth, asyncRoute(async (req, res) => {
  const scopedId = cleanString(req.body.instagramScopedId, 100) || `demo-ig-user-${Date.now()}`;
  const payload = [{
    sender: { id: scopedId },
    recipient: { id: config.instagram.accountId || 'demo-business-account' },
    timestamp: Date.now(),
    message: {
      mid: `demo-ig-message-${Date.now()}`,
      text: cleanString(req.body.message, 2000) || 'Merhaba, burun estetiği için bilgi almak istiyorum. Telefonum 0555 123 45 67'
    }
  }];
  const result = await processInstagramMessagingEvents(payload);
  audit(req.user.id, 'simulate', 'instagram', result[0]?.leadId, 'Demo Instagram DM mesajı');
  res.status(201).json(result[0] || { ok: true });
}));

app.get('/webhooks/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && config.meta.verifyToken && token === config.meta.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhooks/meta', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  if (!verifySignature(req.rawBody || Buffer.from(''), signature)) return res.status(401).json({ error: 'Webhook imzası doğrulanamadı.' });
  res.status(200).json({ received: true });
  processWebhook(req.body || {}).catch(error => console.error(`[${nowIso()}] Meta webhook işleme hatası:`, error));
});

app.get('/konum', (_req, res) => {
  res.redirect('https://maps.google.com/?q=Prof.+Dr.+Esin+Yal%C3%A7%C4%B1nkaya+Via+Green+%C4%B0%C5%9F+Merkezi+Mustafa+Kemal+Mah.+2079.+Sk.+%C3%87ankaya+Ankara');
});

// Meta panelinde ayrı URL tercih edilirse aynı işleyiciyi kullanabilmek için aliaslar.
app.get(['/webhooks/leadgen', '/webhooks/whatsapp', '/webhooks/instagram'], (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && config.meta.verifyToken && token === config.meta.verifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
});
app.post(['/webhooks/leadgen', '/webhooks/whatsapp', '/webhooks/instagram'], (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  if (!verifySignature(req.rawBody || Buffer.from(''), signature)) return res.status(401).json({ error: 'Webhook imzası doğrulanamadı.' });
  res.status(200).json({ received: true });
  processWebhook(req.body || {}).catch(error => console.error(`[${nowIso()}] Meta webhook işleme hatası:`, error));
});

// His API Rotaları
app.use('/api', require('./src/api_his'));

app.use(express.static(path.join(config.rootDir, 'public'), {
  extensions: ['html'],
  index: 'index.html',
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css') || filePath.endsWith('.js') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) return next();
  res.sendFile(path.join(config.rootDir, 'public', 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'İstenen adres bulunamadı.' }));

// Hata Yöneticisi (Global Error Handler)
app.use((error, req, res, _next) => {
  console.error(`[${nowIso()}] Hata:`, req.method, req.originalUrl, error.message);
  
  if (error.name === 'SyntaxError') {
    return res.status(400).json({ error: 'Geçersiz veri formatı.' });
  }
  if (error.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({ error: 'Veritabanı kısıtlaması ihlali (Mükerrer veya eksik kayıt).' });
  }

  const status = error.status || 500;
  res.status(status).json({ error: status >= 500 ? 'Sunucu işlemi tamamlanamadı.' : error.message });
});

cleanupSessions();
setInterval(cleanupSessions, 60 * 60 * 1000).unref();

// Global Exception Handlers to prevent background tasks (like Puppeteer) from crashing the server
process.on('uncaughtException', (err) => {
  if (err.message && err.message.includes('Attempted to use detached Frame')) {
    console.warn('[WA-Puppeteer] Detached Frame hatası yakalandı ve engellendi:', err.message);
  } else if (err.message && err.message.includes('Session closed')) {
    console.warn('[WA-Puppeteer] Session closed hatası yakalandı ve engellendi.');
  } else {
    console.error('Kritik Hata (Uncaught Exception):', err);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Kritik Hata (Unhandled Rejection):', reason);
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`\nKlinik Meta CRM v3.0 çalışıyor: ${config.appUrl}`);
    console.log(`Instagram hesabı: @${config.meta.instagramUsername}`);
    console.log(`Meta webhook: ${config.appUrl}/webhooks/meta`);
    if (config.admin.password === 'klinik2026') console.warn('UYARI: Varsayılan yönetici şifresini .env dosyasında değiştirin.');
    whatsappService.initializeWhatsApp();
  });
}

module.exports = app;
