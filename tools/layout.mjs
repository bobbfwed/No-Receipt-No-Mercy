// The phone layout check (0.4, the owner: "tests for the phone layout should cover what covers the
// floor"). Opens the game in headless Edge at phone and tablet sizes, as a touch screen, in the
// situations where the interface is busiest, and measures:
//   - what share of the floor is covered by interface (the panels and chips at the top left,
//     reviews, notices, DEB, the building sheet, the held tool's card, the small map, the floor
//     switch, the camera pad, the REBUILD button, the boss bar, the placing aid, the chat);
//   - whether any two of those pieces overlap each other, or the top bar or the build bar;
//   - in the training shift, whether the tile the lesson marks is covered by anything (the floor
//     itself must be what a finger lands on there);
//   - (0.4.01, the owner: "allow the player to see the edges of the map, even if notifications and
//     other windows are showing") on the screens marked `edges`, in the situations marked `edges`:
//     zoomed in, the view pushed as far up as it goes leaves the top row of tiles clear of every
//     piece, and pushed as far down, the bottom row.
// Each situation puts DEB mid-sentence (a long line), a customer review and a notice on screen, so
// the worst case is what is measured.
//
// Usage:   node tools/layout.mjs [--shots=<dir>] [--only=<size or situation name part>] [-v]
// It starts its own copy of the dev server and of Edge, and needs nothing else running. Exit code 0
// when every check passes. --shots saves a picture of every case; -v lists every piece's box.
//
// The limits (share of the floor covered) are written beside each situation below, with room over
// what the layout of 0.4 stage 5a measured, so a change that covers noticeably more of the floor
// fails. Raise one only on purpose.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const shotsDir = opt('shots') ? resolve(opt('shots')) : null;
const only = opt('only');
const verbose = args.includes('-v');

/** The screens: two phones on their side, a phone upright, a tablet. All touch screens. */
// `allow` is added to every situation's limit for that screen: the small phone's floor is only about
// 240 pixels tall, so the same pieces (each already as small as is readable) cover more of it.
export const SIZES = [
  { name: 'phone 844x390', w: 844, h: 390, allow: 0, edges: true },
  { name: 'small phone 667x375', w: 667, h: 375, allow: 0.1 },
  { name: 'phone upright 390x844', w: 390, h: 844, allow: 0, edges: true },
  { name: 'tablet 1024x768', w: 1024, h: 768, allow: 0 },
];

const LONG_LINE = "Four dads in single file. Nobody organised the line. Dads just form one, like geese, or men outside a urologist's office.";
/**
 * Puts DEB mid-sentence, a review and a notice on screen (the busiest moment). The training shift
 * is played alone, so nobody joins it: no notice there (and on a phone it shows no reviews).
 */
const chatter = (training) => `(() => {
  const s = __game.session;
  s.emit('say', { who: 'DEB (HR)', text: ${JSON.stringify(LONG_LINE)}, mood: 'smug' });
  s.emit('review', { stars: 1, text: 'Waited forty minutes behind a man returning a single sock. One star. Would riot again.', kind: 'karen' });
  ${training ? '' : "s.emit('players', { text: 'Steve joined. Split the money, split the blame.' });"}
})()`;
const closeReview = "document.querySelector('.pr-x')?.click()";
/** Picks a building up from the bar with a tap, the way a finger does. */
const pick = (k) => `(() => { const b = document.querySelector('.bb-btn[data-k="${k}"]'); b.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true })); b.click(); })()`;

/**
 * The situations. `max` is the most of the floor (a share) the interface may cover there.
 * (The training shift on a phone on its side puts its lesson panel beside the floor, not over it.)
 */
export const SITUATIONS = [
  { name: 'build pause', url: '?demo=1&ff=700&seed=7&cards=1', before: [closeReview], max: 0.30 },
  { name: 'mid-event', url: '?demo=1&ff=1300&autostart=1&seed=7&cards=1', max: 0.30, edges: true },
  { name: 'building held', url: '?demo=1&ff=1300&autostart=1&seed=7&cards=1&hold=sprinkler&hover=12,9', max: 0.40, edges: true },
  { name: 'sheet open', url: '?demo=1&ff=1300&autostart=1&seed=7&cards=1&select=9,8', max: 0.45, edges: true },
  { name: 'The Back', url: '?demo=1&ff=1300&autostart=1&seed=7&cards=1&back=1', max: 0.30 },
  // (The training shift's steps, 0-based: 5 Free Samples, 8 the Forklift and the dads, 10 the
  // Spite Still in The Back, 16 the Wire tool; tests/tutorial.test.js holds the lesson list.)
  { name: 'training: Free Samples', url: '?tutorial=1&step=5', before: [pick('samples')], marks: true, max: 0.40 },
  { name: 'training: Forklift', url: '?tutorial=1&step=8', before: [pick('forklift')], marks: true, max: 0.40 },
  { name: 'training: The Back', url: '?tutorial=1&step=10', before: [pick('still')], marks: true, max: 0.40 },
  { name: 'training: Wire', url: '?tutorial=1&step=16', before: [pick('wire')], marks: true, max: 0.40 },
];

