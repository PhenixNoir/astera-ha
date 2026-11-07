"""
Bildirim merkezi: yazıcı, biten baskı, Trendyol ve stok bildirimlerini tek listede toplar.

Her bildirim bir anahtar (key) taşır. Kontroller birkaç saniyede bir çalışır:
- şartı sağlanan anahtar için aktif bildirim yoksa yenisi açılır (önceki kayıt şart ortadan kalkıp "temizlendiyse"),
- şartı artık sağlanmayan aktif bildirim kendiliğinden çözülür.
Kullanıcının tıkladığı bildirim, şart sürse bile yeniden açılmaz; şart bir kez ortadan kalkıp tekrar oluşursa açılır.
Geçmiş 7 gün tutulur; tüm cihazlarda ortaktır.
"""
import json
import time

_db = _lock = _get = _set = None
bambu = None
_last_tick = 0
on_new = None          # sunucu verir: telefona push yollar
PUSH_PREFIXES = ("pe:", "perr:", "job:", "tylate:", "bb:", "idle:", "week:", "claim:", "qna:")
plan_fn = None          # sunucu verir: üretim planı (boşa çıkan yazıcıya öneri için)
weekly_fn = None        # sunucu verir: weekly_summary(start, end)
_busy_prev = None       # önceki kontrolde meşgul olan yazıcılar
_idle_now = set()       # bu çalışmada meşgulken boşa çıkan yazıcılar   # + yeni sipariş (tynew)
_push = False
_push_ids = []          # bu turda telefona gidecek yeni bildirimler (telefon yalnızca bunları gösterir)

SCHEMA = """
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    kind TEXT,
    level TEXT,
    title TEXT,
    body TEXT,
    action TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    resolved_at INTEGER,
    resolved_by TEXT,
    cleared INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_key ON notifications(key);
"""

LOW_SPOOL_G = 150


def init(db, lock, get_setting, set_setting, bambu_mod):
    global _db, _lock, _get, _set, bambu
    _db, _lock, _get, _set, bambu = db, lock, get_setting, set_setting, bambu_mod
    _db().executescript(SCHEMA)


def _now():
    return int(time.time())


def _latest(key):
    return _db().execute("SELECT * FROM notifications WHERE key=? ORDER BY id DESC LIMIT 1", (key,)).fetchone()


def _upsert(key, kind, level, title, body, action):
    """Şart sağlanıyor: aktif kayıt varsa metnini güncelle, yoksa (ve önceki temizlendiyse) yeni kayıt aç."""
    row, t = _latest(key), _now()
    act = json.dumps(action, ensure_ascii=False) if action else None
    if row and row["resolved_at"] is None:
        if (row["title"], row["body"], row["level"], row["action"]) != (title, body, level, act):
            _db().execute("UPDATE notifications SET title=?, body=?, level=?, action=?, updated_at=? WHERE id=?",
                          (title, body, level, act, t, row["id"]))
        return
    if row and not row["cleared"]:
        return   # kullanıcı kapattı ve şart hâlâ sürüyor: tekrar açma
    cur = _db().execute("""INSERT INTO notifications(key,kind,level,title,body,action,created_at,updated_at)
                     VALUES(?,?,?,?,?,?,?,?)""", (key, kind, level, title, body, act, t, t))
    if key.startswith(PUSH_PREFIXES):
        global _push
        _push = True
        _push_ids.append(cur.lastrowid)


def _sync_group(prefix, wanted, sticky=False):
    """wanted: {key: (kind, level, title, body, action)}. Bu önekle başlayıp artık istenmeyenler çözülür/temizlenir.
    sticky: şart ortadan kalksa da aktif bildirim kullanıcı tıklayana kadar kalır (ör. buybox)."""
    for key, v in wanted.items():
        _upsert(key, *v)
    t = _now()
    rows = _db().execute("SELECT id, key, resolved_at, cleared FROM notifications WHERE key LIKE ? AND (resolved_at IS NULL OR cleared=0)",
                         (prefix + "%",)).fetchall()
    for r in rows:
        if r["key"] in wanted:
            continue
        if r["resolved_at"] is None:
            if sticky:
                continue
            _db().execute("UPDATE notifications SET resolved_at=?, resolved_by='auto', cleared=1 WHERE id=?", (t, r["id"]))
        else:
            _db().execute("UPDATE notifications SET cleared=1 WHERE id=?", (r["id"],))


