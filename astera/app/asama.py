"""Özel sipariş aşamaları: kullanıcının tanımladığı akış, otomatik geçişler, etiketler ve aşama geçmişi.

Her aşama dört temel türden birine bağlıdır ("Ne demek"): new (bekliyor), printing (üretimde), ready (hazır),
delivered (kapandı). Siparişin `status` alanı her zaman aşamasının türüdür; plan, finans ve baskı bağlantıları
bu alanla çalışmaya devam eder. Görünen aşama `stage` alanındadır. İptal sabit bir aşamadır (cancelled).
"""
import json
import re
import secrets
import time

KINDS = ("new", "printing", "ready", "delivered")
COLORS = ("gray", "acc", "yel", "ok", "teal", "blue", "pur", "pink", "bad")
ASKS = ("", "delivery", "payment", "note")
DELIVERY = ("kargo", "elden", "kurye", "diger")
CANCEL = {"key": "cancelled", "name": "İptal", "color": "bad", "icon": "✕", "kind": "cancelled"}
DEFAULT = {
    "stages": [
        {"key": "new", "name": "Yeni", "color": "gray", "icon": "📥", "kind": "new"},
        {"key": "printing", "name": "Baskıda", "color": "blue", "icon": "🖨️", "kind": "printing"},
        {"key": "ready", "name": "Hazır", "color": "ok", "icon": "✅", "kind": "ready"},
        {"key": "delivered", "name": "Teslim edildi", "color": "teal", "icon": "📦", "kind": "delivered", "ask": "delivery"},
    ],
    "print_start": "printing", "print_done": "ready", "tags": [],
}

_db = _get = _set = None
_cache = (None, None)


def init(db, get_setting, set_setting):
    global _db, _get, _set
    _db, _get, _set = db, get_setting, set_setting


def _now():
    return int(time.time())


