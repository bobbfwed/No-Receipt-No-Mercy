// The training shift: a guided, hands-on walk through every building. No DOM here, so a test can
// play the whole tutorial from Node and prove that each step can be completed.
//
// Each step has:
//   title, text   what the panel shows (plain instructions; `text` is a list of paragraphs). The
//                 first paragraph is the "Do this:" line: what to press, then why (0.3.03: a player
//                 who reads only that must know what to do)
//   touch         the same paragraphs for a touch screen, where they differ (a building is dragged
//                 from the bar onto its tile); without it, `text` goes through content/touch.js
//   quip, mood    what DEB says in her speech bubble when the step starts: what to do, and at most
//                 one short joke after it (none in a lesson that teaches a control for the first time)
//   tool          the build-bar button to highlight, if any
//   marks(s, f)   tiles to highlight on the floor that still need attention; each says what it wants
//                 there (k, d, fix), which the training arrow follows (src/tutorial/target.js)
//   wave          shoppers lined up for when the player opens the doors (see waveSpec in the sim)
//   done(s, f)    true once the player has done what was asked (f = facts gathered this step)
//   hint(s, f)    a one-line nudge for where the player is right now, or null
//   solve(s)      the commands that complete the step (used by tests, Skip, and ?step= jumps)
//   after(s)      commands that finish the step once its wave is over (tests and jumps send them)
//   manual        the step is only an explanation; it ends when the player presses Next
//   part2         the first step of part 2, "The difficult customers" (the panel can jump to it)
// `tool` may also be a function (s, f) => tool, for a step whose second half needs another button.
//
// What the shift covers (0.3.03, the owner's request: "only a few different shoppers, just to show
// that there's variation ... it should show all buildings"): every building on the shop floor is
// placed by the player at least once, and the Rebuild and Remove tools are each used; the only
// shoppers sent in are Coupon Clippers (super ones in the super shopper and Barcode Laser lessons),
// Dads (Dads on a Mission among them) and a Gym Bro. test/tutorial.test.js holds it to both.
// (0.4: the shop floor's factory is gone, and with it the lessons on its machines. The maze is now
// Crate Stacks and security, and dads walk round walls like everyone else, so the Barcode Laser
// moved to the end of part 1, aimed down the queue of a crowd, and part 2's dads are the super ones
// the maze cannot break. Lessons on The Back, where supplies are made, are still to come.)
//
// Facts gathered during a step (f): nopes (refusals by reason), waveStarts, waveEnds, and counts of
// what the shoppers did: slip (a dad slipped), watched (a shopper stopped to watch the TV Salesman),
// beam (the most shoppers one Barcode Laser beam hit), smashed (a gym bro wrecked something;
// smashedCrate for crate stacks), rebuilt (the Rebuild button put something back).
import { queueTrainingWave, setTrainingCash, TUNE, BUILD, sizeOf } from '../sim/index.js';

const S = 1; // facing south (down)
const FACING = ['right', 'down', 'left', 'up'];
const at = (s, x, y) => s.grid[y * s.w + x];
const is = (s, x, y, k, d) => { const b = at(s, x, y); return !!b && b.k === k && (d === undefined || b.d === d); };
const place = (k, x, y, d = 0) => ({ c: 'place', k, x, y, d });
const remove = (x, y) => ({ c: 'remove', x, y });