def _fmt_min(m):
    m = int(m or 0)
    return f"{m // 60} sa {m % 60} dk" if m >= 60 else f"{m} dk"


# ---------------------------------------------------------------- kontroller

def _printers():
    snap = bambu.snapshot() if bambu else {"printers": [], "events": []}
    wanted = {}
    for e in snap["events"]:
        r = e.get("reason")
        if r == "confirm":
            q = e.get("guess_qty") or e.get("objects")
            title = f"{e['printer']}: {e.get('guess') or 'tanınan baskı'}{f' ×{q}' if q else ''} mi?"
            body = ("Baskı bitti — onaylayın, sonucu sorulsun" if e.get("done") else "Onaylayın ya da başka ürün seçin") + f" · {e.get('file') or ''}"
        else:
            title = f"{e['printer']}: {'parçaları seçin' if r == 'parts' else 'tanınmayan baskı'}{' (bitti)' if e.get('done') else ''}"
            body = f"{e.get('file') or 'bilinmeyen dosya'}" + (f" · %{e['percent']}" if e.get("percent") is not None and not e.get("done") else "")
        wanted[f"pe:{e['id']}"] = ("printer", "warn", title, body, {"t": "bambu", "id": e["id"]})
    for p in snap["printers"]:
        name = p.get("name")
        if p.get("error_code") or p.get("state") == "FAILED":
            wanted[f"perr:{name}:{p.get('file') or ''}"] = ("printer", "bad", f"{name}: yazıcı hata bildirdi",
                                                        f"{p.get('file') or ''}" + (f" · hata kodu {p['error_code']}" if p.get("error_code") else ""),
                                                        {"t": "go", "href": "#/baskilar"})
        if p.get("online") is False and not p.get("connecting") and (p.get("updated_at") or 0) < _now() - 120:
            wanted[f"poff:{name}"] = ("printer", "warn", f"{name}: bağlantı yok", p.get("error") or "Yazıcıya ulaşılamıyor",
                                     {"t": "go", "href": "#/ayarlar"})
    _sync_group("pe:", {k: v for k, v in wanted.items() if k.startswith("pe:")})
    _sync_group("perr:", {k: v for k, v in wanted.items() if k.startswith("perr:")})
    _sync_group("poff:", {k: v for k, v in wanted.items() if k.startswith("poff:")})


def _jobs():
    wanted = {}
    for j in _db().execute("""SELECT j.id, j.quantity, j.printer, j.ends_at, j.bambu_state,
                                     COALESCE(p.name || COALESCE(' — ' || NULLIF(p.variant_label,''), ''), c.name, 'Özel sipariş') name
                              FROM print_jobs j LEFT JOIN products p ON p.id=j.product_id LEFT JOIN components c ON c.id=j.component_id
                              WHERE j.status='printing' AND j.ends_at<=?
                                AND COALESCE(j.bambu_state,'') NOT IN ('RUNNING','PREPARE','PAUSE','SLICING')""", (_now(),)):
        failed = j["bambu_state"] == "FAILED"
        wanted[f"job:{j['id']}"] = ("print_done", "bad" if failed else "ok",
                                    f"Baskı {'durdu' if failed else 'bitti'}: {j['name']}",
                                    f"{j['quantity']} adet{' · ' + j['printer'] if j['printer'] else ''} · sonucu girin",
                                    {"t": "job", "id": j["id"]})
    _sync_group("job:", wanted)


def _eff_deadline(ms):
    if not ms:
        return None
    s = int(ms) // 1000
    cut = _get("ship_cutoff") if _get("ship_cutoff") is not None else "17:00"
    if cut:
        try:
            h, m = map(int, cut.split(":"))
            lt = time.localtime(s)
            c = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, h, m, 0, 0, 0, -1)))
            s = min(s, c)
        except ValueError:
            pass
    return s


