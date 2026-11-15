// Shoppers: five kinds of small cartoon people, drawn side-on in three-quarter view, facing the
// way they walk. Each kind is built from a few shared parts (limbs, head, face) plus its own
// props: trolley, coupons, dad cap and receipt, Karen hair and pointing finger, mobility scooter.
//
// A big wave has well over a hundred shoppers, so each figure is drawn once per pose into a small
// offscreen canvas (a sprite) and then stamped with one drawImage. A pose is: kind, colour
// variant, facing, one of six walking frames or standing, and an "alt" flag for a second
// gesture (dad checking his watch, Karen shouting). Overlays such as the patience bar are drawn
// directly every frame.
import { ST, TUNE, TICK_HZ } from '../sim/index.js';
import { INK, C, rr, paint, box, circle, label, ramp, starPath } from './paint.js';

/** Feet sit this far below the shopper's position, so the figure looks centred on its tile. */
const FEET = 9;
const LEAVE_TICKS = Math.max(1, Math.round(TUNE.leaveSecs * TICK_HZ));
const OUT = 1.8; // outline width on people
const WALK_FRAMES = 6;
const STAND = WALK_FRAMES; // frame index used when not walking
const TAU = Math.PI * 2;

/** The sprite box around the feet, in logical pixels: wide enough for trolleys and scooter flags. */
const BX = -28, BY = -52, BW = 60, BH = 64;

const HUNTER_SHIRTS = ['#3fae49', '#8e44ad', '#ff8c1a', '#2f8fe0', '#e0457b', '#14b8a6'];
const DAD_POLOS = ['#7cc4f0', '#f4a6a0', '#a8d88a', '#f3e3a3'];
const HAIR = ['#5a3a1e', '#2b2118', '#8a5a2b', '#c9a15a', '#3d3d3d'];

/**
 * Per kind: index (for sprite keys), drawing scale, figure height (for the patience bar), walking
 * cadence, number of colour variants.
 */
const KIND = {
  hunter: { n: 0, sc: 1, top: 33, step: 11, vars: HUNTER_SHIRTS.length },
  clipper: { n: 1, sc: 0.82, top: 33, step: 17, vars: 1 },
  dad: { n: 2, sc: 1.05, top: 35, step: 15, vars: DAD_POLOS.length },
  karen: { n: 3, sc: 1.12, top: 37, step: 9, vars: 1 },
  scooter: { n: 4, sc: 1, top: 38, step: 6, vars: 1 },
};

// --- shared body parts ---------------------------------------------------------------------

function limb(ctx, x1, y1, x2, y2, color, w = 3.4) {
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

function shoe(ctx, x, y, color) {
  ctx.beginPath();
  ctx.ellipse(x + 1, y, 2.8, 1.7, 0, 0, TAU);
  paint(ctx, color, 1.4);
}

function head(ctx, x, y, r = 6.8) {
  circle(ctx, x, y, r, C.skin, OUT);
}

/**
 * The face, looking toward +x. mood: 0 angry, 1 unimpressed (dad), 2 shouting (Karen),
 * 3 grumpy pensioner.
 */
function face(ctx, x, y, mood) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x + 1.2, y - 0.4, 1.3, 0, TAU);
  ctx.arc(x + 5, y - 0.4, 1.3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  if (mood === 1) {
    ctx.moveTo(x - 0.8, y - 3); ctx.lineTo(x + 2.6, y - 3);
    ctx.moveTo(x + 3.8, y - 3); ctx.lineTo(x + 6.6, y - 3);
  } else {
    ctx.moveTo(x - 0.8, y - 4); ctx.lineTo(x + 2.4, y - 2.5);
    ctx.moveTo(x + 6.8, y - 4); ctx.lineTo(x + 3.9, y - 2.5);
  }
  ctx.stroke();
  if (mood === 0 || mood === 2) {
    ctx.beginPath();
    ctx.ellipse(x + 3.4, y + 3.3, mood === 2 ? 2.4 : 1.8, mood === 2 ? 2.2 : 1.3, 0, 0, TAU);
    paint(ctx, '#7a1010', 1);
  } else if (mood === 3) {
    ctx.beginPath();
    ctx.moveTo(x + 1.8, y + 3.6); ctx.quadraticCurveTo(x + 3.4, y + 2.4, x + 5.2, y + 3.6);
    ctx.stroke();
  }
}

