// Items that jump in The Back, drawn as gliding instead (0.4, stage 5b). Drawing only: the rules
// put an item joining a belt from the side straight at the middle of the belt, an Unpaid Intern's
// item straight from his hand to where it lands, and an item going into a Dumbwaiter or a Clearance
// Bin simply stops existing. For a few frames after each, the renderer draws the item on its way:
//   - from the feeding side's edge (or the intern's hand) to where it now rides on the belt;
//   - from the belt's end (or the hand) into the Dumbwaiter or Bin, shrinking and falling.
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
 * A pool of glide records. A record: { on, kind (0 onto a belt, 1 into a Dumbwaiter or Bin), tile,
 * code, pos (where on the belt it landed, for finding it again), x0, y0 (where it came from, world
 * pixels), x1, y1 (where a sink ends), t0 (game time it began, in ticks) }.
 */
export function createGlides(size = 48) {
  const pool = [];
  for (let k = 0; k < size; k++) pool.push({ on: false, kind: 0, tile: -1, code: 0, pos: 0, x0: 0, y0: 0, x1: 0, y1: 0, t0: 0 });
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
      return r;
    },
    /** Switches off every record finished by game time `t` (in ticks); also any from the future (a reload). */
    expire(t) {
      for (const r of pool) {
        if (!r.on) continue;
        const len = r.kind ? SINK_TICKS : GLIDE_TICKS;
        if (t - r.t0 >= len || t < r.t0 - 1) r.on = false;
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
  };
}

/** Eases a glide's progress (0 to 1): fast at first, settling into place. */
export const ease = (f) => (f >= 1 ? 1 : f <= 0 ? 0 : 1 - (1 - f) * (1 - f));

/** How far through its time a record is at game time t (ticks), 0 to 1. */
export const progress = (r, t) => Math.max(0, Math.min(1, (t - r.t0) / (r.kind ? SINK_TICKS : GLIDE_TICKS)));
