// BM / EN strings. t('key', {vars}) -> string in the current language. BM is the default.
import { CONFIG } from './config.js';

const S = {
  appTitle: ['Pertandingan Mewarna FSB Johor 2026', 'FSB Johor 2026 Colouring Contest'],
  welcome: ['Selamat datang', 'Welcome'],
  welcomeBody: [
    'Anda akan menilai karya secara buta: hanya ID karya yang dipaparkan. Imbas kod QR pada karya, beri markah 1 hingga 10 untuk setiap kriteria, kemudian simpan. Anda boleh ubah markah sehingga penganjur mengunci penilaian.',
    'You will judge blind: only the artwork ID is shown. Scan the QR on an artwork, give each criterion 1 to 10, then save. You can change a score until the organiser locks scoring.'
  ],
  start: ['Mula', 'Start'],
  scan: ['Imbas Karya', 'Scan Artwork'],
  enterId: ['Masukkan ID', 'Enter ID'],
  todo: ['Belum dinilai', 'Not scored yet'],
  done: ['Sudah dinilai', 'Scored'],
  progress: ['Dinilai {n} / {m}', 'Scored {n} / {m}'],
  synced: ['✓ Disegerak', '✓ Synced'],
  pending: ['{n} menunggu', '{n} pending'],
  offline: ['Luar talian', 'Offline'],
  save: ['Simpan & Imbas Seterusnya', 'Save & Scan Next'],
  update: ['Kemas kini & Imbas Seterusnya', 'Update & Scan Next'],
  total: ['JUMLAH', 'TOTAL'],
  avg: ['Purata anda setakat ini: {avg}', 'Your average so far: {avg}'],
  note: ['Nota', 'Note'],
  notePlaceholder: ['Nota (maks. 140 aksara)', 'Note (max 140 characters)'],
  back: ['Kembali', 'Back'],
  category: ['Kategori {c}', 'Category {c}'],
  age: ['{n} thn', '{n} yrs'],
  saved: ['{pid} disimpan ({total})', '{pid} saved ({total})'],
  notFound: ['Karya {pid} tidak ditemui dalam kategori anda.', 'Artwork {pid} was not found in your categories.'],
  absent: ['Karya {pid} ditandakan tidak hadir dan tidak boleh dinilai.', 'Artwork {pid} is marked absent and cannot be scored.'],
  dq: ['Karya {pid} telah dibatalkan kelayakan dan tidak boleh dinilai.', 'Artwork {pid} is disqualified and cannot be scored.'],
  locked: ['Penilaian telah ditutup. Skor tidak boleh diubah lagi.', 'Scoring is closed. Scores can no longer be changed.'],
  badLink: ['Pautan juri tidak sah atau telah dibatalkan. Minta pautan baharu daripada penganjur.', 'This jury link is invalid or has been revoked. Ask the organiser for a new link.'],
  noToken: ['Sila buka pautan WhatsApp juri anda dahulu.', 'Please open your WhatsApp jury link first.'],
  artworkNoToken: ['Karya {pid}. Juri: sila buka pautan WhatsApp juri anda dahulu.', 'Artwork {pid}. Juries: please open your WhatsApp jury link first.'],
  noApi: ['API_URL belum ditetapkan dalam assets/config.js.', 'API_URL is not set in assets/config.js.'],
  loadFail: ['Tidak dapat memuatkan data. Semak sambungan internet.', 'Could not load data. Check your connection.'],
  retry: ['Cuba lagi', 'Retry'],
  scanHint: ['Halakan kamera pada kod QR pada karya', 'Point the camera at the QR code on the artwork'],
  camFail: ['Kamera tidak tersedia. Guna Masukkan ID.', 'Camera not available. Use Enter ID.'],
  go: ['Pergi', 'Go'],
  idLabel: ['Nombor karya', 'Artwork number'],
  badId: ['Nombor tidak sah', 'Invalid number'],
  settings: ['Tetapan', 'Settings'],
  language: ['Bahasa', 'Language'],
  theme: ['Tema', 'Theme'],
  themeAuto: ['Auto', 'Auto'],
  themeLight: ['Terang', 'Light'],
  themeDark: ['Gelap', 'Dark'],
  inputMode: ['Cara input', 'Input'],
  chips: ['Butang', 'Buttons'],
  slider: ['Gelongsor', 'Slider'],
  holdHint: ['Ketuk dan tahan nama kriteria untuk panduan.', 'Tap and hold a criterion name for guidance.'],
  close: ['Tutup', 'Close'],
  failedSaves: ['{n} simpanan ditolak: {why}', '{n} save(s) rejected: {why}'],
  nothing: ['Tiada', 'None'],
  anchors: [
    ['1-3 Baru bermula', '4-6 Berkembang', '7-8 Kuat', '9-10 Cemerlang'],
    ['1-3 Emerging', '4-6 Developing', '7-8 Strong', '9-10 Outstanding']
  ],
  c1: ['Pilihan warna yang menarik dan harmoni; kontras; suasana.', 'Pleasing, purposeful palette; contrast; mood.'],
  c2: ['Warna rata, kekal dalam garisan, tepi kemas.', 'Even fill, staying within lines, clean edges.'],
  c3: ['Pilihan tidak dijangka tetapi disengajakan; butiran atau latar tambahan; tafsiran peribadi tema seni bina.', 'Unexpected but intentional choices, added details or background, personal interpretation of the architecture theme.'],
  c4: ['Teduhan, adunan, tekstur, kecerunan, media campuran.', 'Shading, blending, texture, gradients, mixed media.'],
  c5: ['Keseluruhan gambar siap; kesan pandangan pertama.', 'Whole picture finished; first-glance "wow".']
};

/** Pages with their own strings (admin) register them here: {key: [bm, en]}. */
export function addStrings(o) { Object.assign(S, o); }

let lang = 'bm';
try { lang = localStorage.getItem('fsb.lang') || CONFIG.DEFAULT_LANG || 'bm'; } catch (e) { lang = CONFIG.DEFAULT_LANG || 'bm'; }
if (lang !== 'bm' && lang !== 'en') lang = 'bm';
const listeners = [];

export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'bm';
  try { localStorage.setItem('fsb.lang', lang); } catch (e) { /* storage may be blocked */ }
  document.documentElement.lang = lang === 'en' ? 'en' : 'ms';
  listeners.forEach(fn => fn(lang));
}
export const onLang = fn => listeners.push(fn);

export function t(key, vars) {
  const e = S[key];
  if (!e) return key;
  let s = e[lang === 'en' ? 1 : 0];
  if (typeof s !== 'string') return s;
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
  return s;
}
document.documentElement.lang = lang === 'en' ? 'en' : 'ms';
