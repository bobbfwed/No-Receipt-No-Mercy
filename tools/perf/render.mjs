// Times the real renderer in headless Edge on saved game states (tools/perf/render.html), at a
// desktop size and a phone size, with an optional CPU slow-down standing in for a phone's processor
// and an optional CPU profile that splits the time by file (floor, buildings, belt items,
// shoppers, effects, routes, small map, the simulation, garbage collection).
// Usage: node tools/perf/render.mjs [--states=e08,e11,e13,e16,e20] [--devices=desktop,phone]
//          [--frames=600] [--profile=1] [--gpu=1] [--extra=route=1&times=3] [--port=5191] [--json=out.json]
// Devices: desktop 1920x1080 at 1x; phone 844x390 at 3x pixel ratio, touch, CPU slowed 4x (phone6:
// slowed 6x; phone1: not slowed). The phone starts at the game's own starting view (30 px a tile,
// part of the store) with the small map; the desktop shows the whole store.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { launch, emulate, waitFor, byFile, sleep } from './cdp.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const states = arg('states', 'e08,e11,e13,e16,e20').split(',');
const devices = arg('devices', 'desktop,phone').split(',');
const frames = Number(arg('frames', 600));
const profile = arg('profile', '0') === '1';
const gpu = arg('gpu', '1') === '1';
const extra = arg('extra', '');
const port = Number(arg('port', 5191));
const jsonOut = arg('json', '');
const dir = arg('dir', 'tools/perf/out/states');

const DEVICES = {
  desktop: { width: 1920, height: 1080, dpr: 1, mobile: false, throttle: 1, q: 'zoom=fit' },
  phone: { width: 844, height: 390, dpr: 3, mobile: true, throttle: 4, q: 'zoom=auto&mini=1' },
  phone6: { width: 844, height: 390, dpr: 3, mobile: true, throttle: 6, q: 'zoom=auto&mini=1' },
  phone1: { width: 844, height: 390, dpr: 3, mobile: true, throttle: 1, q: 'zoom=auto&mini=1' },
  phonefit: { width: 844, height: 390, dpr: 3, mobile: true, throttle: 4, q: 'zoom=fit' },
};

const server = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
await sleep(500);
const browser = await launch({ gpu });
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const r2 = (v) => +v.toFixed(2);
const all = [];
try {
  for (const dev of devices) {
    const d = DEVICES[dev];
    for (const st of states) {
      const page = await browser.newPage();
      await emulate(page, d);
      if (profile) { await page.send('Profiler.enable'); await page.send('Profiler.setSamplingInterval', { interval: 200 }); }
      const url = `http://127.0.0.1:${port}/tools/perf/render.html?state=/${dir}/${st}.json&frames=${frames}&${d.q}${extra ? '&' + extra : ''}`;
      if (profile) await page.send('Profiler.start');
      await page.send('Page.navigate', { url });
      await waitFor(page, 'window.__perf && window.__perf.done', 300000);
      const prof = profile ? (await page.send('Profiler.stop')).profile : null;
      const r = await page.evaluate('JSON.parse(JSON.stringify(window.__perf))');
      if (r.error) { console.log(dev, st, 'ERROR', r.error); page.close(); continue; }
      const total = r.draw.map((v, i) => v + r.step[i] + r.minis[i]);
      const warm = 60; // the first second builds the sprite caches
      const row = {
        device: dev, state: st, extra, zoom: r2(r.zoom), canvas: r.canvas.join('x'), shoppersMean: Math.round(mean(r.shoppers)),
        drawMean: r2(mean(r.draw.slice(warm))), drawP95: r2(pct(r.draw.slice(warm), 0.95)), drawMax: r2(Math.max(...r.draw.slice(warm))),
        firstSecDrawMean: r2(mean(r.draw.slice(0, warm))), firstSecDrawMax: r2(Math.max(...r.draw.slice(0, warm))),
        stepMean: r2(mean(r.step)), stepMax: r2(Math.max(...r.step)), miniMax: r2(Math.max(...r.minis)),
        totalP95: r2(pct(total.slice(warm), 0.95)), over16: total.slice(warm).filter((v) => v > 16.7).length, over33: total.slice(warm).filter((v) => v > 33.3).length,
        gapMean: r2(mean(r.gaps)), gapP95: r2(pct(r.gaps, 0.95)), gapMax: r2(Math.max(...r.gaps)),
        canvasesFirstSec: r.canv.slice(0, warm).reduce((a, b) => a + b, 0), canvasesAfter: r.canv.slice(warm).reduce((a, b) => a + b, 0),
        heapGrowthMB: r.heapMB, frames: r.draw.length,
      };
      const ra = /routeAt=([0-9]+)/.exec(extra);
      if (ra) { const k = Number(ra[1]); row.aroundRoute = { gapsBefore: r.gaps.slice(k - 30, k).map(r2), gapsAfter: r.gaps.slice(k - 1, k + 30).map(r2), drawAfter: r.draw.slice(k, k + 10).map(r2) }; }
      const rz = /rezoom=([0-9]+)/.exec(extra);
      if (rz) { const k = Number(rz[1]); const w = r.draw.slice(k, k + 60); row.afterZoom = { drawMax: r2(Math.max(...w)), drawMean: r2(mean(w)), over33: w.filter((v) => v > 33.3).length, canvases: r.canv.slice(k, k + 60).reduce((a, b) => a + b, 0), worst5: w.slice().sort((a, b) => b - a).slice(0, 5).map(r2) }; }
      if (prof) row.profile = byFile(prof);
      all.push(row);
      const { profile: p, ...flat } = row;
      console.log(JSON.stringify(flat));
      if (p) console.log('  by file (ms):', JSON.stringify(p.files), '\n  top functions (ms):', JSON.stringify(p.functions));
      if (page.errors.length) console.log('  page errors:', [...new Set(page.errors)].slice(0, 3).join(' | '));
      page.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1));
