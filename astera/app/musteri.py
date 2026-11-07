"""
Trendyol iadeler (claims) ve müşteri soruları (qna).

- Arka planda 5 dakikada bir son 30 günün iadeleri ve son 2 haftanın soruları çekilir, veritabanına yazılır.
- Bildirimleri notify.py üretir (iade: işlem bekleyen / yolda; soru: cevap bekleyen).
- İade onaylama, iade reddetme (gerekçe + dosya) ve soru cevaplama buradan Trendyol'a gönderilir.
"""
import base64
import json
import threading
import time
import uuid

import trendyol

_db = _lock = _get = _set = _change_stock = _codes = None
POLL_EVERY = 300
QNA_FAST = 60
_busy = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS ty_claims (
    claim_id TEXT PRIMARY KEY,
    order_number TEXT,
    order_date INTEGER,
    claim_date INTEGER,
    customer TEXT,
    cargo_no TEXT,
    cargo_provider TEXT,
    cargo_link TEXT,
    status TEXT,
    items TEXT,
    last_modified INTEGER,
    first_seen INTEGER,
    restocked INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_claims_status ON ty_claims(status);
CREATE TABLE IF NOT EXISTS ty_questions (
    id INTEGER PRIMARY KEY,
    product_name TEXT,
    image_url TEXT,
    web_url TEXT,
    text TEXT,
    user_name TEXT,
    status TEXT,
    created INTEGER,
    answer TEXT,
    answer_date INTEGER,
    rejected TEXT,
    first_seen INTEGER
);
CREATE INDEX IF NOT EXISTS idx_q_status ON ty_questions(status);
"""

# Kalem durumlarından iadenin genel durumu: işlem bekleyen varsa o, yoksa yolda olan, yoksa sonuç
STATUS_ORDER = ["WaitingInAction", "WaitingFraudCheck", "Created", "InAnalysis", "Unresolved", "Rejected", "Accepted", "Cancelled"]
STATUS_TR = {"WaitingInAction": "İşlem bekliyor", "WaitingFraudCheck": "Kontrol ediliyor", "Created": "Talep açıldı", "InAnalysis": "Analizde",
             "Unresolved": "Çözümsüz", "Rejected": "Reddedildi", "Accepted": "Onaylandı", "Cancelled": "İptal"}
NO_FILE_REASONS = {1651, 451, 2101}
Q_STATUS_TR = {"WAITING_FOR_ANSWER": "Cevap bekliyor", "WAITING_FOR_APPROVE": "Cevap onayda", "ANSWERED": "Cevaplandı",
               "REPORTED": "Bildirildi", "REJECTED": "Cevap reddedildi", "UNANSWERED": "Cevaplanmadı"}


def init(db, lock, get_setting, set_setting, change_stock, code_map):
    global _db, _lock, _get, _set, _change_stock, _codes
    _db, _lock, _get, _set, _change_stock, _codes = db, lock, get_setting, set_setting, change_stock, code_map


def migrate(c):
    c.executescript(SCHEMA)
    cols = {r[1] for r in c.execute("PRAGMA table_info(ty_questions)")}
    if "public" not in cols:   # müşteri sorusunun ürün sayfasında yayınlanmasını isteyip istemediği (1/0; bilinmiyorsa boş)
        c.execute("ALTER TABLE ty_questions ADD COLUMN public INTEGER")


Q_SHAPE = {}   # hata raporu için: Trendyol'un soru kaydında gelen alan adları (değer yok)


def _now():
    return int(time.time())


def _ms(v):
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


# ---------------------------------------------------------------- iadeler

def _claim_row(c):
    items = []
    for it in c.get("items") or []:
        ol = it.get("orderLine") or {}
        for ci in it.get("claimItems") or []:
            cr = ci.get("customerClaimItemReason") or {}
            tr = ci.get("trendyolClaimItemReason") or {}
            items.append({
                "id": ci.get("id"), "line_id": ol.get("id"), "product": ol.get("productName"), "barcode": ol.get("barcode"),
                "sku": ol.get("merchantSku"), "color": ol.get("productColor"), "size": ol.get("productSize"), "price": ol.get("price"),
                "reason": cr.get("name") or tr.get("name"), "reason_code": cr.get("code"),
                "customer_note": ci.get("customerNote") or "", "note": ci.get("note") or "",
                "status": ((ci.get("claimItemStatus") or {}).get("name")) or "", "auto": bool(ci.get("autoAccepted")),
                "by_seller": bool(ci.get("acceptedBySeller")),
            })
    sts = {i["status"] for i in items}
    status = next((s for s in STATUS_ORDER if s in sts), next(iter(sts), ""))
    name = " ".join(x for x in (c.get("customerFirstName"), c.get("customerLastName")) if x).strip()
    return {
        "claim_id": str(c.get("id") or c.get("claimId")), "order_number": str(c.get("orderNumber") or ""),
        "order_date": trendyol.from_ty(_ms(c.get("orderDate"))) // 1000 if c.get("orderDate") else None,
        "claim_date": trendyol.from_ty(_ms(c.get("claimDate"))) // 1000 if c.get("claimDate") else None,
        "customer": name or None, "cargo_no": str(c.get("cargoTrackingNumber") or "") or None,
        "cargo_provider": c.get("cargoProviderName") or None, "cargo_link": c.get("cargoTrackingLink") or None,
        "status": status, "items": json.dumps(items, ensure_ascii=False),
        "last_modified": trendyol.from_ty(_ms(c.get("lastModifiedDate"))) // 1000 if c.get("lastModifiedDate") else None,
    }


def sync_claims(days=30):
    end = int(time.time() * 1000)
    start = end - days * 86400000
    got = 0
    win = 14 * 86400000
    e = end
    while e > start:
        s = max(start, e - win)
        page = 0
        while True:
            data = trendyol._request("/integration/order/sellers/{sid}/claims",
                                     {"startDate": trendyol.to_ty(s), "endDate": trendyol.to_ty(e) + 600000, "page": page, "size": 50})
            content = data.get("content") or []
            with _lock:
                for c in content:
                    r = _claim_row(c)
                    if not r["claim_id"]:
                        continue
                    old = _db().execute("SELECT first_seen FROM ty_claims WHERE claim_id=?", (r["claim_id"],)).fetchone()
                    if old:
                        _db().execute("""UPDATE ty_claims SET order_number=?, order_date=?, claim_date=?, customer=?, cargo_no=?, cargo_provider=?,
                                         cargo_link=?, status=?, items=?, last_modified=? WHERE claim_id=?""",
                                      (r["order_number"], r["order_date"], r["claim_date"], r["customer"], r["cargo_no"], r["cargo_provider"],
                                       r["cargo_link"], r["status"], r["items"], r["last_modified"], r["claim_id"]))
                    else:
                        _db().execute("""INSERT INTO ty_claims(claim_id, order_number, order_date, claim_date, customer, cargo_no, cargo_provider,
                                         cargo_link, status, items, last_modified, first_seen) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                                      (r["claim_id"], r["order_number"], r["order_date"], r["claim_date"], r["customer"], r["cargo_no"],
                                       r["cargo_provider"], r["cargo_link"], r["status"], r["items"], r["last_modified"], _now()))
                    got += 1
                _db().commit()
            page += 1
            if page >= int(data.get("totalPages") or 1) or page > 20:
                break
            time.sleep(0.3)
        e = s
        time.sleep(0.3)
    return got


