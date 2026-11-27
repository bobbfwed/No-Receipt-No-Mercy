// Tests for the rules changed after the owner's playtest: easier difficulty, buildings bigger than
// one tile, tracks (from 0.4 raised by stock, not bought), durability and half-price rebuilding, the Barcode Laser, the
// TV Salesman, the longer forklift, the new rules for moms, four new shoppers, and the painted
// floor kept off the walls. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, step, queueTrainingWave, waveSpec, crowdShiftAt, getDist,
  footprint, anchorOf, tracksOf, levelIn, levelOf, spentOn, statsOf, rebuildDeal, addStock, itemCode,
  priceOf, pitchStop, SHOPPERS, SUPERS, BUILD, BACK, SHOP_KINDS, OFFICE, SETTINGS, TUNE, TICK_HZ, DT, ST, UNREACHABLE, MAP_SIZES, MAP_DESIGNS,
} from '../src/sim/index.js';
import { HostSession, ClientSession, checksum } from '../src/net/session.js';
import { memoryPair } from '../src/net/transports.js';
import { readSave } from '../src/ui/save.js';
import { factoryFacts } from '../src/content/facts.js';

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

test('Normal is the baseline, exactly x1 and x1; the other levels are round numbers relative to it', () => {
  assert.equal(SETTINGS.difficulty.normal.hp, 1);
  assert.equal(SETTINGS.difficulty.normal.pay, 1);
  assert.deepEqual(Object.values(SETTINGS.difficulty).map((d) => [d.hp, d.pay]), [[0.75, 1.25], [1, 1], [1.3, 0.85], [1.65, 0.7]]);
  // Normal's description gives no percentages.
  assert.ok(!/%/.test(SETTINGS.difficulty.normal.note));
  // Shoppers walk in with their base patience on Normal (the first event's patience multiplier is
  // 1: patience is phased in from TUNE.patienceFrom, 0.2.09).
  const g = createGame({ seed: 2 });
  addPlayer(g, 'Dave');
  applyCommand(g, 0, { c: 'start' });
  let h = null;
  for (let i = 0; i < 60 && !h; i++) { step(g); h = g.shoppers[0]; }
  assert.equal(h.mhp, SHOPPERS.hunter.hp);
  assert.equal(h.mhp, 36, 'what a Normal game gave her before 0.2.10 too (40 x 0.9)');
  // Training keeps the patience its lessons were written for (see TUNE.trainingPatienceDivisor).
  const s = stage();
  send(s, [{ k: 'hunter', n: 1, gap: 1, at: 0 }]);
  assert.equal(arrival(s, 'hunter').mhp, 40);
});

