# Tam Otomatik Meta Kurulumu

Bu belge `@your_instagram_account` hesabındaki Instagram formlarını, Instagram DM mesajlarını ve WhatsApp mesajlarını hiçbir manuel kişi girişi olmadan Klinik Meta CRM'e bağlamak içindir.

## 1. Canlı sistemin çalışma modeli

```text
Instagram Lead Formu ─┐
Instagram DM ─────────┼─→ Meta Webhook → CRM Backend → Veritabanı → Kişi Kartı + Gelen Kutusu
WhatsApp Mesajı ──────┘
```

Webhook bağlantısı yapıldıktan sonra klinik personeli kişi oluşturmaz. Sistem her yeni olayı otomatik işler.

## 2. Hesap ön koşulları

- Instagram hesabı Business veya Creator profesyonel hesap olmalıdır.
- Meta Business Portfolio içinde yönetilmelidir.
- Reklam formu için ilgili Facebook Sayfası, reklam hesabı ve Lead Access erişimi bulunmalıdır.
- Instagram Messaging API için profesyonel hesap uygulamaya bağlanmalıdır.
- WhatsApp numarası WhatsApp Business Platform / Cloud API'ye bağlanmalıdır.
- Uygulama üretimde gerekli izinler için Live moda alınmalı ve gerekiyorsa App Review tamamlanmalıdır.

## 3. HTTPS sunucu

Meta, `localhost` adresine gerçek mesaj gönderemez. Uygulama internetten erişilebilen HTTPS adreste çalışmalıdır.

```text
https://crm.alanadiniz.com/webhooks/meta
```

`.env` örneği:

```env
NODE_ENV=production
APP_URL=https://crm.alanadiniz.com
CORS_ORIGIN=https://crm.alanadiniz.com
META_VERIFY_TOKEN=cok_uzun_rastgele_bir_deger
META_APP_SECRET=uygulamanizin_app_secret_degeri
```

## 4. Instagram reklam formları

1. Meta for Developers üzerinde Business uygulaması oluşturun.
2. İlgili Facebook Sayfasını ve reklam varlıklarını uygulamaya bağlayın.
3. Webhooks bölümünde Page nesnesini seçin.
4. Callback URL olarak `/webhooks/meta` adresini girin.
5. Verify Token olarak `.env` içindeki `META_VERIFY_TOKEN` değerini kullanın.
6. `leadgen` alanına abone olun.
7. Lead Access Manager içinde uygulamaya lead erişimi verin.
8. Sayfa erişim tokenını ve Page ID'yi `.env` dosyasına yazın.

```env
META_PAGE_ACCESS_TOKEN=
META_PAGE_ID=
```

Meta yeni form için `leadgen_id` gönderir. CRM ayrıntıları Graph API'den alıp ad, telefon, e-posta, form cevapları, reklam ve kampanya bilgisini otomatik kaydeder.

## 5. Instagram DM

1. Meta uygulamasında Instagram ürününü ve Instagram Messaging API özelliğini etkinleştirin.
2. `@your_instagram_account` profesyonel hesabını uygulamaya bağlayın.
3. Webhook callback olarak `/webhooks/meta` adresini kullanın.
4. Instagram webhook alanlarında en az `messages` ve `messaging_postbacks` alanlarına abone olun.
5. Uygun Instagram erişim tokenını ve profesyonel hesap kimliğini `.env` dosyasına girin.

```env
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_API_BASE=https://graph.instagram.com
```

Bir kullanıcı DM attığında sistem otomatik olarak:

- Instagram Scoped ID'yi kaydeder.
- İzin verilen kullanıcı adı/ad bilgisini profil API'sinden almaya çalışır.
- Mesajı konuşma geçmişine ekler.
- Mesaj metnindeki telefon ve e-postayı otomatik algılar.
- İlgi alanını anahtar kelimelerden tahmin eder.
- Aynı telefon/e-posta ile daha önce form kaydı varsa kişileri birleştirir.

### Instagram telefon numarası sınırı

Instagram DM webhook'u kullanıcının kayıtlı telefon numarasını işletmeye vermez. Bu bir kod eksikliği değil, Meta'nın gizlilik sınırıdır. CRM, kullanıcı DM içinde telefonunu yazdığında numarayı otomatik algılar. Kullanıcı daha önce reklam formunda telefon verdiyse ve DM'de aynı telefon/e-posta bulunursa kayıtlar otomatik birleşir.

## 6. WhatsApp Cloud API

1. Meta uygulamasına WhatsApp ürününü ekleyin.
2. WhatsApp Business Account ve işletme telefon numarasını bağlayın.
3. Uygun kalıcı/system user tokenı oluşturun.
4. Aşağıdaki değerleri `.env` dosyasına girin.

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
```

5. WhatsApp Webhooks bölümünde `/webhooks/meta` callback adresini doğrulayın.
6. `messages` alanına abone olun.

WhatsApp mesajı geldiğinde telefon numarası webhook içinde bulunduğu için kişi doğrudan telefonla eşleştirilir. Klinik personeli numara yazmaz.

## 7. Otomatik kişi birleştirme

Sistem eşleştirmeyi şu kimliklerden yapar:

```text
Meta Lead ID
→ WhatsApp ID
→ Instagram Scoped ID
→ Telefon numarası
→ E-posta
```

Birden fazla kayıt aynı kişiye ait çıkarsa konuşmalar, aktiviteler ve randevular tek kişi kartında otomatik birleştirilir.

## 8. Mesajlara panelden cevap verme

**Mesaj Gelen Kutusu** ekranında Instagram ve WhatsApp konuşmaları birlikte görünür. Kanal otomatik seçilir:

- WhatsApp konuşmasında cevap WhatsApp Cloud API üzerinden gider.
- Instagram konuşmasında cevap Instagram Messaging API üzerinden gider.

Tokenlar girilmemiş yerel geliştirme ortamında cevap yalnızca demo olarak veritabanına kaydedilir.

## 9. Kampanya eşleştirme

Kampanyalar sayfasına Meta kimliklerini girin:

- Campaign ID
- Ad Set ID
- Ad ID
- Lead Form ID

Eşleştirme sırası:

```text
Ad ID → Ad Set ID → Campaign ID → Form ID
```

## 10. Güvenlik

- `META_APP_SECRET` ile `X-Hub-Signature-256` imzası doğrulanır.
- Aynı webhook gövdesi ikinci kez işlenmez.
- Tokenlar yalnızca sunucudaki `.env` dosyasında tutulur.
- Üretimde HTTPS, güvenlik duvarı, otomatik yedekleme ve erişim logları kullanılmalıdır.
- Sağlık/iletişim verilerinin saklanması için KVKK süreci ayrıca yürütülmelidir.

## 11. Canlı test

### Instagram DM

Başka bir Instagram hesabından `@your_instagram_account` hesabına mesaj gönderin. Birkaç saniye içinde Mesaj Gelen Kutusu'nda Instagram konuşması ve Leadler ekranında kişi oluşmalıdır.

### WhatsApp

Başka bir telefondan işletme WhatsApp numarasına mesaj gönderin. Kişi telefon numarasıyla otomatik oluşmalı ve mesaj gelen kutusuna düşmelidir.

### Lead formu

Meta Lead Ads test aracından veya gerçek reklam önizlemesinden form gönderin. Formdaki tüm alanlar kişi kartında otomatik görünmelidir.
