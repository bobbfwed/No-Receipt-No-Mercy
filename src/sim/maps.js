// Store floor plans. A map is worked out from a design and a size, never stored by hand, so every
// design is available in every size.
//
// Tile characters:
//   '#' wall, pillar, shelf or furniture (nothing walks or builds here; what furniture looks
//       like is in the separate `decor` string, see DECOR)
//   '.' floor (the only tiles that can be built on)
//   'T' till (shoppers want to reach one). Most designs have one bank of them, in the right-hand
//       wall; the car park has a second bank in the bottom wall
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
    desc: 'Walled rooms joined by doorways that everyone has to go through. Good choke points. The walls go all the way down, so The Back is just as awkward.',
  },
  aisles: {
    name: 'Supermarket Aisles',
    desc: 'Rows of shelving with a wide main aisle down the middle. The shelves are free walls; the main aisle is your problem.',
  },
  food: {
    name: 'Food Court',
    desc: 'Little tables, sticky booths, kebab stalls and a fountain full of pennies. The crowd weaves through it all, and so do your belts downstairs.',
  },
  carpark: {
    name: 'Car Park',
    desc: 'The sale has spilled outside. Rows of parked cars with the odd empty bay to squeeze through, and tills on two walls: make one way in a slog and the whole crowd takes the other.',
  },
  corridors: {
    name: 'The Back Passage',
    desc: 'Staff only. Long service corridors with a few gaps in the walls, which go all the way down: your belts in The Back squeeze through the same gaps as the crowd. The plot is taller than most, to fit more corridors in.',
  },
  horseshoe: {
    name: 'The Strip Mall',
    desc: "A U of dying shops round a car park nobody owns. In on one arm, round the bend, refunds at the bottom of the other: the bend is everyone's problem. The plot is bigger, as the middle is all car park.",
  },
};

/**
 * The width and height of a store of this design and size: the rectangle in MAP_SIZES, unless a
 * design needs a bigger plot (the Back Passage a taller one, the Strip Mall a bigger one).
 * Everything outside this file must read the made map's `w` and `h`: a game keeps the plan it
 * was made with, even if the design's plot changes in a later version.
 * @returns {{w: number, h: number}}
 */
export function mapSize(design, size) {
  // (Its own keys only: '__proto__' is found on every object.)
  const known = typeof size === 'string' && Object.hasOwn(MAP_SIZES, size) ? size : 'xs';
  const z = MAP_SIZES[known];
  if (design === 'horseshoe') return stripSize(known);
  if (design === 'corridors') return passageSize(known);
  return { w: z.w, h: z.h };
}

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
  const { w, h } = mapSize(design, size);
  const g = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) g.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.');
  }
  const set = (x, y, ch) => { if (x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = ch; };
  const wall = (x, y) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) g[y * w + x] = '#'; };
  const mid = h >> 1;

  if (design === 'showroom') rooms(w, h, wall, set);
  else if (design === 'aisles') shelves(w, h, mid, wall);
  else if (design === 'corridors') passages(w, h, wall);
  else if (design === 'horseshoe') cutOut(w, h, g);
  else if (design !== 'food' && design !== 'carpark') pillars(w, h, wall);

  // Tills: a bank in the middle of the right-hand wall. The car park has two shorter banks: that
  // one, and another in the bottom wall towards the right, about as far from the first entrance.
  const two = design === 'carpark';
  const tillRows = two ? Math.max(4, Math.round(h * 0.25) & ~1) : Math.max(6, Math.round(h * 0.375) & ~1);
  // (The Strip Mall's are low on the right arm of its U, at the far end from the entrances.)
  const t0 = design === 'horseshoe' ? stripTills(w, h, tillRows) : (h - tillRows) >> 1;
  for (let y = t0; y < t0 + tillRows; y++) {
    set(w - 1, y, 'T');
    set(w - 2, y, '.');
    set(w - 3, y, '.');
  }
  if (two) {
    const b0 = Math.min(Math.round(w * 0.78 - tillRows / 2), w - 3 - tillRows);
    for (let x = b0; x < b0 + tillRows; x++) {
      set(x, h - 1, 'T');
      set(x, h - 2, '.');
      set(x, h - 3, '.');
    }
  }

  // Entrances, in the order they open: the first on the left wall, then top and bottom (a fifth
  // of the way along), then two more on the left wall, then a second one on top and on the
  // bottom (two fifths of the way along).
  const cx = Math.round(w * 0.2), cx2 = Math.round(w * 0.4), ry = Math.round(h * 0.22);
  let spots = [
    { side: 'L', at: mid - 1 },
    { side: 'T', at: cx },
    { side: 'B', at: cx },
    { side: 'L', at: ry - 1 },
    { side: 'L', at: h - 1 - ry },
    { side: 'T', at: cx2 },
    { side: 'B', at: cx2 },
  ];
  // In the car park the entrances in the bottom wall are about half as far from the bottom bank
  // of tills as any other entrance is from a till, so they open last: only a sixth and a seventh
  // player get one.
  if (two) spots = [0, 1, 3, 4, 5, 2, 6].map((k) => spots[k]);
  // The Strip Mall has entrances of its own, all on the left arm of its U.
  if (design === 'horseshoe') spots = stripDoors(w, h);
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
  // The food court's furniture and the car park's cars go in last, around the tills, the entrances
  // (all seven, so the layout is the same however many are in use) and the marked floor.
  const decor = design === 'food' ? furnish(w, h, g, spots) : design === 'carpark' ? park(w, h, g, spots) : design === 'horseshoe' ? outside(w, h) : '';
  return { w, h, tiles: g.join(''), doors, decor };
}

