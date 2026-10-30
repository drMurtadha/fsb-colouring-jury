// Jury app: welcome, home, scanner, scoring. Hash routes: #/ #/welcome #/scan #/id #/list/todo #/list/done #/score/A-014
import { t, getLang, setLang, onLang, addStrings } from '../assets/i18n.js';
import { mountSchedule } from '../assets/schedule.js';
import { store, getToken, setToken, refresh, cached, myScores, saveScore, pendingCount, failedSaves, clearFailed, subscribe } from '../assets/api.js';

addStrings({
  progTitle: ['Aturcara', 'Programme'], progNow: ['Sekarang', 'Now'], progJury: ['Juri', 'Jury'], progTentative: ['Tentatif', 'Tentative']
});
const view = document.getElementById('view');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const round1 = x => Math.round(x * 10) / 10;

let booted = false;
let scanSession = 0;
let scanner = null;

// ---- settings -------------------------------------------------------------------

function applyTheme() {
  const th = store.get('fsb.theme', 'auto');
  if (th === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th;
}
applyTheme();
const inputMode = () => store.get('fsb.inputMode', 'chips');

// ---- helpers ---------------------------------------------------------------------

function toast(msg, warn) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('warn', !!warn);
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 1800);
}

function parsePid(text) {
  let s = String(text || '').trim();
  try { const p = new URL(s).searchParams.get('p'); if (p) s = p; } catch (e) { /* not a URL */ }
  const m = /^([AB])\s*-?\s*(\d{1,4})$/i.exec(s);
  return m ? m[1].toUpperCase() + '-' + String(parseInt(m[2], 10)).padStart(3, '0') : null;
}

function syncBadge() {
  const n = pendingCount();
  if (!navigator.onLine) return `<span class="badge off js-sync">${esc(t('offline'))}${n ? ' · ' + esc(t('pending', { n })) : ''}</span>`;
  if (n) return `<span class="badge pending js-sync">${esc(t('pending', { n }))}</span>`;
  return `<span class="badge js-sync">${esc(t('synced'))}</span>`;
}
function refreshBadges() { $$('.js-sync').forEach(el => { el.outerHTML = syncBadge(); }); }
subscribe(refreshBadges);
window.addEventListener('online', refreshBadges);
window.addEventListener('offline', refreshBadges);

function stopScanner() {
  scanSession++;
  const s = scanner; scanner = null;
  if (s) { try { s.stop().then(() => s.clear()).catch(() => {}); } catch (e) { /* scanner was not running yet */ } }
}

function langBtn() { return `<button class="lang" id="langBtn" aria-label="${esc(t('language'))}">${getLang() === 'bm' ? 'EN' : 'BM'}</button>`; }
function bindLang() { const b = $('#langBtn'); if (b) b.onclick = () => setLang(getLang() === 'bm' ? 'en' : 'bm'); }
onLang(() => { if (booted) render(); });

function catChip(c) { return `<span class="chip ${esc(c)}">${esc(t('category', { c }))}</span>`; }

// ---- boot --------------------------------------------------------------------------

let startPid = null;

async function boot() {
  const q = new URLSearchParams(location.search);
  const tk = q.get('t'), p = q.get('p');
  if (tk) setToken(tk.trim());
  if (p) startPid = parsePid(p);
  if (tk || p) history.replaceState(null, '', location.pathname + location.hash);
  if (!getToken()) return message(t('noToken'));
  view.innerHTML = '<div class="app"><div class="pad">…</div></div>';
  try { await refresh(); } catch (e) { return bootFail(e); }
  booted = true;
  const me = cached().me;
  if (startPid) { location.hash = '#/score/' + startPid; startPid = null; }
  else if (!store.get('fsb.welcomed:' + me.jid, false)) location.hash = '#/welcome';
  render();
}

function message(text, retry) {
  view.innerHTML = `<div class="app"><div class="blocked"><h2>${esc(t('appTitle'))}</h2><p>${esc(text)}</p>${retry ? `<button class="btn primary" id="retry">${esc(t('retry'))}</button>` : ''}</div></div>`;
  if (retry) $('#retry').onclick = boot;
}

