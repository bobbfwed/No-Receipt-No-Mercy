// Plain explanations of what each building does and how to use it. Shown in the info card when a
// building is picked in the build bar, and used by the tutorial. These are the "manual": keep them
// clear first and funny second. If a number in src/sim/constants.js changes, update the text here
// (the gym bro's limits are read from the rules below).
import { TUNE, SUPERS, BACK, BUILD, TICK_HZ } from '../sim/index.js';

/** A small count as a word ("two"), for text that reads better that way. */
const word = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const ROID = SUPERS.gymbro;
/** A time in seconds, as words: "2 seconds". */
const secs = (n) => `${n} second${n === 1 ? '' : 's'}`;
/** Reinforcing a Crate Stack (0.4): its levels and the first one's price, from the rules. */
const RF = BUILD.crate.reinforce;

/** Per building: `does` = what it is for, `use` = how to place it so it works. */
export const HOW = {
  crate: {
    does: `A wall. No Dumbwaiter, no supplies, nothing for a thief to steal. Pay to reinforce it (from $${RF.cost}, up to ${word(RF.max)} levels, each dearer than the last) and it takes one more gym bro hit a sales event for each level.`,
    use: 'Use it to shape the route shoppers must walk: the longer the walk past your security, the better. Nothing in The Back is in anyone\'s way, so crates and security are the whole maze for everyone but dads, and crates are the cheap part of it.',
    maze: 'Blocks every shopper but two: a dad walks straight through it (only walls and Razor Wire stop him), and a gym bro with a hit left in him smashes through.',
  },
  sprinkler: {
    does: 'Wears down the patience of up to four shoppers within about 2 tiles, twice a second. In a crowd it picks the four nearest the tills.',
    use: 'Short range, so put it right beside the route, best of all where shoppers are slowed or stopped. Supplies from The Back make it hit harder, spray faster and reach further.',
    maze: 'Blocks all shoppers.',
  },
  forklift: {
    does: 'Hits one shopper hard from up to 6 tiles away. It always picks the shopper closest to the tills.',
    use: 'Put it where its circle covers a long stretch of the route. Supplies from The Back make it hit harder, fire faster and reach further.',
    maze: 'Blocks all shoppers.',
  },
  wetfloor: {
    does: 'Shoppers crossing it walk at half speed. Dads ignore the sign and have a 1 in 3 chance of slipping and lying stunned.',
    use: 'It does not block the way, so it can sit right in a gap, next to a sprinkler. Mobility scooters are not affected. Bottled Spite from The Back makes it slower to cross and slippier.',
    maze: 'Does not block anyone.',
  },
  samples: {
    does: 'Bargain Hunters, Coupon Clippers and Pregnant Ladies within about 2 tiles stop for 2 seconds to eat.',
    use: 'Put sprinklers beside it so they are sprayed while they stand there. Dads, Karens and scooters do not stop. Supplies from The Back make them stop for longer, from further away.',
    maze: 'Blocks all shoppers.',
  },
  railgun: {
    does: 'Fires a beam straight out of its front end every 4.5 seconds. The beam goes through shoppers, buildings and walls, and hits every shopper on the line for 10 tiles.',
    use: 'It is three tiles long and fires the way its arrow points: press R before placing to turn it. Aim it down a long straight stretch of the route, where a whole queue is in line. It only fires when someone is in the beam. It is the one way to finish a Pregnant Lady without her popping.',
    maze: 'Blocks all shoppers.',
  },
  salesman: {
    does: 'A man demonstrating knives and barbecues on a television. Each shopper who comes within 4.5 tiles may walk over to the stand and watch for 2.5 seconds, or hurry past to get away from him. If something is in his way he watches from as near as he can get. Runaway kids usually stop to watch the television.',
    use: 'It takes up two tiles by two. It is the one thing that makes some dads stop (1 in 5), but more of them speed up (3 in 10), so put damage round the stand, where they stop, not after it. Mobility scooters nearly always stop. Bottled Spite from The Back makes more shoppers stop, for longer, and fewer hurry.',
    maze: 'Blocks all shoppers.',
  },
};

/**
 * The Back's parts (0.4), for the same info card when one is picked on The Back's build bar, and
 * for the Employee Handbook (which also shows the two nobody buys: the Returns Drop and the
 * Dumbwaiter). Nothing in The Back blocks shoppers, so they have no `maze` line. The numbers are
 * read from BACK in constants.js.
 */
