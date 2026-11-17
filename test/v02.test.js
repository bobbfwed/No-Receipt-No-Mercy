// Tests for the rules changed after the owner's playtest: easier difficulty, buildings bigger than
// one tile, upgrades in separate tracks, durability and half-price rebuilding, the Rail Gun, the
// TV Salesman, the longer forklift, the new rules for moms, four new shoppers, and the painted
// floor kept off the walls. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, canUpgrade, step, queueTrainingWave, waveSpec, getDist,
  footprint, anchorOf, tracksOf, defaultTrack, levelIn, levelOf, upgradeCost, spentOn, statsOf, rebuildDeal,
  priceOf, SHOPPERS, SUPERS, BUILD, OFFICE, SETTINGS, TUNE, TICK_HZ, DT, ST, UNREACHABLE, MAP_SIZES, MAP_DESIGNS,
} from '../src/sim/index.js';
import { HostSession, ClientSession, checksum } from '../src/net/session.js';
import { memoryPair } from '../src/net/transports.js';
import { readSave } from '../src/ui/save.js';

// Most of these use the original small map, 30 tiles by 16: entrance on the left at rows 7-8,
// tills on the right at rows 5-10, pillars at (8,4), (20,4), (8,11), (20,11).
const W = 30;
const at = (x, y) => y * W + x;
const NEW_KINDS = ['drinker', 'dog', 'flasher', 'cosplay'];

/** A training game (no timer, cannot be lost) with plenty of cash. */
function stage(seed = 5) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}
const place = (s, k, x, y, d = 0, pid = 0) => applyCommand(s, pid, { c: 'place', k, x, y, d });
function send(s, groups) {
  queueTrainingWave(s, groups);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
}
/** Steps until the wave ends (or a time limit), calling `each` after every tick. Returns all events. */
function play(s, seconds, each = () => {}) {
  const all = [];
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    const ev = step(s);
    all.push(...ev);
    each(ev);
    if (ev.some((e) => e.e === 'waveEnd')) break;
  }
  return all;
}
/** Steps until a shopper of kind k has arrived, and returns it. */
function arrival(s, k) {
  for (let i = 0; i < 10 * TICK_HZ; i++) {
    const sh = s.shoppers.find((m) => m.k === k && !m.seen);
    if (sh) { sh.seen = true; return sh; }
    step(s);
  }
  throw new Error(`no ${k} arrived`);
}
/** Puts a shopper somewhere and holds him there (as if browsing) for a long time. */
function pin(sh, x, y) {
  sh.x = x; sh.y = y; sh.st = ST.BROWSE; sh.t = 1e6;
}
/** Temporarily changes tuning numbers for one test. */
function tune(t, changes, obj = TUNE) {
  const old = {};
  for (const k of Object.keys(changes)) { old[k] = obj[k]; obj[k] = changes[k]; }
  t.after(() => Object.assign(obj, old));
}

// ---------------------------------------------------------------- difficulty

test('every difficulty is 10% easier than it was: 0.9 times the patience, 1.1 times the pay', () => {
  const was = { easy: [0.75, 1.25], normal: [1, 1], hard: [1.3, 0.85], brutal: [1.65, 0.7] };
  for (const [k, [hp, pay]] of Object.entries(was)) {
    assert.ok(Math.abs(SETTINGS.difficulty[k].hp - Math.round(hp * 0.9 * 100) / 100) < 1e-9, `${k} hp`);
    assert.ok(Math.abs(SETTINGS.difficulty[k].pay - Math.round(pay * 1.1 * 100) / 100) < 1e-9, `${k} pay`);
  }
  assert.deepEqual(Object.values(SETTINGS.difficulty).map((d) => [d.hp, d.pay]), [[0.68, 1.38], [0.9, 1.1], [1.17, 0.94], [1.49, 0.77]]);
  assert.notEqual(SETTINGS.difficulty.normal.note, 'As designed.');
  // Shoppers walk in with 90% patience on Normal; training stays at full patience.
  const g = createGame({ seed: 2 });
  addPlayer(g, 'Dave');
  applyCommand(g, 0, { c: 'start' });
  let h = null;
  for (let i = 0; i < 60 && !h; i++) { step(g); h = g.shoppers[0]; }
  assert.ok(Math.abs(h.mhp - SHOPPERS.hunter.hp * 0.9) < 1e-9);
  const s = stage();
  send(s, [{ k: 'hunter', n: 1, gap: 1, at: 0 }]);
  assert.equal(arrival(s, 'hunter').mhp, SHOPPERS.hunter.hp);
});

// ---------------------------------------------------------------- buildings bigger than one tile

test('a footprint turns with the building, and a big building holds its tiles from the top-left one', () => {
  const s = stage();
  assert.deepEqual(footprint(s, 'railgun', 5, 3, 0), [at(5, 3), at(6, 3), at(7, 3)]);
  assert.deepEqual(footprint(s, 'railgun', 5, 3, 2), [at(5, 3), at(6, 3), at(7, 3)], 'facing west: the same tiles');
  assert.deepEqual(footprint(s, 'railgun', 5, 3, 1), [at(5, 3), at(5, 4), at(5, 5)], 'facing south: on its side');
  assert.deepEqual(footprint(s, 'salesman', 5, 3, 1), [at(5, 3), at(6, 3), at(5, 4), at(6, 4)], 'the salesman does not turn');
  assert.deepEqual(footprint(s, 'crate', 5, 3), [at(5, 3)]);
  assert.equal(footprint(s, 'railgun', 28, 3, 0), null, 'off the map');
  assert.equal(footprint(s, 'railgun', 5, 14, 1), null);

  assert.ok(place(s, 'railgun', 5, 3, 1).ok);
  const gun = s.grid[at(5, 3)];
  assert.equal(gun.k, 'railgun');
  assert.equal(gun.d, 1);
  assert.equal(gun.part, undefined);
  assert.deepEqual(s.grid[at(5, 4)], { k: 'railgun', part: at(5, 3) });
  assert.deepEqual(s.grid[at(5, 5)], { k: 'railgun', part: at(5, 3) });
  for (const y of [3, 4, 5]) assert.equal(anchorOf(s, at(5, y)), at(5, 3));
  assert.equal(anchorOf(s, at(9, 9)), at(9, 9));
  // Shoppers cannot walk through any of it.
  for (const y of [3, 4, 5]) assert.equal(getDist(s)[at(5, y)], UNREACHABLE);
  assert.equal(s.players[0].cash, 1e6 - BUILD.railgun.cost, 'paid once');

  assert.ok(place(s, 'salesman', 10, 2).ok);
  for (const [x, y] of [[11, 2], [10, 3], [11, 3]]) assert.deepEqual(s.grid[at(x, y)], { k: 'salesman', part: at(10, 2) });
  assert.equal(s.grid[at(10, 2)].d, undefined, 'the salesman has no facing');
});

