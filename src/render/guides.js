// Guides drawn over the warehouse to explain it: the route shoppers will walk, the shorter route
// dads take (they step over belts), and highlighted tiles the tutorial wants the player to use.
import { W, H, DIRS, getDist, getHopDist, UNREACHABLE } from '../sim/index.js';
import { TILE, INK, rr, label, font } from './paint.js';

const T = TILE;
const DASH = [10, 9];
const NO_DASH = [];
const cache = new WeakMap(); // state -> { ver, normal, dad }

/** Follows a distance map downhill from a tile to a till. Returns pixel points along the way. */
function trace(field, start) {
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

function routes(s) {
  const hit = cache.get(s);
  if (hit && hit.ver === s.gridVer) return hit;
  const dist = getDist(s), hop = getHopDist(s);
  // Start from the door nearest the tills on each map.
  let door = -1, dadDoor = -1;
  for (let i = 0; i < s.tiles.length; i++) {
    if (s.tiles[i] !== 'D') continue;
    if (dist[i] !== UNREACHABLE && (door < 0 || dist[i] < dist[door])) door = i;
    if (hop[i] !== UNREACHABLE && (dadDoor < 0 || hop[i] < hop[dadDoor])) dadDoor = i;
  }
  const normal = door >= 0 ? trace(dist, door) : [];
  let dad = dadDoor >= 0 ? trace(hop, dadDoor) : [];
  // Only show the dad route when it really is a short cut.
  if (door >= 0 && dadDoor >= 0 && hop[dadDoor] >= dist[door]) dad = [];
  const out = { ver: s.gridVer, normal, dad };
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
 */
export function drawRoutes(ctx, s, time) {
  const r = routes(s);
  const offset = (time * 38) % 19;
  strokeRoute(ctx, r.normal, '#ffe14a', offset, 0);
  if (r.dad.length) strokeRoute(ctx, r.dad, '#5cc8ff', offset * 1.6, 5);
  tag(ctx, r.normal, 0.5, 'SHOPPER ROUTE', '#ffe14a', 0);
  if (r.dad.length) tag(ctx, r.dad, 0.3, 'DAD SHORT CUT', '#8fdcff', 5);
}

/**
 * Highlights tiles: a pulsing outline with a bouncing arrow above, and an optional caption.
 * @param {Array<{x:number, y:number, label?:string}>} marks
 * @param {number} now milliseconds
 */
export function drawMarks(ctx, marks, now) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 180);
  const bounce = Math.abs(Math.sin(now / 260)) * 7;
  // With many marks (a run of belts) only the captioned ones get an arrow, or it turns to clutter.
  const arrows = marks.length <= 3;
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
      if (m.label) {
        ctx.font = font(12);
        const w = ctx.measureText(m.label).width;
        label(ctx, m.label, px + T + 8 + w / 2, py + T / 2, 12, '#ffffff', INK, 4);
      }
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
}
