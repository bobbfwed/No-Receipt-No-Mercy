// Tests for the cards that change how shoppers behave (0.3.01, second round): freerange, offleash,
// spayed, eyesup, wrongway, slushie, eightyproof, warranty and supportdog. For each: the rule doing
// what its row in the design says, nothing at all without the card, and a copy of the game made in
// the middle of the behaviour (a JSON round trip, as the host sends it) playing on identically.
// (bde's rule is in cards.test.js; its larger drawing is the renderer's.)
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, getField, idShare, patienceFor, difficultyOf, teamCash, kidBack, pupsOf,
  supportDog, trailsFlasher, cardKidRuns, boozeChance, drinks, stopsToPet,
  CARDS, DEALABLE, SHOPPERS, SUPERS, PUP, BABY, TUNE, TICK_HZ, ST, NORMAL, HOP, GHOST, UNREACHABLE, walkable,
} from '../src/sim/index.js';

/** A game with these cards, one rich player, no losing. */
function game(cards = null, seed = 5, more = {}) {
  const s = createGame({ seed, cards, ...more });
  addPlayer(s, 'Dave');
  for (const p of s.players) p.cash = 1e6;
  s.refundLimit = 1e9;
  return s;
}
/** Opens the doors on sales event n, with nobody coming. */
function openEmpty(s, n = 6) {
  s.wave = n - 1;
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  s.spawnQ = [];
}
/** A shopper of kind k standing at (x, y), with patience to spare. */
function walker(s, k, x, y, more = {}) {
  const sh = { id: s.nextId++, k, x, y, vx: 0, vy: 0, hp: 1e5, mhp: 1e5, st: ST.WALK, t: 0, cd: 0, ox: 0, oy: 0, lt: -1, ...more };
  s.shoppers.push(sh);
  return sh;
}
/** A mom with her child in the cart, ready to run in `kc` ticks. */
function mom(s, x, y, more = {}) {
  return walker(s, 'mom', x, y, { kd: 0, kx: x, ky: y, kvx: 0, kvy: 0, kr: 0, kc: 1, kn: 0, ...more });
}
/** Steps until `until` (or the time runs out); returns every event. `each` runs after every step. */
function run(s, seconds, until = () => false, each = null) {
  const all = [];
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    const ev = step(s);
    all.push(...ev);
    if (each) each(ev);
    if (until()) break;
  }
  return all;
}
/** A JSON copy of the game (what the host sends) plays on exactly like the game for `seconds`. */
function twin(s, seconds) {
  const c = JSON.parse(JSON.stringify(s));
  for (let i = 0; i < seconds * TICK_HZ; i++) assert.deepEqual(step(c), step(s));
  assert.equal(JSON.stringify(c), JSON.stringify(s));
}
/** Temporarily changes tuning numbers for one test. */
function tune(t, changes, obj = TUNE) {
  const old = {};
  for (const k of Object.keys(changes)) { old[k] = obj[k]; obj[k] = changes[k]; }
  t.after(() => Object.assign(obj, old));
}
/** The first id from `from` that a card's share by id picks (or, with in false, leaves out). */
function idFor(card, inShare = true, from = 100, key = (id) => id) {
  for (let id = from; ; id++) if ((idShare(key(id), card) < CARDS[card].share) === inShare) return id;
}
const tileOf = (s, sh) => (sh.y | 0) * s.w + (sh.x | 0);

// ---- Every card can be dealt ---------------------------------------------------------------------

// The playtest (0.3.01, tools/cardtest.mjs) took these out of the deal; their rules stay, for the owner to judge.
const HELD_BACK = ['eightyproof', 'klepto'];

test('every card in the deck can be dealt, but those the playtest held back', () => {
  assert.deepEqual([...DEALABLE].sort(), Object.keys(CARDS).filter((c) => !HELD_BACK.includes(c)).sort());
});

// ---- offleash ------------------------------------------------------------------------------------

test('offleash: the moms it picks by id have a kid who runs off twice as many times; the Soccer Mom\'s too', (t) => {
  tune(t, { kidChance: 1e4 });
  const picked = idFor('offleash'), spared = idFor('offleash', false);
  /** Does a mom (super if sup) whose child has already run `kn` times let him run again? */
  const runsAgain = (cards, id, kn, sup = 0) => {
    const s = game(cards);
    openEmpty(s);
    const m = mom(s, 3.5, 7.5, { kn, ...(sup ? { sup: 1 } : {}) });
    m.id = id;
    return run(s, 0.5).some((e) => e.e === 'kid');
  };
  assert.equal(runsAgain(['offleash'], picked, 1), true);
  assert.equal(runsAgain(['offleash'], picked, 2), false);
  assert.equal(runsAgain(['offleash'], spared, 1), false);
  assert.equal(runsAgain(null, picked, 1), false);
  // The Soccer Mom: 4 instead of 2.
  assert.equal(runsAgain(['offleash'], picked, 3, 1), true);
  assert.equal(runsAgain(['offleash'], picked, 4, 1), false);
  assert.equal(runsAgain(null, picked, 2, 1), false);
  // About 40% of moms.
  let n = 0;
  for (let id = 1; id <= 2000; id++) if (cardKidRuns(game(['offleash']), { id, k: 'mom' }) === 2) n++;
  assert.ok(Math.abs(n / 2000 - CARDS.offleash.share) < 0.03, `${n / 2000}`);
});

