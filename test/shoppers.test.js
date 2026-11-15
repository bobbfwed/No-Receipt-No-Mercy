// Tests for the shoppers with a trick: teenager, mom and kid, man with guide dog, gym bro.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, step, queueTrainingWave, waveSpec, getField,
  SHOPPERS, TUNE, TICK_HZ, ST, SMASH, NORMAL, UNREACHABLE, idxOf, W,
} from '../src/sim/index.js';

/** A training game (no timer, cannot be lost) with plenty of cash, to stage one kind of shopper. */
function stage(seed = 5) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.cash = 100000;
  return s;
}
const place = (s, k, x, y, d = 0) => applyCommand(s, 0, { c: 'place', k, x, y, d });
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

test('a teenager leaves messes that slow other shoppers but not himself', () => {
  const s = stage();
  send(s, [{ k: 'teen', n: 1, gap: 1, at: 0 }]);
  const ev = play(s, 60);
  const messes = ev.filter((e) => e.e === 'mess');
  assert.ok(messes.length >= 3, `expected several messes, got ${messes.length}`);
  assert.ok(messes.every((m) => s.tiles[m.i] === '.'), 'messes only land on plain floor');

  // Time a hunter across the same floor with and without a carpet of messes.
  const timeAcross = (withMess, kind) => {
    const g = stage(8);
    if (withMess) for (let x = 2; x <= 27; x++) for (const y of [7, 8]) g.messes.push([idxOf(x, y), 100000]);
    send(g, [{ k: kind, n: 1, gap: 1, at: 0 }]);
    let ticks = 0;
    play(g, 120, () => { ticks++; });
    return ticks;
  };
  assert.ok(timeAcross(true, 'hunter') > timeAcross(false, 'hunter') * 1.5, 'a mess slows a bargain hunter');
  const teenClean = timeAcross(false, 'teen'), teenMessy = timeAcross(true, 'teen');
  assert.ok(Math.abs(teenMessy - teenClean) <= teenClean * 0.05, 'a teenager is not slowed by mess');
  assert.equal(timeAcross(true, 'scooter'), timeAcross(false, 'scooter'), 'a mobility scooter is not slowed either');
});

test('messes dry up', () => {
  const s = stage();
  s.messes.push([idxOf(5, 5), 3]);
  place(s, 'crate', 20, 2); // training: the factory clock runs
  step(s); step(s);
  assert.equal(s.messes.length, 1);
  step(s);
  assert.equal(s.messes.length, 0);
});

test('a dad can slip on a mess', () => {
  let slips = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const s = stage(seed);
    for (let x = 2; x <= 27; x++) for (const y of [7, 8]) s.messes.push([idxOf(x, y), 100000]);
    send(s, [{ k: 'dad', n: 3, gap: 0.4, at: 0 }]);
    slips += play(s, 90).filter((e) => e.e === 'slip').length;
  }
  assert.ok(slips > 10, `dads slipped ${slips} times across six runs`);
});

test('a child escapes, runs ahead a limited distance, and the mom sprints after him', () => {
  const s = stage(11);
  send(s, [{ k: 'mom', n: 1, gap: 1, at: 0 }]);
  let maxLead = 0, sawRun = false, sawWait = false, chaseSpeed = 0, walkSpeed = 0;
  const ev = play(s, 120, () => {
    const m = s.shoppers[0];
    if (!m || m.st !== ST.WALK) return;
    const v = Math.hypot(m.vx, m.vy) * TICK_HZ;
    if (m.kd > 0) {
      maxLead = Math.max(maxLead, Math.hypot(m.kx - m.x, m.ky - m.y));
      if (m.kd === 1) sawRun = true; else sawWait = true;
      chaseSpeed = Math.max(chaseSpeed, v);
    } else walkSpeed = Math.max(walkSpeed, v);
  });
  const escapes = ev.filter((e) => e.e === 'kid').length, catches = ev.filter((e) => e.e === 'caught').length;
  assert.ok(escapes >= 1, 'the child escapes at least once on the way across');
  assert.ok(catches >= escapes - 1 && catches >= 1, `she catches him (${catches} of ${escapes})`);
  assert.ok(sawRun && sawWait, 'the child runs, then waits');
  assert.ok(maxLead > 1 && maxLead <= TUNE.kidMax + 0.5, `the child got ${maxLead.toFixed(1)} tiles ahead`);
  assert.ok(Math.abs(walkSpeed - SHOPPERS.mom.speed) < 0.01, 'normal pace with the child in the cart');
  assert.ok(Math.abs(chaseSpeed - SHOPPERS.mom.speed * TUNE.chaseSpeed) < 0.01, 'sprints while chasing');
  assert.equal(ev.filter((e) => e.e === 'escape').length, 1, 'one refund for the pair, none for the child');
});

test('a mom stops for free samples only while the child is in the cart', () => {
  let browsedInCart = 0, browsedChasing = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const s = stage(seed);
    for (let x = 3; x <= 24; x += 3) place(s, 'samples', x, 6); // stands all along the route
    send(s, [{ k: 'mom', n: 2, gap: 2, at: 0 }]);
    const was = new Map();
    play(s, 180, () => {
      for (const m of s.shoppers) {
        if (m.st === ST.BROWSE && was.get(m.id) !== ST.BROWSE) { if (m.kd > 0) browsedChasing++; else browsedInCart++; }
        was.set(m.id, m.st);
      }
    });
  }
  assert.ok(browsedInCart > 5, `stopped ${browsedInCart} times with the child in the cart`);
  assert.equal(browsedChasing, 0, 'never starts on a sample while chasing');
});

