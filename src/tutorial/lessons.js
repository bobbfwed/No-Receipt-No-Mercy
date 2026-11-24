// The training shift: a guided, hands-on walk through every building. No DOM here, so a test can
// play the whole tutorial from Node and prove that each step can be completed.
//
// Each step has:
//   title, text   what the panel shows (plain instructions; `text` is a list of paragraphs)
//   quip, mood    what DEB says in her speech bubble when the step starts (the insult)
//   tool          the build-bar button to highlight, if any
//   marks(s, f)   tiles to highlight on the floor that still need attention
//   wave          shoppers lined up for when the player opens the doors (see waveSpec in the sim)
//   done(s, f)    true once the player has done what was asked (f = facts gathered this step)
//   hint(s, f)    a one-line nudge for where the player is right now, or null
//   solve(s)      the commands that complete the step (used by tests, Skip, and ?step= jumps)
//   after(s)      commands that finish the step once its wave is over (tests and jumps send them)
//   manual        the step is only an explanation; it ends when the player presses Next
//   part2         the first step of part 2, "The difficult customers" (the panel can jump to it)
// `tool` may also be a function (s, f) => tool, for a step whose second half needs another button.
//
// Facts gathered during a step (f): sales, nopes (refusals by reason), waveStarts, waveEnds, and
// counts of what the shoppers did: kid (a child escaped), crawl (a mom crawled), mess (a teenager
// spilled), bolt (a guide dog bolted), slip (a dad slipped), smashed (a gym bro wrecked something;
// smashedCrate for crate stacks), rebuilt (the Rebuild button put something back).
import { queueTrainingWave, setTrainingCash, levelIn, maxIn, TUNE } from '../sim/index.js';

const S = 1; // facing south
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
const DAD_FORK = [12, 6]; // covers the dad short cut over the belts

// Part 2. Where things go was chosen by playing each lesson across many random seeds (see
// test/tutorial.test.js): the claims in each lesson's text hold whatever the seed.
// Past the gap: it covers the way out of the gap from 6 tiles off, so far back that no Karen gets
// within her 2.5 tiles of it.
const KAREN_FORK = [17, 12];
const FORK_UP = 2; // the damage level the guide dog and scooter lesson asks for
const MOM_FORK = [3, 5]; // reaches the entrance, so it hits a mom the moment she walks in
// By the entrance: shoppers coming in must walk round these, a gym bro walks through one. (This
// lesson comes after the moms: with these crates in place, every mom would walk past the forklift
// on the dad short cut, which can finish her before her child has had time to get out.)
const DOOR_CRATES = [[2, 7], [2, 8], [1, 9]];

/** Marks for a list of [x, y, kind, label] wanted buildings that are not correctly in place yet. */
function wanted(s, list) {
  const out = [];
  for (const [x, y, k, d, label] of list) if (!is(s, x, y, k, d)) out.push({ x, y, label });
  return out;
}

