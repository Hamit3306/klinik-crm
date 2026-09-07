const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function intValue(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function saveEnvVars(newVars) {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  for (const [key, val] of Object.entries(newVars)) {
    process.env[key] = val;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${val}`);
    } else {
      content += `\n${key}=${val}`;
    }
  }
  fs.writeFileSync(envPath, content, 'utf8');
}

const rootDir = path.join(__dirname, '..');

module.exports = {
  rootDir,
  saveEnvVars,
  port: intValue(process.env.PORT, 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || `http://localhost:${intValue(process.env.PORT, 3001)}`,
  corsOrigin: process.env.CORS_ORIGIN || `http://localhost:${intValue(process.env.PORT, 3001)}`,
  sessionTtlHours: intValue(process.env.SESSION_TTL_HOURS, 12),
  databasePath: process.env.DATABASE_PATH || path.join(rootDir, 'data', 'klinik.db'),
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'klinik2026',
    displayName: process.env.ADMIN_DISPLAY_NAME || 'Klinik Yöneticisi'
  },
  meta: {
    verifyToken: process.env.META_VERIFY_TOKEN || '',
    appSecret: process.env.META_APP_SECRET || '',
    graphVersion: process.env.META_GRAPH_VERSION || 'v25.0',
    get pageAccessToken() { return process.env.META_PAGE_ACCESS_TOKEN || ''; },
    pageId: process.env.META_PAGE_ID || '',
    get adAccountId() { return process.env.META_AD_ACCOUNT_ID || ''; },
    get adAccessToken() { return process.env.META_AD_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || ''; },
    instagramUsername: process.env.INSTAGRAM_USERNAME || 'burun.estetigi_'
  },
  instagram: {
    get accessToken() { return process.env.INSTAGRAM_ACCESS_TOKEN || ''; },
    accountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
    apiBase: process.env.INSTAGRAM_API_BASE || 'https://graph.instagram.com'
  },
  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: intValue(process.env.SMTP_PORT, 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    notificationEmail: process.env.NOTIFICATION_EMAIL || 'kokutatalgisi@gmail.com'
  }
};
