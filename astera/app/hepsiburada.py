"""Hepsiburada entegrasyonu: siparişler Trendyol'la aynı sistemde (ty_lines, channel='hb').

Ne yapar:
  - Ödemesi tamamlanmış açık siparişleri ve paketlenmiş (kargoya hazır) paketleri okur,
  - daha önce görülmüş ama artık açık listelerde olmayan siparişlerin son durumunu sipariş ayrıntısından okur
    (kargoda, teslim edildi, iptal),
  - satırları Trendyol'un satır işleyicisinden geçirir: ürün eşleme (barkod / satıcı stok kodu / HB SKU), stok düşümü,
    iptalde stoğa geri ekleme, müşteri, şehir, son teslim aynen Trendyol'daki gibi çalışır.
  - "Paketlemeyi Hepsiburada'ya gönder" açıksa siparişi uygulamadan paketler (paket bozma da), kargo etiketini (ZPL ya da
    görüntü) Hepsiburada'dan alır. Stok ve fiyat hiçbir zaman gönderilmez; satır iptali yok (Hepsiburada her iptale ceza keser).

Kimlik: Mağaza ID (Merchant ID, GUID) + servis anahtarı (Basic auth) ve Hepsiburada'nın verdiği entegratör kullanıcı adı
(User-Agent başlığı). Anahtar tarayıcıya hiç gönderilmez.

Hepsiburada alan adları sürümden sürüme değişebildiği için okuma esnek yazıldı; son görülen alan adları "Bağlantıyı dene"
raporunda listelenir (değerler değil).
"""
import base64
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import trendyol

_db = _lock = _get = _set = None
_sync_lock = threading.Lock()
TR = timezone(timedelta(hours=3))
HOSTS = {"prod": "https://oms-external.hepsiburada.com", "sit": "https://oms-external-sit.hepsiburada.com"}
SHAPE = {}


class HBError(Exception):
    pass


def init(db, lock, get_setting, set_setting):
    global _db, _lock, _get, _set
    _db, _lock, _get, _set = db, lock, get_setting, set_setting


def migrate(c):
    cols = {r[1] for r in c.execute("PRAGMA table_info(ty_lines)")}
    if "channel" not in cols:   # ty = Trendyol (eski kayıtlar), hb = Hepsiburada
        c.execute("ALTER TABLE ty_lines ADD COLUMN channel TEXT DEFAULT 'ty'")
    if "hb_pkg" not in cols:   # Hepsiburada paket numarası (etiket ve paket bozma için)
        c.execute("ALTER TABLE ty_lines ADD COLUMN hb_pkg TEXT")
    c.execute("CREATE INDEX IF NOT EXISTS idx_tyl_channel ON ty_lines(channel)")


def _now():
    return int(time.time())


# ---------------------------------------------------------------- ayarlar

def public():
    with _lock:
        g = lambda k, d="": _get(k, d) or d
        last = g("hb_last_result", "")
        try:
            last = json.loads(last) if last else None
        except ValueError:
            last = None
        return {"merchant_id": g("hb_merchant_id"), "user": g("hb_user"), "key_set": bool(g("hb_key")),
                "stage": g("hb_stage", "0") == "1", "enabled": g("hb_enabled", "0") == "1",
                "interval_min": int(g("hb_interval_min", "5") or 5), "commission_pct": float(g("hb_commission", "0") or 0) or None,
                "last_sync": int(g("hb_last_sync", "0") or 0), "last_error": g("hb_last_error"), "last_result": last,
                "since": int(g("hb_since", "0") or 0), "write": g("hb_write", "0") == "1",
                "deci": float(g("hb_deci", "1") or 1)}


