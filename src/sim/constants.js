// Game rules data for Returns Department. Pure data, no logic.
// All tuning numbers live here so balance changes never touch the simulation code.

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

/** Grid size in tiles. */
export const W = 30;
export const H = 16;

/** Directions: 0 = east, 1 = south, 2 = west, 3 = north. */
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export const MAX_PLAYERS = 6;
export const PLAYER_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#e11d8f', '#eab308', '#06b6d4'];
export const ROLES = ['Floor Manager', 'Loss Prevention', 'Purchasing', 'Floater'];

/**
 * The warehouse floor. '#' wall or pillar, '.' floor, 'D' door (shoppers enter), 'T' till (shoppers want to reach).
 * Only '.' tiles can be built on.
 */
export const MAP = [
  '##############################',
  '#............................#',
  '#............................#',
  '#............................#',
  '#.......#...........#........#',
  '#............................T',
  '#............................T',
  'D............................T',
  'D............................T',
  '#............................T',
  '#............................T',
  '#.......#...........#........#',
  '#............................#',
  '#............................#',
  '#............................#',
  '##############################',
];

/** Things that ride on belts. `value` is the cash paid when one reaches a shipping chute. */
export const ITEMS = {
  box: { name: 'Mystery Box', value: 2 },
  gadget: { name: 'Gadget', value: 7 },
  giftset: { name: 'Gift Set', value: 16 },
};

/**
 * Everything a player can place.
 * group: which half of the game it belongs to ('factory' or 'security').
 * blocks: shoppers cannot walk through it (this is what makes the factory a maze).
 * rot: it has a facing direction.
 */
export const BUILD = {
  belt: {
    name: 'Belt', cost: 5, group: 'factory', blocks: true, rot: true,
    desc: 'Moves goods. Shoppers cannot cross it. Dads step right over.',
  },
  unpacker: {
    name: 'Unpacker', cost: 60, group: 'factory', blocks: true, rot: true, period: 2.5, makes: 'box',
    desc: 'Opens pallets and spits out a Mystery Box every 2.5 seconds.',
  },
  press: {
    name: 'Press', cost: 120, group: 'factory', blocks: true, rot: true, takes: 'box', makes: 'gadget', time: 2.5,
    desc: 'Crushes a Mystery Box into a Gadget.',
  },
  packer: {
    name: 'Packer', cost: 200, group: 'factory', blocks: true, rot: true, takes: 'gadget', makes: 'giftset', time: 3,
    desc: 'Wraps a Gadget into a Gift Set, the same thing at triple the price.',
  },
  chute: {
    name: 'Shipping Chute', cost: 40, group: 'factory', blocks: true,
    desc: 'Sells whatever falls into it.',
  },
  crate: {
    name: 'Crate Stack', cost: 10, group: 'factory', blocks: true,
    desc: 'A cheap wall. Does nothing else, but even a dad cannot climb it.',
  },
  sprinkler: {
    name: 'Pepper Sprinkler', cost: 80, group: 'security', blocks: true, tower: true,
    range: 1.75, dmg: 6, cd: 0.5, aoe: true,
    desc: 'Sprays everyone nearby. Short range.',
  },
  forklift: {
    name: 'Forklift Turret', cost: 200, group: 'security', blocks: true, tower: true,
    range: 5.5, dmg: 30, cd: 1.6, aoe: false,
    desc: 'Long range, one shopper at a time.',
  },
  wetfloor: {
    name: 'Wet Floor Sign', cost: 30, group: 'security', blocks: false,
    desc: 'Slows shoppers who walk through. Dads ignore signs and sometimes slip.',
  },
  samples: {
    name: 'Free Samples', cost: 120, group: 'security', blocks: true, range: 2.2,
    desc: 'Shoppers nearby stop for a sample. Dads do not.',
  },
};

/**
 * Shopper types. `hp` is patience: when it reaches zero the shopper storms out and gets no refund.
 * speed: tiles per second. refund: cash taken when the shopper reaches the tills.
 * browses: stops for free samples and for goods on belts.
 * drain: patience lost per second just for being in the store.
 * ignoresSigns: not slowed by wet floor signs, but may slip on them.
 * hopsBelts: steps over conveyor belts instead of walking around them (machines and crates still stop him).
 * steady: immune to slowing and slipping.
 * nag: slows towers near her.
 */
export const SHOPPERS = {
  hunter: { name: 'Bargain Hunter', hp: 40, speed: 1.4, refund: 10, browses: true },
  clipper: { name: 'Coupon Clipper', hp: 16, speed: 1.9, refund: 5, browses: true },
  dad: { name: 'Dad', hp: 34, speed: 2.4, refund: 25, drain: 1, ignoresSigns: true, hopsBelts: true },
  karen: { name: 'Karen', hp: 170, speed: 0.9, refund: 40, nag: true },
  scooter: { name: 'Mobility Scooter', hp: 95, speed: 1.2, refund: 20, steady: true },
};

/** Shopper states. */
export const ST = { WALK: 0, BROWSE: 1, STUN: 2, LEAVE: 3 };

export const TUNE = {
  startCash: 500,
  refundLimit: 40, // game over when this many shoppers have reached the tills
  waves: 20,
  buildSecs: 45, // pause between waves; players can start early
  sellBack: 0.75, // share of the price returned when you remove something
  beltSpeed: 2, // tiles per second
  // Patience in wave n is base * (1 + hpGrowth * (n - 1) + hpGrowth2 * (n - 1)^2):
  // gentle early, steep late.
  hpGrowth: 0.15,
  hpGrowth2: 0.012,
  waveBonus: 80, // cash for finishing a wave...
  waveBonusStep: 15, // ...plus this much per wave number
  wetSlow: 0.5, // speed multiplier on a wet floor tile
  slipChance: 0.35, // chance a dad slips when stepping onto a wet floor tile
  slipSecs: 1.5,
  slipDmg: 6,
  sampleSecs: 2.2, // how long a free sample stops a shopper
  grabSecs: 1.5, // how long grabbing goods off a belt stops a shopper
  grabChance: 0.35, // chance per second that a browsing shopper next to goods grabs one
  browseCooldown: 7, // seconds before the same shopper can be distracted again
  nagRange: 2.5, // towers this close to a Karen fire at half speed
  leaveSecs: 0.8, // how long the storming-out animation lasts
};
