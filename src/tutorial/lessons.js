// The training shift: a guided, hands-on walk through the shop floor, The Back and the shoppers who
// cheat. No DOM here, so a test can play the whole tutorial from Node and prove that each step can
// be completed.
//
// Each step has:
//   title, text   what the panel shows (plain instructions; `text` is a list of paragraphs). The
//                 first paragraph is the "Do this:" line: what to press, then why (0.3.03: a player
//                 who reads only that must know what to do)
//   touch         the same paragraphs for a touch screen, where they differ (a building is dragged
//                 from the bar onto its tile); without it, `text` goes through content/touch.js
//   quip, mood    what DEB says in her speech bubble when the step starts: what to do, and at most
//                 one short joke after it (none in a lesson that teaches a control for the first time)
//   tool          the build-bar button to highlight, if any (a function (s, f) for a step whose
//                 second half needs another button)
//   marks(s, f)   tiles to highlight that still need attention; each says what it wants there, which
//                 the training arrow follows (src/tutorial/target.js):
//                   k, d      the building or part wanted on the tile, and its facing
//                   f         1: the tile is in The Back (0.4); left out, the shop floor
//                   fix       'rebuild': wreckage that the Rebuild button puts back
//                   del       the part on the tile is to be taken out (Remove)
//                   wd        the wire direction the building there should have (the Wire tool)
//                   r         the reinforcement the Crate Stack there should have (the Reinforce tool)
//                   act       'more': the Returns Drop's MORE JUNK, on its card
//   view(s)       the floor the player should be looking at once nothing is marked (0.4: the arrow
//                 points at the floor switch until he is), or undefined for either
//   doors(s)      false while opening the doors would show nothing yet (the arrow waits instead)
//   wave          shoppers lined up for when the player opens the doors (see waveSpec in the sim)
//   done(s, f)    true once the player has done what was asked (f = facts gathered this step)
//   hint(s, f)    a one-line nudge for where the player is right now, or null
//   solve(s)      the commands that complete the step (used by tests, Skip, and ?step= jumps); the
//                 extra command { c: 'view', f } is not the game's: it looks at that floor
//   after(s)      commands that finish the step once its wave is over (tests and jumps send them)
//   manual        the step is only an explanation; it ends when the player presses Next
//   part2         the first step of part 2, The Back (the panel can jump to it)
//
// What the shift covers (0.4, stage 6). Part 1, the shop floor: a wall of Crate Stacks, the route
// that can never be blocked, every security building (each placed by the player), Remove, super
// shoppers and the dads walking straight through it all. Part 2, The Back: Tab, a Returns Drop, a
// Spite Still, belts into a Dumbwaiter, an Unpaid Intern, a Splitter (the Overpass and the Clearance
// Bin in words), a building running dry, the Rebrander. Part 3: Razor Wire (the Wire tool, planned
// and live, the two dad routes, a Barb Bender), Gym Bros with Rebuild, reinforced crates (Duct Tape
// in words), and money (event pay, the speed bonus, MORE JUNK). The only shoppers sent in are Coupon
// Clippers (super ones in the Barcode Laser lesson), Dads and Gym Bros; test/tutorial.test.js holds
// it to that, and checks every claim the lessons make against the rules on several seeds.
//
// Facts gathered during a step (f): floor (the floor looked at now), nopes (refusals by reason),
// waveStarts, waveEnds, and counts of what happened: slip, watched, beam (the most shoppers one
// Barcode Laser beam hit), smashed and smashedCrate, rebuilt, made (supplies a machine or Rebrander
// finished) and spite (Bottled Spite among them), stocked (units sent up a Dumbwaiter), outs (stock
// that ran out, as 'tile:track'), turned (dads Razor Wire turned away and charged for).
import {
  queueTrainingWave, setTrainingCash, addTrainingDrops, TUNE, BUILD, BACK, TICK_HZ, sizeOf, wireLive, unitsIn, stockCap,
  dropTicks, makeTicks, rebrandTicks, dropUpCost, reinforceCost, itemType, usesPer,
} from '../sim/index.js';
import { tierRows, fmt } from '../content/facts.js';

const S = 1; // facing south (down)
const E = 0, W = 2, N = 3;
const FACING = ['right', 'down', 'left', 'up'];
const at = (s, x, y) => s.grid[y * s.w + x];
const atB = (s, x, y) => (s.back ? s.back[y * s.w + x] : 0);
const is = (s, x, y, k, d) => { const b = at(s, x, y); return !!b && b.k === k && (d === undefined || b.d === d); };
const isB = (s, x, y, k, d) => { const p = atB(s, x, y); return !!p && p.k === k && (d === undefined || p.d === d); };
const place = (k, x, y, d = 0) => ({ c: 'place', k, x, y, d });
const placeB = (k, x, y, d = 0) => ({ c: 'place', k, x, y, d, f: 1 });
const remove = (x, y) => ({ c: 'remove', x, y });
const removeB = (x, y) => ({ c: 'remove', x, y, f: 1 });
const view = (f) => ({ c: 'view', f });

// ---- Where things go --------------------------------------------------------------------------
// Chosen by playing each lesson across many random seeds (see test/tutorial.test.js): the claims in
// each lesson's text hold whatever the seed.
/** The wall of Crate Stacks down column 10, from the top of the store to one tile off the bottom. */
const WALL = Array.from({ length: 13 }, (_, n) => [10, 1 + n]);
/** The one tile left open at the bottom of the wall: the gap every shopper walks through. */
const GAP = [10, 14];
// The first Sprinkler replaces the bottom crate of the wall, right over the gap: the lesson that
// teaches Remove, and that security is a wall too. The second goes beside it, on the side the
// shoppers come from.
const GAP_SPRINKLER = [10, 13];
const SIDE_SPRINKLER = [9, 13];
const SAMPLES = [8, 13];
// The TV Salesman (2 x 2, top-left tile here) low on the left, where the Coupon Clippers pass on
// their way down to the gap, with a Sprinkler just above him: the ones who stop to watch stand in
// its spray.
const SALESMAN = [4, 13];
const SALES_SPRINKLER = [5, 12];
/** The TV Salesman lesson's crowd: more than the gap gets through without him (the tests check). */
const SALES_CROWD = 30;
// The Barcode Laser: three tiles standing up and down above column 6, facing down. Everyone comes in
// along row 7 and turns down column 6 to the gap, and a crowd backs up along it at the TV Salesman
// and the samples, so its beam (10 tiles: rows 7 to 16) runs down the whole queue.
const LASER = [6, 4];
// With it, a third Sprinkler beside the Free Samples, where the shoppers who stop for a sample stand
// in its spray (until 0.4 a lesson of its own, on super shoppers): without it, super shoppers get
// past the laser and the gap (the tests check every seed).
const SUPER_SPRINKLER = [7, 13];
// Its crowd of Extreme Couponers (super Coupon Clippers): more than the layout gets through without
// it, none with it.
const LASER_CROWD = 30;
const LASER_WORD = 'thirty';
// The Forklift Turret: its circle (6 tiles) covers the whole way down column 6, the dads' straight
// line across the store, and the way down to the gap. Its Dumbwaiter is fed in part 2.
const FORKLIFT = [8, 9];
/** The dads who meet it: ordinary ones, then Dads on a Mission. Most walk straight through. */
const DAD_WAVE = [{ k: 'dad', n: 4, gap: 0.35, at: 0 }, { k: 'dad', n: 2, gap: 0.35, at: 1.4, sup: 2 }];
const DAD_COUNT = 'six';
// By the entrance: shoppers coming in must walk round these, a gym bro walks through one.
const DOOR_CRATES = [[2, 7], [2, 8], [1, 9]];

// The Back (0.4). The training game has no map, so no Returns Drops of its own: the shift puts down
// two (addTrainingDrops), where the lessons need them. The first stands under the top of the crate
// wall, facing down: its junk goes down column 10 (nothing in The Back is under the shop's crates),
// through a Spite Still and on down to the gap Sprinkler's Dumbwaiter, the line every lesson of
// part 2 adds to. The second stands left of the Forklift's tile, for its Razor Wire.
const DROP = [10, 2, S];
const WIRE_DROP = [6, 9, E];
export const TRAINING_DROPS = [DROP, WIRE_DROP];
const JUNK_BELT = [10, 3];
const STILL = [10, 4];
/** The line from the Still down to the gap Sprinkler's Dumbwaiter (10, 13). */
const LINE = Array.from({ length: 8 }, (_, n) => [10, 5 + n]);
// The Unpaid Intern stands left of the line at the Forklift's height, facing it: he takes Spite off
// the belt behind him (10, 9) and hands it to the Forklift's Dumbwaiter (8, 9).
const INTERN = [9, 9];
// The Splitter takes the last belt's place above the gap Sprinkler: its front feeds that one, its
// left side a belt down into the second Sprinkler (9, 13).
const SPLITTER = [10, 12];
const BRANCH = [9, 12];
// Running dry: the belt the Intern takes from comes out, so nothing reaches the Forklift. (A cut
// further up would leave the belts below it full, which would feed it for another minute.) A
// Forklift holds a minute of shooting, so its crowd comes one a second for a minute (the tests
// check that it runs dry on every seed, and that it does not with the line whole).
const CUT = [10, 9];
const DRY_WAVE = [{ k: 'clipper', n: 60, gap: 1, at: 0 }];
const DRY_CROWD = 60;
// Then the Rebrander goes in the belt above the cut, and the cut belt goes back: the Store Brand
// waiting further up the line goes through it, and the Forklift, empty, fills up with Name Brand.
const REBRANDER = [10, 8];
/** The Barb Bender, between the second drop and the Forklift's Dumbwaiter, facing it. */
const BENDER = [7, 9];
/** The Forklift's wire: north, across the dads' straight line. */
const WIRE_DIR = N;

/** What removing something gives back, as the Remove button says it ("75% back"). */
const BACK_SHARE = `${Math.round(TUNE.sellBack * 100)}%`;

