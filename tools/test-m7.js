// M7 hardening check, offline: 3 juries x 120 saves with shuffled interleaving, retries and edits; formula-injection
// safety; call cost per save. The emulator is single-threaded, so this shows ordering and idempotency, not true
// simultaneity (Google's LockService provides that). Usage: node tools/test-m7.js
const { setClock, calls, sheets, props, run, get, post, rows, ok, eq, summary } = require('./gas-emu');
const { Sheet } = require('./gas-emu');
setClock('2033-01-01T00:00:00Z');                          // fixed client times below are in the past for the server

run('setup()');
const A = { k: props.ADMIN_KEY };
run('seed()');                                                 // 60 A + 60 B artworks = 120, juries J01..J03 on both categories
const juries = rows('Jury').map(r => ({ jid: r[0], token: r[5] }));
const W = { A: [25, 20, 25, 15, 15], B: [25, 15, 30, 10, 20] };
const pids = ['A', 'B'].flatMap(c => Array.from({ length: 60 }, (_, i) => `${c}-${String(i + 1).padStart(3, '0')}`));

let seed = 99; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const total = (pid, c) => Math.round(c.reduce((s, v, i) => s + v / 10 * W[pid[0]][i], 0) * 10) / 10;

// every (jury, artwork) gets a first score; ~15% are later edited with a newer time; ~20% of sends are repeated verbatim
const jobs = [];
const final = {};                                              // key -> intended final c
let clock = Date.UTC(2026, 10, 15, 12, 0, 0);
for (const j of juries) for (const pid of pids) {
  const c1 = Array.from({ length: 5 }, () => 1 + Math.floor(rnd() * 10));
  jobs.push({ j, pid, c: c1, ts: clock++ });
  final[j.jid + '|' + pid] = c1;
  if (rnd() < 0.15) { const c2 = Array.from({ length: 5 }, () => 1 + Math.floor(rnd() * 10)); jobs.push({ j, pid, c: c2, ts: clock + 100000 + jobs.length }); final[j.jid + '|' + pid] = c2; }
}
let sends = shuffle(jobs.flatMap(x => (rnd() < 0.2 ? [x, x] : [x])));      // duplicates model a lost response and retry
// an edit must never be overtaken by its original: sort each key's sends by ts only when they would otherwise reorder the final value
// (late-arriving older writes are legitimate and must be ignored by last-write-wins, so we keep the shuffle as is)

let errors = 0, saved = 0, stale = 0, c0 = calls.n;
for (const x of sends) {
  const r = post({ action: 'saveScore', t: x.j.token, pid: x.pid, c: x.c, updatedAtClient: new Date(x.ts).toISOString(), clientOpId: x.j.jid + x.pid + x.ts });
  if (!r.ok) { errors++; console.log('error', r.error, x.pid); continue; }
  r.data.saved ? saved++ : stale++;
}
const perSave = (calls.n - c0) / sends.length;
eq(errors, 0, `no errors across ${sends.length} sends (3 juries x 120 artworks, edits and retries)`);
eq(rows('Scores').length, 360, '360 score rows: one per jury and artwork, never duplicated by retries');
let wrong = 0;
for (const r of rows('Scores')) {
  const want = final[r[0]], got = [4, 5, 6, 7, 8].map(i => Number(r[i]));
  if (JSON.stringify(want) !== JSON.stringify(got) || Number(r[9]) !== total(r[2], want)) wrong++;
}
eq(wrong, 0, 'every row holds the latest-timestamp scores and the server-computed total, whatever order the sends arrived in');
ok(stale > 0 && saved >= 360, `late and repeated sends were absorbed (saved ${saved}, ignored ${stale})`);
eq(new Set(rows('Scores').map(r => r[0])).size, 360, 'keys unique');
// two phones, same artwork
eq(rows('Scores').filter(r => r[2] === 'A-001').map(r => r[1]).sort(), ['J01', 'J02', 'J03'], 'three juries on A-001 give three rows');