test('every tile of a big building must fit: floor, empty, nobody standing there, and the tills still reachable', () => {
  const s = stage();
  assert.equal(canPlace(s, 'railgun', 27, 3, 0, 0), 'fit', 'its end would be in the wall');
  assert.equal(canPlace(s, 'railgun', 7, 4, 0, 0), 'fit', 'its middle would be on a pillar');
  assert.equal(canPlace(s, 'railgun', 8, 4, 0, 0), 'bounds', 'the tile pointed at is a pillar');
  assert.equal(canPlace(s, 'salesman', 28, 2), 'fit');
  place(s, 'crate', 7, 2);
  assert.equal(canPlace(s, 'railgun', 5, 2, 0, 0), 'fit', 'a crate under its end');
  assert.equal(canPlace(s, 'railgun', 7, 2, 0, 0), 'occupied', 'a crate under the tile pointed at');
  assert.equal(place(s, 'railgun', 5, 2, 0).why, 'fit');
  assert.equal(canPlace(s, 'railgun', 5, 2, 0, 1), null, 'turned on its side it fits');
  // Every tile at once must leave the tills reachable: a 2 x 2 in a two-tile gap is refused,
  // though either tile alone would be allowed.
  for (let y = 1; y <= 12; y++) place(s, 'crate', 14, y);
  place(s, 'crate', 15, 12);
  assert.equal(canPlace(s, 'crate', 14, 13), null);
  assert.equal(canPlace(s, 'crate', 14, 14), null);
  assert.equal(canPlace(s, 'salesman', 14, 13), 'blocked');
  assert.equal(canPlace(s, 'railgun', 14, 13, 0, 1), 'fit', 'only two tiles of floor below the wall');
  // Nobody may be standing on any of its tiles.
  send(s, [{ k: 'hunter', n: 1, gap: 1, at: 0 }]);
  const h = arrival(s, 'hunter');
  pin(h, 4.5, 9.5);
  assert.equal(canPlace(s, 'railgun', 2, 9, 0, 0), 'shopper', 'he stands under its far end');
  assert.equal(canPlace(s, 'railgun', 5, 9, 0, 0), null);
});

test('remove, rotate and upgrade work from any tile of a big building, on the whole building', () => {
  const s = stage();
  place(s, 'railgun', 5, 3, 0);
  const ev = [];
  assert.ok(applyCommand(s, 0, { c: 'upgrade', x: 7, y: 3, t: 'rng' }, ev).ok);
  assert.equal(s.grid[at(5, 3)].u.rng, 1);
  assert.deepEqual(ev[0], { e: 'upgraded', k: 'railgun', x: 5, y: 3, by: 0, t: 'rng', lv: 1 });
  assert.equal(canUpgrade(s, 6, 3, 0, 'dur'), null);
  // A long building turns end for end, keeping its footprint.
  assert.ok(applyCommand(s, 0, { c: 'rotate', x: 6, y: 3 }).ok);
  assert.equal(s.grid[at(5, 3)].d, 2);
  assert.deepEqual(s.grid[at(7, 3)], { k: 'railgun', part: at(5, 3) });
  applyCommand(s, 0, { c: 'rotate', x: 5, y: 3 });
  assert.equal(s.grid[at(5, 3)].d, 0);
  // A one-tile building still turns a quarter.
  place(s, 'belt', 10, 10, 0);
  applyCommand(s, 0, { c: 'rotate', x: 10, y: 10 });
  assert.equal(s.grid[at(10, 10)].d, 1);
  // Selling from its far end takes the whole thing and pays back its share of everything spent.
  const cash = s.players[0].cash, spent = spentOn(s.grid[at(5, 3)]);
  assert.equal(spent, BUILD.railgun.cost + Math.round(BUILD.railgun.cost * BUILD.railgun.up.rng.cost));
  const out = [];
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 7, y: 3 }, out).ok);
  for (const x of [5, 6, 7]) assert.equal(s.grid[at(x, 3)], 0);
  assert.equal(s.players[0].cash, cash + Math.floor(spent * TUNE.sellBack));
  assert.equal(out[0].x, 5, 'the event names the top-left tile');
});

// ---------------------------------------------------------------- upgrade tracks

test('each kind has the upgrade tracks it should, and a plain upgrade means damage where there is any', () => {
  const want = {
    sprinkler: ['dmg', 'spd', 'rng', 'dur'], forklift: ['dmg', 'spd', 'rng', 'dur'], railgun: ['dmg', 'spd', 'rng', 'dur'],
    wetfloor: ['dmg', 'dur'], samples: ['dmg', 'rng', 'dur'], salesman: ['dmg', 'rng', 'dur'],
    unpacker: ['spd', 'dur'], press: ['spd', 'dur'], packer: ['spd', 'dur'],
    belt: ['dur'], chute: ['dur'], crate: ['dur'],
  };
  assert.deepEqual(Object.keys(want).sort(), Object.keys(BUILD).sort());
  for (const [k, ts] of Object.entries(want)) assert.deepEqual(tracksOf(k), ts, k);
  assert.equal(defaultTrack('forklift'), 'dmg');
  assert.equal(defaultTrack('press'), 'spd');
  assert.equal(defaultTrack('crate'), 'dur');
  assert.equal(TUNE.upGrowth, 1.6);
  assert.equal(TUNE.maxLevel, 8);

  const s = stage();
  place(s, 'unpacker', 3, 3, 0);
  place(s, 'sprinkler', 5, 5);
  const ev = [];
  applyCommand(s, 0, { c: 'upgrade', x: 3, y: 3 }, ev);
  applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5 }, ev);
  assert.deepEqual(ev.map((e) => [e.t, e.lv]), [['spd', 1], ['dmg', 1]]);
  assert.deepEqual(s.grid[at(5, 5)].u, { dmg: 1 });
  assert.equal(levelIn(s.grid[at(5, 5)], 'spd'), 0);
  // Separate upgrades are each cheaper than the one combined upgrade was (the building's price).
  for (const k of ['sprinkler', 'forklift', 'wetfloor', 'samples']) for (const t of tracksOf(k)) assert.ok(upgradeCost({ k }, t) < BUILD[k].cost, `${k} ${t}`);
});

test('a factory machine gets a quarter faster a level, at most five, very expensive and growing x1.8', () => {
  for (const [k, base] of [['unpacker', 400], ['press', 600], ['packer', 900]]) {
    const tr = BUILD[k].up.spd;
    assert.deepEqual([tr.mul, tr.base, tr.grow, tr.max], [1.25, base, 1.8, 5]);
    const b = { k, u: {} };
    const costs = [];
    for (let lv = 0; lv < 5; lv++) { b.u.spd = lv; costs.push(upgradeCost(b, 'spd')); }
    assert.deepEqual(costs, [0, 1, 2, 3, 4].map((n) => Math.round(base * 1.8 ** n)));
    b.u.spd = 5;
    assert.equal(upgradeCost(b, 'spd'), 0, 'five is the top');
    // Even at the top it makes fewer than 4 items a second: a belt can carry it.
    const st = statsOf(b);
    assert.ok(1 / (st.period || st.time) < 4);
  }
  // An upgraded unpacker really makes boxes faster.
  const boxes = (lv) => {
    const s = stage(3);
    place(s, 'unpacker', 3, 3, 0); place(s, 'belt', 4, 3, 0); place(s, 'chute', 5, 3);
    for (let n = 0; n < lv; n++) assert.ok(applyCommand(s, 0, { c: 'upgrade', x: 3, y: 3, t: 'spd' }).ok);
    let sales = 0;
    for (let i = 0; i < 60 * TICK_HZ; i++) sales += step(s).filter((e) => e.e === 'sale').length;
    return sales;
  };
  const plain = boxes(0), fast = boxes(2);
  assert.ok(Math.abs(fast / plain - 1.25 ** 2) < 0.1, `${fast} boxes against ${plain}`);
});

