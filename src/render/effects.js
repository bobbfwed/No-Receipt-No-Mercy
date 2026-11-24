// Short-lived effects driven by simulation events: floating cash, speech blips, "WHOA" pops,
// forklift shots, barcode laser beams, sprinkler bursts, wreckage when a gym bro smashes something,
// shield flashes round cosplayers, sparkles when something is upgraded, the boss's entrance,
// pep talks, exit and (worst of all) arrival at a till, and a Pregnant Lady popping (or a Barcode
// Laser stopping her: "NOT TODAY") and her babies' small refunds, a Midnight Release's mob
// walking in (the boss's banner in purple) and a Card Trader ripping a pack. A fixed pool of effect
// objects is reused so a big wave does not allocate, and every kind has a cap so the screen stays
// readable.
import { BUILD, DIRS, BOSS, statsOf, sizeOf, bossTitle } from '../sim/index.js';
import { TILE, INK, C, rr, paint, label, starPath, burstPath, font, hash2 } from './paint.js';
import { drawItem } from './items.js';
import { KIND_COLOURS } from './buildings.js';

const T = TILE;
const TEXT = 1, BLIP = 2, POP = 3, SHOT = 4, SPRAY = 5, DEBRIS = 6, UPGRADE = 7, DENT = 8;
const BEAM = 9, MARK = 10, SHIELD = 11;
// The boss: his title over the entrance he came in by, his pep talks, him storming off (the
// bounty), and him reaching a till (a disaster).
const BOSS_IN = 12, PEP = 13, BOSS_OUT = 14, BOSS_ESC = 15;
// The Pregnant Lady: popping (BURST), a Barcode Laser stopping it (NO_POP), and her babies'
// refunds at the tills, added up per till (BABY_CASH).
const BURST = 16, NO_POP = 17, BABY_CASH = 18;
/** The boss's banner in its other look: a Midnight Release's mob coming in (its st). */
const MOB_LOOK = 1;
/** At most this many of each kind on screen at once; extra events are skipped. */
const CAP = [0, 24, 6, 12, 16, 24, 6, 8, 8, 8, 10, 8, 3, 6, 3, 3, 6, 4, 8];
/** Lifetime of each kind in ms. */
const DUR = [0, 1100, 1900, 850, 280, 420, 950, 1000, 550, 480, 700, 420, 3600, 1300, 2200, 2600, 1900, 1500, 1100];
/** A baby reaching a till within this many ms of the last one there adds to the same figure. */
const BABY_MERGE = 650;
/** The line in a bubble over a pop (an Octomom's are her own). */
const POP_QUIPS = ["WHO'S THE DAD?", 'CLEAN-UP ON AISLE 5', 'SOMEBODY CALL MAURY', "THEY'RE ALL YOURS", 'NO RECEIPT FOR THOSE'];
const OCTO_QUIPS = ['THAT IS NOT A LITTER, IT IS A FLEET', 'MAURY CAN NOT HELP YOU NOW', 'SHE WAS CARRYING A CLOWN CAR'];
/** The same for a pregnant Stray Dog's litter (the spayed card, 0.3.01). */
const PUP_QUIPS = ['WHO LET THE DOGS OUT?', 'SHOULD HAVE HAD HER DONE', 'SHE MET A BOXER IN THE CAR PARK', 'BITCHES BE BITCHES'];
/** What a runaway child shouts when he runs back toward the entrance (the wrongway card). */
const BACK_LINES = ['WRONG WAY!', 'BYE MOM', 'TO THE CAR!'];
/** What the boss shouts in a pep talk, in turn. */
const PEP_WORDS = [
  'SYNERGY!', 'CIRCLE BACK!', "LET'S ALIGN!", 'TOUCH BASE!', 'MOVE THE NEEDLE!', 'PIVOT!',
  'GRIP IT AND RIP IT!', 'OWN IT, LADIES!', 'BALLS TO THE WALL!', 'RAW-DOG THE QUARTER!',
  'TAKE IT OFFLINE!', 'BLUE-SKY IT!',
];
/** What he says as he storms off, and when he reaches a till. */
const BOSS_QUITS = ["I'M CALLING CORPORATE", 'THIS IS GOING IN YOUR REVIEW', "YOU'RE ALL FIRED", 'NOT A CULTURE FIT'];
const BOSS_WINS = ['FULL REFUND. AND YOUR JOBS.', 'I OWN THIS STORE NOW', 'ENJOY UNEMPLOYMENT', 'BONUS SEASON, BITCHES'];
/** Upgrade tracks: the colour of the flash and the word on it. */
const TRACK_LOOK = {
  dmg: ['#ff6b5e', 'DMG'], spd: ['#5cc8ff', 'SPD'], rng: ['#4ade80', 'RNG'], dur: ['#ffd23f', 'DUR'],
};
/** What the TV Salesman shouts now and then, from his stand. */
const PITCH_LINES = ['ONLY $19.99', 'BUT WAIT!', 'LOOK AT THAT MEAT', 'CUTS LIKE YOUR EX', 'NO MONEY DOWN', 'CALL NOW, LOSER'];
/** Ms between the salesman's shouts (pitch events come several a second in a crowd). */
const PITCH_GAP = 2600;
const POOL = 90;
/**
 * Events processed per frame at most. Normally a frame brings a handful; after a fast-forward or
 * a hidden tab thousands may arrive at once, and only the latest are worth showing.
 */
const MAX_EVENTS = 48;

const DAD_LINES = ["I'll come back Tuesday", 'Forget it', 'I have a lawn'];
const ANGRY = ['#@!', '%$#!', '>:(', '!!!'];
/** What each kind says as it storms out, and in what colour (kinds not listed just swear). */
const LEFT_LINES = {
  dad: [DAD_LINES, INK],
  teen: [['whatever'], '#7c3aed'],
  mom: [['we are LEAVING'], '#c2307a'],
  blind: [['come on, boy'], '#1a5fa0'],
  gymbro: [['bro.'], '#d9372b'],
  preggo: [['my FEET', 'ugh, MEN', 'I NEED A NAP'], '#c2307a'],
};
const KID_LINES = ['WHEEE', "CAN'T CATCH ME", 'NO'];
/** Pop styles: plain word, white star (WHOA), jagged burst (WOOF, CRUNCH), flying droplets. */
const PLAIN = 0, STAR = 1, JAGGED = 2, SPLASH = 3;
const DEBRIS_BITS = 9;
const SPRAY_DROPS = 12;