/** Hint text for the common mistakes on a tile that should hold building k facing d. */
function tileHint(s, x, y, k, d, name) {
  const b = at(s, x, y);
  if (!b) return null;
  if (b.k !== k) return `Something else is on the highlighted tile. Right-click it to remove it, then place the ${name}.`;
  if (d !== undefined && b.d !== d) {
    return `The ${name}'s arrow must point down. Press Esc to put your tool away, point at the ${name}, and press R until the arrow points down.`;
  }
  return null;
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
      'Shoppers come in through the ENTRANCE on the left and walk to the tills on the right. Every shopper who reaches a till takes a refund out of your cash. In a real game, 20 refunds closes the store.',
      'You have two jobs. Build a factory that earns cash. Build security that annoys shoppers until they give up and leave.',
      'This training shift walks you through every building. You cannot lose here, and money is free.',
    ],
    quip: "I'm DEB from HR, and I'll be training you. I've read your file. I've set the bar where you can reach it: on the floor.",
    done: () => false,
    solve: () => [],
  },
  {
    title: 'Start a production line: the Unpacker',
    tool: 'unpacker',
    text: [
      'Every line starts with an Unpacker. It makes a Mystery Box every 2.5 seconds, for free, and pushes it out of the side its arrow points to.',
      'Look at the floor. Patches of it are painted and named: LOADING BAY, PRESS SHOP, GIFT WRAP, SHIPPING. Each of the four factory machines can only be built on its own patch: Unpackers on Loading Bay floor. The patches are apart from each other, so the goods travel between them on belts. Belts, crates and security can go anywhere.',
      'Do this: pick Unpacker in the bar at the bottom (or press 2). Press R until the arrow on the preview points DOWN. Then click the highlighted tile, on the Loading Bay floor.',
    ],
    quip: "It's a box that makes boxes. Try not to overthink it. I know that isn't usually your problem.",
    marks: (s) => wanted(s, [[X, 2, 'unpacker', S, 'Unpacker, arrow down']]),
    done: (s) => is(s, X, 2, 'unpacker', S),
    hint: (s) => tileHint(s, X, 2, 'unpacker', S, 'Unpacker'),
    solve: () => [place('unpacker', X, 2, S)],
  },
  {
    title: 'Belts carry goods',
    tool: 'belt',
    text: [
      'The boxes have nowhere to go yet. Belts move goods in the direction of their arrows.',
      'Do this: pick Belt (press 1). Press the mouse button on the first highlighted tile, drag straight down to the last one, and let go. Belts point the way you drag.',
      'Then watch the boxes ride down and pile up at the end. Goods wait whenever the next tile cannot take them.',
    ],
    quip: "Laying belt. It's the most action this floor has seen in years.",
    marks: (s) => wanted(s, BELTS.map((y, n) => [X, y, 'belt', S, n === 0 ? 'Drag from here' : n === BELTS.length - 1 ? 'to here' : ''])),
    done: (s) => BELTS.every((y) => is(s, X, y, 'belt', S)),
    hint: (s) => {
      for (const y of BELTS) {
        const b = at(s, X, y);
        if (b && b.k === 'belt' && b.d !== S) return 'A belt is pointing the wrong way. Press Esc to put your tool away, point at the highlighted belt, and press R until its arrows point down.';
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
      'Nothing earns money until it falls into a Shipping Chute. A chute takes goods from any side and sells them on the spot. Chutes only go on SHIPPING floor, which is why the belt had to come all this way.',
      'Do this: pick Chute (press 5) and click the highlighted tile at the end of the belt.',
      'Then watch the cash at the top left. Each Mystery Box sells for $2.',
    ],
    quip: "Two dollars a box. At that rate you'll afford my respect in about nine hundred years.",
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
      'A Press turns a Mystery Box ($2) into a Gadget ($8). It only goes on PRESS SHOP floor. Machines take goods in from the back or the sides, and push the result out of the side their arrow points to.',
      'Do this: right-click the highlighted belt to remove it. Then pick Press (press 3), make sure its arrow points DOWN (press R to turn it), and click the same tile.',
      'Then wait for a Gadget to reach the chute.',
    ],
    quip: "It crushes a box into something people actually want. I'd run you through it, but it doesn't take your size.",
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
      'A Packer turns a Gadget ($8) into a Gift Set ($15). It only goes on GIFT WRAP floor. It only accepts Gadgets, so it has to come somewhere after the Press.',
      'Do this: right-click the highlighted belt, then put a Packer (press 4) there with its arrow pointing DOWN.',
      'That makes a complete production line: Unpacker, Press, Packer, Chute. In a real game you will want several.',
    ],
    quip: 'Same Gadget, nicer box, more than double the price. Now you understand retail. And dating.',
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
      'The yellow dashed line is the route shoppers will walk from the doors to the tills. It is always drawn while you build.',
      'Shoppers cannot walk through belts, machines or crates, so everything you build bends the route. Your production line is already a wall: see how the yellow line goes around it.',
      'A longer route gives your security more time to work on them.',
    ],
    quip: "They can't go through it, so they go around it. Much like how your colleagues treat you.",
    done: () => false,
    solve: () => [],
  },
  {
    title: 'Close the gaps: Crates',
    tool: 'crate',
    text: [
      'A Crate Stack is the cheapest wall there is. It does nothing else.',
      'Do this: pick Crates (press 6) and click the three highlighted tiles, above and below your line. Watch the yellow route change as you go.',
    ],
    quip: 'Crates. The construction equivalent of a shrug.',
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
      'There is now exactly one gap left, at the bottom of your wall.',
      'Do this: try to put a Crate in the highlighted gap.',
    ],
    quip: 'Try it. Go on. I enjoy saying no to you.',
    marks: (s, f) => (f.nopes.blocked ? [] : [{ x: GAP[0], y: GAP[1], label: 'Try a Crate here' }]),
    done: (s, f) => f.nopes.blocked >= 1,
    solve: () => [place('crate', GAP[0], GAP[1])],
  },
  {
    title: 'Security: the Pepper Sprinkler',
    tool: 'sprinkler',
    wave: [{ k: 'clipper', n: 3, gap: 1, at: 0 }],
    text: [
      'Refused, as promised: shoppers must always have a way through. A one-tile gap is the best you can do, and it is exactly where security belongs.',
      'Shoppers do not have health. They have patience, the bar above their heads. Security wears it down, and when it runs out they storm off and you keep your cash.',
      'A Pepper Sprinkler hits everyone within about 2 tiles, twice a second.',
      'Do this: pick Sprinkler (press 7) and click the highlighted tile beside the gap. The circle shows its reach. Then press OPEN THE DOORS at the top. Three Coupon Clippers will come in.',
    ],
    quip: 'Pepper spray. HR would object, but HR is me, and I love it.',
    marks: (s) => wanted(s, [[9, 13, 'sprinkler', undefined, 'Sprinkler']]),
    done: (s, f) => is(s, 9, 13, 'sprinkler') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, 9, 13, 'sprinkler', undefined, 'Sprinkler') || (is(s, 9, 13, 'sprinkler') ? openDoorsHint(s, f) : null),
    solve: () => [place('sprinkler', 9, 13), { c: 'start' }],
  },
  {
    title: 'Slow them down: the Wet Floor Sign',
    tool: 'wetfloor',
    wave: [{ k: 'hunter', n: 4, gap: 1.2, at: 0 }],
    text: [
      'Coupon Clippers give up easily. Bargain Hunters have more than twice the patience, so they need longer in the spray.',
      'A Wet Floor Sign halves the speed of shoppers who walk over it. It does not block the route, so it can sit right in the gap.',
      'Do this: put a Wet Floor Sign (press 9) in the gap, and a second Sprinkler (press 7) on the far side of it. Then press OPEN THE DOORS for four Bargain Hunters.',
    ],
    quip: "A yellow plastic sign is about to outperform you. Don't take it personally. Take it as data.",
    marks: (s) => wanted(s, [[GAP[0], GAP[1], 'wetfloor', undefined, 'Wet Floor Sign'], [11, 13, 'sprinkler', undefined, 'Sprinkler']]),
    done: (s, f) => is(s, GAP[0], GAP[1], 'wetfloor') && is(s, 11, 13, 'sprinkler') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, GAP[0], GAP[1], 'wetfloor', undefined, 'Wet Floor Sign') || tileHint(s, 11, 13, 'sprinkler', undefined, 'Sprinkler')
      || (is(s, GAP[0], GAP[1], 'wetfloor') && is(s, 11, 13, 'sprinkler') ? openDoorsHint(s, f) : null),
    solve: () => [place('wetfloor', GAP[0], GAP[1]), place('sprinkler', 11, 13), { c: 'start' }],
  },
  {
    title: 'Make them stop: Free Samples',
    tool: 'samples',
    wave: [{ k: 'hunter', n: 6, gap: 0.8, at: 0 }, { k: 'clipper', n: 4, gap: 0.4, at: 3 }],
    text: [
      'Free Samples make Bargain Hunters and Coupon Clippers within about 2 tiles stop for 2 seconds to eat. Put it where a sprinkler reaches them while they stand there.',
      'Do this: put Free Samples (press 0) on the highlighted tile, then press OPEN THE DOORS. A bigger crowd is coming.',
    ],
    quip: "Cheese on a stick. It's how I'd trap all of you, and I wouldn't even need the stick.",
    marks: (s) => wanted(s, [[8, 13, 'samples', undefined, 'Free Samples']]),
    done: (s, f) => is(s, 8, 13, 'samples') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, 8, 13, 'samples', undefined, 'Free Samples') || (is(s, 8, 13, 'samples') ? openDoorsHint(s, f) : null),
    solve: () => [place('samples', 8, 13), { c: 'start' }],
  },
  {
    title: 'Dads',
    wave: [{ k: 'dad', n: 4, gap: 0.35, at: 0 }],
    text: [
      'Dads are different. A dad wants to get through the line and go home. Dads arrive in single file, walk fast, and ignore Free Samples and Wet Floor Signs.',
      'Worst of all, a dad steps straight over conveyor belts. The blue dashed line is the DAD SHORT CUT: right through your production line.',
      'Do this: press OPEN THE DOORS and watch four dads ignore everything you have built.',
    ],
    quip: "Four dads incoming. Each one told his wife 'two minutes'. Watch them keep their word, for once.",
    mood: 'smug',
    done: (s, f) => f.waveEnds >= 1,
    hint: (s, f) => (f.waveEnds ? null : s.phase === 'wave' ? 'Watch the middle of your production line.' : 'Press OPEN THE DOORS at the top of the screen.'),
    solve: () => [{ c: 'start' }],
  },
  {
    title: 'Stopping dads',
    tool: 'forklift',
    wave: [{ k: 'dad', n: 5, gap: 0.35, at: 0 }],
    text: [
      'Each dad who reaches a till takes $25 and leaves a five-star review, which is somehow worse.',
      'Three things work on a dad. Time: his patience drains by itself every second he is in the store. Solid walls: he cannot climb crates or machines, only belts. And Wet Floor Signs: he ignores the sign, so he has a 1 in 3 chance of slipping and lying there stunned.',
      'A Forklift Turret hits one shopper hard from 6 tiles away.',
      'Do this: put a Forklift (press 8) on the highlighted tile so its circle covers the short cut, and Wet Floor Signs (press 9) on the two tiles in front of the belt. Then OPEN THE DOORS for five more dads.',
    ],
    quip: "The only thing that stops a dad is time. Waste his. You're good at wasting time. I've seen your timesheets.",
    marks: (s) => wanted(s, [[...DAD_FORK, 'forklift', undefined, 'Forklift'], [9, 7, 'wetfloor', undefined, 'Wet Floor'], [9, 8, 'wetfloor', undefined, 'Wet Floor']]),
    done: (s, f) => is(s, ...DAD_FORK, 'forklift') && is(s, 9, 7, 'wetfloor') && is(s, 9, 8, 'wetfloor') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, ...DAD_FORK, 'forklift', undefined, 'Forklift') || tileHint(s, 9, 7, 'wetfloor', undefined, 'Wet Floor Sign')
      || tileHint(s, 9, 8, 'wetfloor', undefined, 'Wet Floor Sign')
      || (is(s, ...DAD_FORK, 'forklift') && is(s, 9, 7, 'wetfloor') && is(s, 9, 8, 'wetfloor') ? openDoorsHint(s, f) : null),
    solve: () => [place('forklift', ...DAD_FORK), place('wetfloor', 9, 7), place('wetfloor', 9, 8), { c: 'start' }],
  },
  {
    title: 'Upgrades, and super shoppers',
    tool: 'upgrade',
    wave: [{ k: 'hunter', n: 3, gap: 1.5, at: 0, sup: 3 }],
    text: [
      'Later in a real game, SUPER versions of every shopper turn up. They are bigger, marked in gold, far more patient, and take a double refund. Three Doorbusters (super Bargain Hunters, with three times the patience) are waiting outside. Your two Sprinklers will not stop them as they are.',
      'Everything you build can be upgraded, in separate tracks: damage, speed, range and durability (how many gym bro hits it survives in a sales event). You buy each track a level at a time, and each level of a track costs more than the one before. Upgrades get more out of the floor space you have already built on. The quick upgrade below buys damage, which is what these Sprinklers need; the number on a building adds up all its levels.',
      // (This sentence and the Forklift one are reworded for touch screens in content/touch.js,
      // which matches them word for word.)
      `Do this: point at each of the two Sprinklers beside the gap and press U three times, until both show Damage ${UP_TO}/${maxIn('sprinkler', 'dmg')}. (Or click a Sprinkler and use its Damage button.) Then press OPEN THE DOORS.`,
    ],
    quip: "It gets bigger if you pay for it. I'm told there are clinics. For you, there's the U key.",
    mood: 'smug',
    marks: (s) => SPRINKLERS.filter(([x, y]) => dmgAt(s, x, y) < UP_TO).map(([x, y]) => ({ x, y, label: 'Upgrade' })),
    done: (s, f) => SPRINKLERS.every(([x, y]) => is(s, x, y, 'sprinkler') && dmgAt(s, x, y) >= UP_TO) && f.waveEnds >= 1,
    hint: (s, f) => {
      for (const [x, y] of SPRINKLERS) {
        if (!is(s, x, y, 'sprinkler')) return 'A Sprinkler is missing beside the gap. Put it back on the highlighted tile first (press 7).';
        if (dmgAt(s, x, y) < UP_TO) return `Point at the highlighted Sprinkler and press U. It has ${dmgAt(s, x, y)} of the ${UP_TO} damage levels it needs.`;
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
      'Part 1 was the buildings. Part 2 is the shoppers who cheat. Each one has a trick that gets past an ordinary defence, and each trick has an answer.',
      'One lesson each: Teenagers, Karens, the Man with a Guide Dog and the Mobility Scooter, Mom and Kid, and Gym Bros. Your layout from part 1 stays, and some lessons ask you to add to it.',
      'Each lesson tells you what the trick is, shows it to you, and has you build the answer.',
    ],
    quip: "Part 2: the difficult customers. They cheat, they scream, and they never finish what they start. You'll feel right at home. So will your ex-wife.",
    mood: 'smug',
    done: () => false,
    solve: () => [],
  },
  {
    title: 'Teenagers',
    wave: [{ k: 'teen', n: 2, gap: 2, at: 0 }, { k: 'hunter', n: 6, gap: 1, at: 3 }],
    text: [
      'A Teenager walks slowly and has about as much patience as a Bargain Hunter, so your security deals with him like anyone else. His trick: every few seconds he spills a slushie, and the puddle stays on the floor for about 12 seconds.',
      'The puddle is a Wet Floor Sign you did not pay for. Every other shopper who walks through it goes at half speed, and dads slip on it. So his mess works for you: the longer he spends in your store, the more of it there is. Do not rush to get rid of him.',
      'Do this: press OPEN THE DOORS. Two Teenagers come in first, with six Bargain Hunters right behind them. Watch the hunters wade through the puddles.',
    ],
    quip: "Teenagers. Slow, sticky, and they leave puddles wherever they stand. I've seen your bathroom floor. You'll feel right at home.",
    mood: 'smug',
    done: (s, f) => f.waveEnds >= 1,
    hint: watchHint('Watch the puddles the teenagers leave, and the hunters slowing down in them.'),
    solve: () => [{ c: 'start' }],
  },
  {
    title: 'Karens',
    tool: 'forklift',
    wave: [{ k: 'karen', n: 3, gap: 1, at: 0 }],
    text: [
      'A Karen has four times the patience of a Bargain Hunter and walks slowly. Her trick: while she demands the manager, every Sprinkler and Forklift within 2½ tiles of her works at half speed. Your cluster at the gap is exactly where she spends longest.',
      'What works: Forklifts. One reaches 6 tiles, more than twice as far as she does, so it can hit her at full speed before she gets close. And a long route, so security all along the way gets a turn, instead of everything hanging on one cluster.',
      'Do this: put a Forklift (press 8) on the highlighted tile, past the gap. Then OPEN THE DOORS for three Karens.',
    ],
    quip: "Three Karens. Each one has the haircut, the sunglasses on her head, and a husband in the car who stopped listening in 2009. Same as yours.",
    mood: 'angry',
    marks: (s) => wanted(s, [[KAREN_FORK[0], KAREN_FORK[1], 'forklift', undefined, 'Forklift']]),
    done: (s, f) => is(s, KAREN_FORK[0], KAREN_FORK[1], 'forklift') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, KAREN_FORK[0], KAREN_FORK[1], 'forklift', undefined, 'Forklift')
      || (is(s, KAREN_FORK[0], KAREN_FORK[1], 'forklift')
        ? watchHint('Watch the sprinklers by the gap slow down while a Karen stands next to them.')(s, f) : null),
    solve: () => [place('forklift', KAREN_FORK[0], KAREN_FORK[1]), { c: 'start' }],
  },
  {
    title: 'Shoppers you cannot slow down',
    tool: 'upgrade',
    // The second scooter is a super one (see the spreading of supers in beginWave).
    wave: [{ k: 'blind', n: 2, gap: 3, at: 0 }, { k: 'scooter', n: 2, gap: 3, at: 1.5, sup: 1 }],
    text: [
      'The Man with a Guide Dog is not slowed by Wet Floor Signs or puddles, and cannot see Free Samples. Pepper spray makes his dog bolt, dragging him along at more than twice the speed: Sprinklers make him faster.',
      'The Mobility Scooter: nothing slows it at all. The second one today is a Turbo Scooter, a super one with more patience and nearly twice the speed. Your Sprinklers alone cannot stop it.',
      'What works on both: plain damage from a Forklift. It hits hard from far away, and it does not spray, so the dog stays calm.',
      `Do this: point at the Forklift you just built past the gap and press U twice, until it shows Damage ${FORK_UP}/${maxIn('forklift', 'dmg')}. (Or click it and use its Damage button.) Then OPEN THE DOORS for two of each.`,
    ],
    quip: "Two blind men and two mobility scooters. Don't feel bad about pepper-spraying them. The dog has already pissed on your sign, and the scooter has more horsepower than your sex life.",
    mood: 'smug',
    marks: (s) => (is(s, KAREN_FORK[0], KAREN_FORK[1], 'forklift') && dmgAt(s, KAREN_FORK[0], KAREN_FORK[1]) >= FORK_UP ? []
      : [{ x: KAREN_FORK[0], y: KAREN_FORK[1], label: is(s, KAREN_FORK[0], KAREN_FORK[1], 'forklift') ? 'Upgrade' : 'Forklift' }]),
    done: (s, f) => is(s, KAREN_FORK[0], KAREN_FORK[1], 'forklift') && dmgAt(s, KAREN_FORK[0], KAREN_FORK[1]) >= FORK_UP && f.waveEnds >= 1,
    hint: (s, f) => {
      const [x, y] = KAREN_FORK;
      if (!is(s, x, y, 'forklift')) return tileHint(s, x, y, 'forklift', undefined, 'Forklift') || 'The Forklift past the gap is missing. Put it back on the highlighted tile first (press 8).';
      if (dmgAt(s, x, y) < FORK_UP) return `Point at the highlighted Forklift and press U. It has ${dmgAt(s, x, y)} of the ${FORK_UP} damage levels it needs.`;
      return watchHint('Watch the dogs bolt when the sprinklers spray them, and the Forklift catch the Turbo Scooter past the gap.')(s, f);
    },
    solve: (s) => [...upTo(s, 'forklift', KAREN_FORK[0], KAREN_FORK[1], FORK_UP), { c: 'start' }],
  },
  {
    title: 'Mom and Kid',
    wave: [{ k: 'mom', n: 3, gap: 3, at: 0 }],
    text: [
      'A Mom and Kid has a child in her cart, and he is the trick. Once, at any moment, he may escape and run ahead, straight through belts, machines and crates, then wait further along the route (never right by the tills). She sprints round the maze to fetch him, ignoring Free Samples, and she will not take a refund without him.',
      'If her patience runs out while he is loose, she does not leave. She crawls to him on her hands and knees, and nothing can hurt her on the way: your security wastes its shots. When she reaches him she gets up with a third of her patience back, but she has left her cart behind and carries him from then on. She can only do that once.',
      'Do this: press OPEN THE DOORS for three moms. Watch for a kid getting loose and running on ahead (usually straight through your production line), and a mom crawling after him.',
    ],
    quip: "Moms. She grew a whole human being and she can't keep him in a shopping cart. Don't judge her. Yours left you at a petrol station on purpose.",
    mood: 'smug',
    done: (s, f) => f.waveEnds >= 1 && f.kid >= 1 && f.crawl >= 1,
    hint: (s, f) => (s.phase === 'wave' ? 'Watch for a kid running on ahead, and a mom crawling after him.'
      : f.waveEnds ? 'No mom crawled that time. Press OPEN THE DOORS to send them in again.'
        : 'Press OPEN THE DOORS at the top of the screen.'),
    solve: () => [{ c: 'start' }],
  },
  {
    title: 'Finish her while the kid is in the cart',
    tool: 'forklift',
    wave: [{ k: 'mom', n: 3, gap: 4, at: 0 }],
    text: [
      'So finish a mom before her child gets out. He stays in the cart for about 2 seconds after she walks in; after that he can go at any moment.',
      'Here, two Forklift hits finish a mom, and they come 1.6 seconds apart, so a Forklift that reaches the entrance finishes her before the kid can get out. In a real game shoppers get more patient every sales event: put your hardest-hitting security where she walks in.',
      'Do this: put a Forklift (press 8) on the highlighted tile by the entrance. Then OPEN THE DOORS for three more moms.',
    ],
    quip: "Finish her before the kid gets out. Two seconds, start to finish. That's your personal best anyway, so I know you can do it.",
    mood: 'smug',
    marks: (s) => wanted(s, [[MOM_FORK[0], MOM_FORK[1], 'forklift', undefined, 'Forklift']]),
    done: (s, f) => is(s, MOM_FORK[0], MOM_FORK[1], 'forklift') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, MOM_FORK[0], MOM_FORK[1], 'forklift', undefined, 'Forklift')
      || (is(s, MOM_FORK[0], MOM_FORK[1], 'forklift') ? watchHint('Watch the Forklift finish each mom at the door.')(s, f) : null),
    solve: () => [place('forklift', MOM_FORK[0], MOM_FORK[1]), { c: 'start' }],
  },
  {
    title: 'Gym Bros',
    tool: (s, f) => (f.waveEnds && s.rubble.length ? 'rebuild' : 'crate'),
    wave: [{ k: 'gymbro', n: 1, gap: 1, at: 0 }],
    text: [
      'A Gym Bro does not go round Crate Stacks. He walks straight through them, smashing any in his way, and the ones beside him as he passes. Now and then he smashes something else he passes, too: a belt, a machine, a sign. Each thing you build survives one hit in a sales event (more for the biggest security), and one more for every level of durability you buy it.',
      `But he only has ${['no', 'one', 'two', 'three', 'four'][TUNE.smashMax] ?? TUNE.smashMax} hits in him a visit, and needs ${TUNE.smashWait} seconds to get his breath back after each. While he does, and once he is spent, he walks round crates like anyone else. A hit that durability soaks up still uses one of his.`,
      'Do this: put Crates (press 6) on the three highlighted tiles by the entrance, so shoppers have to walk round. Then OPEN THE DOORS for one Gym Bro.',
      'Do this: when he has gone, press B (or the Rebuild button in the build bar) to put back everything he wrecked, upgrades and all, for half of what you had spent on it.',
      `Sick of pressing it? Shift+B switches on auto-rebuild: the store does it for you, at the same price, ${TUNE.autoRebuildSecs} seconds after each wreck. The wait is on purpose: the shoppers behind him get through the hole first.`,
    ],
    quip: "Gym bro. Skips leg day, never skips your crates. He grunts like that in bed, too. Ask your wife.",
    mood: 'angry',
    marks: (s) => {
      if (s.phase === 'wave') return [];
      // The tiles are next to each other, so only the first of each gets a caption.
      const out = s.rubble.map(({ i }, n) => ({ x: i % s.w, y: (i / s.w) | 0, label: n ? '' : 'Wrecked' }));
      const wrecks = out.length;
      for (const [x, y] of DOOR_CRATES) {
        if (!is(s, x, y, 'crate') && !out.some((m) => m.x === x && m.y === y)) out.push({ x, y, label: out.length > wrecks ? '' : 'Crates' });
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
      'That is every building and every kind of shopper. In a real game, cash is limited, each player has his own (income is split evenly), the store is bigger, there are 20 sales events with a short build break between them, and shoppers get more patient every event.',
      'The shoppers from part 2 arrive a few events in, one kind at a time, and DEB reminds you of each one the first time it turns up. A few more you will only meet on the job: Day Drinkers, Stray Dogs, an Exhibitionist and Cosplayers. Later still come SUPER versions of every shopper. The ? at the top right lists them all, with each trick and what beats it.',
      'Two pieces of security were not in this shift. The Barcode Laser is three tiles long and fires straight ahead through everything, hitting every shopper in line. The TV Salesman takes two tiles by two and demonstrates knives on a television: shoppers walking past may come over to watch, or hurry away from him.',
      'A real store is bigger than this one. Move the view with W, A, S and D, zoom with the mouse wheel, press F to see the whole floor and H to go back to your entrance. With friends, each of you gets your own entrance to look after.',
      'A good opening: one production line built as a wall, one gap, sprinklers and a wet floor sign at the gap, and something covering the dad short cut. Then forklifts along the rest of the route, before the Karens and moms arrive.',
      'Pick any button in the build bar to see what it does and how to use it. You can stay here and practise for as long as you like.',
    ],
    quip: "Training complete. You've met the minimum standard. Briefly, and from below.",
    mood: 'smug',
    done: () => false,
    solve: () => [],
  },
];

/** Where part 2, "The difficult customers", starts. */
export const PART_TWO = STEPS.findIndex((st) => st.part2);

const freshFacts = () => ({
  sales: { total: 0, box: 0, gadget: 0, giftset: 0 }, nopes: {}, waveStarts: 0, waveEnds: 0,
  kid: 0, crawl: 0, mess: 0, bolt: 0, slip: 0, smashed: 0, smashedCrate: 0, rebuilt: 0,
});
/** Simulation events that are simply counted into the facts of the same name. */
const COUNTED = new Set(['kid', 'crawl', 'mess', 'bolt', 'slip']);

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
