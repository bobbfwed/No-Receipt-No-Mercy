// Tests for the simulation rules. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, step, applyDemoLayout, waveSpec, getDist,
  getDadDist, TICK_HZ, TUNE, BUILD, ST, UNREACHABLE,
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
  assert.equal(place(s, 'crate', 4, 4).why, 'cash');
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

test('undefended shoppers reach the tills and take refunds', () => {
  const s = newGame();
  applyCommand(s, 0, { c: 'start' });
  assert.equal(s.phase, 'wave');
  assert.equal(s.wave, 1);
  const ev = run(s, 60);
  const escapes = ev.filter((e) => e.e === 'escape').length;
  assert.equal(escapes, waveSpec(1)[0].n);
  assert.equal(s.refunds, escapes);
  const end = ev.find((e) => e.e === 'waveEnd');
  assert.ok(end);
  // The event pays all the same (0.4), but every one of them was refunded: no speed bonus.
  assert.equal(end.pay, TUNE.payBase + TUNE.payStep);
  assert.equal(end.speed, 0);
  assert.ok(s.players[0].cash < TUNE.startCash + end.pay);
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

test('dads walk straight through a snake of crates that makes everyone else walk it (0.4)', () => {
  // (Until 0.4 a long enough snake of crates wore dads down by itself: their patience drains while
  // they walk. Now only walls and Razor Wire stop a dad: test/wire.test.js.)
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
  s.wave = TUNE.dadFrom - 1; // the next wave is the first with a dad line
  applyCommand(s, 0, { c: 'start' });
  const ev = run(s, 150);
  const dads = waveSpec(TUNE.dadFrom).filter((g) => g.k === 'dad').reduce((n, g) => n + g.n, 0);
  assert.ok(dads > 0);
  assert.equal(ev.filter((e) => e.e === 'escape' && e.k === 'dad').length, dads, 'every dad walks through and takes his refund');
  assert.equal(ev.filter((e) => e.e === 'left' && e.k === 'dad').length, 0);
  assert.ok(ev.some((e) => e.e === 'escape' && e.k === 'hunter'), 'hunters are patient enough to walk the snake');
});

test('dads walk by their own map, through every building; others walk round (0.4)', () => {
  const s = newGame();
  s.players[0].cash = 100000;
  // A wall of crates and Free Samples tables down column 10 with one gap at the very bottom, and a wet floor
  // sign (which blocks nobody) in the gap.
  for (let y = 1; y <= 13; y++) assert.ok(place(s, y % 4 ? 'crate' : 'samples', 10, y).ok);
  assert.ok(place(s, 'wetfloor', 10, 14).ok);
  const normal = getDist(s), dad = getDadDist(s);
  assert.equal(normal[at(10, 7)], UNREACHABLE);
  assert.notEqual(dad[at(10, 7)], UNREACHABLE, 'the wall is floor to a dad');
  assert.ok(dad[at(0, 7)] < normal[at(0, 7)], 'his way is shorter');
  // In play dads walk over the wall and nobody else does; a dad does not stop anything being built
  // on his tile (he walks through buildings), anyone else does.
  s.wave = TUNE.dadFrom - 1; // the next wave is the first with a dad line
  applyCommand(s, 0, { c: 'start' });
  let dadOnWall = false, checked = false, checkedOther = false;
  for (let i = 0; i < 60 * TICK_HZ; i++) {
    step(s);
    for (const sh of s.shoppers) {
      const b = s.grid[at(sh.x | 0, sh.y | 0)];
      if (sh.k !== 'dad') assert.ok(!b || !BUILD[b.k].blocks, `${sh.k} on a ${b && b.k}`);
      else if (b && BUILD[b.k].blocks) dadOnWall = true;
      const free = !b && s.tiles[at(sh.x | 0, sh.y | 0)] === '.';
      if (!checked && sh.k === 'dad' && free && (sh.x | 0) > 12 && (sh.x | 0) < 27) {
        assert.equal(canPlace(s, 'crate', sh.x | 0, sh.y | 0), null, 'a crate may go on a dad');
        checked = true;
      }
      if (!checkedOther && sh.k !== 'dad' && sh.st === ST.WALK && free && (sh.x | 0) > 12 && (sh.x | 0) < 27) {
        assert.equal(canPlace(s, 'crate', sh.x | 0, sh.y | 0), 'shopper');
        checkedOther = true;
      }
    }
  }
  assert.ok(dadOnWall, 'a dad was seen on the wall');
  assert.ok(checked && checkedOther, 'a dad and somebody else were seen past the wall');
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

test('the demo layout builds cleanly, and beating its first sales event pays', () => {
  const s = newGame();
  assert.deepEqual(applyDemoLayout(s), []);
  const cash = s.players[0].cash;
  applyCommand(s, 0, { c: 'start' });
  const end = run(s, 120).find((e) => e.e === 'waveEnd');
  assert.ok(end, 'the event ended');
  assert.equal(s.refunds, 0, 'nobody got through the demo maze');
  assert.ok(s.players[0].cash >= cash + s.ws.pay, 'paid at least the event pay');
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
  for (const n of ['a', 'b', 'c', 'd', 'e']) addPlayer(s, n);
  assert.equal(s.players.length, 7);
  assert.equal(addPlayer(s, 'eighth'), -1);
  assert.equal(applyCommand(s, 9, { c: 'start' }).ok, false);
});