const ov = get({ action: 'adminOverview', ...A }).data;
eq([ov.counts.complete, ov.counts.active, ov.coverage.belowMin.length], [120, 120, 0], 'overview: all 120 artworks fully covered');
for (const j of juries) eq(get({ action: 'juryScores', t: j.token }).data.length, 120, `${j.jid} reads back 120 scores`);
const res = post({ action: 'computeResults', ...A }).data;
eq([res.A.length, res.B.length, res.unranked.length], [60, 60, 0], 'results rank all 120');

// cost: Spreadsheet-service round trips per call
const one = juries[0];
let n0 = calls.n; post({ action: 'saveScore', t: one.token, pid: 'A-001', c: [5, 5, 5, 5, 5], updatedAtClient: '2030-01-01T00:00:00Z' }); const upd = calls.n - n0;
n0 = calls.n; get({ action: 'juryMe', t: one.token }); const me = calls.n - n0;
console.log(`info: ~${perSave.toFixed(1)} spreadsheet calls per save on average (update ${upd}); juryMe ${me}`);
ok(upd <= 22, 'a save stays within a modest number of sheet calls');

// clock skew: an older client timestamp never overwrites, a newer one does
post({ action: 'saveScore', t: one.token, pid: 'B-005', c: [1, 1, 1, 1, 1], updatedAtClient: '2030-06-01T00:00:00Z' });
let r = post({ action: 'saveScore', t: one.token, pid: 'B-005', c: [9, 9, 9, 9, 9], updatedAtClient: '2030-05-01T00:00:00Z' });
ok(r.ok && r.data.stale && r.data.score.c[0] === 1, 'older timestamp is ignored and the stored score is returned');

// lock mid-run
post({ action: 'setConfig', ...A, key: 'scoringLocked', value: 'TRUE' });
const before = JSON.stringify(rows('Scores'));
r = post({ action: 'saveScore', t: one.token, pid: 'A-002', c: [10, 10, 10, 10, 10], updatedAtClient: '2031-01-01T00:00:00Z' });
ok(r.error === 'LOCKED' && JSON.stringify(rows('Scores')) === before, 'locked: write rejected, rows unchanged');
post({ action: 'setConfig', ...A, key: 'scoringLocked', value: 'FALSE' });

// formula injection: text from the public form or a jury note must be stored as text, never as a formula
sheets['Form Responses 1'] = new Sheet('Form Responses 1');
sheets['Form Responses 1'].rows = [
  ['Timestamp', "Nama Penuh Peserta / Child's Full Name", 'Tarikh Lahir / Date of Birth', 'Umur pada 15 Nov 2026 / Age on 15 Nov 2026', "Nama Penjaga / Guardian's Name", "No. WhatsApp Penjaga / Guardian's WhatsApp", 'Sekolah atau Tadika / School or Kindergarten', 'Persetujuan PDPA / PDPA Consent'],
  ['2026-10-20 10:00:00', '=HYPERLINK("http://evil","x")', '2018-01-01', '8', '+cmd|calc', '0129998888', '@SUM(1)', 'Setuju']
];
r = post({ action: 'syncRegistrations', ...A }); ok(r.ok && r.data.added === 1, 'hostile row synced as data');
const pr = sheets.Participants.rows, pi = pr.findIndex(x => x[2] === '=HYPERLINK("http://evil","x")'), hdr = pr[0];
const fmt = col => sheets.Participants.fmts[(pi + 1) + ',' + (hdr.indexOf(col) + 1)];
eq([fmt('childName'), fmt('guardianName'), fmt('school')], ['@', '@', '@'], 'name, guardian and school cells are plain-text formatted');
post({ action: 'saveScore', t: one.token, pid: 'A-003', c: [5, 5, 5, 5, 5], note: '=1+1', updatedAtClient: '2032-01-01T00:00:00Z' });
const si = sheets.Scores.rows.findIndex(x => x[0] === 'J01|A-003');
eq(sheets.Scores.fmts[(si + 1) + ',' + (sheets.Scores.rows[0].indexOf('note') + 1)], '@', 'jury note cell is plain-text formatted');
eq(sheets.Scores.fmts[(si + 1) + ',' + (sheets.Scores.rows[0].indexOf('c1') + 1)], 'General', 'numeric score cells stay numeric');

