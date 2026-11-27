// Tests for 0.4.01: live Razor Wire turns ordinary shoppers too (they see it and go round it, so
// they never use it up), and every check that a change cannot shut shoppers off counts every
// planned wire as a wall. Dads are tested in test/wire.test.js.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, canWire, step, queueTrainingWave, getDist, getField, wireMap, wireLive,
  addStock, itemCode, shopPlanCheck, modeOf, UNREACHABLE, FREE, DAD, ST, TICK_HZ,
} from '../src/sim/index.js';

/** A training game on the bare 30 x 16 map (entrance on the left, tills on the right), Dave rich. */
function stage(seed = 5) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}
const at = (x, y) => y * 30 + x;
const place = (s, k, x, y, d = 0) => applyCommand(s, 0, { c: 'place', k, x, y, d });
const wire = (s, x, y, d) => applyCommand(s, 0, { c: 'wire', x, y, d });
function stock(s, x, y, units = 1) {
  const b = s.grid[at(x, y)];
  for (let n = 0; n < units; n++) addStock(b, itemCode(5, 4), s);
  return b;
}
function send(s, groups) {
  queueTrainingWave(s, groups);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
}
const usesOf = (b) => { let n = 0; const r = b && b.s && b.s.wire; if (r) for (let k = 1; k < r.length; k += 2) n += r[k]; return n; };
/** A wall of crates down column 12, rows y0 to y1. */
function crates(s, y0, y1) { for (let y = y0; y <= y1; y++) assert.ok(place(s, 'crate', 12, y).ok, `crate at 12,${y}`); }

test('ordinary shoppers go round live wire and walk straight over planned wire; they never use it up', () => {
  const s = stage();
  // A Wet Floor Sign (blocks nobody) at (14, 5), wire south over (14, 5..8), across the way in.
  assert.ok(place(s, 'sprinkler', 14, 5).ok);
  const plain = [...getDist(s)];
  assert.ok(wire(s, 14, 5, 1).ok);
  assert.deepEqual([...getDist(s)], plain, 'planned wire changes nothing for them');
  stock(s, 14, 5, 2);
  const covered = [5, 6, 7, 8].map((y) => at(14, y));
  for (const t of covered) assert.equal(getDist(s)[t], UNREACHABLE, 'live wire is a wall to them');
  assert.ok(getDist(s)[at(13, 6)] > plain[at(13, 6)], 'the way round is longer');
  const uses = usesOf(s.grid[at(14, 5)]);
  send(s, [{ k: 'clipper', n: 8, gap: 0.4, at: 0 }, { k: 'karen', n: 3, gap: 0.7, at: 0.2 }, { k: 'gymbro', n: 2, gap: 1, at: 0.5 }]);
  let onWire = 0, escaped = 0;
  for (let n = 0; n < 90 * TICK_HZ && s.phase === 'wave'; n++) {
    for (const e of step(s)) if (e.e === 'escape') escaped++;
    for (const m of s.shoppers) if (m.st !== ST.LEAVE && covered.includes(at(m.x | 0, m.y | 0))) onWire++;
  }
  assert.equal(onWire, 0, 'nobody stepped under it');
  assert.ok(escaped > 0, 'they still got to the tills');
  assert.equal(usesOf(s.grid[at(14, 5)]), uses, 'nobody but a dad uses wire up');
});

test('the wire command is refused when the plan would shut ordinary shoppers off, even where dads would get by', () => {
  const s = stage();
  // Crates down column 12, rows 1 to 12; a Free Samples table at (12, 13) closes row 13; the only
  // way past is (12, 14). Dads walk through all of it.
  crates(s, 1, 12);
  assert.ok(place(s, 'samples', 12, 13).ok);
  assert.notEqual(getDist(s)[at(2, 7)], UNREACHABLE);
  // Its wire south would cover (12, 14): planned, the shoppers' last way through.
  assert.equal(canWire(s, 0, 12, 13, 1), 'blocked');
  assert.deepEqual(wire(s, 12, 13, 1), { ok: false, why: 'blocked' });
  assert.equal(s.grid[at(12, 13)].wd, undefined);
  // North it covers only crates: fine.
  assert.ok(wire(s, 12, 13, 3).ok);
  assert.equal(shopPlanCheck(s), null);
});

test('placing a building is refused when it would shut shoppers off once planned wire is counted', () => {
  const s = stage();
  crates(s, 1, 11);
  // A Pepper Sprinkler at (10, 13), wired east over (11..13, 13): planned only, nobody stocks it.
  // Rows 12 to 14 of column 12 are open; the planned wire covers row 13's.
  assert.ok(place(s, 'sprinkler', 10, 13).ok);
  assert.ok(wire(s, 10, 13, 0).ok);
  assert.equal(wireLive(s.grid[at(10, 13)]), false);
  assert.ok(place(s, 'crate', 12, 12).ok);
  assert.equal(canPlace(s, 'crate', 12, 14, 0), 'blocked', 'the planned wire counts as a wall');
  assert.equal(place(s, 'crate', 12, 14).ok, false);
  // Without its wire it would have been allowed.
  assert.ok(wire(s, 10, 13, -1).ok);
  assert.equal(canPlace(s, 'crate', 12, 14, 0), null);
});

