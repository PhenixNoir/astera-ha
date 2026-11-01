# Sürüm notları

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
