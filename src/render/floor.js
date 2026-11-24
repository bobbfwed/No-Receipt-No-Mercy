// The store itself: concrete floor, walls, pillars, partition walls, shelving, the entrances and
// the tills. Maps run from 30 x 16 to 121 x 67 tiles, and five designs:
//   warehouse  open floor with a few hazard-striped pillars
//   showroom   rooms divided by plasterboard partitions with framed two-tile doorways; each room
//              has its own floor tint, like the display rooms of a flat-pack shop
//   aisles     supermarket shelving units full of products, with sale signs on the end caps
//   food       a food court: cream tiled floor, shop-front awnings on the walls, and furniture
//              where state.decor says (tables, booths, benches, planters, bins, food stalls and a
//              fountain), each kind drawn in its own function below
//   carpark    a car park: asphalt with painted bays (zebra stripes on the walkway to the front
//              doors, yellow keep-clear boxes on the other ways through), a hedge and a fence on
//              the outer walls, and where state.decor says: parked cars, a prick parked across
//              two bays, trolley shelters, kerbed islands with lamp posts and pay machines,
//              abandoned trolleys, coned-off potholes and a burger van. It has a second bank of
//              tills in the bottom wall, with signs of its own.
//   corridors  the Back Passage: long breeze-block corridor walls with a pipe along the top,
//              hazard tape on the ends and stencilled signs (passageWalls)
// Most games also have marked floor for the factory machines (state.zones): tinted patches with a
// painted border and their name stencilled on, one colour per kind (ZONES in the rules).
// Almost all of it never changes, so it is painted into cached chunks (createFloorCache); only the
// entrance doors (open during a wave) and the till displays (each flashes on a refund there) are
// drawn every frame (drawDynamic).
import { ZONES } from '../sim/index.js';
import {
  TILE, INK, C, rr, paint, box, text, hazard, hash2, FONT_FAMILY,
} from './paint.js';

const T = TILE;

/** What a wall tile is, for drawing. FURN: the food court's furniture or the car park's cars (see state.decor). */
export const OUTER = 1, PILLAR = 2, PARTITION = 3, SHELF = 4, FURN = 5;

/** Floor tints for the showroom's rooms (one is picked per room). */
const ROOM_TINTS = [
  'rgba(214,164,103,0.20)', // light oak laminate
  'rgba(86,120,176,0.16)', // blue carpet
  'rgba(186,98,92,0.14)', // terracotta
  'rgba(118,168,110,0.15)', // sage
  'rgba(255,255,255,0.10)', // pale tiles
  'rgba(150,110,170,0.14)', // plum
];
const PRODUCT_COLOURS = ['#e8303a', '#2f8fe0', '#f2c21b', '#3fae49', '#ff8c1a', '#9b59b6', '#ffffff', '#e84393', '#14b8a6'];

// ---------------------------------------------------------------------------------------------
// Working out the map

/**
 * Everything the renderer needs to know about a floor plan, worked out once from the tiles.
 * @returns {Object} info: { w, h, tiles, design, wall (wall kind per tile), doorway (per tile:
 *   1 gap in a wall running across, 2 gap in a wall running up and down), tint (room tint per
 *   tile, -1 none), shelves [{x, y0, y1}], tills [i], tillTop, tillBot (rows of the bank in the
 *   right-hand wall), tillLeft, tillRight (columns of a bank in the bottom wall; tillLeft >=
 *   tillRight when there is none), doors [door], bays (the car park's rows of bays, see findBays) }
 *   door: { n, tiles: [a, b], side 'L'|'T'|'B'|'R', x0, y0 (top-left tile), open, frame:
 *   [vx, vy, ux, uy, ox, oy] (local x points into the store, local y along the doorway) }
 */
export function analyzeMap(s) {
  const w = s.w, h = s.h, tiles = s.tiles, n = w * h;
  const design = (s.map && s.map.design) || 'warehouse';
  const hashAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] === '#';
  const border = (x, y) => x === 0 || y === 0 || x === w - 1 || y === h - 1;
  const decor = decorOf(s);

  // Wall kinds. An inner wall tile with no inner wall next to it is a pillar whatever the design;
  // a tile the decor string says is furniture is furniture.
  const wall = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (tiles[i] !== '#') continue;
    const x = i % w, y = (i / w) | 0;
    if (border(x, y)) { wall[i] = OUTER; continue; }
    if (decor && decor[i] !== ' ') { wall[i] = FURN; continue; }
    let inner = 0;
    if (hashAt(x - 1, y) && !border(x - 1, y)) inner++;
    if (hashAt(x + 1, y) && !border(x + 1, y)) inner++;
    if (hashAt(x, y - 1) && !border(x, y - 1)) inner++;
    if (hashAt(x, y + 1) && !border(x, y + 1)) inner++;
    wall[i] = inner === 0 ? PILLAR : design === 'aisles' ? SHELF : PARTITION;
  }
  const solid = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const k = wall[y * w + x];
    return k === OUTER || k === PARTITION;
  };
  const floor = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] === '.';

  // Doorways: a gap exactly two tiles wide in a partition wall.
  const doorway = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!floor(x, y)) continue;
      const i = y * w + x;
      // In a wall that runs across: walls either side along the row, floor above and below.
      if (floor(x, y - 1) && floor(x, y + 1) &&
          ((solid(x - 1, y) && floor(x + 1, y) && solid(x + 2, y)) ||
           (solid(x + 1, y) && floor(x - 1, y) && solid(x - 2, y)))) doorway[i] = 1;
      else if (floor(x - 1, y) && floor(x + 1, y) &&
          ((solid(x, y - 1) && floor(x, y + 1) && solid(x, y + 2)) ||
           (solid(x, y + 1) && floor(x, y - 1) && solid(x, y - 2)))) doorway[i] = 2;
    }
  }
  // Without partitions there is nothing to call a doorway.
  if (design !== 'showroom') {
    let parts = 0;
    for (let i = 0; i < n; i++) if (wall[i] === PARTITION) { parts++; break; }
    if (!parts) doorway.fill(0);
  }

  // Showroom rooms: floor areas cut off from each other by partitions and doorways.
  const tint = new Int8Array(n).fill(-1);
  if (design === 'showroom') {
    const seen = new Uint8Array(n);
    const stack = [];
    for (let i = 0; i < n; i++) {
      if (seen[i] || tiles[i] !== '.' || doorway[i]) continue;
      const pick = (hash2(i % w, ((i / w) | 0) + 1000) * ROOM_TINTS.length) | 0;
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop();
        tint[j] = pick;
        const x = j % w, y = (j / w) | 0;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (seen[k] || tiles[k] !== '.' || doorway[k]) continue;
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
  }

  // Shelving units: runs of shelf tiles down a column.
  const shelves = [];
  for (let x = 1; x < w - 1; x++) {
    for (let y = 1; y < h - 1; y++) {
      if (wall[y * w + x] !== SHELF) continue;
      let y1 = y;
      while (y1 + 1 < h - 1 && wall[(y1 + 1) * w + x] === SHELF) y1++;
      shelves.push({ x, y0: y, y1 });
      y = y1;
    }
  }

  // Tills. Every design has a bank in the right-hand wall; the car park has a second one in the
  // bottom wall, which gets signs of its own, so the two are measured apart.
  const tills = [];
  let tillTop = h, tillBot = 0, tillLeft = w, tillRight = 0;
  for (let i = 0; i < n; i++) {
    if (tiles[i] !== 'T') continue;
    tills.push(i);
    const x = i % w, y = (i / w) | 0;
    if (y === h - 1 && x < w - 1) {
      tillLeft = Math.min(tillLeft, x);
      tillRight = Math.max(tillRight, x + 1);
    } else {
      tillTop = Math.min(tillTop, y);
      tillBot = Math.max(tillBot, y + 1);
    }
  }

  const doors = (s.doors || []).map((list, k) => {
    const a = Math.min(list[0], list[list.length - 1]);
    const ax = a % w, ay = (a / w) | 0;
    const side = ax === 0 ? 'L' : ay === 0 ? 'T' : ay === h - 1 ? 'B' : ax === w - 1 ? 'R' : 'L';
    let frame;
    if (side === 'L') frame = [1, 0, 0, 1, 0, ay * T];
    else if (side === 'R') frame = [-1, 0, 0, 1, w * T, ay * T];
    else if (side === 'T') frame = [0, 1, 1, 0, ax * T, 0];
    else frame = [0, -1, 1, 0, ax * T, h * T];
    return { n: k, tiles: list.slice(), side, x0: ax, y0: ay, open: tiles[a] === 'D', frame };
  });

  const zones = typeof s.zones === 'string' && s.zones.length === n ? s.zones : '';
  const patches = zones ? findPatches(w, h, zones, doorway) : [];
  const blocks = decor ? findBlocks(w, h, decor) : [];
  const bays = decor && design === 'carpark' ? findBays(w, h, tiles, decor) : [];
  const runs = design === 'corridors' ? findRuns(w, h, wall) : [];

  return {
    w, h, tiles, design, wall, doorway, tint, shelves, tills, tillTop, tillBot, tillLeft, tillRight,
    doors, zones, patches, decor, blocks, bays, runs,
  };
}

/** The state's decor string if it fits the map, else '' (other designs, and saves from before it). */
const decorOf = (s) => (typeof s.decor === 'string' && s.decor.length === s.w * s.h ? s.decor : '');

/** True if the analysed map no longer matches the state (a new game, or an entrance opened). */
export function mapChanged(info, s) {
  return !info || info.w !== s.w || info.h !== s.h || info.tiles !== s.tiles ||
    info.design !== ((s.map && s.map.design) || 'warehouse') ||
    info.zones !== (typeof s.zones === 'string' && s.zones.length === s.w * s.h ? s.zones : '') ||
    info.decor !== decorOf(s);
}

/** Decor characters drawn as part of a bigger piece (findBlocks), never tile by tile. */
const BLOCK_CH = new Set(['k', 'f', 'x', 'v', 'i', 'l', 'm']);
const isIsland = (ch) => ch === 'i' || ch === 'l' || ch === 'm';

/**
 * The pieces bigger than a tile, each drawn as one: every connected block of food stall ('k'),
 * fountain ('f') or burger van ('v') tiles; each car parked across two bays ('x', always two tiles
 * each way, so it is cut out by its top-left tile in case two ever touch); and each kerbed island
 * (a run along a row of 'i', 'l' and 'm' tiles, given ch 'i').
 * @returns {Array} { ch, x0, y0, x1, y1 } (exclusive end)
 */
function findBlocks(w, h, decor) {
  const seen = new Uint8Array(w * h);
  const blocks = [];
  for (let i = 0; i < w * h; i++) {
    const ch = decor[i];
    if (seen[i]) continue;
    if (ch === 'x') {
      const x = i % w, y = (i / w) | 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const k = (y + dy) * w + x + dx;
          if (x + dx < w && y + dy < h && decor[k] === 'x') seen[k] = 1;
        }
      }
      blocks.push({ ch, x0: x, y0: y, x1: x + 2, y1: y + 2 });
      continue;
    }
    if (isIsland(ch)) {
      const x = i % w, y = (i / w) | 0;
      let e = x;
      while (e < w && isIsland(decor[y * w + e])) seen[y * w + e++] = 1;
      blocks.push({ ch: 'i', x0: x, y0: y, x1: e, y1: y + 1 });
      continue;
    }
    if (ch !== 'k' && ch !== 'f' && ch !== 'v') continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % w, y = (j / w) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (seen[k] || decor[k] !== ch) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
    blocks.push({ ch, x0, y0, x1, y1 });
  }
  return blocks;
}

/**
 * The car park's rows of bays, for painting the lines. A row is bounded by a kerbed island at
 * its top and another below it in the same columns; every tile row between them is a row of
 * bays, whatever is parked there. A tile row of the bays with nothing in it at all is a way
 * through; the one at the height of the store's front doors ((h >> 1) - 1 and h >> 1, as the
 * rules lay it out) is the walkway to them.
 * @returns {Array} rows, left to right: { x0, x1, y0, y1 (the bays, exclusive end), across (bays
 *   side by side, 1 or 2), way: [per tile row from y0: 0 bays, 1 a way through, 2 the walkway] }
 */
function findBays(w, h, tiles, decor) {
  const runs = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isIsland(decor[y * w + x])) continue;
      let e = x;
      while (e < w && isIsland(decor[y * w + e])) e++;
      runs.push({ x0: x, x1: e, y, used: false });
      x = e;
    }
  }
  const walk = (h >> 1) - 1;
  const rows = [];
  for (const a of runs) {
    if (a.used) continue;
    // Runs are listed top to bottom, so the first match below is this island's partner.
    const b = runs.find((o) => !o.used && o !== a && o.y > a.y + 1 && o.x0 === a.x0 && o.x1 === a.x1);
    if (!b) continue;
    a.used = b.used = true;
    const row = { x0: a.x0, x1: a.x1, y0: a.y + 1, y1: b.y, across: (a.x1 - a.x0) >= 4 ? 2 : 1, way: [] };
    for (let y = row.y0; y < row.y1; y++) {
      let empty = true;
      for (let x = row.x0; x < row.x1; x++) if (tiles[y * w + x] !== '.') empty = false;
      row.way.push(!empty ? 0 : y === walk || y === walk + 1 ? 2 : 1);
    }
    rows.push(row);
  }
  return rows.sort((p, q) => p.x0 - q.x0);
}

/**
 * The marked floor for the factory machines, cut into patches: each patch is one connected area
 * of one kind (a wall through a patch makes two). Patches never change during a game, so all of
 * this is worked out once.
 * @returns {Array} patches: { ch, color, name, cells [i], inside (Set of cells), width (of the
 *   map), x0, y0, x1, y1 (tile bounds, exclusive
 *   end), edges [x1, y1, x2, y2, ...] (the outline in tiles), label { cx, cy, room } | null
 *   (where the name goes, in logical pixels, and how wide it may be) }
 */
function findPatches(w, h, zones, doorway) {
  const n = w * h;
  const seen = new Uint8Array(n);
  const patches = [];
  const stack = [];
  for (let i = 0; i < n; i++) {
    const ch = zones[i];
    if (seen[i] || !ZONES[ch]) continue;
    const cells = [];
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop();
      cells.push(j);
      const x = j % w, y = (j / w) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (seen[k] || zones[k] !== ch) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
    const inside = new Set(cells);
    const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && inside.has(y * w + x);
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    const edges = [];
    for (const j of cells) {
      const x = j % w, y = (j / w) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
      if (!has(x, y - 1)) edges.push(x, y, x + 1, y);
      if (!has(x, y + 1)) edges.push(x, y + 1, x + 1, y + 1);
      if (!has(x - 1, y)) edges.push(x, y, x, y + 1);
      if (!has(x + 1, y)) edges.push(x + 1, y, x + 1, y + 1);
    }
    patches.push({
      ch, color: ZONES[ch].color, name: ZONES[ch].name.toUpperCase(), cells, inside, width: w, x0, y0, x1, y1, edges,
      // A doorway's frame is drawn over the floor, so the name keeps off doorway tiles.
      label: labelSpot((x, y) => has(x, y) && !doorway[y * w + x], x0, y0, x1, y1),
    });
  }
  return patches;
}

/**
 * Where to stencil a patch's name: on the widest full run of floor, either along one row or
 * straddling two rows, preferring the middle of the patch. Returns null for a patch too small.
 * @returns {{cx, cy, room, two}|null} centre and usable width in logical pixels; `two` is the
 *   best spot two rows tall (or null)
 */
function labelSpot(has, x0, y0, x1, y1) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  let best = null, best2 = null;
  const consider = (ax, bx, cy, rows) => {
    const wide = bx - ax, cx = (ax + bx) / 2;
    const off = Math.abs(cx - mx) + Math.abs(cy - my);
    const better = (b) => !b || wide > b.wide || (wide === b.wide && off < b.off);
    if (better(best)) best = { wide, off, cx, cy };
    if (rows === 2 && better(best2)) best2 = { wide, off, cx, cy };
  };
  for (let y = y0; y < y1; y++) {
    for (const rows of [1, 2]) {
      if (y + rows > y1) continue;
      for (let x = x0; x < x1; x++) {
        let ok = true;
        for (let r = 0; r < rows; r++) if (!has(x, y + r)) ok = false;
        if (!ok) continue;
        let e = x;
        while (e < x1) {
          let all = true;
          for (let r = 0; r < rows; r++) if (!has(e, y + r)) all = false;
          if (!all) break;
          e++;
        }
        consider(x, e, y + rows / 2, rows);
        x = e;
      }
    }
  }
  if (!best || best.wide < 2) return null;
  return {
    cx: best.cx * T, cy: best.cy * T, room: best.wide * T,
    // A spot two rows tall, for writing a two-word name on two lines when one line is too long.
    two: best2 && best2.wide >= 2 ? { cx: best2.cx * T, cy: best2.cy * T, room: best2.wide * T } : null,
  };
}

// ---------------------------------------------------------------------------------------------
// The cached layer