def _product_index():
    """barkod → (ürün id, ad, görsel)"""
    codes = _codes()
    names = {r["id"]: (r["name"], r["thumbnail"]) for r in _db().execute("SELECT id, name, thumbnail FROM products")}
    return {k.lower(): (pid, *names.get(pid, (None, None))) for k, pid in codes.items()}


def claims(tab="action"):
    groups = {"action": ("WaitingInAction", "WaitingFraudCheck"), "transit": ("Created",),
              "done": ("Accepted", "Rejected", "Cancelled", "Unresolved", "InAnalysis")}
    counts = {k: _db().execute(f"SELECT COUNT(*) FROM ty_claims WHERE status IN ({','.join('?' * len(v))})", v).fetchone()[0]
              for k, v in groups.items()}
    sts = groups.get(tab, groups["action"])
    rows = _db().execute(f"""SELECT * FROM ty_claims WHERE status IN ({','.join('?' * len(sts))})
                             ORDER BY COALESCE(claim_date, first_seen) DESC LIMIT 200""", sts).fetchall()
    idx = _product_index()
    out = []
    for r in rows:
        d = dict(r)
        d["items"] = json.loads(d["items"] or "[]")
        for it in d["items"]:
            m = idx.get((it.get("barcode") or "").lower())
            it["product_id"], it["our_name"], it["thumbnail"] = (m if m else (None, None, None))
            it["status_tr"] = STATUS_TR.get(it["status"], it["status"])
        d["status_tr"] = STATUS_TR.get(d["status"], d["status"])
        out.append(d)
    last = _get("claims_sync", "") or "{}"
    try:
        last = json.loads(last)
    except ValueError:
        last = {}
    return {"items": out, "counts": counts, "sync": last}


