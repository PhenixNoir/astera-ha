"""Kendi bilgisayarında (Windows/Linux) çalışan Astera için tek tuşla güncelleme.

Yeni sürüm GitHub'daki Home Assistant eklenti deposundan (PhenixNoir/astera-ha) gelir; HA eklentisi de
aynı dosyaları kullanır. Güncelleme yalnızca program dosyalarını değiştirir: `data` klasörüne (veritabanı,
görseller, yedekler) asla dokunulmaz. Değişen eski dosyalar data/eski_surum/<sürüm>/ altına saklanır.
Home Assistant'ta dosyaları Home Assistant değiştirir. Ama Supervisor eklenti deposunu kendi saatinde (bazen
dakikalar sonra) yeniler; o zamana kadar "Güncelle" düğmesi eski sürümü gösterir. Bu yüzden HA'da bu modül
GitHub'daki sürüme bakar, yeni sürüm görünce Supervisor'a depoyu hemen yenilettirir ve istenirse güncellemeyi başlatır.
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import zipfile

REPO = "PhenixNoir/astera-ha"
BRANCH = "main"
RAW = os.environ.get("ATOLYE_UPD_RAW") or f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/astera/"
ZIP_URL = f"https://codeload.github.com/{REPO}/zip/refs/heads/{BRANCH}"
APP_PREFIX = "astera/app/"
MAX_ZIP = 60 * 1024 * 1024
RESTART_CODE = 75            # Baslat.bat bu kodla çıkınca programı aynı pencerede yeniden açar

_base = _data = None
_get_version = None
_cache = {"at": 0, "res": None}
_lock = threading.Lock()
_state = {"busy": False, "error": None}


def init(base_dir, data_dir, version_fn):
    global _base, _data, _get_version
    _base, _data, _get_version = base_dir, data_dir, version_fn


def enabled():
    return not os.environ.get("ATOLYE_HA")


def _vtuple(v):
    return tuple(int(x) for x in re.findall(r"\d+", v or "0")[:4]) or (0,)


def _fetch(url, limit=2 * 1024 * 1024, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Astera-Updater", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read(limit + 1)
    if len(data) > limit:
        raise ValueError("İndirilen dosya beklenenden büyük")
    return data


def _notes(changelog, current, latest):
    """CHANGELOG.md'den mevcut sürümden yeni olan bölümler."""
    out, cur = [], None
    for line in changelog.splitlines():
        m = re.match(r"^##\s+(\S+)", line)
        if m:
            v = m.group(1)
            cur = {"version": v, "items": []} if _vtuple(current) < _vtuple(v) <= _vtuple(latest) else None
            if cur:
                out.append(cur)
        elif cur is not None and line.strip().startswith("-"):
            cur["items"].append(line.strip()[1:].strip())
    return out[:12]


def ha_mode():
    return bool(os.environ.get("ATOLYE_HA") and os.environ.get("SUPERVISOR_TOKEN"))