// ---- Numbers from the rules (never typed in: the tuning changes) ------------------------------
const secs = (t) => fmt(t / TICK_HZ);
const JUNK_SECS = secs(dropTicks(0, {}));
const MAKE_SECS = secs(makeTicks({}));
const REBRAND_SECS = [1, 2, 3].map((t) => secs(rebrandTicks({}, t)));
const CAP = stockCap(null);
const hit = (k, tier) => fmt(tierRows(k, 'dmg')[tier].dmg);
const FORK_SHOTS = usesPer('forklift', 'dmg', 1);
const WIRE_TURNS = usesPer('forklift', 'wire', 1);
const TAPE_HITS = usesPer('forklift', 'dur', 1);
const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const MORE_JUNK = money(dropUpCost(0));
const REINFORCE_FIRST = money(reinforceCost({ k: 'crate', r: 0 }));
const REINFORCE_MAX = BUILD.crate.reinforce.max;
const HITS_WORD = ['no', 'one', 'two', 'three', 'four'][TUNE.smashMax] ?? String(TUNE.smashMax);

// The Back's hotkeys, as its build bar numbers them (BACK_GROUPS in src/ui/input.js: what moves
// things, then what makes them, in the order of BUILD; keys 1 to 9, 0 and -).
const BACK_ORDER = [
  ...Object.keys(BUILD).filter((k) => BUILD[k].back && !BUILD[k].fixed && !BUILD[k].supply && k !== 'rebrand'),
  ...Object.keys(BUILD).filter((k) => BUILD[k].back && !BUILD[k].fixed && (BUILD[k].supply || k === 'rebrand')),
];
const KEY = (k) => ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'][BACK_ORDER.indexOf(k)] || '';

/**
 * Marks for a list of [x, y, kind, facing, label] wanted buildings that are not correctly in place
 * yet. Each mark also says what it wants (k, d), for the training arrow (src/tutorial/target.js).
 */
function wanted(s, list) {
  const out = [];
  for (const [x, y, k, d, label] of list) if (!is(s, x, y, k, d)) out.push(d === undefined ? { x, y, label, k } : { x, y, label, k, d });
  return out;
}

/**
 * The same for parts wanted in The Back (each mark has f: 1). A few tiles side by side would have
 * their captions on top of each other: only the first still to do keeps its caption then.
 */
function wantedB(s, list) {
  const out = [];
  for (const [x, y, k, d, label] of list) if (!isB(s, x, y, k, d)) out.push(d === undefined ? { x, y, f: 1, label, k } : { x, y, f: 1, label, k, d });
  if (out.length <= 3) for (let n = 1; n < out.length; n++) out[n].label = '';
  return out;
}

/** Hint text for the common mistakes on a tile that should hold building k facing d. */
function tileHint(s, x, y, k, d, name) {
  const b = at(s, x, y);
  if (!b) return null;
  if (b.k !== k) return `Something else is on the highlighted tile. Right-click it to remove it, then place the ${name}.`;
  if (d !== undefined && b.d !== d) {
    // (One way for both a mouse and a finger: the building's card. content/touch.js words it for a finger.)
    return `The ${name}'s arrow must point ${FACING[d]}. Put down what you are holding (Esc, or click its button again), click the ${name}, and click ⟳ Rotate on its card until the arrow points ${FACING[d]}.`;
  }
  return null;
}

/** The same for a part in The Back (they have no card: right-click takes one out). */
function backHint(s, x, y, k, d, name) {
  const p = atB(s, x, y);
  if (!p) return null;
  if (p.k !== k) return `Something else is on the highlighted tile in The Back. Right-click the highlighted part to take it out, then put the ${name} there.`;
  if (d !== undefined && p.d !== d) return `The ${name}'s arrow must point ${FACING[d]}. Point at it with nothing held and press R to turn it.`;
  return null;
}

/**
 * The tiles a building bigger than one tile (k, facing d) covers with its top-left tile on (x, y),
 * as [x, y] pairs, the top-left first.
 */
function tilesFor(k, x, y, d = 0) {
  const [w, h] = sizeOf(k, BUILD[k].rot ? d : 0);
  const out = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([x + dx, y + dy]);
  return out;
}

/** The building covering (x, y), with the tile that holds it (its top-left), or null. */
function bigAt(s, x, y) {
  const g = at(s, x, y);
  if (!g) return null;
  const i = g.part !== undefined ? g.part : y * s.w + x;
  const b = s.grid[i];
  return b ? { b, x: i % s.w, y: (i / s.w) | 0 } : null;
}

/**
 * Marks for a building bigger than one tile, wanted with its top-left tile on (x, y) facing d:
 * the top-left tile says what it wants (the arrow points there); the rest of its tiles are only
 * highlighted, while they are still empty, so the player sees where all of it goes.
 */
function wantedBig(s, x, y, k, d, label) {
  if (is(s, x, y, k, d)) return [];
  const want = (tx, ty, text) => (d === undefined ? { x: tx, y: ty, label: text, k } : { x: tx, y: ty, label: text, k, d });
  const [, ...rest] = tilesFor(k, x, y, d);
  // Something else in the way on the other tiles comes first, so the arrow sends the player to
  // remove it (a building already covering the top-left tile is dealt with there).
  const first = bigAt(s, x, y);
  const seen = new Set(first ? [`${first.x},${first.y}`] : []);
  const blocked = [];
  for (const [tx, ty] of rest) {
    const o = bigAt(s, tx, ty);
    if (!o || seen.has(`${o.x},${o.y}`)) continue;
    seen.add(`${o.x},${o.y}`);
    blocked.push(want(tx, ty, 'Remove'));
  }
  return [...blocked, want(x, y, label), ...rest.filter(([tx, ty]) => !at(s, tx, ty)).map(([tx, ty]) => ({ x: tx, y: ty, label: '' }))];
}

/** Hint text for a building bigger than one tile that should have its top-left tile on (x, y). */
function bigHint(s, x, y, k, d, name) {
  for (const [tx, ty] of tilesFor(k, x, y, d)) {
    const o = bigAt(s, tx, ty);
    if (!o) continue;
    if (o.b.k !== k) return `Something else is on a highlighted tile. Right-click it to remove it, then place the ${name}.`;
    const turned = d !== undefined && ((o.b.d | 0) & 1) !== (d & 1);
    if (o.x !== x || o.y !== y || turned) {
      // A big building only turns end for end once it is built, so one standing the wrong way
      // round, or in the wrong place, comes up and goes down again.
      const turn = d === undefined ? '' : `, press R until the arrow on the preview points ${FACING[d]},`;
      return `The ${name} is not on the highlighted tiles. Right-click it to remove it${turn} and place it again on the highlighted tiles.`;
    }
  }
  return tileHint(s, x, y, k, d, name);
}

const openDoorsHint = (s, f) => (f.waveEnds ? null
  : s.phase === 'wave' ? 'The doors are open. Watch what happens at the gap.'
    : 'Now press OPEN THE DOORS at the top of the screen.');

/** The same, with what to watch for while the wave is on. */
const watchHint = (watch) => (s, f) => (f.waveEnds ? null
  : s.phase === 'wave' ? watch : 'Press OPEN THE DOORS at the top of the screen.');

/** A nudge to the floor a lesson wants looked at, or null if the player is there. */
const floorHint = (f, want) => (f.floor === want ? null
  : want ? 'Press Tab (or CHECK IN THE BACK, bottom right of the floor) to go down to The Back.'
    : 'Press Tab (or BACK TO THE FLOOR, bottom right of the floor) to go back up to the shop.');

// ---- What the lessons check -------------------------------------------------------------------
const stockOf = (s, [x, y], track = 'dmg') => { const b = at(s, x, y); return b && b.s && b.s[track] ? b.s[track] : null; };
const forklift = (s) => at(s, ...FORKLIFT);
/** Some of the Forklift's Spite is Name Brand or better (its pip shows the brand it works at, the oldest). */
const forkBranded = (s) => { const r = stockOf(s, FORKLIFT); return !!r && r.some((v, n) => n % 2 === 0 && v >= 2); };
const dropAt = (s) => atB(s, DROP[0], DROP[1]);
/** Any supply anywhere downstream of the Still: on the line, in a part, or stocked. */
const spiteSeen = (s) => {
  const p = atB(s, ...STILL);
  if (p && p.out && itemType(p.out) === 1) return true;
  return LINE.some(([x, y]) => { const q = atB(s, x, y); return q && q.it && q.it.some((c, n) => n % 2 === 0 && itemType(c) === 1); });
};
/** The Forklift full of Store Brand Spite: Name Brand cannot go up until it has fired some. */
const forkFull = (s) => { const b = forklift(s); return !!b && b.k === 'forklift' && unitsIn(b, 'dmg', s) >= stockCap(s); };
const doorCratesDone = (s) => DOOR_CRATES.every(([x, y]) => is(s, x, y, 'crate') && (at(s, x, y).r | 0) >= 1);
/** The Forklift ran out of Spite during this lesson (its own `stockOut`, not another building's). */
const forkRanDry = (s, f) => f.outs.includes(`${FORKLIFT[1] * s.w + FORKLIFT[0]}:dmg`);
/**
 * Nothing new reaches the Forklift: the belt the Intern takes from is out, or the Intern himself is
 * not in his place (a player may take him out instead of the belt: the Forklift runs dry all the
 * same, and the Rebrander lesson puts him back).
 */
const forkStarved = (s) => !isB(s, ...CUT, 'conv') || !isB(s, ...INTERN, 'intern', W);

// ---- Putting back what an earlier lesson built (0.4.00) ---------------------------------------
// Each lesson of parts 2 and 3 relies on what the ones before it built. Anything the player has
// since taken out, turned the wrong way or replaced is marked again, with a hint saying so, so that
// no lesson waits for something that cannot come. The lists are [x, y, kind, facing, label]: The
// Back's in the order the junk meets them, then the shop floor's.
const DROP_PART = [DROP[0], DROP[1], 'drop', DROP[2], 'Returns Drop, arrow down'];
const WIRE_DROP_PART = [WIRE_DROP[0], WIRE_DROP[1], 'drop', WIRE_DROP[2], 'Returns Drop, arrow right'];
const INTERN_PART = [...INTERN, 'intern', W, 'Intern, arrow left'];
const FORK_SHOP = [[...FORKLIFT, 'forklift', undefined, 'Forklift']];
const GAP_SHOP = [[...GAP_SPRINKLER, 'sprinkler', undefined, 'Sprinkler']];
const SIDE_SHOP = [[...SIDE_SPRINKLER, 'sprinkler', undefined, 'Sprinkler']];

