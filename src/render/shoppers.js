// Shoppers: thirteen kinds of small cartoon people (and one dog), drawn side-on in three-quarter
// view, facing the way they walk. Each kind is built from a few shared parts (limbs, head, face)
// plus its own props: trolley, coupons, dad cap and receipt, Karen hair and pointing finger,
// mobility scooter, hoodie and slushie, mom's trolley with a child in the seat, guide dog and white
// cane, the gym bro's boxed TV, the stray dog's mangy coat, the cosplayers' four costumes (and the
// mech suit), the exhibitionist's bathrobe (and what is under it), the day drinker's bottle in a bag.
// A mom's runaway child is a separate little figure (drawKid); so is a cart a mom left behind.
//
// A big wave has well over a hundred shoppers, so each figure is drawn once per pose into a small
// offscreen canvas (a sprite) and then stamped with one drawImage. A pose is: kind, colour
// variant (or costume), facing, one of six walking frames, standing or lying down, and an "alt"
// number for other gestures (dad checking his watch, Karen shouting, the guide dog bolting, mom
// chasing, carrying or crawling, a dog peeing or sitting, the bathrobe open). Overlays such as the
// patience bar, the marks over someone watching something, a dog's stream and a drunk's rolling
// bottle are drawn directly every frame.
import { ST, TUNE, TICK_HZ, defOf } from '../sim/index.js';
import { TILE, INK, C, rr, paint, box, circle, label, ramp, starPath, text, hazard } from './paint.js';

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
const MUTT = '#9a8262', MUTT_DARK = '#6e5a40', MUTT_PATCH = '#54432f';
const DANE = '#d4d8dc', DANE_SPOT = '#2b2f34', DANE_DARK = '#9aa0a6';
const ROBE = '#f7a8c8', ROBE_DARK = '#d9759f', SLIPPER = '#ff9ccf';
const DRINK_SHIRTS = ['#ece6d2', '#9ec5e8', '#e8b49e', '#b8d8a8'];

/** Mom poses (the `alt` of her sprite). */
const MOM_CART = 0, MOM_CHASE = 1, MOM_CHASE_NOCART = 2, MOM_CARRY = 3, MOM_CRAWL_CART = 4, MOM_CRAWL = 5;
/** Dog poses. */
const DOG_PEE = 1, DOG_SIT = 2;

/**
 * Per kind: index (for sprite keys), drawing scale, figure height (for the patience bar), walking
 * cadence, number of colour variants (costumes, for the cosplayer). Optional: `box` sprite box
 * [x, y, w, h] when the default one is too small (drawn for facing right; mirrored for left),
 * `still` no walking lean (the drawing leans by itself, or not at all), `stillAlt` the same for
 * some poses only (a bit per alt), `down` has its own lying-down pose, `supTop` the super
 * version's height when it is a different shape.
 */
