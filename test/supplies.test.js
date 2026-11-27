// Tests for The Back's supplies (0.4, stage 3): the machines, the Rebrander, the Dumbwaiters under
// the security buildings, stock on those buildings, the levels stock gives, stock being used up, and
// the dropUp command. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, queueTrainingWave, canPlace, canPlaceBack,
  BACK, BUILD, TUNE, TICK_HZ, JUNK, itemCode, dropTicks, newPart, wants, give, stepBack, beltShape,
  statsOf, levelIn, stockLevel, spentOn, rebuildDeal,
  usesPer, unitsIn, usesIn, takesSupply, addStock, useStock, useWork, dropUpCost,
} from '../src/sim/index.js';
import { checksum } from '../src/net/session.js';

const E = 0, S = 1, W = 2, N = 3;
const MACHINES = { still: 1, cannery: 2, spooler: 3, winder: 4, bender: 5 };
const ticks = (secs) => Math.max(1, Math.round(secs * TICK_HZ));

/**
 * The original 30 x 16 training map (entrance on the left at rows 7-8, tills on the right, pillars
 * at 8,4 20,4 8,11 20,11), with Dave and plenty of cash. Training: the build phase never runs out,
 * and The Back runs in it.
 */
function stage(seed = 3) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}
const idx = (s, x, y) => y * s.w + x;
const at = (s, x, y) => s.back[idx(s, x, y)];
const bld = (s, x, y) => s.grid[idx(s, x, y)];
/** Puts a part straight into The Back (no command, no price), as a test needs it. */
function lay(s, x, y, k, d = 0) {
  const p = k === 'drop' ? { k: 'drop', d, t: dropTicks(0), lv: 0 } : newPart(k, 0, d);
  s.back[idx(s, x, y)] = p;
  s.backVer++;
  return p;
}
function row(s, x0, x1, y, d) { for (let x = x0; x <= x1; x++) lay(s, x, y, 'conv', d); }
const place = (s, k, x, y, d = 0) => applyCommand(s, 0, { c: 'place', k, x, y, d });
function placeOk(s, k, x, y, d = 0) { const r = place(s, k, x, y, d); assert.ok(r.ok, `${k} at ${x},${y}: ${r.why}`); return bld(s, x, y); }
function run(s, n, ev = []) { for (let t = 0; t < n; t++) stepBack(s, ev); return ev; }
/** The codes on a belt lane, front first. */
const codesOn = (it) => it.filter((_, k) => k % 2 === 0);
/** Every Dumbwaiter in The Back, as [tile, anchor]. */
function lifts(s) {
  const out = [];
  s.back.forEach((p, i) => { if (p && p.k === 'lift') out.push([i, p.a]); });
  return out;
}
/** Temporarily changes tuning numbers for one test. */
function tune(t, changes, obj = TUNE) {
  const old = {};
  for (const k of Object.keys(changes)) { old[k] = obj[k]; obj[k] = changes[k]; }
  t.after(() => Object.assign(obj, old));
}
/** Sends a training wave and plays it to its end (or a time limit), collecting events. */
function wave(s, groups, seconds = 120, each = null) {
  queueTrainingWave(s, groups);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  const all = [];
  for (let n = 0; n < seconds * TICK_HZ; n++) {
    const ev = step(s);
    // (Shoppers who never give up, so they stay in reach as long as the route keeps them.)
    for (const sh of s.shoppers) if (sh.mhp < 1e9) sh.hp = sh.mhp = 1e9;
    for (const e of ev) all.push(e);
    if (each) each(ev);
    if (ev.some((e) => e.e === 'waveEnd')) break;
  }
  return all;
}
/** Rows 6 and 8 lined with kind k from x0 to x1: a corridor along row 7 everyone must walk. */
function corridor(s, k = 'crate', x0 = 2, x1 = 27, skip = []) {
  for (let x = x0; x <= x1; x++) for (const y of [6, 8]) if (!skip.some(([a, b]) => a === x && b === y)) placeOk(s, k, x, y);
}

test('the numbers are the work package\'s', () => {
  assert.equal(BACK.makeSecs, 2);
  assert.deepEqual(BACK.rebrandSecs, [0, 4, 8, 16]);
  assert.equal(BACK.stockUnits, 6);
  assert.deepEqual(BACK.tierLevel, [0, 2, 4, 6, 8]);
  assert.deepEqual(BACK.tapeHits, [0, 1, 2, 3, 4]);
  assert.deepEqual(BACK.wireTurns, [0, 3, 6, 10, 15]);
  assert.deepEqual([BACK.dropUpCost, BACK.dropUpGrow, BACK.dropUpMax, BACK.dropMul], [150, 1.6, 5, 0.85]);
  for (const k of Object.keys(MACHINES)) assert.deepEqual([BUILD[k].cost, BUILD[k].back, BUILD[k].supply], [40, true, MACHINES[k]], k);
  assert.equal(BUILD.rebrand.cost, 15, 'a Rebrander (0.4 stage 7: was 50)');
  assert.ok(BUILD.lift.back && BUILD.lift.fixed, 'nobody buys or removes a Dumbwaiter');
  const shots = { sprinkler: 20, forklift: 6, railgun: 2, wetfloor: 10, samples: 8, salesman: 8 };
  for (const k of Object.keys(BUILD)) assert.equal(!!BUILD[k].lift, k in shots, `${k} has Dumbwaiters`);
  for (const [k, n] of Object.entries(shots)) assert.equal(BUILD[k].shots, n, k);
});