// Where things go was chosen by playing each lesson across many random seeds (see
// test/tutorial.test.js): the claims in each lesson's text hold whatever the seed.
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
// The super shopper lesson's third Sprinkler, beside the Free Samples, where the shoppers who stop
// for a sample stand in its spray. (Until 0.4 the lesson had the player buy damage upgrades for the
// Sprinklers at the gap instead; bought upgrades are gone.)
const SUPER_SPRINKLER = [7, 13];
// Its super Coupon Clippers (Extreme Couponers): more than the layout gets through without the third
// Sprinkler, never more than it gets through with it (the tests check every seed).
const SUPER_CLIPPERS = 8;
const SUPER_WORD = 'eight';
// The Barcode Laser: three tiles standing up and down above column 6, facing down. Everyone comes in
// along row 7 and turns down column 6 to the gap, and a crowd backs up along it at the TV Salesman
// and the samples, so its beam (10 tiles: rows 7 to 16) runs down the whole queue.
const LASER = [6, 4];
// Its crowd of Extreme Couponers: more than the layout gets through without it, none with it.
const LASER_CROWD = 30;
const LASER_WORD = 'thirty';
// The Forklift Turret: its circle (6 tiles) covers the whole way down column 6 and along the bottom
// row to the gap.
const FORKLIFT = [8, 9];
// The dads lesson: ordinary dads, all of whom the maze wears down, then Dads on a Mission at the
// back, some of whom it does not (the tests check every seed).
const DADS_FRONT = 5, DADS_BACK = 3;
// The forklift lesson's Dads on a Mission: more than the maze stops without it, none with it.
const MISSION_DADS = 2;
// By the entrance: shoppers coming in must walk round these, a gym bro walks through one.
const DOOR_CRATES = [[2, 7], [2, 8], [1, 9]];
/** What removing something gives back, as the Remove button says it ("75% back"). */
const BACK = `${Math.round(TUNE.sellBack * 100)}%`;

/**
 * Marks for a list of [x, y, kind, facing, label] wanted buildings that are not correctly in place
 * yet. Each mark also says what it wants (k, d), for the training arrow (src/tutorial/target.js).
 */
