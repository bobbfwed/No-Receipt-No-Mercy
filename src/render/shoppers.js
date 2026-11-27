// Shoppers: fourteen kinds of small cartoon people (and one dog), drawn side-on in three-quarter
// view, facing the way they walk. Each kind is built from a few shared parts (limbs, head, face)
// plus its own props: trolley, coupons, dad cap and receipt, Karen hair and pointing finger,
// mobility scooter, hoodie and slushie, mom's trolley with a child in the seat, guide dog and white
// cane, the gym bro's boxed TV, the stray dog's mangy coat (and the Great Dane), the cosplayers'
// four costumes (and the mech suit), the exhibitionist's bathrobe (and what is under it), the day
// drinker's bottle in a bag, and the boss in a suit at each of his four ranks (1.6 times life, with
// his name plate and patience bar drawn over the crowd by drawBossTag), the Pregnant Lady with her
// bump and pickles (and Octomom, with her bump full of hands and feet), and the babies a Pregnant
// Lady pops into: tiny, in nappies, sprinting on all fours (no patience bar). In a holiday game
// the boss wears that holiday's outfit (DRESS, 0.3).
// A mom's runaway child is a separate little figure (drawKid); so is a cart a mom left behind
// (drawCart, for each entry in state.carts).
// The Card Trader (0.3.01) comes with a backpack, binder, lanyard and deck box, and rips a foil
// pack open as he gloats over the stock he ripped out of security (0.4; a Mystery Box off a belt
// until then); his super, the Scalper, pushes a hand truck of boxes.
//
// A big wave has well over a hundred shoppers, so each figure is drawn once per pose into a small
// offscreen canvas (a sprite) and then stamped with one drawImage. A pose is: kind, colour
// variant (or costume), facing, one of six walking frames, standing or lying down, and an "alt"
// number for other gestures (dad checking his watch, Karen shouting, the guide dog bolting, mom
// chasing, carrying or crawling, a dog peeing or sitting, the bathrobe open). Overlays such as the
// patience bar, the marks over someone watching something, a dog's stream and a drunk's rolling
// bottle are drawn directly every frame.
import { ST, TUNE, TICK_HZ, defOf, BOSS, HOLIDAYS, CARDS, idShare } from '../sim/index.js';
import { TILE, INK, C, rr, paint, box, circle, label, ramp, starPath, text, hazard, font } from './paint.js';
import { createPaintBudget, createSpriteCache } from './spritecache.js';

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
/** (The guide dog's own colours, under names the support dog's drawing can stand in for.) */
const DOG_COAT = DOG, DOG_COAT_DARK = DOG_DARK, HIVIS = VEST;
const KID_HAIR = '#e07b24';
// The mutt is ginger, not grey-brown: the old colours all but vanished on concrete when zoomed out.
const MUTT = '#c27a32', MUTT_DARK = '#8a4f1e', MUTT_PATCH = '#4f2f16', MUTT_CREAM = '#f6e2b8';
const DANE = '#d4d8dc', DANE_SPOT = '#2b2f34', DANE_DARK = '#9aa0a6';
const ROBE = '#f7a8c8', ROBE_DARK = '#d9759f', SLIPPER = '#ff9ccf';
const DRINK_SHIRTS = ['#ece6d2', '#9ec5e8', '#e8b49e', '#b8d8a8'];
const MAT_TOPS = ['#f78fc0', '#5fd4c4', '#b79cf5', '#ffd166'];
const PREG_HAIR = ['#2b2118', '#c9a15a', '#8a5a2b', '#b5452e'];
const BABY_HAIR = ['#c9a15a', '#5a3a1e', '#e07b24'];
const BABY_DUMMIES = ['#ff7eb6', '#5cc8ff', '#ffd23f'];
const BABY_TABS = ['#7dd3fc', '#ff9ccf', '#a3e635'];

/** Mom poses (the `alt` of her sprite). */
const MOM_CART = 0, MOM_CHASE = 1, MOM_CHASE_NOCART = 2, MOM_CARRY = 3, MOM_CRAWL_CART = 4, MOM_CRAWL = 5;
/** Dog poses. DOG_BUMP is added to any of them for a pregnant one (the spayed card, 0.3.01). */
const DOG_PEE = 1, DOG_SIT = 2, DOG_BUMP = 4;
/** The Man with Guide Dog's poses: bolting, and (added to it) an emotional support dog (the supportdog card). */
const BLIND_BOLT = 1, BLIND_ESA = 2;
/** Pregnant Lady pose: her patience nearly gone, about to pop. */
const PREG_STRAIN = 1;
/** Below this share of her patience she shows she is about to pop. */
const PREG_WARN = 0.3;

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
  // A little bigger than life (sc), so the mutt still reads at 16 pixels a tile.
  dog: {
    n: 11, sc: 1.12, top: 24, supTop: 43, step: 19, vars: 1, box: [-34, -58, 72, 70], crown: [18, -41],
    stillAlt: (1 << DOG_PEE) | (1 << DOG_SIT) | (1 << (DOG_PEE | DOG_BUMP)) | (1 << (DOG_SIT | DOG_BUMP)),
  },
  cosplay: { n: 12, sc: 1, top: 52, supTop: 64, step: 8, vars: 4, box: [-36, -78, 72, 90], crown: [1, -64] },
  flasher: { n: 13, sc: 1, top: 38, step: 8, vars: 1, crown: [0.5, -39], stillAlt: 2 },
  drinker: { n: 14, sc: 1, top: 36, supTop: 41, step: 9, vars: DRINK_SHIRTS.length, down: true, crown: [1, -41] },
  // The boss: 1.6 times life, slow and stately; a colour variant per tier (v = tier - 1). His box
  // is tall enough for a holiday hat (0.3; see DRESS), which is drawing only: `top` is his height.
  boss: { n: 16, sc: 1.6, top: 38, step: 6, vars: 4, box: [-44, -94, 92, 106], crown: [0, 0] },
  // The Pregnant Lady waddles (her drawing rocks by itself, so `still`); the crown is Octomom's.
  preggo: { n: 17, sc: 1.06, top: 38, supTop: 45, step: 7, vars: MAT_TOPS.length, still: true, box: [-30, -58, 64, 70], crown: [0.5, -40.5] },
  // Her babies: tiny, on all fours, a fast scrabbling cadence.
  baby: { n: 18, sc: 1.1, top: 17, step: 34, vars: BABY_HAIR.length, still: true, box: [-20, -22, 38, 26], crown: [8, -17] },
  // The Card Trader (0.3.01): wide for his backpack behind and, for the Scalper, the hand truck in
  // front. Ripping a pack he stands still (stillAlt).
  trader: { n: 19, sc: 1.02, top: 38, step: 10, vars: 4, box: [-34, -58, 70, 70], crown: [1.5, -37], stillAlt: 1 << 1 },
  // A pregnant Stray Dog's puppies (the spayed card, 0.3.01): tiny, a fast scrabble, three coats.
  pup: { n: 20, sc: 1.1, top: 15, step: 32, vars: 3, still: true, box: [-16, -20, 34, 24], crown: [6, -15] },
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
const CART = { n: 15, sc: 1, top: 16, step: 1, vars: 2, box: [-22, -26, 44, 34] };
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

/** An emotional support dog (the supportdog card): a cream doodle in a loud pink SUPPORT vest. */
const DOODLE = '#f1e2c4', DOODLE_DARK = '#c9ab7c', ESA_VEST = '#ff3d8b';

/**
 * A guide dog in a hi-vis harness, facing +x, body centred at x. run: stretched out at a full
 * gallop. esa: an emotional support dog instead (cream and curly, a big pink vest saying SUPPORT).
 * Returns nothing; the harness handle meets the body at (x + 0.5, top of the back).
 */