def _trendyol():
    if not (_get("ty_seller_id") or ""):
        return
    rows = _db().execute("""SELECT t.package_id, t.order_number, t.order_date, t.deadline, t.quantity, t.state, t.barcode, p.thumbnail,
                                   COALESCE(p.name || COALESCE(' — ' || NULLIF(p.variant_label,''), ''), t.product_name) name
                            FROM ty_lines t LEFT JOIN products p ON p.id=t.product_id
                            WHERE t.ty_status IN ('Created','Awaiting')""").fetchall()
    pk = {}
    for r in rows:
        g = pk.setdefault(r["package_id"] or r["order_number"], {"no": r["order_number"], "date": r["order_date"] or 0, "dl": r["deadline"], "names": [], "imgs": []})
        g["names"].append(f"{r['name']} ×{r['quantity']}")
        g["imgs"].append([r["thumbnail"] or "", int(r["quantity"] or 1)])
    # yeni siparişler: son görülenden sonra gelenler tek bildirimde toplanır
    seen = int(_get("nf_ty_seen", "0") or 0)
    if not seen:
        seen = int(time.time() * 1000)
        _set("nf_ty_seen", seen)
    for k_, g in pk.items():
        g["key"] = k_
    new = [g for g in pk.values() if g["date"] > seen]
    if new:
        cur = _latest("tynew")
        prev_act = json.loads(cur["action"] or "{}") if cur and cur["resolved_at"] is None else {}
        prev = prev_act.get("n", 0)
        pkgs = ([g["key"] for g in sorted(new, key=lambda g: -g["date"])] + (prev_act.get("pkgs") or []))[:30]
        n = prev + len(new)
        names = "; ".join(x for g in new for x in g["names"])[:160]
        # bildirim şeridindeki küçük görseller: aynı görsel tek kez, adetler toplanır; en yeniler önde
        imgs = {}
        for g in sorted(new, key=lambda g: -g["date"]):
            for u, q in g["imgs"]:
                imgs[u] = imgs.get(u, 0) + q
        imgs = ([[u, q] for u, q in imgs.items()] + [x for x in (prev_act.get("imgs") or []) if x[0] not in imgs])[:12]
        t = _now()
        if cur and cur["resolved_at"] is None:
            _db().execute("UPDATE notifications SET title=?, body=?, action=?, updated_at=?, created_at=? WHERE id=?",
                          (f"{n} yeni Trendyol siparişi", names, json.dumps({"t": "order", "href": "#/siparisler", "n": n, "pkgs": pkgs, "imgs": imgs}), t, t, cur["id"]))
            nid = cur["id"]
        else:
            nid = _db().execute("""INSERT INTO notifications(key,kind,level,title,body,action,created_at,updated_at,cleared)
                             VALUES('tynew','trendyol','info',?,?,?,?,?,1)""",
                          (f"{n} yeni Trendyol siparişi", names, json.dumps({"t": "order", "href": "#/siparisler", "n": n, "pkgs": pkgs, "imgs": imgs}), t, t)).lastrowid
        _set("nf_ty_seen", max(g["date"] for g in new))
        global _push
        _push = True
        _push_ids.append(nid)
    now = _now()
    late, soon = {}, {}
    for key, g in pk.items():
        dl = _eff_deadline(g["dl"])
        if not dl:
            continue
        if dl < now:
            late[f"tylate:{key}"] = ("trendyol", "bad", f"Gecikmiş sipariş {g['no']}", "; ".join(g["names"])[:140], {"t": "order", "href": "#/siparisler", "pkg": key})
        elif dl - now < 3 * 3600:
            soon[f"tysoon:{key}"] = ("trendyol", "warn", f"Son teslime {_fmt_min((dl - now) // 60)}: {g['no']}", "; ".join(g["names"])[:140], {"t": "order", "href": "#/siparisler", "pkg": key})
    _sync_group("tylate:", late)
    _sync_group("tysoon:", soon)
    um = {}
    for r in _db().execute("SELECT barcode, MAX(product_name) n, COUNT(*) c FROM ty_lines WHERE state='unmatched' GROUP BY lower(barcode)"):
        um[f"tyum:{(r['barcode'] or '').lower()}"] = ("trendyol", "warn", "Eşleşmeyen Trendyol ürünü", f"{r['n'] or r['barcode']} · {r['c']} satır",
                                                       {"t": "go", "href": "#/hazirla"})
    _sync_group("tyum:", um)


def _claims():
    """İadeler: elinize ulaşıp onay bekleyen (WaitingInAction) ve yeni açılmış, yoldaki (Created) talepler."""
    if not _db().execute("SELECT 1 FROM sqlite_master WHERE name='ty_claims'").fetchone():
        return
    wanted = {}
    for r in _db().execute("SELECT claim_id, order_number, customer, status, items FROM ty_claims WHERE status IN ('WaitingInAction','Created')"):
        try:
            items = json.loads(r["items"] or "[]")
        except ValueError:
            items = []
        names = "; ".join(f"{i.get('product') or 'Ürün'}" + (f" — {i['reason']}" if i.get("reason") else "") for i in items)[:160]
        if r["status"] == "WaitingInAction":
            wanted[f"claim:{r['claim_id']}:w"] = ("claim", "bad", f"İade onayınızı bekliyor · {r['order_number']}",
                                                  f"{r['customer'] or ''}: {names}".strip(": "), {"t": "go", "href": "#/iadeler"})
        else:
            wanted[f"claim:{r['claim_id']}:c"] = ("claim", "warn", f"Yeni iade talebi · {r['order_number']}",
                                                  f"{r['customer'] or ''}: {names}".strip(": "), {"t": "go", "href": "#/iadeler?tab=transit"})
    _sync_group("claim:", wanted)


