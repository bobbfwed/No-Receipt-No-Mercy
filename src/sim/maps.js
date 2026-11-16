// Store floor plans. A map is worked out from a design and a size, never stored by hand, so every
// design is available in every size.
//
// Tile characters:
//   '#' wall, pillar or shelf (nothing walks or builds here)
//   '.' floor (the only tiles that can be built on)
//   'T' till (shoppers want to reach one)
//   'D' open entrance (shoppers appear here)   'd' entrance that is still shut
// There is one entrance per player. All six possible entrances exist from the start, shut, so the
// maze can never be built across one; they open as players join.

/**
 * Sizes. `players` is the number of players the size suits: each step is about half as big again
 * as the one before, starting from one and a half times the original store for a single player.
 */
export const MAP_SIZES = {
  xs: { name: 'Corner Shop', w: 30, h: 16, players: 0, note: 'the original; cramped' },
  s: { name: 'Outlet', w: 36, h: 20, players: 1 },
  m: { name: 'Superstore', w: 44, h: 24, players: 2 },
  l: { name: 'Megastore', w: 54, h: 30, players: 3 },
  xl: { name: 'Hypermarket', w: 66, h: 37, players: 4 },
  xxl: { name: 'Distribution Centre', w: 81, h: 45, players: 5 },
  huge: { name: 'Regional Hub', w: 99, h: 55, players: 6 },
};

export const MAP_DESIGNS = {
  warehouse: {
    name: 'Open Warehouse',
    desc: 'One big empty floor with a few pillars. Every wall in the maze is one you built.',
  },
  showroom: {
    name: 'Flat-Pack Showroom',
    desc: 'Walled rooms joined by doorways that everyone, and every belt, has to go through. Good choke points, awkward factories.',
  },
  aisles: {
    name: 'Supermarket Aisles',
    desc: 'Rows of shelving with a wide main aisle down the middle. The shelves are free walls; the main aisle is your problem.',
  },
};

/** The size that suits a number of players. */
export function recommendedSize(players) {
  const n = Math.max(1, Math.min(6, players | 0));
  return Object.keys(MAP_SIZES).find((k) => MAP_SIZES[k].players === n);
}

/**
 * Builds a floor plan.
 * @param {string} design a key of MAP_DESIGNS
 * @param {string} size a key of MAP_SIZES
 * @param {number} [slots] how many entrances the map has (they start shut)
 * @returns {{w: number, h: number, tiles: string, doors: number[][]}} `doors` lists each
 *   entrance's tile indexes, in the order the entrances open
 */
export function makeMap(design = 'warehouse', size = 'xs', slots = 6) {
  const { w, h } = MAP_SIZES[size] || MAP_SIZES.xs;
  const g = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) g.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.');
  }
  const set = (x, y, ch) => { if (x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = ch; };
  const wall = (x, y) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) g[y * w + x] = '#'; };
  const mid = h >> 1;

  if (design === 'showroom') rooms(w, h, wall, set);
  else if (design === 'aisles') shelves(w, h, mid, wall);
  else pillars(w, h, wall);

  // Tills: a band in the middle of the right-hand wall.
  const tillRows = Math.max(6, Math.round(h * 0.375) & ~1);
  const t0 = (h - tillRows) >> 1;
  for (let y = t0; y < t0 + tillRows; y++) {
    set(w - 1, y, 'T');
    set(w - 2, y, '.');
    set(w - 3, y, '.');
  }

  // Entrances, in the order they open: the first on the left wall, then top and bottom (toward
  // the left), then two more on the left wall, then a second one on top.
  const cx = Math.round(w * 0.3), cx2 = Math.round(w * 0.55), ry = Math.round(h * 0.22);
  const spots = [
    { side: 'L', at: mid - 1 },
    { side: 'T', at: cx },
    { side: 'B', at: cx },
    { side: 'L', at: ry - 1 },
    { side: 'L', at: h - 1 - ry },
    { side: 'T', at: cx2 },
  ];
  const doors = [];
  for (const sp of spots.slice(0, Math.max(1, slots))) {
    const door = [];
    for (let j = 0; j < 2; j++) {
      const x = sp.side === 'L' ? 0 : sp.at + j;
      const y = sp.side === 'L' ? sp.at + j : sp.side === 'T' ? 0 : h - 1;
      set(x, y, 'd');
      door.push(y * w + x);
      // Keep the floor just inside the entrance clear of walls.
      const dx = sp.side === 'L' ? 1 : 0, dy = sp.side === 'T' ? 1 : sp.side === 'B' ? -1 : 0;
      for (let k = 1; k <= 2; k++) set(x + dx * k, y + dy * k, '.');
    }
    doors.push(door);
  }
  return { w, h, tiles: g.join(''), doors };
}

