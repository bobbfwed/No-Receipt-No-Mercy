// The Wire and Reinforce tools (0.4, stage 4b): the rules of the gestures, with no DOM, so the
// tests read them. input.js turns pointer events into these calls; touch.js uses the picker.
//
// Directions are the store's (DIRS in constants.js): 0 east, 1 south, 2 west, 3 north; -1 is no
// wire. A wire's direction is the store's, not the building's, so north is up the screen whichever
// way the building faces.
import { BUILD, canWire, canReinforce, reinforceCost, anchorOf, carriesWire, sizeOf } from '../sim/index.js';

/** What a plain click with the Wire tool steps through: north, east, south, west, none. */
export const WIRE_CYCLE = [3, 0, 1, 2, -1];
/** The directions' names and arrows, by direction (index 4: none). */
const NAMES = ['east', 'south', 'west', 'north', 'none'];
const ARROWS = ['→', '↓', '←', '↑', '✕'];
export const wireName = (d) => NAMES[d >= 0 && d <= 3 ? d : 4];
export const wireArrow = (d) => ARROWS[d >= 0 && d <= 3 ? d : 4];
/** The Wire and Reinforce tools' hotkeys (Z, as in raZor wire; U, as the old Upgrade tool had). */
export const WIRE_KEY = 'z';
export const REINFORCE_KEY = 'u';

/**
 * The direction a plain click gives a building whose wire runs `cur` (undefined or -1 for none):
 * the next in WIRE_CYCLE that `allowed(d)` accepts. No wire is always allowed, so a wire that every
 * direction would refuse comes off on the next click.
 */
export function nextWireDir(cur, allowed = () => true) {
  const from = WIRE_CYCLE.indexOf(cur >= 0 && cur <= 3 ? cur : -1);
  for (let n = 1; n <= WIRE_CYCLE.length; n++) {
    const d = WIRE_CYCLE[(from + n) % WIRE_CYCLE.length];
    if (d < 0 || allowed(d)) return d;
  }
  return -1;
}

/** How far past a building's edge, in tiles, a drag must go before it means a direction. */
export const DRAG_DEAD = 0.3;

/**
 * The wire direction a drag from a building means, the pointer being at (px, py) in tiles (with
 * decimals): the side of the building it has gone furthest past, or null while it is still on the
 * building (or within DRAG_DEAD of its edge). `rect` is the building's footprint in tiles.
 */
export function dragDir(rect, px, py, dead = DRAG_DEAD) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const dx = px - cx, dy = py - cy;
  const ox = Math.abs(dx) - rect.w / 2, oy = Math.abs(dy) - rect.h / 2;
  if (ox < dead && oy < dead) return null;
  if (ox >= oy) return dx > 0 ? 0 : 2;
  return dy > 0 ? 1 : 3;
}

/**
 * The building that can carry wire on tile (x, y): { ai, b, rect } with its footprint in tiles, or
 * null (no building there, or one with no Dumbwaiter, such as a Crate Stack).
 */
export function wireBuilding(s, x, y) {
  if (!s || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
  const ai = anchorOf(s, y * s.w + x), b = s.grid[ai];
  if (!b || !carriesWire(b.k)) return null;
  const [w, h] = sizeOf(b.k, BUILD[b.k].rot ? b.d | 0 : 0);
  return { ai, b, rect: { x: ai % s.w, y: (ai / s.w) | 0, w, h } };
}

/** What a plain click with the Wire tool on tile (x, y) sends: the next allowed direction. */
export function clickWireDir(s, pid, x, y) {
  const wb = wireBuilding(s, x, y);
  if (!wb) return 3; // the rules refuse it, and DEB says why
  return nextWireDir(wb.b.wd, (d) => canWire(s, pid, x, y, d) === null);
}

/**
 * The sheet's wire picker for the building on (x, y): one entry per choice, in the order shown
 * (north, east, south, west, none): { d, name, arrow, on (it is the wire's direction now), why (the
 * rules' refusal reason, or null) }. Null if nothing there carries wire.
 */
export function wirePicker(s, pid, x, y) {
  const wb = wireBuilding(s, x, y);
  if (!wb) return null;
  const cur = wb.b.wd === undefined ? -1 : wb.b.wd;
  return WIRE_CYCLE.map((d) => ({ d, name: wireName(d), arrow: wireArrow(d), on: d === cur, why: canWire(s, pid, x, y, d) }));
}

/**
 * A drag of the Reinforce tool across crates: one level for each Crate Stack it crosses (once each),
 * the first tile always sent (so a refusal is explained), the rest only while the money lasts. It
 * keeps its own count of the cash, since a joined player's copy of the game does not see his money
 * go until the host's word comes back.
 *   const r = startReinforce(cash)
 *   r.at(s, pid, x, y) -> a command to send, or null (skip quietly); r.stopped once the money is gone
 */
export function startReinforce(cash) {
  const done = new Set();
  let left = cash, first = true, stopped = false;
  return {
    get stopped() { return stopped; },
    at(s, pid, x, y) {
      if (stopped || !s || x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
      const ai = anchorOf(s, y * s.w + x);
      if (done.has(ai)) return null;
      done.add(ai);
      const b = s.grid[ai];
      const cost = b ? reinforceCost(b, s) : 0;
      const why = canReinforce(s, pid, x, y);
      if (first) {
        first = false;
        if (!why) left -= cost;
        return { c: 'reinforce', x, y };
      }
      if (!b || b.k !== 'crate' || !cost) return null; // not a crate, or already at the top: quietly
      if (cost > left || why === 'cash') { stopped = true; return null; }
      if (why) return null;
      left -= cost;
      return { c: 'reinforce', x, y };
    },
  };
}
