// Tests for what the floor shows of a selected building's reach (0.3.01): src/render/reach.js.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyCommand, maxIn, statsOf } from '../src/sim/index.js';
import { selectedReach, drawnBySelection } from '../src/render/reach.js';

function game() {
  const s = createGame({ seed: 3 });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e7;
  return s;
}
const at = (s, x, y) => y * s.w + x;

test('a selected building that reaches something shows its reach; nothing selected, or no reach, shows none', () => {
  const s = game();
  applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 5, y: 5 });
  applyCommand(s, 0, { c: 'place', k: 'crate', x: 8, y: 5 });
  applyCommand(s, 0, { c: 'place', k: 'belt', x: 9, y: 5, d: 0 });
  assert.equal(selectedReach(s, {}), null);
  assert.equal(selectedReach(s, { selected: null }), null);
  assert.equal(selectedReach(s, { selected: { x: 6, y: 6 } }), null, 'bare floor');
  assert.equal(selectedReach(s, { selected: { x: 8, y: 5 } }), null, 'a crate reaches nothing');
  assert.equal(selectedReach(s, { selected: { x: 9, y: 5 } }), null, 'nor does a belt');
  assert.equal(selectedReach(s, { selected: { x: -1, y: 5 } }), null, 'off the map');
  const r = selectedReach(s, { selected: { x: 5, y: 5 } });
  assert.equal(r.ai, at(s, 5, 5));
  assert.equal(r.b.k, 'sprinkler');
  assert.equal(r.next, false, 'pointing at nothing: the current reach only');
});

test('pointing at Range adds the next reach; pointing at any other track does not; a maxed Range has none', () => {
  const s = game();
  applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 5, y: 5 });
  const sel = { x: 5, y: 5 };
  assert.equal(selectedReach(s, { selected: sel, track: 'rng' }).next, true);
  for (const t of ['dmg', 'spd', 'dur', undefined]) assert.equal(selectedReach(s, { selected: sel, track: t }).next, false, String(t));
  // Only the range track changes what a building reaches.
  const b = s.grid[at(s, 5, 5)];
  const reach = statsOf(b, s).range;
  for (const t of ['dmg', 'spd', 'dur']) applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5, t });
  assert.equal(statsOf(b, s).range, reach);
  // Buy Range up to the top: the next reach is offered until the last level, then not.
  const top = maxIn('sprinkler', 'rng');
  for (let lv = 0; lv < top; lv++) {
    assert.equal(selectedReach(s, { selected: sel, track: 'rng' }).next, true, `level ${lv}`);
    assert.equal(applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5, t: 'rng' }).ok, true);
  }
  assert.ok(statsOf(b, s).range > reach, 'the reach grew');
  assert.equal(selectedReach(s, { selected: sel, track: 'rng' }).next, false, 'maxed');
  assert.ok(selectedReach(s, { selected: sel, track: 'rng' }), 'its current reach still shows');
});

test('a Barcode Laser picked by any of its tiles shows its beam from its anchor; other players\' and switched-off buildings show theirs', () => {
  const s = game();
  addPlayer(s, 'Steve');
  s.players[1].cash = 1e5;
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'railgun', x: 5, y: 8, d: 0 }).ok, true);
  const r = selectedReach(s, { selected: { x: 6, y: 8 }, track: 'rng' });
  assert.equal(r.ai, at(s, 5, 8), 'the anchor, whichever tile was picked');
  assert.equal(r.b.k, 'railgun');
  assert.equal(r.next, true);
  applyCommand(s, 1, { c: 'place', k: 'forklift', x: 12, y: 4 });
  const f = s.grid[at(s, 12, 4)];
  f.off = 90; // a dog has peed on it
  assert.equal(selectedReach(s, { selected: { x: 12, y: 4 } }).b, f);
});

test('the hover preview leaves the selected building to the selection, so its reach is drawn once', () => {
  const s = game();
  applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 5, y: 5 });
  const sel = selectedReach(s, { selected: { x: 5, y: 5 } });
  assert.equal(drawnBySelection(sel, at(s, 5, 5)), true);
  assert.equal(drawnBySelection(sel, at(s, 6, 5)), false);
  assert.equal(drawnBySelection(null, at(s, 5, 5)), false);
});