function bootFail(e) {
  if (e.code === 'UNAUTHORIZED') { store.del('fsb.token'); store.del('fsb.cache'); return message(t('badLink')); }
  if (e.code === 'NO_API') return message(t('noApi'));
  message(t('loadFail'), true);
}

// ---- router ------------------------------------------------------------------------

function render() {
  stopScanner();
  if (!booted) return;
  const [r, a] = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  if (r === 'welcome') return viewWelcome();
  if (r === 'scan') return viewScan(true);
  if (r === 'id') return viewScan(false);
  if (r === 'list') return viewList(a === 'done' ? 'done' : 'todo');
  if (r === 'score' && a) return viewScore(parsePid(a) || a.toUpperCase());
  viewHome();
}
window.addEventListener('hashchange', render);

// ---- welcome and home --------------------------------------------------------------

function viewWelcome() {
  const me = cached().me;
  view.innerHTML = `<div class="app"><div class="hero"><div style="text-align:right">${langBtn()}</div>
    <div class="event">${esc(me.eventName)}</div>
    <h1 class="hello">${esc(t('welcome'))}, ${esc(me.name)}</h1>
    <div class="chips">${me.categories.map(catChip).join('')}</div></div>
    <div class="card"><p style="margin:0">${esc(t('welcomeBody'))}</p><p class="hint" style="margin:8px 0 0">${esc(t('holdHint'))}</p></div>
    <div class="stack"><button class="btn primary" id="start">${esc(t('start'))}</button></div></div>`;
  bindLang();
  $('#start').onclick = () => { store.set('fsb.welcomed:' + me.jid, true); location.hash = '#/'; };
}

function stats() {
  const c = cached(), mine = myScores();
  const active = c.artworks.filter(a => a.status === 'active');
  const scored = active.filter(a => mine[a.pid]);
  return { active, scored, todo: active.filter(a => !mine[a.pid]), mine };
}

function viewHome(refreshAfter = true) {
  const c = cached(), me = c.me, st = stats();
  const fails = failedSaves();
  const cards = me.categories.map(cat => {
    const all = st.active.filter(a => a.category === cat), n = all.filter(a => st.mine[a.pid]).length;
    return `<div class="card"><h3><span>${esc(t('category', { c: cat }))}</span><span>${esc(t('progress', { n, m: all.length }))}</span></h3>
      <div class="bar ${cat}"><i style="width:${all.length ? Math.round(100 * n / all.length) : 0}%"></i></div></div>`;
  }).join('');
  const th = store.get('fsb.theme', 'auto'), im = inputMode();
  const sched = me.schedule && Array.isArray(me.schedule.items) ? me.schedule.items : [];
  const seg = (name, cur, opts) => `<div class="seg2" data-set="${name}">${opts.map(o => `<button data-v="${o[0]}" aria-pressed="${cur === o[0]}">${esc(o[1])}</button>`).join('')}</div>`;
  view.innerHTML = `<div class="app"><div class="hero">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="event">${esc(me.eventName)}</span><span>${syncBadge()} ${langBtn()}</span></div>
      <h1 class="hello">${esc(me.name)}</h1><div class="chips">${me.categories.map(catChip).join('')}</div>
      ${me.locked ? `<p class="err" style="margin:8px 0 0">${esc(t('locked'))}</p>` : ''}
      ${fails.length ? `<p class="err" style="margin:8px 0 0">${esc(t('failedSaves', { n: fails.length, why: Array.from(new Set(fails.map(f => f.pid + ': ' + f.message))).join('; ') }))} <button class="linkbtn" id="clrFail">${esc(t('close'))}</button></p>` : ''}
    </div>
    ${cards}
    <div class="stack"><a class="btn primary" href="#/scan" id="scanBtn">${esc(t('scan'))}</a></div>
    <div class="row2"><a class="btn" href="#/id">${esc(t('enterId'))}</a><a class="btn" href="#/list/todo">${esc(t('todo'))} (${st.todo.length})</a></div>
    <div class="stack"><a class="btn" href="#/list/done">${esc(t('done'))} (${st.scored.length})</a></div>
    ${sched.length ? `<details class="sched"><summary>${esc(t('progTitle'))}${me.schedule.status === 'tentatif' ? ` <span class="badge pending" style="margin-left:8px">${esc(t('progTentative'))}</span>` : ''}</summary><div id="progBody"></div></details>` : ''}
    <details class="settings"><summary>${esc(t('settings'))}</summary>
      <div class="setrow"><span>${esc(t('theme'))}</span>${seg('theme', th, [['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]])}</div>
      <div class="setrow"><span>${esc(t('inputMode'))}</span>${seg('inputMode', im, [['chips', t('chips')], ['slider', t('slider')]])}</div>
      <p class="hint" style="margin:6px 0 0">${esc(t('holdHint'))}</p></details></div>`;
  bindLang();
  if (sched.length) mountSchedule($('#progBody'), () => ({ items: sched, lang: getLang(), labels: { now: t('progNow'), jury: t('progJury') } }));
  const clr = $('#clrFail'); if (clr) clr.onclick = () => { clearFailed(); render(); };
  $$('[data-set]').forEach(box => $$('button', box).forEach(b => {
    b.onclick = () => {
      store.set(box.dataset.set === 'theme' ? 'fsb.theme' : 'fsb.inputMode', b.dataset.v);
      applyTheme();
      render();
      $('details.settings').open = true;
    };
  }));
  // refresh in the background so counts follow other devices and the lock flag
  if (refreshAfter) {
    // once per visit: repaint without refreshing again, otherwise the two would call each other forever
    refresh().then(() => {
      if (!location.hash || location.hash === '#/' || location.hash === '#') { const d = $('details.settings'), p = $('details.sched'); if ((!d || !d.open) && (!p || !p.open)) viewHome(false); }
    }).catch(() => {});
  }
}