test('spot check per difficulty: the patience a shopper walks in with in sales event 9, and what each kind of goods sells for', () => {
  // Recorded with a fixed game (seed 4, a Bargain Hunter, a super Karen, a Dad and a super Pregnant
  // Lady walking in in event 9). Normal and Hard: the figures from BEFORE 0.2.10 made Normal the
  // baseline, unchanged. Easy and Brutal: their patience moved from x0.68 / 0.9 to x0.75 and from
  // x1.49 / 0.9 to x1.65, under 1% (before: Easy hunter 111.077547, Brutal hunter 243.390507).
  // Sale prices on every level: Easy $3 / $10 / $18, Normal $2 / $8 / $15,
  // Hard $2 / $7 / $12, Brutal $2 / $5 / $10 (a Mystery Box, a Gadget, a Gift Set; the Gift Set lower since 0.2.13).
  const want = {
    easy: { hunter: 110.2608, karen: 1874.4336, dad: 93.72168, preggo: 895.869, sells: 'Mystery Box $3, Gadget $10, Gift Set $18' },
    normal: { hunter: 147.0144, karen: 2499.2448, dad: 124.96224, preggo: 1194.492, sells: 'Mystery Box $2, Gadget $8, Gift Set $15' },
    hard: { hunter: 191.11872, karen: 3249.01824, dad: 162.450912, preggo: 1552.8396, sells: 'Mystery Box $2, Gadget $7, Gift Set $12' },
    brutal: { hunter: 242.57376, karen: 4123.75392, dad: 206.187696, preggo: 1970.9118, sells: 'Mystery Box $2, Gadget $5, Gift Set $10' },
  };
  for (const [diff, w] of Object.entries(want)) {
    const s = createGame({ seed: 4, settings: { difficulty: diff } });
    addPlayer(s, 'Dave');
    s.wave = 8;
    place(s, 'unpacker', 3, 3, 0); place(s, 'belt', 4, 3, 0); place(s, 'chute', 5, 3);
    applyCommand(s, 0, { c: 'start' });
    s.spawnQ = ['hunter', 'karen', 'dad', 'preggo'].map((k, i) => [s.tick + 1 + i, k, i % 2, -1]);
    s.shoppers = [];
    let sale = null;
    for (let i = 0; i < 10 * TICK_HZ && !sale; i++) for (const e of step(s)) if (e.e === 'sale') sale = e;
    for (const k of ['hunter', 'karen', 'dad', 'preggo']) {
      const m = s.shoppers.find((x) => x.k === k);
      assert.ok(Math.abs(m.mhp - w[k]) < 1e-6, `${diff} ${k}: ${m.mhp} against ${w[k]}`);
    }
    assert.equal(`Mystery Box $${sale.v}`, w.sells.split(',')[0], `${diff}: a box sells for what it did`);
    assert.equal(factoryFacts('chute', SETTINGS.difficulty[diff].pay).find(([label]) => label === 'Sells')[1], w.sells, diff);
  }
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

test('remove and rotate work from any tile of a big building, on the whole building', () => {
  const s = stage();
  place(s, 'railgun', 5, 3, 0);
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
  // Selling from its far end takes the whole thing and pays back its share of what was paid.
  const cash = s.players[0].cash, spent = spentOn(s.grid[at(5, 3)]);
  assert.equal(spent, BUILD.railgun.cost);
  const out = [];
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 7, y: 3 }, out).ok);
  for (const x of [5, 6, 7]) assert.equal(s.grid[at(x, 3)], 0);
  assert.equal(s.players[0].cash, cash + Math.floor(spent * TUNE.sellBack));
  assert.equal(out[0].x, 5, 'the event names the top-left tile');
});

// ---------------------------------------------------------------- tracks, raised by stock (0.4)

test('each kind has the tracks it should, and only stock raises their levels', () => {
  const want = {
    sprinkler: ['dmg', 'spd', 'rng', 'dur'], forklift: ['dmg', 'spd', 'rng', 'dur'], railgun: ['dmg', 'spd', 'rng', 'dur'],
    wetfloor: ['dmg', 'dur'], samples: ['dmg', 'rng', 'dur'], salesman: ['dmg', 'rng', 'dur'],
    // (Bought upgrades went in 0.4: the old factory and crates have no Dumbwaiter, so no tracks.)
    unpacker: [], press: [], packer: [], belt: [], chute: [], crate: [],
  };
  assert.deepEqual(Object.keys(want).sort(), [...SHOP_KINDS].sort());
  for (const [k, ts] of Object.entries(want)) assert.deepEqual(tracksOf(k), ts, k);

  const s = stage();
  place(s, 'sprinkler', 5, 5);
  const b = s.grid[at(5, 5)];
  assert.equal(levelIn(b, 'dmg'), 0, 'as built, every track is at 0');
  // One unit of Store Brand Bottled Spite works like BACK.tierLevel[1] levels of damage, and only damage.
  addStock(b, itemCode(1, 1));
  assert.equal(levelIn(b, 'dmg'), BACK.tierLevel[1]);
  assert.equal(levelIn(b, 'spd'), 0);
  // There is no command to buy a level any more.
  assert.equal(applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5, t: 'dmg' }).why, 'bad');
});

