// Game rules data for No Receipt, No Mercy. Pure data, no logic.
// All tuning numbers live here so balance changes never touch the simulation code.

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

/** Directions: 0 = east, 1 = south, 2 = west, 3 = north. */
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export const MAX_PLAYERS = 7;
export const PLAYER_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#e11d8f', '#eab308', '#06b6d4', '#8b5cf6'];

/**
 * What the host can set before a game starts (in the menu, and again in the lobby).
 * difficulty: `hp` multiplies every shopper's patience, `pay` multiplies what goods sell for
 *   and the end-of-wave bonus.
 */
export const SETTINGS = {
  // 0 means endless: there is no last sales event, and the game ends only when the refund limit
  // is reached (see isEndless in state.js). 0 rather than Infinity so the state stays JSON-safe.
  waves: [10, 15, 20, 30, 0],
  startCash: [300, 500, 800, 1200],
  // Every level was made 10% easier after playtesting (patience x0.9, pay x1.1 on the old numbers).
  difficulty: {
    easy: { name: 'Easy', hp: 0.68, pay: 1.38, note: 'Shoppers give up much sooner and goods sell for a lot more.' },
    normal: { name: 'Normal', hp: 0.9, pay: 1.1, note: 'Shoppers give up a little sooner and goods sell for a little more.' },
    hard: { name: 'Hard', hp: 1.17, pay: 0.94, note: 'More patient shoppers, a bit less money.' },
    brutal: { name: 'Brutal', hp: 1.49, pay: 0.77, note: 'For people who enjoy being told off.' },
  },
  defaults: { waves: 20, startCash: 500, difficulty: 'normal' },
};
export const ROLES = ['Floor Manager', 'Loss Prevention', 'Purchasing', 'Floater'];

/** Things that ride on belts. `value` is the cash paid when one reaches a shipping chute. */
export const ITEMS = {
  box: { name: 'Mystery Box', value: 2 },
  gadget: { name: 'Gadget', value: 7 },
  giftset: { name: 'Gift Set', value: 16 },
};

/**
 * Marked areas of the floor. Each of the four factory machines may only be built on its own
 * kind of floor, and the areas are apart from each other, so goods have to travel between them
 * by belt. Everything else can be built anywhere. Where the areas are is worked out in maps.js.
 * `color` is the floor paint, and each machine is drawn in its floor's colour (blue Unpacker,
 * orange Press, purple Packer, green Chute) so the build bar and the floor match.
 */
export const ZONES = {
  u: { name: 'Loading Bay', kind: 'unpacker', color: '#38bdf8' },
  p: { name: 'Press Shop', kind: 'press', color: '#f97316' },
  k: { name: 'Gift Wrap', kind: 'packer', color: '#c084fc' },
  c: { name: 'Shipping', kind: 'chute', color: '#22c55e' },
};

/**
 * Everything a player can place.
 * group: which half of the game it belongs to ('factory' or 'security').
 * blocks: shoppers cannot walk through it (this is what makes the factory a maze).
 * rot: it has a facing direction.
 * zone: it may only be built on that kind of marked floor (a key of ZONES), where the map has them.
 * targets: an area tower hits at most this many shoppers at once (the ones nearest the tills).
 * size: [w, h] tiles when facing east or west; facing north or south it is [h, w]. Absent: 1 x 1.
 *   The top-left tile of the footprint holds the building; the others point at it (see state.js).
 * hits: how many gym bro hits it survives in one wave (1 if absent), before durability upgrades.
 * beam: fires straight out of its front end and hits everyone along the line (the Barcode Laser).
 * up: the upgrade tracks it has, each bought separately (see upgrades.js):
 *   dmg  damage, or the building's main effect    spd  speed (fires more often, works faster)
 *   rng  range                                     dur  durability (one more gym bro hit a wave)
 *   In a track: `mul` multiplies per level, `add` adds per level; the price of the next level is
 *   `cost` times the building's own price (or a fixed `base`), times `grow` (TUNE.upGrowth unless
 *   given) to the power of the levels already bought; `max` levels at most (TUNE.maxLevel unless
 *   given). The Wet Floor Sign's dmg track has `slow` (speed multiplier per level) and `slip`
 *   (added to the chance a dad slips); the Salesman's has `keep` (what is left of each shopper's
 *   chance NOT to stop, per level) and `rush` (multiplies every chance to hurry past, per level).
 */