export const BACK_HOW = {
  drop: {
    does: 'Where everything the customers dumped on the returns desk comes down: one piece of junk at a time, onto the tile in front of it. It waits while that tile has no room. The store puts them where it likes and you cannot move one, so plan round them.',
    use: 'Run a belt away from the side with the arrow. It turns like anything else in The Back, and anyone may turn it. MORE JUNK on its card makes it faster, for a price, a few times over.',
  },
  conv: {
    does: `Carries whatever is put on it, in the direction of its arrows: ${word((BACK.step * TICK_HZ) / BACK.sub)} tiles a second, ${word(Math.floor(BACK.sub / BACK.gap))} items to a tile. Returned junk comes down the Returns Drops onto belts.`,
    use: 'Drag to lay a line: the belts follow your drag and go round corners by themselves. Items wait at the end of a belt that has nowhere to go. Turning a belt is free: drag belt over it again in the new direction, or point at it and press R.',
  },
  split: {
    does: 'Takes items from the belt behind it and deals them out in turn to the front, the left and the right, skipping any way that is full or has nothing to take them.',
    use: 'Run a belt into its back and lay belts away from any of its three other sides. One line in, up to three out, shared evenly. Press R before placing to turn it.',
  },
  over: {
    does: 'Two belts crossing without mixing: one runs east-west underneath, the other north-south over the top.',
    use: 'Put it where two lines must cross and run belts into and out of it on both lines. Each lane goes the way the belt feeding it goes.',
  },
  intern: {
    does: 'Stands between two tiles. Picks the first item off the belt behind him that the tile in front of him will take, and hands it over. He is not paid, and it shows.',
    use: 'Put him beside a belt, facing away from it, with what you want fed in front of him: another belt, a Splitter, a Clearance Bin. Press R before placing to turn it.',
  },
  bin: {
    does: 'Takes anything from any side and gets rid of it. Junk pays nothing; leftover supplies pay pennies.',
    use: 'Put one at the end of a line, so the line keeps moving instead of jamming up when nothing downstream wants what is on it.',
  },
  // The machines (0.4, stage 3). Each takes junk and makes one supply at Store Brand.
  still: {
    does: `Takes returned junk and boils it down into Bottled Spite, one every ${secs(BACK.makeSecs)}. Security stocked with Spite hits harder: Store Brand works like ${BACK.tierLevel[1]} levels of damage, and each tier up from a Rebrander adds ${BACK.tierLevel[2] - BACK.tierLevel[1]} more.`,
    use: 'Feed junk into its back or either side; the Spite comes out of the side with the arrow. Run a belt from there into a Dumbwaiter, the hatch under every security building, or past an Unpaid Intern standing beside one. Press R before placing to turn it.',
  },
  cannery: {
    does: `Takes returned junk and cans it as Rage Cola, one every ${secs(BACK.makeSecs)}. Security on Cola fires faster: Store Brand works like ${BACK.tierLevel[1]} levels of speed.`,
    use: 'Junk in at the back or the sides, Cola out of the side with the arrow, and on to a Dumbwaiter. Press R before placing to turn it.',
  },
  spooler: {
    does: `Takes returned junk and winds it into Extension Cord, one every ${secs(BACK.makeSecs)}. Security plugged into Cord reaches further: Store Brand works like ${BACK.tierLevel[1]} levels of range.`,
    use: 'Junk in at the back or the sides, Cord out of the side with the arrow, and on to a Dumbwaiter. Press R before placing to turn it.',
  },
  winder: {
    does: `Takes returned junk and rolls it into Duct Tape, one every ${secs(BACK.makeSecs)}. A building with tape in it shrugs off gym bro hits: a roll of Store Brand soaks up ${BACK.tapeHits[1]}, Platinum ${BACK.tapeHits[4]}.`,
    use: 'Junk in at the back or the sides, Tape out of the side with the arrow. Send it to whatever the gym bros keep smashing. Press R before placing to turn it.',
  },
  bender: {
    does: `Takes returned junk and twists it into Razor Wire, one every ${secs(BACK.makeSecs)}. It is the one thing that stops a dad: a security building given a wire direction keeps dads off its own tiles and the ${BACK.wireReach} beyond it that way while it holds Razor Wire, and each dad it turns away uses some up.`,
    use: 'Junk in at the back or the sides, Wire out of the side with the arrow. Press R before placing to turn it.',
  },
  rebrand: {
    does: `Takes any supply below Platinum and puts the same thing out one tier up, with a better label: Store Brand to Name Brand in ${secs(BACK.rebrandSecs[1])}, Name Brand to Premium in ${secs(BACK.rebrandSecs[2])}, Premium to Platinum in ${secs(BACK.rebrandSecs[3])}. It never takes junk.`,
    use: 'Put it in a supply line after a machine. Two in a row make Premium, three Platinum, but each pass is slower than the last. In at the back or the sides, out of the side with the arrow. Press R before placing to turn it.',
  },
  lift: {
    does: 'The hatch under every tile of a security building (not a Crate Stack). It takes the supplies that building uses, from any side, and sends them up to it, until it is full. It comes and goes with the building, and so does whatever is in it.',
    use: 'Nothing to buy: build security upstairs and its Dumbwaiters appear down here. Point a belt, a machine or an Unpaid Intern at one. It only takes what its building can use, so send the rest on past it.',
  },
};

