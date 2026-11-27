// Tests for the gym bro's limit (the owner's numbers, 0.2.12): only so many hits in one visit
// (TUNE.smashMax, the Roid Rager's own smashMax), a rest after each (smashWait), and while he rests,
// or once he is spent, he walks round crates like any ordinary shopper.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, step, queueTrainingWave, getField, smashReady, routeOf,
  addStock, itemCode, usesIn, SUPERS, TUNE, TICK_HZ, ST, SMASH, NORMAL,
} from '../src/sim/index.js';

// The original small map, 30 tiles by 16: entrance on the left at rows 7-8, tills on the right.
const W = 30;
const at = (x, y) => y * W + x;
const secs = (n) => Math.max(1, Math.round(n * TICK_HZ));

function stage(seed = 5) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}
const place = (s, k, x, y, d = 0) => applyCommand(s, 0, { c: 'place', k, x, y, d });
function send(s, groups) {
  queueTrainingWave(s, groups);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
}
/** Temporarily changes tuning numbers for one test. */
function tune(t, changes, obj = TUNE) {
  const old = {};
  for (const k of Object.keys(changes)) { old[k] = obj[k]; obj[k] = changes[k]; }
  t.after(() => Object.assign(obj, old));
}
/** Sends one gym bro (patient enough to see it through) and returns him once he is in. */
function gymBro(s, sup = 0) {
  send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0, sup }]);
  for (let i = 0; i < 10 * TICK_HZ; i++) {
    if (s.shoppers.length) { s.shoppers[0].hp = s.shoppers[0].mhp = 1e9; return s.shoppers[0]; }
    step(s);
  }
  throw new Error('no gym bro arrived');
}
/** Steps until the wave ends (or a time limit); returns each smash with the tick it happened on. */
function watch(s, seconds, each = () => {}) {
  const hits = [];
  let escaped = 0;
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    const ev = step(s);
    for (const e of ev) {
      if (e.e === 'smash') hits.push({ ...e, tick: s.tick });
      if (e.e === 'escape') escaped++;
    }
    each(ev);
    if (ev.some((e) => e.e === 'waveEnd')) break;
  }
  return { hits, escaped };
}
/** Rows 6 and 8 lined with crate stacks from x0 to x1: a corridor along row 7 full of things to hit. */
function crateCorridor(s, x0 = 2, x1 = 27) {
  for (let x = x0; x <= x1; x++) { place(s, 'crate', x, 6); place(s, 'crate', x, 8); }
}
/** A wall of crates down column 12, with one gap, at the bottom (row 14). */
function crateWall(s) {
  for (let y = 1; y <= 13; y++) assert.ok(place(s, 'crate', 12, y).ok);
}

test('the limits are the owner\'s numbers: a gym bro 2 hits, 10 s apart; a Roid Rager 3, 5 s apart', () => {
  assert.equal(TUNE.smashMax, 2);
  assert.equal(TUNE.smashWait, 10);
  assert.equal(SUPERS.gymbro.smashMax, 3);
  assert.equal(SUPERS.gymbro.smashWait, 5);
  // The time between attempts that do not land is a separate number, and stays.
  assert.equal(TUNE.smashEvery, 1.5);
  assert.equal(SUPERS.gymbro.smashEvery, 0.9);
});

test('a gym bro lands at most 2 hits in a walk past crates, a Roid Rager at most 3, at least 10 s (5 s) apart', (t) => {
  for (const sup of [0, 1]) {
    const max = sup ? SUPERS.gymbro.smashMax : TUNE.smashMax;
    const wait = secs(sup ? SUPERS.gymbro.smashWait : TUNE.smashWait);
    for (let seed = 1; seed <= 4; seed++) {
      const s = stage(seed);
      crateCorridor(s);
      const sh = gymBro(s, sup);
      const { hits, escaped } = watch(s, 120);
      assert.equal(escaped, 1);
      assert.equal(hits.length, max, `${sup ? 'Roid Rager' : 'gym bro'} seed ${seed}: ${hits.length} hits`);
      for (let n = 1; n < hits.length; n++) {
        assert.ok(hits[n].tick - hits[n - 1].tick >= wait, `hits ${hits[n - 1].tick} and ${hits[n].tick} are ${wait} ticks apart or more`);
      }
      assert.equal(sh.hn, max, 'he counted them');
    }
  }

  // Even with no rest at all he stops at his limit: it is the limit that stops him, not the walk.
  tune(t, { smashWait: 0 });
  tune(t, { smashWait: 0 }, SUPERS.gymbro);
  for (const sup of [0, 1]) {
    const s = stage(3);
    crateCorridor(s);
    gymBro(s, sup);
    assert.equal(watch(s, 120).hits.length, sup ? SUPERS.gymbro.smashMax : TUNE.smashMax);
  }
});

