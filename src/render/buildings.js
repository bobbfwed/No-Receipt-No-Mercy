// Everything players build. Belts are drawn flat in the belt's own rotated frame; machines and
// security are drawn upright (three-quarter view, like the mock-up) with a separate spout and
// arrow showing the side they output to, so they look the same whichever way they face.
import { DIRS, TUNE, TICK_HZ } from '../sim/index.js';
import {
  TILE, INK, C, rr, paint, box, circle, line, text, label, hazard, hash2,
} from './paint.js';
import { drawItem } from './items.js';

const T = TILE;
const HALF = T / 2;
const ROT = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
/** Chevron spacing on belts; divides the tile so the pattern lines up across neighbouring belts. */
export const SP = T / 3;
/** Belt movement per tick, as a share of a tile. */
const BELT_ADV = TUNE.beltSpeed / TICK_HZ;
/** Building kinds that push items out of their front (b.d). */
const PUSHES = { belt: true, unpacker: true, press: true, packer: true };

// ---------------------------------------------------------------------------------------------
// Belts

// The belt functions take the game state (or anything with grid, w and h) for the map size.

/** True if the building at (x, y) pushes items in direction `dir`. */
function pushesInto(s, x, y, dir) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false;
  const b = s.grid[y * s.w + x];
  return !!b && PUSHES[b.k] === true && b.d === dir;
}

/** True if whatever is at (x, y) accepts items arriving in direction `dir`. */
function accepts(s, x, y, dir) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false;
  const b = s.grid[y * s.w + x];
  if (!b) return false;
  if (b.k === 'belt') return b.d !== ((dir + 2) & 3);
  if (b.k === 'press' || b.k === 'packer') return b.d !== ((dir + 2) & 3);
  return b.k === 'chute';
}

/**
 * How a belt bends: 0 straight; 1 a corner fed from its right-hand side (local +y);
 * -1 a corner fed from its left-hand side. A belt fed from behind is always straight.
 */
export function beltShape(s, x, y, d) {
  const back = (d + 2) & 3, right = (d + 1) & 3, left = (d + 3) & 3;
  if (pushesInto(s, x + DIRS[back][0], y + DIRS[back][1], d)) return 0;
  const r = pushesInto(s, x + DIRS[right][0], y + DIRS[right][1], left);
  const l = pushesInto(s, x + DIRS[left][0], y + DIRS[left][1], right);
  if (r && !l) return 1;
  if (l && !r) return -1;
  return 0;
}

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
      if (type === 4) cornerBelt(g, phase);
      else straightBelt(g, phase, !(type & 1), !(type & 2));
      map.set(key, c);
      return c;
    },
  };
}

/**
 * Draws one belt tile. `phase` (0..SP) is how far the chevrons have moved, so they visibly run
 * in the belt's direction. `base` is the world-to-screen transform {s, ox, oy}; the belt sprite
 * is placed with a single setTransform (rotated, and mirrored for left-hand corners), and the
 * world transform is restored afterwards.
 */
export function drawBelt(ctx, s, x, y, d, shape, phase, sprites, base) {
  let type = 4;
  if (shape === 0) {
    const back = (d + 2) & 3;
    const backOpen = pushesInto(s, x + DIRS[back][0], y + DIRS[back][1], d);
    const frontOpen = accepts(s, x + DIRS[d][0], y + DIRS[d][1], d);
    type = (backOpen ? 0 : 1) | (frontOpen ? 0 : 2);
  }
  const step = Math.min(PHASES - 1, ((phase / SP) * PHASES) | 0);
  const img = sprites.get(type, step);
  const k = base.s, m = shape === -1 ? -1 : 1;
  const cx = x * T + HALF, cy = y * T + HALF;
  ctx.setTransform(k * COS[d], k * SIN[d], -k * SIN[d] * m, k * COS[d] * m, k * cx + base.ox, k * cy + base.oy);
  ctx.drawImage(img, -HALF, -HALF, T, T);
  ctx.setTransform(k, 0, 0, k, base.ox, base.oy);
}