function guideDog(ctx, x, P, run, esa = false) {
  const sw = P.sw;
  const DOG = esa ? DOODLE : DOG_COAT, DOG_DARK = esa ? DOODLE_DARK : DOG_COAT_DARK;
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
  if (esa) {
    // The vest covers most of him, and says so.
    ctx.fillStyle = ESA_VEST;
    ctx.fillRect(x - rx * 0.75, by - 6, rx * 1.45, 12);
  } else {
    ctx.fillStyle = VEST;
    ctx.fillRect(x - 3, by - 6, 7, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 3, by - 1, 7, 1.6);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(x, by, rx, ry, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = OUT; ctx.stroke();
  if (esa) {
    print(ctx, 'SUPPORT', x, by - 0.4, 3.6, '#ffffff', P.face);
    // Curly topknot.
    for (let k = 0; k < 3; k++) circle(ctx, x + (run ? 10 : 8) + k * 1.6, by - (run ? 6 : 9.5) - (k % 2), 1.5, DOODLE, 0.9);
  }
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
  if (P.alt & BLIND_ESA) { esaOwner(ctx, P); return; }
  const bolt = P.alt & BLIND_BOLT; // the dog has bolted and is dragging him along
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

/**
 * Someone with an emotional support dog (the supportdog card): the same pair as the Man with Guide
 * Dog, but a young man who can see perfectly well: no dark glasses, no cane, a man bun and an iced
 * coffee, the doodle on a pink lead instead of a harness. alt BLIND_BOLT: the dog has bolted (pepper
 * spray) and drags him along, coffee flying.
 */
function esaOwner(ctx, P) {
  const bolt = P.alt & BLIND_BOLT;
  const sw = P.sw;
  const lean = bolt ? -0.3 : P.moving ? 0.07 : 0;
  const cs = Math.cos(lean), sn = Math.sin(lean);
  const lhx = bolt ? 12.5 : 9.5, lhy = bolt ? -19 : -15.5;
  const hX = lhx * cs - lhy * sn, hY = lhx * sn + lhy * cs;
  const dogX = bolt ? 31 : 22;
  if (!P.down) guideDog(ctx, dogX, P, bolt, true);
  if (bolt && P.moving) speedLines(ctx, -11, -27, P.ph, 9, 8);
  ctx.save();
  ctx.rotate(lean);
  const hoodie = '#5fbf9f';
  if (bolt) {
    limb(ctx, -2.5, -9, 3 + sw, -1.5, '#c9b28e');
    shoe(ctx, 3 + sw, -0.8, '#ffffff');
    limb(ctx, 2, -9, 7 - sw, -1.5, '#d8c29e');
    shoe(ctx, 7 - sw, -0.8, '#ffffff');
  } else {
    limb(ctx, -2.5, -9, -2.5 - sw * 2.4, -1.5, '#c9b28e');
    shoe(ctx, -2.5 - sw * 2.4, -0.8, '#ffffff');
    limb(ctx, 2, -9, 2 + sw * 2.4, -1.5, '#d8c29e');
    shoe(ctx, 2 + sw * 2.4, -0.8, '#ffffff');
  }
  ctx.beginPath();
  ctx.ellipse(0, -15, 7.2, 7.6, 0, 0, TAU);
  paint(ctx, hoodie, OUT);
  // Head: a man bun, open eyes, a smug little smile.
  const x = 1.5, y = -26.5;
  head(ctx, x, y, 6.6);
  hairCap(ctx, x, y, 6.6, '#6b4423');
  circle(ctx, x - 4.6, y - 6.4, 2.6, '#6b4423', 1.2);
  face(ctx, x, y, bolt ? 2 : 1);
  if (!bolt) {
    ctx.beginPath(); // a smug little smile: he is very calm, thank you
    ctx.moveTo(x + 1.6, y + 2.8); ctx.quadraticCurveTo(x + 3.6, y + 4.6, x + 5.6, y + 2.6);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke();
  }
  // The other hand: an iced coffee with a straw (thrown up in the air when the dog bolts).
  const cx1 = bolt ? -7 : -4.5, cy1 = bolt ? -27 : -14;
  limb(ctx, -2, -19.5, cx1, cy1, hoodie, 3);
  box(ctx, cx1 - 2.2, cy1 - 7, 4.4, 7, 1, '#c98b5a', 1.1);
  limb(ctx, cx1 + 0.8, cy1 - 7, cx1 + 2, cy1 - 10, '#2fbf71', 1);
  circle(ctx, cx1, cy1, 1.9, C.skin, 1.1);
  limb(ctx, 2, -19.5, lhx, lhy, hoodie, 3);
  ctx.restore();
  if (!P.down) {
    // A pink lead, slack, down to the dog's collar.
    const ax = dogX + 6, ay = (bolt ? -13 : -14);
    ctx.beginPath();
    ctx.moveTo(hX, hY);
    ctx.quadraticCurveTo((hX + ax) / 2, Math.max(hY, ay) + (bolt ? 1 : 6), ax, ay);
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.strokeStyle = ESA_VEST; ctx.lineWidth = 1.2; ctx.stroke();
  }
  circle(ctx, hX, hY, 2, C.skin, 1.2);
}

/** The guide dog sitting by its fallen owner, waiting (P.v 1: an emotional support dog). */
function dogSit(ctx, P) {
  const esa = P && P.v === 1;
  const DOG = esa ? DOODLE : DOG_COAT, DOG_DARK = esa ? DOODLE_DARK : DOG_COAT_DARK, VEST = esa ? ESA_VEST : HIVIS;
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
function shaggy(ctx, x, y, rx, ry, col, n = 12, lw = OUT) {
  ctx.beginPath();
  for (let k = 0; k <= n * 2; k++) {
    const a = (k / (n * 2)) * TAU;
    const r = k % 2 && Math.sin(a) < 0.3 ? 1.24 : 1;
    const px = x + Math.cos(a) * rx * r, py = y + Math.sin(a) * ry * r;
    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  paint(ctx, col, lw);
}

/** Outline width on the mutt: heavier than on people, so the little dog survives zooming out. */
const DOG_OUT = 2.3;

/** The mutt's head, facing +x, centred on (x, y). */
function muttHead(ctx, x, y) {
  // Muzzle (pale), then the shaggy head over its back half.
  ctx.beginPath();
  ctx.ellipse(x + 4.6, y + 1.6, 3.8, 2.7, 0, 0, TAU);
  paint(ctx, MUTT_CREAM, 1.6);
  shaggy(ctx, x, y, 5, 4.6, MUTT, 7, DOG_OUT);
  // One ear up, one flopped over.
  ctx.beginPath(); ctx.moveTo(x - 3.4, y - 2.5); ctx.lineTo(x - 1.8, y - 10.5); ctx.lineTo(x + 1.4, y - 3.6); ctx.closePath();
  paint(ctx, MUTT_DARK, 1.6);
  ctx.beginPath(); ctx.ellipse(x - 3.4, y + 1, 2.1, 3.8, 0.4, 0, TAU);
  paint(ctx, MUTT_DARK, 1.4);
  // Eye patch, eye, nose, tongue.
  ctx.beginPath(); ctx.arc(x + 1.9, y - 1, 2.3, 0, TAU); ctx.fillStyle = MUTT_PATCH; ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + 2.1, y - 1.1, 1.2, 0, TAU); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 2.4, y - 1.1, 0.75, 0, TAU); ctx.fill();
  circle(ctx, x + 8.2, y + 1, 1.6, INK, 0);
  ctx.beginPath(); ctx.ellipse(x + 5, y + 4.8, 1.3, 2.3, 0.2, 0, TAU);
  paint(ctx, '#ff6b8a', 0.9);
}

/** A dog's leg with a pale paw. */
function dogLeg(ctx, x1, y1, x2, y2, col, w) {
  limb(ctx, x1, y1, x2, y2, col, w);
  ctx.beginPath();
  ctx.ellipse(x2 + 0.8, y2 + 0.2, w * 0.62, w * 0.42, 0, 0, TAU);
  paint(ctx, MUTT_CREAM, 1.2);
}

/**
 * A pregnant dog's belly (the spayed card): a full, low bulge centred on (x, y), in the colour of
 * her underside, with a row of teats, so a player can pick her out and save the laser for her.
 */
/** A pregnant dog's belly: pinker than the rest of her, so it shows at a distance. */
const BELLY = '#f5c4b0';
function dogBelly(ctx, x, y, rx, ry, col) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  paint(ctx, col, DOG_OUT * 0.8);
  ctx.fillStyle = '#e0457b';
  ctx.beginPath();
  for (let k = 0; k < 4; k++) { const tx = x - rx * 0.55 + k * rx * 0.37; ctx.moveTo(tx + 1.1, y + ry * 0.6); ctx.arc(tx, y + ry * 0.6, 1.1, 0, TAU); }
  ctx.fill();
}

/**
 * A scruffy stray mutt, fast and low: a ginger coat with a dark saddle, pale chest, muzzle and paws,
 * and a thick outline, so he still shows on grey concrete when zoomed out. alt DOG_PEE: back leg
 * cocked (the stream is drawn live, toward whatever he is peeing on, behind him); DOG_SIT: sitting
 * with his head on one side, watching something. The super is a Great Dane.
 */
function strayDog(ctx, P) {
  if (P.sup) { greatDane(ctx, P); return; }
  const sw = P.sw;
  const bump = P.alt & DOG_BUMP, pose = P.alt & 3;
  if (pose === DOG_SIT) {
    limb(ctx, -6, -2, -13, -1.5, MUTT, 3); // tail on the floor
    shaggy(ctx, -2, -8, 6.6, 7, MUTT, 8, DOG_OUT);
    ctx.beginPath(); ctx.ellipse(-3.8, -10, 3.2, 2.2, 0, 0, TAU); ctx.fillStyle = MUTT_PATCH; ctx.fill();
    ctx.beginPath(); ctx.ellipse(2.4, -9, 2.6, 3.4, 0.2, 0, TAU); ctx.fillStyle = MUTT_CREAM; ctx.fill();
    if (bump) dogBelly(ctx, 0.5, -3.6, 7, 3.8, BELLY);
    dogLeg(ctx, 0.5, -7, 0.8, -1, MUTT_DARK, 3);
    dogLeg(ctx, 3, -7, 3.4, -1, MUTT, 3.3);
    ctx.save(); ctx.translate(3.8, -17); ctx.rotate(0.3); muttHead(ctx, 0, 0); ctx.restore();
    return;
  }
  const pee = pose === DOG_PEE;
  const by = -11;
  const wag = Math.sin(P.ph * TAU * 2) * 2;
  // Tail up, with a pale tip.
  limb(ctx, -10, by - 2, -15 + wag * 0.3, by - 10 + wag, MUTT, 3);
  circle(ctx, -15 + wag * 0.3, by - 10 + wag, 1.9, MUTT_CREAM, 1.2);
  dogLeg(ctx, -6.5, by + 2, -6.5 - sw * 3.4, -1, MUTT_DARK, 3);
  dogLeg(ctx, 6.5, by + 2, 6.5 + sw * 3.4, -1, MUTT_DARK, 3);
  shaggy(ctx, 0, by, 11, 6, MUTT, 12, DOG_OUT);
  // Dark saddle and a pale chest.
  ctx.beginPath(); ctx.ellipse(-2.5, by - 2.6, 5, 2.6, 0, 0, TAU); ctx.fillStyle = MUTT_PATCH; ctx.fill();
  ctx.beginPath(); ctx.ellipse(8, by + 1.6, 3, 3.2, 0, 0, TAU); ctx.fillStyle = MUTT_CREAM; ctx.fill();
  // Pregnant: a full belly hanging low between her legs, nearly scraping the floor.
  if (bump) dogBelly(ctx, 0.5, by + 5.8, 8.8, 5.2, BELLY);
  if (pee) {
    // Back leg cocked up and out behind him.
    limb(ctx, -6, by + 1, -13.5, by - 5, MUTT, 3.3);
    dogLeg(ctx, -13.5, by - 5, -17, by - 3.5, MUTT, 2.8);
  } else {
    dogLeg(ctx, -5, by + 2, -5 + sw * 3.4, -1, MUTT, 3.3);
  }
  dogLeg(ctx, 7.5, by + 2, 7.5 - sw * 3.4, -1, MUTT, 3.3);
  muttHead(ctx, 12, by - 5.5);
}

/**
 * The super stray: a Great Dane. A horse of a dog: a long level back, a deep chest and tucked-up
 * belly, long legs with a proper bend at the back ones, a short thick neck in a spiked collar, and a
 * big square head with hanging jowls, a floppy black ear and a string of drool. Grey with black
 * patches.
 */
function greatDane(ctx, P) {
  const sw = P.sw;
  /** The head, with the skull centred on (x, y), looking +x. */
  const headAt = (x, y) => {
    // The floppy ear behind, then the skull, the long square muzzle and the jowls hanging off it.
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 5); ctx.quadraticCurveTo(x - 9, y - 1, x - 6, y + 6); ctx.lineTo(x - 1.5, y);
    ctx.closePath();
    paint(ctx, DANE_SPOT, 1.6);
    rr(ctx, x - 6.5, y - 5.5, 13, 11, 5);
    paint(ctx, DANE, OUT);
    ctx.beginPath();
    ctx.moveTo(x + 2.5, y + 4.5); ctx.quadraticCurveTo(x + 7.5, y + 11, x + 12.8, y + 4.6);
    ctx.closePath();
    paint(ctx, DANE_DARK, 1.6);
    rr(ctx, x + 2, y - 2.6, 11.5, 8, 2.8);
    paint(ctx, DANE, OUT);
    // Nose, the black patch round his eye, a heavy brow.
    rr(ctx, x + 10.6, y - 3, 3.6, 3.4, 1.3);
    ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 1.4, y - 1.4, 3, 2.5, 0, 0, TAU); ctx.fillStyle = DANE_SPOT; ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + 1.8, y - 1.5, 1.3, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 2.2, y - 1.4, 0.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 1.6, y - 4.6); ctx.lineTo(x + 4, y - 3.6);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.stroke();
    // Drool off the jowl.
    ctx.beginPath(); ctx.moveTo(x + 8.5, y + 7.6); ctx.quadraticCurveTo(x + 9.6, y + 11, x + 8.8, y + 14);
    ctx.strokeStyle = 'rgba(200,235,255,0.95)'; ctx.lineWidth = 1.5; ctx.stroke();
    circle(ctx, x + 8.8, y + 14.4, 1.2, 'rgba(200,235,255,0.95)', 0);
  };
  /** A spiked red collar across a neck at (x, y), turned by a. */
  const collar = (x, y, a) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) { const sx = -4.5 + k * 3; ctx.moveTo(sx - 1.1, -1.4); ctx.lineTo(sx, -4.2); ctx.lineTo(sx + 1.1, -1.4); }
    paint(ctx, '#e6ebef', 1);
    box(ctx, -6.2, -1.8, 12.4, 3.6, 1.2, '#d9372b', 1.3);
    ctx.restore();
  };
  /** Black patches over whatever path is current (clipped to it). */
  const patches = (pts) => {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = DANE_SPOT;
    ctx.beginPath();
    for (let k = 0; k < pts.length; k += 5) ctx.ellipse(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], pts[k + 4], 0, TAU);
    ctx.fill();
    ctx.restore();
  };
  const paw = (x, y, col) => { ctx.beginPath(); ctx.ellipse(x + 1, y, 3, 1.9, 0, 0, TAU); paint(ctx, col, 1.4); };
  const bump = P.alt & DOG_BUMP, pose = P.alt & 3;
  if (pose === DOG_SIT) {
    // Sitting up tall: the haunch on the floor, chest up, front legs straight, head held high.
    limb(ctx, -12, -2.5, -22, -1.5, DANE, 2.4); // tail along the floor
    ctx.beginPath(); ctx.ellipse(-6, -9, 9.5, 8.5, 0, 0, TAU); paint(ctx, DANE, OUT);
    ctx.beginPath(); ctx.ellipse(-6, -9, 9.5, 8.5, 0, 0, TAU); patches([-9, -12, 3.6, 2.4, 0.3, -2, -5, 2.6, 1.8, 0]);
    paw(-1, -1.5, DANE);
    if (bump) dogBelly(ctx, 1, -6, 7.5, 5, DANE);
    limb(ctx, 6, -15, 6.5, -1.5, DANE_DARK, 4.4);
    paw(6.5, -1, DANE_DARK);
    ctx.beginPath(); ctx.ellipse(3, -20, 7.6, 12, 0.28, 0, TAU); paint(ctx, DANE, OUT);
    ctx.beginPath(); ctx.ellipse(3, -20, 7.6, 12, 0.28, 0, TAU); patches([0, -24, 3, 2.2, 0.2, 5, -14, 2.4, 3, 0]);
    limb(ctx, 9, -15, 9.8, -1.5, DANE, 4.6);
    paw(9.8, -1, DANE);
    limb(ctx, 6, -28, 10.5, -36, DANE, 8.5); // short thick neck
    collar(7.6, -31, 0.5);
    headAt(13, -41);
    return;
  }
  const pee = pose === DOG_PEE;
  // Long thin tail hanging down from the rump, swinging as he walks.
  ctx.beginPath();
  ctx.moveTo(-18, -23); ctx.quadraticCurveTo(-23, -18 + sw, -22 - sw * 1.5, -9);
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 4.4; ctx.stroke();
  ctx.strokeStyle = DANE; ctx.lineWidth = 2.2; ctx.stroke();
  // Far legs (darker): front straight, back with the hock bent backward.
  limb(ctx, 11, -13, 11 + sw * 4.5, -1, DANE_DARK, 4.4);
  paw(11 + sw * 4.5, -0.6, DANE_DARK);
  limb(ctx, -10, -16, -14 - sw * 2, -7, DANE_DARK, 4.6);
  limb(ctx, -14 - sw * 2, -7, -12 - sw * 4.5, -1, DANE_DARK, 4);
  paw(-12 - sw * 4.5, -0.6, DANE_DARK);
  // The body: level back, deep chest, belly tucked up toward the hind legs.
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-14, -27);
    ctx.lineTo(9, -27);
    ctx.quadraticCurveTo(15.5, -27, 16.5, -19.5);
    ctx.quadraticCurveTo(17, -10.5, 9, -10);
    ctx.quadraticCurveTo(1, -10, -4, -15.5);
    ctx.quadraticCurveTo(-9, -16.5, -13, -13.5);
    ctx.quadraticCurveTo(-19.5, -14, -19.5, -20.5);
    ctx.quadraticCurveTo(-19.5, -27, -14, -27);
    ctx.closePath();
  };
  body();
  ctx.lineJoin = 'round';
  paint(ctx, DANE, OUT);
  body();
  patches([-11, -23, 4.2, 2.6, 0.3, 1, -25, 3.2, 2, -0.2, 7, -16, 2.8, 2.2, 0, -6, -17, 2.4, 1.6, 0.2]);
  // Pregnant: the tucked-up belly is not tucked up any more.
  if (bump) dogBelly(ctx, 1, -11, 10, 5.6, DANE);
  // Near legs.
  if (pee) {
    // Back leg cocked up and out behind him.
    limb(ctx, -13, -16, -21, -21, DANE, 5);
    limb(ctx, -21, -21, -25.5, -18, DANE, 4.2);
  } else {
    limb(ctx, -13, -16, -17 + sw * 2, -7, DANE, 5);
    limb(ctx, -17 + sw * 2, -7, -15 + sw * 4.5, -1, DANE, 4.4);
    paw(-15 + sw * 4.5, -0.6, DANE);
  }
  limb(ctx, 8, -13, 8 - sw * 4.5, -1, DANE, 4.8);
  paw(8 - sw * 4.5, -0.6, DANE);
  // Short thick neck up from the withers, the collar, then the head.
  limb(ctx, 10.5, -24, 15.5, -31.5, DANE, 9);
  collar(13.2, -28.2, 0.58);
  headAt(19, -36);
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

/**
 * A trolley tipped over on its nose, back wheels in the air, the cereal spilled out of it. A
 * Soccer Mom's (P.v 1) spills a football and orange slices instead.
 */
function cartDown(ctx, P) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(1, 0, 15, 3.5, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(-14, 0);
  ctx.translate(20, -2);
  ctx.rotate(0.75);
  ctx.translate(-20, 2);
  trolley(ctx);
  ctx.restore();
  if (P.v === 1) {
    // A football rolled out, and the half-time orange slices.
    circle(ctx, 15, -3.2, 3.6, '#ffffff', 1.3);
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(15, -3.2, 1.3, 0, TAU); ctx.fill();
    ctx.fillRect(12.2, -4.6, 1, 1); ctx.fillRect(17, -1.6, 1, 1);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(7 + k * 4, 0.6 + (k % 2), 1.9, Math.PI, 0);
      ctx.closePath();
      paint(ctx, '#ff9a1f', 0.8);
    }
    return;
  }
  ctx.save();
  ctx.translate(14, -2.5);
  ctx.rotate(0.9);
  box(ctx, -3, -3, 6, 5.5, 1, '#ffd23f', 1.2);
  ctx.fillStyle = C.red; ctx.fillRect(-2, -1.5, 4, 1.4);
  ctx.restore();
  ctx.fillStyle = '#e8c070';
  for (let k = 0; k < 6; k++) ctx.fillRect(9 + k * 2.4, -0.8 + (k % 2) * 1.2, 1.6, 1.4);
}

// --- the boss ----------------------------------------------------------------------------------
// One suit, four ranks (P.v is his tier minus one): each a little more senior and a lot more
// ridiculous. Drawn at KIND.boss.sc (1.6 times life), bigger than any super.

/** Per tier: suit, its shadow side, tie, lanyard. */
const BOSS_SUIT = ['#8a919b', '#2b3d6b', '#3b404b', '#1b1c22'];
const BOSS_SUIT_DARK = ['#6a7079', '#1d2a4d', '#2a2e37', '#0f1014'];
const BOSS_TIE = ['#d9372b', '#f2c21b', '#8e44ad', '#ffd23f'];
const BOSS_LANYARD = ['#2f8fe0', '#d9372b', '#14b8a6', '#ffd23f'];
/** Boss poses (the `alt` of his sprite). */
const BOSS_PEP = 1, BOSS_STORM = 2;

