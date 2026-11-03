// Üst yazıcı barı (masaüstü ve telefon uygulaması ortak).
// Hata veren yazıcılar solda sabit durur; diğerleri sığmazsa haber bandı gibi yavaşça kayar, üstüne gelince durur.
// Yoklamada yalnızca değişen yazılar/sınıflar güncellenir; kayma ve yanıp sönme animasyonları baştan başlamaz.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SPEED = 38;   // px / saniye
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cls = (o) => `pb s-${o.s}${o.ack ? ' ack' : ''}${o.heat ? ` heat-${o.heat}` : ''}`;
  const pill = (o) => `<button type="button" class="${cls(o)}" data-act="pb" data-name="${esc(o.name)}"${o.nid ? ` data-nid="${o.nid}"` : ''} title="${esc(o.tip || o.name)}"><i></i><b>${esc(o.name)}</b><small>${o.info}</small></button>`;

  function fit(el) {
    const track = el.querySelector('.pb-track'), belt = el.querySelector('.pb-belt');
    if (!track || !belt) return;
    const sets = belt.querySelectorAll('.pb-set');
    const first = sets[0];
    const wrap = el.dataset.mode === 'wrap';
    track.classList.toggle('wrap', wrap);
    if (wrap) {   // kaydırma kapalı: sığmayanlar alt satıra geçer
      if (sets.length > 1) sets[1].remove();
      track.classList.remove('run', 'manual'); belt.classList.remove('run');
      return;
    }
    const over = first && first.children.length && first.scrollWidth > track.clientWidth + 2;
    if (reduced()) { track.classList.toggle('manual', !!over); return; }
    if (over) {
      if (sets.length < 2) {
        const clone = first.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('button').forEach((b) => b.tabIndex = -1);
        belt.appendChild(clone);
      }
      const w = first.getBoundingClientRect().width;
      belt.style.setProperty('--pb-dur', `${Math.max(12, w / SPEED).toFixed(1)}s`);
      track.classList.add('run'); belt.classList.add('run');
    } else {
      if (sets.length > 1) sets[1].remove();
      track.classList.remove('run'); belt.classList.remove('run');
    }
  }

  // list: [{ name, s: err|paused|run|idle|off, ack, nid, info (html), tip }]
  function render(el, list) {
    if (!el) return;
    el.hidden = !list.length;
    const pinned = list.filter((o) => o.s === 'err'), rest = list.filter((o) => o.s !== 'err');
    const key = pinned.map((o) => o.name).join('|') + '#' + rest.map((o) => o.name).join('|');
    const key2 = key + '|' + (el.dataset.mode || '');
    if (el.dataset.key !== key2) {
      el.dataset.key = key2;
      el.innerHTML = `${pinned.length ? `<div class="pb-pin">${pinned.map(pill).join('')}</div>` : ''}<div class="pb-track"><div class="pb-belt"><div class="pb-set">${rest.map(pill).join('')}</div></div></div>`;
      fit(el);
      return;
    }
    // yerinde güncelle (her iki kopyada da)
    let widthMayChange = false;
    list.forEach((o) => {
      el.querySelectorAll(`.pb[data-name="${CSS.escape(o.name)}"]`).forEach((b) => {
        const c = cls(o);
        if (b.className !== c) b.className = c;
        const sm = b.querySelector('small');
        if (sm && sm.innerHTML !== o.info) { sm.innerHTML = o.info; widthMayChange = true; }
        if ((o.tip || o.name) !== b.title) b.title = o.tip || o.name;
        if (o.nid) b.dataset.nid = o.nid; else delete b.dataset.nid;
      });
    });
    if (widthMayChange) {
      // sadece taşma durumu değiştiyse yeniden ayarla (hız değişip bant zıplamasın)
      const track = el.querySelector('.pb-track'), first = el.querySelector('.pb-set');
      const over = first && first.scrollWidth > (track?.clientWidth || 0) + 2;
      if (el.dataset.mode !== 'wrap' && !!over !== !!track?.classList.contains('run')) fit(el);
    }
  }

  let t = null;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => document.querySelectorAll('.pbar').forEach(fit), 150); });
  document.fonts?.ready?.then(() => document.querySelectorAll('.pbar').forEach(fit));
  window.pbarRender = render;
})();
