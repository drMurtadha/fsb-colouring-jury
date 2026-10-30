// Admin console (spec 9.4). All data comes from adminOverview; writes go through the section 10 actions.
// /admin/?k=ADMIN_KEY (key then kept in localStorage); add &mode=desk for the check-in desk.
import { t, getLang, setLang, onLang, addStrings } from '../assets/i18n.js';
import { store, apiGet, apiPost } from '../assets/api.js';

addStrings({
  adminTitle: ['Konsol Admin', 'Admin console'],
  tOverview: ['Gambaran', 'Overview'], tParticipants: ['Peserta', 'Participants'], tJuries: ['Juri', 'Juries'],
  tScores: ['Skor', 'Scores'], tResults: ['Keputusan', 'Results'], tPrint: ['Cetak', 'Print'], tCheckin: ['Daftar masuk', 'Check-in'],
  registered: ['Berdaftar', 'Registered'], checkedIn: ['Telah daftar masuk', 'Checked in'], activeN: ['Aktif', 'Active'],
  complete: ['Siap dinilai (min. juri)', 'Fully scored (min. juries)'], coverage: ['Liputan penilaian', 'Scoring coverage'],
  belowMin: ['Di bawah bilangan juri minimum', 'Below minimum jury count'], flags: ['Perbezaan skor tinggi (semak semula)', 'Large disagreement (second look)'],
  juryLastSeen: ['Juri terakhir dilihat', 'Jury last seen'], never: ['belum pernah', 'never'], minAgo: ['{n} min lalu', '{n} min ago'],
  search: ['Cari ID atau nama', 'Search ID or name'], notIn: ['Belum daftar masuk sahaja', 'Not checked in only'],
  sync: ['Segerak pendaftaran', 'Sync registrations'], syncOut: ['Ditambah {a}, dilangkau {s}', 'Added {a}, skipped {s}'],
  walkin: ['Peserta jalan masuk', 'Walk-in'], childName: ['Nama kanak-kanak', 'Child name'], age: ['Umur', 'Age'],
  gName: ['Nama penjaga', 'Guardian name'], gPhone: ['WhatsApp penjaga', 'Guardian WhatsApp'], add: ['Tambah', 'Add'],
  added: ['{pid} ditambah', '{pid} added'], printQr: ['Cetak QR', 'Print QR'], cat: ['Kat.', 'Cat.'], status: ['Status', 'Status'],
  checkin: ['Daftar masuk', 'Check in'], checkedInOk: ['✓ Sudah masuk', '✓ Checked in'], undo: ['Batal', 'Undo'],
  name: ['Nama', 'Name'], whatsapp: ['WhatsApp', 'WhatsApp'], cats: ['Kategori', 'Categories'], head: ['Ketua juri', 'Head jury'],
  activeL: ['Aktif', 'Active'], save: ['Simpan', 'Save'], cancel: ['Batal', 'Cancel'], edit: ['Ubah', 'Edit'],
  sendWa: ['Hantar melalui WhatsApp', 'Send via WhatsApp'], copyLink: ['Salin pautan', 'Copy link'], copied: ['Pautan disalin', 'Link copied'],
  regen: ['Jana semula pautan', 'Regenerate link'], regenQ: ['Pautan lama akan tidak sah. Teruskan?', 'The old link will stop working. Continue?'],
  deactivate: ['Nyahaktif', 'Deactivate'], activate: ['Aktifkan', 'Activate'], del: ['Padam', 'Delete'],
  delQ: ['Padam {x}? Tindakan ini tidak boleh dibatalkan.', 'Delete {x}? This cannot be undone.'],
  badBase: ['baseUrl masih mengandungi tempat letak <github-user>. Tetapkan sebelum menghantar pautan.', 'baseUrl still holds the <github-user> placeholder. Set it before sending links.'],
  baseUrl: ['URL asas laman (baseUrl)', 'Site base URL (baseUrl)'], checkNum: ['semak nombor', 'check number'],
  scored: ['Dinilai', 'Scored'], jury: ['Juri', 'Jury'], artwork: ['Karya', 'Artwork'], total: ['Jumlah', 'Total'], note: ['Nota', 'Note'],
  allJuries: ['Semua juri', 'All juries'], paper: ['Masukkan skor kertas', 'Key in a paper score'],
  paperHint: ['Menggunakan pautan juri yang dipilih; ditolak jika penilaian dikunci.', 'Uses the chosen jury\'s link; rejected while scoring is locked.'],
  compute: ['Kira keputusan', 'Compute results'], lock: ['Kunci penilaian', 'Lock scoring'], unlock: ['Buka kunci', 'Unlock'],
  locked: ['Penilaian dikunci', 'Scoring locked'], publish: ['Terbitkan keputusan', 'Publish results'], unpublish: ['Tarik balik', 'Unpublish'],
  published: ['Diterbitkan', 'Published'], names: ['Papar nama di pentas', 'Show names on stage'], rank: ['Kedudukan', 'Rank'],
  mean: ['Purata', 'Mean'], flag: ['Bendera', 'Flag'], override: ['Ganti', 'Override'], applyOv: ['Guna pilihan seri', 'Apply tie overrides'],
  csv: ['Eksport CSV', 'Export CSV'], stage: ['Buka pentas', 'Open stage'], publicPage: ['Halaman awam', 'Public page'],
  winner: ['Pemenang', 'Winner'], consolation: ['Saguhati', 'Consolation'], noData: ['Tiada data', 'No data'],
  lockedWarn: ['Penilaian dikunci: juri tidak boleh menyimpan.', 'Scoring is locked: juries cannot save.'],
  keyPrompt: ['Kunci admin', 'Admin key'], enter: ['Masuk', 'Enter'], badKey: ['Kunci admin tidak sah.', 'Invalid admin key.'],
  openPrint: ['Buka halaman cetak label QR', 'Open the QR label print page'], deskMode: ['Mod kaunter', 'Desk mode'],
  pidShort: ['ID', 'ID'], refreshed: ['Dikemas kini', 'Updated']
});

