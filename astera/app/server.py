#!/usr/bin/env python3
"""
Astera Management — 3D baskı stok ve üretim takibi.
Sadece Python standart kütüphanesi ile çalışır (Python 3.9+). Ek kurulum gerekmez.

Çalıştırma:  python server.py            (varsayılan port 8080)
             python server.py --port 9000
"""
import argparse
import base64
import io
import json
import math
import mimetypes
import os
import re
import socket
import sqlite3
import threading
import time
import traceback
import uuid
import urllib.request
import zipfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import sys

# pythonw (arka plan) ile çalışırken konsol yok; çıktıyı dosyaya yönlendir
if sys.stdout is None or sys.stderr is None:
    _log = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "atolye.log"), "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stdout or _log
    sys.stderr = sys.stderr or _log
else:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import trendyol
import bambu
import notify
import yedek
import etiket
import finans
import musteri
import push

# Windows kayıt defterindeki bozuk MIME eşlemelerine karşı
for _ext, _type in ((".js", "application/javascript"), (".css", "text/css"), (".svg", "image/svg+xml"),
                    (".webp", "image/webp"), (".png", "image/png"), (".jpg", "image/jpeg"), (".html", "text/html")):
    mimetypes.add_type(_type, _ext)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.environ.get("ATOLYE_DATA_DIR") or os.path.join(BASE_DIR, "data")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
DB_PATH = os.path.join(DATA_DIR, "atolye.db")

os.makedirs(UPLOAD_DIR, exist_ok=True)

DB_LOCK = threading.RLock()
_conn = None


def db():
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA foreign_keys = ON")
        _conn.execute("PRAGMA journal_mode = WAL")
    return _conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    print_type TEXT NOT NULL DEFAULT 'FDM',
    thumbnail TEXT,
    grams REAL DEFAULT 0,
    print_minutes INTEGER DEFAULT 0,
    pieces_per_print INTEGER DEFAULT 1,
    file_name TEXT,
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 0,
    barcodes TEXT,
    category TEXT,
    set_size INTEGER DEFAULT 1,
    parts_same_color INTEGER DEFAULT 1,
    notes TEXT,
    archived INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS product_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position INTEGER DEFAULT 0,
    color_hex TEXT,
    color_name TEXT,
    brand TEXT
);
CREATE TABLE IF NOT EXISTS print_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    order_id INTEGER REFERENCES custom_orders(id),
    print_type TEXT,
    quantity INTEGER NOT NULL,
    printer TEXT,
    note TEXT,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'printing',
    good_quantity INTEGER,
    finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS stock_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    delta INTEGER NOT NULL,
    stock_after INTEGER,
    reason TEXT,
    ref TEXT,
    note TEXT,
    created_at INTEGER
);
CREATE TABLE IF NOT EXISTS custom_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    title TEXT,
    details TEXT,
    quantity INTEGER DEFAULT 1,
    price REAL,
    paid REAL,
    order_date TEXT,
    due_date TEXT,
    print_minutes INTEGER,
    printer TEXT,
    status TEXT DEFAULT 'new',
    image TEXT,
    file_name TEXT,
    resin TEXT,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS ty_products (
    barcode TEXT PRIMARY KEY,
    stock_code TEXT,
    content_id TEXT,
    main_id TEXT,
    title TEXT,
    sale_price REAL,
    list_price REAL,
    commission REAL,
    images TEXT,
    category TEXT,
    color TEXT,
    url TEXT,
    on_sale INTEGER,
    archived INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS ty_buybox (
    barcode TEXT PRIMARY KEY,
    buybox_order INTEGER,
    buybox_price REAL,
    second_price REAL,
    third_price REAL,
    multi INTEGER,
    our_price REAL,
    checked_at INTEGER,
    changed_at INTEGER,
    lost_since INTEGER
);
CREATE TABLE IF NOT EXISTS ty_buybox_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT,
    buybox_order INTEGER,
    buybox_price REAL,
    second_price REAL,
    our_price REAL,
    at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bblog ON ty_buybox_log(barcode, at);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS ty_lines (
    line_key TEXT PRIMARY KEY,
    order_number TEXT,
    package_id TEXT,
    order_date INTEGER,
    barcode TEXT,
    merchant_sku TEXT,
    product_name TEXT,
    quantity INTEGER,
    ty_status TEXT,
    state TEXT,
    product_id INTEGER,
    updated_at INTEGER,
    packed_at INTEGER
);
CREATE TABLE IF NOT EXISTS product_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position INTEGER DEFAULT 0,
    name TEXT NOT NULL,
    per_unit INTEGER NOT NULL DEFAULT 1,
    minutes INTEGER,
    grams REAL,
    stock INTEGER NOT NULL DEFAULT 0,
    color_hex TEXT,
    color_name TEXT,
    brand TEXT
);
CREATE TABLE IF NOT EXISTS components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    thumbnail TEXT,
    print_type TEXT DEFAULT 'FDM',
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER DEFAULT 0,
    print_minutes INTEGER DEFAULT 0,
    grams REAL DEFAULT 0,
    color_hex TEXT,
    color_name TEXT,
    brand TEXT,
    file_name TEXT,
    notes TEXT,
    archived INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS spools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    brand TEXT,
    material TEXT DEFAULT 'PLA',
    color_hex TEXT,
    color_name TEXT,
    net_weight REAL DEFAULT 1000,
    remaining REAL DEFAULT 1000,
    tare REAL,
    photo TEXT,
    notes TEXT,
    archived INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS spool_shapes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    svg TEXT NOT NULL,
    created_at INTEGER
);
CREATE TABLE IF NOT EXISTS spool_shape_brands (
    brand_key TEXT PRIMARY KEY,
    brand TEXT NOT NULL,
    shape_id INTEGER NOT NULL REFERENCES spool_shapes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS job_spools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
    spool_id INTEGER NOT NULL REFERENCES spools(id),
    grams REAL,
    used REAL
);
CREATE TABLE IF NOT EXISTS spool_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spool_id INTEGER NOT NULL,
    delta REAL NOT NULL,
    remaining_after REAL,
    reason TEXT,
    ref TEXT,
    created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_job_spools ON job_spools(job_id);
CREATE INDEX IF NOT EXISTS idx_spool_log ON spool_log(spool_id, created_at);
CREATE TABLE IF NOT EXISTS job_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
    part_id INTEGER,
    part_name TEXT,
    quantity INTEGER NOT NULL,
    good_quantity INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON print_jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_parts ON job_parts(job_id);
CREATE INDEX IF NOT EXISTS idx_log_created ON stock_log(created_at);
CREATE INDEX IF NOT EXISTS idx_ty_state ON ty_lines(state);
"""


def _columns(table):
    return {r["name"]: r for r in db().execute(f"PRAGMA table_info({table})")}


def migrate():
    """Eski sürümle oluşturulmuş veritabanlarını verileri koruyarak günceller."""
    c = db()
    cols = _columns("print_jobs")
    if "order_id" not in cols:
        # product_id artık boş olabilir (özel sipariş baskıları); SQLite'ta tablo yeniden kurulur
        c.execute("PRAGMA foreign_keys = OFF")
        c.executescript("""
            ALTER TABLE print_jobs RENAME TO print_jobs_old;
            CREATE TABLE print_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER REFERENCES products(id),
                order_id INTEGER REFERENCES custom_orders(id),
                print_type TEXT,
                quantity INTEGER NOT NULL,
                printer TEXT,
                note TEXT,
                started_at INTEGER NOT NULL,
                ends_at INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'printing',
                good_quantity INTEGER,
                finished_at INTEGER
            );
            INSERT INTO print_jobs(id,product_id,quantity,printer,note,started_at,ends_at,status,good_quantity,finished_at)
                SELECT id,product_id,quantity,printer,note,started_at,ends_at,status,good_quantity,finished_at FROM print_jobs_old;
            DROP TABLE print_jobs_old;
            CREATE INDEX IF NOT EXISTS idx_jobs_status ON print_jobs(status);
        """)
        c.execute("PRAGMA foreign_keys = ON")
    ppcols = _columns("product_parts")
    for col, typ in (("color_hex", "TEXT"), ("color_name", "TEXT"), ("brand", "TEXT"), ("component_id", "INTEGER")):
        if col not in ppcols:
            c.execute(f"ALTER TABLE product_parts ADD COLUMN {col} {typ}")
    if "grams" not in _columns("product_materials"):
        c.execute("ALTER TABLE product_materials ADD COLUMN grams REAL")
    pcols = _columns("products")
    for col, typ in (("category", "TEXT"), ("set_size", "INTEGER DEFAULT 1"), ("parts_same_color", "INTEGER DEFAULT 1"),
                     ("group_id", "INTEGER"), ("variant_label", "TEXT"),
                     ("sale_price", "REAL"), ("cargo_fee", "REAL"), ("extra_cost", "REAL"), ("commission_pct", "REAL"),
                     ("ty_commission", "REAL"), ("ty_title", "TEXT"), ("ty_url", "TEXT"), ("ty_barcode", "TEXT")):
        if col not in pcols:
            c.execute(f"ALTER TABLE products ADD COLUMN {col} {typ}")
    jcols = _columns("print_jobs")
    for col, typ in (("bambu_task", "TEXT"), ("bambu_state", "TEXT"), ("bambu_percent", "INTEGER"), ("bambu_layer", "TEXT"),
                     ("component_id", "INTEGER"), ("file_grams", "REAL")):
        if col not in jcols:
            c.execute(f"ALTER TABLE print_jobs ADD COLUMN {col} {typ}")
    if "price" not in _columns("spools"):
        c.execute("ALTER TABLE spools ADD COLUMN price REAL")
    ocols = _columns("custom_orders")
    for col, typ in (("grams", "REAL"), ("print_type", "TEXT DEFAULT 'SLA'")):
        if col not in ocols:
            c.execute(f"ALTER TABLE custom_orders ADD COLUMN {col} {typ}")
    # kind: 'pool' = ortak parça (havuz stoğu), 'misc' = diğer amaçlı (dükkan malzemesi vs., stok tutulmaz)
    if "kind" not in _columns("components"):
        c.execute("ALTER TABLE components ADD COLUMN kind TEXT DEFAULT 'pool'")
    if "packed_at" not in _columns("ty_lines"):
        c.execute("ALTER TABLE ty_lines ADD COLUMN packed_at INTEGER")
    lcols = _columns("stock_log")
    for col, typ in (("shortfall", "INTEGER DEFAULT 0"), ("resolved", "INTEGER DEFAULT 0")):
        if col not in lcols:
            c.execute(f"ALTER TABLE stock_log ADD COLUMN {col} {typ}")
    # Önceki sürümlerden kalan eksi stokları sıfırla; farkı kontrol listesine koy
    for r in c.execute("SELECT id, stock FROM products WHERE stock<0").fetchall():
        c.execute("UPDATE products SET stock=0 WHERE id=?", (r["id"],))
        c.execute("""INSERT INTO stock_log(product_id,delta,stock_after,reason,note,created_at,shortfall)
                     VALUES(?,?,0,'adjust','Eksi stok sıfırlandı (önceki sürüm)',?,?)""", (r["id"], -r["stock"], int(time.time()), -r["stock"]))
    tcols = _columns("ty_lines")
    for col, typ in (("unit_price", "REAL"), ("pkg_total", "REAL"), ("customer", "TEXT"), ("city", "TEXT"),
                     ("deadline", "INTEGER"), ("line_id", "TEXT"), ("cargo_no", "TEXT"), ("cargo_provider", "TEXT"),
                     ("cargo_link", "TEXT"), ("label_at", "INTEGER")):
        if col not in tcols:
            c.execute(f"ALTER TABLE ty_lines ADD COLUMN {col} {typ}")
    ocols = _columns("custom_orders")
    for col, typ in (("order_date", "TEXT"), ("print_minutes", "INTEGER"), ("printer", "TEXT")):
        if col not in ocols:
            c.execute(f"ALTER TABLE custom_orders ADD COLUMN {col} {typ}")
            if col == "order_date":
                c.execute("UPDATE custom_orders SET order_date=date(created_at,'unixepoch','localtime') WHERE order_date IS NULL")
    c.commit()


def init_db():
    with DB_LOCK:
        db().executescript(SCHEMA)
        finans.migrate(db())
        musteri.migrate(db())
        migrate()
        db().commit()


def now():
    return int(time.time())


# ---------------------------------------------------------------- helpers

class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def get_setting(key, default=None):
    row = db().execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key, value):
    db().execute(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, None if value is None else str(value)),
    )


# Bu nedenlerle stok 0'ın altına inmek isterse ürün fiziken rafta vardı demektir (paketlendi / satıldı):
# stok 0'da durur, eksik adet "sayım farkı" olarak kaydedilir ve panoda kontrol listesine düşer.
SHORTFALL_REASONS = {"trendyol", "sale", "scan", "order"}


def change_stock(product_id, delta, reason, ref=None, note=None):
    """Tek yerden stok değişimi; log kaydı tutar. Kilit altında çağrılmalı. Stok asla 0'ın altına inmez."""
    p = db().execute("SELECT stock FROM products WHERE id=?", (product_id,)).fetchone()
    if not p:
        raise ApiError("Ürün bulunamadı", 404)
    old = p["stock"] or 0
    want = old + int(delta)
    new_stock, shortfall = want, 0
    if want < 0:
        new_stock = max(0, min(old, want)) if old < 0 else 0
        if reason in SHORTFALL_REASONS:
            shortfall = -want if old >= 0 else -int(delta)
            note = f"{note + ' · ' if note else ''}{shortfall} adet sistemde yoktu (sayım farkı)"
    applied = new_stock - old
    if applied == 0 and not shortfall:
        return new_stock   # değişiklik yok (ör. stok 0'ken elle azaltma): kayıt tutma
    db().execute("UPDATE products SET stock=?, updated_at=? WHERE id=?", (new_stock, now(), product_id))
    db().execute(
        "INSERT INTO stock_log(product_id,delta,stock_after,reason,ref,note,created_at,shortfall) VALUES(?,?,?,?,?,?,?,?)",
        (product_id, applied, new_stock, reason, ref, note, now(), shortfall),
    )
    return new_stock


def split_codes(s):
    return [c.strip().lower() for c in re.split(r"[,\s;]+", s or "") if c.strip()]


def product_dict(row, materials, in_production):
    d = dict(row)
    # İstemci her yerde "name" gösterir: varyantlarda "Ad — Varyant"; düzenleme için ham ad base_name'de
    d["base_name"] = row["name"]
    if row["variant_label"]:
        d["name"] = f"{row['name']} — {row['variant_label']}"
    d["materials"] = materials.get(row["id"], [])
    d["in_production"] = in_production.get(row["id"], 0)
    return d


def load_products(include_archived=False, pid=None):
    q = "SELECT * FROM products"
    args = []
    cond = []
    if not include_archived:
        cond.append("archived=0")
    if pid is not None:
        cond.append("id=?")
        args.append(pid)
    if cond:
        q += " WHERE " + " AND ".join(cond)
    q += " ORDER BY name COLLATE NOCASE"
    rows = db().execute(q, args).fetchall()
    mats = {}
    for m in db().execute("SELECT * FROM product_materials ORDER BY product_id, position"):
        mats.setdefault(m["product_id"], []).append(
            {"color_hex": m["color_hex"], "color_name": m["color_name"], "brand": m["brand"], "grams": m["grams"]}
        )
    prod = {}
    for r in db().execute(
        "SELECT product_id, SUM(quantity) q FROM print_jobs WHERE status='printing' AND product_id IS NOT NULL GROUP BY product_id"
    ):
        prod[r["product_id"]] = r["q"]
    parts = load_parts()
    last_order = {r["product_id"]: r["m"] for r in db().execute(
        "SELECT product_id, MAX(order_date) m FROM ty_lines WHERE product_id IS NOT NULL AND state NOT IN ('cancelled') GROUP BY product_id")}
    sold30 = {r["product_id"]: -r["s"] for r in db().execute(
        """SELECT product_id, SUM(delta - COALESCE(shortfall,0)) s FROM stock_log WHERE reason IN ('trendyol','sale','scan') AND created_at>=?
           GROUP BY product_id""", (now() - 30 * 86400,))}
    last_sale = {r["product_id"]: r["m"] for r in db().execute(
        """SELECT product_id, MAX(created_at) m FROM stock_log WHERE reason IN ('trendyol','sale','scan') AND delta<0
           AND product_id IS NOT NULL GROUP BY product_id""")}
    printed90 = {r["product_id"]: r["q"] for r in db().execute(
        """SELECT product_id, SUM(quantity) q FROM print_jobs WHERE product_id IS NOT NULL AND started_at>=?
           AND status<>'cancelled' GROUP BY product_id""", (now() - 90 * 86400,))}
    out = []
    for r in rows:
        d = product_dict(r, mats, prod)
        d["last_order_at"] = last_order.get(r["id"])
        d["sold_30"] = max(0, sold30.get(r["id"], 0) or 0)
        d["printed_90"] = printed90.get(r["id"], 0)
        d["last_sale_at"] = last_sale.get(r["id"])
        pl = parts.get(r["id"], [])
        d["parts"] = pl
        if pl:
            d.update(parts_summary(pl))
            d["in_production"] = d["sets_after_print"] - d["sets_now"]
        out.append(d)
    return out


def component_in_print():
    """Ortak parçadan baskıda olan adet: tek başına basılanlar + ürün baskılarında bu ortak parçaya bağlı olanlar."""
    out = {}
    for r in db().execute("SELECT component_id, SUM(quantity) q FROM print_jobs WHERE status='printing' AND component_id IS NOT NULL GROUP BY component_id"):
        out[r["component_id"]] = r["q"]
    for r in db().execute("""SELECT pp.component_id, SUM(jp.quantity) q FROM job_parts jp
                             JOIN print_jobs j ON j.id=jp.job_id AND j.status='printing'
                             JOIN product_parts pp ON pp.id=jp.part_id
                             WHERE pp.component_id IS NOT NULL GROUP BY pp.component_id"""):
        out[r["component_id"]] = out.get(r["component_id"], 0) + r["q"]
    return out


def load_parts(pid=None):
    inprint = {}
    for r in db().execute("""SELECT jp.part_id, SUM(jp.quantity) q FROM job_parts jp
                             JOIN print_jobs j ON j.id=jp.job_id AND j.status='printing'
                             WHERE jp.part_id IS NOT NULL GROUP BY jp.part_id"""):
        inprint[r["part_id"]] = r["q"]
    comps = {r["id"]: dict(r) for r in db().execute("SELECT * FROM components")}
    cprint = component_in_print() if comps else {}
    q, args = "SELECT * FROM product_parts", []
    if pid is not None:
        q += " WHERE product_id=?"
        args.append(pid)
    out = {}
    for r in db().execute(q + " ORDER BY product_id, position, id", args):
        d = dict(r)
        d["in_print"] = inprint.get(r["id"], 0)
        c = comps.get(r["component_id"]) if r["component_id"] else None
        if c:
            # Ortak parça: stok ve baskıdaki adet havuzdan gelir; renk ortak parçanınki
            d.update(stock=c["stock"], in_print=cprint.get(c["id"], 0), shared=True, component_name=c["name"],
                     color_hex=c["color_hex"], color_name=c["color_name"], brand=c["brand"])
            d["name"] = d["name"] or c["name"]
        out.setdefault(r["product_id"], []).append(d)
    return out


