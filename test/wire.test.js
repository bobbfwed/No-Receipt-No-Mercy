// Razor Wire and dads (0.4, stage 4a), and reinforced Crate Stacks. Dads walk straight through every
// building; only the store's walls and live Razor Wire stop them. A security building may be given a
// wire direction (the `wire` command); its wire covers its own tiles and BACK.wireReach tiles beyond
// it that way, and works only while the building holds Razor Wire from The Back. A Crate Stack can be
// reinforced with cash (the `reinforce` command) to take more gym bro hits.
// docs/architecture.md, "Razor Wire and dads", is the contract. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canWire, canReinforce, step, queueTrainingWave, getDist, getDadDist, getDadPlanDist, getField,
  wireTiles, wireLive, wireMap, carriesWire, dadRoute, reinforceCost, statsOf, rebuildDeal, addStock, itemCode, give, unitsIn,
  BUILD, BACK, TUNE, TICK_HZ, ST, GHOST, SMASH, UNREACHABLE, CARDS,
} from '../src/sim/index.js';
import { stealStock } from '../src/sim/back.js';
import { checksum } from '../src/net/session.js';

// The original small map, 30 tiles by 16: entrance on the left at (0, 7) and (0, 8), tills down the
// right-hand wall at x 29, rows 5 to 10, pillars at (8, 4), (20, 4), (8, 11) and (20, 11).
const W = 30;
const at = (x, y) => y * W + x;
const xy = (i) => [i % W, (i / W) | 0];
const sorted = (tiles) => [...tiles].sort((a, b) => a - b);
const tilesAt = (list) => sorted(list.map(([x, y]) => at(x, y)));

/** A training game (no timer, cannot be lost; shoppers walk single file at their kind's exact pace). */
function stage(seed = 5) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}
const place = (s, k, x, y, d = 0, pid = 0) => applyCommand(s, pid, { c: 'place', k, x, y, d });
const wire = (s, x, y, d, pid = 0, ev = []) => applyCommand(s, pid, { c: 'wire', x, y, d }, ev);
/** Stocks the building on (x, y) with `units` units of Razor Wire of a tier, as if they came up its Dumbwaiter. */
function stock(s, x, y, tier = 4, units = 1) {
  const b = s.grid[at(x, y)];
  for (let n = 0; n < units; n++) addStock(b, itemCode(5, tier), s);
  return b;
}
function send(s, groups) {
  queueTrainingWave(s, groups);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
}
/** Steps until the wave ends (or a time limit), calling each(ev) every tick; returns all the events. */
function play(s, seconds, each = () => {}) {
  const all = [];
  for (let n = 0; n < seconds * TICK_HZ; n++) {
    const ev = step(s);
    all.push(...ev);
    each(ev);
    if (ev.some((e) => e.e === 'waveEnd')) break;
  }
  return all;
}
const dadsOn = (s, tiles) => s.shoppers.filter((m) => m.k === 'dad' && tiles.includes(at(m.x | 0, m.y | 0)));
/** Temporarily changes tuning numbers for one test. */
function tune(t, changes, obj = TUNE) {
  const old = {};
  for (const k of Object.keys(changes)) { old[k] = obj[k]; obj[k] = changes[k]; }
  t.after(() => Object.assign(obj, old));
}
/** A wall of Wet Floor Signs (cheap, and they block nobody) with wire south down column x, rows 1 to 14. */
function wireWall(s, x, upTo = 4) {
  const res = [];
  for (const y of [1, 5, 9, 13].slice(0, upTo)) {
    assert.ok(place(s, 'wetfloor', x, y).ok);
    res.push(wire(s, x, y, 1));
  }
  return res;
}

// ---- the numbers -------------------------------------------------------------------------------

test('the numbers: wire reaches 3 tiles; a unit turns 3, 6, 10, 15 dads; crates reinforce as their 0.3.04 durability did', () => {
  assert.equal(BACK.wireReach, 3);
  assert.deepEqual(BACK.wireTurns, [0, 3, 6, 10, 15]);
  assert.deepEqual(BUILD.crate.reinforce, { cost: 10, grow: 1.6, max: 8 });
  const prices = [];
  for (let r = 0; r <= 8; r++) prices.push(reinforceCost({ k: 'crate', r }));
  assert.deepEqual(prices, [10, 16, 26, 41, 66, 105, 168, 268, 0]);
  assert.equal(reinforceCost({ k: 'sprinkler' }), 0, 'only a Crate Stack');
  // Only buildings with Dumbwaiters carry wire.
  for (const k of Object.keys(BUILD)) assert.equal(carriesWire(k), !!BUILD[k].lift && !BUILD[k].back, k);
  assert.equal(carriesWire('crate'), false);
});

// ---- dads walk through buildings ---------------------------------------------------------------

test('dads walk straight through crates, security and big buildings; nobody else does', () => {
  const s = stage();
  // A wall down column 15 with a gap at the bottom: crates, a Barcode Laser standing up (rows 5-7),
  // a TV Salesman (rows 8-9, columns 15-16) and a Free Samples table.
  assert.ok(place(s, 'railgun', 15, 5, 1).ok);
  assert.ok(place(s, 'salesman', 15, 8).ok);
  assert.ok(place(s, 'samples', 15, 10).ok);
  for (const y of [1, 2, 3, 4, 11, 12, 13]) assert.ok(place(s, 'crate', 15, y).ok);
  const normal = getDist(s), dad = getDadDist(s), ghost = getField(s, GHOST);
  assert.deepEqual([...dad], [...ghost], 'with no wire, a dad\'s map is the walls-only map');
  for (const y of [3, 6, 8, 10]) {
    assert.equal(normal[at(15, y)], UNREACHABLE);
    assert.notEqual(dad[at(15, y)], UNREACHABLE);
  }
  // In play: dads stand inside each kind of building on their way; nobody else ever does.
  send(s, [{ k: 'dad', n: 12, gap: 0.5, at: 0 }, { k: 'clipper', n: 6, gap: 0.5, at: 0.25 }]);
  const inside = new Set();
  const ev = play(s, 90, () => {
    for (const m of s.shoppers) {
      const g = s.grid[at(m.x | 0, m.y | 0)];
      if (!g) continue;
      const b = g.part !== undefined ? s.grid[g.part] : g;
      if (!BUILD[b.k].blocks) continue;
      assert.equal(m.k, 'dad', `a ${m.k} inside a ${b.k}`);
      inside.add(b.k);
    }
  });
  assert.ok(inside.has('railgun') || inside.has('salesman'), `dads walked through a big building (${[...inside]})`);
  assert.ok(ev.some((e) => e.e === 'escape' && e.k === 'dad'));
});