/** His face, looking +x from (x, y): mood 0 smug, 1 shouting a pep talk, 2 apoplectic. */
function bossFace(ctx, x, y, mood) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x + 1.4, y - 0.6, 1.2, 0, TAU);
  ctx.arc(x + 5.2, y - 0.6, 1.2, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  if (mood === 2) {
    ctx.moveTo(x - 0.6, y - 4.2); ctx.lineTo(x + 2.6, y - 2.4);
    ctx.moveTo(x + 7, y - 4.2); ctx.lineTo(x + 4, y - 2.4);
  } else {
    // Smug: one brow flat, one arched right up.
    ctx.moveTo(x - 0.2, y - 3.4); ctx.lineTo(x + 2.8, y - 3.4);
    ctx.moveTo(x + 3.8, y - 4.2); ctx.quadraticCurveTo(x + 5.3, y - 6, x + 6.8, y - 4.4);
  }
  ctx.stroke();
  if (mood === 0) {
    // A big smarmy grin.
    ctx.beginPath();
    ctx.moveTo(x + 1.2, y + 2.6); ctx.quadraticCurveTo(x + 4.2, y + 5.4, x + 7, y + 2);
    ctx.lineTo(x + 6.4, y + 3.2); ctx.quadraticCurveTo(x + 4.2, y + 4.6, x + 1.8, y + 3.2);
    ctx.closePath();
    paint(ctx, '#ffffff', 1.1);
  } else {
    ctx.beginPath();
    ctx.ellipse(x + 4.2, y + 3.4, 2.6, mood === 2 ? 2.6 : 2.2, 0, 0, TAU);
    paint(ctx, '#7a1010', 1.1);
  }
  // A double chin.
  ctx.beginPath();
  ctx.moveTo(x - 1, y + 6.4); ctx.quadraticCurveTo(x + 2.5, y + 8.2, x + 5.5, y + 6.2);
  ctx.strokeStyle = C.skinDark; ctx.lineWidth = 1.2; ctx.stroke();
}

/** A clipboard centred on (x, y), turned by a: a board, a page with ticks, a steel clip. */
function clipboard(ctx, x, y, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  box(ctx, -4.5, -6.5, 9, 13, 1, '#a0703a', 1.4);
  box(ctx, -3.4, -4.8, 6.8, 10.4, 0.5, '#ffffff', 0.8);
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const ly = -2.6 + k * 2.8;
    ctx.moveTo(-2.6, ly); ctx.lineTo(-1.8, ly + 0.9); ctx.lineTo(-0.6, ly - 0.8);
    ctx.moveTo(0.4, ly); ctx.lineTo(2.6, ly);
  }
  ctx.strokeStyle = '#2f8fe0'; ctx.lineWidth = 0.8; ctx.stroke();
  box(ctx, -2, -7.6, 4, 2.4, 0.8, '#c9ced4', 0.9);
  ctx.restore();
}

/** A phone in a hand at (x, y), screen lit. */
function phone(ctx, x, y, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  box(ctx, -1.8, -3.4, 3.6, 6.8, 0.9, '#1d2125', 1);
  ctx.fillStyle = '#7fd3ff';
  ctx.fillRect(-1.1, -2.6, 2.2, 4.6);
  ctx.restore();
}

