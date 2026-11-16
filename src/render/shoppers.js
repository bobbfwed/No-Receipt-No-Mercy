// Shoppers: nine kinds of small cartoon people, drawn side-on in three-quarter view, facing the
// way they walk. Each kind is built from a few shared parts (limbs, head, face) plus its own
// props: trolley, coupons, dad cap and receipt, Karen hair and pointing finger, mobility scooter,
// hoodie and slushie, mom's trolley with a child in the seat, guide dog and white cane, the gym
// bro's boxed TV. A mom's runaway child is a separate little figure (drawKid).
//
// A big wave has well over a hundred shoppers, so each figure is drawn once per pose into a small
// offscreen canvas (a sprite) and then stamped with one drawImage. A pose is: kind, colour
// variant, facing, one of six walking frames, standing or lying down, and an "alt" flag for a
// second gesture (dad checking his watch, Karen shouting, mom chasing her child, the guide dog
// bolting). Overlays such as the patience bar are drawn directly every frame.
import { ST, TUNE, TICK_HZ } from '../sim/index.js';
import { INK, C, rr, paint, box, circle, label, ramp, starPath } from './paint.js';

/** Feet sit this far below the shopper's position, so the figure looks centred on its tile. */
const FEET = 9;
const LEAVE_TICKS = Math.max(1, Math.round(TUNE.leaveSecs * TICK_HZ));
const OUT = 1.8; // outline width on people
const WALK_FRAMES = 6;
const STAND = WALK_FRAMES; // frame index used when not walking
const DOWN = WALK_FRAMES + 1; // lying on the floor: kinds with `down` leave out loose props (the dog)
const TAU = Math.PI * 2;

/** The sprite box around the feet, in logical pixels: wide enough for trolleys and scooter flags. */
const BX = -28, BY = -52, BW = 60, BH = 64;

const HUNTER_SHIRTS = ['#3fae49', '#8e44ad', '#ff8c1a', '#2f8fe0', '#e0457b', '#14b8a6'];
const DAD_POLOS = ['#7cc4f0', '#f4a6a0', '#a8d88a', '#f3e3a3'];
const HAIR = ['#5a3a1e', '#2b2118', '#8a5a2b', '#c9a15a', '#3d3d3d'];
const HOODIES = ['#59606b', '#2b2f36', '#b0303a', '#2f7d4f'];
const MOM_TOPS = ['#9b59b6', '#e67e5a', '#16a085', '#e84393'];
const MOM_HAIR = ['#8a5a2b', '#2b2118', '#c9a15a', '#5a3a1e'];
const TANKS = ['#ffffff', '#ff3d7f', '#39d353', '#ffd23f'];
const DOG = '#e2b15f', DOG_DARK = '#b8873a', VEST = '#f4e04d';
const KID_HAIR = '#e07b24';

/**
 * Per kind: index (for sprite keys), drawing scale, figure height (for the patience bar), walking
 * cadence, number of colour variants. Optional: `box` sprite box [x, y, w, h] when the default
 * one is too small (drawn for facing right; mirrored for left), `still` no walking lean (the
 * drawing leans by itself, or not at all), `down` has its own lying-down pose.
 */
const KIND = {
  hunter: { n: 0, sc: 1, top: 33, step: 11, vars: HUNTER_SHIRTS.length, crown: [1, -32] },
  clipper: { n: 1, sc: 0.82, top: 33, step: 17, vars: 1, crown: [1.5, -33] },
  dad: { n: 2, sc: 1.05, top: 35, step: 15, vars: DAD_POLOS.length, crown: [1.5, -36] },
  karen: { n: 3, sc: 1.12, top: 37, step: 9, vars: 1, crown: [2.5, -38.5] },
  scooter: { n: 4, sc: 1, top: 38, step: 6, vars: 1, still: true, crown: [-3.5, -37.5] },
  teen: { n: 5, sc: 1, top: 34, step: 7, vars: HOODIES.length, crown: [1.4, -33.5] },
  mom: { n: 6, sc: 1, top: 37, step: 11, vars: MOM_TOPS.length, crown: [1.5, -32.5] },
  blind: { n: 7, sc: 1, top: 35, step: 9, vars: 1, still: true, down: true, box: [-30, -52, 88, 64], crown: [1.5, -33] },
  gymbro: { n: 8, sc: 1.08, top: 38, step: 13, vars: TANKS.length, box: [-31, -52, 63, 64], crown: [1.8, -34.5] },
};
/**
 * Super shoppers are drawn this much bigger, with a gold outline and glow and a crown, so they
 * stand out in a crowd. SUP_PAD is the extra room round the sprite for the glow.
 */
export const SUP_SCALE = 1.3;
const SUP_PAD = 4;
const GOLD = '#ffd23f';
/** Not shoppers, but drawn with the same sprite cache: a mom's runaway child, a sitting guide dog. */
const KID = { n: 9, sc: 1, top: 22, step: 24, vars: 1, box: [-20, -32, 40, 40] };
const DOGSIT = { n: 10, sc: 1, top: 24, step: 1, vars: 1, box: [-16, -30, 32, 36] };
for (const K of [...Object.values(KIND), KID, DOGSIT]) {
  const b = K.box || [BX, BY, BW, BH];
  K.bx = b[0]; K.by = b[1]; K.bw = b[2]; K.bh = b[3];
}
/** Left edge of a kind's sprite box for a facing (the box is mirrored for facing left). */
const boxX = (K, face) => (face > 0 ? K.bx : -(K.bx + K.bw));

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
  trolley(ctx);
  limb(ctx, 1.5, -15, 5.5, -16, C.skin, 3);
}

