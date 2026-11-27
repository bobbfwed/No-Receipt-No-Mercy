// Drawing logic of 0.4.01 that runs without a browser (src/render/back.js and marks.js): the red
// lamp on the Dumbwaiter of a building that has a wire direction and no Razor Wire, and which
// outlets of a Returns Drop are open now that it shares its junk with every side. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyCommand, addStock, itemCode, addTrainingDrops } from '../src/sim/index.js';
import { wantsWire, lampPulse, dropOutlets } from '../src/render/back.js';
import { stockMark, PLANNED } from '../src/render/marks.js';

function game() {
  const s = createGame({ seed: 3 });
  addPlayer(s, 'Dave');
  if (s.phase === 'cards') { s.phase = 'build'; delete s.dealT; }
  s.players[0].cash = 1e6;
  return s;
}

test('the red lamp: a wire direction and no Razor Wire asks for some; wire arriving puts it out', () => {
  const s = game();
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'forklift', x: 9, y: 8 }).ok, true);
  const b = s.grid[8 * s.w + 9];
  assert.equal(wantsWire(b), false, 'no direction: wire with nowhere to go is not missing');
  assert.equal(applyCommand(s, 0, { c: 'wire', x: 9, y: 8, d: 3 }).ok, true);
  assert.equal(wantsWire(b), true, 'a direction and no wire: the lamp is on');
  // The zoomed-out mark says the same (its planned ring carries the red lamp).
  assert.equal(Math.floor(stockMark(b) / 3), PLANNED);
  addStock(b, itemCode(5, 1), s);
  assert.equal(wantsWire(b), false, 'the moment wire arrives the lamp goes out');
  assert.equal(applyCommand(s, 0, { c: 'wire', x: 9, y: 8, d: -1 }).ok, true);
  assert.equal(wantsWire(b), false, 'direction cleared: nothing asked for');
  assert.equal(wantsWire(null), false);
  assert.equal(wantsWire({ k: 'crate' }), false);
});

test("the lamp's pulse runs on the screen's clock, from 0 to 1", () => {
  const seen = [];
  for (let ms = 0; ms < 2400; ms += 50) seen.push(lampPulse(ms));
  assert.ok(seen.every((k) => k >= 0 && k <= 1));
  assert.ok(Math.max(...seen) > 0.95 && Math.min(...seen) < 0.05, 'it fades right down and right up');
  assert.equal(lampPulse(1234), lampPulse(1234), 'the same moment, the same brightness on every screen');
});

test("a Returns Drop's outlets open on every side that takes its junk", () => {
  const s = game();
  // The bare default map has no drops: put one down as the training shift does.
  s.training = true;
  assert.equal(addTrainingDrops(s, [[8, 6]]), 1);
  const i = 6 * s.w + 8;
  assert.equal(dropOutlets(s, i), 0, 'nothing beside it: every outlet shut');
  const belt = (x, y, d) => assert.equal(applyCommand(s, 0, { c: 'place', k: 'conv', x, y, d, f: 1 }).ok, true);
  belt(8, 7, 1); // below, leading away (south)
  assert.equal(dropOutlets(s, i), 1 << 1);
  belt(9, 6, 0); // right, leading away (east)
  assert.equal(dropOutlets(s, i), (1 << 1) | (1 << 0));
  belt(7, 6, 3); // left, running past (north): it takes from the side
  belt(8, 5, 1); // above, pointing INTO the drop: a belt never takes head-on, so that side stays shut
  assert.equal(dropOutlets(s, i), (1 << 1) | (1 << 0) | (1 << 2));
  // A Dumbwaiter never takes junk, so a side against one stays shut too.
  assert.equal(applyCommand(s, 0, { c: 'remove', x: 8, y: 5, f: 1 }).ok, true);
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'still', x: 8, y: 5, d: 3, f: 1 }).ok, true);
  assert.equal(dropOutlets(s, i), 15, 'a machine with its back to the drop takes junk: all four open');
});