test('without wire nothing changes for anyone but dads, and wire changes nothing for anyone but dads', () => {
  const s = stage();
  for (let y = 1; y <= 13; y++) assert.ok(place(s, 'crate', 12, y).ok);
  assert.ok(place(s, 'sprinkler', 5, 5).ok);
  assert.ok(place(s, 'wetfloor', 20, 6).ok);
  const before = [getDist(s), getField(s, SMASH), getField(s, GHOST)].map((f) => [...f]);
  assert.ok(wire(s, 5, 5, 1).ok);
  assert.ok(wire(s, 20, 6, 1).ok);
  stock(s, 5, 5);
  stock(s, 20, 6);
  assert.ok(wireLive(s.grid[at(5, 5)]) && wireLive(s.grid[at(20, 6)]));
  const after = [getDist(s), getField(s, SMASH), getField(s, GHOST)].map((f) => [...f]);
  assert.deepEqual(after, before, 'the ordinary, gym bro and runaway-child maps are untouched');
  assert.equal(getDadDist(s)[at(20, 7)], UNREACHABLE, 'only the dads\' map has the wire');
});

// ---- what a wire covers ------------------------------------------------------------------------

test('a one-tile building\'s wire: its tile and 3 more each way, stopping at walls, pillars and the map\'s edge', () => {
  const s = stage();
  assert.ok(place(s, 'sprinkler', 5, 6).ok);
  assert.deepEqual(sorted(wireTiles(s, 5, 6, 0)), tilesAt([[5, 6], [6, 6], [7, 6], [8, 6]]));
  assert.deepEqual(sorted(wireTiles(s, 5, 6, 1)), tilesAt([[5, 6], [5, 7], [5, 8], [5, 9]]));
  assert.deepEqual(sorted(wireTiles(s, 5, 6, 2)), tilesAt([[5, 6], [4, 6], [3, 6], [2, 6]]));
  assert.deepEqual(sorted(wireTiles(s, 5, 6, 3)), tilesAt([[5, 6], [5, 5], [5, 4], [5, 3]]));
  // Stopped by the store's wall: two tiles from the top wall it gets one.
  assert.ok(place(s, 'sprinkler', 2, 2).ok);
  assert.deepEqual(sorted(wireTiles(s, 2, 2, 3)), tilesAt([[2, 2], [2, 1]]));
  assert.deepEqual(sorted(wireTiles(s, 2, 2, 2)), tilesAt([[2, 2], [1, 2]]));
  // ...by a pillar, (8, 4)...
  assert.ok(place(s, 'sprinkler', 6, 4).ok);
  assert.deepEqual(sorted(wireTiles(s, 6, 4, 0)), tilesAt([[6, 4], [7, 4]]));
  // ...and by the edge of the map: a till is floor, beyond it there is nothing.
  assert.ok(place(s, 'sprinkler', 27, 6).ok);
  assert.deepEqual(sorted(wireTiles(s, 27, 6, 0)), tilesAt([[27, 6], [28, 6], [29, 6]]));
  // No direction: just the building. Nothing that cannot carry wire: nothing at all.
  assert.deepEqual(wireTiles(s, 5, 6), [at(5, 6)]);
  assert.ok(place(s, 'crate', 12, 12).ok);
  assert.deepEqual(wireTiles(s, 12, 12, 0), []);
  assert.deepEqual(wireTiles(s, 14, 14, 0), [], 'nothing there');
});

test('a Barcode Laser\'s wire, lying and standing, and a TV Salesman\'s: as wide as the side it runs from', () => {
  const s = stage();
  // Lying east-west on (10..12, 2).
  assert.ok(place(s, 'railgun', 10, 2, 0).ok);
  assert.deepEqual(sorted(wireTiles(s, 11, 2, 1)), tilesAt([[10, 2], [11, 2], [12, 2], [10, 3], [11, 3], [12, 3], [10, 4], [11, 4], [12, 4], [10, 5], [11, 5], [12, 5]]));
  assert.deepEqual(sorted(wireTiles(s, 10, 2, 0)), tilesAt([[10, 2], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2]]));
  assert.deepEqual(sorted(wireTiles(s, 12, 2, 3)), tilesAt([[10, 2], [11, 2], [12, 2], [10, 1], [11, 1], [12, 1]]), 'the wall stops each line');
  // Standing up on (4, 6..8).
  assert.ok(place(s, 'railgun', 4, 6, 1).ok);
  assert.deepEqual(sorted(wireTiles(s, 4, 8, 2)), tilesAt([[4, 6], [4, 7], [4, 8], [3, 6], [2, 6], [1, 6], [3, 7], [2, 7], [1, 7], [3, 8], [2, 8], [1, 8]]));
  assert.deepEqual(sorted(wireTiles(s, 4, 7, 1)), tilesAt([[4, 6], [4, 7], [4, 8], [4, 9], [4, 10], [4, 11]]));
  // The TV Salesman, 2 x 2 on (20..21, 8..9): south, the pillar at (20, 11) stops one line short.
  assert.ok(place(s, 'salesman', 20, 8).ok);
  assert.deepEqual(sorted(wireTiles(s, 21, 9, 1)), tilesAt([[20, 8], [21, 8], [20, 9], [21, 9], [20, 10], [21, 10], [21, 11], [21, 12]]));
  assert.deepEqual(sorted(wireTiles(s, 20, 8, 2)), tilesAt([[20, 8], [21, 8], [20, 9], [21, 9], [19, 8], [18, 8], [17, 8], [19, 9], [18, 9], [17, 9]]));
});

// ---- planned and live --------------------------------------------------------------------------

