// Tests for money in 0.4 (removal step 2): what beating a sales event pays, the speed bonus on top
// (its clock, its par, the share of shoppers stopped), no pay for opening the doors early, the
// EVENT PAY panel's figures, DEB's two speed banks, and saves. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, migrateSave, eventPay, speedBonus, speedPar, bossTier,
  SETTINGS, TUNE, TICK_HZ, ST,
} from '../src/sim/index.js';
import { checksum } from '../src/net/session.js';
import { payView } from '../src/ui/eventpay.js';
import { payFacts, payText } from '../src/content/facts.js';
import { createDirector } from '../src/content/director.js';
import { LINES, textOf, fill } from '../src/content/lines.js';

/** A game on the original small map, `players` players with plenty of cash, nothing to lose. */
function game(players = 1, more = {}) {
  const s = createGame({ seed: 4, ...more });
  for (let p = 0; p < players; p++) addPlayer(s, `P${p}`);
  for (const p of s.players) p.cash = 1000;
  s.refundLimit = 1e9;
  return s;
}
/** Opens the doors on sales event n, with one Bargain Hunter to come in on the next tick. */
function openOn(s, n) {
  s.wave = n - 1;
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  s.spawnQ = [[s.tick + 1, 'hunter', 0, -1]];
}
/**
 * Plays sales event n so that the floor is clear exactly `after` ticks after its last (only)
 * shopper came in, with `stopped` and `escaped` as the event's counts. Returns the waveEnd event.
 */
function finish(s, n, after, { stopped = 1, escaped = 0 } = {}) {
  openOn(s, n);
  step(s);
  assert.equal(s.lastIn, s.tick, 'the clock starts the tick the last shopper walks in');
  const from = s.lastIn;
  // He stands where he is (stunned) until the floor is cleared by hand.
  for (const sh of s.shoppers) { sh.st = ST.STUN; sh.t = 1e9; }
  while (s.tick < from + after - 1) assert.ok(!step(s).some((e) => e.e === 'waveEnd'));
  s.shoppers.length = 0;
  s.ws.stopped = stopped;
  s.ws.escaped = escaped;
  const e = step(s).find((x) => x.e === 'waveEnd');
  assert.ok(e, 'the event ended');
  assert.equal(s.tick, from + after);
  return e;
}
const payOf = (n, m = 1) => Math.round((TUNE.payBase + TUNE.payStep * n) * m);

test('event pay is 150 + 45 an event, times the difficulty\'s pay, to the whole dollar', () => {
  assert.equal(TUNE.payBase, 150);
  assert.equal(TUNE.payStep, 45);
  for (const [key, d] of Object.entries(SETTINGS.difficulty)) {
    for (const n of [1, 5, 12, 20]) {
      const s = game(1, { settings: { difficulty: key } });
      assert.equal(eventPay(s, n), payOf(n, d.pay), `${key} event ${n}`);
      const e = finish(s, n, 5 * TICK_HZ);
      assert.equal(e.pay, payOf(n, d.pay), `${key} event ${n}, paid`);
    }
  }
  assert.equal(eventPay(game(), 1), 195);
  assert.equal(eventPay(game(), 20), 1050);
});

test('the speed bonus: all of it within 10 seconds, nothing at par (60), a straight line between', () => {
  assert.deepEqual([TUNE.speedShare, TUNE.speedBest, TUNE.speedPar], [0.5, 10, 60]);
  const n = 3, pay = payOf(n), max = Math.round(pay * TUNE.speedShare);
  const at = (secs) => finish(game(), n, Math.round(secs * TICK_HZ)).speed;
  assert.equal(at(1), max);
  assert.equal(at(10), max, 'at the best time, all of it');
  assert.equal(at(35), Math.round(pay * TUNE.speedShare * 0.5), 'half way to par, half of it');
  assert.equal(at(50), Math.round(pay * TUNE.speedShare * 0.2));
  assert.equal(at(60), 0, 'at par, none');
  assert.equal(at(90), 0, 'and none after');
  // It is paid with the event pay, and the event carries how long it took.
  const s = game();
  const cash = s.players[0].cash;
  const e = finish(s, n, 20 * TICK_HZ);
  assert.equal(e.took, 20);
  assert.equal(s.players[0].cash, cash + e.pay + e.speed);
  assert.deepEqual([s.ws.pay, s.ws.speed, s.ws.took], [e.pay, e.speed, 20]);
  assert.equal(s.lastIn, undefined, 'the clock is put away until the next event');
});

