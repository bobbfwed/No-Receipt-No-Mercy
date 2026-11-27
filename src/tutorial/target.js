// The training shift's arrow (0.3.03): what the player must press next, worked out from what the
// lesson already knows (its marks, what they want built, whether it has shoppers waiting). No DOM
// here, so a test can check every lesson in every state; src/ui/pointer.js finds the thing on
// screen and draws the arrow.
//
// A mark (see lessons.js) may say what it wants:
//   k     the building or part wanted on the tile (its bar button is pressed first)
//   d     the way it must face
//   f     1: the tile is in The Back (0.4); the arrow sends the player there first
//   fix   'rebuild': wreckage that the Rebuild button puts back
//   del   the part on the tile is to be taken out (a right-click; the Remove tool on a finger)
//   wd    the wire direction the building there should have (the Wire tool)
//   r     the reinforcement the Crate Stack there should have (the Reinforce tool)
//   act   'more': the Returns Drop's MORE JUNK button, on its card
//
// The answer is one of:
//   { kind: 'none', why }             nothing to press: 'watch' (a wave is on), 'wait' (nothing
//                                     to do yet), 'advancing' (the panel says done)
//   { kind: 'button', k }             a build-bar button (a building or part, or a tool:
//                                     'rebuild', 'remove', 'wire', 'reinforce')
//   { kind: 'drag', k, x, y }         touch screens: drag that button onto tile (x, y)
//   { kind: 'tile', x, y }            a floor tile
//   { kind: 'swipe', from, to }       a drag along tiles, from {x, y} to {x, y}: a wall of Crate
//                                     Stacks with a mouse, a line of belts with either
//   { kind: 'control', name }         one of CONTROLS: a named button somewhere else on screen
import { BUILD } from '../sim/index.js';

/**
 * The named controls an arrow can point at (src/ui/pointer.js knows where each is on screen):
 *   next     the lesson panel's Next button          play    its "Play a real game" button
 *   doors    OPEN THE DOORS in the top bar           drop    DROP at the end of a phone's bar
 *   spin     a building sheet's Rotate button         remove  the sheet's Remove button
 *   floor    the floor switch (Tab: the shop or The Back, 0.4)
 *   more     a Returns Drop's MORE JUNK button, on its card (0.4)
 */
export const CONTROLS = ['next', 'play', 'doors', 'drop', 'spin', 'remove', 'floor', 'more'];

const NONE = (why) => ({ kind: 'none', why });
const STEP = [[1, 0], [0, 1], [-1, 0], [0, -1]];

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