test('planned wire does nothing; live wire turns dads away over open floor, and nobody else notices it', () => {
  const s = stage();
  // A Wet Floor Sign (blocks nobody) at (14, 5) with wire south over (14, 5..8): across the dads' way.
  assert.ok(place(s, 'wetfloor', 14, 5).ok);
  assert.ok(wire(s, 14, 5, 1).ok);
  const covered = tilesAt([[14, 5], [14, 6], [14, 7], [14, 8]]);
  assert.equal(wireLive(s.grid[at(14, 5)]), false);
  assert.deepEqual([...getDadDist(s)], [...getField(s, GHOST)], 'planned: the dads\' map is as if it were not there');
  for (const t of covered) assert.equal(getDadPlanDist(s)[t], UNREACHABLE, 'the planned map has it');
  // Live from the start.
  stock(s, 14, 5, 4, 6);
  assert.equal(wireLive(s.grid[at(14, 5)]), true);
  for (const t of covered) {
    assert.equal(getDadDist(s)[t], UNREACHABLE);
    assert.equal(wireMap(s).live[t], at(14, 5));
  }
  assert.ok(getDadDist(s)[at(0, 7)] > getField(s, GHOST)[at(0, 7)], 'the way round is longer');
  send(s, [{ k: 'dad', n: 6, gap: 0.6, at: 0 }, { k: 'clipper', n: 6, gap: 0.6, at: 0.3 }]);
  let clipperOnWire = false;
  const ev = play(s, 60, () => {
    assert.equal(dadsOn(s, covered).length, 0, 'no dad steps under live wire');
    if (s.shoppers.some((m) => m.k === 'clipper' && covered.includes(at(m.x | 0, m.y | 0)))) clipperOnWire = true;
  });
  assert.ok(clipperOnWire, 'a Coupon Clipper walked across it');
  assert.equal(ev.filter((e) => e.e === 'escape' && e.k === 'dad').length, 6, 'the dads went round it');
});

// ---- the wire command --------------------------------------------------------------------------

test('the wire command: set, change, clear, with an event; anyone in the store may, free', () => {
  const s = stage();
  addPlayer(s, 'Gary');
  assert.ok(place(s, 'sprinkler', 5, 5).ok);
  const cash = s.players[1].cash, v = s.gridVer, ev = [];
  assert.deepEqual(wire(s, 5, 5, 0, 1, ev), { ok: true }, 'Gary may wire Dave\'s sprinkler');
  assert.equal(s.grid[at(5, 5)].wd, 0);
  assert.ok(s.gridVer > v);
  assert.equal(s.players[1].cash, cash, 'free');
  assert.deepEqual(ev, [{ e: 'wire', x: 5, y: 5, d: 0, by: 1, live: 0 }]);
  stock(s, 5, 5);
  const ev2 = [];
  assert.ok(wire(s, 5, 5, 3, 0, ev2).ok);
  assert.equal(s.grid[at(5, 5)].wd, 3);
  assert.equal(ev2[0].live, 1, 'stocked: live at once');
  assert.equal(getDadDist(s)[at(5, 3)], UNREACHABLE);
  // The same again, or clearing nothing, is a harmless yes with no event.
  const ev3 = [];
  assert.ok(wire(s, 5, 5, 3, 0, ev3).ok);
  assert.equal(ev3.length, 0);
  assert.ok(wire(s, 5, 5, -1, 0, ev3).ok);
  assert.equal(s.grid[at(5, 5)].wd, undefined, 'cleared');
  assert.equal(ev3[0].d, -1);
  assert.notEqual(getDadDist(s)[at(5, 3)], UNREACHABLE);
  assert.ok(wire(s, 5, 5, -1, 0, ev3).ok);
  assert.equal(ev3.length, 1);
  // Any tile of a big building.
  assert.ok(place(s, 'salesman', 20, 8).ok);
  assert.ok(wire(s, 21, 9, 2).ok);
  assert.equal(s.grid[at(20, 8)].wd, 2);
});

test('the wire command\'s refusals', () => {
  const s = stage();
  assert.ok(place(s, 'crate', 3, 3).ok);
  assert.ok(place(s, 'sprinkler', 5, 5).ok);
  assert.equal(wire(s, 3, 3, 0).why, 'kind', 'a Crate Stack cannot carry wire');
  assert.equal(wire(s, 6, 6, 0).why, 'empty');
  assert.equal(wire(s, -1, 6, 0).why, 'bounds');
  assert.equal(wire(s, 5.5, 5, 0).why, 'bounds');
  assert.equal(wire(s, '5', 5, 0).why, 'bounds');
  for (const d of [4, -2, 1.5, '1', null, undefined, '__proto__']) assert.equal(wire(s, 5, 5, d).why, 'bad', `d ${d}`);
  assert.equal(canWire(s, 7, 5, 5, 0), 'bad', 'no such player');
  s.pause = { by: 0 };
  assert.equal(wire(s, 5, 5, 0).why, 'paused');
  delete s.pause;
  s.players[0].side = 'office';
  assert.equal(wire(s, 5, 5, 0).why, 'office');
  s.players[0].side = 'store';
  s.phase = 'won';
  assert.equal(wire(s, 5, 5, 0).why, 'over');
  s.phase = 'build';
  assert.equal(s.grid[at(5, 5)].wd, undefined, 'nothing changed');
});

test('a wire may not cut an entrance off: one building\'s plan, and only the combination of several', () => {
  const s = stage();
  // One building: a sign by the entrance with wire west would cover the entrance tile itself.
  assert.ok(place(s, 'wetfloor', 1, 7).ok);
  assert.equal(canWire(s, 0, 1, 7, 2), 'blocked');
  assert.equal(wire(s, 1, 7, 2).why, 'blocked');
  assert.equal(s.grid[at(1, 7)].wd, undefined);
  assert.equal(canWire(s, 0, 1, 7, 0), null, 'east is fine');
  // Several: four signs down column 14, each with wire south, between them cover rows 1 to 14.
  // None is stocked: the check counts planned wire.
  const res = wireWall(s, 14);
  assert.deepEqual(res.map((r) => r.ok), [true, true, true, false]);
  assert.equal(res[3].why, 'blocked');
  assert.equal(s.grid[at(14, 13)].wd, undefined);
  for (const y of [1, 5, 9]) assert.equal(wireLive(s.grid[at(14, y)]), false, 'none of them is live');
  // Turning one of the others away from the column leaves a hole, and the last may then go in.
  assert.ok(wire(s, 14, 5, 0).ok);
  assert.ok(wire(s, 14, 13, 1).ok);
  // And now the turned one may not come back.
  assert.equal(wire(s, 14, 5, 1).why, 'blocked');
  // The live map is never cut: dads still have a way with everything stocked.
  for (const y of [1, 5, 9, 13]) stock(s, 14, y);
  assert.notEqual(getDadDist(s)[at(0, 7)], UNREACHABLE);
  assert.notEqual(getDadPlanDist(s)[at(0, 7)], UNREACHABLE);
});

