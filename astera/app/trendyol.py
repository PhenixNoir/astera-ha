"""
Trendyol Satıcı API entegrasyonu.

Yeni gelen sipariş satırlarını (orderLine) belirli aralıklarla çeker, ürünün barkodu veya
satıcı stok kodu (merchantSku) ile eşleştirir ve stoktan düşer. Her satır yalnızca bir kez
işlenir. Kargoya verilmeden iptal edilen satırlar isteğe bağlı olarak stoğa geri eklenir.

Belge: https://developers.trendyol.com  (getShipmentPackages)
"""
import base64
import os
import re
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

PROD_BASE = "https://apigw.trendyol.com"
STAGE_BASE = "https://stageapigw.trendyol.com"
CANCEL_STATES = {"Cancelled", "UnSupplied"}
MAX_WINDOW_MS = 13 * 24 * 3600 * 1000  # API en fazla 14 günlük aralık kabul ediyor

_db = _lock = _get = _set = _change_stock = _split = _now = None
_sync_lock = threading.Lock()


class TrendyolError(Exception):
    pass


def init(db, lock, get_setting, set_setting, change_stock, split_codes, now):
    global _db, _lock, _get, _set, _change_stock, _split, _now
    _db, _lock, _get, _set, _change_stock, _split, _now = db, lock, get_setting, set_setting, change_stock, split_codes, now


# ---------------------------------------------------------------- settings

def public_settings():
    with _lock:
        secret = _get("ty_api_secret") or ""
        return {
            "ty_seller_id": _get("ty_seller_id", ""),
            "ty_api_key": _get("ty_api_key", ""),
            "ty_api_secret_set": bool(secret),
            "ty_enabled": _get("ty_enabled", "0") == "1",
            "ty_interval_min": int(_get("ty_interval_min", "5")),
            "ty_restock_cancel": _get("ty_restock_cancel", "1") == "1",
            "ty_stage": _get("ty_stage", "0") == "1",
            "ty_since": int(_get("ty_since", "0") or 0),
            "ty_last_sync": int(_get("ty_last_sync", "0") or 0),
            "ty_last_error": _get("ty_last_error", ""),
            "ty_last_result": json.loads(_get("ty_last_result", "null") or "null"),
            "printers": public_printers(),
            "app_name": _get("app_name") or "Astera",
            "app_tagline": _get("app_tagline") if _get("app_tagline") is not None else "Management",
            "app_logo": _get("app_logo") or None,
            "ship_cutoff": _get("ship_cutoff") if _get("ship_cutoff") is not None else "17:00",
            "ship_days": int(_get("ship_days", "1") or 1),
            "ship_skip_sunday": _get("ship_skip_sunday", "0") == "1",
            "plan_days": int(_get("plan_days", "14") or 14),
            "weekly_at": _get("weekly_at") or "1 09:00",
            "ty_write": _get("ty_write", "0") == "1",
        }


PRINTER_KINDS = ("open", "enclosed", "resin")


def guess_kind(name):
    n = (name or "").lower()
    if any(k in n for k in ("saturn", "mars", "photon", "halot", "sonic", "jupiter", "uniformation", "form ", "resin", "reçine", "anycubic m", "mono")):
        return "resin"
    if any(k in n for k in ("p1s", "x1", "k1", "k2", "core one", "h2d", "voron", "kapalı", "enclosed", "qidi")):
        return "enclosed"
    return "open"


def normalize_printers(items):
    """Eski sürüm makineleri düz metin olarak tutuyordu; nesneye çevir: {name, kind, image}."""
    out, seen = [], set()
    for it in items or []:
        if isinstance(it, str):
            it = {"name": it}
        name = (it.get("name") or "").strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        kind = it.get("kind") if it.get("kind") in PRINTER_KINDS else guess_kind(name)
        img = it.get("image") if isinstance(it.get("image"), str) and it["image"].startswith("/uploads/") else None
        d = {"name": name, "kind": kind, "image": img}
        for f in ("bambu_ip", "bambu_serial", "bambu_code", "mr_url", "mr_key", "sdcp_ip"):
            v = (it.get(f) or "").strip() if isinstance(it.get(f), str) else ""
            if v:
                d[f] = v
        out.append(d)
    return out


def public_printers():
    """Erişim kodu istemciye gönderilmez; sadece kayıtlı olup olmadığı bildirilir."""
    out = []
    for p in normalize_printers(json.loads(_get("printers", "[]") or "[]")):
        p = dict(p)
        p["bambu_code_set"] = bool(p.pop("bambu_code", None))
        p["mr_key_set"] = bool(p.pop("mr_key", None))
        out.append(p)
    return out


def save_settings(b):
    with _lock:
        for k in ("ty_seller_id", "ty_api_key"):
            if k in b:
                _set(k, (b[k] or "").strip())
        if b.get("ty_api_secret"):
            _set("ty_api_secret", b["ty_api_secret"].strip())
        if "ty_interval_min" in b:
            _set("ty_interval_min", max(2, int(b["ty_interval_min"] or 5)))
        for k in ("ty_restock_cancel", "ty_stage", "ty_write"):
            if k in b:
                _set(k, "1" if b[k] else "0")
        if "ty_enabled" in b:
            was = _get("ty_enabled", "0") == "1"
            _set("ty_enabled", "1" if b["ty_enabled"] else "0")
            # İlk açılışta geçmiş siparişleri düşmemek için başlangıç anını kaydet
            if b["ty_enabled"] and not was and not int(_get("ty_since", "0") or 0):
                _set("ty_since", int(time.time() * 1000))
        if "ty_since" in b and b["ty_since"]:
            _set("ty_since", int(b["ty_since"]))
        if "ship_cutoff" in b:
            v = (b["ship_cutoff"] or "").strip()   # boş = Trendyol'un saatini aynen kullan
            if v and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
                raise TrendyolError("Kargo saati SS:DD biçiminde olmalı")
            _set("ship_cutoff", v)
        if "ship_days" in b:
            _set("ship_days", max(0, min(7, int(b["ship_days"] or 0))))
        if "plan_days" in b:
            _set("plan_days", max(3, min(60, int(b["plan_days"] or 14))))
        if "weekly_at" in b:
            v = (b["weekly_at"] or "").strip()
            if v != "off" and not re.fullmatch(r"[1-7] ([01]\d|2[0-3]):[0-5]\d", v):
                raise TrendyolError("Haftalık özet zamanı geçersiz")
            _set("weekly_at", v)
        if "ship_skip_sunday" in b:
            _set("ship_skip_sunday", "1" if b["ship_skip_sunday"] else "0")
        if "app_name" in b:
            _set("app_name", (b["app_name"] or "").strip()[:40] or "Astera")
        if "app_tagline" in b:
            _set("app_tagline", (b["app_tagline"] or "").strip()[:40])
        if "app_logo" in b:
            v = b["app_logo"]
            _set("app_logo", v if isinstance(v, str) and v.startswith("/uploads/") else "")
        if "printers" in b:
            old = {p["name"]: p for p in normalize_printers(json.loads(_get("printers", "[]") or "[]"))}
            new = normalize_printers(b["printers"])
            for p in new:   # istemci erişim kodunu / API anahtarını bilmez; boş gelirse eskisini koru
                if not p.get("bambu_code") and old.get(p["name"], {}).get("bambu_code") and p.get("bambu_ip"):
                    p["bambu_code"] = old[p["name"]]["bambu_code"]
                if not p.get("mr_key") and old.get(p["name"], {}).get("mr_key") and p.get("mr_url") and not p.pop("mr_key_clear", False):
                    p["mr_key"] = old[p["name"]]["mr_key"]
            _set("printers", json.dumps(new, ensure_ascii=False))
        _db().commit()


def _creds():
    sid = (_get("ty_seller_id") or "").strip()
    key = (_get("ty_api_key") or "").strip()
    sec = (_get("ty_api_secret") or "").strip()
    if not (sid and key and sec):
        raise TrendyolError("Satıcı ID, API Key ve API Secret girilmeli")
    base = os.environ.get("ATOLYE_TY_BASE") or (STAGE_BASE if _get("ty_stage", "0") == "1" else PROD_BASE)
    return sid, key, sec, base


# ---------------------------------------------------------------- HTTP