test('offleash: a copy made while a picked kid is on his second run plays on identically', (t) => {
  tune(t, { kidChance: 1e4 });
  const s = game(['offleash']);
  openEmpty(s);
  const m = mom(s, 3.5, 7.5, { kn: 1 });
  m.id = idFor('offleash');
  run(s, 0.3, () => m.kd === 1);
  assert.equal(m.kd, 1);
  assert.equal(m.kn, 2);
  twin(s, 3);
});

// ---- freerange and wrongway ----------------------------------------------------------------------

/**
 * A mom at (x, 7.5) whose child runs off at once, in a store with a wall of crates down column 14
 * (a way round at the bottom), so the shoppers' route is not a straight line. Returns where he
 * waited, how far along her route that is from where he ran off, every tile he ran over, and the
 * game.
 */
function kidRun(t, cards, id, x = 3.5) {
  tune(t, { kidChance: 1e4 });
  const s = game(cards);
  for (let y = 1; y <= 12; y++) assert.ok(applyCommand(s, 0, { c: 'place', k: 'crate', x: 14, y }).ok);
  openEmpty(s);
  const m = mom(s, x, 7.5);
  m.id = id;
  const dist = getField(s, NORMAL);
  let from = -1, momAt = null, momStill = true;
  const ran = [];
  run(s, 10, () => m.kd === 2, (ev) => {
    if (ev.some((e) => e.e === 'kid')) { from = tileOf(s, m); momAt = [m.x, m.y]; }
    if (m.kd === 1) {
      ran.push((m.ky | 0) * s.w + (m.kx | 0));
      if (momAt && (m.x !== momAt[0] || m.y !== momAt[1])) momStill = false;
    }
  });
  assert.equal(m.kd, 2, 'the child stopped to wait');
  const spot = (m.ky | 0) * s.w + (m.kx | 0);
  return { s, m, dist, from, spot, gain: dist[from] - dist[spot], ran, momStill };
}

test('freerange: the child runs on along the route, never through anything, and stops 1.5 times as far along it', (t) => {
  const id = 333;
  const usual = kidRun(t, null, id);
  const free = kidRun(t, ['freerange'], id);
  assert.ok(usual.ran.some((i) => !walkable(usual.s, i, NORMAL)), 'without the card he runs straight through the crates');
  // Along the route: every tile he runs over is one his mother can walk on, each no further from
  // the tills than the one before.
  for (const i of free.ran) assert.ok(walkable(free.s, i, NORMAL), 'never through a crate');
  for (let k = 1; k < free.ran.length; k++) assert.ok(free.dist[free.ran[k]] <= free.dist[free.ran[k - 1]], 'never sideways or back');
  assert.ok(usual.gain > 0);
  // (Never nearer than TUNE.kidTill to a till, though: that may cut it short.)
  const want = Math.min(CARDS.freerange.ahead * usual.gain, free.dist[free.from] - TUNE.kidTill);
  assert.ok(Math.abs(free.gain - want) <= 2, `${free.gain} vs ${usual.gain}`);
  // A shorter usual run, where nothing cuts it short.
  tune(t, { kidMin: 5, kidMax: 5 });
  const near = kidRun(t, null, 335), farther = kidRun(t, ['freerange'], 335);
  assert.ok(Math.abs(farther.gain - CARDS.freerange.ahead * near.gain) <= 2, `${farther.gain} vs ${near.gain}`);
  // Every guarantee kept: floor his mother can reach, not too near a till, and she fetches him.
  assert.ok(free.dist[free.spot] >= TUNE.kidTill && free.dist[free.spot] !== UNREACHABLE);
  const ev = run(free.s, 30, () => !free.s.shoppers.includes(free.m));
  const caught = ev.findIndex((e) => e.e === 'caught'), out = ev.findIndex((e) => e.e === 'escape');
  assert.ok(caught >= 0 && out > caught, 'she takes her refund only after she has him');
});

test('freerange: a copy made while the child runs along the route plays on identically', (t) => {
  tune(t, { kidChance: 1e4 });
  const s = game(['freerange']);
  openEmpty(s);
  const m = mom(s, 3.5, 7.5);
  run(s, 0.3, () => m.kd === 1);
  assert.equal(m.kd, 1);
  twin(s, 4);
});

test('wrongway: 35% of runs (by mom and run) go back toward the entrance; she stands, then walks back for him', (t) => {
  const key = (id) => id * 31 + 1; // her first run
  const back = idFor('wrongway', true, 100, key), on = idFor('wrongway', false, 100, key);
  const r = kidRun(t, ['wrongway'], back, 20.5);
  assert.ok(r.dist[r.spot] > r.dist[r.from], 'he waits further from the tills than she was');
  assert.ok(r.momStill, 'she stops dead while he runs');
  assert.ok(walkable(r.s, r.spot, NORMAL));
  const ev = run(r.s, 40, () => !r.s.shoppers.includes(r.m));
  const caught = ev.findIndex((e) => e.e === 'caught'), out = ev.findIndex((e) => e.e === 'escape');
  assert.ok(caught >= 0 && out > caught, 'she fetches him, then takes her refund');
  // The others run on toward the tills as usual, and nobody runs back without the card.
  const fwd = kidRun(t, ['wrongway'], on, 20.5);
  assert.ok(fwd.dist[fwd.spot] < fwd.dist[fwd.from]);
  const none = kidRun(t, null, back, 20.5);
  assert.ok(none.dist[none.spot] < none.dist[none.from]);
  // The share is of runs: the same mom's next run is a fresh chance.
  let n = 0, same = 0;
  const s = game(['wrongway']);
  for (let id = 1; id <= 1500; id++) {
    const a = kidBack(s, { id, kn: 1 }), b = kidBack(s, { id, kn: 2 });
    if (a) n++;
    if (a === b) same++;
  }
  assert.ok(Math.abs(n / 1500 - CARDS.wrongway.share) < 0.03, `${n / 1500}`);
  assert.ok(same < 1400, 'not the same answer for every run of one kid');
});