function boss(ctx, P) {
  const tier = P.v, sw = P.sw;
  const up = P.alt === BOSS_PEP || P.alt === BOSS_STORM;
  // A holiday outfit (0.3) may change his colours and adds its own parts (see DRESS).
  const D = DRESS[P.dress] || NO_DRESS;
  const suit = D.suit || BOSS_SUIT[tier], dark = D.dark || BOSS_SUIT_DARK[tier];
  if (D.back) D.back(ctx, P);
  // Behind him: tier 2's wheeled briefcase, tier 4's golf club over his shoulder, and his back arm.
  if (tier === 1) {
    box(ctx, -23, -13, 11, 12.5, 2, '#2b2f34', 1.6);
    ctx.fillStyle = '#4b5058'; ctx.fillRect(-21.5, -9, 8, 1.4);
    circle(ctx, -21, -0.6, 1.7, '#111', 1);
    circle(ctx, -14, -0.6, 1.7, '#111', 1);
    ctx.beginPath(); ctx.moveTo(-14, -13); ctx.lineTo(-7.5, -18.5);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 1.2; ctx.stroke();
    limb(ctx, -1, -19.5, -7, -18.5, dark, 3.4);
    circle(ctx, -7.5, -18.5, 1.9, C.skin, 1);
  } else if (tier === 2) {
    // Arm up to the phone clamped to his ear (the phone is drawn over his head, below).
    limb(ctx, -1.5, -19.5, -4, -25.5, dark, 3.4);
  } else if (tier === 3) {
    // Golf club over the shoulder, held at the grip in front of it.
    ctx.beginPath(); ctx.moveTo(4, -20); ctx.lineTo(-15, -35);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = '#d4d8dc'; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.save(); ctx.translate(-15, -35); ctx.rotate(0.7);
    box(ctx, -1.5, -1.5, 6, 3.2, 1.2, '#c9ced4', 1.2);
    ctx.restore();
    limb(ctx, -1, -19.5, 3, -20, dark, 3.4);
  } else {
    limb(ctx, -1.5, -19.5, -4.5 - sw * 1.5, -12, dark, 3.4);
    circle(ctx, -4.8 - sw * 1.5, -12.5, 1.9, C.skin, 1);
  }
  // Legs: suit trousers and polished black shoes.
  if (D.legs) D.legs(ctx, P);
  else bossLegs(ctx, sw, D.trousersDark || dark, D.trousers || suit);
  if (D.hips) D.hips(ctx, P);
  // The Vice President's long camel coat, open over the suit.
  if (tier === 2) {
    ctx.beginPath();
    ctx.moveTo(-6, -23); ctx.lineTo(-9.5, -4); ctx.lineTo(10, -4); ctx.lineTo(7, -23);
    ctx.closePath();
    paint(ctx, '#b58b56', OUT);
  }
  // Jacket over a belly.
  ctx.beginPath();
  ctx.ellipse(1.2, -16, 8.6, 8.2, 0, 0, TAU);
  paint(ctx, suit, OUT);
  if (tier === 3) {
    // Pinstripes.
    ctx.save();
    ctx.beginPath(); ctx.ellipse(1.2, -16, 8.6, 8.2, 0, 0, TAU); ctx.clip();
    ctx.beginPath();
    for (let x = -6; x <= 9; x += 2.4) { ctx.moveTo(x, -25); ctx.lineTo(x, -7); }
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.restore();
  }
  if (D.body) D.body(ctx, P);
  // The Regional Manager's free hand holds the outfit's prop, at his side.
  if (D.hand && tier === 0) {
    const x = -4.8 - sw * 1.5, y = -12.5;
    D.hand(ctx, x, y);
    circle(ctx, x, y, 1.9, C.skin, 1);
  }
  // Shirt, tie (flung over his shoulder when he storms off), lanyard and its badge.
  ctx.beginPath(); ctx.moveTo(-0.4, -23.8); ctx.lineTo(2.2, -17.5); ctx.lineTo(4.8, -23.8); ctx.closePath();
  paint(ctx, '#ffffff', 1.1);
  if (P.alt === BOSS_STORM) {
    ctx.beginPath(); ctx.moveTo(1.4, -23); ctx.quadraticCurveTo(-3, -27, -7, -24); ctx.lineTo(-6, -22); ctx.quadraticCurveTo(-3, -24.5, 2.6, -22);
    ctx.closePath();
    paint(ctx, D.tie || BOSS_TIE[tier], 1);
  } else {
    ctx.beginPath(); ctx.moveTo(1.4, -22.8); ctx.lineTo(3, -22.8); ctx.lineTo(4.2, -13.2); ctx.lineTo(2.2, -11); ctx.lineTo(0.6, -13.2); ctx.closePath();
    paint(ctx, D.tie || BOSS_TIE[tier], 1);
  }
  ctx.beginPath(); ctx.moveTo(-0.6, -23.4); ctx.lineTo(5.8, -15.6); ctx.moveTo(4.6, -23.4); ctx.lineTo(6.6, -15.6);
  ctx.strokeStyle = BOSS_LANYARD[tier]; ctx.lineWidth = 1.3; ctx.stroke();
  box(ctx, 4, -16, 5.2, 6.4, 0.8, '#ffffff', 0.9);
  ctx.fillStyle = BOSS_LANYARD[tier]; ctx.fillRect(4.5, -15.4, 4.2, 1.5);
  ctx.fillStyle = '#c9a07a'; ctx.fillRect(4.7, -13.4, 2, 2.2);
  if (D.over) D.over(ctx, P);
  // A raised arm goes up behind his head (drawn first, so it never crosses his face).
  if (up) {
    limb(ctx, 2.5, -19.5, 10, -34, suit, 3.6);
    if (tier === 3) {
      circle(ctx, 10.4, -35, 2.4, C.skin, 1.1);
      box(ctx, 8, -32.4, 4.6, 2, 0.6, GOLD, 0.8); // the gold watch
    } else {
      clipboard(ctx, 12, -38, P.alt === BOSS_STORM ? 0.9 : 0.25);
      circle(ctx, 10.4, -34.4, 2, C.skin, 1.1);
    }
  }
  // Head.
  const hx = 1.6, hy = -29.5;
  if (tier === 2) {
    // The coat's collar turned up round his neck.
    ctx.beginPath(); ctx.moveTo(-5, -25.5); ctx.lineTo(-2, -21); ctx.lineTo(-6, -22); ctx.closePath();
    paint(ctx, '#9a7444', 1.1);
  }
  head(ctx, hx, hy, 7.4);
  if (tier === 0) {
    // Bald, with a brave comb-over.
    ctx.beginPath();
    ctx.moveTo(hx - 5.5, hy - 3); ctx.quadraticCurveTo(hx, hy - 9.4, hx + 5, hy - 5.2);
    ctx.moveTo(hx - 5.8, hy - 1.4); ctx.quadraticCurveTo(hx, hy - 7.8, hx + 5.6, hy - 3.4);
    ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(hx - 5.8, hy + 0.5, 2, Math.PI * 0.5, Math.PI * 1.5); ctx.fillStyle = '#5a3a1e'; ctx.fill();
  } else if (tier === 1) {
    hairCap(ctx, hx, hy, 7.4, '#3b2a1e');
    // Headset: band over the head, earpiece, boom to his mouth.
    ctx.beginPath(); ctx.arc(hx - 0.6, hy, 8.2, Math.PI * 1.1, Math.PI * 1.75);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
    circle(ctx, hx - 5.2, hy + 0.2, 2.4, '#2b2f34', 1.1);
    ctx.beginPath(); ctx.moveTo(hx - 4, hy + 2); ctx.quadraticCurveTo(hx, hy + 6.5, hx + 4.5, hy + 4.6);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    circle(ctx, hx + 4.8, hy + 4.4, 1.1, '#2b2f34', 0.8);
  } else if (tier === 2) {
    hairCap(ctx, hx, hy, 7.4, '#c3c8ce');
    // Sunglasses pushed up on his head.
    ctx.beginPath(); ctx.ellipse(hx + 1.2, hy - 7.2, 2.3, 1.3, -0.25, 0, TAU); ctx.ellipse(hx + 5.2, hy - 6, 2.1, 1.2, 0.3, 0, TAU);
    ctx.fillStyle = '#14181c'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(hx + 0.4, hy - 7.8, 1.2, 0.6);
  } else {
    // Slicked silver hair.
    ctx.beginPath();
    ctx.arc(hx, hy, 8, Math.PI * 0.95, Math.PI * 1.85);
    ctx.quadraticCurveTo(hx + 1, hy - 5.4, hx - 7.6, hy + 1);
    ctx.closePath();
    paint(ctx, '#e3e6ea', 1.4);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(hx - 3, hy - 7.6, 5, 1);
  }
  bossFace(ctx, hx, hy + 0.4, P.alt === BOSS_STORM ? 2 : P.alt === BOSS_PEP ? 1 : 0);
  if (D.head) D.head(ctx, P, hx, hy);
  if (tier === 3 && P.alt !== BOSS_PEP) {
    // A fat cigar, lit.
    ctx.save(); ctx.translate(hx + 6.4, hy + 3.4); ctx.rotate(-0.15);
    box(ctx, 0, -1.1, 7, 2.4, 1, '#7a4a22', 0.9);
    ctx.fillStyle = '#ff6a1a'; ctx.fillRect(6.2, -0.8, 1.2, 1.8);
    ctx.restore();
  }
  if (tier === 2) {
    // The phone at his ear, over the back of his head.
    phone(ctx, hx - 4.6, hy + 0.6, -0.25);
    circle(ctx, hx - 5, hy + 3.6, 1.9, C.skin, 1);
  }
  // Front arm (unless it is in the air): holding his prop out in front.
  if (up) {
    // (Drawn before the head.)
  } else if (tier === 2) {
    // Clipboard tucked under the arm, a second phone in his hand, eyes on it.
    clipboard(ctx, 6, -14, 1.35);
    limb(ctx, 2.5, -19.5, 9.5, -16.5, suit, 3.6);
    phone(ctx, 11, -18.5, 0.3);
    circle(ctx, 10, -16.8, 1.9, C.skin, 1);
  } else if (tier === 3) {
    // The leash, down to a tiny dog trotting ahead of him, and the gold watch.
    limb(ctx, 2.5, -19.5, 9, -15, suit, 3.6);
    box(ctx, 6.4, -17, 4.4, 2, 0.6, GOLD, 0.8);
    circle(ctx, 9.4, -14.6, 2, C.skin, 1);
    const tx = 21, ty = -3.5, hop = Math.abs(sw) * 0.8;
    ctx.beginPath(); ctx.moveTo(10, -15); ctx.quadraticCurveTo(15, -6, tx + 2, ty - 3 - hop);
    ctx.strokeStyle = '#ff5fa8'; ctx.lineWidth = 0.9; ctx.stroke();
    limb(ctx, tx - 2, ty, tx - 2 - sw, -0.6, '#d9a066', 1);
    limb(ctx, tx + 2, ty, tx + 2 + sw, -0.6, '#d9a066', 1);
    ctx.beginPath(); ctx.ellipse(tx, ty - hop, 3.4, 2.1, 0, 0, TAU); paint(ctx, '#e3b07a', 1);
    circle(ctx, tx + 3.6, ty - 2.8 - hop, 2.2, '#e3b07a', 1);
    ctx.beginPath(); ctx.moveTo(tx + 2.4, ty - 4.2 - hop); ctx.lineTo(tx + 2, ty - 7.8 - hop); ctx.lineTo(tx + 4, ty - 4.8 - hop); ctx.closePath();
    paint(ctx, '#e3b07a', 0.9);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(tx + 4.4, ty - 3.2 - hop, 0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff5fa8'; ctx.fillRect(tx + 1.8, ty - 1.4 - hop, 1.6, 1); // a pink collar
  } else {
    limb(ctx, 2.5, -19.5, 9, -16, suit, 3.6);
    clipboard(ctx, 12.6, -19.5, 0.2);
    circle(ctx, 9.6, -15.8, 2, C.skin, 1.1);
  }
}

// --- the boss's holiday outfits (0.3) ----------------------------------------------------------
// In a holiday game (state.holiday, see src/content/holidays.js) every boss wears that holiday's
// outfit over his usual self. His rank's hair, props, lanyard and name plate stay, so the four
// can still be told apart. An outfit may set his jacket (suit, dark), trouser and tie colours, and
// draw parts at seven moments: back (behind everything), legs (instead of his trousers), hips (over
// the trousers, under the jacket), body (over the jacket, under the tie and lanyard), hand (the
// Regional Manager's free hand, at his side), over (over the tie and lanyard) and head (over the
// face and hair). `hat` is how far it reaches above his head, so the name plate sits above it.
// It is all drawing: his size and position on the floor do not change.

/** His legs: trousers (back leg darker) and polished black shoes. */
function bossLegs(ctx, sw, back, front) {
  limb(ctx, -2.5, -10, -2.5 - sw * 2.6, -1.5, back, 3.6);
  limb(ctx, 2.5, -10, 2.5 + sw * 2.6, -1.5, front, 3.6);
  shoe(ctx, -2.5 - sw * 2.6, -0.8, '#111');
  shoe(ctx, 2.5 + sw * 2.6, -0.8, '#111');
}

/** Runs draw() clipped to his jacket, then outlines the jacket again. */
function onJacket(ctx, draw) {
  ctx.save();
  ctx.beginPath(); ctx.ellipse(1.2, -16, 8.6, 8.2, 0, 0, TAU); ctx.clip();
  draw();
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(1.2, -16, 8.6, 8.2, 0, 0, TAU);
  ctx.lineWidth = OUT; ctx.strokeStyle = INK; ctx.stroke();
}

/** A small heart path, its point at the bottom, about s across, centred on (x, y). */
function heartPath(ctx, x, y, s) {
  const k = s / 10;
  ctx.beginPath();
  ctx.moveTo(x, y + 4 * k);
  ctx.bezierCurveTo(x - 6 * k, y - 0.5 * k, x - 3 * k, y - 6 * k, x, y - 2.5 * k);
  ctx.bezierCurveTo(x + 3 * k, y - 6 * k, x + 6 * k, y - 0.5 * k, x, y + 4 * k);
  ctx.closePath();
}

/** A hat's brim and straight crown: brim y, crown height, widths at the bottom and top. */
function topHat(ctx, hx, hy, h, bottom, top, color, brim = color) {
  ctx.beginPath(); ctx.ellipse(hx + 0.4, hy - 6.3, 10, 2.3, -0.05, 0, TAU);
  paint(ctx, brim, 1.3);
  ctx.beginPath();
  ctx.moveTo(hx + 0.6 - bottom / 2, hy - 6.6); ctx.lineTo(hx + 0.6 - top / 2, hy - 6.6 - h);
  ctx.lineTo(hx + 0.6 + top / 2, hy - 6.6 - h); ctx.lineTo(hx + 0.6 + bottom / 2, hy - 6.6);
  ctx.closePath();
  paint(ctx, color, 1.3);
}

/** A band round the bottom of a topHat crown, with an optional gold buckle at the front. */
function hatBand(ctx, hx, hy, width, color, buckle) {
  ctx.fillStyle = color;
  ctx.fillRect(hx + 0.6 - width / 2 + 0.6, hy - 10.2, width - 1.2, 3.2);
  if (buckle) {
    box(ctx, hx + 1.4, hy - 11, 4.2, 4.6, 0.5, GOLD, 0.9);
    ctx.fillStyle = color; ctx.fillRect(hx + 2.5, hy - 9.9, 2, 2.4);
  }
}

const DRESS = [
  null,
  // Christmas: a Santa suit two sizes too small, belt straining, and the hat.
  {
    suit: '#d42a2a', dark: '#a01b1b', hat: 13,
    body(ctx) {
      onJacket(ctx, () => {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-9, -10.4, 20, 4); // fur trim along the hem
        ctx.fillStyle = '#16171b'; ctx.fillRect(-9, -15.4, 20, 2.8); // the belt, losing
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-3.4, -21.5, 1, 4); // a shine on the stretched cloth
      });
      box(ctx, -2.6, -16.2, 3.8, 4.4, 0.6, GOLD, 0.9);
      ctx.fillStyle = '#16171b'; ctx.fillRect(-1.6, -15, 1.8, 2);
    },
    hand(ctx, x, y) {
      // A candy cane.
      ctx.beginPath(); ctx.moveTo(x, y + 7); ctx.lineTo(x, y - 3); ctx.arc(x - 2, y - 3, 2, 0, Math.PI, true);
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.setLineDash([1.2, 1.2]); ctx.strokeStyle = '#e02424'; ctx.stroke(); ctx.setLineDash(NO_DASH);
    },
    head(ctx, P, hx, hy) {
      // The cone flops over backwards to a bobble.
      ctx.beginPath();
      ctx.moveTo(hx - 7.4, hy - 5.6);
      ctx.quadraticCurveTo(hx - 5, hy - 15, hx - 12, hy - 13.5);
      ctx.quadraticCurveTo(hx + 2, hy - 23, hx + 8, hy - 6);
      ctx.closePath();
      paint(ctx, '#d42a2a', 1.3);
      ctx.save(); ctx.translate(hx + 0.4, hy - 5.6); ctx.rotate(-0.06);
      box(ctx, -8.8, -2.4, 17.6, 4.4, 2.2, '#ffffff', 1.3);
      ctx.restore();
      circle(ctx, hx - 12.4, hy - 13.4, 2.8, '#ffffff', 1.2);
    },
  },
  // Thanksgiving: a pilgrim (black, big white collar, buckles everywhere) with a turkey's tail.
  {
    suit: '#34302c', dark: '#211e1b', hat: 12,
    back(ctx) {
      const cols = ['#7a3e18', '#c8641e', '#e3a23a', '#b5301c'];
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI * 0.98 + k * 0.29;
        ctx.save(); ctx.translate(-6, -15); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(9.5, 0, 10, 3.2, 0, 0, TAU);
        paint(ctx, cols[k % cols.length], 1.2);
        ctx.beginPath(); ctx.ellipse(16.2, 0, 2.8, 2.5, 0, 0, TAU);
        ctx.fillStyle = '#f4e3c0'; ctx.fill();
        ctx.restore();
      }
    },
    hips(ctx, P) {
      // Gold buckles on the shoes.
      for (const x of [-2.5 - P.sw * 2.6, 2.5 + P.sw * 2.6]) box(ctx, x - 0.2, -2.1, 2.4, 1.8, 0.3, GOLD, 0.6);
    },
    body(ctx) {
      onJacket(ctx, () => { ctx.fillStyle = '#16171b'; ctx.fillRect(-9, -11, 20, 2.6); });
      box(ctx, -2, -12.2, 4.6, 4.8, 0.5, GOLD, 0.9);
      ctx.fillStyle = '#16171b'; ctx.fillRect(-0.9, -11.1, 2.4, 2.6);
    },
    over(ctx) {
      // The wide white pilgrim collar, over everything at his neck.
      ctx.beginPath();
      ctx.moveTo(-6.4, -24.4); ctx.lineTo(9, -24.4); ctx.lineTo(8, -19.4);
      ctx.quadraticCurveTo(1.4, -16.8, -5.4, -19.4);
      ctx.closePath();
      paint(ctx, '#ffffff', 1.2);
      ctx.beginPath(); ctx.moveTo(1.4, -24); ctx.lineTo(1.4, -18.2);
      ctx.strokeStyle = '#c9ced4'; ctx.lineWidth = 0.8; ctx.stroke();
    },
    hand(ctx, x, y) {
      // A turkey drumstick.
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 0.6, y + 3.4);
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.strokeStyle = '#f6efe2'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x - 1, y + 7, 3.2, 4.2, 0.15, 0, TAU);
      paint(ctx, '#a0602a', 1.1);
    },
    head(ctx, P, hx, hy) {
      topHat(ctx, hx, hy, 11.4, 11.4, 9.6, '#2b2622');
      hatBand(ctx, hx, hy, 11.4, '#5a4430', true);
    },
  },
  // Valentine's: Cupid. Wings, heart boxers over the suit trousers, a heart arrow through the head.
  {
    tie: '#ff4d8d', hat: 3,
    back(ctx) {
      for (const [dx, dy, col] of [[5, -3, '#e9e4f2'], [0, 0, '#ffffff']]) {
        ctx.save(); ctx.translate(dx, dy);
        ctx.beginPath();
        ctx.moveTo(-3, -22);
        ctx.quadraticCurveTo(-12, -38, -24, -33);
        ctx.quadraticCurveTo(-20, -29.5, -21.5, -26.5);
        ctx.quadraticCurveTo(-16.5, -25.5, -18, -21.5);
        ctx.quadraticCurveTo(-12, -20.5, -4, -16);
        ctx.closePath();
        paint(ctx, col, 1.3);
        ctx.beginPath();
        ctx.moveTo(-6, -24); ctx.lineTo(-18.5, -31);
        ctx.moveTo(-6, -21.5); ctx.lineTo(-16, -25);
        ctx.strokeStyle = '#c9c3d6'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.restore();
      }
    },
    hips(ctx, P) {
      // Heart-print boxers, pulled on over the trousers.
      const sw = P.sw;
      limb(ctx, -2.5, -10, -2.5 - sw * 1.4, -5.4, '#e8335f', 5.2);
      limb(ctx, 2.5, -10, 2.5 + sw * 1.4, -5.4, '#ff4d7a', 5.2);
      ctx.fillStyle = '#ffffff';
      for (const [x, y] of [[-2.6 - sw * 0.9, -7], [2.6 + sw * 0.9, -6.6], [3, -9.6], [-3, -9.8]]) { heartPath(ctx, x, y, 2.6); ctx.fill(); }
    },
    body(ctx) {
      // Lipstick kisses on the jacket.
      ctx.fillStyle = '#ff2e73';
      for (const [x, y] of [[-4.2, -18.5], [-2.2, -12.6]]) {
        ctx.beginPath(); ctx.ellipse(x, y - 0.5, 1.3, 0.6, 0, 0, TAU); ctx.ellipse(x, y + 0.6, 1.3, 0.6, 0, 0, TAU); ctx.fill();
      }
    },
    hand(ctx, x, y) {
      // Cupid's little bow.
      ctx.beginPath(); ctx.arc(x + 1.5, y + 1, 5.2, Math.PI * 0.55, Math.PI * 1.45);
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 0.2, y - 3.9); ctx.lineTo(x - 0.2, y + 5.9);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.6; ctx.stroke();
    },
    head(ctx, P, hx, hy) {
      // A gag arrow through the head: feathered heart behind, heart point in front.
      ctx.lineCap = 'round';
      for (const [x1, y1, x2, y2] of [[hx - 13, hy - 5.4, hx - 6.6, hy - 4.6], [hx + 7.4, hy - 4, hx + 12.6, hy - 3.4]]) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.strokeStyle = '#c9a15a'; ctx.lineWidth = 1.1; ctx.stroke();
      }
      heartPath(ctx, hx - 13.6, hy - 5.6, 5.4); paint(ctx, '#ff9ccf', 1);
      ctx.save(); ctx.translate(hx + 14.4, hy - 3.2); ctx.rotate(-Math.PI / 2);
      heartPath(ctx, 0, 0, 6); paint(ctx, '#e8335f', 1);
      ctx.restore();
      // And a lipstick kiss on the back of his head.
      ctx.fillStyle = '#ff2e73';
      ctx.beginPath(); ctx.ellipse(hx - 3.2, hy + 2.2, 1.3, 0.6, 0.3, 0, TAU); ctx.ellipse(hx - 3.5, hy + 3.3, 1.3, 0.6, 0.3, 0, TAU); ctx.fill();
    },
  },
  // Fourth of July: Uncle Sam. Blue starry jacket, striped trousers, the top hat, a white goatee.
  {
    suit: '#2149a8', dark: '#173375', trousers: '#d42a2a', trousersDark: '#a01b1b', tie: '#d42a2a', hat: 15,
    hips(ctx, P) {
      // A white stripe down each red trouser leg.
      const sw = P.sw;
      ctx.lineCap = 'round';
      for (const [x, s, col] of [[-2.5, -1, '#d6d6d6'], [2.5, 1, '#ffffff']]) {
        ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + s * sw * 2.6, -2.6);
        ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
      }
    },
    body(ctx) {
      onJacket(ctx, () => {
        ctx.fillStyle = '#ffffff';
        for (const [x, y] of [[-5, -20], [-3.4, -14], [-6.2, -11], [-1.2, -9], [-2, -23]]) { starPath(ctx, x, y, 1.6); ctx.fill(); }
      });
    },
    hand(ctx, x, y) {
      // A little flag on a stick.
      ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x - 1, y - 10);
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      ctx.save(); ctx.translate(x - 1, y - 10);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-6.4, 0, 6.4, 4.4);
      ctx.fillStyle = '#d42a2a'; for (let k = 0; k < 3; k++) ctx.fillRect(-6.4, k * 1.5, 6.4, 0.75);
      ctx.fillStyle = '#2149a8'; ctx.fillRect(-6.4, 0, 2.8, 2.2);
      ctx.lineWidth = 0.8; ctx.strokeStyle = INK; ctx.strokeRect(-6.4, 0, 6.4, 4.4);
      ctx.restore();
    },
    head(ctx, P, hx, hy) {
      // The goatee.
      ctx.beginPath(); ctx.moveTo(hx + 2.6, hy + 6.2); ctx.lineTo(hx + 6.4, hy + 6); ctx.lineTo(hx + 4.4, hy + 11);
      ctx.closePath();
      paint(ctx, '#f4f4f4', 1);
      topHat(ctx, hx, hy, 14, 11.6, 11.6, '#ffffff', '#2149a8');
      ctx.fillStyle = '#d42a2a';
      ctx.fillRect(hx - 3.2, hy - 20.2, 2.4, 10.4);
      ctx.fillRect(hx + 1.6, hy - 20.2, 2.4, 10.4);
      ctx.fillStyle = '#2149a8'; ctx.fillRect(hx - 5.2, hy - 10.4, 11.6, 3.4);
      ctx.fillStyle = '#ffffff';
      for (const x of [-2.6, 0.6, 3.8]) { starPath(ctx, hx + x, hy - 8.7, 1.3); ctx.fill(); }
      ctx.beginPath();
      ctx.rect(hx + 0.6 - 5.8, hy - 20.6, 11.6, 14);
      ctx.lineWidth = 1.3; ctx.strokeStyle = INK; ctx.stroke();
    },
  },
  // Halloween: a "sexy devil". Shiny red jacket, cape, tail, horns, fishnets and red heels.
  {
    suit: '#d0102e', dark: '#930a20', hat: 7,
    back(ctx) {
      // The cape, red-lined, its collar standing up behind his head.
      ctx.beginPath();
      ctx.moveTo(-2, -24.5); ctx.quadraticCurveTo(-13, -15, -18, -0.5);
      ctx.lineTo(-5, -1.5); ctx.quadraticCurveTo(-5, -13, 1, -22);
      ctx.closePath();
      paint(ctx, '#16171b', 1.4);
      ctx.beginPath();
      ctx.moveTo(-3.6, -22.5); ctx.quadraticCurveTo(-12, -14, -15.6, -1.6); ctx.lineTo(-12.6, -1.8);
      ctx.quadraticCurveTo(-9.5, -13, -2.4, -21.2);
      ctx.closePath();
      ctx.fillStyle = '#b30d27'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-1.4, -24.6); ctx.lineTo(-9.6, -34); ctx.lineTo(-6.4, -24); ctx.closePath();
      paint(ctx, '#b30d27', 1.2);
      // The tail, out from under the jacket and past the cape, with its arrowhead.
      ctx.beginPath(); ctx.moveTo(-5, -10); ctx.quadraticCurveTo(-15, -4, -21, -11.4);
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#ff2a4a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-19.6, -10.4); ctx.lineTo(-24.4, -14.2); ctx.lineTo(-19.4, -14.6); ctx.closePath();
      paint(ctx, '#ff2a4a', 1.1);
    },
    legs(ctx, P) {
      // Bare legs in fishnet stockings, on red stilettos.
      const sw = P.sw;
      for (const [x0, x1, col] of [[-2.5, -2.5 - sw * 2.6, C.skinDark], [2.5, 2.5 + sw * 2.6, C.skin]]) {
        limb(ctx, x0, -10, x1, -1.8, col, 3.2);
        // The net: thin dark bands across the leg, and a seam down it.
        ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x1, -1.8);
        ctx.lineCap = 'butt';
        ctx.setLineDash([0.35, 1.1]); ctx.strokeStyle = 'rgba(20,20,24,0.7)'; ctx.lineWidth = 3.2; ctx.stroke();
        ctx.setLineDash(NO_DASH);
        ctx.strokeStyle = 'rgba(20,20,24,0.55)'; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1 - 1.4, -0.6); ctx.lineTo(x1 - 1.8, 1.6);
        ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x1 + 1, -1, 2.8, 1.5, -0.25, 0, TAU);
        paint(ctx, '#d0102e', 1.2);
      }
    },
    body(ctx) {
      // Shiny plastic.
      onJacket(ctx, () => {
        ctx.beginPath(); ctx.ellipse(-2.6, -19.5, 2, 4.4, 0.5, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
      });
    },
    hand(ctx, x, y) {
      // A plastic pitchfork.
      ctx.beginPath(); ctx.moveTo(x + 0.5, y + 7); ctx.lineTo(x - 0.8, y - 9);
      ctx.moveTo(x - 3.2, y - 9.6); ctx.lineTo(x - 2.8, y - 6.8); ctx.lineTo(x + 1.6, y - 7.2); ctx.lineTo(x + 1.4, y - 10.2);
      ctx.moveTo(x - 0.8, y - 9); ctx.lineTo(x - 0.95, y - 11);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.strokeStyle = '#d0102e'; ctx.lineWidth = 1; ctx.stroke();
    },
    head(ctx, P, hx, hy) {
      for (const [x, dir] of [[hx - 3.4, -1], [hx + 3.8, 1]]) {
        ctx.beginPath();
        ctx.moveTo(x - 1.7, hy - 5.8);
        ctx.quadraticCurveTo(x - 1.4, hy - 10.2, x + dir * 2.4, hy - 13);
        ctx.quadraticCurveTo(x + 0.4, hy - 9.8, x + 1.7, hy - 6);
        ctx.closePath();
        paint(ctx, '#d0102e', 1.2);
      }
    },
  },
  // St. Patrick's Day: a leprechaun. Green suit, buckled green hat, a ginger beard, a pint.
  {
    suit: '#1f8a3a', dark: '#156629', tie: '#ff8c1a', hat: 12,
    body(ctx) {
      // A shamrock on the lapel.
      for (const [dx, dy] of [[0, -1.3], [-1.2, 0.4], [1.2, 0.4]]) circle(ctx, -3 + dx, -20 + dy, 1.2, '#7ee07e', 0.6);
      ctx.beginPath(); ctx.moveTo(-3, -19.6); ctx.lineTo(-2.2, -17.4); ctx.strokeStyle = '#0d4a1c'; ctx.lineWidth = 0.7; ctx.stroke();
    },
    hand(ctx, x, y) {
      // A pint of green beer.
      box(ctx, x - 2.6, y - 0.6, 5.2, 7.2, 0.8, '#47c45a', 1.1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 0.2, 4, 1.4);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x + 0.8, y + 1.6, 0.8, 4);
    },
    head(ctx, P, hx, hy) {
      // A ginger beard round the jaw, leaving his mouth free to shout.
      ctx.beginPath();
      ctx.moveTo(hx - 6.6, hy - 0.4);
      ctx.quadraticCurveTo(hx - 5.4, hy + 11, hx + 3, hy + 10.6);
      ctx.quadraticCurveTo(hx + 8.2, hy + 10, hx + 8.4, hy + 5);
      ctx.quadraticCurveTo(hx + 2.4, hy + 8.6, hx - 4.4, hy + 0.8);
      ctx.closePath();
      paint(ctx, '#e2621b', 1.1);
      topHat(ctx, hx, hy, 10.4, 10, 12.4, '#1f8a3a');
      hatBand(ctx, hx, hy, 10.4, '#16171b', true);
      for (const [dx, dy] of [[0, -1.2], [-1.1, 0.4], [1.1, 0.4]]) circle(ctx, hx - 2.4 + dx, hy - 13 + dy, 1.1, '#7ee07e', 0.5);
    },
  },
  // Easter: the Easter Bunny. Pastel suit, ears, a fluffy tail, a pink nose and whiskers, a basket.
  {
    suit: '#b9a3e3', dark: '#9580c4', tie: '#ff9ccf', hat: 17,
    body(ctx) {
      // The fluffy tail, on his backside.
      circle(ctx, -8.4, -9.6, 3.4, '#ffffff', 1.2);
      circle(ctx, -9.6, -11.6, 2, '#ffffff', 0);
      circle(ctx, -7.4, -7.6, 1.8, '#ffffff', 0);
    },
    hand(ctx, x, y) {
      // A basket of eggs, hanging from his hand.
      ctx.beginPath(); ctx.arc(x, y + 3.6, 3.6, Math.PI, 0);
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#c8924f'; ctx.lineWidth = 0.9; ctx.stroke();
      for (const [dx, col] of [[-2, '#ff9ccf'], [0.4, '#7fd3ff'], [2.4, '#ffe14a']]) {
        ctx.beginPath(); ctx.ellipse(x + dx, y + 3.4, 1.3, 1.8, 0, 0, TAU); paint(ctx, col, 0.7);
      }
      box(ctx, x - 4.2, y + 3.6, 8.4, 4.4, 1.2, '#c8924f', 1.1);
      ctx.beginPath(); ctx.moveTo(x - 3.6, y + 5.8); ctx.lineTo(x + 3.6, y + 5.8);
      ctx.strokeStyle = '#96652d'; ctx.lineWidth = 0.7; ctx.stroke();
    },
    head(ctx, P, hx, hy) {
      for (const [x, a] of [[hx - 2.6, -0.42], [hx + 2.4, 0.08]]) {
        ctx.save(); ctx.translate(x, hy - 5.8); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, -7.4, 2.9, 7.6, 0, 0, TAU);
        paint(ctx, '#ffffff', 1.3);
        ctx.beginPath(); ctx.ellipse(0, -7.4, 1.4, 5.6, 0, 0, TAU);
        ctx.fillStyle = '#ffb3c8'; ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(hx, hy, 7.6, Math.PI * 1.15, Math.PI * 1.85);
      ctx.strokeStyle = '#ff9ccf'; ctx.lineWidth = 1.6; ctx.stroke();
      // A pink nose and whiskers.
      ctx.beginPath(); ctx.moveTo(hx + 7.2, hy + 1.6); ctx.lineTo(hx + 11, hy + 0.6);
      ctx.moveTo(hx + 7.2, hy + 2.2); ctx.lineTo(hx + 11.2, hy + 2.4);
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.stroke();
      circle(ctx, hx + 7.4, hy + 1.6, 1.2, '#ff7eb6', 0.7);
    },
  },
  // New Year's Eve: party hat, gold sash, confetti, a noisemaker in his mouth, champagne.
  {
    hat: 13,
    body(ctx) {
      onJacket(ctx, () => {
        const cols = ['#ffd23f', '#ff3d7f', '#5cc8ff', '#7ee07e'];
        [[-5, -20], [-2.5, -13], [-6, -14.5], [-0.5, -9], [6.5, -21], [-3.5, -23.5], [7.5, -11]].forEach(([x, y], k) => {
          ctx.fillStyle = cols[k % cols.length]; ctx.fillRect(x, y, 1.4, 1);
        });
      });
    },
    over(ctx) {
      // The sash, shoulder to hip.
      ctx.beginPath(); ctx.moveTo(6.4, -23.4); ctx.lineTo(-6.6, -10);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = INK; ctx.lineWidth = 4.4; ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2.8; ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const t of [0.25, 0.55, 0.85]) { starPath(ctx, 6.4 - 13 * t, -23.4 + 13.4 * t, 1); ctx.fill(); }
      ctx.lineCap = 'round';
    },
    hand(ctx, x, y) {
      // A bottle of champagne, by the neck.
      ctx.save(); ctx.translate(x, y); ctx.rotate(0.35);
      box(ctx, -2.2, 1.6, 4.4, 8, 1.4, '#1f5f3a', 1.1);
      box(ctx, -1.1, -1.4, 2.2, 3.4, 0.5, GOLD, 0.8);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-1.6, 4.4, 3.2, 2.4);
      ctx.restore();
    },
    head(ctx, P, hx, hy) {
      ctx.save(); ctx.translate(hx + 1.6, hy - 6.6); ctx.rotate(-0.28);
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, -13.4); ctx.lineTo(5, 0); ctx.closePath();
      paint(ctx, '#ffd23f', 1.3);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, -13.4); ctx.lineTo(5, 0); ctx.closePath(); ctx.clip();
      ctx.fillStyle = '#ff3d7f';
      ctx.fillRect(-6, -4.6, 12, 1.8); ctx.fillRect(-6, -9.4, 12, 1.6);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, -13.4); ctx.lineTo(5, 0); ctx.closePath();
      ctx.lineWidth = 1.3; ctx.strokeStyle = INK; ctx.stroke();
      circle(ctx, 0, -13.8, 2, '#5cc8ff', 1);
      ctx.restore();
      // A party horn in his mouth (not the CEO's: he has his cigar; not while he storms off).
      if (P.v !== 3 && P.alt !== BOSS_STORM) {
        ctx.beginPath(); ctx.moveTo(hx + 6, hy + 4); ctx.lineTo(hx + 12.6, hy + 3);
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK; ctx.lineWidth = 2.8; ctx.stroke();
        ctx.strokeStyle = '#ff3d7f'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx + 12.6, hy + 3); ctx.lineTo(hx + 15.6, hy + 2.2);
        ctx.strokeStyle = INK; ctx.lineWidth = 3.6; ctx.stroke();
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2.2; ctx.stroke();
      }
    },
  },
  // Mardi Gras: a mask, a plume of feathers and far too many beads.
  {
    hat: 14,
    over(ctx) {
      // Strand after strand, the longest hanging to his belly.
      const cols = ['#c06cf0', '#3ee07f', '#ffd23f', '#c06cf0', '#3ee07f', '#ffd23f', '#c06cf0'];
      ctx.lineCap = 'round';
      // (They hang down the side of his chest his front arm does not cover, deeper and deeper.)
      cols.forEach((col, k) => {
        const deep = -19.4 + k * 1.6; // the bottom of the loop
        ctx.beginPath();
        ctx.moveTo(-5.6 - k * 0.2, -23.4);
        ctx.quadraticCurveTo(-2.4 - k * 0.35, 2 * deep + 23.6, 4.6, -23.8);
        ctx.setLineDash([0.01, 2]);
        ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke();
      });
      ctx.setLineDash(NO_DASH);
    },
    head(ctx, P, hx, hy) {
      // The plume, at the back of his head.
      [['#8e44ad', -0.75], ['#27ae60', -0.35], ['#ffd23f', 0.05]].forEach(([col, a]) => {
        ctx.save(); ctx.translate(hx - 3, hy - 6); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, -7.4, 2, 7.2, 0, 0, TAU);
        paint(ctx, col, 1.1);
        ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, -13);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.6; ctx.stroke();
        ctx.restore();
      });
      circle(ctx, hx - 3, hy - 6, 1.8, GOLD, 1);
      // The mask over his eyes, with the eyes showing through.
      ctx.beginPath(); ctx.moveTo(hx - 1.6, hy - 1.2); ctx.lineTo(hx - 7, hy - 2);
      ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx - 1.8, hy - 0.6);
      ctx.quadraticCurveTo(hx - 1, hy - 4.6, hx + 3.3, hy - 2.6);
      ctx.quadraticCurveTo(hx + 7.4, hy - 4.8, hx + 8.4, hy - 0.4);
      ctx.quadraticCurveTo(hx + 6.4, hy + 2.6, hx + 3.3, hy + 0.8);
      ctx.quadraticCurveTo(hx + 0.2, hy + 2.6, hx - 1.8, hy - 0.6);
      ctx.closePath();
      paint(ctx, '#7b2cbf', 1.1);
      for (const x of [1.4, 5.2]) {
        ctx.beginPath(); ctx.ellipse(hx + x, hy - 0.2, 1.5, 1.2, 0, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.beginPath(); ctx.arc(hx + x + 0.2, hy - 0.2, 0.9, 0, TAU); ctx.fillStyle = INK; ctx.fill();
      }
      ctx.fillStyle = GOLD;
      for (const x of [-0.6, 3.3, 7.4]) ctx.fillRect(hx + x - 0.4, hy - 2.4 - (x === 3.3 ? 0 : 0.6), 0.8, 0.8);
    },
  },
];
/** No outfit. */
const NO_DRESS = {};

