// Items that jump in The Back, drawn as gliding instead (0.4, stage 5b). Drawing only: the rules
// put an item joining a belt from the side straight at the middle of the belt, an Unpaid Intern's
// item straight from his hand to where it lands, and an item going into a Dumbwaiter or a Clearance
// Bin simply stops existing. For a few frames after each, the renderer draws the item on its way:
//   - from the feeding side's edge (or the intern's hand) to where it now rides on the belt;
//   - from the belt's end (or the hand) into the Dumbwaiter or Bin, shrinking and falling.
// And (0.4.01, the owner: things popped in and out of existence at the parts) through a part that
// hands an item on: off the belt's end into a Splitter, held there (kind 2), and out of it along a
// curve onto the way it went; out of a Returns Drop's chute or a machine's front onto a belt; off a
// belt's end into a machine or a Rebrander. Those glides move at about belt speed, linearly, and
// last as long as their path needs (len), so an item never lurches or vanishes.
// The detection compares each visible belt's items with the same belt a tick or two before
// (matchLane); the records are a small fixed pool reused for ever (createGlides), so nothing is
// allocated per frame. Everything here is pure (tested in Node).

/** How long a glide lasts, in ticks of game time (so it stands still while paused). */
export const GLIDE_TICKS = 4;
/** How long a drop into a Dumbwaiter or Bin lasts, in ticks. */
export const SINK_TICKS = 5;

/**
 * Compares a lane now with the same lane `dt` ticks earlier and reports what changed.
 * A lane is [code, pos, code, pos, ...], front item first; positions only grow while an item is on
 * the tile, by at most `step` a tick, and items never pass each other. An item of the new lane is
 * matched to the first unmatched old item of the same code that could have moved to where it is;
 * old items ahead of it that match nothing left by the front.
 * @param {ArrayLike<number>} prev the old lane's numbers, from index `off` (code, pos, ...)
 * @param {number} off where the old lane starts in `prev`
 * @param {number} prevN items in it
 * @param {ArrayLike<number>} now the lane now
 * @param {number} dt ticks between them (1 or more)
 * @param {number} step how far an item moves a tick
 * @param {Int32Array|number[]} out per item of `now`: 1 if it is new to this tile, else 0 (filled)
 * @returns {number} how many old items left by the front
 */
export function matchLane(prev, off, prevN, now, dt, step, out) {
  const n = now.length >> 1;
  const reach = step * dt + 1;
  let j = 0, left = 0, matchedAny = false;
  for (let k = 0; k < n; k++) {
    const code = now[2 * k], pos = now[2 * k + 1];
    // Old items further on than this one cannot be it: they left, or were matched already.
    while (j < prevN && prev[off + 2 * j + 1] > pos) { if (!matchedAny) left++; j++; }
    if (j < prevN && prev[off + 2 * j] === code && pos - prev[off + 2 * j + 1] <= reach) {
      out[k] = 0;
      matchedAny = true;
      j++;
    } else {
      out[k] = 1;
    }
  }
  // Whatever of the old lane is left over with nothing matched behind it also left by the front
  // (an emptied tile); old items between matches cannot leave (no item passes another).
  if (!matchedAny) left = prevN;
  return left;
}

/**
 * A pool of glide records. A record: { on, kind (0 onto a belt, 1 into a Dumbwaiter, Bin or
 * machine, 2 into a Splitter's hand), tile, code, pos (where on the belt it landed, for finding it
 * again), x0, y0 (where it came from, world pixels), x1, y1 (where a sink or a hold ends), t0 (game
 * time it began, in ticks), len (its length in ticks; 0 for the kind's own), cx, cy and curve (a
 * point it bends round, when curve is 1), lin (1: moves at an even speed rather than easing in),
 * late (1: drawn over the parts, as it is crossing one) }.
 */
export function createGlides(size = 48) {
  const pool = [];
  for (let k = 0; k < size; k++) pool.push({ on: false, kind: 0, tile: -1, code: 0, pos: 0, x0: 0, y0: 0, x1: 0, y1: 0, t0: 0, len: 0, cx: 0, cy: 0, curve: 0, lin: 0, late: 0 });
  let next = 0;
  return {
    pool,
    /**
     * A record to fill in, switched on: a free one, or when all are in use the oldest (the one
     * started longest ago), so a burst never allocates.
     */
    take(t0) {
      let r = null;
      for (let k = 0; k < size; k++) {
        const c = pool[(next + k) % size];
        if (!c.on) { r = c; next = (next + k + 1) % size; break; }
      }
      if (!r) {
        r = pool[0];
        for (const c of pool) if (c.t0 < r.t0) r = c;
      }
      r.on = true;
      r.t0 = t0;
      r.len = 0; r.curve = 0; r.lin = 0; r.late = 0;
      return r;
    },
    /** Switches off every record finished by game time `t` (in ticks); also any from the future (a reload). */
    expire(t) {
      for (const r of pool) {
        if (!r.on) continue;
        if (t - r.t0 >= lengthOf(r) || t < r.t0 - 1) r.on = false;
      }
    },
    /** Switches every record off (a new game or map). */
    clear() { for (const r of pool) r.on = false; },
    /**
     * The glide for an item of `code` on belt tile `tile` that is now at position `pos`, or null.
     * A record matches if its item could have moved from where it landed to `pos` in the time since.
     */
    find(tile, code, pos, t, step) {
      for (const r of pool) {
        if (!r.on || r.kind !== 0 || r.tile !== tile || r.code !== code) continue;
        if (pos >= r.pos - 1 && pos <= r.pos + step * (t - r.t0 + 1) + 1) return r;
      }
      return null;
    },
    /** The newest hold (kind 2) of item `code` into the part on tile `tile`, or null. */
    held(tile, code) {
      let best = null;
      for (const r of pool) if (r.on && r.kind === 2 && r.tile === tile && r.code === code && (!best || r.t0 > best.t0)) best = r;
      return best;
    },
  };
}

/** Eases a glide's progress (0 to 1): fast at first, settling into place. */
export const ease = (f) => (f >= 1 ? 1 : f <= 0 ? 0 : 1 - (1 - f) * (1 - f));

/** A record's length in ticks: its own, or its kind's. */
export const lengthOf = (r) => r.len || (r.kind === 1 ? SINK_TICKS : GLIDE_TICKS);

/** How far through its time a record is at game time t (ticks), 0 to 1. */
export const progress = (r, t) => Math.max(0, Math.min(1, (t - r.t0) / lengthOf(r)));

/**
 * Where a glide record puts its item at progress u (0 to 1), heading for (x1, y1): from (x0, y0),
 * round (cx, cy) when it has a curve (a quadratic curve), at an even pace or easing in. Into out
 * (a 2-number array, reused), so nothing is allocated per frame.
 */
export function glidePoint(r, u, x1, y1, out) {
  const e = r.lin ? Math.max(0, Math.min(1, u)) : ease(u), k = 1 - e;
  if (r.curve) {
    out[0] = k * k * r.x0 + 2 * k * e * r.cx + e * e * x1;
    out[1] = k * k * r.y0 + 2 * k * e * r.cy + e * e * y1;
  } else {
    out[0] = r.x0 + (x1 - r.x0) * e;
    out[1] = r.y0 + (y1 - r.y0) * e;
  }
  return out;
}
