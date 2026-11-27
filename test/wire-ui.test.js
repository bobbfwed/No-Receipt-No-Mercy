// The Razor Wire and Reinforce interface (0.4, stage 4b): the Wire tool's gestures and the sheet's
// picker (src/ui/wiretool.js), the dads' two route lines and where wire is drawn
// (src/render/wireplan.js), the words (src/content/supplies.js, lines.js, director.js), the tools'
// keys, and the demo's wire and crates. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, applyDemoLayout, addStock, wireTiles, wireMap, reinforceCost, BUILD, BACK,
  itemCode, dadRoute,
} from '../src/sim/index.js';
import {
  WIRE_CYCLE, nextWireDir, dragDir, wireBuilding, clickWireDir, wirePicker, startReinforce, wireName, wireArrow,
  WIRE_KEY, REINFORCE_KEY,
} from '../src/ui/wiretool.js';
import {
  wireLayout, dadRoutes, diffRuns, previewTarget, withWire, DAD_LABEL, DAD_PLAN_LABEL, SHOPPER_LABEL,
} from '../src/render/wireplan.js';
import { wireStatus, wireWhyText, crateInfo, stockRows } from '../src/content/supplies.js';
import { NOPE, LINES, nopeKey, textOf } from '../src/content/lines.js';
import { createDirector } from '../src/content/director.js';
import { HOTKEYS, BACK_HOTKEYS, TOOL_KEYS } from '../src/ui/input.js';

const N = 3, E = 0, S = 1, W = 2;

/** The original small store (the demo's), a player with plenty of money, the build phase. */
function game(seed = 3) {
  const s = createGame({ seed });
  addPlayer(s, 'Dave');
  if (s.phase === 'cards') { s.phase = 'build'; delete s.dealT; }
  s.players[0].cash = 1e6;
  return s;
}
const at = (s, x, y) => y * s.w + x;
const place = (s, k, x, y, d = 0) => assert.equal(applyCommand(s, 0, { c: 'place', k, x, y, d }).ok, true, `${k} at ${x},${y}`);
const wire = (s, x, y, d) => applyCommand(s, 0, { c: 'wire', x, y, d });

test('a plain click steps the wire north, east, south, west, none, and round again', () => {
  assert.deepEqual(WIRE_CYCLE, [N, E, S, W, -1]);
  let d;
  const seen = [];
  for (let n = 0; n < 6; n++) { d = nextWireDir(d); seen.push(d); }
  assert.deepEqual(seen, [N, E, S, W, -1, N]);
  assert.equal(nextWireDir(-1), N);
  assert.equal(nextWireDir(undefined), N);
  // Refused directions are stepped over; no wire is always there to fall back on.
  assert.equal(nextWireDir(N, (x) => x !== E), S);
  assert.equal(nextWireDir(E, (x) => x === N), -1);
  assert.equal(nextWireDir(-1, () => false), -1);
  assert.deepEqual([N, E, S, W, -1].map(wireName), ['north', 'east', 'south', 'west', 'none']);
  assert.deepEqual([N, E, S, W, -1].map(wireArrow), ['↑', '→', '↓', '←', '✕']);
});

test('a drag means the side of the building it has gone furthest past, and nothing while on it', () => {
  const one = { x: 5, y: 5, w: 1, h: 1 };
  assert.equal(dragDir(one, 5.5, 5.5), null, 'on the building');
  assert.equal(dragDir(one, 6.2, 5.5), null, 'only just past the edge');
  assert.equal(dragDir(one, 6.5, 5.6), E);
  assert.equal(dragDir(one, 4.2, 5.4), W);
  assert.equal(dragDir(one, 5.6, 7.1), S);
  assert.equal(dragDir(one, 5.4, 3.9), N);
  assert.equal(dragDir(one, 7.5, 6.6), E, 'diagonal: the way it went further');
  assert.equal(dragDir(one, 6.6, 7.5), S);
  // A 2 x 2 building (the TV Salesman): measured from its edges, not its anchor.
  const big = { x: 5, y: 5, w: 2, h: 2 };
  assert.equal(dragDir(big, 6.9, 6.9), null);
  assert.equal(dragDir(big, 7.6, 6.0), E);
  assert.equal(dragDir(big, 6.0, 4.4), N);
});

