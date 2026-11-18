"""Trendyol ürün yorumları.

Trendyol'un satıcı API'sinde yorum servisi yok. Yorumlar, ürün sayfasının kendi kullandığı herkese açık veriden
okunur (aynı ürüne başka satıcıların aldığı yorumlar da gelir; satıcı adıyla ayrılır). Trendyol bu servisi
değiştirirse okuma bozulabilir: hata Yorumlar ekranında görünür, uygulamanın geri kalanı etkilenmez.

Okuma 3 saatte bir, ürün başına yalnız en yeni yorum sayfası. İlk okumada gelenler "görüldü" sayılır (bildirim yağmuru
olmasın); sonrakilerde bizim mağazaya gelen yeni yorum bildirim olur (1–3 yıldız uyarı seviyesinde).
"""
import hashlib
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime

_db = _lock = _get = _set = None
code_map = None          # sunucu verir: barkod → ürün id
EVERY = 3 * 3600
ENDPOINTS = [
    "https://apigw.trendyol.com/discovery-pdp-websfxsocialreviewrating-santro/product-reviews-detailed?contentId={cid}&page={page}&order=DESC&orderBy=CreatedDate&channelId=1",
    "https://public-mdc.trendyol.com/discovery-web-socialgw-service/api/review/{cid}?page={page}&pageSize=30&culture=tr-TR&storefrontId=1",
    "https://public-mdc.trendyol.com/discovery-web-socialgw-service/reviews/{cid}?page={page}&pageSize=30",
]
if os.environ.get("ATOLYE_REVIEW_EP"):   # test: sahte yorum servisi
    ENDPOINTS = [os.environ["ATOLYE_REVIEW_EP"]] + ENDPOINTS
_state = {"busy": False}


def init(db, lock, get_setting, set_setting):
    global _db, _lock, _get, _set
    _db, _lock, _get, _set = db, lock, get_setting, set_setting


def migrate(c):
    c.execute("""CREATE TABLE IF NOT EXISTS ty_reviews (id TEXT PRIMARY KEY, content_id TEXT, product_id INTEGER, product_title TEXT,
                 rate INTEGER, comment TEXT, user TEXT, seller TEXT, seller_id TEXT, ours INTEGER DEFAULT 0, created INTEGER,
                 media INTEGER DEFAULT 0, fetched_at INTEGER, seen INTEGER DEFAULT 0)""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_rev_created ON ty_reviews(created)")


def _now():
    return int(time.time())


# ---------------------------------------------------------------- okuma

def _http(url, timeout=12):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*", "Accept-Language": "tr-TR,tr;q=0.9", "Origin": "https://www.trendyol.com",
        "Referer": "https://www.trendyol.com/"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _ts(v):
    if v in (None, ""):
        return 0
    if isinstance(v, (int, float)):
        return int(v / 1000) if v > 1e11 else int(v)
    s = str(v).strip()
    if s.isdigit():
        return _ts(int(s))
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d.%m.%Y", "%d %B %Y"):
        try:
            return int(datetime.strptime(s[:19], fmt).timestamp())
        except ValueError:
            pass
    try:
        return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())
    except ValueError:
        return 0


def _find_reviews(o, depth=0):
    """Yanıtın içinde yorum listesini bulur: 'comment' ve puan alanı taşıyan sözlüklerden oluşan liste."""
    if depth > 7:
        return None
    if isinstance(o, list) and o and all(isinstance(x, dict) for x in o[:3]):
        x = o[0]
        if ("comment" in x or "commentText" in x) and any(k in x for k in ("rate", "rating", "star", "score")):
            return o
    if isinstance(o, dict):
        for v in o.values():
            r = _find_reviews(v, depth + 1)
            if r:
                return r
    elif isinstance(o, list):
        for v in o[:5]:
            r = _find_reviews(v, depth + 1)
            if r:
                return r
    return None


def parse(data):
    out = []
    for d in _find_reviews(data) or []:
        comment = str(d.get("comment") or d.get("commentText") or "").strip()
        rate = d.get("rate", d.get("rating", d.get("star", d.get("score"))))
        try:
            rate = max(0, min(5, int(round(float(rate)))))
        except (TypeError, ValueError):
            rate = 0
        user = str(d.get("userFullName") or d.get("userName") or d.get("user") or "").strip()
        created = _ts(d.get("commentDateISOtype") or d.get("createdDate") or d.get("commentDate") or d.get("lastModifiedDate") or d.get("date"))
        seller = d.get("sellerName") or (d.get("seller") or {}).get("name") if isinstance(d.get("seller"), dict) else d.get("sellerName")
        sid = d.get("sellerId") or d.get("merchantId") or ((d.get("seller") or {}).get("id") if isinstance(d.get("seller"), dict) else None)
        media = d.get("mediaFiles") or d.get("medias") or d.get("images") or []
        rid = str(d.get("id") or d.get("reviewId") or hashlib.sha1(f"{user}|{comment}|{created}".encode()).hexdigest()[:16])
        if not comment and not rate:
            continue
        out.append({"id": rid, "rate": rate, "comment": comment[:2000], "user": user[:60], "created": created,
                    "seller": str(seller or "")[:80], "seller_id": str(sid or ""), "media": len(media) if isinstance(media, list) else 0})
    return out


def fetch_one(cid):
    """Bir ürünün en yeni yorumları. Çalışan adres hatırlanır."""
    with _lock:
        pref = _get("rev_ep", "") or ""
    eps = ([pref] if pref in ENDPOINTS else []) + [e for e in ENDPOINTS if e != pref]
    last = None
    for ep in eps:
        try:
            rows = parse(_http(ep.format(cid=cid, page=0)))
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            continue
        except (urllib.error.URLError, OSError, ValueError) as e:
            last = str(getattr(e, "reason", e))[:120]
            continue
        if rows or ep == pref:
            if ep != pref:
                with _lock:
                    _set("rev_ep", ep)
                    _db().commit()
            return rows, None
    return [], last or "yorum bulunamadı"


def run(force=False):
    if _state["busy"]:
        return {"busy": True}
    with _lock:
        last = int(_get("rev_last", "0") or 0)
        sid = str(_get("ty_seller_id", "") or "")
        if not force and _now() - last < EVERY:
            return {"skipped": True}
        prods = [dict(r) for r in _db().execute("""SELECT content_id, MIN(title) title, GROUP_CONCAT(barcode) codes FROM ty_products
                                                   WHERE content_id IS NOT NULL AND content_id<>'' GROUP BY content_id""")]
        first = not _db().execute("SELECT 1 FROM ty_reviews LIMIT 1").fetchone()
        cm = code_map() if code_map else {}
    if not prods:
        return {"products": 0}
    _state["busy"] = True
    n_new, errs, ok = 0, [], 0
    try:
        for p in prods:
            rows, err = fetch_one(p["content_id"])
            if err:
                errs.append(err)
                continue
            ok += 1
            pid = next((cm.get(c.strip().lower()) for c in (p["codes"] or "").split(",") if cm.get(c.strip().lower())), None)
            with _lock:
                for r in rows:
                    ours = 1 if (sid and r["seller_id"] == sid) or (not r["seller_id"] and not r["seller"]) else 0
                    cur = _db().execute("""INSERT OR IGNORE INTO ty_reviews(id, content_id, product_id, product_title, rate, comment, user, seller, seller_id,
                                           ours, created, media, fetched_at, seen) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                                        (r["id"], p["content_id"], pid, p["title"], r["rate"], r["comment"], r["user"], r["seller"], r["seller_id"],
                                         ours, r["created"], r["media"], _now(), 1 if first else 0))
                    n_new += cur.rowcount
                _db().commit()
            time.sleep(0.6)
        with _lock:
            _set("rev_last", _now())
            _set("rev_err", "" if ok else (errs[0] if errs else ""))
            _db().commit()
    finally:
        _state["busy"] = False
    return {"products": len(prods), "ok": ok, "new": n_new, "error": None if ok else (errs[0] if errs else None)}


