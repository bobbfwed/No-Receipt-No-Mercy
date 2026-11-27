// The Back (0.4): drawing the floor under the shop. Its belts look like the shop floor's (the same
// belt sprites, buildings.js), the items riding them glide between ticks, and the other parts are
// ported from the concept pictures the owner approved (docs/mockups/0.4/mockups.js).
//
//   const art = createBackArt();
//   art.setScale(r)                 when the zoom crosses a resolution step (sprites are repainted)
//   art.handle(events, now)         the session's events: a Clearance Bin's pay floats up from it
//   art.draw(ctx, s, vis, F, base, belts, now, floats)  every visible part and item
//   art.drawGhost(ctx, s, k, x, y, d, F, base, belts)   a part as the placement preview shows it
//
// Everything is drawn in world pixels (TILE a tile), like the rest of the renderer. Only the tiles
// in `vis` are visited, and every part and item is a sprite painted once per resolution step, so a
// big Back costs a few drawImage calls a tile.
import {
  BACK, TICK_HZ, beltShape as backShape, overpassDirs, feedsInto, takesFrom, itemType, itemTier, unitsIn,
  stockCap, makeTicks, rebrandTicks, wireLive,
} from '../sim/index.js';
import { SUPPLIES, stockTracks } from '../content/supplies.js';
import { TILE, INK, C, rr, paint, box, circle, line, label, text, hazard, makeSprite } from './paint.js';
import { drawBeltTile, SP } from './buildings.js';
import { stockMark, useMarks, markRadius, drawMark, drawMarkLamp } from './marks.js';
import { createPaintBudget, createSpriteCache } from './spritecache.js';
import { matchLane, createGlides, ease, progress } from './glide.js';

const T = TILE, HALF = T / 2, TAU = Math.PI * 2;
const ROT = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const SUB = BACK.sub, GAP = BACK.gap, STEP = BACK.step, END = BACK.end;
/** How fast The Back's belts run, in tiles a second (2), for their chevrons. */
const SPEED = (STEP * TICK_HZ) / SUB;
/** Sprite box for an item, in world pixels (items are about 14 across, a tier ring 23). */
const ITEM = 24;
/** Sprite box for a part: a tile plus room for the Returns Drop's duct and the intern's head. */
const PART = 80;
/** Chevron steps per chevron spacing, as in the belt sprites (buildings.js). */
const PHASES = 8;
/** How long a Clearance Bin's "+$" floats, in milliseconds. */
const FLOAT_MS = 1300;

// ---------------------------------------------------------------------------------------------
// Items: returned junk and the four supplies, upright, about 14 world pixels across. A supply's
// tier is a ring round it: none for Store Brand, then bronze, silver and gold.

const TIER_RING = [null, null, '#c98a4b', '#e8ecf0', '#ffc928'];

/** The item drawings, by supply type (0 is junk). Ported from the concept pictures; wire is new. */
const ART = [
  function junk(g) {
    g.beginPath();
    g.moveTo(-7, -4.5); g.lineTo(-3, -6.5); g.lineTo(1, -5); g.lineTo(6.5, -6); g.lineTo(7, -0.5);
    g.lineTo(5.5, 5.5); g.lineTo(0.5, 4.5); g.lineTo(-4, 6); g.lineTo(-7, 3);
    g.closePath();
    g.lineJoin = 'round';
    paint(g, C.cardboard, 1.6);
    g.beginPath();
    g.moveTo(-3, -6.5); g.lineTo(-1, 0); g.lineTo(-4, 6); g.moveTo(-1, 0); g.lineTo(5.5, -1);
    g.strokeStyle = C.cardboardDark; g.lineWidth = 1; g.stroke();
    g.save();
    g.rotate(-0.25);
    rr(g, -1, -4.4, 8, 4.6, 0.8);
    paint(g, C.red, 1);
    g.fillStyle = '#fff';
    g.fillRect(0.3, -2.7, 5.4, 1.2);
    g.restore();
  },
  // 1 Bottled Spite (damage): a red bottle.
  function spite(g) {
    g.beginPath();
    g.moveTo(-1.7, -5); g.lineTo(1.7, -5); g.lineTo(1.7, -3);
    g.quadraticCurveTo(4.6, -2, 4.6, 1); g.lineTo(4.6, 6); g.quadraticCurveTo(4.6, 7.2, 3.4, 7.2);
    g.lineTo(-3.4, 7.2); g.quadraticCurveTo(-4.6, 7.2, -4.6, 6); g.lineTo(-4.6, 1);
    g.quadraticCurveTo(-4.6, -2, -1.7, -3);
    g.closePath();
    g.lineJoin = 'round';
    paint(g, C.red, 1.6);
    g.fillStyle = C.paper;
    g.fillRect(-3.9, 1.2, 7.8, 3.2);
    g.fillStyle = INK;
    g.fillRect(-1.2, 2.2, 2.4, 1.3);
    line(g, -2.9, -0.6, -2.9, 0.4, 'rgba(255,255,255,0.7)', 1.2);
    rr(g, -2.2, -8, 4.4, 3.4, 1);
    paint(g, '#2b2f34', 1.2);
  },
  // 2 Rage Cola (speed): a green can with a lightning bolt.
  function cola(g) {
    rr(g, -4.6, -6.6, 9.2, 13.4, 2.2);
    paint(g, C.green, 1.6);
    g.fillStyle = C.steelLight;
    g.fillRect(-3.6, -5.7, 7.2, 1.7);
    g.beginPath();
    g.moveTo(1.6, -3.6); g.lineTo(-2.6, 1.4); g.lineTo(0, 1.4); g.lineTo(-1.2, 5.6);
    g.lineTo(3, 0); g.lineTo(0.4, 0); g.lineTo(1.9, -3.6);
    g.closePath();
    paint(g, C.yellow, 0.9);
  },
  // 3 Extension Cord (range): an orange coil with a plug.
  function cord(g) {
    g.lineCap = 'round';
    for (const [r, w] of [[5.4, 3.2], [2.2, 2.4]]) {
      g.beginPath(); g.arc(-0.5, -0.5, r, 0, TAU);
      g.strokeStyle = INK; g.lineWidth = w + 2; g.stroke();
      g.strokeStyle = C.orange; g.lineWidth = w; g.stroke();
    }
    g.beginPath(); g.moveTo(3.5, 3.5); g.lineTo(5.5, 5.5);
    g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke();
    g.strokeStyle = C.orange; g.lineWidth = 1.6; g.stroke();
    rr(g, 4.5, 4, 4, 4, 0.8);
    paint(g, C.steelLight, 1.1);
  },
  // 4 was Duct Tape, gone in 0.4.01 (the owner: security is reinforced for cash instead).
  null,
  // 5 Razor Wire (stops dads): a dark coil bristling with barbs, on a purple tag.
  function wire(g) {
    g.lineCap = 'round';
    for (const cx of [-1.8, 1.8]) {
      g.beginPath(); g.ellipse(cx, -0.5, 4.8, 5.4, 0, 0, TAU);
      g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke();
      g.strokeStyle = '#8f979f'; g.lineWidth = 1.6; g.stroke();
    }
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.3, x = Math.cos(a) * 6.4, y = Math.sin(a) * 6 - 0.5;
      g.moveTo(x - 1.4, y - 1.4); g.lineTo(x + 1.4, y + 1.4);
      g.moveTo(x + 1.4, y - 1.4); g.lineTo(x - 1.4, y + 1.4);
    }
    g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
    rr(g, -3, 4.2, 6, 3.6, 1);
    paint(g, '#a855f7', 1);
  },
];

