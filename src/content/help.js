// Plain explanations of what each building does and how to use it. Shown in the info card when a
// building is picked in the build bar, and used by the tutorial. These are the "manual": keep them
// clear first and funny second. If a number in src/sim/constants.js changes, update the text here
// (the gym bro's limits are read from the rules below).
import { TUNE, SUPERS } from '../sim/index.js';

/** A small count as a word ("two"), for text that reads better that way. */
const word = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const ROID = SUPERS.gymbro;

/** Per building: `does` = what it is for, `use` = how to place it so it works. */
export const HOW = {
  belt: {
    does: 'Carries goods one way, in the direction of its arrows. Each machine only goes on its own marked floor, and the marked areas are apart, so belts are how goods get from one machine to the next.',
    use: 'Drag to lay a line: the belts follow your drag. Goods wait on the belt if the next tile cannot take them. Turning a belt is free: drag belt over it again in the new direction, or point at it and press R.',
    maze: 'Blocks shoppers, except dads, who step over it.',
  },
  unpacker: {
    does: 'The start of every production line. Makes a Mystery Box ($2) every 2.5 seconds, for free.',
    use: 'It only goes on LOADING BAY floor (blue). It pushes boxes out of the side with the arrow. Put a belt on that side. Press R before placing to choose the side.',
    maze: 'Blocks all shoppers.',
  },
  press: {
    does: 'Turns a Mystery Box ($2) into a Gadget ($8).',
    use: 'It only goes on PRESS SHOP floor (orange). Run a belt of boxes into its back or either side. The Gadget comes out of the side with the arrow, so put a belt there. It is expensive: it takes 37 Gadgets to pay for itself.',
    maze: 'Blocks all shoppers.',
  },
  packer: {
    does: 'Turns a Gadget ($8) into a Gift Set ($18).',
    use: 'It only goes on GIFT WRAP floor (purple). It only accepts Gadgets, so it comes after a Press. Feed it from the back or either side; the Gift Set comes out of the side with the arrow.',
    maze: 'Blocks all shoppers.',
  },
  chute: {
    does: 'The end of every production line. Anything pushed into it is sold on the spot and the cash is split evenly between the players.',
    use: 'It only goes on SHIPPING floor (green). Point the last belt of a line at it. It accepts goods from all four sides. Nothing earns money until it reaches a chute.',
    maze: 'Blocks all shoppers.',
  },
  crate: {
    does: 'A wall, and nothing else.',
    use: 'Use it to shape the route shoppers must walk. It is the cheapest way to stop a dad, who steps over belts but not crates.',
    maze: 'Blocks all shoppers, dads included, except a gym bro with a hit left in him, who smashes through.',
  },
  sprinkler: {
    does: 'Wears down the patience of up to four shoppers within about 2 tiles, twice a second. In a crowd it picks the four nearest the tills.',
    use: 'Short range, so put it right beside the route, best of all where shoppers are slowed or stopped. It can be upgraded for damage, speed, range and durability.',
    maze: 'Blocks all shoppers.',
  },
  forklift: {
    does: 'Hits one shopper hard from up to 6 tiles away. It always picks the shopper closest to the tills.',
    use: 'Put it where its circle covers a long stretch of the route. It can be upgraded for damage, speed, range and durability.',
    maze: 'Blocks all shoppers.',
  },
  wetfloor: {
    does: 'Shoppers crossing it walk at half speed. Dads ignore the sign and have a 1 in 3 chance of slipping and lying stunned.',
    use: 'It does not block the way, so it can sit right in a gap, next to a sprinkler. Mobility scooters are not affected. Upgrades make it slower to cross and slippier.',
    maze: 'Does not block anyone.',
  },
  samples: {
    does: 'Bargain Hunters, Coupon Clippers and Pregnant Ladies within about 2 tiles stop for 2 seconds to eat.',
    use: 'Put sprinklers beside it so they are sprayed while they stand there. Dads, Karens and scooters do not stop. Upgrades hold shoppers longer and reach further.',
    maze: 'Blocks all shoppers.',
  },
  railgun: {
    does: 'Fires a beam straight out of its front end every 4.5 seconds. The beam goes through shoppers, buildings and walls, and hits every shopper on the line for 10 tiles.',
    use: 'It is three tiles long and fires the way its arrow points: press R before placing to turn it. Aim it down a long straight stretch of the route, where a whole queue is in line. It only fires when someone is in the beam. It is the one way to finish a Pregnant Lady without her popping.',
    maze: 'Blocks all shoppers.',
  },
  salesman: {
    does: 'A man demonstrating knives and barbecues on a television. Each shopper who comes within 4.5 tiles may walk over to the stand and watch for 2.5 seconds, or hurry past to get away from him. If something is in his way he watches from as near as he can get. Runaway kids usually stop to watch the television.',
    use: 'It takes up two tiles by two. It is the one thing that makes some dads stop (1 in 5), but more of them speed up (3 in 10), so put damage round the stand, where they stop, not after it. Mobility scooters nearly always stop. Upgrading his pitch makes more shoppers stop, for longer, and fewer hurry.',
    maze: 'Blocks all shoppers.',
  },
};

/**
 * The shoppers: `trick` = what makes this one different, `beat` = what works against it.
 * Shown in the in-game help, in the order they first appear.
 */
