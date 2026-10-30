/**
 * FSB Johor 2026 Colouring Contest: jury scoring API (JURY_APP_SPEC.md sections 4, 8, 10).
 * GET  ?action=...&t=JURY_TOKEN | &k=ADMIN_KEY
 * POST body (text/plain JSON): {action, t | k, ...params}
 * Responses: {ok:true,data} or {ok:false,error,message}.
 */

var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/O/1/I
var STATUSES = ['active', 'absent', 'dq'];
var CONFIG_KEYS = Object.keys(DEFAULT_CONFIG).concat(['dataStatus', 'rankOverrides']);
var BOOL_KEYS = ['scoringLocked', 'resultsPublished', 'showNamesOnStage'];

var ACTIONS = {
  juryMe: { method: 'GET', auth: 'jury', fn: juryMe_ },
  juryArtworks: { method: 'GET', auth: 'jury', fn: juryArtworks_ },
  juryScores: { method: 'GET', auth: 'jury', fn: juryScores_ },
  saveScore: { method: 'POST', auth: 'jury', fn: saveScore_ },
  adminOverview: { method: 'GET', auth: 'admin', fn: adminOverview_ },
  syncRegistrations: { method: 'POST', auth: 'admin', fn: syncRegistrations_ },
  participantUpsert: { method: 'POST', auth: 'admin', fn: participantUpsert_ },
  participantDelete: { method: 'POST', auth: 'admin', fn: participantDelete_ },
  juryUpsert: { method: 'POST', auth: 'admin', fn: juryUpsert_ },
  juryRegenerate: { method: 'POST', auth: 'admin', fn: juryRegenerate_ },
  juryDelete: { method: 'POST', auth: 'admin', fn: juryDelete_ },
  scoreDelete: { method: 'POST', auth: 'admin', fn: scoreDelete_ },
  computeResults: { method: 'POST', auth: 'admin', fn: computeResults_ },
  setConfig: { method: 'POST', auth: 'admin', fn: setConfig_ },
  publicResults: { method: 'GET', auth: 'none', fn: publicResults_ }
};

// ---- Entry points and plumbing --------------------------------------------

function doGet(e) { return handle_('GET', (e && e.parameter) || {}); }

