// Tests for The Back (0.4): the floor under the shop, its belt engine and its first parts.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, makeDrops, makeMap, overpassDirs,
  BACK, BUILD, TUNE, TICK_HZ, MAP_DESIGNS, MAP_SIZES, JUNK, itemCode, itemType, itemTier, dropTicks, newPart, wants, give, stepBack, canPlaceBack, canPlace,
  beltShape, rebrandTicks,
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
      // (Straight on, or round a corner belt fed from this side: both join as if from behind.)
      const sh = q && q.k === 'conv' ? beltShape(s, y * s.w + x) : 0;
      const joins = q && q.k === 'conv' && (q.d === p.d || (sh === 1 && p.d === ((q.d + 3) & 3)) || (sh === -1 && p.d === ((q.d + 1) & 3)));
      if (joins && q.it.length) {
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
});

test('makeDrops: at least one Returns Drop on every design at every size, never on a wall, facing open floor', () => {
  for (const design of Object.keys(MAP_DESIGNS)) {
    for (const size of Object.keys(MAP_SIZES)) {
      const s = createGame({ map: { design, size } });
      const drops = makeDrops(s.w, s.h, s.tiles, s.doors, design);
      assert.ok(drops.length >= 1, `${design} ${size}`);
      for (const { i, d } of drops) {
        assert.notEqual(s.tiles[i], '#', `${design} ${size}: not on a wall`);
        const x = (i % s.w) + [1, 0, -1, 0][d], y = ((i / s.w) | 0) + [0, 1, 0, -1][d];
        assert.notEqual(s.tiles[y * s.w + x], '#', `${design} ${size}: faces open floor`);
        assert.deepEqual(s.back[i], { k: 'drop', d, t: dropTicks(0), lv: 0 });
      }
      assert.equal(s.back.filter(Boolean).length, drops.length);
    }
  }
});

