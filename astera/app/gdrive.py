"""
Google Drive yedeği: veritabanı yedekleri ve ürün görselleri kullanıcının Google Drive'ındaki "Astera Yedek" klasörüne gider.

Bağlanma "cihaz kodu" yöntemiyle yapılır (Raspberry Pi, Windows, tarayıcısı olmayan sunucu fark etmez):
uygulama Google'dan kısa bir kod alır, kullanıcı google.com/device adresinde bu kodu girip izin verir.
İzin kapsamı drive.file'dır: uygulama Drive'da yalnızca kendi oluşturduğu dosyaları görebilir.

Programın sahibinin Google Cloud'da oluşturduğu "TV ve sınırlı girişli cihaz" türü istemci kimliği gerekir
(Ayarlar → Yedekleme). Yenileme anahtarı yalnızca sunucuda saklanır, tarayıcıya gönderilmez.
"""
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

OAUTH = os.environ.get("ATOLYE_GOOGLE_OAUTH") or "https://oauth2.googleapis.com"
API = os.environ.get("ATOLYE_GOOGLE_API") or "https://www.googleapis.com"
SCOPE = "https://www.googleapis.com/auth/drive.file"
FOLDER_NAME = "Astera Yedek"
KEEP = 14

_db = _lock = _get = _set = None
DATA_DIR = None
_pending = {}            # cihaz kodu akışı: {user_code, url, expires, device_code, interval}
_state = {"busy": False}
_tok = {"access": None, "exp": 0}
_run = threading.Lock()


class DriveError(Exception):
    pass


def init(db, lock, get_setting, set_setting, data_dir):
    global _db, _lock, _get, _set, DATA_DIR
    _db, _lock, _get, _set, DATA_DIR = db, lock, get_setting, set_setting, data_dir
    with _lock:
        _db().execute("CREATE TABLE IF NOT EXISTS gdrive_files (name TEXT PRIMARY KEY, file_id TEXT, size INTEGER, at INTEGER)")
        _db().commit()


def _g(k, d=""):
    with _lock:
        return _get(k, d) or d