test('the stats of any mix of stock, the overall level, and what was spent', () => {
  // Runs of [tier, uses]: damage Store Brand (2 levels), speed Name Brand (4), range Premium (6),
  // and Duct Tape, which soaks up hits and is never counted as levels.
  const f = { k: 'forklift', s: { dmg: [1, 6], spd: [2, 6], rng: [3, 6], dur: [1, 1] } };
  const st = statsOf(f);
  assert.ok(Math.abs(st.dmg - 30 * 1.3 ** 2) < 1e-9);
  assert.ok(Math.abs(st.cd - 1.6 / 1.12 ** 4) < 1e-9);
  assert.ok(Math.abs(st.range - (6 + 0.3 * 6)) < 1e-9);
  assert.equal(st.hits, 1);
  assert.equal(levelOf(f), 1 + 2 + 4 + 6);
  // Stock is never money: what was spent is only what was paid for it (a card's price where it differs).
  assert.equal(spentOn(f), 200);
  assert.equal(spentOn({ ...f, c: 150 }), 150);
  assert.deepEqual(statsOf({ k: 'forklift' }), statsOf({ k: 'forklift', s: {} }));
  assert.equal(statsOf({ k: 'railgun' }).hits, 2);
  assert.equal(statsOf({ k: 'salesman', s: { dur: [2, 4] } }).hits, 2);
  assert.equal(statsOf({ k: 'crate' }).hits, 1);
  const sign = statsOf({ k: 'wetfloor', s: { dmg: [1, 10] } });
  assert.ok(Math.abs(sign.slow - TUNE.wetSlow * 0.82 ** 2) < 1e-9 && Math.abs(sign.slip - (TUNE.slipChance + 0.16)) < 1e-9);
  assert.ok(Math.abs(sign.slipDmg - TUNE.slipDmg * 1.45 ** 2) < 1e-9);
  // The old factory runs at its one speed.
  assert.ok(Math.abs(statsOf({ k: 'press' }).time - 2.5) < 1e-9);
});

test('a tower stocked with Rage Cola really fires more often', () => {
  const s = stage();
  place(s, 'sprinkler', 5, 5);
  const b = s.grid[at(5, 5)];
  // Name Brand Rage Cola: four levels of speed, with uses to spare.
  b.s = { spd: [2, 100] };
  // After a spray it waits its stocked time, not the plain one.
  send(s, [{ k: 'karen', n: 1, gap: 1, at: 0 }]);
  pin(arrival(s, 'karen'), 6.5, 6.5);
  let fired = false;
  for (let i = 0; i < 30 && !fired; i++) fired = step(s).some((e) => e.e === 'spray');
  assert.ok(fired);
  assert.equal(b.cd, Math.round((0.5 / 1.1 ** BACK.tierLevel[2]) * TICK_HZ));
});

// ---------------------------------------------------------------- durability, rubble and rebuilding

test('a gym bro takes two hits to destroy a big building, and its rubble remembers everything', (t) => {
  // (About big buildings and rubble, not his limit, so this one may hit as often as he likes.)
  tune(t, { smashOther: 1, smashMax: 1000, smashWait: 0 });
  const s = stage(4);
  // A corridor along row 7 lined with barcode lasers, one stocked with Bottled Spite.
  for (let x = 3; x <= 24; x += 3) { place(s, 'railgun', x, 6, 0); place(s, 'railgun', x, 8, 0); }
  s.grid[at(9, 6)].s = { dmg: [2, 2] };
  send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  arrival(s, 'gymbro').hp = 1e9;
  const ev = play(s, 120).filter((e) => e.e === 'smash');
  const byGun = new Map();
  for (const e of ev) {
    assert.equal(s.grid[e.i] === 0 || s.grid[e.i].part === undefined, true, 'events name the anchor tile');
    (byGun.get(e.i) || byGun.set(e.i, []).get(e.i)).push(e.left);
  }
  const destroyed = [...byGun.entries()].filter(([, lefts]) => lefts.includes(0));
  assert.ok(destroyed.length >= 2, `${destroyed.length} barcode lasers destroyed`);
  for (const [i, lefts] of destroyed) {
    assert.deepEqual(lefts, [1, 0], 'one hit to spare, then gone');
    for (let x = 0; x < 3; x++) assert.equal(s.grid[i + x], 0, 'every tile is cleared');
    const r = s.rubble.find((q) => q.i === i);
    assert.equal(r.k, 'railgun');
    assert.equal(r.d, 0);
    assert.equal(r.o, 0);
  }
  // Its stock does not survive it: the rubble keeps only what a rebuild needs.
  const up = s.rubble.find((q) => q.i === at(9, 6));
  if (up) assert.deepEqual(up, { i: at(9, 6), k: 'railgun', d: 0, o: 0 });
});