def save(b):
    with _lock:
        if "merchant_id" in b:
            v = str(b.get("merchant_id") or "").strip()
            if v and not re.fullmatch(r"[0-9a-fA-F-]{8,64}", v):
                raise HBError("Mağaza ID (Merchant ID) GUID biçiminde olmalı (ör. 6fc6d90d-ee1d-…)")
            _set("hb_merchant_id", v)
        if "user" in b:
            _set("hb_user", str(b.get("user") or "").strip()[:80])
        if b.get("key"):
            _set("hb_key", str(b["key"]).strip()[:300])
        if b.get("clear_key"):
            _set("hb_key", "")
        if "stage" in b:
            _set("hb_stage", "1" if b.get("stage") else "0")
        if "write" in b:
            _set("hb_write", "1" if b.get("write") else "0")
        if "deci" in b:
            try:
                v = float(str(b.get("deci") or 1).replace(",", "."))
            except ValueError:
                raise HBError("Desi bir sayı olmalı")
            _set("hb_deci", max(0.1, min(500.0, v)))
        if "interval_min" in b:
            _set("hb_interval_min", max(2, min(60, int(b.get("interval_min") or 5))))
        if "commission_pct" in b:
            try:
                v = float(str(b.get("commission_pct") or 0).replace(",", "."))
            except ValueError:
                raise HBError("Komisyon bir sayı olmalı")
            _set("hb_commission", max(0.0, min(60.0, v)))
        if "enabled" in b:
            on = bool(b.get("enabled"))
            _set("hb_enabled", "1" if on else "0")
            if on and not int(_get("hb_since", "0") or 0):
                _set("hb_since", int(time.time() * 1000))   # takip başlangıcı: öncesinde paketlenenler stoktan düşmez
        _db().commit()
    return public()


def _creds():
    mid = (_get("hb_merchant_id") or "").strip()
    key = (_get("hb_key") or "").strip()
    user = (_get("hb_user") or "").strip()
    if not (mid and key):
        raise HBError("Mağaza ID ve servis anahtarı girilmeli")
    base = os.environ.get("ATOLYE_HB_BASE") or HOSTS["sit" if _get("hb_stage", "0") == "1" else "prod"]
    return mid, key, user or f"{mid} - SelfIntegration", base


# ---------------------------------------------------------------- HTTP

def _request(path, params=None, method="GET", body=None, raw=False):
    with _lock:
        mid, key, ua, base = _creds()
    url = base + path.format(mid=urllib.parse.quote(mid)) + (("?" + urllib.parse.urlencode(params)) if params else "")
    tok = base64.b64encode(f"{mid}:{key}".encode()).decode()
    hdr = {"Authorization": f"Basic {tok}", "User-Agent": ua, "Accept": "*/*" if raw else "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        hdr["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=hdr)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            blob = r.read()
            ctype = r.headers.get("Content-Type") or ""
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:400]
        if e.code == 401:
            raise HBError("Hepsiburada yetkilendirmeyi reddetti (401): Mağaza ID ya da servis anahtarı yanlış.")
        if e.code == 403:
            raise HBError("Hepsiburada erişime izin vermedi (403): entegratör kullanıcı adı yanlış ya da mağaza bu kullanıcıya yetki vermemiş.")
        if e.code == 429:
            raise HBError("Hepsiburada istek sınırına takıldı, birkaç dakika sonra tekrar denenecek.")
        try:
            j = json.loads(detail)
            if isinstance(j, dict):
                errs = j.get("errors")
                if isinstance(errs, list) and errs:
                    errs = "; ".join(str(x.get("message") or x.get("description") or x) if isinstance(x, dict) else str(x) for x in errs[:3])
                detail = j.get("message") or j.get("title") or j.get("error") or j.get("description") or errs or detail
        except (ValueError, AttributeError):
            pass
        raise HBError(f"Hepsiburada hata döndürdü ({e.code}): {detail}")
    except (urllib.error.URLError, OSError) as e:
        raise HBError(f"Hepsiburada'ya bağlanılamadı: {getattr(e, 'reason', e)}")
    if raw:
        return blob, ctype
    txt = blob.decode("utf-8", "ignore")
    try:
        return json.loads(txt) if txt.strip() else {}
    except ValueError:
        raise HBError("Hepsiburada'nın yanıtı okunamadı")