_reasons_cache = {"at": 0, "list": []}


def claim_reasons():
    if time.time() - _reasons_cache["at"] < 6 * 3600 and _reasons_cache["list"]:
        return _reasons_cache["list"]
    data = trendyol._request("/integration/order/claim-issue-reasons", None)
    lst = data if isinstance(data, list) else (data.get("content") or data.get("data") or [])
    out = [{"id": int(x.get("id")), "name": x.get("name") or "", "file": int(x.get("id")) not in NO_FILE_REASONS}
           for x in lst if isinstance(x, dict) and x.get("id") is not None]
    _reasons_cache.update(at=time.time(), list=out)
    return out


def _claim(claim_id):
    with _lock:
        r = _db().execute("SELECT * FROM ty_claims WHERE claim_id=?", (str(claim_id),)).fetchone()
    if not r:
        raise trendyol.TrendyolError("İade bulunamadı")
    d = dict(r)
    d["items"] = json.loads(d["items"] or "[]")
    return d


def _with_storefront(fn):
    """Trendyol bazı iade servislerinde storeFrontCode başlığı istiyor; önce başlıksız, gerekirse TR ile dener."""
    try:
        return fn(None)
    except trendyol.TrendyolError as e:
        if "storefront" in str(e).lower():
            return fn({"storeFrontCode": "TR"})
        raise


def approve(claim_id, item_ids, restock=False):
    c = _claim(claim_id)
    valid = {str(i["id"]) for i in c["items"] if i["status"] == "WaitingInAction"}
    ids = [str(x) for x in item_ids if str(x) in valid]
    if not ids:
        raise trendyol.TrendyolError("Onaylanacak, işlem bekleyen ürün yok")
    path = f"/integration/order/sellers/{{sid}}/claims/{claim_id}/items/approve"
    body = {"claimLineItemIdList": ids, "params": {}}
    try:
        _with_storefront(lambda h: trendyol._request(path, None, method="PUT", body=body, extra_headers=h))
    except trendyol.TrendyolError as e:
        if "(405)" not in str(e):   # belgeler PUT ve POST'u farklı yerlerde yazıyor
            raise
        _with_storefront(lambda h: trendyol._request(path, None, method="POST", body=body, extra_headers=h))
    added = 0
    if restock:
        with _lock:
            idx = _product_index()
            for it in c["items"]:
                if str(it["id"]) in ids:
                    m = idx.get((it.get("barcode") or "").lower())
                    if m:
                        _change_stock(m[0], 1, "return", ref=c["order_number"], note="İade onaylandı, stoğa geri eklendi")
                        added += 1
            _db().execute("UPDATE ty_claims SET restocked=restocked+? WHERE claim_id=?", (added, str(claim_id)))
            _db().commit()
    _refresh_one(claim_id)
    return {"approved": len(ids), "restocked": added}


