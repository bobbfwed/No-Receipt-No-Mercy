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
//                 there (k, d, up, fix), which the training arrow follows (src/tutorial/target.js)
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
// that there's variation ... it should show all buildings"): every building in BUILD is placed by
// the player at least once, and the Upgrade, Rebuild and Remove tools are each used; the only
// shoppers sent in are Coupon Clippers (super ones in the upgrade lesson), Dads and a Gym Bro.
// test/tutorial.test.js holds it to both.
//
// Facts gathered during a step (f): sales, nopes (refusals by reason), waveStarts, waveEnds, and
// counts of what the shoppers did: slip (a dad slipped), watched (a shopper stopped to watch the
// TV Salesman), beam (the most shoppers one Barcode Laser beam hit), smashed (a gym bro wrecked
// something; smashedCrate for crate stacks), rebuilt (the Rebuild button put something back).
import { queueTrainingWave, setTrainingCash, levelIn, maxIn, TUNE, BUILD, sizeOf } from '../sim/index.js';

const E = 0, S = 1, W = 2; // facing east, south, west
const FACING = ['right', 'down', 'left', 'up'];
const X = 10; // the column the production line runs down
const at = (s, x, y) => s.grid[y * s.w + x];
const is = (s, x, y, k, d) => { const b = at(s, x, y); return !!b && b.k === k && (d === undefined || b.d === d); };
const place = (k, x, y, d = 0) => ({ c: 'place', k, x, y, d });
const remove = (x, y) => ({ c: 'remove', x, y });

const BELTS = [3, 4, 5, 6, 7, 8, 9, 10]; // rows of the belt run under the unpacker
const CRATES = [[X, 1], [X, 12], [X, 13]];
const GAP = [X, 14];
const SPRINKLERS = [[9, 13], [11, 13]]; // the two beside the gap
const UP_TO = 3; // the damage level the upgrade lesson asks for (the U key buys damage)
// The upgrade lesson's super Coupon Clippers (Extreme Couponers): more than the layout gets through
// before its upgrades, never more than it gets through after (the tests check every seed).
const SUPER_CLIPPERS = 8;
const SUPER_WORD = 'eight';

// Where things go was chosen by playing each lesson across many random seeds (see
// test/tutorial.test.js): the claims in each lesson's text hold whatever the seed.
// The TV Salesman (2 x 2, top-left tile here) low on the left, where the Coupon Clippers pass on
// their way down to the gap, with a Sprinkler just above him: the ones who stop to watch stand in
// its spray. His middle is more than his reach (4.5 tiles) from the row the dads walk, so the dad
// lessons later play out without him.
const SALESMAN = [4, 13];
const SALES_SPRINKLER = [5, 12];
const DAD_FORK = [12, 6]; // covers the dad short cut over the belts
const DAD_SIGNS = [[9, 7], [9, 8]]; // in front of the belt the dads step over
// Below the signs: it makes the lower way over the belts the long way round, so every dad crosses
// at the same place, one behind the other, along row 7 (without it, dads who come in through the
// lower half of the door may cross lower down).
const DAD_CRATE = [9, 9];
// The Barcode Laser: 3 tiles along row 7 just past the belt, facing west, so its beam runs back
// along the dads' row, through the belt, toward the entrance (10 tiles: it reaches x 2 to 12).
const LASER = [12, 7];
// By the entrance: shoppers coming in must walk round these, a gym bro walks through one.
const DOOR_CRATES = [[2, 7], [2, 8], [1, 9]];
/** What removing something gives back, as the Remove button says it ("75% back"). */
const BACK = `${Math.round(TUNE.sellBack * 100)}%`;
/** On a touch screen, once (in the first lesson that places a building): the other way to place. */
const OR_TAP = 'While you drag, the building rides above your finger so you can see where it lands. (Or tap its button, then tap the tile; then tap DROP to put it down before you tap the building.)';
/** On a touch screen: a dragged machine lands facing right (unless turned while dragging), and is
 * turned through the card that opens when it is tapped. (Not the Rotate button that shows during a
 * drag, which a second finger has to press.) */
const TURN_IT = 'It lands facing right: tap it, then tap ⟳ Rotate on its card until its arrow points DOWN.';

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

/** The damage level of the building on (x, y): what the U key raises. */
const dmgAt = (s, x, y) => levelIn(at(s, x, y), 'dmg');

/** Commands that bring the building on (x, y) up to damage level `lv`, placing it first if missing. */
function upTo(s, k, x, y, lv) {
  const cmds = [];
  if (!is(s, x, y, k)) cmds.push(place(k, x, y));
  for (let n = is(s, x, y, k) ? dmgAt(s, x, y) : 0; n < lv; n++) cmds.push({ c: 'upgrade', x, y, t: 'dmg' });
  return cmds;
}