export function createEffects() {
  const pool = [];
  for (let k = 0; k < POOL; k++) {
    pool.push({ type: 0, t0: 0, x: 0, y: 0, x2: 0, y2: 0, text: '', t2: '', color: '', w: 0, r: 0, st: PLAIN, sz: 0 });
  }
  const count = new Int32Array(CAP.length);
  /**
   * Times (ms) of the latest event per tile, read by buildings and the tills (tillAt: a refund at
   * the till on that tile, so only the till the shopper reached flashes, whichever wall it is in);
   * bossEscAt: when a boss last reached a till (the renderer flashes the edges of the screen red).
   */
  const timers = { sprayAt: null, shotAt: null, railAt: null, saleAt: null, upAt: null, tillAt: null, bossEscAt: -1e9 };
  let W = 0, H = 0;
  let pitchAt = -1e9; // when the salesman last shouted
  /** Sizes the per-tile timers for a map (they are kept if the size has not changed). */
  function setMap(w, h) {
    if (w === W && h === H) return;
    W = w; H = h;
    timers.sprayAt = new Float64Array(W * H).fill(-1e9);
    timers.shotAt = new Float64Array(W * H).fill(-1e9);
    timers.railAt = new Float64Array(W * H).fill(-1e9);
    timers.saleAt = new Float64Array(W * H).fill(-1e9);
    timers.upAt = new Float64Array(W * H).fill(-1e9);
    timers.tillAt = new Float64Array(W * H).fill(-1e9);
  }
  /**
   * The till a shopper who got his refund at (x, y) reached: the nearest till tile within two
   * tiles of him, or (with no map to look in) the tile he is on.
   */
  function tillNear(s, x, y) {
    const tx = Math.max(0, Math.min(W - 1, x | 0)), ty = Math.max(0, Math.min(H - 1, y | 0));
    let best = ty * W + tx, bd = Infinity;
    const tiles = s && typeof s.tiles === 'string' && s.tiles.length === W * H ? s.tiles : '';
    if (!tiles) return best;
    for (let Y = Math.max(0, ty - 2); Y <= Math.min(H - 1, ty + 2); Y++) {
      for (let X = Math.max(0, tx - 2); X <= Math.min(W - 1, tx + 2); X++) {
        if (tiles[Y * W + X] !== 'T') continue;
        const d = (X + 0.5 - x) ** 2 + (Y + 0.5 - y) ** 2;
        if (d < bd) { bd = d; best = Y * W + X; }
      }
    }
    return best;
  }
  setMap(30, 16);
  let pick = 0; // rotates through the line banks
  let pepN = 0; // and through the boss's pep words

  function add(type, now, x, y) {
    if (count[type] >= CAP[type]) return null;
    let slot = null, oldest = null;
    for (let k = 0; k < POOL; k++) {
      const e = pool[k];
      if (!e.type) { if (!slot) slot = e; continue; }
      // Words and shots do not stack: skip one that would land on a live one of the same kind.
      if (e.type === type && type !== TEXT && type !== SPRAY && type !== BEAM && now - e.t0 < DUR[type] &&
          Math.abs(e.x - x) < (type === SHOT ? 1 : 40) && Math.abs(e.y - y) < (type === SHOT ? 1 : 22)) return null;
      if (!oldest || e.t0 < oldest.t0) oldest = e;
    }
    if (!slot) { slot = oldest; count[slot.type]--; }
    slot.type = type; slot.t0 = now; slot.x = x; slot.y = y; slot.w = 0; slot.r = 0; slot.st = PLAIN; slot.sz = 0;
    count[type]++;
    return slot;
  }

  /**
   * A baby took its $5 at a till: a small figure, not a full refund's. Babies arrive in swarms, so
   * one that reaches the same till (ti, a tile index) soon after another adds its cash and itself
   * to the figure already there ("-$15 x3") instead of stacking more.
   */
  function babyCash(e, now, ti) {
    for (let k = 0; k < POOL; k++) {
      const f = pool[k];
      if (f.type !== BABY_CASH || f.x2 !== ti || now - f.t0 > BABY_MERGE) continue;
      f.w += e.refund | 0;
      f.sz++;
      f.t0 = Math.max(f.t0, now - 120); // keep it up a little longer, without jumping back
      return;
    }
    const f = add(BABY_CASH, now, e.x * T - 14, e.y * T - 4);
    if (f) { f.x2 = ti; f.w = e.refund | 0; f.sz = 1; }
  }

  /**
   * Turns simulation events into effects.
   * @param {Object} [s] the game state: its size places tile-indexed events, and its buildings
   *   give the sprinklers' ranges
   */
  function handle(events, now, s) {
    if (s) setMap(s.w, s.h);
    for (let n = Math.max(0, events.length - MAX_EVENTS); n < events.length; n++) {
      const e = events[n];
      if (e.i >= W * H) continue; // from a different map
      let f;
      switch (e.e) {
        case 'sale':
          timers.saleAt[e.i] = now;
          f = add(TEXT, now, (e.i % W) * T + T / 2, ((e.i / W) | 0) * T + 4);
          if (f) { f.text = '+$' + e.v; f.color = '#4ade80'; }
          break;
        case 'escape':
          timers.tillAt[tillNear(s, e.x, e.y)] = now;
          if (e.k === 'boss') {
            timers.bossEscAt = now;
            f = add(BOSS_ESC, now, e.x * T, e.y * T);
            if (f) { pick++; f.text = '-$' + e.refund; f.t2 = BOSS_WINS[pick % BOSS_WINS.length]; f.sz = e.n || 2; }
            break;
          }
          // (A pregnant dog's puppy takes $5 like a baby, and adds up the same way.)
          if (e.k === 'baby' || e.k === 'pup') { babyCash(e, now, tillNear(s, e.x, e.y)); break; }
          f = add(TEXT, now, e.x * T - 22, e.y * T - 6);
          if (f) { f.text = '-$' + e.refund; f.color = '#ff5a4e'; }
          break;
        case 'release':
          // A Midnight Release's mob is walking in: the boss's banner, in foil purple, over the door.
          f = add(BOSS_IN, now, e.x * T, e.y * T);
          if (f) { f.text = 'Midnight Release'; f.t2 = (e.n | 0) + ' CARD TRADERS'; f.st = MOB_LOOK; f.sz = 0; }
          break;
        case 'rip':
          // A Card Trader ripping open a stolen Mystery Box, and the ones who stopped to look.
          f = add(POP, now, e.x * T, e.y * T - 44);
          if (f) { f.text = 'RIIIP!'; f.color = '#c084fc'; f.r = -0.1; f.st = JAGGED; f.sz = 13; }
          if (e.n > 0) {
            f = add(MARK, now, e.x * T + 24, e.y * T - 28);
            if (f) { f.text = e.n > 1 ? 'OOOH x' + e.n : 'OOOH'; f.color = '#f0abfc'; f.st = 1; }
          }
          break;
        case 'bossIn':
          f = add(BOSS_IN, now, e.x * T, e.y * T);
          if (f) { f.text = titleOf(e.tier); f.sz = e.tier | 0; }
          break;
        case 'pep':
          f = add(PEP, now, e.x * T, e.y * T);
          if (f) {
            f.text = PEP_WORDS[pepN++ % PEP_WORDS.length];
            f.sz = e.n | 0;
            f.w = ((BOSS && BOSS.pepRange) || 3.5) * T;
            f.r = (pepN % 2 ? 1 : -1) * 0.12;
          }
          break;
        case 'bossOut':
          f = add(BOSS_OUT, now, e.x * T, e.y * T);
          if (f) { pick++; f.text = '+$' + e.bounty; f.t2 = BOSS_QUITS[pick % BOSS_QUITS.length]; f.sz = e.tier | 0; }
          break;
        case 'left':
          if (e.k === 'boss') break; // his exit is the bossOut effect
          if ((e.k === 'preggo' || e.k === 'dog') && e.why === 'pop') break; // the pop says it all
          if (e.k === 'baby' || e.k === 'pup') {
            // A small wail, not a speech bubble each: a dozen at once would bury the screen.
            f = add(MARK, now, e.x * T, e.y * T - 20);
            if (f) { f.text = e.k === 'pup' ? 'yip' : 'waah'; f.color = e.k === 'pup' ? '#f0c38a' : '#7dd3fc'; f.st = 0; }
            break;
          }
          f = add(BLIP, now, e.x * T, e.y * T - 30);
          if (f) {
            pick++;
            const said = LEFT_LINES[e.k];
            f.text = said ? said[0][pick % said[0].length] : ANGRY[pick % ANGRY.length];
            f.color = said ? said[1] : '#d9372b';
            f.sz = f.text.length > 5 ? 11 : 13;
          }
          break;
        case 'slip':
          f = add(POP, now, e.x * T, e.y * T - 26);
          if (f) { f.text = 'WHOA!'; f.color = C.yellow; f.r = -0.15; f.st = STAR; }
          break;
        case 'grab':
          f = add(POP, now, e.x * T, e.y * T - 30);
          if (f) { f.text = 'yoink'; f.color = '#ff8c1a'; f.r = 0.1; }
          break;
        case 'sample':
          f = add(POP, now, e.x * T, e.y * T - 30);
          if (f) { f.text = 'ooh'; f.color = '#ff8fc4'; f.r = 0; }
          break;
        case 'spray': {
          timers.sprayAt[e.i] = now;
          f = add(SPRAY, now, (e.i % W) * T + T / 2, ((e.i / W) | 0) * T + T / 2);
          const b = s && s.grid[e.i];
          if (f) f.w = (b && b.k === 'sprinkler' ? statsOf(b, s).range : BUILD.sprinkler.range) * T;
          break;
        }
        case 'shot':
          timers.shotAt[e.i] = now;
          f = add(SHOT, now, (e.i % W) * T + T / 2, ((e.i / W) | 0) * T + T / 2);
          if (f) { f.x2 = e.x * T; f.y2 = e.y * T; }
          break;
        case 'mess':
          f = add(POP, now, (e.i % W) * T + T / 2, ((e.i / W) | 0) * T + 8);
          if (f) { f.text = 'splat'; f.color = '#3fc6ff'; f.r = -0.1; f.st = SPLASH; f.sz = 12; }
          break;
        case 'kid':
          f = add(BLIP, now, e.x * T + 6, e.y * T - 24);
          if (f) { pick++; const said = e.back ? BACK_LINES : KID_LINES; f.text = said[pick % said.length]; f.color = '#e8590c'; f.sz = 12; }
          break;
        // The cards that change how shoppers behave (0.3.01).
        case 'drunk':
          // A booze table got him: he is a Day Drinker now.
          f = add(POP, now, e.x * T, e.y * T - 40);
          if (f) { f.text = 'HIC!'; f.color = '#f0a830'; f.r = 0.14; f.st = JAGGED; f.sz = 14; }
          break;
        case 'bought':
          // A shopper actually bought something: the money over the stand, and SOLD.
          f = add(TEXT, now, e.x * T, e.y * T - 30);
          if (f) { f.text = '+$' + (e.v | 0); f.color = '#ffd23f'; }
          // (Beside the stand, low: the money floats up and away from it.)
          f = add(POP, now, e.x * T + 40, e.y * T - 14);
          if (f) { f.text = 'SOLD!'; f.color = '#4ade80'; f.r = -0.12; f.st = STAR; f.sz = 13; }
          break;
        case 'trail':
          f = add(MARK, now, e.x * T + 8, e.y * T - 40);
          if (f) { f.text = 'hubba hubba'; f.color = '#ff3d7f'; f.st = 1; }
          break;
        case 'pet':
          f = add(MARK, now, e.x * T + 18, e.y * T - 34);
          if (f) { f.text = e.n > 1 ? 'AWWW x' + e.n : 'AWWW'; f.color = '#ff8fc4'; f.st = 1; }
          break;
        case 'caught':
          f = add(POP, now, e.x * T, e.y * T - 34);
          if (f) { f.text = e.carry ? 'UP YOU GET' : 'gotcha'; f.color = '#4ade80'; f.r = 0.08; f.sz = e.carry ? 11 : 13; }
          break;
        case 'crawl':
          f = add(BLIP, now, e.x * T, e.y * T - 22);
          if (f) { f.text = "MOMMY'S COMING"; f.color = '#c2307a'; f.sz = 11; }
          break;
        case 'rail': {
          // The beam: from the gun's front end, straight out along its facing, the full length.
          timers.railAt[e.i] = now;
          const [cx, cy, fw] = centre(s, e.i, 'railgun', e.d);
          const [dx, dy] = DIRS[e.d & 3];
          f = add(BEAM, now, cx + dx * fw * T / 2, cy + dy * fw * T / 2);
          if (f) {
            f.x2 = f.x + dx * (e.len || 10) * T; f.y2 = f.y + dy * (e.len || 10) * T;
            const b = s && s.grid[e.i];
            f.w = (b && b.k === 'railgun' ? statsOf(b, s).width : BUILD.railgun.width) * 2 * T;
            f.sz = e.n | 0;
          }
          break;
        }
        case 'pee': {
          // A spritz of yellow over the building the dog went for.
          const [cx, cy] = centre(s, e.i, e.k);
          f = add(POP, now, cx, cy - 24);
          if (f) { f.text = 'PSSSST'; f.color = '#f2d21b'; f.r = -0.08; f.st = SPLASH; f.sz = 11; }
          break;
        }
        case 'flash':
          f = add(POP, now, e.x * T, e.y * T - 48);
          if (f) { f.text = 'TA-DA!'; f.color = '#ff5fa8'; f.r = -0.1; f.st = STAR; f.sz = 13; }
          if (e.n > 0) {
            f = add(MARK, now, e.x * T + 26, e.y * T - 30);
            if (f) { f.text = e.n > 1 ? `PHWOAR x${e.n}` : 'PHWOAR'; f.color = '#ff3d7f'; f.st = 1; }
          }
          break;
        case 'fall':
          f = add(POP, now, e.x * T, e.y * T - 20);
          if (f) { f.text = 'THUD'; f.color = '#e0a33a'; f.r = 0.12; f.st = JAGGED; f.sz = 13; }
          break;
        case 'pitch': {
          // A little mark over the shopper every time; a shout from the stand only now and then.
          f = add(MARK, now, e.x * T, e.y * T - 44);
          if (f) {
            f.text = e.r === 'rush' ? 'NOPE' : 'ooh';
            f.color = e.r === 'rush' ? '#cbd5e1' : '#7dd3fc';
            f.st = e.r === 'rush' ? 2 : 0;
          }
          if (now - pitchAt < PITCH_GAP || !s) break;
          const stand = nearestSalesman(s, e.x, e.y);
          if (stand < 0) break;
          const [cx, cy] = centre(s, stand, 'salesman');
          f = add(BLIP, now, cx + 10, cy - 52);
          if (f) { pitchAt = now; pick++; f.text = PITCH_LINES[pick % PITCH_LINES.length]; f.color = '#b8860b'; f.sz = 11; }
          break;
        }
        case 'kidtv':
          f = add(BLIP, now, e.x * T + 4, e.y * T - 22);
          if (f) { f.text = 'OOH, KNIVES!'; f.color = '#e8590c'; f.sz = 11; }
          break;
        case 'shield':
          f = add(SHIELD, now, e.x * T, e.y * T - 18);
          if (f) f.r = hash2(now | 0, 3) * 6;
          break;
        case 'pop':
          // A Pregnant Lady popped: e.n babies came out where she stood. (pup: a pregnant Stray
          // Dog and her puppies, the spayed card; st says which.)
          f = add(BURST, now, e.x * T, e.y * T);
          if (f) {
            pick++;
            const quips = e.pup ? PUP_QUIPS : e.sup ? OCTO_QUIPS : POP_QUIPS;
            f.sz = e.n | 0; f.r = e.sup ? 1 : 0; f.t2 = quips[pick % quips.length]; f.st = e.pup ? 1 : 0;
            f.x2 = Math.round(e.x * 97 + e.y * 31); // seeds where the bits fly
          }
          break;
        case 'nopop':
          // A Barcode Laser finished her: no babies. Says so, so the players learn the counter.
          f = add(NO_POP, now, e.x * T, e.y * T);
          if (f) { f.r = e.sup ? 1 : 0; f.st = e.pup ? 1 : 0; }
          break;
        case 'bolt':
          f = add(POP, now, e.x * T + 14, e.y * T - 30);
          if (f) { f.text = 'WOOF!'; f.color = '#d9372b'; f.r = -0.12; f.st = JAGGED; f.sz = 15; }
          break;
        case 'smash': {
          // A building still standing (left > 0) is still on the grid; a destroyed one is in the
          // rubble list, which remembers its facing.
          let d = 0;
          if (s && e.left === 0 && s.rubble) {
            for (let k = s.rubble.length - 1; k >= 0; k--) if (s.rubble[k].i === e.i) { d = s.rubble[k].d | 0; break; }
          }
          const [x, y, fw, fh] = centre(s, e.i, e.k || 'crate', d);
          if (e.left > 0) {
            // It took the hit and is still standing: a dent, a few chips and a smaller word.
            f = add(DENT, now, x, y);
            if (f) { f.x2 = e.i; f.text = e.k || 'crate'; }
            f = add(POP, now, x + 8, y - fh * T / 2 - 2);
            if (f) { f.text = e.left === 1 ? 'CLANG!' : 'BONK'; f.color = '#ffd23f'; f.r = -0.12; f.st = PLAIN; f.sz = 11; }
            break;
          }
          f = add(DEBRIS, now, x, y);
          if (f) { f.x2 = e.i; f.text = e.k || 'crate'; f.sz = Math.max(fw, fh); }
          f = add(POP, now, x, y - fh * T / 2 - 6);
          if (f) {
            const crate = !e.k || e.k === 'crate';
            f.text = crate ? 'CRUNCH' : 'CRASH!'; f.color = crate ? C.orange : '#ff5a4e'; f.r = 0.1; f.st = JAGGED; f.sz = 14;
          }
          break;
        }
        case 'upgraded': {
          if (!(e.x >= 0 && e.y >= 0 && e.x < W && e.y < H)) break;
          const ai = e.y * W + e.x;
          timers.upAt[ai] = now;
          const b = s && s.grid[ai];
          const [cx, cy] = centre(s, ai, e.k, b ? b.d | 0 : 0);
          f = add(UPGRADE, now, cx, cy);
          if (f) {
            const look = TRACK_LOOK[e.t];
            f.text = look ? `${look[1]} ${e.lv | 0}` : 'LV ' + (e.lv | 0);
            f.color = look ? look[0] : '#ffd23f';
            f.r = (e.x * 7 + e.y * 3) % 10;
          }
          break;
        }
        default:
      }
    }
  }

  /**
   * The centre of a building's footprint in logical pixels, and its size in tiles: [cx, cy, w, h].
   * The building on the anchor tile decides the facing if it is still there; otherwise `d`.
   */
  function centre(s, ai, k, d = 0) {
    const g = s && s.grid && s.grid[ai];
    const b = g && g.part === undefined ? g : null;
    const kind = b ? b.k : k;
    const def = BUILD[kind];
    const [fw, fh] = def ? sizeOf(kind, def.rot ? (b ? b.d | 0 : d) : 0) : [1, 1];
    return [(ai % W) * T + (fw * T) / 2, ((ai / W) | 0) * T + (fh * T) / 2, fw, fh];
  }

  /** The anchor tile of the TV Salesman nearest (x, y) in tiles, or -1. */
  function nearestSalesman(s, x, y) {
    let best = -1, bd = Infinity;
    const g = s.grid;
    // Only near the shopper: his reach is a few tiles, upgraded a few more.
    const r = 10, x0 = Math.max(0, (x | 0) - r), x1 = Math.min(W - 1, (x | 0) + r);
    const y0 = Math.max(0, (y | 0) - r), y1 = Math.min(H - 1, (y | 0) + r);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const b = g[ty * W + tx];
        if (!b || b.k !== 'salesman' || b.part !== undefined || b.off > 0) continue;
        const d2 = (tx + 1 - x) ** 2 + (ty + 1 - y) ** 2;
        if (d2 < bd) { bd = d2; best = ty * W + tx; }
      }
    }
    return best;
  }

  /**
   * Draws live effects. layer 0 is under the shoppers (sprinkler bursts, the ring of a pep talk),
   * layer 1 above them. zoom: screen pixels a tile; the boss's effects grow when zoomed out so they
   * can still be read. bossGrow: how much bigger the boss is drawn (the bde card), so his pep talk
   * still comes out over his head.
   */
  function draw(ctx, now, layer, sprites, zoom = 40, bossGrow = 1) {
    ZK = Math.max(1, 36 / zoom);
    BG = bossGrow;
    for (let k = 0; k < POOL; k++) {
      const e = pool[k];
      if (!e.type) continue;
      const k01 = (now - e.t0) / DUR[e.type];
      if (k01 >= 1 || k01 < 0) { count[e.type]--; e.type = 0; continue; }
      if (e.type === PEP) { if (layer === 0) pepRing(ctx, e, k01); else pepWord(ctx, e, k01); continue; }
      if ((e.type === SPRAY) !== (layer === 0)) continue;
      switch (e.type) {
        case TEXT: floatText(ctx, e, k01); break;
        case BLIP: blip(ctx, e, k01, W * T); break;
        case POP: pop(ctx, e, k01); break;
        case SHOT: shot(ctx, e, k01, sprites); break;
        case SPRAY: spray(ctx, e, k01); break;
        case DEBRIS: if (e.text === 'crate') debris(ctx, e, k01); else wreckage(ctx, e, k01); break;
        case DENT: dent(ctx, e, k01); break;
        case UPGRADE: upgrade(ctx, e, k01); break;
        case BEAM: beam(ctx, e, k01); break;
        case MARK: mark(ctx, e, k01); break;
        case SHIELD: shield(ctx, e, k01); break;
        case BOSS_IN: bossIn(ctx, e, k01, W * T, H * T); break;
        case BOSS_OUT: bossOut(ctx, e, k01, W * T); break;
        case BOSS_ESC: bossEscape(ctx, e, k01, W * T); break;
        case BURST: popBurst(ctx, e, k01, W * T); break;
        case NO_POP: noPop(ctx, e, k01); break;
        case BABY_CASH: babyFigure(ctx, e, k01); break;
        default:
      }
    }
    ctx.globalAlpha = 1;
  }

  return { handle, draw, timers, setMap };
}