test('a shopper standing where wire goes live walks off it and on to the tills', () => {
  const s = stage();
  assert.ok(place(s, 'sprinkler', 14, 5).ok);
  assert.ok(wire(s, 14, 5, 1).ok);
  const covered = [5, 6, 7, 8].map((y) => at(14, y));
  send(s, [{ k: 'clipper', n: 1, gap: 1, at: 0 }]);
  let caught = null;
  for (let n = 0; n < 60 * TICK_HZ && !caught; n++) {
    step(s);
    const m = s.shoppers.find((x) => x.k === 'clipper' && covered.includes(at(x.x | 0, x.y | 0)));
    if (m) caught = m;
  }
  assert.ok(caught, 'he walked onto the planned wire');
  stock(s, 14, 5);
  assert.equal(getDist(s)[at(caught.x | 0, caught.y | 0)], UNREACHABLE, 'live under him');
  assert.notEqual(getField(s, FREE)[at(caught.x | 0, caught.y | 0)], UNREACHABLE);
  let off = false, out = false;
  for (let n = 0; n < 60 * TICK_HZ && s.phase === 'wave'; n++) {
    for (const e of step(s)) if (e.e === 'escape' || e.e === 'refund') out = true;
    if (!s.shoppers.includes(caught) || caught.st === ST.LEAVE || !covered.includes(at(caught.x | 0, caught.y | 0))) off = true;
  }
  assert.ok(off, 'he walked off it');
  assert.ok(!s.shoppers.includes(caught) || caught.st === ST.LEAVE, 'and finished his visit');
});

test('a long random run: nobody but a dad ever steps from open floor onto live wire, and nobody is ever left without a way', () => {
  for (const seed of [3, 8, 21]) {
    const s = stage(seed);
    let r = seed * 7919;
    const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
    // A loose maze: two walls of crates with gaps, and security with wire about the floor.
    for (let y = 1; y <= 11; y++) place(s, 'crate', 9, y);
    for (let y = 4; y <= 14; y++) place(s, 'crate', 18, y);
    const posts = [];
    for (let n = 0; n < 14; n++) {
      const x = 2 + Math.floor(rnd() * 25), y = 1 + Math.floor(rnd() * 14);
      const k = ['sprinkler', 'forklift', 'samples'][n % 3];
      if (place(s, k, x, y).ok) posts.push([x, y]);
    }
    let refused = 0;
    for (const [x, y] of posts) if (!wire(s, x, y, Math.floor(rnd() * 4)).ok) refused++;
    send(s, [{ k: 'clipper', n: 14, gap: 0.5, at: 0 }, { k: 'karen', n: 5, gap: 1, at: 0.3 }, { k: 'gymbro', n: 3, gap: 2, at: 1 },
      { k: 'dad', n: 6, gap: 1, at: 0.6 }, { k: 'teen', n: 5, gap: 1, at: 0.8 }]);
    let checked = 0;
    for (let n = 0; n < 150 * TICK_HZ && s.phase === 'wave'; n++) {
      // Now and then a wire goes live, is cleared or turned (the command checks the plan), or runs dry.
      if (n % 37 === 0 && posts.length) {
        const [x, y] = posts[Math.floor(rnd() * posts.length)];
        const b = s.grid[at(x, y)];
        const roll = rnd();
        if (b && roll < 0.5) addStock(b, itemCode(5, 1), s);
        else if (b && roll < 0.8) wire(s, x, y, Math.floor(rnd() * 5) - 1);
        else if (b && b.s && b.s.wire) { delete b.s.wire; if (!Object.keys(b.s).length) delete b.s; s.gridVer++; }
      }
      const live = wireMap(s).live, dist = getDist(s);
      const was = new Map(s.shoppers.map((m) => [m, at(m.x | 0, m.y | 0)]));
      step(s);
      for (const m of s.shoppers) {
        if (m.st === ST.LEAVE || modeOf(m.k) === DAD || !was.has(m)) continue;
        const from = was.get(m), to = at(m.x | 0, m.y | 0);
        if (to !== from && dist[from] !== UNREACHABLE) {
          assert.ok(live[to] < 0, `seed ${seed}, tick ${n}: ${m.k} ${m.id} stepped from open floor onto live wire at ${to % 30},${(to / 30) | 0}`);
          checked++;
        }
        assert.ok(getDist(s)[to] !== UNREACHABLE || getField(s, FREE)[to] !== UNREACHABLE, `seed ${seed}: ${m.k} ${m.id} has no way out`);
      }
      for (const door of s.doors) for (const t of door) assert.notEqual(getDist(s)[t], UNREACHABLE, `seed ${seed}: an entrance is shut off`);
    }
    assert.ok(checked > 200, `seed ${seed}: ${checked} steps checked (${refused} wires refused)`);
  }
});
