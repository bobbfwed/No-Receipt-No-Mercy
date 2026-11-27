// Drawing logic of 0.4 stage 5b that runs without a browser: which supply status mark a building
// gets when zoomed out (src/render/marks.js), the records that make items glide in The Back
// (src/render/glide.js), and the painting budget, the sprite cache that keeps old pictures across a
// zoom step and the prepaint queue (src/render/spritecache.js). Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyCommand, addStock, itemCode, waveSpec, BACK } from '../src/sim/index.js';
import { stockMark, useMarks, markRadius, MARK_ZOOM, MARK_PX, NONE, SOME, ALL, NO_WIRE, PLANNED, LIVE } from '../src/render/marks.js';
import { matchLane, createGlides, ease, progress, GLIDE_TICKS, SINK_TICKS } from '../src/render/glide.js';
import { createPaintBudget, createSpriteCache, createPrepaint, comingKinds } from '../src/render/spritecache.js';

function game() {
  const s = createGame({ seed: 3 });
  addPlayer(s, 'Dave');
  if (s.phase === 'cards') { s.phase = 'build'; delete s.dealT; }
  s.players[0].cash = 1e6;
  return s;
}
const SPITE = itemCode(1, 1), COLA = itemCode(2, 1), CORD = itemCode(3, 1), TAPE = itemCode(4, 1), WIRE = itemCode(5, 2);

test('status marks: none, some or all of what a building takes, and its wire', () => {
  const s = game();
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 9, y: 8 }).ok, true);
  const b = s.grid[8 * s.w + 9];
  // A Sprinkler takes Spite, Cola, Cord and Tape (and Razor Wire, which only counts once it has a
  // wire direction).
  assert.equal(stockMark(b), NONE + 3 * NO_WIRE);
  addStock(b, SPITE, s);
  assert.equal(stockMark(b), SOME + 3 * NO_WIRE, 'one of four');
  for (const c of [COLA, CORD, TAPE]) addStock(b, c, s);
  assert.equal(stockMark(b), ALL + 3 * NO_WIRE, 'all four; no wire direction, so wire is not missing');
  // A wire direction makes Razor Wire one of the things it takes: planned while it has none.
  assert.equal(applyCommand(s, 0, { c: 'wire', x: 9, y: 8, d: 3 }).ok, true);
  assert.equal(stockMark(b), SOME + 3 * PLANNED, 'wire planned and not stocked: some, planned');
  addStock(b, WIRE, s);
  assert.equal(stockMark(b), ALL + 3 * LIVE, 'everything stocked, the wire live');
  // A Crate Stack takes nothing and gets no mark.
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'crate', x: 12, y: 8 }).ok, true);
  assert.equal(stockMark(s.grid[8 * s.w + 12]), -1);
  // Wire stock alone, with a direction: some (live wire, nothing else).
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'forklift', x: 14, y: 3 }).ok, true);
  const f = s.grid[3 * s.w + 14];
  assert.equal(applyCommand(s, 0, { c: 'wire', x: 14, y: 3, d: 1 }).ok, true);
  addStock(f, WIRE, s);
  assert.equal(stockMark(f), SOME + 3 * LIVE);
});

test('status marks: used below the zoom threshold, never smaller than MARK_PX on screen', () => {
  assert.equal(useMarks(MARK_ZOOM - 1), true);
  assert.equal(useMarks(MARK_ZOOM), false);
  assert.equal(useMarks(60), false);
  for (const z of [6, 10, 16, 24, MARK_ZOOM - 1]) {
    const r = markRadius(z);
    // On screen: the disc's width in CSS pixels is 2r world pixels times zoom / 40.
    assert.ok((2 * r * z) / 40 >= Math.min(MARK_PX, z) - 1e-9, `zoom ${z}`);
    assert.ok(r <= 20, 'never wider than a tile');
  }
  // It does not shrink as the view zooms in toward the threshold.
  assert.ok(markRadius(MARK_ZOOM - 1) >= markRadius(MARK_ZOOM + 10) - 1e-9);
});