def _items(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("items", "data", "content", "orders", "packages", "lineItems", "results"):
            v = data.get(k)
            if isinstance(v, list):
                return v
            if isinstance(v, dict):
                inner = _items(v)
                if inner:
                    return inner
    return []


def _shape(tag, d):
    if isinstance(d, dict):
        SHAPE[tag] = sorted(d.keys())[:60]


# ---------------------------------------------------------------- alan okuma

def _g(d, *names):
    for n in names:
        cur = d
        for part in n.split("."):
            cur = cur.get(part) if isinstance(cur, dict) else None
        if cur not in (None, ""):
            return cur
    return None


def _money(v):
    if isinstance(v, dict):
        v = v.get("amount", v.get("value"))
    try:
        return round(float(v), 2) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _ms(v):
    """Hepsiburada tarihleri: ISO (saat dilimi yoksa Türkiye saati), /Date(ms)/ ya da ms."""
    if v in (None, ""):
        return None
    if isinstance(v, (int, float)):
        return int(v if v > 1e11 else v * 1000)
    s = str(v).strip()
    m = re.search(r"/Date\((\d+)", s)
    if m:
        return int(m.group(1))
    if s.isdigit():
        return _ms(int(s))
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%Y-%m-%d %H:%M", "%d.%m.%Y"):
            try:
                d = datetime.strptime(s, fmt)
                break
            except ValueError:
                d = None
        if d is None:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=TR)
    return int(d.timestamp() * 1000)


CANCEL = re.compile(r"cancel", re.I)


def map_status(s, default="Created"):
    """Hepsiburada durumu → uygulamanın (Trendyol) durum adı."""
    s = str(s or "")
    low = s.lower()
    if not s:
        return default
    if CANCEL.search(s):
        return "Cancelled"
    if low in ("open", "unpacked", "paymentcompleted", "approved", "new", "created", "awaitingpackaging"):
        return "Created"
    if low in ("packaged", "packed", "readytoship", "awaitingshipment", "picking"):
        return "Picking"
    if low in ("intransit", "shipped", "atcargo", "incargo"):
        return "Shipped"
    if low in ("delivered", "claimcreated", "completed"):
        return "Delivered"
    if low in ("undelivered", "notdelivered"):
        return "UnDelivered"
    if low in ("returned", "refunded"):
        return "Returned"
    return default


def _line(d, status_default):
    """Bir HB sipariş kalemini Trendyol satırı biçimine çevirir."""
    lid = _g(d, "id", "lineItemId", "orderLineId", "lineId")
    msku = _g(d, "merchantSku", "merchantSKU", "merchantStockCode", "stockCode")
    hsku = _g(d, "sku", "hepsiburadaSku", "hbSku", "productSku")
    bc = _g(d, "productBarcode", "barcode", "gtin")
    q = _g(d, "quantity", "qty")
    try:
        q = max(1, int(float(q)))
    except (TypeError, ValueError):
        q = 1
    price = _money(_g(d, "unitPrice", "price", "merchantUnitPrice", "salePrice"))
    if price is None:
        tot = _money(_g(d, "totalPrice", "lineTotal", "amount"))
        price = round(tot / q, 2) if tot is not None else None
    com = _g(d, "commissionRate", "commission.rate", "commissionPercentage")
    try:
        com = float(com) if com is not None else None
        com = com * 100 if com is not None and com <= 1 else com
    except (TypeError, ValueError):
        com = None
    st = map_status(_g(d, "status", "itemStatus", "lineItemStatus"), status_default)
    return {"id": f"hb:{lid}" if lid else None, "barcode": bc or msku or hsku, "merchantSku": msku, "sku": hsku,
            "productName": _g(d, "productName", "name", "title", "productTitle") or msku or hsku,
            "quantity": q, "price": price, "commission": com, "orderLineItemStatusName": st if st == "Cancelled" else ""}, st