/** What floats over the floor, by selector (each element found is one piece). */
const PIECES = [
  ['players', '.players'], ['hand', '.hand-wrap'], ['pay', '.eventpay-wrap .eventpay'],
  ['notice', '.notice'], ['review', '.review-toast'], ['DEB', '.deb'], ['sheet', '.touch-sheet'], ['card', '.bb-info'],
  ['minimap', '.minimap'], ['floor switch', '.floor-switch'], ['camera pad', '.touch-pad'], ['rebuild', '.rebuild-pop .rp-btn'],
  ['boss bar', '.boss-bar'], ['placing aid', '.place-aid .tc-turn'], ['chat', '.chat'], ['lesson', '.tutorial'],
  ['top bar', '.topbar'], ['build bar', '.buildbar'],
];
/** These two are not over the floor; they count for overlaps only. */
const FRAME = new Set(['top bar', 'build bar', 'lesson']);

/** Runs in the page: the boxes, the coverage, the overlaps, the marked tiles. */
function measure(PIECES, FRAME) {
  const canvas = document.querySelector('canvas.world');
  const f = canvas.getBoundingClientRect();
  const shown = (el) => {
    if (!el.isConnected || !el.getClientRects().length) return false;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  const pieces = [];
  for (const [name, sel] of PIECES) {
    for (const el of document.querySelectorAll(sel)) {
      if (!shown(el) || el.classList.contains('leaving')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      pieces.push({ name, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    }
  }
  // Coverage: points every 3 pixels over the floor.
  let all = 0, covered = 0;
  const over = pieces.filter((p) => !FRAME.has(p.name));
  for (let y = f.top + 1.5; y < f.bottom; y += 3) {
    for (let x = f.left + 1.5; x < f.right; x += 3) {
      all++;
      if (over.some((p) => x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1)) covered++;
    }
  }
  const overlaps = [];
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j];
      if (FRAME.has(a.name) && FRAME.has(b.name)) continue;
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (w > 2 && h > 2) overlaps.push(`${a.name} / ${b.name} (${Math.round(w)}x${Math.round(h)})`);
    }
  }
  // The training shift's marked tiles: nothing over them, and the floor is what is under a finger.
  const marked = [];
  const g = globalThis.__game;
  const marks = (g && g.marks && g.marks()) || [];
  for (const m of marks) {
    const z = g.renderer.cam.zoom, cam = g.renderer.cam;
    const x0 = f.left + f.width / 2 + (m.x - cam.x) * z, y0 = f.top + f.height / 2 + (m.y - cam.y) * z;
    const hit = pieces.filter((p) => p.x0 < x0 + z && p.x1 > x0 && p.y0 < y0 + z && p.y1 > y0).map((p) => p.name);
    const top = document.elementFromPoint(x0 + z / 2, y0 + z / 2);
    if (top !== canvas) hit.push(`under the finger: ${top ? top.className || top.tagName : 'nothing'}`);
    const off = x0 + z / 2 < f.left || x0 + z / 2 > f.right || y0 + z / 2 < f.top || y0 + z / 2 > f.bottom;
    marked.push({ x: m.x, y: m.y, hit: off ? ['off the floor'] : [...new Set(hit)] });
  }
  const r = (p) => ({ name: p.name, box: [p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0].map(Math.round).join(',') });
  return { share: covered / Math.max(1, all), overlaps, marked, pieces: pieces.map(r) };
}

/**
 * Runs in the page: zooms in, pushes the view as far up as it goes (`dir` -1) or down (1), and
 * names the pieces over the top (or bottom) row of tiles. The map must not fit on screen at that
 * zoom, or the check means nothing: it says so.
 */
function edgeRow(PIECES, FRAME, dir) {
  const canvas = document.querySelector('canvas.world');
  const g = globalThis.__game, R = g.renderer, s = g.session.state;
  const f = canvas.getBoundingClientRect();
  // (At least 36 pixels a tile: zoomed in, yet a tile still fits in the band left between the top
  // pieces and the bottom ones on a phone on its side with the held tool's card up. A tall floor,
  // a phone held upright, needs more for the map not to fit.)
  R.zoomBy(Math.max(36, (1.5 * f.height) / s.h) / R.cam.zoom);
  R.pan(0, dir * 1e4);
  const cam = R.cam, z = cam.zoom;
  if (s.h * z <= f.height) return { fits: true, hit: [] };
  const row = dir < 0 ? 0 : s.h - 1;
  const y0 = f.top + f.height / 2 + (row - cam.y) * z, y1 = y0 + z;
  const x0 = Math.max(f.left, f.left + f.width / 2 - cam.x * z), x1 = Math.min(f.right, f.left + f.width / 2 + (s.w - cam.x) * z);
  const hit = [];
  for (const [name, sel] of PIECES) {
    if (FRAME.has(name) || name === 'placing aid') continue;
    for (const el of document.querySelectorAll(sel)) {
      if (!el.getClientRects().length || el.classList.contains('leaving')) continue;
      let shown = true;
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) { shown = false; break; }
      }
      if (!shown) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (Math.min(r.right, x1) - Math.max(r.left, x0) > 1 && Math.min(r.bottom, y1) - Math.max(r.top, y0) > 1) {
        hit.push(`${name} (${Math.round(r.top)}-${Math.round(r.bottom)}, row ${Math.round(y0)}-${Math.round(y1)})`);
      }
    }
  }
  return { fits: false, hit };
}

