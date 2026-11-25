// The training shift's arrow (0.3.03): what the player must press next, worked out from what the
// lesson already knows (its marks, what they want built, whether it has shoppers waiting). No DOM
// here, so a test can check every lesson in every state; src/ui/pointer.js finds the thing on
// screen and draws the arrow.
//
// A mark (see lessons.js) may say what it wants:
//   k     the building wanted on the tile (its bar button is pressed first)
//   d     the way it must face
//   up    the upgrade track wanted for the building already there ('dmg')
//   fix   'rebuild': wreckage that the Rebuild button puts back
//
// The answer is one of:
//   { kind: 'none', why }             nothing to press: 'watch' (a wave is on), 'wait' (the
//                                     factory is working), 'advancing' (the panel says done)
//   { kind: 'button', k }             a build-bar button (a building, 'upgrade' or 'rebuild')
//   { kind: 'drag', k, x, y }         touch screens: drag that button onto tile (x, y)
//   { kind: 'tile', x, y }            a floor tile
//   { kind: 'swipe', from, to }       drag along tiles, from {x, y} to {x, y} (a line of belts)
//   { kind: 'control', name }         one of CONTROLS: a named button somewhere else on screen
import { BUILD } from '../sim/index.js';

/**
 * The named controls an arrow can point at (src/ui/pointer.js knows where each is on screen):
 *   next     the lesson panel's Next button          play    its "Play a real game" button
 *   doors    OPEN THE DOORS in the top bar           drop    DROP at the end of a phone's bar
 *   dmg      the Damage button in a building's sheet spin    the sheet's Rotate button
 *   remove   the sheet's Remove button
 */
export const CONTROLS = ['next', 'play', 'doors', 'drop', 'dmg', 'spin', 'remove'];

/** Track names a mark's `up` may have, and the sheet button for each. */
const TRACK_CONTROL = { dmg: 'dmg' };

const NONE = (why) => ({ kind: 'none', why });

/** The building standing on (x, y), by its anchor, or null. */
function buildingAt(s, x, y) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
  const g = s.grid[y * s.w + x];
  if (!g) return null;
  return g.part !== undefined ? s.grid[g.part] || null : g;
}

/** True when the building on a mark's tile is not what the mark wants (wrong kind or facing). */
function wrongThere(b, m) {
  if (!b || !m.k) return false;
  if (b.k !== m.k) return true;
  return m.d !== undefined && !!BUILD[b.k]?.rot && (b.d | 0) !== m.d;
}

const same = (t, m) => !!t && t.x === m.x && t.y === m.y;

/**
 * What the arrow points at.
 * @param {Object} st      the lesson (an entry of STEPS)
 * @param {Object} s       the game state
 * @param {Array} marks    the lesson's marks right now (tut.marks())
 * @param {Object} ui
 * @param {string|null} ui.tool     the tool held
 * @param {{x,y}|null} ui.selected  the building whose sheet is open (its anchor tile), or null
 *   (a mouse opens a sheet too: a click on a building with nothing or the Upgrade tool held)
 * @param {boolean} ui.touch        a touch screen (drag from the bar; no keys)
 */
export function arrowTarget(st, s, marks, { tool = null, selected = null, touch = false } = {}) {
  if (!st || !s) return NONE('wait');
  if (st.manual) return { kind: 'control', name: st.last ? 'play' : 'next' };
  if (marks && marks.length) {
    const free = (m) => !buildingAt(s, m.x, m.y) && !m.up && !m.fix;
    // Holding the right thing for one of the tiles: that tile. Otherwise the first tile listed.
    const m = marks.find((mk) => mk.k && mk.k === tool && free(mk)) || marks[0];
    if (m.fix === 'rebuild') return { kind: 'button', k: 'rebuild' };
    const b = buildingAt(s, m.x, m.y);
    if (m.up && b && b.k === m.k) {
      // An upgrade: (with a mouse, the Upgrade tool first,) the building, then its sheet's button.
      if (same(selected, m)) return { kind: 'control', name: TRACK_CONTROL[m.up] || 'dmg' };
      // (With another building's sheet already open, a click on this one opens its sheet too.)
      if (!touch && tool !== 'upgrade' && !selected) return { kind: 'button', k: 'upgrade' };
      return { kind: 'tile', x: m.x, y: m.y };
    }
    if (wrongThere(b, m)) {
      // Something else on the tile, or the right thing facing the wrong way: its sheet fixes it.
      if (same(selected, m)) return { kind: 'control', name: b.k !== m.k ? 'remove' : 'spin' };
      // A finger holding a tool would try to build on it, not open it: put the tool down first.
      if (touch && tool && tool !== 'upgrade') return { kind: 'control', name: 'drop' };
      return { kind: 'tile', x: m.x, y: m.y };
    }
    if (!m.k || b) return { kind: 'tile', x: m.x, y: m.y };
    if (tool === m.k) {
      // A line of belts: drag along what is left of it.
      const line = m.k === 'belt' ? marks.filter((mk) => mk.k === 'belt' && free(mk)) : [];
      if (line.length > 1) {
        const a = line[0], z = line[line.length - 1];
        return { kind: 'swipe', from: { x: a.x, y: a.y }, to: { x: z.x, y: z.y } };
      }
      return { kind: 'tile', x: m.x, y: m.y };
    }
    // On a touch screen a building is dragged from the bar onto its tile; a line of belts is
    // drawn on the floor once the Belt is picked, so the Belt is only tapped.
    if (touch && BUILD[m.k] && m.k !== 'belt') return { kind: 'drag', k: m.k, x: m.x, y: m.y };
    return { kind: 'button', k: m.k };
  }
  if (s.phase === 'wave') return NONE('watch');
  if (st.wave && s.nextWave && s.phase === 'build') return { kind: 'control', name: 'doors' };
  return NONE('wait');
}

/** A short, stable key for a target, to tell when it has changed. */
export function targetKey(t) {
  if (!t) return 'none';
  switch (t.kind) {
    case 'button': return `button:${t.k}`;
    case 'drag': return `drag:${t.k}:${t.x},${t.y}`;
    case 'tile': return `tile:${t.x},${t.y}`;
    case 'swipe': return `swipe:${t.from.x},${t.from.y}:${t.to.x},${t.to.y}`;
    case 'control': return `control:${t.name}`;
    default: return 'none';
  }
}
