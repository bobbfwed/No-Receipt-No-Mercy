// Drives the game in Chrome on an Android phone attached by USB, to check the touch controls on
// a real device. The touches go through Chrome's real touch input on the phone.
//
// Before running it (adb is in the Android SDK's platform-tools folder):
//   adb reverse tcp:5173 tcp:5173        the phone's "localhost:5173" is this computer's server
//   adb shell am start -a android.intent.action.VIEW -d "http://localhost:5173/?solo=1" com.android.chrome
//   adb forward tcp:9333 localabstract:chrome_devtools_remote
// Usage: node tools/phone.mjs [match]    match = part of the tab's address (default "localhost:5173")
// It prints one line per check, PASS or FAIL. Screenshots of the whole phone screen are taken
// separately with:  adb exec-out screencap -p > shot.png
const match = process.argv[2] || 'localhost:5173';
const tabs = await (await fetch('http://localhost:9333/json')).json();
const tab = tabs.find((t) => t.type === 'page' && t.url.includes(match));
if (!tab) { console.error(`No tab with "${match}" in its address is open in Chrome on the phone.`); process.exit(1); }

const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
let seq = 0;
const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params = {}) => new Promise((ok) => { const id = ++seq; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: `(() => { ${expr} })()`, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'page error');
  return r.result?.result?.value;
}
const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: Math.round(p.x), y: Math.round(p.y), id })) });
async function tap(p) { await touch('touchStart', [p]); await wait(60); await touch('touchEnd', []); await wait(250); }
async function drag(a, b, steps = 8) {
  await touch('touchStart', [a]);
  for (let n = 1; n <= steps; n++) { await wait(25); await touch('touchMove', [{ x: a.x + ((b.x - a.x) * n) / steps, y: a.y + ((b.y - a.y) * n) / steps }]); }
  await wait(40); await touch('touchEnd', []); await wait(300);
}
async function pinch(c, from, to, steps = 8) {
  const pts = (d) => [{ x: c.x - d, y: c.y }, { x: c.x + d, y: c.y }];
  await touch('touchStart', pts(from));
  for (let n = 1; n <= steps; n++) { await wait(25); await touch('touchMove', pts(from + ((to - from) * n) / steps)); }
  await wait(40); await touch('touchEnd', []); await wait(300);
}
/** Where a tile's centre is on the phone's screen, in CSS pixels. */
const tileAt = (x, y) => js(`const g = __game, r = document.querySelector('canvas.world').getBoundingClientRect(), c = g.renderer.cam;
  return { x: r.left + r.width / 2 + (${x} + 0.5 - c.x) * c.zoom, y: r.top + r.height / 2 + (${y} + 0.5 - c.y) * c.zoom };`);