/** Tiles per side of a cached chunk. */
const CHUNK = 16;

/**
 * A cache of the static floor, cut into square chunks, so a big map never needs one enormous
 * offscreen canvas and only the visible part is ever painted. Chunks are painted at the exact zoom
 * (so they are copied to the screen 1:1, which is much faster than scaling) and, while the zoom is
 * changing, at a few fixed steps; chunks not drawn lately are thrown away.
 */
export function createFloorCache() {
  let info = null;
  const chunks = new Map(); // key -> { c, used }
  const levels = new Set();
  let pixels = 0;
  let frame = 0;

  function reset(newInfo) {
    info = newInfo;
    chunks.clear();
    levels.clear();
    pixels = 0;
  }

  // A resolution is keyed by device pixels per logical pixel, to a thousandth.
  const keyOf = (level, cx, cy) => level * 1e6 + cy * 1000 + cx;

  function build(level, cx, cy) {
    const tw = Math.min(CHUNK, info.w - cx * CHUNK), th = Math.min(CHUNK, info.h - cy * CHUNK);
    const res = level / 1000; // device pixels per logical pixel
    const c = document.createElement('canvas');
    // Sized exactly as it will be drawn at this resolution, so at that zoom it is copied 1:1.
    const X0 = cx * CHUNK * T, Y0 = cy * CHUNK * T;
    c.width = Math.max(1, Math.round((X0 + tw * T) * res) - Math.round(X0 * res));
    c.height = Math.max(1, Math.round((Y0 + th * T) * res) - Math.round(Y0 * res));
    const g = c.getContext('2d');
    const kx = c.width / (tw * T), ky = c.height / (th * T);
    g.setTransform(kx, 0, 0, ky, -cx * CHUNK * T * kx, -cy * CHUNK * T * ky);
    // On-screen size of a tile in CSS pixels, so painted lettering can be sized for the eye.
    const zoom = (res * T) / (globalThis.devicePixelRatio || 1);
    drawChunk(g, info, cx * CHUNK, cy * CHUNK, cx * CHUNK + tw, cy * CHUNK + th, zoom);
    const entry = { c, used: frame };
    chunks.set(keyOf(level, cx, cy), entry);
    levels.add(level);
    pixels += c.width * c.height;
    return entry;
  }

  /** Throws away chunks not drawn lately once the cache holds more than `budget` pixels. */
  function trim(budget) {
    if (pixels <= budget) return;
    const old = [...chunks.entries()].filter(([, e]) => e.used < frame).sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of old) {
      if (pixels <= budget * 0.75) break;
      chunks.delete(k);
      pixels -= e.c.width * e.c.height;
    }
    levels.clear();
    for (const k of chunks.keys()) levels.add(Math.floor(k / 1e6));
  }

  /**
   * Draws the visible part of the floor with the identity transform.
   * @param {number} scale device pixels per logical pixel
   * @param {number} res the resolution to paint chunks at (device pixels per logical pixel): the
   *   scale itself while the zoom is still, a nearby fixed step while it is changing
   * @param {number} ox whole device pixels
   * @param {{x0:number, y0:number, x1:number, y1:number}} view visible tiles (exclusive end)
   */
  function draw(ctx, scale, res, ox, oy, view) {
    if (!info) return;
    const level = Math.max(1, Math.round(res * 1000));
    frame++;
    let builds = 0;
    const cx0 = Math.max(0, Math.floor(view.x0 / CHUNK)), cx1 = Math.min(Math.ceil(info.w / CHUNK), Math.ceil(view.x1 / CHUNK));
    const cy0 = Math.max(0, Math.floor(view.y0 / CHUNK)), cy1 = Math.min(Math.ceil(info.h / CHUNK), Math.ceil(view.y1 / CHUNK));
    const S = T * scale;
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        let e = chunks.get(keyOf(level, cx, cy));
        if (!e) {
          // Painting a chunk takes a few milliseconds: paint a handful per frame and show another
          // resolution of the same chunk meanwhile, so zooming across a step never stalls.
          if (builds >= 4) {
            for (const lv of levels) {
              const alt = chunks.get(keyOf(lv, cx, cy));
              if (alt) { e = alt; break; }
            }
          }
          if (!e) { e = build(level, cx, cy); builds++; }
        }
        e.used = frame;
        const tx0 = cx * CHUNK, ty0 = cy * CHUNK;
        const tx1 = Math.min(info.w, tx0 + CHUNK), ty1 = Math.min(info.h, ty0 + CHUNK);
        // Whole device pixels at both ends, shared with the neighbouring chunk, so there are no seams.
        const dx0 = ox + Math.round(tx0 * S), dx1 = ox + Math.round(tx1 * S);
        const dy0 = oy + Math.round(ty0 * S), dy1 = oy + Math.round(ty1 * S);
        ctx.drawImage(e.c, dx0, dy0, dx1 - dx0, dy1 - dy0);
      }
    }
    trim(Math.max(6e6, ctx.canvas.width * ctx.canvas.height * 3));
  }

  return { reset, draw, get info() { return info; } };
}

// ---------------------------------------------------------------------------------------------
// Painting one chunk

/**
 * Paints the static floor for tiles [x0, x1) x [y0, y1). The caller has set the world transform.
 * Things that spill into neighbouring tiles (shadows, signs, shelving runs) are drawn for a margin
 * around the chunk and clipped, so every chunk shows the same picture at its edges.
 * @param {number} [zoom] CSS pixels per tile the chunk will be shown at (for lettering size)
 */
export function drawChunk(g, info, x0, y0, x1, y1, zoom = 40) {
  g.save();
  g.beginPath();
  g.rect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T);
  g.clip();
  const r = {
    x0: Math.max(0, x0 - 2), y0: Math.max(0, y0 - 2),
    x1: Math.min(info.w, x1 + 2), y1: Math.min(info.h, y1 + 2),
  };
  drawConcrete(g, info, r, x0, y0, x1, y1, zoom);
  drawWalls(g, info, r);
  drawInnerWalls(g, info, r, zoom);
  if (info.decor) drawFurniture(g, info, r, zoom);
  const { tiles, w } = info;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (tiles[y * w + x] === 'T') drawTill(g, x * T, y * T);
    }
  }
  for (const d of info.doors) drawDoorStatic(g, d, tiles);
  drawSigns(g, info);
  g.restore();
}

function drawConcrete(g, info, r, x0, y0, x1, y1, zoom) {
  const { w, h, tiles, tint } = info;
  const food = info.design === 'food', park = info.design === 'carpark';
  // The food court and the car park have floor colours of their own.
  const pal = food ? FOOD : park ? PARK : null;
  g.fillStyle = pal ? pal.floor : info.design === 'aisles' ? '#979a9c' : C.floor;
  g.fillRect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T);

  if (food) foodFloor(g, info, r);
  else if (park) parkFloor(g, info, r);
  // Slightly lighter and darker concrete slabs, and the odd oil spot, so the floor is not flat.
  else for (let y = Math.max(1, r.y0); y < Math.min(h - 1, r.y1); y++) {
    for (let x = Math.max(1, r.x0); x < Math.min(w - 1, r.x1); x++) {
      const v = hash2(x, y);
      if (v < 0.18) {
        g.fillStyle = v < 0.07 ? 'rgba(40,42,46,0.06)' : 'rgba(255,255,255,0.045)';
        g.fillRect(x * T, y * T, T, T);
      } else if (v > 0.965) {
        g.fillStyle = 'rgba(30,32,36,0.10)';
        g.beginPath();
        g.ellipse(x * T + 20, y * T + 22, 9, 6, 0, 0, Math.PI * 2);
        g.ellipse(x * T + 27, y * T + 17, 4, 3, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Showroom rooms each get their own floor colour.
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const t = tint[y * w + x];
      if (t < 0) continue;
      g.fillStyle = ROOM_TINTS[t];
      g.fillRect(x * T, y * T, T, T);
    }
  }

  // Tile grid.
  const X0 = r.x0 * T, X1 = r.x1 * T, Y0 = r.y0 * T, Y1 = r.y1 * T;
  g.beginPath();
  for (let x = r.x0; x <= r.x1; x++) { g.moveTo(x * T + 0.5, Y0); g.lineTo(x * T + 0.5, Y1); }
  for (let y = r.y0; y <= r.y1; y++) { g.moveTo(X0, y * T + 0.5); g.lineTo(X1, y * T + 0.5); }
  g.strokeStyle = pal ? pal.grout : C.floorLine;
  g.lineWidth = 1.5;
  g.stroke();
  // Expansion joints every five tiles across and four down, a little darker. (Tarmac has none.)
  if (!park) {
    g.beginPath();
    for (let x = Math.ceil(r.x0 / 5) * 5; x <= r.x1; x += 5) { if (x > 0 && x < w) { g.moveTo(x * T + 0.5, Y0); g.lineTo(x * T + 0.5, Y1); } }
    for (let y = Math.ceil(r.y0 / 4) * 4; y <= r.y1; y += 4) { if (y > 0 && y < h) { g.moveTo(X0, y * T + 0.5); g.lineTo(X1, y * T + 0.5); } }
    g.strokeStyle = food ? FOOD.joint : C.joint;
    g.lineWidth = 2.5;
    g.stroke();
  }
  // A small dot in the middle of every floor tile helps judge positions.
  g.fillStyle = pal ? pal.dot : C.floorDot;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (tiles[y * w + x] === '.') g.fillRect(x * T + 19, y * T + 19, 3, 3);
    }
  }
  if (park) parkMarkings(g, info, r);
  // Painted floor markings: a yellow safety line along the outer walls, and hatched "keep clear"
  // zones inside the open entrances and in front of the tills.
  g.strokeStyle = 'rgba(242,194,27,0.75)';
  g.lineWidth = 3;
  g.setLineDash([14, 8]);
  g.strokeRect(T + 6, T + 6, (w - 2) * T - 12, (h - 2) * T - 12);
  g.setLineDash([]);
  // The machines' marked floor, painted over the safety line where they meet.
  for (const p of info.patches) {
    if (p.x1 <= x0 || p.x0 >= x1 || p.y1 <= y0 || p.y0 >= y1) continue;
    drawPatch(g, p, zoom);
  }
  // In front of each till: the floor tile next to it, on the store side of whichever wall it is in.
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (tiles[y * w + x] !== 'T') continue;
      const fx = x === w - 1 ? x - 1 : x === 0 ? x + 1 : x;
      const fy = fx !== x ? y : y === h - 1 ? y - 1 : y === 0 ? y + 1 : y;
      hatch(g, fx * T, fy * T, T, T);
    }
  }
  for (const d of info.doors) {
    if (!d.open) continue;
    g.save();
    g.transform(...d.frame);
    hatch(g, T, 0, T, 2 * T);
    g.restore();
  }
}

/** Faint diagonal yellow stripes painted on the floor. */
function hatch(g, x, y, w, h) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.strokeStyle = 'rgba(242,194,27,0.42)';
  g.lineWidth = 5;
  g.beginPath();
  for (let s = -h; s < w; s += 13) { g.moveTo(x + s, y + h); g.lineTo(x + s + h, y); }
  g.stroke();
  g.restore();
}

