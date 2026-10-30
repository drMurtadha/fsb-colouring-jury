// Programme (Aturcara) display: which slot is current, and the list markup. No DOM or storage at import time (tested in Node).
export const EVENT_DATE = '2026-11-15';
export const TZ = 'Asia/Kuala_Lumpur';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mins = hm => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); return m ? +m[1] * 60 + +m[2] : null; };

/** Date and minutes since midnight in Kuala Lumpur, whatever the device's own time zone. */
export function klNow(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}

/** Index of the item running now (start inclusive, end exclusive), or -1: not event day, a gap, or no usable times. */
export function currentSlot(items, now) {
  if (!now || now.date !== EVENT_DATE) return -1;
  return items.findIndex(i => { const s = mins(i.start), e = mins(i.end); return s !== null && e !== null && now.minutes >= s && now.minutes < e; });
}

/**
 * <ol> markup. opts: lang 'bm'|'en', now (from klNow), labels {now, jury}.
 * Items with an audience of 'juri' get a tag (jury view only; the public response has no audience).
 */
export function scheduleHtml(items, opts) {
  const en = opts.lang === 'en', cur = currentSlot(items, opts.now), L = opts.labels || {};
  return `<ol class="prog">${items.map((i, k) => {
    const name = en && i.en ? i.en : i.bm;
    const time = i.start && i.end ? `${i.start} - ${i.end}` : i.start || '';
    return `<li${k === cur ? ' class="now" aria-current="true"' : ''}><time>${esc(time)}</time><span class="act">${esc(name)}</span>`
      + (i.audience === 'juri' ? `<em class="tag">${esc(L.jury || 'Juri')}</em>` : '')
      + (k === cur ? `<strong class="nowtag">${esc(L.now || 'Sekarang')}</strong>` : '') + '</li>';
  }).join('')}</ol>`;
}

/**
 * Paints into `el` and moves the highlight along every 30 s while `el` is still on the page.
 * getState() -> {items, lang, labels}; a ?now=2026-11-15T10:15:00+08:00 query overrides the clock (for checking the layout).
 */
export function mountSchedule(el, getState) {
  const q = new URLSearchParams(location.search).get('now'), fake = q && !isNaN(Date.parse(q)) ? new Date(q) : null;
  const paint = () => { const s = getState(); el.innerHTML = scheduleHtml(s.items, { lang: s.lang, labels: s.labels, now: klNow(fake || new Date()) }); };
  paint();
  clearInterval(el._schedTimer);                      // remounting on the same element must not stack timers
  const timer = el._schedTimer = setInterval(() => { if (!el.isConnected) clearInterval(timer); else paint(); }, 30000);
  return paint;
}
