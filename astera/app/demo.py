"""
Örnek veriler: programı kurmadan gezmek için örnek ürün, baskı, özel sipariş, makara ve Trendyol siparişi ekler.
Eklenen her satır demo_rows tablosuna yazılır; "Örnek verileri sil" yalnızca bunları (ve örnek ürünlere bağlı
sonradan oluşan kayıtları) siler. Kullanıcının kendi verisine dokunulmaz.
"""
import json
import os
import random
import time

_db = _lock = _get = _set = None
UPLOAD_DIR = None

PRODUCTS = [  # ad, tür, gram, dk, stok, en az, kategori, fiyat, renkler [(hex, ad)], şekil
    ("Kanagawa Dalgası Ayraç", "FDM", 14, 55, 9, 5, "Kitap ayracı", 179.99, [("#1E4D8C", "Lacivert"), ("#F2F2F2", "Beyaz")], "wave"),
    ("Ejderha Ayraç", "FDM", 18, 70, 2, 4, "Kitap ayracı", 199.0, [("#2E7D32", "Yeşil"), ("#C9A227", "Altın")], "dragon"),
    ("Anka Kuşu Figür", "SLA", 42, 240, 4, 2, "Figür", 449.9, [("#B23A1E", "Reçine kırmızı")], "bird"),
    ("Totoro Saksı", "FDM", 96, 310, 6, 3, "Saksı", 349.9, [("#7A8B99", "Gri"), ("#F5F0E6", "Krem")], "pot"),
    ("Sakura Ayraç 3'lü Set", "FDM", 30, 95, 12, 6, "Kitap ayracı", 249.0, [("#F4A6C0", "Pembe")], "flower"),
    ("Kalemlik Altıgen", "FDM", 120, 380, 1, 3, "Masaüstü düzenleyici", 289.0, [("#222222", "Siyah")], "hex"),
]
SHAPES = {
    "wave": '<path d="M10 70 C 30 40, 50 40, 60 60 S 90 80, 110 50 L110 110 L10 110Z" fill="{c2}" opacity=".9"/><circle cx="82" cy="34" r="12" fill="{c2}"/>',
    "dragon": '<path d="M25 85 Q40 30 70 40 Q95 48 90 70 Q85 90 60 85 Q45 82 50 70" fill="none" stroke="{c2}" stroke-width="9" stroke-linecap="round"/><circle cx="72" cy="48" r="4" fill="{c2}"/>',
    "bird": '<path d="M60 30 C 40 50, 25 55, 15 50 C 30 65, 45 70, 55 68 L 50 95 L 60 85 L 70 95 L 65 68 C 75 70, 90 65, 105 50 C 95 55, 80 50, 60 30Z" fill="{c2}"/>',
    "pot": '<rect x="30" y="55" width="60" height="45" rx="10" fill="{c2}"/><ellipse cx="60" cy="50" rx="26" ry="20" fill="{c2}"/><circle cx="51" cy="47" r="3" fill="#222"/><circle cx="69" cy="47" r="3" fill="#222"/>',
    "flower": '<g fill="{c2}"><circle cx="60" cy="40" r="13"/><circle cx="80" cy="56" r="13"/><circle cx="72" cy="80" r="13"/><circle cx="48" cy="80" r="13"/><circle cx="40" cy="56" r="13"/></g><circle cx="60" cy="60" r="9" fill="#fff8"/>',
    "hex": '<path d="M60 22 L92 40 L92 78 L60 96 L28 78 L28 40Z" fill="{c2}"/><path d="M60 40 L76 49 L76 69 L60 78 L44 69 L44 49Z" fill="#fff3"/>',
}
CUSTOMERS = [("Ayşe Yılmaz", "İstanbul", "Kadıköy"), ("Mehmet Kaya", "Ankara", "Çankaya"), ("Zeynep Demir", "İzmir", "Bornova"),
             ("Can Arslan", "Bursa", "Nilüfer"), ("Elif Şahin", "Antalya", "Muratpaşa"), ("Burak Çelik", "Eskişehir", "Tepebaşı"),
             ("Selin Aydın", "Kocaeli", "İzmit"), ("Emre Koç", "Adana", "Seyhan")]


def init(db, lock, get_setting, set_setting, upload_dir):
    global _db, _lock, _get, _set, UPLOAD_DIR
    _db, _lock, _get, _set, UPLOAD_DIR = db, lock, get_setting, set_setting, upload_dir
    _db().execute("CREATE TABLE IF NOT EXISTS demo_rows (tbl TEXT, key TEXT)")


def active():
    return _get("demo_on", "") == "1"


