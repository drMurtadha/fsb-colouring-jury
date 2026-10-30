// M1/M2 backend check: runs apps-script/*.gs against an in-memory Sheet emulation.
// Usage: node tools/test-m1.js   (no dependencies)
// This proves the logic, not the Google runtime; see README for the live smoke test.
const { Sheet, sheets, props, run, get, post, rows, ok, eq, summary } = require('./gas-emu');

// ---- setup ----
run('setup()');
ok(Object.keys(sheets).length === 6, 'setup creates tabs');
const KEY = props.ADMIN_KEY;
ok(KEY && KEY.length === 16, 'ADMIN_KEY generated');
const A = { k: KEY };
run(`(function(){ var s = sheet_('Config'); })()`);

// ---- form responses (cases from spec section 19) ----
const H = ['Timestamp', "Nama Penuh Peserta / Child's Full Name", 'Tarikh Lahir / Date of Birth', 'Umur pada 15 Nov 2026 / Age on 15 Nov 2026',
  "Nama Penjaga / Guardian's Name", "No. WhatsApp Penjaga / Guardian's WhatsApp", 'Sekolah atau Tadika / School or Kindergarten', 'Persetujuan PDPA / PDPA Consent'];
sheets['Form Responses 1'] = new Sheet('Form Responses 1');
sheets['Form Responses 1'].rows = [H,
  ['2026-10-15 15:53:00', 'Aisyah Sofea', '2014-04-01', '12', 'Nor Hayati', '011-0000 0001', 'SK 1', 'Setuju'],
  ['2026-10-16 04:30:00', 'Danish Faizal', '2016-01-06', '10', 'Faizal', '01100000002', 'SK 2', 'Setuju'],
  ['2026-10-16 10:03:00', 'Tan Yi Xuan', '2017-01-26', '9', 'Lim', '+60 11-0000 0003', 'SJK(C)', 'Setuju'],
  ['2026-10-16 19:41:00', 'Arjun Suresh', '2014-12-12', '11', 'Suresh', 601100000004, 'SJK(T)', 'Setuju'],
  ['2026-10-17 09:00:00', 'Birthday Boy', '2019-11-10', '7', 'Ayah', '01100000005', '', 'Setuju'],        // turns 7 on 10 Nov: A
  ['2026-10-17 09:10:00', 'Little One', '2020-05-05', '6', 'Ibu', '01100000006', 'Tadika', 'Setuju'],       // B
  ['2026-10-18 10:00:00', 'Tan Yi Xuan', '2017-01-26', '9', 'Lim', '011-0000 0003', 'SJK(C)', 'Setuju']];   // duplicate of row 4
let r = post({ action: 'syncRegistrations', ...A });
ok(r.ok, 'sync ok'); eq([r.data.added, r.data.skipped], [6, 1], 'first sync added/skipped');
ok(r.data.warnings.some(w => /duplicate of A-003/.test(w)), 'duplicate warned');
r = post({ action: 'syncRegistrations', ...A });
eq([r.data.added, r.data.skipped], [0, 7], 'second sync adds 0');
let P = get({ action: 'adminOverview', ...A }).data.participants;
eq(P.map(p => p.pid), ['A-001', 'A-002', 'A-003', 'A-004', 'A-005', 'B-001'], 'pids');
eq(P.map(p => p.category).join(''), 'AAAAAB', 'categories (7th birthday on 10 Nov is A)');
eq(P[0].guardianPhone, '601100000001', 'phone normalised'); eq(P[2].guardianPhone, '601100000003', '+60 normalised'); eq(P[3].guardianPhone, '601100000004', 'numeric phone');
eq(P[4].school, '', 'blank school kept blank');
// mapping is read from Config: break it
post({ action: 'setConfig', ...A, key: 'formColumnMap', value: JSON.stringify({ childName: 'Nope', guardianPhone: 'X' }) });
r = post({ action: 'syncRegistrations', ...A }); ok(!r.ok && r.error === 'BAD_CONFIG', 'missing mapped column -> BAD_CONFIG');
post({ action: 'setConfig', ...A, key: 'formColumnMap', value: run('DEFAULT_CONFIG.formColumnMap') });

// ---- auth and routing ----
ok(get({ action: 'adminOverview', k: 'bad' }).error === 'UNAUTHORIZED', 'bad admin key');
ok(get({ action: 'juryMe', t: 'nope' }).error === 'UNAUTHORIZED', 'bad token');
ok(get({ action: 'nothing' }).error === 'BAD_ACTION', 'bad action');
ok(get({ action: 'saveScore', t: 'x' }).error === 'BAD_METHOD', 'GET on POST action');
ok(get({ action: 'publicResults' }).error === 'NOT_PUBLISHED', 'results hidden');

