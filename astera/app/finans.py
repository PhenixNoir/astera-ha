"""
Trendyol finans: cari hesap ekstresi (satış, iade, komisyon, indirim hareketleri; Trendyol'un kestiği faturalar;
ödemeler) ve kargo faturası kalemleri (sipariş başına gerçek kargo ücreti ve desi).

Trendyol tek sorguda en fazla 15 günlük aralık verir; 14'er günlük parçalarla çekilir. İlk açılışta son 90 gün,
sonra her 6 saatte bir son 30 gün yeniden çekilir (kayıtlar teslimattan / ödemeden sonra oluştuğu için geriye dönük
yeni kayıt gelebilir). Kayıtlar Trendyol kimliğiyle saklanır, tekrar çekmek kopya oluşturmaz.
"""
import json
import threading
import time

import trendyol

_db = _lock = _get = _set = None
SCHEMA = """
CREATE TABLE IF NOT EXISTS fin_tx (
    key TEXT PRIMARY KEY,
    kind TEXT,
    tx_id TEXT,
    tx_type TEXT,
    tx_label TEXT,
    tx_date INTEGER,
    order_number TEXT,
    package_id TEXT,
    barcode TEXT,
    description TEXT,
    debt REAL,
    credit REAL,
    commission_rate REAL,
    commission_amount REAL,
    commission_invoice TEXT,
    seller_revenue REAL,
    payment_order_id TEXT,
    payment_date INTEGER,
    receipt_id TEXT,
    updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fin_date ON fin_tx(tx_date);
CREATE INDEX IF NOT EXISTS idx_fin_order ON fin_tx(order_number);
CREATE INDEX IF NOT EXISTS idx_fin_pay ON fin_tx(payment_date);
CREATE TABLE IF NOT EXISTS fin_cargo (
    key TEXT PRIMARY KEY,
    invoice_no TEXT,
    order_number TEXT,
    parcel_id TEXT,
    ship_type TEXT,
    amount REAL,
    desi REAL,
    invoice_date INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fin_cargo_order ON fin_cargo(order_number);
CREATE TABLE IF NOT EXISTS fin_cargo_inv (invoice_no TEXT PRIMARY KEY, fetched_at INTEGER, items INTEGER);
CREATE TABLE IF NOT EXISTS fin_payouts (id TEXT PRIMARY KEY, payout_date INTEGER, amount REAL, raw TEXT, fetched INTEGER);
"""
SETTLEMENT_TYPES = ["Sale", "Return", "Discount", "DiscountCancel", "Coupon", "CouponCancel", "ProvisionPositive", "ProvisionNegative",
                    "ManualRefund", "ManualRefundCancel", "TyDiscount", "TyDiscountCancel", "TyCoupon", "TyCouponCancel",
                    "SellerRevenuePositive", "SellerRevenueNegative", "CommissionPositive", "CommissionNegative",
                    "SellerRevenuePositiveCancel", "SellerRevenueNegativeCancel", "CommissionPositiveCancel",
                    "CommissionNegativeCancel", "DeliveryFee", "DeliveryFeeCancel", "PayByLink"]
OTHER_TYPES = ["DeductionInvoices", "ReturnInvoice", "CommissionAgreementInvoice", "PaymentOrder", "Stoppage", "CashAdvance",
               "WireTransfer", "IncomingTransfer", "FinancialItem"]
OTHER_TEXT = {"DeductionInvoices": "Trendyol faturası", "ReturnInvoice": "İade faturası", "CommissionAgreementInvoice": "Komisyon mutabakat faturası",
              "PaymentOrder": "Ödeme", "Stoppage": "Stopaj", "CashAdvance": "Erken ödeme", "WireTransfer": "Virman",
              "IncomingTransfer": "Gelen havale", "FinancialItem": "Finansal kalem"}
INVOICE_TYPES = ("DeductionInvoices", "ReturnInvoice", "CommissionAgreementInvoice")
WINDOW = 14 * 86400
FIRST_DAYS = 90
RESYNC_DAYS = 30
EVERY = 6 * 3600
_running = threading.Lock()