test('pepper spray makes the guide dog bolt; wet floors and samples do nothing to him', () => {
  const timeAcross = (build) => {
    const s = stage(3);
    build(s);
    send(s, [{ k: 'blind', n: 1, gap: 1, at: 0 }]);
    let ticks = 0, bolts = 0, browsed = false, hpLeft = SHOPPERS.blind.hp;
    play(s, 200, (ev) => {
      ticks++;
      bolts += ev.filter((e) => e.e === 'bolt').length;
      const m = s.shoppers[0];
      if (m) { if (m.st === ST.BROWSE) browsed = true; hpLeft = m.hp; }
    });
    return { ticks, bolts, browsed, hpLeft };
  };
  const plain = timeAcross(() => {});
  const wet = timeAcross((s) => { for (let x = 2; x <= 27; x++) for (const y of [7, 8]) place(s, 'wetfloor', x, y); });
  assert.equal(wet.ticks, plain.ticks, 'not slowed by wet floor signs');
  const sampled = timeAcross((s) => { for (let x = 3; x <= 24; x += 3) place(s, 'samples', x, 6); });
  assert.equal(sampled.browsed, false, 'cannot see the free samples');
  // Sprinklers half way (one each side of the two lanes): he is hurt, and arrives sooner than
  // if nobody had sprayed him.
  const sprayed = timeAcross((s) => { place(s, 'sprinkler', 14, 6); place(s, 'sprinkler', 14, 9); });
  assert.ok(sprayed.bolts >= 1, 'the dog bolts');
  assert.ok(sprayed.hpLeft < SHOPPERS.blind.hp, 'the spray still hurts him');
  assert.ok(sprayed.ticks < plain.ticks, `sprayed he crosses in ${sprayed.ticks} ticks, unsprayed in ${plain.ticks}`);
});

test('a gym bro walks through crate stacks and wrecks them; others go around', () => {
  const wall = (s) => {
    for (let y = 1; y <= 13; y++) assert.ok(place(s, 'crate', 12, y).ok); // one gap, at the bottom
  };
  const s = stage(2);
  wall(s);
  assert.ok(getField(s, SMASH)[idxOf(0, 7)] < getField(s, NORMAL)[idxOf(0, 7)], 'his route is shorter');
  send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  const ev = play(s, 120);
  const smashes = ev.filter((e) => e.e === 'smash');
  assert.equal(smashes.length, 1, 'he goes through one crate stack');
  assert.equal(s.grid[smashes[0].i], 0, 'which is gone afterwards');
  assert.equal(smashes[0].i % W, 12);
  assert.equal(ev.filter((e) => e.e === 'escape').length, 1);

  const t = stage(2);
  wall(t);
  send(t, [{ k: 'hunter', n: 2, gap: 1, at: 0 }]);
  const ev2 = play(t, 200);
  assert.equal(ev2.filter((e) => e.e === 'smash').length, 0);
  for (let y = 1; y <= 13; y++) assert.equal(t.grid[idxOf(12, y)].k, 'crate', 'the wall is intact after hunters');
});

test('machines and belts still stop a gym bro, and building stays possible while he is about', () => {
  const s = stage(2);
  for (let y = 1; y <= 13; y++) place(s, y % 2 ? 'press' : 'belt', 12, y, 1);
  assert.equal(getField(s, SMASH)[idxOf(12, 7)], UNREACHABLE);
  send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  let checked = false;
  const ev = play(s, 200, () => {
    if (!checked && s.shoppers[0] && s.shoppers[0].x > 5) {
      assert.equal(canPlace(s, 'crate', 20, 3), null);
      checked = true;
    }
  });
  assert.ok(checked);
  assert.equal(ev.filter((e) => e.e === 'smash').length, 0);
});

test('later waves contain every kind, and stay deterministic through a snapshot', () => {
  const kinds = new Set(waveSpec(9).map((g) => g.k));
  for (const k of Object.keys(SHOPPERS)) assert.ok(kinds.has(k), `wave 9 includes ${k}`);
  assert.ok(!waveSpec(2).some((g) => ['teen', 'mom', 'blind', 'gymbro'].includes(g.k)), 'the new kinds do not appear in the first waves');

  const make = () => {
    const g = createGame({ seed: 77 });
    addPlayer(g, 'Dave');
    g.cash = 100000;
    for (let y = 1; y <= 12; y++) place(g, 'crate', 9, y);
    for (let x = 3; x <= 24; x += 5) { place(g, 'samples', x, 5); place(g, 'sprinkler', x + 1, 9); place(g, 'wetfloor', x + 2, 8); }
    g.wave = 8;
    applyCommand(g, 0, { c: 'start' });
    return g;
  };
  const a = make(), b = make();
  const seen = new Set();
  for (let i = 0; i < 45 * TICK_HZ; i++) { for (const e of step(a)) seen.add(e.e); step(b); }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 30 * TICK_HZ; i++) { step(a); step(c); }
  assert.equal(JSON.stringify(a), JSON.stringify(c), 'a client copy stays identical');
  for (const e of ['mess', 'kid', 'caught', 'bolt', 'smash']) assert.ok(seen.has(e), `event ${e} happened in wave 9`);
});