test('each machine turns junk into its own supply, one every makeSecs, and waits while its front is blocked', () => {
  for (const [k, type] of Object.entries(MACHINES)) {
    const s = stage();
    const m = lay(s, 5, 5, k, E);
    row(s, 6, 15, 5, E);
    const mi = idx(s, 5, 5);
    // Junk from behind and both sides, never from the front; nothing but junk.
    assert.ok(wants(s, mi, JUNK, E) && wants(s, mi, JUNK, S) && wants(s, mi, JUNK, N), k);
    assert.ok(!wants(s, mi, JUNK, W), `${k}: not from its front`);
    assert.ok(!wants(s, mi, itemCode(1, 1), E), `${k}: not a supply`);
    const feed = (n) => { for (let t = 0; t < n; t++) { if (wants(s, mi, JUNK, E)) give(s, mi, JUNK, E); stepBack(s); } };
    const made = () => { let n = 0; for (let x = 6; x <= 15; x++) n += at(s, x, 5).it.length / 2; return n; };
    const T = ticks(BACK.makeSecs);
    feed(1 + 5 * T - 1);
    assert.equal(made(), 4, `${k}: four in five makeSecs less a tick`);
    feed(1);
    assert.equal(made(), 5, `${k}: the fifth exactly on time`);
    for (let x = 6; x <= 15; x++) for (const c of codesOn(at(s, x, 5).it)) assert.equal(c, itemCode(type, 1), k);
    assert.ok(m.n <= 2, `${k} holds at most two waiting`);
  }
  // Blocked: nothing in front. It makes one, holds it, and starts nothing more.
  const s = stage();
  const m = lay(s, 5, 5, 'cannery', E);
  const mi = idx(s, 5, 5);
  for (let t = 0; t < 10 * ticks(BACK.makeSecs); t++) { if (wants(s, mi, JUNK, E)) give(s, mi, JUNK, E); stepBack(s); }
  assert.deepEqual([m.out, m.t, m.n], [itemCode(2, 1), 0, 2], 'one made and waiting, two junk waiting, nothing started');
  assert.ok(!wants(s, mi, JUNK, N), 'full');
  // Clear the way: it goes out at once, and the next is started the same tick.
  lay(s, 6, 5, 'bin');
  stepBack(s);
  assert.deepEqual([m.out, m.t, m.n], [0, ticks(BACK.makeSecs), 1]);
});

test('Rebrander: one tier up, rebrandSecs by the tier going in; refuses Platinum, junk and its front; two waiting', () => {
  const s = stage();
  const r = lay(s, 5, 5, 'rebrand', E);
  row(s, 6, 12, 5, E);
  const ri = idx(s, 5, 5);
  assert.ok(!wants(s, ri, itemCode(3, 4), E), 'Platinum cannot go higher');
  assert.ok(!wants(s, ri, JUNK, E), 'no junk');
  assert.ok(!wants(s, ri, itemCode(3, 1), W), 'not from its front');
  for (const tier of [1, 2, 3]) {
    const code = itemCode(3, tier);
    assert.ok(wants(s, ri, code, S));
    give(s, ri, code, S);
    const T = ticks(BACK.rebrandSecs[tier]);
    run(s, T);
    assert.equal(at(s, 6, 5).it.length, 0, `tier ${tier}: not before ${BACK.rebrandSecs[tier]} s`);
    run(s, 1);
    assert.deepEqual(codesOn(at(s, 6, 5).it), [code + 1], `tier ${tier} comes out as tier ${tier + 1}`);
    at(s, 6, 5).it.length = 0;
  }
  assert.ok(BACK.rebrandSecs[1] < BACK.rebrandSecs[2] && BACK.rebrandSecs[2] < BACK.rebrandSecs[3], 'slower each tier');
  // One being worked and two waiting; a third waits on the belt.
  for (let n = 0; n < 2; n++) assert.ok(give(s, ri, itemCode(1, 1), E));
  assert.ok(!wants(s, ri, itemCode(1, 1), E), 'two waiting and nothing being worked yet: full');
  run(s, 1);
  assert.ok(r.t > 0 && r.q.length === 2, 'one is being worked');
  assert.ok(give(s, ri, itemCode(1, 2), E), 'room for another waiting');
  assert.ok(!wants(s, ri, itemCode(1, 1), E));
  assert.deepEqual(r.q, [11, 11, 12], 'the one being worked first');
});

