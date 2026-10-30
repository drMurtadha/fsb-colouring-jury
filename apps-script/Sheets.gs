/**
 * Sheet access helpers. Tab layout follows JURY_APP_SPEC.md section 5.
 * Every tab is read whole (hundreds of rows at most); writes go through
 * writeRow_ / appendRows_ so text columns (phones, tokens, IDs) stay text.
 */

var TABS = {
  Participants: ['pid', 'category', 'childName', 'age', 'dob', 'guardianName', 'guardianPhone', 'school', 'source', 'formRowKey', 'checkedIn', 'status', 'createdAt'],
  Jury: ['jid', 'name', 'whatsapp', 'categories', 'isHead', 'token', 'active', 'lastSeen', 'createdAt'],
  Scores: ['key', 'jid', 'pid', 'category', 'c1', 'c2', 'c3', 'c4', 'c5', 'total', 'note', 'updatedAtClient', 'updatedAtServer'],
  Config: ['key', 'value'],
  Audit: ['time', 'actor', 'action', 'target', 'before', 'after'],
  Results: ['category', 'rank', 'pid', 'nScores', 'mean', 'sd', 'c3Mean', 'c1Mean', 'flag'],
  Aturcara: ['order', 'start', 'end', 'activityBm', 'activityEn', 'audience', 'visible']
};

// Every column that holds text is written with the plain-text format, so a name or note that starts with
// "=" (from the public form, or typed by a jury) is stored as text and never evaluated as a formula.
var TEXT_COLS = {
  Participants: ['pid', 'category', 'childName', 'dob', 'guardianName', 'guardianPhone', 'school', 'source', 'formRowKey', 'status', 'createdAt'],
  Jury: ['jid', 'name', 'whatsapp', 'categories', 'token', 'lastSeen', 'createdAt'],
  Scores: ['key', 'jid', 'pid', 'category', 'note', 'updatedAtClient', 'updatedAtServer'],
  Config: ['value'],
  Audit: ['time', 'actor', 'action', 'target', 'before', 'after'],
  Results: ['category', 'pid', 'flag'],
  Aturcara: ['start', 'end', 'activityBm', 'activityEn', 'audience']
};

var FORM_TAB = 'Form Responses 1';

var DEFAULT_CONFIG = {
  eventName: 'FSB Johor 2026 Colouring Contest',
  eventDate: '2026-11-15',
  baseUrl: 'https://<github-user>.github.io/fsb-colouring-jury',
  criteria: JSON.stringify([
    { id: 'c1', bm: 'Warna & Harmoni', en: 'Colour choice and harmony' },
    { id: 'c2', bm: 'Kekemasan', en: 'Neatness and control' },
    { id: 'c3', bm: 'Kreativiti', en: 'Creativity and originality' },
    { id: 'c4', bm: 'Teknik', en: 'Technique' },
    { id: 'c5', bm: 'Kesempurnaan & Impak', en: 'Completeness and overall impact' }
  ]),
  weightsA: '25,20,25,15,15',
  weightsB: '25,15,30,10,20',
  minJuryPerArtwork: '2',
  winnersPerCategory: '3',
  consolationPerCategory: '5',
  scoringLocked: 'FALSE',
  resultsPublished: 'FALSE',
  showNamesOnStage: 'TRUE',
  scheduleStatus: 'tentatif',
  aggregation: 'mean',
  formColumnMap: JSON.stringify({
    timestamp: 'Timestamp',
    childName: "Nama Penuh Peserta / Child's Full Name",
    dob: 'Tarikh Lahir / Date of Birth',
    age: 'Umur pada 15 Nov 2026 / Age on 15 Nov 2026',
    guardianName: "Nama Penjaga / Guardian's Name",
    guardianPhone: "No. WhatsApp Penjaga / Guardian's WhatsApp",
    school: 'Sekolah atau Tadika / School or Kindergarten',
    consent: 'Persetujuan PDPA / PDPA Consent'
  })
};

var cfg_ = null, hdr_ = {};

function resetRequest_() { cfg_ = null; hdr_ = {}; }

function spreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return typeof v === 'string' ? v.trim() : v;
}

function isTrue_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }

function sheet_(name) {
  var sh = spreadsheet_().getSheetByName(name);
  if (!sh) {
    if (!TABS[name]) throw apiErr_('NOT_FOUND', 'Tab not found: ' + name);
    sh = spreadsheet_().insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]);
  }
  return sh;
}

/** Returns {sheet, headers, rows}; each row is an object plus _row (1-based sheet row). */
function readTab_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();      // one service call per tab
  if (!values.length || !String(values[0][0]).trim()) return { sheet: sh, headers: TABS[name] || [], rows: [] };
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var empty = true, o = { _row: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      var v = cell_(values[i][j]);
      if (v !== '' && v !== null) empty = false;
      if (headers[j]) o[headers[j]] = v;
    }
    if (!empty) rows.push(o);
  }
  return { sheet: sh, headers: headers, rows: rows };
}