def _request(path, params, method="GET", body=None, extra_headers=None, raw=False, raw_body=None, content_type=None):
    with _lock:
        sid, key, sec, base = _creds()
    url = f"{base}{path.format(sid=sid)}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
    token = base64.b64encode(f"{key}:{sec}".encode()).decode()
    headers = {
        "Authorization": f"Basic {token}",
        "User-Agent": f"{sid} - SelfIntegration",
        "Accept": "application/json",
    }
    headers.update(extra_headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    elif raw_body is not None:
        data = raw_body
        headers["Content-Type"] = content_type or "application/octet-stream"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode("utf-8", "ignore")
            if raw:
                return txt
            return json.loads(txt) if txt.strip() else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:600]
        if e.code in (401, 403):
            raise TrendyolError(f"Trendyol yetkilendirmeyi reddetti ({e.code}). API bilgilerini kontrol edin.")
        if e.code == 429:
            raise TrendyolError("Trendyol istek sınırına takıldı, birkaç dakika sonra tekrar denenecek.")
        try:   # {"errors":[{"message": "..."}]} biçimindeki hatayı okunur hale getir
            j = json.loads(detail)
            msgs = [x.get("message") for x in (j.get("errors") or []) if isinstance(x, dict) and x.get("message")]
            detail = "; ".join(msgs) or j.get("message") or detail
        except (ValueError, AttributeError):
            pass
        raise TrendyolError(f"Trendyol hata döndürdü ({e.code}): {detail}")
    except urllib.error.URLError as e:
        raise TrendyolError(f"Trendyol'a bağlanılamadı: {e.reason}")


SYNC_STATUSES = ["Created", "Picking", "Invoiced", "Shipped", "Delivered", "Cancelled", "UnSupplied"]
# "Yeni" sekmesi = Created. Hazırlanıyor'a (Picking) çekilen sipariş paketlenmiş, raftan çıkmış demektir;
# elle sayılan stok onları zaten içermez. Bu yüzden içe aktarma ve hazırlama listesi sadece Created'ı kullanır.
OPEN_STATUSES = ["Created"]


def pkg_status(pkg):
    """Paket durumu `status` alanındadır (sorgudaki status ile aynı ad). `shipmentPackageStatus` farklı
    adlar taşıyabiliyor: Yeni paketler status=Created iken shipmentPackageStatus=ReadyToShip döner."""
    st = pkg.get("status") or ""
    if st:
        return st
    sps = pkg.get("shipmentPackageStatus") or ""
    return "Created" if sps == "ReadyToShip" else sps


PLACEHOLDER_CODES = {"merchantsku", "sku", "barcode", "-", "0", "null", "none"}


def line_status(pkg, line):
    """Satır iptal/tedarik edilemedi ise onu, değilse paketin durumunu esas al.
    (Satır durum adları paket durumlarından farklı olabiliyor, ör. yeni siparişte paket Created iken satır başka ad taşıyabilir.)"""
    ls = line.get("orderLineItemStatusName") or ""
    return ls if ls in CANCEL_STATES else (pkg_status(pkg) or ls)


# Trendyol tarihleri "GMT+3 duvar saati" olarak kodlanmış milisaniye bekler ve döndürür.
# Gerçek (UTC) zamanı göndermek bitişi 3 saat geride bırakır ve son 3 saatin siparişleri gelmez.
TR_OFFSET_MS = 3 * 3600 * 1000


def to_ty(ms):
    return int(ms) + TR_OFFSET_MS


def from_ty(ms):
    return int(ms) - TR_OFFSET_MS if ms else 0


def fetch_packages(start_ms, end_ms, statuses=None):
    """start/end gerçek zaman (UTC ms). Her durum için ayrı sorgu atar; aynı paketi tekilleştirir."""
    start_ms, end_ms = to_ty(start_ms), to_ty(end_ms) + 10 * 60 * 1000  # bitişe saat farkı payı
    seen, out = set(), []
    for st in (statuses or [None]):
        page = 0
        while True:
            params = {"startDate": start_ms, "endDate": end_ms, "page": page, "size": 200,
                      "orderByField": "PackageLastModifiedDate", "orderByDirection": "DESC"}
            if st:
                params["status"] = st
            data = _request("/integration/order/sellers/{sid}/orders", params)
            for pkg in data.get("content") or []:
                k = (pkg.get("id"), pkg_status(pkg))
                if k not in seen:
                    seen.add(k)
                    out.append(pkg)
            total_pages = int(data.get("totalPages") or 1)
            page += 1
            if page >= total_pages or page > 50:
                break
            time.sleep(0.3)
        time.sleep(0.3)
    return out


def test_connection():
    end = to_ty(time.time() * 1000) + 10 * 60 * 1000
    data = _request("/integration/order/sellers/{sid}/orders", {
        "startDate": end - 3 * 24 * 3600 * 1000, "endDate": end, "page": 0, "size": 1,
    })
    return {"ok": True, "orders_last_3_days": data.get("totalElements", 0)}


# ---------------------------------------------------------------- matching

def _code_map():
    m = {}
    for p in _db().execute("SELECT id, barcodes FROM products WHERE archived=0"):
        for c in _split(p["barcodes"]):
            m.setdefault(c, p["id"])
    return m


def _match(codes, line):
    for f in ("barcode", "merchantSku", "sku"):
        v = (str(line.get(f) or "")).strip().lower()
        if v and v not in PLACEHOLDER_CODES and v in codes:
            return codes[v]
    return None


# Stok, sipariş paketlenip Trendyol'da Hazırlanıyor'a (veya sonrasına) geçince düşer. Yeni'deyken dokunulmaz.
PACKED_STATES = {"Picking", "Invoiced", "Shipped", "Delivered", "AtCollectionPoint", "UnDelivered", "Returned"}


def pack_time_ms(pkg):
    """Paketin Hazırlanıyor'a (veya sonrasına) geçtiği an. Trendyol packageHistories'teki ilk paketlenmiş
    durum kaydını kullanır (createdDate GMT, yani gerçek zaman damgası). Yoksa son değişiklik tarihine düşer."""
    ts = [int(h.get("createdDate") or 0) for h in (pkg.get("packageHistories") or [])
          if h.get("status") in PACKED_STATES and h.get("createdDate")]
    if ts:
        return min(ts)
    lm = int(pkg.get("lastModifiedDate") or 0)
    return lm or None


def _deduct(row_key, pid, qty, order_no, name, stats):
    _change_stock(pid, -qty, "trendyol", ref=order_no, note=f"{name or ''} · paketlendi".strip(" ·"))
    _db().execute("UPDATE ty_lines SET state='deducted', product_id=?, packed_at=COALESCE(packed_at, ?) WHERE line_key=?",
                  (pid, _now(), row_key))
    stats["deducted"] += qty


def _advance(row, status, pid, restock, stats, since_ms, order_no=None, name=None):
    """Kayıtlı bir satırı Trendyol durumuna göre ilerletir. pid: eşleşen ürün (yoksa None).
    Kural: paketlenme anı takip başlangıcından sonraysa stok bir kez düşer; önceyse sayımınıza dahil değildir."""
    key, st, qty = row["line_key"], row["state"], row["quantity"]
    order_no = order_no or row["order_number"]
    name = name or row["product_name"]
    cancelled, packed = status in CANCEL_STATES, status in PACKED_STATES
    packed_ms = (row["packed_at"] or 0) * 1000
    if st in ("pending", "unmatched", "ignored"):
        if cancelled:
            _db().execute("UPDATE ty_lines SET state='cancelled' WHERE line_key=?", (key,))
        elif packed and pid:
            if packed_ms and packed_ms < since_ms:
                if st != "ignored":
                    _db().execute("UPDATE ty_lines SET state='ignored', product_id=? WHERE line_key=?", (pid, key))
            else:
                _deduct(key, pid, qty, order_no, name, stats)
        elif pid and not packed:
            _db().execute("UPDATE ty_lines SET state='pending', product_id=? WHERE line_key=?", (pid, key))
        elif not pid and st != "unmatched" and not packed:
            _db().execute("UPDATE ty_lines SET state='unmatched' WHERE line_key=?", (key,))
    elif st == "deducted":
        if cancelled and restock:
            _change_stock(row["product_id"], qty, "trendyol", ref=order_no, note="İptal — stoğa geri eklendi")
            _db().execute("UPDATE ty_lines SET state='restocked' WHERE line_key=?", (key,))
            stats["restocked"] += qty
        elif status == "Created":
            # Eski kuralla Yeni iken düşülmüştü; artık paketlenince düşülüyor, stoğa geri koy
            _change_stock(row["product_id"], qty, "trendyol", ref=order_no, note="Yeni sipariş — paketlenince düşülecek")
            _db().execute("UPDATE ty_lines SET state='pending', packed_at=NULL WHERE line_key=?", (key,))
            stats["restocked"] += qty


