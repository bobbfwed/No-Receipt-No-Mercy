// Everything players build on the shop floor: Crate Stacks and security, drawn upright
// (three-quarter view, like the mock-up). Also the belt sprites, which The Back's belts use
// (src/render/back.js; the shop floor has had no belts since 0.4).
// Buildings bigger than a tile (the Barcode Laser, the TV Salesman) are drawn once, from their anchor
// tile, across their whole footprint. On top of any building: the damage a gym bro has done this
// wave, and, for security a stray dog has peed on, a puddle, drips and flies while it is off.
import { DIRS, TICK_HZ, BUILD, sizeOf, statsOf } from '../sim/index.js';
import {
  TILE, INK, C, rr, paint, box, circle, line, text, label, hazard, hash2, burstPath,
} from './paint.js';
import { drawItem } from './items.js';

const T = TILE;
const HALF = T / 2;
const ROT = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
/** Chevron spacing on belts; divides the tile so the pattern lines up across neighbouring belts. */
export const SP = T / 3;
/** Chevron animation steps per chevron spacing; belts are pre-rendered for each step. */
const PHASES = 8;
const COS = [1, 0, -1, 0], SIN = [0, 1, 0, -1];

/**
 * Pre-rendered belt tiles, one per look (straight with or without end rollers, or corner) and
 * chevron phase, drawn in the belt's own frame (output to the right). Call setScale() on resize.
 */
export function createBeltSprites() {
  const map = new Map();
  let scale = 1;
  return {
    setScale(s) { if (s !== scale) { scale = s; map.clear(); } },
    /** type: 0-3 straight (bit 1 = roller at the back, bit 2 = roller at the front), 4 corner. */
    get(type, step) {
      const key = type * PHASES + step;
      let c = map.get(key);
      if (c) return c;
      c = document.createElement('canvas');
      c.width = c.height = Math.max(1, Math.ceil(T * scale));
      const g = c.getContext('2d');
      const k = c.width / T;
      g.setTransform(k, 0, 0, k, HALF * k, HALF * k);
      const phase = (step * SP) / PHASES;
      // Zoomed out (under about 28 screen pixels a tile), fatter chevrons, or they blur into a
      // stripe and the direction is lost.
      const bold = scale < 0.7;
      if (type === 4) cornerBelt(g, phase, bold);
      else straightBelt(g, phase, !(type & 1), !(type & 2), bold);
      map.set(key, c);
      return c;
    },
  };
}

/**
 * Draws one belt tile of a look already worked out: `type` as createBeltSprites' get (0-3 straight
 * with end rollers, 4 a corner; a corner shape always draws the corner). The Back's belts (0.4,
 * src/render/back.js) work out their own ends and use this, so both floors' belts look the same.
 */
export function drawBeltTile(ctx, x, y, d, shape, type, phase, sprites, base) {
  if (shape !== 0) type = 4;
  const step = Math.min(PHASES - 1, ((phase / SP) * PHASES) | 0);
  const img = sprites.get(type, step);
  const k = base.s, m = shape === -1 ? -1 : 1;
  const cx = x * T + HALF, cy = y * T + HALF;
  ctx.setTransform(k * COS[d], k * SIN[d], -k * SIN[d] * m, k * COS[d] * m, k * cx + base.ox, k * cy + base.oy);
  ctx.drawImage(img, -HALF, -HALF, T, T);
  ctx.setTransform(k, 0, 0, k, base.ox, base.oy);
}

function straightBelt(ctx, phase, backOpen, frontOpen, bold) {
  ctx.fillStyle = C.belt;
  ctx.fillRect(-HALF, -13, T, 26);
  // Moving chevrons, clipped to the belt surface.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-HALF, -13, T, 26);
  ctx.clip();
  ctx.beginPath();
  const a = bold ? 7 : 5, b = bold ? 10 : 8;
  for (let k = -1; k <= 3; k++) {
    const px = -HALF + k * SP + phase;
    ctx.moveTo(px - a, -b);
    ctx.lineTo(px + 2, 0);
    ctx.lineTo(px - a, b);
  }
  ctx.strokeStyle = bold ? '#ffd23f' : C.chevron;
  ctx.lineWidth = bold ? 5 : 3.5;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.stroke();
  ctx.restore();
  // Side rails with bolts.
  ctx.fillStyle = C.steel;
  ctx.fillRect(-HALF, -18, T, 5);
  ctx.fillRect(-HALF, 13, T, 5);
  ctx.fillStyle = C.steelDark;
  for (let bx = -15; bx < HALF; bx += 10) { ctx.fillRect(bx, -16.5, 2, 2); ctx.fillRect(bx, 14.5, 2, 2); }
  ctx.beginPath();
  ctx.moveTo(-HALF, -18); ctx.lineTo(HALF, -18);
  ctx.moveTo(-HALF, 18); ctx.lineTo(HALF, 18);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-HALF, -13); ctx.lineTo(HALF, -13);
  ctx.moveTo(-HALF, 13); ctx.lineTo(HALF, 13);
  ctx.lineWidth = 1;
  ctx.stroke();
  // End rollers where the belt is not joined to anything.
  if (!backOpen) endRoller(ctx, -HALF + 1);
  if (!frontOpen) endRoller(ctx, HALF - 5);
}

function endRoller(ctx, x) {
  rr(ctx, x, -18, 4, 36, 2);
  paint(ctx, C.steelDark, 2);
}

/** A quarter-circle belt from the bottom edge (local +y) to the right edge (local +x). */
function cornerBelt(ctx, phase, bold) {
  const cx = HALF, cy = HALF, A0 = Math.PI, A1 = Math.PI * 1.5;
  // Outer rail, belt surface, inner rail.
  ctx.beginPath();
  ctx.arc(cx, cy, 38, A0, A1);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  paint(ctx, C.steel, 0);
  ctx.beginPath();
  ctx.arc(cx, cy, 33, A0, A1);
  ctx.arc(cx, cy, 7, A1, A0, true);
  ctx.closePath();
  ctx.fillStyle = C.belt;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Chevrons spaced along the centre line (radius 20), pointing along the curve.
  const step = SP / 20; // radians between chevrons on the centre line
  const frac = phase / SP;
  ctx.beginPath();
  for (let k = -1; k <= 3; k++) {
    const a = A0 + (k + frac) * step;
    const px = cx + 20 * Math.cos(a), py = cy + 20 * Math.sin(a);
    const tx = -Math.sin(a), ty = Math.cos(a); // direction of travel
    const nx = -ty, ny = tx; // across the belt
    const al = bold ? 7 : 5, ac = bold ? 10 : 8;
    ctx.moveTo(px - tx * al - nx * ac, py - ty * al - ny * ac);
    ctx.lineTo(px + tx * 2, py + ty * 2);
    ctx.lineTo(px - tx * al + nx * ac, py - ty * al + ny * ac);
  }
  ctx.strokeStyle = bold ? '#ffd23f' : C.chevron;
  ctx.lineWidth = bold ? 5 : 3.5;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, 38, A0, A1);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 33, A0, A1);
  ctx.moveTo(cx - 7, cy);
  ctx.arc(cx, cy, 7, A0, A1);
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------------
// Crate Stacks and security
//
// Each kind has a `look` function that reduces a building and the current time to a small
// integer (its visual state: facing, animation step, what is inside...) and fills in the shared
// pose P, and a `paint` function that draws from P alone. The drawing for each (kind, look) is
// cached as a sprite, so a big store costs one drawImage per building.

