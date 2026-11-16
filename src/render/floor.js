// The store itself: concrete floor, walls, pillars, partition walls, shelving, the entrances and
// the tills. Maps run from 30 x 16 to 99 x 55 tiles, and three designs:
//   warehouse  open floor with a few hazard-striped pillars
//   showroom   rooms divided by plasterboard partitions with framed two-tile doorways; each room
//              has its own floor tint, like the display rooms of a flat-pack shop
//   aisles     supermarket shelving units full of products, with sale signs on the end caps
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

/** What a wall tile is, for drawing. */
export const OUTER = 1, PILLAR = 2, PARTITION = 3, SHELF = 4;

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

  // Wall kinds. An inner wall tile with no inner wall next to it is a pillar whatever the design.
  const wall = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (tiles[i] !== '#') continue;
    const x = i % w, y = (i / w) | 0;
    if (border(x, y)) { wall[i] = OUTER; continue; }
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

  return { w, h, tiles, design, wall, doorway, tint, shelves, tills, tillTop, tillBot, doors, zones, patches };
}

/** True if the analysed map no longer matches the state (a new game, or an entrance opened). */
export function mapChanged(info, s) {
  return !info || info.w !== s.w || info.h !== s.h || info.tiles !== s.tiles ||
    info.design !== ((s.map && s.map.design) || 'warehouse') ||
    info.zones !== (typeof s.zones === 'string' && s.zones.length === s.w * s.h ? s.zones : '');
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
  g.fillStyle = info.design === 'aisles' ? '#979a9c' : C.floor;
  g.fillRect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T);

  // Slightly lighter and darker concrete slabs, and the odd oil spot, so the floor is not flat.
  for (let y = Math.max(1, r.y0); y < Math.min(h - 1, r.y1); y++) {
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
  g.strokeStyle = C.floorLine;
  g.lineWidth = 1.5;
  g.stroke();
  // Expansion joints every five tiles across and four down, a little darker.
  g.beginPath();
  for (let x = Math.ceil(r.x0 / 5) * 5; x <= r.x1; x += 5) { if (x > 0 && x < w) { g.moveTo(x * T + 0.5, Y0); g.lineTo(x * T + 0.5, Y1); } }
  for (let y = Math.ceil(r.y0 / 4) * 4; y <= r.y1; y += 4) { if (y > 0 && y < h) { g.moveTo(X0, y * T + 0.5); g.lineTo(X1, y * T + 0.5); } }
  g.strokeStyle = C.joint;
  g.lineWidth = 2.5;
  g.stroke();
  // A small dot in the middle of every floor tile helps judge positions.
  g.fillStyle = C.floorDot;
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
 * arrive), each framed in its owner's colour, and the till displays (flash red after a refund).
 * @param {number} open 0 closed .. 1 open
 * @param {Float64Array} tillAt per-row time (ms) of the last refund at that row's till
 * @param {Array} players state.players, for the entrance colours
 */
export function drawDynamic(ctx, info, players, open, tillAt, now) {
  for (const d of info.doors) {
    if (!d.open) continue;
    const p = players[d.n];
    ctx.save();
    ctx.transform(...d.frame);
    // The owner's colour on the jambs and along the threshold.
    if (p) {
      ctx.fillStyle = p.color;
      ctx.fillRect(0, -6, T, 6);
      ctx.fillRect(0, 2 * T, T, 6);
      ctx.fillRect(1, 0, 5, 2 * T);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, -6, T, 6);
      ctx.strokeRect(0, 2 * T, T, 6);
      ctx.strokeRect(1, 0, 5, 2 * T);
    }
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
