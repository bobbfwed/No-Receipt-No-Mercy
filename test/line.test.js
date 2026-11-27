// Tests for belt lines (0.4.01): planLine in src/sim/line.js and the `line` command that lays one.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, planLine, stepBack, give, wants, newPart, overpassDirs, beltShape,
  BUILD, JUNK,
} from '../src/sim/index.js';
import { checksum } from '../src/net/session.js';

const E = 0, S = 1, W = 2, N = 3;

/** A game on the bare 30 x 16 map with only its outer wall, and Dave with plenty of cash. */
function blank(cash = 1e6) {
  const s = createGame();
  let t = '';
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) t += x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1 ? '#' : '.';
  s.tiles = t;
  addPlayer(s, 'Dave');
  s.players[0].cash = cash;
  return s;
}
const ix = (s, x, y) => y * s.w + x;
const at = (s, x, y) => s.back[ix(s, x, y)];
/** Puts a part straight into The Back, as a test needs it. */
function lay(s, x, y, k, d = 0, o = 0) {
  const p = k === 'drop' ? { k: 'drop', d, t: 1, lv: 0, r: 0 } : newPart(k, o, d);
  s.back[ix(s, x, y)] = p;
  s.backVer++;
  return p;
}
function col(s, x, y0, y1, d) { for (let y = y0; y <= y1; y++) lay(s, x, y, 'conv', d); }
function wall(s, x, y) { const i = ix(s, x, y); s.tiles = s.tiles.slice(0, i) + '#' + s.tiles.slice(i + 1); }
const line = (s, x, y, x2, y2, a = 0, pid = 0, ev = []) => applyCommand(s, pid, { c: 'line', f: 1, x, y, x2, y2, a }, ev);
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

/** Checks a plan's steps: one tile after another, each belt pointing at the next tile. */
function connected(s, plan) {
  for (let n = 0; n + 1 < plan.steps.length; n++) {
    const a = plan.steps[n], b = plan.steps[n + 1];
    const ax = a.i % s.w, ay = (a.i / s.w) | 0;
    assert.equal(Math.abs(ax - (b.i % s.w)) + Math.abs(ay - ((b.i / s.w) | 0)), 1, 'neighbours');
    if (!a.keep || a.k === 'conv') assert.equal(ix(s, ax + DX[a.d], ay + DY[a.d]), b.i, `step ${n} points at the next`);
  }
}

/**
 * Steps The Back n times, putting `code` on tile (x, y) travelling d whenever it fits, and counts
 * the items of each code that sit on tile (tx, ty) or have passed through... simply: returns the
 * codes seen on each watched tile over the run.
 */
function flow(s, feeds, watch, n = 600) {
  const seen = watch.map(() => new Set());
  for (let t = 0; t < n; t++) {
    for (const [x, y, d, code] of feeds) { const i = ix(s, x, y); if (wants(s, i, code, d)) give(s, i, code, d); }
    stepBack(s);
    watch.forEach(([x, y], k) => { const p = at(s, x, y); for (const it of [p.it, p.a, p.b]) if (it) for (let j = 0; j < it.length; j += 2) seen[k].add(it[j]); });
  }
  return seen.map((set) => [...set].sort());
}

test('a straight line: one belt a tile, all facing along it, paid for at once', () => {
  const s = blank(100);
  const ev = [];
  const r = line(s, 3, 5, 8, 5, 0, 0, ev);
  assert.equal(r.ok, true);
  assert.equal(r.n, 6);
  for (let x = 3; x <= 8; x++) { assert.equal(at(s, x, 5).k, 'conv'); assert.equal(at(s, x, 5).d, E); assert.equal(at(s, x, 5).o, 0); }
  assert.equal(s.players[0].cash, 100 - 6 * BUILD.conv.cost);
  assert.equal(ev.filter((e) => e.e === 'placed' && e.k === 'conv' && e.f === 1 && e.by === 0).length, 6);
  // Backwards, west.
  const t = blank();
  assert.equal(line(t, 8, 7, 3, 7).ok, true);
  for (let x = 3; x <= 8; x++) assert.equal(at(t, x, 7).d, W);
});

