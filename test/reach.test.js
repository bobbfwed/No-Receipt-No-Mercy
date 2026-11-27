// Tests for what the floor shows of a selected building's reach (0.3.02): src/render/reach.js.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyCommand, statsOf, addStock, itemCode } from '../src/sim/index.js';
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
  applyCommand(s, 0, { c: 'place', k: 'wetfloor', x: 9, y: 5, d: 0 });
  assert.equal(selectedReach(s, {}), null);
  assert.equal(selectedReach(s, { selected: null }), null);
  assert.equal(selectedReach(s, { selected: { x: 6, y: 6 } }), null, 'bare floor');
  assert.equal(selectedReach(s, { selected: { x: 8, y: 5 } }), null, 'a crate reaches nothing');
  assert.equal(selectedReach(s, { selected: { x: 9, y: 5 } }), null, 'nor does a Wet Floor Sign (it acts on its own tile)');
  assert.equal(selectedReach(s, { selected: { x: -1, y: 5 } }), null, 'off the map');
  const r = selectedReach(s, { selected: { x: 5, y: 5 } });
  assert.equal(r.ai, at(s, 5, 5));
  assert.equal(r.b.k, 'sprinkler');
});

test('the reach shown is the one it works at: Extension Cord makes it bigger, the other supplies do not', () => {
  // (Until 0.4 pointing at a Range upgrade in the sheet also showed the reach after one more bought
  // level. Bought upgrades are gone; a building's reach comes from its stock.)
  const s = game();
  applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 5, y: 5 });
  const sel = { x: 5, y: 5 };
  const b = s.grid[at(s, 5, 5)];
  const reach = statsOf(b, s).range;
  // Bottled Spite, Rage Cola and Duct Tape (types 1, 2, 4) leave the reach alone.
  for (const type of [1, 2, 4]) addStock(b, itemCode(type, 4));
  assert.equal(selectedReach(s, { selected: sel }).b, b);
  assert.equal(statsOf(selectedReach(s, { selected: sel }).b, s).range, reach);
  addStock(b, itemCode(3, 2)); // Name Brand Extension Cord
  assert.ok(statsOf(selectedReach(s, { selected: sel }).b, s).range > reach, 'the reach grew');
});

test('a Barcode Laser picked by any of its tiles shows its beam from its anchor; other players\' and switched-off buildings show theirs', () => {
  const s = game();
  addPlayer(s, 'Steve');
  s.players[1].cash = 1e5;
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'railgun', x: 5, y: 8, d: 0 }).ok, true);
  const r = selectedReach(s, { selected: { x: 6, y: 8 } });
  assert.equal(r.ai, at(s, 5, 8), 'the anchor, whichever tile was picked');
  assert.equal(r.b.k, 'railgun');
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