test('a crate falls to a gym bro\'s first hit, and he walks through where it stood', (t) => {
  // (Crate Stacks have no Dumbwaiter, so since 0.4 nothing makes them tougher.)
  tune(t, { smashOther: 0 });
  for (const sup of [0, 1]) {
    const s = stage(2);
    // A wall of belts with a crate in it on the gym bro's way, and a gap far away for everyone else.
    for (let y = 1; y <= 13; y++) assert.ok(place(s, y === 7 ? 'crate' : 'belt', 12, y, 1).ok);
    send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0, sup }]);
    const sh = arrival(s, 'gymbro');
    sh.hp = 1e9;
    const hits = [];
    let round = false;
    const ev = play(s, 200, (e) => {
      for (const x of e) if (x.e === 'smash' && x.i === at(12, 7)) hits.push(x.left);
      if (s.shoppers.includes(sh) && (sh.y | 0) === 14 && (sh.x | 0) === 12) round = true;
    });
    assert.equal(ev.filter((e) => e.e === 'escape').length, 1, 'he gets out in the end');
    assert.deepEqual(hits, [0], 'the crate falls to his first hit');
    assert.equal(round, false, 'and he walks through where it stood');
  }
});

test('rebuilding costs half of what was paid, all or nothing', () => {
  // (Until 0.4 a player short of the full price got the building back with fewer upgrades.)
  const r = { i: 0, k: 'forklift', d: 0, o: 0 };
  assert.deepEqual(rebuildDeal(r, 1000), { pay: 100 });
  assert.deepEqual(rebuildDeal(r, 100), { pay: 100 });
  assert.equal(rebuildDeal(r, 99), null);
  // A card's price (c) is what was paid, so the rebuild is half of that.
  assert.deepEqual(rebuildDeal({ ...r, c: 150 }, 1000), { pay: 75 });
  assert.equal(TUNE.rebuildShare, 0.5);

  // The rebuild command: oldest first, his own only. (Since 0.3.04 it also says what it held for
  // wrecks that must wait, none here, and what it took in all.)
  const s = stage();
  addPlayer(s, 'Steve');
  s.rubble.push({ ...r, i: at(5, 5) }, { i: at(7, 5), k: 'crate', d: 0, o: 1 }, { i: at(9, 5), k: 'railgun', d: 1, o: 0 });
  s.players[0].cash = 100 + 99;
  const ev = [];
  const res = applyCommand(s, 0, { c: 'rebuild' }, ev);
  assert.deepEqual(res, { ok: true, n: 1, held: 0, paid: 100 });
  assert.deepEqual(ev, [{ e: 'rebuilt', by: 0, n: 1 }]);
  assert.equal(s.grid[at(5, 5)].k, 'forklift');
  assert.equal(s.players[0].cash, 99);
  assert.equal(s.grid[at(9, 5)], 0, 'not enough left for the barcode laser');
  assert.equal(s.rubble.length, 2);
  s.players[0].cash = 350;
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }), { ok: true, n: 1, held: 0, paid: 350 });
  assert.deepEqual(s.grid[at(9, 6)], { k: 'railgun', part: at(9, 5) }, 'back on its side, as it was');
  assert.equal(s.grid[at(9, 5)].d, 1);
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).why, 'empty', 'Steve\'s crate is his to rebuild');
  s.players[0].cash = 100;
  assert.ok(applyCommand(s, 0, { c: 'rebuild', all: true }).ok, 'unless asked to rebuild everybody\'s');
  assert.equal(s.rubble.length, 0);
});

