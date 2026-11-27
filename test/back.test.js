// Tests for The Back (0.4): the floor under the shop, its belt engine and its first parts.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, migrateSave, makeDrops, overpassDirs,
  BACK, BUILD, TUNE, TICK_HZ, MAP_DESIGNS, MAP_SIZES, JUNK, itemCode, itemType, itemTier, dropTicks, newPart, wants, give, stepBack, canPlaceBack, canPlace,
} from '../src/sim/index.js';
import { checksum } from '../src/net/session.js';

const { sub: SUB, gap: GAP, step: STEP, end: END } = BACK;
const E = 0, S = 1, W = 2, N = 3;

/** A game on the bare 30 x 16 map with its pillars taken away (only the outer wall is left), and Dave. */
function blank() {
  const s = createGame();
  let t = '';
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) t += x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1 ? '#' : '.';
  s.tiles = t;
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}

/** Puts a part straight into The Back (no command, no price), as a test needs it. */
function lay(s, x, y, k, d = 0, o = 0) {
  const p = k === 'drop' ? { k: 'drop', d, t: dropTicks(0), lv: 0 } : newPart(k, o, d);
  s.back[y * s.w + x] = p;
  s.backVer++;
  return p;
}
/** A straight run of belts from (x0, y) to (x1, y), all facing d. */
function row(s, x0, x1, y, d) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) lay(s, x, y, 'conv', d); }
/** A straight run of belts from (x, y0) to (x, y1), all facing d. */
function col(s, x, y0, y1, d) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) lay(s, x, y, 'conv', d); }
const at = (s, x, y) => s.back[y * s.w + x];

/** Every item in The Back, hands included, as a sorted list of codes. */
function codes(s) {
  const out = [];
  for (const p of s.back) {
    if (!p) continue;
    for (const it of [p.it, p.a, p.b]) if (it) for (let k = 0; k < it.length; k += 2) out.push(it[k]);
    if (p.h) out.push(p.h);
  }
  return out.sort((a, b) => a - b);
}

/** Checks the gap on every lane, and across every straight join between two belts. */
function checkGaps(s) {
  for (let i = 0; i < s.back.length; i++) {
    const p = s.back[i];
    if (!p) continue;
    for (const it of [p.it, p.a, p.b]) {
      if (!it) continue;
      for (let k = 1; k < it.length; k += 2) {
        assert.ok(Number.isInteger(it[k]) && it[k] >= 0 && it[k] < SUB, `position ${it[k]} on tile ${i}`);
        if (k > 1) assert.ok(it[k - 2] - it[k] >= GAP, `gap ${it[k - 2] - it[k]} on tile ${i}`);
      }
    }
    if (p.k === 'conv' && p.it.length) {
      const x = (i % s.w) + [1, 0, -1, 0][p.d], y = ((i / s.w) | 0) + [0, 1, 0, -1][p.d];
      const q = s.back[y * s.w + x];
      if (q && q.k === 'conv' && q.d === p.d && q.it.length) {
        const across = SUB - p.it[1] + q.it[q.it.length - 1];
        assert.ok(across >= GAP, `gap ${across} across the join after tile ${i}`);
      }
    }
  }
}

/** Steps The Back n times, collecting its events. */
function run(s, n, ev = []) { for (let t = 0; t < n; t++) stepBack(s, ev); return ev; }
/** Steps The Back n times, putting `code` on tile (x, y) from behind (travelling d) whenever it fits. */
function feed(s, x, y, d, code, n, ev = [], check = false) {
  for (let t = 0; t < n; t++) {
    give(s, y * s.w + x, code, d, 0);
    stepBack(s, ev);
    if (check) checkGaps(s);
  }
  return ev;
}
/** Fills every belt tile from (x0, y) to (x1, y) with three items, front at END, as a held-up line. */
function fill(s, x0, x1, y, code = 11) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) at(s, x, y).it = [code, END, code, END - GAP, code, END - 2 * GAP];
}

// ---------------------------------------------------------------------------------------------

