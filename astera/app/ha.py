"""Home Assistant bağlantısı: olay gönderir, sensör yayınlar, ölçer prizden elektrik okuyup yazıcılara paylaştırır.

Bağlantı:
  HA eklentisi  → Supervisor'ın verdiği SUPERVISOR_TOKEN ile http://supervisor/core/api (şifre gerekmez)
  Windows       → Ayarlar'a girilen HA adresi + uzun ömürlü erişim jetonu (jeton tarayıcıya hiç gönderilmez)

Olaylar "astera_<ad>" olarak gider (astera_baski_bitti …); ayrıntılar olayın verisindedir.

Elektrik: ölçer prizin toplam kWh sayacı dakikada bir okunur. Aradaki artıştan önce "bekleme" payı (hiçbir yazıcı
basmazken öğrenilen ortalama watt) ayrılır, kalanı o an baskı yapan yazıcılara, yazıcı başına öğrenilen ortalama
watt oranında bölünür. Ortalama watt, yalnız tek yazıcının bastığı dakikalardan kendiliğinden öğrenilir.
"""
import json
import os
import queue
import re
import threading
import time
import urllib.error
import urllib.request

_db = _lock = _get = _set = None
bambu = None
summary_fn = None      # sunucu verir: sabah özeti metni ve verisi

EVENTS = [
    ("baski_bitti", "Baskı bitti", True),
    ("baski_basarisiz", "Baskı başarısız / yazıcı hatası", True),
    ("yeni_siparis", "Yeni Trendyol siparişi", True),
    ("sabah", "Sabah özeti", True),
    ("stok_azaldi", "Stok / filament / ambalaj / aksesuar azaldı", False),
    ("bakim", "Bakım zamanı", False),
    ("yorum", "Yeni Trendyol yorumu", True),
    ("kargo", "Kargo teslim edildi", False),
]
DEFAULT_W = 100.0       # öğrenilene kadar yazıcı başına varsayılan watt
_q = queue.Queue(maxsize=200)
_state = {"ok": None, "error": "", "checked": 0, "energy": None, "power": None}


def init(db, lock, get_setting, set_setting, bambu_mod):
    global _db, _lock, _get, _set, bambu
    _db, _lock, _get, _set, bambu = db, lock, get_setting, set_setting, bambu_mod


def migrate(c):
    c.execute("CREATE TABLE IF NOT EXISTS energy_log (day TEXT, printer TEXT, kwh REAL DEFAULT 0, PRIMARY KEY(day, printer))")
    c.execute("CREATE TABLE IF NOT EXISTS job_energy (job_id INTEGER PRIMARY KEY, kwh REAL DEFAULT 0)")
    c.execute("CREATE TABLE IF NOT EXISTS energy_w (printer TEXT PRIMARY KEY, watt REAL, n INTEGER DEFAULT 0)")


def _now():
    return int(time.time())


# ---------------------------------------------------------------- ayarlar

def supervised():
    return bool(os.environ.get("SUPERVISOR_TOKEN"))


def conf():
    try:
        with _lock:
            c = json.loads(_get("ha", "") or "{}")
    except ValueError:
        c = {}
    ev = c.get("events") or {}
    return {
        "url": c.get("url") or "",
        "events": {k: bool(ev.get(k, d)) for k, _, d in EVENTS},
        "sensors": bool(c.get("sensors", True)),
        "energy_entity": c.get("energy_entity") or "",
        "power_entity": c.get("power_entity") or "",
        "tariff": float(c.get("tariff") or 0),
        "standby": c.get("standby") if c.get("standby") in ("separate", "spread") else "separate",
        "morning": c.get("morning") or "09:00",
    }


def _token():
    if supervised():
        return os.environ["SUPERVISOR_TOKEN"]
    with _lock:
        return _get("ha_token", "") or ""


def enabled():
    c = conf()
    return supervised() or bool(c["url"] and _token())


def public_conf():
    c = conf()
    c.update(supervised=supervised(), has_token=bool(_token()) if not supervised() else True, enabled=enabled(),
             status={k: _state[k] for k in ("ok", "error", "checked")}, event_list=[{"key": k, "label": l} for k, l, _ in EVENTS],
             learned=learned())
    return c