function doPost(e) {
  var p;
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { p = null; }
  if (!p || typeof p !== 'object') return json_({ ok: false, error: 'BAD_INPUT', message: 'Body must be JSON' });
  return handle_('POST', p);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function apiErr_(code, message) {
  var e = new Error(message);
  e.code = code;
  return e;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { throw apiErr_('BUSY', 'Server busy, please retry'); }
  try { return fn(); } finally { lock.releaseLock(); }
}

function handle_(method, p) {
  resetRequest_();
  try {
    var def = ACTIONS[p.action];
    if (!def) throw apiErr_('BAD_ACTION', 'Unknown action');
    if (def.method !== method) throw apiErr_('BAD_METHOD', def.method + ' required for ' + p.action);
    var run = function () {
      var ctx = authenticate_(def.auth, p);
      if (ctx.jury && method === 'POST') touchJury_(ctx.jury);
      return def.fn(ctx, p);
    };
    var data;
    if (method === 'POST') {
      data = withLock_(run);
    } else {
      data = run();
    }
    return json_({ ok: true, data: data });
  } catch (err) {
    if (!err.code) Logger.log(err && err.stack ? err.stack : String(err));
    return json_({ ok: false, error: err.code || 'SERVER_ERROR', message: err.code ? err.message : 'Unexpected server error' });
  }
}

function authenticate_(kind, p) {
  if (kind === 'none') return {};
  if (kind === 'admin') {
    var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
    if (!key || String(p.k || '') !== key) throw apiErr_('UNAUTHORIZED', 'Invalid admin key');
    return { admin: true };
  }
  var token = String(p.t || '').trim().toUpperCase();
  if (!token) throw apiErr_('UNAUTHORIZED', 'Missing jury token');
  var j = readTab_('Jury').rows.filter(function (r) { return String(r.token).toUpperCase() === token; })[0];
  if (!j || !isTrue_(j.active)) throw apiErr_('UNAUTHORIZED', 'This jury link is not valid or has been revoked');
  var ctx = { jury: j, cats: parseCats_(j.categories) };
  if (ACTIONS[p.action].method === 'GET' && !isTouchedRecently_(j)) {
    // GET calls are not under the script lock; lastSeen is best effort.
    try { withLock_(function () { touchJury_(j); }); } catch (e) { /* ignore */ }
  }
  return ctx;
}

function isTouchedRecently_(j) {
  var t = Date.parse(String(j.lastSeen).replace(' ', 'T'));
  return !isNaN(t) && Date.now() - t < 60000;
}

function touchJury_(j) {
  if (isTouchedRecently_(j)) return;
  writeRow_('Jury', j._row, { lastSeen: now_() });
}

// ---- Small helpers ----------------------------------------------------------

function randomChars_(n) {
  var out = '';
  while (out.length < n) {
    Utilities.getUuid().replace(/-/g, '').match(/../g).forEach(function (h) {
      if (out.length < n) out += ALPHABET.charAt(parseInt(h, 16) % 32);
    });
  }
  return out;
}

function newToken_(existing) {
  var t;
  do {
    var r = randomChars_(12);
    t = r.slice(0, 4) + '-' + r.slice(4, 8) + '-' + r.slice(8);
  } while (existing.indexOf(t) >= 0);
  return t;
}

function parseCats_(v) {
  var out = [];
  String(v).toUpperCase().split(/[^AB]+/).forEach(function (c) { if (c && out.indexOf(c) < 0) out.push(c); });
  return out;
}

function normPid_(v) { return String(v === undefined || v === null ? '' : v).trim().toUpperCase(); }

/** Section 6.2. Returns {digits, warn}. */
function normPhone_(raw) {
  var d = String(raw === undefined || raw === null ? '' : raw).replace(/\D/g, '');
  if (!d) return { digits: '', warn: true };
  if (d.charAt(0) === '0') return { digits: '60' + d.slice(1), warn: false };
  if (d.indexOf('60') === 0) return { digits: d, warn: false };
  return { digits: d, warn: true };
}

function pad3_(n) { var s = String(n); while (s.length < 3) s = '0' + s; return s; }

function nextPid_(cat, parts) {
  var max = 0;
  parts.forEach(function (p) {
    var m = /^([AB])-(\d+)$/.exec(String(p.pid));
    if (m && m[1] === cat) max = Math.max(max, parseInt(m[2], 10));
  });
  return cat + '-' + pad3_(max + 1);
}

function ymd_(s) {
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s) || null;
  if (m) return [+m[1], +m[2], +m[3]];
  m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/.exec(s); // Malaysian d/m/yyyy
  return m ? [+m[3], +m[2], +m[1]] : null;
}

function dobIso_(s) {
  var d = ymd_(String(s));
  return d ? d[0] + '-' + (d[1] < 10 ? '0' : '') + d[1] + '-' + (d[2] < 10 ? '0' : '') + d[2] : '';
}

function ageOn_(dob, eventDate) {
  var d = ymd_(String(dob)), e = ymd_(String(eventDate));
  if (!d || !e) return null;
  var age = e[0] - d[0];
  if (e[1] < d[1] || (e[1] === d[1] && e[2] < d[2])) age--;
  return age;
}

function categoryFor_(age) { return age < 7 ? 'B' : 'A'; }

function round_(x, dp) { var f = Math.pow(10, dp); return Math.round(x * f) / f; }

function total_(c, w) {
  var s = 0;
  for (var i = 0; i < 5; i++) s += c[i] / 10 * w[i];
  return round_(s, 1);
}

function mean_(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }

function sd_(a) {
  if (a.length < 2) return 0;
  var m = mean_(a);
  return Math.sqrt(a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / (a.length - 1));
}

