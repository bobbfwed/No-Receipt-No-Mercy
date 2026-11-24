// The Employee Handbook: every shopper, factory building and piece of security, with its numbers.
// How patient each shopper is as the sales events go by, how many turn up, what the super
// version changes, and what every upgrade level of security costs and does.
// Opened from the menu and from the game (the book button, or the ? screen). In a game it uses
// that game's length, difficulty and number of players; from the menu, the standard game.
import { BUILD, MACHINE_SPD, SHOPPERS, TUNE, SETTINGS, ZONES, shareCount, difficultyOf, tracksOf, statsOf } from '../sim/index.js';
import { HOW, SHOPPER_HELP, SUPER_HELP, BOSS_HELP } from '../content/help.js';
import {
  SHOPPER_ORDER, FACTORY_ORDER, SECURITY_ORDER, shopperFacts, shopperTraits, patienceAt, countIn, sampleWaves,
  trackRows, factoryFacts, fmt, bossFacts, lengthText, toughnessAt, LONGEST, paceText, edgeFacts,
} from '../content/facts.js';
import { releaseWaves } from '../content/facts.js';
import { trackName } from './upgradetext.js';
import { worded } from '../content/touch.js';
import { versionText } from '../version.js';
import { h, money } from './dom.js';
import { buildingIcon } from './icons.js';
import { shopperPortrait } from './portrait.js';

const TABS = [['shoppers', 'Known offenders'], ['factory', 'Factory'], ['security', 'Security']];
const pct = (m) => `${Math.round(m * 100)}%`;
const table = (cls, head, rows) => h('div', { class: 'hb-scroll' }, h('table', { class: `hb-table ${cls}` },
  h('thead', null, h('tr', null, head.map((t) => h('th', null, t)))),
  h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h(i === 0 ? 'th' : 'td', null, c)))))));