/** Paint for each kind of marked floor, worked out once from its colour. */
const zonePaint = new Map();
function zoneStyle(color) {
  let st = zonePaint.get(color);
  if (st) return st;
  const n = parseInt(color.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const ink = [29, 33, 37];
  const mix = (k) => c.map((v, j) => Math.round(v * (1 - k) + ink[j] * k)).join(',');
  st = {
    fill: `rgba(${c.join(',')},0.24)`,
    band: `rgba(${c.join(',')},0.92)`,
    // The lettering is a darker shade of the same paint, so it reads on grey concrete.
    letters: `rgba(${mix(0.62)},0.92)`,
  };
  zonePaint.set(color, st);
  return st;
}

/** How far in from a patch's edge its painted border starts and ends (logical pixels). */
const BAND_IN = 2.5, BAND_OUT = 7.5;

/**
 * One patch of marked floor: a tint over every tile, a painted border just inside its outline
 * (following any notch a wall cuts into it), and its name stencilled once across the middle.
 * Buildings cover the middle of a tile, so the tint and the border still show round them.
 */
function drawPatch(g, p, zoom) {
  const st = zoneStyle(p.color);
  const W = p.width, inside = p.inside;
  const has = (x, y) => x >= 0 && y >= 0 && x < W && inside.has(y * W + x);

  g.fillStyle = st.fill;
  g.beginPath();
  for (const i of p.cells) g.rect((i % W) * T, ((i / W) | 0) * T, T, T);
  g.fill();

  // The border: one band per outside edge of each tile, lengthened or shortened at its ends so
  // the bands meet cleanly at outside corners and wrap round inside corners. All the bands go into
  // one path and are filled once, so where they overlap the paint is not doubled.
  const A = BAND_IN, B = BAND_OUT;
  g.beginPath();
  for (const i of p.cells) {
    const x = i % W, y = (i / W) | 0;
    const X = x * T, Y = y * T;
    // Ends of a band that runs across (top or bottom edge); oy is the row outside that edge.
    const across = (oy) => {
      const s0 = !has(x - 1, y) ? A : has(x - 1, oy) ? -B : 0;
      const s1 = !has(x + 1, y) ? -A : has(x + 1, oy) ? B : 0;
      return [X + s0, X + T + s1];
    };
    const down = (ox) => {
      const s0 = !has(x, y - 1) ? A : has(ox, y - 1) ? -B : 0;
      const s1 = !has(x, y + 1) ? -A : has(ox, y + 1) ? B : 0;
      return [Y + s0, Y + T + s1];
    };
    if (!has(x, y - 1)) { const [a, b] = across(y - 1); g.rect(a, Y + A, b - a, B - A); }
    if (!has(x, y + 1)) { const [a, b] = across(y + 1); g.rect(a, Y + T - B, b - a, B - A); }
    if (!has(x - 1, y)) { const [a, b] = down(x - 1); g.rect(X + A, a, B - A, b - a); }
    if (!has(x + 1, y)) { const [a, b] = down(x + 1); g.rect(X + T - B, a, B - A, b - a); }
  }
  g.fillStyle = st.band;
  g.fill();

  // The name, sized for the eye: big enough to read at 24 pixels a tile, no bigger on screen
  // when zoomed right in, and left off when it would only be a smudge.
  const lab = p.label;
  if (!lab) return;
  const base = Math.min(15, (17 * T) / Math.max(1, zoom));
  const spacing = 1.5;
  const spaced = 'letterSpacing' in g;
  if (spaced) g.letterSpacing = `${spacing}px`;
  g.font = `900 ${base}px ${FONT_FAMILY}`;
  // The size that fits each line in a width (never above the base size).
  const fit = (lines, room) => {
    let wide = 0;
    for (const s of lines) wide = Math.max(wide, g.measureText(s).width);
    return Math.min(base, (base * (room - 2 * B - 6)) / wide);
  };
  let lines = [p.name], at = lab;
  let size = fit(lines, lab.room);
  // Too long for one line: two words on two lines, if there is a spot two rows tall.
  const sp = p.name.indexOf(' ');
  if (size < base && sp > 0 && lab.two) {
    const two = [p.name.slice(0, sp), p.name.slice(sp + 1)];
    const size2 = Math.min(fit(two, lab.two.room), (2 * T - 2 * B) / 2.6);
    // Only worth it when the letters come out clearly bigger: one line reads better.
    if (size2 > size * 1.25) { lines = two; at = lab.two; size = size2; }
  }
  if ((size * zoom) / T >= 8) {
    g.font = `900 ${size}px ${FONT_FAMILY}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = st.letters;
    // letterSpacing adds space after the last letter too; nudge back by half of it to centre.
    const nudge = spaced ? spacing / 2 : 0;
    const gap = size * 1.1;
    lines.forEach((s, k) => g.fillText(s, at.cx + nudge, at.cy + 1 + (k - (lines.length - 1) / 2) * gap));
  }
  if (spaced) g.letterSpacing = '0px';
}

/** The outer walls: dark, with a lighter lip and an ink line where they meet the floor. */
function drawWalls(g, info, r) {
  const { w, h, tiles, wall } = info;
  const isWall = (x, y) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] === '#';
  g.fillStyle = C.wall;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (wall[y * w + x] === OUTER) g.fillRect(x * T, y * T, T, T);
    }
  }
  g.beginPath();
  g.fillStyle = C.wallLip;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (wall[y * w + x] !== OUTER) continue;
      const px = x * T, py = y * T;
      if (!isWall(x, y + 1)) { g.fillRect(px, py + T - 7, T, 7); g.moveTo(px, py + T); g.lineTo(px + T, py + T); }
      if (!isWall(x, y - 1)) { g.fillRect(px, py, T, 4); g.moveTo(px, py); g.lineTo(px + T, py); }
      if (!isWall(x + 1, y)) { g.fillRect(px + T - 6, py, 6, T); g.moveTo(px + T, py); g.lineTo(px + T, py + T); }
      if (!isWall(x - 1, y)) { g.fillRect(px, py, 6, T); g.moveTo(px, py); g.lineTo(px, py + T); }
    }
  }
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.stroke();

  // The food court has shop fronts along the top and bottom walls: striped awnings.
  if (info.design === 'food') {
    for (const wy of [0, h - 1]) {
      if (wy < r.y0 || wy >= r.y1) continue;
      for (let x = Math.max(1, r.x0); x < Math.min(w - 1, r.x1); x++) {
        if (tiles[wy * w + x] !== '#') continue;
        const col = FOOD.awnings[((x / 4) | 0) % FOOD.awnings.length];
        const px = x * T, py = wy === 0 ? wy * T + 18 : wy * T + 4;
        g.fillStyle = (x & 1) ? col : '#fbf4e4';
        g.fillRect(px, py, T, 14);
        g.beginPath();
        g.moveTo(px, py + 14); g.lineTo(px + T, py + 14);
        g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
      }
    }
    return;
  }
  // The car park is outdoors: a hedge along the top and left, a fence along the bottom.
  if (info.design === 'carpark') {
    parkBoundary(g, info, r);
    return;
  }
  // Pallet racking along the top and bottom walls: orange beams and boxes, purely decoration.
  for (const wy of [0, h - 1]) {
    if (wy < r.y0 || wy >= r.y1) continue;
    for (let x = Math.max(1, r.x0); x < Math.min(w - 1, r.x1); x++) {
      if (tiles[wy * w + x] !== '#') continue;
      const px = x * T, py = wy * T + (wy === 0 ? 4 : 10);
      g.fillStyle = '#e8761a';
      g.fillRect(px, py + (wy === 0 ? 22 : 2), T, 4);
      if (x % 3 === 0) { g.fillStyle = '#2f6fbf'; g.fillRect(px - 2, py, 4, 28); }
      const v = hash2(x, wy + 50);
      if (v < 0.75) {
        const bw = 14 + v * 12, bh = 12 + v * 6;
        box(g, px + 4 + v * 6, py + (wy === 0 ? 22 - bh : 6), bw, bh, 1.5, v < 0.25 ? '#4b8fd0' : C.cardboard, 1.5);
        if (v >= 0.25) { g.fillStyle = C.cardboardLight; g.fillRect(px + 4 + v * 6 + bw / 2 - 2, py + (wy === 0 ? 22 - bh : 6) + 1, 4, bh - 2); }
      }
    }
  }
}

/** Pillars, showroom partitions with their doorways, and supermarket shelving. */
function drawInnerWalls(g, info, r, zoom) {
  const { w, h, wall, doorway } = info;
  const kindAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? OUTER : wall[y * w + x]);
  const solid = (x, y) => { const k = kindAt(x, y); return k === OUTER || k === PARTITION; };

  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (wall[y * w + x] === PILLAR) drawPillar(g, x * T, y * T);
    }
  }
  // The Back Passage's corridor walls are breeze block, not plasterboard.
  if (info.design === 'corridors') {
    passageWalls(g, info, r, zoom);
    return;
  }

  // Partitions: shadows on the floor first, then the wall tops over them.
  g.fillStyle = 'rgba(0,0,0,0.2)';
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (wall[y * w + x] !== PARTITION) continue;
      if (!solid(x, y + 1)) g.fillRect(x * T + 3, (y + 1) * T, T, 6);
      if (!solid(x + 1, y)) g.fillRect((x + 1) * T, y * T + 5, 5, T);
    }
  }
  g.beginPath();
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (wall[y * w + x] !== PARTITION) continue;
      const px = x * T, py = y * T;
      g.fillStyle = '#e4ddcf';
      g.fillRect(px, py, T, T);
      // The front face, where the wall drops to the floor below it.
      if (!solid(x, y + 1)) { g.fillStyle = '#b3a993'; g.fillRect(px, py + T - 9, T, 9); }
      // Panel seams.
      g.fillStyle = 'rgba(120,108,90,0.35)';
      if (solid(x + 1, y) && kindAt(x + 1, y) === PARTITION && !solid(x, y + 1)) g.fillRect(px + T - 1, py + 3, 2, T - 12);
      if (solid(x, y + 1) && kindAt(x, y + 1) === PARTITION && !solid(x + 1, y)) g.fillRect(px + 3, py + T - 1, T - 6, 2);
      if (!solid(x, y + 1)) { g.moveTo(px, py + T); g.lineTo(px + T, py + T); g.moveTo(px, py + T - 9); g.lineTo(px + T, py + T - 9); }
      if (!solid(x, y - 1)) { g.moveTo(px, py); g.lineTo(px + T, py); }
      if (!solid(x + 1, y)) { g.moveTo(px + T, py); g.lineTo(px + T, py + T); }
      if (!solid(x - 1, y)) { g.moveTo(px, py); g.lineTo(px, py + T); }
    }
  }
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  g.stroke();

  // Doorways: a wooden frame post on each side and a threshold strip across the gap.
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const o = doorway[y * w + x];
      if (!o) continue;
      const px = x * T, py = y * T;
      if (o === 1) {
        box(g, px, py + T / 2 - 5, T, 10, 0, '#c8a070', 0);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(px, py + T / 2 + 3, T, 2);
        g.strokeStyle = INK; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(px, py + T / 2 - 5); g.lineTo(px + T, py + T / 2 - 5); g.moveTo(px, py + T / 2 + 5); g.lineTo(px + T, py + T / 2 + 5); g.stroke();
        if (solid(x - 1, y)) box(g, px - 7, py - 3, 8, T + 6, 2, '#6b4a2b', 2);
        if (solid(x + 1, y)) box(g, px + T - 1, py - 3, 8, T + 6, 2, '#6b4a2b', 2);
      } else {
        box(g, px + T / 2 - 5, py, 10, T, 0, '#c8a070', 0);
        g.strokeStyle = INK; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(px + T / 2 - 5, py); g.lineTo(px + T / 2 - 5, py + T); g.moveTo(px + T / 2 + 5, py); g.lineTo(px + T / 2 + 5, py + T); g.stroke();
        if (solid(x, y - 1)) box(g, px - 3, py - 7, T + 6, 8, 2, '#6b4a2b', 2);
        if (solid(x, y + 1)) box(g, px - 3, py + T - 1, T + 6, 8, 2, '#6b4a2b', 2);
      }
    }
  }

  // Shelving units, each drawn whole (clipped to the chunk).
  for (const sh of info.shelves) {
    if (sh.x < r.x0 - 1 || sh.x > r.x1 || sh.y1 < r.y0 - 1 || sh.y0 > r.y1) continue;
    drawShelf(g, sh);
  }
}

/** An inner wall tile on its own: a concrete pillar wrapped in a hazard-striped guard. */
function drawPillar(g, px, py) {
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(px + 4, py + 6, T - 2, T - 2);
  hazard(g, px + 2, py + 2, T - 4, T - 4, 6);
  box(g, px + 8, py + 7, T - 16, T - 16, 2, '#9ea3a8', 2.5);
  g.fillStyle = '#b8bdc2';
  g.fillRect(px + 10, py + 9, T - 20, 5);
}

/** A supermarket shelving unit seen from above: products on both sides, sale signs on the ends. */
function drawShelf(g, sh) {
  const px = sh.x * T, top = sh.y0 * T, bot = (sh.y1 + 1) * T;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(px + 6, top + 7, T - 8, bot - top - 6);
  box(g, px + 2, top + 2, T - 4, bot - top - 4, 3, '#cfd4da', 2.5);
  // The spine down the middle, with the shelf edges either side.
  g.fillStyle = '#8a9099';
  g.fillRect(px + T / 2 - 2, top + 4, 4, bot - top - 8);
  // Products: packets, cans and bottles, in rows on both faces.
  for (let y = sh.y0; y <= sh.y1; y++) {
    for (let side = 0; side < 2; side++) {
      const sx = side ? px + T / 2 + 3 : px + 5;
      for (let k = 0; k < 3; k++) {
        const v = hash2(sh.x * 2 + side, y * 3 + k);
        const col = PRODUCT_COLOURS[(v * PRODUCT_COLOURS.length) | 0];
        const sy = y * T + 3 + k * 12;
        if (sy + 10 > bot - 3 || sy < top + 3) continue;
        if (v < 0.4) {
          box(g, sx, sy, 12, 10, 1.5, col, 1.3);
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.fillRect(sx + 2, sy + 2, 8, 2);
        } else if (v < 0.75) {
          g.beginPath();
          g.arc(sx + 3.2, sy + 5, 3, 0, Math.PI * 2);
          g.moveTo(sx + 12, sy + 5);
          g.arc(sx + 8.8, sy + 5, 3, 0, Math.PI * 2);
          paint(g, col, 1.2);
        } else {
          rr(g, sx + 1, sy + 1, 10, 8, 4);
          paint(g, col, 1.2);
          g.fillStyle = '#ffffff';
          g.fillRect(sx + 4, sy + 3, 4, 4);
        }
      }
    }
  }
  // Sale signs on the end caps.
  box(g, px + 3, top + 3, T - 6, 10, 2, C.red, 1.8);
  text(g, 'SALE', px + T / 2, top + 8.5, 8, '#ffffff', 900);
  if (sh.y1 > sh.y0) {
    box(g, px + 3, bot - 13, T - 6, 10, 2, C.yellow, 1.8);
    text(g, '50%', px + T / 2, bot - 7.5, 8, INK, 900);
  }
}

// ---------------------------------------------------------------------------------------------
// The Back Passage: breeze-block corridor walls painted the grey-green of every service corridor
// ever built, a pipe along the top of each, hazard tape on every end the crowd squeezes round,
// and stencilled signs on the long runs.

const PASSAGE = {
  top: '#a9b2ac', mortar: 'rgba(58,68,64,0.30)', face: '#77837d', kick: '#d6ad2a',
  pipes: ['#b8463a', '#3f78b8', '#d9d4c4'],
};
/** What is stencilled on the long runs of corridor wall (picked by a hash of where the run is). */
const PASSAGE_SIGNS = [
  'STAFF ONLY', 'REAR ENTRY ONLY', 'TRADESMEN\'S ENTRANCE', 'GOODS IN (ROUND THE BACK)', 'MIND YOUR BACK',
  'TIGHT SQUEEZE', 'PUSH HARD', 'DELIVERIES AT THE REAR', 'NO LOITERING', 'KEEP IT MOVING', 'BACK PASSAGE',
  'NO ENTRY (MOSTLY)',
];

/** The runs of corridor wall along each row, as { y, x0, x1 } (x1 exclusive), for the signs. */
function findRuns(w, h, wall) {
  const runs = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (wall[y * w + x] !== PARTITION) continue;
      let e = x;
      while (e + 1 < w - 1 && wall[y * w + e + 1] === PARTITION) e++;
      runs.push({ y, x0: x, x1: e + 1 });
      x = e;
    }
  }
  return runs;
}

function passageWalls(g, info, r, zoom) {
  const { w, h, wall } = info;
  const isPart = (x, y) => x >= 0 && y >= 0 && x < w && y < h && wall[y * w + x] === PARTITION;
  const solid = (x, y) => x < 0 || y < 0 || x >= w || y >= h || wall[y * w + x] === OUTER || wall[y * w + x] === PARTITION;
  // Shadows on the floor first.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (!isPart(x, y)) continue;
      if (!solid(x, y + 1)) g.fillRect(x * T + 3, (y + 1) * T, T, 7);
      if (!solid(x + 1, y)) g.fillRect((x + 1) * T, y * T + 5, 5, T);
    }
  }
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (!isPart(x, y)) continue;
      const px = x * T, py = y * T;
      const face = !solid(x, y + 1);
      g.fillStyle = PASSAGE.top;
      g.fillRect(px, py, T, T);
      // Courses of blocks along the cap, every other course offset by half a block.
      const capH = face ? T - 11 : T;
      g.fillStyle = PASSAGE.mortar;
      for (let c = 1; c * 10 < capH; c++) g.fillRect(px, py + c * 10 - 0.75, T, 1.5);
      for (let c = 0; c * 10 < capH; c++) {
        for (let k = (c % 2) * 10; k < T; k += 20) g.fillRect(px + k - 0.75, py + c * 10, 1.5, Math.min(10, capH - c * 10));
      }
      // The face where the wall drops to the floor below it: painted block with a yellow kick strip.
      if (face) {
        g.fillStyle = PASSAGE.face;
        g.fillRect(px, py + T - 11, T, 11);
        g.fillStyle = PASSAGE.kick;
        g.fillRect(px, py + T - 4, T, 4);
      }
      // Hazard tape round an end the crowd walks past.
      if (!solid(x - 1, y)) hazard(g, px, py, 7, T, 5);
      if (!solid(x + 1, y)) hazard(g, px + T - 7, py, 7, T, 5);
    }
  }
  // A pipe along the top of each wall, on brackets, in the colour of whatever it carries.
  for (const run of info.runs) {
    if (run.y < r.y0 - 1 || run.y > r.y1 || run.x1 <= r.x0 - 1 || run.x0 > r.x1) continue;
    if (isPart(run.x0, run.y - 1)) continue; // the lower row of a thick wall
    const col = PASSAGE.pipes[(hash2(run.x0, run.y + 70) * PASSAGE.pipes.length) | 0];
    const X0 = run.x0 * T + 8, X1 = run.x1 * T - 8, Y = run.y * T + 5;
    if (X1 <= X0) continue;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(X0 + 2, Y + 3, X1 - X0, 6);
    box(g, X0, Y, X1 - X0, 6, 3, col, 1.5);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(X0 + 3, Y + 1.5, X1 - X0 - 6, 1.5);
    g.fillStyle = '#4a4f55';
    for (let x = run.x0 + 1; x < run.x1; x += 2) g.fillRect(x * T - 2, Y - 1, 4, 8);
  }
  // A stencilled sign on every long run, on the face side.
  for (const run of info.runs) {
    const len = run.x1 - run.x0;
    if (len < 7 || run.y < r.y0 - 1 || run.y > r.y1 || run.x1 <= r.x0 - 4 || run.x0 > r.x1 + 4) continue;
    if (isPart(run.x0, run.y + 1)) continue; // the upper row of a thick wall
    const words = PASSAGE_SIGNS[(hash2(run.x0 * 3 + 1, run.y * 7 + 2) * PASSAGE_SIGNS.length) | 0];
    const sw = Math.min(len * T - 70, 190), cx = ((run.x0 + run.x1) / 2) * T, cy = run.y * T + 18;
    const red = hash2(run.y, run.x0 + 5) < 0.4;
    box(g, cx - sw / 2, cy - 8, sw, 16, 2, red ? C.red : C.yellow, 1.6);
    g.font = `900 10px ${FONT_FAMILY}`;
    const size = Math.min(10, (10 * (sw - 10)) / Math.max(1, g.measureText(words).width));
    if ((size * zoom) / T >= 5) text(g, words, cx, cy + 0.5, size, red ? '#ffffff' : INK, 900);
  }
}

// ---------------------------------------------------------------------------------------------
// The food court: a tiled floor, and the furniture in state.decor (see DECOR in the rules): tables,
// benches and booths, planters, bins, food stalls and the fountain. Every piece is solid ('#').

const FOOD = {
  floor: '#cdbfa6', check: 'rgba(120,96,60,0.10)', grout: '#ae9f85', joint: '#a39377', dot: '#b5a68b',
  awnings: ['#e8303a', '#2f8fe0', '#3fae49', '#ff8c1a', '#9b59b6'],
  // Furniture colours are kept a little muted, so a crowd of shoppers still stands out against it.
  chairs: ['#d98d4e', '#5fa79c', '#c4675c', '#cfb052', '#6f93bd'],
  tables: ['#f4f1e8', '#d6a467', '#c9cdd1', '#e9e2d0'],
};

/** Stall names, by a hash of where the stall is. */
const STALLS = [
  ['PHO KING GOOD', 'noodles'], ['WOK THIS WAY', 'noodles'], ["BIG DICK'S DOGS", 'hotdog'], ['NICE BUNS', 'burger'],
  ['TACO BELLEND', 'taco'], ['KEBAB DREAMZ', 'kebab'], ['THE SAUSAGE FEST', 'hotdog'], ['CURRY IN A HURRY', 'noodles'],
  ['MEAT YOUR MAKER', 'kebab'], ['BURGER OFF', 'burger'], ['FRIES BEFORE GUYS', 'fries'], ['DEEP FRIED REGRET', 'fries'],
];

/**
 * The food court floor: big cream tiles in a faint checker, flecked like terrazzo, with the odd
 * thing dropped on it (ketchup, a spilled cola, a lost chip).
 */
function foodFloor(g, info, r) {
  const { w, h } = info;
  g.fillStyle = FOOD.check;
  for (let y = Math.max(1, r.y0); y < Math.min(h - 1, r.y1); y++) {
    for (let x = Math.max(1, r.x0); x < Math.min(w - 1, r.x1); x++) {
      if ((x + y) & 1) g.fillRect(x * T, y * T, T, T);
    }
  }
  for (let y = Math.max(1, r.y0); y < Math.min(h - 1, r.y1); y++) {
    for (let x = Math.max(1, r.x0); x < Math.min(w - 1, r.x1); x++) {
      // Terrazzo flecks.
      for (let k = 0; k < 4; k++) {
        const a = hash2(x * 4 + k, y + 300), b = hash2(y * 4 + k, x + 700);
        g.fillStyle = k & 1 ? 'rgba(90,70,50,0.22)' : 'rgba(255,255,255,0.35)';
        g.fillRect(x * T + 3 + a * 33, y * T + 3 + b * 33, 2, 2);
      }
      const v = hash2(x + 99, y);
      if (v < 0.018) {
        // A ketchup splat.
        g.fillStyle = 'rgba(200,30,30,0.55)';
        g.beginPath();
        g.ellipse(x * T + 14, y * T + 26, 5, 3.4, 0.3, 0, Math.PI * 2);
        g.ellipse(x * T + 20, y * T + 23, 2.2, 1.6, 0, 0, Math.PI * 2);
        g.fill();
      } else if (v < 0.06) {
        // Spilled cola.
        g.fillStyle = 'rgba(80,40,20,0.3)';
        g.beginPath();
        g.ellipse(x * T + 24, y * T + 15, 8, 5, -0.2, 0, Math.PI * 2);
        g.fill();
      } else if (v < 0.08) {
        // A lost chip.
        g.save();
        g.translate(x * T + 10 + v * 200, y * T + 12);
        g.rotate(v * 40);
        box(g, -4, -1.2, 8, 2.4, 0.6, '#f2c94c', 0.8);
        g.restore();
      }
    }
  }
}

/**
 * Every piece of furniture in [r], back to front (so a palm's fronds or a stall's sign, which
 * stand up above their tile, are overlapped by what is in front of them).
 */
function drawFurniture(g, info, r, zoom) {
  const { w, decor, wall } = info;
  const items = [];
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const i = y * w + x;
      if (wall[i] !== FURN) continue;
      const ch = decor[i];
      // Blocks are added below; a car or a trolley shelter is drawn whole from its left half.
      if (BLOCK_CH.has(ch) || ch === 'C' || ch === 'R') continue;
      items.push(y * 1e4 + x, ch, x, y);
    }
  }
  // Blocks that reach into [r] (one may start well outside it).
  for (const b of info.blocks) {
    if (b.x1 <= r.x0 - 1 || b.x0 >= r.x1 + 1 || b.y1 <= r.y0 - 1 || b.y0 >= r.y1 + 1) continue;
    items.push((b.y1 - 1) * 1e4 + b.x0 + 0.5, b, 0, 0);
  }
  const order = [];
  for (let k = 0; k < items.length; k += 4) order.push(k);
  order.sort((a, b) => items[a] - items[b]);
  for (const k of order) {
    const it = items[k + 1];
    if (typeof it === 'object') {
      if (it.ch === 'k') drawStall(g, it, zoom);
      else if (it.ch === 'f') drawFountain(g, it);
      else if (it.ch === 'x') drawPrick(g, it);
      else if (it.ch === 'v') drawVan(g, it);
      else drawIsland(g, info, it);
      continue;
    }
    const x = items[k + 2], y = items[k + 3];
    if (it === 't') drawTable(g, info, x, y);
    else if (it === 'b') drawBench(g, info, x, y);
    else if (it === 'p') drawPlanter(g, x, y);
    else if (it === 'n') drawBin(g, x, y);
    else if (it === 'c') drawCar(g, info, x, y);
    else if (it === 'r') drawShelter(g, x, y);
    else if (it === 'a') drawLaneTrolley(g, x, y);
    else if (it === 'o') drawPothole(g, x, y);
    else drawPillar(g, x * T, y * T); // a character we do not know: draw a plain pillar
  }
}

/** The decor character at (x, y), or ' ' off the map. */
const decorAt = (info, x, y) => (x < 0 || y < 0 || x >= info.w || y >= info.h ? ' ' : info.decor[y * info.w + x]);

/**
 * A little table with chairs round it. What is on it, the colour of the chairs and how askew they
 * are come from a hash of where it is: a tray with a burger, cups, a pizza box, chips. A table that
 * is part of a booth (benches either side) gets no chairs.
 */
function drawTable(g, info, x, y) {
  const px = x * T, py = y * T, cx = px + 20, cy = py + 20;
  const hv = (k) => hash2(x * 7 + k, y * 13 + k * 3);
  const booth = decorAt(info, x - 1, y) === 'b' || decorAt(info, x + 1, y) === 'b' ||
    decorAt(info, x, y - 1) === 'b' || decorAt(info, x, y + 1) === 'b';
  const chair = FOOD.chairs[(hv(1) * FOOD.chairs.length) | 0];
  const square = hv(2) < 0.45 || booth;
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath(); g.ellipse(cx + 2, cy + 5, 15, 11, 0, 0, Math.PI * 2); g.fill();
  // Chairs (behind the table first, then the ones in front after it).
  const chairs = [];
  if (!booth) {
    for (let d = 0; d < 4; d++) {
      if (hv(10 + d) < 0.22) continue; // taken away to another table
      const a = (d * Math.PI) / 2 + (hv(20 + d) - 0.5) * 0.7;
      const out = 13 + hv(30 + d) * 4 + (hv(40 + d) < 0.15 ? 4 : 0); // one pushed right back
      chairs.push([cx + Math.cos(a) * out, cy + Math.sin(a) * out * 0.85, a]);
    }
  }
  const seat = (c) => {
    g.save();
    g.translate(c[0], c[1]);
    g.rotate(c[2]);
    box(g, -4.5, -5.5, 9, 11, 2.5, chair, 1.6);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(2.5, -5, 2, 10); // the back rest, on the far side
    g.restore();
  };
  for (const c of chairs) if (c[1] <= cy) seat(c);
  // Table: a pedestal foot, then the top.
  const top = FOOD.tables[(hv(3) * FOOD.tables.length) | 0];
  if (square) box(g, cx - 12, cy - 12, 24, 22, 3, top, 2.2);
  else { g.beginPath(); g.ellipse(cx, cy - 1, 12.5, 11, 0, 0, Math.PI * 2); paint(g, top, 2.2); }
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(cx - 10, cy + 6, 20, 2.5);
  // What has been left on it.
  const pick = (hv(4) * 5) | 0;
  if (pick === 0 || pick === 3) {
    // A tray with a half-eaten burger and a cola.
    g.save(); g.translate(cx - 1, cy - 1); g.rotate((hv(5) - 0.5) * 0.6);
    box(g, -8, -6, 16, 11, 1.5, '#e8761a', 1.3);
    g.beginPath(); g.arc(-2.5, -0.5, 3.6, Math.PI, 0); paint(g, '#d9a24a', 1);
    g.fillStyle = '#6b3a1e'; g.fillRect(-6.2, -0.4, 7.4, 1.6);
    box(g, 2.5, -4.5, 4, 6, 1, '#e8303a', 1);
    g.restore();
  } else if (pick === 1 && square) {
    // A pizza box, lid open, one slice left.
    g.save(); g.translate(cx, cy - 1); g.rotate((hv(6) - 0.5) * 0.5);
    box(g, -9, -9, 18, 8, 1, '#c8924f', 1.2);
    box(g, -9, -1, 18, 9, 1, '#e8c88a', 1.2);
    g.beginPath(); g.moveTo(-5, 1); g.lineTo(3, 3); g.lineTo(-4, 6.5); g.closePath(); paint(g, '#f2c21b', 0.9);
    g.fillStyle = '#d9372b'; g.fillRect(-3, 3, 1.6, 1.6);
    g.restore();
  } else if (pick === 2) {
    // Two cups and a crumpled napkin.
    box(g, cx - 6, cy - 7, 5, 7, 1.2, '#ffffff', 1.1);
    g.fillStyle = '#e8303a'; g.fillRect(cx - 6, cy - 4.5, 5, 1.6);
    g.beginPath(); g.moveTo(cx - 3, cy - 7); g.lineTo(cx - 1.5, cy - 10.5); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    box(g, cx + 2, cy - 5, 5, 7, 1.2, '#2f8fe0', 1.1);
    g.beginPath(); g.arc(cx + 4, cy + 4.5, 2.6, 0, Math.PI * 2); paint(g, '#f6f6f0', 0.9);
  } else {
    // A carton of chips spilling over the table.
    box(g, cx - 3, cy - 7, 7, 8, 1, '#e8303a', 1.1);
    g.fillStyle = '#f2c94c';
    for (let k = 0; k < 4; k++) g.fillRect(cx - 2.5 + k * 1.6, cy - 10 + (k % 2), 1.2, 4);
    for (let k = 0; k < 3; k++) g.fillRect(cx - 9 + k * 4, cy + 2 + (k % 2) * 2, 3.4, 1.2);
  }
  for (const c of chairs) if (c[1] > cy) seat(c);
}

/**
 * A bench tile. Beside a table it is a booth seat (red vinyl, its back on the side away from the
 * table); otherwise part of a slatted bench with its back along the top, its ends rounded off where
 * the run of bench stops.
 */
function drawBench(g, info, x, y) {
  const px = x * T, py = y * T;
  const L = decorAt(info, x - 1, y), R = decorAt(info, x + 1, y);
  const U = decorAt(info, x, y - 1), D = decorAt(info, x, y + 1);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(px + 4, py + 9, T - 4, T - 10);
  if (L === 't' || R === 't' || U === 't' || D === 't') {
    // Booth: the seat, and a tall padded back on the far side from the table.
    const side = L === 't' ? 0 : R === 't' ? 2 : U === 't' ? 1 : 3; // where the back goes: 0 right, 2 left...
    const vert = side === 0 || side === 2;
    box(g, px + 4, py + 6, T - 8, T - 10, 4, '#c0392b', 2.2);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(px + 8, py + 9, T - 16, 3);
    if (vert) {
      const bx = side === 0 ? px + T - 13 : px + 3;
      box(g, bx, py + 1, 10, T - 4, 4, '#a5281d', 2.2);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fillRect(bx + 4, py + 6, 1.5, T - 14);
    } else {
      const by = side === 1 ? py + T - 13 : py + 1;
      box(g, px + 2, by, T - 4, 11, 4, '#a5281d', 2.2);
    }
    return;
  }
  // A slatted bench along the row: legs, seat slats, back rest along the top.
  const l = L === 'b' ? 0 : 4, rgt = R === 'b' ? 0 : 4;
  g.fillStyle = '#4b5058';
  if (l) g.fillRect(px + 7, py + 26, 3, 9);
  if (rgt) g.fillRect(px + T - 10, py + 26, 3, 9);
  box(g, px + l, py + 14, T - l - rgt, 15, l || rgt ? 3 : 0, '#c8894a', 2);
  g.fillStyle = '#9c6b33';
  for (let k = 0; k < 3; k++) g.fillRect(px + l + 1, py + 18 + k * 4, T - l - rgt - 2, 1.2);
  box(g, px + l, py + 5, T - l - rgt, 8, l || rgt ? 3 : 0, '#b5793e', 2);
  // Hide the seams between tiles of one bench.
  if (!l) { g.fillStyle = '#c8894a'; g.fillRect(px - 1, py + 15.2, 2.4, 12.6); g.fillStyle = '#b5793e'; g.fillRect(px - 1, py + 6.2, 2.4, 5.6); }
}

/** A square planter with a potted palm (or a round bush), by a hash of where it is. */
function drawPlanter(g, x, y) {
  const px = x * T, py = y * T;
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(px + 6, py + 10, T - 6, T - 9);
  box(g, px + 4, py + 12, T - 8, T - 15, 3, '#b0623b', 2.2);
  g.fillStyle = '#8f4a2a';
  g.fillRect(px + 5, py + T - 9, T - 10, 5);
  box(g, px + 7, py + 13, T - 14, 7, 2, '#5a3a1e', 1.2);
  const cx = px + 20, cy = py + 14;
  if (hash2(x, y + 77) < 0.6) {
    // A palm: a trunk and fronds fanning out above the tile.
    g.beginPath(); g.moveTo(cx - 1, cy + 2); g.quadraticCurveTo(cx + 3, cy - 8, cx + 1, cy - 16);
    g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round'; g.stroke();
    g.strokeStyle = '#8a6a3e'; g.lineWidth = 3; g.stroke();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.55;
      const ex = cx + 1 + Math.cos(a) * 17, ey = cy - 16 + Math.sin(a) * 11 + 6;
      g.beginPath();
      g.moveTo(cx + 1, cy - 16);
      g.quadraticCurveTo((cx + ex) / 2 + Math.cos(a + 1.2) * 4, (cy - 16 + ey) / 2 - 5, ex, ey);
      g.quadraticCurveTo((cx + ex) / 2 - Math.cos(a + 1.2) * 2, (cy - 16 + ey) / 2 + 1, cx + 1, cy - 16);
      paint(g, k & 1 ? '#3fae49' : '#2f8f3c', 1.4);
    }
  } else {
    // A round clipped bush.
    for (const [dx, dy, rr2] of [[-6, -2, 8], [6, -2, 8], [0, -8, 9]]) {
      g.beginPath(); g.arc(cx + dx, cy + dy, rr2, 0, Math.PI * 2); paint(g, '#3fae49', 1.8);
    }
    g.fillStyle = '#e84393';
    for (let k = 0; k < 4; k++) g.fillRect(cx - 8 + k * 5, cy - 9 + (k % 2) * 6, 2.4, 2.4);
  }
}

/** A bin with a swing flap, and a tray-return rack with dirty trays stacked in it. */
function drawBin(g, x, y) {
  const px = x * T, py = y * T;
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(px + 5, py + 10, T - 6, T - 10);
  // Tray rack on the right.
  box(g, px + 20, py + 6, 16, 28, 2, '#9aa0a6', 2);
  for (let k = 0; k < 4; k++) box(g, px + 22, py + 9 + k * 6, 12, 3.6, 1, k % 2 ? '#e8761a' : '#2f8fe0', 1);
  // The bin, overflowing.
  box(g, px + 4, py + 12, 15, 22, 3, '#3f6b4a', 2.2);
  box(g, px + 3, py + 8, 17, 6, 2, '#2f5238', 2);
  box(g, px + 7, py + 16, 9, 6, 1, '#1d2a20', 1.2);
  g.fillStyle = '#fbf4e4';
  g.font = `900 3.6px ${FONT_FAMILY}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('THANK', px + 11.5, py + 26);
  g.fillText('YOU', px + 11.5, py + 30);
  // Rubbish piled on the lid: a cup, a wrapper, and now and then a rat.
  box(g, px + 6, py + 3, 4, 6, 1, '#e8303a', 1);
  g.beginPath(); g.ellipse(px + 14, py + 7, 4, 2.4, 0.3, 0, Math.PI * 2); paint(g, '#f2c21b', 1);
  if (hash2(x + 5, y + 9) < 0.4) {
    g.beginPath(); g.ellipse(px + 13, py + 3.5, 3.6, 2.4, 0, 0, Math.PI * 2); paint(g, '#8a8f96', 1.1);
    g.fillStyle = INK; g.fillRect(px + 15, py + 2.6, 1, 1);
    g.beginPath(); g.moveTo(px + 9.5, py + 4); g.quadraticCurveTo(px + 6, py + 7, px + 3, py + 3);
    g.strokeStyle = '#e8a0a8'; g.lineWidth = 1; g.stroke();
  }
}

/**
 * A food stall over its whole block: a kitchen behind, a menu board, a striped awning, a counter
 * at the front, and a big sign on top with its name and a giant fibreglass version of what it sells.
 */
function drawStall(g, b, zoom) {
  const X0 = b.x0 * T, Y0 = b.y0 * T, W = (b.x1 - b.x0) * T, H = (b.y1 - b.y0) * T;
  const n = ((hash2(b.x0 * 7 + 31, b.y0 * 13 + 17) * 9973) | 0) % STALLS.length;
  const [name, food] = STALLS[n];
  const col = FOOD.awnings[n % FOOD.awnings.length];
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(X0 + 6, Y0 + 8, W - 4, H - 6);
  // Kitchen: back wall with a menu board, a dark floor.
  box(g, X0 + 2, Y0 + 2, W - 4, H - 4, 4, '#3a3f45', 2.5);
  box(g, X0 + 6, Y0 + 8, W - 12, Math.min(18, H * 0.3), 2, '#1d2125', 1.6);
  for (let k = 0; k < 3; k++) {
    g.fillStyle = ['#ffd23f', '#ffffff', '#ff8c1a'][k];
    g.fillRect(X0 + 10, Y0 + 11 + k * 4.5, (W - 26) * (0.5 + 0.5 * hash2(n, k)), 2);
  }
  // Counter at the front: a coloured front, a steel top, a till and the food.
  const cy = Y0 + H - 26;
  box(g, X0 + 3, cy, W - 6, 23, 3, col, 2.4);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(X0 + 6, cy + 13, W - 12, 3);
  box(g, X0 + 1, cy - 4, W - 2, 7, 2, '#d4d8dc', 2);
  box(g, X0 + W - 22, cy - 12, 12, 9, 2, '#2b2f34', 1.6);
  g.fillStyle = '#7CFC00'; g.fillRect(X0 + W - 20, cy - 10, 8, 3);
  foodIcon(g, food, X0 + 18, cy - 5, 0.9);
  // Awning across the front of the kitchen, scalloped.
  const ay = Y0 + Math.max(24, H * 0.42);
  const stripes = Math.max(4, Math.round(W / 10));
  const sw = (W + 6) / stripes;
  for (let k = 0; k < stripes; k++) {
    g.fillStyle = k & 1 ? '#fbf4e4' : col;
    g.beginPath();
    g.moveTo(X0 - 3 + k * sw, ay - 10);
    g.lineTo(X0 - 3 + (k + 1) * sw, ay - 10);
    g.lineTo(X0 - 3 + (k + 1) * sw, ay);
    g.arc(X0 - 3 + (k + 0.5) * sw, ay, sw / 2, 0, Math.PI);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.moveTo(X0 - 3, ay - 10); g.lineTo(X0 + W + 3, ay - 10);
  for (let k = stripes - 1; k >= 0; k--) g.arc(X0 - 3 + (k + 0.5) * sw, ay, sw / 2, 0, Math.PI, false);
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  // The sign on top, sticking up above the block, and the giant food on it.
  const sh = 17;
  box(g, X0 + 4, Y0 - 10, W - 8, sh, 4, '#fbf4e4', 2.4);
  g.fillStyle = col;
  g.fillRect(X0 + 7, Y0 - 7, W - 14, 2);
  let size = 9;
  g.font = `900 ${size}px ${FONT_FAMILY}`;
  const room = W - 20;
  const tw = g.measureText(name).width;
  if (tw > room) size = Math.max(5, (size * room) / tw);
  text(g, name, X0 + W / 2, Y0 - 10 + sh / 2 + 1.5, size, INK, 900);
  foodIcon(g, food, X0 + W - 6, Y0 - 12, 1.15);
}

/** A cartoon food item centred on (x, y), scale s: the giant one on a stall's sign, or on its counter. */
function foodIcon(g, food, x, y, s) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  if (food === 'hotdog') {
    box(g, -11, -3, 22, 8, 4, '#e0a050', 1.4);
    box(g, -12, -4.5, 24, 5, 2.5, '#b8452c', 1.4);
    g.beginPath(); g.moveTo(-8, -2); for (let k = 0; k < 5; k++) g.lineTo(-6 + k * 3.5, k % 2 ? -3.5 : -1);
    g.strokeStyle = '#f2c21b'; g.lineWidth = 1.4; g.stroke();
  } else if (food === 'burger') {
    g.beginPath(); g.arc(0, -1, 9, Math.PI, 0); g.closePath(); paint(g, '#d9a24a', 1.4);
    box(g, -9.5, -1, 19, 3, 1, '#3fae49', 1);
    box(g, -9, 1.5, 18, 3.5, 1.5, '#6b3a1e', 1.2);
    box(g, -9, 4.5, 18, 3.5, 1.5, '#d9a24a', 1.2);
  } else if (food === 'taco') {
    g.beginPath(); g.arc(0, 4, 10, Math.PI, 0); g.closePath(); paint(g, '#f2c94c', 1.4);
    g.fillStyle = '#3fae49'; g.fillRect(-7, -4, 4, 3); g.fillRect(-1, -5, 4, 3);
    g.fillStyle = '#e8303a'; g.fillRect(3.5, -4, 3, 3);
  } else if (food === 'kebab') {
    g.beginPath(); g.moveTo(-5, -11); g.lineTo(5, -11); g.lineTo(7, 7); g.lineTo(-7, 7); g.closePath();
    paint(g, '#9c5a2a', 1.4);
    g.fillStyle = '#c87a3a';
    for (let k = 0; k < 4; k++) g.fillRect(-5 + (k % 2), -8 + k * 4, 10, 1.4);
    g.beginPath(); g.moveTo(0, -14); g.lineTo(0, 10); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  } else if (food === 'fries') {
    g.fillStyle = '#f2c94c';
    for (let k = 0; k < 5; k++) { g.fillRect(-6 + k * 2.6, -10 + (k % 2) * 2, 2, 9); }
    g.beginPath(); g.moveTo(-8, -3); g.lineTo(8, -3); g.lineTo(6, 8); g.lineTo(-6, 8); g.closePath();
    paint(g, '#e8303a', 1.4);
  } else {
    // A bowl of noodles with chopsticks.
    g.beginPath(); g.arc(0, 0, 9, 0, Math.PI); g.closePath(); paint(g, '#ffffff', 1.4);
    g.fillStyle = '#e8303a'; g.fillRect(-7, 2, 14, 1.6);
    g.beginPath(); g.ellipse(0, 0, 9, 2.6, 0, 0, Math.PI * 2); paint(g, '#f2d58a', 1.1);
    g.beginPath(); g.moveTo(2, -1); g.lineTo(8, -12); g.moveTo(4, -1); g.lineTo(11, -11);
    g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  }
  g.restore();
}

/**
 * The fountain over its whole block: a stone basin of murky water full of pennies, and in the
 * middle a little cherub on a pedestal, peeing into it.
 */
function drawFountain(g, b) {
  const X0 = b.x0 * T, Y0 = b.y0 * T, W = (b.x1 - b.x0) * T, H = (b.y1 - b.y0) * T;
  const cx = X0 + W / 2, cy = Y0 + H / 2 + 2;
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(cx + 4, cy + 6, W / 2 - 2, H / 2 - 3, 0, 0, Math.PI * 2); g.fill();
  // Rim, then the water.
  g.beginPath(); g.ellipse(cx, cy, W / 2 - 3, H / 2 - 4, 0, 0, Math.PI * 2); paint(g, '#c9c4ba', 2.6);
  g.beginPath(); g.ellipse(cx, cy + 2, W / 2 - 12, H / 2 - 12, 0, 0, Math.PI * 2); paint(g, '#4aa8d8', 2);
  g.save();
  g.beginPath(); g.ellipse(cx, cy + 2, W / 2 - 12, H / 2 - 12, 0, 0, Math.PI * 2); g.clip();
  g.fillStyle = 'rgba(30,80,120,0.25)';
  g.fillRect(X0, cy + 2, W, H);
  // Ripples and pennies.
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.4;
  for (let k = 0; k < 3; k++) {
    g.beginPath(); g.ellipse(cx, cy + 6, 14 + k * 12, 6 + k * 5, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
  }
  for (let k = 0; k < 14; k++) {
    const a = hash2(b.x0 + k, b.y0) * Math.PI * 2, d = 0.3 + 0.65 * hash2(k, b.y0 + b.x0);
    const px = cx + Math.cos(a) * (W / 2 - 16) * d, py = cy + 2 + Math.sin(a) * (H / 2 - 16) * d;
    g.fillStyle = k % 3 ? '#e0a33a' : '#d4d8dc';
    g.beginPath(); g.ellipse(px, py, 2, 1.3, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // The rim's top edge catching the light.
  g.beginPath(); g.ellipse(cx, cy, W / 2 - 7, H / 2 - 8, 0, Math.PI * 1.1, Math.PI * 1.9);
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.stroke();
  // Pedestal and cherub.
  box(g, cx - 7, cy - 6, 14, 14, 3, '#d8d3c8', 2);
  const sy = cy - 6;
  g.beginPath(); g.ellipse(cx, sy - 7, 6, 7, 0, 0, Math.PI * 2); paint(g, '#e9e4da', 1.8); // body
  g.beginPath(); g.arc(cx + 0.5, sy - 17, 5, 0, Math.PI * 2); paint(g, '#e9e4da', 1.8); // head
  g.fillStyle = INK;
  g.fillRect(cx + 1.5, sy - 18, 1.2, 1.2); g.fillRect(cx + 4, sy - 18, 1.2, 1.2);
  g.beginPath(); g.ellipse(cx - 5.5, sy - 9, 3.4, 2, -0.6, 0, Math.PI * 2); paint(g, '#ffffff', 1.2); // a wing
  // His stream, arcing into the water.
  g.beginPath(); g.moveTo(cx + 5, sy - 4); g.quadraticCurveTo(cx + 16, sy - 12, cx + 22, cy + 6);
  g.strokeStyle = '#2f7fb0'; g.lineWidth = 3; g.lineCap = 'round'; g.stroke();
  g.strokeStyle = '#dff4ff'; g.lineWidth = 1.4; g.stroke();
  g.beginPath(); g.ellipse(cx + 22, cy + 7, 5, 2, 0, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.2; g.stroke();
}

// ---------------------------------------------------------------------------------------------
// The car park: tarmac with painted bays, and the pieces in state.decor (see DECOR in the rules):
// parked cars, some prick's car across two bays, trolley shelters, the kerbed islands at the ends
// of the rows with their lamp posts and pay machines, abandoned trolleys and coned-off potholes in
// the lanes, and the burger van. Every piece is solid ('#').

const PARK = {
  // The tarmac is a little darker and bluer than the warehouse's concrete, but kept light enough
  // that shoppers, buildings and the marked floor read on it as well as on any other floor.
  floor: '#7f868f', grout: '#757c85', dot: '#6c737c',
  line: 'rgba(238,240,234,0.85)', zebra: 'rgba(238,240,234,0.8)', box: 'rgba(242,194,27,0.8)',
  glass: '#3c5266', mist: '#e2e9ec',
  // Car paint, body then roof (a shade lighter). Muted, so a crowd of shoppers still stands out
  // against a row of cars.
  cars: [
    ['#8e504b', '#a0625c'], ['#4e6987', '#607b98'], ['#5d7859', '#6f8a6b'], ['#b5b3ab', '#c8c6be'],
    ['#3f434a', '#53585f'], ['#d6d2c6', '#e5e1d6'], ['#8a7a5b', '#9c8c6c'], ['#6a5c7a', '#7c6e8c'],
    ['#a3894d', '#b49a5e'], ['#7a8288', '#8c949a'], ['#4d6f72', '#5f8184'],
  ],
};

/**
 * Car shapes, from the nose back: [length, width, bonnet, windscreen, roof, rear window, corner
 * radius]. What is left behind the rear window is the boot (long on a saloon, a stub on the rest).
 */
const CAR_SHAPES = {
  hatch: [58, 29, 14, 8, 20, 8, 9],
  saloon: [72, 29, 18, 10, 17, 9, 7],
  estate: [74, 30, 16, 9, 37, 5, 6],
  suv: [72, 34, 15, 8, 35, 5, 5],
  van: [76, 32, 9, 8, 55, 0, 6],
  pickup: [76, 31, 16, 8, 15, 4, 6],
};
/** How common each shape is (the shares add up to one). */
const CAR_KINDS = [['hatch', 0.24], ['saloon', 0.22], ['estate', 0.14], ['suv', 0.18], ['van', 0.11], ['pickup', 0.11]];
/** The prick's car: body, racing stripes, roof. */
const PRICK_PAINT = [['#24272d', '#d4a72c', '#363a42'], ['#e8e5dc', '#24272d', '#f4f2ec'], ['#6e1f2a', '#e8e5dc', '#842f3b']];
/** What somebody has keyed into the prick's bonnet. */
const KEYED = ['PRICK', 'TOSSER', 'NOB', 'WANKER'];
/** Burger vans: the name on the sign, what the giant thing on the roof is, the paint. */
const VANS = [
  ['HOT MEAT IN A VAN', 'kebab', '#c4473b'], ['TRUST ME BURGERS', 'burger', '#3f7fc0'],
  ['MR. SALMONELLA', 'burger', '#4f9a52'], ['DODGY DOGS', 'hotdog', '#e07e2a'],
  ['THE GREASY HANDSHAKE', 'fries', '#8a5aa6'],
];

/**
 * The car park's tarmac: a grain of light and dark stones, and here and there a patch of newer
 * tarmac, an oil stain, a crack, trodden-in chewing gum, a fag end, a drink can run over flat or a
 * crisp packet; and a soft pool of light round every lamp post.
 */
function parkFloor(g, info, r) {
  const { w, h, tiles, decor } = info;
  const TAU = Math.PI * 2;
  for (let y = Math.max(1, r.y0); y < Math.min(h - 1, r.y1); y++) {
    for (let x = Math.max(1, r.x0); x < Math.min(w - 1, r.x1); x++) {
      if (tiles[y * w + x] !== '.') continue;
      const X = x * T, Y = y * T;
      for (let k = 0; k < 3; k++) {
        const a = hash2(x * 3 + k, y + 900), b = hash2(y * 3 + k, x + 400);
        g.fillStyle = k === 1 ? 'rgba(255,255,255,0.13)' : 'rgba(30,36,46,0.16)';
        g.fillRect(X + 2 + a * 35, Y + 2 + b * 35, 2, 2);
      }
      const v = hash2(x + 31, y + 517), u = hash2(x + 7, y + 211);
      if (v < 0.03) {
        // A patch of newer, darker tarmac where somebody dug a hole, its ragged edge sealed.
        const pw = 26 + u * 40, ph = 20 + hash2(y, x + 3) * 26;
        const j = (k) => (hash2(x * 4 + k, y + 60) - 0.5) * 8;
        g.beginPath();
        g.moveTo(X + 5 + j(0), Y + 6 + j(1));
        g.lineTo(X + 5 + pw * 0.5, Y + 6 + j(2));
        g.lineTo(X + 5 + pw + j(3), Y + 6 + j(4));
        g.lineTo(X + 5 + pw + j(5), Y + 6 + ph * 0.6);
        g.lineTo(X + 5 + pw + j(6), Y + 6 + ph + j(7));
        g.lineTo(X + 5 + j(8), Y + 6 + ph + j(9));
        g.closePath();
        g.fillStyle = 'rgba(40,46,56,0.08)';
        g.fill();
        g.strokeStyle = 'rgba(28,32,40,0.15)'; g.lineWidth = 1.4;
        g.stroke();
      } else if (v < 0.075) {
        g.fillStyle = 'rgba(22,26,32,0.2)';
        g.beginPath();
        g.ellipse(X + 14 + u * 12, Y + 20, 9 + u * 4, 6, u * 2, 0, TAU);
        g.moveTo(X + 28 + u * 6, Y + 14);
        g.ellipse(X + 24 + u * 6, Y + 14, 4, 3, 0, 0, TAU);
        g.fill();
      } else if (v < 0.1) {
        g.beginPath();
        g.moveTo(X + 3, Y + 8 + u * 20);
        g.lineTo(X + 14, Y + 12 + u * 14);
        g.lineTo(X + 22, Y + 6 + u * 24);
        g.lineTo(X + 37, Y + 14 + u * 16);
        g.strokeStyle = 'rgba(28,32,40,0.4)'; g.lineWidth = 1.3; g.stroke();
      } else if (v < 0.11) {
        g.save(); g.translate(X + 12 + u * 16, Y + 14 + u * 12); g.rotate(u * 6);
        box(g, -5, -3, 10, 6, 1.5, u < 0.5 ? '#c8302a' : '#c9ced4', 1);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-3, -1.5, 5, 1.2);
        g.restore();
      } else if (v < 0.12) {
        g.save(); g.translate(X + 26 - u * 14, Y + 26 - u * 10); g.rotate(u * 5 + 1);
        box(g, -4, -5, 8, 10, 1, ['#f2c21b', '#2f8fe0', '#d9372b', '#3fae49'][(u * 4) | 0], 1);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-2.5, -1, 5, 2);
        g.restore();
      } else if (v < 0.2) {
        g.fillStyle = 'rgba(48,50,56,0.32)';
        g.beginPath();
        g.arc(X + 6 + u * 28, Y + 9 + v * 120, 1.6, 0, TAU);
        g.moveTo(X + 31.3 - u * 20, Y + 30 - v * 80);
        g.arc(X + 30 - u * 20, Y + 30 - v * 80, 1.3, 0, TAU);
        g.fill();
      } else if (v < 0.215) {
        g.save(); g.translate(X + 10 + u * 20, Y + 28 - u * 12); g.rotate(u * 9);
        g.fillStyle = '#f1efe6'; g.fillRect(-3, -0.9, 4.5, 1.8);
        g.fillStyle = '#d98a3a'; g.fillRect(1.5, -0.9, 2, 1.8);
        g.restore();
      }
    }
  }
  // Light round the lamp posts (the posts are drawn with their islands). Under two tiles across,
  // so a lamp just outside a chunk lights it the same as the chunk it is in.
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (decor[y * w + x] !== 'l') continue;
      const cx = x * T + T / 2, cy = y * T + T / 2;
      const glow = g.createRadialGradient(cx, cy, 6, cx, cy, 70);
      glow.addColorStop(0, 'rgba(255,238,170,0.26)');
      glow.addColorStop(1, 'rgba(255,238,170,0)');
      g.fillStyle = glow;
      g.fillRect(cx - 70, cy - 70, 140, 140);
    }
  }
}

/**
 * Paint on the tarmac: white lines round every bay, full or empty; zebra stripes where the
 * walkway to the front doors crosses a row of bays; a yellow keep-clear box on every other way
 * through; and faint arrows down the lanes between the rows. All of it flat paint: players may
 * build on empty bays and ways through.
 */
function parkMarkings(g, info, r) {
  const { w, h, tiles, zones } = info;
  const rows = info.bays;
  for (const row of rows) {
    if (row.x1 <= r.x0 || row.x0 >= r.x1 || row.y1 < r.y0 || row.y0 > r.y1) continue;
    const X0 = row.x0 * T, X1 = row.x1 * T;
    const way = (y) => (y >= row.y0 && y < row.y1 ? row.way[y - row.y0] : 0);
    for (let y = row.y0; y < row.y1; y++) {
      const k = way(y);
      if (!k || way(y - 1) === k) continue;
      let e = y;
      while (way(e) === k) e++;
      if (k === 2) zebra(g, X0, y * T, X1 - X0, (e - y) * T);
      else keepClear(g, X0, y * T, X1 - X0, (e - y) * T);
    }
    // A line between each bay and the next (none across the middle of a way through), and down
    // the middle where two bays meet nose to nose.
    g.beginPath();
    for (let y = row.y0; y <= row.y1; y++) {
      if (way(y - 1) && way(y)) continue;
      g.moveTo(X0 + 3, y * T); g.lineTo(X1 - 3, y * T);
    }
    if (row.across === 2) {
      const mx = X0 + 2 * T;
      for (let y = row.y0; y < row.y1; y++) if (!way(y)) { g.moveTo(mx, y * T); g.lineTo(mx, (y + 1) * T); }
    }
    g.strokeStyle = PARK.line; g.lineWidth = 2.5; g.stroke();
  }
  // Arrows down each lane between two rows: one way beside the left row, the other way beside
  // the right one. That column is just outside the marked floor's band, so they never meet it.
  const walk = (h >> 1) - 1;
  for (let j = 1; j < rows.length; j++) {
    const a = rows[j - 1].x1, b = rows[j].x0 - 1;
    if (b - a < 2) continue;
    for (const [x, down] of [[a, true], [b, false]]) {
      if (x < r.x0 || x >= r.x1) continue;
      for (let y = Math.max(3, r.y0); y < Math.min(h - 3, r.y1); y++) {
        if (y % 5 !== 2 || (y >= walk - 1 && y <= walk + 2)) continue;
        const i = y * w + x;
        if (tiles[i] !== '.' || (zones && zones[i] !== ' ')) continue;
        laneArrow(g, x * T, y * T, down);
      }
    }
  }
}

/** Zebra stripes across a walkway: white bars running the way people walk over it. */
function zebra(g, x, y, w, h) {
  g.fillStyle = PARK.zebra;
  for (let yy = y + 5; yy + 6 <= y + h - 3; yy += 12) g.fillRect(x + 7, yy, w - 14, 6);
}

/** A yellow box with a criss-cross in it: keep this way through clear. */
function keepClear(g, x, y, w, h) {
  g.save();
  g.beginPath(); g.rect(x + 5, y + 5, w - 10, h - 10); g.clip();
  g.beginPath();
  for (let s = -h; s < w; s += 16) {
    g.moveTo(x + s, y + h); g.lineTo(x + s + h, y);
    g.moveTo(x + s, y); g.lineTo(x + s + h, y + h);
  }
  g.strokeStyle = 'rgba(242,194,27,0.45)'; g.lineWidth = 2; g.stroke();
  g.restore();
  g.strokeStyle = PARK.box; g.lineWidth = 2.5;
  g.strokeRect(x + 5, y + 5, w - 10, h - 10);
}

/** A faint painted arrow along a lane, pointing down or up the map. */
function laneArrow(g, X, Y, down) {
  g.save();
  g.translate(X + T / 2, Y + T / 2);
  if (!down) g.rotate(Math.PI);
  g.beginPath();
  g.moveTo(-2.5, -15); g.lineTo(2.5, -15); g.lineTo(2.5, 3); g.lineTo(7, 3);
  g.lineTo(0, 15); g.lineTo(-7, 3); g.lineTo(-2.5, 3);
  g.closePath();
  g.fillStyle = 'rgba(238,240,234,0.38)';
  g.fill();
  g.restore();
}

/** Which bay of its row a tile is in: -1 the left of two, 1 the right of two, 0 a row one bay across. */
function baySide(info, x, y) {
  for (const row of info.bays) {
    if (x < row.x0 || x >= row.x1 || y < row.y0 || y >= row.y1) continue;
    return row.across === 2 ? (x < row.x0 + 2 ? -1 : 1) : 0;
  }
  return 0;
}

/**
 * A parked car filling its bay (the 'c' tile and the 'C' to its right), lying east-west. Its
 * shape (hatchback, saloon, estate, SUV, white van or pickup), its paint and which way it faces
 * come from a hash of where it is; in a row two bays across most have parked nose in, facing the
 * other bay. Now and then there is something extra: a parking ticket under a wiper, a wheel clamp,
 * a roof box, a car up on bricks with its wheels nicked, one with the windows steamed up and hand
 * prints on the glass, or a police car.
 */
function drawCar(g, info, x, y) {
  const hv = (k) => hash2(x * 11 + k * 7, y * 17 + k * 3);
  const side = baySide(info, x, y);
  const nose = side ? (hv(1) < 0.75 ? -side : side) : hv(1) < 0.5 ? 1 : -1;
  const e = hv(4);
  const police = e > 0.985;
  let kind = 'estate';
  if (!police) {
    let p = hv(2);
    for (const [k, share] of CAR_KINDS) { kind = k; if ((p -= share) < 0) break; }
  }
  const [L, W, bonnet, ws, roof, rw, rad] = CAR_SHAPES[kind];
  let [body, top] = PARK.cars[(hv(3) * PARK.cars.length) | 0];
  if (police) { body = '#f1f1ec'; top = '#f8f8f4'; } else if (kind === 'van' && hv(5) < 0.8) { body = '#e2e0d9'; top = '#eceae4'; }
  const ticket = e < 0.035, clamp = e >= 0.035 && e < 0.05;
  const roofBox = e >= 0.05 && e < 0.085 && kind !== 'van' && kind !== 'pickup';
  const bricks = e >= 0.085 && e < 0.097, steamy = e >= 0.097 && e < 0.115;
  const cx = x * T + T, cy = y * T + T / 2, hl = L / 2, hw = W / 2;
  // Shadow, cast down and to the right whichever way the car faces.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  rr(g, cx - hl + 3, cy - hw + 4, L, W, rad);
  g.fill();
  g.save();
  g.translate(cx, cy);
  if (nose < 0) g.scale(-1, 1);
  // From here on the nose points right (+x).
  const wheelX = [hl - 14, -hl + 13];
  if (bricks) {
    // Wheels nicked overnight: it sits on piles of bricks instead.
    for (const wx of wheelX) {
      for (const by of [-hw - 4.5, hw - 2.5]) {
        box(g, wx - 6, by, 12, 7, 0.5, '#b8613f', 1.3);
        g.fillStyle = '#e0c9a8'; g.fillRect(wx - 0.6, by + 0.6, 1.2, 5.8);
      }
    }
  } else {
    g.fillStyle = INK;
    for (const wx of wheelX) { g.fillRect(wx - 6, -hw - 2, 12, 5); g.fillRect(wx - 6, hw - 3, 12, 5); }
  }
  box(g, -hl, -hw, L, W, rad, body, 2.2);
  const fx = hl - bonnet; // the bottom of the windscreen
  const rx = fx - ws; // the front of the roof
  const bx = rx - roof; // the back of the roof
  const gx = bx - rw; // the bottom of the rear window
  g.fillStyle = 'rgba(255,255,255,0.2)';
  g.fillRect(fx + 3, -1, bonnet - 7, 2);
  // A saloon's long boot gets a crease too, so it reads as one from above.
  if (kind === 'saloon') g.fillRect(-hl + 4, -1, gx + hl - 8, 2);
  if (police) {
    // Blue and yellow checks down both sides.
    for (let k = 0; k * 6 < L - 14; k++) {
      g.fillStyle = k & 1 ? '#e8d21b' : '#2a55c4';
      g.fillRect(-hl + 7 + k * 6, -hw + 0.8, 6, 2.6);
      g.fillRect(-hl + 7 + k * 6, hw - 3.4, 6, 2.6);
    }
  }
  if (kind === 'pickup') pickupBed(g, -hl + 4, gx - 2, hw, hv(5));
  // Glass all round the cabin, then the roof over it, which leaves the side windows showing.
  rr(g, gx, -hw + 3, fx - gx, W - 6, 4);
  paint(g, steamy ? PARK.mist : PARK.glass, 1.5);
  rr(g, bx, -hw + 4.5, roof, W - 9, 3);
  paint(g, top, 1.5);
  if (!steamy) { g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(rx + 2.5, -hw + 6, 1.8, W - 12); }
  // Wing mirrors and lights.
  g.beginPath();
  g.ellipse(fx - 2, -hw - 1, 2.6, 1.8, 0, 0, Math.PI * 2);
  g.moveTo(fx + 0.6, hw + 1);
  g.ellipse(fx - 2, hw + 1, 2.6, 1.8, 0, 0, Math.PI * 2);
  paint(g, body, 1);
  g.fillStyle = '#f6efc4';
  g.fillRect(hl - 4, -hw + 3, 2.5, 6); g.fillRect(hl - 4, hw - 9, 2.5, 6);
  g.fillStyle = '#c4302a';
  g.fillRect(-hl + 1.5, -hw + 3, 2, 6); g.fillRect(-hl + 1.5, hw - 9, 2, 6);
  if (kind === 'suv') {
    // Roof rails, and a spare wheel on the tailgate.
    g.fillStyle = '#2a2d33';
    g.fillRect(bx + 2, -hw + 6, roof - 4, 1.6); g.fillRect(bx + 2, hw - 7.6, roof - 4, 1.6);
    g.beginPath(); g.arc(-hl + 1, 0, 5.5, 0, Math.PI * 2); paint(g, '#2a2d33', 1.4);
    g.fillStyle = '#8a9097'; g.fillRect(-hl - 0.5, -1.5, 3, 3);
  } else if (kind === 'van') {
    // The split between the back doors, and a ladder on the roof or WASH ME in the dirt.
    g.fillStyle = INK; g.fillRect(-hl + 1, -0.6, 4, 1.2);
    const v = hv(6);
    if (v < 0.35) {
      g.fillStyle = '#9aa0a6';
      g.fillRect(bx + 4, -6, roof - 8, 2); g.fillRect(bx + 4, 4, roof - 8, 2);
      for (let k = bx + 8; k < rx - 4; k += 6) g.fillRect(k, -5, 1.5, 10);
    } else if (v > 0.7) {
      g.save(); g.scale(nose, 1);
      text(g, 'WASH ME', nose * (bx + roof / 2), 0.5, 6, 'rgba(90,80,62,0.6)', 700);
      g.restore();
    }
  }
  if (police) {
    // The light bar across the roof.
    box(g, bx + roof / 2 - 3, -hw + 4, 6, W - 8, 1.5, '#ffffff', 1.2);
    g.fillStyle = '#2f5fe0'; g.fillRect(bx + roof / 2 - 2, -hw + 5, 4, 6); g.fillRect(bx + roof / 2 - 2, hw - 11, 4, 6);
  }
  if (roofBox) {
    box(g, bx + 3, -6, roof - 6, 12, 5, '#2b2e33', 1.4);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(bx + 6, -4, roof - 12, 2);
  }
  if (ticket) {
    // A yellow penalty notice under the wiper.
    g.strokeStyle = INK; g.lineWidth = 1;
    g.beginPath(); g.moveTo(fx - 0.5, -hw + 5); g.lineTo(rx + 1.5, 2); g.stroke();
    box(g, rx + 1, -7, 5.5, 8, 0.6, '#f4e04a', 0.9);
  }
  if (clamp) {
    box(g, wheelX[0] - 6, -hw - 5, 12, 7, 1.5, '#f2c21b', 1.4);
    g.fillStyle = INK; g.fillRect(wheelX[0] - 1.5, -hw - 3.5, 3, 3);
  }
  if (steamy) {
    // Steamed up from the inside, with hands pressed against it. Nobody is checking the oil.
    g.fillStyle = 'rgba(160,175,185,0.6)';
    g.fillRect(gx + 2, -hw + 5, 1, 4); g.fillRect(fx - 3, hw - 8, 1, 4);
    handPrint(g, rx + ws / 2, -hw + 8, -1.2);
    handPrint(g, gx + rw / 2 + 0.5, hw - 8, 1.9);
  }
  g.restore();
}

/** A hand print wiped into a steamed-up window: a palm and four fingers, turned by `a`. */
function handPrint(g, x, y, a) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = PARK.glass;
  g.beginPath(); g.ellipse(0, 0.8, 2.5, 2.1, 0, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 4; k++) g.fillRect(-2.5 + k * 1.4, -4.6 + (k === 0 || k === 3 ? 0.8 : 0), 0.95, 3.8);
  g.fillRect(2, -0.4, 2.4, 0.95);
  g.restore();
}

/** The open bed of a pickup, from x0 back to x1, and what he is hauling. */
function pickupBed(g, x0, x1, hw, v) {
  box(g, x0, -hw + 3, x1 - x0, 2 * hw - 6, 2, '#34383e', 1.4);
  const bw = x1 - x0;
  if (v < 0.35) {
    // A mattress with a stain nobody wants to explain.
    box(g, x0 + 2, -hw + 5, bw - 4, 2 * hw - 10, 2, '#e9e1c9', 1);
    g.fillStyle = 'rgba(190,150,40,0.45)';
    g.beginPath(); g.ellipse(x0 + bw * 0.55, 1, 5, 3.4, 0.4, 0, Math.PI * 2); g.fill();
  } else if (v < 0.7) {
    // Bin bags he is going to dump somewhere.
    g.beginPath();
    for (const [dx, dy, rad] of [[0.25, -4, 5], [0.62, 3, 5.5], [0.4, 5, 4]]) {
      g.moveTo(x0 + bw * dx + rad, dy);
      g.arc(x0 + bw * dx, dy, rad, 0, Math.PI * 2);
    }
    paint(g, '#26292e', 1.2);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x0 + bw * 0.25 - 2, -7, 3, 1.4);
  } else {
    // A toolbox and some planks.
    box(g, x0 + 3, -hw + 5, bw - 6, 4, 0.5, '#c8a070', 1);
    box(g, x0 + 3, -hw + 10, bw - 8, 4, 0.5, '#b8905e', 1);
    box(g, x0 + bw / 2 - 5, 2, 10, 6, 1, '#d9372b', 1.1);
  }
}

