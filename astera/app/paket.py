"""Ambalaj stoğu: kutu, poşet, balonlu naylon, kart… Kurallara göre siparişler hazırlanınca kendiliğinden düşer.

Kural kapsamları:
  order     → her siparişe (Trendyol ve özel)
  category  → bu kategorideki ürün siparişte varsa (ürüne özel kuralı olan ürün hariç)
  product   → bu ürün siparişte varsa (kategori kuralının yerine geçer)
per: "unit" = her adet için, "order" = siparişte varsa bir kez.
Düşüm anı: Trendyol paketi Hazırlanıyor'a (ya da sonrasına) geçince; özel sipariş kapanış aşamasına geçince. Her sipariş
bir kez düşer (pack_done). Özellik ilk kurulduğunda eski siparişler "düşülmüş" sayılır.
"""
import json
import time

import trendyol

_db = None
WAITING = {"Created", "Awaiting", "UnPacked"}


def init(db):
    global _db
    _db = db


def _now():
    return int(time.time())


def migrate(c):
    fresh = not c.execute("SELECT 1 FROM sqlite_master WHERE name='pack_done'").fetchone()
    c.execute("""CREATE TABLE IF NOT EXISTS pack_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT,
                 unit TEXT DEFAULT 'adet', stock REAL DEFAULT 0, min REAL DEFAULT 0, sort INTEGER DEFAULT 0, archived INTEGER DEFAULT 0,
                 created_at INTEGER)""")
    c.execute("""CREATE TABLE IF NOT EXISTS pack_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, target TEXT,
                 item_id INTEGER NOT NULL, qty REAL DEFAULT 1, per TEXT DEFAULT 'order')""")
    c.execute("""CREATE TABLE IF NOT EXISTS pack_log (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, delta REAL, stock_after REAL,
                 reason TEXT, ref TEXT, created_at INTEGER)""")
    c.execute("CREATE TABLE IF NOT EXISTS pack_done (ref TEXT PRIMARY KEY, at INTEGER)")
    if fresh:
        _mark_existing(c)


def _mark_existing(c):
    """İlk kurulum: şu ana kadar hazırlanmış/kapanmış siparişler düşülmüş sayılır."""
    t = _now()
    for r in c.execute("SELECT DISTINCT package_id FROM ty_lines WHERE package_id IS NOT NULL").fetchall():
        c.execute("INSERT OR IGNORE INTO pack_done(ref, at) VALUES(?,?)", (f"ty:{r[0]}", t))
    for r in c.execute("SELECT id FROM custom_orders WHERE status IN ('delivered','cancelled')").fetchall():
        c.execute("INSERT OR IGNORE INTO pack_done(ref, at) VALUES(?,?)", (f"co:{r[0]}", t))


# ---------------------------------------------------------------- malzemeler

def items():
    rows = [dict(r) for r in _db().execute("SELECT * FROM pack_items WHERE archived=0 ORDER BY sort, id")]
    since = _now() - 14 * 86400
    use = {r["item_id"]: (-r["s"], r["t0"]) for r in _db().execute(
        "SELECT item_id, SUM(delta) s, MIN(created_at) t0 FROM pack_log WHERE reason='order' AND created_at>? GROUP BY item_id", (since,))}
    for r in rows:
        u, t0 = use.get(r["id"], (0, None))
        # takip 14 günden kısaysa (yeni başlandıysa) geçen gün sayısına böl; en az 3 gün say ki ilk sipariş tahmini uçurmasın
        span = max(3.0, min(14.0, (_now() - t0) / 86400)) if t0 else 14.0
        per_day = (u or 0) / span
        r["per_day"] = round(per_day, 2)
        r["days_left"] = round(r["stock"] / per_day, 1) if per_day > 0 else None
    return rows


def save_item(b, iid=None):
    name = str(b.get("name") or "").strip()[:60]
    if not name:
        raise ValueError("Malzeme adı boş olamaz")
    unit = b.get("unit") if b.get("unit") in ("adet", "m", "kg", "paket") else "adet"
    vals = (name, str(b.get("icon") or "📦")[:4], unit, max(0.0, float(b.get("min") or 0)))
    if iid:
        _db().execute("UPDATE pack_items SET name=?, icon=?, unit=?, min=? WHERE id=?", vals + (iid,))
    else:
        cur = _db().execute("INSERT INTO pack_items(name, icon, unit, min, stock, created_at) VALUES(?,?,?,?,?,?)",
                            vals + (max(0.0, float(b.get("stock") or 0)), _now()))
        iid = cur.lastrowid
        if float(b.get("stock") or 0):
            _log(iid, float(b["stock"]), "count", "ilk sayım")
    return iid


def archive(iid):
    _db().execute("UPDATE pack_items SET archived=1 WHERE id=?", (iid,))
    _db().execute("DELETE FROM pack_rules WHERE item_id=?", (iid,))


def _log(iid, delta, reason, ref=None):
    r = _db().execute("SELECT stock FROM pack_items WHERE id=?", (iid,)).fetchone()
    if not r:
        return
    after = round(max(0.0, (r["stock"] or 0) + delta), 3)
    _db().execute("UPDATE pack_items SET stock=? WHERE id=?", (after, iid))
    _db().execute("INSERT INTO pack_log(item_id, delta, stock_after, reason, ref, created_at) VALUES(?,?,?,?,?,?)",
                  (iid, delta, after, reason, ref, _now()))


def adjust(iid, delta, reason="manual", ref=None):
    _log(int(iid), float(delta), reason if reason in ("manual", "buy", "count") else "manual", ref)