test('items: junk is 1, a supply is 10 * type + tier', () => {
  assert.equal(JUNK, 1);
  assert.equal(itemCode(2, 3), 23, 'Premium Rage Cola');
  assert.equal(itemCode(0, 0), JUNK);
  assert.deepEqual([itemType(23), itemTier(23)], [2, 3]);
  assert.deepEqual([itemType(JUNK), itemTier(JUNK)], [0, 0]);
  assert.equal(END, SUB - GAP / 2);
  assert.equal(BACK.step * TICK_HZ / BACK.sub, 2, 'two tiles a second');
});

test('a new game has an empty Back the size of its grid; the default map has no drops, a map has them', () => {
  const s = createGame();
  assert.equal(s.back.length, s.grid.length);
  assert.ok(s.back.every((p) => p === 0));
  assert.equal(s.backVer, 0);
  const m = createGame({ map: { design: 'warehouse', size: 's' } });
  const drops = m.back.filter((p) => p && p.k === 'drop');
  assert.equal(drops.length, 3);
  for (const p of drops) assert.ok(!('o' in p), 'owned by nobody');
  // A save from before The Back loads with an empty one.
  const old = JSON.parse(JSON.stringify(m));
  delete old.back; delete old.backVer;
  assert.equal(migrateSave(old), true);
  assert.equal(old.back.length, old.w * old.h);
  assert.ok(old.back.every((p) => p === 0));
  stepBack(old);
});

test('makeDrops: at least one Returns Drop on every design at every size, never on a wall, facing open floor', () => {
  for (const design of Object.keys(MAP_DESIGNS)) {
    for (const size of Object.keys(MAP_SIZES)) {
      const s = createGame({ map: { design, size } });
      const drops = makeDrops(s.w, s.h, s.tiles, s.doors, design);
      assert.ok(drops.length >= 1, `${design} ${size}`);
      for (const { i, d } of drops) {
        assert.notEqual(s.tiles[i], '#', `${design} ${size}: not on a wall`);
        assert.equal(s.zones[i], 'u', `${design} ${size}: where the Loading Bay was`);
        const x = (i % s.w) + [1, 0, -1, 0][d], y = ((i / s.w) | 0) + [0, 1, 0, -1][d];
        assert.notEqual(s.tiles[y * s.w + x], '#', `${design} ${size}: faces open floor`);
        assert.deepEqual(s.back[i], { k: 'drop', d, t: dropTicks(0), lv: 0 });
      }
      assert.equal(s.back.filter(Boolean).length, drops.length);
    }
  }
});

test('a line of belts carries junk from a Returns Drop to a Clearance Bin', () => {
  const s = blank();
  lay(s, 2, 5, 'drop', E);
  row(s, 3, 12, 5, E);
  lay(s, 13, 5, 'bin', 0);
  const cash = s.players[0].cash;
  run(s, 30 * TICK_HZ);
  // One junk every 1.5 s; ten tiles at two a second take five seconds, a little more at the end.
  const made = Math.floor(30 * TICK_HZ / dropTicks(0));
  assert.equal(codes(s).every((c) => c === JUNK), true);
  const onBelts = codes(s).length;
  assert.ok(onBelts >= 3 && onBelts <= 5, `${onBelts} on the way`);
  assert.equal(s.players[0].cash, cash, 'junk pays nothing');
  assert.ok(made - onBelts >= 15, 'the rest went into the bin');
});

test('a full line delivers six items a second, never closer than the gap, across joins and round corners', () => {
  // A snake: east along row 2, round a corner south, west along row 4, south again, east along row 6.
  const s = blank();
  row(s, 1, 20, 2, E);
  col(s, 21, 2, 3, S);
  row(s, 2, 21, 4, W);
  lay(s, 1, 4, 'conv', S); lay(s, 1, 5, 'conv', S);
  row(s, 1, 25, 6, E);
  lay(s, 26, 6, 'bin');
  const ev = feed(s, 1, 2, E, 14, 60 * TICK_HZ, [], true);
  // Count the last 30 seconds only, once the line is full.
  const late = [];
  feed(s, 1, 2, E, 14, 30 * TICK_HZ, late, true);
  assert.ok(ev.length > 0);
  assert.equal(late.length, 30 * STEP * TICK_HZ / GAP, '6 a second');
  assert.equal(late.length, 180);
  for (const e of late) assert.equal(e.v, BACK.binPay[4]);
});