def save_conf(b):
    c = conf()
    old_e = c["energy_entity"]
    if "url" in b:
        u = str(b.get("url") or "").strip().rstrip("/")
        if u and not re.fullmatch(r"https?://[A-Za-z0-9.\-:\[\]]{1,120}(/[\w\-./]*)?", u):
            raise ValueError("Adres http://192.168.1.10:8123 biçiminde olmalı")
        c["url"] = u
    if isinstance(b.get("events"), dict):
        for k, _, _ in EVENTS:
            if k in b["events"]:
                c["events"][k] = bool(b["events"][k])
    for k in ("energy_entity", "power_entity"):
        if k in b:
            v = str(b.get(k) or "").strip()
            if v and not re.fullmatch(r"[a-z_]+\.[a-z0-9_]{1,120}", v):
                raise ValueError("Sensör adı geçersiz")
            c[k] = v
    if "tariff" in b:
        try:
            t = float(str(b.get("tariff") or 0).replace(",", "."))
        except ValueError:
            raise ValueError("Tarife bir sayı olmalı (₺/kWh)")
        if not 0 <= t <= 100:
            raise ValueError("Tarife 0–100 ₺/kWh arasında olmalı")
        c["tariff"] = round(t, 4)
    if b.get("standby") in ("separate", "spread"):
        c["standby"] = b["standby"]
    if "sensors" in b:
        c["sensors"] = bool(b["sensors"])
    if "morning" in b:
        m = str(b.get("morning") or "")
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", m):
            raise ValueError("Saat 09:00 biçiminde olmalı")
        c["morning"] = m
    with _lock:
        _set("ha", json.dumps(c))
        if "token" in b and b["token"] is not None and not supervised():
            tok = str(b["token"]).strip()
            if tok or b.get("clear_token"):
                _set("ha_token", tok[:400])
        _db().commit()
    if c["energy_entity"] != old_e:
        _reset_energy()
    return public_conf()


# ---------------------------------------------------------------- HA çağrıları

def _base():
    if supervised():
        return "http://supervisor/core/api"
    u = conf()["url"]
    return (u + "/api") if u else ""


def call(method, path, body=None, timeout=8):
    base, tok = _base(), _token()
    if not base or not tok:
        raise RuntimeError("Home Assistant bağlantısı ayarlı değil")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        msg = {401: "Erişim jetonu geçersiz", 403: "Erişim reddedildi", 404: "Bulunamadı"}.get(e.code, f"HTTP {e.code}")
        raise RuntimeError(f"Home Assistant: {msg}") from None
    except (urllib.error.URLError, OSError) as e:
        raise RuntimeError(f"Home Assistant'a ulaşılamadı ({getattr(e, 'reason', e)})") from None
    try:
        return json.loads(raw.decode() or "null")
    except ValueError:
        return None


def check():
    try:
        call("GET", "/")
        _state.update(ok=True, error="", checked=_now())
    except RuntimeError as e:
        _state.update(ok=False, error=str(e), checked=_now())
    return {k: _state[k] for k in ("ok", "error", "checked")}


def entities():
    """Ayarlardaki seçim kutusu için enerji (kWh) ve güç (W) sensörleri."""
    out = []
    for s in call("GET", "/states") or []:
        eid = s.get("entity_id") or ""
        if not eid.startswith("sensor."):
            continue
        a = s.get("attributes") or {}
        unit, cls = a.get("unit_of_measurement") or "", a.get("device_class") or ""
        kind = "energy" if cls == "energy" or unit in ("kWh", "Wh") else "power" if cls == "power" or unit in ("W", "kW") else None
        if kind:
            out.append({"id": eid, "name": a.get("friendly_name") or eid, "unit": unit, "state": s.get("state"), "kind": kind})
    return sorted(out, key=lambda x: (x["kind"], x["name"].lower()))


def fire(name, data=None):
    """Olayı kuyruğa koyar; ayrı iş parçacığı gönderir (bildirim kontrolünü bekletmesin)."""
    if not enabled() or not conf()["events"].get(name, False):
        return
    try:
        _q.put_nowait((name, data or {}))
    except queue.Full:
        pass


def fire_now(name, data=None):
    call("POST", f"/events/astera_{name}", data or {})


def _sender():
    while True:
        name, data = _q.get()
        try:
            fire_now(name, data)
            _state.update(ok=True, error="")
        except RuntimeError as e:
            _state.update(ok=False, error=str(e))
        except Exception as e:  # noqa
            print("HA olay hatası:", e)