def migrate(c):
    c.executescript(SCHEMA)
    if "fetched" not in [r[1] for r in c.execute("PRAGMA table_info(fin_payouts)")]:
        c.execute("ALTER TABLE fin_payouts ADD COLUMN fetched INTEGER")


def init(db, lock, get_setting, set_setting):
    global _db, _lock, _get, _set
    _db, _lock, _get, _set = db, lock, get_setting, set_setting
    migrate(_db())


def _now():
    return int(time.time())


def _ms(v):
    try:
        return int(int(v) / 1000) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def status():
    try:
        return json.loads(_get("fin_sync", "") or "{}")
    except ValueError:
        return {}


def _set_status(**kw):
    with _lock:
        st = status()
        st.update(kw)
        _set("fin_sync", json.dumps(st, ensure_ascii=False))
        _db().commit()


def _call(path, params):
    for attempt in range(3):
        try:
            return trendyol._request(path, params)
        except trendyol.TrendyolError as e:
            if "istek sınırı" in str(e) and attempt < 2:
                time.sleep(15)
                continue
            raise


def _pages(path, params):
    page = 0
    while True:
        data = _call(path, {**params, "page": page, "size": 500})
        for it in (data.get("content") or []):
            yield it
        page += 1
        if page >= int(data.get("totalPages") or 1) or page > 40:
            return
        time.sleep(0.35)


def _store(kind, tx_type, it):
    tid = str(it.get("id") or "")
    if not tid:
        return
    label = it.get("transactionType") or tx_type
    key = f"{kind}:{tid}:{tx_type or label}"
    _db().execute("""INSERT INTO fin_tx(key,kind,tx_id,tx_type,tx_label,tx_date,order_number,package_id,barcode,description,debt,credit,
                         commission_rate,commission_amount,commission_invoice,seller_revenue,payment_order_id,payment_date,receipt_id,updated_at)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                     ON CONFLICT(key) DO UPDATE SET tx_label=excluded.tx_label, tx_date=excluded.tx_date, description=excluded.description,
                         debt=excluded.debt, credit=excluded.credit, commission_rate=excluded.commission_rate,
                         commission_amount=excluded.commission_amount, commission_invoice=excluded.commission_invoice,
                         seller_revenue=excluded.seller_revenue, payment_order_id=excluded.payment_order_id,
                         payment_date=excluded.payment_date, updated_at=excluded.updated_at""",
                  (key, kind, tid, tx_type, label, _ms(it.get("transactionDate")), str(it.get("orderNumber") or "") or None,
                   str(it.get("shipmentPackageId") or "") or None, it.get("barcode"), it.get("description"),
                   _f(it.get("debt")), _f(it.get("credit")), _f(it.get("commissionRate")), _f(it.get("commissionAmount")),
                   it.get("commissionInvoiceSerialNumber"), _f(it.get("sellerRevenue")),
                   str(it.get("paymentOrderId")) if it.get("paymentOrderId") not in (None, "", 0) else None,
                   _ms(it.get("paymentDate")), str(it.get("receiptId") or "") or None, _now()))


def _is_cargo_invoice(r):
    t = f"{r['tx_label'] or ''} {r['description'] or ''}".lower().replace("İ", "i")
    return r["tx_type"] == "DeductionInvoices" and "kargo" in t