/** The supply types there are (0.4.01: 4, Duct Tape, is gone). */
const SUPPLY_TYPES = [1, 2, 3, 5];

/** Draws item `code` centred on (0, 0) in a sprite painter: its tier ring, then the item. */
function paintItem(g, code) {
  const ring = TIER_RING[itemTier(code)];
  if (ring) {
    g.beginPath(); g.arc(0, 0.5, 9, 0, TAU);
    g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    g.lineWidth = 3; g.strokeStyle = ring; g.stroke();
  }
  const draw = ART[itemType(code)];
  if (draw) draw(g);
}

// ---------------------------------------------------------------------------------------------
// Parts. Each painter draws one part centred on its tile's middle, in world pixels.

/** Small helpers in the shoppers' style, for the intern. */
function limb(g, x1, y1, x2, y2, color, w = 3.4) {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  g.lineCap = 'round';
  g.strokeStyle = INK; g.lineWidth = w + 2.4; g.stroke();
  g.strokeStyle = color; g.lineWidth = w; g.stroke();
}
function shoe(g, x, y, color) {
  g.beginPath(); g.ellipse(x + 1, y, 2.8, 1.7, 0, 0, TAU);
  paint(g, color, 1.4);
}
function hairCap(g, x, y, r, color) {
  g.beginPath();
  g.arc(x, y, r + 0.6, Math.PI * 0.92, Math.PI * 2.08);
  g.quadraticCurveTo(x + 2, y - 5, x - r - 0.4, y + 0.4);
  g.closePath();
  paint(g, color, 2);
}
/** A bored face: flat brows, no mouth worth mentioning. */
function face(g, x, y) {
  g.fillStyle = INK;
  g.beginPath();
  g.arc(x + 1.2, y - 0.4, 1.3, 0, TAU);
  g.arc(x + 5, y - 0.4, 1.3, 0, TAU);
  g.fill();
  g.beginPath();
  g.strokeStyle = INK; g.lineWidth = 1.4; g.lineCap = 'round';
  g.moveTo(x - 0.8, y - 3); g.lineTo(x + 2.6, y - 3);
  g.moveTo(x + 3.8, y - 3); g.lineTo(x + 6.6, y - 3);
  g.stroke();
}
function arrow(g, x1, y1, x2, y2, color = '#ffffff') {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx = x2 - Math.cos(a) * 5, hy = y2 - Math.sin(a) * 5;
  g.save();
  g.lineCap = 'round';
  line(g, x1, y1, hx, hy, INK, 5);
  line(g, x1, y1, hx, hy, color, 2.5);
  g.translate(x2, y2);
  g.rotate(a);
  g.beginPath(); g.moveTo(1, 0); g.lineTo(-6, -4.5); g.lineTo(-6, 4.5); g.closePath();
  g.lineJoin = 'round';
  paint(g, color, 1.6);
  g.restore();
}
function shadow(g, w = 34, h = 32) {
  g.fillStyle = 'rgba(0,0,0,0.3)';
  rr(g, -w / 2 + 3, -h / 2 + 5, w, h, 6);
  g.fill();
}

/** The yellow "out" arrow on side d, its tip just past the tile edge (as on the shop's machines). */
function outMark(g, d) {
  const path = () => {
    g.beginPath();
    g.moveTo(10, -3.5); g.lineTo(14, -3.5); g.lineTo(14, -8.5); g.lineTo(23, 0);
    g.lineTo(14, 8.5); g.lineTo(14, 3.5); g.lineTo(10, 3.5); g.closePath();
  };
  g.save();
  g.lineJoin = 'round';
  // A dark copy a little down and right, whichever way it points.
  g.save(); g.translate(1.5, 2); g.rotate(ROT[d]); path(); g.fillStyle = 'rgba(0,0,0,0.38)'; g.fill(); g.restore();
  g.rotate(ROT[d]);
  path(); paint(g, '#ffe14a', 2.2);
  g.restore();
}

/** Splitter: the steel Y-shaped divider plate, its stem toward the input (the belts are drawn under it). */
function paintSplitPlate(g, d) {
  g.save();
  g.rotate(ROT[d]); // local +x points away from the input
  const wedge = (ox, oy) => {
    g.beginPath();
    g.moveTo(-9 + ox, oy);
    g.lineTo(1 + ox, -4 + oy);
    g.lineTo(9 + ox, -15 + oy);
    g.lineTo(16 + ox, -11 + oy);
    g.lineTo(8 + ox, 0 + oy);
    g.lineTo(16 + ox, 11 + oy);
    g.lineTo(9 + ox, 15 + oy);
    g.lineTo(1 + ox, 4 + oy);
    g.closePath();
  };
  g.fillStyle = 'rgba(0,0,0,0.35)';
  wedge(2, 3); g.fill();
  wedge(0, 0);
  g.lineJoin = 'round';
  paint(g, C.steelLight, 2.2);
  circle(g, 1.5, 0, 1.8, C.steelDark, 1);
  g.restore();
}

/**
 * Overpass: the bridge carrying the north-south lane over the east-west one, running in direction
 * d (1 south or 3 north), its chevrons at animation step `step`. A narrower belt between raised,
 * hazard-striped walls, with its shadow on the belt below, so the lower lane shows on both sides.
 */
