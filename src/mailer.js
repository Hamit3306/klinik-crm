const nodemailer = require('nodemailer');
const config = require('./config');

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.port === 465, // true for 465, false for other ports
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

async function sendNotificationEmail(leadData) {
  if (!config.email.user || !config.email.pass || !config.email.notificationEmail) {
    console.warn('E-posta bildirim ayarları eksik. Lütfen .env dosyanızı kontrol edin.');
    return;
  }
  
  const mailOptions = {
    from: `"Klinik CRM" <${config.email.user}>`,
    to: config.email.notificationEmail,
    subject: `Yeni Müşteri Geldi! - ${leadData.fullName}`,
    text: `Merhaba,\n\nSisteme yeni bir müşteri kaydedildi (Numara alındı):\n\nAd Soyad: ${leadData.fullName}\nTelefon: ${leadData.phone}\nİlgilendiği İşlem: ${leadData.interest || '-'}\nKaynak: ${leadData.source}\n\nDetaylar için lütfen panele giriş yapın:\n${config.appUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #6C63FF; margin-top: 0; text-align: center;">Yeni Müşteri Geldi!</h2>
        <p style="font-size: 16px;">Sisteme yeni bir müşteri kaydedildi (telefon numarası alındı):</p>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Ad Soyad:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${leadData.fullName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Telefon:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;">
                <a href="tel:${leadData.phone_normalized}" style="color: #6C63FF; text-decoration: none;">${leadData.phone}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>İlgilendiği İşlem:</strong></td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${leadData.interest || '-'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Kaynak:</strong></td>
              <td style="padding: 8px 0;">${leadData.source}</td>
            </tr>
          </table>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${config.appUrl}" style="background-color: #6C63FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">CRM Paneline Git</a>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[${new Date().toISOString()}] Bildirim e-postası başarıyla gönderildi: ${leadData.phone}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] E-posta gönderme hatası:`, error.message);
  }
}

async function sendBackupEmail(backupFile) {
  if (!config.email.user || !config.email.pass || !config.email.notificationEmail) {
    console.warn('[YEDEKLEME MAİLİ] SMTP ayarları eksik. Mail gönderilmedi.');
    return;
  }
  
  const path = require('path');
  const fileName = path.basename(backupFile);
  
  const mailOptions = {
    from: `"Klinik CRM Sistem" <${config.email.user}>`,
    to: config.email.notificationEmail,
    subject: `Klinik CRM - Otomatik Yedekleme (${new Date().toLocaleDateString('tr-TR')})`,
    text: `Merhaba,\n\nSistemin günlük veritabanı yedeği (şifrelenmiş olarak) ektedir.\n\nDosya: ${fileName}\n\nBu dosya, .env dosyanızdaki ENCRYPTION_KEY anahtarı ile şifrelenmiştir. Anahtarı kaybetmediğiniz sürece bu dosyadan verilerinizi geri yükleyebilirsiniz.`,
    attachments: [
      {
        filename: fileName,
        path: backupFile
      }
    ]
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[YEDEKLEME MAİLİ] Şifreli yedek e-posta ile gönderildi: ${config.email.notificationEmail}`);
  } catch (error) {
    console.error(`[YEDEKLEME MAİLİ HATA] Yedek gönderilemedi:`, error.message);
  }
}

module.exports = { sendNotificationEmail, sendBackupEmail };