/** Hair covering the top of a head, with a fringe line just above the eyes. */
function hairCap(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r + 0.6, Math.PI * 0.92, Math.PI * 2.08);
  ctx.quadraticCurveTo(x + 2, y - 5, x - r - 0.4, y + 0.4);
  ctx.closePath();
  paint(ctx, color, OUT);
}

// --- the five kinds ------------------------------------------------------------------------
// Each takes a pose P: { v colour variant, sw leg swing -1..1, moving, alt, ph 0..1 walk phase }.

function hunter(ctx, P) {
  const sw = P.sw;
  limb(ctx, -2.5, -9, -2.5 - sw * 2.6, -1.5, '#3b4a6b');
  shoe(ctx, -2.5 - sw * 2.6, -0.8, '#3a2a20');
  limb(ctx, 2, -9, 2 + sw * 2.6, -1.5, '#46567a');
  shoe(ctx, 2 + sw * 2.6, -0.8, '#3a2a20');
  ctx.beginPath();
  ctx.ellipse(0, -14, 7, 7.5, 0, 0, TAU);
  paint(ctx, HUNTER_SHIRTS[P.v], OUT);
  head(ctx, 1, -25.5);
  hairCap(ctx, 1, -25.5, 6.8, HAIR[P.v % HAIR.length]);
  face(ctx, 1, -24.5, 0);
  // Trolley in front, with a bargain in the basket.
  box(ctx, 11, -20, 7, 6, 1, C.cardboard, 1.4);
  rr(ctx, 8, -15.5, 16, 10, 1.5);
  paint(ctx, '#d3d7e0', OUT);
  ctx.beginPath();
  ctx.moveTo(12, -15); ctx.lineTo(12, -6);
  ctx.moveTo(16, -15); ctx.lineTo(16, -6);
  ctx.moveTo(20, -15); ctx.lineTo(20, -6);
  ctx.moveTo(8.5, -10.5); ctx.lineTo(23.5, -10.5);
  ctx.strokeStyle = '#8b919c'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(9.5, -5.5); ctx.lineTo(10.5, -2.5); ctx.moveTo(21.5, -5.5); ctx.lineTo(20.5, -2.5);
  ctx.moveTo(8, -15.5); ctx.lineTo(5, -16.5);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
  circle(ctx, 11, -2, 2.3, '#333', 1.2);
  circle(ctx, 20, -2, 2.3, '#333', 1.2);
  limb(ctx, 1.5, -15, 5.5, -16, C.skin, 3);
}