function paintBridge(g, d, step) {
  g.save();
  g.translate(4, 6);
  g.rotate(ROT[d]);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(-18, -13, 38, 26);
  g.restore();
  g.save();
  g.rotate(ROT[d]);
  g.fillStyle = C.belt;
  g.fillRect(-HALF, -7, T, 14);
  g.save();
  g.beginPath(); g.rect(-HALF, -7, T, 14); g.clip();
  g.beginPath();
  const phase = (step * SP) / PHASES;
  for (let k = -1; k <= 3; k++) {
    const px = -HALF + k * SP + phase;
    g.moveTo(px - 3.5, -5); g.lineTo(px + 2, 0); g.lineTo(px - 3.5, 5);
  }
  g.strokeStyle = C.chevron; g.lineWidth = 2.8; g.lineJoin = 'miter'; g.stroke();
  g.restore();
  hazard(g, -HALF, -13, T, 6, 4);
  hazard(g, -HALF, 7, T, 6, 4);
  g.beginPath();
  g.moveTo(-HALF, -13); g.lineTo(HALF, -13); g.moveTo(-HALF, 13); g.lineTo(HALF, 13);
  g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
  g.restore();
}

/**
 * Returns Drop (0.4.01: it has no direction, and shares its junk between every side that takes
 * it): a steel chute coming down from the returns desk, seen from above, in a hazard frame, junk in
 * its mouth and the RETURNS plate across it, with an outlet on each side. `open` has bit d set for
 * each side d where something takes junk (a belt leading away or running past, a machine): that
 * outlet is lit, a yellow arrow pointing out of it; the others are shut steel flaps.
 */
function paintDrop(g, open) {
  shadow(g, 36, 36);
  hazard(g, -18, -18, 36, 36, 5);
  box(g, -14, -14, 28, 28, 3, C.steel, 2);
  for (let d = 0; d < 4; d++) {
    g.save();
    g.rotate(ROT[d]);
    if (open & (1 << d)) {
      box(g, 12.5, -6.5, 5.5, 13, 1.5, '#121417', 1.6);
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(13, -2.6); g.lineTo(16, -2.6); g.lineTo(16, -6.5); g.lineTo(23, 0);
      g.lineTo(16, 6.5); g.lineTo(16, 2.6); g.lineTo(13, 2.6); g.closePath();
      paint(g, '#ffe14a', 1.8);
    } else {
      box(g, 13, -6, 5, 12, 1.2, C.steelDark, 1.4);
      line(g, 15.5, -4, 15.5, 4, '#2a2d31', 1.4);
    }
    g.restore();
  }
  box(g, -9.5, -11, 19, 15, 3, '#121417', 2);
  g.save(); g.translate(0, -4); g.scale(0.82, 0.82); ART[0](g); g.restore();
  box(g, -12, 5, 24, 7, 1.5, INK, 0);
  text(g, 'RETURNS', 0, 8.8, 5.6, '#ffd23f', 900);
}

/** Clearance Bin: a wire bin with leftovers in it and a red CLEARANCE tag. */
function paintBin(g) {
  shadow(g, 34, 32);
  box(g, -16, -16, 32, 31, 4, '#9aa1a9', 2.4);
  box(g, -12.5, -12.5, 25, 24, 2, '#2f3439', 1.5);
  for (const [type, x, y, k] of [[0, -5, -3, 0.85], [1, 4, 1, 0.85], [2, -2, 5, 0.8]]) {
    g.save(); g.translate(x, y); g.scale(k, k); ART[type](g); g.restore();
  }
  g.save();
  g.beginPath(); g.rect(-12.5, -12.5, 25, 24); g.clip();
  g.beginPath();
  for (let k = -30; k <= 30; k += 6) { g.moveTo(k - 15, -15); g.lineTo(k + 15, 15); g.moveTo(k + 15, -15); g.lineTo(k - 15, 15); }
  g.strokeStyle = 'rgba(212,216,220,0.75)'; g.lineWidth = 1; g.stroke();
  g.restore();
  g.save();
  g.rotate(-0.08);
  box(g, -18, 9, 36, 11, 2, C.red, 1.8);
  text(g, 'CLEARANCE', 0, 14.8, 6.6, '#ffffff', 900);
  g.restore();
}

/** Each machine's colours and the supply it makes (its type; see ART). */
const MACHINE = {
  still: { body: C.red, dark: C.redDark, type: 1 },
  cannery: { body: C.green, dark: C.greenDark, type: 2 },
  spooler: { body: C.orange, dark: C.orangeDark, type: 3 },
  bender: { body: '#8b5cf6', dark: '#5b21b6', type: 5 },
};

/**
 * A machine from above, facing d (the concept pictures' design): a steel housing with a top in its
 * own colour, a round window showing what it makes, and the yellow out arrow on its front. `on`: at
 * work, its lamp lit; idle, the lamp is dark.
 */
function paintMachine(g, kind, d, on) {
  const M = MACHINE[kind];
  shadow(g);
  box(g, -17, -17, 34, 34, 5, '#4b5058', 2.5);
  box(g, -14.5, -14.5, 29, 29, 4, M.body, 2);
  // Vent slots and corner bolts.
  g.fillStyle = M.dark;
  for (let k = 0; k < 3; k++) g.fillRect(-9 + k * 7, 11, 4, 2);
  for (const sx of [-11, 11]) for (const sy of [-11, 11]) circle(g, sx, sy, 1.5, C.steelLight, 1);
  circle(g, 0, -1, 9.5, C.paper, 2);
  g.save(); g.translate(0, -1); g.scale(0.92, 0.92); ART[M.type](g); g.restore();
  // The lamp: green while it works.
  circle(g, -11, 11.5, 2.4, on ? '#7CFC00' : '#2b2f34', 1.2);
  outMark(g, d);
}

/**
 * The Rebrander facing d: a big roll of labels on a blue machine with a gold star sticker, its
 * stencil plate (PREMIUM) below the arrows, and the yellow out arrow. `on` lights its lamp.
 */
function paintRebrand(g, d, on) {
  shadow(g);
  box(g, -17, -17, 34, 34, 5, '#4b5058', 2.5);
  box(g, -14.5, -14.5, 29, 29, 4, C.blue, 2);
  g.fillStyle = C.paper;
  g.fillRect(-6, -4, 12, 6);
  box(g, -12, -14, 24, 11, 5, C.paper, 2);
  g.fillStyle = '#d9d4c2';
  g.fillRect(-11, -7, 22, 2.5);
  box(g, -14, -12.5, 4, 8, 1.5, C.steelDark, 1.4);
  box(g, 10, -12.5, 4, 8, 1.5, C.steelDark, 1.4);
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5 - Math.PI / 2, rad = k % 2 ? 1.8 : 4;
    const px = Math.cos(a) * rad, py = -9.5 + Math.sin(a) * rad;
    if (k) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
  paint(g, '#ffc928', 1);
  circle(g, 11, 4, 2.2, on ? '#7CFC00' : '#2b2f34', 1.1);
  outMark(g, d);
  box(g, -16, 8.5, 32, 9, 2, INK, 0);
  text(g, 'PREMIUM', 0, 13.2, 6.6, '#ffd23f', 900);
}