const KIND = {
  hunter: { n: 0, sc: 1, top: 33, step: 11, vars: HUNTER_SHIRTS.length, crown: [1, -32] },
  clipper: { n: 1, sc: 0.82, top: 33, step: 17, vars: 1, crown: [1.5, -33] },
  dad: { n: 2, sc: 1.05, top: 35, step: 15, vars: DAD_POLOS.length, crown: [1.5, -36] },
  karen: { n: 3, sc: 1.12, top: 37, step: 9, vars: 1, crown: [2.5, -38.5] },
  scooter: { n: 4, sc: 1, top: 38, step: 6, vars: 1, still: true, crown: [-3.5, -37.5] },
  teen: { n: 5, sc: 1, top: 34, step: 7, vars: HOODIES.length, crown: [1.4, -33.5] },
  mom: {
    n: 6, sc: 1, top: 37, step: 11, vars: MOM_TOPS.length, box: [-28, -52, 64, 64], crown: [1.5, -32.5],
    stillAlt: (1 << MOM_CRAWL_CART) | (1 << MOM_CRAWL),
  },
  blind: { n: 7, sc: 1, top: 35, step: 9, vars: 1, still: true, down: true, box: [-30, -52, 88, 64], crown: [1.5, -33] },
  gymbro: { n: 8, sc: 1.08, top: 38, step: 13, vars: TANKS.length, box: [-31, -52, 63, 64], crown: [1.8, -34.5] },
  dog: { n: 11, sc: 1, top: 22, supTop: 38, step: 19, vars: 1, crown: [16, -36], stillAlt: (1 << DOG_PEE) | (1 << DOG_SIT) },
  cosplay: { n: 12, sc: 1, top: 52, supTop: 64, step: 8, vars: 4, box: [-36, -78, 72, 90], crown: [1, -64] },
  flasher: { n: 13, sc: 1, top: 38, step: 8, vars: 1, crown: [0.5, -39], stillAlt: 2 },
  drinker: { n: 14, sc: 1, top: 36, supTop: 41, step: 9, vars: DRINK_SHIRTS.length, down: true, crown: [1, -41] },
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
/** A trolley on its side, left behind by a mom who went down for the last time. */
const CART = { n: 15, sc: 1, top: 16, step: 1, vars: 1, box: [-22, -26, 44, 34] };
for (const K of [...Object.values(KIND), KID, DOGSIT, CART]) {
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
  if (P.alt === MOM_CRAWL_CART || P.alt === MOM_CRAWL) { momCrawl(ctx, P, P.alt === MOM_CRAWL_CART); return; }
  if (P.alt === MOM_CARRY) { momCarry(ctx, P); return; }
  // Her child has escaped: she sprints after him, shouting (with her cart, unless she has lost it).
  const chase = P.alt === MOM_CHASE || P.alt === MOM_CHASE_NOCART;
  const cart = P.alt !== MOM_CHASE_NOCART;
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
  if (cart) {
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
  }
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

// --- mom's other poses ----------------------------------------------------------------------

/** Her head: messy bun, frazzled strands; mood 1 tired, 2 shouting, 4 gritted teeth and a tear. */
function momHead(ctx, P, x, y, mood) {
  const hair = MOM_HAIR[P.v];
  circle(ctx, x - 4.2, y - 7.7, 3.6, hair, OUT);
  head(ctx, x, y, 6.6);
  hairCap(ctx, x, y, 6.6, hair);
  ctx.beginPath();
  ctx.moveTo(x - 6.5, y - 10); ctx.quadraticCurveTo(x - 9.5, y - 12.5, x - 8, y - 14.5);
  ctx.moveTo(x - 2.5, y - 10.5); ctx.quadraticCurveTo(x - 1, y - 14, x + 1, y - 13);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.stroke();
  if (mood === 4) {
    face(ctx, x, y + 1, 1);
    ctx.fillStyle = '#ffffff'; // gritted teeth
    ctx.fillRect(x + 2.2, y + 3.4, 4, 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.strokeRect(x + 2.2, y + 3.4, 4, 2);
    ctx.beginPath(); ctx.ellipse(x + 2, y + 3.5, 0.9, 1.6, 0, 0, TAU); // a tear
    ctx.fillStyle = '#9fe3ff'; ctx.fill();
    return;
  }
  face(ctx, x, y + 1, mood);
  if (mood === 1) {
    ctx.beginPath();
    ctx.moveTo(x + 0.3, y + 2.6); ctx.quadraticCurveTo(x + 1.2, y + 3.4, x + 2.2, y + 2.6);
    ctx.moveTo(x + 4, y + 2.6); ctx.quadraticCurveTo(x + 5, y + 3.4, x + 6, y + 2.6);
    ctx.moveTo(x + 2.2, y + 4.9); ctx.lineTo(x + 4.8, y + 4.9);
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  }
}

/** Walking with the child on her hip, no cart: he never gets away again. */
function momCarry(ctx, P) {
  const sw = P.sw;
  limb(ctx, -2.5, -8.5, -2.5 - sw * 2.8, -1.5, '#2b2b38', 3);
  shoe(ctx, -2.5 - sw * 2.8, -0.8, '#f4f4f4');
  limb(ctx, 2, -8.5, 2 + sw * 2.8, -1.5, '#383846', 3);
  shoe(ctx, 2 + sw * 2.8, -0.8, '#f4f4f4');
  ctx.beginPath();
  ctx.moveTo(-1.5, -21); ctx.lineTo(-5, -12);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
  box(ctx, -10, -13, 7.5, 7, 2, '#8a5a2b', 1.5);
  ctx.beginPath();
  ctx.ellipse(0, -14.5, 6.8, 7, 0, 0, TAU);
  paint(ctx, MOM_TOPS[P.v], OUT);
  momHead(ctx, P, 0, -26.5, 1);
  // The child on her front hip: legs dangling, striped shirt, an arm round her neck, tongue out.
  limb(ctx, 7.5, -13, 10.5 + sw * 0.6, -8, '#3b5fa8', 2);
  limb(ctx, 5.5, -13, 7.5 + sw * 0.6, -7.5, '#4468b5', 2);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(7, -16.5, 3.8, 4.4, 0, 0, TAU);
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = C.red;
  ctx.fillRect(2, -19, 10, 1.5); ctx.fillRect(2, -16, 10, 1.5); ctx.fillRect(2, -13, 10, 1.5);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(7, -16.5, 3.8, 4.4, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
  kidHead(ctx, 8.5, -23.2, 3.8, 1);
  limb(ctx, 5.5, -19, 2.5, -21.5, C.skin, 1.7);
  // Her arm under him.
  limb(ctx, 1.5, -17, 9.5, -13.5, C.skin, 3);
  circle(ctx, 10, -13.8, 1.9, C.skin, 1.1);
}

/**
 * On her hands and knees, dragging herself to her child: knees on the floor, shins and trainers
 * trailing, hands reaching forward in turn, her bag dragged behind. A Soccer Mom on her first time
 * down still has her cart and shoves it along ahead of her.
 */
function momCrawl(ctx, P, cart) {
  const r = Math.sin(P.ph * TAU); // -1..1: which hand is reaching
  const top = MOM_TOPS[P.v];
  // The bag, dragged behind on its strap.
  ctx.beginPath();
  ctx.moveTo(-3, -11); ctx.lineTo(-14, -4);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.save();
  ctx.translate(-16, -3.5);
  ctx.rotate(-0.3);
  box(ctx, -4, -3.5, 7.5, 6.5, 2, '#8a5a2b', 1.4);
  ctx.restore();
  // Far leg: thigh down to the knee on the floor, shin dragging behind.
  const k1 = -7 + r * 1.5, k2 = -6 - r * 1.5;
  limb(ctx, -5, -9, k1, -2.2, '#2b2b38', 3.2);
  limb(ctx, k1, -2.2, k1 - 9, -1.4, '#2b2b38', 2.8);
  shoe(ctx, k1 - 10, -1.6, '#f4f4f4');
  // Far arm, planted.
  limb(ctx, 5, -11.5, 8 - r * 3, -1.4, C.skin, 2.6);
  // Body, nearly level, leaning forward.
  ctx.save();
  ctx.translate(0, -10.5);
  ctx.rotate(-0.14);
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 5.2, 0, 0, TAU);
  paint(ctx, top, OUT);
  ctx.restore();
  // Near leg.
  limb(ctx, -6, -8, k2, -2, '#383846', 3.2);
  limb(ctx, k2, -2, k2 - 9, -1.2, '#383846', 2.8);
  shoe(ctx, k2 - 10, -1.4, '#f4f4f4');
  // Head low and forward, gritting her teeth.
  momHead(ctx, P, 11, -16.5, 4);
  if (cart) {
    // Shoving the cart along with one hand on its handle.
    ctx.save();
    ctx.translate(11, 1);
    box(ctx, 16.5, -21, 6, 5.5, 1, '#ffd23f', 1.2);
    trolley(ctx);
    box(ctx, 8.8, -15.2, 5, 3.4, 1, '#d9372b', 1.1);
    ctx.restore();
    limb(ctx, 7, -12.5, 15.5, -15.5, C.skin, 2.6);
    circle(ctx, 16, -15.6, 1.8, C.skin, 1);
  } else {
    // Near arm, reaching out along the floor.
    const hx = 13 + Math.max(0, r) * 5;
    limb(ctx, 6, -11, hx, -1.6, C.skin, 2.6);
    circle(ctx, hx + 0.5, -1.6, 1.8, C.skin, 1);
  }
}

// --- the stray dog ---------------------------------------------------------------------------

/** A ragged ellipse: a mangy coat, tufts sticking up along the top. */
function shaggy(ctx, x, y, rx, ry, col, n = 12) {
  ctx.beginPath();
  for (let k = 0; k <= n * 2; k++) {
    const a = (k / (n * 2)) * TAU;
    const r = k % 2 && Math.sin(a) < 0.3 ? 1.24 : 1;
    const px = x + Math.cos(a) * rx * r, py = y + Math.sin(a) * ry * r;
    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  paint(ctx, col, OUT);
}

/** The mutt's head, facing +x, centred on (x, y). */
function muttHead(ctx, x, y) {
  ctx.beginPath();
  ctx.ellipse(x + 4.2, y + 1.6, 3.3, 2.3, 0, 0, TAU);
  paint(ctx, MUTT, 1.4);
  shaggy(ctx, x, y, 4.6, 4.2, MUTT, 7);
  // One ear up, one flopped over.
  ctx.beginPath(); ctx.moveTo(x - 3, y - 2.5); ctx.lineTo(x - 1.6, y - 9.5); ctx.lineTo(x + 1.2, y - 3.4); ctx.closePath();
  paint(ctx, MUTT_DARK, 1.2);
  ctx.beginPath(); ctx.ellipse(x - 3.2, y + 0.8, 1.8, 3.4, 0.4, 0, TAU);
  paint(ctx, MUTT_DARK, 1.1);
  // Eye patch, eye, nose, tongue.
  ctx.beginPath(); ctx.arc(x + 1.8, y - 1, 2.1, 0, TAU); ctx.fillStyle = MUTT_PATCH; ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + 2, y - 1.1, 1.1, 0, TAU); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 2.3, y - 1.1, 0.7, 0, TAU); ctx.fill();
  circle(ctx, x + 7.3, y + 1, 1.4, INK, 0);
  ctx.beginPath(); ctx.ellipse(x + 4.8, y + 4.4, 1.2, 2.1, 0.2, 0, TAU);
  paint(ctx, '#ff6b8a', 0.8);
}

/**
 * A scruffy stray mutt, fast and low. alt DOG_PEE: back leg cocked (the stream is drawn live,
 * toward whatever he is peeing on, behind him); DOG_SIT: sitting with his head on one side,
 * watching something. The super is a Great Dane.
 */
function strayDog(ctx, P) {
  if (P.sup) { greatDane(ctx, P); return; }
  const sw = P.sw;
  if (P.alt === DOG_SIT) {
    limb(ctx, -6, -2, -12, -1, MUTT, 2.4); // tail on the floor
    shaggy(ctx, -2, -7.5, 6, 6.5, MUTT, 8);
    ctx.beginPath(); ctx.ellipse(-3.5, -9, 3, 2, 0, 0, TAU); ctx.fillStyle = MUTT_PATCH; ctx.fill();
    limb(ctx, 2.5, -7, 3, -1, MUTT, 2.6);
    limb(ctx, 0.5, -7, 0.8, -1, MUTT_DARK, 2.4);
    ctx.save(); ctx.translate(3.5, -16); ctx.rotate(0.3); muttHead(ctx, 0, 0); ctx.restore();
    return;
  }
  const pee = P.alt === DOG_PEE;
  const by = -10;
  const wag = Math.sin(P.ph * TAU * 2) * 2;
  limb(ctx, -9, by - 2, -14 + wag * 0.3, by - 9 + wag, MUTT, 2.4); // tail up
  limb(ctx, -6, by + 2, -6 - sw * 3.2, -1, MUTT_DARK, 2.4);
  limb(ctx, 6, by + 2, 6 + sw * 3.2, -1, MUTT_DARK, 2.4);
  shaggy(ctx, 0, by, 10, 5.4, MUTT);
  ctx.beginPath(); ctx.ellipse(-2.5, by - 2.2, 4.2, 2.2, 0, 0, TAU); ctx.fillStyle = MUTT_PATCH; ctx.fill();
  if (pee) {
    // Back leg cocked up and out behind him.
    limb(ctx, -6, by + 1, -13, by - 5, MUTT, 2.7);
    limb(ctx, -13, by - 5, -16.5, by - 3.5, MUTT, 2.3);
  } else {
    limb(ctx, -5, by + 2, -5 + sw * 3.2, -1, MUTT, 2.7);
  }
  limb(ctx, 7, by + 2, 7 - sw * 3.2, -1, MUTT, 2.7);
  muttHead(ctx, 11, by - 5);
}

/** The super stray: a Great Dane, grey with black patches, long legs, a spiked collar, drool. */
function greatDane(ctx, P) {
  const sw = P.sw;
  const by = -19;
  const headAt = (x, y) => {
    // A long square muzzle, a domed head, one floppy black ear at the back.
    box(ctx, x + 1, y - 1.5, 10.5, 5.6, 2.4, DANE, 1.4);
    circle(ctx, x, y, 4.6, DANE, 1.6);
    ctx.beginPath(); ctx.ellipse(x - 3, y - 0.5, 1.6, 3.6, 0.5, 0, TAU); paint(ctx, DANE_SPOT, 1.1);
    ctx.fillStyle = DANE_SPOT; ctx.beginPath(); ctx.ellipse(x + 1.6, y - 1.6, 2.4, 1.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + 2, y - 1.4, 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 2.3, y - 1.4, 0.7, 0, TAU); ctx.fill();
    circle(ctx, x + 11, y - 0.4, 1.6, INK, 0);
    ctx.beginPath(); ctx.moveTo(x + 7, y + 4.8); ctx.lineTo(x + 7.5, y + 10); // drool
    ctx.strokeStyle = 'rgba(200,235,255,0.95)'; ctx.lineWidth = 1.3; ctx.stroke();
  };
  const spots = (x, y, rx, ry) => {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = DANE_SPOT;
    ctx.beginPath();
    ctx.ellipse(x - 5, y - 2, 3.4, 2.2, 0.3, 0, TAU);
    ctx.ellipse(x + 4, y - 3, 2.6, 1.8, -0.2, 0, TAU);
    ctx.ellipse(x + 1, y + 3, 2.4, 1.6, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  };
  if (P.alt === DOG_SIT) {
    // Sitting up tall: a big haunch on the floor, front legs straight, head up.
    limb(ctx, -10, -2, -17, -1, DANE, 2.2);
    ctx.beginPath(); ctx.ellipse(-5, -7, 8, 6.5, 0, 0, TAU); paint(ctx, DANE, OUT);
    spots(-5, -7, 8, 6.5);
    ctx.beginPath(); ctx.ellipse(0, -16, 6, 10, 0.35, 0, TAU); paint(ctx, DANE, OUT);
    spots(0, -16, 6, 10);
    limb(ctx, 5, -14, 5.5, -1, DANE, 4);
    limb(ctx, 2, -14, 2.4, -1, DANE_DARK, 3.6);
    limb(ctx, 2, -23, 5, -29, DANE, 5.4);
    box(ctx, 1.5, -27.5, 6.5, 2.6, 1, '#d9372b', 1);
    headAt(6, -32);
    return;
  }
  const pee = P.alt === DOG_PEE;
  limb(ctx, -13, by - 1, -18 + sw, by + 7, DANE, 2.2); // long thin tail
  limb(ctx, -8, by + 3, -8 - sw * 4.4, -1, DANE_DARK, 4);
  limb(ctx, 9, by + 3, 9 + sw * 4.4, -1, DANE_DARK, 4);
  ctx.beginPath(); ctx.ellipse(0, by, 13, 7, 0, 0, TAU); paint(ctx, DANE, OUT);
  spots(0, by, 13, 7);
  if (pee) {
    limb(ctx, -8, by + 2, -18, by - 6, DANE, 4.2);
    limb(ctx, -18, by - 6, -22, by - 3.5, DANE, 3.4);
  } else {
    limb(ctx, -7, by + 3, -7 + sw * 4.4, -1, DANE, 4.2);
  }
  limb(ctx, 10, by + 3, 10 - sw * 4.4, -1, DANE, 4.2);
  limb(ctx, 9, by - 2, 13, by - 9, DANE, 6); // neck
  box(ctx, 10, by - 9, 6, 2.6, 1, '#d9372b', 1); // spiked collar
  ctx.fillStyle = '#e6ebef';
  for (let k = 0; k < 3; k++) ctx.fillRect(10.5 + k * 2, by - 10.4, 1, 1.5);
  headAt(16, by - 13);
}

// --- cosplayers ------------------------------------------------------------------------------

/** Silver dryer-hose arm, ribbed. */
function hose(ctx, x1, y1, x2, y2) {
  limb(ctx, x1, y1, x2, y2, '#cfd6dc', 4.6);
  ctx.beginPath();
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  for (let t = 0.15; t < 0.95; t += 0.18) {
    const x = x1 + dx * t, y = y1 + dy * t;
    ctx.moveTo(x - nx * 2.3, y - ny * 2.3); ctx.lineTo(x + nx * 2.3, y + ny * 2.3);
  }
  ctx.strokeStyle = '#8b939c'; ctx.lineWidth = 1; ctx.stroke();
}

/** Legs in trousers with trainers: the person inside the costume. */
function plainLegs(ctx, sw, col, shoeCol, spread = 3.5) {
  limb(ctx, -spread, -10, -spread - sw * 2.4, -1.5, col, 3.4);
  shoe(ctx, -spread - sw * 2.4, -0.8, shoeCol);
  limb(ctx, spread, -10, spread + sw * 2.4, -1.5, col, 3.4);
  shoe(ctx, spread + sw * 2.4, -0.8, shoeCol);
}

/** Costume 0: a cardboard robot with dryer-hose arms and a bottle-cap antenna. */
function cosRobot(ctx, P) {
  plainLegs(ctx, P.sw, '#6b7280', '#f4f4f4');
  hose(ctx, -11, -28, -16, -13);
  box(ctx, -12.5, -35, 25, 26, 1.5, C.cardboard, OUT);
  ctx.fillStyle = 'rgba(240,215,160,0.95)';
  ctx.fillRect(-12, -23, 24, 3); // tape
  box(ctx, -7, -32, 14, 8, 1, '#2b2f34', 1.2);
  circle(ctx, -3.5, -28, 1.6, '#ff3b30', 0.8);
  circle(ctx, 0.5, -28, 1.6, '#4ade80', 0.8);
  circle(ctx, 4.5, -28, 1.6, '#ffd23f', 0.8);
  circle(ctx, 3, -15, 3.2, '#ffffff', 1.2); // a dial drawn on in felt-tip
  ctx.beginPath(); ctx.moveTo(3, -15); ctx.lineTo(5, -17);
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  plainText(ctx, 'BEEP', -5, -14.5, 4.5, '#5a3510');
  // Head: a smaller box with an eye slit (his real eyes in it) and a grille.
  line2(ctx, 1, -50, 2, -58, 1.4);
  circle(ctx, 2, -59, 2.3, '#e8303a', 1.1);
  box(ctx, -8.5, -51, 19, 16, 1.5, C.cardboardLight, OUT);
  ctx.fillStyle = INK; ctx.fillRect(-4, -46.5, 13, 4.5);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(1, -44.2, 1.2, 0, TAU); ctx.arc(5.5, -44.2, 1.2, 0, TAU); ctx.fill();
  ctx.beginPath();
  for (let k = 0; k < 4; k++) { ctx.moveTo(-2 + k * 3, -40); ctx.lineTo(-2 + k * 3, -37); }
  ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 1.2; ctx.stroke();
  hose(ctx, 10, -28, 17, -20);
  circle(ctx, 18, -19.5, 2.8, '#cfd6dc', 1.3);
}

function line2(ctx, x1, y1, x2, y2, w) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
}

/** Costume 1: a dinosaur onesie, his face peering out of the jaws, tail dragging. */
function cosDino(ctx, P) {
  const G = '#43b05c', GL = '#b7e8a8', SPIKE = '#f2c21b';
  const sw = P.sw;
  // Tail, with spikes along it.
  ctx.beginPath();
  ctx.moveTo(-6, -19); ctx.quadraticCurveTo(-20, -15 + sw, -29, -2); ctx.quadraticCurveTo(-16, -5, -5, -9);
  ctx.closePath();
  paint(ctx, G, OUT);
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const x = -11 - k * 6, y = -14 + k * 4;
    ctx.moveTo(x - 2.5, y + 1); ctx.lineTo(x - 1, y - 4); ctx.lineTo(x + 2, y);
  }
  ctx.closePath();
  paint(ctx, SPIKE, 1.2);
  // Stumpy legs with white claws.
  for (const [x, s] of [[-3.5, -1], [3.5, 1]]) {
    const fx = x + s * sw * 2.4;
    limb(ctx, x, -9, fx, -2.5, G, 4.8);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(fx + 2, -3.5); ctx.lineTo(fx + 5, -1.5); ctx.lineTo(fx + 2, -0.5); ctx.fill();
  }
  // Body, pale belly, spikes down the back.
  ctx.beginPath(); ctx.ellipse(0, -20, 11, 12.5, 0, 0, TAU); paint(ctx, G, OUT);
  ctx.beginPath(); ctx.ellipse(3.5, -18, 6, 9, 0, 0, TAU); paint(ctx, GL, 1.2);
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const y = -30 + k * 5.5, x = -10 + Math.abs(k - 1.5) * 0.8;
    ctx.moveTo(x, y - 2.5); ctx.lineTo(x - 5, y); ctx.lineTo(x, y + 2.5);
  }
  paint(ctx, SPIKE, 1.2);
  limb(ctx, 7, -23, 12, -20, G, 3); // tiny arm
  // The hood: a big dino head, mouth open, his face inside it.
  ctx.beginPath(); ctx.ellipse(1, -40, 11, 9.5, 0, 0, TAU); paint(ctx, G, OUT);
  ctx.beginPath(); ctx.ellipse(10, -38, 8.5, 6.4, 0.1, 0, TAU); paint(ctx, G, OUT);
  ctx.beginPath(); ctx.ellipse(8, -35, 7, 5, 0, 0, TAU); paint(ctx, '#7a1c24', 1.4);
  circle(ctx, 7, -35, 4.2, C.skin, 1.2);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(6.2, -35.8, 0.9, 0, TAU); ctx.arc(9, -35.8, 0.9, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(7.6, -33.6, 1.2, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); // teeth round the mouth
  for (let k = 0; k < 4; k++) { const x = 3 + k * 3.4; ctx.moveTo(x, -39.4); ctx.lineTo(x + 1.6, -37); ctx.lineTo(x + 3.2, -39.4); }
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
  circle(ctx, 3, -47, 2.8, '#ffffff', 1.2);
  circle(ctx, 3.8, -47, 1.2, INK, 0);
  ctx.beginPath(); // head spikes
  ctx.moveTo(-9, -44); ctx.lineTo(-12, -49); ctx.lineTo(-6, -48); ctx.lineTo(-6, -53); ctx.lineTo(-1, -49);
  paint(ctx, SPIKE, 1.2);
}

/** Costume 2: a wizard with a hat taller than he is, a stick-on beard, and a lamp for a staff. */
function cosWizard(ctx, P) {
  const R = '#5b3a9c', RD = '#43297a', Y = '#ffd23f';
  const sw = P.sw;
  for (const [x, s] of [[-3, -1], [3, 1]]) {
    const fx = x + s * sw * 2.2;
    ctx.beginPath(); // curly slipper
    ctx.moveTo(fx - 2, -1); ctx.quadraticCurveTo(fx + 4, -0.5, fx + 5, -4);
    ctx.lineTo(fx + 3, -1.6); ctx.lineTo(fx - 2, -3);
    paint(ctx, RD, 1.2);
  }
  limb(ctx, -6, -28, -12, -17, R, 6); // big back sleeve
  ctx.beginPath(); // the robe
  ctx.moveTo(-7, -31); ctx.lineTo(8, -31); ctx.lineTo(13.5, -2.5);
  ctx.quadraticCurveTo(0, 0.5, -13.5, -2.5);
  ctx.closePath();
  paint(ctx, R, OUT);
  for (const [x, y, r] of [[-6, -10, 2.6], [5, -17, 2.2], [-2, -23, 1.8], [7, -6, 2]]) { starPath(ctx, x, y, r, 0.3); paint(ctx, Y, 0.8); }
  ctx.beginPath(); ctx.arc(-6, -20, 2.6, 0.9, 4.4); ctx.arc(-6.9, -20.3, 2, 4.3, 0.95, true); ctx.fillStyle = Y; ctx.fill();
  // Head and the long white beard.
  head(ctx, 2, -36, 6.2);
  face(ctx, 2, -36, 1);
  ctx.beginPath();
  ctx.moveTo(-2.5, -33); ctx.quadraticCurveTo(2, -30, 8.5, -33);
  ctx.quadraticCurveTo(8, -22, 4.5, -13); ctx.quadraticCurveTo(0, -22, -2.5, -33);
  paint(ctx, '#f4f4f4', 1.3);
  ctx.beginPath(); ctx.ellipse(6, -33.6, 1.6, 2, 0, 0, TAU); paint(ctx, C.skin, 1); // nose
  // The hat: a brim and a cone that leans back and bends at the tip.
  ctx.beginPath();
  ctx.moveTo(-7, -41); ctx.quadraticCurveTo(-4, -58, -12, -75); ctx.quadraticCurveTo(-2, -63, 11, -41);
  ctx.closePath();
  paint(ctx, R, OUT);
  starPath(ctx, -1, -52, 2.6, 0); paint(ctx, Y, 0.8);
  starPath(ctx, -6, -62, 1.8, 0.4); paint(ctx, Y, 0.8);
  ctx.beginPath(); ctx.ellipse(2, -41, 13, 3.2, 0, 0, TAU); paint(ctx, RD, OUT);
  // Staff (a broom handle) with a glowing orb (a desk lamp bulb).
  limb(ctx, 14, -1, 15.5, -46, '#8a5a2b', 2.2);
  ctx.beginPath(); ctx.arc(15.6, -49.5, 6.5, 0, TAU); ctx.fillStyle = 'rgba(125,249,255,0.35)'; ctx.fill();
  circle(ctx, 15.6, -49.5, 4.2, '#7df9ff', 1.4);
  circle(ctx, 14.4, -51, 1.3, '#ffffff', 0);
  limb(ctx, 5, -28, 13, -24, R, 5);
  circle(ctx, 14, -24, 2.2, C.skin, 1.1);
}

/** Costume 3: a foam knight: bucket helmet with a plume, a duck shield, an enormous foam sword. */
function cosKnight(ctx, P) {
  const F = '#b8c0c8', FD = '#8a939c';
  plainLegs(ctx, P.sw, '#3b4a6b', '#6b4423');
  // Shield on the back arm, a rubber duck painted on it.
  ctx.beginPath(); ctx.ellipse(-12, -21, 7.5, 10.5, 0, 0, TAU); paint(ctx, '#2f8fe0', OUT);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-13.2, -31, 2.4, 20);
  circle(ctx, -12, -21, 3.4, '#ffd23f', 1.1);
  ctx.beginPath(); ctx.moveTo(-9.2, -21.4); ctx.lineTo(-7.5, -20.6); ctx.lineTo(-9.2, -20); ctx.fillStyle = '#ff8c1a'; ctx.fill();
  // Breastplate and a red tabard with a yellow cross.
  box(ctx, -10, -33, 21, 24, 6, F, OUT);
  box(ctx, -5, -31, 11, 22, 2, '#d9372b', 1.4);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-0.8, -28, 2.6, 13); ctx.fillRect(-3.5, -24, 8, 2.6);
  // Helmet: a bucket with an eye slit and a plume.
  ctx.beginPath();
  for (let k = 0; k < 3; k++) { ctx.moveTo(2, -50); ctx.quadraticCurveTo(-2 - k * 3, -60 + k, -9 - k * 2, -53 + k * 3); }
  ctx.strokeStyle = INK; ctx.lineWidth = 4.4; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = '#e8303a'; ctx.lineWidth = 2.6; ctx.stroke();
  box(ctx, -6.5, -51, 17, 18, 5, F, OUT);
  ctx.fillStyle = INK; ctx.fillRect(0, -45, 10, 2.8);
  ctx.fillStyle = FD;
  for (let k = 0; k < 3; k++) ctx.fillRect(4 + k * 2, -39, 1.2, 1.2);
  // The sword: foam blade as long as he is tall.
  ctx.save();
  ctx.translate(13, -24);
  ctx.rotate(-1.15);
  box(ctx, 2, -3, 36, 6, 3, '#d5e6f2', 1.8);
  box(ctx, -1, -6.5, 4, 13, 1.5, '#8a5a2b', 1.4);
  box(ctx, -7, -2, 7, 4, 1.5, '#5a3a1e', 1.2);
  ctx.restore();
  limb(ctx, 5, -28, 12, -24.5, F, 4.4);
  circle(ctx, 13, -24, 2.4, '#8a939c', 1.2);
}