test('the Car Park: a wire may not cut one bank of tills off from the other', () => {
  const s = createGame({ seed: 3, training: true, map: { design: 'carpark', size: 'xs' } });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  const w = s.w, tile = (x, y) => y * w + x;
  // The bottom bank is (21..24, 15). Signs above it with wire south cover a till each.
  assert.equal(s.tiles[tile(21, 15)], 'T');
  const res = [];
  for (const x of [21, 22, 23, 24]) {
    assert.ok(place(s, 'wetfloor', x, 14).ok);
    res.push(applyCommand(s, 0, { c: 'wire', x, y: 14, d: 1 }));
  }
  assert.deepEqual(res.map((r) => r.ok), [true, true, true, false], 'the last till of the bank must stay open');
  assert.equal(res[3].why, 'blocked');
});

// ---- going live and dead ------------------------------------------------------------------------

test('a wire goes live when Razor Wire comes up its Dumbwaiter, and dead when the last is used, stolen, or the building goes', () => {
  const s = stage();
  assert.ok(place(s, 'wetfloor', 14, 5).ok);
  assert.ok(wire(s, 14, 5, 1).ok);
  const t = at(14, 7);
  // Arriving through the Dumbwaiter (give, as a belt or an intern hands it over).
  let v = s.gridVer;
  assert.equal(s.back[at(14, 5)].k, 'lift');
  assert.ok(give(s, at(14, 5), itemCode(5, 1), 0));
  assert.ok(s.gridVer > v, 'live: gridVer moved on');
  assert.equal(getDadDist(s)[t], UNREACHABLE);
  // A second unit of a live wire changes nothing on the map.
  v = s.gridVer;
  assert.ok(give(s, at(14, 5), itemCode(5, 1), 0));
  assert.equal(s.gridVer, v);
  // Stolen: the last unit taken.
  const b = s.grid[at(14, 5)], ev = [];
  stealStock(s, b, at(14, 5), false, ev);
  assert.equal(s.gridVer, v, 'one unit left: still live');
  stealStock(s, b, at(14, 5), false, ev);
  assert.ok(s.gridVer > v);
  assert.deepEqual(ev, [{ e: 'stockOut', i: at(14, 5), t: 'wire' }]);
  assert.notEqual(getDadDist(s)[t], UNREACHABLE, 'dead again');
  // Removed: the wire goes with it.
  stock(s, 14, 5);
  assert.equal(getDadDist(s)[t], UNREACHABLE);
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 14, y: 5 }).ok);
  assert.notEqual(getDadDist(s)[t], UNREACHABLE);
  assert.equal(wireMap(s).plan[t], 0);
});

test('a wrecked building\'s wire goes; its rubble remembers it and a rebuild brings it back if it still may', (t) => {
  // A gym bro who hits whatever is beside him, every time.
  tune(t, { smashOther: 1, smashEvery: 0.3 });
  const s = stage();
  assert.ok(place(s, 'wetfloor', 4, 7).ok);
  assert.ok(wire(s, 4, 7, 3).ok);
  stock(s, 4, 7);
  assert.equal(getDadDist(s)[at(4, 6)], UNREACHABLE);
  send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  const ev = play(s, 60, () => { for (const m of s.shoppers) m.hp = m.mhp = 1e9; });
  assert.ok(ev.some((e) => e.e === 'smash' && e.i === at(4, 7) && e.left === 0), 'he wrecked the sign');
  const r = s.rubble.find((x) => x.i === at(4, 7));
  assert.equal(r.wd, 3);
  assert.notEqual(getDadDist(s)[at(4, 6)], UNREACHABLE, 'its wire went with it');
  assert.equal(wireMap(s).plan[at(4, 6)], 0);
  // Rebuilt: the plan comes back (not the stock).
  assert.ok(applyCommand(s, 0, { c: 'rebuild' }).ok);
  assert.equal(s.grid[at(4, 7)].wd, 3);
  assert.equal(wireLive(s.grid[at(4, 7)]), false);
  assert.equal(getDadPlanDist(s)[at(4, 6)], UNREACHABLE);
});

test('a rebuild brings a wire back only if the wire command would allow it then', () => {
  for (const how of ['rebuild', 'place']) {
    const s = stage();
    // Three signs down column 14 cover rows 1 to 12; a fourth's wire covered rows 13 and 14.
    wireWall(s, 14, 3);
    s.rubble.push({ i: at(14, 13), k: 'wetfloor', d: 0, o: 0, wd: 1 });
    const cmd = how === 'rebuild' ? { c: 'rebuild' } : { c: 'place', k: 'wetfloor', x: 14, y: 13, d: 0 };
    assert.ok(applyCommand(s, 0, cmd).ok, how);
    assert.equal(s.grid[at(14, 13)].k, 'wetfloor');
    assert.equal(s.grid[at(14, 13)].wd, undefined, `${how}: it would cut the store in two, so it comes back without`);
    assert.notEqual(getDadPlanDist(s)[at(0, 7)], UNREACHABLE);
    // With a hole left elsewhere it comes back with its wire.
    const s2 = stage();
    wireWall(s2, 14, 2);
    s2.rubble.push({ i: at(14, 13), k: 'wetfloor', d: 0, o: 0, wd: 1 });
    assert.ok(applyCommand(s2, 0, cmd).ok);
    assert.equal(s2.grid[at(14, 13)].wd, 1, `${how}: allowed, so it is back`);
  }
});

test('turning a wired Barcode Laser is checked like the wire command, and keeps what its wire covers', () => {
  const s = stage();
  assert.ok(place(s, 'railgun', 10, 6, 1).ok);
  assert.ok(wire(s, 10, 6, 0).ok);
  const before = sorted(wireTiles(s, 10, 6)), v = s.gridVer;
  assert.ok(applyCommand(s, 0, { c: 'rotate', x: 10, y: 7 }).ok);
  const b = s.grid[at(10, 6)];
  assert.equal(b.d, 3, 'end for end');
  assert.equal(b.wd, 0, 'the wire runs the same way across the store');
  assert.deepEqual(sorted(wireTiles(s, 10, 6)), before, 'over the same tiles, so nothing to refuse');
  assert.equal(s.gridVer, v);
});

