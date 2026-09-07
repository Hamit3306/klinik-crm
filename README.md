# Klinik Meta CRM v3.0

`@your_instagram_account` hesabı için Instagram Lead Ads, Instagram DM ve WhatsApp Cloud API mesajlarını **hiçbir manuel kişi girişi gerektirmeden** tek CRM havuzuna aktaran klinik takip sistemi.

## Otomatik çalışma biçimi

- Instagram reklam formu doldurulur → ad, telefon, e-posta, form cevapları ve reklam bilgisi otomatik kaydedilir.
- Instagram DM gelir → Instagram kullanıcı kimliği, kullanıcı adı/ad bilgisi ve mesaj otomatik kaydedilir.
- Instagram mesajında telefon veya e-posta yazılmışsa otomatik algılanır.
- WhatsApp mesajı gelir → profil adı, telefon numarası ve mesaj otomatik kaydedilir.
- Aynı telefon/e-posta/Meta kimliği daha önce varsa ikinci kişi açılmaz; kayıtlar otomatik birleştirilir.
- Tüm mesajlar **Mesaj Gelen Kutusu** ekranında kanalına göre görünür.

Klinik personelinin kişi kartı oluşturmasına gerek yoktur. Manuel kayıt ekranı yalnızca yedek kullanım içindir.

## Önemli platform sınırı

WhatsApp webhook'u kullanıcının telefon numarasını otomatik gönderir. Instagram DM webhook'u ise telefon numarası göndermez; Instagram yalnızca mesaj gönderen hesaba ait Instagram kapsamlı kullanıcı kimliği ve izin verilen profil bilgilerini verir. Kullanıcı telefonunu DM içinde yazarsa sistem metinden otomatik çıkarır. Kişi daha önce Meta formunu aynı telefon/e-posta ile doldurduysa kayıt otomatik birleştirilir.

## Özellikler

- Instagram Lead Ads `leadgen` webhook entegrasyonu
- Instagram Messaging API gelen/giden DM entegrasyonu
- Instagram kullanıcı profil bilgisini otomatik alma
- DM metninden telefon ve e-posta otomatik algılama
- WhatsApp Cloud API gelen/giden mesaj entegrasyonu
- Telefon, e-posta, WhatsApp ID, Instagram Scoped ID ve Meta Lead ID ile otomatik eşleştirme
- Mükerrer kişi kayıtlarını otomatik birleştirme
- Instagram ve WhatsApp ortak mesaj gelen kutusu
- Lead, kampanya ve randevu ilişkileri
- SQLite merkezi veritabanı
- Meta webhook imza doğrulaması ve mükerrer olay engelleme
- Güvenli sunucu taraflı giriş ve oturum yönetimi
- Yerel test için üç ayrı simülasyon

## Gereksinimler

- Node.js 22 veya üzeri
- Canlı entegrasyon için internete açık HTTPS alan adı
- Meta Business Portfolio
- Profesyonel Instagram Business/Creator hesabı
- İlgili Facebook Sayfası ve reklam hesabı
- WhatsApp Business Platform / Cloud API hesabı
- Gerekli Meta izinleri ve webhook abonelikleri

## Hızlı başlangıç

Windows'ta ZIP'i çıkarıp `BASLAT.bat` dosyasını çalıştırın.

Terminal ile:

```bash
npm install
cp .env.example .env
npm start
```

Tarayıcı:

```text
http://localhost:3001
```

İlk giriş:

```text
Kullanıcı adı: admin
Şifre: klinik2026
```

Üretime geçmeden önce `ADMIN_PASSWORD` değerini değiştirin.

## Canlı Meta bağlantısı

Ayrıntılı kurulum: [META_KURULUM.md](META_KURULUM.md)

Ortak webhook adresi:

```text
https://crm.alanadiniz.com/webhooks/meta
```

Ayrı alias adresleri:

```text
https://crm.alanadiniz.com/webhooks/leadgen
https://crm.alanadiniz.com/webhooks/instagram
https://crm.alanadiniz.com/webhooks/whatsapp
```

## Gerekli `.env` değerleri

```env
APP_URL=https://crm.alanadiniz.com
CORS_ORIGIN=https://crm.alanadiniz.com

META_VERIFY_TOKEN=
META_APP_SECRET=
META_GRAPH_VERSION=v25.0
META_PAGE_ACCESS_TOKEN=
META_PAGE_ID=

INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_API_BASE=https://graph.instagram.com

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

INSTAGRAM_USERNAME=your_instagram_account
```

Gizli değerleri frontend dosyalarına veya GitHub'a yazmayın.

## Otomatik test akışı

1. Uygulamaya giriş yapın.
2. **Meta Entegrasyonu** sayfasına girin.
3. Sırasıyla Form Lead'i, Instagram DM ve WhatsApp Mesajı testlerini çalıştırın.
4. Üç test de aynı telefonla çalıştığı için tek kişi kartında birleşir.
5. **Mesaj Gelen Kutusu** ekranında hem Instagram hem WhatsApp konuşmaları görünür.

## Veritabanı

```text
data/klinik.db
```

Üretimde şifreli, otomatik ve farklı sunucuya alınan yedek kullanılmalıdır.

## Proje yapısı

```text
public/              Yönetim paneli
src/config.js        Ortam ayarları
src/db.js            SQLite şeması ve otomatik migrasyonlar
src/auth.js          Oturum yönetimi
src/meta.js          Lead Ads + Instagram DM + WhatsApp entegrasyonu
server.js            API ve webhook sunucusu
data/                 Veritabanı klasörü
```