function clipper(ctx, P) {
  const sw = P.sw;
  // Speed lines behind her: the coupon expires today.
  if (P.moving) {
    const k = P.ph * 3;
    ctx.beginPath();
    ctx.moveTo(-10 - k, -22); ctx.lineTo(-17 - k, -22);
    ctx.moveTo(-11 - k, -15); ctx.lineTo(-20 - k, -15);
    ctx.moveTo(-10 - k, -8); ctx.lineTo(-16 - k, -8);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  }
  limb(ctx, -2, -8, -2 - sw * 3, -1.5, '#e9c1a0', 2.6);
  shoe(ctx, -2 - sw * 3, -0.8, '#7a2e3a');
  limb(ctx, 2, -8, 2 + sw * 3, -1.5, '#e9c1a0', 2.6);
  shoe(ctx, 2 + sw * 3, -0.8, '#7a2e3a');
  // Skirt and cardigan.
  ctx.beginPath();
  ctx.moveTo(-6, -11); ctx.lineTo(6, -11); ctx.lineTo(7.5, -5.5); ctx.lineTo(-7.5, -5.5);
  ctx.closePath();
  paint(ctx, '#3b4a8a', OUT);
  ctx.beginPath();
  ctx.ellipse(0, -15, 6.5, 6.5, 0, 0, TAU);
  paint(ctx, '#20a39a', OUT);
  // Grey bun, head, hair, glasses.
  circle(ctx, -5, -32.5, 3.6, '#c9cad4', OUT);
  head(ctx, 1, -26, 7);
  hairCap(ctx, 1, -26, 7, '#c9cad4');
  face(ctx, 1, -25, 0);
  ctx.beginPath();
  ctx.arc(2.2, -25.4, 2.5, 0, TAU);
  ctx.moveTo(8.5, -25.4);
  ctx.arc(6, -25.4, 2.5, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.stroke();
  // A fan of coupons held up in front.
  limb(ctx, 1.5, -16, 8.5, -18, '#20a39a', 2.8);
  const wig = Math.sin(P.ph * TAU) * 0.08;
  for (let k = 0; k < 3; k++) {
    ctx.save();
    ctx.translate(10, -19);
    ctx.rotate(-0.55 + k * 0.45 + wig);
    rr(ctx, -2.5, -11, 6, 10, 0.8);
    paint(ctx, k === 1 ? '#ffe14a' : '#ffffff', 1.2);
    ctx.fillStyle = k === 1 ? '#c99a0c' : '#9aa0a6';
    ctx.fillRect(-1, -9, 3, 1);
    ctx.fillRect(-1, -6.5, 3, 1);
    ctx.restore();
  }
  circle(ctx, 9.5, -18, 2, C.skin, 1.2);
}

function dad(ctx, P) {
  const sw = P.sw;
  const checking = P.alt; // lifting his wrist to look at his watch
  if (!checking) limb(ctx, -2, -19, -4.5 - sw, -11, C.skin, 3);
  // Legs: skin, white socks, white trainers.
  const l1 = -2.5 - sw * 3, l2 = 2 + sw * 3;
  limb(ctx, -2.5, -7, l1, -1.5, C.skin, 3.2);
  limb(ctx, 2, -7, l2, -1.5, C.skin, 3.2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(l1 - 1.6, -4, 3.2, 2.5);
  ctx.fillRect(l2 - 1.6, -4, 3.2, 2.5);
  shoe(ctx, l1, -0.8, '#ffffff');
  shoe(ctx, l2, -0.8, '#ffffff');
  // Cargo shorts with side pockets.
  rr(ctx, -6.8, -12, 13.6, 7, 2);
  paint(ctx, '#b8a172', OUT);
  ctx.fillStyle = '#93804f';
  ctx.fillRect(-5.8, -10.5, 3, 3.2);
  ctx.fillRect(3, -10.5, 3, 3.2);
  // Polo shirt over a modest dad belly, white collar, buttons.
  ctx.beginPath();
  ctx.ellipse(1, -16, 8, 6.8, 0, 0, TAU);
  paint(ctx, DAD_POLOS[P.v], OUT);
  ctx.beginPath();
  ctx.moveTo(-1.5, -22.5); ctx.lineTo(1.6, -20); ctx.lineTo(4.8, -22.5); ctx.lineTo(1.6, -23.2);
  ctx.closePath();
  paint(ctx, '#ffffff', 1.2);
  ctx.fillStyle = INK;
  ctx.fillRect(1.1, -19, 1, 1); ctx.fillRect(1.1, -17, 1, 1);
  // Head, moustache, cap with a forward brim.
  head(ctx, 1.5, -28, 6.8);
  face(ctx, 1.5, -27, 1);
  ctx.beginPath();
  ctx.ellipse(5.3, -24.2, 3.3, 1.6, 0, 0, TAU);
  paint(ctx, '#6b4423', 1);
  ctx.beginPath();
  ctx.arc(1.5, -29, 7.3, Math.PI, TAU);
  ctx.closePath();
  paint(ctx, '#22407a', OUT);
  ctx.beginPath();
  ctx.ellipse(8.5, -29.3, 5.5, 1.9, -0.1, 0, TAU);
  paint(ctx, '#1a3263', OUT);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(-0.2, -34, 3.4, 2.4);
  // Receipt held out in front: he has the receipt, he knows his rights.
  limb(ctx, 2.5, -18.5, 8, -15, C.skin, 3);
  ctx.save();
  ctx.translate(9, -16);
  ctx.rotate(0.15 + Math.sin(P.ph * TAU) * 0.06);
  ctx.beginPath();
  ctx.moveTo(-2.5, -3);
  ctx.lineTo(2.5, -3);
  ctx.lineTo(2.5, 10);
  ctx.lineTo(1.25, 9); ctx.lineTo(0, 10); ctx.lineTo(-1.25, 9); ctx.lineTo(-2.5, 10);
  ctx.closePath();
  paint(ctx, C.paper, 1.2);
  ctx.fillStyle = '#a0a4aa';
  ctx.fillRect(-1.5, -1, 3, 0.8); ctx.fillRect(-1.5, 1.5, 3, 0.8); ctx.fillRect(-1.5, 4, 2, 0.8); ctx.fillRect(-1.5, 6.5, 3, 0.8);
  ctx.restore();
  circle(ctx, 8.5, -15.5, 1.9, C.skin, 1.1);
  // Wrist raised across his chest, watch face toward him.
  if (checking) {
    limb(ctx, -1.5, -19, 5, -20.5, C.skin, 3);
    rr(ctx, 3.6, -22.6, 4.2, 3.8, 0.8);
    paint(ctx, '#2b2f34', 1);
    ctx.fillStyle = '#bfe6ff';
    ctx.fillRect(4.6, -21.7, 2.2, 2);
  }
}

function karen(ctx, P) {
  const sw = P.sw;
  limb(ctx, -2.5, -9, -2.5 - sw * 2, -1.5, '#2d2d3a');
  shoe(ctx, -2.5 - sw * 2, -0.8, '#111');
  limb(ctx, 2, -9, 2 + sw * 2, -1.5, '#2d2d3a');
  shoe(ctx, 2 + sw * 2, -0.8, '#111');
  // Back arm with a handbag.
  limb(ctx, -2, -19, -5.5, -12, C.skin, 3);
  ctx.beginPath();
  ctx.moveTo(-9, -12); ctx.quadraticCurveTo(-6.5, -17, -4, -12);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
  box(ctx, -10, -12, 8, 6.5, 1.5, '#7a4a2a', 1.5);
  ctx.beginPath();
  ctx.ellipse(0, -15, 7.6, 7.6, 0, 0, TAU);
  paint(ctx, '#c2307a', OUT);
  // The haircut: a big asymmetric blonde bob, longer at the back, with a swoop over the brow.
  ctx.beginPath();
  ctx.moveTo(-9.5, -20);
  ctx.quadraticCurveTo(-12, -32, -3, -37);
  ctx.quadraticCurveTo(8, -40, 10.5, -30);
  ctx.quadraticCurveTo(11, -26, 9, -24);
  ctx.lineTo(-1, -26);
  ctx.quadraticCurveTo(-1, -21, -5.5, -18.5);
  ctx.closePath();
  paint(ctx, '#f3cf62', OUT);
  head(ctx, 2, -27, 6.6);
  face(ctx, 2, -26, 2);
  ctx.beginPath(); // fringe swoop
  ctx.moveTo(-4.5, -26);
  ctx.quadraticCurveTo(-3, -36, 5, -35);
  ctx.quadraticCurveTo(10.5, -34, 10.5, -28.5);
  ctx.quadraticCurveTo(6, -32, 0, -29.5);
  ctx.closePath();
  paint(ctx, '#f3cf62', OUT);
  ctx.beginPath();
  ctx.moveTo(-5, -31); ctx.quadraticCurveTo(-1, -36, 5, -36);
  ctx.strokeStyle = '#fbe9a8'; ctx.lineWidth = 1.5; ctx.stroke();
  // Sunglasses parked on top.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(1.5, -36.5, 2.2, 1.3, 0, 0, TAU);
  ctx.ellipse(6.2, -36.2, 2.2, 1.3, 0, 0, TAU);
  ctx.fill();
  // The pointing arm. She would like to speak to whoever is in charge of this tile.
  const jab = Math.sin(P.ph * TAU) * 1.2;
  limb(ctx, 2, -19.5, 12 + jab, -23, C.skin, 3.2);
  limb(ctx, 13 + jab, -23.2, 17.5 + jab, -24.6, C.skin, 1.5);
  circle(ctx, 12.8 + jab, -23, 2.3, C.skin, 1.2);
  // Shouting marks in front of the face.
  if (P.alt) {
    ctx.beginPath();
    ctx.arc(9, -27, 4.5, -0.9, 0.2);
    ctx.moveTo(9 + 7.5 * Math.cos(-0.9), -27 + 7.5 * Math.sin(-0.9));
    ctx.arc(9, -27, 7.5, -0.9, 0.2);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke();
  }
}

function scooter(ctx, P) {
  // Safety flag on a whippy pole: the scooter's signature.
  const wv = Math.sin(P.ph * TAU) * 2.5;
  ctx.beginPath();
  ctx.moveTo(-14, -10); ctx.quadraticCurveTo(-15, -28, -17 + wv * 0.3, -45);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-17 + wv * 0.3, -45); ctx.quadraticCurveTo(-11, -44 + wv, -6 + wv, -41.5 + wv * 0.5); ctx.lineTo(-16.5 + wv * 0.3, -38);
  ctx.closePath();
  paint(ctx, '#ff7a1a', 1.3);
  // Seat back.
  box(ctx, -15, -27, 5, 15, 2, '#2b2f34', 1.5);
  // Rider: lavender cardigan, legs forward, white hair, glasses.
  ctx.beginPath();
  ctx.ellipse(-5, -19.5, 6.3, 6.8, 0, 0, TAU);
  paint(ctx, '#8e9ac9', OUT);
  limb(ctx, -3, -13.5, 5.5, -13.5, '#55607a', 3.4);
  limb(ctx, 5.5, -13.5, 6.5, -9, '#55607a', 3.2);
  head(ctx, -3.5, -30.5, 6.4);
  circle(ctx, -8.8, -32, 2.6, '#f1f1f1', 1.2);
  circle(ctx, -6.5, -36, 2.6, '#f1f1f1', 1.2);
  circle(ctx, -9.6, -28, 2.2, '#f1f1f1', 1.2);
  face(ctx, -3.5, -30, 3);
  ctx.beginPath();
  ctx.arc(-2.3, -30.4, 2.3, 0, TAU);
  ctx.moveTo(3.8, -30.4);
  ctx.arc(1.5, -30.4, 2.3, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  // Tiller and handlebar, hands on it.
  limb(ctx, 13, -12, 9.5, -26, '#9aa0a6', 2.2);
  limb(ctx, 7, -26.5, 12, -27.5, '#2b2f34', 2);
  limb(ctx, -2.5, -21, 8, -26, '#8e9ac9', 2.8);
  // Front basket with a baguette.
  ctx.beginPath();
  ctx.ellipse(18, -25, 2, 7, 0.5, 0, TAU);
  paint(ctx, '#e0a85a', 1.2);
  box(ctx, 13.5, -23, 10, 8, 1.5, '#d4d8dc', 1.6);
  ctx.beginPath();
  ctx.moveTo(16.5, -22.5); ctx.lineTo(16.5, -15.5); ctx.moveTo(20, -22.5); ctx.lineTo(20, -15.5);
  ctx.strokeStyle = '#8b919c'; ctx.lineWidth = 1; ctx.stroke();
  // Body: red deck, front cowl, wheels.
  ctx.beginPath();
  ctx.moveTo(9, -10); ctx.lineTo(17, -10); ctx.lineTo(15.5, -17); ctx.lineTo(10.5, -17);
  ctx.closePath();
  paint(ctx, C.red, OUT);
  box(ctx, -16, -11, 32, 7, 3, C.red, OUT);
  ctx.fillStyle = '#ffd34d';
  ctx.fillRect(13, -9, 2.5, 2.5); // headlight
  const spin = P.moving ? P.ph * Math.PI : 0.4;
  wheel(ctx, -10.5, -3, spin);
  wheel(ctx, 11, -3, spin);
  box(ctx, -12, -15, 12, 4, 1.5, '#2b2f34', 1.4); // seat cushion
}

function wheel(ctx, x, y, spin) {
  circle(ctx, x, y, 3.8, '#2b2f34', 1.4);
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(spin) * 2.5, y + Math.sin(spin) * 2.5);
  ctx.lineTo(x - Math.cos(spin) * 2.5, y - Math.sin(spin) * 2.5);
  ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 1.2; ctx.stroke();
}

const DRAW = [hunter, clipper, dad, karen, scooter];

// --- sprite cache ----------------------------------------------------------------------------

const pose = { v: 0, sw: 0, moving: false, alt: false, ph: 0 };

/**
 * Pre-rendered shopper poses. Call setScale() whenever the screen scale changes; sprites are
 * made on first use.
 */
export function createShopperSprites() {
  const map = new Map();
  let scale = 1;

  function setScale(s) {
    if (s !== scale) { scale = s; map.clear(); }
  }

  function get(K, v, face, frame, alt) {
    const key = ((((K.n * 8 + v) * 2 + (face > 0 ? 1 : 0)) * 8 + frame) * 2) + (alt ? 1 : 0);
    let c = map.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(BW * scale));
    c.height = Math.max(1, Math.ceil(BH * scale));
    const g = c.getContext('2d');
    const kx = c.width / BW, ky = c.height / BH;
    g.setTransform(kx, 0, 0, ky, -BX * kx, -BY * ky);
    pose.v = v;
    pose.moving = frame !== STAND;
    pose.ph = pose.moving ? frame / WALK_FRAMES : 0;
    pose.sw = pose.moving ? Math.sin(pose.ph * TAU) : 0;
    pose.alt = alt;
    g.scale(face * K.sc, K.sc);
    if (pose.moving && K.n !== 4) g.rotate(0.07); // lean into the walk (scooters do not lean)
    DRAW[K.n](g, pose);
    map.set(key, c);
    return c;
  }

  return { setScale, get };
}