def _s(**kw):
    with _lock:
        for k, v in kw.items():
            _set(k, v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
        _db().commit()


def client():
    cid = (os.environ.get("ATOLYE_GDRIVE_CLIENT_ID") or _g("gdrive_client_id")).strip()
    sec = (os.environ.get("ATOLYE_GDRIVE_CLIENT_SECRET") or _g("gdrive_client_secret")).strip()
    return cid, sec


def status():
    cid, _ = client()
    try:
        last = json.loads(_g("gdrive_last", "null"))
    except ValueError:
        last = None
    p = dict(_pending) if _pending and _pending.get("expires", 0) > time.time() else None
    if p:
        p = {k: p[k] for k in ("user_code", "url", "expires") if k in p}
    return {"configured": bool(cid), "client_id_hint": (cid[:12] + "…") if cid else "", "connected": bool(_g("gdrive_refresh")),
            "email": _g("gdrive_email"), "last": last, "busy": _state["busy"], "pending": p, "error": _g("gdrive_error") or None}


def _post(url, data, headers=None):
    body = urllib.parse.urlencode(data).encode() if isinstance(data, dict) else data
    req = urllib.request.Request(url, data=body, method="POST", headers=headers or {"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw.decode("utf-8")) if raw else {}, dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            j = json.loads(e.read().decode("utf-8"))
        except Exception:  # noqa
            j = {}
        j["_status"] = e.code
        return j, dict(e.headers or {})


# ---------------------------------------------------------------- bağlanma (cihaz kodu)
def connect():
    cid, sec = client()
    if not cid:
        raise DriveError("Google uygulama kimliği girilmemiş (Ayarlar → Yedekleme)")
    j, _ = _post(f"{OAUTH}/device/code", {"client_id": cid, "scope": SCOPE})
    if "device_code" not in j:
        raise DriveError(f"Google kod vermedi: {j.get('error_description') or j.get('error') or j}")
    _pending.clear()
    _pending.update(device_code=j["device_code"], user_code=j["user_code"], url=j.get("verification_url") or j.get("verification_uri") or "https://www.google.com/device",
                    expires=time.time() + int(j.get("expires_in") or 1800), interval=max(3, int(j.get("interval") or 5)))
    threading.Thread(target=_poll, daemon=True, name="gdrive-connect").start()
    return status()


def _poll():
    cid, sec = client()
    dc = _pending.get("device_code")
    while _pending.get("device_code") == dc and time.time() < _pending.get("expires", 0):
        time.sleep(_pending.get("interval", 5))
        j, _ = _post(f"{OAUTH}/token", {"client_id": cid, "client_secret": sec, "device_code": dc,
                                       "grant_type": "urn:ietf:params:oauth:grant-type:device_code"})
        if j.get("refresh_token"):
            _tok.update(access=j.get("access_token"), exp=time.time() + int(j.get("expires_in") or 3000) - 60)
            _s(gdrive_refresh=j["refresh_token"], gdrive_error="")
            _pending.clear()
            try:
                about = _api("GET", "/drive/v3/about?fields=user(emailAddress,displayName)")
                _s(gdrive_email=(about.get("user") or {}).get("emailAddress") or "")
                _folder()
            except DriveError as e:
                print("Google Drive klasörü hazırlanamadı:", e)
            threading.Thread(target=backup_now, daemon=True, name="gdrive-first").start()
            return
        err = j.get("error")
        if err == "slow_down":
            _pending["interval"] = _pending.get("interval", 5) + 5
        elif err not in ("authorization_pending",):
            _s(gdrive_error=f"Bağlanılamadı: {j.get('error_description') or err}")
            _pending.clear()
            return
    _pending.clear()


def disconnect():
    tok = _g("gdrive_refresh")
    if tok:
        try:
            _post(f"{OAUTH}/revoke", {"token": tok})
        except Exception:  # noqa
            pass
    _tok.update(access=None, exp=0)
    _s(gdrive_refresh="", gdrive_email="", gdrive_folder="", gdrive_up_folder="", gdrive_error="")
    with _lock:
        _db().execute("DELETE FROM gdrive_files")
        _db().commit()
    return status()


# ---------------------------------------------------------------- Drive API
def _access():
    if _tok["access"] and time.time() < _tok["exp"]:
        return _tok["access"]
    rt = _g("gdrive_refresh")
    if not rt:
        raise DriveError("Google Drive bağlı değil")
    cid, sec = client()
    j, _ = _post(f"{OAUTH}/token", {"client_id": cid, "client_secret": sec, "refresh_token": rt, "grant_type": "refresh_token"})
    if not j.get("access_token"):
        if j.get("error") in ("invalid_grant", "unauthorized_client"):
            _s(gdrive_refresh="", gdrive_error="Google Drive bağlantısı kesilmiş (izin geri alınmış olabilir). Yeniden bağlayın.")
        raise DriveError(f"Google oturumu yenilenemedi: {j.get('error_description') or j.get('error') or j}")
    _tok.update(access=j["access_token"], exp=time.time() + int(j.get("expires_in") or 3000) - 60)
    return _tok["access"]


def _api(method, path, body=None, raw=False, ctype="application/json"):
    data = json.dumps(body).encode() if body is not None and not isinstance(body, bytes) else body
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Authorization": f"Bearer {_access()}", **({"Content-Type": ctype} if data is not None else {})})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            out = r.read()
            if raw:
                return out
            return json.loads(out.decode("utf-8")) if out else {}
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "ignore")[:300]
        if e.code == 401:
            _tok.update(access=None, exp=0)
        raise DriveError(f"Google Drive {e.code}: {msg}")
    except urllib.error.URLError as e:
        raise DriveError(f"Google Drive'a ulaşılamadı: {e.reason}")


def _q(s):
    return s.replace("\\", "\\\\").replace("'", "\\'")


def _find_or_make(name, parent=None):
    q = f"name='{_q(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false" + (f" and '{parent}' in parents" if parent else "")
    r = _api("GET", "/drive/v3/files?" + urllib.parse.urlencode({"q": q, "fields": "files(id,name)", "spaces": "drive"}))
    if r.get("files"):
        return r["files"][0]["id"]
    meta = {"name": name, "mimeType": "application/vnd.google-apps.folder", **({"parents": [parent]} if parent else {})}
    return _api("POST", "/drive/v3/files?fields=id", meta)["id"]


def _folder():
    fid = _g("gdrive_folder")
    if fid:
        try:
            r = _api("GET", f"/drive/v3/files/{fid}?fields=id,trashed")
            if not r.get("trashed"):
                return fid
        except DriveError:
            pass
    fid = _find_or_make(FOLDER_NAME)
    _s(gdrive_folder=fid, gdrive_up_folder="")
    with _lock:
        _db().execute("DELETE FROM gdrive_files")
        _db().commit()
    return fid


def _up_folder():
    fid = _g("gdrive_up_folder")
    if not fid:
        fid = _find_or_make("uploads", _folder())
        _s(gdrive_up_folder=fid)
    return fid


def _upload(path, name, parent, mime="application/octet-stream"):
    """Dosyayı kesintiye dayanıklı (resumable) yüklemeyle gönderir; dosya kimliğini döner."""
    meta = json.dumps({"name": name, "parents": [parent]}).encode()
    req = urllib.request.Request(f"{API}/upload/drive/v3/files?uploadType=resumable&fields=id", data=meta, method="POST",
                                 headers={"Authorization": f"Bearer {_access()}", "Content-Type": "application/json; charset=UTF-8",
                                          "X-Upload-Content-Type": mime, "X-Upload-Content-Length": str(os.path.getsize(path))})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            loc = r.headers.get("Location")
    except urllib.error.HTTPError as e:
        raise DriveError(f"Yükleme başlatılamadı ({e.code}): {e.read().decode('utf-8', 'ignore')[:200]}")
    if not loc:
        raise DriveError("Yükleme adresi alınamadı")
    with open(path, "rb") as f:
        data = f.read()
    req = urllib.request.Request(loc, data=data, method="PUT", headers={"Content-Type": mime, "Content-Length": str(len(data))})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(r.read().decode("utf-8") or "{}").get("id")
    except urllib.error.HTTPError as e:
        raise DriveError(f"Yüklenemedi ({e.code}): {e.read().decode('utf-8', 'ignore')[:200]}")


def list_backups():
    fid = _folder()
    q = f"'{fid}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'"
    r = _api("GET", "/drive/v3/files?" + urllib.parse.urlencode({"q": q, "fields": "files(id,name,size,createdTime)", "orderBy": "name desc", "pageSize": 100}))
    return [{"id": f["id"], "name": f["name"], "size": int(f.get("size") or 0), "created": f.get("createdTime")} for f in r.get("files", []) if f["name"].endswith(".db")]


def _prune():
    files = list_backups()
    for f in files[KEEP:]:
        try:
            _api("DELETE", f"/drive/v3/files/{f['id']}")
        except DriveError as e:
            print("Eski Drive yedeği silinemedi:", e)


def _sync_uploads():
    src = os.path.join(DATA_DIR, "uploads")
    if not os.path.isdir(src):
        return 0
    with _lock:
        have = {r[0] for r in _db().execute("SELECT name FROM gdrive_files")}
    todo = [n for n in sorted(os.listdir(src)) if n not in have and os.path.isfile(os.path.join(src, n))]
    if not todo:
        return 0
    up = _up_folder()
    n = 0
    for name in todo:
        p = os.path.join(src, name)
        fid = _upload(p, name, up, "image/jpeg" if name.lower().endswith((".jpg", ".jpeg")) else "application/octet-stream")
        with _lock:
            _db().execute("INSERT OR REPLACE INTO gdrive_files(name,file_id,size,at) VALUES(?,?,?,?)", (name, fid, os.path.getsize(p), int(time.time())))
            _db().commit()
        n += 1
    return n


def upload_backup(path):
    """Verilen yedek dosyasını Drive'a gönderir, görselleri eşitler, eskileri siler."""
    if not _g("gdrive_refresh"):
        return None
    if not _run.acquire(blocking=False):
        return None
    _state["busy"] = True
    try:
        fid = _upload(path, os.path.basename(path), _folder())
        imgs = _sync_uploads()
        _prune()
        info = {"at": int(time.time()), "name": os.path.basename(path), "size": os.path.getsize(path), "images": imgs, "id": fid}
        _s(gdrive_last=info, gdrive_error="")
        return info
    except DriveError as e:
        _s(gdrive_error=str(e))
        print("Google Drive yedeği gönderilemedi:", e)
        return None
    except Exception as e:  # noqa
        _s(gdrive_error=f"Beklenmeyen hata: {e}")
        print("Google Drive yedeği gönderilemedi:", e)
        return None
    finally:
        _state["busy"] = False
        _run.release()


def upload_async(path):
    if _g("gdrive_refresh"):
        threading.Thread(target=upload_backup, args=(path,), daemon=True, name="gdrive-upload").start()


def backup_now():
    import yedek
    info = yedek.make("elle")
    return upload_backup(os.path.join(yedek.folder(), info["name"]))


def download(file_id, dest):
    data = _api("GET", f"/drive/v3/files/{urllib.parse.quote(file_id)}?alt=media", raw=True)
    with open(dest, "wb") as f:
        f.write(data)
    return dest


def restore_images():
    """Drive'daki görselleri eksikse geri indirir (bilgisayar değiştiğinde)."""
    dst = os.path.join(DATA_DIR, "uploads")
    os.makedirs(dst, exist_ok=True)
    up = _up_folder()
    n, token = 0, None
    while True:
        params = {"q": f"'{up}' in parents and trashed=false", "fields": "nextPageToken,files(id,name)", "pageSize": 500}
        if token:
            params["pageToken"] = token
        r = _api("GET", "/drive/v3/files?" + urllib.parse.urlencode(params))
        for f in r.get("files", []):
            p = os.path.join(dst, os.path.basename(f["name"]))
            if not os.path.exists(p):
                download(f["id"], p)
                n += 1
        token = r.get("nextPageToken")
        if not token:
            return n
