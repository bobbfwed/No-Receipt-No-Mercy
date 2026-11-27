// Tests for the quicker deal (0.4.01): the nextCard command, cardWaiting, and TUNE.cardMin.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, setPlayerOnline, applyCommand, step, cardsShown, cardWaiting, revealTick, dealLength, dealTicks,
  TUNE, TICK_HZ,
} from '../src/sim/index.js';
import { checksum } from '../src/net/session.js';

/** A game with a dealt hand, Dave in it, and as many more players as named. */
function game(...more) {
  const s = createGame({ seed: 5, cards: true });
  addPlayer(s, 'Dave');
  for (const n of more) addPlayer(s, n);
  return s;
}
/** Steps until the n-th card is on show (cardsShown(s) === n). */
function upTo(s, n) {
  let k = 0;
  while (cardsShown(s) < n && k++ < 10000) step(s);
  assert.equal(cardsShown(s), n);
}
const next = (s, pid, n = cardsShown(s) - 1) => applyCommand(s, pid, { c: 'nextCard', n });
const MIN = Math.round(TUNE.cardMin * TICK_HZ);

test('the numbers: 6.5 seconds a card, a card up at least a second before a click moves it on', () => {
  assert.equal(TUNE.cardSecs, 6.5);
  assert.equal(TUNE.cardMin, 1);
});

test('solo: one click, once the card has been up cardMin, brings the next card', () => {
  const s = game();
  upTo(s, 1);
  assert.equal(cardWaiting(s), 1);
  assert.deepEqual(next(s, 0), { ok: true });
  assert.equal(s.players[0].nx, 1);
  assert.equal(cardWaiting(s), 0);
  // Not before the card has been up cardMin.
  const shownAt = revealTick(0);
  let ev = [], steps = 0;
  while (cardsShown(s) === 1) { ev = step(s); steps++; }
  assert.ok(steps <= MIN, `${steps} steps`);
  assert.deepEqual(ev.filter((e) => e.e === 'card').map((e) => e.i), [1]);
  assert.ok(dealTicks(s) >= shownAt + MIN, 'held for the least time');
  assert.equal(dealTicks(s), revealTick(1), 'the deal clock jumped to the next card');
  assert.equal(cardWaiting(s), 1, 'the new card waits for a new click');
});

test('a click the moment a card appears waits out cardMin: a double click cannot eat a card', () => {
  const s = game();
  upTo(s, 1);
  const at = dealTicks(s);
  next(s, 0);
  for (let t = 1; t < MIN; t++) { step(s); assert.equal(cardsShown(s), 1, `tick ${t}`); }
  // A second click for the same card, and one for the next (not on show yet): nothing more.
  assert.deepEqual(next(s, 0, 0), { ok: true });
  assert.deepEqual(next(s, 0, 1), { ok: true, ignored: true });
  step(s);
  assert.equal(cardsShown(s), 2);
  assert.equal(dealTicks(s) - at >= MIN - 1, true);
});

test('two players: both must click; a stale or future click is ignored', () => {
  const s = game('Bob');
  upTo(s, 1);
  for (let t = 0; t < MIN; t++) step(s);
  next(s, 0);
  assert.equal(cardWaiting(s), 1);
  step(s);
  assert.equal(cardsShown(s), 1, 'one of two is not enough');
  assert.deepEqual(next(s, 1, 3), { ok: true, ignored: true }, 'a future card');
  assert.equal(s.players[1].nx, undefined);
  step(s);
  assert.equal(cardsShown(s), 1);
  assert.deepEqual(next(s, 1), { ok: true });
  step(s);
  assert.equal(cardsShown(s), 2);
  // Card 2 on show: Dave's click for card 1 is stale and changes nothing.
  for (let t = 0; t < MIN; t++) step(s);
  assert.deepEqual(next(s, 0, 0), { ok: true, ignored: true });
  assert.equal(s.players[0].nx, 1);
  assert.equal(cardWaiting(s), 2);
});

test('after the last card, everyone clicking ends the deal at once (no closing pause)', () => {
  const s = game();
  for (let n = 1; n <= 5; n++) {
    upTo(s, n);
    next(s, 0);
  }
  let ev = [];
  let k = 0;
  while (s.phase === 'cards' && k++ < 1000) ev = step(s);
  assert.equal(k, MIN, 'ends as soon as the last card has been up cardMin');
  assert.deepEqual(ev.map((e) => e.e), ['begun']);
  assert.equal(s.phase, 'build');
  assert.ok(s.players.every((p) => !('nx' in p)), 'the clicks are forgotten');
});

test('a player who drops out stops counting; one who comes back must click again', () => {
  const s = game('Bob');
  upTo(s, 1);
  for (let t = 0; t < MIN; t++) step(s);
  next(s, 0);
  step(s);
  assert.equal(cardsShown(s), 1);
  setPlayerOnline(s, 1, false);
  assert.equal(cardWaiting(s), 0);
  step(s);
  assert.equal(cardsShown(s), 2, 'released by his leaving');
  setPlayerOnline(s, 1, true);
  assert.equal(cardWaiting(s), 2);
});

test('nextCard: the refusals, Head Office, and while paused', () => {
  const s = game();
  assert.deepEqual(applyCommand(s, 0, { c: 'nextCard', n: 0 }), { ok: true, ignored: true }, 'no card on show yet');
  upTo(s, 1);
  for (const n of [0.5, '0', null, undefined, '__proto__']) assert.deepEqual(applyCommand(s, 0, { c: 'nextCard', n }), { ok: false, why: 'bad' });
  s.pause = { by: 0 };
  assert.deepEqual(next(s, 0), { ok: true }, 'allowed while paused, as skipCards is');
  delete s.pause;
  s.players[0].side = 'office';
  assert.equal(next(s, 0).why, 'office');
  s.players[0].side = 'store';
  const b = createGame({ seed: 5 });
  addPlayer(b, 'Dave');
  assert.deepEqual(applyCommand(b, 0, { c: 'nextCard', n: 0 }), { ok: false, why: 'phase' });
  // A fresh deal starts with nobody's clicks.
  const t = game();
  t.players[0].nx = 4;
  step(t);
  assert.equal(t.players[0].nx, undefined);
});

test('the deal with clicks is deterministic: a copy made mid-deal plays on identically, the checksum sees nx', () => {
  const s = game('Bob');
  upTo(s, 2);
  next(s, 0);
  const sum = checksum(s);
  const was = s.players[0].nx;
  delete s.players[0].nx;
  assert.notEqual(checksum(s), sum);
  s.players[0].nx = was;
  assert.equal(checksum(s), sum);
  const c = structuredClone(s);
  for (let t = 0; t < 30 * TICK_HZ; t++) {
    if (t === 40) { next(s, 1); next(c, 1); }
    if (t === 400) { next(s, 0); next(s, 1); next(c, 0); next(c, 1); }
    step(s); step(c);
  }
  assert.equal(JSON.stringify(s), JSON.stringify(c));
  assert.equal(s.phase, 'build');
  assert.ok(dealLength(5) > 0);
});