// Where every Returns Drop is, recorded on 0.4.00 before the old marked floor went (removal step 3).
// The drops used to be placed from the Unpacker patches of that floor, and the food court's and car
// park's furniture still keeps clear of where all four kinds of patch were, so the layout code was
// kept (as factoryPatches in maps.js) and these must never move. Each design and size: the drops of
// a new game ('tile:facing'), then a hash of the tiles, the furniture and the drops for every number
// of entrances from 1 to 7.
const PINNED_DROPS = {
  'warehouse/xs': ['100:1 380:2', '1eelk0i'],
  'warehouse/s': ['102:1 118:1 596:3', 'e0qlm0'],
  'warehouse/m': ['118:1 142:1 856:0', '1r9vp2p'],
  'warehouse/l': ['192:1 226:1 1371:3 1444:3', '1w06a42'],
  'warehouse/xl': ['228:1 248:1 274:1 2199:3 2218:3 2238:3', '1gn1xhz'],
  'warehouse/xxl': ['253:1 293:1 313:1 354:1 3341:3 3361:3 3381:3', 'uxjzb3'],
  'warehouse/huge': ['307:1 327:1 347:1 367:1 387:1 4970:3 4990:3 5109:3 5129:3', '1ss21l6'],
  'warehouse/titan': ['373:1 393:1 433:1 453:1 473:1 534:1 7643:3 7663:3 7683:3 7703:3 7723:3', 'mrvv58'],
  'showroom/xs': ['101:1 381:3', 't16up2'],
  'showroom/s': ['102:1 118:1 596:3', '1dmkh3f'],
  'showroom/m': ['118:1 142:1 856:3', 'u5a3ok'],
  'showroom/l': ['192:1 226:1 1370:3 1444:3', '10nnt8k'],
  'showroom/xl': ['228:1 248:1 274:1 2198:3 2218:3 2238:3', '1415l17'],
  'showroom/xxl': ['253:1 293:1 314:1 355:1 3342:3 3362:3 3382:3', 'xjmasn'],
  'showroom/huge': ['308:1 328:1 348:1 368:1 387:1 4971:3 4991:3 5109:3 5129:3', '3l7zv0'],
  'showroom/titan': ['373:1 394:1 434:1 453:1 474:1 535:1 7643:3 7664:3 7683:3 7704:3 7723:3', '6jeuqw'],
  'aisles/xs': ['101:1 410:3', 't9n4ge'],
  'aisles/s': ['103:1 119:1 632:3', 'xcwn5p'],
  'aisles/m': ['119:1 143:1 856:3', 'rn3k2p'],
  'aisles/l': ['193:1 227:1 1370:3 1444:3', '1gk89oh'],
  'aisles/xl': ['229:1 249:1 275:1 2198:3 2218:3 2238:3', '7okofo'],
  'aisles/xxl': ['254:1 294:1 314:1 355:1 3341:3 3361:3 3381:3', 'gan4tf'],
  'aisles/huge': ['308:1 328:1 348:1 368:1 388:1 4970:3 4990:3 5109:3 5129:3', 'fjrsrs'],
  'aisles/titan': ['374:1 394:1 434:1 454:1 474:1 535:1 7643:3 7663:3 7683:3 7703:3 7723:3', '1g3q7id'],
  'food/xs': ['100:1 380:3', 'e97r0u'],
  'food/s': ['102:1 118:1 596:3', 'czayth'],
  'food/m': ['118:1 142:1 856:3', 'kubllk'],
  'food/l': ['192:1 226:1 1370:3 1444:3', '1kb7ik2'],
  'food/xl': ['228:1 248:1 274:1 2198:3 2218:3 2238:3', 'olfhzc'],
  'food/xxl': ['253:1 293:1 313:1 354:1 3341:3 3361:3 3381:3', 'va3ftk'],
  'food/huge': ['307:1 327:1 347:1 367:1 387:1 4970:3 4990:3 5109:3 5129:3', 'bj3bi7'],
  'food/titan': ['373:1 393:1 433:1 453:1 473:1 534:1 7643:3 7663:3 7683:3 7703:3 7723:3', '1b9re0b'],
  'carpark/xs': ['100:1 350:3', 'fa07y2'],
  'carpark/s': ['102:1 118:1 596:3', '12y5dz4'],
  'carpark/m': ['118:1 142:1 856:3', 'zy18zl'],
  'carpark/l': ['192:1 226:1 1370:3 1390:3', '1ghiet7'],
  'carpark/xl': ['228:1 248:1 274:1 2198:3 2218:3 2238:3', '17dqs21'],
  'carpark/xxl': ['253:1 293:1 313:1 354:1 3300:3 3341:3 3361:3', 'j18kyq'],
  'carpark/huge': ['307:1 327:1 347:1 367:1 387:1 4970:3 4990:3 5030:3 5109:3', 'hk6wy6'],
  'carpark/titan': ['373:1 393:1 433:1 453:1 473:1 534:1 7602:3 7643:3 7663:3 7683:3 7703:3', 'stt58l'],
  'corridors/xs': ['100:1 470:3', '1vz6jzq'],
  'corridors/s': ['102:1 119:1 812:3', 'ouccw9'],
  'corridors/m': ['142:1 162:1 1032:3', 'h8oyfn'],
  'corridors/l': ['172:1 192:1 1640:3 1660:3', '12ri9y1'],
  'corridors/xl': ['208:1 228:1 248:1 2528:3 2548:3 2568:3', 'pkktze'],
  'corridors/xxl': ['253:1 273:1 293:1 313:1 3908:3 3928:3 3948:3', '3jfpkf'],
  'corridors/huge': ['307:1 327:1 347:1 367:1 387:1 5960:3 5980:3 6000:3 6020:3', 'lkjhdg'],
  'corridors/titan': ['373:1 393:1 413:1 433:1 453:1 473:1 8853:3 8873:3 8893:3 8913:3 8933:3', '4mgn2t'],
  'horseshoe/xs': ['91:1 104:1', '19inbaj'],
  'horseshoe/s': ['111:1 126:1 339:1', '1qdszer'],
  'horseshoe/m': ['134:1 151:1 503:1', '4o8obh'],
  'horseshoe/l': ['154:1 249:1 744:1 1788:3', 'bkwn6i'],
  'horseshoe/xl': ['249:1 273:1 298:1 1135:1 2644:3 2765:3', '1uv33pb'],
  'horseshoe/xxl': ['276:1 300:1 320:1 344:1 1823:1 4024:3 4161:3', '24x8y3'],
  'horseshoe/huge': ['354:1 380:1 406:1 426:1 443:1 2659:1 2679:1 6230:3 6302:3', '1c9wui0'],
  'horseshoe/titan': ['453:1 473:1 497:1 517:1 542:1 562:1 4081:1 4101:1 9396:3 9416:3 9485:3 9505:3', '1myygrh'],
};