/** The super cosplayer: a full mech suit, piston legs, his little face in the cockpit, a cannon. */
function cosMech(ctx, P) {
  const O = '#ff8c1a', G = '#6b7280', GD = '#454b53';
  const sw = P.sw;
  for (const [x, s] of [[-7, -1], [7, 1]]) {
    const o = s * sw * 3;
    box(ctx, x - 4.5 + o * 0.4, -27, 9, 12, 2, G, OUT);
    box(ctx, x - 5 + o, -15, 10, 11, 2, GD, OUT);
    circle(ctx, x + o * 0.7, -15.5, 2.6, O, 1.3);
    box(ctx, x - 7 + o, -4.5, 15, 4.5, 1.5, '#2b2f34', 1.6);
  }
  // Back arm: a big fist.
  limb(ctx, -14, -49, -21, -33, G, 6.5);
  circle(ctx, -21.5, -31, 4.4, GD, OUT);
  // Torso, hazard strip, cockpit window with his face.
  box(ctx, -17, -58, 34, 33, 6, O, 2.4);
  hazard(ctx, -16, -31, 32, 5, 4);
  ctx.beginPath(); ctx.arc(4, -46, 7.5, 0, TAU); paint(ctx, '#bfe6ff', 2);
  circle(ctx, 4, -45, 4.6, C.skin, 1.2);
  ctx.fillStyle = INK; ctx.fillRect(0.6, -47.2, 7, 2.2); // goggles
  ctx.fillStyle = '#7df9ff'; ctx.fillRect(1.6, -46.8, 2, 1.4); ctx.fillRect(5, -46.8, 2, 1.4);
  ctx.beginPath(); ctx.arc(4.6, -43, 1.6, 0, Math.PI); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-1, -51, 3, 6);
  // Shoulder pads and the head unit with a glowing visor and an antenna.
  box(ctx, -22, -60, 11, 10, 2.5, G, OUT);
  box(ctx, 11, -60, 11, 10, 2.5, G, OUT);
  line2(ctx, -9, -64, -12, -73, 1.4);
  circle(ctx, -12, -74, 1.8, '#ff3b30', 1);
  box(ctx, -8, -66, 16, 8, 2, G, OUT);
  ctx.fillStyle = '#7df9ff'; ctx.fillRect(-4, -63.6, 11, 3);
  // Front arm: a cannon.
  box(ctx, 9, -47, 22, 9, 2.5, GD, OUT);
  box(ctx, 29, -48.5, 5, 12, 1.5, '#2b2f34', 1.6);
  circle(ctx, 14, -42.5, 2, O, 1);
}