def _sv(method, path, body=None, timeout=30):
    """Supervisor API (eklentinin kendi anahtarıyla; config.yaml'da hassio_api + hassio_role: manager)."""
    data = json.dumps(body).encode() if body is not None else (b"{}" if method == "POST" else None)
    req = urllib.request.Request((os.environ.get("ATOLYE_SV_BASE") or "http://supervisor") + path, data=data, method=method,
                                 headers={"Authorization": f"Bearer {os.environ.get('SUPERVISOR_TOKEN', '')}", "Content-Type": "application/json"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read() or b"{}").get("message")
        except Exception:
            msg = None
        raise RuntimeError(msg or f"Supervisor {e.code}")
    d = json.loads(raw or b"{}")
    if isinstance(d, dict) and d.get("result") == "error":
        raise RuntimeError(d.get("message") or "Supervisor hatası")
    return d.get("data", d) if isinstance(d, dict) else d


_ha = {"reload_at": 0}


def _ha_store(latest, force_reload=False):
    """Supervisor'ın gördüğü son sürüm. GitHub'da daha yenisi varsa depoyu hemen yeniletir (en sık 2 dk'da bir)."""
    info = _sv("GET", "/addons/self/info")
    seen = info.get("version_latest") or info.get("version")
    if (force_reload or (latest and _vtuple(latest) > _vtuple(seen))) and time.time() - _ha["reload_at"] > 120:
        _ha["reload_at"] = time.time()
        try:
            _sv("POST", "/store/reload", timeout=120)
        except RuntimeError:
            _sv("POST", "/addons/reload", timeout=120)   # eski Supervisor
        info = _sv("GET", "/addons/self/info")
        seen = info.get("version_latest") or info.get("version")
    return info, seen


def check(force=False):
    if not enabled() and not ha_mode():
        return {"enabled": False, "current": _get_version()}
    with _lock:
        if not force and _cache["res"] and time.time() - _cache["at"] < 3600:
            return {**_cache["res"], **_state}
    current = _get_version() or "0"
    try:
        latest = _fetch(RAW + f"app/VERSION?t={int(time.time())}", 100).decode("utf-8").strip()
        if not re.fullmatch(r"\d+(\.\d+){1,3}", latest):
            raise ValueError("Sürüm bilgisi okunamadı")
        notes = []
        if _vtuple(latest) > _vtuple(current):
            try:
                notes = _notes(_fetch(RAW + "CHANGELOG.md").decode("utf-8"), current, latest)
            except Exception:
                pass
        res = {"enabled": True, "current": current, "latest": latest, "available": _vtuple(latest) > _vtuple(current),
               "notes": notes, "checked_at": int(time.time()), "check_error": None}
        if ha_mode():
            res.update(enabled=False, ha=True)
            if res["available"]:
                try:
                    _, seen = _ha_store(latest)
                    res["store_latest"] = seen
                except Exception as e:  # noqa — yetki yoksa (eski kurulum) yine de sürümü gösteririz
                    res["store_error"] = str(e)[:160]
    except Exception as e:  # noqa
        res = {"enabled": True, "current": current, "latest": None, "available": False, "notes": [],
               "checked_at": int(time.time()), "check_error": f"Güncelleme sunucusuna ulaşılamadı ({type(e).__name__})"}
    with _lock:
        _cache.update(at=time.time(), res=res)
    return {**res, **_state}


def _safe_rel(name):
    rel = name[len(APP_PREFIX):] if name.startswith(APP_PREFIX) else None
    if not rel or rel.endswith("/"):
        return None
    parts = rel.replace("\\", "/").split("/")
    if any(p in ("", ".", "..") for p in parts) or parts[0] in ("data", "__pycache__") or ":" in rel:
        return None
    return "/".join(parts)


def ha_apply():
    """Supervisor'a depoyu yeniletip bu eklentiyi güncellettirir. Güncelleme eklentiyi durdurup yeniden başlatır."""
    info = check(force=True)
    if not info.get("available"):
        raise ValueError(info.get("check_error") or "Zaten en son sürüm kullanılıyor")
    ad, seen = _ha_store(info["latest"], force_reload=True)
    if _vtuple(seen) <= _vtuple(info["current"]):
        raise ValueError("Home Assistant yeni sürümü henüz görmüyor; bir dakika sonra tekrar deneyin")
    slug = ad.get("slug") or "self"

    def go():
        time.sleep(0.8)   # cevap tarayıcıya ulaşsın
        try:
            try:
                _sv("POST", f"/store/addons/{slug}/update", {"background": True}, timeout=60)
            except RuntimeError:
                _sv("POST", f"/store/addons/{slug}/update", None, timeout=1800)
        except Exception as e:  # noqa
            _state["error"] = f"Güncelleme başlatılamadı: {e}"
            print("HA güncellemesi başlatılamadı:", e, flush=True)
    threading.Thread(target=go, daemon=True).start()
    return {"version": info["latest"], "ha": True}


def apply():
    """İndir, doğrula, eski dosyaları sakla, yenileri yerine koy. Hata olursa hiçbir dosya değişmemiş olur."""
    if not enabled():
        raise ValueError("Home Assistant'ta güncelleme Home Assistant'tan yapılır")
    with _lock:
        if _state["busy"]:
            raise ValueError("Güncelleme zaten sürüyor")
        _state.update(busy=True, error=None)
    try:
        info = check(force=True)
        if not info.get("available"):
            raise ValueError(info.get("check_error") or "Zaten en son sürüm kullanılıyor")
        blob = _fetch(ZIP_URL, MAX_ZIP, timeout=120)
        zf = zipfile.ZipFile(io.BytesIO(blob))
        root = zf.namelist()[0].split("/")[0] + "/"
        files = {}
        for n in zf.namelist():
            if not n.startswith(root):
                continue
            rel = _safe_rel(n[len(root):])
            if rel:
                files[rel] = zf.read(n)
        if "server.py" not in files or "VERSION" not in files:
            raise ValueError("İndirilen paket eksik")
        newv = files["VERSION"].decode("utf-8").strip()
        # Python dosyaları sözdizimi açısından sağlam mı (yarım indirme vb.)
        for rel, data in files.items():
            if rel.endswith(".py"):
                compile(data, rel, "exec")
        cur = _get_version() or "eski"
        keep = os.path.join(_data, "eski_surum", re.sub(r"[^\w.]", "_", cur))
        os.makedirs(keep, exist_ok=True)
        staged = []
        for rel, data in files.items():
            dst = os.path.join(_base, *rel.split("/"))
            if os.path.isfile(dst):
                # başlatıcılar çalışırken değiştirilmez (Windows .bat dosyasını satır satır okur); aynı olanlar atlanır
                if rel.lower().endswith((".bat", ".vbs")):
                    continue
                with open(dst, "rb") as f:
                    if f.read() == data:
                        continue
            if os.path.isfile(dst):
                bk = os.path.join(keep, *rel.split("/"))
                os.makedirs(os.path.dirname(bk), exist_ok=True)
                shutil.copy2(dst, bk)
            tmp = dst + ".yeni"
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(tmp, "wb") as f:
                f.write(data)
            staged.append((tmp, dst))
        for tmp, dst in staged:
            os.replace(tmp, dst)
        _cache.update(at=0, res=None)
        return {"ok": True, "version": newv, "files": len(staged), "backup": keep}
    except Exception as e:
        _state["error"] = str(e)
        raise
    finally:
        _state["busy"] = False


def restart(delay=1.5):
    """Yeni sürümle yeniden başla. Baslat.bat ile açıldıysa aynı pencerede, değilse yeni bir süreç olarak."""
    def go():
        time.sleep(delay)
        if os.environ.get("ATOLYE_LAUNCHER") == "bat":
            os._exit(RESTART_CODE)
        env = {**os.environ, "ATOLYE_RESTART": "1"}
        kw = {"cwd": _base, "env": env, "close_fds": True}
        if os.name == "nt":
            console = not sys.executable.lower().endswith("pythonw.exe")
            kw["creationflags"] = (0x10 if console else 0x8) | 0x200   # NEW_CONSOLE / DETACHED + NEW_PROCESS_GROUP
        else:
            kw["start_new_session"] = True
        subprocess.Popen([sys.executable] + sys.argv, **kw)
        try:
            print("\n  Astera güncellendi ve yeni pencerede yeniden açıldı. Bu pencereyi kapatabilirsiniz.\n", flush=True)
        except Exception:
            pass
        os._exit(0)
    threading.Thread(target=go, daemon=True).start()


def start_checker(on_new=None):
    """Arka planda yeni sürüm var mı bak: bilgisayarda 6 saatte, HA'da 15 dakikada bir (depoyu da hemen yeniletir)."""
    if not enabled() and not ha_mode():
        return
    every = 900 if ha_mode() else 6 * 3600

    def loop():
        time.sleep(60)
        seen = None
        while True:
            try:
                r = check(force=True)
                if r.get("available") and r["latest"] != seen and on_new:
                    seen = r["latest"]
                    on_new(r)
            except Exception:
                pass
            time.sleep(every)
    threading.Thread(target=loop, daemon=True, name="updater").start()