/**
 * The first line, from its Returns Drop down column 10 to row `to`: the drop, the belt under it,
 * the Spite Still and the belts below. (No lesson needs it below the Rebrander's tile.)
 */
function lineTo(to) {
  const out = [DROP_PART, [...JUNK_BELT, 'conv', S, 'Belt'], [...STILL, 'still', S, 'Spite Still, arrow down']];
  for (const [x, y] of LINE) if (y <= to) out.push([x, y, 'conv', S, 'Belt']);
  return out;
}

/**
 * Marks for what an earlier lesson built that is no longer right: `back` parts in The Back, then
 * `shop` buildings on the shop floor. A mark beside one already listed loses its caption, so a run
 * of missing belts is captioned once.
 */
function fixMarks(s, back, shop = []) {
  const out = [];
  if (s.back) for (const [x, y, k, d, label] of back) if (!isB(s, x, y, k, d)) out.push({ x, y, f: 1, label, k, d });
  out.push(...wanted(s, shop));
  return out.map((m, n) => (out.slice(0, n).some((o) => (o.f | 0) === (m.f | 0) && Math.abs(o.x - m.x) + Math.abs(o.y - m.y) === 1) ? { ...m, label: '' } : m));
}

const an = (name) => (/^[AEIOU]/.test(name) ? `an ${name}` : `a ${name}`);

/** The hint for the first thing fixMarks marks, or null if nothing is. */
function fixHint(s, f, back, shop = []) {
  if (s.back) {
    for (const [x, y, k, d] of back) {
      if (isB(s, x, y, k, d)) continue;
      const name = BUILD[k].name;
      return floorHint(f, 1) || backHint(s, x, y, k, d, name)
        || `Something an earlier lesson built in The Back is gone. Put ${an(name)} back on the highlighted tile, its arrow pointing ${FACING[d]}.`;
    }
  }
  for (const [x, y, k, d] of shop) {
    if (is(s, x, y, k, d)) continue;
    const name = BUILD[k].name;
    return floorHint(f, 0) || tileHint(s, x, y, k, d, name) || `The ${name} an earlier lesson built is gone. Put ${an(name)} back on the highlighted tile.`;
  }
  return null;
}

/** The build-bar button for the first thing fixMarks marks, or `own` if nothing is (or only a Returns Drop, which is turned, not built). */
function fixTool(s, own, back, shop = []) {
  if (s.back) for (const [x, y, k, d] of back) if (!isB(s, x, y, k, d)) return k === 'drop' ? own : k;
  for (const [x, y, k, d] of shop) if (!is(s, x, y, k, d)) return k;
  return own;
}

/** The Forklift stands, but its wire does not point north (cleared, or turned another way). */
const wireWrong = (s) => is(s, ...FORKLIFT, 'forklift') && forklift(s).wd !== WIRE_DIR;
const COMPASS = ['east', 'south', 'west', 'north'];

/** What the Rebrander lesson needs besides its own two tiles: the line above it, and the Intern. */
const REBRAND_NEEDS = [...lineTo(REBRANDER[1] - 1), INTERN_PART];

