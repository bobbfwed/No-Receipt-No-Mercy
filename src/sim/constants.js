// Game rules data for No Receipt, No Mercy. Pure data, no logic.
// All tuning numbers live here so balance changes never touch the simulation code.

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

/**
 * The game speeds a player can pick: that many ticks run in the time of one. 5x came in 0.2.14
 * because the late game drags; there is deliberately no 4x (the owner's call: one big step up
 * from 3x, not a small one).
 */
export const SPEEDS = [1, 2, 3, 5];

/** Directions: 0 = east, 1 = south, 2 = west, 3 = north. */
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export const MAX_PLAYERS = 7;
export const PLAYER_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#e11d8f', '#eab308', '#06b6d4', '#8b5cf6'];

/**
 * What the host can set before a game starts (in the menu, and again in the lobby).
 * difficulty: `hp` multiplies every shopper's patience (the boss's and the babies' too), `pay`
 *   multiplies what goods sell for, the end-of-wave bonus and the boss's bounty. Normal is the
 *   baseline, x1 and x1 by definition: every number in this file is Normal's, and the handbook and
 *   README show them as they are.
 */
export const SETTINGS = {
  // 0 means endless: there is no last sales event, and the game ends only when the refund limit
  // is reached (see isEndless in state.js). 0 rather than Infinity so the state stays JSON-safe.
  waves: [10, 15, 20, 30, 0],
  startCash: [300, 500, 800, 1200],
  // Until 0.2.10 Normal itself was x0.9 patience and x1.1 pay on the base numbers (every level had
  // been made 10% easier after playtesting). Then Normal became the baseline: its multipliers were
  // folded into every base number below (patience x0.9, money x1.1), so a Normal game plays exactly
  // as before, and the other levels were given round numbers relative to it (each within 1% of its
  // old real effect; see PLAN.md, version 0.2.10).
  difficulty: {
    easy: { name: 'Easy', hp: 0.75, pay: 1.25, note: 'Shoppers give up much sooner and goods sell for a lot more.' },
    normal: { name: 'Normal', hp: 1, pay: 1, note: 'The standard game. Every number in the handbook is for this one.' },
    hard: { name: 'Hard', hp: 1.3, pay: 0.85, note: 'More patient shoppers, a bit less money.' },
    brutal: { name: 'Brutal', hp: 1.65, pay: 0.7, note: 'For people who enjoy being told off.' },
  },
  defaults: { waves: 20, startCash: 500, difficulty: 'normal' },
};
export const ROLES = ['Floor Manager', 'Loss Prevention', 'Purchasing', 'Floater'];

/**
 * Things that ride on belts. `value` is the cash for one reaching a shipping chute, before it is
 * rounded to whole dollars (times the difficulty's pay): on Normal a box pays $2, a gadget $8 and a
 * gift set $15. (2, 7 and 16 times Normal's old x1.1 until 0.2.10; anything shown to a player is
 * the rounded amount.) The gift set was 17.6 ($18) until 0.2.13, when the Packer was 3 seconds an
 * item; with every machine now at the same speed it is 17.6 x 2.5 / 3, so a full production line
 * (which the Packer held to its pace) still earns what it did.
 */
export const ITEMS = {
  box: { name: 'Mystery Box', value: 2.2 },
  gadget: { name: 'Gadget', value: 7.7 },
  giftset: { name: 'Gift Set', value: 14.7 },
};

/**
 * Every factory machine (Unpacker, Press, Packer) works at the same pace and speeds up the same
 * way, so at equal levels none outruns another (the owner's request). MACHINE_SECS is the time
 * for one item at level 0; MACHINE_SPD is the shared speed track (each machine adds only its own
 * `base` price for the first level).
 * Ten levels since 0.2.13 (five before): the number of machines is held down by the painted floor,
 * so in a long endless game the only way to earn more is to make each one faster. Levels 1 to 5
 * cost what they always did (x1.8 a level). Past that a level costs only x1.4 the last
 * (`gentleFrom`, `gentleGrow`): each level adds a quarter, so at x1.8 every level would take
 * longer to pay for itself than the one before (level 10 well over four hours of play), while
 * at x1.4 levels 6 to 10 pay back in about the hour level 5 does.
 */
export const MACHINE_SECS = 2.5;
export const MACHINE_SPD = { mul: 1.25, grow: 1.8, max: 10, gentleFrom: 5, gentleGrow: 1.4 };

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
 *   given). With `gentleFrom` n, levels after the n-th each cost `gentleGrow` times the last
 *   instead of `grow`. The Wet Floor Sign's dmg track has `slow` (speed multiplier per level) and `slip`
 *   (added to the chance a dad slips); the Salesman's has `keep` (what is left of each shopper's
 *   chance NOT to stop, per level) and `rush` (multiplies every chance to hurry past, per level).
 */