# bildirim anahtarından olaya: notify yeni bildirim açınca çağırır
def from_notification(key, kind, level, title, body):
    pre = key.split(":", 1)[0] + ":"
    ev = None
    if pre == "job:":
        ev = "baski_basarisiz" if level == "bad" else "baski_bitti"
    elif pre == "perr:":
        ev = "baski_basarisiz"
    elif pre in ("low:", "spool:", "pack:", "sf:", "acc:"):
        ev = "stok_azaldi"
    elif pre == "maint:":
        ev = "bakim"
    elif pre == "rev:":
        ev = "yorum"
    elif pre == "ship:":
        ev = "kargo"
    elif pre == "tynew:":
        ev = "yeni_siparis"
    if ev:
        fire(ev, {"title": title, "body": body or "", "key": key})


# ---------------------------------------------------------------- sensörler

def _slug(s):
    tr = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    return re.sub(r"[^a-z0-9]+", "_", str(s).translate(tr).lower()).strip("_") or "yazici"


def _sensors():
    now = _now()
    c = _db()
    out = []
    try:
        newpk = c.execute("SELECT COUNT(DISTINCT COALESCE(package_id, order_number)) FROM ty_lines WHERE ty_status IN ('Created','Awaiting')").fetchone()[0]
    except Exception:  # noqa
        newpk = 0
    out.append(("bekleyen_siparis", newpk, {"friendly_name": "Astera bekleyen sipariş", "unit_of_measurement": "sipariş", "icon": "mdi:package-variant"}))
    lt = time.localtime()
    d0 = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)))
    try:
        today = c.execute("""SELECT COUNT(DISTINCT COALESCE(package_id, order_number)) FROM ty_lines
                             WHERE ty_status IN ('Created','Awaiting','Picking','Invoiced') AND deadline IS NOT NULL AND deadline < ?""", ((d0 + 86400) * 1000,)).fetchone()[0]
        ciro = c.execute("""SELECT COALESCE(SUM(unit_price*quantity),0) FROM ty_lines WHERE order_date>=? AND COALESCE(state,'')<>'cancelled'""", (d0 * 1000,)).fetchone()[0]
    except Exception:  # noqa
        today, ciro = 0, 0
    out.append(("bugun_cikacak", today, {"friendly_name": "Astera bugün çıkacak", "unit_of_measurement": "sipariş", "icon": "mdi:truck-fast"}))
    out.append(("bugun_ciro", round(ciro or 0, 2), {"friendly_name": "Astera bugünkü ciro", "unit_of_measurement": "₺", "icon": "mdi:cash"}))
    low = c.execute("""SELECT COUNT(*) FROM notifications WHERE resolved_at IS NULL AND (key LIKE 'low:%' OR key LIKE 'spool:%' OR key LIKE 'pack:%' OR key LIKE 'acc:%')""").fetchone()[0]
    out.append(("dusuk_stok", low, {"friendly_name": "Astera azalan stok", "icon": "mdi:alert-circle-outline"}))
    act = c.execute("SELECT COUNT(*) FROM notifications WHERE resolved_at IS NULL").fetchone()[0]
    out.append(("bildirim", act, {"friendly_name": "Astera bildirim", "icon": "mdi:bell"}))
    try:
        names = [p.get("name") for p in json.loads(_get("printers", "[]") or "[]") if isinstance(p, dict) and p.get("name")]
    except ValueError:
        names = []
    jobs = {r["printer"]: r for r in c.execute("""SELECT j.printer, j.ends_at, COALESCE(p.name, cm.name, 'Baskı') name, j.quantity FROM print_jobs j
                                                 LEFT JOIN products p ON p.id=j.product_id LEFT JOIN components cm ON cm.id=j.component_id
                                                 WHERE j.status='printing' ORDER BY j.started_at""")}
    for n in names:
        j = jobs.get(n)
        left = max(0, int(((j["ends_at"] or now) - now) / 60)) if j else 0
        out.append((f"{_slug(n)}_kalan", left, {"friendly_name": f"Astera {n} kalan", "unit_of_measurement": "min", "icon": "mdi:printer-3d-nozzle",
                                               "durum": ("basıyor" if left > 0 else "sonuç bekliyor") if j else "boşta",
                                               "urun": f"{j['name']} ×{j['quantity']}" if j else ""}))
    return out


def publish_sensors():
    with _lock:
        rows = _sensors()
    for key, state, attrs in rows:
        call("POST", f"/states/sensor.astera_{key}", {"state": state, "attributes": attrs})


# ---------------------------------------------------------------- elektrik

def _reset_energy():
    with _lock:
        _set("energy_last", "")
        _db().commit()


def _read_kwh(entity):
    s = call("GET", f"/states/{entity}") or {}
    try:
        v = float(s.get("state"))
    except (TypeError, ValueError):
        return None
    unit = ((s.get("attributes") or {}).get("unit_of_measurement") or "kWh")
    return v / 1000 if unit == "Wh" else v * 1000 if unit == "MWh" else v


