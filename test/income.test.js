// Income per minute (0.3.03): the running total of goods sold in the state (state.sales) and the
// interface's arithmetic that turns it into dollars a minute (src/ui/rate.js). Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyCommand, step, setPlayerOnline, shareCount, TICK_HZ, CARDS } from '../src/sim/index.js';
import { earn } from '../src/sim/state.js';
import { applyDemoLayout } from '../src/sim/demo.js';
import { createRate, splitOf, RATE_SECS, RATE_MIN_SECS } from '../src/ui/rate.js';

// ---- The running total --------------------------------------------------------------------------

/** A real (timed) game on the original small map with one production line, as in early.test.js. */
function store(o = {}) {
  const s = createGame({ seed: 9, ...o });
  addPlayer(s, 'Dave');
  s.players[0].cash = 5000;
  const put = (k, x, y, d = 0) => assert.ok(applyCommand(s, 0, { c: 'place', k, x, y, d }).ok, `${k} at ${x},${y}`);
  put('unpacker', 4, 2);
  for (const x of [5, 6, 7]) put('belt', x, 2);
  put('press', 8, 2);
  put('belt', 9, 2);
  put('chute', 10, 2);
  return s;
}
const run = (s, n) => { const all = []; for (let i = 0; i < n; i++) all.push(...step(s)); return all; };

test('a new game has sold nothing', () => {
  assert.equal(createGame().sales, 0);
  assert.equal(createGame({ lobby: true, cards: true }).sales, 0);
});

test('every sale at a Shipping Chute adds its price to state.sales, and nothing else does', () => {
  const s = store();
  const ev = run(s, 40 * TICK_HZ);
  const sold = ev.filter((e) => e.e === 'sale').reduce((n, e) => n + e.v, 0);
  assert.ok(sold > 0, 'the line sold something');
  assert.equal(s.sales, sold);
  // The end-of-event bonus is paid, the total does not move for it.
  const s2 = store();
  s2.phaseT = 2;
  run(s2, 2); // the doors open on the timer
  assert.equal(s2.phase, 'wave');
  s2.spawnQ = [];
  const at = s2.sales, cash = s2.players[0].cash;
  const ended = [];
  for (let i = 0; i < 5 * TICK_HZ && s2.phase === 'wave'; i++) ended.push(...step(s2));
  const bonus = ended.find((e) => e.e === 'waveEnd');
  assert.ok(bonus && bonus.bonus > 0, 'the event ended with a bonus');
  const salesThen = ended.filter((e) => e.e === 'sale').reduce((n, e) => n + e.v, 0);
  assert.equal(s2.sales - at, salesThen, 'only the sales, not the bonus');
  assert.ok(s2.players[0].cash - cash > salesThen, 'though the bonus was paid');
});

test('it is not reset when a sales event begins or ends', () => {
  const s = store();
  run(s, 30 * TICK_HZ);
  const before = s.sales;
  assert.ok(before > 0);
  s.phaseT = 2;
  run(s, 2);
  assert.equal(s.phase, 'wave');
  assert.ok(s.sales >= before, 'still counting after the doors opened');
  assert.equal(s.ws.earned < s.sales, true, 'unlike the event takings, which start again');
});

test('the takings paid in one go when the doors open early stay out of it', () => {
  const s = store();
  run(s, 20 * TICK_HZ);
  const before = s.sales;
  const ev = [];
  assert.ok(applyCommand(s, 0, { c: 'start' }, ev).ok);
  const early = ev.find((e) => e.e === 'early');
  assert.ok(early && early.cash > 0, 'the early opening paid something');
  assert.equal(s.sales, before);
});

test('a save from before it existed counts from 0', () => {
  const s = store();
  delete s.sales;
  const ev = run(s, 40 * TICK_HZ);
  const sold = ev.filter((e) => e.e === 'sale').reduce((n, e) => n + e.v, 0);
  assert.equal(s.sales, sold);
  // ...and an early opening leaves it absent if it was absent.
  const t = store();
  delete t.sales;
  run(t, 5 * TICK_HZ);
  assert.ok(applyCommand(t, 0, { c: 'start' }).ok);
  assert.equal('sales' in t, false);
});

test('a warranty purchase or a restocking fee is not goods sold', () => {
  // Both are paid through the same split as a sale; only a chute's sale adds to state.sales. The
  // ready-made demo layout, played with both cards and the warranty sure to sell, through a whole
  // sales event of shoppers.
  const s = createGame({ seed: 5, cards: ['warranty', 'restocking'] });
  addPlayer(s, 'Dave');
  s.players[0].cash = 99999;
  assert.deepEqual(applyDemoLayout(s, 0), []);
  const was = CARDS.warranty.chance;
  CARDS.warranty.chance = 1;
  try {
    assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
    const ev = run(s, 120 * TICK_HZ);
    const sold = ev.filter((e) => e.e === 'sale').reduce((n, e) => n + e.v, 0);
    assert.ok(ev.some((e) => e.e === 'bought'), 'somebody bought at a stand');
    assert.ok(ev.some((e) => e.e === 'left' && e.fee > 0), 'somebody paid the restocking fee');
    assert.ok(sold > 0);
    assert.equal(s.sales, sold);
  } finally {
    CARDS.warranty.chance = was;
  }
});

// ---- The rate ------------------------------------------------------------------------------------

const SEC = TICK_HZ;
/** Feeds a steady income of `perMin` dollars a minute for `secs` seconds, a frame every `step` ticks. */
function feed(r, { from = 0, secs, perMin, total = 0, step: dt = 2 }) {
  let t = from, tot = total;
  const end = from + secs * SEC;
  while (t < end) {
    t = Math.min(end, t + dt);
    tot = total + (perMin * (t - from)) / (60 * SEC);
    r.push(t, tot);
  }
  return { t, tot };
}