test('wrongway: a copy made while the child runs back plays on identically', (t) => {
  tune(t, { kidChance: 1e4 });
  const s = game(['wrongway']);
  openEmpty(s);
  const m = mom(s, 20.5, 7.5);
  m.id = idFor('wrongway', true, 100, (id) => id * 31 + 1);
  run(s, 0.3, () => m.kd === 1);
  assert.equal(m.kd, 1);
  twin(s, 4);
});

// ---- spayed ---------------------------------------------------------------------------------------

/** A dog (a Great Dane if sup) worn out by a sprinkler, or a Barcode Laser; returns the game and events. */
function finishDog(cards, id, { sup = 0, laser = false } = {}) {
  const s = game(cards);
  openEmpty(s, 13);
  if (laser) assert.ok(applyCommand(s, 0, { c: 'place', k: 'railgun', x: 5, y: 8, d: 0 }).ok);
  else assert.ok(applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 10, y: 8 }).ok);
  const d = walker(s, 'dog', laser ? 10.5 : 11.5, 8.5, { hp: 0.01, mhp: 100, ...(sup ? { sup: 1 } : {}) });
  d.id = id;
  const ev = run(s, 2, () => d.st === ST.LEAVE || !s.shoppers.includes(d));
  return { s, ev };
}

test('spayed: 30% of dogs (by id) are pregnant and burst into 5 puppies (a Great Dane 8); a Barcode Laser stops it', () => {
  const picked = idFor('spayed'), spared = idFor('spayed', false);
  let { s, ev } = finishDog(['spayed'], picked);
  const pop = ev.find((e) => e.e === 'pop');
  assert.deepEqual([pop.n, pop.pup], [CARDS.spayed.pups, 1]);
  assert.ok(ev.some((e) => e.e === 'left' && e.k === 'dog' && e.why === 'pop'));
  const pups = s.shoppers.filter((x) => x.k === 'pup');
  assert.equal(pups.length, CARDS.spayed.pups);
  assert.ok(pups.every((p) => !p.sup && p.hp === patienceFor(s, PUP, 'pup') && p.hp === patienceFor(s, BABY, 'baby')));
  assert.equal(s.ws.stopped, 1, 'she counts as stopped');
  ({ s, ev } = finishDog(['spayed'], picked, { sup: 1 }));
  assert.equal(s.shoppers.filter((x) => x.k === 'pup').length, CARDS.spayed.supPups);
  // The Barcode Laser: she storms off, nothing comes out.
  ({ s, ev } = finishDog(['spayed'], picked, { laser: true }));
  assert.ok(ev.some((e) => e.e === 'nopop' && e.pup === 1));
  assert.equal(s.shoppers.filter((x) => x.k === 'pup').length, 0);
  // Not a pregnant one, and not without the card: an ordinary dog storms off.
  for (const [cards, id] of [[['spayed'], spared], [null, picked]]) {
    ({ s, ev } = finishDog(cards, id));
    assert.ok(!ev.some((e) => e.e === 'pop' || e.e === 'nopop'));
    assert.ok(ev.some((e) => e.e === 'left' && e.k === 'dog' && e.why === 'annoyed'));
    assert.equal(s.shoppers.filter((x) => x.k === 'pup').length, 0);
  }
  // Litter-size cards are about the Pregnant Lady, not dogs.
  assert.equal(finishDog(['spayed', 'litter'], picked).s.shoppers.filter((x) => x.k === 'pup').length, CARDS.spayed.pups);
  assert.equal(pupsOf(game(['spayed']), { id: picked, k: 'hunter' }), 0);
});

test('spayed: puppies run for the tills like babies: $5 and no refund, not counted as stopped, and they keep the event going', () => {
  const s = game(['spayed', 'restocking']);
  openEmpty(s, 13);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 4, y: 3 }).ok);
  const d = walker(s, 'dog', 5.5, 3.5, { hp: 0.01, mhp: 100 });
  d.id = idFor('spayed');
  const posts = s.grid.filter(Boolean).length;
  const ev = run(s, 60, () => s.phase !== 'wave');
  const pups = ev.filter((e) => (e.e === 'escape' || e.e === 'left') && e.k === 'pup');
  assert.equal(pups.length, CARDS.spayed.pups, 'every puppy either reached a till or gave up');
  for (const e of pups.filter((x) => x.e === 'escape')) { assert.equal(e.n, 0); assert.equal(e.refund, PUP.refund); }
  for (const e of pups.filter((x) => x.e === 'left')) assert.equal(e.fee, undefined, 'a puppy pays no restocking fee');
  assert.equal(s.refunds, 0);
  assert.equal(s.ws.stopped, 1, 'only the dog');
  // The event ended only once the last puppy was gone, and no puppy peed on anything.
  const end = ev.findIndex((e) => e.e === 'waveEnd'), last = ev.findLastIndex((e) => e.k === 'pup');
  assert.ok(end > last);
  assert.ok(!ev.some((e) => e.e === 'pee'));
  assert.equal(s.grid.filter(Boolean).length, posts);
});