def parts_summary(pl):
    """Bir set = her parçadan per_unit adet. Sonraki set için eksikleri ve baskılar bitince durumu hesaplar."""
    total = sum(p["per_unit"] for p in pl)
    sets_now = min(p["stock"] // p["per_unit"] for p in pl)
    sets_after = min((p["stock"] + p["in_print"]) // p["per_unit"] for p in pl)
    # sonraki (henüz tamamlanmamış) set için: stokta artan parçalar ve baskıdakiler
    have_now = sum(min(p["per_unit"], p["stock"] - sets_now * p["per_unit"]) for p in pl)
    have_after = sum(min(p["per_unit"], p["stock"] + p["in_print"] - sets_after * p["per_unit"]) for p in pl)
    return {
        "parts_total": total,
        "sets_now": sets_now,
        "sets_after_print": sets_after,
        "parts_ready": have_now,              # sonraki set için elde hazır parça
        "parts_missing": total - have_now,     # sonraki set için eksik
        "parts_missing_after_print": total - have_after,
    }


def save_parts(pid, parts):
    if not isinstance(parts, list):
        raise ApiError("Parça listesi geçersiz")
    if len(parts) == 1:
        raise ApiError("Çok parçalı ürün için en az 2 parça girin; tek parçaysa parça listesini boş bırakın")
    if len(parts) > 40:
        raise ApiError("En fazla 40 parça tanımlanabilir")
    existing = {r["id"] for r in db().execute("SELECT id FROM product_parts WHERE product_id=?", (pid,))}
    keep = set()
    for i, p in enumerate(parts):
        comp = int(p.get("component_id") or 0) or None
        if comp and not db().execute("SELECT 1 FROM components WHERE id=? AND archived=0", (comp,)).fetchone():
            raise ApiError("Seçilen ortak parça bulunamadı")
        cname = db().execute("SELECT name FROM components WHERE id=?", (comp,)).fetchone()["name"] if comp else None
        name = (p.get("name") or "").strip() or cname or f"Parça {i + 1}"
        per = max(1, int(p.get("per_unit") or 1))
        mins = int(p["minutes"]) if p.get("minutes") not in (None, "") else None
        grams = float(p["grams"]) if p.get("grams") not in (None, "") else None
        stock = 0 if comp else max(0, int(p.get("stock") or 0))   # ortak parçanın stoğu havuzdadır
        hexv = None if comp else ((p.get("color_hex") or "").strip() or None)
        if hexv and not re.fullmatch(r"#[0-9a-fA-F]{6}|transparent", hexv):
            raise ApiError("Parça rengi geçersiz")
        cname_c = None if comp else ((p.get("color_name") or "").strip() or None)
        brand = None if comp else ((p.get("brand") or "").strip() or None)
        pid_ = int(p.get("id") or 0)
        if pid_ in existing:
            db().execute("""UPDATE product_parts SET position=?, name=?, per_unit=?, minutes=?, grams=?, stock=?,
                            color_hex=?, color_name=?, brand=?, component_id=? WHERE id=?""",
                         (i, name, per, mins, grams, stock, hexv, cname_c, brand, comp, pid_))
            keep.add(pid_)
        else:
            db().execute("""INSERT INTO product_parts(product_id,position,name,per_unit,minutes,grams,stock,color_hex,color_name,brand,component_id)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (pid, i, name, per, mins, grams, stock, hexv, cname_c, brand, comp))
    for gone in existing - keep:
        db().execute("DELETE FROM product_parts WHERE id=?", (gone,))
        db().execute("UPDATE job_parts SET part_id=NULL WHERE part_id=?", (gone,))


def parts_from_totals(pid, parts):
    """Düzenleyicide "Elde" = toplam parça sayısı (sete dönüşmüş olanlar dahil).
    Toplamlar değişmediyse eldeki (sete dönmemiş) sayıya çevirip döner, ürün stoğuna dokunmaz (None).
    Değiştiyse sayım parçalardan yapılmış sayılır: kaç tam set çıktığı hesaplanır, ürün stoğu o olur,
    artanlar elde kalır; ortak parçalarda havuz set farkı kadar düzeltilir. (parçalar, yeni ürün stoğu|None) döner."""
    row = db().execute("SELECT stock FROM products WHERE id=?", (pid,)).fetchone()
    cur = max(0, (row["stock"] if row else 0) or 0)
    old = {r["id"]: r for r in db().execute("SELECT * FROM product_parts WHERE product_id=?", (pid,))}
    if not old:   # ürün ilk kez parçalı yapılıyor: girilen sayılar zaten eldeki parçalardır
        return parts, None
    out, changed = [], False
    for p in parts:
        q = dict(p)
        per = max(1, int(q.get("per_unit") or 1))
        o = old.get(int(q.get("id") or 0))
        if q.get("component_id"):
            if not o or o["component_id"] != int(q["component_id"]) or o["per_unit"] != per:
                changed = True
        else:
            total = max(0, int(q.get("stock") or 0))
            if not o or o["component_id"] or o["per_unit"] != per or total != (o["stock"] or 0) + cur * per:
                changed = True
        q["_per"], q["_total"] = per, max(0, int(q.get("stock") or 0))
        out.append(q)
    if len(out) != len([o for o in old.values()]):
        changed = True
    if not changed:
        for q in out:
            q["stock"] = 0 if q.get("component_id") else max(0, q["_total"] - cur * q["_per"])
        return out, None
    limits = []
    for q in out:
        if q.get("component_id"):
            c = db().execute("SELECT stock FROM components WHERE id=?", (int(q["component_id"]),)).fetchone()
            was = cur * q["_per"] if (o := old.get(int(q.get("id") or 0))) and o["component_id"] == int(q["component_id"]) else 0
            limits.append(((c["stock"] if c else 0) + was) // q["_per"])
        else:
            limits.append(q["_total"] // q["_per"])
    sets = max(0, min(limits)) if limits else 0
    for q in out:
        if q.get("component_id"):
            o = old.get(int(q.get("id") or 0))
            was = cur * q["_per"] if o and o["component_id"] == int(q["component_id"]) else 0
            db().execute("UPDATE components SET stock=stock-?, updated_at=? WHERE id=?", (sets * q["_per"] - was, now(), int(q["component_id"])))
            q["stock"] = 0
        else:
            q["stock"] = q["_total"] - sets * q["_per"]
    return out, sets


def assemble(pid, ref=None):
    """Elde tam set oluşturan parçaları birleştirip ürün stoğuna ekler. Eklenen set sayısını döner."""
    pl = load_parts(pid).get(pid, [])
    if not pl:
        return 0
    sets = min(p["stock"] // p["per_unit"] for p in pl)
    if sets <= 0:
        return 0
    for p in pl:
        if p.get("component_id"):
            db().execute("UPDATE components SET stock=stock-?, updated_at=? WHERE id=?", (sets * p["per_unit"], now(), p["component_id"]))
        else:
            db().execute("UPDATE product_parts SET stock=stock-? WHERE id=?", (sets * p["per_unit"], p["id"]))
    change_stock(pid, sets, "print", ref=ref, note="Parçalar tamamlandı")
    return sets


def assemble_component(cid, ref=None):
    """Havuza ortak parça eklenince, bu parçayı kullanan ürünlerden tamamlanabilenleri birleştirir.
    Stoğu en düşük ürünlere öncelik verilir. {ürün adı: eklenen set} döner."""
    done = {}
    for r in db().execute("""SELECT DISTINCT p.id, p.name, p.variant_label, p.stock - COALESCE(p.min_stock,0) gap FROM products p
                             JOIN product_parts pp ON pp.product_id=p.id
                             WHERE pp.component_id=? AND p.archived=0 ORDER BY gap, p.id""", (cid,)).fetchall():
        n = assemble(r["id"], ref=ref)
        if n:
            done[r["name"] + (f" — {r['variant_label']}" if r["variant_label"] else "")] = n
    return done


DEFAULT_CATEGORIES = [
    {"name": "Figür", "no_materials": True, "no_parts": False},
    {"name": "Kitap ayracı", "no_materials": False, "no_parts": True},
    {"name": "Dekor", "no_materials": False, "no_parts": False},
]


def get_categories():
    """Kategoriler Ayarlar'dan düzenlenir. no_materials: filament seçilmez (boyanan figürler gibi),
    no_parts: çok parçalı olamaz (ayraçlar gibi)."""
    try:
        v = json.loads(get_setting("categories") or "null")
    except Exception:
        v = None
    return v if isinstance(v, list) and v else DEFAULT_CATEGORIES


def category_flags(name):
    return next((c for c in get_categories() if c["name"] == name), {"no_materials": False, "no_parts": False})


def save_materials(pid, materials, optional=False):
    """Figürler basılıp boyandığı için filament seçimi zorunlu değil (optional=True)."""
    if not isinstance(materials, list) or len(materials) > 6 or (len(materials) < 1 and not optional):
        raise ApiError("Hammadde sayısı 1 ile 6 arasında olmalı")
    db().execute("DELETE FROM product_materials WHERE product_id=?", (pid,))
    for i, m in enumerate(materials):
        hexv = (m.get("color_hex") or "").strip()
        if not re.fullmatch(r"#[0-9a-fA-F]{6}|transparent", hexv):
            raise ApiError("Renk seçimi geçersiz")
        g = m.get("grams")
        db().execute(
            "INSERT INTO product_materials(product_id,position,color_hex,color_name,brand,grams) VALUES(?,?,?,?,?,?)",
            (pid, i, hexv, (m.get("color_name") or "").strip(), (m.get("brand") or "").strip(),
             float(g) if g not in (None, "") else None),
        )


PRODUCT_FIELDS = ["name", "print_type", "thumbnail", "grams", "print_minutes", "pieces_per_print",
                  "file_name", "min_stock", "barcodes", "notes", "category", "set_size", "parts_same_color", "variant_label",
                  "sale_price", "cargo_fee", "extra_cost", "commission_pct"]
# Renk varyantlarında ortak tutulan alanlar (renk, görsel, stok, barkod varyanta özeldir)
VARIANT_SHARED = ["name", "print_type", "grams", "print_minutes", "file_name", "notes", "category", "set_size", "parts_same_color",
                 "sale_price", "cargo_fee", "extra_cost", "commission_pct"]


def clean_product(body, partial=False):
    out = {}
    for f in PRODUCT_FIELDS:
        if f in body:
            out[f] = body[f]
    if not partial or "name" in out:
        if not (out.get("name") or "").strip():
            raise ApiError("Ürün adı boş olamaz")
        out["name"] = out["name"].strip()
    if "print_type" in out and out["print_type"] not in ("FDM", "SLA"):
        raise ApiError("Baskı türü FDM veya SLA olmalı")
    for f in ("grams",):
        if f in out:
            out[f] = float(out[f] or 0)
    for f in ("print_minutes", "min_stock"):
        if f in out:
            out[f] = int(out[f] or 0)
    if "pieces_per_print" in out:
        out["pieces_per_print"] = max(1, int(out["pieces_per_print"] or 1))
    for f in ("sale_price", "cargo_fee", "extra_cost", "commission_pct"):
        if f in out:   # boş = ayarlardaki varsayılan
            try:
                out[f] = round(max(0.0, float(str(out[f]).replace(",", "."))), 2) if out[f] not in (None, "") else None
            except ValueError:
                raise ApiError("Fiyat alanları sayı olmalı")
            if f == "commission_pct" and out[f] is not None and out[f] >= 100:
                raise ApiError("Komisyon oranı 100'den küçük olmalı")
    if "variant_label" in out:
        out["variant_label"] = (out["variant_label"] or "").strip() or None
    if "parts_same_color" in out:
        out["parts_same_color"] = 1 if out["parts_same_color"] else 0
    if "set_size" in out:
        out["set_size"] = max(1, min(99, int(out["set_size"] or 1)))
    if "category" in out:
        out["category"] = out["category"] if out["category"] in {c["name"] for c in get_categories()} else None
    return out


# ---------------------------------------------------------------- 3MF parsing

def parse_3mf(data):
    """Dilimlenmiş (Bambu/Orca) 3MF'den küçük resim, süre, gram ve filament renklerini okur."""
    result = {"thumbnail_bytes": None, "print_minutes": None, "grams": None, "materials": []}
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise ApiError("Bu dosya geçerli bir 3MF değil")
    names = z.namelist()
    lower = {n.lower(): n for n in names}
    for cand in ("metadata/plate_1.png", "metadata/thumbnail.png", "metadata/top_1.png",
                 "auxiliaries/.thumbnails/thumbnail_middle.png", "auxiliaries/.thumbnails/thumbnail_3mf.png",
                 "metadata/plate_1_small.png"):
        if cand in lower:
            result["thumbnail_bytes"] = z.read(lower[cand])
            break
    if result["thumbnail_bytes"] is None:
        pngs = [n for n in names if n.lower().endswith(".png")]
        if pngs:
            result["thumbnail_bytes"] = z.read(max(pngs, key=lambda n: z.getinfo(n).file_size))

    if "metadata/slice_info.config" in lower:
        txt = z.read(lower["metadata/slice_info.config"]).decode("utf-8", "ignore")
        vendors = []
        if "metadata/project_settings.config" in lower:
            try:
                ps = json.loads(z.read(lower["metadata/project_settings.config"]).decode("utf-8", "ignore"))
                vendors = ps.get("filament_vendor") or []
            except Exception:
                vendors = []
        plates = []
        for n, plate in enumerate([p for p in txt.split("</plate>") if "<plate" in p], start=1):
            info = {"index": n, "minutes": None, "grams": None, "objects": None, "materials": [], "thumb": None}
            m = re.search(r'key="index"\s+value="(\d+)"', plate)
            if m:
                info["index"] = int(m.group(1))
            m = re.search(r'key="prediction"\s+value="(\d+)"', plate)
            if m:
                info["minutes"] = round(int(m.group(1)) / 60)
            m = re.search(r'key="weight"\s+value="([\d.]+)"', plate)
            if m:
                info["grams"] = round(float(m.group(1)), 1)
            objs = [o for o in re.findall(r"<object\s+([^>]*)/?>", plate) if 'skipped="true"' not in o]
            info["objects"] = len(objs) or None
            for fm in re.finditer(r"<filament\s+([^>]*)/?>", plate):
                attrs = dict(re.findall(r'(\w+)="([^"]*)"', fm.group(1)))
                color = (attrs.get("color") or "")[:7]
                if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
                    continue
                idx = int(attrs.get("id", "1")) - 1
                brand = vendors[idx] if 0 <= idx < len(vendors) else ""
                if brand.lower() == "generic":
                    brand = ""
                try:
                    used_g = round(float(attrs.get("used_g") or 0), 1) or None
                except ValueError:
                    used_g = None
                info["materials"].append({"color_hex": color.upper(), "color_name": "", "brand": brand, "grams": used_g,
                                          "type": attrs.get("type") or ""})
            info["materials"] = info["materials"][:6]
            pn = f"metadata/plate_{info['index']}.png"
            if pn in lower:
                info["thumb_bytes"] = z.read(lower[pn])
            if info["minutes"] or info["grams"]:
                plates.append(info)
        if plates:
            first = plates[0]
            result.update(print_minutes=first["minutes"], grams=first["grams"], materials=first["materials"], objects=first["objects"])
            if first.get("thumb_bytes"):
                result["thumbnail_bytes"] = first["thumb_bytes"]
        result["plates"] = plates
    return result


def save_image_bytes(raw, ext):
    name = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(UPLOAD_DIR, name), "wb") as f:
        f.write(raw)
    return f"/uploads/{name}"


def save_data_url(data_url):
    m = re.match(r"data:image/(jpeg|png|webp);base64,(.*)$", data_url or "", re.S)
    if not m:
        raise ApiError("Görsel formatı desteklenmiyor (JPG, PNG veya WebP olmalı)")
    raw = base64.b64decode(m.group(2))
    if len(raw) > 8 * 1024 * 1024:
        raise ApiError("Görsel çok büyük")
    return save_image_bytes(raw, "jpg" if m.group(1) == "jpeg" else m.group(1))


# ---------------------------------------------------------------- API handlers

ROUTES = []


NOLOCK = set()   # ağ beklemesi uzun süren ve kilidi kendisi yöneten uçlar (diğer istekleri bekletmesin)


def route(method, pattern, lock=True):
    rx = re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", pattern) + "$")

    def deco(fn):
        ROUTES.append((method, rx, fn))
        if not lock:
            NOLOCK.add(fn)
        return fn
    return deco


@route("GET", "/api/time")
def api_time(req):
    return {"now": now()}


@route("GET", "/api/products")
def api_products(req):
    return load_products(include_archived=req.query.get("archived") == "1")


@route("POST", "/api/products")
def api_product_create(req):
    b = req.json()
    data = clean_product(b)
    t = now()
    cols = list(data.keys()) + ["stock", "created_at", "updated_at"]
    vals = list(data.values()) + [int(b.get("stock") or 0), t, t]
    cur = db().execute(
        f"INSERT INTO products({','.join(cols)}) VALUES({','.join('?' * len(cols))})", vals
    )
    pid = cur.lastrowid
    save_materials(pid, b.get("materials") or [], optional=category_flags(b.get("category"))["no_materials"])
    if b.get("parts"):
        save_parts(pid, b["parts"])
        assemble(pid, ref="parça girişi")
    if int(b.get("stock") or 0):
        db().execute(
            "INSERT INTO stock_log(product_id,delta,stock_after,reason,note,created_at) VALUES(?,?,?,?,?,?)",
            (pid, int(b["stock"]), int(b["stock"]), "manual", "Açılış stoğu", t),
        )
    return load_products(pid=pid)[0]


@route("PUT", "/api/products/{pid}")
def api_product_update(req, pid):
    pid = int(pid)
    b = req.json()
    data = clean_product(b, partial=True)
    if data:
        sets = ", ".join(f"{k}=?" for k in data)
        db().execute(f"UPDATE products SET {sets}, updated_at=? WHERE id=?", list(data.values()) + [now(), pid])
    if "materials" in b:
        cat = b.get("category") if "category" in b else (db().execute("SELECT category FROM products WHERE id=?", (pid,)).fetchone() or {"category": None})["category"]
        save_materials(pid, b["materials"], optional=category_flags(cat)["no_materials"])
    parts_set = None
    if "parts" in b and b.get("parts_total") and b["parts"]:
        b["parts"], parts_set = parts_from_totals(pid, b["parts"])
    if parts_set is not None:
        cur = db().execute("SELECT stock FROM products WHERE id=?", (pid,)).fetchone()
        if cur and parts_set != cur["stock"]:
            change_stock(pid, parts_set - cur["stock"], "adjust", note="Parça sayımı")
    elif "stock" in b:
        cur = db().execute("SELECT stock FROM products WHERE id=?", (pid,)).fetchone()
        if cur and int(b["stock"]) != cur["stock"]:
            change_stock(pid, int(b["stock"]) - cur["stock"], "adjust", note="Sayım düzeltmesi")
    if "parts" in b:
        save_parts(pid, b["parts"] or [])
        assemble(pid, ref="parça girişi")
    if b.get("apply_to_variants", True):
        sync_variants(pid, {k: v for k, v in data.items() if k in VARIANT_SHARED}, "parts" in b)
    res = load_products(include_archived=True, pid=pid)
    if not res:
        raise ApiError("Ürün bulunamadı", 404)
    return res[0]


def siblings(pid):
    g = db().execute("SELECT group_id FROM products WHERE id=?", (pid,)).fetchone()
    if not g or not g["group_id"]:
        return []
    return [r["id"] for r in db().execute("SELECT id FROM products WHERE group_id=? AND id<>? AND archived=0", (g["group_id"], pid))]


def sync_variants(pid, shared, parts_changed):
    """Ortak alanları ve parça yapısını gruptaki diğer varyantlara uygular.
    Parçalar sıraya göre eşlenir; her varyant kendi parça stoğunu ve (ayrı renkliyse) parça renklerini korur."""
    sibs = siblings(pid)
    if not sibs:
        return
    if shared:
        sets = ", ".join(f"{k}=?" for k in shared)
        for sid in sibs:
            db().execute(f"UPDATE products SET {sets}, updated_at=? WHERE id=?", list(shared.values()) + [now(), sid])
    if parts_changed:
        src = db().execute("SELECT * FROM product_parts WHERE product_id=? ORDER BY position, id", (pid,)).fetchall()
        for sid in sibs:
            mine = db().execute("SELECT * FROM product_parts WHERE product_id=? ORDER BY position, id", (sid,)).fetchall()
            for i, sp in enumerate(src):
                if i < len(mine):
                    db().execute("""UPDATE product_parts SET position=?, name=?, per_unit=?, minutes=?, grams=?, component_id=?
                                    WHERE id=?""", (i, sp["name"], sp["per_unit"], sp["minutes"], sp["grams"], sp["component_id"], mine[i]["id"]))
                    if sp["component_id"]:
                        db().execute("UPDATE product_parts SET stock=0, color_hex=NULL, color_name=NULL, brand=NULL WHERE id=?", (mine[i]["id"],))
                else:
                    db().execute("""INSERT INTO product_parts(product_id,position,name,per_unit,minutes,grams,stock,color_hex,color_name,brand,component_id)
                                    VALUES(?,?,?,?,?,?,0,?,?,?,?)""",
                                 (sid, i, sp["name"], sp["per_unit"], sp["minutes"], sp["grams"], sp["color_hex"], sp["color_name"], sp["brand"], sp["component_id"]))
            for extra in mine[len(src):]:
                db().execute("DELETE FROM product_parts WHERE id=?", (extra["id"],))
                db().execute("UPDATE job_parts SET part_id=NULL WHERE part_id=?", (extra["id"],))
            assemble(sid, ref="parça yapısı")


@route("POST", "/api/products/{pid}/variant")
def api_product_variant(req, pid):
    """Ürünün renk varyantını oluşturur: ortak alanlar ve parça yapısı kopyalanır, stok 0 başlar."""
    pid = int(pid)
    b = req.json()
    src = db().execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    if not src:
        raise ApiError("Ürün bulunamadı", 404)
    label = (b.get("variant_label") or "").strip()
    if not label:
        raise ApiError("Varyant adını yazın, ör. Siyah")
    gid = src["group_id"] or pid
    if not src["group_id"]:
        db().execute("UPDATE products SET group_id=? WHERE id=?", (gid, pid))
        if (b.get("current_label") or "").strip():
            db().execute("UPDATE products SET variant_label=? WHERE id=?", (b["current_label"].strip(), pid))
        elif not src["variant_label"]:
            first = (db().execute("SELECT color_name FROM product_materials WHERE product_id=? ORDER BY position LIMIT 1", (pid,)).fetchone() or {"color_name": None})["color_name"]
            db().execute("UPDATE products SET variant_label=? WHERE id=?", (first or "Ana", pid))
    if db().execute("SELECT 1 FROM products WHERE group_id=? AND lower(variant_label)=lower(?) AND archived=0", (gid, label)).fetchone():
        raise ApiError(f"“{label}” varyantı zaten var")
    t = now()
    cols = VARIANT_SHARED + ["min_stock"]
    vals = [src[c] for c in cols]
    cur = db().execute(
        f"""INSERT INTO products({','.join(cols)}, thumbnail, stock, barcodes, group_id, variant_label, created_at, updated_at)
            VALUES({','.join('?' * len(cols))}, ?, 0, ?, ?, ?, ?, ?)""",
        vals + [b.get("thumbnail") or src["thumbnail"], (b.get("barcodes") or "").strip(), gid, label, t, t])
    nid = cur.lastrowid
    mats = b.get("materials")
    if mats is None:
        mats = [dict(m) for m in db().execute("SELECT color_hex, color_name, brand FROM product_materials WHERE product_id=? ORDER BY position", (pid,))]
    save_materials(nid, mats, optional=category_flags(src["category"])["no_materials"])
    for sp in db().execute("SELECT * FROM product_parts WHERE product_id=? ORDER BY position, id", (pid,)).fetchall():
        db().execute("""INSERT INTO product_parts(product_id,position,name,per_unit,minutes,grams,stock,color_hex,color_name,brand,component_id)
                        VALUES(?,?,?,?,?,?,0,?,?,?,?)""",
                     (nid, sp["position"], sp["name"], sp["per_unit"], sp["minutes"], sp["grams"], sp["color_hex"], sp["color_name"], sp["brand"], sp["component_id"]))
    return load_products(pid=nid)[0]


@route("POST", "/api/products/{pid}/ungroup")
def api_product_ungroup(req, pid):
    pid = int(pid)
    g = db().execute("SELECT group_id FROM products WHERE id=?", (pid,)).fetchone()
    db().execute("UPDATE products SET group_id=NULL WHERE id=?", (pid,))
    if g and g["group_id"]:
        left = db().execute("SELECT id FROM products WHERE group_id=? AND archived=0", (g["group_id"],)).fetchall()
        if len(left) == 1:
            db().execute("UPDATE products SET group_id=NULL WHERE id=?", (left[0]["id"],))
    return {"ok": True}


@route("DELETE", "/api/products/{pid}")
def api_product_delete(req, pid):
    pid = int(pid)
    active = db().execute("SELECT COUNT(*) c FROM print_jobs WHERE product_id=? AND status='printing'", (pid,)).fetchone()
    if active["c"]:
        raise ApiError("Bu ürünün devam eden baskısı var; önce baskıyı bitirin veya iptal edin")
    db().execute("UPDATE products SET archived=1, updated_at=? WHERE id=?", (now(), pid))
    return {"ok": True}


@route("POST", "/api/products/{pid}/restore")
def api_product_restore(req, pid):
    db().execute("UPDATE products SET archived=0, updated_at=? WHERE id=?", (now(), int(pid)))
    return {"ok": True}


@route("POST", "/api/products/{pid}/stock")
def api_product_stock(req, pid):
    b = req.json()
    delta = int(b.get("delta") or 0)
    if delta == 0:
        raise ApiError("Değişim miktarı 0 olamaz")
    reason = b.get("reason") or "manual"
    if reason not in ("manual", "sale", "adjust", "order", "scan"):
        reason = "manual"
    s = change_stock(int(pid), delta, reason, ref=b.get("ref"), note=b.get("note"))
    return {"stock": s}


@route("POST", "/api/products/{pid}/barcode")
def api_product_add_barcode(req, pid):
    """Trendyol barkodunu ürüne ekler (stok değişmez). Hazırla sayfasındaki eşleştirme bunu kullanır."""
    pid = int(pid)
    code = (req.json().get("code") or "").strip()
    if not code or code.lower() in trendyol.PLACEHOLDER_CODES:
        raise ApiError("Geçerli bir barkod yok")
    p = db().execute("SELECT barcodes FROM products WHERE id=?", (pid,)).fetchone()
    if not p:
        raise ApiError("Ürün bulunamadı", 404)
    for other in db().execute("SELECT id, name, barcodes FROM products WHERE archived=0 AND id<>?", (pid,)):
        if code.lower() in split_codes(other["barcodes"]):
            raise ApiError(f"Bu barkod zaten “{other['name']}” ürününde kayıtlı")
    if code.lower() not in split_codes(p["barcodes"]):
        new = ", ".join([c.strip() for c in (p["barcodes"] or "").split(",") if c.strip()] + [code])
        db().execute("UPDATE products SET barcodes=?, updated_at=? WHERE id=?", (new, now(), pid))
    # Bu barkodla bekleyen eşleşmemiş Trendyol satırları: paketlenmişse hemen düş, Yeni ise beklemeye al
    return {"ok": True, **trendyol.rematch_code(code)}


SPOOL_FIELDS = ["code", "brand", "material", "color_hex", "color_name", "net_weight", "remaining", "tare", "photo", "notes", "price"]
MATERIALS = ["PLA", "PLA+", "PLA Matte", "PLA Silk", "PETG", "ABS", "ASA", "TPU", "PA / Nylon", "PC", "CF katkılı", "Reçine", "Diğer"]


def next_spool_code(used=None):
    """Sıradaki makara ID'si: sayısal ID'lerin en büyüğü + 1, üç haneli (001, 002…)."""
    nums = [int(r["code"]) for r in db().execute("SELECT code FROM spools") if str(r["code"]).isdigit()]
    nums += [int(x) for x in (used or []) if str(x).isdigit()]
    return f"{(max(nums) + 1) if nums else 1:03d}"


def load_spools(sid=None, include_archived=False):
    q, args = "SELECT * FROM spools WHERE 1=1", []
    if not include_archived:
        q += " AND archived=0"
    if sid is not None:
        q += " AND id=?"
        args.append(sid)
    busy = {}
    for r in db().execute(f"""SELECT js.spool_id, j.id job_id, j.printer, j.ends_at,
                                     CASE WHEN j.component_id IS NOT NULL THEN cm.name ELSE {PNAME} END name
                              FROM job_spools js JOIN print_jobs j ON j.id=js.job_id AND j.status='printing'
                              LEFT JOIN products p ON p.id=j.product_id LEFT JOIN components cm ON cm.id=j.component_id"""):
        busy.setdefault(r["spool_id"], []).append({"job_id": r["job_id"], "printer": r["printer"], "name": r["name"]})
    last = {r["spool_id"]: r["t"] for r in db().execute("SELECT spool_id, MAX(created_at) t FROM spool_log WHERE reason='print' GROUP BY spool_id")}
    out = []
    for r in db().execute(q + " ORDER BY CASE WHEN code GLOB '[0-9]*' THEN CAST(code AS INTEGER) ELSE 1e9 END, code", args):
        d = dict(r)
        d["in_use"] = busy.get(r["id"], [])
        d["last_used"] = last.get(r["id"])
        out.append(d)
    return out


def clean_spool(b):
    out = {f: b[f] for f in SPOOL_FIELDS if f in b}
    if "code" in out:
        out["code"] = (str(out["code"] or "")).strip()
        if not out["code"]:
            raise ApiError("Makara ID boş olamaz")
    if "material" in out and out["material"] not in MATERIALS:
        out["material"] = "Diğer" if out["material"] else "PLA"
    for f in ("net_weight", "remaining", "tare", "price"):
        if f in out:
            out[f] = round(max(0.0, float(out[f])), 2 if f == "price" else 1) if out[f] not in (None, "") else (None if f in ("tare", "price") else 0)
    if out.get("color_hex") and not re.fullmatch(r"#[0-9a-fA-F]{6}|transparent", out["color_hex"]):
        raise ApiError("Renk geçersiz")
    for f in ("brand", "color_name", "notes"):
        if f in out:
            out[f] = (out[f] or "").strip() or None
    return out


# ---------------------------------------------------------------- makara şekilleri
# Kullanıcının yüklediği SVG makara silüetleri. SVG yalnızca maske olarak (CSS mask-image) kullanılır; yine de
# kaydetmeden önce betik, olay öznitelikleri, dış bağlantılar ve gömülü HTML temizlenir.
SVG_NS = "http://www.w3.org/2000/svg"
SVG_DROP = {"script", "foreignobject", "iframe", "object", "embed", "audio", "video", "canvas", "style", "a", "metadata", "animate",
            "set", "animatemotion", "animatetransform", "handler", "listener"}


def _local(tag):
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def sanitize_svg(text):
    import xml.etree.ElementTree as ET
    if not isinstance(text, str) or not text.strip():
        raise ApiError("SVG dosyası boş")
    if len(text.encode("utf-8")) > 400_000:
        raise ApiError("SVG dosyası çok büyük (en fazla 400 KB)")
    if re.search(r"<!(DOCTYPE|ENTITY)", text, re.I):
        text = re.sub(r"<!DOCTYPE[^>\[]*(\[[^\]]*\])?\s*>", "", text, flags=re.I | re.S)
        if re.search(r"<!ENTITY", text, re.I):
            raise ApiError("Bu SVG desteklenmiyor (ENTITY içeriyor)")
    try:
        root = ET.fromstring(text.encode("utf-8"))
    except ET.ParseError:
        raise ApiError("SVG okunamadı; dosya bozuk olabilir")
    if _local(root.tag) != "svg":
        raise ApiError("Bu bir SVG dosyası değil")

    def clean(el):
        for ch in list(el):
            if not isinstance(ch.tag, str) or _local(ch.tag) in SVG_DROP:
                el.remove(ch)
                continue
            if _local(ch.tag) == "image":
                href = ch.get("href") or ch.get("{http://www.w3.org/1999/xlink}href") or ""
                if not href.startswith("data:image/"):
                    el.remove(ch)
                    continue
            clean(ch)
        for k in list(el.attrib):
            lk = _local(k)
            v = el.attrib[k]
            if lk.startswith("on") or lk == "style" and re.search(r"url\(\s*['\"]?(?!#)|expression|javascript", v, re.I):
                del el.attrib[k]
            elif lk == "href" and _local(el.tag) != "image" and not v.startswith("#"):
                del el.attrib[k]
            elif re.search(r"url\(\s*['\"]?(?!#)", v, re.I) or "javascript:" in v.lower():
                del el.attrib[k]
    clean(root)
    if not root.get("viewBox"):
        try:
            w = float(re.sub(r"[^0-9.]", "", root.get("width") or ""))
            h = float(re.sub(r"[^0-9.]", "", root.get("height") or ""))
            root.set("viewBox", f"0 0 {w:g} {h:g}")
        except ValueError:
            raise ApiError("SVG'de boyut bilgisi (viewBox) yok")
    for k in ("width", "height"):
        root.attrib.pop(k, None)
    ET.register_namespace("", SVG_NS)
    ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
    out = ET.tostring(root, encoding="unicode")
    if not out.startswith("<svg"):
        out = out[out.index("<svg"):] if "<svg" in out else out
    return out


def _brand_key(b):
    return re.sub(r"\s+", " ", (b or "").strip()).casefold()


def load_shapes():
    brands = {}
    for r in db().execute("SELECT brand, shape_id FROM spool_shape_brands ORDER BY brand"):
        brands.setdefault(r["shape_id"], []).append(r["brand"])
    shapes = [{"id": r["id"], "name": r["name"], "svg": r["svg"], "brands": brands.get(r["id"], [])}
              for r in db().execute("SELECT * FROM spool_shapes ORDER BY name COLLATE NOCASE, id")]
    known = {}
    for r in db().execute("""SELECT brand FROM spools WHERE COALESCE(brand,'')<>''
                             UNION ALL SELECT brand FROM product_materials WHERE COALESCE(brand,'')<>''
                             UNION ALL SELECT brand FROM product_parts WHERE COALESCE(brand,'')<>''
                             UNION ALL SELECT brand FROM spool_shape_brands"""):
        b = re.sub(r"\s+", " ", r["brand"].strip())
        known.setdefault(_brand_key(b), b)
    return {"shapes": shapes, "brands": sorted(known.values(), key=str.casefold)}


@route("GET", "/api/spool-shapes")
def api_shapes(req):
    return load_shapes()


@route("POST", "/api/spool-shapes")
def api_shape_create(req):
    b = req.json()
    svg = sanitize_svg(b.get("svg"))
    name = (b.get("name") or "").strip()[:60] or "Makara"
    db().execute("INSERT INTO spool_shapes(name, svg, created_at) VALUES(?,?,?)", (name, svg, now()))
    return load_shapes()


@route("PUT", "/api/spool-shapes/{sid}")
def api_shape_update(req, sid):
    sid = int(sid)
    if not db().execute("SELECT 1 FROM spool_shapes WHERE id=?", (sid,)).fetchone():
        raise ApiError("Makara şekli bulunamadı", 404)
    b = req.json()
    if "name" in b:
        name = (b.get("name") or "").strip()[:60]
        if not name:
            raise ApiError("Ad boş olamaz")
        db().execute("UPDATE spool_shapes SET name=? WHERE id=?", (name, sid))
    if "svg" in b:
        db().execute("UPDATE spool_shapes SET svg=? WHERE id=?", (sanitize_svg(b["svg"]), sid))
    if "brands" in b:
        if not isinstance(b["brands"], list) or len(b["brands"]) > 300:
            raise ApiError("Marka listesi geçersiz")
        db().execute("DELETE FROM spool_shape_brands WHERE shape_id=?", (sid,))
        for x in b["brands"]:
            br = re.sub(r"\s+", " ", str(x or "").strip())[:80]
            if br:
                db().execute("INSERT OR REPLACE INTO spool_shape_brands(brand_key, brand, shape_id) VALUES(?,?,?)", (_brand_key(br), br, sid))
    return load_shapes()


@route("DELETE", "/api/spool-shapes/{sid}")
def api_shape_delete(req, sid):
    db().execute("DELETE FROM spool_shape_brands WHERE shape_id=?", (int(sid),))
    db().execute("DELETE FROM spool_shapes WHERE id=?", (int(sid),))
    return load_shapes()


@route("GET", "/api/spools")
def api_spools(req):
    return {"spools": load_spools(include_archived=req.query.get("archived") == "1"), "next_code": next_spool_code(),
            "materials": MATERIALS}


@route("POST", "/api/spools")
def api_spool_create(req):
    """count kadar aynı makara ekler; ID'ler sırayla verilir. new_spool=True ise kalan = makara ağırlığı."""
    b = req.json()
    data = clean_spool(b)
    count = max(1, min(50, int(b.get("count") or 1)))
    if b.get("new_spool", True):
        data["remaining"] = data.get("net_weight") or 1000
    data.setdefault("net_weight", 1000)
    data.setdefault("remaining", data["net_weight"])
    first = data.pop("code", None)
    created, used = [], []
    t = now()
    for i in range(count):
        code = first if (i == 0 and first) else next_spool_code(used)
        if db().execute("SELECT 1 FROM spools WHERE code=?", (code,)).fetchone():
            raise ApiError(f"#{code} ID'li makara zaten var")
        used.append(code)
        cols = ["code"] + list(data.keys()) + ["created_at", "updated_at"]
        cur = db().execute(f"INSERT INTO spools({','.join(cols)}) VALUES({','.join('?' * len(cols))})",
                           [code] + list(data.values()) + [t, t])
        db().execute("INSERT INTO spool_log(spool_id,delta,remaining_after,reason,created_at) VALUES(?,?,?,?,?)",
                     (cur.lastrowid, data["remaining"], data["remaining"], "new", t))
        created.append(cur.lastrowid)
    return [load_spools(sid)[0] for sid in created]


@route("PUT", "/api/spools/{sid}")
def api_spool_update(req, sid):
    sid = int(sid)
    b = req.json()
    data = clean_spool(b)
    cur = db().execute("SELECT * FROM spools WHERE id=?", (sid,)).fetchone()
    if not cur:
        raise ApiError("Makara bulunamadı", 404)
    if "code" in data and db().execute("SELECT 1 FROM spools WHERE code=? AND id<>?", (data["code"], sid)).fetchone():
        raise ApiError(f"#{data['code']} ID'si başka bir makarada kullanılıyor")
    rem = data.pop("remaining", None)
    if data:
        sets = ", ".join(f"{k}=?" for k in data)
        db().execute(f"UPDATE spools SET {sets}, updated_at=? WHERE id=?", list(data.values()) + [now(), sid])
    if rem is not None and round(rem, 1) != round(cur["remaining"] or 0, 1):
        spool_change(sid, rem - (cur["remaining"] or 0), "adjust", ref=b.get("ref") or "elle düzeltme")
    return load_spools(sid, include_archived=True)[0]


@route("POST", "/api/spools/{sid}/weigh")
def api_spool_weigh(req, sid):
    """Tartı ile güncelle: tartıdaki toplam ağırlık − boş makara ağırlığı = kalan filament."""
    sid = int(sid)
    b = req.json()
    s_ = db().execute("SELECT * FROM spools WHERE id=?", (sid,)).fetchone()
    if not s_:
        raise ApiError("Makara bulunamadı", 404)
    tare = float(b["tare"]) if b.get("tare") not in (None, "") else s_["tare"]
    if tare is None:
        raise ApiError("Boş makara ağırlığını girin (genelde 150–250 g)")
    scale = float(b.get("scale") or 0)
    if scale <= 0:
        raise ApiError("Tartıdaki ağırlığı girin")
    db().execute("UPDATE spools SET tare=? WHERE id=?", (tare, sid))
    rem = max(0.0, scale - tare)
    spool_change(sid, rem - (s_["remaining"] or 0), "weigh", ref=f"tartı {scale:g} g")
    return load_spools(sid)[0]


@route("GET", "/api/spools/{sid}/log")
def api_spool_log(req, sid):
    return [dict(r) for r in db().execute("SELECT * FROM spool_log WHERE spool_id=? ORDER BY id DESC LIMIT 40", (int(sid),))]


@route("DELETE", "/api/spools/{sid}")
def api_spool_delete(req, sid):
    db().execute("UPDATE spools SET archived=1, updated_at=? WHERE id=?", (now(), int(sid)))
    return {"ok": True}


@route("POST", "/api/spools/{sid}/restore")
def api_spool_restore(req, sid):
    db().execute("UPDATE spools SET archived=0, updated_at=? WHERE id=?", (now(), int(sid)))
    return {"ok": True}


COMPONENT_FIELDS = ["name", "thumbnail", "print_type", "min_stock", "print_minutes", "grams", "color_hex", "color_name",
                    "brand", "file_name", "notes", "kind"]


def load_components(cid=None, include_archived=False):
    cp = component_in_print()
    q, args = "SELECT * FROM components WHERE 1=1", []
    if not include_archived:
        q += " AND archived=0"
    if cid is not None:
        q += " AND id=?"
        args.append(cid)
    users = {}
    for r in db().execute(f"""SELECT pp.component_id, pp.per_unit, p.id, {PNAME} name, p.thumbnail, p.stock FROM product_parts pp
                              JOIN products p ON p.id=pp.product_id AND p.archived=0 WHERE pp.component_id IS NOT NULL"""):
        users.setdefault(r["component_id"], []).append({"id": r["id"], "name": r["name"], "thumbnail": r["thumbnail"],
                                                       "per_unit": r["per_unit"], "stock": r["stock"]})
    out = []
    for r in db().execute(q + " ORDER BY name COLLATE NOCASE", args):
        d = dict(r)
        d["in_print"] = cp.get(r["id"], 0)
        d["used_by"] = users.get(r["id"], [])
        out.append(d)
    return out


def clean_component(b):
    out = {f: b[f] for f in COMPONENT_FIELDS if f in b}
    if "name" in out:
        out["name"] = (out["name"] or "").strip()
        if not out["name"]:
            raise ApiError("Ortak parça adı boş olamaz")
    if "print_type" in out and out["print_type"] not in ("FDM", "SLA"):
        out["print_type"] = "FDM"
    if "kind" in out and out["kind"] not in ("pool", "misc"):
        out["kind"] = "pool"
    for f in ("min_stock", "print_minutes"):
        if f in out:
            out[f] = max(0, int(out[f] or 0))
    if "grams" in out:
        out["grams"] = float(out["grams"] or 0)
    if out.get("color_hex") and not re.fullmatch(r"#[0-9a-fA-F]{6}|transparent", out["color_hex"]):
        raise ApiError("Renk geçersiz")
    return out


@route("GET", "/api/components")
def api_components(req):
    return load_components()


@route("POST", "/api/components")
def api_component_create(req):
    b = req.json()
    data = clean_component(b)
    if not data.get("name"):
        raise ApiError("Ortak parça adı boş olamaz")
    t = now()
    cols = list(data.keys()) + ["stock", "created_at", "updated_at"]
    cur = db().execute(f"INSERT INTO components({','.join(cols)}) VALUES({','.join('?' * len(cols))})",
                       list(data.values()) + [max(0, int(b.get("stock") or 0)), t, t])
    if int(b.get("stock") or 0):
        assemble_component(cur.lastrowid, ref="havuz girişi")
    return load_components(cur.lastrowid)[0]


@route("PUT", "/api/components/{cid}")
def api_component_update(req, cid):
    cid = int(cid)
    b = req.json()
    data = clean_component(b)
    if "stock" in b:
        data["stock"] = max(0, int(b["stock"] or 0))
    if data:
        sets = ", ".join(f"{k}=?" for k in data)
        db().execute(f"UPDATE components SET {sets}, updated_at=? WHERE id=?", list(data.values()) + [now(), cid])
    if "stock" in b:
        assemble_component(cid, ref="havuz düzeltmesi")
    res = load_components(cid)
    if not res:
        raise ApiError("Ortak parça bulunamadı", 404)
    return res[0]


@route("POST", "/api/components/{cid}/stock")
def api_component_stock(req, cid):
    cid = int(cid)
    d = int(req.json().get("delta") or 0)
    db().execute("UPDATE components SET stock=MAX(0, stock+?), updated_at=? WHERE id=?", (d, now(), cid))
    assembled = assemble_component(cid, ref="havuz girişi") if d > 0 else {}
    r = load_components(cid)
    if not r:
        raise ApiError("Ortak parça bulunamadı", 404)
    return {**r[0], "assembled_products": assembled}


@route("DELETE", "/api/components/{cid}")
def api_component_delete(req, cid):
    cid = int(cid)
    used = db().execute(f"""SELECT {PNAME} name FROM product_parts pp JOIN products p ON p.id=pp.product_id
                            WHERE pp.component_id=? AND p.archived=0""", (cid,)).fetchall()
    if used:
        raise ApiError("Bu ortak parça şu ürünlerde kullanılıyor: " + ", ".join(r["name"] for r in used[:5]))
    db().execute("UPDATE components SET archived=1, updated_at=? WHERE id=?", (now(), cid))
    return {"ok": True}


@route("POST", "/api/scan")
def api_scan(req):
    b = req.json()
    code = (b.get("code") or "").strip().lower()
    qty = max(1, int(b.get("quantity") or 1))
    if not code:
        raise ApiError("Barkod boş")
    for p in db().execute("SELECT id, name, barcodes FROM products WHERE archived=0"):
        if code in split_codes(p["barcodes"]):
            s = change_stock(p["id"], -qty, "scan", ref=code)
            return {"product_id": p["id"], "name": p["name"], "stock": s}
    raise ApiError(f"“{b.get('code')}” barkodlu ürün yok. Ürün kartına barkodu ekleyin.", 404)


@route("POST", "/api/upload-image")
def api_upload_image(req):
    return {"url": save_data_url(req.json().get("data"))}


@route("POST", "/api/parse-3mf", lock=False)
def api_parse_3mf(req):
    # veritabanına dokunmaz; büyük dosya yüklenirken diğer istekleri bekletmesin
    n = int(req.h.headers.get("Content-Length") or 0)
    if n > 200 * 1024 * 1024:
        raise ApiError("Dosya çok büyük")
    r = parse_3mf(req.body())
    out = {k: v for k, v in r.items() if k not in ("thumbnail_bytes", "plates")}
    out["thumbnail"] = save_image_bytes(r["thumbnail_bytes"], "png") if r["thumbnail_bytes"] else None
    plates = []
    for p in (r.get("plates") or [])[:12]:
        tb = p.pop("thumb_bytes", None)
        p["thumbnail"] = (out["thumbnail"] if p is r["plates"][0] and out["thumbnail"] else save_image_bytes(tb, "png")) if tb else None
        plates.append(p)
    out["plates"] = plates
    return out


@route("GET", "/api/brands")
def api_brands(req):
    """Daha önce girilen filament marka/modelleri, hangi renkle kullanıldıklarıyla birlikte."""
    rows = db().execute(
        """SELECT brand, UPPER(color_hex) color_hex, COUNT(*) c FROM (
               SELECT brand, color_hex FROM product_materials WHERE brand<>''
               UNION ALL SELECT brand, color_hex FROM product_parts WHERE brand<>'' AND color_hex IS NOT NULL)
           GROUP BY brand, UPPER(color_hex) ORDER BY c DESC"""
    ).fetchall()
    return [{"brand": r["brand"], "color_hex": r["color_hex"], "count": r["c"]} for r in rows]


@route("GET", "/api/materials-summary")
def api_materials_summary(req):
    rows = db().execute(
        """SELECT m.color_hex, m.color_name, m.brand, COUNT(DISTINCT m.product_id) products,
                  SUM(p.stock) stock
           FROM product_materials m JOIN products p ON p.id=m.product_id AND p.archived=0
           GROUP BY m.color_hex, m.brand ORDER BY products DESC, m.brand"""
    ).fetchall()
    return [dict(r) for r in rows]


# --- print jobs

PNAME = "(p.name || COALESCE(' — ' || NULLIF(p.variant_label,''), ''))"
JOB_SELECT = f"""SELECT j.*,
       CASE WHEN j.component_id IS NOT NULL THEN cm.name
            WHEN j.order_id IS NOT NULL OR j.product_id IS NULL
            THEN COALESCE(TRIM(o.first_name || ' ' || COALESCE(o.last_name,'')) ||
                          CASE WHEN COALESCE(o.title,'')<>'' THEN ' — ' || o.title ELSE '' END, j.note, 'Özel sipariş')
            ELSE {PNAME} END AS product_name,
       COALESCE(p.thumbnail, o.image, cm.thumbnail) AS thumbnail,
       COALESCE(p.print_type, cm.print_type, j.print_type, 'SLA') AS print_type,
       CASE WHEN j.component_id IS NULL AND (j.order_id IS NOT NULL OR j.product_id IS NULL) THEN 1 ELSE 0 END AS is_order,
       CASE WHEN j.component_id IS NOT NULL AND COALESCE(cm.kind,'pool')<>'misc' THEN 1 ELSE 0 END AS is_component,
       CASE WHEN cm.kind='misc' THEN 1 ELSE 0 END AS is_misc,
       cm.color_hex AS component_color,
       CASE WHEN j.component_id IS NOT NULL THEN cm.grams WHEN j.product_id IS NOT NULL THEN p.grams ELSE o.grams END AS unit_grams
FROM print_jobs j
LEFT JOIN products p ON p.id=j.product_id
LEFT JOIN custom_orders o ON o.id=j.order_id
LEFT JOIN components cm ON cm.id=j.component_id"""


def job_rows(where, args=(), limit=None, offset=0):
    q = f"""{JOB_SELECT} WHERE {where}
            ORDER BY CASE WHEN j.status='printing' THEN j.ends_at END ASC, j.finished_at DESC, j.id DESC"""
    if limit:
        q += f" LIMIT {int(limit)}" + (f" OFFSET {int(offset)}" if offset else "")
    rows = [dict(r) for r in db().execute(q, args)]
    if rows:
        ids = [r["id"] for r in rows]
        jp = {}
        for r in db().execute(f"SELECT * FROM job_parts WHERE job_id IN ({','.join('?' * len(ids))}) ORDER BY id", ids):
            jp.setdefault(r["job_id"], []).append(
                {"part_id": r["part_id"], "name": r["part_name"], "quantity": r["quantity"], "good_quantity": r["good_quantity"]})
        js = {}
        for r in db().execute(f"""SELECT js.job_id, js.grams, js.used, s.id, s.code, s.brand, s.material, s.color_hex, s.color_name, s.photo, s.remaining
                                  FROM job_spools js JOIN spools s ON s.id=js.spool_id
                                  WHERE js.job_id IN ({','.join('?' * len(ids))}) ORDER BY js.id""", ids):
            d = dict(r)
            js.setdefault(d.pop("job_id"), []).append(d)
        for r in rows:
            r["parts"] = jp.get(r["id"], [])
            r["spools"] = js.get(r["id"], [])
    return rows


@route("GET", "/api/jobs/history")
def api_jobs_history(req):
    """Baskı geçmişi sayfa sayfa: {items, total}."""
    limit = max(1, min(500, int(req.query.get("limit") or 20)))
    offset = max(0, int(req.query.get("offset") or 0))
    total = db().execute("SELECT COUNT(*) FROM print_jobs WHERE status<>'printing'").fetchone()[0]
    return {"items": job_rows("j.status<>'printing'", limit=limit, offset=offset), "total": total}


@route("POST", "/api/jobs/delete")
def api_jobs_delete(req):
    """Geçmişten baskıları tamamen siler (istatistikten de düşer). Stok ve makara kalanları değişmez.
    Sürmekte olan baskılar silinmez."""
    ids = [int(x) for x in (req.json().get("ids") or []) if str(x).isdigit()][:1000]
    if not ids:
        raise ApiError("Silinecek baskı seçilmedi")
    q = ",".join("?" * len(ids))
    ids = [r[0] for r in db().execute(f"SELECT id FROM print_jobs WHERE id IN ({q}) AND status<>'printing'", ids)]
    if ids:
        q = ",".join("?" * len(ids))
        db().execute(f"DELETE FROM job_parts WHERE job_id IN ({q})", ids)
        db().execute(f"DELETE FROM job_spools WHERE job_id IN ({q})", ids)
        db().execute(f"DELETE FROM print_jobs WHERE id IN ({q})", ids)
    return {"deleted": len(ids)}


def failure_stats(days=90):
    """Son N günde biten baskılar: makine, ürün ve ürün×makine bazında fire (bozulan adet / basılan adet).
    Sık bozulan eşleşme: en az 3 baskı, en az 2'si sorunlu ve fire %25 ve üstü."""
    since = now() - int(days) * 86400
    rows = db().execute(f"""{JOB_SELECT} WHERE j.status IN ('success','partial','failed') AND j.finished_at>=?
                            AND COALESCE(cm.kind,'pool')<>'misc'""", (since,)).fetchall()

    def blank():
        return {"jobs": 0, "failed": 0, "partial": 0, "units": 0, "good": 0}

    def add(x, r):
        x["jobs"] += 1
        x["failed"] += r["status"] == "failed"
        x["partial"] += r["status"] == "partial"
        x["units"] += r["quantity"] or 0
        x["good"] += min(r["quantity"] or 0, r["good_quantity"] or 0)

    def fin(x):
        x["waste"] = round(1 - x["good"] / x["units"], 3) if x["units"] else 0
        return x

    printers, items = {}, {}
    for r in rows:
        pr = r["printer"] or ""
        add(printers.setdefault(pr, {"name": pr, **blank()}), r)
        k = f"c{r['component_id']}" if r["component_id"] else f"p{r['product_id']}" if r["product_id"] else None
        if not k:
            continue
        it = items.setdefault(k, {"key": k, "product_id": r["product_id"] if not r["component_id"] else None,
                                  "component_id": r["component_id"], "name": r["product_name"], "thumbnail": r["thumbnail"],
                                  "by": {}, **blank()})
        add(it, r)
        add(it["by"].setdefault(pr, {"printer": pr, **blank()}), r)
    pairs = []
    for it in items.values():
        fin(it)
        for pr, x in it["by"].items():
            fin(x)
            bad = x["failed"] + x["partial"]
            if x["jobs"] >= 3 and bad >= 2 and x["waste"] >= 0.25:
                ou = it["units"] - x["units"]
                og = it["good"] - x["good"]
                pairs.append({"product_id": it["product_id"], "component_id": it["component_id"], "name": it["name"],
                              "thumbnail": it["thumbnail"], "printer": pr, "jobs": x["jobs"], "bad": bad, "waste": x["waste"],
                              "other_waste": round(1 - og / ou, 3) if ou else None, "other_units": ou})
        it["by"] = sorted(it["by"].values(), key=lambda x: -x["units"])
    pairs.sort(key=lambda x: (-x["waste"], -x["jobs"]))
    worst = sorted([i for i in items.values() if i["units"] > i["good"]], key=lambda i: (-(i["units"] - i["good"]), -i["waste"]))[:12]
    return {"days": int(days), "printers": sorted((fin(x) for x in printers.values()), key=lambda x: -x["units"]),
            "items": worst, "pairs": pairs, "total": fin({k: sum(p[k] for p in printers.values()) for k in blank()})}


@route("GET", "/api/failures")
def api_failures(req):
    days = max(7, min(365, int(req.query.get("days") or 90)))
    return failure_stats(days)


@route("GET", "/api/jobs")
def api_jobs(req):
    if req.query.get("status") == "history":
        return job_rows("j.status<>'printing'", limit=int(req.query.get("limit") or 100))
    return job_rows("j.status='printing'")


def _order_label(o):
    name = f"{o['first_name'] or ''} {o['last_name'] or ''}".strip()
    return name + (f" — {o['title']}" if o["title"] else "")


@route("POST", "/api/jobs")
def api_job_create(req):
    """Baskıyı açar; seçilen makaraları (spools: [{spool_id, grams}]) baskıya bağlar."""
    res = _create_job(req)
    attach_spools(res["id"], req.json().get("spools"))
    return job_rows("j.id=?", (res["id"],))[0]


def attach_spools(jid, items):
    for it in items or []:
        sid = int(it.get("spool_id") or 0)
        if sid and db().execute("SELECT 1 FROM spools WHERE id=? AND archived=0", (sid,)).fetchone():
            db().execute("INSERT INTO job_spools(job_id,spool_id,grams) VALUES(?,?,?)",
                         (jid, sid, max(0.0, float(it.get("grams") or 0))))


def consume_spools(j, b):
    """Baskı bitince (sağlam ya da sorunlu, filament harcanmıştır) makaralardan gram düşer.
    spool_used verilmezse planlanan gram; yazıcı yarıda kaldıysa ve yüzde biliniyorsa o oranda."""
    rows = db().execute("SELECT * FROM job_spools WHERE job_id=?", (j["id"],)).fetchall()
    if not rows:
        return
    given = {int(x.get("spool_id") or 0): float(x.get("grams") or 0) for x in (b.get("spool_used") or [])}
    ratio = 1.0
    if not b.get("success") and j["bambu_percent"] is not None and j["bambu_state"] == "FAILED":
        ratio = max(0.0, min(1.0, (j["bambu_percent"] or 0) / 100))
    for r in rows:
        used = given[r["spool_id"]] if r["spool_id"] in given else round((r["grams"] or 0) * ratio, 1)
        used = max(0.0, used)
        db().execute("UPDATE job_spools SET used=? WHERE id=?", (used, r["id"]))
        if used:
            spool_change(r["spool_id"], -used, "print", ref=f"baskı #{j['id']}")


def spool_change(sid, delta, reason, ref=None):
    cur = db().execute("SELECT remaining FROM spools WHERE id=?", (sid,)).fetchone()
    if not cur:
        return None
    rem = round(max(0.0, (cur["remaining"] or 0) + delta), 1)
    db().execute("UPDATE spools SET remaining=?, updated_at=? WHERE id=?", (rem, now(), sid))
    db().execute("INSERT INTO spool_log(spool_id,delta,remaining_after,reason,ref,created_at) VALUES(?,?,?,?,?,?)",
                 (sid, round(delta, 1), rem, reason, ref, now()))
    return rem


def auto_assign_spools(jid):
    """Yazıcının kendiliğinden açtığı baskıya makara önerir: yalnızca rengi birebir tutan, boşta olan makaralar.
    Önce işi bitirmeye yetecek en az dolu makara (eskileri bitirmek için), yoksa en dolusu."""
    j = db().execute("SELECT * FROM print_jobs WHERE id=?", (jid,)).fetchone()
    if not j or db().execute("SELECT 1 FROM job_spools WHERE job_id=?", (jid,)).fetchone():
        return
    slots = []
    if j["component_id"]:
        c = db().execute("SELECT * FROM components WHERE id=?", (j["component_id"],)).fetchone()
        if c and c["color_hex"]:
            slots.append((c["color_hex"], (c["grams"] or 0) * j["quantity"]))
    elif j["product_id"]:
        p = db().execute("SELECT * FROM products WHERE id=?", (j["product_id"],)).fetchone()
        mats = db().execute("SELECT * FROM product_materials WHERE product_id=? ORDER BY position", (p["id"],)).fetchall()
        per_set = sum(x["per_unit"] for x in load_parts(p["id"]).get(p["id"], [])) or 1
        total = (p["grams"] or 0) * (j["quantity"] / per_set)   # parçalı üründe adet parça sayısıdır, gram set başınadır
        known = sum(m["grams"] or 0 for m in mats)
        for m in mats:
            share = (m["grams"] / known) if known and m["grams"] else (1 / max(1, len(mats)))
            slots.append((m["color_hex"], total * share))
    busy = {r["spool_id"] for r in db().execute(
        "SELECT js.spool_id FROM job_spools js JOIN print_jobs j ON j.id=js.job_id AND j.status='printing'")}
    chosen = set()
    for hexv, need in slots:
        if not hexv or hexv == "transparent":
            continue
        cands = [r for r in db().execute("SELECT * FROM spools WHERE archived=0 AND remaining>0 AND UPPER(color_hex)=UPPER(?)", (hexv,))
                 if r["id"] not in busy and r["id"] not in chosen]
        if not cands:
            continue
        enough = sorted([r for r in cands if r["remaining"] >= need], key=lambda r: r["remaining"])
        pick = enough[0] if enough else max(cands, key=lambda r: r["remaining"])
        chosen.add(pick["id"])
        db().execute("INSERT INTO job_spools(job_id,spool_id,grams) VALUES(?,?,?)", (jid, pick["id"], round(need, 1)))


def _create_job(req):
    b = req.json()
    qty = int(b.get("quantity") or 0)
    if qty < 1 and not b.get("parts"):
        raise ApiError("Adet en az 1 olmalı")
    minutes = b.get("duration_minutes")
    printer = (b.get("printer") or "").strip()
    start = now()

    if b.get("component_id"):
        cid = int(b["component_id"])
        c = db().execute("SELECT * FROM components WHERE id=? AND archived=0", (cid,)).fetchone()
        if not c:
            raise ApiError("Ortak parça bulunamadı", 404)
        if qty < 1:
            raise ApiError("Adet en az 1 olmalı")
        minutes = int(minutes) if minutes not in (None, "") else int(c["print_minutes"] or 0) * qty
        if minutes < 1:
            raise ApiError("Baskı süresi girin")
        cur = db().execute(
            """INSERT INTO print_jobs(component_id,print_type,quantity,printer,note,started_at,ends_at,status)
               VALUES(?,?,?,?,?,?,?,'printing')""",
            (cid, c["print_type"], qty, printer, "", start, start + minutes * 60))
        if b.get("bambu_event"):
            bambu.link_event(b["bambu_event"], cur.lastrowid, None, None, component_id=cid,
                             remember_file=b.get("remember_file", True) is not False)
        return job_rows("j.id=?", (cur.lastrowid,))[0]

    if b.get("order_id"):
        oid = int(b["order_id"])
        o = db().execute("SELECT * FROM custom_orders WHERE id=?", (oid,)).fetchone()
        if not o:
            raise ApiError("Sipariş bulunamadı", 404)
        if o["status"] in ("delivered", "cancelled"):
            raise ApiError("Teslim edilmiş veya iptal edilmiş sipariş basılamaz")
        busy = db().execute("SELECT id FROM print_jobs WHERE order_id=? AND status='printing'", (oid,)).fetchone()
        if busy:
            raise ApiError("Bu siparişin zaten devam eden bir baskısı var")
        minutes = int(minutes) if minutes not in (None, "") else int(o["print_minutes"] or 0)
        if minutes < 1:
            raise ApiError("Baskı süresi girin")
        cur = db().execute(
            """INSERT INTO print_jobs(order_id,print_type,quantity,printer,note,started_at,ends_at,status)
               VALUES(?,?,?,?,?,?,?,'printing')""",
            (oid, b.get("print_type") if b.get("print_type") in ("FDM", "SLA") else (o["print_type"] or "SLA"), qty, printer,
             _order_label(o), start, start + minutes * 60))
        db().execute("UPDATE custom_orders SET status='printing', printer=COALESCE(NULLIF(?,''),printer), "
                     "print_minutes=COALESCE(print_minutes,?), updated_at=? WHERE id=?", (printer, minutes, now(), oid))
        return job_rows("j.id=?", (cur.lastrowid,))[0]

    pid = int(b.get("product_id") or 0)
    p = db().execute("SELECT * FROM products WHERE id=? AND archived=0", (pid,)).fetchone()
    if not p:
        raise ApiError("Ürün seçin")
    plist = load_parts(pid).get(pid, [])
    chosen = []
    if plist:
        # Çok parçalı ürün: hangi parçadan kaç adet basıldığı; verilmezse tam set × adet
        byid = {x["id"]: x for x in plist}
        if b.get("parts"):
            for it in b["parts"]:
                q = int(it.get("quantity") or 0)
                part = byid.get(int(it.get("part_id") or 0))
                if part and q > 0:
                    chosen.append((part, q))
        else:
            chosen = [(x, x["per_unit"] * qty) for x in plist]
        if not chosen:
            raise ApiError("Bu baskıda hangi parçaları bastığınızı seçin")
        qty = sum(q for _, q in chosen)
    minutes = int(minutes) if minutes not in (None, "") else int(p["print_minutes"] or 0)
    if minutes < 1:
        raise ApiError("Baskı süresi girin")
    cur = db().execute(
        "INSERT INTO print_jobs(product_id,print_type,quantity,printer,note,started_at,ends_at,status) VALUES(?,?,?,?,?,?,?, 'printing')",
        (pid, p["print_type"], qty, printer, (b.get("note") or "").strip(), start, start + minutes * 60),
    )
    for part, q in chosen:
        db().execute("INSERT INTO job_parts(job_id,part_id,part_name,quantity) VALUES(?,?,?,?)",
                     (cur.lastrowid, part["id"], part["name"], q))
    if b.get("bambu_event"):
        bambu.link_event(b["bambu_event"], cur.lastrowid, None, pid)
    return job_rows("j.id=?", (cur.lastrowid,))[0]


@route("POST", "/api/jobs/{jid}/complete")
def api_job_complete(req, jid):
    j = db().execute("SELECT * FROM print_jobs WHERE id=?", (int(jid),)).fetchone()
    res = _complete_job(req, jid)
    if j and j["status"] == "printing":
        consume_spools(j, req.json())
        res["spools"] = job_rows("j.id=?", (int(jid),))[0]["spools"]
    return res


def _complete_job(req, jid):
    jid = int(jid)
    b = req.json()
    j = db().execute("SELECT * FROM print_jobs WHERE id=?", (jid,)).fetchone()
    if not j:
        raise ApiError("Baskı bulunamadı", 404)
    if j["status"] != "printing":
        raise ApiError("Bu baskı zaten sonuçlandırılmış")
    success = bool(b.get("success"))
    jparts = db().execute("SELECT * FROM job_parts WHERE job_id=?", (jid,)).fetchall()
    assembled = 0
    if jparts and j["product_id"]:
        given = {int(x.get("part_id") or 0): int(x.get("good") or 0) for x in (b.get("parts_good") or [])}
        good = 0
        for jp in jparts:
            g = (given.get(jp["part_id"], jp["quantity"]) if success else 0)
            g = max(0, min(g, jp["quantity"]))
            good += g
            db().execute("UPDATE job_parts SET good_quantity=? WHERE id=?", (g, jp["id"]))
            if g and jp["part_id"]:
                comp = db().execute("SELECT component_id FROM product_parts WHERE id=?", (jp["part_id"],)).fetchone()
                if comp and comp["component_id"]:
                    db().execute("UPDATE components SET stock=stock+?, updated_at=? WHERE id=?", (g, now(), comp["component_id"]))
                else:
                    db().execute("UPDATE product_parts SET stock=stock+? WHERE id=?", (g, jp["part_id"]))
        status = "success" if good == j["quantity"] else ("partial" if good > 0 else "failed")
        db().execute("UPDATE print_jobs SET status=?, good_quantity=?, finished_at=? WHERE id=?", (status, good, now(), jid))
        assembled = assemble(j["product_id"], ref=f"baskı #{jid}")
        res = job_rows("j.id=?", (jid,))[0]
        res["assembled"] = assembled
        pl = load_parts(j["product_id"]).get(j["product_id"], [])
        res["parts_missing"] = parts_summary(pl)["parts_missing"] if pl else 0
        return res
    if j["component_id"]:
        good = int(b.get("good_quantity") if b.get("good_quantity") is not None else j["quantity"]) if success else 0
        good = max(0, min(good, 999))
        if good > j["quantity"]:
            db().execute("UPDATE print_jobs SET quantity=? WHERE id=?", (good, jid))
        q = max(good, j["quantity"])
        status = "success" if success and good >= q else ("partial" if success and good > 0 else "failed")
        db().execute("UPDATE print_jobs SET status=?, good_quantity=?, finished_at=? WHERE id=?", (status, good, now(), jid))
        assembled = {}
        misc = db().execute("SELECT kind FROM components WHERE id=?", (j["component_id"],)).fetchone()
        if good and not (misc and misc["kind"] == "misc"):
            db().execute("UPDATE components SET stock=stock+?, updated_at=? WHERE id=?", (good, now(), j["component_id"]))
            assembled = assemble_component(j["component_id"], ref=f"baskı #{jid}")
        res = job_rows("j.id=?", (jid,))[0]
        res["assembled_products"] = assembled
        return res
    good = int(b.get("good_quantity") if b.get("good_quantity") is not None else j["quantity"]) if success else 0
    good = max(0, min(good, 999))
    if good > j["quantity"] and not j["order_id"]:
        # Yazıcıdan otomatik açılan baskıda adet tahminiydi; gerçekte daha fazla çıktıysa adedi düzelt
        db().execute("UPDATE print_jobs SET quantity=? WHERE id=?", (good, jid))
        j = db().execute("SELECT * FROM print_jobs WHERE id=?", (jid,)).fetchone()
    good = min(good, j["quantity"])
    status = "success" if success and good == j["quantity"] else ("partial" if success and good > 0 else "failed")
    db().execute("UPDATE print_jobs SET status=?, good_quantity=?, finished_at=? WHERE id=?", (status, good, now(), jid))
    if j["order_id"]:
        # Özel sipariş: stok değişmez; başarılıysa Hazır'a, başarısızsa tekrar basılmak üzere Yeni'ye döner
        new_status = "ready" if status == "success" else "new"
        db().execute("UPDATE custom_orders SET status=?, updated_at=? WHERE id=? AND status='printing'",
                     (new_status, now(), j["order_id"]))
    elif good:
        change_stock(j["product_id"], good, "print", ref=f"baskı #{jid}")
    return job_rows("j.id=?", (jid,))[0]


@route("POST", "/api/jobs/{jid}/snooze")
def api_job_snooze(req, jid):
    minutes = max(1, int(req.json().get("minutes") or 15))
    db().execute("UPDATE print_jobs SET ends_at=? WHERE id=? AND status='printing'", (now() + minutes * 60, int(jid)))
    return job_rows("j.id=?", (int(jid),))[0]


@route("POST", "/api/jobs/{jid}/finish-now")
def api_job_finish_now(req, jid):
    db().execute("UPDATE print_jobs SET ends_at=? WHERE id=? AND status='printing'", (now(), int(jid)))
    return job_rows("j.id=?", (int(jid),))[0]


@route("GET", "/api/products/{pid}/detail")
def api_product_detail(req, pid):
    """Ürün sayfası: haftalık satış/baskı (12 hafta), baskı geçmişi, stok hareketleri, Trendyol ve buybox."""
    pid = int(pid)
    rows = load_products(include_archived=True, pid=pid)
    if not rows:
        raise ApiError("Ürün bulunamadı", 404)
    p = rows[0]
    lt = time.localtime()
    today0 = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)))
    monday = today0 - lt.tm_wday * 86400
    weeks = []
    for k in range(11, -1, -1):
        st = int(time.mktime(time.localtime(monday - k * 7 * 86400)[:3] + (0, 0, 0, 0, 0, -1)))
        en = int(time.mktime(time.localtime(st + 8 * 86400)[:3] + (0, 0, 0, 0, 0, -1)))
        en = st + 7 * 86400 if en - st > 7 * 86400 + 7200 else en
        weeks.append({"start": st, "end": en, "label": time.strftime("%d.%m", time.localtime(st)), "sold": 0, "printed": 0})
    w0 = weeks[0]["start"]
    ph = ",".join("?" * len(SALE_REASONS))

    def wk(t):
        for w in weeks:
            if w["start"] <= t < w["end"]:
                return w
        return None
    for r in db().execute(f"""SELECT delta - COALESCE(shortfall,0) d, reason, created_at FROM stock_log
                              WHERE product_id=? AND created_at>=? AND (reason IN ({ph}) OR reason='print')""",
                          (pid, w0, *SALE_REASONS)):
        w = wk(r["created_at"])
        if not w:
            continue
        if r["reason"] == "print":
            w["printed"] += max(0, r["d"])
        else:
            w["sold"] += -r["d"]
    for w in weeks:
        w["sold"] = max(0, w["sold"])
    t = now()
    sold = lambda days: max(0, -(db().execute(f"""SELECT COALESCE(SUM(delta - COALESCE(shortfall,0)),0) FROM stock_log
                                                  WHERE product_id=? AND reason IN ({ph}) AND created_at>=?""",
                                              (pid, *SALE_REASONS, t - days * 86400)).fetchone()[0]))
    jstat = db().execute("""SELECT COUNT(*) n, SUM(status='failed') f, SUM(status='partial') pa, COALESCE(SUM(quantity),0) q,
                                   COALESCE(SUM(good_quantity),0) g, COALESCE(AVG((finished_at-started_at)/60.0),0) mins
                            FROM print_jobs WHERE product_id=? AND status NOT IN ('printing','cancelled') AND finished_at>=?""",
                         (pid, t - 90 * 86400)).fetchone()
    log = [dict(r) for r in db().execute("SELECT * FROM stock_log WHERE product_id=? ORDER BY id DESC LIMIT 30", (pid,))]
    jobs = job_rows("j.product_id=?", (pid,), limit=20)
    idx = _ty_index()
    ty = _ty_for(p, idx) if p.get("barcodes") else None
    bb = None
    if ty:
        r = db().execute("SELECT * FROM ty_buybox WHERE barcode=?", (ty["barcode"],)).fetchone()
        bb = dict(r) if r else None
    tyl = db().execute("""SELECT COUNT(*) n, COALESCE(SUM(quantity),0) q, AVG(unit_price) avg_price FROM ty_lines
                          WHERE product_id=? AND order_date>=? AND state<>'cancelled'""", (pid, (t - 90 * 86400) * 1000)).fetchone()
    return {"product": p, "weeks": weeks,
            "stats": {"sold_7": sold(7), "sold_30": sold(30), "sold_90": sold(90),
                      "jobs_90": jstat["n"], "failed_90": jstat["f"] or 0, "partial_90": jstat["pa"] or 0,
                      "planned_90": jstat["q"], "good_90": jstat["g"], "avg_job_min": round(jstat["mins"] or 0)},
            "jobs": jobs, "log": log, "ty": ty, "buybox": bb,
            "ty_orders": {"lines": tyl["n"], "qty": tyl["q"], "avg_price": round(tyl["avg_price"], 2) if tyl["avg_price"] else None}}