test('the stats of any mix of levels, the overall level, and what was spent', () => {
  const f = { k: 'forklift', u: { dmg: 2, spd: 1, rng: 3, dur: 1 } };
  const st = statsOf(f);
  assert.ok(Math.abs(st.dmg - 30 * 1.3 ** 2) < 1e-9);
  assert.ok(Math.abs(st.cd - 1.6 / 1.12) < 1e-9);
  assert.ok(Math.abs(st.range - (6 + 0.9)) < 1e-9);
  assert.equal(st.hits, 2);
  assert.equal(levelOf(f), 8);
  assert.equal(spentOn(f), 200 + 120 + 192 + 120 + 80 + 128 + 205 + 60);
  assert.deepEqual(statsOf({ k: 'forklift' }), statsOf({ k: 'forklift', u: {} }));
  assert.equal(statsOf({ k: 'railgun' }).hits, 2);
  assert.equal(statsOf({ k: 'salesman', u: { dur: 2 } }).hits, 4);
  assert.equal(statsOf({ k: 'crate' }).hits, 1);
  const sign = statsOf({ k: 'wetfloor', u: { dmg: 2 } });
  assert.ok(Math.abs(sign.slow - TUNE.wetSlow * 0.82 ** 2) < 1e-9 && Math.abs(sign.slip - (TUNE.slipChance + 0.16)) < 1e-9);
  assert.ok(Math.abs(sign.slipDmg - TUNE.slipDmg * 1.45 ** 2) < 1e-9);
  assert.ok(Math.abs(statsOf({ k: 'press', u: { spd: 1 } }).time - 2.5 / 1.25) < 1e-9);
});

test('canUpgrade gives every reason, and a faster tower really fires more often', () => {
  const s = stage();
  place(s, 'sprinkler', 5, 5);
  assert.equal(canUpgrade(s, 99, 5), 'bounds');
  assert.equal(canUpgrade(s, 5.5, 5), 'bounds');
  assert.equal(canUpgrade(s, 6, 6), 'empty');
  assert.equal(canUpgrade(s, 5, 5, 0, 'nope'), 'noup');
  s.players[0].cash = 1;
  assert.equal(canUpgrade(s, 5, 5, 0, 'spd'), 'cash');
  s.players[0].cash = 1e6;
  for (let n = 0; n < 3; n++) applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5, t: 'spd' });
  const b = s.grid[at(5, 5)];
  b.u.rng = TUNE.maxLevel;
  assert.equal(canUpgrade(s, 5, 5, 0, 'rng'), 'max');
  s.phase = 'won';
  assert.equal(canUpgrade(s, 5, 5), 'over');
  s.phase = 'build';
  // After a spray it waits its upgraded time, not the plain one.
  send(s, [{ k: 'karen', n: 1, gap: 1, at: 0 }]);
  pin(arrival(s, 'karen'), 6.5, 6.5);
  let fired = false;
  for (let i = 0; i < 30 && !fired; i++) fired = step(s).some((e) => e.e === 'spray');
  assert.ok(fired);
  assert.equal(b.cd, Math.round((0.5 / 1.1 ** 3) * TICK_HZ));
});

// ---------------------------------------------------------------- durability, rubble and rebuilding

test('a gym bro takes two hits to destroy a big building, and its rubble remembers everything', (t) => {
  tune(t, { smashOther: 1 });
  const s = stage(4);
  // A corridor along row 7 lined with rail guns, one with upgrades.
  for (let x = 3; x <= 24; x += 3) { place(s, 'railgun', x, 6, 0); place(s, 'railgun', x, 8, 0); }
  applyCommand(s, 0, { c: 'upgrade', x: 9, y: 6, t: 'dmg' });
  applyCommand(s, 0, { c: 'upgrade', x: 9, y: 6, t: 'dmg' });
  send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  arrival(s, 'gymbro').hp = 1e9;
  const ev = play(s, 120).filter((e) => e.e === 'smash');
  const byGun = new Map();
  for (const e of ev) {
    assert.equal(s.grid[e.i] === 0 || s.grid[e.i].part === undefined, true, 'events name the anchor tile');
    (byGun.get(e.i) || byGun.set(e.i, []).get(e.i)).push(e.left);
  }
  const destroyed = [...byGun.entries()].filter(([, lefts]) => lefts.includes(0));
  assert.ok(destroyed.length >= 2, `${destroyed.length} rail guns destroyed`);
  for (const [i, lefts] of destroyed) {
    assert.deepEqual(lefts, [1, 0], 'one hit to spare, then gone');
    for (let x = 0; x < 3; x++) assert.equal(s.grid[i + x], 0, 'every tile is cleared');
    const r = s.rubble.find((q) => q.i === i);
    assert.equal(r.k, 'railgun');
    assert.equal(r.d, 0);
    assert.equal(r.o, 0);
  }
  const up = s.rubble.find((q) => q.i === at(9, 6));
  if (up) {
    assert.deepEqual(up.u, { dmg: 2 });
    assert.equal(up.spent, spentOn({ k: 'railgun', u: { dmg: 2 } }));
  }
});

test('a crate with durability stops a gym bro: he stands and hits it until it is gone, and never gets stuck', () => {
  const crossing = (dur, sup = 0) => {
    const s = stage(2);
    // A wall of belts with a crate in it on the gym bro's way, and a gap far away for everyone else.
    const old = TUNE.smashOther;
    TUNE.smashOther = 0;
    for (let y = 1; y <= 13; y++) assert.ok(place(s, y === 7 ? 'crate' : 'belt', 12, y, 1).ok);
    for (let n = 0; n < dur; n++) applyCommand(s, 0, { c: 'upgrade', x: 12, y: 7, t: 'dur' });
    send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0, sup }]);
    arrival(s, 'gymbro').hp = 1e9;
    const hits = [];
    let ticks = 0;
    try {
      const ev = play(s, 200, (e) => { ticks++; for (const x of e) if (x.e === 'smash' && x.i === at(12, 7)) hits.push([s.tick, x.left]); });
      assert.equal(ev.filter((e) => e.e === 'escape').length, 1, 'he gets out in the end');
    } finally { TUNE.smashOther = old; }
    return { hits, ticks };
  };
  const plain = crossing(0), tough = crossing(3);
  assert.deepEqual(plain.hits.map((h) => h[1]), [0]);
  assert.deepEqual(tough.hits.map((h) => h[1]), [3, 2, 1, 0], 'four hits for a crate with three levels of durability');
  for (let n = 1; n < tough.hits.length; n++) {
    assert.ok(tough.hits[n][0] - tough.hits[n - 1][0] >= Math.round(TUNE.smashEvery * TICK_HZ) - 1, 'one swing every smashEvery seconds');
  }
  assert.ok(tough.ticks > plain.ticks + 3 * TUNE.smashEvery * TICK_HZ * 0.9, 'so a durable crate holds him up');
  // The most durable crate there is still falls.
  assert.equal(crossing(TUNE.maxLevel).hits.pop()[1], 0);
});