const COSTUMES = [cosRobot, cosDino, cosWizard, cosKnight];

function cosplay(ctx, P) {
  if (P.sup) cosMech(ctx, P); else COSTUMES[P.v % COSTUMES.length](ctx, P);
}

// --- the exhibitionist -----------------------------------------------------------------------

function slipper(ctx, x, y) {
  ctx.beginPath();
  ctx.ellipse(x + 1, y, 3.6, 2.1, 0, 0, TAU);
  paint(ctx, SLIPPER, 1.3);
  circle(ctx, x + 3.6, y - 1.3, 1.7, '#ffffff', 1);
}

/** Hair in rollers, from the front or the side (x, y is the head's centre). */
function rollers(ctx, x, y, r, front) {
  if (front) {
    ctx.beginPath();
    ctx.arc(x, y, r + 0.8, Math.PI * 1.08, Math.PI * 1.92);
    ctx.quadraticCurveTo(x, y - r * 0.55, x - (r + 0.8) * Math.cos(Math.PI * 0.08), y - (r + 0.8) * Math.sin(Math.PI * 0.08));
    ctx.closePath();
    paint(ctx, '#a0522d', OUT);
  } else hairCap(ctx, x, y, r, '#a0522d');
  for (let k = 0; k < 3; k++) box(ctx, x - 5.5 + k * 4, y - r - 3.2, 3.6, 3.6, 1, k === 1 ? '#7dd3fc' : '#ff9ccf', 1);
}

