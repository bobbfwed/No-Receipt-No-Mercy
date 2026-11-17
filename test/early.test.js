// Opening the doors early must leave the store exactly as if the players had waited for the
// timer: the factory is paid for the time that was skipped. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyCommand, step, TICK_HZ } from '../src/sim/index.js';

/** A real (timed) game on the original small map with one production line and a second idle one. */
function store() {
  const s = createGame({ seed: 9 });
  addPlayer(s, 'Dave');
  s.players[0].cash = 5000;
  const put = (k, x, y, d = 0) => assert.ok(applyCommand(s, 0, { c: 'place', k, x, y, d }).ok, `${k} at ${x},${y}`);
  // Unpacker -> belts -> press -> belt -> chute, along row 2, well away from the shoppers' route.
  put('unpacker', 4, 2);
  for (const x of [5, 6, 7]) put('belt', x, 2);
  put('press', 8, 2);
  put('belt', 9, 2);
  put('chute', 10, 2);
  return s;
}
const cashOf = (s) => s.players.map((p) => p.cash);
const until = (s, phase, limit = 200 * TICK_HZ) => { const all = []; for (let i = 0; i < limit && s.phase !== phase; i++) all.push(...step(s)); assert.equal(s.phase, phase); return all; };

test('opening the doors early pays what the factory would have sold in the time skipped', () => {
  // One store waits for the timer; the other opens the doors after two seconds.
  const waited = store(), early = store();
  until(waited, 'wave');

  for (let i = 0; i < 2 * TICK_HZ; i++) step(early);
  const before = cashOf(early)[0];
  const r = applyCommand(early, 0, { c: 'start' });
  assert.ok(r.ok);
  assert.equal(early.phase, 'wave');
  step(early); // the wave's first tick, which the waiting store has also had

  assert.deepEqual(cashOf(early), cashOf(waited), 'the same money either way');
  assert.deepEqual(early.grid, waited.grid, 'and every belt and machine in the same state');
  assert.ok(cashOf(early)[0] > before, 'and that money is more than he had when he pressed the button');
});

test('the early opening is reported once, with the takings, instead of a sale per item', () => {
  const s = store();
  for (let i = 0; i < 2 * TICK_HZ; i++) step(s);
  const before = cashOf(s)[0];
  const ev = [];
  const r = applyCommand(s, 0, { c: 'start' }, ev);
  assert.ok(r.ok);
  const all = ev;
  const e = all.find((x) => x.e === 'early');
  assert.ok(e, 'an early event');
  assert.ok(e.secs > 5 && e.sold > 0);
  assert.equal(e.cash, cashOf(s)[0] - before, 'its cash is what the store took');
  assert.equal(all.filter((x) => x.e === 'sale').length, 0, 'no sale events for the skipped time');
});

test('with the timer nearly out, or no timer, there is nothing to skip', () => {
  // Training has no timer.
  const t = createGame({ seed: 3, training: true });
  addPlayer(t, 'Dave');
  t.nextWave = [{ k: 'hunter', n: 1, gap: 1, at: 0 }];
  const ev = [];
  const r = applyCommand(t, 0, { c: 'start' }, ev);
  assert.ok(r.ok);
  assert.equal(ev.some((x) => x.e === 'early'), false);

  // A store with a factory, opened on the last tick of the timer.
  const s = store();
  while (s.phaseT > 1) step(s);
  const before = cashOf(s)[0];
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  assert.equal(cashOf(s)[0], before);
});