// ---- juries ----
const mk = (name, wa, cats, head) => post({ action: 'juryUpsert', ...A, name, whatsapp: wa, categories: cats, isHead: head }).data;
const j1 = mk('Ar. Satu', '0112345678', 'A,B', true), j2 = mk('Dua', '011-9999 0002', 'A', false), j3 = mk('Tiga', '+60 11-0000 0003', 'A', false);
eq([j1.jid, j2.jid, j3.jid], ['J01', 'J02', 'J03'], 'jids');
eq(j1.whatsapp, '60112345678', 'jury phone normalised');
ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(j1.token), 'token format');
ok(j1.waUrl.startsWith('https://wa.me/60112345678?text=') && decodeURIComponent(j1.waUrl).includes(j1.link + ' . Sila buka'), 'wa.me url has link');
ok(!JSON.stringify(rows('Audit')).includes(j1.token), 'token not in audit');
ok(mk('Foreign', '441234567890', 'B', false).numberWarning === true, 'foreign number warned');
let me = get({ action: 'juryMe', t: j2.token.toLowerCase() });
ok(me.ok && me.data.jid === 'J02' && me.data.weights.A.join() === '25,20,25,15,15' && me.data.criteria.length === 5, 'juryMe');
ok(!('B' in me.data.weights), 'weights only for own categories');
ok(rows('Jury').find(x => x[0] === 'J02')[7] !== '', 'lastSeen touched');
let arts = get({ action: 'juryArtworks', t: j2.token }).data;
eq(arts.length, 5, 'J02 sees only category A'); ok(!JSON.stringify(arts).match(/Aisyah|601100/), 'no names or phones to jury');

// ---- scoring ----
const S = (j, pid, c, extra = {}) => post({ action: 'saveScore', t: j.token, pid, c, updatedAtClient: '2026-11-15T12:20:00Z', clientOpId: 'op', ...extra });
r = S(j1, 'A-001', [7, 6, 8, 10, 5]); ok(r.ok && r.data.score.total === 72, 'total 72 (matches mock sheet sample)');
r = S(j1, 'A-001', [7, 6, 8, 10, 5]); ok(r.ok && r.data.stale && r.data.saved === false, 'retry is idempotent');
eq(rows('Scores').length, 1, 'one score row after retry');
r = S(j1, 'A-001', [9, 9, 9, 9, 9], { updatedAtClient: '2026-11-15T12:10:00Z' }); ok(r.data.stale, 'older client write ignored');
r = S(j1, 'A-001', [9, 9, 9, 9, 9], { updatedAtClient: '2026-11-15T12:30:00Z', note: 'nice' }); ok(r.data.saved && r.data.score.total === 90, 'newer write updates');
eq(rows('Scores').length, 1, 'upsert keeps one row');
ok(S(j1, 'A-001', [0, 6, 8, 10, 5], { updatedAtClient: 'z' }).error === 'BAD_INPUT', 'rejects 0');
ok(S(j1, 'A-001', [1.5, 6, 8, 10, 5]).error === 'BAD_INPUT', 'rejects non-integer');
ok(S(j1, 'A-001', [1, 2, 3]).error === 'BAD_INPUT', 'rejects wrong length');
ok(S(j1, 'A-001', [5, 5, 5, 5, 5], { note: 'x'.repeat(141) }).error === 'BAD_INPUT', 'rejects long note');
ok(S(j2, 'B-001', [5, 5, 5, 5, 5]).error === 'FORBIDDEN', 'wrong category');
ok(S(j1, 'A-099', [5, 5, 5, 5, 5]).error === 'NOT_FOUND', 'unknown pid');
post({ action: 'participantUpsert', ...A, pid: 'A-005', status: 'absent' });
ok(S(j1, 'A-005', [5, 5, 5, 5, 5]).error === 'NOT_ACTIVE', 'absent blocked');
post({ action: 'participantUpsert', ...A, pid: 'A-005', status: 'active' });
r = S(j1, 'B-001', [5, 5, 5, 5, 5]); ok(r.data.score.total === 5 * 25 / 10 + 5 * 15 / 10 + 5 * 30 / 10 + 5 * 10 / 10 + 5 * 20 / 10 + 0, 'cat B weights used');
r = S(j2, 'A-001', [5, 5, 5, 5, 5]); eq(rows('Scores').length, 3, 'two juries on same artwork -> two rows');
// concurrent-ish: both juries on A-002..A-004
for (const [j, v] of [[j1, 8], [j2, 6], [j3, 4]]) for (const pid of ['A-002', 'A-003', 'A-004']) S(j, pid, [v, v, v, v, v]);
eq(get({ action: 'juryScores', t: j1.token }).data.length, 5, 'juryScores returns own rows only');