/**
 * Some prick's car, parked at an angle across two bays: long, low and expensive, with racing
 * stripes, fat wheels with gold rims, a spoiler, and something keyed into the bonnet.
 */
function drawPrick(g, b) {
  const cx = ((b.x0 + b.x1) * T) / 2, cy = ((b.y0 + b.y1) * T) / 2;
  const hv = (k) => hash2(b.x0 * 13 + k * 5, b.y0 * 7 + k);
  const ang = (hv(1) < 0.5 ? 1 : -1) * 0.6, nose = hv(2) < 0.5 ? 1 : -1;
  // Scrambled further than a plain hash, as the pricks in a row are evenly spaced and would
  // otherwise often come out alike.
  const [body, stripe, top] = PRICK_PAINT[((hv(3) * 7919) | 0) % PRICK_PAINT.length];
  const word = KEYED[((hv(4) * 6151) | 0) % KEYED.length];
  const L = 82, W = 34, hl = L / 2, hw = W / 2;
  g.save();
  g.translate(cx + 4, cy + 5);
  g.rotate(ang);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  rr(g, -hl, -hw, L, W, 10);
  g.fill();
  g.restore();
  g.save();
  g.translate(cx, cy);
  g.rotate(ang);
  if (nose < 0) g.scale(-1, 1);
  // Fat wheels, the gold of the rims showing at their outer edges.
  for (const wx of [hl - 16, -hl + 15]) {
    g.fillStyle = INK;
    g.fillRect(wx - 7, -hw - 3, 14, 6); g.fillRect(wx - 7, hw - 3, 14, 6);
    g.fillStyle = '#e0b43a';
    g.fillRect(wx - 4, -hw - 2.4, 8, 1.8); g.fillRect(wx - 4, hw + 0.6, 8, 1.8);
  }
  // A wedge: square at the back, a long rounded nose.
  g.beginPath();
  g.moveTo(-hl + 4, -hw);
  g.lineTo(hl - 14, -hw);
  g.quadraticCurveTo(hl, -hw + 1, hl, -hw + 9);
  g.lineTo(hl, hw - 9);
  g.quadraticCurveTo(hl, hw - 1, hl - 14, hw);
  g.lineTo(-hl + 4, hw);
  g.quadraticCurveTo(-hl, hw, -hl, hw - 4);
  g.lineTo(-hl, -hw + 4);
  g.quadraticCurveTo(-hl, -hw, -hl + 4, -hw);
  g.closePath();
  paint(g, body, 2.4);
  g.fillStyle = stripe;
  g.fillRect(-hl + 1, -4.6, L - 2, 3.2); g.fillRect(-hl + 1, 1.4, L - 2, 3.2);
  // Bonnet vents and slim headlights.
  g.fillStyle = INK;
  g.fillRect(hl - 22, -hw + 6, 9, 2); g.fillRect(hl - 22, hw - 8, 9, 2);
  g.fillStyle = '#f6efc4';
  g.fillRect(hl - 5, -hw + 5, 3, 7); g.fillRect(hl - 5, hw - 12, 3, 7);
  // A low cabin set well back, the stripes carrying on over the roof.
  rr(g, -16, -hw + 5, 30, W - 10, 7);
  paint(g, PARK.glass, 1.5);
  rr(g, -11, -hw + 7, 17, W - 14, 5);
  paint(g, top, 1.4);
  g.fillStyle = stripe;
  g.fillRect(-10, -4.6, 15, 3.2); g.fillRect(-10, 1.4, 15, 3.2);
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(9, -hw + 8, 2, W - 16);
  g.beginPath();
  g.ellipse(13, -hw - 1.5, 3, 2, 0, 0, Math.PI * 2);
  g.moveTo(16, hw + 1.5);
  g.ellipse(13, hw + 1.5, 3, 2, 0, 0, Math.PI * 2);
  paint(g, body, 1);
  // The spoiler.
  box(g, -hl - 3, -hw + 1, 6, W - 2, 1.5, top, 1.8);
  // What somebody thought of his parking, scratched into the paint.
  g.save();
  g.scale(nose, 1);
  g.translate(nose * (hl - 14), 0);
  g.font = `700 7px ${FONT_FAMILY}`;
  const size = Math.min(7, (7 * 20) / g.measureText(word).width);
  text(g, word, 0, 0.5, size, body === '#e8e5dc' ? 'rgba(60,60,60,0.75)' : 'rgba(255,255,255,0.78)', 700);
  g.restore();
  g.restore();
}