test('an L: the axis says which way it leaves the start', () => {
  const s = blank();
  const p0 = planLine(s, 0, ix(s, 3, 3), ix(s, 6, 6), 0);
  connected(s, p0);
  assert.deepEqual(p0.steps.map((st) => [st.i % s.w, (st.i / s.w) | 0, st.d]),
    [[3, 3, E], [4, 3, E], [5, 3, E], [6, 3, S], [6, 4, S], [6, 5, S], [6, 6, S]]);
  const p1 = planLine(s, 0, ix(s, 3, 3), ix(s, 6, 6), 1);
  assert.deepEqual(p1.steps.map((st) => [st.i % s.w, (st.i / s.w) | 0, st.d]),
    [[3, 3, S], [3, 4, S], [3, 5, S], [3, 6, E], [4, 6, E], [5, 6, E], [6, 6, E]]);
  assert.equal(p0.cost, 7 * BUILD.conv.cost);
  assert.equal(p0.cut, false);
  assert.equal(p0.why, null);
});

test('a line goes round a pillar and round a machine, still the shortest way', () => {
  for (const block of ['wall', 'still']) {
    const s = blank();
    if (block === 'wall') wall(s, 5, 5); else lay(s, 5, 5, 'still', N);
    const p = planLine(s, 0, ix(s, 3, 5), ix(s, 8, 5), 0);
    assert.equal(p.why, null);
    connected(s, p);
    assert.equal(p.steps.length, 8, 'two tiles longer than straight');
    assert.ok(!p.steps.some((st) => st.i === ix(s, 5, 5)));
    assert.equal(p.steps[0].i, ix(s, 3, 5));
    assert.equal(p.steps[p.steps.length - 1].i, ix(s, 8, 5));
  }
});

test('a line from a Returns Drop starts beside it and carries its junk', () => {
  const s = blank();
  lay(s, 3, 5, 'drop');
  const r = line(s, 3, 5, 8, 5);
  assert.equal(r.ok, true);
  assert.equal(at(s, 3, 5).k, 'drop', 'the drop is untouched');
  for (let x = 4; x <= 8; x++) assert.equal(at(s, x, 5).d, E);
  assert.equal(r.n, 5);
  for (let t = 0; t < 400; t++) stepBack(s);
  assert.ok(at(s, 8, 5).it.length > 0, 'junk at the far end');
});

test('a line into a Dumbwaiter or a machine ends beside it, its last belt pointing in', () => {
  const s = blank();
  s.grid[ix(s, 8, 5)] = { k: 'sprinkler', o: 0, cd: 0 };
  s.back[ix(s, 8, 5)] = { k: 'lift', a: ix(s, 8, 5) };
  assert.equal(at(s, 8, 5).k, 'lift');
  assert.equal(line(s, 3, 5, 8, 5).ok, true);
  assert.equal(at(s, 7, 5).d, E);
  assert.equal(at(s, 8, 5).k, 'lift');

  // A machine facing north takes from the west: the line runs straight in.
  const m = blank();
  lay(m, 8, 5, 'still', N);
  assert.equal(line(m, 3, 5, 8, 5).ok, true);
  assert.equal(at(m, 7, 5).d, E);
  // Facing west, its front is that tile: the line comes in from another side instead.
  const f = blank();
  lay(f, 8, 5, 'still', W);
  const p = planLine(f, 0, ix(f, 3, 5), ix(f, 8, 5), 0);
  assert.equal(p.why, null);
  connected(f, p);
  const last = p.steps[p.steps.length - 1];
  assert.notEqual(last.i, ix(f, 7, 5));
  const lx = last.i % f.w, ly = (last.i / f.w) | 0;
  assert.equal(ix(f, lx + DX[last.d], ly + DY[last.d]), ix(f, 8, 5), 'points into the machine');
  assert.equal(applyCommand(f, 0, { c: 'line', f: 1, x: 3, y: 5, x2: 8, y2: 5, a: 0 }).ok, true);
  for (let t = 0; t < 300; t++) { if (wants(f, ix(f, 3, 5), JUNK, E)) give(f, ix(f, 3, 5), JUNK, E); stepBack(f); }
  assert.ok(at(f, 8, 5).n > 0 || at(f, 8, 5).t > 0 || at(f, 8, 5).out, 'the machine is fed');
  // A Returns Drop takes nothing: no line ends at one.
  const d = blank();
  lay(d, 8, 5, 'drop');
  assert.equal(planLine(d, 0, ix(d, 3, 5), ix(d, 8, 5), 0).why, 'blocked');
});

