"""
Home Assistant yedeği almadan hemen önce çalışır (eklenti ayarı backup_pre).
Çalışan uygulamadan tutarlı bir veritabanı kopyası ister (yedek/atolye-ha-*.db); uygulamaya ulaşılamazsa
kopyayı doğrudan alır. Böylece Home Assistant yedeği (ve Google Drive'a giden kopyası) her zaman sağlam bir
veritabanı içerir.
"""
import json
import os
import sqlite3
import sys
import time
import urllib.request

DATA = os.environ.get("ATOLYE_DATA_DIR") or "/config"


def port():
    try:
        with open("/data/options.json", encoding="utf-8") as f:
            return int(json.load(f).get("port") or 8080)
    except (OSError, ValueError, TypeError):
        return 8080


def via_app():
    req = urllib.request.Request(f"http://127.0.0.1:{port()}/api/backups", data=b'{"kind":"ha"}', method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8")).get("made")


def direct():
    src = os.path.join(DATA, "atolye.db")
    d = os.path.join(DATA, "yedek")
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, time.strftime("atolye-ha-%Y%m%d-%H%M%S.db"))
    a, b = sqlite3.connect(src, timeout=30), sqlite3.connect(dst + ".tmp")
    try:
        a.backup(b)
    finally:
        b.close()
        a.close()
    os.replace(dst + ".tmp", dst)
    return {"name": os.path.basename(dst)}


if __name__ == "__main__":
    try:
        print("Astera: HA yedeği öncesi veritabanı kopyası:", via_app())
    except Exception as e:  # noqa
        print("Astera: uygulamaya ulaşılamadı, doğrudan kopyalanıyor:", e)
        try:
            print("Astera:", direct())
        except Exception as e2:  # noqa
            print("Astera: kopya alınamadı:", e2)
    sys.exit(0)   # yedek hiçbir durumda engellenmesin