test('spayed: a copy made with puppies loose plays on identically', () => {
  const { s } = finishDog(['spayed'], idFor('spayed'), { sup: 1 });
  step(s);
  assert.ok(s.shoppers.some((x) => x.k === 'pup'));
  twin(s, 3);
});

// ---- eyesup ---------------------------------------------------------------------------------------

/**
 * A store with Exhibitionists at `flashers` (x positions on row 7, or [x, y]) and a dad at (x, y),
 * built by `build`. Returns the game, the dad, the flashers.
 */
function dadAndFlashers(cards, dadAt, flashers, { id = idFor('eyesup'), build = null } = {}) {
  const s = game(cards);
  if (build) build(s);
  openEmpty(s);
  // (m: ticks to her next flash, far off: these tests are about walking.)
  const fs = flashers.map((f) => walker(s, 'flasher', ...(Array.isArray(f) ? f : [f, 7.5]), { m: 1e6 }));
  const dad = walker(s, 'dad', ...dadAt);
  dad.id = id;
  return { s, dad, fs };
}
/** Plays until the dad is gone, checking he is never less than the gap behind her (by each one's own map). */
function trail(s, dad, fs) {
  const hop = getField(s, HOP), dist = getField(s, NORMAL);
  let closest = Infinity, waited = 0, movedAfter = null;
  const ev = run(s, 60, () => !s.shoppers.length, (e) => {
    if (dad.ex !== undefined) {
      const her = s.shoppers.find((o) => o.id === dad.ex);
      if (her) closest = Math.min(closest, hop[tileOf(s, dad)] - dist[tileOf(s, her)]);
      if (dad.vx === 0 && dad.vy === 0 && dad.st === ST.WALK) waited++;
    }
    // On the tick the last Exhibitionist leaves the store, he moves on.
    if (e.some((x) => x.e === 'escape' && x.k === 'flasher') && !s.shoppers.some((o) => o.k === 'flasher')) movedAfter = dad.vx !== 0 || dad.vy !== 0;
  });
  const order = ev.filter((e) => e.e === 'escape').map((e) => e.k);
  return { ev, closest, waited, order, movedAfter };
}

test('eyesup: a dad who comes up behind her falls in, keeps back, and cannot reach a till before her', () => {
  const { s, dad, fs } = dadAndFlashers(['eyesup'], [8.5, 7.5], [12.5]);
  const r = trail(s, dad, fs);
  assert.equal(r.ev.filter((e) => e.e === 'trail').length, 1);
  assert.ok(r.closest >= 1, `closest ${r.closest}`);
  assert.ok(r.waited > 0, 'he had to wait for her');
  assert.deepEqual(r.order, ['flasher', 'dad']);
  assert.equal(r.movedAfter, true, 'he moves on the tick she is gone');
  // A dad the card does not pick, or a game without it: straight past her.
  for (const [cards, id] of [[['eyesup'], idFor('eyesup', false)], [null, idFor('eyesup')]]) {
    const o = dadAndFlashers(cards, [8.5, 7.5], [12.5], { id });
    const q = trail(o.s, o.dad, o.fs);
    assert.ok(!q.ev.some((e) => e.e === 'trail'));
    assert.deepEqual(q.order, ['dad', 'flasher']);
    assert.equal(o.dad.ex, undefined);
  }
  // Half of all dads.
  const g = game(['eyesup']);
  let n = 0;
  for (let id = 1; id <= 2000; id++) if (trailsFlasher(g, { id, k: 'dad' })) n++;
  assert.ok(Math.abs(n / 2000 - CARDS.eyesup.share) < 0.03);
});

test('eyesup: a dad already ahead of her ignores her, and so does one ahead by his own map (over a belt she must go round)', () => {
  let o = dadAndFlashers(['eyesup'], [14.5, 7.5], [11.5]);
  let r = trail(o.s, o.dad, o.fs);
  assert.ok(!r.ev.some((e) => e.e === 'trail'));
  assert.deepEqual(r.order, ['dad', 'flasher']);
  // A belt down column 16 with a way round at the bottom: she walks round it, he steps over it.
  const belts = (s) => { for (let y = 1; y <= 13; y++) assert.ok(applyCommand(s, 0, { c: 'place', k: 'belt', x: 16, y, d: 1 }).ok); };
  o = dadAndFlashers(['eyesup'], [13.5, 7.5], [15.5], { build: belts });
  r = trail(o.s, o.dad, o.fs);
  assert.ok(!r.ev.some((e) => e.e === 'trail'), 'by his own map he is nearer the tills than she is by hers');
  assert.deepEqual(r.order, ['dad', 'flasher']);
});

test('eyesup: a dad who meets her at a doorway waits behind her and goes through after her', () => {
  // A wall of crates down column 18 with one gap, on row 7.
  const wall = (s) => { for (let y = 1; y <= 14; y++) if (y !== 7) assert.ok(applyCommand(s, 0, { c: 'place', k: 'crate', x: 18, y }).ok); };
  const { s, dad, fs } = dadAndFlashers(['eyesup'], [14.5, 7.5], [17.5], { build: wall });
  const door = 7 * s.w + 18;
  // He never steps into the doorway while she is in it or still short of it.
  let barged = false;
  const hop = getField(s, HOP);
  run(s, 6, () => !s.shoppers.includes(fs[0]) || fs[0].x > 21, () => {
    if (tileOf(s, dad) === door && fs[0].x < 19) barged = true;
  });
  assert.equal(barged, false);
  assert.notEqual(hop[door], UNREACHABLE);
  const r = trail(s, dad, fs);
  assert.ok(r.closest >= 1);
  assert.deepEqual(r.order, ['flasher', 'dad']);
});