def migrate(c):
    cols = {r[1] for r in c.execute("PRAGMA table_info(custom_orders)")}
    for col, typ in (("stage", "TEXT"), ("stage_at", "INTEGER"), ("tags", "TEXT"), ("delivery_method", "TEXT"),
                     ("cargo_company", "TEXT"), ("tracking_no", "TEXT")):
        if col not in cols:
            c.execute(f"ALTER TABLE custom_orders ADD COLUMN {col} {typ}")
    c.execute("""CREATE TABLE IF NOT EXISTS custom_order_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, stage TEXT, name TEXT,
        at INTEGER NOT NULL, note TEXT, auto INTEGER DEFAULT 0)""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_colog ON custom_order_log(order_id, at)")


# ---------------------------------------------------------------- akış (ayar)

def _int(v, lo, hi):
    try:
        v = int(float(v))
    except (TypeError, ValueError):
        return None
    return max(lo, min(hi, v)) if v else None


def _clean_stage(s, keys):
    k = str(s.get("key") or "")
    if not re.fullmatch(r"[a-z0-9_]{1,24}", k) or k in keys or k == "cancelled":
        k = "s" + secrets.token_hex(3)
    name = re.sub(r"\s+", " ", str(s.get("name") or "")).strip()[:40] or "Aşama"
    kind = s.get("kind") if s.get("kind") in KINDS else "new"
    return {"key": k, "name": name, "color": s.get("color") if s.get("color") in COLORS else "gray",
            "icon": str(s.get("icon") or "")[:4] or "⭐", "kind": kind,
            "warn_days": _int(s.get("warn_days"), 1, 365), "ask": s.get("ask") if s.get("ask") in ASKS else "",
            "auto_paid": str(s.get("auto_paid") or ""), "auto_days": _int(s.get("auto_days"), 1, 365),
            "auto_days_to": str(s.get("auto_days_to") or "")}


def _clean_tags(tags):
    out, seen = [], set()
    for t in tags or []:
        if isinstance(t, str):
            t = {"name": t}
        n = re.sub(r"\s+", " ", str(t.get("name") or "")).strip()[:30]
        if not n or n.lower() in seen:
            continue
        seen.add(n.lower())
        out.append({"name": n, "color": t.get("color") if t.get("color") in COLORS else "pink", "tab": bool(t.get("tab"))})
    return out


def _finish(fl):
    """Kural hedeflerini ve baskı kurallarını geçerli aşamalara bağlar."""
    st = fl["stages"]
    keys = {s["key"] for s in st}
    for s in st:
        if s["auto_paid"] not in keys or s["auto_paid"] == s["key"]:
            s["auto_paid"] = ""
        if s["auto_days_to"] not in keys or s["auto_days_to"] == s["key"]:
            s["auto_days_to"], s["auto_days"] = "", None
        if not s["auto_days"]:
            s["auto_days_to"] = ""
    by = {s["key"]: s for s in st}
    for f, kind in (("print_start", "printing"), ("print_done", "ready")):
        if by.get(fl.get(f), {}).get("kind") != kind:
            fl[f] = next(s["key"] for s in st if s["kind"] == kind)
    return fl


def _normalize(raw):
    keys, st = set(), []
    for s in (raw.get("stages") or []):
        c = _clean_stage(s, keys)
        keys.add(c["key"])
        st.append(c)
    have = {s["kind"] for s in st}
    if not st or any(k not in have for k in KINDS):
        return _normalize(DEFAULT) if raw is not DEFAULT else None
    return _finish({"stages": st, "print_start": raw.get("print_start"), "print_done": raw.get("print_done"),
                    "tags": _clean_tags(raw.get("tags"))})


def flow():
    global _cache
    raw = _get("order_flow")
    if _cache[0] == raw and _cache[1]:
        return _cache[1]
    try:
        fl = _normalize(json.loads(raw)) if raw else None
    except (ValueError, TypeError, AttributeError):
        fl = None
    fl = fl or _normalize(DEFAULT)
    _cache = (raw, fl)
    return fl


def stage_map(fl=None):
    fl = fl or flow()
    m = {s["key"]: s for s in fl["stages"]}
    m["cancelled"] = CANCEL
    return m


def _first(fl, kind):
    return next(s["key"] for s in fl["stages"] if s["kind"] == kind)


def target_for(fl, status, cur):
    """Sistem durumu değişti: siparişin olması gereken aşaması. Aşaması zaten o türdense yerinde kalır."""
    m = stage_map(fl)
    if status == "cancelled":
        return "cancelled"
    if status not in KINDS:
        status = "new"
    if cur in m and m[cur]["kind"] == status:
        return cur
    if status == "printing":
        return fl["print_start"]
    if status == "ready":
        return fl["print_done"]
    return _first(fl, status)


def save_flow(body):
    """Akışı kaydeder. Silinen aşamalardaki siparişler body.moves[key] (yoksa aynı türün ilk aşaması) aşamasına taşınır."""
    old = flow()
    if not isinstance(body, dict) or not isinstance(body.get("stages"), list) or not body["stages"]:
        raise ValueError("Aşama listesi boş olamaz")
    keys, st = set(), []
    for s in body["stages"][:30]:
        c = _clean_stage(s, keys)
        keys.add(c["key"])
        st.append(c)
    missing = [k for k in KINDS if k not in {s["kind"] for s in st}]
    if missing:
        names = {"new": "Bekliyor", "printing": "Üretimde", "ready": "Hazır", "delivered": "Kapandı"}
        raise ValueError("Her türden en az bir aşama gerekli. Eksik: " + ", ".join(names[k] for k in missing))
    old_tags = {t["name"] for t in old["tags"]}
    fl = _finish({"stages": st, "print_start": body.get("print_start"), "print_done": body.get("print_done"),
                  "tags": _clean_tags(body.get("tags"))})
    new_m = stage_map(fl)
    moves = body.get("moves") if isinstance(body.get("moves"), dict) else {}
    t = _now()
    for s in old["stages"]:
        if s["key"] in new_m:
            # türü değiştiyse durumunu da güncelle
            if new_m[s["key"]]["kind"] != s["kind"]:
                _db().execute("UPDATE custom_orders SET status=? WHERE stage=? AND status<>'cancelled'", (new_m[s["key"]]["kind"], s["key"]))
            continue
        to = moves.get(s["key"])
        if to not in new_m or to == "cancelled":
            to = _first(fl, s["kind"])
        for r in _db().execute("SELECT id FROM custom_orders WHERE stage=?", (s["key"],)).fetchall():
            _db().execute("UPDATE custom_orders SET stage=?, status=?, stage_at=?, updated_at=? WHERE id=?",
                          (to, new_m[to]["kind"], t, t, r["id"]))
            _log(r["id"], to, new_m[to]["name"], f"“{s['name']}” aşaması silindi", True, t)
    # adı değişen ya da silinen etiketler
    ren = body.get("tag_renames") if isinstance(body.get("tag_renames"), dict) else {}
    keep = {x["name"] for x in fl["tags"]}
    if old_tags - keep or ren:
        for r in _db().execute("SELECT id, tags FROM custom_orders WHERE tags IS NOT NULL AND tags<>'[]'").fetchall():
            cur = _tags(r["tags"])
            nw = []
            for x in cur:
                x = ren.get(x, x)
                if x in keep and x not in nw:
                    nw.append(x)
            if nw != cur:
                _db().execute("UPDATE custom_orders SET tags=? WHERE id=?", (json.dumps(nw, ensure_ascii=False), r["id"]))
    _set("order_flow", json.dumps(fl, ensure_ascii=False))
    return flow()


def add_tag(name, color=None):
    fl = flow()
    n = re.sub(r"\s+", " ", str(name or "")).strip()[:30]
    if not n:
        raise ValueError("Etiket adı boş olamaz")
    if any(t["name"].lower() == n.lower() for t in fl["tags"]):
        return next(t for t in fl["tags"] if t["name"].lower() == n.lower())
    tag = {"name": n, "color": color if color in COLORS else COLORS[(len(fl["tags"]) * 3 + 7) % len(COLORS)], "tab": False}
    raw = dict(fl, tags=fl["tags"] + [tag])
    _set("order_flow", json.dumps(raw, ensure_ascii=False))
    return tag


def _tags(v):
    try:
        x = json.loads(v or "[]")
        return [str(t) for t in x] if isinstance(x, list) else []
    except ValueError:
        return []


def clean_tags(v):
    if isinstance(v, str):
        v = _tags(v)
    out = []
    for t in v or []:
        t = re.sub(r"\s+", " ", str(t)).strip()[:30]
        if t and t not in out:
            out.append(t)
    return json.dumps(out, ensure_ascii=False)


# ---------------------------------------------------------------- geçişler

def _log(oid, key, name, note=None, auto=False, at=None):
    _db().execute("INSERT INTO custom_order_log(order_id,stage,name,at,note,auto) VALUES(?,?,?,?,?,?)",
                  (oid, key, name, at or _now(), (note or None) and str(note)[:300], 1 if auto else 0))


def move(oid, key, note=None, auto=False):
    """Siparişi aşamaya taşır; durumu aşamanın türü olur. Aynı aşamadaysa bir şey yapmaz."""
    m = stage_map()
    if key not in m:
        raise ValueError("Böyle bir aşama yok")
    o = _db().execute("SELECT stage, status FROM custom_orders WHERE id=?", (oid,)).fetchone()
    if not o or o["stage"] == key:
        return False
    t = _now()
    _db().execute("UPDATE custom_orders SET stage=?, status=?, stage_at=?, updated_at=? WHERE id=?", (key, m[key]["kind"], t, t, oid))
    _log(oid, key, m[key]["name"], note, auto, t)
    return True


def sync(oid, note=None):
    """Sistem durumu değişti (baskı başladı/bitti): aşamayı türüne uydurur — otomatik geçiş."""
    o = _db().execute("SELECT stage, status FROM custom_orders WHERE id=?", (oid,)).fetchone()
    if not o:
        return
    fl = flow()
    to = target_for(fl, o["status"], o["stage"])
    if to != o["stage"]:
        m = stage_map(fl)
        t = _now()
        _db().execute("UPDATE custom_orders SET stage=?, stage_at=? WHERE id=?", (to, t, oid))
        _log(oid, to, m[to]["name"], note or {"printing": "Baskı başladı", "ready": "Baskı tamamlandı"}.get(o["status"]), True, t)


def normalize_all():
    """Aşaması boş ya da silinmiş siparişleri durumlarına göre yerleştirir (ilk açılış, eski kayıtlar)."""
    fl = flow()
    for r in _db().execute("SELECT id, stage, status, stage_at, updated_at, created_at FROM custom_orders").fetchall():
        to = target_for(fl, r["status"], r["stage"])   # sistem durumu esas: aşama ona uyar
        if to != r["stage"] or not r["stage_at"]:
            _db().execute("UPDATE custom_orders SET stage=?, stage_at=COALESCE(stage_at,?) WHERE id=?",
                          (to, r["updated_at"] or r["created_at"] or _now(), r["id"]))


def apply_rules():
    """Ödeme tamamlanınca / N gün sonra kuralları. Zincirleme kurallar en çok 4 adım ilerler."""
    m = stage_map()
    t = _now()
    moved = 0
    for r in _db().execute("SELECT id FROM custom_orders WHERE status<>'cancelled'").fetchall():
        for _ in range(4):
            o = _db().execute("SELECT stage, stage_at, price, paid FROM custom_orders WHERE id=?", (r["id"],)).fetchone()
            s = m.get(o["stage"])
            if not s or s["key"] == "cancelled":
                break
            if s.get("auto_paid") and (o["price"] or 0) > 0 and (o["paid"] or 0) >= (o["price"] or 0) - 0.005:
                move(r["id"], s["auto_paid"], "Ödeme tamamlandı", True)
            elif s.get("auto_days") and s.get("auto_days_to") and (o["stage_at"] or t) + s["auto_days"] * 86400 <= t:
                move(r["id"], s["auto_days_to"], f"{s['auto_days']} gün doldu", True)
            else:
                break
            moved += 1
    return moved


# ---------------------------------------------------------------- geçmiş ve istatistik

def histories(ids=None):
    q = "SELECT order_id, stage, name, at, note, auto FROM custom_order_log"
    rows = _db().execute(q + " ORDER BY at, id").fetchall() if ids is None else \
        _db().execute(q + f" WHERE order_id IN ({','.join('?' * len(ids))}) ORDER BY at, id", list(ids)).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["order_id"], []).append({"stage": r["stage"], "name": r["name"], "at": r["at"], "note": r["note"], "auto": bool(r["auto"])})
    return out


def stats():
    """Her aşamada ortalama kaç gün kalınıyor (kapanmış geçişlerden)."""
    acc = {}
    for hist in histories().values():
        for a, b in zip(hist, hist[1:]):
            d = max(0, b["at"] - a["at"]) / 86400
            x = acc.setdefault(a["stage"], [0.0, 0])
            x[0] += d
            x[1] += 1
    return {k: {"avg_days": round(v[0] / v[1], 1), "n": v[1]} for k, v in acc.items() if v[1]}


def decorate(d, hist=None):
    d["tags"] = _tags(d.get("tags"))
    if hist is not None:
        d["history"] = hist.get(d["id"], [])
    return d