test('the Returns Drops, and the stores round them, are exactly where they were before the marked floor went', () => {
  const fnv = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  let n = 0;
  for (const design of Object.keys(MAP_DESIGNS)) {
    for (const size of Object.keys(MAP_SIZES)) {
      const key = `${design}/${size}`;
      assert.ok(Object.hasOwn(PINNED_DROPS, key), `${key} has no record: a new design or size needs one`);
      const s = createGame({ map: { design, size } });
      const drops = [];
      s.back.forEach((p, i) => { if (p && p.k === 'drop') drops.push(i + ':' + p.d); });
      assert.equal(drops.join(' '), PINNED_DROPS[key][0], `${key}: the drops of a new game`);
      let all = '';
      for (let slots = 1; slots <= 7; slots++) {
        const m = makeMap(design, size, slots);
        all += m.tiles + m.decor + JSON.stringify(makeDrops(m.w, m.h, m.tiles, m.doors, design)) + '|';
      }
      assert.equal(fnv(all), PINNED_DROPS[key][1], `${key}: tiles, furniture and drops for 1 to 7 entrances`);
      n++;
    }
  }
  assert.equal(n, Object.keys(PINNED_DROPS).length);
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

test('a corner is not a side-load: an item goes round it with no jump, and a line keeps its spacing and rate', () => {
  const s = blank();
  row(s, 2, 8, 5, E);
  col(s, 9, 5, 10, S); // (9, 5) faces south, fed only from its west side: a corner
  lay(s, 9, 11, 'bin');
  const i = 5 * s.w + 9;
  // Fed from the west while facing south: from its right (the right of south is west).
  assert.equal(beltShape(s, i), 1);
  assert.equal(beltShape(s, 5 * s.w + 5), 0, 'a straight belt');
  // A lone item: every tick it moves exactly one step, and leaving one tile at overshoot x it
  // arrives on the next at x, round the corner too.
  at(s, 2, 5).it = [11, 0];
  let was = { i: 5 * s.w + 2, pos: 0 }, corner = false;
  for (let t = 0; t < 8 * TICK_HZ && codes(s).length; t++) {
    run(s, 1);
    const j = s.back.findIndex((p) => p && p.it && p.it.length);
    if (j < 0) break;
    const pos = s.back[j].it[1];
    if (j === was.i) assert.equal(pos, was.pos + STEP, `tick ${t}`);
    else { assert.equal(pos, was.pos + STEP - SUB, `tick ${t}: onto tile ${j}`); if (j === i) corner = true; }
    was = { i: j, pos };
  }
  assert.ok(corner, 'it went round the corner');
  // A full line round the corner: six a second, never closer than the gap.
  feed(s, 2, 5, E, 14, 10 * TICK_HZ, [], true);
  const late = feed(s, 2, 5, E, 14, 20 * TICK_HZ, [], true);
  assert.equal(late.length, 20 * 6);
  // Both turns: a corner fed from the left is -1.
  const t = blank();
  row(t, 2, 8, 5, E);
  lay(t, 9, 5, 'conv', N);
  assert.equal(beltShape(t, 5 * t.w + 9), -1);
  // A feeder from behind as well, or one at each side, makes it a merge: straight, sides at the middle.
  lay(t, 9, 6, 'conv', N);
  assert.equal(beltShape(t, 5 * t.w + 9), 0);
  lay(t, 9, 6, 'conv', E);
  lay(t, 10, 5, 'conv', W);
  assert.equal(beltShape(t, 5 * t.w + 9), 0, 'one feeder at each side');
  // A Returns Drop, a Splitter's way or an Overpass lane feeding from one side also makes a corner;
  // an Unpaid Intern does not.
  for (const [k, d, want] of [['drop', E, 1], ['split', E, 1], ['over', 0, 1], ['intern', E, 0]]) {
    const u = blank();
    lay(u, 5, 5, k, d);
    lay(u, 6, 5, 'conv', S);
    assert.equal(beltShape(u, 5 * u.w + 6), want, k);
  }
});

test('side-loading lands in the middle of a belt; belts facing each other hand nothing over', () => {
  const s = blank();
  row(s, 3, 10, 5, E);
  lay(s, 11, 5, 'bin');
  lay(s, 6, 4, 'conv', S); // feeds the line from the north side: a T-junction, as (6, 5) is fed from behind too
  assert.equal(beltShape(s, 5 * s.w + 6), 0);
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

// The owner asked for the Splitter's sharing to be pinned (2026-11-26): every connected output gets
// the same share; one that is backed up is passed over and the others share what it would have had.

test('Splitter: an output that is slow, not stopped, gets exactly what it can take; the others share the rest evenly', () => {
  const s = blank();
  row(s, 1, 6, 7, E);
  lay(s, 7, 7, 'split', E);
  row(s, 8, 10, 7, E); lay(s, 11, 7, 'bin');
  col(s, 7, 4, 6, N); lay(s, 7, 3, 'bin');
  // The right-hand way is slow: its belt runs into a Rebrander, which takes a Store Brand unit
  // only every rebrandTicks(1) (with two waiting), and puts the Name Brand result into a bin.
  col(s, 7, 8, 10, S); lay(s, 7, 11, 'rebrand', S); lay(s, 7, 12, 'bin');
  const front = 7 * s.w + 11, left = 3 * s.w + 7, right = 12 * s.w + 7;
  // Long enough for the slow way to back up all the way to the Splitter.
  feed(s, 1, 7, E, 11, 30 * TICK_HZ);
  let given = 0;
  const ev = [];
  const secs = 60;
  for (let t = 0; t < secs * TICK_HZ; t++) {
    if (give(s, 7 * s.w + 1, 11, E, 0)) given++;
    stepBack(s, ev);
    checkGaps(s);
  }
  const n = (i) => ev.filter((e) => e.i === i).length;
  const slow = n(right), fast = [n(front), n(left)];
  // What the Rebrander can do in that time, give or take the one it is part way through.
  const can = (secs * TICK_HZ) / rebrandTicks(s, 1);
  assert.ok(Math.abs(slow - can) <= 1, `the slow way took ${slow}, it can do ${can}`);
  assert.ok(Math.abs(fast[0] - fast[1]) <= 1, `the other two share evenly: ${fast}`);
  assert.ok(given >= secs * 6 - 1, `the line in runs at the full rate (${given})`);
  // Everything that came in went out of one of the three, or is still on its way.
  assert.ok(given - (slow + fast[0] + fast[1]) <= 12, 'nothing piles up beyond the slow line itself');
});

test('Splitter: a backed-up output rejoins the rotation when it moves again; with every output backed up the line in backs up and loses nothing', () => {
  const s = blank();
  row(s, 1, 6, 7, E);
  lay(s, 7, 7, 'split', E);
  row(s, 8, 10, 7, E); lay(s, 11, 7, 'bin');
  col(s, 7, 4, 6, N); lay(s, 7, 3, 'bin');
  col(s, 7, 8, 10, S); // the right-hand way is a dead end for now
  const bins = { front: 7 * s.w + 11, left: 3 * s.w + 7, right: 11 * s.w + 7 };
  const tally = (ev) => Object.fromEntries(Object.entries(bins).map(([k, i]) => [k, ev.filter((e) => e.i === i).length]));
  feed(s, 1, 7, E, 14, 20 * TICK_HZ, [], true);
  assert.equal(at(s, 7, 10).it.length, 6, 'the dead end is full');
  let n = tally(feed(s, 1, 7, E, 14, 10 * TICK_HZ));
  assert.equal(n.right, 0);
  assert.ok(Math.abs(n.front - n.left) <= 1 && n.front + n.left === 10 * 6, `two share it all: ${JSON.stringify(n)}`);
  // A bin at the end: the right-hand way moves again and is back in the even rotation.
  lay(s, 7, 11, 'bin');
  feed(s, 1, 7, E, 14, 5 * TICK_HZ, [], true); // its backlog drains
  n = tally(feed(s, 1, 7, E, 14, 30 * TICK_HZ, [], true));
  const counts = Object.values(n);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `three share evenly again: ${JSON.stringify(n)}`);
  assert.equal(counts.reduce((a, b) => a + b, 0), 30 * 6, 'at the full rate');
  // Every way backed up: take the three bins away.
  for (const i of Object.values(bins)) s.back[i] = 0;
  s.backVer++;
  const before = codes(s).length;
  let given = 0, refused = 0;
  const ev = [];
  for (let t = 0; t < 30 * TICK_HZ; t++) {
    if (give(s, 7 * s.w + 1, 14, E, 0)) given++; else refused++;
    stepBack(s, ev);
    checkGaps(s);
  }
  assert.equal(ev.length, 0, 'nothing went anywhere');
  assert.equal(codes(s).length, before + given, 'not one item lost or made');
  assert.ok(refused > 0, 'the line in is full and takes no more');
  for (let x = 1; x <= 6; x++) assert.equal(at(s, x, 7).it.length, 6, `the line in is backed up to tile ${x}`);
  assert.ok(at(s, 7, 7).h, 'the Splitter holds one, waiting');
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
  // One item alone moves exactly one step a tick everywhere, corners and the ring's break included:
  // on a new tile it is at its overshoot, never a step further and never jumping to the middle.
  for (const p of s.back) if (p && p.it) p.it.length = 0;
  at(s, 6, 3).it = [101, 0];
  let was = null;
  for (let t = 0; t < 30 * TICK_HZ; t++) {
    stepBack(s);
    const i = s.back.findIndex((p) => p && p.it && p.it.length);
    const pos = s.back[i].it[1];
    if (was && was.i === i) assert.equal(pos, was.pos + STEP, `tick ${t}`);
    else if (was) assert.equal(pos, was.pos + STEP - SUB, `tick ${t}: onto tile ${i}`);
    was = { i, pos };
  }
});

/** A clockwise square ring of belts with its top-left corner at (x0, y0), n tiles a side; its tiles in flow order. */
function ring(s, x0, y0, n) {
  const path = [];
  for (let x = x0; x < x0 + n - 1; x++) path.push([x, y0, E]);
  for (let y = y0; y < y0 + n - 1; y++) path.push([x0 + n - 1, y, S]);
  for (let x = x0 + n - 1; x > x0; x--) path.push([x, y0 + n - 1, W]);
  for (let y = y0 + n - 1; y > y0; y--) path.push([x0, y, N]);
  for (const [x, y, d] of path) lay(s, x, y, 'conv', d);
  return path.map(([x, y]) => y * s.w + x);
}

/** Where every numbered item is: code -> [tile, pos], or [tile, -1] in a hand. */
function where(s) {
  const m = new Map();
  s.back.forEach((p, i) => {
    if (!p) return;
    if (p.it) for (let k = 0; k < p.it.length; k += 2) m.set(p.it[k], [i, p.it[k + 1]]);
    if (p.h) m.set(p.h, [i, -1]);
  });
  return m;
}

test('a completely full ring of belts circulates at full speed, every item a step a tick', () => {
  const s = blank();
  const tiles = ring(s, 4, 3, 5); // 16 tiles
  assert.equal(tiles.length, 16);
  let code = 100;
  for (const i of tiles) s.back[i].it = [code++, END, code++, END - GAP, code++, END - 2 * GAP];
  const before = codes(s);
  assert.equal(before.length, 48);
  const along = (i, pos) => tiles.indexOf(i) * SUB + pos;
  const lap = tiles.length * SUB;
  let was = where(s);
  for (let t = 0; t < 40 * TICK_HZ; t++) {
    stepBack(s);
    checkGaps(s);
    const now = where(s);
    for (const [c, [i, pos]] of now) {
      const [i0, p0] = was.get(c);
      assert.equal((along(i, pos) - along(i0, p0) + lap) % lap, STEP, `tick ${t}: item ${c}`);
    }
    was = now;
  }
  assert.deepEqual(codes(s), before);
});

test('a Splitter at the break of a ring passes nothing on in the tick it gets it; a ring jammed there keeps every item and runs again', () => {
  // The Splitter faces north and is the ring's lowest tile; the ring leaves by its right-hand way
  // (east), runs round clockwise and comes back up into it from below.
  const s = blank();
  lay(s, 4, 3, 'split', N);
  row(s, 5, 7, 3, E); col(s, 8, 3, 6, S); row(s, 5, 8, 7, W); col(s, 4, 4, 7, N);
  lay(s, 8, 3, 'conv', S); lay(s, 8, 7, 'conv', W); lay(s, 4, 7, 'conv', N);
  const feeder = 4 * s.w + 4, out = 3 * s.w + 5, split = 3 * s.w + 4;
  let code = 200;
  for (const [x, y] of [[5, 3], [8, 4], [8, 6], [6, 7], [4, 6], [4, 5], [4, 4]]) at(s, x, y).it = [code++, END, code++, END - GAP];
  const before = codes(s);
  let was = where(s);
  const throughSplit = () => {
    let n = 0;
    for (let t = 0; t < 30 * TICK_HZ; t++) {
      stepBack(s);
      checkGaps(s);
      const now = where(s);
      for (const [c, [i]] of now) {
        const [i0] = was.get(c);
        // Off the feeder belt into the hand, then a tick later onto the way out: never both at once.
        if (i === out && i0 !== out) { assert.equal(i0, split, `tick ${t}: item ${c} came from the hand`); n++; }
        if (i === split && i0 !== split) assert.equal(i0, feeder);
      }
      was = now;
    }
    return n;
  };
  assert.ok(throughSplit() > 50, 'it circulates');
  assert.deepEqual(codes(s), before);
  // Jam it: the belt after the Splitter turned to face it head on.
  at(s, 5, 3).d = W;
  s.backVer++;
  run(s, 30 * TICK_HZ);
  assert.deepEqual(codes(s), before, 'jammed, nothing lost or made');
  const stuck = JSON.stringify(s.back);
  run(s, 1);
  assert.equal(JSON.stringify(s.back), stuck, 'and nothing moves');
  // Turned back: it runs again.
  at(s, 5, 3).d = E;
  s.backVer++;
  was = where(s);
  assert.ok(throughSplit() > 50, 'it circulates again');
  assert.deepEqual(codes(s), before);
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
  // (From stage 3 a security building needs the tile below clear for its Dumbwaiter; a crate does not.)
  assert.equal(canPlace(s, 'sprinkler', 5, 5, 0), 'back', 'no security building over a Back part');
  assert.equal(canPlace(s, 'crate', 5, 5, 0), null, 'a crate does not care');
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
  lane.it[0] -= 1;
  assert.equal(checksum(s), was);
  // The same item on another tile (moved to an empty belt, same position).
  const i = s.back.indexOf(lane), other = s.back.findIndex((p, j) => p && p.k === 'conv' && !p.it.length && j !== i);
  assert.ok(other >= 0);
  s.back[other].it.push(...lane.it.splice(0, 2));
  assert.notEqual(checksum(s), was, 'the same item on another tile');
  lane.it.unshift(...s.back[other].it.splice(0, 2));
  assert.equal(checksum(s), was);
  // The parts' own numbers: a Splitter's hand and turn, an Intern's hand and timer, a drop's timer and level.
  const change = (k, f) => {
    const p = s.back.find((q) => q && q.k === k);
    const saved = { ...p };
    p[f] = (p[f] | 0) + 1;
    assert.notEqual(checksum(s), was, `${k}.${f}`);
    Object.assign(p, saved);
    assert.equal(checksum(s), was);
  };
  for (const [k, f] of [['split', 'h'], ['split', 'r'], ['intern', 'h'], ['intern', 't'], ['drop', 't'], ['drop', 'lv']]) change(k, f);
});

test('step runs The Back in the build pause and in sales events; opening early does not run it ahead (0.4)', () => {
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
  // Opening the doors early just opens them: The Back is exactly as it was (the time skipped is
  // given up), and runs on from there in the sales event.
  assert.ok(s.phaseT > 1);
  const twin = JSON.parse(JSON.stringify(s.back));
  const ev = [];
  applyCommand(s, 0, { c: 'start' }, ev);
  assert.equal(s.phase, 'wave');
  assert.deepEqual(s.back, twin);
  assert.ok(!ev.some((e) => e.e === 'early' || e.e === 'binned'));
  const drop = at(s, 2, 5).t;
  step(s);
  assert.equal(at(s, 2, 5).t, drop - 1, 'and it runs during the event');
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
