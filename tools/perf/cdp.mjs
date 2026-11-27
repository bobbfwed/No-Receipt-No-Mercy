// A small driver for headless Edge over the DevTools protocol, for the perf tools (2026-11-26).
// Same approach as tools/realshot.mjs: start Edge with a debugging port, talk to the page over a
// WebSocket (built into Node 24).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts headless Edge. `gpu` false adds --disable-gpu (software drawing, as realshot.mjs does).
 * @returns {Promise<{ port, newPage: () => Promise<Page>, close: () => Promise<void> }>}
 */
export async function launch({ gpu = true, width = 1600, height = 900 } = {}) {
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'edge-perf-'));
  const args = ['--headless=new', '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank'];
  if (!gpu) args.splice(1, 0, '--disable-gpu');
  const proc = spawn(EDGE, args, { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(250); }
  }
  async function attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let nextId = 1;
    const waiting = new Map();
    const listeners = [];
    const errors = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      for (const fn of listeners) fn(msg);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    return { send, evaluate, errors, on: (fn) => listeners.push(fn), close: () => ws.close() };
  }
  return {
    port,
    /**
     * A new page. With `window` true it gets a window of its own, so it stays visible (and keeps
     * drawing) while another page is open: tabs in one window that are not in front are hidden,
     * and a hidden page gets no animation frames.
     */
    async newPage({ window = false } = {}) {
      if (!window) {
        const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
        return attach(t.webSocketDebuggerUrl);
      }
      const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      const bws = new WebSocket(ver.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { bws.onopen = resolve; bws.onerror = reject; });
      const id = await new Promise((resolve) => {
        bws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id === 1) resolve(msg.result.targetId); };
        bws.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank', newWindow: true, background: false } }));
      });
      bws.close();
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return attach(list.find((t) => t.id === id).webSocketDebuggerUrl);
    },
    async close() {
      proc.kill();
      await sleep(600);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold a file */ }
    },
  };
}

/** Sets the page's size, pixel ratio, touch and CPU slow-down (1 = none). */
export async function emulate(page, { width, height, dpr = 1, mobile = false, throttle = 1 }) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dpr, mobile,
    ...(mobile ? { screenOrientation: width > height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } } : {}),
  });
  if (mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setCPUThrottlingRate', { rate: throttle });
}

/** Waits until `expr` is truthy in the page (polling), or the time runs out. */
export async function waitFor(page, expr, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if (await page.evaluate(expr)) return true; } catch { /* page still loading */ }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${expr}`);
}

/**
 * Turns a CPU profile into milliseconds of self time per file of the game (each sample is charged
 * to the nearest function on its stack that lives in src/, so canvas calls count for the drawing
 * code that made them), plus the engine's own buckets: (garbage collector), (program), (idle).
 */
export function byFile(profile, { fnTop = 25 } = {}) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const ownerOf = new Map();
  const owner = (id) => {
    if (ownerOf.has(id)) return ownerOf.get(id);
    const n = nodes.get(id);
    const cf = n.callFrame;
    let o;
    if (cf.functionName === '(garbage collector)' || cf.functionName === '(program)' || cf.functionName === '(idle)' || cf.functionName === '(root)') o = cf.functionName;
    else if (/\/src\//.test(cf.url)) o = cf.url.slice(cf.url.indexOf('/src/') + 5);
    else if (/\/tools\//.test(cf.url)) o = 'tools/' + cf.url.split('/').pop();
    else o = parent.has(id) ? owner(parent.get(id)) : '(other)';
    ownerOf.set(id, o);
    return o;
  };
  const files = new Map(), fns = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i], us = dt[i] || 0;
    const f = owner(id);
    files.set(f, (files.get(f) || 0) + us);
    const n = nodes.get(id), cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} ${cf.url ? cf.url.split('/').slice(-2).join('/') + ':' + (cf.lineNumber + 1) : '[native, in ' + f + ']'}`;
    fns.set(key, (fns.get(key) || 0) + us);
  }
  const ms = (m) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / 1000).toFixed(1)]));
  return { files: ms(files), functions: Object.fromEntries(Object.entries(ms(fns)).slice(0, fnTop)) };
}

/**
 * The busiest moments of a CPU profile: the `n` windows of `ms` milliseconds (not overlapping) with
 * the most non-idle samples, each with its time from the start of the profile and its heaviest
 * functions (self time, with the game file a native call was made from). This is how a single
 * long frame is pinned on the code that caused it.
 */
export function hitches(profile, { n = 5, ms = 300, top = 12 } = {}) {
  const nodes = new Map(profile.nodes.map((x) => [x.id, x]));
  const parent = new Map();
  for (const x of profile.nodes) for (const c of x.children || []) parent.set(c, x.id);
  const fileOf = (id) => { for (let k = id; k !== undefined; k = parent.get(k)) { const u = nodes.get(k).callFrame.url; if (/\/src\//.test(u)) return u.slice(u.indexOf('/src/') + 5) + ':' + (nodes.get(k).callFrame.lineNumber + 1) + ' ' + (nodes.get(k).callFrame.functionName || '(anon)'); } return ''; };
  const t = [];
  let acc = 0;
  for (let i = 0; i < profile.samples.length; i++) { acc += profile.timeDeltas[i] || 0; t.push(acc / 1000); }
  const busy = profile.samples.map((id) => { const f = nodes.get(id).callFrame.functionName; return f !== '(idle)' && f !== '(root)'; });
  const dt = profile.timeDeltas.map((d) => d / 1000);
  const wins = [];
  let j = 0, sum = 0;
  for (let i = 0; i < t.length; i++) {
    if (busy[i]) sum += dt[i];
    while (t[i] - t[j] > ms) { if (busy[j]) sum -= dt[j]; j++; }
    wins.push([sum, j, i]);
  }
  wins.sort((a, b) => b[0] - a[0]);
  const out = [];
  for (const [s, a, b] of wins) {
    if (out.length >= n) break;
    if (out.some((o) => !(b < o.a || a > o.b))) continue;
    const fns = new Map();
    for (let i = a; i <= b; i++) {
      if (!busy[i]) continue;
      const nd = nodes.get(profile.samples[i]);
      const key = `${nd.callFrame.functionName || '(anon)'}${nd.callFrame.url ? '' : ' <- ' + fileOf(profile.samples[i])}${nd.callFrame.url ? ' ' + nd.callFrame.url.split('/').pop() + ':' + (nd.callFrame.lineNumber + 1) : ''}`;
      fns.set(key, (fns.get(key) || 0) + dt[i]);
    }
    out.push({ a, b, atSec: +(t[a] / 1000).toFixed(1), busyMs: Math.round(s), top: [...fns].sort((x, y) => y[1] - x[1]).slice(0, top).map(([k, v]) => `${v.toFixed(0)}ms ${k}`) });
  }
  return out.map(({ a, b, ...rest }) => rest);
}