def _process_line(pkg, line, codes, restock, since_ms, stats, key=None):
    key = key or _line_key(pkg, line)
    order_no = str(pkg.get("orderNumber") or "")
    order_date = from_ty(pkg.get("orderDate") or 0)
    status = line_status(pkg, line)
    qty = line_qty(line)
    cancelled, packed = status in CANCEL_STATES, status in PACKED_STATES
    row = _db().execute("SELECT * FROM ty_lines WHERE line_key=?", (key,)).fetchone()
    t = _now()
    pid = None if cancelled else _match(codes, line)
    pt = pack_time_ms(pkg) if packed else None

    if row is None:
        state = "cancelled" if cancelled else ("pending" if pid else "unmatched")
        _db().execute(
            """INSERT INTO ty_lines(line_key,order_number,package_id,order_date,barcode,merchant_sku,product_name,
                                    quantity,ty_status,state,product_id,updated_at,packed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (key, order_no, str(pkg.get("id") or ""), order_date, line.get("barcode"), line.get("merchantSku"),
             line.get("productName"), qty, status, state, pid, t, (pt // 1000) if pt else None))
        if state == "unmatched" and not packed:
            stats["unmatched"] += 1
    else:
        # Paketlenme anı: Trendyol geçmişi varsa o; yoksa Yeni→Hazırlanıyor geçişini şimdi gördük
        if packed and not row["packed_at"]:
            _db().execute("UPDATE ty_lines SET packed_at=? WHERE line_key=?", ((pt // 1000) if pt else t, key))
        if row["quantity"] != qty and row["state"] in ("pending", "unmatched", "ignored"):
            _db().execute("UPDATE ty_lines SET quantity=? WHERE line_key=?", (qty, key))
        _db().execute("UPDATE ty_lines SET ty_status=?, updated_at=? WHERE line_key=?", (status, t, key))
    _store_details(pkg, line, key)
    row = _db().execute("SELECT * FROM ty_lines WHERE line_key=?", (key,)).fetchone()
    eff_pid = pid if row["state"] in ("unmatched", "ignored") else (row["product_id"] or pid)
    _advance(row, status, eff_pid, restock, stats, since_ms, order_no, line.get("productName"))


def _since():
    return int(_get("ty_since", "0") or 0)


def rematch_code(code):
    """Bir barkod ürüne eklendiğinde, o barkodla bekleyen eşleşmemiş satırları hemen ilerletir."""
    codes = _code_map()
    stats = {"deducted": 0, "restocked": 0}
    restock = _get("ty_restock_cancel", "1") == "1"
    for row in _db().execute("SELECT * FROM ty_lines WHERE state IN ('unmatched','ignored') AND lower(barcode)=lower(?)", (code,)).fetchall():
        pid = codes.get((row["barcode"] or "").strip().lower())
        if pid:
            _advance(row, row["ty_status"] or "", pid, restock, stats, _since())
    return stats


def sync(manual=False):
    if not _sync_lock.acquire(blocking=False):
        return {"busy": True}
    try:
        with _lock:
            since = int(_get("ty_since", "0") or 0)
            if not since:
                since = int(time.time() * 1000)
                _set("ty_since", since)
                _db().commit()
            restock = _get("ty_restock_cancel", "1") == "1"
        end = int(time.time() * 1000)
        start = end - MAX_WINDOW_MS   # takip öncesi gelmiş Yeni siparişler de paketlenince düşülsün
        stats = {"packages": 0, "deducted": 0, "unmatched": 0, "restocked": 0, "at": _now()}
        try:
            packages = fetch_packages(start, end, SYNC_STATUSES)
        except TrendyolError as e:
            with _lock:
                _set("ty_last_error", str(e))
                _set("ty_last_sync", _now())
                _db().commit()
            if manual:
                raise
            return {"error": str(e)}
        with _lock:
            try:
                codes = _code_map()
                for pkg in packages:
                    stats["packages"] += 1
                    for line, key in package_lines(pkg):
                        _process_line(pkg, line, codes, restock, since, stats, key)
                _set("ty_last_error", "")
                _set("ty_last_sync", _now())
                _set("ty_last_result", json.dumps(stats))
                _db().commit()
            except Exception:
                _db().rollback()
                raise
        if _get("ty_backfill_v1") != "1":
            try:
                stats["backfilled"] = backfill_details()
                with _lock:
                    _set("ty_backfill_v1", "1")
                    _db().commit()
            except TrendyolError:
                pass   # sonraki eşitlemede yeniden denenir
        return stats
    finally:
        _sync_lock.release()


def pkg_deadline(pkg):
    """Trendyol'un bu paket için verdiği kargoya son teslim anı (ms). Uzatılmışsa uzatılmış olanı kullanır.
    agreedDeliveryDate gerçek zaman damgası olarak gelir (örnekte TR saatiyle 23:59'a denk düşüyor)."""
    vals = [int(pkg.get(k) or 0) for k in ("extendedAgreedDeliveryDate", "agreedDeliveryDate")]
    return max(vals) or None


LINE_ID_FIELDS = ("id", "lineId", "orderLineId")


def package_lines(pkg):
    """Paketteki satırları benzersiz anahtarlarıyla döndürür.
    Trendyol aynı üründen birden çok adeti bazen aynı barkodlu ayrı satırlar olarak yollar; satır kimliği yoksa
    eski sürüm bunları tek satır sanıyordu. İlk satır eski anahtarını korur (önceden işlenenler iki kez düşülmesin),
    sonrakiler sıra numarası alır."""
    out, seen = [], {}
    for line in pkg.get("lines") or []:
        lid = next((line.get(f) for f in LINE_ID_FIELDS if line.get(f)), None)
        if lid:
            key = str(lid)
        else:
            base = f"{pkg.get('id')}-{line.get('barcode')}"
            n = seen.get(base, 0) + 1
            seen[base] = n
            key = base if n == 1 else f"{base}#{n}"
        out.append((line, key))
    return out


def line_qty(line):
    """Satırdaki adet. Adet başına indirim detayları daha fazla kalem gösteriyorsa onu esas al."""
    q = int(line.get("quantity") or 1)
    per_item = line.get("discountDetails")
    if isinstance(per_item, list) and len(per_item) > q:
        q = len(per_item)
    return max(1, q)


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def line_unit_revenue(line):
    """Satıcıya kalan birim fiyat (KDV dahil): brüt − satıcının kendi indirimi.
    Trendyol'un karşıladığı indirim satıcıya yine ödendiği için düşülmez."""
    g = _f(line.get("lineGrossAmount"))
    if g is not None:
        return round(g - (_f(line.get("lineSellerDiscount")) or 0), 2)
    dd = line.get("discountDetails")
    if isinstance(dd, list) and dd and any(isinstance(x, dict) and "lineItemPrice" in x for x in dd):
        tot = sum((_f(x.get("lineItemPrice")) or 0) + (_f(x.get("lineItemTyDiscount")) or 0) for x in dd)
        return round(tot / len(dd), 2)
    for f in ("lineUnitPrice", "price"):
        v = _f(line.get(f))
        if v is not None:
            return round(v, 2)
    a = _f(line.get("amount"))
    if a is not None:
        return round(a - (_f(line.get("discount")) or 0), 2)
    return None


def pkg_info(pkg):
    """Paket düzeyinde saklanan bilgiler: müşterinin ödediği toplam, müşteri, şehir, son teslim."""
    total = _f(pkg.get("packageTotalPrice"))
    if total is None:
        total = _f(pkg.get("totalPrice"))
    addr = pkg.get("shipmentAddress") or pkg.get("invoiceAddress") or {}
    name = " ".join(x for x in (pkg.get("customerFirstName"), pkg.get("customerLastName")) if x).strip()
    if not name and isinstance(addr, dict):
        name = (addr.get("fullName") or " ".join(x for x in (addr.get("firstName"), addr.get("lastName")) if x)).strip()
    city = (addr.get("city") if isinstance(addr, dict) else None) or None
    cno = pkg.get("cargoTrackingNumber")
    return {"pkg_total": total, "customer": name or None, "city": city, "deadline": pkg_deadline(pkg),
            "cargo_no": str(cno) if cno not in (None, "", 0) else None,
            "cargo_provider": pkg.get("cargoProviderName") or None,
            "cargo_link": pkg.get("cargoTrackingLink") or None}


def _store_details(pkg, line, key, info=None):
    info = info or pkg_info(pkg)
    lid = next((line.get(f) for f in LINE_ID_FIELDS if line.get(f)), None)
    _db().execute("""UPDATE ty_lines SET unit_price=COALESCE(?, unit_price), pkg_total=COALESCE(?, pkg_total),
                     customer=COALESCE(?, customer), city=COALESCE(?, city), deadline=COALESCE(?, deadline),
                     line_id=COALESCE(?, line_id), cargo_no=COALESCE(?, cargo_no), cargo_provider=COALESCE(?, cargo_provider),
                     cargo_link=COALESCE(?, cargo_link) WHERE line_key=?""",
                  (line_unit_revenue(line), info["pkg_total"], info["customer"], info["city"], info["deadline"],
                   str(lid) if lid else None, info.get("cargo_no"), info.get("cargo_provider"), info.get("cargo_link"), key))


def _line_key(pkg, line):
    for l, k in package_lines(pkg):
        if l is line:
            return k
    return str(line.get("id") or f"{pkg.get('id')}-{line.get('barcode')}")


def _open_lines():
    end = int(time.time() * 1000)
    packages = fetch_packages(end - MAX_WINDOW_MS, end, OPEN_STATUSES)
    with _lock:
        codes = _code_map()
        names = {r["id"]: r["name"] for r in _db().execute(
            "SELECT id, name || COALESCE(' — ' || NULLIF(variant_label,''), '') name FROM products")}
        out, seen = [], set()
        for pkg in packages:
            for line, key in package_lines(pkg):
                status = line_status(pkg, line)
                if status not in OPEN_STATUSES:
                    continue
                if key in seen:
                    continue
                seen.add(key)
                row = _db().execute("SELECT state FROM ty_lines WHERE line_key=?", (key,)).fetchone()
                pid = _match(codes, line)
                out.append({
                    "line_key": key, "order_number": str(pkg.get("orderNumber") or ""),
                    "package_id": str(pkg.get("id") or ""), "order_date": from_ty(pkg.get("orderDate") or 0),
                    "barcode": line.get("barcode"), "merchant_sku": line.get("merchantSku"),
                    "product_name": line.get("productName"), "quantity": line_qty(line),
                    "ty_status": status, "product_id": pid, "matched_name": names.get(pid),
                    "known_state": row["state"] if row else None,
                    "deadline": pkg_deadline(pkg),
                })
    out.sort(key=lambda x: x["order_date"], reverse=True)
    return out


def diagnose():
    """Trendyol'un gerçekte ne döndürdüğünü özetler: durum başına paket sayısı, görülen durum adları, örnek paket."""
    now_ms = int(time.time() * 1000)
    start, end = to_ty(now_ms - MAX_WINDOW_MS), to_ty(now_ms) + 10 * 60 * 1000
    report = {"window": {"startDate": start, "endDate": end, "note": "GMT+3 kodlu ms"}, "by_status": {}, "seen": {}, "sample": None}
    for st in [None, "Awaiting", "Created", "Picking", "Invoiced", "Shipped"]:
        params = {"startDate": start, "endDate": end, "page": 0, "size": 50,
                  "orderByField": "PackageLastModifiedDate", "orderByDirection": "DESC"}
        if st:
            params["status"] = st
        try:
            data = _request("/integration/order/sellers/{sid}/orders", params)
        except TrendyolError as e:
            report["by_status"][st or "(durumsuz)"] = f"HATA: {e}"
            continue
        content = data.get("content") or []
        report["by_status"][st or "(durumsuz)"] = data.get("totalElements", len(content))
        for pkg in content:
            if st == "Picking" and report.get("sample_picking") is None:
                report["sample_picking"] = {
                    "orderNumber": pkg.get("orderNumber"), "status": pkg.get("status"),
                    "lastModifiedDate": pkg.get("lastModifiedDate"),
                    "packageHistories": [{"status": h.get("status"), "createdDate": h.get("createdDate")} for h in (pkg.get("packageHistories") or [])][:6],
                    "lines": [{"id": l.get("id"), "barcode": l.get("barcode"), "quantity": l.get("quantity"),
                               "orderLineItemStatusName": l.get("orderLineItemStatusName")} for l in (pkg.get("lines") or [])[:3]],
                }
            key = f"paket={pkg.get('status')}/{pkg.get('shipmentPackageStatus')}"
            report["seen"][key] = report["seen"].get(key, 0) + 1
            for line in pkg.get("lines") or []:
                lk = f"satır={line.get('orderLineItemStatusName')}"
                report["seen"][lk] = report["seen"].get(lk, 0) + 1
            multi = len(pkg.get("lines") or []) > 1 or any(int(l.get("quantity") or 1) > 1 for l in pkg.get("lines") or [])
            if (report["sample"] is None or (multi and not report.get("_multi"))) and (st == "Created" or not st):
                report["_multi"] = multi
                report["sample"] = {
                    "orderNumber": pkg.get("orderNumber"), "status": pkg.get("status"),
                    "shipmentPackageStatus": pkg.get("shipmentPackageStatus"), "orderDate": pkg.get("orderDate"),
                    "agreedDeliveryDate": pkg.get("agreedDeliveryDate"),
                    "extendedAgreedDeliveryDate": pkg.get("extendedAgreedDeliveryDate"),
                    "packageHistories": [{"status": h.get("status"), "createdDate": h.get("createdDate")} for h in (pkg.get("packageHistories") or [])][:6],
                    "son_teslim_TR_saati": time.strftime("%d.%m %H:%M", time.gmtime(pkg_deadline(pkg) / 1000 + 3 * 3600)) if pkg_deadline(pkg) else None,
                    "line_fields": sorted((pkg.get("lines") or [{}])[0].keys()),
                    "lines": [{"id": l.get("id"), "lineId": l.get("lineId"), "orderLineId": l.get("orderLineId"),
                               "discountDetails_count": len(l.get("discountDetails") or []),
                               "productName": l.get("productName"), "barcode": l.get("barcode"), "merchantSku": l.get("merchantSku"),
                               "orderLineItemStatusName": l.get("orderLineItemStatusName"), "quantity": l.get("quantity")}
                              for l in (pkg.get("lines") or [])[:3]],
                }
        time.sleep(0.3)
    report.pop("_multi", None)
    with _lock:
        lt = time.localtime(); day0 = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)))
        report["atolye"] = {
            "takip_acik": _get("ty_enabled", "0") == "1",
            "takip_baslangici": time.strftime("%d.%m %H:%M", time.localtime(_since() / 1000)) if _since() else None,
            "satir_durumlari": {r["k"]: r["c"] for r in _db().execute(
                "SELECT ty_status || '/' || state k, COUNT(*) c FROM ty_lines GROUP BY ty_status, state")},
            "bugun_paketlenen_satir": _db().execute("SELECT COUNT(*) FROM ty_lines WHERE packed_at>=?", (day0,)).fetchone()[0],
        }
    return report


