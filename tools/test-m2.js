// M2 check: registration sync against a copy of the mock sheet's "Form Responses 1" (spec section 19).
// Expected pids are the ones in the mock sheet's own Participants tab. Usage: node tools/test-m2.js
const { Sheet, sheets, props, run, get, post, rows, ok, eq, summary } = require('./gas-emu');
const form = require('./fixtures/mock-form.json');

// sheet row (1-based) -> pid in the mock Participants tab; row 27 is the duplicate submission
const EXPECT = {};
form.slice(1, 26).forEach((_, i) => {
  const row = i + 2;
  EXPECT[row] = row <= 15 ? 'A-' + String(row - 1).padStart(3, '0') : row <= 25 ? 'B-' + String(row - 15).padStart(3, '0') : 'A-015';
});

run('setup()');
const A = { k: props.ADMIN_KEY };
sheets['Form Responses 1'] = new Sheet('Form Responses 1');
sheets['Form Responses 1'].rows = form.map(r => r.slice());

let r = post({ action: 'syncRegistrations', ...A });
ok(r.ok, 'sync ok');
eq([r.data.added, r.data.skipped], [25, 1], 'adds 25, skips the duplicate');
ok(r.data.warnings.some(w => /Row 27: duplicate of A-002/.test(w)), 'duplicate named');
const P = get({ action: 'adminOverview', ...A }).data.participants;
for (const [row, pid] of Object.entries(EXPECT)) {
  const p = P.find(x => x.pid === pid);
  ok(p && p.formRowKey === `${form[row - 1][0]}#${row}`, `${pid} comes from form row ${row}`);
  if (!p) continue;
  const f = form[row - 1];
  eq([p.childName, p.guardianName, p.school, String(p.age), p.dob], [f[1], f[4], f[6], f[3], f[2]], `${pid} fields`);
  eq(p.guardianPhone, '601100000' + String(row - 1).padStart(3, '0'), `${pid} phone normalised`);
  eq(p.category, pid[0], `${pid} category`);
}
eq(P.length, 25, '25 participants');
eq(P.find(x => x.pid === 'A-015').age, 7, 'turns 7 on 10 Nov: age 7 on 15 Nov, Category A');
eq(P.find(x => x.pid === 'B-007').school, '', 'blank school stays blank');
eq(P.filter(x => x.category === 'A').length + '/' + P.filter(x => x.category === 'B').length, '15/10', 'A/B split 15/10');

r = post({ action: 'syncRegistrations', ...A });
eq([r.data.added, r.data.skipped], [0, 26], 're-run adds 0 duplicates');
eq(get({ action: 'adminOverview', ...A }).data.participants.length, 25, 'still 25 after re-run');

// new submission after the first sync gets the next number in its category
sheets['Form Responses 1'].rows.push(['2026-10-25 08:00:00', 'Late Entry', '2020-01-01', '6', 'Ibu', '0123456789', 'Tadika', 'Setuju']);
r = post({ action: 'syncRegistrations', ...A });
eq([r.data.added, r.data.skipped], [1, 26], 'late submission added once');
ok(get({ action: 'adminOverview', ...A }).data.participants.some(p => p.pid === 'B-011' && p.formRowKey.endsWith('#28')), 'late entry is B-011');

// age fallback when DOB is blank, and Google's native Date timestamps
sheets['Form Responses 1'].rows.push([new Date(2026, 9, 26, 9, 5, 0), 'No Dob Kid', '', '8', 'Bapa', '60111112222', 'SK', 'Setuju']);
r = post({ action: 'syncRegistrations', ...A });
ok(r.data.added === 1, 'blank DOB uses the age column');
const nd = get({ action: 'adminOverview', ...A }).data.participants.find(p => p.childName === 'No Dob Kid');
ok(nd && nd.category === 'A' && nd.formRowKey === '2026-10-26 09:05:00#29', 'Date timestamp becomes a stable key');
post({ action: 'syncRegistrations', ...A });
eq(get({ action: 'adminOverview', ...A }).data.participants.length, 27, 'Date-stamped row not re-added');

// pre-populated Participants (as in the mock sheet) must not be re-added either
const keep = sheets.Participants.rows.slice();
sheets.Participants.rows = keep.slice(0, 26); // header + first 25 = state of the mock sheet
sheets['Form Responses 1'].rows = form.map(x => x.slice());
r = post({ action: 'syncRegistrations', ...A });
eq([r.data.added, r.data.skipped], [0, 26], 'mock Participants already synced: 0 added');

// mapping comes from Config: rename a form header and the map follows
sheets['Form Responses 1'].rows[0][1] = 'Child name (renamed)';
r = post({ action: 'syncRegistrations', ...A }); ok(r.error === 'BAD_CONFIG', 'renamed header without map update fails loudly');
const map = JSON.parse(run('DEFAULT_CONFIG.formColumnMap')); map.childName = 'Child name (renamed)';
post({ action: 'setConfig', ...A, key: 'formColumnMap', value: JSON.stringify(map) });
r = post({ action: 'syncRegistrations', ...A }); ok(r.ok && r.data.added === 0, 'updating Config.formColumnMap fixes it');

// bad rows are reported, not silently dropped
sheets['Form Responses 1'].rows.push(['2026-10-27 10:00:00', '', '', '', '', '', '', ''], ['2026-10-27 10:05:00', 'Odd Phone', '2019-01-01', '', 'X', '441234567890', '', '']);
r = post({ action: 'syncRegistrations', ...A });
ok(r.data.warnings.some(w => /no child name/.test(w)), 'blank name warned');
ok(r.data.warnings.some(w => /check number/.test(w)), 'foreign number warned');
summary();