test('the result does not depend on the order the tiles were placed in or on which way the line runs', () => {
  // The same layout built in two orders with the commands, and mirrored left to right.
  const build = (order, mirror) => {
    const s = blank();
    const X = (x) => (mirror ? s.w - 1 - x : x), D = (d) => (mirror && !(d & 1) ? (d + 2) & 3 : d);
    const parts = [];
    for (let x = 3; x <= 14; x++) parts.push(['conv', x, 5, E]);
    for (let y = 2; y <= 4; y++) parts.push(['conv', 9, y, S]); // a side feed onto the line
    for (let y = 5; y <= 9; y++) parts.push(['conv', 15, y, S]); // round a corner
    for (let x = 6; x <= 15; x++) parts.push(['conv', x, 10, W]);
    parts.push(['bin', 5, 10, 0]);
    if (order) parts.reverse();
    for (const [k, x, y, d] of parts) assert.equal(applyCommand(s, 0, { c: 'place', k, x: X(x), y, d: D(d), f: 1 }).ok, true);
    const pick = [];
    for (let t = 0; t < 40 * TICK_HZ; t++) {
      give(s, 5 * s.w + X(3), 11, D(E));
      give(s, 2 * s.w + X(9), 22, S);
      stepBack(s, pick);
      checkGaps(s);
    }
    // The items, tile by tile, written as if it were never mirrored.
    const out = [];
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const p = s.back[y * s.w + X(x)]; out.push(p ? (p.it || []).join(',') : ''); }
    return { out: out.join('|'), paid: pick.length, sum: pick.reduce((a, e) => a + e.v, 0) };
  };
  const a = build(false, false), b = build(true, false), c = build(false, true), d = build(true, true);
  assert.ok(a.paid > 100);
  assert.deepEqual(b, a, 'placed in the other order');
  assert.deepEqual(c, a, 'flowing west instead of east');
  assert.deepEqual(d, a);
});

test('a held-up line backs up to three items a tile and starts again all together', () => {
  const s = blank();
  row(s, 3, 10, 5, E); // the last belt faces the empty tile at 11: nothing takes from it
  feed(s, 3, 5, E, 11, 20 * TICK_HZ, [], true);
  for (let x = 3; x <= 10; x++) assert.deepEqual(at(s, x, 5).it, [11, END, 11, END - GAP, 11, END - 2 * GAP], `tile ${x}`);
  // Unblocked: the front item goes into the bin and every other item moves on in the same tick.
  lay(s, 11, 5, 'bin');
  const ev = run(s, 1);
  assert.equal(ev.length, 1);
  assert.deepEqual(at(s, 10, 5).it, [11, END - GAP + STEP, 11, END - 2 * GAP + STEP]);
  for (let x = 3; x <= 9; x++) assert.deepEqual(at(s, x, 5).it, [11, END + STEP, 11, END - GAP + STEP, 11, END - 2 * GAP + STEP], `tile ${x}`);
});

test('side-loading lands in the middle of a belt; belts facing each other hand nothing over', () => {
  const s = blank();
  row(s, 3, 10, 5, E);
  lay(s, 11, 5, 'bin');
  lay(s, 6, 4, 'conv', S); // feeds the line from the north side
  at(s, 6, 4).it = [22, END];
  run(s, 1);
  assert.deepEqual(at(s, 6, 4).it, []);
  assert.deepEqual(at(s, 6, 5).it, [22, SUB / 2]);
  // Not while an item is within the gap of the middle.
  at(s, 6, 4).it = [22, END];
  run(s, 1);
  assert.deepEqual(at(s, 6, 4).it, [22, END], 'the first is still too close');
  assert.equal(wants(s, 6 * 1 + 5 * s.w, 22, S), false);
  run(s, 4);
  assert.deepEqual(at(s, 6, 4).it, [], 'once it has moved the gap on, the next lands');
  // Head on: two belts facing each other.
  const t = blank();
  lay(t, 5, 5, 'conv', E); lay(t, 6, 5, 'conv', W);
  at(t, 5, 5).it = [11, 100];
  at(t, 6, 5).it = [12, 100];
  run(t, 60);
  assert.deepEqual(at(t, 5, 5).it, [11, END]);
  assert.deepEqual(at(t, 6, 5).it, [12, END]);
  assert.equal(wants(t, 5 * t.w + 6, 11, E), false, 'head on');
  assert.equal(wants(t, 5 * t.w + 6, 11, S), true, 'from the side');
});

