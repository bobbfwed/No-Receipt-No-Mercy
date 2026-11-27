// Opens tools/perf/live.html twice in one headless Edge: a host tab at a desktop size and a joined
// tab as a phone (844x390 at 3x, touch, CPU slowed --throttle times), on a saved state, records
// for --secs seconds, and prints frame timing for each, the long tasks, the client's sync counters
// and (with --profile=1) where each tab's main-thread time went, by file.
// Usage: node tools/perf/live.mjs [--state=e11] [--secs=120] [--throttle=4] [--speed=1] [--profile=1]
//          [--sound=1] [--port=5194] [--json=file]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { launch, emulate, waitFor, byFile, hitches, sleep } from './cdp.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const state = arg('state', 'e11');
const secs = Number(arg('secs', 120));
const throttle = Number(arg('throttle', 4));
const speed = Number(arg('speed', 1));
const profile = arg('profile', '1') === '1';
const sound = arg('sound', '1');
const port = Number(arg('port', 5194));
const code = `P${Math.floor(Math.random() * 1e6)}`;

const server = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
await sleep(500);
const browser = await launch({ gpu: arg('gpu', '1') === '1' });
const browser2 = browser;
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const summary = (r) => {
  const g = r.gaps.map((x) => x[1]).slice(60);
  return {
    frames: g.length, fps: +(1000 / (g.reduce((a, b) => a + b, 0) / g.length)).toFixed(1), gapP50: pct(g, 0.5), gapP95: pct(g, 0.95), gapP99: pct(g, 0.99), gapMax: Math.max(...g),
    over50: g.filter((v) => v > 50).length, over100: g.filter((v) => v > 100).length, over250: g.filter((v) => v > 250).length,
    longTasks: r.long.length, longTaskMs: r.long.reduce((a, b) => a + b[1], 0), longest: r.long.reduce((a, b) => Math.max(a, b[1]), 0),
    stats: r.stats, shoppersAtEnd: r.shoppers, waves: r.waves.map((w) => `${w[1]}${w[2][0]}@${Math.round(w[0] / 1000)}s`).join(' '),
  };
};
const out = {};
try {
  const host = await browser.newPage({ window: true });
  await emulate(host, { width: 1920, height: 1080, dpr: 1, mobile: false, throttle: 1 });
  const join = await browser2.newPage({ window: true });
  await emulate(join, { width: 844, height: 390, dpr: 3, mobile: true, throttle });
  for (const p of [host, join]) { await p.send('Profiler.enable'); await p.send('Profiler.setSamplingInterval', { interval: 500 }); }
  const base = `http://127.0.0.1:${port}/tools/perf/live.html?code=${code}&secs=${secs}&sound=${sound}${arg('hide', '') ? '&hide=' + encodeURIComponent(arg('hide')) : ''}`;
  await host.send('Page.navigate', { url: `${base}&role=host&state=/tools/perf/out/states/${state}.json&speed=${speed}` });
  await sleep(3000);
  await join.send('Page.navigate', { url: `${base}&role=join` });
  // --profileAfter=S: start the profiles S seconds after the join (to leave the start-up out).
  const after = Number(arg('profileAfter', 0));
  if (after) await sleep(after * 1000);
  if (profile) { await host.send('Profiler.start'); await join.send('Profiler.start'); }
  // --traceAt=S --traceSecs=N: a trace of the whole browser (every process and thread) from S
  // seconds after the join, for N seconds, with its longest events printed: how a long frame is
  // found when no page's main thread was busy (the GPU process, the compositor, the browser).
  const traceAt = Number(arg('traceAt', 0));
  if (traceAt) {
    await sleep(Math.max(0, traceAt - after) * 1000);
    const events = [];
    host.on((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); });
    const done = new Promise((ok) => host.on((m) => { if (m.method === 'Tracing.tracingComplete') ok(); }));
    await host.send('Tracing.start', { traceConfig: { includedCategories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'gpu', 'viz', 'v8', 'disabled-by-default-devtools.timeline.frame', 'renderer.scheduler', 'benchmark', 'loading'] }, transferMode: 'ReportEvents' });
    await sleep(Number(arg('traceSecs', 6)) * 1000);
    await host.send('Tracing.end');
    await done;
    const names = new Map();
    for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(e.pid + ':' + e.tid, e.args.name);
    const procs = new Map();
    for (const e of events) if (e.ph === 'M' && e.name === 'process_name') procs.set(e.pid, e.args.name);
    const long = events.filter((e) => e.ph === 'X' && e.dur > 50000).sort((a, b) => b.dur - a.dur).slice(0, 40)
      .map((e) => `${(e.dur / 1000).toFixed(0)}ms ${e.name} [${procs.get(e.pid) || e.pid} / ${names.get(e.pid + ':' + e.tid) || e.tid}] ${e.args && e.args.data ? JSON.stringify(e.args.data).slice(0, 120) : ''}`);
    out.trace = long;
    console.log(`longest trace events:\n  ${long.join('\n  ')}`);
    writeFileSync(arg('traceFile', 'tools/perf/out/trace.json'), JSON.stringify({ traceEvents: events }));
  }
  await waitFor(join, 'window.__perf && window.__perf.done', (secs + 120) * 1000);
  await waitFor(host, 'window.__perf && window.__perf.done', 60000);
  for (const [name, p] of [['host', host], ['join', join]]) {
    const r = await p.evaluate('JSON.parse(JSON.stringify(window.__perf))');
    if (r.error) { console.log(name, 'ERROR', r.error); continue; }
    out[name] = { summary: summary(r), raw: r };
    if (profile) { const pr = (await p.send('Profiler.stop')).profile; out[name].profile = byFile(pr, { fnTop: 30 }); out[name].hitches = hitches(pr, { n: 6 }); }
    console.log(`== ${name}`, JSON.stringify(out[name].summary));
    if (out[name].profile) console.log('  by file (ms):', JSON.stringify(out[name].profile.files), '\n  top functions (ms):', JSON.stringify(out[name].profile.functions));
    if (p.errors.length) console.log('  page errors:', [...new Set(p.errors)].slice(0, 3).join(' | '));
  }
} finally {
  await browser.close();
  server.kill();
}
if (arg('json', '')) writeFileSync(arg('json'), JSON.stringify(out, null, 1));