/** A shopping trolley in front of the shopper (contents are drawn first, so they sit inside). */
function trolley(ctx) {
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

/** White speed lines trailing behind someone in a hurry (x is where they start). */
function speedLines(ctx, x, y, ph, len = 8, gap = 7) {
  const k = ph * 3;
  ctx.beginPath();
  for (let j = 0; j < 3; j++) {
    const l = j === 1 ? len + 3 : len;
    ctx.moveTo(x - k - (j === 1 ? 1 : 0), y + j * gap);
    ctx.lineTo(x - k - l, y + j * gap);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
}

/** A giant slushie: red and white cup, dome of blue slush, a straw. (x, y) is the cup's base. */
function slushie(ctx, x, y) {
  ctx.beginPath();
  ctx.moveTo(x + 0.8, y - 13); ctx.lineTo(x + 2.4, y - 20.5); ctx.lineTo(x + 5, y - 21.5);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 3.2; ctx.stroke();
  ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y - 12.5, 5.2, 3.8, 0, Math.PI, TAU);
  ctx.closePath();
  paint(ctx, '#3fc6ff', 1.3);
  ctx.beginPath();
  ctx.moveTo(x - 3.3, y); ctx.lineTo(x + 3.3, y); ctx.lineTo(x + 5.2, y - 12.5); ctx.lineTo(x - 5.2, y - 12.5);
  ctx.closePath();
  paint(ctx, '#e8303a', 1.4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 3.9, y - 8.6, 7.8, 2.8);
}

function teen(ctx, P) {
  const sw = P.sw;
  const hood = HOODIES[P.v];
  // Skinny jeans, big white trainers, a shuffle rather than a walk.
  limb(ctx, -2.5, -9, -2.5 - sw * 2, -1.5, '#2c3e66', 3);
  shoe(ctx, -2.5 - sw * 2, -0.8, '#f4f4f4');
  limb(ctx, 2, -9, 2 + sw * 2, -1.5, '#34497a', 3);
  shoe(ctx, 2 + sw * 2, -0.8, '#f4f4f4');
  limb(ctx, -2, -18, -6.5, -12, hood, 3.2);
  // Hoodie, slouched, with the front pouch.
  ctx.beginPath();
  ctx.ellipse(0, -14, 7.4, 7.8, 0, 0, TAU);
  paint(ctx, hood, OUT);
  rr(ctx, -0.5, -13.5, 6.5, 4, 1.5);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();
  // The giant slushie, swinging a little in the back hand.
  slushie(ctx, -9 + sw * 0.6, -6);
  circle(ctx, -6.4 + sw * 0.4, -11.8, 1.9, C.skin, 1.1);
  // Hood up: the head sits low and forward inside it.
  const hx = 3.4, hy = -24.2;
  circle(ctx, 1.4, -25.4, 8.2, hood, OUT);
  ctx.beginPath();
  ctx.arc(hx, hy, 6.6, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  head(ctx, hx, hy, 5.7);
  hairCap(ctx, hx, hy, 5.7, '#2b2118');
  ctx.beginPath(); // emo fringe swept across
  ctx.moveTo(hx - 1, hy - 5.4);
  ctx.quadraticCurveTo(hx + 4.5, hy - 5.2, hx + 6.4, hy - 1.2);
  ctx.lineTo(hx + 3.6, hy - 2.4);
  ctx.closePath();
  paint(ctx, '#2b2118', 1);
  // Lit up by the phone, eyes down on it, not here.
  ctx.beginPath();
  ctx.ellipse(hx + 4, hy + 1.6, 2.8, 3.4, 0, 0, TAU);
  ctx.fillStyle = 'rgba(150,225,255,0.45)';
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(hx + 1.5, hy + 0.6, 1.25, 0, Math.PI);
  ctx.closePath();
  ctx.moveTo(hx + 5.9, hy + 0.6);
  ctx.arc(hx + 4.7, hy + 0.6, 1.25, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - 0.1, hy + 0.6); ctx.lineTo(hx + 3, hy + 0.6);
  ctx.moveTo(hx + 3.4, hy + 0.6); ctx.lineTo(hx + 6.2, hy + 0.6);
  ctx.moveTo(hx + 2.6, hy + 3.7); ctx.lineTo(hx + 4.8, hy + 3.4);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.stroke();
  // Hoodie strings.
  ctx.beginPath();
  ctx.moveTo(4.6, -17.6); ctx.lineTo(5, -14);
  ctx.moveTo(7, -17.8); ctx.lineTo(7.6, -14.6);
  ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 1.2; ctx.stroke();
  // Phone held out at chest height, its glow lighting his face.
  limb(ctx, 1, -15.5, 10.4, -15.4, hood, 3.2);
  ctx.beginPath();
  ctx.moveTo(10.6, -22); ctx.lineTo(10.6, -16.5); ctx.lineTo(6.5, -20.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(160,230,255,0.35)';
  ctx.fill();
  box(ctx, 10.4, -22.6, 3, 6.8, 0.8, '#2b2f34', 1.1);
  ctx.fillStyle = '#9fe3ff';
  ctx.fillRect(10.6, -22, 1.1, 5.6);
  circle(ctx, 11.6, -15.6, 1.9, C.skin, 1.1);
}

function mom(ctx, P) {
  const chase = P.alt; // her child has escaped: she sprints after him, shouting
  const sw = P.sw * (chase ? 1.4 : 1);
  if (chase && P.moving) speedLines(ctx, -10, -23, P.ph, 8, 7.5);
  if (chase) ctx.rotate(0.14);
  limb(ctx, -2.5, -8.5, -2.5 - sw * 2.8, -1.5, '#2b2b38', 3);
  shoe(ctx, -2.5 - sw * 2.8, -0.8, '#f4f4f4');
  limb(ctx, 2, -8.5, 2 + sw * 2.8, -1.5, '#383846', 3);
  shoe(ctx, 2 + sw * 2.8, -0.8, '#f4f4f4');
  // Top, and the enormous bag every mom carries.
  ctx.beginPath();
  ctx.ellipse(0, -14.5, 6.8, 7, 0, 0, TAU);
  paint(ctx, MOM_TOPS[P.v], OUT);
  ctx.beginPath();
  ctx.moveTo(-1.5, -21); ctx.lineTo(-5, -12);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
  box(ctx, -10, -13, 7.5, 7, 2, '#8a5a2b', 1.5);
  // Messy bun, frazzled strands.
  const hair = MOM_HAIR[P.v];
  circle(ctx, -3.2, -33.2, 3.6, hair, OUT);
  head(ctx, 1, -25.5, 6.6);
  hairCap(ctx, 1, -25.5, 6.6, hair);
  ctx.beginPath();
  ctx.moveTo(-5.5, -35.5); ctx.quadraticCurveTo(-8.5, -38, -7, -40);
  ctx.moveTo(-1.5, -36); ctx.quadraticCurveTo(0, -39.5, 2, -38.5);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.stroke();
  if (chase) {
    face(ctx, 1, -24.5, 2);
    circle(ctx, 8.5, -31, 1.4, '#9fe3ff', 0.9); // sweat
  } else {
    face(ctx, 1, -24.5, 1);
    ctx.beginPath(); // tired eyes, flat mouth: she has had a day
    ctx.moveTo(1.3, -22.9); ctx.quadraticCurveTo(2.2, -22.1, 3.2, -22.9);
    ctx.moveTo(5, -22.9); ctx.quadraticCurveTo(6, -22.1, 7, -22.9);
    ctx.moveTo(3.2, -20.6); ctx.lineTo(5.8, -20.6);
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  }
  // The child in the trolley seat, reaching for things; an empty seat when he is loose.
  box(ctx, 16.5, -21, 6, 5.5, 1, '#ffd23f', 1.2); // cereal
  ctx.fillStyle = C.red;
  ctx.fillRect(17.5, -19.5, 4, 1.4);
  if (!chase) {
    limb(ctx, 13, -17, 16, -24, C.skin, 1.8);
    ctx.beginPath();
    ctx.ellipse(11.5, -16.2, 3.4, 2.6, 0, 0, TAU);
    paint(ctx, '#ffd23f', 1.2);
    kidHead(ctx, 12, -20.8, 3.9, 0);
  }
  trolley(ctx);
  box(ctx, 8.8, -15.2, 5, 3.4, 1, chase ? '#d9372b' : '#b8252b', 1.1); // child seat flap
  limb(ctx, 1.5, -16, 5.5, -16.5, C.skin, 3);
  if (chase) {
    // Arm flung forward, reaching for him.
    limb(ctx, 2, -19, 9, -24, C.skin, 2.8);
    circle(ctx, 9.6, -24.6, 1.8, C.skin, 1.1);
  }
}

/** The child's head: ginger mop, big eyes, open grin (mood 1: tongue out). */
function kidHead(ctx, x, y, r, mood) {
  // Spiky ginger tufts.
  ctx.beginPath();
  ctx.moveTo(x - r, y - 1);
  ctx.lineTo(x - r * 0.9, y - r * 1.45);
  ctx.lineTo(x - r * 0.3, y - r * 1.05);
  ctx.lineTo(x + r * 0.15, y - r * 1.6);
  ctx.lineTo(x + r * 0.5, y - r * 1.0);
  ctx.lineTo(x + r * 1.1, y - r * 1.3);
  ctx.lineTo(x + r, y - 1);
  ctx.closePath();
  paint(ctx, KID_HAIR, 1.2);
  circle(ctx, x, y, r, C.skin, 1.4);
  ctx.beginPath();
  ctx.arc(x, y, r + 0.3, Math.PI * 1.02, Math.PI * 1.9);
  ctx.quadraticCurveTo(x, y - r * 0.7, x - r - 0.2, y);
  ctx.closePath();
  paint(ctx, KID_HAIR, 1);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x + r * 0.25, y - 0.2, r * 0.22, 0, TAU);
  ctx.arc(x + r * 0.85, y - 0.2, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.55, y + r * 0.35, r * 0.42, 0, Math.PI);
  ctx.closePath();
  paint(ctx, '#7a1010', 0.9);
  if (mood === 1) {
    ctx.beginPath();
    ctx.ellipse(x + r * 0.62, y + r * 0.85, r * 0.26, r * 0.36, 0, 0, TAU);
    paint(ctx, '#ff6b8a', 0.8);
  }
}

/** A mom's runaway child: arms in the air, very fast. alt: stopped, waiting to be caught. */
function kid(ctx, P) {
  const sw = P.sw * 1.5;
  if (P.moving) speedLines(ctx, -7, -17, P.ph, 6, 5.5);
  limb(ctx, -1.5, -5, -1.5 - sw * 2.2, -1.2, '#3b5fa8', 2.2);
  shoe(ctx, -1.5 - sw * 2.2, -0.7, '#e8303a');
  limb(ctx, 1.5, -5, 1.5 + sw * 2.2, -1.2, '#4468b5', 2.2);
  shoe(ctx, 1.5 + sw * 2.2, -0.7, '#e8303a');
  const wv = P.moving ? Math.sin(P.ph * TAU * 2) * 1.5 : 0;
  limb(ctx, -1.5, -10, -5, -17 + wv, C.skin, 1.9);
  // Striped T-shirt.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -8.5, 4.4, 4.6, 0, 0, TAU);
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = C.red;
  ctx.fillRect(-5, -11.5, 10, 1.6);
  ctx.fillRect(-5, -8.5, 10, 1.6);
  ctx.fillRect(-5, -5.5, 10, 1.6);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, -8.5, 4.4, 4.6, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
  kidHead(ctx, 1, -16, 4.6, P.alt ? 1 : 0);
  limb(ctx, 1.8, -10, 5.5, -18 - wv, C.skin, 1.9);
  circle(ctx, -5, -17.4 + wv, 1.4, C.skin, 1);
  circle(ctx, 5.5, -18.4 - wv, 1.4, C.skin, 1);
}

/**
 * A guide dog in a hi-vis harness, facing +x, body centred at x. run: stretched out at a full
 * gallop. Returns nothing; the harness handle meets the body at (x + 0.5, top of the back).
 */
function guideDog(ctx, x, P, run) {
  const sw = P.sw;
  const by = run ? -11 : -9.5; // body centre
  const rx = run ? 10.5 : 8.5, ry = run ? 4 : 4.6;
  if (run) {
    limb(ctx, x - 9, by - 1, x - 16, by - 3.5 + sw, DOG, 2.2); // tail straight out
    limb(ctx, x - 5, by + 1.5, x - 11.5 - sw, by + 8.5, DOG_DARK, 2.2);
    limb(ctx, x + 5, by + 1.5, x + 11.5 + sw, by + 8, DOG_DARK, 2.2);
    limb(ctx, x - 6.5, by + 2, x - 13.5 + sw, by + 9.5, DOG, 2.4);
    limb(ctx, x + 6.5, by + 2, x + 13.5 - sw, by + 9, DOG, 2.4);
  } else {
    const wag = Math.sin(P.ph * TAU * 2) * 1.5;
    limb(ctx, x - 7.5, by - 1.5, x - 11 + wag * 0.3, by - 6 + wag, DOG, 2.2);
    limb(ctx, x - 4.5, by + 2.5, x - 4.5 + sw * 2, -1, DOG_DARK, 2.2);
    limb(ctx, x + 5, by + 2.5, x + 5 - sw * 2, -1, DOG_DARK, 2.2);
    limb(ctx, x - 5.5, by + 2.5, x - 5.5 - sw * 2, -1, DOG, 2.4);
    limb(ctx, x + 4, by + 2.5, x + 4 + sw * 2, -1, DOG, 2.4);
  }
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, by, rx, ry, 0, 0, TAU);
  ctx.fillStyle = DOG;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = VEST;
  ctx.fillRect(x - 3, by - 6, 7, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 3, by - 1, 7, 1.6);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(x, by, rx, ry, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = OUT; ctx.stroke();
  // Head: forward and low when running, ears flying, tongue out.
  const hx = x + (run ? 12 : 9.5), hy = run ? by - 1.5 : by - 5;
  ctx.beginPath();
  ctx.ellipse(hx + 3.6, hy + 1.4, 2.9, 2.1, 0, 0, TAU);
  paint(ctx, DOG, 1.4);
  circle(ctx, hx, hy, 4.1, DOG, 1.6);
  if (run) {
    ctx.beginPath();
    ctx.ellipse(hx + 4.4, hy + 3.8, 1.2, 2, 0.3, 0, TAU);
    paint(ctx, '#ff6b8a', 0.8);
  }
  circle(ctx, hx + 6.3, hy + 0.7, 1.2, INK, 0);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(hx + 1.6, hy - 1, 0.9, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  if (run) ctx.ellipse(hx - 3.6, hy - 1.8, 3.6, 1.6, -0.25, 0, TAU);
  else ctx.ellipse(hx - 1.4, hy + 0.8, 1.8, 3.4, 0.25, 0, TAU);
  paint(ctx, DOG_DARK, 1.2);
}

function blind(ctx, P) {
  const bolt = P.alt; // the dog has bolted and is dragging him along
  const sw = P.sw;
  const lean = bolt ? -0.3 : P.moving ? 0.07 : 0;
  const cs = Math.cos(lean), sn = Math.sin(lean);
  const lhx = bolt ? 12.5 : 9.5, lhy = bolt ? -19 : -15.5; // his front hand, before the lean
  const hX = lhx * cs - lhy * sn, hY = lhx * sn + lhy * cs;
  const dogX = bolt ? 31 : 22;
  if (!P.down) guideDog(ctx, dogX, P, bolt);
  if (bolt && P.moving) speedLines(ctx, -11, -27, P.ph, 9, 8);
  ctx.save();
  ctx.rotate(lean);
  const jacket = '#7a6a4f';
  if (bolt) {
    // Heels dug in, both feet out in front.
    limb(ctx, -2.5, -9, 3 + sw, -1.5, '#5d6470');
    shoe(ctx, 3 + sw, -0.8, '#3a2a20');
    limb(ctx, 2, -9, 7 - sw, -1.5, '#6b7380');
    shoe(ctx, 7 - sw, -0.8, '#3a2a20');
  } else {
    limb(ctx, -2.5, -9, -2.5 - sw * 2.4, -1.5, '#5d6470');
    shoe(ctx, -2.5 - sw * 2.4, -0.8, '#3a2a20');
    limb(ctx, 2, -9, 2 + sw * 2.4, -1.5, '#6b7380');
    shoe(ctx, 2 + sw * 2.4, -0.8, '#3a2a20');
  }
  ctx.beginPath();
  ctx.ellipse(0, -15, 7.2, 7.6, 0, 0, TAU);
  paint(ctx, jacket, OUT);
  ctx.beginPath(); // lapel
  ctx.moveTo(2.5, -22); ctx.lineTo(4.5, -16); ctx.lineTo(6.5, -20.5);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  // Head: grey hair, round black glasses.
  const x = 1.5, y = -26.5;
  head(ctx, x, y, 6.6);
  hairCap(ctx, x, y, 6.6, '#b9bcc2');
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x + 1.4, y - 0.2, 2.5, 0, TAU);
  ctx.moveTo(x + 7.9, y - 0.2);
  ctx.arc(x + 5.4, y - 0.2, 2.5, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 1, y - 0.6); ctx.lineTo(x - 5.5, y - 1.4);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 0.4, y - 1.6, 1.1, 1.1);
  ctx.fillRect(x + 4.4, y - 1.6, 1.1, 1.1);
  if (bolt) {
    ctx.beginPath();
    ctx.ellipse(x + 3.6, y + 3.6, 1.6, 2.1, 0, 0, TAU);
    paint(ctx, '#7a1010', 1);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + 1.8, y + 3.2); ctx.quadraticCurveTo(x + 3.6, y + 4.6, x + 5.4, y + 3);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke();
  }
  // White cane with a red tip: tapping the floor ahead, or waved in the air while dragged.
  const cx1 = bolt ? -7 : -4.5, cy1 = bolt ? -27 : -12.5;
  limb(ctx, -2, -19.5, cx1, cy1, jacket, 3);
  const cx2 = bolt ? -15 : 5.5 + sw * 1.5, cy2 = bolt ? -40 : -0.5;
  limb(ctx, cx1, cy1, cx2, cy2, '#ffffff', 1.6);
  limb(ctx, cx1 + (cx2 - cx1) * 0.82, cy1 + (cy2 - cy1) * 0.82, cx2, cy2, '#e8303a', 1.6);
  circle(ctx, cx1, cy1, 1.9, C.skin, 1.1);
  // Front arm out to the harness handle.
  limb(ctx, 2, -19.5, lhx, lhy, jacket, 3);
  ctx.restore();
  if (!P.down) {
    // The harness handle: a short rigid bar, or a taut strap when the dog is off.
    const ax = dogX + 0.5, ay = (bolt ? -11 : -9.5) - (bolt ? 3.6 : 4.2);
    ctx.beginPath();
    ctx.moveTo(hX, hY);
    ctx.lineTo(ax, ay);
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 3.6; ctx.stroke();
    ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 1.6; ctx.stroke();
  }
  circle(ctx, hX, hY, 2, C.skin, 1.2);
}