def _sync_cargo_invoices():
    with _lock:
        todo = [r for r in _db().execute("""SELECT tx_id, tx_label, description, tx_type, tx_date FROM fin_tx
                                            WHERE kind='other' AND tx_type='DeductionInvoices'
                                            AND tx_id NOT IN (SELECT invoice_no FROM fin_cargo_inv)""").fetchall() if _is_cargo_invoice(r)]
    for r in todo:
        n = 0
        try:
            for it in _pages(f"/integration/finance/che/sellers/{{sid}}/cargo-invoice/{r['tx_id']}/items", {}):
                n += 1
                with _lock:
                    key = f"{r['tx_id']}:{it.get('parcelUniqueId')}:{it.get('shipmentPackageType')}:{it.get('orderNumber')}"
                    _db().execute("""INSERT OR REPLACE INTO fin_cargo(key,invoice_no,order_number,parcel_id,ship_type,amount,desi,invoice_date)
                                     VALUES(?,?,?,?,?,?,?,?)""",
                                  (key, r["tx_id"], str(it.get("orderNumber") or "") or None, str(it.get("parcelUniqueId") or "") or None,
                                   it.get("shipmentPackageType"), _f(it.get("amount")), _f(it.get("desi")), r["tx_date"]))
        except trendyol.TrendyolError as e:
            print("Kargo faturası okunamadı:", r["tx_id"], e)
            continue
        with _lock:
            _db().execute("INSERT OR REPLACE INTO fin_cargo_inv(invoice_no,fetched_at,items) VALUES(?,?,?)", (r["tx_id"], _now(), n))
            _db().commit()
        time.sleep(0.35)


def _sync_payouts():
    for page in range(3):
        data = _call("/integration/finance/che/sellers/{sid}/payment-order", {"page": page, "size": 10})
        items = data.get("content") or (data if isinstance(data, list) else [])
        with _lock:
            for it in items:
                pid = str(it.get("id") or "")
                if not pid:
                    continue
                amt = next((_f(it.get(k)) for k in ("amount", "totalAmount", "paymentAmount", "netAmount") if _f(it.get(k)) is not None), None)
                _db().execute("""INSERT INTO fin_payouts(id,payout_date,amount,raw) VALUES(?,?,?,?)
                                 ON CONFLICT(id) DO UPDATE SET payout_date=excluded.payout_date, amount=excluded.amount, raw=excluded.raw""",
                              (pid, _ms(it.get("payoutDate") or it.get("paymentDate")), amt, json.dumps(it, ensure_ascii=False)[:2000]))
            _db().commit()
        if not isinstance(data, dict) or page + 1 >= int(data.get("totalPages") or 1):
            return
        time.sleep(0.35)


def _sync_paid_records():
    """Yapılan her ödemenin kayıtlarını ödeme numarasıyla çeker (Trendyol'un önerdiği yol): böylece eskiden çekilmiş
    kayıtlar da "ödendi" olarak işaretlenir. Ödeme günü bilgisi bir gün sonra tamamlandığı için 1 günden yeni ödemeler beklenir."""
    t = _now()
    with _lock:
        todo = [r["id"] for r in _db().execute("""SELECT id FROM fin_payouts WHERE COALESCE(fetched,0)=0 AND payout_date IS NOT NULL
                                                  AND payout_date < ? AND payout_date > ? ORDER BY payout_date DESC LIMIT 12""",
                                               (t - 86400, t - 60 * 86400))]
        sid = _get("ty_seller_id")
    for pid in todo:
        base = {"paymentOrderId": pid, "supplierId": sid}
        for it in _pages("/integration/finance/che/sellers/{sid}/settlements", {**base, "transactionTypes": ",".join(SETTLEMENT_TYPES)}):
            with _lock:
                _store("settlement", None, it)
        for tt in OTHER_TYPES:
            time.sleep(0.35)
            for it in _pages("/integration/finance/che/sellers/{sid}/otherfinancials", {**base, "transactionType": tt}):
                with _lock:
                    _store("other", tt, it)
        with _lock:
            _db().execute("UPDATE fin_payouts SET fetched=? WHERE id=?", (_now(), pid))
            _db().commit()