// ---- Plumbing: a dev server, Edge, and its debugging protocol -----------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 5600 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, [join(here, 'serve.mjs'), String(port)], { stdio: 'ignore' });
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const dport = 9600 + Math.floor(Math.random() * 300);
const profile = mkdtempSync(join(tmpdir(), 'edge-layout-'));
const edge = spawn(edgePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', '--hide-scrollbars',
  `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, '--window-size=1024,844', 'about:blank'], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Edge did not start');
}

let code = 0;
try {
  const ws = new WebSocket(await connect());
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let nextId = 1;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((ok) => { const id = nextId++; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const run = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  if (shotsDir) mkdirSync(shotsDir, { recursive: true });

  const rows = [];
  for (const size of SIZES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: size.w, height: size.h, deviceScaleFactor: 1, mobile: true,
      screenOrientation: size.w > size.h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
    });
    for (const sit of SITUATIONS) {
      const label = `${size.name} · ${sit.name}`;
      if (only && !label.toLowerCase().includes(only.toLowerCase())) continue;
      // A fresh page with the game's own settings as they come (no hidden reviews or cards).
      await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html${sit.url}` });
      for (let i = 0; i < 60; i++) { await sleep(150); if (await run('!!(globalThis.__game && __game.session.state)').catch(() => false)) break; }
      await run("try { localStorage.removeItem('returns-dept.screen'); } catch {}");
      await sleep(700);
      for (const js of sit.before || []) { await run(js); await sleep(400); }
      await run(chatter(!!sit.marks));
      // Long enough for the training's camera and DEB's dodge (four times a second) to settle.
      await sleep(900);
      const m = await run(`(${measure})(${JSON.stringify(PIECES)}, new Set(${JSON.stringify([...FRAME])}))`);
      const bad = [];
      const max = sit.max + size.allow;
      if (m.share > max) bad.push(`covers ${(m.share * 100).toFixed(1)}% of the floor (limit ${Math.round(max * 100)}%)`);
      if (m.overlaps.length) bad.push(`overlaps: ${m.overlaps.join('; ')}`);
      if (sit.marks && !m.marked.length) bad.push('no marked tile found');
      for (const t of m.marked) if (t.hit.length) bad.push(`marked tile ${t.x},${t.y} covered by ${t.hit.join(', ')}`);
      if (size.edges && sit.edges) {
        // (After the measuring above, which wants the view as the page left it.)
        for (const dir of [-1, 1]) {
          const e = await run(`(${edgeRow})(${JSON.stringify(PIECES)}, new Set(${JSON.stringify([...FRAME])}), ${dir})`);
          const which = dir < 0 ? 'top' : 'bottom';
          if (e.fits) bad.push(`the map fits on screen at the zoom of the ${which} row check`);
          else if (e.hit.length) bad.push(`${which} row of tiles under ${e.hit.join(', ')} with the view pushed ${dir < 0 ? 'up' : 'down'}`);
          if (shotsDir) {
            await sleep(150);
            const shot = await send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(join(shotsDir, `${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-edge-${which}.png`), Buffer.from(shot.result.data, 'base64'));
          }
        }
      }
      rows.push({ label, share: m.share, max, bad });
      console.log(`${bad.length ? 'FAIL' : 'pass'}  ${label.padEnd(52)} ${(m.share * 100).toFixed(1).padStart(5)}% of the floor (limit ${Math.round(max * 100)}%)${bad.length ? `\n      ${bad.join('\n      ')}` : ''}`);
      if (verbose) for (const p of m.pieces) console.log(`        ${p.name.padEnd(14)} ${p.box}`);
      if (shotsDir) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(shotsDir, `${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`), Buffer.from(shot.result.data, 'base64'));
      }
    }
  }
  const failed = rows.filter((r) => r.bad.length);
  console.log(`\n${failed.length ? `FAIL ${failed.length} of ${rows.length}` : `PASS ${rows.length} of ${rows.length}`}${errors.length ? `\nPage errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}` : ''}`);
  if (failed.length || errors.length) code = 1;
  ws.close();
} catch (err) {
  console.error(`FAILED: ${err.message}`);
  code = 1;
} finally {
  edge.kill();
  server.kill();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold a file */ }
}
process.exit(code);
