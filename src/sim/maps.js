// Store floor plans. A map is worked out from a design and a size, never stored by hand, so every
// design is available in every size.
//
// Tile characters:
//   '#' wall, pillar, shelf or furniture (nothing walks or builds here; what furniture looks
//       like is in the separate `decor` string, see DECOR)
//   '.' floor (the only tiles that can be built on)
//   'T' till (shoppers want to reach one)
//   'D' open entrance (shoppers appear here)   'd' entrance that is still shut
// There is one entrance per player. All seven possible entrances exist from the start, shut, so the
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
  titan: { name: 'Mega Mall', w: 121, h: 67, players: 7 },
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
  food: {
    name: 'Food Court',
    desc: 'Little tables, sticky booths, kebab stalls and a fountain full of pennies. The crowd weaves through it all; so do your belts.',
  },
};

/** The size that suits a number of players. */
export function recommendedSize(players) {
  const n = Math.max(1, Math.min(7, players | 0));
  return Object.keys(MAP_SIZES).find((k) => MAP_SIZES[k].players === n);
}

/**
 * Builds a floor plan.
 * @param {string} design a key of MAP_DESIGNS
 * @param {string} size a key of MAP_SIZES
 * @param {number} [slots] how many entrances the map has, up to seven (they start shut)
 * @returns {{w: number, h: number, tiles: string, doors: number[][], decor: string}} `doors`
 *   lists each entrance's tile indexes, in the order the entrances open. `decor` says what each
 *   solid tile looks like, one character per tile (see DECOR); it is '' for designs without
 *   furniture.
 */
export function makeMap(design = 'warehouse', size = 'xs', slots = 7) {
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
  else if (design !== 'food') pillars(w, h, wall);

  // Tills: a band in the middle of the right-hand wall.
  const tillRows = Math.max(6, Math.round(h * 0.375) & ~1);
  const t0 = (h - tillRows) >> 1;
  for (let y = t0; y < t0 + tillRows; y++) {
    set(w - 1, y, 'T');
    set(w - 2, y, '.');
    set(w - 3, y, '.');
  }

  // Entrances, in the order they open: the first on the left wall, then top and bottom (a fifth
  // of the way along), then two more on the left wall, then a second one on top and on the
  // bottom (two fifths of the way along).
  const cx = Math.round(w * 0.2), cx2 = Math.round(w * 0.4), ry = Math.round(h * 0.22);
  const spots = [
    { side: 'L', at: mid - 1 },
    { side: 'T', at: cx },
    { side: 'B', at: cx },
    { side: 'L', at: ry - 1 },
    { side: 'L', at: h - 1 - ry },
    { side: 'T', at: cx2 },
    { side: 'B', at: cx2 },
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
  // The food court's furniture goes in last, around the tills, the entrances (all seven, so the
  // layout is the same however many are in use) and the marked floor.
  const decor = design === 'food' ? furnish(w, h, g, spots) : '';
  return { w, h, tiles: g.join(''), doors, decor };
}

/**
 * What a solid tile of the food court looks like (the `decor` string from makeMap). Every one of
 * them is an ordinary '#' in the tiles, so the rules treat furniture exactly like a wall.
 */
export const DECOR = {
  ' ': 'nothing special: floor, or a plain wall',
  t: 'a small table with chairs',
  b: 'a bench or booth seat (a run of them is one bench)',
  p: 'a planter or potted palm',
  n: 'a bin and tray return',
  k: 'a food stall (a block of several tiles)',
  f: 'the fountain (a block of several tiles)',
};

/** A small, fixed scramble of a few numbers, used in place of dice so a map is the same every time. */
function hash(a, b, c) {
  let t = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35) ^ Math.imul(c + 0x1234, 0x27d4eb2f);
  t ^= t >>> 15;
  t = Math.imul(t, 0x2c1b3c6d);
  t ^= t >>> 12;
  t = Math.imul(t, 0x297a2d39);
  t ^= t >>> 15;
  return t >>> 0;
}

/**
 * Food court: furniture scattered over the floor. The columns that hold marked floor (and one
 * either side, for belts) get only the odd single table, never beside a patch, so production
 * lines still fit but have something to go round; the strips between them are filled with
 * clusters of single tables, booths, stalls, benches, planters and bins, with a fountain in the
 * middle on the bigger maps.
 *
 * Nothing is sealed off because no two pieces of furniture touch, not even corner to corner, and
 * none touches the outer wall: separate solid blocks in an open room can always be walked round.
 * Shoppers have to weave through the gaps, which are one tile wide.
 * @param {string[]} g the tiles, changed in place
 * @returns {string} the decor string
 */