export const STEPS = [
  {
    title: 'Welcome to the Returns Department',
    manual: true,
    text: [
      'Do this: read this, then press Next. Every lesson starts with a line like this one, and the big yellow arrow points at what to press.',
      'Shoppers come in through the ENTRANCE on the left and walk to the tills on the right. Each one who reaches a till takes a refund out of your cash, and in a real game too many refunds close the store.',
      'Whatever you build on the shop floor is the maze they walk, and your security wears down their patience along it until they storm off. Under the shop is The Back, where junk becomes the supplies that make security stronger. You cannot lose here, and money is free.',
    ],
    quip: "I'm DEB from HR, and I'm training you today. Read the lesson, do what it says, then press Next.",
    done: () => false,
    solve: () => [],
  },
  {
    title: 'Build the maze: Crate Stacks',
    tool: 'crate',
    text: [
      'Do this: click Crates (or press 1), then press the mouse button on the first highlighted tile, drag straight down to the last one, and let go. A Crate Stack lands on every tile you drag over.',
      'A Crate Stack is the cheapest wall there is: it blocks shoppers (all but dads) and does nothing else. The yellow dashed line is the route shoppers will walk: watch it bend round your wall. A longer route gives your security more time.',
    ],
    touch: [
      'Do this: tap Crates in the bar, then tap each of the highlighted tiles in turn, from the top one down.',
      'A Crate Stack is the cheapest wall there is: it blocks shoppers (all but dads) and does nothing else. The yellow dashed line is the route shoppers will walk: watch it bend round your wall. A longer route gives your security more time. (A building can also be dragged out of the bar onto its tile: it rides above your finger.)',
    ],
    quip: 'Crates down the highlighted column. The construction equivalent of a shrug: you two will get on.',
    marks: (s) => wanted(s, WALL.map(([x, y], n) => [x, y, 'crate', undefined, n === 0 ? 'From here' : n === WALL.length - 1 ? 'to here' : ''])),
    done: (s) => WALL.every(([x, y]) => is(s, x, y, 'crate')),
    hint: (s) => {
      for (const [x, y] of WALL) { const h = tileHint(s, x, y, 'crate', undefined, 'Crate'); if (h) return h; }
      return null;
    },
    solve: () => WALL.map(([x, y]) => place('crate', x, y)),
  },
  {
    title: 'You can never block the route completely',
    tool: 'crate',
    text: [
      'Do this: try to put a Crate in the highlighted gap at the bottom of your wall. It will be refused: shoppers must always have a way through.',
      'A one-tile gap is the best you can do, and it is exactly where security belongs.',
    ],
    touch: [
      'Do this: try to drag Crates onto the highlighted gap at the bottom of your wall. It will be refused: shoppers must always have a way through.',
      'A one-tile gap is the best you can do, and it is exactly where security belongs.',
    ],
    quip: "Try a crate in the gap. You'll be refused. I enjoy saying no to you.",
    marks: (s, f) => (f.nopes.blocked ? [] : [{ x: GAP[0], y: GAP[1], label: 'Try a Crate here', k: 'crate' }]),
    done: (s, f) => f.nopes.blocked >= 1,
    solve: () => [place('crate', ...GAP)],
  },
  {
    title: 'Security: the Pepper Sprinkler',
    tool: 'sprinkler',
    wave: [{ k: 'clipper', n: 3, gap: 1, at: 0 }],
    text: [
      'Do this: right-click the highlighted Crate Stack at the bottom of your wall to remove it, then click Sprinkler (or press 2), click the same tile, and press OPEN THE DOORS at the top.',
      `Security blocks shoppers too, so it can be part of your wall, right over the gap. Removing something gives back ${BACK_SHARE} of what it cost (the Remove tool in the bar does the same as a right-click).`,
      'A Pepper Sprinkler hits everyone within about 2 tiles, twice a second. Shoppers have patience, the bar over their heads: when it runs out they storm off and you keep your cash.',
    ],
    touch: [
      'Do this: tap the highlighted Crate Stack at the bottom of your wall (tap DROP first if you are still holding Crates) and tap ✕ Remove on the card that opens, then drag Sprinkler from the bar onto the same tile and tap OPEN THE DOORS at the top.',
      `Security blocks shoppers too, so it can be part of your wall, right over the gap. Removing something gives back ${BACK_SHARE} of what it cost.`,
      'A Pepper Sprinkler hits everyone within about 2 tiles, twice a second. Shoppers have patience, the bar over their heads: when it runs out they storm off and you keep your cash.',
    ],
    quip: 'Take out the bottom crate, put a Sprinkler there, then OPEN THE DOORS. Three Coupon Clippers are waiting outside.',
    marks: (s) => wanted(s, [[...GAP_SPRINKLER, 'sprinkler', undefined, is(s, ...GAP_SPRINKLER, 'crate') ? 'Right-click to remove' : 'Sprinkler']]),
    done: (s, f) => is(s, ...GAP_SPRINKLER, 'sprinkler') && f.waveEnds >= 1,
    hint: (s, f) => (is(s, ...GAP_SPRINKLER, 'crate') ? 'The Crate Stack is still there. Right-click it to remove it, then place the Sprinkler.'
      : tileHint(s, ...GAP_SPRINKLER, 'sprinkler', undefined, 'Sprinkler') || (is(s, ...GAP_SPRINKLER, 'sprinkler') ? openDoorsHint(s, f) : null)),
    solve: () => [remove(...GAP_SPRINKLER), place('sprinkler', ...GAP_SPRINKLER), { c: 'start' }],
  },
  {
    title: 'Slow them down: the Wet Floor Sign',
    tool: (s) => (is(s, ...GAP, 'wetfloor') ? 'sprinkler' : 'wetfloor'),
    // (One Sprinkler alone lets some of these ten through, whatever the seed: see the tests.)
    wave: [{ k: 'clipper', n: 10, gap: 0.1, at: 0 }],
    text: [
      'Do this: click Wet Floor (or press 5) and put it in the gap, put a second Sprinkler (press 2) on the highlighted tile beside the first, then press OPEN THE DOORS for ten Coupon Clippers.',
      'A Wet Floor Sign halves the speed of shoppers who walk over it, so they spend twice as long in the spray. It does not block the route, so it can sit right in the gap.',
    ],
    touch: [
      'Do this: drag Wet Floor from the bar into the gap and a second Sprinkler onto the highlighted tile beside the first, then tap OPEN THE DOORS for ten Coupon Clippers.',
      'A Wet Floor Sign halves the speed of shoppers who walk over it, so they spend twice as long in the spray. It does not block the route, so it can sit right in the gap.',
    ],
    quip: 'Wet Floor in the gap, a second Sprinkler beside the first, then open the doors. A yellow plastic sign is about to outperform you.',
    marks: (s) => wanted(s, [[...GAP, 'wetfloor', undefined, 'Wet Floor Sign'], [...SIDE_SPRINKLER, 'sprinkler', undefined, 'Sprinkler']]),
    done: (s, f) => is(s, ...GAP, 'wetfloor') && is(s, ...SIDE_SPRINKLER, 'sprinkler') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, ...GAP, 'wetfloor', undefined, 'Wet Floor Sign') || tileHint(s, ...SIDE_SPRINKLER, 'sprinkler', undefined, 'Sprinkler')
      || (is(s, ...GAP, 'wetfloor') && is(s, ...SIDE_SPRINKLER, 'sprinkler') ? openDoorsHint(s, f) : null),
    solve: () => [place('wetfloor', ...GAP), place('sprinkler', ...SIDE_SPRINKLER), { c: 'start' }],
  },
  {
    title: 'Make them stop: Free Samples',
    tool: 'samples',
    wave: [{ k: 'clipper', n: 16, gap: 0.2, at: 0 }],
    text: [
      'Do this: click Samples (or press 6) and put Free Samples on the highlighted tile, then press OPEN THE DOORS for a bigger crowd.',
      'Coupon Clippers within about 2 tiles of it stop for 2 seconds to eat, standing still in your sprinklers\' reach. Dads walk straight past.',
    ],
    touch: [
      'Do this: drag Samples from the bar onto the highlighted tile, then tap OPEN THE DOORS for a bigger crowd.',
      'Coupon Clippers within about 2 tiles of it stop for 2 seconds to eat, standing still in your sprinklers\' reach. Dads walk straight past.',
    ],
    quip: "Free Samples on the highlighted tile, then open the doors. Cheese on a stick: it's how I'd trap all of you.",
    marks: (s) => wanted(s, [[...SAMPLES, 'samples', undefined, 'Free Samples']]),
    done: (s, f) => is(s, ...SAMPLES, 'samples') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, ...SAMPLES, 'samples', undefined, 'Free Samples') || (is(s, ...SAMPLES, 'samples') ? openDoorsHint(s, f) : null),
    solve: () => [place('samples', ...SAMPLES), { c: 'start' }],
  },
  {
    title: 'Hold them up: the TV Salesman',
    tool: (s) => (is(s, ...SALESMAN, 'salesman') ? 'sprinkler' : 'salesman'),
    // (Without him the gap lets some of these through, whatever the seed: see the tests.)
    wave: [{ k: 'clipper', n: SALES_CROWD, gap: 0.1, at: 0 }],
    text: [
      `Do this: click Salesman (or press 7) and click the top-left one of the four highlighted tiles, put a Sprinkler (press 2) on the tile just above him, then press OPEN THE DOORS for ${SALES_CROWD} Coupon Clippers.`,
      'Shoppers who come near him may stop to watch his knife demonstration, standing in that Sprinkler\'s spray; now and then one hurries past instead. A crowd this big swamps your gap: the ones he holds up reach it later, a few at a time.',
    ],
    touch: [
      `Do this: drag Salesman from the bar onto the four highlighted tiles and Sprinkler onto the tile just above him, then tap OPEN THE DOORS for ${SALES_CROWD} Coupon Clippers.`,
      'Shoppers who come near him may stop to watch his knife demonstration, standing in that Sprinkler\'s spray; now and then one hurries past instead. A crowd this big swamps your gap: the ones he holds up reach it later, a few at a time.',
    ],
    quip: 'Salesman on the four highlighted tiles, a Sprinkler above him, then open the doors. Knives on TV: the only thing in this store sharper than you.',
    marks: (s) => [
      ...wantedBig(s, ...SALESMAN, 'salesman', undefined, 'TV Salesman'),
      ...wanted(s, [[...SALES_SPRINKLER, 'sprinkler', undefined, 'Sprinkler']]),
    ],
    done: (s, f) => is(s, ...SALESMAN, 'salesman') && is(s, ...SALES_SPRINKLER, 'sprinkler') && f.waveEnds >= 1,
    hint: (s, f) => bigHint(s, ...SALESMAN, 'salesman', undefined, 'TV Salesman')
      || tileHint(s, ...SALES_SPRINKLER, 'sprinkler', undefined, 'Sprinkler')
      || (is(s, ...SALESMAN, 'salesman') && is(s, ...SALES_SPRINKLER, 'sprinkler')
        ? watchHint('Watch the Coupon Clippers stop at his stand, in the spray.')(s, f) : null),
    solve: () => [place('salesman', ...SALESMAN), place('sprinkler', ...SALES_SPRINKLER), { c: 'start' }],
  },
  {
    title: 'Aim down the line: the Barcode Laser',
    tool: (s) => (is(s, ...LASER, 'railgun', S) ? 'sprinkler' : 'railgun'),
    // (Without it the layout lets some of these through, whatever the seed: see the tests.)
    wave: [{ k: 'clipper', n: LASER_CROWD, gap: 0.15, at: 0, sup: LASER_CROWD }],
    text: [
      `Do this: click Laser (or press 4), press R until the arrow on the preview points DOWN, and click the top one of the three highlighted tiles. Put a third Sprinkler (press 2) beside the Free Samples, then press OPEN THE DOORS for ${LASER_WORD} Extreme Couponers.`,
      'Its beam goes straight out of the end its arrow points to, 10 tiles, through everything, and hits every shopper on that line at once. It is slow to reload, so it wants a queue: everyone turns down this column on the way to the gap. Once built it only turns end for end, so turn it before you place it.',
      'Extreme Couponers are SUPER Coupon Clippers. Later in a real game every kind of shopper has a super version: bigger, marked in gold, far more patient, and it takes a double refund.',
    ],
    touch: [
      `Do this: tap Laser in the bar, tap the rotate button at the end of the bar until its arrow points DOWN, then tap the top one of the three highlighted tiles. Drag a third Sprinkler beside the Free Samples, then tap OPEN THE DOORS for ${LASER_WORD} Extreme Couponers.`,
      'Its beam goes straight out of the end its arrow points to, 10 tiles, through everything, and hits every shopper on that line at once. It is slow to reload, so it wants a queue: everyone turns down this column on the way to the gap. Once built it only turns end for end, so turn it before you place it.',
      'Extreme Couponers are SUPER Coupon Clippers. Later in a real game every kind of shopper has a super version: bigger, marked in gold, far more patient, and it takes a double refund.',
    ],
    quip: "Laser at the top of the column, arrow down, a Sprinkler by the samples, open the doors. Thirty Extreme Couponers in a queue, like your mum's on payday.",
    mood: 'smug',
    marks: (s) => [...wantedBig(s, ...LASER, 'railgun', S, 'Laser, arrow down'), ...wanted(s, [[...SUPER_SPRINKLER, 'sprinkler', undefined, 'Sprinkler']])],
    done: (s, f) => is(s, ...LASER, 'railgun', S) && is(s, ...SUPER_SPRINKLER, 'sprinkler') && f.waveEnds >= 1,
    hint: (s, f) => bigHint(s, ...LASER, 'railgun', S, 'Laser') || tileHint(s, ...SUPER_SPRINKLER, 'sprinkler', undefined, 'Sprinkler')
      || (is(s, ...LASER, 'railgun', S) && is(s, ...SUPER_SPRINKLER, 'sprinkler') ? watchHint('Watch the beam go down the queue.')(s, f) : null),
    solve: () => [place('railgun', ...LASER, S), place('sprinkler', ...SUPER_SPRINKLER), { c: 'start' }],
  },
  {
    title: 'Dads, and the Forklift Turret',
    tool: 'forklift',
    wave: DAD_WAVE,
    text: [
      `Do this: click Forklift (or press 3), click the highlighted tile, then press OPEN THE DOORS for ${DAD_COUNT} dads.`,
      'A dad wants to get through the line and go home. He walks fast, in single file, never stops for samples, and walks straight through your Crate Stacks and security: only the store\'s walls stop him, and Razor Wire, which part 3 shows you. His patience drains by itself every second he is inside.',
      'A Forklift Turret hits one shopper hard from 6 tiles away. This one covers the dads\' straight line across the store: it gets some of them, and the rest walk out with a refund and a smug review. The two at the back are Dads on a Mission, super dads.',
    ],
    touch: [
      `Do this: drag Forklift from the bar onto the highlighted tile, then tap OPEN THE DOORS for ${DAD_COUNT} dads.`,
      'A dad wants to get through the line and go home. He walks fast, in single file, never stops for samples, and walks straight through your Crate Stacks and security: only the store\'s walls stop him, and Razor Wire, which part 3 shows you. His patience drains by itself every second he is inside.',
      'A Forklift Turret hits one shopper hard from 6 tiles away. This one covers the dads\' straight line across the store: it gets some of them, and the rest walk out with a refund and a smug review. The two at the back are Dads on a Mission, super dads.',
    ],
    quip: "Forklift on the highlighted tile, then open the doors. Six dads, each told his wife 'two minutes'.",
    mood: 'smug',
    marks: (s) => wanted(s, [[...FORKLIFT, 'forklift', undefined, 'Forklift']]),
    done: (s, f) => is(s, ...FORKLIFT, 'forklift') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, ...FORKLIFT, 'forklift', undefined, 'Forklift')
      || (is(s, ...FORKLIFT, 'forklift') ? watchHint('Watch the dads walk straight through your buildings.')(s, f) : null),
    solve: () => [place('forklift', ...FORKLIFT), { c: 'start' }],
  },

  // ---- Part 2: The Back --------------------------------------------------------------------------
  {
    title: 'Downstairs: The Back',
    part2: true,
    view: 1,
    text: [
      'Do this: press Tab (or CHECK IN THE BACK, bottom right of the floor) to go down to The Back, the floor under the shop.',
      `It is the same grid as the shop: the walls go all the way down, and nothing here gets in a shopper's way. The yellow hatch is a Returns Drop: returned junk comes down it, a piece every ${JUNK_SECS} seconds, onto whatever in front of it will take it.`,
      'The dashed boxes are the Dumbwaiters under your security. Down here belts and machines turn junk into supplies and send them up. Tab takes you back up.',
    ],
    touch: [
      'Do this: tap CHECK IN THE BACK (bottom right of the floor) to go down to The Back, the floor under the shop.',
      `It is the same grid as the shop: the walls go all the way down, and nothing here gets in a shopper's way. The yellow hatch is a Returns Drop: returned junk comes down it, a piece every ${JUNK_SECS} seconds, onto whatever in front of it will take it.`,
      'The dashed boxes are the Dumbwaiters under your security. Down here belts and machines turn junk into supplies and send them up. The same button takes you back up.',
    ],
    quip: 'Down to The Back, where the junk goes.',
    marks: (s, f) => (f.floor === 1 ? [] : [{ x: DROP[0], y: DROP[1], f: 1, label: 'Returns Drop' }]),
    done: (s, f) => f.floor === 1,
    // (No hint: the Do this line says exactly what the hint would.)
    solve: () => [view(1)],
  },
  {
    title: 'Junk into a Spite Still',
    tool: (s) => (isB(s, ...STILL, 'still') ? 'conv' : 'still'),
    view: 1,
    text: [
      `Do this: click Spite Still (or press ${KEY('still')}), press R until its arrow points DOWN, and click the highlighted tile. Then click Belt (or press ${KEY('conv')}) and drag from the tile under the Returns Drop onto the Still.`,
      `A Spite Still boils a piece of junk down into a unit of Bottled Spite every ${MAKE_SECS} seconds. It takes junk at its back and sides and puts the Spite out of its front, the way its arrow points. A belt carries anything put on it, the way its arrow points.`,
    ],
    touch: [
      'Do this: tap Spite Still in the bar, tap the rotate button at the end of the bar until its arrow points DOWN, and tap the highlighted tile. Then tap Belt and drag your finger from the tile under the Returns Drop onto the Still.',
      `A Spite Still boils a piece of junk down into a unit of Bottled Spite every ${MAKE_SECS} seconds. It takes junk at its back and sides and puts the Spite out of its front, the way its arrow points. A belt carries anything put on it, the way its arrow points.`,
    ],
    quip: 'A Spite Still, arrow down, then a belt from the drop into it. Garbage in, spite out. Like your marriage.',
    marks: (s) => (s.back ? [...wantedB(s, [[...STILL, 'still', S, 'Spite Still, arrow down'], [...JUNK_BELT, 'conv', S, 'Belt']]), ...fixMarks(s, [DROP_PART])] : []),
    done: (s, f) => f.spite >= 1 || spiteSeen(s),
    hint: (s, f) => floorHint(f, 1) || backHint(s, ...STILL, 'still', S, 'Spite Still') || backHint(s, ...JUNK_BELT, 'conv', S, 'Belt')
      || fixHint(s, f, [DROP_PART])
      || (isB(s, ...STILL, 'still', S) && isB(s, ...JUNK_BELT, 'conv', S) ? 'Watch the junk go into the Still.' : null),
    solve: () => [view(1), placeB('still', ...STILL, S), placeB('conv', ...JUNK_BELT, S)],
  },
  {
    title: 'Spite up the Dumbwaiter',
    tool: (s) => (LINE.every(([x, y]) => isB(s, x, y, 'conv', S)) && !stockOf(s, GAP_SPRINKLER) ? fixTool(s, 'conv', lineTo(4), GAP_SHOP) : 'conv'),
    view: (s) => (stockOf(s, GAP_SPRINKLER) ? 0 : 1),
    text: [
      'Do this: click Belt and drag from the highlighted tile under the Still all the way down onto the gap Sprinkler\'s Dumbwaiter. When the Spite gets there, press Tab to go back up and look at the Sprinkler.',
      `Whatever a belt carries into a Dumbwaiter goes up to the building above. It keeps up to ${CAP} units of each supply it takes, and its pips light up in that supply's colour. Bottled Spite makes it hit harder: Store Brand takes a Sprinkler's hit from ${hit('sprinkler', 0)} to ${hit('sprinkler', 1)}.`,
    ],
    touch: [
      'Do this: tap Belt and drag your finger from the highlighted tile under the Still all the way down onto the gap Sprinkler\'s Dumbwaiter. When the Spite gets there, tap BACK TO THE FLOOR and look at the Sprinkler.',
      `Whatever a belt carries into a Dumbwaiter goes up to the building above. It keeps up to ${CAP} units of each supply it takes, and its pips light up in that supply's colour. Bottled Spite makes it hit harder: Store Brand takes a Sprinkler's hit from ${hit('sprinkler', 0)} to ${hit('sprinkler', 1)}.`,
    ],
    quip: 'Belt it all the way down to the gap Sprinkler, then go up and look.',
    marks: (s) => [
      ...wantedB(s, LINE.map(([x, y], n) => [x, y, 'conv', S, n === 0 ? 'From here' : n === LINE.length - 1 ? 'into the Sprinkler' : ''])),
      ...(stockOf(s, GAP_SPRINKLER) ? [] : fixMarks(s, lineTo(4), GAP_SHOP)),
    ],
    done: (s, f) => !!stockOf(s, GAP_SPRINKLER) && f.floor === 0,
    hint: (s, f) => {
      for (const [x, y] of LINE) { const h = backHint(s, x, y, 'conv', S, 'Belt'); if (h) return h; }
      if (!stockOf(s, GAP_SPRINKLER)) {
        const fix = fixHint(s, f, lineTo(4), GAP_SHOP);
        if (fix) return fix;
        if (f.floor !== 1) return floorHint(f, 1);
        return LINE.every(([x, y]) => isB(s, x, y, 'conv', S)) ? 'Watch the Spite ride down the line.' : null;
      }
      return floorHint(f, 0);
    },
    solve: () => [view(1), ...LINE.map(([x, y]) => placeB('conv', x, y, S)), view(0)],
  },
  {
    title: 'An Unpaid Intern',
    tool: (s) => (isB(s, ...INTERN, 'intern', W) ? fixTool(s, 'intern', lineTo(INTERN[1]), FORK_SHOP) : 'intern'),
    view: 1,
    text: [
      `Do this: press Tab, click Intern (or press ${KEY('intern')}), press R until his arrow points LEFT, and click the highlighted tile beside the line. He stocks the Forklift Turret from the same belt.`,
      `An Unpaid Intern takes off the belt behind him only what the tile in front of him wants, and hands it over; the rest rides on. One unit of Spite lasts the Forklift ${FORK_SHOTS} shots, and Store Brand takes its hit from ${hit('forklift', 0)} to ${hit('forklift', 1)}.`,
    ],
    touch: [
      'Do this: tap CHECK IN THE BACK, tap Intern in the bar, tap the rotate button at the end of the bar until his arrow points LEFT, and tap the highlighted tile beside the line. He stocks the Forklift Turret from the same belt.',
      `An Unpaid Intern takes off the belt behind him only what the tile in front of him wants, and hands it over; the rest rides on. One unit of Spite lasts the Forklift ${FORK_SHOTS} shots, and Store Brand takes its hit from ${hit('forklift', 0)} to ${hit('forklift', 1)}.`,
    ],
    quip: "An Unpaid Intern beside the line, facing the Forklift. He works for exposure. Like your OnlyFans.",
    mood: 'smug',
    marks: (s) => [...wantedB(s, [INTERN_PART]), ...(stockOf(s, FORKLIFT) ? [] : fixMarks(s, lineTo(INTERN[1]), FORK_SHOP))],
    done: (s) => !!stockOf(s, FORKLIFT),
    hint: (s, f) => (isB(s, ...INTERN, 'intern', W) && fixHint(s, f, lineTo(INTERN[1]), FORK_SHOP))
      || floorHint(f, 1) || backHint(s, ...INTERN, 'intern', W, 'Intern'),
    solve: () => [view(1), placeB('intern', ...INTERN, W)],
  },
  {
    title: 'Share a line: the Splitter',
    tool: (s) => (!isB(s, ...SPLITTER, 'split') ? 'split' : !isB(s, ...BRANCH, 'conv', S) || stockOf(s, SIDE_SPRINKLER) ? 'conv'
      : fixTool(s, 'conv', lineTo(SPLITTER[1] - 1), SIDE_SHOP)),
    view: 1,
    text: [
      `Do this: right-click the highlighted belt above the gap Sprinkler to take it out, put a Splitter there (press ${KEY('split')}) with its arrow DOWN, then lay one belt from the tile left of it down into the second Sprinkler.`,
      'A Splitter deals what comes in behind it to its front, left and right in turn, skipping a way that is full: one line now stocks both Sprinklers.',
      `Two more parts for later. An Overpass (press ${KEY('over')}) lets two lines cross without mixing. A Clearance Bin (press ${KEY('bin')}) takes anything from any side and pays pennies for supplies: end a line that carries leftovers in one, so nothing nobody wants blocks it.`,
    ],
    touch: [
      'Do this: tap Remove in the bar, then tap the highlighted belt above the gap Sprinkler, to take it out. Put a Splitter there with its arrow DOWN, then tap Belt and drag one belt from the tile left of it down into the second Sprinkler.',
      'A Splitter deals what comes in behind it to its front, left and right in turn, skipping a way that is full: one line now stocks both Sprinklers.',
      'Two more parts for later. An Overpass lets two lines cross without mixing. A Clearance Bin takes anything from any side and pays pennies for supplies: end a line that carries leftovers in one, so nothing nobody wants blocks it.',
    ],
    quip: 'Swap that belt for a Splitter, arrow down, and run a belt to the second Sprinkler.',
    marks: (s) => [
      ...wantedB(s, [[...SPLITTER, 'split', S, 'Splitter, arrow down'], [...BRANCH, 'conv', S, 'Belt']]),
      ...(stockOf(s, SIDE_SPRINKLER) ? [] : fixMarks(s, lineTo(SPLITTER[1] - 1), SIDE_SHOP)),
    ],
    done: (s) => isB(s, ...SPLITTER, 'split', S) && !!stockOf(s, SIDE_SPRINKLER),
    hint: (s, f) => (isB(s, ...SPLITTER, 'split', S) && isB(s, ...BRANCH, 'conv', S) && !stockOf(s, SIDE_SPRINKLER) && fixHint(s, f, lineTo(SPLITTER[1] - 1), SIDE_SHOP))
      || floorHint(f, 1)
      || (isB(s, ...SPLITTER, 'conv') ? 'The belt is still there. Right-click the highlighted belt to take it out, then put the Splitter in its place.' : null)
      || backHint(s, ...SPLITTER, 'split', S, 'Splitter') || backHint(s, ...BRANCH, 'conv', S, 'Belt'),
    solve: () => [view(1), removeB(...SPLITTER), placeB('split', ...SPLITTER, S), placeB('conv', ...BRANCH, S)],
  },
  {
    title: 'Running dry',
    wave: DRY_WAVE,
    view: (s) => (forkStarved(s) ? 0 : 1),
    text: [
      `Do this: right-click the highlighted belt (the one the Intern takes from) to take it out, press Tab to go back up, and press OPEN THE DOORS for ${DRY_CROWD} Coupon Clippers, one a second. Watch the Forklift Turret (5x at the top speeds it up).`,
      `Every shot uses up stock. A unit of Spite lasts the Forklift ${FORK_SHOTS} shots and it holds ${CAP}, about a minute of shooting. With its belt gone nothing replaces them, and when the last is used a red OUT OF SPITE pops up over it: it is back to its plain self until more comes up. Kept fed, a building refills between shoppers.`,
    ],
    touch: [
      `Do this: tap Remove in the bar, then tap the highlighted belt (the one the Intern takes from), to take it out. Tap BACK TO THE FLOOR and tap OPEN THE DOORS for ${DRY_CROWD} Coupon Clippers, one a second. Watch the Forklift Turret (5x at the top speeds it up).`,
      `Every shot uses up stock. A unit of Spite lasts the Forklift ${FORK_SHOTS} shots and it holds ${CAP}, about a minute of shooting. With its belt gone nothing replaces them, and when the last is used a red OUT OF SPITE pops up over it: it is back to its plain self until more comes up. Kept fed, a building refills between shoppers.`,
    ],
    quip: 'Cut the Intern\'s belt, go up, open the doors and watch the Forklift run dry. Performance anxiety: you know it well.',
    mood: 'smug',
    // (Taking out the Intern instead of his belt starves the Forklift too: it counts, and the
    // Rebrander lesson marks him to be put back. A Forklift sold and bought again is empty, with
    // nothing to run out of: the line to it is marked to be put back until it holds some Spite.)
    marks: (s, f) => {
      if (!is(s, ...FORKLIFT, 'forklift')) return wanted(s, FORK_SHOP);
      if (forkRanDry(s, f)) return [];
      if (!stockOf(s, FORKLIFT)) return fixMarks(s, [...lineTo(CUT[1]), INTERN_PART]);
      return forkStarved(s) ? [] : [{ x: CUT[0], y: CUT[1], f: 1, label: 'Take this out', del: true }];
    },
    done: (s, f) => forkRanDry(s, f) && f.waveEnds >= 1,
    hint: (s, f) => {
      if (!is(s, ...FORKLIFT, 'forklift')) return fixHint(s, f, [], FORK_SHOP);
      const dry = forkRanDry(s, f);
      if (!dry && !stockOf(s, FORKLIFT)) {
        return fixHint(s, f, [...lineTo(CUT[1]), INTERN_PART])
          || 'The Forklift is empty, so it has nothing to run out of yet. Wait for Spite to come up and fill it.';
      }
      if (f.waveEnds && !dry) return forkStarved(s) ? 'Nothing ran dry that time. Press OPEN THE DOORS again.' : 'Nothing ran dry: the Forklift was still fed. Right-click the highlighted belt to take it out.';
      if (!forkStarved(s)) return floorHint(f, 1) || 'Right-click the highlighted belt to take it out.';
      return floorHint(f, 0) || watchHint('Watch for OUT OF SPITE over the Forklift.')(s, f);
    },
    solve: () => [view(1), removeB(...CUT), view(0), { c: 'start' }],
  },
  {
    title: 'A better label: the Rebrander',
    tool: (s) => (!isB(s, ...REBRANDER, 'rebrand', S) ? 'rebrand' : !isB(s, ...CUT, 'conv', S) ? 'conv' : fixTool(s, 'conv', REBRAND_NEEDS, FORK_SHOP)),
    // (Only if the Forklift has filled up with Store Brand again: once it fires some, Name Brand goes up.)
    wave: DRY_WAVE,
    view: (s) => (isB(s, ...REBRANDER, 'rebrand', S) && isB(s, ...CUT, 'conv', S) ? 0 : 1),
    doors: (s) => forkFull(s) && !forkBranded(s),
    text: [
      `Do this: press Tab, right-click the highlighted belt above the gap to take it out, put a Rebrander there (press ${KEY('rebrand')}) with its arrow DOWN, and lay the belt back in the gap. Then go up and watch the Forklift fill up again.`,
      `A Rebrander puts a better label on any supply that goes through it, one brand up a pass: Store Brand, Name Brand, Premium, Platinum. Each pass is slower (${REBRAND_SECS.join(', ')} seconds a unit). Name Brand Spite takes the Forklift's hit to ${hit('forklift', 2)} (Store Brand: ${hit('forklift', 1)}), and the ring round its pip turns bronze; silver and gold are the next two.`,
    ],
    touch: [
      'Do this: tap CHECK IN THE BACK, tap Remove in the bar, then tap the highlighted belt above the gap, to take it out. Put a Rebrander there with its arrow DOWN, and drag a belt back into the gap. Then go up and watch the Forklift fill up again.',
      `A Rebrander puts a better label on any supply that goes through it, one brand up a pass: Store Brand, Name Brand, Premium, Platinum. Each pass is slower (${REBRAND_SECS.join(', ')} seconds a unit). Name Brand Spite takes the Forklift's hit to ${hit('forklift', 2)} (Store Brand: ${hit('forklift', 1)}), and the ring round its pip turns bronze; silver and gold are the next two.`,
    ],
    quip: 'A Rebrander in the line, arrow down, and the belt back. Same junk, fancier label, higher price. Your dating profile.',
    mood: 'smug',
    // (Besides its own two tiles it needs the line above it, the Intern and the Forklift: whatever an
    // earlier lesson put there and is gone now, the player above all may have taken out the Intern
    // in Running dry instead of his belt, is marked to be put back.)
    marks: (s) => [...wantedB(s, [[...REBRANDER, 'rebrand', S, 'Rebrander, arrow down'], [...CUT, 'conv', S, 'Belt']]), ...fixMarks(s, REBRAND_NEEDS, FORK_SHOP)],
    done: (s) => forkBranded(s),
    hint: (s, f) => {
      if (isB(s, ...REBRANDER, 'conv')) return floorHint(f, 1) || 'The belt is still there. Right-click the highlighted belt to take it out, then put the Rebrander in its place.';
      if (!isB(s, ...REBRANDER, 'rebrand', S)) return floorHint(f, 1) || backHint(s, ...REBRANDER, 'rebrand', S, 'Rebrander');
      if (!isB(s, ...CUT, 'conv', S)) return floorHint(f, 1) || backHint(s, ...CUT, 'conv', S, 'Belt') || 'Lay a belt back in the gap, down into the line.';
      const fix = fixHint(s, f, REBRAND_NEEDS, FORK_SHOP);
      if (fix) return fix;
      if (forkFull(s)) return 'The Forklift filled up with Store Brand. Press OPEN THE DOORS: once it has fired some, Name Brand goes up.';
      return floorHint(f, 0) || 'Name Brand is on its way up. Watch the Forklift\'s pip.';
    },
    solve: () => [view(1), removeB(...REBRANDER), placeB('rebrand', ...REBRANDER, S), placeB('conv', ...CUT, S), view(0)],
  },

  // ---- Part 3: dads, gym bros, money --------------------------------------------------------------
  {
    title: 'Razor Wire: pick a direction',
    tool: 'wire',
    view: 0,
    text: [
      'Do this: click Wire in the bar (or press Z), then click the Forklift Turret once. Its wire now points north, up the screen.',
      `A building with a wire direction covers its own tiles and the ${BACK.wireReach} beyond it that way, and while it holds Razor Wire no dad can step on them. This one has none yet, so its wire is only planned (dashed), and the floor shows two routes: DADS, where they walk now, and DADS, IF WIRED, where they would walk with it.`,
      'Click again to turn it round; a direction that would wall the dads in is skipped.',
    ],
    touch: [
      'Do this: tap Wire in the bar, then tap the Forklift Turret once. Its wire now points north, up the screen.',
      `A building with a wire direction covers its own tiles and the ${BACK.wireReach} beyond it that way, and while it holds Razor Wire no dad can step on them. This one has none yet, so its wire is only planned (dashed), and the floor shows two routes: DADS, where they walk now, and DADS, IF WIRED, where they would walk with it.`,
      'Tap again to turn it round; a direction that would wall the dads in is skipped.',
    ],
    quip: 'The Wire tool on the Forklift, once: its wire points north.',
    marks: (s) => {
      if (!is(s, ...FORKLIFT, 'forklift')) return wanted(s, [[...FORKLIFT, 'forklift', undefined, 'Forklift']]);
      return forklift(s).wd === WIRE_DIR ? [] : [{ x: FORKLIFT[0], y: FORKLIFT[1], k: 'forklift', wd: WIRE_DIR, label: 'Wire it north' }];
    },
    done: (s) => is(s, ...FORKLIFT, 'forklift') && forklift(s).wd === WIRE_DIR,
    hint: (s, f) => floorHint(f, 0) || tileHint(s, ...FORKLIFT, 'forklift', undefined, 'Forklift')
      || (is(s, ...FORKLIFT, 'forklift') && forklift(s).wd !== undefined ? `Its wire points ${['east', 'south', 'west', 'north'][forklift(s).wd]}. Click it again until it points north.` : null),
    solve: () => [view(0), { c: 'wire', x: FORKLIFT[0], y: FORKLIFT[1], d: WIRE_DIR }],
  },
  {
    title: 'Razor Wire: the Barb Bender',
    tool: (s) => (!isB(s, ...BENDER, 'bender', E) ? 'bender' : !is(s, ...FORKLIFT, 'forklift') ? 'forklift' : wireWrong(s) ? 'wire' : 'bender'),
    wave: DAD_WAVE,
    view: (s) => (isB(s, ...BENDER, 'bender', E) ? 0 : 1),
    text: [
      `Do this: press Tab, click Bender (or press ${KEY('bender')}), press R until its arrow points RIGHT, and click the highlighted tile between the second Returns Drop and the Forklift's Dumbwaiter. Then go back up and press OPEN THE DOORS for ${DAD_COUNT} dads.`,
      `With Razor Wire in it the Forklift's wire is live. A dad walks into it, is turned away and goes round, under the Forklift's fire. Each dad turned away uses one: a unit of Store Brand turns away ${WIRE_TURNS}, Platinum many more. When it runs out the wire is only planned again, and dads walk straight through.`,
    ],
    touch: [
      `Do this: tap CHECK IN THE BACK, tap Bender in the bar, tap the rotate button at the end of the bar until its arrow points RIGHT, and tap the highlighted tile between the second Returns Drop and the Forklift's Dumbwaiter. Then go back up and tap OPEN THE DOORS for ${DAD_COUNT} dads.`,
      `With Razor Wire in it the Forklift's wire is live. A dad walks into it, is turned away and goes round, under the Forklift's fire. Each dad turned away uses one: a unit of Store Brand turns away ${WIRE_TURNS}, Platinum many more. When it runs out the wire is only planned again, and dads walk straight through.`,
    ],
    quip: "A Barb Bender, arrow right, then open the doors. Razor wire for dads: it's like a vasectomy for their schedule.",
    mood: 'smug',
    // (A building with no wire direction takes no Razor Wire, and one more click with the Wire tool
    // after north clears it; a Forklift sold and bought again has none. Either way the last lesson's
    // wire mark comes back, as does anything else it relies on that has gone.)
    marks: (s) => {
      const out = [...wantedB(s, [[...BENDER, 'bender', E, 'Barb Bender, arrow right']]), ...fixMarks(s, [WIRE_DROP_PART], FORK_SHOP)];
      if (wireWrong(s)) out.push({ x: FORKLIFT[0], y: FORKLIFT[1], k: 'forklift', wd: WIRE_DIR, label: 'Wire it north' });
      return out;
    },
    done: (s, f) => !!forklift(s) && wireLive(forklift(s)) && f.waveEnds >= 1 && f.turned >= 1,
    hint: (s, f) => {
      if (!isB(s, ...BENDER, 'bender', E)) return floorHint(f, 1) || backHint(s, ...BENDER, 'bender', E, 'Barb Bender');
      const fix = fixHint(s, f, [WIRE_DROP_PART], FORK_SHOP);
      if (fix) return fix;
      if (wireWrong(s)) {
        const wd = forklift(s).wd;
        return floorHint(f, 0) || (wd === undefined
          ? 'The Forklift has no wire direction any more, so it takes no Razor Wire. Click Wire in the bar (or press Z), then click the Forklift until its wire points north.'
          : `The Forklift's wire points ${COMPASS[wd]}. Click Wire in the bar (or press Z), then click the Forklift until its wire points north.`);
      }
      if (!forklift(s) || !wireLive(forklift(s))) return 'Wait for the Razor Wire to reach the Forklift.';
      if (f.waveEnds && !f.turned) return 'No dad walked into the wire. Press OPEN THE DOORS again.';
      return floorHint(f, 0) || watchHint('Watch the dads walk into the wire and turn away.')(s, f);
    },
    solve: () => [view(1), placeB('bender', ...BENDER, E), view(0), { c: 'start' }],
  },
  {
    title: 'Gym Bros',
    tool: (s, f) => (f.waveEnds && s.rubble.length ? 'rebuild' : 'crate'),
    view: 0,
    wave: [{ k: 'gymbro', n: 1, gap: 1, at: 0 }],
    text: [
      'Do this: put Crates (press 1) on the three highlighted tiles by the entrance, then OPEN THE DOORS for one Gym Bro. He walks straight through crates instead of round them.',
      'Do this: when he has gone, press B (or the Rebuild button in the build bar) to put back what he wrecked, for half of what you paid for it.',
      `He smashes any Crate Stack in his way, and now and then something else he passes. He has only ${HITS_WORD} hits in him a visit and needs ${TUNE.smashWait} seconds to get his breath back after each; while he rests he walks round like anyone else. The money for a rebuild goes the moment you press, and the building goes back when nothing is in the way.`,
    ],
    touch: [
      'Do this: drag Crates from the bar onto the three highlighted tiles by the entrance, then tap OPEN THE DOORS for one Gym Bro. He walks straight through crates instead of round them.',
      'Do this: when he has gone, tap the Rebuild button in the bar to put back what he wrecked, for half of what you paid for it.',
      `He smashes any Crate Stack in his way, and now and then something else he passes. He has only ${HITS_WORD} hits in him a visit and needs ${TUNE.smashWait} seconds to get his breath back after each; while he rests he walks round like anyone else. The money for a rebuild goes the moment you tap, and the building goes back when nothing is in the way.`,
    ],
    quip: 'Crates by the entrance, open the doors, then press Rebuild for whatever he smashes.',
    mood: 'angry',
    marks: (s) => {
      if (s.phase === 'wave') return [];
      // The tiles are next to each other, so only the first of each gets a caption.
      const out = s.rubble.map(({ i }, n) => ({ x: i % s.w, y: (i / s.w) | 0, label: n ? '' : 'Wrecked', fix: 'rebuild' }));
      const wrecks = out.length;
      for (const [x, y] of DOOR_CRATES) {
        if (!is(s, x, y, 'crate') && !out.some((m) => m.x === x && m.y === y)) out.push({ x, y, label: out.length > wrecks ? '' : 'Crates', k: 'crate' });
      }
      return out;
    },
    done: (s, f) => f.waveEnds >= 1 && f.smashedCrate >= 1 && !s.rubble.length && DOOR_CRATES.every(([x, y]) => is(s, x, y, 'crate')),
    hint: (s, f) => {
      if (f.floor !== 0) return floorHint(f, 0);
      if (s.phase === 'wave') return 'Watch him smash through the crates, then get his breath back.';
      if (f.waveEnds && s.rubble.length) return 'Press B (or the Rebuild button in the build bar) to put back what he wrecked.';
      for (const [x, y] of DOOR_CRATES) { const h = tileHint(s, x, y, 'crate', undefined, 'Crate'); if (h) return h; }
      if (!DOOR_CRATES.every(([x, y]) => is(s, x, y, 'crate'))) return f.waveEnds ? 'Put Crates on the highlighted tiles (press 1).' : null;
      if (f.waveEnds && !f.smashedCrate) return 'He never reached a crate. Press OPEN THE DOORS to send him in again.';
      return f.waveEnds ? null : 'Now press OPEN THE DOORS at the top of the screen.';
    },
    solve: () => [view(0), ...DOOR_CRATES.map(([x, y]) => place('crate', x, y)), { c: 'start' }],
    after: () => [{ c: 'rebuild' }],
  },
  {
    title: 'Reinforce the crates',
    tool: (s, f) => (f.waveEnds && s.rubble.length ? 'rebuild' : 'reinforce'),
    view: 0,
    wave: [{ k: 'gymbro', n: 1, gap: 1, at: 0 }],
    text: [
      'Do this: click Reinforce in the bar (or press U), click each of the three crates by the entrance once, then press OPEN THE DOORS for another Gym Bro.',
      `Each level is one more gym bro hit a Crate Stack takes in a sales event, up to ${REINFORCE_MAX} levels (${REINFORCE_FIRST} for the first, more for each after). Security soaks up hits with Duct Tape from The Back instead: each roll it holds takes ${TAPE_HITS === 1 ? 'a hit' : `${TAPE_HITS} hits`} for it at Store Brand, more at the better brands.`,
    ],
    touch: [
      'Do this: tap Reinforce in the bar, tap each of the three crates by the entrance once, then tap OPEN THE DOORS for another Gym Bro.',
      `Each level is one more gym bro hit a Crate Stack takes in a sales event, up to ${REINFORCE_MAX} levels (${REINFORCE_FIRST} for the first, more for each after). Security soaks up hits with Duct Tape from The Back instead: each roll it holds takes ${TAPE_HITS === 1 ? 'a hit' : `${TAPE_HITS} hits`} for it at Store Brand, more at the better brands.`,
    ],
    quip: 'Reinforce the three crates by the door, then let the next meathead in.',
    mood: 'smug',
    marks: (s) => {
      if (s.phase === 'wave') return [];
      const out = s.rubble.map(({ i }, n) => ({ x: i % s.w, y: (i / s.w) | 0, label: n ? '' : 'Wrecked', fix: 'rebuild' }));
      for (const [x, y] of DOOR_CRATES) {
        if (out.some((m) => m.x === x && m.y === y)) continue;
        if (!is(s, x, y, 'crate')) out.push({ x, y, label: '', k: 'crate' });
        else if ((at(s, x, y).r | 0) < 1) out.push({ x, y, label: out.length ? '' : 'Reinforce', k: 'crate', r: 1 });
      }
      return out;
    },
    done: (s, f) => f.waveEnds >= 1 && doorCratesDone(s) && !s.rubble.length,
    hint: (s, f) => {
      if (f.floor !== 0) return floorHint(f, 0);
      if (s.phase === 'wave') return 'Watch him hit a reinforced crate, and the crate hold.';
      if (s.rubble.length) return 'Press B (or the Rebuild button in the build bar) to put back what he wrecked.';
      if (!doorCratesDone(s)) return 'Click each highlighted crate once with Reinforce (press U).';
      return f.waveEnds ? null : 'Now press OPEN THE DOORS at the top of the screen.';
    },
    solve: () => [view(0), ...DOOR_CRATES.map(([x, y]) => ({ c: 'reinforce', x, y })), { c: 'start' }],
    after: () => [{ c: 'rebuild' }],
  },
  {
    title: 'Money, and MORE JUNK',
    view: 1,
    text: [
      'Do this: press Tab, click the first Returns Drop (with nothing held), and press MORE JUNK on its card.',
      'Your money comes from beating sales events: each one pays its event pay (shared evenly when you play with friends), plus a speed bonus for clearing the floor fast once the last shopper is in (the EVENT PAY panel shows it draining). Boss bounties and the Clearance Bin\'s pennies come on top. Refunds come out of it.',
      `It buys buildings on both floors, and MORE JUNK: a Returns Drop that puts out junk faster, for good (${MORE_JUNK} for the first level). More junk is more supplies.`,
    ],
    touch: [
      'Do this: tap CHECK IN THE BACK, tap the first Returns Drop with nothing picked, and tap MORE JUNK on its card.',
      'Your money comes from beating sales events: each one pays its event pay (shared evenly when you play with friends), plus a speed bonus for clearing the floor fast once the last shopper is in (the EVENT PAY panel shows it draining). Boss bounties and the Clearance Bin\'s pennies come on top. Refunds come out of it.',
      `It buys buildings on both floors, and MORE JUNK: a Returns Drop that puts out junk faster, for good (${MORE_JUNK} for the first level). More junk is more supplies.`,
    ],
    quip: 'Down to the Returns Drop and buy MORE JUNK. Spending money on garbage: finally, something you have experience in.',
    mood: 'smug',
    marks: (s) => ((dropAt(s) && dropAt(s).lv >= 1) ? [] : [{ x: DROP[0], y: DROP[1], f: 1, label: 'Returns Drop', act: 'more' }]),
    done: (s) => !!s.back && s.back.some((p) => p && p.k === 'drop' && p.lv >= 1),
    hint: (s, f) => floorHint(f, 1) || 'Click the Returns Drop with nothing held, then MORE JUNK on its card.',
    solve: () => [view(1), { c: 'dropUp', x: DROP[0], y: DROP[1] }],
  },
  {
    title: 'Training complete',
    manual: true,
    last: true,
    text: [
      'Do this: press Play a real game when you are ready, or stay and practise as long as you like.',
      'A real game is 20 sales events with a short build break between them, in a bigger store with a Returns Drop or more per player. Cash is limited, each player has his own, refunds are split, and the shoppers get more patient every event.',
      'There are many more kinds of shopper than these three. The Employee Handbook lists them all, with every building, part, supply and brand: press ? at the top right, then 📖 Employee Handbook.',
      'Move the view with W, A, S and D, zoom with the mouse wheel, press F to see the whole floor and H to go back to your entrance. P pauses; 1x to 5x set the speed.',
    ],
    touch: [
      'Do this: tap Play a real game when you are ready, or stay and practise as long as you like.',
      'A real game is 20 sales events with a short build break between them, in a bigger store with a Returns Drop or more per player. Cash is limited, each player has his own, refunds are split, and the shoppers get more patient every event.',
      'There are many more kinds of shopper than these three. The Employee Handbook lists them all, with every building, part, supply and brand: tap ? at the top right (under ☰ on a phone), then 📖 Employee Handbook.',
      'Drag the floor with nothing picked to move the view, pinch to zoom, tap MAP to see the whole floor and HOME to go back to your entrance. The pause button and 1x to 5x are beside the clock (under ☰ on a phone).',
    ],
    quip: "Training complete. Press Play a real game when you're ready. You've met the minimum standard. Briefly, and from below.",
    mood: 'smug',
    done: () => false,
    solve: () => [],
  },
];