const TAU = Math.PI * 2;
/** Sprite box for one building, in logical pixels: a tile plus room for flags and tops. */
const BOX = 56;
/** Pose shared by look() and paint(), filled in fresh for every building. */
const P = { d: 0, step: 0, spray: false, off: 0, r: 0 };
/** The usual sprite box: [width, height, centre x, centre y] in logical pixels. */
const BOX_1 = [BOX, BOX, BOX / 2, BOX / 2];
/** Barcode laser sprite boxes, lying along x (facing east or west) or along y. */
const RAIL_X = [136, 64, 68, 34], RAIL_Y = [64, 136, 32, 70];
const SALES_BOX = [104, 116, 52, 62];
/** Barcode laser charge shown in this many steps (0 empty .. RAIL_STEPS ready). */
const RAIL_STEPS = 6;

// ---------------------------------------------------------------------------------------------
// The out arrow
//
// A big yellow arrow on the side a part puts things out of, drawn over the placement preview of
// anything in The Back that has a facing, so which way it will send things is plain before it is
// built. (Until 0.4 the shop floor's factory buildings wore it too, with white "in" marks.)

/** The yellow "out" arrow along +x: a short stub and a big head whose tip just passes the tile edge. */
function outArrowPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(4, -4.5);
  ctx.lineTo(10.5, -4.5);
  ctx.lineTo(10.5, -11);
  ctx.lineTo(22, 0);
  ctx.lineTo(10.5, 11);
  ctx.lineTo(10.5, 4.5);
  ctx.lineTo(4, 4.5);
  ctx.closePath();
}