/** How much bigger the boss's effects are drawn this frame (zoomed out: bigger). */
let ZK = 1;
/** How much bigger the boss himself is drawn this frame (the bde card), for what sits over his head. */
let BG = 1;

/** The boss's title at a tier, from the rules (with a fallback if they have none). */
function titleOf(tier) {
  try { return bossTitle(tier || 1) || 'Regional Manager'; } catch { return 'Regional Manager'; }
}

/**
 * The boss walks in: a red ribbon banner over the entrance, "NOW ENTERING" and his title, with
 * gold stars spinning round it and an arrow down to the door. Lasts a few seconds.
 */
function bossIn(ctx, e, k, worldW, worldH) {
  const z = ZK;
  const pop = k < 0.06 ? 0.4 + (k / 0.06) * 0.75 : k < 0.1 ? 1.15 - (k - 0.06) * 3.75 : 1;
  ctx.globalAlpha = fadeOut(k, 0.82);
  const title = e.text.toUpperCase();
  const size = 17 * z;
  ctx.font = font(size, 900);
  if (!e.w || e.r !== size) { e.w = ctx.measureText(title).width; e.r = size; }
  const bw = Math.max(e.w + 34 * z, 150 * z), bh = 44 * z;
  // Over the entrance, kept inside the store.
  const x = Math.max(bw / 2 + 10 * z, Math.min(worldW - bw / 2 - 10 * z, e.x + (e.x < T * 2 ? bw / 2 - 10 * z : 0)));
  const y = Math.max(bh / 2 + 6, Math.min(worldH - bh, e.y - 70 * z)) - k * 10 * z;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  // Arrow from the banner down toward the door.
  const ax = Math.max(-bw / 2 + 10 * z, Math.min(bw / 2 - 10 * z, (e.x - x) / pop));
  ctx.beginPath();
  ctx.moveTo(ax - 9 * z, bh / 2 - 2); ctx.lineTo(ax, bh / 2 + 14 * z); ctx.lineTo(ax + 9 * z, bh / 2 - 2);
  ctx.closePath();
  paint(ctx, '#ffd23f', 2 * z);
  // The ribbon: notched tails behind, then the band.
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * (bw / 2 - 8 * z), -bh / 2 + 8 * z);
    ctx.lineTo(s * (bw / 2 + 16 * z), -bh / 2 + 8 * z);
    ctx.lineTo(s * (bw / 2 + 8 * z), 4 * z);
    ctx.lineTo(s * (bw / 2 + 16 * z), bh / 2 + 6 * z);
    ctx.lineTo(s * (bw / 2 - 8 * z), bh / 2 + 6 * z);
    ctx.closePath();
    paint(ctx, e.st === MOB_LOOK ? '#4c1d95' : '#8f1414', 2 * z);
  }
  rr(ctx, -bw / 2, -bh / 2, bw, bh, 5 * z);
  paint(ctx, e.st === MOB_LOOK ? '#7e22ce' : '#d42020', 2.4 * z);
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 1.6 * z;
  rr(ctx, -bw / 2 + 4 * z, -bh / 2 + 4 * z, bw - 8 * z, bh - 8 * z, 3 * z);
  ctx.stroke();
  label(ctx, e.st === MOB_LOOK ? e.t2 : 'NOW ENTERING', 0, -bh / 2 + 12 * z, 9 * z, '#ffd23f', null);
  label(ctx, title, 0, 6 * z, size, '#ffffff', INK, 4 * z);
  // Gold stars circling it.
  for (let j = 0; j < 6; j++) {
    const a = k * 9 + (j * Math.PI * 2) / 6;
    starPath(ctx, Math.cos(a) * (bw / 2 + 4 * z), Math.sin(a) * (bh / 2 + 10 * z), 5 * z, a);
    paint(ctx, '#ffe14a', 1.2 * z);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Layer 0 of a pep talk: rings of corporate enthusiasm spreading out to the reach of his voice. */
function pepRing(ctx, e, k) {
  const R = e.w || 140;
  for (let j = 0; j < 2; j++) {
    const kk = Math.min(1, Math.max(0, (k - j * 0.15) / 0.6));
    if (kk <= 0 || kk >= 1) continue;
    ctx.globalAlpha = 0.85 * (1 - kk);
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 8, R * kk, R * kk * 0.62, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6 * (1 - kk) + 2;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Layer 1 of a pep talk: the buzzword in a burst beside his head, and who it worked on. */
function pepWord(ctx, e, k) {
  const z = ZK;
  ctx.globalAlpha = fadeOut(k, 0.65);
  const s = k < 0.1 ? 0.5 + (k / 0.1) * 0.6 : k < 0.18 ? 1.1 - (k - 0.1) * 1.25 : 1;
  ctx.save();
  ctx.translate(e.x + 34 * z * BG, e.y - 70 * z * BG - k * 10 * z);
  ctx.rotate(e.r);
  ctx.scale(s, s);
  const size = 13 * z;
  ctx.font = font(size);
  const w = ctx.measureText(e.text).width;
  burstPath(ctx, 0, 0, Math.max(22 * z, w * 0.5), 13, 0.2);
  paint(ctx, '#e0f2fe', 2 * z);
  label(ctx, e.text, 0, 0, size, '#0b4f8a', null);
  if (e.sz > 0) label(ctx, `+${e.sz} MOTIVATED`, 0, 20 * z, 9 * z, '#4ade80', INK, 3 * z);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Driven out: the bounty in big gold figures, a burst of banknotes, and his parting shot. */
function bossOut(ctx, e, k, worldW) {
  const z = ZK;
  // Banknotes flung out and fluttering down.
  ctx.globalAlpha = fadeOut(k, 0.55);
  for (let j = 0; j < 14; j++) {
    const a = (j / 14) * Math.PI * 2 + hash2(j, 9) * 0.5;
    const v = (40 + hash2(j, 3) * 50) * z;
    const x = e.x + Math.cos(a) * v * Math.min(1, k * 2.2);
    const y = e.y - 30 * z + Math.sin(a) * v * 0.6 * Math.min(1, k * 2.2) + 50 * z * k * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + k * 6 * (j % 2 ? 1 : -1));
    rr(ctx, -5 * z, -2.8 * z, 10 * z, 5.6 * z, 1);
    paint(ctx, '#86efac', 1.1 * z);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(-1.2 * z, -1.6 * z, 2.4 * z, 3.2 * z);
    ctx.restore();
  }
  if (k < 0.3) {
    ctx.globalAlpha = 1 - k / 0.3;
    starPath(ctx, e.x, e.y - 30 * z, (24 + k * 60) * z, k * 2);
    paint(ctx, '#fff3a8', 2 * z);
  }
  ctx.globalAlpha = fadeOut(k, 0.7);
  const grow = k < 0.1 ? 0.5 + k * 5 : 1;
  label(ctx, e.text, e.x, e.y - 40 * z - k * 30 * z, 26 * z * grow, '#ffd23f', INK, 6 * z);
  label(ctx, 'BOSS DOWN!', e.x, e.y - 14 * z - k * 30 * z, 12 * z, '#4ade80', INK, 4 * z);
  // His parting shot, in a bubble.
  if (k > 0.08) quip(ctx, e.t2, e.x, e.y - 72 * z - k * 12 * z, 11 * z, '#1e3a8a', worldW, fadeOut(k, 0.75));
  ctx.globalAlpha = 1;
}

/**
 * The boss reached a till: a red shockwave, a huge "-$" figure, how many refunds he counts as, and
 * his gloating line. (The renderer also flashes the edges of the screen red: timers.bossEscAt.)
 */
function bossEscape(ctx, e, k, worldW) {
  const z = ZK;
  const x = Math.min(e.x, worldW - 110 * z);
  for (let j = 0; j < 3; j++) {
    const kk = Math.min(1, Math.max(0, (k - j * 0.12) / 0.5));
    if (kk <= 0 || kk >= 1) continue;
    ctx.globalAlpha = 0.8 * (1 - kk);
    ctx.beginPath();
    ctx.arc(e.x, e.y, (20 + kk * 160) * z, 0, Math.PI * 2);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = (10 * (1 - kk) + 2) * z;
    ctx.stroke();
  }
  ctx.globalAlpha = fadeOut(k, 0.7);
  const s = k < 0.08 ? 0.4 + (k / 0.08) * 0.8 : k < 0.14 ? 1.2 - (k - 0.08) * 3.3 : 1;
  ctx.save();
  ctx.translate(x - 30 * z, e.y - 30 * z);
  ctx.rotate(-0.08);
  ctx.scale(s, s);
  burstPath(ctx, 0, 0, 52 * z, 13, 0.2);
  paint(ctx, '#7f1d1d', 2.5 * z);
  label(ctx, e.text, 0, -6 * z, 26 * z, '#ff5a4e', INK, 6 * z);
  label(ctx, `COUNTS AS ${e.sz} REFUNDS`, 0, 18 * z, 9.5 * z, '#ffffff', INK, 3 * z);
  ctx.restore();
  if (k > 0.1) quip(ctx, e.t2, x - 30 * z, e.y - 92 * z - k * 10 * z, 11 * z, '#b91c1c', worldW, fadeOut(k, 0.75));
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ the Pregnant Lady

const TAU = Math.PI * 2;

/** A dummy (pacifier), facing up: the shield, the teat and the ring. s: size. */
function dummy(ctx, x, y, s, col) {
  ctx.beginPath();
  ctx.arc(x, y - s * 1.3, s * 0.7, 0, TAU);
  ctx.lineWidth = s * 0.45; ctx.strokeStyle = col; ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, s * 1.6, s * 0.8, 0, 0, TAU);
  paint(ctx, col, Math.max(1, s * 0.3));
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.95, s * 0.5, s * 0.6, 0, 0, TAU);
  paint(ctx, '#ffe9b8', Math.max(0.8, s * 0.25));
}

/** A clean nappy, flying: a white pad with coloured tabs. */
function nappy(ctx, s, tab) {
  ctx.beginPath();
  ctx.moveTo(-s * 1.6, -s); ctx.lineTo(s * 1.6, -s); ctx.lineTo(s * 0.8, s); ctx.lineTo(-s * 0.8, s);
  ctx.closePath();
  paint(ctx, '#ffffff', Math.max(1, s * 0.3));
  ctx.fillStyle = tab;
  ctx.fillRect(-s * 1.6, -s, s * 0.7, s * 0.6);
  ctx.fillRect(s * 0.9, -s, s * 0.7, s * 0.6);
}

/** A baby's bottle: milk, a cap and a teat. */
function bottle(ctx, s) {
  rr(ctx, -s * 0.7, -s, s * 1.4, s * 2.2, s * 0.4);
  paint(ctx, '#f8fafc', Math.max(1, s * 0.3));
  ctx.fillStyle = '#e0f2fe';
  ctx.fillRect(-s * 0.55, -s * 0.1, s * 1.1, s * 1.15);
  rr(ctx, -s * 0.8, -s * 1.5, s * 1.6, s * 0.6, s * 0.2);
  paint(ctx, '#5cc8ff', Math.max(0.8, s * 0.25));
  ctx.beginPath(); ctx.arc(0, -s * 1.6, s * 0.4, Math.PI, TAU);
  paint(ctx, '#ffe9b8', Math.max(0.8, s * 0.25));
}

/**
 * She popped: a white flash, pink and blue rings bursting out, nappies, dummies, bottles and
 * confetti flung up and raining down (a party popper, not a delivery room), "POP!" in a pink burst
 * with how many babies came out, and a line in a bubble. Octomom's (e.r 1) is half as big again.
 * Grows when zoomed out, like the boss's effects, so a pop is seen at whole-map zoom.
 */
/** A dog's bone, centred on the origin, s about its half-length. */
function bone(ctx, s) {
  ctx.beginPath();
  ctx.rect(-s, -s * 0.28, s * 2, s * 0.56);
  for (const [x, y] of [[-s, -s * 0.32], [-s, s * 0.32], [s, -s * 0.32], [s, s * 0.32]]) { ctx.moveTo(x + s * 0.34, y); ctx.arc(x, y, s * 0.34, 0, TAU); }
  paint(ctx, '#fff4dc', 1);
}

function popBurst(ctx, e, k, worldW) {
  const z = ZK, sc = (e.r ? 1.45 : 1) * z;
  const seed = e.x2 | 0;
  const cy = e.y - 14 * sc;
  if (k < 0.16) {
    ctx.globalAlpha = 1 - k / 0.16;
    burstPath(ctx, e.x, cy, (14 + k * 160) * sc, 12, seed % 7);
    paint(ctx, '#ffffff', 2 * z);
  }
  for (let j = 0; j < 2; j++) {
    const kk = Math.min(1, Math.max(0, (k - j * 0.07) / 0.5));
    if (kk <= 0 || kk >= 1) continue;
    ctx.globalAlpha = 0.9 * (1 - kk);
    ctx.beginPath();
    ctx.ellipse(e.x, e.y - 4 * sc, (10 + kk * 74) * sc, (6 + kk * 44) * sc, 0, 0, TAU);
    ctx.strokeStyle = j ? '#5cc8ff' : '#ff7eb6';
    ctx.lineWidth = (7 * (1 - kk) + 1.5) * z;
    ctx.stroke();
  }
  // Everything that came out with them.
  ctx.globalAlpha = fadeOut(k, 0.62);
  const bits = e.r ? 30 : 18;
  const out = Math.min(1, k * 2.4);
  for (let j = 0; j < bits; j++) {
    const h1 = hash2(seed, j), h2 = hash2(j, seed + 5);
    const a = (j / bits) * TAU + h1 * 0.6;
    const v = (46 + h2 * 58) * sc;
    const x = e.x + Math.cos(a) * v * out;
    const y = cy + Math.sin(a) * v * 0.62 * out - 34 * sc * k + 80 * sc * k * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + k * (h1 > 0.5 ? 7 : -7));
    const kind = j % 6;
    if (e.st === 1) {
      // A litter: bones and tufts of fur instead of nappies.
      if (kind % 2 === 0) bone(ctx, 3.2 * sc);
      else { ctx.fillStyle = ['#c27a32', '#f6e2b8', '#d4d8dc'][j % 3]; ctx.beginPath(); ctx.arc(0, 0, 2.6 * sc, 0, TAU); ctx.fill(); }
    } else if (kind === 0 || kind === 3) nappy(ctx, 3.4 * sc, j % 4 ? '#7dd3fc' : '#ff9ccf');
    else if (kind === 1) dummy(ctx, 0, 0, 2.4 * sc, j % 4 ? '#ff7eb6' : '#5cc8ff');
    else if (kind === 4 && j % 4 === 0) bottle(ctx, 3 * sc);
    else {
      ctx.fillStyle = ['#ff7eb6', '#5cc8ff', '#ffd23f', '#a3e635'][j % 4];
      ctx.fillRect(-2.6 * sc, -1.5 * sc, 5.2 * sc, 3 * sc);
    }
    ctx.restore();
  }
  // "POP!" and the head count.
  ctx.globalAlpha = fadeOut(k, 0.72);
  const s = k < 0.07 ? 0.4 + (k / 0.07) * 0.8 : k < 0.13 ? 1.2 - (k - 0.07) * 3.3 : 1;
  ctx.save();
  ctx.translate(e.x, e.y - 58 * sc - k * 14 * z);
  ctx.rotate(-0.1);
  ctx.scale(s, s);
  burstPath(ctx, 0, 0, 27 * sc, 12, 0.2);
  paint(ctx, '#fff0f7', 2.2 * z);
  label(ctx, e.st === 1 ? 'WHELP!' : 'POP!', 0, -1 * sc, (e.st === 1 ? 18 : 21) * sc, '#ff3d8b', INK, 5 * z);
  if (e.sz > 0) label(ctx, `+${e.sz} ${e.st === 1 ? 'PUPPIES' : 'BABIES'}`, 0, 27 * sc, 10 * sc, e.st === 1 ? '#f0c38a' : '#7dd3fc', INK, 3.2 * z);
  ctx.restore();
  if (k > 0.14 && e.t2) quip(ctx, e.t2, e.x + 24 * z, e.y - 100 * sc - k * 8 * z, 10 * z, '#c2307a', worldW, fadeOut(k, 0.75));
  ctx.globalAlpha = 1;
}

/**
 * A Barcode Laser finished her: a "no babies" sign (a dummy with a red bar through it) pops up over
 * her with "NOT TODAY", short and clear, so the players learn that the laser is the counter.
 */
function noPop(ctx, e, k) {
  const z = ZK * (e.r ? 1.2 : 1);
  ctx.globalAlpha = fadeOut(k, 0.7);
  const s = k < 0.1 ? 0.4 + (k / 0.1) * 0.75 : k < 0.17 ? 1.15 - (k - 0.1) * 2.1 : 1;
  // Above the speech bubble she storms off with (the 'left' that comes with it).
  const R = 15 * z;
  ctx.save();
  ctx.translate(e.x, e.y - 52 * z - R - k * 8 * z);
  ctx.scale(s, s);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU);
  paint(ctx, '#ffffff', 2 * z);
  if (e.st === 1) { ctx.save(); ctx.translate(0, 1 * z); bone(ctx, 4.4 * z); ctx.restore(); } else dummy(ctx, 0, 3.5 * z, 3.9 * z, '#ff7eb6');
  ctx.beginPath(); ctx.arc(0, 0, R - 1.8 * z, 0, TAU);
  ctx.moveTo(-R * 0.64, -R * 0.64); ctx.lineTo(R * 0.64, R * 0.64);
  ctx.strokeStyle = '#e11d2a'; ctx.lineWidth = 3.8 * z; ctx.lineCap = 'round'; ctx.stroke();
  label(ctx, 'NOT TODAY', 0, -R - 10 * z, 14 * z, '#ff3b30', INK, 4 * z);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Babies' refunds at one till, added up: smaller and paler than a real refund's figure. */
function babyFigure(ctx, e, k) {
  ctx.globalAlpha = fadeOut(k, 0.6);
  const grow = k < 0.12 ? 0.6 + (k / 0.12) * 0.4 : 1;
  const y = Math.max(10, e.y - k * 22);
  label(ctx, '-$' + e.w, e.x, y, 12 * grow, '#ff8a80', INK, 3);
  if (e.sz > 1) {
    ctx.font = font(12);
    const w = ctx.measureText('-$' + e.w).width;
    label(ctx, 'x' + e.sz, e.x + w / 2 + 9, y + 1, 9, '#7dd3fc', INK, 2.5);
  }
  ctx.globalAlpha = 1;
}

/** A white speech bubble with a line in it, kept inside the world. */
function quip(ctx, str, x, y, size, color, worldW, alpha) {
  ctx.globalAlpha = alpha;
  ctx.font = font(size);
  const w = ctx.measureText(str).width + size * 1.2, h = size * 1.8;
  const cx = Math.max(w / 2 + 4, Math.min(worldW - w / 2 - 4, x));
  rr(ctx, cx - w / 2, y - h, w, h, size * 0.5);
  ctx.moveTo(x - 4, y); ctx.lineTo(x - 2, y + size * 0.6); ctx.lineTo(x + 5, y);
  paint(ctx, '#ffffff', Math.max(2, size * 0.16));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 3.5, y - 2, 8, 3);
  label(ctx, str, cx, y - h / 2, size, color, null);
  ctx.globalAlpha = 1;
}

