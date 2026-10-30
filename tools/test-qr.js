// Label QR check: builds the QR with print/app.js's own qrSvg(), rasterises the SVG, decodes it with jsQR (a different decoder
// from the phone's) and feeds the text to j/app.js's own parsePid(). Needs: npm install (jsqr, dev only).
// Usage: node tools/test-qr.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const jsQR = require('jsqr');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL: ' + m)); };

// pull the real functions out of the browser modules (they import DOM-bound code, so they are not require()-able)
const fn = (file, name) => {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const m = new RegExp('\\nfunction ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n').exec(src);
  if (!m) throw new Error(name + ' not found in ' + file);
  return m[0];
};
const BASE = 'https://drmurtadha.github.io/fsb-colouring-jury';          // the real baseUrl, about 58 characters in the QR

(async () => {
  const { default: qrcode } = await import(path.join(root, 'assets/vendor/qrcode-generator.js'));
  const data = { config: { baseUrl: BASE } };
  const qrSvg = new Function('qrcode', 'data', fn('print/app.js', 'qrSvg') + '; return qrSvg;')(qrcode, data);
  const parsePid = new Function(fn('j/app.js', 'parsePid') + '; return parsePid;')();

  // the SVG is a path of unit squares in a viewBox that already includes the quiet zone
  const raster = (svg, px) => {
    const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg), n = +vb[1], w = n * px, img = new Uint8ClampedArray(w * w * 4).fill(255);
    const re = /M(\d+),(\d+)l/g; let m, dark = 0;
    while ((m = re.exec(svg))) {
      dark++;
      for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { const i = (((+m[2]) * px + y) * w + (+m[1]) * px + x) * 4; img[i] = img[i + 1] = img[i + 2] = 0; }
    }
    return { img, w, n, dark };
  };

  const svg = qrSvg('A-014');
  const r = raster(svg, 8), modules = r.n - 8;
  ok(modules === 33, `ECC M gives a 33 x 33 code for this URL (got ${modules}; Q gave 37)`);
  ok(/preserveAspectRatio/.test(svg) && !/width="\d/.test(svg.split('>')[0]), 'svg is scalable (no fixed size)');
  // quiet zone: the first and last 4 rows and columns contain no dark module
  const dark = [...svg.matchAll(/M(\d+),(\d+)l/g)].map(m => [+m[1], +m[2]]);
  ok(dark.every(([x, y]) => x >= 4 && y >= 4 && x < r.n - 4 && y < r.n - 4), 'a 4-module quiet zone surrounds the code');
  const hit = jsQR(r.img, r.w, r.w);
  ok(hit && hit.data === BASE + '/a/?p=A-014', 'jsQR decodes the label QR to the full URL');
  ok(parsePid(hit && hit.data) === 'A-014', 'parsePid gives A-014');

  // every ID in both categories decodes to itself, including at a small print scale (3 px per module, about a phone at distance)
  let bad = 0;
  for (const c of 'AB') for (const n of [1, 9, 10, 99, 100, 999]) {
    const pid = c + '-' + String(n).padStart(3, '0');
    for (const px of [8, 4]) { const q = raster(qrSvg(pid), px), d = jsQR(q.img, q.w, q.w); if (!d || parsePid(d.data) !== pid) bad++; }
  }
  ok(bad === 0, `all 12 IDs decode and map back to themselves at two raster scales (${bad} failed)`);

  // size: default label (63.5 x 33.9 mm) gives a symbol of at least 24 mm and at least 3 mm of gap before the text
  const css = fs.readFileSync(path.join(root, 'print/print.css'), 'utf8');
  const box = Math.min(30, 33.9 - 4, 63.5 * 0.5), sym = box * modules / (modules + 8);
  ok(sym >= 24, `default label: code ${sym.toFixed(1)} mm (>= 24), box ${box.toFixed(1)} mm`);
  ok(/\.lab \{[^}]*gap: 3mm/.test(css) || /\.lab \{[^}]*gap: ([3-9])mm/.test(css), 'css: 3 mm gap between the QR box and the ID text');

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
