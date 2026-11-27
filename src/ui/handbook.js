// The Employee Handbook: every shopper, the shop floor's buildings and The Back's parts, with
// their numbers. How patient each shopper is as the sales events go by, how many turn up, what the
// super version changes, what each tier of supply from The Back does for each piece of security,
// and what each part of The Back does. Opened from the menu and from the game (the book button, or
// the ? screen). In a game it uses that game's length, difficulty and number of players; from the
// menu, the standard game.
import { BUILD, SHOPPERS, TUNE, SETTINGS, SUPPLY_TRACKS, shareCount, difficultyOf, tracksOf, statsOf } from '../sim/index.js';
import { HOW, BACK_HOW, SHOPPER_HELP, SUPER_HELP, BOSS_HELP } from '../content/help.js';
import {
  SHOPPER_ORDER, WALL_ORDER, SECURITY_ORDER, BACK_ORDER, shopperFacts, shopperTraits, patienceAt, countIn, sampleWaves,
  tierRows, crateFacts, backFacts, supplyFacts, tierFacts, unitFacts, fmt, bossFacts, lengthText, toughnessAt, LONGEST,
  paceText, edgeFacts, payText,
} from '../content/facts.js';
import { releaseWaves } from '../content/facts.js';
import { trackName, SUPPLIES } from '../content/supplies.js';
import { worded } from '../content/touch.js';
import { versionText } from '../version.js';
import { h, money } from './dom.js';
import { buildingIcon } from './icons.js';
import { shopperPortrait } from './portrait.js';
import { HOLIDAY_INFO, outfitText } from '../content/holidays.js';
import { cardsNote } from '../content/cards.js';

// (0.4: The Back has its own tab; the Crate Stack is with the shop floor's security.)
const TABS = [['shoppers', 'Known offenders'], ['security', 'Shop floor'], ['back', 'The Back']];
const pct = (m) => `${Math.round(m * 100)}%`;
const table = (cls, head, rows) => h('div', { class: 'hb-scroll' }, h('table', { class: `hb-table ${cls}` },
  h('thead', null, h('tr', null, head.map((t) => h('th', null, t)))),
  h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h(i === 0 ? 'th' : 'td', null, c)))))));