function fadeOut(k, from = 0.7) {
  return k < from ? 1 : 1 - (k - from) / (1 - from);
}

function floatText(ctx, e, k) {
  ctx.globalAlpha = fadeOut(k);
  const grow = k < 0.12 ? 0.6 + (k / 0.12) * 0.4 : 1;
  label(ctx, e.text, e.x, Math.max(12, e.y - k * 28), 17 * grow, e.color, INK, 4);
  ctx.globalAlpha = 1;
}

/** A speech bubble with a tail, kept inside the world so it is never cut off. */
function blip(ctx, e, k, worldW) {
  ctx.globalAlpha = fadeOut(k, 0.8);
  const size = e.sz || 13;
  ctx.font = font(size);
  if (!e.w) e.w = ctx.measureText(e.text).width + 12;
  const w = e.w, h = size + 9;
  const x = Math.max(w / 2 + 4, Math.min(worldW - w / 2 - 4, e.x));
  const y = Math.max(h + 4, e.y - k * 8);
  const pin = k < 0.1 ? 0.7 + k * 3 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pin, pin);
  rr(ctx, -w / 2, -h, w, h, 6);
  ctx.moveTo(-4, 0);
  ctx.lineTo(-7, 7);
  ctx.lineTo(3, 0);
  paint(ctx, '#ffffff', 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-4.5, -2, 7, 3); // hide the outline where the tail joins
  label(ctx, e.text, 0, -h / 2, size, e.color, null);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** A comic word that pops up with a little starburst. */