def sync():
    """Ekstreyi çeker. Aynı anda tek eşitleme çalışır."""
    if not _running.acquire(blocking=False):
        return {"running": True}
    try:
        with _lock:
            configured = bool(_get("ty_seller_id") and _get("ty_api_key") and _get("ty_api_secret"))
        if not configured:
            _set_status(error="Trendyol API bilgileri girilmemiş", running=False)
            return status()
        st = status()
        end = _now()
        start = end - (RESYNC_DAYS if st.get("first_done") else FIRST_DAYS) * 86400
        _set_status(running=True, error=None, started=end)
        n = 0
        a = start
        while a < end:
            b = min(end, a + WINDOW)
            with _lock:
                sid = _get("ty_seller_id")
            base = {"startDate": a * 1000, "endDate": b * 1000, "supplierId": sid}
            for it in _pages("/integration/finance/che/sellers/{sid}/settlements", {**base, "transactionTypes": ",".join(SETTLEMENT_TYPES)}):
                with _lock:
                    _store("settlement", None, it)
                n += 1
            for t in OTHER_TYPES:
                time.sleep(0.35)
                for it in _pages("/integration/finance/che/sellers/{sid}/otherfinancials", {**base, "transactionType": t}):
                    with _lock:
                        _store("other", t, it)
                    n += 1
            with _lock:
                _db().commit()
            _set_status(progress=round((b - start) / max(1, end - start), 2))
            a = b
            time.sleep(0.35)
        _sync_cargo_invoices()
        try:
            _sync_payouts()
            _sync_paid_records()
        except trendyol.TrendyolError as e:
            print("Ödeme listesi okunamadı:", e)
        _set_status(running=False, at=_now(), first_done=True, records=n, progress=1, error=None)
        return status()
    except trendyol.TrendyolError as e:
        _set_status(running=False, error=str(e))
        return status()
    except Exception as e:  # noqa
        _set_status(running=False, error=f"Beklenmeyen hata: {e}")
        raise
    finally:
        _running.release()


def sync_async():
    threading.Thread(target=lambda: _safe(sync), daemon=True, name="finans-sync").start()


def _safe(fn):
    try:
        fn()
    except Exception as e:  # noqa
        print("Finans eşitleme hatası:", e)


def _loop():
    time.sleep(60)
    while True:
        try:
            with _lock:
                on = _get("ty_enabled", "0") == "1"
            st = status()
            if on and _now() - int(st.get("at") or 0) >= EVERY:
                sync()
        except Exception as e:  # noqa
            print("Finans döngüsü hatası:", e)
        time.sleep(600)


def start():
    threading.Thread(target=_loop, daemon=True, name="finans").start()


# ---------------------------------------------------------------- okuma

def _net(r):
    if r["kind"] == "settlement" and r["seller_revenue"] is not None:
        return r["seller_revenue"]
    return (r["credit"] or 0) - (r["debt"] or 0)


def _order_states():
    """Sipariş no → 'delivered' / 'pending' / 'closed'. Teslim edilmemiş siparişlerin hakedişi ödemeye girmez."""
    out = {}
    for r in _db().execute("SELECT order_number, GROUP_CONCAT(DISTINCT ty_status) s FROM ty_lines WHERE order_number IS NOT NULL GROUP BY order_number"):
        st = set((r["s"] or "").split(","))
        if "Delivered" in st:
            out[r["order_number"]] = "delivered"
        elif st and st <= {"Cancelled", "UnSupplied", "Returned", ""}:
            out[r["order_number"]] = "closed"
        else:
            out[r["order_number"]] = "pending"
    return out


def pay_weekdays():
    """Trendyol'un düzenli ödeme yaptığı haftanın günleri (0 = Pazartesi). Geçmiş ödemelerden öğrenilir; yoksa Pazartesi ve Perşembe.
    Erken ödemeler ve bayram kaymaları (ör. 29 Ekim yüzünden Cuma'ya kayan ödeme) sayılmaz: bir gün ancak ödemelerin
    en az dörtte birinde görülüyorsa ödeme günü kabul edilir."""
    cnt, tot = {}, 0
    for r in _db().execute("SELECT payout_date, raw FROM fin_payouts WHERE payout_date IS NOT NULL ORDER BY payout_date DESC LIMIT 30"):
        if "erken" in (r["raw"] or "").lower() or "advance" in (r["raw"] or "").lower():
            continue
        wd = time.localtime(r["payout_date"]).tm_wday
        cnt[wd] = cnt.get(wd, 0) + 1
        tot += 1
    days = {d for d, n in cnt.items() if n >= 2 and n >= tot * 0.25}
    return days or {0, 3}


