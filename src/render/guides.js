// Guides drawn over the store to explain it: the route shoppers will walk from every open
// entrance, the shorter routes dads take (they step over belts), and highlighted tiles the
// tutorial wants the player to use.
import { DIRS, getDist, getHopDist, UNREACHABLE } from '../sim/index.js';
import { TILE, INK, rr, label, font } from './paint.js';

const T = TILE;
const DASH = [10, 9];
const NO_DASH = [];
const cache = new WeakMap(); // state -> { ver, tiles, normal: [pts], dad: [pts] }

/** Follows a distance map downhill from a tile to a till. Returns pixel points along the way. */
function trace(s, field, start) {
  const W = s.w, H = s.h;
  const pts = [];
  let i = start;
  for (let guard = 0; guard < W * H; guard++) {
    pts.push(((i % W) + 0.5) * T, (((i / W) | 0) + 0.5) * T);
    if (field[i] === 0) break;
    let best = i, bd = field[i];
    for (let k = 0; k < 4; k++) {
      const x = (i % W) + DIRS[k][0], y = ((i / W) | 0) + DIRS[k][1];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const n = y * W + x;
      if (field[n] < bd) { bd = field[n]; best = n; }
    }
    if (best === i) break;
    i = best;
  }
  return pts;
}

/** The tile of an entrance nearest the tills by a distance map, or -1. */
function bestTile(door, field) {
  let best = -1;
  for (const i of door) if (field[i] !== UNREACHABLE && (best < 0 || field[i] < field[best])) best = i;
  return best;
}

/** One shopper route per open entrance, and a dad route from each where his is shorter. */
function routes(s) {
  const hit = cache.get(s);
  if (hit && hit.ver === s.gridVer && hit.tiles === s.tiles) return hit;
  const dist = getDist(s), hop = getHopDist(s);
  const normal = [], dad = [];
  const doors = s.doors ? s.doors.slice(0, Math.max(1, s.open | 0)) : [];
  for (const door of doors) {
    if (s.tiles[door[0]] !== 'D') continue;
    const a = bestTile(door, dist), b = bestTile(door, hop);
    if (a >= 0) normal.push(trace(s, dist, a));
    // Only show the dad route when it really is a short cut.
    if (b >= 0 && (a < 0 || hop[b] < dist[a])) dad.push(trace(s, hop, b));
  }
  const out = { ver: s.gridVer, tiles: s.tiles, normal, dad };
  cache.set(s, out);
  return out;
}

function strokeRoute(ctx, pts, color, offset, shift) {
  if (pts.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(pts[0] + shift, pts[1] + shift);
  for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k] + shift, pts[k + 1] + shift);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash(NO_DASH);
  ctx.strokeStyle = 'rgba(20,24,28,0.45)';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.setLineDash(DASH);
  ctx.lineDashOffset = -offset; // the dashes march toward the tills
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.lineDashOffset = 0;
}

function tag(ctx, pts, at, text, color, shift) {
  if (pts.length < 8) return;
  const k = Math.min(pts.length - 2, Math.max(0, (Math.floor((pts.length / 2) * at)) * 2));
  label(ctx, text, pts[k] + shift, pts[k + 1] + shift - 13, 11, color, INK, 3.5);
}

/**
 * Draws the route shoppers will take from the doors to the tills, and the dads' short cut if
 * they have one.
 * @param {number} time seconds, for the marching dashes
 * @param {number} [alpha] how strongly (0.4 they are drawn always, a little fainter while shoppers
 *   are on the floor, and faintly from The Back)
 * @param {boolean} [tags] the SHOPPER ROUTE and DAD SHORT CUT labels
 */
export function drawRoutes(ctx, s, time, alpha = 1, tags = true) {
  const r = routes(s);
  const offset = (time * 38) % 19;
  ctx.globalAlpha = alpha;
  for (const pts of r.normal) strokeRoute(ctx, pts, '#ffe14a', offset, 0);
  for (const pts of r.dad) strokeRoute(ctx, pts, '#5cc8ff', offset * 1.6, 5);
  // Each route is labelled once; where routes have merged the labels would sit on top of each
  // other, so they are placed at different points along each route.
  if (tags) {
    r.normal.forEach((pts, k) => tag(ctx, pts, 0.5 - k * 0.07, 'SHOPPER ROUTE', '#ffe14a', 0));
    r.dad.forEach((pts, k) => tag(ctx, pts, 0.3 - k * 0.04, 'DAD SHORT CUT', '#8fdcff', 5));
  }
  ctx.globalAlpha = 1;
}

/**
 * Highlights tiles: a pulsing outline with a bouncing arrow above, and an optional caption.
 * @param {Array<{x:number, y:number, label?:string}>} marks
 * @param {number} now milliseconds
 * @param {number} W map width in tiles
 * @param {number} H map height in tiles
 */
export function drawMarks(ctx, marks, now, W, H) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 180);
  const bounce = Math.abs(Math.sin(now / 260)) * 7;
  // With many marks (a run of belts) only the captioned ones get an arrow, or it turns to clutter.
  const arrows = marks.length <= 3;
  // (In a run, the captions are drawn last, over every outline: a caption beside one tile can run
  // over the next one, as the TV Salesman's does over his own other tiles.)
  const captions = [];
  for (const m of marks) {
    if (!(m.x >= 0 && m.y >= 0 && m.x < W && m.y < H)) continue;
    const px = m.x * T, py = m.y * T, cx = px + T / 2;
    rr(ctx, px + 2, py + 2, T - 4, T - 4, 6);
    ctx.fillStyle = `rgba(56,225,255,${0.12 + 0.16 * pulse})`;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(86,232,255,${0.65 + 0.35 * pulse})`;
    ctx.stroke();
    if (!arrows) {
      // In a run of marks, captions go beside the tile so they do not cover the tile above.
      if (m.label) captions.push([m.label, px, py]);
      continue;
    }
    // Arrow pointing down at the tile.
    const ay = py - 6 - bounce;
    ctx.beginPath();
    ctx.moveTo(cx, ay);
    ctx.lineTo(cx - 9, ay - 12);
    ctx.lineTo(cx - 3.5, ay - 12);
    ctx.lineTo(cx - 3.5, ay - 22);
    ctx.lineTo(cx + 3.5, ay - 22);
    ctx.lineTo(cx + 3.5, ay - 12);
    ctx.lineTo(cx + 9, ay - 12);
    ctx.closePath();
    ctx.fillStyle = '#56e8ff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (m.label) label(ctx, m.label, cx, ay - 32, 12, '#ffffff', INK, 4);
  }
  // In a run of marks, captions go beside the tile so they do not cover the tile above.
  for (const [text, px, py] of captions) {
    ctx.font = font(12);
    const w = ctx.measureText(text).width;
    label(ctx, text, px + T + 8 + w / 2, py + T / 2, 12, '#ffffff', INK, 4);
  }
}