test('a machine\'s front makes a belt a corner, like any feeder', () => {
  const s = stage();
  lay(s, 5, 5, 'still', S);
  lay(s, 5, 6, 'conv', E);
  lay(s, 6, 6, 'conv', E);
  assert.equal(beltShape(s, idx(s, 5, 6)), -1, 'fed from its left');
  lay(s, 4, 6, 'conv', E);
  assert.equal(beltShape(s, idx(s, 5, 6)), 0, 'with a feeder behind it is a merge');
});

test('a chain from a Returns Drop through a Still and a Rebrander stocks a tower with Name Brand Bottled Spite', () => {
  const s = stage();
  const b = placeOk(s, 'forklift', 10, 2);
  lay(s, 1, 2, 'drop', E);
  lay(s, 2, 2, 'still', E);
  lay(s, 3, 2, 'rebrand', E);
  row(s, 4, 9, 2, E);
  run(s, 60 * TICK_HZ);
  assert.deepEqual(b.s, { dmg: [2, BACK.stockUnits * BUILD.forklift.shots] }, 'six units of tier 2, then it wants no more');
  assert.equal(unitsIn(b, 'dmg'), BACK.stockUnits);
  assert.ok(at(s, 9, 2).it.length > 0, 'the line backs up behind the full Dumbwaiter');
  assert.equal(statsOf(b, s).dmg, BUILD.forklift.dmg * BUILD.forklift.up.dmg.mul ** BACK.tierLevel[2], 'it works at level 4 damage');
});

test('Dumbwaiters come and go with their building: 1 x 1, the Barcode Laser both ways round, the TV Salesman', () => {
  const s = stage();
  const cases = [['sprinkler', 3, 2, 0], ['wetfloor', 5, 2, 0], ['railgun', 10, 2, E], ['railgun', 15, 1, S], ['salesman', 22, 2, 0]];
  for (const [k, x, y, d] of cases) {
    const v = s.backVer;
    placeOk(s, k, x, y, d);
    const ai = idx(s, x, y);
    const under = [];
    s.grid.forEach((g, i) => { if (g && (g === s.grid[ai] || g.part === ai)) under.push(i); });
    assert.equal(under.length, k === 'railgun' ? 3 : k === 'salesman' ? 4 : 1, k);
    for (const t of under) assert.deepEqual(s.back[t], { k: 'lift', a: ai }, `${k} at ${x},${y}: tile ${t}`);
    assert.equal(lifts(s).filter(([, a]) => a === ai).length, under.length, `${k}: none anywhere else`);
    assert.ok(s.backVer > v, 'The Back changed');
  }
  // Not under a crate (or anything without `lift`).
  placeOk(s, 'crate', 3, 12);
  assert.equal(at(s, 3, 12), 0);
  // Turning the laser end for end keeps its footprint and its Dumbwaiters.
  assert.ok(applyCommand(s, 0, { c: 'rotate', x: 11, y: 2 }).ok);
  assert.equal(lifts(s).filter(([, a]) => a === idx(s, 10, 2)).length, 3);
  // Nobody can buy, remove, turn or build on a Dumbwaiter.
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'lift', x: 1, y: 1, f: 1 }).why, 'kind');
  assert.equal(applyCommand(s, 0, { c: 'remove', x: 3, y: 2, f: 1 }).why, 'fixed');
  assert.equal(applyCommand(s, 0, { c: 'rotate', x: 3, y: 2, f: 1 }).why, 'empty');
  assert.equal(canPlaceBack(s, 'conv', 3, 2, 0), 'occupied');
  assert.equal(canPlaceBack(s, 'still', 15, 3, 0, E), 'occupied');
  // Selling the buildings takes their Dumbwaiters away, every tile.
  for (const [k, x, y] of cases) {
    const v = s.backVer;
    assert.ok(applyCommand(s, 0, { c: 'remove', x: k === 'salesman' ? x + 1 : x, y: k === 'salesman' ? y + 1 : y }).ok, k);
    assert.ok(s.backVer > v);
  }
  assert.deepEqual(lifts(s), []);
});

test('a security building cannot go over a Back part (\'back\'); a crate can', () => {
  const s = stage();
  lay(s, 5, 5, 'conv', E);
  assert.equal(canPlace(s, 'sprinkler', 5, 5, 0), 'back');
  assert.equal(canPlace(s, 'wetfloor', 5, 5, 0), 'back');
  assert.equal(canPlace(s, 'salesman', 4, 4, 0), 'back', 'any tile of its footprint');
  assert.equal(canPlace(s, 'railgun', 5, 3, 0, S), 'back');
  assert.equal(canPlace(s, 'railgun', 5, 4, 0, E), null, 'one row up it misses');
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'forklift', x: 5, y: 5 }).why, 'back');
  assert.equal(canPlace(s, 'crate', 5, 5, 0), null);
});

