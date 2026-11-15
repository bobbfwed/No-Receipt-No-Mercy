// Takes a screenshot of a page after letting it run for real seconds, by driving headless Edge
// over its debugging port. Unlike tools/shot.ps1 (which fast-forwards the page's clock), this
// waits in real time, so it can check things that depend on the network, such as online play.
// Usage: node tools/realshot.mjs <url> <out.png> [waitMs=8000] [width=1600] [height=900]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, waitArg, wArg, hArg] = process.argv.slice(2);
if (!url || !out) {
  console.error('Usage: node tools/realshot.mjs <url> <out.png> [waitMs] [width] [height]');
  process.exit(2);
}
const waitMs = Number(waitArg) || 8000, width = Number(wArg) || 1600, height = Number(hArg) || 900;
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
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(waitMs);
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