const facts = (pairs) => h('dl', { class: 'hb-facts' }, pairs.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
const stat = (label, value) => h('span', { class: 'hb-stat' }, h('small', null, label), h('b', null, value));

/** The columns of a supply table: for each number a track changes, its heading and how to print it. */
const COLS = {
  level: ['Counts as', (v) => (v ? `+${v} levels` : '–')],
  dmg: ['Hit', fmt],
  dps: ['A second, one shopper', fmt],
  most: ['A second, all it reaches', fmt],
  slow: ['Walking speed on it', pct],
  slip: ['Dad slips', pct],
  slipDmg: ['A slip costs him', fmt],
  secs: ['Holds them for', (v) => `${fmt(v)} s`],
  stopLeft: ['A dad stops', (v) => pct(1 - (1 - SHOPPERS.dad.pitch[0]) * v)],
  rushMul: ['A dad hurries past', (v) => pct(SHOPPERS.dad.pitch[1] * v)],
  cd: ['Seconds between shots', (v) => (v < 2 ? v.toFixed(2) : fmt(v))],
  range: ['Reach (tiles)', fmt],
};

/**
 * A table for each supply a building takes (tierRows): what each brand tier does for it, and how
 * long one unit lasts. Duct Tape's table only says how many gym bro hits a roll soaks up.
 */
function supplyTables(k) {
  const def = BUILD[k];
  // What a unit of stock is used up by: a tower's shots, or the shoppers anything else acts on.
  const per = def.tower ? 'shots' : 'shoppers';
  return tracksOf(k).flatMap((track) => {
    const rows = tierRows(k, track);
    const head = h('h4', null, `${SUPPLIES[track].name}: ${trackName(k, track)}`);
    if (track === 'dur') {
      return [head, table('hb-levels', ['Tier', 'One roll soaks up'],
        rows.map((r) => [r.name, r.uses ? `${r.uses} gym bro hit${r.uses === 1 ? '' : 's'}` : '–']))];
    }
    // "most" only means something for a tower that hits several at once; "perSec" repeats "cd".
    const keys = Object.keys(COLS).filter((c) => rows[0][c] !== undefined && !(c === 'most' && !(def.targets > 1)));
    return [head, table('hb-levels', ['Tier', 'A unit lasts', ...keys.map((c) => COLS[c][0])],
      rows.map((r) => [r.name, r.uses ? `${r.uses} ${per}` : '–', ...keys.map((c) => COLS[c][1](r[c]))]))];
  });
}

/** One shopper: what it is, its numbers through the game, and its super version. */
function shopperCard(k, ctx) {
  const f = shopperFacts(k), help = SHOPPER_HELP[k];
  // (A Card Trader only comes to a Midnight Release: his table shows those events.)
  const waves = f.releaseOnly ? releaseWaves(ctx.waves) : sampleWaves(ctx.waves);
  const dash = '–';
  const rows = [
    ['Patience', ...waves.map((n) => (n >= f.first ? fmt(patienceAt(k, 0, n, ctx.hp)) : dash))],
    // (Not "Patience, Man with Two Guide Dogs": the super's name is in his section just below, and
    // a short label leaves room on a phone for every sample event.)
    ['Patience, super', ...waves.map((n) => (n >= f.superFrom ? fmt(patienceAt(k, 1, n, ctx.hp)) : dash))],
    // (How many, and how many of those are super, on rows of their own: one short number a cell
    // keeps the table narrow enough for every sample event up to the longest game.)
    [`How many${ctx.players > 1 ? ` (${ctx.players} players)` : ''}`, ...waves.map((n) => String(countIn(k, n, ctx.players).all || dash))],
    ['Of them, super', ...waves.map((n) => {
      const c = countIn(k, n, ctx.players);
      return c.all && n >= f.superFrom ? String(c.sup) : dash;
    })],
  ];
  // Only the traits the super version changes.
  const base = new Map(shopperTraits(k, 0));
  const changed = shopperTraits(k, 1).filter(([label, v]) => base.get(label) !== v);
  return h('article', { class: 'hb-card' },
    h('header', { class: 'hb-head' }, shopperPortrait(k),
      h('div', null, h('h3', null, f.name), h('p', { class: 'hb-when' }, f.releaseOnly ? `Midnight Release events only, from sales event ${f.first}` : `First seen in sales event ${f.first}`)),
      h('div', { class: 'hb-stats' }, stat('Patience', fmt(f.hp * ctx.hp)), stat('Speed', `${fmt(f.speed)} tiles/s`), stat('Refund', money(f.refund)))),
    h('p', null, help.trick),
    h('p', { class: 'hb-beat' }, h('b', null, 'Beat it with: '), help.beat),
    facts(shopperTraits(k, 0)),
    h('h4', null, f.releaseOnly ? (ctx.waves > 0 ? `Every Midnight Release up to ${LONGEST} (the longest game)` : 'Midnight Releases in an endless game')
      : ctx.waves > 0 ? `Sales event by sales event, up to ${LONGEST} (the longest game)` : 'Sales event by sales event, in an endless game'),
    table('hb-waves', ['Sales event', ...waves.map(String)], rows),
    h('section', { class: 'hb-super' },
      h('header', { class: 'hb-head' }, shopperPortrait(k, { sup: true }),
        h('div', null, h('h3', null, f.superName), h('p', { class: 'hb-when' }, `Super ${f.name}, from sales event ${f.superFrom}`)),
        h('div', { class: 'hb-stats' },
          stat('Patience', `${fmt(f.superHp * ctx.hp)} (×${fmt(f.superHp / f.hp)})`),
          stat('Speed', `${fmt(f.superSpeed)} tiles/s${f.superSpeed !== f.speed ? ` (×${fmt(f.superSpeed / f.speed)})` : ''}`),
          stat('Refund', money(f.superRefund)))),
      h('p', null, SUPER_HELP[k]),
      changed.length ? facts(changed) : null),
    h('p', { class: 'hb-small' }, f.releaseOnly ? 'Head Office cannot buy him, and cannot stop a Midnight Release.' : `Head Office price: $${f.price} each (super: $${f.superPrice}).`));
}

/** The boss: not one of the shoppers, but he walks in with them every few sales events. */
function bossCard(ctx) {
  const b = bossFacts({ hpMul: ctx.hp, pay: ctx.pay, waves: ctx.waves });
  const pct0 = (m) => `${Math.round(m * 100)}%`;
  // A title a word to a line ("Vice President / of / Returns"), so six of them fit a phone.
  const stacked = (title) => title.split(' ').flatMap((word, i) => (i ? [h('br'), word] : [word]));
  const rows = [
    ['Title', ...b.waves.map((w) => stacked(w.title))],
    ['Patience', ...b.waves.map((w) => fmt(w.hp))],
    ['Refund at a till', ...b.waves.map((w) => money(w.refund))],
    [`Bounty${ctx.players > 1 ? ' (split)' : ''}`, ...b.waves.map((w) => money(w.bounty))],
  ];
  return h('article', { class: 'hb-card hb-wide hb-boss' },
    // In a holiday game he is shown in the outfit he wears this week.
    h('header', { class: 'hb-head' }, shopperPortrait('boss', { dress: ctx.holiday }),
      h('div', null, h('h3', null, `The boss: ${b.name}`), h('p', { class: 'hb-when' }, `Every ${b.every}th sales event, about ${fmt(b.at)} s after the doors open`)),
      h('div', { class: 'hb-stats' },
        stat('Patience', `${fmt(b.waves[0]?.hp ?? b.hp)} (event ${b.every})`),
        stat('Speed', `${fmt(b.speed)} tiles/s`),
        stat('Refund', `${money(b.refund)} × rank`))),
    h('p', null, BOSS_HELP.trick),
    h('p', { class: 'hb-beat' }, h('b', null, 'Beat him with: '), BOSS_HELP.beat),
    facts([
      ['Ranks', b.titles.map((t) => `${t.title} (from event ${t.from})`).join(' · ')],
      ['Patience', `grows every sales event like everyone's, and each rank above the first adds ${pct0(b.tierHp)} of his own`],
      ['Slowed or stopped by', 'nothing: wet floors, messes, free samples, a fallen drunk, the TV Salesman and the exhibitionist all fail, and he steals nothing'],
      ['Pep talk', `every ${fmt(b.pepEvery)} s: every other shopper within ${fmt(b.pepRange)} tiles gets ${pct0(b.pepHeal)} of his patience back (never above full)`],
      ['If he gets through', `counts as ${b.refunds} refunds at once, and takes ${money(b.refund)} times his rank`],
      ['If he storms out', `the store gets a bounty of ${money(TUNE.bossBounty)} times his rank${ctx.pay !== 1 ? ` (times ${ctx.name} pay)` : ''}, split like any income`],
      ['The rest of the crowd', `${pct0(b.crowd)} of its usual size in a boss event`],
      ['Head Office', 'cannot buy him, and cannot stop him coming'],
      ...(ctx.holiday ? [['Dress code', `${HOLIDAY_INFO[ctx.holiday].name}: every rank comes ${outfitText(ctx.holiday)}. Same patience, same tricks, worse taste`]] : []),
    ]),
    h('h4', null, ctx.waves > 0 ? `Every boss event up to ${LONGEST} (the longest game)` : 'Boss events in an endless game'),
    table('hb-waves', ['Sales event', ...b.waves.map((w) => String(w.n))], rows));
}

/**
 * The Dumbwaiter's hatch (nobody buys one, so the build bar has no icon for it): a steel door in a
 * hazard frame with a yellow up arrow, as The Back draws it.
 */
const LIFT_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
  <rect x="2" y="2" width="36" height="36" rx="3" fill="#f2c21b" stroke="#111" stroke-width="2"/>
  <path d="M3 11l8-8M3 21l18-18M3 31l28-28M7 37l30-30M17 37l20-20M27 37l10-10" stroke="#222" stroke-width="3"/>
  <rect x="8" y="8" width="24" height="24" rx="2" fill="#8f979f" stroke="#111" stroke-width="2"/>
  <path d="M20 9v22" stroke="#5b6168" stroke-width="1.5"/>
  <path d="M20 11l7.5 8.5h-4.5v8h-6v-8h-4.5z" fill="#ffe14a" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

/** A building's or part's heading: its icon, name and price (or, for the ones nobody buys, none). */
function buildingHead(k, where = '') {
  const def = BUILD[k];
  return h('header', { class: 'hb-head' }, h('span', { class: 'hb-icon', html: k === 'lift' ? LIFT_ICON : buildingIcon(k) }),
    h('div', null, h('h3', null, def.name), where ? h('p', { class: 'hb-when' }, where) : null),
    def.fixed ? h('div', { class: 'hb-stats' }, stat('Price', 'not for sale'))
      : h('div', { class: 'hb-stats' }, stat('Price', money(def.cost)), stat('Sold back', money(Math.floor(def.cost * TUNE.sellBack)))));
}

/** The Crate Stack: the shop floor's plain wall. */
function crateCard(k) {
  return h('article', { class: 'hb-card' }, buildingHead(k, 'Shop floor: a wall'),
    h('p', null, worded(HOW[k].does)),
    h('p', null, h('b', null, 'How: '), worded(HOW[k].use)),
    facts(crateFacts()));
}

/** One of The Back's parts: what it does, how to use it, and its numbers. */
function backCard(k) {
  const def = BUILD[k];
  const where = k === 'drop' ? 'The Back: put down by the store' : k === 'lift' ? 'The Back: under every security building'
    : def.supply ? `The Back: makes ${SUPPLIES[SUPPLY_TRACKS[def.supply]].name}` : 'The Back';
  return h('article', { class: 'hb-card' }, buildingHead(k, where),
    h('p', null, worded(BACK_HOW[k].does)),
    h('p', null, h('b', null, 'How: '), worded(BACK_HOW[k].use)),
    facts(backFacts(k)));
}

/**
 * The five supplies and the four brand tiers, all on one card at the top of The Back: what each
 * supply is for and who takes it, what each tier counts as, and how long a unit lasts.
 */
function suppliesCard() {
  const list = (names) => names.join(', ');
  const say = (s) => {
    if (s.track === 'dur') return `From the ${s.maker}. Each use soaks up one gym bro hit instead of the building taking it (it still counts as one of his hits). Taken by ${list(s.takers)}.`;
    if (!s.works) return `From the ${s.maker}. For the dads, coming soon: for now it just sits in the Dumbwaiter taking up room, like you at a team meeting. Every Dumbwaiter takes it anyway (${list(s.takers)}).`;
    if (s.track === 'dmg') return `From the ${s.maker}. More damage from a gun; on the others more of whatever they do (a slipperier sign, a longer free sample, a better pitch). Taken by ${list(s.takers)}.`;
    return `From the ${s.maker}. More ${s.gives}. Taken by ${list(s.takers)}.`;
  };
  const tiers = tierFacts();
  const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
  return h('article', { class: 'hb-card hb-supplies' },
    h('header', { class: 'hb-head' }, h('div', null, h('h3', null, 'Supplies'), h('p', { class: 'hb-when' }, 'What The Back makes, and what it does upstairs'))),
    facts(supplyFacts().map((s) => [[h('i', { class: 'hb-swatch', style: { background: s.color } }), ` ${s.name}`], say(s)])),
    h('h4', null, 'Brand tiers'),
    table('hb-levels', ['Tier', 'Spite, Cola, Cord count as', 'A roll of Duct Tape soaks up', 'A unit of Razor Wire stops (coming soon)', 'Clearance Bin pays', 'Made by'],
      tiers.map((t, i) => [t.name, `+${t.level} levels`, plural(t.tape, 'gym bro hit'), plural(t.wire, 'dad'), `$${t.bin.toFixed(2)}`,
        t.secs ? `a Rebrander, ${fmt(t.secs)} s from ${tiers[i - 1].name}` : 'the machines'])),
    h('h4', null, 'How long a unit of Spite, Cola or Cord lasts (whatever the tier)'),
    table('hb-levels', ['Building', 'A unit lasts'], unitFacts().map((u) => [u.name, `${u.uses} ${u.per}`])));
}

/** One piece of security: what it does as built, and a table for each supply it takes. */
function securityCard(k) {
  const def = BUILD[k], st = statsOf({ k });
  const extra = [];
  if (def.size) extra.push(['Takes up', `${def.size[0]} x ${def.size[1]} tiles`]);
  if (def.beam) extra.push(['Fires', `every ${fmt(st.cd)} s, a beam ${fmt(st.range)} tiles long that hits everyone within ${fmt(st.width)} of its line for ${fmt(st.dmg)}`]);
  else if (def.tower) extra.push(['Fires', `every ${fmt(st.cd)} s for ${fmt(st.dmg)}, ${def.targets > 1 ? `at up to ${def.targets} shoppers at once (the ones nearest the tills)` : 'at the one shopper nearest the tills'}, within ${fmt(st.range)} tiles`]);
  extra.push(['Shoppers', def.blocks ? 'blocked' : 'walk over it']);
  if (k === 'samples') extra.push(['Same shopper again', `not for ${fmt(TUNE.browseCooldown)} s`]);
  if (k === 'wetfloor') extra.push(['A slipped dad', `lies stunned for ${fmt(TUNE.slipSecs)} s`]);
  if (k === 'salesman') {
    extra.push(['Reach', `${fmt(st.range)} tiles from the middle of the stand`]);
    extra.push(['Stops / hurries', Object.keys(SHOPPERS).filter((c) => SHOPPERS[c].pitch).map((c) => `${SHOPPERS[c].name} ${pct(SHOPPERS[c].pitch[0])} / ${pct(SHOPPERS[c].pitch[1])}`).join(' · ')]);
    extra.push(['A stopped shopper', `walks over to the stand (for up to ${fmt(TUNE.pitchWalkSecs)} s, and only as near as he can get), then watches for ${fmt(st.secs)} s; a hurried one moves 40% faster for ${fmt(TUNE.rushSecs)} s`]);
    extra.push(['Same shopper again', `not for ${fmt(TUNE.pitchCool)} s, and each repeat pitch from the same stand works ${pct(TUNE.pitchRepeat)} as well as the last. Nobody falls for the same knife set forever, dipshit; build a second salesman`]);
  }
  extra.push(['Gym bro hits it survives', `${st.hits} a sales event`]);
  // Who it works better or worse on (the shoppers' `weak` and `tough`), with the reasons under
  // Known offenders.
  for (const side of ['weak', 'tough']) {
    const who = SHOPPER_ORDER.filter((c) => SHOPPERS[c][side] === k);
    if (!who.length) continue;
    const e = edgeFacts(who[0]).find((f) => f.side === side);
    extra.push([side === 'weak' ? 'Extra hard on' : 'Less use against', `${who.map((c) => SHOPPERS[c].name).join(', ')} (${e.effect.replace(/ to it$/, '').replace(/ one$/, '')})`]);
  }
  return h('article', { class: 'hb-card hb-wide' }, buildingHead(k),
    h('p', null, worded(HOW[k].does)),
    h('p', null, h('b', null, 'How: '), worded(HOW[k].use)),
    facts(extra),
    ...supplyTables(k));
}

/**
 * @param {Object} o
 * @param {Object|null} [o.state] the game in progress, if there is one
 * @param {() => void} o.onClose
 * @returns {HTMLElement}
 */
export function handbook({ state = null, onClose }) {
  const diff = state ? difficultyOf(state) : SETTINGS.difficulty[SETTINGS.defaults.difficulty];
  const ctx = {
    waves: state ? state.waves : SETTINGS.defaults.waves,
    players: state ? shareCount(state) : 1,
    // (A training game's shoppers: see TUNE.trainingPatienceDivisor.)
    hp: state && state.training ? 1 / TUNE.trainingPatienceDivisor : diff.hp, pay: diff.pay, name: diff.name,
    difficulty: state ? state.difficulty : SETTINGS.defaults.difficulty,
    // The game's holiday (0.3), if any: the boss is pictured in its outfit.
    holiday: state && Object.hasOwn(HOLIDAY_INFO, state.holiday || '') ? state.holiday : null,
  };
  const close = h('button', { type: 'button', class: 'btn-big btn-yellow', onclick: onClose }, 'Close');
  const body = h('div', { class: 'hb-body' });
  const tabs = TABS.map(([id, label]) => h('button', { type: 'button', class: 'hb-tab', role: 'tab', 'data-tab': id, onclick: () => show(id) }, label));
  const note = h('p', { class: 'hb-note' });
  // A game with cards (0.3.01): the handbook keeps the standard numbers and says so.
  const cards = cardsNote(state);
  const cardLine = cards ? h('p', { class: 'hb-note hb-cards' }, cards) : null;

  function show(id) {
    for (const t of tabs) { const on = t.dataset.tab === id; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); }
    const game = state ? 'this game' : 'a standard game';
    if (id === 'shoppers') {
      note.textContent = `Numbers are for ${game}: ${ctx.name} difficulty, ${lengthText(ctx.waves).toLowerCase()}, ${ctx.players} player${ctx.players > 1 ? 's' : ''}. `
        + `Half as many shoppers come as used to, and they get tougher faster as the sales events go on: up to double the patience by event ${TUNE.patienceFull}. `
        + `After event ${TUNE.surgeFrom} it stops being polite: every event brings ${fmt((TUNE.surgeHp - 1) * 100)}% more patience and ${fmt((TUNE.surgeCrowd - 1) * 100)}% more shoppers than the last, compounding, until your lazy-ass maze folds. `
        + `Every shopper's patience grows each sales event: ×${fmt(toughnessAt(2))} in the second, ×${fmt(toughnessAt(10))} by the tenth, ×${fmt(toughnessAt(20))} by the twentieth, ×${fmt(toughnessAt(LONGEST))} by event ${LONGEST}${ctx.waves > 0 ? '' : `, ×${fmt(toughnessAt(LONGEST + 10))} by event ${LONGEST + 10}`}. `
        + `${ctx.waves > 0 ? `The tables go up to sales event ${LONGEST}, the longest game, whatever the game's own length. ` : ''}Speed and refunds do not grow from event to event. ${paceText()} A super shopper takes a double refund. The boss is at the end, and his patience grows by event alone (and by the same surge after event ${TUNE.surgeFrom}).`;
      body.replaceChildren(...SHOPPER_ORDER.map((k) => shopperCard(k, ctx)), bossCard(ctx));
    } else if (id === 'back') {
      // (0.4: The Back makes no money, so how money is made, on
      // this game's difficulty, is said here.)
      note.textContent = `The Back is the floor under the shop: Tab, or the floor switch at the bottom right, takes you down. Nothing down here is in a shopper's way. Returns Drops put out junk; belts carry it to the machines, which make supplies; more belts carry those to the Dumbwaiters under your security, which send them up. Security works as built until it is stocked, and better while it is. The Back makes no money, bar a Clearance Bin's pennies. ${payText(ctx.difficulty)} Selling a part back returns ${pct(TUNE.sellBack)} of what was spent on it. The numbers here are for a game without cards.`;
      body.replaceChildren(suppliesCard(), ...BACK_ORDER.map((k) => backCard(k)));
    } else {
      note.textContent = `Crate Stacks and security are the maze: shoppers walk round them, and only gym bros go through. Security gets stronger only on supplies from The Back, sent up its Dumbwaiter: Bottled Spite (damage), Rage Cola (speed), Extension Cord (range) and Duct Tape (soaks up gym bro hits). Each is used up as the building works, a unit at a time, and the better the brand (a Rebrander puts it up a tier), the more it does. Empty, it works as built. "Hit" is patience taken per hit: compare it with the patience numbers under Known offenders. A Karen in earshot makes security fire at half speed. A gym bro's hits wear a building down; the count starts again every sales event. Press Rebuild (B) to put a wreck back for ${pct(TUNE.rebuildShare)} of what was paid for it, all or nothing: the money goes at once, the building as soon as nothing is in the way (its stock does not come back), and every new wreck needs another press.`;
      body.replaceChildren(...WALL_ORDER.map((k) => crateCard(k)), ...SECURITY_ORDER.map((k) => securityCard(k)));
    }
    body.dataset.tab = id;
    card.scrollTop = 0;
  }

  const el = h('div', { class: 'overlay help handbook', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Employee Handbook' },
    h('div', { class: 'ov-card' },
      h('div', { class: 'help-head' },
        h('h2', null, 'EMPLOYEE HANDBOOK', h('small', { class: 'hb-ver' }, ` v${versionText()}`)), close),
      h('div', { class: 'hb-tabs', role: 'tablist' }, tabs),
      note, cardLine, body));
  const card = el.firstChild;
  el.addEventListener('click', (e) => { if (e.target === el) onClose(); });
  show('shoppers');
  setTimeout(() => close.focus(), 50);
  return el;
}

/** Shows the handbook over the whole page and takes it away again on Close or Esc. */
export function openHandbook(state = null) {
  let el = null;
  const shut = () => { el?.remove(); el = null; removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); shut(); } };
  el = handbook({ state, onClose: shut });
  addEventListener('keydown', onKey, true);
  document.body.append(el);
  return shut;
}