// ---- overview, results, tie-break ----
let ov = get({ action: 'adminOverview', ...A }).data;
eq(ov.counts.byCategory.A.registered, 5, 'overview counts');
ok(ov.flags.some(f => f.pid === 'A-001'), 'disagreement flag A-001 (90 vs 50)');
ok(ov.coverage.belowMin.some(b => b.pid === 'A-005'), 'below-min listed');
eq(ov.coverage.matrix.J01.sort(), ['A-001', 'A-002', 'A-003', 'A-004', 'B-001'], 'coverage matrix J01');
r = post({ action: 'computeResults', ...A }).data;
// hand calc: A-001 mean(90,50)=70; A-002/3/4 means of 8,6,4 => 60 each (all weights sum to 100 => total = 10*v)
eq(r.A.map(x => x.pid).slice(0, 1), ['A-001'], 'A-001 ranks first');
eq(r.A[0].mean, 70, 'A-001 mean 70');
eq(r.A.slice(1).map(x => [x.pid, x.mean, x.flag]), [['A-002', 60, 'TIE-UNRESOLVED,DISAGREE'], ['A-003', 60, 'TIE-UNRESOLVED,DISAGREE'], ['A-004', 60, 'TIE-UNRESOLVED,DISAGREE']], 'three-way tie unresolved');
eq(r.unranked.map(x => x.pid).sort(), ['A-005', 'B-001'], 'unranked below minimum');
post({ action: 'setConfig', ...A, key: 'rankOverrides', value: JSON.stringify({ 'A-004': 1, 'A-002': 2, 'A-003': 3 }) });
r = post({ action: 'computeResults', ...A }).data;
eq(r.A.map(x => x.pid), ['A-001', 'A-004', 'A-002', 'A-003'], 'override resolves tie');
eq(r.A[1].flag, 'TIE,DISAGREE', 'resolved tie flagged TIE');
// c3 tie-break: equal totals (58), B-002 has higher creativity so it beats B-001 despite higher colour mean
post({ action: 'participantUpsert', ...A, childName: 'Second Little', age: 5 });
post({ action: 'setConfig', ...A, key: 'minJuryPerArtwork', value: '1' });
S(j1, 'B-001', [10, 4, 4, 5, 5], { updatedAtClient: '2026-11-15T13:00:00Z' });
S(j1, 'B-002', [4, 4, 10, 4, 4], { updatedAtClient: '2026-11-15T13:00:00Z' });
r = post({ action: 'computeResults', ...A }).data;
eq(r.B.map(x => [x.pid, x.mean]), [['B-002', 58], ['B-001', 58]], 'c3 breaks tie before c1');
post({ action: 'setConfig', ...A, key: 'minJuryPerArtwork', value: '2' });
r = post({ action: 'computeResults', ...A }).data;
eq(rows('Results').length, 4, 'Results tab rewritten, not appended');

// ---- lock ----
post({ action: 'setConfig', ...A, key: 'scoringLocked', value: 'true' });
ok(S(j1, 'A-003', [5, 5, 5, 5, 5], { updatedAtClient: '2026-11-15T14:00:00Z' }).error === 'LOCKED', 'lock blocks jury writes');
ok(get({ action: 'juryMe', t: j1.token }).data.locked === true, 'juryMe shows locked');
ok(post({ action: 'setConfig', ...A, key: 'bogus', value: '1' }).error === 'BAD_INPUT', 'unknown config key rejected');
ok(post({ action: 'setConfig', ...A, key: 'scoringLocked', value: 'maybe' }).error === 'BAD_INPUT', 'bad bool rejected');

// ---- publish ----
ok(get({ action: 'publicResults' }).error === 'NOT_PUBLISHED', 'still hidden');
post({ action: 'setConfig', ...A, key: 'resultsPublished', value: 'TRUE' });
const pub = get({ action: 'publicResults' }).data;
ok(pub.A[0].pid === 'A-001' && pub.A[0].firstName === 'Aisyah' && pub.A[0].tier === 'winner', 'public results first name only');
ok(!JSON.stringify(pub).match(/Sofea|601100|mean/), 'no extra personal data or scores publicly');

// ---- jury admin ----
ok(post({ action: 'juryDelete', ...A, jid: 'J02' }).error === 'ACTIVE', 'must deactivate first');
const old = j2.token;
const rg = post({ action: 'juryRegenerate', ...A, jid: 'J02' }).data;
ok(rg.token !== old && get({ action: 'juryMe', t: old }).error === 'UNAUTHORIZED' && get({ action: 'juryMe', t: rg.token }).ok, 'regenerate revokes old link');
post({ action: 'juryUpsert', ...A, jid: 'J02', active: false });
ok(get({ action: 'juryMe', t: rg.token }).error === 'UNAUTHORIZED', 'deactivated link revoked');
ok(post({ action: 'juryDelete', ...A, jid: 'J02' }).ok, 'delete after deactivate');
// walk-in
const w = post({ action: 'participantUpsert', ...A, childName: 'Walk In', age: 5, guardianPhone: '012 345 6789' }).data;
ok(w.pid === 'B-003' && w.source === 'walkin' && w.checkedIn === true && w.guardianPhone === '60123456789', 'walk-in');
ok(post({ action: 'scoreDelete', ...A, key: 'J01|A-001' }).ok && !rows('Scores').some(x => x[0] === 'J01|A-001'), 'scoreDelete');
const acts = rows('Audit').map(x => x[2]);
for (const a of ['saveScore', 'syncRegistrations', 'juryUpsert', 'juryRegenerate', 'juryDelete', 'scoreDelete', 'computeResults', 'setConfig', 'participantUpsert'])
  ok(acts.includes(a), 'audit has ' + a);

// ---- seed ----
run('seed()');
eq([rows('Participants').length, rows('Jury').length], [120, 3], 'seed.gs rows');

summary();