/** Where part 2, The Back, starts. */
export const PART_TWO = STEPS.findIndex((st) => st.part2);

const freshFacts = () => ({
  floor: 0, nopes: {}, waveStarts: 0, waveEnds: 0,
  slip: 0, watched: 0, beam: 0, smashed: 0, smashedCrate: 0, rebuilt: 0,
  made: 0, spite: 0, stocked: 0, outs: [], turned: 0,
});
/** Simulation events that are simply counted into the facts of the same name. */
const COUNTED = new Set(['slip', 'stocked']);

/**
 * Runs the training shift on a host session whose game was created with { training: true }.
 * @param {Object} session a HostSession
 * @param {Object} [o]
 * @param {() => void} [o.onChange] called whenever the step changes
 * @param {() => number} [o.floor] the floor the player is looking at (0 the shop, 1 The Back; it
 *   is not in the game's state). Left out (tests), the floor the `view` commands last chose.
 * @param {(f: number) => void} [o.setFloor] looks at a floor, for Skip and ?step= jumps
 */
export function createTutorial(session, { onChange = () => {}, floor = null, setFloor = null } = {}) {
  let index = -1;
  let facts = freshFacts();
  /** Result of the most recent wave, shown at the top of the next step. */
  let lastWave = null;
  let looking = 0; // the floor the `view` commands chose (when nobody tells us)
  const floorNow = () => (floor ? (floor() ? 1 : 0) : looking);
  // (The training game has no map, so no Returns Drops: the lessons on The Back put down their own,
  // before anything is drawn.)
  if (session.state) addTrainingDrops(session.state, TRAINING_DROPS);
  /** The facts, with the floor as it is now. */
  const now = () => { facts.floor = floorNow(); return facts; };

  const offFx = session.on('fx', (events) => {
    for (const e of events) {
      if (COUNTED.has(e.e)) facts[e.e]++;
      if (e.e === 'watching') facts.watched++;
      if (e.e === 'rail') facts.beam = Math.max(facts.beam, e.n);
      if (e.e === 'smash') { facts.smashed++; if (e.k === 'crate') facts.smashedCrate++; }
      if (e.e === 'rebuilt') facts.rebuilt += e.n;
      if (e.e === 'made') { facts.made++; if (itemType(e.c) === 1) facts.spite++; }
      if (e.e === 'stockOut') facts.outs.push(`${e.i}:${e.t}`);
      if (e.e === 'turned' && !e.free) facts.turned++;
      if (e.e === 'waveStart') facts.waveStarts++;
      if (e.e === 'waveEnd') {
        facts.waveEnds++;
        lastWave = { stopped: session.state.ws.stopped, escaped: session.state.ws.escaped };
        // The doors were opened before the lesson was ready (or the shoppers did not show what
        // the lesson is about): line the same shoppers up again so the player can have another go.
        const st = STEPS[index];
        if (st && st.wave && !st.done(session.state, now()) && !(st.after && session.state.rubble.length)) {
          queueTrainingWave(session.state, st.wave);
        }
      }
    }
  });
  const offNope = session.on('nope', (m) => { facts.nopes[m.why] = (facts.nopes[m.why] || 0) + 1; });

  function enter(i, quiet = false) {
    index = Math.max(0, Math.min(STEPS.length - 1, i));
    facts = freshFacts();
    facts.nopes.blocked = 0;
    const st = STEPS[index];
    const s = session.state;
    setTrainingCash(s, Math.max(s.players[0].cash, 1500)); // money is free in training
    // Only this lesson's shoppers are waiting outside (none, if it has no wave).
    queueTrainingWave(s, st.wave || null);
    if (st.quip && !quiet) session.emit('say', { t: 'say', who: 'DEB (HR)', mood: st.mood || 'flat', text: st.quip });
    onChange();
  }

  /**
   * Carries out one of a lesson's solve() commands: a game command goes to the session; the
   * training shift's own { c: 'view', f } looks at that floor. Returns the session's answer.
   */
  function act(cmd) {
    if (cmd && cmd.c === 'view') {
      looking = cmd.f ? 1 : 0;
      if (setFloor) setFloor(looking);
      return { ok: true };
    }
    return session.send(cmd);
  }

  /**
   * Sends a command for autoplay. A refusal normally reaches the facts as a 'nope' message; when
   * the screen has kept those quiet (jumping ahead from the panel), it is counted from the answer.
   */
  function sendCounted(cmd) {
    const before = Object.values(facts.nopes).reduce((a, b) => a + b, 0);
    const r = act(cmd);
    if (r && r.ok === false && Object.values(facts.nopes).reduce((a, b) => a + b, 0) === before) {
      facts.nopes[r.why] = (facts.nopes[r.why] || 0) + 1;
    }
  }

  /** Sends a step's `after` commands once its wave is over, a single time. */
  function finish(st, sent) {
    if (!sent && st.after && facts.waveEnds && session.state.phase === 'build') {
      for (const cmd of st.after(session.state)) act(cmd);
      return true;
    }
    return sent;
  }

  const api = {
    get index() { return index; },
    get total() { return STEPS.length; },
    get step() { return STEPS[index]; },
    get lastWave() { return lastWave; },
    /** What has happened during the current step (see the list at the top of this file). */
    get facts() { return now(); },
    /** The floor the player is looking at, as the lessons see it. */
    get floor() { return floorNow(); },
    /** The build-bar button the current step points at, or null. */
    tool() {
      const st = STEPS[index];
      if (!st || !st.tool) return null;
      return typeof st.tool === 'function' ? st.tool(session.state, now()) : st.tool;
    },
    /** True once the current step's task is done (never for explanation-only steps). */
    check() {
      const st = STEPS[index];
      return !!st && !st.manual && st.done(session.state, now());
    },
    /** Every tile the step marks, on both floors (each with f: 1 if it is in The Back). */
    marks() {
      const st = STEPS[index];
      return st && st.marks ? st.marks(session.state, now()) : [];
    },
    hint() {
      const st = STEPS[index];
      return (st && st.hint && st.hint(session.state, now())) || null;
    },
    /** Carries out one command the way the lessons' solve() lists them (see act). */
    act,
    start() { enter(0); },
    next() { if (index < STEPS.length - 1) enter(index + 1); },
    back() { if (index > 0) enter(index - 1); },
    /** Does the current step for the player, then moves on. Waves are not waited for. */
    skip() {
      const st = STEPS[index];
      for (const cmd of st.solve(session.state)) if (cmd.c !== 'start') act(cmd);
      api.next();
    },
    /**
     * Plays the tutorial by itself up to (not including) step `target`, running the game forward
     * as needed. For tests and for jumping to a step when taking screenshots.
     * @returns {number[]} indexes of steps that could not be completed (empty when all is well)
     */
    autoplay(target = STEPS.length - 1) {
      const stuck = [];
      if (index < 0) enter(0, index + 1 < target);
      while (index < target) {
        const st = STEPS[index];
        for (const cmd of st.solve(session.state)) sendCounted(cmd);
        if (!st.manual) {
          let sent = false;
          for (let n = 0; n < 240 && !st.done(session.state, now()); n++) { // up to 2 minutes
            sent = finish(st, sent);
            session.fastForward(15);
          }
          finish(st, sent);
          if (!st.done(session.state, now())) stuck.push(index);
        }
        // Only the lesson it stops at gets DEB's line: the others are history.
        enter(index + 1, index + 1 < target);
      }
      return stuck;
    },
    /**
     * For tests: runs the current step's `after` commands if its wave is over and they have not
     * been sent yet. Call it between fast-forwards. Returns true once they have been sent.
     */
    finish(sent = false) { return finish(STEPS[index], sent); },
    destroy() { offFx(); offNope(); },
  };
  return api;
}