def _pkg(order_no, src, lines, status, extra=None):
    """Trendyol paket biçimi: _process_line bunu tanır. Paket kimliği siparişe bağlıdır (hb-<sipariş no>)."""
    e = extra or {}
    cust = _g(src, "customerName", "customer.name", "deliveryAddress.name", "shippingAddress.name", "recipientName") or e.get("customer")
    addr = _g(src, "deliveryAddress", "shippingAddress") or {}
    city = (_g(addr, "city", "cityName") if isinstance(addr, dict) else None) or _g(src, "city", "shippingCity") or e.get("city")
    town = (_g(addr, "town", "district", "districtName", "county") if isinstance(addr, dict) else None) or _g(src, "district", "town") or e.get("district")
    od = _ms(_g(src, "orderDate", "createdDate", "orderCreatedDate")) or e.get("order_date") or int(time.time() * 1000)
    due = _ms(_g(src, "dueDate", "shippingDueDate", "cargoDeliveryDate", "deadline")) or e.get("deadline")
    total = _money(_g(src, "totalPrice", "orderTotalPrice", "totalAmount"))
    return {"id": f"hb-{order_no}", "orderNumber": str(order_no), "orderDate": trendyol.to_ty(od), "status": status,
            "lines": lines, "customerFirstName": cust, "shipmentAddress": {"city": city, "district": town},
            "agreedDeliveryDate": due, "packageTotalPrice": total,
            "cargoProviderName": _g(src, "cargoCompany", "cargoCompanyModel.name", "cargoCompanyModel.shortName", "cargoCompanyName") or e.get("cargo"),
            "cargoTrackingNumber": _g(src, "trackingInfoCode", "trackingNumber", "barcode", "packageNumber") or e.get("cargo_no"),
            "cargoTrackingLink": _g(src, "trackingInfoUrl", "trackingUrl") or e.get("cargo_link")}


# ---------------------------------------------------------------- okuma

def fetch_open(max_pages=10):
    """Ödemesi tamamlanmış, henüz paketlenmemiş siparişler (kalem kalem)."""
    out = []
    for page in range(max_pages):
        data = _request("/orders/merchantid/{mid}", {"offset": page * 100, "limit": 100})
        rows = _items(data)
        if rows:
            _shape("order_list_item", rows[0])
        out.extend(rows)
        if len(rows) < 100:
            break
        time.sleep(0.3)
    return out


def fetch_packages(max_pages=20):
    """Paketlenmiş, kargoya verilmeyi bekleyen paketler."""
    out = []
    for page in range(max_pages):
        data = _request("/packages/merchantid/{mid}", {"offset": page * 10, "limit": 10})
        rows = _items(data)
        if rows:
            _shape("package", rows[0])
        out.extend(rows)
        if len(rows) < 10:
            break
        time.sleep(0.3)
    return out


def fetch_detail(order_no):
    d = _request("/orders/merchantid/{mid}/ordernumber/" + urllib.parse.quote(str(order_no)))
    if isinstance(d, list):
        d = d[0] if d else {}
    if isinstance(d, dict) and isinstance(d.get("data"), dict):
        d = d["data"]
    _shape("order_detail", d)
    return d if isinstance(d, dict) else {}


def _build():
    """Okunan HB verisinden sipariş başına paketler: {sipariş no: pkg}."""
    orders = {}
    for it in fetch_open():
        no = _g(it, "orderNumber", "orderNo")
        if not no:
            continue
        ln, st = _line(it, "Created")
        o = orders.setdefault(str(no), {"src": it, "lines": [], "st": []})
        o["lines"].append(ln)
        o["st"].append(st)
    for pk in fetch_packages():
        items = _g(pk, "items", "lineItems", "lines", "orderLines") or []
        pno = _g(pk, "packageNumber", "id")
        for it in items if isinstance(items, list) else []:
            no = _g(it, "orderNumber", "orderNo") or _g(pk, "orderNumber")
            if not no:
                continue
            ln, _ = _line({**it, "status": _g(it, "status") or _g(pk, "status") or "Packaged"}, "Picking")
            st = map_status(_g(it, "status") or _g(pk, "status") or "Packaged", "Picking")
            o = orders.setdefault(str(no), {"src": {**pk, **{k: v for k, v in it.items() if k in ("orderDate", "customerName", "dueDate")}}, "lines": [], "st": []})
            # paketteki kalem açık siparişlerde de görünebilir: aynı kalemi ikinci kez ekleme, durumunu ilerlet
            ex = next((x for x in o["lines"] if ln["id"] and x["id"] == ln["id"]), None)
            if ex:
                i = o["lines"].index(ex)
                o["st"][i] = st
            else:
                o["lines"].append(ln)
                o["st"].append(st)
            o["pkg_no"] = pno
            o["src"].setdefault("barcode", _g(pk, "barcode"))
    return orders


