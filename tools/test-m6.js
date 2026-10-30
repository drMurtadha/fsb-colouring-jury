// M6 check: computeResults against an independent re-implementation of the ranking rules (spec section 8),
// on seeded data (seed.gs: 60 + 60 artworks) with engineered ties, plus one small worked example.
// Usage: node tools/test-m6.js
const { setClock, sheets, props, run, get, post, rows, ok, eq, summary } = require('./gas-emu');
setClock('2033-01-01T00:00:00Z');                          // fixed client times in this file are in the past for the server

run('setup()');
const A = { k: props.ADMIN_KEY };
run('seed()');                                              // 60 A + 60 B participants, J01..J03 (all A,B)
const juries = rows('Jury').map(r => ({ jid: r[0], token: r[5] }));
const W = { A: [25, 20, 25, 15, 15], B: [25, 15, 30, 10, 20] };

// deterministic pseudo-random scores 1..10
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const scores = {};                                          // jid|pid -> c
const put = (j, pid, c) => { scores[j.jid + '|' + pid] = c; };
const pids = cat => Array.from({ length: 60 }, (_, i) => `${cat}-${String(i + 1).padStart(3, '0')}`);
for (const cat of ['A', 'B']) for (const pid of pids(cat)) for (const j of juries) put(j, pid, Array.from({ length: 5 }, () => 1 + Math.floor(rnd() * 10)));

// engineered ties in A: A-001 and A-002 identical means and identical c3 and c1 (only an override can separate them);
// A-003 vs A-004: equal mean, A-004 has higher c3 mean so it must win; A-005 vs A-006: equal mean and c3, A-006 higher c1.
const same = c => juries.forEach(j => ['A-001', 'A-002'].forEach(p => put(j, p, c)));
same([10, 10, 10, 10, 10]);                                  // 100 each: the top two
juries.forEach(j => { put(j, 'A-003', [10, 10, 4, 10, 10]); put(j, 'A-004', [4, 10, 10, 10, 10]); });   // 17.5? computed below; equal totals by construction
// A-003: 25 + 20 + 10 + 15 + 15 = 85 ; A-004: 10 + 20 + 25 + 15 + 15 = 85  (c3 means 4 vs 10, c1 means 10 vs 4)
juries.forEach(j => { put(j, 'A-005', [8, 8, 8, 8, 8]); put(j, 'A-006', [8, 8, 8, 8, 8]); });
// give A-001/A-002 a null-effect so they stay top; put 3 artworks below the minimum jury count for the unranked list
const skip = new Set(['A-060|J02', 'A-060|J03', 'A-059|J03']);

let t = 0;
for (const key of Object.keys(scores)) {
  if (skip.has(key.split('|')[1] + '|' + key.split('|')[0])) continue;
  const [jid, pid] = key.split('|'); const j = juries.find(x => x.jid === jid);
  const r = post({ action: 'saveScore', t: j.token, pid, c: scores[key], updatedAtClient: new Date(Date.UTC(2026, 10, 15, 12, 0, t++ % 3600)).toISOString() });
  if (!r.ok) { console.log('save failed', key, r.error); process.exit(1); }
}
// remove those score rows: A-060 ends with one score, A-059 keeps two
for (const s of skip) { const [pid, jid] = s.split('|'); post({ action: 'scoreDelete', ...A, key: jid + '|' + pid }); }

// ---- independent expectation, computed straight from the Scores tab ----
const readTab = () => rows('Scores');
function expected(cat, overrides) {
  const by = {};
  readTab().map(r => ({ jid: r[1], pid: r[2], c: [4, 5, 6, 7, 8].map(i => Number(r[i])) })).filter(s => s.pid[0] === cat).forEach(s => {
    const total = Math.round(s.c.reduce((a, v, i) => a + v / 10 * W[cat][i], 0) * 10) / 10;
    (by[s.pid] = by[s.pid] || []).push({ total, c1: s.c[0], c3: s.c[2] });
  });
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const list = Object.keys(by).filter(p => by[p].length >= 2).map(p => ({ pid: p, m: mean(by[p].map(x => x.total)), c3: mean(by[p].map(x => x.c3)), c1: mean(by[p].map(x => x.c1)) }));
  list.sort((a, b) => (Math.abs(b.m - a.m) > 1e-9 ? b.m - a.m : Math.abs(b.c3 - a.c3) > 1e-9 ? b.c3 - a.c3 : Math.abs(b.c1 - a.c1) > 1e-9 ? b.c1 - a.c1 : ((overrides[a.pid] || 1e9) - (overrides[b.pid] || 1e9)) || (a.pid < b.pid ? -1 : 1)));
  return list;
}

