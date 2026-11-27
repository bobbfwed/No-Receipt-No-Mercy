// Turns a mouse drag across the grid into build or remove commands. No DOM here, so Node can test it.
//
// Rules:
// - Every tile the pointer crosses counts, even if the mouse jumps several tiles between two events
//   (the gap is filled with a 4-connected line).
// - Buildings are placed as soon as the pointer enters a tile, facing the preview direction.
// - Remove: every tile crossed is removed.
// - A tile is handled at most once per drag. After the first tile, tiles that obviously cannot work
//   (already built on, or nothing to remove) are skipped quietly instead of asking the host and
//   getting told off for every tile. The first tile is always sent, whatever is on it.
// (Until 0.4.01 The Back's belts were painted here too, one per tile crossed. They are laid as one
// line from a start tile to an end tile now: planLine in src/sim/line.js, and input.js.)

/** The tiles from a (excluded) to b (included), each one step up, down, left or right of the last. */
export function gridLine(a, b) {
  const out = [];
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  const sx = Math.sign(b.x - a.x), sy = Math.sign(b.y - a.y);
  let x = a.x, y = a.y, ix = 0, iy = 0;
  while (ix < dx || iy < dy) {
    if ((0.5 + ix) / dx < (0.5 + iy) / dy) { x += sx; ix++; } else { y += sy; iy++; }
    out.push({ x, y });
  }
  return out;
}

const keyOf = (t) => `${t.x},${t.y}`;

/**
 * Starts a drag.
 * @param {Object} o
 * @param {'build'|'remove'} o.mode
 * @param {string} [o.kind]     building kind when building
 * @param {{x:number,y:number}} o.start tile where the button went down
 * @param {number} o.dir        preview direction at the start
 * @param {(t) => boolean} [o.hasBuilding] whether a tile is built on, from the local state
 * @returns {{ first: Object[], moveTo(t, dir): Object[], end(dir): Object[] }} commands to send
 */
export function startDrag({ mode, kind, start, dir, hasBuilding = () => false }) {
  const done = new Set();
  const startKey = keyOf(start);
  let last = start;

  function place(t, d) {
    const k = keyOf(t);
    if (done.has(k)) return [];
    done.add(k);
    if (k !== startKey && hasBuilding(t)) return [];
    return [{ c: 'place', k: kind, x: t.x, y: t.y, d: d & 3 }];
  }
  function remove(t) {
    const k = keyOf(t);
    if (done.has(k)) return [];
    done.add(k);
    if (k !== startKey && !hasBuilding(t)) return [];
    return [{ c: 'remove', x: t.x, y: t.y }];
  }

  const first = mode === 'remove' ? remove(start) : place(start, dir);

  return {
    first,
    /** The pointer is now over tile t (or off the grid when t is null). */
    moveTo(t, d = dir) {
      if (!t || (t.x === last.x && t.y === last.y)) return [];
      const out = [];
      for (const n of gridLine(last, t)) {
        out.push(...(mode === 'remove' ? remove(n) : place(n, d)));
        last = n;
      }
      return out;
    },
    /** The button was released: nothing is left to send (kept so every drag ends the same way). */
    end() {
      return [];
    },
  };
}
