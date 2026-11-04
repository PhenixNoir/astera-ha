"""
Hata raporu: sunucunun son günlük satırları, tarayıcı hataları ve durum özeti tek bir JSON dosyasında.
Ayarlar → Veri ve Yedek → "Hata raporunu indir" ile alınır; destek için gönderilir.

Rapora gizli bilgi girmez: API anahtarları, erişim kodları, şifreler, oturum bilgileri ayıklanır;
müşteri adı / telefon / adres yazılmaz (sipariş numaraları kalır).
"""
import collections
import io
import json
import os
import platform
import re
import sys
import threading
import time
import traceback

LOG = collections.deque(maxlen=1500)       # sunucu konsolu (print, hata izleri)
CLIENT = collections.deque(maxlen=150)     # tarayıcıdan gelen hatalar
_lock = threading.Lock()
STARTED = int(time.time())

SECRET_KEY = re.compile(r"(secret|passw|_pass$|^pass$|token|cookie|session|sifre|şifre|vapid|private|api_key|access_code|"
                        r"^key$|^code$|^pin$|bambu_code|mr_key|smb_pass|auth_hash|_salt$|^salt$|password)", re.I)
SAFE_KEYS = set()
PII_KEY = re.compile(r"^(customer|first_name|last_name|phone|address|email|user_name|full_name|receiver)$", re.I)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_PHONE = re.compile(r"(?<!\d)(?:\+?90[\s-]?)?0?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)")


def _clean_text(s):
    s = _EMAIL.sub("<e-posta>", str(s))
    return _PHONE.sub("<telefon>", s)


def scrub(o, depth=0):
    """Sözlük / liste içindeki gizli ve kişisel alanları ayıklar."""
    if depth > 12:
        return "…"
    if isinstance(o, dict):
        out = {}
        for k, v in o.items():
            ks = str(k)
            if SECRET_KEY.search(ks) and not isinstance(v, bool) and not ks.endswith("_set"):
                out[ks] = "<gizli>" if v not in (None, "", 0) else v
            elif PII_KEY.match(ks):
                out[ks] = "<kişisel>" if v else v
            else:
                out[ks] = scrub(v, depth + 1)
        return out
    if isinstance(o, (list, tuple)):
        return [scrub(x, depth + 1) for x in o[:400]]
    if isinstance(o, str):
        return _clean_text(o[:4000])
    return o


class _Tee(io.TextIOBase):
    """Konsola yazılanı olduğu gibi geçirir, bir kopyasını da halka arabelleğe alır."""
    def __init__(self, orig, tag):
        self.orig, self.tag, self.buf = orig, tag, ""

    def write(self, s):
        try:
            if self.orig:
                self.orig.write(s)
        except Exception:
            pass
        self.buf += s
        while "\n" in self.buf:
            line, self.buf = self.buf.split("\n", 1)
            if line.strip():
                with _lock:
                    LOG.append(f"{time.strftime('%m-%d %H:%M:%S')} {self.tag} {_clean_text(line)[:1000]}")
        return len(s)

    def flush(self):
        try:
            if self.orig:
                self.orig.flush()
        except Exception:
            pass

    def isatty(self):
        return False


def install():
    if not isinstance(sys.stdout, _Tee):
        sys.stdout = _Tee(sys.stdout, "·")
    if not isinstance(sys.stderr, _Tee):
        sys.stderr = _Tee(sys.stderr, "!")


def log_exc(where):
    with _lock:
        LOG.append(f"{time.strftime('%m-%d %H:%M:%S')} ! {where}: " + _clean_text(traceback.format_exc())[-3000:])


def client_error(d):
    d = d if isinstance(d, dict) else {}
    item = {"at": int(time.time())}
    for k, n in (("msg", 600), ("stack", 2500), ("route", 120), ("src", 200), ("ua", 220), ("ver", 20)):
        if d.get(k) is not None:
            item[k] = _clean_text(str(d.get(k)))[:n]
    with _lock:
        if CLIENT and CLIENT[-1].get("msg") == item.get("msg") and item["at"] - CLIENT[-1]["at"] < 30:
            CLIENT[-1]["n"] = CLIENT[-1].get("n", 1) + 1   # aynı hata art arda: sayaç
            return
        CLIENT.append(item)


def _safe(fn):
    try:
        return scrub(fn())
    except Exception as e:  # noqa
        return {"rapor_hatasi": f"{type(e).__name__}: {e}"}


def report(parts):
    """parts: {'ad': çağrılabilir} — her biri ayrı denenir, biri bozulsa da rapor çıkar."""
    with _lock:
        log = list(LOG)
        cli = list(CLIENT)
    out = {
        "rapor": "Astera hata raporu",
        "olusturuldu": time.strftime("%Y-%m-%d %H:%M:%S"),
        "calisma_suresi_dk": round((time.time() - STARTED) / 60),
        "sistem": {"python": sys.version.split()[0], "os": platform.platform(), "ha_eklentisi": os.path.exists("/data/options.json")},
    }
    for name, fn in parts.items():
        out[name] = _safe(fn)
    out["tarayici_hatalari"] = cli
    out["sunucu_gunlugu"] = log[-800:]
    return out


def dumps(o):
    return json.dumps(o, ensure_ascii=False, indent=1, default=str)