test('eyesup: with two Exhibitionists he trails one at a time, and is never left standing once both are gone', () => {
  const { s, dad, fs } = dadAndFlashers(['eyesup'], [9.5, 7.5], [12.5, [14.5, 6.5]]);
  const behind = new Set();
  run(s, 30, () => !s.shoppers.includes(dad), () => { if (dad.ex !== undefined) behind.add(dad.ex); });
  // He fell in behind the nearer one first (the one with the furthest still to walk).
  assert.ok(behind.has(fs[0].id));
  assert.ok([...behind].every((id) => fs.some((f) => f.id === id)));
  const again = dadAndFlashers(['eyesup'], [9.5, 7.5], [12.5, [14.5, 6.5]]);
  const r = trail(again.s, again.dad, again.fs);
  assert.ok(r.closest >= 1);
  assert.equal(r.order[r.order.length - 1], 'dad', 'both reach the tills before him');
  assert.equal(r.movedAfter, true);
});

test('eyesup: a copy made while a dad trails her plays on identically', () => {
  const { s, dad } = dadAndFlashers(['eyesup'], [8.5, 7.5], [12.5]);
  run(s, 3, () => dad.ex !== undefined);
  assert.notEqual(dad.ex, undefined);
  twin(s, 5);
});

// ---- slushie --------------------------------------------------------------------------------------

/** A teenager on tile (x, y) drops a mess there now; returns the tiles with messes and the game. */
function messAt(cards, x, y, build = null) {
  const s = game(cards);
  if (build) build(s);
  openEmpty(s);
  walker(s, 'teen', x + 0.5, y + 0.5, { m: 1 });
  const ev = step(s);
  return { s, ev, tiles: s.messes.map((m) => m[0]).sort((a, b) => a - b) };
}

test('slushie: a teenager\'s mess covers its tile and the four beside it, never a wall, till, entrance or building', () => {
  const at = (s, x, y) => y * s.w + x;
  let r = messAt(['slushie'], 5, 5);
  assert.deepEqual(r.tiles, [at(r.s, 5, 4), at(r.s, 4, 5), at(r.s, 5, 5), at(r.s, 6, 5), at(r.s, 5, 6)]);
  assert.equal(r.ev.find((e) => e.e === 'mess').wide, 4);
  // The spilt tiles are drawn without the cup (a third element), and dry out with it.
  assert.deepEqual(r.s.messes.map((m) => m.length).sort(), [2, 3, 3, 3, 3]);
  r.s.shoppers.length = 0;
  r.s.phase = 'build';
  r.s.phaseT = 1e6;
  run(r.s, TUNE.messSecs + 0.2);
  assert.equal(r.s.messes.length, 0);
  // In a corner (walls), beside a till, an entrance and a building.
  r = messAt(['slushie'], 1, 1);
  assert.equal(r.tiles.length, 3);
  r = messAt(['slushie'], 28, 6);
  assert.ok(r.tiles.every((i) => r.s.tiles[i] === '.'));
  assert.equal(r.tiles.length, 4);
  r = messAt(['slushie'], 1, 7);
  assert.equal(r.tiles.length, 4, 'not on the entrance');
  r = messAt(['slushie'], 5, 5, (s) => assert.ok(applyCommand(s, 0, { c: 'place', k: 'crate', x: 6, y: 5 }).ok));
  assert.equal(r.tiles.length, 4);
  assert.ok(!r.tiles.includes(at(r.s, 6, 5)));
  for (const i of r.tiles) assert.ok(r.s.tiles[i] === '.' && !r.s.grid[i]);
  // Without the card: one tile.
  r = messAt(null, 5, 5);
  assert.deepEqual(r.tiles, [at(r.s, 5, 5)]);
  assert.equal(r.ev.find((e) => e.e === 'mess').wide, undefined);
});

test('slushie: a spilt tile slows shoppers like any mess, and a copy made with it on the floor plays on identically', () => {
  const r = messAt(['slushie'], 10, 7);
  const h = walker(r.s, 'hunter', 11.5, 7.5);
  const x0 = h.x;
  step(r.s);
  assert.ok(Math.abs(h.x - x0) < SHOPPERS.hunter.speed * 1.11 * TUNE.wetSlow / TICK_HZ + 1e-9, 'slowed on the spilt tile');
  twin(r.s, 3);
});

// ---- eightyproof ---------------------------------------------------------------------------------

test('eightyproof: about half of all Free Sample tables hand out booze, decided when built; none without the card', () => {
  const s = game(['eightyproof']);
  let booze = 0, n = 0;
  for (let y = 1; y <= 13; y += 2) {
    for (let x = 2; x <= 26; x += 2) {
      if (s.tiles[y * s.w + x] !== '.') continue; // (the pillars)
      const ev = [];
      assert.ok(applyCommand(s, 0, { c: 'place', k: 'samples', x, y }, ev).ok);
      const b = s.grid[y * s.w + x];
      if (b.bz) booze++;
      assert.equal(!!ev[0].booze, !!b.bz);
      n++;
    }
  }
  assert.ok(booze > n * 0.3 && booze < n * 0.7, `${booze} of ${n}`);
  // Other buildings never; and without the card, no table, and no random number drawn.
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'crate', x: 3, y: 2 }).ok);
  assert.equal(s.grid[2 * s.w + 3].bz, undefined);
  const g = game(null);
  const rng = g.rng;
  assert.ok(applyCommand(g, 0, { c: 'place', k: 'samples', x: 5, y: 5 }).ok);
  assert.equal(g.rng, rng);
  assert.equal(g.grid[5 * g.w + 5].bz, undefined);
});