// ---- lists --------------------------------------------------------------------------

function viewList(kind) {
  const st = stats();
  const items = (kind === 'todo' ? st.todo : st.scored).slice().sort((a, b) => a.pid < b.pid ? -1 : 1);
  const body = items.length ? ['A', 'B'].map(cat => {
    const g = items.filter(a => a.category === cat);
    if (!g.length) return '';
    return `<div class="sect">${esc(t('category', { c: cat }))}</div><div class="idgrid">${g.map(a =>
      `<a class="idpill ${cat}" href="#/score/${esc(a.pid)}">${esc(a.pid)}${kind === 'done' ? `<small>${Number(st.mine[a.pid].total).toFixed(1)}${st.mine[a.pid].pending ? ' ⏳' : ''}</small>` : ''}</a>`).join('')}</div>`;
  }).join('') : `<p class="hint">${esc(t('nothing'))}</p>`;
  view.innerHTML = `<div class="app"><div class="topbar"><a class="linkbtn" href="#/">← ${esc(t('back'))}</a><span class="grow"></span>${syncBadge()}</div>
    <h2 class="sect">${esc(kind === 'todo' ? t('todo') : t('done'))} (${items.length})</h2>${body}</div>`;
}

// ---- scanner and manual entry ----------------------------------------------------------