test('stock gives a track exactly the level a tier stands for, and nothing else gives levels', () => {
  for (const k of ['sprinkler', 'forklift', 'salesman', 'wetfloor', 'samples', 'railgun']) {
    for (const t of ['dmg', 'spd', 'rng']) {
      if (!BUILD[k].up[t]) continue;
      for (const tier of [1, 2, 3, 4]) {
        const stocked = { k, s: { [t]: [tier, 3] } };
        assert.equal(levelIn(stocked, t), BACK.tierLevel[tier]);
        assert.equal(stockLevel(stocked, t), BACK.tierLevel[tier]);
        // How much is left of the run does not matter, only its tier.
        assert.deepEqual(statsOf(stocked), statsOf({ k, s: { [t]: [tier, 1] } }), `${k} ${t} tier ${tier}`);
        assert.notDeepEqual(statsOf(stocked), statsOf({ k }), `${k} ${t} tier ${tier} changes something`);
      }
    }
  }
  // Levels a save from before 0.4 bought (`u`) count for nothing: bought upgrades are gone.
  assert.equal(levelIn({ k: 'sprinkler', u: { dmg: 5 }, s: { dmg: [2, 1] } }, 'dmg'), BACK.tierLevel[2]);
  assert.equal(levelIn({ k: 'sprinkler', u: { dmg: 5 } }, 'dmg'), 0);
  // Durability's level is never raised by stock (tape soaks hits instead).
  assert.equal(levelIn({ k: 'sprinkler', s: { dur: [4, 1] } }, 'dur'), 0);
  assert.equal(statsOf({ k: 'sprinkler', s: { dur: [4, 1] } }).hits, statsOf({ k: 'sprinkler' }).hits);
  // No stock, no levels: exactly the building it always was.
  assert.deepEqual(statsOf({ k: 'forklift', s: {} }), statsOf({ k: 'forklift' }));
});

test('stock is never money: what was spent, selling back and the rebuild price ignore it', () => {
  const s = stage();
  const b = placeOk(s, 'sprinkler', 5, 5);
  const plain = { spent: spentOn(b), rebuild: rebuildDeal(b, Infinity).pay };
  for (let n = 0; n < 6; n++) addStock(b, itemCode(1, 4));
  addStock(b, itemCode(2, 4));
  assert.equal(levelIn(b, 'dmg'), 8);
  assert.equal(stockLevel(b, 'dmg'), 8);
  assert.deepEqual({ spent: spentOn(b), rebuild: rebuildDeal(b, Infinity).pay }, plain);
  assert.equal(plain.spent, BUILD.sprinkler.cost);
  assert.equal(applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5, t: 'dmg' }).why, 'bad', 'nothing is bought for a track any more');
  const before = s.players[0].cash;
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 5, y: 5 }).ok);
  assert.equal(s.players[0].cash, before + Math.floor(BUILD.sprinkler.cost * TUNE.sellBack), 'sold back for what was paid');
});

test('a Dumbwaiter takes only the tracks its building has (and wire), up to stockUnits units of each', () => {
  const s = stage();
  placeOk(s, 'wetfloor', 5, 5);
  placeOk(s, 'samples', 7, 5);
  placeOk(s, 'sprinkler', 9, 5);
  const w = idx(s, 5, 5), sm = idx(s, 7, 5), sp = idx(s, 9, 5);
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => wants(s, w, itemCode(t, 1), E)), [true, false, false, true, true], 'sign: damage, tape, wire');
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => wants(s, sm, itemCode(t, 1), E)), [true, false, true, true, true], 'samples: no speed');
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => wants(s, sp, itemCode(t, 1), N)), [true, true, true, true, true], 'from any side');
  assert.ok(!wants(s, sp, JUNK, E), 'never junk');
  // The cap: six units; a unit partly used still counts, so the seventh waits for a whole one.
  const b = bld(s, 9, 5);
  for (let n = 0; n < BACK.stockUnits; n++) assert.ok(give(s, sp, itemCode(2, 1 + (n % 2)), E), `unit ${n + 1}`);
  assert.ok(!wants(s, sp, itemCode(2, 1), E), 'full');
  assert.ok(wants(s, sp, itemCode(1, 1), E), 'other tracks are counted on their own');
  useStock(b, 'spd', sp, []);
  assert.ok(!wants(s, sp, itemCode(2, 1), E), 'one use gone is not a unit gone');
  for (let n = 1; n < BUILD.sprinkler.shots; n++) useStock(b, 'spd', sp, []);
  assert.ok(wants(s, sp, itemCode(2, 1), E), 'a whole unit used: room for one');
  // Tape and wire: the tier is the uses per unit.
  for (let tier = 1; tier <= 4; tier++) {
    assert.equal(usesPer('sprinkler', 'dur', tier), BACK.tapeHits[tier]);
    assert.equal(usesPer('sprinkler', 'wire', tier), BACK.wireTurns[tier]);
    assert.equal(usesPer('railgun', 'dmg', tier), BUILD.railgun.shots);
  }
  give(s, w, itemCode(4, 3), E);
  give(s, w, itemCode(5, 2), E);
  assert.deepEqual(bld(s, 5, 5).s, { dur: [3, 3], wire: [2, 6] });
  // Nothing standing above (a part of a big building points at its anchor): nothing wanted.
  assert.ok(!takesSupply(null, itemCode(1, 1)));
  assert.ok(!takesSupply({ k: 'crate', o: 0 }, itemCode(1, 1)));
});

