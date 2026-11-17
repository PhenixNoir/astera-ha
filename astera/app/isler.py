"""Yapılacaklar: baskı ve sipariş dışındaki işler (dükkan, alışveriş, müşteri, makine, ofis).

Bir iş bir siparişe, özel siparişe ya da ürüne bağlanabilir. Tekrarlayan iş (her gün / her hafta X günü / her ayın N'i)
işaretlenince kapanmaz; bir sonraki tarihe kurulur ve geçmişe "yapıldı" kaydı düşer.
"""
import datetime
import re
import time

CATS = ("dukkan", "alis", "mus", "mak", "ofis", "diger")
LINKS = ("ty", "co", "p", "")
_db = None


def init(db):
    global _db
    _db = db


def migrate(c):
    c.execute("""CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, cat TEXT DEFAULT 'diger', due TEXT,
        rep TEXT, link_kind TEXT, link_id TEXT, link_label TEXT, done_at INTEGER, last_done INTEGER,
        created_at INTEGER, updated_at INTEGER)""")


def _now():
    return int(time.time())


def _clean(b, partial=False):
    out = {}
    if "text" in b or not partial:
        t = re.sub(r"\s+", " ", str(b.get("text") or "")).strip()[:200]
        if not t:
            raise ValueError("Yapılacak iş boş olamaz")
        out["text"] = t
    if "cat" in b or not partial:
        out["cat"] = b.get("cat") if b.get("cat") in CATS else "diger"
    if "due" in b or not partial:
        d = str(b.get("due") or "").strip()
        if d and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
            raise ValueError("Tarih biçimi geçersiz")
        out["due"] = d or None
    if "rep" in b or not partial:
        r = str(b.get("rep") or "")
        out["rep"] = r if re.fullmatch(r"(daily|weekly:[0-6]|monthly:([1-9]|[12]\d|3[01]))?", r) else ""
    if "link_kind" in b:
        k = b.get("link_kind") or ""
        out["link_kind"] = k if k in LINKS else ""
        out["link_id"] = str(b.get("link_id") or "")[:40] or None
        out["link_label"] = str(b.get("link_label") or "")[:80] or None
    return out


def _next_due(rep, base):
    """Tekrarlayan işin bir sonraki tarihi (base: bugün ya da eski tarih, hangisi geçse)."""
    d = max(base, datetime.date.today())
    if rep == "daily":
        return d + datetime.timedelta(days=1)
    if rep.startswith("weekly:"):
        wd = int(rep.split(":")[1])           # 0 = pazartesi
        step = (wd - d.weekday()) % 7 or 7
        return d + datetime.timedelta(days=step)
    if rep.startswith("monthly:"):
        day = int(rep.split(":")[1])
        y, m = (d.year, d.month + 1) if d.day >= day else (d.year, d.month)
        if m > 12:
            y, m = y + 1, 1
        import calendar
        return datetime.date(y, m, min(day, calendar.monthrange(y, m)[1]))
    return None


def first_due(rep):
    """Yeni tekrarlayan işin ilk tarihi: bugün uyuyorsa bugün."""
    t = datetime.date.today()
    if rep == "daily":
        return t
    if rep.startswith("weekly:") and t.weekday() == int(rep.split(":")[1]):
        return t
    if rep.startswith("monthly:") and t.day == int(rep.split(":")[1]):
        return t
    return _next_due(rep, t - datetime.timedelta(days=1)) if rep else None


def items():
    """Açık işler + son 2 günde biten (geri alınabilsin diye)."""
    rows = _db().execute("SELECT * FROM todos WHERE done_at IS NULL OR done_at>? ORDER BY done_at IS NOT NULL, "
                         "CASE WHEN due IS NULL THEN 1 ELSE 0 END, due, id DESC", (_now() - 2 * 86400,)).fetchall()
    return [dict(r) for r in rows]


def create(b):
    d = _clean(b)
    if d["rep"] and not d["due"]:
        d["due"] = first_due(d["rep"]).isoformat()
    t = _now()
    cols = list(d) + ["created_at", "updated_at"]
    cur = _db().execute(f"INSERT INTO todos({','.join(cols)}) VALUES({','.join('?' * len(cols))})", list(d.values()) + [t, t])
    return get(cur.lastrowid)


def get(tid):
    r = _db().execute("SELECT * FROM todos WHERE id=?", (tid,)).fetchone()
    if not r:
        raise LookupError("İş bulunamadı")
    return dict(r)


def update(tid, b):
    cur = get(tid)
    d = _clean(b, partial=True)
    if "done" in b:
        if b["done"] and not cur["done_at"]:
            if (d.get("rep", cur["rep"]) or ""):
                # tekrarlayan: kapanmaz, sonraki tarihe kurulur
                base = datetime.date.fromisoformat(cur["due"]) if cur["due"] else datetime.date.today()
                d["due"] = _next_due(d.get("rep", cur["rep"]), base).isoformat()
                d["last_done"] = _now()
            else:
                d["done_at"] = _now()
        elif not b["done"]:
            d["done_at"] = None
    if d.get("rep") and not (d.get("due") or cur["due"]):
        d["due"] = first_due(d["rep"]).isoformat()
    if d:
        _db().execute(f"UPDATE todos SET {', '.join(k + '=?' for k in d)}, updated_at=? WHERE id=?", list(d.values()) + [_now(), tid])
    return get(tid)


def delete(tid):
    _db().execute("DELETE FROM todos WHERE id=?", (tid,))
    return {"ok": True}


def due_now():
    """Bildirim için: tarihi bugün ya da geçmiş açık işler."""
    today = datetime.date.today().isoformat()
    return [dict(r) for r in _db().execute("SELECT id, text, due, cat FROM todos WHERE done_at IS NULL AND due IS NOT NULL AND due<=?", (today,))]
