"""
Bambu Lab yazıcılarını yerel ağdan izler (LAN MQTT, port 8883, kullanıcı "bblp", şifre = erişim kodu).

Bulut bağlantısı ve Bambu Handy açık kalabilir; yalnızca durum okunur, yazıcıya komut gönderilmez
(tek istisna: bağlanınca tam durum isteyen standart "pushall" isteği).

Ne yapar:
- Yazıcıda baskı başlayınca dosya adından ürünü bulur ve Astera'da baskıyı kendisi açar (eşleşmezse uyarı bırakır).
- Baskı sürerken bitiş saatini, yüzdeyi ve katmanı yazıcıdan günceller.
- Baskı bitince ya da yazıcı hata bildirince Astera'daki baskının süresini hemen doldurur; sonuç penceresi açılır.

Sadece Python standart kütüphanesi kullanılır; MQTT 3.1.1 istemcisi burada yazılıdır.
"""
import json
import re
import socket
import ssl
import struct
import threading
import time
import unicodedata

_db = _lock = _get = _set = _now = None
_threads = {}          # yazıcı adı -> Worker
_status = {}           # yazıcı adı -> durum sözlüğü (istemciye gider)
_events = []           # eşleşmeyen başlangıçlar: istemcide uyarı olarak gösterilir
after_create = None    # sunucu verir: otomatik açılan baskıya makara atar
_ev_lock = threading.Lock()

ACTIVE = {"RUNNING", "PREPARE", "PAUSE", "SLICING"}
# Baskı gönderildikten sonraki hazırlık: dosya yazıcıya iniyor, ısınma / kalibrasyon. Bambu bu sırada görev numarasını
# değiştirebiliyor; bu aşamada baskı açılmaz, ürün sorulmaz. Gerçek baskı (RUNNING) başlayınca açılır.
PRE = {"PREPARE", "SLICING"}


def _pre_only(j):
    """Kayıt yalnızca hazırlık aşamasını görmüş, hiç basmamış mı?"""
    return (j["bambu_state"] or "PREPARE") in PRE and not (j["bambu_percent"] or 0)
DONE = {"FINISH"}
FAILED = {"FAILED"}


def init(db, lock, get_setting, set_setting, now):
    global _db, _lock, _get, _set, _now
    _db, _lock, _get, _set, _now = db, lock, get_setting, set_setting, now


# ---------------------------------------------------------------- dosya adı eşleştirme

_TR = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")


