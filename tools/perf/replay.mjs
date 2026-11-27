// Drives tools/perf/replay.html (a whole scripted game drawn by the real renderer) in headless Edge
// and prints, per sales event and build pause, the drawing time and the canvases (sprites) made.
// Usage: node tools/perf/replay.mjs [--device=desktop|phone] [--query=tpf=3&until=22] [--port=5192] [--json=file]
//   desktop: 1920x1080, whole store. phone: 844x390 at 3x, touch, CPU slowed 4x, 30 px a tile on
//   the joined player's entrance, small map.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { launch, emulate, waitFor, sleep } from './cdp.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const device = arg('device', 'desktop');
const query = arg('query', '');
const port = Number(arg('port', 5192));
const jsonOut = arg('json', '');
const D = {
  desktop: { width: 1920, height: 1080, dpr: 1, mobile: false, throttle: 1, q: 'view=fit' },
  phone: { width: 844, height: 390, dpr: 3, mobile: true, throttle: Number(arg('throttle', 4)), q: 'view=home&me=1' },
}[device];

const server = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
await sleep(500);
const browser = await launch({ gpu: arg('gpu', '1') === '1' });
try {
  const page = await browser.newPage();
  await emulate(page, D);
  const t0 = Date.now();
  await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/tools/perf/replay.html?${D.q}${query ? '&' + query : ''}` });
  await waitFor(page, 'window.__perf && window.__perf.done', 60 * 60 * 1000);
  const r = await page.evaluate('JSON.parse(JSON.stringify(window.__perf))');
  if (r.error) throw new Error(r.error);
  console.log(`${device} ${query}  (${Math.round((Date.now() - t0) / 1000)} s)`);
  console.log('event phase  frames peak  mean   p50   p95   p99    max >16ms >33ms canvases gapMax  first seen  [frame gaps over 100 ms]');
  for (const e of r.events) {
    console.log([e.wave, e.phase, e.frames, e.peak, e.drawMean, e.p50, e.p95, e.p99, e.max, e.over16, e.over33, e.canvases]
      .concat([e.gapMax]).map((v, i) => String(v).padStart([5, 6, 7, 5, 6, 6, 6, 6, 7, 6, 6, 9, 7][i])).join(' ') + '  ' + e.firstSeen + (e.gapsOver100 ? '  [' + e.gapsOver100 + ']' : ''));
  }
  if (page.errors.length) console.log('page errors:', [...new Set(page.errors)].slice(0, 3).join(' | '));
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ device, query, events: r.events }, null, 1));
} finally {
  await browser.close();
  server.kill();
}