@route("POST", "/api/jobs/{jid}/change")
def api_job_change(req, jid):
    """Devam eden baskının ürününü düzelt (yanlış ürün seçilmiş / yazıcı yanlış tanımış). Stoğa henüz bir şey eklenmedi."""
    jid = int(jid)
    b = req.json()
    j = db().execute("SELECT * FROM print_jobs WHERE id=?", (jid,)).fetchone()
    if not j:
        raise ApiError("Baskı bulunamadı", 404)
    if j["status"] != "printing":
        raise ApiError("Sonuçlanmış baskının ürünü değiştirilemez")
    if j["order_id"]:
        raise ApiError("Özel sipariş baskısının ürünü değiştirilemez; baskıyı iptal edip yeniden açın")
    qty = max(1, int(b.get("quantity") or j["quantity"] or 1))
    db().execute("DELETE FROM job_parts WHERE job_id=?", (jid,))
    if b.get("component_id"):
        cid = int(b["component_id"])
        c = db().execute("SELECT * FROM components WHERE id=? AND archived=0", (cid,)).fetchone()
        if not c:
            raise ApiError("Seçilen kayıt bulunamadı", 404)
        db().execute("UPDATE print_jobs SET product_id=NULL, component_id=?, print_type=?, quantity=? WHERE id=?",
                     (cid, c["print_type"], qty, jid))
        pid = None
    else:
        pid = int(b.get("product_id") or 0)
        p = db().execute("SELECT * FROM products WHERE id=? AND archived=0", (pid,)).fetchone()
        if not p:
            raise ApiError("Ürün seçin")
        plist = load_parts(pid).get(pid, [])
        total = qty
        if plist:   # çok parçalı ürün: adet = set sayısı, her parçadan set başına düşen kadar
            total = 0
            for x in plist:
                q = x["per_unit"] * qty
                total += q
                db().execute("INSERT INTO job_parts(job_id,part_id,part_name,quantity) VALUES(?,?,?,?)", (jid, x["id"], x["name"], q))
        db().execute("UPDATE print_jobs SET product_id=?, component_id=NULL, print_type=?, quantity=? WHERE id=?",
                     (pid, p["print_type"], total, jid))
        cid = None
    # makaralar yeni ürünün renklerine göre yeniden önerilir
    db().execute("DELETE FROM job_spools WHERE job_id=?", (jid,))
    auto_assign_spools(jid)
    # yazıcı dosyayı yanlış tanıdıysa: dosyayı doğru ürüne öğret
    note = j["note"] or ""
    if b.get("remember_file", True) is not False and note.startswith("Bambu: "):
        bambu.remember(note[7:].strip(), product_id=pid, component_id=cid)
    return job_rows("j.id=?", (jid,))[0]