/**
 * A trolley shelter filling its bay (the 'r' tile and the 'R' to its right): a frame with a clear
 * roof, and under it a line of trolleys nested into each other (or the one nobody wanted).
 */
function drawShelter(g, x, y) {
  const X = x * T, Y = y * T, v = hash2(x * 5 + 3, y * 9 + 1);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(X + 5, Y + 7, 2 * T - 4, T - 8);
  // The trolleys, nested: one long run of wire basket, tapering at the front one's nose, and a
  // handle (a steel bar with a red grip) wherever one of them ends.
  const n = v < 0.2 ? 1 : 5 + (((v * 40) | 0) % 3);
  const step = 7.5, tx = X + 9, len = 22 + (n - 1) * step;
  g.beginPath();
  g.moveTo(tx, Y + 9); g.lineTo(tx + len, Y + 11); g.lineTo(tx + len, Y + 29); g.lineTo(tx, Y + 31);
  g.closePath();
  paint(g, '#c9d0d6', 1.6);
  g.strokeStyle = 'rgba(80,88,96,0.5)'; g.lineWidth = 1;
  g.beginPath();
  for (let k = 1; k < 4; k++) { g.moveTo(tx + 1, Y + 9 + k * 5.5); g.lineTo(tx + len - 1, Y + 10 + k * 4.5); }
  g.stroke();
  for (let k = 0; k < n; k++) {
    const hx = tx - 2 + k * step;
    g.fillStyle = '#5b6168'; g.fillRect(hx, Y + 7, 2, 26);
    box(g, hx - 1, Y + 12, 4, 16, 1, '#d9372b', 1);
  }
  // The roof: clear plastic in a steel frame, with ribs, a post at each corner and a sign.
  box(g, X + 2, Y + 3, 2 * T - 4, T - 6, 3, 'rgba(165,212,236,0.42)', 2.2);
  g.strokeStyle = '#7d858d'; g.lineWidth = 1.6;
  g.strokeRect(X + 4.5, Y + 5.5, 2 * T - 9, T - 11);
  g.fillStyle = 'rgba(70,80,92,0.6)';
  g.fillRect(X + 27, Y + 5, 2, T - 10); g.fillRect(X + 52, Y + 5, 2, T - 10);
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(X + 10, Y + 31); g.lineTo(X + 21, Y + 9);
  g.moveTo(X + 59, Y + 31); g.lineTo(X + 70, Y + 9);
  g.stroke();
  g.fillStyle = '#3e4852';
  for (const [px, py] of [[X + 1, Y + 2], [X + 2 * T - 7, Y + 2], [X + 1, Y + T - 8], [X + 2 * T - 7, Y + T - 8]]) g.fillRect(px, py, 6, 6);
  box(g, X + 2 * T - 31, Y + T - 13, 24, 8, 1.5, '#2f6fbf', 1.2);
  text(g, 'TROLLEYS', X + 2 * T - 19, Y + T - 8.8, 3.6, '#ffffff', 900);
}

