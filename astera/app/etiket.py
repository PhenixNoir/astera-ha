"""
Kargo etiketi yazdırma: Trendyol'un ortak etiketini (ZPL) termal etiket yazıcısına ham olarak gönderir.

Yazıcı bağlantısı (Ayarlar → Etiket yazıcısı):
- share: Windows'ta paylaşıma açılmış yazıcı (bu bilgisayarda ya da ağdaki başka bir bilgisayarda). ZPL,
  \\\\<bilgisayar>\\<paylaşım adı> yoluna yazılır (bilgisayar boşsa localhost) (Windows'taki `copy /b etiket.zpl \\\\localhost\\ZEBRA` ile aynı iş).
- net: ağdaki yazıcının 9100 portuna (ham yazdırma) doğrudan gönderilir.
Gelen etiketler data/etiket klasöründe saklanır; tekrar basmada Trendyol'a yeniden sorulmaz.
"""
import json
import os
import re
import socket
import subprocess
import sys
import threading

import trendyol

_lock = _get = _set = _db = None
DATA_DIR = None
_print_lock = threading.Lock()
SHARE_RX = re.compile(r"^[\w .\-()]{1,80}$", re.UNICODE)

TEST_ZPL = ("^XA^CI28^PW800^LL800^FO40,40^A0N,60,60^FDAstera^FS^FO40,120^A0N,36,36^FDDeneme etiketi^FS"
            "^FO40,180^A0N,30,30^FDYazici baglantisi calisiyor.^FS^FO40,260^BY3^BCN,120,Y,N,N^FD123456789012^FS^XZ")


def init(db, lock, get_setting, set_setting, data_dir):
    global _db, _lock, _get, _set, DATA_DIR
    _db, _lock, _get, _set, DATA_DIR = db, lock, get_setting, set_setting, data_dir


def conf():
    try:
        with _lock:
            c = json.loads(_get("label_printer", "") or "{}")
    except ValueError:
        c = {}
    return {"mode": c.get("mode") if c.get("mode") in ("share", "net") else "browser", "share": c.get("share") or "", "host": c.get("host") or "",
            "ip": c.get("ip") or "", "port": int(c.get("port") or 9100), "auto": bool(c.get("auto", True)),
            "smb_user": c.get("smb_user") or "", "smb_pass": c.get("smb_pass") or "",
            "logo": c.get("logo") or ""}   # "" = paketle gelen logo, "none" = logo yok, "/uploads/..." = yüklenen


IS_WIN = sys.platform.startswith("win")


def public_conf():
    """Tarayıcıya gönderilen ayarlar: paylaşım şifresi hiçbir zaman gönderilmez."""
    c = conf()
    c["has_pass"] = bool(c.pop("smb_pass"))
    c["windows"] = IS_WIN
    return c


def save_conf(b):
    c = conf()
    mode = b.get("mode", c["mode"])
    if mode not in ("off", "browser", "share", "net"):
        raise ValueError("Geçersiz bağlantı türü")
    share = (b.get("share", c["share"]) or "").strip()
    host = (b.get("host", c["host"]) or "").strip().lstrip("\\/").rstrip("\\/")
    if host.lower() in ("localhost", "127.0.0.1", "."):
        host = ""
    ip = (b.get("ip", c["ip"]) or "").strip()
    port = int(b.get("port", c["port"]) or 9100)
    if mode == "share" and not SHARE_RX.match(share):
        raise ValueError("Paylaşım adını yazın (yalnızca harf, rakam, boşluk, nokta, tire)")
    if mode == "share" and host and not re.fullmatch(r"[A-Za-z0-9._\-]{1,63}", host):
        raise ValueError("Bilgisayar adı ya da IP adresi geçersiz (ör. DIGERPC ya da 192.168.1.20)")
    if mode == "net":
        if not re.fullmatch(r"[A-Za-z0-9.\-]{1,100}", ip):
            raise ValueError("Yazıcının IP adresini yazın (ör. 192.168.1.50)")
        if not 1 <= port <= 65535:
            raise ValueError("Port 1–65535 arasında olmalı")
    if mode == "share" and not IS_WIN and not host:
        raise ValueError("Yazıcının takılı olduğu bilgisayarın adını ya da IP adresini yazın")
    user = (b.get("smb_user", c["smb_user"]) or "").strip()
    if user and not re.fullmatch(r"[\w.\-@\\ ]{1,80}", user, re.UNICODE):
        raise ValueError("Kullanıcı adı geçersiz")
    pw = c["smb_pass"]
    if "smb_pass" in b and b["smb_pass"] is not None:   # boş gönderilirse eski şifre kalır; "clear_pass" ile silinir
        if b["smb_pass"]:
            pw = str(b["smb_pass"])[:120]
    if b.get("clear_pass") or not user:
        pw = ""
    logo = b.get("logo", c["logo"]) or ""
    if logo not in ("", "none") and not re.fullmatch(r"/uploads/[A-Za-z0-9_.-]{1,80}", logo):
        raise ValueError("Logo geçersiz")
    c.update(mode=mode, share=share, host=host, ip=ip, port=port, auto=bool(b.get("auto", c["auto"])), smb_user=user, smb_pass=pw, logo=logo)
    _set("label_printer", json.dumps(c))
    return public_conf()


