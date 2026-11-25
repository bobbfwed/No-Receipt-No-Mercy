// What a selected building's reach looks like on the floor (0.3.01, the owner's request: "When
// upgrading ranges, the interface should show the new range when mousing over the option.
// Otherwise, it should show the old range when clicked on a security building.").
//
// While a building's sheet is open (src/ui/touch.js: clicked or tapped with nothing held, or with
// the Upgrade tool), the interface passes it to the renderer as view.selected, and the upgrade
// button under the mouse (or with keyboard focus) as view.track. The renderer then always draws
// that building's current reach, and, while the Range button is pointed at and Range is not at
// its top, the reach after one more level on top of it. Only the range track changes what a
// building reaches (statsOf), so pointing at any other track changes nothing on the floor.
//
// Pure (no canvas, no DOM) so the tests can ask it directly.
import { BUILD, statsOf, levelIn, maxIn, tracksOf } from '../sim/index.js';

/**
 * The reach to draw for the selected building, or null when there is none to draw: nothing
 * selected, the tile is empty, or the building reaches nothing (a belt, a machine, a crate).
 * @param {Object} s the game state
 * @param {{selected?: {x: number, y: number}|null, track?: string}} view
 * @returns {{ai: number, b: Object, next: boolean}|null} the building's anchor tile, the building,
 *   and whether to draw the reach after one more Range level too
 */
export function selectedReach(s, view) {
  const t = view && view.selected;
  if (!s || !t || !(t.x >= 0 && t.y >= 0 && t.x < s.w && t.y < s.h)) return null;
  const i = t.y * s.w + t.x;
  const g = s.grid[i];
  if (!g) return null;
  const ai = g.part !== undefined ? g.part : i;
  const b = s.grid[ai];
  if (!b || !BUILD[b.k] || !(statsOf(b, s).range > 0)) return null;
  const next = view.track === 'rng' && tracksOf(b.k).includes('rng') && levelIn(b, 'rng') < maxIn(b.k, 'rng');
  return { ai, b, next };
}

/**
 * Whether the hover preview should leave the reach of the building on anchor tile `ai` to the
 * selection, which already draws it: the same building, so it is drawn once, not twice.
 */
export function drawnBySelection(sel, ai) {
  return !!sel && sel.ai === ai;
}