test('glides: matchLane tells items that moved on from items that jumped in', () => {
  const step = BACK.step, out = new Int32Array(8);
  // An item moves on a step; one comes on from behind at a small position: neither is new from the side.
  let left = matchLane([SPITE, 100], 0, 1, [SPITE, 116, COLA, 8], 1, step, out);
  assert.equal(left, 0);
  assert.deepEqual([...out.slice(0, 2)], [0, 1]);
  // A side arrival at the middle, behind an item waiting at the end.
  left = matchLane([SPITE, BACK.end], 0, 1, [SPITE, BACK.end, COLA, BACK.sub / 2], 1, step, out);
  assert.equal(left, 0);
  assert.deepEqual([...out.slice(0, 2)], [0, 1]);
  // The front item went on (into a Dumbwaiter), the one behind moved up.
  left = matchLane([SPITE, BACK.end, COLA, 120], 0, 2, [COLA, 136], 1, step, out);
  assert.equal(left, 1);
  assert.equal(out[0], 0);
  // A tile emptied: everything left by the front.
  assert.equal(matchLane([SPITE, 200, COLA, 120], 0, 2, [], 1, step, out), 2);
  // Over several ticks an item may have moved several steps; the old lane may sit at an offset.
  left = matchLane([9, 9, SPITE, 40], 2, 1, [SPITE, 40 + 3 * step], 3, step, out);
  assert.equal(left, 0);
  assert.equal(out[0], 0);
  // Too far to have moved: a different item of the same kind.
  matchLane([SPITE, 40], 0, 1, [SPITE, 120], 1, step, out);
  assert.equal(out[0], 1);
});

test('glides: a fixed pool of records, found again as the item moves, expired in game time', () => {
  const g = createGlides(4);
  const r = g.take(100);
  Object.assign(r, { kind: 0, tile: 7, code: SPITE, pos: 120, x0: 0, y0: 0 });
  // Found where it landed and a little further on, as the belt moves it.
  assert.equal(g.find(7, SPITE, 120, 100, BACK.step), r);
  assert.equal(g.find(7, SPITE, 120 + 2 * BACK.step, 102, BACK.step), r);
  assert.equal(g.find(7, COLA, 120, 100, BACK.step), null, 'another item');
  assert.equal(g.find(8, SPITE, 120, 100, BACK.step), null, 'another tile');
  assert.equal(progress(r, 100), 0);
  assert.equal(progress(r, 100 + GLIDE_TICKS / 2), 0.5);
  assert.ok(ease(0.5) > 0.5 && ease(1) === 1 && ease(0) === 0, 'eases out');
  g.expire(100 + GLIDE_TICKS - 0.01);
  assert.equal(r.on, true);
  g.expire(100 + GLIDE_TICKS);
  assert.equal(r.on, false);
  // A sink lasts its own time.
  const k = g.take(200);
  k.kind = 1;
  g.expire(200 + SINK_TICKS - 0.5);
  assert.equal(k.on, true);
  g.expire(200 + SINK_TICKS);
  assert.equal(k.on, false);
  // A burst bigger than the pool reuses the oldest record, never allocates.
  const objects = new Set(g.pool);
  const taken = [];
  for (let n = 0; n < 6; n++) taken.push(g.take(300 + n));
  assert.equal(g.pool.length, 4);
  for (const t of taken) assert.ok(objects.has(t));
  assert.equal(g.pool.filter((p) => p.on).length, 4);
  assert.ok(g.pool.every((p) => p.t0 >= 302), 'the two oldest were reused');
  g.clear();
  assert.equal(g.pool.filter((p) => p.on).length, 0);
});

/** A budget on a pretend clock: each painting takes `cost` ms. */
function fakeBudget(ms, cost) {
  let now = 0;
  const b = createPaintBudget({ ms, clock: () => now });
  const paint = (x) => { now += cost; return { painted: x }; };
  return { b, paint };
}

test('the paint budget: stops optional painting once a frame has spent its milliseconds', () => {
  const { b, paint } = fakeBudget(3, 1);
  b.frame();
  let n = 0;
  while (b.ok()) { b.begin(); paint(n); b.end(); n++; }
  assert.equal(n, 3);
  assert.equal(b.painted, 3);
  b.frame();
  assert.equal(b.ok(), true, 'a new frame starts afresh');
  // Nested begin/end count once.
  b.begin(); b.begin(); paint(0); b.end(); b.end();
  assert.equal(b.painted, 1);
});