def preview_open_orders():
    """Son 14 günün Yeni (Created) siparişlerini, stoğa dokunmadan listeler."""
    return {"lines": _open_lines()}


def pick_list():
    """Şu an Yeni durumundaki siparişlerdeki ürünleri toplar: hangi üründen toplam kaç adet, kaç siparişte."""
    lines = _open_lines()
    with _lock:
        prods = {r["id"]: dict(r) for r in _db().execute("SELECT id, name || COALESCE(' — ' || NULLIF(variant_label,''), '') name, thumbnail, stock, print_type FROM products")}
    groups = {}
    for l in lines:
        key = f"p{l['product_id']}" if l["product_id"] else f"b{(l['barcode'] or l['product_name'] or '?').lower()}"
        g = groups.setdefault(key, {
            "product_id": l["product_id"], "name": l["matched_name"] or l["product_name"] or l["barcode"],
            "ty_name": l["product_name"], "barcode": l["barcode"], "quantity": 0, "orders": [],
            "thumbnail": None, "stock": None, "print_type": None,
        })
        if l["product_id"] and l["product_id"] in prods:
            p = prods[l["product_id"]]
            g.update(thumbnail=p["thumbnail"], stock=p["stock"], print_type=p["print_type"], name=p["name"])
        g["quantity"] += l["quantity"]
        g["orders"].append({"order_number": l["order_number"], "quantity": l["quantity"], "order_date": l["order_date"],
                            "known_state": l["known_state"], "deadline": l["deadline"]})
    items = sorted(groups.values(), key=lambda g: (-g["quantity"], g["name"] or ""))
    for g in items:
        g["order_count"] = len({o["order_number"] for o in g["orders"]})
        # Takipte düşülmüş Yeni siparişler stoktan zaten çıkmış durumda; raftaki fiziksel adet = stok + bunlar
        deducted = sum(o["quantity"] for o in g["orders"] if o["known_state"] == "deducted")
        g["on_shelf"] = (g["stock"] + deducted) if g["stock"] is not None else None
        g["shortage"] = max(0, g["quantity"] - g["on_shelf"]) if g["on_shelf"] is not None else None
    # Bugün paketlenenler: Trendyol'da bugün Hazırlanıyor'a geçen tüm satırlar (düşülmeyenler ayrıca işaretli)
    lt = time.localtime()
    day0 = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)))
    with _lock:
        packed = [dict(r) for r in _db().execute(
            """SELECT t.product_id, COALESCE(p.name || COALESCE(' — ' || NULLIF(p.variant_label,''), ''), t.product_name) name, p.thumbnail, SUM(t.quantity) quantity,
                      COUNT(DISTINCT t.order_number) order_count, MAX(t.packed_at) last_at,
                      SUM(CASE WHEN t.state='deducted' THEN t.quantity ELSE 0 END) deducted,
                      MAX(CASE WHEN t.state='unmatched' OR t.product_id IS NULL THEN 1 ELSE 0 END) unmatched,
                      MAX(t.barcode) barcode
               FROM ty_lines t LEFT JOIN products p ON p.id=t.product_id
               WHERE t.packed_at>=? AND t.state NOT IN ('cancelled','restocked')
               GROUP BY COALESCE(t.product_id, 'b:' || lower(COALESCE(t.barcode, t.product_name)))
               ORDER BY last_at DESC""", (day0,))]
        po = _db().execute("""SELECT COUNT(DISTINCT order_number) o, COALESCE(SUM(quantity),0) q FROM ty_lines
                              WHERE packed_at>=? AND state NOT IN ('cancelled','restocked')""", (day0,)).fetchone()
        enabled, since = _get("ty_enabled", "0") == "1", _since()
    return {"items": items, "packed_today": packed, "packed_orders_today": po["o"], "packed_units_today": po["q"],
            "tracking_enabled": enabled, "since": since, "order_count": len({l["order_number"] for l in lines}),
            "unit_count": sum(l["quantity"] for l in lines), "fetched_at": _now()}


