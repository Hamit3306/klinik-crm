# Klinik Meta CRM v3.0 — Test Raporu

Test tarihi: 27 Temmuz 2026

## Doğrulanan senaryolar

- Node.js kaynak dosyalarının sözdizimi kontrolü
- Sunucunun temiz SQLite veritabanıyla açılması
- Yönetici girişinin çalışması
- Instagram form lead'inin otomatik oluşturulması
- Gerçek webhook biçimine benzer Instagram DM olayının işlenmesi
- Instagram mesaj metnindeki telefon numarasının otomatik algılanması
- Gerçek webhook biçimine benzer WhatsApp mesaj olayının işlenmesi
- Form, Instagram DM ve WhatsApp kayıtlarının aynı telefonla tek kişi kartında birleşmesi
- Instagram ve WhatsApp için iki ayrı konuşmanın aynı lead'e bağlanması
- Mükerrer webhook gövdesinin ikinci kez işlenmemesi altyapısı
- Mesaj gelen kutusunun iki kanalı desteklemesi
- Kanal tipine göre WhatsApp veya Instagram gönderim fonksiyonunun seçilmesi

## Uçtan uca test sonucu

Test kişisi önce Instagram formundan oluşturuldu. Daha sonra aynı telefon numarası Instagram DM mesajı içinde gönderildi ve son olarak aynı numaradan WhatsApp mesajı işlendi.

Beklenen ve gerçekleşen sonuç:

```text
Lead sayısı: 1
Kaynak: Instagram Formu + Instagram DM + WhatsApp
Instagram konuşması: 1
WhatsApp konuşması: 1
Konuşmaların bağlı olduğu lead: aynı kişi
Telefon: +90 555 123 45 67
```

## Canlı ortamda ayrıca doğrulanması gerekenler

Aşağıdaki testler gerçek işletme Meta hesabı, erişim tokenları ve HTTPS sunucu olmadan yerel ortamda doğrulanamaz:

- Gerçek Instagram Lead Ads test formu
- Gerçek `@burun.estetigi_` DM webhook'u
- Gerçek WhatsApp işletme numarası webhook'u
- Instagram'a panelden gerçek cevap gönderimi
- WhatsApp'a panelden gerçek cevap gönderimi
- Meta App Review ve işletme izinleri

Kod tarafında bu bağlantılar `.env` değişkenleri ve ortak `/webhooks/meta` endpoint'i için hazırlanmıştır.
