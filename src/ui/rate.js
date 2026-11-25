// Income per minute (0.3.03, the owner's request): how much the factory has been earning lately,
// from the running total of goods sold (state.sales). The interface feeds it a sample whenever a
// frame shows the game; it keeps one a second of game time and reads the rate across the last
// minute. No DOM here, so the tests run it in plain Node; the panel is src/ui/income.js.
//
// Game time, not the wall clock: everything is counted in simulation ticks, so the figure is the
// same at any game speed, stands still while the game is paused (no new ticks, no new samples),
// and means "per minute at normal speed".
import { TICK_HZ } from '../sim/index.js';

/** Seconds of game time the figure is averaged over. */
export const RATE_SECS = 60;
/** Seconds of history needed before there is a figure at all (until then the panel shows a dash). */
export const RATE_MIN_SECS = 10;
/** A trend mark needs the rate to have moved by this share against the minute before... */
export const TREND_SHARE = 0.05;
/** ...and by at least this many dollars a minute (so $3 against $2 is not "up"). */
export const TREND_DOLLARS = 10;

/**
 * Makes an empty history.
 * @returns {{
 *   push: (tick: number, total: number) => void,
 *   read: () => null | { store: number, secs: number, trend: -1|0|1|null },
 *   clear: () => void,
 *   size: () => number,
 * }}
 *   push(tick, total): the game's clock (state.tick) and the store's running total of goods sold
 *     (state.sales). Kept at most once a second of game time.
 *   read(): the store's dollars a minute across the last minute (or across what there is, from
 *     RATE_MIN_SECS on; `secs` says how much), and the trend against the minute before that (1 up,
 *     -1 down, 0 about the same, null while there is not two minutes of history). null while there
 *     is less than RATE_MIN_SECS of history.
 */
export function createRate() {
  /** Oldest first: { t: tick, store: total }. */
  let samples = [];
  const every = TICK_HZ, keep = 2 * RATE_SECS * TICK_HZ;

  function push(tick, total) {
    if (!Number.isFinite(tick) || !Number.isFinite(total)) return;
    // The clock went back (a new game, back to the lobby, an older copy of the game): the
    // samples from "after" now belong to another game, or to a future that did not happen.
    while (samples.length && samples[samples.length - 1].t > tick) samples.pop();
    let last = samples[samples.length - 1];
    // The total went down (a new game, a loaded save): what came before says nothing about now.
    if (last && total < last.store) { samples = []; last = undefined; }
    if (last && tick - last.t < every) return;
    samples.push({ t: tick, store: total });
    while (samples.length > 2 && samples[1].t <= tick - keep) samples.shift();
  }

  /** The oldest sample no further back than `span` ticks before tick `t`. */
  function from(t, span) {
    for (const p of samples) if (p.t >= t - span) return p;
    return samples[samples.length - 1];
  }

  function read() {
    const last = samples[samples.length - 1];
    if (!last) return null;
    const win = RATE_SECS * TICK_HZ;
    const first = from(last.t, win);
    const span = last.t - first.t;
    if (span < RATE_MIN_SECS * TICK_HZ) return null;
    const store = ((last.store - first.store) * 60 * TICK_HZ) / span;
    // The trend: this minute against the one before, only once both are whole minutes (give or
    // take the second between samples).
    let trend = null;
    if (span > win - TICK_HZ - 0.5) {
      const before = from(first.t, win);
      const span2 = first.t - before.t;
      if (span2 > win - TICK_HZ - 0.5) {
        const prev = ((first.store - before.store) * 60 * TICK_HZ) / span2;
        const d = store - prev;
        trend = Math.abs(d) < Math.max(TREND_DOLLARS, TREND_SHARE * Math.max(prev, store)) ? 0 : d > 0 ? 1 : -1;
      }
    }
    return { store, secs: span / TICK_HZ, trend };
  }

  return { push, read, clear: () => { samples = []; }, size: () => samples.length };
}

/**
 * How the store's income is divided right now: between `ways` players, `each` dollars a minute
 * apiece. The same count earn() uses (shareCount): the connected store players, never Head Office,
 * and not a player who has left.
 */
export function splitOf(perMin, ways) {
  const n = Math.max(1, ways | 0);
  return { ways: n, each: perMin / n };
}