/** The guide dog sitting by its fallen owner, waiting. */
function dogSit(ctx) {
  limb(ctx, -5, -2, -11, -1.2, DOG, 2.2);
  ctx.beginPath();
  ctx.ellipse(-2.5, -5, 5.5, 4.5, 0, 0, TAU);
  paint(ctx, DOG, OUT);
  limb(ctx, 2, -7, 2.5, -1, DOG_DARK, 2.2);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(1, -10.5, 4.4, 7, 0.35, 0, TAU);
  ctx.fillStyle = DOG;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = VEST;
  ctx.fillRect(-4, -14, 9, 6);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(1, -10.5, 4.4, 7, 0.35, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = OUT; ctx.stroke();
  limb(ctx, 3.5, -7, 4, -1, DOG, 2.4);
  const hx = 4, hy = -19;
  ctx.beginPath();
  ctx.ellipse(hx + 3.6, hy + 1.4, 2.9, 2.1, 0, 0, TAU);
  paint(ctx, DOG, 1.4);
  circle(ctx, hx, hy, 4.1, DOG, 1.6);
  circle(ctx, hx + 6.3, hy + 0.7, 1.2, INK, 0);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(hx + 1.6, hy - 1, 0.9, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hx - 1.4, hy + 0.8, 1.8, 3.4, 0.25, 0, TAU);
  paint(ctx, DOG_DARK, 1.2);
}

/** A word printed on a box, kept readable when the sprite is mirrored (flip = facing). */
function print(ctx, str, x, y, size, color, flip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);
  label(ctx, str, 0, 0, size, color, null);
  ctx.restore();
}