test('eightyproof: a booze table keeps its booze when a gym bro wrecks it and it is rebuilt', (t) => {
  tune(t, { smashOther: 1 });
  for (const how of ['rebuild', 'place']) {
    const s = game(['eightyproof']);
    let x = 4;
    for (;;) {
      assert.ok(applyCommand(s, 0, { c: 'place', k: 'samples', x, y: 5 }).ok);
      if (s.grid[5 * s.w + x].bz) break;
      x += 2;
    }
    openEmpty(s);
    const g = walker(s, 'gymbro', x + 0.5, 6.5, { sm: 0, hn: 0, hw: 0 });
    run(s, 1, () => s.rubble.length > 0);
    assert.equal(s.rubble[0].bz, 1);
    s.shoppers.splice(s.shoppers.indexOf(g), 1);
    const r = how === 'rebuild' ? applyCommand(s, 0, { c: 'rebuild' }) : applyCommand(s, 0, { c: 'place', k: 'samples', x, y: 5 });
    assert.ok(r.ok, how);
    assert.equal(s.grid[5 * s.w + x].bz, 1, how);
  }
});

/** A shopper of kind k stopping at a Free Sample table on (10, 6), booze or not. */
function sampleStop(cards, k, booze, more = {}) {
  const s = game(cards);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'samples', x: 10, y: 6 }).ok);
  const b = s.grid[6 * s.w + 10];
  if (booze) b.bz = 1; else delete b.bz;
  openEmpty(s, 12);
  const sh = walker(s, k, 10.5, 7.6, more);
  const ev = run(s, 0.2, () => sh.st !== ST.WALK);
  return { s, sh, ev };
}

test('eightyproof: an adult who stops at a booze table may become a Day Drinker, keeping his share of patience and his super', (t) => {
  tune(t, { chance: 1 }, CARDS.eightyproof);
  const { s, sh, ev } = sampleStop(['eightyproof'], 'clipper', true, { sup: 1, hp: 30, mhp: 120, lf: 99, lw: 30, pn: { 5: 1 } });
  assert.ok(ev.some((e) => e.e === 'sample'));
  const d = ev.find((e) => e.e === 'drunk');
  assert.deepEqual([d.k, d.sup], ['clipper', 1]);
  assert.equal(sh.k, 'drinker');
  assert.equal(sh.sup, 1);
  const hp = patienceFor(s, SUPERS.drinker, 'drinker');
  assert.equal(sh.mhp, hp);
  assert.ok(Math.abs(sh.hp - hp * 0.25) < 1e-9);
  assert.equal(sh.sv, 1);
  for (const f of ['lf', 'lw', 'bq', 'sa']) assert.equal(sh[f], undefined, f);
  assert.deepEqual(sh.pn, { 5: 1 }, 'what the salesmen have pitched him stays');
  // He walks off as a drunk: swaying, and able to fall.
  const ev2 = run(s, 8, () => !s.shoppers.includes(sh));
  assert.ok(sh.sv !== 1 || ev2.some((e) => e.e === 'fall' || e.e === 'escape'));
});

test('eightyproof: not moms or Pregnant Ladies, not at a plain table, not without the card; and it gets likelier each time', (t) => {
  const { chance, step: more } = CARDS.eightyproof;
  tune(t, { chance: 1 }, CARDS.eightyproof);
  for (const [cards, k, booze] of [[['eightyproof'], 'mom', true], [['eightyproof'], 'preggo', true], [['eightyproof'], 'hunter', false], [null, 'hunter', true]]) {
    const extra = k === 'mom' ? { kd: 0, kx: 10.5, ky: 7.6, kvx: 0, kvy: 0, kr: 0, kc: 1e6, kn: 0 } : {};
    const { sh, ev } = sampleStop(cards, k, booze, extra);
    assert.ok(ev.some((e) => e.e === 'sample'), `${k} stopped`);
    assert.equal(sh.k, k);
    assert.ok(!ev.some((e) => e.e === 'drunk'));
  }
  assert.ok(drinks(SHOPPERS.hunter) && drinks(SUPERS.clipper) && !drinks(SHOPPERS.mom) && !drinks(SHOPPERS.preggo) && !drinks(SHOPPERS.teen) && !drinks(SHOPPERS.dad));
  // (Back to the card's own number for the rest: tune puts it back after the test anyway.)
  CARDS.eightyproof.chance = chance;
  assert.equal(boozeChance(0), chance);
  assert.equal(boozeChance(1), chance + more);
  assert.equal(boozeChance(99), 1);
  // At the real numbers: he survives his first booze table about three times in four, and counts it.
  let turned = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = game(['eightyproof'], seed);
    assert.ok(applyCommand(s, 0, { c: 'place', k: 'samples', x: 10, y: 6 }).ok);
    s.grid[6 * s.w + 10].bz = 1;
    openEmpty(s, 12);
    const sh = walker(s, 'hunter', 10.5, 7.6);
    run(s, 0.2, () => sh.st !== ST.WALK);
    if (sh.k === 'drinker') turned++; else assert.equal(sh.bq, 1);
  }
  assert.ok(Math.abs(turned / 200 - chance) < 0.1, `${turned} of 200`);
});

