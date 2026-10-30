// Fetch wrapper, jury data cache and the offline outbox (spec sections 4 and 11).
import { CONFIG } from './config.js';

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage may be blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
export const store = ls;

export class ApiError extends Error {
  constructor(code, message, retry) { super(message); this.code = code; this.retry = !!retry; }
}

async function call(method, params) {
  if (!CONFIG.API_URL) throw new ApiError('NO_API', 'API_URL not set', false);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  let res;
  try {
    if (method === 'GET') {
      const sep = CONFIG.API_URL.indexOf('?') >= 0 ? '&' : '?';
      res = await fetch(CONFIG.API_URL + sep + new URLSearchParams(params), { signal: ctl.signal });
    } else {
      // text/plain avoids the CORS preflight that Apps Script cannot answer
      res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(params), signal: ctl.signal });
    }
  } catch (e) {
    throw new ApiError('NETWORK', 'Network error', true);
  } finally { clearTimeout(timer); }
  let j;
  try { j = await res.json(); } catch (e) { throw new ApiError('NETWORK', 'Bad response', true); }
  if (!j.ok) throw new ApiError(j.error, j.message, j.error === 'BUSY');
  return j.data;
}

export const apiGet = (action, params) => call('GET', Object.assign({ action }, params));
export const apiPost = (action, params) => call('POST', Object.assign({ action }, params));

// ---- jury token and cache -------------------------------------------------------

export const getToken = () => ls.get('fsb.token', '');

export function setToken(t) {
  if (getToken() && getToken() !== t) ls.del('fsb.cache');   // a different jury's link: drop the old jury's data
  ls.set('fsb.token', t);
}

const cache = () => ls.get('fsb.cache', { me: null, artworks: [], scores: [] });

export const cached = () => cache();

const subs = [];
export const subscribe = fn => { subs.push(fn); };
const emit = () => subs.forEach(fn => fn());

/** Network first; falls back to the cache when offline. Throws if the link is bad or nothing is cached. */
export async function refresh() {
  const t = getToken();
  try {
    const [me, artworks, scores] = await Promise.all([apiGet('juryMe', { t }), apiGet('juryArtworks', { t }), apiGet('juryScores', { t })]);
    ls.set('fsb.cache', { me, artworks, scores });
  } catch (e) {
    if (!e.retry || !cache().me) throw e;
  }
  emit();
  return cache();
}

// ---- outbox ---------------------------------------------------------------------

const outbox = () => ls.get('fsb.outbox', []);
export const pendingCount = () => outbox().length;
export const failedSaves = () => ls.get('fsb.failed', []);
export const clearFailed = () => { ls.del('fsb.failed'); emit(); };

/** Server scores overlaid with saves still waiting in the outbox. pid -> {c,total,note,pending}. */
export function myScores() {
  const m = {};
  cache().scores.forEach(s => { m[s.pid] = { c: s.c, total: s.total, note: s.note || '', pending: false }; });
  outbox().forEach(o => { m[o.payload.pid] = { c: o.payload.c, total: o.total, note: o.payload.note || '', pending: true }; });
  return m;
}

export function saveScore(pid, c, note, total) {
  const q = outbox().filter(o => o.payload.pid !== pid);   // a newer save for the same artwork replaces an unsent one
  const opId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  // The server keeps the write with the later client time. If an earlier save of this artwork carries a later time
  // (this phone's clock is behind another device), stay one millisecond ahead of it so this edit is not ignored.
  const seen = cache().scores.find(x => x.pid === pid), prior = seen ? Date.parse(seen.updatedAtClient) : NaN;
  const ts = Math.max(Date.now(), isNaN(prior) ? 0 : prior + 1);
  q.push({
    total,
    payload: { action: 'saveScore', t: getToken(), pid, c, note, updatedAtClient: new Date(ts).toISOString(), clientOpId: opId }
  });
  ls.set('fsb.outbox', q);
  emit();
  flush();
}

let flushing = false;
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const q = outbox();
      if (!q.length) break;
      const item = q[0];
      try {
        const data = await call('POST', item.payload);
        const c = cache();
        const i = c.scores.findIndex(s => s.pid === data.score.pid);
        if (i >= 0) c.scores[i] = data.score; else c.scores.push(data.score);
        ls.set('fsb.cache', c);
      } catch (e) {
        if (e.retry) break;                                  // offline or busy: keep it and try later
        const f = failedSaves(); f.push({ pid: item.payload.pid, code: e.code, message: e.message }); ls.set('fsb.failed', f);
        if (e.code === 'LOCKED') { const c = cache(); if (c.me) { c.me.locked = true; ls.set('fsb.cache', c); } }
      }
      ls.set('fsb.outbox', outbox().filter(o => o.payload.clientOpId !== item.payload.clientOpId));
      emit();
    }
  } finally { flushing = false; emit(); }
}

setInterval(flush, 10000);
window.addEventListener('online', flush);