// future client time: a phone clock far ahead must not freeze the score against later real saves
const FUT = { t: one.token, pid: 'A-006' };
setClock('2034-01-01T10:00:00Z');
r = post({ action: 'saveScore', ...FUT, c: [7, 6, 8, 10, 5], updatedAtClient: '2040-06-01T00:00:00Z' });
ok(r.ok && r.data.saved && r.data.score.updatedAtClient === '2034-01-01T10:00:00.000Z', 'client time years ahead is stored as server time, ISO UTC');
setClock('2034-01-01T10:01:00Z');
r = post({ action: 'saveScore', ...FUT, c: [9, 9, 9, 9, 9], updatedAtClient: '2034-01-01T10:01:00Z' });
ok(r.ok && r.data.saved && r.data.score.c[0] === 9, 'a later real save is accepted, not rejected as stale');
r = post({ action: 'saveScore', ...FUT, c: [2, 2, 2, 2, 2], updatedAtClient: '2034-01-01T10:04:00Z' });
ok(r.data.saved && r.data.score.updatedAtClient === '2034-01-01T10:04:00.000Z', 'a client time 3 minutes ahead is kept as sent');
r = post({ action: 'saveScore', ...FUT, c: [3, 3, 3, 3, 3], updatedAtClient: '2034-01-01T10:07:00Z' });
ok(r.data.stale && r.data.score.c[0] === 2, 'a client time 6 minutes ahead is clamped to server time (10:01), so it does not overtake the 10:04 save');
setClock('2034-01-01T10:10:00Z');
r = post({ action: 'saveScore', ...FUT, c: [4, 4, 4, 4, 4], updatedAtClient: '2034-01-01T10:09:59Z' });
ok(r.data.saved && r.data.score.c[0] === 4, 'and a normal save after that goes through');

// mixed formats: a row in the mock sheet's "yyyy-mm-dd hh:mm:ss" local time is read as local time and reported as ISO UTC
const two = juries[1], mockLocal = new Date(2026, 9, 30, 18, 50, 0);
const sc = sheets.Scores.rows;
sc.splice(sc.findIndex(x => x[0] === 'J02|A-020'), 1);      // replace the seeded row with a mock-format one
sc.push(['J02|A-020', 'J02', 'A-020', 'A', 5, 5, 5, 5, 5, 50, '', '2026-10-30 18:50:00', '2026-10-30 18:50:02']);
const seen = get({ action: 'juryScores', t: two.token }).data.find(x => x.key === 'J02|A-020');
eq(seen.updatedAtClient, mockLocal.toISOString(), 'mock-format time is parsed as local time and returned as ISO UTC');
r = post({ action: 'saveScore', t: two.token, pid: 'A-020', c: [6, 6, 6, 6, 6], updatedAtClient: new Date(mockLocal - 60000).toISOString() });
ok(r.data.stale, 'a save one minute older than the mock row is ignored');
r = post({ action: 'saveScore', t: two.token, pid: 'A-020', c: [6, 6, 6, 6, 6], updatedAtClient: new Date(+mockLocal + 60000).toISOString() });
ok(r.data.saved, 'a save one minute newer than the mock row is accepted');
eq(sc.find(x => x[0] === 'J02|A-020')[11], new Date(+mockLocal + 60000).toISOString(), 'it is stored as ISO UTC');
// overview lists are ordered by category, then number, however the artworks were scored
sheets.Scores.rows.splice(1);                                  // no scores: every artwork is below the minimum
post({ action: 'saveScore', t: one.token, pid: 'B-001', c: [5, 5, 5, 5, 5], updatedAtClient: '2034-02-01T00:00:00Z' });
post({ action: 'saveScore', t: one.token, pid: 'A-015', c: [5, 5, 5, 5, 5], updatedAtClient: '2034-02-01T00:00:00Z' });
const bm = get({ action: 'adminOverview', ...A }).data.coverage.belowMin.map(b => b.pid);
eq(bm, [...bm].sort(), 'belowMin pills are in order: A-001.. then B-001..');
ok(bm.indexOf('A-015') < bm.indexOf('B-001'), 'A-015 comes before the B artworks');
summary();
