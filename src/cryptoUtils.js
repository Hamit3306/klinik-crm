const crypto = require('crypto');
const config = require('./config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM için önerilen
const AUTH_TAG_LENGTH = 16;
const ENCODING = 'utf8';
const CIPHER_ENCODING = 'base64';

function getEncryptionKey() {
  if (!config.encryptionKey || config.encryptionKey.length !== 64) {
    throw new Error('Geçerli bir 64 karakterli (32-byte hex) ENCRYPTION_KEY bulunamadı!');
  }
  return Buffer.from(config.encryptionKey, 'hex');
}

function encrypt(text) {
  if (text === null || text === undefined || text === '') return text;
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(String(text), ENCODING, CIPHER_ENCODING);
    encrypted += cipher.final(CIPHER_ENCODING);
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encryptedText (hepsi base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('Şifreleme hatası:', error);
    return text; // Hata durumunda veriyi bozmamak için
  }
}

function decrypt(encryptedText) {
  if (encryptedText === null || encryptedText === undefined || encryptedText === '') return encryptedText;
  
  // Şifreli formatta değilse doğrudan döndür (geriye dönük uyumluluk veya yanlışlıkla şifrelenmemiş veriler için)
  if (typeof encryptedText !== 'string' || !encryptedText.includes(':')) {
    return encryptedText;
  }
  
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;

  try {
    const key = getEncryptionKey();
    const [ivBase64, authTagBase64, encryptedBase64] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedBase64, CIPHER_ENCODING, ENCODING);
    decrypted += decipher.final(ENCODING);
    return decrypted;
  } catch (error) {
    console.error('Şifre çözme hatası:', error);
    return encryptedText; // Hata durumunda orijinali döndür
  }
}

module.exports = {
  encrypt,
  decrypt
};