/**
 * What a solid tile of the food court or the car park looks like (the `decor` string from
 * makeMap). Every one of them is an ordinary '#' in the tiles, so the rules treat furniture and
 * parked cars exactly like a wall.
 */
export const DECOR = {
  ' ': 'nothing special: floor, or a plain wall',
  // The food court.
  t: 'a small table with chairs',
  b: 'a bench or booth seat (a run of them is one bench)',
  p: 'a planter or potted palm',
  n: 'a bin and tray return',
  k: 'a food stall (a block of several tiles)',
  f: 'the fountain (a block of several tiles)',
  // The car park. A parked car and a trolley shelter each fill one bay: two tiles side by side,
  // the left one the small letter and the right one the capital.
  c: 'the left half of a parked car',
  C: 'the right half of a parked car',
  r: 'the left half of a trolley shelter',
  R: 'the right half of a trolley shelter',
  x: 'a car parked across two bays (a block two tiles each way)',
  i: 'the kerbed island at the end of a row of bays (a run of them is one island)',
  l: 'a lamp post on an island',
  m: 'a pay machine on an island',
  a: 'an abandoned trolley in the lane',
  o: 'traffic cones round a pothole in the lane',
  v: 'the burger van (a block four tiles wide and two deep)',
  // The Strip Mall.
  O: "outside the store: the strip mall's car park in the middle of its U (a block of tiles; nothing walks or builds there)",
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
  const { keep, banded } = reserve(w, h, g, spots);


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

/**
 * Where furniture may not go, for the designs that have any: the walkway round the outer wall,
 * the floor in front of the tills and the entrances, and the marked floor with a tile all round it.
 * @param {string[]} g the tiles, before any furniture
 * @returns {{keep: Uint8Array, banded: Uint8Array}} `keep` is 1 for each tile to leave alone;
 *   `banded` is 1 for each column that holds marked floor or is beside one that does
 */
function reserve(w, h, g, spots) {
  const keep = new Uint8Array(w * h);
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
  // Tills in the bottom wall (the car park's second bank): three deep in front of them as well.
  for (let x = 1; x < w - 1; x++) {
    if (g[(h - 1) * w + x] === 'T') clear(x - 1, h - 4, x + 1, h - 1);
  }
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
  // bands where production lines run: only the odd small thing goes there, never a big piece.
  // (A patch can sit a row further in when an entrance faces it, so this is worked out for every
  // number of entrances in use, and the furniture stays clear of all of them.)
  const banded = new Uint8Array(w);
  const tiles = g.join('');
  for (let n = 1; n <= allDoors.length; n++) {
    const marks = factoryPatches(w, h, tiles, allDoors.slice(0, n));
    for (let i = 0; i < marks.length; i++) {
      if (marks[i] === ' ') continue;
      const x = i % w, y = (i / w) | 0;
      clear(x - 1, y - 1, x + 1, y + 1);
      for (let k = -1; k <= 1; k++) if (x + k >= 0 && x + k < w) banded[x + k] = 1;
    }
  }
  return { keep, banded };
}

/**
 * Car park: rows of parking bays running up and down the strips of floor between the marked
 * floor, so the marked floor is in the driving lanes between the rows, which is where production
 * lines go. A row is two bays across, nose to nose (one bay where the strip is narrow). A bay is
 * two tiles across and one down, and holds a car, a trolley shelter or nothing. Each row ends in
 * a kerbed island with a lamp post, and every eight bays or so has a way through: two bays down
 * left empty right across the row. The ways through are staggered from one row to the next, so a
 * walk across the car park is a zigzag. A bay empty on one side only is a dent, which something
 * can be built in.
 *
 * The cars in a row touch each other, so unlike the food court's furniture a row is a wall. What
 * keeps every tile reachable is that a row touches nothing else: the walkway round the outer wall
 * passes both its ends, and the odd trolley or pothole in a lane never touches anything.
 * @param {string[]} g the tiles, changed in place
 * @returns {string} the decor string
 */
function park(w, h, g, spots) {
  const d = new Array(w * h).fill(' ');
  const { keep, banded } = reserve(w, h, g, spots);
  const free = (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1 && !keep[y * w + x] && g[y * w + x] === '.' && d[y * w + x] === ' ';
  const span = (x, y, n) => { for (let k = 0; k < n; k++) if (!free(x + k, y)) return false; return true; };
  /** Puts a piece one tile deep at (x, y), a letter per tile, if all of it fits. */
  const put = (x, y, piece) => {
    if (!span(x, y, piece.length)) return false;
    for (let k = 0; k < piece.length; k++) { g[y * w + x + k] = '#'; d[y * w + x + k] = piece[k]; }
    return true;
  };

  // Where the rows of bays go, as [first column, bays across]: one in every strip of columns
  // clear of the marked floor. The strip along the left wall is wider than a row, and its row
  // keeps to the right of it, leaving a lane in front of the entrances in that wall.
  const rows = [];
  for (let x = 2, run = 0; x <= w - 4; x++) {
    if (x <= w - 5 && !banded[x]) { run++; continue; }
    if (run >= 4) rows.push([x - run === 2 ? x - 4 : x - run, 2]);
    else if (run >= 2) rows.push([x - run, 1]);
    run = 0;
  }
  // The burger van parks in the row nearest the middle, on the middle-sized maps and up.
  let vanRow = -1;
  if (h >= 24) {
    rows.forEach(([x0, across], j) => {
      if (across === 2 && (vanRow < 0 || Math.abs(x0 + 2 - w / 2) < Math.abs(rows[vanRow][0] + 2 - w / 2))) vanRow = j;
    });
  }

  rows.forEach(([x0, across], j) => {
    const wide = across * 2;
    // The row runs from the first place it fits to the last (an entrance or the second bank of
    // tills may be in the way at either end), with an island at each end.
    let ya = 2, yb = h - 3;
    while (ya < yb && !span(x0, ya, wide)) ya++;
    while (yb > ya && !span(x0, yb, wide)) yb--;
    const n = yb - ya - 1; // how many bays down, between the islands
    if (n < 4) return;
    put(x0, ya, across === 2 ? 'iili' : 'il');
    put(x0, yb, across === 2 ? 'mlii' : 'li');
    // The ways through. One is the walkway to the store's front doors: straight across every row
    // at the height of the first entrance and the tills in the right-hand wall.
    const gap = new Uint8Array(h);
    const walk = (h >> 1) - 1;
    if (walk >= ya + 2 && walk <= yb - 3) gap[walk] = gap[walk + 1] = 1;
    // The rest are spread evenly down the row, half a step out from the row before, so that way
    // across is a zigzag. (The smallest car park is too short to have any.)
    const ways = Math.round(n / 8) - 1;
    for (let k = 0; k < ways; k++) {
      const y = ya + 1 + Math.floor(((k + (j % 2 ? 0.75 : 0.25)) * n) / ways) + (hash(x0, k, h) % 3) - 1;
      // Never right beside an island or the walkway: at least one bay of cars between.
      let at = Math.max(ya + 2, Math.min(yb - 3, y));
      if (at + 2 >= walk && at <= walk + 3) at = at < walk ? walk - 3 : walk + 4;
      if (at < ya + 2 || at > yb - 3) continue;
      gap[at] = gap[at + 1] = 1;
    }
    if (j === vanRow) {
      // The van takes the two bays down nearest the middle that are not a way through.
      const mid = (ya + yb) >> 1;
      for (let k = 0; k < n; k++) {
        const y = mid + (k % 2 ? (k + 1) >> 1 : -(k >> 1));
        if (y <= ya || y + 1 >= yb || gap[y] || gap[y + 1]) continue;
        put(x0, y, 'vvvv');
        put(x0, y + 1, 'vvvv');
        break;
      }
    }
    let across2 = -9; // the last row a car was parked across two bays
    for (let y = ya + 1; y < yb; y++) {
      if (gap[y]) continue;
      let dent = false;
      for (let b = 0; b < across; b++) {
        const x = x0 + 2 * b;
        if (!span(x, y, 2)) continue; // the van, or the back half of a car across two bays
        const r = hash(x, y, w * 131 + h) % 100;
        // Now and then some prick has parked across two bays.
        if (r < 5 && y - across2 >= 3 && y + 1 < yb && !gap[y + 1] && span(x, y + 1, 2)) {
          put(x, y, 'xx');
          put(x, y + 1, 'xx');
          across2 = y;
        } else if (r < 16 && across === 2 && !dent) {
          dent = true; // an empty bay; never both sides at once, which would be another way through
        } else put(x, y, r < 22 ? 'rR' : 'cC');
      }
    }
  });

  // The odd abandoned trolley or coned-off pothole in the lanes, each on its own, touching
  // nothing, and never beside marked floor.
  for (let x = 2; x <= w - 5; x++) {
    for (let y = 2; y <= h - 3; y++) {
      if ((x + 2 * y) % 4 !== 0 || !free(x, y)) continue;
      const r = hash(y, x, w * 31 + h) % 100;
      if (r >= 10) continue;
      let alone = true;
      for (let ny = y - 1; ny <= y + 1; ny++) for (let nx = x - 1; nx <= x + 1; nx++) if (d[ny * w + nx] !== ' ') alone = false;
      if (alone) { g[y * w + x] = '#'; d[y * w + x] = r < 6 ? 'a' : 'o'; }
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
 * The patches of the marked floor the shop had until 0.4, when the old factory's machines could
 * only be built on their own kind of floor. Nothing is painted or enforced on them any more; they
 * are worked out for two things only, so that every store stays exactly as it was: the Returns
 * Drops go on the Loading Bay patches ('u', see makeDrops), and the food court's and car park's
 * furniture keeps clear of every patch (reserve). "Marked floor" and "production lines" in this
 * file's comments mean these patches and the lines that used to run between them.
 * The floor is divided into sections ten tiles apart. Each section has four patches, four tiles
 * wide, one above the other: Loading Bay at the top, then Press Shop, Gift Wrap, and Shipping
 * near the bottom. Every other section is upside down, so production lines run down one section
 * and up the next, which is what makes them a zigzag for shoppers. Patches never touch, so
 * goods always need a belt to get from one to the next.
 * No patch touches the outer wall: the Loading Bay is a tile in from it, or two in front of an
 * entrance or a till in that wall, so there is always a walkway round the edge, in through the
 * doors and up to the tills.
 * The designs with a layout of their own (the Back Passage, the Strip Mall) lay their patches their
 * own way; say which design it is to get it.
 * @param {string} [design] a key of MAP_DESIGNS; left out, the ordinary layout
 * @returns {string} one character per tile: 'u' Loading Bay, 'p' Press Shop, 'k' Gift Wrap,
 *   'c' Shipping, or a space
 */
function factoryPatches(w, h, tiles, doors, design) {
  if (design === 'corridors') return passagePatches(w, h, tiles, doors);
  if (design === 'horseshoe') return stripPatches(w, h, tiles, doors);
  const z = new Array(w * h).fill(' ');
  const tall = h >= 30 ? 3 : 2, wide = 4;
  for (let n = 0, x0 = 9; x0 + wide - 1 <= w - 4; n++, x0 += 10) {
    // The Loading Bay is against the top wall in even sections and the bottom wall in odd ones
    // (they are upside down). Is an entrance in that wall in front of it?
    const wallY = n % 2 ? h - 1 : 0;
    let facing = doors.some((door) => door.some((t) => ((t / w) | 0) === wallY && (t % w) >= x0 - 1 && (t % w) <= x0 + wide));
    // Tills in that wall (the car park's second bank) count the same: the two tiles in front of
    // a till stay clear, as they are in front of the tills in the right-hand wall.
    for (let x = x0 - 1; x <= x0 + wide; x++) if (tiles[wallY * w + x] === 'T') facing = true;
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

/**
 * Where The Back's Returns Drops go (0.4): one under each Loading Bay patch of the old marked floor
 * (factoryPatches), on the patch's tile nearest its middle (patch tiles are always open floor,
 * never a wall). test/back.test.js pins every drop on every design and size. A drop has no facing
 * since 0.4.01 (it shares its junk out to all four sides), so none is chosen here.
 * Same arguments as factoryPatches.
 * @returns {Array<{i: number}>} tile index, by tile index
 */
export function makeDrops(w, h, tiles, doors, design) {
  const z = factoryPatches(w, h, tiles, doors, design);
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let s = 0; s < w * h; s++) {
    if (z[s] !== 'u' || seen[s]) continue;
    // One patch: every 'u' tile joined to this one. Tiles up to two apart count as joined, so a
    // patch that a shelf or wall cuts in two (the Supermarket Aisles) is still one Loading Bay;
    // sections are ten tiles apart, so two never merge.
    const patch = [s];
    seen[s] = 1;
    for (let q = 0; q < patch.length; q++) {
      const t = patch[q], x = t % w, y = (t / w) | 0;
      for (let ny = y - 2; ny <= y + 2; ny++) {
        for (let nx = x - 2; nx <= x + 2; nx++) {
          const n = ny * w + nx;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[n] || z[n] !== 'u') continue;
          seen[n] = 1;
          patch.push(n);
        }
      }
    }
    // The tile nearest the patch's middle (whole numbers: positions are scaled by the tile count).
    let sx = 0, sy = 0;
    for (const t of patch) { sx += t % w; sy += (t / w) | 0; }
    const n = patch.length;
    let best = -1, bestD = Infinity;
    for (const t of patch) {
      const dx = (t % w) * n - sx, dy = ((t / w) | 0) * n - sy, d = dx * dx + dy * dy;
      if (d < bestD || (d === bestD && t < best)) { bestD = d; best = t; }
    }
    out.push({ i: best });
  }
  return out.sort((a, b) => a.i - b.i);
}

// ---------------------------------------------------------------------------------------------
// The Back Passage (version 0.3): the store's service corridors.

/**
 * The Back Passage's layout, worked out from the width and height alone, so the walls (passages)
 * and the marked floor (passagePatches) always agree. Long walls run across the store, leaving a hall
 * three tiles wide along the left wall (in front of the entrances) and the right (in front of the
 * tills), and cut it into corridors, as many as fit (four on the smallest store, fifteen on the
 * biggest: the design's plot is taller than the size's rectangle, see passageSize); the layout is
 * the same upside down. Each production line has its four kinds of marked floor in four corridors
 * one below the other (a store too low for four corridors, which no size is since 0.3.01, has
 * three, and the Press Shop and Gift Wrap share the middle one), so every line has to get through
 * the walls between them.
 * The walls have few openings: in the gap between two sections of marked floor, but only every
 * other gap, taking turns from one wall to the next, so a belt usually runs along its corridor to
 * find one. A whole production line reaches from one of the outer corridors to the other, so the
 * crowd can only get past it round its end, through those same openings or the halls.
 * @returns {{tall: number, bands: number[][], walls: number[][], gaps: number[][][]}} `tall` is
 *   how many rows a patch of marked floor has; `bands` each corridor's first and last row, top to
 *   bottom; `walls` the rows of each wall, top to bottom (the middle one is two rows thick when it
 *   falls between two rows); `gaps` for each wall its openings as [first column, last column]
 */
function passagePlan(w, h) {
  const rows = h - 2;
  // The least each corridor needs: a patch and a row either side of it (two patches and three
  // rows on the three-corridor layout's middle one).
  const need = (K, tall) => Array.from({ length: K }, (_, j) => (K === 3 && j === 1 ? 2 * tall + 3 : tall + 2));
  const thick = (K) => (K % 2 === 0 && h % 2 === 0 ? 1 : 0);
  const fits = (K, tall) => need(K, tall).reduce((a, b) => a + b, 0) + K - 1 + thick(K) <= rows;
  const most = (tall) => { let K = 3; while (fits(K + 1, tall)) K++; return K; };
  // Patches are two rows tall, unless that leaves room for only three corridors (the Corner
  // Shop): then one row, which makes room for a fourth.
  let tall = 2, K = most(2);
  if (K < 4) { tall = 1; K = most(1); }
  // Rows left over go to the narrowest corridors, a pair (one above the middle and its mirror
  // below) at a time; a single row left over goes to the middle corridor.
  // (Ties go to the outer pair first, so the top and bottom corridors are the first to get a row
  // more: that keeps their Loading Bays clear of the floor in front of an entrance in the outer wall.)
  const hts = need(K, tall);
  let spare = rows - hts.reduce((a, b) => a + b, 0) - (K - 1) - thick(K);
  const half = K >> 1, odd = K % 2;
  while (spare > 0) {
    let pick = -1;
    for (let j = 0; j < half; j++) if (spare >= 2 && (pick < 0 || hts[j] < hts[pick])) pick = j;
    if (odd && (pick < 0 || hts[half] < hts[pick])) pick = half;
    if (pick < 0) break;
    hts[pick]++;
    if (pick === half && odd) spare--;
    else { hts[K - 1 - pick]++; spare -= 2; }
  }
  const bands = [], walls = [];
  for (let j = 0, y = 1; j < K; j++) {
    bands.push([y, y + hts[j] - 1]);
    y += hts[j];
    if (j === K - 1) break;
    const t = j === half - 1 && !odd ? 1 + thick(K) : 1;
    walls.push(Array.from({ length: t }, (_, k) => y + k));
    y += t;
  }
  // The openings, in the gaps between sections of marked floor (each six columns wide, the one
  // before the section starting at column 9 + 10m), every other gap, taking turns. (Each line
  // goes through the three walls between its four corridors: the top three walls for a section
  // the right way up, the bottom three for one upside down.)
  const ow = w >= 36 ? 4 : 3;
  const gaps = walls.map((_, j) => {
    const all = [];
    for (let m = 1; ; m++) {
      const x0 = 3 + 10 * m + ((6 - ow) >> 1), x1 = x0 + ow - 1;
      if (x1 > w - 5) break;
      all.push([x0, x1]);
    }
    // The walls no production line has to cross (between the middle corridors of a big store)
    // get an opening in only every third gap.
    const busy = j <= 2 || j >= walls.length - 3;
    const out = all.filter((_, k) => (busy ? (k + 1 + j) % 2 === 0 : (k + j) % 3 === 0));
    // (A store too small for its turn still gets one.)
    return out.length || !all.length ? out : [all[all.length >> 1]];
  });
  return { tall, bands, walls, gaps };
}

/**
 * How many columns of open floor the Back Passage's walls leave along the left and right walls:
 * a hall in front of the entrances and one in front of the tills, joining the ends of every
 * corridor. Without them a production line, which reaches from the top corridor to the bottom one,
 * would be a wall right across the store that the crowd could never get round.
 */
const HALL = 3;

/**
 * The fewest corridors the Back Passage has on the smaller sizes (the owner asked for more
 * corridors than the size's own rectangle has room for). The bigger sizes have plenty anyway.
 */
const PASSAGE_LEAST = { xs: 4, s: 5, m: 5, l: 6 };

const passageCache = new Map();
/**
 * The Back Passage's plot for a size: the size's width, made taller (more corridors, one above
 * the other) until it has at least PASSAGE_LEAST corridors and at least as much floor as an Open
 * Warehouse of that size, the walls taking some. Of those heights it takes the lowest at which the
 * top and bottom corridors also have a row to spare (so a Loading Bay never loses a tile to the
 * floor in front of an entrance) without the floor coming out more than 15% bigger than the
 * warehouse's; if there is none, the lowest. Worked out once per size.
 */
function passageSize(size) {
  let hit = passageCache.get(size);
  if (hit) return { ...hit };
  const { w, h } = MAP_SIZES[size];
  const target = [...makeMap('warehouse', size, 1).tiles].filter((c) => c === '.').length;
  const least = PASSAGE_LEAST[size] || 0;
  const fit = [];
  for (let H = h; H <= 2 * h; H++) {
    const plan = passagePlan(w, H);
    if (plan.bands.length < least) continue;
    let walls = 0;
    passages(w, H, () => walls++);
    const floor = (w - 2) * (H - 2) - walls;
    if (floor < target) continue;
    const roomy = plan.bands[0][1] - plan.bands[0][0] + 1 >= plan.tall + 3;
    fit.push({ H, roomy: roomy && floor <= target * 1.15 });
  }
  hit = { w, h: (fit.find((f) => f.roomy) || fit[0]).H };
  passageCache.set(size, hit);
  return { ...hit };
}

/** The Back Passage: the corridor walls, with their openings (see passagePlan). */
function passages(w, h, wall) {
  const { walls, gaps } = passagePlan(w, h);
  walls.forEach((ys, j) => {
    for (const y of ys) {
      for (let x = HALL + 1; x < w - 1 - HALL; x++) if (!gaps[j].some(([a, b]) => x >= a && x <= b)) wall(x, y);
    }
  });
}

/**
 * The Back Passage's marked floor: sections ten columns apart, as on every design, but each patch
 * is in a corridor of its own (the Press Shop and Gift Wrap share one on the three-corridor
 * layout), from the Loading Bay in the top corridor down; every other section is upside down,
 * from the bottom corridor up. A patch is in the middle of its corridor, or in the top and bottom
 * corridors as far from the outer wall as it can be with a row to spare: that keeps a Loading Bay
 * clear of the two rows in front of an entrance in that wall where the corridor is wide enough.
 * Where it is not (the Outlet, where one tile is lost), the tiles in front of the entrance are
 * left off it.
 * @returns {string} one character per tile, as factoryPatches
 */
function passagePatches(w, h, tiles, doors) {
  const z = new Array(w * h).fill(' ');
  const { tall, bands } = passagePlan(w, h);
  const K = bands.length;
  // Where a patch starts in each corridor; on the three-corridor layout the middle one has a slot
  // near its top and one near its bottom.
  const mid = (j) => bands[j][0] + ((bands[j][1] - bands[j][0] + 1 - tall) >> 1);
  const at = bands.map((b, j) => (j === 0 ? b[1] - tall : j === K - 1 ? b[0] + 1 : mid(j)));
  let upper = 0, lower = 0;
  if (K === 3) {
    const [a, b] = bands[1];
    const m = ((b - a + 1 - (2 * tall + 3)) / 3) | 0;
    upper = a + 1 + m;
    lower = b - m - tall;
  }
  // Which row each kind starts on, for a section the right way up and one upside down.
  const tops = [
    K === 3 ? { u: at[0], p: upper, k: lower, c: at[2] } : { u: at[0], p: at[1], k: at[2], c: at[3] },
    K === 3 ? { u: at[2], p: lower, k: upper, c: at[0] } : { u: at[K - 1], p: at[K - 2], k: at[K - 3], c: at[K - 4] },
  ];
  for (let n = 0, x0 = 9; x0 + 3 <= w - 4; n++, x0 += 10) {
    for (const [ch, top] of Object.entries(tops[n % 2])) {
      for (let dy = 0; dy < tall; dy++) {
        const y = top + dy;
        for (let dx = 0; dx < 4; dx++) if (tiles[y * w + x0 + dx] === '.') z[y * w + x0 + dx] = ch;
      }
    }
  }
  // Keep the floor in front of every entrance unmarked: right inside it (as on every design), and
  // two rows deep in front of one in the top or bottom wall.
  for (const door of doors) {
    for (const t of door) {
      const tx = t % w, ty = (t / w) | 0;
      const deep = ty === 0 || ty === h - 1 ? 2 : 1;
      for (let y = ty - deep; y <= ty + deep; y++) {
        for (let x = tx - 1; x <= tx + 1; x++) if (x >= 0 && y >= 0 && x < w && y < h) z[y * w + x] = ' ';
      }
    }
  }
  return z.join('');
}

// ---------------------------------------------------------------------------------------------
// The Strip Mall (version 0.3): a U of shops round a car park that is not part of the store.

/**
 * Where the Strip Mall's car park is: a block cut up from the middle of the bottom wall, so the
 * store is a U: a left arm, a right arm and the bend along the top joining them. The block's
 * edge (its left and right columns and its top row) is ordinary store wall, the inside of the U;
 * everything inside that edge, down to the bottom of the map, is outdoors.
 * @returns {{L: number, R: number, top: number}} the block's left and right wall columns and its
 *   top wall row
 */
function lotPlan(w, h) {
  const L = Math.round(w * 0.33);
  return { L, R: w - 1 - L, top: Math.round(h * 0.45) };
}

const stripCache = new Map();
/**
 * The Strip Mall's plot for a size: the size's rectangle scaled up (keeping its shape) until the
 * floor inside the U is as near as it gets to the floor of an Open Warehouse of that size. Worked
 * out once per size.
 */
function stripSize(size) {
  let hit = stripCache.get(size);
  if (hit) return { ...hit };
  const { w, h } = MAP_SIZES[size];
  const target = [...makeMap('warehouse', size, 1).tiles].filter((c) => c === '.').length;
  let best = null;
  for (let k = 0; k <= 120; k++) {
    const W = Math.round((w * (200 + k)) / 200), H = Math.round((h * (200 + k)) / 200);
    const { L, R, top } = lotPlan(W, H);
    const floor = (W - 2) * (H - 2) - (R - L + 1) * (H - 1 - top);
    const off = Math.abs(floor - target);
    if (!best || off < best.off) best = { off, w: W, h: H };
  }
  hit = { w: best.w, h: best.h };
  stripCache.set(size, hit);
  return { ...hit };
}

/** The Strip Mall: walls round the car park's block, and the block itself solid (see outside). */
function cutOut(w, h, g) {
  const { L, R, top } = lotPlan(w, h);
  for (let y = top; y < h; y++) for (let x = L; x <= R; x++) g[y * w + x] = '#';
}

/** The Strip Mall's decor: 'O' (outdoors) inside the car park's block, a space everywhere else. */
function outside(w, h) {
  const { L, R, top } = lotPlan(w, h);
  const d = new Array(w * h).fill(' ');
  for (let y = top + 1; y < h; y++) for (let x = L + 1; x < R; x++) d[y * w + x] = 'O';
  return d.join('');
}

/** The first row of the Strip Mall's tills: half way down the right arm below the bend. */
function stripTills(w, h, rows) {
  const { top } = lotPlan(w, h);
  return Math.min(h - 2 - rows, Math.round((top + h - 2) / 2 - rows / 2));
}

/**
 * The Strip Mall's entrances, in the order they open: all on the left arm, so everyone walks
 * round the bend. Three in the left wall as on every design, and two each in the top and bottom
 * walls of the arm, the first pair further from the corner than the second.
 */
function stripDoors(w, h) {
  const { L } = lotPlan(w, h);
  const mid = h >> 1, ry = Math.round(h * 0.22);
  const a = Math.round(L * 0.62) - 1, b = Math.max(2, Math.round(L * 0.22) - 1);
  return [
    { side: 'L', at: mid - 1 },
    { side: 'T', at: a },
    { side: 'B', at: a },
    { side: 'L', at: ry - 1 },
    { side: 'L', at: h - 1 - ry },
    { side: 'T', at: b },
    { side: 'B', at: b },
  ];
}

/**
 * One section of marked floor in a band of rows, laid exactly as factoryPatches lays a section over
 * the whole height of an ordinary store: `y0` and `y1` are the wall rows above and below the
 * band. Returns false (and lays nothing) if the four patches do not fit in the band.
 */
function laySection(z, w, tiles, doors, x0, n, y0, y1, tall) {
  const hb = y1 - y0 + 1, wide = 4;
  const wallY = n % 2 ? y1 : y0;
  let facing = doors.some((door) => door.some((t) => ((t / w) | 0) === wallY && (t % w) >= x0 - 1 && (t % w) <= x0 + wide));
  for (let x = x0 - 1; x <= x0 + wide; x++) if (tiles[wallY * w + x] === 'T') facing = true;
  const u = facing ? 3 : 2;
  const p = Math.max(Math.round(hb * 0.25), u + tall + 1);
  const k = Math.max(Math.round(hb * 0.5), p + tall + 1);
  const c = Math.min(Math.max(Math.round(hb * 0.7), k + tall + 1), hb - 2 - tall);
  if (c < k + tall + 1) return false;
  for (const [ch, top] of Object.entries({ u, p, k, c })) {
    for (let dy = 0; dy < tall; dy++) {
      const y = n % 2 ? y1 - (top + dy) : y0 + top + dy;
      for (let dx = 0; dx < wide; dx++) if (tiles[y * w + x0 + dx] === '.') z[y * w + x0 + dx] = ch;
    }
  }
  return true;
}

/**
 * The Strip Mall's marked floor. Sections run up and down as on every design, but placed to fit
 * the U: centred in each arm over its whole height (one in an arm up to about two dozen tiles
 * wide, more in wider ones), and in the bend over the car park, as tall as the bend allows (the
 * patches are thinner there on the smaller stores, where the bend is low). Every other section,
 * counting from the left, is upside down. Patches stay a tile clear of every wall, the car park
 * included, of each other, and of the floor in front of the entrances and the tills.
 * @returns {string} one character per tile, as factoryPatches
 */
function stripPatches(w, h, tiles, doors) {
  const z = new Array(w * h).fill(' ');
  const { L, R, top } = lotPlan(w, h);
  const tall = h >= 30 ? 3 : 2;
  /** Where n sections go between columns p0 and p1 (a patch may use both), centred. */
  const spread = (p0, p1, least) => {
    const span = p1 - p0 + 1;
    let n = Math.max(least, Math.floor((span + 2) / 10));
    while (n > 0 && 10 * n - 6 > span) n--;
    const x = p0 + ((span - (10 * n - 6)) >> 1);
    return Array.from({ length: n }, (_, j) => x + 10 * j);
  };
  const arms = [...spread(2, L - 2, 1), ...spread(R + 2, w - 4, 1)];
  const bend = spread(L, R, 1);
  const all = [...arms.map((x) => [x, 'arm']), ...bend.map((x) => [x, 'bend'])].sort((a, b) => a[0] - b[0]);
  all.forEach(([x0, where], n) => {
    if (where === 'arm') laySection(z, w, tiles, doors, x0, n, 0, h - 1, tall);
    else for (let t = tall; t >= 1 && !laySection(z, w, tiles, doors, x0, n, 0, top, t); t--);
  });
  // Keep the floor right inside every entrance unmarked, as on every design.
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