test('a hit a reinforced building holds still counts', (t) => {
  // (Until 0.4 this was a crate with a bought level of durability; from 0.4 to 0.4.01 Duct Tape
  // from The Back soaked one up; now a level of reinforcement, bought with cash, holds one.) With
  // smashOther 1 he hits whatever stands beside him once no crate does.
  tune(t, { smashOther: 1 });
  const taped = (s) => {
    // A Forklift Turret beside the tile he is put on, reinforced one level (one hit more).
    assert.ok(place(s, 'forklift', 12, 7).ok);
    assert.ok(applyCommand(s, 0, { c: 'reinforce', x: 12, y: 7 }).ok);
    assert.equal(s.grid[at(12, 7)].r, 1);
  };
  // (sm 0: ready to swing the moment he is let go. He counts it down only while walking, and the
  // forklift is not on his way, so he would otherwise have walked off before his next swing.)
  const stand = (sh) => { sh.x = 11.5; sh.y = 7.5; sh.vx = 0; sh.vy = 0; sh.sm = 0; };

  // Stood beside it, and held there through his rest (as if watching a television), he comes back
  // and finishes it: it holds his first hit, his second brings it down, and he is spent.
  {
    const s = stage(2);
    taped(s);
    const sh = gymBro(s);
    stand(sh);
    let held = false;
    const { hits, escaped } = watch(s, 200, (ev) => {
      if (!held && ev.some((e) => e.e === 'smash')) {
        held = true;
        stand(sh);
        sh.st = ST.WATCH;
        sh.t = sh.hw + 2;
      }
    });
    assert.deepEqual(hits.map((e) => [e.i, e.left]), [[at(12, 7), 1], [at(12, 7), 0]]);
    assert.equal(s.grid[at(12, 7)], 0, 'it took both his hits to fall');
    assert.equal(sh.hn, TUNE.smashMax, 'the hit it held counted');
    assert.equal(escaped, 1);
  }

  // Spend a hit elsewhere first (a plain crate by the entrance) and the reinforced one survives him.
  {
    const s = stage(2);
    taped(s);
    place(s, 'crate', 1, 6);
    place(s, 'crate', 1, 9);
    const sh = gymBro(s);
    let held = false;
    const { hits, escaped } = watch(s, 200, (ev) => {
      // After that first hit, stand him beside the reinforced forklift through his rest.
      if (!held && ev.some((e) => e.e === 'smash')) {
        held = true;
        stand(sh);
        sh.st = ST.WATCH;
        sh.t = sh.hw + 2;
      }
    });
    assert.equal(hits.length, 2);
    assert.ok([at(1, 6), at(1, 9)].includes(hits[0].i) && hits[0].left === 0, 'the plain crate took his first hit');
    assert.deepEqual([hits[1].i, hits[1].left], [at(12, 7), 1], 'the reinforced forklift his second, and it held');
    assert.ok(s.grid[at(12, 7)], 'the reinforcement saved it');
    assert.equal(sh.hn, TUNE.smashMax);
    assert.equal(escaped, 1);
  }
});

/**
 * Walks one gym bro to the tills past the crate wall, with `prep` done to him as he comes in, and
 * returns the tiles he stood on and how many ticks he stood still while walking.
 */
function walkPastWall(prep) {
  const s = stage(2);
  crateWall(s);
  const sh = gymBro(s);
  prep(sh);
  const tiles = [];
  let still = 0;
  const { hits, escaped } = watch(s, 200, () => {
    if (!s.shoppers.includes(sh)) return;
    const i = (sh.y | 0) * W + (sh.x | 0);
    if (tiles[tiles.length - 1] !== i) tiles.push(i);
    if (sh.st === ST.WALK && sh.vx === 0 && sh.vy === 0) still++;
  });
  return { s, sh, tiles, still, hits, escaped };
}

test('resting, or spent, he walks round a crate wall like an ordinary shopper and reaches the tills', () => {
  const s0 = stage(2);
  crateWall(s0);
  const normal = getField(s0, NORMAL);
  assert.ok(getField(s0, SMASH)[at(0, 7)] < normal[at(0, 7)], 'his own route would be shorter, through the wall');

  for (const [why, prep] of [
    ['spent', (sh) => { sh.hn = TUNE.smashMax; }],
    ['resting', (sh) => { sh.hw = secs(1000); }],
  ]) {
    const { s, sh, tiles, still, hits, escaped } = walkPastWall(prep);
    assert.equal(routeOf(sh), NORMAL, why);
    assert.equal(hits.length, 0, `${why}: he hits nothing`);
    assert.equal(escaped, 1, `${why}: he reaches the tills`);
    assert.equal(still, 0, `${why}: he never stands still`);
    for (let y = 1; y <= 13; y++) assert.equal(s.grid[at(12, y)].k, 'crate', `${why}: the wall is intact`);
    assert.ok(tiles.includes(at(12, 14)), `${why}: he went round by the gap`);
    // Every step is one tile nearer the tills on the ordinary map: the ordinary route.
    for (let n = 1; n < tiles.length; n++) assert.equal(normal[tiles[n]], normal[tiles[n - 1]] - 1, `${why}: step ${n}`);
  }

  // The same gym bro, fresh, goes through the wall instead.
  const fresh = walkPastWall(() => {});
  assert.ok(fresh.hits.length >= 1 && fresh.hits[0].i % W === 12);
  assert.ok(!fresh.tiles.includes(at(12, 14)));
  assert.equal(fresh.escaped, 1);
});

