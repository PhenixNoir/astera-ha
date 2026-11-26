"""Canlı güncelleme: açık panellere "şu değişti" haberi (Server-Sent Events, /api/events).

Panel eskiden 10 saniyede bir "yeni bir şey var mı?" diye soruyordu. Şimdi sunucu veritabanında bir şey değişince
(yeni sipariş, stok, bildirim, baskı, yapılacak iş…) bağlı panellere hangi bölümün değiştiğini hemen söyler; panel
yalnız o bölümü yeniden ister. Bağlı panel yokken izleyici durur, boşuna sorgu yapılmaz.
"""
import json
import queue
import threading
import time

_db = None
_lock = None
_subs = set()
_subs_lock = threading.Lock()
_thread = None

# bölüm → ucuz imza sorgusu (yalnız veritabanında bir şey değiştiğinde çalışır)
SIGS = {
    "notifs": "SELECT COUNT(*), MAX(updated_at), MAX(resolved_at), SUM(cleared) FROM notifications",
    "orders": """SELECT COUNT(*), MAX(updated_at), MAX(packed_at), MAX(label_at), MAX(shipped_at), SUM(state='deducted'),
                        SUM(state='restocked'), SUM(product_id IS NULL), (SELECT COUNT(*) || ':' || COALESCE(MAX(at),0) FROM ty_back)
                 FROM ty_lines""",
    "jobs": "SELECT COUNT(*), MAX(id), MAX(started_at), MAX(finished_at), GROUP_CONCAT(status || COALESCE(bambu_state,''), '') FROM (SELECT * FROM print_jobs ORDER BY id DESC LIMIT 60)",
    "products": "SELECT COUNT(*), MAX(updated_at), SUM(stock), SUM(archived) FROM products",
    "todos": "SELECT COUNT(*), MAX(updated_at), (SELECT COUNT(*) || ':' || GROUP_CONCAT(label || color, '') FROM todo_cats) FROM todos",
    "custom": "SELECT COUNT(*), MAX(updated_at) FROM custom_orders",
}


def init(db, lock):
    global _db, _lock
    _db, _lock = db, lock


def count():
    with _subs_lock:
        return len(_subs)


def _sigs():
    out = {}
    for k, q in SIGS.items():
        try:
            out[k] = tuple(_db().execute(q).fetchone())
        except Exception:   # tablo henüz yok / eski şema
            out[k] = None
    return out


def publish(kinds):
    if not kinds:
        return
    msg = json.dumps({"kinds": sorted(set(kinds)), "at": int(time.time())})
    with _subs_lock:
        for q in list(_subs):
            try:
                q.put_nowait(msg)
            except queue.Full:
                pass


def _watch():
    global _thread
    last_tc, last = None, None
    while True:
        time.sleep(1.5)
        with _subs_lock:
            if not _subs:
                _thread = None
                return
        try:
            with _lock:
                tc = _db().total_changes
                if tc == last_tc:
                    continue
                last_tc = tc
                now = _sigs()
        except Exception:
            continue
        if last is not None:
            publish([k for k, v in now.items() if v != last.get(k)])
        last = now


def subscribe():
    global _thread
    q = queue.Queue(maxsize=50)
    with _subs_lock:
        _subs.add(q)
        if _thread is None:
            _thread = threading.Thread(target=_watch, daemon=True, name="canli")
            _thread.start()
    return q


def unsubscribe(q):
    with _subs_lock:
        _subs.discard(q)


def stream(handler):
    """/api/events: bağlantı açık kaldıkça değişiklikleri yazar; 20 sn'de bir boş satır (bağlantı kopmasın)."""
    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Accel-Buffering", "no")
    handler.send_header("Connection", "close")
    handler.end_headers()
    handler.close_connection = True
    q = subscribe()
    try:
        handler.wfile.write(b"retry: 4000\nevent: hello\ndata: {}\n\n")
        handler.wfile.flush()
        while True:
            try:
                msg = q.get(timeout=20)
                # art arda gelenleri tek habere topla
                kinds = set(json.loads(msg)["kinds"])
                while True:
                    try:
                        kinds |= set(json.loads(q.get_nowait())["kinds"])
                    except queue.Empty:
                        break
                data = json.dumps({"kinds": sorted(kinds)})
                handler.wfile.write(f"event: change\ndata: {data}\n\n".encode())
            except queue.Empty:
                handler.wfile.write(b": ping\n\n")
            handler.wfile.flush()
    except (ConnectionError, TimeoutError, OSError, ValueError):
        pass
    finally:
        unsubscribe(q)
