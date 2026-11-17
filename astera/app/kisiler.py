"""Müşteri kartı: bir kişinin Trendyol siparişleri, özel siparişleri, iadeleri ve soruları tek yerde.

Kimlik:
  Trendyol  → "ty:<müşteri no>" (yoksa ad + şehir: "tn:ad|şehir")
  Özel      → telefon varsa "ph:<son 10 hane>", yoksa "cn:ad soyad"
Farklı kanallardaki aynı kişi kendiliğinden birleşmez (Trendyol telefonu gizler); aynı adı görünce öneri çıkar,
kullanıcı "Birleştir" derse cust_merge tablosuna yazılır. Not ve etiketler birleşik kimliğe (kanonik anahtar) bağlıdır.
"""
import json
import re
import time

import trendyol

_db = None


def init(db):
    global _db
    _db = db


def migrate(c):
    c.execute("CREATE TABLE IF NOT EXISTS cust_meta (key TEXT PRIMARY KEY, note TEXT, tags TEXT, updated_at INTEGER)")
    c.execute("CREATE TABLE IF NOT EXISTS cust_merge (key TEXT PRIMARY KEY, into_key TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS cust_nolink (a TEXT, b TEXT, PRIMARY KEY (a, b))")


def norm(s):
    return trendyol._norm_name(s)


def _phone(p):
    d = re.sub(r"\D", "", str(p or ""))
    return d[-10:] if len(d) >= 10 else ""


def _ts(v):
    """Tarihleri saniyeye çevirir: Trendyol ms, özel sipariş YYYY-AA-GG."""
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return int(v / 1000) if v > 1e11 else int(v)
    try:
        return int(time.mktime(time.strptime(str(v)[:10], "%Y-%m-%d")))
    except ValueError:
        return 0


def _merges():
    return {r["key"]: r["into_key"] for r in _db().execute("SELECT key, into_key FROM cust_merge")}


def canon(key, merges=None):
    m = merges if merges is not None else _merges()
    seen = 0
    while key in m and seen < 20:
        key, seen = m[key], seen + 1
    return key


def _raw():
    """Tüm kayıtları kimlikleriyle toplar: [(raw_key, kind, kayıt)]."""
    cancel = tuple(trendyol.CANCEL_STATES)
    out = []
    rows = [dict(r) for r in _db().execute(
        """SELECT order_number, package_id, order_date, customer, customer_id, city, district, ty_status, state,
                  product_id, product_name, quantity, unit_price, pkg_total, cargo_provider, shipped_at
           FROM ty_lines WHERE order_number IS NOT NULL ORDER BY order_date""")]
    by_no = {}
    for r in rows:
        by_no.setdefault(r["order_number"], []).append(r)
    by_nc = {}
    for no, ls in by_no.items():
        cid = next((x["customer_id"] for x in ls if x["customer_id"]), None)
        name = next((x["customer"] for x in ls if x["customer"]), "")
        city = next((x["city"] for x in ls if x["city"]), "")
        if cid and name:
            by_nc.setdefault((norm(name), norm(city)), cid)
    claims = {}
    for c in _db().execute("SELECT claim_id, order_number, claim_date, status, items FROM ty_claims"):
        claims.setdefault(c["order_number"], []).append(dict(c))
    for no, ls in by_no.items():
        cid = next((x["customer_id"] for x in ls if x["customer_id"]), None)
        name = next((x["customer"] for x in ls if x["customer"]), "")
        city = next((x["city"] for x in ls if x["city"]), "")
        nc = (norm(name), norm(city))
        key = ("ty:" + str(cid)) if cid else (("ty:" + str(by_nc[nc])) if nc in by_nc else (("tn:" + "|".join(nc)) if nc[0] else None))
        if not key:
            continue
        live = [x for x in ls if (x["ty_status"] or "") not in cancel]
        amt = sum((x["unit_price"] or 0) * (x["quantity"] or 0) for x in live)
        out.append((key, "ty", {
            "no": no, "package_id": ls[0]["package_id"], "at": _ts(min(x["order_date"] or 0 for x in ls)), "name": name, "city": city,
            "district": next((x["district"] for x in ls if x["district"]), ""), "cancelled": not live, "amount": round(amt, 2),
            "status": ls[-1]["ty_status"], "items": [{"pid": x["product_id"], "name": x["product_name"], "qty": x["quantity"],
                                                     "cancelled": (x["ty_status"] or "") in cancel} for x in ls],
            "claims": claims.get(no, [])}))
    for o in _db().execute("SELECT id, first_name, last_name, phone, title, details, order_date, created_at, price, paid, status, stage, image FROM custom_orders"):
        o = dict(o)
        name = f"{o['first_name'] or ''} {o['last_name'] or ''}".strip()
        ph = _phone(o["phone"])
        key = ("ph:" + ph) if ph else ("cn:" + norm(name)) if name else None
        if not key:
            continue
        out.append((key, "co", {"id": o["id"], "at": _ts(o["order_date"]) or o["created_at"] or 0, "name": name, "phone": o["phone"],
                                "title": o["title"] or o["details"] or "", "price": o["price"], "paid": o["paid"], "status": o["status"],
                                "stage": o["stage"], "image": o["image"], "cancelled": o["status"] == "cancelled"}))
    return out


def _meta():
    out = {}
    for r in _db().execute("SELECT key, note, tags FROM cust_meta"):
        try:
            tags = json.loads(r["tags"] or "[]")
        except ValueError:
            tags = []
        out[r["key"]] = {"note": r["note"] or "", "tags": tags}
    return out