/**
 * A kerbed island at the end of a row of bays, over its whole run: a concrete kerb round a bed of
 * scruffy grass with shrubs and whatever has been thrown in them, a lamp post on its 'l' tile and
 * a pay machine on its 'm' tile.
 */
function drawIsland(g, info, b) {
  const { w, decor } = info;
  const X0 = b.x0 * T, Y = b.y0 * T, W = (b.x1 - b.x0) * T;
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(X0 + 6, Y + 8, W - 6, T - 8);
  box(g, X0 + 2, Y + 3, W - 4, T - 6, 12, '#c4c0b5', 2.4);
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.fillRect(X0 + 12, Y + 4.5, W - 24, 1.5);
  box(g, X0 + 6, Y + 7, W - 12, T - 14, 8, '#6f7c40', 1.4);
  for (let x = b.x0; x < b.x1; x++) {
    if (decor[b.y0 * w + x] !== 'i') continue;
    const px = x * T, v = hash2(x * 3 + 1, b.y0 * 5 + 2), u = hash2(x + 17, b.y0 + 29);
    // A scruffy shrub.
    const sx = px + 14 + v * 12, sy = Y + 20;
    g.beginPath();
    for (const [dx, dy, rad] of [[-5, 1, 6.5], [4, 2, 6], [0, -4, 6.5]]) {
      g.moveTo(sx + dx + rad, sy + dy);
      g.arc(sx + dx, sy + dy, rad, 0, Math.PI * 2);
    }
    paint(g, v < 0.5 ? '#4c7f3a' : '#5a8a3c', 1.6);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(sx - 4, sy - 6, 3, 2); g.fillRect(sx + 3, sy - 1, 3, 2);
    // Whatever has been chucked in it.
    if (u < 0.3) {
      box(g, sx + 6, sy + 3, 6, 4, 1, '#f6f6f0', 1); // a coffee cup on its side
      g.fillStyle = '#7a4a2a'; g.fillRect(sx + 10, sy + 3.5, 2, 3);
    } else if (u < 0.45) {
      box(g, sx - 12, sy + 4, 7, 4, 1.5, '#c9ced4', 1); // a can
    } else if (u < 0.55) {
      // A pair of knickers, caught on a branch. Somebody had a good night.
      g.beginPath();
      g.moveTo(sx - 3, sy - 6); g.lineTo(sx + 5, sy - 6); g.lineTo(sx + 3, sy - 1); g.lineTo(sx + 1, sy - 2.5); g.lineTo(sx - 1, sy - 1);
      g.closePath();
      paint(g, '#e84393', 1);
    } else if (u < 0.65) {
      box(g, sx + 5, sy - 8, 6, 7, 1, '#f2c21b', 1); // a crisp packet
    }
  }
  for (let x = b.x0; x < b.x1; x++) {
    const ch = decor[b.y0 * w + x];
    if (ch === 'l') drawLamp(g, x, b.y0);
    else if (ch === 'm') drawPayMachine(g, x, b.y0);
  }
}