function pop(ctx, e, k) {
  ctx.globalAlpha = fadeOut(k, 0.6);
  const s = k < 0.15 ? 0.5 + (k / 0.15) * 0.6 : k < 0.25 ? 1.1 - (k - 0.15) : 1;
  ctx.save();
  ctx.translate(e.x, e.y - k * 12);
  ctx.rotate(e.r);
  ctx.scale(s, s);
  if (e.st === STAR) {
    starPath(ctx, 0, 0, 22, 0);
    paint(ctx, '#ffffff', 2);
  } else if (e.st === JAGGED) {
    burstPath(ctx, 0, 0, 22, 11, 0.2);
    paint(ctx, '#fff3a8', 2);
  } else if (e.st === SPLASH) {
    // Droplets thrown up out of the splat, falling back.
    ctx.beginPath();
    for (let j = 0; j < 7; j++) {
      const a = -Math.PI * (0.08 + 0.84 * (j / 6));
      const d = 10 + k * 20;
      const x = Math.cos(a) * d * 1.3, y = 10 + Math.sin(a) * d + k * k * 26;
      ctx.moveTo(x + 2.2, y);
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    }
    paint(ctx, e.color, 1.2);
  }
  label(ctx, e.text, 0, 0, e.sz || (e.text === 'ooh' ? 13 : 14), e.color, INK, 3.5);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Forklift shot: a box flies along a tracer to the target, then a starburst on impact. */
function shot(ctx, e, k, sprites) {
  const dx = e.x2 - e.x, dy = e.y2 - e.y;
  const len = Math.hypot(dx, dy) || 1;
  const sx = e.x + (dx / len) * 16, sy = e.y + (dy / len) * 16; // from the fork tips
  const p = Math.min(1, k * 2.2);
  const px = sx + (e.x2 - sx) * p, py = sy + (e.y2 - sy) * p;
  ctx.globalAlpha = 1 - k * 0.6;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(px, py);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,225,74,0.95)';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (p < 1) drawItem(ctx, sprites, 'box', px, py, 16);
  else {
    const q = (k - 1 / 2.2) / (1 - 1 / 2.2);
    ctx.globalAlpha = 1 - q;
    starPath(ctx, e.x2, e.y2 - 6, 9 + q * 6, q);
    paint(ctx, C.orange, 2);
  }
  ctx.globalAlpha = 1;
}