export const BUILD = {
  belt: {
    name: 'Belt', cost: 5, group: 'factory', blocks: true, rot: true,
    up: { dur: { add: 1, cost: 1 } },
    desc: 'Moves goods. Shoppers cannot cross it. Dads step right over.',
  },
  // Factory machines all share MACHINE_SECS and MACHINE_SPD: faster by a quarter a level, and it is
  // deliberately very expensive. At the top level (10) a machine makes 3.75 items a second; see
  // TUNE.beltSpeed for why a belt keeps up with it.
  unpacker: {
    name: 'Unpacker', cost: 60, group: 'factory', blocks: true, rot: true, period: MACHINE_SECS, makes: 'box', zone: 'u',
    // (Speed levels start at $100: a quarter of the $400 they cost until 0.2.12, the owner's number.)
    up: { spd: { ...MACHINE_SPD, base: 100 }, dur: { add: 1, cost: 0.3 } },
    desc: 'Opens pallets and spits out a Mystery Box every 2.5 seconds.',
  },
  press: {
    name: 'Press', cost: 220, group: 'factory', blocks: true, rot: true, takes: 'box', makes: 'gadget', time: MACHINE_SECS, zone: 'p',
    // (Speed levels start at $300: half of the $600 they cost until 0.2.12, the owner's number.)
    up: { spd: { ...MACHINE_SPD, base: 300 }, dur: { add: 1, cost: 0.3 } },
    desc: 'Crushes a Mystery Box into a Gadget.',
  },
  packer: {
    name: 'Packer', cost: 450, group: 'factory', blocks: true, rot: true, takes: 'gadget', makes: 'giftset', time: MACHINE_SECS, zone: 'k',
    // (Speed levels start at $540: 60% of the $900 they cost until 0.2.12, the owner's number.)
    up: { spd: { ...MACHINE_SPD, base: 540 }, dur: { add: 1, cost: 0.3 } },
    desc: 'Wraps a Gadget into a Gift Set, the same thing at nearly twice the price.',
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
 * pees, shields, flashes, sways, pops, rips: see the comments on the shoppers that have them.
 * weak, tough: a kind of security (a key of BUILD) this shopper loses TUNE.weakMul times the usual
 *   patience to, or TUNE.toughMul times (0.3.01, the owner's request: small edges, so each kind
 *   has a little more to learn about it). A Wet Floor Sign takes no patience from anyone who does
 *   not slip on it, so for `wetfloor` it is the time he takes to cross the sign that is
 *   multiplied. Supers have their base kind's; the boss and babies have none.
 * hp, refund and drain here are the base numbers: a shopper walks in with hp times the sales
 *   event's patience multiplier (patienceScaleAt in step.js; and grown by wave and difficulty),
 *   takes refund times perHead() at a till, and drains drain times that same multiplier a second
 *   (none of them scaled in a training game).
 *
 * sup: the "super" version of the shopper, which turns up in later waves (from wave `from`).
 *   In `sup`, hp and speed multiply the normal values; anything else replaces the normal value
 *   (or the TUNE value of the same name). Every super takes a double refund. The finished
 *   definitions are in SUPERS below.
 */
export const SHOPPERS = {
  hunter: {
    name: 'Bargain Hunter', hp: 36, speed: 1.4, refund: 10, browses: true, pitch: [0.35, 0.1],
    sup: { name: 'Doorbuster', from: 6, hp: 3, speed: 1.3 },
  },
  clipper: {
    name: 'Coupon Clipper', hp: 14.4, speed: 1.9, refund: 5, browses: true, pitch: [0.3, 0.1], weak: 'railgun',
    sup: { name: 'Extreme Couponer', from: 8, hp: 2.5, speed: 1.6 },
  },
  // The super dad does not slip and his patience runs out half as fast.
  dad: {
    name: 'Dad', hp: 30.6, speed: 2.4, refund: 25, drain: 1, ignoresSigns: true, hopsBelts: true, gawks: true, pitch: [0.2, 0.3], tough: 'sprinkler',
    sup: { name: 'Dad on a Mission', from: 7, hp: 2.5, speed: 1.25, drain: 0.5, steady: true, pitch: [0.1, 0.45] },
  },
  // The super Karen slows towers twice as far away, and to a quarter speed instead of half.
  // (She stops at the salesman to argue with him, never to hurry.)
  karen: {
    name: 'Karen', hp: 153, speed: 0.9, refund: 40, nag: true, pitch: [0.4, 0], weak: 'sprinkler', tough: 'railgun',
    sup: { name: 'Karen Supreme', from: 10, hp: 4, nagRange: 5, nagRate: 0.25 },
  },
  scooter: {
    name: 'Mobility Scooter', hp: 85.5, speed: 1.2, refund: 20, steady: true, pitch: [0.8, 0], weak: 'forklift',
    sup: { name: 'Turbo Scooter', from: 13, hp: 2.5, speed: 1.8 },
  },
  // messy: drops a mess every few seconds that slows everyone else (and can make a dad slip).
  // The super one drops three times as many and they last twice as long.
  teen: {
    name: 'Teenager', hp: 40.5, speed: 1.15, refund: 12, messy: true, gawks: true, pitch: [0.05, 0.25], weak: 'sprinkler',
    sup: { name: 'Teen Influencer', from: 11, hp: 2, messEvery: 1.6, messSecs: 24 },
  },
  // kid: once, the child escapes and runs ahead, straight through everything; she sprints round
  // the maze after him, past the samples. The super one (twice) sprints twice as fast as an
  // ordinary mom after a child who escapes sooner and runs twice as far. (Her chaseSpeed is twice
  // TUNE.chaseSpeed; it was three times until 0.2.10, when the owner found it far too fast.)
  mom: {
    name: 'Mom and Kid', hp: 49.5, speed: 1.3, refund: 20, browses: true, kid: true, pitch: [0.3, 0.15],
    sup: { name: 'Soccer Mom', from: 9, hp: 2, chaseSpeed: 4.75, kidChance: 0.45, kidSpeed: 9, kidMin: 12, kidMax: 34, kidRest: 2, kidRuns: 2, crawlTimes: 2 },
  },
  // bolts: pepper spray makes the guide dog bolt, dragging him along fast for a moment. The dog
  // also steers him around puddles and messes (steady), and he cannot see free samples, or the
  // salesman's television.
  // The super one's dogs bolt from forklift and barcode laser hits too, for longer and faster.
  blind: {
    name: 'Man with Guide Dog', hp: 63, speed: 1.1, refund: 20, steady: true, bolts: true, pitch: [0, 0], tough: 'railgun',
    sup: { name: 'Man with Two Guide Dogs', from: 14, hp: 2.5, boltSecs: 3.2, boltSpeed: 3.2, boltsOnAny: true },
  },
  // smashes: walks straight through crate stacks (stopping to hit one that is still standing),
  // hits any crate stack he passes, and now and then something else next to him. But he only has
  // a few hits in him (TUNE.smashMax) with a rest after each (TUNE.smashWait); while resting, and
  // once they are used up, he walks round crates like anyone else. The super one hits more
  // things, more often, with shorter rests. (smashMax and smashWait are the owner's numbers, 0.2.12.)
  gymbro: {
    name: 'Gym Bro', hp: 76.5, speed: 1.5, refund: 30, smashes: true, pitch: [0.3, 0.1], weak: 'sprinkler', tough: 'forklift',
    sup: { name: 'Roid Rager', from: 12, hp: 2.5, speed: 1.2, smashEvery: 0.9, smashOther: 0.4, smashMax: 3, smashWait: 5 },
  },
  // sways: his speed changes every couple of seconds, and going round a corner he may fall over and
  // lie there, which slows everyone else crossing that tile. The super one falls more often and
  // stays down longer.
  drinker: {
    name: 'Day Drinker', hp: 45, speed: 1.3, refund: 15, sways: true, pitch: [0.35, 0.15], weak: 'wetfloor', tough: 'sprinkler',
    sup: { name: 'Bottomless Bruncher', from: 12, hp: 2.5, speed: 1.1, fallChance: 0.5, fallSecs: 6, swayMax: 2.2 },
  },
  // pees: stops to pee on security it passes (not wet floor signs), which switches it off for a
  // while. The super one switches it off for twice as long, from further away, more often.
  dog: {
    name: 'Stray Dog', hp: 19.8, speed: 2.6, refund: 5, pees: true, pitch: [0.1, 0.5], weak: 'sprinkler', tough: 'forklift',
    sup: { name: 'Great Dane', from: 13, hp: 2.5, speed: 1.15, peeSecs: 12, peeRange: 2.2, peeCool: 5 },
  },
  // flashes: every few seconds she opens her bathrobe; dads and teenagers nearby stop and stare.
  // The super one does it twice as often, to a bigger audience, who stare for longer.
  flasher: {
    name: 'Exhibitionist', hp: 54, speed: 1, refund: 15, flashes: true, pitch: [0.2, 0.2],
    sup: { name: 'Nudist Nan', from: 14, hp: 2.5, flashEvery: 3, flashRange: 4, gawkSecs: 3 },
  },
  // shields: his costume is so big that shots meant for anyone close to him hit him instead.
  // The super one shields from further away, and takes only half the damage of what he soaks up.
  cosplay: {
    name: 'Cosplayer', hp: 135, speed: 1.25, refund: 30, shields: true, pitch: [0.3, 0.1], weak: 'forklift', tough: 'railgun',
    sup: { name: 'Full Mech Suit', from: 15, hp: 2.5, shield: 1.6, soak: 0.5 },
  },
  // pops: when her patience runs out she does not storm off, she pops, and this many babies (BABY
  // below) run for the tills from where she stood. Not if the hit that takes her last patience is a
  // Barcode Laser's: then she just leaves. That is the intended counter. Reaching a till she takes
  // her refund like anyone and nothing pops. She stops for free samples (eating for thirteen) and
  // grabs goods off belts (nesting), and the TV Salesman's barbecues stop her often; she cannot
  // hurry. Octomom: two dozen.
  preggo: {
    name: 'Pregnant Lady', hp: 117, speed: 0.85, refund: 30, browses: true, pops: 12, pitch: [0.45, 0],
    sup: { name: 'Octomom', from: 14, hp: 2.5, pops: 24 },
  },
  // Card Trader (0.3.01, the owner's request): grown men who collect "Mythic Bastards", a trading
  // card game made up for this store. He never comes in an ordinary group, only as the mob at a
  // Midnight Release (TUNE.releaseFrom and on; see releaseNo in step.js), so weak one by one and
  // dangerous all together. rips: he steals nothing but Mystery Boxes (he is the only one who
  // does), going out of his way for them further than a shoplifter (TUNE.ripMax), and stands and
  // opens one for TUNE.ripSecs while the other Card Traders near him stop to see what he pulled
  // (TUNE.ripLook, ripWatch, ripCool). He ignores free samples: nothing free is worth having.
  // Weak to the sprinkler: the cards are no longer mint. Not in OFFICE.kinds: Head Office cannot
  // buy him. The Scalper comes from the second release, pushing a hand truck of boxes he is going
  // to sell on. hp 30 (22 was the starting guess): with TUNE.releaseCrowd at 0.85 the scripted
  // players in tools/balance.mjs last as long as before at either, and the mob should be felt
  // (their maze stopped every trader even at 50; see PLAN.md, version 0.3.01).
  trader: {
    name: 'Card Trader', hp: 30, speed: 1.5, refund: 8, rips: true, pitch: [0.3, 0.2], weak: 'sprinkler',
    sup: { name: 'Scalper', from: 12, hp: 2.5 },
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
  // hp 288 (eight Bargain Hunters; 320 before 0.2.10 made Normal the baseline, the same in play) with only 60% of the usual crowd round him (TUNE.bossCrowd):
  // the owner's choice, to make the event about him. With the first tuning (160 and 75%) the
  // scripted players in tools/balance.mjs only just drove him out; with this one they still do,
  // because the smaller crowd lets security reach him sooner. Towers shoot whoever is nearest
  // the tills, so a slow man at the back of a big crowd is hit late.
  // speed 0.7 (the owner's number; 0.8 until 0.2.11), so security has longer to work on him.
  hp: 288, speed: 0.7, refund: 150, steady: true, pitch: [0, 0],
  pepEvery: 7, pepRange: 3.5, pepHeal: 0.2,
};

/**
 * The Pregnant Lady's babies: a dozen of them run out when she pops (two dozen from an Octomom).
 * Kept out of SHOPPERS and SUPERS for the same reason as the boss: nothing that lists the kinds of
 * shopper (the handbook, Head Office's shop, the line banks, the tests that every kind has a super)
 * should pick them up. Nobody can choose them, Head Office cannot buy them, and they have no super
 * version. Shoppers in the state have `k: 'baby'`; `defOf()` and `shopperDef()` give this.
 * hp is their base patience (under a fifth of a Bargain Hunter's), grown by wave, difficulty and
 *   the sales event's patience multiplier like everyone's. It was 4.5 until 0.2.17, when the owner
 *   asked for 50% more: a litter was being mopped up too easily.
 * speed: the fastest thing in the store.
 * refund: the cash one takes at a till. A baby counts as no refund toward the limit (the owner's
 *   choice: babies are cash only), and its $5 is not scaled by TUNE.crowdScale like a real refund.
 * No browses, no gawks, pitch [0, 0]: free samples, goods on belts, the TV Salesman and an
 *   exhibitionist mean nothing to them. Wet floors, messes and a fallen drunk slow them like anyone.
 */
export const BABY = {
  name: 'Baby', baby: true,
  hp: 6.75, speed: 3.2, refund: 5, pitch: [0, 0],
  // Each baby runs at its own share of `speed`, spread evenly between these two, so a litter
  // strings out as it runs instead of moving as one clump. Worked out from the baby's id (see
  // babyPace in step.js): no field in the state, no random draw.
  paceMin: 0.85, paceMax: 1.15,
};

/**
 * A pregnant Stray Dog's puppies (the spayed card, 0.3.01): she bursts into a litter of them when
 * she runs out of patience, as a Pregnant Lady does into babies (CARDS.spayed says how many). They
 * are babies in every way that counts (`baby`: a $5 refund that is no refund toward the limit, not
 * counted as shoppers stopped, no reviews, nothing distracts them, the same tiny patience and the
 * same speed), and kept out of SHOPPERS and SUPERS for the same reason. They do not pee on
 * anything. Shoppers in the state have `k: 'pup'`; `defOf()` and `shopperDef()` give this.
 */
export const PUP = {
  name: 'Puppy', baby: true, pup: true,
  hp: BABY.hp, speed: BABY.speed, refund: BABY.refund, pitch: [0, 0],
  paceMin: BABY.paceMin, paceMax: BABY.paceMax,
};

/** The definition of a kind of shopper: SHOPPERS[k], SUPERS[k] if sup, BOSS for 'boss', BABY for 'baby', PUP for 'pup'. */
export const shopperDef = (k, sup = 0) => (k === 'boss' ? BOSS : k === 'baby' ? BABY : k === 'pup' ? PUP : sup ? SUPERS[k] : SHOPPERS[k]);

/** The definition a shopper plays by: s is a shopper from the game state. */
export const defOf = (s) => shopperDef(s.k, s.sup);

/**
 * Shopper states. WATCH: stopped to look at something (the salesman's television, an
 * exhibitionist, or, for a dog, peeing on security); STUN also covers a day drinker lying where
 * he fell.
 */
export const ST = { WALK: 0, BROWSE: 1, STUN: 2, LEAVE: 3, WATCH: 4 };

export const TUNE = {
  startCash: 500, // each player's own money at the start
  joinCash: 60, // a player who joins late also gets this much per wave already played
  graceSecs: 90, // a player whose connection drops keeps his money for this many real seconds (the same at any game speed); then it is shared out
  // (Halved with the crowd in 0.2.09, the owner's numbers: it was 40 plus 10.)
  refundLimit: 20, // game over when this many shoppers have reached the tills...
  refundPerPlayer: 5, // ...plus this many for each player after the first
  crowdPerPlayer: 0.5, // each player after the first adds this share of a solo game's shoppers
  // Fewer, tougher shoppers (0.2.09, the owner's request: late sales events were a flood nobody
  // could read, and he wants players to counter each kind rather than drown in all of them).
  // Every automatic sales event sends crowdScale of the shoppers it would (each group rounded to
  // the nearest whole number, a half rounded down, never below one, and arriving over the same
  // length of time, so further apart). Shoppers get tougher to make up for it, but only as the
  // game goes on: their patience is multiplied by 1 up to and including sales event patienceFrom,
  // then by a number rising in a straight line to patienceScale at event patienceFull, and by
  // patienceScale from then on (patienceScaleAt in step.js). Why it is phased in: early on
  // security has time to spare between arrivals, so a shopper's fate depends on his own patience
  // against what one walk past the towers does to him, and doubling it made the start far
  // harder (the scripted players lost in event 4 or 5 instead of 11 to 16). Late in the game
  // security is busy all the time, and there half the crowd with twice the patience is the same
  // work. See PLAN.md, version 0.2.09, for the numbers tried.
  // The boss is not scaled: he is one man, not part of the flood. A training game uses neither, so
  // the lessons play as written. What is counted per shopper follows, so the economy stays in
  // proportion: the cash a refund takes and Head Office's prices, bonus per refund and gaps grow by
  // 1 / crowdScale (perHead below), and a dad's drain by the patience multiplier of the event.
  // The owner expects to push these further after playing.
  crowdScale: 0.5,
  patienceScale: 2, // the full multiplier...
  patienceFrom: 5, // ...which starts rising after this sales event...
  patienceFull: 20, // ...and is reached at this one (and kept in an endless game)
  // A busier start and a thinner end (the owner's numbers): on top of everything above, each
  // sales event sends a share of its shoppers worked out from crowdCurves. Each curve is a list
  // of [sales event, share] points joined by straight lines (the first share before the first
  // point, the last after the last), and the curves are multiplied together (crowdShiftAt in
  // step.js). The owner tunes this in rounds, each one "so many per cent fewer than it is now",
  // so each round is its own curve:
  //   0.2.11: 25% more in event 1, 5% fewer in event 10, 25% fewer in event 20, 35% fewer from 30.
  //   0.2.12: on top of that, nothing in events 1 and 2, 8% fewer in event 10, 20% fewer in
  //           event 20, 25% fewer from event 30.
  // Together: 125% of the crowd of 0.2.10 in event 1, 87% in event 10, 60% in event 20, 49% from 30.
  // crowdTrim then multiplies single events: event 5, the first boss, sends 7% fewer again.
  // Only the head count moves: refund cash and prices stay as they are.
  crowdCurves: [
    [[1, 1.25], [10, 0.95], [20, 0.75], [30, 0.65]],
    [[2, 1], [10, 0.92], [20, 0.8], [30, 0.75]],
  ],
  crowdTrim: { 5: 0.93 },
  // From wave lateFrom on, every group grows by lateGrowth of its size per wave.
  lateFrom: 8,
  lateGrowth: 0.08,
  // The late surge (0.2.13, the owner's request: past event 25 the game got easier, and he reached
  // event 70 without touching his maze). Up to and including event surgeFrom nothing changes; each
  // event after it multiplies everyone's patience by surgeHp and the head count by surgeCrowd once
  // more, compounding. Together about 2 times the threat at event 40 and 4.3 at event 50. Most of
  // it is patience, so the screen does not drown in shoppers. Rewards do not follow: refund cash,
  // the end-of-event bonus and the boss's bounty stay as they were.
  surgeFrom: 30,
  surgeHp: 1.055,
  surgeCrowd: 1.02,
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
  // Reaching a till, he counts as this many refunds toward the limit. It was 5 of 40 until 0.2.09.
  // 3 of 20 (a bigger share than before) cost the scripted players about one sales event; 2 of 20
  // brought them back to where they were.
  bossRefunds: 2,
  bossBounty: 165, // driving him out pays the store this much per tier (times the difficulty's pay, rounded; 150 times Normal's old x1.1 until 0.2.10)
  // Upgrades: each track's next level costs upGrowth times its last (unless the track has its own
  // `grow`), up to maxLevel levels per track (unless it has its own `max`). See BUILD[k].up.
  upGrowth: 1.6,
  maxLevel: 8,
  // Rebuilding what a gym bro destroyed costs this share of what had been spent on it.
  rebuildShare: 0.5,
  // Auto-rebuild (0.2.15, a switch per player): something wrecked is put back automatically, but
  // never sooner than this many seconds of game time after it broke. The delay is the point (the
  // owner's reason): when a gym bro breaks through, the wave following him must still get
  // through the gap; without the delay the gap would close at once and only cost money. Game
  // time, not the clock, so the same number of shoppers get through at any game speed.
  autoRebuildSecs: 2,
  // After that, a rebuild that is refused (a shopper on the tile, it would block the route, too
  // little cash) is tried again this often, in seconds of game time. Not every tick, because
  // checking the route costs a path search per wreck.
  autoRebuildEvery: 0.2,
  waves: 20,
  buildSecs: 45, // pause between waves; players can start early
  sellBack: 0.75, // share of the price returned when you remove something
  // Tiles per second. Items ride at least half a tile apart and a simulation tick is 1/30 s, so a
  // belt carries one item every ceil(15 / beltSpeed) ticks or so. It was 2 (3.75 items a second)
  // until 0.2.13, exactly what one factory machine makes at the new top speed level, with nothing
  // to spare. At 5.25 a belt carries 10 a second: two top-level machines feeding one belt (7.5)
  // with a third to spare. (Exactly 5 still only carries 7.5: the half-tile gap lands on the
  // fourth tick, not the third, when an item moves from one belt to the next.)
  beltSpeed: 5.25,
  // Patience in wave n is base * (1 + hpGrowth * (n - 1) + hpGrowth2 * (n - 1)^2):
  // gentle early, steep late.
  hpGrowth: 0.15,
  hpGrowth2: 0.016,
  // (80 and 15 times Normal's old x1.1 pay until 0.2.10: the same money on Normal.)
  waveBonus: 88, // cash for finishing a wave (times the difficulty's pay, rounded)...
  waveBonusStep: 16.5, // ...plus this much per wave number
  wetSlow: 0.5, // speed multiplier on a wet floor tile
  slipChance: 0.35, // chance a dad slips when stepping onto a wet floor tile
  slipSecs: 1.5,
  slipDmg: 6,
  sampleSecs: 2.2, // how long a free sample stops a shopper
  grabSecs: 1.5, // how long grabbing goods off a belt stops a shopper
  // Chance per second that a browsing shopper next to goods grabs one. It was 0.35 while belts
  // ran at 2 tiles a second; at 5.25 an item passes a shopper in 2.6 times less time, so the chance
  // went up by as much (0.92) and a passing item is as likely to be stolen as before.
  grabChance: 0.92,
  browseCooldown: 7, // seconds before the same shopper can be distracted again (after a free sample)
  // Shoplifting (0.3.01: the owner found it far too rare). After grabbing something, or giving up
  // on going for it, a shopper cannot be distracted again for grabCooldown seconds (it was
  // browseCooldown, 7; free samples keep that). And a browsing shopper who is not beside any goods
  // looks round every liftLook seconds for a floor tile beside a belt carrying something
  // stealable, liftMin to liftMax tiles of walking away; with chance liftChance he goes out of his
  // way to it, takes the first thing that comes along, and goes back to his route. He gives up
  // after liftSecs (getting there and waiting both count). Never in a training game.
  grabCooldown: 5,
  liftLook: 0.5,
  liftMin: 2,
  liftMax: 5,
  // (Each look is a fresh chance, so it adds up while he walks past a line. 0.06 made about 2.9
  // times as many goods go missing as before on the ready-made demo layout, which is what the owner
  // asked for; see PLAN.md, version 0.3.01.)
  liftChance: 0.06,
  liftSecs: 5,
  nagRange: 2.5, // towers this close to a Karen...
  nagRate: 0.5, // ...fire at this share of their speed
  leaveSecs: 0.8, // how long the storming-out animation lasts
  messEvery: 5, // seconds between a teenager's messes (each teen starts at a random point in this)
  messSecs: 12, // how long a mess stays on the floor
  // How long a child sits in the cart before he can first escape: every child gets his own time
  // between these two (seconds; worked out from his mom's id, see kidFirst in step.js). It was a
  // flat 2 seconds until 0.2.17, and with kidChance on top nearly every kid was out within a few
  // seconds of the door, so they all ended up waiting in the same few spots (the owner). The wide
  // spread puts them all over the store.
  kidFirstMin: 3,
  kidFirstMax: 20,
  kidChance: 0.22, // chance per second that a child in the cart escapes, once he can
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
  // The owner found a gym bro wrecked too much (0.2.12): he now lands only so many hits in his
  // whole visit, and rests after each. Every hit counts, even one a Durability level shrugs off.
  // While resting, and once he is spent, he walks round crates like an ordinary shopper.
  smashMax: 2, // hits a gym bro can land in one visit to the store
  smashWait: 10, // seconds after a hit before he can hit anything again

  // TV Salesman.
  pitchCool: 9, // seconds before any salesman can pitch to the same shopper again
  // Each further pitch by the same salesman to the same shopper has this times the stop chance of
  // the one before, so a slow shopper with a high chance cannot be held at one stand forever.
  pitchRepeat: 0.5,
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
  // Training shift: a lesson's shoppers walk in with base patience divided by this. The lessons
  // were written (and their test plays them) for the base numbers as they were before 0.2.10,
  // when Normal's x0.9 was not yet folded into them; dividing it back out keeps every lesson
  // exactly as it was. (A training game uses no difficulty and no patience multiplier.)
  trainingPatienceDivisor: 0.9,
  // Pregnant Lady.
  popSpread: 0.35, // her babies appear up to this far (in tiles) from where she stood, so they are not one dot
  // Every shopper walks at his own pace (0.3, the owner's request): anywhere between this share
  // slower and this share faster than his kind's speed, spread evenly, so a group of one kind
  // strings out instead of walking the maze as one clump. Worked out from his id (walkPace in
  // step.js), like the babies' own spread: no field in the state, no random draw. Not the boss
  // (one man, written for his exact speed), not babies (they have BABY.paceMin and paceMax), and
  // not in a training game (the lessons were written for exact speeds).
  paceSpread: 0.1,
  // Weak and tough (0.3.01, see `weak` and `tough` on SHOPPERS): a shopper loses this many times
  // the usual patience to the kind of security he is weak to, and this many to the kind he is
  // tough against. Small on purpose (the owner's "around 10%"): something to learn about each
  // kind, not a reason to build only one tower. (For a Wet Floor Sign, the time he takes to
  // cross it is multiplied instead: see edgeMul in step.js.)
  weakMul: 1.1,
  toughMul: 0.9,
  // The Midnight Release (0.3.01, the owner's request: a mob of Card Traders all at once). Sales
  // events releaseFrom, releaseFrom + releaseEvery and so on, never a boss event (7, 12, 17 ...:
  // two after each boss), on a fixed schedule so players can plan for it. The mob is releaseFirst
  // traders at the first release and releaseStep more at each one after, for one player (each
  // player after the first adds crowdPerPlayer of that, like any crowd); these are the numbers
  // that arrive, not halved by crowdScale or shaped by crowdCurves. They all come through one
  // entrance (a different one each release, among the open ones), releaseAt seconds after the
  // doors open, within releaseSecs. Head Office cannot stop it. The rest of that event's crowd
  // is releaseCrowd of its usual size.
  releaseFrom: 7,
  releaseEvery: 5,
  releaseFirst: 12,
  releaseStep: 4,
  releaseAt: 20,
  releaseSecs: 2,
  releaseCrowd: 0.85,
  // Ripping packs (see SHOPPERS.trader): he goes out of his way for a Mystery Box up to ripMax
  // tiles of walking (a shoplifter only TUNE.liftMax), with chance ripChance at each look; one he
  // has taken he stands and opens for ripSecs, and every other Card Trader within ripLook tiles
  // who is walking stops for ripWatch seconds to see what he pulled, then will not stop to watch
  // again for ripCool seconds (so a mob slows down but never freezes). The ripper himself is not
  // tempted again for ripSecs + grabCooldown.
  ripMax: 8,
  ripChance: 0.12,
  ripSecs: 3,
  ripLook: 1.5,
  ripWatch: 1.5,
  ripCool: 6,
  // The deal (0.3.01, see CARDS): between the lobby and the first build phase, the game's cards are
  // revealed one by one: the first cardLead seconds in, then one every cardSecs (slow enough to
  // read each on a phone before the next), and cardPause after the last card has had its cardSecs,
  // the build phase starts. Seconds at normal speed: game speed does not shorten it.
  // cardSecs was 4.5 until the cards were put on screen (0.3.01): a card takes 0.7 s to fly in,
  // so that left under 4 s to read it, and a typical card (name, rule and joke) is about 33 words,
  // 14 of them the name and the rule. At 7 s a phone player reads the rule and most of the joke
  // before the next card arrives; the long ones can be read again from the slots afterwards.
  cardLead: 1.5,
  cardSecs: 7,
  cardPause: 1.5,
};

/**
 * The cards (0.3.01, the owner's request): every game from the menu is dealt five of these when
 * everyone is ready, two bad for the players, two good, one odd, revealed in the order bad, good,
 * bad, good, odd (see src/sim/cards.js; the design is in .claude/briefs/deck.md). Each card's
 * numbers are here, so the rules and the words shown to players (src/content/cards.js) read the
 * same ones. "Kinds" in a card means the base kind and its super version. Multipliers are of the
 * normal value; where two cards touch the same number they multiply.
 * side: 'bad', 'good' or 'odd'. per: 'kind' for a card that picks a kind of shopper when dealt
 *   (its id in a hand is then 'hardy:karen'). share: the share of shoppers (or tables, or runaways)
 *   it touches, picked by id (see idShare in cards.js), never by a random draw.
 * The cards that change how shoppers behave (freerange, offleash, spayed, eyesup, wrongway,
 * slushie, eightyproof, warranty, supportdog, and the larger drawing of bde) came in a second
 * round of 0.3.01; their rules are in step.js, with helpers in cards.js.
 * The numbers were tuned by a playtest with the scripted players (tools/cardtest.mjs, 0.3.01): one
 * card alone should move how long they last by no more than about an event and a half, in the
 * direction of its side (an odd card by under one), and a hand of five should leave them near
 * where they end without cards. The numbers the playtest changed say what they were before it.
 */
export const CARDS = {
  // ---- Bad for the players
  litter: { side: 'bad', pops: 2 }, // Pregnant Ladies' babies, times
  doubledip: { side: 'bad', share: 0.2, cash: 2 }, // that share of shoppers takes that times the refund cash (one in three before the playtest: once the pick turned with the seed it cost the scripted players four events)
  freerange: { side: 'bad', ahead: 1.5 }, // a runaway kid's spot is that many times as far along the route
  offleash: { side: 'bad', share: 0.4, runs: 2 }, // that share of moms' kids run off that many times as often
  preworkout: { side: 'bad', share: 0.4, hits: 2 }, // that share of gym bros land that many times the hits
  spayed: { side: 'bad', share: 0.3, pups: 5, supPups: 8 }, // that share of dogs are pregnant: puppies a Stray Dog, a Great Dane
  bde: { side: 'bad', hp: 1.2, size: 1.5 }, // bosses' patience, and how much larger they are drawn
  hardy: { side: 'bad', per: 'kind', hp: 1.25 }, // (1.3 before the playtest: on dads it cost too much)
  hurry: { side: 'bad', per: 'kind', speed: 1.2 },
  clearance: { side: 'bad', sell: 0.85 }, // everything shipped sells for that
  klepto: { side: 'bad', chance: 2, heal: 0.4 }, // shoplifters' chance to go for goods, times; the share of his full patience each theft gives back (reworked 2026-11-24, see DEALABLE: it was 3 tiles further)
  shrinkflation: { side: 'bad', cost: 1.08 }, // every building's price (not upgrades; 1.1 before the playtest)
  pissing: { side: 'bad', pee: 1.5 }, // how long a dog's pee switches security off, times
  doorbuster: { side: 'bad', crowd: 1.1 }, // the ordinary crowd (not the boss, not a Midnight Release mob)
  sensibleshoes: { side: 'bad', slip: 0.7 }, // the chance to slip on a wet floor or a mess, times
  dryjanuary: { side: 'bad', fall: 0.5 }, // a Day Drinker's chance to fall at a corner, times
  retreat: { side: 'bad', pep: 1.5 }, // what a boss's pep talk gives back, times
  // ---- Good for the players
  lootbox: { side: 'good', item: 'box', sell: 3 },
  asseenontv: { side: 'good', item: 'gadget', sell: 1.7 },
  regifting: { side: 'good', item: 'giftset', sell: 1.5 },
  offatruck: { side: 'good', group: 'factory', free: 1 }, // free upgrade levels on one random track of every new building of that group
  mallcop: { side: 'good', group: 'security', free: 1 },
  pulledout: { side: 'good', pops: 0.5 },
  eyesup: { side: 'good', share: 0.5, range: 4, gap: 1.5 }, // dads within range of an Exhibitionist ahead fall in that far behind her
  wrongway: { side: 'good', share: 0.35 }, // that share of runaway kids run back toward the entrance
  slushie: { side: 'good' }, // a Teenager's mess covers the tile and the four beside it
  eightyproof: { side: 'good', share: 0.5, chance: 0.25, step: 0.25, hit: 0.4 }, // that share of Free Sample tables hand out booze; hit: the share of the patience he has left that turning costs him (reworked 2026-11-24, see DEALABLE)
  frail: { side: 'good', per: 'kind', hp: 0.75 },
  slow: { side: 'good', per: 'kind', speed: 0.85 },
  warranty: { side: 'good', chance: 0.06, sample: 50, salesMin: 100, salesMax: 400 },
  supportdog: { side: 'good', share: 0.4, range: 1.5, secs: 1.5 },
  staffdiscount: { side: 'good', cost: 0.9 },
  overtime: { side: 'good', bonus: 1.5 }, // the end-of-event bonus, times
  mopmike: { side: 'good', slip: 1.4 },
  restocking: { side: 'good', fee: 2 }, // dollars every shopper who storms out pays (not babies)
  firecode: { side: 'good', targets: 5 }, // shoppers a Pepper Sprinkler reaches at once
  happyhour: { side: 'good', fall: 2 },
  // ---- Neither
  convention: { side: 'odd', shield: 1.5, speed: 0.8, hp: 0.75 }, // a Cosplayer's shield reach (tiles), walking speed (tiles a second), patience
  bulkbuy: { side: 'odd', crowd: 0.75, hp: 1.15 }, // (hp 1.25 before the playtest: it was a bad card)
  flashmob: { side: 'odd', crowd: 1.25, hp: 0.75 }, // (hp 0.8 before the playtest: it was a bad card)
  artisanal: { side: 'odd', sell: 1.2, work: 1.25 }, // everything sells for, and every machine's time for an item, times (sell 1.3 before the playtest: it was a good card)
  premature: { side: 'odd', rate: 1.25, range: 0.85 }, // security's rate of fire and range, times
  fathersday: { side: 'odd', who: 'dad', crowd: 2, hp: 0.72 }, // that kind's groups, times; and patience (0.65 before the playtest)
  payday: { side: 'odd', sell: 1.2, refund: 1.6 }, // (refund 1.4 before the playtest: it was a good card)
  mallwalkers: { side: 'odd', speed: 1.15, hp: 0.85 }, // every shopper but the boss
  openbar: { side: 'odd', who: 'drinker', crowd: 2, hp: 0.7 },
  rentacop: { side: 'odd', cost: { security: 0.8, factory: 1.2 } },
  sweatshop: { side: 'odd', cost: { factory: 0.8, security: 1.2 } },
};

/**
 * The cards that can be dealt: every card whose rule exists (all 48 since the second round of
 * 0.3.01). A card whose rule is still to be written, or one the playtest finds working against its
 * own side, stays off this list until it is fixed. A forced hand (createGame({ cards: [...] })) may
 * hold any card in CARDS.
 * Two cards were out of the deal for a while in 0.3.01, because the playtest (tools/cardtest.mjs)
 * found them doing the opposite of what their side promises, and came back reworked on the owner's
 * decision of 2026-11-24:
 *   eightyproof  a good card that did not help: a shopper turned Day Drinker took a Day Drinker's
 *                patience at the share he had, which gave most kinds patience, and shrugs off the
 *                Pepper Sprinkler. Now he never gains patience, falls on the spot as he turns and
 *                loses `hit` of what he has left. Measured with the "stalls" player (the one who
 *                builds sample tables), seeds 1-40: the steady one lasts 0.6 events longer on
 *                average (0.8 over seeds 1-20, with 0.7 fewer refunds by event 12).
 *   klepto       a bad card that helped: a shoplifter's detour from 3 tiles further was more time
 *                in reach of security than his goods were worth. Now there is no extra reach, and
 *                every theft gives the thief back `heal` of his full patience. Seeds 1-40: every
 *                scripted player takes about half a refund more by event 12 and the plain ones lose
 *                0.3 to 0.5 events sooner; the steady ones' ending barely moves (0.1 sooner).
 */
export const DEALABLE = [
  'litter', 'doubledip', 'preworkout', 'bde', 'hardy', 'hurry', 'clearance', 'klepto', 'shrinkflation',
  'pissing', 'doorbuster', 'sensibleshoes', 'dryjanuary', 'retreat',
  'lootbox', 'asseenontv', 'regifting', 'offatruck', 'mallcop', 'pulledout', 'frail', 'slow',
  'staffdiscount', 'overtime', 'mopmike', 'restocking', 'firecode', 'happyhour',
  'convention', 'bulkbuy', 'flashmob', 'artisanal', 'premature', 'fathersday', 'payday', 'mallwalkers',
  'openbar', 'rentacop', 'sweatshop',
  // (The cards that change how shoppers behave, 0.3.01's second round.)
  'freerange', 'offleash', 'spayed', 'eyesup', 'wrongway', 'slushie', 'eightyproof', 'warranty', 'supportdog',
];

/**
 * Cards never dealt together. For two per-kind cards it is only for the same kind (hardy:karen
 * with frail:karen), since a kind made tougher and weaker at once would cancel out.
 */
export const CARDS_APART = [
  ['litter', 'pulledout'], ['freerange', 'wrongway'], ['shrinkflation', 'staffdiscount'],
  ['sensibleshoes', 'mopmike'], ['dryjanuary', 'happyhour'], ['hardy', 'frail'], ['hurry', 'slow'],
];

/**
 * Kinds a per-kind card never picks: the Exhibitionist helps the players (so the card's side
 * would flip), and the Card Trader only comes to a Midnight Release.
 */
export const CARD_SKIP_KINDS = ['flasher', 'trader'];

/**
 * How many shoppers of the crowd before TUNE.crowdScale each shopper now stands for (2 while the
 * crowd is halved). Whatever is paid or charged per shopper is multiplied by it, so the totals
 * stay as they were: the cash a refund takes, Head Office's prices and his bonus per refund.
 */
export const perHead = () => 1 / TUNE.crowdScale;

/**
 * Head Office: a player who runs the shoppers instead of the store (see office.js).
 * kinds: for each kind of shopper (but the Card Trader, who only comes to a Midnight Release and
 *   cannot be bought), the first wave it can be bought for (the same wave the
 *   automatic waves first include it), a price weight for its trick, and the seconds between
 *   arrivals in a group.
 * perRefund and every gap are per shopper, so they are multiplied by perHead() below (once, when
 * the game loads): with half as many shoppers, each refund is worth twice the bonus, and a group
 * bought with the same money arrives over the same length of time.
 */
export const OFFICE = {
  share: 0.85, // his budget is this share of what the automatic wave is worth...
  carry: 0.5, // ...plus this share of what he left unspent last wave...
  perRefund: 5, // ...plus this much (times perHead) for every shopper who got a refund last wave
  maxGroups: 24, // most groups in one plan
  maxSize: 200, // most shoppers in one group
  maxAt: 60, // latest a group may start arriving, in seconds after the doors open
  // A shopper's price is his patience x speed x his kind's weight, divided by this (then times
  // perHead). It was 10 until 0.2.10; patience then became Normal's (x0.9), and 9 keeps every
  // price exactly as it was.
  patiencePerDollar: 9,
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
    // Her trick costs the store a dozen fast shoppers unless she is lasered, so she is priced high.
    preggo: { from: 8, weight: 1.5, gap: 5 },
    cosplay: { from: 9, weight: 1.4, gap: 5 },
  },
};
OFFICE.perRefund *= perHead();
for (const kind of Object.values(OFFICE.kinds)) kind.gap *= perHead();

/**
 * Holidays (0.3): the keys a game's `state.holiday` may hold. From the week before one of these to
 * the day after it, the host's computer's date gives a new game that holiday (see
 * src/content/holidays.js, which keeps the calendar outside the simulation): the bosses wear a
 * festive outfit and DEB has jokes about it. No rule of the game changes with it.
 */
export const HOLIDAYS = ['xmas', 'thanksgiving', 'valentine', 'july4', 'halloween', 'stpat', 'easter', 'newyear', 'mardigras'];
