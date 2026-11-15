// Tests for the simulation rules. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, step, applyDemoLayout, waveSpec, getDist,
  TICK_HZ, TUNE, BUILD, W, H, ST, UNREACHABLE, idxOf,
} from '../src/sim/index.js';

function newGame(seed = 7) {
  const s = createGame({ seed });
  addPlayer(s, 'Dave');
  return s;
}
const place = (s, k, x, y, d = 0, pid = 0) => applyCommand(s, pid, { c: 'place', k, x, y, d });
function run(s, seconds) {
  const all = [];
  for (let i = 0; i < seconds * TICK_HZ; i++) all.push(...step(s));
  return all;
}

test('a new game starts in an untimed build phase with starting cash', () => {
  const s = newGame();
  assert.equal(s.phase, 'build');
  assert.equal(s.phaseT, -1);
  assert.equal(s.cash, TUNE.startCash);
  assert.equal(s.grid.length, W * H);
});

test('placing costs cash and starts the first build timer', () => {
  const s = newGame();
  assert.deepEqual(place(s, 'crate', 5, 5), { ok: true });
  assert.equal(s.cash, TUNE.startCash - BUILD.crate.cost);
  assert.ok(s.phaseT > 0);
  assert.equal(s.players[0].all.spent, BUILD.crate.cost);
});

test('placement is refused on walls, doors, tills, occupied tiles and without cash', () => {
  const s = newGame();
  assert.equal(place(s, 'crate', 0, 0).why, 'bounds'); // wall
  assert.equal(place(s, 'crate', 0, 7).why, 'bounds'); // door
  assert.equal(place(s, 'crate', 29, 7).why, 'bounds'); // till
  assert.equal(place(s, 'crate', 8, 4).why, 'bounds'); // pillar
  assert.equal(place(s, 'crate', -1, 3).why, 'bounds');
  assert.equal(place(s, 'nonsense', 3, 3).why, 'kind');
  place(s, 'crate', 3, 3);
  assert.equal(place(s, 'crate', 3, 3).why, 'occupied');
  s.cash = 3;
  assert.equal(place(s, 'belt', 4, 4).why, 'cash');
});

test('the tills can never be walled off', () => {
  const s = newGame();
  s.cash = 10000;
  // Wall off column 10 from top to bottom; the last crate must be refused.
  let refused = 0;
  for (let y = 1; y <= 14; y++) if (!place(s, 'crate', 10, y).ok) refused++;
  assert.equal(refused, 1);
  const dist = getDist(s);
  assert.notEqual(dist[idxOf(0, 7)], UNREACHABLE);
});

test('wet floor signs do not block the path', () => {
  const s = newGame();
  s.cash = 10000;
  for (let y = 1; y <= 13; y++) assert.ok(place(s, 'crate', 10, y).ok);
  assert.ok(place(s, 'wetfloor', 10, 14).ok, 'a sign in the only gap is allowed');
  assert.equal(canPlace(s, 'crate', 12, 12), null);
  assert.equal(canPlace(s, 'crate', 11, 14), 'blocked', 'plugging the tile behind the gap is refused');
});

test('removing a building refunds part of the price', () => {
  const s = newGame();
  place(s, 'forklift', 5, 5);
  const before = s.cash;
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 5, y: 5 }).ok);
  assert.equal(s.cash, before + Math.floor(BUILD.forklift.cost * TUNE.sellBack));
  assert.equal(s.grid[idxOf(5, 5)], 0);
  assert.equal(applyCommand(s, 0, { c: 'remove', x: 5, y: 5 }).why, 'empty');
});

test('unpacker, belt and chute turn boxes into cash', () => {
  const s = newGame();
  place(s, 'unpacker', 3, 3, 0);
  place(s, 'belt', 4, 3, 0);
  place(s, 'belt', 5, 3, 0);
  place(s, 'chute', 6, 3);
  const cash = s.cash;
  const ev = run(s, 20);
  const sales = ev.filter((e) => e.e === 'sale');
  assert.ok(sales.length >= 5, `expected several sales, got ${sales.length}`);
  assert.ok(sales.every((e) => e.kind === 'box'));
  assert.equal(s.cash, cash + sales.length * 2);
  assert.equal(s.players[0].all.shipped, sales.length);
});

test('press and packer upgrade goods along the line', () => {
  const s = newGame();
  s.cash = 5000;
  place(s, 'unpacker', 3, 3, 0);
  place(s, 'belt', 4, 3, 0);
  place(s, 'press', 5, 3, 0);
  place(s, 'belt', 6, 3, 0);
  place(s, 'packer', 7, 3, 0);
  place(s, 'belt', 8, 3, 0);
  place(s, 'chute', 9, 3);
  const ev = run(s, 40);
  const kinds = new Set(ev.filter((e) => e.e === 'sale').map((e) => e.kind));
  assert.deepEqual([...kinds], ['giftset']);
});

test('a belt that backs up holds at most two items per tile and loses nothing', () => {
  const s = newGame();
  place(s, 'unpacker', 3, 3, 0);
  place(s, 'belt', 4, 3, 0);
  place(s, 'belt', 5, 3, 0); // dead end
  run(s, 60);
  assert.equal(s.grid[idxOf(4, 3)].it.length, 2);
  assert.equal(s.grid[idxOf(5, 3)].it.length, 2);
});

test('belts turn corners and refuse head-on belts', () => {
  const s = newGame();
  place(s, 'unpacker', 3, 3, 0);
  place(s, 'belt', 4, 3, 1); // turns south
  place(s, 'belt', 4, 4, 1);
  place(s, 'chute', 4, 5);
  assert.ok(run(s, 15).some((e) => e.e === 'sale'));

  const t = newGame();
  place(t, 'unpacker', 3, 3, 0);
  place(t, 'belt', 4, 3, 2); // faces back at the unpacker
  run(t, 10);
  assert.equal(t.grid[idxOf(4, 3)].it.length, 0);
});

