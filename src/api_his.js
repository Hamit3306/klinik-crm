const express = require('express');
const { db, nowIso, transaction } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');

const router = express.Router();

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

// --- PATIENTS ---
router.get('/patients', requireAuth, (req, res) => {
  const search = req.query.search ? `%${req.query.search}%` : null;
  let query = 'SELECT * FROM patients';
  const params = [];
  
  if (search) {
    query += ' WHERE full_name LIKE ? OR phone LIKE ? OR tc_kimlik_no LIKE ?';
    params.push(search, search, search);
  }
  
  query += ' ORDER BY created_at DESC LIMIT 100';
  const patients = db.prepare(query).all(...params);
  res.json(patients);
});

router.post('/patients', requireAuth, (req, res) => {
  const { full_name, tc_kimlik_no, phone, email, dob, gender, blood_type, allergies, chronic_diseases, address, notes, lead_id } = req.body;
  
  if (!full_name) return res.status(400).json({ error: 'Hasta adı zorunludur.' });
  
  const ts = nowIso();
  const info = db.prepare(`
    INSERT INTO patients (full_name, tc_kimlik_no, phone, email, dob, gender, blood_type, allergies, chronic_diseases, address, notes, lead_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cleanString(full_name, 150),
    cleanString(tc_kimlik_no, 20),
    cleanString(phone, 50),
    cleanString(email, 150),
    cleanString(dob, 20),
    cleanString(gender, 20),
    cleanString(blood_type, 20),
    cleanString(allergies, 1000),
    cleanString(chronic_diseases, 1000),
    cleanString(address, 1000),
    cleanString(notes, 2000),
    lead_id || null,
    ts, ts
  );
  
  const newPatient = db.prepare('SELECT * FROM patients WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(newPatient);
});

router.get('/patients/:id', requireAuth, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(idValue(req.params.id));
  if (!patient) return res.status(404).json({ error: 'Hasta bulunamadı.' });
  res.json(patient);
});

router.put('/patients/:id', requireAuth, (req, res) => {
  const { full_name, tc_kimlik_no, phone, email, dob, gender, blood_type, allergies, chronic_diseases, address, notes } = req.body;
  if (!full_name) return res.status(400).json({ error: 'Hasta adı zorunludur.' });
  
  db.prepare(`
    UPDATE patients SET
      full_name = ?, tc_kimlik_no = ?, phone = ?, email = ?, dob = ?, gender = ?, blood_type = ?, allergies = ?, chronic_diseases = ?, address = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    cleanString(full_name, 150), cleanString(tc_kimlik_no, 20), cleanString(phone, 50), cleanString(email, 150),
    cleanString(dob, 20), cleanString(gender, 20), cleanString(blood_type, 20), cleanString(allergies, 1000),
    cleanString(chronic_diseases, 1000), cleanString(address, 1000), cleanString(notes, 2000), nowIso(), idValue(req.params.id)
  );
  
  res.json({ ok: true });
});

// --- MEDICAL RECORDS ---
router.get('/patients/:id/records', requireAuth, (req, res) => {
  const records = db.prepare('SELECT * FROM medical_records WHERE patient_id = ? ORDER BY visit_date DESC').all(idValue(req.params.id));
  res.json(records);
});

router.post('/patients/:id/records', requireAuth, (req, res) => {
  const patient_id = idValue(req.params.id);
  const { visit_date, diagnosis, treatment, prescription, doctor_notes } = req.body;
  if (!visit_date) return res.status(400).json({ error: 'Muayene tarihi zorunludur.' });
  
  const info = db.prepare(`
    INSERT INTO medical_records (patient_id, visit_date, diagnosis, treatment, prescription, doctor_notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    patient_id,
    cleanString(visit_date, 50),
    cleanString(diagnosis, 1000),
    cleanString(treatment, 2000),
    cleanString(prescription, 2000),
    cleanString(doctor_notes, 2000),
    nowIso()
  );
  
  res.status(201).json({ id: info.lastInsertRowid });
});

// --- PAYMENTS (FINANCE) ---
router.get('/payments', requireAuth, requireAdmin, (req, res) => {
  const payments = db.prepare(`
    SELECT p.*, pat.full_name as patient_name 
    FROM payments p 
    JOIN patients pat ON p.patient_id = pat.id 
    ORDER BY p.payment_date DESC LIMIT 200
  `).all();
  res.json(payments);
});

router.post('/payments', requireAuth, requireAdmin, (req, res) => {
  const { patient_id, amount, payment_method, payment_date, description } = req.body;
  if (!patient_id || !amount || !payment_method || !payment_date) return res.status(400).json({ error: 'Eksik bilgi girdiniz.' });
  
  const info = db.prepare(`
    INSERT INTO payments (patient_id, amount, payment_method, payment_date, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    patient_id,
    numberValue(amount),
    cleanString(payment_method, 50),
    cleanString(payment_date, 50),
    cleanString(description, 1000),
    nowIso()
  );
  
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/patients/:id/payments', requireAuth, requireAdmin, (req, res) => {
  const payments = db.prepare('SELECT * FROM payments WHERE patient_id = ? ORDER BY payment_date DESC').all(idValue(req.params.id));
  res.json(payments);
});

module.exports = router;
