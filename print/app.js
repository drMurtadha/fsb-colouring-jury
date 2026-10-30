// QR label sheets (spec 9.5). Label = QR of {baseUrl}/a/?p={pid}, the ID, the category, the event name. No child name.
import { t, getLang, setLang, onLang, addStrings } from '../assets/i18n.js';
import { store, apiGet } from '../assets/api.js';
import qrcode from '../assets/vendor/qrcode-generator.js';

addStrings({
  prTitle: ['Cetak label QR', 'Print QR labels'], prWho: ['Label untuk', 'Labels for'],
  prAll: ['Semua peserta aktif', 'All active participants'], prChecked: ['Yang telah daftar masuk sahaja', 'Checked-in only'],
  prSel: ['ID dipilih', 'Selected IDs'], prWalk: ['Satu peserta jalan masuk', 'One walk-in'],
  prSelHint: ['cth. A-001, A-014, B-3', 'e.g. A-001, A-014, B-3'], prTwo: ['2 setiap peserta (karya + keping tuntutan hadiah)', '2 per participant (artwork + prize-claim stub)'],
  prGuides: ['Cetak garis panduan (untuk ujian pada kertas biasa)', 'Print outline guides (for plain-paper tests)'],
  prLayout: ['Susun atur helaian (mm)', 'Sheet layout (mm)'], prCols: ['Lajur', 'Columns'], prRows: ['Baris', 'Rows'],
  prW: ['Lebar label', 'Label width'], prH: ['Tinggi label', 'Label height'], prMT: ['Jidar atas', 'Top margin'], prML: ['Jidar kiri', 'Left margin'],
  prGX: ['Jurang mendatar', 'Horizontal gap'], prGY: ['Jurang menegak', 'Vertical gap'], prReset: ['Set semula', 'Reset'],
  prPrint: ['Cetak', 'Print'], prCount: ['{n} label, {p} helaian A4', '{n} labels, {p} A4 page(s)'],
  prNoKey: ['Buka /admin/ dahulu supaya kunci admin tersimpan dalam pelayar ini.', 'Open /admin/ first so the admin key is stored in this browser.'],
  prBase: ['baseUrl dalam Config masih tempat letak. Kod QR akan menuju ke alamat yang salah.', 'Config.baseUrl is still a placeholder. QR codes would point to the wrong address.'],
  prSmall: ['Kod QR kurang daripada 22 mm; kurangkan tinggi label tidak disyorkan.', 'QR is under 22 mm; a label this short is not recommended.'],
  prStub: ['Simpan untuk tuntutan hadiah', 'Keep to claim your prize'], prNone: ['Tiada label dipilih.', 'No labels selected.'], prBack: ['Admin', 'Admin']
});

const DEFAULTS = { cols: 3, rows: 8, w: 63.5, h: 33.9, mt: 13.1, ml: 7.2, gx: 2.5, gy: 0 };   // 24 labels, J8159-style grid
const root = document.getElementById('root');
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);

let data = null;
const st = { mode: 'all', ids: '', walk: '', two: false, guides: false, layout: Object.assign({}, DEFAULTS, store.get('fsb.printLayout', {})) };
const qIds = new URLSearchParams(location.search).get('ids');
if (qIds) { st.mode = 'sel'; st.ids = qIds; }

const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const pidNum = p => p.pid.charAt(0) + String(p.pid.slice(2)).padStart(5, '0');

function parseIds(text) {
  const out = [], re = /([AB])\s*-?\s*(\d{1,4})/gi;
  let m;
  while ((m = re.exec(text))) out.push(m[1].toUpperCase() + '-' + String(parseInt(m[2], 10)).padStart(3, '0'));
  return out;
}

function chosen() {
  const all = data.participants.filter(p => p.status === 'active');
  let list;
  if (st.mode === 'checked') list = all.filter(p => p.checkedIn);
  else if (st.mode === 'sel') { const ids = new Set(parseIds(st.ids)); list = data.participants.filter(p => ids.has(p.pid)); }
  else if (st.mode === 'walk') list = data.participants.filter(p => p.pid === st.walk);
  else list = all;
  return list.slice().sort((a, b) => (pidNum(a) < pidNum(b) ? -1 : 1));
}

function qrSvg(pid) {
  const base = String(data.config.baseUrl || '').replace(/\/+$/, '');
  const q = qrcode(0, 'Q');                      // error correction Q, version picked automatically
  q.addData(base + '/a/?p=' + pid);
  q.make();
  return q.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
}

function sheetsHtml(list) {
  const L = st.layout, per = Math.max(1, L.cols * L.rows);
  const qr = Math.max(0, Math.min(26, L.h - 6, L.w * 0.45));
  const items = [];
  list.forEach(p => { items.push({ p, stub: false }); if (st.two) items.push({ p, stub: true }); });
  const pages = [];
  for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
  const ev = data.config.eventName || '';
  return {
    count: items.length, pages: pages.length, qr,
    html: pages.map(pg => `<div class="psheet ${st.guides ? 'guides' : ''}">${pg.map((it, k) => {
      const c = k % L.cols, r = Math.floor(k / L.cols);
      const left = L.ml + c * (L.w + L.gx), top = L.mt + r * (L.h + L.gy);
      return `<div class="lab ${it.stub ? 'stub' : ''}" data-pid="${esc(it.p.pid)}" style="left:${left}mm;top:${top}mm;width:${L.w}mm;height:${L.h}mm">
        <div class="qr" style="width:${qr}mm;height:${qr}mm">${qrSvg(it.p.pid)}</div>
        <div class="txt"><div class="id">${esc(it.p.pid)}</div><div class="cat">${esc(it.stub ? t('prStub') : t('category', { c: it.p.category }))}</div><div class="ev">${esc(ev)}</div></div></div>`;
    }).join('')}</div>`).join('')
  };
}