@route("POST", "/api/jobs/{jid}/ignore")
def api_job_ignore(req, jid):
    """Baskıyı yok say: hiç açılmamış gibi silinir. Stok, fire, makara ve istatistik değişmez.
    Yazıcı görevine bağlıysa o görev bir daha sorulmaz."""
    j = db().execute("SELECT * FROM print_jobs WHERE id=? AND status='printing'", (int(jid),)).fetchone()
    if not j:
        raise ApiError("Bu baskı artık beklemiyor", 404)
    if j["bambu_task"] and j["printer"]:
        bambu.ignore_task(j["printer"], j["bambu_task"])
    db().execute("DELETE FROM job_parts WHERE job_id=?", (j["id"],))
    db().execute("DELETE FROM job_spools WHERE job_id=?", (j["id"],))
    db().execute("DELETE FROM print_jobs WHERE id=?", (j["id"],))
    if j["order_id"]:
        db().execute("UPDATE custom_orders SET status='new', updated_at=? WHERE id=? AND status='printing'", (now(), j["order_id"]))
    db().execute("UPDATE notifications SET resolved_at=?, resolved_by='user', cleared=1 WHERE key=? AND resolved_at IS NULL",
                 (now(), f"job:{j['id']}"))
    return {"ok": True}


@route("POST", "/api/jobs/{jid}/cancel")
def api_job_cancel(req, jid):
    j = db().execute("SELECT * FROM print_jobs WHERE id=? AND status='printing'", (int(jid),)).fetchone()
    db().execute("UPDATE print_jobs SET status='cancelled', good_quantity=0, finished_at=? WHERE id=? AND status='printing'",
                 (now(), int(jid)))
    if j and j["order_id"]:
        db().execute("UPDATE custom_orders SET status='new', updated_at=? WHERE id=? AND status='printing'",
                     (now(), j["order_id"]))
    return {"ok": True}