def reject(claim_id, item_ids, reason_id, description, files):
    c = _claim(claim_id)
    valid = {str(i["id"]) for i in c["items"] if i["status"] == "WaitingInAction"}
    ids = [str(x) for x in item_ids if str(x) in valid]
    if not ids:
        raise trendyol.TrendyolError("Reddedilecek, işlem bekleyen ürün yok")
    reason_id = int(reason_id)
    desc = (description or "").strip()[:500]
    if reason_id not in NO_FILE_REASONS and not files:
        raise trendyol.TrendyolError("Bu gerekçe için fotoğraf ya da belge eklemek zorunlu")
    boundary = "----astera" + uuid.uuid4().hex
    body = b""
    for f in files or []:
        name = "".join(ch for ch in (f.get("name") or "dosya") if ch.isalnum() or ch in "._-")[:80] or "dosya"
        data = base64.b64decode(f.get("data") or "")
        if len(data) > 5 * 1024 * 1024:
            raise trendyol.TrendyolError(f"{name}: dosya 5 MB'tan büyük")
        ctype = f.get("type") or "application/octet-stream"
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{name}\"\r\n"
                 f"Content-Type: {ctype}\r\n\r\n").encode() + data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    params = {"claimIssueReasonId": reason_id, "claimItemIdList": ",".join(ids), "description": desc}
    _with_storefront(lambda h: trendyol._request(f"/integration/order/sellers/{{sid}}/claims/{claim_id}/issue", params, method="POST",
                                                 raw_body=body, content_type=f"multipart/form-data; boundary={boundary}", extra_headers=h))
    _refresh_one(claim_id)
    return {"rejected": len(ids)}


def _refresh_one(claim_id):
    try:
        data = trendyol._request("/integration/order/sellers/{sid}/claims", {"claimIds": str(claim_id)})
        with _lock:
            for c in data.get("content") or []:
                r = _claim_row(c)
                _db().execute("UPDATE ty_claims SET status=?, items=?, last_modified=? WHERE claim_id=?",
                              (r["status"], r["items"], r["last_modified"], r["claim_id"]))
            _db().commit()
    except trendyol.TrendyolError:
        pass


# ---------------------------------------------------------------- sorular

def sync_questions(days=14, status=None):
    with _lock:
        sid = _get("ty_seller_id", "")
    end = int(time.time() * 1000)
    start = end - min(days, 14) * 86400000 + 60000
    got, page = 0, 0
    while True:
        data = trendyol._request("/integration/qna/sellers/{sid}/questions/filter",
                                 {"supplierId": sid, "startDate": trendyol.to_ty(start), "endDate": trendyol.to_ty(end) + 600000,
                                  "page": page, "size": 50, "orderByField": "CreatedDate", "orderByDirection": "DESC",
                                  **({"status": status} if status else {})})
        content = data.get("content") or []
        with _lock:
            for q in content:
                qid = q.get("id")
                if qid is None:
                    continue
                for k, v in q.items():
                    Q_SHAPE.setdefault(k, v if isinstance(v, bool) else type(v).__name__)
                pub = q.get("public")
                pub = None if pub is None else (1 if pub else 0)
                ans = q.get("answer") or {}
                rej = q.get("rejectedAnswer") or {}
                vals = (q.get("productName"), q.get("imageUrl"), q.get("webUrl"), q.get("text"),
                        q.get("userName") if q.get("showUserName", True) else None, q.get("status"),
                        trendyol.from_ty(_ms(q.get("creationDate"))) // 1000 if q.get("creationDate") else None,
                        ans.get("text"), trendyol.from_ty(_ms(ans.get("creationDate"))) // 1000 if ans.get("creationDate") else None,
                        json.dumps({"text": rej.get("text"), "reason": rej.get("reason") or q.get("reason")}, ensure_ascii=False) if rej else None)
                if _db().execute("SELECT 1 FROM ty_questions WHERE id=?", (int(qid),)).fetchone():
                    _db().execute("""UPDATE ty_questions SET product_name=?, image_url=?, web_url=?, text=?, user_name=?, status=?, created=?,
                                     answer=?, answer_date=?, rejected=?, public=? WHERE id=?""", (*vals, pub, int(qid)))
                else:
                    _db().execute("""INSERT INTO ty_questions(product_name, image_url, web_url, text, user_name, status, created, answer,
                                     answer_date, rejected, public, id, first_seen) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""", (*vals, pub, int(qid), _now()))
                got += 1
            _db().commit()
        page += 1
        if page >= int(data.get("totalPages") or 1) or page > 20:
            break
        time.sleep(0.3)
    return got