test('eightyproof: a copy made just after a shopper turned plays on identically', (t) => {
  tune(t, { chance: 1 }, CARDS.eightyproof);
  const { s, sh } = sampleStop(['eightyproof'], 'hunter', true);
  assert.equal(sh.k, 'drinker');
  twin(s, 5);
});

// ---- warranty -------------------------------------------------------------------------------------

test('warranty: a shopper who stops at a sample table may buy something for $50, paid like any sale', (t) => {
  tune(t, { chance: 1 }, CARDS.warranty);
  for (const difficulty of ['normal', 'hard']) {
    const s = game(['warranty'], 5, { settings: { difficulty } });
    assert.ok(applyCommand(s, 0, { c: 'place', k: 'samples', x: 10, y: 6 }).ok);
    openEmpty(s, 12);
    const cash = teamCash(s), earned = s.ws.earned;
    const sh = walker(s, 'hunter', 10.5, 7.6);
    const ev = run(s, 0.2, () => sh.st !== ST.WALK);
    const b = ev.find((e) => e.e === 'bought');
    const v = Math.round(CARDS.warranty.sample * difficultyOf(s).pay);
    assert.deepEqual([b.v, b.k, b.i, b.by], [v, 'samples', 6 * s.w + 10, 'hunter']);
    assert.ok(Math.abs(teamCash(s) - cash - v) < 1e-6, difficulty);
    assert.equal(s.ws.earned - earned, v);
    assert.equal(s.players[0].w.earned, v);
  }
  // Never at chance 0, and never without the card.
  CARDS.warranty.chance = 0;
  const s = game(['warranty']);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'samples', x: 10, y: 6 }).ok);
  openEmpty(s, 12);
  walker(s, 'hunter', 10.5, 7.6);
  assert.ok(!run(s, 1).some((e) => e.e === 'bought'));
  CARDS.warranty.chance = 1;
  const g = game(null);
  assert.ok(applyCommand(g, 0, { c: 'place', k: 'samples', x: 10, y: 6 }).ok);
  openEmpty(g, 12);
  const rng = g.rng;
  const sh = walker(g, 'hunter', 10.5, 7.6);
  const ev = run(g, 0.2, () => sh.st !== ST.WALK);
  assert.ok(ev.some((e) => e.e === 'sample') && !ev.some((e) => e.e === 'bought'));
  assert.equal(g.rng, rng, 'no random number drawn');
});

test('warranty: a shopper who stops for a TV Salesman may pay $100 to $400, once per stop', (t) => {
  tune(t, { chance: 1 }, CARDS.warranty);
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const s = game(['warranty'], seed);
    assert.ok(applyCommand(s, 0, { c: 'place', k: 'salesman', x: 12, y: 6 }).ok);
    openEmpty(s, 12);
    const ai = 6 * s.w + 12;
    walker(s, 'hunter', 11.5, 9.5, { sa: ai, sw: 60, sl: 120, pc: 1e6 });
    const ev = run(s, 4);
    const bought = ev.filter((e) => e.e === 'bought');
    assert.equal(bought.length, 1, 'once per stop');
    assert.ok(bought[0].v >= CARDS.warranty.salesMin && bought[0].v <= CARDS.warranty.salesMax && Number.isInteger(bought[0].v));
    assert.equal(bought[0].k, 'salesman');
    seen.add(bought[0].v);
  }
  assert.ok(seen.size > 6, 'the amount varies');
});

test('warranty: a copy made just after a sale at a stand plays on identically', (t) => {
  tune(t, { chance: 1 }, CARDS.warranty);
  const s = game(['warranty']);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'samples', x: 10, y: 6 }).ok);
  openEmpty(s, 12);
  walker(s, 'hunter', 10.5, 7.6);
  walker(s, 'clipper', 10.5, 9.6);
  run(s, 0.3, () => false);
  twin(s, 4);
});

// ---- supportdog -----------------------------------------------------------------------------------

/** A Man with Guide Dog (id) at (x, 7.5) and others round him; plays `secs`. */
function dogScene(cards, id, others, secs = 0.1) {
  const s = game(cards);
  openEmpty(s);
  const man = walker(s, 'blind', 10.5, 7.5, { bt: 0, pc: 1e6 });
  man.id = id;
  const rest = others.map(([k, x, y, more]) => walker(s, k, x, y, { pc: 1e6, ...more }));
  const ev = run(s, secs);
  return { s, man, rest, ev };
}