# --- üretim planı: ne, hangi makinede, ne zaman

PLAN_PRIO = {"ty": 0, "order": 1, "min": 2, "forecast": 3}


def _printer_list():
    try:
        return [p for p in json.loads(get_setting("printers", "[]") or "[]") if isinstance(p, dict) and p.get("name")]
    except ValueError:
        return []


def _fits(printer, print_type):
    return (printer.get("kind") == "resin") == (print_type == "SLA")


def build_plan():
    t = now()
    days = int(get_setting("plan_days", "14") or 14)
    prods = {p["id"]: p for p in load_products()}
    printers = _printer_list()
    live = {p.get("name"): p for p in (bambu.snapshot()["printers"] if bambu else [])}
    # makinelerin boşalma zamanı (sonucu girilmemiş, süresi dolmuş baskı fiziken bitmiştir)
    free, busy = {p["name"]: t for p in printers}, {}
    for j in db().execute(f"{JOB_SELECT} WHERE j.status='printing'"):
        if j["printer"] in free:
            free[j["printer"]] = max(free[j["printer"]], j["ends_at"])
            busy.setdefault(j["printer"], []).append({"id": j["id"], "name": j["product_name"], "quantity": j["quantity"],
                                                     "ends_at": j["ends_at"], "due": j["ends_at"] <= t})
    affinity = {}
    for r in db().execute("""SELECT product_id, printer, COUNT(*) n FROM print_jobs WHERE product_id IS NOT NULL AND printer<>''
                             AND started_at>=? AND status<>'cancelled' GROUP BY product_id, printer""", (t - 180 * 86400,)):
        affinity.setdefault(r["product_id"], {})[r["printer"]] = r["n"]

    items = []
    # 1) Trendyol'da Yeni siparişlerde eksik olanlar (son senkrondaki durum; ağa çıkmadan)
    ty = {}
    for r in db().execute("""SELECT product_id, quantity, deadline, state, order_number FROM ty_lines
                             WHERE ty_status='Created' AND product_id IS NOT NULL AND state NOT IN ('cancelled','restocked')"""):
        g = ty.setdefault(r["product_id"], {"qty": 0, "deducted": 0, "orders": set(), "deadline": None})
        g["qty"] += r["quantity"] or 0
        g["orders"].add(r["order_number"])
        if r["state"] == "deducted":
            g["deducted"] += r["quantity"] or 0
        dl = int(r["deadline"] / 1000) if r["deadline"] else None
        if dl and (g["deadline"] is None or dl < g["deadline"]):
            g["deadline"] = dl
    covered = {}
    for pid, g in ty.items():
        p = prods.get(pid)
        if not p:
            continue
        shelf = (p["stock"] or 0) + g["deducted"]
        need = g["qty"] - shelf - (p["in_production"] or 0)
        covered[pid] = max(0, shelf + (p["in_production"] or 0) - g["qty"])   # siparişlerden sonra kalan
        if need > 0:
            items.append({"kind": "ty", "product_id": pid, "qty": need, "deadline": g["deadline"],
                          "reason": f"{len(g['orders'])} Trendyol siparişinde {need} eksik"})
    # 2) Termini olan / bekleyen özel siparişler
    for o in db().execute("SELECT * FROM custom_orders WHERE status='new' ORDER BY due_date IS NULL, due_date, id"):
        dl = None
        if o["due_date"]:
            y, m, d = (int(x) for x in o["due_date"].split("-"))
            dl = int(time.mktime((y, m, d, 18, 0, 0, 0, 0, -1)))
        name = (f"{o['first_name'] or ''} {o['last_name'] or ''}".strip() + (f" — {o['title']}" if o["title"] else "")) or "Özel sipariş"
        items.append({"kind": "order", "order_id": o["id"], "name": name, "thumbnail": o["image"], "qty": o["quantity"] or 1,
                      "deadline": dl, "print_type": o["print_type"] or "SLA", "minutes": o["print_minutes"] or 0,
                      "grams": (o["grams"] or 0) * (o["quantity"] or 1), "reason": "Özel sipariş"})
    # 3-4) En az stok ve satış hızına göre stok hedefi
    for p in prods.values():
        avail = covered.get(p["id"], (p["stock"] or 0) + (p["in_production"] or 0))
        daily = (p.get("sold_30") or 0) / 30
        sugg = math.ceil(daily * days) if (p.get("sold_30") or 0) >= 2 else 0
        target = max(p["min_stock"] or 0, sugg)
        if avail >= target or target <= 0:
            continue
        qty = target - avail
        if avail < (p["min_stock"] or 0):
            items.append({"kind": "min", "product_id": p["id"], "qty": qty, "deadline": None,
                          "reason": f"En az stoğun altında ({avail}/{p['min_stock']})"})
        else:
            left = avail / daily if daily else None
            items.append({"kind": "forecast", "product_id": p["id"], "qty": qty, "deadline": t + int((left or 0) * 86400) if left is not None else None,
                          "days_left": round(left, 1) if left is not None else None,
                          "reason": f"Satış hızına göre ~{max(0, round(left or 0))} gün yeter"})
    # ürün bilgileri, süre, renkler
    for it in items:
        p = prods.get(it.get("product_id"))
        if p:
            it.update(name=p["name"], thumbnail=p["thumbnail"], print_type=p["print_type"],
                      minutes=(p["print_minutes"] or 0) * it["qty"], grams=(p["grams"] or 0) * it["qty"],
                      per_print=p.get("pieces_per_print") or 1, set_size=p.get("set_size") or 1, stock=p["stock"],
                      sold_30=p.get("sold_30") or 0, has_parts=bool(p.get("parts")))
            mats = p.get("materials") or []
            known = sum(m.get("grams") or 0 for m in mats)
            it["colors"] = [{"hex": m["color_hex"], "name": m.get("color_name"), "grams": it["grams"] * ((m["grams"] / known) if known and m.get("grams") else 1 / len(mats))}
                            for m in mats if m.get("color_hex") and m["color_hex"] != "transparent"]
        else:
            it.setdefault("colors", [])
        it["key"] = f"{it['kind']}:{it.get('product_id') or it.get('order_id')}"
    items.sort(key=lambda x: (PLAN_PRIO[x["kind"]], x["deadline"] or 9e12, -x["qty"]))
    # makinelere dağıt: uygun türde, en erken boşalan; ürün daha önce bir makinede çok basıldıysa o tercih edilir
    for it in items:
        cands = [p for p in printers if _fits(p, it.get("print_type") or "FDM")]
        if not cands:
            it["printer"] = None
            continue
        aff = affinity.get(it.get("product_id"), {})
        best = min(cands, key=lambda p: free[p["name"]] - (2700 if aff.get(p["name"]) and aff[p["name"]] == max(aff.values()) else 0))
        it["printer"] = best["name"]
        it["start"] = max(t, free[best["name"]])
        dur = (it.get("minutes") or 60) * 60
        it["end"] = it["start"] + dur
        it["no_minutes"] = not it.get("minutes")
        free[best["name"]] = it["end"]
        it["late"] = bool(it.get("deadline") and it["end"] > it["deadline"] and it["kind"] in ("ty", "order"))
    # filament: plandaki ihtiyaç ↔ makaralardaki
    have = {}
    for r in db().execute("SELECT color_hex, color_name, material, remaining FROM spools WHERE archived=0 AND remaining>0"):
        k = (r["color_hex"] or "").upper()
        h = have.setdefault(k, {"hex": r["color_hex"], "name": r["color_name"], "materials": set(), "have": 0.0, "need": 0.0, "items": 0})
        h["have"] += r["remaining"] or 0
        h["materials"].add(r["material"] or "")
    left = {k: v["have"] for k, v in have.items()}
    for it in items:
        short = []
        for c in it.get("colors", []):
            k = c["hex"].upper()
            h = have.setdefault(k, {"hex": c["hex"], "name": c.get("name"), "materials": set(), "have": 0.0, "need": 0.0, "items": 0})
            h["need"] += c["grams"]
            h["items"] += 1
            left[k] = left.get(k, 0) - c["grams"]
            if left[k] < 0:
                short.append(c.get("name") or c["hex"])
        it["filament_short"] = short
    filament = sorted([{"hex": v["hex"], "name": v["name"], "materials": sorted(x for x in v["materials"] if x), "have": round(v["have"]),
                        "need": round(v["need"]), "short": round(max(0, v["need"] - v["have"])), "items": v["items"]}
                       for v in have.values() if v["need"] > 0], key=lambda x: (-x["short"], -x["need"]))
    low = [dict(r) for r in db().execute("""SELECT id, code, brand, material, color_hex, color_name, remaining, net_weight FROM spools
                                          WHERE archived=0 AND remaining>0 AND remaining<150 ORDER BY remaining""")]
    pl = []
    for p in printers:
        st = live.get(p["name"]) or {}
        pl.append({"name": p["name"], "kind": p.get("kind"), "free_at": max(t, min([j["ends_at"] for j in busy.get(p["name"], []) if not j["due"]] or [t])),
                   "busy": busy.get(p["name"], []), "idle": not any(not j["due"] for j in busy.get(p["name"], [])),
                   "state": st.get("state"), "online": st.get("online")})
    return {"days": days, "generated_at": t, "items": items, "printers": pl, "filament": filament, "low_spools": low}