/**
 * A lamp post seen from above: its base, the top of the post and two arms with a lamp on each;
 * now and then a pigeon on one of them, and what pigeons leave underneath.
 */
function drawLamp(g, x, y) {
  const cx = x * T + T / 2, cy = y * T + T / 2, v = hash2(x * 7 + 2, y * 3 + 5);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(cx - 16, cy + 1, 34, 5);
  box(g, cx - 5, cy - 5, 10, 10, 2, '#8a9097', 1.6);
  box(g, cx - 15, cy - 2, 30, 4, 1.5, '#5b6168', 1.4);
  box(g, cx - 20, cy - 4, 8, 8, 2, '#d4d8dc', 1.5);
  box(g, cx + 12, cy - 4, 8, 8, 2, '#d4d8dc', 1.5);
  g.fillStyle = '#fff3b0';
  g.fillRect(cx - 18, cy - 2, 4, 4); g.fillRect(cx + 14, cy - 2, 4, 4);
  g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2); paint(g, '#6e767e', 1.5);
  if (v < 0.4) {
    const s = v < 0.2 ? -1 : 1, px = cx + s * 16;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 4; k++) g.fillRect(px - 4 + k * 2.5, cy + 7 + (k % 2) * 3, 1.8, 1.8);
    g.beginPath(); g.ellipse(px, cy - 5, 4.6, 3, 0.2 * s, 0, Math.PI * 2); paint(g, '#8f949c', 1);
    g.beginPath(); g.arc(px + s * 4, cy - 6, 2, 0, Math.PI * 2); paint(g, '#5f6670', 1);
    g.fillStyle = '#e8a03a'; g.fillRect(px + s * 6 - (s < 0 ? 1.5 : 0), cy - 6.5, 1.5, 1);
  }
}

/** A pay-and-display machine: a screen, a coin slot and PAY on the front; sometimes taped up OUT OF ORDER. */
function drawPayMachine(g, x, y) {
  const cx = x * T + T / 2, cy = y * T + T / 2, v = hash2(x * 5 + 7, y * 11 + 3);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(cx - 8, cy - 6, 22, 20);
  box(g, cx - 11, cy - 11, 22, 18, 3, '#2f62a8', 2);
  box(g, cx - 11, cy + 4, 22, 8, 2, '#22497e', 2);
  text(g, 'PAY', cx, cy + 8.3, 5, '#f2c21b', 900);
  box(g, cx - 8, cy - 8, 11, 7, 1, '#9fe0b0', 1.2);
  g.fillStyle = INK;
  g.fillRect(cx + 5, cy - 8, 2, 7);
  if (v < 0.45) {
    // A sheet of paper taped over the front. It has been like that since 2019.
    g.save();
    g.translate(cx, cy - 3);
    g.rotate((v - 0.22) * 0.7);
    box(g, -10, -6, 20, 12, 0.5, '#fbfbf4', 1);
    g.fillStyle = 'rgba(200,170,110,0.8)';
    g.fillRect(-12, -7.5, 7, 3); g.fillRect(5, 4.5, 7, 3);
    text(g, 'OUT OF', 0, -2, 3.8, C.red, 900);
    text(g, 'ORDER', 0, 2.6, 3.8, C.red, 900);
    g.restore();
  }
}

/**
 * A trolley abandoned in the lane: standing at an angle, knocked over on its side, or with a
 * traffic cone dumped in it.
 */
function drawLaneTrolley(g, x, y) {
  const cx = x * T + T / 2, cy = y * T + T / 2;
  const v = hash2(x * 3 + 11, y * 7 + 5), a = (hash2(x + 40, y + 9) - 0.5) * 2.4;
  g.save();
  g.translate(cx, cy);
  g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  if (v < 0.3) {
    // On its side: the side of the basket, the wheels sticking out, the handle at the end.
    g.fillRect(-11, -3, 28, 12);
    box(g, -13, -6, 26, 11, 1.5, '#c4cbd2', 1.6);
    g.strokeStyle = 'rgba(80,88,96,0.55)'; g.lineWidth = 1;
    g.beginPath();
    for (let k = -8; k < 12; k += 5) { g.moveTo(k, -5); g.lineTo(k, 4); }
    g.stroke();
    g.beginPath();
    for (const wx of [-9, 9]) { g.moveTo(wx + 2.4, -8.5); g.arc(wx, -8.5, 2.4, 0, Math.PI * 2); }
    paint(g, '#3a3f45', 1);
    box(g, -17, -8, 4, 14, 1, '#d9372b', 1.2);
  } else {
    g.fillRect(-11, -9, 26, 23);
    g.beginPath();
    g.moveTo(-10, -11); g.lineTo(12, -9); g.lineTo(12, 9); g.lineTo(-10, 11);
    g.closePath();
    paint(g, 'rgba(196,203,210,0.7)', 1.8);
    g.strokeStyle = 'rgba(80,88,96,0.55)'; g.lineWidth = 1;
    g.beginPath();
    for (let k = -5; k < 12; k += 5) { g.moveTo(k, -10 + (k + 10) * 0.09); g.lineTo(k, 10 - (k + 10) * 0.09); }
    for (const yy of [-4, 2]) { g.moveTo(-9, yy); g.lineTo(11, yy); }
    g.stroke();
    box(g, -15, -12, 4, 24, 1.5, '#d9372b', 1.4);
    if (v > 0.8) cone(g, 2, 0);
  }
  g.restore();
}

/** A traffic cone seen from above, centred on (x, y): a square base, the cone, a reflective band. */
function cone(g, x, y) {
  box(g, x - 5, y - 5, 10, 10, 1.5, '#c9541a', 1.3);
  g.beginPath(); g.arc(x, y, 3.8, 0, Math.PI * 2); paint(g, '#ff8c1a', 1.2);
  g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2);
  g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.stroke();
}

/** Traffic cones round a pothole full of muddy water, one of them usually knocked flat. */
function drawPothole(g, x, y) {
  const X = x * T, Y = y * T, cx = X + 20, cy = Y + 21, v = hash2(x * 9 + 4, y * 5 + 8);
  g.beginPath();
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2, rad = 11 + hash2(x + k, y * 3 + 1) * 4;
    const px = cx + Math.cos(a) * rad * 1.15, py = cy + Math.sin(a) * rad * 0.85;
    if (k) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
  paint(g, '#3c4149', 1.4);
  g.beginPath(); g.ellipse(cx + 1, cy + 1, 9, 5.5, v - 0.5, 0, Math.PI * 2);
  g.fillStyle = '#6d8293'; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fillRect(cx - 4, cy - 1, 5, 1.2);
  cone(g, X + 7, Y + 7);
  cone(g, X + 33, Y + 8);
  cone(g, X + 8, Y + 33);
  if (v < 0.6) {
    // Knocked flat, lying on its side.
    g.save();
    g.translate(X + 31, Y + 32);
    g.rotate(v * 5);
    g.beginPath(); g.moveTo(-8, -4); g.lineTo(6, -1.2); g.lineTo(6, 1.2); g.lineTo(-8, 4); g.closePath();
    paint(g, '#ff8c1a', 1.2);
    g.fillStyle = '#ffffff'; g.fillRect(-3, -2.6, 2.5, 5.2);
    box(g, -10, -5, 3, 10, 0.5, '#c9541a', 1.1);
    g.restore();
  } else cone(g, X + 33, Y + 33);
}

/**
 * The burger van over its whole block: a cab at one end, the kitchen behind it with its serving
 * hatch open on the side facing us under a propped-up striped flap, a cook with a fag on, a menu
 * board, a giant version of what it sells on the roof, and a sign on top with its name, fitted
 * and sized as on the food court's stalls.
 */