def pay_lead(days, t):
    """Trendyol bir kaydı vadesine göre hangi ödeme gününde ödüyor? Geçmiş ödemelerden öğrenilir:
    ödeme günü = (vade - L gün)'den sonraki ilk ödeme günü. L, son 60 günün düzenli ödemelerinde en çok tutan değerdir."""
    pays = {r["id"]: r["payout_date"] for r in _db().execute(
        "SELECT id, payout_date, raw FROM fin_payouts WHERE payout_date > ? AND COALESCE(fetched,0) > 0", (t - 60 * 86400,))
        if r["payout_date"] and "erken" not in (r["raw"] or "").lower() and "advance" not in (r["raw"] or "").lower()}
    if not pays:
        return "prev", None
    pairs = [(r["payment_date"], pays[r["payment_order_id"]]) for r in _db().execute(
        f"SELECT payment_date, payment_order_id FROM fin_tx WHERE payment_date IS NOT NULL AND payment_order_id IN ({','.join('?' * len(pays))})",
        list(pays))]
    if len(pairs) < 20:
        return "prev", None
    day = lambda x: time.strftime("%Y-%m-%d", time.localtime(x))
    best = ("prev", -1)
    for lead in ["prev", *range(-3, 15)]:
        ok = sum(1 for due, paid in pairs if day(pay_day_for(due, days, lead)) == day(paid))
        if ok > best[1]:
            best = (lead, ok)
    return best[0], round(best[1] / len(pairs), 3)


ACTIVE_ORDER = ("Created", "Picking", "Invoiced", "Shipped", "AtCollectionPoint", "UnDelivered", "Awaiting", "ReadyToShip")


def _service_fee_per_order(t):
    """Platform hizmet bedeli: son 30 günde kesilen hizmet bedeli faturaları / aynı dönemde satılan sipariş sayısı."""
    fee = 0.0
    for r in _db().execute("""SELECT tx_label, description, debt, credit FROM fin_tx WHERE kind='other' AND tx_type='DeductionInvoices'
                              AND tx_date >= ?""", (t - 30 * 86400,)):
        txt = f"{r['tx_label'] or ''} {r['description'] or ''}".lower().replace("İ", "i")
        if "hizmet" in txt and "kargo" not in txt:
            fee += (r["debt"] or 0) - (r["credit"] or 0)
    n = _db().execute("""SELECT COUNT(DISTINCT order_number) FROM fin_tx WHERE kind='settlement' AND COALESCE(credit,0) > 0
                         AND tx_date >= ?""", (t - 30 * 86400,)).fetchone()[0]
    return round(fee / n, 2) if fee > 0 and n else 0.0


def prev_pay_day(ts, days):
    """Vadeden önceki (ya da vade günündeki) son ödeme günü."""
    lt = time.localtime(ts)
    for i in range(15):
        d = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday - i, 12, 0, 0, 0, 0, -1))
        if time.localtime(d).tm_wday in days:
            return int(d)
    return int(ts)


def pay_day_for(due, days, lead):
    """lead = 'prev': vade gününden önceki son ödeme gününde ödenir (Trendyol'un bugünkü düzeni);
    sayı: (vade - lead gün)'den sonraki ilk ödeme gününde."""
    return prev_pay_day(due, days) if lead == "prev" else next_pay_day(due - lead * 86400, days)


def next_pay_day(ts, days):
    lt = time.localtime(ts)
    for i in range(15):
        d = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday + i, 12, 0, 0, 0, 0, -1))
        if time.localtime(d).tm_wday in days:
            return int(d)
    return int(ts)


def cargo_by_order(order_numbers=None):
    q = "SELECT order_number, SUM(amount) a, MAX(desi) d, COUNT(*) n FROM fin_cargo WHERE order_number IS NOT NULL"
    args = []
    if order_numbers is not None:
        order_numbers = [str(x) for x in order_numbers if x]
        if not order_numbers:
            return {}
        q += f" AND order_number IN ({','.join('?' * len(order_numbers))})"
        args = order_numbers
    return {r["order_number"]: {"amount": round(r["a"] or 0, 2), "desi": r["d"], "n": r["n"]}
            for r in _db().execute(q + " GROUP BY order_number", args)}