test('mixed tiers are kept in the order they came and used in that order', () => {
  const s = stage();
  const b = placeOk(s, 'forklift', 5, 5);
  const i = idx(s, 5, 5);
  for (const tier of [1, 1, 3, 2]) give(s, i, itemCode(1, tier), E);
  const sh = BUILD.forklift.shots;
  assert.deepEqual(b.s.dmg, [1, 2 * sh, 3, sh, 2, sh]);
  const ev = [];
  const levels = [];
  for (let n = 0; n < 4 * sh; n++) { levels.push(levelIn(b, 'dmg')); useWork(b, i, ev); }
  assert.deepEqual([levels[0], levels[2 * sh - 1], levels[2 * sh], levels[3 * sh], levels[4 * sh - 1]], [2, 2, 6, 4, 4]);
  assert.equal(b.s, undefined, 'all used: no stock left at all');
  assert.equal(levelIn(b, 'dmg'), 0);
  assert.deepEqual(ev, [{ e: 'stockOut', i, t: 'dmg' }], 'one warning, when the last run ran out');
});

test('a tower uses one use a shot, however many it hits, and is plain again when its stock runs out', (t) => {
  // (Nobody steals here: shoplifters take stock too since 0.4, and only use is being counted.)
  tune(t, { grabChance: 0 });
  const s = stage(4);
  const f = placeOk(s, 'forklift', 10, 4);
  const sp = placeOk(s, 'sprinkler', 14, 6);
  const fi = idx(s, 10, 4), si = idx(s, 14, 6);
  give(s, fi, itemCode(1, 2), E);
  for (let n = 0; n < 3; n++) give(s, si, itemCode(3, 1), E);
  give(s, si, itemCode(2, 4), E);
  const sprayUses = 3 * BUILD.sprinkler.shots;
  let shots = 0, sprays = 0, hitMany = false;
  const outs = [];
  const boosted = statsOf({ k: 'forklift', s: { dmg: [2, 1] } }, s).dmg, plain = statsOf({ k: 'forklift' }, s).dmg;
  wave(s, [{ k: 'hunter', n: 14, gap: 0.25, at: 0 }], 90, (ev) => {
    for (const e of ev) {
      if (e.e === 'shot' && e.i === fi) {
        shots++;
        assert.equal(usesIn(f, 'dmg'), Math.max(0, BUILD.forklift.shots - shots), `after shot ${shots}`);
        assert.equal(statsOf(f, s).dmg, shots < BUILD.forklift.shots ? boosted : plain);
      }
      if (e.e === 'spray' && e.i === si) sprays++;
      if (e.e === 'stockOut') outs.push(e);
    }
    // (How many the sprinkler reaches at once does not matter.)
    if (ev.some((e) => e.e === 'spray' && e.i === si) && s.shoppers.filter((h) => (h.x - 14.5) ** 2 + (h.y - 6.5) ** 2 <= statsOf(sp, s).range ** 2).length > 1) hitMany = true;
  });
  assert.ok(shots > BUILD.forklift.shots, `the forklift kept firing (${shots} shots)`);
  assert.equal(f.s, undefined);
  assert.ok(sprays > 0 && hitMany, 'the sprinkler sprayed groups');
  assert.equal(usesIn(sp, 'rng'), Math.max(0, sprayUses - sprays), 'one use of range a spray');
  assert.equal(usesIn(sp, 'spd'), Math.max(0, BUILD.sprinkler.shots - sprays), 'and one of speed');
  assert.deepEqual(outs.filter((e) => e.i === fi), [{ e: 'stockOut', i: fi, t: 'dmg' }]);
  if (sprays >= BUILD.sprinkler.shots) assert.ok(outs.some((e) => e.i === si && e.t === 'spd'));
});

