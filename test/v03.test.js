// Tests for the rules added in version 0.3: every shopper walks at his own pace, some shoppers are
// weak or tough against certain security, and browsing shoppers go out of their way to shoplift.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, queueTrainingWave, walkPace, babyPace, defOf,
  SHOPPERS, BOSS, BABY, TUNE, TICK_HZ, DT, ST,
} from '../src/sim/index.js';

/** An ordinary game on the original small map, one player, doors not yet open. */
function game(seed = 5) {
  const s = createGame({ seed });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}

// ---------------------------------------------------------------- every shopper at his own pace

test('each shopper walks at his own pace: 10% either side of his kind, spread evenly, from his id alone', () => {
  const s = game();
  assert.equal(TUNE.paceSpread, 0.1);
  const paces = [];
  for (let id = 1; id <= 200; id++) paces.push(walkPace(s, { id, k: 'hunter' }));
  for (const p of paces) assert.ok(p >= 0.9 - 1e-12 && p <= 1.1 + 1e-12, `pace ${p}`);
  assert.ok(Math.min(...paces) < 0.905 && Math.max(...paces) > 1.095, 'uses the whole band');
  // Evenly: every tenth of the band gets roughly a tenth of 200 shoppers.
  const bins = new Array(10).fill(0);
  for (const p of paces) bins[Math.min(9, Math.floor(((p - 0.9) / 0.2) * 10))]++;
  for (const n of bins) assert.ok(n >= 15 && n <= 25, `bins ${bins}`);
  // A run of consecutive ids (a group arriving together) is spread out too, not bunched.
  const run = [11, 12, 13, 14, 15].map((id) => walkPace(s, { id, k: 'dad' }));
  assert.ok(Math.max(...run) - Math.min(...run) > 0.1, `run ${run}`);
  // The same id always gets the same pace, whatever else is in the state.
  assert.equal(walkPace(s, { id: 42, k: 'karen' }), walkPace(game(99), { id: 42, k: 'karen', sup: 1 }));
});

test('the boss, babies and a training game walk at exactly their speed; babies keep their own spread', () => {
  const s = game();
  assert.equal(walkPace(s, { id: 7, k: 'boss' }), 1);
  assert.equal(walkPace(s, { id: 7, k: 'baby' }), 1);
  const tr = createGame({ seed: 5, training: true });
  assert.equal(walkPace(tr, { id: 7, k: 'hunter' }), 1);
  // (babyPace is unchanged: still between BABY.paceMin and paceMax.)
  assert.ok(babyPace(3) >= BABY.paceMin && babyPace(3) <= BABY.paceMax);
});

/** The fastest step (in tiles) a shopper took over n ticks of walking on open floor. */
function topStep(s, sh, n) {
  let top = 0;
  for (let i = 0; i < n; i++) {
    step(s);
    if (!s.shoppers.includes(sh) || sh.st !== ST.WALK) continue;
    top = Math.max(top, Math.hypot(sh.vx, sh.vy));
  }
  return top;
}

test('in a real game a shopper really walks at his kind\'s speed times his own pace', () => {
  const s = game(3);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  // Let the first sales event's hunters arrive on the bare floor.
  let hunters = [];
  for (let i = 0; i < 8 * TICK_HZ && hunters.length < 3; i++) { step(s); hunters = s.shoppers.filter((m) => m.k === 'hunter'); }
  assert.ok(hunters.length >= 3);
  const sh = hunters[0];
  const want = SHOPPERS.hunter.speed * walkPace(s, sh) * DT;
  const got = topStep(s, sh, 20);
  assert.ok(Math.abs(got - want) < 1e-9, `step ${got}, want ${want}`);
  // Different ids, different paces: no two of the first three walk at the same speed.
  const p = hunters.map((m) => walkPace(s, m));
  assert.equal(new Set(p.map((v) => v.toFixed(6))).size, 3);
  // No field was added to the shopper for it (the state, a save and the checksum are untouched).
  for (const m of s.shoppers) for (const k of Object.keys(m)) assert.ok(!/pace/i.test(k), k);
});

test('a training game\'s shoppers walk at exactly their kind\'s speed (the lessons depend on it)', () => {
  const s = createGame({ seed: 5, training: true });
  addPlayer(s, 'Dave');
  queueTrainingWave(s, [{ k: 'hunter', n: 3, gap: 1, at: 0 }]);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  let sh = null;
  for (let i = 0; i < 60 && !sh; i++) { step(s); sh = s.shoppers[0]; }
  assert.ok(sh);
  const got = topStep(s, sh, 20);
  assert.ok(Math.abs(got - SHOPPERS.hunter.speed * DT) < 1e-9, `step ${got}`);
});

test('a dad and a super dad each walk at their own pace; the boss at exactly his', () => {
  const s = game(4);
  // Two dads with different paces, placed side by side on open floor of the small map.
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  s.spawnQ = [];
  s.nextId = 20;
  const mk = (k, sup) => {
    const def = sup ? defOf({ k, sup: 1 }) : SHOPPERS[k];
    const sh = { id: s.nextId++, k, x: 3.5, y: 7.5, vx: 0, vy: 0, hp: 1e6, mhp: 1e6, st: ST.WALK, t: 0, cd: 0, ox: 0, oy: 0, lt: -1 };
    if (sup) sh.sup = 1;
    s.shoppers.push(sh);
    return [sh, def];
  };
  const [dad, ddef] = mk('dad', 0);
  const [sdad, sdef] = mk('dad', 1);
  // (A dad drains patience by itself; plenty given above.)
  const a = topStep(s, dad, 1), b = Math.hypot(sdad.vx, sdad.vy);
  assert.ok(Math.abs(a - ddef.speed * walkPace(s, dad) * DT) < 1e-9);
  assert.ok(Math.abs(b - sdef.speed * walkPace(s, sdad) * DT) < 1e-9);
  assert.notEqual(walkPace(s, dad), walkPace(s, sdad));
  // The boss walks at exactly his speed.
  const boss = { id: 99, k: 'boss', x: 3.5, y: 8.5, vx: 0, vy: 0, hp: 1e6, mhp: 1e6, st: ST.WALK, t: 0, cd: 0, ox: 0, oy: 0, lt: -1, tr: 1, pp: 1e6 };
  s.shoppers.push(boss);
  step(s);
  assert.ok(Math.abs(Math.hypot(boss.vx, boss.vy) - BOSS.speed * DT) < 1e-9);
});
