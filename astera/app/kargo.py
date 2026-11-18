"""Özel siparişlerde kargo takibi (Geliver).

Geliver panelinden alınan API anahtarı Ayarlar'a girilir (tarayıcıya hiç geri gönderilmez). 30 dakikada bir,
takip numarası girilmiş ve henüz teslim edilmemiş özel siparişlerin durumu Geliver'den okunur:
  - sipariş önce Geliver gönderi kimliğiyle (ship_id), yoksa son gönderiler listesinde takip no / barkod eşleşmesiyle bulunur,
  - durum değişince kayıt tutulur (kartta adım adım çizelge),
  - TESLİM EDİLDİ gelince sipariş kendiliğinden ilk "teslim" türündeki aşamaya taşınır ve bildirim gelir.
"""
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import asama

_db = _lock = _get = _set = None
BASE = os.environ.get("ATOLYE_GELIVER_BASE") or "https://api.geliver.io/api/v1"   # test için değiştirilebilir
EVERY = 30 * 60
STEP = {"CREATED": 0, "GOT_OFFERS": 0, "OFFER_ACCEPTED": 0, "TRACKING_CODE_CREATED": 0, "LABEL_PRINTED": 0,
        "SHIPPED": 1, "DELIVERED": 3, "RETURNED": -1, "RETURN_SHIPPED": -1, "CANCELED": -1, "FAILED": -1}
STATUS_TR = {"CREATED": "Oluşturuldu", "GOT_OFFERS": "Teklif alındı", "OFFER_ACCEPTED": "Teklif kabul edildi",
             "TRACKING_CODE_CREATED": "Takip kodu oluştu", "LABEL_PRINTED": "Etiket basıldı", "SHIPPED": "Yolda",
             "DELIVERED": "Teslim edildi", "RETURNED": "İade edildi", "RETURN_SHIPPED": "İade yolda", "CANCELED": "İptal", "FAILED": "Başarısız"}
_state = {"busy": False, "error": "", "at": 0}


def init(db, lock, get_setting, set_setting):
    global _db, _lock, _get, _set
    _db, _lock, _get, _set = db, lock, get_setting, set_setting