test('the sprite cache: after a zoom step, old pictures stand in while the budget is spent, and are repainted visible first', () => {
  const { b, paint } = fakeBudget(2, 1);
  const c = createSpriteCache(b, (args) => paint(`re${args}`));
  const get = (key) => { let x = c.have(key); if (!x) { b.begin(); x = paint(key); b.end(); c.put(key, x, key); } return x; };
  b.frame();
  for (let k = 0; k < 6; k++) get(k);
  c.idle();
  c.rescale(); // a zoom step
  assert.equal(c.stale, true);
  // The next frame draws keys 0 to 3: two are painted afresh (the budget), two use the old picture.
  b.frame();
  const drawn = [0, 1, 2, 3].map(get);
  assert.equal(drawn[0].painted, 0, 'painted again at the new size (repaint of key 0 is done by get)');
  assert.equal(c.has(0) && c.has(1), true);
  assert.equal(c.has(2) || c.has(3), false, 'the budget was spent: old pictures stood in');
  assert.equal(drawn[2].painted, 2, 'the old picture');
  // After the frame, idle() has no budget left: nothing more this frame.
  c.idle();
  assert.equal(c.size, 2);
  // Following frames repaint the rest within the budget, then let the old pictures go.
  let frames = 0;
  while (c.stale && frames < 10) { b.frame(); [0, 1, 2, 3].forEach(get); c.idle(); frames++; }
  assert.equal(c.stale, false);
  assert.equal(c.size, 6, 'every old picture was painted again, the ones off screen too');
  assert.ok(frames >= 2, 'spread over frames');
});

test('the sprite cache: with nothing to stand in, a picture is painted at once whatever the budget', () => {
  const { b, paint } = fakeBudget(1, 5);
  const c = createSpriteCache(b, null);
  b.frame();
  b.begin(); paint('x'); b.end();
  assert.equal(b.ok(), false);
  assert.equal(c.have('new'), null, 'not in the cache: the caller paints it');
  // A cache that cannot repaint out of turn (buildings) drops its old pictures once a frame needs none.
  c.put('a', { painted: 'a' });
  c.rescale();
  b.frame();
  assert.equal(c.have('a'), null, 'budget left: paint it afresh');
  c.put('a', { painted: 'a2' });
  c.idle();
  assert.equal(c.stale, false);
});

test('the prepaint queue: in order, within the budget, skipping what is already painted', () => {
  const { b, paint } = fakeBudget(3, 1);
  const order = [];
  const c = createSpriteCache(b, (args) => { order.push(args); return paint(args); });
  c.put('b', { painted: 'b' }, 'b');
  const q = createPrepaint(b);
  q.plan('event 5', ['a', 'b', 'c', 'd', 'e'].map((k) => [c, k, k]));
  assert.equal(q.planned('event 5'), true);
  assert.equal(q.planned('event 6'), false);
  b.frame();
  assert.equal(q.run(), 3);
  assert.deepEqual(order, ['a', 'c', 'd'], 'b was already painted');
  b.frame();
  assert.equal(q.run(), 1);
  assert.deepEqual(order, ['a', 'c', 'd', 'e']);
  assert.equal(q.left, 0);
});

test('the prepaint queue paints the next event\'s kinds, supers too, in the order they arrive', () => {
  const s = game();
  s.wave = 13;
  const kinds = comingKinds(s);
  const spec = waveSpec(14, 1);
  // Every kind of the next event, once, the boss left out.
  const want = new Set(spec.filter((g) => g.k !== 'boss').map((g) => g.k));
  assert.deepEqual(new Set(kinds.filter((k) => !k.sup).map((k) => k.k)), want);
  // Supers for exactly the kinds whose super version comes.
  const sups = new Set(spec.filter((g) => g.sup > 0 && g.k !== 'boss').map((g) => g.k));
  assert.deepEqual(new Set(kinds.filter((k) => k.sup).map((k) => k.k)), sups);
  assert.ok(sups.has('blind') && sups.has('flasher') && sups.has('preggo'), 'their supers first come in event 14');
  // Ordinary kinds first, in the order their groups start.
  const firstSup = kinds.findIndex((k) => k.sup);
  const ats = kinds.slice(0, firstSup).map((k) => Math.min(...spec.filter((g) => g.k === k.k).map((g) => g.at)));
  assert.deepEqual(ats, ats.slice().sort((a, b) => a - b));
  assert.ok(kinds.slice(firstSup).every((k) => k.sup));
  // The training shift paints what the lesson has queued.
  s.training = true;
  s.nextWave = [{ k: 'dad', n: 5, gap: 1, at: 0, sup: 0 }];
  assert.deepEqual(comingKinds(s), [{ k: 'dad', sup: false }]);
});