test('rebuilding costs half of what was spent, with upgrades; short of that, the cheapest levels it can afford', () => {
  const r = { i: 0, k: 'forklift', d: 0, o: 0, u: { dmg: 2, rng: 1 }, spent: spentOn({ k: 'forklift', u: { dmg: 2, rng: 1 } }) };
  assert.equal(r.spent, 200 + 120 + 192 + 80);
  assert.deepEqual(rebuildDeal(r, 1000), { pay: 296, u: { dmg: 2, rng: 1 }, lost: 0 });
  assert.deepEqual(rebuildDeal(r, 296), { pay: 296, u: { dmg: 2, rng: 1 }, lost: 0 });
  // 100 for the forklift, then the cheapest levels at half price: rng 40, dmg 60, dmg 96.
  assert.deepEqual(rebuildDeal(r, 99), null);
  assert.deepEqual(rebuildDeal(r, 100), { pay: 100, u: {}, lost: 3 });
  assert.deepEqual(rebuildDeal(r, 140), { pay: 140, u: { rng: 1 }, lost: 2 });
  assert.deepEqual(rebuildDeal(r, 210), { pay: 200, u: { rng: 1, dmg: 1 }, lost: 1 });
  assert.equal(TUNE.rebuildShare, 0.5);

  // The rebuild command: oldest first, his own only, counting what came back short.
  const s = stage();
  addPlayer(s, 'Steve');
  s.rubble.push({ ...r, i: at(5, 5) }, { i: at(7, 5), k: 'crate', d: 0, o: 1, u: {}, spent: 10 }, { i: at(9, 5), k: 'railgun', d: 1, o: 0, u: {}, spent: 700 });
  s.players[0].cash = 140 + 99;
  const ev = [];
  const res = applyCommand(s, 0, { c: 'rebuild' }, ev);
  assert.deepEqual(res, { ok: true, n: 1, short: 1 });
  assert.deepEqual(ev, [{ e: 'rebuilt', by: 0, n: 1, short: 1 }]);
  assert.deepEqual(s.grid[at(5, 5)].u, { rng: 1, dmg: 1 }, 'the forklift came back with what he could afford');
  assert.equal(s.players[0].cash, 39);
  assert.equal(s.grid[at(9, 5)], 0, 'not enough left for the rail gun');
  assert.equal(s.rubble.length, 2);
  s.players[0].cash = 350;
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }), { ok: true, n: 1, short: 0 });
  assert.deepEqual(s.grid[at(9, 6)], { k: 'railgun', part: at(9, 5) }, 'back on its side, as it was');
  assert.equal(s.grid[at(9, 5)].d, 1);
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).why, 'empty', 'Steve\'s crate is his to rebuild');
  s.players[0].cash = 100;
  assert.ok(applyCommand(s, 0, { c: 'rebuild', all: true }).ok, 'unless asked to rebuild everybody\'s');
  assert.equal(s.rubble.length, 0);
});

test('placing the same kind on its rubble brings it back as it was, at the rebuild price', () => {
  const s = stage();
  const r = { i: at(5, 5), k: 'railgun', d: 0, o: 0, u: { dmg: 1 }, spent: 700 + 350 };
  s.rubble.push(r, { i: at(5, 9), k: 'crate', d: 0, o: 0, u: { dur: 2 }, spent: 10 + 10 + 16 });
  // Only half the base price is needed to be allowed to place it.
  s.players[0].cash = 349;
  assert.equal(canPlace(s, 'railgun', 6, 5, 0, 1), 'cash');
  s.players[0].cash = 350;
  assert.equal(canPlace(s, 'railgun', 6, 5, 0, 1), null);
  // Pointing at its middle, facing another way: it goes back where and how it was.
  s.players[0].cash = 1000;
  const ev = [];
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'railgun', x: 6, y: 5, d: 1 }, ev).ok);
  assert.equal(s.grid[at(5, 5)].d, 0);
  assert.deepEqual(s.grid[at(5, 5)].u, { dmg: 1 });
  assert.deepEqual(s.grid[at(7, 5)], { k: 'railgun', part: at(5, 5) });
  assert.equal(s.players[0].cash, 1000 - 525);
  assert.deepEqual(ev[0], { e: 'placed', k: 'railgun', x: 5, y: 5, d: 0, by: 0, rebuilt: 1, short: 0 });
  assert.equal(s.rubble.length, 1);
  // Something else on the rubble just clears it, at the normal price.
  const cash = s.players[0].cash;
  assert.ok(place(s, 'belt', 5, 9, 0).ok);
  assert.equal(s.players[0].cash, cash - BUILD.belt.cost);
  assert.equal(s.rubble.length, 0);
  assert.equal(s.grid[at(5, 9)].u, undefined);
});

// ---------------------------------------------------------------- rail gun

test('the rail gun fires down the line it faces, through everything, and hits every shopper in line', () => {
  const s = stage(3);
  // Facing south from the top wall: its beam crosses the shoppers' route along rows 7 and 8.
  assert.ok(place(s, 'railgun', 14, 1, 1).ok);
  place(s, 'crate', 14, 5); place(s, 'crate', 13, 5); place(s, 'crate', 15, 5); // in the way of the beam
  const gun = s.grid[at(14, 1)];
  // Karens in pairs walking side by side, a pair every few seconds.
  send(s, [{ k: 'karen', n: 6, gap: 5, at: 0 }, { k: 'karen', n: 6, gap: 5, at: 0 }]);
  const rails = [];
  let quiet = 0, most = 0;
  play(s, 120, (ev) => {
    const e = ev.find((x) => x.e === 'rail');
    if (!rails.length && !e) { if (gun.cd <= 0) quiet++; return; }
    if (!e) return;
    rails.push(e);
    most = Math.max(most, e.n);
    assert.deepEqual([e.i, e.d, e.len], [at(14, 1), 1, BUILD.railgun.range]);
    // Exactly the shoppers on the line were hit.
    const inLine = s.shoppers.filter((m) => m.st !== ST.LEAVE && Math.abs(m.x - 14.5) <= 0.6 && m.y >= 4 && m.y <= 14).length
      + ev.filter((x) => x.e === 'left').length;
    assert.ok(inLine >= e.n);
  });
  assert.ok(quiet > 30, 'it waits, loaded, until someone walks into the beam');
  assert.ok(rails.length >= 3, `fired ${rails.length} times`);
  assert.ok(most >= 2, 'more than one shopper in a single shot');
  // Damage: each hit takes its whole damage off everyone in line, and nobody outside.
  const g = stage(3);
  place(g, 'railgun', 14, 1, 1);
  send(g, [{ k: 'karen', n: 2, gap: 0.3, at: 0 }]);
  const a = arrival(g, 'karen'), b = arrival(g, 'karen');
  pin(a, 14.9, 10.5); pin(b, 15.3, 8.5); // a in line (0.4 off centre), b not (0.8 off)
  step(g);
  assert.ok(Math.abs(a.mhp - a.hp - BUILD.railgun.dmg) < 1e-9);
  assert.equal(b.hp, b.mhp);
});

test('a Karen near the rail gun slows its reload', () => {
  const s = stage(3);
  place(s, 'railgun', 14, 1, 1);
  const gun = s.grid[at(14, 1)];
  send(s, [{ k: 'karen', n: 1, gap: 1, at: 0 }]);
  const k = arrival(s, 'karen');
  pin(k, 14.5, 4.5); // in the beam, two tiles from the gun's middle
  let fired = false;
  for (let i = 0; i < 10 && !fired; i++) fired = step(s).some((e) => e.e === 'rail');
  assert.ok(fired);
  const cd = gun.cd;
  step(s);
  assert.ok(Math.abs(cd - gun.cd - TUNE.nagRate) < 1e-9, 'half speed beside her');
  pin(k, 2.5, 13.5);
  const cd2 = gun.cd;
  step(s);
  assert.equal(cd2 - gun.cd, 1, 'full speed when she is far away');
});