test('Free Samples, the TV Salesman and the Wet Floor Sign use one use for each shopper they act on', (t) => {
  tune(t, { grabChance: 0 }); // (no thefts: only use is counted)
  // Samples: one use a stop.
  {
    const s = stage(6);
    corridor(s, 'crate', 2, 27, [[10, 6]]);
    const b = placeOk(s, 'samples', 10, 6);
    for (let n = 0; n < BACK.stockUnits; n++) addStock(b, itemCode(1, 1));
    const full = usesIn(b, 'dmg');
    const ev = wave(s, [{ k: 'hunter', n: 6, gap: 1, at: 0 }]);
    const stops = ev.filter((e) => e.e === 'sample').length;
    assert.ok(stops >= 3, `${stops} stops`);
    assert.equal(usesIn(b, 'dmg'), full - stops);
  }
  // The salesman: one use for each pitch that works (he stops or hurries).
  {
    const s = stage(7);
    corridor(s, 'crate', 2, 27);
    const b = placeOk(s, 'salesman', 14, 3);
    for (let n = 0; n < BACK.stockUnits; n++) addStock(b, itemCode(3, 1));
    const full = usesIn(b, 'rng');
    const ev = wave(s, [{ k: 'hunter', n: 12, gap: 1, at: 0 }]);
    const pitches = ev.filter((e) => e.e === 'pitch').length;
    assert.ok(pitches >= 2, `${pitches} pitches`);
    assert.equal(usesIn(b, 'rng'), full - pitches);
  }
  // The sign: one use for each shopper it slows, however long he is on it (a couple of seconds).
  {
    const s = stage(8);
    corridor(s, 'crate');
    const b = placeOk(s, 'wetfloor', 10, 7);
    addStock(b, itemCode(1, 1));
    const crossed = new Set();
    wave(s, [{ k: 'hunter', n: 4, gap: 2, at: 0 }], 120, () => {
      for (const h of s.shoppers) if ((h.y | 0) * s.w + (h.x | 0) === idx(s, 10, 7)) crossed.add(h.id);
    });
    assert.ok(crossed.size >= 3, `${crossed.size} crossed it`);
    assert.equal(usesIn(b, 'dmg'), BUILD.wetfloor.shots - crossed.size);
  }
});

test('Duct Tape soaks up gym bro hits: a use each instead of a hit, then he wrecks it as usual', (t) => {
  tune(t, { smashOther: 1, smashEvery: 0.3, smashWait: 0.3, smashMax: 99 });
  const s = stage(9);
  corridor(s, 'sprinkler', 3, 26);
  for (const b of s.grid) if (b && b.part === undefined) addStock(b, itemCode(4, 2)); // two hits each
  const seen = new Map();
  let taped = 0;
  wave(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }], 120, (ev) => {
    for (const e of ev) {
      if (e.e !== 'smash') continue;
      const n = (seen.get(e.i) || 0) + 1;
      seen.set(e.i, n);
      if (n <= 2) {
        taped++;
        assert.equal(e.tape, 1, `hit ${n} on ${e.i} is soaked up`);
        assert.equal(e.left, 2 - n + 1, 'its tape and its own hit are what is left');
        assert.ok(s.grid[e.i] && !s.grid[e.i].hit, 'no hit counted');
        if (n === 2) assert.ok(ev.some((o) => o.e === 'stockOut' && o.i === e.i && o.t === 'dur'));
      } else {
        assert.equal(e.tape, undefined);
        assert.equal(e.left, 0, 'the third wrecks it');
      }
    }
  });
  assert.ok(taped >= 2, `${taped} hits soaked up`);
});