function wanted(s, list) {
  const out = [];
  for (const [x, y, k, d, label] of list) if (!is(s, x, y, k, d)) out.push(d === undefined ? { x, y, label, k } : { x, y, label, k, d });
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

/** The closing word on The Back, the floor under the shop (0.4), for the last lesson. */
const THE_BACK = 'One floor down is The Back: there your belts and machines turn returned junk into the supplies that make security stronger.';

export const STEPS = [
  {
    title: 'Welcome to the Returns Department',
    manual: true,
    text: [
      'Do this: read this, then press Next. Every lesson starts with a line like this one, and the big yellow arrow points at what to press.',
      'Shoppers come in through the ENTRANCE on the left and walk to the tills on the right. Every shopper who reaches a till takes a refund out of your cash. In a real game, 20 refunds closes the store.',
      'Your job is to make them suffer on the way. Shoppers cannot walk through Crate Stacks or security, so whatever you build is the maze they have to walk, and your security wears them down along it until they give up and leave.',
      'This training shift walks you through every building on the shop floor. You cannot lose here, and money is free.',
    ],
    quip: "I'm DEB from HR, and I'm training you today. Read the lesson, do what it says, then press Next.",
    done: () => false,
    solve: () => [],
  },
  {
    title: 'Build the maze: Crate Stacks',
    tool: 'crate',
    text: [
      'Do this: click Crates (or press 1), then press the mouse button on the first highlighted tile, drag straight down to the last one, and let go. A Crate Stack lands on every tile you drag over: a wall from the top of the store to one tile off the bottom.',
      'A Crate Stack is the cheapest wall there is: it blocks shoppers and does nothing else.',
      'The yellow dashed line on the floor is the route shoppers will walk from the doors to the tills, drawn whenever you build. Watch it bend round your wall as it goes up: a longer route gives your security more time to work on them.',
    ],
    touch: [
      'Do this: tap Crates in the bar, then tap each of the highlighted tiles in turn, from the top one down: a wall from the top of the store to one tile off the bottom.',
      'A Crate Stack is the cheapest wall there is: it blocks shoppers and does nothing else. (A building can also be dragged out of the bar onto its tile: it rides above your finger so you can see where it lands.)',
      'The yellow dashed line on the floor is the route shoppers will walk from the doors to the tills, drawn whenever you build. Watch it bend round your wall as it goes up: a longer route gives your security more time to work on them.',
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
      'Do this: try to put a Crate in the highlighted gap at the bottom of your wall. It will be refused: shoppers must always have a way through, so you can never close the route completely.',
      'A one-tile gap is the best you can do, and it is exactly where security belongs.',
    ],
    touch: [
      'Do this: try to drag Crates onto the highlighted gap at the bottom of your wall. It will be refused: shoppers must always have a way through, so you can never close the route completely.',
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
      'Do this: right-click the highlighted Crate Stack at the bottom of your wall to remove it, then click Sprinkler (or press 2), click the same tile, and press OPEN THE DOORS at the top. Three Coupon Clippers are waiting to come in.',
      `Security blocks shoppers too, so it can be part of your wall, right where it does the most good: over the gap. Removing something gives back ${BACK} of what it cost (the Remove tool in the bar does the same as a right-click).`,
      'A Pepper Sprinkler hits everyone within about 2 tiles, twice a second. Shoppers do not have health. They have patience, the bar above their heads. Security wears it down, and when it runs out they storm off and you keep your cash. The circle round a Sprinkler shows its reach.',
    ],
    touch: [
      'Do this: tap the highlighted Crate Stack at the bottom of your wall (tap DROP first if you are still holding Crates) and tap ✕ Remove on the card that opens, then drag Sprinkler from the bar onto the same tile and tap OPEN THE DOORS at the top. Three Coupon Clippers are waiting to come in.',
      `Security blocks shoppers too, so it can be part of your wall, right where it does the most good: over the gap. Removing something gives back ${BACK} of what it cost.`,
      'A Pepper Sprinkler hits everyone within about 2 tiles, twice a second. Shoppers do not have health. They have patience, the bar above their heads. Security wears it down, and when it runs out they storm off and you keep your cash. The circle round a Sprinkler shows its reach.',
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
      'Do this: click Wet Floor (or press 5) and put it in the gap, put a second Sprinkler (press 2) on the highlighted tile beside the first, then press OPEN THE DOORS for ten Coupon Clippers. A Wet Floor Sign halves the speed of shoppers who walk over it, so they spend twice as long in the spray.',
      'Ten Coupon Clippers in a bunch are more than one Sprinkler can wear down before they are past it. The sign does not block the route, so it can sit right in the gap.',
    ],
    touch: [
      'Do this: drag Wet Floor from the bar into the gap and a second Sprinkler onto the highlighted tile beside the first, then tap OPEN THE DOORS for ten Coupon Clippers. A Wet Floor Sign halves the speed of shoppers who walk over it, so they spend twice as long in the spray.',
      'Ten Coupon Clippers in a bunch are more than one Sprinkler can wear down before they are past it. The sign does not block the route, so it can sit right in the gap.',
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
      'Do this: click Samples (or press 6) and put Free Samples on the highlighted tile, then press OPEN THE DOORS for a bigger crowd. Coupon Clippers within about 2 tiles of it stop for 2 seconds to eat, standing still in your sprinklers\' reach.',
      'Not every shopper stops for a free sample: dads, for one, walk straight past.',
    ],
    touch: [
      'Do this: drag Samples from the bar onto the highlighted tile, then tap OPEN THE DOORS for a bigger crowd. Coupon Clippers within about 2 tiles of it stop for 2 seconds to eat, standing still in your sprinklers\' reach.',
      'Not every shopper stops for a free sample: dads, for one, walk straight past.',
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
      `Do this: click Salesman (or press 7) and click the top-left one of the four highlighted tiles, put a Sprinkler (press 2) on the tile just above him, then press OPEN THE DOORS for ${SALES_CROWD} Coupon Clippers. Shoppers who come near him may stop to watch his knife demonstration, standing in that Sprinkler's spray.`,
      'His reach is about 4½ tiles. A crowd this big swamps your gap, because a Sprinkler only sprays four shoppers at a time: the ones he holds up reach the gap later, a few at a time, instead of all together. Now and then one hurries past him instead, faster for a few seconds.',
      'He takes two tiles by two. Even a dad stops for him now and then (one in five), though more of them hurry past faster (three in ten), so put security round his stand, where they stop, not after it.',
    ],
    touch: [
      `Do this: drag Salesman from the bar onto the four highlighted tiles and Sprinkler onto the tile just above him, then tap OPEN THE DOORS for ${SALES_CROWD} Coupon Clippers. Shoppers who come near him may stop to watch his knife demonstration, standing in that Sprinkler's spray.`,
      'His reach is about 4½ tiles. A crowd this big swamps your gap, because a Sprinkler only sprays four shoppers at a time: the ones he holds up reach the gap later, a few at a time, instead of all together. Now and then one hurries past him instead, faster for a few seconds.',
      'He takes two tiles by two. Even a dad stops for him now and then (one in five), though more of them hurry past faster (three in ten), so put security round his stand, where they stop, not after it.',
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
    title: 'Super shoppers',
    tool: 'sprinkler',
    wave: [{ k: 'clipper', n: SUPER_CLIPPERS, gap: 0.6, at: 0, sup: SUPER_CLIPPERS }],
    text: [
      `Do this: put a third Sprinkler (press 2) on the highlighted tile beside the Free Samples, then press OPEN THE DOORS. As they are, your two Sprinklers at the gap cannot stop the ${SUPER_WORD} Extreme Couponers (super Coupon Clippers: faster, with two and a half times the patience) waiting outside. The ones who stop for a sample will stand in its spray.`,
      'Later in a real game, SUPER versions of every shopper turn up. They are bigger, marked in gold, far more patient, and take a double refund.',
      'In a real game your security also gets stronger: supplies made in The Back, the floor under the shop, go up to it and make it hit harder, fire faster and reach further while they last. The number on a building is the level it is working at.',
    ],
    touch: [
      `Do this: drag Sprinkler from the bar onto the highlighted tile beside the Free Samples, then tap OPEN THE DOORS. As they are, your two Sprinklers at the gap cannot stop the ${SUPER_WORD} Extreme Couponers (super Coupon Clippers: faster, with two and a half times the patience) waiting outside. The ones who stop for a sample will stand in its spray.`,
      'Later in a real game, SUPER versions of every shopper turn up. They are bigger, marked in gold, far more patient, and take a double refund.',
      'In a real game your security also gets stronger: supplies made in The Back, the floor under the shop, go up to it and make it hit harder, fire faster and reach further while they last. The number on a building is the level it is working at.',
    ],
    quip: "A third Sprinkler by the samples, then open the doors. Extreme Couponers: they'd sell their own mothers for 10% off, and she'd be reduced to clear.",
    mood: 'smug',
    marks: (s) => wanted(s, [[...SUPER_SPRINKLER, 'sprinkler', undefined, 'Sprinkler']]),
    done: (s, f) => is(s, ...SUPER_SPRINKLER, 'sprinkler') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, ...SUPER_SPRINKLER, 'sprinkler', undefined, 'Sprinkler')
      || (is(s, ...SUPER_SPRINKLER, 'sprinkler') ? openDoorsHint(s, f) : null),
    solve: () => [place('sprinkler', ...SUPER_SPRINKLER), { c: 'start' }],
  },
  {
    title: 'Aim down the line: the Barcode Laser',
    tool: 'railgun',
    // (Without it the layout lets some of these through, whatever the seed: see the tests.)
    wave: [{ k: 'clipper', n: LASER_CROWD, gap: 0.15, at: 0, sup: LASER_CROWD }],
    text: [
      `Do this: click Laser (or press 4), press R until the arrow on the preview points DOWN, click the top one of the three highlighted tiles, then press OPEN THE DOORS for ${LASER_WORD} Extreme Couponers. The laser only fires the way its arrow points.`,
      `Everyone comes in single file and turns down this column on the way to the gap, and a crowd backs up along it at the TV Salesman and the samples. The Barcode Laser's beam goes straight out of the end its arrow points to, 10 tiles, through everything in the way, and hits every shopper on that line at once. Without it, your gap cannot take ${LASER_CROWD} of them.`,
      'It is slow to reload, so it wants a queue, not a straggler: the first one in sets it off alone, and the next beam takes most of the queue behind her. It is three tiles long and expensive, and once built it only turns end for end (⟳ Rotate on its card), so turn it before you place it.',
    ],
    touch: [
      `Do this: tap Laser in the bar, tap the rotate button at the end of the bar until its arrow points DOWN, then tap the top one of the three highlighted tiles. Then tap OPEN THE DOORS for ${LASER_WORD} Extreme Couponers. The laser only fires the way its arrow points.`,
      `Everyone comes in single file and turns down this column on the way to the gap, and a crowd backs up along it at the TV Salesman and the samples. The Barcode Laser's beam goes straight out of the end its arrow points to, 10 tiles, through everything in the way, and hits every shopper on that line at once. Without it, your gap cannot take ${LASER_CROWD} of them.`,
      'It is slow to reload, so it wants a queue, not a straggler: the first one in sets it off alone, and the next beam takes most of the queue behind her. It is three tiles long and expensive, and once built it only turns end for end, so turn it before you place it.',
    ],
    quip: "Laser at the top of the highlighted column, arrow down, then open the doors. Thirty Extreme Couponers in a queue, like your mum's on payday.",
    mood: 'smug',
    marks: (s) => wantedBig(s, ...LASER, 'railgun', S, 'Laser, arrow down'),
    done: (s, f) => is(s, ...LASER, 'railgun', S) && f.waveEnds >= 1,
    hint: (s, f) => bigHint(s, ...LASER, 'railgun', S, 'Laser')
      || (is(s, ...LASER, 'railgun', S) ? watchHint('Watch the beam go down the queue.')(s, f) : null),
    solve: () => [place('railgun', ...LASER, S), { c: 'start' }],
  },

  // ---- Part 2: the difficult customers --------------------------------------------------------
  {
    title: 'Part 2: The difficult customers',
    manual: true,
    part2: true,
    text: [
      'Do this: read this, then press Next. Part 1 was the buildings, tried out on the plainest shopper there is. Part 2 is two shoppers who play by their own rules: Dads and Gym Bros. Each has a trick that gets past an ordinary defence, and each trick has an answer.',
      'Your layout from part 1 stays, and the lessons have you add to it. One building is still to come, the Forklift Turret, and it is made for the dads your maze cannot break.',
    ],
    quip: "Part 2: the shoppers who cheat. Dads and Gym Bros. Neither of them reads instructions either, so you'll get on.",
    mood: 'smug',
    done: () => false,
    solve: () => [],
  },
  {
    title: 'Dads',
    wave: [
      { k: 'dad', n: DADS_FRONT, gap: 0.35, at: 0 },
      { k: 'dad', n: DADS_BACK, gap: 0.35, at: DADS_FRONT * 0.35, sup: DADS_BACK },
    ],
    text: [
      'Do this: press OPEN THE DOORS and watch eight dads come in, in single file. A dad wants to get through the line and go home: he walks fast, never stops for Free Samples, and strides straight over Wet Floor Signs (now and then one slips and lies there stunned). Pepper spray bothers him less than most, too.',
      'What wears a dad down is time: his patience drains by itself every second he is in the store, so a long route does half your work. The five ordinary dads at the front crack before they reach a till.',
      'The three at the back are Dads on a Mission, super dads: two and a half times the patience, it drains half as fast, and they never slip. Some of them will walk out with a double refund, $50 each, and leave a five-star review.',
    ],
    quip: "Open the doors and count the dads. Eight of them, each told his wife 'two minutes'.",
    mood: 'smug',
    done: (s, f) => f.waveEnds >= 1,
    hint: watchHint('Watch the three at the back of the line.'),
    solve: () => [{ c: 'start' }],
  },
  {
    title: 'Stopping dads: the Forklift Turret',
    tool: 'forklift',
    wave: [{ k: 'dad', n: MISSION_DADS, gap: 0.35, at: 0, sup: MISSION_DADS }],
    text: [
      'Do this: click Forklift (or press 3), click the highlighted tile, then press OPEN THE DOORS for two more Dads on a Mission. A Forklift Turret hits one shopper hard from 6 tiles away, always the one nearest the tills.',
      'A dad with patience to burn needs big hits, one at a time, for as long as you can keep them coming. So a forklift goes where its circle covers a long stretch of the route: this one covers the whole way down to the gap.',
      'Your maze alone lets one of the two through. Each dad who reaches a till takes his refund and leaves a five-star review.',
    ],
    touch: [
      'Do this: drag Forklift from the bar onto the highlighted tile, then tap OPEN THE DOORS for two more Dads on a Mission. A Forklift Turret hits one shopper hard from 6 tiles away, always the one nearest the tills.',
      'A dad with patience to burn needs big hits, one at a time, for as long as you can keep them coming. So a forklift goes where its circle covers a long stretch of the route: this one covers the whole way down to the gap.',
      'Your maze alone lets one of the two through. Each dad who reaches a till takes his refund and leaves a five-star review.',
    ],
    quip: "Forklift on the highlighted tile, then open the doors. Waste his time. You're good at that; I've seen your timesheets.",
    marks: (s) => wanted(s, [[...FORKLIFT, 'forklift', undefined, 'Forklift']]),
    done: (s, f) => is(s, ...FORKLIFT, 'forklift') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, ...FORKLIFT, 'forklift', undefined, 'Forklift')
      || (is(s, ...FORKLIFT, 'forklift') ? watchHint('Watch the forklift pick them off on the way down.')(s, f) : null),
    solve: () => [place('forklift', ...FORKLIFT), { c: 'start' }],
  },
  {
    title: 'Gym Bros',
    tool: (s, f) => (f.waveEnds && s.rubble.length ? 'rebuild' : 'crate'),
    wave: [{ k: 'gymbro', n: 1, gap: 1, at: 0 }],
    text: [
      'Do this: put Crates (press 1) on the three highlighted tiles by the entrance, then OPEN THE DOORS for one Gym Bro. He walks straight through crates instead of round them.',
      'Do this: when he has gone, press B (or the Rebuild button in the build bar) to put back everything he wrecked, for half of what you paid for it.',
      'A Gym Bro smashes any Crate Stack in his way, and the ones beside him as he passes. Now and then he smashes something else he passes, too: a sprinkler, a sample table, a sign. Each thing you build survives one hit in a sales event (more for the biggest security); Duct Tape from The Back soaks up more.',
      `But he only has ${['no', 'one', 'two', 'three', 'four'][TUNE.smashMax] ?? TUNE.smashMax} hits in him a visit, and needs ${TUNE.smashWait} seconds to get his breath back after each. While he does, and once he is spent, he walks round crates like anyone else. A hit that Duct Tape soaks up still uses one of his.`,
      'The money goes the moment you press. The building goes back when nothing is in the way, and every new wreck needs another press.',
    ],
    touch: [
      'Do this: drag Crates from the bar onto the three highlighted tiles by the entrance, then tap OPEN THE DOORS for one Gym Bro. He walks straight through crates instead of round them.',
      'Do this: when he has gone, tap the Rebuild button in the bar to put back everything he wrecked, for half of what you paid for it.',
      'A Gym Bro smashes any Crate Stack in his way, and the ones beside him as he passes. Now and then he smashes something else he passes, too: a sprinkler, a sample table, a sign. Each thing you build survives one hit in a sales event (more for the biggest security); Duct Tape from The Back soaks up more.',
      `But he only has ${['no', 'one', 'two', 'three', 'four'][TUNE.smashMax] ?? TUNE.smashMax} hits in him a visit, and needs ${TUNE.smashWait} seconds to get his breath back after each. While he does, and once he is spent, he walks round crates like anyone else. A hit that Duct Tape soaks up still uses one of his.`,
      'The money goes the moment you tap. The building goes back when nothing is in the way, and every new wreck needs another tap.',
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
      if (s.phase === 'wave') return 'Watch him smash through the crates, then get his breath back.';
      if (f.waveEnds && s.rubble.length) return 'Press B (or the Rebuild button in the build bar) to put back what he wrecked.';
      for (const [x, y] of DOOR_CRATES) { const h = tileHint(s, x, y, 'crate', undefined, 'Crate'); if (h) return h; }
      if (!DOOR_CRATES.every(([x, y]) => is(s, x, y, 'crate'))) return f.waveEnds ? 'Put Crates on the highlighted tiles (press 1).' : null;
      if (f.waveEnds && !f.smashedCrate) return 'He never reached a crate. Press OPEN THE DOORS to send him in again.';
      return f.waveEnds ? null : 'Now press OPEN THE DOORS at the top of the screen.';
    },
    solve: () => [...DOOR_CRATES.map(([x, y]) => place('crate', x, y)), { c: 'start' }],
    after: () => [{ c: 'rebuild' }],
  },
  {
    title: 'Training complete',
    manual: true,
    last: true,
    text: [
      'Do this: press Play a real game when you are ready, or stay here and practise for as long as you like. Pick any button in the build bar to see what it does and how to use it.',
      'That is every building on the shop floor. In a real game, cash is limited, each player has his own (every sales event he survives pays him, more if the floor is cleared fast; refunds are split evenly), the store is bigger, there are 20 sales events with a short build break between them, and shoppers get more patient every event.',
      'The real store has many more kinds of shopper than these three, each with its own trick, and the Employee Handbook lists them all: press ? at the top right, then 📖 Employee Handbook.',
      'A real store is bigger than this one. Move the view with W, A, S and D, zoom with the mouse wheel, press F to see the whole floor and H to go back to your entrance. With friends, each of you gets your own entrance to look after.',
      'P, or the pause button beside the speed buttons at the top, stops the store for everyone; 1x to 5x set how fast it runs.',
      'A good opening: a wall of Crate Stacks with one gap, sprinklers and a wet floor sign at the gap, and a forklift covering the long way down to it. Then more forklifts along the rest of the route, and a Barcode Laser down the longest straight stretch of it.',
      `${THE_BACK} Press Tab, or CHECK IN THE BACK at the top, to go down there and back.`,
    ],
    touch: [
      'Do this: tap Play a real game when you are ready, or stay here and practise for as long as you like. Hold your finger on any button in the build bar to see what it does and how to use it.',
      'That is every building on the shop floor. In a real game, cash is limited, each player has his own (every sales event he survives pays him, more if the floor is cleared fast; refunds are split evenly), the store is bigger, there are 20 sales events with a short build break between them, and shoppers get more patient every event.',
      'The real store has many more kinds of shopper than these three, each with its own trick, and the Employee Handbook lists them all: tap ? at the top right (under ☰ on a phone), then 📖 Employee Handbook.',
      'A real store is bigger than this one. Drag the floor with nothing picked to move the view, pinch with two fingers to zoom, tap MAP to see the whole floor and HOME to go back to your entrance. With friends, each of you gets your own entrance to look after.',
      'The pause button beside the speed buttons (under ☰ on a phone) stops the store for everyone; 1x to 5x set how fast it runs.',
      'A good opening: a wall of Crate Stacks with one gap, sprinklers and a wet floor sign at the gap, and a forklift covering the long way down to it. Then more forklifts along the rest of the route, and a Barcode Laser down the longest straight stretch of it.',
      `${THE_BACK} Tap CHECK IN THE BACK at the top to go down there and back.`,
    ],
    quip: "Training complete. Press Play a real game when you're ready. You've met the minimum standard. Briefly, and from below.",
    mood: 'smug',
    done: () => false,
    solve: () => [],
  },
];