test('the Wire tool knows what can carry wire, and a click skips what the rules would refuse', () => {
  const s = game();
  place(s, 'sprinkler', 1, 7); // beside the entrance, whose tiles are 0,7 and 0,8
  place(s, 'crate', 10, 10);
  place(s, 'salesman', 14, 6);
  assert.equal(wireBuilding(s, 10, 10), null, 'a Crate Stack has no Dumbwaiter');
  assert.equal(wireBuilding(s, 3, 3), null, 'bare floor');
  assert.equal(wireBuilding(s, -1, 3), null);
  assert.deepEqual(wireBuilding(s, 15, 7).rect, { x: 14, y: 6, w: 2, h: 2 }, 'any tile of a big building');
  // West would run over the entrance, and south shuts the other entrance tile in: both refused.
  const pick = wirePicker(s, 0, 1, 7);
  assert.deepEqual(pick.map((e) => e.d), WIRE_CYCLE);
  assert.deepEqual(pick.filter((e) => e.why).map((e) => [e.d, e.why]), [[S, 'blocked'], [W, 'blocked']]);
  assert.ok(pick.find((e) => e.d === -1).on, 'no wire yet');
  assert.equal(clickWireDir(s, 0, 1, 7), N);
  assert.equal(wire(s, 1, 7, N).ok, true);
  assert.ok(wirePicker(s, 0, 1, 7).find((e) => e.d === N).on);
  assert.equal(clickWireDir(s, 0, 1, 7), E);
  assert.equal(wire(s, 1, 7, E).ok, true);
  assert.equal(clickWireDir(s, 0, 1, 7), -1, 'south and west skipped: next is off');
  assert.equal(wirePicker(s, 0, 10, 10), null);
  assert.equal(wireWhyText('blocked'), 'Would cut the dads off from the tills');
  assert.equal(wireWhyText(null), '');
  assert.equal(wireWhyText('toString'), 'Not allowed');
});

test('the Reinforce drag: the first tile always, then one level a crate while the money lasts', () => {
  const s = game();
  for (let x = 3; x <= 8; x++) place(s, 'crate', x, 3);
  place(s, 'sprinkler', 9, 3);
  const first = reinforceCost(s.grid[at(s, 3, 3)], s);
  // Money for the first two crates only.
  const r = startReinforce(first * 2 + 1);
  const sent = [];
  for (const [x, y] of [[3, 3], [3, 3], [4, 3], [9, 3], [5, 3], [6, 3]]) {
    const c = r.at(s, 0, x, y);
    if (c) { sent.push(`${c.x},${c.y}`); assert.equal(applyCommand(s, 0, c).ok, true); }
  }
  assert.deepEqual(sent, ['3,3', '4,3'], 'each crate once, the sprinkler skipped, then it stops');
  assert.ok(r.stopped);
  assert.equal(r.at(s, 0, 7, 3), null, 'stays stopped');
  // The first tile goes even when it will be refused, so DEB can say why.
  const r2 = startReinforce(0);
  assert.deepEqual(r2.at(s, 0, 9, 3), { c: 'reinforce', x: 9, y: 3 });
  assert.equal(applyCommand(s, 0, { c: 'reinforce', x: 9, y: 3 }).why, 'kind');
  assert.equal(r2.at(s, 0, 8, 3), null, 'no money: quietly nothing');
  // A crate at the top level is passed over quietly.
  const top = s.grid[at(s, 8, 3)];
  top.r = BUILD.crate.reinforce.max;
  const r3 = startReinforce(1e6);
  assert.ok(r3.at(s, 0, 7, 3));
  assert.equal(r3.at(s, 0, 8, 3), null);
  assert.equal(r3.stopped, false);
});

test("a crate's sheet: its level, the hits it takes and the next level's price, or why not", () => {
  const s = game();
  place(s, 'crate', 4, 4);
  const b = s.grid[at(s, 4, 4)];
  const rf = BUILD.crate.reinforce;
  assert.deepEqual(crateInfo(b, 1000, s), { r: 0, max: rf.max, hits: 1, cost: rf.cost, why: '' });
  assert.equal(crateInfo(b, 3, s).why, `$${rf.cost - 3} short`);
  applyCommand(s, 0, { c: 'reinforce', x: 4, y: 4 });
  assert.equal(crateInfo(b, 1000, s).r, 1);
  assert.equal(crateInfo(b, 1000, s).hits, 2);
  b.r = rf.max;
  assert.equal(crateInfo(b, 1e6, s).why, 'Top level');
  assert.equal(crateInfo(b, 1e6, s).cost, 0);
});

test("the sheet's Razor Wire row says plainly what the wire is doing", () => {
  const s = game();
  place(s, 'forklift', 12, 12);
  const b = s.grid[at(s, 12, 12)];
  assert.equal(wireStatus(b), 'No direction set');
  addStock(b, itemCode(5, 1), s);
  const n = BACK.wireTurns[1];
  assert.equal(wireStatus(b), `No direction set (${n} dads' worth waiting)`);
  assert.equal(wire(s, 12, 12, N).ok, true);
  assert.equal(wireStatus(b), `LIVE, enough for ${n} more dads`);
  delete b.s.wire;
  assert.equal(wireStatus(b), 'PLANNED, no wire in stock');
  assert.equal(stockRows(b, s).find((r) => r.track === 'wire').gives, 'PLANNED, no wire in stock');
});