def migrate(c):
    cols = {r[1] for r in c.execute("PRAGMA table_info(custom_orders)")}
    for col, typ in (("ship_id", "TEXT"), ("ship_status", "TEXT"), ("ship_detail", "TEXT"), ("ship_at", "INTEGER"),
                     ("ship_url", "TEXT"), ("ship_step", "INTEGER")):
        if col not in cols:
            c.execute(f"ALTER TABLE custom_orders ADD COLUMN {col} {typ}")
    c.execute("""CREATE TABLE IF NOT EXISTS ship_log (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, at INTEGER,
                 code TEXT, step INTEGER, detail TEXT, location TEXT)""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_ship_log ON ship_log(order_id, at)")


def _now():
    return int(time.time())


def _token():
    with _lock:
        return (_get("geliver_token", "") or "").strip()


def _call(path, params=None, timeout=15):
    tok = _token()
    if not tok:
        raise RuntimeError("Geliver API anahtarı girilmemiş")
    url = BASE + path + (("?" + urllib.parse.urlencode(params)) if params else "")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = json.loads(r.read().decode("utf-8", "replace") or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError({401: "Geliver: API anahtarı geçersiz", 403: "Geliver: erişim reddedildi",
                            404: "Geliver: kayıt bulunamadı"}.get(e.code, f"Geliver: HTTP {e.code}")) from None
    except (urllib.error.URLError, OSError) as e:
        raise RuntimeError(f"Geliver'e ulaşılamadı ({getattr(e, 'reason', e)})") from None
    except ValueError:
        raise RuntimeError("Geliver: yanıt okunamadı") from None
    return body.get("data", body) if isinstance(body, dict) else body


def _list(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("items", "list", "shipments", "content", "data", "results"):
            if isinstance(data.get(k), list):
                return data[k]
    return []


def _norm(v):
    return re.sub(r"[^0-9A-Za-z]", "", str(v or "")).upper()


def _name(s):
    for k in ("recipientAddress", "recipient", "toAddress", "receiver"):
        a = s.get(k)
        if isinstance(a, dict) and (a.get("name") or a.get("fullName")):
            return a.get("name") or a.get("fullName")
    return s.get("recipientName") or ""


def _view(s):
    tr = s.get("trackingStatus") if isinstance(s.get("trackingStatus"), dict) else {}
    code = str(s.get("statusCode") or "").upper()
    detail = tr.get("statusDetails") or tr.get("trackingStatusCode") or ""
    step = STEP.get(code, 0)
    if step == 1 and re.search(r"da[ğg][ıi]t[ıi]m|kurye|out.?for.?delivery", str(detail), re.I):
        step = 2
    return {"id": s.get("id"), "tracking": s.get("trackingNumber") or "", "barcode": s.get("barcode") or "", "code": code,
            "status": STATUS_TR.get(code, code.title()), "detail": str(detail)[:200], "location": str(tr.get("locationName") or "")[:80],
            "at": tr.get("statusDate") or tr.get("updatedAt") or s.get("updatedAt") or "", "url": s.get("trackingUrl") or "",
            "provider": s.get("providerCode") or "", "name": _name(s), "step": step,
            "created": s.get("createdAt") or s.get("shipmentDate") or ""}


def recent(limit=50):
    """Son gönderiler (sipariş düzenleyicide "Geliver'den seç")."""
    return [_view(s) for s in _list(_call("/shipments", {"limit": limit, "page": 1}))]


def _apply(oid, v, name):
    """Bir siparişin takip durumunu yazar; değişmişse kayıt ekler, teslimde aşamayı ilerletir. Dönüş: teslim oldu mu."""
    cur = _db().execute("SELECT ship_status, ship_detail, stage, status FROM custom_orders WHERE id=?", (oid,)).fetchone()
    if not cur:
        return False
    changed = (cur["ship_status"], cur["ship_detail"] or "") != (v["code"], v["detail"])
    _db().execute("UPDATE custom_orders SET ship_id=COALESCE(?, ship_id), ship_status=?, ship_detail=?, ship_at=?, ship_url=COALESCE(NULLIF(?,''), ship_url), ship_step=? WHERE id=?",
                  (v["id"], v["code"], v["detail"], _now(), v["url"], v["step"], oid))
    if changed:
        _db().execute("INSERT INTO ship_log(order_id, at, code, step, detail, location) VALUES(?,?,?,?,?,?)",
                      (oid, _now(), v["code"], v["step"], v["detail"], v["location"]))
    busy = _db().execute("SELECT 1 FROM print_jobs WHERE order_id=? AND status='printing'", (oid,)).fetchone()
    if v["code"] == "DELIVERED" and cur["status"] not in ("delivered", "cancelled") and not busy:
        fl = asama.flow()
        key = next((s["key"] for s in fl["stages"] if s["kind"] == "delivered"), None)
        if key:
            asama.move(oid, key, "Geliver: kargo teslim edildi", auto=True)
            return True
    return False


def run(force=False):
    if _state["busy"] or not _token():
        return {"skipped": True}
    if not force and _now() - _state["at"] < EVERY:
        return {"skipped": True}
    with _lock:
        rows = [dict(r) for r in _db().execute("""SELECT id, first_name, last_name, tracking_no, ship_id FROM custom_orders
                                                  WHERE delivery_method='kargo' AND COALESCE(tracking_no,'')<>''
                                                    AND status NOT IN ('delivered','cancelled')""")]
    _state.update(busy=True, at=_now())
    done, err, n = [], "", 0
    try:
        listed = None
        for o in rows:
            v = None
            try:
                if o["ship_id"]:
                    v = _view(_call(f"/shipments/{urllib.parse.quote(str(o['ship_id']))}"))
                else:
                    if listed is None:
                        listed = recent(100)
                    t = _norm(o["tracking_no"])
                    v = next((x for x in listed if t and t in (_norm(x["tracking"]), _norm(x["barcode"]))), None)
            except RuntimeError as e:
                err = str(e)
                if "anahtar" in err:
                    break
                continue
            if v:
                n += 1
                with _lock:
                    if _apply(o["id"], v, o):
                        done.append({"id": o["id"], "name": f"{o['first_name'] or ''} {o['last_name'] or ''}".strip()})
                    _db().commit()
    finally:
        _state.update(busy=False, error=err)
    return {"checked": len(rows), "matched": n, "delivered": done, "error": err or None}


def log(oid):
    return [dict(r) for r in _db().execute("SELECT at, code, step, detail, location FROM ship_log WHERE order_id=? ORDER BY at", (oid,))]


def link(oid, ship):
    """Geliver'den seçilen gönderiyi siparişe bağlar."""
    with _lock:
        _db().execute("UPDATE custom_orders SET ship_id=?, tracking_no=COALESCE(NULLIF(?,''), tracking_no), delivery_method='kargo', "
                      "cargo_company=COALESCE(NULLIF(?,''), cargo_company) WHERE id=?",
                      (ship.get("id"), ship.get("tracking") or ship.get("barcode") or "", ship.get("provider") or "", oid))


def status():
    return {"set": bool(_token()), "busy": _state["busy"], "error": _state["error"], "at": _state["at"]}


def _loop():
    time.sleep(120)
    while True:
        try:
            run()
        except Exception as e:  # noqa
            print("Kargo takip hatası:", e)
        time.sleep(300)


def start():
    threading.Thread(target=_loop, daemon=True, name="kargo").start()