/**
 * The shoppers: `trick` = what makes this one different, `beat` = what works against it.
 * Shown in the in-game help, in the order they first appear.
 */
export const SHOPPER_HELP = {
  hunter: { trick: 'The ordinary shopper. Stops for free samples, and helps himself to a unit of stock from any security building he walks past: whatever supply it holds the most of.', beat: 'Anything. Slow them at a gap and spray them. Hit them before they reach your best-stocked buildings: a crowd walking along a stocked wall strips it bare.' },
  dad: { trick: 'Arrives in a single-file line, walks fast and ignores free samples. He wants one thing, the tills, and walks straight through your crates and security to get there: only the store\'s walls and Razor Wire stop him.', beat: 'Razor Wire from The Back: a stocked wire turns him away, so lay it to make his walk long, as his patience drains by itself. Guns along his straight line. He ignores wet floor signs and slips on them. An Exhibitionist stops him dead, and so, now and then, does a TV Salesman.' },
  clipper: { trick: 'Fast, weak, and there are a lot of them.', beat: 'Sprinklers. Anything that hits a crowd.' },
  mom: { trick: 'Her kid escapes the cart and runs ahead, straight through your crates and security, then waits further along the route. She sprints round the maze to reach him and ignores free samples on the way. If her patience runs out while he is loose, she does not leave: she crawls to him, nothing can hurt her, and security wastes its shots on her. When she reaches him she gets up with a third of her patience back, without her cart, and carries him from then on. He runs away once only, he never runs all the way to the tills, and she will not take her refund without him.', beat: 'Finish her while the kid is in the cart. Forklifts and wet floor signs. Samples only work while the kid is in the cart. A TV Salesman stops most runaway kids.' },
  teen: { trick: 'Slow. Spills a slushie every few seconds; the mess slows every other shopper and dads slip on it.', beat: 'Let him loiter in range. His messes work for you.' },
  karen: { trick: 'Enormous patience. Security near her works at half speed while she asks for the manager.', beat: 'Long routes and forklifts out of her reach. Do not rely on one cluster of towers.' },
  blind: { trick: 'The guide dog steers him around puddles and messes, and he cannot see free samples. Pepper spray makes the dog bolt, dragging him along fast.', beat: 'Forklifts. Sprinklers make him faster.' },
  scooter: { trick: 'Cannot be slowed by anything.', beat: 'Raw damage over a long route.' },
  gymbro: {
    trick: `Walks straight through crate stacks, wrecking any in his way and any he passes, and now and then something else beside him: a sprinkler, a sample table, a forklift. But he only has ${word(TUNE.smashMax)} hits in him a visit, and needs ${TUNE.smashWait} seconds to get his breath back after each. While he does, and once he is spent, he walks round crates like anyone else.`,
    beat: 'Stop him early, before he reaches anything expensive. Every hit he lands counts, even one that Duct Tape from The Back soaks up (the damage is forgotten every sales event), so a taped-up building where he first meets your maze takes a hit off him for nothing. A crate stack goes down in one hit, unless you have paid to reinforce it: one more hit for each level. Press B to rebuild what he wrecked for half of what you paid.',
  },
  drinker: { trick: 'Weaves along at a speed that keeps changing. At corners of the route he may fall over and lie there for 4 seconds, and everyone else has to squeeze past him at a third of their speed.', beat: 'Corners near your security: when he goes down, the queue behind him stands in the spray.' },
  dog: { trick: 'Fast, with little patience. Pees on any security it passes (not wet floor signs), which switches that building off for 6 seconds.', beat: 'Stop it before it reaches your best security. Spread security out so one dog cannot switch off a whole gap.' },
  flasher: { trick: 'A woman in a bathrobe who opens it every few seconds. Dads and teenagers within 2.5 tiles stop and stare for 2 seconds.', beat: 'She helps you: let her walk with the dad line, in range of something that hurts.' },
  preggo: { trick: 'Very pregnant: slow, with a lot of patience, and she stops for every free sample (she is eating for thirteen). When her patience runs out she does not leave. She pops, and a dozen babies run for the tills from where she stood: very fast, with very little patience, and nothing distracts them. A baby at a till takes $5 but is not a refund toward the limit. If she reaches a till herself she takes one refund and nothing pops.', beat: 'Finish her with a Barcode Laser: if its beam takes her last patience, no babies come out. Otherwise wear her down early, so the babies have the whole maze to run, with sprinklers and wet floor signs along it to catch them.' },
  trader: {
    trick: 'Grown men who collect Mythic Bastards cards. He never comes on his own: at a Midnight Release a mob of a dozen or more pile in through one entrance at once. Each one is weak, but they all reach the tills together. Walking past your security he rips out its best-branded stock (he is the one thief who goes for the Platinum), then stands there gloating over it while every Card Trader near him stops to see what he pulled.',
    beat: 'Sprinklers, where the mob bunches up. A rip stops a whole knot of them, so a cheaply stocked building near their entrance is bait: they stop, the sprinklers do the rest. Keep your Platinum away from the door the mob comes through.',
  },
  cosplay: { trick: 'A big costume and a lot of patience. Shots from sprinklers, forklifts and barcode lasers that would hit a shopper standing next to him hit him instead.', beat: 'Wear him down while he is alone, or separate him from the crowd: free samples and salesmen stop the others while he walks on.' },
};

