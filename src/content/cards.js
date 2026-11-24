// The words on the cards (0.3.01): each card's name, its rule in one plain sentence, and a joke.
// The rules themselves are in src/sim/cards.js and their numbers in CARDS (src/sim/constants.js);
// every rule sentence here is built from those numbers, so what a card says can never disagree
// with what it does. The names are the lead's (deck.md); the jokes are DEB's, aimed at the players.
import { CARDS, SUPERS, TUNE, BUILD, cardParts } from '../sim/index.js';

/** A number as people write it: at most two decimals, no trailing zeros. */
const fmt = (x) => String(Math.round(x * 100) / 100);
/** A share as a percentage: 0.3 is "30%". */
const pct = (x) => `${fmt(x * 100)}%`;
/** How far a multiplier is from 1, as a percentage, and which way: (1.3, 'more', 'less') is "30% more". */
const off = (m, up, down) => `${pct(Math.abs(m - 1))} ${m >= 1 ? up : down}`;
/** A multiplier in words: "twice", "half", "3 times". */
const times = (m) => (m === 2 ? 'twice' : m === 0.5 ? 'half' : `${fmt(m)} times`);
/** A share of shoppers in words: "Half", "One in 3", "40%". */
function share(x) {
  if (x === 0.5) return 'Half';
  const n = 1 / x;
  return Math.abs(n - Math.round(n)) < 1e-9 && n > 2 ? `One in ${Math.round(n)}` : pct(x);
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Every kind of shopper's plural, and his super version's, for the per-kind cards ("Karens and
 * Karen Supremes walk 20% faster"). A test checks every kind in SHOPPERS has one.
 */
export const PLURALS = {
  hunter: ['Bargain Hunters', 'Doorbusters'],
  clipper: ['Coupon Clippers', 'Extreme Couponers'],
  dad: ['Dads', 'Dads on a Mission'],
  karen: ['Karens', 'Karen Supremes'],
  scooter: ['Mobility Scooters', 'Turbo Scooters'],
  teen: ['Teenagers', 'Teen Influencers'],
  mom: ['Moms and Kids', 'Soccer Moms'],
  blind: ['Men with Guide Dogs', 'Men with Two Guide Dogs'],
  gymbro: ['Gym Bros', 'Roid Ragers'],
  drinker: ['Day Drinkers', 'Bottomless Brunchers'],
  dog: ['Stray Dogs', 'Great Danes'],
  flasher: ['Exhibitionists', 'Nudist Nans'],
  cosplay: ['Cosplayers', 'Full Mech Suits'],
  preggo: ['Pregnant Ladies', 'Octomoms'],
  trader: ['Card Traders', 'Scalpers'],
};

/** "Karens and Karen Supremes": a kind and its super version, as the per-kind cards name them. */
export const kindsText = (k) => (PLURALS[k] ? `${PLURALS[k][0]} and ${PLURALS[k][1]}` : 'Shoppers');

/**
 * Each card's name and its rule. `rule(c, k)` gets the card's numbers (CARDS[id]) and, for a
 * per-kind card, the kind it picked; it returns one plain sentence for players.
 */
const TEXT = {
  // ---- Bad for the players
  litter: {
    name: 'Buy One, Get Twelve Free',
    rule: (c) => `Pregnant Ladies and Octomoms pop ${times(c.pops)} as many babies.`,
    joke: "Twice the babies. Somebody in this store finally has a working pipeline, and it isn't any of you.",
  },
  doubledip: {
    name: 'Double Dipping',
    rule: (c) => `${share(c.share)} shoppers takes ${times(c.cash)} the cash at the till, still as one refund. Not the boss, not babies.`,
    joke: "Some of them are taking you twice. Relax. You're used to being had from both ends.",
  },
  freerange: {
    name: 'Free-Range Children',
    rule: (c) => `A runaway kid always bolts ahead along the shoppers' own route, never sideways or back, and stops ${fmt(c.ahead)} times as far along it as usual.`,
    joke: 'The kids run on ahead now. Same as your wives did the first time they saw you naked.',
  },
  offleash: {
    name: 'Off the Leash',
    rule: (c) => `${pct(c.share)} of moms have a kid who runs off ${times(c.runs)} as many times (${fmt(TUNE.kidRuns * c.runs)}; a Soccer Mom's ${fmt(SUPERS.mom.kidRuns * c.runs)}).`,
    joke: "Some kids bolt twice. Nobody's holding the leash. That's how your marriages ended too.",
  },
  preworkout: {
    name: 'Pre-Workout and Poor Decisions',
    rule: (c) => `${pct(c.share)} of Gym Bros can land ${times(c.hits)} as many hits in a visit (${fmt(TUNE.smashMax * c.hits)}; a Roid Rager ${fmt((SUPERS.gymbro.smashMax ?? TUNE.smashMax) * c.hits)}).`,
    joke: 'Some gym bros are on the good stuff. Twice the hits, half the testicles. Still more balls than you lot.',
  },
  spayed: {
    name: 'Should Have Had Her Spayed',
    rule: (c) => `${pct(c.share)} of Stray Dogs and Great Danes are pregnant: stopped by anything but a Barcode Laser, one bursts into ${fmt(c.pups)} puppies (a Great Dane ${fmt(c.supPups)}) that run for the tills like a Pregnant Lady's babies. Puppies do not pee.`,
    joke: "Some of the strays are knocked up. You can't get a dog to like you, and these got lucky in the car park.",
  },
  bde: {
    name: 'Big Dick Energy',
    rule: (c) => `Bosses have ${off(c.hp, 'more', 'less')} patience and are drawn ${off(c.size, 'larger', 'smaller')}.`,
    joke: 'The boss walks in bigger and lasts longer. Two things none of you has managed at the same time.',
  },
  hardy: {
    name: 'Little Blue Pills',
    rule: (c, k) => `${kindsText(k)} have ${off(c.hp, 'more', 'less')} patience.`,
    joke: 'One kind of shopper just lasts longer now. Ask your doctor if your security is right for you. It is not.',
  },
  hurry: {
    name: 'Explosive Diarrhea',
    rule: (c, k) => `${kindsText(k)} walk ${off(c.speed, 'faster', 'slower')}.`,
    joke: "One kind is sprinting for the tills like it's sprinting for the toilet. Clench, gentlemen.",
  },
  clearance: {
    name: 'Everything Must Go',
    rule: (c) => `Everything the factory ships sells for ${off(c.sell, 'more', 'less')}.`,
    joke: 'Everything sells for less. Like you on the open market, only faster.',
  },
  klepto: {
    name: 'Five-Finger Discount',
    rule: (c) => `Shoplifters go out of their way to steal ${times(c.chance)} as often, and from ${fmt(c.reach)} tiles further away. Not Card Traders.`,
    joke: 'The shoplifters walk further for it now. More commitment than any of you ever showed a woman.',
  },
  shrinkflation: {
    name: 'Shrinkflation',
    rule: (c) => `Every building costs ${off(c.cost, 'more', 'less')}. Upgrades do not.`,
    joke: 'You pay more and get the same. You know the feeling. You see it every morning in the shower.',
  },
  pissing: {
    name: 'Pissing Contest',
    rule: (c) => `A Stray Dog's pee keeps security switched off ${off(c.pee, 'longer', 'less long')}.`,
    joke: "The dogs pee for longer. They've been drinking with you on a Friday.",
  },
  doorbuster: {
    name: 'Doorbuster Deals',
    rule: (c) => `${cap(off(c.crowd, 'more', 'fewer'))} shoppers in every sales event (not the boss, not a Midnight Release mob).`,
    joke: 'More of them. Word got out that you lot were working, and people love watching a car crash.',
  },
  sensibleshoes: {
    name: 'Sensible Shoes',
    rule: (c) => `Shoppers slip on wet floors and messes ${off(c.slip, 'more', 'less')} often.`,
    joke: "They've all got sensible shoes on. Grip, comfort, zero sex appeal. They dress like you.",
  },
  dryjanuary: {
    name: 'Dry January',
    rule: (c) => `Day Drinkers fall over ${times(c.fall)} as often.`,
    joke: "The drunks are cutting back. Dry January. Like your bedrooms, all year round.",
  },
  retreat: {
    name: 'Team-Building Retreat',
    rule: (c) => `A boss's pep talk gives back ${off(c.pep, 'more', 'less')} patience.`,
    joke: 'The bosses are back from a team-building weekend, fired up. Nothing happened in the hot tub. Everything happened in the hot tub.',
  },
  // ---- Good for the players
  lootbox: {
    name: 'Loot Box Addiction',
    rule: (c) => `Mystery Boxes sell for ${times(c.sell)} as much.`,
    joke: "Grown men paying triple for a box they can't see inside. There's hope for your dating profiles yet.",
  },
  asseenontv: {
    name: 'As Seen on TV',
    rule: (c) => `Gadgets sell for ${times(c.sell)} as much.`,
    joke: 'Nobody needs it, everybody wants it. The exact opposite of you, on both counts.',
  },
  regifting: {
    name: 'Regifting Season',
    rule: (c) => `Gift Sets sell for ${times(c.sell)} as much.`,
    joke: "Gift Sets are worth more. Somebody's re-gifting the one your wife gave you to a man she actually likes.",
  },
  offatruck: {
    name: 'Fell Off the Back of a Truck',
    rule: (c) => `Every factory building is built with ${fmt(c.free)} free upgrade level${c.free === 1 ? '' : 's'} on a random one of its tracks. Free: it adds nothing to what the building sells back or rebuilds for, and the next level costs as if ${c.free === 1 ? 'it' : 'they'} had been bought.`,
    joke: "Every machine comes with a free upgrade. Don't ask where from. Don't ask Gary. Gary has a van.",
  },
  mallcop: {
    name: 'Mall Cop Academy',
    rule: (c) => `Every security building is built with ${fmt(c.free)} free upgrade level${c.free === 1 ? '' : 's'} on a random one of its tracks. Free: it adds nothing to what the building sells back or rebuilds for, and the next level costs as if ${c.free === 1 ? 'it' : 'they'} had been bought.`,
    joke: 'Security comes pre-upgraded. Twelve weeks at Mall Cop Academy and they are still better trained than you.',
  },
  pulledout: {
    name: 'Pulling Out Works (Sometimes)',
    rule: (c) => `Pregnant Ladies and Octomoms pop ${times(c.pops)} as many babies.`,
    joke: "Half the babies. The pull-out method worked for once. Your parents weren't so lucky.",
  },
  eyesup: {
    name: 'Eyes Up Here, Dad',
    rule: (c) => `${share(c.share)} of all dads who come within ${fmt(c.range)} tiles of an Exhibitionist ahead of them fall in about ${fmt(c.gap)} tiles behind her and will not pass her, until she leaves the store or he is out of range.`,
    joke: "Dads trail the Exhibitionist like puppies. You'd do the same. You just wouldn't keep your distance.",
  },
  wrongway: {
    name: 'Wrong Way, Dipshit',
    rule: (c) => `${pct(c.share)} of the times a kid runs off, he runs back toward the entrance instead of on toward the tills.`,
    joke: 'Some kids run the wrong way. You lot get lost in your own car park, so you can relate.',
  },
  slushie: {
    name: 'Blue Raspberry Massacre',
    rule: () => "A Teenager's mess covers the tile and the four tiles beside it (where those are floor).",
    joke: 'The teenagers spill bigger now. Blue raspberry everywhere. Your college carpet looked like this, and it was not slushie.',
  },
  eightyproof: {
    name: 'Free Samples: Now 80 Proof',
    rule: (c) => `${share(c.share)} of all Free Sample tables hand out booze. An adult who stops at one may turn into a Day Drinker: ${pct(c.chance)} at his first, ${fmt(c.step * 100)} points more at each one after.`,
    joke: 'The free samples are booze now. Pour enough of it and somebody in this store finally gets lucky. Not you.',
  },
  frail: {
    name: 'Whiskey Dick',
    rule: (c, k) => `${kindsText(k)} have ${off(c.hp, 'more', 'less')} patience.`,
    joke: 'One kind of shopper just cannot keep it up. Finally, something in this store you can all relate to.',
  },
  slow: {
    name: 'Leg Day',
    rule: (c, k) => `${kindsText(k)} walk ${off(c.speed, 'faster', 'slower')}.`,
    joke: 'One kind skipped leg day. Now they shuffle like you after two flights of stairs.',
  },
  warranty: {
    name: 'Extended Warranty',
    rule: (c) => `Now and then a shopper actually buys something: ${pct(c.chance)} of the stops at a Free Sample table pay the store $${fmt(c.sample)}, and ${pct(c.chance)} of the stops for a TV Salesman pay $${fmt(c.salesMin)} to $${fmt(c.salesMax)}.`,
    joke: 'Some of them buy things. Actual customers. Try not to frighten them off with your faces.',
  },
  supportdog: {
    name: 'Emotional Support Animal',
    rule: (c) => `${pct(c.share)} of Men with Guide Dogs have an emotional support dog instead. Shoppers who come within ${fmt(c.range)} tiles stop for ${fmt(c.secs)} seconds to pet it, once per dog. Dads, bosses and babies never stop.`,
    joke: "Everybody stops to pet the dog. Nobody has stopped to pet any of you since about 1996.",
  },
  staffdiscount: {
    name: 'Employee Discount',
    rule: (c) => `Every building costs ${off(c.cost, 'more', 'less')}. Upgrades do not.`,
    joke: "A staff discount. The only perk this job has, and you still can't afford a personality.",
  },
  overtime: {
    name: 'Unpaid Overtime',
    rule: (c) => `The bonus at the end of each sales event is ${off(c.bonus, 'bigger', 'smaller')}.`,
    joke: "A bigger bonus every event. Don't tell your wives. They'll only spend it on lawyers.",
  },
  mopmike: {
    name: 'Mop Bucket Mike',
    rule: (c) => `Shoppers slip on wet floors and messes ${off(c.slip, 'more', 'less')} often.`,
    joke: 'Mike is mopping. Mike uses far too much water. Mike is the only one in this building doing his job.',
  },
  restocking: {
    name: 'Restocking Fee',
    rule: (c) => `Every shopper who storms out pays the store $${fmt(c.fee)} on his way (not babies).`,
    joke: 'Every walkout pays a restocking fee. Two dollars for his dignity. Still more than yours fetched.',
  },
  firecode: {
    name: 'Fire Code Violation',
    rule: (c) => `A Pepper Sprinkler sprays ${fmt(c.targets)} shoppers at once instead of ${fmt(BUILD.sprinkler.targets)}.`,
    joke: 'The sprinklers reach one more. If the inspector asks, it is a feature. If he asks again, it was one of you.',
  },
  happyhour: {
    name: 'Happy Hour',
    rule: (c) => `Day Drinkers fall over ${times(c.fall)} as often.`,
    joke: 'Happy hour. The drunks go down twice as often. Like your standards after the third round.',
  },
  // ---- Neither
  convention: {
    name: 'Convention Weekend',
    rule: (c) => `A Cosplayer takes the shots meant for anyone within ${fmt(c.shield)} tiles (normally ${fmt(TUNE.shield)}; a Full Mech Suit's reach grows as much), but walks at ${fmt(c.speed)} tiles a second and has ${off(c.hp, 'more', 'less')} patience.`,
    joke: 'The cosplayers are bigger and slower. All that foam padding, and still less of it than you carry round your middle.',
  },
  bulkbuy: {
    name: 'Fewer, Fatter',
    rule: (c) => `${cap(off(c.crowd, 'more', 'fewer'))} shoppers, each with ${off(c.hp, 'more', 'less')} patience (not the boss, babies or Card Traders).`,
    joke: 'Fewer shoppers, fatter ones. The buffet across the road shut down. Thoughts and prayers to your lunch plans.',
  },
  flashmob: {
    name: 'Flash Mob',
    rule: (c) => `${cap(off(c.crowd, 'more', 'fewer'))} shoppers, each with ${off(c.hp, 'more', 'less')} patience (not the boss, babies or Card Traders).`,
    joke: 'More shoppers, less patience. Somebody posted online that you were working today. They came to laugh.',
  },
  artisanal: {
    name: 'Artisanal, Hand-Rubbed',
    rule: (c) => `Everything sells for ${off(c.sell, 'more', 'less')}, and every machine takes ${off(c.work, 'longer', 'less time')} over an item.`,
    joke: "Everything's hand-rubbed now. Slower, gentler, worth more. Ask your wives what that's like. They'll have to guess too.",
  },
  premature: {
    name: 'Premature Discharge',
    rule: (c) => `Security fires ${off(c.rate, 'faster', 'slower')} and reaches ${off(c.range, 'further', 'less far')}.`,
    joke: 'Security goes off faster and does not reach as far. They modelled it on you lot.',
  },
  fathersday: {
    name: "Father's Day",
    rule: (c) => `${cap(times(c.crowd))} as many Dads, each with ${off(c.hp, 'more', 'less')} patience.`,
    joke: 'Twice the dads, half the patience. They want a tie and a nap. Same as you, except they got kids out of it.',
  },
  payday: {
    name: 'Payday Friday',
    rule: (c) => `Everything sells for ${off(c.sell, 'more', 'less')}, and every refund costs ${off(c.refund, 'more', 'less')}.`,
    joke: 'Payday. The money comes in and goes straight back out again. Like your alimony.',
  },
  mallwalkers: {
    name: 'Mall Walkers',
    rule: (c) => `Every shopper walks ${off(c.speed, 'faster', 'slower')} and has ${off(c.hp, 'more', 'less')} patience (not the boss).`,
    joke: "Everybody is power-walking. Elbows out, hips swinging. More cardio than you've done since your wedding night.",
  },
  openbar: {
    name: 'Open Bar',
    rule: (c) => `${cap(times(c.crowd))} as many Day Drinkers, each with ${off(c.hp, 'more', 'less')} patience.`,
    joke: 'Open bar. Twice the drunks, half the patience. Finally a work party you were all invited to.',
  },
  rentacop: {
    name: 'Rent-a-Cop Rates',
    rule: (c) => `Security buildings cost ${off(c.cost.security, 'more', 'less')} and factory buildings ${off(c.cost.factory, 'more', 'less')}. Upgrades do not change.`,
    joke: 'Security is cheap this week. Rent-a-cops work for exposure. Like your podcast.',
  },
  sweatshop: {
    name: 'Sweatshop Pricing',
    rule: (c) => `Factory buildings cost ${off(c.cost.factory, 'more', 'less')} and security buildings ${off(c.cost.security, 'more', 'less')}. Upgrades do not change.`,
    joke: 'The factory is dirt cheap. Ethically sourced? Absolutely not. Neither were you.',
  },
};

/** The ids of every card with words (a test checks it is every card in CARDS). */
export const CARD_WORDS = Object.keys(TEXT);

/**
 * A card's words, from its id in a hand ('litter', or 'hardy:karen' for a per-kind card).
 * @returns {{id: string, card: string, kind: string|null, side: string, name: string, rule: string,
 *   joke: string}|null} null for an id that is not a card
 */
export function cardText(id) {
  const [card, kind] = cardParts(id);
  const t = Object.hasOwn(TEXT, card) ? TEXT[card] : null;
  if (!t || !CARDS[card]) return null;
  return { id: String(id), card, kind, side: CARDS[card].side, name: t.name, rule: t.rule(CARDS[card], kind), joke: t.joke };
}

/** A card's name ('Little Blue Pills'), or the id itself if it is not a card. */
export const cardName = (id) => cardText(id)?.name ?? String(id);

/** What a side is called on the cards. */
export const SIDE_NAMES = { bad: 'Bad for you', good: 'Good for you', odd: 'Neither' };

/**
 * The handbook's line in a game with cards: the handbook shows the standard numbers, and this
 * game's cards change some of them. Empty in a game without cards.
 */
export function cardsNote(state) {
  const hand = state && !state.training && Array.isArray(state.cards) ? state.cards : [];
  if (!hand.length) return '';
  return `This game's cards change some of these numbers (${hand.map(cardName).join(', ')}): the handbook shows the standard ones.`;
}