const root = document.getElementById('root');
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, r) => (r || document).querySelector(sel);
const $$ = (sel, r) => Array.from((r || document).querySelectorAll(sel));
const isT = v => v === true || String(v).trim().toUpperCase() === 'TRUE';
const key = () => store.get('fsb.adminKey', '');

const q = new URLSearchParams(location.search);
const desk = q.get('mode') === 'desk';
if (q.get('k')) {
  store.set('fsb.adminKey', q.get('k'));
  history.replaceState(null, '', location.pathname + (desk ? '?mode=desk' : '') + location.hash);
}

let data = null;
const ui = { search: '', notIn: false, editJury: null, sj: '', sp: '', paper: null, out: '' };

function toast(msg, warn) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.toggle('warn', !!warn); el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

async function load(quiet) {
  try { data = await apiGet('adminOverview', { k: key() }); }
  catch (e) {
    if (quiet) return;
    if (e.code === 'UNAUTHORIZED' || !key()) return keyForm(e.code === 'UNAUTHORIZED' && key() ? t('badKey') : '');
    root.innerHTML = `<div class="adm"><p class="err">${esc(e.message)}</p><button class="btn sm" id="rt">↻</button></div>`; $('#rt').onclick = () => load();
    return;
  }
  render();
}

async function act(action, body, okMsg) {
  try {
    const r = await apiPost(action, Object.assign({ k: key() }, body));
    if (okMsg) toast(okMsg);
    await load();
    return r;
  } catch (e) { toast(e.message, true); await load(); return null; }
}

function keyForm(msg) {
  root.innerHTML = `<div class="adm"><h1>${esc(t('adminTitle'))}</h1><p class="err">${esc(msg)}</p>
    <form class="form" id="kf"><label>${esc(t('keyPrompt'))}<input type="password" id="kv" autocomplete="off"></label><button class="btn sm primary">${esc(t('enter'))}</button></form></div>`;
  $('#kf').onsubmit = ev => { ev.preventDefault(); store.set('fsb.adminKey', $('#kv').value.trim()); load(); };
}

// ---- helpers -------------------------------------------------------------------------------