export const SHOPPER_HELP = {
  hunter: { trick: 'The ordinary shopper. Stops for free samples and grabs goods off belts.', beat: 'Anything. Slow them at a gap and spray them.' },
  dad: { trick: 'Arrives in a single-file line, walks fast, ignores samples, and steps over conveyor belts.', beat: 'Time: his patience drains by itself. Crates and machines block him. He slips on wet floor signs. Cover his short cut.' },
  clipper: { trick: 'Fast, weak, and there are a lot of them.', beat: 'Sprinklers. Anything that hits a crowd.' },
  mom: { trick: 'Her kid escapes the cart and runs ahead, straight through your belts, machines and crates, then waits further along the route. She sprints round the maze to reach him and ignores free samples on the way. If her patience runs out while he is loose, she does not leave: she crawls to him, nothing can hurt her, and security wastes its shots on her. When she reaches him she gets up with a third of her patience back, without her cart, and carries him from then on. He runs away once only, he never runs all the way to the tills, and she will not take her refund without him.', beat: 'Finish her while the kid is in the cart. Forklifts and wet floor signs. Samples only work while the kid is in the cart. A TV Salesman stops most runaway kids.' },
  teen: { trick: 'Slow. Spills a slushie every few seconds; the mess slows every other shopper and dads slip on it.', beat: 'Let him loiter in range. His messes work for you.' },
  karen: { trick: 'Enormous patience. Security near her works at half speed while she asks for the manager.', beat: 'Long routes and forklifts out of her reach. Do not rely on one cluster of towers.' },
  blind: { trick: 'The guide dog steers him around puddles and messes, and he cannot see free samples. Pepper spray makes the dog bolt, dragging him along fast.', beat: 'Forklifts. Sprinklers make him faster.' },
  scooter: { trick: 'Cannot be slowed by anything.', beat: 'Raw damage over a long route.' },
  gymbro: {
    trick: `Walks straight through crate stacks, wrecking any in his way and any he passes, and now and then something else beside him: a belt, a machine, a tower. But he only has ${word(TUNE.smashMax)} hits in him a visit, and needs ${TUNE.smashWait} seconds to get his breath back after each. While he does, and once he is spent, he walks round crates like anyone else.`,
    beat: 'Stop him early, before he reaches anything expensive. Every hit he lands counts, even one a Durability upgrade soaks up (the damage is forgotten every sales event), so a durable crate stack where he first meets your maze takes a hit off him for nothing, and makes him walk the long way round. Press B to rebuild what he wrecked at half price.',
  },
  drinker: { trick: 'Weaves along at a speed that keeps changing. At corners of the route he may fall over and lie there for 4 seconds, and everyone else has to squeeze past him at a third of their speed.', beat: 'Corners near your security: when he goes down, the queue behind him stands in the spray.' },
  dog: { trick: 'Fast, with little patience. Pees on any security it passes (not wet floor signs), which switches that building off for 6 seconds.', beat: 'Stop it before it reaches your best security. Spread security out so one dog cannot switch off a whole gap.' },
  flasher: { trick: 'A woman in a bathrobe who opens it every few seconds. Dads and teenagers within 2.5 tiles stop and stare for 2 seconds.', beat: 'She helps you: let her walk with the dad line, in range of something that hurts.' },
  preggo: { trick: 'Very pregnant: slow, with a lot of patience, and she stops for every free sample (she is eating for thirteen). When her patience runs out she does not leave. She pops, and a dozen babies run for the tills from where she stood: very fast, with very little patience, and nothing distracts them. A baby at a till takes $5 but is not a refund toward the limit. If she reaches a till herself she takes one refund and nothing pops.', beat: 'Finish her with a Barcode Laser: if its beam takes her last patience, no babies come out. Otherwise wear her down early, so the babies have the whole maze to run, with sprinklers and wet floor signs along it to catch them.' },
  cosplay: { trick: 'A big costume and a lot of patience. Shots from sprinklers, forklifts and barcode lasers that would hit a shopper standing next to him hit him instead.', beat: 'Wear him down while he is alone, or separate him from the crowd: free samples and salesmen stop the others while he walks on.' },
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
  cosplay: 'Two and a half times the patience. Shields shoppers within 1.6 tiles and takes only half of what he soaks up.',
};

/** What the Upgrade tool does, for the same info card. */
export const HOW_UPGRADE = {
  does: 'Upgrades a building. Each building has its own kinds of upgrade, bought separately: damage, speed, range and durability for security; speed and durability for factory machines; durability only for belts, chutes and crates.',
  use: 'Click a building and choose what to upgrade. Each level of one kind costs more than the last. Durability is how many gym bro hits it survives in one sales event.',
  maze: '',
};

/** What the Rebuild button does. */
export const HOW_REBUILD = {
  does: 'Puts back everything of yours that gym bros have wrecked, oldest first, at half of what you had spent on it, upgrades included.',
  use: 'Press it (or B) once. If you cannot afford a building with all its upgrades, it comes back with the upgrades you can afford and the rest are lost; if you cannot afford even half its base price it stays as rubble. Building the same thing by hand on its rubble gets the same deal.',
  maze: '',
};

/** What the Remove tool does, for the same info card. */
export const HOW_REMOVE = {
  does: 'Removes a building and gives back 75% of everything spent on it, to whoever paid.',
  use: 'Click or drag over buildings. Right-clicking does the same without picking this tool.',
  maze: '',
};