test('the differing stretches of a route: each with the tiles where it leaves and rejoins', () => {
  assert.deepEqual(diffRuns([1, 2, 3, 4], [1, 2, 3, 4]), []);
  assert.deepEqual(diffRuns([1, 2, 7, 8, 4, 5], [1, 2, 3, 4, 5]), [[2, 7, 8, 4]]);
  assert.deepEqual(diffRuns([1, 7, 2, 8, 9], [1, 2, 3]), [[1, 7, 2], [2, 8, 9]], 'two stretches; one runs to the end');
  assert.deepEqual(diffRuns([7, 8, 3], [1, 2, 3]), [[7, 8, 3]], 'from the start');
  assert.deepEqual(diffRuns([], [1]), []);
});

test("the demo: one live wire, one planned, and the two dad lines where they part", () => {
  const s = game(7);
  assert.deepEqual(applyDemoLayout(s, 0), []);
  const lay = wireLayout(s);
  assert.deepEqual(lay.map((w) => [w.x, w.y, w.d, w.live]), [[9, 8, N, true], [25, 8, S, false]]);
  assert.deepEqual(lay[0].strip, [at(s, 9, 7), at(s, 9, 6), at(s, 9, 5)], "the strip beyond the building, line by line outward");
  assert.equal(wireLayout(s), lay, 'cached against the layout');
  const r = dadRoutes(s);
  assert.equal(r.normal.length, 1);
  assert.equal(r.dads.length, 1);
  const d = r.dads[0];
  const live = wireMap(s).live;
  assert.ok(d.live.every((t) => live[t] < 0), 'the dads line never crosses live wire');
  assert.equal(s.tiles[d.live[d.live.length - 1]], 'T');
  assert.deepEqual(d.live, dadRoute(s, d.live[0], false), "the rules' own route");
  assert.equal(d.runs.length, 1, 'the planned wire at 25,8 sends them another way at the end');
  const planned = new Set(wireTiles(s, 25, 8));
  assert.ok(d.live.some((t) => planned.has(t)), 'today they walk through the planned wire');
  assert.ok(d.runs[0].every((t) => !planned.has(t)), 'if it were stocked, they would go round');
  assert.equal(d.cut, false);
  assert.equal(dadRoutes(s), r, 'cached');
  assert.deepEqual([SHOPPER_LABEL, DAD_LABEL, DAD_PLAN_LABEL], ['SHOPPER ROUTE', 'DADS', 'DADS, IF WIRED']);
  // Clearing the planned wire: the two lines are one.
  assert.equal(wire(s, 25, 8, -1).ok, true);
  assert.deepEqual(dadRoutes(s).dads[0].runs, []);
});

test("a wire direction being tried: the dads' lines as they would be, the real game untouched", () => {
  const s = game(7);
  applyDemoLayout(s, 0);
  const before = JSON.stringify(s);
  const grid = s.grid, b = s.grid[at(s, 17, 7)];
  assert.equal(previewTarget(s, { x: 17, y: 7, d: S }).ai, at(s, 17, 7));
  assert.equal(previewTarget(s, { x: 6, y: 6, d: S }), null, 'a crate');
  assert.equal(previewTarget(s, { x: 17, y: 7, d: 4 }), null);
  const base = dadRoutes(s);
  const p = dadRoutes(s, { x: 17, y: 7, d: S });
  assert.notEqual(p, base);
  assert.deepEqual(p.dads[0].live, base.dads[0].live, 'the forklift at 17,7 holds no wire: today nothing changes');
  const tried = new Set(wireTiles(s, 17, 7, S));
  assert.ok(base.dads[0].live.some((t) => tried.has(t)), 'the dads walk where that wire would go');
  assert.ok(p.dads[0].runs.some((run) => run.some((t) => !base.dads[0].live.includes(t))), 'if it were stocked they would not');
  assert.equal(dadRoutes(s, { x: 17, y: 7, d: S }), p, 'the same preview is cached');
  assert.equal(dadRoutes(s), base, 'and so is the plain one');
  // A preview the rules would refuse can cut the entrance off on the planned line: south of a
  // sprinkler beside it, with the sprinkler's own tile, wires both of its tiles in.
  place(s, 'sprinkler', 1, 7);
  assert.equal(dadRoutes(s, { x: 1, y: 7, d: S }).dads[0].cut, true);
  assert.equal(dadRoutes(s, { x: 1, y: 7, d: N }).dads[0].cut, false);
  assert.equal(s.grid, grid);
  assert.equal(b.wd, undefined);
  assert.notEqual(JSON.stringify(s), before); // (the sprinkler)
  // withWire copies the one building it changes.
  const c = withWire(s, at(s, 17, 7), E);
  assert.equal(c.grid[at(s, 17, 7)].wd, E);
  assert.equal(s.grid[at(s, 17, 7)].wd, undefined);
  assert.equal(c.grid[at(s, 9, 8)], s.grid[at(s, 9, 8)]);
});