// --- overlays ------------------------------------------------------------------------------

function patienceBar(ctx, x, y, f) {
  ctx.fillStyle = INK;
  ctx.fillRect(x - 12, y - 2.5, 24, 5);
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(x - 11, y - 1.5, 22, 3);
  ctx.fillStyle = ramp(f);
  ctx.fillRect(x - 11, y - 1.5, 22 * Math.max(0, Math.min(1, f)), 3);
}

/** A thought bubble: the shopper has stopped for a sample or a bargain. */
function thought(ctx, x, y, glyph) {
  circle(ctx, x - 6, y + 9, 1.6, '#ffffff', 1);
  circle(ctx, x - 3, y + 5.5, 2.4, '#ffffff', 1.2);
  ctx.beginPath();
  ctx.ellipse(x + 3, y - 2, 8, 6.5, 0, 0, TAU);
  paint(ctx, '#ffffff', 1.6);
  label(ctx, glyph, x + 3, y - 1.5, 10, '#e0457b', null);
}

/** Dizzy stars circling a shopper lying on the floor. */
function stars(ctx, x, y, t) {
  for (let k = 0; k < 3; k++) {
    const a = t * 5 + (k * TAU) / 3;
    starPath(ctx, x + Math.cos(a) * 8, y + Math.sin(a) * 3, 3.2, a);
    paint(ctx, '#ffe14a', 1.1);
  }
}

