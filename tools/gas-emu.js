// In-memory emulation of the Apps Script / Sheets globals, shared by the offline tests.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

const calls = { n: 0 };      // counts Spreadsheet service round trips (what costs time on Google)
class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.fmts = {}; }
  getLastRow() { calls.n++; let n = this.rows.length; while (n > 0 && this.rows[n - 1].every(v => v === '' || v === undefined)) n--; return n; }
  getLastColumn() { calls.n++; return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  getDataRange() { const lr = Math.max(this.getLastRow(), 1), lc = Math.max(this.getLastColumn(), 1); calls.n -= 2; return this.getRange(1, 1, lr, lc); }
  getRange(r, c, nr = 1, nc = 1) {
    const s = this;
    return {
      getValues: () => (calls.n++, 0) || Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (s.rows[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
      setValues: vals => (calls.n++, 0) || vals.forEach((row, i) => row.forEach((v, j) => {
        const R = r - 1 + i; while (s.rows.length <= R) s.rows.push([]);
        while (s.rows[R].length < c - 1 + j) s.rows[R].push('');
        s.rows[R][c - 1 + j] = v;
      })),
      setNumberFormats: f => { calls.n++; f.forEach((row, i) => row.forEach((x, j) => { s.fmts[(r + i) + ',' + (c + j)] = x; })); }, setNumberFormat() {},
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (s.rows[r - 1 + i]) s.rows[r - 1 + i][c - 1 + j] = ''; }
    };
  }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
}
const sheets = {}, props = {};
const pad = n => String(n).padStart(2, '0');
const ctx = vm.createContext({
  console, Math, JSON, Date, Object, Array, String, Number, isFinite, isNaN, parseInt, Error, RegExp,
  Logger: { log() {} },
  Session: { getScriptTimeZone: () => 'Asia/Kuala_Lumpur' },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    formatDate: d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ss, openById: () => ss
  }
});
const ss = {
  getId: () => 'TEST',
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = new Sheet(n))
};
for (const f of ['Sheets.gs', 'Code.gs', '../tools/seed.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8'), ctx, { filename: f });
}

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('FAIL:', msg)); };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const run = s => vm.runInContext(s, ctx);
const get = q => JSON.parse(ctx.doGet({ parameter: q }).content);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).content);
const rows = tab => sheets[tab].rows.slice(1).filter(r => r.some(v => v !== ''));
const summary = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
module.exports = { calls, Sheet, sheets, props, ctx, run, get, post, rows, ok, eq, summary };