// ---------------------------------------------------------------- TV salesman

/** Sends `n` shoppers of a kind past a salesman and counts what he did to them. */
function pitched(k, n, ups = 0, seed = 7) {
  const s = stage(seed);
  place(s, 'salesman', 14, 4);
  for (let i = 0; i < ups; i++) applyCommand(s, 0, { c: 'upgrade', x: 14, y: 4, t: 'dmg' });
  send(s, [{ k, n, gap: 0.5, at: 0 }]);
  const ids = new Map(), last = new Map();
  let stop = 0, rush = 0, watch = 0;
  const ev = play(s, 400, (tick) => {
    for (const e of tick) {
      if (e.e !== 'pitch') continue;
      assert.equal(e.k, k);
      if (e.r === 'stop') stop++; else rush++;
    }
    for (const m of s.shoppers) {
      if (m.st === ST.WATCH && ids.get(m.id) !== ST.WATCH) watch++;
      // Nobody is pitched twice within the cooldown.
      if (m.pc > 0 && !last.has(m.id)) last.set(m.id, s.tick);
      ids.set(m.id, m.st);
    }
  });
  const pitches = ev.filter((e) => e.e === 'pitch');
  return { stop: stop / n, rush: rush / n, watch, pitches, salesman: s.grid[at(14, 4)] };
}

test('the TV salesman stops some shoppers and hurries others past, each kind in character', () => {
  assert.deepEqual(SHOPPERS.dad.pitch, [0.2, 0.3]);
  assert.deepEqual(SHOPPERS.scooter.pitch, [0.8, 0]);
  for (const k of Object.keys(SHOPPERS)) {
    const [stop, rush] = SHOPPERS[k].pitch;
    assert.ok(stop >= 0 && rush >= 0 && stop + rush <= 1, k);
  }
  const dads = pitched('dad', 150);
  assert.ok(Math.abs(dads.stop - 0.2) < 0.08, `dads stopped ${dads.stop}`);
  assert.ok(Math.abs(dads.rush - 0.3) < 0.09, `dads hurried ${dads.rush}`);
  assert.ok(dads.watch >= dads.stop * 150, 'and those who stopped stood watching');
  const scooters = pitched('scooter', 40);
  assert.ok(scooters.stop > 0.6 && scooters.rush === 0, `scooters stopped ${scooters.stop}`);
  const blind = pitched('blind', 20);
  assert.equal(blind.pitches.length, 0, 'a blind man cannot see the television');
  // His pitch: each level makes stopping likelier and hurrying less likely.
  const sold = pitched('dad', 150, 4);
  assert.ok(sold.stop > dads.stop + 0.15, `upgraded: dads stopped ${sold.stop}`);
  assert.ok(sold.rush < dads.rush, `upgraded: dads hurried ${sold.rush}`);
  const st = statsOf(sold.salesman);
  assert.ok(Math.abs(st.secs - TUNE.stopSecs * 1.15 ** 4) < 1e-9 && Math.abs(st.stopLeft - 0.88 ** 4) < 1e-9 && Math.abs(st.rushMul - 0.85 ** 4) < 1e-9);
});

test('a pitched shopper watches for the stop time, or hurries at 1.4 times his speed, and is left alone for 9 seconds', () => {
  const s = stage(1);
  place(s, 'salesman', 14, 4);
  send(s, [{ k: 'hunter', n: 40, gap: 0.6, at: 0 }]);
  const firstPitch = new Map();
  const ev = play(s, 200, (tick) => {
    for (const e of tick) {
      if (e.e !== 'pitch') continue;
      // The shopper pitched this tick is the one whose cooldown has just been set.
      const m = s.shoppers.find((q) => q.pc === Math.round(TUNE.pitchCool * TICK_HZ) && Math.abs(q.x - q.vx - e.x) < 1e-9);
      assert.ok(!firstPitch.has(m.id) || s.tick - firstPitch.get(m.id) >= TUNE.pitchCool * TICK_HZ, 'not again within the cooldown');
      firstPitch.set(m.id, s.tick);
      if (e.r === 'stop') { assert.equal(m.st, ST.WATCH); assert.equal(m.t, Math.round(TUNE.stopSecs * TICK_HZ)); }
      else { assert.equal(m.ru, Math.round(TUNE.rushSecs * TICK_HZ)); assert.ok(Math.abs(Math.hypot(m.vx, m.vy) - SHOPPERS.hunter.speed * TUNE.rushSpeed * DT) < 1e-9); }
    }
  });
  assert.ok(ev.some((e) => e.e === 'pitch' && e.r === 'stop') && ev.some((e) => e.e === 'pitch' && e.r === 'rush'));
  // Switched off (a dog has been at it), he pitches to nobody.
  const g = stage(1);
  place(g, 'salesman', 14, 4);
  g.grid[at(14, 4)].off = 1e6;
  send(g, [{ k: 'scooter', n: 10, gap: 1, at: 0 }]);
  assert.equal(play(g, 200).filter((e) => e.e === 'pitch').length, 0);
});

test('a running child may stop to watch the television, and waits there for his mother', (t) => {
  const runs = (chance) => {
    const old = TUNE.kidTv;
    TUNE.kidTv = chance;
    try {
      const s = stage(6);
      place(s, 'salesman', 8, 5);
      send(s, [{ k: 'mom', n: 1, gap: 1, at: 0 }]);
      let tv = null;
      const ev = play(s, 120, (tick) => {
        const m = s.shoppers[0];
        if (tick.some((e) => e.e === 'kidtv')) tv = { kd: m.kd, kx: m.kx, ky: m.ky };
      });
      return { ev, tv };
    } finally { TUNE.kidTv = old; }
  };
  tune(t, { kidChance: 100, kidMin: 15, kidMax: 15 });
  assert.equal(TUNE.kidTv, 0.7);
  const watched = runs(1);
  assert.equal(watched.ev.filter((e) => e.e === 'kidtv').length, 1);
  assert.equal(watched.tv.kd, 2, 'he waits there');
  assert.ok((watched.tv.kx - 9) ** 2 + (watched.tv.ky - 6) ** 2 <= BUILD.salesman.range ** 2, 'within the salesman\'s reach');
  assert.ok(watched.ev.some((e) => e.e === 'caught'));
  assert.equal(runs(0).ev.filter((e) => e.e === 'kidtv').length, 0);
});

// ---------------------------------------------------------------- forklift

test('a forklift reaches six tiles', () => {
  assert.equal(BUILD.forklift.range, 6);
  assert.equal(statsOf({ k: 'forklift' }).range, 6);
});

// ---------------------------------------------------------------- moms

