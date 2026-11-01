# Astera Management — 3D baskı stok ve üretim takibi

Ana bilgisayarda çalışan, telefondan ve ağdaki diğer bilgisayarlardan tarayıcıyla açılan stok sistemi.
Sadece Python gerekir; başka hiçbir paket kurmanız gerekmez.

## Kurulum (bir kez)

1. **Python 3** kurun: https://www.python.org/downloads/
   Kurulumun ilk ekranında **"Add python.exe to PATH"** kutusunu işaretleyin.
2. Bu klasörü kalıcı bir yere koyun (ör. `C:\Atolye`).
3. **Baslat.bat** dosyasına çift tıklayın. Tarayıcı `http://localhost:8080` adresinde açılır.
4. İlk açılışta Windows Güvenlik Duvarı sorarsa **"Özel ağlar"** için izin verin; telefondan erişim bununla açılır.

Siyah pencerede telefondan girilecek adres yazar, ör. `http://192.168.1.25:8080`.
Telefonda bu adresi açıp tarayıcı menüsünden **"Ana ekrana ekle"** derseniz uygulama gibi açılır.

> İpucu: Modem arayüzünden bilgisayara sabit IP (DHCP rezervasyonu) verirseniz adres hiç değişmez.

### Bilgisayar açılınca kendiliğinden çalışsın

`Win + R` → `shell:startup` yazın → açılan klasöre **Arka_planda_baslat.vbs** dosyasının kısayolunu koyun.
Pencere açılmadan arka planda çalışır. Durdurmak için **Durdur.bat**.

## Nasıl çalışır