def _rank(st):
    return {"Created": 0, "Picking": 1, "Shipped": 2, "Delivered": 3, "UnDelivered": 3, "Returned": 4, "Cancelled": 5}.get(st, 0)


def sync(manual=False):
    if not _sync_lock.acquire(blocking=False):
        return {"busy": True}
    try:
        with _lock:
            since = int(_get("hb_since", "0") or 0) or int(time.time() * 1000)
            restock = _get("ty_restock_cancel", "1") == "1"
            hb_com = float(_get("hb_commission", "0") or 0) or None
        stats = {"orders": 0, "deducted": 0, "unmatched": 0, "restocked": 0, "details": 0, "at": _now()}
        try:
            orders = _build()
            # daha önce görülmüş, artık açık listelerde olmayan siparişler: son durum ayrıntıdan
            with _lock:
                known = [r["order_number"] for r in _db().execute(
                    """SELECT order_number, MAX(updated_at) u FROM ty_lines WHERE channel='hb' AND ty_status IN ('Created','Picking','Shipped')
                       GROUP BY order_number ORDER BY u LIMIT 40""")]
                no_city = {r["order_number"] for r in _db().execute(
                    "SELECT DISTINCT order_number FROM ty_lines WHERE channel='hb' AND (city IS NULL OR customer IS NULL)")}
                open_keys = {}
                for r in _db().execute("""SELECT order_number, line_key FROM ty_lines WHERE channel='hb'
                                          AND ty_status IN ('Created','Picking','Shipped') AND state NOT IN ('cancelled','restocked')"""):
                    open_keys.setdefault(r["order_number"], set()).add(r["line_key"])
            # siparişin bir kalemi açık listeden düştüyse (kısmi iptal, ayrı paket) o siparişin ayrıntısı da okunur
            gone = [n for n, ks in open_keys.items() if n in orders and ks - {ln["id"] for ln in orders[n]["lines"]}]
            todo = [n for n in known if n not in orders] + gone + [n for n in orders if n in no_city or n not in known][:15]
            for no in dict.fromkeys(todo):
                try:
                    d = fetch_detail(no)
                except HBError as e:
                    if "401" in str(e) or "403" in str(e):
                        raise
                    continue
                stats["details"] += 1
                items = _g(d, "items", "lineItems", "orderLines") or []
                o = orders.get(no)
                if o is None and items:
                    o = orders[no] = {"src": d, "lines": [], "st": []}
                    for it in items:
                        ln, st = _line(it, "Created")
                        o["lines"].append(ln)
                        o["st"].append(st)
                elif o is not None:
                    o["src"] = {**o["src"], **{k: v for k, v in d.items() if v not in (None, "")}}
                    by_id = {}
                    for it in items if isinstance(items, list) else []:
                        ln, st = _line(it, "Created")
                        if ln["id"]:
                            by_id[ln["id"]] = st
                    for i, ln in enumerate(o["lines"]):
                        if ln["id"] in by_id and _rank(by_id[ln["id"]]) > _rank(o["st"][i]):
                            o["st"][i] = by_id[ln["id"]]
                    have = {ln["id"] for ln in o["lines"]}
                    for it in items if isinstance(items, list) else []:   # listelerde artık görünmeyen kalem
                        ln, st = _line(it, "Created")
                        if ln["id"] and ln["id"] not in have:
                            o["lines"].append(ln)
                            o["st"].append(st)
                sh = (_g(d, "shipments") or [None])
                if o is not None and isinstance(sh, list) and sh and isinstance(sh[0], dict):
                    o["src"].setdefault("barcode", sh[0].get("barcode"))
                    o.setdefault("pkg_no", sh[0].get("packageNumber"))
                time.sleep(0.25)
        except HBError as e:
            with _lock:
                _set("hb_last_error", str(e))
                _set("hb_last_sync", _now())
                _db().commit()
            if manual:
                raise
            return {"error": str(e)}
        with _lock:
            try:
                codes = trendyol._code_map()
                for no, o in orders.items():
                    if not o["lines"]:
                        continue
                    live = [s for s in o["st"] if s != "Cancelled"]
                    pst = min(live, key=_rank) if live else "Cancelled"
                    for ln, st in zip(o["lines"], o["st"]):
                        ln["orderLineItemStatusName"] = "Cancelled" if st == "Cancelled" else ""
                        if ln.get("commission") is None and hb_com:
                            ln["commission"] = hb_com
                    pkg = _pkg(no, o["src"], o["lines"], pst, {"cargo_no": o.get("pkg_no")})
                    stats["orders"] += 1
                    for i, ln in enumerate(o["lines"]):
                        key = ln["id"] or f"hb:{no}-{ln.get('merchantSku') or ln.get('sku') or i}"
                        ln["id"] = key
                        # satır kendi durumunda: paket durumu yalnız iptal olmayan satırlar için geçerli
                        p2 = dict(pkg, status=o["st"][i] if o["st"][i] != "Cancelled" else pst)
                        trendyol._process_line(p2, ln, codes, restock, since, stats, key)
                        # paket numarası: paketlenmişse sakla; satır yeniden açık listede (paket bozulmuş) ise sil
                        opened = o["st"][i] == "Created"
                        _db().execute("UPDATE ty_lines SET channel='hb', hb_pkg=CASE WHEN ? THEN NULL ELSE COALESCE(?, hb_pkg) END WHERE line_key=?",
                                      (1 if opened else 0, str(o["pkg_no"]) if o.get("pkg_no") and not opened else None, key))
                _set("hb_last_error", "")
                _set("hb_last_sync", _now())
                _set("hb_last_result", json.dumps(stats))
                _db().commit()
            except Exception:
                _db().rollback()
                raise
        return stats
    finally:
        _sync_lock.release()