def _thumb(i, colors, shape):
    c1 = colors[0][0]
    c2 = colors[1][0] if len(colors) > 1 else "#FFFFFF"
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
           f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c1}" stop-opacity=".75"/></linearGradient>'
           f'<pattern id="l" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#0001"/></pattern></defs>'
           f'<rect width="120" height="120" fill="url(#g)"/>{SHAPES[shape].format(c2=c2)}<rect width="120" height="120" fill="url(#l)"/></svg>')
    name = f"demo-{i + 1}.svg"
    with open(os.path.join(UPLOAD_DIR, name), "w", encoding="utf-8") as f:
        f.write(svg)
    return f"/uploads/{name}"


def _rec(tbl, key):
    _db().execute("INSERT INTO demo_rows(tbl,key) VALUES(?,?)", (tbl, str(key)))


def start():
    """Örnek verileri ekler. _lock altında çağrılır."""
    if active():
        raise ValueError("Örnek veriler zaten yüklü")
    c = _db()
    now = int(time.time())
    rnd = random.Random(7)
    pids = []
    for i, (name, pt, g, mins, stock, mn, cat, price, colors, shape) in enumerate(PRODUCTS):
        cur = c.execute("""INSERT INTO products(name,print_type,thumbnail,grams,print_minutes,pieces_per_print,stock,min_stock,category,set_size,
                                                 parts_same_color,archived,created_at,updated_at,sale_price,barcodes)
                           VALUES(?,?,?,?,?,1,?,?,?,1,1,0,?,?,?,?)""",
                        (name, pt, _thumb(i, colors, shape), g, mins, stock, mn, cat, now - 20 * 86400, now, price, json.dumps([f"DEMO{1000 + i}"])))
        pid = cur.lastrowid
        pids.append(pid)
        _rec("products", pid)
        for pos, (hx, cn) in enumerate(colors):
            c.execute("INSERT INTO product_materials(product_id,position,color_hex,color_name,brand,grams) VALUES(?,?,?,?,?,?)",
                      (pid, pos, hx, cn, "Örnek PLA" if pt == "FDM" else "Örnek reçine", round(g / len(colors), 1)))
    # makineler: hiç yoksa örnek makineler (çıkışta eski hâline döner)
    try:
        printers = json.loads(_get("printers", "[]") or "[]")
    except ValueError:
        printers = []
    _set("demo_prev_printers", json.dumps(printers, ensure_ascii=False))
    if not printers:
        _set("printers", json.dumps([{"name": "Örnek P1S", "kind": "enclosed"}, {"name": "Örnek A1", "kind": "open"},
                                     {"name": "Örnek Saturn", "kind": "resin"}], ensure_ascii=False))
    pr = ["Örnek P1S", "Örnek A1", "Örnek Saturn"]
    # baskılar: ikisi sürüyor, geçmişte bitenler (istatistik için)
    jobs = [(1, 3, pr[0], -40, 30, "printing"), (2, 1, pr[2], -120, 120, "printing")]
    for d in range(1, 15):
        k = rnd.randrange(len(PRODUCTS))
        jobs.append((k, rnd.choice([1, 2, 3]), rnd.choice(pr[:2]) if PRODUCTS[k][1] == "FDM" else pr[2], -d * 1440 - 300, -d * 1440, "success" if d % 6 else "failed"))
    for k, q, p, st, en, status in jobs:
        cur = c.execute("""INSERT INTO print_jobs(product_id,print_type,quantity,printer,note,started_at,ends_at,status,good_quantity,finished_at)
                           VALUES(?,?,?,?,?,?,?,?,?,?)""",
                        (pids[k], PRODUCTS[k][1], q, p, "örnek", now + st * 60, now + en * 60, status,
                         q if status == "success" else (0 if status == "failed" else None), now + en * 60 if status != "printing" else None))
        _rec("print_jobs", cur.lastrowid)
    # makaralar
    for i, (code, br, mat, hx, cn, rem) in enumerate([("901", "Örnek", "PLA", "#1E4D8C", "Lacivert", 640), ("902", "Örnek", "PLA", "#F2F2F2", "Beyaz", 180),
                                                      ("903", "Örnek", "PETG", "#2E7D32", "Yeşil", 910), ("904", "Örnek", "PLA", "#222222", "Siyah", 75)]):
        cur = c.execute("""INSERT INTO spools(code,brand,material,color_hex,color_name,net_weight,remaining,archived,created_at,updated_at,notes)
                           VALUES(?,?,?,?,?,1000,?,0,?,?,?)""", (code, br, mat, hx, cn, rem, now, now, "örnek"))
        _rec("spools", cur.lastrowid)
    # özel siparişler
    items = [{"id": "k1", "name": "Kaptan figürü", "qty": 1, "ptype": "SLA", "printed": 0},
             {"id": "k2", "name": "Asker figürü", "qty": 4, "ptype": "SLA", "printed": 2}]
    for fn, ln, title, q, price, due, status, its in [("Mert", "Örnek", "Masa oyunu ekibi boyamalı", 5, 1500, 3, "printing", items),
                                                       ("Deniz", "Örnek", "Kişiye özel isimlik", 1, 250, 6, "new", None)]:
        cur = c.execute("""INSERT INTO custom_orders(first_name,last_name,title,quantity,price,paid,order_date,due_date,status,created_at,updated_at,print_type,items)
                           VALUES(?,?,?,?,?,0,?,?,?,?,?,?,?)""",
                        (fn, ln, title, q, price, time.strftime("%Y-%m-%d", time.localtime(now - 86400)), time.strftime("%Y-%m-%d", time.localtime(now + due * 86400)), status, now, now, "SLA" if its else "FDM",
                         json.dumps(its, ensure_ascii=False) if its else None))
        _rec("custom_orders", cur.lastrowid)
    # Trendyol siparişleri: yeni (bazıları bugün verilmeli) ve geçmişte teslim edilenler
    # yalnızca pazar yeri seçildiyse (ya da kullanım şekli seçilmediyse)
    modes = [m for m in (_get("use_modes", "") or "").split(",") if m]
    n = 0
    for j in (range(7) if not modes or "ty" in modes else []):
        k = [1, 0, 2, 4, 1, 3, 5][j]
        who, city, dist = CUSTOMERS[j]
        hrs = [3, 7, 20, 30, 44, 60, 70][j]
        n += 1
        on, pk = f"DEMO{90000 + n}", f"DEMOP{90000 + n}"
        c.execute("""INSERT INTO ty_lines(line_key,order_number,package_id,order_date,barcode,product_name,quantity,ty_status,state,product_id,updated_at,
                                          unit_price,pkg_total,customer,city,district,deadline)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (f"demo:{on}", on, pk, (now - (72 - hrs) * 3600) * 1000, f"DEMO{1000 + k}", PRODUCTS[k][0], 1 + (j == 3), "Created", "pending", pids[k], now,
                   PRODUCTS[k][7], PRODUCTS[k][7] * (1 + (j == 3)), who, city, dist, (now + hrs * 3600) * 1000))
        _rec("ty_lines", f"demo:{on}")
    for d in (range(1, 21) if not modes or "ty" in modes else []):
        k = rnd.randrange(len(PRODUCTS))
        who, city, dist = CUSTOMERS[rnd.randrange(len(CUSTOMERS))]
        n += 1
        on = f"DEMO{90000 + n}"
        t = now - d * 86400 - rnd.randrange(30000)
        c.execute("""INSERT INTO ty_lines(line_key,order_number,package_id,order_date,barcode,product_name,quantity,ty_status,state,product_id,updated_at,
                                          unit_price,pkg_total,customer,city,district,deadline,packed_at)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (f"demo:{on}", on, f"DEMOP{90000 + n}", t * 1000, f"DEMO{1000 + k}", PRODUCTS[k][0], 1, "Delivered", "deducted", pids[k], now,
                   PRODUCTS[k][7], PRODUCTS[k][7], who, city, dist, (t + 86400) * 1000, t + 20000))
        _rec("ty_lines", f"demo:{on}")
        c.execute("INSERT INTO stock_log(product_id,delta,stock_after,reason,ref,created_at) VALUES(?,?,?,?,?,?)",
                  (pids[k], -1, PRODUCTS[k][4], "trendyol", on, t + 20000))
    _set("demo_on", "1")
    return {"products": len(pids), "orders": n}