test('letting shoppers through costs the bonus: it is scaled by stopped over stopped plus refunded', () => {
  const n = 4, pay = payOf(n);
  const full = finish(game(), n, 5 * TICK_HZ, { stopped: 10, escaped: 0 }).speed;
  assert.equal(full, Math.round(pay * TUNE.speedShare));
  assert.equal(finish(game(), n, 5 * TICK_HZ, { stopped: 3, escaped: 1 }).speed, Math.round(pay * TUNE.speedShare * 0.75));
  assert.equal(finish(game(), n, 5 * TICK_HZ, { stopped: 0, escaped: 6 }).speed, 0, 'everyone refunded: nothing for speed');
  // Babies and puppies are in neither count (a popped lady's dozen would swamp it); nobody at all: all of it.
  assert.equal(finish(game(), n, 5 * TICK_HZ, { stopped: 0, escaped: 0 }).speed, full);
  // In a real undefended event every one of them gets through, and the bonus is nothing.
  const s = game();
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  let e = null;
  for (let i = 0; i < 120 * TICK_HZ && !e; i++) e = step(s).find((x) => x.e === 'waveEnd') || null;
  assert.ok(e && s.ws.escaped > 0);
  assert.equal(e.speed, 0);
  assert.equal(e.pay, payOf(1));
});

test('a boss event\'s par is twice as long', () => {
  assert.equal(bossTier(5), 1);
  assert.equal(speedPar(5), 2 * TUNE.speedPar);
  assert.equal(speedPar(4), TUNE.speedPar);
  const pay = payOf(5);
  assert.equal(finish(game(), 5, 60 * TICK_HZ).speed, Math.round(pay * TUNE.speedShare * ((120 - 60) / (120 - 10))), 'still paying at the usual par');
  assert.equal(finish(game(), 5, 120 * TICK_HZ).speed, 0);
  assert.equal(finish(game(), 4, 60 * TICK_HZ).speed, 0);
});

test('game speed makes no difference: the clock is in ticks', () => {
  const ends = [1, 2, 3, 5].map((speed) => {
    const s = game();
    assert.ok(applyCommand(s, 0, { c: 'speed', n: speed }).ok);
    return finish(s, 6, 27 * TICK_HZ, { stopped: 4, escaped: 1 });
  });
  for (const e of ends) assert.deepEqual(e, ends[0]);
  // And a whole real event at 5x is the same, step for step, as at 1x.
  const run = (speed) => {
    const s = game();
    applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 4, y: 6 });
    applyCommand(s, 0, { c: 'speed', n: speed });
    applyCommand(s, 0, { c: 'start' });
    for (let i = 0; i < 150 * TICK_HZ; i++) { const e = step(s).find((x) => x.e === 'waveEnd'); if (e) return e; }
    return null;
  };
  assert.deepEqual(run(5), run(1));
});

test('lastIn: absent between events and while shoppers are still to come; an event nobody comes to starts it at once', () => {
  const s = game();
  assert.equal(s.lastIn, undefined);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  assert.ok(s.spawnQ.length > 1);
  assert.equal(s.lastIn, undefined);
  while (s.spawnQ.length > 1) { step(s); assert.equal(s.lastIn, undefined); }
  const last = s.spawnQ[0][0];
  while (s.spawnQ.length) step(s);
  assert.equal(s.lastIn, last, 'the tick the last one came in');
  // A Head Office plan or a training wave with nobody in it: the clock starts with the doors.
  const t = game(1, { training: true });
  t.nextWave = [];
  assert.ok(applyCommand(t, 0, { c: 'start' }).ok);
  assert.equal(t.lastIn, t.tick);
});

test('opening the doors early pays nothing for the time skipped, and says nothing about it', () => {
  const s = game();
  applyCommand(s, 0, { c: 'place', k: 'crate', x: 4, y: 4 }); // starts the build timer
  for (let i = 0; i < 2 * TICK_HZ; i++) step(s);
  assert.ok(s.phaseT > TICK_HZ);
  const cash = s.players[0].cash, tick = s.tick;
  const ev = [];
  assert.ok(applyCommand(s, 0, { c: 'start' }, ev).ok);
  assert.equal(s.phase, 'wave');
  assert.equal(s.players[0].cash, cash);
  assert.equal(s.tick, tick, 'no time was played through');
  assert.deepEqual(ev.map((e) => e.e), ['waveStart']);
});

test('every store player sharing income gets the whole event pay and speed bonus; Head Office and absent players none', () => {
  const s = game(3);
  const cash = s.players.map((p) => p.cash);
  const e = finish(s, 2, 15 * TICK_HZ, { stopped: 2, escaped: 0 });
  for (const p of s.players) assert.equal(p.cash - cash[p.id], e.pay + e.speed, p.name);
  // One away: the other two get it all, each.
  const t = game(3);
  t.players[2].on = false;
  const before = t.players.map((p) => p.cash);
  const f = finish(t, 2, 15 * TICK_HZ);
  assert.equal(t.players[0].cash - before[0], f.pay + f.speed);
  assert.equal(t.players[2].cash, before[2]);
});