function straightBelt(ctx, phase, backOpen, frontOpen) {
  ctx.fillStyle = C.belt;
  ctx.fillRect(-HALF, -13, T, 26);
  // Moving chevrons, clipped to the belt surface.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-HALF, -13, T, 26);
  ctx.clip();
  ctx.beginPath();
  for (let k = -1; k <= 3; k++) {
    const px = -HALF + k * SP + phase;
    ctx.moveTo(px - 5, -8);
    ctx.lineTo(px + 2, 0);
    ctx.lineTo(px - 5, 8);
  }
  ctx.strokeStyle = C.chevron;
  ctx.lineWidth = 3.5;
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
function cornerBelt(ctx, phase) {
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
    ctx.moveTo(px - tx * 5 - nx * 8, py - ty * 5 - ny * 8);
    ctx.lineTo(px + tx * 2, py + ty * 2);
    ctx.lineTo(px - tx * 5 + nx * 8, py - ty * 5 + ny * 8);
  }
  ctx.strokeStyle = C.chevron;
  ctx.lineWidth = 3.5;
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

/**
 * Draws the items on a belt, upright, moved on by `alpha` of a tick so they glide smoothly.
 * Straight belts place items at tile centre + direction * (progress - 0.5); corners follow the curve.
 */
export function drawBeltItems(ctx, b, x, y, shape, alpha, sprites) {
  const it = b.it;
  if (!it || !it.length) return;
  const cx = x * T + HALF, cy = y * T + HALF, d = b.d;
  const adv = BELT_ADV * alpha;
  let prev = 2;
  for (let j = 0; j < it.length; j++) {
    const p0 = it[j][1];
    const cap = j === 0 ? 1 : prev - 0.5;
    const p = Math.max(p0, Math.min(cap, p0 + adv));
    prev = p;
    let lx, ly;
    if (shape === 0) { lx = (p - 0.5) * T; ly = 0; } else {
      const a = Math.PI + p * Math.PI / 2;
      lx = HALF + HALF * Math.cos(a);
      ly = (HALF + HALF * Math.sin(a)) * shape;
    }
    // Rotate the local offset into the belt's direction.
    let wx = lx, wy = ly;
    if (d === 1) { wx = -ly; wy = lx; } else if (d === 2) { wx = -lx; wy = -ly; } else if (d === 3) { wx = ly; wy = -lx; }
    drawItem(ctx, sprites, it[j][0], cx + wx, cy + wy - 1);
  }
}


// ---------------------------------------------------------------------------------------------
// Machines and security
//
// Each kind has a `look` function that reduces a building and the current time to a small
// integer (its visual state: facing, animation step, what is inside...) and fills in the shared
// pose P, and a `paint` function that draws from P alone. The drawing for each (kind, look) is
// cached as a sprite, so a big factory costs one drawImage per building.

const TAU = Math.PI * 2;
const ITEM_IDS = { box: 1, gadget: 2, giftset: 3 };
const ITEM_KINDS = [null, 'box', 'gadget', 'giftset'];
/** Sprite box for one building, in logical pixels: a tile plus room for spouts, flags and tops. */
const BOX = 56;
/** Pose shared by look() and paint(), filled in fresh for every building. */
const P = { d: 0, step: 0, on: false, n: 0, out: 0, inside: 0, light: -1, spray: false };

/** A dark steel spout from the machine body to the output edge, with a yellow arrow on it. */
function spout(ctx, d) {
  ctx.save();
  ctx.rotate(ROT[d]);
  rr(ctx, 6, -7, 14, 14, 2);
  paint(ctx, C.steelDark, 2);
  ctx.beginPath();
  ctx.moveTo(12.5, -6);
  ctx.lineTo(20, 0);
  ctx.lineTo(12.5, 6);
  ctx.closePath();
  paint(ctx, C.yellow, 1.8);
  ctx.restore();
}

/** A soft drop shadow under an upright building. */
function shadow(ctx, w = 34, h = 30) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  rr(ctx, -w / 2 + 3, -h / 2 + 6, w, h, 6);
  ctx.fill();
}

/** A finished item waiting at the spout of a press or packer. */
function outItem(ctx, S) {
  if (P.out) drawItem(ctx, S, ITEM_KINDS[P.out], DIRS[P.d][0] * 15, DIRS[P.d][1] * 15, 15);
}