/** The gym bro's purchase, on his shoulder: a boxed TV (0) or a rowing machine (1). */
function carton(ctx, kind, flip) {
  if (kind === 0) {
    // Black box with a picture of the telly on the side the world can see.
    box(ctx, -13, -8, 26, 15, 1.5, '#23272e', 1.8);
    box(ctx, -11, -5.5, 14, 10, 1, '#4fb3ff', 1.2);
    ctx.fillStyle = '#bfe6ff';
    ctx.fillRect(-9.5, -4, 5, 1.6);
    print(ctx, 'TV', -4, 0.6, 6.5, '#ffffff', flip);
    ctx.fillStyle = '#ff3d3d';
    ctx.fillRect(-12, -7.2, 5, 2.2);
  } else {
    box(ctx, -13, -8, 26, 15, 1.5, C.cardboard, 1.8);
    ctx.fillStyle = C.cardboardLight;
    ctx.fillRect(-1.5, -7.2, 3, 13.4);
    // A rowing machine drawn on the side: rail, seat, flywheel.
    ctx.beginPath();
    ctx.moveTo(-10, 3.5); ctx.lineTo(9, -1);
    ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath();
    ctx.arc(8.5, -1.5, 2.6, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#3a2a20';
    ctx.fillRect(-6, -0.6, 4, 1.8);
    print(ctx, 'ROW', -6.5, -4.5, 5, '#3a2a20', flip);
  }
}

function gymbro(ctx, P) {
  const sw = P.sw;
  // Tiny legs: he skips leg day.
  limb(ctx, -2, -6.5, -2 - sw * 1.6, -1.5, C.skin, 2.3);
  shoe(ctx, -2 - sw * 1.6, -0.8, '#2b2f34');
  limb(ctx, 2, -6.5, 2 + sw * 1.6, -1.5, C.skin, 2.3);
  shoe(ctx, 2 + sw * 1.6, -0.8, '#2b2f34');
  box(ctx, -4.6, -10, 9.2, 4.5, 1.5, '#2b2f36', 1.5);
  // The box resting on his back shoulder, behind his head, his arm reaching back to steady it.
  ctx.save();
  ctx.translate(-11.5, -28.5);
  ctx.rotate(0.12);
  carton(ctx, P.v % 2, P.face);
  ctx.restore();
  limb(ctx, -8, -19.5, -15.5, -21, C.skin, 4.6);
  circle(ctx, -16.5, -21.8, 2.6, C.skin, 1.2);
  // Torso: a wedge of muscle, tank top over it.
  ctx.beginPath();
  ctx.moveTo(-4, -8);
  ctx.lineTo(4, -8);
  ctx.lineTo(11.5, -20.5);
  ctx.quadraticCurveTo(0, -29, -11.5, -20.5);
  ctx.closePath();
  paint(ctx, C.skin, OUT);
  ctx.beginPath();
  ctx.moveTo(-3.6, -8.4);
  ctx.lineTo(3.6, -8.4);
  ctx.lineTo(7, -19);
  ctx.lineTo(5.4, -24);
  ctx.lineTo(3.6, -24.2);
  ctx.quadraticCurveTo(1, -18.5, -1.8, -24.2);
  ctx.lineTo(-3.8, -24);
  ctx.lineTo(-7, -19);
  ctx.closePath();
  paint(ctx, TANKS[P.v], 1.5);
  ctx.beginPath(); // pecs
  ctx.moveTo(-4.5, -16.5); ctx.quadraticCurveTo(-1, -14.5, 1, -17);
  ctx.moveTo(1, -17); ctx.quadraticCurveTo(3, -14.5, 5.8, -16.5);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.1; ctx.stroke();
  // Small head on a thick neck, buzz cut, smug grin.
  const x = 1.8, y = -29.5;
  box(ctx, -1.5, -28, 6.5, 4, 1.5, C.skin, 0);
  head(ctx, x, y, 5.2);
  ctx.beginPath();
  ctx.arc(x, y, 5.6, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  paint(ctx, '#3a2a1e', 1.2);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x + 1.1, y - 0.2, 1.05, 0, TAU);
  ctx.arc(x + 4, y - 0.2, 1.05, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 0.8, y - 2.6); ctx.lineTo(x + 2.2, y - 2);
  ctx.moveTo(x + 3, y - 2); ctx.lineTo(x + 5.8, y - 2.6);
  ctx.moveTo(x + 0.6, y + 2.2); ctx.quadraticCurveTo(x + 3, y + 4.2, x + 5.4, y + 1.4);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.stroke();
  // Front arm: boulder shoulder, bicep, fist.
  const fx = 13.5 + sw * 1.2, fy = -9.5;
  limb(ctx, 8.5, -18, 10.5, -12.5, C.skin, 5.4);
  limb(ctx, 10.5, -12.5, fx, fy, C.skin, 4.4);
  circle(ctx, 8.5, -19.5, 4.6, C.skin, OUT);
  ctx.beginPath();
  ctx.ellipse(10, -15, 3.2, 2.4, 1.2, 0, TAU);
  paint(ctx, C.skin, 1.2);
  circle(ctx, fx + 0.3, fy + 0.3, 2.5, C.skin, 1.2);
}

const DRAW = [hunter, clipper, dad, karen, scooter, teen, mom, blind, gymbro, kid, dogSit];

/** A super shopper's little gold crown, worn at a jaunty angle on top of the head. */
function crown(ctx, K, P) {
  let [x, y] = K.crown;
  if (K.n === KIND.blind.n) {
    // He leans back when his dog bolts and a little forward when walking; the crown goes with him.
    const lean = P.alt ? -0.3 : P.moving ? 0.07 : 0;
    const c = Math.cos(lean), s = Math.sin(lean);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  ctx.save();
  ctx.translate(x, y + 1.5);
  ctx.rotate(0.22);
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(-5.6, -6.5);
  ctx.lineTo(-2.4, -3.4);
  ctx.lineTo(0, -8);
  ctx.lineTo(2.4, -3.4);
  ctx.lineTo(5.6, -6.5);
  ctx.lineTo(5, 0);
  ctx.closePath();
  ctx.lineJoin = 'round';
  paint(ctx, GOLD, 1.4);
  ctx.fillStyle = '#e8303a';
  ctx.beginPath();
  ctx.arc(0, -2, 1.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A copy of a sprite grown by r device pixels all round and filled with one colour. */
function dilate(src, r, colour) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    g.drawImage(src, Math.cos(a) * r, Math.sin(a) * r);
  }
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over'; // the caller draws on top of it
  return c;
}

// --- sprite cache ----------------------------------------------------------------------------

const pose = { v: 0, sw: 0, moving: false, alt: false, ph: 0, down: false, face: 1 };

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

  /**
   * A pose's sprite. A super shopper's (sup) is bigger and has room round it for the glow; draw
   * it with the box from supBox().
   */
  function get(K, v, face, frame, alt, sup = false) {
    const key = (((((K.n * 8 + v) * 2 + (face > 0 ? 1 : 0)) * 8 + frame) * 2) + (alt ? 1 : 0)) * 2 + (sup ? 1 : 0);
    let c = map.get(key);
    if (c) return c;
    const pad = sup ? SUP_PAD : 0, z = sup ? SUP_SCALE : 1;
    const bw = K.bw + pad * 2, bh = K.bh + pad * 2;
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(bw * scale * z));
    c.height = Math.max(1, Math.ceil(bh * scale * z));
    const g = c.getContext('2d');
    const kx = c.width / bw, ky = c.height / bh;
    g.setTransform(kx, 0, 0, ky, -(boxX(K, face) - pad) * kx, -(K.by - pad) * ky);
    pose.v = v;
    pose.moving = frame < WALK_FRAMES;
    pose.down = frame === DOWN;
    pose.ph = pose.moving ? frame / WALK_FRAMES : 0;
    pose.sw = pose.moving ? Math.sin(pose.ph * TAU) : 0;
    pose.alt = alt;
    pose.face = face > 0 ? 1 : -1;
    g.scale(face * K.sc, K.sc);
    if (pose.moving && !K.still) g.rotate(0.07); // lean into the walk (scooters do not lean)
    DRAW[K.n](g, pose);
    if (sup) {
      crown(g, K, pose);
      // A soft gold glow, a crisp gold outline, then the figure on top.
      const glow = dilate(c, 3.4 * kx, 'rgba(255,196,30,0.5)');
      const line = dilate(c, 1.7 * kx, GOLD);
      const gg = glow.getContext('2d');
      gg.drawImage(line, 0, 0);
      gg.drawImage(c, 0, 0);
      c = glow;
    }
    map.set(key, c);
    return c;
  }

  return { setScale, get };
}