/** The out arrow centred on the tile, pointing in direction d (sprite painter). */
function paintOutArrow(ctx, d) {
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.rotate(ROT[d]);
  // A dark copy underneath, a little down and to the side, so it stands off any part's colour.
  ctx.save();
  ctx.rotate(-ROT[d]);
  ctx.translate(1.5, 2.2);
  ctx.rotate(ROT[d]);
  outArrowPath(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fill();
  ctx.restore();
  outArrowPath(ctx);
  paint(ctx, '#ffe14a', 2.6);
  // A white glint along one edge of the head.
  ctx.beginPath();
  ctx.moveTo(12.5, -7.5); ctx.lineTo(18, -2.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/** Draws the out arrow on tile i (F.w is the map width), pointing in direction d. */
export function drawOutArrow(ctx, d, i, F, sprites) {
  P.step = d & 3;
  const img = sprites.get('arrow', P.step, F.sprites, 0);
  const cx = (i % F.w) * T + HALF, cy = ((i / F.w) | 0) * T + HALF;
  ctx.drawImage(img, cx - BOX / 2, cy - BOX / 2, BOX, BOX);
}

/** A soft drop shadow under an upright building. */
function shadow(ctx, w = 34, h = 30) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  rr(ctx, -w / 2 + 3, -h / 2 + 6, w, h, 6);
  ctx.fill();
}

/** The eightyproof card's Free Sample table: the same shape as the plain one, as a cheap bar. */
function boozeTable(ctx) {
  shadow(ctx, 32, 24);
  line(ctx, 12, -4, 12, -26, INK, 2);
  const wv = Math.sin((P.step / 6) * TAU) * 2;
  ctx.beginPath();
  ctx.moveTo(12, -26); ctx.quadraticCurveTo(17, -25 + wv, 22, -21 + wv * 0.5); ctx.lineTo(12, -17);
  ctx.closePath();
  paint(ctx, '#f0a830', 1.6);
  box(ctx, -16, -9, 32, 9, 2, '#6b4423', 2.2);
  box(ctx, -16, -1, 32, 14, 2, '#1c1d22', 2.2);
  text(ctx, 'SHOTS', 0, 6.5, 8.5, '#ffd23f', 900);
  // A bottle at the back, then a tray of shot glasses with amber in them.
  box(ctx, -15, -24, 6, 15, 2, '#2f7d4f', 1.6);
  box(ctx, -13.5, -29, 3, 6, 1, '#2f7d4f', 1.3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-14.5, -19, 5, 4);
  ctx.beginPath();
  ctx.ellipse(1, -6, 11, 4, 0, 0, TAU);
  paint(ctx, '#cfd6dc', 1.6);
  for (let k = 0; k < 4; k++) {
    const sx = -6 + k * 4.4, sy = -8 + (k % 2);
    box(ctx, sx - 1.8, sy - 3.4, 3.6, 4.4, 0.6, '#e8f4ff', 1);
    ctx.fillStyle = '#e0952a';
    ctx.fillRect(sx - 1.2, sy - 1.6, 2.4, 2.2);
  }
}

const KINDS = {
  crate: {
    // (0.4) Its reinforcement level, 0 to 8, decides the look: see armour().
    look(b) { P.r = Math.max(0, Math.min(8, (b && b.r) | 0)); return P.r; },
    paint(ctx) {
      shadow(ctx, 34, 30);
      const r = P.r | 0;
      crate(ctx, -17, -4, 34, 20, r);
      crate(ctx, -12, -19, 22, 16, r);
    },
  },

  sprinkler: {
    look(b, F, i) {
      // The nozzle cross spins fast while spraying, slowly otherwise; it looks the same every
      // quarter turn, so 8 steps per quarter turn are enough.
      P.spray = F.now - F.fx.sprayAt[i] < 400;
      const a = F.time * (P.spray ? 18 : 1.2);
      P.step = ((((a / (Math.PI / 2)) % 1) * 8) | 0);
      return (P.spray ? 8 : 0) + P.step;
    },
    paint(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.arc(3, 5, 15, 0, TAU); ctx.fill();
      circle(ctx, 0, 0, 15, C.steel, 2.5);
      circle(ctx, 0, 0, 11, '#7d848b', 1.5);
      circle(ctx, 0, -2, 8.5, C.red, 2.5);
      ctx.save();
      ctx.translate(0, -2);
      ctx.rotate((P.step / 8) * (Math.PI / 2));
      ctx.beginPath();
      ctx.moveTo(-11, 0); ctx.lineTo(11, 0);
      ctx.moveTo(0, -11); ctx.lineTo(0, 11);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.fillStyle = P.spray ? C.orange : '#444';
      ctx.fillRect(9, -2, 4, 4); ctx.fillRect(-13, -2, 4, 4); ctx.fillRect(-2, 9, 4, 4); ctx.fillRect(-2, -13, 4, 4);
      ctx.restore();
      circle(ctx, 0, -2, 3.5, '#ffd3cc', 1.5);
    },
  },

  // The forklift is two sprites: the turntable (look 0) and the truck (look 1 with a box on the
  // forks, 2 without), which is drawn rotated to its aim. See drawBuilding().
  forklift: {
    look() { return 0; },
    paint(ctx, S) {
      if (P.step === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath(); ctx.arc(3, 5, 17, 0, TAU); ctx.fill();
        circle(ctx, 0, 0, 17, '#4b5058', 2.5);
        ctx.setLineDash(DASH_RING);
        ctx.beginPath(); ctx.arc(0, 0, 13.5, 0, TAU);
        ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.stroke();
        ctx.setLineDash(NO_DASH);
        return;
      }
      ctx.translate(-4, 0);
      // Tyres, forks (with a box on them, the ammunition, reloaded after each shot), mast.
      box(ctx, -12, -14, 8, 5, 1.5, '#23272b', 1.2);
      box(ctx, -12, 9, 8, 5, 1.5, '#23272b', 1.2);
      box(ctx, 3, -14, 8, 5, 1.5, '#23272b', 1.2);
      box(ctx, 3, 9, 8, 5, 1.5, '#23272b', 1.2);
      box(ctx, 13, -7.5, 13, 3.5, 1, '#9aa0a6', 1.3);
      box(ctx, 13, 4, 13, 3.5, 1, '#9aa0a6', 1.3);
      if (P.step === 1) drawItem(ctx, S, 'box', 21, 0, 17);
      box(ctx, 10, -10.5, 4.5, 21, 1, '#5b6168', 1.8);
      // Yellow body with a black counterweight at the back.
      box(ctx, -15, -11, 27, 22, 5, C.yellow, 2.5);
      rr(ctx, -17, -9, 7, 18, 3);
      paint(ctx, '#2b2f34', 2);
      // Seat and steering wheel under an open overhead guard, and a warning beacon.
      box(ctx, -7, -5, 7, 10, 2, '#2b2f34', 1.5);
      circle(ctx, 4, 0, 3, '#2b2f34', 1.2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.strokeRect(-9, -8.5, 16, 17);
      ctx.beginPath();
      ctx.moveTo(-9, 0); ctx.lineTo(7, 0);
      ctx.stroke();
      circle(ctx, -12, -7, 2.2, '#ff8c1a', 1.2);
    },
  },

  wetfloor: {
    look(b, F, i) {
      P.step = (((((F.time * 1.5 + i) / TAU) % 1) * 8) | 0); // shimmer across the puddle
      return P.step;
    },
    paint(ctx) {
      ctx.beginPath();
      ctx.ellipse(-1, 6, 18, 11, 0, 0, TAU);
      ctx.fillStyle = 'rgba(47,143,224,0.78)';
      ctx.fill();
      ctx.strokeStyle = C.blueDark;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      const sh = Math.sin((P.step / 8) * TAU) * 5;
      ctx.beginPath();
      ctx.ellipse(-6 + sh, 3, 6, 2, -0.2, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
      // A-frame sign: its shadow, the back leg, then the front panel with a '!'.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(6, 7, 9, 3, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(1, 7); ctx.lineTo(5, -14); ctx.lineTo(9, -14); ctx.lineTo(14, 5);
      ctx.closePath();
      paint(ctx, C.yellowDark, 2);
      ctx.beginPath();
      ctx.moveTo(-3, 8); ctx.lineTo(3, -15); ctx.lineTo(8, -15); ctx.lineTo(13, 8);
      ctx.closePath();
      paint(ctx, C.yellow, 2.2);
      ctx.beginPath();
      ctx.moveTo(5.5, -9); ctx.lineTo(5.5, 0);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(5.5, 3.8, 1.6, 0, TAU); ctx.fill();
    },
  },

  // A table that hands out booze (b.bz, the eightyproof card, 0.3.01) is a bar: a black skirt saying
  // SHOTS, an amber flag, a bottle on the table and shot glasses on the tray.
  samples: {
    look(b, F) {
      P.step = ((((F.time * 4) / TAU) % 1) * 6) | 0; // flag waving
      P.booze = b.bz ? 1 : 0;
      return P.step + P.booze * 6;
    },
    paint(ctx) {
      if (P.booze) { boozeTable(ctx); return; }
      shadow(ctx, 32, 24);
      // Flag on a pole behind the table.
      line(ctx, 12, -4, 12, -26, INK, 2);
      const wv = Math.sin((P.step / 6) * TAU) * 2;
      ctx.beginPath();
      ctx.moveTo(12, -26); ctx.quadraticCurveTo(17, -25 + wv, 22, -21 + wv * 0.5); ctx.lineTo(12, -17);
      ctx.closePath();
      paint(ctx, '#ff5fa8', 1.6);
      // Table: top, then a red skirt saying FREE.
      box(ctx, -16, -9, 32, 9, 2, '#ffffff', 2.2);
      box(ctx, -16, -1, 32, 14, 2, C.red, 2.2);
      text(ctx, 'FREE', 0, 6.5, 9, '#ffffff', 900);
      // Tray with little samples on cocktail sticks.
      ctx.beginPath();
      ctx.ellipse(-2, -6, 11, 4, 0, 0, TAU);
      paint(ctx, '#cfd6dc', 1.6);
      for (let k = 0; k < 4; k++) {
        const sx = -8 + k * 4, sy = -8 + (k % 2);
        ctx.fillStyle = SAMPLE_COLOURS[k];
        ctx.fillRect(sx - 1.6, sy - 1.6, 3.2, 3.2);
        ctx.fillStyle = INK;
        ctx.fillRect(sx - 0.4, sy - 5, 0.8, 3.5);
      }
    },
  },

  // The Barcode Laser (key `railgun`): a supermarket barcode scanner the size of a canoe, turned up
  // far too high, on a steel skid, its red window at the end it faces. The barcode on its label
  // turns red bar by bar as it charges (cd counts down to 0); charged, the window glows (the pulse
  // is drawn live). Facing east or west it is seen from the side; facing south you look into its
  // window, facing north at its back end and cable.
  railgun: {
    box() { return P.d & 1 ? RAIL_Y : RAIL_X; },
    look(b, F) {
      P.d = b.d | 0;
      // (With the game, so its cards count: the premature card makes security fire faster.)
      const full = Math.max(1, Math.round(statsOf(b, F.game).cd * TICK_HZ));
      const left = Math.max(0, b.cd || 0);
      P.step = left <= 0 ? RAIL_STEPS : Math.min(RAIL_STEPS - 1, ((1 - left / full) * RAIL_STEPS) | 0);
      return P.d * (RAIL_STEPS + 1) + P.step;
    },
    paint(ctx) {
      // The shadow, cast the same way whichever way it faces.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      if (P.d & 1) rr(ctx, -15, -56, 34, 118, 8); else rr(ctx, -55, -8, 116, 28, 8);
      ctx.fill();
      if (P.d & 1) { scannerV(ctx, P.step, P.d === 1 ? 1 : -1); return; }
      ctx.save();
      // Drawn facing east; mirrored for west.
      if (P.d === 2) ctx.scale(-1, 1);
      scannerH(ctx, P.step);
      ctx.restore();
    },
  },

  // A 2 x 2 stand: a red carpet, a big television on a pole showing knives and a barbecue, a man
  // in a mustard check suit with a headset, chopping the air with a carving knife, and a counter
  // with a smoking grill on it. Switched off (peed on), the television is dark.
  salesman: {
    box() { return SALES_BOX; },
    look(b, F) {
      P.step = b.off > 0 ? 0 : ((F.time * 4) | 0) & 7;
      return P.step;
    },
    paint(ctx) { salesStand(ctx, P.step, !!P.off); },
  },

  // Not a building: the out arrow, cached the same way (look = its direction, set by drawOutArrow).
  arrow: {
    look() { return P.step; },
    paint(ctx) { paintOutArrow(ctx, P.step); },
  },

};

/** Scanner colours: the charcoal plastic housing, its lighter top, the red of the laser. */
const SCAN = '#2f343a', SCAN_TOP = '#4a5159', SCAN_EDGE = '#5d6670', LASER = '#ff2d2d', LASER_DIM = '#6e1c1c';
/** Bar widths of the barcode on the scanner's label (it doubles as the charge meter). */
const BARS = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2];
const BARS_LEN = BARS.reduce((a, b) => a + b, 0) + BARS.length - 1;

/**
 * The scanner's label, lying along +x from x0, `len` long and `h` tall: a white sticker with a
 * barcode whose bars turn red one by one from the scanner's back end as it charges.
 * `fromEnd`: the back end is at the far end of the label (+x) instead.
 */
function barcodeLabel(ctx, x0, y0, len, h, step, fromEnd) {
  box(ctx, x0, y0, len, h, 1.5, '#f4f1e6', 1.6);
  const k = (len - 6) / BARS_LEN;
  const lit = step >= RAIL_STEPS ? BARS.length : Math.round((step / RAIL_STEPS) * BARS.length);
  let x = x0 + 3;
  for (let n = 0; n < BARS.length; n++) {
    const order = fromEnd ? BARS.length - 1 - n : n;
    ctx.fillStyle = order < lit ? LASER : INK;
    ctx.fillRect(x, y0 + 2, BARS[n] * k, h - 4);
    x += (BARS[n] + 1) * k;
  }
}

/** A coiled phone-style cable from (x1, y1) to (x2, y2), in loops. */
function coilCable(ctx, x1, y1, x2, y2, loops) {
  ctx.beginPath();
  for (let n = 0; n <= loops * 8; n++) {
    const t = n / (loops * 8), a = t * loops * TAU;
    const x = x1 + (x2 - x1) * t + Math.cos(a) * 2.6, y = y1 + (y2 - y1) * t + Math.sin(a) * 2.6;
    if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.stroke();
  ctx.strokeStyle = '#4b5058'; ctx.lineWidth = 1.6; ctx.stroke();
}

/** A little yellow laser-warning triangle sticker centred on (x, y). */
function laserSticker(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 1.05, y + r * 0.75); ctx.lineTo(x - r * 1.05, y + r * 0.75);
  ctx.closePath();
  ctx.lineJoin = 'round';
  paint(ctx, '#ffd23f', 1.3);
  // The laser symbol: a dot with rays.
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(x, y + r * 0.2, r * 0.18, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45, y + r * 0.2); ctx.lineTo(x + r * 0.45, y + r * 0.2);
  ctx.moveTo(x, y - r * 0.25); ctx.lineTo(x, y + r * 0.6);
  ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.stroke();
}

/** The steel skid it sits on, along +x: x -58..58, with hazard stripes at both ends. */
function scanSkid(ctx) {
  box(ctx, -58, 2, 116, 13, 3, '#3b4148', 2.4);
  hazard(ctx, -54, 6, 13, 5, 4);
  hazard(ctx, 41, 6, 13, 5, 4);
}

/**
 * The Barcode Laser from the side, facing +x, centred on (0, 0): x -60..60, y -20..20 is its
 * footprint. A long charcoal housing flaring into a big head with a red window at the front, on two
 * cradles on the skid, a coiled cable from its back end, the barcode charge label on its side.
 */
function scannerH(ctx, step) {
  const ready = step >= RAIL_STEPS;
  scanSkid(ctx);
  coilCable(ctx, -50, -8, -56, 8, 5);
  // Cradles.
  box(ctx, -32, -6, 8, 11, 1.5, '#5b6168', 1.6);
  box(ctx, 18, -6, 8, 11, 1.5, '#5b6168', 1.6);
  // Housing: a rounded back end, a straight body, a head that flares up and down.
  ctx.beginPath();
  ctx.moveTo(-46, -22);
  ctx.lineTo(22, -22);
  ctx.quadraticCurveTo(30, -22, 34, -31);
  ctx.lineTo(55, -31);
  ctx.quadraticCurveTo(58, -31, 58, -27);
  ctx.lineTo(58, 0);
  ctx.quadraticCurveTo(58, 4, 54, 4);
  ctx.lineTo(36, 4);
  ctx.quadraticCurveTo(30, 4, 26, -4);
  ctx.lineTo(-46, -4);
  ctx.quadraticCurveTo(-54, -4, -54, -13);
  ctx.quadraticCurveTo(-54, -22, -46, -22);
  ctx.closePath();
  ctx.lineJoin = 'round';
  paint(ctx, SCAN, 2.6);
  // Light catching its top edge.
  ctx.fillStyle = SCAN_EDGE;
  ctx.fillRect(-46, -20.5, 66, 2.6);
  ctx.beginPath();
  ctx.moveTo(35, -29); ctx.lineTo(54, -29);
  ctx.strokeStyle = SCAN_EDGE; ctx.lineWidth = 2.4; ctx.stroke();
  // A rubber grip band, then the label.
  ctx.fillStyle = '#1f2327';
  ctx.fillRect(-49, -19, 5, 13);
  barcodeLabel(ctx, -40, -18.5, 52, 11.5, step, false);
  // The head: a warning sticker, a status LED, and the window down its front.
  laserSticker(ctx, 44, -14, 6.5);
  circle(ctx, 30, -10, 2, ready ? '#4ade80' : '#3a5a40', 1.1);
  box(ctx, 55, -28, 5, 29, 2, ready ? LASER : LASER_DIM, 1.8);
  if (ready) { ctx.fillStyle = '#ffd0d0'; ctx.fillRect(56.3, -25, 1.6, 22); }
  // A trigger under the head, as on the real thing.
  ctx.beginPath();
  ctx.moveTo(24, -3); ctx.quadraticCurveTo(25, 4, 20, 5);
  ctx.strokeStyle = INK; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = C.yellow; ctx.lineWidth = 1.6; ctx.stroke();
}

/**
 * The Barcode Laser lying along y, centred on (0, 0): x -20..20, y -60..60 is its footprint. Seen
 * from above and in front: the top of the housing (narrow back end, wide head), the label along
 * it, and the end nearest the viewer. head 1: the head is at the bottom (facing south), so its red
 * window faces the viewer; head -1: the head is at the top (facing north), and the back end with its
 * cable socket is nearest.
 */
function scannerV(ctx, step, head) {
  const ready = step >= RAIL_STEPS;
  const H = 9; // how far the top of the housing stands above the floor, in the drawing
  // The skid, seen from above.
  box(ctx, -16, -56, 32, 114, 3, '#3b4148', 2.4);
  hazard(ctx, -12, head > 0 ? 47 : -52, 24, 6, 4);
  hazard(ctx, -12, head > 0 ? -52 : 47, 24, 6, 4);
  // The top of the housing: u runs from the back end (-54) to the head (+57); y = head * u - H.
  const Y = (u) => head * u - H;
  const outline = [[-54, 6], [-50, 9], [22, 9], [34, 15], [57, 15]];
  ctx.beginPath();
  outline.forEach(([u, hw], n) => (n ? ctx.lineTo(hw, Y(u)) : ctx.moveTo(hw, Y(u))));
  for (let n = outline.length - 1; n >= 0; n--) ctx.lineTo(-outline[n][1], Y(outline[n][0]));
  ctx.closePath();
  ctx.lineJoin = 'round';
  paint(ctx, SCAN_TOP, 2.6);
  // A ridge down the middle, and the grip band near the back.
  ctx.fillStyle = SCAN_EDGE;
  ctx.fillRect(-1.5, Math.min(Y(-46), Y(20)), 3, Math.abs(Y(20) - Y(-46)));
  ctx.fillStyle = '#1f2327';
  ctx.fillRect(-9, Math.min(Y(-48), Y(-43)), 18, 5);
  // The label along the top, its bars running across.
  ctx.save();
  ctx.translate(0, Y(-36));
  ctx.rotate(head > 0 ? Math.PI / 2 : -Math.PI / 2);
  barcodeLabel(ctx, 0, -6, 52, 12, step, false);
  ctx.restore();
  laserSticker(ctx, 0, Y(42), 7);
  // The end nearest the viewer, standing H tall.
  if (head > 0) {
    // The head's front face with the window, looking straight at you.
    box(ctx, -15, Y(57), 30, H + 3, 2.5, SCAN, 2.4);
    box(ctx, -12, Y(57) + 2, 24, H - 2, 2, ready ? LASER : LASER_DIM, 1.6);
    if (ready) { ctx.fillStyle = '#ffd0d0'; ctx.fillRect(-9, Y(57) + 3.5, 18, 1.6); }
  } else {
    // The back end: a socket and the coiled cable to the floor; the window glows up at the far end.
    box(ctx, -6, Y(-54), 12, H + 2, 2.5, SCAN, 2.2);
    circle(ctx, 0, Y(-54) + H / 2 + 1, 2.2, '#14181c', 1.2);
    coilCable(ctx, 0, Y(-54) + H / 2 + 1, 13, 58, 4);
    box(ctx, -13, Y(57) - 2, 26, 5, 2, ready ? LASER : LASER_DIM, 1.6);
  }
  circle(ctx, 9, Y(26), 2, ready ? '#4ade80' : '#3a5a40', 1.1);
}

/** The TV Salesman's stand, centred on (0, 0): x -40..40, y -40..40 is its footprint. */
function salesStand(ctx, step, off) {
  // Shadow and the red carpet with a gold edge.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  rr(ctx, -35, -22, 78, 64, 8);
  ctx.fill();
  box(ctx, -39, -28, 78, 66, 7, '#a61e3a', 2.5);
  rr(ctx, -34, -23, 68, 56, 5);
  ctx.strokeStyle = '#f2c21b'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash(NO_DASH);
  // The television on a pole at the back left, glowing when on.
  line(ctx, -18, -24, -18, 4, INK, 4);
  line(ctx, -18, -24, -18, 4, '#6b7178', 2);
  if (!off) {
    ctx.fillStyle = 'rgba(150,235,255,0.35)';
    rr(ctx, -46, -64, 56, 46, 12);
    ctx.fill();
  }
  ctx.beginPath(); // rabbit ears
  ctx.moveTo(-18, -53); ctx.lineTo(-28, -63); ctx.moveTo(-18, -53); ctx.lineTo(-8, -64);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
  box(ctx, -39, -55, 42, 33, 4, '#2b2f34', 2.5);
  rr(ctx, -36, -52, 31, 26, 2);
  ctx.fillStyle = off ? '#1d2a33' : '#c9f6ff';
  ctx.fill();
  if (!off) {
    ctx.save();
    rr(ctx, -36, -52, 31, 26, 2);
    ctx.clip();
    if (step < 4) {
      // A knife going through a tomato.
      ctx.beginPath(); ctx.arc(-24, -36, 6, 0, Math.PI * 2); paint(ctx, '#e8303a', 1.2);
      ctx.fillStyle = '#3fae49'; ctx.fillRect(-25, -43, 3, 3);
      const ky = step & 1 ? -36 : -46;
      ctx.beginPath();
      ctx.moveTo(-26, ky); ctx.lineTo(-10, ky - 4); ctx.lineTo(-10, ky + 2); ctx.closePath();
      paint(ctx, '#e6ebef', 1.2);
      box(ctx, -12, ky - 3, 6, 4, 1, '#3a2a20', 1);
    } else {
      // Barbecue flames.
      ctx.fillStyle = '#2b2f34'; ctx.fillRect(-36, -32, 31, 6);
      ctx.beginPath();
      const h = step & 1 ? 0 : 3;
      for (let k = 0; k < 4; k++) {
        const x = -33 + k * 7.5;
        ctx.moveTo(x, -32); ctx.quadraticCurveTo(x + 1, -42 - h - (k % 2) * 4, x + 3.5, -48 + h); ctx.quadraticCurveTo(x + 5, -40, x + 7, -32);
      }
      ctx.closePath();
      paint(ctx, '#ff8c1a', 1);
      ctx.fillStyle = '#ffe14a';
      for (let k = 0; k < 4; k++) ctx.fillRect(-31 + k * 7.5, -38 + h * 0.5, 3, 5);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-36, -52 + ((step * 7) % 26), 31, 2); // a scanline rolling down
    ctx.restore();
  }
  circle(ctx, -1, -26, 1.6, off ? '#555' : '#ff3b30', 0.8); // standby light
  // "As seen on TV" starburst on a stick, top right.
  line(ctx, 36, -46, 36, -24, INK, 2);
  burstPath(ctx, 36, -50, 9, 9, 0.3);
  paint(ctx, '#ffd23f', 1.8);
  text(ctx, 'TV!', 36, -50, 7.5, '#d9372b', 900);
  // The salesman, behind the counter.
  const chop = step & 1;
  // Back arm, open hand toward the television.
  limbB(ctx, 6, -18, -4, -24, '#c9a227', 3.6);
  circle(ctx, -5.5, -25, 2.4, C.skin, 1.2);
  // Mustard check suit jacket.
  ctx.beginPath();
  ctx.moveTo(1, 4); ctx.lineTo(0, -16); ctx.quadraticCurveTo(10, -27, 21, -16); ctx.lineTo(21, 4);
  ctx.closePath();
  paint(ctx, '#c9a227', 2.2);
  ctx.beginPath();
  for (let x = 4; x < 21; x += 5) { ctx.moveTo(x, -20); ctx.lineTo(x, 4); }
  for (let y = -14; y < 4; y += 5) { ctx.moveTo(1, y); ctx.lineTo(21, y); }
  ctx.strokeStyle = 'rgba(120,70,20,0.55)'; ctx.lineWidth = 1; ctx.stroke();
  // Shirt and a fat red tie.
  ctx.beginPath(); ctx.moveTo(7, -21); ctx.lineTo(11, -10); ctx.lineTo(15, -21); ctx.closePath();
  paint(ctx, '#ffffff', 1.2);
  ctx.beginPath(); ctx.moveTo(10, -19); ctx.lineTo(12, -19); ctx.lineTo(13.5, -8); ctx.lineTo(11, -5); ctx.lineTo(8.5, -8); ctx.closePath();
  paint(ctx, '#d9372b', 1.1);
  // Head: slicked hair, eyebrows up, a huge white grin, a headset mic.
  circle(ctx, 11, -31, 7.5, C.skin, 2);
  ctx.beginPath();
  ctx.arc(11, -32, 8, Math.PI * 1.05, Math.PI * 1.95);
  ctx.quadraticCurveTo(13, -35, 3.4, -30);
  ctx.closePath();
  paint(ctx, '#1d1a17', 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(8, -38, 6, 1.4);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(9, -31.5, 1.2, 0, Math.PI * 2); ctx.arc(14, -31.5, 1.2, 0, Math.PI * 2); ctx.fill();
  box(ctx, 7.5, -28.5, 8, 3.6, 1.5, '#ffffff', 1.2);
  ctx.beginPath(); ctx.moveTo(3.6, -31); ctx.quadraticCurveTo(4, -26, 8, -26.5);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  // Front arm with the carving knife, chopping.
  const hx = chop ? 30 : 29, hy = chop ? -16 : -32;
  limbB(ctx, 18, -18, hx, hy, '#c9a227', 3.8);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(chop ? 0.35 : -0.9);
  ctx.beginPath();
  ctx.moveTo(1, -2); ctx.lineTo(17, -3.5); ctx.lineTo(1, 3);
  ctx.closePath();
  paint(ctx, '#e6ebef', 1.4);
  box(ctx, -5, -2, 7, 4, 1, '#3a2a20', 1.2);
  ctx.restore();
  circle(ctx, hx, hy, 2.6, C.skin, 1.2);
  // The counter: white top, yellow front with a red stripe and the price.
  box(ctx, -32, 4, 66, 28, 3, '#ffd23f', 2.5);
  ctx.fillStyle = '#d9372b';
  ctx.fillRect(-31, 12, 64, 8);
  text(ctx, 'ONLY $19.99', 1, 16.5, 7, '#ffffff', 900);
  box(ctx, -34, 0, 70, 7, 2, '#f4f4f4', 2.2);
  // A little kettle barbecue on the counter, smoking, with sausages.
  ctx.beginPath();
  ctx.ellipse(-20, 1, 9, 4.5, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  paint(ctx, '#2b2f34', 1.8);
  ctx.fillStyle = off ? '#666' : '#ff8c1a';
  for (let k = 0; k < 3; k++) ctx.fillRect(-26 + k * 5, -2 - ((step + k) % 2) * 2, 2.5, 3);
  box(ctx, -27, -3.5, 13, 3, 1.5, '#a5522b', 1);
  if (!off) {
    ctx.beginPath();
    ctx.moveTo(-20, -6); ctx.quadraticCurveTo(-24, -12 - (step % 3), -19, -17);
    ctx.strokeStyle = 'rgba(230,230,230,0.8)'; ctx.lineWidth = 2; ctx.stroke();
  }
}

/** A limb (sleeve) with an ink outline, for the salesman. */
function limbB(ctx, x1, y1, x2, y2, color, w) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 2.4;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}
const KIND_INDEX = {};
Object.keys(KINDS).forEach((k, n) => { KIND_INDEX[k] = n; });
const DASH_RING = [5, 4];
const NO_DASH = [];
const SAMPLE_COLOURS = ['#ffb15a', '#f2c21b', '#ff7aa8', '#ffe08a'];

/**
 * One crate of a Crate Stack. `r` is the stack's reinforcement level (0.4): the timber darkens as
 * it is braced, and armour() bolts steel on top.
 */
function crate(ctx, x, y, w, h, r = 0) {
  // From level 5 the planks are old dark timber, hardened under the steel bands.
  box(ctx, x, y, w, h, 1.5, r >= 5 ? '#8a5a2b' : '#b57a3c', 2.2);
  ctx.save();
  rr(ctx, x, y, w, h, 1.5);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
  ctx.strokeStyle = r >= 5 ? '#5a3815' : '#7a4f22';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  if (r > 0) armour(ctx, x, y, w, h, r);
}

/**
 * Steel on a reinforced crate (0.4), so its level reads at a glance and its number when zoomed in
 * (the badge carries the number):
 *   1    a dark steel strap down the middle, riveted
 *   2    and one across it
 *   3-4  plus steel plates over the corners (the bottom two, then all four)
 *   5    the timber darkens and steel bands run round the top and bottom
 *   6    plus a riveted steel plate over the middle
 *   7-8  a steel frame round the whole crate, bolted, and at the top level a yellow-and-black edge
 */
function armour(ctx, x, y, w, h, r) {
  const steel = '#6b737c', dark = '#2e3338', bright = '#e5e7eb';
  const rivet = (rx, ry) => { ctx.beginPath(); ctx.arc(rx, ry, 1.1, 0, TAU); ctx.fillStyle = bright; ctx.fill(); };
  // Bands round the top and the bottom (under the straps).
  if (r >= 5) {
    for (const by of [y + 2.4, y + h - 2.4]) box(ctx, x - 0.6, by - 2, w + 1.2, 4, 0.6, steel, 1.3);
  }
  // Straps: one down the middle, then one across.
  box(ctx, x + w / 2 - 2.8, y - 0.6, 5.6, h + 1.2, 0.8, steel, 1.4);
  rivet(x + w / 2, y + 2.6); rivet(x + w / 2, y + h - 2.6);
  if (r >= 2) {
    box(ctx, x - 0.6, y + h / 2 - 2.6, w + 1.2, 5.2, 0.8, steel, 1.4);
    rivet(x + 2.6, y + h / 2); rivet(x + w - 2.6, y + h / 2);
  }
  // A steel plate over the middle, four rivets.
  if (r >= 6) {
    const pw = Math.min(w * 0.42, 14), ph = h * 0.56;
    box(ctx, x + w / 2 - pw / 2, y + h / 2 - ph / 2, pw, ph, 1, '#8a929b', 1.4);
    for (const [px, py] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rivet(x + w / 2 + px * (pw / 2 - 2), y + h / 2 + py * (ph / 2 - 2));
  }
  // Corner plates: triangles of steel with a rivet each.
  if (r >= 3) {
    const k = Math.min(9, h * 0.5);
    const corners = r >= 4 ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 1], [1, 1]];
    for (const [cx, cy] of corners) {
      const px = x + cx * w, py = y + cy * h, sx = cx ? -1 : 1, sy = cy ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(px + sx * k, py); ctx.lineTo(px, py + sy * k);
      ctx.closePath();
      paint(ctx, C.steelLight, 1.2);
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(px + sx * k * 0.3, py + sy * k * 0.3, 0.9, 0, TAU); ctx.fill();
    }
  }
  // A bolted steel frame round the whole thing.
  if (r >= 7) {
    ctx.strokeStyle = INK; ctx.lineWidth = 4.6;
    ctx.strokeRect(x + 0.2, y + 0.2, w - 0.4, h - 0.4);
    ctx.strokeStyle = r >= 8 ? '#ffd23f' : '#9aa1a9'; ctx.lineWidth = 2.6;
    if (r >= 8) ctx.setLineDash([3.2, 2.6]);
    ctx.strokeRect(x + 0.2, y + 0.2, w - 0.4, h - 0.4);
    ctx.setLineDash(NO_DASH);
    ctx.fillStyle = C.steelLight;
    for (const [bx, by] of [[x + 2.5, y + h / 2], [x + w - 2.5, y + h / 2]]) {
      ctx.beginPath(); ctx.arc(bx, by, 1.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
    }
  }
}

/**
 * Sprites of machines and security buildings, keyed by kind and look. Call setScale() on resize.
 * `items` are the item sprites (the box on the Forklift Turret's forks).
 */
export function createBuildingSprites() {
  const map = new Map();
  let scale = 1;
  return {
    setScale(s) { if (s !== scale) { scale = s; map.clear(); } },
    /**
     * The sprite for a kind in a look (call the kind's look() first: big kinds take their box from
     * the pose). off: the greyed-out version, for security a dog has peed on. The canvas carries
     * its box ([w, h, centre x, centre y] in logical pixels) as `box`.
     */
    get(kind, look, items, off = 0) {
      const key = (KIND_INDEX[kind] * 16384 + look) * 2 + (off ? 1 : 0);
      let c = map.get(key);
      if (c) return c;
      if (map.size > 3000) map.clear(); // never let an odd combination of states grow it forever
      const K = KINDS[kind];
      const bx = K.box ? K.box() : BOX_1;
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(bx[0] * scale));
      c.height = Math.max(1, Math.ceil(bx[1] * scale));
      const g = c.getContext('2d');
      const kx = c.width / bx[0], ky = c.height / bx[1];
      g.setTransform(kx, 0, 0, ky, bx[2] * kx, bx[3] * ky);
      P.off = off ? 1 : 0;
      K.paint(g, items);
      P.off = 0;
      if (off) greyOut(c);
      c.box = bx;
      map.set(key, c);
      return c;
    },
  };
}

/**
 * Drains the colour out of a sprite and darkens it a little, keeping its shape: what is left of a
 * piece of security that has been peed on. (Blend modes rather than a canvas filter, which not
 * every browser has.)
 */
function greyOut(c) {
  const g = c.getContext('2d');
  const shape = document.createElement('canvas');
  shape.width = c.width; shape.height = c.height;
  shape.getContext('2d').drawImage(c, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'saturation';
  g.fillStyle = '#808080';
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(40,44,30,0.28)';
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(shape, 0, 0);
  g.globalCompositeOperation = 'source-over';
}

/** Scratch footprint, in logical pixels: x, y, w, h. */
const R = { x: 0, y: 0, w: T, h: T };
/** Kinds bigger than a tile. */
export const BIG = {};
for (const [k, def] of Object.entries(BUILD)) if (def.size) BIG[k] = true;

/**
 * The footprint of a building whose anchor is tile i on a map w wide, in logical pixels. Returns a
 * shared object, overwritten by the next call.
 */
export function rectOf(b, i, w) {
  R.x = (i % w) * T; R.y = ((i / w) | 0) * T;
  if (BIG[b.k]) {
    const [fw, fh] = sizeOf(b.k, BUILD[b.k].rot ? b.d | 0 : 0);
    R.w = fw * T; R.h = fh * T;
  } else { R.w = T; R.h = T; }
  return R;
}

/**
 * Draws a building from its anchor tile i (F.w is the map width), across its footprint.
 * A building that is switched off gets a puddle under it and is drawn greyed out.
 */
export function drawBuilding(ctx, b, i, F, sprites) {
  const K = KINDS[b.k];
  if (!K) return;
  const r = rectOf(b, i, F.w);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const off = b.off > 0 ? 1 : 0;
  if (off) puddle(ctx, r.x, r.y, r.w, r.h, F.time);
  if (b.k === 'forklift') {
    const h = BOX / 2;
    P.step = 0;
    ctx.drawImage(sprites.get('forklift', 0, F.sprites, off), cx - h, cy - h, BOX, BOX);
    // The truck turns toward its target and kicks back a little when it fires.
    const since = F.now - F.fx.shotAt[i];
    const kick = since < 160 ? (1 - since / 160) * 4 : 0;
    P.step = since > 500 ? 1 : 2;
    const img = sprites.get('forklift', P.step, F.sprites, off);
    const a = b.a || 0, c = Math.cos(a), s = Math.sin(a);
    ctx.save();
    ctx.transform(c, s, -s, c, cx - c * kick, cy - s * kick);
    ctx.drawImage(img, -h, -h, BOX, BOX);
    ctx.restore();
    return;
  }
  const look = K.look(b, F, i);
  const img = sprites.get(b.k, look, F.sprites, off);
  const bx = img.box;
  let kx = 0, ky = 0;
  if (b.k === 'railgun') {
    // It jolts back along its length when it fires.
    const since = F.now - F.fx.railAt[i];
    if (since >= 0 && since < 220) {
      const kick = (1 - since / 220) * 7, d = DIRS[b.d | 0];
      kx = -d[0] * kick; ky = -d[1] * kick;
    }
  }
  ctx.drawImage(img, cx - bx[2] + kx, cy - bx[3] + ky, bx[0], bx[1]);
  if (b.k === 'railgun' && P.step >= RAIL_STEPS && !off) {
    // Charged: the red window throbs (where it is in each drawing: see scannerH and scannerV).
    const dd = b.d | 0;
    const pulse = 0.5 + 0.5 * Math.sin(F.time * 7 + i);
    const ex = cx + kx + (dd === 0 ? 57 : dd === 2 ? -57 : 0);
    const ey = cy + ky + (dd === 1 ? 53 : dd === 3 ? -66 : -13);
    ctx.globalAlpha = 0.3 + 0.3 * pulse;
    ctx.beginPath();
    if (dd & 1) ctx.ellipse(ex, ey, 15 + pulse * 4, 6 + pulse * 3, 0, 0, TAU);
    else ctx.ellipse(ex, ey, 5 + pulse * 3, 17 + pulse * 4, 0, 0, TAU);
    ctx.fillStyle = '#ff4d4d';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** A yellow puddle under a building a dog has peed on, wobbling a little. */
function puddle(ctx, x, y, w, h, t) {
  const cx = x + w / 2, cy = y + h - 7;
  const wob = Math.sin(t * 3 + x) * 1.2;
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy, w / 2 + 6 + wob, 10 + h * 0.04, 0, 0, TAU);
  ctx.fillStyle = 'rgba(242,206,27,0.85)';
  ctx.fill();
  ctx.strokeStyle = '#a88a0a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.15, cy - 2, w * 0.14, 2.5, -0.15, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,220,0.8)';
  ctx.fill();
}

/**
 * What happens to a building over a wave, drawn on top of it every frame: damage from gym bro hits
 * (cracks, then bandages, then smoke and sparks when one more hit will finish it) and, while a dog
 * has it switched off, drips, stink lines and flies. Belts too. Nothing when it is untouched.
 */
export function drawWear(ctx, b, i, F) {
  if (!(b.hit > 0) && !(b.off > 0)) return;
  const r = rectOf(b, i, F.w);
  const x = r.x, y = r.y, w = r.w, h = r.h;
  if (b.hit > 0) damage(ctx, b, i, F.time, x, y, w, h, F.game);
  // The drips and flies are too small to see when zoomed far out (F.zoom: screen pixels a tile);
  // the grey and the puddle still say it.
  if (b.off > 0 && !(F.zoom < 18)) peedOn(ctx, i, F.time, x, y, w, h);
}

function damage(ctx, b, i, t, x, y, w, h, game = null) {
  const hits = statsOf(b, game).hits;
  const hit = Math.min(b.hit, hits);
  const left = hits - hit;
  const sev = hits > 0 ? hit / hits : 1;
  // Cracks: one for each hit, plus one when it is badly hurt. A pale edge under the ink line keeps
  // them visible on dark steel as well as light.
  const n = Math.min(5, hit + (sev >= 0.5 ? 1 : 0)) * (BIG[b.k] ? 2 : 1);
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    let px = x + 6 + hash2(i, k * 5 + 1) * (w - 12), py = y + 6 + hash2(k * 5 + 2, i) * (h - 14);
    const a = hash2(i + 7, k) * Math.PI * 2;
    ctx.moveTo(px, py);
    for (let s = 0; s < 3; s++) {
      const zig = s % 2 ? 0.7 : -0.7;
      px += Math.cos(a + zig) * 6; py += Math.sin(a + zig) * 6;
      ctx.lineTo(px, py);
    }
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 4.6;
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  // Bandages once it is half gone: crossed strips of white tape.
  if (sev >= 0.5) {
    const bx = x + w * (0.3 + 0.4 * hash2(i, 31)), by = y + h * (0.35 + 0.2 * hash2(32, i));
    for (const a of [0.6, -0.6]) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(a);
      rr(ctx, -10, -3.5, 20, 7, 2.5);
      paint(ctx, '#fbfbf4', 1.6);
      ctx.fillStyle = '#e8b4b4';
      ctx.fillRect(-3, -2.2, 6, 4.4);
      ctx.restore();
    }
  }
  // One hit left: smoke curling up and sparks spitting.
  if (left === 1 && hits > 1) {
    for (let k = 0; k < 3; k++) {
      const p = (t * 0.7 + k / 3) % 1;
      const sx = x + w * 0.5 + Math.sin(t * 2 + k * 2) * 5 + (k - 1) * 6, sy = y + 4 - p * 26;
      ctx.globalAlpha = 0.85 * (1 - p);
      ctx.beginPath();
      ctx.arc(sx, sy, 4 + p * 7, 0, TAU);
      ctx.fillStyle = '#3a3e44';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (((t * 6) | 0) % 3 !== 0) {
      const sx = x + w * (0.25 + 0.5 * hash2((t * 6) | 0, i)), sy = y + h * 0.35;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = k * 1.6 + t * 9;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * 6, sy + Math.sin(a) * 6);
      }
      ctx.strokeStyle = '#ffe14a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function peedOn(ctx, i, t, x, y, w, h) {
  // Drips running down the front into the puddle.
  for (let k = 0; k < 2; k++) {
    const p = (t * 1.1 + k * 0.5 + hash2(i, k)) % 1;
    const dx = x + w * (0.3 + 0.4 * k), dy = y + h * 0.45 + p * h * 0.45;
    ctx.globalAlpha = p < 0.85 ? 1 : (1 - p) / 0.15;
    ctx.beginPath();
    ctx.moveTo(dx, dy - 5);
    ctx.quadraticCurveTo(dx + 3.5, dy + 1, dx, dy + 2.5);
    ctx.quadraticCurveTo(dx - 3.5, dy + 1, dx, dy - 5);
    paint(ctx, '#f2ce1b', 1.2);
  }
  ctx.globalAlpha = 1;
  // Stink lines rising off it.
  ctx.beginPath();
  for (let k = 0; k < 2; k++) {
    const sx = x + w / 2 + (k ? 9 : -9), sy = y + 2;
    const p = (t * 0.8 + k * 0.5) % 1;
    ctx.moveTo(sx, sy - p * 6);
    for (let s = 1; s <= 6; s++) ctx.lineTo(sx + Math.sin(s * 1.4 + t * 5) * 3, sy - p * 6 - s * 3);
  }
  ctx.strokeStyle = 'rgba(132,204,22,0.9)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();
  // Flies buzzing round the top.
  for (let k = 0; k < 3; k++) {
    const a = t * (6 + k) + k * 2.1;
    const fx = x + w / 2 + Math.cos(a) * (10 + k * 3), fy = y - 2 + Math.sin(a * 1.7) * 6;
    ctx.beginPath();
    ctx.ellipse(fx - 1, fy - 2.2, 2, 1.2, -0.5, 0, TAU);
    ctx.ellipse(fx + 1.5, fy - 2.2, 2, 1.2, 0.5, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx, fy, 2, 0, TAU);
    ctx.fillStyle = INK;
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------------------------
// Level badges, wreckage

/** The main colours of each kind, for wreckage and debris: [body, trim, detail]. */
export const KIND_COLOURS = {
  crate: ['#b57a3c', C.wood, '#7a4f22'],
  sprinkler: [C.steel, C.red, '#7d848b'],
  forklift: [C.yellow, '#2b2f34', '#9aa0a6'],
  wetfloor: [C.yellow, C.yellowDark, C.blue],
  samples: ['#ffffff', C.red, '#ff5fa8'],
  railgun: [SCAN, '#f4f1e6', LASER],
  salesman: ['#ffd23f', '#a61e3a', '#c9a227'],
};

/**
 * A small badge with the building's level (2 and up) at the top right of its tile. `k` scales it
 * up when zoomed out, so the number stays readable on small tiles. `top`: every track it works at by
 * levels is stocked at the best tier (the badge turns pink). It goes in the top right corner of the
 * tile centred on (cx, cy).
 */
export function drawBadge(ctx, cx, cy, lv, k = 1, res = 0, top = false) {
  const str = String(lv);
  const w = (str.length > 1 ? 21 : 16) * k, h = 13 * k;
  const x = cx + HALF - w + 2 * k;
  const y = cy - HALF - 2 * k;
  if (res > 0) {
    // Cached as a sprite at the sprite resolution `res` (device pixels per logical pixel): a
    // floor full of stocked towers would otherwise mean hundreds of text draws a frame.
    const pad = 2 * k;
    const key = (lv * 1e6 + Math.round(k * 10) * 1e4 + Math.round(res * 1000)) * 2 + (top ? 1 : 0);
    let c = badgeCache.get(key);
    if (!c) {
      if (badgeCache.size > 300) badgeCache.clear();
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil((w + pad * 2) * res));
      c.height = Math.max(1, Math.ceil((h + pad * 2) * res));
      const g = c.getContext('2d');
      g.setTransform(c.width / (w + pad * 2), 0, 0, c.height / (h + pad * 2), pad * c.width / (w + pad * 2), pad * c.height / (h + pad * 2));
      paintBadge(g, 0, 0, w, h, k, lv, top);
      badgeCache.set(key, c);
    }
    ctx.drawImage(c, x - pad, y - pad, w + pad * 2, h + pad * 2);
    return;
  }
  paintBadge(ctx, x, y, w, h, k, lv, top);
}
const badgeCache = new Map();

function paintBadge(ctx, x, y, w, h, k, lv, top) {
  const str = String(lv);
  rr(ctx, x, y, w, h, 4 * k);
  paint(ctx, top ? '#ff4fa3' : '#ffd23f', 1.6 * k);
  // An up chevron, then the number.
  ctx.beginPath();
  ctx.moveTo(x + 2.5 * k, y + 8.5 * k);
  ctx.lineTo(x + 5 * k, y + 5 * k);
  ctx.lineTo(x + 7.5 * k, y + 8.5 * k);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8 * k;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  text(ctx, str, x + w - (str.length > 1 ? 7 : 4.5) * k, y + h / 2 + 0.5 * k, 10 * k, INK, 900);
}

/**
 * What is left of a building a gym bro wrecked: a low heap of broken bits in its colours, with a
 * scorch of dust under it, so players can see the holes in their maze. A big building leaves a
 * heap on every tile of its footprint (i is its anchor tile, d its facing).
 */
export function drawRubble(ctx, i, kind, w, d = 0, ordered = false) {
  const def = BUILD[kind];
  const [fw, fh] = def ? sizeOf(kind, def.rot ? d | 0 : 0) : [1, 1];
  for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) heap(ctx, i + dy * w + dx, kind, w);
  if (ordered) cone(ctx, i, w);
}

/**
 * A little orange traffic cone on the heap (0.3.04): somebody has paid to rebuild this wreck, and it
 * goes back as soon as nothing is in the way. Only on the anchor tile, so a big building gets one.
 */
function cone(ctx, i, w) {
  const cx = (i % w) * T + T - 10, by = ((i / w) | 0) * T + 17;
  ctx.beginPath();
  ctx.rect(cx - 7, by - 1, 14, 3.5);
  paint(ctx, '#f97316', 1.2);
  ctx.beginPath();
  ctx.moveTo(cx - 5, by - 1); ctx.lineTo(cx - 1.6, by - 14); ctx.lineTo(cx + 1.6, by - 14); ctx.lineTo(cx + 5, by - 1);
  ctx.closePath();
  paint(ctx, '#f97316', 1.2);
  // The white reflective band.
  ctx.beginPath();
  ctx.moveTo(cx - 3.7, by - 5.5); ctx.lineTo(cx - 2.7, by - 9); ctx.lineTo(cx + 2.7, by - 9); ctx.lineTo(cx + 3.7, by - 5.5);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function heap(ctx, i, kind, w) {
  const col = KIND_COLOURS[kind] || KIND_COLOURS.crate;
  const px = (i % w) * T, py = ((i / w) | 0) * T;
  ctx.beginPath();
  ctx.ellipse(px + HALF, py + HALF + 3, 16, 11, 0, 0, TAU);
  ctx.fillStyle = 'rgba(70,60,48,0.28)';
  ctx.fill();
  for (let j = 0; j < 7; j++) {
    const h1 = hash2(i, j + 3), h2 = hash2(j + 11, i);
    const bx = px + 8 + h1 * 24, by = py + 10 + h2 * 20;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(h1 * 6.3);
    ctx.beginPath();
    if (j % 3 === 2) { ctx.moveTo(-4, 1.5); ctx.lineTo(3, -2.5); ctx.lineTo(4, 2.5); ctx.closePath(); } else ctx.rect(-5, -1.8, 10, 3.6);
    paint(ctx, col[j % 3], 1.2);
    ctx.restore();
  }
}
