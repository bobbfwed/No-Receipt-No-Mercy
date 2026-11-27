// Guides drawn over the store to explain it: the route shoppers will walk from every open
// entrance, the dads' two routes (0.4, the owner's rule: where dads walk now, round live Razor Wire
// only, solid and labelled DADS; and, where it differs, where they would walk if every planned wire
// were stocked, fainter and dashed, labelled DADS, IF WIRED; worked out in wireplan.js), and
// highlighted tiles the tutorial wants the player to use.
import { TILE, INK, rr, label, font } from './paint.js';
import { dadRoutes, toPoints, SHOPPER_LABEL, DAD_LABEL, DAD_PLAN_LABEL } from './wireplan.js';

const T = TILE;
const DASH = [10, 9];
const PLAN_DASH = [7, 7];
const TICK_DASH = [3, 25];
const NO_DASH = [];
/** The dads' colour on the floor (their route and its label). */
const DAD_BLUE = '#5cc8ff';
const DAD_TAG = '#8fdcff';
/** The routes' tiles as points, made once per route (the routes are cached against the layout). */
const ptsOf = new WeakMap();
function pointsOf(tiles, w) {
  let p = ptsOf.get(tiles);
  if (!p) { p = toPoints(tiles, w, T); ptsOf.set(tiles, p); }
  return p;
}

function pathOf(ctx, pts, shift) {
  ctx.beginPath();
  ctx.moveTo(pts[0] + shift, pts[1] + shift);
  for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k] + shift, pts[k + 1] + shift);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

/** The shoppers' route: a dark edge and yellow dashes marching toward the tills. */
function strokeRoute(ctx, pts, color, offset, shift) {
  if (pts.length < 4) return;
  pathOf(ctx, pts, shift);
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

/**
 * Where dads walk now: one solid line in their colour over a dark edge, so it never passes for the
 * shoppers' marching dashes, with small bright ticks running along it toward the tills.
 */
function strokeDads(ctx, pts, offset, shift) {
  if (pts.length < 4) return;
  pathOf(ctx, pts, shift);
  ctx.setLineDash(NO_DASH);
  ctx.strokeStyle = 'rgba(12,20,30,0.55)';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = DAD_BLUE;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.setLineDash(TICK_DASH);
  ctx.lineDashOffset = -offset;
  ctx.strokeStyle = '#e0f6ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.lineDashOffset = 0;
}

/** Where dads would walk if every planned wire were stocked, where that differs: faint and dashed. */
function strokePlan(ctx, pts, shift, alpha) {
  if (pts.length < 4) return;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  pathOf(ctx, pts, shift);
  ctx.setLineDash(PLAN_DASH);
  ctx.strokeStyle = 'rgba(12,20,30,0.5)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = DAD_TAG;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.globalAlpha = a;
}

function tag(ctx, pts, at, text, color, shift) {
  if (pts.length < 8) return;
  const k = Math.min(pts.length - 2, Math.max(0, (Math.floor((pts.length / 2) * at)) * 2));
  label(ctx, text, pts[k] + shift, pts[k + 1] + shift - 13, 11, color, INK, 3.5);
}

/** The longest of some runs of tiles, or null. */
const longest = (runs) => runs.reduce((a, r) => (!a || r.length > a.length ? r : a), null);

/**
 * Draws the route shoppers will take from the doors to the tills, and the dads' two routes.
 * @param {number} time seconds, for the marching dashes
 * @param {number} [alpha] how strongly (0.4 they are drawn always, a little fainter while shoppers
 *   are on the floor, and faintly from The Back)
 * @param {boolean} [tags] the labels: SHOPPER ROUTE, DADS and DADS, IF WIRED
 * @param {Object} [preview] a wire direction being tried ({ x, y, d }): the dads' routes as they
 *   would be with it
 */
export function drawRoutes(ctx, s, time, alpha = 1, tags = true, preview = null) {
  const r = dadRoutes(s, preview);
  const offset = (time * 38) % 19;
  const w = s.w;
  ctx.globalAlpha = alpha;
  for (const tiles of r.normal) strokeRoute(ctx, pointsOf(tiles, w), '#ffe14a', offset, 0);
  for (const d of r.dads) for (const run of d.runs) strokePlan(ctx, pointsOf(run, w), 5, 0.75);
  for (const d of r.dads) strokeDads(ctx, pointsOf(d.live, w), (time * 60) % 28, 5);
  // Each route is labelled once; where routes have merged the labels would sit on top of each
  // other, so they are placed at different points along each route.
  if (tags) {
    r.normal.forEach((tiles, k) => tag(ctx, pointsOf(tiles, w), 0.5 - k * 0.07, SHOPPER_LABEL, '#ffe14a', 0));
    r.dads.forEach((d, k) => {
      // (Early on their way: further along, the dads crowding at the wire would cover it.)
      tag(ctx, pointsOf(d.live, w), 0.18 - k * 0.04, DAD_LABEL, DAD_TAG, 5);
      // (The planned stretch's label on its longest stretch, near where it leaves the dads' line.)
      const run = longest(d.runs);
      if (run && run.length >= 3) tag(ctx, pointsOf(run, w), 0.12, DAD_PLAN_LABEL, DAD_TAG, 5);
    });
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
  // With many marks (a wall of crates) only the captioned ones get an arrow, or it turns to clutter.
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