/**
 * A grey poof of steam over someone storming out, growing as they fade (the speech blip from the
 * 'left' event carries the words).
 */
function puff(ctx, x, y, k) {
  const r = 4 + k * 5;
  for (let j = 0; j < 3; j++) {
    const px = x + (j - 1) * r * 1.1, py = y - (j === 1 ? r * 0.6 : 0);
    ctx.beginPath();
    ctx.arc(px, py, r * (j === 1 ? 0.95 : 0.75), 0, TAU);
    paint(ctx, '#d6d9de', 1.4);
  }
}

/** Adds this shopper's ground shadow to the current path (all shadows are filled at once). */
export function shadowPath(ctx, s, sx, sy) {
  const K = KIND[s.k] || KIND.hunter;
  const rx = (s.k === 'scooter' ? 18 : 9) * K.sc;
  ctx.moveTo(sx + rx, sy + FEET);
  ctx.ellipse(sx, sy + FEET, rx, 3.5, 0, 0, TAU);
}

/**
 * Draws one shopper.
 * @param {number} sx screen x of the shopper's position (tile decimals * TILE, already interpolated)
 * @param {number} face 1 facing right, -1 facing left
 * @param {Object} sprites from createShopperSprites()
 */
export function drawShopper(ctx, s, sx, sy, face, F, sprites) {
  const K = KIND[s.k] || KIND.hunter;
  const leaving = s.st === ST.LEAVE;
  const stunned = s.st === ST.STUN;
  const moving = (s.vx !== 0 || s.vy !== 0) && !leaving && !stunned;
  const ph = F.time * K.step + s.id * 1.7; // walking cycle, radians
  const frame = moving ? ((((ph / TAU) % 1) * WALK_FRAMES) | 0) : STAND;
  let alt = false;
  if (s.k === 'dad') {
    // Every few seconds he checks his watch; much more often when nearly out of patience.
    const f = s.mhp > 0 ? s.hp / s.mhp : 1;
    alt = (F.time * (f < 0.4 ? 1.6 : 0.8) + s.id * 0.37) % 3 < 1.3;
  } else if (s.k === 'karen') {
    alt = ((F.time * 2.5 + s.id) | 0) % 2 === 0;
  }
  const v = K.vars > 1 ? s.id % K.vars : 0;
  const img = sprites.get(K, v, face, frame, alt);
  const fy = sy + FEET;

  if (leaving) {
    const fade = Math.max(0, Math.min(1, (s.t - F.alpha) / LEAVE_TICKS));
    ctx.globalAlpha = fade;
    ctx.drawImage(img, sx + BX + Math.sin(F.time * 60) * 1.2, fy + BY, BW, BH); // shaking with rage
    ctx.globalAlpha = Math.min(1, fade * 1.6);
    puff(ctx, sx, fy - K.top * K.sc - 4 - (1 - fade) * 10, 1 - fade);
    ctx.globalAlpha = 1;
    return;
  }
  if (stunned) {
    // Flat on his back, feet toward where he was going, stars round his head.
    ctx.save();
    ctx.translate(sx - face * 2, fy - 3);
    ctx.rotate(-face * Math.PI * 0.47);
    ctx.drawImage(img, BX, BY + 14, BW, BH);
    ctx.restore();
    stars(ctx, sx - face * 16, fy - 10, F.time);
  } else {
    const bob = moving ? Math.abs(Math.cos(frame / WALK_FRAMES * TAU)) * 1.3 : 0;
    ctx.drawImage(img, sx + BX, fy + BY - bob, BW, BH);
  }
  const top = fy - K.top * K.sc;
  if (s.st === ST.BROWSE) thought(ctx, sx + 10, top - 10, s.k === 'clipper' ? '%' : '$');
  if (s.k === 'dad' || s.hp < s.mhp - 0.01) patienceBar(ctx, sx, top - 4, s.hp / s.mhp);
}