def import_open_orders(deduct_keys):
    """Seçilen açık satırları stoktan düşer. Seçilmeyen eşleşmiş satırlar 'yoksayıldı' olarak işaretlenir;
    eşleşmeyenler, ürün seçilebilsin diye eşleşmeyenler listesine eklenir."""
    deduct_keys = set(deduct_keys or [])
    lines = _open_lines()
    stats = {"deducted": 0, "lines": 0, "unmatched": 0, "ignored": 0}
    with _lock:
        try:
            t = _now()
            for l in lines:
                if l["known_state"] and l["known_state"] != "ignored":
                    continue  # daha önce işlenmiş, iki kez düşme
                if l["known_state"] == "ignored" and l["line_key"] not in deduct_keys:
                    continue
                if l["product_id"] and l["line_key"] in deduct_keys:
                    state = "deducted"
                    _change_stock(l["product_id"], -l["quantity"], "trendyol", ref=l["order_number"],
                                  note=(l["product_name"] or "") + " (açık sipariş aktarımı)")
                    stats["deducted"] += l["quantity"]
                    stats["lines"] += 1
                elif not l["product_id"] and l["line_key"] in deduct_keys:
                    state = "unmatched"
                    stats["unmatched"] += 1
                else:
                    state = "ignored"
                    stats["ignored"] += 1
                _db().execute(
                    """INSERT OR REPLACE INTO ty_lines(line_key,order_number,package_id,order_date,barcode,merchant_sku,product_name,
                       quantity,ty_status,state,product_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (l["line_key"], l["order_number"], l["package_id"], l["order_date"], l["barcode"],
                     l["merchant_sku"], l["product_name"], l["quantity"], l["ty_status"], state,
                     l["product_id"] if state == "deducted" else None, t))
            _db().commit()
        except Exception:
            _db().rollback()
            raise
    return stats


def manual_match(key, product_id, save_barcode):
    row = _db().execute("SELECT * FROM ty_lines WHERE line_key=?", (key,)).fetchone()
    if not row:
        raise TrendyolError("Satır bulunamadı")
    if row["state"] not in ("unmatched", "ignored"):
        raise TrendyolError("Bu satır zaten işlenmiş")
    p = _db().execute("SELECT id, barcodes FROM products WHERE id=?", (product_id,)).fetchone()
    if not p:
        raise TrendyolError("Ürün seçin")
    code = (row["barcode"] or "").strip()
    if save_barcode and code and code.lower() not in PLACEHOLDER_CODES and code.lower() not in _split(p["barcodes"]):
        new = ", ".join([c.strip() for c in (p["barcodes"] or "").split(",") if c.strip()] + [code])
        _db().execute("UPDATE products SET barcodes=? WHERE id=?", (new, product_id))
    stats = {"deducted": 0, "restocked": 0}
    _advance(row, row["ty_status"] or "", product_id, _get("ty_restock_cancel", "1") == "1", stats, _since())
    if save_barcode and code:
        rematch_code(code)
    return {"ok": True, **stats}


# ---------------------------------------------------------------- background loop

def _loop():
    while True:
        time.sleep(30)
        try:
            with _lock:
                enabled = _get("ty_enabled", "0") == "1"
                interval = int(_get("ty_interval_min", "5")) * 60
                last = int(_get("ty_last_sync", "0") or 0)
            if enabled and time.time() - last >= interval:
                sync()
            with _lock:
                plast = int(_get("ty_products_sync", "0") or 0)
            if enabled and time.time() - plast >= PRODUCT_SYNC_EVERY:
                sync_products()
            with _lock:
                blast = int(_get("ty_buybox_sync", "0") or 0)
            if enabled and time.time() - blast >= BUYBOX_EVERY:
                check_buybox()
        except Exception as e:  # noqa
            print("Trendyol senkronizasyon hatası:", e)


def start_poller():
    threading.Thread(target=_loop, daemon=True, name="trendyol-poller").start()


# ---------------------------------------------------------------- sipariş listesi, fiyat geçmişi, Hazırlanıyor'a çekme

def backfill_details(max_days=90):
    """Bu sürümden önce kaydedilmiş satırların fiyat/müşteri bilgilerini Trendyol'dan doldurur.
    Sadece mevcut satırları günceller; stoğa dokunmaz."""
    with _lock:
        r = _db().execute("SELECT MIN(NULLIF(order_date, 0)) m, COUNT(*) n FROM ty_lines WHERE unit_price IS NULL").fetchone()
    if not r["n"]:
        return 0
    now_ms = int(time.time() * 1000)
    floor = now_ms - max_days * 24 * 3600 * 1000
    oldest = max(int(r["m"]) - 24 * 3600 * 1000, floor) if r["m"] else floor
    end, filled = now_ms, 0
    while end > oldest:
        start = max(oldest, end - MAX_WINDOW_MS)
        packages = fetch_packages(start, end, SYNC_STATUSES)
        with _lock:
            for pkg in packages:
                info = pkg_info(pkg)
                for line, key in package_lines(pkg):
                    if _db().execute("SELECT 1 FROM ty_lines WHERE line_key=? AND unit_price IS NULL", (key,)).fetchone():
                        _store_details(pkg, line, key, info)
                        filled += 1
            _db().commit()
        end = start
    return filled


ORDER_TABS = {
    "new": {"Created", "Awaiting"},
    "picking": {"Picking", "Invoiced"},
    "shipped": {"Shipped", "AtCollectionPoint"},
    "delivered": {"Delivered"},
    "cancelled": {"Cancelled", "UnSupplied", "Returned", "UnDelivered"},
}
ACTIVE_TABS = ("new", "picking")


def _tab_of(status):
    return next((t for t, sts in ORDER_TABS.items() if status in sts), "picking" if status else "new")


def orders(month=None, start=None, end=None):
    """Kayıtlı Trendyol satırlarını paketlere toplar. Yeni ve Hazırlanıyor her zaman tamamı;
    diğer sekmeler seçilen aralığın (start–end ms; yoksa ayın) siparişleri (sipariş tarihine göre)."""
    if month and re.fullmatch(r"\d{4}-\d{2}", month):
        y, m = map(int, month.split("-"))
    else:
        t = time.localtime()
        y, m = t.tm_year, t.tm_mon
    a = int(time.mktime((y, m, 1, 0, 0, 0, 0, 0, -1))) * 1000
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    b = int(time.mktime((ny, nm, 1, 0, 0, 0, 0, 0, -1))) * 1000
    if start and end and int(end) > int(start):
        a, b = int(start), int(end)
    with _lock:
        rows = [dict(r) for r in _db().execute(
            """SELECT t.*, p.thumbnail, p.name || COALESCE(' — ' || NULLIF(p.variant_label,''), '') matched_name
               FROM ty_lines t LEFT JOIN products p ON p.id=t.product_id
               ORDER BY t.order_date DESC""")]
    pk = {}
    for r in rows:
        k = r["package_id"] or r["order_number"] or r["line_key"]
        g = pk.setdefault(k, {"package_id": r["package_id"], "order_number": r["order_number"], "order_date": r["order_date"],
                              "customer": r["customer"], "city": r["city"], "pkg_total": r["pkg_total"], "deadline": r["deadline"],
                              "packed_at": r["packed_at"], "cargo_no": r["cargo_no"], "cargo_provider": r["cargo_provider"],
                              "cargo_link": r["cargo_link"], "label_at": r["label_at"], "statuses": [], "lines": []})
        for f in ("customer", "city", "pkg_total", "deadline", "packed_at", "cargo_no", "cargo_provider", "cargo_link", "label_at"):
            g[f] = g[f] or r[f]
        g["statuses"].append(r["ty_status"] or "")
        g["lines"].append({"line_key": r["line_key"], "product_id": r["product_id"], "name": r["matched_name"] or r["product_name"] or r["barcode"],
                           "ty_name": r["product_name"], "barcode": r["barcode"], "thumbnail": r["thumbnail"], "quantity": r["quantity"],
                           "unit_price": r["unit_price"], "state": r["state"], "status": r["ty_status"], "line_id": r["line_id"]})
    out, counts = [], {t: 0 for t in ORDER_TABS}
    for g in pk.values():
        live = [st for st in g["statuses"] if st not in CANCEL_STATES]
        g["status"] = live[0] if live else (g["statuses"][0] if g["statuses"] else "")
        g["tab"] = _tab_of(g["status"])
        del g["statuses"]
        if g["tab"] not in ACTIVE_TABS and not (a <= (g["order_date"] or 0) < b):
            continue
        counts[g["tab"]] += 1
        g["can_pick"] = g["tab"] == "new" and all(l["line_id"] for l in g["lines"] if l["status"] not in CANCEL_STATES)
        g["can_label"] = g["tab"] in ("picking", "shipped") or g["tab"] == "new" and bool(g.get("cargo_no"))
        out.append(g)
    tr = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
    cur = time.localtime()
    return {"packages": out, "counts": counts, "month": f"{y:04d}-{m:02d}", "label": f"{tr[m - 1]} {y}",
            "is_current": (y, m) == (cur.tm_year, cur.tm_mon), "last_sync": int(_get("ty_last_sync", "0") or 0),
            "tracking_enabled": _get("ty_enabled", "0") == "1"}


# ---------------------------------------------------------------- kargo etiketi (ortak etiket, ZPL)
# Trendyol "ortak etiket" yalnızca Trendyol Express (TEX) ve Aras Kargo (Trendyol öder) için, yalnızca ZPL verir.
# Paket Hazırlanıyor (Picking) ya da Faturalandı olduktan sonra istenir: önce createCommonLabel, sonra getCommonLabel.

def label_supported(provider):
    p = (provider or "").lower()
    return "trendyol express" in p or p.startswith("tex") or "aras" in p


def package_cargo(package_id):
    """Paketin kayıtlı kargo bilgisi; takip numarası yoksa Trendyol'dan paketi tazeleyip yeniden okur."""
    with _lock:
        r = _db().execute("""SELECT MAX(order_number) o, MAX(cargo_no) n, MAX(cargo_provider) p, MAX(order_date) d
                             FROM ty_lines WHERE package_id=?""", (str(package_id),)).fetchone()
    if not r or not r["o"]:
        raise TrendyolError("Paket bulunamadı")
    if r["n"] and r["p"]:
        return {"order_number": r["o"], "cargo_no": r["n"], "cargo_provider": r["p"]}
    d = int(r["d"] or _now() * 1000)
    data = _request("/integration/order/sellers/{sid}/orders",
                    {"orderNumber": r["o"], "startDate": to_ty(d - 14 * 86400000), "endDate": to_ty(_now() * 1000 + 86400000), "size": 50})
    with _lock:
        for pkg in data.get("content") or []:
            if str(pkg.get("id")) != str(package_id):
                continue
            info = pkg_info(pkg)
            for line, key in package_lines(pkg):
                _store_details(pkg, line, key, info)
        _db().commit()
        r = _db().execute("SELECT MAX(order_number) o, MAX(cargo_no) n, MAX(cargo_provider) p FROM ty_lines WHERE package_id=?",
                          (str(package_id),)).fetchone()
    if not r["n"]:
        raise TrendyolError("Bu pakette henüz kargo takip numarası yok")
    return {"order_number": r["o"], "cargo_no": r["n"], "cargo_provider": r["p"]}


def _addr_text(a):
    """Sokak/bina kısmı: address1 + address2; yoksa fullAddress."""
    parts = [str(a.get(k) or "").strip() for k in ("address1", "address2")]
    t = " ".join(x for x in parts if x)
    return t or str(a.get("fullAddress") or "").strip()


def label_data(package_ids):
    """Kendi etiketimiz için paket bilgileri. Adres saklanmaz; her seferinde Trendyol'dan taze okunur.
    {labels: [...], errors: [{package_id, error}]}"""
    want = [str(x) for x in package_ids]
    with _lock:
        rows = {r["package_id"]: dict(r) for r in _db().execute(
            f"""SELECT package_id, MAX(order_number) order_number, MIN(order_date) order_date FROM ty_lines
                WHERE package_id IN ({','.join('?' * len(want))}) GROUP BY package_id""", want)}
    labels, errors, cache = [], [], {}
    for pid in want:
        r = rows.get(pid)
        if not r or not r["order_number"]:
            errors.append({"package_id": pid, "error": "Paket bulunamadı"})
            continue
        on = r["order_number"]
        if on not in cache:
            d = int(r["order_date"] or _now() * 1000)
            try:
                data = _request("/integration/order/sellers/{sid}/orders",
                                {"orderNumber": on, "startDate": to_ty(d - 14 * 86400000), "endDate": to_ty(_now() * 1000 + 86400000), "size": 50})
            except TrendyolError as e:
                errors.append({"package_id": pid, "order_number": on, "error": str(e)})
                continue
            cache[on] = data.get("content") or []
        pkg = next((x for x in cache[on] if str(x.get("id")) == pid), None)
        if not pkg:
            errors.append({"package_id": pid, "order_number": on, "error": "Paket Trendyol'da bulunamadı"})
            continue
        with _lock:
            info = pkg_info(pkg)
            for line, key in package_lines(pkg):
                _store_details(pkg, line, key, info)
            _db().commit()
        cno = pkg.get("cargoTrackingNumber")
        if cno in (None, "", 0):
            errors.append({"package_id": pid, "order_number": on, "error": "Bu pakette henüz kargo takip numarası yok"})
            continue
        a = pkg.get("shipmentAddress") or {}
        name = (a.get("fullName") or " ".join(x for x in (a.get("firstName"), a.get("lastName")) if x)
                or " ".join(x for x in (pkg.get("customerFirstName"), pkg.get("customerLastName")) if x) or "").strip()
        labels.append({
            "package_id": pid, "order_number": str(pkg.get("orderNumber") or on), "tracking": str(cno),
            "provider": pkg.get("cargoProviderName") or "", "name": name, "company": (a.get("company") or "").strip(),
            "address": _addr_text(a), "neighborhood": (a.get("neighborhood") or "").strip(),
            "district": (a.get("district") or a.get("countyName") or "").strip(), "city": (a.get("city") or "").strip(),
            "boxes": int(pkg.get("boxQuantity") or 1), "deci": pkg.get("cargoDeci") or pkg.get("deci"),
        })
    return {"labels": labels, "errors": errors}


# ---------------------------------------------------------------- Trendyol'a yazma (fiyat, kargo firması)
# Hepsi Ayarlar'daki "Trendyol'a değişiklik gönder" anahtarına bağlı; kapalıyken hiçbir şey gönderilmez.

CARGO_CODES = [("TEXMP", "Trendyol Express"), ("ARASMP", "Aras Kargo"), ("YKMP", "Yurtiçi Kargo"), ("SURATMP", "Sürat Kargo"),
               ("PTTMP", "PTT Kargo"), ("HOROZMP", "Horoz Lojistik"), ("DHLECOMMP", "DHL eCommerce"), ("CEVAMP", "CEVA Lojistik"),
               ("KOLAYGELSINMP", "Kolay Gelsin")]


def write_enabled():
    with _lock:
        return _get("ty_write", "0") == "1"


def _need_write():
    if not write_enabled():
        raise TrendyolError("Trendyol'a değişiklik gönderme kapalı. Açmak için: Satış → Trendyol ayarları → \"Trendyol'a değişiklik gönder\".")


def price_info(barcode):
    with _lock:
        r = _db().execute("SELECT barcode, title, sale_price, list_price, updated_at FROM ty_products WHERE barcode=?", (barcode,)).fetchone()
    return dict(r) if r else None


def update_price(barcode, sale, lst=None):
    """Yalnızca fiyat gönderilir (stok gönderilmez). Sonuç toplu işlem kimliğiyle sorgulanır."""
    _need_write()
    sale = round(float(sale), 2)
    if sale <= 0:
        raise TrendyolError("Satış fiyatı 0'dan büyük olmalı")
    cur = price_info(barcode)
    if not cur:
        raise TrendyolError("Bu barkod Trendyol ürün listesinde yok; önce Satış sayfasından ürünleri eşitleyin")
    lst = round(float(lst), 2) if lst not in (None, "") else max(sale, float(cur["list_price"] or 0))
    if lst < sale:
        raise TrendyolError("Liste fiyatı satış fiyatından düşük olamaz")
    data = _request("/integration/inventory/sellers/{sid}/products/price-and-inventory", None, method="POST",
                    body={"items": [{"barcode": barcode, "salePrice": sale, "listPrice": lst}]})
    bid = data.get("batchRequestId")
    res = {"batch": bid, "status": "PENDING", "old": {"sale": cur["sale_price"], "list": cur["list_price"]}, "new": {"sale": sale, "list": lst}}
    for _ in range(6):   # sonuç genelde birkaç saniyede gelir
        time.sleep(2)
        try:
            st = batch_status(bid)
        except TrendyolError:
            continue
        if st["status"] in ("SUCCESS", "FAILED"):
            res.update(st)
            break
    if res["status"] == "SUCCESS":
        with _lock:
            _db().execute("UPDATE ty_products SET sale_price=?, list_price=? WHERE barcode=?", (sale, lst, barcode))
            _db().commit()
    return res


def batch_status(bid):
    d = _request(f"/integration/product/sellers/{{sid}}/products/batch-requests/{bid}", None)
    items = d.get("items") or []
    if not items:
        return {"status": "PENDING", "reasons": []}
    it = items[0]
    st = (it.get("status") or "").upper()
    reasons = [str(x) for x in (it.get("failureReasons") or [])]
    return {"status": "SUCCESS" if st == "SUCCESS" else "FAILED" if st in ("FAILED", "FAILURE", "ERROR") else "PENDING", "reasons": reasons}


def change_cargo(package_id, code):
    _need_write()
    codes = dict(CARGO_CODES)
    if code not in codes:
        raise TrendyolError("Geçersiz kargo firması")
    with _lock:
        r = _db().execute("SELECT MAX(ty_status) st, MAX(cargo_provider) p FROM ty_lines WHERE package_id=?", (str(package_id),)).fetchone()
    if not r or not r["st"]:
        raise TrendyolError("Paket bulunamadı")
    if r["st"] not in ("Created", "Picking", "Invoiced"):
        raise TrendyolError("Kargoya verilmiş siparişin kargo firması değiştirilemez")
    _request(f"/integration/order/sellers/{{sid}}/shipment-packages/{package_id}/cargo-providers", None, method="PUT",
             body={"cargoProvider": code})
    with _lock:   # takip no / firma tazelensin diye boşalt; package_cargo Trendyol'dan yeniden okur
        _db().execute("UPDATE ty_lines SET cargo_no=NULL, cargo_provider=NULL, cargo_link=NULL WHERE package_id=?", (str(package_id),))
        _db().commit()
    time.sleep(1.5)
    try:
        info = package_cargo(package_id)
    except TrendyolError:
        info = None
    return {"ok": True, "old": r["p"], "new": codes[code], "cargo": info}


def _zpl_parts(x):
    """Yanıtın içinden ZPL etiketlerini toplar (düz metin ya da JSON içinde, her koli için bir tane)."""
    out = []
    if isinstance(x, str):
        t = x.strip()
        if "^XA" in t:
            if t.startswith("{") or t.startswith("["):
                try:
                    return _zpl_parts(json.loads(t))
                except ValueError:
                    pass
            out.append(t)
    elif isinstance(x, dict):
        for v in x.values():
            out += _zpl_parts(v)
    elif isinstance(x, list):
        for v in x:
            out += _zpl_parts(v)
    return out


def common_label(cargo_no, boxes=1):
    """Ortak etiketin ZPL'lerini döndürür (gerekirse önce oluşturur)."""
    path = f"/integration/sellers/{{sid}}/common-label/{urllib.parse.quote(str(cargo_no))}"

    def get():
        try:
            return _zpl_parts(_request(path, None, raw=True))
        except TrendyolError:
            return []
    z = get()
    if z:
        return z
    try:
        _request(path, None, method="POST", body={"format": "ZPL", "boxQuantity": max(1, int(boxes or 1))}, raw=True)
    except TrendyolError as e:
        z = get()
        if z:
            return z
        raise TrendyolError(f"Etiket istenemedi: {e}")
    for wait in (1, 1.5, 2, 3, 4):
        time.sleep(wait)
        z = get()
        if z:
            return z
    raise TrendyolError("Trendyol etiketi henüz hazırlamadı; biraz sonra tekrar deneyin")


def mark_label(package_id):
    with _lock:
        _db().execute("UPDATE ty_lines SET label_at=? WHERE package_id=?", (_now(), str(package_id)))
        _db().commit()


def set_picking(package_ids):
    """Seçilen Yeni paketleri Trendyol'da Hazırlanıyor'a çeker; başarılı olanların stoğu hemen düşer."""
    done, errors = [], []
    restock = _get("ty_restock_cancel", "1") == "1"
    codes = _code_map()
    stats = {"deducted": 0, "restocked": 0}
    for pid_ in package_ids:
        pid_ = str(pid_)
        with _lock:
            rows = _db().execute("SELECT * FROM ty_lines WHERE package_id=?", (pid_,)).fetchall()
        live = [r for r in rows if (r["ty_status"] or "") not in CANCEL_STATES]
        if not live:
            errors.append({"package_id": pid_, "error": "Paket bulunamadı"})
            continue
        if any(r["ty_status"] not in ORDER_TABS["new"] for r in live):
            errors.append({"package_id": pid_, "order_number": live[0]["order_number"], "error": "Sipariş artık Yeni durumunda değil"})
            continue
        if any(not r["line_id"] for r in live):
            errors.append({"package_id": pid_, "order_number": live[0]["order_number"], "error": "Satır kimliği yok; bir kez eşitleyip tekrar deneyin"})
            continue
        body = {"lines": [{"lineId": int(r["line_id"]) if str(r["line_id"]).isdigit() else r["line_id"], "quantity": r["quantity"]} for r in live],
                "params": {}, "status": "Picking"}
        if done or errors:
            time.sleep(0.2)   # Trendyol istek sınırına takılmamak için
        try:
            _request(f"/integration/order/sellers/{{sid}}/shipment-packages/{pid_}", None, method="PUT", body=body)
        except TrendyolError as e:
            errors.append({"package_id": pid_, "order_number": live[0]["order_number"], "error": str(e)})
            continue
        with _lock:
            t = _now()
            for r in live:
                _db().execute("UPDATE ty_lines SET ty_status='Picking', packed_at=COALESCE(packed_at, ?), updated_at=? WHERE line_key=?", (t, t, r["line_key"]))
                row = _db().execute("SELECT * FROM ty_lines WHERE line_key=?", (r["line_key"],)).fetchone()
                eff = row["product_id"] or codes.get((row["barcode"] or "").strip().lower())
                _advance(row, "Picking", eff, restock, stats, _since(), row["order_number"], row["product_name"])
            _db().commit()
        done.append(pid_)
    return {"done": done, "errors": errors, "deducted": stats["deducted"]}


# ---------------------------------------------------------------- Trendyol ürünleri: fiyat, komisyon, görsel, başlık

PRODUCT_SYNC_EVERY = 6 * 3600
on_products = None   # server.py: eşleşen ürünlere uygular (fiyat, komisyon, boş görseller)


def _attr(attrs, *names):
    for a in attrs or []:
        if (a.get("attributeName") or "").lower() in names:
            return a.get("attributeValue")
    return None


def _norm_v2(item):
    out = []
    imgs = [i.get("url") for i in item.get("images") or [] if i.get("url")]
    cat = (item.get("category") or {}).get("name") if isinstance(item.get("category"), dict) else item.get("categoryName")
    color = _attr(item.get("attributes"), "renk", "color")
    for v in item.get("variants") or []:
        price = v.get("price") or {}
        out.append({"barcode": v.get("barcode"), "stock_code": v.get("stockCode"), "content_id": str(item.get("contentId") or ""),
                    "main_id": item.get("productMainId"), "title": item.get("title"),
                    "sale_price": _f(price.get("salePrice")), "list_price": _f(price.get("listPrice")),
                    "commission": _f(v.get("commission")), "images": imgs, "category": cat,
                    "color": _attr(v.get("attributes"), "renk", "color") or color, "url": v.get("productUrl"),
                    "on_sale": 1 if v.get("onSale", True) else 0, "archived": 1 if v.get("archived") else 0})
    return out


def _norm_v1(item):
    return [{"barcode": item.get("barcode"), "stock_code": item.get("stockCode"), "content_id": str(item.get("productContentId") or ""),
             "main_id": item.get("productMainId"), "title": item.get("title"), "sale_price": _f(item.get("salePrice")),
             "list_price": _f(item.get("listPrice")), "commission": None,
             "images": [i.get("url") for i in item.get("images") or [] if i.get("url")], "category": item.get("categoryName"),
             "color": item.get("color") or _attr(item.get("attributes"), "renk", "color"), "url": item.get("productUrl"),
             "on_sale": 1 if item.get("onSale", True) else 0, "archived": 1 if item.get("archived") else 0}]


def fetch_products():
    """Onaylı ürünleri sayfa sayfa çeker. Önce V2 servisi (komisyon içerir), olmazsa eski V1."""
    headers = {"storeFrontCode": _get("ty_storefront")} if _get("ty_storefront") else None
    out, page, token = [], 0, None
    try:
        while page < 100:
            params = {"page": page, "size": 100}
            if token:
                params = {"nextPageToken": token, "size": 100}
            try:
                data = _request("/integration/product/sellers/{sid}/products/approved", params, extra_headers=headers)
            except TrendyolError as e:
                if headers is None and "storefront" in str(e).lower():
                    headers = {"storeFrontCode": "TR"}
                    with _lock:
                        _set("ty_storefront", "TR")
                        _db().commit()
                    continue
                raise
            for it in data.get("content") or []:
                out.extend(_norm_v2(it))
            page += 1
            token = data.get("nextPageToken") if page * 100 >= 10000 else None
            if page >= int(data.get("totalPages") or 1) and not token:
                break
            time.sleep(0.3)
        return out
    except TrendyolError as e:
        if "(404)" not in str(e) and "(410)" not in str(e):
            raise
    out, page = [], 0     # V2 yoksa eski servis
    while page < 100:
        data = _request("/integration/product/sellers/{sid}/products", {"approved": "true", "page": page, "size": 200})
        for it in data.get("content") or []:
            out.extend(_norm_v1(it))
        page += 1
        if page >= int(data.get("totalPages") or 1):
            break
        time.sleep(0.3)
    return out


def sync_products():
    try:
        items = [x for x in fetch_products() if x.get("barcode")]
    except TrendyolError as e:
        with _lock:
            _set("ty_products_error", str(e))
            _set("ty_products_sync", _now())
            _db().commit()
        raise
    with _lock:
        t = _now()
        _db().execute("DELETE FROM ty_products")
        for x in items:
            _db().execute("""INSERT OR REPLACE INTO ty_products(barcode,stock_code,content_id,main_id,title,sale_price,list_price,commission,
                             images,category,color,url,on_sale,archived,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                          (x["barcode"], x["stock_code"], x["content_id"], x["main_id"], x["title"], x["sale_price"], x["list_price"],
                           x["commission"], json.dumps(x["images"]), x["category"], x["color"], x["url"], x["on_sale"], x["archived"], t))
        _set("ty_products_sync", t)
        _set("ty_products_error", "")
        _db().commit()
    applied = on_products() if on_products else {}
    return {"products": len(items), **(applied or {})}


# ---------------------------------------------------------------- Buybox takibi

BUYBOX_EVERY = 15 * 60
BUYBOX_PRICE_FRESH = 30 * 60     # bizim fiyatımız bundan eskiyse önce ürünleri tazele (yanlış alarm olmasın)


def fetch_buybox(barcodes):
    """Trendyol buybox servisi: barkod başına buybox sıramız, 1./2./3. sıradaki fiyatlar. İstek başına en fazla 10 barkod."""
    headers = {"storeFrontCode": _get("ty_storefront") or "TR"}
    out = []
    for i in range(0, len(barcodes), 10):
        data = _request("/integration/product/sellers/{sid}/products/buybox-information", None, method="POST",
                        body={"barcodes": barcodes[i:i + 10]}, extra_headers=headers)
        out.extend(data.get("buyboxInfo") or [])
        if i + 10 < len(barcodes):
            time.sleep(0.15)
    return out


def check_buybox():
    with _lock:
        plast = int(_get("ty_products_sync", "0") or 0)
    if time.time() - plast >= BUYBOX_PRICE_FRESH:
        try:
            sync_products()
        except TrendyolError as e:
            print("Buybox öncesi ürün tazeleme hatası:", e)
    with _lock:
        ours = {r["barcode"]: r["sale_price"] for r in _db().execute(
            "SELECT barcode, sale_price FROM ty_products WHERE COALESCE(on_sale,1)=1 AND COALESCE(archived,0)=0 AND barcode<>''")}
    try:
        info = fetch_buybox(list(ours)) if ours else []
    except TrendyolError as e:
        with _lock:
            _set("ty_buybox_error", str(e))
            _set("ty_buybox_sync", _now())
            _db().commit()
        raise
    t = _now()
    multi = lost = 0
    with _lock:
        for x in info:
            bc = str(x.get("barcode") or "")
            if bc not in ours:
                continue
            order = int(x.get("buyboxOrder") or 0) or None
            bb, p2, p3 = _f(x.get("buyboxPrice")), _f(x.get("secondBuyboxPrice")), _f(x.get("thirdBuyboxPrice"))
            m = 1 if x.get("hasMultipleSeller") else 0
            our = ours[bc]
            if order == 1 and bb:
                our = bb            # buybox bizdeyse buybox fiyatı bizim güncel fiyatımızdır
            multi += m
            prev = _db().execute("SELECT * FROM ty_buybox WHERE barcode=?", (bc,)).fetchone()
            changed = not prev or (prev["buybox_order"], prev["buybox_price"], prev["second_price"], prev["our_price"]) != (order, bb, p2, our)
            is_lost = bool(order and order > 1)
            lost += is_lost
            lost_since = (prev["lost_since"] if prev and prev["lost_since"] else t) if is_lost else None
            _db().execute("""INSERT OR REPLACE INTO ty_buybox(barcode,buybox_order,buybox_price,second_price,third_price,multi,our_price,
                             checked_at,changed_at,lost_since) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                          (bc, order, bb, p2, p3, m, our, t, t if changed else (prev["changed_at"] if prev else t), lost_since))
            if changed and m:
                _db().execute("INSERT INTO ty_buybox_log(barcode,buybox_order,buybox_price,second_price,our_price,at) VALUES(?,?,?,?,?,?)",
                              (bc, order, bb, p2, our, t))
        if ours:
            ph = ",".join("?" * len(ours))
            _db().execute(f"DELETE FROM ty_buybox WHERE barcode NOT IN ({ph})", list(ours))
        _db().execute("DELETE FROM ty_buybox_log WHERE at<?", (t - 90 * 86400,))
        _set("ty_buybox_sync", t)
        _set("ty_buybox_error", "")
        _db().commit()
    return {"checked": len(info), "multi": multi, "lost": lost}