# ---------------------------------------------------------------- Hepsiburada'ya yazma: paketleme, paket bozma, etiket
# Hepsi Ayarlar → Hepsiburada'daki "Paketlemeyi Hepsiburada'ya gönder" anahtarına bağlı (etiket okuma hariç).

def write_enabled():
    with _lock:
        return _get("hb_write", "0") == "1"


def _need_write():
    if not write_enabled():
        raise HBError("Hepsiburada'ya paketleme gönderme kapalı. Açmak için: Ayarlar → Hepsiburada → \"Paketlemeyi Hepsiburada'ya gönder\".")


def _lid(r):
    """Satırın Hepsiburada kalem kimliği (hb:<id>[@paket] → <id>); kimliksiz satır için None."""
    v = str(r["line_id"] or r["line_key"] or "")
    if not v.startswith("hb:") or v.startswith(f"hb:{r['order_number']}-"):
        return None
    return v[3:].split("@")[0] or None


def _find(d, *names, depth=0):
    """Yanıtın içinde (iç içe sözlük / listede) ilk bulunan alan."""
    if depth > 5:
        return None
    if isinstance(d, dict):
        for n in names:
            if d.get(n) not in (None, ""):
                return d[n]
        for v in d.values():
            r = _find(v, *names, depth=depth + 1)
            if r not in (None, ""):
                return r
    elif isinstance(d, list):
        for v in d[:5]:
            r = _find(v, *names, depth=depth + 1)
            if r not in (None, ""):
                return r
    return None


