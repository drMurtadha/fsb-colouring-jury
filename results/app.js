// Public results (spec 9.7): only visible after the admin publishes. ID and first name only.
import { t, getLang, setLang, onLang, addStrings } from '../assets/i18n.js';
import { apiGet } from '../assets/api.js';

addStrings({
  rsTitle: ['Keputusan Pertandingan Mewarna', 'Colouring Contest Results'],
  rsSoon: ['Keputusan akan diumumkan', 'Results coming soon'], rsSoonSub: ['Sila semak semula selepas pengumuman di lokasi.', 'Please check again after the announcement at the venue.'],
  rsWin: ['Pemenang', 'Winners'], rsCon: ['Hadiah Saguhati', 'Consolation prizes'], rsErr: ['Tidak dapat memuatkan keputusan.', 'Could not load the results.']
});

const root = document.getElementById('root');
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = { kind: 'loading' };
let timer = null;

const shell = body => `<div class="hero"><div style="text-align:right"><button class="lang" id="langBtn">${getLang() === 'bm' ? 'EN' : 'BM'}</button></div>
  <div class="event">${esc(state.data ? state.data.eventName : 'FSB Johor 2026')}</div><h1 class="hello">${esc(t('rsTitle'))}</h1></div>${body}`;

function block(cat, list) {
  const row = w => `<div class="rs-row"><div class="rs-rank ${w.rank <= 3 ? 'r' + w.rank : ''}">${w.rank}</div><div><div class="rs-id">${esc(w.pid)}</div><div class="rs-name">${esc(w.firstName)}</div></div></div>`;
  const win = list.filter(w => w.tier === 'winner'), con = list.filter(w => w.tier === 'consolation');
  return `<div class="card"><h3><span>${esc(t('category', { c: cat }))}</span></h3>
    <div class="rs-tier">${esc(t('rsWin'))}</div>${win.map(row).join('')}
    ${con.length ? `<div class="rs-tier">${esc(t('rsCon'))}</div>${con.map(row).join('')}` : ''}</div>`;
}

function render() {
  let body;
  if (state.kind === 'soon') body = `<div class="card"><h3>${esc(t('rsSoon'))}</h3><p style="margin:8px 0 0">${esc(t('rsSoonSub'))}</p></div>`;
  else if (state.kind === 'error') body = `<div class="card"><p class="err" style="margin:0">${esc(t('rsErr'))}</p></div>`;
  else if (state.kind === 'ok') body = ['A', 'B'].map(c => block(c, state.data[c])).join('');
  else body = '<div class="card">…</div>';
  root.innerHTML = shell(body);
  document.getElementById('langBtn').onclick = () => setLang(getLang() === 'bm' ? 'en' : 'bm');
}

async function load() {
  try { state = { kind: 'ok', data: await apiGet('publicResults', {}) }; }
  catch (e) { state = { kind: e.code === 'NOT_PUBLISHED' ? 'soon' : 'error' }; }
  render();
  clearTimeout(timer);
  if (state.kind !== 'ok') timer = setTimeout(load, 30000);   // flips to the winners by itself once published
}
onLang(render);
render();
load();