/** Where part 2, "The difficult customers", starts. */
export const PART_TWO = STEPS.findIndex((st) => st.part2);

const freshFacts = () => ({
  nopes: {}, waveStarts: 0, waveEnds: 0,
  slip: 0, watched: 0, beam: 0, smashed: 0, smashedCrate: 0, rebuilt: 0,
});
/** Simulation events that are simply counted into the facts of the same name. */
const COUNTED = new Set(['slip']);

/**
 * Runs the training shift on a host session whose game was created with { training: true }.
 * @param {Object} session a HostSession
 * @param {Object} [o]
 * @param {() => void} [o.onChange] called whenever the step changes
 */
export function createTutorial(session, { onChange = () => {} } = {}) {
  let index = -1;
  let facts = freshFacts();
  /** Result of the most recent wave, shown at the top of the next step. */
  let lastWave = null;

  const offFx = session.on('fx', (events) => {
    for (const e of events) {
      if (COUNTED.has(e.e)) facts[e.e]++;
      if (e.e === 'watching') facts.watched++;
      if (e.e === 'rail') facts.beam = Math.max(facts.beam, e.n);
      if (e.e === 'smash') { facts.smashed++; if (e.k === 'crate') facts.smashedCrate++; }
      if (e.e === 'rebuilt') facts.rebuilt += e.n;
      if (e.e === 'waveStart') facts.waveStarts++;
      if (e.e === 'waveEnd') {
        facts.waveEnds++;
        lastWave = { stopped: session.state.ws.stopped, escaped: session.state.ws.escaped };
        // The doors were opened before the lesson was ready (or the shoppers did not show what
        // the lesson is about): line the same shoppers up again so the player can have another go.
        const st = STEPS[index];
        if (st && st.wave && !st.done(session.state, facts) && !(st.after && session.state.rubble.length)) {
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
   * Sends a command for autoplay. A refusal normally reaches the facts as a 'nope' message; when
   * the screen has kept those quiet (jumping ahead from the panel), it is counted from the answer.
   */
  function sendCounted(cmd) {
    const before = Object.values(facts.nopes).reduce((a, b) => a + b, 0);
    const r = session.send(cmd);
    if (r && r.ok === false && Object.values(facts.nopes).reduce((a, b) => a + b, 0) === before) {
      facts.nopes[r.why] = (facts.nopes[r.why] || 0) + 1;
    }
  }

  /** Sends a step's `after` commands once its wave is over, a single time. */
  function finish(st, sent) {
    if (!sent && st.after && facts.waveEnds && session.state.phase === 'build') {
      for (const cmd of st.after(session.state)) session.send(cmd);
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
    get facts() { return facts; },
    /** The build-bar button the current step points at, or null. */
    tool() {
      const st = STEPS[index];
      if (!st || !st.tool) return null;
      return typeof st.tool === 'function' ? st.tool(session.state, facts) : st.tool;
    },
    /** True once the current step's task is done (never for explanation-only steps). */
    check() {
      const st = STEPS[index];
      return !!st && !st.manual && st.done(session.state, facts);
    },
    marks() {
      const st = STEPS[index];
      return st && st.marks ? st.marks(session.state, facts) : [];
    },
    hint() {
      const st = STEPS[index];
      return (st && st.hint && st.hint(session.state, facts)) || null;
    },
    start() { enter(0); },
    next() { if (index < STEPS.length - 1) enter(index + 1); },
    back() { if (index > 0) enter(index - 1); },
    /** Does the current step for the player, then moves on. Waves are not waited for. */
    skip() {
      const st = STEPS[index];
      for (const cmd of st.solve(session.state)) if (cmd.c !== 'start') session.send(cmd);
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
          for (let n = 0; n < 240 && !st.done(session.state, facts); n++) { // up to 2 minutes
            sent = finish(st, sent);
            session.fastForward(15);
          }
          finish(st, sent);
          if (!st.done(session.state, facts)) stuck.push(index);
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