def pack(package_ids, deci=None):
    """Seçilen Yeni HB siparişlerini Hepsiburada'da paketler; başarılı olanların stoğu hemen düşer.
    {done: [...], errors: [{package_id, order_number, error}], deducted}"""
    _need_write()
    with _lock:
        deci = deci or float(_get("hb_deci", "1") or 1)
        restock = _get("ty_restock_cancel", "1") == "1"
        since = int(_get("hb_since", "0") or 0)
        codes = trendyol._code_map()
    done, errors, stats = [], [], {"deducted": 0, "restocked": 0}
    for pid_ in package_ids:
        pid_ = str(pid_)
        with _lock:
            rows = _db().execute("SELECT * FROM ty_lines WHERE package_id=? AND channel='hb'", (pid_,)).fetchall()
        live = [r for r in rows if (r["ty_status"] or "") not in trendyol.CANCEL_STATES]
        if not live:
            errors.append({"package_id": pid_, "error": "Sipariş bulunamadı"})
            continue
        on = live[0]["order_number"]
        if any((r["ty_status"] or "") not in ("Created", "Awaiting") for r in live):
            errors.append({"package_id": pid_, "order_number": on, "error": "Sipariş artık Yeni durumunda değil"})
            continue
        ids = [(_lid(r), r) for r in live]
        if any(not x for x, _ in ids):
            errors.append({"package_id": pid_, "order_number": on, "error": "Kalem kimliği yok; bir kez eşitleyip tekrar deneyin"})
            continue
        body = {"parcelQuantity": 1, "deci": deci, "lineItemRequests": [{"id": x, "quantity": int(r["quantity"] or 1)} for x, r in ids]}
        if done or errors:
            time.sleep(0.3)
        try:
            res = _request("/packages/merchantid/{mid}", method="POST", body=body)
        except HBError as e:
            errors.append({"package_id": pid_, "order_number": on, "error": str(e)})
            continue
        _shape("pack_result", res if isinstance(res, dict) else {"list": res})
        pno = _find(res, "packageNumber", "PackageNumber", "packageNo")
        bc = _find(res, "barcode", "cargoBarcode", "trackingNumber")
        with _lock:
            t = _now()
            for _, r in ids:
                _db().execute("""UPDATE ty_lines SET ty_status='Picking', packed_at=COALESCE(packed_at, ?), updated_at=?,
                                 hb_pkg=COALESCE(?, hb_pkg), cargo_no=COALESCE(?, cargo_no) WHERE line_key=?""",
                              (t, t, str(pno) if pno else None, str(bc) if bc else None, r["line_key"]))
                row = _db().execute("SELECT * FROM ty_lines WHERE line_key=?", (r["line_key"],)).fetchone()
                eff = row["product_id"] or codes.get((row["barcode"] or "").strip().lower())
                trendyol._advance(row, "Picking", eff, restock, stats, since, row["order_number"], row["product_name"])
            _db().commit()
        if not pno:   # yanıtta paket numarası yoksa paket listesinden bul (etiket için gerekli)
            try:
                for pk in fetch_packages(3):
                    items = _g(pk, "items", "lineItems", "lines", "orderLines") or []
                    if any(str(_g(it, "orderNumber", "orderNo") or _g(pk, "orderNumber")) == str(on) for it in items if isinstance(it, dict)):
                        pno = _g(pk, "packageNumber", "id")
                        break
            except HBError:
                pno = None
            if pno:
                with _lock:
                    _db().execute("UPDATE ty_lines SET hb_pkg=? WHERE package_id=?", (str(pno), pid_))
                    _db().commit()
        done.append(pid_)
    return {"done": done, "errors": errors, "deducted": stats["deducted"]}


def unpack(package_id):
    """Hepsiburada'daki paketi bozar; sipariş Yeni'ye döner. Düşülmüş stok geri eklenmez (sipariş yine paketlenecek;
    iptal edilirse iptal kuralıyla geri gelir)."""
    _need_write()
    with _lock:
        r = _db().execute("SELECT MAX(hb_pkg) p, MAX(order_number) o FROM ty_lines WHERE package_id=? AND channel='hb'", (str(package_id),)).fetchone()
    if not r or not r["p"]:
        raise HBError("Bu siparişin Hepsiburada paket numarası yok")
    _request(f"/packages/merchantid/{{mid}}/packagenumber/{urllib.parse.quote(str(r['p']))}/unpack", method="POST", body={})
    with _lock:
        cs = sorted(trendyol.CANCEL_STATES)
        _db().execute(f"""UPDATE ty_lines SET ty_status='Created', hb_pkg=NULL, cargo_no=NULL, label_at=NULL, updated_at=? WHERE package_id=? AND channel='hb'
                          AND COALESCE(ty_status,'') NOT IN ({','.join('?' * len(cs))})""", (_now(), str(package_id), *cs))
        _db().commit()
    return {"ok": True, "order_number": r["o"]}


def _pkg_no(package_id):
    with _lock:
        r = _db().execute("SELECT MAX(hb_pkg) p, MAX(order_number) o, MAX(cargo_provider) c FROM ty_lines WHERE package_id=? AND channel='hb'",
                          (str(package_id),)).fetchone()
    if not r or not r["o"]:
        raise HBError("Sipariş bulunamadı")
    if not r["p"]:
        raise HBError("Sipariş henüz Hepsiburada'da paketlenmemiş (etiket paketlendikten sonra alınır)")
    return r["p"], r["o"], r["c"]