test('crossing a straight belt makes an Overpass: both lines keep flowing their own way', () => {
  const s = blank();
  col(s, 6, 2, 9, S);
  at(s, 6, 5).it.push(31, 100);
  const before = s.players[0].cash;
  const ev = [];
  const r = line(s, 3, 5, 9, 5, 0, 0, ev);
  assert.equal(r.ok, true);
  const o = at(s, 6, 5);
  assert.equal(o.k, 'over');
  assert.deepEqual(o.b, [31, 100], 'the item riding the belt stays on the north-south lane');
  assert.equal(o.c, BUILD.over.cost, 'what was spent on the belt counts toward it');
  assert.equal(before - s.players[0].cash, 6 * BUILD.conv.cost + (BUILD.over.cost - BUILD.conv.cost));
  assert.ok(ev.some((e) => e.e === 'placed' && e.k === 'over' && e.x === 6 && e.y === 5 && e.f === 1));
  assert.deepEqual(overpassDirs(s, ix(s, 6, 5)), [E, S]);
  const [down, across] = flow(s, [[6, 2, S, 11], [3, 5, E, 21]], [[6, 9], [9, 5]]);
  assert.deepEqual(down, [11, 31]);
  assert.deepEqual(across, [21]);

  // The old line running north keeps running north.
  const n = blank();
  col(n, 6, 2, 9, N);
  assert.equal(line(n, 9, 5, 3, 5).ok, true);
  assert.deepEqual(overpassDirs(n, ix(n, 6, 5)), [W, N]);
  const [up, west] = flow(n, [[6, 9, N, 11], [9, 5, W, 21]], [[6, 2], [3, 5]]);
  assert.deepEqual(up, [11]);
  assert.deepEqual(west, [21]);
});

test('crossing two belts side by side, and next to an Overpass already there', () => {
  const s = blank();
  col(s, 6, 2, 9, S);
  col(s, 7, 2, 9, N);
  assert.equal(line(s, 3, 5, 10, 5).ok, true);
  assert.equal(at(s, 6, 5).k, 'over');
  assert.equal(at(s, 7, 5).k, 'over');
  assert.deepEqual(overpassDirs(s, ix(s, 6, 5)), [E, S]);
  assert.deepEqual(overpassDirs(s, ix(s, 7, 5)), [E, N]);
  const [a, b, c] = flow(s, [[6, 2, S, 11], [7, 9, N, 12], [3, 5, E, 21]], [[6, 9], [7, 2], [10, 5]]);
  assert.deepEqual(a, [11]);
  assert.deepEqual(b, [12]);
  assert.deepEqual(c, [21]);

  // A north-south line that already has an Overpass just above where the new line crosses it.
  const t = blank();
  col(t, 6, 2, 9, S);
  lay(t, 6, 4, 'over');
  assert.equal(line(t, 3, 5, 9, 5).ok, true);
  assert.equal(at(t, 6, 4).k, 'over');
  assert.equal(at(t, 6, 5).k, 'over');
  const [d, e] = flow(t, [[6, 2, S, 11], [3, 5, E, 21]], [[6, 9], [9, 5]]);
  assert.deepEqual(d, [11]);
  assert.deepEqual(e, [21]);

  // A line straight through two Overpasses in a row: they are used free and left as they are.
  const u = blank();
  lay(u, 6, 5, 'over');
  lay(u, 7, 5, 'over');
  const p = planLine(u, 0, ix(u, 3, 5), ix(u, 10, 5), 0);
  assert.equal(p.steps.length, 8);
  assert.equal(p.cost, 6 * BUILD.conv.cost);
  assert.ok(p.steps.filter((st) => st.k === 'over').every((st) => st.keep && st.cost === 0));
  assert.equal(line(u, 3, 5, 10, 5).ok, true);
  const [f] = flow(u, [[3, 5, E, 21]], [[10, 5]]);
  assert.deepEqual(f, [21]);
});

