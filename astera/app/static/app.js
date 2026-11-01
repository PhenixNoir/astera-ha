/* Astera — istemci. Derleme adımı yok; düz JavaScript. */
'use strict';

// ------------------------------------------------------------------ helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n) => `<svg><use href="#i-${n}"/></svg>`;
const trLower = (s) => String(s || '').toLocaleLowerCase('tr');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

async function api(method, path, body, rawBody) {
  const opt = { method, headers: {} };
  if (rawBody) { opt.body = rawBody; opt.headers['Content-Type'] = 'application/octet-stream'; }
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  let res;
  try { res = await fetch(path, opt); }
  catch { throw new Error('Sunucuya ulaşılamıyor. Bilgisayardaki Astera penceresi açık mı?'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `İstek başarısız (${res.status})`);
  return data;
}

function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (opts.bad ? ' bad' : '');
  el.innerHTML = `<span>${esc(msg)}</span>` + (opts.action ? `<button>${esc(opts.action)}</button>` : '');
  if (opts.action) el.querySelector('button').onclick = () => { opts.onAction(); el.remove(); };
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, opts.ms || (opts.action ? 6000 : 3200));
}
const fail = (e) => toast(e.message || String(e), { bad: true });

const nowS = () => Math.floor(Date.now() / 1000) + S.offset;
function fmtDur(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} dk`;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}
function countdown(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
// toLocale…('tr-TR', …) her çağrıda yeni bir Intl biçimleyici kurar ve yavaştır (uzun listelerde yüzlerce kez çağrılıyor).
// Aynı ayarlar için biçimleyici bir kez kurulup saklanır; sonuç birebir aynıdır.
(function () {
  const C = new Map();
  const wrap = (proto, name, Ctor, needOpts) => {
    const orig = proto[name];
    proto[name] = function (loc, opts) {
      if (loc !== 'tr-TR' || (needOpts && !opts)) return orig.call(this, loc, opts);
      const key = name + '|' + JSON.stringify(opts || {});
      let f = C.get(key);
      if (!f) { try { f = new Ctor(loc, opts); } catch { return orig.call(this, loc, opts); } C.set(key, f); }
      try { return f.format(this); } catch { return orig.call(this, loc, opts); }
    };
  };
  wrap(Number.prototype, 'toLocaleString', Intl.NumberFormat, false);
  wrap(Date.prototype, 'toLocaleString', Intl.DateTimeFormat, true);
  wrap(Date.prototype, 'toLocaleDateString', Intl.DateTimeFormat, true);
  wrap(Date.prototype, 'toLocaleTimeString', Intl.DateTimeFormat, true);
})();
const fmtClock = (t) => new Date(t * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
function fmtWhen(t) {
  const d = new Date(t * 1000), n = new Date();
  const diff = (n - d) / 1000;
  if (diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (d.toDateString() === n.toDateString()) return `bugün ${fmtClock(t)}`;
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `dün ${fmtClock(t)}`;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' ' + fmtClock(t);
}
const fmtMoney = (v) => v == null || v === '' ? '' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺';
const fmtGram = (g) => (Math.round((g || 0) * 10) / 10).toLocaleString('tr-TR') + ' g';

// ------------------------------------------------------------------ palette
const PALETTE = [
  ['#F4F4F1', 'Beyaz'], ['#EFE4CC', 'Krem'], ['#D8C3A0', 'Bej'], ['#C2C6CA', 'Gümüş'], ['#8B9196', 'Gri'],
  ['#4A4F54', 'Antrasit'], ['#1A1A1A', 'Siyah'], ['#D5302B', 'Kırmızı'], ['#7C1F2C', 'Bordo'], ['#F06A1D', 'Turuncu'],
  ['#F7C91E', 'Sarı'], ['#C9A227', 'Altın'], ['#A0703F', 'Ahşap'], ['#6A4634', 'Kahverengi'], ['#A6D45C', 'Fıstık yeşili'],
  ['#2E9D52', 'Yeşil'], ['#1E5B3B', 'Koyu yeşil'], ['#7D8B4E', 'Haki'], ['#1DB3AA', 'Turkuaz'], ['#71C3E8', 'Açık mavi'],
  ['#1F62C4', 'Mavi'], ['#1B2A58', 'Lacivert'], ['#B79CDB', 'Lila'], ['#6A3E9F', 'Mor'], ['#F6A7C1', 'Pembe'],
  ['#D81B7A', 'Fuşya'], ['#B87333', 'Bakır'], ['#E9E6DD', 'Gri reçine'], ['transparent', 'Şeffaf'],
];
const colorName = (hex) => (PALETTE.find((p) => p[0].toLowerCase() === String(hex).toLowerCase()) || [])[1] || '';
const swatchStyle = (hex) => hex === 'transparent' ? '' : `--c:${hex}`;
const swatchCls = (hex) => hex === 'transparent' ? ' clear' : '';
// Kategoriler Ayarlar'dan düzenlenir; boot'ta ve kaydedince yüklenir
const catNames = () => (S.categories || []).map((c) => c.name);
const catFlags = (name) => (S.categories || []).find((c) => c.name === name) || { no_materials: false, no_parts: false };
async function loadCategories() { try { S.categories = await api('GET', '/api/categories'); } catch { S.categories = S.categories || []; } }

// ------------------------------------------------------------------ state
const S = {
  offset: 0, products: [], jobs: [], orders: [], dash: null, settings: null, brands: [], log: [], colors: [],
  pf: { q: '', type: 'all', st: 'all', cat: 'all', sort: 'name', view: localStorage.getItem('pview') || 'grid' },
  ordersTab: 'new', showCancelled: false,
  dismissed: {}, promptOpen: false, lastJobsSig: '',
};

const NAV = [
  { r: '', label: 'Pano', icon: 'home', title: 'Pano' },
  { r: 'urunler', label: 'Ürünler', icon: 'box', title: 'Ürünler' },
  { r: 'baskilar', label: 'Baskılar', icon: 'layers', title: 'Baskılar' },
  { r: 'plan', label: 'Plan', icon: 'plan', title: 'Üretim planı' },
  { r: 'hazirla', label: 'Hazırla', icon: 'pack', title: 'Hazırlanacaklar' },
  { r: 'siparisler', label: 'Siparişler', icon: 'clip', title: 'Siparişler' },
  { r: 'iadeler', label: 'İadeler', icon: 'return', title: 'İadeler' },
  { r: 'sorular', label: 'Sorular', icon: 'chat', title: 'Müşteri soruları' },
  { r: 'satis', label: 'Satış', icon: 'cart', title: 'Satış ve Trendyol' },
  { r: 'buybox', label: 'Buybox', icon: 'crown', title: 'Buybox' },
  { r: 'filament', label: 'Filamentler', icon: 'spool', title: 'Filamentler' },
  { r: 'istatistik', label: 'İstatistik', icon: 'chart', title: 'İstatistik' },
  { r: 'kar', label: 'Kâr', icon: 'coin', title: 'Kâr hesabı' },
  { r: 'finans', label: 'Finans', icon: 'wallet', title: 'Finans' },
];
// Telefonda alt menüde sığanlar; diğerleri "Daha" altında
const TAB_MAIN_DEFAULT = ['', 'urunler', 'baskilar', 'hazirla'];
// ------------------------------------------------------------------ görünüm tercihleri (Ayarlar → Görünüm ve düzen; cihaz başına)
const UIP_DEFAULT = {
  nav: { order: [], hidden: [], tabs: TAB_MAIN_DEFAULT, badges: true },
  top: { pbar: true, pbarHidden: [], pbarScroll: true, pbarLabels: true, cmdk: true, newPrint: true },
  nf: { panel: true, hide: [], sound: true },
  sec: { 'baskilar.timeline': true, 'baskilar.bulk': true, 'baskilar.history': true, 'plan.others': true, 'plan.filament': true, 'plan.spools': true,
    'urun.sugg': true, 'urun.tiles': true, 'urun.chart': true, 'urun.profit': true, 'urun.ty': true, 'urun.jobs': true, 'urun.log': true },
  card: { cat: true, meta: true, colors: true, forecast: true, setmeter: true, stockbtns: true },
  cols: { type: true, mats: true, grams: true, time: true, file: true, inprod: true },
  tyo: { thumbs: true, who: true, amt: true, pr: true, dl: true },
  np: { order: true, comp: true, misc: true },
};
let UIP = null;
function uipLoad() {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('uiPrefs') || '{}') || {}; } catch { saved = {}; }
  const out = structuredClone(UIP_DEFAULT);
  for (const g of Object.keys(out)) if (saved[g] && typeof saved[g] === 'object') Object.assign(out[g], saved[g]);
  UIP = out; return out;
}
const U = (path) => { const [g, k] = path.split(/\.(.+)/); const v = (UIP || uipLoad())[g]?.[k]; return v === undefined ? true : v; };
function uipSet(path, v) {
  const [g, k] = path.split(/\.(.+)/); (UIP || uipLoad())[g][k] = v;
  try { localStorage.setItem('uiPrefs', JSON.stringify(UIP)); } catch { /* */ }
  applyUI();
}
// Menü: kullanıcının sırası (sonradan eklenen sayfalar varsayılan yerine), gizlenenler hariç
function navAll() {
  const order = U('nav.order') || [];
  const known = order.filter((r) => NAV.some((n) => n.r === r));
  NAV.forEach((n, i) => { if (!known.includes(n.r)) known.splice(Math.min(i, known.length), 0, n.r); });
  return known.map((r) => NAV.find((n) => n.r === r));
}
const navVisible = () => navAll().filter((n) => !(U('nav.hidden') || []).includes(n.r));
const tabMain = () => { const t = (U('nav.tabs') || TAB_MAIN_DEFAULT).filter((r) => NAV.some((n) => n.r === r)); return t.length ? t.slice(0, 4) : TAB_MAIN_DEFAULT; };
// html etiketindeki işaretler: CSS ile gizlenenler
function applyUI() {
  const de = document.documentElement; uipLoad();
  const flags = [];
  if (!U('top.cmdk')) flags.push('no-cmdk');
  if (!U('top.newPrint')) flags.push('no-newprint');
  if (!U('top.pbarLabels')) flags.push('no-pblabels');
  if (!U('nf.panel')) flags.push('no-nfpanel');
  if (!U('nav.badges')) flags.push('no-badges');
  if (!U('card.stockbtns')) flags.push('no-stockbtns');
  Object.keys(UIP_DEFAULT.tyo).forEach((k) => { if (!U('tyo.' + k)) flags.push('tyo-no-' + k); });
  de.dataset.ui = flags.join(' ');
  // data-uisec ile işaretli bölümler: kapatılanlar gizlenir; iki sütunlu satırda biri kapanırsa diğeri tam genişlik olur
  const off = [];
  for (const g of ['sec', 'card', 'cols']) for (const k of Object.keys(UIP_DEFAULT[g])) if (!U(`${g}.${k}`)) off.push(`${g}.${k}`);
  let st = $('#ui-hide'); if (!st) { st = document.createElement('style'); st.id = 'ui-hide'; document.head.appendChild(st); }
  st.textContent = off.map((k) => `[data-uisec="${k}"]{display:none!important}.two-col:has(>[data-uisec="${k}"]){grid-template-columns:1fr}`).join('');
  if (typeof renderNav === 'function' && $('#nav')) { renderNav(); renderPBar(); renderNotifs(); }
}
const route = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || '');

function renderNav() {
  const r = route() === 'urun' ? 'urunler' : route();
  const badge = (n) => {
    if (n.r === 'satis' && S.dash?.ty_unmatched) return `<span class="count">${S.dash.ty_unmatched}</span>`;
    if (n.r === 'baskilar') { const d = dueJobs().length; return d ? `<span class="count">${d}</span>` : ''; }
    if (n.r === 'iadeler' || n.r === 'sorular') { const pre = n.r === 'iadeler' ? 'claim:' : 'qna:', d = (S.notif?.items || []).filter((x) => !x.resolved_at && String(x.key).startsWith(pre)).length; return d ? `<span class="count${n.r === 'iadeler' ? ' bad' : ''}">${d}</span>` : ''; }
    if (n.r === 'buybox') { const d = (S.notif?.items || []).filter((x) => !x.resolved_at && String(x.key).startsWith('bb:')).length; return d ? `<span class="count bad">${d}</span>` : ''; }
    return '';
  };
  const vis = navVisible(), TAB_MAIN = tabMain();
  $('#nav').innerHTML = vis.map((n) => `<a class="nav-item${r === n.r ? ' active' : ''}" href="#/${n.r}">${icon(n.icon)}<span>${n.label}</span>${badge(n)}</a>`).join('');
  const more = vis.filter((n) => !TAB_MAIN.includes(n.r)).concat([{ r: 'ayarlar', label: 'Ayarlar', icon: 'gear' }]);
  const inMore = more.some((n) => n.r === r);
  const moreBadge = more.reduce((a, n) => a + (badge(n) ? 1 : 0), 0);
  $('#tabbar').innerHTML = TAB_MAIN.map((t) => NAV.find((n) => n.r === t)).filter(Boolean).map((n) => `<a class="${r === n.r ? 'active' : ''}" href="#/${n.r}">${icon(n.icon)}<span>${n.label}</span>${badge(n)}</a>`).join('')
    + `<a href="#" class="${inMore ? 'active' : ''}" data-act="more-menu">${icon('more')}<span>${inMore ? esc(more.find((n) => n.r === r).label) : 'Daha'}</span>${moreBadge ? '<span class="count">!</span>' : ''}</a>`;
  S.moreItems = more.map((n) => ({ ...n, badge: badge(n) }));
  $('.settings-link').classList.toggle('active', r === 'ayarlar');
}

// ------------------------------------------------------------------ marka (Ayarlar'dan ad / logo)
const appName = () => S.settings?.app_name || 'Astera';
function applyBrand() {
  const st = S.settings || {};
  $('#brand-name').textContent = appName();
  const tag = $('#brand-tag'); tag.textContent = st.app_tagline ?? 'Management'; tag.hidden = !tag.textContent;
  const mark = $('#brand-mark');
  if (st.app_logo) { mark.classList.add('logo'); mark.innerHTML = `<img src="${esc(st.app_logo)}" alt="">`; }
  else if (mark.classList.contains('logo')) { mark.classList.remove('logo'); mark.innerHTML = '<i></i><i></i><i></i><i></i>'; }
  let fav = document.querySelector('link[rel="icon"]');
  fav.href = st.app_logo || '/static/icon.svg';
  fav.type = st.app_logo ? '' : 'image/svg+xml';
}

// ------------------------------------------------------------------ data loading
async function loadProducts() { S.products = await api('GET', '/api/products'); }
async function loadJobs() { S.jobs = await api('GET', '/api/jobs'); renderPBar(); }
async function loadDash() { S.dash = await api('GET', '/api/dashboard'); }
async function loadOrders() { S.orders = await api('GET', '/api/orders'); }
async function loadSettings() { S.settings = await api('GET', '/api/settings'); applyBrand(); renderPBar(); }
const productById = (id) => S.products.find((p) => p.id === id);

async function syncTime() {
  try { const t = await api('GET', '/api/time'); S.offset = t.now - Math.floor(Date.now() / 1000); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ router
const PAGES = {};
async function render() {
  const r = route();
  const page = PAGES[r] || PAGES[''];
  const nav = NAV.find((n) => n.r === r);
  $('#page-title').textContent = page.title?.() || (r === 'ayarlar' ? 'Ayarlar' : (nav ? nav.title : 'Pano'));
  document.title = ($('#page-title').textContent) + ' · ' + appName();
  renderNav();
  try { await page.load?.(); } catch (e) { fail(e); }
  if (route() !== r) return;
  if (page.title) { $('#page-title').textContent = page.title(); document.title = page.title() + ' · ' + appName(); }
  const swap = () => { $('#view').innerHTML = page.html(); page.after?.(); tick(); };
  const isNav = S.lastRoute !== r;
  S.lastRoute = r;
  document.documentElement.dataset.vt = isNav ? 'page' : 'update';
  // Sayfa geçişinde View Transition kullanılmaz: tarayıcı tüm sayfanın (yüzlerce ürün kartı) anlık görüntüsünü alırken
  // ekran ~1 sn donuyordu. Onun yerine yalnızca içerik alanı hafifçe kayarak gelir (ucuz, GPU'da).
  // Aynı sayfadaki güncellemelerde (sıralama, stok değişimi) kartların yer değiştirme animasyonu, sayfada az öğe varsa kalır.
  const named = isNav ? Infinity : document.querySelectorAll('#view [style*="view-transition-name"]').length;
  if (document.startViewTransition && S.booted && !REDUCED() && named <= 48) {
    const t = document.startViewTransition(swap);
    t.ready.catch(() => {}); t.finished.catch(() => {});
    await t.updateCallbackDone.catch(() => {});
  } else {
    swap();
    if (isNav && S.booted && !REDUCED()) { const v = $('#view'), h = $('#page-title'); for (const el of [v, h]) { if (!el) continue; el.classList.remove('page-in'); void el.offsetWidth; el.classList.add('page-in'); const end = (e) => { if (e.target !== el) return; el.classList.remove('page-in'); el.removeEventListener('animationend', end); }; el.addEventListener('animationend', end); } }
  }
  if (isNav) animateIn();
}
const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Bilgisayarda uzun listeler ekran yüksekliğinde kendi içinde kayar; üstteki sekmeler ve arama yerinde kalır.
// Telefonda iç içe kaydırma zor olduğundan liste normal akar, üst bar yapışır (CSS).
function fitBoxes() {
  const desk = window.matchMedia('(min-width: 761px)').matches, H = window.innerHeight;
  const tb = document.querySelector('.topbar'), bb = document.getElementById('bambu-events');
  const bbh = bb ? bb.offsetHeight : 0;
  document.documentElement.style.setProperty('--bbh', `${bbh}px`);
  if (tb) document.documentElement.style.setProperty('--tbh', `${tb.offsetHeight + bbh}px`);
  const Z = ZF();
  $$('.fitbox').forEach((el) => {
    if (!desk) { el.style.maxHeight = ''; return; }
    const top = el.getBoundingClientRect().top + window.scrollY * Z;
    el.style.maxHeight = `${Math.max(380, top < H * 0.6 ? H - top - 24 : H - 120) / Z}px`;
  });
}
let fitRaf = 0;
const fitSoon = () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(fitBoxes); };
window.addEventListener('resize', fitSoon);
new MutationObserver(fitSoon).observe(document.getElementById('view') || document.body, { childList: true, subtree: true });

// Sayfa ilk açıldığında sayılar sıfırdan yükselir (oturumda bir kez)
function animateIn() {
  if (REDUCED()) return;
  if (route() === '' && !S.countedUp) {
    S.countedUp = true;
    $$('.readout b').forEach((b) => {
      const node = b.firstChild; if (!node || node.nodeType !== 3) return;
      const end = parseFloat(node.textContent.replace(',', '.')); if (!isFinite(end) || end === 0) return;
      const dec = node.textContent.includes('.') ? 1 : 0, t0 = performance.now(), dur = 700;
      const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); node.textContent = (end * e).toFixed(dec); if (k < 1) requestAnimationFrame(step); };
      node.textContent = (0).toFixed(dec); requestAnimationFrame(step);
    });
  }
}
window.addEventListener('hashchange', () => { closePalette(); render(); window.scrollTo(0, 0); });

// ------------------------------------------------------------------ shared bits
function thumbStyle(url) { return url ? `--img:url('${esc(url)}')` : ''; }
function miniThumb(url) { return `<span class="mini-thumb${url ? '' : ' none'}" style="${thumbStyle(url)}"></span>`; }
function spools(mats, max = 6) {
  return `<span class="spools">${(mats || []).slice(0, max).map((m) => `<span class="spool${swatchCls(m.color_hex)}" style="${swatchStyle(m.color_hex)}" title="${esc([m.color_name || colorName(m.color_hex), m.brand].filter(Boolean).join(' · '))}"></span>`).join('')}</span>`;
}
function stockClass(p) { return p.stock < 0 ? 'neg' : (p.min_stock > 0 && p.stock <= p.min_stock ? 'low' : ''); }

function stackHTML(job, cls = '') {
  const img = job.thumbnail;
  const p = productById(job.product_id);
  const c = p?.materials?.[0]?.color_hex || job.component_color;
  return `<div class="stack ${job.print_type || ''} ${img ? '' : 'noimg'} ${cls}" data-stack="${job.id}" style="${c && c !== 'transparent' ? `--c:${c};` : ''}">
    <div class="ghost" style="${img ? `background-image:url('${esc(img)}')` : ''}"></div>
    <div class="fill" style="${img ? `background-image:url('${esc(img)}')` : ''}"></div>
    <div class="nozzle"><i class="head"></i></div><div class="uv"></div></div>`;
}

// ---------- makineler: fotoğraf yoksa türüne göre çizilmiş küçük ikon
const PRINTER_KINDS = { open: 'Açık FDM', enclosed: 'Kapalı kasa FDM', resin: 'Reçine (SLA)' };
const PRINTER_SVG = {
  open: `<svg viewBox="0 0 40 40" class="pr-ill"><rect x="5" y="31" width="30" height="5" rx="1.5" class="pr-body"/><rect x="7" y="6" width="3.5" height="26" rx="1" class="pr-body"/><rect x="7" y="9" width="24" height="3" rx="1" class="pr-body"/><rect x="18" y="11.5" width="6" height="6" rx="1" class="pr-head"/><rect x="12" y="27" width="20" height="2.5" rx=".8" class="pr-bed"/><rect x="19" y="22" width="4" height="5" rx=".6" class="pr-part"/></svg>`,
  enclosed: `<svg viewBox="0 0 40 40" class="pr-ill"><rect x="6" y="4" width="28" height="32" rx="3" class="pr-body"/><rect x="9.5" y="7.5" width="21" height="22" rx="1.5" class="pr-glass"/><rect x="16" y="10" width="8" height="4.5" rx="1" class="pr-head"/><rect x="12" y="25" width="16" height="2" rx=".6" class="pr-bed"/><rect x="17.5" y="20" width="5" height="5" rx=".6" class="pr-part"/><rect x="14" y="31.5" width="12" height="2" rx="1" class="pr-glass"/></svg>`,
  resin: `<svg viewBox="0 0 40 40" class="pr-ill"><rect x="7" y="26" width="26" height="10" rx="2" class="pr-body"/><path d="M10 26V12a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v14z" class="pr-lid"/><rect x="15" y="11" width="10" height="2.4" rx=".8" class="pr-head"/><rect x="18.8" y="13" width="2.4" height="5" class="pr-head"/><rect x="16" y="18" width="8" height="4" rx=".6" class="pr-part"/><rect x="15" y="30" width="10" height="2" rx="1" class="pr-glass"/></svg>`,
};
const printerInfo = (name) => (S.settings?.printers || []).find((p) => p.name === name) || (name ? { name, kind: 'open', image: null } : null);
function printerThumb(name, cls = '') {
  const p = printerInfo(name);
  if (!p) return '';
  return `<span class="pr-thumb ${cls} pr-${p.kind}" title="${esc(p.name)}">${p.image ? `<img src="${esc(p.image)}" alt="">` : PRINTER_SVG[p.kind] || PRINTER_SVG.open}</span>`;
}
function printerChips(id, selected) {
  const list = S.settings?.printers || [];
  return list.map((x) => `<button type="button" class="chip pchip${x.name === selected ? ' on' : ''}" data-v="${esc(x.name)}">${printerThumb(x.name, 'xs')}${esc(x.name)}</button>`).join('');
}

// ---------- çok parçalı ürünler
function partDot(p, partId) {
  if (!p || p.parts_same_color) return '';
  const x = (p.parts || []).find((q) => q.id === partId);
  return x?.color_hex ? `<span class="spool sm${swatchCls(x.color_hex)}" style="${swatchStyle(x.color_hex)}" title="${esc([x.color_name || colorName(x.color_hex), x.brand].filter(Boolean).join(' · '))}"></span>` : '';
}
function spoolsLine(j) {
  if (!j.spools?.length) return '';
  return `<div class="job-spools">${j.spools.map((x) => `<span class="js-chip" title="${esc([x.brand, x.material, x.color_name].filter(Boolean).join(' · '))} · ${Math.round(x.grams || 0)} g">
    <span class="spool${swatchCls(x.color_hex || '#ccc')}" style="${swatchStyle(x.color_hex || '#ccc')}"></span>#${esc(x.code)}</span>`).join('')}</div>`;
}
function partsLine(j) {
  if (!j.parts?.length) return '';
  const p = productById(j.product_id);
  const pieces = j.parts.reduce((a, x) => a + x.quantity, 0);
  const total = p?.parts_total || 0;
  const left = p ? p.parts_missing_after_print : null;
  const done = left === 0;
  return `<div class="parts-line"><span>${j.parts.map((x) => `${partDot(p, x.part_id)}${esc(x.name)} ×${x.quantity}`).join(', ')}</span>
    ${p ? `<span class="${done ? 'ok' : ''}">${pieces} parça bu baskıda · ${done ? 'set tamamlanıyor' : `${left}/${total} parça kaldı`}</span>` : ''}</div>`;
}
const jobProgress = (j) => j.bambu_task && j.bambu_percent != null && j.bambu_state !== 'FINISH'
  ? clamp(j.bambu_percent / 100, 0, 1)
  : clamp((nowS() - j.started_at) / Math.max(1, j.ends_at - j.started_at), 0, 1);
function bambuLine(j) {
  if (!j.bambu_task) return '';
  const st = j.bambu_state;
  const lbl = st === 'PAUSE' ? '<b class="bl-pause">Duraklatıldı</b>' : st === 'FAILED' ? '<b class="bl-fail">Yazıcı hata bildirdi</b>' : st === 'FINISH' ? '<b>Yazıcı bitirdi</b>' : st === 'PREPARE' ? 'Hazırlanıyor' : 'Canlı';
  const layer = j.bambu_layer && j.bambu_layer !== '0/0' ? ` · katman ${esc(j.bambu_layer)}` : '';
  return `<div class="bambu-line"><i class="bl-dot ${st === 'PAUSE' ? 'pause' : st === 'FAILED' ? 'fail' : ''}"></i>${lbl}${j.bambu_percent != null ? ` · %${j.bambu_percent}` : ''}${layer}</div>`;
}
// Yazıcıya bağlı baskı, yazıcı hâlâ basıyor diyorsa süresi geçse de bitmiş sayılmaz (hız artırılmış, son katmanlar)
const PRINTER_ACTIVE = new Set(['RUNNING', 'PREPARE', 'PAUSE', 'SLICING']);
const jobDone = (j) => j.status === 'printing' && j.ends_at <= nowS() && !(j.bambu_task && PRINTER_ACTIVE.has(j.bambu_state));
const dueJobs = () => S.jobs.filter(jobDone);

// ================================================================== DASHBOARD
PAGES[''] = {
  async load() {
    const [, , , log, colors, , hist] = await Promise.all([loadDash(), loadJobs(), loadProducts(), api('GET', '/api/log?limit=12'), api('GET', '/api/materials-summary'), loadOrders(),
      api('GET', '/api/jobs?status=history&limit=60').catch(() => S.history || []), loadPlan().catch(() => null)]);
    S.log = log; S.colors = colors; S.history = hist;
    S.issues = S.dash?.stock_issues ? await api('GET', '/api/stock-issues').catch(() => []) : [];
    renderNav();
  },
  after() {
    if (S.settings?.ty_seller_id && (!S.pick || Date.now() - (S.pickAt || 0) > 120000)) loadPick(true);
    if (S.dashEdit) bindDashDrag();
  },
  html() {
    const layout = dashLayout(), editing = !!S.dashEdit;
    return `<div class="dash-tools">${editing
        ? `<span class="muted">Bölümleri sürükleyin ya da oklarla taşıyın. Düzen bu cihaza kaydedilir.</span><span class="spacer"></span><button class="btn btn-sm btn-ghost" data-act="dash-reset">Varsayılana dön</button><button class="btn btn-sm btn-primary" data-act="dash-edit">Bitti</button>`
        : `<span class="spacer"></span><button class="btn btn-sm btn-ghost" data-act="dash-edit">${icon('edit')} Panoyu düzenle</button>`}</div>
      ${editing ? '' : issuesHTML()}
      <div class="dash-grid${editing ? ' editing' : ''}">${layout.map((L, i) => {
        if (L.hidden && !editing) return '';
        const body = DASH_SECTIONS[L.id].html();
        if (!body && !editing) return '';
        return `<div class="dash-sec w-${L.w}${L.hidden ? ' is-hidden' : ''}" data-sec="${L.id}" style="view-transition-name:sec-${L.id}" ${editing ? 'draggable="true"' : ''}>
          ${editing ? `<div class="dash-edit-bar"><span class="grip" aria-hidden="true">⠿</span><b>${DASH_SECTIONS[L.id].title}</b><span class="spacer"></span>
            <button class="icon-btn" data-act="dash-move" data-i="${i}" data-d="-1" aria-label="Yukarı" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-btn" data-act="dash-move" data-i="${i}" data-d="1" aria-label="Aşağı" ${i === layout.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn btn-sm" data-act="dash-width" data-i="${i}" title="Genişliği değiştir">Genişlik: ${DASH_W[L.w]}</button>
            <button class="btn btn-sm" data-act="dash-hide" data-i="${i}">${L.hidden ? 'Göster' : 'Gizle'}</button></div>` : ''}
          ${body || `<div class="panel dash-empty"><span class="muted">${DASH_SECTIONS[L.id].title}: şu an gösterilecek bir şey yok</span></div>`}
        </div>`;
      }).join('')}</div>`;
  },
};

// ---------- pano bölümleri: sırası, genişliği ve görünürlüğü cihaz başına kaydedilir
const DASH_SECTIONS = {
  timeline: { title: 'Makine çizelgesi', w: 'full', html: () => timelineHTML() },
  plan: { title: 'Plan: sıradaki baskılar', w: 'full', html: () => planDashHTML() },
  bed: { title: 'Tablada (aktif baskılar)', w: 'full', html: () => bedHTML() },
  terms: { title: 'Yaklaşan terminler', w: 'full', html: () => termsPanel() },
  ty: { title: 'Trendyol · basılması gerekenler', w: 'full', html: () => tyDashHTML() },
  readout: { title: 'Özet sayılar', w: 'full', html: () => readoutHTML() },
  low: { title: 'Stoğu azalanlar', w: 'half', html: () => lowHTML() },
  log: { title: 'Son stok hareketleri', w: 'half', html: () => `<section class="panel"><div class="panel-h"><h2>Son stok hareketleri</h2></div><div class="panel-b">${logList(S.log)}</div></section>` },
  colors: { title: 'Kullanılan renkler', w: 'full', html: () => colorsHTML() },
};
const DASH_DEFAULT = ['plan', 'timeline', 'bed', 'terms', 'ty', 'readout', 'low', 'log', 'colors'];
const DASH_W = { full: 'Tam', half: 'Yarım', third: 'Üçte bir' };
function dashLayout() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('dashLayout') || '[]'); } catch { saved = []; }
  const out = saved.filter((x) => DASH_SECTIONS[x.id]).map((x) => ({ id: x.id, w: DASH_W[x.w] ? x.w : 'full', hidden: !!x.hidden }));
  // sonradan eklenen bölüm: varsayılan sırasındaki yerine
  DASH_DEFAULT.forEach((id, i) => { if (!out.some((x) => x.id === id)) out.splice(Math.min(i, out.length), 0, { id, w: DASH_SECTIONS[id].w, hidden: false }); });
  return out;
}
function saveDashLayout(l) { try { localStorage.setItem('dashLayout', JSON.stringify(l)); } catch { /* */ } render(); }
function bindDashDrag() {
  let dragId = null;
  $$('.dash-sec').forEach((el) => {
    el.addEventListener('dragstart', (e) => { dragId = el.dataset.sec; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); $$('.dash-sec').forEach((x) => x.classList.remove('drop-before')); });
    el.addEventListener('dragover', (e) => { e.preventDefault(); $$('.dash-sec').forEach((x) => x.classList.toggle('drop-before', x === el && x.dataset.sec !== dragId)); });
    el.addEventListener('drop', (e) => {
      e.preventDefault(); if (!dragId || dragId === el.dataset.sec) return;
      const l = dashLayout(); const from = l.findIndex((x) => x.id === dragId); const [item] = l.splice(from, 1);
      l.splice(l.findIndex((x) => x.id === el.dataset.sec), 0, item); saveDashLayout(l);
    });
  });
}
function readoutHTML() {
  const d = S.dash || {};
  return `<div class="readout">
    <div><b>${d.stock_total ?? 0}</b><span>Stoktaki ürün adedi</span></div>
    <div><b>${d.in_production ?? 0}</b><span>Şu an üretimde</span></div>
    <div><b>${d.sold_24h ?? 0}</b><span>Son 24 saatte satılan</span></div>
    <div><b>${d.printed_7d ?? 0}</b><span>7 günde basılan</span></div>
    <div class="${d.failed_7d ? 'neg' : ''}"><b>${d.failed_7d ?? 0}</b><span>7 günde başarısız baskı</span></div>
    <div><b>${Math.round((d.grams_7d || 0) / 100) / 10 || 0}<small style="font-size:18px"> kg</small></b><span>7 günde harcanan malzeme</span></div>
  </div>`;
}
function lowHTML() {
  const low = S.products.filter((p) => p.stock < 0 || (p.min_stock > 0 && p.stock <= p.min_stock))
    .sort((a, b) => (a.stock - a.min_stock) - (b.stock - b.min_stock)).slice(0, 8);
  return `<section class="panel"><div class="panel-h"><h2>Stoğu azalanlar</h2><a class="btn btn-ghost btn-sm" href="#/urunler">Tüm ürünler</a></div>
    <div class="panel-b">${low.length ? `<ul class="lst">${low.map((p) => {
      const pct = p.min_stock > 0 ? clamp(p.stock / p.min_stock, 0, 1) * 100 : 0;
      return `<li>${miniThumb(p.thumbnail)}<div class="grow"><div class="t">${esc(p.name)}</div>
        <div class="meter ${p.stock < 0 ? 'neg' : ''}"><i style="width:${p.stock < 0 ? 100 : pct}%"></i></div>
        <div class="s">${p.stock < 0 ? `${-p.stock} adet satıldı ama stokta yok` : `${p.stock} / en az ${p.min_stock}`}${p.in_production ? ` · ${p.in_production} baskıda` : ''}</div></div>
        <button class="btn btn-sm" data-act="print-product" data-id="${p.id}">Bas</button></li>`;
    }).join('')}</ul>` : `<p class="muted" style="margin:6px 0 0">Minimum stok seviyesinin altına düşen ürün yok. Ürün kartlarında "En az stok" değeri girerseniz burada uyarı görürsünüz.</p>`}</div></section>`;
}
function colorsHTML() {
  if (!S.colors.length) return '';
  return `<section class="panel"><div class="panel-h"><h2>Kullanılan renkler</h2><span class="muted" style="font-size:13px">Ürün sayısına göre</span></div>
    <div class="panel-b"><div class="colors">${S.colors.slice(0, 24).map((c) => `<span class="color-chip"><span class="spool${swatchCls(c.color_hex)}" style="${swatchStyle(c.color_hex)}"></span>${esc(c.color_name || colorName(c.color_hex) || c.color_hex)}${c.brand ? ` <span class="muted">${esc(c.brand)}</span>` : ''} <b>${c.products}</b></span>`).join('')}</div></div></section>`;
}

function termsPanel() {
  const open = S.orders.filter((o) => ['new', 'printing', 'ready'].includes(o.status) && o.due_date)
    .map((o) => ({ o, d: dueLabel(o) })).filter((x) => x.d.days <= 5)
    .sort((a, b) => a.d.days - b.d.days).slice(0, 8);
  if (!open.length) return '';
  return `<section class="panel"><div class="panel-h"><h2>Yaklaşan terminler</h2><a class="btn btn-ghost btn-sm" href="#/siparisler">Siparişler</a></div>
    <div class="panel-b"><ul class="lst">${open.map(({ o, d }) => `<li>${miniThumb(o.image)}<div class="grow">
      <div class="t">${esc(o.first_name)} ${esc(o.last_name || '')}${o.title ? ` <span class="muted" style="font-weight:500">· ${esc(o.title)}</span>` : ''}</div>
      <div class="s">${OST[o.status].l} · ${o.quantity} adet${o.printer ? ' · ' + esc(o.printer) : ''} · ${d.html}</div></div>
      ${o.status === 'new' ? `<button class="btn btn-sm" data-act="order-advance" data-id="${o.id}">Baskıya al</button>` : ''}</li>`).join('')}</ul></div></section>`;
}

function bedHTML() {
  const jobs = S.jobs.filter((j) => j.status === 'printing');
  if (!jobs.length) {
    return `<section class="bed"><div class="bed-h"><h2>Tabla boş</h2></div>
      <div class="bed-empty"><p>Şu an basılan bir şey yok. Baskıyı başlattığınızda burada katman katman ilerlediğini ve kalan süreyi görürsünüz.</p>
      <button class="btn btn-lg" data-act="new-print">${icon('plus')} Yeni baskı başlat</button></div></section>`;
  }
  const machines = new Set(jobs.map((j) => j.printer).filter(Boolean)).size;
  return `<section class="bed"><div class="bed-h"><h2>Tablada</h2><span class="muted">${jobs.length} baskı${machines ? ` · ${machines} makinede` : ''}</span></div>
    <div class="bed-row">${jobs.map((j) => `<article class="job" data-job="${j.id}" style="view-transition-name:job-${j.id}">
      <div class="job-visual">${stackHTML(j)}${printerThumb(j.printer, 'badge')}</div>
      <div><div class="job-name">${j.is_order ? '<span class="tag tag-order" style="vertical-align:1px">Özel</span> ' : ''}${esc(j.product_name)}</div>
        ${bambuLine(j)}
        <div class="job-meta">${j.parts?.length ? `${j.quantity} parça` : `${j.quantity} adet`}${j.printer ? ' · ' + esc(j.printer) : ''} · bitiş ${fmtClock(j.ends_at)}</div>
        ${partsLine(j)}${spoolsLine(j)}
        <div class="job-time" data-countdown="${j.id}"></div>
        <div class="job-actions" data-due-actions="${j.id}"></div>
      </div></article>`).join('')}</div></section>`;
}

const REASONS = { print: 'Baskı', trendyol: 'Trendyol', manual: 'Elle', sale: 'Satış', scan: 'Barkod', adjust: 'Sayım', order: 'Sipariş' };
// ---------- bildirim merkezi: geniş ekranda sağ panel, dar ekranda zil + çekmece
const NOTIF_KIND = { printer: ['layers', 'Yazıcı'], print_done: ['check', 'Baskı'], trendyol: ['cart', 'Trendyol'], stock: ['alert', 'Stok'], report: ['chart', 'Rapor'], claim: ['return', 'İade'], question: ['chat', 'Soru'] };
async function loadNotifs() {
  try {
    const d = await api('GET', '/api/notifications');
    const before = new Set((S.notif?.items || []).filter((n) => !n.resolved_at).map((n) => n.id));
    const fresh = S.notif ? d.items.filter((n) => !n.resolved_at && !before.has(n.id)) : [];
    S.notif = d; renderNotifs(); renderNav();
    if (fresh.length) {
      const bell = $('#notif-bell'); bell?.classList.remove('ring'); void bell?.offsetWidth; bell?.classList.add('ring');
      const hid = U('nf.hide') || [], has = (k) => fresh.some((n) => n.kind === k && !hid.includes(k));
      if (U('nf.sound')) { if (has('claim')) soundClaim(); else if (has('question')) soundQuestion(); else if (has('printer') || has('print_done')) beepShort(); }
      if (!window.matchMedia('(min-width: 1600px)').matches) toast(fresh.length > 1 ? `${fresh.length} yeni bildirim` : fresh[0].title, { action: 'Göster', onAction: () => notifOpen(true) });
    }
  } catch { /* sunucu geçici olarak erişilemez */ }
}
function notifItem(n) {
  const [ic, kl] = NOTIF_KIND[n.kind] || ['bell', ''];
  const done = !!n.resolved_at;
  const ign = !done && n.action?.t === 'job';
  return `<div class="nf-w${ign ? ' has-ign' : ''}"><button type="button" class="nf ${done ? 'done' : 'live'} lv-${n.level || 'info'}" data-nf="${n.id}">
    <span class="nf-ic">${icon(ic)}</span>
    <span class="nf-tx"><b>${esc(n.title || '')}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}
      <small class="nf-t">${kl} · ${fmtWhen(n.updated_at || n.created_at)}${done ? ` · ${n.resolved_by === 'user' ? 'kapatıldı' : 'çözüldü'}` : ''}</small></span></button>
    ${ign ? `<button type="button" class="btn btn-sm btn-ghost nf-ign" data-nf-ign="${n.action.id}" data-nid="${n.id}" title="Baskı hiç açılmamış gibi silinir: stok, fire ve makara değişmez">Yoksay</button>` : ''}</div>`;
}
// "Baskı bitti" uyarısını yok say: baskı kaydı silinir, stok / fire / makara değişmez
async function ignoreJob(jid, nid) {
  if (!confirm('Bu baskı yok sayılsın mı?\n\nKayıt hiç açılmamış gibi silinir: stoğa eklenmez, başarısız sayılmaz, makaradan düşülmez.')) return false;
  try {
    await api('POST', `/api/jobs/${jid}/ignore`);
    if (S.notif && nid) { const n = S.notif.items.find((x) => x.id === +nid); if (n && !n.resolved_at) { n.resolved_at = nowS(); n.resolved_by = 'user'; } renderNotifs(); }
    toast('Baskı yok sayıldı'); await loadJobs(); render(); loadNotifs();
    return true;
  } catch (e) { fail(e); return false; }
}
function renderNotifs() {
  const el = $('#notif-panel'); if (!el) return;
  const d0 = S.notif || { items: [], active: 0 }, f = S.nfFilter || 'all', hk = U('nf.hide') || [];
  const items = d0.items.filter((n) => !hk.includes(n.kind));
  const d = { items, active: items.filter((n) => !n.resolved_at).length };
  const list = d.items.filter((n) => f === 'all' || n.kind === f || (f === 'printer' && n.kind === 'print_done'));
  const act = list.filter((n) => !n.resolved_at), old = list.filter((n) => n.resolved_at);
  el.innerHTML = `<div class="nf-head"><h2>Bildirimler${d.active ? ` <span class="nf-count">${d.active}</span>` : ''}</h2>
      ${d.active ? '<button class="btn btn-ghost btn-sm" data-act="nf-all">Hepsini kapat</button>' : ''}
      <button class="icon-btn nf-close" data-act="nf-close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="chips nf-filter">${[['all', 'Tümü'], ['printer', 'Yazıcı'], ['trendyol', 'Trendyol'], ['stock', 'Stok']].filter(([v]) => v === 'all' || !hk.includes(v)).map(([v, l]) => `<button class="chip${f === v ? ' on' : ''}" data-act="nf-filter" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="nf-list">${act.length ? act.map(notifItem).join('') : '<p class="nf-empty">Bekleyen bildirim yok.</p>'}
      ${old.length ? `<div class="nf-sep">Geçmiş (7 gün)</div>${old.slice(0, 60).map(notifItem).join('')}` : ''}</div>`;
  const c = $('#nb-count'); if (c) { c.hidden = !d.active; c.textContent = d.active > 99 ? '99+' : d.active; }
  $('#notif-bell')?.classList.toggle('has', !!d.active);
}
function notifOpen(open) { document.body.classList.toggle('nf-open', open); }
function notifBind() {
  $('#notif-bell')?.addEventListener('click', () => notifOpen(!document.body.classList.contains('nf-open')));
  $('#notif-scrim')?.addEventListener('click', () => notifOpen(false));
  $('#notif-panel')?.addEventListener('click', async (e) => {
    const ig = e.target.closest('[data-nf-ign]');
    if (ig) { ig.disabled = true; await ignoreJob(+ig.dataset.nfIgn, ig.dataset.nid); ig.disabled = false; return; }
    const b = e.target.closest('[data-nf]'); if (!b) return;
    const n = S.notif?.items.find((x) => x.id === +b.dataset.nf); if (!n) return;
    if (!n.resolved_at) { n.resolved_at = Math.floor(Date.now() / 1000); n.resolved_by = 'user'; S.notif.active = Math.max(0, S.notif.active - 1); renderNotifs(); api('POST', `/api/notifications/${n.id}/resolve`).catch(() => {}); }
    const a = n.action || {};
    if (!window.matchMedia('(min-width: 1600px)').matches) notifOpen(false);
    if (a.t === 'bambu') { if (!S.bambu) await loadBambu(); const ev = S.bambu?.events?.find((x) => x.id === a.id); if (ev) openFromBambu(ev); else toast('Bu baskı artık beklemiyor'); }
    else if (a.t === 'job') { await loadJobs(); if (S.jobs.some((j) => j.id === a.id && j.status === 'printing')) openResult(a.id); else toast('Bu baskının sonucu zaten girilmiş'); }
    else if (a.t === 'product') openProductEditor(a.id);
    else if (a.t === 'plan') planStart(a);
    else if (a.t === 'spool') { location.hash = '#/filament'; setTimeout(() => openSpoolEditor(a.id), 400); }
    else if (a.href) location.hash = a.href;
  });
}

// ---------- sayım farkları: stok 0'ın altına inmek istediğinde kaydedilenler
const ISSUE_SRC = { trendyol: 'Trendyol siparişi', scan: 'Barkod okutma', sale: 'Elle satış', order: 'Sipariş', adjust: 'Eski eksi stok' };
function issuesHTML() {
  const L = S.issues || []; if (!L.length) return '';
  const showAll = S.issuesAll || L.length <= 3, shown = showAll ? L : L.slice(0, 3);
  return `<section class="panel issues"><div class="panel-h"><h2>${icon('alert')} Kontrol edilecekler <span class="n bad">${L.length}</span></h2>
      <button class="btn btn-ghost btn-sm" data-act="issue-all">Hepsini kapat</button></div>
    <div class="panel-b"><p class="muted" style="margin:0 0 10px;font-size:13px">Bu ürünler sistemde 0 görünürken satıldı ya da paketlendi; stok eksiye düşürülmedi, fark burada. Rafı sayıp doğru adedi girin.</p>
    <ul class="lst issue-list">${shown.map((x) => `<li>${miniThumb(x.thumbnail)}<div class="grow"><div class="t">${esc(x.name)} <span class="tag tag-bad">${x.shortfall} adet sistemde yoktu</span></div>
        <div class="s">${ISSUE_SRC[x.reason] || x.reason}${x.ref ? ' · ' + esc(x.ref) : ''} · ${fmtWhen(x.created_at)} · şu an stok ${x.stock}</div>
        <ul class="hints">${x.hints.map((h, i) => `<li class="${i ? '' : 'first'}">${esc(h.text)}</li>`).join('')}</ul></div>
        <div class="issue-act"><label class="input-group sm"><input class="input" type="number" min="0" inputmode="numeric" placeholder="raftaki" data-issue-count="${x.id}" data-pid="${x.product_id}" aria-label="Raftaki adet"><span class="suffix">adet</span></label>
          <button class="btn btn-sm btn-primary" data-act="issue-count" data-id="${x.id}">Kaydet</button><button class="btn btn-sm btn-ghost" data-act="issue-ok" data-id="${x.id}">Tamam</button></div></li>`).join('')}</ul>
    ${showAll ? '' : `<button class="btn btn-ghost btn-sm" data-act="issue-more">${L.length - 3} tane daha göster</button>`}</div></section>`;
}
async function issueRefresh() { await loadDash(); S.issues = S.dash?.stock_issues ? await api('GET', '/api/stock-issues') : []; render(); }
function logList(log) {
  if (!log.length) return `<p class="muted" style="margin:6px 0 0">Henüz stok hareketi yok.</p>`;
  return `<ul class="lst">${log.map((l) => `<li>${miniThumb(l.thumbnail)}<div class="grow"><div class="t">${esc(l.product_name || 'Silinmiş ürün')}</div>
    <div class="s">${REASONS[l.reason] || l.reason}${l.ref ? ' · ' + esc(l.ref) : ''}${l.note ? ' · ' + esc(l.note) : ''} · ${fmtWhen(l.created_at)}</div></div>
    ${l.shortfall > 0 ? `<span class="delta down" title="${l.shortfall} adet sistemde yoktu; stok 0'da durdu">−${l.shortfall - l.delta}<small>!</small></span>` : `<span class="delta ${l.delta > 0 ? 'up' : 'down'}">${l.delta > 0 ? '+' : ''}${l.delta}</span>`}</li>`).join('')}</ul>`;
}

// ================================================================== PRODUCTS
// Ortak parçalar (havuz) ve "Diğer amaçlı" kayıtlar aynı tabloda; istemcide ayrı listeler
async function loadComponents() {
  try { const all = await api('GET', '/api/components'); S.components = all.filter((c) => c.kind !== 'misc'); S.misc = all.filter((c) => c.kind === 'misc'); }
  catch { S.components = S.components || []; S.misc = S.misc || []; }
}
const compById = (id) => (S.components || []).find((c) => c.id === id) || (S.misc || []).find((c) => c.id === id);

PAGES.urunler = {
  async load() { await Promise.all([loadProducts(), loadJobs(), loadComponents(), loadProfit().catch(() => null)]); },
  html() {
    const f = S.pf;
    const tabs = `<div class="seg ptabs"><button class="${f.tab !== 'comp' ? 'on' : ''}" data-act="pf-tab" data-v="prod">Ürünler <span class="faint">${S.products.length}</span></button>
      <button class="${f.tab === 'comp' ? 'on' : ''}" data-act="pf-tab" data-v="comp" title="Ortak parçalar">Ortak <span class="faint">${(S.components || []).length}</span></button>
      <button class="${f.tab === 'misc' ? 'on' : ''}" data-act="pf-tab" data-v="misc" title="Diğer amaçlı baskılar">Diğer <span class="faint">${(S.misc || []).length}</span></button></div>`;
    if (f.tab === 'misc') return `<div class="toolbar">${tabs}<span class="spacer"></span><button class="btn btn-primary" data-act="new-misc">${icon('plus')} Diğer amaçlı ekle</button></div>${miscHTML()}`;
    if (f.tab === 'comp') return `<div class="toolbar">${tabs}<span class="spacer"></span><button class="btn btn-primary" data-act="new-comp">${icon('plus')} Ortak parça ekle</button></div>${componentsHTML()}`;
    const PSORTS = [['name', 'Ada göre'], ['last_order', 'Son sipariş gelen'], ['created', 'Son eklenen'], ['best', 'Çok satan (30 gün)'], ['runout', 'Bitmek üzere'], ['margin', 'Kâr marjı'], ['stock_asc', 'Stok: azdan çoğa'], ['stock_desc', 'Stok: çoktan aza'], ['recent', 'Son güncellenen']];
    return `<div class="toolbar ptool">${tabs}
        <label class="search">${icon('search')}<input class="input" id="pq" placeholder="Ürün, dosya veya barkod ara" value="${esc(f.q)}" autocomplete="off"></label>
        <details class="fmenu" id="pf-menu"><summary class="btn" id="pf-btn">${pfBtnInner()}</summary><div class="fmenu-pop" id="pf-pop">${pfMenuHTML()}</div></details>
        <label class="psort" title="Sıralama">${icon('sort')}<select class="input" id="psort" aria-label="Sırala">${PSORTS.map(([v, l]) => `<option value="${v}"${f.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="seg pview" role="group" aria-label="Görünüm">
          <button class="${f.view === 'grid' ? 'on' : ''}" data-act="pf-view" data-v="grid" aria-label="Kart görünümü">${icon('grid')}</button>
          <button class="${f.view === 'list' ? 'on' : ''}" data-act="pf-view" data-v="list" aria-label="Liste görünümü">${icon('list')}</button>
        </div>
        <span class="spacer"></span>
        <button class="btn${S.psel ? ' on' : ''}" data-act="psel-mode" title="Birden çok ürün seç" aria-label="${S.psel ? 'Seçimi bitir' : 'Seç'}">${icon('check')}<span class="hide-sm"> ${S.psel ? 'Bitir' : 'Seç'}</span></button>
        <button class="btn" data-act="ty-products" title="Trendyol ürünleri" aria-label="Trendyol ürünleri">${icon('cart')}<span class="hide-md"> Trendyol</span></button>
        <button class="btn btn-primary" data-act="new-product" title="Ürün ekle" aria-label="Ürün ekle">${icon('plus')}<span class="hide-sm"> Ekle</span></button>
      </div>
      <div class="pf-active" id="pf-active">${pfActiveHTML()}</div>
      <div id="plist">${productListHTML()}</div>${pselBar()}`;
  },
  after() {
    $('#pq')?.addEventListener('input', (e) => { S.pf.q = e.target.value; $('#plist').innerHTML = productListHTML(); });
    $('#psort')?.addEventListener('change', (e) => { S.pf.sort = e.target.value; $('#plist').innerHTML = productListHTML(); });
    pselBind();
  },
};

// ---------- ortak parçalar (havuz)
function componentsHTML() {
  const list = S.components || [];
  if (!list.length) return `<div class="empty panel"><h3>Ortak parça yok</h3><p>Birden fazla üründe aynı olan parçaları (ör. kitap sırtı base'i) burada tanımlayın. Stokları tek havuzda tutulur; ürünün parça listesinde bu parçayı seçtiğinizde set tamamlanırken havuzdan çekilir.</p><button class="btn btn-primary" data-act="new-comp">${icon('plus')} Ortak parça ekle</button></div>`;
  return `<div class="pgrid">${list.map(compCard).join('')}</div>`;
}
function compCard(c) {
  const low = c.min_stock > 0 && c.stock <= c.min_stock;
  return `<article class="pcard comp" data-cid="${c.id}">
    <button class="thumb${c.thumbnail ? '' : ' none'}" style="${thumbStyle(c.thumbnail)}" data-initial="${esc((c.name || '?')[0].toLocaleUpperCase('tr'))}" data-act="edit-comp" data-id="${c.id}">
      <span class="tag tag-pool">Ortak parça</span>${low ? '<span class="tag tag-warn alert">Azaldı</span>' : ''}</button>
    <div class="body">
      <div class="name" data-act="edit-comp" data-id="${c.id}">${esc(c.name)}</div>
      <div class="meta">${c.color_hex ? `<span class="pr-inline"><span class="spool${swatchCls(c.color_hex)}" style="${swatchStyle(c.color_hex)}"></span>${esc(c.brand || c.color_name || colorName(c.color_hex) || '')}</span>` : '<span></span>'}<span>${fmtDur(c.print_minutes)} / adet</span></div>
      <div class="used-by">${c.used_by.length ? `${c.used_by.length} üründe: ${c.used_by.slice(0, 3).map((u) => esc(u.name)).join(', ')}${c.used_by.length > 3 ? '…' : ''}` : '<span class="faint">Henüz bir ürüne bağlı değil</span>'}</div>
      <div class="foot">
        <div><div class="stocknum ${low ? 'low' : ''}">${c.stock}</div><div class="stocklbl">${c.in_print ? `<span class="inprod">+${c.in_print} baskıda</span>` : 'havuzda'}</div></div>
        <div class="qbtns"><button class="minus" data-act="comp-stock" data-id="${c.id}" data-d="-1" aria-label="Havuzdan 1 düş">${icon('minus')}</button><button data-act="comp-stock" data-id="${c.id}" data-d="1" aria-label="Havuza 1 ekle">${icon('plus')}</button></div>
      </div>
      <button class="btn btn-sm" data-act="print-comp" data-id="${c.id}">${icon('layers')} Bas</button>
    </div></article>`;
}
// ---------- diğer amaçlı (dükkan malzemesi, deneme baskısı vb.): stok tutulmaz, filament makaradan düşer
function miscHTML() {
  const list = S.misc || [];
  if (!list.length) return `<div class="empty panel"><h3>Diğer amaçlı kayıt yok</h3><p>Dükkan için bastığınız malzemeler, denemeler gibi satılmayan baskıları burada tanımlayın. Basıldığında stoğa bir şey eklenmez; filament makaradan düşer ve İstatistik'te ayrı görünür.</p><button class="btn btn-primary" data-act="new-misc">${icon('plus')} Diğer amaçlı ekle</button></div>`;
  return `<div class="pgrid">${list.map(miscCard).join('')}</div>`;
}
function miscCard(c) {
  return `<article class="pcard comp misc" data-cid="${c.id}">
    <button class="thumb${c.thumbnail ? '' : ' none'}" style="${thumbStyle(c.thumbnail)}" data-initial="${esc((c.name || '?')[0].toLocaleUpperCase('tr'))}" data-act="edit-comp" data-id="${c.id}">
      <span class="tag tag-misc">Diğer amaçlı</span></button>
    <div class="body">
      <div class="name" data-act="edit-comp" data-id="${c.id}">${esc(c.name)}</div>
      <div class="meta">${c.color_hex ? `<span class="pr-inline"><span class="spool${swatchCls(c.color_hex)}" style="${swatchStyle(c.color_hex)}"></span>${esc(c.brand || c.color_name || colorName(c.color_hex) || '')}</span>` : '<span></span>'}<span>${c.print_minutes ? fmtDur(c.print_minutes) + ' / adet' : ''}</span></div>
      <div class="used-by">${c.grams ? `${fmtGram(c.grams)} / adet` : '<span class="faint">gram girilmemiş</span>'}${c.in_print ? ` · <span class="inprod">${c.in_print} baskıda</span>` : ''}</div>
      <button class="btn btn-sm" data-act="print-comp" data-id="${c.id}">${icon('layers')} Bas</button>
    </div></article>`;
}
let CE = null;
function openCompEditor(id, kind) {
  const c = id ? structuredClone(compById(id)) : { kind: kind || 'pool', name: '', print_type: 'FDM', thumbnail: null, stock: 0, min_stock: 0, print_minutes: 0, grams: 0, color_hex: '#1A1A1A', color_name: 'Siyah', brand: '', file_name: '', notes: '' };
  CE = c;
  const misc = c.kind === 'misc';
  S.brands = S.brands || [];
  api('GET', '/api/brands').then((b) => { S.brands = b; const dl = $('#ce-bl'); if (dl) dl.innerHTML = brandsForColor(CE.color_hex).map((x) => `<option value="${esc(x)}">`).join(''); }).catch(() => {});
  const h = Math.floor((c.print_minutes || 0) / 60), m = (c.print_minutes || 0) % 60;
  openModal(`
    <div class="modal-h"><h2>${misc ? (id ? 'Diğer amaçlı kaydı düzenle' : 'Yeni diğer amaçlı baskı') : id ? 'Ortak parçayı düzenle' : 'Yeni ortak parça'}</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">
      <div class="split">
        <div><div class="drop ${c.thumbnail ? 'has' : ''}" id="c-drop" style="${c.thumbnail ? `--img:url('${esc(c.thumbnail)}')` : ''}" tabindex="0" role="button" aria-label="Görsel yükle"><div class="hint">${icon('upload')}<span>Görsel</span><small class="paste-hint">Ctrl+V ile yapıştırın</small></div></div>
          <input type="file" id="c-file-in" accept="image/*" hidden>
          <p class="side-note">${misc ? 'Satılmayan baskılar için (dükkan malzemesi, deneme vb.). Stoğa eklenmez; filament makaradan düşer.' : 'Stoğu tek havuzdadır. Bu parçayı kullanan ürünlerin setleri tamamlanırken buradan çekilir.'}</p></div>
        <div style="display:grid;gap:14px">
          <label class="field"><span>${misc ? 'Ad' : 'Parça adı'}</span><input class="input" id="c-name" value="${esc(c.name)}" placeholder="${misc ? 'Örn. Raf etiketi tutucu' : 'Örn. Kitap sırtı base'}" autocomplete="off"></label>
          <div class="field"><span>Baskı türü</span><div class="seg type" id="c-type">${['FDM', 'SLA'].map((t) => `<button type="button" data-v="${t}" class="${c.print_type === t ? 'on' : ''}">${t}</button>`).join('')}</div></div>
          <div class="field"><span>Renk ve filament</span>
            <div class="mat" style="grid-template-columns:auto 1fr"><button type="button" class="swatch-btn" data-act="pick-comp-color" id="c-swatch"></button>
              <input class="input" list="ce-bl" id="c-brand" placeholder="Marka / model" value="${esc(c.brand || '')}" autocomplete="off"><datalist id="ce-bl"></datalist></div></div>
          <div class="row">
            <div class="field"><span>Baskı süresi (1 adet)</span><div class="input-group"><input class="input" id="c-h" type="number" min="0" value="${h}" style="border-radius:8px 0 0 8px"><span class="suffix" style="border-radius:0">sa</span><input class="input" id="c-m" type="number" min="0" max="59" value="${m}" style="border-radius:0;border-left:0"><span class="suffix">dk</span></div></div>
            <label class="field"><span>Malzeme (1 adet)</span><div class="input-group"><input class="input" id="c-grams" type="number" min="0" step="0.1" value="${c.grams || ''}"><span class="suffix">gram</span></div></label>
          </div>
        </div>
      </div>
      <label class="field"><span>Dosya adı</span><input class="input" id="c-file" value="${esc(c.file_name || '')}" placeholder="${misc ? 'raf_tutucu.3mf' : 'booknook_base.3mf'}"><small>${misc ? 'Yazıcı bu dosyayı basmaya başlayınca kendiliğinden diğer amaçlı baskı olarak açılır.' : 'Bambu bağlıysa bu dosya basılınca kendiliğinden havuza eklenir.'}</small></label>
      <div class="row${misc ? ' hidden' : ''}">
        <label class="field"><span>Havuzdaki adet</span><input class="input" id="c-stock" type="number" min="0" value="${c.stock || 0}"></label>
        <label class="field"><span>En az</span><input class="input" id="c-min" type="number" min="0" value="${c.min_stock || 0}"></label>
      </div>
      ${id && c.used_by?.length ? `<div class="field"><span>Kullanan ürünler</span><ul class="lst">${c.used_by.map((u) => `<li>${miniThumb(u.thumbnail)}<div class="grow"><div class="t">${esc(u.name)}</div><div class="s">Bir üründe ${u.per_unit} adet · ürün stoğu ${u.stock}</div></div></li>`).join('')}</ul></div>` : ''}
      <label class="field"><span>Notlar</span><textarea class="input" id="c-notes" rows="2">${esc(c.notes || '')}</textarea></label>
    </div>
    <div class="modal-f">${id ? `<button class="btn btn-ghost" data-act="delete-comp" data-id="${id}">${icon('trash')} ${misc ? 'Sil' : 'Arşivle'}</button>` : ''}
      <div class="right"><button class="btn" data-act="close">Vazgeç</button><button class="btn btn-primary" data-act="save-comp">${id ? 'Kaydet' : 'Ekle'}</button></div></div>`, 'wide');
  const sw = () => { $('#c-swatch').innerHTML = `<span class="swatch${swatchCls(CE.color_hex)}" style="${swatchStyle(CE.color_hex)}"></span><span class="nm">${esc(CE.color_name || colorName(CE.color_hex) || CE.color_hex)}</span>`;
    const dl = $('#ce-bl'); if (dl) dl.innerHTML = brandsForColor(CE.color_hex).map((x) => `<option value="${esc(x)}">`).join(''); };
  CE.redraw = sw; sw();
  const drop = $('#c-drop'), fi = $('#c-file-in');
  drop.onclick = () => fi.click();
  fi.onchange = () => fi.files[0] && uploadCompImage(fi.files[0]);
  $('#c-type').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; CE.print_type = b.dataset.v; $$('#c-type button').forEach((x) => x.classList.toggle('on', x === b)); };
  if (!id) setTimeout(() => $('#c-name')?.focus(), 50);
}
async function uploadCompImage(f) {
  try { const r = await api('POST', '/api/upload-image', { data: await resizeImage(f) }); CE.thumbnail = r.url; const d = $('#c-drop'); d.classList.add('has'); d.style.setProperty('--img', `url('${r.url}')`); } catch (e) { fail(e); }
}
async function saveComp() {
  const v = (x) => $(x).value.trim();
  const body = { name: v('#c-name'), print_type: CE.print_type, thumbnail: CE.thumbnail, color_hex: CE.color_hex, color_name: CE.color_name || colorName(CE.color_hex),
    brand: v('#c-brand'), print_minutes: (parseInt(v('#c-h')) || 0) * 60 + (parseInt(v('#c-m')) || 0), grams: parseFloat(v('#c-grams')) || 0,
    file_name: v('#c-file'), stock: parseInt(v('#c-stock')) || 0, min_stock: parseInt(v('#c-min')) || 0, notes: v('#c-notes'), kind: CE.kind || 'pool' };
  if (body.kind === 'misc') { body.stock = 0; body.min_stock = 0; }
  if (!body.name) { $('#c-name').focus(); return toast(body.kind === 'misc' ? 'Adını yazın' : 'Parça adını yazın', { bad: true }); }
  try {
    const r = CE.id ? await api('PUT', `/api/components/${CE.id}`, body) : await api('POST', '/api/components', body);
    closeModal(); toast(body.kind === 'misc' ? 'Kaydedildi' : CE.id ? 'Ortak parça kaydedildi' : 'Ortak parça eklendi'); await loadComponents(); await loadProducts(); render();
    return r;
  } catch (e) { fail(e); }
}
function assembledText(a) { const e = Object.entries(a || {}); return e.length ? ' · tamamlandı: ' + e.map(([n, k]) => `${k} ${n}`).join(', ') : ''; }

// ---------- Ürünler: filtre menüsü (Durum / Tür / Kategori) ve etkin filtre etiketleri
const PF_ST = { low: 'Azalan', prod: 'Baskıda' };
function pfCount() { const f = S.pf; return (f.st && f.st !== 'all' ? 1 : 0) + (f.type && f.type !== 'all' ? 1 : 0) + (f.cat && f.cat !== 'all' ? 1 : 0); }
function pfBtnInner() { const n = pfCount(); return `${icon('filter')}<span class="hide-sm">Filtre</span>${n ? `<b class="fbadge">${n}</b>` : ''}`; }
function pfMenuHTML() {
  const f = S.pf, P = S.products;
  const cnt = { all: P.length, low: P.filter((p) => stockClass(p)).length, prod: P.filter((p) => p.in_production).length, FDM: P.filter((p) => p.print_type === 'FDM').length, SLA: P.filter((p) => p.print_type === 'SLA').length };
  const chip = (k, v, l, n) => `<button type="button" class="chip${(f[k] || 'all') === v ? ' on' : ''}" data-act="pf-set" data-k="${k}" data-v="${esc(v)}">${esc(l)}<span class="n">${n}</span></button>`;
  const cats = catNames();
  return `<div class="fm-g"><span class="fm-l">Durum</span><div class="chips">${chip('st', 'all', 'Tümü', cnt.all)}${chip('st', 'low', 'Azalan', cnt.low)}${chip('st', 'prod', 'Baskıda', cnt.prod)}</div></div>
    <div class="fm-g"><span class="fm-l">Tür</span><div class="chips">${chip('type', 'all', 'Hepsi', cnt.all)}${chip('type', 'FDM', 'FDM', cnt.FDM)}${chip('type', 'SLA', 'SLA', cnt.SLA)}</div></div>
    ${cats.length ? `<div class="fm-g"><span class="fm-l">Kategori</span><div class="chips">${chip('cat', 'all', 'Her tür', cnt.all)}${cats.map((c) => chip('cat', c, c, P.filter((p) => p.category === c).length)).join('')}</div></div>` : ''}
    <div class="fm-g fm-view"><span class="fm-l">Görünüm</span><div class="chips"><button type="button" class="chip${f.view === 'grid' ? ' on' : ''}" data-act="pf-view" data-v="grid">Kart</button><button type="button" class="chip${f.view === 'list' ? ' on' : ''}" data-act="pf-view" data-v="list">Liste</button></div></div>
    <div class="fm-foot"><button type="button" class="btn btn-sm btn-ghost" data-act="pf-clear"${pfCount() ? '' : ' disabled'}>Temizle</button><button type="button" class="btn btn-sm btn-primary" data-act="pf-close">Tamam</button></div>`;
}
function pfActiveHTML() {
  const f = S.pf, out = [];
  if (f.st && f.st !== 'all') out.push(['st', PF_ST[f.st]]);
  if (f.type && f.type !== 'all') out.push(['type', f.type]);
  if (f.cat && f.cat !== 'all') out.push(['cat', f.cat]);
  if (!out.length) return '';
  return `<span class="faint">Etkin:</span>${out.map(([k, l]) => `<button type="button" class="achip" data-act="pf-set" data-k="${k}" data-v="all" title="Kaldır">${esc(l)} ${icon('x')}</button>`).join('')}<button type="button" class="btn btn-sm btn-ghost" data-act="pf-clear">Temizle</button>`;
}
function pfApply() {
  if ($('#plist')) $('#plist').innerHTML = productListHTML();
  if ($('#pf-active')) $('#pf-active').innerHTML = pfActiveHTML();
  if ($('#pf-btn')) $('#pf-btn').innerHTML = pfBtnInner();
  if ($('#pf-pop')) $('#pf-pop').innerHTML = pfMenuHTML();
}
document.addEventListener('click', (e) => {   // menü dışına tıklayınca kapat
  const m = $('#pf-menu'); if (m?.open && !m.contains(e.target)) m.open = false;
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = $('#pf-menu'); if (m?.open) { m.open = false; $('#pf-btn')?.focus(); } } });

function filteredProducts() {
  const f = S.pf, q = trLower(f.q).trim();
  let list = S.products.filter((p) => {
    if ((f.type === 'FDM' || f.type === 'SLA') && p.print_type !== f.type) return false;
    if (f.st === 'low' && !stockClass(p)) return false;
    if (f.st === 'prod' && !p.in_production) return false;
    if (f.cat && f.cat !== 'all' && p.category !== f.cat) return false;
    if (q) {
      const hay = trLower([p.name, p.file_name, p.barcodes, p.notes, ...p.materials.map((m) => m.brand + ' ' + (m.color_name || colorName(m.color_hex)))].join(' '));
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const nm = (a, b) => a.name.localeCompare(b.name, 'tr');
  const mg = (p) => { if (!S.profit || !p.sale_price) return null; const r = productProfit(p).r; return r ? r.margin : null; };
  const nullsLast = (x, y) => (x == null) - (y == null);
  const by = { name: nm, stock_asc: (a, b) => a.stock - b.stock, stock_desc: (a, b) => b.stock - a.stock, recent: (a, b) => b.updated_at - a.updated_at,
    last_order: (a, b) => nullsLast(a.last_order_at, b.last_order_at) || (b.last_order_at || 0) - (a.last_order_at || 0) || nm(a, b),
    created: (a, b) => (b.created_at || 0) - (a.created_at || 0) || b.id - a.id,
    best: (a, b) => (b.sold_30 || 0) - (a.sold_30 || 0) || nm(a, b),
    runout: (a, b) => (stockForecast(a).days ?? 1e9) - (stockForecast(b).days ?? 1e9) || nm(a, b),
    margin: (a, b) => { const x = mg(a), y = mg(b); return nullsLast(x, y) || (y ?? 0) - (x ?? 0) || nm(a, b); } };
  return list.sort(by[f.sort] || nm);
}

function productListHTML() {
  const list = filteredProducts();
  if (!S.products.length) return `<div class="empty panel"><h3>İlk ürününüzü ekleyin</h3><p>Görseli, baskı süresi, gramajı ve filamentleriyle bir kez tanımlayın; sonra her baskıda sadece adedi girersiniz.</p><button class="btn btn-primary" data-act="new-product">${icon('plus')} Ürün ekle</button></div>`;
  if (!list.length) return `<div class="empty"><h3>Eşleşen ürün yok</h3><p>Aramayı veya filtreyi değiştirin.</p></div>`;
  if (S.pf.view === 'list') {
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Ürün</th><th data-uisec="cols.type">Tür</th><th data-uisec="cols.mats">Hammadde</th><th class="num" data-uisec="cols.grams">Gram</th><th class="num" data-uisec="cols.time">Süre</th><th data-uisec="cols.file">Dosya</th><th class="num" data-uisec="cols.inprod">Baskıda</th><th class="num">Stok</th><th></th></tr></thead><tbody>
      ${list.map((p) => `<tr class="click${S.psel?.has(p.id) ? ' psel-on' : ''}" data-act="${S.psel ? 'psel' : 'edit-product'}" data-id="${p.id}">
        <td style="width:56px">${S.psel ? `<span class="psel-box${S.psel.has(p.id) ? ' on' : ''}">${icon('check')}</span>` : miniThumb(p.thumbnail)}</td><td><a class="pd-link" href="#/urun?id=${p.id}"><b>${esc(p.name)}</b></a></td>
        <td data-uisec="cols.type"><span class="tag tag-${p.print_type}">${p.print_type}</span></td><td data-uisec="cols.mats">${spools(p.materials)}</td>
        <td class="num" data-uisec="cols.grams">${fmtGram(p.grams)}</td><td class="num" data-uisec="cols.time">${fmtDur(p.print_minutes)}</td>
        <td class="muted" data-uisec="cols.file" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.file_name || '')}</td>
        <td class="num" data-uisec="cols.inprod">${p.in_production || ''}</td>
        <td class="num"><span class="big ${p.stock < 0 ? 'stocknum neg' : ''}" style="font-size:22px">${p.stock}</span></td>
        <td><div class="qbtns"><button class="minus" data-act="stock" data-id="${p.id}" data-d="-1" aria-label="Stoktan 1 düş">${icon('minus')}</button><button data-act="stock" data-id="${p.id}" data-d="1" aria-label="Stoğa 1 ekle">${icon('plus')}</button></div></td>
      </tr>`).join('')}</tbody></table></div>`;
  }
  // Renk varyantları tek kartta: grup sırası, grubun ilk görünen üyesinin yerindedir
  const seen = new Set(), cards = [];
  if (S.psel) return `<div class="pgrid">${list.map(productCard).join('')}</div>`;
  for (const p of list) {
    if (p.group_id) {
      if (seen.has(p.group_id)) continue;
      seen.add(p.group_id);
      const members = list.filter((x) => x.group_id === p.group_id);
      cards.push(members.length > 1 ? variantCard(members) : productCard(p));
    } else cards.push(productCard(p));
  }
  return `<div class="pgrid">${cards.join('')}</div>`;
}
function variantCard(members) {
  const gid = members[0].group_id;
  S.vsel = S.vsel || {};
  const p = members.find((m) => m.id === S.vsel[gid]) || members[0];
  const sc = stockClass(p);
  const total = members.reduce((a, m) => a + m.stock, 0);
  const sw = (m) => { const c = m.parts?.length && !m.parts_same_color ? uniqueColors(m.parts)[0]?.color_hex : m.materials[0]?.color_hex; return c || '#C2C6CA'; };
  return `<article class="pcard vcard" data-gid="${gid}" data-pid="${p.id}" style="view-transition-name:g-${gid}">
    <button class="thumb${p.thumbnail ? '' : ' none'}" style="${thumbStyle(p.thumbnail)}" data-initial="${esc((p.base_name || p.name || '?')[0].toLocaleUpperCase('tr'))}" data-act="edit-product" data-id="${p.id}" aria-label="${esc(p.name)} düzenle">
      <span class="tag tag-${p.print_type}">${p.print_type} · ${members.length} renk</span>
      ${p.thumbnail ? `<span class="thumb-edit" data-edit="${p.id}" title="Düzenle">${icon('edit')}</span>` : ''}
      ${sc === 'neg' ? '<span class="tag tag-bad alert">Eksi stok</span>' : sc === 'low' ? '<span class="tag tag-warn alert">Azaldı</span>' : ''}
    </button>
    <div class="body">
      <a class="name" href="#/urun?id=${p.id}" title="Ürün sayfası">${esc(p.base_name || p.name)}</a>
      ${p.category ? `<span class="cat-label" data-uisec="card.cat">${esc(p.category)}</span>` : ''}
      <div class="vpills">${members.map((m) => `<button class="vpill${m.id === p.id ? ' on' : ''}${m.stock <= 0 ? ' out' : ''}" data-act="vsel" data-gid="${gid}" data-id="${m.id}" title="${esc(m.variant_label || '')}">
        <span class="spool${swatchCls(sw(m))}" style="${swatchStyle(sw(m))}"></span><span class="vl">${esc(m.variant_label || '—')}</span><b>${m.stock}</b></button>`).join('')}
        <button class="vpill add" data-act="new-variant" data-id="${p.id}" aria-label="Renk varyantı ekle">${icon('plus')}</button></div>
      <div class="foot">
        <div><div class="stocknum ${sc}">${p.stock}</div><div class="stocklbl">${esc(p.variant_label || '')} · toplam ${total}${p.in_production ? ` · <span class="inprod">+${p.in_production}</span>` : ''}</div></div>
        <div class="qbtns"><button class="minus" data-act="stock" data-id="${p.id}" data-d="-1" aria-label="Stoktan 1 düş">${icon('minus')}</button><button data-act="stock" data-id="${p.id}" data-d="1" aria-label="Stoğa 1 ekle">${icon('plus')}</button></div>
      </div>
    </div></article>`;
}
// ---------- toplu işlemler (Ürünler → Seç)
function pselBar() {
  if (!S.psel) return '';
  const n = S.psel.size;
  return `<div class="psel-bar" role="toolbar" aria-label="Seçili ürünler"><b>${n} seçili</b>
    <button class="btn btn-sm btn-ghost" data-act="psel-all">${n && filteredProducts().every((p) => S.psel.has(p.id)) ? 'Hiçbiri' : 'Görünenlerin tümü'}</button>
    <span class="psel-sep"></span>
    <select class="input" id="psel-cat" ${n ? '' : 'disabled'}><option value="">Kategori…</option>${catNames().map((c) => `<option>${esc(c)}</option>`).join('')}<option value="__none">(kategorisiz)</option></select>
    <label class="psel-min">En az stok <input class="input" id="psel-min" type="number" min="0" placeholder="–" ${n ? '' : 'disabled'}></label>
    <button class="btn btn-sm" data-act="psel-min-sugg" ${n ? '' : 'disabled'} title="Satış hızına göre önerilen en az stoğu uygula">Önerilen en az stok</button>
    <button class="btn btn-sm btn-primary" data-act="psel-print" ${n ? '' : 'disabled'}>${icon('layers')} Sırayla bas</button>
    <button class="btn btn-sm btn-bad" data-act="psel-archive" ${n ? '' : 'disabled'}>${icon('trash')} Arşivle</button>
    <span class="spacer"></span><button class="icon-btn" data-act="psel-mode" aria-label="Seçimi bitir">${icon('x')}</button></div>`;
}
function pselRefresh() { const l = $('#plist'); if (l) l.innerHTML = productListHTML(); const b = $('.psel-bar'); if (b) b.outerHTML = pselBar(); pselBind(); }
function pselBind() {
  $('#psel-cat')?.addEventListener('change', (e) => { const v = e.target.value; if (v) pselUpdate({ category: v === '__none' ? null : v }, `Kategori: ${v === '__none' ? 'kategorisiz' : v}`); });
  $('#psel-min')?.addEventListener('change', (e) => { const v = e.target.value; if (v !== '') pselUpdate({ min_stock: Math.max(0, parseInt(v) || 0) }, `En az stok ${v}`); });
}
async function pselUpdate(body, label, perItem) {
  const ids = [...S.psel]; let ok = 0;
  for (const id of ids) {
    const b = perItem ? perItem(productById(id)) : body; if (!b) continue;
    try { await api('PUT', `/api/products/${id}`, { apply_to_variants: 'category' in b, ...b }); ok++; } catch (e) { fail(e); }
  }
  toast(`${ok} ürün güncellendi · ${label}`);
  await loadProducts(); pselRefresh();
}
async function printQueueNext() {
  const id = S.printQueue?.shift(); if (!id) return;
  const total = S.printQueueTotal || 1, n = total - S.printQueue.length;
  S.pqStarted = false;
  await openNewPrint(id);
  const h = $('.modal-h h2'); if (h) h.innerHTML = `Yeni baskı <span class="faint">· sıra ${n}/${total}</span>`;
  modalOnClose = () => { if (!S.pqStarted && S.printQueue?.length) { toast(`Baskı sırası durdu (${S.printQueue.length} ürün kaldı)`, { action: 'Devam et', onAction: printQueueNext }); } };
}

function rerenderProductCard(p) {
  const gcard = p.group_id && $(`.vcard[data-gid="${p.group_id}"]`);
  if (gcard) { gcard.outerHTML = variantCard(filteredProducts().filter((x) => x.group_id === p.group_id)); return $(`.vcard[data-gid="${p.group_id}"]`); }
  const card = $(`.pcard[data-pid="${p.id}"]`);
  if (card) { card.outerHTML = productCard(p); return $(`.pcard[data-pid="${p.id}"]`); }
  return null;
}

// Stok tahmini: son 30 günün satış hızına göre stok kaç gün yeter, önerilen en az stok (plan hedefi kadar günlük satış)
const planDays = () => S.settings?.plan_days || 14;
function stockForecast(p) {
  const sold = p.sold_30 || 0, daily = sold / 30;
  const avail = (p.stock || 0) + (p.in_production || 0);
  return { daily, days: daily > 0 ? avail / daily : null, suggested: sold >= 2 ? Math.ceil(daily * planDays()) : null };
}
function productCard(p) {
  const sc = stockClass(p), fc = stockForecast(p);
  return `<article class="pcard${S.psel?.has(p.id) ? ' psel-on' : ''}" data-pid="${p.id}" style="view-transition-name:p-${p.id}">
    ${S.psel ? `<button type="button" class="psel-cover" data-act="psel" data-id="${p.id}" aria-pressed="${S.psel.has(p.id)}" aria-label="${esc(p.name)} seç"><i>${icon('check')}</i></button>` : ''}
    <button class="thumb${p.thumbnail ? '' : ' none'}" style="${thumbStyle(p.thumbnail)}" data-initial="${esc((p.name || '?')[0].toLocaleUpperCase('tr'))}" data-act="edit-product" data-id="${p.id}" aria-label="${esc(p.name)} düzenle">
      <span class="tag tag-${p.print_type}">${p.print_type}${p.parts?.length ? ` · ${p.parts_total} parça` : p.set_size > 1 ? ` · ${p.set_size}'lü set` : ''}</span>
      ${p.thumbnail ? `<span class="thumb-edit" data-edit="${p.id}" title="Düzenle">${icon('edit')}</span>` : ''}
      ${sc === 'neg' ? '<span class="tag tag-bad alert">Eksi stok</span>' : sc === 'low' ? '<span class="tag tag-warn alert">Azaldı</span>' : fc.days != null && fc.days < planDays() && U('card.forecast') ? `<span class="tag tag-warn alert" title="Son 30 günün satış hızına göre">≈${Math.floor(fc.days)} gün yeter</span>` : ''}
    </button>
    <div class="body">
      <a class="name" href="#/urun?id=${p.id}" title="Ürün sayfası">${esc(p.name)}</a>
      ${p.category ? `<span class="cat-label" data-uisec="card.cat">${esc(p.category)}</span>` : ''}
      ${U('card.colors') || U('card.meta') ? `<div class="meta">${U('card.colors') ? spools(p.parts?.length && !p.parts_same_color ? uniqueColors(p.parts) : p.materials) : '<span></span>'}${U('card.meta') ? `<span>${fmtGram(p.grams)} · ${fmtDur(p.print_minutes)}</span>` : ''}</div>` : ''}
      ${p.parts?.length && U('card.setmeter') ? setMeter(p) : ''}
      <div class="foot">
        <div><div class="stocknum ${sc}">${p.stock}</div><div class="stocklbl">${p.in_production ? `<span class="inprod">+${p.in_production} baskıda</span>` : p.set_size > 1 ? 'set stokta' : 'stokta'}</div></div>
        <div class="qbtns"><button class="minus" data-act="stock" data-id="${p.id}" data-d="-1" aria-label="Stoktan 1 düş">${icon('minus')}</button><button data-act="stock" data-id="${p.id}" data-d="1" aria-label="Stoğa 1 ekle">${icon('plus')}</button></div>
      </div>
    </div></article>`;
}

function uniqueColors(parts) {
  const seen = new Set();
  return parts.filter((x) => x.color_hex && !seen.has(x.color_hex.toUpperCase()) && seen.add(x.color_hex.toUpperCase()));
}
function setMeter(p) {
  const ready = p.parts_ready, total = p.parts_total, after = total - p.parts_missing_after_print;
  return `<div class="setmeter" title="Sonraki set için elde ${ready}, baskılar bitince ${after} parça">
    <div class="sm-bar"><i class="sm-print" style="width:${after / total * 100}%"></i><i class="sm-ready" style="width:${ready / total * 100}%"></i></div>
    <span>Sonraki set <b>${ready}/${total}</b>${after > ready ? ` <span class="inprod" style="font-size:11.5px">+${after - ready}</span>` : ''}</span></div>`;
}

async function quickStock(id, d) {
  try {
    const r = await api('POST', `/api/products/${id}/stock`, { delta: d, reason: d < 0 ? 'sale' : 'manual' });
    const p = productById(id); if (p) p.stock = r.stock;
    const card = p && rerenderProductCard(p);
    if (card) $('.stocknum', card)?.classList.add('bump', d > 0 ? 'up' : 'down');
    else if ($('#plist')) $('#plist').innerHTML = productListHTML();
    toast(`${p?.name}: stok ${r.stock}`, { action: 'Geri al', onAction: () => quickStock(id, -d) });
  } catch (e) { fail(e); }
}

// ---------- product editor
let ED = null;
// Ürün düzenleyicideki bölümlerin açık/kapalı hali cihaz başına hatırlanır (ilk seferde Notlar ve Stok geçmişi kapalı)
const ED_SEC_DEFAULT = { notes: false, hist: false };
function edSecOpen(k) { try { const v = JSON.parse(localStorage.getItem('edSecs') || '{}'); return k in v ? !!v[k] : ED_SEC_DEFAULT[k] ?? true; } catch { return ED_SEC_DEFAULT[k] ?? true; } }
function edSecSave(k, open) { try { const v = JSON.parse(localStorage.getItem('edSecs') || '{}'); v[k] = open; localStorage.setItem('edSecs', JSON.stringify(v)); } catch { /* */ } }
async function openProductEditor(id) {
  const p = id ? structuredClone(productById(id)) : null;
  if (p) p.name = p.base_name ?? p.name;
  if (!S.components) loadComponents();
  ED = p || { name: '', print_type: 'FDM', category: S.pf.cat && S.pf.cat !== 'all' ? S.pf.cat : null, set_size: 1, thumbnail: null, grams: '', print_minutes: 0, pieces_per_print: 1, file_name: '', stock: 0, min_stock: 0, barcodes: '', notes: '', materials: [{ color_hex: '#F4F4F1', color_name: 'Beyaz', brand: '' }], parts: [] };
  ED.set_size = ED.set_size || 1;
  ED.parts = (ED.parts || []).map((x) => ({ ...x }));
  ED.parts_same_color = ED.parts_same_color == null ? 1 : ED.parts_same_color;
  ED.partsOn = ED.parts.length > 0;
  ED.useComp = ED.parts.some((x) => x.component_id);
  ED.hadParts = ED.partsOn;
  // Elde = toplam parça (sete dönüşmüş olanlar dahil); kayıtta sunucu sete çevirir
  ED.totalMode = ED.hadParts && !!id;
  ED.stock0 = Math.max(0, ED.stock || 0);
  if (ED.totalMode) ED.parts.forEach((x) => { if (!x.component_id) x.stock = (x.stock || 0) + ED.stock0 * (x.per_unit || 1); });
  ED.origParts = ED.parts.map((x) => ({ id: x.id, comp: x.component_id || null, per: x.per_unit || 1, total: x.component_id ? null : x.stock }));
  if (!ED.materials.length) ED.materials = [{ color_hex: '#F4F4F1', color_name: 'Beyaz', brand: '' }];
  S.brands = S.brands || [];
  api('GET', '/api/brands').then((b) => { S.brands = b; if ($('#mats')) renderMats(); }).catch(() => {});
  const h = Math.floor((ED.print_minutes || 0) / 60), m = (ED.print_minutes || 0) % 60;
  openModal(`
    <div class="modal-h"><h2>${id ? 'Ürünü düzenle' : 'Yeni ürün'}</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">
      <div class="split">
        <div>
          <div class="drop ${ED.thumbnail ? 'has' : ''}" id="drop" style="${ED.thumbnail ? `--img:url('${esc(ED.thumbnail)}')` : ''}" tabindex="0" role="button" aria-label="Görsel yükle">
            <div class="hint">${icon('upload')}<span>Görsel veya .3mf dosyası sürükleyin ya da dokunun</span><small class="paste-hint">Ctrl+V ile yapıştırabilirsiniz</small></div>
            <button type="button" class="drop-zoom" aria-label="Büyük göster" title="Büyük göster">${icon('search')}</button>
          </div>
          <input type="file" id="thumb-file" accept="image/*,.3mf" hidden>
          <p class="side-note">Dilimlenmiş bir Bambu/Orca .3mf bırakırsanız önizleme, süre, gram ve filament renkleri otomatik dolar.</p>
          <div id="ty-imgs"></div>
        </div>
        <div style="display:grid;gap:14px">
          <label class="field"><span>Ürün adı</span><input class="input" id="f-name" value="${esc(ED.name)}" placeholder="Örn. Sakura kitap ayracı" autocomplete="off"></label>
          ${ED.group_id ? `<div class="variant-box"><label class="field"><span>Varyant (renk)</span><input class="input" id="f-vlabel" value="${esc(ED.variant_label || '')}" placeholder="Örn. Siyah"></label>
            <div class="vsibs">${S.products.filter((x) => x.group_id === ED.group_id && x.id !== ED.id).map((x) => `<button type="button" class="chip" data-act="edit-product" data-id="${x.id}">${esc(x.variant_label || x.name)}</button>`).join('')}</div>
            <small>Ad, süre, gram, dosya, kategori ve parça yapısı tüm varyantlarda ortaktır; renk, görsel, stok ve barkod bu varyanta özeldir.</small></div>` : ''}
          <div class="field"><span>Ürün türü</span>
            <div class="seg cat" id="f-cat" style="flex-wrap:wrap">${catNames().map((c) => `<button type="button" data-v="${c}" class="${ED.category === c ? 'on' : ''}">${c}</button>`).join('')}</div></div>
          <div class="field"><span>Baskı türü</span>
            <div class="seg type" id="f-type">${['FDM', 'SLA'].map((t) => `<button type="button" data-v="${t}" class="${ED.print_type === t ? 'on' : ''}">${t}</button>`).join('')}</div></div>
          <label class="field" id="set-field"><span>Adet / set</span>
            <div class="stepper"><button type="button" data-act="set-step" data-d="-1" aria-label="Azalt">${icon('minus')}</button><input id="f-set" type="number" inputmode="numeric" min="1" value="${ED.set_size}"><button type="button" data-act="set-step" data-d="1" aria-label="Arttır">${icon('plus')}</button></div>
            <small id="set-hint"></small></label>
          <div class="row">
            <label class="field"><span id="grams-label">Harcanan malzeme</span><div class="input-group"><input class="input" id="f-grams" type="number" inputmode="decimal" min="0" step="0.1" value="${ED.grams ?? ''}"><span class="suffix">gram</span></div></label>
            <div class="field"><span id="time-label">Baskı süresi</span><div class="input-group"><input class="input" id="f-h" type="number" inputmode="numeric" min="0" value="${h}" style="border-radius:8px 0 0 8px"><span class="suffix" style="border-radius:0">sa</span><input class="input" id="f-m" type="number" inputmode="numeric" min="0" max="59" value="${m}" style="border-radius:0;border-left:0"><span class="suffix">dk</span></div></div>
          </div>
        </div>
      </div>

      <details class="ed-sec" id="mats-field" data-sec="mats" ${edSecOpen('mats') ? 'open' : ''}><summary><span id="mat-label">${ED.print_type === 'SLA' ? 'Reçineler' : 'Filamentler'} <span class="faint">(1–6)</span></span><small class="ed-sum" id="sum-mats"></small></summary>
        <div class="mats" id="mats"></div>
      </details>

      <details class="ed-sec parts-field" id="parts-field" data-sec="parts" ${edSecOpen('parts') ? 'open' : ''}><summary><span>Parçalar</span><small class="ed-sum" id="sum-parts"></small></summary>
        <label class="switch"><input type="checkbox" id="f-parts-on" ${ED.partsOn ? 'checked' : ''}> Bu ürün birden fazla parçadan oluşuyor</label>
        <div id="parts-box" class="${ED.partsOn ? '' : 'hidden'}"></div>
      </details>

      <details class="ed-sec" data-sec="file" ${edSecOpen('file') ? 'open' : ''}><summary><span>Dosya</span><small class="ed-sum">${esc(ED.file_name || '')}</small></summary>
      <div class="field"><span>Dosya adı (.3mf / .chitubox)</span>
        <div class="input-group"><input class="input" id="f-file" value="${esc(ED.file_name || '')}" placeholder="saksi_altigen_v3.3mf">
        <button class="btn" type="button" data-act="pick-file" style="border-radius:0 8px 8px 0;border-left:0">${icon('file')} Seç</button></div>
        <input type="file" id="model-file" accept=".3mf,.chitubox,.ctb,.cbddlp,.lys,.stl,.gcode,.photon,.pwmx,.goo" hidden>
      </div></details>

      <details class="ed-sec" data-sec="stock" ${edSecOpen('stock') ? 'open' : ''}><summary><span>Stok ve barkod</span><small class="ed-sum">stok ${ED.stock ?? 0}${ED.min_stock ? ` · en az ${ED.min_stock}` : ''}${ED.barcodes ? ' · ' + esc(ED.barcodes) : ''}</small></summary>
      <div class="row">
        <label class="field"><span>${id ? 'Güncel stok' : 'Açılış stoğu'}</span><input class="input" id="f-stock" type="number" inputmode="numeric" value="${ED.stock ?? 0}"></label>
        <label class="field"><span>En az stok</span><input class="input" id="f-min" type="number" inputmode="numeric" min="0" value="${ED.min_stock || 0}"><small>Altına düşünce uyarır</small></label>
      </div>
      <label class="field"><span>Trendyol barkodu / stok kodu</span><input class="input" id="f-barcodes" value="${esc(ED.barcodes || '')}" placeholder="8680000000001, SAKSI-ALT-M"><small>Birden fazla varsa virgülle ayırın. Trendyol siparişleri bu kodlarla eşleşip stoktan düşer.</small></label>
      </details>
      <details class="ed-sec" data-sec="price" ${edSecOpen('price') ? 'open' : ''}><summary><span>Fiyat ve kâr <span class="faint">(Trendyol satış fiyatı, KDV dahil)</span></span><small class="ed-sum">${ED.sale_price ? fmtTL(ED.sale_price) : ''}</small></summary>
      <div class="field pf-field">
        <div class="pf-grid">
          <div class="pf-inputs">
            <div class="row">
              <label class="field"><span>Satış fiyatı</span><div class="input-group"><input class="input" id="f-price" inputmode="decimal" value="${ED.sale_price ?? ''}" placeholder="0"><span class="suffix">₺</span></div></label>
              <label class="field"><span>Ek maliyet</span><div class="input-group"><input class="input" id="f-extra" inputmode="decimal" value="${ED.extra_cost ?? ''}" placeholder="0"><span class="suffix">₺</span></div><small>Boya, reçine, kutu…</small></label>
            </div>
            <details class="pf-more" ${ED.commission_pct != null || ED.cargo_fee != null ? 'open' : ''}><summary>Ürüne özel komisyon / kargo</summary>
              <div class="row">
                <label class="field"><span>Komisyon</span><div class="input-group"><input class="input" id="f-com" inputmode="decimal" value="${ED.commission_pct ?? ''}" placeholder="${defaultCommission(ED.category, ED)}"><span class="suffix">%</span></div></label>
                <label class="field"><span>Kargo (${S.profit?.cfg.cargo_tiers.at(-1)?.upto ?? 300} ₺ ve üstü)</span><div class="input-group"><input class="input" id="f-cargo" inputmode="decimal" value="${ED.cargo_fee ?? ''}" placeholder="${S.profit?.cfg.cargo_over ?? 98.34}"><span class="suffix">₺</span></div><small>Sadece bu tutarın üstündeki satışlarda kullanılır (desiye göre)</small></label>
              </div></details>
          </div>
          <div class="pf-box" id="pf-box"></div>
        </div><div id="ty-box"></div></div></details>
      <details class="ed-sec" data-sec="notes" ${edSecOpen('notes') ? 'open' : ''}><summary><span>Notlar</span><small class="ed-sum">${esc((ED.notes || '').slice(0, 60))}</small></summary>
        <textarea class="input" id="f-notes" rows="2" placeholder="Destek ayarı, boya, paketleme notu…" aria-label="Notlar">${esc(ED.notes || '')}</textarea></details>
      ${id ? `<details class="ed-sec" data-sec="hist" ${edSecOpen('hist') ? 'open' : ''}><summary><span>Stok geçmişi</span></summary><div id="phist" class="muted">Yükleniyor…</div></details>` : ''}
    </div>
    <div class="modal-f">
      ${id ? `<button class="btn btn-ghost" data-act="delete-product" data-id="${id}">${icon('trash')} Arşivle</button>
        <button class="btn btn-ghost" data-act="new-variant" data-id="${id}">${icon('plus')} Renk varyantı</button>
        ${ED.group_id ? `<button class="btn btn-ghost" data-act="ungroup" data-id="${id}">Gruptan çıkar</button>` : ''}` : ''}
      <div class="right"><button class="btn" data-act="close">Vazgeç</button><button class="btn btn-primary" data-act="save-product">${id ? 'Kaydet' : 'Ürünü ekle'}</button></div>
    </div>`, 'wide xwide');

  $$('.ed-sec').forEach((d) => d.addEventListener('toggle', () => edSecSave(d.dataset.sec, d.open)));
  renderMats();
  renderParts();
  applyCategoryUI();
  ['#f-price', '#f-extra', '#f-com', '#f-cargo', '#f-grams', '#f-set'].forEach((x) => $(x)?.addEventListener('input', edProfitRender));
  loadProfit().then(() => { const c = $('#f-com'), k = $('#f-cargo'); if (c) c.placeholder = defaultCommission(ED.category, ED); if (k) k.placeholder = S.profit.cfg.cargo_over; edProfitRender(); }).catch(() => {});
  $('#f-cat').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ED.category = ED.category === b.dataset.v ? null : b.dataset.v;
    $$('#f-cat button').forEach((x) => x.classList.toggle('on', x.dataset.v === ED.category));
    applyCategoryUI();
  };
  $('#f-set').addEventListener('input', applyCategoryUI);
  $('#f-parts-on').onchange = (e) => {
    ED.partsOn = e.target.checked;
    if (ED.partsOn && ED.parts.length < 2) { while (ED.parts.length < 2) ED.parts.push({ name: '', per_unit: 1, stock: 0 }); renderParts(); }
    $('#parts-box').classList.toggle('hidden', !ED.partsOn);
    applyCategoryUI();
  };
  const drop = $('#drop'), fileIn = $('#thumb-file');
  drop.onclick = () => fileIn.click();
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } };
  fileIn.onchange = () => fileIn.files[0] && handleEditorFile(fileIn.files[0]);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && handleEditorFile(e.dataTransfer.files[0]));
  $('#model-file').onchange = (e) => { const f = e.target.files[0]; if (!f) return; $('#f-file').value = f.name; if (/\.3mf$/i.test(f.name)) handleEditorFile(f, true); };
  $('#f-type').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; ED.print_type = b.dataset.v; $$('#f-type button').forEach((x) => x.classList.toggle('on', x === b)); $('#mat-label').innerHTML = `${ED.print_type === 'SLA' ? 'Reçineler' : 'Filamentler'} <span class="faint">(1–6)</span>`; };
  if (!id) setTimeout(() => $('#f-name')?.focus(), 50);
  if (id) api('GET', `/api/products/${id}/trendyol`).then(edTyRender).catch(() => {});
  if (id) api('GET', `/api/log?product_id=${id}&limit=15`).then((l) => { const el = $('#phist'); if (el) el.innerHTML = logList(l); }).catch(() => {});
}
let VD = null;
function openVariantDialog(id) {
  const p = productById(id); if (!p) return;
  const m0 = p.materials[0] || {};
  VD = { src: p, color_hex: '#1A1A1A', color_name: 'Siyah', brand: '' };
  closeModal(true);
  openModal(`<div class="modal-h"><h2>Renk varyantı</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">
      <p class="muted" style="margin:0"><b>${esc(p.base_name || p.name)}</b> ürününün aynısı, farklı renkte. Süre, gram, dosya ve parça yapısı ortak kalır; stok ve barkod ayrı tutulur.</p>
      ${!p.group_id ? `<label class="field"><span>Mevcut ürünün varyant adı</span><input class="input" id="vd-cur" value="${esc(m0.color_name || colorName(m0.color_hex) || '')}" placeholder="Örn. Pembe"></label>` : ''}
      <div class="field"><span>Yeni varyantın rengi</span>
        <div class="mat" style="grid-template-columns:auto 1fr"><button type="button" class="swatch-btn" data-act="pick-vd-color" id="vd-swatch"></button>
          <input class="input" list="vd-bl" id="vd-brand" placeholder="Filament marka / model" autocomplete="off"><datalist id="vd-bl"></datalist></div></div>
      <label class="field"><span>Varyant adı</span><input class="input" id="vd-label" value="Siyah" placeholder="Örn. Siyah, Mat beyaz"></label>
      <label class="field"><span>Trendyol barkodu (bu renk)</span><input class="input" id="vd-barcode" placeholder="Bu rengin Trendyol barkodu"></label>
    </div>
    <div class="modal-f"><div class="right"><button class="btn" data-act="close">Vazgeç</button><button class="btn btn-primary" data-act="save-variant">Varyantı ekle</button></div></div>`, 'narrow');
  VD.redraw = () => {
    $('#vd-swatch').innerHTML = `<span class="swatch${swatchCls(VD.color_hex)}" style="${swatchStyle(VD.color_hex)}"></span><span class="nm">${esc(VD.color_name || colorName(VD.color_hex) || VD.color_hex)}</span>`;
    $('#vd-bl').innerHTML = brandsForColor(VD.color_hex).map((b) => `<option value="${esc(b)}">`).join('');
    const lab = $('#vd-label'); if (!lab.dataset.touched) lab.value = VD.color_name || colorName(VD.color_hex) || '';
  };
  $('#vd-label').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
  if (!S.brands?.length) api('GET', '/api/brands').then((b) => { S.brands = b; VD.redraw(); }).catch(() => {});
  VD.redraw();
}
async function saveVariant() {
  const p = VD.src, label = $('#vd-label').value.trim();
  if (!label) { $('#vd-label').focus(); return toast('Varyant adını yazın', { bad: true }); }
  const mats = p.parts?.length && !p.parts_same_color ? undefined
    : (p.materials.length ? p.materials : [{}]).map((m, i) => i === 0 ? { color_hex: VD.color_hex, color_name: VD.color_name || colorName(VD.color_hex), brand: $('#vd-brand').value.trim() } : m);
  try {
    const r = await api('POST', `/api/products/${p.id}/variant`, { variant_label: label, current_label: $('#vd-cur')?.value.trim() || undefined,
      materials: catFlags(p.category).no_materials ? [] : mats, barcodes: $('#vd-barcode').value.trim() });
    closeModal(true); await loadProducts();
    toast(`${r.name} eklendi`);
    (S.vsel ||= {})[r.group_id] = r.id;
    render(); openProductEditor(r.id);
  } catch (e) { fail(e); }
}

// Ürün türüne göre alanlar: figürde filament yok (boyanıyor), kitap ayracında çok parça yok, çok parçada set yok
function applyCategoryUI() {
  const cat = ED.category, set = Math.max(1, parseInt($('#f-set')?.value) || 1);
  const fl = catFlags(cat);
  const partsOn = ED.partsOn && !fl.no_parts;
  // parçalar ayrı renkliyse renkler parçalardan seçilir; filament listesi gizlenir (kayıtlı liste korunur)
  $('#mats-field').classList.toggle('hidden', fl.no_materials || (partsOn && !ED.parts_same_color));
  const sm = $('#sum-mats'); if (sm) sm.textContent = ED.materials.map((m) => m.color_name || colorName(m.color_hex) || '').filter(Boolean).join(', ');
  const sp = $('#sum-parts'); if (sp) sp.textContent = partsOn ? `${ED.parts.length} parça · ${ED.parts.reduce((a, x) => a + (parseInt(x.per_unit) || 1), 0)} adet/set` : 'tek parça';
  $('#parts-field').classList.toggle('hidden', fl.no_parts);
  $('#set-field').classList.toggle('hidden', partsOn);
  const unit = partsOn ? '1 set' : set > 1 ? `1 set = ${set} adet` : '1 adet';
  $('#grams-label').textContent = `Harcanan malzeme (${unit})`;
  $('#time-label').textContent = `Baskı süresi (${unit})`;
  if ($('#f-com')) $('#f-com').placeholder = defaultCommission(ED.category, ED);
  edProfitRender();
  $('#set-hint').textContent = set > 1 ? `Bir ürün ${set} parçalık set olarak satılıyor. Stok ve baskılar set olarak sayılır.` : 'Tekli ürün. 3\'lü set olarak satılıyorsa 3 yapın.';
}

// Parça gramlarından bir setin gramı (ortak parçada gram boşsa ortak parçanın gramı)
function partGram(x) { if (x.grams != null && x.grams !== '') return +x.grams; const c = x.component_id ? compById(x.component_id) : null; return c?.grams ? +c.grams : null; }
function partsGramsHTML() {
  const g = ED.parts.map(partGram), known = g.filter((v) => v != null);
  if (!known.length) return '<small class="muted">Parçaların gramını girerseniz bir setin toplam gramı hesaplanır.</small>';
  const sum = ED.parts.reduce((a, x, i) => a + (g[i] || 0) * (parseInt(x.per_unit) || 1), 0);
  const cur = parseFloat(($('#f-grams')?.value || '').replace(',', '.')) || 0;
  return `<small>Bir set: <b>${fmtGram(Math.round(sum * 10) / 10)}</b>${known.length < g.length ? ` <span class="muted">(${g.length - known.length} parçanın gramı boş)</span>` : ''}${Math.abs(cur - sum) > 0.5 ? ` · ürün gramı ${cur ? fmtGram(cur) : 'boş'} <button type="button" class="linkish" data-act="parts-sum-apply">toplamı ürün gramına yaz</button>` : ' · ürün gramıyla aynı'}</small>`;
}
// Toplam parça sayıları değiştiyse kaç tam set çıkacağı (sunucudaki parts_from_totals ile aynı hesap); değişmediyse null
function partsSetsCalc() {
  if (!ED?.totalMode || !ED.partsOn) return null;
  const o = ED.origParts || [];
  const changed = ED.parts.length !== o.length || ED.parts.some((x) => {
    const p = o.find((y) => y.id && y.id === x.id), per = parseInt(x.per_unit) || 1;
    if (!p || p.per !== per || (p.comp || null) !== (x.component_id || null)) return true;
    return !x.component_id && (parseInt(x.stock) || 0) !== p.total;
  });
  if (!changed) return null;
  const lim = ED.parts.map((x) => {
    const per = parseInt(x.per_unit) || 1;
    if (x.component_id) { const p = o.find((y) => y.id && y.id === x.id && y.comp === x.component_id); return Math.floor(((compById(x.component_id)?.stock || 0) + (p ? ED.stock0 * per : 0)) / per); }
    return Math.floor((parseInt(x.stock) || 0) / per);
  });
  return Math.max(0, Math.min(...lim));
}
function partsSetsHTML() {
  if (!ED?.totalMode) return '';
  const n = partsSetsCalc();
  return n == null ? '<small class="muted">Elde: elinizdeki toplam parça sayısı (sete dönüşmüş olanlar dahil). Sayım yaparken saydığınızı yazın.</small>'
    : `<small>Bu sayımla <b>${n} tam set</b> çıkıyor; kaydedince ürün stoğu <b>${n}</b> olur, artan parçalar elde kalır.</small>`;
}
function partsSetsSync() {
  const n = partsSetsCalc(), el = $('#parts-sets');
  if (el) el.innerHTML = partsSetsHTML();
  if (n != null && $('#f-stock')) $('#f-stock').value = n;
}
function renderParts() {
  const total = ED.parts.reduce((a, x) => a + (parseInt(x.per_unit) || 1), 0);
  const per = !ED.parts_same_color;
  $('#parts-box').innerHTML = `
    <label class="switch" style="font-size:14px"><input type="checkbox" id="parts-same" ${per ? '' : 'checked'}> Tüm parçalar aynı renk</label>
    ${per ? '' : `<small class="muted" style="margin-top:-4px">Renk ve filament yukarıdaki listeden gelir.</small>`}
    <label class="switch" style="font-size:14px"><input type="checkbox" id="parts-comp" ${ED.useComp ? 'checked' : ''}> Ortak parça kullanıyor <span class="faint" style="font-weight:400">(base gibi başka ürünlerle paylaşılan parça)</span></label>
    <div class="parts-head${per ? ' colored' : ''}">${per ? '<span>Renk</span>' : ''}<span>Parça adı</span><span>Bir üründe</span><span title="1 parçanın filament gramı">Gram (1 adet)</span>${ED.totalMode ? '<span title="Elinizdeki toplam parça (sete dönüşmüş olanlar dahil)">Elde (toplam)</span>' : '<span title="Basılmış, henüz sete dönüşmemiş">Elde</span>'}<span></span></div>
    ${ED.parts.map((x, i) => { const comp = x.component_id ? compById(x.component_id) : null;
      const hex = comp ? (comp.color_hex || '#C2C6CA') : (x.color_hex || '#F4F4F1'), clear = hex === 'transparent', col = clear ? '#C9D1D6' : hex;
      return `<div class="part-row${per ? ' colored pcA' : ''}${comp ? ' shared' : ''}" data-i="${i}"${per ? ` style="--c:${col};--m:${shapeMask(comp ? comp.brand : x.brand)}"` : ''}>
      ${per && comp ? `<div class="part-color pc-cell"><span class="pc-sh" aria-hidden="true"></span><span class="pc-tx"><b>${esc(comp.color_name || colorName(comp.color_hex) || 'Ortak')}</b><small>${esc(comp.brand || 'ortak parça')}</small></span></div>` : ''}
      ${per && !comp ? `<div class="part-color pc-cell"><button type="button" class="pc-sh" data-act="pick-part-color" data-i="${i}" aria-label="Parça rengi" title="Rengi değiştir"></button>
        <span class="pc-tx"><button type="button" class="pc-nm" data-act="pick-part-color" data-i="${i}">${esc(x.color_name || colorName(x.color_hex) || (x.color_hex ? x.color_hex : 'Renk seç'))}</button>
        <input class="pc-br" list="pbl-${i}" placeholder="marka / model" value="${esc(x.brand || '')}" data-pf="brand" data-i="${i}" autocomplete="off" aria-label="Filament marka / model"></span>
        <datalist id="pbl-${i}">${brandsForColor(x.color_hex).map((b) => `<option value="${esc(b)}">`).join('')}</datalist></div>` : ''}
      <div class="part-name">
        <input class="input" data-pf="name" data-i="${i}" value="${esc(comp ? (x.name && x.name !== comp.name ? x.name : '') : (x.name || ''))}" placeholder="${comp ? esc(comp.name) : `Parça ${i + 1}`}" autocomplete="off">
        ${ED.useComp ? `<select class="input sm" data-part-comp="${i}" aria-label="Ortak parça">
          <option value="">Bu ürüne özel</option>${(S.components || []).map((c) => `<option value="${c.id}"${x.component_id === c.id ? ' selected' : ''}>Ortak: ${esc(c.name)} (havuzda ${c.stock})</option>`).join('')}
        </select>` : ''}</div>
      <div class="input-group"><input class="input" data-pf="per_unit" data-i="${i}" type="number" min="1" inputmode="numeric" value="${x.per_unit || 1}"><span class="suffix">adet</span></div>
      <div class="input-group"><input class="input" data-pf="grams" data-i="${i}" type="number" min="0" step="0.1" inputmode="decimal" value="${x.grams ?? ''}" placeholder="${comp?.grams ? comp.grams : '–'}" aria-label="Parça gramı"><span class="suffix">g</span></div>
      ${comp ? `<span class="pool-stock" title="Ortak havuz">havuz<br><b>${comp.stock}</b></span>` : `<input class="input" data-pf="stock" data-i="${i}" type="number" min="0" inputmode="numeric" value="${x.stock || 0}">`}
      <button type="button" class="icon-btn" data-act="rm-part" data-i="${i}" ${ED.parts.length <= 2 ? 'disabled style="opacity:.35"' : ''} aria-label="Parçayı kaldır">${icon('x')}</button>
    </div>`; }).join('')}
    <div class="parts-grams" id="parts-grams">${partsGramsHTML()}</div>
    <div class="parts-grams" id="parts-sets">${partsSetsHTML()}</div>
    <div class="parts-foot"><button type="button" class="btn btn-sm" data-act="add-part">${icon('plus')} Parça ekle</button>
      <span class="muted">Bir set = <b id="parts-total">${total}</b> parça. Bir setin tüm parçaları basıldığında ürün kendiliğinden stoğa eklenir.${ED.useComp ? ` Ortak seçilen parçanın stoğu havuzdan gelir.${(S.components || []).length ? '' : ' Önce Ürünler → Ortak parçalar sekmesinden ortak parça ekleyin.'}` : ''}</span></div>`;
  $$('#parts-box [data-pf]').forEach((inp) => inp.addEventListener('input', () => {
    const k = inp.dataset.pf;
    if (k === 'brand') inp.closest('.part-row')?.style.setProperty('--m', shapeMask(inp.value));
    ED.parts[+inp.dataset.i][k] = (k === 'name' || k === 'brand') ? inp.value : k === 'grams' ? (inp.value === '' ? null : Math.max(0, parseFloat(inp.value.replace(',', '.')) || 0)) : (parseInt(inp.value) || 0);
    if (k === 'per_unit') $('#parts-total').textContent = ED.parts.reduce((a, x) => a + (parseInt(x.per_unit) || 1), 0);
    if (k === 'per_unit' || k === 'grams') { const g = $('#parts-grams'); if (g) g.innerHTML = partsGramsHTML(); }
    if (k === 'per_unit' || k === 'stock') partsSetsSync();
  }));
  $$('#parts-box [data-part-comp]').forEach((sel) => sel.addEventListener('change', () => {
    const x = ED.parts[+sel.dataset.partComp]; x.component_id = +sel.value || null;
    if (x.component_id) { x.stock = 0; if (!x.name || (S.components || []).some((c) => c.name === x.name)) x.name = compById(x.component_id).name; }
    renderParts();
  }));
  $('#parts-comp').onchange = (e) => {
    if (!e.target.checked && ED.parts.some((x) => x.component_id)) {
      if (!confirm('Ortak parça bağlantıları kaldırılsın mı? Bu parçalar ürüne özel olur.')) { e.target.checked = true; return; }
      ED.parts.forEach((x) => { if (x.component_id) { x.name = x.name || compById(x.component_id)?.name || ''; x.component_id = null; } });
    }
    ED.useComp = e.target.checked; renderParts();
  };
  $('#parts-same').onchange = (e) => {
    ED.parts_same_color = e.target.checked ? 1 : 0;
    if (!ED.parts_same_color) ED.parts.forEach((x) => { if (!x.color_hex) { const m = ED.materials[0] || {}; x.color_hex = m.color_hex || '#F4F4F1'; x.color_name = m.color_name || colorName(x.color_hex); x.brand = x.brand || m.brand || ''; } });
    renderParts();
  };
  if ($('#mats-field') && $('#f-set')) applyCategoryUI(); else edProfitRender();
  partsSetsSync();
}

// Öneriler: yalnızca bu satırda seçili renkle daha önce kullanılmış marka/modeller
function brandsForColor(hex) {
  const h = String(hex || '').toUpperCase();
  return [...new Set((S.brands || []).filter((b) => String(b.color_hex || '').toUpperCase() === h).map((b) => b.brand))];
}

// Bu renkteki makaralar (önce markası tutanlar, sonra en dolu olanlar)
function matchSpools(hex, brand) {
  const h = String(hex || '').toUpperCase(), b = trLower(brand || '');
  return (S.spools || []).filter((x) => (x.remaining || 0) > 0 && String(x.color_hex || '').toUpperCase() === h)
    .sort((x, y) => ((b && trLower(y.brand || '').includes(b)) - (b && trLower(x.brand || '').includes(b))) || y.remaining - x.remaining);
}
function matSpoolsHTML(m) {
  const list = matchSpools(m.color_hex, m.brand);
  if (!list.length) return (S.spools || []).length ? `<div class="mat-spools none">Bu renkte makara yok</div>` : '';
  return `<div class="mat-spools">${list.slice(0, 6).map((x) => `<span class="ms" title="#${esc(x.code)} · ${esc(x.brand || '')} ${esc(x.material || '')} · ${Math.round(x.remaining)} g">
      ${spoolArt(x, 'md')}<span><b>#${esc(x.code)}</b><small>${Math.round(x.remaining)} g${x.in_use.length ? ' · baskıda' : ''}</small></span></span>`).join('')}
    ${list.length > 6 ? `<span class="faint" style="align-self:center">+${list.length - 6}</span>` : ''}</div>`;
}
function renderMats() {
  if (!S.spools && !S.spoolsLoading) { S.spoolsLoading = true; loadSpools().then(() => { S.spoolsLoading = false; if ($('#mats')) renderMats(); }); }
  const resin = ED.print_type === 'SLA';
  $('#mats').innerHTML = ED.materials.map((m, i) => { const clear = !m.color_hex || m.color_hex === 'transparent', col = clear ? '#C9D1D6' : m.color_hex;
    const sl = matchSpools(m.color_hex, m.brand), g = sl.reduce((a, x) => a + (x.remaining || 0), 0);
    const sub = !(S.spools || []).length || resin ? (m.brand ? '' : 'marka seçilmedi') : sl.length ? `${sl.length} makara · ${fmtGram(Math.round(g))}` : 'makara yok';
    return `<div class="mat-wrap"><div class="mat matA${clear ? ' clear' : ''}" data-i="${i}" style="--c:${col};--on:${inkOn(col)};--m:${shapeMask(m.brand, resin)}">
      <button type="button" class="mat-face" data-act="pick-color" data-i="${i}" title="Rengi değiştir"><i class="mat-shape"></i><span class="mat-no">${i + 1}</span>
        <span class="mat-tx"><b>${esc(m.color_name || colorName(m.color_hex) || m.color_hex || 'Renk seç')}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>
      <input class="input" list="bl-${i}" placeholder="Marka / model, ör. Bambu PLA Basic" value="${esc(m.brand || '')}" data-brand="${i}" autocomplete="off">
      <datalist id="bl-${i}">${brandsForColor(m.color_hex).map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
      <div class="input-group mat-g" title="Bu renkten 1 adette kaç gram harcanıyor"><input class="input" data-mat-g="${i}" inputmode="decimal" value="${m.grams ?? ''}" placeholder="–"><span class="suffix">g</span></div>
      <button type="button" class="icon-btn rmb" data-act="rm-mat" data-i="${i}" ${ED.materials.length <= 1 ? 'disabled style="opacity:.35"' : ''} aria-label="Kaldır">${icon('x')}</button>
    </div>${matSpoolsHTML(m)}</div>`; }).join('') + (ED.materials.length < 6 ? `<div><button type="button" class="btn btn-sm" data-act="add-mat">${icon('plus')} ${ED.print_type === 'SLA' ? 'Reçine' : 'Filament'} ekle</button></div>` : '');
  $$('#mats [data-brand]').forEach((inp) => inp.addEventListener('input', () => {
    const i = +inp.dataset.brand; ED.materials[i].brand = inp.value; edProfitRender();
    inp.closest('.mat')?.style.setProperty('--m', shapeMask(inp.value, ED.print_type === 'SLA'));
  }));
  $$('#mats [data-mat-g]').forEach((inp) => inp.addEventListener('input', () => {
    const v = numIn(inp.value); ED.materials[+inp.dataset.matG].grams = v != null && v > 0 ? v : null; matGramsSync(); edProfitRender();
  }));
  matGramsSync(true);
  edProfitRender();
}
// Renk gramları: toplamı gösterilir; ürün gramı boşsa (ya da önceden toplamdan doldurulduysa) toplam yazılır
function matGramsSync(initial) {
  const box = $('#mats'); if (!box) return;
  const gs = ED.materials.map((m) => +m.grams || 0), sum = Math.round(gs.reduce((a, b) => a + b, 0) * 10) / 10;
  let el = $('#mat-sum'); if (!el) { el = document.createElement('p'); el.id = 'mat-sum'; el.className = 'mat-sum'; box.after(el); }
  const fg = $('#f-grams'), total = numIn(fg?.value);
  if (fg && !fg.dataset.ms) { fg.dataset.ms = '1'; fg.addEventListener('input', (e) => { if (e.isTrusted) { ED.gramsFromColors = false; matGramsSync(true); } }); }
  if (!initial && sum > 0 && fg && (total == null || total === 0 || ED.gramsFromColors)) { fg.value = sum; ED.gramsFromColors = true; }
  const t2 = numIn(fg?.value);
  el.innerHTML = !sum ? '<small class="muted">Her rengin yanına 1 adette kaç gram harcadığını yazabilirsiniz; maliyet renklere göre hesaplanır.</small>'
    : `<small>Renklerin toplamı <b>${fmtGram(sum)}</b>${t2 && Math.abs(t2 - sum) > 0.5 ? ` · <span class="warn-text">ürün gramı ${fmtGram(t2)}</span> <button type="button" class="linkish" data-act="mat-sum-apply">toplamı yaz</button>` : ''}${gs.some((g) => !g) && gs.some(Boolean) ? ' · <span class="muted">gramı boş renkler kalan grama eşit bölünür</span>' : ''}</small>`;
}

let PAL = null;
// target: rengi değişecek nesne (filament satırı veya parça), onChange: değişince yeniden çiz
function openPalette(btn, target, onChange) {
  closePalette();
  const cur = target;
  if (!cur.color_hex) { cur.color_hex = '#F4F4F1'; cur.color_name = 'Beyaz'; }
  const pop = document.createElement('div');
  pop.className = 'palette-pop';
  pop.innerHTML = `<div class="cur"><span class="swatch${swatchCls(cur.color_hex)}" style="${swatchStyle(cur.color_hex)}"></span><span>${esc(cur.color_name || colorName(cur.color_hex) || cur.color_hex)}</span></div>
    <div class="palette">${PALETTE.map(([hx, nm]) => `<button type="button" class="${hx === 'transparent' ? 'clear' : ''}${hx.toLowerCase() === String(cur.color_hex).toLowerCase() ? ' on' : ''}" style="${swatchStyle(hx)}" data-hex="${hx}" data-name="${esc(nm)}" title="${esc(nm)}" aria-label="${esc(nm)}"></button>`).join('')}</div>
    <label class="custom">Özel renk <input type="color" value="${cur.color_hex === 'transparent' ? '#ffffff' : cur.color_hex}"> <input class="input" placeholder="Renk adı (isteğe bağlı)" style="height:32px" value="${esc(colorName(cur.color_hex) ? '' : cur.color_name || '')}"></label>`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect(), Z = ZF();
  pop.style.left = Math.min(window.innerWidth - 352 * Z, r.left) / Z + 'px';
  const top = (r.bottom + 6) / Z + window.scrollY;
  pop.style.top = (r.bottom + 330 * Z > window.innerHeight ? r.top / Z + window.scrollY - pop.offsetHeight - 6 : top) + 'px';
  const apply = (hex, name) => { target.color_hex = hex; target.color_name = name; onChange(); };
  pop.querySelector('.palette').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; apply(b.dataset.hex, b.dataset.name); closePalette(); };
  const [colorIn, nameIn] = pop.querySelectorAll('.custom input');
  colorIn.oninput = () => apply(colorIn.value.toUpperCase(), nameIn.value.trim());
  nameIn.oninput = () => { if (!colorName(target.color_hex)) apply(target.color_hex, nameIn.value.trim()); };
  PAL = pop;
  setTimeout(() => document.addEventListener('pointerdown', palOutside), 0);
}
function palOutside(e) { if (PAL && !PAL.contains(e.target) && !e.target.closest('[data-act="pick-color"],[data-act="pick-part-color"],[data-act="np-spool-pick"]')) closePalette(); }
function closePalette() { PAL?.remove(); PAL = null; document.removeEventListener('pointerdown', palOutside); }

async function resizeImage(file, max = 900, png = false) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
  } finally { URL.revokeObjectURL(url); }
}

async function handleEditorFile(file, fromModelPicker) {
  const drop = $('#drop');
  try {
    if (/\.3mf$/i.test(file.name)) {
      drop.querySelector('.hint span').textContent = '3MF okunuyor…';
      const r = await api('POST', '/api/parse-3mf', undefined, await file.arrayBuffer());
      $('#f-file').value = file.name;
      if (!$('#f-name').value.trim()) $('#f-name').value = file.name.replace(/\.(gcode\.)?3mf$/i, '').replace(/[_-]+/g, ' ');
      const plates = r.plates || [];
      if (!plates.length) {
        if (r.thumbnail && !ED.thumbnail) setThumb(r.thumbnail);
        toast('Dosya adı alındı. Bu 3MF dilimlenmemiş, süre ve gram bilgisi yok.');
      } else if (plates.length === 1) apply3mf(plates[0]);
      else {
        // birden çok tabla: hangisi bu ürün?
        let box = $('#ed-3mf'); if (!box) { box = document.createElement('div'); box.id = 'ed-3mf'; drop.after(box); }
        box.className = 'ed-3mf';
        box.innerHTML = `<small>Bu dosyada ${plates.length} tabla var; bu ürün hangisi?</small><div class="chips">${plates.map((p, i) => `<button type="button" class="chip" data-i="${i}">${p.thumbnail ? `<span class="mini-thumb" style="${thumbStyle(p.thumbnail)}"></span>` : ''}Tabla ${p.index} · ${p.objects || 1} nesne · ${fmtDur(p.minutes)} · ${fmtGram(p.grams)}</button>`).join('')}</div>`;
        box.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; apply3mf(plates[+b.dataset.i]); box.remove(); };
        toast(`${plates.length} tabla bulundu, birini seçin`);
      }
    } else if (file.type.startsWith('image/')) {
      const data = await resizeImage(file);
      const r = await api('POST', '/api/upload-image', { data });
      setThumb(r.url);
    } else if (!fromModelPicker) {
      $('#f-file').value = file.name;
      toast('Dosya adı alındı');
    }
  } catch (e) { fail(e); }
  finally { const s = drop?.querySelector('.hint span'); if (s) s.textContent = 'Görsel veya .3mf dosyası sürükleyin ya da dokunun'; }
}
// Dilimlenmiş tabladan: tabladaki nesne sayısına bölerek 1 adet (set ürünlerde 1 set) için süre, gram ve renk gramları
function apply3mf(pl) {
  const ss = Math.max(1, parseInt($('#f-set')?.value) || ED.set_size || 1), objs = pl.objects || 1;
  const units = ss > 1 && objs % ss === 0 ? objs / ss : objs;
  const filled = [];
  if (pl.thumbnail && !ED.thumbnail) { setThumb(pl.thumbnail); filled.push('görsel'); }
  if (pl.minutes) { const m = Math.round(pl.minutes / units); $('#f-h').value = Math.floor(m / 60); $('#f-m').value = m % 60; filled.push(`süre ${fmtDur(m)}`); }
  if (pl.grams) { const g = Math.round(pl.grams / units * 10) / 10; $('#f-grams').value = g; filled.push(`${fmtGram(g)}`); }
  if (pl.materials?.length) {
    ED.materials = pl.materials.map((m) => ({ color_hex: m.color_hex, brand: m.brand || '', color_name: colorName(m.color_hex) || '', grams: m.grams ? Math.round(m.grams / units * 10) / 10 : null }));
    renderMats(); filled.push(`${pl.materials.length} renk`);
  }
  const per = ss > 1 ? `1 set (${ss}'li)` : '1 adet';
  toast(units > 1 ? `Tablada ${objs} nesne → ${per} için: ${filled.join(', ')}` : `3MF'den alındı: ${filled.join(', ')}`, { ms: 6000 });
}
function setThumb(url) {
  ED.thumbnail = url;
  const d = $('#drop'); d.classList.add('has'); d.style.setProperty('--img', `url('${url}')`);
}

async function saveProduct() {
  const body = {
    name: $('#f-name').value.trim(), print_type: ED.print_type, thumbnail: ED.thumbnail,
    grams: parseFloat($('#f-grams').value) || 0,
    print_minutes: (parseInt($('#f-h').value) || 0) * 60 + (parseInt($('#f-m').value) || 0),
    ...(ED.group_id ? { variant_label: ($('#f-vlabel')?.value || '').trim() || ED.variant_label } : {}),
    category: ED.category || null, set_size: Math.max(1, parseInt($('#f-set').value) || 1), file_name: $('#f-file').value.trim(),
    stock: parseInt($('#f-stock').value) || 0, min_stock: parseInt($('#f-min').value) || 0,
    barcodes: $('#f-barcodes').value.trim(), notes: $('#f-notes').value.trim(),
    materials: catFlags(ED.category).no_materials ? [] : ED.materials.map((m) => ({ color_hex: m.color_hex, color_name: m.color_name || colorName(m.color_hex), brand: (m.brand || '').trim(), grams: m.grams ?? null })),
    sale_price: $('#f-price').value.trim().replace(',', '.'), extra_cost: $('#f-extra').value.trim().replace(',', '.'),
    commission_pct: $('#f-com').value.trim().replace(',', '.'), cargo_fee: $('#f-cargo').value.trim().replace(',', '.'),
    parts_same_color: ED.parts_same_color ? 1 : 0,
    ...(ED.totalMode && ED.partsOn ? { parts_total: true } : {}),
    parts: ED.partsOn && !catFlags(ED.category).no_parts ? ED.parts.map((x) => ({ id: x.id, component_id: x.component_id || null, name: x.component_id && x.name === compById(x.component_id)?.name ? '' : (x.name || '').trim(), per_unit: Math.max(1, parseInt(x.per_unit) || 1), stock: Math.max(0, parseInt(x.stock) || 0),
      grams: x.grams === '' || x.grams == null ? null : Math.max(0, +x.grams), minutes: x.minutes ?? null,
      ...(ED.parts_same_color ? { color_hex: null, color_name: null, brand: null } : { color_hex: x.color_hex || null, color_name: x.color_name || colorName(x.color_hex) || null, brand: (x.brand || '').trim() || null }) })) : [],
  };
  if (!body.name) { $('#f-name').focus(); return toast('Ürün adını yazın', { bad: true }); }
  if (ED.hadParts && !ED.partsOn && ED.parts.some((x) => x.stock > 0) && !confirm('Parça listesi kaldırılırsa eldeki basılmış parça sayıları silinir. Devam edilsin mi?')) return;
  try {
    if (ED.id) await api('PUT', `/api/products/${ED.id}`, body);
    else await api('POST', '/api/products', body);
    closeModal(); toast(ED.id ? 'Ürün kaydedildi' : 'Ürün eklendi');
    render();
  } catch (e) { fail(e); }
}

// ================================================================== NEW PRINT
let NP = null;
// openNewPrint(productId)  veya  openNewPrint({ orderId })
async function openNewPrint(arg) {
  const orderId = arg && typeof arg === 'object' ? arg.orderId : null;
  const compId = arg && typeof arg === 'object' ? arg.componentId : null;
  const pid = typeof arg === 'number' ? arg : (arg && typeof arg === 'object' && arg.pid) || null;
  try {
    await Promise.all([S.products.length ? null : loadProducts(), loadOrders(), S.settings ? null : loadSettings(), loadComponents(), loadSpools()]);
    // sıralama ve canlı süre için: yazıcı durumları ve Yeni siparişlerdeki eksikler
    await Promise.all([(S.settings?.printers || []).some(hasLink) ? loadBambu() : null, loadFail().catch(() => null)]);
    // Trendyol'daki Yeni siparişler (sıralama için) beklenmeden arkada tazelenir; gelince liste yeniden sıralanır
    if (S.settings?.ty_seller_id && (!S.pick || Date.now() - (S.pickAt || 0) > 300000))
      loadPick(true).then(() => { if (NP && $('#np-list')) npRenderList(); }).catch(() => null);
  } catch (e) { return fail(e); }
  const printable = printableOrders();
  if (!S.products.length && !printable.length) { toast('Önce bir ürün veya özel sipariş ekleyin'); location.hash = '#/urunler'; return; }
  const mode = compId ? (compById(compId)?.kind === 'misc' ? 'misc' : 'comp') : orderId || (!S.products.length && printable.length) ? 'order' : 'product';
  NP = { mode, pid: null, oid: null, cid: null, ptype: 'SLA', printer: localStorage.getItem('lastPrinter') || '', q: '', objects: (arg && typeof arg === 'object' && arg.bambuObjects) || 0 };
  const printers = S.settings?.printers || [];
  NP.printer = printers.some((x) => x.name === NP.printer) ? NP.printer : '';
  openModal(`
    <div class="modal-h"><h2>Yeni baskı</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">
      <div class="seg" id="np-mode">
        <button type="button" data-v="product" class="${mode === 'product' ? 'on' : ''}">Stok ürünü</button>
        ${U('np.order') || mode === 'order' ? `<button type="button" data-v="order" class="${mode === 'order' ? 'on' : ''}">Özel sipariş <span class="faint">${printable.length}</span></button>` : ''}
        ${(S.components || []).length && (U('np.comp') || mode === 'comp') ? `<button type="button" data-v="comp" class="${mode === 'comp' ? 'on' : ''}">Ortak parça</button>` : ''}
        ${U('np.misc') || mode === 'misc' ? `<button type="button" data-v="misc" class="${mode === 'misc' ? 'on' : ''}">Diğer amaçlı</button>` : ''}
      </div>
      <div class="field"><span id="np-q-label">Ne basıyorsunuz?</span>
        <label class="search">${icon('search')}<input class="input" id="np-q" placeholder="Ara" autocomplete="off"></label>
        <div class="picker" id="np-list"></div>
      </div>
      <label class="switch sm np-remember hidden" id="np-remember"><input type="checkbox" id="np-remember-in" checked><span>Yazıcıdaki dosyayı (<b id="np-remember-file"></b>) bu kayda bağla <small class="muted">— sonraki seferde kendiliğinden tanınır. Tek seferlik baskıysa işareti kaldırın.</small></span></label>
      <div class="field hidden" id="np-parts-field"><span>Bu baskıda hangi parçalar var?</span><div id="np-parts"></div></div>
      <div class="row" style="align-items:end">
        <div class="field" id="np-qty-field"><span id="np-qty-label">Kaç adet?</span>
          <div class="stepper big"><button type="button" data-act="np-qty" data-d="-1" aria-label="Azalt">${icon('minus')}</button><input id="np-qty" type="number" inputmode="numeric" min="1" value="1"><button type="button" data-act="np-qty" data-d="1" aria-label="Arttır">${icon('plus')}</button></div></div>
        <div class="field" id="np-time-field"><span>Süre</span><div class="input-group"><input class="input" id="np-h" type="number" inputmode="numeric" min="0" value="0" style="border-radius:8px 0 0 8px"><span class="suffix" style="border-radius:0">sa</span><input class="input" id="np-m" type="number" inputmode="numeric" min="0" max="59" value="0" style="border-radius:0;border-left:0"><span class="suffix">dk</span></div></div>
      </div>
      <div class="np-live hidden" id="np-live"></div>
      <div class="field" id="np-type-field" style="display:none"><span>Baskı türü</span>
        <div class="seg type" id="np-type">${['SLA', 'FDM'].map((t) => `<button type="button" data-v="${t}" class="${t === 'SLA' ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="field hidden" id="np-spools-field"><span>Makara <span class="faint">(isteğe bağlı · bitince gramı buradan düşer)</span></span><div id="np-spools"></div></div>
      ${printers.length ? `<div class="field"><span>Makine</span><div class="chips" id="np-printers">${printerChips('np', NP.printer)}</div></div>`
        : `<p class="side-note" style="margin:0">Makine listesini Ayarlar sayfasından ekleyebilirsiniz.</p>`}
      <div class="np-fail hidden" id="np-fail"></div>
      <div class="ends" id="np-ends">${icon('clock')}<span></span></div>
    </div>
    <div class="modal-f"><div class="right"><button class="btn" data-act="close">Vazgeç</button><button class="btn btn-primary btn-lg" data-act="np-start" id="np-start">Baskıyı başlat</button></div></div>`);

  $('#np-q').addEventListener('input', (e) => { NP.q = e.target.value; npRenderList(); });
  ['#np-h', '#np-m', '#np-qty'].forEach((s) => $(s).addEventListener('input', npEnds));
  ['#np-h', '#np-m'].forEach((s) => $(s).addEventListener('input', (e) => { if (e.isTrusted) NP.timeTouched = true; }));
  $('#np-qty').addEventListener('input', npAutoTime);
  $('#np-printers')?.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; npSetPrinter(NP.printer === b.dataset.v ? '' : b.dataset.v); });
  $('#np-mode').onclick = (e) => { const b = e.target.closest('button'); if (b) npSetMode(b.dataset.v); };
  $('#np-type').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; NP.ptype = b.dataset.v; $$('#np-type button').forEach((x) => x.classList.toggle('on', x === b)); };
  npSetMode(mode, true);
  npSetPrinter(NP.printer);
  if (pid) npPickProduct(pid);
  else if (compId) npPickComp(compId);
  else if (orderId) npPickOrder(orderId);
  else setTimeout(() => $('#np-q')?.focus(), 50);
}
// Baskı penceresinde ürün sırası: yazıcıdaki dosyaya benzeyen → Yeni siparişlerde eksik → çok basılan → diğerleri
const TR_ASCII = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const npNorm = (s) => trLower(s || '').replace(/[çğıöşüâîû]/g, (ch) => TR_ASCII[ch]).replace(/\.(gcode\.)?3mf$|\.gcode$|\.ctb$|\.chitubox$/g, '').replace(/plate[_ ]?\d+/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const NP_STOP = new Set(['v1', 'v2', 'v3', 'v4', 'final', 'yeni', 'new', 'copy', 'kopya', 'pla', 'petg']);
const npTokens = (s) => new Set(npNorm(s).split(' ').filter((w) => w.length >= 2 && !NP_STOP.has(w) && !/^\d+$/.test(w)));
function npFileScore(file, p) {
  const f = npNorm(file); if (!f) return 0;
  if (p.file_name && npNorm(p.file_name) === f) return 1;
  const A = npTokens(file); let best = 0;
  for (const src of [p.file_name, p.base_name || p.name, p.name]) {
    const B = npTokens(src); if (!A.size || !B.size) continue;
    let common = 0; B.forEach((w) => { if (A.has(w) || [...A].some((a) => a.length >= 4 && (a.startsWith(w) || w.startsWith(a)))) common++; });
    best = Math.max(best, common / Math.min(A.size, B.size));
  }
  return best;
}
function npGroups(list) {
  const ev = NP.bambuEvent ? (S.bambu?.events || []).find((e) => e.id === NP.bambuEvent) : null;
  const file = ev?.file || NP.live?.file || '';
  const need = {};
  if (S.pick?.items?.length) analyzePick(S.pick).items.forEach((i) => { if (i.product_id && i.shortage > 0) need[i.product_id] = Math.max(0, i.shortage - (i.p?.in_production || 0)); });
  const by = (a, b) => (b.printed_90 || 0) - (a.printed_90 || 0) || a.name.localeCompare(b.name, 'tr');
  const G = { file: [], need: [], top: [], rest: [] };
  list.forEach((x) => {
    const sc = file ? npFileScore(file, x) : 0;
    const y = { ...x, _need: need[x.id] || 0, _sc: sc };
    if (sc >= 0.5) G.file.push(y); else if (y._need) G.need.push(y); else if (x.printed_90) G.top.push(y); else G.rest.push(y);
  });
  G.file.sort((a, b) => b._sc - a._sc || by(a, b)); G.need.sort((a, b) => b._need - a._need || by(a, b)); G.top.sort(by); G.rest.sort(by);
  return [[G.file, file ? `Yazıcıdaki dosyaya benzeyen · ${esc(file)}` : ''], [G.need, 'Siparişlerde eksik'], [G.top, 'Çok basılanlar (90 gün)'], [G.rest, 'Diğer ürünler']]
    .filter(([items]) => items.length).map(([items, title]) => ({ items, title }));
}
const printableOrders = () => S.orders.filter((o) => ['new', 'printing', 'ready'].includes(o.status) && !o.active_job_id);
// Diğer amaçlı: yazıcıdaki dosya bu kayda bağlansın mı (tek seferlik baskılarda bağlanmasın)
function npRememberUI() {
  const el = $('#np-remember'); if (!el) return;
  const ev = NP.bambuEvent ? (S.bambu?.events || []).find((e) => e.id === NP.bambuEvent) : null;
  const show = NP.mode === 'misc' && ev && ev.reason !== 'parts' && ev.file;
  el.classList.toggle('hidden', !show);
  if (show) $('#np-remember-file').textContent = ev.file;
}
function npSetModeLabel() { const l = $('#np-qty-label'); if (l) l.textContent = 'Kaç adet?'; }
function npSetMode(mode, initial) {
  npSetModeLabel();
  NP.mode = mode; NP.pid = null; NP.oid = null; NP.cid = null; NP.q = ''; NP.parts = null; NP.slots = [];
  $('#np-parts-field').classList.add('hidden'); $('#np-qty-field').classList.remove('hidden');
  if (!initial) $('#np-q').value = '';
  $$('#np-mode button').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
  $('#np-q').placeholder = mode === 'order' ? 'Müşteri adı veya istek ara' : mode === 'comp' ? 'Ortak parça ara' : mode === 'misc' ? 'Ara ya da yeni ad yazın' : 'Ürün ara';
  $('#np-q-label').textContent = mode === 'order' ? 'Hangi siparişi basıyorsunuz?' : mode === 'comp' ? 'Hangi ortak parçayı basıyorsunuz? Bitince havuza eklenir.' : mode === 'misc' ? 'Ne basıyorsunuz? Stoğa eklenmez, filament makaradan düşer.' : 'Ne basıyorsunuz?';
  $('#np-type-field').style.display = mode === 'order' ? '' : 'none';
  npRememberUI(); npRenderList(); npEnds();
}
function npSetPrinter(v) {
  NP.printer = v || '';
  $$('#np-printers .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === NP.printer));
  npLive();
}
// Seçilen Bambu yazıcı şu an basıyorsa süre yazıcıdan gelir; süre alanı gizlenir
function npLive() {
  const st = NP.printer ? bambuLive(NP.printer) : null;
  NP.live = st || null;
  $('#np-time-field')?.classList.toggle('hidden', !!st);
  const box = $('#np-live');
  if (box) {
    box.classList.toggle('hidden', !st);
    const dup = st ? S.jobs.find((j) => j.status === 'printing' && j.printer === NP.printer && j.bambu_task) : null;
    box.classList.toggle('warn', !!dup);
    box.innerHTML = st ? `${printerThumb(NP.printer, 'xs')}<span><b>${esc(NP.printer)}</b> şu an <b>${esc(st.file || 'bir dosya')}</b> basıyor${st.percent != null ? ` · %${st.percent}` : ''}${st.remaining_min ? ` · kalan ${fmtDur(st.remaining_min)}` : ''}.<br>${dup
      ? `<small><b>Bu baskı zaten kayıtlı: ${esc(dup.product_name || '')} ×${dup.quantity}.</b> Yeni kayıt açarsanız ürün iki kez sayılır; başka bir makine seçin.</small>`
      : '<small class="muted">Süre yazıcıdan alınıyor ve baskı boyunca kendiliğinden güncellenir.</small>'}</span>` : '';
  }
  if (st && !NP.bambuEvent) { const ev = (S.bambu?.events || []).find((e) => e.printer === NP.printer); if (ev) NP.bambuEvent = ev.id; }
  if ($('#np-list') && NP.mode === 'product') npRenderList();
  if ($('#np-ends')) npEnds();
}
const npMinutes = () => (NP.live ? Math.max(1, NP.live.remaining_min || 1) : (parseInt($('#np-h')?.value) || 0) * 60 + (parseInt($('#np-m')?.value) || 0));
function npPickComp(id) {
  const c = compById(id); if (!c) return;
  NP.cid = c.id; NP.slots = [];
  // süresi kayıtlı değilse (ya da yazıcıdan geldiyse) girilen süreyi silme
  if (c.print_minutes && !NP.timeTouched) npFill(NP.objects || 1, c.print_minutes * (NP.objects || 1)); else $('#np-qty').value = NP.objects || parseInt($('#np-qty').value) || 1;
  npRenderList(); npEnds();
}
function npRenderList() {
  const q = trLower(NP.q);
  if (NP.mode === 'misc') {
    const list = (S.misc || []).filter((c) => !q || trLower(c.name + ' ' + (c.file_name || '')).includes(q));
    const exact = (S.misc || []).some((c) => trLower(c.name).trim() === q.trim());
    $('#np-list').innerHTML = list.map((c) => `<button type="button" class="pick${NP.cid === c.id ? ' on' : ''}" data-act="np-pick-comp" data-id="${c.id}">
      ${miniThumb(c.thumbnail)}<span><span class="t">${esc(c.name)}</span><br><span class="s">${c.print_minutes ? fmtDur(c.print_minutes) + ' / adet' : 'süre girilmemiş'}${c.grams ? ` · ${fmtGram(c.grams)}` : ''}</span></span>
      ${c.color_hex ? `<span class="spool${swatchCls(c.color_hex)}" style="${swatchStyle(c.color_hex)}"></span>` : ''}</button>`).join('')
      + (q.trim() && !exact ? `<button type="button" class="pick add" data-act="np-misc-new">${icon('plus')}<span><span class="t">“${esc(NP.q.trim())}” olarak yeni ekle</span><br><span class="s">Resim, süre ve gramı sonra Ürünler → Diğer amaçlı\'dan ekleyebilirsiniz.</span></span></button>` : '')
      || '<p class="muted" style="margin:6px 0">Henüz kayıt yok. Yukarıya bir ad yazın (ör. “Raf etiketi”) ve yeni ekleyin.</p>';
    $('#np-list .pick.on')?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (NP.mode === 'comp') {
    const list = (S.components || []).filter((c) => !q || trLower(c.name + ' ' + (c.file_name || '')).includes(q));
    $('#np-list').innerHTML = list.map((c) => `<button type="button" class="pick${NP.cid === c.id ? ' on' : ''}" data-act="np-pick-comp" data-id="${c.id}">
      ${miniThumb(c.thumbnail)}<span><span class="t">${esc(c.name)}</span><br><span class="s">havuzda ${c.stock}${c.in_print ? ` · ${c.in_print} baskıda` : ''} · ${c.used_by.length} üründe · ${fmtDur(c.print_minutes)} / adet</span></span>
      ${c.color_hex ? `<span class="spool${swatchCls(c.color_hex)}" style="${swatchStyle(c.color_hex)}"></span>` : ''}</button>`).join('') || '<p class="muted">Eşleşen ortak parça yok.</p>';
    $('#np-list .pick.on')?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (NP.mode === 'order') {
    const list = printableOrders().filter((o) => !q || trLower([o.first_name, o.last_name, o.title, o.details].join(' ')).includes(q));
    $('#np-list').innerHTML = list.length ? list.map((o) => `<button type="button" class="pick${NP.oid === o.id ? ' on' : ''}" data-act="np-pick-order" data-id="${o.id}">
      ${miniThumb(o.image)}<span><span class="t">${esc(o.first_name)} ${esc(o.last_name || '')}</span><br><span class="s">${esc(o.title || o.details || 'Özel sipariş')} · ${o.quantity} adet${o.status === 'ready' ? ' · yeniden baskı' : ''}</span></span>
      ${o.due_date ? `<span class="s">${dueLabel(o).html}</span>` : ''}</button>`).join('')
      : `<p class="muted" style="margin:6px 0">Basılmayı bekleyen özel sipariş yok. Siparişler sayfasından ekleyebilirsiniz.</p>`;
  } else {
    const list = S.products.filter((x) => !q || trLower(x.name + ' ' + (x.file_name || '')).includes(q));
    const groups = npGroups(list);
    const item = (x) => `<button type="button" class="pick${NP.pid === x.id ? ' on' : ''}" data-act="np-pick" data-id="${x.id}">
      ${miniThumb(x.thumbnail)}<span><span class="t">${esc(x.name)}</span>${x._need ? ` <span class="tag tag-bad">${x._need} eksik</span>` : ''}<br><span class="s">${x.category ? esc(x.category) + ' · ' : ''}${x.print_type} · ${fmtDur(x.print_minutes)}${x.set_size > 1 ? ` · ${x.set_size}'lü set` : ''} · stok ${x.stock}${x.printed_90 ? ` · 90 günde ${x.printed_90} basıldı` : ''}</span></span>${spools(x.materials, 4)}</button>`;
    $('#np-list').innerHTML = list.length ? groups.map((g) => `${g.title ? `<div class="pick-group">${g.title}</div>` : ''}${g.items.map(item).join('')}`).join('')
      : `<p class="muted">Eşleşen ürün yok.</p>`;
  }
  $('#np-list .pick.on')?.scrollIntoView({ block: 'nearest' });
}
function npFill(qty, minutes) {
  $('#np-qty').value = qty || 1;
  $('#np-h').value = Math.floor((minutes || 0) / 60); $('#np-m').value = (minutes || 0) % 60;
}
// Süre 1 set içindir; adet değiştikçe (elle süre girilmediyse) süre de ölçeklenir
function npAutoTime() {
  if ((NP.mode === 'comp' || NP.mode === 'misc') && NP.cid && !NP.timeTouched) {
    const mins = (compById(NP.cid)?.print_minutes || 0) * Math.max(1, parseInt($('#np-qty').value) || 1);
    $('#np-h').value = Math.floor(mins / 60); $('#np-m').value = mins % 60; npEnds(); return;
  }
  if (NP.mode !== 'product' || NP.parts || NP.timeTouched) return;
  const p = productById(NP.pid); if (!p) return;
  const mins = (p.print_minutes || 0) * Math.max(1, parseInt($('#np-qty').value) || 1);
  $('#np-h').value = Math.floor(mins / 60); $('#np-m').value = mins % 60;
  npEnds();
}
function npPickProduct(id) {
  const p = productById(id); if (!p) return;
  NP.pid = p.id; NP.timeTouched = false; NP.slots = [];
  $('#np-qty-label').textContent = p.set_size > 1 ? `Kaç set? (${p.set_size}'lü)` : 'Kaç adet?';
  const multi = p.parts?.length > 0;
  $('#np-parts-field').classList.toggle('hidden', !multi);
  $('#np-qty-field').classList.toggle('hidden', multi);
  if (multi) {
    NP.parts = {};
    npPartsPreset('missing');
  } else {
    NP.parts = null;
    // yazıcıdaki dosyadan tabladaki nesne sayısı okunduysa adet ondan gelir
    const ss = Math.max(1, p.set_size || 1), objs = NP.objects || 0;
    npFill(objs ? (ss > 1 && objs % ss === 0 ? objs / ss : objs) : 1, p.print_minutes);
  }
  npRenderList(); npEnds();
}
// Parça ön ayarları: eksikler (sonraki seti tamamlayan), tam set, temizle
function npPartsPreset(kind) {
  const p = productById(NP.pid);
  p.parts.forEach((x) => {
    const have = x.stock + x.in_print - p.sets_after_print * x.per_unit;
    NP.parts[x.id] = kind === 'full' ? x.per_unit : kind === 'clear' ? 0 : Math.max(0, x.per_unit - have);
  });
  if (kind === 'missing' && !Object.values(NP.parts).some(Boolean)) p.parts.forEach((x) => { NP.parts[x.id] = x.per_unit; });
  npRenderParts();
}
function npRenderParts() {
  const p = productById(NP.pid);
  $('#np-parts').innerHTML = `<div class="np-presets">
      <button type="button" class="chip" data-act="np-preset" data-k="missing">Eksik parçalar</button>
      <button type="button" class="chip" data-act="np-preset" data-k="full">Tam set</button>
      <button type="button" class="chip" data-act="np-preset" data-k="clear">Temizle</button></div>
    <div class="np-parts-list">${p.parts.map((x) => {
      const q = NP.parts[x.id] || 0;
      return `<div class="np-part${q ? ' on' : ''}"><div><b>${partDot(p, x.id)}${esc(x.name)}</b><span class="s">${!p.parts_same_color && x.color_hex ? `${esc(x.color_name || colorName(x.color_hex) || '')}${x.brand ? ' ' + esc(x.brand) : ''} · ` : ''}setde ${x.per_unit} · ${x.shared ? 'havuzda' : 'elde'} ${x.stock}${x.in_print ? ` · baskıda ${x.in_print}` : ''}</span></div>
        <div class="stepper sm"><button type="button" data-act="np-part" data-id="${x.id}" data-d="-1" aria-label="Azalt">${icon('minus')}</button><input type="number" min="0" value="${q}" data-np-part="${x.id}" inputmode="numeric"><button type="button" data-act="np-part" data-id="${x.id}" data-d="1" aria-label="Arttır">${icon('plus')}</button></div></div>`;
    }).join('')}</div>`;
  $$('[data-np-part]').forEach((inp) => inp.addEventListener('input', () => { NP.parts[+inp.dataset.npPart] = Math.max(0, parseInt(inp.value) || 0); inp.closest('.np-part').classList.toggle('on', NP.parts[+inp.dataset.npPart] > 0); npPartsTime(); npEnds(); }));
  npPartsTime(); npEnds();
}
function npPartsTime() {
  if (NP.timeTouched) return;
  const p = productById(NP.pid);
  const sel = Object.values(NP.parts).reduce((a, b) => a + b, 0);
  npFill(1, Math.round((p.print_minutes || 0) * sel / Math.max(1, p.parts_total)));
}
function npPartsOutcome(p) {
  const after = p.parts.map((x) => ({ per: x.per_unit, eff: x.stock + x.in_print + (NP.parts[x.id] || 0) }));
  const sets = Math.min(...after.map((x) => Math.floor(x.eff / x.per)));
  const have = after.reduce((a, x) => a + Math.min(x.per, x.eff - sets * x.per), 0);
  return { gained: sets - p.sets_after_print, missing: p.parts_total - have };
}
function npPickOrder(id) {
  const o = S.orders.find((x) => x.id === id); if (!o) return;
  NP.oid = o.id; npFill(o.quantity, o.print_minutes);
  NP.ptype = o.print_type || 'SLA'; $$('#np-type button').forEach((x) => x.classList.toggle('on', x.dataset.v === NP.ptype));
  if (o.printer) npSetPrinter(o.printer);
  npRenderList(); npEnds();
  if (!o.print_minutes) setTimeout(() => $('#np-h')?.select(), 30);
}
// ---------- baskı için makara yuvaları: her renk bir yuva; öneri renge göre, seçim serbest
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
function colorDist(a, b) { const x = hexRgb(a), y = hexRgb(b); return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : 999; }
const busySpools = () => new Set(S.jobs.filter((j) => j.status === 'printing').flatMap((j) => (j.spools || []).map((x) => x.id)));
function npSlotDefs() {
  const qty = Math.max(1, parseInt($('#np-qty')?.value) || 1);
  if (NP.mode === 'comp' || NP.mode === 'misc') { const c = compById(NP.cid); return c ? [{ hex: c.color_hex, label: c.color_name || colorName(c.color_hex) || 'Renk', grams: (c.grams || 0) * qty }] : []; }
  if (NP.mode === 'order') { const o = S.orders.find((x) => x.id === NP.oid); return o ? [{ hex: null, label: o.resin || (o.print_type === 'FDM' ? 'Filament' : 'Reçine'), grams: (+o.grams || 0) * qty }] : []; }
  const p = productById(NP.pid); if (!p) return [];
  let total = (p.grams || 0) * qty;
  if (NP.parts) {
    const sel = Object.values(NP.parts).reduce((a, b) => a + b, 0);
    total = (p.grams || 0) * sel / Math.max(1, p.parts_total);
    if (!p.parts_same_color) {
      const by = {};
      p.parts.forEach((x) => { const q = NP.parts[x.id] || 0; if (!q || !x.color_hex) return; const k = x.color_hex.toUpperCase(); (by[k] ||= { hex: x.color_hex, label: x.color_name || colorName(x.color_hex) || 'Renk', n: 0 }).n += q; });
      const n = Object.values(by).reduce((a, x) => a + x.n, 0);
      return Object.values(by).map((x) => ({ hex: x.hex, label: x.label, grams: n ? total * x.n / n : 0 }));
    }
  }
  const mats = p.materials || [];
  if (!mats.length) return [{ hex: null, label: 'Filament', grams: total }];
  const known = mats.reduce((a, m) => a + (m.grams || 0), 0);
  return mats.map((m) => ({ hex: m.color_hex, label: m.color_name || colorName(m.color_hex) || 'Renk', brand: m.brand, grams: total * (known && m.grams ? m.grams / known : 1 / mats.length) }));
}
function bestSpool(hex, brand, need, taken) {
  const busy = busySpools();
  const c = matchSpools(hex, brand).filter((x) => !busy.has(x.id) && !taken.has(x.id));
  if (!c.length) return null;
  const enough = c.filter((x) => x.remaining >= need).sort((a, b) => a.remaining - b.remaining);
  return (enough[0] || c[0]).id;
}
function npSyncSlots() {
  const defs = npSlotDefs(), old = NP.slots || [];
  const taken = new Set();
  NP.slots = defs.map((d, i) => {
    const prev = old[i] && old[i].hex === d.hex ? old[i] : null;
    let sid = prev ? prev.spool_id : bestSpool(d.hex, d.brand, d.grams, taken);
    if (sid) taken.add(sid);
    return { ...d, spool_id: sid, grams: prev?.gramsTouched ? prev.grams : Math.round(d.grams), gramsTouched: prev?.gramsTouched };
  });
  const box = $('#np-spools-field'); if (!box) return;
  box.classList.toggle('hidden', !NP.slots.length || (!(S.spools || []).length && NP.mode !== 'order'));
  $('#np-spools').innerHTML = NP.slots.map((sl, i) => {
    const sp = sl.spool_id ? spoolById(sl.spool_id) : null;
    const warn = sp && sl.grams > sp.remaining ? `<small class="warn-text">makarada ${Math.round(sp.remaining)} g var</small>` : sp && sl.hex && String(sp.color_hex).toUpperCase() !== String(sl.hex).toUpperCase() ? '<small class="faint">farklı renk</small>' : '';
    return `<div class="np-slot">
      <span class="np-slot-color">${sl.hex ? `<span class="spool${swatchCls(sl.hex)}" style="${swatchStyle(sl.hex)}"></span>` : ''}${esc(sl.label)}</span>
      <button type="button" class="np-slot-pick${sp ? '' : ' empty'}" data-act="np-spool-pick" data-i="${i}">${sp ? spoolChip(sp) : '<span class="faint">Makara seç</span>'}</button>
      <div class="input-group np-slot-g"><input class="input" type="number" min="0" data-slot-g="${i}" value="${sl.grams}"><span class="suffix">g</span></div>${warn}
    </div>`;
  }).join('');
  $$('[data-slot-g]').forEach((inp) => inp.addEventListener('input', () => { const sl = NP.slots[+inp.dataset.slotG]; sl.grams = Math.max(0, parseFloat(inp.value) || 0); sl.gramsTouched = true; }));
}
function openSpoolPicker(btn, i) {
  closePalette();
  const sl = NP.slots[i], busy = busySpools();
  const all = (S.spools || []).filter((x) => (x.remaining || 0) > 0);
  const same = sl.hex ? all.filter((x) => String(x.color_hex).toUpperCase() === String(sl.hex).toUpperCase()) : [];
  const near = sl.hex ? all.filter((x) => !same.includes(x) && colorDist(x.color_hex, sl.hex) < 90).sort((a, b) => colorDist(a.color_hex, sl.hex) - colorDist(b.color_hex, sl.hex)) : [];
  const rest = all.filter((x) => !same.includes(x) && !near.includes(x));
  const item = (x) => `<button type="button" class="sp-opt${x.id === sl.spool_id ? ' on' : ''}" data-sid="${x.id}">${spoolArt(x, 'sm')}
    <span class="grow"><b>#${esc(x.code)}</b> ${esc(x.color_name || colorName(x.color_hex) || '')} <span class="faint">${esc([x.brand, x.material].filter(Boolean).join(' · '))}</span></span>
    <span class="${x.remaining < sl.grams ? 'warn-text' : ''}">${Math.round(x.remaining)} g</span>${busy.has(x.id) ? '<span class="tag tag-warn">baskıda</span>' : ''}</button>`;
  const sec = (t, l) => l.length ? `<div class="sp-sec">${t}</div>${l.map(item).join('')}` : '';
  const pop = document.createElement('div');
  pop.className = 'palette-pop spool-pop';
  pop.innerHTML = `<input class="input" placeholder="ID veya renk ara" id="sp-pop-q" autocomplete="off"><div class="sp-opts">
    ${sec('Bu renk', same)}${sec('Benzer renkler', near)}${sec('Diğer makaralar', rest)}
    ${all.length ? '' : '<p class="muted">Kalan filamenti olan makara yok.</p>'}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-sid="0">Makara kullanma</button>`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect(), Z = ZF();
  pop.style.left = Math.max(8, Math.min(window.innerWidth - 400 * Z, r.left)) / Z + 'px';
  pop.style.top = (r.bottom + 360 * Z > window.innerHeight ? Math.max(8, r.top - 366 * Z) : r.bottom + 6) / Z + window.scrollY + 'px';
  pop.onclick = (e) => { const b = e.target.closest('[data-sid]'); if (!b) return; sl.spool_id = +b.dataset.sid || null; closePalette(); npSyncSlots(); };
  $('#sp-pop-q', pop).addEventListener('input', (e) => { const q = trLower(e.target.value); $$('.sp-opt', pop).forEach((o) => { o.style.display = !q || trLower(o.textContent).includes(q) ? '' : 'none'; }); });
  PAL = pop;
  setTimeout(() => { document.addEventListener('pointerdown', palOutside); $('#sp-pop-q', pop)?.focus(); }, 0);
}

function npEnds() {
  npSyncSlots(); npFailWarn();
  const min = npMinutes();
  const el = $('#np-ends span');
  const picked = NP.mode === 'order' ? S.orders.find((o) => o.id === NP.oid) : NP.mode === 'comp' || NP.mode === 'misc' ? compById(NP.cid) : productById(NP.pid);
  if (!picked) { el.innerHTML = NP.mode === 'order' ? 'Listeden bir sipariş seçin.' : NP.mode === 'comp' ? 'Listeden bir ortak parça seçin.' : NP.mode === 'misc' ? 'Listeden seçin ya da yeni bir ad yazıp ekleyin.' : 'Listeden bir ürün seçin.'; $('#np-start').disabled = true; return; }
  $('#np-start').disabled = min < 1;
  if (min < 1) { el.innerHTML = 'Baskı süresini girin.'; return; }
  if (NP.mode === 'product' && NP.parts) {
    const sel = Object.values(NP.parts).reduce((a, b) => a + b, 0);
    if (!sel) { el.innerHTML = 'En az bir parça seçin.'; $('#np-start').disabled = true; return; }
    const o = npPartsOutcome(picked);
    const res = o.gained > 0 ? `<b class="ok-text">${o.gained} set tamamlanır</b>${o.missing ? `, sonraki set için ${o.missing} parça kalır` : ''}` : `bitince sonraki set için <b>${o.missing}/${picked.parts_total}</b> parça kalır`;
    el.innerHTML = `<b>${fmtClock(nowS() + min * 60)}</b> civarı biter (${fmtDur(min)}). ${sel} parça · ${res}.`;
    return;
  }
  const qty = parseInt($('#np-qty').value) || 1;
  let extra = '';
  if (NP.mode === 'product' && picked.set_size > 1) extra += ` · ${qty * picked.set_size} parça`;
  if (NP.mode === 'product' && picked.grams) extra += ` · yaklaşık ${fmtGram(picked.grams * qty)}`;
  if (NP.mode === 'order') extra = '. Başarılı olursa sipariş Hazır\'a geçer';
  if (NP.mode === 'misc') extra = `${picked.grams ? ` · yaklaşık ${fmtGram(picked.grams * qty)}` : ''}. Stoğa eklenmez`;
  if (NP.mode === 'comp') {
    const waiting = picked.used_by.filter((u) => { const pp = productById(u.id); return pp?.parts?.some((x) => !x.shared && x.stock > 0); }).length;
    extra = `. Bitince havuza eklenir${waiting ? `; ön yüzü hazır ${waiting} ürünün seti tamamlanır` : ''}`;
  }
  el.innerHTML = `<b>${fmtClock(nowS() + min * 60)}</b> civarı biter (${NP.live ? 'yazıcıdaki kalan süre ' : ''}${fmtDur(min)})${extra}. ${NP.live ? 'Yazıcı bitirince sonucu soracağım.' : 'Süre dolunca sonucu soracağım.'}`;
}
// Bambu uyarısından: yazıcı, kalan süre ve (biliniyorsa) ürün hazır gelir
async function openFromBambu(ev) {
  await openNewPrint(ev.component_id ? { bambuObjects: ev.objects || 0, componentId: ev.component_id } : { bambuObjects: ev.objects || 0, pid: ev.product_id || null });
  if (!NP) return;
  NP.bambuEvent = ev.id;
  npSetPrinter(ev.printer); npRememberUI();
  if (ev.remaining_min) { NP.timeTouched = true; $('#np-h').value = Math.floor(ev.remaining_min / 60); $('#np-m').value = ev.remaining_min % 60; npEnds(); }
  const box = $('.modal-b');
  if (ev.reason === 'confirm') {
    if (ev.guess_qty && NP.mode === 'product' && !NP.parts) { $('#np-qty').value = ev.guess_qty; npAutoTime(); npEnds(); }
    const st = $('#np-start'); if (st) st.innerHTML = `${icon('check')} ${ev.done ? 'Onayla, sonucu gir' : 'Onayla, baskıyı aç'}`;
    box?.insertAdjacentHTML('afterbegin', `<div class="notice confirm">${printerThumb(ev.printer, 'xs')}<div><b>${esc(ev.printer)}</b> ${ev.done ? '<b>bitirdi</b>' : 'basıyor'}: <b>${esc(ev.file || 'bir dosya')}</b>${ev.objects ? ` · tablada ${ev.objects} nesne` : ''}.<br>Tahminim: <b>${esc(ev.guess || '')}${ev.guess_qty ? ` ×${ev.guess_qty}` : ''}</b>. Doğruysa onaylayın; değilse listeden doğru ürünü seçin (dosya o ürüne öğretilir).</div></div>`);
    return;
  }
  box?.insertAdjacentHTML('afterbegin', `<div class="notice">${printerThumb(ev.printer, 'xs')}<div><b>${esc(ev.printer)}</b> ${ev.done ? 'bitirdi' : 'şu an'} <b>${esc(ev.file || 'bir dosya')}</b> ${ev.done ? '' : 'basıyor'}${ev.percent ? ` (%${ev.percent})` : ''}${ev.objects ? `, tablada ${ev.objects} nesne var` : ''}. ${ev.reason === 'parts' ? 'Bu baskıda hangi parçaların olduğunu seçin.' : 'Hangi ürün olduğunu seçin; bu dosyayı bir dahaki sefere tanırım. Satılmayan bir baskıysa (dükkan malzemesi vb.) <b>Diğer amaçlı</b> sekmesini seçin.'}</div></div>`);
}
async function startPrint() {
  const qty = parseInt($('#np-qty').value) || 0;
  const minutes = npMinutes();
  const body = { quantity: qty, duration_minutes: minutes, printer: NP.printer };
  if (NP.mode === 'order') { body.order_id = NP.oid; body.print_type = NP.ptype; }
  else if (NP.mode === 'comp' || NP.mode === 'misc') body.component_id = NP.cid;
  else body.product_id = NP.pid;
  if (NP.bambuEvent) body.bambu_event = NP.bambuEvent;
  if (NP.mode === 'misc' && $('#np-remember-in') && !$('#np-remember-in').checked) body.remember_file = false;
  body.spools = (NP.slots || []).filter((x) => x.spool_id).map((x) => ({ spool_id: x.spool_id, grams: x.grams }));
  if (NP.mode === 'product' && NP.parts) body.parts = Object.entries(NP.parts).filter(([, q]) => q > 0).map(([id, q]) => ({ part_id: +id, quantity: q }));
  try {
    const j = await api('POST', '/api/jobs', body);
    // özel siparişte gram sadece baskı penceresinde girildiyse siparişe de yaz (maliyet hesabı için)
    if (NP.mode === 'order') {
      const o = S.orders.find((x) => x.id === NP.oid), g = (NP.slots || [])[0]?.grams || 0;
      if (o && !(+o.grams) && g > 0) api('PUT', `/api/orders/${o.id}`, { grams: Math.round(g / Math.max(1, qty) * 10) / 10 }).catch(() => {});
    }
    if (NP.printer) localStorage.setItem('lastPrinter', NP.printer);
    S.pqStarted = true;
    if (S.printQueue?.length) setTimeout(printQueueNext, 350);
    if (NP.bambuEvent && S.bambu?.events) { S.bambu.events = S.bambu.events.filter((e) => e.id !== NP.bambuEvent); renderBambuEvents(); }
    closeModal();
    toast(NP.mode === 'order' ? `${j.product_name} baskıya alındı` : j.parts?.length ? `${j.product_name}: ${j.quantity} parça üretime alındı` : `${j.product_name} ×${j.quantity} üretime alındı`);
    askNotifyOnce();
    await loadJobs(); render();
  } catch (e) { fail(e); }
}

// ================================================================== PRINTS
PAGES.baskilar = {
  async load() {
    const [, , hist] = await Promise.all([loadJobs(), loadProducts(), api('GET', '/api/jobs?status=history&limit=80'), loadHist()]);
    S.history = hist;
  },
  html() {
    const act = S.jobs.filter((j) => j.status === 'printing');
    const ST = { success: ['Başarılı', 'ok'], partial: ['Kısmen', 'warn'], failed: ['Başarısız', 'bad'], cancelled: ['İptal', 'mute'] };
    return `<div class="section-gap">
      <section>
        ${U('sec.baskilar.timeline') ? timelineHTML() : ''}
        ${dueJobs().length > 1 && U('sec.baskilar.bulk') ? `<div class="notice bulk-notice">${icon('check')}<div><b>${dueJobs().length} baskı sonuç bekliyor.</b> Hepsini tek pencerede girin.</div><button class="btn btn-primary btn-sm" data-act="bulk-open">Toplu gir <kbd>T</kbd></button></div>` : ''}
        <div class="toolbar" style="margin-bottom:12px"><h2 style="margin:0;font:700 24px/1 var(--display)">Devam eden</h2><span class="spacer"></span><button class="btn btn-primary" data-act="new-print">${icon('plus')} Yeni baskı</button></div>
        ${act.length ? `<div class="joblist">${act.map((j) => `<div class="jobrow" data-job="${j.id}" style="view-transition-name:job-${j.id}">
          <div class="job-visual">${stackHTML(j)}${printerThumb(j.printer, 'badge')}</div>
          <div style="min-width:0"><div class="t">${j.is_order ? '<span class="tag tag-order">Özel</span> ' : ''}${esc(j.product_name)} <span class="muted" style="font-weight:500">×${j.quantity}${j.parts?.length ? ' parça' : ''}</span></div>
            ${bambuLine(j)}<div class="s">${j.printer ? `<span class="pr-inline">${printerThumb(j.printer, 'xs')}${esc(j.printer)}</span> · ` : ''}başladı ${fmtClock(j.started_at)} · bitiş ${fmtClock(j.ends_at)}</div>
            ${partsLine(j)}${spoolsLine(j)}
            <div class="prog ${j.print_type}"><i data-prog="${j.id}"></i></div></div>
          <div class="right"><div class="left-time" data-countdown="${j.id}"></div><div class="job-actions" data-due-actions="${j.id}" style="margin:0"></div></div>
        </div>`).join('')}</div>` : `<div class="empty panel"><h3>Devam eden baskı yok</h3><p>Yazıcıya bir iş gönderdiğinizde buradan başlatın; bitince sonucu sorarım ve başarılıysa stoğa eklerim.</p><button class="btn btn-primary" data-act="new-print">${icon('plus')} Yeni baskı</button></div>`}
      </section>
      ${!U('sec.baskilar.history') ? '' : `<section id="hist-sec">${histHTML()}</section>`}</div>`;
  },
};

// ------------------------------------------------------------------ baskı geçmişi (sayfa sayfa, seçip silme, gram ve tarih)
const HIST_SIZES = [10, 20, 50, 100];
const histSize = () => { let n = 10; try { n = +localStorage.getItem('histSize') || 10; } catch {} return HIST_SIZES.includes(n) ? n : 10; };
async function loadHist() {
  const n = histSize(), off = Math.max(0, S.hOff || 0);
  S.hp = await api('GET', `/api/jobs/history?limit=${n}&offset=${off}`);
  if (!S.hp.items.length && off > 0) { S.hOff = Math.max(0, Math.floor((S.hp.total - 1) / n) * n); S.hp = await api('GET', `/api/jobs/history?limit=${n}&offset=${S.hOff}`); }
  S.hsel = new Set([...(S.hsel || [])].filter((id) => S.hp.items.some((j) => j.id === id)));
  return S.hp;
}
const fmtJobDay = (t) => {
  const d = new Date(t * 1000), n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
  const day = d.toDateString() === n.toDateString() ? 'Bugün' : d.toDateString() === y.toDateString() ? 'Dün'
    : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short', ...(d.getFullYear() !== n.getFullYear() ? { year: 'numeric' } : {}) });
  return `${day} <span class="faint">${fmtClock(t)}</span>`;
};
// Baskının gramı: makaradan düşülen > 3MF dosyasından okunan > ürün gramı × adet (tahmini)
function jobGrams(j) {
  const used = (j.spools || []).reduce((a, x) => a + (+x.used || 0), 0);
  if (used > 0) return { g: used, k: 'used', t: 'Makaralardan düşülen' };
  if (+j.file_grams > 0) return { g: +j.file_grams, k: 'file', t: 'Baskı dosyasından (dilimleyicinin hesabı)' };
  if (+j.unit_grams > 0) return { g: +j.unit_grams * (j.quantity || 1), k: 'est', t: 'Ürün gramı × adet (tahmini)' };
  return null;
}
const fmtG = (g) => g >= 1000 ? `${(g / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg` : `${Math.round(g).toLocaleString('tr-TR')} g`;
function histHTML() {
  const d = S.hp || { items: [], total: 0 }, n = histSize(), off = S.hOff || 0, sel = S.hsel || new Set();
  const ST = { success: ['Başarılı', 'ok'], partial: ['Kısmen', 'warn'], failed: ['Başarısız', 'bad'], cancelled: ['İptal', 'mute'] };
  const allOn = d.items.length && d.items.every((j) => sel.has(j.id));
  const pageG = d.items.reduce((a, j) => a + (jobGrams(j)?.g || 0), 0);
  const head = `<div class="hist-bar"><h2>Geçmiş</h2><span class="muted">${d.total} baskı</span><span class="spacer"></span>
    <span class="hist-selbar" id="hist-selbar"${sel.size ? '' : ' hidden'}><b id="hist-seln">${sel.size}</b> seçili
      <button class="btn btn-sm btn-ghost" data-act="h-clear">Seçimi kaldır</button>
      <button class="btn btn-sm btn-bad" data-act="h-del">${icon('trash')} Seçilenleri sil</button></span>
    <label class="hist-size"><span>Göster</span><select class="input" id="hist-size">${HIST_SIZES.map((v) => `<option value="${v}"${v === n ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    ${d.total > n ? `<span class="hist-pager"><button class="btn btn-sm btn-ghost" data-act="h-page" data-d="-1"${off <= 0 ? ' disabled' : ''} aria-label="Önceki sayfa">‹</button>
      <span>${off + 1}–${Math.min(off + n, d.total)} / ${d.total}</span>
      <button class="btn btn-sm btn-ghost" data-act="h-page" data-d="1"${off + n >= d.total ? ' disabled' : ''} aria-label="Sonraki sayfa">›</button></span>` : ''}</div>`;
  if (!d.items.length) return `${head}<p class="muted">Tamamlanan baskılar burada listelenir.</p>`;
  return `${head}<div class="tbl-wrap"><table class="tbl hist-tbl"><thead><tr>
      <th class="hk"><input type="checkbox" class="hchk" data-act="h-selall" aria-label="Sayfadakilerin hepsini seç"${allOn ? ' checked' : ''}></th><th></th><th>Ürün</th><th>Sonuç</th><th class="num">Adet</th><th class="num">Gram</th><th>Makine</th><th>Baskı tarihi</th><th class="num">Süre</th><th></th></tr></thead><tbody>
    ${d.items.map((j) => { const g = jobGrams(j), dur = j.finished_at && j.started_at ? Math.max(0, j.finished_at - j.started_at) : 0;
      return `<tr class="${sel.has(j.id) ? 'hsel' : ''}" data-hrow="${j.id}"><td class="hk"><input type="checkbox" class="hchk" data-act="h-sel" data-id="${j.id}" aria-label="Seç"${sel.has(j.id) ? ' checked' : ''}></td>
      <td style="width:56px">${miniThumb(j.thumbnail)}</td><td>${j.is_order ? '<span class="tag tag-order">Özel</span> ' : j.is_misc ? '<span class="tag tag-mute">Diğer</span> ' : ''}${j.product_id ? `<a class="pd-link" href="#/urun?id=${j.product_id}">${esc(j.product_name)}</a>` : esc(j.product_name)}</td>
      <td><span class="tag tag-${ST[j.status]?.[1]}">${ST[j.status]?.[0] || j.status}</span></td>
      <td class="num">${j.good_quantity ?? 0}<span class="faint">/${j.quantity}</span></td>
      <td class="num hg-${g?.k || 'none'}" title="${g ? g.t : 'Gram bilgisi yok'}">${g ? `${g.k === 'est' ? '≈' : ''}${fmtG(g.g)}` : '<span class="faint">–</span>'}</td>
      <td class="muted">${j.printer ? `<span class="pr-inline">${printerThumb(j.printer, 'xs')}${esc(j.printer)}</span>` : ''}</td>
      <td class="nowrap">${fmtJobDay(j.started_at)}</td><td class="num muted nowrap">${dur ? fmtDur(dur / 60) : ''}</td>
      <td style="text-align:right">${j.product_id || j.component_id ? `<button class="btn btn-sm btn-ghost" data-act="reprint" data-id="${j.id}" title="Aynı ürün, adet, makine ve makaralarla">${icon('refresh')}<span class="hide-sm"> Tekrar bas</span></button>` : ''}</td></tr>`; }).join('')}
    </tbody><tfoot><tr><td colspan="5" class="muted">Bu sayfada</td><td class="num"><b>${pageG ? fmtG(pageG) : '–'}</b></td><td colspan="4" class="faint">≈ tahmini · gri: dosyadan</td></tr></tfoot></table></div>`;
}
async function histReload() { await Promise.all([loadHist(), api('GET', '/api/jobs?status=history&limit=80').then((h) => { S.history = h; })]); const el = $('#hist-sec'); if (el && route() === 'baskilar') el.innerHTML = histHTML(); }
function histSelSync() {
  const sel = S.hsel || new Set(), bar = $('#hist-selbar');
  if (bar) { bar.hidden = !sel.size; $('#hist-seln').textContent = sel.size; }
  $$('#hist-sec tr[data-hrow]').forEach((tr) => tr.classList.toggle('hsel', sel.has(+tr.dataset.hrow)));
  const all = $('#hist-sec [data-act=h-selall]'); if (all) all.checked = (S.hp?.items || []).length > 0 && S.hp.items.every((j) => sel.has(j.id));
}
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'hist-size') return;
  try { localStorage.setItem('histSize', e.target.value); } catch {}
  S.hOff = 0; S.hsel = new Set(); try { await histReload(); } catch (err) { fail(err); }
});

// ------------------------------------------------------------------ makine zaman çizelgesi
// Her makine bir satır: geçmiş birkaç saat (soluk), şu anki baskı, bitiş ve sonrasındaki boş zaman.
function timelineHTML() {
  const printers = (S.settings?.printers || []).map((p) => p.name).filter(Boolean);
  const act = (S.jobs || []).filter((j) => j.status === 'printing');
  const hist = (S.history || []).filter((j) => j.status !== 'cancelled' && j.finished_at);
  const names = [...printers];
  act.concat(hist).forEach((j) => { if (j.printer && !names.includes(j.printer) && (j.status === 'printing' || j.finished_at > nowS() - 6 * 3600)) names.push(j.printer); });
  if (act.some((j) => !j.printer)) names.push('');
  if (!names.length) return '';
  const t = nowS(), H = 3600;
  const lastEnd = Math.max(t, ...act.map((j) => j.ends_at));
  const w0 = Math.floor((t - 3 * H) / H) * H;
  const w1 = Math.ceil(Math.min(t + 24 * H, Math.max(t + 6 * H, lastEnd + H)) / H) * H;
  const span = w1 - w0, X = (v) => ((Math.max(w0, Math.min(w1, v)) - w0) / span * 100).toFixed(3);
  const narrow = window.matchMedia('(max-width: 760px)').matches;
  const step = narrow ? (span <= 12 * H ? 3 * H : 6 * H) : span <= 12 * H ? H : span <= 18 * H ? 2 * H : 3 * H;
  const ticks = []; for (let v = Math.ceil(w0 / step) * step; v <= w1; v += step) ticks.push(v);
  const states = Object.fromEntries(printerStates().map((o) => [o.name, o]));
  const dot = (n) => { const o = states[n]; return o ? `<i class="tl-dot s-${o.s}"></i>` : ''; };
  const row = (name) => {
    const mine = act.filter((j) => (j.printer || '') === name).sort((a, b) => a.started_at - b.started_at);
    const run = mine.filter((j) => j.ends_at > t);
    const waiting = mine.filter((j) => j.ends_at <= w0);   // çoktan bitmiş, sonucu girilmemiş
    const past = hist.filter((j) => (j.printer || '') === name && j.finished_at > w0);
    const free = run.length ? Math.max(...run.map((j) => j.ends_at)) : t;
    const freeMin = Math.round((w1 - free) / 60);
    const bar = (j, kind) => {
      const st = j.started_at, en = kind === 'past' ? j.finished_at : j.ends_at;
      if (en <= w0) return '';
      const due = kind === 'act' && j.ends_at <= t;
      const cls = kind === 'past' ? `past ${j.status}` : due ? 'due' : 'run';
      const tip = `${j.product_name} ×${j.quantity} · ${fmtClock(st)}–${fmtClock(en)}${kind === 'past' ? ` · ${({ success: 'başarılı', partial: 'kısmen', failed: 'başarısız' })[j.status] || ''}` : due ? ' · sonuç bekliyor' : ` · ${fmtDur((en - t) / 60)} kaldı`}`;
      return `<button type="button" class="tl-bar ${cls}" style="left:${X(st)}%;width:calc(${X(en)}% - ${X(st)}%)" title="${esc(tip)}" ${kind === 'act' ? `data-act="tl-job" data-id="${j.id}"` : 'tabindex="-1"'}>
        ${miniThumb(j.thumbnail)}<span>${esc(j.product_name)}${j.quantity > 1 ? ` ×${j.quantity}` : ''}</span>${kind === 'act' ? `<small>${due ? 'sonuç bekliyor' : fmtClock(en)}</small>` : ''}</button>`;
    };
    return `<div class="tl-row">
      <div class="tl-name">${name ? printerThumb(name, 'xs') : ''}<span>${name ? esc(name) : '<span class="muted">Makinesiz</span>'}</span>${dot(name)}</div>
      <div class="tl-track">
        ${free < w1 ? `<div class="tl-free" style="left:${X(free)}%;width:calc(100% - ${X(free)}%)">${freeMin >= 45 ? `<span>${run.length ? `${fmtClock(free)} sonrası boş` : 'şu an boş'}</span>` : ''}</div>` : ''}
        ${past.map((j) => bar(j, 'past')).join('')}${mine.filter((j) => j.ends_at > w0).map((j) => bar(j, 'act')).join('')}
        ${waiting.length ? `<button type="button" class="tl-wait" data-act="tl-job" data-id="${waiting[0].id}" title="${esc(waiting.map((j) => `${j.product_name} ×${j.quantity}`).join(', '))}">${waiting.length} baskı sonuç bekliyor</button>` : ''}
      </div></div>`;
  };
  const idle = names.filter((n) => n && !act.some((j) => j.printer === n && j.ends_at > t)).length;
  return `<section class="panel tl"><div class="panel-h"><h2>Makine çizelgesi</h2><span class="muted" style="font-size:13px">${idle ? `${idle} makine şu an boşta` : 'tüm makineler çalışıyor'}</span></div>
    <div class="panel-b"><div class="tl-grid">
      <div class="tl-row tl-axis"><div class="tl-name"></div><div class="tl-track">${ticks.filter((v) => Math.abs(v - t) / span > (narrow ? 0.09 : 0.035)).map((v) => `<span style="left:${X(v)}%">${fmtClock(v)}</span>`).join('')}</div></div>
      ${names.map(row).join('')}
      <div class="tl-row tl-overlay" aria-hidden="true"><div class="tl-name"></div><div class="tl-track">${ticks.map((v) => `<i class="tl-tick" style="left:${X(v)}%"></i>`).join('')}<i class="tl-now" style="left:${X(t)}%"><b>şimdi</b></i></div></div>
    </div></div></section>`;
}

// ------------------------------------------------------------------ live ticker
function tick() {
  const t = nowS();
  S.jobs.forEach((j) => {
    if (j.status !== 'printing') return;
    const p = jobProgress(j);
    const left = j.ends_at - t;
    $$(`[data-stack="${j.id}"]`).forEach((el) => { el.style.setProperty('--p', (p * 100).toFixed(2) + '%'); el.classList.toggle('done', left <= 0); });
    $$(`[data-prog="${j.id}"]`).forEach((el) => { el.style.width = (p * 100).toFixed(2) + '%'; });
    $$(`[data-countdown="${j.id}"]`).forEach((el) => { el.textContent = left > 0 ? countdown(left) : jobDone(j) ? 'Bitti' : 'bitiyor'; });
    $$(`[data-job="${j.id}"]`).forEach((el) => el.classList.toggle('due', left <= 0));
    $$(`[data-due-actions="${j.id}"]`).forEach((el) => {
      const want = left <= 0 ? 'due' : 'run';
      if (el.dataset.mode === want) return;
      el.dataset.mode = want;
      el.innerHTML = left <= 0
        ? `<button class="btn btn-sm btn-ok" data-act="job-result" data-id="${j.id}">${icon('check')} Sonucu gir</button>`
        : `<button class="btn btn-sm" data-act="job-menu" data-id="${j.id}">Düzenle</button>`;
    });
  });
  $$('[data-eta]').forEach((el) => { el.textContent = fmtEta(+el.dataset.eta - t); });
  $$('[data-dl]').forEach((el) => {
    const dl = +el.dataset.dl, u = urgency(dl, +el.dataset.need || 0);
    el.textContent = fmtLeft(dl - t); el.className = `dl dl-${u}`;
  });
  const nowDue = S.jobs.filter((j) => j.status === 'printing' && j.ends_at <= t).length;
  if (nowDue > (S.lastDueCount || 0)) setTimeout(checkDue, 50);
  S.lastDueCount = nowDue;
  if (S.titleFlash) document.title = (Math.floor(Date.now() / 1000) % 2 ? '● Baskı bitti' : $('#page-title').textContent) + ' · ' + appName();
}
setInterval(tick, 1000);

// ------------------------------------------------------------------ due prints → prompt + notification
function notifiedSet() { try { return new Set(JSON.parse(localStorage.getItem('notified') || '[]')); } catch { return new Set(); } }
function markNotified(id) { const s = notifiedSet(); s.add(id); try { localStorage.setItem('notified', JSON.stringify([...s].slice(-200))); } catch { /* */ } }

function checkDue() {
  const due = dueJobs();
  S.titleFlash = due.length > 0;
  if (!due.length) { hideDueBanner(); return; }
  const seen = notifiedSet();
  due.forEach((j) => {
    if (seen.has(j.id)) return;
    markNotified(j.id);
    if (U('nf.sound')) beep();
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification('Baskı bitti: ' + j.product_name, { body: `${j.quantity} adet${j.printer ? ' · ' + j.printer : ''}. Başarılı mı?`, tag: 'job-' + j.id, requireInteraction: true, icon: '/static/icon.svg' });
        n.onclick = () => { window.focus(); n.close(); openResult(j.id); };
      } catch { /* bazı mobil tarayıcılar yalnızca service worker bildirimine izin verir */ }
    }
  });
  const next = due.find((j) => !S.dismissed[j.id] || Date.now() - S.dismissed[j.id] > 5 * 60 * 1000);
  if (!next || S.promptOpen) return;
  if (!$('#modal-root').children.length) openResult(next.id);
  else showDueBanner(next);
}

// ---------- aynısını tekrar bas: aynı ürün/parça, adet, makine ve (hâlâ duruyorsa) aynı makaralar
async function reprint(j) {
  if (!j) return;
  if (j.is_order) { if (!S.orders?.length) await loadOrders().catch(() => {}); if (!printableOrders().some((o) => o.id === j.order_id)) return toast('Bu sipariş artık basılmayı beklemiyor'); await openNewPrint({ orderId: j.order_id }); }
  else if (j.component_id) await openNewPrint({ componentId: j.component_id });
  else if (j.product_id) await openNewPrint(j.product_id);
  else return;
  if (!NP) return;
  if (j.printer) npSetPrinter(j.printer);
  if (NP.mode === 'product' && NP.parts && j.parts?.length) {
    Object.keys(NP.parts).forEach((k) => { NP.parts[k] = 0; });
    j.parts.forEach((x) => { if (x.part_id in NP.parts) NP.parts[x.part_id] = x.quantity; });
    npRenderParts();
  } else if (NP.mode !== 'order') { $('#np-qty').value = j.quantity; npAutoTime(); }
  if (!NP.live && j.started_at && (j.finished_at || j.ends_at)) {   // son seferki gerçek süre
    const m = Math.max(1, Math.round(((j.finished_at && j.status !== 'printing' ? Math.min(j.finished_at, j.ends_at) : j.ends_at) - j.started_at) / 60));
    if (m > 1) { NP.timeTouched = true; $('#np-h').value = Math.floor(m / 60); $('#np-m').value = m % 60; }
  }
  npSyncSlots();
  (j.spools || []).forEach((sp, i) => { const sl = NP.slots[i]; const cur = spoolById(sp.id); if (sl && cur && cur.remaining > 0 && !busySpools().has(sp.id)) sl.spool_id = sp.id; });
  npEnds();
}

// ---------- toplu sonuç: biten tüm baskılar tek pencerede
function openBulkResults() {
  const due = dueJobs();
  if (!due.length) return toast('Sonucu beklenen baskı yok');
  if (due.length === 1) return openResult(due[0].id);
  S.promptOpen = true; hideDueBanner();
  S.bulk = Object.fromEntries(due.map((j) => [j.id, { ok: true, good: j.quantity }]));
  openModal(`<div class="modal-h"><h2>Biten baskılar <span class="faint">${due.length}</span></h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b"><p class="muted" style="margin:0">Hepsi sağlam sayıldı; sorunlu olanı işaretleyin ya da sağlam adedi düzeltin. Filament planlanan gram kadar düşer.</p>
      <div class="bulk-list">${due.map((j) => `<div class="bulk-row" data-bj="${j.id}">
        <div class="bulk-vis">${miniThumb(j.thumbnail)}</div>
        <div class="grow"><b>${esc(j.product_name)}</b><small>${j.parts?.length ? `${j.quantity} parça` : `${j.quantity} adet`}${j.printer ? ' · ' + esc(j.printer) : ''} · ${fmtWhen(j.ends_at)} bitti${j.bambu_state === 'FAILED' ? ' · <span class="bad-text">yazıcı hata bildirdi</span>' : ''}${j.is_misc ? ' · diğer amaçlı' : j.is_order ? ' · özel sipariş' : ''}</small></div>
        ${j.parts?.length || j.is_order ? '<span class="muted bulk-all">tümü</span>' : `<div class="stepper sm"><button type="button" data-act="bulk-q" data-id="${j.id}" data-d="-1" aria-label="Azalt">${icon('minus')}</button><input type="number" min="0" value="${j.quantity}" data-bq="${j.id}" inputmode="numeric"><button type="button" data-act="bulk-q" data-id="${j.id}" data-d="1" aria-label="Arttır">${icon('plus')}</button></div>`}
        <div class="seg bulk-ok"><button type="button" class="on" data-act="bulk-ok" data-id="${j.id}" data-v="1">${icon('check')} Sağlam</button><button type="button" data-act="bulk-ok" data-id="${j.id}" data-v="0">${icon('x')} Sorunlu</button></div>
      </div>`).join('')}</div></div>
    <div class="modal-f"><button class="btn btn-ghost" data-act="close">Sonra</button><div class="right"><button class="btn btn-primary btn-lg" data-act="bulk-save" id="bulk-save">${icon('check')} ${due.length} sonucu kaydet</button></div></div>`, 'wide', () => { S.promptOpen = false; });
  $$('[data-bq]').forEach((i) => i.addEventListener('input', () => { S.bulk[+i.dataset.bq].good = Math.max(0, parseInt(i.value) || 0); }));
  if (dueJobs().some((j) => j.bambu_state === 'FAILED')) dueJobs().filter((j) => j.bambu_state === 'FAILED').forEach((j) => ACTIONS['bulk-ok']({ dataset: { id: j.id, v: '0' } }));
}
async function saveBulk() {
  const btn = $('#bulk-save'); btn.disabled = true;
  let ok = 0, bad = 0, added = 0; const errs = [];
  for (const [id, v] of Object.entries(S.bulk || {})) {
    const j = S.jobs.find((x) => x.id === +id); if (!j) continue;
    try {
      const body = { success: v.ok };
      if (v.ok && !j.parts?.length && !j.is_order) body.good_quantity = v.good;
      const r = await api('POST', `/api/jobs/${id}/complete`, body);
      if (v.ok) { ok++; added += r.good_quantity || 0; } else bad++;
    } catch (e) { errs.push(`${j.product_name}: ${e.message}`); }
  }
  S.promptOpen = false; closeModal(true);
  toast(`${ok} sağlam${bad ? `, ${bad} sorunlu` : ''} kaydedildi${added ? ` · ${added} adet/parça eklendi` : ''}${errs.length ? ` · ${errs.length} hata` : ''}`, errs.length ? { bad: true, ms: 7000 } : {});
  errs.forEach((m) => console.warn(m));
  await Promise.all([loadJobs(), loadProducts(), loadComponents()]); render();
}

let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.22].forEach((d, k) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = k ? 1046 : 784; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + d + 0.35);
      o.connect(g).connect(audioCtx.destination); o.start(audioCtx.currentTime + d); o.stop(audioCtx.currentTime + d + 0.4);
    });
  } catch { /* ses yok */ }
}
// İade: dikkat çeken, iki kez çalan üçlü uyarı (kare dalga, yükselen); soru: yumuşak çift "ding"
function tone(t0, f, dur, type = 'sine', vol = 0.22) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
function soundClaim() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const t = audioCtx.currentTime + 0.02;
    [0, 1.1].forEach((r) => [[0, 660], [0.16, 880], [0.32, 1175]].forEach(([d, f]) => tone(t + r + d, f, 0.22, 'square', 0.09)));
  } catch { /* ses yok */ }
}
function soundQuestion() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const t = audioCtx.currentTime + 0.02;
    tone(t, 1568, 0.9, 'sine', 0.18); tone(t + 0.18, 2093, 1.1, 'sine', 0.14);
  } catch { /* ses yok */ }
}
document.addEventListener('pointerdown', () => { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* */ } }, { once: true });

function askNotifyOnce() {
  if (!('Notification' in window) || !window.isSecureContext) return;
  if (Notification.permission === 'default' && !localStorage.getItem('askedNotify')) {
    localStorage.setItem('askedNotify', '1');
    Notification.requestPermission();
  }
}

function openResult(id) {
  const j = S.jobs.find((x) => x.id === id);
  if (!j) return;
  S.promptOpen = true;
  hideDueBanner();
  const p = productById(j.product_id);
  const due = dueJobs();
  const pos = due.findIndex((x) => x.id === id);
  const okLabel = j.is_order ? 'Hazır' : j.is_misc ? 'Tamamlandı' : j.is_component ? 'Havuza ekle' : j.parts?.length ? 'Parçaları ekle' : 'Stoğa ekle';
  openModal(`
    <div class="done-head">
      <span class="done-pulse"></span>
      <div><b>Baskı bitti</b>${due.length > 1 ? `<button type="button" class="linkish on-dark" data-act="bulk-open">${due.length} baskıyı birlikte gir</button>` : ''}<span>${due.length > 1 ? `${pos + 1} / ${due.length} · ` : ''}${fmtClock(j.started_at)}'de başladı, ${fmtDur(Math.round((j.ends_at - j.started_at) / 60))} sürdü</span></div>
      <button class="icon-btn" data-act="res-later" data-id="${j.id}" aria-label="Sonra sor">${icon('x')}</button>
    </div>
    <div class="modal-b">
      <div class="result">
        <div class="result-visual">${stackHTML(j, 'done')}${printerThumb(j.printer, 'badge')}</div>
        <div><h3>${esc(j.product_name)}</h3>
          <p class="muted" style="margin:6px 0 0">${j.parts?.length ? `${j.quantity} parça` : p?.set_size > 1 ? `${j.quantity} set (${j.quantity * p.set_size} adet)` : `${j.quantity} adet`}${j.printer ? ' · ' + esc(j.printer) : ''}</p>
          ${j.is_order ? '<span class="tag tag-order" style="margin-top:6px">Özel sipariş</span>' : ''}${j.is_component ? '<span class="tag tag-pool" style="margin-top:6px">Ortak parça · havuza</span>' : ''}${j.is_misc ? '<span class="tag tag-misc" style="margin-top:6px">Diğer amaçlı · stoğa eklenmez</span>' : ''}</div>
        ${j.is_order ? `<p class="muted" style="margin:0;font-size:14px">Sağlam derseniz sipariş Hazır'a geçer; sorunlu derseniz tekrar basılmak üzere Yeni'ye döner.</p>`
        : j.parts?.length ? `<div class="res-parts"><span class="muted" style="font-size:13px">Sağlam çıkan parçalar (sorunlu olanları azaltın)</span>${j.parts.map((x) => `<div class="np-part on"><div><b>${partDot(p, x.part_id)}${esc(x.name)}</b><span class="s">${x.quantity} basıldı</span></div>
            <div class="stepper sm"><button type="button" data-act="res-part" data-id="${x.part_id}" data-d="-1" aria-label="Azalt">${icon('minus')}</button><input type="number" min="0" max="${x.quantity}" value="${x.quantity}" data-res-part="${x.part_id}"><button type="button" data-act="res-part" data-id="${x.part_id}" data-d="1" aria-label="Arttır">${icon('plus')}</button></div></div>`).join('')}</div>`
        : j.quantity > 1 || j.bambu_task || j.is_component || j.is_misc ? `<div class="field" style="justify-items:center"><span>${p?.set_size > 1 ? `Sağlam çıkan set (${p.set_size}'lü)` : 'Sağlam çıkan adet'}</span>
          <div class="stepper"><button type="button" data-act="res-qty" data-d="-1" aria-label="Azalt">${icon('minus')}</button><input id="res-qty" type="number" inputmode="numeric" min="0" max="${j.bambu_task || j.is_component || j.is_misc ? 999 : j.quantity}" value="${j.quantity}"><button type="button" data-act="res-qty" data-d="1" aria-label="Arttır">${icon('plus')}</button></div></div>` : ''}
        ${j.spools?.length ? `<div class="res-spools"><span class="muted" style="font-size:13px">Harcanan filament (sorunlu baskıda da düşer)</span>${j.spools.map((x) => {
          const planned = j.bambu_state === 'FAILED' && j.bambu_percent != null ? Math.round((x.grams || 0) * j.bambu_percent / 100) : Math.round(x.grams || 0);
          return `<div class="np-slot">${spoolChip(x)}<span class="muted" style="font-size:12.5px">${esc([x.brand, x.material].filter(Boolean).join(' · '))}</span>
            <div class="input-group np-slot-g"><input class="input" type="number" min="0" data-res-spool="${x.id}" value="${planned}"><span class="suffix">g</span></div></div>`; }).join('')}</div>` : ''}
        ${j.bambu_state === 'FAILED' ? `<div class="notice" style="background:var(--bad-wash);width:100%">${icon('bell')}<div><b>${esc(j.printer)}</b> baskının yarıda kaldığını ya da başarısız olduğunu bildirdi.</div></div>` : ''}
        ${j.bambu_task && !j.is_order && !j.parts?.length ? `<p class="faint" style="margin:-4px 0 0;font-size:12.5px">Yazıcıdan otomatik açıldı; adet bir önceki baskıdan tahmin edildi, gerekirse düzeltin.</p>` : ''}
        ${j.is_order ? '' : `<button type="button" class="linkish" data-act="job-change" data-id="${j.id}">${icon('edit')} Yanlış ürün mü? Basılan ürünü değiştir</button>`}
        <div class="choices ${j.bambu_task ? 'two' : 'three'}">
          <button class="choice ok" data-act="res-ok" data-id="${j.id}">${icon('check')}<b>Sağlam</b><span>${okLabel}</span></button>
          <button class="choice bad" data-act="res-fail" data-id="${j.id}">${icon('x')}<b>Sorunlu</b><span>${j.is_order ? "Yeni'ye dön" : j.is_misc ? 'Başarısız kaydet' : 'Stoğa eklenmez'}</span></button>
          ${j.bambu_task ? '' : `<button class="choice wait" data-act="res-wait" data-id="${j.id}">${icon('clock')}<b>Henüz bitmedi</b><span>Süre ekle</span></button>`}
        </div>
        <div class="wait-opts hidden" id="wait-opts">
          ${[[15, '+15 dk'], [30, '+30 dk'], [60, '+1 sa'], [120, '+2 sa']].map(([m, l]) => `<button class="chip" data-act="res-snooze" data-id="${j.id}" data-m="${m}">${l}</button>`).join('')}
        </div>
        <button type="button" class="linkish res-ign" data-act="res-ignore" data-id="${j.id}" title="Stoğa eklenmez, başarısız sayılmaz, makaradan düşülmez">${icon('x')} Yoksay: bu baskı hiç olmamış gibi sil</button>
      </div>
    </div>`, 'narrow result-modal', () => { S.promptOpen = false; S.dismissed[id] = Date.now(); });
  tick();
}
// Başka bir pencere açıkken baskı biterse iş kaybolmasın: üstte uyarı şeridi
function showDueBanner(j) {
  let el = $('#due-banner');
  if (!el) { el = document.createElement('div'); el.id = 'due-banner'; document.body.appendChild(el); }
  el.innerHTML = `<span class="done-pulse"></span><span><b>Baskı bitti:</b> ${esc(j.product_name)}</span><button class="btn btn-sm btn-ok" data-act="banner-open" data-id="${j.id}">Sonucu gir</button>`;
  el.classList.add('show');
}
function hideDueBanner() { $('#due-banner')?.classList.remove('show'); }

async function finishJob(id, success) {
  const good = parseInt($('#res-qty')?.value);
  const partsGood = $$('[data-res-part]').map((i) => ({ part_id: +i.dataset.resPart, good: Math.max(0, parseInt(i.value) || 0) }));
  const spoolUsed = $$('[data-res-spool]').map((i) => ({ spool_id: +i.dataset.resSpool, grams: Math.max(0, parseFloat(i.value) || 0) }));
  $$('.result .choice').forEach((b) => { b.disabled = true; });
  try {
    const r = await api('POST', `/api/jobs/${id}/complete`, { success, good_quantity: isNaN(good) ? undefined : good, parts_good: partsGood.length ? partsGood : undefined, spool_used: spoolUsed.length ? spoolUsed : undefined });
    if (success && (r.good_quantity || r.is_order)) await celebrate(r);
    closeModal();
    if (r.is_misc) toast(success && r.good_quantity ? `${r.product_name} ×${r.good_quantity} tamamlandı` : `${r.product_name} başarısız olarak kaydedildi`);
    else if (r.is_component) {
      toast(success && r.good_quantity ? `+${r.good_quantity} ${r.product_name} havuza eklendi${assembledText(r.assembled_products)}` : `${r.product_name} başarısız olarak kaydedildi`);
      loadComponents();
    } else if (r.parts?.length) {
      toast(!success ? `${r.product_name} başarısız olarak kaydedildi`
        : r.assembled ? `${r.assembled} adet ${r.product_name} tamamlandı, stoğa eklendi${r.parts_missing ? ` · sonraki set için ${r.parts_missing} parça eksik` : ''}`
        : `${r.good_quantity} parça eklendi · ${r.product_name} için ${r.parts_missing} parça eksik`);
    } else if (r.is_order) toast(success ? `${r.product_name}: Hazır` : `${r.product_name}: başarısız, sipariş Yeni'ye döndü`);
    else toast(success && r.good_quantity ? `${r.good_quantity} adet ${r.product_name} stoğa eklendi` : `${r.product_name} başarısız olarak kaydedildi`, { action: 'Tekrar bas', onAction: () => reprint(r) });
    await loadJobs(); S.titleFlash = dueJobs().length > 0; render();
  } catch (e) { fail(e); }
}

// Başarı anı: tik çizilir, katmanlar yerine oturur, sonra pencere kapanır
function celebrate(r) {
  const box = $('.result'); if (!box) return Promise.resolve();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const label = r.is_order ? 'Hazır' : r.is_misc ? 'Tamam' : r.is_component ? `+${r.good_quantity} havuza` : r.parts?.length ? (r.assembled ? `+${r.assembled} stoğa` : `+${r.good_quantity} parça`) : `+${r.good_quantity} stoğa`;
  box.insertAdjacentHTML('beforeend', `<div class="celebrate"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23"/><path d="M15 27l7 7 15-16"/></svg><b>${label}</b>${'<i></i>'.repeat(10)}</div>`);
  return new Promise((ok) => setTimeout(ok, reduce ? 250 : 1050));
}

function openJobMenu(id) {
  const j = S.jobs.find((x) => x.id === id);
  if (!j) return;
  openModal(`<div class="modal-h"><h2>${esc(j.product_name)}</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b"><p class="muted" style="margin:0">${j.quantity} adet · bitiş ${fmtClock(j.ends_at)}</p>
      <div style="display:grid;gap:8px">
        <button class="btn" data-act="job-snooze" data-id="${id}" data-m="15">Süreyi 15 dk uzat</button>
        <button class="btn" data-act="job-snooze" data-id="${id}" data-m="60">Süreyi 1 saat uzat</button>
        <button class="btn" data-act="job-finish-now" data-id="${id}">${icon('check')} Şimdi bitti, sonucu gir</button>
        ${j.is_order ? '' : `<button class="btn" data-act="job-change" data-id="${id}">${icon('edit')} Basılan ürünü değiştir</button>`}
        <button class="btn btn-bad" data-act="job-cancel" data-id="${id}">${icon('x')} ${j.is_order ? "Baskıyı iptal et (sipariş Yeni'ye döner)" : 'Baskıyı iptal et (stoğa eklenmez)'}</button>
      </div></div>`, 'narrow');
}

// ---------- basılan ürünü düzelt (yanlış seçilmiş ya da yazıcı yanlış tanımış)
let JC = null;
async function openJobChange(id) {
  const j = S.jobs.find((x) => x.id === id); if (!j) return;
  await Promise.all([S.products.length ? null : loadProducts(), loadComponents()]).catch(() => {});
  const file = (j.note || '').startsWith('Bambu: ') ? j.note.slice(7).trim() : '';
  JC = { id, file, sel: null, q: '' };
  const sets = j.parts?.length ? null : j.quantity;
  openModal(`<div class="modal-h"><h2>Basılan ürünü değiştir</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">
      <p class="muted" style="margin:0">Şu an: <b>${esc(j.product_name)}</b> · ${j.quantity} ${j.parts?.length ? 'parça' : 'adet'}${j.printer ? ' · ' + esc(j.printer) : ''}${file ? `<br><small>Yazıcıdaki dosya: ${esc(file)}</small>` : ''}</p>
      <label class="search">${icon('search')}<input class="input" id="jc-q" placeholder="Ürün, ortak parça ya da diğer amaçlı ara" autocomplete="off"></label>
      <div class="picker" id="jc-list"></div>
      <div class="row" style="align-items:end">
        <div class="field"><span id="jc-qty-l">Kaç adet?</span><div class="stepper"><button type="button" data-act="jc-qty" data-d="-1" aria-label="Azalt">${icon('minus')}</button><input id="jc-qty" type="number" inputmode="numeric" min="1" value="${sets || 1}"><button type="button" data-act="jc-qty" data-d="1" aria-label="Arttır">${icon('plus')}</button></div></div>
      </div>
      ${file ? `<label class="switch sm np-remember"><input type="checkbox" id="jc-remember" checked><span>Bu dosyayı (<b>${esc(file)}</b>) seçtiğim ürüne bağla <small class="muted">— yazıcı bir dahaki sefere doğru ürünü tanır</small></span></label>` : ''}
      <p class="faint" style="margin:0;font-size:12.5px">Stoğa henüz bir şey eklenmedi; baskı bitince seçtiğiniz ürüne eklenir. Makara önerisi yeni ürünün rengine göre yenilenir.</p>
    </div>
    <div class="modal-f"><div class="right"><button class="btn" data-act="close">Vazgeç</button><button class="btn btn-primary" data-act="jc-save" id="jc-save" disabled>Değiştir</button></div></div>`);
  $('#jc-q').addEventListener('input', (e) => { JC.q = e.target.value; jcRender(); });
  jcRender(); setTimeout(() => $('#jc-q')?.focus(), 50);
}
function jcRender() {
  const q = trLower(JC.q).trim(), j = S.jobs.find((x) => x.id === JC.id);
  const hit = (x) => !q || trLower(x.name + ' ' + (x.file_name || '')).includes(q);
  const prods = S.products.filter(hit).map((p) => ({ p, sc: JC.file ? npFileScore(JC.file, p) : 0 }))
    .sort((a, b) => b.sc - a.sc || (b.p.printed_90 || 0) - (a.p.printed_90 || 0) || a.p.name.localeCompare(b.p.name, 'tr')).map((x) => x.p);
  const cur = (k, id) => (k === 'p' ? j?.product_id === id : j?.component_id === id) ? ' <span class="tag tag-mute">şu anki</span>' : '';
  const item = (k, x, sub) => `<button type="button" class="pick${JC.sel?.k === k && JC.sel.id === x.id ? ' on' : ''}" data-act="jc-pick" data-k="${k}" data-id="${x.id}">
    ${miniThumb(x.thumbnail)}<span><span class="t">${esc(x.name)}</span>${cur(k, x.id)}<br><span class="s">${sub}</span></span></button>`;
  const g = (title, html) => html ? `<div class="pick-group">${title}</div>${html}` : '';
  $('#jc-list').innerHTML = g('Ürünler', prods.slice(0, 60).map((p) => item('p', p, `${p.category ? esc(p.category) + ' · ' : ''}stok ${p.stock}${p.parts?.length ? ` · ${p.parts_total} parçalı set` : ''}`)).join(''))
    + g('Ortak parçalar', (S.components || []).filter(hit).map((c) => item('c', c, `havuzda ${c.stock}`)).join(''))
    + g('Diğer amaçlı', (S.misc || []).filter(hit).map((c) => item('c', c, 'stoğa eklenmez')).join(''))
    || '<p class="muted">Eşleşen yok.</p>';
}
async function jcSave() {
  if (!JC?.sel) return;
  const body = { quantity: Math.max(1, parseInt($('#jc-qty').value) || 1), remember_file: $('#jc-remember') ? $('#jc-remember').checked : false };
  if (JC.sel.k === 'p') body.product_id = JC.sel.id; else body.component_id = JC.sel.id;
  $('#jc-save').disabled = true;
  try {
    const r = await api('POST', `/api/jobs/${JC.id}/change`, body);
    if (S.dismissed) delete S.dismissed[JC.id];   // süresi dolmuşsa sonuç penceresi doğru ürünle yeniden açılsın
    closeModal(); toast(`Baskı düzeltildi: ${r.product_name} ×${r.quantity}`);
    await loadJobs(); render();
  } catch (e) { fail(e); $('#jc-save').disabled = false; }
}

// ================================================================== ORDERS
const OST = {
  new: { l: 'Yeni', dot: 'var(--ink-3)', next: 'printing', nl: 'Baskıya al' },
  printing: { l: 'Baskıda', dot: 'var(--resin)', next: 'ready', nl: 'Hazır' },
  ready: { l: 'Hazır', dot: 'var(--ok)', next: 'delivered', nl: 'Teslim et' },
  delivered: { l: 'Teslim edildi', dot: 'var(--ink-2)' },
  cancelled: { l: 'İptal', dot: 'var(--bad)' },
};
const localToday = () => new Date().toLocaleDateString('sv');
const dayNum = (d) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) / 86400000; };
const addDays = (d, n) => { const t = new Date((dayNum(d) + n) * 86400000); return t.toISOString().slice(0, 10); };
const fmtDay = (d) => new Date(dayNum(d) * 86400000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const smallIcon = (n) => `<svg style="width:14px;height:14px;vertical-align:-2px"><use href="#i-${n}"/></svg>`;

function dueLabel(o) {
  if (!o.due_date) return { html: '', cls: '', days: null };
  const days = dayNum(o.due_date) - dayNum(localToday());
  const done = ['delivered', 'cancelled'].includes(o.status);
  const txt = days === 0 ? 'Termin bugün' : days === 1 ? 'Termin yarın' : days < 0 ? `${-days} gün gecikti` : `Termin ${fmtDay(o.due_date)} · ${days} gün`;
  const cls = done ? 'muted' : days < 0 ? 'due-late' : days <= 1 ? 'due-soon' : 'muted';
  return { html: `<span class="${cls}">${smallIcon('clock')} ${done ? 'Termin ' + fmtDay(o.due_date) : txt}</span>`, cls, days };
}

S.oSrc = (() => { try { return localStorage.getItem('oSrc') || 'ty'; } catch { return 'ty'; } })();
PAGES.siparisler = {
  async load() {
    const jobs = [loadOrders(), loadJobs(), S.settings ? null : loadSettings(), loadProfit().catch(() => null)];
    if (S.oSrc === 'ty') jobs.push(loadTyOrders(), loadProfit(), S.components ? null : loadComponents());
    else if (!S.tyOrders) jobs.push(loadTyOrders().catch(() => {}));
    await Promise.all(jobs);
  },
  html() {
    const tyN = S.tyOrders ? (S.tyOrders.counts.new || 0) : null;
    const cuN = S.orders.filter((o) => ['new', 'printing', 'ready'].includes(o.status)).length;
    const src = `<div class="seg src-seg"><button class="${S.oSrc === 'ty' ? 'on' : ''}" data-act="osrc" data-v="ty">Trendyol${tyN != null ? ` <span class="faint">${tyN} yeni</span>` : ''}</button><button class="${S.oSrc === 'custom' ? 'on' : ''}" data-act="osrc" data-v="custom">Özel siparişler <span class="faint">${cuN}</span></button></div>`;
    if (S.oSrc === 'ty') return `<div class="toolbar">${src}</div>${tyoPage()}`;
    return customOrdersHTML(src);
  },
  after() {
    if (S.oSrc === 'ty') return tyoBind();
    $('#show-cancel').onchange = (e) => { S.showCancelled = e.target.checked; render(); };
    $('#co-sort')?.addEventListener('change', (e) => { S.coSort = e.target.value; try { localStorage.setItem('coSort', S.coSort); } catch { /* */ } render(); });
    const mq = window.matchMedia('(max-width: 760px)');
    $('#otabs').style.display = mq.matches ? '' : 'none';
    if (!mq.matches) $$('.kcol').forEach((c) => c.classList.add('on'));
  },
};
const CO_SORTS = [['due', 'Termin: en yakın'], ['date_desc', 'Geliş: yeniden eskiye'], ['date_asc', 'Geliş: eskiden yeniye'], ['price_desc', 'Fiyat: yüksekten'], ['price_asc', 'Fiyat: düşükten'], ['qty_desc', 'Adet: çoktan'], ['unpaid', 'Kalan ödeme: çoktan'], ['name', 'Müşteri (A–Z)']];
S.coSort = (() => { try { return localStorage.getItem('coSort') || 'due'; } catch { return 'due'; } })();
function coSorted(list) {
  const day = (d) => (d ? dayNum(d) : 1e9), od = (o) => (o.order_date ? dayNum(o.order_date) : 0) * 1e6 + (o.created_at || 0) / 1e4;
  const by = { due: (a, b) => day(a.due_date) - day(b.due_date) || od(a) - od(b), date_desc: (a, b) => od(b) - od(a), date_asc: (a, b) => od(a) - od(b),
    price_desc: (a, b) => (b.price || 0) - (a.price || 0), price_asc: (a, b) => (a.price ?? 1e9) - (b.price ?? 1e9), qty_desc: (a, b) => (b.quantity || 0) - (a.quantity || 0),
    unpaid: (a, b) => ((b.price || 0) - (b.paid || 0)) - ((a.price || 0) - (a.paid || 0)),
    name: (a, b) => `${a.first_name} ${a.last_name || ''}`.localeCompare(`${b.first_name} ${b.last_name || ''}`, 'tr') }[S.coSort] || null;
  return by ? [...list].sort(by) : list;
}
function customOrdersHTML(src) {
    const cols = ['new', 'printing', 'ready', 'delivered'].concat(S.showCancelled ? ['cancelled'] : []);
    return `<div class="toolbar">${src}<span class="spacer"></span>
        <label class="flt"><span>Sırala</span><select class="input" id="co-sort">${CO_SORTS.map(([k, l]) => `<option value="${k}"${(S.coSort || 'due') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="switch"><input type="checkbox" id="show-cancel" ${S.showCancelled ? 'checked' : ''}> İptalleri göster</label>
        <button class="btn btn-primary" data-act="new-order">${icon('plus')} Sipariş ekle</button></div>
      <div class="toolbar"><div class="seg" id="otabs">${['new', 'printing', 'ready', 'delivered'].map((s) => `<button class="${S.ordersTab === s ? 'on' : ''}" data-act="otab" data-v="${s}">${s === 'delivered' ? 'Teslim' : OST[s].l} <span class="faint">${S.orders.filter((o) => o.status === s).length}</span></button>`).join('')}</div></div>
      <div class="kanban tabs">${cols.map((s) => {
        let list = S.orders.filter((o) => o.status === s);
        if (s === 'delivered') list = list.sort((a, b) => b.updated_at - a.updated_at).slice(0, 30);
        else list = coSorted(list);
        return `<section class="kcol${S.ordersTab === s ? ' on' : ''}" data-col="${s}"><div class="kcol-h"><h3 style="--dot:${OST[s].dot}"><i></i>${OST[s].l}</h3><span class="n">${list.length}</span></div>
          <div class="cards">${list.length ? list.map(orderCard).join('') : `<div class="kempty">${s === 'new' ? 'Yeni özel sipariş geldiğinde buraya ekleyin.' : s === 'printing' ? 'Siparişteki "Baskıya al" ile başlatılan baskılar burada görünür.' : 'Boş'}</div>`}</div></section>`;
      }).join('')}</div>`;
}

function orderCardCompact(o) {
  const day = o.updated_at ? new Date(o.updated_at * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '';
  return `<article class="ocard compact" data-act="edit-order" data-id="${o.id}" style="view-transition-name:o-${o.id}">
    <span class="who">${esc(o.first_name)} ${esc(o.last_name || '')}</span>
    <span class="what">${esc(o.title || o.details || '')}</span>
    <span class="muted">${day}</span></article>`;
}
function orderCard(o) {
  if (o.status === 'delivered' || o.status === 'cancelled') return orderCardCompact(o);
  const rem = o.price != null ? (o.price || 0) - (o.paid || 0) : null;
  const nx = OST[o.status]?.next;
  const machine = o.job_printer || o.printer;
  const job = o.active_job_id ? S.jobs.find((j) => j.id === o.active_job_id) : null;
  return `<article class="ocard" data-act="edit-order" data-id="${o.id}" style="view-transition-name:o-${o.id}">
    ${o.image ? `<div class="img" style="${thumbStyle(o.image)}"></div>` : ''}
    <div class="who">${esc(o.first_name)} ${esc(o.last_name || '')}</div>
    ${o.title || o.details ? `<div class="what">${esc(o.title || o.details)}</div>` : ''}
    <div class="dates">${o.order_date ? `<span class="muted">Geldi ${fmtDay(o.order_date)}</span>` : ''}${dueLabel(o).html}</div>
    <div class="bottom"><span class="muted">${o.quantity} adet${o.resin ? ' · ' + esc(o.resin) : ''}</span>${machine ? `<span class="tag tag-mute pr-inline" style="padding-left:3px">${printerThumb(machine, 'xs')}${esc(machine)}</span>` : ''}</div>
    ${job ? `<div class="oprog"><div class="prog ${job.print_type}"><i data-prog="${job.id}"></i></div><span data-countdown="${job.id}"></span></div>` : ''}
    ${o.price != null ? `<div class="bottom"><span>${fmtMoney(o.price)}</span>${rem > 0 ? `<span class="tag tag-warn">${fmtMoney(rem)} kaldı</span>` : '<span class="tag tag-ok">Ödendi</span>'}</div>` : ''}
    ${(() => { const c = orderCost(o); return c.grams ? `<div class="bottom o-cost-line"><span class="muted">${fmtGram(c.grams)}${c.cost != null ? ` · malzeme ${fmtTL(c.cost)}` : ''}</span>${c.cost != null && o.price ? `<span class="${o.price - c.cost >= 0 ? 'ok-text' : 'bad-text'}">kalan ${fmtTL(o.price - c.cost)}</span>` : ''}</div>` : ''; })()}
    ${o.status === 'printing' && !o.active_job_id
      ? `<div class="nojob"><span>Baskı süresi girilmemiş, Baskılar'da görünmüyor.</span><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm btn-primary" data-act="order-print" data-id="${o.id}">Süreyi gir, baskıya ekle</button><button class="btn btn-sm" data-act="order-advance" data-id="${o.id}">Hazır</button></div></div>`
      : nx ? `<button class="btn btn-sm advance" data-act="order-advance" data-id="${o.id}">${OST[o.status].nl}</button>` : ''}
  </article>`;
}

let OE = null;
function openOrderEditor(id) {
  const o = id ? structuredClone(S.orders.find((x) => x.id === id))
    : { first_name: '', last_name: '', phone: '', title: '', details: '', quantity: 1, price: '', paid: '', order_date: localToday(), due_date: '', print_minutes: null, printer: '', status: 'new', image: null, file_name: '', resin: '', grams: null, print_type: 'SLA' };
  OE = o; OE.print_type ||= 'SLA';
  if (!S.profit) loadProfit().then(orderCostHint).catch(() => {});
  const wa = waLink(o.phone);
  const printers = S.settings?.printers || [];
  const pm = o.print_minutes || 0;
  openModal(`
    <div class="modal-h"><h2>${id ? 'Siparişi düzenle' : 'Yeni özel sipariş'}</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">
      <div class="row">
        <label class="field"><span>Ad</span><input class="input" id="o-fn" value="${esc(o.first_name)}" autocomplete="off"></label>
        <label class="field"><span>Soyad</span><input class="input" id="o-ln" value="${esc(o.last_name || '')}" autocomplete="off"></label>
      </div>
      <label class="field"><span>Telefon</span>
        <div class="input-group"><input class="input" id="o-phone" type="tel" value="${esc(o.phone || '')}" placeholder="05xx xxx xx xx">
        ${o.phone ? `<a class="btn" style="border-radius:0;border-left:0" href="tel:${esc(o.phone)}">${icon('phone')}</a><a class="btn" style="border-radius:0 8px 8px 0;border-left:0" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></label>
      <label class="field"><span>Ne istiyor?</span><input class="input" id="o-title" value="${esc(o.title || '')}" placeholder="Örn. 1:10 figür, gri reçine, boyasız"></label>
      <label class="field"><span>Detaylar</span><textarea class="input" id="o-details" rows="3" placeholder="Ölçü, renk, boya, referans linki…">${esc(o.details || '')}</textarea></label>

      <div class="dates-box">
        <div class="row">
          <label class="field"><span>Siparişin geldiği gün</span><input class="input" id="o-odate" type="date" value="${esc(o.order_date || '')}"></label>
          <label class="field"><span>Termin</span><input class="input" id="o-due" type="date" value="${esc(o.due_date || '')}"></label>
        </div>
        <div class="termin-quick"><span class="muted">Termin:</span>
          ${[[3, '3 gün'], [5, '5 gün'], [7, '1 hafta'], [14, '2 hafta']].map(([n, l]) => `<button type="button" class="chip" data-act="o-due-quick" data-n="${n}">+${l}</button>`).join('')}
          <span class="termin-hint" id="o-due-hint"></span></div>
      </div>

      <div class="split" style="grid-template-columns:180px 1fr">
        <div><div class="drop ${o.image ? 'has' : ''}" id="o-drop" style="${o.image ? `--img:url('${esc(o.image)}')` : ''}" tabindex="0" role="button" aria-label="Referans görseli yükle"><div class="hint">${icon('upload')}<span>Referans görseli</span><small class="paste-hint">Ctrl+V ile yapıştırın</small></div></div>
          <input type="file" id="o-file-in" accept="image/*" hidden></div>
        <div style="display:grid;gap:14px">
          <div class="row">
            <label class="field"><span>Adet</span><input class="input" id="o-qty" type="number" inputmode="numeric" min="1" value="${o.quantity || 1}"></label>
            <div class="field"><span>Tahmini baskı süresi</span><div class="input-group"><input class="input" id="o-h" type="number" inputmode="numeric" min="0" value="${pm ? Math.floor(pm / 60) : ''}" placeholder="0" style="border-radius:8px 0 0 8px"><span class="suffix" style="border-radius:0">sa</span><input class="input" id="o-m" type="number" inputmode="numeric" min="0" max="59" value="${pm ? pm % 60 : ''}" placeholder="0" style="border-radius:0;border-left:0"><span class="suffix">dk</span></div></div>
          </div>
          <div class="row">
            <label class="field"><span>Fiyat</span><div class="input-group"><input class="input" id="o-price" type="number" inputmode="decimal" min="0" step="0.01" value="${o.price ?? ''}"><span class="suffix">₺</span></div></label>
            <label class="field"><span>Alınan ödeme</span><div class="input-group"><input class="input" id="o-paid" type="number" inputmode="decimal" min="0" step="0.01" value="${o.paid ?? ''}"><span class="suffix">₺</span></div></label>
          </div>
        </div>
      </div>
      <div class="field"><span>Makine</span>
        ${printers.length ? `<div class="chips" id="o-printers">${printerChips('o', o.printer)}</div>`
          : `<small>Makine listesini Ayarlar sayfasından ekleyin; burada tek dokunuşla seçilir.</small>`}</div>
      <div class="row">
        <div class="field"><span>Baskı türü</span><div class="seg type" id="o-type">${['SLA', 'FDM'].map((t) => `<button type="button" data-v="${t}" class="${OE.print_type === t ? 'on' : ''}">${t}</button>`).join('')}</div></div>
        <label class="field"><span>Malzeme (1 adet)</span><div class="input-group"><input class="input" id="o-grams" type="number" inputmode="decimal" min="0" step="0.1" value="${o.grams ?? ''}" placeholder="0"><span class="suffix">gram</span></div></label>
      </div>
      <p class="o-cost" id="o-cost"></p>
      <div class="row">
        <label class="field"><span>Reçine / renk</span><input class="input" id="o-resin" value="${esc(o.resin || '')}" placeholder="Elegoo ABS-like gri"></label>
        <label class="field"><span>Dosya adı</span><input class="input" id="o-file" value="${esc(o.file_name || '')}" placeholder="figur_v2.chitubox"></label>
      </div>
      <div class="field"><span>Durum</span><div class="seg" id="o-status" style="flex-wrap:wrap">${Object.entries(OST).map(([k, v]) => `<button type="button" data-v="${k}" class="${o.status === k ? 'on' : ''}">${v.l}</button>`).join('')}</div>
        <small id="o-status-hint">${o.active_job_id ? 'Bu siparişin baskısı sürüyor. Hazır veya Teslim seçerseniz baskı başarılı olarak kapanır.' : 'Baskıda seçip kaydettiğinizde baskı süresini ve makineyi sorup Baskılar listesine eklerim.'}</small></div>
    </div>
    <div class="modal-f">
      ${id ? `<button class="btn btn-ghost" data-act="delete-order" data-id="${id}">${icon('trash')} Sil</button>` : ''}
      <div class="right"><button class="btn" data-act="close">Vazgeç</button><button class="btn btn-primary" data-act="save-order">${id ? 'Kaydet' : 'Siparişi ekle'}</button></div>
    </div>`, 'wide');
  const drop = $('#o-drop'), fi = $('#o-file-in');
  drop.onclick = () => fi.click();
  fi.onchange = () => fi.files[0] && uploadOrderImage(fi.files[0]);
  $('#o-status').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; OE.status = b.dataset.v; $$('#o-status button').forEach((x) => x.classList.toggle('on', x === b)); };
  $('#o-printers')?.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; OE.printer = OE.printer === b.dataset.v ? '' : b.dataset.v; $$('#o-printers .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === OE.printer)); });
  ['#o-odate', '#o-due'].forEach((s) => $(s).addEventListener('input', dueHint));
  dueHint();
  $('#o-type').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; OE.print_type = b.dataset.v; $$('#o-type button').forEach((x) => x.classList.toggle('on', x === b)); orderCostHint(); };
  ['#o-grams', '#o-qty', '#o-price'].forEach((s) => $(s).addEventListener('input', orderCostHint));
  orderCostHint();
  if (!id) setTimeout(() => $('#o-fn')?.focus(), 50);
}
// Özel sipariş malzeme maliyeti: gram × makara alış fiyatı (reçinede reçine şişeleri), fire payı dahil
function orderCost(o) {
  const grams = (+o.grams || 0) * Math.max(1, +o.quantity || 1);
  if (!grams || !S.profit) return { grams, cost: null };
  const gp = gramPrice(null, null, o.print_type === 'FDM' ? null : 'Reçine');
  if (!gp) return { grams, cost: null, noPrice: true };
  return { grams, cost: grams * gp.g * (1 + (S.profit.cfg.fire_pct || 0) / 100), src: gp.src };
}
function orderCostHint() {
  const el = $('#o-cost'); if (!el) return;
  const o = { grams: $('#o-grams').value, quantity: $('#o-qty').value, print_type: OE.print_type };
  const c = orderCost(o), price = numIn($('#o-price').value);
  if (!c.grams) { el.innerHTML = '<span class="muted">Gram girerseniz malzeme maliyeti ve fiyattan kalan tutar hesaplanır.</span>'; return; }
  if (c.noPrice) { el.innerHTML = `Toplam <b>${fmtGram(c.grams)}</b> · <span class="warn-text">${o.print_type === 'FDM' ? 'Makaralarda alış fiyatı yok' : 'Reçine fiyatı yok (Filamentler\'e türü “Reçine” olan şişe ekleyip fiyatını girin)'}</span>`; return; }
  if (c.cost == null) { el.textContent = ''; return; }
  el.innerHTML = `Toplam <b>${fmtGram(c.grams)}</b> · malzeme <b>${fmtTL(c.cost)}</b> <small class="muted">(${esc(c.src)})</small>${price ? ` · fiyattan kalan <b class="${price - c.cost >= 0 ? 'ok-text' : 'bad-text'}">${fmtTL(price - c.cost)}</b>` : ''}`;
}
async function uploadOrderImage(f) {
  const drop = $('#o-drop');
  try { const r = await api('POST', '/api/upload-image', { data: await resizeImage(f) }); OE.image = r.url; drop.classList.add('has'); drop.style.setProperty('--img', `url('${r.url}')`); } catch (e) { fail(e); }
}

async function uploadLogo(f) {
  try {
    const r = await api('POST', '/api/upload-image', { data: await resizeImage(f, 256, true) });
    S.settings = await api('PUT', '/api/settings', { app_logo: r.url }); applyBrand(); toast('Logo güncellendi'); if (route() === 'ayarlar') render();
  } catch (e) { fail(e); }
}
// Ctrl+V: panodaki görsel açık olan ürün/sipariş penceresine yapıştırılır
document.addEventListener('paste', (e) => {
  const items = [...(e.clipboardData?.items || [])];
  const img = items.find((it) => it.kind === 'file' && it.type.startsWith('image/'));
  if (!img) return;
  const file = img.getAsFile(); if (!file) return;
  if ($('#sp-drop')) { e.preventDefault(); uploadSpoolImage(file); toast('Görsel yapıştırıldı'); }
  else if ($('#c-drop')) { e.preventDefault(); uploadCompImage(file); toast('Görsel yapıştırıldı'); }
  else if (route() === 'ayarlar' && !$('#modal-root').children.length) { e.preventDefault(); uploadLogo(file); }
  else if ($('#drop')) { e.preventDefault(); handleEditorFile(file); toast('Görsel yapıştırıldı'); }
  else if ($('#o-drop')) { e.preventDefault(); uploadOrderImage(file); toast('Görsel yapıştırıldı'); }
});

function dueHint() {
  const od = $('#o-odate').value, due = $('#o-due').value, el = $('#o-due-hint');
  if (!due) { el.textContent = ''; return; }
  const left = dayNum(due) - dayNum(localToday());
  const span = od ? dayNum(due) - dayNum(od) : null;
  el.className = 'termin-hint' + (left < 0 ? ' due-late' : left <= 1 ? ' due-soon' : '');
  el.textContent = (span != null && span >= 0 ? `${span} gün süre · ` : '') + (left > 0 ? `termine ${left} gün var` : left === 0 ? 'termin bugün' : `${-left} gün gecikti`);
}
function waLink(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return `https://wa.me/${d}`;
}
async function saveOrder() {
  const v = (s) => $(s).value.trim();
  const mins = (parseInt(v('#o-h')) || 0) * 60 + (parseInt(v('#o-m')) || 0);
  const body = { first_name: v('#o-fn'), last_name: v('#o-ln'), phone: v('#o-phone'), title: v('#o-title'), details: v('#o-details'),
    quantity: parseInt(v('#o-qty')) || 1, order_date: v('#o-odate'), due_date: v('#o-due'), print_minutes: mins || null, printer: OE.printer || '',
    price: v('#o-price'), paid: v('#o-paid'), resin: v('#o-resin'), file_name: v('#o-file'), status: OE.status, image: OE.image,
    grams: v('#o-grams'), print_type: OE.print_type || 'SLA' };
  if (!body.first_name) { $('#o-fn').focus(); return toast('Müşterinin adını yazın', { bad: true }); }
  const wantsPrint = OE.status === 'printing' && !OE.active_job_id;
  try {
    const r = OE.id ? await api('PUT', `/api/orders/${OE.id}`, body) : await api('POST', '/api/orders', body);
    closeModal(true);
    toast(OE.id ? 'Sipariş kaydedildi' : 'Sipariş eklendi');
    await render();
    if (wantsPrint) openNewPrint({ orderId: r.id });
  } catch (e) { fail(e); }
}

// ================================================================== SALES / TRENDYOL
// ================================================================== FİLAMENTLER (makaralar)
async function loadSpools() {
  try {
    const [r] = await Promise.all([api('GET', '/api/spools'), loadShapes()]);
    S.spools = r.spools; S.spoolNext = r.next_code; S.materials = r.materials;
  } catch { S.spools = S.spools || []; }
}

// ---------- makara şekilleri: yüklenen SVG silüetleri marka/modellere atanır, renkli maske olarak çizilir
const SPOOL_DEFAULT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M50 2a48 48 0 1 1 0 96A48 48 0 0 1 50 2zm0 38a10 10 0 1 0 0 20a10 10 0 0 0 0-20zM50 12a6 6 0 1 0 0 .01zM27 22l9 14a17 17 0 0 0-6 9l-17-2a38 38 0 0 1 14-21zm46 0a38 38 0 0 1 14 21l-17 2a17 17 0 0 0-6-9zM13 57l17-2a17 17 0 0 0 6 9l-9 14a38 38 0 0 1-14-21zm74 0a38 38 0 0 1-14 21l-9-14a17 17 0 0 0 6-9zM50 70a8 8 0 0 1 0 16a8 8 0 0 1 0-16z"/></svg>';
const RESIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M40 4h20v10h-20zM36 16h28l2 8c8 3 12 9 12 17v49c0 4-3 6-7 6H29c-4 0-7-2-7-6V41c0-8 4-14 12-17z"/></svg>';
async function loadShapes(force) {
  if (S.shapes && !force) return;
  try { const r = await api('GET', '/api/spool-shapes'); S.shapes = r.shapes; S.shapeBrands = r.brands; S.shapeUrlC = {}; } catch { S.shapes = S.shapes || []; S.shapeBrands = S.shapeBrands || []; }
}
const normBrand = (b) => trLower(String(b || '')).replace(/\s+/g, ' ').trim();
function svgUrl(key, svg) {
  const c = (S.shapeUrlC ||= {});
  if (!c[key]) { try { c[key] = `url(data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))})`; } catch { c[key] = 'none'; } }
  return c[key];
}
// Markaya atanmış şekil: tam eşleşme, yoksa marka metninde geçen en uzun atanmış ad ("Filamix PLA+ Black" → "Filamix PLA+")
function shapeFor(brand) {
  const n = normBrand(brand); if (!n || !(S.shapes || []).length) return null;
  let best = null, bl = 0;
  for (const sh of S.shapes) for (const b of sh.brands) {
    const k = normBrand(b); if (!k) continue;
    if ((n === k || n.includes(k)) && k.length > bl) { best = sh; bl = k.length; }
  }
  return best;
}
function shapeMask(brand, resin) {
  const sh = !resin && shapeFor(brand);
  return sh ? svgUrl('s' + sh.id + ':' + sh.svg.length, sh.svg) : resin ? svgUrl('resin', RESIN_SVG) : svgUrl('def', SPOOL_DEFAULT_SVG);
}
// Açık renkte koyu, koyu renkte açık yazı
function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#1C2830';
  const v = parseInt(m[1], 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14191D' : '#FFFFFF';
}
const spoolById = (id) => (S.spools || []).find((x) => x.id === id);
const spoolPct = (sp) => clamp((sp.remaining || 0) / Math.max(1, sp.net_weight || 1000), 0, 1);
const spoolState = (sp) => (sp.remaining || 0) <= 0 ? 'empty' : (sp.remaining || 0) < 150 ? 'low' : '';
const fmtKg = (g) => g >= 1000 ? `${(Math.round(g / 100) / 10).toLocaleString('tr-TR')} kg` : `${Math.round(g)} g`;
// Fotoğraf yoksa rengiyle çizilmiş makara; sarılı filament kalan miktarla incelir
function spoolArt(sp, cls = '') {
  if (sp.photo) return `<span class="spool-art ${cls}"><img src="${esc(sp.photo)}" alt="" loading="lazy"></span>`;
  const col = sp.color_hex && sp.color_hex !== 'transparent' ? sp.color_hex : '#D8DEE2';
  const sh = shapeFor(sp.brand);
  if (sh) return `<span class="spool-art shaped ${cls}" style="--c:${col};--m:${shapeMask(sp.brand)};--r:${Math.round(44 + 50 * spoolPct(sp))}%"><i class="sa-fil"></i><i class="sa-shape"></i></span>`;
  const r = 13 + 15 * spoolPct(sp);
  return `<span class="spool-art drawn ${cls}"><svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="30" class="sa-flange"/><circle cx="32" cy="32" r="${r.toFixed(1)}" fill="${col}"/>
    <circle cx="32" cy="32" r="${r.toFixed(1)}" fill="url(#sa-lines)" opacity=".35"/>
    <circle cx="32" cy="32" r="11" class="sa-hub"/><circle cx="32" cy="32" r="4.5" class="sa-hole"/></svg></span>`;
}
function spoolShapeIcon() { return `<i class="shape-ico" style="--m:${svgUrl('def', SPOOL_DEFAULT_SVG)}"></i>`; }

// ---------- makara şekilleri yöneticisi
function openShapes() {
  openModal(`<div class="modal-h"><h2>Makara şekilleri</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">
      <p class="muted" style="margin:0">Makaranın silüetini SVG olarak yükleyin, sonra o makarayı kullanan marka/modelleri işaretleyin. Aynı makarayı kullanan markalar aynı şekli paylaşır; tek tek yüklemeye gerek yok. Şekil, filamentin rengiyle boyanarak ürün düzenleme ekranında ve makara kartlarında görünür.</p>
      <div class="shape-grid" id="shape-grid"></div>
      <input type="file" id="shape-file" accept=".svg,image/svg+xml" multiple hidden>
    </div>
    <div class="modal-f"><button class="btn btn-primary" data-act="shape-upload">${icon('upload')} SVG yükle</button><div class="right"><button class="btn" data-act="close">Kapat</button></div></div>`, 'wide', () => { if (route() === 'filament') render(); });
  $('#shape-file').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) {
      if (f.size > 400000) { toast(`${f.name}: dosya çok büyük (en fazla 400 KB)`, { bad: true }); continue; }
      try {
        const r = await api('POST', '/api/spool-shapes', { name: f.name.replace(/\.svg$/i, '').replace(/[_-]+/g, ' ').trim(), svg: await f.text() });
        S.shapes = r.shapes; S.shapeBrands = r.brands; S.shapeUrlC = {}; renderShapes();
        const sh = r.shapes.reduce((a, x) => (x.id > (a?.id || 0) ? x : a), null); toast(`${sh?.name || 'Şekil'} eklendi; şimdi markalarını seçin`);
      } catch (err) { fail(err); }
    }
  });
  loadShapes(true).then(renderShapes);
  renderShapes();
}
const SHAPE_DEMO = ['#2FA84F', '#E2483D', '#F5C518', '#3C7DD9', '#1C1D20'];
function renderShapes() {
  const g = $('#shape-grid'); if (!g) return;
  const L = S.shapes || [];
  g.innerHTML = L.length ? L.map((sh, i) => { const c = SHAPE_DEMO[i % SHAPE_DEMO.length];
    return `<div class="shape-card"><div class="shape-prev" style="--c:${c}"><i style="--m:${svgUrl('s' + sh.id + ':' + sh.svg.length, sh.svg)}"></i></div>
      <div class="shape-body"><div class="shape-name"><b>${esc(sh.name)}</b><button type="button" class="icon-btn sm" data-act="shape-rename" data-id="${sh.id}" title="Adını değiştir" aria-label="Adını değiştir">${icon('edit')}</button></div>
        <div class="shape-brands">${sh.brands.length ? sh.brands.map((b) => `<span class="chip sm static">${esc(b)}</span>`).join('') : '<span class="muted" style="font-size:12.5px">Henüz markaya atanmadı</span>'}</div>
        <div class="shape-acts"><button type="button" class="btn btn-sm" data-act="shape-brands" data-id="${sh.id}">Markalar${sh.brands.length ? ` · ${sh.brands.length}` : ''}</button>
          <button type="button" class="btn btn-sm btn-ghost" data-act="shape-del" data-id="${sh.id}">${icon('trash')} Sil</button></div></div></div>`; }).join('')
    : `<div class="empty" style="grid-column:1/-1"><h3>Henüz makara şekli yok</h3><p>Bir makaranın silüetini SVG olarak yükleyin. Dolu bir silüet ya da içi delikli (pencereli) bir çizim olabilir; delikli olanlarda filamentin rengi aralıktan görünür.</p></div>`;
}
function openShapeBrands(id) {
  const sh = (S.shapes || []).find((x) => x.id === id); if (!sh) return;
  const owner = {}; (S.shapes || []).forEach((x) => x.brands.forEach((b) => { owner[normBrand(b)] = x; }));
  const sel = new Set(sh.brands.map(normBrand));
  const all = [...new Map([...(S.shapeBrands || []), ...sh.brands].map((b) => [normBrand(b), b])).values()].sort((a, b) => a.localeCompare(b, 'tr'));
  const pop = document.createElement('div'); pop.className = 'modal-back sub'; pop.innerHTML = `<div class="modal narrow" role="dialog" aria-modal="true">
    <div class="modal-h"><h2>${esc(sh.name)}</h2><button class="icon-btn" data-sb="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b" style="gap:12px">
      <small class="muted">Bu makarayı kullanan marka/modelleri işaretleyin. "Filamix PLA+" seçerseniz "Filamix PLA+ Black" gibi tüm renkleri de kapsar.</small>
      <input class="input" id="sb-q" placeholder="Ara ya da yeni marka yazıp Enter'a basın" autocomplete="off">
      <div class="sb-list" id="sb-list"></div>
    </div>
    <div class="modal-f"><span class="muted" id="sb-n"></span><div class="right"><button class="btn" data-sb="close">Vazgeç</button><button class="btn btn-primary" data-sb="save">Kaydet</button></div></div></div>`;
  document.body.appendChild(pop);
  const list = () => {
    const q = normBrand($('#sb-q', pop).value);
    const rows = all.filter((b) => !q || normBrand(b).includes(q));
    $('#sb-list', pop).innerHTML = rows.map((b) => { const k = normBrand(b), o = owner[k];
      return `<label class="sb-row"><input type="checkbox" data-k="${esc(k)}" data-b="${esc(b)}" ${sel.has(k) ? 'checked' : ''}><span>${esc(b)}</span>${o && o.id !== id ? `<small class="faint">şu an: ${esc(o.name)}</small>` : ''}</label>`; }).join('')
      || `<p class="muted" style="margin:6px 2px">Eşleşen marka yok. Enter'a basarak “${esc($('#sb-q', pop).value.trim())}” ekleyin.</p>`;
    $('#sb-n', pop).textContent = `${sel.size} seçili`;
  };
  list();
  $('#sb-q', pop).addEventListener('input', list);
  $('#sb-q', pop).addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; e.preventDefault();
    const v = e.target.value.replace(/\s+/g, ' ').trim(); if (!v) return;
    const k = normBrand(v); if (!all.some((b) => normBrand(b) === k)) all.unshift(v);
    sel.add(k); e.target.value = ''; list();
  });
  $('#sb-list', pop).addEventListener('change', (e) => { const k = e.target.dataset.k; if (!k) return; e.target.checked ? sel.add(k) : sel.delete(k); $('#sb-n', pop).textContent = `${sel.size} seçili`; });
  const close = () => pop.remove();
  pop.addEventListener('click', async (e) => {
    if (e.target === pop) return close();
    const b = e.target.closest('[data-sb]'); if (!b) return;
    if (b.dataset.sb === 'close') return close();
    const brands = all.filter((x) => sel.has(normBrand(x)));
    const moved = brands.filter((x) => { const o = owner[normBrand(x)]; return o && o.id !== id; });
    if (moved.length && !confirm(`${moved.length} marka başka bir şekilden bu şekle taşınacak. Devam edilsin mi?`)) return;
    b.disabled = true;
    try { const r = await api('PUT', `/api/spool-shapes/${id}`, { brands }); S.shapes = r.shapes; S.shapeBrands = r.brands; S.shapeUrlC = {}; close(); renderShapes(); toast('Markalar kaydedildi'); }
    catch (err) { fail(err); b.disabled = false; }
  });
  setTimeout(() => $('#sb-q', pop)?.focus(), 30);
}

function spoolChip(sp, extra = '') {
  return `<span class="spool-chip ${spoolState(sp)}" title="#${esc(sp.code)} · ${esc([sp.brand, sp.material, sp.color_name].filter(Boolean).join(' · '))} · kalan ${Math.round(sp.remaining)} g">
    ${spoolArt(sp, 'sm')}<span><b>#${esc(sp.code)}</b><small>${Math.round(sp.remaining)} g${extra}</small></span></span>`;
}

PAGES.filament = {
  async load() { await loadSpools(); },
  html() {
    const f = (S.ff ||= { q: '', mat: 'all', show: 'active', sort: 'code' });
    const all = S.spools || [];
    const mats = [...new Set(all.map((x) => x.material).filter(Boolean))];
    const groups = {};
    all.filter((x) => (x.remaining || 0) > 0).forEach((x) => {
      const k = [x.material, (x.color_hex || '').toUpperCase(), x.brand].join('|');
      (groups[k] ||= { ...x, n: 0, g: 0 }).n++; groups[k].g += x.remaining || 0;
    });
    const summary = Object.values(groups).sort((a, b) => b.g - a.g);
    return `<div class="toolbar">
        <label class="search">${icon('search')}<input class="input" id="fq" placeholder="ID, marka veya renk ara" value="${esc(f.q)}" autocomplete="off"></label>
        <div class="chips">${['all', ...mats].map((m) => `<button class="chip${f.mat === m ? ' on' : ''}" data-act="ff-mat" data-v="${esc(m)}">${m === 'all' ? 'Tüm türler' : esc(m)}</button>`).join('')}</div>
        <div class="seg">${[['active', 'Kullanımda'], ['empty', 'Bitenler'], ['all', 'Hepsi']].map(([v, l]) => `<button class="${f.show === v ? 'on' : ''}" data-act="ff-show" data-v="${v}">${l}</button>`).join('')}</div>
        <span class="spacer"></span>
        <select class="input" id="fsort" style="width:auto">${[['code', 'ID sırası'], ['low', 'Kalan: azdan çoğa'], ['color', 'Renge göre'], ['recent', 'Son kullanılan']].map(([v, l]) => `<option value="${v}"${f.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn" data-act="shapes-open" title="Makara şekilleri: SVG yükleyip markalara atayın">${spoolShapeIcon()} Makara şekilleri</button>
        <button class="btn btn-primary" data-act="new-spool">${icon('plus')} Makara ekle</button>
      </div>
      ${summary.length ? `<div class="spool-summary">${summary.slice(0, 14).map((x) => `<button class="sum-chip" data-act="ff-q" data-v="${esc(x.color_name || x.brand || '')}">
        <span class="spool${swatchCls(x.color_hex || '#ccc')}" style="${swatchStyle(x.color_hex || '#ccc')}"></span><span>${esc(x.color_name || colorName(x.color_hex) || '')} ${esc(x.material || '')}${x.brand ? ` <span class="faint">${esc(x.brand)}</span>` : ''}</span><b>${x.n} · ${fmtKg(x.g)}</b></button>`).join('')}</div>` : ''}
      <div id="spool-list">${spoolListHTML()}</div>`;
  },
  after() {
    $('#fq').addEventListener('input', (e) => { S.ff.q = e.target.value; $('#spool-list').innerHTML = spoolListHTML(); });
    $('#fsort').addEventListener('change', (e) => { S.ff.sort = e.target.value; $('#spool-list').innerHTML = spoolListHTML(); });
  },
};
function spoolListHTML() {
  const f = S.ff, q = trLower(f.q).trim();
  let list = (S.spools || []).filter((x) => {
    if (f.mat !== 'all' && x.material !== f.mat) return false;
    if (f.show === 'active' && (x.remaining || 0) <= 0) return false;
    if (f.show === 'empty' && (x.remaining || 0) > 0) return false;
    if (q && !q.split(/\s+/).every((w) => trLower([x.code, '#' + x.code, x.brand, x.material, x.color_name, colorName(x.color_hex), x.notes].join(' ')).includes(w))) return false;
    return true;
  });
  const num = (c) => (/^\d+$/.test(c) ? +c : 1e9);
  const by = { code: (a, b) => num(a.code) - num(b.code) || String(a.code).localeCompare(b.code), low: (a, b) => a.remaining - b.remaining,
    color: (a, b) => String(a.color_hex).localeCompare(b.color_hex) || a.remaining - b.remaining, recent: (a, b) => (b.last_used || 0) - (a.last_used || 0) };
  list = list.sort(by[f.sort] || by.code);
  if (!(S.spools || []).length) return `<div class="empty panel"><h3>İlk makaranızı ekleyin</h3><p>Her makara kendi ID'siyle kaydedilir. Aynı makaradan birden fazla varsa adedini yazın, ID'ler sırayla verilir.</p><button class="btn btn-primary" data-act="new-spool">${icon('plus')} Makara ekle</button></div>`;
  if (!list.length) return `<div class="empty"><h3>Eşleşen makara yok</h3><p>Aramayı veya filtreyi değiştirin.</p></div>`;
  return `<div class="spool-grid">${list.map(spoolCard).join('')}</div>`;
}
function spoolCard(sp) {
  const st = spoolState(sp), pct = spoolPct(sp);
  return `<article class="spool-card ${st}" data-act="edit-spool" data-id="${sp.id}" tabindex="0">
    ${spoolArt(sp, 'lg')}
    <div class="sc-body">
      <div class="sc-top"><b class="sc-id">#${esc(sp.code)}</b>${sp.material ? `<span class="tag tag-mute">${esc(sp.material)}</span>` : ''}
        ${st === 'empty' ? '<span class="tag tag-bad">Bitti</span>' : st === 'low' ? '<span class="tag tag-warn">Azaldı</span>' : ''}</div>
      <div class="sc-name"><span class="spool${swatchCls(sp.color_hex || '#ccc')}" style="${swatchStyle(sp.color_hex || '#ccc')}"></span>${esc(sp.color_name || colorName(sp.color_hex) || 'Renk yok')}<span class="faint"> · ${esc(sp.brand || 'Marka yok')}</span></div>
      <div class="sc-meter"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
      <div class="sc-foot"><span><b>${Math.round(sp.remaining)} g</b> / ${Math.round(sp.net_weight)} g</span>
        ${sp.in_use.length ? `<span class="inprod">${esc(sp.in_use[0].printer || 'baskıda')}</span>` : ''}</div>
    </div></article>`;
}

let SPE = null;
async function openSpoolEditor(id) {
  if (!S.spools) await loadSpools();
  const sp = id ? structuredClone(spoolById(id)) : { code: S.spoolNext || '001', brand: '', material: 'PLA', color_hex: '#1A1A1A', color_name: 'Siyah', net_weight: 1000, remaining: 1000, tare: null, photo: null, notes: '' };
  SPE = sp;
  const brands = [...new Set((S.spools || []).map((x) => x.brand).filter(Boolean))];
  openModal(`
    <div class="modal-h"><h2>${id ? `Makara #${esc(sp.code)}` : 'Yeni makara'}</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">
      <div class="split" style="grid-template-columns:200px 1fr">
        <div><div class="drop ${sp.photo ? 'has' : ''}" id="sp-drop" style="${sp.photo ? `--img:url('${esc(sp.photo)}')` : ''}" tabindex="0" role="button" aria-label="Makara fotoğrafı">
            <div class="hint">${icon('upload')}<span>Makara fotoğrafı</span><small class="paste-hint">Ctrl+V ile yapıştırın</small></div></div>
          <input type="file" id="sp-file" accept="image/*" hidden>
          ${sp.photo ? `<button class="btn btn-ghost btn-sm" data-act="spool-photo-rm" style="margin-top:6px">Fotoğrafı kaldır</button>` : ''}</div>
        <div style="display:grid;gap:14px">
          <div class="row">
            <label class="field"><span>Makara ID</span><div class="input-group"><span class="suffix" style="border-radius:8px 0 0 8px;border-left:1px solid var(--line);border-right:0">#</span><input class="input" id="sp-code" value="${esc(sp.code)}" style="border-radius:0 8px 8px 0" autocomplete="off"></div>
              <small>${id ? 'Her makaranın ID’si benzersizdir.' : 'Sıradaki ID otomatik geldi; isterseniz değiştirin.'}</small></label>
            ${id ? '' : `<label class="field"><span>Kaç makara?</span><div class="stepper"><button type="button" data-act="sp-count" data-d="-1" aria-label="Azalt">${icon('minus')}</button><input id="sp-count" type="number" min="1" max="50" value="1"><button type="button" data-act="sp-count" data-d="1" aria-label="Arttır">${icon('plus')}</button></div><small id="sp-count-hint">Aynı makaradan birden fazlaysa ID'ler sırayla verilir.</small></label>`}
          </div>
          <div class="field"><span>Tür</span><div class="chips" id="sp-mat">${(S.materials || ['PLA']).map((m) => `<button type="button" class="chip${sp.material === m ? ' on' : ''}" data-v="${esc(m)}">${esc(m)}</button>`).join('')}</div></div>
          <div class="field"><span>Renk ve marka</span>
            <div class="mat" style="grid-template-columns:auto 1fr"><button type="button" class="swatch-btn" data-act="pick-spool-color" id="sp-swatch"></button>
              <input class="input" list="sp-brands" id="sp-brand" value="${esc(sp.brand || '')}" placeholder="Marka / model, ör. Filamix PLA" autocomplete="off">
              <datalist id="sp-brands">${brands.map((b) => `<option value="${esc(b)}">`).join('')}</datalist></div></div>
        </div>
      </div>
      <div class="field"><span>Makara ağırlığı (net filament)</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><div class="input-group" style="max-width:170px"><input class="input" id="sp-net" type="number" min="0" step="1" value="${sp.net_weight || 1000}"><span class="suffix">g</span></div>
          ${[250, 500, 750, 1000, 2000, 3000].map((g) => `<button type="button" class="chip" data-act="sp-net" data-v="${g}">${g >= 1000 ? g / 1000 + ' kg' : g + ' g'}</button>`).join('')}</div></div>
      <div class="field"><span>Alış fiyatı (KDV dahil, makara başına)</span>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="input-group" style="max-width:170px"><input class="input" id="sp-price" inputmode="decimal" value="${sp.price ?? ''}" placeholder="ör. 650"><span class="suffix">₺</span></div><small class="muted" id="sp-price-hint"></small></div></div>
      ${id ? '' : `<label class="switch"><input type="checkbox" id="sp-new" checked> Sıfır makara (kalan filament = makara ağırlığı)</label>`}
      <div class="row" id="sp-rem-row" ${id ? '' : 'style="display:none"'}>
        <label class="field"><span>Kalan filament</span><div class="input-group"><input class="input" id="sp-rem" type="number" min="0" step="1" value="${Math.round(sp.remaining ?? 1000)}"><span class="suffix">g</span></div></label>
        <label class="field"><span>Boş makara ağırlığı</span><div class="input-group"><input class="input" id="sp-tare" type="number" min="0" step="1" value="${sp.tare ?? ''}" placeholder="isteğe bağlı"><span class="suffix">g</span></div><small>Tartıyla güncellemek için</small></label>
      </div>
      ${id ? `<div class="weigh"><span>${icon('scale')} Tartıdaki ağırlık</span><div class="input-group" style="max-width:200px"><input class="input" id="sp-scale" type="number" min="0" placeholder="ör. 640"><span class="suffix">g</span></div>
        <button class="btn btn-sm" data-act="spool-weigh">Kalanı hesapla</button><small class="muted">Kalan = tartı − boş makara</small></div>` : ''}
      <label class="field"><span>Notlar</span><textarea class="input" id="sp-notes" rows="2" placeholder="Kurutuldu, nozül sıcaklığı, nerede duruyor…">${esc(sp.notes || '')}</textarea></label>
      ${id ? `<div class="field"><span>Geçmiş</span><div id="sp-log" class="muted">Yükleniyor…</div></div>` : ''}
    </div>
    <div class="modal-f">${id ? `<button class="btn btn-ghost" data-act="spool-archive" data-id="${id}">${icon('trash')} Arşivle</button>` : ''}
      <div class="right"><button class="btn" data-act="close">Vazgeç</button><button class="btn btn-primary" data-act="save-spool" id="sp-save">${id ? 'Kaydet' : 'Makarayı ekle'}</button></div></div>`, 'wide');
  SPE.redraw = () => { $('#sp-swatch').innerHTML = `<span class="swatch${swatchCls(SPE.color_hex)}" style="${swatchStyle(SPE.color_hex)}"></span><span class="nm">${esc(SPE.color_name || colorName(SPE.color_hex) || SPE.color_hex)}</span>`; };
  SPE.redraw();
  const drop = $('#sp-drop'), fi = $('#sp-file');
  drop.onclick = () => fi.click();
  fi.onchange = () => fi.files[0] && uploadSpoolImage(fi.files[0]);
  $('#sp-mat').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; SPE.material = b.dataset.v; $$('#sp-mat .chip').forEach((x) => x.classList.toggle('on', x === b)); };
  $('#sp-new')?.addEventListener('change', (e) => { $('#sp-rem-row').style.display = e.target.checked ? 'none' : ''; });
  $('#sp-count')?.addEventListener('input', spCountHint);
  const priceHint = () => { const pr = numIn($('#sp-price').value), net = numIn($('#sp-net').value) || 1000; $('#sp-price-hint').textContent = pr ? `= ${(Math.round(pr / net * 1000) / 1000).toLocaleString('tr-TR')} ₺/g · ${fmtTL(pr / net * 1000)}/kg` : 'Kâr hesabında filament maliyeti için'; };
  ['#sp-price', '#sp-net'].forEach((x) => $(x).addEventListener('input', priceHint)); priceHint();
  $('#sp-code').addEventListener('input', spCountHint);
  if (id) api('GET', `/api/spools/${id}/log`).then((l) => {
    const R = { new: 'Eklendi', print: 'Baskı', adjust: 'Düzeltme', weigh: 'Tartı' };
    const el = $('#sp-log'); if (!el) return;
    el.innerHTML = l.length ? `<ul class="lst">${l.map((x) => `<li><div class="grow"><div class="t">${R[x.reason] || x.reason}${x.ref ? ` · <span class="muted">${esc(x.ref)}</span>` : ''}</div><div class="s">${fmtWhen(x.created_at)} · sonra ${Math.round(x.remaining_after)} g</div></div><span class="delta ${x.delta > 0 ? 'up' : 'down'}">${x.delta > 0 ? '+' : ''}${Math.round(x.delta)}</span></li>`).join('')}</ul>` : 'Henüz hareket yok.';
  }).catch(() => {});
}
function spCountHint() {
  const n = parseInt($('#sp-count')?.value) || 1, code = $('#sp-code').value.trim(), h = $('#sp-count-hint');
  if (!h) return;
  if (n <= 1) { h.textContent = "Aynı makaradan birden fazlaysa ID'ler sırayla verilir."; $('#sp-save').textContent = 'Makarayı ekle'; return; }
  const start = /^\d+$/.test(code) ? +code : null;
  h.textContent = start != null ? `ID'ler: #${code} – #${String(start + n - 1).padStart(code.length, '0')} (çakışan varsa sıradaki boş ID)` : `İlki #${code}, diğerleri sıradaki boş ID'ler`;
  $('#sp-save').textContent = `${n} makara ekle`;
}
async function uploadSpoolImage(f) {
  try { const r = await api('POST', '/api/upload-image', { data: await resizeImage(f, 600) }); SPE.photo = r.url; const d = $('#sp-drop'); d.classList.add('has'); d.style.setProperty('--img', `url('${r.url}')`); } catch (e) { fail(e); }
}
async function saveSpool() {
  const v = (x) => $(x)?.value.trim();
  const body = { code: v('#sp-code'), brand: v('#sp-brand'), material: SPE.material, color_hex: SPE.color_hex, color_name: SPE.color_name || colorName(SPE.color_hex),
    net_weight: parseFloat(v('#sp-net')) || 1000, photo: SPE.photo, notes: v('#sp-notes'), tare: v('#sp-tare'), price: (v('#sp-price') || '').replace(',', '.') };
  if (!body.code) return toast('Makara ID girin', { bad: true });
  try {
    if (SPE.id) {
      body.remaining = parseFloat(v('#sp-rem')) || 0;
      await api('PUT', `/api/spools/${SPE.id}`, body); toast(`#${body.code} kaydedildi`);
    } else {
      body.count = parseInt(v('#sp-count')) || 1;
      body.new_spool = $('#sp-new').checked;
      if (!body.new_spool) body.remaining = parseFloat(v('#sp-rem')) || 0;
      const r = await api('POST', '/api/spools', body);
      toast(r.length > 1 ? `${r.length} makara eklendi: #${r[0].code} – #${r[r.length - 1].code}` : `#${r[0].code} eklendi`);
    }
    closeModal(); S.profit = null; await loadSpools(); render();
  } catch (e) { fail(e); }
}

// ================================================================== KÂR
// Tutarlar KDV dahil girilir; komisyon, kargo, hizmet bedeli, filament ve ambalaj faturalı olduğundan KDV'leri
// mahsup edilir → kâr = (satış − giderler) ÷ (1 + KDV). Sunucudaki profit_cfg ile aynı mantık.
async function loadProfit(force) { if (!S.profit || force) S.profit = await api('GET', '/api/profit'); return S.profit; }
const fmtTL = (n) => (n == null || isNaN(n) ? '–' : (n < -0.004 ? '−' : '') + (Math.round(Math.abs(n) * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺');
const fmtPct = (x) => (x == null || !isFinite(x) ? '–' : (x < 0 ? '−%' : '%') + (Math.round(Math.abs(x) * 1000) / 10).toLocaleString('tr-TR'));
const numIn = (v) => { if (v == null) return null; const s = String(v).trim().replace(',', '.'); return s === '' || isNaN(+s) ? null : +s; };

function gramPrice(hex, brand, mat) {
  const P = S.profit?.prices || {}, cfg = S.profit?.cfg || {};
  if (hex) {
    const k = String(hex).toUpperCase();
    const cb = P.color_brand?.[`${k}|${(brand || '').trim().toLowerCase()}`];
    if (cb) return { g: cb.per_g, src: `aynı renk ve markadaki ${cb.n} makara` };
    if (P.color?.[k]) return { g: P.color[k].per_g, src: `aynı renkteki ${P.color[k].n} makara` };
  }
  if (mat && P.material?.[mat]) return { g: P.material[mat].per_g, src: `${mat} makaraları` };
  if (mat === 'Reçine') return null;   // reçine fiyatı filament ortalamasıyla tahmin edilmez
  if (cfg.filament_kg > 0) return { g: cfg.filament_kg / 1000, src: 'varsayılan kg fiyatı' };
  if (P.all) return { g: P.all.per_g, src: `tüm makaraların ortalaması` };
  return null;
}
// Bir satış birimindeki (1 adet / 1 set) malzemenin renklere dağılımı
function costSlots(p, grams) {
  if (catFlags(p.category).no_materials) return [{ hex: null, grams }];
  if (p.parts?.length && !p.parts_same_color) {
    const by = {}; let n = 0;
    const gw = p.parts.every((x) => partGram(x) > 0);   // parça gramları girildiyse renklere gram oranında böl
    p.parts.forEach((x) => { const c = x.component_id ? compById(x.component_id) : null; const hex = c?.color_hex || x.color_hex; if (!hex) return; const k = hex.toUpperCase(); const w = (x.per_unit || 1) * (gw ? partGram(x) : 1); (by[k] ||= { hex, brand: c?.brand || x.brand, n: 0 }).n += w; n += w; });
    if (n) return Object.values(by).map((x) => ({ hex: x.hex, brand: x.brand, grams: grams * x.n / n }));
  }
  const mats = p.materials || [];
  if (!mats.length) return [{ hex: null, grams }];
  const known = mats.reduce((a, m) => a + (m.grams || 0), 0);
  return mats.map((m) => ({ hex: m.color_hex, brand: m.brand, grams: grams * (known && m.grams ? m.grams / known : 1 / mats.length) }));
}
// → { cost, grams, perG (ortalama), src, missingGrams, noPrice }
function materialCost(p, gramsOverride, perGOverride) {
  const grams = gramsOverride ?? (+p.grams || 0);
  if (!grams) return { cost: 0, grams: 0, missingGrams: true };
  if (perGOverride != null) return { cost: grams * perGOverride, grams, perG: perGOverride, src: 'elle girilen fiyat' };
  const mat = p.print_type === 'SLA' ? 'Reçine' : null;
  let cost = 0; const srcs = new Set();
  for (const sl of costSlots(p, grams)) {
    const gp = gramPrice(sl.hex, sl.brand, mat);
    if (!gp) return { cost: 0, grams, noPrice: true, resin: mat === 'Reçine' };
    cost += sl.grams * gp.g; srcs.add(gp.src);
  }
  return { cost, grams, perG: cost / grams, src: [...srcs].join(', ') };
}
// Fiyatın düştüğü kargo baremi, ör. "200–300 ₺ baremi"
function cargoTierLabel(price) {
  const t = S.profit.cfg.cargo_tiers, n = (x) => String(x).replace('.', ',');
  for (let i = 0; i < t.length; i++) if (price < t[i].upto) return i ? `${n(t[i - 1].upto)}–${n(t[i].upto)} ₺ baremi` : `${n(t[i].upto)} ₺ altı`;
  return `${n(t.at(-1)?.upto || 0)} ₺ ve üstü (desiye göre)`;
}
function cargoFor(price, over) {
  const cfg = S.profit.cfg;
  for (const t of cfg.cargo_tiers) if (price < t.upto) return t.fee;
  return over ?? cfg.cargo_over;
}
// o: { price, material, extra, commission_pct, cargo_fee }
// Trendyol minimum sipariş adedi: bu fiyattaki üründen müşteri en az kaç adet alır
function minQtyFor(P) { for (const t of S.profit?.cfg.min_qty || []) if (P < t.upto) return Math.max(1, t.qty | 0); return 1; }
// Kâr bir siparişe göre hesaplanır: müşteri en az n adet alır; kargo sepet tutarının baremiyle, hizmet bedeli ve ambalaj
// sipariş başına bir kez, komisyon / malzeme / ek maliyet adet başına. r.profit adet başı, r.orderProfit sipariş başı.
function calcProfit(o) {
  const cfg = S.profit.cfg, P = +o.price || 0, v = cfg.vat / 100;
  const n = Math.max(1, o.qty ?? minQtyFor(P)), T = P * n;
  const r = { price: P, qty: n, total: T, commissionPct: o.commission_pct ?? cfg.commission, comSrc: o.comSrc || '' };
  r.commission = T * r.commissionPct / 100;
  r.cargo = cargoFor(T, o.cargo_fee);
  r.cargoTier = cargoTierLabel(T);
  r.fee = cfg.service_fee; r.pack = cfg.packaging;
  r.material = (o.material || 0) * n * (1 + cfg.fire_pct / 100); r.extra = (o.extra || 0) * n;
  r.costs = r.commission + r.cargo + r.fee + r.pack + r.material + r.extra;
  r.net = T - r.costs;               // elde kalan (KDV dahil), sipariş başına
  r.orderProfit = r.net / (1 + v);   // KDV mahsup edildikten sonra
  r.vat = r.net - r.orderProfit;
  r.profit = r.orderProfit / n;      // adet başı
  r.margin = T ? r.orderProfit / T : null;
  return r;
}
// Hedef marj için en düşük satış fiyatı (kargo baremlerine göre)
function priceForMargin(o, m) {
  // minimum adet baremleri varsa kapalı çözüm yok: fiyatı tarayarak hedef marjı tutturan en düşük fiyatı bul
  if ((S.profit.cfg.min_qty || []).length) {
    let p = 1;
    for (; p <= 5000; p += 0.5) if ((calcProfit({ ...o, price: p }).margin ?? -1) >= m) break;
    if (p > 5000) return null;
    let lo = Math.max(0.01, p - 0.5);
    for (; lo <= p; lo = Math.round((lo + 0.01) * 100) / 100) if ((calcProfit({ ...o, price: lo }).margin ?? -1) >= m) return lo;
    return Math.round(p * 100) / 100;
  }
  const cfg = S.profit.cfg, v = cfg.vat / 100, c = (o.commission_pct ?? cfg.commission) / 100;
  const fixed = cfg.service_fee + cfg.packaging + (o.material || 0) * (1 + cfg.fire_pct / 100) + (o.extra || 0);
  const denom = 1 - c - m * (1 + v);
  if (denom <= 0) return null;
  let lo = 0;
  const tiers = [...cfg.cargo_tiers.map((t) => ({ lo: 0, hi: t.upto, fee: t.fee })), { hi: Infinity, fee: o.cargo_fee ?? cfg.cargo_over }];
  for (const t of tiers) {
    const p = Math.max(lo, (fixed + t.fee) / denom);
    if (p < t.hi) return Math.ceil(p * 100) / 100;
    lo = t.hi;
  }
  return null;
}
// Fiyat bir kargo sınırının hemen üstündeyse, sınırın altında daha çok kazanılıp kazanılmadığını söyler
function tierHint(o) {
  const cfg = S.profit.cfg, P = +o.price || 0; if (!P) return '';
  const curR = calcProfit(o), cur = curR.profit, n = curR.qty || 1, T = P * n;
  for (const t of [...cfg.cargo_tiers].reverse()) {
    if (T >= t.upto) {
      // sepet tutarı (fiyat × minimum adet) bir alt kargo baremine insin diye gereken fiyat
      const below = Math.floor((t.upto - 0.01) / n * 100) / 100, altR = calcProfit({ ...o, price: below }), alt = altR.profit;
      if ((altR.qty || 1) * below >= t.upto) return '';
      if (alt >= cur) return `${fmtTL(below)} yaparsan${n > 1 ? ` (${altR.qty} adetlik sepet)` : ''} kargo daha ucuz bareme düşer ve ${alt >= 0 ? `daha çok kazanırsın (adet başı ${fmtTL(alt)})` : `zararın azalır (${fmtTL(alt)})`}.`;
      return '';
    }
  }
  return '';
}
function productProfit(p, over = {}) {
  const mc = materialCost(p, over.grams, over.perG);
  const o = { price: over.price ?? p.sale_price, material: mc.cost, extra: over.extra ?? (p.extra_cost || 0),
    commission_pct: over.commission_pct !== undefined ? over.commission_pct : p.commission_pct ?? null, cargo_fee: over.cargo_fee !== undefined ? over.cargo_fee : p.cargo_fee ?? null };
  // komisyon: ürüne özel → kategorinin oranı → genel oran
  o.comSrc = o.commission_pct != null ? 'ürüne özel' : '';
  if (o.commission_pct == null && p.ty_commission != null) { o.commission_pct = p.ty_commission; o.comSrc = 'Trendyol'; }
  if (o.commission_pct == null) { const cc = catCommission(p.category); if (cc != null) { o.commission_pct = cc; o.comSrc = p.category; } }
  if (o.commission_pct == null) delete o.commission_pct;
  if (o.cargo_fee == null) delete o.cargo_fee;
  return { o, mc, r: o.price ? calcProfit(o) : null };
}
const catCommission = (name) => { const c = name && (S.categories || []).find((x) => x.name === name); return c && c.commission != null ? c.commission : null; };
const defaultCommission = (cat, p) => p?.ty_commission ?? catCommission(cat) ?? S.profit?.cfg.commission ?? 20;
const marginCls = (m) => m == null ? '' : m < 0.1 ? 'neg' : m < 0.2 ? 'warn' : 'pos';

function breakdownHTML(r, mc) {
  // Tüm satırlar KDV dahil; en altta net KDV düşülüp kazanılan tutar (KDV hariç kâr) gösterilir
  const row = (l, x, sub = '') => `<tr><td>${l}${sub ? ` <small class="muted">${sub}</small>` : ''}</td><td class="num">${x}</td></tr>`;
  const fire = S.profit.cfg.fire_pct, neg = (x) => fmtTL(-x);
  const n = r.qty || 1;
  return `${n > 1 ? `<p class="pf-mq">${icon('cart')} Bu fiyatta müşteri <b>en az ${n} adet</b> alır; hesap ${n} adetlik siparişe göre (kargo, hizmet bedeli ve ambalaj bir kez).</p>` : ''}<table class="pf-bd"><tbody>
    ${row(n > 1 ? `Satış (${n} × ${fmtTL(r.price)})` : 'Satış fiyatı', fmtTL(r.total ?? r.price))}
    ${row('Komisyon', neg(r.commission), `%${(r.commissionPct + '').replace('.', ',')}${r.comSrc ? ' · ' + esc(r.comSrc) : ''}`)}
    ${row('Kargo', neg(r.cargo), r.cargoTier || '')}
    ${row('Hizmet bedeli', neg(r.fee))}
    ${r.pack ? row('Ambalaj', neg(r.pack)) : ''}
    ${row('Malzeme', mc?.missingGrams ? '<span class="warn-text">gram yok</span>' : mc?.noPrice ? '<span class="warn-text">fiyat yok</span>' : neg(r.material),
      mc && !mc.missingGrams && !mc.noPrice ? `${n > 1 ? `${n} × ` : ''}${fmtGram(mc.grams)} · ${(Math.round(mc.perG * 1000) / 1000).toLocaleString('tr-TR')} ₺/g${fire ? ` · fire %${fire}` : ''}` : '')}
    ${r.extra ? row('Ek maliyet', neg(r.extra)) : ''}
    </tbody><tbody class="pf-sub">
    ${row('Elde kalan', fmtTL(r.net), 'KDV dahil')}
    ${r.vat >= 0 ? row('Ödenecek net KDV', neg(r.vat), 'satış KDV\'si − giderlerin KDV\'si') : row('Devreden KDV (alacak)', fmtTL(-r.vat), 'giderlerin KDV\'si satışınkinden fazla')}
    </tbody><tfoot><tr class="${marginCls(r.margin)}"><td>Kazandığın <small class="muted">KDV hariç${n > 1 ? `, ${n} adetlik sipariş` : ''}</small></td><td class="num">${fmtTL(r.orderProfit ?? r.profit)} <small>${fmtPct(r.margin)}</small></td></tr>
      ${n > 1 ? `<tr class="pf-unit"><td>Adet başı</td><td class="num">${fmtTL(r.profit)}</td></tr>` : ''}</tfoot></table>`;
}
function warnsHTML(mc) {
  if (mc.missingGrams) return '<p class="pf-warn">Bu ürüne gram girilmemiş; malzeme maliyeti hesaba katılmadı.</p>';
  if (mc.noPrice && mc.resin) return '<p class="pf-warn">Reçine fiyatı yok. Filamentler sayfasına türü “Reçine” olan bir şişe ekleyip fiyatını girin ya da reçine maliyetini ek maliyete yazın.</p>';
  if (mc.noPrice) return '<p class="pf-warn">Makaralarda alış fiyatı yok. Filamentler sayfasından makara fiyatı ya da aşağıdan varsayılan kg fiyatı girin.</p>';
  return `<p class="pf-src muted">Filament fiyatı: ${esc(mc.src)}</p>`;
}

// ---------- Kâr sayfası
const KC = { pid: null };
PAGES.kar = {
  async load() { await Promise.all([loadProfit(true), loadCategories(), S.components ? null : loadComponents()]); },
  html() {
    const cfg = S.profit.cfg, P = S.profit.prices;
    return `<div class="kar-grid">
      <section class="panel"><div class="panel-h"><h2>Kâr hesaplayıcı</h2></div><div class="panel-b" id="kc"></div></section>
      <section class="panel"><div class="panel-h"><h2>Giderler</h2><span class="muted" style="font-size:13px">KDV dahil</span></div><div class="panel-b kar-cfg">
        <div class="row">
          <label class="field"><span>Komisyon</span><div class="input-group"><input class="input" id="pc-commission" inputmode="decimal" value="${cfg.commission}"><span class="suffix">%</span></div></label>
          <label class="field"><span>Hizmet bedeli</span><div class="input-group"><input class="input" id="pc-service" inputmode="decimal" value="${cfg.service_fee}"><span class="suffix">₺</span></div><small>Sipariş başına</small></label>
        </div>
        ${(S.categories || []).length ? `<div class="field"><span>Kategoriye göre komisyon <span class="faint">(boş = genel oran)</span></span>
          <div class="cat-coms">${S.categories.map((c, i) => `<label class="cat-com"><span>${esc(c.name)}</span><div class="input-group"><input class="input" data-cat-com="${i}" inputmode="decimal" value="${c.commission ?? ''}" placeholder="${cfg.commission}"><span class="suffix">%</span></div></label>`).join('')}</div>
          <small>Ürüne özel oran girilmişse o kullanılır.</small></div>` : ''}
        <div class="field"><span>Kargo (sipariş tutarına göre)</span>
          <div class="tiers"><div class="tier th"><span></span><span>Sipariş tutarı</span><span>Kargo ücreti</span></div>
            ${cfg.cargo_tiers.map((t, i) => `<div class="tier"><span>${i ? `${String(cfg.cargo_tiers[i - 1].upto).replace('.', ',')} ₺ –` : '0 –'}</span><div class="input-group"><input class="input" data-tier-upto="${i}" inputmode="decimal" value="${t.upto}"><span class="suffix">₺ altı</span></div><div class="input-group"><input class="input" data-tier-fee="${i}" inputmode="decimal" value="${t.fee}"><span class="suffix">₺</span></div></div>`).join('')}
            <div class="tier"><span>${String(cfg.cargo_tiers.at(-1)?.upto || 0).replace('.', ',')} ₺ +</span><span class="muted" style="font-size:13px">desiye göre, en az</span><div class="input-group"><input class="input" id="pc-over" inputmode="decimal" value="${cfg.cargo_over}"><span class="suffix">₺</span></div></div></div>
          <small>Ürüne özel kargo ücreti ürün düzenleme ekranından girilebilir (sadece üst barem için).</small></div>
        <div class="field"><span>Minimum sipariş adedi <span class="faint">(Trendyol baremleri)</span></span>
          <div class="tiers"><div class="tier th"><span></span><span>Ürün fiyatı</span><span>Müşteri en az</span></div>
            ${[...(cfg.min_qty || []), {}].map((t, i, arr) => `<div class="tier"><span>${i ? `${String(arr[i - 1].upto ?? '').replace('.', ',')} ₺ –` : '0 –'}</span><div class="input-group"><input class="input" data-mq-upto="${i}" inputmode="decimal" value="${t.upto ?? ''}" placeholder="${i === arr.length - 1 ? 'yeni barem' : ''}"><span class="suffix">₺ altı</span></div><div class="input-group"><input class="input" data-mq-qty="${i}" inputmode="numeric" value="${t.qty ?? ''}"><span class="suffix">adet</span></div></div>`).join('')}</div>
          <small>Bu fiyatların altındaki ürünlerde kâr, müşterinin almak zorunda olduğu adetlik siparişe göre hesaplanır. Satırı silmek için kutuları boşaltın.</small></div>
        <div class="row">
          <label class="field"><span>Ambalaj</span><div class="input-group"><input class="input" id="pc-pack" inputmode="decimal" value="${cfg.packaging}"><span class="suffix">₺</span></div><small>Koli, poşet, bant; sipariş başına</small></label>
          <label class="field"><span>Fire payı</span><div class="input-group"><input class="input" id="pc-fire" inputmode="decimal" value="${cfg.fire_pct}"><span class="suffix">%</span></div><small>Filament maliyetine eklenir</small></label>
        </div>
        <div class="row">
          <label class="field"><span>Varsayılan filament</span><div class="input-group"><input class="input" id="pc-kg" inputmode="decimal" value="${cfg.filament_kg || ''}" placeholder="ör. 650"><span class="suffix">₺/kg</span></div><small>Fiyatı girilmiş makara yoksa</small></label>
          <label class="field"><span>KDV</span><div class="input-group"><input class="input" id="pc-vat" inputmode="decimal" value="${cfg.vat}"><span class="suffix">%</span></div></label>
        </div>
        <p class="muted" style="margin:0;font-size:13px">${P.all ? `Fiyatı girilmiş ${P.all.n} makara · ortalama ${fmtTL(P.all.per_g * 1000)}/kg` : 'Henüz hiçbir makaraya alış fiyatı girilmemiş.'} <a href="#/filament">Makaralar</a></p>
        <button class="btn btn-primary" data-act="profit-save">Giderleri kaydet</button>
      </div></section>
    </div>
    <section class="panel"><div class="panel-h"><h2>Ürün kârlılığı</h2>
      <div class="chips" id="kt-filter">${[['all', 'Hepsi'], ['priced', 'Fiyatı olanlar'], ['noprice', 'Fiyat girilmemiş'], ['nograms', 'Gramı eksik']].map(([v, l]) => `<button class="chip${(S.ktf || 'all') === v ? ' on' : ''}" data-act="kt-filter" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="panel-b" id="kt" style="padding:0"></div></section>`;
  },
  after() { kcRender(); ktRender(); },
};
function kcRender() {
  const el = $('#kc'); if (!el) return;
  const p = KC.pid ? productById(KC.pid) : null;
  if (KC.pid && !p) KC.pid = null;
  const val = (k, d) => (KC[k] !== undefined ? KC[k] : d) ?? '';
  el.innerHTML = `
    <div class="field"><span>Ürün</span><div class="kc-pick">
      <input class="input" list="kc-products" id="kc-product" placeholder="Ürün ara ya da boş bırak (serbest hesap)" value="${esc(p?.name || '')}" autocomplete="off">
      <datalist id="kc-products">${S.products.map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist>
      ${p ? `<button class="btn btn-ghost btn-sm" data-act="kc-clear">Temizle</button>` : ''}</div></div>
    <div class="row">
      <label class="field"><span>Satış fiyatı</span><div class="input-group"><input class="input" id="kc-price" inputmode="decimal" value="${val('price', p?.sale_price)}" placeholder="0"><span class="suffix">₺</span></div><small>KDV dahil, indirimli</small></label>
      <label class="field"><span>Malzeme</span><div class="input-group"><input class="input" id="kc-grams" inputmode="decimal" value="${val('grams', p ? p.grams || '' : '')}" placeholder="0"><span class="suffix">g</span></div><small>${p ? '1 adet / set' : 'Ürün başına'}</small></label>
    </div>
    <div class="row">
      <label class="field"><span>Filament fiyatı</span><div class="input-group"><input class="input" id="kc-kg" inputmode="decimal" value="${val('kg', '')}" placeholder="makaralardan"><span class="suffix">₺/kg</span></div></label>
      <label class="field"><span>Ek maliyet</span><div class="input-group"><input class="input" id="kc-extra" inputmode="decimal" value="${val('extra', p?.extra_cost)}" placeholder="0"><span class="suffix">₺</span></div><small>Boya, reçine, mıknatıs, kutu…</small></label>
    </div>
    <div class="row">
      <label class="field"><span>Komisyon${p?.ty_commission != null ? ` <span class="faint">(Trendyol: %${p.ty_commission})</span>` : p && catCommission(p.category) != null ? ` <span class="faint">(${esc(p.category)}: %${catCommission(p.category)})</span>` : ''}</span><div class="input-group"><input class="input" id="kc-com" inputmode="decimal" value="${val('com', p?.commission_pct)}" placeholder="${defaultCommission(p?.category, p)}"><span class="suffix">%</span></div></label>
      <label class="field"><span>Kargo (${S.profit.cfg.cargo_tiers.at(-1)?.upto || 300} ₺ ve üstü)</span><div class="input-group"><input class="input" id="kc-cargo" inputmode="decimal" value="${val('cargo', p?.cargo_fee)}" placeholder="${S.profit.cfg.cargo_over}"><span class="suffix">₺</span></div></label>
    </div>
    <div id="kc-out"></div>
    ${p ? `<div class="kc-actions"><button class="btn btn-primary" data-act="kc-save">Ürüne kaydet</button><button class="btn btn-ghost" data-act="edit-product" data-id="${p.id}">Ürünü aç</button></div>` : ''}`;
  $('#kc-product').addEventListener('change', (e) => { const x = S.products.find((q) => q.name === e.target.value.trim()); Object.keys(KC).forEach((k) => delete KC[k]); KC.pid = x?.id || null; kcRender(); });
  ['price', 'grams', 'kg', 'extra', 'com', 'cargo'].forEach((k) => $('#kc-' + k).addEventListener('input', (e) => { KC[k] = e.target.value; kcCalc(); }));
  kcCalc();
}
function kcInputs() {
  const p = KC.pid ? productById(KC.pid) : null, g = (k) => numIn($('#kc-' + k)?.value);
  const base = p || { grams: 0, materials: [], category: null };
  const kg = g('kg');
  return productProfit(base, { price: g('price') || 0, grams: g('grams') || 0, perG: kg != null ? kg / 1000 : undefined, extra: g('extra') || 0,
    commission_pct: g('com') ?? null, cargo_fee: g('cargo') ?? null });
}
function kcCalc() {
  const out = $('#kc-out'); if (!out) return;
  const { o, mc } = kcInputs();
  const r = calcProfit(o), hint = o.price ? tierHint(o) : '';
  const targets = [0.15, 0.2, 0.25, 0.3, 0.4];
  out.innerHTML = `${o.price ? `<div class="kc-hero ${marginCls(r.margin)}"><b>${fmtTL(r.profit)}</b><span>tahmini kâr · ${fmtPct(r.margin)} marj</span></div>${breakdownHTML(r, mc)}` : '<p class="muted">Satış fiyatını yazın.</p>'}
    ${hint ? `<p class="pf-hint">${icon('alert')} ${hint}</p>` : ''}
    ${mc.missingGrams && !numIn($('#kc-grams')?.value) ? '' : warnsHTML(mc)}
    <div class="field"><span>Hedef marj için fiyat</span><div class="kc-targets">${targets.map((m) => { const p = priceForMargin(o, m); return p ? `<button class="chip" data-act="kc-target" data-v="${p}"><small>%${m * 100}</small> ${fmtTL(p)}</button>` : ''; }).join('')}</div></div>`;
}
function ktRender() {
  const el = $('#kt'); if (!el) return;
  const f = S.ktf || 'all';
  let rows = S.products.map((p) => ({ p, ...productProfit(p) }));
  if (f === 'priced') rows = rows.filter((x) => x.r);
  if (f === 'noprice') rows = rows.filter((x) => !x.r);
  if (f === 'nograms') rows = rows.filter((x) => x.mc.missingGrams && !catFlags(x.p.category).no_materials || x.mc.missingGrams && !(x.p.extra_cost > 0));
  rows.sort((a, b) => (a.r ? 0 : 1) - (b.r ? 0 : 1) || (a.r && b.r ? a.r.margin - b.r.margin : a.p.name.localeCompare(b.p.name, 'tr')));
  if (!rows.length) { el.innerHTML = '<p class="muted" style="padding:16px">Bu filtrede ürün yok.</p>'; return; }
  el.innerHTML = `<div class="tbl-wrap fitbox"><table class="tbl kt-tbl"><thead><tr><th>Ürün</th><th class="num">Fiyat</th><th class="num">Malzeme</th><th class="num">Kâr</th><th class="num">Marj</th></tr></thead><tbody>
    ${rows.map(({ p, r, mc }) => `<tr data-act="kt-pick" data-id="${p.id}" tabindex="0"><td><div class="kt-name">${miniThumb(p.thumbnail)}<span>${esc(p.name)}${p.set_size > 1 ? ` <small class="muted">${p.set_size}'li set</small>` : ''}</span></div></td>
      <td class="num">${p.sale_price ? fmtTL(p.sale_price) : '<span class="faint">–</span>'}</td>
      <td class="num">${mc.missingGrams ? (p.extra_cost ? fmtTL(p.extra_cost) : '<span class="warn-text">gram yok</span>') : mc.noPrice ? '<span class="warn-text">fiyat yok</span>' : fmtTL(mc.cost * (1 + S.profit.cfg.fire_pct / 100) + (p.extra_cost || 0))}</td>
      <td class="num">${r ? fmtTL(r.profit) : ''}${r?.qty > 1 ? `<br><small class="muted" title="Müşteri en az ${r.qty} adet alır; sipariş kârı ${fmtTL(r.orderProfit)}">en az ${r.qty} adet</small>` : ''}</td><td class="num"><span class="mg ${r ? marginCls(r.margin) : ''}">${r ? fmtPct(r.margin) : ''}</span></td></tr>`).join('')}
    </tbody></table></div>`;
}
async function saveProfitCfg() {
  const g = (id) => $(id).value;
  const body = { commission: g('#pc-commission'), service_fee: g('#pc-service'), cargo_over: g('#pc-over'), packaging: g('#pc-pack') || 0, fire_pct: g('#pc-fire') || 0, filament_kg: g('#pc-kg') || 0, vat: g('#pc-vat'),
    cargo_tiers: $$('[data-tier-upto]').map((x) => ({ upto: x.value, fee: $(`[data-tier-fee="${x.dataset.tierUpto}"]`).value })),
    min_qty: $$('[data-mq-upto]').map((x) => ({ upto: x.value.trim().replace(',', '.'), qty: $(`[data-mq-qty="${x.dataset.mqUpto}"]`).value.trim() })).filter((t) => t.upto && t.qty) };
  try {
    S.profit = await api('PUT', '/api/profit', body);
    if ($$('[data-cat-com]').length) {
      const cats = S.categories.map((c, i) => ({ name: c.name, old_name: c.name, no_materials: c.no_materials, no_parts: c.no_parts, commission: (($(`[data-cat-com="${i}"]`)?.value || '').trim().replace(',', '.')) || null }));
      S.categories = await api('PUT', '/api/categories', { categories: cats });
    }
    toast('Giderler kaydedildi'); render();
  } catch (e) { fail(e); }
}
async function kcSave() {
  const p = productById(KC.pid); if (!p) return;
  const g = (k) => $('#kc-' + k).value.trim();
  const body = { sale_price: g('price'), extra_cost: g('extra'), commission_pct: g('com'), cargo_fee: g('cargo') };
  const grams = numIn(g('grams'));
  if (grams != null && grams !== (+p.grams || 0)) body.grams = grams;
  try { await api('PUT', `/api/products/${p.id}`, body); await loadProducts(); Object.keys(KC).forEach((k) => k !== 'pid' && delete KC[k]); toast(`${p.name} kaydedildi`); kcRender(); ktRender(); } catch (e) { fail(e); }
}

// ---------- Ürün düzenleyicide Trendyol bilgisi ve görselleri
function edTyRender(ty) {
  const box = $('#ty-box'), im = $('#ty-imgs');
  if (!box || !ty || !ty.barcode) return;
  box.innerHTML = `<div class="ty-info">${icon('cart')}<div class="grow"><b>${esc(ty.title || '')}</b>
      <small class="muted">Trendyol · ${esc(ty.barcode)}${ty.sale_price != null ? ` · ${fmtTL(ty.sale_price)}` : ''}${ty.commission != null ? ` · komisyon %${String(ty.commission).replace('.', ',')}` : ''}${ty.on_sale === 0 ? ' · <span class="warn-text">satışta değil</span>' : ''}</small>
      <small class="faint">Satış fiyatı ve komisyon her eşitlemede Trendyol'dan güncellenir.${ty.url ? ` <a href="${esc(ty.url)}" target="_blank" rel="noopener">Trendyol'da aç</a>` : ''}</small></div></div>`;
  if (im && ty.images?.length) im.innerHTML = `<div class="ty-imgs"><small class="muted">Trendyol görselleri, seçmek için dokunun</small><div>${ty.images.slice(0, 8).map((u) => `<button type="button" class="ty-img" data-act="ty-img" data-url="${esc(u)}" style="--img:url('${esc(u)}')" aria-label="Bu görseli kullan"><span class="ty-zoom" data-tyzoom="${esc(u)}" title="Büyük göster">${icon('search')}</span></button>`).join('')}</div></div>`;
}

// ---------- Trendyol ürünleri (içe alma)
async function openTyProducts() {
  openModal(`<div class="modal-h"><h2>Trendyol ürünleri</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b" id="typ-b"><p class="muted">Yükleniyor…</p></div>
    <div class="modal-f"><button class="btn" data-act="typ-sync">${icon('refresh')} Trendyol'dan çek</button>
      <div class="right"><select class="input" id="typ-cat" style="width:auto"><option value="">Kategori seçilmesin</option>${catNames().map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <button class="btn btn-primary" data-act="typ-import" id="typ-import" disabled>Seçilenleri ekle</button></div></div>`, 'wide');
  try { S.typ = await api('GET', '/api/trendyol/products'); } catch (e) { fail(e); return; }
  if (!S.typ.items.length && !S.typ.last_sync) { await tyProductsSync(); return; }
  typRender();
}
async function tyProductsSync() {
  const b = $('[data-act="typ-sync"]'); if (b) b.disabled = true;
  const el = $('#typ-b'); if (el) el.innerHTML = '<p class="muted">Trendyol ürünleri çekiliyor… (ürün sayısına göre biraz sürebilir)</p>';
  try {
    const r = await api('POST', '/api/trendyol/products/sync');
    toast(`${r.products} Trendyol ürünü · ${r.matched || 0} ürününüzle eşleşti${r.images ? ` · ${r.images} görsel eklendi` : ''}`);
    S.typ = await api('GET', '/api/trendyol/products'); await loadProducts();
  } catch (e) { fail(e); try { S.typ = await api('GET', '/api/trendyol/products'); } catch { /* */ } }
  if (b) b.disabled = false;
  typRender();
}
function typRender() {
  const el = $('#typ-b'); if (!el || !S.typ) return;
  const it = S.typ.items, un = it.filter((x) => !x.product_id), mt = it.length - un.length;
  S.typSel = S.typSel || new Set();
  el.innerHTML = `${S.typ.error ? `<p class="pf-warn">${esc(S.typ.error)}</p>` : ''}
    <p class="muted" style="margin-top:0">${it.length} Trendyol ürünü · <b>${mt}</b> tanesi ürünlerinizle barkoddan eşleşti (fiyat, komisyon ve boş görseller güncellendi).${S.typ.last_sync ? ` Son çekme ${fmtWhen(S.typ.last_sync)}.` : ''}</p>
    ${un.length ? `<div class="typ-head"><b>Sistemde olmayanlar (${un.length})</b><label class="switch sm"><input type="checkbox" id="typ-all"> Tümünü seç</label></div>
      <div class="typ-list">${un.map((x) => `<label class="typ-row"><input type="checkbox" data-typ="${esc(x.barcode)}" ${S.typSel.has(x.barcode) ? 'checked' : ''}>
        <span class="mini-thumb" style="--img:url('${esc(x.images[0] || '')}')"></span>
        <span class="grow"><b>${esc(x.title || x.barcode)}</b><small class="muted">${esc([x.color, x.category, x.barcode].filter(Boolean).join(' · '))}</small></span>
        <span class="num">${x.sale_price != null ? fmtTL(x.sale_price) : ''}${x.commission != null ? `<small class="faint">%${x.commission}</small>` : ''}</span></label>`).join('')}</div>
      <p class="muted" style="font-size:12.5px">Seçilenler Trendyol başlığı, görseli, barkodu ve fiyatıyla eklenir; aynı ürünün renkleri tek varyant grubunda toplanır. Gram, süre ve filamenti sonra girersiniz.</p>`
      : it.length ? '<p>Trendyol\'daki tüm ürünleriniz sistemde var.</p>' : '<p class="muted">Trendyol\'da onaylı ürün bulunamadı.</p>'}`;
  const upd = () => { const n = S.typSel.size, b = $('#typ-import'); if (b) { b.disabled = !n; b.textContent = n ? `${n} ürünü ekle` : 'Seçilenleri ekle'; } };
  $$('[data-typ]').forEach((c) => c.addEventListener('change', () => { c.checked ? S.typSel.add(c.dataset.typ) : S.typSel.delete(c.dataset.typ); upd(); }));
  $('#typ-all')?.addEventListener('change', (e) => { $$('[data-typ]').forEach((c) => { c.checked = e.target.checked; c.checked ? S.typSel.add(c.dataset.typ) : S.typSel.delete(c.dataset.typ); }); upd(); });
  upd();
}
async function typImportSelected() {
  const codes = [...(S.typSel || [])]; if (!codes.length) return;
  const b = $('#typ-import'); b.disabled = true; b.textContent = 'Ekleniyor…';
  try {
    const r = await api('POST', '/api/trendyol/products/import', { barcodes: codes, category: $('#typ-cat').value || null });
    S.typSel.clear(); toast(`${r.created} ürün eklendi${r.images ? ` · ${r.images} görsel indirildi` : ''}`);
    closeModal(); render();
  } catch (e) { fail(e); b.disabled = false; }
}

// ---------- Ürün düzenleyicide fiyat ve kâr
function edProfitRender() {
  const box = $('#pf-box'); if (!box || !S.profit) return;
  const g = (id) => numIn($(id)?.value);
  const cur = { ...ED, grams: g('#f-grams') || 0, category: ED.category, set_size: Math.max(1, parseInt($('#f-set')?.value) || 1) };
  const { o, mc } = productProfit(cur, { price: g('#f-price') || 0, extra: g('#f-extra') || 0, commission_pct: g('#f-com'), cargo_fee: g('#f-cargo'), grams: cur.grams });
  if (!o.price) { box.innerHTML = `<p class="muted" style="margin:0">Fiyat yazınca tahmini kâr burada görünür.</p>${pfTargets(o)}`; return; }
  const r = calcProfit(o), hint = tierHint(o);
  box.innerHTML = `<div class="kc-hero sm ${marginCls(r.margin)}"><b>${fmtTL(r.profit)}</b><span>tahmini kâr · ${fmtPct(r.margin)} marj</span></div>
    <p class="pf-src muted">Kargo ${fmtTL(r.cargo)} (${r.cargoTier}) · komisyon %${String(Math.round(r.commissionPct * 100) / 100).replace('.', ',')}${r.comSrc ? ` (${esc(r.comSrc)})` : ''}</p>
    <details class="pf-det"><summary>Hesabın ayrıntısı</summary>${breakdownHTML(r, mc)}</details>
    ${hint ? `<p class="pf-hint">${icon('alert')} ${hint}</p>` : ''}${mc.missingGrams ? warnsHTML(mc) : mc.noPrice ? warnsHTML(mc) : ''}${pfTargets(o)}`;
}
function pfTargets(o) {
  return `<div class="kc-targets" style="margin-top:8px"><small class="muted">Hedef marj:</small>${[0.2, 0.25, 0.3, 0.4].map((m) => { const p = priceForMargin(o, m); return p ? `<button type="button" class="chip" data-act="pf-target" data-v="${p}"><small>%${m * 100}</small> ${fmtTL(p)}</button>` : ''; }).join('')}</div>`;
}

// ================================================================== TRENDYOL SİPARİŞLERİ
const TYO_TABS = [['new', 'Yeni'], ['picking', 'Hazırlanıyor'], ['shipped', 'Kargoda'], ['delivered', 'Teslim'], ['cancelled', 'İptal / İade']];
const TY_CANCEL = new Set(['Cancelled', 'UnSupplied']);
const TYO_ACTIVE = new Set(['new', 'picking']);
S.tyo = { tab: 'new', q: '', sel: new Set(), open: new Set(), rA: 'all', rD: 'month', from: '', to: '', cat: 'all', pid: null, sort: (() => { try { return localStorage.getItem('tyoSort') || 'auto'; } catch { return 'auto'; } })() };
const RANGES = [['all', 'Tüm tarihler'], ['today', 'Bugün'], ['yesterday', 'Dün'], ['week', 'Bu hafta'], ['month', 'Bu ay'], ['prevmonth', 'Geçen ay'], ['last30', 'Son 30 gün'], ['last90', 'Son 3 ay'], ['custom', 'Özel aralık']];
// Tarih aralığı → [başlangıç ms, bitiş ms) ; 'all' → null
function rangeOf(key, from, to) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const day = 86400000, t0 = d0.getTime();
  switch (key) {
    case 'today': return [t0, t0 + day];
    case 'yesterday': return [t0 - day, t0];
    case 'week': { const wd = (d0.getDay() + 6) % 7; return [t0 - wd * day, t0 + day]; }
    case 'month': return [new Date(d0.getFullYear(), d0.getMonth(), 1).getTime(), t0 + day];
    case 'prevmonth': return [new Date(d0.getFullYear(), d0.getMonth() - 1, 1).getTime(), new Date(d0.getFullYear(), d0.getMonth(), 1).getTime()];
    case 'last30': return [t0 - 29 * day, t0 + day];
    case 'last90': return [t0 - 89 * day, t0 + day];
    case 'custom': {
      if (!from) return null;
      const a = new Date(from + 'T00:00:00').getTime(), b = new Date((to || from) + 'T00:00:00').getTime() + day;
      return b > a ? [a, b] : null;
    }
    default: return null;
  }
}
async function loadTyOrders() {
  const r = rangeOf(S.tyo.rD, S.tyo.from, S.tyo.to) || [1, Date.now() + 86400000];
  S.tyOrders = await api('GET', `/api/trendyol/orders?from=${r[0]}&to=${r[1]}`);
}
// sekmeden bağımsız filtreler: arama, kategori, ürün; Yeni/Hazırlanıyor için ayrıca tarih
function tyoBase(p) {
  const q = S.tyo.q.trim().toLocaleLowerCase('tr'), f = S.tyo;
  const live = p.lines.filter((l) => !TY_CANCEL.has(l.status));
  const ls = live.length ? live : p.lines;
  if (f.cat !== 'all') {
    if (f.cat === '__none' ? !ls.some((l) => !l.product_id) : !ls.some((l) => productById(l.product_id)?.category === f.cat)) return false;
  }
  if (f.pid && !ls.some((l) => l.product_id === f.pid)) return false;
  if (q && ![p.order_number, p.customer, p.city, ...p.lines.flatMap((l) => [l.name, l.ty_name, l.barcode])].some((x) => (x || '').toLocaleLowerCase('tr').includes(q))) return false;
  if (TYO_ACTIVE.has(p.tab)) { const r = rangeOf(f.rA, f.from, f.to); if (r && !(p.order_date >= r[0] && p.order_date < r[1])) return false; }
  return true;
}
const tyoFilterOn = () => S.tyo.cat !== 'all' || S.tyo.pid || S.tyo.q.trim() || (TYO_ACTIVE.has(S.tyo.tab) ? S.tyo.rA !== 'all' : S.tyo.rD !== 'month');
function tyoRedraw() { const v = $('#view'); if (!v || route() !== 'siparisler') return; v.innerHTML = PAGES.siparisler.html(); PAGES.siparisler.after(); tick(); }
// Bir paketin tahmini kârı: kargo ve hizmet bedeli bir kez, kargo baremi müşterinin ödediği toplama göre
function orderProfit(pkg) {
  if (!S.profit) return null;
  const cfg = S.profit.cfg, v = 1 + cfg.vat / 100;
  const live = pkg.lines.filter((l) => !TY_CANCEL.has(l.status));
  let P = 0, com = 0, mat = 0, extra = 0, grams = 0, over = null; const missing = new Set();
  for (const l of live) {
    if (l.unit_price == null) { missing.add('fiyat bilgisi yok'); continue; }
    const rev = l.unit_price * l.quantity; P += rev;
    const p = l.product_id ? productById(l.product_id) : null;
    com += rev * (p ? (p.commission_pct ?? p.ty_commission ?? catCommission(p.category) ?? cfg.commission) : cfg.commission) / 100;
    if (!p) { missing.add('eşleşmeyen ürün'); continue; }
    const mc = materialCost(p);
    if (mc.missingGrams && !(p.extra_cost > 0)) missing.add('gramı girilmemiş ürün');
    else if (mc.noPrice) missing.add(mc.resin ? 'reçine fiyatı yok' : 'filament fiyatı yok');
    mat += mc.cost * l.quantity; grams += (mc.grams || 0) * l.quantity; extra += (p.extra_cost || 0) * l.quantity;
    if (p.cargo_fee != null) over = Math.max(over ?? 0, p.cargo_fee);
  }
  if (!P) return null;
  const realCargo = pkg.cargo_real != null && pkg.cargo_real > 0;
  const r = { price: P, commission: com, commissionPct: Math.round(com / P * 1000) / 10, comSrc: '', cargo: realCargo ? pkg.cargo_real : cargoFor(pkg.pkg_total ?? P, over),
    cargoTier: realCargo ? `kargo faturasından${pkg.cargo_desi ? `, ${pkg.cargo_desi} desi` : ''}` : cargoTierLabel(pkg.pkg_total ?? P),
    fee: cfg.service_fee, pack: cfg.packaging, material: mat * (1 + cfg.fire_pct / 100), extra };
  r.costs = r.commission + r.cargo + r.fee + r.pack + r.material + r.extra;
  r.net = P - r.costs; r.profit = r.net / v; r.vat = r.net - r.profit; r.margin = r.profit / P;
  r.missing = [...missing]; r.grams = grams;
  return r;
}
const TYO_SORTS = [['auto', 'Varsayılan (açıkta son teslim, diğerlerinde yeni)'], ['date_desc', 'Tarih: yeniden eskiye'], ['date_asc', 'Tarih: eskiden yeniye'],
  ['dl', 'Son teslim: en yakın'], ['price_desc', 'Tutar: yüksekten'], ['price_asc', 'Tutar: düşükten'], ['items_desc', 'Kalem / adet: çoktan'],
  ['profit_desc', 'Kâr: yüksekten'], ['profit_asc', 'Kâr: düşükten'], ['customer', 'Müşteri (A–Z)'], ['city', 'Şehir (A–Z)']];
function tyoFiltered() {
  const d = S.tyOrders, t = S.tyo.tab;
  const list = d.packages.filter((p) => p.tab === t && tyoBase(p));
  const dl = (p) => effDeadline(p.deadline) || 9e12;
  const live = (p) => p.lines.filter((l) => !TY_CANCEL.has(l.status));
  const amt = (p) => p.pkg_total ?? live(p).reduce((a, l) => a + (l.unit_price || 0) * l.quantity, 0);
  const units = (p) => live(p).reduce((a, l) => a + l.quantity, 0) * 100 + live(p).length;
  const prof = (p) => orderProfit(p)?.profit ?? -1e9;
  const tr = (a, b) => (a || '').localeCompare(b || '', 'tr');
  const by = {
    date_desc: (a, b) => b.order_date - a.order_date, date_asc: (a, b) => a.order_date - b.order_date,
    dl: (a, b) => dl(a) - dl(b) || a.order_date - b.order_date, price_desc: (a, b) => amt(b) - amt(a), price_asc: (a, b) => amt(a) - amt(b),
    items_desc: (a, b) => units(b) - units(a), profit_desc: (a, b) => prof(b) - prof(a), profit_asc: (a, b) => prof(a) - prof(b),
    customer: (a, b) => tr(a.customer, b.customer), city: (a, b) => tr(a.city, b.city) || tr(a.customer, b.customer),
  }[S.tyo.sort || 'auto'];
  if (by) list.sort((a, b) => by(a, b) || b.order_date - a.order_date);
  else if (TYO_ACTIVE.has(t)) list.sort((a, b) => dl(a) - dl(b) || a.order_date - b.order_date);
  else list.sort((a, b) => b.order_date - a.order_date);
  return list;
}
function tyoPage() {
  const d = S.tyOrders, t = S.tyo.tab;
  if (!d) return '';
  const active = TYO_ACTIVE.has(t), f = S.tyo;
  const counts = {}; TYO_TABS.forEach(([k]) => { counts[k] = 0; });
  d.packages.forEach((p) => { if (tyoBase(p)) counts[p.tab]++; });
  const rk = active ? f.rA : f.rD;
  const pname = f.pid ? productById(f.pid)?.name || '' : '';
  const cats = catNames();
  return `<div class="tyo-stick"><div class="seg tyo-tabs" role="tablist">${TYO_TABS.map(([k, l]) => `<button class="${t === k ? 'on' : ''}" data-act="tyo-tab" data-v="${k}" role="tab">${l} <span class="faint">${counts[k]}</span></button>`).join('')}</div>
    <div class="toolbar tyo-tools">
      <label class="search">${icon('search')}<input class="input" id="tyo-q" placeholder="Sipariş no, müşteri, şehir veya ürün" value="${esc(f.q)}" autocomplete="off"></label>
      <span class="spacer"></span>
      <span class="faint tyo-sync-t" style="font-size:12.5px">${d.last_sync ? `Son eşitleme ${fmtWhen(d.last_sync)}` : 'Henüz eşitlenmedi'}</span>
      <button class="btn btn-sm" data-act="tyo-sync">${icon('refresh')} Yenile</button>
    </div></div>
    <div class="toolbar tyo-filters">
      <label class="flt"><span>Tarih${active ? '' : ' (sipariş)'}</span><select class="input" id="tyo-range">${RANGES.map(([k, l]) => `<option value="${k}"${rk === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${rk === 'custom' ? `<label class="flt"><span>Başlangıç</span><input class="input" type="date" id="tyo-from" value="${esc(f.from)}"></label><label class="flt"><span>Bitiş</span><input class="input" type="date" id="tyo-to" value="${esc(f.to)}"></label>` : ''}
      <label class="flt"><span>Kategori</span><select class="input" id="tyo-cat"><option value="all">Tüm kategoriler</option>${cats.map((c) => `<option${f.cat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}<option value="__none"${f.cat === '__none' ? ' selected' : ''}>Eşleşmeyen ürünler</option></select></label>
      <label class="flt flt-p"><span>Ürün</span><input class="input" id="tyo-prod" list="tyo-prods" placeholder="Tüm ürünler" value="${esc(pname)}" autocomplete="off"><datalist id="tyo-prods">${S.products.map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist></label>
      <label class="flt"><span>Sırala</span><select class="input" id="tyo-sort">${TYO_SORTS.map(([k, l]) => `<option value="${k}"${(f.sort || 'auto') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${tyoFilterOn() ? '<button class="btn btn-ghost btn-sm" data-act="tyo-clear">Filtreleri temizle</button>' : ''}
    </div>
    ${!d.tracking_enabled ? `<div class="notice">${icon('bell')}<div>Trendyol takibi kapalı. Siparişlerin buraya gelmesi için <a href="#/satis">Satış</a> sayfasından takibi açın.</div></div>` : ''}
    <div id="tyo-res">${tyoResults()}</div>`;
}
function tyoResults() {
  const d = S.tyOrders, t = S.tyo.tab, active = TYO_ACTIVE.has(t);
  const list = tyoFiltered();
  const prof = list.map((p) => ({ p, r: t === 'cancelled' ? null : orderProfit(p) }));
  const rev = prof.reduce((a, x) => a + (x.r?.price || 0), 0), pr = prof.reduce((a, x) => a + (x.r?.profit || 0), 0);
  const units = list.reduce((a, p) => a + p.lines.filter((l) => !TY_CANCEL.has(l.status)).reduce((b, l) => b + l.quantity, 0), 0);
  const pickable = t === 'new' ? list.filter((p) => p.can_pick) : [];
  const unlabeled = t === 'picking' ? list.filter((p) => p.can_label && !p.label_at) : [];
  const nsel = pickable.filter((p) => S.tyo.sel.has(p.package_id)).length;
  return `<div class="tyo-sum">
      <div><b>${list.length}</b><span>sipariş · ${units} ürün</span></div>
      ${t === 'cancelled' ? '' : `<div><b>${fmtTL(rev)}</b><span>ciro (satıcıya kalan)</span></div>
      <div class="${pr < 0 ? 'neg' : ''}"><b>${fmtTL(pr)}</b><span>tahmini kâr${rev ? ` · ${fmtPct(pr / rev)}` : ''}</span></div>`}
      ${pickable.length ? `<div class="tyo-bulk"><label class="switch"><input type="checkbox" id="tyo-all" ${nsel && nsel === pickable.length ? 'checked' : ''}> Tümünü seç</label>
        <button class="btn btn-primary btn-sm" data-act="tyo-pick-sel" ${nsel ? '' : 'disabled'}>${icon('pack')} Hazırlanıyor'a çek${nsel ? ` (${nsel})` : ''}</button></div>` : ''}
      ${unlabeled.length ? `<div class="tyo-bulk"><button class="btn btn-primary btn-sm" data-act="ty-label-all">${icon('print')} Basılmamış ${unlabeled.length} barkodu bas</button></div>` : ''}
    </div>
    ${list.length ? `<div class="tyo-list fitbox">${prof.map(({ p, r }) => tyoRow(p, r)).join('')}</div>`
      : `<div class="empty panel"><h3>${tyoFilterOn() ? 'Filtreye uyan sipariş yok' : 'Bu sekmede sipariş yok'}</h3><p>${tyoFilterOn() ? 'Filtreleri değiştirip tekrar deneyin.' : active ? 'Yeni siparişler birkaç dakikada bir Trendyol\'dan çekilir.' : 'Başka bir tarih aralığı seçebilirsiniz.'}</p></div>`}`;
}
function tyoRow(p, r) {
  const live = p.lines.filter((l) => !TY_CANCEL.has(l.status));
  const thumbs = (live.length ? live : p.lines);
  const dl = effDeadline(p.deadline);
  const showDl = TYO_ACTIVE.has(p.tab) && dl;
  const unmatched = live.some((l) => !l.product_id);
  const date = new Date(p.order_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' ' + new Date(p.order_date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const sel = p.tab === 'new' && p.can_pick;
  const stTag = { Returned: 'İade', UnDelivered: 'Teslim edilemedi', UnSupplied: 'Tedarik edilemedi', Cancelled: 'İptal', Invoiced: 'Faturalandı', AtCollectionPoint: 'Teslim noktasında' }[p.status];
  const cbCol = p.tab === 'new';
  return `<div class="tyo-row${S.tyo.sel.has(p.package_id) ? ' sel' : ''}${cbCol ? '' : ' nocb'}" data-pkg="${esc(p.package_id)}">
    ${sel ? `<input type="checkbox" class="tyo-cb" data-tyo-sel="${esc(p.package_id)}" ${S.tyo.sel.has(p.package_id) ? 'checked' : ''} aria-label="Siparişi seç">` : cbCol ? '<span class="tyo-cb-sp"></span>' : ''}
    <details class="tyo" ${S.tyo.open.has(p.package_id) ? 'open' : ''} data-tyo-open="${esc(p.package_id)}">
      <summary>
        <span class="tyo-no"><b>${esc(p.order_number)}</b><small class="faint">${date}</small></span>
        <span class="tyo-thumbs">${thumbs.slice(0, 3).map((l) => `<span class="tt" title="${esc(l.name || '')} ×${l.quantity}">${miniThumb(l.thumbnail)}${l.quantity > 1 ? `<i>${l.quantity}</i>` : ''}</span>`).join('')}${thumbs.length > 3 ? `<span class="tt more">+${thumbs.length - 3}</span>` : ''}</span>
        <span class="tyo-who"><b>${esc(p.customer || '—')}</b><small class="muted">${esc(p.city || '')}${unmatched ? ' · <span class="warn-text">eşleşmeyen ürün</span>' : ''}${stTag ? ` · <span class="tag">${stTag}</span>` : ''}</small></span>
        <span class="tyo-amt">${r ? fmtTL(r.price) : p.pkg_total != null ? fmtTL(p.pkg_total) : '–'}</span>
        <span class="tyo-pr">${r ? `<span class="mg ${marginCls(r.margin)}">${r.profit >= 0 ? '+' : ''}${fmtTL(r.profit)}</span><small class="faint">${fmtPct(r.margin)}${r.missing.length ? ' · <span class="warn-text">eksik</span>' : ''}</small>` : '<span class="faint">–</span>'}</span>
        <span class="tyo-dl">${p.can_label ? `<button type="button" class="btn btn-sm ${p.label_at ? 'btn-ghost' : ''} lbl-btn" data-act="ty-label" data-id="${esc(p.package_id)}" title="${p.label_at ? `Etiket ${fmtWhen(p.label_at)} basıldı · tekrar bas` : 'Kargo etiketini bas'}">${icon(p.label_at ? 'check' : 'print')} Barkod</button>`
          : showDl ? dlChip(dl) : p.packed_at && p.tab !== 'cancelled' ? `<small class="faint">paket ${new Date(p.packed_at * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</small>` : ''}</span>
      </summary>
      <div class="tyo-body"></div>
    </details></div>`;
}
function tyoBody(p) {
  const r = p.tab === 'cancelled' ? null : orderProfit(p);
  const lines = p.lines.map((l) => {
    const pr = l.product_id ? productById(l.product_id) : null;
    const state = TY_CANCEL.has(l.status) ? '<span class="tag tag-bad">İptal</span>' : l.state === 'deducted' ? '<span class="tag tag-ok">Stoktan düştü</span>' : l.state === 'restocked' ? '<span class="tag">Stoğa geri eklendi</span>' : !l.product_id ? '<span class="tag tag-warn">Eşleşmedi</span>' : '';
    return `<div class="tyo-line">${miniThumb(l.thumbnail)}<div class="grow"><b>${esc(l.name || 'Bilinmeyen ürün')}</b>${l.ty_name && pr && l.ty_name !== l.name ? `<small class="faint">${esc(l.ty_name)}</small>` : ''}
        <small class="muted">${l.barcode ? esc(l.barcode) : ''}${pr ? ` · rafta ${pr.stock}` : ''}</small>
        ${!l.product_id && l.barcode && !TY_CANCEL.has(l.status) ? `<div class="pick-match"><select class="input" data-tyo-match="${esc(l.barcode)}"><option value="">Hangi ürününüz?</option>${S.products.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><button class="btn btn-sm btn-ok" data-act="tyo-match" data-code="${esc(l.barcode)}">Eşleştir</button></div>` : ''}</div>
      ${state}<span class="tyo-q">×${l.quantity}</span><span class="tyo-up">${l.unit_price != null ? fmtTL(l.unit_price) : '–'}</span></div>`;
  }).join('');
  const dl = effDeadline(p.deadline);
  return `<div class="tyo-grid"><div><div class="tyo-lines">${lines}</div>
      <p class="muted tyo-meta">${p.pkg_total != null ? `Müşterinin ödediği ${fmtTL(p.pkg_total)}` : ''}${dl ? ` · son teslim ${fmtDl(dl)}` : ''} · paket ${esc(p.package_id || '')}</p>
      ${p.cargo_provider || p.cargo_no ? `<div class="tyo-cargo">${icon('pack')}<span><b>${esc(p.cargo_provider || 'Kargo')}</b>${p.cargo_no ? ` · takip no <span class="mono">${esc(p.cargo_no)}</span>` : ''}${p.cargo_real != null ? ` · kargo faturası ${fmtTL(p.cargo_real)}${p.cargo_desi ? ` (${p.cargo_desi} desi)` : ''}` : ''}</span>
        ${p.cargo_link && /^https?:\/\//.test(p.cargo_link) ? `<a class="btn btn-sm btn-ghost" href="${esc(p.cargo_link)}" target="_blank" rel="noopener">Takip et ↗</a>` : ''}
        ${p.can_label ? `<button class="btn btn-sm${p.label_at ? '' : ' btn-primary'}" data-act="ty-label" data-id="${esc(p.package_id)}">${icon('print')} ${p.label_at ? 'Barkodu tekrar bas' : 'Barkodu bas'}</button>${p.label_at ? `<small class="faint">${fmtWhen(p.label_at)} basıldı</small>` : ''}` : ''}</div>` : ''}
      ${p.tab === 'new' ? `<div class="kc-actions">${p.can_pick ? `<button class="btn btn-primary btn-sm" data-act="tyo-pick" data-id="${esc(p.package_id)}">${icon('pack')} Hazırlanıyor'a çek</button>` : '<span class="muted" style="font-size:13px">Bu sipariş buradan çekilemiyor; bir kez Yenile\'ye basın.</span>'}</div>` : ''}</div>
    <div>${r ? `${breakdownHTML(r, r.grams ? { grams: r.grams, perG: r.material / (1 + S.profit.cfg.fire_pct / 100) / r.grams } : null)}${r.missing.length ? `<p class="pf-warn">Eksik bilgi: ${r.missing.join(', ')}. Kâr bu kalemler olmadan hesaplandı.</p>` : ''}` : '<p class="muted">Bu sipariş için kâr hesaplanmıyor.</p>'}</div></div>`;
}
function tyoRes() { const el = $('#tyo-res'); if (!el) return; el.innerHTML = tyoResults(); tyoBindRes(); tick(); }
function tyoBind() {
  const q = $('#tyo-q'), f = S.tyo;
  if (q) q.addEventListener('input', () => { f.q = q.value; tyoRes(); tyoCounts(); });
  const reloadIfDone = async () => { if (!TYO_ACTIVE.has(f.tab)) { try { await loadTyOrders(); } catch (e) { fail(e); } } tyoRedraw(); };
  $('#tyo-range')?.addEventListener('change', (e) => { TYO_ACTIVE.has(f.tab) ? (f.rA = e.target.value) : (f.rD = e.target.value); if (e.target.value === 'custom' && !f.from) { f.from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10); f.to = new Date().toISOString().slice(0, 10); } reloadIfDone(); });
  $('#tyo-from')?.addEventListener('change', (e) => { f.from = e.target.value; reloadIfDone(); });
  $('#tyo-to')?.addEventListener('change', (e) => { f.to = e.target.value; reloadIfDone(); });
  $('#tyo-cat')?.addEventListener('change', (e) => { f.cat = e.target.value; tyoRedraw(); });
  $('#tyo-sort')?.addEventListener('change', (e) => { f.sort = e.target.value; try { localStorage.setItem('tyoSort', f.sort); } catch { /* */ } tyoRes(); });
  $('#tyo-prod')?.addEventListener('change', (e) => { const v = e.target.value.trim(); const p = S.products.find((x) => x.name === v); f.pid = p ? p.id : null; if (v && !p) toast('Listeden bir ürün seçin', { bad: true }); tyoRedraw(); });
  tyoBindRes();
}
// arama yazarken sekme sayılarını yerinde güncelle
function tyoCounts() {
  const c = {}; TYO_TABS.forEach(([k]) => { c[k] = 0; });
  S.tyOrders.packages.forEach((p) => { if (tyoBase(p)) c[p.tab]++; });
  $$('.tyo-tabs button').forEach((b) => { const n = b.querySelector('.faint'); if (n) n.textContent = c[b.dataset.v]; });
}
function tyoBindRes() {
  $('#tyo-all')?.addEventListener('change', (e) => { tyoFiltered().filter((p) => p.can_pick).forEach((p) => (e.target.checked ? S.tyo.sel.add(p.package_id) : S.tyo.sel.delete(p.package_id))); tyoRes(); });
  $$('[data-tyo-sel]').forEach((cb) => cb.addEventListener('change', () => { cb.checked ? S.tyo.sel.add(cb.dataset.tyoSel) : S.tyo.sel.delete(cb.dataset.tyoSel); tyoRes(); }));
  $$('details.tyo').forEach((d) => {
    const fill = () => { const p = S.tyOrders.packages.find((x) => x.package_id === d.dataset.tyoOpen); if (p) d.querySelector('.tyo-body').innerHTML = tyoBody(p); };
    if (d.open) fill();
    d.addEventListener('toggle', () => { d.open ? (S.tyo.open.add(d.dataset.tyoOpen), fill()) : S.tyo.open.delete(d.dataset.tyoOpen); });
  });
}
// ================================================================== kendi kargo etiketimiz (100×80, yazdırma penceresi)
const C128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
// Code128: rakamlar çift sayıdaysa C kümesi (daha kısa barkod), değilse B; tek haneli rakam dizisinde B'den C'ye geçer
function code128(txt) {
  const s = String(txt); let codes;
  if (/^\d+$/.test(s) && s.length >= 4) {
    if (s.length % 2 === 0) codes = [105, ...s.match(/\d\d/g).map(Number)];
    else codes = [104, s.charCodeAt(0) - 32, 99, ...s.slice(1).match(/\d\d/g).map(Number)];
  } else codes = [104, ...[...s].map((c) => Math.max(0, Math.min(94, c.charCodeAt(0) - 32)))];
  let chk = codes[0]; for (let i = 1; i < codes.length; i++) chk += i * codes[i];
  codes.push(chk % 103, 106);
  return codes.map((c) => C128[c]).join('');
}
function barcodeSVG(txt) {
  const pat = code128(txt); let x = 0, bar = true, rects = '';
  for (const ch of pat) { const n = +ch; if (bar) rects += `<rect x="${x}" y="0" width="${n}" height="1"/>`; x += n; bar = !bar; }
  return `<svg class="bc" viewBox="0 0 ${x} 1" preserveAspectRatio="none" shape-rendering="crispEdges">${rects}</svg>`;
}
const LABEL_CSS = `@page { size: 100mm 80mm; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #000; }
.L { width: 100mm; height: 80mm; padding: 4mm 4.2mm 3.6mm; display: flex; flex-direction: column; position: relative; overflow: hidden; page-break-after: always; break-after: page; }
.L::after { content: ""; position: absolute; inset: 1.6mm; border: .6mm solid #000; border-radius: 2.6mm; pointer-events: none; }
.L:last-child { page-break-after: auto; break-after: auto; }
.bc { display: block; width: 100%; height: 100%; fill: #000; }
.top .bc { height: 16mm; width: 86%; margin: 0 auto; }
.tn { text-align: center; font-weight: 800; font-size: 10.5pt; letter-spacing: 2px; margin-top: .5mm; line-height: 1.1; }
.car { font-weight: 800; letter-spacing: .3px; }
.car.other { display: inline-block; background: #000; color: #fff; padding: .2mm 1.2mm; border-radius: .8mm; font-size: 8.5pt; margin-top: .4mm; }
.mid { flex: 1; display: flex; gap: 3mm; align-items: flex-start; margin-top: 1.6mm; border-top: .4mm solid #000; padding-top: 1.8mm; min-height: 0; }
.who { flex: 1; min-width: 0; height: 100%; overflow: hidden; }
.nm { font-size: 13pt; font-weight: 900; line-height: 1.08; display: block; }
.co { font-size: 8pt; font-weight: 700; }
.ad { font-size: 9.5pt; font-weight: 700; line-height: 1.2; margin-top: 1mm; word-break: break-word; }
.nb { font-size: 8.5pt; font-weight: 600; margin-top: .6mm; }
.logo { width: 30mm; height: 19mm; flex: none; object-fit: contain; }
.bot { display: flex; align-items: flex-end; gap: 3mm; border-top: .4mm solid #000; padding-top: 1.5mm; }
.loc { flex: 1; min-width: 0; display: grid; gap: .8mm; }
.loc b { font-size: 14pt; font-weight: 900; line-height: 1.2; white-space: nowrap; overflow: hidden; padding-top: .3mm; }
.loc small { font-size: 7.5pt; font-weight: 700; }
.ob { width: 46mm; flex: none; padding: 0 2mm; } .ob .bc { height: 9mm; } .ob small { display: block; text-align: center; font-size: 6.5pt; font-weight: 700; letter-spacing: 1px; margin-top: .3mm; }`;
function labelPageHTML(d) {
  const city = [d.district, d.city].filter(Boolean).join(' / ').toLocaleUpperCase('tr');
  return `<div class="L"><div class="top">${barcodeSVG(d.tracking)}<div class="tn">${esc(d.tracking)}</div></div>
    <div class="mid"><div class="who"><b class="nm">${esc((d.name || '').toLocaleUpperCase('tr'))}</b>${d.company ? `<div class="co">${esc(d.company)}</div>` : ''}
      <div class="ad">${esc(d.address || '')}</div>${d.neighborhood && !trLower(d.address || '').includes(trLower(d.neighborhood)) ? `<div class="nb">${esc(d.neighborhood)}</div>` : ''}</div>
      <img class="logo" src="${location.origin}/static/etiket-logo.png" alt=""></div>
    <div class="bot"><div class="loc"><b>${esc(city)}</b><small>Sipariş ${esc(d.order_number)}${d.boxes > 1 ? ` · ${d.boxes} koli` : ''}${d.provider ? `<br><span class="car${isTEX(d.provider) ? '' : ' other'}">${esc(d.provider.replace(/ Marketplace$/i, '').toLocaleUpperCase('tr'))}</span>` : ''}</small></div>
      <div class="ob">${barcodeSVG(d.tracking)}<small>${esc(d.tracking)}</small></div></div></div>`;
}
// Uzun ad/adres: sığana kadar yazı küçülür (ad en az 9pt, adres en az 6.5pt)
function labelFit(doc) {
  doc.querySelectorAll('.L').forEach((L) => {
    const who = L.querySelector('.who'), nm = L.querySelector('.nm'), ad = L.querySelector('.ad'), loc = L.querySelector('.loc b');
    let a = 9.5, n = 13;
    while (who.scrollHeight > who.clientHeight + 1 && (a > 6.5 || n > 9)) {
      if (a > 6.5) a -= .5; if (n > 9 && (a <= 8 || nm.offsetHeight > 2 * n * 1.4)) n -= .5;
      ad.style.fontSize = a + 'pt'; nm.style.fontSize = n + 'pt';
    }
    let c = 14; while (loc.scrollWidth > loc.clientWidth + 1 && c > 8) { c -= .5; loc.style.fontSize = c + 'pt'; }
  });
}
function printLabelPages(list) {
  return new Promise((resolve) => {
    const fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:100mm;height:80mm;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(fr);
    const doc = fr.contentDocument;
    doc.open(); doc.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Kargo etiketi</title><style>${LABEL_CSS}</style></head><body>${list.map(labelPageHTML).join('')}</body></html>`); doc.close();
    const imgs = [...doc.images].map((im) => im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }));
    Promise.all(imgs).then(() => (doc.fonts?.ready || Promise.resolve())).then(() => {
      labelFit(doc);
      const done = () => { setTimeout(() => fr.remove(), 500); resolve(); };
      fr.contentWindow.addEventListener('afterprint', done, { once: true });
      fr.contentWindow.focus(); fr.contentWindow.print();
      setTimeout(() => { if (fr.isConnected) done(); }, 120000);
    });
  });
}
const labelServerMode = () => ['share', 'net'].includes(S.labelCfg?.mode);
const isTEX = (p) => /trendyol\s*express|^tex\b/i.test(p || '');
// Trendyol Express dışındaki kargolar karışmasın: basmadan önce belirgin bir uyarı penceresi
function texWarn(list) {
  const other = list.filter((d) => !isTEX(d.provider));
  if (!other.length) return Promise.resolve(true);
  return new Promise((res) => {
    const by = {}; other.forEach((d) => { (by[d.provider || 'Bilinmeyen kargo'] ||= []).push(d); });
    openModal(`<div class="modal-h tex-warn-h"><h2>${icon('alert')} Trendyol Express değil!</h2></div>
      <div class="modal-b tex-warn">
        <p>${other.length === list.length ? (list.length > 1 ? 'Bu siparişlerin' : 'Bu siparişin') : `${list.length} etiketten <b>${other.length}</b> tanesinin`} kargosu <b>Trendyol Express dışında</b>. Paketi doğru kargoya ayırın:</p>
        ${Object.entries(by).map(([pv, ds]) => `<div class="tw-row"><b>${esc(pv)}</b><span>${ds.map((d) => `${esc(d.order_number)} · ${esc(d.name || '')}`).join('<br>')}</span></div>`).join('')}
      </div>
      <div class="modal-f"><button class="btn" data-tw="0">Vazgeç</button><div class="right"><button class="btn btn-primary" data-tw="1">Anladım, bas</button></div></div>`, 'narrow', () => res(false));
    $('.modal').addEventListener('click', (e) => { const b = e.target.closest('[data-tw]'); if (!b) return; modalOnClose = null; closeModal(); res(b.dataset.tw === '1'); });
    soundClaim();
  });
}
async function browserLabels(ids) {
  const r = await api('POST', '/api/trendyol/label-data', { package_ids: ids, mark: false });
  if (r.errors.length) toast(`${r.errors.length} etiket hazırlanamadı: ${r.errors.slice(0, 2).map((e) => `${e.order_number || ''} ${e.error}`.trim()).join('; ')}`, { bad: true });
  if (r.labels.length && await texWarn(r.labels)) {
    await printLabelPages(r.labels);
    api('POST', '/api/trendyol/label-mark', { package_ids: r.labels.map((x) => x.package_id) }).catch(() => {});
  }
  return r;
}

function labelToast(r) {
  if (r.printed.length) toast(`${r.printed.length} kargo etiketi yazıcıya gönderildi`);
  if (r.errors.length) toast(`${r.errors.length} etiket basılamadı: ${r.errors.slice(0, 2).map((e) => e.error).join('; ')}`, { bad: true });
}
async function tyLabel(ids, btn) {
  if (btn) btn.disabled = true;
  try {
    if (!S.labelCfg) S.labelCfg = await api('GET', '/api/label/settings').catch(() => null);
    if (labelServerMode()) labelToast(await api('POST', '/api/trendyol/label', { package_ids: ids }));
    else await browserLabels(ids);
    await loadTyOrders(); tyoRes();
  }
  catch (e) { fail(e); } finally { if (btn) btn.disabled = false; }
}
async function tyoPick(ids) {
  const pk = S.tyOrders.packages.filter((p) => ids.includes(p.package_id));
  const unm = pk.filter((p) => p.lines.some((l) => !l.product_id && !TY_CANCEL.has(l.status))).length;
  // rafta görünenden fazlası paketleniyorsa uyar (baskı kaydı eksik olabilir)
  const needBy = {};
  pk.forEach((p) => p.lines.forEach((l) => { if (l.product_id && !TY_CANCEL.has(l.status) && l.state !== 'deducted') needBy[l.product_id] = (needBy[l.product_id] || 0) + l.quantity; }));
  const short = Object.entries(needBy).map(([pid, n]) => ({ p: productById(+pid), n })).filter((x) => x.p && x.n > x.p.stock);
  const warn = short.length ? `\n\nDİKKAT: Şu ürünler sistemde paketlenecek adetten az görünüyor:\n${short.map((x) => `• ${x.p.name}: sistemde ${x.p.stock}, paketlenecek ${x.n}`).join('\n')}\nRafta gerçekten varsa bir baskı kaydı eksik olabilir. Devam ederseniz stok 0'da durur ve fark panoda "Kontrol edilecekler"e düşer.` : '';
  if (!confirm(`${pk.length} sipariş Trendyol'da Hazırlanıyor durumuna çekilecek ve ürünler stoktan düşülecek.${unm ? `\n${unm} siparişte eşleşmeyen ürün var; onların stoğu düşülemez.` : ''}${warn}\n\nBu işlem Trendyol'da geri alınamaz. Devam edilsin mi?`)) return;
  try {
    if (!S.labelCfg) S.labelCfg = await api('GET', '/api/label/settings').catch(() => null);
    const r = await api('POST', '/api/trendyol/picking', { package_ids: ids });
    ids.forEach((i) => S.tyo.sel.delete(i));
    if (r.done.length) toast(`${r.done.length} sipariş Hazırlanıyor'a çekildi${r.deducted ? ` · ${r.deducted} adet stoktan düştü` : ''}`);
    if (r.errors.length) toast(`${r.errors.length} sipariş çekilemedi: ${r.errors.slice(0, 3).map((e) => `${e.order_number || e.package_id} (${e.error})`).join('; ')}`, { bad: true });
    if (r.labels) labelToast(r.labels);
    else if (r.done.length && S.labelCfg?.auto && !labelServerMode()) await browserLabels(r.done).catch(fail);
    await Promise.all([loadTyOrders(), loadProducts()]); render();
  } catch (e) { fail(e); }
}

// ================================================================== İADELER
const CLAIM_TABS = [['action', 'İşlem bekleyen'], ['transit', 'Yolda'], ['done', 'Sonuçlanan']];
function tabFromHash(def) { const m = /[?&]tab=([\w-]+)/.exec(location.hash); return m ? m[1] : def; }
function syncLine(st, label) {
  if (!st || !st.at) return `<span class="muted">Henüz eşitlenmedi · Trendyol'dan 5 dakikada bir çekilir</span>`;
  return `<span class="muted">${label} ${fmtWhen(st.at)}${st.error ? ` · <span class="warn-text">${esc(st.error)}</span>` : ''}</span>`;
}
PAGES.iadeler = {
  async load() {
    S.clTab = tabFromHash(S.clTab || 'action');
    await Promise.all([S.settings ? null : loadSettings(), (async () => { S.claims = await api('GET', `/api/claims?tab=${S.clTab}`); })()]);
  },
  html() {
    if (!S.settings?.ty_seller_id) return `<div class="empty panel"><h3>Trendyol bağlı değil</h3><p>Önce Satış sayfasından Trendyol API bilgilerini girin.</p><a class="btn btn-primary" href="#/satis">Trendyol ayarları</a></div>`;
    const d = S.claims, t = S.clTab;
    return `<div class="toolbar"><div class="seg">${CLAIM_TABS.map(([k, l]) => `<button type="button" data-act="cl-tab" data-v="${k}" class="${t === k ? 'on' : ''}">${l}${d.counts[k] ? ` <span class="faint">${d.counts[k]}</span>` : ''}</button>`).join('')}</div>
      <span class="spacer"></span>${syncLine(d.sync, 'Son kontrol')}<button class="btn btn-sm" data-act="mu-sync">${icon('refresh')} Yenile</button></div>
      ${t === 'action' ? '<p class="muted cl-hint">İade paketi elinize ulaştı; ürünü kontrol edip onaylayın ya da gerekçesiyle reddedin. Trendyol belirli bir süre içinde işlem yapılmazsa iadeyi kendiliğinden onaylar.</p>' : ''}
      <div class="cl-list">${d.items.length ? d.items.map(claimCard).join('') : `<div class="empty panel"><h3>${t === 'action' ? 'İşlem bekleyen iade yok' : t === 'transit' ? 'Yolda iade yok' : 'Son 30 günde sonuçlanan iade yok'}</h3></div>`}</div>`;
  },
};
function claimCard(c) {
  const act = c.items.filter((i) => i.status === 'WaitingInAction');
  return `<article class="cl-card st-${esc(c.status)}" data-cid="${esc(c.claim_id)}">
    <header><div><b>${esc(c.order_number)}</b> <span class="muted">· ${esc(c.customer || '')}</span></div>
      <span class="cl-st">${esc(c.status_tr)}</span>
      <small class="muted">${c.claim_date ? `iade ${fmtWhen(c.claim_date)}` : ''}${c.cargo_no ? ` · ${esc(c.cargo_provider || 'kargo')} ${c.cargo_link ? `<a href="${esc(c.cargo_link)}" target="_blank" rel="noopener">${esc(c.cargo_no)}</a>` : esc(c.cargo_no)}` : ''}</small></header>
    <div class="cl-items">${c.items.map((i) => `<label class="cl-item${i.status === 'WaitingInAction' ? ' can' : ''}">
      ${i.status === 'WaitingInAction' ? `<input type="checkbox" data-cl-item="${esc(i.id)}" checked>` : '<span class="cl-dot"></span>'}
      ${miniThumb(i.thumbnail)}
      <span class="grow"><b>${esc(i.our_name || i.product || 'Ürün')}</b>${[i.color, i.size].filter(Boolean).length ? `<small class="faint"> · ${esc([i.color, i.size].filter(Boolean).join(' · '))}</small>` : ''}
        <span class="cl-reason">${icon('return')} ${esc(i.reason || 'Gerekçe yok')}</span>
        ${i.customer_note ? `<span class="cl-note">“${esc(i.customer_note)}”</span>` : ''}</span>
      <span class="cl-ist">${esc(i.status_tr)}${i.price ? `<small>${fmtTL(i.price)}</small>` : ''}</span></label>`).join('')}</div>
    ${act.length ? `<footer><label class="switch sm"><input type="checkbox" data-cl-restock> <span>Onaylananları stoğa geri ekle</span></label><span class="spacer"></span>
      <button class="btn" data-act="cl-reject" data-id="${esc(c.claim_id)}">Reddet…</button>
      <button class="btn btn-primary" data-act="cl-approve" data-id="${esc(c.claim_id)}">${icon('check')} Onayla</button></footer>` : ''}
  </article>`;
}
function clSelected(cid) { return $$(`.cl-card[data-cid="${cid}"] [data-cl-item]:checked`).map((x) => x.dataset.clItem); }
async function clReject(cid) {
  const ids = clSelected(cid); if (!ids.length) return toast('Reddedilecek ürünü işaretleyin', { bad: true });
  let reasons = [];
  try { reasons = await api('GET', '/api/claims/reasons'); } catch (e) { return fail(e); }
  const files = [];
  openModal(`<div class="modal-h"><h2>İadeyi reddet</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">
      <label class="field"><span>Gerekçe</span><select class="input" id="rj-r"><option value="">Seçin…</option>${reasons.map((r) => `<option value="${r.id}" data-file="${r.file ? 1 : 0}">${esc(r.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Açıklama <span class="faint">(en fazla 500 karakter)</span></span><textarea class="input" id="rj-d" rows="3" maxlength="500" placeholder="Ürünün durumunu kısaca anlatın"></textarea></label>
      <div class="field"><span>Fotoğraf / belge <span class="faint" id="rj-need">(çoğu gerekçede zorunlu; her biri en fazla 5 MB)</span></span>
        <div class="rj-files" id="rj-files"></div><button type="button" class="btn btn-sm" id="rj-add">${icon('upload')} Dosya ekle</button><input type="file" id="rj-in" accept="image/*,.pdf,video/mp4" multiple hidden></div>
      <small class="muted">Ret talebini Trendyol inceler; sonuç "Sonuçlanan" sekmesinde görünür.</small>
    </div>
    <div class="modal-f"><div class="right"><button class="btn" data-act="close">Vazgeç</button><button class="btn btn-danger" id="rj-go">Reddet</button></div></div>`);
  const draw = () => { $('#rj-files').innerHTML = files.map((f, i) => `<span class="chip sm static">${esc(f.name)} <button type="button" class="linkish" data-rm="${i}">×</button></span>`).join(''); };
  $('#rj-add').onclick = () => $('#rj-in').click();
  $('#rj-files').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { files.splice(+b.dataset.rm, 1); draw(); } };
  $('#rj-in').onchange = async (e) => {
    for (const f of e.target.files) {
      if (f.size > 5 * 1024 * 1024) { toast(`${f.name}: 5 MB'tan büyük`, { bad: true }); continue; }
      const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });
      files.push({ name: f.name, type: f.type, data }); if (files.length >= 5) break;
    }
    e.target.value = ''; draw();
  };
  $('#rj-go').onclick = async () => {
    const opt = $('#rj-r').selectedOptions[0];
    if (!opt?.value) return toast('Gerekçe seçin', { bad: true });
    if (opt.dataset.file === '1' && !files.length) return toast('Bu gerekçe için fotoğraf ya da belge eklemelisiniz', { bad: true });
    if (!confirm('İade reddi Trendyol\'a gönderilecek. Emin misiniz?')) return;
    $('#rj-go').disabled = true;
    try { await api('POST', `/api/claims/${cid}/reject`, { item_ids: ids, reason_id: +opt.value, description: $('#rj-d').value, files }); closeModal(); toast('Ret talebi gönderildi'); render(); }
    catch (err) { fail(err); $('#rj-go').disabled = false; }
  };
}

// ================================================================== MÜŞTERİ SORULARI
const Q_TABS = [['wait', 'Cevap bekleyen'], ['approve', 'Onayda'], ['done', 'Cevaplanan'], ['other', 'Reddedilen / diğer']];
PAGES.sorular = {
  async load() {
    S.qTab = tabFromHash(S.qTab || 'wait');
    await Promise.all([S.settings ? null : loadSettings(), (async () => { S.qs = await api('GET', `/api/questions?tab=${S.qTab}`); })()]);
  },
  html() {
    if (!S.settings?.ty_seller_id) return `<div class="empty panel"><h3>Trendyol bağlı değil</h3><p>Önce Satış sayfasından Trendyol API bilgilerini girin.</p><a class="btn btn-primary" href="#/satis">Trendyol ayarları</a></div>`;
    const d = S.qs, t = S.qTab;
    return `<div class="toolbar"><div class="seg">${Q_TABS.map(([k, l]) => `<button type="button" data-act="q-tab" data-v="${k}" class="${t === k ? 'on' : ''}">${l}${d.counts[k] ? ` <span class="faint">${d.counts[k]}</span>` : ''}</button>`).join('')}</div>
      <span class="spacer"></span>${syncLine(d.sync, 'Son kontrol')}<button class="btn btn-sm" data-act="mu-sync">${icon('refresh')} Yenile</button></div>
      <div class="q-list">${d.items.length ? d.items.map(qCard).join('') : `<div class="empty panel"><h3>${t === 'wait' ? 'Cevap bekleyen soru yok' : 'Burada soru yok'}</h3><p>Son 2 haftanın soruları görünür.</p></div>`}</div>`;
  },
  after() {
    $$('.q-ans textarea').forEach((ta) => ta.addEventListener('input', () => { const n = ta.value.trim().length, c = ta.closest('.q-ans').querySelector('.q-n'); c.textContent = `${n} / 2000`; c.classList.toggle('warn-text', n > 0 && n < 10); }));
  },
};
function qCard(q) {
  const wait = q.status === 'WAITING_FOR_ANSWER';
  return `<article class="q-card${wait ? ' wait' : ''}" data-qid="${q.id}">
    <div class="q-prod">${q.image_url ? `<span class="mini-thumb" style="--img:url('${esc(q.image_url)}')"></span>` : ''}
      <div class="grow">${q.web_url ? `<a href="${esc(q.web_url)}" target="_blank" rel="noopener">${esc(q.product_name || 'Ürün')}</a>` : esc(q.product_name || 'Ürün')}
      <small class="muted">${esc(q.user_name || 'Müşteri')} · ${q.created ? fmtWhen(q.created) : ''}</small></div><span class="q-st">${esc(q.status_tr)}</span></div>
    <p class="q-text">${icon('chat')} ${esc(q.text || '')}</p>
    ${q.answer ? `<div class="q-a"><small>Cevabınız${q.answer_date ? ` · ${fmtWhen(q.answer_date)}` : ''}</small>${esc(q.answer)}</div>` : ''}
    ${q.rejected?.text ? `<div class="q-a rej"><small>Reddedilen cevap${q.rejected.reason ? ` · ${esc(q.rejected.reason)}` : ''}</small>${esc(q.rejected.text)}</div>` : ''}
    ${wait ? `<div class="q-ans"><textarea class="input" rows="3" maxlength="2000" placeholder="Cevabınızı yazın (en az 10 karakter). Kişisel bilgi, telefon, bağlantı yazmayın."></textarea>
      <div class="q-ans-f"><small class="q-n muted">0 / 2000</small><button class="btn btn-primary" data-act="q-send" data-id="${q.id}">${icon('check')} Cevabı gönder</button></div></div>` : ''}
  </article>`;
}

// ================================================================== FİNANS (Trendyol cari hesap ekstresi)
const FIN_TABS = [['pay', 'Ödemeler'], ['inv', 'Faturalar'], ['tx', 'Hareketler'], ['cargo', 'Kargo']];
const fmtDayD = (t) => t ? new Date(t * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
const fmtDayW = (t) => t ? new Date(t * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }) : '–';
async function loadFin() { S.fin = await api('GET', '/api/finance'); }
async function loadFinTx() {
  const f = S.finTx ||= { page: 0, type: '', q: '' };
  const qs = new URLSearchParams({ page: f.page, size: 50, ...(f.type ? { type: f.type } : {}), ...(f.q ? { q: f.q } : {}) });
  f.data = await api('GET', `/api/finance/tx?${qs}`);
}
PAGES.finans = {
  async load() { await Promise.all([loadFin(), S.settings ? null : loadSettings(), (S.finTab || 'pay') === 'tx' ? loadFinTx() : null]); },
  html() {
    const d = S.fin, st = d.status || {}, tab = S.finTab || 'pay';
    const configured = !!S.settings?.ty_seller_id;
    if (!configured) return `<div class="empty panel"><h3>Trendyol bağlı değil</h3><p>Finans bilgileri Trendyol cari hesap ekstresinden gelir. Önce Satış sayfasından Trendyol API bilgilerini girin.</p><a class="btn btn-primary" href="#/satis">Trendyol ayarları</a></div>`;
    const next = d.upcoming[0], upAll = d.upcoming.reduce((a, u) => a + u.net, 0);
    const lastPaid = d.paid.find((x) => x.date && x.date <= nowS());
    const head = `<div class="fin-head"><div class="muted fin-sync">${st.running ? `<span class="spin-dot"></span> Trendyol'dan çekiliyor${st.progress ? ` · %${Math.round(st.progress * 100)}` : ''}…` : st.at ? `Son eşitleme ${fmtWhen(st.at)} · ${d.records} kayıt` : 'Henüz eşitlenmedi'}
        ${st.error ? ` · <span class="warn-text">${esc(st.error)}</span>` : ''}</div>
      <button class="btn btn-sm" data-act="fin-sync" ${st.running ? 'disabled' : ''}>${icon('refresh')} Yenile</button></div>
      <div class="readout fin-kpis">
        <div><b>${next ? fmtTL(next.net) : '–'}</b><span>${next ? `sonraki ödeme · ${fmtDayD(next.date)}` : 'yaklaşan ödeme yok'}</span></div>
        <div><b>${fmtTL(upAll)}</b><span>gelecek ${d.upcoming.length} ödemenin tahmini toplamı</span></div>
        <div><b>${fmtTL(d.pending?.gross || 0)}</b><span>kargolanan / teslim bekleyen · ${d.pending?.orders || 0} sipariş</span></div>
        <div><b>${lastPaid ? fmtTL(lastPaid.amount ?? lastPaid.net) : '–'}</b><span>${lastPaid ? `son ödeme · ${fmtDayD(lastPaid.date)}` : 'ödeme kaydı yok'}</span></div>
        <div><b>${fmtTL(d.invoices_30)}</b><span>son 30 gün Trendyol faturaları</span></div>
        <div><b>${d.cargo.avg != null ? fmtTL(d.cargo.avg) : '–'}</b><span>sipariş başı gerçek kargo${d.cargo.avg_desi ? ` · ort. ${String(d.cargo.avg_desi).replace('.', ',')} desi` : ''}</span></div>
      </div>
      <div class="seg fin-tabs">${FIN_TABS.map(([k, l]) => `<button type="button" data-act="fin-tab" data-v="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    if (!st.at && !st.running && !d.records) return `${head}<div class="empty panel"><h3>Henüz veri yok</h3><p>İlk eşitlemede son 3 ayın ekstresi 14'er günlük parçalarla çekilir; birkaç dakika sürebilir. Sonra her 6 saatte bir kendiliğinden yenilenir.</p><button class="btn btn-primary" data-act="fin-sync">${icon('refresh')} Şimdi çek</button></div>`;
    return `${head}<div id="fin-body">${tab === 'pay' ? finPayHTML() : tab === 'inv' ? finInvHTML() : tab === 'tx' ? finTxHTML() : finCargoHTML()}</div>`;
  },
  after() {
    const q = $('#fin-q');
    if (q) { let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { S.finTx.q = q.value.trim(); S.finTx.page = 0; try { await loadFinTx(); $('#fin-tx-res').innerHTML = finTxRows(); } catch (e) { fail(e); } }, 300); }); }
    $('#fin-type')?.addEventListener('change', async (e) => { S.finTx.type = e.target.value; S.finTx.page = 0; try { await loadFinTx(); $('#fin-tx-res').innerHTML = finTxRows(); } catch (err) { fail(err); } });
    if (S.fin?.status?.running) { clearTimeout(S.finPoll); S.finPoll = setTimeout(async () => { if (route() !== 'finans') return; try { await loadFin(); render(); } catch { /* */ } }, 4000); }
  },
};
const WD_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
function finPayHTML() {
  const d = S.fin, maxU = Math.max(1, ...d.upcoming.map((u) => Math.abs(u.net)));
  const g = d.upcoming.reduce((a, u) => a + u.gross, 0), c = d.upcoming.reduce((a, u) => a + u.cut, 0);
  const days = (d.pay_days || [0, 3]).map((x) => WD_TR[x]).join(' ve ');
  return `${d.upcoming.length ? `<section class="panel fin-sum"><div class="panel-b">
      <div class="fs-rows"><div class="fs-r gross"><span>Toplam satış</span><b>${fmtTL(g)}</b></div>
        <div class="fs-r cut"><span>Toplam tahmini kesintiler <small class="muted">komisyon, kargo, hizmet bedeli, faturalar, iade</small></span><b>${fmtTL(c)}</b></div>
        <div class="fs-r tot"><span>Gelecek ${d.upcoming.length} ödemenin tahmini toplamı</span><b>${fmtTL(g + c)}</b></div></div>
      <div class="fs-side"><span>Kargolanan / teslim bekleyen sipariş tutarı</span><b>${fmtTL(d.pending?.gross || 0)}</b><small class="muted">${d.pending?.orders || 0} sipariş · teslim edilince ödemeye girer</small></div>
    </div></section>` : ''}
  <div class="two-col fin-pay">
    <section class="panel"><div class="panel-h"><h2>Gelecek ödemeler</h2><span class="muted" style="font-size:13px">ödeme günleri: ${days}</span></div><div class="panel-b">
      ${d.upcoming.length ? `<ul class="lst fin-up">${d.upcoming.map((u) => `<li><div class="grow"><div class="t">${fmtDayW(u.date)}</div>
        <div class="s">${u.orders} sipariş · satış ${fmtTL(u.gross)} · kesinti ${fmtTL(u.cut)}</div>
        <span class="fin-bar"><i style="width:${(Math.abs(u.net) / maxU * 100).toFixed(1)}%"></i></span></div><b class="${u.net < 0 ? 'neg-text' : ''}">${fmtTL(u.net)}</b></li>`).join('')}</ul>
        <p class="muted fin-note">Yalnızca teslim edilmiş siparişler; her kayıt vadesinden sonraki ilk ödeme gününe yazılır, ödenmemiş faturalar sıradaki ödemeden düşülür. Tahminidir; Trendyol ödeme gününde değişiklik yapabilir.</p>`
        : '<p class="muted" style="margin:0">Teslim edilmiş ve ödenmeyi bekleyen kayıt yok.</p>'}</div></section>
    <section class="panel"><div class="panel-h"><h2>Yapılan ödemeler</h2></div><div class="panel-b">
      ${d.paid.length ? `<ul class="lst">${d.paid.map((x) => `<li><div class="grow"><div class="t">${fmtDayD(x.date)}</div><div class="s">ödeme no ${esc(x.id)}${x.n ? ` · ${x.n} kayıt` : ''}</div></div><b>${fmtTL(x.amount ?? x.net)}</b></li>`).join('')}</ul>`
        : '<p class="muted" style="margin:0">Henüz ödeme kaydı yok.</p>'}</div></section></div>`;
}
function finInvHTML() {
  const d = S.fin, f = S.finInvF || 'all';
  const kinds = [['all', 'Hepsi'], ['cargo', 'Kargo'], ['com', 'Komisyon'], ['other', 'Diğer']];
  const list = d.invoices.filter((x) => f === 'all' || (f === 'cargo' ? x.cargo : f === 'com' ? x.type === 'Commission' : !x.cargo && x.type !== 'Commission'));
  const sum = list.reduce((a, x) => a + x.amount, 0);
  return `<section class="panel"><div class="panel-h" style="flex-wrap:wrap"><h2>Trendyol'un faturaları</h2><span class="spacer" style="flex:1"></span>
      <div class="chips">${kinds.map(([k, l]) => `<button class="chip${f === k ? ' on' : ''}" data-act="fin-inv-f" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="panel-b">${list.length ? `<div class="tbl-wrap" style="border:0"><table class="tbl fin-tbl"><thead><tr><th>Tarih</th><th>Tür</th><th>Fatura no</th><th>Açıklama</th><th class="num">Tutar</th></tr></thead><tbody>
      ${list.map((x) => `<tr><td class="nowrap">${fmtDayD(x.date)}</td><td><span class="tag ${x.cargo ? 'tag-warn' : x.type === 'Commission' ? 'tag-order' : 'tag-mute'}">${esc(x.label || '')}</span></td><td class="mono">${esc(x.no)}</td>
        <td class="muted">${esc(x.desc || '')}${x.cargo ? ` <button class="btn btn-sm btn-ghost" data-act="fin-tab" data-v="cargo">kalemler</button>` : ''}</td><td class="num"><b>${fmtTL(x.amount)}</b></td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="4"><b>${list.length} fatura</b></td><td class="num"><b>${fmtTL(sum)}</b></td></tr></tfoot></table></div>
      <p class="muted fin-note">Fatura PDF'leri Trendyol API'sinde yok; PDF için satıcı panelindeki Faturalar sayfasını kullanın. Komisyon faturaları satış kayıtlarındaki komisyon fatura numarasına göre toplanır.</p>`
      : '<p class="muted" style="margin:0">Bu türde fatura kaydı yok.</p>'}</div></section>`;
}
function finTxRows() {
  const x = S.finTx?.data; if (!x) return '<div class="pick-item skel" style="height:64px"></div>';
  if (!x.items.length) return '<p class="muted" style="margin:0">Kayıt yok.</p>';
  const pages = Math.ceil(x.total / x.size);
  return `<div class="tbl-wrap" style="border:0"><table class="tbl fin-tbl"><thead><tr><th>Tarih</th><th>İşlem</th><th>Sipariş</th><th>Açıklama</th><th class="num">Komisyon</th><th class="num">Net</th><th>Vade</th></tr></thead><tbody>
    ${x.items.map((r) => `<tr><td class="nowrap">${fmtDayD(r.tx_date)}</td><td>${esc(r.label || '')}</td><td class="mono">${esc(r.order_number || '')}</td>
      <td class="muted fin-desc">${esc(r.description || r.barcode || '')}</td><td class="num muted">${r.commission_amount ? fmtTL(r.commission_amount) + (r.commission_rate ? ` <small>%${r.commission_rate}</small>` : '') : ''}</td>
      <td class="num"><b class="${r.net < 0 ? 'neg-text' : ''}">${fmtTL(r.net)}</b></td><td class="nowrap muted">${r.payment_order_id ? `ödendi ${fmtDayD(r.payment_date)}` : r.payment_date ? fmtDayD(r.payment_date) : ''}</td></tr>`).join('')}
    </tbody></table></div>
    ${pages > 1 ? `<div class="hist-pager fin-pager"><button class="btn btn-sm btn-ghost" data-act="fin-page" data-d="-1"${x.page <= 0 ? ' disabled' : ''}>‹</button><span>${x.page * x.size + 1}–${Math.min((x.page + 1) * x.size, x.total)} / ${x.total}</span><button class="btn btn-sm btn-ghost" data-act="fin-page" data-d="1"${x.page + 1 >= pages ? ' disabled' : ''}>›</button></div>` : ''}`;
}
function finTxHTML() {
  const f = S.finTx ||= { page: 0, type: '', q: '' };
  return `<section class="panel"><div class="panel-h" style="flex-wrap:wrap;gap:8px"><h2>Hareketler</h2><span class="spacer" style="flex:1"></span>
      <label class="search sm">${icon('search')}<input class="input" id="fin-q" placeholder="Sipariş no, barkod, açıklama" value="${esc(f.q)}" autocomplete="off"></label>
      <select class="input" id="fin-type" style="width:auto"><option value="">Tüm işlemler</option>${(S.fin.types || []).map((t) => `<option value="${esc(t.type || t.label)}"${f.type === (t.type || t.label) ? ' selected' : ''}>${esc(t.label)} (${t.n})</option>`).join('')}</select></div>
    <div class="panel-b" id="fin-tx-res">${finTxRows()}</div></section>`;
}
function finCargoHTML() {
  const c = S.fin.cargo;
  const est = (o) => { const p = (S.tyOrders?.packages || []).find((x) => x.order_number === o); return p ? cargoFor(p.pkg_total ?? 0) : null; };
  return `<section class="panel"><div class="panel-h"><h2>Gerçek kargo ücretleri</h2><span class="muted" style="font-size:13px">Trendyol kargo faturalarından · son 90 gün ${c.orders} sipariş · ${fmtTL(c.total)}</span></div>
    <div class="panel-b">${c.rows.length ? `<p class="muted fin-note" style="margin-top:0">Bu ücretler Siparişler ve Kâr hesabında tahmini kargo baremi yerine kullanılır.</p>
      <div class="tbl-wrap" style="border:0"><table class="tbl fin-tbl"><thead><tr><th>Fatura tarihi</th><th>Sipariş</th><th>Tür</th><th class="num">Desi</th><th class="num">Kargo</th></tr></thead><tbody>
      ${c.rows.map((r) => `<tr><td class="nowrap">${fmtDayD(r.date)}</td><td class="mono">${esc(r.order_number)}</td><td class="muted">${esc(r.types || '')}</td><td class="num">${r.desi != null ? String(r.desi).replace('.', ',') : '–'}</td><td class="num"><b>${fmtTL(r.amount)}</b></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted" style="margin:0">Henüz kargo faturası kalemi yok. Trendyol kargo faturalarını genelde haftalık keser.</p>'}</div></section>`;
}

// ================================================================== İSTATİSTİK
// ---------- başarısızlık analizi (son 90 gün): makine / ürün / ürün×makine fire oranı
async function loadFail(force) {
  if (!force && S.fail && Date.now() - (S.failAt || 0) < 600000) return S.fail;
  S.fail = await api('GET', '/api/failures?days=90'); S.failAt = Date.now(); return S.fail;
}
const pctS = (x) => `%${Math.round((x || 0) * 100)}`;
function failHTML() {
  const f = S.fail; if (!f || !f.total.jobs) return '';
  const lvl = (w) => w >= 0.2 ? 'bad' : w >= 0.08 ? 'warn' : 'ok';
  const bar = (x) => { const bad = Math.max(0, x.units - x.good); return `<span class="fr-bar" title="${x.good} sağlam · ${bad} bozuk"><i class="g" style="flex:${x.good || 0}"></i><i class="b" style="flex:${bad}"></i></span>`; };
  const pr = f.printers.filter((x) => x.units);
  return `<section class="panel fail-sec"><div class="panel-h"><h2>Baskı başarısı</h2><span class="muted" style="font-size:13px">son ${f.days} gün · ${f.total.jobs} baskı · fire ${pctS(f.total.waste)}</span></div>
    <div class="panel-b fail-grid">
      <div><h3 class="sub-h">Makineler</h3><div class="tbl-wrap" style="border:0"><table class="tbl fr-tbl"><thead><tr><th>Makine</th><th class="num">Baskı</th><th class="num">Sorunlu</th><th>Sağlam / bozuk adet</th><th class="num">Fire</th></tr></thead><tbody>
        ${pr.map((x) => `<tr><td>${x.name ? `<span class="pr-inline">${printerThumb(x.name, 'xs')}${esc(x.name)}</span>` : '<span class="faint">Makine seçilmemiş</span>'}</td><td class="num">${x.jobs}</td>
          <td class="num">${x.failed + x.partial ? `${x.failed + x.partial}<span class="faint" title="başarısız / kısmen"> (${x.failed}/${x.partial})</span>` : '<span class="faint">0</span>'}</td>
          <td>${bar(x)}</td><td class="num"><b class="fr-${lvl(x.waste)}">${pctS(x.waste)}</b></td></tr>`).join('')}</tbody></table></div></div>
      <div>${f.pairs.length ? `<h3 class="sub-h">Sık bozulanlar</h3><ul class="lst fr-pairs">${f.pairs.slice(0, 6).map((x) => `<li>${miniThumb(x.thumbnail)}<div class="grow"><div class="t">${x.product_id ? `<a class="pd-link" href="#/urun?id=${x.product_id}">${esc(x.name)}</a>` : esc(x.name)} <span class="muted">·</span> <span class="pr-inline">${printerThumb(x.printer, 'xs')}${esc(x.printer || 'makinesiz')}</span></div>
          <div class="s">${x.jobs} baskıdan ${x.bad} tanesi sorunlu${x.other_waste != null && x.other_units ? ` · diğer makinelerde fire ${pctS(x.other_waste)}` : ''}</div></div><b class="fr-bad">${pctS(x.waste)}</b></li>`).join('')}</ul>` : ''}
        ${f.items.length ? `<h3 class="sub-h">En çok fire veren ürünler</h3><ul class="lst fr-items">${f.items.slice(0, f.pairs.length ? 5 : 8).map((x) => `<li>${miniThumb(x.thumbnail)}<div class="grow"><div class="t">${x.product_id ? `<a class="pd-link" href="#/urun?id=${x.product_id}">${esc(x.name)}</a>` : esc(x.name)}</div>
          <div class="s">${x.units - x.good} / ${x.units} adet bozuk · ${x.by.filter((b) => b.units > b.good).map((b) => `${esc(b.printer || 'makinesiz')} ${pctS(b.waste)}`).join(', ')}</div></div><b class="fr-${lvl(x.waste)}">${pctS(x.waste)}</b></li>`).join('')}</ul>`
          : `<p class="muted" style="margin:0">Son ${f.days} günde bozulan baskı yok.</p>`}</div>
    </div></section>`;
}
// Baskı penceresinde: seçilen ürün bu makinede sık bozuluyorsa uyar
function npFailWarn() {
  const el = $('#np-fail'); if (!el) return;
  const pairs = S.fail?.pairs || [];
  const x = NP.printer && (NP.pid || NP.cid) ? pairs.find((q) => q.printer === NP.printer && ((NP.cid && q.component_id === NP.cid) || (!NP.cid && q.product_id === NP.pid))) : null;
  el.classList.toggle('hidden', !x);
  if (x) el.innerHTML = `${icon('alert')}<span><b>Bu ürün ${esc(x.printer)}'de sık bozuluyor:</b> son ${S.fail.days} günde ${x.jobs} baskıdan ${x.bad} tanesi sorunlu, fire ${pctS(x.waste)}${x.other_waste != null && x.other_units ? `; diğer makinelerde ${pctS(x.other_waste)}` : ''}.</span>`;
}
// ---------- ölü stok: rafta duran ama uzun süredir satılmayan ürünler
const DEAD_DAYS = [30, 60, 90, 180];
const deadDays = () => { let n = 30; try { n = +localStorage.getItem('deadDays') || 30; } catch {} return DEAD_DAYS.includes(n) ? n : 30; };
function deadList(days = deadDays()) {
  const cut = nowS() - days * 86400;
  return S.products.filter((p) => !p.archived && p.stock > 0 && (p.last_sale_at || 0) < cut && (p.created_at || 0) < cut)
    .map((p) => { const mc = S.profit ? materialCost(p) : null; return { p, cost: mc && !mc.noPrice && !mc.missingGrams && mc.cost > 0 ? mc.cost * p.stock : null, value: p.sale_price ? p.sale_price * p.stock : null }; })
    .sort((a, b) => (b.value ?? b.cost ?? 0) - (a.value ?? a.cost ?? 0) || b.p.stock - a.p.stock);
}
function deadHTML() {
  if (!S.products?.length) return '';
  const days = deadDays(), list = deadList(days);
  const units = list.reduce((a, x) => a + x.p.stock, 0), cost = list.reduce((a, x) => a + (x.cost || 0), 0), val = list.reduce((a, x) => a + (x.value || 0), 0);
  return `<section class="panel dead-sec"><div class="panel-h" style="flex-wrap:wrap"><h2>Ölü stok</h2><span class="muted" style="font-size:13px">şu an · ${days} gündür satılmayan</span><span class="spacer" style="flex:1"></span>
      <div class="seg" id="dead-days">${DEAD_DAYS.map((d) => `<button type="button" data-act="dead-days" data-v="${d}" class="${d === days ? 'on' : ''}">${d} gün</button>`).join('')}</div></div>
    <div class="panel-b">${list.length ? `<p class="dead-sum"><b>${list.length}</b> ürün · <b>${units}</b> adet rafta bekliyor${cost ? ` · malzeme maliyeti ≈ <b>${fmtMoney(cost)}</b>` : ''}${val ? ` · satış değeri <b>${fmtMoney(val)}</b>` : ''}</p>
      <div class="tbl-wrap" style="border:0"><table class="tbl dead-tbl"><thead><tr><th></th><th>Ürün</th><th class="num">Stok</th><th>Son satış</th><th class="num">Maliyet</th><th class="num">Satış değeri</th></tr></thead><tbody>
      ${list.slice(0, S.deadAll ? 500 : 10).map(({ p, cost: c, value: v }) => `<tr><td style="width:52px">${miniThumb(p.thumbnail)}</td><td><a class="pd-link" href="#/urun?id=${p.id}"><b>${esc(p.name)}</b></a>${p.category ? `<br><span class="faint" style="font-size:12px">${esc(p.category)}</span>` : ''}</td>
        <td class="num"><b>${p.stock}</b></td><td class="muted">${p.last_sale_at ? `${Math.floor((nowS() - p.last_sale_at) / 86400)} gün önce` : 'hiç satılmadı'}</td>
        <td class="num">${c != null ? `≈${fmtMoney(c)}` : '<span class="faint">–</span>'}</td><td class="num">${v != null ? fmtMoney(v) : '<span class="faint">fiyat yok</span>'}</td></tr>`).join('')}
      </tbody></table></div>${list.length > 10 ? `<button class="btn btn-sm btn-ghost" data-act="dead-all">${S.deadAll ? 'Daha az göster' : `Tümünü göster (${list.length})`}</button>` : ''}`
      : `<p class="muted" style="margin:0">Rafta olup ${days} gündür hiç satılmayan ürün yok.</p>`}</div></section>`;
}
PAGES.istatistik = {
  async load() {
    const n = new Date();
    S.statMonth = S.statMonth || `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    const [st, ty] = await Promise.all([api('GET', `/api/stats?month=${S.statMonth}`), api('GET', `/api/trendyol/orders?month=${S.statMonth}`).catch(() => null),
      loadProfit().catch(() => null), S.components ? null : loadComponents(), loadFail().catch(() => null), loadProducts(), loadSpools().catch(() => null)]);
    S.stats = st; S.statTy = ty;
  },
  html() {
    const d = S.stats, t = d.totals;
    const pct = (a, b) => b ? Math.round((a - b) / b * 100) : null;
    const chg = pct(t.sales, t.prev_sales);
    const failRate = t.jobs ? Math.round(t.failed / t.jobs * 100) : 0;
    const merge = !!S.statMerge, cat = S.statCat || 'all';
    const sq = (S.statQ || '').trim().toLocaleLowerCase('tr');
    let rows = d.products.filter((r) => (cat === 'all' || r.category === cat) && (!sq || (r.name || '').toLocaleLowerCase('tr').includes(sq)));
    if (merge) {
      const g = {};
      rows.forEach((r) => {
        const k = r.group_id ? 'g' + r.group_id : 'p' + r.id;
        const x = (g[k] ||= { ...r, name: r.group_id ? r.base_name : r.name, weeks: r.weeks.map(() => 0), total: 0, prev_total: 0, trend: r.trend.map(() => 0), trendyol: 0, manual: 0, printed: 0, variants: 0 });
        x.variants++; ['total', 'prev_total', 'trendyol', 'manual', 'printed'].forEach((f) => { x[f] += r[f]; });
        r.weeks.forEach((v, i) => { x.weeks[i] += v; }); r.trend.forEach((v, i) => { x.trend[i] += v; });
      });
      rows = Object.values(g).sort((a, b) => b.total - a.total || b.prev_total - a.prev_total);
    }
    const cats = [...new Set(d.products.map((r) => r.category).filter(Boolean))];
    const maxW = Math.max(1, ...t.by_week), maxT = Math.max(1, ...t.trend);
    const cur = d.weeks.findIndex((w) => nowS() >= w.start && nowS() < w.end);
    return `<div class="stat-head">
        <button class="icon-btn" data-act="stat-month" data-d="-1" aria-label="Önceki ay">‹</button>
        <h2>${esc(d.label)}</h2>
        <button class="icon-btn" data-act="stat-month" data-d="1" aria-label="Sonraki ay" ${d.is_current ? 'disabled' : ''}>›</button>
        ${d.is_current ? '' : '<button class="btn btn-ghost btn-sm" data-act="stat-month" data-d="0">Bu ay</button>'}
      </div>
      <div class="readout stat-kpis">
        <div><b>${t.sales}</b><span>adet satıldı${chg != null ? ` · <span class="${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'} %${Math.abs(chg)}</span> ${esc(d.prev_label.split(' ')[0])}'e göre` : ''}</span></div>
        <div><b>${t.trendyol}</b><span>Trendyol · ${t.manual} elden / barkod</span></div>
        <div><b>${t.printed}</b><span>sağlam basıldı · ${t.jobs} baskı</span></div>
        <div class="${failRate >= 10 ? 'neg' : ''}"><b>%${failRate}</b><span>fire (${t.failed} başarısız baskı)</span></div>
        <div><b>${t.filament_g >= 1000 ? (Math.round(t.filament_g / 100) / 10).toLocaleString('tr-TR') + '<small style="font-size:18px"> kg</small>' : t.filament_g + '<small style="font-size:18px"> g</small>'}</b><span>filament harcandı</span></div>
        <div><b>${t.orders_delivered}</b><span>özel sipariş teslim${t.orders_revenue ? ` · ${fmtMoney(t.orders_revenue)}` : ''}</span></div>
      </div>
      ${statProfitHTML()}
      <div class="two-col stat-charts">
        <section class="panel"><div class="panel-h"><h2>Haftalık satış</h2><span class="muted" style="font-size:13px">adet</span></div>
          <div class="panel-b"><div class="bars" role="img" aria-label="Haftalık satış">${d.weeks.map((w, i) => `<div class="bar-col${i === cur ? ' cur' : ''}" tabindex="0" data-tip="${esc(w.label)} · ${esc(w.range)}: ${t.by_week[i]} satış, ${t.printed_by_week[i]} basıldı">
            <span class="bar-v">${t.by_week[i] || ''}</span><i style="height:${(t.by_week[i] / maxW * 100).toFixed(1)}%"></i><span class="bar-l">${w.index}. hafta<small>${esc(w.range)}</small></span></div>`).join('')}</div></div></section>
        <section class="panel"><div class="panel-h"><h2>Son 6 ay</h2><span class="muted" style="font-size:13px">satılan adet</span></div>
          <div class="panel-b"><div class="bars">${d.months6.map((m, i) => `<div class="bar-col${m.key === d.month ? ' cur' : ''}" tabindex="0" data-tip="${esc(m.label)}: ${t.trend[i]} satış" data-act="stat-goto" data-m="${m.key}">
            <span class="bar-v">${t.trend[i] || ''}</span><i style="height:${(Math.max(0, t.trend[i]) / maxT * 100).toFixed(1)}%"></i><span class="bar-l">${esc(m.label)}</span></div>`).join('')}</div></div></section>
      </div>
      <section class="panel"><div class="panel-h" style="flex-wrap:wrap"><h2>Ürün satışları</h2>
          <div class="toolbar" style="margin:0;gap:8px">
            ${cats.length ? `<div class="chips">${['all', ...cats].map((c) => `<button class="chip${cat === c ? ' on' : ''}" data-act="stat-cat" data-v="${esc(c)}">${c === 'all' ? 'Hepsi' : esc(c)}</button>`).join('')}</div>` : ''}
            <label class="search sm">${icon('search')}<input class="input" id="stat-q" placeholder="Ürün ara" value="${esc(S.statQ || '')}" autocomplete="off"></label>
            <label class="switch sm"><input type="checkbox" id="stat-merge" ${merge ? 'checked' : ''}> Renk varyantlarını birleştir</label></div></div>
        <div class="panel-b">${rows.length ? `<div class="tbl-wrap fitbox" style="border:0"><table class="tbl stat-tbl"><thead><tr><th></th><th>Ürün</th>
            ${d.weeks.map((w, i) => `<th class="num${i === cur ? ' cur' : ''}" title="${esc(w.range)}">${w.index}. hf<br><small>${esc(w.range)}</small></th>`).join('')}
            <th class="num">Toplam</th><th class="num">${esc(d.prev_label.split(' ')[0])}</th><th>6 ay</th><th class="num">Basılan</th></tr></thead><tbody>
          ${rows.map((r, n) => { const c = pct(r.total, r.prev_total), mx = Math.max(1, ...r.trend);
            return `<tr><td style="width:52px">${miniThumb(r.thumbnail)}</td>
              <td>${r.id && r.variants <= 1 ? `<a class="pd-link" href="#/urun?id=${r.id}"><b>${esc(r.name)}</b></a>` : `<b>${esc(r.name)}</b>`}${r.variants > 1 ? ` <span class="faint">${r.variants} renk</span>` : ''}${r.category ? `<br><span class="faint" style="font-size:12px">${esc(r.category)}</span>` : ''}</td>
              ${r.weeks.map((v, i) => `<td class="num${i === cur ? ' cur' : ''}${v ? '' : ' zero'}">${v || '·'}</td>`).join('')}
              <td class="num"><b class="big">${r.total}</b></td>
              <td class="num">${r.prev_total}${c != null && r.total ? ` <span class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '▲' : '▼'}${Math.abs(c)}%</span>` : ''}</td>
              <td><span class="spark" title="${d.months6.map((m, i) => `${m.label}: ${r.trend[i]}`).join(' · ')}">${r.trend.map((v) => `<i style="height:${Math.max(2, Math.max(0, v) / mx * 100)}%"></i>`).join('')}</span></td>
              <td class="num">${r.printed || ''}</td></tr>`; }).join('')}
          </tbody><tfoot><tr><td></td><td><b>Toplam</b></td>${d.weeks.map((w, i) => `<td class="num"><b>${t.by_week[i]}</b></td>`).join('')}<td class="num"><b class="big">${t.sales}</b></td><td class="num">${t.prev_sales}</td><td></td><td class="num">${t.printed}</td></tr></tfoot></table></div>`
          : `<div class="empty" style="padding:24px"><h3>Bu ay satış yok</h3><p>Trendyol'da paketlenen, barkodla okutulan ya da elle düşülen satışlar burada haftalara ayrılarak görünür.</p></div>`}</div></section>
      ${t.filament_by.length ? `<section class="panel"><div class="panel-h"><h2>Filament kullanımı</h2></div><div class="panel-b"><div class="colors">${t.filament_by.map((f) => `<span class="color-chip"><span class="spool${swatchCls(f.color_hex || '#ccc')}" style="${swatchStyle(f.color_hex || '#ccc')}"></span>${esc(f.color_name || colorName(f.color_hex) || '')} ${esc(f.material || '')}${f.brand ? ` <span class="muted">${esc(f.brand)}</span>` : ''} <b>${fmtKg(f.grams)}</b></span>`).join('')}</div></div></section>` : ''}
      ${(d.misc || []).length ? `<section class="panel"><div class="panel-h"><h2>Diğer amaçlı baskılar</h2><span class="muted" style="font-size:13px">satış ve üretim sayılarına dahil değil</span></div>
        <div class="panel-b"><ul class="lst">${d.misc.map((m) => `<li>${miniThumb(m.thumbnail)}<div class="grow"><div class="t">${esc(m.name || 'Silinmiş kayıt')}</div><div class="s">${m.jobs} baskı · ${m.pieces} adet</div></div>
          <div style="text-align:right"><b>${fmtKg(m.grams)}</b><div class="s muted" style="font-size:12.5px">${m.cost ? fmtMoney(m.cost) : '—'}</div></div></li>`).join('')}
          <li><div class="grow"><b>Toplam</b></div><div style="text-align:right"><b>${fmtKg(d.misc.reduce((a, m) => a + m.grams, 0))}</b><div class="s muted" style="font-size:12.5px">${fmtMoney(d.misc.reduce((a, m) => a + m.cost, 0))}</div></div></li></ul></div></section>` : ''}
      ${failHTML()}
      ${deadHTML()}`;
  },
  after() {
    $('#stat-merge')?.addEventListener('change', (e) => { S.statMerge = e.target.checked; render(); });
    $('#stat-q')?.addEventListener('input', (e) => {
      S.statQ = e.target.value; const pos = e.target.selectionStart, y = scrollY;
      const v = $('#view'); v.innerHTML = PAGES.istatistik.html(); PAGES.istatistik.after(); scrollTo(0, y);
      const n = $('#stat-q'); n.focus(); n.setSelectionRange(pos, pos);
    });
  },
};
// Ayın Trendyol siparişleri (sipariş tarihine göre, iptaller hariç) için ciro ve tahmini kâr
function statProfitHTML() {
  const ty = S.statTy; if (!ty || !S.profit) return '';
  const [y, m] = S.statMonth.split('-').map(Number), a = new Date(y, m - 1, 1).getTime(), b = new Date(y, m, 1).getTime();
  const pk = ty.packages.filter((p) => p.tab !== 'cancelled' && p.order_date >= a && p.order_date < b);
  if (!pk.length) return '';
  let rev = 0, pr = 0, n = 0, miss = 0; const byP = {};
  pk.forEach((p) => {
    const r = orderProfit(p); if (!r) { miss++; return; }
    n++; rev += r.price; pr += r.profit; if (r.missing.length) miss++;
    // ürün başına: siparişin kârını ürünlerin cirosuna göre paylaştır
    p.lines.filter((l) => !TY_CANCEL.has(l.status) && l.unit_price != null).forEach((l) => {
      const k = l.product_id || 'x' + l.barcode, share = l.unit_price * l.quantity / r.price;
      const x = (byP[k] ||= { name: l.name, thumb: l.thumbnail, cat: productById(l.product_id)?.category || null, qty: 0, rev: 0, pr: 0, orders: new Set() });
      x.qty += l.quantity; x.rev += l.unit_price * l.quantity; x.pr += r.profit * share; x.orders.add(p.package_id);
    });
  });
  const cat = S.statCat || 'all', sq = (S.statQ || '').trim().toLocaleLowerCase('tr');
  let top = Object.values(byP).sort((x, y2) => y2.pr - x.pr);
  if (cat !== 'all' || sq) {
    top = top.filter((x) => (cat === 'all' || x.cat === cat) && (!sq || (x.name || '').toLocaleLowerCase('tr').includes(sq)));
    rev = top.reduce((s2, x) => s2 + x.rev, 0); pr = top.reduce((s2, x) => s2 + x.pr, 0);
    n = new Set(top.flatMap((x) => [...x.orders])).size;
    if (!top.length) return '';
  }
  return `<section class="panel stat-profit"><div class="panel-h"><h2>Trendyol kârı</h2><span class="muted" style="font-size:13px">tahmini · ${n} sipariş${cat !== 'all' || sq ? ' · filtreli' : ''}</span></div>
    <div class="panel-b"><div class="tyo-sum" style="margin:0 0 12px">
      <div><b>${fmtTL(rev)}</b><span>ciro (satıcıya kalan)</span></div>
      <div class="${pr < 0 ? 'neg' : ''}"><b>${fmtTL(pr)}</b><span>tahmini kâr · ${fmtPct(rev ? pr / rev : null)}</span></div>
      <div><b>${fmtTL(n ? pr / n : 0)}</b><span>sipariş başına kâr</span></div>
    </div>
    ${miss ? `<p class="pf-warn" style="margin-bottom:12px">${miss} siparişte eksik bilgi var (gram, makara fiyatı ya da eşleşmeyen ürün); kâr o kalemler olmadan hesaplandı.</p>` : ''}
    <div class="tbl-wrap fitbox"><table class="tbl kt-tbl"><thead><tr><th>Ürün</th><th class="num">Adet</th><th class="num">Ciro</th><th class="num">Tahmini kâr</th><th class="num">Marj</th></tr></thead><tbody>
      ${top.map((x) => `<tr><td><div class="kt-name">${miniThumb(x.thumb)}<span>${esc(x.name || '—')}</span></div></td><td class="num">${x.qty}</td><td class="num">${fmtTL(x.rev)}</td><td class="num">${fmtTL(x.pr)}</td><td class="num"><span class="mg ${marginCls(x.rev ? x.pr / x.rev : null)}">${fmtPct(x.rev ? x.pr / x.rev : null)}</span></td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted" style="font-size:12.5px;margin:8px 0 0">Kargo ve hizmet bedeli çok ürünlü siparişlerde ürünlere ciroları oranında paylaştırılır. Trendyol'a bağlanmadan önceki aylarda veri olmayabilir.</p></div></section>`;
}
function shiftMonth(key, d) { const [y, m] = key.split('-').map(Number); const t = new Date(y, m - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; }

// ================================================================== PICK LIST (Trendyol Yeni siparişler)
PAGES.hazirla = {
  async load() { await Promise.all([S.settings ? null : loadSettings(), loadProducts()]); },
  html() {
    if (!S.settings?.ty_seller_id) {
      return `<div class="empty panel"><h3>Trendyol bağlantısı yok</h3><p>Yeni durumundaki siparişlerdeki ürünleri burada toplu görmek için önce Trendyol API bilgilerini girin.</p><a class="btn btn-primary" href="#/satis">Trendyol ayarları</a></div>`;
    }
    return `<div class="toolbar pick-toolbar">
        <div class="pick-sum" id="pick-sum"><span class="muted">Yeni siparişler getiriliyor…</span></div>
        <span class="spacer"></span>
        <div class="chips" id="pick-filter">${[['all', 'Tümü'], ['today', 'Bugün çıkacaklar'], ['short', 'Stok yetmeyenler']].map(([v, l]) => `<button class="chip${(S.pickFilter || 'all') === v ? ' on' : ''}" data-act="pick-filter" data-v="${v}">${l}</button>`).join('')}</div>
        <select class="input" id="pick-sort" style="width:auto"><option value="urgent"${(S.pickSort || 'urgent') === 'urgent' ? ' selected' : ''}>En acil önce</option><option value="qty"${S.pickSort === 'qty' ? ' selected' : ''}>En çok adet</option></select>
        <button class="btn" data-act="pick-print" aria-label="Yazdır">${icon('print')}<span class="bl">Yazdır</span></button>
        <button class="btn" data-act="pick-refresh" id="pick-refresh" aria-label="Yenile">${icon('refresh')}<span class="bl">Yenile</span></button>
      </div>
      <div id="pick-list">${S.pick ? pickListHTML() : pickSkeleton()}</div>`;
  },
  after() {
    $('#pick-sort')?.addEventListener('change', (e) => { S.pickSort = e.target.value; if (S.pick) $('#pick-list').innerHTML = pickListHTML(); });
    if (S.settings?.ty_seller_id) loadPick(!S.pick || Date.now() - (S.pickAt || 0) > 60000);
  },
};
function pickSkeleton() { return `<div class="pick-grid">${'<div class="pick-item skel"></div>'.repeat(4)}</div>`; }
async function loadPick(force) {
  if (!force && S.pick) { fillPick(); return; }
  const btn = $('#pick-refresh'); btn?.classList.add('spin');
  try {
    const show = (d) => { S.pick = d; S.pickAt = Date.now(); if (route() === 'hazirla') fillPick(); if (route() === '') fillTyDash(); };
    const [d] = await Promise.all([api('GET', '/api/trendyol/pick-list'), loadJobs(), loadProducts()]);
    show(d);
    if (force) {
      // Paketlenen (Hazırlanıyor'a çekilen) siparişleri hemen yakala, sonra listeyi tazele
      const r = await api('POST', '/api/trendyol/sync').catch(() => null);
      if (r && (r.deducted || r.restocked || r.unmatched)) { await loadProducts(); show(await api('GET', '/api/trendyol/pick-list')); }
      if (r?.deducted) toast(`${r.deducted} adet paketlendi olarak stoktan düştü`);
    }
  } catch (e) {
    if ($('#pick-list')) $('#pick-list').innerHTML = `<div class="notice">${icon('bell')}<div>${esc(e.message)}</div></div>`;
    if ($('#ty-dash-body')) $('#ty-dash-body').innerHTML = `<p class="muted" style="margin:0">${esc(e.message)}</p>`;
  } finally { btn?.classList.remove('spin'); }
}

// ---------- kargoya son teslim: Trendyol'un tarihi, kargo çıkış saatinden sonraysa o günün çıkış saati
function effDeadline(ms) {
  if (!ms) return null;
  let d = new Date(ms);
  const cut = S.settings?.ship_cutoff;
  if (cut) { const [h, m] = cut.split(':').map(Number); const c = new Date(d); c.setHours(h, m, 0, 0); if (d > c) d = c; }
  return Math.floor(d.getTime() / 1000);
}
function fmtLeft(sec) {
  const a = Math.abs(sec), d = Math.floor(a / 86400), h = Math.floor((a % 86400) / 3600), m = Math.floor((a % 3600) / 60);
  const t = d ? `${d} g ${h} sa` : h ? `${h} sa ${m} dk` : `${Math.max(1, m)} dk`;
  return sec < 0 ? `${t} gecikti` : `${t} kaldı`;
}
const fmtDl = (sec) => {
  const d = new Date(sec * 1000), t = new Date();
  const day = d.toDateString() === t.toDateString() ? 'bugün' : (new Date(t.getTime() + 86400000).toDateString() === d.toDateString() ? 'yarın' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' }));
  return `${day} ${fmtClock(sec)}`;
};
const URG_RANK = { late: 0, nofit: 1, soon: 2, warn: 3, ok: 4, none: 5 };
const URG_TEXT = { late: 'Gecikti', nofit: 'Baskı yetişmez', soon: 'Son saatler', warn: 'Bugün çıkmalı', ok: '' };
function urgency(dl, needSec) {
  if (!dl) return 'none';
  const left = dl - nowS();
  if (left < 0) return 'late';
  if (needSec && needSec > left) return 'nofit';
  if (left < 3 * 3600) return 'soon';
  const eod = new Date(); eod.setHours(23, 59, 59, 999);
  if (dl * 1000 <= eod.getTime()) return 'warn';
  return 'ok';
}
const dlChip = (dl, need = 0) => dl ? `<span class="dl dl-${urgency(dl, need)}" data-dl="${dl}" data-need="${need}">${fmtLeft(dl - nowS())}</span>` : '';
// Eksik kalan adetleri basmak ne kadar sürer (tek makine varsayımı); baskıdakiler varsa onların kalan süresi
function printNeedSec(p, missing) {
  if (!p || missing <= 0) return 0;
  const active = S.jobs.filter((j) => j.product_id === p.id && j.status === 'printing');
  if ((p.in_production || 0) >= missing && active.length) return Math.max(0, Math.min(...active.map((j) => j.ends_at)) - nowS());
  const rest = missing - (p.in_production || 0);
  const batches = rest; // süre ve gram 1 set (ya da 1 adet) içindir
  return batches * (p.print_minutes || 0) * 60;
}
// Eksik ürün o sırada baskıdaysa: kaç tane ve en erken ne zaman bitiyor
function inPrintInfo(p) {
  if (!p) return null;
  const jobs = S.jobs.filter((j) => j.product_id === p.id && j.status === 'printing');
  if (!jobs.length) return null;
  const qty = p.parts?.length ? (p.in_production || 0) : jobs.reduce((a, j) => a + j.quantity, 0);
  return { qty, partsOnly: p.parts?.length && !p.in_production, ends: Math.min(...jobs.map((j) => j.ends_at)), last: Math.max(...jobs.map((j) => j.ends_at)) };
}
function inPrintBadge(p, shortage) {
  const ip = inPrintInfo(p);
  if (!ip) return '';
  const covers = !ip.partsOnly && ip.qty >= shortage;
  const what = ip.partsOnly ? 'parçaları baskıda' : `${ip.qty} ${p.set_size > 1 ? 'set' : 'adet'} baskıda`;
  return `<span class="inprint-badge${covers ? ' covers' : ''}" title="${covers ? 'Eksik adet baskıda karşılanıyor' : 'Baskıdaki adet eksiği tam karşılamıyor'}">
    <i class="ip-head"></i><span>${what} · <b data-eta="${ip.ends}">${fmtEta(ip.ends - nowS())}</b></span></span>`;
}
const fmtEta = (sec) => sec <= 0 ? 'bitti, sonucu bekliyor' : `~${fmtDur(Math.ceil(sec / 60))} kaldı`;

// Raftaki adedi siparişlere son teslim sırasına göre dağıtır; her siparişin karşılanıp karşılanmadığını ve aciliyetini bulur
function analyzePick(d) {
  const eod = new Date(); eod.setHours(23, 59, 59, 999); const eodS = Math.floor(eod.getTime() / 1000);
  const items = d.items.map((i) => {
    const p = i.product_id ? productById(i.product_id) : null;
    let shelf = i.on_shelf ?? 0, missingSoFar = 0;
    const orders = [...i.orders].map((o) => ({ ...o, dl: effDeadline(o.deadline) })).sort((a, b) => (a.dl || 9e12) - (b.dl || 9e12));
    for (const o of orders) {
      const use = i.product_id ? Math.min(shelf, o.quantity) : 0;
      shelf -= use; o.missing = o.quantity - use; missingSoFar += o.missing;
      o.need = o.missing ? printNeedSec(p, missingSoFar) : 0;
      o.urg = urgency(o.dl, o.need);
      o.today = o.dl != null && o.dl <= eodS;
    }
    const worst = orders.reduce((w, o) => (URG_RANK[o.urg] < URG_RANK[w] ? o.urg : w), 'none');
    const earliest = orders.find((o) => o.dl)?.dl || null;
    const todayOrders = orders.filter((o) => o.today);
    return { ...i, p, orders, worst, earliest,
      todayQty: todayOrders.reduce((a, o) => a + o.quantity, 0), todayMissing: todayOrders.reduce((a, o) => a + o.missing, 0),
      todayOrderCount: new Set(todayOrders.map((o) => o.order_number)).size };
  });
  const allOrders = new Map();
  items.forEach((i) => i.orders.forEach((o) => { const x = allOrders.get(o.order_number); if (!x || URG_RANK[o.urg] < URG_RANK[x.urg]) allOrders.set(o.order_number, o); }));
  const ords = [...allOrders.values()];
  return { items, today: ords.filter((o) => o.today).length, late: ords.filter((o) => o.urg === 'late').length,
    atRisk: ords.filter((o) => o.urg === 'nofit' || o.urg === 'soon').length };
}
function todayCutoffS() {
  const cut = S.settings?.ship_cutoff; if (!cut) return null;
  const [h, m] = cut.split(':').map(Number); const c = new Date(); c.setHours(h, m, 0, 0);
  return Math.floor(c.getTime() / 1000);
}

function fillPick() {
  const d = S.pick, a = analyzePick(d), cut = todayCutoffS();
  $('#pick-sum').innerHTML = `<b>${d.unit_count}</b> adet · <b>${d.order_count}</b> yeni sipariş
    ${a.today ? ` · <span class="sum-today"><b>${a.today}</b> sipariş bugün çıkmalı${cut && cut > nowS() ? `, kargoya ${dlChip(cut)}` : ''}</span>` : ''}
    ${a.late ? ` · <span class="dl dl-late">${a.late} gecikmiş</span>` : ''}
    <span class="faint"> · ${fmtWhen(d.fetched_at)} güncellendi</span>`;
  const open = new Set($$('#pick-list details.pick-item[open]').map((x) => x.dataset.k));
  $('#pick-list').innerHTML = pickListHTML();
  if (open.size) $$('#pick-list details.pick-item').forEach((x) => { if (open.has(x.dataset.k)) x.open = true; });
}
// Hazırla satırı durumu: hazır (yeşil) · eksik baskıda karşılanıyor (sarı) · eksik (kırmızı) · eşleşmedi
function pickState(i) {
  if (i.product_id == null) return 'unm';
  if (!(i.shortage > 0)) return 'ok';
  const ip = inPrintInfo(i.p);
  return ip && !ip.partsOnly && ip.qty >= i.shortage ? 'run' : 'bad';
}
// Sipariş adedine göre: raftan karşılanan · baskıda olan · eksik kalan
function pickBar(i) {
  const q = Math.max(1, i.quantity), shelf = Math.min(i.on_shelf ?? 0, q);
  const ip = inPrintInfo(i.p), prn = ip && !ip.partsOnly ? Math.min(ip.qty, q - shelf) : 0;
  const miss = Math.max(0, q - shelf - prn), extra = Math.max(0, (i.on_shelf ?? 0) - i.quantity);
  const seg = (n, c) => n > 0 ? `<i class="${c}" style="flex:${n}"></i>` : '';
  return `<span class="pick-bar" title="Rafta ${shelf} · baskıda ${prn} · eksik ${miss}"><span class="pb-track2">${seg(shelf, 'sh')}${seg(prn, 'pr')}${seg(miss, 'ms')}</span>
    <span class="pb-leg">${shelf ? `<span class="lg lg-sh">${shelf} raftan</span>` : ''}${prn ? `<span class="lg lg-pr">${prn} baskıda</span>` : ''}${miss ? `<span class="lg lg-ms">${miss} eksik</span>` : ''}${extra ? `<span class="lg lg-x faint">+${extra} fazla rafta</span>` : ''}</span></span>`;
}
function pickListHTML() {
  const d = S.pick;
  if (!d.items.length) return `<div class="empty panel"><h3>Hazırlanacak sipariş yok</h3><p>Trendyol'da Yeni durumunda sipariş görünmüyor. Panelde Yeni siparişiniz varsa Tanılama'yı çalıştırın.</p><button class="btn" data-act="ty-diag">Tanılama</button></div>${packedTodayHTML()}`;
  const a = analyzePick(d);
  const unmatched = a.items.filter((i) => i.product_id == null).length;
  const banner = unmatched ? `<div class="notice">${icon('barcode')}<div><b>${unmatched} ürün</b> hiçbir ürününüzle eşleşmedi. Satırı açıp hangi ürününüz olduğunu seçin; Trendyol barkodu o ürüne kaydedilir ve bundan sonra hep tanınır.</div></div>` : '';
  let items = a.items;
  if (S.pickFilter === 'short') items = items.filter((i) => i.shortage > 0 || i.product_id == null);
  if (S.pickFilter === 'today') items = items.filter((i) => i.todayQty > 0);
  if ((S.pickSort || 'urgent') === 'urgent') items = [...items].sort((x, y) => URG_RANK[x.worst] - URG_RANK[y.worst] || (x.earliest || 9e12) - (y.earliest || 9e12));
  if (!items.length) return `${banner}<div class="empty"><h3>${S.pickFilter === 'today' ? 'Bugün çıkması gereken sipariş yok' : 'Hepsi rafta var'}</h3><p>${S.pickFilter === 'today' ? 'Bugünün kargosuna yetişmesi gereken Yeni sipariş kalmadı.' : 'Yeni siparişlerdeki tüm ürünler için raftaki stok yeterli.'}</p></div>`;
  return `${trackingNotice()}${banner}<div class="pick-grid fitbox" style="${banner || trackingNotice() ? 'margin-top:12px' : ''}">${items.map((i, n) => {
    const status = i.product_id == null ? `<span class="tag tag-warn">Eşleşmedi</span>`
      : i.shortage > 0 ? `<span class="tag tag-bad">${i.shortage} eksik</span>` : `<span class="tag tag-ok">Rafta var</span>`;
    const urgTag = URG_TEXT[i.worst] ? `<span class="tag urg urg-${i.worst}">${URG_TEXT[i.worst]}</span>` : '';
    const firstNeed = i.orders.find((o) => o.dl === i.earliest)?.need || 0;
    const st = pickState(i);
    return `<details data-k="${esc(i.product_id ?? i.barcode ?? n)}" class="pick-item st-${st} urg-row-${i.worst}${i.shortage > 0 ? ' short' : ''}${i.product_id == null ? ' unmatched' : ''}" ${i.product_id == null && n < 3 ? 'open' : ''}>
      <summary>
        ${miniThumb(i.thumbnail)}
        <div class="pick-name"><b>${i.product_id ? `<a class="pd-link" href="#/urun?id=${i.product_id}" title="Ürün sayfası">${esc(i.name || 'Ürün')}</a>` : esc(i.name || 'Bilinmeyen ürün')}</b>
          <span class="tags">${status}${i.shortage > 0 ? inPrintBadge(i.p, i.shortage) : ''}${urgTag}<span class="tag tag-mute">${i.order_count} sipariş</span>${i.earliest ? `<span class="s">ilk son teslim ${fmtDl(i.earliest)}</span> ${dlChip(i.earliest, firstNeed)}` : ''}</span>
          ${i.product_id ? pickBar(i) : ''}
          ${i.product_id ? `<span class="pick-quick">
            ${i.shortage > 0 ? `<button class="btn btn-sm ${st === 'run' ? 'btn-ghost' : 'btn-primary'}" data-act="print-product" data-id="${i.product_id}">${icon('layers')}${i.shortage} adet bas</button>` : ''}
            <span class="pq-step" title="Raftaki stoğu düzelt"><button class="btn btn-sm btn-ghost" data-act="pick-stock" data-id="${i.product_id}" data-d="-1" aria-label="Stok bir azalt">−</button><span>stok</span><button class="btn btn-sm btn-ghost" data-act="pick-stock" data-id="${i.product_id}" data-d="1" aria-label="Stok bir artır">+</button></span>
            <a class="btn btn-sm btn-ghost" href="#/urun?id=${i.product_id}">Ürün sayfası</a></span>` : ''}</div>
        <div class="pick-nums">
          <div class="pk-n"><b>${i.quantity}</b><span>sipariş</span>${i.todayQty && i.todayQty !== i.quantity ? `<span class="pick-today">${i.todayQty} bugün</span>` : ''}</div>
          ${i.product_id ? `<div class="pk-n shelf"><b>${i.on_shelf ?? 0}</b><span>rafta</span></div>
          <div class="pk-n ${st === 'run' ? 'inp' : i.shortage > 0 ? 'miss' : 'okk'}" title="${st === 'run' ? 'Eksik adet baskıda karşılanıyor' : ''}"><b>${i.shortage > 0 ? i.shortage : '✓'}</b><span>${st === 'run' ? 'eksik<i class="hide-sm"> · baskıda</i>' : i.shortage > 0 ? 'eksik' : 'tamam'}</span></div>` : ''}
        </div>
      </summary>
      <div class="pick-orders">
        ${i.orders.map((o) => `<div class="po urg-row-${o.urg}"><span>Sipariş ${esc(o.order_number)}${o.missing && i.product_id ? ` <span class="tag tag-bad">${o.missing} rafta yok</span>` : ''}</span>
          <span class="faint">${o.dl ? `son ${fmtDl(o.dl)}` : fmtWhen(Math.floor(o.order_date / 1000))}</span>${dlChip(o.dl, o.need)}<b>×${o.quantity}</b></div>`).join('')}
        ${i.orders.some((o) => o.urg === 'nofit') ? `<p class="nofit-note">${icon('clock')} Eksik adetleri basmak yaklaşık ${fmtDur(Math.round(Math.max(...i.orders.map((o) => o.need)) / 60))} sürer; son teslime yetişmiyor.</p>` : ''}
        ${i.product_id ? '' : `<div class="pick-actions">${i.barcode ? `<div class="pick-match"><span class="muted">Bu, hangi ürününüz?</span>
              <select class="input" data-pick-match="${esc(i.barcode)}"><option value="">Ürün seçin…</option>${S.products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
              <button class="btn btn-sm btn-ok" data-act="pick-match" data-code="${esc(i.barcode)}">Eşleştir</button></div>`
          : `<span class="muted">Bu satırda barkod yok; Trendyol'da ürüne barkod tanımlayın.</span>`}</div>`}
      </div></details>`;
  }).join('')}</div>${packedTodayHTML()}`;
}
function packedTodayHTML() {
  const d = S.pick || {}, p = d.packed_today || [];
  if (!p.length) return '';
  return `<details class="ty-sec packed-sec" open><summary>Bugün paketlenenler <span class="n ok">${d.packed_orders_today} sipariş · ${d.packed_units_today} adet</span></summary>
    <ul class="lst">${p.map((x) => {
      const notDed = x.quantity - (x.deducted || 0);
      const tag = !notDed ? '<span class="tag tag-ok">Paketlendi · stoktan düştü</span>'
        : x.unmatched ? '<span class="tag tag-warn">Eşleşmedi, stoktan düşülmedi</span>'
        : `<span class="tag tag-mute">${notDed} adet takip başlangıcından önce</span>`;
      const match = x.unmatched && x.barcode ? `<div class="pick-match" style="margin-top:6px"><select class="input" data-pick-match="${esc(x.barcode)}"><option value="">Hangi ürününüz?</option>${S.products.map((q) => `<option value="${q.id}">${esc(q.name)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ok" data-act="pick-match" data-code="${esc(x.barcode)}">Eşleştir ve düş</button></div>` : '';
      return `<li>${miniThumb(x.thumbnail)}<div class="grow"><div class="t">${esc(x.name || 'Ürün')}</div>
        <div class="s">${x.order_count} sipariş · son ${fmtWhen(x.last_at)}</div>${match}</div>${tag}<span class="ty-qty">${x.quantity}</span></li>`;
    }).join('')}</ul></details>`;
}
function trackingNotice() {
  const d = S.pick;
  if (!d || d.tracking_enabled) return '';
  return `<div class="notice">${icon('bell')}<div style="flex:1">Otomatik takip kapalı: paketlediğiniz siparişler sadece <b>Yenile</b>'ye bastığınızda stoktan düşer.</div><a class="btn btn-sm btn-primary" href="#/satis">Takibi aç</a></div>`;
}

// ---------- panoda Trendyol özeti
function tyDashHTML() {
  if (!S.settings?.ty_seller_id) return '';
  return `<section class="panel ty-dash"><div class="panel-h"><h2>Trendyol siparişleri</h2>
      <div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" data-act="pick-refresh" id="pick-refresh" aria-label="Yenile">${icon('refresh')}</button><a class="btn btn-ghost btn-sm" href="#/hazirla">Hazırla sayfası</a></div></div>
    <div class="panel-b" id="ty-dash-body">${S.pick ? tyDashBody() : '<div class="pick-item skel" style="height:64px"></div>'}</div></section>`;
}
function fillTyDash() { const el = $('#ty-dash-body'); if (el && S.pick) el.innerHTML = tyDashBody(); }
function tyDashBody() {
  const d = S.pick, a = analyzePick(d), cut = todayCutoffS();
  if (!d.items.length) return `<p class="muted" style="margin:0">Trendyol'da Yeni durumunda sipariş yok.${d.packed_orders_today ? ` Bugün ${d.packed_orders_today} sipariş (${d.packed_units_today} adet) paketlendi.` : ''}</p>`;
  // Basılması gerekenler: Yeni siparişlerde rafta yetmeyen ürünler (baskıda olanlar düşülür), en acilden
  const need = a.items.filter((i) => i.shortage > 0 || i.product_id == null).map((i) => {
    const inPrint = Math.min(i.shortage || 0, i.p?.in_production || 0);
    return { ...i, inPrint, toPrint: Math.max(0, (i.shortage || 0) - inPrint) };
  }).sort((x, y) => (y.toPrint > 0) - (x.toPrint > 0) || URG_RANK[x.worst] - URG_RANK[y.worst] || (x.earliest || 9e12) - (y.earliest || 9e12));
  const units = need.reduce((s2, i) => s2 + i.toPrint, 0);
  const chip = (cls, b, t) => `<span class="tys ${cls}"><b>${b}</b> ${t}</span>`;
  return `<div class="ty-line">
      ${chip('', d.order_count, `yeni sipariş · ${d.unit_count} adet`)}
      ${chip(a.today ? 'hot' : '', a.today, 'bugün çıkmalı')}${cut && cut > nowS() && a.today ? `<span class="tys">kargoya ${dlChip(cut)}</span>` : ''}
      ${a.late ? chip('bad', a.late, 'gecikmiş') : ''}
      ${chip('good', d.packed_orders_today || 0, 'bugün paketlendi')}
    </div>
    ${need.length ? `<div class="need-h"><b>Basılması gerekenler</b><span class="muted">${need.length} ürün${units ? ` · ${units} adet basılacak` : ''}</span></div>
      <ul class="need-list">${need.map((i) => {
        const firstNeed = i.orders.find((o) => o.dl === i.earliest)?.need || 0;
        return `<li class="urg-row-${i.worst}">${miniThumb(i.thumbnail)}
          <span class="nm"><b>${esc(i.name || 'Bilinmeyen ürün')}</b><small class="muted">${i.product_id == null ? 'eşleşmedi' : `${i.quantity} sipariş adedi · rafta ${i.on_shelf}`}</small></span>
          <span class="nd">${i.product_id == null ? `<span class="tag tag-warn">${i.quantity} adet</span>` : i.toPrint ? `<span class="tag tag-bad">${i.toPrint} eksik</span>` : ''}${i.inPrint ? `<span class="tag">${i.inPrint} baskıda</span>` : ''}</span>
          <span class="dlc">${dlChip(i.earliest, firstNeed)}</span>
          ${i.product_id ? (i.toPrint ? `<button class="btn btn-sm btn-primary" data-act="print-product" data-id="${i.product_id}">Bas</button>` : '<span></span>') : '<a class="btn btn-sm" href="#/hazirla">Eşleştir</a>'}</li>`;
      }).join('')}</ul>`
    : '<p class="need-ok">Yeni siparişlerdeki tüm ürünler rafta var; basılması gereken yok.</p>'}`;
}

PAGES.satis = {
  async load() {
    const [, , unmatched, recent] = await Promise.all([loadProducts(), loadSettings(), api('GET', '/api/trendyol/lines?state=unmatched'), api('GET', '/api/trendyol/lines')]);
    S.tyUnmatched = unmatched; S.tyRecent = recent.filter((l) => l.state !== 'unmatched').slice(0, 30);
    loadDash().then(renderNav).catch(() => {});
  },
  html() {
    const st = S.settings;
    const productOpts = `<option value="">Ürün seçin…</option>` + S.products.map((p) => `<option value="${p.id}">${esc(p.name)} (stok ${p.stock})</option>`).join('');
    const res = st.ty_last_result;
    const status = !st.ty_enabled ? `<span class="dot"></span><span>Otomatik takip kapalı.</span>`
      : st.ty_last_error ? `<span class="dot bad"></span><span>${esc(st.ty_last_error)}</span>`
      : st.ty_last_sync ? `<span class="dot ok"></span><span>Son kontrol ${fmtWhen(st.ty_last_sync)}${res ? ` · ${res.deducted} adet düşüldü${res.restocked ? `, ${res.restocked} iade` : ''}` : ''} · ${st.ty_interval_min} dakikada bir kontrol ediliyor</span>`
      : `<span class="dot ok"></span><span>Açık, ilk kontrol birkaç saniye içinde.</span>`;
    const STATE = { deducted: ['Paketlendi · stoktan düştü', 'ok'], pending: ['Yeni · paketlenmeyi bekliyor', 'mute'], restocked: ['İptal, geri eklendi', 'warn'], cancelled: ['İptal', 'mute'], ignored: ['Takip öncesi', 'mute'] };
    return `<div class="section-gap">
      <div class="scan">${icon('barcode')}
        <input class="input" id="scan" placeholder="Barkodu okutun veya yazıp Enter'a basın" autocomplete="off" enterkeyhint="done">
        <div style="display:flex;gap:8px;align-items:center"><span class="muted" style="font-size:13px">Adet</span>
          <div class="stepper"><button type="button" data-act="scan-qty" data-d="-1" aria-label="Azalt">${icon('minus')}</button><input id="scan-qty" type="number" min="1" value="1"><button type="button" data-act="scan-qty" data-d="1" aria-label="Arttır">${icon('plus')}</button></div></div>
      </div>

      <section class="panel"><div class="panel-h"><h2>Elle satış düş</h2></div>
        <div class="panel-b"><div class="row manual-row">
          <label class="field"><span>Ürün</span><select class="input" id="ms-p">${productOpts}</select></label>
          <label class="field"><span>Adet</span><input class="input" id="ms-q" type="number" min="1" value="1"></label>
          <label class="field"><span>Sipariş no (isteğe bağlı)</span><input class="input" id="ms-ref" placeholder="Trendyol, Hepsiburada, elden…"></label>
          <button class="btn btn-primary" data-act="manual-sale" style="height:42px">Stoktan düş</button>
        </div></div></section>

      <section class="panel"><div class="panel-h"><h2>Trendyol</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" data-act="ty-sync" ${st.ty_seller_id ? '' : 'disabled'}>${icon('refresh')} Şimdi kontrol et</button></div></div>
        <div class="panel-b" style="display:grid;gap:16px">
          <div class="ty-status">${status}</div>
          <div class="notice" style="background:var(--sheet-2)">${icon('cart')}<div>Yeni siparişler stoğa dokunmaz. Siparişi paketleyip Trendyol'da <b>Hazırlanıyor</b>'a çektiğinizde stok düşer ve sipariş <b>Paketlendi</b> olarak görünür. Kontrol ${st.ty_interval_min} dakikada bir yapılır; Hazırla sayfasındaki <b>Yenile</b> hemen kontrol eder.</div></div>
          ${S.tyUnmatched.length ? `<div><p style="margin:0 0 10px;font-weight:600">Eşleşmeyen sipariş satırları (${S.tyUnmatched.length})</p>
            <p class="muted" style="margin:0 0 10px;font-size:14px">Bu satırların barkodu hiçbir ürününüzde yok. Ürünü seçin; barkod o ürüne kaydedilir. Sipariş paketlenmişse stok hemen düşer, Yeni ise paketlenince düşer.</p>
            <div class="unmatched">${S.tyUnmatched.map((l) => `<div class="um"><div><div class="t">${esc(l.product_name || '')} <span class="muted">×${l.quantity}</span></div>
              <div class="s">Sipariş ${esc(l.order_number)} · barkod ${esc(l.barcode || '—')}${l.merchant_sku ? ' · ' + esc(l.merchant_sku) : ''} · ${fmtWhen(Math.floor(l.order_date / 1000))}</div></div>
              <select class="input" data-um="${esc(l.line_key)}">${productOpts}</select>
              <button class="btn btn-ok btn-sm" data-act="ty-match" data-k="${esc(l.line_key)}">Eşleştir</button>
              <button class="btn btn-ghost btn-sm" data-act="ty-ignore" data-k="${esc(l.line_key)}">Yoksay</button></div>`).join('')}</div></div>` : ''}
          ${S.tyRecent.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Sipariş</th><th>Ürün</th><th class="num">Adet</th><th>Durum</th><th>Tarih</th></tr></thead><tbody>
            ${S.tyRecent.map((l) => `<tr><td>${esc(l.order_number)}</td><td>${esc(l.matched_name || l.product_name || '')}</td><td class="num">${l.quantity}</td>
              <td><span class="tag tag-${STATE[l.state]?.[1] || 'mute'}">${STATE[l.state]?.[0] || l.state}</span></td><td class="muted">${fmtWhen(Math.floor(l.order_date / 1000))}</td></tr>`).join('')}
          </tbody></table></div>` : st.ty_enabled ? `<p class="muted" style="margin:0">Açıldıktan sonra gelen siparişler burada görünecek.</p>` : ''}
        </div></section>

      <details class="panel" ${st.ty_seller_id ? '' : 'open'}>
        <summary class="panel-h" style="padding-bottom:16px"><h2>Trendyol bağlantı ayarları</h2><svg class="chev"><use href="#i-plus"/></svg></summary>
        <div class="panel-b" style="display:grid;gap:14px;padding-top:0">
          <ol class="steps"><li>Trendyol Satıcı Paneli → sağ üstte hesap adı → <b>Hesap Bilgilerim</b> → <b>Entegrasyon Bilgileri</b>.</li>
            <li>Satıcı ID, API Key ve API Secret değerlerini aşağıya yapıştırın.</li>
            <li>Ürün kartlarına Trendyol'daki barkodu yazın. Takip açıldığı andan <b>sonra</b> gelen siparişler düşülür; eski siparişlere dokunulmaz.</li></ol>
          <div class="row">
            <label class="field"><span>Satıcı ID</span><input class="input" id="ty-sid" value="${esc(st.ty_seller_id)}" inputmode="numeric" autocomplete="off"></label>
            <label class="field"><span>API Key</span><input class="input" id="ty-key" value="${esc(st.ty_api_key)}" autocomplete="off"></label>
            <label class="field"><span>API Secret</span><input class="input" id="ty-sec" type="password" placeholder="${st.ty_api_secret_set ? 'Kayıtlı — değiştirmek için yazın' : ''}" autocomplete="new-password"></label>
          </div>
          <label class="field" style="max-width:340px"><span>Takip başlangıcı</span>
            <input class="input" type="datetime-local" id="ty-since" value="${st.ty_since ? new Date(st.ty_since - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}">
            <small>Bu andan sonra Hazırlanıyor'a çekilen siparişler stoktan düşer. Son stok sayımınızı yaptığınız ana ayarlayın; geriye alırsanız o aralıkta paketlenenler bir sonraki kontrolde düşülür.</small></label>
          <div class="row" style="align-items:center">
            <label class="field"><span>Kontrol aralığı</span><div class="input-group"><input class="input" id="ty-int" type="number" min="2" value="${st.ty_interval_min}"><span class="suffix">dakika</span></div></label>
            <label class="switch"><input type="checkbox" id="ty-restock" ${st.ty_restock_cancel ? 'checked' : ''}> İptal edilen siparişleri stoğa geri ekle</label>
            <label class="switch"><input type="checkbox" id="ty-en" ${st.ty_enabled ? 'checked' : ''}> Otomatik takip açık</label>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" data-act="ty-save">Kaydet</button><button class="btn" data-act="ty-test">Bağlantıyı dene</button><button class="btn" data-act="ty-diag">Tanılama</button></div>
        </div>
      </details>
    </div>`;
  },
  after() {
    const sc = $('#scan');
    sc.focus();
    sc.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const code = sc.value.trim(); if (!code) return;
      sc.value = '';
      try {
        const r = await api('POST', '/api/scan', { code, quantity: parseInt($('#scan-qty').value) || 1 });
        toast(`${r.name}: stok ${r.stock}`); beepShort();
        const p = productById(r.product_id); if (p) p.stock = r.stock;
      } catch (err) { fail(err); }
    });
  },
};
function beepShort() { try { audioCtx = audioCtx || new AudioContext(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 1320; g.gain.value = 0.08; o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.08); } catch { /* */ } }

// ---------- Trendyol: takipten önce gelmiş, kargolanmamış siparişleri aktar
let TYO = null;
async function openTyImport() {
  openModal(`<div class="modal-h"><h2>Açık Trendyol siparişleri</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b" id="tyo-body"><p class="muted" style="margin:0">Son 14 günün Yeni durumundaki siparişleri getiriliyor…</p></div>
    <div class="modal-f"><div class="right"><button class="btn" data-act="close">Vazgeç</button><button class="btn btn-primary" data-act="ty-open-import" id="tyo-go" disabled>Seçilenleri stoktan düş</button></div></div>`, 'wide');
  try {
    const r = await api('POST', '/api/trendyol/open-preview');
    TYO = r.lines;
    if (!$('#tyo-body')) return;
    if (!TYO.length) { $('#tyo-body').innerHTML = `<div class="empty" style="padding:24px"><h3>Yeni durumunda sipariş bulunamadı</h3><p>Trendyol panelinde Yeni siparişleriniz görünüyorsa Tanılama'yı çalıştırıp çıktısını gönderin.</p><button class="btn" data-act="ty-diag">Tanılama</button></div>`; return; }
    const STATUS = { Created: 'Yeni' };
    $('#tyo-body').innerHTML = `
      <p class="muted" style="margin:0;font-size:14px">Bunlar Trendyol'da Yeni durumunda: satıldı ama henüz paketlenmedi, ürün hâlâ rafınızda. İşaretli olanlar stoktan düşülür. Elle zaten düştüklerinizin işaretini kaldırın. Eşleşmeyenler, ürün seçebilmeniz için eşleşmeyenler listesine eklenir.</p>
      <label class="switch" style="font-size:14px"><input type="checkbox" id="tyo-all" checked> Tümünü seç</label>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Sipariş</th><th>Trendyol ürünü</th><th>Eşleşen ürün</th><th class="num">Adet</th><th>Durum</th></tr></thead><tbody>
      ${TYO.map((l) => `<tr class="${l.known_state && l.known_state !== 'ignored' ? 'faint' : ''}">
        <td><input type="checkbox" class="tyo-cb" data-k="${esc(l.line_key)}" ${l.known_state === 'ignored' ? '' : l.known_state ? 'disabled' : 'checked'}></td>
        <td>${esc(l.order_number)}<br><span class="faint" style="font-size:12px">${fmtWhen(Math.floor(l.order_date / 1000))}</span></td>
        <td>${esc(l.product_name || '')}<br><span class="faint" style="font-size:12px">${esc(l.barcode || '')}</span></td>
        <td>${l.known_state === 'ignored' ? `<span class="tag tag-mute">Daha önce atlandı</span> ${esc(l.matched_name || '')}` : l.known_state ? '<span class="tag tag-mute">Zaten işlendi</span>' : l.matched_name ? esc(l.matched_name) : '<span class="tag tag-warn">Eşleşmedi</span>'}</td>
        <td class="num">${l.quantity}</td><td>${STATUS[l.ty_status] || esc(l.ty_status)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const upd = () => {
      const sel = TYO.filter((l) => (!l.known_state || l.known_state === 'ignored') && $(`.tyo-cb[data-k="${CSS.escape(l.line_key)}"]`).checked);
      const qty = sel.filter((l) => l.product_id).reduce((a, l) => a + l.quantity, 0);
      $('#tyo-go').disabled = !TYO.some((l) => !l.known_state || l.known_state === 'ignored');
      $('#tyo-go').textContent = $('#tyo-go').disabled ? 'Aktarılacak sipariş kalmadı' : qty ? `${qty} adedi stoktan düş` : 'Kaydet';
    };
    $('#tyo-all').onchange = (e) => { $$('.tyo-cb:not(:disabled)').forEach((c) => { c.checked = e.target.checked; }); upd(); };
    $$('.tyo-cb').forEach((c) => c.addEventListener('change', upd));
    upd();
  } catch (e) { if ($('#tyo-body')) $('#tyo-body').innerHTML = `<div class="notice">${icon('bell')}<div>${esc(e.message)}</div></div>`; }
}
async function tyImport() {
  const keys = $$('.tyo-cb:checked:not(:disabled)').map((c) => c.dataset.k);
  $('#tyo-go').disabled = true;
  try {
    const r = await api('POST', '/api/trendyol/open-import', { line_keys: keys });
    closeModal();
    toast(`${r.deducted} adet stoktan düşüldü${r.unmatched ? ` · ${r.unmatched} satır eşleştirme bekliyor` : ''}`);
    if (route() === 'hazirla') { await loadProducts(); await loadPick(true); } else render();
  } catch (e) { fail(e); $('#tyo-go').disabled = false; }
}

// ---------- Trendyol tanılama: anahtar ve müşteri bilgisi içermeyen özet
async function openTyDiag() {
  openModal(`<div class="modal-h"><h2>Trendyol tanılama</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b" id="diag-body"><p class="muted" style="margin:0">Trendyol'a durum durum soruluyor, birkaç saniye sürer…</p></div>
    <div class="modal-f"><div class="right"><button class="btn" data-act="close">Kapat</button><button class="btn btn-primary" data-act="diag-copy" id="diag-copy" disabled>Çıktıyı kopyala</button></div></div>`, 'wide');
  try {
    const r = await api('POST', '/api/trendyol/diagnose');
    S.diagText = JSON.stringify(r, null, 2);
    if (!$('#diag-body')) return;
    const created = r.by_status.Created;
    $('#diag-body').innerHTML = `
      <p style="margin:0">Son 14 günde Trendyol'un döndürdüğü paket sayıları:</p>
      <div class="tbl-wrap"><table class="tbl"><tbody>${Object.entries(r.by_status).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num"><b>${esc(v)}</b></td></tr>`).join('')}</tbody></table></div>
      ${typeof created === 'number' && created > 0 ? `<div class="notice" style="background:var(--ok-wash)">${icon('check')}<div>Trendyol ${created} Yeni paket döndürüyor. Hazırla sayfası ve aktarım artık bunları görmeli.</div></div>` : ''}
      <p class="muted" style="margin:0;font-size:13.5px">Bu çıktıda API anahtarı veya müşteri adı/adresi yoktur. "Çıktıyı kopyala" ile kopyalayıp sohbete yapıştırabilirsiniz.</p>
      <pre class="diag-pre">${esc(S.diagText)}</pre>`;
    $('#diag-copy').disabled = false;
  } catch (e) { if ($('#diag-body')) $('#diag-body').innerHTML = `<div class="notice">${icon('bell')}<div>${esc(e.message)}</div></div>`; }
}

// ================================================================== SETTINGS
// ---------- Ayarlar → Yedekleme: günlük otomatik yedek, ek klasör, geri yükleme
const fmtSize = (b) => b >= 1048576 ? `${(b / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
function backupHTML() {
  const d = S.backups;
  const head = `<div class="panel-h"><h2>Yedekleme</h2><span class="muted" style="font-size:13px">her gün otomatik</span></div>`;
  if (!d) return `${head}<div class="panel-b"><p class="muted" style="margin:0">Yedek bilgisi alınamadı.</p><div><a class="btn" href="/api/backup" download>Veritabanı yedeğini indir</a></div></div>`;
  const la = d.last_auto, last = d.last;
  const today = la && new Date(la.at * 1000).toDateString() === new Date().toDateString();
  return `${head}<div class="panel-b bk">
    <div class="bk-state ${today ? 'ok' : la ? 'warn' : ''}">${icon(today ? 'check' : 'clock')}<div><b>${la ? `Son otomatik yedek: ${fmtWhen(la.at)}` : 'Henüz otomatik yedek yok'}</b>
      <span class="muted">Sunucu açıkken her gün bir kez <b>data/yedek</b> klasörüne alınır; son ${d.keep} gün saklanır.${la ? '' : ' İlki açılıştan birkaç dakika sonra alınır.'}</span></div></div>
    ${last?.extra_error ? `<div class="notice">${icon('alert')}<div>${esc(last.extra_error)}</div></div>` : ''}
    <label class="field"><span>Ek yedek klasörü <span class="faint">(isteğe bağlı)</span></span>
      <div class="bk-dir"><input class="input" id="bk-dir" placeholder="ör. C:\\Users\\Ad\\OneDrive\\Astera yedek" value="${esc(d.dir || '')}" autocomplete="off" spellcheck="false"><button class="btn" data-act="bk-dir">Kaydet</button></div>
      <small>Yedek buraya da kopyalanır; görseller de <b>uploads</b> alt klasörüne aktarılır. OneDrive / Google Drive klasörü seçerseniz bilgisayar bozulsa da veriler kaybolmaz.</small></label>
    <div class="bk-btns"><button class="btn btn-primary" data-act="bk-make">${icon('upload')} Şimdi yedek al</button><a class="btn" href="/api/backup" download>Veritabanını indir</a></div>
    ${d.files.length ? `<details class="bk-list"><summary>Yedekler <span class="faint">${d.files.length}</span></summary><ul class="lst">
      ${d.files.map((f) => `<li><div class="grow"><div class="t">${fmtWhen(f.at)} <span class="tag ${f.kind === 'oto' ? 'tag-mute' : f.kind === 'once' ? 'tag-warn' : 'tag-ok'}">${esc(f.kind_text)}</span></div><div class="s">${esc(f.name)} · ${fmtSize(f.size)}</div></div>
        <a class="btn btn-sm btn-ghost" href="/api/backups/file?name=${encodeURIComponent(f.name)}" download>İndir</a>
        <button class="btn btn-sm btn-bad" data-act="bk-restore" data-name="${esc(f.name)}" data-at="${f.at}">Geri yükle</button></li>`).join('')}
    </ul></details>` : ''}
  </div>`;
}
const backupRefresh = () => { const el = $('#backup-sec'); if (el) el.innerHTML = backupHTML(); };
// ---------- Ayarlar → Haftalık özet
const WEEK_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
function weeklySetHTML() {
  const v = S.settings?.weekly_at || '1 09:00', off = v === 'off';
  const [d, hm] = off ? ['1', '09:00'] : v.split(' ');
  const w = S.weekly;
  return `<section class="panel"><div class="panel-h"><h2>Haftalık özet</h2><span class="muted" style="font-size:13px">panel ve telefon bildirimi</span></div><div class="panel-b wk-set">
    <label class="switch"><input type="checkbox" id="wk-on" ${off ? '' : 'checked'}><span>Her hafta önceki haftanın özetini gönder</span></label>
    <div class="wk-when${off ? ' dim' : ''}"><select class="input" id="wk-day" ${off ? 'disabled' : ''}>${WEEK_DAYS.map((n, i) => `<option value="${i + 1}"${String(i + 1) === d ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <input class="input" id="wk-time" type="time" value="${esc(hm)}" ${off ? 'disabled' : ''}><button class="btn" data-act="wk-save">Kaydet</button></div>
    <small class="muted">Satış, Trendyol ciro ve yaklaşık kâr, basılan adet ve fire, harcanan filament, buybox ve ölü stok. Bilgisayar o saatte kapalıysa açılınca gönderilir. Telefonda tutarlar da görünür.</small>
    ${w?.text ? `<div class="wk-prev"><b>${esc(w.title)}</b><span>${esc(w.text)}</span></div>` : ''}
  </div></section>`;
}
// ---------- Ayarlar → Etiket yazıcısı (Trendyol ortak etiketi, ZPL)
function labelSetHTML() {
  const c = S.labelCfg; if (!c) return '';
  const m = c.mode;
  return `<section class="panel"><div class="panel-h"><h2>Kargo etiketi yazıcısı</h2><span class="muted" style="font-size:13px">Trendyol Express ve Aras</span></div><div class="panel-b lp-set">
    <div class="seg" id="lp-mode">${[['browser', 'Bu bilgisayardan (yazdır penceresi)'], ['share', 'Paylaşılan yazıcı'], ['net', 'Ağ (IP)']].map(([v, l]) => `<button type="button" data-v="${v}" class="${m === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="lp-f" data-m="browser"${m === 'browser' ? '' : ' hidden'}><small class="muted">Etiket (100×80 mm) Astera'da hazırlanır ve bu bilgisayarın yazdırma penceresi açılır; etiket yazıcısını bir kez seçin, tarayıcı sonraki seferlerde hatırlar. Yazıcı sürücüsünde kâğıt boyutu 100×80 mm, kenar boşluğu "Yok" olmalı. Hangi bilgisayardan basarsanız o bilgisayarın yazıcısı kullanılır.</small></div>
    <p class="muted lp-f" data-m="share net"${m === 'share' || m === 'net' ? '' : ' hidden'} style="margin:0">Bu iki seçenek Trendyol'un hazır etiketini (ZPL) yazıcıya doğrudan gönderir; Trendyol'dan "ortak etiket" yetkisi gerekir.</p>
    <div class="lp-f" data-m="share"${m === 'share' ? '' : ' hidden'}>
      <div class="row">
        <label class="field"><span>Bilgisayar ${c.windows ? '<span class="faint">(boş = bu bilgisayar)</span>' : '<span class="faint">(yazıcının takılı olduğu)</span>'}</span><input class="input" id="lp-host" value="${esc(c.host || '')}" placeholder="ör. DIGERPC ya da 192.168.1.20" autocomplete="off" spellcheck="false"></label>
        <label class="field"><span>Yazıcının paylaşım adı</span><input class="input" id="lp-share" value="${esc(c.share)}" placeholder="ör. ZEBRA" autocomplete="off" spellcheck="false"></label>
      </div>
      ${c.windows ? '' : `<div class="row">
        <label class="field"><span>Kullanıcı adı <span class="faint">(paylaşım şifresizse boş)</span></span><input class="input" id="lp-user" value="${esc(c.smb_user || '')}" placeholder="o bilgisayarın kullanıcısı" autocomplete="off" spellcheck="false"></label>
        <label class="field"><span>Şifre</span><input class="input" id="lp-pass" type="password" value="" placeholder="${c.has_pass ? '•••••• (kayıtlı, değiştirmek için yazın)' : 'şifre'}" autocomplete="new-password"></label>
      </div>`}
      <p class="lp-path muted">Gönderilecek adres: <span class="mono" id="lp-path">\\\\${esc(c.host || 'localhost')}\\${esc(c.share || '…')}</span></p>
      <small class="muted">Yazıcının takılı olduğu bilgisayarda: Ayarlar → Bluetooth ve cihazlar → Yazıcılar → yazıcı → <b>Yazıcı özellikleri</b> → <b>Paylaşım</b> → "Bu yazıcıyı paylaş" ve kısa bir ad verin (boşluksuz, ör. ZEBRA). Sürücüde etiket boyutu 100×100 mm olmalı.
        Yazıcı başka bilgisayardaysa o bilgisayar açık olmalı; şifre isterse bu bilgisayarda Kimlik Bilgileri Yöneticisi → Windows kimlik bilgileri'ne o bilgisayarın adı, kullanıcı adı ve şifresini ekleyin. Bu bilgisayarda yazıcıyı ayrıca kurmak gerekmez.</small></div>
    <div class="lp-f row" data-m="net"${m === 'net' ? '' : ' hidden'}>
      <label class="field"><span>IP adresi</span><input class="input" id="lp-ip" value="${esc(c.ip)}" placeholder="192.168.1.50" inputmode="decimal"></label>
      <label class="field" style="max-width:120px"><span>Port</span><input class="input" id="lp-port" value="${c.port || 9100}" inputmode="numeric"></label></div>
    <label class="switch"><input type="checkbox" id="lp-auto" ${c.auto ? 'checked' : ''}><span>Siparişi Hazırlanıyor'a çekince etiketi kendiliğinden bas</span></label>
    <div class="bk-btns"><button class="btn btn-primary" data-act="lp-save">Kaydet</button><button class="btn" data-act="lp-test">${icon('print')} Deneme etiketi bas</button></div>
  </div></section>`;
}
PAGES.ayarlar = {
  async load() { await loadCategories(); await loadSettings(); if ((S.settings.printers || []).some(hasLink)) await loadBambu(); S.archived = (await api('GET', '/api/products?archived=1')).filter((p) => p.archived); S.backups = await api('GET', '/api/backups').catch(() => null); S.weekly = await api('GET', '/api/weekly').catch(() => null); S.labelCfg = await api('GET', '/api/label/settings').catch(() => null); S.version = await api('GET', '/api/version').catch(() => null); },
  html() {
    const theme = localStorage.getItem('theme') || 'auto';
    const nsup = 'Notification' in window, secure = window.isSecureContext;
    const perm = nsup ? Notification.permission : 'unsupported';
    return `<div class="settings-grid">
      <section class="panel"><div class="panel-h"><h2>Uygulama</h2>${S.version?.version ? `<span class="muted" style="font-size:13px">Sürüm ${esc(S.version.version)} · ${esc(S.version.platform)}</span>` : ''}</div><div class="panel-b">
        <div class="brand-edit">
          <button class="brand-logo-drop${S.settings.app_logo ? ' has' : ''}" id="logo-drop" data-act="logo-pick" style="${S.settings.app_logo ? `--img:url('${esc(S.settings.app_logo)}')` : ''}" aria-label="Logo yükle">
            ${S.settings.app_logo ? '' : `${icon('upload')}<span>Logo</span>`}</button>
          <input type="file" id="logo-in" accept="image/*" hidden>
          <div style="display:grid;gap:10px;flex:1;min-width:220px">
            <div class="row"><label class="field"><span>Uygulama adı</span><input class="input" id="app-name" value="${esc(appName())}" maxlength="40"></label>
              <label class="field"><span>Alt yazı</span><input class="input" id="app-tag" value="${esc(S.settings.app_tagline ?? 'Management')}" maxlength="40" placeholder="Boş bırakılabilir"></label></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-act="brand-save">Kaydet</button>
              ${S.settings.app_logo ? '<button class="btn btn-ghost btn-sm" data-act="logo-rm">Logoyu kaldır</button>' : ''}
              <small class="muted" style="align-self:center">Kare bir logo en iyi görünür. Ctrl+V ile de yapıştırabilirsiniz.</small></div>
          </div>
        </div>
      </div></section>
      <section class="panel"><div class="panel-h"><h2>Bildirimler</h2></div><div class="panel-b" style="display:grid;gap:12px">
        <p class="muted" style="margin:0">Baskı süresi dolduğunda uygulama açık olan her ekranda sonucu sorar ve sesli uyarı verir. Sistem bildirimi için tarayıcı izni gerekir.</p>
        ${!secure ? `<div class="notice">${icon('bell')}<div>Bu cihazda adres <b>http://</b> ile açıldığı için tarayıcı sistem bildirimi göstermiyor. Uygulama açık olduğu sürece ekranda sorar ve ses çalar. Ana bilgisayarda <b>http://localhost:${location.port || 80}</b> adresinden açarsanız Windows bildirimi de gelir.</div></div>`
          : perm === 'granted' ? `<p style="margin:0"><span class="tag tag-ok">İzin verildi</span></p>`
          : perm === 'denied' ? `<div class="notice">${icon('bell')}<div>Bildirim izni reddedilmiş. Adres çubuğundaki kilit simgesinden izin verebilirsiniz.</div></div>`
          : nsup ? `<div><button class="btn btn-primary" data-act="notify-perm">${icon('bell')} Bildirimlere izin ver</button></div>` : ''}
        <div><button class="btn" data-act="notify-test">Deneme uyarısı çal</button></div>
      </div></section>

      <section class="panel"><div class="panel-h"><h2>Kategoriler</h2></div><div class="panel-b" style="display:grid;gap:12px">
        <p class="muted" style="margin:0">Ürün türlerini buradan yönetin. Bir kategoriyi yeniden adlandırırsanız ürünleri de güncellenir; silerseniz ürünleri kategorisiz kalır.</p>
        <div class="cat-list" id="cat-list">${(S.categories || []).map((c, i) => `<div class="cat-row" data-i="${i}" data-old="${esc(c.name)}">
            <input class="input" data-cat-name value="${esc(c.name)}" aria-label="Kategori adı">
            <label class="switch sm"><input type="checkbox" data-cat-nomat ${c.no_materials ? 'checked' : ''}> Filament seçilmez</label>
            <label class="switch sm"><input type="checkbox" data-cat-noparts ${c.no_parts ? 'checked' : ''}> Tek parça</label>
            <span class="faint" style="font-size:12.5px">${c.count || 0} ürün</span>
            <button class="icon-btn" data-act="cat-rm" data-i="${i}" aria-label="Sil">${icon('trash')}</button></div>`).join('')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><div class="input-group" style="max-width:360px;flex:1"><input class="input" id="new-cat" placeholder="Yeni kategori, ör. Kitap sırtı"><button class="btn" data-act="cat-add" style="border-radius:0 8px 8px 0;border-left:0">Ekle</button></div>
          <button class="btn btn-primary" data-act="cat-save">Kategorileri kaydet</button></div>
      </div></section>

      <section class="panel"><div class="panel-h"><h2>Kargo</h2></div><div class="panel-b" style="display:grid;gap:12px">
        <p class="muted" style="margin:0">Trendyol her sipariş için ürüne göre bir kargoya son teslim tarihi veriyor (genelde o günün 23:59'u). Kargonuz daha erken çıkıyorsa saatini girin; son teslim o günün bu saatine çekilir ve geri sayımlar buna göre yapılır.</p>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <label class="field" style="max-width:160px"><span>Kargo çıkış saati</span><input class="input" type="time" id="ship-cutoff" value="${esc(S.settings.ship_cutoff || '')}" ${S.settings.ship_cutoff ? '' : 'disabled'}></label>
          <label class="switch" style="margin-top:20px"><input type="checkbox" id="ship-raw" ${S.settings.ship_cutoff ? '' : 'checked'}> Trendyol'un saatini aynen kullan</label>
        </div>
      </div></section>

      <section class="panel"><div class="panel-h"><h2>Makineler</h2></div><div class="panel-b" style="display:grid;gap:14px">
        <p class="muted" style="margin:0">Baskı başlatırken makineyi tek dokunuşla seçersiniz; aktif baskılarda makinenin görseli görünür. Fotoğraf yüklemezseniz türüne göre bir ikon kullanılır.</p>
        <div class="machines">${(S.settings.printers || []).map((p, i) => `<div class="machine">
            <button class="machine-img" data-act="printer-photo" data-i="${i}" aria-label="${esc(p.name)} fotoğrafını değiştir">${printerThumb(p.name, 'lg')}<span class="machine-edit">${icon('upload')}</span></button>
            <div class="machine-info"><b>${esc(p.name)}</b>
              <select class="input" data-printer-kind="${i}" style="height:34px;font-size:13.5px">${Object.entries(PRINTER_KINDS).map(([k, l]) => `<option value="${k}"${p.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
              ${p.image ? `<button class="btn btn-ghost btn-sm" data-act="printer-photo-rm" data-i="${i}" style="justify-self:start;padding:0 6px">Fotoğrafı kaldır</button>` : ''}</div>
            <button class="icon-btn" data-act="rm-printer" data-i="${i}" aria-label="Kaldır">${icon('trash')}</button>
            ${bambuBlock(p, i)}
          </div>`).join('') || '<span class="faint">Henüz makine yok.</span>'}</div>
        <input type="file" id="printer-photo-in" accept="image/*" hidden>
        <div class="input-group" style="max-width:460px"><input class="input" id="new-printer" placeholder="Örn. Bambu P1S, Saturn 4 Ultra"><button class="btn" data-act="add-printer" style="border-radius:0 8px 8px 0;border-left:0">Ekle</button></div>
      </div></section>

      <section class="panel"><div class="panel-h"><h2>Telefon uygulaması</h2></div><div class="panel-b" style="display:grid;gap:10px">
        <p class="muted" style="margin:0">Stok, baskı ve filament takibi için sade mobil sürüm (fiyat ve kâr bilgisi yok). Telefonda Chrome ile <b>${esc(location.origin)}/m</b> adresini açın; menüden <b>Uygulamayı yükle</b> deyin.</p>
        <p class="muted" style="margin:0">Uygulama kurulumu ve kapalıyken bildirim için Chrome güvenli bağlantı ister. <b>Ev ağında</b>: telefonda <code>chrome://flags</code> → <b>Insecure origins treated as secure</b> → Enabled → kutuya şu adresi yazın: <code id="lan-origin">${esc(lanOrigin())}</code> → Relaunch. <b>Evden uzakta</b> da kullanmak için Tailscale (BENIOKU).</p>
        <p class="muted" style="margin:0">Bildirim açmış telefon sayısı: <b id="push-n">…</b></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-sm" href="/m/" target="_blank" rel="noopener">Mobil sürümü aç</a><button class="btn btn-sm btn-ghost" data-act="push-test">Telefona deneme bildirimi</button></div>
      </div></section>

      <section class="panel"><div class="panel-h"><h2>Tema ve görünüm</h2><span class="muted" style="font-size:13px">bu cihaza kaydedilir</span></div><div class="panel-b theme-box">
        <div class="field"><span>Mod</span><div class="seg" id="theme-seg">${[['auto', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']].map(([v, l]) => `<button data-v="${v}" class="${theme === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="field"><span>Koyu tema tonu</span><div class="swatches" id="tone-pick">${THEME_TONES.map(([v, l, c]) => `<button type="button" class="tone-sw${themeOpt('tone') === v ? ' on' : ''}" data-v="${v}" style="--c1:${c[0]};--c2:${c[1]};--c3:${c[2]}"><i></i><span>${l}</span></button>`).join('')}</div></div>
        <div class="row">
          <div class="field"><span>Yoğunluk</span><div class="seg" id="density-seg">${[['comfy', 'Rahat'], ['compact', 'Sıkı']].map(([v, l]) => `<button data-v="${v}" class="${uiOpt('density', 'comfy') === v ? 'on' : ''}">${l}</button>`).join('')}</div><small>Sıkı: satırlar ve boşluklar daralır, ekrana daha çok şey sığar.</small></div>
          <div class="field"><span>Yazı ve arayüz boyutu</span><div class="seg" id="uisize-seg">${UI_SIZES.map(([v, l]) => `<button data-v="${v}" class="${uiOpt('uisize', '100') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        </div>
        <div class="field"><span>Vurgu rengi</span><div class="swatches" id="accent-pick">${THEME_ACCENTS.map(([v, l, c]) => `<button type="button" class="acc-sw${themeOpt('accent') === v ? ' on' : ''}" data-v="${v}" style="--c:${c}" aria-label="${l}"><i></i><span>${l}</span></button>`).join('')}</div></div>
      </div></section>

      ${labelSetHTML()}
      <section class="panel" id="backup-sec">${backupHTML()}</section>
      ${weeklySetHTML()}

      ${S.archived.length ? `<section class="panel"><div class="panel-h"><h2>Arşivlenen ürünler</h2></div><div class="panel-b"><ul class="lst">
        ${S.archived.map((p) => `<li>${miniThumb(p.thumbnail)}<div class="grow"><div class="t">${esc(p.name)}</div><div class="s">Stok ${p.stock}</div></div><button class="btn btn-sm" data-act="restore-product" data-id="${p.id}">Geri al</button></li>`).join('')}
      </ul></div></section>` : ''}
      ${advancedHTML()}
    </div>`;
  },
  after() {
    api('GET', '/api/push/key').then((r) => { const el = $('#push-n'); if (el) el.textContent = r.subscribers; }).catch(() => {});
    advBind();
    const lpPath = () => { const el = $('#lp-path'); if (el) el.textContent = `\\\\${$('#lp-host').value.trim().replace(/^[\\/]+|[\\/]+$/g, '') || 'localhost'}\\${$('#lp-share').value.trim() || '…'}`; };
    $('#lp-host')?.addEventListener('input', lpPath); $('#lp-share')?.addEventListener('input', lpPath);
    $('#lp-mode')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('#lp-mode button').forEach((x) => x.classList.toggle('on', x === b)); $$('.lp-f').forEach((f) => { f.hidden = !f.dataset.m.split(' ').includes(b.dataset.v); }); });
    $('#wk-on')?.addEventListener('change', (e) => { const on = e.target.checked; ['#wk-day', '#wk-time'].forEach((q) => { $(q).disabled = !on; }); $('.wk-when')?.classList.toggle('dim', !on); });
    $('#theme-seg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; localStorage.setItem('theme', b.dataset.v); applyTheme(); $$('#theme-seg button').forEach((x) => x.classList.toggle('on', x === b)); };
    $$('[data-conn-type]').forEach((sel) => sel.addEventListener('change', () => { (S.connEdit ||= {})[+sel.dataset.connType] = sel.value; render(); }));
    $('#tone-pick').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; localStorage.setItem('tone', b.dataset.v); applyTheme(); $$('#tone-pick button').forEach((x) => x.classList.toggle('on', x === b)); if (!document.documentElement.dataset.theme && !matchMedia('(prefers-color-scheme: dark)').matches) toast('Ton koyu modda görünür'); };
    $('#density-seg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; localStorage.setItem('density', b.dataset.v); applyTheme(); $$('#density-seg button').forEach((x) => x.classList.toggle('on', x === b)); };
    $('#uisize-seg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; localStorage.setItem('uisize', b.dataset.v); applyTheme(); $$('#uisize-seg button').forEach((x) => x.classList.toggle('on', x === b)); };
    $('#accent-pick').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; localStorage.setItem('accent', b.dataset.v); applyTheme(); $$('#accent-pick button').forEach((x) => x.classList.toggle('on', x === b)); };
    $('#new-printer').addEventListener('keydown', (e) => { if (e.key === 'Enter') ACTIONS['add-printer'](); });
    $('#logo-in').onchange = (e) => e.target.files[0] && uploadLogo(e.target.files[0]);
    const saveCut = async (v) => { try { S.settings = await api('PUT', '/api/settings', { ship_cutoff: v }); toast(v ? `Kargo çıkış saati ${v}` : "Trendyol'un saati kullanılacak"); } catch (e) { fail(e); } };
    $('#ship-cutoff').addEventListener('change', (e) => e.target.value && saveCut(e.target.value));
    $('#ship-raw').addEventListener('change', (e) => { $('#ship-cutoff').disabled = e.target.checked; if (e.target.checked) saveCut(''); else { $('#ship-cutoff').value = $('#ship-cutoff').value || '17:00'; saveCut($('#ship-cutoff').value); } });
    $$('[data-printer-kind]').forEach((sel) => sel.addEventListener('change', () => {
      const list = structuredClone(S.settings.printers); list[+sel.dataset.printerKind].kind = sel.value; savePrinters(list);
    }));
    $('#printer-photo-in').onchange = async (e) => {
      const f = e.target.files[0]; const i = +e.target.dataset.i; if (!f) return;
      try {
        const r = await api('POST', '/api/upload-image', { data: await resizeImage(f, 360) });
        const list = structuredClone(S.settings.printers); list[i].image = r.url; savePrinters(list);
      } catch (err) { fail(err); }
    };
  },
};
// ---------- Ayarlar → Görünüm ve düzen (gelişmiş): neyin nerede görüneceği; cihaz başına
const UI_LABELS = {
  top: [['pbar', 'Üstte yazıcı durum barı'], ['pbarLabels', 'Barda durum yazıları (boşta, %45 · 1 sa 20 dk)'], ['pbarScroll', 'Sığmazsa kaysın (kapalıysa alt satıra geçer)'], ['cmdk', 'Ara düğmesi (Ctrl+K)'], ['newPrint', '“Yeni baskı” düğmesi']],
  nf: [['panel', 'Geniş ekranda bildirim paneli sağda sabit dursun (kapalıysa zil simgesinden açılır)'], ['sound', 'Uyarı sesleri (biten baskı, yazıcı bildirimi)']],
  secB: [['baskilar.timeline', 'Makine çizelgesi'], ['baskilar.bulk', '“N baskı sonuç bekliyor” şeridi'], ['baskilar.history', 'Geçmiş tablosu']],
  secP: [['plan.others', 'İşi olmayan makineler satırı'], ['plan.filament', 'Filament ihtiyacı'], ['plan.spools', 'Azalan makaralar']],
  secU: [['urun.sugg', 'Önerilen en az stok'], ['urun.tiles', 'Özet sayılar'], ['urun.chart', 'Son 12 hafta grafiği'], ['urun.profit', 'Kâr dökümü'], ['urun.ty', 'Trendyol / buybox'], ['urun.jobs', 'Baskı geçmişi'], ['urun.log', 'Stok hareketleri']],
  card: [['cat', 'Kategori'], ['colors', 'Renkler'], ['meta', 'Gram · süre'], ['setmeter', 'Parça ilerlemesi (sonraki set)'], ['forecast', '“≈X gün yeter” etiketi'], ['stockbtns', 'Stok − / + düğmeleri']],
  cols: [['type', 'Tür'], ['mats', 'Hammadde'], ['grams', 'Gram'], ['time', 'Süre'], ['file', 'Dosya'], ['inprod', 'Baskıda']],
  tyo: [['thumbs', 'Ürün görselleri'], ['who', 'Müşteri ve şehir'], ['amt', 'Tutar'], ['pr', 'Tahmini kâr'], ['dl', 'Son teslim / paket tarihi']],
  np: [['order', 'Özel sipariş'], ['comp', 'Ortak parça'], ['misc', 'Diğer amaçlı']],
};
const NF_KINDS = [['printer', 'Yazıcı'], ['print_done', 'Biten baskı'], ['trendyol', 'Trendyol ve buybox'], ['stock', 'Stok ve makara'], ['report', 'Haftalık özet']];
function advancedHTML() {
  uipLoad();
  const sw = (path, label) => `<label class="switch sm"><input type="checkbox" data-up="${path}" ${U(path) ? 'checked' : ''}> ${label}</label>`;
  const grp = (g, list, pre = g) => list.map(([k, l]) => sw(`${pre}.${k}`, l)).join('');
  const inv = (path, v, label) => `<label class="switch sm"><input type="checkbox" data-up-not="${path}" data-v="${esc(v)}" ${(U(path) || []).includes(v) ? '' : 'checked'}> ${label}</label>`;
  const nav = navAll(), hidden = U('nav.hidden') || [], tabs = tabMain();
  const printers = (S.settings?.printers || []).map((p) => p.name).filter(Boolean);
  const dash = dashLayout();
  return `<details class="panel adv" id="adv" ${S.advOpen ? 'open' : ''}>
    <summary><h2>${icon('gear')} Görünüm ve düzen <span class="faint">(gelişmiş)</span></h2><span class="muted">bu cihaza kaydedilir</span></summary>
    <div class="adv-body">
      <section class="adv-g"><h3>Sol menü</h3><p class="muted">Sürükleyin ya da oklarla sıralayın; gizlenen sayfalar Ctrl+K aramasından ve adresinden yine açılır.</p>
        <ol class="adv-nav" id="adv-nav">${nav.map((n, i) => `<li draggable="true" data-r="${n.r}" class="${hidden.includes(n.r) ? 'off' : ''}"><span class="grip" aria-hidden="true">⠿</span>${icon(n.icon)}<b>${n.label}</b>
          <span class="spacer"></span><button class="icon-btn" data-act="adv-nav-move" data-r="${n.r}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Yukarı">↑</button><button class="icon-btn" data-act="adv-nav-move" data-r="${n.r}" data-d="1" ${i === nav.length - 1 ? 'disabled' : ''} aria-label="Aşağı">↓</button>
          ${inv('nav.hidden', n.r, 'Göster')}</li>`).join('')}</ol>
        <div class="adv-row">${sw('nav.badges', 'Menüde sayı rozetleri')}</div>
        <div class="field"><span>Telefonda alt çubuktaki 4 sayfa</span><div class="adv-tabs">${[0, 1, 2, 3].map((i) => `<select class="input" data-tab-i="${i}">${NAV.map((n) => `<option value="${n.r}" ${tabs[i] === n.r ? 'selected' : ''}>${n.label}</option>`).join('')}</select>`).join('')}</div></div>
      </section>
      <section class="adv-g"><h3>Üst çubuk</h3><div class="adv-sw">${grp('top', UI_LABELS.top)}</div>
        ${printers.length ? `<div class="field"><span>Barda gösterilecek yazıcılar</span><div class="adv-sw cols">${printers.map((n) => inv('top.pbarHidden', n, esc(n))).join('')}</div></div>` : ''}</section>
      <section class="adv-g"><h3>Bildirimler</h3><div class="adv-sw">${grp('nf', UI_LABELS.nf)}</div>
        <div class="field"><span>Gösterilecek bildirim türleri</span><div class="adv-sw cols">${NF_KINDS.map(([k, l]) => inv('nf.hide', k, l)).join('')}</div><small>Kapatılan türler bu cihazda listede, sayıda ve seste görünmez; telefon bildirimlerini etkilemez.</small></div></section>
      <section class="adv-g"><h3>Pano</h3><div class="adv-sw cols">${dash.map((L) => `<label class="switch sm"><input type="checkbox" data-dash="${L.id}" ${L.hidden ? '' : 'checked'}> ${DASH_SECTIONS[L.id].title}</label>`).join('')}</div>
        <small>Sıra ve genişlik için Pano'da “Panoyu düzenle”.</small></section>
      <section class="adv-g"><h3>Sayfa bölümleri</h3>
        <div class="field"><span>Baskılar</span><div class="adv-sw cols">${grp('sec', UI_LABELS.secB)}</div></div>
        <div class="field"><span>Plan</span><div class="adv-sw cols">${grp('sec', UI_LABELS.secP)}</div></div>
        <div class="field"><span>Ürün sayfası</span><div class="adv-sw cols">${grp('sec', UI_LABELS.secU)}</div></div></section>
      <section class="adv-g"><h3>Ürün kartı ve liste</h3>
        <div class="field"><span>Kartta</span><div class="adv-sw cols">${grp('card', UI_LABELS.card)}</div></div>
        <div class="field"><span>Liste görünümü sütunları</span><div class="adv-sw cols">${grp('cols', UI_LABELS.cols)}</div></div></section>
      <section class="adv-g"><h3>Trendyol sipariş satırları</h3><div class="adv-sw cols">${grp('tyo', UI_LABELS.tyo)}</div></section>
      <section class="adv-g"><h3>Yeni baskı penceresi sekmeleri</h3><div class="adv-sw cols">${grp('np', UI_LABELS.np)}</div><small>“Stok ürünü” her zaman görünür.</small></section>
      <div class="adv-foot"><button class="btn btn-sm" data-act="adv-export">${icon('upload')} Dışa aktar</button><button class="btn btn-sm" data-act="adv-import">İçe aktar</button>
        <input type="file" id="adv-file" accept=".json,application/json" hidden><span class="spacer"></span><button class="btn btn-sm btn-ghost" data-act="adv-reset">Varsayılana dön</button></div>
    </div></details>`;
}
function advBind() {
  const box = $('#adv'); if (!box) return;
  box.addEventListener('toggle', () => { S.advOpen = box.open; });
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.up) uipSet(t.dataset.up, t.checked);
    else if (t.dataset.upNot) { const path = t.dataset.upNot; const set = new Set(U(path) || []); t.checked ? set.delete(t.dataset.v) : set.add(t.dataset.v); uipSet(path, [...set]); if (path === 'nav.hidden') t.closest('li')?.classList.toggle('off', !t.checked); }
    else if (t.dataset.tabI !== undefined) { const tabs = [...tabMain()]; tabs[+t.dataset.tabI] = t.value; uipSet('nav.tabs', tabs); }
    else if (t.dataset.dash) { const l = dashLayout(); const x = l.find((y) => y.id === t.dataset.dash); if (x) { x.hidden = !t.checked; try { localStorage.setItem('dashLayout', JSON.stringify(l)); } catch { /* */ } } }
    else if (t.id === 'adv-file' && t.files[0]) {
      t.files[0].text().then((txt) => { const j = JSON.parse(txt); if (!j || typeof j !== 'object' || !j.ui) throw new Error('Geçersiz dosya');
        localStorage.setItem('uiPrefs', JSON.stringify(j.ui)); if (j.dash) localStorage.setItem('dashLayout', JSON.stringify(j.dash));
        ['theme', 'tone', 'accent', 'density', 'uisize'].forEach((k) => { if (j[k]) localStorage.setItem(k, j[k]); });
        applyTheme(); applyUI(); render(); toast('Görünüm ayarları içe aktarıldı'); }).catch((err) => fail(err));
    }
  });
  // menü sırası: sürükle-bırak
  let drag = null;
  $$('#adv-nav li').forEach((li) => {
    li.addEventListener('dragstart', (e) => { drag = li.dataset.r; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); $$('#adv-nav li').forEach((x) => x.classList.remove('drop-before')); });
    li.addEventListener('dragover', (e) => { e.preventDefault(); $$('#adv-nav li').forEach((x) => x.classList.toggle('drop-before', x === li && x.dataset.r !== drag)); });
    li.addEventListener('drop', (e) => {
      e.preventDefault(); if (!drag || drag === li.dataset.r) return;
      const order = navAll().map((n) => n.r).filter((r) => r !== drag); order.splice(order.indexOf(li.dataset.r), 0, drag);
      uipSet('nav.order', order); render();
    });
  });
}

// Tema: mod (sistem/açık/koyu), koyu tema tonu ve vurgu rengi; cihaz başına saklanır
const THEME_TONES = [['cool', 'Soğuk antrasit', ['#1A1C1F', '#222529', '#33383D']], ['neutral', 'Nötr antrasit', ['#1B1C1E', '#232427', '#36383C']],
  ['warm', 'Sıcak antrasit', ['#1D1B1A', '#262322', '#3A3532']], ['navy', 'Lacivert gri', ['#141A1F', '#1C252B', '#2F3B43']]];
const THEME_ACCENTS = [['copper', 'Bakır', '#C98F3E'], ['green', 'Yeşil', '#4BAE7F'], ['blue', 'Mavi', '#4F86E6'], ['purple', 'Mor', '#8B73E6'], ['red', 'Kırmızı', '#D9604A']];
const themeOpt = (k) => { try { return localStorage.getItem(k) || (k === 'tone' ? 'cool' : k === 'accent' ? 'copper' : 'auto'); } catch { return k === 'tone' ? 'cool' : k === 'accent' ? 'copper' : 'auto'; } };
const UI_SIZES = [['90', 'Küçük'], ['100', 'Normal'], ['110', 'Büyük'], ['120', 'Çok büyük']];
const uiOpt = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
function applyTheme() {
  const t = themeOpt('theme'), de = document.documentElement;
  if (t === 'auto') de.removeAttribute('data-theme'); else de.dataset.theme = t;
  de.dataset.tone = themeOpt('tone'); de.dataset.accent = themeOpt('accent');
  de.dataset.density = uiOpt('density', 'comfy');
  const z = +uiOpt('uisize', '100') / 100; de.style.zoom = z === 1 ? '' : String(z);
  fitSoon?.(); setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
}
// Yazı boyutu sayfanın tamamını ölçekler (CSS zoom); konumlandırmalar ekran pikselinden CSS pikseline çevrilir
const ZF = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
// Telefonun Chrome ayarına yazılacak adres: bilgisayarın ev ağındaki IP'si (localhost'tan açıldıysa sunucunun bildirdiği IP)
const lanOrigin = () => { const h = location.hostname; if (h !== 'localhost' && h !== '127.0.0.1') return location.origin; const ip = (S.settings?.lan_ips || [])[0]; return ip ? `http://${ip}:${location.port || 80}` : `http://BILGISAYAR-IP:${location.port || 8080}`; };
const hasLink = (p) => !!(p.bambu_ip || p.mr_url || p.sdcp_ip);
const linkType = (p) => (p.bambu_ip ? 'bambu' : p.mr_url ? 'moonraker' : p.sdcp_ip ? 'elegoo' : '');
const LINK_NAMES = { bambu: 'Bambu Lab', moonraker: 'Moonraker (Klipper)', elegoo: 'Elegoo (SDCP · deneme)' };
// Makine bağlantısı: Bambu (LAN MQTT), Moonraker (HTTP), Elegoo SDCP (WebSocket)
function bambuBlock(p, i) {
  const st = (S.bambu?.printers || []).find((x) => x.name === p.name);
  const cur = linkType(p), type = S.connEdit?.[i] ?? cur;
  const status = !cur ? '' : !st ? '<span class="dot"></span> Bekleniyor'
    : st.online ? `<span class="dot ok"></span> Bağlı${st.state ? ` · ${({ RUNNING: 'basıyor', IDLE: 'boşta', FINISH: 'bitti', FAILED: 'hata', PAUSE: 'duraklatıldı', PREPARE: 'hazırlanıyor' })[st.state] || st.state}${st.percent != null && st.state === 'RUNNING' ? ` %${st.percent}` : ''}` : ''}`
    : st.connecting ? '<span class="dot"></span> Bağlanıyor…' : `<span class="dot bad"></span> ${esc(st.error || 'Bağlı değil')}`;
  const sel = `<label class="field"><span>Bağlantı türü</span><select class="input" data-conn-type="${i}">
      <option value="">Bağlantı yok</option>${Object.entries(LINK_NAMES).map(([k, l]) => `<option value="${k}"${type === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const btns = (extra = '') => `<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-act="conn-save" data-i="${i}">Kaydet ve bağlan</button>${extra}${cur ? `<button class="btn btn-ghost btn-sm" data-act="bambu-remove" data-i="${i}">Bağlantıyı kaldır</button>` : ''}</div>`;
  let fields = '', note = '';
  if (type === 'bambu') {
    fields = `<label class="field"><span>IP adresi</span><input class="input" data-bambu="ip-${i}" value="${esc(p.bambu_ip || '')}" placeholder="192.168.1.50" inputmode="decimal" autocomplete="off"></label>
      <label class="field"><span>Seri numarası</span><input class="input" data-bambu="serial-${i}" value="${esc(p.bambu_serial || '')}" placeholder="01P00A..." autocomplete="off"></label>
      <label class="field"><span>Erişim kodu</span><input class="input" data-bambu="code-${i}" type="password" placeholder="${p.bambu_code_set ? 'Kayıtlı — değiştirmek için yazın' : '8 haneli kod'}" autocomplete="new-password"></label>${btns()}`;
    note = 'Yazıcı ekranında: Ayarlar → WLAN (A1\'de Ayarlar → Ağ) bölümünde IP ve <b>Erişim Kodu</b>; seri numarası Ayarlar → Cihaz bilgisinde ya da Bambu Studio → Cihaz sekmesinde yazar.';
  } else if (type === 'moonraker') {
    fields = `<label class="field"><span>Moonraker adresi</span><input class="input" data-mr="url-${i}" value="${esc(p.mr_url || '')}" placeholder="192.168.1.60:7125" autocomplete="off"></label>
      <label class="field"><span>API anahtarı <span class="faint">(varsa)</span></span><input class="input" data-mr="key-${i}" type="password" placeholder="${p.mr_key_set ? 'Kayıtlı — değiştirmek için yazın' : 'genelde gerekmez'}" autocomplete="new-password"></label>${btns()}`;
    note = 'Mainsail/Fluidd\'yi açtığınız adres; port yazmazsanız 7125 kullanılır. Kalan süre dilimleyicinin tahmininden hesaplanır.';
  } else if (type === 'elegoo') {
    fields = `<label class="field"><span>IP adresi</span><input class="input" data-el="ip-${i}" value="${esc(p.sdcp_ip || '')}" placeholder="192.168.1.70" inputmode="decimal" autocomplete="off"></label>
      ${btns(`<button class="btn btn-sm" data-act="el-test" data-i="${i}">Bağlantıyı test et</button>`)}`;
    note = 'Yazıcı ekranında Ayarlar → Ağ bölümünde IP yazar. Bu bağlantı deneme aşamasında: "Bağlantıyı test et" sonucunu paylaşırsanız yazıcınıza göre tamamlarım.';
  }
  return `<details class="bambu-box"${S.connEdit?.[i] !== undefined ? ' open' : ''}><summary>${icon('layers')} Yazıcı bağlantısı ${cur ? `<span class="faint">${LINK_NAMES[cur].split(' ')[0]}</span> <span class="bambu-st">${status}</span>` : '<span class="faint">kapalı</span>'}</summary>
    <div class="bambu-fields">${sel}${fields}</div>
    ${note ? `<p class="side-note" style="margin:6px 0 0">${note}</p>` : ''}
    ${S.elTest?.[i] ? `<details class="el-test" open><summary>Test sonucu</summary><pre>${esc(JSON.stringify(S.elTest[i], null, 2))}</pre><button class="btn btn-sm btn-ghost" data-act="el-copy" data-i="${i}">Kopyala</button></details>` : ''}
  </details>`;
}
async function savePrinters(list) {
  try { S.settings = await api('PUT', '/api/settings', { printers: list }); render(); } catch (e) { fail(e); }
}

// ================================================================== modal
let modalOnClose = null;
function openModal(inner, size = '', onClose) {
  closeModal(true);
  modalOnClose = onClose || null;
  $('#modal-root').innerHTML = `<div class="modal-back"><div class="modal ${size}" role="dialog" aria-modal="true">${inner}</div></div>`;
  const back = $('.modal-back');
  back.addEventListener('pointerdown', (e) => { back.dataset.down = e.target === back ? '1' : ''; });
  back.addEventListener('click', (e) => { if (e.target === back && back.dataset.down === '1') closeModal(); });
  document.body.style.overflow = 'hidden';
}
function closeModal(silent) {
  closePalette();
  if (!$('#modal-root').children.length) return;
  const back = $('#modal-root .modal-back');
  if (!silent && back && !REDUCED()) {
    // Pencereyi kökten hemen ayır (mantık için kapanmış sayılır), çıkış animasyonu bitince sil
    document.body.appendChild(back); back.classList.add('closing'); back.style.pointerEvents = 'none';
    setTimeout(() => back.remove(), 200);
  }
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
  const cb = modalOnClose; modalOnClose = null;
  if (cb) cb();
  if (!silent) setTimeout(checkDue, 300);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (PAL) closePalette(); else closeModal(); } });

// ================================================================== actions
const stepInput = (sel, d, min = 1, max = 9999) => { const i = $(sel); i.value = clamp((parseInt(i.value) || 0) + d, min, max); i.dispatchEvent(new Event('input')); };
const ACTIONS = {
  'close': () => closeModal(),
  'new-print': () => openNewPrint(),
  'print-product': (el) => openNewPrint(+el.dataset.id),
  'new-product': () => openProductEditor(),
  'edit-product': (el) => openProductEditor(+el.dataset.id),
  'save-product': saveProduct,
  'delete-product': async (el) => {
    if (!confirm('Ürün arşivlensin mi? Stok geçmişi korunur, Ayarlar sayfasından geri alabilirsiniz.')) return;
    try { await api('DELETE', `/api/products/${el.dataset.id}`); closeModal(); toast('Ürün arşivlendi'); render(); } catch (e) { fail(e); }
  },
  'restore-product': async (el) => { try { await api('POST', `/api/products/${el.dataset.id}/restore`); toast('Ürün geri alındı'); render(); } catch (e) { fail(e); } },
  'pick-color': (el) => openPalette(el, ED.materials[+el.dataset.i], renderMats),
  'pick-part-color': (el) => openPalette(el, ED.parts[+el.dataset.i], renderParts),
  'add-mat': () => { if (ED.materials.length < 6) { const last = ED.materials[ED.materials.length - 1]; ED.materials.push({ color_hex: '#1A1A1A', color_name: 'Siyah', brand: last?.brand || '' }); renderMats(); $$('#mats .mat-wrap').at(-1)?.classList.add('row-in'); } },
  'rm-mat': (el) => { if (ED.materials.length > 1) { ED.materials.splice(+el.dataset.i, 1); renderMats(); } },
  'pick-file': () => $('#model-file').click(),
  'set-step': (el) => { const i = $('#f-set'); i.value = clamp((parseInt(i.value) || 1) + +el.dataset.d, 1, 99); applyCategoryUI(); },
  'add-part': () => { ED.parts.push({ name: '', per_unit: 1, stock: 0 }); renderParts(); $$('#parts-box .part-row').at(-1)?.classList.add('row-in'); $$('#parts-box [data-pf="name"]').at(-1).focus(); },
  'rm-part': (el) => { if (ED.parts.length > 2) { ED.parts.splice(+el.dataset.i, 1); renderParts(); } },
  'stock': (el, e) => { e.stopPropagation(); quickStock(+el.dataset.id, +el.dataset.d); },
  'pf-type': (el) => { S.pf.type = el.dataset.v; render(); },
  'pf-set': (el) => { S.pf[el.dataset.k] = el.dataset.v; pfApply(); },
  'pf-clear': () => { Object.assign(S.pf, { st: 'all', type: 'all', cat: 'all' }); pfApply(); },
  'pf-close': () => { const m = $('#pf-menu'); if (m) m.open = false; },
  'dash-edit': () => { S.dashEdit = !S.dashEdit; render(); },
  'dash-reset': () => { try { localStorage.removeItem('dashLayout'); } catch { /* */ } render(); },
  'dash-move': (el) => { const l = dashLayout(), i = +el.dataset.i, j = i + +el.dataset.d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; saveDashLayout(l); },
  'dash-width': (el) => { const l = dashLayout(); const x = l[+el.dataset.i]; x.w = { full: 'half', half: 'third', third: 'full' }[x.w] || 'full'; saveDashLayout(l); },
  'dash-hide': (el) => { const l = dashLayout(); const x = l[+el.dataset.i]; x.hidden = !x.hidden; saveDashLayout(l); },
  'pick-vd-color': (el) => openPalette(el, VD, () => VD.redraw()),
  'save-variant': () => saveVariant(),
  'ungroup': async (el) => { if (!confirm('Bu ürün varyant grubundan çıkarılsın mı? Ortak alanlar artık birlikte değişmez.')) return; try { await api('POST', `/api/products/${el.dataset.id}/ungroup`); closeModal(); await loadProducts(); render(); } catch (e) { fail(e); } },
  'go': (el) => { closeModal(true); location.hash = '#/' + el.dataset.r; },
  'more-menu': () => {
    openModal(`<div class="modal-h"><h2>Menü</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
      <div class="modal-b more-list">${S.moreItems.map((n) => `<a class="more-item" href="#/${n.r}" data-act="go" data-r="${n.r}">${icon(n.icon)}<span>${n.label}</span>${n.badge || ''}</a>`).join('')}</div>`, 'narrow');
  },
  'new-spool': () => openSpoolEditor(),
  'edit-spool': (el) => openSpoolEditor(+el.dataset.id),
  'save-spool': () => saveSpool(),
  'pick-spool-color': (el) => openPalette(el, SPE, () => SPE.redraw()),
  'spool-photo-rm': (el) => { SPE.photo = null; const d = $('#sp-drop'); d.classList.remove('has'); d.style.removeProperty('--img'); el.remove(); },
  'sp-net': (el) => { $('#sp-net').value = el.dataset.v; $('#sp-net').dispatchEvent(new Event('input')); },
  'sp-count': (el) => { const i = $('#sp-count'); i.value = clamp((parseInt(i.value) || 1) + +el.dataset.d, 1, 50); spCountHint(); },
  'spool-weigh': async () => {
    try { const r = await api('POST', `/api/spools/${SPE.id}/weigh`, { scale: parseFloat($('#sp-scale').value) || 0, tare: $('#sp-tare').value });
      $('#sp-rem').value = Math.round(r.remaining); toast(`#${r.code}: kalan ${Math.round(r.remaining)} g`); await loadSpools(); } catch (e) { fail(e); }
  },
  'spool-archive': async (el) => { if (!confirm('Makara arşivlensin mi?')) return; try { await api('DELETE', `/api/spools/${el.dataset.id}`); closeModal(); await loadSpools(); render(); } catch (e) { fail(e); } },
  'ff-mat': (el) => { S.ff.mat = el.dataset.v; render(); },
  'ff-show': (el) => { S.ff.show = el.dataset.v; render(); },
  'ff-q': (el) => { S.ff.q = el.dataset.v; render(); },
  'stat-month': (el) => { const d = +el.dataset.d; const n = new Date(); S.statMonth = d === 0 ? `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}` : shiftMonth(S.statMonth, d); render(); },
  'stat-goto': (el) => { S.statMonth = el.dataset.m; render(); },
  'stat-cat': (el) => { S.statCat = el.dataset.v; render(); },
  'profit-save': saveProfitCfg,
  'push-test': async () => { try { const r = await api('POST', '/api/push/test'); toast(r.subscribers ? `Deneme bildirimi ${r.subscribers} telefona gönderildi` : 'Henüz bildirim açmış telefon yok'); } catch (e) { fail(e); } },
  'nf-filter': (el) => { S.nfFilter = el.dataset.v; renderNotifs(); },
  'nf-close': () => notifOpen(false),
  'nf-all': async () => { try { await api('POST', '/api/notifications/resolve-all'); await loadNotifs(); } catch (e) { fail(e); } },
  'issue-ok': async (el) => { try { await api('POST', `/api/stock-issues/${el.dataset.id}/resolve`); await issueRefresh(); } catch (e) { fail(e); } },
  'issue-all': async () => { if (!confirm('Tüm sayım farkları kapatılsın mı? Stoklar değişmez.')) return; try { await api('POST', '/api/stock-issues/resolve-all'); await issueRefresh(); } catch (e) { fail(e); } },
  'issue-more': () => { S.issuesAll = true; render(); },
  'issue-count': async (el) => {
    const inp = $(`[data-issue-count="${el.dataset.id}"]`), n = parseInt(inp?.value);
    if (!(n >= 0)) { inp?.focus(); return toast('Raftaki adedi yazın', { bad: true }); }
    try { await api('PUT', `/api/products/${inp.dataset.pid}`, { stock: n }); await api('POST', `/api/stock-issues/${el.dataset.id}/resolve`); toast('Stok güncellendi'); await loadProducts(); await issueRefresh(); } catch (e) { fail(e); }
  },
  'ty-products': openTyProducts,
  'typ-sync': tyProductsSync,
  'typ-import': typImportSelected,
  'cl-tab': (el) => { S.clTab = el.dataset.v; history.replaceState(null, '', '#/iadeler'); render(); },
  'q-tab': (el) => { S.qTab = el.dataset.v; history.replaceState(null, '', '#/sorular'); render(); },
  'mu-sync': async (el) => { el.disabled = true; try { await api('POST', '/api/musteri/sync'); await loadNotifs(); render(); } catch (e) { fail(e); el.disabled = false; } },
  'cl-approve': async (el) => {
    const cid = el.dataset.id, ids = clSelected(cid); if (!ids.length) return toast('Onaylanacak ürünü işaretleyin', { bad: true });
    const restock = $(`.cl-card[data-cid="${cid}"] [data-cl-restock]`)?.checked;
    if (!confirm(`${ids.length} ürünün iadesi Trendyol'da onaylanacak${restock ? ' ve stoğa geri eklenecek' : ''}. Emin misiniz?`)) return;
    el.disabled = true;
    try { const r = await api('POST', `/api/claims/${cid}/approve`, { item_ids: ids, restock }); toast(`İade onaylandı${r.restocked ? ` · ${r.restocked} adet stoğa eklendi` : ''}`); await loadNotifs(); render(); }
    catch (e) { fail(e); el.disabled = false; }
  },
  'cl-reject': (el) => clReject(el.dataset.id),
  'q-send': async (el) => {
    const card = el.closest('.q-card'), txt = card.querySelector('textarea').value.trim();
    if (txt.length < 10) return toast('Cevap en az 10 karakter olmalı', { bad: true });
    el.disabled = true;
    try { await api('POST', `/api/questions/${el.dataset.id}/answer`, { text: txt }); toast('Cevap gönderildi; Trendyol onayından sonra yayınlanır'); await loadNotifs(); render(); }
    catch (e) { fail(e); el.disabled = false; }
  },
  'shapes-open': () => openShapes(),
  'shape-upload': () => $('#shape-file')?.click(),
  'shape-brands': (el) => openShapeBrands(+el.dataset.id),
  'shape-rename': async (el) => {
    const sh = (S.shapes || []).find((x) => x.id === +el.dataset.id); if (!sh) return;
    const name = prompt('Makara şeklinin adı', sh.name); if (name == null || !name.trim()) return;
    try { const r = await api('PUT', `/api/spool-shapes/${sh.id}`, { name: name.trim() }); S.shapes = r.shapes; S.shapeBrands = r.brands; renderShapes(); } catch (e) { fail(e); }
  },
  'shape-del': async (el) => {
    const sh = (S.shapes || []).find((x) => x.id === +el.dataset.id); if (!sh) return;
    if (!confirm(`“${sh.name}” silinsin mi?${sh.brands.length ? ` ${sh.brands.length} marka varsayılan makara görünümüne döner.` : ''}`)) return;
    try { const r = await api('DELETE', `/api/spool-shapes/${sh.id}`); S.shapes = r.shapes; S.shapeBrands = r.brands; S.shapeUrlC = {}; renderShapes(); } catch (e) { fail(e); }
  },
  'ty-img': async (el) => { el.disabled = true; try { const r = await api('POST', '/api/trendyol/image', { url: el.dataset.url }); setThumb(r.url); $$('.ty-img').forEach((x) => x.classList.toggle('on', x === el)); toast('Görsel seçildi; kaydetmeyi unutmayın'); } catch (e) { fail(e); } el.disabled = false; },
  'osrc': (el) => { S.oSrc = el.dataset.v; try { localStorage.setItem('oSrc', S.oSrc); } catch { /* */ } render(); },
  'tyo-tab': (el) => { S.tyo.tab = el.dataset.v; S.tyo.sel.clear(); tyoRedraw(); },
  'tyo-clear': async () => { const f = S.tyo, reload = f.rD !== 'month'; Object.assign(f, { q: '', cat: 'all', pid: null, rA: 'all', rD: 'month' }); if (reload) { try { await loadTyOrders(); } catch (e) { fail(e); } } tyoRedraw(); },
  'tyo-sync': async (el) => { el.disabled = true; try { const r = await api('POST', '/api/trendyol/sync'); await Promise.all([loadTyOrders(), loadProducts()]); toast(r.deducted ? `Eşitlendi · ${r.deducted} adet stoktan düştü` : 'Eşitlendi'); render(); } catch (e) { fail(e); el.disabled = false; } },
  'tyo-pick': (el) => tyoPick([el.dataset.id]),
  'tyo-pick-sel': () => tyoPick(tyoFiltered().filter((p) => p.can_pick && S.tyo.sel.has(p.package_id)).map((p) => p.package_id)),
  'tyo-match': async (el) => {
    const code = el.dataset.code; const sel = $$('[data-tyo-match]').find((x) => x.dataset.tyoMatch === code);
    if (!sel?.value) return toast('Önce ürünü seçin', { bad: true });
    el.disabled = true;
    try { const r = await api('POST', `/api/products/${sel.value}/barcode`, { code }); toast(`Barkod kaydedildi${r.deducted ? ` · ${r.deducted} adet stoktan düştü` : ''}`); await Promise.all([loadProducts(), loadTyOrders()]); render(); } catch (e) { fail(e); el.disabled = false; }
  },
  'kt-filter': (el) => { S.ktf = el.dataset.v; $$('#kt-filter .chip').forEach((x) => x.classList.toggle('on', x === el)); ktRender(); },
  'kt-pick': (el) => { Object.keys(KC).forEach((k) => delete KC[k]); KC.pid = +el.dataset.id; kcRender(); $('#kc').closest('.panel').scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'start' }); },
  'kc-clear': () => { Object.keys(KC).forEach((k) => delete KC[k]); KC.pid = null; kcRender(); },
  'kc-target': (el) => { $('#kc-price').value = String(el.dataset.v).replace('.', ','); KC.price = $('#kc-price').value; kcCalc(); },
  'kc-save': kcSave,
  'pf-target': (el) => { $('#f-price').value = String(el.dataset.v).replace('.', ','); edProfitRender(); },
  'pf-tab': (el) => { S.pf.tab = el.dataset.v; render(); },
  'vsel': (el, e) => { e.stopPropagation(); (S.vsel ||= {})[+el.dataset.gid] = +el.dataset.id; const p = productById(+el.dataset.id); rerenderProductCard(p); },
  'new-variant': (el, e) => { e?.stopPropagation(); openVariantDialog(+el.dataset.id); },
  'new-comp': () => openCompEditor(),
  'new-misc': () => openCompEditor(null, 'misc'),
  'parts-sum-apply': () => { const sum = ED.parts.reduce((a, x) => a + (partGram(x) || 0) * (parseInt(x.per_unit) || 1), 0); $('#f-grams').value = Math.round(sum * 10) / 10; $('#f-grams').dispatchEvent(new Event('input', { bubbles: true })); $('#parts-grams').innerHTML = partsGramsHTML(); edProfitRender?.(); },
  'mat-sum-apply': () => { const sum = ED.materials.reduce((a, m) => a + (+m.grams || 0), 0); $('#f-grams').value = Math.round(sum * 10) / 10; ED.gramsFromColors = true; matGramsSync(true); edProfitRender(); },
  'adv-nav-move': (el) => { const order = navAll().map((n) => n.r), i = order.indexOf(el.dataset.r), j = i + +el.dataset.d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; uipSet('nav.order', order); render(); },
  'adv-reset': () => { if (!confirm('Görünüm ve düzen ayarları varsayılana dönsün mü? (Tema ve pano düzeni de)')) return; ['uiPrefs', 'dashLayout'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* */ } }); uipLoad(); applyUI(); render(); toast('Varsayılan görünüme dönüldü'); },
  'adv-export': () => {
    const g = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const data = { ui: uipLoad(), dash: JSON.parse(g('dashLayout') || 'null'), theme: g('theme'), tone: g('tone'), accent: g('accent'), density: g('density'), uisize: g('uisize') };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'astera-gorunum.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'adv-import': () => $('#adv-file')?.click(),
  'psel-mode': () => { S.psel = S.psel ? null : new Set(); render(); },
  'psel': (el) => { const id = +el.dataset.id; S.psel.has(id) ? S.psel.delete(id) : S.psel.add(id); pselRefresh(); },
  'psel-all': () => { const vis = filteredProducts(); if (vis.every((p) => S.psel.has(p.id))) S.psel.clear(); else vis.forEach((p) => S.psel.add(p.id)); pselRefresh(); },
  'psel-min-sugg': () => pselUpdate(null, 'önerilen en az stok', (p) => { const f = stockForecast(p); return f.suggested != null ? { min_stock: f.suggested } : null; }),
  'psel-print': () => { S.printQueue = [...S.psel]; S.printQueueTotal = S.printQueue.length; printQueueNext(); },
  'psel-archive': async () => {
    if (!confirm(`${S.psel.size} ürün arşivlensin mi? Stok geçmişi korunur, Ayarlar'dan geri alınabilir.`)) return;
    let ok = 0; for (const id of [...S.psel]) { try { await api('DELETE', `/api/products/${id}`); ok++; S.psel.delete(id); } catch (e) { fail(e); } }
    toast(`${ok} ürün arşivlendi`); await loadProducts(); pselRefresh();
  },
  'bulk-open': () => openBulkResults(),
  'bulk-q': (el) => { const i = $(`[data-bq="${el.dataset.id}"]`); i.value = Math.max(0, (parseInt(i.value) || 0) + +el.dataset.d); S.bulk[+el.dataset.id].good = +i.value; },
  'bulk-ok': (el) => {
    const id = +el.dataset.id, ok = el.dataset.v === '1'; S.bulk[id].ok = ok;
    const row = $(`[data-bj="${id}"]`); row?.classList.toggle('bad', !ok);
    row?.querySelectorAll('.bulk-ok button').forEach((b) => b.classList.toggle('on', b.dataset.v === (ok ? '1' : '0')));
  },
  'bulk-save': () => saveBulk(),
  'reprint': async (el) => { const id = +el.dataset.id; let j = S.jobs.find((x) => x.id === id) || (S.history || []).find((x) => x.id === id) || (S.pd?.jobs || []).find((x) => x.id === id); closeModal(true); reprint(j); },
  'pd-stock': async (el) => { try { await api('POST', `/api/products/${el.dataset.id}/stock`, { delta: +el.dataset.d, reason: +el.dataset.d > 0 ? 'manual' : 'sale' }); await loadProducts(); render(); } catch (e) { fail(e); } },
  'plan-start': (el) => { const it = S.plan?.items.find((x) => x.key === el.dataset.key); if (it) planStart({ pid: it.product_id, oid: it.order_id, printer: it.printer, qty: it.qty }); },
  'plan-refresh': async () => { await loadPlan(); render(); },
  'pd-min': async (el) => { try { await api('PUT', `/api/products/${el.dataset.id}`, { min_stock: +el.dataset.v }); toast(`En az stok ${el.dataset.v} yapıldı`); await loadProducts(); render(); } catch (e) { fail(e); } },
  'tl-job': (el) => { const j = S.jobs.find((x) => x.id === +el.dataset.id); if (!j) return; if (j.ends_at <= nowS()) openResult(j.id); else openJobMenu(j.id); },
  'job-change': (el) => { const id = +el.dataset.id; S.promptOpen = false; closeModal(true); openJobChange(id); },
  'jc-pick': (el) => {
    JC.sel = { k: el.dataset.k, id: +el.dataset.id }; $$('#jc-list .pick').forEach((b) => b.classList.toggle('on', b === el)); $('#jc-save').disabled = false;
    const p = JC.sel.k === 'p' ? productById(JC.sel.id) : null;
    $('#jc-qty-l').textContent = p?.parts?.length ? `Kaç set? (${p.parts_total} parça/set)` : p?.set_size > 1 ? `Kaç set? (${p.set_size}'lü)` : 'Kaç adet?';
  },
  'jc-qty': (el) => { const i = $('#jc-qty'); i.value = Math.max(1, (parseInt(i.value) || 1) + +el.dataset.d); },
  'jc-save': () => jcSave(),
  'bb-f': (el) => { S.bbf = el.dataset.v; render(); },
  'bb-open': (el) => openBuybox(el.dataset.bc),
  'bb-edit': (el) => { closeModal(); openProductEditor(+el.dataset.id); },
  'bb-check': async (el) => {
    el.disabled = true; el.innerHTML = `${icon('refresh')} Kontrol ediliyor…`;
    try { S.bb = await api('POST', '/api/trendyol/buybox/check'); const r = S.bb.result; toast(`${r.checked} ürün kontrol edildi · ${r.multi} üründe başka satıcı var${r.lost ? ` · ${r.lost} üründe buybox başkasında` : ''}`); loadNotifs(); }
    catch (e) { fail(e); }
    render();
  },
  pb: async (el) => {
    // kırmızı (hata) ışığa tıklamak "gördüm" demektir: yanıp sönme durur, hata sürdükçe kırmızı kalır
    if (el.dataset.nid) {
      try { await api('POST', `/api/notifications/${el.dataset.nid}/resolve`); toast(`${el.dataset.name}: uyarı görüldü olarak işaretlendi`); loadNotifs(); await loadBambu(); } catch (e) { fail(e); }
      return;
    }
    if (route() !== 'baskilar') location.hash = '#/baskilar';
  },
  'np-misc-new': async (el) => {
    const name = ($('#np-q')?.value || '').trim(); if (!name) return;
    el.disabled = true;
    try { const c = await api('POST', '/api/components', { kind: 'misc', name, print_type: 'FDM' }); await loadComponents(); NP.q = ''; $('#np-q').value = ''; npPickComp(c.id); }
    catch (e) { fail(e); el.disabled = false; }
  },
  'edit-comp': (el) => openCompEditor(+el.dataset.id),
  'save-comp': () => saveComp(),
  'pick-comp-color': (el) => openPalette(el, CE, () => CE.redraw()),
  'delete-comp': async (el) => { if (!confirm(compById(+el.dataset.id)?.kind === 'misc' ? 'Bu kayıt silinsin mi? Geçmiş baskılar kalır.' : 'Ortak parça arşivlensin mi?')) return; try { await api('DELETE', `/api/components/${el.dataset.id}`); closeModal(); toast('Arşivlendi'); await loadComponents(); render(); } catch (e) { fail(e); } },
  'comp-stock': async (el) => {
    const id = +el.dataset.id, d = +el.dataset.d;
    try {
      const r = await api('POST', `/api/components/${id}/stock`, { delta: d });
      await loadComponents(); if (Object.keys(r.assembled_products || {}).length) await loadProducts();
      const card = $(`.pcard[data-cid="${id}"]`); if (card) { card.outerHTML = compCard(compById(id)); $(`.pcard[data-cid="${id}"] .stocknum`)?.classList.add('bump', d > 0 ? 'up' : 'down'); }
      toast(`${r.name}: havuzda ${r.stock}${assembledText(r.assembled_products)}`);
    } catch (e) { fail(e); }
  },
  'print-comp': (el) => openNewPrint({ componentId: +el.dataset.id }),
  'pf-cat': (el) => { S.pf.cat = el.dataset.v; pfApply(); },
  'pf-view': (el) => { S.pf.view = el.dataset.v; localStorage.setItem('pview', S.pf.view); render(); },
  'np-pick': (el) => npPickProduct(+el.dataset.id),
  'np-pick-order': (el) => npPickOrder(+el.dataset.id),
  'np-spool-pick': (el) => openSpoolPicker(el, +el.dataset.i),
  'np-pick-comp': (el) => npPickComp(+el.dataset.id),
  'np-preset': (el) => npPartsPreset(el.dataset.k),
  'np-part': (el) => { const id = +el.dataset.id; NP.parts[id] = Math.max(0, (NP.parts[id] || 0) + +el.dataset.d); npRenderParts(); },
  'np-qty': (el) => stepInput('#np-qty', +el.dataset.d),
  'np-start': startPrint,
  'job-result': (el) => openResult(+el.dataset.id),
  'job-menu': (el) => openJobMenu(+el.dataset.id),
  'job-snooze': async (el) => { try { await api('POST', `/api/jobs/${el.dataset.id}/snooze`, { minutes: +el.dataset.m + Math.max(0, Math.round(((S.jobs.find((j) => j.id === +el.dataset.id)?.ends_at || 0) - nowS()) / 60)) }); closeModal(); await loadJobs(); render(); } catch (e) { fail(e); } },
  'job-finish-now': async (el) => { try { await api('POST', `/api/jobs/${el.dataset.id}/finish-now`); await loadJobs(); closeModal(true); openResult(+el.dataset.id); } catch (e) { fail(e); } },
  'job-cancel': async (el) => { if (!confirm('Baskı iptal edilsin mi? Stoğa bir şey eklenmez.')) return; try { await api('POST', `/api/jobs/${el.dataset.id}/cancel`); closeModal(); toast('Baskı iptal edildi'); await loadJobs(); render(); } catch (e) { fail(e); } },
  'res-part': (el) => { const i = $(`[data-res-part="${el.dataset.id}"]`); i.value = clamp((parseInt(i.value) || 0) + +el.dataset.d, 0, +i.max); },
  'res-qty': (el) => stepInput('#res-qty', +el.dataset.d, 0, +$('#res-qty').max),
  'res-ok': (el) => finishJob(+el.dataset.id, true),
  'res-fail': (el) => finishJob(+el.dataset.id, false),
  'res-snooze': async (el) => { try { await api('POST', `/api/jobs/${el.dataset.id}/snooze`, { minutes: +el.dataset.m }); localStorage.setItem('notified', JSON.stringify([...notifiedSet()].filter((x) => x !== +el.dataset.id))); closeModal(true); S.promptOpen = false; toast(`${fmtDur(+el.dataset.m)} sonra tekrar soracağım`); await loadJobs(); render(); } catch (e) { fail(e); } },
  'bambu-ev': (el) => { const ev = S.bambu?.events?.find((x) => x.id === el.dataset.id); if (ev) openFromBambu(ev); },
  'bambu-ev-x': async (el) => { (S.bambuHidden ||= {})[el.dataset.id] = 1; renderBambuEvents(); try { await api('POST', `/api/bambu/events/${encodeURIComponent(el.dataset.id)}/dismiss`); } catch { /* */ } },
  'bambu-save': async (el) => {
    const i = +el.dataset.i, list = structuredClone(S.settings.printers);
    const v = (k) => $(`[data-bambu="${k}-${i}"]`).value.trim();
    Object.assign(list[i], { bambu_ip: v('ip'), bambu_serial: v('serial') });
    if (v('code')) list[i].bambu_code = v('code');
    if (!list[i].bambu_ip || !list[i].bambu_serial || (!v('code') && !list[i].bambu_code_set)) return toast('IP, seri numarası ve erişim kodu gerekli', { bad: true });
    await savePrinters(list); toast('Bambu bağlantısı kaydedildi, bağlanılıyor…');
    setTimeout(() => { loadBambu().then(() => route() === 'ayarlar' && render()); }, 4000);
  },
  'bambu-remove': async (el) => { const i = +el.dataset.i, list = structuredClone(S.settings.printers); Object.assign(list[i], { bambu_ip: '', bambu_serial: '', mr_url: '', sdcp_ip: '' }); delete (S.connEdit ||= {})[i]; await savePrinters(list); toast('Yazıcı bağlantısı kaldırıldı'); },
  'conn-save': async (el) => {
    const i = +el.dataset.i, list = structuredClone(S.settings.printers), type = S.connEdit?.[i] ?? linkType(list[i]);
    const val = (sel) => ($(sel)?.value || '').trim();
    Object.assign(list[i], { bambu_ip: '', bambu_serial: '', mr_url: '', sdcp_ip: '' });
    if (type === 'bambu') {
      Object.assign(list[i], { bambu_ip: val(`[data-bambu="ip-${i}"]`), bambu_serial: val(`[data-bambu="serial-${i}"]`) });
      if (val(`[data-bambu="code-${i}"]`)) list[i].bambu_code = val(`[data-bambu="code-${i}"]`);
      if (!list[i].bambu_ip || !list[i].bambu_serial || (!list[i].bambu_code && !S.settings.printers[i].bambu_code_set)) return toast('IP, seri numarası ve erişim kodu gerekli', { bad: true });
    } else if (type === 'moonraker') {
      list[i].mr_url = val(`[data-mr="url-${i}"]`); if (val(`[data-mr="key-${i}"]`)) list[i].mr_key = val(`[data-mr="key-${i}"]`);
      if (!list[i].mr_url) return toast('Moonraker adresini girin', { bad: true });
    } else if (type === 'elegoo') {
      list[i].sdcp_ip = val(`[data-el="ip-${i}"]`); if (!list[i].sdcp_ip) return toast('IP adresini girin', { bad: true });
    }
    delete (S.connEdit ||= {})[i];
    await savePrinters(list); toast(type ? `${LINK_NAMES[type]} bağlantısı kaydedildi, bağlanılıyor…` : 'Bağlantı kapatıldı');
    setTimeout(() => { loadBambu().then(() => route() === 'ayarlar' && render()); }, 4000);
  },
  'el-test': async (el) => {
    const i = +el.dataset.i, ip = ($(`[data-el="ip-${i}"]`)?.value || '').trim();
    if (!ip) return toast('IP adresini girin', { bad: true });
    el.disabled = true; el.textContent = 'Deneniyor… (15 sn kadar)';
    try { (S.elTest ||= {})[i] = await api('POST', '/api/printers/elegoo-test', { ip }); (S.connEdit ||= {})[i] = 'elegoo'; render(); } catch (e) { fail(e); el.disabled = false; el.textContent = 'Bağlantıyı test et'; }
  },
  'el-copy': (el) => { const t = JSON.stringify(S.elTest?.[+el.dataset.i] || {}, null, 2); navigator.clipboard?.writeText(t).then(() => toast('Kopyalandı; mesajla gönderebilirsiniz'), () => toast('Kopyalanamadı', { bad: true })); },
  'logo-pick': () => { const i = $('#logo-in'); i.value = ''; i.click(); },
  'logo-rm': async () => { try { S.settings = await api('PUT', '/api/settings', { app_logo: '' }); applyBrand(); render(); } catch (e) { fail(e); } },
  'brand-save': async () => { try { S.settings = await api('PUT', '/api/settings', { app_name: $('#app-name').value, app_tagline: $('#app-tag').value }); applyBrand(); toast('Kaydedildi'); render(); } catch (e) { fail(e); } },
  'cat-add': () => {
    const v = $('#new-cat').value.trim(); if (!v) return;
    $('#cat-list').insertAdjacentHTML('beforeend', `<div class="cat-row" data-old=""><input class="input" data-cat-name value="${esc(v)}" aria-label="Kategori adı">
      <label class="switch sm"><input type="checkbox" data-cat-nomat> Filament seçilmez</label><label class="switch sm"><input type="checkbox" data-cat-noparts> Tek parça</label>
      <span class="faint" style="font-size:12.5px">yeni</span><button class="icon-btn" data-act="cat-rm" aria-label="Sil">${icon('trash')}</button></div>`);
    $('#new-cat').value = ''; $('#new-cat').focus();
  },
  'cat-rm': (el) => {
    const row = el.closest('.cat-row'); const n = (S.categories || []).find((c) => c.name === row.dataset.old)?.count || 0;
    if (n && !confirm(`Bu kategoride ${n} ürün var; kategorisiz kalacaklar. Silinsin mi?`)) return;
    row.remove();
  },
  'cat-save': async () => {
    const cats = $$('#cat-list .cat-row').map((r) => ({ name: $('[data-cat-name]', r).value.trim(), old_name: r.dataset.old || null,
      no_materials: $('[data-cat-nomat]', r).checked, no_parts: $('[data-cat-noparts]', r).checked }));
    try { S.categories = await api('PUT', '/api/categories', { categories: cats }); toast('Kategoriler kaydedildi'); await loadProducts(); render(); } catch (e) { fail(e); }
  },
  'res-wait': () => { $('#wait-opts').classList.toggle('hidden'); $('.choice.wait').classList.toggle('on'); },
  'banner-open': (el) => { hideDueBanner(); closeModal(true); openResult(+el.dataset.id); },
  'res-later': (el) => { S.dismissed[+el.dataset.id] = Date.now(); closeModal(true); S.promptOpen = false; },
  'new-order': () => openOrderEditor(),
  'edit-order': (el) => openOrderEditor(+el.dataset.id),
  'save-order': saveOrder,
  'delete-order': async (el) => { if (!confirm(OE?.active_job_id ? 'Siparişin devam eden baskısı da iptal edilecek. Silinsin mi?' : 'Sipariş silinsin mi?')) return; try { await api('DELETE', `/api/orders/${el.dataset.id}`); closeModal(); toast('Sipariş silindi'); render(); } catch (e) { fail(e); } },
  'order-advance': async (el, e) => {
    e.stopPropagation();
    const o = S.orders.find((x) => x.id === +el.dataset.id); const nx = OST[o.status].next;
    if (nx === 'printing') return openNewPrint({ orderId: o.id });
    try {
      await api('PUT', `/api/orders/${o.id}`, { status: nx });
      toast(`${o.first_name}: ${OST[nx].l}`, o.status === 'printing' ? {} : { action: 'Geri al', onAction: async () => { await api('PUT', `/api/orders/${o.id}`, { status: o.status }); render(); } });
      await loadJobs(); render();
    } catch (err) { fail(err); }
  },
  'order-print': (el, e) => { e.stopPropagation(); openNewPrint({ orderId: +el.dataset.id }); },
  'o-due-quick': (el) => { const base = $('#o-odate').value || localToday(); $('#o-due').value = addDays(base, +el.dataset.n); dueHint(); },
  'otab': (el) => { S.ordersTab = el.dataset.v; $$('#otabs button').forEach((b) => b.classList.toggle('on', b === el)); $$('.kcol').forEach((c) => c.classList.toggle('on', c.dataset.col === S.ordersTab)); },
  'scan-qty': (el) => stepInput('#scan-qty', +el.dataset.d),
  'manual-sale': async () => {
    const id = +$('#ms-p').value, q = parseInt($('#ms-q').value) || 1;
    if (!id) return toast('Ürün seçin', { bad: true });
    try { const r = await api('POST', `/api/products/${id}/stock`, { delta: -q, reason: 'sale', ref: $('#ms-ref').value.trim() || null }); toast(`${productById(id).name}: stok ${r.stock}`); $('#ms-ref').value = ''; $('#ms-q').value = 1; await loadProducts(); $('#ms-p').innerHTML = `<option value="">Ürün seçin…</option>` + S.products.map((p) => `<option value="${p.id}">${esc(p.name)} (stok ${p.stock})</option>`).join(''); } catch (e) { fail(e); }
  },
  'ty-save': async () => {
    const body = { ty_seller_id: $('#ty-sid').value, ty_api_key: $('#ty-key').value, ty_interval_min: +$('#ty-int').value || 5, ty_restock_cancel: $('#ty-restock').checked, ty_enabled: $('#ty-en').checked };
    if ($('#ty-since').value) body.ty_since = new Date($('#ty-since').value).getTime();
    if ($('#ty-sec').value) body.ty_api_secret = $('#ty-sec').value;
    try { S.settings = await api('PUT', '/api/settings', body); toast('Trendyol ayarları kaydedildi'); render(); } catch (e) { fail(e); }
  },
  'ty-test': async (el) => {
    el.disabled = true;
    try { await ACTIONS['ty-save-silent'](); const r = await api('POST', '/api/trendyol/test'); toast(`Bağlantı tamam. Son 3 günde ${r.orders_last_3_days} sipariş paketi var.`); } catch (e) { fail(e); } finally { el.disabled = false; }
  },
  'ty-save-silent': async () => {
    const body = { ty_seller_id: $('#ty-sid').value, ty_api_key: $('#ty-key').value };
    if ($('#ty-sec').value) body.ty_api_secret = $('#ty-sec').value;
    S.settings = await api('PUT', '/api/settings', body);
  },
  'ty-sync': async (el) => {
    el.disabled = true;
    try { const r = await api('POST', '/api/trendyol/sync'); if (r.busy) toast('Kontrol zaten sürüyor'); else toast(`${r.packages} paket kontrol edildi · ${r.deducted} adet düşüldü${r.unmatched ? ` · ${r.unmatched} eşleşmeyen` : ''}`); render(); } catch (e) { fail(e); render(); }
  },
  'ty-match': async (el) => {
    const k = el.dataset.k; const sel = $$('[data-um]').find((s) => s.dataset.um === k); const pid = +sel.value;
    if (!pid) return toast('Önce ürünü seçin', { bad: true });
    try { const r = await api('POST', `/api/trendyol/lines/${encodeURIComponent(k)}/match`, { product_id: pid, save_barcode: true }); toast(r.deducted ? `Eşleştirildi, ${r.deducted} adet stoktan düştü (paketlenmiş)` : 'Eşleştirildi; paketlenince stoktan düşecek'); render(); } catch (e) { fail(e); }
  },
  'ty-open': () => openTyImport(),
  'ty-diag': () => openTyDiag(),
  'diag-copy': async () => {
    try { await navigator.clipboard.writeText(S.diagText); toast('Çıktı kopyalandı'); }
    catch { const r = document.createRange(); r.selectNodeContents($('.diag-pre')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Metin seçildi; Ctrl+C ile kopyalayın'); }
  },
  'pick-refresh': () => loadPick(true),
  'res-ignore': async (el) => { const id = +el.dataset.id; const n = S.notif?.items.find((x) => x.action?.t === 'job' && x.action.id === id && !x.resolved_at); S.promptOpen = false; if (await ignoreJob(id, n?.id)) closeModal(true); },
  'fin-tab': async (el) => { S.finTab = el.dataset.v; if (S.finTab === 'tx' && !S.finTx?.data) { try { await loadFinTx(); } catch (e) { fail(e); } } render(); },
  'fin-inv-f': (el) => { S.finInvF = el.dataset.v; $('#fin-body').innerHTML = finInvHTML(); },
  'fin-page': async (el) => { S.finTx.page = Math.max(0, S.finTx.page + +el.dataset.d); try { await loadFinTx(); $('#fin-tx-res').innerHTML = finTxRows(); } catch (e) { fail(e); } },
  'fin-sync': async (el) => { el.disabled = true; try { await api('POST', '/api/finance/sync'); await loadFin(); render(); } catch (e) { fail(e); el.disabled = false; } },
  'lp-save': async () => {
    const mode = $('#lp-mode button.on')?.dataset.v || 'browser';
    try { S.labelCfg = await api('PUT', '/api/label/settings', { mode, share: $('#lp-share').value.trim(), host: $('#lp-host').value.trim(), ...($('#lp-user') ? { smb_user: $('#lp-user').value.trim(), smb_pass: $('#lp-pass').value } : {}), ip: $('#lp-ip').value.trim(), port: +$('#lp-port').value || 9100, auto: $('#lp-auto').checked });
      toast('Etiket yazıcısı kaydedildi'); } catch (e) { fail(e); }
  },
  'lp-test': async (el) => {
    const mode = $('#lp-mode button.on')?.dataset.v || 'browser';
    if (mode === 'browser') return printLabelPages([{ tracking: '7330000000000000', provider: 'Trendyol Express', name: 'Deneme Alıcı', address: 'Örnek Mahallesi Deneme Sokak No:1 Daire:2', neighborhood: 'Örnek Mah', district: 'Beykoz', city: 'İstanbul', order_number: '10000000000', boxes: 1 }]);
    el.disabled = true; try { await api('POST', '/api/label/test'); toast('Deneme etiketi yazıcıya gönderildi'); } catch (e) { fail(e); } finally { el.disabled = false; } },
  'ty-label': (el) => tyLabel([el.dataset.id], el),
  'ty-label-all': (el) => { const ids = tyoFiltered().filter((p) => p.can_label && !p.label_at).map((p) => p.package_id); if (ids.length) tyLabel(ids, el); },
  'wk-save': async () => {
    const on = $('#wk-on').checked, t = $('#wk-time').value || '09:00';
    try { S.settings = await api('PUT', '/api/settings', { weekly_at: on ? `${$('#wk-day').value} ${t}` : 'off' }); toast(on ? `Haftalık özet: her ${WEEK_DAYS[+$('#wk-day').value - 1]} ${t}` : 'Haftalık özet kapatıldı'); } catch (e) { fail(e); }
  },
  'dead-days': (el) => { try { localStorage.setItem('deadDays', el.dataset.v); } catch {} render(); },
  'dead-all': () => { S.deadAll = !S.deadAll; render(); },
  'bk-make': async (el) => {
    el.disabled = true;
    try { const r = await api('POST', '/api/backups'); S.backups = r; toast(r.made?.extra_error ? 'Yedek alındı; ek klasöre kopyalanamadı' : 'Yedek alındı', r.made?.extra_error ? { bad: true } : undefined); backupRefresh(); }
    catch (e) { fail(e); } finally { el.disabled = false; }
  },
  'bk-dir': async () => {
    try { S.backups = await api('PUT', '/api/backups/settings', { dir: $('#bk-dir').value.trim() }); toast(S.backups.dir ? 'Ek klasör kaydedildi; bir sonraki yedekten itibaren kopyalanır' : 'Ek klasör kaldırıldı'); backupRefresh(); } catch (e) { fail(e); }
  },
  'bk-restore': async (el) => {
    const when = new Date(+el.dataset.at * 1000).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
    if (!confirm(`${when} tarihli yedeğe dönülsün mü?\n\nO tarihten sonraki ürün, stok, baskı ve sipariş değişiklikleri kaybolur. Şu anki veriler önce ayrı bir yedeğe ("Geri yükleme öncesi") alınır; gerekirse ona geri dönebilirsiniz.`)) return;
    try { await api('POST', '/api/backups/restore', { name: el.dataset.name }); toast('Yedek geri yüklendi, sayfa yenileniyor'); setTimeout(() => location.reload(), 900); } catch (e) { fail(e); }
  },
  'h-sel': (el) => { (S.hsel ||= new Set()); const id = +el.dataset.id; if (el.checked) S.hsel.add(id); else S.hsel.delete(id); histSelSync(); },
  'h-selall': (el) => { S.hsel = new Set(el.checked ? (S.hp?.items || []).map((j) => j.id) : []); $$('#hist-sec .hchk[data-id]').forEach((c) => { c.checked = el.checked; }); histSelSync(); },
  'h-clear': () => { S.hsel = new Set(); $$('#hist-sec .hchk').forEach((c) => { c.checked = false; }); histSelSync(); },
  'h-page': async (el) => { const n = histSize(); S.hOff = Math.max(0, (S.hOff || 0) + (+el.dataset.d) * n); S.hsel = new Set(); try { await histReload(); } catch (e) { fail(e); } },
  'h-del': async () => {
    const ids = [...(S.hsel || [])]; if (!ids.length) return;
    if (!confirm(`${ids.length} baskı geçmişten tamamen silinsin mi?\n\nİstatistiklerden de düşer. Stok ve makara kalanları değişmez. Geri alınamaz.`)) return;
    try { const r = await api('POST', '/api/jobs/delete', { ids }); S.hsel = new Set(); toast(`${r.deleted} baskı silindi`); await histReload(); } catch (e) { fail(e); }
  },
  'pick-stock': async (el) => {
    const id = +el.dataset.id, d = +el.dataset.d;
    try {
      const r = await api('POST', `/api/products/${id}/stock`, { delta: d, reason: 'adjust', note: 'Hazırla sayfasından' });
      (S.pick?.items || []).forEach((i) => { if (i.product_id === id) { i.on_shelf = (i.on_shelf ?? 0) + d; i.shortage = Math.max(0, i.quantity - i.on_shelf); } });
      const p = productById(id); if (p) p.stock = r.stock;
      toast(`${p?.name || 'Ürün'}: stok ${r.stock}`); fillPick();
    } catch (e) { fail(e); }
  },
  'pick-match': async (el) => {
    const code = el.dataset.code; const sel = $$('[data-pick-match]').find((x) => x.dataset.pickMatch === code);
    if (!sel?.value) return toast('Önce ürünü seçin', { bad: true });
    el.disabled = true;
    try {
      const r = await api('POST', `/api/products/${sel.value}/barcode`, { code });
      toast(`Barkod ${productById(+sel.value)?.name || 'ürüne'} kaydedildi${r.deducted ? ` · paketlenmiş ${r.deducted} adet stoktan düştü` : ''}`);
      await loadProducts(); await loadPick(true);
    } catch (e) { fail(e); el.disabled = false; }
  },
  'pick-print': () => { $$('.pick-item').forEach((d) => { d.open = true; }); window.print(); },
  'pick-filter': (el) => { S.pickFilter = el.dataset.v; $$('#pick-filter .chip').forEach((c) => c.classList.toggle('on', c === el)); $('#pick-list').innerHTML = pickListHTML(); },
  'ty-open-import': () => tyImport(),
  'ty-ignore': async (el) => { try { await api('POST', `/api/trendyol/lines/${encodeURIComponent(el.dataset.k)}/ignore`); render(); } catch (e) { fail(e); } },
  'notify-perm': async () => { await Notification.requestPermission(); render(); },
  'notify-test': () => { beep(); if ('Notification' in window && Notification.permission === 'granted') new Notification(appName(), { body: 'Baskı bittiğinde böyle bir bildirim gelecek.', icon: '/static/icon.svg' }); else toast('Uyarı sesi böyle çalacak'); },
  'add-printer': () => { const v = $('#new-printer').value.trim(); if (!v) return; savePrinters([...(S.settings.printers || []), { name: v }]); },
  'printer-photo': (el) => { const inp = $('#printer-photo-in'); inp.dataset.i = el.dataset.i; inp.value = ''; inp.click(); },
  'printer-photo-rm': (el) => { const list = structuredClone(S.settings.printers); list[+el.dataset.i].image = null; savePrinters(list); },
  'rm-printer': (el) => savePrinters((S.settings.printers || []).filter((_, i) => i !== +el.dataset.i)),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const link = e.target.closest('a[href]'); if (link && link !== el && el.contains(link)) return;   // satır içindeki bağlantı kendi işini yapsın
  const fn = ACTIONS[el.dataset.act];
  if (fn) { if (el.tagName === 'A' || (el.tagName === 'BUTTON' && el.closest('summary'))) e.preventDefault(); fn(el, e); }
});
$('#new-print-top').onclick = () => openNewPrint();
$('#new-print-fab').onclick = () => openNewPrint();

// ================================================================== ÜRETİM PLANI
const PLAN_KIND = { ty: ['Trendyol eksik', 'bad'], order: ['Özel sipariş', 'order'], min: ['En az stok altı', 'warn'], forecast: ['Yakında biter', 'mute'] };
async function loadPlan() { S.plan = await api('GET', '/api/plan'); return S.plan; }
PAGES.plan = {
  async load() { await Promise.all([loadPlan(), S.products.length ? null : loadProducts(), S.settings ? null : loadSettings(), loadOrders()]); },
  html() {
    const d = S.plan; if (!d) return '';
    const byP = {}; d.items.forEach((it) => { (byP[it.printer || ''] ||= []).push(it); });
    const days = d.days;
    const pcard = (p) => {
      const q = byP[p.name] || [];
      const cur = p.busy.filter((j) => !j.due);
      return `<section class="panel plan-p${p.idle ? ' idle' : ''}"><div class="panel-h"><h2 class="pr-inline">${printerThumb(p.name, 'sm')}${esc(p.name)}</h2>
          <span class="plan-st ${p.idle ? 'ok' : ''}">${p.idle ? (p.busy.length ? 'boşta · sonuç bekliyor' : 'şu an boşta') : `${fmtClock(p.free_at)}'de boşalır`}</span></div>
        <div class="panel-b">${cur.map((j) => `<div class="plan-cur">${icon('layers')}<span><b>${esc(j.name)}</b> ×${j.quantity} basılıyor · ${fmtDur((j.ends_at - nowS()) / 60)} kaldı</span></div>`).join('')}
          ${q.length ? `<ol class="plan-q">${q.map((it, i) => planItem(it, i === 0 && p.idle)).join('')}</ol>` : `<p class="muted" style="margin:6px 0 0">Bu makine için önerilecek iş yok.</p>`}</div></section>`;
    };
    const unassigned = byP[''] || [];
    const f = d.filament, short = f.filter((x) => x.short > 0);
    return `<div class="toolbar plan-tools">
        <span class="muted">Öncelik: Trendyol'da eksik → özel sipariş → en az stok altı → satış hızına göre yakında bitecek. Stok hedefi:</span>
        <div class="seg" id="plan-days">${[7, 14, 30].map((v) => `<button data-v="${v}" class="${days === v ? 'on' : ''}">${v} gün</button>`).join('')}</div>
        <span class="spacer"></span><button class="btn" data-act="plan-refresh">${icon('refresh')} Yenile</button></div>
      ${d.items.length ? '' : `<div class="empty panel"><h3>Basılması gereken bir şey yok</h3><p>Siparişler karşılanıyor ve stoklar ${days} günlük satışa yetiyor.</p></div>`}
      ${(() => { const others = d.printers.filter((p) => !(byP[p.name] || []).length); return others.length && U('sec.plan.others') ? `<div class="plan-others"><span class="muted">Önerilecek işi olmayan makineler:</span>${others.map((p) => `<span class="plan-chip${p.idle ? ' ok' : ''}">${printerThumb(p.name, 'xs')}${esc(p.name)} <small>${p.idle ? 'boşta' : `${fmtClock(p.free_at)}'de boşalır`}</small></span>`).join('')}</div>` : ''; })()}
      <div class="plan-grid">${d.printers.filter((p) => (byP[p.name] || []).length).map(pcard).join('')}</div>
      ${unassigned.length ? `<section class="panel"><div class="panel-h"><h2>Uygun makine yok</h2><span class="muted" style="font-size:13px">Ayarlar → Makineler'de makine türünü (FDM / reçine) kontrol edin</span></div><div class="panel-b"><ol class="plan-q">${unassigned.map((it) => planItem(it, false)).join('')}</ol></div></section>` : ''}
      <div class="two-col">
        ${!U('sec.plan.filament') ? '' : `<section class="panel"><div class="panel-h"><h2>Filament ihtiyacı</h2><span class="muted" style="font-size:13px">plandaki işler için</span></div><div class="panel-b">
          ${f.length ? `<table class="tbl"><thead><tr><th>Renk</th><th class="num">Gerekli</th><th class="num">Elde</th><th class="num">Eksik</th></tr></thead><tbody>
            ${f.map((x) => `<tr><td><span class="pr-inline"><span class="spool${swatchCls(x.hex)}" style="${swatchStyle(x.hex)}"></span>${esc(x.name || colorName(x.hex) || x.hex)} <span class="faint">${esc(x.materials.join(', '))}</span></span></td>
              <td class="num">${fmtKg(x.need)}</td><td class="num">${fmtKg(x.have)}</td><td class="num">${x.short ? `<b class="bad-text">${fmtKg(x.short)}</b>` : '<span class="ok-text">yeter</span>'}</td></tr>`).join('')}</tbody></table>
            ${short.length ? `<p class="plan-buy">${icon('cart')} Alınması gerekenler: ${short.map((x) => `<b>${esc(x.name || colorName(x.hex) || x.hex)}</b> (en az ${fmtKg(x.short)})`).join(', ')}</p>` : ''}`
            : '<p class="muted" style="margin:0">Plandaki işler için gram bilgisi yok.</p>'}</div></section>`}
        ${!U('sec.plan.spools') ? '' : `<section class="panel"><div class="panel-h"><h2>Azalan makaralar</h2><a class="muted" href="#/filament" style="font-size:13px">Filamentler</a></div><div class="panel-b">
          ${d.low_spools.length ? `<ul class="lst">${d.low_spools.map((x) => `<li>${spoolChip(x)}<div class="grow"><div class="s">${esc([x.brand, x.material].filter(Boolean).join(' · '))}</div></div><b class="warn-text">${Math.round(x.remaining)} g</b></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">150 g altında makara yok.</p>'}</div></section>`}
      </div>`;
  },
  after() {
    $('#plan-days')?.addEventListener('click', async (e) => { const b = e.target.closest('button'); if (!b) return; try { S.settings = await api('PUT', '/api/settings', { plan_days: +b.dataset.v }); await loadPlan(); render(); } catch (err) { fail(err); } });
  },
};
function planItem(it, primary) {
  const [kl, kc] = PLAN_KIND[it.kind];
  const sub = [it.reason, it.minutes ? fmtDur(it.minutes) : 'süre girilmemiş', it.grams ? fmtGram(it.grams) : ''].filter(Boolean).join(' · ');
  const when = it.start ? `${it.start <= nowS() + 60 ? 'şimdi' : fmtClock(it.start)} → ${fmtClock(it.end)}` : '';
  const dl = it.deadline && (it.kind === 'ty' || it.kind === 'order') ? dlChip(it.deadline) : '';
  return `<li class="plan-it${it.late ? ' late' : ''}">${miniThumb(it.thumbnail)}
    <div class="grow"><div class="t">${it.product_id ? `<a class="pd-link" href="#/urun?id=${it.product_id}">${esc(it.name)}</a>` : esc(it.name)} <span class="muted">×${it.qty}${it.has_parts ? ' set' : ''}</span> <span class="tag tag-${kc}">${kl}</span>${dl}</div>
      <div class="s">${esc(sub)}</div>
      ${it.filament_short?.length ? `<div class="s warn-text">Filament yetmeyebilir: ${esc(it.filament_short.join(', '))}</div>` : ''}${it.late ? '<div class="s bad-text">Son teslime yetişmeyebilir</div>' : ''}</div>
    <div class="plan-when"><small>${when}</small><button class="btn btn-sm${primary ? ' btn-primary' : ''}" data-act="plan-start" data-key="${esc(it.key)}">${icon('layers')} Bas</button></div></li>`;
}
async function planStart(a) {
  if (a.oid) await openNewPrint({ orderId: a.oid }); else if (a.pid) await openNewPrint(a.pid); else return;
  if (!NP) return;
  if (a.printer) npSetPrinter(a.printer);
  if (a.qty && NP.mode === 'product' && !NP.parts) { $('#np-qty').value = a.qty; npAutoTime(); npEnds(); }
}
function planDashHTML() {
  const d = S.plan; if (!d || !d.items.length) return '';
  const idle = d.printers.filter((p) => p.idle);
  const next = idle.map((p) => ({ p, it: d.items.find((x) => x.printer === p.name) })).filter((x) => x.it).slice(0, 4);
  const rest = d.items.filter((x) => !next.some((n) => n.it === x)).slice(0, Math.max(0, 5 - next.length));
  return `<section class="panel"><div class="panel-h"><h2>Plan: sıradaki baskılar</h2><a class="muted" href="#/plan" style="font-size:13px">Tüm plan (${d.items.length})</a></div><div class="panel-b">
    ${next.length ? `<div class="plan-next">${next.map(({ p, it }) => `<div class="pn">${printerThumb(p.name, 'sm')}<div class="grow"><small class="ok-text">${esc(p.name)} boşta</small><div class="t">${esc(it.name)} <span class="muted">×${it.qty}</span></div><div class="s">${esc(it.reason)}${it.minutes ? ' · ' + fmtDur(it.minutes) : ''}</div></div><button class="btn btn-sm btn-primary" data-act="plan-start" data-key="${esc(it.key)}">Bas</button></div>`).join('')}</div>` : ''}
    ${rest.length ? `<ol class="plan-q">${rest.map((it) => planItem(it, false)).join('')}</ol>` : ''}</div></section>`;
}

// ================================================================== ÜRÜN SAYFASI
const hashQ = () => new URLSearchParams(location.hash.split('?')[1] || '');
PAGES.urun = {
  title: () => productById(+hashQ().get('id'))?.name || 'Ürün',
  async load() {
    const id = +hashQ().get('id');
    await Promise.all([S.products.length ? null : loadProducts(), loadProfit().catch(() => null), loadCategories(), S.components ? null : loadComponents(),
      api('GET', `/api/products/${id}/detail`).then((d) => { S.pd = d; })]);
  },
  html() {
    const d = S.pd; if (!d) return '<p class="muted">Ürün bulunamadı.</p>';
    const p = productById(d.product.id) || d.product, st = d.stats;
    const daily = st.sold_30 / 30, daysLeft = daily > 0 ? Math.floor(p.stock / daily) : null;
    const fire = st.planned_90 ? 1 - st.good_90 / st.planned_90 : null;
    const pr = S.profit ? productProfit(p) : null;
    const tile = (v, l, cls = '') => `<div class="${cls}"><b>${v}</b><span>${l}</span></div>`;
    const ST = { success: ['Başarılı', 'ok'], partial: ['Kısmen', 'warn'], failed: ['Başarısız', 'bad'], cancelled: ['İptal', 'mute'], printing: ['Baskıda', 'warn'] };
    const ty = d.ty, bb = d.buybox;
    return `<div class="pd">
      <div class="pd-head panel">
        <div class="pd-img${p.thumbnail ? '' : ' none'}" style="${thumbStyle(p.thumbnail)}" data-zoom></div>
        <div class="pd-info">
          <div class="pd-tags">${p.category ? `<span class="tag tag-mute">${esc(p.category)}</span>` : ''}<span class="tag tag-${p.print_type}">${p.print_type}</span>${p.set_size > 1 ? `<span class="tag tag-mute">${p.set_size}'lü set</span>` : ''}${p.parts?.length ? `<span class="tag tag-mute">${p.parts_total} parça</span>` : ''}${p.archived ? '<span class="tag tag-bad">Arşivde</span>' : ''}</div>
          <h2>${esc(p.name)}</h2>
          <div class="pd-meta">${spools(p.materials, 6)}${p.file_name ? `<span class="muted">${icon('file')} ${esc(p.file_name)}</span>` : ''}${p.barcodes ? `<span class="muted">${icon('barcode')} ${esc(p.barcodes)}</span>` : ''}</div>
          <div class="pd-stock"><div><b class="${stockClass(p) ? 'warn-text' : ''}">${p.stock}</b><span>stokta${p.min_stock ? ` · en az ${p.min_stock}` : ''}</span></div>${p.in_production ? `<div><b>+${p.in_production}</b><span>baskıda</span></div>` : ''}
            <div class="qbtns"><button class="minus" data-act="pd-stock" data-id="${p.id}" data-d="-1" aria-label="Stoktan 1 düş">${icon('minus')}</button><button data-act="pd-stock" data-id="${p.id}" data-d="1" aria-label="Stoğa 1 ekle">${icon('plus')}</button></div></div>
          ${(() => { const fc = stockForecast(p); return fc.suggested != null && fc.suggested !== (p.min_stock || 0) ? `<div class="pd-sugg" data-uisec="sec.urun.sugg">${icon('chart')} <span>Satış hızına göre önerilen en az stok: <b>${fc.suggested}</b> <small class="muted">(${planDays()} günlük satış · şu an ${p.min_stock || 0})</small></span><button class="btn btn-sm" data-act="pd-min" data-id="${p.id}" data-v="${fc.suggested}">Uygula</button></div>` : ''; })()}
          <div class="pd-actions"><button class="btn btn-primary" data-act="print-product" data-id="${p.id}">${icon('layers')} Bas</button><button class="btn" data-act="edit-product" data-id="${p.id}">${icon('edit')} Düzenle</button>${ty?.url ? `<a class="btn btn-ghost" href="${esc(ty.url)}" target="_blank" rel="noopener">Trendyol'da aç</a>` : ''}</div>
        </div>
      </div>
      <div class="readout pd-tiles" data-uisec="sec.urun.tiles">
        ${tile(st.sold_7, '7 günde satılan')}${tile(st.sold_30, '30 günde satılan')}
        ${tile(daysLeft == null ? '–' : daysLeft > 365 ? '365+' : daysLeft, daysLeft == null ? 'stok yeter (satış yok)' : 'gün stok yeter', daysLeft != null && daysLeft < 7 ? 'neg' : '')}
        ${tile(st.good_90, '90 günde basılan (sağlam)')}${tile(fire == null ? '–' : fmtPct(fire), `fire · ${st.jobs_90} baskı`, fire > 0.1 ? 'neg' : '')}
        ${tile(pr?.r ? fmtTL(pr.r.profit) : '–', pr?.r ? `adet başı kâr · ${fmtPct(pr.r.margin)}` : 'fiyat girilmemiş')}
      </div>
      <section class="panel" data-uisec="sec.urun.chart"><div class="panel-h"><h2>Son 12 hafta</h2><div class="pd-legend"><span><i class="lg-sold"></i>Satılan</span><span><i class="lg-printed"></i>Basılan</span></div></div>
        <div class="panel-b">${pdChart(d.weeks)}</div></section>
      <div class="two-col">
        <section class="panel" data-uisec="sec.urun.profit"><div class="panel-h"><h2>Kâr</h2>${pr?.r ? `<span class="mg ${marginCls(pr.r.margin)}">${fmtPct(pr.r.margin)}</span>` : ''}</div><div class="panel-b">
          ${pr?.r ? breakdownHTML(pr.r, pr.mc) : '<p class="muted" style="margin:0">Satış fiyatı girilince kâr burada hesaplanır.</p>'}</div></section>
        <section class="panel" data-uisec="sec.urun.ty"><div class="panel-h"><h2>Trendyol</h2></div><div class="panel-b">${ty ? `<dl class="pd-kv">
          <dt>Satış fiyatı</dt><dd>${fmtTL(ty.sale_price)}${ty.list_price && ty.list_price > ty.sale_price ? ` <s class="muted">${fmtTL(ty.list_price)}</s>` : ''}</dd>
          <dt>Komisyon</dt><dd>${ty.commission != null ? '%' + String(ty.commission).replace('.', ',') : '–'}</dd>
          <dt>90 günde sipariş</dt><dd>${d.ty_orders.qty} adet · ${d.ty_orders.lines} satır${d.ty_orders.avg_price ? ` · ort. ${fmtTL(d.ty_orders.avg_price)}` : ''}</dd>
          <dt>Buybox</dt><dd>${!bb ? '<span class="muted">kontrol edilmedi</span>' : !bb.multi && bb.buybox_order === 1 ? 'tek satıcı' : bb.buybox_order === 1 ? '<span class="ok-text">bizde</span>' : `<span class="bad-text">${bb.buybox_order}. sıradayız · buybox ${fmtTL(bb.buybox_price)}</span>`}${bb?.multi ? ` <a href="#/buybox" class="muted">ayrıntı</a>` : ''}</dd>
          <dt>Barkod</dt><dd>${esc(ty.barcode)}</dd></dl>` : '<p class="muted" style="margin:0">Trendyol ürünüyle eşleşmiyor (barkod alanını kontrol edin).</p>'}</div></section>
      </div>
      <div class="two-col">
        <section class="panel" data-uisec="sec.urun.jobs"><div class="panel-h"><h2>Baskı geçmişi</h2><span class="muted" style="font-size:13px">${st.avg_job_min ? `ortalama ${fmtDur(st.avg_job_min)}` : ''}</span></div><div class="panel-b">
          ${d.jobs.length ? `<ul class="lst pd-scroll">${d.jobs.map((j) => `<li><div class="grow"><div class="t">${j.quantity} ${j.parts?.length ? 'parça' : 'adet'}${j.status !== 'printing' ? ` · ${j.good_quantity ?? 0} sağlam` : ''}</div>
            <div class="s">${j.printer ? esc(j.printer) + ' · ' : ''}${fmtWhen(j.finished_at || j.started_at)}${j.finished_at ? ` · ${fmtDur((j.finished_at - j.started_at) / 60)}` : ''}</div></div>
            <span class="tag tag-${ST[j.status]?.[1] || 'mute'}">${ST[j.status]?.[0] || j.status}</span>${j.status !== 'printing' ? `<button class="icon-btn" data-act="reprint" data-id="${j.id}" title="Aynısını tekrar bas" aria-label="Aynısını tekrar bas">${icon('refresh')}</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Henüz baskı yok.</p>'}</div></section>
        <section class="panel" data-uisec="sec.urun.log"><div class="panel-h"><h2>Stok hareketleri</h2></div><div class="panel-b">
          ${d.log.length ? `<ul class="lst pd-scroll">${d.log.map((l) => `<li><div class="grow"><div class="t">${REASONS[l.reason] || l.reason}${l.ref ? ` · <span class="muted">${esc(l.ref)}</span>` : ''}</div>
            <div class="s">${fmtWhen(l.created_at)}${l.note ? ' · ' + esc(l.note) : ''} · sonra ${l.stock_after}</div></div>
            <span class="delta ${l.delta > 0 ? 'up' : 'down'}">${l.delta > 0 ? '+' : ''}${l.delta}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Hareket yok.</p>'}</div></section>
      </div></div>`;
  },
};
// Haftalık satılan / basılan: aynı birim (adet), tek eksen, yan yana ince çubuklar; üstüne gelince değerler
function pdChart(weeks) {
  const mx = Math.max(1, ...weeks.map((w) => Math.max(w.sold, w.printed)));
  const nice = (v) => { const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
  const top = nice(mx), grid = [top, top / 2, 0];
  return `<div class="pd-chart" role="img" aria-label="Son 12 haftada haftalık satılan ve basılan adet">
    <div class="pd-y">${grid.map((g) => `<span>${g}</span>`).join('')}</div>
    <div class="pd-plot">${grid.map((g) => `<i class="pd-grid" style="bottom:calc(22px + (100% - 22px) * ${g / top})"></i>`).join('')}
      ${weeks.map((w, i) => `<div class="pd-col${i === weeks.length - 1 ? ' cur' : ''}" tabindex="0" data-tip="${w.label} haftası · satılan ${w.sold} · basılan ${w.printed}">
        <div class="pd-bars"><i class="b-sold" style="height:${(w.sold / top) * 100}%"></i><i class="b-printed" style="height:${(w.printed / top) * 100}%"></i></div>
        <span class="pd-x">${w.label}</span><div class="pd-tip"><b>${w.label} haftası${i === weeks.length - 1 ? ' (bu hafta)' : ''}</b><span><i class="lg-sold"></i>Satılan ${w.sold}</span><span><i class="lg-printed"></i>Basılan ${w.printed}</span></div></div>`).join('')}
    </div></div>
    <details class="pd-table"><summary>Tablo olarak göster</summary><table class="tbl"><thead><tr><th>Hafta</th><th class="num">Satılan</th><th class="num">Basılan</th></tr></thead><tbody>
      ${weeks.map((w) => `<tr><td>${w.label}</td><td class="num">${w.sold}</td><td class="num">${w.printed}</td></tr>`).join('')}</tbody></table></details>`;
}

// ================================================================== BUYBOX
const BB_ST = { cheaper: ['Rakip daha ucuz', 'bad'], other: ['Buybox başkasında', 'warn'], win: ['Buybox bizde', 'ok'] };
PAGES.buybox = {
  async load() { await Promise.all([api('GET', '/api/trendyol/buybox').then((d) => { S.bb = d; }), loadProfit().catch(() => null), S.products.length ? null : loadProducts(), loadCategories()]); },
  html() {
    const d = S.bb || { items: [] };
    if (!d.configured) return `<div class="empty panel"><h3>Trendyol bağlı değil</h3><p>Buybox takibi için Satış sayfasından Trendyol API bilgilerini girin ve otomatik takibi açın.</p><a class="btn btn-primary" href="#/satis">Satış sayfasına git</a></div>`;
    const n = { all: d.items.length, cheaper: 0, other: 0, win: 0 };
    d.items.forEach((x) => n[x.status]++);
    const f = S.bbf && n[S.bbf] ? S.bbf : 'all';
    const list = d.items.filter((x) => f === 'all' || x.status === f);
    const chip = (v, l) => `<button class="chip${f === v ? ' on' : ''}" data-act="bb-f" data-v="${v}">${l}<span class="n">${n[v]}</span></button>`;
    const status = d.error ? `<span class="dot bad"></span><span>${esc(d.error)}</span>`
      : !d.enabled ? '<span class="dot"></span><span>Trendyol otomatik takibi kapalı; buybox da kontrol edilmiyor. Elle kontrol edebilirsiniz.</span>'
      : d.checked_at ? `<span class="dot ok"></span><span>Son kontrol ${fmtWhen(d.checked_at)} · ${d.every_min} dakikada bir kontrol ediliyor</span>` : '<span class="dot"></span><span>Henüz kontrol edilmedi.</span>';
    return `<div class="toolbar">
        <div class="chips">${chip('all', 'Tümü')}${chip('cheaper', 'Rakip daha ucuz')}${chip('other', 'Buybox başkasında')}${chip('win', 'Buybox bizde')}</div>
        <span class="spacer"></span><button class="btn" data-act="bb-check">${icon('refresh')} Şimdi kontrol et</button></div>
      <div class="ty-status bb-status">${status}</div>
      ${d.items.length ? `<div class="bb-list fitbox">${list.map(bbRow).join('') || '<p class="muted" style="padding:16px">Bu filtrede ürün yok.</p>'}</div>`
        : `<div class="empty panel"><h3>Başka satıcının olduğu ürün yok</h3><p>Trendyol'daki ürünlerinizden birine başka bir satıcı (buybox) girdiğinde burada listelenir: bizim fiyatımız, buybox fiyatı ve 2. / 3. sıradaki fiyatlar. Rakip bizden ucuza buybox'ı alırsa bildirim gelir.</p></div>`}
      <p class="faint" style="font-size:12.5px;margin:10px 2px 0">Trendyol rakip mağazanın adını vermiyor; yalnızca buybox'taki sıramız ve ilk üç sıradaki fiyatlar görünür.</p>`;
  },
};
function bbProfit(x, price) {
  const p = x.product_id ? productById(x.product_id) : null;
  if (!p || !price || !S.profit) return null;
  return productProfit(p, { price }).r;
}
function bbRow(x) {
  const [stLabel, stCls] = BB_ST[x.status];
  const atBB = x.status === 'cheaper' ? bbProfit(x, x.buybox) : null;
  const price = (v, cls = '') => v != null ? `<b class="${cls}">${fmtTL(v)}</b>` : '<span class="faint">–</span>';
  return `<article class="bb-row s-${x.status}" data-act="bb-open" data-bc="${esc(x.barcode)}" tabindex="0">
    <div class="bb-prod">${miniThumb(x.thumbnail)}<div><div class="t">${esc(x.name)}</div><div class="s">${esc(x.barcode)}${x.product_id ? '' : ' · <span class="warn-text">Astera\'da eşleşen ürün yok</span>'}</div></div></div>
    <div class="bb-p"><span>Bizim fiyat</span>${price(x.ours)}${x.order ? `<small>${x.order}. sıradayız</small>` : ''}</div>
    <div class="bb-p"><span>Buybox</span>${price(x.buybox, x.status === 'cheaper' ? 'bad-text' : '')}${x.status === 'cheaper' ? `<small class="bad-text">${fmtTL(x.diff)} ucuz</small>` : x.status === 'win' ? '<small class="ok-text">bizde</small>' : ''}</div>
    <div class="bb-p"><span>2. sıra</span>${price(x.second)}</div>
    <div class="bb-p"><span>3. sıra</span>${price(x.third)}</div>
    <div class="bb-st"><span class="tag tag-${stCls}">${stLabel}</span>${atBB ? `<small>Buybox fiyatına inersen kâr ${fmtTL(atBB.profit)} <span class="mg ${marginCls(atBB.margin)}">${fmtPct(atBB.margin)}</span></small>` : ''}
      ${x.status === 'other' ? '<small>Fiyatın daha düşük ya da eşit; buybox satıcı puanı / teslim süresi gibi nedenlerle rakipte.</small>' : ''}
      <small class="faint">${x.lost_since && x.status !== 'win' ? `kaybedildi: ${fmtWhen(x.lost_since)}` : x.changed_at ? `son değişim: ${fmtWhen(x.changed_at)}` : ''}</small></div>
  </article>`;
}
function openBuybox(bc) {
  const x = (S.bb?.items || []).find((i) => i.barcode === bc); if (!x) return;
  const rows = [['Bizim fiyatımızla', x.ours], ['Buybox fiyatıyla', x.status === 'win' ? null : x.buybox], ['Buybox fiyatının 1 ₺ altıyla', x.status === 'win' ? null : (x.buybox ? Math.max(0, x.buybox - 1) : null)], ['2. sıradaki fiyatla', x.status === 'win' ? x.second : null]]
    .filter(([, v]) => v).map(([l, v]) => { const r = bbProfit(x, v); return `<tr><td>${l}</td><td class="num">${fmtTL(v)}</td><td class="num">${r ? fmtTL(r.profit) : '–'}</td><td class="num">${r ? `<span class="mg ${marginCls(r.margin)}">${fmtPct(r.margin)}</span>` : ''}</td></tr>`; }).join('');
  openModal(`
    <div class="modal-h"><h2>${esc(x.name)}</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">
      <div class="bb-sum">${miniThumb(x.thumbnail)}<div><span class="tag tag-${BB_ST[x.status][1]}">${BB_ST[x.status][0]}</span>
        <p class="muted" style="margin:6px 0 0">Buybox'ta ${x.order || '?'}. sıradayız · barkod ${esc(x.barcode)}${x.title && x.title !== x.name ? `<br><small>${esc(x.title)}</small>` : ''}</p></div></div>
      ${x.product_id ? `<div class="field"><span>Bu fiyatlarda kâr</span><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="num">Fiyat</th><th class="num">Kâr</th><th class="num">Marj</th></tr></thead><tbody>${rows}</tbody></table></div><small>Kâr hesabındaki ayarlarla (komisyon, kargo baremi, malzeme) hesaplanır.</small></div>`
        : '<p class="muted">Bu barkod Astera\'daki bir ürünle eşleşmiyor; kâr hesaplanamıyor. Ürünün barkod alanına ekleyebilirsiniz.</p>'}
      <div class="field"><span>Son değişimler (30 gün)</span>${x.history.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zaman</th><th class="num">Sıramız</th><th class="num">Buybox</th><th class="num">2. sıra</th><th class="num">Bizim</th></tr></thead><tbody>
        ${x.history.map((h) => `<tr><td>${fmtWhen(h.at)}</td><td class="num">${h.order ?? '–'}</td><td class="num">${fmtTL(h.buybox)}</td><td class="num">${h.second ? fmtTL(h.second) : '–'}</td><td class="num">${fmtTL(h.ours)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="margin:0">Henüz değişim kaydı yok.</p>'}</div>
    </div>
    <div class="modal-f">${x.url ? `<a class="btn btn-ghost" href="${esc(x.url)}" target="_blank" rel="noopener">Trendyol'da aç</a>` : ''}${x.product_id ? `<a class="btn" href="#/urun?id=${x.product_id}" onclick="closeModal(true)">Ürün sayfası</a><button class="btn" data-act="bb-edit" data-id="${x.product_id}">Ürünü düzenle</button>` : ''}
      <div class="right"><button class="btn btn-primary" data-act="close">Tamam</button></div></div>`, 'wide');
}

// ================================================================== hızlı arama (Ctrl+K) ve kısayollar
const CK = { open: false, q: '', sel: 0, items: [] };
const CK_ACTIONS = [
  { t: 'Yeni baskı', s: 'N', icon: 'plus', run: () => openNewPrint() },
  { t: 'Toplu sonuç gir', s: 'T', icon: 'check', run: () => openBulkResults(), when: () => dueJobs().length > 0 },
  { t: 'Yeni ürün', icon: 'box', run: () => openProductEditor() },
  { t: 'Yeni özel sipariş', icon: 'clip', run: async () => { if (!S.orders?.length) await loadOrders().catch(() => {}); openOrderEditor(); } },
  { t: 'Diğer amaçlı kayıt ekle', icon: 'plus', run: () => openCompEditor(null, 'misc') },
  { t: 'Buybox şimdi kontrol et', icon: 'crown', run: () => { location.hash = '#/buybox'; setTimeout(() => $('[data-act="bb-check"]')?.click(), 700); } },
  { t: 'Planı yenile', icon: 'plan', run: () => { location.hash = '#/plan'; } },
  { t: 'Kısayolları göster', s: '?', icon: 'more', run: () => openShortcutHelp() },
];
function ckRecent() { try { return JSON.parse(localStorage.getItem('ckRecent') || '[]'); } catch { return []; } }
function ckRemember(key) { try { const r = ckRecent().filter((x) => x !== key); r.unshift(key); localStorage.setItem('ckRecent', JSON.stringify(r.slice(0, 8))); } catch { /* */ } }
function ckScore(text, q) { const t = trLower(text || ''); if (!q) return 1; if (t.startsWith(q)) return 3; if (t.split(/[\s—\-_]+/).some((w) => w.startsWith(q))) return 2; return t.includes(q) ? 1 : 0; }
function ckBuild() {
  const q = trLower(CK.q).trim(), out = [];
  const add = (group, list, limit) => { list.filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, limit).forEach((x) => out.push({ ...x, group })); };
  const pages = [...NAV, { r: 'ayarlar', label: 'Ayarlar', icon: 'gear' }];
  if (!q) {
    const rec = ckRecent();
    rec.forEach((k) => { const [type, id] = k.split(':'); const p = type === 'p' ? productById(+id) : null; if (p) out.push({ group: 'Son açılanlar', key: k, t: p.name, sub: `stok ${p.stock}`, thumb: p.thumbnail, run: () => { location.hash = `#/urun?id=${p.id}`; }, alt: () => openNewPrint(p.id), altLabel: 'Bas' }); });
    CK_ACTIONS.filter((a) => !a.when || a.when()).forEach((a) => out.push({ group: 'İşlemler', ...a }));
    return out;
  }
  add('İşlemler', CK_ACTIONS.filter((a) => !a.when || a.when()).map((a) => ({ ...a, sc: ckScore(a.t, q) })), 4);
  const vis = navVisible();
  add('Sayfalar', pages.map((n) => ({ t: n.label, icon: n.icon, s: vis.indexOf(n) >= 0 && vis.indexOf(n) < 9 ? `Alt ${vis.indexOf(n) + 1}` : '', sc: ckScore(n.label + ' ' + (n.title || ''), q), run: () => { location.hash = `#/${n.r}`; } })), 3);
  add('Ürünler', S.products.map((p) => ({ key: `p:${p.id}`, t: p.name, sub: `${p.category ? p.category + ' · ' : ''}stok ${p.stock}${p.in_production ? ` · +${p.in_production} baskıda` : ''}`, thumb: p.thumbnail,
    sc: Math.max(ckScore(p.name, q) * 2, ckScore(p.barcodes, q), ckScore(p.file_name, q)), run: () => { location.hash = `#/urun?id=${p.id}`; }, alt: () => openNewPrint(p.id), altLabel: 'Bas', alt2: () => openProductEditor(p.id) })), 8);
  add('Baskıda', (S.jobs || []).filter((j) => j.status === 'printing').map((j) => ({ t: `${j.product_name} ×${j.quantity}`, sub: `${j.printer || 'makinesiz'} · ${j.ends_at <= nowS() ? 'sonuç bekliyor' : 'bitiş ' + fmtClock(j.ends_at)}`, thumb: j.thumbnail, sc: ckScore(j.product_name + ' ' + (j.printer || ''), q), run: () => (j.ends_at <= nowS() ? openResult(j.id) : openJobMenu(j.id)) })), 4);
  add('Özel siparişler', (S.orders || []).map((o) => ({ t: `${o.first_name} ${o.last_name || ''}`.trim(), sub: `${o.title || o.details || ''} · ${OST[o.status]?.l || ''}`, thumb: o.image, sc: Math.max(ckScore(`${o.first_name} ${o.last_name || ''}`, q), ckScore(o.title, q), ckScore(o.phone, q)), run: () => openOrderEditor(o.id) })), 4);
  add('Makaralar', (S.spools || []).map((x) => ({ t: `#${x.code} ${x.color_name || colorName(x.color_hex) || ''}`, sub: `${[x.brand, x.material].filter(Boolean).join(' · ')} · ${Math.round(x.remaining)} g`, swatch: x.color_hex, sc: Math.max(ckScore(x.code, q) * 2, ckScore(x.color_name || colorName(x.color_hex), q), ckScore(x.brand, q)), run: () => { location.hash = '#/filament'; setTimeout(() => openSpoolEditor(x.id), 350); } })), 4);
  add('Ortak parça / diğer amaçlı', [...(S.components || []), ...(S.misc || [])].map((c) => ({ t: c.name, sub: c.kind === 'misc' ? 'Diğer amaçlı' : `Ortak parça · havuzda ${c.stock}`, thumb: c.thumbnail, sc: ckScore(c.name + ' ' + (c.file_name || ''), q), run: () => openCompEditor(c.id), alt: () => openNewPrint({ componentId: c.id }), altLabel: 'Bas' })), 4);
  return out;
}
function ckRender() {
  const box = $('#cmdk'); if (!box) return;
  CK.items = ckBuild(); CK.sel = Math.min(CK.sel, Math.max(0, CK.items.length - 1));
  let g = '';
  $('#ck-list').innerHTML = CK.items.map((x, i) => {
    const head = x.group !== g ? `<div class="ck-g">${esc((g = x.group))}</div>` : '';
    const vis = x.thumb !== undefined ? miniThumb(x.thumb) : x.swatch ? `<span class="spool${swatchCls(x.swatch)}" style="${swatchStyle(x.swatch)}"></span>` : `<span class="ck-ic">${icon(x.icon || 'search')}</span>`;
    return `${head}<div class="ck-it${i === CK.sel ? ' on' : ''}" data-i="${i}" role="option" aria-selected="${i === CK.sel}">${vis}<span class="grow"><b>${esc(x.t)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>
      ${x.alt ? `<button type="button" class="btn btn-sm" data-alt="${i}" title="Ctrl+Enter">${x.altLabel}</button>` : ''}${x.s ? `<kbd>${x.s}</kbd>` : ''}</div>`;
  }).join('') || `<p class="muted" style="padding:14px">“${esc(CK.q)}” için sonuç yok.</p>`;
  $('#ck-list .ck-it.on')?.scrollIntoView({ block: 'nearest' });
}
function ckRun(i, alt) {
  const x = CK.items[i]; if (!x) return;
  if (x.key) ckRemember(x.key);
  closeCmdk();
  (alt && x.alt ? x.alt : x.run)();
}
function openCmdk() {
  if (CK.open) return;
  CK.open = true; CK.q = ''; CK.sel = 0;
  const el = document.createElement('div'); el.id = 'cmdk';
  el.innerHTML = `<div class="ck-back"></div><div class="ck-box" role="dialog" aria-label="Hızlı arama">
    <label class="ck-in">${icon('search')}<input id="ck-q" placeholder="Ürün, sipariş, makara, sayfa ya da işlem ara…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></label>
    <div class="ck-list" id="ck-list" role="listbox"></div>
    <div class="ck-foot"><span><kbd>↑</kbd><kbd>↓</kbd> seç</span><span><kbd>Enter</kbd> aç</span><span><kbd>Ctrl</kbd><kbd>Enter</kbd> bas</span><span><kbd>?</kbd> tüm kısayollar</span></div></div>`;
  document.body.appendChild(el);
  $('.ck-back', el).onclick = closeCmdk;
  const inp = $('#ck-q');
  inp.addEventListener('input', () => { CK.q = inp.value; CK.sel = 0; ckRender(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); CK.sel = Math.min(CK.items.length - 1, CK.sel + 1); ckRender(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); CK.sel = Math.max(0, CK.sel - 1); ckRender(); }
    else if (e.key === 'Enter') { e.preventDefault(); ckRun(CK.sel, e.ctrlKey || e.metaKey); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
  });
  $('#ck-list').addEventListener('click', (e) => { const a = e.target.closest('[data-alt]'); if (a) return ckRun(+a.dataset.alt, true); const it = e.target.closest('.ck-it'); if (it) ckRun(+it.dataset.i); });
  $('#ck-list').addEventListener('mousemove', (e) => { const it = e.target.closest('.ck-it'); if (it && +it.dataset.i !== CK.sel) { CK.sel = +it.dataset.i; $$('#ck-list .ck-it').forEach((x) => x.classList.toggle('on', +x.dataset.i === CK.sel)); } });
  ckRender(); setTimeout(() => inp.focus(), 0);
  // arama için gereken listeler (yoksa) arka planda yüklenir
  Promise.all([S.products.length ? null : loadProducts(), S.orders?.length ? null : loadOrders(), S.spools ? null : loadSpools(), S.components ? null : loadComponents()].map((p) => p?.catch?.(() => {})))
    .then(() => { if (CK.open) ckRender(); });
}
function closeCmdk() { CK.open = false; $('#cmdk')?.remove(); }
function openShortcutHelp() {
  const row = (k, d) => `<tr><td>${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</td><td>${d}</td></tr>`;
  openModal(`<div class="modal-h"><h2>Kısayollar</h2><button class="icon-btn" data-act="close" aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b"><table class="tbl kbd-tbl"><tbody>
      ${row('Ctrl K', 'Hızlı arama: ürün, sipariş, makara, sayfa, işlem')}${row('/', 'Hızlı arama')}
      ${row('N', 'Yeni baskı')}${row('T', 'Toplu sonuç gir (biten baskılar)')}
      ${row('Alt 1–9', 'Sayfalar: ' + navVisible().slice(0, 9).map((n, i) => `${i + 1} ${n.label}`).join(', '))}${row('Alt 0', 'Ayarlar')}
      ${row('Ctrl Enter', 'Aramada seçili ürünü hemen bas')}${row('Esc', 'Pencereyi kapat')}${row('?', 'Bu liste')}
    </tbody></table><p class="muted" style="margin:0;font-size:13px">Tek tuşlu kısayollar yazı alanında değilken çalışır; barkod okuyucunun hızlı tuşlamaları kısayol sayılmaz.</p></div>`, 'narrow');
}
(function () {
  let pending = null, last = 0;
  const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  document.addEventListener('keydown', (e) => {
    const now = performance.now(), quick = now - last < 60; last = now;
    if (pending && quick) { clearTimeout(pending); pending = null; }   // barkod okuyucu: art arda hızlı tuşlar
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); CK.open ? closeCmdk() : openCmdk(); return; }
    if (CK.open || typing(e.target) || e.ctrlKey || e.metaKey) return;
    if (e.altKey && /^[0-9]$/.test(e.key)) {
      e.preventDefault(); const n = +e.key; const r = n === 0 ? 'ayarlar' : navVisible()[n - 1]?.r;
      if (r !== undefined && !$('#modal-root').children.length) location.hash = `#/${r}`; return;
    }
    if (e.altKey || $('#modal-root').children.length) return;
    const fn = { '/': openCmdk, n: () => openNewPrint(), N: () => openNewPrint(), t: () => openBulkResults(), T: () => openBulkResults(), '?': openShortcutHelp }[e.key];
    if (!fn) return;
    if (e.key === '/' || e.key === '?') e.preventDefault();
    clearTimeout(pending);
    pending = setTimeout(() => { pending = null; fn(); }, 70);
  });
})();
$('#cmdk-btn')?.addEventListener('click', () => openCmdk());

// ================================================================== 3MF'yi Ürünler sayfasına bırak
// Ürün kartının üzerine: o ürün dosyadan güncellenir; boş alana: dosyadan yeni ürün açılır.
(function () {
  const active = () => route() === 'urunler' && !$('#modal-root').children.length;
  const hasFile = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const clear = () => { $$('.pcard.drop-target').forEach((c) => c.classList.remove('drop-target')); document.body.classList.remove('drop-new'); };
  document.addEventListener('dragover', (e) => {
    if (!active() || !hasFile(e)) return;
    e.preventDefault();
    const card = e.target.closest?.('.pcard[data-pid]');
    $$('.pcard.drop-target').forEach((c) => c !== card && c.classList.remove('drop-target'));
    card?.classList.add('drop-target');
    document.body.classList.toggle('drop-new', !card);
  });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) clear(); });
  document.addEventListener('drop', async (e) => {
    if (!active() || !hasFile(e)) return;
    e.preventDefault();
    const card = e.target.closest?.('.pcard[data-pid]'); clear();
    const f = e.dataTransfer.files[0]; if (!f) return;
    if (!/\.3mf$/i.test(f.name) && !f.type.startsWith('image/')) return toast('3MF ya da görsel dosyası bırakın', { bad: true });
    await openProductEditor(card ? +card.dataset.pid : undefined);
    if ($('#drop')) handleEditorFile(f);
  });
})();

// ================================================================== akıcı açılır bölümler
// Tüm <details> (düzenleyici bölümleri, sipariş/hazırla satırları, paneller) yükseklik animasyonuyla açılıp kapanır.
// Açılır menüler (fmenu) hariç; onlar CSS ile "pop" olur.
document.addEventListener('click', (e) => {
  const sum = e.target.closest?.('summary'); if (!sum || e.defaultPrevented) return;
  const d = sum.parentElement;
  if (!(d instanceof HTMLDetailsElement) || d.classList.contains('fmenu') || REDUCED()) return;
  const ia = e.target.closest('button, a, input, select, textarea, label'); if (ia && sum.contains(ia)) return;
  e.preventDefault();
  if (d._anim) { d._anim.cancel(); d._anim = null; }
  const from = d.getBoundingClientRect().height;
  d.style.overflow = 'hidden';
  const done = () => { d.style.overflow = ''; d.style.height = ''; d._anim = null; };
  if (!d.open) {
    d.classList.add('anim-open'); d.open = true;
    const to = d.getBoundingClientRect().height;
    d._anim = d.animate({ height: [from + 'px', to + 'px'] }, { duration: Math.min(320, 160 + Math.abs(to - from) * 0.15), easing: 'cubic-bezier(.2,.8,.2,1)' });
    d._anim.onfinish = () => { done(); d.classList.remove('anim-open'); };
  } else {
    d.open = false; const to = d.getBoundingClientRect().height; d.open = true;
    d._anim = d.animate({ height: [from + 'px', to + 'px'] }, { duration: Math.min(260, 140 + Math.abs(to - from) * 0.12), easing: 'cubic-bezier(.4,0,.2,1)' });
    d._anim.onfinish = () => { d.open = false; done(); };
  }
});

// ================================================================== büyük resim (tam ekran)
// openLightbox([{url, title, edit, use}], index): ok tuşları / kaydırma ile gezilir, Esc ya da boşluğa tıklayınca kapanır
let LB = null;
function openLightbox(items, idx = 0) {
  items = (items || []).filter((x) => x && x.url); if (!items.length) return;
  closeLightbox();
  LB = { items, i: Math.max(0, Math.min(idx, items.length - 1)) };
  const el = document.createElement('div'); el.className = 'lb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="lb-stage"><img class="lb-img" alt=""></div>
    <div class="lb-top"><span class="lb-title"></span><span class="lb-n"></span><span class="spacer"></span><span class="lb-acts"></span>
      <button type="button" class="lb-btn" data-lb="close" aria-label="Kapat">${icon('x')}</button></div>
    ${items.length > 1 ? `<button type="button" class="lb-nav prev" data-lb="prev" aria-label="Önceki">${icon('chevron-left')}</button><button type="button" class="lb-nav next" data-lb="next" aria-label="Sonraki">${icon('chevron-right')}</button>` : ''}`;
  document.body.appendChild(el); LB.el = el;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]');
    if (!b) { if (!e.target.closest('.lb-img')) closeLightbox(); return; }
    const k = b.dataset.lb;
    if (k === 'close') closeLightbox();
    else if (k === 'prev' || k === 'next') lbGo(k === 'next' ? 1 : -1);
    else if (k === 'edit') { const id = LB.items[LB.i].edit; closeLightbox(); openProductEditor(id); }
    else if (k === 'use') { const it = LB.items[LB.i]; closeLightbox(); const btn = [...document.querySelectorAll('.ty-img')].find((x) => x.dataset.url === it.use); btn?.click(); }
  });
  let x0 = null;
  el.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  el.addEventListener('pointerup', (e) => { if (x0 != null && Math.abs(e.clientX - x0) > 60 && LB.items.length > 1) lbGo(e.clientX < x0 ? 1 : -1); x0 = null; });
  lbShow();
  requestAnimationFrame(() => el.classList.add('show'));
}
function lbShow() {
  const it = LB.items[LB.i], el = LB.el, img = $('.lb-img', el);
  el.classList.add('loading'); img.onload = () => el.classList.remove('loading'); img.onerror = () => el.classList.remove('loading');
  img.src = it.url;
  $('.lb-title', el).textContent = it.title || '';
  $('.lb-n', el).textContent = LB.items.length > 1 ? `${LB.i + 1} / ${LB.items.length}` : '';
  $('.lb-acts', el).innerHTML = (it.edit ? `<button type="button" class="lb-btn txt" data-lb="edit">${icon('edit')} Düzenle</button>` : '')
    + (it.use ? `<button type="button" class="lb-btn txt" data-lb="use">${icon('check')} Bu görseli kullan</button>` : '');
}
function lbGo(d) { if (!LB) return; LB.i = (LB.i + d + LB.items.length) % LB.items.length; lbShow(); }
function closeLightbox() { if (!LB) return; const el = LB.el; LB = null; el.classList.remove('show'); setTimeout(() => el.remove(), 160); }
document.addEventListener('keydown', (e) => {
  if (!LB) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeLightbox(); }
  else if (e.key === 'ArrowRight') lbGo(1); else if (e.key === 'ArrowLeft') lbGo(-1);
}, true);
// Görsele tıklayınca büyüt: ürün kartları, listelerdeki küçük görseller, siparişler ve hazırla
function bgUrl(el) { const m = /url\((["']?)(.*?)\1\)/.exec(getComputedStyle(el).backgroundImage || ''); return m && m[2] ? m[2] : null; }
document.addEventListener('click', (e) => {
  const t = e.target;
  const ed = t.closest?.('.thumb-edit');
  if (ed) { e.preventDefault(); e.stopPropagation(); openProductEditor(+ed.dataset.edit); return; }
  if (t.closest?.('.drop-zoom')) { e.preventDefault(); e.stopPropagation(); if (ED?.thumbnail) openLightbox([{ url: ED.thumbnail, title: $('#f-name')?.value || ED.name }]); return; }
  const tz = t.closest?.('[data-tyzoom]');
  if (tz) {
    e.preventDefault(); e.stopPropagation();
    const all = [...document.querySelectorAll('.ty-img')].map((b) => ({ url: b.dataset.url, title: 'Trendyol görseli', use: b.dataset.url }));
    openLightbox(all, all.findIndex((x) => x.url === tz.dataset.tyzoom)); return;
  }
  const card = t.closest?.('.pcard .thumb[data-act="edit-product"]:not(.none)');
  if (card && !S.psel && !t.closest('.tag')) {
    e.preventDefault(); e.stopPropagation();
    const p = productById(+card.dataset.id); openLightbox([{ url: p?.thumbnail || bgUrl(card), title: p?.name, edit: +card.dataset.id }]); return;
  }
  const mt = t.closest?.('.mini-thumb:not(.none), .ocard .img, [data-zoom]');
  if (mt && !mt.closest('.modal, .chip, .pick, .nf, .lb, .psel-box, .bulk-vis')) {
    const url = mt.dataset.zoom || bgUrl(mt); if (!url) return;
    e.preventDefault(); e.stopPropagation();
    const row = mt.closest('li, tr, .tyo-line, .pick-row, .tt');
    const title = mt.dataset.title || row?.querySelector('b, .t, a')?.textContent?.trim() || mt.closest('[title]')?.title || '';
    openLightbox([{ url, title }]); return;
  }
}, true);

// ================================================================== küçük görselleri büyüt
// Fareyle küçük ürün görselinin üzerine gelince yanında ~220 px önizleme açılır (dokunmatik ekranlarda yok)
(function () {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const SEL = '.mini-thumb, .stack, .ty-img, .ocard .img, .spool-art, [data-zoom]';
  const SIZE = 340;
  let pop = null, cur = null, timer = null;
  const urlOf = (el) => {
    for (const x of [el, el.querySelector('.fill'), el.querySelector('img')]) {
      if (!x) continue;
      if (x.tagName === 'IMG') return x.currentSrc || x.src;
      const m = /url\((["']?)(.*?)\1\)/.exec(getComputedStyle(x).backgroundImage || '');
      if (m && m[2]) return m[2];
    }
    return null;
  };
  const hide = () => { clearTimeout(timer); cur = null; pop?.classList.remove('show'); };
  function show(el) {
    const url = urlOf(el); if (!url) return;
    if (!pop) { pop = document.createElement('div'); pop.className = 'img-zoom'; document.body.appendChild(pop); }
    pop.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
    const Z = ZF(), q = (v) => v / Z;
    const r = el.getBoundingClientRect(), gap = 12, vw = innerWidth, vh = innerHeight, S2 = SIZE * Z;
    let x = r.right + gap; if (x + S2 > vw - 8) x = r.left - gap - S2; if (x < 8) x = Math.min(vw - S2 - 8, Math.max(8, r.left));
    let y = r.top + r.height / 2 - S2 / 2; y = Math.max(8, Math.min(vh - S2 - 8, y));
    pop.style.left = q(x) + 'px'; pop.style.top = q(y) + 'px';
    pop.classList.add('show');
  }
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.(SEL);
    if (el === cur) return;
    hide();
    if (!el || el.closest('.drop')) return;
    cur = el; timer = setTimeout(() => cur === el && show(el), 140);
  });
  document.addEventListener('scroll', hide, true);
  document.addEventListener('pointerdown', hide, true);
})();

// ================================================================== polling
async function loadBambu() {
  try { S.bambu = await api('GET', '/api/bambu'); } catch { S.bambu = null; }
  renderBambuEvents(); renderPBar();
}
const BB_ACTIVE = new Set(['RUNNING', 'PREPARE', 'PAUSE', 'SLICING']);
const bambuLive = (printer) => { const st = (S.bambu?.printers || []).find((x) => x.name === printer); return st && BB_ACTIVE.has(st.state) ? st : null; };
// Tanınmayan / parçası seçilecek baskılar: sayfanın üstünde, işlem yapılana kadar duran turuncu bant
function renderBambuEvents() {
  // Üst bant yerine bildirim merkezi kullanılıyor (sağ panel / zil). Eski bant varsa kaldır.
  if (!S.bandOn) { $('#bambu-events')?.remove(); return; }
  const evs = (S.bambu?.events || []).filter((e) => !S.bambuHidden?.[e.id]);
  let el = $('#bambu-events');
  if (!evs.length) { el?.remove(); fitSoon(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'bambu-events'; el.setAttribute('role', 'alert'); const main = document.querySelector('.main'); main ? main.prepend(el) : document.body.prepend(el); }
  // Yoklamada sadece içerik değiştiyse yeniden çiz; giriş animasyonu yalnızca ilk kez görünen bildirimde oynar
  const seen = (S.bbSeen ||= new Set());
  const html = evs.map((e) => {
    const live = bambuLive(e.printer), pct = live?.percent ?? e.percent, rem = live?.remaining_min ?? e.remaining_min;
    return `<div class="bambu-band${seen.has(e.id) ? '' : ' enter'}" data-id="${esc(e.id)}">${printerThumb(e.printer, 'sm')}
      <div class="bb-txt"><div><b>${esc(e.printer)}</b> ${e.reason === 'parts' ? 'çok parçalı bir ürün basıyor' : 'basmaya başladı'}: <span class="bb-file">${esc(e.file || 'bilinmeyen dosya')}</span></div>
        <small>${pct != null ? `%${pct}` : ''}${rem ? ` · kalan ${fmtDur(rem)}` : ''} · ${e.reason === 'parts' ? 'Bu baskıda hangi parçaların olduğunu seçin.' : 'Hangi ürün? Bir kez seçerseniz bu dosyayı sonra kendim tanırım.'}</small></div>
      <div class="bb-act"><button class="btn btn-primary" data-act="bambu-ev" data-id="${esc(e.id)}">${e.reason === 'parts' ? 'Parçaları seç' : 'Ürüne bağla'}</button>
        <button class="btn btn-ghost" data-act="bambu-ev-x" data-id="${esc(e.id)}">Yoksay</button></div></div>`;
  }).join('');
  const sig = html.replace(/ enter"/g, '"');
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.innerHTML = html;
  evs.forEach((e) => seen.add(e.id));
  fitSoon();
}
// ---------- üst bar: yazıcıların anlık durumu (hata kırmızı yanıp söner, boşta yeşil, baskıda sarı)
const PB_LABEL = { err: 'hata', paused: 'duraklatıldı', off: 'kapalı', idle: 'boşta' };
function printerStates() {
  const t = nowS();
  return (S.settings?.printers || []).filter((p) => p.name).map((p) => {
    const st = (S.bambu?.printers || []).find((x) => x.name === p.name);
    const job = (S.jobs || []).find((j) => j.status === 'printing' && j.printer === p.name && j.ends_at > t);
    const o = { name: p.name, s: 'idle', pct: null, rem: null, file: '', ack: false, nid: null };
    if (hasLink(p)) {
      if (!st || st.online === false) { o.s = 'off'; o.note = st?.connecting ? 'bağlanıyor' : (st?.error || 'bağlantı yok'); return o; }
      o.file = st.file || '';
      if (st.error_code || st.state === 'FAILED') { o.s = 'err'; o.ack = !!st.err_ack; o.nid = st.err_nid || null; }
      else if (st.state === 'PAUSE') o.s = 'paused';
      else if (BB_ACTIVE.has(st.state)) { o.s = 'run'; o.pct = st.percent ?? null; o.rem = st.remaining_min ?? null; o.prep = st.state === 'PREPARE' || st.state === 'SLICING'; }
      return o;
    }
    // bağlantısı olmayan makine: Astera'daki açık baskıya göre
    if (job) { o.s = 'run'; o.pct = Math.round(jobProgressPct(job)); o.rem = Math.max(1, Math.round((job.ends_at - t) / 60)); o.file = job.product_name || ''; }
    return o;
  });
}
const jobProgressPct = (j) => Math.max(0, Math.min(100, ((nowS() - j.started_at) / Math.max(1, j.ends_at - j.started_at)) * 100));
function renderPBar() {
  const el = $('#pbar'); if (!el || !window.pbarRender) return;
  if (!U('top.pbar')) { el.hidden = true; el.dataset.off = '1'; return; }
  el.dataset.mode = U('top.pbarScroll') ? '' : 'wrap';
  if (el.dataset.off) { delete el.dataset.off; el.dataset.key = ''; }
  const hide = U('top.pbarHidden') || [];
  window.pbarRender(el, printerStates().filter((o) => !hide.includes(o.name)).map((o) => ({ ...o,
    info: o.prep ? 'hazırlanıyor' : o.s === 'run' ? `${o.pct != null ? `%${o.pct}` : 'baskıda'}${o.rem ? `<span class="pb-rem"> · ${fmtDur(o.rem)}</span>` : ''}` : PB_LABEL[o.s],
    tip: [o.name, o.s === 'run' ? 'baskıda' : PB_LABEL[o.s], o.file, o.note, o.s === 'err' && !o.ack && o.nid ? 'tıklayınca yanıp sönmeyi durdurur' : ''].filter(Boolean).join(' · ') })));
}
async function poll() {
  loadNotifs();
  try {
    if ((S.settings?.printers || []).some(hasLink)) loadBambu();
    await loadJobs();
    // Bambu bitiş saati her raporda birkaç saniye kayar; sayfayı sadece anlamlı değişimde (5 dk) yeniden çiz
    const sig = S.jobs.map((j) => `${j.id}:${j.status}:${j.bambu_state || ''}:${Math.round(j.ends_at / 300)}`).join(',');
    const r = route();
    if (sig !== S.lastJobsSig && S.lastJobsSig && (r === '' || r === 'baskilar') && !$('#modal-root').children.length) render();
    S.lastJobsSig = sig;
    renderNav();
    checkDue();
  } catch { /* sunucu geçici olarak erişilemez */ }
}
setInterval(poll, 10000);
setInterval(() => { if (!$('#modal-root').children.length && route() === '' && document.visibilityState === 'visible') render(); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { syncTime(); poll(); } });

// ================================================================== boot
(async function boot() {
  applyTheme(); applyUI();
  await syncTime();
  await Promise.all([loadSettings().catch(() => {}), loadProducts().catch(() => {}), loadCategories()]);
  loadNotifs(); notifBind();
  // telefonda tam sürüm açıldıysa sade mobil uygulamayı bir kez öner
  try { if (window.matchMedia('(max-width: 760px)').matches && !localStorage.getItem('mHint')) { localStorage.setItem('mHint', '1'); toast('Telefon için sade uygulama var: stok, baskı ve filament', { action: 'Aç', onAction: () => { location.href = '/m/'; } }); } } catch { /* */ }
  if ((S.settings?.printers || []).some(hasLink)) loadBambu();
  await render();
  renderPBar();
  S.booted = true;
  S.lastJobsSig = S.jobs.map((j) => j.id + ':' + j.ends_at).join(',');
  checkDue();
})();