const facts = (pairs) => h('dl', { class: 'hb-facts' }, pairs.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
const stat = (label, value) => h('span', { class: 'hb-stat' }, h('small', null, label), h('b', null, value));

/** The columns of an upgrade table: for each number a track changes, its heading and how to print it. */
const COLS = {
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
  period: ['Seconds a box', (v) => v.toFixed(2)],
  time: ['Seconds an item', (v) => v.toFixed(2)],
  perMin: ['A minute', fmt],
  range: ['Reach (tiles)', fmt],
  hits: ['Gym bro hits it survives', fmt],
};

/** A table for each kind of upgrade a building has: what each level costs and what it gives. */
function upgradeTables(k) {
  const def = BUILD[k];
  return tracksOf(k).flatMap((track) => {
    const rows = trackRows(k, track);
    // "most" only means something for a tower that hits several at once; "perSec" repeats "cd".
    const keys = Object.keys(COLS).filter((c) => rows[0][c] !== undefined && !(c === 'most' && !(def.targets > 1)));
    return [
      h('h4', null, `Upgrade: ${trackName(k, track)}`),
      table('hb-levels', ['Level', 'Costs', 'Spent on it', ...keys.map((c) => COLS[c][0])],
        rows.map((r) => [r.lv ? String(r.lv) : 'as built', r.lv ? money(r.cost) : '–', money(r.total), ...keys.map((c) => COLS[c][1](r[c]))])),
    ];
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
    h('header', { class: 'hb-head' }, shopperPortrait('boss'),
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
      ['Slowed or stopped by', 'nothing: wet floors, messes, free samples, goods on belts, a fallen drunk, the TV Salesman and the exhibitionist all fail'],
      ['Pep talk', `every ${fmt(b.pepEvery)} s: every other shopper within ${fmt(b.pepRange)} tiles gets ${pct0(b.pepHeal)} of his patience back (never above full)`],
      ['If he gets through', `counts as ${b.refunds} refunds at once, and takes ${money(b.refund)} times his rank`],
      ['If he storms out', `the store gets a bounty of ${money(TUNE.bossBounty)} times his rank${ctx.pay !== 1 ? ` (times ${ctx.name} pay)` : ''}, split like any income`],
      ['The rest of the crowd', `${pct0(b.crowd)} of its usual size in a boss event`],
      ['Head Office', 'cannot buy him, and cannot stop him coming'],
    ]),
    h('h4', null, ctx.waves > 0 ? `Every boss event up to ${LONGEST} (the longest game)` : 'Boss events in an endless game'),
    table('hb-waves', ['Sales event', ...b.waves.map((w) => String(w.n))], rows));
}

function buildingHead(k) {
  const def = BUILD[k];
  return h('header', { class: 'hb-head' }, h('span', { class: 'hb-icon', html: buildingIcon(k) }),
    h('div', null, h('h3', null, def.name),
      def.zone ? h('p', { class: 'hb-when' }, h('i', { class: 'hb-swatch', style: { background: ZONES[def.zone].color } }), ` ${ZONES[def.zone].name} floor only`) : null),
    h('div', { class: 'hb-stats' }, stat('Price', money(def.cost)), stat('Sold back', money(Math.floor(def.cost * TUNE.sellBack)))));
}

function factoryCard(k, ctx) {
  return h('article', { class: 'hb-card' }, buildingHead(k),
    h('p', null, worded(HOW[k].does)),
    h('p', null, h('b', null, 'How: '), worded(HOW[k].use)),
    // The sentences above quote Normal prices; the numbers below are for this game's difficulty.
    ctx.pay !== 1 && /$/.test(HOW[k].does) ? h('p', { class: 'hb-small' }, `The prices in the text are for Normal difficulty. On ${ctx.name}:`) : null,
    facts(factoryFacts(k, ctx.pay).slice(2).filter(([label]) => label !== 'Goes on')),
    ...upgradeTables(k));
}

/** One piece of security: what it does as built, and a table for each kind of upgrade. */
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
    ...upgradeTables(k));
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
  };
  const close = h('button', { type: 'button', class: 'btn-big btn-yellow', onclick: onClose }, 'Close');
  const body = h('div', { class: 'hb-body' });
  const tabs = TABS.map(([id, label]) => h('button', { type: 'button', class: 'hb-tab', role: 'tab', 'data-tab': id, onclick: () => show(id) }, label));
  const note = h('p', { class: 'hb-note' });

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
    } else if (id === 'factory') {
      note.textContent = `Prices goods sell for are for ${game} (${ctx.name} difficulty). Every sale is split evenly between the players. Machines can be upgraded for speed, at a price: up to ${MACHINE_SPD.max} levels, each ${fmt((MACHINE_SPD.mul - 1) * 100)}% faster than the last, costing ×${fmt(MACHINE_SPD.grow)} the level before up to level ${MACHINE_SPD.gentleFrom} and ×${fmt(MACHINE_SPD.gentleGrow)} after. Everything can be made tougher. Selling anything back returns ${pct(TUNE.sellBack)} of what was spent on it.`;
      body.replaceChildren(...FACTORY_ORDER.map((k) => factoryCard(k, ctx)));
    } else {
      note.textContent = `Each kind of upgrade is bought separately, up to ${TUNE.maxLevel} levels, and each level costs ×${fmt(TUNE.upGrowth)} the last. "Hit" is patience taken per hit: compare it with the patience numbers under Known offenders. A Karen in earshot makes security fire at half speed. A gym bro's hits wear a building down; the count starts again every sales event, and a wrecked building comes back at half price with its upgrades (B).`;
      body.replaceChildren(...SECURITY_ORDER.map((k) => securityCard(k)));
    }
    body.dataset.tab = id;
    card.scrollTop = 0;
  }

  const el = h('div', { class: 'overlay help handbook', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Employee Handbook' },
    h('div', { class: 'ov-card' },
      h('div', { class: 'help-head' },
        h('h2', null, 'EMPLOYEE HANDBOOK', h('small', { class: 'hb-ver' }, ` v${versionText()}`)), close),
      h('div', { class: 'hb-tabs', role: 'tablist' }, tabs),
      note, body));
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