test('a steady income reads as its rate', () => {
  const r = createRate();
  feed(r, { secs: 90, perMin: 1200 });
  const v = r.read();
  assert.ok(Math.abs(v.store - 1200) < 1, `${v.store}`);
  assert.ok(v.secs > RATE_SECS - 1.01 && v.secs <= RATE_SECS);
});

test('under ten seconds of history there is no figure; from then on, the average of what there is', () => {
  const r = createRate();
  feed(r, { secs: RATE_MIN_SECS - 1, perMin: 600 });
  assert.equal(r.read(), null);
  const r2 = createRate();
  feed(r2, { secs: 25, perMin: 600 });
  const v = r2.read();
  assert.ok(Math.abs(v.store - 600) < 1);
  assert.ok(v.secs >= 24 && v.secs <= 25);
  assert.equal(v.trend, null, 'no trend without two minutes');
});

test('the window slides: an income that stopped a minute ago reads as nothing', () => {
  const r = createRate();
  const a = feed(r, { secs: 60, perMin: 1000 });
  feed(r, { from: a.t, total: a.tot, secs: 30, perMin: 0 });
  assert.ok(Math.abs(r.read().store - 500) < 20, `half the minute earned: ${r.read().store}`);
  const b = feed(r, { from: a.t + 30 * SEC, total: a.tot, secs: 31, perMin: 0 });
  assert.equal(r.read().store, 0);
  assert.ok(b.t > 0);
});

test('a pause (no new ticks) changes nothing', () => {
  const r = createRate();
  const a = feed(r, { secs: 40, perMin: 900 });
  const before = r.read();
  for (let i = 0; i < 500; i++) r.push(a.t, a.tot); // frames drawn while paused
  assert.deepEqual(r.read(), before);
});

test('the game speed does not change it (more ticks a frame is the same income per tick)', () => {
  const slow = createRate(), fast = createRate();
  feed(slow, { secs: 70, perMin: 1500, step: 1 });
  feed(fast, { secs: 70, perMin: 1500, step: 5 }); // 5x: five ticks between frames
  assert.ok(Math.abs(slow.read().store - fast.read().store) < 1);
  assert.ok(Math.abs(fast.read().store - 1500) < 1);
});

test('a total that goes down (a new game, the lobby, a loaded save) starts the history again', () => {
  const r = createRate();
  const a = feed(r, { from: 9000, secs: 60, perMin: 3000, total: 50000 });
  assert.ok(r.read().store > 2900);
  // A fresh game: the clock and the total back near zero.
  r.push(30, 0);
  assert.equal(r.read(), null);
  assert.equal(r.size(), 1);
  // A loaded save: the clock moves on but the total is lower.
  const r2 = createRate();
  feed(r2, { from: 0, secs: 30, perMin: 3000, total: 50000 });
  r2.push(a.t + 60, 100);
  assert.equal(r2.read(), null);
  feed(r2, { from: a.t + 60, total: 100, secs: 15, perMin: 600 });
  const v = r2.read();
  assert.ok(v.store >= 0 && Math.abs(v.store - 600) < 5, `${v.store}`);
});

test('joining mid-game: the history starts when he does', () => {
  const r = createRate();
  // First seen at tick 54000 with $80,000 already sold: no figure, and no spike from it.
  r.push(54000, 80000);
  assert.equal(r.read(), null);
  feed(r, { from: 54000, total: 80000, secs: 12, perMin: 2000 });
  const v = r.read();
  assert.ok(Math.abs(v.store - 2000) < 1);
});

test('the split is between the players earn() pays: connected store players, never Head Office', () => {
  const s = createGame({ seed: 2 });
  for (const n of ['Bobb', 'Phantasm', 'Tusker', 'Dave']) addPlayer(s, n);
  assert.deepEqual(splitOf(1200, shareCount(s)), { ways: 4, each: 300 });
  // One leaves: his share is no longer paid, so he is not counted.
  setPlayerOnline(s, 3, false);
  assert.equal(shareCount(s), 3);
  assert.equal(splitOf(1200, shareCount(s)).each, 400);
  // One takes the Head Office job.
  s.players[2].side = 'office';
  assert.deepEqual(splitOf(1200, shareCount(s)), { ways: 2, each: 600 });
  // And the money really is split that way.
  const before = s.players.map((p) => p.cash);
  earn(s, 1200);
  assert.deepEqual(s.players.map((p, i) => p.cash - before[i]), [600, 600, 0, 0]);
  // Alone, it is all his.
  assert.deepEqual(splitOf(500, 1), { ways: 1, each: 500 });
  assert.deepEqual(splitOf(500, 0), { ways: 1, each: 500 });
});

test('the trend compares this minute with the one before', () => {
  const r = createRate();
  const a = feed(r, { secs: 60, perMin: 1000 });
  const b = feed(r, { from: a.t, total: a.tot, secs: 60, perMin: 1000 });
  assert.equal(r.read().trend, 0, 'steady');
  const c = feed(r, { from: b.t, total: b.tot, secs: 60, perMin: 1400 });
  assert.equal(r.read().trend, 1, 'up');
  feed(r, { from: c.t, total: c.tot, secs: 60, perMin: 700 });
  assert.equal(r.read().trend, -1, 'down');
});

test('the history stays small however long the game runs', () => {
  const r = createRate();
  feed(r, { secs: 3600, perMin: 500, step: 3 });
  assert.ok(r.size() <= 2 * RATE_SECS + 3, `${r.size()}`);
  assert.ok(Math.abs(r.read().store - 500) < 1);
});
