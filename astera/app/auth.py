"""Uzaktan erişim koruması.

Ev ağından gelen istekler eskisi gibi şifresiz çalışır. Cloudflare Tunnel üzerinden (dışarıdan) gelen her istek
ise geçerli bir oturum jetonu ister: tarayıcıda çerez, telefon uygulamasında X-Astera-Token başlığı.
Cloudflare her isteğe Cf-Connecting-Ip / Cf-Ray başlığı ekler; dışarıdaki biri bunları silemez, bu yüzden
"dışarıdan mı" sorusunu bu başlıklarla cevaplıyoruz. Şifre belirlenmemişse dışarıdan hiçbir şey açılmaz.
"""
import hashlib
import hmac
import json
import os
import secrets
import threading
import time

COOKIE = "astera_t"
TOKEN_DAYS = 365
_db = _lock = _get = _set = None
_tokens = {}            # sha256(token) -> {"name", "created", "seen"}
_tlock = threading.Lock()
_fails = {}             # ip -> [zamanlar]
_gfails = []            # tüm başarısız denemeler (dağıtık deneme için genel sınır)

SCHEMA = """
CREATE TABLE IF NOT EXISTS auth_tokens (
    hash TEXT PRIMARY KEY,
    name TEXT,
    kind TEXT,
    created_at INTEGER,
    seen_at INTEGER,
    seen_ip TEXT
);
"""


def init(db, lock, get_setting, set_setting):
    global _db, _lock, _get, _set
    _db, _lock, _get, _set = db, lock, get_setting, set_setting
    _db().executescript(SCHEMA)
    _reload()


def _reload():
    rows = _db().execute("SELECT hash, name, kind, created_at, seen_at FROM auth_tokens").fetchall()
    with _tlock:
        _tokens.clear()
        for r in rows:
            _tokens[r["hash"]] = {"name": r["name"], "kind": r["kind"], "created": r["created_at"], "seen": r["seen_at"] or 0}


def _h(tok):
    return hashlib.sha256(tok.encode("utf-8")).hexdigest()


def is_remote(headers):
    return bool(headers.get("Cf-Connecting-Ip") or headers.get("Cf-Ray") or "cloudflare" in (headers.get("Cdn-Loop") or "").lower())


def client_ip(handler):
    return handler.headers.get("Cf-Connecting-Ip") or handler.client_address[0]


def _cookie_token(headers):
    for part in (headers.get("Cookie") or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k == COOKIE and v:
            return v
    return None


def check(handler):
    """İstek geçebilir mi? Yerel: her zaman. Uzak: geçerli jeton gerekir."""
    if not is_remote(handler.headers):
        return True
    tok = handler.headers.get("X-Astera-Token") or _cookie_token(handler.headers)
    if not tok or len(tok) > 200:
        return False
    h = _h(tok)
    with _tlock:
        info = _tokens.get(h)
        if not info:
            return False
        t = int(time.time())
        stale = t - info["seen"] > 600
        if stale:
            info["seen"] = t
    if stale:   # son görülme zamanını ara sıra yaz (her istekte veritabanına dokunma)
        threading.Thread(target=_touch, args=(h, t, client_ip(handler)), daemon=True).start()
    return True


def _touch(h, t, ip):
    try:
        with _lock:
            _db().execute("UPDATE auth_tokens SET seen_at=?, seen_ip=? WHERE hash=?", (t, ip, h))
            _db().commit()
    except Exception:
        pass


# ------------------------------------------------------------------ şifre

def has_password():
    return bool(_get("remote_pass", ""))


def _hash_pw(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    d = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt), 200_000).hex()
    return f"pbkdf2${salt}${d}"


def _verify_pw(pw):
    stored = _get("remote_pass", "") or ""
    try:
        _, salt, d = stored.split("$")
    except ValueError:
        return False
    return hmac.compare_digest(_hash_pw(pw, salt).split("$")[2], d)


def set_password(new, current=None):
    new = (new or "").strip()
    if len(new) < 8:
        raise ValueError("Şifre en az 8 karakter olmalı")
    if has_password() and not _verify_pw(current or ""):
        raise ValueError("Mevcut şifre yanlış")
    _set("remote_pass", _hash_pw(new))
    # şifre değişince eski oturumların hepsi kapanır
    _db().execute("DELETE FROM auth_tokens")
    _reload()


def clear_password():
    _set("remote_pass", "")
    _db().execute("DELETE FROM auth_tokens")
    _reload()


def _limited(ip):
    t = time.time()
    with _tlock:
        _fails[ip] = [x for x in _fails.get(ip, []) if t - x < 900]
        _gfails[:] = [x for x in _gfails if t - x < 900]
        return len(_fails[ip]) >= 5 or len(_gfails) >= 30