const centreOf = (sel) => js(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };`);
const cam = () => js('const c = __game.renderer.cam; return { x: c.x, y: c.y, zoom: c.zoom };');
const at = (x, y) => js(`const s = __game.session.state, b = s.grid[${y} * s.w + ${x}]; return b ? { k: b.k, d: b.d } : null;`);
const count = () => js('return __game.session.state.grid.filter(Boolean).length;');
/** A free tile for a kind, on screen where the floor itself is (not under a panel or button). */
const freeTile = (kind, d = 0, skip = 0) => js(`return import('/src/sim/index.js').then((m) => {
  const g = __game, s = g.session.state, r = g.renderer.viewRect(), c = document.querySelector('canvas.world'), cr = c.getBoundingClientRect(), cam = g.renderer.cam;
  let n = ${skip};
  for (let y = Math.ceil(r.y0) + 2; y < Math.floor(r.y1) - 2; y++) for (let x = Math.ceil(r.x0) + 2; x < Math.floor(r.x1) - 2; x++) {
    const px = cr.left + cr.width / 2 + (x + 0.5 - cam.x) * cam.zoom, py = cr.top + cr.height / 2 + (y + 0.5 - cam.y) * cam.zoom;
    if (document.elementFromPoint(px, py) !== c || s.grid[y * s.w + x] || m.canPlace(s, '${kind}', x, y, g.session.me, ${d}) !== null) continue;
    if (n-- <= 0) return { x, y };
  }
  return null;
});`);
const aidUp = () => js("const a = document.querySelector('.place-aid'); return !!a && getComputedStyle(a).display !== 'none';");
/** One finger down at a, slid to b, still down (the caller lifts it with touch('touchEnd', [])). */
async function holdAndSlide(a, b, steps = 8) {
  await touch('touchStart', [a]);
  for (let n = 1; n <= steps; n++) { await wait(25); await touch('touchMove', [{ x: a.x + ((b.x - a.x) * n) / steps, y: a.y + ((b.y - a.y) * n) / steps }]); }
  await wait(120);
}
let fails = 0;
const check = (ok, text) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); };

// ---------------------------------------------------------------- the checks
await js('window.__mark = 1; return 1;'); // lost if the page reloads (pull-to-refresh)
const info = await js(`return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, coarse: matchMedia('(pointer: coarse)').matches,
  phase: __game.session.state.phase, map: __game.session.state.w + 'x' + __game.session.state.h, ua: navigator.userAgent.replace(/.*(Chrome\\/[\\d.]+).*/, '$1') };`);
console.log(`Phone page: ${info.w} x ${info.h} CSS px, pixel ratio ${info.dpr}, ${info.ua}, map ${info.map}, phase ${info.phase}`);
check(info.coarse, 'the phone reports a touch pointer, so the touch layout and buttons are on');
check(await js("return !!document.querySelector('.touch-pad, .touch-btns, [class*=touch]');"), 'on-screen touch buttons exist');
check(await js('return document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1;'), 'nothing runs off the screen (the page has no scroll)');

const mid = await js("const r = document.querySelector('canvas.world').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };");
let c0 = await cam();
await drag({ x: mid.x + 60, y: mid.y + 60 }, { x: mid.x - 60, y: mid.y - 60 });
let c1 = await cam();
check(Math.hypot(c1.x - c0.x, c1.y - c0.y) > 1, `one finger with nothing picked moves the view (${Math.hypot(c1.x - c0.x, c1.y - c0.y).toFixed(1)} tiles)`);
check(await js('return __game.session.state.grid.every((b) => !b);'), '... and builds nothing');

c0 = await cam();
await pinch(mid, 40, 120);
c1 = await cam();
check(c1.zoom > c0.zoom * 1.3, `two fingers spreading zoom in (${c0.zoom.toFixed(0)} to ${c1.zoom.toFixed(0)} px a tile)`);
await pinch(mid, 120, 50);
const c2 = await cam();
check(c2.zoom < c1.zoom * 0.8, `two fingers pinching zoom out (${c1.zoom.toFixed(0)} to ${c2.zoom.toFixed(0)} px a tile)`);
check(await js('return (visualViewport ? visualViewport.scale : 1) === 1;'), 'the page itself did not zoom');

// A long pull down from the top of the floor: must move the view, not refresh the page.
await drag({ x: mid.x, y: mid.y - 150 }, { x: mid.x, y: mid.y + 250 }, 12);
check(await js('return window.__mark === 1;'), 'pulling down does not reload the page');

// Build: pick Crates, tap a tile near the middle of the view.
const pick = async (k) => {
  await js(`document.querySelector('[data-k="${k}"]').scrollIntoView({ inline: 'center', block: 'nearest' }); return 1;`);
  await wait(250);
  await tap(await centreOf(`[data-k="${k}"]`));
};
const view = await js('const r = __game.renderer.viewRect(); return r;');
const tx = Math.round((view.x0 + view.x1) / 2), ty = Math.round((view.y0 + view.y1) / 2);
await pick('crate');
check(await js('return __game.input.tool;') === 'crate', 'tapping a bar button picks the tool');
await tap(await tileAt(tx, ty));
check((await at(tx, ty))?.k === 'crate', `a tap with Crates picked builds one (tile ${tx},${ty})`);

// Two more crates, at each end of a row, for the Remove check below. (Until 0.4 a drag with the
// shop floor's Belt laid that row; belts are in The Back now.)
for (const x of [tx - 2, tx + 2]) await tap(await tileAt(x, ty + 2));
check((await at(tx - 2, ty + 2))?.k === 'crate' && (await at(tx + 2, ty + 2))?.k === 'crate', 'two more taps with Crates picked build two more');

// Since 0.3.01 every other building is placed one at a time: the preview follows the finger and
// one is built where it lifts. A second finger on the floor cancels; the Rotate button turns it.
await js('__game.session.state.players[__game.session.me].cash += 5000; return 1;');
await pick('sprinkler');
let s0 = await freeTile('sprinkler'), s1 = await freeTile('sprinkler', 0, 3);
let n0 = await count();
await holdAndSlide(await tileAt(s0.x, s0.y), await tileAt(s1.x, s1.y));
const hov = await js('const h = __game.input.hover; return h ? { x: h.x, y: h.y } : null;');
check(await count() === n0, 'with Sprinkler picked, a finger sliding over the floor builds nothing while it is down');
check(hov && hov.x === s1.x && hov.y === s1.y, `... the preview follows it (${JSON.stringify(hov)}, finger on ${s1.x},${s1.y})`);
check(await aidUp(), '... and the "another finger cancels" hint shows');
await touch('touchEnd', []); await wait(300);
check(await count() === n0 + 1 && (await at(s1.x, s1.y))?.k === 'sprinkler' && !(await at(s0.x, s0.y)), 'lifting builds exactly one, where the finger lifted');
check(!(await aidUp()), '... and the hint goes');

s0 = await freeTile('sprinkler'); s1 = await freeTile('sprinkler', 0, 2);
n0 = await count();
const zoom0 = (await cam()).zoom;
const a0 = await tileAt(s0.x, s0.y);
await holdAndSlide(a0, { x: a0.x + 8, y: a0.y + 6 }, 3);
// The second finger lands on the floor 90 pixels away, then the two spread apart.
const b0 = { x: a0.x + 90, y: a0.y + 70 };
await touch('touchStart', [{ x: a0.x + 8, y: a0.y + 6 }, b0]);
for (let n = 1; n <= 8; n++) { await wait(25); await touch('touchMove', [{ x: a0.x + 8 - n * 8, y: a0.y + 6 - n * 6 }, { x: b0.x + n * 8, y: b0.y + n * 6 }]); }
await wait(40); await touch('touchEnd', [{ x: a0.x - 56, y: a0.y - 42 }]); await wait(40); await touch('touchEnd', []); await wait(300);
check(await count() === n0, 'a second finger on the floor cancels the placement: nothing is built when they lift');
check((await cam()).zoom > zoom0 * 1.15 || zoom0 > 71, `... and the two fingers zoom the view (${zoom0.toFixed(0)} to ${(await cam()).zoom.toFixed(0)} px a tile)`);
check(await js('return __game.input.tool;') === 'sprinkler', '... and the Sprinkler stays picked');

await js('__game.renderer.fit(); __game.input.goHome(); return 1;'); await wait(300);
await pick('railgun');
const d0 = await js('return __game.input.dir;'), d1 = (d0 + 1) & 3;
const rl = await freeTile('railgun', d1);
const ra = await tileAt(rl.x, rl.y);
await holdAndSlide(ra, { x: ra.x + 2, y: ra.y + 1 }, 2);
const turn = await centreOf('.place-aid .tc-turn');
check(!!turn && turn.w >= 56 && turn.h >= 56, `with Barcode Laser picked, a Rotate button of at least 56 px shows while the finger is down (${turn ? `${turn.w.toFixed(0)} x ${turn.h.toFixed(0)}` : 'none'})`);
if (turn) {
  // A tap on it with a second finger while the first stays down.
  await touch('touchStart', [{ x: ra.x + 2, y: ra.y + 1 }, turn]); await wait(80);
  await touch('touchEnd', [{ x: ra.x + 2, y: ra.y + 1 }]); await wait(200);
}
check(await js('return __game.input.dir;') === d1, 'a tap on it with another finger turns the building');
check(await js('return !!__game.input.placing;') && await aidUp(), '... and does not cancel the placement');
await touch('touchEnd', []); await wait(300);
const laser = await at(rl.x, rl.y);
check(laser?.k === 'railgun' && laser.d === d1, `... lifting places it facing the turned way (${laser ? `${laser.k} d=${laser.d}` : 'nothing'})`);

await pick('remove');
n0 = await count();
await drag(await tileAt(tx - 2, ty + 2), await tileAt(tx + 2, ty + 2), 10);
check(await count() === n0 - 1 && !(await at(tx + 2, ty + 2)) && (await at(tx - 2, ty + 2))?.k === 'crate', 'a drag with Remove removes one building, where the finger lifts');
await pick('crate');

await tap(await centreOf('[data-k="crate"]'));
check(await js('return __game.input.tool;') === null, 'tapping the picked tool again puts it down');
await tap(await tileAt(tx, ty));
const sheet = await js("const e = [...document.querySelectorAll('button')].find((b) => /Remove/.test(b.textContent) && b.offsetParent && !b.closest('.buildbar')); return e ? e.textContent.trim() : '';");
check(!!sheet, `tapping a building with nothing picked offers its actions ("${sheet.replace(/\s+/g, ' ')}")`);

// Full screen from the menu button.
const more = await centreOf('.btn-more');
if (more && more.w > 0) { await tap(more); await wait(200); }
const fs = await centreOf('.btn-full');
if (fs && fs.w > 0) {
  await tap(fs);
  await wait(900);
  check(await js('return !!document.fullscreenElement;'), 'the full-screen button takes the game full screen');
  const now = await js('return { w: innerWidth, h: innerHeight };');
  console.log(`      full screen page: ${now.w} x ${now.h} CSS px (was ${info.w} x ${info.h})`);
} else check(false, 'the full-screen button was not found');

console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll checks passed on the phone.');
ws.close();