// ---- use: dads walk into the wire ----------------------------------------------------------------
// A dad heads the way he would with no wire at all, bumps into live wire (that is when the wire is
// charged), and only then goes round, testing each stretch of fence he walks along. Each wire
// charges a dad once; any change to how wire is laid makes him forget, and pay again.

/** The uses charged (turned events that are not free). */
const charged = (ev) => ev.filter((e) => e.e === 'turned' && !e.free);
/** Charges by dad: id -> the anchors that charged him, in order. */
function chargesBy(ev) {
  const by = new Map();
  for (const e of charged(ev)) by.set(e.id, [...(by.get(e.id) || []), e.i]);
  return by;
}
/** Wire carriers: Wet Floor Signs (they block nobody else) with wire, stocked with Platinum to the brim. */
function carriers(s, list, units = 6) {
  for (const [x, y, d] of list) {
    assert.ok(place(s, 'wetfloor', x, y).ok, `sign at ${x},${y}`);
    assert.ok(wire(s, x, y, d).ok, `wire at ${x},${y}`);
    stock(s, x, y, 4, units);
  }
}
/** Follows every dad's tiles while a game plays: id -> tiles in order, one entry per tile. */
function trackDads(s) {
  const paths = new Map();
  return {
    paths,
    tick() {
      for (const m of s.shoppers) {
        if (m.k !== 'dad') continue;
        const t = at(m.x | 0, m.y | 0), p = paths.get(m.id) || [];
        if (p[p.length - 1] !== t) p.push(t);
        paths.set(m.id, p);
      }
    },
  };
}

/**
 * A sign at (2, 5) with wire south over (2, 5..8), right in front of the entrance (0, 7..8): every
 * dad who comes in steps onto (1, 7) or (1, 8), would go straight on into the wire, and bumps.
 */
function frontWire(s, tier, units = 1) {
  assert.ok(place(s, 'wetfloor', 2, 5).ok);
  assert.ok(wire(s, 2, 5, 1).ok);
  return stock(s, 2, 5, tier, units);
}

test('a dad bumps into the wire tile he would have walked onto, and the turned event is there', () => {
  const s = stage();
  frontWire(s, 4, 6);
  send(s, [{ k: 'dad', n: 1, gap: 1, at: 0 }]);
  let where = -1, first = null;
  const ev = play(s, 60, (e) => {
    const t = e.find((x) => x.e === 'turned');
    if (t && !first) { first = t; where = at(s.shoppers[0].x | 0, s.shoppers[0].y | 0); }
  });
  assert.ok(first, 'he was turned');
  assert.ok([at(2, 7), at(2, 8)].includes(first.t), `at the wire in his way (${xy(first.t)})`);
  assert.equal(where, first.t - 1, 'from the tile before it');
  assert.deepEqual([first.x, first.y], [(first.t % W) + 0.5, ((first.t / W) | 0) + 0.5]);
  assert.equal(first.i, at(2, 5));
  assert.equal(first.free, undefined);
  assert.equal(charged(ev).length, 1, 'charged once though he walked the length of it');
});

test('dads in single file: exactly wireTurns of them are turned away by a unit; the next walks through', () => {
  for (const tier of [1, 2, 3, 4]) {
    const s = stage();
    const b = frontWire(s, tier);
    const turns = BACK.wireTurns[tier];
    const under = tilesAt([[2, 5], [2, 6], [2, 7], [2, 8]]);
    send(s, [{ k: 'dad', n: turns + 3, gap: 0.5, at: 0 }]);
    let dead = false, through = 0;
    const ev = play(s, 120, (e) => {
      if (e.some((x) => x.e === 'stockOut' && x.t === 'wire')) dead = true;
      const on = dadsOn(s, under).length;
      if (!dead) assert.equal(on, 0, `tier ${tier}: nobody steps under the live wire`);
      through = Math.max(through, on);
    });
    const paid = charged(ev);
    assert.equal(paid.length, turns, `tier ${tier}: one use a dad, ${turns} dads a unit`);
    assert.equal(new Set(paid.map((e) => e.id)).size, turns, 'each a different dad');
    assert.ok(paid.every((e) => e.i === at(2, 5)));
    assert.ok(dead, `tier ${tier}: used up`);
    assert.equal(b.s, undefined);
    assert.ok(through > 0, `tier ${tier}: dads walk through once it is gone`);
    assert.equal(ev.filter((e) => e.e === 'escape').length, turns + 3);
  }
});

test('the reviewer\'s case A: every dad a fence makes walk further pays the wire he bumps, once; none goes round free', () => {
  // Three carriers down column 15 with wire south: rows 3-14 fenced off, a gap at rows 1-2. Every dad
  // comes in on row 7 or 8 and walks east into the middle one's wire.
  const s = stage();
  carriers(s, [[15, 3, 1], [15, 7, 1], [15, 11, 1]]);
  const n = 40;
  assert.ok(getDadDist(s)[at(0, 7)] > getField(s, GHOST)[at(0, 7)], 'the fence lengthens their way');
  send(s, [{ k: 'dad', n, gap: 0.5, at: 0 }]);
  const ev = play(s, 150);
  assert.equal(ev.filter((e) => e.e === 'escape' || e.e === 'left').length, n);
  const by = chargesBy(ev);
  assert.equal(by.size, n, 'every one of them paid');
  for (const [id, list] of by) {
    assert.equal(list[0], at(15, 7), `dad ${id} paid the wire he bumped first`);
    assert.equal(list.filter((a) => a === at(15, 7)).length, 1, `dad ${id}: once`);
    assert.equal(new Set(list).size, list.length, `dad ${id}: no wire twice`);
  }
});

