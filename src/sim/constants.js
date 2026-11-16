// Game rules data for No Receipt, No Mercy. Pure data, no logic.
// All tuning numbers live here so balance changes never touch the simulation code.

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

/** Directions: 0 = east, 1 = south, 2 = west, 3 = north. */
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export const MAX_PLAYERS = 6;
export const PLAYER_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#e11d8f', '#eab308', '#06b6d4'];
export const ROLES = ['Floor Manager', 'Loss Prevention', 'Purchasing', 'Floater'];

/**
 * Things that ride on belts. `value` is the cash paid when one reaches a shipping chute.
 * Goods sell for more the further they have ridden on belts: $1 extra for every `per` belts,
 * up to `bonus` extra. That is what makes a long production line worth building.
 */
export const ITEMS = {
  box: { name: 'Mystery Box', value: 2, per: 10, bonus: 1 },
  gadget: { name: 'Gadget', value: 6, per: 5, bonus: 3 },
  giftset: { name: 'Gift Set', value: 13, per: 3, bonus: 6 },
};

/**
 * Everything a player can place.
 * group: which half of the game it belongs to ('factory' or 'security').
 * blocks: shoppers cannot walk through it (this is what makes the factory a maze).
 * rot: it has a facing direction.
 * targets: an area tower hits at most this many shoppers at once (the ones nearest the tills).
 * up: it can be upgraded, and what each level adds. `dmg` and `secs` multiply the level before;
 *   `range` adds tiles; `slow` multiplies the speed of shoppers crossing it; `slip` adds to the
 *   chance a dad slips. The price of each level is in TUNE (upFirst, upGrowth).
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
    name: 'Press', cost: 220, group: 'factory', blocks: true, rot: true, takes: 'box', makes: 'gadget', time: 2.5,
    desc: 'Crushes a Mystery Box into a Gadget.',
  },
  packer: {
    name: 'Packer', cost: 450, group: 'factory', blocks: true, rot: true, takes: 'gadget', makes: 'giftset', time: 3,
    desc: 'Wraps a Gadget into a Gift Set, the same thing at twice the price.',
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
    range: 1.75, dmg: 6, cd: 0.5, aoe: true, targets: 4, up: { dmg: 1.25, range: 0.12 },
    desc: 'Sprays up to four shoppers nearby. Short range.',
  },
  forklift: {
    name: 'Forklift Turret', cost: 200, group: 'security', blocks: true, tower: true,
    range: 5.5, dmg: 30, cd: 1.6, aoe: false, up: { dmg: 1.45, range: 0.3 },
    desc: 'Long range, one shopper at a time.',
  },
  wetfloor: {
    name: 'Wet Floor Sign', cost: 30, group: 'security', blocks: false, up: { slow: 0.82, slip: 0.08 },
    desc: 'Slows shoppers who walk through. Dads ignore signs and sometimes slip.',
  },
  samples: {
    name: 'Free Samples', cost: 120, group: 'security', blocks: true, range: 2.2, up: { secs: 1.2, range: 0.25 },
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
 * messy, kid, bolts, smashes: see the comments on the shoppers that have them.
 * steady: immune to slowing and slipping.
 * nag: slows towers near her.
 *
 * sup: the "super" version of the shopper, which turns up in later waves (from wave `from`).
 *   In `sup`, hp and speed multiply the normal values; anything else replaces the normal value
 *   (or the TUNE value of the same name). Every super takes a double refund. The finished
 *   definitions are in SUPERS below.
 */
export const SHOPPERS = {
  hunter: {
    name: 'Bargain Hunter', hp: 40, speed: 1.4, refund: 10, browses: true,
    sup: { name: 'Doorbuster', from: 6, hp: 3, speed: 1.3 },
  },
  clipper: {
    name: 'Coupon Clipper', hp: 16, speed: 1.9, refund: 5, browses: true,
    sup: { name: 'Extreme Couponer', from: 8, hp: 2.5, speed: 1.6 },
  },
  // The super dad does not slip and his patience runs out half as fast.
  dad: {
    name: 'Dad', hp: 34, speed: 2.4, refund: 25, drain: 1, ignoresSigns: true, hopsBelts: true,
    sup: { name: 'Dad on a Mission', from: 7, hp: 2.5, speed: 1.25, drain: 0.5, steady: true },
  },
  // The super Karen slows towers twice as far away, and to a quarter speed instead of half.
  karen: {
    name: 'Karen', hp: 170, speed: 0.9, refund: 40, nag: true,
    sup: { name: 'Karen Supreme', from: 10, hp: 4, nagRange: 5, nagRate: 0.25 },
  },
  scooter: {
    name: 'Mobility Scooter', hp: 95, speed: 1.2, refund: 20, steady: true,
    sup: { name: 'Turbo Scooter', from: 13, hp: 2.5, speed: 1.8 },
  },
  // messy: drops a mess every few seconds that slows everyone else (and can make a dad slip).
  // The super one drops three times as many and they last twice as long.
  teen: {
    name: 'Teenager', hp: 45, speed: 1.15, refund: 12, messy: true,
    sup: { name: 'Teen Influencer', from: 11, hp: 2, messEvery: 1.6, messSecs: 24 },
  },
  // kid: now and then the child escapes and runs ahead, straight through everything; she sprints
  // round the maze after him, past the samples. The super one sprints three times as fast after
  // a child who escapes twice as often and runs twice as far.
  mom: {
    name: 'Mom and Kid', hp: 55, speed: 1.3, refund: 20, browses: true, kid: true,
    sup: { name: 'Soccer Mom', from: 9, hp: 2, chaseSpeed: 5.7, kidChance: 0.45, kidSpeed: 9, kidMin: 6, kidMax: 18, kidRest: 2 },
  },
  // bolts: pepper spray makes the guide dog bolt, dragging him along fast for a moment. The dog
  // also steers him around puddles and messes (steady), and he cannot see free samples.
  // The super one's dogs bolt from forklift hits too, for longer and faster.
  blind: {
    name: 'Man with Guide Dog', hp: 70, speed: 1.1, refund: 20, steady: true, bolts: true,
    sup: { name: 'Man with Two Guide Dogs', from: 14, hp: 2.5, boltSecs: 3.2, boltSpeed: 3.2, boltsOnAny: true },
  },
  // smashes: walks straight through crate stacks, wrecks any crate stack he passes, and now and
  // then wrecks something else next to him. The super one wrecks more, more often.
  gymbro: {
    name: 'Gym Bro', hp: 85, speed: 1.5, refund: 30, smashes: true,
    sup: { name: 'Roid Rager', from: 12, hp: 2.5, speed: 1.2, smashEvery: 0.9, smashOther: 0.4 },
  },
};