/** The part in The Back on (x, y), or null. */
function partAt(s, x, y) {
  if (!s.back || x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
  return s.back[y * s.w + x] || null;
}

/** The tool a mark wants held: its building or part, or a tool. */
function toolFor(m) {
  if (m.fix === 'rebuild') return 'rebuild';
  if (m.wd !== undefined) return 'wire';
  if (m.r !== undefined) return 'reinforce';
  if (m.del) return 'remove';
  return m.k || null;
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
 * The marks wanting building k on empty tiles, if there are several and they lie along one row or
 * column with nothing between the first and the last but more of them and k already in place (a
 * drag skips a tile that is built on): { from, to }. Otherwise null.
 */
function lineOf(s, marks, k) {
  const empty = marks.filter((mk) => mk.k === k && !mk.fix && !mk.f && !buildingAt(s, mk.x, mk.y));
  if (empty.length < 2) return null;
  const a = empty[0], z = empty[empty.length - 1];
  if (a.x !== z.x && a.y !== z.y) return null;
  const steps = Math.abs(z.x - a.x) + Math.abs(z.y - a.y);
  const dx = Math.sign(z.x - a.x), dy = Math.sign(z.y - a.y);
  for (let n = 1; n < steps; n++) {
    const x = a.x + dx * n, y = a.y + dy * n;
    if (!empty.some((mk) => mk.x === x && mk.y === y) && buildingAt(s, x, y)?.k !== k) return null;
  }
  return { from: { x: a.x, y: a.y }, to: { x: z.x, y: z.y } };
}

/**
 * A run of belts in The Back (0.4): from the mark m, the marks after it in the list that carry on
 * the same way it faces, one tile at a time. A drag lays a belt facing the way it goes, so one
 * drag from the first tile onto the tile past the last lays the whole run (and turns any belt on
 * it the wrong way); the tile past the last is what the run feeds, which the drag leaves alone
 * when something stands there. { from, to }.
 */
function beltRun(s, marks, m) {
  const d = m.d | 0, [dx, dy] = STEP[d];
  let last = m;
  for (let n = marks.indexOf(m) + 1; n < marks.length; n++) {
    const q = marks[n];
    if (q.k !== 'conv' || !q.f || (q.d | 0) !== d || q.x !== last.x + dx || q.y !== last.y + dy) break;
    last = q;
  }
  const tx = Math.max(0, Math.min(s.w - 1, last.x + dx)), ty = Math.max(0, Math.min(s.h - 1, last.y + dy));
  return { from: { x: m.x, y: m.y }, to: { x: tx, y: ty } };
}

/**
 * What the arrow points at.
 * @param {Object} st      the lesson (an entry of STEPS)
 * @param {Object} s       the game state
 * @param {Array} marks    the lesson's marks right now (tut.marks(): both floors)
 * @param {Object} ui
 * @param {string|null} ui.tool     the tool held
 * @param {{x,y}|null} ui.selected  the building whose sheet is open (its anchor tile), or null
 *   (a mouse opens a sheet too: a click on a building with nothing held)
 * @param {boolean} ui.touch        a touch screen (drag from the bar; no keys)
 * @param {number} ui.floor         the floor looked at: 0 the shop, 1 The Back (0.4)
 */
export function arrowTarget(st, s, marks, { tool = null, selected = null, touch = false, floor = 0 } = {}) {
  if (!st || !s) return NONE('wait');
  if (st.manual) return { kind: 'control', name: st.last ? 'play' : 'next' };
  if (marks && marks.length) {
    const here0 = (mk) => ((mk.f | 0) === (floor | 0));
    const free = (mk) => (mk.f ? !partAt(s, mk.x, mk.y) : !buildingAt(s, mk.x, mk.y)) && !mk.fix;
    // Holding the right thing for one of the tiles on this floor: that tile. Otherwise the first.
    const m = marks.find((mk) => here0(mk) && toolFor(mk) && toolFor(mk) === tool && (free(mk) || mk.wd !== undefined || mk.r !== undefined || mk.del))
      || marks[0];
    // The tile is on the other floor: the floor switch first (0.4).
    if (!here0(m)) return { kind: 'control', name: 'floor' };
    if (m.fix === 'rebuild') return { kind: 'button', k: 'rebuild' };
    // The shop floor's tools (0.4): the Wire tool on a building, the Reinforce tool on a crate.
    if (m.wd !== undefined || m.r !== undefined) {
      const want = toolFor(m);
      if (buildingAt(s, m.x, m.y)?.k === m.k) return tool === want ? { kind: 'tile', x: m.x, y: m.y } : { kind: 'button', k: want };
    }
    // A Returns Drop's card (0.4): open it (a click with nothing held), then MORE JUNK.
    if (m.act === 'more') {
      if (same(selected, m)) return { kind: 'control', name: 'more' };
      if (tool) return touch ? { kind: 'control', name: 'drop' } : { kind: 'button', k: tool };
      return { kind: 'tile', x: m.x, y: m.y };
    }
    if (m.f) return backTarget(s, marks, m, tool, touch);
    const here = anchorAt(s, m.x, m.y);
    const b = here && here.b;
    // A line of one-tile buildings (the wall of Crate Stacks): with a mouse, one drag along it lays
    // them all, since a drag places one on every tile it crosses. A finger places one at a time.
    if (!touch && tool === m.k && !b) {
      const line = lineOf(s, marks, m.k);
      if (line) return { kind: 'swipe', ...line };
    }
    const wrong = wrongThere(here, m);
    if (wrong) {
      // Something else on the tile, or the right thing facing the wrong way: its sheet fixes it.
      // (The sheet that opens is the building's own, held by its anchor tile.)
      if (same(selected, here)) return { kind: 'control', name: wrong };
      if (tool) {
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
    // On a touch screen a building is dragged from the bar onto its tile. One that must face
    // another way than the right is picked first instead, so the rotate button at the end of the
    // bar can turn it before it goes down (the lesson says so; a big one only turns end for end
    // once built).
    if (touch && BUILD[m.k] && !(BUILD[m.k].rot && (m.d | 0) !== 0)) return { kind: 'drag', k: m.k, x: m.x, y: m.y };
    return { kind: 'button', k: m.k };
  }
  // Nothing marked: the floor the lesson wants looked at, then the doors if it has shoppers waiting.
  const want = typeof st.view === 'function' ? st.view(s) : st.view;
  if (want !== undefined && (want | 0) !== (floor | 0)) return { kind: 'control', name: 'floor' };
  if (s.phase === 'wave') return NONE('watch');
  if (st.wave && s.nextWave && s.phase === 'build' && (!st.doors || st.doors(s))) return { kind: 'control', name: 'doors' };
  return NONE('wait');
}

/**
 * A mark in The Back (0.4), with the player looking at The Back. Its parts have no card: a wrong
 * one is taken out with a right-click (a finger: the Remove tool, then the part), or turned with R
 * with the mouse over it, nothing held (the lesson's hint says so).
 */
function backTarget(s, marks, m, tool, touch) {
  const p = partAt(s, m.x, m.y);
  // Taking it out: a right-click on it, or a finger with the Remove tool.
  const takeOut = () => (touch && tool !== 'remove' ? { kind: 'button', k: 'remove' } : { kind: 'tile', x: m.x, y: m.y });
  if (m.del) return takeOut();
  if (!m.k) return { kind: 'tile', x: m.x, y: m.y }; // (only pointed out: the Returns Drop)
  if (p && p.k !== m.k && !(m.k === 'conv' && p.k === 'conv')) return takeOut();
  if (m.k === 'conv') {
    // A belt the wrong way round is laid over again (free); so is an empty tile: a drag along the run.
    if (tool !== 'conv') return { kind: 'button', k: 'conv' };
    return { kind: 'swipe', ...beltRun(s, marks, m) };
  }
  if (p) {
    // The right part facing the wrong way: R with the mouse over it, or take it out and place again.
    return touch ? takeOut() : { kind: 'tile', x: m.x, y: m.y };
  }
  if (tool === m.k) return { kind: 'tile', x: m.x, y: m.y };
  if (touch && BUILD[m.k] && !(BUILD[m.k].rot && (m.d | 0) !== 0)) return { kind: 'drag', k: m.k, x: m.x, y: m.y };
  return { kind: 'button', k: m.k };
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