function view() {
  const L = st.layout, list = chosen(), sh = sheetsHtml(list);
  const walks = data.participants.filter(p => p.source === 'walkin');
  if (st.mode === 'walk' && !st.walk && walks.length) st.walk = walks[walks.length - 1].pid;
  const radio = (v, label) => `<label class="in"><input type="radio" name="mode" value="${v}" ${st.mode === v ? 'checked' : ''}> ${esc(label)}</label>`;
  const nf = (k, label) => `<label>${esc(label)}<input type="number" step="0.1" data-l="${k}" value="${L[k]}"></label>`;
  const keep = $('#idsIn') === document.activeElement;
  root.innerHTML = `<div class="ctl"><div class="f" style="justify-content:space-between"><h1>${esc(t('prTitle'))}</h1><span><a class="linkbtn" href="../admin/">${esc(t('prBack'))}</a> <button class="lang" id="langBtn">${getLang() === 'bm' ? 'EN' : 'BM'}</button></span></div>
    ${String(data.config.baseUrl || '').indexOf('<') >= 0 ? `<div class="warn">${esc(t('prBase'))}</div>` : ''}
    <fieldset><legend>${esc(t('prWho'))}</legend>
      ${radio('all', t('prAll'))}${radio('checked', t('prChecked'))}
      ${radio('sel', t('prSel'))}<input type="text" id="idsIn" placeholder="${esc(t('prSelHint'))}" value="${esc(st.ids)}">
      ${radio('walk', t('prWalk'))}<select id="walkSel" style="width:auto">${walks.map(w => `<option ${w.pid === st.walk ? 'selected' : ''}>${esc(w.pid)}</option>`).join('')}</select>
      <label class="in"><input type="checkbox" id="two" ${st.two ? 'checked' : ''}> ${esc(t('prTwo'))}</label>
      <label class="in"><input type="checkbox" id="guides" ${st.guides ? 'checked' : ''}> ${esc(t('prGuides'))}</label></fieldset>
    <fieldset><legend>${esc(t('prLayout'))}</legend><div class="f">${nf('cols', t('prCols'))}${nf('rows', t('prRows'))}${nf('w', t('prW'))}${nf('h', t('prH'))}${nf('mt', t('prMT'))}${nf('ml', t('prML'))}${nf('gx', t('prGX'))}${nf('gy', t('prGY'))}
      <button class="btn sm" id="reset" style="min-height:36px">${esc(t('prReset'))}</button></div></fieldset>
    ${sh.qr < 22 ? `<div class="warn">${esc(t('prSmall'))}</div>` : ''}
    <div class="f"><button class="btn primary" id="go" style="width:auto;padding:0 28px;min-height:48px" ${sh.count ? '' : 'disabled'}>${esc(t('prPrint'))}</button>
      <span class="info">${esc(sh.count ? t('prCount', { n: sh.count, p: sh.pages }) : t('prNone'))} · QR ${sh.qr.toFixed(1)} mm</span></div></div>
    <div class="pages">${sh.html}</div>`;
  $('#langBtn').onclick = () => setLang(getLang() === 'bm' ? 'en' : 'bm');
  $('#go').onclick = () => window.print();
  $('#reset').onclick = () => { st.layout = Object.assign({}, DEFAULTS); store.set('fsb.printLayout', st.layout); view(); };
  document.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => { st.mode = r.value; view(); });
  $('#idsIn').oninput = ev => { st.ids = ev.target.value; st.mode = 'sel'; const pos = ev.target.selectionStart; view(); const f = $('#idsIn'); f.focus(); f.setSelectionRange(pos, pos); };
  $('#walkSel').onchange = ev => { st.walk = ev.target.value; st.mode = 'walk'; view(); };
  $('#two').onchange = ev => { st.two = ev.target.checked; view(); };
  $('#guides').onchange = ev => { st.guides = ev.target.checked; view(); };
  document.querySelectorAll('[data-l]').forEach(i => i.onchange = () => {
    st.layout[i.dataset.l] = i.dataset.l === 'cols' || i.dataset.l === 'rows' ? Math.max(1, Math.round(num(i.value))) : num(i.value);
    store.set('fsb.printLayout', st.layout); view();
  });
  if (keep) $('#idsIn').focus();
}

async function boot() {
  const key = store.get('fsb.adminKey', '');
  if (!key) { root.innerHTML = `<div class="ctl"><p class="err">${esc(t('prNoKey'))}</p><a class="btn sm" href="../admin/">Admin</a></div>`; return; }
  try { data = await apiGet('adminOverview', { k: key }); }
  catch (e) { root.innerHTML = `<div class="ctl"><p class="err">${esc(e.message)}</p><a class="btn sm" href="../admin/">Admin</a></div>`; return; }
  view();
}
onLang(() => { if (data) view(); });
boot();