def _fail(ip):
    t = time.time()
    with _tlock:
        _fails.setdefault(ip, []).append(t)
        _gfails.append(t)


def login(pw, name, kind, ip):
    """Doğruysa yeni jeton döner. Çağıran DB kilidini tutmaz (pbkdf2 yavaş)."""
    if _limited(ip):
        raise PermissionError("Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.")
    with _lock:
        ok = has_password() and _verify_pw(pw or "")
    if not ok:
        _fail(ip)
        time.sleep(1)
        if not has_password():
            raise PermissionError("Uzaktan erişim kapalı: önce evdeki ağdan Ayarlar → Uzaktan erişim'de şifre belirleyin.")
        raise PermissionError("Şifre yanlış")
    tok = secrets.token_urlsafe(32)
    t = int(time.time())
    with _lock:
        _db().execute("INSERT INTO auth_tokens(hash,name,kind,created_at,seen_at,seen_ip) VALUES(?,?,?,?,?,?)",
                      (_h(tok), (name or "Cihaz")[:60], kind if kind in ("app", "web") else "web", t, t, ip))
        _db().commit()
        _reload()
    with _tlock:
        _fails.pop(ip, None)
    return tok


def logout(tok):
    if tok:
        _db().execute("DELETE FROM auth_tokens WHERE hash=?", (_h(tok),))
        _reload()


def devices(current_tok=None):
    cur = _h(current_tok) if current_tok else None
    rows = _db().execute("SELECT hash, name, kind, created_at, seen_at, seen_ip FROM auth_tokens ORDER BY seen_at DESC").fetchall()
    return [{"id": r["hash"][:16], "name": r["name"], "kind": r["kind"], "created_at": r["created_at"],
             "seen_at": r["seen_at"], "ip": r["seen_ip"], "current": r["hash"] == cur} for r in rows]


def revoke(dev_id):
    if not dev_id or len(dev_id) < 8:
        raise ValueError("Geçersiz cihaz")
    _db().execute("DELETE FROM auth_tokens WHERE substr(hash,1,?)=?", (len(dev_id), dev_id))
    _reload()


def cookie_header(tok, max_age=TOKEN_DAYS * 86400):
    return f"{COOKIE}={tok}; Path=/; Max-Age={max_age}; HttpOnly; Secure; SameSite=Lax"


LOGIN_HTML = """<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Astera · Giriş</title>
<meta name="theme-color" content="#1A1C1F"><link rel="icon" href="data:,">
<style>
:root{color-scheme:dark;--bg:#16181b;--card:#202327;--ink:#eceae6;--mut:#9a9893;--acc:#c98a5a;--bad:#e06c5f}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
form{width:100%;max-width:360px;background:var(--card);border:1px solid #2c3036;border-radius:16px;padding:28px 24px;display:grid;gap:14px}
h1{margin:0;font-size:22px;letter-spacing:.02em}p{margin:0;color:var(--mut);font-size:14px}
input{width:100%;height:46px;border-radius:10px;border:1px solid #3a3f46;background:#16181b;color:var(--ink);padding:0 14px;font-size:16px}
input:focus{outline:2px solid var(--acc);outline-offset:1px}
button{height:46px;border:0;border-radius:10px;background:var(--acc);color:#1a1209;font-weight:700;font-size:16px;cursor:pointer}
button[disabled]{opacity:.6}.err{color:var(--bad);font-size:14px;min-height:20px}
</style></head><body>
<form id="f" autocomplete="on"><h1>Astera</h1><p>Evin dışından bağlanıyorsunuz. Devam etmek için uzaktan erişim şifresini girin.</p>
<input id="p" type="password" name="password" autocomplete="current-password" placeholder="Şifre" required autofocus>
<div class="err" id="e" role="alert"></div><button id="b">Giriş</button></form>
<script>
document.getElementById('f').onsubmit=async function(ev){ev.preventDefault();var b=document.getElementById('b'),e=document.getElementById('e');b.disabled=true;e.textContent='';
try{var r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('p').value,name:navigator.userAgent.indexOf('Android')>=0?'Android tarayıcı':navigator.platform||'Tarayıcı',kind:'web'})});
var j=await r.json();if(!r.ok)throw new Error(j.error||'Giriş yapılamadı');var n=new URLSearchParams(location.search).get('next')||'/';location.replace(n.charAt(0)==='/'&&n.charAt(1)!=='/'?n:'/');}
catch(x){e.textContent=x.message;b.disabled=false;}};
</script></body></html>"""