def _questions():
    if not _db().execute("SELECT 1 FROM sqlite_master WHERE name='ty_questions'").fetchone():
        return
    wanted = {}
    for r in _db().execute("SELECT id, product_name, text FROM ty_questions WHERE status='WAITING_FOR_ANSWER'"):
        wanted[f"qna:{r['id']}"] = ("question", "warn", f"Müşteri sorusu · {(r['product_name'] or '')[:50]}",
                                    (r["text"] or "")[:160], {"t": "go", "href": "#/sorular"})
    _sync_group("qna:", wanted)


def _stock():
    sf = {}
    for r in _db().execute("""SELECT l.id, l.shortfall, p.name || COALESCE(' — ' || NULLIF(p.variant_label,''), '') name FROM stock_log l
                              JOIN products p ON p.id=l.product_id WHERE l.shortfall>0 AND COALESCE(l.resolved,0)=0 AND p.archived=0"""):
        sf[f"sf:{r['id']}"] = ("stock", "bad", f"Sayım farkı: {r['name']}", f"{r['shortfall']} adet sistemde yoktu", {"t": "go", "href": "#/"})
    _sync_group("sf:", sf)
    low = {}
    for r in _db().execute("""SELECT id, stock, min_stock, name || COALESCE(' — ' || NULLIF(variant_label,''), '') name FROM products
                              WHERE archived=0 AND min_stock>0 AND stock<=min_stock"""):
        low[f"low:{r['id']}"] = ("stock", "warn", f"Stok azaldı: {r['name']}", f"stok {r['stock']} · en az {r['min_stock']}", {"t": "product", "id": r["id"]})
    _sync_group("low:", low)
    sp = {}
    for r in _db().execute("SELECT id, code, color_name, brand, remaining FROM spools WHERE archived=0 AND remaining>0 AND remaining<?", (LOW_SPOOL_G,)):
        sp[f"spool:{r['id']}"] = ("stock", "warn", f"Makara azaldı: #{r['code']}", f"{r['color_name'] or ''} {r['brand'] or ''} · {round(r['remaining'])} g kaldı".strip(),
                                  {"t": "spool", "id": r["id"]})
    _sync_group("spool:", sp)


def _money(v):
    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".").replace(",00", "") + " ₺"


def _buybox():
    """Rakip bizden ucuza buybox'ı aldıysa: kırmızı bildirim (telefona da). Buybox geri gelince ya da fiyat farkı kapanınca kendiliğinden çözülür."""
    if _get("ty_enabled", "0") != "1":
        _sync_group("bb:", {})
        return
    wanted = {}
    rows = _db().execute("""SELECT b.*, t.title FROM ty_buybox b LEFT JOIN ty_products t ON t.barcode=b.barcode
                            WHERE b.buybox_order>1 AND b.buybox_price IS NOT NULL AND b.our_price IS NOT NULL
                              AND b.buybox_price < b.our_price - 0.009""").fetchall()
    for r in rows:
        name = r["title"] or r["barcode"]
        p = _db().execute("""SELECT name || COALESCE(' — ' || NULLIF(variant_label,''), '') n FROM products
                             WHERE archived=0 AND (',' || LOWER(REPLACE(REPLACE(COALESCE(barcodes,''),' ',','),';',',')) || ',') LIKE ?
                             LIMIT 1""", (f"%,{r['barcode'].lower()},%",)).fetchone()
        if p:
            name = p["n"]
        wanted[f"bb:{r['barcode']}"] = ("trendyol", "bad", f"Buybox kaybedildi: {name}",
                                       f"Rakip {_money(r['buybox_price'])} · bizim fiyat {_money(r['our_price'])} "
                                       f"(fark {_money(r['our_price'] - r['buybox_price'])})",
                                       {"t": "go", "href": "#/buybox"})
    _sync_group("bb:", wanted, sticky=True)