def count(values):
    """Sayım: {id: sayılan}. Farklar tek seferde 'Sayım' olarak yazılır."""
    n = 0
    for iid, v in (values or {}).items():
        r = _db().execute("SELECT stock FROM pack_items WHERE id=?", (int(iid),)).fetchone()
        if not r:
            continue
        d = round(max(0.0, float(v)) - (r["stock"] or 0), 3)
        if d:
            _log(int(iid), d, "count", "sayım")
            n += 1
    return n


def log(limit=40):
    return [dict(r) for r in _db().execute(
        """SELECT l.*, i.name, i.icon, i.unit FROM pack_log l JOIN pack_items i ON i.id=l.item_id ORDER BY l.id DESC LIMIT ?""", (limit,))]


# ---------------------------------------------------------------- kurallar

def rules():
    return [dict(r) for r in _db().execute("SELECT * FROM pack_rules ORDER BY CASE scope WHEN 'order' THEN 0 WHEN 'category' THEN 1 ELSE 2 END, target, id")]


def save_rule(b):
    scope = b.get("scope") if b.get("scope") in ("order", "category", "product") else "order"
    target = None if scope == "order" else str(b.get("target") or "").strip()[:80]
    if scope != "order" and not target:
        raise ValueError("Kategori ya da ürün seçin")
    iid = int(b.get("item_id") or 0)
    if not _db().execute("SELECT 1 FROM pack_items WHERE id=? AND archived=0", (iid,)).fetchone():
        raise ValueError("Malzeme seçin")
    qty = max(0.01, float(b.get("qty") or 1))
    per = b.get("per") if b.get("per") in ("unit", "order") else "order"
    if b.get("id"):
        _db().execute("UPDATE pack_rules SET scope=?, target=?, item_id=?, qty=?, per=? WHERE id=?", (scope, target, iid, qty, per, int(b["id"])))
        return int(b["id"])
    return _db().execute("INSERT INTO pack_rules(scope, target, item_id, qty, per) VALUES(?,?,?,?,?)", (scope, target, iid, qty, per)).lastrowid


def delete_rule(rid):
    _db().execute("DELETE FROM pack_rules WHERE id=?", (rid,))


def need(lines, rs=None):
    """lines: [(product_id, adet)] → {item_id: miktar}. Özel siparişte lines boştur: yalnız 'her sipariş' kuralları."""
    rs = rules() if rs is None else rs
    out = {}
    add = lambda iid, q: out.__setitem__(iid, out.get(iid, 0) + q)
    for r in rs:
        if r["scope"] == "order":
            add(r["item_id"], r["qty"])
    if not lines:
        return out
    pids = {p for p, _ in lines if p}
    cats = {}
    if pids:
        for p in _db().execute(f"SELECT id, category FROM products WHERE id IN ({','.join('?' * len(pids))})", list(pids)):
            cats[p["id"]] = (p["category"] or "").strip()
    has_prod = {str(r["target"]) for r in rs if r["scope"] == "product"}
    for r in rs:
        if r["scope"] == "order":
            continue
        if r["scope"] == "product":
            hit = [(p, q) for p, q in lines if str(p) == str(r["target"])]
        else:
            hit = [(p, q) for p, q in lines if p and str(p) not in has_prod and cats.get(p, "").lower() == str(r["target"]).lower()]
        if hit:
            add(r["item_id"], r["qty"] * (sum(q for _, q in hit) if r["per"] == "unit" else 1))
    return out


def preview(lines):
    return need(lines)


# ---------------------------------------------------------------- otomatik düşüm

def apply():
    """Hazırlanan Trendyol paketleri ve kapanan özel siparişler için ambalajı düşer (her sipariş bir kez)."""
    done = {r["ref"] for r in _db().execute("SELECT ref FROM pack_done")}
    rs = rules()
    cancel = trendyol.CANCEL_STATES
    pk = {}
    for r in _db().execute("SELECT package_id, order_number, product_id, quantity, ty_status FROM ty_lines WHERE package_id IS NOT NULL"):
        pk.setdefault(r["package_id"], []).append(dict(r))
    n = 0
    for pid, ls in pk.items():
        ref = f"ty:{pid}"
        if ref in done:
            continue
        live = [x for x in ls if (x["ty_status"] or "") not in cancel]
        if not live:
            continue
        if all((x["ty_status"] or "") in WAITING for x in live):
            continue
        for iid, q in need([(x["product_id"], x["quantity"] or 1) for x in live], rs).items():
            _log(iid, -q, "order", f"Trendyol {ls[0]['order_number']}")
        _db().execute("INSERT OR IGNORE INTO pack_done(ref, at) VALUES(?,?)", (ref, _now()))
        n += 1
    for o in _db().execute("SELECT id, first_name, last_name FROM custom_orders WHERE status='delivered'").fetchall():
        ref = f"co:{o['id']}"
        if ref in done:
            continue
        for iid, q in need([], rs).items():
            _log(iid, -q, "order", f"Özel · {(o['first_name'] or '')} {(o['last_name'] or '')}".strip())
        _db().execute("INSERT OR IGNORE INTO pack_done(ref, at) VALUES(?,?)", (ref, _now()))
        n += 1
    return n


def low():
    return [dict(r) for r in _db().execute("SELECT id, name, icon, unit, stock, min FROM pack_items WHERE archived=0 AND min>0 AND stock<=min")]


def state():
    return {"items": items(), "rules": rules(), "log": log()}
