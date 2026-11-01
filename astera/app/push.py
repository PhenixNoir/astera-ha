"""
Telefona anlık bildirim (Web Push). Ek paket gerektirmez: VAPID imzası (ES256 / P-256 ECDSA) burada saf Python ile yazılıdır.

İçeriksiz ("payload'sız") push gönderilir; şifreleme gerekmez. Telefondaki uygulama push gelince
/api/notifications/recent adresinden son bildirimleri çekip gösterir.
Telefonun push alabilmesi için uygulamanın https ile açılması gerekir (ör. Tailscale).
"""
import base64
import hashlib
import json
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

_db = _lock = _get = _set = None

# ---------------------------------------------------------------- P-256 (secp256r1)
P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF
A = P - 3
B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B
N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
G = (0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296,
     0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5)


def _inv(x, m):
    return pow(x, m - 2, m)


def _jdouble(p):
    x, y, z = p
    if not y:
        return (0, 0, 0)
    ysq = y * y % P
    s = 4 * x * ysq % P
    m = (3 * x * x + A * pow(z, 4, P)) % P
    nx = (m * m - 2 * s) % P
    ny = (m * (s - nx) - 8 * ysq * ysq) % P
    nz = 2 * y * z % P
    return (nx, ny, nz)


def _jadd(p, q):
    if not p[2]:
        return q
    if not q[2]:
        return p
    x1, y1, z1 = p
    x2, y2, z2 = q
    z1s, z2s = z1 * z1 % P, z2 * z2 % P
    u1, u2 = x1 * z2s % P, x2 * z1s % P
    s1, s2 = y1 * z2s * z2 % P, y2 * z1s * z1 % P
    if u1 == u2:
        return _jdouble(p) if s1 == s2 else (0, 0, 0)
    h, r = (u2 - u1) % P, (s2 - s1) % P
    h2 = h * h % P
    h3 = h * h2 % P
    u1h2 = u1 * h2 % P
    nx = (r * r - h3 - 2 * u1h2) % P
    ny = (r * (u1h2 - nx) - s1 * h3) % P
    nz = h * z1 * z2 % P
    return (nx, ny, nz)


def _mul(k, pt=G):
    r, q = (0, 0, 0), (pt[0], pt[1], 1)
    while k:
        if k & 1:
            r = _jadd(r, q)
        q = _jdouble(q)
        k >>= 1
    if not r[2]:
        return None
    zi = _inv(r[2], P)
    return (r[0] * zi * zi % P, r[1] * zi * zi * zi % P)


def _b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _keys():
    d = _get("vapid_d")
    if not d:
        d = format(secrets.randbelow(N - 1) + 1, "064x")
        _set("vapid_d", d)
        _db().commit()
    d = int(d, 16)
    x, y = _mul(d)
    return d, b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big")


def public_key():
    with _lock:
        return _b64u(_keys()[1])


def _sign(d, msg):
    h = int.from_bytes(hashlib.sha256(msg).digest(), "big")
    while True:
        k = secrets.randbelow(N - 1) + 1
        r = _mul(k)[0] % N
        if not r:
            continue
        s = _inv(k, N) * (h + r * d) % N
        if s:
            return r.to_bytes(32, "big") + s.to_bytes(32, "big")


def vapid_header(endpoint, d, pub):
    u = urllib.parse.urlparse(endpoint)
    head = _b64u(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    body = _b64u(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600,
                             "sub": "mailto:astera@example.com"}, separators=(",", ":")).encode())
    sig = _b64u(_sign(d, f"{head}.{body}".encode()))
    return f"vapid t={head}.{body}.{sig}, k={_b64u(pub)}"


# ---------------------------------------------------------------- abonelikler

SCHEMA = """
CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT,
    auth TEXT,
    ua TEXT,
    created_at INTEGER,
    last_ok INTEGER,
    last_error TEXT
);
"""


def init(db, lock, get_setting, set_setting):
    global _db, _lock, _get, _set
    _db, _lock, _get, _set = db, lock, get_setting, set_setting
    _db().executescript(SCHEMA)


def subscribe(sub, ua=""):
    ep = (sub or {}).get("endpoint") or ""
    if not ep.startswith("https://"):
        raise ValueError("Geçersiz abonelik")
    keys = sub.get("keys") or {}
    _db().execute("""INSERT INTO push_subs(endpoint,p256dh,auth,ua,created_at) VALUES(?,?,?,?,?)
                     ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, ua=excluded.ua""",
                  (ep, keys.get("p256dh"), keys.get("auth"), (ua or "")[:200], int(time.time())))


def unsubscribe(endpoint):
    _db().execute("DELETE FROM push_subs WHERE endpoint=?", (endpoint,))


def count():
    return _db().execute("SELECT COUNT(*) FROM push_subs").fetchone()[0]


def _send_one(endpoint, d, pub):
    req = urllib.request.Request(endpoint, data=b"", method="POST", headers={
        "TTL": "86400", "Urgency": "high", "Content-Length": "0", "Authorization": vapid_header(endpoint, d, pub)})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")[:200]
    except Exception as e:  # noqa
        return 0, str(e)


def send_all():
    """Tüm kayıtlı telefonlara içeriksiz push yollar. Ağ işleri kilitsiz yapılır."""
    with _lock:
        d, pub = _keys()
        subs = [r["endpoint"] for r in _db().execute("SELECT endpoint FROM push_subs")]
    results = []
    for ep in subs:
        code, err = _send_one(ep, d, pub)
        results.append({"endpoint": ep[:60], "status": code, "error": err})
        with _lock:
            if code in (404, 410):          # telefon aboneliği bırakmış
                _db().execute("DELETE FROM push_subs WHERE endpoint=?", (ep,))
            elif 200 <= code < 300:
                _db().execute("UPDATE push_subs SET last_ok=?, last_error=NULL WHERE endpoint=?", (int(time.time()), ep))
            else:
                _db().execute("UPDATE push_subs SET last_error=? WHERE endpoint=?", (f"{code} {err or ''}"[:200], ep))
            _db().commit()
    return results


def send_async():
    threading.Thread(target=lambda: _safe(send_all), daemon=True, name="push").start()


def _safe(f):
    try:
        f()
    except Exception as e:  # noqa
        print("Push gönderilemedi:", e)
