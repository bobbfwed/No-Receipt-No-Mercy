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
//   manual        the step is only an explanation; it ends when the player presses Next
import { W, queueTrainingWave, setTrainingCash } from '../sim/index.js';

const S = 1; // facing south
const X = 10; // the column the production line runs down
const at = (s, x, y) => s.grid[y * W + x];
const is = (s, x, y, k, d) => { const b = at(s, x, y); return !!b && b.k === k && (d === undefined || b.d === d); };
const place = (k, x, y, d = 0) => ({ c: 'place', k, x, y, d });
const remove = (x, y) => ({ c: 'remove', x, y });

const BELTS = [3, 4, 5, 6, 7, 8, 9, 10]; // rows of the belt run under the unpacker
const CRATES = [[X, 1], [X, 12], [X, 13]];
const GAP = [X, 14];

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

export const STEPS = [
  {
    title: 'Welcome to the Returns Department',
    manual: true,
    text: [
      'Shoppers come in through the ENTRANCE on the left and walk to the tills on the right. Every shopper who reaches a till takes a refund out of your cash. In a real game, 40 refunds closes the store.',
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
      'Do this: pick Unpacker in the bar at the bottom (or press 2). Press R until the arrow on the preview points DOWN. Then click the highlighted tile.',
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
      'Nothing earns money until it falls into a Shipping Chute. A chute takes goods from any side and sells them on the spot.',
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
      'A Press turns a Mystery Box ($2) into a Gadget ($7). Machines take goods in from the back or the sides, and push the result out of the side their arrow points to.',
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
      'A Packer turns a Gadget ($7) into a Gift Set ($16). It only accepts Gadgets, so it has to come somewhere after the Press.',
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
      'A Forklift Turret hits one shopper hard from 5 tiles away.',
      'Do this: put a Forklift (press 8) on the highlighted tile so its circle covers the short cut, and Wet Floor Signs (press 9) on the two tiles in front of the belt. Then OPEN THE DOORS for five more dads.',
    ],
    quip: "The only thing that stops a dad is time. Waste his. You're good at wasting time. I've seen your timesheets.",
    marks: (s) => wanted(s, [[12, 6, 'forklift', undefined, 'Forklift'], [9, 7, 'wetfloor', undefined, 'Wet Floor'], [9, 8, 'wetfloor', undefined, 'Wet Floor']]),
    done: (s, f) => is(s, 12, 6, 'forklift') && is(s, 9, 7, 'wetfloor') && is(s, 9, 8, 'wetfloor') && f.waveEnds >= 1,
    hint: (s, f) => tileHint(s, 12, 6, 'forklift', undefined, 'Forklift') || tileHint(s, 9, 7, 'wetfloor', undefined, 'Wet Floor Sign')
      || tileHint(s, 9, 8, 'wetfloor', undefined, 'Wet Floor Sign')
      || (is(s, 12, 6, 'forklift') && is(s, 9, 7, 'wetfloor') && is(s, 9, 8, 'wetfloor') ? openDoorsHint(s, f) : null),
    solve: () => [place('forklift', 12, 6), place('wetfloor', 9, 7), place('wetfloor', 9, 8), { c: 'start' }],
  },
  {
    title: 'Training complete',
    manual: true,
    last: true,
    text: [
      'That is every building. In a real game, cash is limited and shared by the whole team, there are 20 sales events with a short build break between them, and shoppers get more patient every event. Karens slow down nearby security. Mobility scooters cannot be slowed.',
      'A good opening: one production line built as a wall, one gap, sprinklers and a wet floor sign at the gap, and something covering the dad short cut.',
      'Point at any button in the build bar to see what it does. The ? at the top right lists the controls. You can stay here and practise for as long as you like.',
    ],
    quip: "Training complete. You've met the minimum standard. Briefly, and from below.",
    mood: 'smug',
    done: () => false,
    solve: () => [],
  },
];

const freshFacts = () => ({ sales: { total: 0, box: 0, gadget: 0, giftset: 0 }, nopes: {}, waveEnds: 0 });

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
      if (e.e === 'waveEnd') {
        facts.waveEnds++;
        lastWave = { stopped: session.state.ws.stopped, escaped: session.state.ws.escaped };
      }
    }
  });
  const offNope = session.on('nope', (m) => { facts.nopes[m.why] = (facts.nopes[m.why] || 0) + 1; });

  function enter(i) {
    index = Math.max(0, Math.min(STEPS.length - 1, i));
    facts = freshFacts();
    facts.nopes.blocked = 0;
    const st = STEPS[index];
    const s = session.state;
    setTrainingCash(s, Math.max(s.cash, 1500)); // money is free in training
    if (st.wave) queueTrainingWave(s, st.wave);
    if (st.quip) session.emit('say', { t: 'say', who: 'DEB (HR)', mood: st.mood || 'flat', text: st.quip });
    onChange();
  }

  const api = {
    get index() { return index; },
    get total() { return STEPS.length; },
    get step() { return STEPS[index]; },
    get lastWave() { return lastWave; },
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
      if (index < 0) enter(0);
      while (index < target) {
        const st = STEPS[index];
        for (const cmd of st.solve(session.state)) session.send(cmd);
        if (!st.manual) {
          for (let n = 0; n < 240 && !st.done(session.state, facts); n++) session.fastForward(15); // up to 2 minutes
          if (!st.done(session.state, facts)) stuck.push(index);
        }
        enter(index + 1);
      }
      return stuck;
    },
    destroy() { offFx(); offNope(); },
  };
  return api;
}