def _active_printers(now):
    """Şu an gerçekten basan yazıcılar → {yazıcı: iş id}."""
    act = {}
    for r in _db().execute("SELECT id, printer, ends_at, bambu_state FROM print_jobs WHERE status='printing' AND printer IS NOT NULL AND printer<>'' ORDER BY started_at"):
        st = r["bambu_state"] or ""
        if st in ("RUNNING", "PREPARE", "PAUSE", "SLICING"):
            act[r["printer"]] = r["id"]
        elif st not in ("FINISH", "FAILED", "IDLE") and (r["ends_at"] or 0) > now:
            act[r["printer"]] = r["id"]
    return act


def _watts():
    return {r["printer"]: (r["watt"], r["n"]) for r in _db().execute("SELECT printer, watt, n FROM energy_w")}


def _learn(printer, watt):
    row = _db().execute("SELECT watt, n FROM energy_w WHERE printer=?", (printer,)).fetchone()
    if row and row["watt"] is not None:
        n = min((row["n"] or 0) + 1, 60)
        w = row["watt"] + (watt - row["watt"]) / n     # ilk 60 ölçümde ortalama, sonra kayan ortalama
    else:
        n, w = 1, watt
    _db().execute("INSERT INTO energy_w(printer, watt, n) VALUES(?,?,?) ON CONFLICT(printer) DO UPDATE SET watt=excluded.watt, n=excluded.n",
                  (printer, round(w, 1), n))


def _add(day, printer, kwh, job=None):
    _db().execute("INSERT INTO energy_log(day, printer, kwh) VALUES(?,?,?) ON CONFLICT(day, printer) DO UPDATE SET kwh=kwh+excluded.kwh",
                  (day, printer, kwh))
    if job:
        _db().execute("INSERT INTO job_energy(job_id, kwh) VALUES(?,?) ON CONFLICT(job_id) DO UPDATE SET kwh=kwh+excluded.kwh", (job, kwh))


def split(delta, dt, act, w, now):
    """Bir ölçüm aralığındaki tüketimi böler. delta kWh, dt saniye, act {yazıcı: iş}, w {yazıcı: (watt, n)}.
    Dönüş: [(yazıcı ya da '' = bekleme, kWh, iş id ya da None)] ve öğrenilecek (yazıcı, watt) listesi."""
    out, learn = [], []
    if delta <= 0 or dt <= 0:
        return out, learn
    total_w = delta * 3600000 / dt
    sb = (w.get("") or (None, 0))[0]
    if not act:
        if dt <= 900:
            learn.append(("", total_w))
        out.append(("", delta, None))
        return out, learn
    sb_kwh = min(delta, (sb or 0) * dt / 3600000)
    rest = delta - sb_kwh
    if sb_kwh > 0:
        out.append(("", sb_kwh, None))
    if len(act) == 1 and dt <= 900:
        p = next(iter(act))
        learn.append((p, max(0.0, total_w - (sb or 0))))
    ws = {p: (w.get(p) or (DEFAULT_W, 0))[0] or DEFAULT_W for p in act}
    tw = sum(ws.values()) or 1
    for p, job in act.items():
        out.append((p, rest * ws[p] / tw, job))
    return out, learn


def energy_tick():
    c = conf()
    if not c["energy_entity"]:
        return
    v = _read_kwh(c["energy_entity"])
    if v is None:
        return
    now = _now()
    with _lock:
        try:
            last = json.loads(_get("energy_last", "") or "{}")
        except ValueError:
            last = {}
        lv, lt = last.get("v"), last.get("t") or 0
        if lv is not None and lt and v >= lv and 0 < now - lt <= 3600 and v - lv < 5:
            delta, dt = v - lv, now - lt
            parts, learn = split(delta, dt, _active_printers(now), _watts(), now)
            day = time.strftime("%Y-%m-%d", time.localtime(now))
            for p, kwh, job in parts:
                if kwh > 0:
                    _add(day, p, kwh, job)
            for p, watt in learn:
                if 0 <= watt < 3000:
                    _learn(p, watt)
        _set("energy_last", json.dumps({"v": v, "t": now}))
        _db().commit()
    _state["energy"] = v
    if c["power_entity"]:
        try:
            s = call("GET", f"/states/{c['power_entity']}") or {}
            _state["power"] = float(s.get("state"))
        except (RuntimeError, TypeError, ValueError):
            _state["power"] = None


