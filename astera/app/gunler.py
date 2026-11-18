"""Özel günler takvimi: Öğretmenler Günü, Black Friday, yılbaşı, Sevgililer Günü… Ürünler günlere bağlanır;
hazırlık penceresi (varsayılan 21 gün) açılınca panoda öne çıkar ve bildirim gelir. Geçen yıl aynı dönemde bağlı
ürünlerden kaç tane satıldığı Trendyol sipariş geçmişinden hesaplanır (geçmiş ne kadar eskiyse o kadar dolu)."""
import calendar
import datetime as dt
import json
import re

_db = _get = None

DEFAULTS = [
    # id, ad, simge, kural, anahtar sözcükler (ürün önerisi için)
    ("yilbasi", "Yılbaşı", "🎄", "01-01", ["yılbaşı", "yilbasi", "noel", "kar tanesi", "geyik", "christmas", "yeni yıl"]),
    ("sevgililer", "Sevgililer Günü", "❤️", "02-14", ["kalp", "aşk", "sevgili", "love", "çift"]),
    ("kadinlar", "Kadınlar Günü", "💐", "03-08", ["kadın"]),
    ("anneler", "Anneler Günü", "🌷", "sun:5:2", ["anne", "mom"]),
    ("babalar", "Babalar Günü", "👔", "sun:6:3", ["baba", "dad"]),
    ("okul", "Okullar açılıyor", "🎒", "mon:9:2", ["okul", "kalem", "kalemlik", "ayraç", "kitap"]),
    ("ogretmenler", "Öğretmenler Günü", "🍎", "11-24", ["öğretmen", "ogretmen"]),
    ("blackfriday", "Black Friday", "🛍️", "bf", []),
]


def init(db, get_setting):
    global _db, _get
    _db, _get = db, get_setting


def migrate(c):
    c.execute("CREATE TABLE IF NOT EXISTS day_products (day_id TEXT, product_id INTEGER, PRIMARY KEY(day_id, product_id))")


def _nth_weekday(y, m, wd, n):
    """Ayın n'inci haftanın günü (wd: 0=Pzt)."""
    first = dt.date(y, m, 1)
    d = first + dt.timedelta(days=(wd - first.weekday()) % 7)
    return d + dt.timedelta(weeks=n - 1)


def date_for(rule, y):
    if rule == "bf":   # Kasım'ın 4. perşembesinden sonraki cuma
        return _nth_weekday(y, 11, 3, 4) + dt.timedelta(days=1)
    m = re.fullmatch(r"(sun|mon):(\d+):(\d)", rule)
    if m:
        return _nth_weekday(y, int(m.group(2)), 6 if m.group(1) == "sun" else 0, int(m.group(3)))
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", rule):
        d = dt.date.fromisoformat(rule)
        return d if d.year == y else None
    mm, dd = (int(x) for x in rule.split("-"))
    dd = min(dd, calendar.monthrange(y, mm)[1])
    return dt.date(y, mm, dd)


def _js(k, default):
    try:
        v = json.loads(_get(k, "") or "null")
    except ValueError:
        v = None
    return v if isinstance(v, type(default)) else default


def all_days():
    out = [{"id": i, "name": n, "icon": ic, "rule": r, "kw": kw, "custom": False} for i, n, ic, r, kw in DEFAULTS]
    for c in _js("days_custom", []):
        out.append({"id": c["id"], "name": c["name"], "icon": c.get("icon") or "📅", "rule": c["date"], "kw": [], "custom": True})
    return out


def _sold(pids, a, b):
    """[a, b) tarihleri arasında (date) bu ürünlerden satılan adet (Trendyol, iptal hariç)."""
    if not pids:
        return 0
    ta = int(dt.datetime.combine(a, dt.time()).timestamp() * 1000)
    tb = int(dt.datetime.combine(b, dt.time()).timestamp() * 1000)
    r = _db().execute(f"""SELECT COALESCE(SUM(quantity),0) FROM ty_lines WHERE product_id IN ({','.join('?' * len(pids))})
                          AND order_date>=? AND order_date<? AND COALESCE(state,'')<>'cancelled'""", list(pids) + [ta, tb]).fetchone()
    return int(r[0] or 0)


def upcoming(limit=8, today=None):
    today = today or dt.date.today()
    off = set(_js("days_off", []))
    lead = int(_get("days_lead", "21") or 21)
    links = {}
    for r in _db().execute("SELECT day_id, product_id FROM day_products"):
        links.setdefault(r["day_id"], []).append(r["product_id"])
    prods = {r["id"]: dict(r) for r in _db().execute("SELECT id, name, stock, min_stock, thumbnail, category FROM products WHERE archived=0")}
    out = []
    for d in all_days():
        when = None
        for y in (today.year, today.year + 1):
            x = date_for(d["rule"], y)
            if x and x >= today:
                when = x
                break
        if not when:
            continue
        left = (when - today).days
        pids = [p for p in links.get(d["id"], []) if p in prods]
        prev = date_for(d["rule"], when.year - 1) if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d["rule"]) else None
        last = _sold(pids, prev - dt.timedelta(days=lead), prev + dt.timedelta(days=1)) if prev else 0
        per = {}
        if prev:
            for p in pids:
                per[p] = _sold([p], prev - dt.timedelta(days=lead), prev + dt.timedelta(days=1))
        items = []
        for p in pids:
            x = prods[p]
            want = max(per.get(p, 0), x["min_stock"] or 0)
            items.append({"id": p, "name": x["name"], "stock": x["stock"], "thumbnail": x["thumbnail"], "last_year": per.get(p, 0),
                          "suggest": max(0, int(round(want * 1.2)) - (x["stock"] or 0)) if want else 0})
        kw = d["kw"]
        sug = [] if pids or not kw else [{"id": x["id"], "name": x["name"]} for x in prods.values()
                                         if any(k in (x["name"] or "").lower() or k in (x["category"] or "").lower() for k in kw)][:12]
        out.append({"id": d["id"], "name": d["name"], "icon": d["icon"], "date": when.isoformat(), "days_left": left, "lead": lead,
                    "prep": left <= lead, "hidden": d["id"] in off, "custom": d["custom"], "products": items, "last_year": last,
                    "suggested": sug, "rule": d["rule"]})
    out.sort(key=lambda x: x["days_left"])
    return out


def set_products(day_id, ids):
    _db().execute("DELETE FROM day_products WHERE day_id=?", (day_id,))
    for p in ids or []:
        _db().execute("INSERT OR IGNORE INTO day_products(day_id, product_id) VALUES(?,?)", (day_id, int(p)))


def next_one():
    """Sabah özeti için: hazırlık penceresindeki en yakın gün."""
    for d in upcoming():
        if not d["hidden"] and d["prep"]:
            return d
    return None
