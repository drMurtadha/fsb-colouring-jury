// Local test server: serves the static site and runs the real Apps Script code (apps-script/*.gs) in the
// in-memory emulator behind /api, seeded with the mock form data. For development only; nothing persists.
//   node tools/dev-server.js [port] [--demo]   then open the jury link it prints
//   --demo  adds a third jury, random scores for every artwork (with ties) and computed results, for /stage/ and /results/
//   GET /__offline?on=1|0  makes /api fail like a dead network (to test the outbox)
//   GET /__lock?on=1|0     locks/unlocks scoring on the server
//   GET /__flaky?drop=0.3&lost=0.2   drop that share of /api requests before processing, and process-then-drop that share (lost reply)
const http = require('http'), fs = require('fs'), path = require('path');
const { Sheet, sheets, props, run, get, post, ctx } = require('./gas-emu');
const form = require('./fixtures/mock-form.json');

const root = path.join(__dirname, '..'), port = +process.argv.find(a => /^\d+$/.test(a)) || 8080, demo = process.argv.includes('--demo');
run('setup()');
const A = { k: props.ADMIN_KEY };
sheets['Form Responses 1'] = new Sheet('Form Responses 1');
sheets['Form Responses 1'].rows = form.map(r => r.slice());
post({ action: 'syncRegistrations', ...A });
post({ action: 'setConfig', ...A, key: 'baseUrl', value: `http://localhost:${port}` });
const juries = [['Ar. Juri Contoh Satu', '60110000901', 'A,B', true], ['Ar. Juri Contoh Dua', '60110000902', 'A', false]]
  .map(j => post({ action: 'juryUpsert', ...A, name: j[0], whatsapp: j[1], categories: j[2], isHead: j[3] }).data);

if (demo) {
  juries.push(post({ action: 'juryUpsert', ...A, name: 'Ar. Juri Contoh Tiga', whatsapp: '60110000903', categories: 'A,B', isHead: false }).data);
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ps = get({ action: 'adminOverview', ...A }).data.participants;
  for (const j of juries) for (const p of ps) {
    if (j.categories.indexOf(p.category) < 0) continue;
    const c = Array.from({ length: 5 }, () => 4 + Math.floor(rnd() * 7));
    post({ action: 'saveScore', t: j.token, pid: p.pid, c, updatedAtClient: new Date().toISOString() });
  }
  post({ action: 'computeResults', ...A });
}

let offline = false, flaky = { drop: 0, lost: 0 }, served = { api: 0, dropped: 0, lost: 0 };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__offline') { offline = u.searchParams.get('on') === '1'; return send(res, 200, 'text/plain', 'offline=' + offline); }
  if (u.pathname === '/__flaky') { flaky = { drop: +u.searchParams.get('drop') || 0, lost: +u.searchParams.get('lost') || 0 }; served = { api: 0, dropped: 0, lost: 0 }; return send(res, 200, 'text/plain', JSON.stringify(flaky)); }
  if (u.pathname === '/__stats') return send(res, 200, 'application/json', JSON.stringify(served));
  if (u.pathname === '/__lock') { post({ action: 'setConfig', ...A, key: 'scoringLocked', value: u.searchParams.get('on') === '1' ? 'TRUE' : 'FALSE' }); return send(res, 200, 'text/plain', 'ok'); }
  if (u.pathname === '/assets/config.js') {
    return send(res, 200, 'text/javascript', "export const CONFIG = { API_URL: '/api', BASE_URL: '', DEFAULT_LANG: 'bm' };");
  }
  if (u.pathname === '/api') {
    if (offline) { req.destroy(); return; }
    served.api++;
    if (Math.random() < flaky.drop) { served.dropped++; req.destroy(); return; }
    if (req.method === 'POST') {
      let b = ''; req.on('data', d => (b += d));
      req.on('end', () => {
        const out = ctx.doPost({ postData: { contents: b } }).content;
        if (Math.random() < flaky.lost) { served.lost++; req.destroy(); return; }   // processed, but the phone never hears back
        send(res, 200, 'application/json', out);
      });
      return;
    }
    return send(res, 200, 'application/json', ctx.doGet({ parameter: Object.fromEntries(u.searchParams) }).content);
  }
  let p = path.normalize(path.join(root, decodeURIComponent(u.pathname)));
  if (!p.startsWith(root)) return send(res, 403, 'text/plain', 'no');
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) return send(res, 404, 'text/plain', 'not found');
  send(res, 200, types[path.extname(p)] || 'application/octet-stream', fs.readFileSync(p));
}).listen(port, () => {
  console.log(`Dev server: http://localhost:${port}/`);
  juries.forEach(j => console.log(`${j.name} (${j.categories}): http://localhost:${port}/j/?t=${j.token}`));
  console.log(`Admin key: ${props.ADMIN_KEY}`);
});