/**
 * A Dumbwaiter's hatch: a steel lift door in a hazard frame with a yellow up arrow. `gauges`: the
 * tile that carries its building's gauges (one per building) has the hatch to the left and room for
 * them on the right; every other tile of a big building has the whole hatch.
 */
function paintLift(g, gauges) {
  const x = gauges ? -19 : -18, w = gauges ? 25 : 36;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x + 3, -14, w, 34);
  hazard(g, x, -18, w, 36, 5);
  box(g, x + 4, -13, w - 8, 26, 2, C.steelDark, 2);
  box(g, x + 6, -11, w - 12, 22, 1.5, C.steel, 1.5);
  const cx = x + w / 2;
  g.beginPath();
  g.moveTo(cx, -9); g.lineTo(cx + 6, -2); g.lineTo(cx + 2.5, -2);
  g.lineTo(cx + 2.5, 8); g.lineTo(cx - 2.5, 8); g.lineTo(cx - 2.5, -2);
  g.lineTo(cx - 6, -2); g.closePath();
  g.lineJoin = 'round';
  paint(g, '#ffe14a', 1.6);
  if (gauges) box(g, 7.5, -18, 12.5, 36, 2.5, '#262b31', 1.6);
}

/**
 * True if the building b has a wire direction but no Razor Wire (0.4.01, the owner): its
 * Dumbwaiter shows a red lamp asking for some, which goes out the moment a unit arrives.
 */
export function wantsWire(b) {
  return !!b && b.wd !== undefined && b.wd !== null && !wireLive(b);
}

/** The lamp's slow pulse, 0 to 1, from the screen's clock in milliseconds (never the game's). */
export const lampPulse = (now) => 0.5 + 0.5 * Math.sin(((now || 0) / 1000) * TAU / 1.2);

/**
 * The red "send Razor Wire" lamp: a round beacon in a black housing, centred on (x, y), its glow
 * growing and fading with `k` (lampPulse). Round and glowing, so it never passes for one of the
 * supply gauges (flat bars) beside it.
 */