const cfg = () => data.config || {};
const parts = () => data.participants;
const nameOf = pid => { const p = parts().find(x => x.pid === pid); return p ? p.childName : ''; };
function ago(s) {
  const ms = Date.parse(String(s || '').replace(' ', 'T'));
  if (!s || isNaN(ms)) return t('never');
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return t('minAgo', { n: m });
}
const tab = () => (desk ? 'participants' : (location.hash.replace(/^#\/?/, '') || 'overview'));

// ---- overview -----------------------------------------------------------------------------

function viewOverview() {
  const c = data.counts, cv = data.coverage;
  const stat = (n, label) => `<div class="stat"><b>${n}</b><small>${esc(label)}</small></div>`;
  const cats = ['A', 'B'].map(cat => {
    const b = c.byCategory[cat];
    return `<div class="stat"><small>${esc(t('category', { c: cat }))}</small><b>${b.complete} / ${b.active}</b><small>${esc(t('complete'))}</small>
      <div class="bar ${cat}"><i style="width:${b.active ? Math.round(100 * b.complete / b.active) : 0}%"></i></div></div>`;
  }).join('');
  const matrix = ['A', 'B'].map(cat => {
    const arts = parts().filter(p => p.category === cat && p.status === 'active');
    const rows = cv.juries.filter(j => j.categories.indexOf(cat) >= 0 && j.active).map(j => {
      const done = new Set(data.coverage.matrix[j.jid] || []);
      return `<div class="mrow"><span>${esc(j.name)} <b>${arts.filter(a => done.has(a.pid)).length}/${arts.length}</b></span>
        <div class="mx">${arts.map(a => `<i class="${done.has(a.pid) ? 'y' : ''}" title="${esc(a.pid)}${done.has(a.pid) ? ' ✓' : ''}"></i>`).join('')}</div></div>`;
    }).join('');
    return `<h3>${esc(t('category', { c: cat }))}</h3>${rows || `<p class="hint">${esc(t('noData'))}</p>`}`;
  }).join('');
  const low = cv.belowMin.length ? cv.belowMin.map(b => `<span class="tag warn">${esc(b.pid)} (${b.nScores})</span>`).join(' ') : `<span class="tag good">✓</span>`;
  const fl = data.flags.length ? data.flags.map(f => `<span class="tag bad" title="mean ${f.mean}, sd ${f.sd}, max dev ${f.maxDev}">${esc(f.pid)}</span>`).join(' ') : `<span class="tag good">✓</span>`;
  const seen = cv.juries.map(j => `<tr><td>${esc(j.name)}</td><td>${esc(j.categories.join(','))}</td><td class="num">${j.scored}/${j.expected}</td><td>${esc(ago(j.lastSeen))}</td></tr>`).join('');
  return `${isT(cfg().scoringLocked) ? `<div class="warnbox">${esc(t('lockedWarn'))}</div>` : ''}
    <div class="grid">${stat(c.registered, t('registered'))}${stat(c.checkedIn, t('checkedIn'))}${stat(c.active, t('activeN'))}${stat(c.complete + ' / ' + c.active, t('complete'))}${cats}</div>
    <div class="panel"><h2>${esc(t('coverage'))}</h2>${matrix}</div>
    <div class="panel"><h2>${esc(t('belowMin'))}</h2>${low}</div>
    <div class="panel"><h2>${esc(t('flags'))}</h2>${fl}</div>
    <div class="panel"><h2>${esc(t('juryLastSeen'))}</h2><div class="tw"><table><tbody>${seen}</tbody></table></div></div>`;
}

// ---- participants / check-in --------------------------------------------------------------

function partRows() {
  const s = ui.search.trim().toLowerCase();
  const list = parts().filter(p => (!s || p.pid.toLowerCase().indexOf(s) >= 0 || String(p.childName).toLowerCase().indexOf(s) >= 0) && (!ui.notIn || !p.checkedIn));
  if (!list.length) return `<tr><td colspan="8">${esc(t('noData'))}</td></tr>`;
  return list.map(p => {
    const ck = `<button class="btn sm ck ${p.checkedIn ? 'on' : 'primary'}" data-ck="${esc(p.pid)}">${esc(p.checkedIn ? t('checkedInOk') : t('checkin'))}</button>`;
    if (desk) return `<tr><td><b>${esc(p.pid)}</b></td><td>${esc(p.childName)}</td><td class="num">${esc(p.age)}</td><td>${esc(p.category)}</td><td>${ck}</td></tr>`;
    const catSel = `<select data-cat="${esc(p.pid)}">${['A', 'B'].map(c => `<option ${c === p.category ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
    const stSel = `<select data-st="${esc(p.pid)}">${['active', 'absent', 'dq'].map(c => `<option ${c === p.status ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
    return `<tr><td><b>${esc(p.pid)}</b></td><td>${esc(p.childName)}</td><td class="num">${esc(p.age)}</td><td>${catSel}</td><td>${stSel}</td>
      <td>${esc(p.guardianName)}<br><small>${esc(p.guardianPhone)}</small></td><td>${ck}</td><td><a class="btn sm" href="../print/?ids=${esc(p.pid)}">${esc(t('printQr'))}</a></td></tr>`;
  }).join('');
}

function viewParticipants() {
  const head = desk
    ? `<tr><th>${esc(t('pidShort'))}</th><th>${esc(t('name'))}</th><th class="num">${esc(t('age'))}</th><th>${esc(t('cat'))}</th><th></th></tr>`
    : `<tr><th>${esc(t('pidShort'))}</th><th>${esc(t('name'))}</th><th class="num">${esc(t('age'))}</th><th>${esc(t('cat'))}</th><th>${esc(t('status'))}</th><th>${esc(t('gName'))}</th><th></th><th></th></tr>`;
  return `<div class="panel"><div class="form"><input type="search" id="srch" placeholder="${esc(t('search'))}" value="${esc(ui.search)}" style="flex:1;min-width:200px">
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="notIn" ${ui.notIn ? 'checked' : ''}> ${esc(t('notIn'))}</label>
      ${desk ? '' : `<button class="btn sm primary" id="syncBtn">${esc(t('sync'))}</button>`}</div>
      ${ui.out ? `<pre class="out">${esc(ui.out)}</pre>` : ''}</div>
    <div class="panel"><h2>${esc(t('walkin'))}</h2><form class="form" id="wf">
      <label>${esc(t('childName'))}<input id="wn" required></label><label>${esc(t('age'))}<input id="wa" type="number" min="0" max="12" required style="width:80px"></label>
      <label>${esc(t('gName'))}<input id="wg"></label><label>${esc(t('gPhone'))}<input id="wp" inputmode="tel"></label>
      <button class="btn sm primary">${esc(t('add'))}</button><span id="wres"></span></form></div>
    <div class="panel tw"><table><thead>${head}</thead><tbody id="pbody">${partRows()}</tbody></table></div>`;
}

function bindParticipants() {
  const body = $('#pbody');
  const bindRows = () => {
    $$('[data-ck]', body).forEach(b => b.onclick = () => { const p = parts().find(x => x.pid === b.dataset.ck); act('participantUpsert', { pid: p.pid, checkedIn: !p.checkedIn }); });
    $$('[data-cat]', body).forEach(s => s.onchange = () => act('participantUpsert', { pid: s.dataset.cat, category: s.value }, s.dataset.cat));
    $$('[data-st]', body).forEach(s => s.onchange = () => act('participantUpsert', { pid: s.dataset.st, status: s.value }, s.dataset.st));
  };
  bindRows();
  $('#srch').oninput = ev => { ui.search = ev.target.value; body.innerHTML = partRows(); bindRows(); };
  $('#notIn').onchange = ev => { ui.notIn = ev.target.checked; body.innerHTML = partRows(); bindRows(); };
  const sb = $('#syncBtn');
  if (sb) sb.onclick = async () => {
    sb.disabled = true;
    try {
      const r = await apiPost('syncRegistrations', { k: key() });
      ui.out = t('syncOut', { a: r.added, s: r.skipped }) + (r.warnings.length ? '\n' + r.warnings.join('\n') : '');
    } catch (e) { ui.out = e.message; }
    await load();
  };
  $('#wf').onsubmit = async ev => {
    ev.preventDefault();
    const r = await act('participantUpsert', { childName: $('#wn').value, age: $('#wa').value, guardianName: $('#wg').value, guardianPhone: $('#wp').value }, null);
    if (r) { toast(t('added', { pid: r.pid })); ui.out = ''; const w = $('#wres'); if (w) w.innerHTML = `<a class="btn sm" href="../print/?ids=${esc(r.pid)}">${esc(t('printQr'))} ${esc(r.pid)}</a>`; }
  };
}

// ---- juries --------------------------------------------------------------------------------

function viewJuries() {
  const base = String(cfg().baseUrl || '');
  const ej = ui.editJury ? data.juries.find(j => j.jid === ui.editJury) : null;
  const rows = data.juries.map(j => {
    const cv = data.coverage.juries.find(x => x.jid === j.jid) || { scored: 0, expected: 0 };
    return `<tr><td>${esc(j.jid)}</td><td>${esc(j.name)}${j.isHead ? ` <span class="tag good">${esc(t('head'))}</span>` : ''}</td>
      <td>${esc(j.whatsapp)}${j.numberWarning ? ` <span class="tag warn">${esc(t('checkNum'))}</span>` : ''}</td><td>${esc(j.categories.join(','))}</td>
      <td>${j.active ? '' : '<span class="tag bad">off</span>'}</td><td class="num">${cv.scored}/${cv.expected}</td><td>${esc(ago(j.lastSeen))}</td>
      <td style="white-space:nowrap"><a class="btn sm primary" target="_blank" rel="noopener" href="${esc(j.waUrl)}">${esc(t('sendWa'))}</a>
        <button class="btn sm" data-copy="${esc(j.jid)}">${esc(t('copyLink'))}</button>
        <button class="btn sm" data-regen="${esc(j.jid)}">${esc(t('regen'))}</button>
        <button class="btn sm" data-edit="${esc(j.jid)}">${esc(t('edit'))}</button>
        <button class="btn sm" data-tog="${esc(j.jid)}">${esc(j.active ? t('deactivate') : t('activate'))}</button>
        <button class="btn sm danger" data-del="${esc(j.jid)}" ${j.active ? 'disabled' : ''}>${esc(t('del'))}</button></td></tr>`;
  }).join('');
  const cb = c => `<label style="flex-direction:row;align-items:center;gap:4px"><input type="checkbox" name="jc" value="${c}" ${ej ? (ej.categories.indexOf(c) >= 0 ? 'checked' : '') : 'checked'}> ${c}</label>`;
  return `${base.indexOf('<') >= 0 ? `<div class="warnbox">${esc(t('badBase'))}</div>` : ''}
    <div class="panel"><form class="form" id="bf"><label style="flex:1;min-width:260px">${esc(t('baseUrl'))}<input id="bu" value="${esc(base)}"></label><button class="btn sm">${esc(t('save'))}</button></form></div>
    <div class="panel"><h2>${esc(ej ? ej.name : t('add'))}</h2><form class="form" id="jf">
      <label>${esc(t('name'))}<input id="jn" required value="${esc(ej ? ej.name : '')}"></label>
      <label>${esc(t('whatsapp'))}<input id="jw" required inputmode="tel" value="${esc(ej ? ej.whatsapp : '')}"></label>
      <label>${esc(t('cats'))}<span class="form">${cb('A')}${cb('B')}</span></label>
      <label style="flex-direction:row;align-items:center;gap:4px"><input type="checkbox" id="jh" ${ej && ej.isHead ? 'checked' : ''}> ${esc(t('head'))}</label>
      <button class="btn sm primary">${esc(t('save'))}</button>${ej ? `<button type="button" class="btn sm" id="jcancel">${esc(t('cancel'))}</button>` : ''}</form></div>
    <div class="panel tw"><table><thead><tr><th>ID</th><th>${esc(t('name'))}</th><th>${esc(t('whatsapp'))}</th><th>${esc(t('cats'))}</th><th></th><th class="num">${esc(t('scored'))}</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function bindJuries() {
  const jur = id => data.juries.find(j => j.jid === id);
  $('#bf').onsubmit = ev => { ev.preventDefault(); act('setConfig', { key: 'baseUrl', value: $('#bu').value.trim() }, t('save')); };
  $('#jf').onsubmit = ev => {
    ev.preventDefault();
    const cats = $$('input[name=jc]:checked').map(x => x.value);
    const body = { name: $('#jn').value, whatsapp: $('#jw').value, categories: cats, isHead: $('#jh').checked };
    if (ui.editJury) body.jid = ui.editJury;
    ui.editJury = null;
    act('juryUpsert', body, t('save'));
  };
  const jc = $('#jcancel'); if (jc) jc.onclick = () => { ui.editJury = null; render(); };
  $$('[data-edit]').forEach(b => b.onclick = () => { ui.editJury = b.dataset.edit; render(); });
  $$('[data-copy]').forEach(b => b.onclick = async () => {
    const link = jur(b.dataset.copy).link;
    try { await navigator.clipboard.writeText(link); toast(t('copied')); } catch (e) { window.prompt(t('copyLink'), link); }
  });
  $$('[data-regen]').forEach(b => b.onclick = () => { if (window.confirm(t('regenQ'))) act('juryRegenerate', { jid: b.dataset.regen }, t('regen')); });
  $$('[data-tog]').forEach(b => b.onclick = () => act('juryUpsert', { jid: b.dataset.tog, active: !jur(b.dataset.tog).active }));
  $$('[data-del]').forEach(b => b.onclick = () => { const j = jur(b.dataset.del); if (window.confirm(t('delQ', { x: j.name }))) act('juryDelete', { jid: j.jid }); });
}

// ---- scores --------------------------------------------------------------------------------

function viewScores() {
  const pf = ui.sp.trim().toUpperCase();
  const list = data.scores.filter(s => (!ui.sj || s.jid === ui.sj) && (!pf || s.pid.indexOf(pf) >= 0));
  const jopt = sel => data.juries.map(j => `<option value="${esc(j.jid)}" ${j.jid === sel ? 'selected' : ''}>${esc(j.jid)} ${esc(j.name)}</option>`).join('');
  const pp = ui.paper || { jid: (data.juries.find(j => j.active) || {}).jid, pid: '', c: ['', '', '', '', ''], note: '' };
  const rows = list.map(s => `<tr><td>${esc(s.jid)}</td><td><b>${esc(s.pid)}</b></td>${s.c.map(v => `<td class="num">${v}</td>`).join('')}<td class="num"><b>${Number(s.total).toFixed(1)}</b></td>
    <td>${esc(s.note)}</td><td>${esc(s.updatedAtServer)}</td>
    <td style="white-space:nowrap"><button class="btn sm" data-pe="${esc(s.key)}">${esc(t('edit'))}</button> <button class="btn sm danger" data-sd="${esc(s.key)}">${esc(t('del'))}</button></td></tr>`).join('');
  return `<div class="panel"><div class="form"><label>${esc(t('jury'))}<select id="fj"><option value="">${esc(t('allJuries'))}</option>${jopt(ui.sj)}</select></label>
      <label>${esc(t('artwork'))}<input id="fp" type="search" value="${esc(ui.sp)}" placeholder="A-014"></label><span class="tag">${list.length}</span></div></div>
    <div class="panel"><h2>${esc(t('paper'))}</h2><p class="hint" style="margin:0 0 8px">${esc(t('paperHint'))}</p><form class="form" id="pf">
      <label>${esc(t('jury'))}<select id="pj">${jopt(pp.jid)}</select></label><label>${esc(t('artwork'))}<input id="pp" required value="${esc(pp.pid)}" style="width:100px"></label>
      ${[1, 2, 3, 4, 5].map(i => `<label>c${i}<input class="pc" type="number" min="1" max="10" required value="${esc(pp.c[i - 1])}" style="width:64px"></label>`).join('')}
      <label>${esc(t('note'))}<input id="pn" maxlength="140" value="${esc(pp.note)}"></label><button class="btn sm primary">${esc(t('save'))}</button></form></div>
    <div class="panel tw"><table><thead><tr><th>${esc(t('jury'))}</th><th>${esc(t('artwork'))}</th><th class="num">c1</th><th class="num">c2</th><th class="num">c3</th><th class="num">c4</th><th class="num">c5</th><th class="num">${esc(t('total'))}</th><th>${esc(t('note'))}</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function bindScores() {
  $('#fj').onchange = ev => { ui.sj = ev.target.value; render(); };
  $('#fp').oninput = ev => { ui.sp = ev.target.value; const pos = ev.target.selectionStart; render(); const f = $('#fp'); f.focus(); f.setSelectionRange(pos, pos); };
  $$('[data-sd]').forEach(b => b.onclick = () => { if (window.confirm(t('delQ', { x: b.dataset.sd }))) act('scoreDelete', { key: b.dataset.sd }); });
  $$('[data-pe]').forEach(b => b.onclick = () => {
    const s = data.scores.find(x => x.key === b.dataset.pe);
    ui.paper = { jid: s.jid, pid: s.pid, c: s.c.slice(), note: s.note }; render(); window.scrollTo(0, 0);
  });
  $('#pf').onsubmit = async ev => {
    ev.preventDefault();
    const jury = data.juries.find(j => j.jid === $('#pj').value);
    const c = $$('.pc').map(x => parseInt(x.value, 10));
    try {
      const r = await apiPost('saveScore', { t: jury.token, pid: $('#pp').value, c, note: $('#pn').value.trim(), updatedAtClient: new Date().toISOString(), clientOpId: 'admin-' + Date.now() });
      toast(r.score.pid + ' · ' + Number(r.score.total).toFixed(1)); ui.paper = null;
    } catch (e) { toast(e.message, true); }
    await load();
  };
}

// ---- results -------------------------------------------------------------------------------

function overrides() { try { return JSON.parse(cfg().rankOverrides || '{}') || {}; } catch (e) { return {}; } }

function viewResults() {
  const locked = isT(cfg().scoringLocked), pub = isT(cfg().resultsPublished), names = isT(cfg().showNamesOnStage);
  const win = parseInt(cfg().winnersPerCategory, 10) || 3, con = parseInt(cfg().consolationPerCategory, 10) || 5, ov = overrides();
  const tier = r => (r <= win ? t('winner') : r <= win + con ? t('consolation') : '');
  const tbl = cat => {
    const rows = data.results.filter(r => r.category === cat).sort((a, b) => a.rank - b.rank).map(r => {
      const tie = String(r.flag).indexOf('TIE') >= 0;
      return `<tr><td class="num"><b>${r.rank}</b></td><td><b>${esc(r.pid)}</b></td><td>${esc(nameOf(r.pid))}</td><td class="num">${r.nScores}</td><td class="num">${Number(r.mean).toFixed(2)}</td><td class="num">${Number(r.sd).toFixed(2)}</td>
        <td class="num">${Number(r.c3Mean).toFixed(2)}</td><td class="num">${Number(r.c1Mean).toFixed(2)}</td>
        <td>${String(r.flag).split(',').filter(Boolean).map(f => `<span class="tag ${f === 'TIE-UNRESOLVED' ? 'bad' : 'warn'}">${esc(f)}</span>`).join(' ')}</td>
        <td>${tie ? `<input class="ov" type="number" min="1" style="width:70px" data-pid="${esc(r.pid)}" value="${ov[r.pid] === undefined ? '' : esc(ov[r.pid])}">` : ''}</td><td>${esc(tier(r.rank))}</td></tr>`;
    }).join('');
    return `<h3>${esc(t('category', { c: cat }))}</h3><div class="tw"><table><thead><tr><th class="num">${esc(t('rank'))}</th><th>ID</th><th>${esc(t('name'))}</th><th class="num">n</th><th class="num">${esc(t('mean'))}</th><th class="num">SD</th><th class="num">c3</th><th class="num">c1</th><th>${esc(t('flag'))}</th><th>${esc(t('override'))}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="11">${esc(t('noData'))}</td></tr>`}</tbody></table></div>`;
  };
  const low = data.coverage.belowMin.length ? `<p>${esc(t('belowMin'))}: ${data.coverage.belowMin.map(b => `<span class="tag warn">${esc(b.pid)} (${b.nScores})</span>`).join(' ')}</p>` : '';
  return `<div class="panel"><div class="form">
      <button class="btn sm primary" id="comp">${esc(t('compute'))}</button>
      <button class="btn sm ${locked ? 'on' : ''}" id="lockb">${esc(locked ? t('unlock') + ' (' + t('locked') + ')' : t('lock'))}</button>
      <button class="btn sm ${pub ? 'on' : ''}" id="pubb">${esc(pub ? t('unpublish') + ' (' + t('published') + ')' : t('publish'))}</button>
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="nm" ${names ? 'checked' : ''}> ${esc(t('names'))}</label>
      <button class="btn sm" id="csv">${esc(t('csv'))}</button>
      <a class="btn sm" href="../stage/">${esc(t('stage'))}</a> <a class="btn sm" href="../results/">${esc(t('publicPage'))}</a></div></div>
    <div class="panel">${low}${tbl('A')}${tbl('B')}<p><button class="btn sm" id="applyOv">${esc(t('applyOv'))}</button></p></div>`;
}

function bindResults() {
  $('#comp').onclick = () => act('computeResults', {}, t('compute'));
  $('#lockb').onclick = () => act('setConfig', { key: 'scoringLocked', value: isT(cfg().scoringLocked) ? 'FALSE' : 'TRUE' });
  $('#pubb').onclick = () => act('setConfig', { key: 'resultsPublished', value: isT(cfg().resultsPublished) ? 'FALSE' : 'TRUE' });
  $('#nm').onchange = ev => act('setConfig', { key: 'showNamesOnStage', value: ev.target.checked ? 'TRUE' : 'FALSE' });
  $('#applyOv').onclick = async () => {
    const ov = overrides();
    $$('.ov').forEach(i => { if (i.value) ov[i.dataset.pid] = Number(i.value); else delete ov[i.dataset.pid]; });
    try { await apiPost('setConfig', { k: key(), key: 'rankOverrides', value: JSON.stringify(ov) }); await apiPost('computeResults', { k: key() }); toast(t('applyOv')); } catch (e) { toast(e.message, true); }
    await load();
  };
  $('#csv').onclick = () => {
    const win = parseInt(cfg().winnersPerCategory, 10) || 3, con = parseInt(cfg().consolationPerCategory, 10) || 5;
    const head = ['category', 'rank', 'tier', 'pid', 'childName', 'guardianName', 'guardianPhone', 'school', 'nScores', 'mean'];
    const lines = [head].concat(data.results.slice().sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : a.rank - b.rank)).map(r => {
      const p = parts().find(x => x.pid === r.pid) || {};
      return [r.category, r.rank, r.rank <= win ? 'winner' : r.rank <= win + con ? 'consolation' : '', r.pid, p.childName, p.guardianName, p.guardianPhone, p.school, r.nScores, r.mean];
    }));
    // a cell that starts with = + - @ would run as a formula when the CSV is opened in Excel or Sheets
    const cell = v => { let x = String(v === undefined || v === null ? '' : v); if (/^[=+\-@\t\r]/.test(x)) x = "'" + x; return '"' + x.replace(/"/g, '""') + '"'; };
    const text = lines.map(l => l.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = 'results.csv'; document.body.appendChild(a); a.click(); a.remove();
  };
}

// ---- shell ------------------------------------------------------------------------------------

function render() {
  if (!data) return;
  const cur = tab();
  const tabs = desk ? [] : [['overview', 'tOverview'], ['participants', 'tParticipants'], ['juries', 'tJuries'], ['scores', 'tScores'], ['results', 'tResults']];
  const views = { overview: viewOverview, participants: viewParticipants, juries: viewJuries, scores: viewScores, results: viewResults };
  const body = cur === 'print' ? `<div class="panel"><a class="btn sm primary" href="../print/">${esc(t('openPrint'))}</a></div>` : (views[cur] || viewOverview)();
  root.innerHTML = `<div class="adm ${desk ? 'desk' : ''}"><header><h1>${esc(cfg().eventName || t('adminTitle'))} · ${esc(desk ? t('deskMode') : t('adminTitle'))}</h1>
      <button class="lang" id="langBtn">${getLang() === 'bm' ? 'EN' : 'BM'}</button></header>
    ${desk ? '' : `<nav class="tabs">${tabs.map(x => `<a href="#/${x[0]}" ${cur === x[0] ? 'aria-current="page"' : ''}>${esc(t(x[1]))}</a>`).join('')}<a href="#/print" ${cur === 'print' ? 'aria-current="page"' : ''}>${esc(t('tPrint'))}</a></nav>`}
    ${body}</div>`;
  $('#langBtn').onclick = () => setLang(getLang() === 'bm' ? 'en' : 'bm');
  if (cur === 'participants') bindParticipants();
  else if (cur === 'juries') bindJuries();
  else if (cur === 'scores') bindScores();
  else if (cur === 'results') bindResults();
}

onLang(render);
window.addEventListener('hashchange', render);
setInterval(() => { if (!document.hidden && tab() === 'overview') load(true); }, 15000);   // spec 11: overview refreshes every 15 s
load();