function viewScan(withCamera) {
  const me = cached().me;
  const letter = me.categories[0];
  view.innerHTML = `<div class="app"><div class="topbar"><a class="linkbtn" href="#/">← ${esc(t('back'))}</a><span class="grow"></span>${syncBadge()}</div>
    ${withCamera ? `<div id="reader"></div><p class="hint" id="scanHint">${esc(t('scanHint'))}</p>` : ''}
    <div class="sect">${esc(t('enterId'))}</div>
    <form class="manual" id="manual" autocomplete="off">
      <div class="seg" role="group" aria-label="${esc(t('idLabel'))}">${me.categories.map(c => `<button type="button" data-l="${c}" aria-pressed="${c === letter}">${c}</button>`).join('')}</div>
      <input id="num" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="014" aria-label="${esc(t('idLabel'))}">
      <button class="btn" type="submit">${esc(t('go'))}</button></form>
    <p class="err" id="idErr" hidden>${esc(t('badId'))}</p></div>`;
  let cat = letter;
  $$('.seg button').forEach(b => b.onclick = () => { cat = b.dataset.l; $$('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); $('#num').focus(); });
  $('#manual').onsubmit = ev => {
    ev.preventDefault();
    const pid = parsePid(cat + '-' + $('#num').value);
    if (!pid) { $('#idErr').hidden = false; return; }
    location.hash = '#/score/' + pid;
  };
  if (!withCamera) { $('#num').focus(); return; }
  const mySession = ++scanSession;
  if (!window.Html5Qrcode) { $('#scanHint').textContent = t('camFail'); return; }
  const sc = new Html5Qrcode('reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
  scanner = sc;
  let done = false;
  sc.start({ facingMode: 'environment' }, { fps: 15, qrbox: (w, h) => { const side = Math.floor(Math.min(w, h) * 0.7); return { width: side, height: side }; } }, text => {
    const pid = parsePid(text);
    if (!pid || done || mySession !== scanSession) return;
    done = true;
    if (navigator.vibrate) navigator.vibrate(10);
    location.hash = '#/score/' + pid;
  }, () => {}).catch(() => { if (mySession === scanSession) { const h = $('#scanHint'); if (h) h.textContent = t('camFail'); } });
}

// ---- scoring ------------------------------------------------------------------------------

function blocked(pid, msg) {
  view.innerHTML = `<div class="app"><div class="topbar"><a class="linkbtn" href="#/">← ${esc(t('back'))}</a></div>
    <div class="blocked"><h2 style="font-size:40px">${esc(pid)}</h2><p>${esc(msg)}</p><a class="btn primary" href="#/scan">${esc(t('scan'))}</a></div></div>`;
}

function showSheet(html) {
  const sh = document.getElementById('sheet');
  sh.innerHTML = `<div role="dialog" aria-modal="true">${html}<button class="btn" id="shClose">${esc(t('close'))}</button></div>`;
  sh.hidden = false;
  const close = () => { sh.hidden = true; sh.innerHTML = ''; };
  $('#shClose').onclick = close;
  sh.onclick = ev => { if (ev.target === sh) close(); };
}

function viewScore(pid) {
  const c0 = cached(), me = c0.me;
  const art = c0.artworks.find(a => a.pid === pid);
  if (!art) return blocked(pid, t('notFound', { pid }));
  if (art.status === 'absent') return blocked(pid, t('absent', { pid }));
  if (art.status === 'dq') return blocked(pid, t('dq', { pid }));
  const w = me.weights[art.category], crit = me.criteria, lang = getLang();
  const mine = myScores(), prev = mine[pid], ro = !!me.locked, slider = inputMode() === 'slider';
  const draft = { c: prev ? prev.c.slice() : [null, null, null, null, null], note: prev ? prev.note : '' };
  const st = stats();
  const others = Object.keys(mine).filter(k => k !== pid).map(k => Number(mine[k].total));
  const avg = others.length ? (others.reduce((x, y) => x + y, 0) / others.length).toFixed(1) : '—';
  const varNames = ['--c1', '--c2', '--c3', '--c4', '--c5'];

  const row = (cr, i) => {
    const name = cr[lang === 'en' ? 'en' : 'bm'];
    const ctl = slider
      ? `<div class="slider"><input type="range" min="1" max="10" step="1" value="${draft.c[i] || 5}" data-i="${i}" aria-label="${esc(name)}" ${ro ? 'disabled' : ''}><span class="val" data-val="${i}">${draft.c[i] || '–'}</span></div>`
      : `<div class="nums" role="group" aria-label="${esc(name)}">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n =>
        `<button type="button" data-i="${i}" data-n="${n}" aria-pressed="${draft.c[i] === n}" aria-label="${esc(name)} ${n}" ${ro ? 'disabled' : ''}>${n}</button>`).join('')}</div>`;
    return `<div class="crit" data-c="c${i + 1}" style="--cc:var(${varNames[i]})"><div class="lbl" data-hold="${i}"><span>${esc(name)}</span><span>${w[i]}%</span></div>${ctl}</div>`;
  };

  view.innerHTML = `<div class="score"><header>
      <div class="h1"><button class="back" id="back" aria-label="${esc(t('back'))}">←</button><span class="pid">${esc(pid)}</span>
        ${catChip(art.category)}${art.age ? `<span class="event">${esc(t('age', { n: art.age }))}</span>` : ''}</div>
      <div class="sub"><span>${esc(me.name)} · ${esc(t('progress', { n: st.scored.length, m: st.active.length }))}</span>${syncBadge()}</div></header>
    <div class="rows">${crit.map(row).join('')}</div>
    <div class="foot"><div class="noterow" id="noteRow" hidden><input id="noteIn" maxlength="140" placeholder="${esc(t('notePlaceholder'))}" value="${esc(draft.note)}"></div>
      <div class="tot"><div><span class="big"><span id="tot">0.0</span> <small>/ 100</small></span><div class="avg">${esc(t('avg', { avg }))}</div></div>
        <button class="noteb ${draft.note ? 'has' : ''}" id="noteBtn" type="button" aria-label="${esc(t('note'))}">📝 ${esc(t('note'))}</button></div>
      ${ro ? `<p class="err" style="margin:6px 0 0">${esc(t('locked'))}</p>` : `<button class="btn primary" id="saveBtn" disabled>${esc(prev ? t('update') : t('save'))}</button>`}
    </div></div>`;

  const tot = $('#tot'), saveBtn = $('#saveBtn');
  let shown = 0;
  const calc = () => round1(draft.c.reduce((s, v, i) => s + (v ? v / 10 * w[i] : 0), 0));
  let anim = 0;
  function update() {
    const to = calc(), from = shown, id = ++anim;
    shown = to;
    tot.textContent = to.toFixed(1);            // always correct; the count-up below is cosmetic
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && from !== to) {
      const t0 = performance.now();
      requestAnimationFrame(function step(now) {
        if (id !== anim) return;
        const k = Math.min(1, (now - t0) / 250);
        tot.textContent = (from + (to - from) * k).toFixed(1);
        if (k < 1) requestAnimationFrame(step); else tot.textContent = to.toFixed(1);
      });
    }
    if (saveBtn) saveBtn.disabled = draft.c.some(v => !v);
  }
  shown = calc(); tot.textContent = shown.toFixed(1); if (saveBtn) saveBtn.disabled = draft.c.some(v => !v);

  $('#back').onclick = () => { location.hash = '#/'; };
  $$('.nums button').forEach(b => b.onclick = () => {
    const i = +b.dataset.i;
    draft.c[i] = +b.dataset.n;
    $$('.nums button[data-i="' + i + '"]').forEach(x => x.setAttribute('aria-pressed', x === b));
    update();
  });
  $$('input[type=range]').forEach(r => r.oninput = () => {
    const i = +r.dataset.i; draft.c[i] = +r.value; $('[data-val="' + i + '"]').textContent = r.value; update();
  });
  $('#noteBtn').onclick = () => { const row = $('#noteRow'); row.hidden = !row.hidden; if (!row.hidden) $('#noteIn').focus(); };
  $('#noteIn').oninput = ev => { draft.note = ev.target.value; $('#noteBtn').classList.toggle('has', !!draft.note); };
  if (saveBtn) saveBtn.onclick = () => {
    if (draft.c.some(v => !v)) return;
    const total = calc();
    saveScore(pid, draft.c.slice(), draft.note.trim(), total);
    if (navigator.vibrate) navigator.vibrate(10);
    toast(t('saved', { pid, total: total.toFixed(1) }));
    location.hash = '#/scan';
  };
  // tap-and-hold a criterion name for the anchor descriptors
  $$('[data-hold]').forEach(el => {
    const i = +el.dataset.hold;
    let timer = null;
    const open = () => {
      const cr = crit[i], name = cr[lang === 'en' ? 'en' : 'bm'];
      showSheet(`<h3>${esc(name)} (${w[i]}%)</h3><p>${esc(t('c' + (i + 1)))}</p><ul>${t('anchors').map(a => `<li>${esc(a)}</li>`).join('')}</ul>`);
    };
    el.addEventListener('pointerdown', () => { clearTimeout(timer); timer = setTimeout(open, 450); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(timer)));
    el.addEventListener('contextmenu', ev => { ev.preventDefault(); clearTimeout(timer); open(); });
  });
}

boot();