test('a child runs away once; a Soccer Mom\'s twice; never closer than two tiles of walking to a till', (t) => {
  tune(t, { kidChance: 100, kidRest: 2 });
  assert.deepEqual([TUNE.kidMin, TUNE.kidMax, SUPERS.mom.kidMin, SUPERS.mom.kidMax], [6, 17, 12, 34]);
  assert.deepEqual([TUNE.kidRuns, SUPERS.mom.kidRuns, TUNE.crawlTimes, SUPERS.mom.crawlTimes, TUNE.crawlSpeed], [1, 2, 1, 2, 0.7]);
  const runs = (sup) => {
    const s = stage(6);
    for (let y = 1; y <= 13; y++) place(s, 'crate', 12, y); // a long way round
    send(s, [{ k: 'mom', n: 1, gap: 1, at: 0, sup }]);
    let worst = 99;
    const ev = play(s, 200, (tick) => {
      const m = s.shoppers[0];
      // Every time she has him back, she goes back to the entrance, so there is time for more.
      if (m && tick.some((e) => e.e === 'caught')) { m.x = 1.5; m.y = 7.5; }
      if (!m || m.kd !== 2) return;
      const ki = (m.ky | 0) * W + (m.kx | 0);
      assert.notEqual(s.tiles[ki], 'T');
      assert.ok(!s.grid[ki] || !BUILD[s.grid[ki].k].blocks, 'he waits where his mother can walk');
      worst = Math.min(worst, getDist(s)[ki]);
    });
    return { kids: ev.filter((e) => e.e === 'kid').length, worst, kn: s.shoppers[0]?.kn, ev };
  };
  const plain = runs(0), soccer = runs(1);
  assert.equal(plain.kids, 1);
  assert.equal(soccer.kids, 2);
  assert.ok(plain.worst >= TUNE.kidTill && soccer.worst >= TUNE.kidTill, `waited ${plain.worst} and ${soccer.worst} from a till`);
  // A child who would run all the way stops two tiles short.
  tune(t, { kidMin: 100, kidMax: 100 });
  const far = runs(0);
  assert.equal(far.worst, TUNE.kidTill);
  assert.equal(far.ev.filter((e) => e.e === 'escape').length, 1);
});

test('a mom does not take her refund while her child is loose', () => {
  for (const kd of [1, 2]) {
    const s = stage(4);
    send(s, [{ k: 'mom', n: 1, gap: 1, at: 0 }]);
    const m = arrival(s, 'mom');
    // At the tills already, with the child back down the store.
    m.x = 28.5; m.y = 7.5; m.kd = kd; m.kx = 15.5; m.ky = 7.5; m.kr = 0; m.kn = 1;
    const order = [];
    play(s, 120, (ev) => { for (const e of ev) if (e.e === 'caught' || e.e === 'escape') order.push(e.e); });
    assert.deepEqual(order, ['caught', 'escape'], `child ${kd === 1 ? 'running' : 'waiting'}: she fetches him first`);
  }
});

test('the last time she goes down, a mom leaves her cart and carries the child, who never runs again', (t) => {
  tune(t, { kidChance: 100, kidMin: 8, kidMax: 8 });
  const s = stage(6);
  send(s, [{ k: 'mom', n: 1, gap: 1, at: 0 }]);
  let mom = null;
  for (let i = 0; i < 20 * TICK_HZ && !(mom && mom.kd === 2); i++) { step(s); mom = s.shoppers[0] || mom; }
  // Finish her off with the child loose: she crawls, faster than she used to.
  const spot = [[0, -2], [0, 2], [-1, -2], [1, 2]].map(([dx, dy]) => [(mom.x | 0) + dx, (mom.y | 0) + dy]).find(([x, y]) => canPlace(s, 'forklift', x, y) === null);
  place(s, 'forklift', spot[0], spot[1]);
  mom.hp = 1;
  let crawlSpeed = 0, caught = null;
  const ev = play(s, 200, (tick) => {
    if (mom.cr === 1 && mom.st === ST.WALK) crawlSpeed = Math.max(crawlSpeed, Math.hypot(mom.vx, mom.vy) * TICK_HZ);
    caught ||= tick.find((e) => e.e === 'caught');
  });
  assert.equal(ev.filter((e) => e.e === 'crawl').length, 1);
  assert.equal(mom.nc, 1, 'she left the cart');
  assert.ok(Math.abs(crawlSpeed - SHOPPERS.mom.speed * 0.7) < 0.01, `crawled at ${crawlSpeed}`);
  assert.equal(caught.carry, 1);
  assert.equal(ev.filter((e) => e.e === 'kid').length, 0, 'carried, he never ran again');
  assert.equal(ev.filter((e) => e.e === 'left').length, 1, 'and the next time her patience ran out, she left');

  // A Soccer Mom goes down twice: the first time she keeps the cart, the second she leaves it.
  const g = stage(6);
  send(g, [{ k: 'mom', n: 1, gap: 1, at: 0, sup: 1 }]);
  const sm = arrival(g, 'mom');
  place(g, 'forklift', 5, 5);
  const downs = [];
  for (let round = 0; round < 2; round++) {
    // Beside a loaded forklift, her patience all but gone, the child waiting down the store.
    sm.st = ST.WALK; sm.x = 5.5; sm.y = 7.5; sm.kd = 2; sm.kx = 20.5; sm.ky = 7.5; sm.kn = round + 1; sm.hp = 0.5;
    g.grid[at(5, 5)].cd = 0;
    let got = null;
    for (let i = 0; i < 30 * TICK_HZ && !got; i++) got = step(g).find((e) => e.e === 'caught');
    downs.push([got.carry, sm.kd, sm.crn]);
  }
  assert.deepEqual(downs, [[0, 0, 1], [1, 3, 2]]);
});

// ---------------------------------------------------------------- new shoppers

test('the four new shoppers: supers twice as strong, Head Office prices, a pitch, and their waves', () => {
  for (const k of NEW_KINDS) {
    const d = SHOPPERS[k], sup = SUPERS[k];
    assert.ok(sup.hp >= d.hp * 2 && sup.speed >= d.speed && sup.refund === d.refund * 2 && sup.name !== d.name, k);
    assert.ok(OFFICE.kinds[k] && Array.isArray(d.pitch), k);
    assert.ok(priceOf(k, 1) >= priceOf(k, 0) * 2);
  }
  const first = (k) => { for (let n = 1; n <= 30; n++) if (waveSpec(n).some((g) => g.k === k)) return n; return 0; };
  assert.deepEqual(NEW_KINDS.map(first), [5, 7, 8, 9]);
  assert.deepEqual(NEW_KINDS.map((k) => SHOPPERS[k].sup.from), [12, 13, 14, 15]);
  // Nobody else walks at the cosplayer's pace.
  const speeds = Object.entries(SHOPPERS).filter(([k]) => k !== 'cosplay').flatMap(([k]) => [SHOPPERS[k].speed, SUPERS[k].speed]);
  assert.ok(!speeds.includes(SHOPPERS.cosplay.speed) && !speeds.includes(SUPERS.cosplay.speed));
  assert.ok(SHOPPERS.cosplay.hp < SHOPPERS.karen.hp && SHOPPERS.cosplay.hp > SHOPPERS.karen.hp * 0.8);
  // The first four waves are exactly what they were.
  const old = (n) => {
    const g = [{ k: 'hunter', n: 6 + 2 * n, gap: 0.9, at: 0 }];
    if (n >= 2) g.push({ k: 'dad', n: 1 + n, gap: 0.3, at: 10 });
    if (n >= 3) g.push({ k: 'clipper', n: 3 * (n - 1), gap: 0.35, at: 5 });
    if (n >= 3) g.push({ k: 'mom', n: 1 + Math.floor(n / 3), gap: 3, at: 6 });
    if (n >= 4) g.push({ k: 'teen', n: Math.floor(n / 2), gap: 2.5, at: 3 });
    // (With nothing to grow, the gap is still worked out the same way.)
    return g.map((x) => ({ ...x, gap: (x.gap * x.n) / x.n, sup: 0 }));
  };
  for (let n = 1; n <= 4; n++) assert.deepEqual(waveSpec(n), old(n), `wave ${n}`);
});

