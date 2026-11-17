// The store itself: concrete floor, walls, pillars, partition walls, shelving, the entrances and
// the tills. Maps run from 30 x 16 to 121 x 67 tiles, and four designs:
//   warehouse  open floor with a few hazard-striped pillars
//   showroom   rooms divided by plasterboard partitions with framed two-tile doorways; each room
//              has its own floor tint, like the display rooms of a flat-pack shop
//   aisles     supermarket shelving units full of products, with sale signs on the end caps
//   food       a food court: cream tiled floor, shop-front awnings on the walls, and furniture
//              where state.decor says (tables, booths, benches, planters, bins, food stalls and a
//              fountain), each kind drawn in its own function below
// Most games also have marked floor for the factory machines (state.zones): tinted patches with a
// painted border and their name stencilled on, one colour per kind (ZONES in the rules).
// Almost all of it never changes, so it is painted into cached chunks (createFloorCache); only the
// entrance doors (open during a wave) and the till displays (flash on a refund) are drawn every
// frame (drawDynamic).
import { ZONES } from '../sim/index.js';
import {
  TILE, INK, C, rr, paint, box, text, hazard, hash2, FONT_FAMILY,
} from './paint.js';

const T = TILE;

/** What a wall tile is, for drawing. FURN: the food court's furniture (see state.decor). */
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
 *   tile, -1 none), shelves [{x, y0, y1}], tills [i], tillTop, tillBot, doors [door] }
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

  const tills = [];
  let tillTop = h, tillBot = 0;
  for (let i = 0; i < n; i++) {
    if (tiles[i] !== 'T') continue;
    tills.push(i);
    const y = (i / w) | 0;
    tillTop = Math.min(tillTop, y);
    tillBot = Math.max(tillBot, y + 1);
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

  return { w, h, tiles, design, wall, doorway, tint, shelves, tills, tillTop, tillBot, doors, zones, patches, decor, blocks };
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

/**
 * The food court's pieces bigger than a tile: each connected block of food stall ('k') or
 * fountain ('f') tiles, drawn as one. @returns {Array} { ch, x0, y0, x1, y1 } (exclusive end)
 */
function findBlocks(w, h, decor) {
  const seen = new Uint8Array(w * h);
  const blocks = [];
  for (let i = 0; i < w * h; i++) {
    const ch = decor[i];
    if (seen[i] || (ch !== 'k' && ch !== 'f')) continue;
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
  drawInnerWalls(g, info, r);
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
  const food = info.design === 'food';
  g.fillStyle = food ? FOOD.floor : info.design === 'aisles' ? '#979a9c' : C.floor;
  g.fillRect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T);

  if (food) foodFloor(g, info, r);
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
  g.strokeStyle = food ? FOOD.grout : C.floorLine;
  g.lineWidth = 1.5;
  g.stroke();
  // Expansion joints every five tiles across and four down, a little darker.
  g.beginPath();
  for (let x = Math.ceil(r.x0 / 5) * 5; x <= r.x1; x += 5) { if (x > 0 && x < w) { g.moveTo(x * T + 0.5, Y0); g.lineTo(x * T + 0.5, Y1); } }
  for (let y = Math.ceil(r.y0 / 4) * 4; y <= r.y1; y += 4) { if (y > 0 && y < h) { g.moveTo(X0, y * T + 0.5); g.lineTo(X1, y * T + 0.5); } }
  g.strokeStyle = food ? FOOD.joint : C.joint;
  g.lineWidth = 2.5;
  g.stroke();
  // A small dot in the middle of every floor tile helps judge positions.
  g.fillStyle = food ? FOOD.dot : C.floorDot;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (tiles[y * w + x] === '.') g.fillRect(x * T + 19, y * T + 19, 3, 3);
    }
  }
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
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (tiles[y * w + x] === 'T') hatch(g, (x - 1) * T, y * T, T, T);
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
function drawInnerWalls(g, info, r) {
  const { w, h, wall, doorway } = info;
  const kindAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? OUTER : wall[y * w + x]);
  const solid = (x, y) => { const k = kindAt(x, y); return k === OUTER || k === PARTITION; };

  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (wall[y * w + x] === PILLAR) drawPillar(g, x * T, y * T);
    }
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
      if (ch === 'k' || ch === 'f') continue;
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
      else drawFountain(g, it);
      continue;
    }
    const x = items[k + 2], y = items[k + 3];
    if (it === 't') drawTable(g, info, x, y);
    else if (it === 'b') drawBench(g, info, x, y);
    else if (it === 'p') drawPlanter(g, x, y);
    else if (it === 'n') drawBin(g, x, y);
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

/** Wall signs on the right wall: RETURNS above the tills and NO RECEIPT NO REFUND below them. */
function drawSigns(g, info) {
  const { w, h, tillTop, tillBot } = info;
  if (tillTop >= tillBot) return;
  const x = w * T - 35;
  const a0 = Math.max(0.8, tillTop - 4.2), a1 = tillTop - 1.0;
  if (a1 - a0 >= 2) verticalSign(g, x, a0, a1, C.red, '#ffffff', ['RETURNS']);
  const b0 = tillBot + 0.2, b1 = Math.min(h - 0.8, tillBot + 3.4);
  if (b1 - b0 >= 2.6) verticalSign(g, x, b0, b1, C.yellow, INK, ['NO RECEIPT', 'NO REFUND']);
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
 * @param {Float64Array} tillAt per-row time (ms) of the last refund at that row's till
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
    const since = now - tillAt[(i / w) | 0];
    const hot = since < 900 && ((since / 150) | 0) % 2 === 0;
    box(ctx, px + 21, py + 8, 14, 16, 2, hot ? '#7a1010' : '#3a3a3a', 1.8);
    text(ctx, hot ? '-$' : '$', px + 28, py + 16.5, 11, hot ? '#ff6b5e' : '#7CFC00', 900);
  }
}
