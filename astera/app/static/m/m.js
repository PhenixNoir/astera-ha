// Astera Mobil — telefonda stok, baskı ve filament takibi. Fiyat/kâr bilgisi içermez.
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowS = () => Math.floor(Date.now() / 1000) + (M.skew || 0);
const trLower = (s) => (s || '').toLocaleLowerCase('tr');
const ICONS = {
  print: '<path d="M4 20h16M6 16h12M8 12h8M10 8h4"/>',
  box: '<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',
  spool: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5 9-10"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  scan: '<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 12h10"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3L2 20h20zM12 10v4M12 17v.5"/>', cart: '<path d="M3 4h2l2 12h11l2-8H6M9 20h.01M17 20h.01"/>',
  scale: '<path d="M5 20h14l-2-11H7z"/><path d="M9 9a3 3 0 0 1 6 0"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const M = { route: 'baskilar', products: [], jobs: [], spools: [], bambu: { printers: [], events: [] }, notif: { items: [], active: 0 }, q: '', sq: '', fq: '', stockF: 'all', spoolF: 'use' };

async function api(method, path, body) {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Hata (${r.status})`);
  return d;
}
function toast(msg, bad) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, 2800);
}
const fail = (e) => toast(e.message || String(e), true);
const fmtDur = (min) => { min = Math.max(0, Math.round(min || 0)); const h = Math.floor(min / 60), m = min % 60; return h ? `${h} sa${m ? ` ${m} dk` : ''}` : `${m} dk`; };
const fmtClock = (t) => new Date(t * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
function fmtLeft(sec) {
  if (sec <= 0) return 'bitti';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtWhen(t) {
  const diff = Date.now() / 1000 - t;
  if (diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  return new Date(t * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
const thumb = (url, cls = '') => `<span class="m-thumb ${cls}" style="${url ? `background-image:url('${esc(url)}')` : ''}"></span>`;
const productById = (id) => M.products.find((p) => p.id === id);
const BB_ACTIVE = new Set(['RUNNING', 'PREPARE', 'PAUSE', 'SLICING']);
const liveOf = (printer) => { const st = (M.bambu.printers || []).find((x) => x.name === printer); return st && BB_ACTIVE.has(st.state) ? st : null; };

// ------------------------------------------------------------------ yükleme
async function loadAll() {
  const [p, j, b, n, t, s] = await Promise.all([api('GET', '/api/products'), api('GET', '/api/jobs'), api('GET', '/api/bambu').catch(() => M.bambu),
    api('GET', '/api/notifications').catch(() => M.notif), api('GET', '/api/time').catch(() => null), M.settings ? null : api('GET', '/api/settings').catch(() => null)]);
  M.products = p; M.jobs = j; M.bambu = b || M.bambu; M.notif = n || M.notif;
  if (t?.now) M.skew = t.now - Math.floor(Date.now() / 1000);
  if (s) M.settings = s;
  setConn(true); renderPBar();
}
async function poll() {
  try {
    const [j, b, n] = await Promise.all([api('GET', '/api/jobs'), api('GET', '/api/bambu').catch(() => M.bambu), api('GET', '/api/notifications').catch(() => M.notif)]);
    const sig = (x) => JSON.stringify([x.j.map((q) => [q.id, q.status, q.quantity, q.bambu_state, Math.round(q.ends_at / 60), q.bambu_percent]), x.b.events.map((e) => e.id), x.b.printers.map((p) => [p.name, p.state, p.percent]), x.n.active, x.n.items.length]);
    const before = sig({ j: M.jobs, b: M.bambu, n: M.notif });
    const seen = new Set((M.notif?.items || []).filter((x) => !x.resolved_at).map((x) => x.id));
    M.jobs = j; M.bambu = b || M.bambu; M.notif = n || M.notif;
    if (n && n.items.some((x) => !x.resolved_at && !seen.has(x.id))) alertNew();
    setConn(true);
    renderTabs(); renderPBar();
    if (sig({ j: M.jobs, b: M.bambu, n: M.notif }) !== before && !M.sheetOpen && ['baskilar', 'bildirim'].includes(M.route)) render();
  } catch { setConn(false); }
}
// üst bar: yazıcı durumları (masaüstüyle aynı kurallar)
const hasLink = (p) => !!(p.bambu_ip || p.mr_url || p.sdcp_ip);
const PB_LABEL = { err: 'hata', paused: 'duraklatıldı', off: 'kapalı', idle: 'boşta' };
function renderPBar() {
  const el = $('#pbar'); if (!el || !window.pbarRender) return;
  const t = nowS();
  const list = (M.settings?.printers || []).filter((p) => p.name).map((p) => {
    const st = (M.bambu.printers || []).find((x) => x.name === p.name);
    const job = M.jobs.find((j) => j.status === 'printing' && j.printer === p.name && j.ends_at > t);
    const o = { name: p.name, s: 'idle', pct: null, rem: null, ack: false, nid: null };
    if (hasLink(p)) {
      if (!st || st.online === false) o.s = 'off';
      else if (st.error_code || st.state === 'FAILED') { o.s = 'err'; o.ack = !!st.err_ack; o.nid = st.err_nid || null; }
      else if (st.state === 'PAUSE') o.s = 'paused';
      else if (BB_ACTIVE.has(st.state)) { o.s = 'run'; o.pct = st.percent ?? null; o.rem = st.remaining_min ?? null; o.prep = st.state === 'PREPARE' || st.state === 'SLICING'; }
    } else if (job) { o.s = 'run'; o.pct = Math.round(jobProgress(job)); o.rem = Math.max(1, Math.round((job.ends_at - t) / 60)); }
    o.info = o.prep ? 'hazırlanıyor' : o.s === 'run' ? `${o.pct != null ? `%${o.pct}` : 'baskıda'}${o.rem ? `<span class="pb-rem"> · ${fmtDur(o.rem)}</span>` : ''}` : PB_LABEL[o.s];
    return o;
  });
  window.pbarRender(el, list);
  if (!el.dataset.bound) {
    el.dataset.bound = '1';
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('.pb'); if (!b) return;
      if (b.dataset.nid) {
        try { await api('POST', `/api/notifications/${b.dataset.nid}/resolve`); toast(`${b.dataset.name}: uyarı görüldü`); M.bambu = await api('GET', '/api/bambu'); renderPBar(); } catch (err) { fail(err); }
      } else if (M.route !== 'baskilar') location.hash = '#baskilar';
    });
  }
}
// Uygulama açıkken yeni bildirim: kısa ses + titreşim (kapalıyken telefonun bildirim ayarı geçerlidir)
let AC = null;
document.addEventListener('pointerdown', () => { try { AC ||= new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch { /* */ } }, { passive: true });
function alertNew() {
  try { navigator.vibrate?.([250, 120, 250]); } catch { /* */ }
  try {
    if (!AC || document.visibilityState !== 'visible') return;
    [0, 0.18].forEach((d, i) => { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = i ? 1175 : 880; o.connect(g); g.connect(AC.destination);
      const t = AC.currentTime + d; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.start(t); o.stop(t + 0.17); });
  } catch { /* */ }
}
function setConn(ok) { const el = $('#m-conn'); if (el) { el.classList.toggle('ok', ok); el.title = ok ? 'Bağlı' : 'Sunucuya ulaşılamıyor'; } }

// ------------------------------------------------------------------ yönlendirme
const TABS = [['baskilar', 'Baskılar', 'print'], ['stok', 'Stok', 'box'], ['filament', 'Filament', 'spool'], ['bildirim', 'Bildirimler', 'bell']];
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [r, qs] = h.split('?');
  return { r: TABS.some((t) => t[0] === r) ? r : 'baskilar', q: new URLSearchParams(qs || '') };
}
function renderTabs() {
  const due = M.jobs.filter((j) => j.status === 'printing' && j.ends_at <= nowS()).length + (M.bambu.events || []).length;
  $('#m-tabs').innerHTML = TABS.map(([k, l, ic]) => {
    const badge = k === 'baskilar' ? due : k === 'bildirim' ? M.notif.active : 0;
    return `<a href="#${k}" class="${M.route === k ? 'on' : ''}">${icon(ic)}<span>${l}</span>${badge ? `<i class="m-badge">${badge > 99 ? '99+' : badge}</i>` : ''}</a>`;
  }).join('');
}
function render() {
  const v = $('#mv');
  const titles = { baskilar: 'Baskılar', stok: 'Stok', filament: 'Filament', bildirim: 'Bildirimler' };
  $('#m-title').textContent = titles[M.route];
  $('#m-fab').hidden = M.route !== 'baskilar';
  const keep = document.activeElement?.id;
  const pos = document.activeElement?.selectionStart;
  v.innerHTML = VIEWS[M.route]();
  BIND[M.route]?.();
  if (keep && $('#' + keep)) { const el = $('#' + keep); el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* */ } }
  renderTabs(); tick();
}
async function go() {
  const { r, q } = parseHash();
  M.route = r;
  render();
  if (q.get('job')) { const j = M.jobs.find((x) => x.id === +q.get('job')); if (j && j.status === 'printing') openResult(j); }
  if (q.get('ev')) { const e = (M.bambu.events || []).find((x) => x.id === q.get('ev')); if (e) openNewPrint(e); }
}

// ------------------------------------------------------------------ BASKILAR
function jobProgress(j) {
  if (j.bambu_percent != null && j.bambu_task) return Math.max(0, Math.min(100, j.bambu_percent));
  const tot = j.ends_at - j.started_at; return tot > 0 ? Math.max(0, Math.min(100, Math.round((nowS() - j.started_at) * 100 / tot))) : 0;
}
function printerLine(j) {
  const live = j.printer && liveOf(j.printer);
  return `${j.printer ? `<span class="m-pr">${live ? '<i class="m-live"></i>' : ''}${esc(j.printer)}</span>` : ''}${j.bambu_layer && j.bambu_layer !== '0/0' ? ` · katman ${esc(j.bambu_layer)}` : ''}`;
}
function partsText(j) { return j.parts?.length ? j.parts.map((x) => `${esc(x.name)} ×${x.quantity}`).join(', ') : ''; }
const VIEWS = {};
const BIND = {};
VIEWS.baskilar = () => {
  const evs = M.bambu.events || [];
  const act = M.jobs.filter((j) => j.status === 'printing');
  const due = act.filter((j) => j.ends_at <= nowS()).sort((a, b) => a.ends_at - b.ends_at);
  const run = act.filter((j) => j.ends_at > nowS()).sort((a, b) => a.ends_at - b.ends_at);
  const idle = (M.settings?.printers || []).filter((p) => !act.some((j) => j.printer === p.name));
  return `
    ${evs.map((e) => `<article class="m-card m-ev"><div class="m-row"><span class="m-ic warn">${icon('alert')}</span><div class="m-grow">
        <b>${esc(e.printer)}${e.reason === 'confirm' ? `: ${esc(e.guess || '')}${e.guess_qty ? ` ×${e.guess_qty}` : ''} mi?` : e.reason === 'parts' ? ' çok parçalı ürün basıyor' : ' tanınmayan baskı'}${e.done ? ' · bitti' : ''}</b>
        <small>${esc(e.file || '')}${e.percent != null ? ` · %${e.percent}` : ''}${e.objects ? ` · tablada ${e.objects} nesne` : ''}</small></div></div>
        <div class="m-actions"><button class="btn btn-primary" data-ev="${esc(e.id)}">${e.reason === 'confirm' ? 'Kontrol et, onayla' : e.reason === 'parts' ? 'Parçaları seç' : 'Ürüne bağla'}</button><button class="btn btn-ghost" data-ev-x="${esc(e.id)}">Yoksay</button></div></article>`).join('')}
    ${due.length ? `<h2 class="m-h">Sonucu bekleyen <span class="m-n">${due.length}</span></h2>${due.map((j) => `<article class="m-card m-due" data-res="${j.id}">
        <div class="m-row">${thumb(j.thumbnail)}<div class="m-grow"><b>${esc(j.product_name)}</b><small>${j.parts?.length ? partsText(j) : `${j.quantity} adet`} · ${printerLine(j)}</small>
        <small class="${j.bambu_state === 'FAILED' ? 'bad-t' : 'ok-t'}">${j.bambu_state === 'FAILED' ? 'Yazıcı durdu' : j.bambu_task ? 'Yazıcı bitirdi' : 'Süre doldu'}</small></div></div>
        <button class="btn btn-primary m-wide">Sonucu gir</button></article>`).join('')}` : ''}
    <h2 class="m-h">Baskıda <span class="m-n">${run.length}</span></h2>
    ${run.length ? run.map((j) => `<article class="m-card m-job" data-job="${j.id}">
        <div class="m-row">${thumb(j.thumbnail)}<div class="m-grow"><b>${esc(j.product_name)}${j.parts?.length ? '' : ` <span class="m-q">×${j.quantity}</span>`}</b>
          <small>${j.parts?.length ? partsText(j) + ' · ' : ''}${printerLine(j)}</small></div>
          <div class="m-left"><b data-cd="${j.ends_at}">${fmtLeft(j.ends_at - nowS())}</b><small>${fmtClock(j.ends_at)}</small></div></div>
        <div class="m-bar"><i data-pb="${j.id}" style="width:${jobProgress(j)}%"></i></div></article>`).join('')
      : '<p class="m-empty">Şu an basılan bir şey yok. Yazıcıda başlattığınız baskılar burada kendiliğinden görünür.</p>'}
    ${idle.length ? `<h2 class="m-h">Boşta</h2><div class="m-chips">${idle.map((p) => { const st = (M.bambu.printers || []).find((x) => x.name === p.name); return `<span class="m-chip">${st?.online ? '<i class="m-live idle"></i>' : ''}${esc(p.name)}${st && BB_ACTIVE.has(st.state) ? ` · %${st.percent ?? 0}` : ''}</span>`; }).join('')}</div>` : ''}`;
};
BIND.baskilar = () => {
  $$('[data-ev]').forEach((b) => b.onclick = () => { const e = M.bambu.events.find((x) => x.id === b.dataset.ev); if (e) openNewPrint(e); });
  $$('[data-ev-x]').forEach((b) => b.onclick = async () => { try { await api('POST', `/api/bambu/events/${encodeURIComponent(b.dataset.evX)}/dismiss`); M.bambu.events = M.bambu.events.filter((x) => x.id !== b.dataset.evX); render(); } catch (e) { fail(e); } });
  $$('[data-res]').forEach((c) => c.onclick = () => { const j = M.jobs.find((x) => x.id === +c.dataset.res); if (j) openResult(j); });
  $$('[data-job]').forEach((c) => c.onclick = () => { const j = M.jobs.find((x) => x.id === +c.dataset.job); if (j) openJobMenu(j); });
};
function tick() {
  $$('[data-cd]').forEach((el) => { const left = +el.dataset.cd - nowS(); el.textContent = fmtLeft(left); });
  $$('[data-pb]').forEach((el) => { const j = M.jobs.find((x) => x.id === +el.dataset.pb); if (j) el.style.width = jobProgress(j) + '%'; });
  if (M.route === 'baskilar' && !M.sheetOpen && M.jobs.some((j) => j.status === 'printing' && j.ends_at <= nowS() && !$(`[data-res="${j.id}"]`))) render();
}

// alttan açılan pencere
function sheet(html, onClose) {
  const s = $('#m-sheet');
  s.innerHTML = `<div class="m-grab"></div>${html}`;
  document.body.classList.add('sheet-open'); M.sheetOpen = true; M.onSheetClose = onClose;
}
function closeSheet() { document.body.classList.remove('sheet-open'); M.sheetOpen = false; const f = M.onSheetClose; M.onSheetClose = null; f?.(); setTimeout(() => { if (!M.sheetOpen) $('#m-sheet').innerHTML = ''; }, 250); render(); }
const stepper = (id, v, min = 0, max = 999) => `<div class="m-step"><button type="button" data-step="${id}" data-d="-1">${icon('minus')}</button><input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${v}"><button type="button" data-step="${id}" data-d="1">${icon('plus')}</button></div>`;
function bindSteppers(root = $('#m-sheet')) {
  $$('[data-step]', root).forEach((b) => b.onclick = () => { const i = $('#' + b.dataset.step); i.value = Math.max(+i.min || 0, Math.min(+i.max || 999, (parseInt(i.value) || 0) + +b.dataset.d)); i.dispatchEvent(new Event('input')); });
}

// "Baskı bitti"yi yok say: kayıt silinir; stoğa eklenmez, başarısız sayılmaz, makaradan düşülmez
async function mIgnoreJob(id) {
  if (!confirm('Bu baskı yok sayılsın mı? Stoğa eklenmez, başarısız sayılmaz, makaradan düşülmez.')) return false;
  try {
    await api('POST', `/api/jobs/${id}/ignore`);
    toast('Baskı yok sayıldı');
    [M.jobs, M.notif] = await Promise.all([api('GET', '/api/jobs'), api('GET', '/api/notifications').catch(() => M.notif)]);
    render(); return true;
  } catch (e) { fail(e); return false; }
}
function openResult(j) {
  const parts = j.parts?.length;
  sheet(`<div class="m-sh-h">${thumb(j.thumbnail, 'lg')}<div><h3>${esc(j.product_name)}</h3><small>${printerLine(j)} · ${fmtClock(j.started_at)}'de başladı</small></div></div>
    ${parts ? `<p class="m-lbl">Sağlam çıkan parçalar</p>${j.parts.map((x) => `<div class="m-line"><span>${esc(x.name)} <small>${x.quantity} basıldı</small></span>${stepper('rp-' + x.part_id, x.quantity, 0, x.quantity)}</div>`).join('')}`
      : `<p class="m-lbl">Sağlam çıkan adet</p>${stepper('r-qty', j.quantity, 0, j.bambu_task || j.is_misc || j.is_component ? 999 : j.quantity)}`}
    <div class="m-res"><button class="m-choice ok" data-r="1">${icon('check')}<b>Sağlam</b><small>${j.is_misc ? 'Tamamlandı' : j.is_order ? 'Hazır' : j.is_component ? 'Havuza ekle' : parts ? 'Parçaları ekle' : 'Stoğa ekle'}</small></button>
      <button class="m-choice bad" data-r="0">${icon('x')}<b>Sorunlu</b><small>${j.is_misc ? 'Başarısız kaydet' : 'Stoğa eklenmez'}</small></button></div>
    ${j.bambu_task ? '' : `<div class="m-chips m-snooze"><small>Henüz bitmedi:</small>${[[15, '+15 dk'], [30, '+30 dk'], [60, '+1 sa']].map(([m, l]) => `<button class="m-chip" data-snooze="${m}">${l}</button>`).join('')}</div>`}
    <button class="btn btn-ghost m-wide" data-close>Sonra</button>
    <button class="btn btn-ghost m-wide m-ign" data-ignore>Yoksay: bu baskı hiç olmamış gibi sil</button>`);
  bindSteppers();
  $('#m-sheet [data-ignore]').onclick = async () => { if (await mIgnoreJob(j.id)) closeSheet(); };
  $$('#m-sheet [data-r]').forEach((b) => b.onclick = async () => {
    const success = b.dataset.r === '1';
    $$('#m-sheet [data-r]').forEach((x) => { x.disabled = true; });
    const body = { success };
    if (parts) body.parts_good = j.parts.map((x) => ({ part_id: x.part_id, good: Math.max(0, parseInt($('#rp-' + x.part_id).value) || 0) }));
    else body.good_quantity = Math.max(0, parseInt($('#r-qty').value) || 0);
    try {
      const r = await api('POST', `/api/jobs/${j.id}/complete`, body);
      toast(success ? (r.good_quantity && !r.is_misc && !r.is_order ? `${r.product_name}: +${r.good_quantity} ${r.is_component ? 'havuza' : 'stoğa'} eklendi` : `${r.product_name} kaydedildi`) : `${r.product_name} başarısız olarak kaydedildi`);
      M.jobs = await api('GET', '/api/jobs'); M.products = await api('GET', '/api/products'); closeSheet();
    } catch (e) { fail(e); $$('#m-sheet [data-r]').forEach((x) => { x.disabled = false; }); }
  });
  $$('#m-sheet [data-snooze]').forEach((b) => b.onclick = async () => { try { await api('POST', `/api/jobs/${j.id}/snooze`, { minutes: +b.dataset.snooze }); M.jobs = await api('GET', '/api/jobs'); closeSheet(); } catch (e) { fail(e); } });
  $('#m-sheet [data-close]').onclick = closeSheet;
}
function openJobMenu(j) {
  sheet(`<div class="m-sh-h">${thumb(j.thumbnail, 'lg')}<div><h3>${esc(j.product_name)}${j.parts?.length ? '' : ` ×${j.quantity}`}</h3><small>${printerLine(j)}</small></div></div>
    <div class="m-kv"><span>Bitiş</span><b>${fmtClock(j.ends_at)} · ${fmtLeft(j.ends_at - nowS())}</b></div>
    ${j.bambu_percent != null && j.bambu_task ? `<div class="m-kv"><span>Yazıcı</span><b>%${j.bambu_percent}${j.bambu_layer ? ` · katman ${esc(j.bambu_layer)}` : ''}</b></div>` : ''}
    ${j.parts?.length ? `<div class="m-kv"><span>Parçalar</span><b>${partsText(j)}</b></div>` : ''}
    ${j.spools?.length ? `<div class="m-kv"><span>Makara</span><b>${j.spools.map((s) => `#${esc(s.code)} ${esc(s.color_name || '')}`).join(', ')}</b></div>` : ''}
    <div class="m-col">
      ${j.bambu_task ? '' : '<button class="btn m-wide" data-a="now">Şimdi bitti, sonucu gir</button>'}
      <button class="btn btn-ghost m-wide bad-t" data-a="cancel">Baskıyı iptal et</button>
      <button class="btn btn-ghost m-wide" data-close>Kapat</button></div>`);
  $('#m-sheet [data-close]').onclick = closeSheet;
  $('#m-sheet [data-a="now"]')?.addEventListener('click', async () => { try { await api('POST', `/api/jobs/${j.id}/finish-now`); M.jobs = await api('GET', '/api/jobs'); closeSheet(); const jj = M.jobs.find((x) => x.id === j.id); if (jj) openResult(jj); } catch (e) { fail(e); } });
  $('#m-sheet [data-a="cancel"]').onclick = async () => { if (!confirm('Baskı iptal edilsin mi? Stoğa bir şey eklenmez.')) return; try { await api('POST', `/api/jobs/${j.id}/cancel`); M.jobs = await api('GET', '/api/jobs'); toast('Baskı iptal edildi'); closeSheet(); } catch (e) { fail(e); } };
}

// yeni baskı (ya da yazıcıdaki tanınmayan baskıyı ürüne bağlama)
function openNewPrint(ev) {
  const NP = M.np = { ev: ev || null, pid: ev?.product_id || null, printer: ev?.printer || localStorage.getItem('lastPrinter') || '', q: '' };
  const printers = (M.settings?.printers || []).map((p) => p.name);
  if (!printers.includes(NP.printer)) NP.printer = ev?.printer || '';
  sheet(`<h3 class="m-sh-t">${ev ? `${esc(ev.printer)}: ${ev.reason === 'confirm' ? `${esc(ev.guess || '')} mi?` : ev.reason === 'parts' ? 'parçaları seçin' : 'hangi ürün?'}` : 'Yeni baskı'}</h3>
    ${ev ? `<p class="m-note">${esc(ev.file || '')}${ev.percent != null ? ` · %${ev.percent}` : ''}${ev.objects ? ` · tablada ${ev.objects} nesne` : ''}</p>` : ''}
    <label class="m-search">${icon('search')}<input id="np-q" placeholder="Ürün ara" autocomplete="off"></label>
    <div class="m-pick" id="np-list"></div>
    <div id="np-detail"></div>
    ${printers.length ? `<p class="m-lbl">Makine</p><div class="m-chips" id="np-pr">${printers.map((n) => `<button type="button" class="m-chip${NP.printer === n ? ' on' : ''}" data-pr="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
    <div id="np-time"></div>
    <div class="m-col"><button class="btn btn-primary m-wide" id="np-go" disabled>Baskıyı başlat</button><button class="btn btn-ghost m-wide" data-close>Vazgeç</button></div>`);
  $('#m-sheet [data-close]').onclick = closeSheet;
  $('#np-q').oninput = (e) => { NP.q = e.target.value; npList(); };
  $$('#np-pr [data-pr]').forEach((b) => b.onclick = () => { NP.printer = NP.printer === b.dataset.pr ? '' : b.dataset.pr; $$('#np-pr [data-pr]').forEach((x) => x.classList.toggle('on', x.dataset.pr === NP.printer)); npTime(); });
  $('#np-go').onclick = npStart;
  npList(); npDetail(); npTime();
}
function npList() {
  const NP = M.np, q = trLower(NP.q);
  let list = M.products.filter((p) => !q || trLower(p.name + ' ' + (p.file_name || '')).includes(q));
  list.sort((a, b) => (b.id === NP.pid) - (a.id === NP.pid) || (b.printed_90 || 0) - (a.printed_90 || 0) || a.name.localeCompare(b.name, 'tr'));
  $('#np-list').innerHTML = list.slice(0, 60).map((p) => `<button type="button" class="m-pi${NP.pid === p.id ? ' on' : ''}" data-pid="${p.id}">${thumb(p.thumbnail)}<span><b>${esc(p.name)}</b><small>stok ${p.stock}${p.printed_90 ? ` · 90 günde ${p.printed_90} basıldı` : ''}</small></span></button>`).join('') || '<p class="m-empty">Ürün bulunamadı.</p>';
  $$('#np-list [data-pid]').forEach((b) => b.onclick = () => { NP.pid = +b.dataset.pid; npList(); npDetail(); npTime(); });
}
function npDetail() {
  const NP = M.np, p = productById(NP.pid), el = $('#np-detail');
  if (!p) { el.innerHTML = ''; $('#np-go').disabled = true; return; }
  if (p.parts?.length) {
    el.innerHTML = `<p class="m-lbl">Bu baskıda hangi parçalar var?</p>${p.parts.map((x) => `<div class="m-line"><span>${esc(x.name)} <small>bir üründe ${x.per_unit}</small></span>${stepper('pp-' + x.id, x.per_unit, 0, 999)}</div>`).join('')}`;
  } else {
    const ss = Math.max(1, p.set_size || 1), objs = NP.ev?.objects || 0;
    const q = objs ? (ss > 1 && objs % ss === 0 ? objs / ss : objs) : 1;
    el.innerHTML = `<p class="m-lbl">${ss > 1 ? `Kaç set? (${ss}'lü)` : 'Kaç adet?'}</p>${stepper('np-qty', q, 1, 999)}`;
  }
  bindSteppers(el);
  $('#np-go').disabled = false;
}
function npTime() {
  const NP = M.np, p = productById(NP.pid), el = $('#np-time');
  NP.live = NP.printer ? liveOf(NP.printer) : null;
  if (NP.live) { el.innerHTML = `<p class="m-note ok">${esc(NP.printer)} şu an basıyor · %${NP.live.percent ?? 0} · kalan ${fmtDur(NP.live.remaining_min)}. Süre yazıcıdan alınır.</p>`; return; }
  const mins = p?.print_minutes || 0;
  el.innerHTML = `<p class="m-lbl">Süre</p><div class="m-time"><input id="np-h" type="number" inputmode="numeric" min="0" value="${Math.floor(mins / 60)}"><span>sa</span><input id="np-m" type="number" inputmode="numeric" min="0" max="59" value="${mins % 60}"><span>dk</span></div>`;
}
async function npStart() {
  const NP = M.np, p = productById(NP.pid); if (!p) return;
  const minutes = NP.live ? Math.max(1, NP.live.remaining_min || 1) : (parseInt($('#np-h')?.value) || 0) * 60 + (parseInt($('#np-m')?.value) || 0);
  if (minutes < 1) return toast('Süreyi girin', true);
  const body = { product_id: p.id, duration_minutes: minutes, printer: NP.printer || '', quantity: 1 };
  if (p.parts?.length) {
    body.parts = p.parts.map((x) => ({ part_id: x.id, quantity: Math.max(0, parseInt($('#pp-' + x.id).value) || 0) })).filter((x) => x.quantity > 0);
    if (!body.parts.length) return toast('En az bir parça seçin', true);
  } else body.quantity = Math.max(1, parseInt($('#np-qty').value) || 1);
  if (NP.ev) body.bambu_event = NP.ev.id;
  $('#np-go').disabled = true;
  try {
    const j = await api('POST', '/api/jobs', body);
    if (NP.printer) localStorage.setItem('lastPrinter', NP.printer);
    if (NP.ev) M.bambu.events = (M.bambu.events || []).filter((x) => x.id !== NP.ev.id);
    toast(`${j.product_name} baskıya alındı`);
    M.jobs = await api('GET', '/api/jobs'); closeSheet();
  } catch (e) { fail(e); $('#np-go').disabled = false; }
}

// ------------------------------------------------------------------ STOK
VIEWS.stok = () => {
  const f = M.stockF, q = trLower(M.sq).trim();
  let list = M.products.filter((p) => (!q || q.split(/\s+/).every((w) => trLower([p.name, p.barcodes, p.category].join(' ')).includes(w)))
    && (f === 'all' || (f === 'low' && p.min_stock > 0 && p.stock <= p.min_stock) || (f === 'prod' && p.in_production) || (f === 'zero' && p.stock <= 0)));
  list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const low = M.products.filter((p) => p.min_stock > 0 && p.stock <= p.min_stock).length;
  return `<div class="m-tools"><label class="m-search">${icon('search')}<input id="s-q" placeholder="Ürün veya barkod ara" value="${esc(M.sq)}" autocomplete="off"></label>
      <button class="btn m-scan-btn" id="s-scan" aria-label="Barkod okut">${icon('scan')}</button></div>
    <div class="m-chips">${[['all', 'Tümü'], ['low', `Azalan${low ? ` ${low}` : ''}`], ['zero', 'Stokta yok'], ['prod', 'Baskıda']].map(([v, l]) => `<button class="m-chip${f === v ? ' on' : ''}" data-sf="${v}">${l}</button>`).join('')}</div>
    <div class="m-list">${list.map((p) => `<article class="m-card m-prod${p.min_stock > 0 && p.stock <= p.min_stock ? ' low' : ''}">
        ${thumb(p.thumbnail)}<div class="m-grow" data-count="${p.id}"><b>${esc(p.name)}</b><small>${p.in_production ? `${p.in_production} baskıda · ` : ''}${p.min_stock ? `en az ${p.min_stock}` : esc(p.category || '')}</small></div>
        <div class="m-stk"><button data-sd="${p.id}" data-d="-1" aria-label="Azalt">${icon('minus')}</button><b data-count="${p.id}">${p.stock}</b><button data-sd="${p.id}" data-d="1" aria-label="Arttır">${icon('plus')}</button></div></article>`).join('') || '<p class="m-empty">Ürün bulunamadı.</p>'}</div>`;
};
BIND.stok = () => {
  $('#s-q').oninput = (e) => { M.sq = e.target.value; render(); };
  $$('[data-sf]').forEach((b) => b.onclick = () => { M.stockF = b.dataset.sf; render(); });
  $$('[data-sd]').forEach((b) => b.onclick = async () => {
    const id = +b.dataset.sd, d = +b.dataset.d, p = productById(id);
    if (d < 0 && p.stock <= 0) return toast('Stok zaten 0');
    p.stock += d; render();
    try { const r = await api('POST', `/api/products/${id}/stock`, { delta: d, reason: 'manual' }); p.stock = r.stock; } catch (e) { p.stock -= d; render(); fail(e); }
  });
  $$('[data-count]').forEach((el) => el.onclick = () => openCount(productById(+el.dataset.count)));
  $('#s-scan').onclick = openScan;
};
function openCount(p) {
  if (!p) return;
  sheet(`<div class="m-sh-h">${thumb(p.thumbnail, 'lg')}<div><h3>${esc(p.name)}</h3><small>Sistemde ${p.stock} adet${p.in_production ? ` · ${p.in_production} baskıda` : ''}</small></div></div>
    <p class="m-lbl">Raftaki adet (sayım)</p>${stepper('c-n', p.stock, 0, 9999)}
    <div class="m-col"><button class="btn btn-primary m-wide" id="c-save">Kaydet</button>
      <button class="btn m-wide" id="c-sale">1 adet satıldı (−1)</button><button class="btn btn-ghost m-wide" data-close>Vazgeç</button></div>`);
  bindSteppers();
  $('#m-sheet [data-close]').onclick = closeSheet;
  $('#c-save').onclick = async () => { const n = Math.max(0, parseInt($('#c-n').value) || 0); try { const r = await api('PUT', `/api/products/${p.id}`, { stock: n }); p.stock = r.stock; toast('Stok güncellendi'); closeSheet(); } catch (e) { fail(e); } };
  $('#c-sale').onclick = async () => { try { const r = await api('POST', `/api/products/${p.id}/stock`, { delta: -1, reason: 'sale' }); p.stock = r.stock; toast(`${p.name}: −1 · stok ${r.stock}`); closeSheet(); } catch (e) { fail(e); } };
}
// barkod okutma (kamera; Chrome'un yerleşik barkod okuyucusu)
async function openScan() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    return sheet(`<h3 class="m-sh-t">Barkod okutma</h3><p class="m-note">Bu tarayıcı kamerayla barkod okumayı desteklemiyor ya da bağlantı güvenli (https) değil. Barkodu elle yazın:</p>
      <label class="m-search">${icon('scan')}<input id="sc-code" placeholder="Barkod" autocomplete="off"></label><div class="m-col"><button class="btn btn-primary m-wide" id="sc-go">Bul</button><button class="btn btn-ghost m-wide" data-close>Kapat</button></div>`), scanBindManual();
  }
  let stream;
  sheet(`<h3 class="m-sh-t">Barkodu kameraya gösterin</h3><div class="m-cam"><video id="sc-v" playsinline muted></video><i></i></div>
    <label class="m-search">${icon('scan')}<input id="sc-code" placeholder="ya da elle yazın" autocomplete="off"></label>
    <div class="m-col"><button class="btn btn-primary m-wide" id="sc-go">Bul</button><button class="btn btn-ghost m-wide" data-close>Kapat</button></div>`,
  () => { stream?.getTracks().forEach((t) => t.stop()); });
  scanBindManual();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('#sc-v'); v.srcObject = stream; await v.play();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf'] });
    const loop = async () => {
      if (!M.sheetOpen || !$('#sc-v')) return;
      try { const r = await det.detect(v); if (r[0]?.rawValue) { navigator.vibrate?.(80); stream.getTracks().forEach((t) => t.stop()); return scanFound(r[0].rawValue); } } catch { /* */ }
      requestAnimationFrame(loop);
    };
    loop();
  } catch { toast('Kameraya erişilemedi; barkodu elle yazın', true); }
}
function scanBindManual() {
  $('#m-sheet [data-close]').onclick = closeSheet;
  const go = () => { const c = $('#sc-code').value.trim(); if (c) scanFound(c); };
  $('#sc-go').onclick = go; $('#sc-code').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
function scanFound(code) {
  const c = code.trim().toLowerCase();
  const p = M.products.find((x) => (x.barcodes || '').toLowerCase().split(/[,\s;]+/).includes(c));
  if (!p) { toast(`“${code}” barkodlu ürün yok`, true); return; }
  sheet(`<div class="m-sh-h">${thumb(p.thumbnail, 'lg')}<div><h3>${esc(p.name)}</h3><small>Barkod ${esc(code)} · stok ${p.stock}</small></div></div>
    <p class="m-lbl">Adet</p>${stepper('sc-n', 1, 1, 999)}
    <div class="m-res"><button class="m-choice bad" id="sc-sale">${icon('minus')}<b>Satıldı</b><small>stoktan düş</small></button>
      <button class="m-choice ok" id="sc-add">${icon('plus')}<b>Stoğa ekle</b><small>rafa koydum</small></button></div>
    <div class="m-col"><button class="btn m-wide" id="sc-again">Başka barkod okut</button><button class="btn btn-ghost m-wide" data-close>Kapat</button></div>`);
  bindSteppers();
  $('#m-sheet [data-close]').onclick = closeSheet;
  const n = () => Math.max(1, parseInt($('#sc-n').value) || 1);
  $('#sc-sale').onclick = async () => { try { const r = await api('POST', '/api/scan', { code, quantity: n() }); p.stock = r.stock; toast(`${p.name}: −${n()} · stok ${r.stock}`); closeSheet(); } catch (e) { fail(e); } };
  $('#sc-add').onclick = async () => { try { const r = await api('POST', `/api/products/${p.id}/stock`, { delta: n(), reason: 'manual', note: 'Mobil: barkodla eklendi' }); p.stock = r.stock; toast(`${p.name}: +${n()} · stok ${r.stock}`); closeSheet(); } catch (e) { fail(e); } };
  $('#sc-again').onclick = () => { closeSheet(); setTimeout(openScan, 260); };
}

// ------------------------------------------------------------------ FİLAMENT
const spoolLow = (s) => s.remaining < 150;
VIEWS.filament = () => {
  const f = M.spoolF, q = trLower(M.fq).trim();
  let list = M.spools.filter((s) => (f === 'all' || (f === 'use' && s.remaining > 0) || (f === 'low' && s.remaining > 0 && spoolLow(s)) || (f === 'empty' && s.remaining <= 0))
    && (!q || trLower([s.code, s.brand, s.material, s.color_name].join(' ')).includes(q)));
  list.sort((a, b) => String(a.code).localeCompare(String(b.code), 'tr', { numeric: true }));
  const sum = {};
  M.spools.filter((s) => s.remaining > 0).forEach((s) => { const k = `${s.material}|${s.color_name || ''}|${(s.color_hex || '').toUpperCase()}`; (sum[k] ||= { m: s.material, c: s.color_name, hex: s.color_hex, g: 0 }).g += s.remaining; });
  return `<label class="m-search">${icon('search')}<input id="f-q" placeholder="ID, marka veya renk ara" value="${esc(M.fq)}" autocomplete="off"></label>
    <div class="m-chips">${[['use', 'Kullanımda'], ['low', 'Azalan'], ['empty', 'Bitenler'], ['all', 'Hepsi']].map(([v, l]) => `<button class="m-chip${f === v ? ' on' : ''}" data-ff="${v}">${l}</button>`).join('')}</div>
    <div class="m-sum">${Object.values(sum).sort((a, b) => b.g - a.g).slice(0, 8).map((x) => `<span class="m-chip"><i class="m-dot" style="background:${esc(x.hex || '#888')}"></i>${esc(x.c || '')} ${esc(x.m)} <b>${x.g >= 1000 ? (Math.round(x.g / 100) / 10).toLocaleString('tr-TR') + ' kg' : Math.round(x.g) + ' g'}</b></span>`).join('')}</div>
    <div class="m-list">${list.map((s) => { const pct = s.net_weight ? Math.max(0, Math.min(100, Math.round(s.remaining * 100 / s.net_weight))) : 0; return `<article class="m-card m-spool" data-sp="${s.id}">
        <span class="m-sw" style="background:${esc(s.color_hex || '#888')}${s.photo ? `;background-image:url('${esc(s.photo)}')` : ''}"></span>
        <div class="m-grow"><b>#${esc(s.code)} <small>${esc(s.material || '')}</small>${s.in_use?.length ? ' <span class="m-tag">baskıda</span>' : ''}</b><small>${esc(s.color_name || '')} · ${esc(s.brand || '')}</small>
          <div class="m-bar sm${spoolLow(s) ? ' low' : ''}"><i style="width:${pct}%"></i></div></div>
        <div class="m-g"><b>${Math.round(s.remaining)}</b><small>/ ${Math.round(s.net_weight)} g</small></div></article>`; }).join('') || '<p class="m-empty">Makara bulunamadı.</p>'}</div>`;
};
BIND.filament = () => {
  $('#f-q').oninput = (e) => { M.fq = e.target.value; render(); };
  $$('[data-ff]').forEach((b) => b.onclick = () => { M.spoolF = b.dataset.ff; render(); });
  $$('[data-sp]').forEach((c) => c.onclick = () => openSpool(M.spools.find((s) => s.id === +c.dataset.sp)));
};
function openSpool(s) {
  if (!s) return;
  sheet(`<div class="m-sh-h"><span class="m-sw lg" style="background:${esc(s.color_hex || '#888')}${s.photo ? `;background-image:url('${esc(s.photo)}')` : ''}"></span><div><h3>#${esc(s.code)} · ${esc(s.color_name || '')}</h3><small>${esc(s.material || '')} · ${esc(s.brand || '')} · ${Math.round(s.remaining)} g kaldı</small></div></div>
    <p class="m-lbl">${icon('scale')} Tartıdaki ağırlık (makarayla birlikte)</p>
    <div class="m-time"><input id="w-scale" type="number" inputmode="decimal" placeholder="ör. 640"><span>g</span></div>
    ${s.tare == null ? `<p class="m-lbl">Boş makara ağırlığı</p><div class="m-time"><input id="w-tare" type="number" inputmode="decimal" placeholder="ör. 180"><span>g</span></div>` : `<p class="m-note">Boş makara ${Math.round(s.tare)} g olarak kayıtlı.</p>`}
    <p class="m-lbl">ya da kalan filamenti doğrudan yazın</p><div class="m-time"><input id="w-rem" type="number" inputmode="decimal" placeholder="${Math.round(s.remaining)}"><span>g</span></div>
    <div class="m-col"><button class="btn btn-primary m-wide" id="w-save">Kaydet</button><button class="btn btn-ghost m-wide" data-close>Vazgeç</button></div>`);
  $('#m-sheet [data-close]').onclick = closeSheet;
  $('#w-save').onclick = async () => {
    const sc = parseFloat($('#w-scale').value), rem = parseFloat($('#w-rem').value), tare = $('#w-tare') ? parseFloat($('#w-tare').value) : null;
    try {
      if (sc > 0) await api('POST', `/api/spools/${s.id}/weigh`, { scale: sc, tare: isNaN(tare) ? undefined : tare });
      else if (rem >= 0) await api('PUT', `/api/spools/${s.id}`, { remaining: rem });
      else return toast('Tartı ağırlığını ya da kalanı yazın', true);
      M.spools = (await api('GET', '/api/spools')).spools; toast(`#${s.code} güncellendi`); closeSheet();
    } catch (e) { fail(e); }
  };
}

// ------------------------------------------------------------------ BİLDİRİMLER
const NK = { printer: 'print', print_done: 'check', trendyol: 'cart', stock: 'alert' };
VIEWS.bildirim = () => {
  const it = M.notif.items || [], act = it.filter((n) => !n.resolved_at), old = it.filter((n) => n.resolved_at);
  const row = (n) => { const ign = !n.resolved_at && n.action?.t === 'job';
    return `<div class="m-nf-w${ign ? ' has-ign' : ''}"><button class="m-card m-nf ${n.resolved_at ? 'done' : 'live'} lv-${n.level || 'info'}" data-nf="${n.id}"><span class="m-ic">${icon(NK[n.kind] || 'bell')}</span>
    <span class="m-grow"><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}<small class="m-t">${fmtWhen(n.updated_at || n.created_at)}${n.resolved_at ? ' · ' + (n.resolved_by === 'user' ? 'kapatıldı' : 'çözüldü') : ''}</small></span></button>
    ${ign ? `<button class="btn btn-ghost btn-sm m-nf-ign" data-nf-ign="${n.action.id}">Yoksay</button>` : ''}</div>`; };
  return `${pushCard()}
    ${act.length ? `<div class="m-hrow"><h2 class="m-h">Bekleyen <span class="m-n">${act.length}</span></h2><button class="btn btn-ghost btn-sm" id="nf-all">Hepsini kapat</button></div>${act.map(row).join('')}` : '<p class="m-empty">Bekleyen bildirim yok.</p>'}
    ${old.length ? `<h2 class="m-h">Geçmiş</h2>${old.slice(0, 40).map(row).join('')}` : ''}`;
};
BIND.bildirim = () => {
  $$('[data-nf]').forEach((b) => b.onclick = async () => {
    const n = M.notif.items.find((x) => x.id === +b.dataset.nf); if (!n) return;
    if (!n.resolved_at) { n.resolved_at = nowS(); n.resolved_by = 'user'; M.notif.active = Math.max(0, M.notif.active - 1); api('POST', `/api/notifications/${n.id}/resolve`).catch(() => {}); }
    const a = n.action || {};
    if (a.t === 'job') location.hash = `#baskilar?job=${a.id}`;
    else if (a.t === 'bambu') location.hash = `#baskilar?ev=${encodeURIComponent(a.id)}`;
    else if (a.t === 'spool') location.hash = '#filament';
    else if (a.t === 'product') { M.sq = productById(a.id)?.name || ''; location.hash = '#stok'; }
    else if (n.kind === 'printer' || n.kind === 'print_done') location.hash = '#baskilar';
    else render();
  });
  $$('[data-nf-ign]').forEach((b) => b.onclick = async (e) => { e.stopPropagation(); b.disabled = true; if (!(await mIgnoreJob(+b.dataset.nfIgn))) b.disabled = false; });
  $('#nf-all')?.addEventListener('click', async () => { try { await api('POST', '/api/notifications/resolve-all'); M.notif = await api('GET', '/api/notifications'); render(); } catch (e) { fail(e); } });
  bindPush();
};

// telefon bildirimleri (Web Push): https gerekir
function pushState() {
  if (!window.isSecureContext) return 'insecure';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return M.pushSub ? 'on' : 'off';
}
function pushCard() {
  const st = pushState();
  const msg = {
    insecure: 'Telefon bildirimleri için uygulamayı <b>https</b> adresinden açın (Tailscale kurulumu BENIOKU\'da). Şu an ev ağı adresiyle açık; bildirimler sadece uygulama açıkken görünür.',
    unsupported: 'Bu tarayıcı telefon bildirimlerini desteklemiyor. Android\'de Chrome kullanın.',
    denied: 'Bildirim izni reddedilmiş. Telefon Ayarlar → Uygulamalar → Astera → Bildirimler\'den izin verin.',
    off: 'Baskı bitince, yazıcı tanımadığı bir baskıya başlayınca ve yeni sipariş gelince telefona bildirim gelsin.',
    on: 'Telefon bildirimleri açık.',
  }[st];
  const sound = st === 'on' ? `<details class="m-help"><summary>Ses ve titreşim gelmiyor mu?</summary><ol>
      <li>Telefon <b>Ayarlar → Uygulamalar → Astera → Bildirimler</b>'e girin. (Astera listede yoksa: <b>Chrome → Bildirimler → Siteler</b>, bu adres.)</li>
      <li>Kategorilere dokunup <b>Uyarı ver / Sesli</b>'yi seçin, <b>Ses</b> ve <b>Titreşim</b>'i açın. "Sessiz" seçiliyse ses çıkmaz.</li>
      <li>İsterseniz <b>Ekranda açılır pencere</b> ve <b>Rahatsız Etmeyin'i geçersiz kıl</b>'ı da açın.</li>
      <li>Pil tasarrufunda Chrome / Astera'yı <b>Kısıtlanmamış</b> yapın; yoksa bildirimler gecikebilir.</li>
      <li><b>Deneme gönder</b> ile kontrol edin. Uygulama açıkken gelen bildirimlerde de ses ve titreşim olur.</li></ol></details>` : '';
  return `<article class="m-card m-push ${st}"><span class="m-ic">${icon('bell')}</span><div class="m-grow"><b>Telefon bildirimleri</b><small>${msg}</small>
    ${st === 'off' ? '<button class="btn btn-primary btn-sm" id="push-on">Bildirimleri aç</button>' : st === 'on' ? '<div class="m-actions"><button class="btn btn-sm" id="push-test">Deneme gönder</button><button class="btn btn-ghost btn-sm" id="push-off">Kapat</button></div>' : ''}${sound}</div></article>`;
}
function b64ToBytes(s) { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
function bindPush() {
  $('#push-on')?.addEventListener('click', async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return render();
      const reg = await navigator.serviceWorker.ready;
      const { key } = await api('GET', '/api/push/key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      await api('POST', '/api/push/subscribe', { subscription: sub.toJSON(), ua: navigator.userAgent });
      M.pushSub = sub; toast('Telefon bildirimleri açıldı'); render();
    } catch (e) { fail(e); }
  });
  $('#push-test')?.addEventListener('click', async () => { try { const r = await api('POST', '/api/push/test'); toast(`Deneme gönderildi (${r.subscribers} cihaz)`); } catch (e) { fail(e); } });
  $('#push-off')?.addEventListener('click', async () => { try { await api('POST', '/api/push/unsubscribe', { endpoint: M.pushSub.endpoint }); await M.pushSub.unsubscribe(); M.pushSub = null; render(); } catch (e) { fail(e); } });
}

// ------------------------------------------------------------------ başlangıç
async function boot() {
  $('#m-back').onclick = closeSheet;
  $('#m-fab').onclick = () => openNewPrint();
  window.addEventListener('hashchange', () => { if (M.sheetOpen) { document.body.classList.remove('sheet-open'); M.sheetOpen = false; } go(); });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    try {
      const reg = await navigator.serviceWorker.register('/m/sw.js', { scope: '/m/' });
      M.pushSub = await reg.pushManager?.getSubscription?.() || null;
    } catch { /* */ }
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.go) { location.href = e.data.go; } });
  }
  try { await loadAll(); } catch (e) { setConn(false); $('#mv').innerHTML = `<p class="m-empty">Sunucuya ulaşılamadı. Bilgisayarda Astera açık mı ve telefon aynı ağda (ya da Tailscale'de) mi?<br><br><button class="btn" onclick="location.reload()">Tekrar dene</button></p>`; return; }
  api('GET', '/api/spools').then((d) => { M.spools = d.spools; if (M.route === 'filament') render(); }).catch(() => {});
  go();
  setInterval(tick, 1000);
  setInterval(poll, 8000);
  setInterval(() => { if (M.route === 'stok' && !M.sheetOpen && document.activeElement?.id !== 's-q') api('GET', '/api/products').then((p) => { M.products = p; render(); }).catch(() => {}); }, 30000);
  setInterval(() => { if (M.route === 'filament' && !M.sheetOpen && document.activeElement?.id !== 'f-q') api('GET', '/api/spools').then((d) => { M.spools = d.spools; render(); }).catch(() => {}); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
}
boot();