export const STEPS = [
  {
    title: 'Welcome to the Returns Department',
    manual: true,
    text: [
      'Do this: read this, then press Next. Every lesson starts with a line like this one, and the big yellow arrow points at what to press.',
      'Shoppers come in through the ENTRANCE on the left and walk to the tills on the right. Every shopper who reaches a till takes a refund out of your cash. In a real game, 20 refunds closes the store.',
      'You have two jobs. Build a factory that earns cash. Build security that wears shoppers down until they give up and leave.',
      'This training shift walks you through every building. You cannot lose here, and money is free.',
    ],
    quip: "I'm DEB from HR, and I'm training you today. Read the lesson, do what it says, then press Next.",
    done: () => false,
    solve: () => [],
  },
  {
    title: 'Start a production line: the Unpacker',
    tool: 'unpacker',
    text: [
      'Do this: click Unpacker in the bar at the bottom (or press 2), press R until the arrow on the preview points DOWN, then click the highlighted tile. Every production line starts with an Unpacker: it makes a Mystery Box every 2.5 seconds, for free.',
      'It pushes each box out of the side its arrow points to, so the arrow decides which way your line runs.',
      'The painted, named patches of floor (LOADING BAY, PRESS SHOP, GIFT WRAP, SHIPPING) are where the four factory machines go, each only on its own: Unpackers on Loading Bay. The patches are apart, so goods travel between them on belts. Belts, crates and security can go anywhere.',
    ],
    touch: [
      `Do this: drag Unpacker from the bar at the bottom onto the highlighted tile. ${TURN_IT}`,
      `${OR_TAP} Every production line starts with an Unpacker: it makes a Mystery Box every 2.5 seconds, for free, and pushes it out of the side its arrow points to.`,
      'The painted, named patches of floor (LOADING BAY, PRESS SHOP, GIFT WRAP, SHIPPING) are where the four factory machines go, each only on its own: Unpackers on Loading Bay. The patches are apart, so goods travel between them on belts. Belts, crates and security can go anywhere.',
    ],
    quip: 'Unpacker on the highlighted tile, arrow pointing down. It makes the boxes that everything else turns into money.',
    marks: (s) => wanted(s, [[X, 2, 'unpacker', S, 'Unpacker, arrow down']]),
    done: (s) => is(s, X, 2, 'unpacker', S),
    hint: (s) => tileHint(s, X, 2, 'unpacker', S, 'Unpacker'),
    solve: () => [place('unpacker', X, 2, S)],
  },
  {
    title: 'Belts carry goods',
    tool: 'belt',
    text: [
      'Do this: click Belt (or press 1), then press the mouse button on the first highlighted tile, drag straight down to the last one, and let go. Belts carry goods the way their arrows point, and they point the way you drag.',
      'Then watch the boxes ride down and pile up at the end: goods wait whenever the next tile cannot take them.',
    ],
    touch: [
      'Do this: tap Belt in the bar, then put your finger on the first highlighted tile, drag straight down to the last one, and lift it. Belts carry goods the way their arrows point, and they point the way you drag.',
      'Then watch the boxes ride down and pile up at the end: goods wait whenever the next tile cannot take them.',
    ],
    quip: 'Belt from the Unpacker down to the last highlighted tile, in one drag. Belts face the way you drag them.',
    marks: (s) => wanted(s, BELTS.map((y, n) => [X, y, 'belt', S, n === 0 ? 'Drag from here' : n === BELTS.length - 1 ? 'to here' : ''])),
    done: (s) => BELTS.every((y) => is(s, X, y, 'belt', S)),
    hint: (s) => {
      for (const y of BELTS) {
        const b = at(s, X, y);
        if (b && b.k === 'belt' && b.d !== S) return 'A belt is pointing the wrong way. With Belt picked, drag again from the first highlighted tile down to the last: belts turn to the way you drag.';
        if (b && b.k !== 'belt') return 'Something else is on a highlighted tile. Right-click it to remove it, then lay belt there.';
      }
      return null;
    },
    solve: () => BELTS.map((y) => place('belt', X, y, S)),
  },
  {
    title: 'Sell the goods: the Shipping Chute',
    tool: 'chute',
    text: [
      'Do this: click Chute (or press 5), then click the highlighted tile at the end of the belt. Nothing earns money until it falls into a Shipping Chute: it takes goods from any side and sells them on the spot.',
      'Chutes only go on SHIPPING floor, which is why the belt had to come all this way. Watch your cash at the top left: each Mystery Box sells for $2.',
    ],
    touch: [
      'Do this: drag Chute from the bar onto the highlighted tile at the end of the belt. Nothing earns money until it falls into a Shipping Chute: it takes goods from any side and sells them on the spot.',
      'Chutes only go on SHIPPING floor, which is why the belt had to come all this way. Watch your cash at the top left: each Mystery Box sells for $2.',
    ],
    quip: "Chute at the end of the belt. Two dollars a box: at that rate you'll afford my respect in about nine hundred years.",
    marks: (s) => wanted(s, [[X, 11, 'chute', undefined, 'Chute']]),
    done: (s, f) => is(s, X, 11, 'chute') && f.sales.total >= 2,
    hint: (s, f) => tileHint(s, X, 11, 'chute', undefined, 'Chute')
      || (is(s, X, 11, 'chute') ? `Good. Wait for two boxes to be sold (${Math.min(2, f.sales.total)} of 2).` : null),
    solve: () => [place('chute', X, 11)],
  },
  {
    title: 'Make goods worth more: the Press',
    tool: 'press',
    text: [
      'Do this: right-click the highlighted belt to remove it, then click Press (or press 3), make sure its arrow points DOWN (press R to turn it), and click the same tile. A Press turns a Mystery Box ($2) into a Gadget ($8).',
      `Removing something gives back ${BACK} of what it cost (the Remove tool in the bar does the same as a right-click). A Press only goes on PRESS SHOP floor. Machines take goods in from the back or the sides, and push the result out of the side their arrow points to.`,
      'Then wait for a Gadget to reach the chute.',
    ],
    touch: [
      'Do this: tap the highlighted belt and tap ✕ Remove on the card that opens, then drag Press from the bar onto the same tile. If it lands facing another way, tap it, then tap ⟳ Rotate on its card until its arrow points DOWN. A Press turns a Mystery Box ($2) into a Gadget ($8).',
      `Removing something gives back ${BACK} of what it cost. A Press only goes on PRESS SHOP floor. Machines take goods in from the back or the sides, and push the result out of the side their arrow points to.`,
      'Then wait for a Gadget to reach the chute.',
    ],
    quip: 'Take the highlighted belt out and put a Press there, arrow down. It turns a two-dollar box into an eight-dollar Gadget.',
    marks: (s) => wanted(s, [[X, 5, 'press', S, is(s, X, 5, 'belt') ? 'Right-click to remove' : 'Press, arrow down']]),
    done: (s, f) => is(s, X, 5, 'press', S) && f.sales.gadget + f.sales.giftset >= 1,
    hint: (s, f) => (is(s, X, 5, 'belt') ? 'Right-click the highlighted belt to remove it first.'
      : tileHint(s, X, 5, 'press', S, 'Press')
        || (is(s, X, 5, 'press', S) ? 'Good. A Gadget is on its way down to the chute.' : null)),
    solve: () => [remove(X, 5), place('press', X, 5, S)],
  },
  {
    title: 'Worth even more: the Packer',
    tool: 'packer',
    text: [
      'Do this: right-click the highlighted belt, then put a Packer (press 4) there with its arrow pointing DOWN. A Packer turns a Gadget ($8) into a Gift Set ($15).',
      'It only goes on GIFT WRAP floor, and only accepts Gadgets, so it has to come after the Press. That makes a complete production line: Unpacker, Press, Packer, Chute. In a real game you will want several.',
    ],
    touch: [
      'Do this: tap the highlighted belt and tap ✕ Remove, then drag Packer from the bar onto that tile. If it lands facing another way, tap it, then tap ⟳ Rotate on its card until its arrow points DOWN. A Packer turns a Gadget ($8) into a Gift Set ($15).',
      'It only goes on GIFT WRAP floor, and only accepts Gadgets, so it has to come after the Press. That makes a complete production line: Unpacker, Press, Packer, Chute. In a real game you will want several.',
    ],
    quip: 'Packer where the highlighted belt is, arrow down. Same Gadget, nicer box, double the price. That is retail. And dating.',
    marks: (s) => wanted(s, [[X, 8, 'packer', S, is(s, X, 8, 'belt') ? 'Right-click to remove' : 'Packer, arrow down']]),
    done: (s, f) => is(s, X, 8, 'packer', S) && f.sales.giftset >= 1,
    hint: (s) => (is(s, X, 8, 'belt') ? 'Right-click the highlighted belt to remove it first.'
      : tileHint(s, X, 8, 'packer', S, 'Packer')
        || (is(s, X, 8, 'packer', S) ? 'Good. Wait for a Gift Set to reach the chute.' : null)),
    solve: () => [remove(X, 8), place('packer', X, 8, S)],
  },
  {
    title: 'The factory is the maze',
    manual: true,
    text: [
      'Do this: find the yellow dashed line on the floor, then press Next. It is the route shoppers will walk from the doors to the tills, and it is always drawn while you build.',
      'Shoppers cannot walk through belts, machines or crates, so everything you build bends the route. Your production line is already a wall: see how the yellow line goes around it.',
      'A longer route gives your security more time to work on them.',
    ],
    quip: "The yellow line is their route. They walk round whatever you build, the way your colleagues walk round you.",
    done: () => false,
    solve: () => [],
  },
  {
    title: 'Close the gaps: Crates',
    tool: 'crate',
    text: [
      'Do this: click Crates (or press 6), then click the three highlighted tiles, above and below your line. A Crate Stack is the cheapest wall there is: it blocks shoppers and does nothing else.',
      'Watch the yellow route change as you go.',
    ],
    touch: [
      'Do this: drag Crates from the bar onto each of the three highlighted tiles, above and below your line. A Crate Stack is the cheapest wall there is: it blocks shoppers and does nothing else.',
      'Watch the yellow route change as you go.',
    ],
    quip: 'Crates on the three highlighted tiles. The construction equivalent of a shrug.',
    marks: (s) => wanted(s, CRATES.map(([x, y]) => [x, y, 'crate', undefined, 'Crate'])),
    done: (s) => CRATES.every(([x, y]) => is(s, x, y, 'crate')),
    hint: (s) => {
      for (const [x, y] of CRATES) { const h = tileHint(s, x, y, 'crate', undefined, 'Crate'); if (h) return h; }
      return null;
    },
    solve: () => CRATES.map(([x, y]) => place('crate', x, y)),
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
    solve: () => [place('crate', GAP[0], GAP[1])],
  },
  {
    title: 'Security: the Pepper Sprinkler',
    tool: 'sprinkler',
    wave: [{ k: 'clipper', n: 3, gap: 1, at: 0 }],
    text: [
      'Do this: click Sprinkler (or press 7) and click the highlighted tile beside the gap, then press OPEN THE DOORS at the top. A Pepper Sprinkler hits everyone within about 2 tiles, twice a second, and three Coupon Clippers are waiting to come in.',
      'Shoppers do not have health. They have patience, the bar above their heads. Security wears it down, and when it runs out they storm off and you keep your cash. The circle round a Sprinkler shows its reach.',
    ],
    touch: [
      'Do this: drag Sprinkler from the bar onto the highlighted tile beside the gap, then tap OPEN THE DOORS at the top. A Pepper Sprinkler hits everyone within about 2 tiles, twice a second, and three Coupon Clippers are waiting to come in.',
      'Shoppers do not have health. They have patience, the bar above their heads. Security wears it down, and when it runs out they storm off and you keep your cash. The circle round a Sprinkler shows its reach.',
    ],
    quip: 'Sprinkler beside the gap, then OPEN THE DOORS. Three Coupon Clippers are waiting outside.',
    marks: (s) => wanted(s, [[9, 13, 'sprinkler', undefined, 'Sprinkler']]),
    done: (s, f) => is(s, 9, 13, 'sprinkler') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, 9, 13, 'sprinkler', undefined, 'Sprinkler') || (is(s, 9, 13, 'sprinkler') ? openDoorsHint(s, f) : null),
    solve: () => [place('sprinkler', 9, 13), { c: 'start' }],
  },
  {
    title: 'Slow them down: the Wet Floor Sign',
    tool: 'wetfloor',
    // (One Sprinkler alone lets some of these ten through, whatever the seed: see the tests.)
    wave: [{ k: 'clipper', n: 10, gap: 0.2, at: 0 }],
    text: [
      'Do this: click Wet Floor (or press 9) and put it in the gap, put a second Sprinkler (press 7) on the far side of it, then press OPEN THE DOORS for ten Coupon Clippers. A Wet Floor Sign halves the speed of shoppers who walk over it, so they spend twice as long in the spray.',
      'Ten Coupon Clippers in a bunch are more than one Sprinkler can wear down before they are past it. The sign does not block the route, so it can sit right in the gap.',
    ],
    touch: [
      'Do this: drag Wet Floor from the bar into the gap and a second Sprinkler onto the far side of it, then tap OPEN THE DOORS for ten Coupon Clippers. A Wet Floor Sign halves the speed of shoppers who walk over it, so they spend twice as long in the spray.',
      'Ten Coupon Clippers in a bunch are more than one Sprinkler can wear down before they are past it. The sign does not block the route, so it can sit right in the gap.',
    ],
    quip: 'Wet Floor in the gap, a second Sprinkler past it, then open the doors. A yellow plastic sign is about to outperform you.',
    marks: (s) => wanted(s, [[GAP[0], GAP[1], 'wetfloor', undefined, 'Wet Floor Sign'], [11, 13, 'sprinkler', undefined, 'Sprinkler']]),
    done: (s, f) => is(s, GAP[0], GAP[1], 'wetfloor') && is(s, 11, 13, 'sprinkler') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, GAP[0], GAP[1], 'wetfloor', undefined, 'Wet Floor Sign') || tileHint(s, 11, 13, 'sprinkler', undefined, 'Sprinkler')
      || (is(s, GAP[0], GAP[1], 'wetfloor') && is(s, 11, 13, 'sprinkler') ? openDoorsHint(s, f) : null),
    solve: () => [place('wetfloor', GAP[0], GAP[1]), place('sprinkler', 11, 13), { c: 'start' }],
  },
  {
    title: 'Make them stop: Free Samples',
    tool: 'samples',
    wave: [{ k: 'clipper', n: 16, gap: 0.2, at: 0 }],
    text: [
      'Do this: click Samples (or press 0) and put Free Samples on the highlighted tile, then press OPEN THE DOORS for a bigger crowd. Coupon Clippers within about 2 tiles of it stop for 2 seconds to eat, standing still in your sprinklers\' reach.',
      'Not every shopper stops for a free sample: dads, for one, walk straight past.',
    ],
    touch: [
      'Do this: drag Samples from the bar onto the highlighted tile, then tap OPEN THE DOORS for a bigger crowd. Coupon Clippers within about 2 tiles of it stop for 2 seconds to eat, standing still in your sprinklers\' reach.',
      'Not every shopper stops for a free sample: dads, for one, walk straight past.',
    ],
    quip: "Free Samples on the highlighted tile, then open the doors. Cheese on a stick: it's how I'd trap all of you.",
    marks: (s) => wanted(s, [[8, 13, 'samples', undefined, 'Free Samples']]),
    done: (s, f) => is(s, 8, 13, 'samples') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, 8, 13, 'samples', undefined, 'Free Samples') || (is(s, 8, 13, 'samples') ? openDoorsHint(s, f) : null),
    solve: () => [place('samples', 8, 13), { c: 'start' }],
  },
  {
    title: 'Hold them up: the TV Salesman',
    tool: (s) => (is(s, ...SALESMAN, 'salesman') ? 'sprinkler' : 'salesman'),
    // (Without him the gap lets some of these through, whatever the seed: see the tests.)
    wave: [{ k: 'clipper', n: 24, gap: 0.1, at: 0 }],
    text: [
      'Do this: click Salesman (or press =) and click the top-left one of the four highlighted tiles, put a Sprinkler (press 7) on the tile just above him, then press OPEN THE DOORS for 24 Coupon Clippers. Shoppers who come near him may stop to watch his knife demonstration, standing in that Sprinkler\'s spray.',
      'His reach is about 4½ tiles. A crowd this big swamps your gap, because a Sprinkler only sprays four shoppers at a time: the ones he holds up reach the gap later, a few at a time, instead of all together. Now and then one hurries past him instead, faster for a few seconds.',
      'He takes two tiles by two. Even a dad stops for him now and then (one in five), though more of them hurry past faster (three in ten), so put security round his stand, where they stop, not after it.',
    ],
    touch: [
      'Do this: drag Salesman from the bar onto the four highlighted tiles and Sprinkler onto the tile just above him, then tap OPEN THE DOORS for 24 Coupon Clippers. Shoppers who come near him may stop to watch his knife demonstration, standing in that Sprinkler\'s spray.',
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
    title: 'Upgrades, and super shoppers',
    tool: 'upgrade',
    wave: [{ k: 'clipper', n: SUPER_CLIPPERS, gap: 0.6, at: 0, sup: SUPER_CLIPPERS }],
    text: [
      `Do this: click Upgrade in the bar, click a highlighted Sprinkler, and click Damage on the card that opens until it shows Damage ${UP_TO}/${maxIn('sprinkler', 'dmg')}. Do the same for the other one, then press OPEN THE DOORS. As they are, your Sprinklers cannot stop the ${SUPER_WORD} Extreme Couponers (super Coupon Clippers: faster, with two and a half times the patience) waiting outside.`,
      'Shortcut: point at a building with the mouse and press U to buy a level of Damage.',
      'Everything you build can be upgraded, in separate tracks: damage, speed, range and durability (how many gym bro hits it survives in a sales event). You buy each track a level at a time, and each level costs more than the one before. Upgrades get more out of the floor space you have already built on. The number on a building adds up all its levels.',
      'Later in a real game, SUPER versions of every shopper turn up. They are bigger, marked in gold, far more patient, and take a double refund.',
    ],
    touch: [
      `Do this: tap a highlighted Sprinkler and tap Damage on the card that opens until it shows Damage ${UP_TO}/${maxIn('sprinkler', 'dmg')}. Do the same for the other one, then tap OPEN THE DOORS. As they are, your Sprinklers cannot stop the ${SUPER_WORD} Extreme Couponers (super Coupon Clippers: faster, with two and a half times the patience) waiting outside.`,
      'Everything you build can be upgraded, in separate tracks: damage, speed, range and durability (how many gym bro hits it survives in a sales event). You buy each track a level at a time, and each level costs more than the one before. Upgrades get more out of the floor space you have already built on. The number on a building adds up all its levels.',
      'Later in a real game, SUPER versions of every shopper turn up. They are bigger, marked in gold, far more patient, and take a double refund.',
    ],
    quip: `Both Sprinklers at the gap to Damage ${UP_TO}, then open the doors. Extreme Couponers: they'd sell their own mothers for 10% off, and she'd be reduced to clear.`,
    mood: 'smug',
    marks: (s) => SPRINKLERS.filter(([x, y]) => dmgAt(s, x, y) < UP_TO).map(([x, y]) => ({ x, y, label: 'Upgrade', k: 'sprinkler', up: 'dmg' })),
    done: (s, f) => SPRINKLERS.every(([x, y]) => is(s, x, y, 'sprinkler') && dmgAt(s, x, y) >= UP_TO) && f.waveEnds >= 1,
    hint: (s, f) => {
      for (const [x, y] of SPRINKLERS) {
        if (!is(s, x, y, 'sprinkler')) return 'A Sprinkler is missing beside the gap. Put it back on the highlighted tile first (press 7).';
        if (dmgAt(s, x, y) < UP_TO) return `Click the highlighted Sprinkler and click Damage on the card that opens. It has ${dmgAt(s, x, y)} of the ${UP_TO} damage levels it needs.`;
      }
      return openDoorsHint(s, f);
    },
    solve: (s) => {
      const cmds = [];
      for (const [x, y] of SPRINKLERS) cmds.push(...upTo(s, 'sprinkler', x, y, UP_TO));
      cmds.push({ c: 'start' });
      return cmds;
    },
  },

  // ---- Part 2: the difficult customers --------------------------------------------------------
  {
    title: 'Part 2: The difficult customers',
    manual: true,
    part2: true,
    text: [
      'Do this: read this, then press Next. Part 1 was the buildings, tried out on the plainest shopper there is. Part 2 is two shoppers who cheat: Dads and Gym Bros. Each has a trick that gets past an ordinary defence, and each trick has an answer.',
      'Your layout from part 1 stays, and the lessons have you add to it. One building is still to come, the Barcode Laser, and it is made for dads.',
    ],
    quip: "Part 2: the shoppers who cheat. Dads and Gym Bros. Neither of them reads instructions either, so you'll get on.",
    mood: 'smug',
    done: () => false,
    solve: () => [],
  },
  {
    title: 'Dads',
    wave: [{ k: 'dad', n: 4, gap: 0.35, at: 0 }],
    text: [
      'Do this: press OPEN THE DOORS and watch four dads walk past everything you have built. A dad wants to get through the line and go home: dads arrive in single file, walk fast, and ignore Free Samples and Wet Floor Signs.',
      'Worst of all, a dad steps straight over conveyor belts. The blue dashed line is the DAD SHORT CUT: right through your production line.',
    ],
    quip: "Open the doors and watch the middle of your line. Four dads, each told his wife 'two minutes'.",
    mood: 'smug',
    done: (s, f) => f.waveEnds >= 1,
    hint: (s, f) => (f.waveEnds ? null : s.phase === 'wave' ? 'Watch the middle of your production line.' : 'Press OPEN THE DOORS at the top of the screen.'),
    solve: () => [{ c: 'start' }],
  },
  {
    title: 'Stopping dads',
    tool: (s) => (!is(s, ...DAD_FORK, 'forklift') ? 'forklift' : DAD_SIGNS.some(([x, y]) => !is(s, x, y, 'wetfloor')) ? 'wetfloor' : 'crate'),
    wave: [{ k: 'dad', n: 5, gap: 0.35, at: 0 }],
    text: [
      'Do this: put a Forklift (press 8) on the highlighted tile so its circle covers the short cut, Wet Floor Signs (press 9) on the two tiles in front of the belt and a Crate (press 6) below them, then OPEN THE DOORS for five more dads. A Forklift Turret hits one shopper hard from 6 tiles away.',
      'Three things work on a dad. Time: his patience drains by itself every second he is in the store. Solid walls: he cannot climb crates or machines, only belts, so that Crate makes the lower way over the belt the long way round, and every dad crosses at the same place, one behind the other. And Wet Floor Signs: he ignores the sign, so he has a 1 in 3 chance of slipping and lying there stunned.',
      'Each dad who reaches a till takes $25 and leaves a five-star review.',
    ],
    touch: [
      'Do this: drag Forklift from the bar onto the highlighted tile so its circle covers the short cut, Wet Floor onto the two tiles in front of the belt and Crates onto the tile below them, then tap OPEN THE DOORS for five more dads. A Forklift Turret hits one shopper hard from 6 tiles away.',
      'Three things work on a dad. Time: his patience drains by itself every second he is in the store. Solid walls: he cannot climb crates or machines, only belts, so that Crate makes the lower way over the belt the long way round, and every dad crosses at the same place, one behind the other. And Wet Floor Signs: he ignores the sign, so he has a 1 in 3 chance of slipping and lying there stunned.',
      'Each dad who reaches a till takes $25 and leaves a five-star review.',
    ],
    quip: "Forklift on the short cut, Wet Floor signs in front of the belt, a Crate under them, then open the doors. Waste his time. You're good at that; I've seen your timesheets.",
    marks: (s) => wanted(s, [[...DAD_FORK, 'forklift', undefined, 'Forklift'], ...DAD_SIGNS.map(([x, y]) => [x, y, 'wetfloor', undefined, 'Wet Floor']), [...DAD_CRATE, 'crate', undefined, 'Crate']]),
    done: (s, f) => is(s, ...DAD_FORK, 'forklift') && DAD_SIGNS.every(([x, y]) => is(s, x, y, 'wetfloor')) && is(s, ...DAD_CRATE, 'crate') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, ...DAD_FORK, 'forklift', undefined, 'Forklift')
      || DAD_SIGNS.map(([x, y]) => tileHint(s, x, y, 'wetfloor', undefined, 'Wet Floor Sign')).find(Boolean)
      || tileHint(s, ...DAD_CRATE, 'crate', undefined, 'Crate')
      || (is(s, ...DAD_FORK, 'forklift') && DAD_SIGNS.every(([x, y]) => is(s, x, y, 'wetfloor')) && is(s, ...DAD_CRATE, 'crate') ? openDoorsHint(s, f) : null),
    solve: () => [place('forklift', ...DAD_FORK), ...DAD_SIGNS.map(([x, y]) => place('wetfloor', x, y)), place('crate', ...DAD_CRATE), { c: 'start' }],
  },
  {
    title: 'Aim down the line: the Barcode Laser',
    tool: 'railgun',
    // (Without it the forklift and the signs let some of these ten through, whatever the seed.)
    wave: [{ k: 'dad', n: 10, gap: 0.35, at: 0 }],
    text: [
      'Do this: click Laser (or press -), press R until the arrow on the preview points LEFT, click the left end of the three highlighted tiles, then press OPEN THE DOORS for ten dads. The laser only fires the way its arrow points.',
      'The Barcode Laser is the one building where the way it faces is everything: its beam goes straight out of the end its arrow points to, 10 tiles, through everything in the way, and hits every shopper in that line at once. Here it lies on the dads\' row and fires back along it, through the belt, at the single-file line coming in from the entrance.',
      'It is slow to reload, so it wants a queue, not a straggler: the first dad sets it off on his own, and the next beam takes most of the line behind him. It is three tiles long and expensive, and once built it only turns end for end (⟳ Rotate on its card), so turn it before you place it.',
    ],
    touch: [
      'Do this: drag Laser from the bar onto the three highlighted tiles, then tap it and tap ⟳ Rotate on its card so its arrow points LEFT (it lands pointing right). Then tap OPEN THE DOORS for ten dads. The laser only fires the way its arrow points.',
      'The Barcode Laser is the one building where the way it faces is everything: its beam goes straight out of the end its arrow points to, 10 tiles, through everything in the way, and hits every shopper in that line at once. Here it lies on the dads\' row and fires back along it, through the belt, at the single-file line coming in from the entrance.',
      'It is slow to reload, so it wants a queue, not a straggler: the first dad sets it off on his own, and the next beam takes most of the line behind him. It is three tiles long and expensive, and once built it only turns end for end, with ⟳ Rotate on its card.',
    ],
    quip: 'Laser on the highlighted row, arrow pointing left, then open the doors. Ten dads in single file, like the queue at the vasectomy clinic.',
    mood: 'smug',
    marks: (s) => wantedBig(s, ...LASER, 'railgun', W, 'Laser, arrow left'),
    done: (s, f) => is(s, ...LASER, 'railgun', W) && f.waveEnds >= 1,
    hint: (s, f) => bigHint(s, ...LASER, 'railgun', W, 'Laser')
      || (is(s, ...LASER, 'railgun', W) ? watchHint('Watch the beam go down the line of dads.')(s, f) : null),
    solve: () => [place('railgun', ...LASER, W), { c: 'start' }],
  },
  {
    title: 'Gym Bros',
    tool: (s, f) => (f.waveEnds && s.rubble.length ? 'rebuild' : 'crate'),
    wave: [{ k: 'gymbro', n: 1, gap: 1, at: 0 }],
    text: [
      'Do this: put Crates (press 6) on the three highlighted tiles by the entrance, then OPEN THE DOORS for one Gym Bro. He walks straight through crates instead of round them.',
      'Do this: when he has gone, press B (or the Rebuild button in the build bar) to put back everything he wrecked, upgrades and all, for half of what you had spent on it.',
      'A Gym Bro smashes any Crate Stack in his way, and the ones beside him as he passes. Now and then he smashes something else he passes, too: a belt, a machine, a sign. Each thing you build survives one hit in a sales event (more for the biggest security), and one more for every level of durability you buy it.',
      `But he only has ${['no', 'one', 'two', 'three', 'four'][TUNE.smashMax] ?? TUNE.smashMax} hits in him a visit, and needs ${TUNE.smashWait} seconds to get his breath back after each. While he does, and once he is spent, he walks round crates like anyone else. A hit that durability soaks up still uses one of his.`,
      'The money goes the moment you press. The building goes back when nothing is in the way, and every new wreck needs another press.',
    ],
    touch: [
      'Do this: drag Crates from the bar onto the three highlighted tiles by the entrance, then tap OPEN THE DOORS for one Gym Bro. He walks straight through crates instead of round them.',
      'Do this: when he has gone, tap the Rebuild button in the bar to put back everything he wrecked, upgrades and all, for half of what you had spent on it.',
      'A Gym Bro smashes any Crate Stack in his way, and the ones beside him as he passes. Now and then he smashes something else he passes, too: a belt, a machine, a sign. Each thing you build survives one hit in a sales event (more for the biggest security), and one more for every level of durability you buy it.',
      `But he only has ${['no', 'one', 'two', 'three', 'four'][TUNE.smashMax] ?? TUNE.smashMax} hits in him a visit, and needs ${TUNE.smashWait} seconds to get his breath back after each. While he does, and once he is spent, he walks round crates like anyone else. A hit that durability soaks up still uses one of his.`,
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
      if (!DOOR_CRATES.every(([x, y]) => is(s, x, y, 'crate'))) return f.waveEnds ? 'Put Crates on the highlighted tiles (press 6).' : null;
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
      'That is every building. In a real game, cash is limited, each player has his own (income is split evenly), the store is bigger, there are 20 sales events with a short build break between them, and shoppers get more patient every event.',
      'The real store has many more kinds of shopper than these three, each with its own trick, and the Employee Handbook lists them all: press ? at the top right, then 📖 Employee Handbook.',
      'A real store is bigger than this one. Move the view with W, A, S and D, zoom with the mouse wheel, press F to see the whole floor and H to go back to your entrance. With friends, each of you gets your own entrance to look after.',
      'P, or the pause button beside the speed buttons at the top, stops the store for everyone; 1x to 5x set how fast it runs.',
      'A good opening: one production line built as a wall, one gap, sprinklers and a wet floor sign at the gap, and something covering the dad short cut. Then forklifts along the rest of the route, and a Barcode Laser down the longest straight stretch of it.',
    ],
    touch: [
      'Do this: tap Play a real game when you are ready, or stay here and practise for as long as you like. Hold your finger on any button in the build bar to see what it does and how to use it.',
      'That is every building. In a real game, cash is limited, each player has his own (income is split evenly), the store is bigger, there are 20 sales events with a short build break between them, and shoppers get more patient every event.',
      'The real store has many more kinds of shopper than these three, each with its own trick, and the Employee Handbook lists them all: tap ? at the top right (under ☰ on a phone), then 📖 Employee Handbook.',
      'A real store is bigger than this one. Drag the floor with nothing picked to move the view, pinch with two fingers to zoom, tap MAP to see the whole floor and HOME to go back to your entrance. With friends, each of you gets your own entrance to look after.',
      'The pause button beside the speed buttons (under ☰ on a phone) stops the store for everyone; 1x to 5x set how fast it runs.',
      'A good opening: one production line built as a wall, one gap, sprinklers and a wet floor sign at the gap, and something covering the dad short cut. Then forklifts along the rest of the route, and a Barcode Laser down the longest straight stretch of it.',
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
  sales: { total: 0, box: 0, gadget: 0, giftset: 0 }, nopes: {}, waveStarts: 0, waveEnds: 0,
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
      if (e.e === 'sale') { facts.sales.total++; facts.sales[e.kind]++; }
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