test('after his hit he walks on at once by the ordinary route, and back on his own once rested', (t) => {
  tune(t, { smashOther: 0 });
  // A crate wall two deep, so his hit does not open the way. (Until 0.4 it was one deep with
  // durable crates; crates now go at one hit.)
  const s = stage(2);
  crateWall(s);
  for (let y = 1; y <= 13; y++) assert.ok(place(s, 'crate', 13, y).ok);
  const sh = gymBro(s);
  let first = -1, readyAgain = -1, stillAfter = 0;
  const { hits } = watch(s, 200, () => {
    if (!s.shoppers.includes(sh)) return;
    if (first < 0 && sh.hn === 1) first = s.tick;
    if (first >= 0 && readyAgain < 0) {
      if (sh.hw > 0) {
        assert.equal(routeOf(sh), NORMAL, 'resting: the ordinary route');
        if (sh.st === ST.WALK && sh.vx === 0 && sh.vy === 0) stillAfter++;
      } else readyAgain = s.tick;
    }
  });
  assert.ok(first >= 0 && readyAgain > first);
  assert.equal(readyAgain - first, secs(TUNE.smashWait), 'his rest is smashWait long');
  assert.equal(stillAfter, 0, 'he did not stand at the crate');
  assert.ok(hits.length >= 1 && hits.length <= TUNE.smashMax);
});

test('nobody may wall a gym bro in with crates, as for any other shopper', () => {
  const s = stage(2);
  // Crates round three sides of the tile (20, 2), the open side (20, 1) by the top wall.
  for (const [x, y] of [[19, 2], [21, 2], [20, 3]]) assert.ok(place(s, 'crate', x, y).ok);
  const sh = gymBro(s);
  sh.st = ST.BROWSE; sh.t = 1e6; sh.x = 20.5; sh.y = 2.5;
  // (He could smash his way out today, but he might be spent, or resting, when he has to.)
  assert.equal(canPlace(s, 'crate', 20, 1), 'blocked', 'he might run out of hits in there');
  assert.equal(canPlace(s, 'crate', 5, 3), null, 'building elsewhere is fine');
  sh.x = 5.5; sh.y = 12.5;
  assert.equal(canPlace(s, 'crate', 20, 1), null, 'and once he is out of there, so is that');
});

test('two identical games stay identical, and a JSON copy made mid-rest carries on the same', () => {
  const make = () => {
    const s = stage(7);
    crateCorridor(s, 2, 9);
    crateWall(s);
    send(s, [{ k: 'gymbro', n: 3, gap: 2, at: 0 }, { k: 'gymbro', n: 2, gap: 3, at: 1, sup: 2 }]);
    return s;
  };
  const a = make(), b = make();
  // Step until somebody is resting after a hit.
  let resting = false;
  for (let i = 0; i < 60 * TICK_HZ && !resting; i++) {
    step(a); step(b);
    resting = a.shoppers.some((sh) => sh.hw > 0 && sh.hn > 0);
  }
  assert.ok(resting, 'a gym bro is resting');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = JSON.parse(JSON.stringify(a));
  let smashes = 0;
  for (let i = 0; i < 90 * TICK_HZ; i++) {
    const ea = step(a), eb = step(b), ec = step(c);
    assert.deepEqual(eb, ea);
    assert.deepEqual(ec, ea);
    smashes += ea.filter((e) => e.e === 'smash').length;
  }
  assert.ok(smashes >= 1, 'more was wrecked after the copy');
  assert.equal(JSON.stringify(c), JSON.stringify(a));
  assert.equal(JSON.stringify(b), JSON.stringify(a));
});

test('a gym bro from a game saved before the limit (no count, no rest) carries on', () => {
  assert.equal(smashReady({ k: 'gymbro' }), true);
  assert.equal(routeOf({ k: 'gymbro' }), SMASH);
  assert.equal(routeOf({ k: 'gymbro', hn: TUNE.smashMax }), NORMAL);
  assert.equal(routeOf({ k: 'gymbro', sup: 1, hn: TUNE.smashMax }), SMASH, 'a Roid Rager has one more');

  const s = stage(3);
  crateCorridor(s);
  const sh = gymBro(s);
  delete sh.hn;
  delete sh.hw;
  const copy = JSON.parse(JSON.stringify(s));
  const { hits, escaped } = watch(copy, 120);
  assert.equal(hits.length, TUNE.smashMax);
  assert.equal(escaped, 1);
});
