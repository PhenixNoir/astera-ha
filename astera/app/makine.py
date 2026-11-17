"""Makineler: baskı saatleri (baskı kayıtlarından) ve tarih bazlı, fiyatlı bakım kaydı.

Saat hesabı: biten baskıda planlanan süre (ends_at - started_at); planlanan yoksa bitiş - başlangıç; başarısız
baskıda erken bitmişse bitişe kadar; süren baskıda şimdiye kadar. Tek baskı en çok 72 saat sayılır.
Uygulamadan önceki saatler için makineye "başlangıç saati" girilebilir (hours_offset).
"""
import calendar
import json
import re
import time

KINDS = ("bakim", "parca", "temizlik", "yaglama", "kalibrasyon", "onarim")
_db = _get = None
CAP = 72 * 3600


def init(db, get_setting):
    global _db, _get
    _db, _get = db, get_setting


def migrate(c):
    c.execute("""CREATE TABLE IF NOT EXISTS machine_maint (id INTEGER PRIMARY KEY AUTOINCREMENT, printer TEXT NOT NULL,
                 date TEXT NOT NULL, kind TEXT DEFAULT 'bakim', part TEXT, note TEXT, cost REAL DEFAULT 0, hours_at REAL,
                 created_at INTEGER)""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_mm ON machine_maint(printer, date)")
    c.execute("""CREATE TABLE IF NOT EXISTS machine_cfg (printer TEXT PRIMARY KEY, interval_hours REAL, interval_days INTEGER,
                 hours_offset REAL DEFAULT 0)""")


def _now():
    return int(time.time())


def _day_end(d):
    return int(time.mktime(time.strptime(d, "%Y-%m-%d"))) + 86400


def _dur(r, now):
    s = r["started_at"] or 0
    if not s:
        return 0
    if r["status"] == "printing":
        e = min(now, r["ends_at"] or now)
    elif r["status"] == "failed":
        e = min(x for x in (r["finished_at"], r["ends_at"]) if x) if (r["finished_at"] or r["ends_at"]) else s
    else:
        e = r["ends_at"] if (r["ends_at"] or 0) > s else (r["finished_at"] or s)
    return max(0, min(CAP, e - s))


def _jobs():
    return [dict(r) for r in _db().execute(
        "SELECT printer, status, started_at, ends_at, finished_at FROM print_jobs WHERE status IN ('success','partial','failed','printing') AND printer IS NOT NULL AND printer<>''")]


def printers():
    try:
        pl = json.loads(_get("printers", "[]") or "[]")
    except ValueError:
        pl = []
    return [p for p in pl if isinstance(p, dict) and p.get("name")]


def _cfg():
    return {r["printer"]: dict(r) for r in _db().execute("SELECT * FROM machine_cfg")}


def hours_until(printer, ts, jobs=None, offset=0.0):
    """Makinenin ts anına kadarki toplam baskı saati."""
    now = min(_now(), ts)
    tot = sum(min(_dur(j, now), max(0, ts - (j["started_at"] or 0))) for j in (jobs or _jobs()) if j["printer"] == printer and (j["started_at"] or 0) < ts)
    return round(tot / 3600 + (offset or 0), 1)


def summary():
    now, jobs, cfg = _now(), _jobs(), _cfg()
    names = [p["name"] for p in printers()]
    for j in jobs:
        if j["printer"] not in names:
            names.append(j["printer"])
    logs = {}
    for r in _db().execute("SELECT * FROM machine_maint ORDER BY date, id"):
        logs.setdefault(r["printer"], []).append(dict(r))
    year = time.strftime("%Y")
    lt = time.localtime()
    months = []
    for k in range(5, -1, -1):
        y, m = lt.tm_year, lt.tm_mon - k
        while m <= 0:
            y, m = y - 1, m + 12
        a = int(time.mktime((y, m, 1, 0, 0, 0, 0, 0, -1)))
        b = a + calendar.monthrange(y, m)[1] * 86400
        months.append((f"{y}-{m:02d}", a, b))
    kinds = {p["name"]: p.get("kind") for p in printers()}
    out = []
    for n in names:
        c = cfg.get(n, {})
        off = c.get("hours_offset") or 0
        mine = [j for j in jobs if j["printer"] == n]
        total = round(sum(_dur(j, now) for j in mine) / 3600 + off, 1)
        a30 = now - 30 * 86400
        last30 = round(sum(max(0, min((j["started_at"] or 0) + _dur(j, now), now) - max(j["started_at"] or 0, a30)) for j in mine) / 3600, 1)
        mon = []
        for key, a, b in months:
            s = 0
            for j in mine:
                st = j["started_at"] or 0
                en = st + _dur(j, now)
                s += max(0, min(en, b) - max(st, a))
            mon.append({"m": key, "h": round(s / 3600, 1)})
        lg = logs.get(n, [])
        last = lg[-1] if lg else None
        since_h = round(total - (last["hours_at"] or 0), 1) if last else total
        since_d = int((now - _day_end(last["date"]) + 86400) // 86400) if last else None
        due = []
        if c.get("interval_hours") and since_h >= c["interval_hours"]:
            due.append("hours")
        if c.get("interval_days") and since_d is not None and since_d >= c["interval_days"]:
            due.append("days")
        cost = round(sum(x["cost"] or 0 for x in lg), 2)
        out.append({"name": n, "kind": kinds.get(n), "total_hours": total, "last30": last30, "util30": round(min(1, last30 / 720), 3),
                    "jobs": len(mine), "fails": sum(1 for j in mine if j["status"] == "failed"), "printing": any(j["status"] == "printing" for j in mine),
                    "months": mon, "last": last, "since_hours": since_h, "since_days": since_d, "due": due,
                    "cost_total": cost, "cost_year": round(sum(x["cost"] or 0 for x in lg if x["date"].startswith(year)), 2),
                    "cost_per_hour": round(cost / total, 2) if total > 0 and cost else None, "log": list(reversed(lg)),
                    "interval_hours": c.get("interval_hours"), "interval_days": c.get("interval_days"), "hours_offset": off})
    return out


def _clean(b):
    d = str(b.get("date") or time.strftime("%Y-%m-%d"))
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
        raise ValueError("Tarih biçimi geçersiz")
    p = str(b.get("printer") or "").strip()
    if not p:
        raise ValueError("Makine seçin")
    try:
        cost = max(0.0, float(str(b.get("cost") or 0).replace(",", ".")))
    except ValueError:
        raise ValueError("Masraf bir sayı olmalı")
    return {"printer": p[:60], "date": d, "kind": b.get("kind") if b.get("kind") in KINDS else "bakim",
            "part": str(b.get("part") or "").strip()[:80] or None, "note": str(b.get("note") or "").strip()[:500] or None, "cost": round(cost, 2)}


def add(b):
    d = _clean(b)
    off = (_cfg().get(d["printer"], {}) or {}).get("hours_offset") or 0
    d["hours_at"] = hours_until(d["printer"], _day_end(d["date"]), offset=off)
    cols = list(d) + ["created_at"]
    return _db().execute(f"INSERT INTO machine_maint({','.join(cols)}) VALUES({','.join('?' * len(cols))})", list(d.values()) + [_now()]).lastrowid


def update(mid, b):
    d = _clean(b)
    off = (_cfg().get(d["printer"], {}) or {}).get("hours_offset") or 0
    d["hours_at"] = hours_until(d["printer"], _day_end(d["date"]), offset=off)
    _db().execute(f"UPDATE machine_maint SET {', '.join(k + '=?' for k in d)} WHERE id=?", list(d.values()) + [mid])


def delete(mid):
    _db().execute("DELETE FROM machine_maint WHERE id=?", (mid,))


def set_cfg(printer, b):
    def num(v, lo, hi, cast=float):
        try:
            v = cast(float(str(v).replace(",", ".")))
        except (TypeError, ValueError):
            return None
        return max(lo, min(hi, v)) if v else None
    old = _cfg().get(printer, {})
    ih = num(b.get("interval_hours"), 1, 100000) if "interval_hours" in b else old.get("interval_hours")
    idays = num(b.get("interval_days"), 1, 3650, int) if "interval_days" in b else old.get("interval_days")
    off = (num(b.get("hours_offset"), 0, 1000000) or 0) if "hours_offset" in b else (old.get("hours_offset") or 0)
    _db().execute("INSERT INTO machine_cfg(printer, interval_hours, interval_days, hours_offset) VALUES(?,?,?,?) ON CONFLICT(printer) DO UPDATE SET "
                  "interval_hours=excluded.interval_hours, interval_days=excluded.interval_days, hours_offset=excluded.hours_offset",
                  (printer, ih, idays, off))
    if off != (old.get("hours_offset") or 0):   # başlangıç saati değişti: eski kayıtların "o andaki saat"i de kayar
        _db().execute("UPDATE machine_maint SET hours_at=COALESCE(hours_at,0)+? WHERE printer=?", (off - (old.get("hours_offset") or 0), printer))


def due():
    return [m for m in summary() if m["due"]]
