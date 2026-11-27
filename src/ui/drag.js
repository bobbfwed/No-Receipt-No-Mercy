// Turns a mouse drag across the grid into build or remove commands. No DOM here, so Node can test it.
//
// Rules:
// - Every tile the pointer crosses counts, even if the mouse jumps several tiles between two events
//   (the gap is filled with a 4-connected line, so belts never go diagonal).
// - Belts: a belt is only placed once we know where the drag goes next, and it faces that way, so
//   dragging lays a working line. The belt under the pointer when the button is released carries on
//   in the direction the line was going. A single click places one belt in the preview direction.
// - Other buildings are placed as soon as the pointer enters a tile, facing the preview direction.
// - Remove: every tile crossed is removed.
// - A tile is handled at most once per drag. After the first tile, tiles that obviously cannot work
//   (already built on, or nothing to remove) are skipped quietly instead of asking the host and
//   getting told off for every tile.

/** Direction from tile a to the adjacent tile b: 0 east, 1 south, 2 west, 3 north. */
export function dirBetween(a, b) {
  if (b.x > a.x) return 0;
  if (b.y > a.y) return 1;
  if (b.x < a.x) return 2;
  return 3;
}

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
  // (The Back's belt, 'conv'. Until 0.4 the shop floor had belts too, laid the same way.)
  const belt = mode === 'build' && kind === 'conv';
  const startKey = keyOf(start);
  let last = start;
  let pending = null;
  let lastDir = null; // direction of the most recent step of a belt drag

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

  let first;
  if (mode === 'remove') first = remove(start);
  else if (belt) { pending = start; first = []; }
  else first = place(start, dir);

  return {
    first,
    /** The pointer is now over tile t (or off the grid when t is null). */
    moveTo(t, d = dir) {
      if (!t || (t.x === last.x && t.y === last.y)) return [];
      const out = [];
      for (const n of gridLine(last, t)) {
        if (mode === 'remove') out.push(...remove(n));
        else if (belt) {
          lastDir = dirBetween(last, n);
          if (pending) out.push(...place(pending, dirBetween(pending, n)));
          pending = done.has(keyOf(n)) ? null : n;
        } else out.push(...place(n, d));
        last = n;
      }
      return out;
    },
    /**
     * The button was released. The last belt of a dragged line carries on in the direction the
     * line was going; a single click uses the preview direction.
     */
    end(d = dir) {
      const out = belt && pending ? place(pending, lastDir === null ? d : lastDir) : [];
      pending = null;
      return out;
    },
  };
}