function rowValues_(name, headers, obj, existing) {
  return headers.map(function (h, i) {
    if (Object.prototype.hasOwnProperty.call(obj, h)) return obj[h];
    return existing && existing[i] !== undefined ? existing[i] : '';
  });
}

function formats_(name, headers) {
  var text = TEXT_COLS[name] || [];
  return headers.map(function (h) { return text.indexOf(h) >= 0 ? '@' : 'General'; });
}

function sheetHeaders_(sh, name) {
  if (hdr_[name]) return hdr_[name];       // header row read once per request
  var n = Math.max(sh.getLastColumn(), TABS[name].length);
  hdr_[name] = sh.getRange(1, 1, 1, n).getValues()[0].map(function (h) { return String(h).trim(); });
  return hdr_[name];
}

/** Insert (rowNum null) or update one row; fields absent from obj keep their current value. */
function writeRow_(name, rowNum, obj) {
  var sh = sheet_(name), headers = sheetHeaders_(sh, name);
  var row = rowNum || Math.max(sh.getLastRow(), 1) + 1;
  var rg = sh.getRange(row, 1, 1, headers.length);
  var existing = rowNum ? rg.getValues()[0] : null;
  rg.setNumberFormats([formats_(name, headers)]);
  rg.setValues([rowValues_(name, headers, obj, existing)]);
  return row;
}

/** Append many rows with a single write. */
function appendRows_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name), headers = sheetHeaders_(sh, name);
  var start = Math.max(sh.getLastRow(), 1) + 1;
  var rg = sh.getRange(start, 1, objs.length, headers.length);
  var fmt = formats_(name, headers);
  rg.setNumberFormats(objs.map(function () { return fmt; }));
  rg.setValues(objs.map(function (o) { return rowValues_(name, headers, o, null); }));
}

function deleteRow_(name, rowNum) { sheet_(name).deleteRow(rowNum); }

function clearData_(name) {
  var sh = sheet_(name);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
}

// ---- Config -------------------------------------------------------------

function config_() {
  if (cfg_) return cfg_;
  cfg_ = {};
  readTab_('Config').rows.forEach(function (r) { if (r.key) cfg_[r.key] = r.value; });
  return cfg_;
}

function cfgStr_(k) {
  var v = config_()[k];
  return v === undefined || v === '' ? String(DEFAULT_CONFIG[k] === undefined ? '' : DEFAULT_CONFIG[k]) : String(v);
}

function cfgBool_(k) { return isTrue_(cfgStr_(k)); }

function cfgInt_(k) {
  var n = parseInt(cfgStr_(k), 10);
  return isNaN(n) ? parseInt(DEFAULT_CONFIG[k], 10) : n;
}

function cfgJson_(k) {
  try { return JSON.parse(cfgStr_(k)); } catch (e) { return JSON.parse(DEFAULT_CONFIG[k] || 'null'); }
}

/** Weights accept "25,20,25,15,15" (as in the sheet) or a JSON array. */
function weights_(cat) {
  var k = 'weights' + cat, raw = cfgStr_(k), w;
  try { w = raw.charAt(0) === '[' ? JSON.parse(raw) : raw.split(',').map(Number); } catch (e) { w = null; }
  if (!w || w.length !== 5 || w.some(function (x) { return !isFinite(x); })) w = DEFAULT_CONFIG[k].split(',').map(Number);
  return w;
}

// ---- Audit --------------------------------------------------------------

function audit_(actor, action, target, before, after) {
  var s = function (v) {
    if (v === undefined || v === null) return '';
    var t = typeof v === 'string' ? v : JSON.stringify(v);
    return t.length > 500 ? t.slice(0, 497) + '...' : t;
  };
  writeRow_('Audit', null, { time: now_(), actor: actor, action: action, target: target || '', before: s(before), after: s(after) });
}

// ---- One-time setup (run from the Apps Script editor) ---------------------

/** Creates missing tabs/config keys, binds SHEET_ID, creates ADMIN_KEY if absent. Safe to re-run. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID')) {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) props.setProperty('SHEET_ID', active.getId());
  }
  Object.keys(TABS).forEach(function (n) { sheet_(n); });
  var have = config_();
  var add = Object.keys(DEFAULT_CONFIG).filter(function (k) { return have[k] === undefined; })
    .map(function (k) { return { key: k, value: DEFAULT_CONFIG[k] }; });
  appendRows_('Config', add);
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', randomChars_(16));
  Logger.log('SHEET_ID=' + props.getProperty('SHEET_ID') + '; config keys added: ' + add.length + '; ADMIN_KEY is in Script Properties.');
}
