const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
const db = new DatabaseSync(config.databasePath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'Instagram',
      status TEXT NOT NULL DEFAULT 'Aktif',
      start_date TEXT,
      end_date TEXT,
      budget REAL NOT NULL DEFAULT 0,
      spent REAL NOT NULL DEFAULT 0,
      meta_campaign_id TEXT,
      meta_adset_id TEXT,
      meta_ad_id TEXT,
      form_id TEXT,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      meta_results INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta_adsets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      meta_adset_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT,
      budget REAL NOT NULL DEFAULT 0,
      spent REAL NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      meta_results INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meta_ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adset_id INTEGER NOT NULL,
      meta_ad_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT,
      spent REAL NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      meta_results INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(adset_id) REFERENCES meta_adsets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL DEFAULT 'İsimsiz Lead',
      phone TEXT,
      phone_normalized TEXT,
      email TEXT,
      tc_kimlik_no TEXT,
      interest TEXT,
      source TEXT NOT NULL DEFAULT 'Manuel',
      status TEXT NOT NULL DEFAULT 'Yeni',
      campaign_id INTEGER,
      meta_lead_id TEXT UNIQUE,
      whatsapp_id TEXT,
      instagram_username TEXT,
      instagram_scoped_id TEXT,
      consent_status TEXT NOT NULL DEFAULT 'Belirtilmedi',
      first_message TEXT,
      notes TEXT,
      assigned_to INTEGER,
      first_contact_at TEXT,
      last_contact_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
      FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone_unique
      ON leads(phone_normalized) WHERE phone_normalized IS NOT NULL AND phone_normalized <> '';
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

    CREATE TABLE IF NOT EXISTS lead_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      source TEXT,
      title TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      external_contact_id TEXT NOT NULL,
      last_message TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Açık',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(platform, external_contact_id),
      FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      provider_message_id TEXT UNIQUE,
      direction TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      text TEXT,
      media_id TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'received',
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      patient_name TEXT NOT NULL,
      tc_kimlik_no TEXT,
      phone TEXT,
      procedure TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Bekliyor',
      source TEXT NOT NULL DEFAULT 'Manuel',
      campaign_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE SET NULL,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date, appointment_time);

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_hash TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      processing_status TEXT NOT NULL DEFAULT 'received',
      error_message TEXT,
      received_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      full_name TEXT NOT NULL,
      tc_kimlik_no TEXT,
      phone TEXT,
      email TEXT,
      dob TEXT,
      gender TEXT,
      blood_type TEXT,
      allergies TEXT,
      chronic_diseases TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      visit_date TEXT NOT NULL,
      diagnosis TEXT,
      treatment TEXT,
      prescription TEXT,
      doctor_notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      user_id INTEGER,
      title TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'Bekliyor',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE SET NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(item => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function runMigrations() {
  ensureColumn('leads', 'instagram_scoped_id', 'TEXT');
  ensureColumn('leads', 'tc_kimlik_no', 'TEXT');
  ensureColumn('appointments', 'tc_kimlik_no', 'TEXT');
  ensureColumn('appointments', 'patient_id', 'INTEGER');
  ensureColumn('campaigns', 'impressions', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('campaigns', 'clicks', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('campaigns', 'meta_results', 'INTEGER NOT NULL DEFAULT 0');
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_instagram_scoped_unique ON leads(instagram_scoped_id) WHERE instagram_scoped_id IS NOT NULL AND instagram_scoped_id <> '';");
}

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(config.admin.username);
  if (!existing) {
    const ts = nowIso();
    db.prepare(`INSERT INTO users (username, display_name, role, password_hash, active, created_at, updated_at)
                VALUES (?, ?, 'admin', ?, 1, ?, ?)`)
      .run(config.admin.username, config.admin.displayName, hashPassword(config.admin.password), ts, ts);
  }
}

function seedDemoCampaign() {
  const count = db.prepare('SELECT COUNT(*) AS total FROM campaigns').get().total;
  if (count === 0) {
    const ts = nowIso();
    db.prepare(`INSERT INTO campaigns (name, platform, status, start_date, budget, spent, created_at, updated_at)
                VALUES (?, 'Instagram', 'Aktif', date('now'), 0, 0, ?, ?)`)
      .run('Instagram / WhatsApp Ana Kampanya', ts, ts);
  }
}

function transaction(fn) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

initSchema();
runMigrations();
seedAdmin();
seedDemoCampaign();

module.exports = { db, nowIso, hashPassword, verifyPassword, transaction };