def questions(tab="wait"):
    groups = {"wait": ("WAITING_FOR_ANSWER",), "approve": ("WAITING_FOR_APPROVE",), "done": ("ANSWERED",),
              "other": ("REJECTED", "REPORTED", "UNANSWERED")}
    counts = {k: _db().execute(f"SELECT COUNT(*) FROM ty_questions WHERE status IN ({','.join('?' * len(v))})", v).fetchone()[0]
              for k, v in groups.items()}
    sts = groups.get(tab, groups["wait"])
    rows = _db().execute(f"SELECT * FROM ty_questions WHERE status IN ({','.join('?' * len(sts))}) ORDER BY created DESC LIMIT 200", sts).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["rejected"] = json.loads(d["rejected"]) if d["rejected"] else None
        d["status_tr"] = Q_STATUS_TR.get(d["status"], d["status"])
        out.append(d)
    try:
        last = json.loads(_get("qna_sync", "") or "{}")
    except ValueError:
        last = {}
    return {"items": out, "counts": counts, "sync": last}


def answer(qid, text):
    text = (text or "").strip()
    if not 10 <= len(text) <= 2000:
        raise trendyol.TrendyolError("Cevap 10 ile 2000 karakter arasında olmalı")
    trendyol._request(f"/integration/qna/sellers/{{sid}}/questions/{int(qid)}/answers", None, method="POST", body={"text": text})
    with _lock:
        _db().execute("UPDATE ty_questions SET status='WAITING_FOR_APPROVE', answer=?, answer_date=? WHERE id=?", (text, _now(), int(qid)))
        _db().commit()
    return {"ok": True}


# ---------------------------------------------------------------- döngü

def sync_all():
    if not _busy.acquire(blocking=False):
        return {"busy": True}
    try:
        res = {}
        for key, fn in (("claims", sync_claims), ("qna", sync_questions)):
            try:
                n = fn()
                st = {"at": _now(), "n": n, "error": None}
            except trendyol.TrendyolError as e:
                st = {"at": _now(), "error": str(e)}
            except Exception as e:  # noqa
                st = {"at": _now(), "error": f"{type(e).__name__}: {e}"}
            res[key] = st
            with _lock:
                _set(f"{key}_sync" if key == "qna" else "claims_sync", json.dumps(st, ensure_ascii=False))
                _db().commit()
        return res
    finally:
        _busy.release()


def _loop():
    time.sleep(45)
    while True:
        try:
            with _lock:
                on = _get("ty_enabled", "0") == "1" and bool(_get("ty_seller_id", ""))
            if on:
                sync_all()
        except Exception as e:  # noqa
            print("İade/soru eşitleme hatası:", e)
        # arada her dakika yalnızca cevap bekleyen soruları kontrol et (yeni soru 5 dakika beklemesin)
        for _ in range(POLL_EVERY // QNA_FAST - 1):
            time.sleep(QNA_FAST)
            try:
                with _lock:
                    on = _get("ty_enabled", "0") == "1" and bool(_get("ty_seller_id", "")) and _get("qna_enabled", "1") != "0"
                if on and _busy.acquire(blocking=False):
                    try:
                        sync_questions(status="WAITING_FOR_ANSWER")
                    finally:
                        _busy.release()
            except Exception as e:  # noqa
                print("Soru kontrol hatası:", e)
        time.sleep(QNA_FAST)


def start():
    threading.Thread(target=_loop, daemon=True, name="musteri").start()