// --- overlays ------------------------------------------------------------------------------

function patienceBar(ctx, x, y, f, sup) {
  // A super shopper's bar is wider and taller, in a gold frame.
  const hw = sup ? 17 : 12, hh = sup ? 3.5 : 2.5;
  if (sup) {
    ctx.fillStyle = GOLD;
    ctx.fillRect(x - hw - 1.5, y - hh - 1.5, hw * 2 + 3, hh * 2 + 3);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(x - hw, y - hh, hw * 2, hh * 2);
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(x - hw + 1, y - hh + 1, hw * 2 - 2, hh * 2 - 2);
  ctx.fillStyle = ramp(f);
  ctx.fillRect(x - hw + 1, y - hh + 1, (hw * 2 - 2) * Math.max(0, Math.min(1, f)), hh * 2 - 2);
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
export function shadowPath(ctx, s, sx, sy, face = 1) {
  const K = KIND[s.k] || KIND.hunter;
  const z = s.sup ? SUP_SCALE : 1;
  let rx = (s.k === 'scooter' ? 18 : s.k === 'gymbro' ? 11 : 9) * K.sc;
  let cx = sx;
  if (s.k === 'blind' && s.st !== ST.STUN) {
    // One long shadow under the man and his dog.
    const bolt = s.bt > 0;
    cx += face * (bolt ? 15 : 10) * z;
    rx = bolt ? 27 : 20;
  }
  rx *= z;
  ctx.moveTo(cx + rx, sy + FEET);
  ctx.ellipse(cx, sy + FEET, rx, 3.5 * z, 0, 0, TAU);
}

/** Adds the shadow of a mom's loose child (at its own position) to the current path. */
export function kidShadowPath(ctx, sx, sy) {
  ctx.moveTo(sx + 5.5, sy + FEET);
  ctx.ellipse(sx, sy + FEET, 5.5, 2.4, 0, 0, TAU);
}

/**
 * Draws a mom's runaway child at its own position (only while mom.kd > 0): sprinting with motion
 * lines while it runs (kd 1), bouncing on the spot and pulling faces while it waits (kd 2).
 */
export function drawKid(ctx, mom, sx, sy, face, F, sprites) {
  const running = mom.kd === 1;
  let frame = STAND, hop;
  if (running) {
    const ph = F.time * KID.step + mom.id * 1.3;
    frame = ((((ph / TAU) % 1) + 1) % 1 * WALK_FRAMES) | 0;
    hop = Math.abs(Math.cos(frame / WALK_FRAMES * TAU)) * 2;
  } else {
    hop = Math.abs(Math.sin(F.time * 9 + mom.id)) * 5;
  }
  const img = sprites.get(KID, 0, face, frame, !running);
  ctx.drawImage(img, sx + boxX(KID, face), sy + FEET + KID.by - hop, KID.bw, KID.bh);
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
  let alt = false, pace = 1;
  if (s.k === 'dad') {
    // Every few seconds he checks his watch; much more often when nearly out of patience.
    const f = s.mhp > 0 ? s.hp / s.mhp : 1;
    alt = (F.time * (f < 0.4 ? 1.6 : 0.8) + s.id * 0.37) % 3 < 1.3;
  } else if (s.k === 'karen') {
    alt = ((F.time * 2.5 + s.id) | 0) % 2 === 0;
  } else if (s.k === 'mom') {
    alt = s.kd > 0; // chasing her child
    if (alt) pace = 1.7;
  } else if (s.k === 'blind') {
    alt = s.bt > 0; // the dog is bolting
    if (alt) pace = 2.2;
  }
  const ph = F.time * K.step * pace + s.id * 1.7; // walking cycle, radians
  const frame = stunned && K.down ? DOWN : moving ? ((((ph / TAU) % 1) * WALK_FRAMES) | 0) : STAND;
  const v = K.vars > 1 ? s.id % K.vars : 0;
  const sup = !!s.sup;
  const img = sprites.get(K, v, face, frame, alt, sup);
  const fy = sy + FEET;
  // The sprite's box around the feet; a super's is padded for the glow and drawn bigger.
  const z = sup ? SUP_SCALE : 1, pad = sup ? SUP_PAD : 0;
  const bx = (boxX(K, face) - pad) * z, by = (K.by - pad) * z;
  const bw = (K.bw + pad * 2) * z, bh = (K.bh + pad * 2) * z;

  if (leaving) {
    const fade = Math.max(0, Math.min(1, (s.t - F.alpha) / LEAVE_TICKS));
    ctx.globalAlpha = fade;
    ctx.drawImage(img, sx + bx + Math.sin(F.time * 60) * 1.2, fy + by, bw, bh); // shaking with rage
    ctx.globalAlpha = Math.min(1, fade * 1.6);
    puff(ctx, sx, fy - K.top * K.sc * z - 4 - (1 - fade) * 10, 1 - fade);
    ctx.globalAlpha = 1;
    return;
  }
  if (stunned) {
    if (s.k === 'blind') {
      // His dog sits by him, ahead, looking back at him.
      const dimg = sprites.get(DOGSIT, 0, -face, STAND, false);
      ctx.drawImage(dimg, sx + face * 21 * z + boxX(DOGSIT, -face), fy + DOGSIT.by, DOGSIT.bw, DOGSIT.bh);
    }
    // Flat on his back, feet toward where he was going, stars round his head.
    ctx.save();
    ctx.translate(sx - face * 2, fy - 3);
    ctx.rotate(-face * Math.PI * 0.47);
    ctx.drawImage(img, bx, by + 14 * z, bw, bh);
    ctx.restore();
    stars(ctx, sx - face * 16 * z, fy - 10, F.time);
  } else {
    const bob = moving ? Math.abs(Math.cos(frame / WALK_FRAMES * TAU)) * (pace > 1 ? 2.2 : 1.3) : 0;
    ctx.drawImage(img, sx + bx, fy + by - bob, bw, bh);
  }
  // Supers wear a crown above the figure, so their bar sits a little higher.
  const top = fy - K.top * K.sc * z - (sup ? 7 : 0);
  if (s.st === ST.BROWSE) thought(ctx, sx + 10, top - 10, s.k === 'clipper' ? '%' : '$');
  if (s.k === 'dad' || sup || s.hp < s.mhp - 0.01) patienceBar(ctx, sx, top - 4, s.hp / s.mhp, sup);
}