@route("GET", "/api/plan")
def api_plan(req):
    return build_plan()


# --- custom orders

ORDER_FIELDS = ["first_name", "last_name", "phone", "title", "details", "quantity", "price", "paid",
                "order_date", "due_date", "print_minutes", "printer", "status", "image", "file_name", "resin", "grams", "print_type"]
ORDER_STATUSES = ("new", "printing", "ready", "delivered", "cancelled")
ORDER_SELECT = """SELECT o.*, j.id AS active_job_id, j.started_at AS job_started_at, j.ends_at AS job_ends_at,
                         j.printer AS job_printer
                  FROM custom_orders o
                  LEFT JOIN print_jobs j ON j.order_id=o.id AND j.status='printing'"""


def clean_order(b):
    out = {f: b[f] for f in ORDER_FIELDS if f in b}
    if "first_name" in out and not (out["first_name"] or "").strip():
        raise ApiError("Müşteri adı boş olamaz")
    if "status" in out and out["status"] not in ORDER_STATUSES:
        raise ApiError("Geçersiz durum")
    for f in ("price", "paid"):
        if f in out:
            out[f] = float(out[f]) if out[f] not in (None, "") else None
    if "quantity" in out:
        out["quantity"] = max(1, int(out["quantity"] or 1))
    if "grams" in out:
        out["grams"] = max(0.0, float(out["grams"])) if out["grams"] not in (None, "") else None
    if "print_type" in out and out["print_type"] not in ("FDM", "SLA"):
        out["print_type"] = "SLA"
    if "print_minutes" in out:
        out["print_minutes"] = int(out["print_minutes"]) if out["print_minutes"] not in (None, "") else None
    for f in ("order_date", "due_date"):
        if f in out:
            v = (out[f] or "").strip()
            if v and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
                raise ApiError("Tarih biçimi geçersiz")
            out[f] = v or None
    if out.get("order_date") and out.get("due_date") and out["due_date"] < out["order_date"]:
        raise ApiError("Termin, siparişin geldiği günden önce olamaz")
    return out


def order_row(oid):
    r = db().execute(ORDER_SELECT + " WHERE o.id=?", (oid,)).fetchone()
    if not r:
        raise ApiError("Sipariş bulunamadı", 404)
    return dict(r)


@route("GET", "/api/orders")
def api_orders(req):
    return [dict(r) for r in db().execute(
        ORDER_SELECT + " ORDER BY CASE WHEN o.due_date IS NULL OR o.due_date='' THEN 1 ELSE 0 END, o.due_date, o.id DESC")]


@route("POST", "/api/orders")
def api_order_create(req):
    b = req.json()
    if not (b.get("first_name") or "").strip():
        raise ApiError("Müşteri adı boş olamaz")
    data = clean_order(b)
    data["status"] = "new" if data.get("status") in (None, "printing") else data["status"]
    data.setdefault("order_date", time.strftime("%Y-%m-%d"))
    t = now()
    cols = list(data.keys()) + ["created_at", "updated_at"]
    cur = db().execute(f"INSERT INTO custom_orders({','.join(cols)}) VALUES({','.join('?' * len(cols))})",
                       list(data.values()) + [t, t])
    return order_row(cur.lastrowid)


@route("PUT", "/api/orders/{oid}")
def api_order_update(req, oid):
    oid = int(oid)
    data = clean_order(req.json())
    cur = order_row(oid)
    new_status = data.get("status")
    if new_status == "printing" and not cur["active_job_id"]:
        # Baskıda durumuna yalnızca bir baskı başlatılarak geçilir; istemci baskı penceresini açar
        data.pop("status")
    if new_status and new_status != "printing" and cur["active_job_id"]:
        # Baskı sürerken elle Hazır/Teslim/Yeni/İptal seçildiyse baskıyı da kapat
        job_status = "success" if new_status in ("ready", "delivered") else "cancelled"
        db().execute("UPDATE print_jobs SET status=?, good_quantity=CASE WHEN ?='success' THEN quantity ELSE 0 END, "
                     "finished_at=? WHERE id=?", (job_status, job_status, now(), cur["active_job_id"]))
    if data:
        sets = ", ".join(f"{k}=?" for k in data)
        db().execute(f"UPDATE custom_orders SET {sets}, updated_at=? WHERE id=?", list(data.values()) + [now(), oid])
    return order_row(oid)


@route("DELETE", "/api/orders/{oid}")
def api_order_delete(req, oid):
    oid = int(oid)
    db().execute("UPDATE print_jobs SET status='cancelled', finished_at=? WHERE order_id=? AND status='printing'", (now(), oid))
    db().execute("UPDATE print_jobs SET order_id=NULL WHERE order_id=?", (oid,))
    db().execute("DELETE FROM custom_orders WHERE id=?", (oid,))
    return {"ok": True}


# --- istatistik

TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
SALE_REASONS = ("trendyol", "sale", "scan")


def _month_start(y, m):
    return int(time.mktime((y, m, 1, 0, 0, 0, 0, 0, -1)))


def _add_month(y, m, k):
    m0 = y * 12 + (m - 1) + k
    return m0 // 12, m0 % 12 + 1


def month_weeks(y, m):
    """Ayın haftaları: Pazartesi başlayan takvim haftaları, ay sınırında kırpılır (1. hafta = ayın ilk günü olan hafta)."""
    start, end = _month_start(y, m), _month_start(*_add_month(y, m, 1))
    weeks, t, i = [], start, 1
    while t < end:
        lt = time.localtime(t)
        days_to_monday = 7 - lt.tm_wday                       # tm_wday: Pazartesi=0
        nxt = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday + days_to_monday, 0, 0, 0, 0, 0, -1)))
        we = min(nxt, end)
        last = time.localtime(we - 1)
        weeks.append({"index": i, "label": f"{i}. hafta", "start": t, "end": we,
                      "range": f"{lt.tm_mday}–{last.tm_mday} {TR_MONTHS[m - 1][:3]}" if lt.tm_mday != last.tm_mday else f"{lt.tm_mday} {TR_MONTHS[m - 1][:3]}"})
        t, i = we, i + 1
    return weeks


@route("GET", "/api/stats")
def api_stats(req):
    lt = time.localtime()
    try:
        y, m = (int(x) for x in (req.query.get("month") or f"{lt.tm_year}-{lt.tm_mon:02d}").split("-"))
        assert 1 <= m <= 12
    except Exception:
        raise ApiError("Ay biçimi YYYY-AA olmalı")
    start, end = _month_start(y, m), _month_start(*_add_month(y, m, 1))
    weeks = month_weeks(y, m)
    py, pm = _add_month(y, m, -1)
    pstart = _month_start(py, pm)
    months6 = [_add_month(y, m, k) for k in range(-5, 1)]
    s6 = _month_start(*months6[0])

    def week_of(t):
        for w in weeks:
            if w["start"] <= t < w["end"]:
                return w["index"] - 1
        return None

    prods = {r["id"]: dict(r) for r in db().execute(
        f"SELECT p.id, {PNAME} name, p.thumbnail, p.group_id, p.base_name_x, p.category FROM (SELECT *, name base_name_x FROM products) p")}
    rows = {}
    def row(pid):
        if pid not in rows:
            p = prods.get(pid) or {"name": "Silinmiş ürün", "thumbnail": None, "group_id": None, "base_name_x": "", "category": None}
            rows[pid] = {"id": pid, "name": p["name"], "base_name": p["base_name_x"], "thumbnail": p["thumbnail"], "group_id": p["group_id"],
                         "category": p["category"], "weeks": [0] * len(weeks), "total": 0, "prev_total": 0, "trend": [0] * 6,
                         "trendyol": 0, "manual": 0, "printed": 0}
        return rows[pid]

    ph = ",".join("?" * len(SALE_REASONS))
    by_week, ch = [0] * len(weeks), {"trendyol": 0, "manual": 0}
    for r in db().execute(f"SELECT product_id, delta - COALESCE(shortfall,0) delta, reason, created_at FROM stock_log WHERE reason IN ({ph}) AND created_at>=? AND created_at<?",
                          (*SALE_REASONS, s6, end)):
        if r["product_id"] is None:
            continue
        sold = -r["delta"]           # satış eksi, iptal iadesi artı: net satış
        t = r["created_at"]
        rw = row(r["product_id"])
        for k, (yy, mm) in enumerate(months6):
            if _month_start(yy, mm) <= t < _month_start(*_add_month(yy, mm, 1)):
                rw["trend"][k] += sold
        if pstart <= t < start:
            rw["prev_total"] += sold
        if start <= t < end:
            wi = week_of(t)
            rw["weeks"][wi] += sold
            rw["total"] += sold
            by_week[wi] += sold
            key = "trendyol" if r["reason"] == "trendyol" else "manual"
            rw[key] += sold
            ch[key] += sold

    printed_week, printed, failed, jobs = [0] * len(weeks), 0, 0, 0
    misc = {}
    for r in db().execute("""SELECT j.id, j.product_id, j.component_id, j.status, j.good_quantity, j.quantity, j.finished_at,
                                    c.kind, c.name cname, c.thumbnail cthumb, c.grams cgrams
                             FROM print_jobs j LEFT JOIN components c ON c.id=j.component_id
                             WHERE j.finished_at>=? AND j.finished_at<? AND j.status<>'cancelled'""", (start, end)):
        if r["kind"] == "misc":
            # Diğer amaçlı baskılar üretim sayılarına karışmaz; ayrı satırda gram ve maliyet
            mi = misc.setdefault(r["component_id"], {"id": r["component_id"], "name": r["cname"], "thumbnail": r["cthumb"],
                                                   "jobs": 0, "pieces": 0, "grams": 0.0, "cost": 0.0, "_ids": [], "_est": 0.0})
            mi["jobs"] += 1
            mi["pieces"] += r["good_quantity"] or 0
            mi["_ids"].append(r["id"])
            mi["_est"] += (r["cgrams"] or 0) * (r["quantity"] or 0)
            continue
        jobs += 1
        if r["status"] == "failed":
            failed += 1
        g = r["good_quantity"] or 0
        printed += g
        printed_week[week_of(r["finished_at"])] += g
        if r["product_id"]:
            row(r["product_id"])["printed"] += g

    fil = db().execute("""SELECT COALESCE(SUM(-l.delta),0) FROM spool_log l WHERE l.reason='print' AND l.created_at>=? AND l.created_at<?""",
                       (start, end)).fetchone()[0]
    fil_by = [dict(r) for r in db().execute("""SELECT s.material, s.color_hex, s.color_name, s.brand, ROUND(SUM(-l.delta),1) grams
                                               FROM spool_log l JOIN spools s ON s.id=l.spool_id
                                               WHERE l.reason='print' AND l.created_at>=? AND l.created_at<?
                                               GROUP BY s.material, UPPER(s.color_hex), s.brand ORDER BY grams DESC LIMIT 8""", (start, end))]
    if not fil:   # makara kaydı yoksa ürün gramajından tahmin
        fil = db().execute("""SELECT COALESCE(SUM(p.grams * j.quantity),0) FROM print_jobs j JOIN products p ON p.id=j.product_id
                              WHERE j.finished_at>=? AND j.finished_at<? AND j.status<>'cancelled'""", (start, end)).fetchone()[0]
    od = db().execute("""SELECT COUNT(*) n, COALESCE(SUM(price),0) rev FROM custom_orders WHERE status='delivered'
                         AND updated_at>=? AND updated_at<?""", (start, end)).fetchone()

    if misc:
        sp = spool_prices()
        kg = float(profit_cfg().get("filament_kg") or 0)
        fallback = kg / 1000 if kg else ((sp.get("all") or {}).get("per_g") or 0)
        for mi in misc.values():
            ids = mi.pop("_ids")
            used = db().execute(f"""SELECT js.used, s.price, s.net_weight FROM job_spools js JOIN spools s ON s.id=js.spool_id
                                    WHERE js.job_id IN ({','.join('?' * len(ids))}) AND js.used>0""", ids).fetchall()
            est = mi.pop("_est")
            if used:
                mi["grams"] = round(sum(u["used"] for u in used), 1)
                mi["cost"] = round(sum(u["used"] * ((u["price"] / u["net_weight"]) if u["price"] and u["net_weight"] else fallback) for u in used), 2)
            else:
                mi["grams"] = round(est, 1)
                mi["cost"] = round(est * fallback, 2)
    misc_list = sorted(misc.values(), key=lambda x: -x["grams"])

    products = [r for r in rows.values() if r["total"] or r["prev_total"] or r["printed"] or any(r["trend"])]
    for r in products:
        r["weeks"] = [max(0, v) for v in r["weeks"]]
        r["total"] = max(0, r["total"])
    products.sort(key=lambda r: (-r["total"], -r["prev_total"], r["name"]))
    total = sum(r["total"] for r in products)
    return {
        "month": f"{y}-{m:02d}", "label": f"{TR_MONTHS[m - 1]} {y}", "prev_label": f"{TR_MONTHS[pm - 1]} {py}",
        "is_current": (y, m) == (lt.tm_year, lt.tm_mon), "weeks": weeks,
        "months6": [{"key": f"{yy}-{mm:02d}", "label": TR_MONTHS[mm - 1][:3]} for yy, mm in months6],
        "products": products,
        "misc": misc_list,
        "totals": {"sales": total, "prev_sales": max(0, sum(r["prev_total"] for r in products)),
                   "by_week": [max(0, v) for v in by_week], "printed_by_week": printed_week,
                   "trendyol": max(0, ch["trendyol"]), "manual": max(0, ch["manual"]),
                   "printed": printed, "failed": failed, "jobs": jobs, "filament_g": round(fil or 0), "filament_by": fil_by,
                   "orders_delivered": od["n"], "orders_revenue": od["rev"],
                   "trend": [sum(r["trend"][k] for r in products) for k in range(6)]},
    }


# --- log & dashboard

@route("GET", "/api/log")
def api_log(req):
    limit = min(500, int(req.query.get("limit") or 50))
    args = []
    where = "1=1"
    if req.query.get("product_id"):
        where = "l.product_id=?"
        args.append(int(req.query["product_id"]))
    return [dict(r) for r in db().execute(
        f"""SELECT l.*, {PNAME} product_name, p.thumbnail FROM stock_log l
            LEFT JOIN products p ON p.id=l.product_id WHERE {where}
            ORDER BY l.id DESC LIMIT {limit}""", args)]


def issue_hints(r):
    """Sayım farkının olası sebepleri (en olasıdan başlayarak)."""
    pid, t, hints = r["product_id"], r["created_at"], []
    dbl = db().execute("""SELECT reason, ref, created_at FROM stock_log WHERE product_id=? AND id<>? AND delta<=0
                          AND reason IN ('scan','sale','trendyol') AND reason<>? AND ABS(created_at-?)<=2*86400
                          ORDER BY ABS(created_at-?) LIMIT 1""", (pid, r["id"], r["reason"], t, t)).fetchone()
    if dbl and {dbl["reason"], r["reason"]} & {"scan", "sale"} and "trendyol" in {dbl["reason"], r["reason"]}:
        hints.append({"kind": "double", "text": "Çift düşüm olabilir: aynı günlerde bu ürün hem Trendyol siparişinden hem barkod/elle satıştan düşülmüş."})
    jobs = db().execute("""SELECT id, quantity FROM print_jobs WHERE product_id=? AND status='printing' AND ends_at<?""", (pid, now())).fetchall()
    if jobs:
        hints.append({"kind": "job", "text": f"Süresi dolmuş ama sonucu girilmemiş baskı var ({', '.join('#%d (%d adet)' % (j['id'], j['quantity']) for j in jobs[:3])}). Baskılar'dan \"Sağlam\" diye onaylayın."})
    pl = load_parts(pid).get(pid, [])
    if pl:
        have = sum(min(x["stock"], x["per_unit"]) for x in pl)
        hints.append({"kind": "parts", "text": f"Çok parçalı ürün: stok sadece tam setleri sayar. Elde sonraki set için {have}/{sum(x['per_unit'] for x in pl)} parça var; eksik parçayı basıp girin."})
    if r["reason"] == "trendyol":
        g = db().execute("SELECT group_id FROM products WHERE id=?", (pid,)).fetchone()
        if g and g["group_id"]:
            hints.append({"kind": "match", "text": "Renk varyantı olan ürün: Trendyol barkodunun doğru renge bağlı olduğunu kontrol edin."})
    last = db().execute("SELECT MAX(created_at) m FROM stock_log WHERE product_id=? AND reason='print' AND delta>0", (pid,)).fetchone()["m"]
    hints.append({"kind": "print", "text": "Basılan bir parti uygulamaya girilmemiş ya da açılış stoğu eksik girilmiş olabilir." +
                  (f" Son baskı kaydı: {time.strftime('%d.%m %H:%M', time.localtime(last))}." if last else " Bu ürün için hiç baskı kaydı yok.")})
    return hints


@route("GET", "/api/stock-issues")
def api_stock_issues(req):
    rows = db().execute(f"""SELECT l.*, {PNAME} name, p.thumbnail, p.stock FROM stock_log l JOIN products p ON p.id=l.product_id
                            WHERE l.shortfall>0 AND COALESCE(l.resolved,0)=0 AND p.archived=0 ORDER BY l.created_at DESC LIMIT 100""").fetchall()
    return [{**dict(r), "hints": issue_hints(r)} for r in rows]


@route("POST", "/api/stock-issues/{lid}/resolve")
def api_stock_issue_resolve(req, lid):
    db().execute("UPDATE stock_log SET resolved=1 WHERE id=?", (int(lid),))
    return {"ok": True}


@route("POST", "/api/stock-issues/resolve-all")
def api_stock_issue_resolve_all(req):
    db().execute("UPDATE stock_log SET resolved=1 WHERE shortfall>0")
    return {"ok": True}


@route("GET", "/api/dashboard")
def api_dashboard(req):
    c = db()
    day0 = now() - 24 * 3600
    week0 = now() - 7 * 24 * 3600
    return {
        "products": c.execute("SELECT COUNT(*) FROM products WHERE archived=0").fetchone()[0],
        "stock_total": c.execute("SELECT COALESCE(SUM(stock),0) FROM products WHERE archived=0").fetchone()[0],
        "in_production": c.execute("SELECT COALESCE(SUM(quantity),0) FROM print_jobs WHERE status='printing'").fetchone()[0],
        "low_stock": c.execute("SELECT COUNT(*) FROM products WHERE archived=0 AND stock<=min_stock AND min_stock>0").fetchone()[0],
        "negative_stock": c.execute("SELECT COUNT(*) FROM products WHERE archived=0 AND stock<0").fetchone()[0],
        "open_orders": c.execute("SELECT COUNT(*) FROM custom_orders WHERE status IN ('new','printing','ready')").fetchone()[0],
        "sold_24h": -c.execute("SELECT COALESCE(SUM(delta - COALESCE(shortfall,0)),0) FROM stock_log WHERE (delta<0 OR shortfall>0) AND reason IN ('trendyol','sale','scan') AND created_at>=?", (day0,)).fetchone()[0],
        "stock_issues": c.execute("SELECT COUNT(*) FROM stock_log l JOIN products p ON p.id=l.product_id WHERE l.shortfall>0 AND COALESCE(l.resolved,0)=0 AND p.archived=0").fetchone()[0],
        "printed_7d": c.execute("SELECT COALESCE(SUM(delta),0) FROM stock_log WHERE reason='print' AND created_at>=?", (week0,)).fetchone()[0],
        "failed_7d": c.execute("SELECT COUNT(*) FROM print_jobs WHERE status='failed' AND finished_at>=?", (week0,)).fetchone()[0],
        "grams_7d": c.execute("""SELECT COALESCE(SUM(p.grams * j.quantity * 1.0 / CASE
                                    WHEN EXISTS(SELECT 1 FROM job_parts jp WHERE jp.job_id=j.id)
                                    THEN MAX(1, (SELECT SUM(per_unit) FROM product_parts pp WHERE pp.product_id=p.id))
                                    ELSE 1 END),0)
                                FROM print_jobs j JOIN products p ON p.id=j.product_id
                                WHERE j.started_at>=? AND j.status<>'cancelled'""", (week0,)).fetchone()[0],
        "ty_unmatched": c.execute("SELECT COUNT(*) FROM ty_lines WHERE state='unmatched'").fetchone()[0],
    }


