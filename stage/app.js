// Winner reveal (spec 9.6). Space, Enter, click or the right arrow advances; the left arrow goes back; F toggles fullscreen.
// Order per category: consolation, then winners from the lowest place up to 1st. Needs the admin key and computed Results.
import { t, getLang, setLang, onLang, addStrings } from '../assets/i18n.js';
import { store, apiGet } from '../assets/api.js';

addStrings({
  sgTitle: ['Pengumuman Pemenang', 'Winners Announcement'], sgColouring: ['Colouring Contest', 'Colouring Contest'],
  sgConsolation: ['Hadiah Saguhati', 'Consolation Prizes'], sgNoKey: ['Buka /admin/ dahulu supaya kunci admin tersimpan dalam pelayar ini.', 'Open /admin/ first so the admin key is stored in this browser.'],
  sgNoResults: ['Tiada keputusan. Tekan "Kira keputusan" di konsol admin.', 'No results yet. Press "Compute results" in the admin console.'],
  sgHint: ['Ruang / klik: seterusnya · ←: kembali · F: skrin penuh', 'Space / click: next · ←: back · F: fullscreen'],
  sgTie: ['Seri belum diselesaikan dalam kedudukan hadiah: {ids}', 'Unresolved tie among prize places: {ids}'],
  sgFull: ['Skrin penuh', 'Fullscreen'], sgAdmin: ['Admin', 'Admin'], sgPlace: ['Tempat ke-{n}', 'Place {n}'],
  sgP1: ['Tempat Pertama', '1st Place'], sgP2: ['Tempat Kedua', '2nd Place'], sgP3: ['Tempat Ketiga', '3rd Place'], sgThanks: ['Tahniah kepada semua peserta!', 'Congratulations to all participants!']
});

const root = document.getElementById('root');
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isT = v => v === true || String(v).trim().toUpperCase() === 'TRUE';

let steps = [], idx = 0, data = null, warn = '';

function build() {
  const win = parseInt(data.config.winnersPerCategory, 10) || 3, con = parseInt(data.config.consolationPerCategory, 10) || 5;
  const names = isT(data.config.showNamesOnStage);
  const person = pid => { const p = data.participants.find(x => x.pid === pid); return { pid, name: names && p ? p.childName : '' }; };
  steps = [{ type: 'intro' }];
  const unresolved = [];
  ['A', 'B'].forEach(cat => {
    const rows = data.results.filter(r => r.category === cat).sort((a, b) => a.rank - b.rank);
    if (!rows.length) return;
    rows.filter(r => r.rank <= win + con && String(r.flag).indexOf('TIE-UNRESOLVED') >= 0).forEach(r => unresolved.push(r.pid));
    steps.push({ type: 'cat', cat });
    const cons = rows.filter(r => r.rank > win && r.rank <= win + con).map(r => person(r.pid));
    if (cons.length) steps.push({ type: 'con', cat, list: cons });
    for (let rk = Math.min(win, rows.length); rk >= 1; rk--) steps.push({ type: 'place', cat, rank: rk, who: person(rows[rk - 1].pid) });
  });
  steps.push({ type: 'end' });
  warn = unresolved.length ? t('sgTie', { ids: unresolved.join(', ') }) : '';
}

const placeName = n => (n === 1 ? t('sgP1') : n === 2 ? t('sgP2') : n === 3 ? t('sgP3') : t('sgPlace', { n }));

function slide(s) {
  if (s.type === 'intro') return `<div class="st-slide"><div class="st-kicker">${esc(data.config.eventName || '')}</div><div class="st-title">${esc(t('sgColouring'))}</div><div class="st-sub">${esc(t('sgTitle'))}</div></div>`;
  if (s.type === 'cat') return `<div class="st-slide"><div class="st-cat ${s.cat}">${esc(t('category', { c: s.cat }))}</div></div>`;
  if (s.type === 'end') return `<div class="st-slide"><div class="st-title sm">${esc(t('sgThanks'))}</div></div>`;
  if (s.type === 'con') return `<div class="st-slide"><div class="st-cat ${s.cat}" style="font-size:calc(var(--u)*.7)">${esc(t('category', { c: s.cat }))}</div><div class="st-place" style="margin-top:calc(var(--u)*.2)">${esc(t('sgConsolation'))}</div>
    <div class="st-grid">${s.list.map(w => `<div class="st-card"><b>${esc(w.pid)}</b>${w.name ? `<span>${esc(w.name)}</span>` : ''}</div>`).join('')}</div></div>`;
  return `<div class="st-slide"><div class="st-cat ${s.cat}" style="font-size:calc(var(--u)*.7)">${esc(t('category', { c: s.cat }))}</div>
    <div class="st-panel r${Math.min(s.rank, 3)}"><div class="st-place">${esc(placeName(s.rank))}</div><div class="st-id">${esc(s.who.pid)}</div>${s.who.name ? `<div class="st-name">${esc(s.who.name)}</div>` : ''}</div></div>`;
}

function render() {
  if (!data) return;
  const s = steps[idx];
  root.innerHTML = `<div class="st-frame"><div class="st-beams"></div>${slide(s)}
    ${idx === 0 && warn ? `<div class="st-warn">${esc(warn)}</div>` : ''}
    <div class="st-dots">${steps.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('')}</div><div class="st-hint">${esc(t('sgHint'))}</div></div>
    <div class="st-tools"><button id="lng">${getLang() === 'bm' ? 'EN' : 'BM'}</button><button id="fs">${esc(t('sgFull'))}</button><a href="../admin/#/results">${esc(t('sgAdmin'))}</a></div>`;
  document.getElementById('lng').onclick = ev => { ev.stopPropagation(); setLang(getLang() === 'bm' ? 'en' : 'bm'); };
  document.getElementById('fs').onclick = ev => { ev.stopPropagation(); toggleFs(); };
}

function toggleFs() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); }
function go(d) { const n = Math.max(0, Math.min(steps.length - 1, idx + d)); if (n !== idx) { idx = n; render(); } }

document.addEventListener('keydown', ev => {
  if (!data) return;
  if (ev.key === ' ' || ev.key === 'Enter' || ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); go(1); }
  else if (ev.key === 'ArrowLeft' || ev.key === 'Backspace' || ev.key === 'PageUp') { ev.preventDefault(); go(-1); }
  else if (ev.key === 'f' || ev.key === 'F') toggleFs();
});
document.addEventListener('click', ev => { if (data && !ev.target.closest('.st-tools')) go(1); });
onLang(render);

async function boot() {
  const key = store.get('fsb.adminKey', '');
  if (!key) { root.innerHTML = `<div class="st-frame"><div class="st-msg">${esc(t('sgNoKey'))}</div></div>`; return; }
  try { data = await apiGet('adminOverview', { k: key }); }
  catch (e) { root.innerHTML = `<div class="st-frame"><div class="st-msg">${esc(e.message)}</div></div>`; return; }
  if (!data.results.length) { root.innerHTML = `<div class="st-frame"><div class="st-msg">${esc(t('sgNoResults'))}</div></div>`; data = null; return; }
  build();
  render();
}
boot();