def norm(name):
    s = (name or "").strip().split("/")[-1].split("\\")[-1].translate(_TR)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    for _ in range(3):
        s = re.sub(r"\.(gcode|3mf|stl|step|obj|chitubox|ctb)$", "", s)
    s = re.sub(r"[_\-\s]*plate[_\-\s]*\d+$", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def _mapping():
    try:
        return json.loads(_get("bambu_map", "{}") or "{}")
    except Exception:
        return {}


def remember(file_name, product_id=None, component_id=None):
    """Kullanıcı bir dosyayı ürüne / ortak parçaya bağladığında öğren; sonraki baskılarda kendiliğinden tanınır.
    Eşleme değeri ürün için sayı, ortak parça için "c:<id>"."""
    n = norm(file_name)
    if not n or not (product_id or component_id):
        return
    m = _mapping()
    m[n] = f"c:{int(component_id)}" if component_id else int(product_id)
    _set("bambu_map", json.dumps(m))


def match_component(file_name):
    n = norm(file_name)
    if not n:
        return None
    v = _mapping().get(n)
    if isinstance(v, str) and v.startswith("c:"):
        row = _db().execute("SELECT id FROM components WHERE id=? AND archived=0", (int(v[2:]),)).fetchone()
        return row["id"] if row else None
    if v is not None:
        return None   # bu dosya bir ürüne öğretilmiş
    for c in _db().execute("SELECT id, name, file_name FROM components WHERE archived=0").fetchall():
        if (c["file_name"] and norm(c["file_name"]) == n) or norm(c["name"]) == n:
            return c["id"]
    return None


def match_product(file_name):
    n = norm(file_name)
    if not n:
        return None
    m = _mapping()
    if n in m:
        if isinstance(m[n], str):
            return None   # ortak parçaya öğretilmiş
        row = _db().execute("SELECT id FROM products WHERE id=? AND archived=0", (m[n],)).fetchone()
        if row:
            return row["id"]
    prods = _db().execute("SELECT id, name, file_name FROM products WHERE archived=0").fetchall()
    for key in ("file_name", "name"):
        for p in prods:
            if p[key] and norm(p[key]) == n:
                return p["id"]
    best = None
    for p in prods:
        fn = norm(p["file_name"] or "")
        if len(fn) >= 4 and (fn in n or n in fn):
            if not best or len(fn) > best[1]:
                best = (p["id"], len(fn))
    return best[0] if best else None


# ---------------------------------------------------------------- minimal MQTT 3.1.1

def _rl(n):
    out = bytearray()
    while True:
        b = n % 128
        n //= 128
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def _s(x):
    b = x.encode()
    return struct.pack("!H", len(b)) + b


class MQTTError(Exception):
    pass


class Worker(threading.Thread):
    def __init__(self, cfg):
        super().__init__(daemon=True, name=f"bambu-{cfg['name']}")
        self.cfg = cfg
        self.stop = threading.Event()
        self.state = {}
        self.sock = None

    # --- ağ
    def _read_exact(self, n):
        buf = b""
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise MQTTError("bağlantı kapandı")
            buf += chunk
        return buf

    def _read_packet(self):
        first = self._read_exact(1)[0]
        mult, length = 1, 0
        while True:
            b = self._read_exact(1)[0]
            length += (b & 0x7F) * mult
            if not b & 0x80:
                break
            mult *= 128
        return first, self._read_exact(length) if length else b""

    def _send(self, data):
        self.sock.sendall(data)

    def _connect(self):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE   # yazıcı kendi imzalı sertifika kullanır; bağlantı yalnızca yerel ağda
        raw = socket.create_connection((self.cfg["ip"], 8883), timeout=10)
        self.sock = ctx.wrap_socket(raw, server_hostname=self.cfg["ip"])
        body = _s("MQTT") + bytes([4, 0xC2]) + struct.pack("!H", 60)
        body += _s(f"atolye-{int(time.time())}") + _s("bblp") + _s(self.cfg["code"])
        self._send(b"\x10" + _rl(len(body)) + body)
        t, b = self._read_packet()
        if t >> 4 != 2:
            raise MQTTError("beklenmeyen yanıt")
        if len(b) >= 2 and b[1] != 0:
            raise MQTTError("erişim kodu kabul edilmedi" if b[1] in (4, 5) else f"bağlantı reddedildi ({b[1]})")
        topic = f"device/{self.cfg['serial']}/report"
        sub = struct.pack("!H", 1) + _s(topic) + b"\x00"
        self._send(b"\x82" + _rl(len(sub)) + sub)
        self._pushall()

    def _pushall(self):
        topic = _s(f"device/{self.cfg['serial']}/request")
        payload = json.dumps({"pushing": {"sequence_id": "0", "command": "pushall"}}).encode()
        self._send(b"\x30" + _rl(len(topic) + len(payload)) + topic + payload)

    def run(self):
        backoff = 5
        while not self.stop.is_set():
            try:
                self._set_status(online=False, error=None, connecting=True)
                self._connect()
                self._set_status(online=True, connecting=False, error=None)
                backoff = 5
                self.sock.settimeout(1.0)
                last_ping = last_push = time.time()
                while not self.stop.is_set():
                    now = time.time()
                    if now - last_ping > 30:
                        self._send(b"\xC0\x00")
                        last_ping = now
                    if now - last_push > 600:    # P1/A1 değişiklikleri parça parça yollar; arada bir tam durum iste
                        self._pushall()
                        last_push = now
                    try:
                        t, body = self._read_packet()
                    except socket.timeout:
                        continue
                    if t >> 4 == 3:
                        qos = (t >> 1) & 3
                        tl = struct.unpack("!H", body[:2])[0]
                        off = 2 + tl + (2 if qos else 0)
                        try:
                            self._on_report(json.loads(body[off:].decode("utf-8", "ignore")))
                        except ValueError:
                            pass
            except Exception as e:  # noqa
                msg = str(e) or e.__class__.__name__
                if isinstance(e, (socket.timeout, ConnectionRefusedError, OSError)) and not isinstance(e, MQTTError):
                    msg = "yazıcıya ulaşılamıyor (IP doğru mu, yazıcı açık mı?)"
                self._set_status(online=False, connecting=False, error=msg)
            finally:
                try:
                    self.sock and self.sock.close()
                except Exception:
                    pass
            self.stop.wait(backoff)
            backoff = min(60, backoff * 2)

    # --- durum
    def _set_status(self, **kw):
        st = _status.setdefault(self.cfg["name"], {"name": self.cfg["name"]})
        st.update(kw)
        st["updated_at"] = int(time.time())

    def _on_report(self, msg):
        p = msg.get("print")
        if not isinstance(p, dict):
            return
        prev_state = self.state.get("gcode_state")
        prev_task = self.state.get("task_key")
        new_id = (p.get("task_id"), p.get("subtask_id"), p.get("subtask_name"))
        if any(new_id) and new_id != (self.state.get("task_id"), self.state.get("subtask_id"), self.state.get("subtask_name")):
            # Yeni baskı: önceki işin katman/yüzde bilgisi taşınmasın
            for k in ("layer_num", "total_layer_num", "mc_percent", "mc_remaining_time", "print_error"):
                self.state.pop(k, None)
        self.state.update({k: v for k, v in p.items() if not isinstance(v, (dict, list))})
        s = self.state
        task_key = f"{s.get('task_id') or ''}:{s.get('subtask_id') or ''}:{s.get('subtask_name') or ''}"
        s["task_key"] = task_key
        gstate = (s.get("gcode_state") or "").upper()
        self._set_status(
            state=gstate, file=s.get("subtask_name") or s.get("gcode_file") or "",
            percent=s.get("mc_percent"), remaining_min=s.get("mc_remaining_time"),
            layer=s.get("layer_num"), total_layers=s.get("total_layer_num"),
            error_code=s.get("print_error") or 0,
        )
        try:
            with _lock:
                handle(self.cfg["name"], gstate, prev_state, task_key, prev_task, s)
                _db().commit()
        except Exception as e:  # noqa
            print("Bambu olay hatası:", e)
        if gstate == "RUNNING" and task_key and self.state.get("obj_task") != task_key and (s.get("subtask_name") or s.get("gcode_file")):
            self.state["obj_task"] = task_key
            threading.Thread(target=self._fetch_objects, args=(task_key, s.get("subtask_name") or "", s.get("gcode_file") or ""),
                             daemon=True, name=f"bambu-ftp-{self.cfg['name']}").start()

    def _fetch_objects(self, task_key, subtask, gcode_file):
        """Yazıcının dosya sunucusundan (FTPS) baskı dosyasını indirip tabladaki nesne sayısını okur."""
        try:
            n, w = bambu_plate_objects(self.cfg, subtask, gcode_file)
        except Exception as e:  # noqa
            print(f"Bambu dosyası okunamadı ({self.cfg['name']}):", e)
            n, w = None, None
        if n:
            apply_objects(self.cfg["name"], task_key, n)
        if w:
            apply_grams(self.cfg["name"], task_key, w)


# ---------------------------------------------------------------- olaylar → Astera baskıları

def _job_for(printer, task_key):
    return _db().execute("""SELECT * FROM print_jobs WHERE status='printing' AND printer=?
                            AND (bambu_task=? OR bambu_task IS NULL) ORDER BY bambu_task IS NULL, id DESC LIMIT 1""",
                         (printer, task_key)).fetchone()


_ignored = set()   # kullanıcının "yoksay" dediği yazıcı görevleri: tekrar sorulmaz, baskı açılmaz


def ignore_task(printer, task_key):
    _ignored.add((printer, task_key))
    with _ev_lock:
        _events[:] = [e for e in _events if not (e["printer"] == printer and e["task"] == task_key)]


def handle(printer, gstate, prev_state, task_key, prev_task, s):
    now = _now()
    remaining = int(s.get("mc_remaining_time") or 0)
    percent = int(s.get("mc_percent") or 0)
    file_name = s.get("subtask_name") or s.get("gcode_file") or ""
    linked = _db().execute("SELECT * FROM print_jobs WHERE status='printing' AND bambu_task=? AND printer=?",
                           (task_key, printer)).fetchone()

    if gstate in PRE and not linked:
        return      # dosya iniyor / hazırlanıyor: henüz baskı yok
    if gstate in ACTIVE:
        # Yazıcı aynı anda tek iş basar: bu yazıcıda başka göreve bağlı açık baskı varsa o bitmiştir, sonucunu sor.
        # Sadece hazırlık aşamasını görmüş (hiç basmamış) kayıt bitmiş sayılmaz: aynı baskıdır, yeni göreve taşınır.
        for old in _db().execute("""SELECT id, ends_at, bambu_state, bambu_percent FROM print_jobs WHERE status='printing' AND printer=?
                                    AND bambu_task IS NOT NULL AND bambu_task<>?""", (printer, task_key)).fetchall():
            if _pre_only(old) and not linked:
                _db().execute("UPDATE print_jobs SET bambu_task=? WHERE id=?", (task_key, old["id"]))
                linked = _db().execute("SELECT * FROM print_jobs WHERE id=?", (old["id"],)).fetchone()
                continue
            _db().execute("UPDATE print_jobs SET ends_at=?, bambu_state='FINISH' WHERE id=?", (min(now, old["ends_at"]), old["id"]))
        with _ev_lock:   # yeni bir baskı başladı: önceki görevin bekleyen uyarısı (bitmiş olanlar hariç) kalkar
            _events[:] = [e for e in _events if not (e["printer"] == printer and e["task"] != task_key and not e.get("done"))]
        if not linked:
            # Astera'da bu yazıcıda elle açılmış, henüz bağlanmamış bir baskı varsa ona bağla
            j = _db().execute("""SELECT * FROM print_jobs WHERE status='printing' AND printer=? AND bambu_task IS NULL
                                 ORDER BY id DESC LIMIT 1""", (printer,)).fetchone()
            if j:
                _db().execute("UPDATE print_jobs SET bambu_task=? WHERE id=?", (task_key, j["id"]))
                linked = j
            elif (printer, task_key) in _ignored:
                return
            else:
                linked = _auto_create(printer, task_key, file_name, remaining, percent, s.get("objects"))
                if linked and after_create:
                    try:
                        after_create(linked["id"])
                    except Exception as e:  # noqa
                        print("Makara atama hatası:", e)
        if linked:
            sets = ["bambu_state=?", "bambu_percent=?", "bambu_layer=?"]
            args = [gstate, percent, f"{s.get('layer_num') or 0}/{s.get('total_layer_num') or 0}"]
            try:
                old_end = linked["ends_at"] or 0
            except (KeyError, IndexError, TypeError):
                old_end = 0
            if gstate != "PAUSE" and remaining > 0:
                # Yazıcı kalan süreyi dakika olarak verir; her raporda yeniden yazınca geri sayım
                # ileri-geri zıplıyordu. Sadece tahmin 2 dakikadan fazla saparsa düzelt.
                new_end = now + remaining * 60
                if abs(new_end - old_end) > 120:
                    sets.append("ends_at=?")
                    args.append(new_end)
            elif old_end <= now + 30:
                # Yazıcı hâlâ basıyor (kalan 0 dk, hız artırılmış, son katmanlar / soğuma): bitti sayma, biraz ileri al.
                # Bitiş yazıcı FINISH dediğinde kesinleşir; böylece "baskı bitti" bildirimi gidip gelmez.
                sets.append("ends_at=?")
                args.append(now + 120)
            _db().execute(f"UPDATE print_jobs SET {', '.join(sets)} WHERE id=?", args + [linked["id"]])
        return

    if gstate == "IDLE" and prev_state in PRE:
        # hazırlıktan doğrudan boşa döndü (gönderim iptal / indirme başarısız): baskı sayılmaz
        j = linked or _db().execute("SELECT * FROM print_jobs WHERE status='printing' AND bambu_task=?", (task_key,)).fetchone()
        if not j or _pre_only(j):
            if j:
                _db().execute("UPDATE print_jobs SET bambu_task=NULL, bambu_state=NULL WHERE id=?", (j["id"],))
            with _ev_lock:
                _events[:] = [e for e in _events if not (e["printer"] == printer and e["task"] == task_key)]
            return
    if gstate in DONE | FAILED or (gstate == "IDLE" and prev_state in ACTIVE):
        j = linked or _db().execute("SELECT * FROM print_jobs WHERE status='printing' AND bambu_task=?", (task_key,)).fetchone()
        st = "FAILED" if gstate in FAILED or (gstate == "IDLE" and prev_state in ACTIVE) else "FINISH"
        if j:
            _db().execute("UPDATE print_jobs SET ends_at=?, bambu_state=?, bambu_percent=? WHERE id=?",
                          (min(now, j["ends_at"]) if j["ends_at"] > now else j["ends_at"], st, percent, j["id"]))
        with _ev_lock:
            # onaylanmamış baskı bittiyse uyarı kalır ("bitti — ne basıldı?"); onaylanınca sonucu hemen sorulur
            for e in _events:
                if e["printer"] == printer and e["task"] == task_key and not e.get("done"):
                    e["done"], e["done_at"], e["percent"], e["remaining_min"] = st, now, percent, 0
            _events[:] = [e for e in _events if not e.get("done") or now - e.get("done_at", now) < 24 * 3600]


def _qty_from_objects(objects, p, fallback):
    """Tabladaki nesne sayısından baskı adedi: set olarak satılan üründe nesne / set boyu."""
    if not objects:
        return fallback
    ss = max(1, int((p["set_size"] if p is not None and "set_size" in p.keys() else 1) or 1))
    return max(1, objects // ss) if ss > 1 and objects % ss == 0 else max(1, objects)


def _auto_create(printer, task_key, file_name, remaining, percent, objects=None):
    now = _now()
    elapsed = int(remaining * 60 * percent / max(1, 100 - percent)) if 0 < percent < 100 else 0
    cid = match_component(file_name)
    if cid and _get("print_confirm", "1") == "1":   # tanınan dosya: önce kullanıcıya sor
        c = _db().execute("SELECT name, kind FROM components WHERE id=?", (cid,)).fetchone()
        _add_event(printer, task_key, file_name, remaining, percent, None, "confirm", objects, component_id=cid,
                   guess=c["name"] if c else None)
        return None
    if cid:   # ortak parça (ör. base plate) tek başına basılıyor: havuza gidecek
        c = _db().execute("SELECT * FROM components WHERE id=?", (cid,)).fetchone()
        last = _db().execute("SELECT quantity FROM print_jobs WHERE component_id=? ORDER BY id DESC LIMIT 1", (cid,)).fetchone()
        cur = _db().execute(
            """INSERT INTO print_jobs(component_id,print_type,quantity,printer,note,started_at,ends_at,status,bambu_task,bambu_state,bambu_percent)
               VALUES(?,?,?,?,?,?,?,'printing',?,?,?)""",
            (cid, c["print_type"], objects or (last["quantity"] if last else 1), printer, f"Bambu: {file_name}", now - elapsed,
             now + max(1, remaining) * 60, task_key, "RUNNING", percent))
        return _db().execute("SELECT * FROM print_jobs WHERE id=?", (cur.lastrowid,)).fetchone()
    pid = match_product(file_name)
    p = _db().execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone() if pid else None
    multi = bool(p) and _db().execute("SELECT COUNT(*) FROM product_parts WHERE product_id=?", (pid,)).fetchone()[0] > 0
    if not p or multi:
        _add_event(printer, task_key, file_name, remaining, percent, pid, "parts" if multi else "unknown", objects)
        return None
    if _get("print_confirm", "1") == "1":
        last = _db().execute("SELECT quantity FROM print_jobs WHERE product_id=? ORDER BY id DESC LIMIT 1", (pid,)).fetchone()
        guess = p["name"] + (f" — {p['variant_label']}" if p["variant_label"] else "")
        _add_event(printer, task_key, file_name, remaining, percent, pid, "confirm", objects,
                   guess=guess, guess_qty=_qty_from_objects(objects, p, last["quantity"] if last else 1))
        return None
    last = _db().execute("SELECT quantity FROM print_jobs WHERE product_id=? ORDER BY id DESC LIMIT 1", (pid,)).fetchone()
    qty = _qty_from_objects(objects, p, last["quantity"] if last else 1)
    cur = _db().execute(
        """INSERT INTO print_jobs(product_id,print_type,quantity,printer,note,started_at,ends_at,status,bambu_task,bambu_state,bambu_percent)
           VALUES(?,?,?,?,?,?,?,'printing',?,?,?)""",
        (pid, p["print_type"], qty, printer, f"Bambu: {file_name}", now - elapsed, now + max(1, remaining) * 60,
         task_key, "RUNNING", percent))
    return _db().execute("SELECT * FROM print_jobs WHERE id=?", (cur.lastrowid,)).fetchone()


def _add_event(printer, task_key, file_name, remaining, percent, pid, reason, objects=None, component_id=None, guess=None, guess_qty=None):
    with _ev_lock:
        for e in _events:
            if e["printer"] == printer and e["task"] == task_key:
                e.update(remaining_min=remaining, percent=percent)
                if objects and not e.get("objects"):
                    e["objects"] = objects
                return
        _events.append({"id": f"{printer}|{task_key}", "printer": printer, "task": task_key, "file": file_name,
                        "remaining_min": remaining, "percent": percent, "product_id": pid, "component_id": component_id,
                        "reason": reason, "guess": guess, "guess_qty": guess_qty, "objects": objects, "at": _now()})


def link_event(event_id, job_id, file_name, product_id, component_id=None, remember_file=True):
    """Kullanıcı uyarıdan baskı başlattığında: işi yazıcı görevine bağla, dosyayı ürüne / ortak parçaya öğren."""
    with _ev_lock:
        ev = next((e for e in _events if e["id"] == event_id), None)
        if ev:
            _events.remove(ev)
    if ev:
        _db().execute("UPDATE print_jobs SET bambu_task=?, note=CASE WHEN COALESCE(note,'')='' THEN ? ELSE note END WHERE id=?",
                      (ev["task"], f"Bambu: {ev['file']} · onaylandı", job_id))
        # Onay geç verildiyse çizelgede baskı, bildirimin geldiği andan başlasın (onaylandığı andan değil)
        if ev.get("at"):
            _db().execute("UPDATE print_jobs SET started_at=MIN(started_at, ?) WHERE id=?", (int(ev["at"]), job_id))
        if ev.get("grams"):
            _db().execute("UPDATE print_jobs SET file_grams=? WHERE id=? AND file_grams IS NULL", (ev["grams"], job_id))
            fill_product_grams(job_id)
        if ev.get("done"):   # yazıcı çoktan bitirmiş: sonucu hemen sor
            _db().execute("UPDATE print_jobs SET ends_at=?, bambu_state=?, bambu_percent=? WHERE id=?",
                          (_now(), ev["done"], ev.get("percent"), job_id))
        else:
            _db().execute("UPDATE print_jobs SET bambu_state='RUNNING', bambu_percent=? WHERE id=?", (ev.get("percent"), job_id))
        changed = ev["reason"] == "confirm" and ((component_id or None) != (ev.get("component_id") or None) or
                                                 (not component_id and product_id != ev.get("product_id")))
        if remember_file and (ev["reason"] == "unknown" or changed) and (product_id or component_id):
            remember(ev["file"], product_id=None if component_id else product_id, component_id=component_id)


def dismiss_event(event_id):
    with _ev_lock:
        _events[:] = [e for e in _events if e["id"] != event_id]


def snapshot():
    with _ev_lock:
        ev = list(_events)
    return {"printers": list(_status.values()), "events": ev}


# ---------------------------------------------------------------- yönetim

def configs():
    try:
        items = json.loads(_get("printers", "[]") or "[]")
    except Exception:
        items = []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        if it.get("bambu_ip") and it.get("bambu_serial") and it.get("bambu_code"):
            out.append({"name": it["name"], "kind": "bambu", "ip": it["bambu_ip"].strip(), "serial": it["bambu_serial"].strip().upper(),
                        "code": it["bambu_code"].strip()})
        elif it.get("mr_url"):
            out.append({"name": it["name"], "kind": "moonraker", "url": _mr_base(it["mr_url"]), "key": (it.get("mr_key") or "").strip()})
        elif it.get("sdcp_ip"):
            out.append({"name": it["name"], "kind": "elegoo", "ip": it["sdcp_ip"].strip()})
    return out


def reload():
    """Ayarlar değişince bağlantıları yeniden kur."""
    want = {c["name"]: c for c in configs()}
    for name, w in list(_threads.items()):
        if name not in want or want[name] != w.cfg:
            w.stop.set()
            try:
                w.sock and w.sock.close()
            except Exception:
                pass
            _threads.pop(name, None)
            _status.pop(name, None)
    for name, cfg in want.items():
        if name not in _threads:
            w = {"moonraker": MoonrakerWorker, "elegoo": ElegooWorker}.get(cfg.get("kind"), Worker)(cfg)
            _threads[name] = w
            w.start()


def start():
    reload()


# ================================================================ Moonraker (Klipper)
# Yerel ağdaki Moonraker HTTP arayüzü birkaç saniyede bir okunur; durum Bambu ile aynı akışa (handle) verilir.
import urllib.parse as _up
import urllib.request as _ur
import urllib.error as _ue

MR_STATE = {"printing": "RUNNING", "paused": "PAUSE", "complete": "FINISH", "error": "FAILED", "cancelled": "FAILED", "standby": "IDLE"}


def _mr_base(u):
    u = (u or "").strip().rstrip("/")
    if not re.match(r"^https?://", u):
        u = "http://" + u
    if not re.search(r":\d+$", _up.urlparse(u).netloc):
        u += ":7125"
    return u


class _LinkBase(threading.Thread):
    def __init__(self, cfg):
        super().__init__(daemon=True, name=f"{cfg.get('kind')}-{cfg['name']}")
        self.cfg = cfg
        self.stop = threading.Event()
        self.state = {}
        self.sock = None
        self.prev_state = None
        self.prev_task = None

    def _set_status(self, **kw):
        st = _status.setdefault(self.cfg["name"], {"name": self.cfg["name"]})
        st.update(kw)
        st["updated_at"] = int(time.time())

    def _feed(self, gstate, task_key, file_name, remaining_min, percent, layer=None, total_layers=None, error_code=0, objects=None):
        """Ortak durum akışı: istemci durumunu güncelle ve Astera baskılarını yönet (Bambu'daki handle)."""
        self._set_status(online=True, connecting=False, error=None, state=gstate, file=file_name, percent=percent,
                         remaining_min=remaining_min, layer=layer, total_layers=total_layers, error_code=error_code)
        s = {"mc_remaining_time": remaining_min, "mc_percent": percent, "subtask_name": file_name,
             "layer_num": layer, "total_layer_num": total_layers, "objects": objects}
        try:
            with _lock:
                handle(self.cfg["name"], gstate, self.prev_state, task_key, self.prev_task, s)
                _db().commit()
        except Exception as e:  # noqa
            print(f"{self.cfg.get('kind')} olay hatası:", e)
        self.prev_state, self.prev_task = gstate, task_key


class MoonrakerWorker(_LinkBase):
    def _get(self, path):
        req = _ur.Request(self.cfg["url"] + path, headers={"Accept": "application/json", **({"X-Api-Key": self.cfg["key"]} if self.cfg.get("key") else {})})
        with _ur.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode("utf-8", "ignore"))

    def _meta(self, filename):
        """Dosya üst verisi: tahmini süre (sn) ve dilimleyicinin hesapladığı filament ağırlığı (g)."""
        cache = self.state.setdefault("meta", {})
        if filename not in cache:
            try:
                m = self._get("/server/files/metadata?filename=" + _up.quote(filename)).get("result") or {}
                cache[filename] = {"est": float(m.get("estimated_time") or 0), "g": float(m.get("filament_weight_total") or 0)}
            except Exception:
                cache[filename] = {"est": 0.0, "g": 0.0}
        return cache[filename]

    def _estimate(self, filename):
        return self._meta(filename)["est"]

    def _last_job(self):
        """Moonraker iş geçmişindeki son iş (job_id, status, filename). Geçmiş kapalıysa None."""
        if self.state.get("no_history"):
            return None
        try:
            jobs = (self._get("/server/history/list?limit=1&order=desc").get("result") or {}).get("jobs") or []
            return jobs[0] if jobs else None
        except _ue.HTTPError as e:
            if e.code in (404, 400):
                self.state["no_history"] = True   # history bileşeni yok: eski yönteme dön
            return None
        except Exception:
            return None

    def _relink(self, old_prefix, new_key):
        """Eski biçimli görev anahtarıyla bağlı açık baskıyı yeni anahtara taşı (güncellemeden önce başlamış baskılar)."""
        try:
            with _lock:
                _db().execute("""UPDATE print_jobs SET bambu_task=? WHERE status='printing' AND printer=? AND bambu_task LIKE ?
                                 AND bambu_task<>?""", (new_key, self.cfg["name"], old_prefix + "%", new_key))
                _db().commit()
        except Exception as e:  # noqa
            print("Moonraker eşleştirme hatası:", e)

    def poll_once(self):
        st = self._get("/printer/objects/query?print_stats&virtual_sdcard&display_status&exclude_object").get("result", {}).get("status", {})
        ps, vs, ds = st.get("print_stats") or {}, st.get("virtual_sdcard") or {}, st.get("display_status") or {}
        raw_state = ps.get("state") or ""
        gstate = MR_STATE.get(raw_state, "IDLE")
        fn = ps.get("filename") or ""
        progress = float(ds.get("progress") or vs.get("progress") or 0)
        pdur, tdur = float(ps.get("print_duration") or 0), float(ps.get("total_duration") or 0)
        est = self._estimate(fn) if fn else 0
        if est > 0:
            rem = max(0.0, est - pdur)
        elif progress > 0.01:
            rem = max(0.0, pdur / progress - pdur)
        else:
            rem = 0.0
        if gstate in ("FINISH", "FAILED"):
            rem = 0.0
        info = ps.get("info") or {}
        job = self._last_job() if (gstate != "IDLE" or self.prev_state in ACTIVE) else None
        # görev anahtarı: Moonraker iş numarası (kalıcı); geçmiş yoksa dosya + başlangıç dakikası
        if fn and gstate != "IDLE":
            if job and job.get("job_id") and (job.get("filename") or "") == fn:
                task_key = f"mr:{job['job_id']}"
                self._relink(f"mr:{fn}:", task_key)
            else:
                start_min = int((time.time() - tdur) // 60)
                if self.state.get("task_fn") != fn or abs(self.state.get("task_start", 0) - start_min) > 2:
                    self.state["task_fn"], self.state["task_start"] = fn, start_min
                task_key = f"mr:{fn}:{self.state['task_start']}"
        else:
            task_key = self.prev_task or ""
        # Baskı biter bitmez END_PRINT içinde SDCARD_RESET_FILE vb. ile "standby"a dönen yazıcılar "complete"i hiç göstermez:
        # geçmişteki son iş tamamlandıysa ya da baskı neredeyse bitmişken boşa döndüyse bitmiş say (başarısız değil).
        if gstate == "IDLE" and self.prev_state in ACTIVE:
            done = False
            if job and str(task_key).startswith("mr:") and (task_key == f"mr:{job.get('job_id')}" or not job.get("job_id")):
                done = job.get("status") == "completed"
                if job.get("status") in ("cancelled", "error", "klippy_shutdown", "klippy_disconnect", "interrupted"):
                    gstate = "FAILED"
            elif self.state.get("last_progress", 0) >= 0.98:
                done = True
            if done:
                gstate = "FINISH"
        if gstate in ACTIVE:
            self.state["last_progress"] = progress
        objs = [o for o in ((st.get("exclude_object") or {}).get("objects") or [])]
        excluded = set((st.get("exclude_object") or {}).get("excluded_objects") or [])
        n_obj = len([o for o in objs if (o.get("name") if isinstance(o, dict) else o) not in excluded]) or None
        self._feed(gstate, task_key, fn, int(round(rem / 60)), int(round(progress * 100)),
                   info.get("current_layer"), info.get("total_layer"), 1 if gstate == "FAILED" and raw_state == "error" else 0, objects=n_obj)
        if gstate == "RUNNING" and fn and task_key and self.state.get("g_task") != task_key:
            g = self._meta(fn).get("g") or 0
            self.state["g_task"] = task_key
            if g > 0:
                apply_grams(self.cfg["name"], task_key, g)
        if gstate in ("FINISH", "FAILED"):
            self.state["last_progress"] = 0

    def run(self):
        self._set_status(online=False, connecting=True, error=None)
        fails = 0
        while not self.stop.is_set():
            try:
                self.poll_once()
                fails = 0
            except Exception as e:  # noqa
                fails += 1
                self._set_status(online=False, connecting=False, error="Moonraker'a ulaşılamıyor (adres ve port doğru mu?)" if isinstance(e, OSError) else str(e))
            self.stop.wait(5 if not fails else min(60, 5 * fails))


# ================================================================ Elegoo (SDCP) — deneme
# Elegoo'nun Wi-Fi'li reçine yazıcıları SDCP protokolünü kullanır. Keşif: UDP 3000'e "M99999".
# Yeni sürüm (V3) durum mesajlarını WebSocket (ws://IP:3030/websocket) üzerinden yollar.
import base64 as _b64
import os as _os
import uuid as _uuid


def sdcp_discover(ip, timeout=3.0):
    """UDP 3000'e M99999 gönderir; yazıcının kendini tanıttığı JSON'u döndürür."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(timeout)
    try:
        s.sendto(b"M99999", (ip, 3000))
        data, _ = s.recvfrom(65535)
        return json.loads(data.decode("utf-8", "ignore"))
    finally:
        s.close()


class _WS:
    """En küçük WebSocket istemcisi (metin çerçeveleri, maskeli gönderim, ping/pong)."""
    def __init__(self, host, port, path, timeout=10):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        key = _b64.b64encode(_os.urandom(16)).decode()
        req = (f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(req.encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.sock.recv(1024)
            if not chunk:
                raise OSError("WebSocket el sıkışması kapandı")
            head += chunk
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            raise OSError("WebSocket kabul edilmedi: " + head.split(b"\r\n", 1)[0].decode("latin-1"))
        self.buf = head.split(b"\r\n\r\n", 1)[1]

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise OSError("bağlantı kapandı")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, text, opcode=1):
        data = text.encode() if isinstance(text, str) else text
        mask = _os.urandom(4)
        n = len(data)
        head = bytes([0x80 | opcode])
        head += bytes([0x80 | n]) if n < 126 else (bytes([0x80 | 126]) + struct.pack("!H", n) if n < 65536 else bytes([0x80 | 127]) + struct.pack("!Q", n))
        self.sock.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self):
        while True:
            b0, b1 = self._read(2)
            op, n = b0 & 0x0F, b1 & 0x7F
            if n == 126:
                n = struct.unpack("!H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack("!Q", self._read(8))[0]
            mask = self._read(4) if b1 & 0x80 else None
            data = self._read(n)
            if mask:
                data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
            if op == 9:
                self.send(data, opcode=10)
                continue
            if op == 8:
                raise OSError("yazıcı bağlantıyı kapattı")
            if op in (1, 2):
                return data.decode("utf-8", "ignore")

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


def _sdcp_request(mainboard, cmd=0, data=None):
    return json.dumps({"Id": _uuid.uuid4().hex, "Data": {"Cmd": cmd, "Data": data or {}, "RequestID": _uuid.uuid4().hex,
                       "MainboardID": mainboard or "", "TimeStamp": int(time.time()), "From": 0},
                       "Topic": f"sdcp/request/{mainboard or ''}"})


def sdcp_test(ip):
    """Ayarlar'daki "Bağlantıyı test et": keşif yanıtını ve ilk durum mesajını ham olarak döndürür."""
    out = {"ip": ip}
    try:
        out["udp"] = sdcp_discover(ip)
    except Exception as e:  # noqa
        out["udp_error"] = f"{e.__class__.__name__}: {e}"
    mb = ((out.get("udp") or {}).get("Data") or {}).get("MainboardID") if isinstance(out.get("udp"), dict) else None
    try:
        ws = _WS(ip, 3030, "/websocket", timeout=4)
        try:
            ws.send(_sdcp_request(mb, 0))
            msgs = []
            ws.sock.settimeout(4)
            for _ in range(2):
                try:
                    msgs.append(json.loads(ws.recv()))
                except (socket.timeout, ValueError):
                    break
            out["ws"] = msgs
        finally:
            ws.close()
    except Exception as e:  # noqa
        out["ws_error"] = f"{e.__class__.__name__}: {e}"
    return out


def _sdcp_status(msg):
    """SDCP V3 durum mesajından (Status/PrintInfo) ortak duruma çevir. Alanlar sürüme göre farklı olabilir."""
    st = msg.get("Status") or (msg.get("Data") or {}).get("Status") or {}
    pi = st.get("PrintInfo") or {}
    cur = st.get("CurrentStatus")
    cur = cur if isinstance(cur, list) else [cur]
    ps = pi.get("Status")
    if ps in (9,):
        g = "FINISH"
    elif ps in (8,) and 1 not in cur:
        g = "FAILED"
    elif 1 in cur:
        g = "PAUSE" if ps in (5, 6) else "RUNNING"
    else:
        g = "IDLE"
    cl, tl = int(pi.get("CurrentLayer") or 0), int(pi.get("TotalLayer") or 0)
    ct, tt = float(pi.get("CurrentTicks") or 0), float(pi.get("TotalTicks") or 0)
    rem = max(0, int(round((tt - ct) / 60000))) if tt > ct else 0   # tick = milisaniye
    pct = int(round(cl * 100 / tl)) if tl else (int(round(ct * 100 / tt)) if tt else 0)
    return g, pi.get("Filename") or "", pi.get("TaskId") or "", rem, pct, cl or None, tl or None, int(pi.get("ErrorNumber") or 0)


class ElegooWorker(_LinkBase):
    def run(self):
        backoff = 5
        while not self.stop.is_set():
            ws = None
            try:
                self._set_status(online=False, connecting=True, error=None)
                info = {}
                try:
                    info = sdcp_discover(self.cfg["ip"])
                except Exception:
                    pass
                mb = (info.get("Data") or {}).get("MainboardID") if isinstance(info, dict) else None
                ws = self.sock = _WS(self.cfg["ip"], 3030, "/websocket")
                ws.sock.settimeout(15)
                ws.send(_sdcp_request(mb, 0))
                self._set_status(online=True, connecting=False, error=None)
                backoff = 5
                last_req = time.time()
                while not self.stop.is_set():
                    if time.time() - last_req > 10:
                        ws.send(_sdcp_request(mb, 0))
                        last_req = time.time()
                    try:
                        msg = json.loads(ws.recv())
                    except socket.timeout:
                        continue
                    except ValueError:
                        continue
                    if not isinstance(msg, dict) or not (msg.get("Status") or (msg.get("Data") or {}).get("Status")):
                        continue
                    g, fn, tid, rem, pct, cl, tl, err = _sdcp_status(msg)
                    if fn and g != "IDLE":
                        if not tid:
                            if self.state.get("task_fn") != fn:
                                self.state["task_fn"], self.state["task_start"] = fn, int(time.time() // 60)
                            tid = self.state["task_start"]
                        task_key = f"el:{fn}:{tid}"
                    else:
                        task_key = self.prev_task or ""
                    self._feed(g, task_key, fn, rem, pct, cl, tl, err)
            except Exception as e:  # noqa
                self._set_status(online=False, connecting=False,
                                 error="Yazıcıya ulaşılamıyor (IP doğru mu, Wi-Fi açık mı?)" if isinstance(e, OSError) else str(e))
            finally:
                if ws:
                    ws.close()
            self.stop.wait(backoff)
            backoff = min(60, backoff * 2)


# ================================================================ tabladaki nesne sayısı
# Bambu: yazıcının FTPS sunucusu (port 990, örtük TLS, kullanıcı bblp, şifre = erişim kodu). Baskı dosyası (.3mf)
# indirilir; Metadata/slice_info.config içinde o tabladaki nesneler (atlanmayanlar) sayılır.
import ftplib as _ftplib
import io as _io
import xml.etree.ElementTree as _ET
import zipfile as _zip


class _ImplicitFTPS(_ftplib.FTP_TLS):
    """Örtük TLS + veri bağlantısında oturum yeniden kullanımı (Bambu'nun FTP sunucusu ister)."""
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self._sock = None

    @property
    def sock(self):
        return self._sock

    @sock.setter
    def sock(self, value):
        if value is not None and not isinstance(value, ssl.SSLSocket):
            value = self.context.wrap_socket(value, server_hostname=self.host)
        self._sock = value

    def ntransfercmd(self, cmd, rest=None):
        conn, size = _ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(conn, server_hostname=self.host, session=self.sock.session)
        return conn, size


def _ftps(ip, code):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    f = _ImplicitFTPS(context=ctx, timeout=20)
    f.connect(ip, 990)
    f.login("bblp", code)
    f.prot_p()
    return f


def _plate_no(gcode_file):
    m = re.search(r"plate_(\d+)\.gcode", gcode_file or "")
    return int(m.group(1)) if m else 1


def plate_info(data, plate=1):
    """3MF içindeki slice_info.config'ten verilen tablanın (atlanmamış) nesne sayısı ve dilimleyicinin hesapladığı
    filament ağırlığı (gram). Bulunamayan değer None."""
    with _zip.ZipFile(_io.BytesIO(data)) as z:
        try:
            root = _ET.fromstring(z.read("Metadata/slice_info.config"))
        except KeyError:
            return None, None
    plates = root.findall("plate")
    for pl in plates:
        meta = {m.get("key"): m.get("value") for m in pl.findall("metadata")}
        if len(plates) == 1 or str(meta.get("index")) == str(plate):
            objs = [o for o in pl.findall("object") if (o.get("skipped") or "false").lower() != "true"]
            w = None
            try:
                w = float(meta.get("weight") or 0) or None
            except ValueError:
                w = None
            if not w:
                try:
                    w = sum(float(f.get("used_g") or 0) for f in pl.findall("filament")) or None
                except ValueError:
                    w = None
            return (len(objs) or None), (round(w, 1) if w else None)
    return None, None


def count_plate_objects(data, plate=1):
    """3MF içindeki slice_info.config'ten verilen tabladaki (atlanmamış) nesne sayısı."""
    return plate_info(data, plate)[0]


def bambu_plate_objects(cfg, subtask, gcode_file):
    f = _ftps(cfg["ip"], cfg["code"])
    try:
        cand = []
        if (gcode_file or "").lower().endswith(".3mf"):
            cand.append(gcode_file)
        want = norm(subtask)
        for d in ("/cache", "/", "/model"):
            try:
                names = f.nlst(d)
            except _ftplib.all_errors:
                continue
            for n in names:
                base = n.split("/")[-1]
                if base.lower().endswith(".3mf") and want and norm(base).startswith(want):
                    cand.append(n if n.startswith("/") else f"{d.rstrip('/')}/{base}")
        notes = []
        for path in dict.fromkeys(cand):          # sırayı koruyarak tekrarları at
            try:
                expected = f.size(path)
            except (_ftplib.all_errors + (ValueError,)):
                expected = None
            for attempt in range(3):              # P1/A1 sunucusu veri bağlantısını bazen erken kapatıyor: eksikse tekrar dene
                data = _retr(f, path)
                ok_size = expected is None or len(data) == expected
                if data[:2] == b"PK" and ok_size:
                    try:
                        n, w = plate_info(data, _plate_no(gcode_file))
                    except _zip.BadZipFile:
                        n, w = None, None
                    if n or w:
                        return n, w
                    notes.append(f"{path}: dosyada tabla/nesne bilgisi yok")
                    break
                notes.append(f"{path}: deneme {attempt + 1}, beklenen {expected} bayt, gelen {len(data)} bayt, başı {data[:8]!r}")
                time.sleep(1)
        if notes:
            raise RuntimeError("; ".join(notes[-4:]))
        raise RuntimeError(f"yazıcıda '{subtask}' adlı .3mf bulunamadı (aranan: /cache, /, /model)")
    finally:
        try:
            f.quit()
        except Exception:
            pass


def _retr(f, path):
    """RETR; TLS kapanışında sunucu sessizce koparsa o ana kadar gelen veriyi döndürür."""
    buf = _io.BytesIO()
    try:
        conn = f.transfercmd(f"RETR {path}")
    except _ftplib.all_errors:
        return b""
    try:
        conn.settimeout(30)
        while True:
            chunk = conn.recv(65536)
            if not chunk:
                break
            buf.write(chunk)
            if buf.tell() > 300 * 1024 * 1024:
                break
    except (OSError, ssl.SSLError):
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass
    try:
        f.voidresp()
    except _ftplib.all_errors + (OSError,):
        pass
    return buf.getvalue()


def apply_objects(printer, task_key, n):
    """Okunan nesne sayısını, otomatik açılmış ve adedi elle değiştirilmemiş baskıya ve bekleyen uyarıya yazar."""
    with _ev_lock:
        for e in _events:
            if e["printer"] == printer and e["task"] == task_key:
                e["objects"] = n
                if e.get("product_id") and e.get("reason") == "confirm":
                    try:
                        p = _db().execute("SELECT set_size FROM products WHERE id=?", (e["product_id"],)).fetchone()
                        e["guess_qty"] = _qty_from_objects(n, p, e.get("guess_qty") or 1)
                    except Exception:
                        pass
    try:
        with _lock:
            for j in _db().execute("""SELECT j.*, p.set_size FROM print_jobs j LEFT JOIN products p ON p.id=j.product_id
                                      WHERE j.status='printing' AND j.printer=? AND j.bambu_task=?""", (printer, task_key)).fetchall():
                if (j["note"] or "").startswith("Bambu:") and "adet dosyadan" not in (j["note"] or "") and "onaylandı" not in (j["note"] or ""):
                    ss = max(1, int(j["set_size"] or 1))
                    qty = n // ss if ss > 1 and n % ss == 0 else n
                    _db().execute("UPDATE print_jobs SET quantity=?, note=? WHERE id=?",
                                  (max(1, qty), f"{j['note']} · adet dosyadan: {n} nesne", j["id"]))
            _db().commit()
    except Exception as e:  # noqa
        print("Adet güncellenemedi:", e)


def fill_product_grams(job_id):
    """Baskının dosyadan okunan gramı varsa ve ürünün (ya da ortak parçanın) gramı boşsa: gram = dosya gramı ÷ adet."""
    j = _db().execute("SELECT product_id, component_id, quantity, file_grams FROM print_jobs WHERE id=?", (job_id,)).fetchone()
    if not j or not j["file_grams"]:
        return
    per = round(j["file_grams"] / max(1, j["quantity"] or 1), 1)
    if j["product_id"]:
        multi = _db().execute("SELECT COUNT(*) FROM product_parts WHERE product_id=?", (j["product_id"],)).fetchone()[0]
        if not multi:
            _db().execute("UPDATE products SET grams=? WHERE id=? AND COALESCE(grams,0)=0", (per, j["product_id"]))
    elif j["component_id"]:
        _db().execute("UPDATE components SET grams=? WHERE id=? AND COALESCE(grams,0)=0", (per, j["component_id"]))


def apply_grams(printer, task_key, grams):
    """Dilimleyicinin hesapladığı baskı gramını açık baskıya ve bekleyen uyarıya yazar."""
    try:
        grams = round(float(grams), 1)
    except (TypeError, ValueError):
        return
    if grams <= 0:
        return
    with _ev_lock:
        for e in _events:
            if e["printer"] == printer and e["task"] == task_key:
                e["grams"] = grams
    try:
        with _lock:
            for j in _db().execute("SELECT id FROM print_jobs WHERE status='printing' AND printer=? AND bambu_task=?",
                                   (printer, task_key)).fetchall():
                _db().execute("UPDATE print_jobs SET file_grams=? WHERE id=?", (grams, j["id"]))
                fill_product_grams(j["id"])
            _db().commit()
    except Exception as e:  # noqa
        print("Gram yazılamadı:", e)