/** The finished definition of each super shopper: the normal one with `sup` applied. */
export const SUPERS = {};
for (const [k, def] of Object.entries(SHOPPERS)) {
  const { hp = 2, speed = 1, from, ...rest } = def.sup;
  SUPERS[k] = { ...def, ...rest, hp: def.hp * hp, speed: def.speed * speed, refund: def.refund * 2, base: def.name, isSuper: true };
}

/** The definition a shopper plays by: s is a shopper from the game state. */
export const defOf = (s) => (s.sup ? SUPERS[s.k] : SHOPPERS[s.k]);

/**
 * Head Office: a player who runs the shoppers instead of the store (see office.js).
 * kinds: for each kind of shopper, the first wave it can be bought for (the same wave the
 *   automatic waves first include it), a price weight for its trick, and the seconds between
 *   arrivals in a group.
 */
export const OFFICE = {
  share: 0.85, // his budget is this share of what the automatic wave is worth...
  carry: 0.5, // ...plus this share of what he left unspent last wave...
  perRefund: 5, // ...plus this much for every shopper who got a refund last wave
  maxGroups: 24, // most groups in one plan
  maxSize: 200, // most shoppers in one group
  maxAt: 60, // latest a group may start arriving, in seconds after the doors open
  kinds: {
    hunter: { from: 1, weight: 1, gap: 0.6 },
    dad: { from: 2, weight: 1.5, gap: 0.3 },
    clipper: { from: 3, weight: 1, gap: 0.35 },
    mom: { from: 3, weight: 1.3, gap: 2 },
    teen: { from: 4, weight: 1.2, gap: 2 },
    karen: { from: 5, weight: 1.3, gap: 3 },
    blind: { from: 6, weight: 1.2, gap: 3 },
    gymbro: { from: 6, weight: 1.5, gap: 3 },
    scooter: { from: 7, weight: 1.2, gap: 2 },
  },
};

/** Shopper states. */
export const ST = { WALK: 0, BROWSE: 1, STUN: 2, LEAVE: 3 };

export const TUNE = {
  startCash: 500, // each player's own money at the start
  joinCash: 60, // a player who joins late also gets this much per wave already played
  refundLimit: 40, // game over when this many shoppers have reached the tills...
  refundPerPlayer: 10, // ...plus this many for each player after the first
  crowdPerPlayer: 0.5, // each player after the first adds this share of a solo game's shoppers
  // From wave lateFrom on, every group grows by lateGrowth of its size per wave.
  lateFrom: 8,
  lateGrowth: 0.08,
  // Super shoppers: the share of a group that is super once its kind has them (see SHOPPERS.sup.from).
  superShare: 0.08, // in the wave they first appear...
  superShareStep: 0.012, // ...growing by this each wave after
  // Upgrades: the first costs upFirst times the building's price, each one after upGrowth times the last.
  upFirst: 1,
  upGrowth: 1.8,
  maxLevel: 10,
  waves: 20,
  buildSecs: 45, // pause between waves; players can start early
  sellBack: 0.75, // share of the price returned when you remove something
  beltSpeed: 2, // tiles per second
  // Patience in wave n is base * (1 + hpGrowth * (n - 1) + hpGrowth2 * (n - 1)^2):
  // gentle early, steep late.
  hpGrowth: 0.15,
  hpGrowth2: 0.016,
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
  nagRange: 2.5, // towers this close to a Karen...
  nagRate: 0.5, // ...fire at this share of their speed
  leaveSecs: 0.8, // how long the storming-out animation lasts
  messEvery: 5, // seconds between a teenager's messes (each teen starts at a random point in this)
  messSecs: 12, // how long a mess stays on the floor
  kidChance: 0.22, // chance per second that a child in the cart escapes
  kidSpeed: 4.2, // tiles per second: children are very fast
  kidMin: 3, // a runaway child runs between this many...
  kidMax: 9, // ...and this many tiles before stopping to wait
  kidRest: 4, // seconds after being caught before the child can escape again
  kidCatch: 0.67, // how close (in tiles) the mom must get to grab him
  chaseSpeed: 1.9, // a mom chasing her child moves this many times faster
  boltSecs: 1.6, // how long a sprayed guide dog bolts
  boltSpeed: 2.3, // speed multiplier while it does
  smashEvery: 1.5, // seconds between a gym bro's attempts to wreck something next to him
  smashOther: 0.15, // chance an attempt wrecks something that is not a crate stack (crates always go)
};