function parseTs_(v) {
  if (typeof v === 'number') return v;
  var t = Date.parse(String(v).replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T'));
  return isNaN(t) ? 0 : t;
}

function link_(token) { return cfgStr_('baseUrl').replace(/\/+$/, '') + '/j/?t=' + token; }

function juryOut_(j) {
  var link = link_(j.token);
  var msg = 'Salam/Hi ' + j.name + ', terima kasih kerana sudi menjadi juri Pertandingan Mewarna FSB Johor 2026 (15 Nov, Kota Jail). ' +
    'Pautan juri peribadi anda: ' + link + ' . Sila buka pautan ini sekali sebelum mula menilai. Jangan kongsi pautan ini.';
  return {
    jid: j.jid, name: j.name, whatsapp: String(j.whatsapp), categories: parseCats_(j.categories), isHead: isTrue_(j.isHead),
    active: isTrue_(j.active), lastSeen: j.lastSeen, createdAt: j.createdAt, token: j.token, link: link,
    waUrl: 'https://wa.me/' + j.whatsapp + '?text=' + encodeURIComponent(msg),
    numberWarning: normPhone_(j.whatsapp).warn
  };
}

function scoreOut_(r) {
  return {
    key: r.key, jid: r.jid, pid: r.pid, category: r.category,
    c: [r.c1, r.c2, r.c3, r.c4, r.c5].map(Number), total: Number(r.total), note: r.note || '',
    updatedAtClient: r.updatedAtClient, updatedAtServer: r.updatedAtServer
  };
}

function requireAdminStr_(p, k) {
  var v = p[k] === undefined || p[k] === null ? '' : String(p[k]).trim();
  if (!v) throw apiErr_('BAD_INPUT', 'Missing ' + k);
  return v;
}

function partOut_(p) {
  var o = {};
  Object.keys(p).forEach(function (k) { if (k !== '_row') o[k] = p[k]; });
  o.checkedIn = isTrue_(p.checkedIn);
  return o;
}

/**
 * Per-artwork aggregation over active artworks. Totals are recomputed from c1..c5 so manual
 * sheet edits to `total` cannot skew results.
 */
function aggregate_(parts, scores) {
  var by = {};
  parts.forEach(function (p) {
    if (String(p.status) === 'active') by[p.pid] = { p: p, items: [] };
  });
  scores.forEach(function (r) {
    var a = by[normPid_(r.pid)];
    if (!a) return;
    var c = [r.c1, r.c2, r.c3, r.c4, r.c5].map(Number);
    if (c.some(function (x) { return !(x >= 1 && x <= 10 && Math.floor(x) === x); })) return;
    a.items.push({ jid: r.jid, c: c, total: total_(c, weights_(a.p.category)) });
  });
  Object.keys(by).forEach(function (pid) {
    var a = by[pid], t = a.items.map(function (i) { return i.total; });
    a.n = t.length;
    a.mean = a.n ? mean_(t) : 0;
    a.sd = sd_(t);
    a.c1Mean = a.n ? mean_(a.items.map(function (i) { return i.c[0]; })) : 0;
    a.c3Mean = a.n ? mean_(a.items.map(function (i) { return i.c[2]; })) : 0;
    a.maxDev = a.n ? Math.max.apply(null, t.map(function (x) { return Math.abs(x - a.mean); })) : 0;
    a.disagree = a.n >= 2 && (a.maxDev > 20 || a.sd > 15);
  });
  return by;
}

// ---- Jury handlers ----------------------------------------------------------

function juryMe_(ctx) {
  var j = ctx.jury, w = {};
  ctx.cats.forEach(function (c) { w[c] = weights_(c); });
  return {
    jid: j.jid, name: j.name, categories: ctx.cats, isHead: isTrue_(j.isHead),
    eventName: cfgStr_('eventName'), eventDate: cfgStr_('eventDate'),
    criteria: cfgJson_('criteria'), weights: w,
    minJuryPerArtwork: cfgInt_('minJuryPerArtwork'), locked: cfgBool_('scoringLocked')
  };
}

function juryArtworks_(ctx) {
  return readTab_('Participants').rows
    .filter(function (p) { return ctx.cats.indexOf(String(p.category).toUpperCase()) >= 0; })
    .map(function (p) { return { pid: p.pid, category: p.category, age: p.age === '' ? null : Number(p.age), status: p.status }; });
}

function juryScores_(ctx) {
  return readTab_('Scores').rows
    .filter(function (r) { return r.jid === ctx.jury.jid; })
    .map(scoreOut_);
}

function saveScore_(ctx, p) {
  if (cfgBool_('scoringLocked')) throw apiErr_('LOCKED', 'Scoring has closed. Skor sudah dikunci.');
  var pid = normPid_(p.pid);
  var part = readTab_('Participants').rows.filter(function (r) { return r.pid === pid; })[0];
  if (!part) throw apiErr_('NOT_FOUND', 'Artwork ' + pid + ' not found');
  if (ctx.cats.indexOf(part.category) < 0) throw apiErr_('FORBIDDEN', 'Artwork ' + pid + ' is not in your category');
  if (part.status !== 'active') throw apiErr_('NOT_ACTIVE', 'Artwork ' + pid + ' is ' + part.status + ' and cannot be scored');
  var c = p.c;
  if (!Array.isArray(c) || c.length !== 5 || c.some(function (x) { return typeof x !== 'number' || x < 1 || x > 10 || Math.floor(x) !== x; })) {
    throw apiErr_('BAD_INPUT', 'c must be 5 integers from 1 to 10');
  }
  var note = p.note === undefined || p.note === null ? '' : String(p.note);
  if (note.length > 140) throw apiErr_('BAD_INPUT', 'Note is limited to 140 characters');
  var clientTs = p.updatedAtClient === undefined || p.updatedAtClient === null || p.updatedAtClient === '' ? now_() : p.updatedAtClient;

  var key = ctx.jury.jid + '|' + pid;
  var old = readTab_('Scores').rows.filter(function (r) { return r.key === key; })[0];
  // Last write wins by client time. An equal timestamp is a retry of the same save: no-op.
  if (old && parseTs_(old.updatedAtClient) >= parseTs_(clientTs)) {
    return { saved: false, stale: true, score: scoreOut_(old) };
  }
  var total = total_(c, weights_(part.category));
  var row = {
    key: key, jid: ctx.jury.jid, pid: pid, category: part.category,
    c1: c[0], c2: c[1], c3: c[2], c4: c[3], c5: c[4], total: total, note: note,
    updatedAtClient: String(clientTs), updatedAtServer: now_()
  };
  writeRow_('Scores', old ? old._row : null, row);
  audit_(ctx.jury.jid, 'saveScore', key, old ? { c: [old.c1, old.c2, old.c3, old.c4, old.c5], total: old.total } : null,
    { c: c, total: total, opId: p.clientOpId || '' });
  return { saved: true, stale: false, score: scoreOut_(row) };
}

// ---- Admin: overview ----------------------------------------------------------

function adminOverview_() {
  var parts = readTab_('Participants').rows, juries = readTab_('Jury').rows, scores = readTab_('Scores').rows;
  var min = cfgInt_('minJuryPerArtwork');
  var agg = aggregate_(parts, scores);
  var counts = { registered: parts.length, checkedIn: 0, active: 0, complete: 0, scores: scores.length, byCategory: {} };
  ['A', 'B'].forEach(function (c) { counts.byCategory[c] = { registered: 0, checkedIn: 0, active: 0, complete: 0 }; });
  parts.forEach(function (p) {
    var b = counts.byCategory[p.category];
    if (!b) return;
    b.registered++;
    if (isTrue_(p.checkedIn)) { b.checkedIn++; counts.checkedIn++; }
    if (p.status === 'active') {
      b.active++; counts.active++;
      if (agg[p.pid].n >= min) { b.complete++; counts.complete++; }
    }
  });

  var matrix = {}, jurySummary = juries.map(function (j) {
    var cats = parseCats_(j.categories);
    matrix[j.jid] = [];
    return {
      jid: j.jid, name: j.name, categories: cats, isHead: isTrue_(j.isHead), active: isTrue_(j.active), lastSeen: j.lastSeen,
      expected: parts.filter(function (p) { return p.status === 'active' && cats.indexOf(p.category) >= 0; }).length, scored: 0
    };
  });
  Object.keys(agg).forEach(function (pid) {
    agg[pid].items.forEach(function (i) { if (matrix[i.jid]) matrix[i.jid].push(pid); });
  });
  jurySummary.forEach(function (j) { j.scored = matrix[j.jid].length; });

  var belowMin = [], flags = [];
  Object.keys(agg).forEach(function (pid) {
    var a = agg[pid];
    if (a.n < min) belowMin.push({ pid: pid, category: a.p.category, nScores: a.n });
    if (a.disagree) flags.push({ pid: pid, category: a.p.category, nScores: a.n, mean: round_(a.mean, 2), sd: round_(a.sd, 2), maxDev: round_(a.maxDev, 2) });
  });

  return {
    counts: counts,
    coverage: { juries: jurySummary, matrix: matrix, belowMin: belowMin },
    flags: flags,
    participants: parts.map(partOut_),
    juries: juries.map(juryOut_),
    scores: scores.map(scoreOut_),
    results: readTab_('Results').rows.map(function (r) { delete r._row; return r; }),
    config: config_()
  };
}

// ---- Admin: participants ------------------------------------------------------

/** Section 5.2 + 6.2 + 19. Idempotent on formRowKey; skips repeat submissions of the same child. */
function syncRegistrations_() {
  var map = cfgJson_('formColumnMap'), eventDate = cfgStr_('eventDate');
  var form = readTab_(FORM_TAB);
  var warnings = [], headerIdx = {};
  form.headers.forEach(function (h) { headerIdx[h.toLowerCase()] = h; });
  var col = {};
  Object.keys(map).forEach(function (f) {
    var h = headerIdx[String(map[f]).trim().toLowerCase()];
    if (h) col[f] = h;
    else if (f === 'childName' || f === 'guardianPhone') throw apiErr_('BAD_CONFIG', 'Form column not found for ' + f + ': ' + map[f]);
    else warnings.push('Form column not found for ' + f + ': ' + map[f]);
  });
  var get = function (r, f) { return col[f] ? r[col[f]] : ''; };

  var parts = readTab_('Participants').rows;
  var keys = {}, seen = {};
  var dupKey = function (name, phone) { return String(name).toLowerCase().replace(/\s+/g, ' ') + '|' + phone; };
  parts.forEach(function (p) {
    keys[p.formRowKey] = true;
    seen[dupKey(p.childName, normPhone_(p.guardianPhone).digits)] = p.pid;
  });

  var added = [], skipped = 0, all = parts.slice();
  form.rows.forEach(function (r) {
    var key = String(get(r, 'timestamp')) + '#' + r._row;
    if (keys[key]) { skipped++; return; }
    var name = String(get(r, 'childName')).trim();
    if (!name) { warnings.push('Row ' + r._row + ': no child name, skipped'); skipped++; return; }
    var ph = normPhone_(get(r, 'guardianPhone'));
    if (ph.warn) warnings.push('Row ' + r._row + ': check number (' + get(r, 'guardianPhone') + ')');
    var dk = dupKey(name, ph.digits);
    if (seen[dk]) { warnings.push('Row ' + r._row + ': duplicate of ' + seen[dk] + ', skipped'); skipped++; return; }
    var dob = String(get(r, 'dob')), age = dob ? ageOn_(dob, eventDate) : null;
    if (age === null) age = parseInt(get(r, 'age'), 10);
    if (age === null || isNaN(age)) { warnings.push('Row ' + r._row + ': cannot work out age, skipped'); skipped++; return; }
    if (age > 12) warnings.push('Row ' + r._row + ': age ' + age + ' is above 12');
    if (col.consent && !String(get(r, 'consent')).trim()) warnings.push('Row ' + r._row + ': no PDPA consent recorded');
    var cat = categoryFor_(age);
    var pid = nextPid_(cat, all);
    var part = {
      pid: pid, category: cat, childName: name, age: age, dob: dobIso_(dob), guardianName: get(r, 'guardianName'),
      guardianPhone: ph.digits, school: get(r, 'school'), source: 'form', formRowKey: key, checkedIn: false, status: 'active', createdAt: now_()
    };
    all.push(part); added.push(part); keys[key] = true; seen[dk] = pid;
  });
  appendRows_('Participants', added);
  audit_('admin', 'syncRegistrations', FORM_TAB, null, { added: added.map(function (a) { return a.pid; }), skipped: skipped });
  return { added: added.length, skipped: skipped, warnings: warnings };
}

var PART_FIELDS = ['childName', 'age', 'dob', 'guardianName', 'guardianPhone', 'school', 'category', 'status', 'checkedIn'];

/** Existing pid: update whitelisted fields. No pid: create a walk-in (section 9.4). */
function participantUpsert_(ctx, p) {
  var parts = readTab_('Participants').rows;
  var pid = normPid_(p.pid);
  var old = pid ? parts.filter(function (r) { return r.pid === pid; })[0] : null;
  if (pid && !old) throw apiErr_('NOT_FOUND', 'Participant ' + pid + ' not found');
  var fields = {};
  PART_FIELDS.forEach(function (f) { if (p[f] !== undefined) fields[f] = typeof p[f] === 'string' ? p[f].trim() : p[f]; });
  if (fields.guardianPhone !== undefined) fields.guardianPhone = normPhone_(fields.guardianPhone).digits;
  if (fields.status !== undefined && STATUSES.indexOf(fields.status) < 0) throw apiErr_('BAD_INPUT', 'status must be active, absent or dq');
  if (fields.category !== undefined) {
    fields.category = String(fields.category).toUpperCase();
    if (fields.category !== 'A' && fields.category !== 'B') throw apiErr_('BAD_INPUT', 'category must be A or B');
  }
  if (fields.age !== undefined) {
    fields.age = parseInt(fields.age, 10);
    if (isNaN(fields.age) || fields.age < 0 || fields.age > 99) throw apiErr_('BAD_INPUT', 'Invalid age');
  }
  if (fields.checkedIn !== undefined) fields.checkedIn = isTrue_(fields.checkedIn);

  if (old) {
    if (fields.category !== undefined && fields.category !== old.category && readTab_('Scores').rows.some(function (s) { return s.pid === pid; })) {
      throw apiErr_('HAS_SCORES', 'Delete the scores for ' + pid + ' before changing its category');
    }
    writeRow_('Participants', old._row, fields);
    var after = readTab_('Participants').rows.filter(function (r) { return r.pid === pid; })[0];
    audit_('admin', 'participantUpsert', pid, partOut_(old), partOut_(after));
    return partOut_(after);
  }
  if (!fields.childName) throw apiErr_('BAD_INPUT', 'Missing childName');
  if (fields.age === undefined) throw apiErr_('BAD_INPUT', 'Missing age');
  var cat = fields.category || categoryFor_(fields.age);
  var row = {
    pid: nextPid_(cat, parts), category: cat, childName: fields.childName, age: fields.age, dob: fields.dob || '',
    guardianName: fields.guardianName || '', guardianPhone: fields.guardianPhone || '', school: fields.school || '',
    source: 'walkin', formRowKey: '', checkedIn: fields.checkedIn === undefined ? true : fields.checkedIn,
    status: fields.status || 'active', createdAt: now_()
  };
  writeRow_('Participants', null, row);
  audit_('admin', 'participantUpsert', row.pid, null, partOut_(row));
  return partOut_(row);
}

/** Soft delete (section 13): marks the participant absent, row and scores kept. */
function participantDelete_(ctx, p) {
  var pid = normPid_(p.pid);
  var old = readTab_('Participants').rows.filter(function (r) { return r.pid === pid; })[0];
  if (!old) throw apiErr_('NOT_FOUND', 'Participant ' + pid + ' not found');
  writeRow_('Participants', old._row, { status: 'absent' });
  audit_('admin', 'participantDelete', pid, { status: old.status }, { status: 'absent' });
  return { pid: pid, status: 'absent' };
}

// ---- Admin: juries --------------------------------------------------------------

function juryUpsert_(ctx, p) {
  var juries = readTab_('Jury').rows;
  var old = p.jid ? juries.filter(function (r) { return r.jid === p.jid; })[0] : null;
  if (p.jid && !old) throw apiErr_('NOT_FOUND', 'Jury ' + p.jid + ' not found');
  var name = p.name !== undefined || !old ? requireAdminStr_(p, 'name') : old.name;
  var wa = p.whatsapp !== undefined || !old ? normPhone_(requireAdminStr_(p, 'whatsapp')).digits : String(old.whatsapp);
  var cats = p.categories !== undefined || !old ? parseCats_(Array.isArray(p.categories) ? p.categories.join(',') : requireAdminStr_(p, 'categories')) : parseCats_(old.categories);
  if (!cats.length) throw apiErr_('BAD_INPUT', 'categories must include A and/or B');
  var row = {
    name: name, whatsapp: wa, categories: cats.join(','),
    isHead: p.isHead !== undefined ? isTrue_(p.isHead) : (old ? isTrue_(old.isHead) : false)
  };
  if (p.active !== undefined) row.active = isTrue_(p.active);
  if (old) {
    writeRow_('Jury', old._row, row);
    audit_('admin', 'juryUpsert', old.jid, juryAudit_(old), row);
    return juryOut_(readTab_('Jury').rows.filter(function (r) { return r.jid === old.jid; })[0]);
  }
  var max = 0;
  juries.forEach(function (j) { var m = /^J(\d+)$/.exec(j.jid); if (m) max = Math.max(max, +m[1]); });
  row.jid = 'J' + (max + 1 < 10 ? '0' : '') + (max + 1);
  row.token = newToken_(juries.map(function (j) { return j.token; }));
  row.active = row.active === undefined ? true : row.active;
  row.lastSeen = '';
  row.createdAt = now_();
  writeRow_('Jury', null, row);
  audit_('admin', 'juryUpsert', row.jid, null, juryAudit_(row));
  return juryOut_(row);
}

function juryAudit_(j) { return { name: j.name, whatsapp: j.whatsapp, categories: j.categories, isHead: j.isHead, active: j.active }; }

function juryRegenerate_(ctx, p) {
  var juries = readTab_('Jury').rows;
  var old = juries.filter(function (r) { return r.jid === p.jid; })[0];
  if (!old) throw apiErr_('NOT_FOUND', 'Jury ' + p.jid + ' not found');
  var token = newToken_(juries.map(function (j) { return j.token; }));
  writeRow_('Jury', old._row, { token: token });
  audit_('admin', 'juryRegenerate', old.jid, 'token rotated', 'token rotated'); // tokens never go in the audit log
  old.token = token;
  return juryOut_(old);
}

function juryDelete_(ctx, p) {
  var old = readTab_('Jury').rows.filter(function (r) { return r.jid === p.jid; })[0];
  if (!old) throw apiErr_('NOT_FOUND', 'Jury ' + p.jid + ' not found');
  if (isTrue_(old.active)) throw apiErr_('ACTIVE', 'Deactivate ' + old.jid + ' before deleting');
  deleteRow_('Jury', old._row);
  audit_('admin', 'juryDelete', old.jid, juryAudit_(old), null);
  return { jid: old.jid };
}

// ---- Admin: scores, config, results -----------------------------------------------

function scoreDelete_(ctx, p) {
  var key = String(p.key || '').trim();
  var old = readTab_('Scores').rows.filter(function (r) { return r.key === key; })[0];
  if (!old) throw apiErr_('NOT_FOUND', 'Score ' + key + ' not found');
  deleteRow_('Scores', old._row);
  audit_('admin', 'scoreDelete', key, scoreOut_(old), null);
  return { key: key };
}

function setConfig_(ctx, p) {
  var key = String(p.key || '').trim();
  if (CONFIG_KEYS.indexOf(key) < 0) throw apiErr_('BAD_INPUT', 'Unknown config key');
  var val = p.value === undefined || p.value === null ? '' : p.value;
  if (typeof val !== 'string') val = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (BOOL_KEYS.indexOf(key) >= 0) {
    if (!/^(true|false)$/i.test(val.trim())) throw apiErr_('BAD_INPUT', key + ' must be TRUE or FALSE');
    val = val.trim().toUpperCase();
  }
  if (/^(minJuryPerArtwork|winnersPerCategory|consolationPerCategory)$/.test(key) && !/^[1-9]\d*$/.test(val.trim())) {
    throw apiErr_('BAD_INPUT', key + ' must be a positive integer');
  }
  if (/^weights[AB]$/.test(key)) {
    var w = val.charAt(0) === '[' ? JSON.parse(val) : val.split(',').map(Number);
    if (w.length !== 5 || w.some(function (x) { return !isFinite(x) || x < 0; })) throw apiErr_('BAD_INPUT', key + ' needs 5 non-negative numbers');
  }
  if (/^(criteria|formColumnMap|rankOverrides)$/.test(key)) {
    try { JSON.parse(val); } catch (e) { throw apiErr_('BAD_INPUT', key + ' must be valid JSON'); }
  }
  var tab = readTab_('Config');
  var old = tab.rows.filter(function (r) { return r.key === key; })[0];
  writeRow_('Config', old ? old._row : null, { key: key, value: val });
  resetRequest_();
  audit_('admin', 'setConfig', key, old ? old.value : null, val);
  return { key: key, value: val };
}

/**
 * Ranking per category (section 8): mean desc, then mean c3, then mean c1, then admin
 * override (Config.rankOverrides = {"A-003": 1}, lower first), then pid for a stable order.
 */
function computeResults_() {
  var parts = readTab_('Participants').rows, scores = readTab_('Scores').rows;
  var min = cfgInt_('minJuryPerArtwork'), agg = aggregate_(parts, scores);
  var overrides = {}, warnings = [];
  try { overrides = JSON.parse(cfgStr_('rankOverrides') || '{}') || {}; } catch (e) { warnings.push('rankOverrides is not valid JSON, ignored'); }
  if (cfgStr_('aggregation') !== 'mean') warnings.push('aggregation "' + cfgStr_('aggregation') + '" is not implemented; plain mean used');
  var eq = function (a, b) { return Math.abs(a - b) < 1e-9; };
  var out = { A: [], B: [], unranked: [], warnings: warnings }, sheetRows = [];

  ['A', 'B'].forEach(function (cat) {
    var list = [];
    Object.keys(agg).forEach(function (pid) {
      var a = agg[pid];
      if (a.p.category !== cat) return;
      if (a.n >= min) list.push(a); else out.unranked.push({ pid: pid, category: cat, nScores: a.n });
    });
    var ov = function (a) { return overrides[a.p.pid] === undefined ? Infinity : Number(overrides[a.p.pid]); };
    list.sort(function (x, y) {
      if (!eq(x.mean, y.mean)) return y.mean - x.mean;
      if (!eq(x.c3Mean, y.c3Mean)) return y.c3Mean - x.c3Mean;
      if (!eq(x.c1Mean, y.c1Mean)) return y.c1Mean - x.c1Mean;
      if (ov(x) !== ov(y)) return ov(x) < ov(y) ? -1 : 1;
      return x.p.pid < y.p.pid ? -1 : 1;
    });
    var tied = function (x, y) { return eq(x.mean, y.mean) && eq(x.c3Mean, y.c3Mean) && eq(x.c1Mean, y.c1Mean); };
    list.forEach(function (a, i) {
      var flags = [];
      var group = list.filter(function (o) { return tied(a, o); });
      if (group.length > 1) {
        var ranks = group.map(ov);
        var resolved = ranks.every(isFinite) && ranks.filter(function (r, k) { return ranks.indexOf(r) === k; }).length === ranks.length;
        flags.push(resolved ? 'TIE' : 'TIE-UNRESOLVED');
      }
      if (a.disagree) flags.push('DISAGREE');
      var row = {
        category: cat, rank: i + 1, pid: a.p.pid, nScores: a.n, mean: round_(a.mean, 2), sd: round_(a.sd, 2),
        c3Mean: round_(a.c3Mean, 2), c1Mean: round_(a.c1Mean, 2), flag: flags.join(',')
      };
      sheetRows.push(row);
      out[cat].push(row);
    });
  });
  clearData_('Results');
  appendRows_('Results', sheetRows);
  audit_('admin', 'computeResults', '', null, { A: out.A.length, B: out.B.length, unranked: out.unranked.length });
  return out;
}

function publicResults_() {
  if (!cfgBool_('resultsPublished')) throw apiErr_('NOT_PUBLISHED', 'Results coming soon / Keputusan akan diumumkan');
  var win = cfgInt_('winnersPerCategory'), con = cfgInt_('consolationPerCategory');
  var names = {};
  readTab_('Participants').rows.forEach(function (p) { names[p.pid] = String(p.childName).split(/\s+/)[0]; });
  var out = { eventName: cfgStr_('eventName'), A: [], B: [] };
  readTab_('Results').rows.forEach(function (r) {
    var rank = Number(r.rank);
    if (!out[r.category] || rank > win + con) return;
    out[r.category].push({ rank: rank, tier: rank <= win ? 'winner' : 'consolation', pid: r.pid, firstName: names[r.pid] || '' });
  });
  ['A', 'B'].forEach(function (c) { out[c].sort(function (x, y) { return x.rank - y.rank; }); });
  return out;
}
