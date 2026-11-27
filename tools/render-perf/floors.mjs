// Times the real renderer with each floor in front (tools/render-perf/floors.html), in headless Edge,
// on a desktop and a "phone" (the processor slowed 4x, as in the stutter investigation), and the
// worst frames after zooming across a sprite resolution step. Uses the investigation's Edge driver
// (tools/perf/cdp.mjs) and its saved states (run `node tools/perf/game2p.mjs` first).
// Usage: node tools/render-perf/floors.mjs [--state=e16] [--devices=desktop,phone] [--floors=0,1]
//          [--zoom=30] [--frames=600] [--rezoom=200] [--port=5193] [--json=out.json]
// --zoom: CSS pixels a tile (fit: the whole store). --rezoom=N adds a run per device and floor
// that zooms in 1.5x at frame N and reports the 60 frames after it.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { launch, emulate, waitFor, sleep } from '../perf/cdp.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const state = arg('state', 'e16');
const devices = arg('devices', 'desktop,phone').split(',');
const floors = arg('floors', '0,1').split(',').map(Number);
const zoom = arg('zoom', '30');
const frames = Number(arg('frames', 600));
const rezoom = Number(arg('rezoom', -1));
const port = Number(arg('port', 5193));
const jsonOut = arg('json', '');

const DEVICES = {
  desktop: { width: 1920, height: 1080, dpr: 1, mobile: false, throttle: 1 },
  phone: { width: 844, height: 390, dpr: 3, mobile: true, throttle: 4 },
};
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const r2 = (v) => +v.toFixed(2);

const server = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
await sleep(500);
const browser = await launch({ gpu: true });
const all = [];
try {
  for (const dev of devices) {
    for (const floor of floors) {
      for (const rz of rezoom >= 0 ? [-1, rezoom] : [-1]) {
        const page = await browser.newPage();
        await emulate(page, DEVICES[dev]);
        const url = `http://127.0.0.1:${port}/tools/render-perf/floors.html?state=/tools/perf/out/states/${state}.json&frames=${frames}&floor=${floor}&zoom=${zoom}${rz >= 0 ? `&rezoom=${rz}` : ''}`;
        await page.send('Page.navigate', { url });
        await waitFor(page, 'window.__perf && window.__perf.done', 300000);
        const r = await page.evaluate('JSON.parse(JSON.stringify(window.__perf))');
        if (r.error) { console.log(dev, floor, 'ERROR', r.error); page.close(); continue; }
        const warm = 60;
        const row = { device: dev, floor, zoom: r2(r.zoom), rezoom: rz };
        if (rz < 0) {
          const d = r.draw.slice(warm);
          Object.assign(row, { drawMean: r2(mean(d)), drawP95: r2(pct(d, 0.95)), drawMax: r2(Math.max(...d)), firstSecMax: r2(Math.max(...r.draw.slice(0, warm))), canvasesFirstSec: r.canv.slice(0, warm).reduce((a, b) => a + b, 0) });
        } else {
          const w = r.draw.slice(rz, rz + 60);
          Object.assign(row, { afterZoomMax: r2(Math.max(...w)), afterZoomMean: r2(mean(w)), worst5: w.slice().sort((a, b) => b - a).slice(0, 5).map(r2), canvases60: r.canv.slice(rz, rz + 60).reduce((a, b) => a + b, 0), canvasesFirstFrame: r.canv[rz] });
        }
        all.push(row);
        console.log(JSON.stringify(row));
        if (page.errors.length) console.log('  page errors:', [...new Set(page.errors)].slice(0, 3).join(' | '));
        page.close();
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1));
