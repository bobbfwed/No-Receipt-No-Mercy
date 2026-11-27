// Painting sprites without stalling a frame (0.4, stage 5b). The stutter investigation
// (.claude/reports/2026-11-26-stutter-investigation.md) found two causes of long frames on a slow
// phone: every sprite cache was emptied when the zoom crossed a resolution step (565 canvases and a
// 131 ms frame), and a kind's pictures were painted the first time one was seen (180 to 320 canvases
// in each of events 11 to 16, when the super shoppers first come). Three pieces fix that, all pure
// (no DOM, the clock passed in), so Node tests run them:
//   createPaintBudget  how many milliseconds of painting a frame may spend
//   createSpriteCache  a cache that, on a new resolution, keeps the old pictures to draw scaled
//                      while the new ones are painted a few a frame, the ones on screen first
//   createPrepaint     a queue of pictures to paint ahead of need, a few a frame, in order
//
// A cache's user does:
//   let c = cache.have(key);           // this resolution's picture, or the old one while the
//   if (!c) {                          //   budget is spent (null: paint it now)
//     budget.begin(); c = paint(...); budget.end();
//     cache.put(key, c, args);         // args: what repaint(args) needs to paint it again
//   }
import { waveSpec, shareCount } from '../sim/index.js';

/**
 * @param {Object} [o]
 * @param {number} [o.ms] milliseconds of painting allowed a frame
 * @param {() => number} [o.clock] milliseconds now (performance.now in a browser)
 */
export function createPaintBudget({ ms = 3, clock = () => performance.now() } = {}) {
  let spent = 0, t0 = 0, depth = 0, painted = 0;
  return {
    ms,
    /** A new frame: nothing spent yet. */
    frame() { spent = 0; painted = 0; },
    /** True while this frame may paint another picture by choice (not one it has to). */
    ok() { return spent < this.ms; },
    /** Around each painting (nested calls count once). */
    begin() { if (depth++ === 0) t0 = clock(); },
    end() { if (--depth === 0) { spent += clock() - t0; painted++; } },
    get spent() { return spent; },
    get painted() { return painted; },
  };
}

/**
 * A sprite cache that survives a change of resolution. `repaint(args)` paints a picture again from
 * the args it was put with (null: this cache's pictures cannot be painted out of their context, and
 * old ones are only replaced as they are drawn).
 */
export function createSpriteCache(budget, repaint = null) {
  let map = new Map();
  /** The pictures at earlier resolutions, key -> { c, args }, kept to draw scaled meanwhile. */
  let old = null;
  /** Keys of `old` still to be painted again when there is time, in the order they were used. */
  let redo = [];
  let fell = 0; // old pictures drawn this frame
  const cache = {
    /** The number of pictures at this resolution. */
    get size() { return map.size; },
    /** True while pictures from an earlier resolution are still in use. */
    get stale() { return old !== null; },
    /** The picture for key at this resolution, or (budget spent) an older one, or null. */
    have(key) {
      const e = map.get(key);
      if (e) return e.c;
      if (old && !budget.ok()) {
        const o = old.get(key);
        if (o) { fell++; return o.c; }
      }
      return null;
    },
    /** True if the key has a picture at this resolution. */
    has(key) { return map.has(key); },
    put(key, c, args = null) { map.set(key, { c, args }); },
    /**
     * A new resolution: what was painted becomes the old pictures (merged over any still kept from
     * an earlier change, so a pinch across several steps keeps the latest of each).
     */
    rescale() {
      if (!map.size) return;
      if (!old) old = new Map();
      for (const [k, e] of map) old.set(k, e);
      map = new Map();
      redo = repaint ? [...old.keys()] : [];
    },
    /** Throws everything away (a cache that grew too big). */
    clear() { map.clear(); old = null; redo = []; },
    /**
     * After the frame's drawing: paints old pictures again while the budget lasts, and lets the
     * old ones go once none is needed (all repainted, or none drawn this frame and nothing to redo).
     */
    idle() {
      if (!old) { fell = 0; return; }
      while (redo.length && budget.ok()) {
        const k = redo.pop();
        if (map.has(k)) continue;
        const o = old.get(k);
        if (!o) continue;
        budget.begin();
        const c = repaint(o.args);
        budget.end();
        map.set(k, { c, args: o.args });
      }
      if (!redo.length && fell === 0) old = null;
      fell = 0;
    },
    /** Paints key ahead of need, if it is missing (the prepaint queue's job). @returns true if it painted */
    warm(key, args) {
      if (map.has(key) || !repaint) return false;
      budget.begin();
      const c = repaint(args);
      budget.end();
      map.set(key, { c, args });
      return true;
    },
  };
  return cache;
}

/**
 * The kinds of shopper the next sales event brings, as the rules will make it up (waveSpec for the
 * next event and the players sharing the store; in the training shift, the wave a lesson has queued),
 * in the order their groups start arriving, each kind once, with `sup` true for a kind whose super
 * version comes too (listed after the ordinary one). The boss is left out (painted as he is seen),
 * and so is a Head Office plan (it can only hold kinds the automatic waves have brought already).
 * @returns {{k: string, sup: boolean}[]}
 */
export function comingKinds(state) {
  const groups = state.training ? state.nextWave || [] : waveSpec((state.wave | 0) + 1, shareCount(state));
  const order = groups.filter((g) => g && g.k !== 'boss').slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  const out = [], seen = new Set();
  for (const g of order) {
    if (!seen.has(g.k)) { seen.add(g.k); out.push({ k: g.k, sup: false }); }
  }
  for (const g of order) {
    if (g.sup > 0 && !seen.has(`S:${g.k}`)) { seen.add(`S:${g.k}`); out.push({ k: g.k, sup: true }); }
  }
  return out;
}

/**
 * Pictures to paint ahead of need. plan(key, jobs) sets the list when what is wanted changes (a new
 * key: a new event coming, or a new resolution); run() works through it in order while the budget
 * lasts. A job is [cache, key, args]; one already painted costs nothing.
 */
export function createPrepaint(budget) {
  let planKey = null, jobs = [], at = 0;
  return {
    /** True if the plan for `key` is already set (so the caller need not work the jobs out again). */
    planned(key) { return key === planKey; },
    plan(key, list) { planKey = key; jobs = list; at = 0; },
    /** Jobs not yet looked at. */
    get left() { return jobs.length - at; },
    /** Paints while the budget lasts. @returns how many pictures it painted */
    run() {
      let n = 0;
      while (at < jobs.length && budget.ok()) {
        const [cache, key, args] = jobs[at++];
        if (cache.warm(key, args)) n++;
      }
      return n;
    },
  };
}
