const crypto = require('crypto');
const config = require('./config');
const { db, nowIso, verifyPassword } = require('./db');

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash(token), userId, expiresAt, nowIso());
  return { token, expiresAt };
}

function authenticate(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  const session = createSession(user.id);
  return {
    ...session,
    user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role }
  };
}

function getBearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function getSession(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.id AS session_id, s.expires_at, u.id, u.username, u.display_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
  `).get(tokenHash(token), nowIso());
  if (!row) return null;
  return {
    sessionId: row.session_id,
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    expiresAt: row.expires_at
  };
}

function requireAuth(req, res, next) {
  const session = getSession(getBearer(req));
  if (!session) return res.status(401).json({ error: 'Oturum geçersiz veya süresi dolmuş.' });
  req.user = session;
  next();
}

function logout(req) {
  const token = getBearer(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

function cleanupSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gereklidir.' });
}

module.exports = { authenticate, requireAuth, requireAdmin, logout, cleanupSessions, getSession };