def build():
    merges, meta = _merges(), _meta()
    cust = {}
    for raw, kind, rec in _raw():
        k = canon(raw, merges)
        c = cust.setdefault(k, {"key": k, "raw": set(), "ty": [], "co": []})
        c["raw"].add(raw)
        c[kind].append(rec)
    for k, c in cust.items():
        allr = sorted(c["ty"] + c["co"], key=lambda r: r["at"])
        live = [r for r in allr if not r["cancelled"]]
        last = allr[-1]
        c["name"] = last["name"] or allr[0]["name"]
        c["city"] = next((r.get("city") for r in reversed(c["ty"]) if r.get("city")), "")
        c["district"] = next((r.get("district") for r in reversed(c["ty"]) if r.get("district")), "")
        c["phone"] = next((r.get("phone") for r in reversed(c["co"]) if r.get("phone")), "")
        c["n_ty"] = sum(1 for r in c["ty"] if not r["cancelled"])
        c["n_co"] = sum(1 for r in c["co"] if not r["cancelled"])
        c["orders"] = len(live)
        c["spent"] = round(sum(r["amount"] for r in c["ty"] if not r["cancelled"]) + sum(r["price"] or 0 for r in c["co"] if not r["cancelled"]), 2)
        c["first"] = live[0]["at"] if live else allr[0]["at"]
        c["last"] = live[-1]["at"] if live else last["at"]
        c["returns"] = sum(len(r["claims"]) for r in c["ty"])
        c["unpaid"] = round(sum(max(0, (r["price"] or 0) - (r["paid"] or 0)) for r in c["co"] if not r["cancelled"] and r["status"] != "cancelled"), 2)
        m = meta.get(k, {})
        c["note"], c["tags"] = m.get("note", ""), m.get("tags", [])
        c["raw"] = sorted(c["raw"])
    return cust


def summary(c):
    return {k: c[k] for k in ("key", "name", "city", "district", "phone", "n_ty", "n_co", "orders", "spent", "first", "last", "returns", "unpaid", "note", "tags")}


def listing():
    return sorted((summary(c) for c in build().values()), key=lambda c: (-c["spent"], -c["last"]))


def _nolink():
    return {(r["a"], r["b"]) for r in _db().execute("SELECT a, b FROM cust_nolink")}


def detail(key):
    cust = build()
    k = canon(key)
    c = cust.get(k)
    if not c:
        raise LookupError("Müşteri bulunamadı")
    d = dict(c)
    # soruları ada göre eşle (Trendyol soran kişinin adını çoğu zaman gizler; tam eşleşme varsa gösterilir)
    nm = norm(c["name"])
    d["questions"] = [dict(r) for r in _db().execute("SELECT id, product_name, text, user_name, status, created, answer FROM ty_questions")
                      if nm and norm(r["user_name"]) == nm] if nm else []
    # aynı kişi olabilecekler: aynı ad, farklı kanal, daha önce "farklı kişi" denmemiş
    nl = _nolink()
    has = {"ty" if c["ty"] else None, "co" if c["co"] else None} - {None}
    d["suggest"] = [summary(o) for o in cust.values() if o["key"] != k and norm(o["name"]) == nm and nm
                    and ({"ty" if o["ty"] else None, "co" if o["co"] else None} - {None}) != has
                    and (k, o["key"]) not in nl and (o["key"], k) not in nl]
    return d


def find(ty=None, co=None):
    """Bir siparişin müşterisi: kanonik anahtar, ad, not ve etiketler (sipariş ekranındaki not kutusu için)."""
    for raw, kind, rec in _raw():
        if (ty and kind == "ty" and str(rec["no"]) == str(ty)) or (co and kind == "co" and str(rec["id"]) == str(co)):
            k = canon(raw)
            m = _meta().get(k, {})
            return {"key": k, "note": m.get("note", ""), "tags": m.get("tags", [])}
    return None


def save_meta(key, note=None, tags=None):
    k = canon(key)
    cur = _meta().get(k, {"note": "", "tags": []})
    note = cur["note"] if note is None else str(note)[:1000]
    if tags is None:
        tags = cur["tags"]
    tags = [re.sub(r"\s+", " ", str(t)).strip()[:24] for t in tags if str(t).strip()][:12]
    _db().execute("INSERT INTO cust_meta(key,note,tags,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET "
                  "note=excluded.note, tags=excluded.tags, updated_at=excluded.updated_at",
                  (k, note, json.dumps(tags, ensure_ascii=False), int(time.time())))
    return {"key": k, "note": note, "tags": tags}


def merge(a, b):
    """b'yi a'ya birleştirir; notlar ve etiketler birleşir."""
    ka, kb = canon(a), canon(b)
    if ka == kb:
        return ka
    ma, mb = _meta().get(ka, {}), _meta().get(kb, {})
    _db().execute("INSERT OR REPLACE INTO cust_merge(key, into_key) VALUES(?,?)", (kb, ka))
    if mb:
        note = "\n".join(x for x in (ma.get("note"), mb.get("note")) if x)
        save_meta(ka, note, list(dict.fromkeys((ma.get("tags") or []) + (mb.get("tags") or []))))
        _db().execute("DELETE FROM cust_meta WHERE key=?", (kb,))
    return ka


def unmerge(raw):
    _db().execute("DELETE FROM cust_merge WHERE key=?", (raw,))
    _db().execute("DELETE FROM cust_merge WHERE into_key=? AND key=?", (raw, raw))


def nolink(a, b):
    _db().execute("INSERT OR IGNORE INTO cust_nolink(a,b) VALUES(?,?)", (canon(a), canon(b)))