test('a stray dog pees on security it passes, which switches it off; then it waits before it can again', () => {
  const s = stage(3);
  place(s, 'sprinkler', 14, 6);
  place(s, 'sprinkler', 19, 6);
  place(s, 'wetfloor', 6, 7); place(s, 'wetfloor', 6, 8);
  send(s, [{ k: 'dog', n: 1, gap: 1, at: 0 }]);
  const dog = arrival(s, 'dog');
  dog.hp = dog.mhp = 1e6;
  dog.y = 7.5; // along row 7, one tile from the sprinklers
  const pees = [], sprays = [];
  play(s, 60, (ev) => {
    for (const e of ev) {
      if (e.e === 'pee') { pees.push({ ...e, tick: s.tick, st: dog.st }); }
      if (e.e === 'spray') sprays.push([e.i, s.tick]);
    }
  });
  assert.equal(pees.length, 1, 'the second sprinkler is passed within the dog\'s cooldown');
  const p = pees[0];
  assert.deepEqual([p.i, p.k, p.st], [at(14, 6), 'sprinkler', ST.WATCH]);
  const off = Math.round(TUNE.peeSecs * TICK_HZ);
  assert.ok(!sprays.some(([i, tick]) => i === p.i && tick > p.tick && tick < p.tick + off), 'it does nothing while it is wet');
  assert.ok(sprays.some(([i]) => i === at(19, 6)));
  // Signs are not worth his while; anything else of the security is.
  for (const k of ['forklift', 'railgun', 'samples', 'salesman']) {
    const g = stage(3);
    const y = k === 'salesman' ? 5 : 6; // its lowest tile on row 6
    assert.ok(place(g, k, 14, y).ok);
    send(g, [{ k: 'dog', n: 1, gap: 1, at: 0 }]);
    const d = arrival(g, 'dog');
    d.hp = 1e6;
    d.y = 7.5;
    const e = play(g, 60).find((x) => x.e === 'pee');
    assert.ok(e && e.k === k && e.i === at(14, y), `pees on a ${k}`);
  }
  const g = stage(3);
  for (let y = 6; y <= 9; y++) place(g, 'wetfloor', 14, y);
  send(g, [{ k: 'dog', n: 1, gap: 1, at: 0 }]);
  assert.equal(play(g, 60).filter((e) => e.e === 'pee').length, 0);
});

test('a cosplayer soaks up the shots meant for anyone close to him', () => {
  const run = (sup) => {
    const s = stage(2);
    place(s, 'forklift', 15, 4);
    send(s, [{ k: 'cosplay', n: 1, gap: 1, at: 0, sup }, { k: 'hunter', n: 1, gap: 1, at: 0.1 }]);
    const c = arrival(s, 'cosplay'), h = arrival(s, 'hunter');
    pin(h, 15.5, 7.5);
    pin(c, 14.8, 7.5); // 0.7 behind him: further from the tills, so the forklift aims at the hunter
    const ev = [];
    for (let i = 0; i < 2 * TICK_HZ; i++) ev.push(...step(s));
    const shots = ev.filter((e) => e.e === 'shot').length;
    return { s, c, h, ev, shots };
  };
  const a = run(0);
  assert.ok(a.shots >= 2);
  assert.equal(a.h.hp, a.h.mhp, 'the hunter is untouched');
  assert.ok(Math.abs(a.c.mhp - a.c.hp - a.shots * BUILD.forklift.dmg) < 1e-9, 'the cosplayer took every shot');
  const shields = a.ev.filter((e) => e.e === 'shield');
  assert.ok(shields.length >= 1 && shields.length <= 2, 'no more than once a second');
  // Further away than his costume reaches, the hunter takes it himself.
  pin(a.c, 13, 7.5);
  for (let i = 0; i < 2 * TICK_HZ; i++) step(a.s);
  assert.ok(a.h.hp < a.h.mhp);
  // The super one takes only half of what he soaks up.
  const b = run(1);
  assert.ok(Math.abs(b.c.mhp - b.c.hp - b.shots * BUILD.forklift.dmg * 0.5) < 1e-9);
});

test('an exhibitionist stops dads and teenagers nearby, but nobody else, and not again straight away', (t) => {
  tune(t, { flashEvery: 1.5 });
  const s = stage(4);
  send(s, [{ k: 'flasher', n: 1, gap: 1, at: 0 }, { k: 'dad', n: 3, gap: 0.3, at: 0.5 }, { k: 'teen', n: 1, gap: 1, at: 1 }, { k: 'hunter', n: 2, gap: 0.3, at: 0.2 }]);
  const stares = new Map();
  let opened = 0;
  const flashes = play(s, 120, (ev) => {
    const f = ev.find((e) => e.e === 'flash');
    if (!f) return;
    const her = s.shoppers.find((m) => m.k === 'flasher');
    assert.equal(her.st, ST.WATCH);
    assert.equal(her.fl, Math.round(TUNE.flashSecs * TICK_HZ));
    opened++;
    let n = 0;
    for (const m of s.shoppers) {
      // (Whoever comes after her in the crowd has already counted down one tick of it.)
      const full = Math.round(TUNE.gawkSecs * TICK_HZ);
      if (m.st !== ST.WATCH || m.k === 'flasher' || (m.t !== full && m.t !== full - 1) || m.gz !== Math.round(TUNE.gawkCool * TICK_HZ) - (m.t === full ? 0 : 1)) continue;
      assert.ok(m.k === 'dad' || m.k === 'teen', `${m.k} does not stare`);
      assert.ok((m.x - f.x) ** 2 + (m.y - f.y) ** 2 <= TUNE.flashRange ** 2);
      const last = stares.get(m.id);
      assert.ok(last === undefined || s.tick - last >= TUNE.gawkCool * TICK_HZ, 'not caught again within the cooldown');
      stares.set(m.id, s.tick);
      n++;
    }
    assert.equal(f.n, n);
  }).filter((e) => e.e === 'flash');
  assert.ok(opened >= 3);
  assert.ok(flashes.some((f) => f.n >= 1), 'someone stared');
  assert.ok(SHOPPERS.dad.gawks && SHOPPERS.teen.gawks && !SHOPPERS.hunter.gawks);
});

test('a day drinker changes pace, falls over at corners, and slows anyone who crosses him', (t) => {
  tune(t, { fallChance: 1 });
  const s = stage(5);
  for (let y = 1; y <= 13; y++) place(s, 'crate', 12, y); // a corner or two on the way
  send(s, [{ k: 'drinker', n: 1, gap: 1, at: 0 }]);
  const d = arrival(s, 'drinker');
  d.hp = d.mhp = 1e6;
  const paces = new Set();
  const ev = play(s, 200, () => { if (d.st === ST.WALK) { assert.ok(d.sv >= TUNE.swayMin && d.sv <= TUNE.swayMax); paces.add(d.sv); } });
  assert.ok(paces.size >= 5, `${paces.size} different paces`);
  const falls = ev.filter((e) => e.e === 'fall');
  assert.ok(falls.length >= 2, `${falls.length} falls`);
  // Lying where he fell, he slows a hunter crossing his tile to 35%.
  const g = stage(5);
  send(g, [{ k: 'drinker', n: 1, gap: 1, at: 0 }, { k: 'hunter', n: 1, gap: 1, at: 0.1 }]);
  const dr = arrival(g, 'drinker'), h = arrival(g, 'hunter');
  dr.x = 10.5; dr.y = 7.5; dr.st = ST.STUN; dr.t = 1e6;
  h.x = 10.2; h.y = 7.5; h.st = ST.WALK;
  step(g);
  assert.ok(Math.abs(Math.hypot(h.vx, h.vy) - SHOPPERS.hunter.speed * TUNE.fallSlow * DT) < 1e-9);
  h.x = 12.2; step(g);
  assert.ok(Math.abs(Math.hypot(h.vx, h.vy) - SHOPPERS.hunter.speed * DT) < 1e-9, 'full speed elsewhere');
});