/** Text that reads the right way round on a sprite mirrored for facing left. */
function plainText(ctx, str, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pose.face, 1);
  text(ctx, str, 0, 0, size, color, 900);
  ctx.restore();
}

/**
 * What the bathrobe was hiding, drawn the way a rude cartoon would: no censor bar (the owner's
 * choice; the game is for adults). `old` is Nudist Nan, on whom gravity has been at work.
 */
function bare(ctx, old) {
  const nip = '#b8605a';
  if (old) {
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * 3.5, -15.6, 2.5, 5.4, s * -0.08, 0, TAU); paint(ctx, C.skin, 1.2);
      ctx.beginPath(); ctx.arc(s * 3.6, -11.4, 0.8, 0, TAU); ctx.fillStyle = nip; ctx.fill();
    }
  } else {
    for (const s of [-1, 1]) {
      circle(ctx, s * 3.1, -19.6, 3, C.skin, 1.2);
      ctx.beginPath(); ctx.arc(s * 3.3, -19.2, 0.8, 0, TAU); ctx.fillStyle = nip; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, -13.2, 0.9, 0.2, Math.PI - 0.2); // belly button
    ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(-2.6, -9.4); ctx.lineTo(2.6, -9.4); ctx.lineTo(0, -6.4); ctx.closePath();
  ctx.fillStyle = old ? '#c9c9c9' : '#5a3a22'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.stroke();
}

/**
 * The exhibitionist: pink fluffy bathrobe, slippers, rollers, a glass of wine. alt 1: robe held
 * wide open, turned to her audience, nothing under it. The super, Nudist Nan, has given up on
 * the robe altogether.
 */
function flasher(ctx, P) {
  if (P.sup) { nan(ctx, P); return; }
  const sw = P.sw;
  if (P.alt === 1) {
    limb(ctx, -3, -8, -4, -1.6, C.skin, 2.6);
    limb(ctx, 3, -8, 4, -1.6, C.skin, 2.6);
    slipper(ctx, -5, -1);
    slipper(ctx, 3, -1);
    // The robe flung open like wings, pink lining showing.
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 5, -26); ctx.lineTo(s * 19, -31); ctx.lineTo(s * 17, -5); ctx.lineTo(s * 6, -6);
      ctx.closePath();
      paint(ctx, ROBE, OUT);
      ctx.beginPath();
      ctx.moveTo(s * 7, -24); ctx.lineTo(s * 16, -27.5); ctx.lineTo(s * 15, -8); ctx.lineTo(s * 7.5, -8.5);
      ctx.closePath();
      ctx.fillStyle = ROBE_DARK; ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(0, -16, 6.6, 10, 0, 0, TAU); paint(ctx, C.skin, OUT);
    bare(ctx, false);
    for (const s of [-1, 1]) circle(ctx, s * 19.5, -31, 2.2, C.skin, 1.1);
    // Head on, delighted with herself.
    head(ctx, 0, -32, 6.6);
    rollers(ctx, 0, -32, 6.6, true);
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(-2.4, -32.4, 1.2, 0, TAU); ctx.arc(2.4, -32.4, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, -35.2); ctx.lineTo(-1.2, -34.6); ctx.moveTo(4, -35.2); ctx.lineTo(1.2, -34.6);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -29.4, 2.4, 0, Math.PI); ctx.closePath();
    paint(ctx, '#d9372b', 1);
    return;
  }
  limb(ctx, -2.5, -8, -2.5 - sw * 2.2, -1.8, C.skin, 2.6);
  slipper(ctx, -2.5 - sw * 2.2, -1);
  limb(ctx, 2, -8, 2 + sw * 2.2, -1.8, C.skin, 2.6);
  slipper(ctx, 2 + sw * 2.2, -1);
  limb(ctx, -3, -22, -6.5, -13, ROBE, 4.4);
  ctx.beginPath();
  ctx.moveTo(-7, -24); ctx.quadraticCurveTo(0, -29, 7.5, -24); ctx.lineTo(9, -7); ctx.lineTo(-9, -7);
  ctx.closePath();
  paint(ctx, ROBE, OUT);
  ctx.beginPath(); ctx.moveTo(5, -25); ctx.lineTo(2, -15.5);
  ctx.strokeStyle = ROBE_DARK; ctx.lineWidth = 1.6; ctx.stroke();
  box(ctx, -8.5, -16, 17.5, 3, 1, ROBE_DARK, 1.2); // belt
  limb(ctx, 7.5, -14.5, 9, -9.5, ROBE_DARK, 1.6);
  head(ctx, 1, -30.5, 6.6);
  rollers(ctx, 1, -30.5, 6.6);
  // Heavy-lidded and smug, red lipstick.
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(2.2, -29.6, 1.2, 0, Math.PI); ctx.arc(6, -29.6, 1.2, 0, Math.PI); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.8, -29.8); ctx.lineTo(3.6, -29.8); ctx.moveTo(4.6, -29.8); ctx.lineTo(7.4, -29.8);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3, -26); ctx.quadraticCurveTo(5, -24.8, 6.8, -26.8);
  ctx.strokeStyle = '#d9372b'; ctx.lineWidth = 1.6; ctx.stroke();
  // A large glass of wine.
  limb(ctx, 3, -22, 8.5, -19, ROBE, 4.2);
  ctx.beginPath(); ctx.moveTo(8.5, -26); ctx.lineTo(13.5, -26); ctx.quadraticCurveTo(13.5, -21, 11, -21); ctx.quadraticCurveTo(8.5, -21, 8.5, -26);
  paint(ctx, '#9b1b30', 1.1);
  line2(ctx, 11, -21, 11, -17.5, 1);
  circle(ctx, 9.5, -19, 2, C.skin, 1);
}