test('a corner belt across the way, or a turn on a belt: the line goes round', () => {
  const s = blank();
  // (6,5) faces south and is fed from the west by (5,5): a corner.
  lay(s, 5, 5, 'conv', E);
  lay(s, 6, 5, 'conv', S);
  col(s, 6, 6, 8, S);
  assert.notEqual(beltShape(s, ix(s, 6, 5)), 0);
  const p = planLine(s, 0, ix(s, 6, 2), ix(s, 9, 5), 1);
  assert.equal(p.why, null);
  connected(s, p);
  assert.ok(!p.steps.some((st) => st.i === ix(s, 6, 5) && !st.keep), 'the corner is not touched');
  const q = planLine(s, 0, ix(s, 2, 5), ix(s, 9, 5), 0);
  assert.equal(q.why, null);
  assert.ok(!q.steps.some((st) => st.i === ix(s, 6, 5)), 'not crossed');
  connected(s, q);
});

test('ending on a belt across the line leaves it alone; the line feeds it from the side', () => {
  const s = blank();
  col(s, 8, 2, 9, S);
  const r = line(s, 3, 5, 8, 5);
  assert.equal(r.ok, true);
  assert.equal(r.n, 5);
  assert.equal(at(s, 8, 5).k, 'conv');
  assert.equal(at(s, 8, 5).d, S);
  const [down] = flow(s, [[3, 5, E, 21]], [[8, 9]]);
  assert.deepEqual(down, [21]);
  // Ending on a belt along the line turns it.
  const t = blank();
  lay(t, 8, 5, 'conv', W);
  line(t, 3, 5, 8, 5);
  assert.equal(at(t, 8, 5).d, E);
});

test('money: the line is cut before the first step he cannot pay for', () => {
  const s = blank(7);
  const p = planLine(s, 0, ix(s, 3, 5), ix(s, 9, 5), 0);
  assert.equal(p.steps.length, 3);
  assert.equal(p.cut, true);
  assert.equal(p.cost, 6);
  const r = line(s, 3, 5, 9, 5);
  assert.equal(r.ok, true);
  assert.equal(r.cut, true);
  assert.equal(s.players[0].cash, 1);
  assert.equal(at(s, 5, 5).d, E, 'the last belt kept still points along the route');
  assert.equal(at(s, 6, 5), 0);
  // Not even one belt: refused, nothing changes.
  const before = JSON.stringify(s);
  assert.deepEqual(line(s, 6, 5, 9, 5), { ok: false, why: 'cash' });
  assert.equal(JSON.stringify(s), before);

  // Before an Overpass: two belts, then the crossing he cannot afford.
  const t = blank(2 * BUILD.conv.cost + 5);
  col(t, 5, 2, 9, S);
  const q = planLine(t, 0, ix(t, 3, 5), ix(t, 9, 5), 0);
  assert.equal(q.steps.length, 2);
  assert.equal(q.cut, true);
  assert.equal(line(t, 3, 5, 9, 5).ok, true);
  assert.equal(at(t, 5, 5).k, 'conv', 'the belt it would cross is untouched');
  assert.equal(at(t, 5, 5).d, S);
});

test('a line of free steps only (turning belts) costs nothing', () => {
  const s = blank(0);
  for (let x = 3; x <= 8; x++) lay(s, x, 5, 'conv', W);
  const r = line(s, 3, 5, 8, 5);
  assert.equal(r.ok, true);
  assert.equal(r.cost, 0);
  for (let x = 3; x <= 8; x++) assert.equal(at(s, x, 5).d, E);
});