# --- settings & trendyol

@route("GET", "/api/categories")
def api_categories(req):
    counts = {r["category"]: r["c"] for r in db().execute(
        "SELECT category, COUNT(*) c FROM products WHERE archived=0 GROUP BY category")}
    return [{**c, "count": counts.get(c["name"], 0)} for c in get_categories()]


@route("PUT", "/api/categories")
def api_categories_save(req):
    """Liste sırası korunur. old_name verilirse yeniden adlandırılır (ürünler de güncellenir);
    listede olmayan eski kategorilerin ürünleri kategorisiz kalır."""
    items = req.json().get("categories") or []
    out, seen = [], set()
    for it in items:
        name = (it.get("name") or "").strip()
        if not name:
            raise ApiError("Kategori adı boş olamaz")
        if len(name) > 40:
            raise ApiError("Kategori adı çok uzun")
        if name.lower() in seen:
            raise ApiError(f"“{name}” iki kez yazılmış")
        seen.add(name.lower())
        old = (it.get("old_name") or "").strip()
        if old and old != name:
            db().execute("UPDATE products SET category=? WHERE category=?", (name, old))
        prev = next((c for c in get_categories() if c["name"] in (old or name, name)), {})
        com = it["commission"] if "commission" in it else prev.get("commission")   # Ayarlar ekranı göndermezse korunur
        com = _num(com, "Komisyon", 0, 99) if com not in (None, "") else None
        out.append({"name": name, "no_materials": bool(it.get("no_materials")), "no_parts": bool(it.get("no_parts")), "commission": com})
    keep = {c["name"] for c in out}
    for c in get_categories():
        if c["name"] not in keep and not any((it.get("old_name") or "") == c["name"] for it in items):
            db().execute("UPDATE products SET category=NULL WHERE category=?", (c["name"],))
    set_setting("categories", json.dumps(out, ensure_ascii=False))
    return api_categories(req)


# ---------------------------------------------------------------- kâr hesabı
# Tüm tutarlar KDV dahil girilir. Komisyon, kargo, hizmet bedeli, filament ve ambalaj faturalı olduğundan
# KDV'leri mahsup edilir: kâr = (satış − tüm giderler) ÷ (1 + KDV).
PROFIT_DEFAULTS = {
    "commission": 20.0, "vat": 20.0, "service_fee": 13.19,
    "cargo_tiers": [{"upto": 200, "fee": 46.49}, {"upto": 300, "fee": 84.49}],
    "cargo_over": 98.34, "packaging": 0.0, "fire_pct": 0.0, "filament_kg": 0.0,
    # Trendyol minimum sipariş adedi baremleri: bu fiyatın altındaki üründen müşteri en az şu kadar alır
    "min_qty": [{"upto": 25, "qty": 6}, {"upto": 35, "qty": 4}, {"upto": 50, "qty": 3}, {"upto": 75, "qty": 2}],
}


def profit_cfg():
    cfg = dict(PROFIT_DEFAULTS)
    try:
        cfg.update(json.loads(get_setting("profit", "{}") or "{}"))
    except ValueError:
        pass
    return cfg


def _num(v, name, lo=0.0, hi=1e7):
    try:
        x = float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        raise ApiError(f"{name} sayı olmalı")
    if not lo <= x <= hi:
        raise ApiError(f"{name} {lo:g} ile {hi:g} arasında olmalı")
    return round(x, 2)


def spool_prices():
    """Makara alış fiyatlarından gram fiyatı: renk+marka, renk, malzeme ve genel ortalama."""
    by = {"color_brand": {}, "color": {}, "material": {}}
    allp = []
    for r in db().execute("SELECT color_hex, brand, material, price, net_weight FROM spools WHERE price>0 AND net_weight>0"):
        g = r["price"] / r["net_weight"]
        allp.append(g)
        hx = (r["color_hex"] or "").upper()
        if hx:
            by["color"].setdefault(hx, []).append(g)
            by["color_brand"].setdefault(f"{hx}|{(r['brand'] or '').strip().lower()}", []).append(g)
        by["material"].setdefault(r["material"] or "", []).append(g)
    avg = lambda xs: round(sum(xs) / len(xs), 5)
    out = {k: {kk: {"per_g": avg(v), "n": len(v)} for kk, v in d.items()} for k, d in by.items()}
    out["all"] = {"per_g": avg(allp), "n": len(allp)} if allp else None
    return out


def _gram_price(hx, brand, material, prices, cfg):
    hx = (hx or "").upper()
    if hx:
        cb = prices["color_brand"].get(f"{hx}|{(brand or '').strip().lower()}")
        if cb:
            return cb["per_g"]
        if hx in prices["color"]:
            return prices["color"][hx]["per_g"]
    if material and material in prices["material"]:
        return prices["material"][material]["per_g"]
    if material == "Reçine":
        return None
    return cfg["filament_kg"] / 1000 if cfg.get("filament_kg") else (prices["all"]["per_g"] if prices.get("all") else None)


def approx_unit_cost(p, prices, cfg):
    """Ürünün 1 adet (set) malzeme maliyeti, kabaca (istemcideki hesabın sadeleştirilmişi). Bilinmiyorsa None."""
    grams = float(p.get("grams") or 0)
    if not grams:
        return None
    mats = p.get("materials") or []
    material = "Reçine" if p.get("print_type") == "SLA" else None
    known = sum(m.get("grams") or 0 for m in mats)
    slots = [(m.get("color_hex"), m.get("brand"), grams * ((m["grams"] / known) if known and m.get("grams") else 1 / len(mats))) for m in mats] or [(None, None, grams)]
    cost = 0.0
    for hx, br, g in slots:
        gp = _gram_price(hx, br, material, prices, cfg)
        if gp is None:
            return None
        cost += g * gp
    return cost


def weekly_summary(start, end):
    """Haftalık özet (start ≤ t < end, saniye). Trendyol kârı yaklaşıktır: komisyon, kargo baremi, hizmet bedeli,
    ambalaj, malzeme (gram × makara fiyatı) ve KDV düşülür."""
    c = db()
    span = end - start
    sold = lambda a, b: -(c.execute("""SELECT COALESCE(SUM(delta - COALESCE(shortfall,0)),0) FROM stock_log
                                       WHERE reason IN ('trendyol','sale','scan') AND delta<0 AND created_at>=? AND created_at<?""", (a, b)).fetchone()[0] or 0)
    sales, prev = sold(start, end), sold(start - span, start)
    cfg, prices = profit_cfg(), spool_prices()
    prods = {p["id"]: p for p in load_products(include_archived=True)}
    cats = {x["name"]: x for x in get_categories()}
    pk = {}
    for r in c.execute("""SELECT package_id, product_id, quantity, unit_price, pkg_total FROM ty_lines
                          WHERE order_date>=? AND order_date<? AND COALESCE(state,'')<>'cancelled'""", (start * 1000, end * 1000)):
        pk.setdefault(r["package_id"], []).append(r)
    rev = profit = 0.0
    exact = True
    onos = {}
    for pid_, lines in pk.items():
        o = c.execute("SELECT MAX(order_number) FROM ty_lines WHERE package_id=?", (pid_,)).fetchone()[0]
        if o:
            onos[pid_] = str(o)
    real = finans.cargo_by_order(list(onos.values()))
    for pid_, lines in pk.items():
        P = com = mat = extra = 0.0
        over = None
        for l in lines:
            if l["unit_price"] is None:
                exact = False
                continue
            q = l["quantity"] or 0
            P += l["unit_price"] * q
            p = prods.get(l["product_id"])
            cp = (p.get("commission_pct") if p else None)
            if cp is None and p:
                cp = p.get("ty_commission")
            if cp is None and p and (cats.get(p.get("category")) or {}).get("commission") is not None:
                cp = cats[p["category"]]["commission"]
            com += l["unit_price"] * q * (cfg["commission"] if cp is None else cp) / 100
            uc = approx_unit_cost(p, prices, cfg) if p else None
            if uc is None:
                exact = False
            mat += (uc or 0) * q
            extra += float((p or {}).get("extra_cost") or 0) * q
            if p and p.get("cargo_fee") is not None:
                over = max(over or 0, p["cargo_fee"])
        if not P:
            continue
        tot = max((l["pkg_total"] or 0) for l in lines) or P
        cargo = next((t["fee"] for t in cfg["cargo_tiers"] if tot < t["upto"]), over if over is not None else cfg["cargo_over"])
        if onos.get(pid_) in real:
            cargo = real[onos[pid_]]["amount"]
        net = P - com - cargo - cfg["service_fee"] - cfg["packaging"] - mat * (1 + cfg["fire_pct"] / 100) - extra
        rev += P
        profit += net / (1 + cfg["vat"] / 100)
    jobs = c.execute(f"""{JOB_SELECT} WHERE j.status IN ('success','partial','failed') AND j.finished_at>=? AND j.finished_at<?""",
                     (start, end)).fetchall()
    used = {r["job_id"]: r["g"] for r in c.execute(
        """SELECT js.job_id, SUM(js.used) g FROM job_spools js JOIN print_jobs j ON j.id=js.job_id
           WHERE j.finished_at>=? AND j.finished_at<? GROUP BY js.job_id""", (start, end))}
    units = good = failed = 0
    grams = 0.0
    for j in jobs:
        g = used.get(j["id"]) or j["file_grams"] or ((j["unit_grams"] or 0) * (j["quantity"] or 0))
        grams += g or 0
        if j["is_misc"]:
            continue
        units += j["quantity"] or 0
        good += min(j["quantity"] or 0, j["good_quantity"] or 0)
        failed += j["status"] != "success"
    behind = c.execute("""SELECT COUNT(*) FROM ty_buybox WHERE buybox_order>1 AND buybox_price IS NOT NULL AND our_price IS NOT NULL
                          AND buybox_price < our_price - 0.009""").fetchone()[0] if get_setting("ty_enabled", "0") == "1" else None
    cut = now() - 30 * 86400
    dead = [p for p in prods.values() if not p.get("archived") and (p.get("stock") or 0) > 0
            and (p.get("last_sale_at") or 0) < cut and (p.get("created_at") or 0) < cut]
    return {"start": start, "end": end, "sales": sales, "prev_sales": prev, "orders": len(pk), "revenue": round(rev, 2),
            "profit": round(profit, 2), "profit_exact": exact, "jobs": len(jobs), "printed": good, "units": units, "failed_jobs": failed,
            "waste": round(1 - good / units, 3) if units else 0, "grams": round(grams), "buybox_behind": behind,
            "dead": len(dead), "dead_units": sum(p["stock"] for p in dead)}


@route("GET", "/api/weekly")
def api_weekly(req):
    """Son tamamlanan haftanın özeti (Pazartesi 00:00'dan Pazartesi 00:00'a, yerel saat); her istekte yeniden hesaplanır."""
    end = notify._week_start(now())
    lt = time.localtime(end)
    start = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday - 7, 0, 0, 0, 0, 0, -1)))
    d = weekly_summary(start, end)
    return {**d, "title": f"Haftalık özet · {notify._range_text(start, end)}", "text": notify.weekly_text(d),
            "weekly_at": get_setting("weekly_at", "1 09:00") or "1 09:00"}


@route("GET", "/api/profit")
def api_profit(req):
    return {"cfg": profit_cfg(), "prices": spool_prices()}


@route("PUT", "/api/profit")
def api_profit_save(req):
    b = req.json()
    cfg = profit_cfg()
    for k, name, hi in (("commission", "Komisyon", 99), ("vat", "KDV", 99), ("service_fee", "Hizmet bedeli", 1e5),
                        ("cargo_over", "Kargo", 1e5), ("packaging", "Ambalaj", 1e5), ("fire_pct", "Fire payı", 500),
                        ("filament_kg", "Filament fiyatı", 1e6)):
        if k in b:
            cfg[k] = _num(b[k] or 0, name, 0, hi)
    if "cargo_tiers" in b:
        tiers = []
        for t in b["cargo_tiers"] or []:
            tiers.append({"upto": _num(t.get("upto"), "Kargo sınırı", 0.01), "fee": _num(t.get("fee") or 0, "Kargo ücreti", 0, 1e5)})
        tiers.sort(key=lambda t: t["upto"])
        if len({t["upto"] for t in tiers}) != len(tiers):
            raise ApiError("Kargo sınırları birbirinden farklı olmalı")
        cfg["cargo_tiers"] = tiers[:6]
    if "min_qty" in b:
        mq = []
        for t in b["min_qty"] or []:
            if t.get("upto") in (None, "") or t.get("qty") in (None, ""):
                continue
            mq.append({"upto": _num(t.get("upto"), "Fiyat sınırı", 0.01), "qty": int(_num(t.get("qty"), "Minimum adet", 1, 99))})
        mq.sort(key=lambda t: t["upto"])
        if len({t["upto"] for t in mq}) != len(mq):
            raise ApiError("Minimum adet baremlerinin sınırları birbirinden farklı olmalı")
        cfg["min_qty"] = mq[:8]
    set_setting("profit", json.dumps({k: cfg[k] for k in PROFIT_DEFAULTS}))
    db().commit()
    return {"cfg": cfg, "prices": spool_prices()}


@route("GET", "/api/backups")
def api_backups(req):
    return yedek.listing()


@route("POST", "/api/backups", lock=False)
def api_backup_make(req):
    info = yedek.make("elle")
    return {**yedek.listing(), "made": info}


@route("PUT", "/api/backups/settings")
def api_backup_settings(req):
    d = (req.json().get("dir") or "").strip()
    if d:
        if not os.path.isabs(d):
            raise ApiError("Tam klasör yolu yazın (ör. C:\\Users\\...\\OneDrive\\Astera yedek)")
        if not os.path.isdir(d):
            raise ApiError("Bu klasör bulunamadı; önce klasörü oluşturun")
        if os.path.abspath(d).startswith(os.path.abspath(DATA_DIR)):
            raise ApiError("Ek klasör data klasörünün dışında olmalı")
    set_setting("backup_dir", d)
    db().commit()
    return yedek.listing()


@route("POST", "/api/backups/restore")
def api_backup_restore(req):
    name = req.json().get("name") or ""
    keep = {k: get_setting(k) for k in ("backup_dir",)}
    try:
        before = yedek.restore(name)
    except ValueError as e:
        raise ApiError(str(e))
    finans.migrate(db())
    musteri.migrate(db())
    migrate()
    for k, v in keep.items():
        if v is not None:
            set_setting(k, v)
    set_setting("backup_last", json.dumps(before))
    db().commit()
    bambu.reload()
    return {"ok": True, "before": before["name"]}


@route("GET", "/api/settings")
def api_settings(req):
    return {**trendyol.public_settings(), "lan_ips": lan_addresses()}


@route("PUT", "/api/settings")
def api_settings_save(req):
    b = req.json()
    trendyol.save_settings(b)
    if "printers" in b:
        bambu.reload()
    return {**trendyol.public_settings(), "lan_ips": lan_addresses()}


@route("POST", "/api/trendyol/test", lock=False)
def api_ty_test(req):
    return trendyol.test_connection()


@route("POST", "/api/trendyol/sync", lock=False)
def api_ty_sync(req):
    return trendyol.sync(manual=True)


@route("POST", "/api/trendyol/open-preview", lock=False)
def api_ty_open_preview(req):
    return trendyol.preview_open_orders()


@route("POST", "/api/trendyol/diagnose", lock=False)
def api_ty_diagnose(req):
    return trendyol.diagnose()


@route("GET", "/api/notifications/recent")
def api_notifications_recent(req):
    return notify.recent(int(req.query.get("sec") or 300))


@route("GET", "/api/push/key")
def api_push_key(req):
    return {"key": push.public_key(), "subscribers": push.count()}


@route("POST", "/api/push/subscribe")
def api_push_subscribe(req):
    b = req.json()
    try:
        push.subscribe(b.get("subscription"), b.get("ua") or "")
    except ValueError as e:
        raise ApiError(str(e))
    return {"ok": True, "subscribers": push.count()}


@route("POST", "/api/push/unsubscribe")
def api_push_unsubscribe(req):
    push.unsubscribe((req.json().get("endpoint") or ""))
    return {"ok": True}


@route("POST", "/api/push/test")
def api_push_test(req):
    t = now()
    db().execute("""INSERT INTO notifications(key,kind,level,title,body,created_at,updated_at,cleared)
                    VALUES(?, 'printer', 'info', 'Deneme bildirimi', 'Telefon bildirimleri çalışıyor.', ?, ?, 1)""", (f"test:{t}", t, t))
    db().commit()
    push.send_async()
    return {"ok": True, "subscribers": push.count()}


@route("GET", "/api/notifications")
def api_notifications(req):
    notify.tick()
    return notify.items()


@route("POST", "/api/notifications/{nid}/resolve")
def api_notification_resolve(req, nid):
    notify.resolve(int(nid))
    return {"ok": True}


@route("POST", "/api/notifications/resolve-all")
def api_notification_resolve_all(req):
    notify.resolve()
    return {"ok": True}


@route("POST", "/api/printers/elegoo-test")
def api_elegoo_test(req):
    ip = (req.json().get("ip") or "").strip()
    if not re.fullmatch(r"[0-9]{1,3}(\.[0-9]{1,3}){3}", ip):
        raise ApiError("Geçerli bir IP adresi girin (ör. 192.168.1.60)")
    return bambu.sdcp_test(ip)


@route("GET", "/api/bambu")
def api_bambu(req):
    snap = bambu.snapshot()
    printers = []
    for p in snap["printers"]:
        p = dict(p)
        if p.get("error_code") or p.get("state") == "FAILED":
            # Üst bardaki kırmızı ışık: kullanıcı bildirimi "gördüm" dediyse yanıp sönmeyi bırakır (hata sürdükçe kırmızı kalır)
            n = db().execute("SELECT id, resolved_at, resolved_by FROM notifications WHERE key=? ORDER BY id DESC LIMIT 1",
                             (f"perr:{p.get('name')}:{p.get('file') or ''}",)).fetchone()
            if n:
                p["err_nid"] = n["id"] if n["resolved_at"] is None else None
                p["err_ack"] = n["resolved_by"] == "user"
        printers.append(p)
    return {**snap, "printers": printers}


@route("POST", "/api/bambu/events/{eid}/dismiss")
def api_bambu_dismiss(req, eid):
    bambu.dismiss_event(unquote(eid))
    return {"ok": True}


# ---------------------------------------------------------------- Trendyol ürünleri

def _ty_index():
    """barkod / stok kodu (küçük harf) → Trendyol ürünü"""
    idx = {}
    for r in db().execute("SELECT * FROM ty_products"):
        d = dict(r)
        d["images"] = json.loads(d["images"] or "[]")
        for k in (d["barcode"], d["stock_code"]):
            if k:
                idx.setdefault(k.strip().lower(), d)
    return idx


def _ty_for(prow, idx):
    for c in split_codes(prow["barcodes"]):
        if c in idx:
            return idx[c]
    return None


IMG_HOSTS = re.compile(r"^https://([a-z0-9-]+\.)*(dsmcdn\.com|trendyol\.com|trendyol-img\.com)/", re.I)


def download_image(url):
    """Trendyol görselini indirip uploads'a kaydeder (yalnızca Trendyol'un görsel sunucuları)."""
    test_base = os.environ.get("ATOLYE_TY_BASE")   # test sunucusu
    if not IMG_HOSTS.match(url or "") and not (test_base and (url or "").startswith(test_base)):
        raise ApiError("Görsel adresi Trendyol'a ait değil")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Astera"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            ctype = (r.headers.get("Content-Type") or "").lower()
            raw = r.read(8 * 1024 * 1024 + 1)
    except Exception as e:
        raise ApiError(f"Görsel indirilemedi: {e}")
    if len(raw) > 8 * 1024 * 1024:
        raise ApiError("Görsel çok büyük")
    ext = "png" if "png" in ctype else "webp" if "webp" in ctype else "jpg"
    return save_image_bytes(raw, ext)


def apply_ty_products():
    """Eşleşen ürünlere Trendyol fiyatını, komisyonunu, başlığını yazar; görseli olmayanlara ilk görseli indirir.
    Kilit sadece veritabanı işlerinde tutulur; indirme kilitsiz yapılır."""
    with DB_LOCK:
        idx = _ty_index()
        need_img, n = [], 0
        for p in db().execute("SELECT id, barcodes, thumbnail FROM products WHERE archived=0").fetchall():
            ty = _ty_for(p, idx)
            if not ty:
                continue
            n += 1
            db().execute("""UPDATE products SET sale_price=COALESCE(?, sale_price), ty_commission=?, ty_title=?, ty_url=?, ty_barcode=?
                            WHERE id=?""", (ty["sale_price"], ty["commission"], ty["title"], ty["url"], ty["barcode"], p["id"]))
            if not p["thumbnail"] and ty["images"]:
                need_img.append((p["id"], ty["images"][0]))
        db().commit()
    got = 0
    for pid, url in need_img:
        try:
            u = download_image(url)
        except ApiError:
            continue
        with DB_LOCK:
            db().execute("UPDATE products SET thumbnail=? WHERE id=? AND (thumbnail IS NULL OR thumbnail='')", (u, pid))
            db().commit()
        got += 1
    return {"matched": n, "images": got}