test('the speed bonus is worked out from the pay the cards make, and the panel shows the same numbers', () => {
  const s = game(1, { cards: ['overtime'] });
  const pay = eventPay(s, 3);
  assert.equal(pay, payOf(3, 1.5));
  // Between events: the next event's pay and the most its bonus can be.
  let v = payView(s);
  assert.deepEqual([v.n, v.pay, v.bonus, v.max, v.running, v.next], [1, eventPay(s, 1), Math.round(eventPay(s, 1) * TUNE.speedShare), Math.round(eventPay(s, 1) * TUNE.speedShare), false, true]);
  // In the event, before the last shopper is in: still "up to".
  openOn(s, 3);
  s.spawnQ.push([s.tick + 90, 'hunter', 0, -1]);
  step(s);
  v = payView(s);
  assert.deepEqual([v.n, v.pay, v.running, v.bonus, v.coming], [3, pay, false, Math.round(pay * TUNE.speedShare), 1]);
  while (s.spawnQ.length) step(s);
  for (const sh of s.shoppers) { sh.st = ST.STUN; sh.t = 1e9; }
  s.ws.stopped = 3; s.ws.escaped = 1;
  // Draining as the clock runs: always what endWave would pay right now.
  let last = Infinity;
  for (let i = 0; i < 70 * TICK_HZ; i += 15) {
    for (let k = 0; k < 15; k++) step(s);
    v = payView(s);
    const sb = speedBonus(s, 3, pay);
    assert.ok(v.running);
    assert.equal(v.bonus, sb.bonus);
    assert.equal(v.clean, 0.75);
    assert.ok(v.bonus <= last, 'it only drains');
    last = v.bonus;
  }
  assert.equal(last, 0, 'past par');
  // Hidden where it means nothing: the lobby, training, a finished game.
  assert.equal(payView(createGame({ lobby: true })), null);
  assert.equal(payView(createGame({ training: true })), null);
  const won = game(); won.phase = 'won';
  assert.equal(payView(won), null);
});

test('the handbook\'s money sentence comes from the rules', () => {
  const p = payFacts('normal');
  assert.equal(p.pay(1), eventPay(game(), 1));
  assert.equal(p.pay(20), eventPay(game(), 20));
  assert.equal(payFacts('hard').pay(10), eventPay(game(1, { settings: { difficulty: 'hard' } }), 10));
  const text = payText();
  for (const bit of ['$195', '$600', '$1,050', '50%', '10 seconds', '60 seconds', '120 in a boss event']) assert.ok(text.includes(bit), bit);
});

test('DEB has a line for all of the speed bonus and for none of it, and nothing in between', () => {
  for (const bank of [LINES.speedFull, LINES.speedNone]) assert.ok(bank.length >= 5);
  const s = game(1);
  const say = (e) => createDirector(() => 0).handle([e], s).filter((m) => m.t === 'say').map((m) => m.text);
  const full = say({ e: 'waveEnd', wave: 3, pay: 285, speed: 143, took: 8.4 });
  assert.equal(full.length, 1);
  assert.ok(LINES.speedFull.some((l) => fill(textOf(l), { p: 'P0', n: 143, m: 8 }) === full[0]), full[0]);
  const none = say({ e: 'waveEnd', wave: 3, pay: 285, speed: 0, took: 75 });
  assert.equal(none.length, 1);
  assert.ok(LINES.speedNone.some((l) => fill(textOf(l), { p: 'P0', n: 0, m: 75 }) === none[0]), none[0]);
  assert.deepEqual(say({ e: 'waveEnd', wave: 3, pay: 285, speed: 70, took: 35 }), []);
  assert.deepEqual(say({ e: 'waveEnd', wave: 1, pay: 0, speed: 0, took: 0, training: true }), []);
});

test('a copy made while the clock runs plays on identically; the checksum sees the clock; old saves are tidied', () => {
  const s = game();
  openOn(s, 2);
  step(s);
  assert.ok(s.lastIn !== undefined);
  const copy = JSON.parse(JSON.stringify(s));
  let a = null, b = null;
  for (let i = 0; i < 90 * TICK_HZ && !(a && b); i++) {
    a ||= step(s).find((e) => e.e === 'waveEnd');
    b ||= step(copy).find((e) => e.e === 'waveEnd');
  }
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(copy)), JSON.parse(JSON.stringify(s)));
  // The checksum: the clock, and the counts that scale the bonus.
  const t = game();
  openOn(t, 2);
  step(t);
  const sum = checksum(t);
  t.lastIn--;
  assert.notEqual(checksum(t), sum);
  t.lastIn++;
  t.ws.stopped++;
  assert.notEqual(checksum(t), sum);
  t.ws.stopped--;
  assert.equal(checksum(t), sum);
  // A save from before: the old running total of goods sold and a shoplifter's detour go; a save
  // made mid-event after the last shopper came in starts the clock now.
  const old = game();
  openOn(old, 2);
  step(old);
  delete old.lastIn;
  old.sales = 1234;
  old.shoppers[0].lf = 99;
  old.shoppers[0].lw = 30;
  assert.equal(migrateSave(old), true);
  assert.equal('sales' in old, false);
  assert.equal('lf' in old.shoppers[0] || 'lw' in old.shoppers[0], false);
  assert.equal(old.lastIn, old.tick);
});