def _idle():
    """Bir yazıcı meşgulken boşa çıkınca (baskı bitti, sonucu girildi) plandaki ilk uygun işi öner.
    Sunucu açıldığında zaten boş olanlar için bildirim açılmaz; yazıcı yeniden çalışınca bildirim kendiliğinden çözülür."""
    global _busy_prev
    if not plan_fn:
        return
    snap = {p.get("name"): p for p in (bambu.snapshot()["printers"] if bambu else [])}
    busy = {r["printer"] for r in _db().execute("SELECT DISTINCT printer FROM print_jobs WHERE status='printing' AND printer<>''")}
    busy |= {n for n, p in snap.items() if p.get("state") in ("RUNNING", "PREPARE", "PAUSE", "SLICING")}
    if _busy_prev is not None:
        _idle_now.update(_busy_prev - busy)
    _idle_now.difference_update(busy)
    _busy_prev = busy
    wanted = {}
    if _idle_now:
        plan = plan_fn()
        for name in list(_idle_now):
            kind = next((p.get("kind") for p in plan["printers"] if p["name"] == name), None)
            fits = lambda x: (kind == "resin") == ((x.get("print_type") or "FDM") == "SLA")
            # önce bu makineye planlanan iş, yoksa türü uyan en öncelikli iş
            it = next((x for x in plan["items"] if x.get("printer") == name), None) or next((x for x in plan["items"] if fits(x)), None)
            if not it:
                continue
            dur = _fmt_min(it.get("minutes") or 0) if it.get("minutes") else "süre girilmemiş"
            wanted[f"idle:{name}"] = ("printer", "info", f"{name} boşta",
                                      f"Öneri: {it['name']} ×{it['qty']} · {dur} · {it['reason']}",
                                      {"t": "plan", "printer": name, "pid": it.get("product_id"), "oid": it.get("order_id"), "qty": it["qty"]})
    _sync_group("idle:", wanted)


# ---------------------------------------------------------------- haftalık özet
DAY_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
MON_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]


def weekly_conf():
    """('1 09:00' biçiminde) gün 1-7 (1 = Pazartesi) ve saat; 'off' = kapalı."""
    v = (_get("weekly_at", "1 09:00") or "1 09:00").strip()
    if v == "off":
        return None
    try:
        d, hm = v.split()
        h, m = (int(x) for x in hm.split(":"))
        d = int(d)
        if 1 <= d <= 7 and 0 <= h < 24 and 0 <= m < 60:
            return d, h, m
    except ValueError:
        pass
    return 1, 9, 0


def _week_start(t):
    lt = time.localtime(t)
    return int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday - lt.tm_wday, 0, 0, 0, 0, 0, -1)))


def _tl(v):
    return f"{v:,.0f}".replace(",", ".") + " ₺"


def _range_text(start, end):
    a, b = time.localtime(start), time.localtime(end - 1)
    if a.tm_mon == b.tm_mon:
        return f"{a.tm_mday}–{b.tm_mday} {MON_TR[b.tm_mon - 1]}"
    return f"{a.tm_mday} {MON_TR[a.tm_mon - 1]} – {b.tm_mday} {MON_TR[b.tm_mon - 1]}"


def weekly_text(d):
    parts = []
    chg = ""
    if d.get("prev_sales"):
        pct = round((d["sales"] - d["prev_sales"]) / d["prev_sales"] * 100)
        chg = f" ({'▲' if pct >= 0 else '▼'}%{abs(pct)})"
    parts.append(f"Satış {d['sales']} adet{chg}")
    if d.get("orders"):
        parts.append(f"Trendyol {d['orders']} sipariş, ciro {_tl(d['revenue'])}, kâr ≈ {_tl(d['profit'])}")
    if d.get("jobs"):
        parts.append(f"Basılan {d['printed']} sağlam" + (f", fire %{round(d['waste'] * 100)}" if d.get("units") else ""))
    if d.get("grams"):
        parts.append(f"Filament {d['grams'] / 1000:.1f} kg".replace(".", ",") if d["grams"] >= 1000 else f"Filament {d['grams']} g")
    if d.get("buybox_behind"):
        parts.append(f"Buybox'ta {d['buybox_behind']} üründe gerideyiz")
    if d.get("dead"):
        parts.append(f"Ölü stok {d['dead']} ürün ({d['dead_units']} adet)")
    return " · ".join(parts)


def weekly_payload():
    try:
        return json.loads(_get("weekly_data", "") or "null")
    except ValueError:
        return None


