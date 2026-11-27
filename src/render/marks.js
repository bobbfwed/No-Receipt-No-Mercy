// Supply status marks (0.4, stage 5b). Zoomed out, a Dumbwaiter's gauges and the supply pips over a
// security building are a few pixels across and say nothing. Below MARK_ZOOM both are replaced by
// one mark per building, never smaller than MARK_PX on screen:
//   a full green disc   every supply it takes is stocked
//   an amber half disc  some are
//   an empty red ring   none are
// and round it a purple ring of barbs when its Razor Wire is live, a dashed purple ring when its wire
// is only planned (a direction set, no wire in stock), with a red lamp on it (0.4.01: the building
// is asking for Razor Wire, as the lamp on its Dumbwaiter says). Which supplies count: every one the building
// takes, except Razor Wire while it has no wire direction (wire with nowhere to go is not missing).
//
// stockMark() and the numbers are pure (tested in Node); markSprite() paints, in a browser.
import { wireLive } from '../sim/index.js';
import { stockTracks } from '../content/supplies.js';
import { INK, makeSprite } from './paint.js';

/** Below this zoom (CSS pixels a tile) the marks replace the gauges and pips. */
export const MARK_ZOOM = 32;
/** The least size of a mark on screen, in CSS pixels across (its disc, without the wire ring). */
export const MARK_PX = 13;

/** How much of what it takes a building holds: none, some or all. */
export const NONE = 0, SOME = 1, ALL = 2;
/** Its wire: none, planned (a direction, no stock), live. */
export const NO_WIRE = 0, PLANNED = 1, LIVE = 2;

/**
 * The mark a security building gets, as one small number: its stock level (NONE, SOME, ALL) plus 3
 * times its wire (NO_WIRE, PLANNED, LIVE). -1 for a building that takes no supplies (a Crate Stack).
 */
export function stockMark(b) {
  const tracks = stockTracks(b.k);
  if (!tracks.length) return -1;
  const wired = b.wd !== undefined && b.wd !== null;
  let want = 0, have = 0;
  for (const t of tracks) {
    if (t === 'wire' && !wired) continue;
    want++;
    const run = b.s && b.s[t];
    if (run && run.length) have++;
  }
  const level = have === 0 ? NONE : have === want ? ALL : SOME;
  const wire = !wired ? NO_WIRE : wireLive(b) ? LIVE : PLANNED;
  return level + 3 * wire;
}

/** True if marks replace the detailed gauges and pips at this zoom. */
export const useMarks = (zoom) => zoom > 0 && zoom < MARK_ZOOM;

/**
 * The radius of a mark's disc in world pixels (40 a tile) at a zoom: MARK_PX across on screen,
 * but never smaller than it would be at MARK_ZOOM (so it does not shrink as one zooms in to the
 * threshold), and never wider than a tile (a radius of half a tile).
 */
export function markRadius(zoom, tile = 40) {
  const z = Math.max(1, Math.min(zoom, MARK_ZOOM));
  return Math.min(tile * 0.5, (MARK_PX / 2) * (tile / z));
}

const COLOURS = ['#ef4444', '#f59e0b', '#22c55e'];
/** The sprite box in world units, at the radius MARKBOX / 4 (room for the wire's barbs). */
const MARKBOX = 40;
let sprites = null;

/** The sprite of mark `code` (stockMark's), painted once, at a fixed generous resolution. */
function markSprite(code) {
  if (!sprites) sprites = [];
  let sp = sprites[code];
  if (!sp) {
    // Painted at 3 device pixels a world pixel: sharp at any size it is drawn.
    sp = makeSprite(MARKBOX, 3, (g) => paintMark(g, code % 3, (code / 3) | 0));
    sprites[code] = sp;
  }
  return sp.canvas;
}

/** A mark of stock `level` and `wire`, its disc of radius 10 centred on (0, 0). */
function paintMark(g, level, wire) {
  const R = 10, TAU = Math.PI * 2;
  if (wire === LIVE) {
    // A ring of barbs: the live Razor Wire round it.
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU, rad = k % 2 ? R + 3 : R + 7;
      if (k) g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else g.moveTo(rad, 0);
    }
    g.closePath();
    g.fillStyle = '#a855f7'; g.fill();
    g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
  } else if (wire === PLANNED) {
    g.beginPath(); g.arc(0, 0, R + 4, 0, TAU);
    g.setLineDash([3, 2.5]);
    g.lineWidth = 2.6; g.strokeStyle = '#d8b4fe'; g.stroke();
    g.setLineDash([]);
  }
  // (0.4.01) Planned wire is wire asking for Razor Wire: a red lamp on the ring, as on the
  // Dumbwaiter, drawn after the disc so nothing covers it.
  const lamp = wire === PLANNED;
  g.beginPath(); g.arc(0, 0, R, 0, TAU);
  g.fillStyle = level === NONE ? '#2a1414' : '#1d2125'; g.fill();
  if (level === ALL) {
    g.beginPath(); g.arc(0, 0, R, 0, TAU);
    g.fillStyle = COLOURS[ALL]; g.fill();
  } else if (level === SOME) {
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI); g.closePath();
    g.fillStyle = COLOURS[SOME]; g.fill();
    g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0);
    g.lineWidth = 1.4; g.strokeStyle = INK; g.stroke();
  } else {
    g.beginPath(); g.arc(0, 0, R - 2.6, 0, TAU);
    g.lineWidth = 3.4; g.strokeStyle = COLOURS[NONE]; g.stroke();
  }
  g.beginPath(); g.arc(0, 0, R, 0, TAU);
  g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
  if (lamp) {
    g.beginPath(); g.arc(LAMP[0], LAMP[1], 4.6, 0, TAU);
    g.fillStyle = '#ff2d2d'; g.fill();
    g.lineWidth = 1.8; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.arc(LAMP[0] - 1.2, LAMP[1] - 1.2, 1.3, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
  }
}

/** Where a mark's red lamp sits, in the units of a disc of radius 10: on its ring, top right. */
const LAMP = [9.5, -9.5];

/** Draws mark `code` centred on (x, y) in world pixels with a disc of radius r. */
export function drawMark(ctx, code, x, y, r) {
  if (code < 0) return;
  const size = MARKBOX * (r / 10);
  ctx.drawImage(markSprite(code), x - size / 2, y - size / 2, size, size);
}

/**
 * The glow behind a planned-wire mark's red lamp (drawn before the mark, at the same x, y and r),
 * growing and fading with k from 0 to 1 (the screen's clock), so the lamp blinks zoomed out too.
 */
export function drawMarkLamp(ctx, x, y, r, k) {
  const u = r / 10;
  ctx.save();
  ctx.globalAlpha = 0.2 + 0.45 * k;
  ctx.fillStyle = '#ff2d2d';
  ctx.beginPath(); ctx.arc(x + LAMP[0] * u, y + LAMP[1] * u, (6 + 4 * k) * u, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
