// Takes a screenshot of a page after letting it run for real seconds, by driving headless Edge
// over its debugging port. Unlike tools/shot.ps1 (which fast-forwards the page's clock), this
// waits in real time, so it can check things that depend on the network, such as online play.
// Usage: node tools/realshot.mjs <url> <out.png> [waitMs=8000] [width=1600] [height=900] [options]
// Options (all optional; without them it behaves as it always has):
//   --touch        pretend to be a phone or tablet: a touch screen with no mouse (so
//                  `(pointer: coarse)` matches and the page gets touch-type pointer events), and
//                  the page laid out the way a phone browser does it (the viewport meta tag counts)
//   --dpr=N        device pixels per CSS pixel (default 1); the picture is N times the size
//   --eval=<js>    after the wait, evaluate this expression in the page and print the result
//                  (a test page can leave its findings in a global for this to read)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const [url, out, waitArg, wArg, hArg] = args.filter((a) => !a.startsWith('--'));
const flag = (name) => flags.find((f) => f === `--${name}` || f.startsWith(`--${name}=`));
const flagValue = (name) => { const f = flag(name); return f && f.includes('=') ? f.slice(f.indexOf('=') + 1) : null; };
if (!url || !out) {
  console.error('Usage: node tools/realshot.mjs <url> <out.png> [waitMs] [width] [height] [--touch] [--dpr=N] [--eval=<js>]');
  process.exit(2);
}
const waitMs = Number(waitArg) || 8000, width = Number(wArg) || 1600, height = Number(hArg) || 900;
const touch = !!flag('touch');
const dpr = Number(flagValue('dpr')) || 1;
const evalExpr = flagValue('eval');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'edge-real-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank',
], { stdio: 'ignore' });

async function pageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* browser not up yet */ }
    await sleep(250);
  }
  throw new Error('Edge did not start');
}

let code = 0;
try {
  const ws = new WebSocket(await pageTarget());
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dpr, mobile: touch,
    // A phone in landscape reports a landscape screen.
    ...(touch ? { screenOrientation: width > height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } } : {}),
  });
  if (touch) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    // Some builds only switch the pointer and hover media features with the emitter on.
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  }
  await send('Page.navigate', { url });
  await sleep(waitMs);
  if (evalExpr) {
    const r = await send('Runtime.evaluate', { expression: evalExpr, returnByValue: true, awaitPromise: true });
    const v = r.result?.result;
    console.log(`EVAL ${r.result?.exceptionDetails ? `threw: ${r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text}` : JSON.stringify(v?.value ?? v?.description ?? null)}`);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(`OK ${out}`);
  console.log(errors.length ? `Page errors (${errors.length}):\n${[...new Set(errors)].slice(0, 10).join('\n')}` : 'No page errors.');
  ws.close();
} catch (err) {
  console.error(`FAILED: ${err.message}`);
  code = 1;
} finally {
  browser.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold a file; harmless */ }
}
process.exit(code);