def send(data):
    """Ham ZPL'yi yazıcıya gönderir. Hata metni ya da None döner."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    c = conf()
    dev = os.environ.get("ATOLYE_LABEL_DIR")   # geliştirme / test: yazıcı yerine klasöre yaz
    with _print_lock:
        if dev:
            os.makedirs(dev, exist_ok=True)
            n = len(os.listdir(dev)) + 1
            with open(os.path.join(dev, f"etiket-{n:04d}.zpl"), "wb") as f:
                f.write(data)
            return None
        if c["mode"] in ("off", "browser"):
            return "Etiket yazıcısı ayarlanmamış (Ayarlar → Etiket yazıcısı)"
        if c["mode"] == "net":
            try:
                with socket.create_connection((c["ip"], c["port"]), timeout=6) as s:
                    s.sendall(data)
                return None
            except OSError as e:
                return f"Yazıcıya bağlanılamadı ({c['ip']}:{c['port']}): {e}"
        if not IS_WIN:
            return _send_smb(c, data)
        host = c["host"] or "localhost"
        if c["host"]:
            # bilgisayar kapalı / ağda değilse Windows'un uzun SMB beklemesine girmeden hemen söyle
            try:
                socket.create_connection((c["host"], 445), timeout=4).close()
            except OSError:
                return (f"{c['host']} bilgisayarına ulaşılamıyor. Açık mı, aynı ağda mı? Adla olmuyorsa IP adresini yazın; "
                        "o bilgisayarda Dosya ve yazıcı paylaşımı açık olmalı.")
        target = f"\\\\{host}\\{c['share']}"
        try:
            with open(target, "wb") as f:
                f.write(data)
            return None
        except OSError:
            pass
        # bazı sürücülerde doğrudan yazma reddedilir: copy /b ile dene
        tmp = os.path.join(DATA_DIR, "etiket", "_gonder.zpl")
        os.makedirs(os.path.dirname(tmp), exist_ok=True)
        with open(tmp, "wb") as f:
            f.write(data)
        try:
            r = subprocess.run(["cmd", "/c", "copy", "/b", tmp, target], capture_output=True, timeout=20)
            if r.returncode == 0:
                return None
            msg = (r.stdout or b"").decode("cp857", "ignore").strip() or (r.stderr or b"").decode("cp857", "ignore").strip()
        except (OSError, subprocess.SubprocessError) as e:
            msg = str(e)
        where = f"{c['host']} bilgisayarındaki " if c["host"] else ""
        hint = (" Diğer bilgisayar açık mı, bu bilgisayardan Dosya Gezgini'nde \\\\" + c["host"] +
                " açılabiliyor mu? Şifre isterse Kimlik Bilgileri Yöneticisi'ne o bilgisayarın kullanıcı adı ve şifresini ekleyin.") if c["host"] else ""
        return f"{where}“{c['share']}” paylaşımına yazdırılamadı. Yazıcı paylaşıma açık mı, adı doğru mu?{hint} ({msg[:120]})"


def _send_smb(c, data):
    """Linux (Raspberry Pi / Home Assistant): Windows'ta paylaşılan yazıcıya smbclient ile ham gönderim."""
    host = c["host"]
    if not host:
        return "Yazıcının takılı olduğu bilgisayarın adını ya da IP adresini yazın (Ayarlar → Kargo etiketi yazıcısı)"
    try:
        socket.create_connection((host, 445), timeout=4).close()
    except OSError:
        return (f"{host} bilgisayarına ulaşılamıyor. Açık mı, aynı ağda mı? Adla olmuyorsa IP adresini yazın; "
                "o bilgisayarda Dosya ve yazıcı paylaşımı açık olmalı.")
    tmp = os.path.join(DATA_DIR, "etiket", "_gonder.zpl")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    with open(tmp, "wb") as f:
        f.write(data)
    cmd = ["smbclient", f"//{host}/{c['share']}", "-c", f'print "{tmp}"']
    env = dict(os.environ)
    if c["smb_user"]:
        cmd += ["-U", c["smb_user"]]
        env["PASSWD"] = c["smb_pass"]   # şifre komut satırında görünmesin
    else:
        cmd += ["-N"]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=25, env=env)
    except FileNotFoundError:
        return "smbclient kurulu değil (Home Assistant eklentisinde kendiliğinden gelir)"
    except (OSError, subprocess.SubprocessError) as e:
        return f"Yazıcıya gönderilemedi: {e}"
    if r.returncode == 0:
        return None
    msg = ((r.stdout or b"") + (r.stderr or b"")).decode("utf-8", "ignore").strip().splitlines()
    last = next((l for l in reversed(msg) if l.strip()), "")
    hint = ""
    if "LOGON_FAILURE" in last or "ACCESS_DENIED" in last:
        hint = " Paylaşım şifre istiyor olabilir: o bilgisayarın kullanıcı adı ve şifresini yazın."
    elif "BAD_NETWORK_NAME" in last:
        hint = " Paylaşım adı yanlış olabilir (yazıcının Paylaşım sekmesindeki ad)."
    return f"{host} bilgisayarındaki “{c['share']}” paylaşımına yazdırılamadı.{hint} ({last[:140]})"


