# Sürüm notları

## 1.7.7
- Özel sipariş düzenleyicisi yenilendi (geniş pencere): solda müşteri, tarih ve ödeme; sağda kalemler. Her kalemin adedi, isteğe bağlı parçaları (kol, kafa, kaide…), basılan ilerlemesi; "Parçalı", "Ayrı fiyat / gram" ve "Filament rengi" tikleri; kalemi çoğaltma; seçilen kalem/parçaları baskıya verme. Baskı bitince basılan adetler kalemlere işlenir.
- Özel sipariş kartları sütunlar arasında sürükle-bırak ile taşınır (Baskıda'ya bırakınca baskı penceresi açılır).
- Sipariş notları: Ayarlar → Mağaza ve Kargo'da kurallar (ör. sipariş tutarı en az 500 ₺ → "🎁 Hediye koy"); birden çok koşul (hepsi / biri). Uyan Trendyol siparişinde kartta not görünür.

## 1.7.6
- Kendi bilgisayarında çalışan Astera için tek tuşla güncelleme: Ayarlar → Genel → Uygulama'da "Yeni sürüm hazır" kutusu, değişiklik listesi ve Güncelle düğmesi. Güncellemeden önce otomatik yedek alınır, eski dosyalar data/eski_surum'a saklanır, program kendiliğinden yeniden başlar. Yeni sürüm çıkınca bildirim gelir (6 saatte bir kontrol).

## 1.7.5
- İlk kurulum sihirbazı: mağaza adı ve logo, Trendyol bağlantısı (dene düğmesiyle), makineler, stok düşme aşaması / kargo saati / mağaza konumu, kategoriler ve özet. Hiç ürün ve Trendyol bağlantısı yokken kendiliğinden açılır; Ayarlar → Genel → "Kurulum sihirbazını aç" ile yeniden açılabilir.

## 1.7.4
- Ayarlar yeniden düzenlendi: solda gruplar (Genel, Mağaza ve Kargo, Trendyol, Üretim, Bildirimler, Uzaktan erişim, Veri ve Yedek) ve ayar arama kutusu.
- Yeni ayar: Trendyol siparişinde stok ne zaman düşsün (sipariş gelince / Hazırlanıyor'a çekilince / kargo barkodu basılınca / kargoya verilince). Varsayılan değişmedi.
- Trendyol bağlantı ayarları Satış sayfasından Ayarlar → Trendyol'a taşındı.

## 1.7.3
- Ürün kartında görsele tıklayınca düzenleme açılır; köşedeki küçük düğme görseli büyütür.
- Parçalı ürünlerde parçaların gramı girilince ürünün gramı otomatik toplam olur (kâr ve malzeme hesabı buna göre).

## 1.7.2
- Siparişlerde şehrin yanında ilçe. Ayarlar → Kargo'ya mağaza il/ilçesi eklendi; aynı yere giden siparişte yeşil "Yakın · not ekle" etiketi.
- Sipariş içindeki ürün adına tıklayınca menü: Ürünü düzenle, Satış istatistikleri, Trendyol'da aç (ayrı Trendyol bağlantısı kaldırıldı).
- Sipariş kartları hafif sıralı tonla (zebra) ayrışır; filtre satırı daraltıldı.

## 1.7.1
- Yeni sipariş, iade ve soru gelince ekranın alt ortasında kısa bir şerit çıkar ve ses çalar (siparişe yeni, neşeli bir ses); şeride tıklayınca ilgili sayfa açılır.
- Sipariş Hazırlanıyor'a çekilince altta 2 saniyelik "Sipariş çıkarıldı" şeridi.
- Cevap bekleyen Trendyol soruları artık her dakika kontrol edilir (önceden 5 dakikada bir).

## 1.7.0
- Özel siparişler parça parça basılabilir: aynı siparişe aynı anda birden çok makinede baskı açılır, kartta "Basılan 12/48 · baskıda 24" ilerlemesi ve "Kalan N adedi bas" düğmesi görünür; hepsi basılınca sipariş kendiliğinden Hazır'a geçer.
- Altyapı: uzaktan erişim şifresi (Cloudflare Tunnel için; şifre belirlenmedikçe kapalı, ev ağını etkilemez).

## 1.6.9
- Siparişler: "Ayrıntılı göster" anahtarı. Kapalıyken fiyat, kâr ve raf sayısı gizlenir; açıkken "rafta 19 → bu siparişten sonra 18" gibi kalan adet görünür.
- Son teslim günü bugün olan siparişlerde, kart kapalıyken bile "Bugün verilmeli" yazar.

## 1.6.8
- Etiket logosu Ayarlar'dan değiştirilebilir (yükle / paketle gelen / logo yok).

## 1.6.7
- Adet rozetindeki rakamlar büyütüldü.

## 1.6.6
- Sipariş ürünlerinde adet görselin köşesinde rozet; renk adede göre (gri → kırmızı → turkuaz → lila → 10+ elmas).

## 1.6.5
- Siparişte baskıdaki adetler de hesaba katılır ("Rafta yok · 20 baskıda", yetmezse eksik sayısı).
- Sipariş satırında adet görselin yanında; Trendyol ürün sayfasına bağlantı.

## 1.6.4
- Bildirim panelindeki titreme giderildi (veri değişmedikçe yeniden çizilmiyor).

## 1.6.3
- Bildirim paneli renkli bölümlere ayrıldı: Buybox (tıklanana kadar kalır), Yazıcılar, Siparişler, Müşteri, Diğer.

## 1.6.2
- Sipariş kârında komisyon siparişin kendi oranından (indirimli komisyon dahil); ödeme hesaplandıysa cari hesaptaki gerçek tutar.

## 1.6.1
- Stok uyarısı siparişler arasında sırayla hesaplanır (en eski önce): rafta 8, 10 siparişte 1'er adet varsa son 2 sipariş "Sıra gelince yetmiyor" der.

## 1.6.0
- "Trendyol'da düzenle": başlık, açıklama, görseller, özellikler, stok kodu ve kargoya veriliş süresi; değişenler turuncu, gönderim öncesi eski → yeni onayı.

## 1.5.0
- Trendyol fiyatı değiştirme ve sipariş kargo firması değiştirme; her seferinde "eski → yeni" onayı.
- Satış ayarlarında varsayılan kapalı "Trendyol'a değişiklik gönder" ana anahtarı.

## 1.4.0
- Siparişte adet yetmiyorsa uyarı (3 lazım, rafta 1); çok parçalı üründe eksik parça sayısı.
- Kapalı listede eksik siparişler yanıp söner (bazı kalemler sarı, hepsi kırmızı); son teslim ve "BUGÜN" vurgusu.
- Geç onaylanan baskı çizelgede bildirimin geldiği andan başlar.
- Sıralama seçimleri bilgisayarda hatırlanır; yazıcı bildirimleri panelde yanıp söner.

## 1.3.0
- Yeni sipariş kartı: büyük ürün satırları, belirgin adet, "Rafta yok" vurgusu, büyük Hazırlanıyor/Barkod düğmeleri, açılır kâr ayrıntısı.

## 1.2.0
- İadeler sayfası: onaylama, gerekçeli reddetme (dosya ekli), stoğa geri ekleme; iade için sesli uyarı.
- Müşteri soruları sayfası: cevaplama; soru için ayrı bildirim sesi.
- Trendyol Express dışı kargo etiketinde uyarı penceresi.

## 1.1.1
- Etikete yuvarlak köşeli çerçeve geri geldi; kargo firması alt köşede; ilçe/il yazısında Türkçe harflerin noktaları kesilmiyor.

## 1.1.0
- Kendi kargo etiketimiz (100×80): takip barkodu, alıcı ve adres (uzun adreste yazı küçülür), logo, ilçe/il, sipariş no, yedek barkod.
- "Barkod" düğmesi bilgisayarın yazdırma penceresini açar; hangi bilgisayardan basılırsa o yazıcı kullanılır.
- Trendyol hazır etiket yetkisi yoksa anlaşılır uyarı.

## 1.0.0
- Home Assistant eklentisi olarak ilk sürüm.
- Veriler eklenti yapılandırma klasöründe (`/addon_configs/..._astera`), güncellemelerde korunur.
- Etiket yazıcısı: Linux'tan Windows paylaşımına smbclient ile basma (isteğe bağlı kullanıcı/şifre).
- Ayarlar'da sürüm bilgisi.