def end():
    """Örnek verileri siler. _lock altında çağrılır."""
    c = _db()
    rows = c.execute("SELECT tbl, key FROM demo_rows").fetchall()
    pids = [r[1] for r in rows if r[0] == "products"]
    qs = ",".join("?" * len(pids))
    if pids:
        for t in ("product_materials", "stock_log", "product_parts"):
            try:
                c.execute(f"DELETE FROM {t} WHERE product_id IN ({qs})", pids)
            except Exception:  # noqa
                pass
        jids = [r[0] for r in c.execute(f"SELECT id FROM print_jobs WHERE product_id IN ({qs})", pids)]
        if jids:
            jq = ",".join("?" * len(jids))
            for t in ("job_spools", "job_parts"):
                try:
                    c.execute(f"DELETE FROM {t} WHERE job_id IN ({jq})", jids)
                except Exception:  # noqa
                    pass
            c.execute(f"DELETE FROM print_jobs WHERE id IN ({jq})", jids)
        c.execute(f"DELETE FROM ty_lines WHERE product_id IN ({qs})", pids)
    key_col = {"ty_lines": "line_key"}
    for tbl, key in rows:
        c.execute(f"DELETE FROM {tbl} WHERE {key_col.get(tbl, 'id')}=?", (key,))
    c.execute("DELETE FROM demo_rows")
    prev = _get("demo_prev_printers", None)
    if prev is not None:
        _set("printers", prev)
    _set("demo_on", "0")
    for f in os.listdir(UPLOAD_DIR):
        if f.startswith("demo-") and f.endswith(".svg"):
            try:
                os.remove(os.path.join(UPLOAD_DIR, f))
            except OSError:
                pass
    return {"ok": True, "removed": len(rows)}