/** Nudist Nan: a pensioner in nothing but slippers and support stockings. */
function nan(ctx, P) {
  const sw = P.sw, open = P.alt === 1;
  for (const [x, s] of [[-3, -1], [3, 1]]) {
    const fx = x + s * sw * 1.8;
    limb(ctx, x, -9, fx, -1.8, '#e7c8a8', 2.8);
    slipper(ctx, fx - 1, -1);
  }
  // Arms: up in a ta-da, or one holding her handbag.
  if (open) {
    limb(ctx, -5, -22, -13, -33, C.skin, 2.6);
    limb(ctx, 5, -22, 13, -33, C.skin, 2.6);
  } else {
    limb(ctx, -5, -22, -8, -12, C.skin, 2.6);
    ctx.beginPath(); ctx.moveTo(-11, -12); ctx.quadraticCurveTo(-8.5, -17, -6, -12);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke();
    box(ctx, -12, -12, 8, 6.5, 1.5, '#5b3a9c', 1.4);
  }
  ctx.beginPath(); ctx.ellipse(0, -16, 7.4, 9.5, 0, 0, TAU); paint(ctx, C.skin, OUT);
  bare(ctx, true);
  if (!open) { limb(ctx, 5, -22, 8, -12, C.skin, 2.6); }
  // Head on: white bun, big glasses, a toothless grin.
  circle(ctx, 0, -40.5, 3.6, '#f1f1f1', 1.3);
  head(ctx, 0, -32, 6.6);
  ctx.beginPath(); ctx.arc(0, -32, 7.3, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath();
  paint(ctx, '#f1f1f1', OUT);
  ctx.beginPath(); ctx.arc(-2.6, -32, 2.4, 0, TAU); ctx.moveTo(5, -32); ctx.arc(2.6, -32, 2.4, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(-2.6, -32, 0.9, 0, TAU); ctx.arc(2.6, -32, 0.9, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -28.6, 2.2, 0, Math.PI); ctx.closePath();
  paint(ctx, '#5a1010', 1);
  if (open) for (const s of [-1, 1]) circle(ctx, s * 13.5, -33.5, 1.9, C.skin, 1);
}

// --- the day drinker -------------------------------------------------------------------------

/** His bottle in a brown paper bag (or, for the super, a mimosa), at (x, y) = the bottom middle. */
export function drawBottle(ctx, x, y, mimosa) {
  if (mimosa) {
    line2(ctx, x, y, x, y - 4.5, 1.3);
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 4.5); ctx.lineTo(x - 2.6, y - 16); ctx.lineTo(x + 2.6, y - 16); ctx.lineTo(x + 3, y - 4.5);
    ctx.closePath();
    paint(ctx, '#ffb347', 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x - 2, y - 15, 1.2, 8);
    return;
  }
  ctx.fillStyle = '#2e6b3a';
  ctx.fillRect(x - 1.4, y - 16, 2.8, 6);
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(x - 1.4, y - 16, 2.8, 6);
  ctx.beginPath();
  ctx.moveTo(x - 3.4, y); ctx.lineTo(x - 3, y - 10); ctx.lineTo(x - 1.5, y - 11.5); ctx.lineTo(x + 1.5, y - 11); ctx.lineTo(x + 3, y - 10); ctx.lineTo(x + 3.4, y);
  ctx.closePath();
  paint(ctx, '#b58a52', 1.3);
}

/**
 * The day drinker: shirt half untucked and stained, tie askew, stubble, a red nose, a bottle in a
 * paper bag. The super is the Bottomless Bruncher: sundress, sun hat, giant sunglasses, a mimosa.
 * Lying down (P.down) the bottle is not in his hand; it rolls away separately.
 */
function drinker(ctx, P) {
  const sw = P.sw;
  if (P.sup) { bruncher(ctx, P); return; }
  const shirt = DRINK_SHIRTS[P.v];
  limb(ctx, -2.5, -9, -2.5 - sw * 2.6, -1.5, '#5a4632', 3.2);
  shoe(ctx, -2.5 - sw * 2.6, -0.8, '#2b2118');
  limb(ctx, 2, -9, 2 + sw * 2.6, -1.5, '#665039', 3.2);
  shoe(ctx, 2 + sw * 2.6, -0.8, '#2b2118');
  ctx.beginPath(); ctx.moveTo(2 + sw * 2.6, -2); ctx.quadraticCurveTo(6 + sw * 2.6, -1, 7 + sw * 2.6, 0.5); // a lace undone
  ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 0.9; ctx.stroke();
  limb(ctx, -2, -19, -5, -11, shirt, 3); // the arm hanging
  ctx.beginPath(); ctx.ellipse(0, -15, 7.6, 7.6, 0, 0, TAU); paint(ctx, shirt, OUT);
  ctx.beginPath(); ctx.moveTo(1, -9); ctx.lineTo(6.5, -5.5); ctx.lineTo(-0.5, -6.8); ctx.closePath(); // shirt tail
  paint(ctx, shirt, 1.3);
  ctx.beginPath(); ctx.ellipse(3, -14, 2.2, 1.6, 0.3, 0, TAU); ctx.fillStyle = 'rgba(120,80,30,0.55)'; ctx.fill(); // stain
  limb(ctx, 3, -21.5, -0.5, -12, '#d9372b', 2); // tie, askew
  circle(ctx, 3, -21.5, 1.6, '#d9372b', 1);
  // Head: messy hair, stubble, red nose, flushed cheek, eyes half shut.
  const x = 1.5, y = -27.5;
  head(ctx, x, y, 6.8);
  hairCap(ctx, x, y, 6.8, '#4a3a2a');
  ctx.beginPath(); // bed hair
  ctx.moveTo(x - 5, y - 5); ctx.lineTo(x - 7.5, y - 7.5); ctx.lineTo(x - 3, y - 7); ctx.lineTo(x - 2, y - 9.5); ctx.lineTo(x + 1, y - 7);
  paint(ctx, '#4a3a2a', 1);
  ctx.fillStyle = 'rgba(80,60,50,0.55)';
  for (let k = 0; k < 7; k++) ctx.fillRect(x + 0.5 + (k % 4) * 1.6, y + 3 + (k > 3 ? 1.6 : 0), 0.8, 0.8);
  ctx.beginPath(); ctx.ellipse(x + 2.5, y + 1.5, 2.2, 1.4, 0, 0, TAU); ctx.fillStyle = 'rgba(255,90,90,0.45)'; ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(x + 1.4, y - 0.4, 1.2, 0, Math.PI); ctx.arc(x + 5.1, y - 0.4, 1.2, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, y - 0.8); ctx.lineTo(x + 2.8, y - 0.8); ctx.moveTo(x + 3.8, y - 0.8); ctx.lineTo(x + 6.6, y - 0.8);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 2, y + 4.4); ctx.quadraticCurveTo(x + 4, y + 3.4, x + 5.6, y + 4.8); ctx.stroke();
  circle(ctx, x + 7, y + 1.6, 2.1, '#e8454a', 1);
  if (!P.down) {
    limb(ctx, 2, -19, 8.5, -18, shirt, 3);
    drawBottle(ctx, 10, -15, false);
    circle(ctx, 9, -17.5, 2, C.skin, 1.1);
  }
}