let r = post({ action: 'computeResults', ...A }).data;
for (const cat of ['A', 'B']) {
  const exp = expected(cat, {});
  eq(r[cat].map(x => x.pid), exp.map(x => x.pid), `${cat}: full ranking order equals the independent calculation`);
  eq(r[cat].map(x => x.mean), exp.map(x => Math.round(x.m * 100) / 100), `${cat}: means`);
  eq(r[cat].length, cat === 'A' ? 59 : 60, `${cat}: ranked count (artworks under the minimum are excluded)`);
}
eq(r.unranked.map(x => [x.pid, x.nScores]), [['A-060', 1]], 'an artwork with fewer than 2 scores is unranked (A-059 keeps two)');
// hand-worked: both top artworks score 10s: 25+20+25+15+15 = 100.0 each
eq(r.A.slice(0, 2).map(x => [x.pid, x.mean, x.flag]), [['A-001', 100, 'TIE-UNRESOLVED'], ['A-002', 100, 'TIE-UNRESOLVED']], 'identical top two flagged unresolved');
// hand-worked c3 tie-break: both 85.0, A-004 has c3 mean 10 vs 4
const rank = pid => r.A.find(x => x.pid === pid).rank;
ok(rank('A-004') < rank('A-003'), 'equal mean: higher creativity (c3) wins');
eq([r.A.find(x => x.pid === 'A-003').mean, r.A.find(x => x.pid === 'A-004').mean], [85, 85], 'A-003 and A-004 are tied on mean 85.0');
// c1 tie-break: A-007 and A-008 have equal mean and equal c3 mean (8); A-008 has the higher c1 (8 vs 6) and must rank above A-007.
// A-008 = [8,7,8,6,8]: 20 + 14 + 20 + 9 + 12 = 75 ; A-007 = [6,8,8,8,8]: 15 + 16 + 20 + 12 + 12 = 75
juries.forEach(j => { put(j, 'A-007', [6, 8, 8, 8, 8]); put(j, 'A-008', [8, 7, 8, 6, 8]); });
let tt = 100;
for (const j of juries) for (const pid of ['A-007', 'A-008']) post({ action: 'saveScore', t: j.token, pid, c: scores[j.jid + '|' + pid], updatedAtClient: new Date(Date.UTC(2026, 10, 15, 14, 0, tt++)).toISOString() });
r = post({ action: 'computeResults', ...A }).data;
const m7 = r.A.find(x => x.pid === 'A-007'), m8 = r.A.find(x => x.pid === 'A-008');
eq([m7.mean, m8.mean], [75, 75], 'A-007 and A-008 tied on mean 75.0');
ok(m8.rank < m7.rank, 'equal mean and c3: higher colour (c1) wins');

// override resolves the unresolved tie in both directions
post({ action: 'setConfig', ...A, key: 'rankOverrides', value: JSON.stringify({ 'A-002': 1, 'A-001': 2 }) });
r = post({ action: 'computeResults', ...A }).data;
eq(r.A.slice(0, 2).map(x => [x.pid, x.flag]), [['A-002', 'TIE'], ['A-001', 'TIE']], 'override puts A-002 first and flags the tie as resolved');
eq(r.A.map(x => x.pid), expected('A', { 'A-002': 1, 'A-001': 2 }).map(x => x.pid), 'ranking with override equals the independent calculation');

// ---- results tab, publish and public view ----
eq(rows('Results').length, 119, 'Results tab holds every ranked row (59 + 60) after the last compute');
ok(get({ action: 'publicResults' }).error === 'NOT_PUBLISHED', 'public results hidden before publish');
post({ action: 'setConfig', ...A, key: 'resultsPublished', value: 'TRUE' });
const pub = get({ action: 'publicResults' }).data;
eq(pub.A.map(x => x.rank), [1, 2, 3, 4, 5, 6, 7, 8], 'public A: 3 winners + 5 consolation');
eq(pub.A.map(x => x.tier).join(), 'winner,winner,winner,consolation,consolation,consolation,consolation,consolation', 'tiers');
ok(!JSON.stringify(pub).match(/Peserta [AB]\d|mean|601100/), 'public view has no full names, scores or phones');
eq(pub.A[0].firstName, 'Peserta', 'first name only');
post({ action: 'setConfig', ...A, key: 'resultsPublished', value: 'FALSE' });
ok(get({ action: 'publicResults' }).error === 'NOT_PUBLISHED', 'unpublish hides it again');
// ranking is stable when recomputed
const a1 = JSON.stringify(post({ action: 'computeResults', ...A }).data.A), a2 = JSON.stringify(post({ action: 'computeResults', ...A }).data.A);
ok(a1 === a2, 'recompute is deterministic');
summary();