test('Splitter: one in, two or three out, shared evenly; a blocked way is skipped', () => {
  const setup = (outs) => {
    const s = blank();
    row(s, 1, 6, 7, E);
    lay(s, 7, 7, 'split', E);
    const bins = {};
    if (outs.includes('front')) { row(s, 8, 10, 7, E); lay(s, 11, 7, 'bin'); bins.front = 7 * s.w + 11; }
    if (outs.includes('left')) { col(s, 7, 4, 6, N); lay(s, 7, 3, 'bin'); bins.left = 3 * s.w + 7; }
    if (outs.includes('right')) { col(s, 7, 8, 10, S); lay(s, 7, 11, 'bin'); bins.right = 11 * s.w + 7; }
    return { s, bins };
  };
  const tally = (ev, bins) => Object.fromEntries(Object.entries(bins).map(([k, i]) => [k, ev.filter((e) => e.i === i).length]));
  for (const outs of [['front', 'left'], ['left', 'right'], ['front', 'left', 'right']]) {
    const { s, bins } = setup(outs);
    const ev = feed(s, 1, 7, E, 14, 30 * TICK_HZ, [], true);
    const n = tally(ev, bins);
    const counts = Object.values(n);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${outs}: ${JSON.stringify(n)}`);
    assert.ok(counts.reduce((a, b) => a + b, 0) > 150, 'the full input rate gets through');
  }
  // The right-hand way is a dead end: once it is full, the other two take everything.
  const { s, bins } = setup(['front', 'left']);
  col(s, 7, 8, 10, S); // no bin at the end
  feed(s, 1, 7, E, 14, 10 * TICK_HZ);
  const late = feed(s, 1, 7, E, 14, 20 * TICK_HZ);
  const n = tally(late, bins);
  assert.equal(n.front + n.left, 20 * 6, 'all of it, at the full rate');
  assert.ok(Math.abs(n.front - n.left) <= 1);
  assert.equal(at(s, 7, 10).it.length, 6, 'the dead end is full');
});

test('Overpass: two streams cross without mixing, in all four direction combinations', () => {
  for (const we of [E, W]) {
    for (const ns of [S, N]) {
      const s = blank();
      const cx = 10, cy = 7;
      lay(s, cx, cy, 'over');
      // East-west stream, Store Brand; north-south stream, Platinum.
      const x0 = we === E ? cx - 4 : cx + 4, x1 = we === E ? cx + 4 : cx - 4;
      row(s, cx - 4, cx - 1, cy, we); row(s, cx + 1, cx + 4, cy, we);
      const y0 = ns === S ? cy - 4 : cy + 4, y1 = ns === S ? cy + 4 : cy - 4;
      col(s, cx, cy - 4, cy - 1, ns); col(s, cx, cy + 1, cy + 4, ns);
      // Bins past both ends (moved one tile on).
      const bx = x1 + (we === E ? 1 : -1), by = y1 + (ns === S ? 1 : -1);
      lay(s, bx, cy, 'bin'); lay(s, cx, by, 'bin');
      assert.deepEqual(overpassDirs(s, cy * s.w + cx), [we, ns]);
      const ev = [];
      for (let t = 0; t < 30 * TICK_HZ; t++) {
        give(s, cy * s.w + x0, 11, we);
        give(s, y0 * s.w + cx, 14, ns);
        stepBack(s, ev);
        checkGaps(s);
      }
      const toA = ev.filter((e) => e.i === cy * s.w + bx), toB = ev.filter((e) => e.i === by * s.w + cx);
      assert.ok(toA.length > 150 && toB.length > 150, `${we}/${ns}: both flow (${toA.length}, ${toB.length})`);
      assert.ok(toA.every((e) => e.v === BACK.binPay[1]), 'only the east-west stream reaches its bin');
      assert.ok(toB.every((e) => e.v === BACK.binPay[4]), 'only the north-south stream reaches its bin');
    }
  }
  // With nothing feeding it, an Overpass runs east and south.
  const s = blank();
  lay(s, 5, 5, 'over');
  assert.deepEqual(overpassDirs(s, 5 * s.w + 5), [E, S]);
});

test('Unpaid Intern: takes from the belt behind, only when the tile in front wants it, and holds it for internSecs', () => {
  const s = blank();
  const hold = Math.round(BACK.internSecs * TICK_HZ);
  // He faces east; behind him (to his west) a belt running south into a dead end, so what he does
  // not take stays on it; in front of him a belt he puts things on from behind.
  lay(s, 4, 7, 'conv', S);
  lay(s, 5, 7, 'intern', E);
  lay(s, 6, 7, 'conv', E);
  at(s, 4, 7).it = [11, 150, 12, 50];
  run(s, 1);
  assert.equal(at(s, 5, 7).h, 11, 'the front-most item that the tile in front wants');
  assert.equal(at(s, 4, 7).it.length, 2);
  for (let t = 1; t < hold; t++) { run(s, 1); assert.equal(at(s, 5, 7).h, 11, `still holding after ${t} ticks`); }
  run(s, 1);
  assert.deepEqual(at(s, 6, 7).it, [11, 0], 'handed over after internSecs');
  // The belt in front has no room behind until that item has moved the gap on: he waits for it.
  assert.equal(at(s, 5, 7).h, 0);
  run(s, GAP / STEP - 1);
  assert.equal(at(s, 5, 7).h, 0);
  run(s, 1);
  assert.equal(at(s, 5, 7).h, 12, 'then takes the next');
  // He takes nothing the tile in front would not take now: a full belt facing a dead end.
  const t = blank();
  lay(t, 4, 7, 'conv', S);
  lay(t, 5, 7, 'intern', E);
  lay(t, 6, 7, 'conv', E);
  at(t, 6, 7).it = [11, END, 11, END - GAP, 11, 40];
  at(t, 4, 7).it = [12, 100];
  run(t, 30);
  assert.equal(at(t, 5, 7).h, 0, 'nothing taken');
  assert.deepEqual(at(t, 4, 7).it, [12, END]);
  // Into a bin, at one item per internSecs.
  const u = blank();
  col(u, 4, 1, 14, S);
  lay(u, 5, 7, 'intern', E);
  lay(u, 6, 7, 'bin');
  feed(u, 4, 1, S, 13, 10 * TICK_HZ); // (until items reach him)
  const ev = feed(u, 4, 1, S, 13, 12 * TICK_HZ);
  assert.ok(Math.abs(ev.length - (12 * TICK_HZ) / hold) <= 2, `${ev.length} in 12 s`);
  // He takes from belts only, and nothing gives to him.
  assert.equal(wants(u, 7 * u.w + 5, 11, E), false);
});

test('Returns Drop: one junk every dropSecs; waits while the tile in front is full; cannot be removed; anyone can turn it', () => {
  const s = blank();
  addPlayer(s, 'Steve');
  lay(s, 3, 5, 'drop', E);
  row(s, 4, 5, 5, E); // two belts into nothing: they fill up
  run(s, dropTicks(0) - 1);
  assert.equal(codes(s).length, 0);
  run(s, 1);
  assert.deepEqual(codes(s), [JUNK], 'the first after dropTicks');
  run(s, 3 * dropTicks(0));
  assert.equal(codes(s).length, 4);
  run(s, 60 * TICK_HZ);
  assert.equal(codes(s).length, 6, 'two belts hold six, and the drop waits');
  assert.equal(at(s, 3, 5).t, 0);
  // Commands: nobody can place or remove one; anyone can turn it.
  s.phase = 'build';
  assert.equal(applyCommand(s, 0, { c: 'remove', x: 3, y: 5, f: 1 }).why, 'fixed');
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'drop', x: 8, y: 8, f: 1 }).why, 'kind');
  const ver = s.backVer;
  assert.equal(applyCommand(s, 1, { c: 'rotate', x: 3, y: 5, f: 1 }).ok, true);
  assert.equal(at(s, 3, 5).d, S);
  assert.ok(s.backVer > ver);
  // Turned to face a bin, the junk flows again.
  lay(s, 3, 6, 'bin');
  run(s, 1);
  assert.equal(at(s, 3, 5).t, dropTicks(0), 'it put one out at once');
});

test('Clearance Bin: pays binPay by tier for supplies, shared like income; nothing for junk', () => {
  const s = blank();
  addPlayer(s, 'Steve');
  for (const p of s.players) p.cash = 100;
  lay(s, 5, 5, 'bin', 0, 1);
  const i = 5 * s.w + 5;
  for (const d of [E, S, W, N]) assert.equal(wants(s, i, JUNK, d), true, 'from any side');
  assert.equal(give(s, i, JUNK, E), true);
  assert.deepEqual(s.players.map((p) => p.cash), [100, 100]);
  give(s, i, itemCode(1, 4), N); // Platinum: $1, split two ways
  give(s, i, itemCode(3, 3), W); // Premium: $0.50
  assert.deepEqual(s.players.map((p) => p.cash), [100.75, 100.75]);
  assert.equal(s.players[1].all.earned, 1.5, 'credited to its owner');
  // Through a belt, with the event.
  row(s, 1, 4, 5, E);
  at(s, 1, 5).it = [itemCode(2, 2), 100];
  const ev = run(s, 60);
  assert.deepEqual(ev, [{ e: 'binned', i, v: BACK.binPay[2], by: 1 }]);
});

test('a ring of belts keeps circulating without losing or making items', () => {
  const s = blank();
  // A 6 x 4 ring, clockwise.
  row(s, 5, 10, 3, E); col(s, 11, 3, 6, S); row(s, 6, 11, 7, W); col(s, 5, 4, 7, N);
  lay(s, 11, 3, 'conv', S); lay(s, 11, 7, 'conv', W); lay(s, 5, 7, 'conv', N); lay(s, 5, 3, 'conv', E);
  // A few items with their own numbers, packed tight on two tiles.
  at(s, 6, 3).it = [101, 200, 102, 120, 103, 40];
  at(s, 8, 7).it = [104, 200, 105, 120];
  const before = codes(s);
  const path = [];
  for (let t = 0; t < 120 * TICK_HZ; t++) {
    stepBack(s);
    checkGaps(s);
    const where = s.back.findIndex((p) => p && p.it && p.it.includes(101));
    if (path[path.length - 1] !== where) path.push(where);
  }
  assert.deepEqual(codes(s), before, 'the same items, no more, no fewer');
  // It went round several times (20 tiles round, two tiles a second: 12 laps in 120 s, less for
  // the corners and the break in the ring).
  assert.ok(path.length > 20 * 6, `${path.length} tiles visited`);
  // One item alone moves exactly one step a tick everywhere, the ring's break included: on a new
  // tile it is at its overshoot (straight on) or the middle (round a corner), never a step further.
  for (const p of s.back) if (p && p.it) p.it.length = 0;
  at(s, 6, 3).it = [101, 0];
  let was = null;
  for (let t = 0; t < 30 * TICK_HZ; t++) {
    stepBack(s);
    const i = s.back.findIndex((p) => p && p.it && p.it.length);
    const pos = s.back[i].it[1];
    if (was && was.i === i) assert.ok(pos === was.pos + STEP || pos === END, `tick ${t}: ${was.pos} to ${pos}`);
    else if (was) assert.ok(pos < STEP || pos === SUB / 2, `tick ${t}: onto tile ${i} at ${pos}`);
    was = { i, pos };
  }
});

test('commands on The Back: price, sell-back, walls, occupied tiles, belt over belt, backVer', () => {
  const s = createGame({ map: { design: 'warehouse', size: 's' } });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  const cash = s.players[0].cash;
  const wall = s.tiles.indexOf('#');
  // The Back's parts are not shop-floor buildings, and shop-floor buildings do not go in The Back.
  assert.equal(canPlace(s, 'conv', 5, 5, 0), 'kind');
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'conv', x: 5, y: 5 }).why, 'kind');
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 5, y: 5, f: 1 }).why, 'kind');
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'conv', x: 5, y: 5, f: 2 }).why, 'bad');
  // Walls go all the way down; tills and entrances have open floor under them.
  assert.equal(canPlaceBack(s, 'conv', wall % s.w, (wall / s.w) | 0, 0), 'bounds');
  const till = s.tiles.indexOf('T');
  assert.equal(canPlaceBack(s, 'conv', till % s.w, (till / s.w) | 0, 0), null);
  const v0 = s.backVer;
  const ev = [];
  assert.deepEqual(applyCommand(s, 0, { c: 'place', k: 'conv', x: 5, y: 5, d: S, f: 1 }, ev), { ok: true });
  assert.deepEqual(ev, [{ e: 'placed', k: 'conv', x: 5, y: 5, d: S, by: 0, f: 1 }]);
  assert.equal(s.players[0].cash, cash - BUILD.conv.cost);
  assert.ok(s.backVer > v0);
  assert.ok(s.phaseT > 0, 'the first thing placed starts the build timer, on either floor');
  assert.equal(s.grid[5 * s.w + 5], 0, 'the shop floor above is untouched');
  assert.equal(canPlace(s, 'sprinkler', 5, 5, 0), null, 'and still free to build on (for now)');
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'bin', x: 5, y: 5, f: 1 }).why, 'occupied');
  // A belt on a belt turns it, free.
  const v1 = s.backVer;
  assert.equal(applyCommand(s, 1, { c: 'place', k: 'conv', x: 5, y: 5, d: E, f: 1 }).turned, true);
  assert.equal(at(s, 5, 5).d, E);
  assert.equal(s.players[1].cash, cash);
  assert.ok(s.backVer > v1);
  // Turning, by anyone; a bin does not turn.
  applyCommand(s, 1, { c: 'rotate', x: 5, y: 5, f: 1 });
  assert.equal(at(s, 5, 5).d, S);
  applyCommand(s, 0, { c: 'place', k: 'bin', x: 6, y: 5, f: 1 });
  assert.equal(applyCommand(s, 0, { c: 'rotate', x: 6, y: 5, f: 1 }).why, 'empty');
  // Sold back by anyone; the money goes to whoever paid.
  applyCommand(s, 0, { c: 'place', k: 'intern', x: 7, y: 5, d: E, f: 1 });
  const before = s.players[0].cash;
  const v2 = s.backVer;
  assert.equal(applyCommand(s, 1, { c: 'remove', x: 7, y: 5, f: 1 }).ok, true);
  assert.equal(s.players[0].cash, before + Math.floor(BUILD.intern.cost * TUNE.sellBack));
  assert.equal(at(s, 7, 5), 0);
  assert.ok(s.backVer > v2);
  assert.equal(applyCommand(s, 0, { c: 'remove', x: 7, y: 5, f: 1 }).why, 'empty');
  // Not without the money; nothing in the lobby or when paused.
  s.players[0].cash = 1;
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'split', x: 8, y: 5, f: 1 }).why, 'cash');
  s.pause = { by: 0 };
  assert.equal(canPlaceBack(s, 'conv', 8, 5, 1), 'paused');
  delete s.pause;
  // Every Back kind may be bought (all but the drop) and has a price and a name.
  for (const k of ['conv', 'split', 'over', 'intern', 'bin']) assert.equal(canPlaceBack(s, k, 9, 9, 1), null, k);
  assert.deepEqual([BUILD.conv.cost, BUILD.split.cost, BUILD.over.cost, BUILD.intern.cost, BUILD.bin.cost], [2, 15, 15, 20, 20]);
});

/** A busy Back on a real map: drops, belts, a splitter, an overpass, an intern and bins. */
function busy() {
  const s = createGame({ seed: 7, map: { design: 'warehouse', size: 's' } });
  addPlayer(s, 'Dave');
  const send = (k, x, y, d) => assert.equal(applyCommand(s, 0, { c: 'place', k, x, y, d, f: 1 }).ok, true, `${k} at ${x},${y}`);
  const drops = [];
  s.back.forEach((p, i) => { if (p) drops.push(i); });
  // From each drop, a belt two tiles on, then a splitter into two bins (in front and to its left).
  for (const i of drops) {
    const p = s.back[i];
    const dx = [1, 0, -1, 0][p.d], dy = [0, 1, 0, -1][p.d];
    let x = i % s.w, y = (i / s.w) | 0;
    for (let n = 0; n < 2; n++) { x += dx; y += dy; send('conv', x, y, p.d); }
    x += dx; y += dy; send('split', x, y, p.d);
    send('bin', x + dx, y + dy);
    send('bin', x + dy, y - dx);
  }
  // And an overpass crossing with an intern, fed by hand below.
  for (let x = 2; x <= 8; x++) if (x !== 5) send('conv', x, 9, E);
  send('over', 5, 9);
  send('bin', 9, 9);
  for (let y = 6; y <= 12; y++) if (y !== 9) send('conv', 5, y, S);
  send('intern', 5, 13, S);
  send('bin', 5, 14);
  s.players[0].cash = 1000;
  for (let t = 0; t < 200; t++) {
    if (t % 7 === 0) give(s, 9 * s.w + 2, 23, E);
    if (t % 5 === 0) give(s, 6 * s.w + 5, 12, S);
    step(s);
  }
  return s;
}

test('a busy Back survives a copy through JSON and plays on identically; the checksum sees its items', () => {
  const s = busy();
  assert.ok(codes(s).length > 10, `${codes(s).length} items about`);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copy, s);
  for (let t = 0; t < 400; t++) { step(s); step(copy); }
  assert.equal(JSON.stringify(copy), JSON.stringify(s));
  assert.equal(checksum(copy), checksum(s));
  // One item one unit along, or one item of another kind: a different checksum.
  const lane = s.back.find((p) => p && p.it && p.it.length);
  const was = checksum(s);
  lane.it[1] -= 1;
  assert.notEqual(checksum(s), was);
  lane.it[1] += 1;
  lane.it[0] += 1;
  assert.notEqual(checksum(s), was);
});

test('step runs The Back in the build pause and in sales events, and opening early runs it ahead too', () => {
  const s = blank();
  s.phase = 'build';
  lay(s, 2, 5, 'drop', E);
  row(s, 3, 6, 5, E);
  lay(s, 7, 5, 'bin');
  // Nothing runs before the first build; placing on The Back starts the clock like anything else.
  step(s);
  assert.equal(at(s, 2, 5).t, dropTicks(0));
  applyCommand(s, 0, { c: 'place', k: 'conv', x: 3, y: 9, d: E, f: 1 });
  for (let t = 0; t < dropTicks(0); t++) step(s);
  assert.deepEqual(codes(s), [JUNK]);
  // Opening the doors early plays the rest of the build pause through on The Back as well.
  const left = s.phaseT - 1;
  const twin = JSON.parse(JSON.stringify(s));
  for (let t = 0; t < left; t++) stepBack(twin);
  const ev = [];
  applyCommand(s, 0, { c: 'start' }, ev);
  assert.equal(s.phase, 'wave');
  assert.deepEqual(s.back, twin.back);
});

test('speed: the largest store with thousands of belt tiles full of items', () => {
  const s = createGame({ map: { design: 'warehouse', size: 'titan' } });
  let t = '';
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) t += x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1 ? '#' : '.';
  s.tiles = t;
  s.back.fill(0);
  // A snake over every other row, each full: three items a tile, into a bin.
  let belts = 0;
  for (let y = 1; y < s.h - 2; y += 2) {
    const east = ((y - 1) / 2) % 2 === 0;
    for (let x = 1; x < s.w - 1; x++) { lay(s, x, y, 'conv', east ? E : W); belts++; }
    // The turn down to the next row at the far end.
    lay(s, east ? s.w - 2 : 1, y, 'conv', S);
    lay(s, east ? s.w - 2 : 1, y + 1, 'conv', S);
    belts++;
  }
  for (const p of s.back) if (p && p.k === 'conv') p.it = [11, END, 11, END - GAP, 11, END - 2 * GAP];
  const last = s.back.findLastIndex((p) => p && p.k === 'conv');
  lay(s, (last % s.w) + 1, (last / s.w) | 0, 'bin');
  stepBack(s); // (works out the order once)
  const n = 300;
  const t0 = performance.now();
  for (let k = 0; k < n; k++) stepBack(s);
  const ms = (performance.now() - t0) / n;
  console.log(`  The Back: ${belts} belt tiles, ${codes(s).length} items: ${ms.toFixed(3)} ms a tick`);
  assert.ok(belts > 3000);
  assert.ok(ms < 5, `${ms} ms a tick`);
});