function drawWireLamp(ctx, x, y, k) {
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.4 * k;
  ctx.fillStyle = '#ff2d2d';
  ctx.beginPath(); ctx.arc(x, y, 8 + 4 * k, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(x, y, 6.2, 0, TAU);
  ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 4.6, 0, TAU);
  // From a dull red to a hot one: it blinks without ever going dark enough to miss.
  const r = Math.round(150 + 105 * k), g = Math.round(20 + 50 * k);
  ctx.fillStyle = `rgb(${r},${g},${g})`; ctx.fill();
  ctx.beginPath(); ctx.arc(x - 1.5, y - 1.6, 1.4, 0, TAU);
  ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.45 * k})`; ctx.fill();
  ctx.restore();
}

/** One step in each direction (0 east, 1 south, 2 west, 3 north). */
const AHEAD_X = [1, 0, -1, 0], AHEAD_Y = [0, 1, 0, -1];

/** Where the Unpaid Intern holds his item, from the tile's middle, by the way he faces. */
const HAND = [[12, -5], [-1, 4], [-14, -5], [-1, -23]];

/**
 * Unpaid Intern facing d: a small man in a hi-vis vest, arms out toward the tile he hands to, and
 * a white arrow beside him from the belt behind him to the tile in front. (His item is drawn on
 * top, at HAND, so one sprite per facing does for whatever he holds.)
 */
function paintIntern(g, d) {
  if (d === 3 || d === 1) {
    const s = d === 3 ? -1 : 1;
    arrow(g, 14, -s * 11, 14, s * 11);
  } else {
    const s = d === 0 ? 1 : -1;
    arrow(g, -s * 11, 16, s * 11, 16);
  }
  g.save();
  g.translate(-2, 12);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(1, 0, 9, 3, 0, 0, TAU); g.fill();
  limb(g, -2.5, -9, -3.2, -1.5, '#2e3b55');
  shoe(g, -3.2, -0.8, '#2a2a2a');
  limb(g, 2, -9, 2.8, -1.5, '#2e3b55');
  shoe(g, 2.8, -0.8, '#2a2a2a');
  // Hi-vis vest over a grey T-shirt, with reflective stripes.
  g.beginPath(); g.ellipse(0, -14, 7.2, 7.6, 0, 0, TAU);
  paint(g, C.orange, 2);
  g.save();
  g.beginPath(); g.ellipse(0, -14, 6.2, 6.6, 0, 0, TAU); g.clip();
  g.fillStyle = '#f7f3b0';
  g.fillRect(-8, -15.5, 16, 2);
  g.fillRect(-8, -10.5, 16, 2);
  g.fillStyle = '#7b828a';
  g.fillRect(-1, -22, 2.4, 6);
  g.restore();
  circle(g, 1, -25.5, 6.6, C.skin, 2);
  hairCap(g, 1, -25.5, 6.6, '#6b4423');
  face(g, 1, -24.5);
  if (d === 3) {
    limb(g, -4.5, -17, -4, -31, C.orange, 3);
    limb(g, 5, -17, 6, -31, C.orange, 3);
  } else if (d === 1) {
    limb(g, -4, -16, -1, -9, C.orange, 3);
    limb(g, 5, -16, 3, -9, C.orange, 3);
  } else {
    const s = d === 0 ? 1 : -1;
    limb(g, 1, -16, 1 + s * 9, -17, C.orange, 3);
  }
  g.restore();
}

// ---------------------------------------------------------------------------------------------
// The layout, as drawing needs it.

/** The tile next to (x, y) in direction d, or -1 off the map. */
function nb(s, x, y, d) {
  const nx = x + (d === 0 ? 1 : d === 2 ? -1 : 0), ny = y + (d === 1 ? 1 : d === 3 ? -1 : 0);
  return nx < 0 || ny < 0 || nx >= s.w || ny >= s.h ? -1 : ny * s.w + nx;
}

/**
 * The Returns Drop on tile i's open outlets (0.4.01: it shares its junk between every side that
 * takes it): bit d set for each side d where the part there takes junk from it, by the layout (a
 * belt leading away or running past, a machine, a Splitter from behind, a Clearance Bin). A
 * Dumbwaiter or a Rebrander takes from any side but never junk, so its side stays shut.
 */
export function dropOutlets(s, i) {
  const x = i % s.w, y = (i / s.w) | 0;
  let open = 0;
  for (let d = 0; d < 4; d++) {
    const j = nb(s, x, y, d), q = j >= 0 ? s.back[j] : 0;
    if (q && q.k !== 'lift' && q.k !== 'rebrand' && takesFrom(s, j, d)) open |= 1 << d;
  }
  return open;
}

/**
 * Whether something on tile j puts items onto the belt next to it travelling in direction dir: the
 * rules' own feedsInto (back.js), plus an Unpaid Intern, who sets things down on a belt from behind.
 * (Only for where a belt gets an end roller.)
 */
function sendsInto(s, j, dir) {
  if (feedsInto(s, j, dir)) return true;
  const p = j >= 0 ? s.back[j] : 0;
  return !!p && p.k === 'intern' && p.d === dir;
}

/**
 * How far the front item of a lane heading in direction dir into tile j may get this tick, as in
 * back.js (frontCap): into a lane it joins as if from behind, up to GAP behind that lane's last
 * item (one STEP on when that lane is empty); otherwise END, where it waits to be handed over.
 */
function frontCap(s, j, dir) {
  const q = j >= 0 ? s.back[j] : 0;
  let lane = null;
  if (q && q.k === 'conv') {
    const sh = backShape(s, j);
    if (dir === q.d || (sh === 1 && dir === ((q.d + 3) & 3)) || (sh === -1 && dir === ((q.d + 1) & 3))) lane = q.it;
  } else if (q && q.k === 'over' && overpassDirs(s, j)[dir & 1] === dir) lane = dir & 1 ? q.b : q.a;
  if (!lane) return END;
  return lane.length ? SUB + lane[lane.length - 1] - GAP : SUB + STEP;
}

// ---------------------------------------------------------------------------------------------

/**
 * @param {Object} [budget] the renderer's painting budget (spritecache.js): on a new scale the old
 *   sprites are drawn scaled until each is painted again, and jobs() lists them all for painting
 *   ahead of need.
 */
export function createBackArt(budget = createPaintBudget({ ms: Infinity })) {
  let scale = 1;
  /** Item sprites by code, and part sprites by key (kind * 64 + facing * 8 + chevron step). */
  const paintItemSprite = (code) => makeSprite(ITEM, scale, (g) => paintItem(g, code));
  const items = createSpriteCache(budget, paintItemSprite);
  const parts = createSpriteCache(budget, (key) => makeSprite(PART, scale, (g) => PAINT[key >> 6](g, (key >> 3) & 7, key & 7)));
  /** Pay floating up from Clearance Bins: { i, v, t }, oldest first. */
  const floats = [];
  /** The tiles the last draw() drew parts on: x0, y0 to x1, y1 (end exclusive). */
  const bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };

  function setScale(r) {
    if (r === scale) return;
    scale = r;
    items.rescale();
    parts.rescale();
  }

  /** An item's sprite (null for a code that is no item). */
  function itemSprite(code) {
    if (!(code === 1 || (SUPPLY_TYPES.includes((code / 10) | 0) && code % 10 >= 1 && code % 10 <= 4))) return null;
    let sp = items.have(code);
    if (!sp) {
      budget.begin();
      sp = paintItemSprite(code);
      budget.end();
      items.put(code, sp, code);
    }
    return sp;
  }

  /** Every item and part sprite, for the prepaint queue ([cache, key, args]). */
  function jobs() {
    const out = [[items, 1, 1]];
    for (const type of SUPPLY_TYPES) for (let tier = 1; tier <= 4; tier++) out.push([items, type * 10 + tier, type * 10 + tier]);
    const add = (kind, d, step) => { const key = kind * 64 + d * 8 + step; out.push([parts, key, key]); };
    for (let d = 0; d < 4; d++) { add(SPLIT, d, 0); add(INTERN, d, 0); add(REBRAND, d, 0); add(REBRAND, d, 1); }
    for (let open = 0; open < 16; open++) add(DROP, open >> 2, open & 3);
    for (const id of Object.values(MACHINE_ID)) for (let d = 0; d < 4; d++) { add(id, d, 0); add(id, d, 1); }
    for (const d of [1, 3]) for (let st = 0; st < PHASES; st++) add(BRIDGE, d, st);
    add(BIN, 0, 0); add(LIFT, 0, 0); add(LIFT, 0, 1);
    return out;
  }

  const SPLIT = 1, BRIDGE = 2, DROP = 3, BIN = 4, INTERN = 5, REBRAND = 11, LIFT = 12;
  // (A machine's sprite is per kind: 6 to 10. For machines and the Rebrander `step` is 1 at work;
  // for a Dumbwaiter it is 1 on the tile that carries the gauges. A Returns Drop's sprite is one per
  // set of open outlets: bits 2 and 3 of the set in d, bits 0 and 1 in step.)
  const MACHINE_ID = { still: 6, cannery: 7, spooler: 8, bender: 10 };
  const PAINT = {
    [SPLIT]: paintSplitPlate, [BRIDGE]: paintBridge, [DROP]: (g, d, step) => paintDrop(g, d * 4 + step), [BIN]: paintBin, [INTERN]: paintIntern,
    [REBRAND]: (g, d, on) => paintRebrand(g, d, on === 1), [LIFT]: (g, d, on) => paintLift(g, on === 1),
  };
  for (const [k, id] of Object.entries(MACHINE_ID)) PAINT[id] = (g, d, on) => paintMachine(g, k, d, on === 1);
  function part(kind, d = 0, step = 0) {
    const key = kind * 64 + d * 8 + step;
    let sp = parts.have(key);
    if (!sp) {
      budget.begin();
      sp = makeSprite(PART, scale, (g) => PAINT[kind](g, d, step));
      budget.end();
      parts.put(key, sp, key);
    }
    return sp.canvas;
  }
  const stamp = (ctx, img, cx, cy) => ctx.drawImage(img, cx - PART / 2, cy - PART / 2, PART, PART);
  function item(ctx, code, x, y) {
    const sp = itemSprite(code);
    if (sp) ctx.drawImage(sp.canvas, x - ITEM / 2, y - ITEM / 2, ITEM, ITEM);
  }

  /** The session's events: a Clearance Bin paid for a supply floats "+$" up from it. */
  function handle(events, now) {
    if (!events) return;
    for (const e of events) {
      if (e.e !== 'binned' || !(e.v > 0)) continue;
      // Several sales from one bin close together add up into one figure, not a stack of them.
      const last = floats.findLast((f) => f.i === e.i);
      if (last && now - last.t < 350) last.v += e.v;
      else floats.push({ i: e.i, v: e.v, t: now });
    }
    if (floats.length > 40) floats.splice(0, floats.length - 40);
  }

  /**
   * The items of one lane (`it`: code, pos, ... front first) on tile (x, y), heading in direction
   * d, shaped `shape` (0 straight, 1 or -1 a corner fed from its right or left). They are moved on
   * by `alpha` of a tick, as far as they will really get (see frontCap), so they glide smoothly and
   * an item waiting at the end does not creep forward and jump back each tick.
   */
  function laneItems(ctx, s, it, x, y, d, shape, alpha, tile = -1, t = 0) {
    const n = it.length;
    if (!n) return;
    const cx = x * T + HALF, cy = y * T + HALF;
    const adv = STEP * alpha;
    let cap = frontCap(s, nb(s, x, y, d), d);
    for (let k = 0; k < n; k += 2) {
      const p0 = it[k + 1];
      const p = Math.max(p0, Math.min(cap, p0 + adv));
      cap = p - GAP;
      const f = p / SUB;
      let lx, ly;
      if (shape === 0) { lx = (f - 0.5) * T; ly = 0; } else {
        const a = Math.PI + f * Math.PI / 2;
        lx = HALF + HALF * Math.cos(a);
        ly = (HALF + HALF * Math.sin(a)) * shape;
      }
      let wx = lx, wy = ly;
      if (d === 1) { wx = -ly; wy = lx; } else if (d === 2) { wx = -lx; wy = -ly; } else if (d === 3) { wx = ly; wy = -lx; }
      let ix = cx + wx, iy = cy + wy - 1;
      // An item that has just come on from the side (or from an intern's hand) slides in from there.
      if (gliding && tile >= 0) {
        const r = glides.find(tile, it[k], p0, s.tick, STEP);
        if (r) {
          const e = ease(progress(r, t));
          ix = r.x0 + (ix - r.x0) * e;
          iy = r.y0 + (iy - r.y0) * e;
        }
      }
      item(ctx, it[k], ix, iy);
    }
  }

  // --- Glides (0.4, stage 5b; the rules in glide.js) ------------------------------------------
  // Per tile, what was on it when last looked at: belts [tick + 1, n, code, pos, ...] (SNAP numbers
  // a tile), interns [tick + 1, held code, hold time]. 0 for the tick means never seen.
  const MAXI = 6, SNAP = 2 + 2 * MAXI;
  let snap = new Int32Array(0), hands = new Int32Array(0);
  const glides = createGlides(48);
  const fresh = new Int32Array(MAXI + 2);
  /** Interns who handed something over this tick: their tiles (up to 32 a tick on screen). */
  const gave = new Int32Array(32);
  let nGave = 0, gliding = 0, seenTick = -1;
  /** Below this zoom (CSS pixels a tile) a glide would be a pixel or two: none are started. */
  const GLIDE_ZOOM = 14;

  /** Starts a record: from (x0, y0) to (x1, y1), at game tick t0. */
  function startGlide(kind, tile, code, pos, x0, y0, x1, y1, t0) {
    const r = glides.take(t0);
    r.kind = kind; r.tile = tile; r.code = code; r.pos = pos;
    r.x0 = x0; r.y0 = y0; r.x1 = x1; r.y1 = y1;
  }

  /** True if the part on tile j swallows what is handed to it (a Dumbwaiter or a Clearance Bin). */
  const sink = (s, j) => { const q = j >= 0 ? s.back[j] : 0; return !!q && (q.k === 'lift' || q.k === 'bin'); };

  /**
   * Once per tick: compares the visible interns and belts with what they held when last seen, and
   * starts a glide for each item that jumped (see glide.js). Cheap: a few numbers a visible belt.
   */
  function spot(s, vis, F) {
    const back = s.back, W = s.w, n = back.length;
    if (snap.length !== n * SNAP) { snap = new Int32Array(n * SNAP); hands = new Int32Array(n * 3); glides.clear(); }
    const tick = s.tick;
    const on = F.zoom >= GLIDE_ZOOM;
    nGave = 0;
    const { x0, y0, x1, y1 } = vis;
    // Interns first, so a belt can tell an item from a hand from one from the side.
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * W + x0; x < x1; x++, i++) {
        const p = back[i];
        if (!p || p.k !== 'intern') continue;
        const b = i * 3, dt = tick - (hands[b] - 1);
        const held = hands[b + 1], was = hands[b + 2];
        if (on && hands[b] && dt >= 1 && dt <= 6 && held && (!p.h || p.h !== held || p.t > was)) {
          const j = nb(s, x, y, p.d);
          const hx = x * T + HALF + HAND[p.d][0], hy = y * T + HALF + HAND[p.d][1];
          if (sink(s, j)) startGlide(1, j, held, 0, hx, hy, (j % W) * T + HALF, ((j / W) | 0) * T + HALF + 4, tick);
          else if (nGave < gave.length) gave[nGave++] = i;
        }
        hands[b] = tick + 1; hands[b + 1] = p.h | 0; hands[b + 2] = p.t | 0;
      }
    }
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * W + x0; x < x1; x++, i++) {
        const p = back[i];
        if (!p || p.k !== 'conv') continue;
        const it = p.it, b = i * SNAP, dt = tick - (snap[b] - 1);
        if (on && snap[b] && dt >= 1 && dt <= 6 && it.length <= 2 * MAXI) {
          const left = matchLane(snap, b + 2, snap[b + 1], it, dt, STEP, fresh);
          const cx = x * T + HALF, cy = y * T + HALF, d = p.d;
          for (let k = 0; k < it.length >> 1; k++) {
            if (!fresh[k]) continue;
            const code = it[2 * k], pos = it[2 * k + 1];
            // From an intern's hand: one who stands facing this tile and just let go.
            let from = -1;
            for (let g = 0; g < nGave; g++) {
              const q = back[gave[g]];
              if (q && nb(s, gave[g] % W, (gave[g] / W) | 0, q.d) === i) { from = gave[g]; break; }
            }
            if (from >= 0) {
              const q = back[from];
              startGlide(0, i, code, pos, (from % W) * T + HALF + HAND[q.d][0], ((from / W) | 0) * T + HALF + HAND[q.d][1], 0, 0, tick);
              continue;
            }
            // Too far along to have come on from behind: from a side that feeds it.
            if (pos <= STEP * dt + 1) continue;
            const l = (d + 3) & 3, r = (d + 1) & 3;
            const fl = sendsInto(s, nb(s, x, y, l), r), fr = sendsInto(s, nb(s, x, y, r), l);
            if (!fl && !fr) continue;
            const side = fl && fr ? ((pos + code) & 1 ? l : r) : fl ? l : r;
            startGlide(0, i, code, pos, cx + AHEAD_X[side] * HALF, cy + AHEAD_Y[side] * HALF - 1, 0, 0, tick);
          }
          // The front item went on into a Dumbwaiter or a Bin: it drops in.
          if (left > 0 && sink(s, nb(s, x, y, d))) {
            const j = nb(s, x, y, d);
            const ex = cx + AHEAD_X[d] * (END / SUB - 0.5) * T, ey = cy + AHEAD_Y[d] * (END / SUB - 0.5) * T - 1;
            startGlide(1, j, snap[b + 2], 0, ex, ey, (j % W) * T + HALF, ((j / W) | 0) * T + HALF + 4, tick);
          }
        }
        snap[b] = tick + 1;
        const m = Math.min(MAXI, it.length >> 1);
        snap[b + 1] = m;
        for (let k = 0; k < 2 * m; k++) snap[b + 2 + k] = it[k];
      }
    }
  }

  /** Items dropping into a Dumbwaiter or a Bin: moving in, shrinking and fading as they fall. */
  function drawSinks(ctx, t) {
    for (const r of glides.pool) {
      if (!r.on || r.kind !== 1) continue;
      const f = progress(r, t), e = ease(f);
      ctx.globalAlpha = 1 - f * 0.7;
      itemSmall(ctx, r.code, r.x0 + (r.x1 - r.x0) * e, r.y0 + (r.y1 - r.y0) * e, 1 - 0.65 * f);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Every part and item of The Back on the visible tiles `vis` ({x0, y0, x1, y1}, end exclusive),
   * in three passes: belts flat on the floor, the items riding them, then everything standing up
   * (row by row, so an intern's head goes over the part above him). `floats`: draw the Clearance
   * Bins' pay too. Returns how many parts it drew.
   */
  function draw(ctx, s, vis, F, base, belts, now, withFloats = false) {
    const back = s.back;
    if (!back) return 0;
    const W = s.w;
    const { x0, y0, x1, y1 } = vis;
    const phase = (((F.time * SPEED * T) % SP) + SP) % SP;
    const step = Math.min(PHASES - 1, ((phase / SP) * PHASES) | 0);
    let n = 0;
    bounds.x0 = x1; bounds.y0 = y1; bounds.x1 = x0; bounds.y1 = y0;
    // 1. Belts: every belt tile, the belts under a Splitter, and an Overpass's lower lane.
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * W + x0; x < x1; x++, i++) {
        const p = back[i];
        if (!p) continue;
        n++;
        // (The box round everything drawn, for the renderer's faint layer.)
        if (x < bounds.x0) bounds.x0 = x;
        if (x >= bounds.x1) bounds.x1 = x + 1;
        if (y < bounds.y0) bounds.y0 = y;
        if (y >= bounds.y1) bounds.y1 = y + 1;
        if (p.k === 'conv') {
          const d = p.d, sh = backShape(s, i);
          let type = 4;
          if (!sh) type = (sendsInto(s, nb(s, x, y, (d + 2) & 3), d) ? 0 : 1) | (takesFrom(s, nb(s, x, y, d), d) ? 0 : 2);
          drawBeltTile(ctx, x, y, d, sh, type, phase, belts, base);
        } else if (p.k === 'split') {
          // In from behind and straight on, and curving off to each side that something takes from.
          const d = p.d, l = (d + 3) & 3, r = (d + 1) & 3;
          drawBeltTile(ctx, x, y, d, 0, takesFrom(s, nb(s, x, y, d), d) ? 0 : 2, phase, belts, base);
          if (takesFrom(s, nb(s, x, y, l), l)) drawBeltTile(ctx, x, y, l, -1, 4, phase, belts, base);
          if (takesFrom(s, nb(s, x, y, r), r)) drawBeltTile(ctx, x, y, r, 1, 4, phase, belts, base);
        } else if (p.k === 'over') {
          drawBeltTile(ctx, x, y, overpassDirs(s, i)[0], 0, 0, phase, belts, base);
        }
      }
    }
    if (!n) return 0;
    // Items that jumped since the last tick start gliding (once a tick; see glide.js).
    if (s.tick !== seenTick) { seenTick = s.tick; spot(s, vis, F); }
    const t = s.tick + F.alpha;
    glides.expire(t);
    gliding = 0;
    for (const r of glides.pool) if (r.on) { gliding = 1; break; }
    // 2. Items on belts and on the Overpass's lower lane.
    const alpha = F.alpha;
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * W + x0; x < x1; x++, i++) {
        const p = back[i];
        if (!p) continue;
        if (p.k === 'conv') laneItems(ctx, s, p.it, x, y, p.d, backShape(s, i), alpha, i, t);
        else if (p.k === 'over') laneItems(ctx, s, p.a, x, y, overpassDirs(s, i)[0], 0, alpha);
      }
    }
    // 3. What stands up, row by row.
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * W + x0; x < x1; x++, i++) {
        const p = back[i];
        if (!p) continue;
        const cx = x * T + HALF, cy = y * T + HALF;
        switch (p.k) {
          case 'split':
            stamp(ctx, part(SPLIT, p.d), cx, cy);
            // What it holds, on the input side of the plate.
            if (p.h) item(ctx, p.h, cx - AHEAD_X[p.d] * 10, cy - AHEAD_Y[p.d] * 10 - 1);
            break;
          case 'over': {
            const db = overpassDirs(s, i)[1];
            stamp(ctx, part(BRIDGE, db, step), cx, cy);
            laneItems(ctx, s, p.b, x, y, db, 0, alpha);
            break;
          }
          case 'drop': {
            const open = dropOutlets(s, i);
            stamp(ctx, part(DROP, open >> 2, open & 3), cx, cy);
            break;
          }
          case 'bin':
            stamp(ctx, part(BIN), cx, cy);
            break;
          case 'intern':
            stamp(ctx, part(INTERN, p.d), cx, cy);
            if (p.h) item(ctx, p.h, cx + HAND[p.d][0], cy + HAND[p.d][1]);
            break;
          case 'lift':
            drawLift(ctx, s, p, i, cx, cy, F);
            break;
          case 'rebrand':
            drawMaker(ctx, p, REBRAND, cx, cy, F, p.t > 0 && p.q.length ? rebrandTicks(s, itemTier(p.q[0])) : 0);
            break;
          default:
            if (MACHINE_ID[p.k]) drawMaker(ctx, p, MACHINE_ID[p.k], cx, cy, F, makeTicks(s));
        }
      }
    }
    if (gliding) drawSinks(ctx, t);
    if (withFloats && floats.length) drawFloats(ctx, s, now);
    return n;
  }

  /**
   * A machine or a Rebrander (sprite `id`): at work, its lamp is lit, it shudders a little and a
   * ring fills round its window (the Rebrander's sticker) as the job goes on, `total` ticks a job;
   * what it is working on shows in the Rebrander's roll; what it has made and cannot hand on yet
   * waits at its front; junk waiting to go into a machine shows as small pips at its back.
   */
  function drawMaker(ctx, p, id, cx, cy, F, total) {
    const on = p.t > 0;
    const jig = on ? Math.sin(F.time * 47) * 0.6 : 0;
    stamp(ctx, part(id, p.d, on ? 1 : 0), cx + jig, cy);
    const rebrand = id === REBRAND;
    if (on && total > 0) {
      const f = Math.max(0, Math.min(1, 1 - (p.t - F.alpha) / total));
      const ry = rebrand ? cy - 9.5 : cy - 1, r = rebrand ? 6.5 : 11.5;
      ctx.beginPath();
      ctx.arc(cx + jig, ry, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.lineCap = 'round';
      ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 2.2; ctx.strokeStyle = '#7CFC00'; ctx.stroke();
      ctx.lineCap = 'butt';
    }
    if (rebrand && on && p.q.length) itemSmall(ctx, p.q[0], cx + jig, cy - 1, 0.7);
    if (p.out) item(ctx, p.out, cx + AHEAD_X[p.d] * 13, cy + AHEAD_Y[p.d] * 13 - 1);
    const waiting = rebrand ? p.q.length - (on ? 1 : 0) : p.n;
    for (let k = 0; k < waiting; k++) {
      // Along the back edge, across the line of travel.
      const bx = cx - AHEAD_X[p.d] * 18.5 + AHEAD_Y[p.d] * (k * 6 - 3), by = cy - AHEAD_Y[p.d] * 18.5 - AHEAD_X[p.d] * (k * 6 - 3);
      ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = rebrand ? '#ffc928' : C.cardboard; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke();
    }
  }

  /** An item sprite drawn smaller, centred on (x, y). */
  function itemSmall(ctx, code, x, y, k) {
    const sp = itemSprite(code);
    if (sp) ctx.drawImage(sp.canvas, x - (ITEM * k) / 2, y - (ITEM * k) / 2, ITEM * k, ITEM * k);
  }

  /**
   * A Dumbwaiter, and on its building's anchor tile the gauges: one bar for each supply the
   * building above takes, in that supply's colour, filled to the units it holds out of
   * the most it holds in this game, stockCap (red Spite, green Cola, orange Cord, purple Wire).
   * A building with a wire direction and no Razor Wire gets a blinking red lamp on its hatch
   * (wantsWire), or zoomed out on its mark.
   */
  function drawLift(ctx, s, p, i, cx, cy, F) {
    const b = s.grid[p.a];
    const anchor = i === p.a && !!b && b.part === undefined;
    // Zoomed out, the gauges would be a few pixels: one status mark instead, on a whole hatch.
    const marks = useMarks(F.zoom);
    const gauges = anchor && !marks;
    stamp(ctx, part(LIFT, 0, gauges ? 1 : 0), cx, cy);
    // (0.4.01, the owner) A building with a wire direction and no Razor Wire is asking for some.
    const asking = anchor && wantsWire(b);
    if (anchor && marks) {
      const r = markRadius(F.zoom);
      if (asking) drawMarkLamp(ctx, cx, cy, r, lampPulse(F.now));
      drawMark(ctx, stockMark(b), cx, cy, r);
      return;
    }
    if (!gauges) return;
    if (asking) drawWireLamp(ctx, cx - 6.5, cy - 13, lampPulse(F.now));
    const tracks = stockTracks(b.k), n = tracks.length;
    if (!n) return;
    const x0 = cx + 9.2, w = 9.2, bw = (w - (n - 1) * 0.5) / n, top = cy - 16, h = 32;
    for (let k = 0; k < n; k++) {
      const bx = x0 + k * (bw + 0.5);
      ctx.fillStyle = '#0d1014';
      ctx.fillRect(bx, top, bw, h);
      const f = Math.min(1, unitsIn(b, tracks[k], s) / stockCap(s));
      if (f > 0) {
        ctx.fillStyle = SUPPLIES[tracks[k]].color;
        ctx.fillRect(bx, top + h * (1 - f), bw, h * f);
      }
    }
  }

  /** "+$0.25" rising from a Clearance Bin and fading, for a moment after it is paid. */
  function drawFloats(ctx, s, now) {
    let gone = 0;
    for (const f of floats) {
      const k = (now - f.t) / FLOAT_MS;
      if (k >= 1) { gone++; continue; }
      const x = (f.i % s.w) * T + HALF + 14, y = ((f.i / s.w) | 0) * T + 2 - 22 * k;
      ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      label(ctx, `+$${f.v < 1 ? f.v.toFixed(2) : String(Math.round(f.v * 100) / 100)}`, x, y, 12, '#7CFC00');
    }
    ctx.globalAlpha = 1;
    // They finish in the order they started.
    if (gone) floats.splice(0, gone);
  }

  /**
   * Part k as the placement preview shows it on tile (x, y), facing d: the belt straight with open
   * ends (so it reads as a piece of a line), a Splitter with all three ways, an Overpass, and so on.
   */
  function drawGhost(ctx, s, k, x, y, d, F, base, belts) {
    const cx = x * T + HALF, cy = y * T + HALF;
    switch (k) {
      case 'conv':
        drawBeltTile(ctx, x, y, d, 0, 0, 0, belts, base);
        break;
      case 'split':
        drawBeltTile(ctx, x, y, d, 0, 0, 0, belts, base);
        drawBeltTile(ctx, x, y, (d + 3) & 3, -1, 4, 0, belts, base);
        drawBeltTile(ctx, x, y, (d + 1) & 3, 1, 4, 0, belts, base);
        stamp(ctx, part(SPLIT, d), cx, cy);
        break;
      case 'over':
        drawBeltTile(ctx, x, y, 0, 0, 0, 0, belts, base);
        stamp(ctx, part(BRIDGE, 1, 0), cx, cy);
        break;
      case 'intern':
        stamp(ctx, part(INTERN, d), cx, cy);
        break;
      case 'bin':
        stamp(ctx, part(BIN), cx, cy);
        break;
      case 'rebrand':
        stamp(ctx, part(REBRAND, d, 0), cx, cy);
        break;
      default:
        if (MACHINE_ID[k]) stamp(ctx, part(MACHINE_ID[k], d, 0), cx, cy);
    }
  }

  const idle = () => { items.idle(); parts.idle(); };
  /** For test pages: how many glides are under way onto belts (0) and into Dumbwaiters or Bins (1). */
  function gliders() {
    let a = 0, b = 0;
    for (const r of glides.pool) if (r.on) { if (r.kind) b++; else a++; }
    return [a, b];
  }
  return { setScale, handle, draw, drawGhost, jobs, idle, gliders, bounds };
}
