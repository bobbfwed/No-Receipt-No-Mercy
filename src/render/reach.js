// What a selected building's reach looks like on the floor (0.3.02, the owner's request: "it
// should show the old range when clicked on a security building").
//
// While a building's sheet is open (src/ui/touch.js: clicked or tapped with nothing held), the
// interface passes it to the renderer as view.selected, and the renderer draws that building's
// current reach (statsOf: its stock of Extension Cord counts). (Until 0.4 it could also show the
// reach after one more bought Range level; bought upgrades are gone.)
//
// Pure (no canvas, no DOM) so the tests can ask it directly.
import { BUILD, statsOf } from '../sim/index.js';

/**
 * The reach to draw for the selected building, or null when there is none to draw: nothing
 * selected, the tile is empty, or the building reaches nothing (a Crate Stack).
 * @param {Object} s the game state
 * @param {{selected?: {x: number, y: number}|null}} view
 * @returns {{ai: number, b: Object}|null} the building's anchor tile and the building
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
  return { ai, b };
}

/**
 * Whether the hover preview should leave the reach of the building on anchor tile `ai` to the
 * selection, which already draws it: the same building, so it is drawn once, not twice.
 */
export function drawnBySelection(sel, ai) {
  return !!sel && sel.ai === ai;
}
