// Programme (tab Aturcara): publicSchedule and juryMe.schedule against the emulator; client slot logic from assets/schedule.js.
// Usage: node tools/test-schedule.js
const path = require('path');
const { setClock, sheets, props, run, get, post, ok, eq, summary } = require('./gas-emu');

run('setup()');
const A = { k: props.ADMIN_KEY };
ok(sheets.Aturcara && sheets.Aturcara.rows[0].join() === 'order,start,end,activityBm,activityEn,audience,visible', 'setup creates the Aturcara tab with its headers');
eq(get({ action: 'publicSchedule' }).data, { status: 'tentatif', items: [] }, 'empty tab: status defaults to tentatif, no items, no auth needed');
ok(sheets.Config.rows.some(r => r[0] === 'scheduleStatus' && r[1] === 'tentatif'), 'setup adds Config.scheduleStatus');

// rows as the sheet returns them: numbers for order, text for times, booleans for the checkbox, blank rows with visible FALSE
const T = true, F = false;
sheets.Aturcara.rows.push(
  [3, '10:10', '11:20', 'Pertandingan mewarna', 'Colouring contest', 'umum', T],
  [1, '09:30', '10:00', 'Pendaftaran', 'Registration', 'umum', T],
  [2, '10:00', '10:10', 'Taklimat', 'Briefing', 'umum', T],
  [2.5, '10:05', '10:10', 'Taklimat juri', 'Jury briefing', 'juri', T],
  [4, '11:20', '11:45', 'Disembunyikan', 'Hidden', 'umum', F],
  [5, '11:45', '12:00', '', 'No Malay name', 'umum', T],
  ['', '', '', '', '', '', F],
  ['', '', '', '', '', '', F],
  [6, '12:00', '12:30', 'Majlis penutup', 'Closing', ' UMUM ', 'TRUE'],
  [7, '1899-12-30 13:00:00', '13:30', 'Makan tengah hari', '', 'umum', T],
  [8, '14:00', '14:30', 'Audiens tidak dikenali', 'Unknown audience', 'vip', T],
  [9, '14:30', '15:00', 'Tiada audiens', 'No audience', '', T],
  ['', '15:00', '15:30', 'Tanpa nombor', 'No order', 'umum', T]
);

let r = get({ action: 'publicSchedule' });
ok(r.ok, 'publicSchedule works without a token or key');
eq(r.data.items.map(i => i.bm), ['Pendaftaran', 'Taklimat', 'Pertandingan mewarna', 'Majlis penutup', 'Makan tengah hari', 'Tanpa nombor'],
  'public: umum only, hidden / blank-name / blank rows / other audiences skipped, sorted by order, unnumbered row last');
eq(r.data.items[0], { start: '09:30', end: '10:00', bm: 'Pendaftaran', en: 'Registration' }, 'item shape is {start, end, bm, en}');
eq(r.data.items[3].bm, 'Majlis penutup', 'audience is trimmed and case-insensitive, visible accepts the text TRUE');
eq(r.data.items[4], { start: '13:00', end: '13:30', bm: 'Makan tengah hari', en: '' }, 'a time that came back as a date-time becomes HH:MM; missing English stays empty');
ok(!JSON.stringify(r.data).includes('Taklimat juri'), 'juri rows never appear in the public response');
ok(r.data.items.every(i => !('audience' in i) && !('order' in i)), 'no audience or order leaked');

// status
eq(post({ action: 'setConfig', ...A, key: 'scheduleStatus', value: ' Muktamad ' }).ok, true, 'setConfig accepts muktamad (any case)');
eq(get({ action: 'publicSchedule' }).data.status, 'muktamad', 'status follows Config.scheduleStatus');
eq(post({ action: 'setConfig', ...A, key: 'scheduleStatus', value: 'maybe' }).error, 'BAD_INPUT', 'setConfig rejects other values');
sheets.Config.rows.find(x => x[0] === 'scheduleStatus')[1] = 'rubbish';
eq(get({ action: 'publicSchedule' }).data.status, 'tentatif', 'an unknown value in the sheet reads as tentatif');

// juryMe returns umum + juri
run('seed()');
const token = sheets.Jury.rows[1][5];
const me = get({ action: 'juryMe', t: token });
ok(me.ok && me.data.schedule && me.data.schedule.status === 'tentatif', 'juryMe carries schedule.status');
eq(me.data.schedule.items.map(i => i.bm), ['Pendaftaran', 'Taklimat', 'Taklimat juri', 'Pertandingan mewarna', 'Majlis penutup', 'Makan tengah hari', 'Tanpa nombor'],
  'juryMe schedule: umum and juri together, sorted (2.5 sits between 2 and 3)');
eq(me.data.schedule.items[2], { start: '10:05', end: '10:10', bm: 'Taklimat juri', en: 'Jury briefing', audience: 'juri' }, 'jury items carry their audience');
eq(get({ action: 'juryMe', t: 'nope' }).error, 'UNAUTHORIZED', 'juryMe still needs a valid token');

// ---- client logic (assets/schedule.js is plain ES module code with no DOM at import) ----
(async () => {
  const { currentSlot, klNow, EVENT_DATE } = await import(path.join(__dirname, '..', 'assets', 'schedule.js'));
  const items = [
    { start: '09:30', end: '10:00' }, { start: '10:00', end: '10:10' }, { start: '10:10', end: '11:20' }, { start: '11:45', end: '12:00' }, { start: '', end: '' }
  ];
  eq(EVENT_DATE, '2026-11-15', 'event date constant');
  const at = iso => currentSlot(items, klNow(new Date(iso)));
  eq(at('2026-11-15T01:45:00Z'), 0, '09:45 KL (01:45 UTC) is the first slot');
  eq(at('2026-11-15T02:00:00Z'), 1, 'a slot starts at its start time (10:00 belongs to slot 2, not slot 1)');
  eq(at('2026-11-15T02:10:00Z'), 2, 'slot 2 ends exclusive at 10:10');
  eq(at('2026-11-15T03:30:00Z'), -1, '11:30 falls in a gap: no current slot');
  eq(at('2026-11-15T03:59:59Z'), 3, '11:59:59 is the last slot');
  eq(at('2026-11-15T04:00:00Z'), -1, '12:00 is past the last slot');
  eq(at('2026-11-14T02:15:00Z'), -1, 'the day before: nothing highlighted');
  eq(at('2026-11-16T02:15:00Z'), -1, 'the day after: nothing highlighted');
  eq(at('2026-11-14T17:30:00Z'), -1, '01:30 on 15 Nov KL is still before the first slot');
  eq(at('2026-11-15T16:30:00Z'), -1, '00:30 on 16 Nov KL is a different day');
  eq(currentSlot([{ start: '10:00', end: '' }], klNow(new Date('2026-11-15T02:30:00Z'))), -1, 'an item without an end time is never current');
  summary();
})();