function bruncher(ctx, P) {
  const sw = P.sw;
  for (const [x, s] of [[-2.5, -1], [2, 1]]) {
    const fx = x + s * sw * 2.4;
    limb(ctx, x, -8, fx, -1.6, C.skin, 2.6);
    shoe(ctx, fx, -0.8, '#e8b14a');
  }
  limb(ctx, -2, -20, -5, -12, C.skin, 2.6);
  ctx.beginPath(); // sundress
  ctx.moveTo(-5.5, -24); ctx.lineTo(6, -24); ctx.lineTo(9.5, -6.5); ctx.lineTo(-9.5, -6.5);
  ctx.closePath();
  paint(ctx, '#ffd23f', OUT);
  ctx.fillStyle = '#ff5fa8';
  for (const [fx, fy] of [[-5, -10], [3, -13], [-1, -19], [6, -9], [-4, -16]]) { ctx.beginPath(); ctx.arc(fx, fy, 1.4, 0, TAU); ctx.fill(); }
  ctx.save(); // sash
  ctx.translate(0, -16); ctx.rotate(-0.75);
  box(ctx, -11, -2, 22, 4, 1, '#ff3d7f', 1.1);
  plainText(ctx, 'BRUNCH', 0, 0.2, 3.4, '#ffffff');
  ctx.restore();
  const x = 1.5, y = -29;
  ctx.beginPath(); ctx.ellipse(x - 3, y + 4, 4.5, 7, 0.2, 0, TAU); paint(ctx, '#f3cf62', OUT); // long hair
  head(ctx, x, y, 6.6);
  ctx.fillStyle = INK; // giant sunglasses
  ctx.beginPath(); ctx.ellipse(x + 1.6, y - 0.2, 2.8, 2.2, 0, 0, TAU); ctx.ellipse(x + 6, y - 0.2, 2.6, 2.2, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 4, y + 3.6, 1.8, 0, Math.PI); ctx.closePath(); paint(ctx, '#d9372b', 1); // laughing
  ctx.beginPath(); ctx.ellipse(x, y - 5.5, 12.5, 2.8, -0.08, 0, TAU); paint(ctx, '#e8c88a', OUT); // floppy hat
  ctx.beginPath(); ctx.arc(x, y - 6, 6.5, Math.PI, TAU); ctx.closePath(); paint(ctx, '#e8c88a', OUT);
  ctx.fillStyle = '#ff5fa8'; ctx.fillRect(x - 6.3, y - 8.4, 12.6, 2);
  if (!P.down) {
    limb(ctx, 2, -20, 9, -22, C.skin, 2.6);
    drawBottle(ctx, 11, -18, true);
    circle(ctx, 9.6, -22, 1.9, C.skin, 1);
  }
}