function drawVan(g, b) {
  const X0 = b.x0 * T, Y0 = b.y0 * T, W = (b.x1 - b.x0) * T, H = (b.y1 - b.y0) * T;
  const n = ((hash2(b.x0 * 7 + 31, b.y0 * 13 + 17) * 9973) | 0) % VANS.length;
  const [name, food, col] = VANS[n];
  const cabLeft = hash2(b.x0 + 3, b.y0 + 5) < 0.5;
  const cream = '#efe8d6', creamDark = '#d3c9ae';
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(X0 + 8, Y0 + 12, W - 6, H - 10);
  g.fillStyle = INK;
  g.fillRect(X0 + 22, Y0 + H - 8, 18, 6); g.fillRect(X0 + W - 40, Y0 + H - 8, 18, 6);
  // The cab: bonnet and windscreen.
  const cabX = cabLeft ? X0 + 2 : X0 + W - 40;
  box(g, cabX, Y0 + 12, 38, H - 24, 8, col, 2.2);
  rr(g, cabLeft ? cabX + 11 : cabX + 18, Y0 + 15, 9, H - 30, 3);
  paint(g, PARK.glass, 1.5);
  // The kitchen: its roof seen from above, then the side with the hatch.
  const kx = cabLeft ? X0 + 30 : X0 + 4, kw = W - 34;
  box(g, kx, Y0 + 4, kw, H - 20, 7, cream, 2.4);
  // On the roof: an extractor with grease smoke, and a gas bottle at the back end.
  const ex = cabLeft ? kx + kw - 16 : kx + 16;
  g.beginPath(); g.arc(ex, Y0 + 26, 6, 0, Math.PI * 2); paint(g, '#9aa0a6', 1.6);
  g.fillStyle = 'rgba(70,70,70,0.22)';
  g.beginPath();
  g.arc(ex + 4, Y0 + 18, 6, 0, Math.PI * 2);
  g.moveTo(ex + 15, Y0 + 12); g.arc(ex + 9, Y0 + 12, 6, 0, Math.PI * 2);
  g.fill();
  foodIcon(g, food, cabLeft ? kx + kw * 0.42 : kx + kw * 0.58, Y0 + 28, 1.25);
  // The side facing us, with a stripe of the van's colour along the bottom.
  const fy = Y0 + H - 30;
  box(g, kx, fy, kw, 26, 5, creamDark, 2.4);
  g.fillStyle = col;
  g.fillRect(kx + 2, fy + 19, kw - 4, 4);
  // The hatch: dark inside, a cook with a fag on, the counter with the sauces.
  const hx = cabLeft ? kx + 10 : kx + kw - 10 - kw * 0.5, hw = kw * 0.5;
  box(g, hx, fy + 4, hw, 13, 2, '#2b2f34', 1.8);
  g.beginPath(); g.arc(hx + hw * 0.4, fy + 11, 5, 0, Math.PI * 2); paint(g, C.skin, 1.3);
  g.fillStyle = INK;
  g.fillRect(hx + hw * 0.4 - 2.5, fy + 9.5, 1.3, 1.3); g.fillRect(hx + hw * 0.4 + 1.2, fy + 9.5, 1.3, 1.3);
  g.fillStyle = '#f1efe6'; g.fillRect(hx + hw * 0.4 + 2, fy + 13, 5, 1.2);
  g.fillStyle = '#ff6b2a'; g.fillRect(hx + hw * 0.4 + 6.5, fy + 13, 1.4, 1.2);
  box(g, hx - 3, fy + 15, hw + 6, 4, 1.5, '#d4d8dc', 1.6);
  box(g, hx + hw - 14, fy + 9, 3.5, 6, 1, '#d9372b', 1);
  box(g, hx + hw - 9, fy + 9, 3.5, 6, 1, '#f2c21b', 1);
  // The flap, propped up over the hatch as an awning, striped and scalloped.
  const ax0 = hx - 5, aw = hw + 10, stripes = Math.max(4, Math.round(aw / 10)), sw = aw / stripes, ay = fy + 2;
  for (let k = 0; k < stripes; k++) {
    g.fillStyle = k & 1 ? '#fbf4e4' : col;
    g.beginPath();
    g.moveTo(ax0 + k * sw, ay - 8);
    g.lineTo(ax0 + (k + 1) * sw, ay - 8);
    g.lineTo(ax0 + (k + 1) * sw, ay);
    g.arc(ax0 + (k + 0.5) * sw, ay, sw / 2, 0, Math.PI);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.moveTo(ax0, ay - 8); g.lineTo(ax0 + aw, ay - 8);
  for (let k = stripes - 1; k >= 0; k--) g.arc(ax0 + (k + 0.5) * sw, ay, sw / 2, 0, Math.PI, false);
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  // The menu board beside the hatch, chalked up.
  const mx = cabLeft ? hx + hw + 9 : kx + 7, mw = cabLeft ? kx + kw - 7 - mx : hx - 9 - mx;
  if (mw > 10) {
    box(g, mx, fy + 3, mw, 15, 1.5, '#262a2f', 1.4);
    for (let k = 0; k < 3; k++) {
      g.fillStyle = k === 1 ? '#ffd23f' : '#f1efe6';
      g.fillRect(mx + 3, fy + 6 + k * 3.8, (mw - 10) * (0.55 + 0.45 * hash2(n, k + 4)), 1.4);
      g.fillRect(mx + mw - 6, fy + 6 + k * 3.8, 3, 1.4);
    }
  }
  // The sign on top, sticking up above the block.
  const sh = 17;
  box(g, X0 + 8, Y0 - 10, W - 16, sh, 4, '#fbf4e4', 2.4);
  g.fillStyle = col;
  g.fillRect(X0 + 11, Y0 - 7, W - 22, 2);
  let size = 9;
  g.font = `900 ${size}px ${FONT_FAMILY}`;
  const room = W - 26;
  const tw = g.measureText(name).width;
  if (tw > room) size = Math.max(5, (size * room) / tw);
  text(g, name, X0 + W / 2, Y0 - 10 + sh / 2 + 1.5, size, INK, 900);
}

/**
 * The car park's outer walls: a hedge along the top and the left, a steel palisade fence along
 * the bottom, with litter caught in both. (The right-hand wall is the store's front, and keeps
 * its plain wall and RETURNS signs.)
 */
function parkBoundary(g, info, r) {
  const { w, h, tiles } = info;
  const TAU = Math.PI * 2;
  /** One tile of hedge centred on (cx, cy), running across (or, `down`, up and down). */
  const hedge = (cx, cy, down, x, y) => {
    const v = hash2(x * 5 + 1, y * 3 + 77);
    g.fillStyle = '#2b5228';
    if (down) g.fillRect(cx - 12, cy - T / 2, 24, T); else g.fillRect(cx - T / 2, cy - 12, T, 24);
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const along = -13 + k * 13, off = (hash2(x * 3 + k, y + 5) - 0.5) * 6, rad = 9 + hash2(k + x, y * 7) * 2;
      const px = down ? cx + off : cx + along, py = down ? cy + along : cy + off;
      g.moveTo(px + rad, py);
      g.arc(px, py, rad, 0, TAU);
    }
    paint(g, '#3f7a37', 1.5);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(cx - 8, cy - 6, 4, 2); g.fillRect(cx + 5, cy + 1, 4, 2);
    if (v < 0.08) {
      // A carrier bag, snagged and flapping.
      g.beginPath(); g.ellipse(cx + 2, cy - 1, 6, 4.5, 0.4, 0, TAU); paint(g, '#f4f4ee', 1.2);
      g.strokeStyle = INK; g.lineWidth = 1;
      g.beginPath(); g.arc(cx - 3, cy - 4, 2.2, Math.PI, 0); g.stroke();
    } else if (v < 0.13) {
      box(g, cx - 3, cy - 4, 7, 9, 1, ['#f2c21b', '#d9372b', '#2f8fe0'][(v * 60) % 3 | 0], 1); // a crisp packet
    } else if (v < 0.16) {
      box(g, cx - 5, cy + 2, 9, 5, 1.5, '#c9ced4', 1); // a can
    } else if (v < 0.175) {
      // Somebody's boxer shorts.
      box(g, cx - 5, cy - 4, 10, 7, 1.5, '#2f8fe0', 1.1);
      g.fillStyle = '#ffffff'; g.fillRect(cx - 4, cy - 3, 8, 1.4);
      g.fillStyle = '#e8303a'; g.fillRect(cx - 2, cy, 1.5, 1.5); g.fillRect(cx + 2, cy + 1, 1.5, 1.5);
    }
  };
  if (r.y0 <= 0) {
    for (let x = Math.max(1, r.x0); x < Math.min(w - 1, r.x1); x++) {
      if (tiles[x] === '#') hedge(x * T + T / 2, 17, false, x, 0);
    }
  }
  if (r.x0 <= 0) {
    for (let y = Math.max(1, r.y0); y < Math.min(h - 1, r.y1); y++) {
      if (tiles[y * w] === '#') hedge(16, y * T + T / 2, true, 0, y);
    }
  }
  if (r.y1 >= h) {
    // The fence: two rails and a row of pointed steel pales, with rubbish blown against it.
    const py = (h - 1) * T;
    for (let x = Math.max(1, r.x0); x < Math.min(w - 1, r.x1); x++) {
      if (tiles[(h - 1) * w + x] !== '#') continue;
      const px = x * T, v = hash2(x * 7 + 3, h + 11);
      g.fillStyle = '#2c4636';
      g.fillRect(px, py + 13, T, 3); g.fillRect(px, py + 26, T, 3);
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const sx = px + 2 + k * 8;
        g.moveTo(sx, py + 33); g.lineTo(sx, py + 11); g.lineTo(sx + 2, py + 7); g.lineTo(sx + 4, py + 11); g.lineTo(sx + 4, py + 33);
        g.closePath();
      }
      paint(g, '#4a6b56', 1.2);
      if (v < 0.12) {
        g.beginPath(); g.ellipse(px + 18, py + 28, 7, 5, -0.3, 0, TAU); paint(g, '#f4f4ee', 1.2);
      } else if (v < 0.2) {
        box(g, px + 10, py + 25, 8, 9, 1, '#2f8fe0', 1);
      } else if (v < 0.25) {
        cone(g, px + 24, py + 29);
      }
    }
  }
}

/** A red checkout till facing into the store. */
function drawTill(g, px, py) {
  g.fillStyle = C.floor;
  g.fillRect(px, py, T, T);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(px + 6, py + 6, 34, 34);
  // Counter body: top surface plus a darker front face (seen in three-quarter view).
  box(g, px + 3, py + 3, 35, 34, 4, C.red, 2.5);
  rr(g, px + 3, py + 27, 35, 10, 3);
  paint(g, C.redDark, 2.5);
  // Customer screen and the cash display.
  box(g, px + 7, py + 6, 13, 10, 2, C.screen, 1.8);
  box(g, px + 21, py + 8, 14, 16, 2, '#3a3a3a', 1.8);
  // Receipt printer slot.
  g.fillStyle = INK;
  g.fillRect(px + 8, py + 20, 10, 3);
  g.fillStyle = C.paper;
  g.fillRect(px + 10, py + 18, 6, 4);
}

/**
 * An entrance, in its own frame (local x points into the store, local y runs along the doorway):
 * hazard-striped jambs in the wall either side; an open one has an entrance mat with arrows
 * pointing in, a shut one a steel roller shutter.
 */
function drawDoorStatic(g, d) {
  g.save();
  g.transform(...d.frame);
  if (d.open) {
    for (let j = 0; j < 2; j++) {
      const py = j * T;
      g.fillStyle = '#3a3f45';
      g.fillRect(0, py, T, T);
      g.strokeStyle = C.yellow;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(12, py + 12); g.lineTo(20, py + 20); g.lineTo(12, py + 28);
      g.moveTo(22, py + 12); g.lineTo(30, py + 20); g.lineTo(22, py + 28);
      g.stroke();
    }
  } else {
    g.fillStyle = C.wall;
    g.fillRect(0, 0, T, 2 * T);
    // The shutter: a corrugated steel curtain filling the opening, a hazard strip on its bottom
    // rail, and a padlock.
    box(g, 3, 1, T - 9, 2 * T - 2, 2, '#9aa2aa', 2);
    g.fillStyle = '#6e767e';
    for (let y = 6; y < 2 * T - 3; y += 5) g.fillRect(4, y, T - 11, 1.6);
    hazard(g, T - 10, 1, 6, 2 * T - 2, 4);
    box(g, 9, T - 7, 12, 11, 2, '#c9a227', 1.6);
    g.beginPath();
    g.arc(15, T - 7, 3.6, Math.PI, 0);
    g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  }
  hazard(g, 0, -14, T, 14, 6);
  hazard(g, 0, 2 * T, T, 14, 6);
  g.restore();
}

/**
 * Wall signs on the right wall: RETURNS above the tills and NO RECEIPT NO REFUND below them. A
 * bank of tills in the bottom wall (the car park's) gets MORE RETURNS on its left and NO RECEIPT
 * NO REFUND on its right, lying along that wall, as long as they fit between the entrances.
 */
function drawSigns(g, info) {
  const { w, h, tillTop, tillBot, tillLeft, tillRight, tiles } = info;
  if (tillTop < tillBot) {
    const x = w * T - 35;
    const a0 = Math.max(0.8, tillTop - 4.2), a1 = tillTop - 1.0;
    if (a1 - a0 >= 2) verticalSign(g, x, a0, a1, C.red, '#ffffff', ['RETURNS']);
    const b0 = tillBot + 0.2, b1 = Math.min(h - 0.8, tillBot + 3.4);
    if (b1 - b0 >= 2.6) verticalSign(g, x, b0, b1, C.yellow, INK, ['NO RECEIPT', 'NO REFUND']);
  }
  if (tillLeft < tillRight) {
    // How far the plain wall runs either side of the bank: to an entrance (keeping clear of the
    // hazard stripes on its jambs) or to the corner (keeping clear of the right wall's sign).
    const row = (h - 1) * w;
    let l = tillLeft - 1;
    while (l > 0 && tiles[row + l] === '#') l--;
    let rt = tillRight;
    while (rt < w - 1 && tiles[row + rt] === '#') rt++;
    const left = l <= 0 ? 0.8 : l + 1.5, right = rt >= w - 1 ? w - 1.1 : rt - 0.5;
    const y = h * T - 35;
    const a0 = Math.max(left, tillLeft - 4.4), a1 = tillLeft - 0.2;
    if (a1 - a0 >= 3.2) acrossSign(g, a0, a1, y, C.red, '#ffffff', ['MORE RETURNS']);
    else if (a1 - a0 >= 2) acrossSign(g, a0, a1, y, C.red, '#ffffff', ['RETURNS']);
    const b0 = tillRight + 0.2, b1 = Math.min(right, tillRight + 4.4);
    if (b1 - b0 >= 2.6) acrossSign(g, b0, b1, y, C.yellow, INK, ['NO RECEIPT', 'NO REFUND']);
  }
}

/** A sign lying along the bottom wall from tile x1 to x2, 30 pixels tall from y. */
function acrossSign(g, x1, x2, y, bg, fg, lines) {
  const xa = x1 * T, xb = x2 * T;
  box(g, xa, y, xb - xa, 30, 5, bg, 2.5);
  // Lettering as big as on the right wall's signs, smaller if the sign is short.
  const size = lines.length === 1 ? 15 : 10;
  g.font = `900 ${size}px ${FONT_FAMILY}`;
  let wide = 0;
  for (const s of lines) wide = Math.max(wide, g.measureText(s).width);
  const fit = Math.min(size, (size * (xb - xa - 12)) / wide);
  const cx = (xa + xb) / 2;
  if (lines.length === 1) text(g, lines[0], cx, y + 16, fit, fg, 900);
  else { text(g, lines[0], cx, y + 9, fit, fg, 900); text(g, lines[1], cx, y + 22, fit, fg, 900); }
}

function verticalSign(g, x, y1, y2, bg, fg, lines) {
  const yTop = y1 * T, yBot = y2 * T;
  box(g, x, yTop, 30, yBot - yTop, 5, bg, 2.5);
  g.save();
  g.translate(x + 15, (yTop + yBot) / 2);
  g.rotate(Math.PI / 2);
  if (lines.length === 1) text(g, lines[0], 0, 1, 15, fg, 900);
  else { text(g, lines[0], 0, -6, 10, fg, 900); text(g, lines[1], 0, 7, 10, fg, 900); }
  g.restore();
}

// ---------------------------------------------------------------------------------------------
// Drawn every frame

/**
 * Parts of the store that change: the sliding doors of the open entrances (open while shoppers
 * arrive) and the till displays (flash red after a refund). Entrances belong to nobody: they are
 * not marked with any player's name or colour.
 * @param {number} open 0 closed .. 1 open
 * @param {Float64Array} tillAt per-tile time (ms) of the last refund at the till on that tile
 */
export function drawDynamic(ctx, info, open, tillAt, now) {
  for (const d of info.doors) {
    if (!d.open) continue;
    ctx.save();
    ctx.transform(...d.frame);
    // A plain steel threshold strip, the same for every entrance.
    ctx.fillStyle = '#c9ced4';
    ctx.fillRect(1, 0, 5, 2 * T);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 0, 5, 2 * T);
    // Two sliding glass panels across the doorway; they slide into the walls either side while a
    // wave is on.
    const half = T;
    const slide = open * (half - 6);
    box(ctx, 16, -slide, 8, half, 2, C.glass, 2);
    box(ctx, 16, half + slide, 8, half, 2, C.glass, 2);
    // Green light over the doorway when open, red when shut.
    ctx.fillStyle = open > 0.5 ? '#4ade80' : '#ef4444';
    ctx.beginPath();
    ctx.arc(33, -7, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }
  const w = info.w;
  for (const i of info.tills) {
    const px = (i % w) * T, py = ((i / w) | 0) * T;
    const since = now - tillAt[i];
    const hot = since < 900 && ((since / 150) | 0) % 2 === 0;
    box(ctx, px + 21, py + 8, 14, 16, 2, hot ? '#7a1010' : '#3a3a3a', 1.8);
    text(ctx, hot ? '-$' : '$', px + 28, py + 16.5, 11, hot ? '#ff6b5e' : '#7CFC00', 900);
  }
}
