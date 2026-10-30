/**
 * Test data: 60 fake participants per category and 3 fake juries (spec section 16.1).
 * Paste into the Apps Script project next to Code.gs / Sheets.gs and run seed().
 * WARNING: clears Participants, Jury, Scores, Audit and Results. Refuses when Config.dataStatus is LIVE.
 * The mock sheet's hand-built 25 participants are replaced; to keep them, do not run this.
 */
function seed() {
  if (String(config_().dataStatus || '').toUpperCase() === 'LIVE') throw new Error('dataStatus is LIVE, refusing to seed');
  ['Participants', 'Jury', 'Scores', 'Audit', 'Results'].forEach(clearData_);

  var parts = [], t = now_();
  var schools = ['SK Contoh 1', 'SK Contoh 2', 'Tadika Contoh', ''];
  for (var i = 1; i <= 60; i++) {
    parts.push({ pid: 'A-' + pad3_(i), category: 'A', childName: 'Peserta A' + i, age: 7 + (i % 6), dob: '', guardianName: 'Penjaga A' + i,
      guardianPhone: '6011000' + pad3_(i) + '1', school: schools[i % 4], source: 'form', formRowKey: 'seed#A' + i, checkedIn: true, status: 'active', createdAt: t });
    parts.push({ pid: 'B-' + pad3_(i), category: 'B', childName: 'Peserta B' + i, age: 3 + (i % 4), dob: '', guardianName: 'Penjaga B' + i,
      guardianPhone: '6011000' + pad3_(i) + '2', school: schools[i % 4], source: 'form', formRowKey: 'seed#B' + i, checkedIn: true, status: 'active', createdAt: t });
  }
  appendRows_('Participants', parts);

  var tokens = [];
  var juries = [['J01', 'Ar. Juri Contoh Satu', '60110000901', 'A,B', true], ['J02', 'Ar. Juri Contoh Dua', '60110000902', 'A,B', false], ['J03', 'Ar. Juri Contoh Tiga', '60110000903', 'A,B', false]]
    .map(function (j) {
      var tok = newToken_(tokens); tokens.push(tok);
      return { jid: j[0], name: j[1], whatsapp: j[2], categories: j[3], isHead: j[4], token: tok, active: true, lastSeen: '', createdAt: t };
    });
  appendRows_('Jury', juries);
  Logger.log('Seeded ' + parts.length + ' participants and ' + juries.length + ' juries.');
}
