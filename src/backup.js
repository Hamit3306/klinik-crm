const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const config = require('./config');
const { sendBackupEmail } = require('./mailer');

const ALGORITHM = 'aes-256-cbc';

function runBackup() {
  const backupDir = path.join(config.rootDir, 'data', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const dateStr = new Date().toISOString().replace(/:/g, '-').split('.')[0]; 
  const destFile = path.join(backupDir, `klinik_${dateStr}.db.gz.enc`);

  if (!config.encryptionKey || config.encryptionKey.length !== 64) {
    console.error('[YEDEKLEME HATA] ENCRYPTION_KEY tanımlı değil veya geçersiz (32-byte hex olmalı). Yedekleme yapılamadı!');
    return Promise.reject(new Error('Invalid ENCRYPTION_KEY'));
  }

  const key = Buffer.from(config.encryptionKey, 'hex'); // 32 bytes
  const iv = crypto.randomBytes(16);

  const gzip = zlib.createGzip();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const input = fs.createReadStream(config.databasePath);
  const output = fs.createWriteStream(destFile);

  // Geri yükleme yaparken kullanabilmek için IV'yi dosyanın en başına yazıyoruz
  output.write(iv);

  input.pipe(gzip).pipe(cipher).pipe(output);

  return new Promise((resolve, reject) => {
    output.on('finish', async () => {
      console.log(`[YEDEKLEME] Veritabanı sıkıştırıldı, şifrelendi ve yedeklendi: ${destFile}`);
      
      // E-posta olarak buluta / yöneticiye gönder
      await sendBackupEmail(destFile);

      // Eski yedekleri temizle (Son 30 günü tutar)
      fs.readdir(backupDir, (err, files) => {
        if (err) return resolve(destFile);
        const now = Date.now();
        files.forEach(file => {
          if (!file.endsWith('.enc')) return;
          const filePath = path.join(backupDir, file);
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > 30 * 24 * 60 * 60 * 1000) {
            try {
              fs.unlinkSync(filePath);
              console.log(`[YEDEKLEME] Eski yedek silindi: ${file}`);
            } catch(e) {}
          }
        });
        resolve(destFile);
      });
    });
    output.on('error', reject);
    cipher.on('error', reject);
    gzip.on('error', reject);
    input.on('error', reject);
  });
}

if (require.main === module) {
  runBackup().then(() => {
    console.log("Manuel yedekleme tamamlandı.");
  }).catch(err => {
    console.error("Yedekleme hatası:", err);
  });
}

module.exports = { runBackup };