/** The boss's outfit (an index of DRESS) for a game's holiday key: 0 for none. */
function dressOf(key) {
  return typeof key === 'string' ? HOLIDAYS.indexOf(key) + 1 : 0;
}

// --- the Pregnant Lady, Octomom and the babies ------------------------------------------------

/**
 * The bump: bare skin with her top riding up over the upper part (`cover`, 0..1 of its height),
 * a popped-out belly button and a couple of stretch marks. kicks: little bulges where someone
 * inside is trying to get out (n of them, round the upper front edge).
 */
function bump(ctx, cx, cy, rx, ry, top, cover, kicks = 0) {
  for (let k = 0; k < kicks; k++) {
    const a = -2.0 + (k * 2.6) / Math.max(1, kicks - 1);
    circle(ctx, cx + Math.cos(a) * rx * 0.98, cy + Math.sin(a) * ry * 0.98, 2.3 + (k % 2) * 0.5, C.skin, 1.3);
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.fillStyle = C.skin;
  ctx.fill();
  // The top, stretched over the upper part of the bump and not quite reaching.
  const hem = cy - ry + ry * 2 * cover;
  ctx.save();
  ctx.clip();
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(cx - rx - 2, cy - ry - 2);
  ctx.lineTo(cx + rx + 2, cy - ry - 2);
  ctx.lineTo(cx + rx + 2, hem - ry * 0.18);
  ctx.quadraticCurveTo(cx, hem + ry * 0.2, cx - rx - 2, hem + ry * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = OUT; ctx.stroke();
  // Stretch marks, low down, and the outie.
  ctx.beginPath();
  for (let k = 0; k < (rx > 12 ? 4 : 2); k++) {
    const x = cx + rx * (0.05 + k * 0.17), y = cy + ry * (0.55 - k * 0.08);
    ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 1.5, y - 1.2, x + 3, y - 0.4);
  }
  ctx.strokeStyle = '#d98a8a'; ctx.lineWidth = 0.9; ctx.stroke();
  circle(ctx, cx + rx * 0.9, cy + ry * 0.12, rx > 12 ? 1.9 : 1.4, C.skin, 1);
}

/** Her face: worn out (cheeks flushed), or straining, about to pop (gritted, sweating). */
function preggoFace(ctx, x, y, strain) {
  ctx.fillStyle = 'rgba(232,100,110,0.45)';
  ctx.beginPath(); ctx.arc(x + 5.6, y + 2, 1.8, 0, TAU); ctx.fill();
  if (!strain) {
    face(ctx, x, y, 1);
    ctx.beginPath(); // a long-suffering sigh
    ctx.moveTo(x + 2.4, y + 3.6); ctx.quadraticCurveTo(x + 3.8, y + 2.6, x + 5.4, y + 3.6);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    return;
  }
  face(ctx, x, y, 0);
  // Teeth gritted, a vein, sweat flying.
  rr(ctx, x + 1.4, y + 2.2, 4.6, 2.2, 0.8);
  paint(ctx, '#ffffff', 1);
  ctx.beginPath(); ctx.moveTo(x + 3.7, y + 2.2); ctx.lineTo(x + 3.7, y + 4.4);
  ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.stroke();
  circle(ctx, x + 8.4, y - 6, 1.4, '#9fe3ff', 0.9);
  circle(ctx, x - 5.6, y - 6.5, 1.2, '#9fe3ff', 0.9);
}

/** Long hair hanging down her back, behind the head (drawn first), with a hairband. */
function longHair(ctx, x, y, r, col) {
  ctx.beginPath();
  ctx.moveTo(x - 1, y - r - 0.6);
  ctx.quadraticCurveTo(x - r - 3.4, y - r * 0.4, x - r - 1.6, y + r + 3.5);
  ctx.lineTo(x - r + 3.2, y + r + 2.2);
  ctx.quadraticCurveTo(x - 2.5, y + 2, x + 1, y - r + 1);
  ctx.closePath();
  paint(ctx, col, OUT);
}

/**
 * The Pregnant Lady, very pregnant: legs set wide, a hand pressed into the small of her back, an
 * enormous bump out in front with her top riding up over it, and a jar of pickles balanced on top.
 * She waddles (rocks from foot to foot) rather than leaning into her walk. alt PREG_STRAIN: her
 * patience is nearly gone and she is about to pop: the jar is gone, she clutches the bump, things
 * inside are kicking. The super, Octomom, is drawn by octomom().
 */
function preggo(ctx, P) {
  if (P.sup) { octomom(ctx, P); return; }
  const sw = P.sw, strain = P.alt === PREG_STRAIN;
  const top = MAT_TOPS[P.v], hair = PREG_HAIR[P.v];
  ctx.rotate(sw * 0.07);
  const l1 = -4.5 - sw * 1.8, l2 = 3 + sw * 1.8;
  limb(ctx, -3.5, -9, l1, -1.6, '#3b3552', 3.2);
  shoe(ctx, l1, -0.8, '#8a6bb0');
  limb(ctx, 2.5, -9, l2, -1.6, '#4a4266', 3.2);
  shoe(ctx, l2, -0.8, '#8a6bb0');
  // A hand in the small of her back.
  limb(ctx, -2.5, -23, -8.6, -18, top, 3.4);
  limb(ctx, -8.6, -18, -6, -13.6, C.skin, 2.6);
  ctx.beginPath(); ctx.ellipse(-1, -17.5, 6.2, 8.6, 0, 0, TAU); paint(ctx, top, OUT);
  bump(ctx, 5.5, -13.8, 10, 9, top, 0.5, strain ? 3 : 0);
  longHair(ctx, 2, -30.5, 6.6, hair);
  head(ctx, 2, -30.5, 6.6);
  hairCap(ctx, 2, -30.5, 6.6, hair);
  ctx.beginPath(); ctx.arc(2, -30.5, 7.1, Math.PI * 1.12, Math.PI * 1.55);
  ctx.strokeStyle = '#ff5fa8'; ctx.lineWidth = 1.8; ctx.stroke(); // hairband
  preggoFace(ctx, 2, -29.5, strain);
  if (strain) {
    // Both hands on the bump now.
    limb(ctx, 2, -23, 10.5, -20.5, top, 3.2);
    circle(ctx, 11, -20.2, 2, C.skin, 1.1);
    return;
  }
  // A jar of pickles balanced on the bump: eating for thirteen.
  const jx = 9.6, jy = -21.2; // bottom left of the jar
  rr(ctx, jx, jy - 8.4, 7, 8.4, 1.6);
  paint(ctx, '#bfe3a6', 1.4);
  ctx.fillStyle = '#4f8a2e';
  ctx.beginPath(); ctx.ellipse(jx + 2.2, jy - 3.8, 1.3, 2.7, 0.2, 0, TAU); ctx.ellipse(jx + 4.9, jy - 4.4, 1.3, 2.5, -0.2, 0, TAU); ctx.fill();
  box(ctx, jx - 0.5, jy - 10.2, 8, 2.6, 0.8, C.red, 1.2);
  limb(ctx, 1.5, -23, 8.8, -20.5, top, 3);
  circle(ctx, 9.4, -20.4, 1.9, C.skin, 1.1);
}

/**
 * Octomom: everything about the Pregnant Lady, much more so. Leaning back under a bump that
 * reaches the floor and has little hands and feet pushing out of it all over, a crop top that
 * gave up, and a whole tub of ice cream with the spoon still in it on top.
 */
function octomom(ctx, P) {
  const sw = P.sw, strain = P.alt === PREG_STRAIN;
  const top = MAT_TOPS[P.v], hair = PREG_HAIR[P.v];
  ctx.rotate(sw * 0.06 - 0.05);
  const l1 = -6 - sw * 1.6, l2 = 2 + sw * 1.6;
  limb(ctx, -5, -9, l1, -1.6, '#3b3552', 3.6);
  shoe(ctx, l1, -0.8, '#8a6bb0');
  limb(ctx, 1, -9, l2, -1.6, '#4a4266', 3.6);
  shoe(ctx, l2, -0.8, '#8a6bb0');
  limb(ctx, -4.5, -25, -11, -19.5, top, 3.6);
  limb(ctx, -11, -19.5, -8, -14.5, C.skin, 2.8);
  ctx.beginPath(); ctx.ellipse(-3, -19.5, 6.6, 9, 0, 0, TAU); paint(ctx, top, OUT);
  bump(ctx, 8, -15.5, 15, 13.5, top, 0.28, 7);
  // Hair piled up in a bun that has seen things.
  circle(ctx, -3.5, -40.5, 4.2, hair, OUT);
  head(ctx, 0, -33, 6.8);
  hairCap(ctx, 0, -33, 6.8, hair);
  preggoFace(ctx, 0, -32, strain);
  if (strain) {
    limb(ctx, 0.5, -23.5, 10, -25, top, 3.2);
    circle(ctx, 10.6, -25, 2, C.skin, 1.1);
    return;
  }
  // The tub of ice cream on top of the bump, with a scoop out of it and the spoon in.
  const tx = 12.5, ty = -27.6; // bottom left of the tub
  ctx.beginPath();
  ctx.moveTo(tx - 0.8, ty - 8.4); ctx.lineTo(tx + 9.6, ty - 8.4); ctx.lineTo(tx + 8.6, ty); ctx.lineTo(tx + 0.2, ty);
  ctx.closePath();
  paint(ctx, '#ffffff', 1.4);
  ctx.fillStyle = '#ff8fc4'; ctx.fillRect(tx - 0.2, ty - 6, 9, 2.2);
  ctx.beginPath(); ctx.ellipse(tx + 4.4, ty - 8.8, 4.8, 2, 0, Math.PI, TAU); paint(ctx, '#ffd6e8', 1.1);
  line2(ctx, tx + 6, ty - 9, tx + 9.5, ty - 14, 1.4);
  limb(ctx, 0.5, -23.5, 11, -26, top, 3.2);
  circle(ctx, 11.6, -26.2, 2, C.skin, 1.1);
}

/**
 * A baby, sprinting on all fours: a big nappy up behind, a big head out in front with one curl of
 * hair and a dummy jammed in, and an expression that says it wants your refund. Small and cheap:
 * up to two dozen come out of one Octomom.
 */
function baby(ctx, P) {
  const sw = P.sw;
  if (P.moving) speedLines(ctx, -13, -9, P.ph, 5, 4);
  // Far arm and leg first (in shadow), then the body, then the near ones.
  limb(ctx, -3.5, -5.5, -8.5 + sw * 2.6, -1, C.skinDark, 2.4);
  limb(ctx, 3.5, -6, 6.5 - sw * 2.8, -1, C.skinDark, 2.3);
  ctx.beginPath(); ctx.ellipse(1, -7, 5, 3.9, 0.12, 0, TAU); paint(ctx, C.skin, 1.5);
  ctx.beginPath(); ctx.ellipse(-4.6, -7.5, 5.2, 4.8, -0.25, 0, TAU); paint(ctx, '#ffffff', 1.6);
  ctx.fillStyle = BABY_TABS[P.v];
  ctx.fillRect(-2.6, -10.6, 2.6, 1.8); // the nappy's tab
  const k = -8.5 - sw * 2.6;
  limb(ctx, -4, -4.5, k, -1, C.skin, 2.6);
  limb(ctx, k, -1, k - 3.5, -2.8, C.skin, 2.2);
  limb(ctx, 3.8, -5.5, 6.5 + sw * 2.8, -0.9, C.skin, 2.5);
  // The head: big, bald but for a curl, angry eyebrow, dummy.
  circle(ctx, 8.4, -11, 5.6, C.skin, 1.6);
  ctx.beginPath();
  ctx.moveTo(7, -16.4); ctx.quadraticCurveTo(9.5, -19.6, 10.5, -16.8); ctx.quadraticCurveTo(9.4, -17.6, 8.8, -16.4);
  ctx.strokeStyle = BABY_HAIR[P.v]; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(10.6, -11.8, 1.1, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(8.8, -14.4); ctx.lineTo(12, -13); ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(13.8, -8.8, 1.3, 2.6, 0, 0, TAU); paint(ctx, BABY_DUMMIES[P.v], 1);
  ctx.beginPath(); ctx.arc(15.2, -8.8, 1.3, -1.3, 1.3); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
}

// --- the Card Trader and the Scalper (0.3.01) ------------------------------------------------

const NERD_TEES = ['#3a3f4a', '#2c3e75', '#7a2534', '#2f5d3e'];
const NERD_HAIR = ['#3b2a1a', '#5a3a1e', '#2b2118', '#8a5a2b'];
const FOIL = '#7e22ce', FOIL_DARK = '#4c1d95', SIGIL = '#fbbf24';
/** Card Trader pose: standing, ripping open a pack (ST.BROWSE). */
const TRADER_RIP = 1;

/** One Mythic Bastards card at (x, y), turned by a: the purple back with its gold sigil, or a face. */
function tcgCard(ctx, x, y, a, front, holo = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  rr(ctx, -2.6, -3.6, 5.2, 7.2, 0.8);
  paint(ctx, front ? '#fff7d6' : FOIL, 1);
  if (front) {
    ctx.fillStyle = holo ? '#67e8f9' : '#c084fc';
    ctx.fillRect(-1.7, -2.7, 3.4, 3);
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(-1.7, 1, 3.4, 0.7);
  } else {
    ctx.fillStyle = SIGIL;
    ctx.beginPath(); ctx.moveTo(0, -1.8); ctx.lineTo(1.3, 0); ctx.lineTo(0, 1.8); ctx.lineTo(-1.3, 0); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** A four-pointed glint (a foil catching the light). */
function glint(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y - r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.25, y + r * 0.25);
  ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y + r * 0.25); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.25, y - r * 0.25);
  ctx.closePath();
  paint(ctx, '#fde047', 0.9);
}

/** Round glasses, as on the Coupon Clipper. */
function specs(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x + 1.2, y, 2.4, 0, TAU);
  ctx.moveTo(x + 7.4, y);
  ctx.arc(x + 5, y, 2.4, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.stroke();
}

/**
 * The Card Trader: a big lad in a black tee with the Mythic Bastards sigil on it, cargo shorts and
 * white tube socks, a backpack stuffed with binders, a lanyard with his tournament badge, a deck
 * box on his belt, glasses and a neckbeard. Walking, he hugs his binder; alt TRADER_RIP, he holds a
 * torn foil pack up to his face with the cards fanning out of it, mouth open. The super version,
 * the Scalper, is drawn by scalper().
 */
function trader(ctx, P) {
  if (P.sup) { scalper(ctx, P); return; }
  const sw = P.sw, rip = P.alt === TRADER_RIP;
  const tee = NERD_TEES[P.v], hair = NERD_HAIR[P.v];
  // The backpack behind him, binders sticking out of the top.
  box(ctx, -14.5, -32, 3.4, 6, 0.6, '#e0457b', 1.1);
  box(ctx, -11.8, -31, 3.2, 5, 0.6, '#38bdf8', 1.1);
  box(ctx, -16, -28, 10, 17, 3.2, '#3f6b8a', OUT);
  box(ctx, -15, -19, 6.5, 5.5, 1.5, '#2f5670', 1.2);
  // Legs: white tube socks pulled right up, chunky trainers.
  const l1 = -2.6 - sw * 2.8, l2 = 2.6 + sw * 2.8;
  limb(ctx, -2.6, -8, l1, -1.5, C.skin, 3.4);
  limb(ctx, 2.6, -8, l2, -1.5, C.skin, 3.4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(l1 - 1.7, -5.6, 3.4, 4.2);
  ctx.fillRect(l2 - 1.7, -5.6, 3.4, 4.2);
  shoe(ctx, l1, -0.8, '#d1d5db');
  shoe(ctx, l2, -0.8, '#d1d5db');
  // Cargo shorts, pockets full.
  box(ctx, -7.2, -13.5, 14.4, 7.5, 2, '#6b7a5a', OUT);
  ctx.fillStyle = '#56644a';
  ctx.fillRect(-6.2, -11.5, 3, 3.4);
  ctx.fillRect(3.4, -11.5, 3, 3.4);
  // The belly, in the tee, with the sigil on it.
  ctx.beginPath(); ctx.ellipse(0.5, -18, 9, 8, 0, 0, TAU); paint(ctx, tee, OUT);
  ctx.fillStyle = SIGIL;
  ctx.beginPath(); ctx.moveTo(4, -21.5); ctx.lineTo(6, -18.5); ctx.lineTo(4, -15.5); ctx.lineTo(2, -18.5); ctx.closePath(); ctx.fill();
  // The deck box on his belt.
  box(ctx, 5.5, -14.5, 3.8, 4.6, 0.7, FOIL, 1.1);
  // Backpack strap, and the lanyard with his badge.
  ctx.beginPath(); ctx.moveTo(-5.5, -25); ctx.quadraticCurveTo(-2, -19, -4.5, -12);
  ctx.strokeStyle = '#2f5670'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-1.5, -24.5); ctx.lineTo(1, -18); ctx.lineTo(4.5, -24.5);
  ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 1.1; ctx.stroke();
  box(ctx, -0.8, -18.5, 3.8, 4.6, 0.5, '#ffffff', 1);
  // Head: greasy hair, a neckbeard, glasses.
  head(ctx, 1.5, -30, 6.8);
  hairCap(ctx, 1.5, -30, 6.8, hair);
  // (The neckbeard: a scraggly strap along the jaw, not a full beard.)
  ctx.beginPath(); ctx.arc(1.5, -30, 6.6, Math.PI * 0.12, Math.PI * 0.8);
  ctx.strokeStyle = hair; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke();
  face(ctx, 1.5, -29, rip ? 2 : 0);
  specs(ctx, 1.5, -29.4);
  if (rip) {
    // Both hands up, a torn foil pack in front of his face, the cards fanning out of it.
    limb(ctx, -1, -21, 10, -22, tee, 3.2);
    limb(ctx, 3, -20, 15, -21, tee, 3.2);
    box(ctx, 10.5, -27, 6.5, 8, 0.8, FOIL, 1.2);
    ctx.fillStyle = FOIL_DARK; ctx.fillRect(11.5, -22.5, 4.5, 1.2);
    tcgCard(ctx, 12, -29.5, -0.45, false);
    tcgCard(ctx, 14, -31, 0.05, true);
    tcgCard(ctx, 16.5, -29.5, 0.5, true, true);
    glint(ctx, 19.5, -34, 2.6);
    circle(ctx, 11, -22, 2, C.skin, 1.1);
    circle(ctx, 15.5, -21, 2, C.skin, 1.1);
    return;
  }
  // Hugging his binder.
  box(ctx, 6.5, -25.5, 6.5, 9.5, 1, '#1d4ed8', OUT);
  ctx.fillStyle = '#93c5fd';
  for (const y of [-23.5, -20.8, -18.1]) ctx.fillRect(6.9, y, 1.4, 1);
  limb(ctx, 0.5, -22, 7.5, -19, tee, 3.2);
  circle(ctx, 8.5, -18.8, 2, C.skin, 1.1);
}

/**
 * The Scalper: no backpack, no binder, no love for the game. A puffer vest, a cap on backwards and
 * wraparound sunglasses, leaning into a hand truck stacked with sealed booster boxes he cleared off
 * the shelf this morning. Ripping (alt TRADER_RIP), he slits the shrink-wrap on the top one with a
 * box cutter, because he is checking stock, not having fun.
 */
function scalper(ctx, P) {
  const sw = P.sw, rip = P.alt === TRADER_RIP;
  // The hand truck: frame, toe plate, wheel, and three sealed boxes.
  ctx.beginPath(); ctx.moveTo(13, -31); ctx.lineTo(14.5, -2); ctx.lineTo(28, -2);
  ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.8; ctx.stroke();
  for (const [y, c] of [[-10.5, FOIL], [-19, FOIL_DARK], [-27.5, FOIL]]) {
    box(ctx, 15.5, y, 11.5, 8.2, 1, c, 1.3);
    ctx.fillStyle = SIGIL; ctx.fillRect(15.9, y + 3.4, 10.7, 1.3);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(17, y + 1, 2.5, 1.2); // the shrink-wrap shine
  }
  circle(ctx, 15, -2.6, 2.6, '#333', 1.2);
  // Legs: jeans, white trainers, leaning into it.
  const l1 = -3 - sw * 3, l2 = 2 + sw * 3;
  limb(ctx, -2.5, -9, l1, -1.5, '#2f4a7a', 3.4);
  limb(ctx, 2, -9, l2, -1.5, '#3b5b94', 3.4);
  shoe(ctx, l1, -0.8, '#f8fafc');
  shoe(ctx, l2, -0.8, '#f8fafc');
  // Hoodie and a puffer vest over it.
  ctx.beginPath(); ctx.ellipse(0.5, -17, 7.4, 8.2, 0.08, 0, TAU); paint(ctx, '#6b7280', OUT);
  rr(ctx, -6.2, -24, 9.5, 14.5, 3); paint(ctx, '#f97316', OUT);
  ctx.strokeStyle = '#c2410c'; ctx.lineWidth = 1;
  ctx.beginPath(); for (const y of [-20, -16, -12.5]) { ctx.moveTo(-5.5, y); ctx.lineTo(2.6, y); } ctx.stroke();
  // Head: cap on backwards, wraparound shades, a smirk.
  head(ctx, 2, -30, 6.6);
  hairCap(ctx, 2, -30, 6.6, '#111827');
  box(ctx, -7.5, -33.5, 5, 2.4, 1, '#111827', 1.2); // the peak, at the back
  face(ctx, 2, -29, 3);
  box(ctx, 2, -31.6, 8.4, 2.8, 1.2, '#0f172a', 1); // the shades
  ctx.fillStyle = '#38bdf8'; ctx.fillRect(4.5, -31, 2.5, 0.9);
  if (rip) {
    // A box cutter at the top box's wrap.
    limb(ctx, 1, -22, 14, -28, '#6b7280', 3.2);
    circle(ctx, 14.5, -28.2, 2, C.skin, 1.1);
    box(ctx, 15, -31.5, 5.5, 1.8, 0.4, '#fbbf24', 0.9);
    glint(ctx, 22, -32, 2.2);
    limb(ctx, -1, -21, 13, -20, '#6b7280', 3.2);
    circle(ctx, 13.6, -20, 2, C.skin, 1.1);
    return;
  }
  // Both hands on the handles.
  limb(ctx, 1, -22, 12.8, -29, '#6b7280', 3.2);
  circle(ctx, 13.2, -29.4, 2, C.skin, 1.1);
  limb(ctx, -1.5, -21, 12, -25, '#6b7280', 3.2);
  circle(ctx, 12.6, -25.2, 2, C.skin, 1.1);
}

/** A puppy's coat by variant: ginger like his mother, grey with spots like a Dane, black lab. */
const PUP_COATS = [[MUTT, MUTT_DARK], [DANE, DANE_SPOT], ['#3b3028', '#1f1812']];

/**
 * A pregnant Stray Dog's puppy (the spayed card, 0.3.01): tiny, all head and paws, scrabbling for
 * the tills with his ears flapping and his tongue out. Like the babies, drawn a little bigger when
 * zoomed far out so a litter still reads as puppies.
 */
function pup(ctx, P) {
  const sw = P.sw;
  const [coat, dark] = PUP_COATS[P.v % PUP_COATS.length];
  if (P.moving) speedLines(ctx, -12, -7, P.ph, 5, 4);
  const wag = Math.sin(P.ph * TAU * 3) * 2;
  limb(ctx, -6, -7, -10, -10 + wag, coat, 2.2); // tail up, wagging
  limb(ctx, -4, -5, -4 - sw * 2.4, -0.8, dark, 2.2);
  limb(ctx, 3.5, -5, 3.5 + sw * 2.4, -0.8, dark, 2.2);
  ctx.beginPath(); ctx.ellipse(-0.5, -6.5, 6.4, 3.8, 0, 0, TAU); paint(ctx, coat, 1.8);
  if (P.v === 1) { ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(-2, -7.5, 1.8, 1.2, 0, 0, TAU); ctx.fill(); }
  limb(ctx, -3, -5, -3 + sw * 2.4, -0.8, coat, 2.4);
  limb(ctx, 4.5, -5, 4.5 - sw * 2.4, -0.8, coat, 2.4);
  // The head: too big for him, one ear flying back, tongue out.
  ctx.beginPath(); ctx.ellipse(10.2, -9.4, 2.8, 2, 0, 0, TAU); paint(ctx, P.v === 2 ? coat : MUTT_CREAM, 1.3);
  circle(ctx, 6.6, -10.5, 4.2, coat, 1.6);
  ctx.beginPath(); ctx.ellipse(4.2, -12.2 + Math.abs(sw) * 0.8, 1.6, 3, -0.9, 0, TAU); paint(ctx, dark, 1.1);
  circle(ctx, 12.6, -10, 1, INK, 0);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(8.2, -11.6, 0.9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(8.5, -11.9, 0.35, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10.4, -7, 0.9, 1.6, 0.2, 0, TAU); paint(ctx, '#ff6b8a', 0.8);
}

const DRAW = [
  hunter, clipper, dad, karen, scooter, teen, mom, blind, gymbro, kid, dogSit, strayDog, cosplay, flasher, drinker, cartDown,
  boss, preggo, baby, trader, pup,
];

/** A super shopper's little gold crown, worn at a jaunty angle on top of the head. */
function crown(ctx, K, P) {
  let [x, y] = K.crown;
  if (K.n === KIND.dog.n && (P.alt & 3) === DOG_SIT) [x, y] = [12, -46]; // the Great Dane sitting up
  if (K.n === KIND.blind.n) {
    // He leans back when his dog bolts and a little forward when walking; the crown goes with him.
    const lean = P.alt & BLIND_BOLT ? -0.3 : P.moving ? 0.07 : 0;
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

const pose = { v: 0, sw: 0, moving: false, alt: 0, ph: 0, down: false, face: 1, sup: false, dress: 0 };

/**
 * Pre-rendered shopper poses. Call setScale() whenever the screen scale changes; sprites are
 * made on first use, or ahead of it through poses() and a prepaint queue. `budget` (spritecache.js)
 * is the renderer's per-frame painting budget; left out, there is no limit and a new scale's poses
 * are always painted at once (portraits and test pages).
 */
export function createShopperSprites(budget = createPaintBudget({ ms: Infinity })) {
  let scale = 1;
  // (0.4, stage 5b) On a new resolution the old poses are kept and drawn scaled until each is
  // painted again (spritecache.js), and poses can be painted ahead of need (warm, poses).
  const cache = createSpriteCache(budget, (a) => paintPose(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]));

  function setScale(s) {
    if (s !== scale) { scale = s; cache.rescale(); }
  }

  const keyOf = (K, v, face, frame, alt, sup, dress, grow) =>
    (((((((K.n * 8 + v) * 2 + (face > 0 ? 1 : 0)) * 8 + frame) * 8) + alt) * 2 + (sup ? 1 : 0)) * 16 + (dress & 15)) * 2 + (grow !== 1 ? 1 : 0);

  /**
   * A pose's sprite. A super shopper's (sup) is bigger and has room round it for the glow; draw
   * it with the box from supBox(). dress: the boss's holiday outfit (see DRESS), 0 for none.
   * grow: drawn that many times bigger (the boss with the bde card), at full sharpness.
   */
  function get(K, v, face, frame, alt, sup = false, dress = 0, grow = 1) {
    alt = alt | 0; // a number 0-7 (true counts as 1)
    const key = keyOf(K, v, face, frame, alt, sup, dress, grow);
    let c = cache.have(key);
    if (c) return c;
    budget.begin();
    c = paintPose(K, v, face, frame, alt, sup, dress, grow);
    budget.end();
    cache.put(key, c, [K, v, face, frame, alt, sup, dress, grow]);
    return c;
  }

  /**
   * Every pose of kind k (or its super version) that a crowd of it walking about needs: each colour,
   * both facings, every walking frame and standing, plus the gestures common enough to be worth it
   * (a dad checking his watch, Karen shouting). Jobs for the prepaint queue: [cache, key, args].
   */
  function poses(k, sup) {
    const K = KIND[k];
    const out = [];
    if (!K || k === 'boss') return out; // (his look depends on his tier and the holiday: painted as seen)
    const alts = k === 'dad' || k === 'karen' ? [0, 1] : [0];
    for (const alt of alts) {
      for (let v = 0; v < K.vars; v++) {
        for (const face of [1, -1]) {
          for (let frame = 0; frame <= STAND; frame++) {
            out.push([cache, keyOf(K, v, face, frame, alt, sup, 0, 1), [K, v, face, frame, alt, sup, 0, 1]]);
          }
        }
      }
    }
    return out;
  }

  function paintPose(K, v, face, frame, alt, sup, dress, grow) {
    const pad = sup ? SUP_PAD : 0, z = (sup ? SUP_SCALE : 1) * grow;
    const bw = K.bw + pad * 2, bh = K.bh + pad * 2;
    let c = document.createElement('canvas');
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
    pose.dress = dress & 15;
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
    return c;
  }

  return { setScale, get, poses, idle: () => cache.idle(), get size() { return cache.size; } };
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
const SHADOW_RX = { scooter: 18, gymbro: 11, dog: 11, cosplay: 13, drinker: 9, boss: 11, preggo: 11, baby: 8, trader: 11, pup: 7 };

/**
 * Adds this shopper's ground shadow to the current path (all shadows are filled at once).
 * F: the frame's drawing context (drawShopper's), for the bde card's bigger boss; optional.
 */
export function shadowPath(ctx, s, sx, sy, face = 1, F = null) {
  const K = KIND[s.k] || KIND.hunter;
  const z = (s.sup ? SUP_SCALE : 1) * (s.k === 'boss' ? bossGrow(F) : 1);
  let rx = (SHADOW_RX[s.k] || 9) * K.sc;
  let cx = sx;
  if (s.k === 'baby' || s.k === 'pup') {
    // Long and low, under all four limbs.
    ctx.moveTo(sx + face + rx, sy + FEET);
    ctx.ellipse(sx + face, sy + FEET, rx, 2.4, 0, 0, TAU);
    return;
  }
  if (s.k === 'mom' && s.cr === 1) { rx = 17; cx += face * 2; } // stretched out on the floor
  else if (s.k === 'dog' && s.sup) rx = 18;
  else if (s.k === 'cosplay' && s.sup) rx = 16;
  else if (s.k === 'preggo' && s.sup) rx = 14; // and the bump, out in front
  else if (s.k === 'trader' && s.sup) { rx = 17; cx += face * 7; } // and the hand truck
  if (s.k === 'preggo') cx += face * 3;
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
 * A cart a mom left behind, on its side where she went down ((sx, sy) in logical pixels).
 * soccer: it was a Soccer Mom's (a football spills out of it).
 */
export function drawCart(ctx, sx, sy, face, sprites, soccer = 0) {
  const img = sprites.get(CART, soccer ? 1 : 0, face, STAND, 0);
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
  ctx.setLineDash(DASH_5_4);
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
// Dash patterns made once, not every frame.
const DASH_5_4 = [5, 4], DASH_4_3 = [4, 3], DASH_5_3 = [5, 3];
const NO_HOW = { pee: null, gawk: false, tv: false, pack: false, pet: false };

/** A little filled heart, its point at the bottom, centred on (x, y). */
function heart(ctx, x, y, r, col) {
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - r * 1.9, y - r * 0.4, x - r, y - r * 2.2, x, y - r);
  ctx.bezierCurveTo(x + r, y - r * 2.2, x + r * 1.9, y - r * 0.4, x, y + r);
  paint(ctx, col, 1);
}

/** A dog's paw print: a pad and four toes. */
function pawPrint(ctx, x, y, k, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x, y + 1.4 * k, 2.4 * k, 2 * k, 0, 0, TAU);
  for (const [dx, dy] of [[-2.6, -1.4], [-0.9, -2.8], [0.9, -2.8], [2.6, -1.4]]) { ctx.moveTo(x + dx * k + k, y + dy * k); ctx.arc(x + dx * k, y + dy * k, k, 0, TAU); }
  ctx.fill();
}

/**
 * A dad trailing an Exhibitionist (the eyesup card, s.ex): two little hearts rising off his head
 * in turn, so it is plain why he is dawdling.
 */
function smitten(ctx, x, y, t, id) {
  for (let j = 0; j < 2; j++) {
    const k = (t * 0.9 + id * 0.13 + j * 0.5) % 1;
    ctx.globalAlpha = Math.min(1, (1 - k) * 2);
    heart(ctx, x + (j ? 8 : -5) + Math.sin((k + j) * 6) * 2, y - k * 16, 3.4 + k * 1.6, '#ff3d7f');
  }
  ctx.globalAlpha = 1;
}

/** How much bigger bosses are drawn this frame: CARDS.bde.size with the bde card (F.bde), else 1. */
const bossGrow = (F) => (F && F.bde ? CARDS.bde.size : 1);

/**
 * Over someone standing still to watch something: a bubble with two big eyes. Staring at an
 * exhibitionist, the eyes are hearts and there is a "!!"; watching the salesman's television, a
 * little TV glows beside them; a Card Trader watching another rip a pack (pack), a shiny card;
 * petting an emotional support dog (pet, the supportdog card), a paw print and a heart.
 */
function eyes(ctx, x, y, gawk, tv, pack = false, pet = false) {
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
  else if (pet) {
    // Petting a support dog: a paw print and a heart beside the eyes.
    pawPrint(ctx, x + 16, y - 7, 1.1, '#c98b5a');
    heart(ctx, x + 22, y - 13, 3, '#ff3d8b');
  } else if (pack) {
    // A Card Trader craning to see what another one pulled: a card and a glint.
    tcgCard(ctx, x + 16, y - 7, 0.25, true, true);
    glint(ctx, x + 20, y - 12, 2.4);
  } else if (tv) {
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
 * F.dress: the game's holiday (state.holiday, a key of HOLIDAYS), which the boss dresses up for;
 *   anything else, or nothing, and he wears his usual suit.
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
    alt = s.bt > 0 ? BLIND_BOLT : 0; // the dog is bolting
    if (alt) pace = 2.2;
    // An emotional support dog instead (the supportdog card: F.esa, and his id).
    if (F.esa && idShare(s.id, 'supportdog', F.seed) < CARDS.supportdog.share) alt |= BLIND_ESA;
  } else if (s.k === 'dog') {
    if (watching) alt = how.pee ? DOG_PEE : DOG_SIT;
    // A pregnant one (the spayed card: F.spayed, and her id): a low belly.
    if (F.spayed && idShare(s.id, 'spayed', F.seed) < CARDS.spayed.share) alt |= DOG_BUMP;
  } else if (s.k === 'flasher') {
    if (s.fl > 0 && !leaving) alt = 1; // bathrobe open
  } else if (s.k === 'boss') {
    // Storming off; or, for a second after each pep talk (s.pp has just been wound back up to a
    // full pepEvery), arm in the air, shouting.
    const every = (defOf(s).pepEvery || 7) * TICK_HZ;
    alt = leaving ? BOSS_STORM : s.pp > every - 30 ? BOSS_PEP : 0;
  } else if (s.k === 'trader') {
    if (s.st === ST.BROWSE) alt = TRADER_RIP; // gloating over the stock he ripped out (the foil pack is the look)
  } else if (s.k === 'preggo') {
    // Nearly out of patience: she is about to pop, and shows it (the warning the players need).
    if (!leaving && s.mhp > 0 && s.hp / s.mhp < PREG_WARN) alt = PREG_STRAIN;
  }
  const ph = F.time * K.step * pace + s.id * 1.7; // walking cycle, radians
  const cycle = (((ph / TAU) % 1) + 1) % 1;
  const frame = stunned && K.down ? DOWN : moving ? ((cycle * WALK_FRAMES) | 0) : STAND;
  const isBoss = s.k === 'boss';
  const v = isBoss ? bossV(s) : K.vars > 1 ? s.id % K.vars : 0;
  const sup = !!s.sup && !isBoss; // he has no super version
  // In a holiday game the boss wears its outfit (F.dress is state.holiday). With the bde card he is
  // drawn bigger (only drawn: where he stands and what can hit him are as ever).
  const grow = isBoss ? bossGrow(F) : 1;
  const img = sprites.get(K, v, face, frame, alt, sup, isBoss ? dressOf(F.dress) : 0, grow);
  const fy = sy + FEET;
  // The sprite's box around the feet; a super's is padded for the glow and drawn bigger. Babies
  // (and a pregnant dog's puppies) are drawn a little bigger when zoomed far out, so a swarm still
  // reads as babies.
  const isBaby = s.k === 'baby' || s.k === 'pup';
  const z = sup ? SUP_SCALE : isBaby && F.zoom ? Math.min(1.45, Math.max(1, 30 / F.zoom)) : grow;
  const pad = sup ? SUP_PAD : 0;
  const bx = (boxX(K, face) - pad) * z, by = (K.by - pad) * z;
  const bw = (K.bw + pad * 2) * z, bh = (K.bh + pad * 2) * z;
  const height = (sup && K.supTop ? K.supTop : K.top) * K.sc * z;

  if (leaving) {
    const fade = Math.max(0, Math.min(1, (s.t - F.alpha) / LEAVE_TICKS));
    ctx.globalAlpha = fade;
    ctx.drawImage(img, sx + bx + Math.sin(F.time * 60) * 1.2, fy + by, bw, bh); // shaking with rage
    ctx.globalAlpha = Math.min(1, fade * 1.6);
    // (A baby or a puppy giving up just fades: a dozen puffs of steam would hide the rest of the swarm.)
    if (!isBaby) puff(ctx, sx, fy - height - 4 - (1 - fade) * 10, 1 - fade);
    ctx.globalAlpha = 1;
    return;
  }
  // About to pop: she trembles.
  if (alt === PREG_STRAIN && s.k === 'preggo') sx += Math.sin(F.time * 47 + s.id) * 0.9;
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
      // His dog sits by him, ahead, looking back at him (in its pink vest, if a support dog).
      const dimg = sprites.get(DOGSIT, alt & BLIND_ESA ? 1 : 0, -face, STAND, 0);
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
    ctx.setLineDash(DASH_4_3);
    ctx.beginPath();
    ctx.ellipse(sx + face * 2, fy - 8, 21 * z, 12 * z, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return; // no patience bar: she has none left, and it does not matter now
  }
  // (A Card Trader ripping a pack shows it in his pose: no bubble.)
  if (s.st === ST.BROWSE) { if (s.k !== 'trader') thought(ctx, sx + 10, top - 10, s.k === 'clipper' ? '%' : '$'); }
  else if (watching && !how.pee && !(s.k === 'flasher')) eyes(ctx, sx + 9, top - 12, how.gawk, how.tv, how.pack, how.pet);
  // On his way over to a salesman's stand (s.sa): eyes on the television all the way there, so it
  // is plain why he has left the route.
  else if (s.sa !== undefined && !stunned) eyes(ctx, sx + 9, top - 12, false, true);
  // A dad trailing an Exhibitionist (the eyesup card): hearts rising off him.
  if (s.ex !== undefined && !stunned) smitten(ctx, sx + 2, top - 8, F.time, s.id);
  // (The boss's bar goes with his name plate, drawn over everyone by drawBossTag. Babies have
  // none: two dozen bars over a swarm would be clutter, and they have almost no patience anyway.)
  if (!how.noBar && !isBoss && !isBaby && (s.k === 'dad' || sup || s.hp < s.mhp - 0.01)) patienceBar(ctx, sx, top - 4, s.hp / s.mhp, sup);
}

/** The boss's sprite variant: his tier (1 to 4 and up) less one. */
const bossV = (s) => Math.max(0, Math.min(3, (s.tr | 0 || 1) - 1));

/** His title on the name plate, in capitals ("Vice President" shortened so it fits). */
const plateText = new Map();
function bossPlate(tier) {
  let t = plateText.get(tier);
  if (!t) {
    const titles = (BOSS && BOSS.titles && BOSS.titles.length) ? BOSS.titles : BOSS_TITLES;
    t = titles[Math.max(0, Math.min(titles.length, tier | 0 || 1) - 1)].toUpperCase().replace('VICE PRESIDENT', 'VP');
    plateText.set(tier, t);
  }
  return t;
}
/** Titles to fall back on if the rules have none. */
const BOSS_TITLES = ['Regional Manager', 'Area Director', 'Vice President of Returns', 'The CEO'];
const plateWidths = new Map();

/**
 * Over the boss, drawn after every shopper so nobody stands on it: his patience bar (always), and
 * a brass name plate with his title, both growing when zoomed out (F.zoom, screen pixels a tile) so
 * they stay readable; zoomed out, a pulsing gold ring at his feet too, so he can be found in a crowd.
 * (sx, sy) as for drawShopper.
 */
export function drawBossTag(ctx, s, sx, sy, F) {
  if (s.st === ST.LEAVE) return;
  const K = KIND.boss;
  const zoom = F.zoom || 40;
  const k = Math.max(1, 40 / zoom);
  const fy = sy + FEET;
  // (Bigger with the bde card: his plate goes over his bigger head, his ring round his bigger feet.)
  const grow = bossGrow(F);
  if (zoom < 30) {
    const p = 0.5 + 0.5 * Math.sin(F.time * 5);
    ctx.globalAlpha = 0.55 + 0.35 * p;
    ctx.beginPath();
    ctx.ellipse(sx, fy, (16 + 4 * p) * k * grow, (6 + 1.5 * p) * k * grow, 0, 0, TAU);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.2 * k;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // (Raised over a holiday hat, so the plate does not cover it.)
  const top = fy - (K.top + (DRESS[dressOf(F.dress)]?.hat || 0)) * K.sc * grow - 4;
  // Patience bar: wide, red-framed, always shown.
  const f = Math.max(0, Math.min(1, s.hp / Math.max(1e-6, s.mhp)));
  const hw = 20 * k, hh = 3.2 * k;
  const by = top - hh - 1;
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(sx - hw - 1.6 * k, by - hh - 1.6 * k, hw * 2 + 3.2 * k, hh * 2 + 3.2 * k);
  ctx.fillStyle = INK;
  ctx.fillRect(sx - hw, by - hh, hw * 2, hh * 2);
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(sx - hw + k, by - hh + k, hw * 2 - 2 * k, hh * 2 - 2 * k);
  ctx.fillStyle = ramp(f);
  ctx.fillRect(sx - hw + k, by - hh + k, (hw * 2 - 2 * k) * f, hh * 2 - 2 * k);
  // Name plate: brass, screwed on, his title engraved.
  const str = bossPlate(s.tr);
  const size = Math.round(9.5 * k * 10) / 10;
  const key = str + size;
  let tw = plateWidths.get(key);
  if (!tw) { ctx.font = font(size, 900); tw = ctx.measureText(str).width; plateWidths.set(key, tw); }
  const pw = tw + 12 * k, ph = size + 6 * k;
  const px = sx - pw / 2, py = by - hh - 3 * k - ph;
  rr(ctx, px, py, pw, ph, 2.5 * k);
  ctx.fillStyle = '#e9c45a';
  ctx.fill();
  ctx.lineWidth = 1.8 * k;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(px + 2 * k, py + 1.6 * k, pw - 4 * k, 1.2 * k);
  ctx.fillStyle = '#7a5a14';
  ctx.beginPath();
  ctx.arc(px + 3.2 * k, py + ph / 2, 1 * k, 0, TAU);
  ctx.moveTo(px + pw - 2.2 * k, py + ph / 2);
  ctx.arc(px + pw - 3.2 * k, py + ph / 2, 1 * k, 0, TAU);
  ctx.fill();
  text(ctx, str, sx, py + ph / 2 + 0.6 * k, size, '#2a1d05', 900);
}

/** A dog's stream: an arc from his cocked leg to the security he is peeing on (at in tiles). */
function peeStream(ctx, s, sx, fy, face, z, t, at) {
  const big = !!s.sup;
  const sc = KIND.dog.sc * z; // from the tip of his cocked leg (see strayDog and greatDane)
  const x0 = sx - face * (big ? 25 : 17) * sc, y0 = fy - (big ? 19 : 14) * sc;
  const x1 = at[0] * TILE, y1 = at[1] * TILE;
  const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 10;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(160,130,10,0.9)';
  ctx.lineWidth = 3.6;
  ctx.stroke();
  ctx.setLineDash(DASH_5_3);
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
