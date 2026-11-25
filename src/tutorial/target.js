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

/** The building standing on (x, y) and the tile that holds it (its anchor), or null. */
function anchorAt(s, x, y) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
  const g = s.grid[y * s.w + x];
  if (!g) return null;
  const i = g.part !== undefined ? g.part : y * s.w + x;
  const b = s.grid[i];
  return b ? { b, x: i % s.w, y: (i / s.w) | 0 } : null;
}

/** The building standing on (x, y), by its anchor, or null. */
function buildingAt(s, x, y) {
  const a = anchorAt(s, x, y);
  return a ? a.b : null;
}

/**
 * How the building on a mark's tile is wrong for it: null if it is right (or nothing is there),
 * 'spin' if only its facing is wrong and its card's Rotate fixes that, 'remove' if it has to go
 * (another kind; or a building bigger than one tile that is in the wrong place, or lies the wrong
 * way across, which Rotate cannot fix: once built it only turns end for end).
 */
function wrongThere(a, m) {
  if (!a || !m.k) return null;
  const { b } = a;
  if (b.k !== m.k) return 'remove';
  const big = !!BUILD[b.k]?.size;
  if (big && (a.x !== m.x || a.y !== m.y)) return 'remove';
  if (m.d === undefined || !BUILD[b.k]?.rot || (b.d | 0) === m.d) return null;
  return big && (((b.d | 0) ^ m.d) & 1) ? 'remove' : 'spin';
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
    const here = anchorAt(s, m.x, m.y);
    const b = here && here.b;
    if (m.up && b && b.k === m.k) {
      // An upgrade: (with a mouse, the Upgrade tool first,) the building, then its sheet's button.
      if (same(selected, m)) return { kind: 'control', name: TRACK_CONTROL[m.up] || 'dmg' };
      // (With another building's sheet already open, a click on this one opens its sheet too.)
      if (!touch && tool !== 'upgrade' && !selected) return { kind: 'button', k: 'upgrade' };
      return { kind: 'tile', x: m.x, y: m.y };
    }
    // Belts: a line laid (or laid again: dragging belt over belts turns them) by one drag along
    // the tiles that still need one, with the Belt picked. Something else in the way is below.
    if (m.k === 'belt' && !(b && b.k !== 'belt') && !same(selected, m)) {
      if (tool !== 'belt') return { kind: 'button', k: 'belt' };
      const line = marks.filter((mk) => { const o = buildingAt(s, mk.x, mk.y); return mk.k === 'belt' && (!o || o.k === 'belt'); });
      if (line.length > 1) {
        const a = line[0], z = line[line.length - 1];
        return { kind: 'swipe', from: { x: a.x, y: a.y }, to: { x: z.x, y: z.y } };
      }
      return { kind: 'tile', x: m.x, y: m.y };
    }
    const wrong = wrongThere(here, m);
    if (wrong) {
      // Something else on the tile, or the right thing facing the wrong way: its sheet fixes it.
      // (The sheet that opens is the building's own, held by its anchor tile.)
      if (same(selected, here)) return { kind: 'control', name: wrong };
      if (tool && tool !== 'upgrade') {
        // Holding something, a tap or click on it would try to build there, not open its card:
        // put it down first (a finger with DROP; a mouse by clicking its button again, or Esc).
        // A mouse can remove the wrong thing straight away with a right-click.
        if (touch) return { kind: 'control', name: 'drop' };
        if (wrong === 'spin' && BUILD[tool]) return { kind: 'button', k: tool };
      }
      return { kind: 'tile', x: m.x, y: m.y };
    }
    if (!m.k || b) return { kind: 'tile', x: m.x, y: m.y };
    if (tool === m.k) return { kind: 'tile', x: m.x, y: m.y };
    // On a touch screen a building is dragged from the bar onto its tile (a line of belts, above,
    // is drawn on the floor once the Belt is picked, so the Belt is only tapped).
    if (touch && BUILD[m.k]) return { kind: 'drag', k: m.k, x: m.x, y: m.y };
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