// ---------------------------------------------------------------- painted floor

test('no painted floor touches the outer wall, and a Loading Bay in front of an entrance is two tiles further in', () => {
  for (const design of Object.keys(MAP_DESIGNS)) {
    for (const size of Object.keys(MAP_SIZES)) {
      const s = createGame({ map: { design, size } });
      for (let i = 0; i < s.zones.length; i++) {
        if (s.zones[i] === ' ') continue;
        const x = i % s.w, y = (i / s.w) | 0;
        assert.ok(x >= 2 && y >= 2 && x <= s.w - 3 && y <= s.h - 3, `${design} ${size}: ${s.zones[i]} at ${x},${y} touches the wall`);
      }
      for (const door of s.doors) {
        for (const t of door) {
          const dx = t % s.w, dy = (t / s.w) | 0;
          if (dy !== 0 && dy !== s.h - 1) continue;
          // The Loading Bay is the patch that would sit against the wall.
          for (let x = dx - 1; x <= dx + 1; x++) {
            for (let k = 1; k <= 2; k++) {
              const y = dy === 0 ? k : s.h - 1 - k;
              assert.notEqual(s.zones[y * s.w + x], 'u', `${design} ${size}: Loading Bay right in front of the entrance at ${dx},${dy}`);
            }
          }
        }
      }
    }
  }
});

// ---------------------------------------------------------------- determinism and multiplayer

/** A busy game with all of this round's new things in it, on a medium showroom. */
function everything(seed = 21) {
  const g = createGame({ seed, map: { design: 'warehouse', size: 'm' } });
  addPlayer(g, 'Dave');
  addPlayer(g, 'Steve');
  for (const p of g.players) p.cash = 1e6;
  for (let x = 6; x <= 34; x += 7) {
    place(g, 'crate', x, 5); place(g, 'belt', x, 6);
    place(g, 'sprinkler', x, 12, 0, 1); place(g, 'samples', x + 1, 15, 0, 1); place(g, 'wetfloor', x + 2, 11, 0, 1);
    applyCommand(g, 1, { c: 'upgrade', x, y: 12, t: 'spd' });
    applyCommand(g, 0, { c: 'upgrade', x, y: 5, t: 'dur' });
  }
  assert.ok(place(g, 'railgun', 20, 1, 1).ok);
  assert.ok(place(g, 'railgun', 12, 20, 3).ok);
  assert.ok(place(g, 'salesman', 14, 9).ok);
  assert.ok(place(g, 'salesman', 26, 14, 0, 1).ok);
  applyCommand(g, 0, { c: 'upgrade', x: 15, y: 10, t: 'dmg' });
  g.wave = 14;
  applyCommand(g, 0, { c: 'start' });
  return g;
}

test('a game with every new thing in it stays identical on a copy made mid-wave', () => {
  const a = everything();
  const seen = new Set();
  for (let i = 0; i < 30 * TICK_HZ; i++) for (const e of step(a)) seen.add(e.e);
  assert.ok(a.shoppers.some((m) => m.k === 'cosplay') || seen.has('shield'));
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 40 * TICK_HZ; i++) { for (const e of step(a)) seen.add(e.e); step(b); }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  for (const e of ['rail', 'pitch', 'pee', 'flash', 'kid', 'spray']) assert.ok(seen.has(e), `saw ${e}`);
  const kinds = new Set();
  for (const g of waveSpec(14, 2)) kinds.add(g.k);
  for (const k of NEW_KINDS) assert.ok(kinds.has(k));
});

test('host and client stay in step with the new buildings and shoppers, sent over the wire', () => {
  const TICK_MS = 1000 / TICK_HZ;
  const host = new HostSession({ name: 'Dave', seed: 13, map: { design: 'warehouse', size: 'm' } });
  // (The host's state is only changed directly before anyone has joined.)
  host.state.wave = 13;
  host.state.players[0].cash = 1e6;
  const [a, b] = memoryPair();
  host.accept(a);
  const client = new ClientSession(b, 'Steve');
  host.send({ c: 'give', to: 1, n: 50000 });
  host.send({ c: 'place', k: 'railgun', x: 20, y: 1, d: 1 });
  client.send({ c: 'place', k: 'salesman', x: 14, y: 9 });
  client.send({ c: 'upgrade', x: 15, y: 10, t: 'rng' });
  host.send({ c: 'upgrade', x: 20, y: 3, t: 'spd' });
  for (let x = 6; x <= 34; x += 7) { client.send({ c: 'place', k: 'sprinkler', x, y: 12 }); host.send({ c: 'place', k: 'crate', x, y: 5 }); }
  host.send({ c: 'start' });
  let now = 0;
  for (let i = 1; i <= 40 * TICK_HZ; i++) {
    now = i * TICK_MS;
    if (i === 300) client.send({ c: 'upgrade', x: 6, y: 12, t: 'dur' });
    if (i === 600) client.send({ c: 'rotate', x: 20, y: 2 });
    host.update(now);
    client.update(now);
  }
  host._advance();
  for (let i = 0; i < 4000 && client._n < host._n; i++) client.update(now += TICK_MS);
  assert.equal(JSON.stringify(client.state), JSON.stringify(host.state));
  assert.equal(client.stats.mismatches, 0);
  const st = host.state;
  assert.equal(st.grid[20 + 1 * st.w].u.spd, 1);
  assert.equal(st.grid[20 + 1 * st.w].d, 3);
  assert.equal(st.grid[14 + 9 * st.w].u.rng, 1);
  assert.ok(st.shoppers.some((m) => NEW_KINDS.includes(m.k)) || st.ws.stopped + st.ws.escaped > 0);
});

test('the checksum sees upgrades, hits and a building switched off; saves are version 3', () => {
  const s = stage();
  place(s, 'forklift', 5, 5);
  applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5 });
  const base = checksum(s);
  for (const tweak of [(x) => { x.grid[at(5, 5)].u.dmg = 2; }, (x) => { x.grid[at(5, 5)].u.rng = 1; }, (x) => { x.grid[at(5, 5)].hit = 1; }, (x) => { x.grid[at(5, 5)].off = 9; }]) {
    const c = JSON.parse(JSON.stringify(s));
    tweak(c);
    assert.notEqual(checksum(c), base);
  }
  assert.equal(s.v, 3);
  const storage = new Map();
  const store = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
  const g = createGame({ seed: 5, map: { design: 'warehouse', size: 'm' } });
  addPlayer(g, 'Dave');
  place(g, 'crate', 5, 5);
  store.setItem('returns-dept.save', JSON.stringify({ v: 1, at: 1, kind: 'solo', state: g }));
  assert.ok(readSave({ storage: store }));
  store.setItem('returns-dept.save', JSON.stringify({ v: 1, at: 1, kind: 'solo', state: { ...g, v: 2 } }));
  assert.equal(readSave({ storage: store }), null, 'a save from before these rules is ignored');
});