test('the reviewer\'s case B: where wires overlap and their tiles alternate owners, nobody pays one twice', () => {
  // Column 15 is fenced from row 2 to 14 (a gap at row 1). Its tiles belong, top to bottom, to the
  // signs at (15,2) [rows 2-5], (15,9) [row 6], (15,7) [row 7: its own wire runs east, and its
  // anchor is the lower], (15,9) again [rows 8-9], (15,10) [10-13] and (15,14) [14]. A dad going round
  // up column 14 walks along (15,9)'s wire, then (15,7)'s, then (15,9)'s again.
  const s = stage();
  carriers(s, [[15, 2, 1], [15, 9, 3], [15, 7, 0], [15, 10, 1], [15, 14, 3]]);
  const live = wireMap(s).live;
  assert.deepEqual([6, 7, 8].map((y) => live[at(15, y)]), [at(15, 9), at(15, 7), at(15, 9)], 'the owners alternate');
  const n = 20;
  send(s, [{ k: 'dad', n, gap: 0.5, at: 0 }]);
  const ev = play(s, 150);
  const by = chargesBy(ev);
  assert.equal(by.size, n);
  for (const [id, list] of by) {
    assert.equal(new Set(list).size, list.length, `dad ${id} paid one wire twice: ${list.map(xy).join(' ')}`);
    assert.ok(list.includes(at(15, 9)) && list.includes(at(15, 7)), `dad ${id} paid both wires he walked along`);
  }
});

test('a fence of three side by side: a dad pays the one he bumps and each further one he walks along, once each', () => {
  // Carriers at (15, 2), (15, 6) and (15, 10), wire south: rows 2-13 fenced, gaps at rows 1 and 14.
  const s = stage();
  carriers(s, [[15, 2, 1], [15, 6, 1], [15, 10, 1]]);
  const [top, mid, low] = [at(15, 2), at(15, 6), at(15, 10)];
  const n = 16;
  send(s, [{ k: 'dad', n, gap: 0.5, at: 0 }]);
  const track = trackDads(s);
  const ev = play(s, 150, () => track.tick());
  const by = chargesBy(ev);
  assert.equal(by.size, n);
  for (const [id, list] of by) {
    const rows = track.paths.get(id).filter((t) => t % W === 14).map((t) => (t / W) | 0);
    const up = Math.min(...rows) < 6;
    assert.deepEqual(list, [mid, up ? top : low], `dad ${id} went ${up ? 'up' : 'down'}: ${list.map(xy).join(' ')}`);
  }
});

test('changing how any wire is laid makes dads forget, and the wire in their way charges them again', () => {
  const s = stage();
  frontWire(s, 4, 6);
  // A second sign far off, whose wire is flipped while the dad stands at the first.
  assert.ok(place(s, 'wetfloor', 20, 2).ok);
  assert.ok(wire(s, 20, 2, 0).ok);
  const gen = s.wireGen | 0;
  send(s, [{ k: 'dad', n: 1, gap: 1, at: 0 }]);
  let flipped = false;
  const ev = play(s, 60, (e) => {
    const m = s.shoppers[0];
    if (!flipped && m && e.some((x) => x.e === 'turned') && (m.x | 0) === 1) {
      assert.deepEqual(m.rw, [at(2, 5)]);
      assert.ok(wire(s, 20, 2, 3).ok);
      flipped = true;
    }
  });
  assert.ok(flipped);
  assert.equal(s.wireGen, gen + 1);
  const paid = charged(ev);
  assert.equal(paid.length, 2, 'he paid the same wire again after the change');
  assert.ok(paid.every((e) => e.i === at(2, 5)));
  // Removing a wired building, and wrecking or rebuilding one, count as changes too.
  const v = s.wireGen;
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 20, y: 2 }).ok);
  assert.equal(s.wireGen, v + 1);
});

test('a dad caught under a wire when it goes live climbs out and carries on; a pocket shut in by wire costs nothing to leave', () => {
  const s = stage();
  assert.ok(place(s, 'wetfloor', 14, 5).ok);
  assert.ok(wire(s, 14, 5, 1).ok);
  const under = tilesAt([[14, 5], [14, 6], [14, 7], [14, 8]]);
  send(s, [{ k: 'dad', n: 1, gap: 1, at: 0 }]);
  let caught = false;
  const ev = play(s, 60, () => {
    if (!caught && dadsOn(s, under).length) {
      stock(s, 14, 5);
      caught = true;
      assert.equal(getDadDist(s)[at(s.shoppers[0].x | 0, s.shoppers[0].y | 0)], UNREACHABLE, 'he stands where no dad may');
    }
  });
  assert.ok(caught);
  assert.equal(ev.filter((e) => e.e === 'escape').length, 1, 'he got out and reached a till');
  // A pocket of open floor: a ring of live wire round (13..14, 6..8), with a dad inside it.
  const r = stage();
  carriers(r, [[12, 5, 0], [15, 6, 1], [12, 9, 0], [12, 6, 1]]);
  for (const t of [at(13, 7), at(14, 6), at(14, 8)]) {
    assert.equal(wireMap(r).live[t], -1, 'open floor');
    assert.equal(getDadDist(r)[t], UNREACHABLE, 'with no way out on his map');
  }
  const before = [[12, 5], [15, 6], [12, 9], [12, 6]].map(([x, y]) => r.grid[at(x, y)].s.wire[1]);
  r.shoppers.push({ id: 99, k: 'dad', x: 13.5, y: 7.5, vx: 0, vy: 0, hp: 1e6, mhp: 1e6, st: ST.WALK, t: 0, cd: 0, ox: 0, oy: 0, lt: -1 });
  const all = [];
  let out = false;
  for (let n = 0; n < 30 * TICK_HZ && !out; n++) { const e = step(r); all.push(...e); out = e.some((x) => x.e === 'escape'); }
  assert.ok(out, 'he climbed out and reached a till');
  assert.equal(all.filter((e) => e.e === 'turned').length, 0, 'leaving the pocket turned him nowhere');
  assert.deepEqual([[12, 5], [15, 6], [12, 9], [12, 6]].map(([x, y]) => r.grid[at(x, y)].s.wire[1]), before, 'and used no wire');
});