/**
 * Why a shopper is weak to one kind of security, or tough against one (`weak` and `tough` on
 * SHOPPERS in constants.js). Only the reason is here: which building and by how much come from the
 * rules, in src/content/facts.js (edgeFacts), so the numbers cannot drift. A kind with neither has
 * no entry; a new `weak` or `tough` needs its reason added here (a test checks).
 */
export const EDGE_HELP = {
  clipper: { weak: 'The laser scans her coupons, and every last one of them expired in 2019. She takes it personally.' },
  dad: { tough: 'It\'s only water. He has been pissed on by a newborn at three in the morning; your sprinkler is a light breeze.' },
  karen: {
    weak: 'The hair. Four hundred dollars of highlights, and you just hosed them.',
    tough: 'She has argued with scanners before. The scanners apologised.',
  },
  scooter: { weak: 'The bigger vehicle always wins, and grandma knows it.' },
  teen: { weak: 'His phone gets wet. It is the worst thing that has ever happened to him, and he will be posting about it.' },
  blind: { tough: 'He cannot see the red light, so it cannot ruin his day.' },
  gymbro: {
    weak: 'The spray tan runs, and now everyone can see he is actually beige.',
    tough: 'He benches more than a pallet, and he will tell you so while it hits him.',
  },
  drinker: {
    weak: 'He can barely stay upright on a dry floor. On a wet one he takes the scenic route, on all fours.',
    tough: 'He thinks it is raining, and he is delighted about it.',
  },
  dog: {
    weak: 'Hates baths. Spray him once and he acts like you tried to drown him.',
    tough: 'Too small to hit properly: the forks keep going right over his head.',
  },
  trader: { weak: 'Wet cards are not mint. He will cry, actually cry, and the queue will hold a moment of silence.' },
  cosplay: {
    weak: 'He cannot see out of the helmet, so he never sees the pallet coming.',
    tough: 'The foam armour is "rated for lasers". He made it himself, and he will explain the build for an hour.',
  },
};

/**
 * The boss (BOSS in constants.js; not one of SHOPPERS). His numbers are added where he is shown,
 * from src/content/facts.js, so this text has none.
 */
export const BOSS_HELP = {
  trick: 'Head Office sends a manager to find out why refunds are down. He walks in a little after the doors open, slowly, with enormous patience, and nothing slows or stops him: not wet floors, messes, free samples, a drunk on the floor, the TV Salesman or a naked woman. Every few seconds he gives a pep talk, and every shopper near him gets some patience back. He gets a grander title, and more patience, every time he comes back.',
  beat: 'Raw damage along a long route. Get him away from the crowd, so his pep talks have nobody to cheer up, and do not let him reach a till: he counts as several refunds at once and takes a huge one. Drive him out and the store gets a bounty.',
};

