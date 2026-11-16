// The Employee Handbook: every shopper, factory building and piece of security, with its numbers.
// How patient each shopper is as the sales events go by, how many turn up, what the super
// version changes, and what every upgrade level of security costs and does.
// Opened from the menu and from the game (the book button, or the ? screen). In a game it uses
// that game's length, difficulty and number of players; from the menu, the standard game.
import { BUILD, TUNE, SETTINGS, ZONES, shareCount, difficultyOf } from '../sim/index.js';
import { HOW, SHOPPER_HELP, SUPER_HELP } from '../content/help.js';
import {
  SHOPPER_ORDER, FACTORY_ORDER, SECURITY_ORDER, shopperFacts, shopperTraits, patienceAt, countIn, sampleWaves,
  levelRows, factoryFacts, fmt,
} from '../content/facts.js';
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

/** One shopper: what it is, its numbers through the game, and its super version. */
function shopperCard(k, ctx) {
  const f = shopperFacts(k), help = SHOPPER_HELP[k];
  const waves = sampleWaves(ctx.waves);
  const dash = '–';
  const rows = [
    ['Patience', ...waves.map((n) => (n >= f.first ? fmt(patienceAt(k, 0, n, ctx.hp)) : dash))],
    [`Patience, ${f.superName}`, ...waves.map((n) => (n >= f.superFrom ? fmt(patienceAt(k, 1, n, ctx.hp)) : dash))],
    [`How many${ctx.players > 1 ? ` (${ctx.players} players)` : ''}`, ...waves.map((n) => {
      const c = countIn(k, n, ctx.players);
      return c.all ? `${c.all}${c.sup ? ` (${c.sup} super)` : ''}` : dash;
    })],
  ];
  // Only the traits the super version changes.
  const base = new Map(shopperTraits(k, 0));
  const changed = shopperTraits(k, 1).filter(([label, v]) => base.get(label) !== v);
  return h('article', { class: 'hb-card' },
    h('header', { class: 'hb-head' }, shopperPortrait(k),
      h('div', null, h('h3', null, f.name), h('p', { class: 'hb-when' }, `First seen in sales event ${f.first}`)),
      h('div', { class: 'hb-stats' }, stat('Patience', fmt(f.hp * ctx.hp)), stat('Speed', `${fmt(f.speed)} tiles/s`), stat('Refund', money(f.refund)))),
    h('p', null, help.trick),
    h('p', { class: 'hb-beat' }, h('b', null, 'Beat it with: '), help.beat),
    facts(shopperTraits(k, 0)),
    h('h4', null, 'Through the game'),
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
    h('p', { class: 'hb-small' }, `Head Office price: $${f.price} each (super: $${f.superPrice}).`));
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
    facts(factoryFacts(k, ctx.pay).slice(2).filter(([label]) => label !== 'Goes on')));
}

/** One piece of security, with a row for every upgrade level. */
function securityCard(k) {
  const def = BUILD[k], rows = levelRows(k);
  const reach = (r) => (r.lv === 1 ? def.cost : rows[r.lv - 2].next);
  let head, body;
  if (def.tower) {
    const many = def.targets > 1;
    head = ['Level', 'Costs', 'Spent in all', 'Hit', 'Range (tiles)', 'Per second, one shopper', ...(many ? [`Per second, all ${def.targets}`] : [])];
    body = rows.map((r) => [String(r.lv), money(reach(r)), money(r.total), fmt(r.dmg), fmt(r.range), fmt(r.dps), ...(many ? [fmt(r.most)] : [])]);
  } else if (k === 'wetfloor') {
    head = ['Level', 'Costs', 'Spent in all', 'Walking speed on it', 'Dad slips', 'A slip costs him'];
    body = rows.map((r) => [String(r.lv), money(reach(r)), money(r.total), pct(r.slow), pct(r.slip), fmt(r.slipDmg)]);
  } else {
    head = ['Level', 'Costs', 'Spent in all', 'Stops a shopper for', 'Range (tiles)'];
    body = rows.map((r) => [String(r.lv), money(reach(r)), money(r.total), `${fmt(r.secs)} s`, fmt(r.range)]);
  }
  const extra = [];
  if (def.tower) extra.push(['Fires', `every ${fmt(def.cd)} s${def.targets > 1 ? `, at up to ${def.targets} shoppers at once (the ones nearest the tills)` : ', at the one shopper nearest the tills'}`]);
  extra.push(['Shoppers', def.blocks ? 'blocked' : 'walk over it']);
  if (k === 'samples') extra.push(['Same shopper again', `not for ${fmt(TUNE.browseCooldown)} s`]);
  if (k === 'wetfloor') extra.push(['A slipped dad', `lies stunned for ${fmt(TUNE.slipSecs)} s`]);
  return h('article', { class: 'hb-card hb-wide' }, buildingHead(k),
    h('p', null, worded(HOW[k].does)),
    h('p', null, h('b', null, 'How: '), worded(HOW[k].use)),
    facts(extra),
    h('h4', null, 'Upgrade levels'),
    table('hb-levels', head, body));
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
    hp: state && state.training ? 1 : diff.hp, pay: diff.pay, name: diff.name,
  };
  const close = h('button', { type: 'button', class: 'btn-big btn-yellow', onclick: onClose }, 'Close');
  const body = h('div', { class: 'hb-body' });
  const tabs = TABS.map(([id, label]) => h('button', { type: 'button', class: 'hb-tab', role: 'tab', 'data-tab': id, onclick: () => show(id) }, label));
  const note = h('p', { class: 'hb-note' });

  function show(id) {
    for (const t of tabs) { const on = t.dataset.tab === id; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); }
    const game = state ? 'this game' : 'a standard game';
    if (id === 'shoppers') {
      note.textContent = `Numbers are for ${game}: ${ctx.name} difficulty, ${ctx.waves} sales events, ${ctx.players} player${ctx.players > 1 ? 's' : ''}. `
        + `Every shopper's patience grows each sales event: ×${fmt(1 + TUNE.hpGrowth + TUNE.hpGrowth2)} in the second, ×${fmt(1 + TUNE.hpGrowth * 9 + TUNE.hpGrowth2 * 81)} by the tenth, ×${fmt(1 + TUNE.hpGrowth * 19 + TUNE.hpGrowth2 * 361)} by the twentieth. Speed and refunds never change. A super shopper takes a double refund.`;
      body.replaceChildren(...SHOPPER_ORDER.map((k) => shopperCard(k, ctx)));
    } else if (id === 'factory') {
      note.textContent = `Prices goods sell for are for ${game} (${ctx.name} difficulty). Every sale is split evenly between the players. Factory buildings cannot be upgraded. Selling anything back returns ${pct(TUNE.sellBack)} of what was spent on it.`;
      body.replaceChildren(...FACTORY_ORDER.map((k) => factoryCard(k, ctx)));
    } else {
      note.textContent = `Security goes up to level ${TUNE.maxLevel}. The first upgrade costs the building's price and each one after costs ×${fmt(TUNE.upGrowth)} the last. "Hit" is patience taken per hit: compare it with the patience numbers under Known offenders. A Karen in earshot makes security fire at half speed, and a gym bro knocks a level off instead of wrecking anything above level 1.`;
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