def commission_by_order(order_numbers):
    """Satış kayıtlarındaki gerçek komisyon tutarı (iadeler düşülmüş), sipariş başına."""
    ons = [str(x) for x in order_numbers if x]
    if not ons:
        return {}
    out = {}
    for i in range(0, len(ons), 500):
        part = ons[i:i + 500]
        for r in _db().execute(f"""SELECT order_number, SUM(CASE WHEN COALESCE(credit,0) > 0 THEN ABS(COALESCE(commission_amount,0))
                                                         WHEN COALESCE(debt,0) > 0 THEN -ABS(COALESCE(commission_amount,0)) ELSE 0 END) c,
                                         SUM(CASE WHEN COALESCE(credit,0) > 0 THEN 1 ELSE 0 END) n
                                  FROM fin_tx WHERE kind='settlement' AND order_number IN ({','.join('?' * len(part))}) GROUP BY order_number""", part):
            if r["n"]:
                out[r["order_number"]] = round(max(0, r["c"] or 0), 2)
    return out


def overview():
    t = _now()
    lt = time.localtime(t)
    today0 = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)))
    rows = _db().execute("SELECT * FROM fin_tx").fetchall()
    order_st = _order_states()
    days = pay_weekdays()
    lead, lead_fit = pay_lead(days, t)
    upcoming, paid = {}, {}
    pending = {"gross": 0.0, "net": 0.0, "orders": set(), "n": 0}
    # en son ayrıntısı çekilmiş ödeme: bundan önce vadesi gelip içinde olmayan kayıt başka (çekilmemiş) bir ödemede ödenmiştir
    last_fetched = _db().execute("SELECT MAX(payout_date) FROM fin_payouts WHERE COALESCE(fetched,0)>0").fetchone()[0] or 0
    # sipariş başına tahmini kesintiler: kargo (gerçek fatura varsa o, yoksa son 90 günün ortalaması), platform hizmet bedeli, stopaj
    cg = _db().execute("""SELECT COUNT(DISTINCT order_number) n, COALESCE(SUM(amount),0) a FROM fin_cargo
                          WHERE invoice_date>=? AND order_number IS NOT NULL""", (t - 90 * 86400,)).fetchone()
    cargo_avg = round(cg["a"] / cg["n"], 2) if cg["n"] else 0.0
    svc = _service_fee_per_order(t)
    cargo_real = {r["order_number"] for r in _db().execute("SELECT DISTINCT order_number FROM fin_cargo WHERE order_number IS NOT NULL")}
    for r in rows:
        if r["tx_type"] == "PaymentOrder":
            continue
        net = _net(r)
        if r["payment_order_id"]:
            g = paid.setdefault(r["payment_order_id"], {"id": r["payment_order_id"], "date": r["payment_date"], "net": 0.0, "n": 0})
            g["net"] += net
            g["n"] += 1
            g["date"] = g["date"] or r["payment_date"]
            continue
        on = r["order_number"]
        if r["kind"] == "settlement" and on and order_st.get(on) == "pending":
            # teslim edilmemiş sipariş: Trendyol ödemeye katmaz (panelde "Onaylanan/Kargolanan Sipariş Tutarı")
            pending["net"] += net
            pending["n"] += 1
            continue
        due = r["payment_date"]
        if due and due < today0 - 60 * 86400:
            continue
        if r["kind"] == "other" and "komisyon" in (r["tx_label"] or "").lower():
            continue   # komisyon faturası belgedir; komisyon satış kayıtlarında zaten düşülü
        if due and last_fetched and time.strftime("%Y%m%d", time.localtime(pay_day_for(due, days, lead))) <= time.strftime("%Y%m%d", time.localtime(last_fetched)):
            continue   # kurala göre son çekilen ödemede ya da daha eskisinde ödenmesi gerekirdi: ödenmiş say
        if not due and (r["kind"] != "other" or (r["tx_date"] or 0) < t - 30 * 86400):
            continue
        day = pay_day_for(due, days, lead) if due else next_pay_day(t, days)
        if day < today0:
            day = next_pay_day(today0, days)
        k = time.strftime("%Y-%m-%d", time.localtime(day))
        g = upcoming.setdefault(k, {"day": k, "date": day, "net": 0.0, "gross": 0.0, "cut": 0.0, "n": 0, "orders": set(),
                                    "est_cargo": 0.0, "est_svc": 0.0, "est_stop": 0.0, "list": {}})
        g["net"] += net
        g["n"] += 1
        if r["kind"] == "settlement" and (r["credit"] or 0) > 0:
            g["gross"] += r["credit"]
        if on:
            g["orders"].add(on)
            if r["kind"] == "settlement":
                o = g["list"].setdefault(on, {"no": on, "gross": 0.0, "net": 0.0})
                o["gross"] += max(0.0, r["credit"] or 0)
                o["net"] += net
    # tahmini kesintiler: her siparişe bir kez
    for g in upcoming.values():
        for on, o in g["list"].items():
            if o["gross"] <= 0:
                continue
            # kargo faturası kesilmişse (ödendiyse geçmiş ödemeden, ödenmediyse zaten kayıtlarda) düşülmüştür; yoksa ortalama
            c = 0.0 if on in cargo_real else cargo_avg
            o["cargo"], o["svc"], o["stop"] = c, svc, round(o["gross"] / 1.2 * 0.01, 2)
            g["est_cargo"] += c
            g["est_svc"] += svc
            g["est_stop"] += o["stop"]
            o["net"] -= c + svc + o["stop"]
        g["net"] -= g["est_cargo"] + g["est_svc"] + g["est_stop"]
    # onaylanan / kargolanan: henüz teslim edilmemiş siparişlerin tutarı (sistemdeki Trendyol siparişlerinden)
    for r in _db().execute(f"""SELECT order_number, SUM(COALESCE(unit_price,0) * quantity) a FROM ty_lines
                               WHERE ty_status IN ({','.join('?' * len(ACTIVE_ORDER))}) AND order_date >= ? GROUP BY order_number""",
                           (*ACTIVE_ORDER, (t - 45 * 86400) * 1000)):
        pending["gross"] += r["a"] or 0
        pending["orders"].add(r["order_number"])
    for g in upcoming.values():
        g["cut"] = g["net"] - g["gross"]
    payouts = {r["id"]: dict(r) for r in _db().execute("SELECT id, payout_date, amount FROM fin_payouts")}
    for pid, p in payouts.items():
        g = paid.setdefault(pid, {"id": pid, "date": p["payout_date"], "net": 0.0, "n": 0})
        g["date"] = p["payout_date"] or g["date"]
        if p["amount"] is not None:
            g["amount"] = p["amount"]
    up = sorted(({**g, "orders": len(g["orders"]), "net": round(g["net"], 2), "gross": round(g["gross"], 2), "cut": round(g["cut"], 2),
                  "est_cargo": round(g["est_cargo"], 2), "est_svc": round(g["est_svc"], 2), "est_stop": round(g["est_stop"], 2),
                  "list": sorted(({**o, "gross": round(o["gross"], 2), "net": round(o["net"], 2)} for o in g["list"].values()), key=lambda o: -o["gross"])}
                 for g in upcoming.values()), key=lambda g: g["date"])
    pd = sorted(({**g, "net": round(g["net"], 2)} for g in paid.values() if g["n"] or g.get("amount") is not None),
                key=lambda g: -(g["date"] or 0))[:24]
    inv = []
    for r in rows:
        if r["kind"] == "other" and r["tx_type"] in INVOICE_TYPES:
            inv.append({"no": r["tx_id"], "date": r["tx_date"], "type": r["tx_type"], "label": r["tx_label"] or OTHER_TEXT.get(r["tx_type"]),
                        "desc": r["description"], "amount": round((r["debt"] or 0) - (r["credit"] or 0), 2),
                        "cargo": _is_cargo_invoice(r), "paid": bool(r["payment_order_id"])})
    com = {}
    for r in rows:
        if r["kind"] == "settlement" and r["commission_invoice"] and r["commission_amount"]:
            g = com.setdefault(r["commission_invoice"], {"no": r["commission_invoice"], "date": r["tx_date"], "type": "Commission",
                                                         "label": "Komisyon faturası", "desc": "", "amount": 0.0, "n": 0, "cargo": False})
            g["amount"] += r["commission_amount"]
            g["n"] += 1
            g["date"] = max(g["date"] or 0, r["tx_date"] or 0)
    for g in com.values():
        g["amount"] = round(g["amount"], 2)
        g["desc"] = f"{g['n']} satış kaleminin komisyonu"
        inv.append(g)
    inv.sort(key=lambda x: -(x["date"] or 0))
    since30 = t - 30 * 86400
    cg = _db().execute("""SELECT COUNT(DISTINCT order_number) n, COALESCE(SUM(amount),0) a, AVG(desi) d FROM fin_cargo
                          WHERE invoice_date>=? AND order_number IS NOT NULL""", (t - 90 * 86400,)).fetchone()
    cargo_rows = [dict(r) for r in _db().execute(
        """SELECT order_number, SUM(amount) amount, MAX(desi) desi, GROUP_CONCAT(DISTINCT ship_type) types, MAX(invoice_date) date
           FROM fin_cargo WHERE order_number IS NOT NULL GROUP BY order_number ORDER BY date DESC, order_number DESC LIMIT 300""")]
    types = {}
    for r in rows:
        lab = r["tx_label"] or OTHER_TEXT.get(r["tx_type"]) or r["tx_type"] or ""
        x = types.setdefault((r["kind"], lab), {"kind": r["kind"], "type": lab, "label": lab, "n": 0})
        x["n"] += 1
    return {
        "status": status(),
        "upcoming": up,
        "pending": {"gross": round(pending["gross"], 2), "net": round(pending["net"], 2), "orders": len(pending["orders"]), "n": pending["n"]},
        "pay_days": sorted(days),
        "est": {"cargo_avg": cargo_avg, "svc": svc, "stop_pct": 1.0, "lead_days": lead, "lead_fit": lead_fit},
        "paid": pd,
        "invoices": inv[:400],
        "invoices_30": round(sum(x["amount"] for x in inv if (x["date"] or 0) >= since30 and x["amount"] > 0), 2),
        "cargo": {"orders": cg["n"], "total": round(cg["a"], 2), "avg": round(cg["a"] / cg["n"], 2) if cg["n"] else None,
                  "avg_desi": round(cg["d"], 1) if cg["d"] else None, "rows": cargo_rows},
        "types": sorted(types.values(), key=lambda x: -x["n"]),
        "records": len(rows),
    }


def transactions(kind=None, tx=None, q=None, page=0, size=50):
    cond, args = [], []
    if kind in ("settlement", "other"):
        cond.append("kind=?")
        args.append(kind)
    if tx:
        cond.append("(tx_type=? OR tx_label=?)")
        args += [tx, tx]
    if q:
        cond.append("(order_number LIKE ? OR barcode LIKE ? OR description LIKE ? OR tx_id LIKE ?)")
        args += [f"%{q}%"] * 4
    where = (" WHERE " + " AND ".join(cond)) if cond else ""
    total = _db().execute(f"SELECT COUNT(*) FROM fin_tx{where}", args).fetchone()[0]
    rows = _db().execute(f"SELECT * FROM fin_tx{where} ORDER BY tx_date DESC, key LIMIT ? OFFSET ?",
                         args + [int(size), int(page) * int(size)]).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["net"] = round(_net(r), 2)
        d["label"] = r["tx_label"] or OTHER_TEXT.get(r["tx_type"]) or r["tx_type"]
        out.append(d)
    return {"items": out, "total": total, "page": int(page), "size": int(size)}