/** Pepper sprinkler burst: an orange cloud and droplets reaching out to its range. */
function spray(ctx, e, k) {
  const R = e.w || BUILD.sprinkler.range * T; // the range of the sprinkler at its level
  const r = R * (0.3 + 0.7 * Math.sqrt(k));
  // A soft cloud of pepper...
  ctx.globalAlpha = 0.32 * (1 - k);
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
  ctx.fillStyle = C.orange;
  ctx.fill();
  // ...jets streaking outward from the head...
  const rot = e.t0 * 0.0013;
  ctx.globalAlpha = 0.85 * (1 - k);
  ctx.beginPath();
  for (let j = 0; j < SPRAY_DROPS; j++) {
    const a = rot + (j * Math.PI * 2) / SPRAY_DROPS;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(e.x + c * r * 0.45, e.y + s * r * 0.45);
    ctx.lineTo(e.x + c * r * 0.8, e.y + s * r * 0.8);
  }
  ctx.strokeStyle = '#ff7a1a';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();
  // ...ending in droplets.
  ctx.beginPath();
  for (let j = 0; j < SPRAY_DROPS; j++) {
    const a = rot + (j * Math.PI * 2) / SPRAY_DROPS;
    const x = e.x + Math.cos(a) * r * 0.9, y = e.y + Math.sin(a) * r * 0.9;
    ctx.moveTo(x + 2.4, y);
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
  }
  ctx.fillStyle = '#ff5a1a';
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A crate stack smashed apart: planks and splinters flung outward, and a puff of dust. */
// (Other kinds of building fly apart in their own colours: see wreckage below.)
function debris(ctx, e, k) {
  const seed = e.x2 | 0;
  ctx.globalAlpha = 0.55 * (1 - k);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 4, 12 + k * 26, 7 + k * 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#d8c7a6';
  ctx.fill();
  ctx.globalAlpha = fadeOut(k, 0.6);
  for (let j = 0; j < DEBRIS_BITS; j++) {
    const h1 = hash2(seed, j), h2 = hash2(j, seed + 7);
    const a = (j / DEBRIS_BITS) * Math.PI * 2 + h1 * 0.6;
    const v = 30 + h2 * 34;
    // Out along the angle, thrown up and falling back down.
    const x = e.x + Math.cos(a) * v * k;
    const y = e.y + Math.sin(a) * v * k * 0.6 - 40 * k + 46 * k * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + k * (h1 > 0.5 ? 9 : -9));
    if (j % 3 !== 2) {
      ctx.beginPath();
      ctx.rect(-6, -1.8, 12, 3.6);
      paint(ctx, j % 2 ? '#b57a3c' : C.wood, 1.3);
      ctx.fillStyle = '#7a4f22';
      ctx.fillRect(-4, -0.4, 2, 0.9);
    } else {
      ctx.beginPath();
      ctx.moveTo(-4, 0); ctx.lineTo(4, -1.2); ctx.lineTo(3, 1.2);
      ctx.closePath();
      paint(ctx, C.cardboardLight, 1);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/**
 * Anything else a gym bro wrecks: shards and panels in the building's own colours flung outward,
 * a few sparks, and the same puff of dust. Crates keep their planks (debris above).
 */
function wreckage(ctx, e, k) {
  const seed = e.x2 | 0;
  const col = KIND_COLOURS[e.text] || KIND_COLOURS.crate;
  // A big building (sz = its longer side in tiles) goes up in a bigger burst.
  const sc = e.sz > 1 ? 1 + (e.sz - 1) * 0.55 : 1;
  const bits = DEBRIS_BITS + 2 + (sc > 1 ? 6 : 0);
  ctx.globalAlpha = 0.55 * (1 - k);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 4, (12 + k * 26) * sc, (7 + k * 12) * sc, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#cfcac0';
  ctx.fill();
  ctx.globalAlpha = fadeOut(k, 0.6);
  for (let j = 0; j < bits; j++) {
    const h1 = hash2(seed, j), h2 = hash2(j, seed + 7);
    const a = (j / bits) * Math.PI * 2 + h1 * 0.6;
    const v = (30 + h2 * 38) * sc;
    const x = e.x + Math.cos(a) * v * k;
    const y = e.y + Math.sin(a) * v * k * 0.6 - 40 * k + 46 * k * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + k * (h1 > 0.5 ? 10 : -10));
    ctx.beginPath();
    if (j % 4 === 3) {
      // A bolt or spring.
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      paint(ctx, '#5b6168', 1);
    } else if (j % 2) {
      ctx.moveTo(-5, 1.5); ctx.lineTo(3, -3); ctx.lineTo(5, 2.5);
      ctx.closePath();
      paint(ctx, col[j % 3], 1.2);
    } else {
      ctx.rect(-5.5, -2.5, 11, 5);
      paint(ctx, col[(j >> 1) % 3], 1.3);
    }
    ctx.restore();
  }
  // Sparks in the first moment.
  if (k < 0.35) {
    ctx.globalAlpha = 1 - k / 0.35;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const a = hash2(seed + 3, j) * Math.PI * 2, r0 = 6 + k * 40, r1 = r0 + 7;
      ctx.moveTo(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0);
      ctx.lineTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1);
    }
    ctx.strokeStyle = '#ffe14a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** An upgraded building that was hit and lost a level: a jolt of stars and a few chips. */
function dent(ctx, e, k) {
  const seed = e.x2 | 0;
  const col = KIND_COLOURS[e.text] || KIND_COLOURS.crate;
  ctx.globalAlpha = fadeOut(k, 0.5);
  starPath(ctx, e.x, e.y - 4, 10 + k * 8, k * 2);
  paint(ctx, '#fff3a8', 1.6);
  for (let j = 0; j < 4; j++) {
    const a = -Math.PI * (0.15 + 0.7 * hash2(seed, j));
    const v = 18 + hash2(j, seed) * 14;
    const x = e.x + Math.cos(a) * v * k, y = e.y - 4 + Math.sin(a) * v * k + 30 * k * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(k * 8 + j);
    ctx.beginPath();
    ctx.rect(-3, -1.5, 6, 3);
    paint(ctx, col[j % 3], 1);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** Upgraded: a gold ring bursting out, sparkles spinning off, and the new level rising. */
function upgrade(ctx, e, k) {
  const r = 10 + k * 26;
  ctx.globalAlpha = Math.max(0, 1 - k * 1.3);
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = e.color || '#ffd23f';
  ctx.lineWidth = 4 * (1 - k) + 1;
  ctx.stroke();
  ctx.globalAlpha = fadeOut(k, 0.55);
  for (let j = 0; j < 6; j++) {
    const a = e.r + (j * Math.PI * 2) / 6 + k * 2;
    const d = 8 + k * 30;
    starPath(ctx, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.8, 4.5 * (1 - k * 0.5), a);
    paint(ctx, j % 2 ? '#ffffff' : '#ffe14a', 1.1);
  }
  ctx.globalAlpha = fadeOut(k, 0.6);
  const grow = k < 0.15 ? 0.5 + (k / 0.15) * 0.5 : 1;
  label(ctx, e.text, e.x, e.y - 24 - k * 18, 15 * grow, e.color || '#ffd23f', INK, 4);
  ctx.globalAlpha = 1;
}

/**
 * The barcode laser's beam: a red scanning laser the full length at once, a white-hot core in a red
 * glow, barcode stripes flickering across it, and a bright scan line sweeping out along it; a red
 * flash and a "BEEP!" at the window. (x, y) is the scanner's front end, (x2, y2) the far end, w
 * the width it hits.
 */
function beam(ctx, e, k) {
  const fade = 1 - k;
  const w = Math.max(6, e.w || 48);
  const dx = e.x2 - e.x, dy = e.y2 - e.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(e.x2, e.y2);
  ctx.globalAlpha = 0.28 * fade;
  ctx.strokeStyle = '#ff2d2d';
  ctx.lineWidth = w * (1 + k * 0.3);
  ctx.stroke();
  ctx.globalAlpha = 0.9 * fade;
  ctx.strokeStyle = '#ff3b30';
  ctx.lineWidth = w * 0.42 * (1 - k * 0.6);
  ctx.stroke();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = '#fff0f0';
  ctx.lineWidth = Math.max(1.5, w * 0.14 * (1 - k));
  ctx.stroke();
  // Barcode stripes across the beam, re-shuffled several times over its short life.
  const flick = (k * 9) | 0;
  const half = w * 0.5;
  ctx.globalAlpha = 0.55 * fade;
  ctx.strokeStyle = '#5a0a0a';
  for (let pass = 0; pass < 2; pass++) {
    // Thin bars, then fat ones.
    ctx.beginPath();
    for (let j = 0; j < 26; j++) {
      const h = hash2(j + flick * 31, e.t0 | 0);
      if (h < 0.35 || (h > 0.72) !== (pass === 1)) continue;
      const px = e.x + dx * ((j + 0.5) / 26), py = e.y + dy * ((j + 0.5) / 26);
      ctx.moveTo(px + nx * half, py + ny * half);
      ctx.lineTo(px - nx * half, py - ny * half);
    }
    ctx.lineWidth = pass ? 4.5 : 1.6;
    ctx.stroke();
  }
  // The scan line: a bright bar across the beam, sweeping out to the far end and back once.
  const sweep = k < 0.5 ? k / 0.5 : 1 - (k - 0.5) / 0.5;
  const sx = e.x + dx * sweep, sy = e.y + dy * sweep;
  ctx.globalAlpha = Math.min(1, fade * 1.4);
  ctx.beginPath();
  ctx.moveTo(sx + nx * w * 0.75, sy + ny * w * 0.75);
  ctx.lineTo(sx - nx * w * 0.75, sy - ny * w * 0.75);
  ctx.strokeStyle = '#ff2d2d';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Red flash at the window, and the beep.
  ctx.globalAlpha = Math.max(0, 1 - k * 1.8);
  starPath(ctx, e.x, e.y, 14 + k * 10, k * 3);
  paint(ctx, '#ff6b5e', 1.6);
  if (k < 0.85) {
    ctx.globalAlpha = fadeOut(k, 0.55);
    const s = k < 0.12 ? 0.6 + (k / 0.12) * 0.4 : 1;
    // Beside the beam near the window, a little above it.
    const lx = e.x + ux * 30 + nx * 24 * (ny > 0.5 ? -1 : 1), ly = e.y + uy * 30 + ny * 24 * (ny > 0.5 ? -1 : 1) - 8;
    label(ctx, 'BEEP!', lx, ly - k * 8, 15 * s, '#ff3b30', INK, 4);
    if (e.sz > 1) label(ctx, 'x' + e.sz, lx + 36, ly - k * 8 + 1, 12, '#ffd23f', INK, 3.5);
  }
  ctx.globalAlpha = 1;
}

/** A small word over a shopper: st 0 plain, 1 with wolf-whistle marks, 2 with speed lines. */
function mark(ctx, e, k) {
  ctx.globalAlpha = fadeOut(k, 0.6);
  const y = e.y - k * 10;
  const sz = e.st === 1 ? 12 : 10;
  label(ctx, e.text, e.x, y, sz, e.color, INK, 3);
  if (e.st === 1) {
    // Two little whistle marks either side.
    ctx.beginPath();
    for (const sgn of [-1, 1]) {
      ctx.font = font(sz);
      const hw = ctx.measureText(e.text).width / 2 + 4;
      ctx.moveTo(e.x + sgn * hw, y - 4); ctx.lineTo(e.x + sgn * (hw + 5), y - 9);
      ctx.moveTo(e.x + sgn * hw, y + 1); ctx.lineTo(e.x + sgn * (hw + 7), y + 1);
    }
    ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  } else if (e.st === 2) {
    ctx.beginPath();
    for (let j = 0; j < 3; j++) { ctx.moveTo(e.x - 16 - j * 2, y - 4 + j * 4); ctx.lineTo(e.x - 24 - j * 2 - k * 6, y - 4 + j * 4); }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A cosplayer soaking up a shot: a bubble shield flashing round him, and a TINK. */
function shield(ctx, e, k) {
  const r = 20 + k * 8;
  ctx.globalAlpha = 0.5 * (1 - k);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, r, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#7df9ff';
  ctx.fill();
  ctx.globalAlpha = 1 - k;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#e0ffff';
  ctx.stroke();
  // Hexagon facets on the bubble.
  ctx.beginPath();
  for (let j = 0; j < 6; j++) {
    const a = e.r + (j * Math.PI) / 3;
    ctx.moveTo(e.x + Math.cos(a) * r * 0.45, e.y + Math.sin(a) * r * 0.5);
    ctx.lineTo(e.x + Math.cos(a) * r * 0.95, e.y + Math.sin(a) * r * 1.08);
  }
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  if (k < 0.7) label(ctx, 'TINK', e.x + r * 0.9, e.y - r * 0.9, 10, '#e0ffff', INK, 3);
  ctx.globalAlpha = 1;
}
