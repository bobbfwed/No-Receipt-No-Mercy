// Tests for the properties the 0.4 balance (stage 7) was tuned to keep: when dads first come and how
// many, and that a first Razor Wire is within reach of the starting cash. The numbers themselves are
// in src/sim/constants.js; the scripted players that judged them are tools/balance.mjs.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, waveSpec, canPlace, canWire, wireLive, buildPrice,
  TUNE, OFFICE, DIRS, TICK_HZ,
} from '../src/sim/index.js';

const dadsIn = (n, players = 1) => waveSpec(n, players).filter((g) => g.k === 'dad').reduce((sum, g) => sum + g.n, 0);

test('dads first come in event TUNE.dadFrom, a short line, and in force from the next event', () => {
  assert.equal(TUNE.dadFrom, 4, 'event 4: a first wire can be live by then');
  for (let n = 1; n < TUNE.dadFrom; n++) assert.equal(dadsIn(n), 0, `no dads in event ${n}`);
  const first = dadsIn(TUNE.dadFrom);
  assert.ok(first >= 1 && first <= 3, `a solo game's first dad line is short (${first})`);
  assert.ok(dadsIn(TUNE.dadFrom + 1) >= 2 * first, 'the next line is far longer');
  assert.equal(OFFICE.kinds.dad.from, TUNE.dadFrom, 'Head Office can buy dads from the same event');
  for (let n = TUNE.dadFrom + 1; n <= 20; n++) assert.ok(dadsIn(n) > 0, `dads in event ${n}`);
});

test('the dads\' line never pushes an event up to 30 over the crowd cap, for any number of players', () => {
  // (If it did, TUNE.maxCrowd would shrink every other group of that event as well.)
  const old = TUNE.maxCrowd;
  for (const p of [1, 2, 3, 7]) {
    for (let n = 1; n <= 30; n++) {
      TUNE.maxCrowd = Infinity;
      const free = waveSpec(n, p);
      TUNE.maxCrowd = old;
      assert.deepEqual(waveSpec(n, p), free, `event ${n}, ${p} players`);
    }
  }
});

test('from the starting cash: a first Razor Wire line, live in the first build pause, with two more security buildings and a wall to spare', () => {
  const s = createGame({ seed: 3, map: { design: 'warehouse', size: 's' } });
  addPlayer(s, 'Solo');
  while (s.phase === 'cards' || s.phase === 'lobby') step(s);
  const me = s.players[0];
  assert.equal(me.cash, TUNE.startCash);
  // In a line from the first Returns Drop: Splitter, Barb Bender, a belt, an Unpaid Intern, and the
  // Pepper Sprinkler he feeds, whose wire runs back over them.
  const di = s.back.findIndex((p) => p && p.k === 'drop');
  const d = s.back[di].d;
  const at = (n) => di + n * (DIRS[d][1] * s.w + DIRS[d][0]);
  const xy = (i) => ({ x: i % s.w, y: (i / s.w) | 0 });
  const back = [['split', 1], ['bender', 2], ['conv', 3], ['intern', 4]];
  const post = xy(at(5));
  assert.equal(canPlace(s, 'sprinkler', post.x, post.y), null);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'sprinkler', ...post, d: 0 }).ok);
  for (const [k, n] of back) assert.ok(applyCommand(s, 0, { c: 'place', k, ...xy(at(n)), d, f: 1 }).ok, k);
  const wd = (d + 2) & 3;
  assert.equal(canWire(s, 0, post.x, post.y, wd), null);
  assert.ok(applyCommand(s, 0, { c: 'wire', ...post, d: wd }).ok);
  // Two more security buildings, somewhere in the middle of the store.
  for (const x of [20, 24]) assert.ok(applyCommand(s, 0, { c: 'place', k: 'sprinkler', x, y: 8, d: 0 }).ok);
  const spent = TUNE.startCash - me.cash;
  const wall = 15 * buildPrice(s, 'crate');
  assert.ok(spent + wall <= TUNE.startCash, `$${spent} spent, $${me.cash} left: a 15-crate wall ($${wall}) still fits`);
  // The wire goes live well within the build pause, before any shopper comes in.
  const b = s.grid[post.y * s.w + post.x];
  for (let t = 0; t < 20 * TICK_HZ && !wireLive(b); t++) step(s);
  assert.ok(wireLive(b), 'live within 20 seconds');
  assert.equal(s.phase, 'build');
  assert.equal(s.wave, 0);
});