test('placing the same kind on its rubble brings it back as it was, at the rebuild price', () => {
  const s = stage();
  const r = { i: at(5, 5), k: 'railgun', d: 0, o: 0 };
  s.rubble.push(r, { i: at(5, 9), k: 'crate', d: 0, o: 0 });
  // Half of what was paid for it is all that is needed to place it.
  s.players[0].cash = 349;
  assert.equal(canPlace(s, 'railgun', 6, 5, 0, 1), 'cash');
  s.players[0].cash = 350;
  assert.equal(canPlace(s, 'railgun', 6, 5, 0, 1), null);
  // Pointing at its middle, facing another way: it goes back where and how it was.
  s.players[0].cash = 1000;
  const ev = [];
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'railgun', x: 6, y: 5, d: 1 }, ev).ok);
  assert.equal(s.grid[at(5, 5)].d, 0);
  assert.deepEqual(s.grid[at(7, 5)], { k: 'railgun', part: at(5, 5) });
  assert.equal(s.players[0].cash, 1000 - 350);
  assert.deepEqual(ev[0], { e: 'placed', k: 'railgun', x: 5, y: 5, d: 0, by: 0, rebuilt: 1 });
  assert.equal(s.rubble.length, 1);
  // Something else on the rubble just clears it, at the normal price.
  const cash = s.players[0].cash;
  assert.ok(place(s, 'belt', 5, 9, 0).ok);
  assert.equal(s.players[0].cash, cash - BUILD.belt.cost);
  assert.equal(s.rubble.length, 0);
  assert.equal(s.grid[at(5, 9)].k, 'belt');
});

// ---------------------------------------------------------------- barcode laser

test('the barcode laser fires down the line it faces, through everything, and hits every shopper in line', () => {
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
  // (A Karen is tough against the Barcode Laser since 0.3.01: she loses TUNE.toughMul of it.)
  assert.ok(Math.abs(a.mhp - a.hp - BUILD.railgun.dmg * TUNE.toughMul) < 1e-9);
  assert.equal(b.hp, b.mhp);
});