/**
 * The super version of each shopper: what is worse about it. Shown under the normal one in the
 * in-game help. If a number in SHOPPERS[...].sup changes, update the text here.
 */
export const SUPER_HELP = {
  hunter: 'Three times the patience, and quicker.',
  dad: 'Two and a half times the patience, faster, never slips, and his patience drains half as fast.',
  clipper: 'Two and a half times the patience and much faster.',
  mom: 'Twice the patience. Sprints twice as fast after a kid who runs twice as far, and he can run away twice. She keeps her cart until the second time she goes down.',
  teen: 'Twice the patience. Three times the mess, and it stays twice as long.',
  karen: 'Four times the patience. Slows security twice as far away, to a quarter speed.',
  blind: 'Two and a half times the patience. The dogs bolt from forklift hits too, further and faster.',
  scooter: 'Two and a half times the patience and nearly twice the speed.',
  gymbro: `Two and a half times the patience, and faster. ${cap(word(ROID.smashMax))} hits instead of ${word(TUNE.smashMax)}, only ${ROID.smashWait} seconds apart, and he goes for things that are not crates far more often.`,
  drinker: 'Two and a half times the patience. Falls over at half the corners and stays down 6 seconds.',
  dog: 'Two and a half times the patience and faster. Switches security off for 12 seconds, from further away, and more often.',
  flasher: 'Two and a half times the patience. No robe at all: stops dads and teenagers within 4 tiles for 3 seconds, every few seconds.',
  preggo: 'Two and a half times the patience, and two dozen babies when she pops. A Barcode Laser still stops all of them.',
  trader: 'Two and a half times the patience, and a double refund. He pushes a hand truck stacked with sealed boxes he bought this morning and will sell online tonight for four times the price.',
  cosplay: 'Two and a half times the patience. Shields shoppers within 1.6 tiles and takes only half of what he soaks up.',
};

/** What the Rebuild button does (0.3.04: the money goes when you press; the building when it can). */
export const HOW_REBUILD = {
  does: 'Pays to put back everything of yours that gym bros have wrecked, oldest first, each for half of what you paid for it. Its supplies are gone: The Back has to stock it again.',
  use: 'Press it (or B) once. The money is taken there and then. Each wreck goes back at once, or as soon as nothing is in the way (a shopper standing in the hole, or the crowd it would wall in); an orange cone marks one that is paid for and waiting. A wreck you cannot afford in full is not ordered: press again when you can. Anything wrecked after you press needs another press. Building the same thing by hand on its rubble gets the same deal.',
  maze: '',
};

/** What the Wire tool does (0.4, stage 4b): Razor Wire's direction, for the same info card. */
export const HOW_WIRE = {
  does: `Lays Razor Wire from a security building: over the building and the ${word(BACK.wireReach)} tiles beyond it one way: north, east, south or west on the floor, whichever way the building itself faces. While the building holds Razor Wire from The Back, no dad sets foot on those tiles; empty, the wire is only planned and stops nobody. Free, and anyone can change anyone's, any time.`,
  use: 'Click a security building to step its wire north, east, south, west, then off, or press on it and drag the way the wire should run. Right-click takes it off. Lay it across the blue DADS line; the faint DADS, IF WIRED line shows where they will walk once every planned wire is stocked. A wire that would cut the dads off from the tills is refused.',
  maze: '',
};

/** What the Reinforce tool does (0.4, stage 4b): a Crate Stack's levels, for the same info card. */
export const HOW_REINFORCE = {
  does: `Makes a Crate Stack take one more gym bro hit every sales event, for cash: up to ${word(RF.max)} levels, from $${RF.cost}, each dearer than the last. The money counts as paid for the crate: 75% back if it is sold, half to rebuild it, levels and all. Anyone can reinforce anyone's crate; whoever does it pays.`,
  use: 'Click a crate for one level, or drag across a wall of them for one level each, until the money runs out. Put the levels where the gym bros meet your maze first.',
  maze: '',
};

/** What the Remove tool does, for the same info card. */
export const HOW_REMOVE = {
  does: 'Removes a building and gives back 75% of what was paid for it, to whoever paid.',
  use: 'Click or drag over buildings. Right-clicking does the same without picking this tool.',
  maze: '',
};