test('dadRoute traces the way a dad walks: the same tiles as a dad with the first-choice tie-break', () => {
  const s = stage();
  carriers(s, [[15, 3, 1], [15, 7, 1], [15, 11, 1], [6, 9, 2]]);
  // Plain arithmetic first: no wire, straight to a till; the wire's version goes up and over.
  const plain = stage();
  assert.equal(dadRoute(plain, at(0, 7)).length, 30, 'straight across: 29 steps');
  const route = dadRoute(s, at(0, 7));
  assert.equal(route[0], at(0, 7));
  assert.equal(plain.tiles[route[route.length - 1]], 'T');
  assert.ok(route.includes(at(14, 7)), 'it walks up to the fence before going round');
  assert.ok(!route.some((t) => wireMap(s).live[t] >= 0), 'never under live wire');
  assert.equal(dadRoute(s, at(0, 7)), route, 'cached');
  // Dads whose ids are a multiple of 4 break ties the same way.
  send(s, [{ k: 'dad', n: 16, gap: 0.6, at: 0 }]);
  const track = trackDads(s);
  play(s, 120, () => track.tick());
  let compared = 0;
  for (const [id, path] of track.paths) {
    if (id % 4) continue;
    assert.deepEqual(path.map(xy), dadRoute(s, path[0]).map(xy), `dad ${id}`);
    compared++;
  }
  assert.ok(compared >= 3, `${compared} dads compared`);
  // "If wired": the planned route of an unstocked layout is the live route of the same layout stocked.
  const p = stage();
  for (const [x, y, d] of [[15, 3, 1], [15, 7, 1], [15, 11, 1], [6, 9, 2]]) { assert.ok(place(p, 'wetfloor', x, y).ok); assert.ok(wire(p, x, y, d).ok); }
  assert.deepEqual(dadRoute(p, at(0, 7)), dadRoute(plain, at(0, 7)), 'unstocked: dads walk straight');
  assert.deepEqual(dadRoute(p, at(0, 7), true), dadRoute(s, at(0, 7)), 'planned: as if stocked');
});

test('no dad stalls or doubles back: a few hundred dads through random live wire, every step makes progress', () => {
  let seed = 12345;
  const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
  let dadsSeen = 0, bumps = 0, wentRound = 0;
  for (let layout = 0; layout < 4; layout++) {
    const s = stage(layout + 1);
    const signs = [];
    for (let k = 0; k < 14; k++) {
      const x = 3 + rnd(24), y = 1 + rnd(14);
      if (place(s, 'wetfloor', x, y).ok && wire(s, x, y, rnd(4)).ok) signs.push(s.grid[at(x, y)]);
    }
    for (const b of signs) for (let u = 0; u < BACK.stockUnits; u++) addStock(b, itemCode(5, 4), s);
    const ver = s.gridVer;
    send(s, [{ k: 'dad', n: 80, gap: 0.4, at: 0 }, { k: 'dad', n: 20, gap: 0.4, at: 1, sup: 20 }]);
    const last = new Map(), still = new Map();
    // Progress, as a pair compared in order: climbing out (3, walls-only distance), walking toward
    // the wire (2, walls-only distance), going round (1, own distance), free (0, own distance).
    const measure = (m, t) => {
      const dad = getDadDist(s)[t], ghost = getField(s, GHOST)[t];
      if (dad === UNREACHABLE) return [3, ghost];
      if (dad <= ghost) return [0, dad];
      return m.dm ? [1, dad] : [2, ghost];
    };
    const ev = play(s, 150, () => {
      // (The wire is kept topped up, so the layout never changes while they walk.)
      for (const b of signs) if (unitsIn(b, 'wire', s) < BACK.stockUnits) addStock(b, itemCode(5, 4), s);
      assert.equal(s.gridVer, ver, 'the layout held still');
      for (const m of s.shoppers) {
        const t = at(m.x | 0, m.y | 0), was = last.get(m.id);
        if (!was || was.t !== t) {
          const now = measure(m, t);
          if (was) assert.ok(now[0] < was.m[0] || (now[0] === was.m[0] && now[1] < was.m[1]), `dad ${m.id} at ${xy(t)}: ${now} after ${was.m}`);
          else dadsSeen++;
          if (now[0] === 1) wentRound++;
          last.set(m.id, { t, m: now });
          still.set(m.id, 0);
        } else if (m.st === ST.WALK) {
          still.set(m.id, still.get(m.id) + 1);
          assert.ok(still.get(m.id) < 1.5 * TICK_HZ, `dad ${m.id} stalled at ${xy(t)}`);
        }
      }
    });
    assert.equal(s.shoppers.length, 0, `layout ${layout}: everyone left`);
    bumps += ev.filter((e) => e.e === 'turned').length;
  }
  assert.ok(dadsSeen >= 300, `${dadsSeen} dads`);
  assert.ok(bumps > 100 && wentRound > 100, `the wire was in their way: ${bumps} bumps, ${wentRound} steps going round`);
});

// ---- sync --------------------------------------------------------------------------------------

test('a copy of the game made mid-run plays on identically; the checksum sees wd, r and rw', () => {
  const s = stage(11);
  carriers(s, [[15, 3, 1], [15, 7, 1], [15, 11, 1]], 2);
  assert.ok(place(s, 'wetfloor', 20, 2).ok);
  assert.ok(wire(s, 20, 2, 0).ok);
  assert.ok(place(s, 'crate', 10, 3).ok);
  assert.ok(applyCommand(s, 0, { c: 'reinforce', x: 10, y: 3 }).ok);
  send(s, [{ k: 'dad', n: 10, gap: 0.5, at: 0 }, { k: 'clipper', n: 4, gap: 0.5, at: 0.2 }]);
  for (let n = 0; n < 3 * TICK_HZ; n++) step(s);
  // A change of wire mid-run, so dads carry wg and wireGen is in the state.
  assert.ok(wire(s, 20, 2, 3).ok);
  for (let n = 0; n < 6 * TICK_HZ; n++) step(s);
  assert.ok(s.shoppers.some((m) => Array.isArray(m.rw)), 'a dad has been charged');
  assert.ok(s.shoppers.some((m) => m.dm === 1), 'a dad is going round');
  assert.ok(s.shoppers.some((m) => m.wg === s.wireGen) && s.wireGen > 0);
  const copy = JSON.parse(JSON.stringify(s));
  assert.equal(checksum(copy), checksum(s));
  for (let n = 0; n < 20 * TICK_HZ; n++) { step(s); step(copy); }
  assert.equal(JSON.stringify(copy), JSON.stringify(s));
  // The checksum sees the new fields that src/net/session.js mixes in.
  const base = checksum(s);
  const a = JSON.parse(JSON.stringify(s));
  a.grid[at(15, 3)].wd = 0;
  assert.notEqual(checksum(a), base, 'wd');
  const c = JSON.parse(JSON.stringify(s));
  c.grid[at(10, 3)].r = 2;
  assert.notEqual(checksum(c), base, 'r');
  const d = JSON.parse(JSON.stringify(s));
  if (d.shoppers.length) {
    d.shoppers[0].rw = [12345];
    assert.notEqual(checksum(d), base, 'rw');
  }
});