test('a Karen near the barcode laser slows its reload', () => {
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

/**
 * Sends `n` shoppers of a kind past a salesman and counts what he did to them. With `tier`, he is
 * stocked with Bottled Spite of that tier (uses to spare, so it never runs out mid-test).
 */
function pitched(k, n, tier = 0, seed = 7) {
  const s = stage(seed);
  place(s, 'salesman', 14, 4);
  if (tier) s.grid[at(14, 4)].s = { dmg: [tier, 1e6] };
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
  // His pitch: each level makes stopping likelier and hurrying less likely. (Name Brand: 4 levels.)
  const sold = pitched('dad', 150, 2);
  assert.equal(BACK.tierLevel[2], 4);
  assert.ok(sold.stop > dads.stop + 0.15, `stocked: dads stopped ${sold.stop}`);
  assert.ok(sold.rush < dads.rush, `stocked: dads hurried ${sold.rush}`);
  const st = statsOf(sold.salesman);
  assert.ok(Math.abs(st.secs - TUNE.stopSecs * 1.15 ** 4) < 1e-9 && Math.abs(st.stopLeft - 0.88 ** 4) < 1e-9 && Math.abs(st.rushMul - 0.85 ** 4) < 1e-9);
});

test('a pitched shopper sets off for the stand to watch for the stop time, or hurries at 1.4 times his speed, and is left alone for 9 seconds', () => {
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
      if (e.r === 'stop') { assert.equal(m.sa, at(14, 4), 'on his way to the stand'); assert.equal(m.sw, Math.round(TUNE.stopSecs * TICK_HZ)); assert.equal(e.i, at(14, 4)); }
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

test('each repeat pitch by the same salesman works half as well; another salesman gets his full first go', () => {
  assert.equal(TUNE.pitchRepeat, 0.5);
  const first = pitchStop(0.8, 0.88 ** 3, 0);
  assert.ok(Math.abs(first - (1 - 0.2 * 0.88 ** 3)) < 1e-12, 'the first pitch is the chance as written');
  for (let n = 1; n < 6; n++) assert.ok(Math.abs(pitchStop(0.8, 0.88 ** 3, n) - first * 0.5 ** n) < 1e-12, `pitch ${n + 1}`);
  assert.equal(pitchStop(0, 0.5, 0), 0, 'a blind man still never sees the screen');
  // In play: the count is kept per stand, by the stand's tile.
  const s = stage(3);
  place(s, 'salesman', 14, 4);
  // (Far enough along that the two reaches do not overlap on the route.)
  assert.ok(place(s, 'salesman', 24, 9).ok);
  // Platinum Bottled Spite: his pitch at its strongest (uses to spare).
  s.grid[at(14, 4)].s = { dmg: [4, 1e6] };
  send(s, [{ k: 'scooter', n: 12, gap: 1.5, at: 0 }]);
  let most = 0, both = false;
  play(s, 900, () => {
    for (const m of s.shoppers) {
      if (!m.pn) continue;
      for (const [key, n] of Object.entries(m.pn)) {
        assert.ok(key === String(at(14, 4)) || key === String(at(24, 9)), `keyed by a stand's tile: ${key}`);
        most = Math.max(most, n);
      }
      if (Object.keys(m.pn).length === 2) both = true;
    }
  });
  assert.ok(most >= 2, 'some scooters were pitched to more than once');
  assert.ok(both, 'and some by both salesmen');
  // Even slow scooters and a fully sold salesman let everyone go in the end.
  assert.equal(s.shoppers.length, 0, `${s.shoppers.length} scooters still held at the stand`);
  JSON.parse(JSON.stringify(s));
});

/** Plays a wave past a stand on (14,4)-(15,5) and returns where each stopped shopper was pitched and where he watched from. */
function walkUps(s, groups) {
  send(s, groups);
  const from = new Map(), stops = [];
  play(s, 300, (tick) => {
    for (const e of tick) {
      if (e.e === 'pitch' && e.r === 'stop') {
        // (The one pitched this tick still has all his walking time.)
        const m = s.shoppers.find((q) => q.sa !== undefined && q.sl === Math.round(TUNE.pitchWalkSecs * TICK_HZ) && q.x === e.x && q.y === e.y);
        from.set(m.id, [e.x, e.y]);
      } else if (e.e === 'watching') {
        // (Several may be watching from the same spot: this is the one who has only just stopped.)
        const m = s.shoppers.filter((q) => q.st === ST.WATCH && q.x === e.x && q.y === e.y).sort((p, q) => q.t - p.t)[0];
        assert.equal(m.t, Math.round(TUNE.stopSecs * TICK_HZ), 'he watches for the whole stop time once he is there');
        assert.equal(m.sa, undefined);
        stops.push({ x: e.x, y: e.y, tx: Math.floor(e.x), ty: Math.floor(e.y), from: from.get(m.id) });
      }
    }
  });
  return stops;
}
const toStand = (x, y) => Math.hypot(x - 15, y - 5); // the middle of the stand on (14,4)-(15,5)

test('a shopper the salesman stops walks up to the stand before he stops', () => {
  const s = stage(3);
  place(s, 'salesman', 14, 4);
  const stops = walkUps(s, [{ k: 'scooter', n: 12, gap: 1.5, at: 0 }]);
  assert.ok(stops.length >= 6, `${stops.length} scooters stopped`);
  for (const p of stops) {
    // Beside the stand: on a tile that shares an edge with one of its four.
    const beside = [[14, 4], [15, 4], [14, 5], [15, 5]].some(([bx, by]) => Math.abs(p.tx - bx) + Math.abs(p.ty - by) === 1);
    assert.ok(beside, `watching from ${p.tx},${p.ty}`);
    assert.ok(toStand(p.x, p.y) < toStand(...p.from) - 0.5, 'nearer than where the pitch caught him');
  }
});

test('if something is in the way he gets as near as he can and watches from there', () => {
  const s = stage(3);
  place(s, 'salesman', 14, 4);
  // A wall of crates between the stand and the route along rows 7 and 8.
  for (let x = 9; x <= 20; x++) assert.ok(place(s, 'crate', x, 6).ok);
  const stops = walkUps(s, [{ k: 'scooter', n: 12, gap: 1.5, at: 0 }]);
  assert.ok(stops.length >= 6, `${stops.length} scooters stopped`);
  for (const p of stops) {
    assert.equal(p.ty, 7, `against the crates, on row 7 (was at ${p.tx},${p.ty})`);
    assert.ok(p.tx === 14 || p.tx === 15, `level with the stand (was at ${p.tx},${p.ty})`);
  }
  // What is in the way depends on who is walking: a belt stops a scooter, and a dad steps onto it.
  for (const [k, n, row] of [['scooter', 12, 7], ['dad', 80, 6]]) {
    const g = stage(4);
    place(g, 'salesman', 14, 4);
    for (let x = 9; x <= 20; x++) assert.ok(place(g, 'belt', x, 6).ok);
    const seen = walkUps(g, [{ k, n, gap: 1.2, at: 0 }]);
    assert.ok(seen.length >= 5, `${seen.length} ${k}s stopped`);
    for (const p of seen) assert.equal(p.ty, row, `a ${k} watches from row ${row} (was at ${p.tx},${p.ty})`);
  }
});

test('a stand that is sold or switched off while he walks over is forgotten, and he walks on', () => {
  for (const how of ['sold', 'off']) {
    const s = stage(3);
    place(s, 'salesman', 14, 4);
    send(s, [{ k: 'scooter', n: 6, gap: 2, at: 0 }]);
    let gone = false, watched = 0;
    play(s, 200, (tick) => {
      if (tick.some((e) => e.e === 'watching')) watched++;
      if (!gone && tick.some((e) => e.e === 'pitch' && e.r === 'stop')) {
        gone = true;
        if (how === 'sold') assert.ok(applyCommand(s, 0, { c: 'remove', x: 14, y: 4 }).ok);
        else s.grid[at(14, 4)].off = 1e6;
      } else if (gone) {
        for (const m of s.shoppers) assert.equal(m.sa, undefined, 'nobody is still heading for it');
      }
    });
    assert.ok(gone, 'somebody was pitched');
    assert.equal(watched, 0, `${how}: nobody stopped to watch`);
    assert.equal(s.refunds, 6, 'and they all carried on to the tills');
  }
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
  tune(t, { kidChance: 100, kidMin: 15, kidMax: 15, kidFirstMin: 2, kidFirstMax: 2 });
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
  tune(t, { kidChance: 100, kidRest: 2, kidFirstMin: 1, kidFirstMax: 1 });
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
  tune(t, { kidChance: 100, kidMin: 8, kidMax: 8, kidFirstMin: 2, kidFirstMax: 2 });
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
  // The first four waves are what they were, except that every group is first multiplied by the
  // wave's crowd shift (TUNE.crowdCurves: more shoppers early) and rounded, then halved, a
  // half rounded down and never below one (TUNE.crowdScale, 0.2.09), and arrives over the same
  // time, so its gaps are longer.
  const old = (n) => {
    const g = [{ k: 'hunter', n: 6 + 2 * n, gap: 0.9, at: 0 }];
    if (n >= 2) g.push({ k: 'dad', n: 1 + n, gap: 0.3, at: 10 });
    if (n >= 3) g.push({ k: 'clipper', n: 3 * (n - 1), gap: 0.35, at: 5 });
    if (n >= 3) g.push({ k: 'mom', n: 1 + Math.floor(n / 3), gap: 3, at: 6 });
    if (n >= 4) g.push({ k: 'teen', n: Math.floor(n / 2), gap: 2.5, at: 3 });
    return g.map((x) => {
      const half = Math.max(1, Math.floor(Math.max(1, Math.round(x.n * crowdShiftAt(n))) * TUNE.crowdScale + 0.5 - 1e-9));
      return { ...x, n: half, gap: (x.gap * x.n) / half, sup: 0 };
    });
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
  // (A cosplayer is weak to forklifts since 0.3.01: he loses TUNE.weakMul of every shot he takes.)
  assert.ok(Math.abs(a.c.mhp - a.c.hp - a.shots * BUILD.forklift.dmg * TUNE.weakMul) < 1e-9, 'the cosplayer took every shot');
  const shields = a.ev.filter((e) => e.e === 'shield');
  assert.ok(shields.length >= 1 && shields.length <= 2, 'no more than once a second');
  // Further away than his costume reaches, the hunter takes it himself.
  pin(a.c, 13, 7.5);
  for (let i = 0; i < 2 * TICK_HZ; i++) step(a.s);
  assert.ok(a.h.hp < a.h.mhp);
  // The super one takes only half of what he soaks up.
  const b = run(1);
  assert.ok(Math.abs(b.c.mhp - b.c.hp - b.shots * BUILD.forklift.dmg * 0.5 * TUNE.weakMul) < 1e-9);
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
    // Stock from The Back on some of it (as if it had come up the Dumbwaiters): Rage Cola and Duct Tape.
    const sp = g.grid[12 * g.w + x];
    addStock(sp, itemCode(2, 1));
    addStock(sp, itemCode(4, 2));
  }
  assert.ok(place(g, 'railgun', 20, 1, 1).ok);
  assert.ok(place(g, 'railgun', 12, 20, 3).ok);
  assert.ok(place(g, 'salesman', 14, 9).ok);
  assert.ok(place(g, 'salesman', 26, 14, 0, 1).ok);
  addStock(g.grid[9 * g.w + 14], itemCode(1, 3));
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
  client.send({ c: 'give', to: 0, n: 1000 });
  host.send({ c: 'place', k: 'wetfloor', x: 18, y: 7 });
  for (let x = 6; x <= 34; x += 7) { client.send({ c: 'place', k: 'sprinkler', x, y: 12 }); host.send({ c: 'place', k: 'crate', x, y: 5 }); }
  host.send({ c: 'start' });
  let now = 0;
  for (let i = 1; i <= 40 * TICK_HZ; i++) {
    now = i * TICK_MS;
    if (i === 300) client.send({ c: 'remove', x: 6, y: 12 });
    if (i === 600) client.send({ c: 'rotate', x: 20, y: 2 });
    host.update(now);
    client.update(now);
  }
  host._advance();
  for (let i = 0; i < 4000 && client._n < host._n; i++) client.update(now += TICK_MS);
  assert.equal(JSON.stringify(client.state), JSON.stringify(host.state));
  assert.equal(client.stats.mismatches, 0);
  const st = host.state;
  assert.equal(st.grid[20 + 1 * st.w].d, 3);
  assert.equal(st.grid[14 + 9 * st.w].k, 'salesman');
  assert.equal(st.grid[18 + 7 * st.w].k, 'wetfloor');
  assert.equal(st.grid[6 + 12 * st.w], 0, 'the client\'s removal crossed the wire');
  assert.ok(st.shoppers.some((m) => NEW_KINDS.includes(m.k)) || st.ws.stopped + st.ws.escaped > 0);
});

test('the checksum sees stock, hits and a building switched off; saves are version 4, and 3 still loads', () => {
  const s = stage();
  place(s, 'forklift', 5, 5);
  s.grid[at(5, 5)].s = { dmg: [1, 6] };
  const base = checksum(s);
  for (const tweak of [(x) => { x.grid[at(5, 5)].s.dmg[0] = 2; }, (x) => { x.grid[at(5, 5)].s.dmg[1] = 5; }, (x) => { x.grid[at(5, 5)].s.rng = [1, 6]; }, (x) => { x.grid[at(5, 5)].hit = 1; }, (x) => { x.grid[at(5, 5)].off = 9; }]) {
    const c = JSON.parse(JSON.stringify(s));
    tweak(c);
    assert.notEqual(checksum(c), base);
  }
  assert.equal(s.v, 4, 'version 4 since 0.2.09 (the refund limit was halved; see migrateSave)');
  const storage = new Map();
  const store = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
  const g = createGame({ seed: 5, map: { design: 'warehouse', size: 'm' } });
  addPlayer(g, 'Dave');
  place(g, 'crate', 5, 5);
  store.setItem('returns-dept.save', JSON.stringify({ v: 1, at: 1, kind: 'solo', state: g }));
  assert.ok(readSave({ storage: store }));
  store.setItem('returns-dept.save', JSON.stringify({ v: 1, at: 1, kind: 'solo', state: { ...g, v: 3 } }));
  assert.ok(readSave({ storage: store }), 'a save from before 0.2.09 loads (and is migrated when resumed)');
  store.setItem('returns-dept.save', JSON.stringify({ v: 1, at: 1, kind: 'solo', state: { ...g, v: 2 } }));
  assert.equal(readSave({ storage: store }), null, 'a save from before these rules is ignored');
});