def state(limit=300):
    rows = [dict(r) for r in _db().execute("SELECT * FROM ty_reviews ORDER BY created DESC LIMIT ?", (limit,))]
    ours = [r for r in rows if r["ours"]]
    dist = {i: 0 for i in range(1, 6)}
    allours = _db().execute("SELECT rate, COUNT(*) n FROM ty_reviews WHERE ours=1 GROUP BY rate").fetchall()
    for r in allours:
        if r["rate"] in dist:
            dist[r["rate"]] = r["n"]
    n = sum(dist.values())
    avg = round(sum(k * v for k, v in dist.items()) / n, 2) if n else None
    prods = [dict(r) for r in _db().execute("""SELECT content_id, product_id, MIN(product_title) title, ROUND(AVG(rate),2) avg, COUNT(*) n, MAX(created) last
                                              FROM ty_reviews WHERE ours=1 GROUP BY content_id ORDER BY avg""")]
    return {"items": rows, "avg": avg, "count": n, "dist": dist, "products": prods, "unseen": sum(1 for r in ours if not r["seen"]),
            "last": int(_get("rev_last", "0") or 0), "error": _get("rev_err", "") or "", "busy": _state["busy"]}


def mark_seen():
    _db().execute("UPDATE ty_reviews SET seen=1 WHERE seen=0")


def unseen_ours():
    return [dict(r) for r in _db().execute("""SELECT id, rate, comment, product_title, user FROM ty_reviews
                                              WHERE ours=1 AND seen=0 ORDER BY created DESC LIMIT 20""")]


def _loop():
    time.sleep(90)
    while True:
        try:
            with _lock:
                on = bool(_get("ty_seller_id", "")) and (_get("rev_on", "1") or "1") == "1"
            if on:
                run()
        except Exception as e:  # noqa
            print("Yorum okuma hatası:", e)
        time.sleep(600)


def start():
    threading.Thread(target=_loop, daemon=True, name="yorum").start()