export const BUILD = {
  belt: {
    name: 'Belt', cost: 5, group: 'factory', blocks: true, rot: true,
    up: { dur: { add: 1, cost: 1 } },
    desc: 'Moves goods. Shoppers cannot cross it. Dads step right over.',
  },
  // Factory machines get faster by a quarter a level, and it is deliberately very expensive: a
  // belt carries up to 4 items a second, so even a machine at the top level is never held up by it.
  unpacker: {
    name: 'Unpacker', cost: 60, group: 'factory', blocks: true, rot: true, period: 2.5, makes: 'box', zone: 'u',
    up: { spd: { mul: 1.25, base: 400, grow: 1.8, max: 5 }, dur: { add: 1, cost: 0.3 } },
    desc: 'Opens pallets and spits out a Mystery Box every 2.5 seconds.',
  },
  press: {
    name: 'Press', cost: 220, group: 'factory', blocks: true, rot: true, takes: 'box', makes: 'gadget', time: 2.5, zone: 'p',
    up: { spd: { mul: 1.25, base: 600, grow: 1.8, max: 5 }, dur: { add: 1, cost: 0.3 } },
    desc: 'Crushes a Mystery Box into a Gadget.',
  },
  packer: {
    name: 'Packer', cost: 450, group: 'factory', blocks: true, rot: true, takes: 'gadget', makes: 'giftset', time: 3, zone: 'k',
    up: { spd: { mul: 1.25, base: 900, grow: 1.8, max: 5 }, dur: { add: 1, cost: 0.3 } },
    desc: 'Wraps a Gadget into a Gift Set, the same thing at more than twice the price.',
  },
  chute: {
    name: 'Shipping Chute', cost: 40, group: 'factory', blocks: true, zone: 'c',
    up: { dur: { add: 1, cost: 0.5 } },
    desc: 'Sells whatever falls into it.',
  },
  crate: {
    name: 'Crate Stack', cost: 10, group: 'factory', blocks: true,
    up: { dur: { add: 1, cost: 1 } },
    desc: 'A cheap wall. Does nothing else, but even a dad cannot climb it.',
  },
  sprinkler: {
    name: 'Pepper Sprinkler', cost: 80, group: 'security', blocks: true, tower: true,
    range: 1.75, dmg: 6, cd: 0.5, aoe: true, targets: 4,
    up: { dmg: { mul: 1.25, cost: 0.6 }, spd: { mul: 1.1, cost: 0.6 }, rng: { add: 0.15, cost: 0.4 }, dur: { add: 1, cost: 0.3 } },
    desc: 'Sprays up to four shoppers nearby. Short range.',
  },
  forklift: {
    name: 'Forklift Turret', cost: 200, group: 'security', blocks: true, tower: true,
    range: 6, dmg: 30, cd: 1.6, aoe: false,
    up: { dmg: { mul: 1.3, cost: 0.6 }, spd: { mul: 1.12, cost: 0.6 }, rng: { add: 0.3, cost: 0.4 }, dur: { add: 1, cost: 0.3 } },
    desc: 'Long range, one shopper at a time.',
  },
  // A 3 x 1 gun that fires down the line it faces, through everything, and hits every shopper on it.
  railgun: {
    name: 'Barcode Laser', cost: 700, group: 'security', blocks: true, tower: true, rot: true, size: [3, 1], hits: 2,
    range: 10, dmg: 60, cd: 4.5, beam: true, width: 0.6,
    up: { dmg: { mul: 1.3, cost: 0.5 }, spd: { mul: 1.12, cost: 0.5 }, rng: { add: 1, cost: 0.25 }, dur: { add: 1, cost: 0.2 } },
    desc: 'Fires a beam straight out of its front end, through walls and everything else, hitting every shopper in line. Slow to reload.',
  },
  wetfloor: {
    name: 'Wet Floor Sign', cost: 30, group: 'security', blocks: false,
    up: { dmg: { slow: 0.82, slip: 0.08, mul: 1.45, cost: 0.8 }, dur: { add: 1, cost: 0.5 } },
    desc: 'Slows shoppers who walk through. Dads ignore signs and sometimes slip.',
  },
  samples: {
    name: 'Free Samples', cost: 120, group: 'security', blocks: true, range: 2.2,
    up: { dmg: { mul: 1.2, cost: 0.6 }, rng: { add: 0.25, cost: 0.4 }, dur: { add: 1, cost: 0.3 } },
    desc: 'Shoppers nearby stop for a sample. Dads do not.',
  },
  // A 2 x 2 stand where a man demonstrates knives and barbecues on a television. Each shopper
  // walking past may stop to watch, or hurry past to get away from him (see `pitch` on SHOPPERS).
  salesman: {
    name: 'TV Salesman', cost: 450, group: 'security', blocks: true, size: [2, 2], hits: 2, range: 4.5,
    up: { dmg: { mul: 1.15, keep: 0.88, rush: 0.85, cost: 0.5 }, rng: { add: 0.5, cost: 0.4 }, dur: { add: 1, cost: 0.25 } },
    desc: 'Demonstrates knives and barbecues on a television. Shoppers in reach may stop to watch, or hurry past.',
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
 * gawks: stops to stare when an exhibitionist opens her bathrobe nearby.
 * pitch: [stop, rush] the TV Salesman's chances with this shopper: with chance `stop` he stops to
 *   watch the demonstration; otherwise, with chance `rush`, he hurries past faster for a while.
 * pees, shields, flashes, sways: see the comments on the shoppers that have them.
 *
 * sup: the "super" version of the shopper, which turns up in later waves (from wave `from`).
 *   In `sup`, hp and speed multiply the normal values; anything else replaces the normal value
 *   (or the TUNE value of the same name). Every super takes a double refund. The finished
 *   definitions are in SUPERS below.
 */
export const SHOPPERS = {
  hunter: {
    name: 'Bargain Hunter', hp: 40, speed: 1.4, refund: 10, browses: true, pitch: [0.35, 0.1],
    sup: { name: 'Doorbuster', from: 6, hp: 3, speed: 1.3 },
  },
  clipper: {
    name: 'Coupon Clipper', hp: 16, speed: 1.9, refund: 5, browses: true, pitch: [0.3, 0.1],
    sup: { name: 'Extreme Couponer', from: 8, hp: 2.5, speed: 1.6 },
  },
  // The super dad does not slip and his patience runs out half as fast.
  dad: {
    name: 'Dad', hp: 34, speed: 2.4, refund: 25, drain: 1, ignoresSigns: true, hopsBelts: true, gawks: true, pitch: [0.2, 0.3],
    sup: { name: 'Dad on a Mission', from: 7, hp: 2.5, speed: 1.25, drain: 0.5, steady: true, pitch: [0.1, 0.45] },
  },
  // The super Karen slows towers twice as far away, and to a quarter speed instead of half.
  // (She stops at the salesman to argue with him, never to hurry.)
  karen: {
    name: 'Karen', hp: 170, speed: 0.9, refund: 40, nag: true, pitch: [0.4, 0],
    sup: { name: 'Karen Supreme', from: 10, hp: 4, nagRange: 5, nagRate: 0.25 },
  },
  scooter: {
    name: 'Mobility Scooter', hp: 95, speed: 1.2, refund: 20, steady: true, pitch: [0.8, 0],
    sup: { name: 'Turbo Scooter', from: 13, hp: 2.5, speed: 1.8 },
  },
  // messy: drops a mess every few seconds that slows everyone else (and can make a dad slip).
  // The super one drops three times as many and they last twice as long.
  teen: {
    name: 'Teenager', hp: 45, speed: 1.15, refund: 12, messy: true, gawks: true, pitch: [0.05, 0.25],
    sup: { name: 'Teen Influencer', from: 11, hp: 2, messEvery: 1.6, messSecs: 24 },
  },
  // kid: once, the child escapes and runs ahead, straight through everything; she sprints round
  // the maze after him, past the samples. The super one (twice) sprints three times as fast after
  // a child who escapes sooner and runs twice as far.
  mom: {
    name: 'Mom and Kid', hp: 55, speed: 1.3, refund: 20, browses: true, kid: true, pitch: [0.3, 0.15],
    sup: { name: 'Soccer Mom', from: 9, hp: 2, chaseSpeed: 7.125, kidChance: 0.45, kidSpeed: 9, kidMin: 12, kidMax: 34, kidRest: 2, kidRuns: 2, crawlTimes: 2 },
  },
  // bolts: pepper spray makes the guide dog bolt, dragging him along fast for a moment. The dog
  // also steers him around puddles and messes (steady), and he cannot see free samples, or the
  // salesman's television.
  // The super one's dogs bolt from forklift and barcode laser hits too, for longer and faster.
  blind: {
    name: 'Man with Guide Dog', hp: 70, speed: 1.1, refund: 20, steady: true, bolts: true, pitch: [0, 0],
    sup: { name: 'Man with Two Guide Dogs', from: 14, hp: 2.5, boltSecs: 3.2, boltSpeed: 3.2, boltsOnAny: true },
  },
  // smashes: walks straight through crate stacks (stopping to hit one that is still standing),
  // hits any crate stack he passes, and now and then something else next to him. The super one
  // hits more, more often.
  gymbro: {
    name: 'Gym Bro', hp: 85, speed: 1.5, refund: 30, smashes: true, pitch: [0.3, 0.1],
    sup: { name: 'Roid Rager', from: 12, hp: 2.5, speed: 1.2, smashEvery: 0.9, smashOther: 0.4 },
  },
  // sways: his speed changes every couple of seconds, and going round a corner he may fall over and
  // lie there, which slows everyone else crossing that tile. The super one falls more often and
  // stays down longer.
  drinker: {
    name: 'Day Drinker', hp: 50, speed: 1.3, refund: 15, sways: true, pitch: [0.35, 0.15],
    sup: { name: 'Bottomless Bruncher', from: 12, hp: 2.5, speed: 1.1, fallChance: 0.5, fallSecs: 6, swayMax: 2.2 },
  },
  // pees: stops to pee on security it passes (not wet floor signs), which switches it off for a
  // while. The super one switches it off for twice as long, from further away, more often.
  dog: {
    name: 'Stray Dog', hp: 22, speed: 2.6, refund: 5, pees: true, pitch: [0.1, 0.5],
    sup: { name: 'Great Dane', from: 13, hp: 2.5, speed: 1.15, peeSecs: 12, peeRange: 2.2, peeCool: 5 },
  },
  // flashes: every few seconds she opens her bathrobe; dads and teenagers nearby stop and stare.
  // The super one does it twice as often, to a bigger audience, who stare for longer.
  flasher: {
    name: 'Exhibitionist', hp: 60, speed: 1, refund: 15, flashes: true, pitch: [0.2, 0.2],
    sup: { name: 'Nudist Nan', from: 14, hp: 2.5, flashEvery: 3, flashRange: 4, gawkSecs: 3 },
  },
  // shields: his costume is so big that shots meant for anyone close to him hit him instead.
  // The super one shields from further away, and takes only half the damage of what he soaks up.
  cosplay: {
    name: 'Cosplayer', hp: 150, speed: 1.25, refund: 30, shields: true, pitch: [0.3, 0.1],
    sup: { name: 'Full Mech Suit', from: 15, hp: 2.5, shield: 1.6, soak: 0.5 },
  },
};

/** The finished definition of each super shopper: the normal one with `sup` applied. */
export const SUPERS = {};
for (const [k, def] of Object.entries(SHOPPERS)) {
  const { hp = 2, speed = 1, from, ...rest } = def.sup;
  SUPERS[k] = { ...def, ...rest, hp: def.hp * hp, speed: def.speed * speed, refund: def.refund * 2, base: def.name, isSuper: true };
}

/**
 * The boss: one comes in every TUNE.bossEvery-th sales event (5, 10, 15 ...), never in training.
 * He is kept out of SHOPPERS on purpose: everything that lists the shopper kinds (the handbook,
 * Head Office's shop, the line banks, the tests that every kind has a super) would otherwise list
 * him by accident, and he has no super version, no Head Office price and nothing to buy. Shoppers
 * in the state still have `k: 'boss'`; `defOf()` and `shopperDef()` give this definition for him.
 * titles: what he is called by tier (his tier is the wave number / 5; tier 4 and above are all the
 *   last title). `name` is the first.
 * hp is his base patience, grown by wave and difficulty like everyone's, then multiplied by
 *   1 + TUNE.bossTierHp * (tier - 1) (see bossPatience in step.js).
 * refund: what he takes at a till, times his tier; he also counts as TUNE.bossRefunds refunds.
 * steady, no browses, no gawks, pitch [0, 0]: nothing slows or stops him (wet floor signs, messes,
 *   a fallen day drinker, free samples, goods on belts, the TV Salesman, an exhibitionist).
 * pepEvery, pepRange, pepHeal: every pepEvery seconds he gives a pep talk; every other shopper
 *   within pepRange tiles gets pepHeal of his own full patience back (never above full).
 */
export const BOSS = {
  name: 'Regional Manager',
  titles: ['Regional Manager', 'Area Director', 'Vice President of Returns', 'The CEO'],
  boss: true,
  // hp 320 (eight Bargain Hunters) with only 60% of the usual crowd round him (TUNE.bossCrowd):
  // the owner's choice, to make the event about him. With the first tuning (160 and 75%) the
  // scripted players in tools/balance.mjs only just drove him out; with this one they still do,
  // because the smaller crowd lets security reach him sooner. Towers shoot whoever is nearest
  // the tills, so a slow man at the back of a big crowd is hit late.
  hp: 320, speed: 0.8, refund: 150, steady: true, pitch: [0, 0],
  pepEvery: 7, pepRange: 3.5, pepHeal: 0.2,
};

/** The definition of a kind of shopper: SHOPPERS[k], SUPERS[k] if sup, or BOSS for 'boss'. */
export const shopperDef = (k, sup = 0) => (k === 'boss' ? BOSS : sup ? SUPERS[k] : SHOPPERS[k]);

/** The definition a shopper plays by: s is a shopper from the game state. */
export const defOf = (s) => (s.k === 'boss' ? BOSS : s.sup ? SUPERS[s.k] : SHOPPERS[s.k]);

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
    drinker: { from: 5, weight: 1.2, gap: 4 },
    dog: { from: 7, weight: 1.3, gap: 1.2 },
    flasher: { from: 8, weight: 1.1, gap: 6 },
    cosplay: { from: 9, weight: 1.4, gap: 5 },
  },
};