/** Open warehouse: a pillar every dozen tiles or so. */
function pillars(w, h, wall) {
  for (let x = 8; x <= w - 9; x += 12) {
    for (let y = 4; y <= h - 5; y += 7) wall(x, y);
  }
}

/**
 * Showroom: the floor is cut into rooms by walls, and every wall between two rooms has a
 * doorway three tiles wide (two on a long wall). The doorways are staggered so there is no
 * straight line through.
 */
function rooms(w, h, wall, set) {
  const cols = Math.max(2, Math.round((w - 2) / 10)), rows = Math.max(2, Math.round((h - 2) / 7.5));
  const xs = [], ys = [];
  for (let k = 0; k <= cols; k++) xs.push(Math.round((k * (w - 1)) / cols));
  for (let k = 0; k <= rows; k++) ys.push(Math.round((k * (h - 1)) / rows));
  for (let k = 1; k < cols; k++) for (let y = 1; y < h - 1; y++) wall(xs[k], y);
  for (let k = 1; k < rows; k++) for (let x = 1; x < w - 1; x++) wall(x, ys[k]);
  // Doorways in the walls that run up and down, then in the ones that run across.
  for (let k = 1; k < cols; k++) {
    for (let r = 0; r < rows; r++) {
      for (const at of doorways(ys[r + 1] - ys[r] - 1, k * 5 + r * 3)) set(xs[k], ys[r] + 1 + at, '.');
    }
  }
  for (let k = 1; k < rows; k++) {
    for (let c = 0; c < cols; c++) {
      for (const at of doorways(xs[c + 1] - xs[c] - 1, k * 7 + c * 4 + 2)) set(xs[c] + 1 + at, ys[k], '.');
    }
  }
}

/**
 * Where the doorways go in a stretch of wall `len` tiles long: the offsets of the tiles to open.
 * A doorway is three tiles wide, so a production line can run through it and still leave
 * shoppers a way past; a long stretch of wall gets a second doorway, so there is more than one
 * way between two rooms once the first is full of belts. `seed` staggers them from wall to wall.
 */
function doorways(len, seed) {
  const wide = len >= 6 ? 3 : Math.min(2, len);
  const spots = Math.max(1, len - wide + 1);
  const first = seed % spots;
  const out = [];
  for (let j = 0; j < wide; j++) out.push(first + j);
  if (len >= 9) {
    const second = (first + (len >> 1)) % spots;
    if (Math.abs(second - first) > wide) for (let j = 0; j < wide; j++) out.push(second + j);
  }
  return out;
}

/**
 * Supermarket: shelves running up and down in two bands, with a wide main aisle across the
 * middle and a corridor along the top and bottom walls.
 */
function shelves(w, h, mid, wall) {
  for (let x = 5; x <= w - 7; x += 4) {
    for (let y = 3; y <= mid - 3; y++) wall(x, y);
    for (let y = mid + 2; y <= h - 4; y++) wall(x, y);
  }
}

/**
 * Marks out the floor the factory machines must be built on (see ZONES in constants.js).
 * The floor is divided into sections ten tiles apart. Each section has four patches, four tiles
 * wide, one above the other: Loading Bay at the top, then Press Shop, Gift Wrap, and Shipping
 * near the bottom. Every other section is upside down, so production lines run down one section
 * and up the next, which is what makes them a zigzag for shoppers. Patches never touch, so
 * goods always need a belt to get from one to the next.
 * @returns {string} one character per tile: a key of ZONES, or a space
 */
export function makeZones(w, h, tiles, doors) {
  const z = new Array(w * h).fill(' ');
  const tall = h >= 30 ? 3 : 2, wide = 4;
  const tops = { u: 1, p: Math.round(h * 0.25), k: Math.round(h * 0.5), c: Math.round(h * 0.7) };
  for (let n = 0, x0 = 9; x0 + wide - 1 <= w - 4; n++, x0 += 10) {
    for (const [ch, top] of Object.entries(tops)) {
      for (let dy = 0; dy < tall; dy++) {
        const y = n % 2 ? h - 1 - (top + dy) : top + dy;
        for (let dx = 0; dx < wide; dx++) {
          const i = y * w + x0 + dx;
          if (tiles[i] === '.') z[i] = ch;
        }
      }
    }
  }
  // Keep the floor right inside every entrance unmarked, so a machine is never the obvious
  // thing to put in a doorway.
  for (const door of doors) {
    for (const t of door) {
      const tx = t % w, ty = (t / w) | 0;
      for (let y = ty - 1; y <= ty + 1; y++) {
        for (let x = tx - 1; x <= tx + 1; x++) if (x >= 0 && y >= 0 && x < w && y < h) z[y * w + x] = ' ';
      }
    }
  }
  return z.join('');
}