def _weekly():
    conf = weekly_conf()
    if not conf or not weekly_fn:
        _sync_group("week:", {})
        return
    day, h, m = conf
    t = _now()
    this_mon = _week_start(t)
    lt = time.localtime(this_mon)
    due = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday + day - 1, h, m, 0, 0, 0, -1)))
    data = weekly_payload()
    if t >= due:
        lm = time.localtime(this_mon)
        start = int(time.mktime((lm.tm_year, lm.tm_mon, lm.tm_mday - 7, 0, 0, 0, 0, 0, -1)))
        key = f"week:{time.strftime('%Y%m%d', time.localtime(start))}"
        if not data or data.get("key") != key:
            data = {**weekly_fn(start, this_mon), "key": key, "made_at": t}
            _set("weekly_data", json.dumps(data, ensure_ascii=False))
    wanted = {}
    if data and data.get("key") and t - int(data.get("made_at") or 0) < 7 * 86400:
        wanted[data["key"]] = ("report", "info", f"Haftalık özet · {_range_text(data['start'], data['end'])}", weekly_text(data),
                               {"t": "go", "href": "#/istatistik"})
    _sync_group("week:", wanted)


def tick(force=False):
    global _last_tick, _push
    if not force and time.time() - _last_tick < 8:
        return
    _last_tick = time.time()
    with _lock:
        try:
            for f in (_printers, _jobs, _trendyol, _buybox, _stock, _idle, _weekly, _claims, _questions):
                try:
                    f()
                except Exception as e:  # noqa — bir kontrolün hatası diğerlerini durdurmasın
                    print("Bildirim kontrol hatası:", f.__name__, e)
            _db().execute("DELETE FROM notifications WHERE resolved_at IS NOT NULL AND resolved_at<?", (_now() - 7 * 86400,))
            _db().commit()
        except Exception:
            _db().rollback()
            raise
    if _push:
        _push = False
        with _lock:
            _set("push_last", json.dumps({"ids": _push_ids[-5:], "at": _now()}))
            _db().commit()
        _push_ids.clear()
        if on_new:
            on_new()


def items():
    rows = _db().execute("""SELECT * FROM notifications WHERE (resolved_at IS NULL OR resolved_at>=?) AND COALESCE(resolved_by,'')<>'dismissed'
                            ORDER BY resolved_at IS NOT NULL, COALESCE(updated_at, created_at) DESC LIMIT 200""", (_now() - 7 * 86400,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["action"] = json.loads(d["action"]) if d["action"] else None
        out.append(d)
    return {"items": out, "active": sum(1 for d in out if d["resolved_at"] is None)}


def dismiss(nid):
    """Kenara kaydırılarak kapatıldı: listeden de kalkar (şart sürse de yeniden açılmaz)."""
    _db().execute("UPDATE notifications SET resolved_at=COALESCE(resolved_at, ?), resolved_by='dismissed' WHERE id=?", (_now(), nid))


def resolve(nid=None):
    t = _now()
    if nid is None:
        _db().execute("UPDATE notifications SET resolved_at=?, resolved_by='user' WHERE resolved_at IS NULL", (t,))
    else:
        _db().execute("UPDATE notifications SET resolved_at=?, resolved_by='user' WHERE id=? AND resolved_at IS NULL", (t, nid))


def _loop():
    while True:
        time.sleep(15)
        try:
            tick(force=True)
        except Exception as e:  # noqa
            print("Bildirim döngüsü hatası:", e)


def start():
    import threading
    threading.Thread(target=_loop, daemon=True, name="notify").start()


def recent(seconds=300):
    """Telefondaki uygulama push gelince bunu çeker: yalnızca son push'u tetikleyen yeni bildirimler
    (eskiden son birkaç dakikanın tümü dönüyordu; her push'ta aynı "baskı bitti" tekrar tekrar çalıyordu)."""
    try:
        last = json.loads(_get("push_last", "{}") or "{}")
    except ValueError:
        last = {}
    ids = [int(i) for i in (last.get("ids") or [])][-5:]
    if ids and _now() - int(last.get("at") or 0) <= seconds:
        rows = _db().execute(f"""SELECT id, key, kind, level, title, body, action, updated_at FROM notifications
                                 WHERE resolved_at IS NULL AND id IN ({','.join('?' * len(ids))}) ORDER BY id DESC""", ids).fetchall()
    else:
        rows = []
    return [{**dict(r), "action": json.loads(r["action"]) if r["action"] else None} for r in rows]