/**
 * Shopper states. WATCH: stopped to look at something (the salesman's television, an
 * exhibitionist, or, for a dog, peeing on security); STUN also covers a day drinker lying where
 * he fell.
 */
export const ST = { WALK: 0, BROWSE: 1, STUN: 2, LEAVE: 3, WATCH: 4 };

export const TUNE = {
  startCash: 500, // each player's own money at the start
  joinCash: 60, // a player who joins late also gets this much per wave already played
  graceSecs: 90, // a player whose connection drops keeps his money for this many real seconds (the same at 2x and 3x speed); then it is shared out
  refundLimit: 40, // game over when this many shoppers have reached the tills...
  refundPerPlayer: 10, // ...plus this many for each player after the first
  crowdPerPlayer: 0.5, // each player after the first adds this share of a solo game's shoppers
  // From wave lateFrom on, every group grows by lateGrowth of its size per wave.
  lateFrom: 8,
  lateGrowth: 0.08,
  // Super shoppers: the share of a group that is super once its kind has them (see SHOPPERS.sup.from).
  superShare: 0.08, // in the wave they first appear...
  superShareStep: 0.012, // ...growing by this each wave after
  // The most shoppers one automatic wave sends for one player (each player after the first adds
  // crowdPerPlayer of it, like the crowd itself). Waves up to 30 stay under it; beyond that, in an
  // endless game, the crowd stops growing but patience does not, so the store still falls in the end.
  maxCrowd: 1100,
  // The boss (see BOSS): every bossEvery-th wave, bossAt seconds after the doors open.
  bossEvery: 5,
  bossAt: 12,
  bossCrowd: 0.6, // in his wave every other group is this share of its usual size (the owner asked for a smaller crowd, so the event is about him)
  bossTierHp: 0.5, // each tier above the first adds this share of his patience
  bossRefunds: 5, // reaching a till, he counts as this many refunds toward the limit
  bossBounty: 150, // driving him out pays the store this much per tier (times the difficulty's pay)
  // Upgrades: each track's next level costs upGrowth times its last (unless the track has its own
  // `grow`), up to maxLevel levels per track (unless it has its own `max`). See BUILD[k].up.
  upGrowth: 1.6,
  maxLevel: 8,
  // Rebuilding what a gym bro destroyed costs this share of what had been spent on it.
  rebuildShare: 0.5,
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
  kidRuns: 1, // how many times one child can run away
  kidSpeed: 4.2, // tiles per second: children are very fast
  kidMin: 6, // a runaway child runs between this many...
  kidMax: 17, // ...and this many tiles before stopping to wait
  kidRest: 4, // seconds after being caught before the child can escape again
  kidCatch: 0.67, // how close (in tiles) the mom must get to grab him
  kidTill: 2, // a runaway child stops at least this many tiles of walking from the nearest till
  kidTv: 0.7, // chance a running child stops to watch the salesman's television (once per escape)
  // A mom whose patience runs out while her child is loose does not leave: she drops and crawls
  // to him, and nothing can touch her on the way (security still shoots at her, and wastes it).
  // The last time she is allowed to do it, she leaves her cart behind and carries him after.
  crawlSpeed: 0.7, // how fast she crawls, as a share of her walking speed
  crawlBack: 0.35, // the share of her patience she gets back when she reaches him
  crawlTimes: 1, // how many times one mom can do it

  chaseSpeed: 2.375, // a mom chasing her child moves this many times faster
  boltSecs: 1.6, // how long a sprayed guide dog bolts
  boltSpeed: 2.3, // speed multiplier while it does
  smashEvery: 1.5, // seconds between a gym bro's attempts to hit something next to him (or in his way)
  smashOther: 0.15, // chance an attempt hits something that is not a crate stack (crates always do)

  // TV Salesman.
  pitchCool: 9, // seconds before any salesman can pitch to the same shopper again
  stopSecs: 2.5, // how long a shopper who stops watches the demonstration, once he has walked over to the stand
  pitchWalkSecs: 4, // the longest he will spend walking over; then he watches from where he is
  rushSecs: 4, // how long a shopper who hurries past stays hurried...
  rushSpeed: 1.4, // ...at this many times his speed
  // Stray dog.
  peeRange: 1.6, // tiles from security a dog must pass to stop and pee on it
  peeStop: 1.2, // seconds it stops for
  peeSecs: 6, // seconds the security is switched off afterwards
  peeCool: 8, // seconds before the dog can pee again
  // Cosplayer.
  shield: 0.9, // shots at a shopper this close to a cosplayer hit the cosplayer instead
  soak: 1, // share of the damage a cosplayer takes for the shots he soaks up
  shieldEvery: 1, // seconds between 'shield' events from one cosplayer (for effects only)
  // Exhibitionist.
  flashEvery: 6, // seconds between flashes, on average
  flashSecs: 1.5, // how long the bathrobe stays open (she stands still)
  flashRange: 2.5, // dads and teenagers this close stop and stare...
  gawkSecs: 2, // ...for this long...
  gawkCool: 6, // ...and cannot be caught again for this long
  // Day drinker.
  swayEvery: 2, // seconds between changes of speed
  swayMin: 0.5, // his speed is between this...
  swayMax: 1.9, // ...and this many times his base speed
  fallChance: 0.25, // chance he falls over going round a corner
  fallSecs: 4, // how long he lies there
  fallSlow: 0.35, // speed multiplier for anyone else crossing the tile he lies on
};
