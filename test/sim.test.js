// Tests for the simulation rules. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, step, applyDemoLayout, waveSpec, getDist,
  getHopDist, TICK_HZ, TUNE, BUILD, ITEMS, ST, UNREACHABLE,
} from '../src/sim/index.js';

// These tests use the original small map, 30 tiles by 16.
const W = 30, H = 16;
const at = (x, y) => y * W + x;

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
  assert.equal(s.players[0].cash, TUNE.startCash);
  assert.equal(s.grid.length, W * H);
});

test('placing costs cash and starts the first build timer', () => {
  const s = newGame();
  assert.deepEqual(place(s, 'crate', 5, 5), { ok: true });
  assert.equal(s.players[0].cash, TUNE.startCash - BUILD.crate.cost);
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
  s.players[0].cash = 3;
  assert.equal(place(s, 'belt', 4, 4).why, 'cash');
});

test('the tills can never be walled off', () => {
  const s = newGame();
  s.players[0].cash = 10000;
  // Wall off column 10 from top to bottom; the last crate must be refused.
  let refused = 0;
  for (let y = 1; y <= 14; y++) if (!place(s, 'crate', 10, y).ok) refused++;
  assert.equal(refused, 1);
  const dist = getDist(s);
  assert.notEqual(dist[at(0, 7)], UNREACHABLE);
});

test('wet floor signs do not block the path', () => {
  const s = newGame();
  s.players[0].cash = 10000;
  for (let y = 1; y <= 13; y++) assert.ok(place(s, 'crate', 10, y).ok);
  assert.ok(place(s, 'wetfloor', 10, 14).ok, 'a sign in the only gap is allowed');
  assert.equal(canPlace(s, 'crate', 12, 12), null);
  assert.equal(canPlace(s, 'crate', 11, 14), 'blocked', 'plugging the tile behind the gap is refused');
});

test('removing a building refunds part of the price', () => {
  const s = newGame();
  place(s, 'forklift', 5, 5);
  const before = s.players[0].cash;
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 5, y: 5 }).ok);
  assert.equal(s.players[0].cash, before + Math.floor(BUILD.forklift.cost * TUNE.sellBack));
  assert.equal(s.grid[at(5, 5)], 0);
  assert.equal(applyCommand(s, 0, { c: 'remove', x: 5, y: 5 }).why, 'empty');
});

test('unpacker, belt and chute turn boxes into cash', () => {
  const s = newGame();
  place(s, 'unpacker', 3, 3, 0);
  place(s, 'belt', 4, 3, 0);
  place(s, 'belt', 5, 3, 0);
  place(s, 'chute', 6, 3);
  const cash = s.players[0].cash;
  const ev = run(s, 20);
  const sales = ev.filter((e) => e.e === 'sale');
  assert.ok(sales.length >= 5, `expected several sales, got ${sales.length}`);
  assert.ok(sales.every((e) => e.kind === 'box'));
  assert.equal(s.players[0].cash, cash + sales.length * ITEMS.box.value);
  assert.equal(s.players[0].all.shipped, sales.length);
});

test('press and packer upgrade goods along the line', () => {
  const s = newGame();
  s.players[0].cash = 5000;
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
  assert.equal(s.grid[at(4, 3)].it.length, 2);
  assert.equal(s.grid[at(5, 3)].it.length, 2);
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
  assert.equal(t.grid[at(4, 3)].it.length, 0);
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
  assert.ok(s.players[0].cash < TUNE.startCash + TUNE.waveBonus + TUNE.waveBonusStep);
  assert.ok(ev.some((e) => e.e === 'waveEnd'));
  assert.equal(s.phase, 'build');
  assert.ok(s.phaseT > 0);
});

test('towers wear down patience until shoppers storm out', () => {
  const s = newGame();
  s.players[0].cash = 5000;
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
  s.players[0].cash = 100000;
  // A long snake of crate walls: alternate gaps at top and bottom.
  for (let x = 3; x <= 25; x += 2) {
    const gapTop = ((x - 3) / 2) % 2 === 0;
    for (let y = 1; y <= 14; y++) {
      if (gapTop ? y === 1 : y === 14) continue;
      if (s.tiles[at(x, y)] === '.') place(s, 'crate', x, y);
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

test('dads step over conveyor belts; everyone else walks around', () => {
  const s = newGame();
  s.players[0].cash = 100000;
  // A wall of belts down column 10 with one gap at the very bottom.
  for (let y = 1; y <= 13; y++) place(s, 'belt', 10, y, 1);
  const normal = getDist(s), hop = getHopDist(s);
  assert.ok(hop[at(0, 7)] < normal[at(0, 7)], 'the dad route is shorter');
  assert.equal(normal[at(10, 7)], UNREACHABLE);
  assert.notEqual(hop[at(10, 7)], UNREACHABLE);

  s.wave = 1; // next wave is 2, the first with a dad line
  applyCommand(s, 0, { c: 'start' });
  let dadOnBelt = false, otherOnBelt = false;
  const ev = [];
  for (let i = 0; i < 60 * TICK_HZ; i++) {
    ev.push(...step(s));
    for (const sh of s.shoppers) {
      const b = s.grid[at(sh.x | 0, sh.y | 0)];
      if (b && b.k === 'belt') { if (sh.k === 'dad') dadOnBelt = true; else otherOnBelt = true; }
    }
  }
  assert.equal(dadOnBelt, true);
  assert.equal(otherOnBelt, false);
  const firstDadOut = ev.findIndex((e) => e.e === 'escape' && e.k === 'dad');
  assert.ok(firstDadOut >= 0, 'dads get through the short way');
});

test('crates and machines stop dads, and building near a dad on a belt is still allowed', () => {
  const s = newGame();
  s.players[0].cash = 100000;
  for (let y = 1; y <= 13; y++) place(s, y % 2 ? 'crate' : 'press', 10, y, 1);
  assert.equal(getHopDist(s)[at(10, 7)], UNREACHABLE);
  assert.equal(getHopDist(s)[at(0, 7)], getDist(s)[at(0, 7)], 'with no belts the two routes match');

  const t = newGame();
  t.players[0].cash = 100000;
  for (let y = 1; y <= 13; y++) place(t, 'belt', 10, y, 1);
  t.wave = 1;
  applyCommand(t, 0, { c: 'start' });
  let checked = false;
  for (let i = 0; i < 60 * TICK_HZ && !checked; i++) {
    step(t);
    const dad = t.shoppers.find((sh) => sh.k === 'dad' && (sh.x | 0) === 10);
    if (dad) {
      assert.equal(canPlace(t, 'crate', 20, 3), null, 'a dad standing on a belt does not freeze building');
      assert.equal(canPlace(t, 'crate', 10, dad.y | 0), 'occupied');
      checked = true;
    }
  }
  assert.ok(checked, 'a dad was seen on the belt');
});

test('dads ignore free samples; bargain hunters stop for them', () => {
  const s = newGame();
  s.players[0].cash = 5000;
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
  const cash = s.players[0].cash;
  run(s, 30);
  assert.ok(s.players[0].cash > cash);
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
