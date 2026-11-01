"""
Otomatik yedek: veritabanının günlük kopyası.

- Her gün ilk fırsatta (sunucu açıksa) data/yedek klasörüne bir yedek alınır; son 14 otomatik yedek tutulur.
- Ayarlar'da ek klasör (OneDrive, Google Drive vb.) yazılırsa yedek oraya da kopyalanır; görseller (data/uploads)
  oradaki uploads klasörüne eksik olanlar eklenerek aktarılır.
- Geri yükleme yalnızca data/yedek içindeki dosyalardan yapılır; öncesinde o anki veriler ayrı bir yedeğe alınır.
Yalnızca bu modülün adlandırdığı dosyalara (atolye-oto/elle/once-...db) dokunulur; silme de sadece bunlar içindir.
"""
import json
import os
import re
import shutil
import sqlite3
import threading
import time

_db = _lock = _get = _set = None
DATA_DIR = None
KEEP = {"oto": 14, "elle": 10, "once": 5}
KIND_TEXT = {"oto": "Otomatik", "elle": "Elle", "once": "Geri yükleme öncesi"}
NAME_RX = re.compile(r"^atolye-(oto|elle|once)-(\d{8})-(\d{6})\.db$")
_busy = threading.Lock()


def init(db, lock, get_setting, set_setting, data_dir):
    global _db, _lock, _get, _set, DATA_DIR
    _db, _lock, _get, _set, DATA_DIR = db, lock, get_setting, set_setting, data_dir


def folder():
    return os.path.join(DATA_DIR, "yedek")


def _parse(name):
    m = NAME_RX.match(name or "")
    if not m:
        return None
    kind, d, t = m.groups()
    try:
        at = int(time.mktime(time.strptime(d + t, "%Y%m%d%H%M%S")))
    except ValueError:
        return None
    return {"kind": kind, "at": at}


def _files(d):
    out = []
    try:
        names = os.listdir(d)
    except OSError:
        return out
    for n in names:
        info = _parse(n)
        if info:
            p = os.path.join(d, n)
            try:
                size = os.path.getsize(p)
            except OSError:
                continue
            out.append({"name": n, "size": size, **info, "kind_text": KIND_TEXT[info["kind"]]})
    out.sort(key=lambda x: (x["at"], x["name"]), reverse=True)
    return out


def _prune(d):
    for kind, keep in KEEP.items():
        for f in [x for x in _files(d) if x["kind"] == kind][keep:]:
            try:
                os.remove(os.path.join(d, f["name"]))
            except OSError:
                pass


def extra_dir():
    return (_get("backup_dir", "") or "").strip()


def _copy_extra(path):
    """Yedeği ek klasöre kopyalar, görsellerin eksiklerini aktarır. Hata metni ya da None döner."""
    d = extra_dir()
    if not d:
        return None
    if not os.path.isabs(d) or not os.path.isdir(d):
        return f"Ek yedek klasörü bulunamadı: {d}"
    try:
        shutil.copy2(path, os.path.join(d, os.path.basename(path)))
        _prune(d)
        src_up = os.path.join(DATA_DIR, "uploads")
        if os.path.isdir(src_up):
            dst_up = os.path.join(d, "uploads")
            os.makedirs(dst_up, exist_ok=True)
            have = set(os.listdir(dst_up))
            for n in os.listdir(src_up):
                sp = os.path.join(src_up, n)
                if n not in have and os.path.isfile(sp):
                    shutil.copy2(sp, os.path.join(dst_up, n))
    except OSError as e:
        return f"Ek klasöre kopyalanamadı: {e}"
    return None


def make(kind="elle"):
    """Yedek alır; {name, size, at, kind, extra_error} döner."""
    if kind not in KEEP:
        kind = "elle"
    with _busy:
        os.makedirs(folder(), exist_ok=True)
        while True:
            name = f"atolye-{kind}-{time.strftime('%Y%m%d-%H%M%S')}.db"
            path = os.path.join(folder(), name)
            if not os.path.exists(path):
                break
            time.sleep(1)
        tmp = path + ".tmp"
        with _lock:
            _db().commit()
            bk = sqlite3.connect(tmp)
            try:
                _db().backup(bk)
            finally:
                bk.close()
        os.replace(tmp, path)
        _prune(folder())
        err = _copy_extra(path)
        info = {"name": name, "size": os.path.getsize(path), "at": int(time.time()), "kind": kind, "extra_error": err}
        with _lock:
            _set("backup_last", json.dumps(info))
            _db().commit()
        return info


def listing():
    try:
        last = json.loads(_get("backup_last", "") or "{}")
    except ValueError:
        last = {}
    files = _files(folder())
    auto = next((f for f in files if f["kind"] == "oto"), None)
    return {"files": files, "last": last or None, "last_auto": auto, "dir": extra_dir(), "keep": KEEP["oto"]}


def path_of(name):
    if not _parse(name):
        return None
    p = os.path.join(folder(), name)
    return p if os.path.isfile(p) else None


def check(path):
    """Dosya sağlam bir Astera veritabanı mı?"""
    try:
        c = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            ok = c.execute("PRAGMA quick_check").fetchone()[0] == "ok"
            has = c.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('products','print_jobs','settings')").fetchone()[0] == 3
        finally:
            c.close()
        return ok and has
    except sqlite3.Error:
        return False


def restore(name):
    """data/yedek içindeki bir yedeği canlı veritabanına yazar. Önce o anki verinin yedeğini alır."""
    p = path_of(name)
    if not p:
        raise ValueError("Yedek dosyası bulunamadı")
    if not check(p):
        raise ValueError("Yedek dosyası bozuk ya da Astera yedeği değil")
    before = make("once")
    with _lock:
        src = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
        try:
            src.backup(_db())
        finally:
            src.close()
    return before


def _loop():
    time.sleep(90)
    while True:
        try:
            today = time.strftime("%Y%m%d")
            if not any(f["kind"] == "oto" and f["name"].split("-")[2] == today for f in _files(folder())):
                make("oto")
        except Exception as e:  # noqa
            print("Otomatik yedek alınamadı:", e)
        time.sleep(600)


def start():
    threading.Thread(target=_loop, daemon=True, name="yedek").start()