test('a wreck\'s Dumbwaiters stay under the rubble, wanting nothing, until it is rebuilt or the rubble goes', (t) => {
  tune(t, { smashOther: 1, smashEvery: 0.3, smashWait: 0.3, smashMax: 2 });
  const s = stage(10);
  corridor(s, 'sprinkler', 3, 26);
  for (const b of s.grid) if (b && b.part === undefined) addStock(b, itemCode(1, 3));
  wave(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  const wrecks = s.rubble.filter((r) => r.k === 'sprinkler');
  assert.equal(wrecks.length, 2, 'two sprinklers wrecked');
  for (const r of wrecks) {
    assert.equal(s.grid[r.i], 0);
    assert.equal(r.s, undefined, 'its stock is lost');
    assert.equal(rebuildDeal(r, Infinity).pay, Math.floor(BUILD.sprinkler.cost * TUNE.rebuildShare), 'its rebuild price is a share of its price only');
    assert.deepEqual(s.back[r.i], { k: 'lift', a: r.i }, 'its Dumbwaiter is still there');
    assert.ok(!wants(s, r.i, itemCode(1, 1), E), 'wanting nothing');
    assert.equal(canPlaceBack(s, 'conv', r.i % s.w, (r.i / s.w) | 0, 0), 'occupied', 'and in the way of The Back\'s parts');
  }
  // Rebuilt by placing the same kind on it: the Dumbwaiter serves the new building; no stock.
  const [a, b] = wrecks;
  assert.ok(place(s, 'sprinkler', a.i % s.w, (a.i / s.w) | 0).ok);
  assert.deepEqual(s.back[a.i], { k: 'lift', a: a.i });
  assert.equal(s.grid[a.i].s, undefined);
  assert.ok(wants(s, a.i, itemCode(1, 1), E));
  // Built over with a crate: the rubble is gone, and its Dumbwaiter with it.
  assert.ok(place(s, 'crate', b.i % s.w, (b.i / s.w) | 0).ok);
  assert.equal(s.back[b.i], 0);
  assert.equal(s.rubble.filter((r) => r.k === 'sprinkler').length, 0);
});

test('the Rebuild button puts a wreck back over its Dumbwaiters; one that falls off the rubble list loses them', (t) => {
  // (Two hits: the laser survives one.)
  tune(t, { smashOther: 1, smashEvery: 0.3, smashWait: 0.3, smashMax: 2 });
  const s = stage(11);
  // The first thing beside his way in (along row 8) is the laser; crates further on, on either side
  // of row 7 too (with the laser gone he may walk that row instead).
  placeOk(s, 'railgun', 2, 9, E);
  placeOk(s, 'crate', 7, 9);
  placeOk(s, 'crate', 7, 6);
  wave(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  assert.equal(s.rubble.length, 1);
  const r = s.rubble[0];
  assert.equal(r.k, 'railgun');
  assert.equal(lifts(s).length, 3, 'all three stay');
  assert.ok(applyCommand(s, 0, { c: 'rebuild' }).ok);
  assert.equal(s.grid[r.i].k, 'railgun');
  assert.deepEqual(lifts(s).map(([, a]) => a), [r.i, r.i, r.i]);
  // Wrecked again, then pushed off the end of the list by 400 newer wrecks.
  wave(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  assert.equal(s.rubble.length, 1);
  for (let n = 0; n < 399; n++) s.rubble.push({ i: idx(s, 1, 1), k: 'crate', d: 0, o: 0 });
  wave(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  assert.ok(!s.grid[idx(s, 7, 9)] || !s.grid[idx(s, 7, 6)], 'this time he wrecked a crate');
  assert.equal(s.rubble.length, 400);
  assert.ok(!s.rubble.some((q) => q.k === 'railgun'), 'the laser\'s wreck fell off the end');
  assert.deepEqual(lifts(s), [], 'and its Dumbwaiters went with it');
});

test('an Unpaid Intern takes from a mixed belt only what the Dumbwaiter in front wants', () => {
  const s = stage();
  const sign = placeOk(s, 'wetfloor', 8, 5);
  row(s, 3, 6, 5, E);
  lay(s, 7, 5, 'intern', E);
  at(s, 6, 5).it.push(itemCode(2, 1), 200, itemCode(1, 3), 100);
  run(s, 60);
  assert.deepEqual(sign.s, { dmg: [3, BUILD.wetfloor.shots] }, 'the Bottled Spite went up');
  assert.deepEqual(codesOn(at(s, 6, 5).it), [itemCode(2, 1)], 'the Rage Cola, which a sign has no use for, stays');
  // A belt pointing straight into a Dumbwaiter feeds it too.
  const f = placeOk(s, 'forklift', 8, 9);
  row(s, 4, 7, 9, E);
  at(s, 4, 9).it.push(itemCode(3, 1), 0);
  run(s, 60);
  assert.deepEqual(f.s, { rng: [1, BUILD.forklift.shots] });
});

test('dropUp: any player pays dropUpCost * dropUpGrow^lv for a faster Returns Drop, up to dropUpMax', () => {
  const s = createGame({ seed: 2, map: { design: 'warehouse', size: 's' } });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  const di = s.back.findIndex((p) => p && p.k === 'drop');
  const x = di % s.w, y = (di / s.w) | 0, p = s.back[di];
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(dropUpCost), [150, 240, 384, 614, 983, 0]);
  s.players[1].cash = 100;
  assert.equal(applyCommand(s, 1, { c: 'dropUp', x, y }).why, 'cash');
  assert.equal(applyCommand(s, 0, { c: 'dropUp', x: x + 0.5, y }).why, 'bounds');
  assert.equal(applyCommand(s, 0, { c: 'dropUp', x: -1, y }).why, 'bounds');
  assert.equal(applyCommand(s, 0, { c: 'dropUp', x: 1, y: 1 }).why, 'empty');
  s.players[0].cash = 1e5;
  s.players[1].cash = 1e5;
  let spent = 0;
  for (let lv = 0; lv < BACK.dropUpMax; lv++) {
    const ev = [];
    const pid = lv % 2;
    const cash = s.players[pid].cash;
    assert.deepEqual(applyCommand(s, pid, { c: 'dropUp', x, y }, ev), { ok: true });
    assert.equal(s.players[pid].cash, cash - dropUpCost(lv));
    assert.deepEqual(ev, [{ e: 'dropUp', x, y, lv: lv + 1, by: pid, paid: dropUpCost(lv) }]);
    assert.ok(p.t <= dropTicks(p.lv), 'a long wait is cut to the new time');
    spent += dropUpCost(lv);
  }
  assert.equal(p.lv, BACK.dropUpMax);
  assert.equal(applyCommand(s, 0, { c: 'dropUp', x, y }).why, 'max');
  assert.equal(s.players[0].all.spent + s.players[1].all.spent, spent);
  // Faster: junk every dropTicks(lv), the base time times dropMul for each level.
  assert.equal(dropTicks(5), Math.round(BACK.dropSecs * BACK.dropMul ** 5 * TICK_HZ));
  const front = s.back.findIndex((q, i) => i === di + [1, s.w, -1, -s.w][p.d]);
  s.back[front] = newPart('bin', 0);
  s.backVer++;
  const drops = [];
  for (let n = 0; n < 200; n++) { const was = p.t; stepBack(s); if (p.t > was) drops.push(s.tick + n); }
  assert.ok(drops.length >= 3);
  for (let k = 1; k < drops.length; k++) assert.equal(drops[k] - drops[k - 1], dropTicks(5));
  // Head Office does not touch the store; nor does anyone once the game is over.
  s.phase = 'lost';
  assert.equal(applyCommand(s, 0, { c: 'dropUp', x, y }).why, 'over');
});

test('Head Office cannot buy a faster drop', () => {
  const s = createGame({ seed: 2, map: { design: 'warehouse', size: 's' } });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  s.players[1].side = 'office';
  const di = s.back.findIndex((p) => p && p.k === 'drop');
  assert.equal(applyCommand(s, 1, { c: 'dropUp', x: di % s.w, y: (di / s.w) | 0 }).why, 'office');
});

/** A small working Back feeding the shop: two chains into two towers, and a wave on the way. */
function working(seed = 12) {
  const s = stage(seed);
  placeOk(s, 'forklift', 10, 2);
  placeOk(s, 'sprinkler', 12, 6);
  lay(s, 1, 2, 'drop', E);
  lay(s, 2, 2, 'still', E);
  lay(s, 3, 2, 'rebrand', E);
  row(s, 4, 9, 2, E);
  lay(s, 1, 12, 'drop', E);
  lay(s, 2, 12, 'cannery', E);
  row(s, 3, 11, 12, E);
  lay(s, 12, 12, 'conv', N);
  for (let y = 7; y <= 11; y++) lay(s, 12, y, 'conv', N);
  for (let n = 0; n < 30 * TICK_HZ; n++) step(s);
  queueTrainingWave(s, [{ k: 'hunter', n: 10, gap: 1, at: 0 }, { k: 'clipper', n: 10, gap: 0.7, at: 3 }]);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  return s;
}

test('a stocked store survives a copy through JSON mid-run and plays on identically', () => {
  const a = working(), b = working();
  for (let n = 0; n < 12 * TICK_HZ; n++) { step(a); step(b); }
  assert.ok(a.grid[idx(a, 10, 2)].s && a.grid[idx(a, 12, 6)].s, 'both towers are stocked');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = JSON.parse(JSON.stringify(a));
  for (let n = 0; n < 20 * TICK_HZ; n++) { step(a); step(c); }
  assert.equal(JSON.stringify(a), JSON.stringify(c));
  assert.equal(checksum(a), checksum(c));
});

test('the checksum sees stock, the machines\' and Rebranders\' counters, and the Dumbwaiters', () => {
  const s = stage();
  const b = placeOk(s, 'sprinkler', 5, 5);
  const m = lay(s, 7, 7, 'still', E);
  const r = lay(s, 9, 7, 'rebrand', E);
  let c = checksum(s);
  const changed = (what) => { const n = checksum(s); assert.notEqual(n, c, what); c = n; };
  addStock(b, itemCode(1, 1));
  changed('a unit arrived');
  useStock(b, 'dmg', idx(s, 5, 5), []);
  changed('a use taken');
  b.s.dmg[0] = 2;
  changed('another tier');
  m.n = 2;
  changed('junk waiting in a machine');
  m.t = 5;
  changed('a machine at work');
  m.out = 11;
  changed('a supply waiting to go out');
  r.q.push(13);
  changed('a supply waiting in a Rebrander');
  s.back[idx(s, 5, 5)] = { k: 'lift', a: idx(s, 5, 6) };
  changed('a Dumbwaiter serving another building');
});