/** A trolley tipped over on its nose, back wheels in the air, the cereal spilled out of it. */
function cartDown(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(1, 0, 15, 3.5, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(-14, 0);
  ctx.translate(20, -2);
  ctx.rotate(0.75);
  ctx.translate(-20, 2);
  trolley(ctx);
  ctx.restore();
  ctx.save();
  ctx.translate(14, -2.5);
  ctx.rotate(0.9);
  box(ctx, -3, -3, 6, 5.5, 1, '#ffd23f', 1.2);
  ctx.fillStyle = C.red; ctx.fillRect(-2, -1.5, 4, 1.4);
  ctx.restore();
  ctx.fillStyle = '#e8c070';
  for (let k = 0; k < 6; k++) ctx.fillRect(9 + k * 2.4, -0.8 + (k % 2) * 1.2, 1.6, 1.4);
}

const DRAW = [hunter, clipper, dad, karen, scooter, teen, mom, blind, gymbro, kid, dogSit, strayDog, cosplay, flasher, drinker, cartDown];

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

const pose = { v: 0, sw: 0, moving: false, alt: 0, ph: 0, down: false, face: 1, sup: false };

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
    alt = alt | 0; // a number 0-7 (true counts as 1)
    const key = (((((K.n * 8 + v) * 2 + (face > 0 ? 1 : 0)) * 8 + frame) * 8) + alt) * 2 + (sup ? 1 : 0);
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
    pose.sup = !!sup;
    g.scale(face * K.sc, K.sc);
    // Lean into the walk (scooters do not lean, nor a crawling mom or a dog cocking his leg).
    if (pose.moving && !K.still && !((K.stillAlt || 0) & (1 << alt))) g.rotate(0.07);
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

/** Half-width of each kind's ground shadow (9 if not listed). */
const SHADOW_RX = { scooter: 18, gymbro: 11, dog: 11, cosplay: 13, drinker: 9 };

/** Adds this shopper's ground shadow to the current path (all shadows are filled at once). */
export function shadowPath(ctx, s, sx, sy, face = 1) {
  const K = KIND[s.k] || KIND.hunter;
  const z = s.sup ? SUP_SCALE : 1;
  let rx = (SHADOW_RX[s.k] || 9) * K.sc;
  let cx = sx;
  if (s.k === 'mom' && s.cr === 1) { rx = 17; cx += face * 2; } // stretched out on the floor
  else if (s.k === 'dog' && s.sup) rx = 15;
  else if (s.k === 'cosplay' && s.sup) rx = 16;
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

/** A cart a mom left behind, on its side where she went down ((sx, sy) in logical pixels). */
export function drawCart(ctx, sx, sy, face, sprites) {
  const img = sprites.get(CART, 0, face, STAND, 0);
  ctx.drawImage(img, sx + boxX(CART, face), sy + FEET + CART.by - 3, CART.bw, CART.bh);
}

/**
 * The tile a day drinker is lying across: spilled booze and a dashed amber border, so it is clear
 * that everyone crossing it is slowed. Drawn on the floor, under the shoppers.
 */
export function drawDownTile(ctx, tx, ty, t) {
  const x = tx * TILE, y = ty * TILE;
  rr(ctx, x + 2, y + 2, TILE - 4, TILE - 4, 6);
  ctx.fillStyle = 'rgba(224,163,58,0.3)';
  ctx.fill();
  ctx.setLineDash([5, 4]);
  ctx.lineDashOffset = -t * 12;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#f0a830';
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.lineDashOffset = 0;
  ctx.beginPath();
  ctx.ellipse(x + TILE * 0.55, y + TILE * 0.62, 13, 6, 0.1, 0, TAU);
  ctx.fillStyle = 'rgba(214,150,40,0.75)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,200,0.7)';
  ctx.fillRect(x + TILE * 0.42, y + TILE * 0.56, 6, 1.6);
}
const NO_DASH = [];
const NO_HOW = { pee: null, gawk: false, tv: false };

/**
 * Over someone standing still to watch something: a bubble with two big eyes. Staring at an
 * exhibitionist, the eyes are hearts and there is a "!!"; watching the salesman's television, a
 * little TV glows beside them.
 */
function eyes(ctx, x, y, gawk, tv) {
  circle(ctx, x - 6, y + 8, 1.5, '#ffffff', 1);
  ctx.beginPath();
  ctx.ellipse(x + 2, y - 1, 10, 7, 0, 0, TAU);
  paint(ctx, '#ffffff', 1.6);
  for (const dx of [-2, 6]) {
    const ex = x + dx;
    if (gawk) {
      ctx.beginPath(); // a heart
      ctx.moveTo(ex, y + 2.6);
      ctx.bezierCurveTo(ex - 5, y - 1, ex - 2.6, y - 5.6, ex, y - 2.6);
      ctx.bezierCurveTo(ex + 2.6, y - 5.6, ex + 5, y - 1, ex, y + 2.6);
      ctx.fillStyle = '#ff3d7f';
      ctx.fill();
    } else {
      circle(ctx, ex, y - 1, 3.4, '#ffffff', 1.2);
      circle(ctx, ex + 1, y - 0.6, 1.6, INK, 0);
    }
  }
  if (gawk) label(ctx, '!!', x + 15, y - 6, 11, '#ff3d7f', INK, 3);
  else if (tv) {
    box(ctx, x + 12, y - 8, 9, 7, 1.5, '#9fe8ff', 1.2);
    ctx.beginPath(); ctx.moveTo(x + 14, y - 8); ctx.lineTo(x + 12.5, y - 11); ctx.moveTo(x + 19, y - 8); ctx.lineTo(x + 20.5, y - 11);
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  }
}

/**
 * Draws one shopper.
 * @param {number} sx screen x of the shopper's position (tile decimals * TILE, already interpolated)
 * @param {number} face 1 facing right, -1 facing left
 * @param {Object} sprites from createShopperSprites()
 * @param {Object} [how] what a shopper who is watching something (ST.WATCH) is up to, worked out by
 *   the renderer from what is round him: `pee` [x, y] in tiles a dog is peeing at, `gawk` staring
 *   at an exhibitionist, `tv` watching the salesman's television. Optional. `noBar` leaves the
 *   patience bar out (portraits).
 */
export function drawShopper(ctx, s, sx, sy, face, F, sprites, how = NO_HOW) {
  const K = KIND[s.k] || KIND.hunter;
  const leaving = s.st === ST.LEAVE;
  const stunned = s.st === ST.STUN;
  const watching = s.st === ST.WATCH;
  const crawling = s.cr === 1 && !leaving;
  const moving = (s.vx !== 0 || s.vy !== 0) && !leaving && !stunned;
  let alt = 0, pace = 1;
  if (s.k === 'dad') {
    // Every few seconds he checks his watch; much more often when nearly out of patience.
    const f = s.mhp > 0 ? s.hp / s.mhp : 1;
    alt = (F.time * (f < 0.4 ? 1.6 : 0.8) + s.id * 0.37) % 3 < 1.3 ? 1 : 0;
  } else if (s.k === 'karen') {
    alt = ((F.time * 2.5 + s.id) | 0) % 2 === 0 ? 1 : 0;
  } else if (s.k === 'mom') {
    if (crawling) { alt = s.nc ? MOM_CRAWL : MOM_CRAWL_CART; pace = 0.55; } else if (s.kd === 3) alt = MOM_CARRY;
    else if (s.kd === 1 || s.kd === 2) { alt = s.nc ? MOM_CHASE_NOCART : MOM_CHASE; pace = 1.7; }
  } else if (s.k === 'blind') {
    alt = s.bt > 0 ? 1 : 0; // the dog is bolting
    if (alt) pace = 2.2;
  } else if (s.k === 'dog') {
    if (watching) alt = how.pee ? DOG_PEE : DOG_SIT;
  } else if (s.k === 'flasher') {
    if (s.fl > 0 && !leaving) alt = 1; // bathrobe open
  }
  const ph = F.time * K.step * pace + s.id * 1.7; // walking cycle, radians
  const cycle = (((ph / TAU) % 1) + 1) % 1;
  const frame = stunned && K.down ? DOWN : moving ? ((cycle * WALK_FRAMES) | 0) : STAND;
  const v = K.vars > 1 ? s.id % K.vars : 0;
  const sup = !!s.sup;
  const img = sprites.get(K, v, face, frame, alt, sup);
  const fy = sy + FEET;
  // The sprite's box around the feet; a super's is padded for the glow and drawn bigger.
  const z = sup ? SUP_SCALE : 1, pad = sup ? SUP_PAD : 0;
  const bx = (boxX(K, face) - pad) * z, by = (K.by - pad) * z;
  const bw = (K.bw + pad * 2) * z, bh = (K.bh + pad * 2) * z;
  const height = (sup && K.supTop ? K.supTop : K.top) * K.sc * z;

  if (leaving) {
    const fade = Math.max(0, Math.min(1, (s.t - F.alpha) / LEAVE_TICKS));
    ctx.globalAlpha = fade;
    ctx.drawImage(img, sx + bx + Math.sin(F.time * 60) * 1.2, fy + by, bw, bh); // shaking with rage
    ctx.globalAlpha = Math.min(1, fade * 1.6);
    puff(ctx, sx, fy - height - 4 - (1 - fade) * 10, 1 - fade);
    ctx.globalAlpha = 1;
    return;
  }
  let top = fy - height - (sup ? 7 : 0);
  if (stunned && s.k === 'drinker') {
    // Face down across the aisle, his bottle rolling away ahead of him, snoring.
    const def = defOf(s);
    const total = Math.max(1, Math.round((def.fallSecs || TUNE.fallSecs) * TICK_HZ));
    const roll = Math.min(1, (total - s.t + F.alpha) / 24);
    ctx.save();
    ctx.translate(sx + face * 2, fy - 2);
    ctx.rotate(face * Math.PI * 0.5);
    ctx.drawImage(img, bx, by + 12 * z, bw, bh);
    ctx.restore();
    ctx.save();
    ctx.translate(sx + face * (24 + roll * 14) * z, fy - 2);
    ctx.rotate(face * (Math.PI / 2 + roll * 7));
    drawBottle(ctx, 0, 6, sup);
    ctx.restore();
    const zz = (F.time * 0.8 + s.id * 0.3) % 1;
    ctx.globalAlpha = 1 - zz;
    label(ctx, 'z', sx + face * 18 * z + zz * 6, fy - 12 - zz * 16, 9 + zz * 5, '#ffffff', INK, 2.5);
    ctx.globalAlpha = 1;
    top = fy - 22 * z;
  } else if (stunned) {
    if (s.k === 'blind') {
      // His dog sits by him, ahead, looking back at him.
      const dimg = sprites.get(DOGSIT, 0, -face, STAND, 0);
      ctx.drawImage(dimg, sx + face * 21 * z + boxX(DOGSIT, -face), fy + DOGSIT.by, DOGSIT.bw, DOGSIT.bh);
    }
    // Flat on his back, feet toward where he was going, stars round his head.
    ctx.save();
    ctx.translate(sx - face * 2, fy - 3);
    ctx.rotate(-face * Math.PI * 0.47);
    ctx.drawImage(img, bx, by + 14 * z, bw, bh);
    ctx.restore();
    stars(ctx, sx - face * 16 * z, fy - 10, F.time);
  } else if (s.k === 'drinker') {
    // Weaving: rocking from side to side, lurching forward when his legs speed up, dawdling
    // when they slow down (s.sv is how fast they are going right now).
    const sv = s.sv || 1;
    const wob = Math.sin(F.time * 2.6 + s.id) * (0.07 + Math.min(0.1, Math.abs(sv - 1) * 0.1));
    const lean = sv > 1.3 ? 0.1 * face : sv < 0.8 ? -0.05 * face : 0;
    const bob = moving ? Math.abs(Math.cos(frame / WALK_FRAMES * TAU)) * 1.3 : 0;
    ctx.save();
    ctx.translate(sx + Math.sin(F.time * 1.7 + s.id) * 2.5, fy - bob);
    ctx.rotate(wob + lean);
    ctx.drawImage(img, bx, by, bw, bh);
    ctx.restore();
  } else {
    if (how.pee) peeStream(ctx, s, sx, fy, face, z, F.time, how.pee);
    const bob = moving && !crawling ? Math.abs(Math.cos(frame / WALK_FRAMES * TAU)) * (pace > 1 ? 2.2 : 1.3) : 0;
    ctx.drawImage(img, sx + bx, fy + by - bob, bw, bh);
    if (s.ru > 0 && moving) {
      // Hurrying away from the salesman.
      const k = (F.time * 3) % 1;
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        const x0 = sx - face * (12 + k * 4) * z, y0 = fy - (10 + j * 7) * z;
        ctx.moveTo(x0, y0); ctx.lineTo(x0 - face * (7 + (j % 2) * 3), y0);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
    }
  }
  if (crawling) {
    // Nothing can touch her while she crawls: the dashed ring says so.
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(F.time * 6);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.ellipse(sx + face * 2, fy - 8, 21 * z, 12 * z, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return; // no patience bar: she has none left, and it does not matter now
  }
  if (s.st === ST.BROWSE) thought(ctx, sx + 10, top - 10, s.k === 'clipper' ? '%' : '$');
  else if (watching && !how.pee && !(s.k === 'flasher')) eyes(ctx, sx + 9, top - 12, how.gawk, how.tv);
  // On his way over to a salesman's stand (s.sa): eyes on the television all the way there, so it
  // is plain why he has left the route.
  else if (s.sa !== undefined && !stunned) eyes(ctx, sx + 9, top - 12, false, true);
  if (!how.noBar && (s.k === 'dad' || sup || s.hp < s.mhp - 0.01)) patienceBar(ctx, sx, top - 4, s.hp / s.mhp, sup);
}

/** A dog's stream: an arc from his cocked leg to the security he is peeing on (at in tiles). */
function peeStream(ctx, s, sx, fy, face, z, t, at) {
  const big = !!s.sup;
  const x0 = sx - face * (big ? 21 : 15.5) * z, y0 = fy - (big ? 23 : 12.5) * z;
  const x1 = at[0] * TILE, y1 = at[1] * TILE;
  const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 10;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(160,130,10,0.9)';
  ctx.lineWidth = 3.6;
  ctx.stroke();
  ctx.setLineDash([5, 3]);
  ctx.lineDashOffset = -t * 40;
  ctx.strokeStyle = '#ffe14a';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.lineDashOffset = 0;
  ctx.beginPath();
  ctx.ellipse(x1, y1 + 2, 4 + Math.sin(t * 12) * 1.2, 2, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255,225,74,0.85)';
  ctx.fill();
}