test('malformed or refused line commands change nothing', () => {
  const s = blank();
  lay(s, 10, 10, 'conv', E);
  const bad = [
    { c: 'line', f: 1, x: 3.5, y: 5, x2: 8, y2: 5, a: 0 },
    { c: 'line', f: 1, x: 3, y: 5, x2: 8, y2: 5.2, a: 0 },
    { c: 'line', f: 1, x: -1, y: 5, x2: 8, y2: 5, a: 0 },
    { c: 'line', f: 1, x: 3, y: 5, x2: 30, y2: 5, a: 0 },
    { c: 'line', f: 1, x: 3, y: 5, x2: 8, y2: 16, a: 0 },
    { c: 'line', f: 1, x: '__proto__', y: 5, x2: 8, y2: 5, a: 0 },
    { c: 'line', f: 1, x: 3, y: 5, x2: 'constructor', y2: 5, a: 0 },
    { c: 'line', f: 1, x: 3, y: 5, x2: 8, a: 0 },
    { c: 'line', f: 1, y: 5, x2: 8, y2: 5, a: 0 },
    { c: 'line', f: 1, x: 3, y: 5, x2: 8, y2: 5 },
    { c: 'line', f: 1, x: 3, y: 5, x2: 8, y2: 5, a: 2 },
    { c: 'line', f: 1, x: 3, y: 5, x2: 8, y2: 5, a: '0' },
    { c: 'line', x: 3, y: 5, x2: 8, y2: 5, a: 0 },
    { c: 'line', f: 2, x: 3, y: 5, x2: 8, y2: 5, a: 0 },
    { c: 'line', f: 1, x: 3, y: 5, x2: 3, y2: 5, a: 0 },
    { c: 'line', f: 1, x: 0, y: 5, x2: 8, y2: 5, a: 0 },
    { c: 'line', f: 1, x: 3, y: 5, x2: 29, y2: 5, a: 0 },
  ];
  const before = JSON.stringify(s);
  for (const cmd of bad) {
    const r = applyCommand(s, 0, cmd, []);
    assert.equal(r.ok, false, JSON.stringify(cmd));
    assert.equal(JSON.stringify(s), before, JSON.stringify(cmd));
  }
  assert.equal(applyCommand(s, 0, { c: 'line', f: 1, x: 3, y: 5, x2: 3, y2: 5, a: 0 }).why, 'same');
  assert.equal(applyCommand(s, 0, { c: 'line', f: 1, x: 0, y: 5, x2: 8, y2: 5, a: 0 }).why, 'blocked');
  assert.equal(applyCommand(s, 7, { c: 'line', f: 1, x: 3, y: 5, x2: 8, y2: 5, a: 0 }).why, 'bad');
  // Paused, and during the deal.
  s.pause = { by: 0 };
  assert.equal(applyCommand(s, 0, { c: 'line', f: 1, x: 3, y: 5, x2: 8, y2: 5, a: 0 }).why, 'paused');
  assert.equal(planLine(s, 0, ix(s, 3, 5), ix(s, 8, 5), 0).why, 'paused');
  delete s.pause;
  s.phase = 'cards';
  assert.equal(applyCommand(s, 0, { c: 'line', f: 1, x: 3, y: 5, x2: 8, y2: 5, a: 0 }).ok, false);
  s.phase = 'won';
  assert.equal(planLine(s, 0, ix(s, 3, 5), ix(s, 8, 5), 0).why, 'over');
});

test('host and client plan and lay the same line from the same state', () => {
  const s = blank(60);
  col(s, 6, 2, 9, S);
  lay(s, 3, 5, 'drop');
  wall(s, 7, 6);
  lay(s, 9, 9, 'still', W);
  for (let t = 0; t < 50; t++) stepBack(s);
  const c = structuredClone(s);
  const cmd = { c: 'line', f: 1, x: 3, y: 5, x2: 9, y2: 9, a: 1 };
  const e1 = [], e2 = [];
  assert.deepEqual(applyCommand(s, 0, cmd, e1), applyCommand(c, 0, cmd, e2));
  assert.deepEqual(e1, e2);
  assert.equal(JSON.stringify(s), JSON.stringify(c));
  assert.equal(checksum(s), checksum(c));
  for (let t = 0; t < 200; t++) { stepBack(s); stepBack(c); }
  assert.equal(JSON.stringify(s), JSON.stringify(c));
});