// ---- reinforced Crate Stacks ---------------------------------------------------------------------

test('reinforce: each level costs as the price list says, counts as spent on the crate, up to the top level', () => {
  const s = stage();
  addPlayer(s, 'Gary');
  s.players[1].cash = 1e6;
  assert.ok(place(s, 'crate', 5, 5).ok);
  const b = s.grid[at(5, 5)];
  let paid = BUILD.crate.cost;
  for (let r = 0; r < 8; r++) {
    const cost = reinforceCost(b, s), cash = s.players[1].cash, spent = s.players[1].all.spent, ev = [];
    assert.equal(canReinforce(s, 1, 5, 5), null);
    assert.deepEqual(applyCommand(s, 1, { c: 'reinforce', x: 5, y: 5 }, ev), { ok: true }, 'Gary pays for Dave\'s crate');
    paid += cost;
    assert.equal(b.r, r + 1);
    assert.equal(b.c, paid, 'the money is part of what was spent on it');
    assert.equal(s.players[1].cash, cash - cost);
    assert.equal(s.players[1].all.spent, spent + cost);
    assert.deepEqual(ev, [{ e: 'reinforce', x: 5, y: 5, r: r + 1, by: 1, paid: cost }]);
    assert.equal(statsOf(b).hits, 2 + r);
  }
  assert.equal(paid, 10 + 10 + 16 + 26 + 41 + 66 + 105 + 168 + 268);
  assert.equal(applyCommand(s, 1, { c: 'reinforce', x: 5, y: 5 }).why, 'max');
  // Sold back: 75% of everything, to its owner. (Dave owns it.)
  const dave = s.players[0].cash;
  assert.ok(applyCommand(s, 1, { c: 'remove', x: 5, y: 5 }).ok);
  assert.equal(s.players[0].cash, dave + Math.floor(paid * TUNE.sellBack));
});

test('reinforce: the refusals', () => {
  const s = stage();
  assert.ok(place(s, 'crate', 5, 5).ok);
  assert.ok(place(s, 'sprinkler', 7, 7).ok);
  const r = (x, y, pid = 0) => applyCommand(s, pid, { c: 'reinforce', x, y }).why;
  assert.equal(r(7, 7), 'kind');
  assert.equal(r(6, 6), 'empty');
  assert.equal(r(-1, 5), 'bounds');
  assert.equal(r(5.5, 5), 'bounds');
  assert.equal(r('__proto__', 5), 'bounds');
  s.players[0].cash = 9;
  assert.equal(r(5, 5), 'cash');
  s.players[0].cash = 1e6;
  s.pause = { by: 0 };
  assert.equal(r(5, 5), 'paused');
  delete s.pause;
  s.players[0].side = 'office';
  assert.equal(r(5, 5), 'office');
  s.players[0].side = 'store';
  s.phase = 'lost';
  assert.equal(r(5, 5), 'over');
  assert.equal(s.grid[at(5, 5)].r, undefined);
});

test('reinforce: the cards that change a crate\'s price change the price of a level', () => {
  for (const card of ['rentacop', 'sweatshop', 'shrinkflation', 'staffdiscount']) {
    const s = createGame({ seed: 2, cards: [card] });
    addPlayer(s, 'Dave');
    s.players[0].cash = 1e6;
    assert.ok(place(s, 'crate', 5, 5).ok);
    const b = s.grid[at(5, 5)];
    const m = typeof CARDS[card].cost === 'number' ? CARDS[card].cost : CARDS[card].cost.security;
    assert.notEqual(m, 1);
    for (let r = 0; r < 3; r++) {
      assert.equal(reinforceCost(b, s), Math.max(1, Math.round(10 * 1.6 ** r * m)), `${card} level ${r + 1}`);
      assert.ok(applyCommand(s, 0, { c: 'reinforce', x: 5, y: 5 }).ok);
    }
  }
});

test('a reinforced crate takes a gym bro hit more a level, every sales event; its rubble keeps its levels', (t) => {
  // A gym bro who gets his breath back at once, so he hits the crate in his way again and again.
  tune(t, { smashWait: 0, smashMax: 4 });
  const s = stage();
  // A wall of crates down column 12 with a gap at the bottom; the one in his way, on row 7, has 2 levels.
  for (let y = 1; y <= 13; y++) assert.ok(place(s, 'crate', 12, y).ok);
  for (const y of [7, 8]) for (let n = 0; n < 2; n++) assert.ok(applyCommand(s, 0, { c: 'reinforce', x: 12, y }).ok);
  const paid = s.grid[at(12, 7)].c;
  assert.equal(paid, 10 + 10 + 16);
  const wall = [at(12, 7), at(12, 8)];
  const run = () => {
    send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
    const ev = play(s, 90, () => { for (const m of s.shoppers) m.hp = m.mhp = 1e9; });
    return ev.filter((e) => e.e === 'smash' && wall.includes(e.i));
  };
  const hits = run();
  assert.ok(hits.length >= 3, `he went at the reinforced crates (${hits.map((e) => e.left)})`);
  // The first crate he hits takes three hits: 2 left, 1 left, then down.
  const first = hits.filter((e) => e.i === hits[0].i).map((e) => e.left);
  assert.deepEqual(first.slice(0, 3), [2, 1, 0]);
  const r = s.rubble.find((x) => x.i === hits[0].i);
  assert.equal(r.r, 2, 'the rubble keeps its levels');
  assert.equal(r.c, paid);
  assert.equal(rebuildDeal(r, 1e6).pay, Math.floor(paid * TUNE.rebuildShare), 'a rebuild is half of everything spent');
  assert.ok(applyCommand(s, 0, { c: 'rebuild' }).ok);
  const back = s.grid[hits[0].i];
  assert.equal(back.r, 2);
  assert.equal(statsOf(back).hits, 3);
  // Every hit is forgotten when the event ends.
  for (const i of wall) assert.equal(s.grid[i].hit, undefined);
});