# ---------------------------------------------------------------- Buybox

def buybox_payload():
    pmap = {}
    for p in db().execute(f"SELECT id, {PNAME} name, thumbnail, barcodes, ty_barcode, category, sale_price FROM products p WHERE archived=0"):
        for c in split_codes(p["barcodes"]) + split_codes(p["ty_barcode"]):
            pmap.setdefault(c, dict(p))
    tys = {r["barcode"]: dict(r) for r in db().execute("SELECT barcode, title, images, url, commission, sale_price FROM ty_products")}
    hist = {}
    for r in db().execute("SELECT * FROM ty_buybox_log WHERE at>=? ORDER BY at DESC", (now() - 30 * 86400,)):
        h = hist.setdefault(r["barcode"], [])
        if len(h) < 8:
            h.append({"at": r["at"], "order": r["buybox_order"], "buybox": r["buybox_price"], "second": r["second_price"], "ours": r["our_price"]})
    items = []
    for r in db().execute("SELECT * FROM ty_buybox WHERE multi=1 OR buybox_order>1"):
        ty = tys.get(r["barcode"]) or {}
        p = pmap.get(r["barcode"].lower())
        imgs = json.loads(ty.get("images") or "[]")
        ours, bb, order = r["our_price"], r["buybox_price"], r["buybox_order"]
        if order == 1:
            status = "win"
        elif bb is not None and ours is not None and bb < ours - 0.009:
            status = "cheaper"      # rakip bizden ucuza buybox'ta
        else:
            status = "other"        # buybox başkasında ama fiyat farkı değil (satıcı puanı / kargo vb.)
        items.append({"barcode": r["barcode"], "title": ty.get("title"), "image": imgs[0] if imgs else None, "url": ty.get("url"),
                      "product_id": p["id"] if p else None, "name": p["name"] if p else (ty.get("title") or r["barcode"]),
                      "thumbnail": (p or {}).get("thumbnail") or (imgs[0] if imgs else None), "category": (p or {}).get("category"),
                      "commission": ty.get("commission"), "order": order, "ours": ours, "buybox": bb,
                      "second": r["second_price"], "third": r["third_price"], "status": status,
                      "diff": round(ours - bb, 2) if ours is not None and bb is not None else None,
                      "checked_at": r["checked_at"], "changed_at": r["changed_at"], "lost_since": r["lost_since"],
                      "history": hist.get(r["barcode"], [])})
    rank = {"cheaper": 0, "other": 1, "win": 2}
    items.sort(key=lambda x: (rank[x["status"]], -(x["diff"] or 0), x["name"].lower()))
    return {"items": items, "checked_at": int(get_setting("ty_buybox_sync", "0") or 0), "error": get_setting("ty_buybox_error", "") or "",
            "every_min": trendyol.BUYBOX_EVERY // 60, "enabled": get_setting("ty_enabled", "0") == "1",
            "configured": bool(get_setting("ty_seller_id", "") and get_setting("ty_api_key", ""))}


@route("GET", "/api/trendyol/buybox")
def api_buybox(req):
    return buybox_payload()


@route("POST", "/api/trendyol/buybox/check", lock=False)
def api_buybox_check(req):
    # Trendyol'a onlarca istek atabilir: kilidi tutmadan çalışır, veritabanı işleri kendi içinde kilitli
    try:
        res = trendyol.check_buybox()
    except trendyol.TrendyolError as e:
        raise ApiError(str(e))
    with DB_LOCK:
        notify.tick(force=True)
        db().commit()
        return {**buybox_payload(), "result": res}


@route("GET", "/api/trendyol/products")
def api_ty_products(req):
    idx_rows = [dict(r) for r in db().execute("SELECT * FROM ty_products ORDER BY main_id, title")]
    matched = {}
    for p in db().execute("SELECT id, barcodes, name || COALESCE(' — ' || NULLIF(variant_label,''), '') name FROM products WHERE archived=0"):
        for c in split_codes(p["barcodes"]):
            matched.setdefault(c, {"id": p["id"], "name": p["name"]})
    items = []
    for r in idx_rows:
        r["images"] = json.loads(r["images"] or "[]")
        m = matched.get((r["barcode"] or "").lower()) or matched.get((r["stock_code"] or "").lower())
        r["product_id"], r["product_name"] = (m["id"], m["name"]) if m else (None, None)
        items.append(r)
    return {"items": items, "last_sync": int(get_setting("ty_products_sync", "0") or 0),
            "error": get_setting("ty_products_error", "") or ""}


@route("POST", "/api/trendyol/products/sync")
def api_ty_products_sync(req):
    return trendyol.sync_products()


@route("GET", "/api/products/{pid}/trendyol")
def api_product_ty(req, pid):
    p = db().execute("SELECT barcodes FROM products WHERE id=?", (int(pid),)).fetchone()
    if not p:
        raise ApiError("Ürün bulunamadı", 404)
    ty = _ty_for(p, _ty_index())
    return ty or {}


@route("POST", "/api/trendyol/image")
def api_ty_image(req):
    url = (req.json().get("url") or "").strip()
    known = any(url in json.loads(r["images"] or "[]") for r in db().execute("SELECT images FROM ty_products"))
    if not known:
        raise ApiError("Bu görsel Trendyol ürünlerinizde yok")
    return {"url": download_image(url)}


@route("POST", "/api/trendyol/products/import")
def api_ty_import(req):
    """Seçilen Trendyol ürünlerini yeni ürün olarak ekler. Aynı ana ürünün (productMainId) renkleri
    tek varyant grubunda toplanır. Ad Trendyol başlığıdır; gram ve filament sonra girilir."""
    b = req.json()
    codes = [str(c) for c in (b.get("barcodes") or [])][:200]
    cat = b.get("category") if b.get("category") in {c["name"] for c in get_categories()} else None
    rows = [dict(r) for r in db().execute(
        f"SELECT * FROM ty_products WHERE barcode IN ({','.join('?' * len(codes))})", codes)] if codes else []
    if not rows:
        raise ApiError("Seçili Trendyol ürünü bulunamadı")
    existing = set()
    for p in db().execute("SELECT barcodes FROM products WHERE archived=0"):
        existing.update(split_codes(p["barcodes"]))
    groups = {}
    for r in rows:
        if r["barcode"].lower() in existing:
            continue
        groups.setdefault(r["main_id"] or r["barcode"], []).append(r)
    t, created = now(), []
    for members in groups.values():
        gid = None
        for r in members:
            variant = (r["color"] or "").strip() if len(members) > 1 else None
            cur = db().execute(
                """INSERT INTO products(name, print_type, category, set_size, barcodes, sale_price, ty_commission, ty_title, ty_url, ty_barcode,
                                        variant_label, stock, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                ((r["title"] or r["barcode"]).strip()[:120], "FDM", cat, 1, r["barcode"], r["sale_price"], r["commission"], r["title"],
                 r["url"], r["barcode"], variant or (f"#{len(created) + 1}" if len(members) > 1 else None), 0, t, t))
            pid = cur.lastrowid
            if len(members) > 1:
                gid = gid or pid
                db().execute("UPDATE products SET group_id=? WHERE id=?", (gid, pid))
            created.append(pid)
    db().commit()
    res = apply_ty_products() if created else {}
    return {"created": len(created), "images": res.get("images", 0)}


@route("GET", "/api/trendyol/orders")
def api_ty_orders(req):
    q = req.query
    d = trendyol.orders(q.get("month"), q.get("from"), q.get("to"))
    cg = finans.cargo_by_order([p["order_number"] for p in d["packages"]])
    for p in d["packages"]:
        c = cg.get(str(p["order_number"]))
        p["cargo_real"] = c["amount"] if c else None
        p["cargo_desi"] = c["desi"] if c else None
    return d


@route("GET", "/api/finance")
def api_finance(req):
    return finans.overview()


@route("GET", "/api/finance/tx")
def api_finance_tx(req):
    q = req.query
    return finans.transactions(q.get("kind"), q.get("type"), (q.get("q") or "").strip()[:60] or None,
                               max(0, int(q.get("page") or 0)), max(10, min(200, int(q.get("size") or 50))))


@route("POST", "/api/finance/sync", lock=False)
def api_finance_sync(req):
    finans.sync_async()
    time.sleep(0.3)
    with DB_LOCK:
        return finans.status()


# ---------------------------------------------------------------- iadeler ve müşteri soruları
@route("GET", "/api/claims")
def api_claims(req):
    return musteri.claims(req.query.get("tab") or "action")


@route("GET", "/api/claims/reasons", lock=False)
def api_claim_reasons(req):
    return musteri.claim_reasons()


@route("POST", "/api/claims/{cid}/approve", lock=False)
def api_claim_approve(req, cid):
    b = req.json()
    return musteri.approve(cid, b.get("item_ids") or [], bool(b.get("restock")))


@route("POST", "/api/claims/{cid}/reject", lock=False)
def api_claim_reject(req, cid):
    b = req.json()
    files = b.get("files") or []
    if not isinstance(files, list) or len(files) > 5:
        raise ApiError("En fazla 5 dosya")
    if not b.get("reason_id"):
        raise ApiError("Ret gerekçesini seçin")
    return musteri.reject(cid, b.get("item_ids") or [], b["reason_id"], b.get("description"), files)


@route("GET", "/api/questions")
def api_questions(req):
    return musteri.questions(req.query.get("tab") or "wait")


@route("POST", "/api/questions/{qid}/answer", lock=False)
def api_question_answer(req, qid):
    return musteri.answer(qid, req.json().get("text"))


@route("POST", "/api/musteri/sync", lock=False)
def api_musteri_sync(req):
    return musteri.sync_all()


@route("POST", "/api/trendyol/picking", lock=False)
def api_ty_picking(req):
    ids = req.json().get("package_ids") or []
    if not isinstance(ids, list) or not ids:
        raise ApiError("Sipariş seçin")
    if len(ids) > 100:
        raise ApiError("Tek seferde en fazla 100 sipariş")
    res = trendyol.set_picking(ids)
    c = etiket.conf()
    if res["done"] and c["auto"] and (c["mode"] in ("share", "net") or os.environ.get("ATOLYE_LABEL_DIR")):
        # yalnızca etiketi Trendyol'dan alınabilen (TEX / Aras) paketler
        with DB_LOCK:
            prov = {r["package_id"]: r["p"] for r in db().execute(
                f"SELECT package_id, MAX(cargo_provider) p FROM ty_lines WHERE package_id IN ({','.join('?' * len(res['done']))}) GROUP BY package_id",
                [str(x) for x in res["done"]])}
        want = [x for x in res["done"] if trendyol.label_supported(prov.get(str(x))) or not prov.get(str(x))]
        res["labels"] = etiket.print_packages(want) if want else {"printed": [], "errors": []}
    return res


@route("POST", "/api/trendyol/label", lock=False)
def api_ty_label(req):
    b = req.json()
    ids = b.get("package_ids") or []
    if not isinstance(ids, list) or not ids or len(ids) > 100:
        raise ApiError("Paket seçin (en fazla 100)")
    return etiket.print_packages(ids, refetch=bool(b.get("refetch")))


@route("POST", "/api/trendyol/label-data", lock=False)
def api_ty_label_data(req):
    """Tarayıcıda çizilip yazdırma penceresiyle basılan kendi etiketimiz için paket bilgileri."""
    b = req.json()
    ids = b.get("package_ids") or []
    if not isinstance(ids, list) or not ids or len(ids) > 100:
        raise ApiError("Paket seçin (en fazla 100)")
    res = trendyol.label_data(ids)
    if b.get("mark", True):
        for x in res["labels"]:
            trendyol.mark_label(x["package_id"])
    return res


@route("POST", "/api/trendyol/label-mark", lock=False)
def api_ty_label_mark(req):
    ids = req.json().get("package_ids") or []
    for x in ids[:100]:
        trendyol.mark_label(x)
    return {"ok": True}


def app_version():
    try:
        with open(os.path.join(BASE_DIR, "VERSION"), encoding="utf-8") as f:
            return f.read().strip()[:20] or None
    except OSError:
        return None


@route("GET", "/api/version", lock=False)
def api_version(req):
    return {"version": app_version(), "platform": "Home Assistant" if os.environ.get("ATOLYE_HA") else ("Windows" if sys.platform.startswith("win") else "Linux")}


@route("GET", "/api/label/settings")
def api_label_settings(req):
    return etiket.public_conf()


@route("PUT", "/api/label/settings")
def api_label_settings_save(req):
    try:
        c = etiket.save_conf(req.json())
    except ValueError as e:
        raise ApiError(str(e))
    db().commit()
    return c


@route("POST", "/api/label/test", lock=False)
def api_label_test(req):
    err = etiket.send(etiket.TEST_ZPL)
    if err:
        raise ApiError(err)
    return {"ok": True}


@route("GET", "/api/trendyol/pick-list", lock=False)
def api_ty_pick_list(req):
    return trendyol.pick_list()


@route("POST", "/api/trendyol/open-import", lock=False)
def api_ty_open_import(req):
    return trendyol.import_open_orders(req.json().get("line_keys") or [])


@route("GET", "/api/trendyol/lines")
def api_ty_lines(req):
    state = req.query.get("state")
    args = []
    where = "1=1"
    if state:
        where = "t.state=?"
        args.append(state)
    return [dict(r) for r in db().execute(
        f"""SELECT t.*, p.name matched_name FROM ty_lines t LEFT JOIN products p ON p.id=t.product_id
            WHERE {where} ORDER BY t.order_date DESC LIMIT 300""", args)]


@route("POST", "/api/trendyol/lines/{key}/match")
def api_ty_match(req, key):
    b = req.json()
    return trendyol.manual_match(unquote(key), int(b.get("product_id") or 0), bool(b.get("save_barcode", True)))


@route("POST", "/api/trendyol/lines/{key}/ignore")
def api_ty_ignore(req, key):
    db().execute("UPDATE ty_lines SET state='ignored', updated_at=? WHERE line_key=? AND state='unmatched'",
                 (now(), unquote(key)))
    return {"ok": True}


# ---------------------------------------------------------------- HTTP server

class Req:
    def __init__(self, handler, query):
        self.h = handler
        self.query = query
        self._body = None

    def body(self):
        if self._body is None:
            n = int(self.h.headers.get("Content-Length") or 0)
            self._body = self.h.rfile.read(n) if n else b""
        return self._body

    def json(self):
        raw = self.body()
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            raise ApiError("Geçersiz istek gövdesi")


class Handler(BaseHTTPRequestHandler):
    server_version = "Astera/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # sessiz

    def _send(self, status, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except (ConnectionError, TimeoutError):
            # Tarayıcı/telefon cevabı beklemeden bağlantıyı kapattı (sayfa yenilendi, ekran kilitlendi): sessizce geç
            self.close_connection = True

    def _api(self, method):
        u = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(u.query).items()}
        for m, rx, fn in ROUTES:
            if m != method:
                continue
            mt = rx.match(u.path)
            if mt:
                req = Req(self, query)
                try:
                    if fn in NOLOCK:
                        res = fn(req, **mt.groupdict())
                    else:
                        with DB_LOCK:
                            try:
                                res = fn(req, **mt.groupdict())
                                db().commit()
                            except Exception:
                                db().rollback()
                                raise
                    self._send(200, res)
                except (ConnectionError, TimeoutError):
                    self.close_connection = True
                except ApiError as e:
                    self._send(e.status, {"error": str(e)})
                except (ValueError, TypeError) as e:
                    self._send(400, {"error": f"Geçersiz değer: {e}"})
                except trendyol.TrendyolError as e:
                    self._send(502, {"error": str(e)})
                except Exception as e:
                    traceback.print_exc()
                    self._send(500, {"error": f"Sunucu hatası: {e}"})
                return
        self._send(404, {"error": "Bulunamadı"})

    def _static(self):
        u = urlparse(self.path)
        path = unquote(u.path)
        if path == "/api/backup":
            with DB_LOCK:
                db().commit()
                tmp = os.path.join(DATA_DIR, "_backup.db")
                bk = sqlite3.connect(tmp)
                db().backup(bk)
                bk.close()
            with open(tmp, "rb") as f:
                data = f.read()
            os.remove(tmp)
            name = time.strftime("atolye-yedek-%Y%m%d-%H%M.db")
            return self._send(200, data, "application/octet-stream",
                              {"Content-Disposition": f'attachment; filename="{name}"'})
        if path == "/api/backups/file":
            fp = yedek.path_of(parse_qs(u.query).get("name", [""])[0])
            if not fp:
                return self._send(404, {"error": "Yedek bulunamadı"})
            with open(fp, "rb") as f:
                data = f.read()
            return self._send(200, data, "application/octet-stream",
                              {"Content-Disposition": f'attachment; filename="{os.path.basename(fp)}"'})
        if path == "/m":
            return self._send(302, b"", "text/plain", {"Location": "/m/"})
        if path in ("/", "/index.html"):
            fp = os.path.join(STATIC_DIR, "index.html")
        elif path in ("/m/", "/m/index.html"):
            fp = os.path.join(STATIC_DIR, "m", "index.html")
        elif path in ("/m/sw.js", "/m/manifest.webmanifest"):
            fp = os.path.join(STATIC_DIR, "m", path.rsplit("/", 1)[1])
        elif path.startswith("/uploads/"):
            fp = os.path.join(UPLOAD_DIR, os.path.basename(path))
        elif path.startswith("/static/"):
            fp = os.path.normpath(os.path.join(STATIC_DIR, path[len("/static/"):]))
            if not fp.startswith(STATIC_DIR):
                return self._send(403, "yasak", "text/plain")
        elif path == "/manifest.webmanifest":
            fp = os.path.join(STATIC_DIR, "manifest.webmanifest")
        else:
            fp = os.path.join(STATIC_DIR, "index.html")
        if not os.path.isfile(fp):
            return self._send(404, "bulunamadı", "text/plain; charset=utf-8")
        ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        if fp.endswith(".webmanifest"):
            ctype = "application/manifest+json"
        if fp.endswith(".js"):
            ctype = "application/javascript"
        if ctype.startswith("text/") or ctype in ("application/javascript",):
            ctype += "; charset=utf-8"
        with open(fp, "rb") as f:
            data = f.read()
        cache = "public, max-age=31536000, immutable" if "/uploads/" in fp else "no-cache"
        self._send(200, data, ctype, {"Cache-Control": cache})

    def do_GET(self):
        if self.path.startswith("/api/") and self.path.split("?")[0] not in ("/api/backup", "/api/backups/file"):
            return self._api("GET")
        self._static()

    do_HEAD = do_GET

    def do_POST(self):
        self._api("POST")

    def do_PUT(self):
        self._api("PUT")

    def do_DELETE(self):
        self._api("DELETE")


def lan_addresses():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except Exception:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


class QuietServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], (ConnectionError, TimeoutError)):
            return   # istemci bağlantıyı kopardı: konsolu doldurma
        super().handle_error(request, client_address)


def _quiet_console():
    """Windows'ta konsol penceresine tıklayınca "Hızlı Düzenleme" seçimi programı dondurur; bu modu kapat."""
    if os.name != "nt":
        return
    try:
        import ctypes
        k = ctypes.windll.kernel32
        h = k.GetStdHandle(-10)
        mode = ctypes.c_uint()
        if k.GetConsoleMode(h, ctypes.byref(mode)):
            k.SetConsoleMode(h, (mode.value & ~0x0040) | 0x0080)   # QUICK_EDIT kapalı, EXTENDED_FLAGS açık
    except Exception:
        pass


def main():
    ap = argparse.ArgumentParser()
    port = int(os.environ.get("ATOLYE_PORT", 8080))
    try:   # Home Assistant eklentisi: seçenekler /data/options.json'da
        with open("/data/options.json", encoding="utf-8") as f:
            port = int(json.load(f).get("port") or port)
    except (OSError, ValueError, TypeError):
        pass
    ap.add_argument("--port", type=int, default=port)
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()
    init_db()
    trendyol.init(db, DB_LOCK, get_setting, set_setting, change_stock, split_codes, now)
    trendyol.on_products = apply_ty_products
    trendyol.start_poller()
    bambu.init(db, DB_LOCK, get_setting, set_setting, now)
    bambu.after_create = auto_assign_spools
    bambu.start()
    with DB_LOCK:
        notify.init(db, DB_LOCK, get_setting, set_setting, bambu)
        push.init(db, DB_LOCK, get_setting, set_setting)
        db().commit()
    notify.on_new = push.send_async
    notify.plan_fn = build_plan
    notify.weekly_fn = weekly_summary
    notify.start()
    yedek.init(db, DB_LOCK, get_setting, set_setting, DATA_DIR)
    etiket.init(db, DB_LOCK, get_setting, set_setting, DATA_DIR)
    with DB_LOCK:
        finans.init(db, DB_LOCK, get_setting, set_setting)
        musteri.init(db, DB_LOCK, get_setting, set_setting, change_stock, trendyol._code_map)
        db().commit()
    finans.start()
    musteri.start()
    yedek.start()
    _quiet_console()
    srv = QuietServer((args.host, args.port), Handler)
    srv.daemon_threads = True
    print("\n  Astera çalışıyor")
    print(f"  Bu bilgisayardan:  http://localhost:{args.port}")
    for ip in lan_addresses():
        print(f"  Telefondan / ağdan: http://{ip}:{args.port}")
    print("\n  Kapatmak için bu pencereyi kapatın veya Ctrl+C.\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