test('undefended shoppers reach the tills and take refunds', () => {
  const s = newGame();
  applyCommand(s, 0, { c: 'start' });
  assert.equal(s.phase, 'wave');
  assert.equal(s.wave, 1);
  const ev = run(s, 60);
  const escapes = ev.filter((e) => e.e === 'escape').length;
  assert.equal(escapes, waveSpec(1)[0].n);
  assert.equal(s.refunds, escapes);
  assert.ok(s.cash < TUNE.startCash + TUNE.waveBonus + TUNE.waveBonusStep);
  assert.ok(ev.some((e) => e.e === 'waveEnd'));
  assert.equal(s.phase, 'build');
  assert.ok(s.phaseT > 0);
});

test('towers wear down patience until shoppers storm out', () => {
  const s = newGame();
  s.cash = 5000;
  // Sprinklers either side of the doors.
  for (const y of [6, 9]) for (const x of [1, 2, 3, 4]) place(s, 'sprinkler', x, y);
  applyCommand(s, 0, { c: 'start' });
  const ev = [];
  while (!ev.some((e) => e.e === 'waveEnd') && s.tick < 120 * TICK_HZ) ev.push(...step(s));
  assert.equal(ev.filter((e) => e.e === 'escape').length, 0);
  assert.equal(ev.filter((e) => e.e === 'left').length, waveSpec(1)[0].n);
  assert.ok(s.players[0].all.stopped > 0);
});

test('dads give up when the walk is long enough, with no towers at all', () => {
  const s = newGame();
  s.cash = 100000;
  // A long snake of crate walls: alternate gaps at top and bottom.
  for (let x = 3; x <= 25; x += 2) {
    const gapTop = ((x - 3) / 2) % 2 === 0;
    for (let y = 1; y <= 14; y++) {
      if (gapTop ? y === 1 : y === 14) continue;
      if (s.tiles[idxOf(x, y)] === '.') place(s, 'crate', x, y);
    }
  }
  s.wave = 1; // next wave is 2, the first with a dad line
  applyCommand(s, 0, { c: 'start' });
  const ev = run(s, 150);
  const dadsLeft = ev.filter((e) => e.e === 'left' && e.k === 'dad');
  const dadsOut = ev.filter((e) => e.e === 'escape' && e.k === 'dad');
  assert.ok(dadsLeft.length > 0, 'dads should run out of patience');
  assert.equal(dadsOut.length, 0);
  assert.ok(dadsLeft.every((e) => e.why === 'bored' && e.by === -1));
  assert.ok(ev.some((e) => e.e === 'escape' && e.k === 'hunter'), 'hunters are patient enough to get through');
});

test('dads ignore free samples; bargain hunters stop for them', () => {
  const s = newGame();
  s.cash = 5000;
  place(s, 'samples', 3, 6);
  s.wave = 1;
  applyCommand(s, 0, { c: 'start' });
  let dadBrowsed = false, hunterBrowsed = false;
  for (let i = 0; i < 40 * TICK_HZ; i++) {
    step(s);
    for (const sh of s.shoppers) {
      if (sh.st === ST.BROWSE && sh.k === 'dad') dadBrowsed = true;
      if (sh.st === ST.BROWSE && sh.k === 'hunter') hunterBrowsed = true;
    }
  }
  assert.equal(dadBrowsed, false);
  assert.equal(hunterBrowsed, true);
});

test('the game is lost when too many shoppers get refunds', () => {
  const s = newGame();
  let ev = [];
  for (let w = 0; w < 6 && s.phase !== 'lost'; w++) {
    applyCommand(s, 0, { c: 'start' });
    ev = ev.concat(run(s, 120));
  }
  assert.equal(s.phase, 'lost');
  assert.equal(s.refunds, TUNE.refundLimit);
  assert.ok(ev.some((e) => e.e === 'lost'));
  const tick = s.tick;
  run(s, 1);
  assert.equal(s.tick, tick, 'a finished game does not advance');
});

test('the demo layout builds cleanly and makes money', () => {
  const s = newGame();
  assert.deepEqual(applyDemoLayout(s), []);
  const cash = s.cash;
  run(s, 30);
  assert.ok(s.cash > cash);
});

test('the simulation is deterministic and survives a snapshot round trip', () => {
  const a = newGame(42), b = newGame(42);
  applyDemoLayout(a); applyDemoLayout(b);
  applyCommand(a, 0, { c: 'start' }); applyCommand(b, 0, { c: 'start' });
  for (let i = 0; i < 20 * TICK_HZ; i++) { step(a); step(b); }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  // A client receives the state as JSON and keeps simulating from it.
  let c = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 20 * TICK_HZ; i++) { step(a); step(c); }
  assert.equal(JSON.stringify(a), JSON.stringify(c));
  assert.ok(a.shoppers.length > 0 || a.ws.stopped > 0);
});

test('player slots: names, rejoining and the player limit', () => {
  const s = createGame({ seed: 1 });
  assert.equal(addPlayer(s, 'Dave'), 0);
  assert.equal(addPlayer(s, 'Steve'), 1);
  s.players[1].on = false;
  assert.equal(addPlayer(s, 'Steve'), 1, 'a returning player gets his slot back');
  for (const n of ['a', 'b', 'c', 'd']) addPlayer(s, n);
  assert.equal(addPlayer(s, 'seventh'), -1);
  assert.equal(applyCommand(s, 9, { c: 'start' }).ok, false);
});