function furnish(w, h, g, spots) {
  const d = new Array(w * h).fill(' ');
  const keep = new Uint8Array(w * h); // 1 = no furniture on this tile
  const clear = (x0, y0, x1, y1) => {
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) keep[y * w + x] = 1;
    }
  };
  // A walkway all round the outer wall, and the three columns in front of the tills.
  clear(0, 0, w - 1, 1);
  clear(0, h - 2, w - 1, h - 1);
  clear(0, 0, 1, h - 1);
  clear(w - 4, 0, w - 1, h - 1);
  // The floor in front of every entrance, three deep and a tile wider each side.
  const allDoors = [];
  for (const sp of spots) {
    if (sp.side === 'L') clear(1, sp.at - 1, 3, sp.at + 2);
    else if (sp.side === 'T') clear(sp.at - 1, 1, sp.at + 2, 3);
    else clear(sp.at - 1, h - 4, sp.at + 2, h - 2);
    const door = [];
    for (let j = 0; j < 2; j++) {
      const x = sp.side === 'L' ? 0 : sp.at + j;
      const y = sp.side === 'L' ? sp.at + j : sp.side === 'T' ? 0 : h - 1;
      door.push(y * w + x);
    }
    allDoors.push(door);
  }
  // The marked floor and a tile all round it. The columns it is in, and one either side, are the
  // bands where production lines run: only the odd table goes there, never a big piece.
  // (A patch can sit a row further in when an entrance faces it, so this is worked out for every
  // number of entrances in use, and the furniture stays clear of all of them.)
  const banded = new Uint8Array(w);
  const tiles = g.join('');
  for (let n = 1; n <= allDoors.length; n++) {
    const zones = makeZones(w, h, tiles, allDoors.slice(0, n));
    for (let i = 0; i < zones.length; i++) {
      if (zones[i] === ' ') continue;
      const x = i % w, y = (i / w) | 0;
      clear(x - 1, y - 1, x + 1, y + 1);
      for (let k = -1; k <= 1; k++) if (x + k >= 0 && x + k < w) banded[x + k] = 1;
    }
  }

  /** True if a block of furniture fits here: free floor, and nothing else touching it. */
  const fits = (x0, y0, rows) => {
    const pw = rows[0].length, ph = rows.length;
    for (let y = y0 - 1; y <= y0 + ph; y++) {
      for (let x = x0 - 1; x <= x0 + pw; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) return false;
        const i = y * w + x;
        if (d[i] !== ' ') return false;
        const inside = x >= x0 && y >= y0 && x < x0 + pw && y < y0 + ph;
        if (inside && (keep[i] || g[i] !== '.')) return false;
      }
    }
    return true;
  };
  const put = (x0, y0, rows) => {
    if (!fits(x0, y0, rows)) return false;
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const i = (y0 + y) * w + x0 + x;
        g[i] = '#';
        d[i] = rows[y][x];
      }
    }
    return true;
  };
  const block = (ch, bw, bh) => Array.from({ length: bh }, () => ch.repeat(bw));

  // The strips of floor furniture may go in: runs of columns between the marked floor.
  const runs = [];
  for (let x = 2; x <= w - 5; x++) {
    if (banded[x]) continue;
    if (runs.length && runs[runs.length - 1][1] === x - 1) runs[runs.length - 1][1] = x;
    else runs.push([x, x]);
  }

  // The fountain: in the strip nearest the middle, half way down, on the middle-sized maps and up.
  if (h >= 24 && runs.length) {
    const [c0, c1] = runs.filter((r) => r[1] - r[0] >= 3).concat([runs[0]])
      .reduce((a, r) => (Math.abs((r[0] + r[1]) / 2 - w / 2) < Math.abs((a[0] + a[1]) / 2 - w / 2) ? r : a));
    const fw = Math.min(4, c1 - c0 + 1), fh = h >= 30 ? 4 : 3;
    const fx = c0 + ((c1 - c0 + 1 - fw) >> 1), fy = (h - fh) >> 1;
    if (put(fx, fy, block('f', fw, fh))) {
      // Benches facing it, above and below, with a gap to walk through between.
      const bench = fw >= 4 ? ['p' + 'b'.repeat(fw - 2) + 'p'] : ['b'.repeat(fw)];
      put(fx, fy - 2, bench);
      put(fx, fy + fh + 1, bench);
    }
  }

  // Everything else, a block of strip at a time, six rows tall. Each block is little tables, and
  // may also have a stall, a row of booths, or planters and a bench. The blocks take turns from
  // a fixed list rather than by chance, so even the smallest map gets one of each.
  const BH = 6;
  const TURNS = 'tktbtltkbtl';
  let turn = hash(w, h, 5) % TURNS.length;
  for (const [c0, c1] of runs) {
    const rw = c1 - c0 + 1;
    for (let by = 2; by <= h - 3; by += BH) {
      const kind = TURNS[turn++ % TURNS.length];
      const r2 = hash(by, c0, w + h * 977);
      // A piece that would land in front of an entrance (or off the end of the strip) shuffles
      // along and down the block until it fits. Returns where it went, as [x, y], or null.
      const settle = (x0, rows) => {
        const pw = rows[0].length, ph = rows.length;
        const xs = [];
        for (let x = c0; x + pw - 1 <= c1; x++) xs.push(x);
        xs.sort((a, b) => Math.abs(a - x0) - Math.abs(b - x0) || a - b);
        for (const dy of [1, 2, 3, 0, 4]) {
          if (dy + ph > BH) continue;
          for (const x of xs) if (put(x, by + dy, rows)) return [x, by + dy];
        }
        return null;
      };
      if (kind === 'k' && rw >= 2) {
        // A food stall, two or three tiles each way, with a bin by it.
        const shapes = rw >= 3 ? [[3, 2], [2, 3], [2, 2]] : [[2, 2], [2, 3]];
        const [kw, kh] = shapes[r2 % shapes.length];
        const at = settle(c0 + ((rw - kw) >> 1) + (rw - kw >= 2 ? (r2 >> 4) % 2 : 0), block('k', kw, kh));
        if (at) {
          const [x, y] = at;
          [[x + kw + 1, y], [x - 2, y + kh - 1], [x, y + kh + 1], [x + kw - 1, y - 2]].some(([bx, by2]) => put(bx, by2, ['n']));
        }
      } else if (kind === 'b' && rw >= 3) {
        // Booths: a table between two benches, in rows with a gap between, staggered.
        for (let k = 0; k < 3; k++) {
          const off = rw > 3 ? (k + (r2 & 1)) % 2 : 0;
          put(c0 + off, by + 2 * k, ['btb']);
          if (rw >= 7) put(c0 + off + 4, by + 2 * k, ['btb']);
        }
      } else if (kind === 'l' && rw >= 2) {
        // Planters with a bench between them, and a palm.
        const len = Math.min(rw, 4 + ((r2 >> 3) % 2));
        const row = len >= 3 ? 'p' + 'b'.repeat(len - 2) + 'p' : 'pp';
        const at = settle(c0 + ((rw - len) >> 1), [row]);
        if (at) put(c0 + ((rw - 1) >> 1), at[1] + 3, ['p']);
      }
      // Little tables in whatever room is left, every fourth tile along a row and shifted two
      // along on the next row, so each row of tables blocks a straight walk and makes the crowd
      // step round. A few are left out, and a few are a bin or a palm instead.
      for (let y = by; y < by + BH && y <= h - 3; y++) {
        for (let x = c0; x <= c1; x++) {
          if (((x - c0) + 2 * (y - by)) % 4 !== 0) continue;
          const r = hash(x, y, w * 7 + h) % 100;
          if (r < 25) continue;
          put(x, y, [r < 30 ? 'n' : r < 36 ? 'p' : 't']);
        }
      }
    }
  }
  // The odd table in the bands too, in the rows between the patches, so belts have something to
  // go round. Each is on its own, and none is beside marked floor.
  for (let x = 2; x <= w - 5; x++) {
    if (!banded[x]) continue;
    for (let y = 2; y <= h - 3; y++) {
      if ((x + 2 * y) % 4 === 0 && hash(y, x, w * 31 + h) % 100 < 15) put(x, y, ['t']);
    }
  }
  return d.join('');
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
 * No patch touches the outer wall: the Loading Bay is a tile in from it, or two in front of an
 * entrance in that wall, so there is always a walkway round the edge and in through the doors.
 * @returns {string} one character per tile: a key of ZONES, or a space
 */
export function makeZones(w, h, tiles, doors) {
  const z = new Array(w * h).fill(' ');
  const tall = h >= 30 ? 3 : 2, wide = 4;
  for (let n = 0, x0 = 9; x0 + wide - 1 <= w - 4; n++, x0 += 10) {
    // The Loading Bay is against the top wall in even sections and the bottom wall in odd ones
    // (they are upside down). Is an entrance in that wall in front of it?
    const wallY = n % 2 ? h - 1 : 0;
    const facing = doors.some((door) => door.some((t) => ((t / w) | 0) === wallY && (t % w) >= x0 - 1 && (t % w) <= x0 + wide));
    const u = facing ? 3 : 2;
    // The patches below follow on, never closer than one tile apart, and never touching the far wall.
    const p = Math.max(Math.round(h * 0.25), u + tall + 1);
    const k = Math.max(Math.round(h * 0.5), p + tall + 1);
    const c = Math.min(Math.max(Math.round(h * 0.7), k + tall + 1), h - 2 - tall);
    const tops = { u, p, k, c };
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