def learned():
    try:
        return {(r["printer"] or ""): {"watt": r["watt"], "n": r["n"]} for r in _db().execute("SELECT * FROM energy_w")}
    except Exception:  # noqa
        return {}


def job_kwh(ids):
    if not ids:
        return {}
    ids = [int(i) for i in ids]
    return {r["job_id"]: r["kwh"] for r in _db().execute(f"SELECT job_id, kwh FROM job_energy WHERE job_id IN ({','.join('?' * len(ids))})", ids)}


def product_kwh():
    """Ürün başına (1 adet) ortalama kWh: elektriği ölçülmüş bitmiş baskılardan."""
    out = {}
    for r in _db().execute("""SELECT j.product_id pid, SUM(e.kwh) k, SUM(COALESCE(NULLIF(j.good_quantity,0), j.quantity)) q
                              FROM job_energy e JOIN print_jobs j ON j.id=e.job_id
                              WHERE j.product_id IS NOT NULL AND j.status IN ('success','partial') GROUP BY j.product_id"""):
        if r["q"]:
            out[r["pid"]] = r["k"] / r["q"]
    f = 1 + standby_per_hour() if conf()["standby"] == "spread" else 1
    return {k: round(v * f, 4) for k, v in out.items()}


def standby_per_hour():
    """Bekleme tüketimini ürünlere yaymak için: son 30 günde basılan her 1 kWh'e düşen bekleme kWh'i."""
    a = time.strftime("%Y-%m-%d", time.localtime(_now() - 30 * 86400))
    sb = _db().execute("SELECT COALESCE(SUM(kwh),0) FROM energy_log WHERE printer='' AND day>=?", (a,)).fetchone()[0]
    pr = _db().execute("SELECT COALESCE(SUM(kwh),0) FROM energy_log WHERE printer<>'' AND day>=?", (a,)).fetchone()[0]
    return round(sb / pr, 4) if pr > 0 else 0.0   # basılan her 1 kWh'e düşen bekleme kWh'i


def summary(days=30):
    """Makineler ekranı: yazıcı başına bu ay / 30 gün kWh ve ₺, günlük döküm, bekleme."""
    c = conf()
    t = c["tariff"]
    now = _now()
    a = time.strftime("%Y-%m-%d", time.localtime(now - (days - 1) * 86400))
    m0 = time.strftime("%Y-%m-01")
    rows = [dict(r) for r in _db().execute("SELECT day, printer, kwh FROM energy_log WHERE day>=? ORDER BY day", (a,))]
    month = {}
    for r in _db().execute("SELECT printer, SUM(kwh) k FROM energy_log WHERE day>=? GROUP BY printer", (m0,)):
        month[r["printer"]] = r["k"]
    return {"tariff": t, "standby_mode": c["standby"], "days": rows, "month": month,
            "month_total": round(sum(month.values()), 3), "power": _state.get("power"), "energy": _state.get("energy"),
            "learned": learned(), "configured": bool(c["energy_entity"]), "enabled": enabled()}


# ---------------------------------------------------------------- döngü

def _morning(now):
    c = conf()
    if not c["events"].get("sabah"):
        return
    hm = time.strftime("%H:%M", time.localtime(now))
    day = time.strftime("%Y-%m-%d", time.localtime(now))
    if hm < c["morning"]:
        return
    with _lock:
        if (_get("ha_morning", "") or "") == day:
            return
        _set("ha_morning", day)
        _db().commit()
    with _lock:
        data = summary_fn() if summary_fn else {}
    fire("sabah", data)


def _loop():
    n = 0
    while True:
        time.sleep(int(os.environ.get("ATOLYE_HA_EVERY") or 60) if n else 20)
        n += 1
        if not enabled():
            continue
        now = _now()
        try:
            energy_tick()
        except RuntimeError as e:
            _state.update(ok=False, error=str(e))
        except Exception as e:  # noqa
            print("HA elektrik hatası:", e)
        try:
            if conf()["sensors"]:
                publish_sensors()
            _state.update(ok=True, error="", checked=now)
        except RuntimeError as e:
            _state.update(ok=False, error=str(e), checked=now)
        except Exception as e:  # noqa
            print("HA sensör hatası:", e)
        try:
            _morning(now)
        except Exception as e:  # noqa
            print("HA sabah hatası:", e)


def start():
    threading.Thread(target=_sender, daemon=True, name="ha-send").start()
    threading.Thread(target=_loop, daemon=True, name="ha").start()