test('supportdog: shoppers who come within 1.5 tiles of a support dog stop 1.5 seconds to pet it, once per dog', () => {
  const picked = idFor('supportdog'), spared = idFor('supportdog', false);
  const { s, man, rest, ev } = dogScene(['supportdog'], picked, [['hunter', 11.6, 7.5], ['karen', 9.6, 7.5]], 1 / TICK_HZ);
  const pet = ev.find((e) => e.e === 'pet');
  assert.equal(pet.n, 2);
  for (const o of rest) { assert.equal(o.st, ST.WATCH); assert.equal(o.pd, man.id); }
  // 1.5 seconds, then on his way.
  const h = rest[0];
  let watched = 1;
  run(s, 3, () => h.st === ST.WALK, () => { if (h.st === ST.WATCH) watched++; });
  assert.ok(Math.abs(watched - CARDS.supportdog.secs * TICK_HZ) <= 1, `${watched}`);
  // Back beside the same dog, he walks on: once per dog.
  h.x = man.x + 0.5; h.y = man.y;
  const again = run(s, 0.2);
  assert.ok(!again.some((e) => e.e === 'pet' && e.k === 'hunter'));
  assert.equal(h.st, ST.WALK);
  // Another support dog, though, he stops for.
  const other = walker(s, 'blind', h.x + 0.6, h.y, { bt: 0 });
  other.id = idFor('supportdog', true, picked + 1);
  run(s, 1 / TICK_HZ);
  assert.equal(h.pd, other.id);
  assert.equal(h.st, ST.WATCH);
  // Not a guide dog, and not without the card.
  for (const [cards, id] of [[['supportdog'], spared], [null, picked]]) {
    const o = dogScene(cards, id, [['hunter', 11.6, 7.5]]);
    assert.ok(!o.ev.some((e) => e.e === 'pet'));
    assert.equal(o.rest[0].pd, undefined);
  }
  assert.ok(supportDog(game(['supportdog']), { id: picked, k: 'blind' }));
});

test('supportdog: dads, the boss, babies, puppies, men with dogs and a mom after her child never stop', () => {
  const picked = idFor('supportdog');
  const { ev, rest } = dogScene(['supportdog'], picked, [
    ['dad', 11.5, 7.5], ['boss', 9.5, 7.5, { tr: 1, pp: 1e6 }], ['baby', 10.5, 8.5], ['pup', 10.5, 6.5],
    ['blind', 11.2, 8.2, { bt: 0, id: 1 }], ['mom', 9.8, 6.8, { kd: 2, kx: 3.5, ky: 3.5, kvx: 0, kvy: 0, kr: 0, kc: 0, kn: 1 }],
  ]);
  assert.ok(!ev.some((e) => e.e === 'pet'));
  for (const o of rest) assert.equal(o.pd, undefined, o.k);
  for (const k of ['dad', 'blind']) assert.equal(stopsToPet(SHOPPERS[k]), false);
  for (const k of ['hunter', 'trader', 'flasher', 'dog']) assert.equal(stopsToPet(SHOPPERS[k]), true);
});

test('supportdog: pepper spray still makes a support dog bolt (nobody pets a bolting dog)', () => {
  const s = game(['supportdog']);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 10, y: 9 }).ok);
  openEmpty(s);
  const man = walker(s, 'blind', 10.5, 8.5, { bt: 0 });
  man.id = idFor('supportdog');
  walker(s, 'hunter', 11.5, 8.5);
  const ev = run(s, 0.2);
  assert.ok(ev.some((e) => e.e === 'bolt'));
  assert.ok(!ev.some((e) => e.e === 'pet'));
});

test('supportdog: a copy made mid-petting plays on identically', () => {
  const { s } = dogScene(['supportdog'], idFor('supportdog'), [['hunter', 11.6, 7.5], ['karen', 9.6, 7.5]], 0.3);
  assert.ok(s.shoppers.some((o) => o.st === ST.WATCH && o.pd !== undefined));
  twin(s, 3);
});

// ---- What DEB says ---------------------------------------------------------------------------------

test('DEB has her own lines for each new thing, and puppies write no reviews', async () => {
  const { createDirector } = await import('../src/content/director.js');
  const { LINES } = await import('../src/content/lines.js');
  const s = game(['spayed']);
  openEmpty(s);
  const said = (e) => createDirector(() => 0).handle([e], s).filter((m) => m.t === 'say').map((m) => m.text);
  // (A line matches if every piece of it between placeholders is in the text, in order.)
  const from = (bank, text) => LINES[bank].some((l) => {
    let at = 0;
    for (const bit of (typeof l === 'string' ? l : l.t).split(/\{\w\}/)) {
      const k = text.indexOf(bit, at);
      if (k < 0) return false;
      at = k + bit.length;
    }
    return true;
  });
  for (const [e, bank] of [
    [{ e: 'pop', x: 3, y: 3, n: 5, sup: 0, pup: 1 }, 'litter'],
    [{ e: 'pop', x: 3, y: 3, n: 12, sup: 0 }, 'pop'],
    [{ e: 'kid', x: 3, y: 3, back: 1 }, 'wrongway'],
    [{ e: 'kid', x: 3, y: 3 }, 'kid'],
    [{ e: 'drunk', x: 3, y: 3, k: 'hunter', sup: 0 }, 'drunk'],
    [{ e: 'bought', i: 5, k: 'salesman', v: 220, x: 3, y: 3, by: 'hunter' }, 'bought'],
    [{ e: 'trail', x: 3, y: 3 }, 'trail'],
    [{ e: 'pet', x: 3, y: 3, n: 2, k: 'hunter' }, 'pet'],
  ]) {
    const got = said(e);
    assert.equal(got.length, 1, e.e);
    assert.ok(from(bank, got[0]), `${e.e}: "${got[0]}" is from ${bank}`);
  }
  // A pregnant dog stopped by the laser, and puppies at the tills or giving up: nothing.
  assert.deepEqual(createDirector(() => 0).handle([{ e: 'nopop', x: 3, y: 3, sup: 0, pup: 1 }], s), []);
  assert.deepEqual(createDirector(() => 0).handle([{ e: 'escape', k: 'pup', sup: 0, x: 29, y: 6, refund: 5, n: 0 }], s), []);
  assert.deepEqual(createDirector(() => 0).handle([{ e: 'left', k: 'pup', sup: 0, x: 9, y: 6, by: 0, why: 'annoyed' }], s), []);
});
