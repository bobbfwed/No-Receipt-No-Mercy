// Placing a building with a finger (0.3.03, the owner's request): the numbers and the decisions,
// kept apart from the DOM so they can be tested in Node. input.js uses them.
//
// A finger hides what it is on, so while a finger places a building the preview is drawn above it,
// "lifted", and the building goes where the preview is, never under the finger. A tap (a finger
// that does not drag, however long it rests) still places on the tapped tile: a tap is aimed with
// the eyes, not felt with the finger. Holding the
// finger near an edge of the floor slides the view that way, slowly. A building can also be dragged
// up out of its button in the bar; a sideways swipe on the bar still scrolls the bar.

/** How far above the finger the preview's centre goes: 1.5 tiles, but never under 56 or over 110
 *  CSS pixels, so it clears a fingertip at any zoom and stays near the finger when zoomed in. */
export const LIFT = { tiles: 1.5, minPx: 56, maxPx: 110, easeMs: 140 };
/** A finger that never moves this far from where it went down is a tap, however long it is held:
 *  it places on the tapped tile. (The owner: "If a player just does a single tap, it should place
 *  the building exactly where they tapped. If they drag their finger at all, it offsets it.") The
 *  few pixels let a shaky tap still be a tap. */
export const TAP_SLOP_PX = 8;
/** The band along each edge of the floor where a held finger slides the view, and the top speed
 *  (reached at the very edge, or beyond it). */
export const EDGE = { bandPx: 48, tilesPerSec: 8 };
/** How far up out of a bar button a finger must go before it picks the building up. */
export const BAR_PICK_PX = 12;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** How far above the finger the lifted point is, in CSS pixels, at a zoom of `zoom` pixels a tile. */
export function liftPx(zoom) {
  return clamp(LIFT.tiles * (Number(zoom) || 0), LIFT.minPx, LIFT.maxPx);
}

/** How far the preview has risen, 0 to 1, `ms` after it started to (a quick ease, not a jump). */
export function liftFraction(ms) {
  const t = clamp((Number(ms) || 0) / LIFT.easeMs, 0, 1);
  return t * t * (3 - 2 * t);
}

/** True once a finger has dragged from where it went down: the preview then lifts, and stays lifted
 *  for the rest of that touch (the caller remembers it), even if the finger comes back. */
export function shouldLift(movedPx) {
  return movedPx >= TAP_SLOP_PX;
}

/**
 * One finger's press on the floor with a building held, from where it went down: move() it as the
 * finger moves; `lifted` turns true once it has dragged and never turns back within that touch.
 * Time plays no part: a finger resting still for as long as it likes is still a tap.
 */
export function createPress(x0, y0) {
  let up = false;
  return {
    move(x, y) { if (!up && shouldLift(Math.hypot(x - x0, y - y0))) up = true; return up; },
    get lifted() { return up; },
  };
}

/**
 * Where a w x h building goes with a finger at screen point (fx, fy) and its preview lifted by the
 * fraction f (1: fully up). `cam` is the camera ({ x, y, zoom }: the view's centre in tiles, CSS
 * pixels a tile), `rect` the floor's box on screen. Gives the lifted point on screen (sx, sy) and in
 * tiles (x, y), and the anchor tile of the footprint centred on it (null off the map).
 */
export function liftedSpot(fx, fy, cam, rect, w, h, mapW, mapH, f = 1) {
  const sy = fy - liftPx(cam.zoom) * f;
  const x = cam.x + (fx - (rect.left + rect.width / 2)) / cam.zoom;
  const y = cam.y + (sy - (rect.top + rect.height / 2)) / cam.zoom;
  return { sx: fx, sy, x, y, tile: liftedAnchor(x, y, w, h, mapW, mapH) };
}

/**
 * The anchor (top-left) tile of a w x h building whose footprint is centred on the point (px, py),
 * in tiles with decimals, moved inside a map of mapW x mapH tiles. Null if the point is off the map.
 */
export function liftedAnchor(px, py, w, h, mapW, mapH) {
  if (!(px >= 0 && py >= 0 && px < mapW && py < mapH)) return null;
  const x = clamp(Math.floor(px - w / 2 + 0.5), 0, Math.max(0, mapW - w));
  const y = clamp(Math.floor(py - h / 2 + 0.5), 0, Math.max(0, mapH - h));
  return { x, y };
}

/**
 * How fast the view slides, in tiles a second on each axis, with a finger at (x, y) over a floor
 * whose box on screen is `rect` ({ left, top, right, bottom }). Zero outside the edge bands; inside
 * one, the speed grows with how deep in the finger is, to the full speed at the edge and beyond it.
 * `bottom: false` leaves the bottom edge out (a drag from the bar that has not yet been up on the floor).
 */
export function edgeVelocity(x, y, rect, { bottom = true } = {}) {
  const depth = (inside) => clamp((EDGE.bandPx - inside) / EDGE.bandPx, 0, 1);
  const vx = (depth(rect.right - x) - depth(x - rect.left)) * EDGE.tilesPerSec;
  const vy = ((bottom ? depth(rect.bottom - y) : 0) - depth(y - rect.top)) * EDGE.tilesPerSec;
  return { vx, vy };
}

/**
 * A finger pressed on a building's button in the bar has moved (dx, dy) pixels: 'pick' picks the
 * building up (mostly upward by BAR_PICK_PX, or out of the bar onto the floor), 'scroll' leaves it to
 * the bar (mostly sideways: the browser scrolls the bar), 'wait' is not clear yet.
 */
export function barGesture(dx, dy, outOfBar = false) {
  const up = -dy, side = Math.abs(dx);
  if (outOfBar || (up >= BAR_PICK_PX && up > side)) return 'pick';
  if (side >= BAR_PICK_PX && side >= up) return 'scroll';
  return 'wait';
}