def _b64_parts(x, want):
    """JSON yanıtın içindeki base64 etiketleri çözer. want: 'zpl' ya da 'png'."""
    out = []
    if isinstance(x, str):
        t = x.strip()
        if len(t) > 40 and re.fullmatch(r"[A-Za-z0-9+/=\s]+", t[:200]):
            try:
                b = base64.b64decode(t)
            except ValueError:
                return out
            if want == "zpl" and b"^XA" in b:
                out.append(b.decode("utf-8", "ignore"))
            elif want == "png" and (b[:4] == b"\x89PNG" or b[:3] == b"\xff\xd8\xff" or b[:4] == b"%PDF"):
                out.append(b)
    elif isinstance(x, dict):
        for v in x.values():
            out += _b64_parts(v, want)
    elif isinstance(x, list):
        for v in x:
            out += _b64_parts(v, want)
    return out


def label_zpl(package_id):
    """Paketin kargo etiketi (ZPL metinleri, her koli için bir tane)."""
    pno, on, _ = _pkg_no(package_id)
    path = f"/packages/merchantid/{{mid}}/packagenumber/{urllib.parse.quote(str(pno))}/label"
    blob, ctype = _request(path, {"format": "zpl"}, raw=True)
    txt = blob.decode("utf-8", "ignore")
    z = trendyol._zpl_parts(txt)
    if not z:
        blob, ctype = _request(path, {"format": "base64zpl"}, raw=True)
        txt = blob.decode("utf-8", "ignore")
        try:
            z = _b64_parts(json.loads(txt), "zpl")
        except ValueError:
            z = _b64_parts(txt, "zpl")
    if not z:
        raise HBError("Hepsiburada bu paket için etiket vermedi (kargo firması etiketi Hepsiburada'dan verilmiyor olabilir)")
    return z, on


def label_images(package_id):
    """Yazdır penceresi için: etiket görüntüleri (data: URL)."""
    pno, on, _ = _pkg_no(package_id)
    path = f"/packages/merchantid/{{mid}}/packagenumber/{urllib.parse.quote(str(pno))}/label"
    blob, ctype = _request(path, {"format": "png"}, raw=True)
    imgs = []
    if blob[:4] == b"\x89PNG" or blob[:3] == b"\xff\xd8\xff":
        imgs = [blob]
    else:
        try:
            imgs = _b64_parts(json.loads(blob.decode("utf-8", "ignore")), "png")
        except ValueError:
            imgs = _b64_parts(blob.decode("utf-8", "ignore"), "png")
    if not imgs:
        raise HBError("Hepsiburada bu paket için etiket görüntüsü vermedi")
    def url(b):
        mt = "image/png" if b[:4] == b"\x89PNG" else "image/jpeg" if b[:3] == b"\xff\xd8\xff" else "application/pdf"
        return f"data:{mt};base64," + base64.b64encode(b).decode()
    return [url(b) for b in imgs], on


def test():
    """Bağlantı denemesi: açık sipariş ve paket sayısı, görülen alan adları."""
    SHAPE.clear()
    o = _items(_request("/orders/merchantid/{mid}", {"offset": 0, "limit": 10}))
    if o:
        _shape("order_list_item", o[0])
    p = _items(_request("/packages/merchantid/{mid}", {"offset": 0, "limit": 10}))
    if p:
        _shape("package", p[0])
    return {"ok": True, "open_items": len(o), "packages": len(p), "fields": dict(SHAPE)}


def _loop():
    time.sleep(45)
    while True:
        try:
            with _lock:
                on = _get("hb_enabled", "0") == "1"
                iv = int(_get("hb_interval_min", "5") or 5) * 60
                last = int(_get("hb_last_sync", "0") or 0)
            if on and time.time() - last >= iv:
                sync()
        except Exception as e:  # noqa
            print("Hepsiburada eşitleme hatası:", e)
        time.sleep(30)


def start():
    threading.Thread(target=_loop, daemon=True, name="hepsiburada").start()