test('the demo reinforces a crate to every level, and keeps its first sales event clean', () => {
  const s = createGame({ seed: 7 });
  addPlayer(s, 'Dave');
  if (s.phase === 'cards') { s.phase = 'build'; delete s.dealT; }
  assert.deepEqual(applyDemoLayout(s, 0), []);
  const levels = [4, 5, 6, 7, 8, 9, 10, 11].map((y) => s.grid[at(s, 6, y)].r);
  assert.deepEqual(levels, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(s.players[0].cash, 300, 'the demo pays for its own wire and crates');
  assert.ok(s.back.some((p) => p && p.k === 'bender'), 'a Barb Bender in The Back');
});

test("the tools' keys: Z and U, clear of the build keys, the view's keys and every other key", () => {
  assert.equal(WIRE_KEY, 'z');
  assert.equal(REINFORCE_KEY, 'u');
  assert.deepEqual(TOOL_KEYS, { remove: 'x', wire: 'z', reinforce: 'u' });
  const taken = new Set([...HOTKEYS, ...BACK_HOTKEYS, 'w', 'a', 's', 'd', 'p', 'r', 'b', 'f', 'h', 'x']);
  for (const k of [WIRE_KEY, REINFORCE_KEY]) assert.ok(!taken.has(k), k);
});

test("DEB's refusals for wire and crates, and her lines for wire at work", () => {
  assert.equal(nopeKey('blocked', { c: 'wire', x: 1, y: 1, d: 2 }), 'wireBlocked');
  assert.equal(nopeKey('kind', 'wire'), 'wireKind');
  assert.equal(nopeKey('kind', { c: 'reinforce' }), 'crateKind');
  assert.equal(nopeKey('max', { c: 'reinforce' }), 'crateMax');
  assert.equal(nopeKey('cash', { c: 'reinforce' }), 'cash');
  assert.equal(nopeKey('blocked', { c: 'place' }), 'blocked');
  assert.equal(nopeKey('max', { c: 'dropUp' }), 'max');
  assert.equal(nopeKey('empty', null), 'empty');
  assert.ok(NOPE.wireBlocked.length >= 4 && NOPE.wireBlocked.length <= 6);
  assert.ok(NOPE.wireKind.length >= 4 && NOPE.wireKind.length <= 6);
  assert.ok(NOPE.crateKind.length >= 3 && NOPE.crateMax.length >= 3);
  assert.equal(LINES.turned.length, 6);
  assert.ok(LINES.wireLive.length >= 3 && LINES.wireLive.length <= 4);

  // The first wire to go live in a game is said once, whichever way it went live.
  const s = game(7);
  const director = createDirector(() => 0);
  const said = (out) => out.filter((m) => m.t === 'say').map((m) => m.text);
  const live = LINES.wireLive.map(textOf);
  const isLive = (t) => live.some((l) => t === l.replace('{p}', 'Dave'));
  place(s, 'forklift', 12, 12);
  assert.ok(!said(director.idle(s)).some(isLive), 'no wire yet');
  wire(s, 12, 12, N);
  assert.ok(!said(director.handle([{ e: 'wire', x: 12, y: 12, d: N, by: 0, live: 0 }], s)).some(isLive), 'only planned');
  addStock(s.grid[at(s, 12, 12)], itemCode(5, 1), s);
  assert.equal(said(director.idle(s)).filter(isLive).length, 1, 'stock arrived: live');
  s.gridVer++;
  assert.ok(!said(director.idle(s)).some(isLive), 'once a game');
  // A dad turned away gets a line the first time.
  s.tick += 3000;
  const turned = said(director.handle([{ e: 'turned', i: at(s, 12, 12), t: at(s, 12, 11), x: 12.5, y: 11.5, id: 4 }], s));
  assert.ok(turned.some((t) => LINES.turned.map(textOf).some((l) => t === l.replace('{p}', 'Dave'))), turned.join(' | '));
});