**Ürünler** — Her ürün için tür (Figür / Kitap ayracı / Dekor), baskı türü (FDM/SLA), görsel, gram, baskı süresi, bir baskıda çıkan adet,
1–6 filament/reçine (renk paletten + marka/model; öneriler yalnızca o renkle daha önce girdiklerinizden gelir, figürlerde filament gerekmez), **adet/set** (tekli ürün 1, 3'lü set 3; stok ve baskı set olarak sayılır), dosya adı, stok, en az stok ve Trendyol barkodu.
Görseli dosyadan seçebilir, sürükleyebilir ya da kopyalayıp **Ctrl+V** ile yapıştırabilirsiniz. Görsel alanına dilimlenmiş bir Bambu Studio / OrcaSlicer `.3mf` bırakırsanız önizleme, süre, gram ve
filament renkleri otomatik dolar.

**Çok parçalı ürünler** — Ürün kartında "Bu ürün birden fazla parçadan oluşuyor"u açıp parçaları ve bir
üründe kaçar adet olduklarını girin (ör. boya tutucu: Taban ×1, Kol ×4, Kapak ×4 = 9 parça). Yeni baskıda
hangi parçaları bastığınızı seçersiniz; "Eksik parçalar" düğmesi sonraki seti tamamlayacak parçaları doldurur.
Basılan parçalar "elde" sayılır, bir setin tüm parçaları tamamlanınca ürün kendiliğinden stoğa eklenir.
Aktif baskıda "5 parça bu baskıda · 4/9 parça kaldı" şeklinde görünür. Parçalar farklı renkteyse
"Tüm parçalar aynı renk" anahtarını kapatıp her parçaya ayrı renk ve filament seçebilirsiniz.

**Ortak parçalar (havuz)** — Birden fazla üründe birebir aynı olan parçalar (ör. kitap sırtı base'i) Ürünler →
**Ortak parçalar** sekmesinde tanımlanır ve stokları tek havuzda tutulur. Ürünün parça listesinde o parçanın
yanındaki seçimden "Ortak: …" seçin. Ürüne özel parça (ör. Yuji ön yüzü) basılınca havuzda base varsa set
kendiliğinden tamamlanır ve havuzdan bir base düşer. Base'leri ayrıca basmak için Yeni baskı → **Ortak parça**;
bitince havuza eklenir ve ön yüzü hazır bekleyen ürünlerin setleri tamamlanır (stoğu en az olandan başlayarak).

**Renk varyantları** — Tıpatıp aynı ama farklı renkte ürünler için ürün düzenleme penceresinde **Renk varyantı**.
Ad, süre, gram, dosya, kategori ve parça yapısı tüm varyantlarda ortaktır (birinde değiştirince hepsinde değişir);
renk, görsel, stok ve Trendyol barkodu her varyantta ayrıdır. Ürünler sayfasında tek kartta renk renk görünürler.

**Kategoriler** — Ayarlar → Kategoriler'den eklenir, yeniden adlandırılır, silinir. "Filament seçilmez" (boyanan
figürler gibi) ve "Tek parça" (ayraçlar gibi) seçenekleri o kategorideki ürünlerin formunu belirler.

**Makineler** — Ayarlar'dan makinelerinizi ekleyin, türünü seçin ve isterseniz fotoğrafını yükleyin.
Aktif baskılarda ürün görselinin köşesinde makinenin küçük görseli durur.

**Bambu Lab bağlantısı** — Ayarlar → Makineler'de Bambu yazıcınızın kartını açıp **Bambu bağlantısı** bölümüne
IP adresini, seri numarasını ve erişim kodunu girin (yazıcı ekranında Ayarlar → WLAN / Ağ). Bulut ve Bambu Handy
açık kalabilir; Astera yalnızca durumu okur, yazıcıya komut göndermez.
- Yazıcıda baskı başlayınca dosya adından ürün bulunur ve Astera'da baskı kendiliğinden açılır. Eşleşme için
  ürün kartındaki **Dosya adı** alanına Bambu'daki proje/dosya adını yazın (ör. `Sakura_ayrac_v2.3mf`).
- Tanınmayan dosyada ya da çok parçalı üründe ekranın altında uyarı çıkar; bir kez ürüne bağladığınızda o dosya
  bundan sonra hep tanınır.
- Kalan süre, yüzde ve katman yazıcıdan gelir. Baskı bittiğinde ya da yazıcı hata bildirdiğinde sonuç penceresi hemen açılır.
- Otomatik açılan baskıda adet bir önceki baskıdan tahmin edilir; sonuç penceresinde düzeltebilirsiniz.
- Erişim kodu yazıcının LAN ayarlarını değiştirince yenilenir; bağlantı koparsa kartta "erişim kodu kabul edilmedi" yazar.

**Yeni baskı** — Ürünü ve adedi seçersiniz, süre ürünün baskı süresinden gelir (değiştirebilirsiniz).
Adetler "üretimde" olarak görünür. Süre dolduğu anda ekranın ortasında **Baskı bitti** penceresi açılır ve ses çalar
(başka bir pencere açıksa üstte bir uyarı şeridi çıkar):

- **Başarılı** → sağlam çıkan adet (ör. 6'dan 5'i) stoğa eklenir.
- **Başarısız** → stoğa bir şey eklenmez, geçmişe fire olarak yazılır.
- **Henüz bitmedi** → +15 dk / +30 dk / +1 sa / +2 sa seçip süre eklersiniz, süre dolunca tekrar sorar.

**Pano** — "Panoyu düzenle" ile bölümleri sürükleyip sıralayabilir, gizleyebilir, yarım/tam genişlik yapabilirsiniz.
Düzen her cihazda ayrı kaydedilir.

**Bildirimler hakkında:** Tarayıcılar sistem bildirimini yalnızca `https://` veya `localhost` adreslerinde
gösteriyor. Ana bilgisayarda `localhost` ile açıkken Windows bildirimi gelir. Telefonda `http://192.168...`
ile açıkken uygulama ekranda sorar ve ses çalar, fakat sekme kapalıyken bildirim gelmez.

**Satış** — Üç yol var:

1. **Trendyol otomatik:** Satıcı Paneli → Hesap Bilgilerim → Entegrasyon Bilgileri'ndeki Satıcı ID, API Key
   ve API Secret'ı girip takibi açın. Kurgu şudur:
   - **Yeni** sipariş stoğa dokunmaz; sadece Hazırla sayfasında görünür.
   - Siparişi paketleyip Trendyol'da **Hazırlanıyor**'a çektiğinizde stok düşer ve sipariş **Paketlendi** olur
     (Hazırla'da "Bugün paketlenenler"e geçer). Kontrol birkaç dakikada bir yapılır; Hazırla'daki **Yenile** hemen kontrol eder.
   - Paketlendikten sonra iptal edilen sipariş stoğa geri eklenir. Her satır yalnızca bir kez düşülür.
   - Hangi siparişin düşüleceğine **paketlenme anına** bakılarak karar verilir (Trendyol paket geçmişinden okunur):
     Satış → Trendyol ayarlarındaki **Takip başlangıcı**ndan sonra paketlenenler düşer, öncekilere dokunulmaz.
     Takip başlangıcını son stok sayımınızı yaptığınız ana ayarlayın.
   - Barkodu tanımlı olmayan ürün Hazırla'da "Eşleşmedi" görünür; ürününüzü seçtiğinizde barkod kaydedilir,
     sipariş paketlenmişse stok hemen düşer.
2. **Barkod okutma:** USB/Bluetooth barkod okuyucuyla ürün barkodunu okutunca 1 adet düşer.
3. **Elle:** Ürün kartlarındaki − / + düğmeleri veya Satış sayfasındaki "Elle satış düş" formu.
   Her işlemden sonra birkaç saniye "Geri al" çıkar.

Stok eksiye düşebilir; bu, satılmış ama henüz basılmamış ürünü gösterir ve panoda kırmızı görünür.

**Hazırlanacaklar** — Trendyol'da şu an Yeni durumundaki siparişlerdeki ürünleri toplar: "Sakura ayraç
10 adet, 7 siparişte" gibi. Raftaki adetle karşılaştırır, yetmeyenleri kırmızı gösterir ve tek dokunuşla
baskı başlatmanızı sağlar; eksik ürün o sırada baskıdaysa kaç tanesinin baskıda olduğu ve kalan süre
yanında görünür. Yazdırılabilir.
Her siparişin Trendyol'un verdiği kargoya son teslim tarihine göre canlı geri sayımı vardır. Kargonuz daha erken
çıkıyorsa Ayarlar → Kargo'dan çıkış saatini girin (varsayılan 17:00). Gecikenler, son saatlere girenler ve rafta
eksik olup baskısı yetişmeyecek olanlar kırmızı görünür; liste en acilden başlar. Panoda da bugün çıkması
gerekenler ve bugün için eksik ürünler özetlenir.

**Siparişler → Trendyol** — Trendyol siparişleri Yeni / Hazırlanıyor / Kargoda / Teslim / İptal-İade
sekmelerinde, her biri tek satır: sipariş no, ürün görselleri, müşteri ve şehir, tutar, tahmini kâr ve marj,
son teslim geri sayımı. Yeni ve Hazırlanıyor'da tüm açık siparişler, diğer sekmelerde seçilen ayın siparişleri
görünür; sipariş no, müşteri, şehir veya ürünle aranabilir. Tarih (bugün, dün, bu hafta, bu ay, geçen ay,
son 30 gün, son 3 ay, özel aralık), kategori ve ürüne göre süzülebilir. Uzun listeler bilgisayarda kendi içinde kayar,
telefonda sekmeler ve arama ekranın üstünde sabit kalır. Satıra dokununca ürünler ve kâr dökümü açılır.
Yeni siparişleri tek tek ya da seçip toplu olarak **Hazırlanıyor'a çekebilirsiniz**: Trendyol'da durum değişir
ve ürünler o anda stoktan düşer (Trendyol'da geri alınamaz, onay sorulur).
Siparişin kârı: satıcıya kalan tutar (brüt − sizin indiriminiz; Trendyol'un karşıladığı indirim size yine ödenir),
kargo ve hizmet bedeli sipariş başına bir kez, kargo baremi müşterinin ödediği toplama göre. İstatistik sayfasında
ayın Trendyol cirosu, tahmini kârı ve ürün bazında kâr da görünür. Bu sürüme geçince eski siparişlerin fiyatları
ilk eşitlemede Trendyol'dan bir kez doldurulur (en fazla 90 gün geriye).

**Siparişler → Özel siparişler** — Özel siparişler ad-soyad, telefon (tek dokunuşla arama/WhatsApp), istek, referans görseli,
reçine, makine, tahmini baskı süresi, fiyat/alınan ödeme, **siparişin geldiği gün** ve **termin** ile
Yeni → Baskıda → Hazır → Teslim edildi akışında. Termini "+3 gün / +1 hafta" gibi düğmelerle geliş gününe
göre verebilirsiniz; geciken siparişler kırmızı, yaklaşanlar panoda "Yaklaşan terminler"de görünür.

"Baskıya al" süre ve makineyi sorar, siparişi **Baskılar** listesine ve panodaki tablaya ekler. Süre
dolunca diğer baskılar gibi sorulur: başarılıysa sipariş Hazır'a geçer, başarısızsa tekrar basılmak üzere
Yeni'ye döner. Stok değişmez. Yeni baskı penceresinde "Özel sipariş" sekmesinden de başlatabilirsiniz.

**Filamentler** — Her makara ayrı kayıttır: benzersiz ID (otomatik #001, #002… sırayla verilir, isterseniz
değiştirirsiniz), malzeme (PLA, PLA Matte, PETG, ABS, TPU…), renk (paletten), marka/model, makara net ağırlığı,
kalan filament, boş makara darası, fotoğraf (Ctrl+V ile yapıştırılabilir) ve not. Aynı makaradan birden çok
aldıysanız "Adet" ile tek seferde ekleyin; her biri kendi ID'sini alır. **Sıfır makara** işaretliyse kalan,
net ağırlığa (ör. 1000 g) eşitlenir. Makarayı tartıya koyup ağırlığı girerseniz kalan, darayı düşerek hesaplanır.
150 g altı makaralar "azaldı" olarak işaretlenir; biten makaralar "Bitenler" altında durur.

Ürün düzenlerken her filament satırının altında o renkteki makaralarınız küçük görsellerle görünür.
**Yeni baskı** başlatırken hangi makaranın kullanıldığını seçersiniz: aynı renkteki makara önerilir, "Benzer
renkler" ayrıca listelenir ama herhangi bir makarayı seçmek serbesttir (ya da "Makara kullanma"). Baskı bitince
sonuç penceresinde harcanan gram önerilir (başarısız baskıda Bambu'nun ilerleme yüzdesine göre); onayladığınızda
makaradan düşülür. Bambu'dan otomatik gelen baskılara aynı renkteki uygun makara kendiliğinden atanır.

**İstatistik** — Ürün bazında satışlar takvim ayına göre (Ekim = 1–31 Ekim) ve ayın haftalarına göre
(Pazartesi başlangıçlı; ör. 1–4, 5–11, 12–18, 19–25, 26–31 Ekim) gösterilir. Önceki aya göre değişim, son 6
ayın eğilimi, Trendyol / elle satış ayrımı, basılan adet ve harcanan filament de bulunur. Renk varyantlarını
tek satırda birleştirebilir, kategoriye göre süzebilirsiniz. Satış = stoktan çıkan Trendyol + Satış ekranı
hareketleri (iadeler düşülür).

**Trendyol ürünleri** — Ürünler → Trendyol düğmesi Trendyol'daki onaylı ürünlerinizi çeker (takip açıkken her 6 saatte bir
kendiliğinden de çekilir). Barkodu eşleşen ürünlerin satış fiyatı ve Trendyol'un o ürün için uyguladığı komisyon
oranı güncellenir; görseli olmayan ürünlere Trendyol'un ilk görseli indirilir. Ürün adlarınıza dokunulmaz.
Ürün düzenlerken Trendyol başlığı, fiyatı, komisyonu ve görselleri görünür; beğenmediğiniz görselin yerine
Trendyol görsellerinden birini seçebilir ya da kendi görselinizi koyabilirsiniz. Sistemde olmayan Trendyol ürünleri
listeden seçilip eklenebilir: Trendyol başlığı, görseli, barkodu ve fiyatıyla gelir, aynı ürünün renkleri tek varyant
grubunda toplanır; gram ve filamenti sonra girersiniz. Komisyon sırası: ürüne elle girilen oran → Trendyol oranı →
kategori oranı → genel oran.

**Kâr** — Trendyol'da bir ürünün ne kadar kazandırdığını hesaplar. Tüm tutarlar KDV dahil girilir.
Komisyon, kargo, hizmet bedeli, filament ve ambalaj faturalı olduğundan KDV'leri mahsup edilir:
kâr = (satış − komisyon − kargo − hizmet bedeli − ambalaj − filament − ek maliyet) ÷ 1,20.
Giderler (genel ve kategoriye göre komisyon, kargo baremleri, hizmet bedeli, ambalaj, fire payı, varsayılan
filament kg fiyatı) Kâr sayfasından değiştirilir. Komisyon sırası: ürüne özel oran → kategorinin oranı → genel oran.
Filament maliyeti ürünün gramı × makaraların alış fiyatından gelir (aynı renk/marka, yoksa aynı renk, yoksa
varsayılan fiyat). SLA ürünlerde yalnızca "Reçine" türündeki makaraların fiyatı kullanılır. Hesaplayıcı hedef
marj için gereken fiyatı da söyler ve fiyat bir kargo sınırının hemen üstündeyse uyarır (ör. 205 ₺ yerine
199,99 ₺ daha kârlı olabilir). Ürün düzenlerken "Fiyat ve kâr" bölümünde de aynı hesap canlı görünür.

**Görünüm** — Ayarlar → Uygulama'dan uygulamanın adını, alt yazısını ve logosunu (PNG/JPG, yapıştırılabilir)
değiştirebilirsiniz.

**Stok 0'ın altına inmez** — Bir ürün sistemde 0 görünürken paketlenir ya da satılırsa (Trendyol, barkod, elle satış)
stok 0'da durur ve eksik adet "sayım farkı" olarak kaydedilir. Pano'nun en üstünde **Kontrol edilecekler** listesinde
görünür; her birinde olası sebep yazar (onaylanmamış baskı, çift düşüm, tamamlanmamış set, yanlış renk eşleşmesi,
girilmemiş baskı). Rafı sayıp adedi girin ya da "Tamam" ile kapatın. Siparişleri buradan Hazırlanıyor'a çekerken
sistemde yetmeyen ürünler varsa önce uyarı çıkar. Satış istatistikleri sayım farkını da satış olarak sayar.

**Ürün sıralama** — Ada göre, son sipariş gelen, son eklenen, çok satan (30 gün), kâr marjı, stok ve son güncellenen.

**Pano · Trendyol** — Tek satırlık özet (yeni sipariş, bugün çıkmalı, gecikmiş, bugün paketlenen) ve altında sadece
Yeni siparişler için rafta yetmeyen ürünlerden oluşan **Basılması gerekenler** listesi (baskıda olanlar düşülür).

**Bambu: tanınmayan baskı** — Yazıcıda Astera'nın tanımadığı bir dosya basılmaya başlayınca sayfanın en üstünde turuncu
bir bant çıkar (yazıcı, dosya, yüzde, kalan süre) ve işlem yapılana ya da "Yoksay" denene kadar her sayfada kalır.
"Ürüne bağla" ile açılan baskı penceresinde ürünler şu sırayla gelir: yazıcıdaki dosya adına benzeyenler, Yeni
siparişlerde eksik olanlar (kaç adet eksik yazar), son 90 günde en çok basılanlar, diğerleri. Seçilen Bambu yazıcı
o an basıyorsa süre sorulmaz; kalan süre yazıcıdan alınır ve baskı boyunca güncellenir. O yazıcıdaki baskı zaten
kayıtlıysa çift kayıt uyarısı çıkar.

**Hazırlık aşaması** — Baskı gönderildikten sonra dosyanın yazıcıya inmesi, ısınma ve kalibrasyon (Bambu'da PREPARE)
baskı sayılmaz: bu sırada ürün sorulmaz, baskı açılmaz, üst barda "hazırlanıyor" yazar. Gerçek baskı başlayınca açılır.
Gönderim iptal olur ya da indirme yarıda kalırsa hiçbir şey kaydedilmez.

**Yazıcı bağlantıları** — Ayarlar → Makineler'de her makineye bağlantı türü seçilir: Bambu Lab (IP, seri no, erişim kodu),
Moonraker / Klipper (Mainsail/Fluidd adresi, ör. 192.168.1.60:7125; API anahtarı varsa) ya da Elegoo SDCP (IP; deneme aşamasında,
"Bağlantıyı test et" sonucu paylaşılırsa yazıcıya göre tamamlanır). Hepsi aynı şekilde çalışır: baskı başlayınca ürün tanınır,
süre ve yüzde yazıcıdan gelir, baskı bitince sonuç sorulur. Otomatik açılan baskının adedi tabladaki nesne sayısından okunur:
Bambu'da yazıcının dosya sunucusundan (FTPS, aynı erişim koduyla) baskı dosyası indirilip o tabladaki nesneler sayılır, Moonraker'da
Klipper'ın nesne listesinden (exclude_object) okunur; okunamazsa aynı ürünün önceki baskısındaki adet kullanılır. Set olarak satılan
üründe nesne sayısı set boyuna bölünür. Yazıcıya bağlı baskılarda "Henüz bitmedi" seçeneği çıkmaz.

**Bildirimler** — Yazıcı (tanınmayan baskı, hata, bağlantı kopması), biten baskılar, Trendyol (yeni, son teslimi yaklaşan ve
geciken sipariş, eşleşmeyen ürün) ve stok (sayım farkı, en az stoğun altı, azalan makara) bildirimleri tek listede toplanır.
Geniş ekranda (1600 px ve üstü) sağda sabit panelde, daha dar ekranlarda üstteki zil simgesinden açılır. Bekleyenler yeşil
parlar; tıklanan ya da kendiliğinden çözülenler soluk olarak 7 gün geçmişte kalır. Liste tüm cihazlarda ortaktır.

**Üst bar: yazıcı durumları** — Her sayfanın üstünde (telefon uygulamasında da) her makine için küçük bir ışık:
hata **kırmızı hızlı yanıp söner**, boşta **yeşil yavaşça yanıp söner**, baskıda **sabit sarı** (yüzde ve kalan süreyle),
duraklatılmış baskı turuncu yanıp söner, bağlantısı kopmuş makine soluk gri. Kırmızı ışığa tıklamak "gördüm" demektir:
yanıp sönme durur, hata sürdükçe kırmızı kalır (bildirim de çözülür). Bağlantısı olmayan makinelerde durum Astera'daki
açık baskıya göre gösterilir. Diğer ışıklara tıklayınca Baskılar sayfası açılır. Tüm yazıcılar sığmazsa bar haber bandı
gibi yavaşça kayar, fareyle üstüne gelince durur; hata veren yazıcı kaymadan solda sabit kalır.

**Basılan ürünü değiştirme** — Devam eden baskıda (Düzenle menüsü ya da "Baskı bitti" penceresindeki "Yanlış ürün mü?")
basılan ürün; başka bir ürün, ortak parça ya da diğer amaçlı kayıtla değiştirilebilir. Stoğa henüz bir şey eklenmediği için
baskı bitince doğru ürüne eklenir. Yazıcı dosyayı yanlış tanıdıysa "Bu dosyayı seçtiğim ürüne bağla" ile bir dahaki sefere
doğru tanınır. Makara önerisi yeni ürünün rengine göre yenilenir.

**Görsel önizleme** — Listelerdeki küçük ürün görsellerinin üzerine fareyle gelince yanında büyük önizleme açılır.

**Buybox** — Sol menüde. Trendyol'daki satıştaki ürünler 15 dakikada bir kontrol edilir; başka satıcının da girdiği ürünler
listelenir: bizim fiyatımız, buybox'taki sıramız, 1., 2. ve 3. sıradaki fiyatlar. Rakip bizden ucuza buybox'ı aldıysa satır
kırmızı olur, bildirim (telefona da) gelir ve "Buybox fiyatına inersen kâr" gösterilir; buybox geri alınınca bildirim
kendiliğinden çözülür. Fiyatımız daha düşük olduğu hâlde buybox rakipteyse (satıcı puanı, teslim süresi vb.) turuncu görünür.
Satıra tıklayınca farklı fiyatlardaki kâr ve son 30 günün değişimleri açılır. Trendyol rakibin mağaza adını vermez. Yanlış
alarm olmasın diye kontrolden önce kendi fiyatlarımız (30 dakikadan eskiyse) Trendyol'dan tazelenir. "Şimdi kontrol et" ile
elle de kontrol edilebilir.

**Diğer amaçlı baskılar** — Dükkan malzemesi, deneme baskısı gibi satılmayan baskılar için. Ürünler → Diğer amaçlı'da
resim, süre, gram, renk ve dosya adıyla kaydedilir; Yeni baskı penceresinde "Diğer amaçlı" sekmesinden seçilir ya da yazılan
adla oradan hemen eklenir. Bitince stoğa bir şey eklenmez, filament makaradan düşer; İstatistik'te satış/üretim sayılarına
karışmadan ayrı bölümde gram ve maliyetiyle görünür. Yazıcının tanımadığı bir baskıda da bu sekme seçilebilir; "Yazıcıdaki dosyayı bu kayda bağla"
açıksa dosya o kayda bağlanır ve sonraki seferde kendiliğinden tanınır, tek seferlik baskılarda bu anahtarı kapatın.

**Özel sipariş gramajı** — Sipariş formunda baskı türü (SLA / FDM) ve "Malzeme (1 adet)" gramı girilir. Altında toplam gram,
malzeme maliyeti (makara / reçine şişesi alış fiyatlarından, fire payı dahil) ve fiyattan kalan tutar görünür; aynı bilgi
sipariş kartında da yazar. Baskı açarken gram kendiliğinden dolar ve orada değiştirilebilir; siparişte gram yoksa baskı
penceresinde girilen gram siparişe de kaydedilir. Reçine maliyeti için Filamentler'e türü "Reçine" olan şişe ekleyip fiyatını girin.

**Makine çizelgesi** — Baskılar sayfasının ve Pano'nun üstünde: her makine bir satır; son birkaç saatte biten baskılar soluk,
devam eden baskı ve bitiş saati, sonrasında makinenin boş kalacağı süre taralı görünür. "Şimdi" çizgisi kırmızıdır. Sonucu
girilmemiş baskılar "sonuç bekliyor" olarak çıkar; çubuğa tıklayınca baskı menüsü ya da sonuç penceresi açılır.

**Ürün sayfası** — Ürün kartında ya da listede ürün adına tıklayınca açılır (görsele tıklamak yine düzenleyiciyi açar):
7/30 günde satılan, stokun kaç gün yeteceği, 90 günde basılan ve fire oranı, adet başı kâr; son 12 haftanın satılan/basılan
grafiği; kâr dökümü, Trendyol fiyatı/komisyonu/buybox durumu, baskı geçmişi ve stok hareketleri. İstatistik ve Buybox
sayfalarından da açılır.

**Görünüm** — Ayarlar → Tema ve görünüm: Yoğunluk (Rahat / Sıkı) ve yazı/arayüz boyutu (Küçük, Normal, Büyük, Çok büyük).
Cihaz başına kaydedilir. Pano'da "Panoyu düzenle" ile bölümler sürüklenip sıralanır, gizlenir ve genişliği Tam / Yarım /
Üçte bir yapılabilir (üçte bir geniş ekranlarda yan yana üç bölüm).

**Üretim planı (Plan)** — Sol menüde. Ne basılmalı, hangi makinede, ne zaman: öncelik sırası Trendyol'da Yeni siparişlerde
eksik olanlar (son teslime göre) → bekleyen özel siparişler (termine göre) → en az stoğun altına düşenler → satış hızına göre
yakında bitecekler. Stok hedefi (7 / 14 / 30 günlük satış) sayfanın üstünden seçilir. Her iş türüne uyan (FDM / reçine)
ve en erken boşalan makineye, ürün daha önce bir makinede çok basıldıysa tercihen ona atanır; tahmini başlangıç/bitiş,
son teslime yetişmeme ve filament yetmeme uyarıları görünür. "Bas" ile baskı penceresi ürün, makine ve adetle hazır açılır.
Altta plandaki işler için filament ihtiyacı (gerekli / elde / eksik, alınması gerekenler) ve 150 g altındaki makaralar.
Pano'da "Plan: sıradaki baskılar" bölümü boştaki makinelere önerileri gösterir.

**Boşa çıkan yazıcı** — Çalışan bir yazıcı boşa çıkınca (baskı bitip sonucu girilince) "Q3 A1 boşta — Öneri: …" bildirimi
gelir (telefona da); tıklayınca baskı penceresi hazır açılır. Yazıcı yeniden çalışınca bildirim kendiliğinden çözülür.

**Stok tahmini** — Son 30 günün satış hızına göre: ürün kartında stok hedefinden az gün kalanlarda "≈5 gün yeter" etiketi,
Ürünler'de "Bitmek üzere" sıralaması, ürün sayfasında "önerilen en az stok" ve tek tıkla "Uygula".

**Hızlı arama ve kısayollar** — `Ctrl+K` (ya da `/` veya üstteki büyüteç): ürün, baskıdaki iş, özel sipariş, makara, ortak parça
/ diğer amaçlı kayıt, sayfa ve işlem tek kutuda aranır. `Enter` açar, `Ctrl+Enter` seçili ürünü hemen basar. Boş aramada son
açılan ürünler ve sık işlemler gelir. Kısayollar (yazı alanında değilken): `N` yeni baskı, `T` toplu sonuç, `Alt+1…9` sayfalar,
`Alt+0` Ayarlar, `?` kısayol listesi. Barkod okuyucunun hızlı tuşlamaları kısayol sayılmaz.

**Toplu sonuç** — Birden çok baskı bitmişse Baskılar sayfasında "Toplu gir" (ya da `T`, ya da "Baskı bitti" penceresindeki
"N baskıyı birlikte gir"): hepsi tek pencerede; hepsi sağlam sayılır, sorunlu olanı işaretleyip ya da adedi düzeltip tek tıkla kaydedilir.
Yazıcının hata bildirdiği baskı baştan "sorunlu" işaretli gelir.

**Aynısını tekrar bas** — Baskılar → Geçmiş'te ve ürün sayfasının baskı geçmişinde "Tekrar bas"; sonucu girilen baskının
bildiriminde de "Tekrar bas" düğmesi çıkar. Aynı ürün/parçalar, adet, makine, son seferki süre ve (hâlâ duruyorsa) aynı makaralarla
baskı penceresi hazır açılır.

**3MF sürükle-bırak** — Ürünler sayfasında bir ürün kartının üzerine dilimlenmiş 3MF bırakılırsa o ürün dosyadan güncellenir,
boş alana bırakılırsa yeni ürün açılır (ürün düzenleyicisindeki görsel alanına bırakmak da olur). Tabladaki nesne sayısına
bölünerek 1 adet (set ürünlerde 1 set) için süre, gram ve renk gramları doldurulur; ürünün görseli yoksa tabla görseli alınır.
Dosyada birden çok tabla varsa hangisi olduğu sorulur.

**Toplu işlemler** — Ürünler → "Seç": kartlara dokunarak seçin (ya da "Görünenlerin tümü"); alttaki çubuktan kategori,
en az stok, satış hızına göre önerilen en az stok, arşivle ve "Sırayla bas" (seçilen ürünler için baskı pencereleri art arda açılır).

**Görünüm ve düzen (gelişmiş)** — Ayarlar'ın en altında açılır-kapanır bölüm; bu cihaza kaydedilir:
- Sol menü: sürükleyerek ya da oklarla sıralama, sayfa gizleme (gizlenen sayfa Ctrl+K aramasından ve adresinden yine açılır;
  Alt+1…9 menüdeki sıraya göre çalışır), sayı rozetleri, telefonda alt çubuktaki 4 sayfa.
- Üst çubuk: yazıcı barı aç/kapa, barda hangi yazıcılar, durum yazıları, sığmazsa kayma ya da alt satıra geçme, Ara ve Yeni baskı düğmeleri.
- Bildirimler: geniş ekranda sağ panel sabit mi / zilden mi açılsın, hangi türler görünsün, uyarı sesleri.
- Pano bölümleri, Baskılar / Plan / Ürün sayfası bölümleri, ürün kartındaki ayrıntılar, liste sütunları,
  Trendyol sipariş satırındaki sütunlar, Yeni baskı penceresindeki sekmeler.
- "Dışa aktar" ile bu düzeni (tema ve pano düzeni dahil) dosyaya kaydedip başka bilgisayarda "İçe aktar" ile yükleyebilirsiniz;
  "Varsayılana dön" her şeyi sıfırlar.

**Moonraker baskı bitişi** — Baskı tahmini süreden önce bitse de algılanır: iş, Moonraker'ın iş geçmişindeki numarasıyla
takip edilir; yazıcı baskı biter bitmez "standby"a dönse bile (END_PRINT içinde SDCARD_RESET_FILE vb.) geçmişteki sonuç
okunur: tamamlandıysa "bitti", iptal / hata ise "durdu" olarak sonucu sorulur. Geçmiş kapalıysa baskı %98'i geçmişken
boşa dönmesi bitti sayılır.

**Baskı onayı** — Yazıcı tanıdığı bir dosyayı basmaya başlayınca baskı kendiliğinden açılmaz: "Q1 P1S: Sakura ayraç ×4 mi?"
bildirimi gelir (telefona da). Tıklayınca baskı penceresi tahmin edilen ürün, adet ve makineyle açılır; "Onayla" ile kaydedilir,
yanlışsa listeden doğru ürünü seçin (dosya o ürüne öğretilir). Onaylanmadan biten baskının uyarısı 24 saat kalır; onaylayınca
sonucu hemen sorulur. Yazıcı hâlâ basıyor dediği sürece (hız artırılmış, son katmanlar) süre dolsa da "baskı bitti" denmez;
bitiş yazıcı bitirdiğinde kesinleşir. Telefona yalnızca yeni bildirim gider, aynı bildirim tekrar çalmaz.

**Renk gramları** — Ürün düzenleyicide her rengin yanına 1 adette kaç gram harcandığı yazılır; toplamı altında görünür,
ürün gramı boşsa toplam oraya yazılır. Maliyet her rengin kendi makara fiyatıyla hesaplanır.

**Minimum sipariş adedi** — Kâr → Giderler'de Trendyol baremleri (varsayılan: 25 ₺ altı en az 6, 35 ₺ altı 4, 50 ₺ altı 3,
75 ₺ altı 2). Bu fiyatların altındaki ürünlerde kâr müşterinin almak zorunda olduğu adetlik siparişe göre hesaplanır:
kargo sepet tutarının baremiyle, hizmet bedeli ve ambalaj bir kez; hem sipariş kârı hem adet başı kâr gösterilir.
Hedef marj fiyatları, kargo baremi ipuçları ve Buybox'taki kâr da buna göre hesaplanır.

**Siparişlerde sıralama** — Trendyol: tarih, son teslim, tutar, kalem/adet, kâr, müşteri, şehir. Özel siparişler: termin,
geliş tarihi, fiyat, adet, kalan ödeme, müşteri. Seçim cihazda hatırlanır.

**Hazırla satırları** — Soldaki renk şeridi durumu gösterir: yeşil rafta var, sarı eksik baskıda karşılanıyor, kırmızı
eksik, turuncu eşleşmedi. Sağda üç sayı yan yana: sipariş, rafta, eksik. Çubuk sipariş adedini raftan / baskıda /
eksik diye böler. Satırdan açmadan: "N adet bas", stok −/+ (sayım düzeltmesi) ve ürün sayfası.

**Baskı geçmişi** — Baskılar → Geçmiş'te 10 / 20 / 50 / 100 gösterme ve sayfalar. Kutucuklarla seçip "Seçilenleri sil":
baskı tamamen silinir ve istatistikten düşer; stok ve makara kalanları değişmez, sürmekte olan baskılar silinmez.
Her satırda baskı tarihi, süre ve gram var. Gram önceliği: makaralardan düşülen → baskı dosyasından okunan (gri) →
ürün gramı × adet (≈, tahmini). Bambu'da tabla gramı yazıcıdan indirilen 3MF'ten (nesne sayısıyla birlikte),
Moonraker'da dosya bilgisinden okunur. Ürünün (ya da ortak parçanın) gramı boşsa bu baskıdan doldurulur
(dosya gramı ÷ adet).

**Baskı başarısı** — İstatistik'in altında son 90 gün: makine başına baskı, sorunlu baskı (başarısız / kısmen) ve fire
(bozulan adet ÷ basılan adet). "Sık bozulanlar": bir ürünün bir makinedeki en az 3 baskısından en az 2'si sorunluysa ve fire
%25 ve üstüyse listelenir; Yeni baskı penceresinde o ürün ve makine seçilince kırmızı uyarı çıkar.

**Ölü stok** — İstatistik'in altında: rafta olup seçilen süredir (30 / 60 / 90 / 180 gün, cihazda hatırlanır) hiç
satılmayan ürünler, adetleri, yaklaşık malzeme maliyeti ve satış değeri. Bu süreden yeni eklenen ürünler sayılmaz.

**Parça gramları** — Parçalı ürünlerde her parçanın yanında "Gram (1 adet)" alanı var. Altında bir setin toplam gramı
(parça gramı × bir üründeki adet) görünür; ürün gramından farklıysa "toplamı ürün gramına yaz" ile aktarılır. Parçalar
farklı renkteyse malzeme maliyeti renklere parça gramı oranında bölünür. Ortak parçada gram boşsa ortak parçanın gramı
kullanılır.

**Elde (toplam)** — Ürün düzenlerken parçaların "Elde" sütunu elinizdeki toplam parça sayısıdır; sete dönüşmüş olanlar da dahildir. Sayım yaparken saydığınızı yazın: kaydedince kaç tam set çıktığı hesaplanır, ürün stoğu o olur, artanlar elde kalır (ortak parçalarda havuz da buna göre düzeltilir). Sayılara dokunmazsanız ürün stoğunu elle değiştirebilirsiniz; parçalar etkilenmez.

**Baskıyı yok say** — "Baskı bitti" bildiriminde (panelde ve telefonda) ve sonuç penceresinin altında **Yoksay** var:
baskı kaydı hiç açılmamış gibi silinir; stoğa eklenmez, başarısız sayılmaz, makaradan düşülmez, istatistiğe girmez.
Yazıcıdan otomatik açılmış bir baskıysa aynı yazıcı görevi bir daha sorulmaz.

**Kargo etiketi (Trendyol Express ve Aras)** — Trendyol "ortak etiket"i yalnızca bu iki firma (Trendyol öder) için ve
yalnızca ZPL (termal etiket yazıcısı dili) olarak verir. Ayarlar → Kargo etiketi yazıcısı:
- **Paylaşılan yazıcı (USB):** Yazıcının takılı olduğu bilgisayarda yazıcıyı paylaşıma açın (Ayarlar → Bluetooth ve
  cihazlar → Yazıcılar → yazıcı → Yazıcı özellikleri → Paylaşım → "Bu yazıcıyı paylaş", kısa ad ör. `ZEBRA`) ve aynı adı
  yazın. Yazıcı Astera'nın çalıştığı bilgisayardaysa "Bilgisayar" boş kalır; başka bir bilgisayardaysa o bilgisayarın adı
  ya da IP'si yazılır (ör. `192.168.1.20` → `\\192.168.1.20\ZEBRA`). O bilgisayar açık olmalı; şifre isterse Astera'nın
  bilgisayarında Kimlik Bilgileri Yöneticisi → Windows kimlik bilgileri'ne o bilgisayarın adı / IP'si, kullanıcı adı ve
  şifresi eklenir. Windows 11 24H2 şifresiz (misafir) erişimi engeller; şifreli bir kullanıcı hesabı kullanın.
- **Ağ (IP):** yazıcının IP adresi, port genelde 9100.
- "Deneme etiketi bas" ile bağlantıyı deneyin. Sürücüde etiket boyutu 100×100 mm olmalı.
Siparişler → Yeni'den paketi **Hazırlanıyor'a çekince** etiket kendiliğinden basılır (Ayarlar'dan kapatılabilir).
Hazırlanıyor sekmesinde her siparişte **Barkod** düğmesi (basıldıysa ✓, tekrar basar) ve "Basılmamış N barkodu bas" var.
Sipariş açılınca kargo firması, takip numarası ve "Takip et" bağlantısı görünür. Etiketler `data/etiket` klasöründe
saklanır; tekrar basarken Trendyol'a yeniden sorulmaz. Yurtiçi, Sürat, PTT gibi firmalar için Trendyol etiket vermez.
Trendyol panelinden Hazırlanıyor'a çekilen siparişlerde etiket kendiliğinden basılmaz; Barkod düğmesini kullanın.

**Finans** — Soldaki Finans sayfası Trendyol cari hesap ekstresinden gelir (ilk açılışta son 3 ay, 14'er günlük
parçalarla; sonra 6 saatte bir son 30 gün yenilenir, "Yenile" ile hemen):
- **Ödemeler:** Trendyol panelindeki "Ödeme Özeti" gibi: yalnızca **teslim edilmiş** siparişlerin hakedişi, her kayıt
  vadesinden sonraki ilk ödeme gününe yazılır (ödeme günleri geçmiş ödemelerden öğrenilir, bilinmiyorsa Pazartesi ve
  Perşembe); ödenmemiş Trendyol faturaları sıradaki ödemeden düşülür. Üstte toplam satış, tahmini kesintiler ve gelecek
  ödemelerin toplamı; yanda teslim edilmemiş (kargolanan) siparişlerin tutarı ayrı durur, teslim edilince ödemeye girer.
  Yapılan her ödemenin kayıtları ödeme numarasıyla ayrıca çekilir, böylece ödenenler "gelecek"te kalmaz.
- **Faturalar:** Trendyol'un kestiği faturalar (kargo, platform hizmet bedeli vb.) ve komisyon faturaları (satış
  kayıtlarındaki komisyon fatura numarasına göre toplanır). Fatura PDF'leri API'de yok; PDF için satıcı paneli.
- **Hareketler:** tüm satış, iade, indirim, komisyon ve ödeme kayıtları; sipariş no / barkod ile arama, türe göre süzme.
- **Kargo:** kargo faturalarındaki sipariş başına gerçek kargo ücreti ve desi. Bu ücret bilinen siparişlerde
  Siparişler'deki ve haftalık özetteki kâr, tahmini kargo baremi yerine gerçek ücretle hesaplanır.
Kayıtlar sipariş teslim edildikten sonra oluşur; yeni siparişler ekstrede hemen görünmez.

**Haftalık özet** — Her Pazartesi 09:00'da önceki haftanın özeti bildirim olarak gelir (panel ve telefon): satış, Trendyol
sipariş / ciro / yaklaşık kâr, basılan sağlam adet ve fire, harcanan filament, buybox'ta geride olunan ürün ve ölü stok.
Bilgisayar o saatte kapalıysa açılınca gönderilir. Gün, saat ya da kapatma: Ayarlar → Haftalık özet (son haftanın metni
orada önizlenir). Kâr, Kâr sayfasındaki hesabın sadeleştirilmiş hâlidir; kuruşu kuruşuna aynı olmayabilir.

**Ürünler üst barı** — Tek satır: sekmeler, arama, Filtre (Durum / Tür / Kategori), sıralama, görünüm, Seç, Trendyol,
Ekle. Seçili filtreler altta etiket olarak durur; × ile tek tek ya da "Temizle" ile hepsi kaldırılır.

**Tema** — Ayarlar → Tema: mod (sistem / açık / koyu), koyu tema tonu (soğuk, nötr, sıcak antrasit, lacivert gri) ve vurgu
rengi (bakır, yeşil, mavi, mor, kırmızı). Seçim cihaz başına kaydedilir.

## Telefon uygulaması (Android)

Telefonda Chrome ile `http://BILGISAYAR-IP:8080/m` adresini açın: Baskılar, Stok ve Filament'ten oluşan sade mobil
sürüm (fiyat ve kâr bilgisi yok). Ev ağında böyle de çalışır ama **kurulabilir uygulama, uygulama kapalıyken bildirim ve
evden uzakta kullanım için https gerekir**. Bunun en kolay ve ücretsiz yolu Tailscale:

1. Bilgisayara Tailscale kurun (tailscale.com/download) ve bir hesapla (ör. Google) giriş yapın.
2. Telefona Play Store'dan **Tailscale** kurun, aynı hesapla giriş yapın ve bağlantıyı açık tutun.
3. Tailscale yönetim panelinde (login.tailscale.com) **DNS** sayfasında **HTTPS Certificates** ayarını açın.
4. Bilgisayarda komut istemini açıp şunu yazın: `tailscale serve --bg 8080`
   (eski sürümlerde "unknown flag" derse: `tailscale serve https / http://localhost:8080`).
   Komut size `https://bilgisayar-adi.xxxx.ts.net` biçiminde bir adres verir. `tailscale serve status` ile görebilirsiniz.
5. Telefonda Chrome ile `https://bilgisayar-adi.xxxx.ts.net/m/` adresini açın → sağ üst menü → **Uygulamayı yükle**.
6. Uygulamada **Bildirimler** sekmesi → **Bildirimleri aç** → izin verin → **Deneme gönder** ile kontrol edin.

**Tailscale olmadan, sadece ev ağında:** Chrome'a Astera adresini güvenli saymasını söylemek yeterli.
1. Telefonda Chrome adres çubuğuna `chrome://flags` yazın, aramaya **Insecure origins treated as secure** yazın.
2. Ayarı **Enabled** yapın ve kutuya bilgisayarın adresini yazın, ör. `http://192.168.1.25:8080`
   (siyah pencerede "Telefondan / ağdan" satırında yazan adres; Ayarlar → Telefon uygulaması'nda da görünür).
3. Alttaki **Relaunch** ile Chrome'u yeniden başlatın.
4. `http://192.168.1.25:8080/m/` adresini açın → menü → **Uygulamayı yükle** (yoksa **Ana ekrana ekle**).
5. Uygulamada Bildirimler → **Bildirimleri aç** → **Deneme gönder**.
Bilgisayarın IP'si değişirse ayarı güncellemek gerekir; modemden bilgisayara sabit IP verin. Bu bir geliştirici ayarı
olduğundan Chrome güncellemesinden sonra sıfırlanırsa aynı adımları tekrarlayın. Bildirimler Google üzerinden geldiği için
bilgisayarda ve telefonda internet olmalı.

Baskı bitince, yazıcı tanımadığı bir baskıya başlayınca, son teslimi geçen sipariş ve yeni Trendyol siparişi gelince
telefona bildirim düşer (bilgisayar ve Astera açık olmalı). Bildirimler gecikirse telefonda Ayarlar → Uygulamalar →
Chrome → Pil → **Kısıtlanmamış** yapın. Barkod okutma kamerayla çalışır (yine https gerekir).

### Bildirim sesi ve titreşim (Android)
Sesi ve titreşimi Android'in bildirim ayarı belirler (web uygulaması kendi sesini seçemez):
Ayarlar → Uygulamalar → Astera → Bildirimler (listede yoksa Chrome → Bildirimler → Siteler → bu adres) → kategoriyi
**Uyarı ver / Sesli** yapın, Ses ve Titreşim'i açın. Pil tasarrufunda Chrome/Astera'yı "Kısıtlanmamış" yapın ki gecikmesin.
Uygulama açıkken gelen yeni bildirimlerde ayrıca kısa bir ses ve titreşim olur. Aynı adımlar uygulamada Bildirimler
sekmesinde "Ses ve titreşim gelmiyor mu?" altında da yazıyor.

## Veriler ve yedek

Tüm veri `data` klasöründedir (`atolye.db` + `uploads` içindeki görseller). Bu klasörü kopyalamak tam yedektir.
Ayarlar sayfasından veritabanı yedeğini tek tıkla indirebilirsiniz. Başka bir bilgisayara taşımak için
klasörün tamamını taşımanız yeterli.

**Otomatik yedek** — Astera açıkken her gün bir kez `data/yedek` klasörüne veritabanı yedeği alınır; son 14 otomatik
yedek saklanır. Ayarlar → Yedekleme'de "Şimdi yedek al" ile elle de alınır. **Ek yedek klasörü**ne OneDrive ya da
Google Drive klasörünün tam yolunu yazarsanız (ör. `C:\Users\Ad\OneDrive\Astera yedek`, klasör önceden var olmalı)
yedek oraya da kopyalanır ve görseller `uploads` alt klasörüne aktarılır; böylece bilgisayar bozulsa da veriler kalır.
"Yedekler" listesinden bir yedeğe **Geri yükle** denebilir: o anki veriler önce "Geri yükleme öncesi" adıyla ayrıca
yedeklenir, sonra seçilen yedek yüklenir ve sayfa yenilenir. Başka yerdeki bir yedeği yüklemek için dosyayı
`data/yedek` içine kopyalayın (adı `atolye-elle-YYYYAAGG-SSDDss.db` biçiminde olmalı).

Port değiştirmek için: `python server.py --port 9000` (ve .bat/.vbs dosyalarındaki 8080'i değiştirin).

## Güncelleme

Yeni sürümde `data` klasörü **hariç** tüm dosyaları eskilerinin üzerine kopyalayın ve Astera'yı yeniden
başlatın (klasörün adını istediğiniz gibi değiştirebilirsiniz). Veritabanı ilk açılışta kendiliğinden güncellenir; ürünler, stok ve siparişler korunur.

## Güvenlik notu

Sistemde şifre yok; ev/atölye ağınızdaki herkes erişebilir. Modeminizden 8080 portunu internete açmayın.
Dışarıdan erişim isterseniz Tailscale gibi bir VPN en güvenli yoldur.

**Büyük resim** — Ürün kartındaki resme, listelerdeki küçük resimlere (siparişler, Hazırla, istatistikler) tıklayınca resim tam ekran açılır. Esc ya da boşluğa tıklama kapatır; birden çok resimde ok tuşları/kaydırma ile gezilir. Ürün kartında düzenlemek için resmin köşesindeki kalem simgesini kullanın (ya da büyük resimdeki "Düzenle"). Ürün düzenleme ekranında ana resmin köşesindeki büyüteç, Trendyol görsellerinin üzerindeki büyüteç de aynı işi yapar; büyük resimden "Bu görseli kullan" denebilir.

**Makara şekilleri** — Filamentler → Makara şekilleri. Makaranın silüetini SVG olarak yükleyin, sonra "Markalar" ile o makarayı kullanan marka/modelleri işaretleyin (aynı makarayı kullanan markalar tek şekli paylaşır). "Filamix PLA+" seçmek "Filamix PLA+ Black" gibi tüm renkleri kapsar. Şekil filamentin rengiyle boyanarak ürün düzenleme ekranındaki filament satırlarında ve makara kartlarında görünür. Yüklenen SVG'lerden betik, dış bağlantı ve gömülü içerik temizlenir.

**Parça renkleri ve animasyonlar** — Parçalı ürünlerde (parçalar farklı renkteyse) her satırın solunda parçanın renginde ince bir çizgi ve atanmış makara silüeti var; renk adına ya da silüete tıklayınca renk seçilir, altındaki marka yazısı doğrudan düzenlenir. Açılır-kapanır bölümler, menüler, bildirim paneli ve yeni eklenen satırlar kısa animasyonlarla açılır (sistemde "hareketi azalt" açıksa animasyon yapılmaz).

**Kargo etiketi (Astera etiketi)** — Trendyol hazır etiket servisini (ortak etiket) her hesaba açmıyor. Bu yüzden etiket Astera'da hazırlanır: üstte takip barkodu, alıcı adı ve adres (uzun adreslerde yazı kendiliğinden küçülür), logo, altta ilçe/il, sipariş numarası ve sağ altta takip barkodunun yedeği. Ayarlar → Kargo etiketi yazıcısı → "Bu bilgisayardan (yazdır penceresi)" seçiliyken Siparişler'deki "Barkod" düğmesi bilgisayarın yazdırma penceresini açar (100×80 mm). Etiket yazıcısını bir kez seçin; sürücüde kâğıt 100×80 mm, kenar boşluğu "Yok" olmalı. Adres bilgisi saklanmaz, her basımda Trendyol'dan taze okunur. "Siparişi Hazırlanıyor'a çekince bas" açıksa, çekme işleminden sonra yazdırma penceresi kendiliğinden açılır.

**İadeler ve müşteri soruları** — Soldaki İadeler ve Sorular sayfaları Trendyol'dan 5 dakikada bir tazelenir (Yenile ile hemen). İadeler: "İşlem bekleyen" (paket size ulaştı) sekmesinde ürünleri işaretleyip onaylayın ya da gerekçe seçip (çoğu gerekçede fotoğraf/belge zorunlu) reddedin; istenirse onaylananlar stoğa geri eklenir. Sorular: cevabı yazıp gönderin (10–2000 karakter); Trendyol onayından sonra yayınlanır. Bildirimler: iade için iki kez çalan uyarı sesi ve telefonda uzun titreşim, soru için yumuşak "ding" ve kısa titreşim (bilgisayarda ses için panel açık olmalı; Ayarlar → Görünüm → bildirim sesi açık olmalı).

**Trendyol Express dışı kargo uyarısı** — Etiket basarken siparişin kargosu Trendyol Express değilse kırmızı bir uyarı penceresi çıkar ve onay ister; etikette de kargo adı siyah kutu içinde yazar.

**Sipariş kartı** — Siparişler'de bir siparişi açınca ürünler büyük görsel, ad ve kocaman adetle listelenir (2 ve üstü adet koyu kutuda); rafta olmayan ürün kırmızı şeritle ve "Rafta yok" etiketiyle işaretlenir (kapalı satırdaki küçük görselde de kırmızı çerçeve). Sağda kargo bilgisi (Trendyol Express dışıysa kırmızı çerçeveli) ve büyük "Hazırlanıyor'a çek" / "Barkodu bas" düğmeleri durur. Kâr ayrıntısı alttaki yeşil kâr hapından açılıp kapanır; son tercih hatırlanır.

**Eksik ürün vurgusu** — Siparişte bir üründen rafta olandan fazlası lazımsa (ör. 3 lazım, rafta 1) ürün satırında "Rafta 1 / 3 lazım · 2 eksik" yazar (sarı); hiç yoksa "Rafta yok" (kırmızı). Çok parçalı üründe eksik parça sayısı da görünür ("2/6 parça eksik"). Kapalı listede: bazı kalemleri eksik sipariş yavaşça sarı, tüm kalemleri eksik sipariş daha hızlı kırmızı yanıp söner; solda akan renkli şerit olur.

**Bugün teslim** — Kapalı listede son teslim süresi hep görünür. Saat 09:00'dan sonra son teslime 24 saatten az kalan siparişlerde "BUGÜN" etiketi çıkar ve sipariş numarası turuncu olur.

**Baskı çizelgesi** — Yazıcının tanıyamadığı bir baskıyı geç onaylasanız da çizelgede baskı, bildirimin geldiği andan başlar.

**Sıralama tercihleri** — Ürünler, Filamentler, Hazırla ve Siparişler'de seçilen sıralama bu bilgisayarda hatırlanır. Bildirim panelinde yazıcı bildirimleri hafifçe yanıp söner.

**Trendyol'a değişiklik gönderme (fiyat, kargo firması)** — Satış → Trendyol ayarları'ndaki "Trendyol'a değişiklik gönder" anahtarı varsayılan olarak kapalıdır; kapalıyken Astera Trendyol'a hiçbir değişiklik göndermez. Ürün düzenleme ekranı yalnızca Astera'yı değiştirir. Açıkken:
- Ürün sayfasındaki Trendyol kutusundan ya da Buybox ayrıntısından "Trendyol fiyatını değiştir": yeni fiyat yazılır (o fiyattaki kâr anında görünür; buybox fiyatı / buybox − 1 ₺ kısayolları), göndermeden önce turuncu "eski → yeni" onay penceresi çıkar. Yalnızca fiyat gönderilir, stok gönderilmez.
- Sipariş kartında "Kargo firmasını değiştir" (Yeni / Hazırlanıyor siparişlerde): firma seçilir, yine "eski → yeni" onayı istenir. Trendyol bir paketi 5 dakikada bir kez değiştirmeye izin verir; değişince etiketi yeniden basın.

**Trendyol'da düzenle** — Ürün sayfasındaki Trendyol kutusundan ya da Buybox ayrıntısından açılır (turuncu çerçeveli ayrı pencere; Astera'daki ürüne dokunmaz). Bilgiler Trendyol'dan canlı okunur. Sekmeler: Başlık ve açıklama, Görseller (sırala, kaldır, bağlantı yapıştır ya da kendi Trendyol ürünlerimizin görsellerinden seç; en fazla 8), Özellikler (kategorinin özellikleri; varyant özellikleri kilitli; kategori ve marka Trendyol'da değiştirilemez), Varyant bilgileri (stok kodu, kargoya veriliş süresi). Değişen alan turuncu olur, altında Trendyol'daki eski hali üstü çizili görünür; değişen sekmede turuncu nokta. Gönderilmeden önce "eski → yeni" özeti ve onay istenir. "Trendyol'a değişiklik gönder" anahtarı kapalıyken gönderilemez. Bir ürünün tüm varyantları başlık, açıklama, görsel ve özellikleri paylaşır.

**Sıraya göre stok** — Yeni siparişlerde raf stoğu en eski siparişten başlayarak sırayla dağıtılır (paketleme sırası). Örneğin 10 siparişte birer adet aynı ürün varsa ve rafta 8 tane duruyorsa ilk 8 sipariş normal görünür, son 2 tanesi "Sıra gelince yetmiyor" uyarısı verir ve listede kırmızı yanıp söner; ürün satırında "rafta 8 · önceki siparişler 8 adet alıyor" yazar.