const KINDS = {
  unpacker: {
    look(b) {
      // The next box pops up out of the open box just before it is pushed out.
      const ready = b.t > 0 && b.t < 14 ? 1 - b.t / 14 : 0;
      P.d = b.d | 0;
      P.step = ready ? 1 + Math.min(3, (ready * 4) | 0) : 0;
      return P.d * 5 + P.step;
    },
    paint(ctx, S) {
      shadow(ctx);
      spout(ctx, P.d);
      // Wooden pallet.
      box(ctx, -17, 5, 34, 11, 2, C.wood, 2.2);
      ctx.fillStyle = C.woodDark;
      ctx.fillRect(-11, 11, 6, 5);
      ctx.fillRect(5, 11, 6, 5);
      ctx.fillRect(-16, 9, 32, 1.5);
      // Open box: flaps, dark inside, the box popping up, then the front face.
      const jig = P.step ? (P.step % 2 ? 1 : -1) * P.step * 0.4 : 0;
      ctx.save();
      ctx.translate(jig, 0);
      ctx.beginPath();
      ctx.moveTo(-13, -9); ctx.lineTo(-19, -17); ctx.lineTo(-9, -18); ctx.lineTo(-5, -9);
      ctx.closePath();
      paint(ctx, C.cardboardLight, 2);
      ctx.beginPath();
      ctx.moveTo(13, -9); ctx.lineTo(19, -17); ctx.lineTo(9, -18); ctx.lineTo(5, -9);
      ctx.closePath();
      paint(ctx, C.cardboardLight, 2);
      box(ctx, -13, -11, 26, 6, 1, '#5a3a1a', 2);
      if (P.step) drawItem(ctx, S, 'box', 0, -8 - P.step * 2, 18);
      box(ctx, -13, -7, 26, 14, 2, C.cardboard, 2.2);
      ctx.fillStyle = C.cardboardLight;
      ctx.fillRect(-2, -6, 4, 12);
      ctx.restore();
      // White arrow on the box front, pointing to the output side.
      ctx.save();
      ctx.rotate(ROT[P.d]);
      ctx.beginPath();
      ctx.moveTo(-6, -2); ctx.lineTo(1, -2); ctx.lineTo(1, -5); ctx.lineTo(7, 0); ctx.lineTo(1, 5); ctx.lineTo(1, 2); ctx.lineTo(-6, 2);
      ctx.closePath();
      paint(ctx, '#ffffff', 1.4);
      ctx.restore();
    },
  },

  press: {
    look(b, F) {
      P.d = b.d | 0;
      P.on = b.t > 0;
      // Pump cycle: the ram goes down and up about 1.6 times a second while working.
      P.step = P.on ? 1 + ((((F.time * 1.6) % 1) * 8) | 0) : 0;
      P.light = P.on && ((F.time * 4) | 0) % 2 === 0 ? 1 : 0;
      P.n = Math.min(2, b.n | 0);
      P.out = b.out ? ITEM_IDS[b.out] || 0 : 0;
      return (((P.d * 9 + P.step) * 2 + P.light) * 3 + P.n) * 4 + P.out;
    },
    paint(ctx, S) {
      shadow(ctx);
      spout(ctx, P.d);
      const pump = P.step ? 0.5 - 0.5 * Math.cos(((P.step - 1) / 8) * TAU) : 0;
      // Frame columns behind the body.
      box(ctx, -15, -20, 5, 18, 1, '#6b7178', 2);
      box(ctx, 10, -20, 5, 18, 1, '#6b7178', 2);
      // Body with hazard stripes, and the bed where boxes get crushed.
      box(ctx, -17, -6, 34, 22, 3, '#e8761a', 2.5);
      hazard(ctx, -16, 9, 32, 6, 4);
      box(ctx, -11, -8, 22, 5, 1, '#8a8f96', 2);
      // Ram: rod and head plate.
      const hy = -17 + pump * 7;
      ctx.fillStyle = '#c9ced4';
      ctx.fillRect(-2.5, -21, 5, hy + 22);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-2.5, -21, 5, hy + 22);
      box(ctx, -10, hy, 20, 5, 1.5, '#9aa0a6', 2);
      // Top crossbar and status light (red, flashing while pressing).
      box(ctx, -17, -24, 34, 6, 2, '#4b5058', 2.2);
      circle(ctx, 11, 1, 3, P.light ? '#ff3b30' : '#7a2a24', 1.5);
      // Boxes waiting to be pressed.
      if (P.n > 0) drawItem(ctx, S, 'box', -9, 3, 12);
      if (P.n > 1) drawItem(ctx, S, 'box', -3, 3, 12);
      outItem(ctx, S);
    },
  },

  packer: {
    look(b, F) {
      P.d = b.d | 0;
      P.on = b.t > 0;
      P.step = P.on ? 1 + ((((F.time * 9) / Math.PI) % 1) * 8 | 0) : 0;
      P.light = P.on ? ((F.time * 8) | 0) % 3 : 3;
      P.out = b.out ? ITEM_IDS[b.out] || 0 : 0;
      P.inside = P.out ? P.out : (P.on || b.n > 0) ? 2 : 0;
      return (((P.d * 9 + P.step) * 4 + P.light) * 4 + P.inside) * 4 + P.out;
    },
    paint(ctx, S) {
      shadow(ctx);
      spout(ctx, P.d);
      // Glass case with the item inside.
      rr(ctx, -17, -9, 34, 25, 8);
      paint(ctx, '#d6eef8', 2.5);
      if (P.inside) drawItem(ctx, S, ITEM_KINDS[P.inside], 0, 4, 20);
      if (P.step) {
        // A ribbon whirling round the gadget while it is being wrapped.
        const a = ((P.step - 1) / 8) * Math.PI;
        const w = Math.abs(Math.cos(a)) * 11;
        ctx.fillStyle = '#ff5fa8';
        ctx.fillRect(-w, 1, w * 2, 3);
        ctx.fillStyle = C.yellow;
        ctx.fillRect(-1.5 + Math.sin(a * 2) * 8, -3, 3, 12);
      }
      rr(ctx, -17, -9, 34, 25, 8);
      ctx.fillStyle = 'rgba(154,215,240,0.45)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      line(ctx, -12, -4, -12, 8, 'rgba(255,255,255,0.8)', 2); // shine on the glass
      // Control unit on top with three lights that chase while working.
      box(ctx, -15, -20, 30, 11, 3, '#6a6f75', 2.2);
      for (let k = 0; k < 3; k++) circle(ctx, -8 + k * 8, -14.5, 2.6, k === P.light ? '#ff3b30' : '#8a2e28', 1.2);
      outItem(ctx, S);
    },
  },

  chute: {
    look(b, F, i) {
      const since = F.now - F.fx.saleAt[i];
      P.step = since < 500 ? 1 + Math.min(4, ((1 - since / 500) * 5) | 0) : 0; // flash after a sale
      return P.step;
    },
    paint(ctx) {
      const flash = P.step / 5;
      box(ctx, -18, -18, 36, 36, 6, flash ? '#6fdc7a' : C.green, 2.5);
      // Little arrows on the rim: anything pushed in from any side is sold.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let d = 0; d < 4; d++) {
        const dx = DIRS[d][0], dy = DIRS[d][1];
        ctx.moveTo(-dx * 16 - dy * 3, -dy * 16 + dx * 3);
        ctx.lineTo(-dx * 13, -dy * 13);
        ctx.lineTo(-dx * 16 + dy * 3, -dy * 16 - dx * 3);
      }
      ctx.fill();
      box(ctx, -12, -12, 24, 24, 4, '#123d1c', 2);
      box(ctx, -8, -8, 16, 16, 3, '#06180b', 0);
      label(ctx, '$', 0, 1, 15 + flash * 7, flash ? '#ffffff' : '#7CFC00', '#06180b', 3);
    },
  },

  crate: {
    look() { return 0; },
    paint(ctx) {
      shadow(ctx, 34, 30);
      crate(ctx, -17, -4, 34, 20);
      crate(ctx, -12, -19, 22, 16);
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

  samples: {
    look(b, F) {
      P.step = ((((F.time * 4) / TAU) % 1) * 6) | 0; // flag waving
      return P.step;
    },
    paint(ctx) {
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
};
const KIND_INDEX = {};
Object.keys(KINDS).forEach((k, n) => { KIND_INDEX[k] = n; });
const DASH_RING = [5, 4];
const NO_DASH = [];
const SAMPLE_COLOURS = ['#ffb15a', '#f2c21b', '#ff7aa8', '#ffe08a'];

function crate(ctx, x, y, w, h) {
  box(ctx, x, y, w, h, 1.5, '#b57a3c', 2.2);
  ctx.save();
  rr(ctx, x, y, w, h, 1.5);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
  ctx.strokeStyle = '#7a4f22';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
}

/**
 * Sprites of machines and security buildings, keyed by kind and look. Call setScale() on resize.
 * `items` are the item sprites (drawn into some machines).
 */
export function createBuildingSprites() {
  const map = new Map();
  let scale = 1;
  return {
    setScale(s) { if (s !== scale) { scale = s; map.clear(); } },
    get(kind, look, items) {
      const key = KIND_INDEX[kind] * 4096 + look;
      let c = map.get(key);
      if (c) return c;
      if (map.size > 3000) map.clear(); // never let an odd combination of states grow it forever
      c = document.createElement('canvas');
      c.width = c.height = Math.max(1, Math.ceil(BOX * scale));
      const g = c.getContext('2d');
      const k = c.width / BOX;
      g.setTransform(k, 0, 0, k, (BOX / 2) * k, (BOX / 2) * k);
      KINDS[kind].paint(g, items);
      map.set(key, c);
      return c;
    },
  };
}

/** Draws a non-belt building at tile index i (F.w is the map width). */
export function drawBuilding(ctx, b, i, F, sprites) {
  const K = KINDS[b.k];
  if (!K) return;
  const cx = (i % F.w) * T + HALF, cy = ((i / F.w) | 0) * T + HALF;
  const h = BOX / 2;
  if (b.k === 'forklift') {
    P.step = 0;
    ctx.drawImage(sprites.get('forklift', 0, F.sprites), cx - h, cy - h, BOX, BOX);
    // The truck turns toward its target and kicks back a little when it fires.
    const since = F.now - F.fx.shotAt[i];
    const kick = since < 160 ? (1 - since / 160) * 4 : 0;
    P.step = since > 500 ? 1 : 2;
    const img = sprites.get('forklift', P.step, F.sprites);
    const a = b.a || 0, c = Math.cos(a), s = Math.sin(a);
    ctx.save();
    ctx.transform(c, s, -s, c, cx - c * kick, cy - s * kick);
    ctx.drawImage(img, -h, -h, BOX, BOX);
    ctx.restore();
    return;
  }
  const look = K.look(b, F, i);
  ctx.drawImage(sprites.get(b.k, look, F.sprites), cx - h, cy - h, BOX, BOX);
}

// ---------------------------------------------------------------------------------------------
// Upgrade badges, wreckage

/** The main colours of each kind, for wreckage and debris: [body, trim, detail]. */
export const KIND_COLOURS = {
  belt: ['#34383d', C.steel, C.chevron],
  unpacker: [C.wood, C.cardboard, C.woodDark],
  press: ['#e8761a', '#9aa0a6', '#4b5058'],
  packer: ['#d6eef8', '#6a6f75', '#ff5fa8'],
  chute: [C.green, '#123d1c', '#ffffff'],
  crate: ['#b57a3c', C.wood, '#7a4f22'],
  sprinkler: [C.steel, C.red, '#7d848b'],
  forklift: [C.yellow, '#2b2f34', '#9aa0a6'],
  wetfloor: [C.yellow, C.yellowDark, C.blue],
  samples: ['#ffffff', C.red, '#ff5fa8'],
};

/**
 * A small badge with the building's level (2 and up) at the top right of its tile. `k` scales it
 * up when zoomed out, so the number stays readable on small tiles.
 */
export function drawBadge(ctx, cx, cy, lv, k = 1, res = 0) {
  const str = String(lv);
  const w = (str.length > 1 ? 21 : 16) * k, h = 13 * k;
  const x = cx + HALF - w + 2 * k, y = cy - HALF - 2 * k;
  if (res > 0) {
    // Cached as a sprite at the sprite resolution `res` (device pixels per logical pixel): a
    // floor full of upgraded towers would otherwise mean hundreds of text draws a frame.
    const pad = 2 * k;
    const key = lv * 1e6 + Math.round(k * 10) * 1e4 + Math.round(res * 1000);
    let c = badgeCache.get(key);
    if (!c) {
      if (badgeCache.size > 300) badgeCache.clear();
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil((w + pad * 2) * res));
      c.height = Math.max(1, Math.ceil((h + pad * 2) * res));
      const g = c.getContext('2d');
      g.setTransform(c.width / (w + pad * 2), 0, 0, c.height / (h + pad * 2), pad * c.width / (w + pad * 2), pad * c.height / (h + pad * 2));
      paintBadge(g, 0, 0, w, h, k, lv);
      badgeCache.set(key, c);
    }
    ctx.drawImage(c, x - pad, y - pad, w + pad * 2, h + pad * 2);
    return;
  }
  paintBadge(ctx, x, y, w, h, k, lv);
}
const badgeCache = new Map();

function paintBadge(ctx, x, y, w, h, k, lv) {
  const top = lv >= TUNE.maxLevel;
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
 * scorch of dust under it, so players can see the holes in their maze.
 */
export function drawRubble(ctx, i, kind, w) {
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