def _cache_path(cargo_no):
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", str(cargo_no))[:60]
    return os.path.join(DATA_DIR, "etiket", f"{safe}.zpl")


def label_for(package_id, refetch=False):
    """Paketin ZPL etiketi (önbellekten ya da Trendyol'dan) ve kargo bilgisi."""
    info = trendyol.package_cargo(package_id)
    if not trendyol.label_supported(info["cargo_provider"]):
        raise trendyol.TrendyolError(f"{info['cargo_provider'] or 'Bu kargo firması'} için Trendyol etiket vermiyor "
                                     "(yalnızca Trendyol Express ve Aras)")
    p = _cache_path(info["cargo_no"])
    if not refetch and os.path.isfile(p):
        with open(p, "rb") as f:
            return f.read(), info
    try:
        parts = trendyol.common_label(info["cargo_no"])
    except trendyol.TrendyolError as e:
        if "COMMON_LABEL_NOT_ALLOWED" in str(e):
            raise trendyol.TrendyolError("Trendyol bu hesapta hazır etiket servisine izin vermiyor. Ayarlar → Kargo etiketi yazıcısı'nda "
                                         "\"Bu bilgisayardan (yazdır penceresi)\" seçeneğini kullanın; etiket Astera'da hazırlanır.")
        raise
    data = "\n".join(parts).encode("utf-8")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data)
    return data, info


def print_packages(package_ids, refetch=False):
    """Her paket için etiketi alıp basar. {printed: [...], errors: [{package_id, order_number, error}]}"""
    printed, errors = [], []
    ids = [str(x) for x in package_ids]
    for i, pid in enumerate(ids):
        try:
            data, info = label_for(pid, refetch)
        except trendyol.TrendyolError as e:
            errors.append({"package_id": pid, "error": str(e)})
            continue
        err = send(data)
        if err:
            errors.append({"package_id": pid, "order_number": info["order_number"], "error": err})
            if "ayarlanmamış" in err or "paylaşımına" in err or "bağlanılamadı" in err:
                # yazıcı sorunu: kalan paketleri denemenin anlamı yok
                errors += [{"package_id": x, "error": "yazıcı sorunu nedeniyle basılmadı"} for x in ids[i + 1:]]
                break
            continue
        trendyol.mark_label(pid)
        printed.append(pid)
    return {"printed": printed, "errors": errors}


# ---------------------------------------------------------------- raf etiketi (QR)
def _zpl_txt(s):
    """ZPL alanı: ^ ve ~ komut karakteridir, çıkar."""
    return str(s or "").replace("^", " ").replace("~", " ").strip()


def shelf_zpl(items, dpi=203, w_mm=100, h_mm=80, cols=5):
    """Raf etiketi: 100×80 mm etikete yan yana 5 tane 20×80 mm dikey şerit. items: [{name, code, shelf, url}].
    Her şeridin üstünde QR (yazıcı kendisi üretir), altında boyuna yazılmış ürün adı, kod ve raf yeri."""
    k = dpi / 25.4
    W, H = int(w_mm * k), int(h_mm * k)
    cw = W // cols
    out = []
    for i in range(0, len(items), cols):
        page = [f"^XA^CI28^PW{W}^LL{H}^LH0,0"]
        for j, it in enumerate(items[i:i + cols]):
            x0 = j * cw
            url = _zpl_txt(it.get("url"))
            n = len(url.encode())
            mods = 21 if n <= 14 else 25 if n <= 26 else 29 if n <= 42 else 33 if n <= 62 else 37 if n <= 84 else 41
            mag = max(2, min(10, int((cw - 16) / (mods + 2))))
            qx = x0 + max(4, (cw - mag * mods) // 2) - mag * 2
            page.append(f"^FO{qx},{int(3 * k)}^BQN,2,{mag}^FDMA,{url}^FS")
            ty = int(3 * k) + mag * (mods + 4) + int(2 * k)
            name = _zpl_txt(it.get("name"))[:30]
            fh = int(min(cw * 0.32, 5.4 * k))
            page.append(f"^FO{x0 + int(cw * 0.48)},{ty}^A0R,{fh},{int(fh * 0.86)}^FB{H - ty - int(3 * k)},1,0,L^FD{name}^FS")
            sub = "  ".join(x for x in (_zpl_txt(it.get("code")), _zpl_txt(it.get("shelf"))) if x)
            sh = int(fh * 0.62)
            page.append(f"^FO{x0 + int(cw * 0.16)},{ty}^A0R,{sh},{int(sh * 0.9)}^FD{sub}^FS")
            if j < cols - 1:
                page.append(f"^FO{x0 + cw - 1},{int(2 * k)}^GB1,{H - int(4 * k)},1^FS")
        page.append("^XZ")
        out.append("".join(page))
    return "\n".join(out)
