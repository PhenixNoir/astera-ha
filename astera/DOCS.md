# Astera Management

3D baskı stok ve üretim takibi, yazıcı entegrasyonları (Bambu, Moonraker, Elegoo), Trendyol siparişleri, kargo etiketi ve finans.

## Panele erişim

Eklenti çalışınca **Web arayüzünü aç** düğmesi paneli açar: `http://<pi-adresi>:8080`.
Port başka bir eklentiyle çakışırsa **Yapılandırma** sekmesinden değiştirin.

## Verilerin yeri

Veritabanı, görseller, yedekler ve etiket önbelleği eklentinin yapılandırma klasöründedir
(`/addon_configs/<...>_astera`). Güncellemeler bu klasöre dokunmaz. Home Assistant yedekleri bu klasörü de kapsar.

## Windows'tan taşıma (bir kerelik)

1. Windows'ta Astera'yı kapatın (Durdur.bat).
2. Home Assistant'ta **Samba share** eklentisini kurun ve başlatın.
3. Bu eklentiyi bir kez başlatıp durdurun (klasör oluşsun).
4. Windows'ta Dosya Gezgini'nde `\\<pi-adresi>\addon_configs` açın, `..._astera` klasörüne girin.
5. Windows'taki `Atolye\data` klasörünün **içindekileri** (atolye.db, uploads, yedek, etiket) buraya kopyalayın;
   aynı adlı dosyaların üzerine yazın.
6. Eklentiyi başlatın.

## Güncelleme

Yeni sürüm çıktığında Home Assistant **Ayarlar → Eklentiler**'de ve Ayarlar sayfasında "Güncelleme var" gösterir.
**Güncelle**'ye basmanız yeterli; veriler korunur. Güncellemeden önce Home Assistant otomatik yedek alabilir.

## Kargo etiketi yazıcısı

Astera **Ayarlar → Kargo etiketi yazıcısı**'ndan seçilir. Yazıcı Windows bilgisayarda paylaşılmışsa
"Paylaşılan yazıcı" seçeneğinde o bilgisayarın adını/IP'sini ve yazıcının paylaşım adını yazın; paylaşım şifre
istiyorsa kullanıcı adı ve şifreyi de girin (şifre tarayıcıya hiç gönderilmez).

## Telefon bildirimleri

Telefon uygulamasının bildirim alabilmesi için panelin https ile açılması gerekir (ör. Tailscale).
