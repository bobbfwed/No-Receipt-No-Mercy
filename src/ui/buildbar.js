// The build bar: one button per building, grouped Walls (the Crate Stack) and Security, plus the
// Rebuild and Remove tools. In The Back (0.4) the same bar shows The Back's parts instead, with Remove.
import { BUILD, TUNE, rebuildDeal, buildPrice, reinforceCost } from '../sim/index.js';
import { h, setClass, money } from './dom.js';
import { buildingIcon } from './icons.js';
import { BUILD_KEYS, BACK_GROUPS, hotkeyOf } from './input.js';
import { WIRE_KEY, REINFORCE_KEY } from './wiretool.js';
import { longPress, touchedLast } from './touch.js';
import { HOW, BACK_HOW, HOW_REMOVE, HOW_REBUILD, HOW_WIRE, HOW_REINFORCE } from '../content/help.js';
import { worded, isTouch, PLACE_BY_TOUCH } from '../content/touch.js';
import { prefs as sharedPrefs, barPress } from './prefs.js';

/** What the card's "Don't show these" button says it does (a notice, from game.js). */
export const CARDS_HIDDEN = {
  mouse: 'Cards hidden. Double-click a button to see one anyway. Sound & settings brings them back.',
  touch: 'Cards hidden. Double-tap a button (or hold a finger on it) to see one anyway. Sound & settings brings them back.',
};

// On a phone the info card is a sheet over the floor; the player can fold it down to one line,
// and it stays folded for the next tool too.
const FOLD_KEY = 'returns-dept.info-folded';
// Until the player chooses, a phone starts with it folded (0.3.03 follow-up): unfolded it covers the
// bottom half of the floor, and a tap meant for the floor lands on it. Folded it is one strip: the
// building's name and price, and on a touch screen the line that says how a finger places it.
let folded = typeof innerHeight === 'number' && (innerHeight < 560 || innerWidth < 700);
try { const v = localStorage.getItem(FOLD_KEY); if (v !== null) folded = v === '1'; } catch { /* not remembered */ }

const DIR_NAMES = ['east', 'south', 'west', 'north'];
/** Names short enough for a button; the tooltip has the full one. */
const SHORT = { conv: 'Belt', intern: 'Intern', bin: 'Bin', still: 'Still', cannery: 'Cannery', spooler: 'Spooler', bender: 'Bender', crate: 'Crates', sprinkler: 'Sprinkler', forklift: 'Forklift', wetfloor: 'Wet Floor', samples: 'Samples', salesman: 'Salesman', railgun: 'Laser' };
const DIR_ARROWS = ['→', '↓', '←', '↑'];
/**
 * The cheapest first level of reinforcement of any kind that can have one (0.4.01: every security
 * building and the Crate Stack, each at its own price), with this game's cards if `s` is given.
 */
function cheapestReinforce(s) {
  let low = Infinity;
  for (const k of Object.keys(BUILD)) if (BUILD[k].reinforce) low = Math.min(low, reinforceCost({ k }, s));
  return Number.isFinite(low) ? low : 0;
}
/** The tools that are not buildings: label, hotkey, what the price line says, and the help text. */
const TOOLS = {
  // The shop floor's own tools (0.4, stage 4b): Razor Wire's direction, and a building's levels (Crate
  // Stacks until 0.4.01, every security building since).
  wire: { name: 'Wire', key: WIRE_KEY.toUpperCase(), price: 'free', how: HOW_WIRE, keys: `key ${WIRE_KEY.toUpperCase()} · right-click takes a wire off`, shop: true },
  reinforce: { name: 'Reinforce', key: REINFORCE_KEY.toUpperCase(), price: `from ${cheapestReinforce(null)}`, how: HOW_REINFORCE, keys: `key ${REINFORCE_KEY.toUpperCase()}`, shop: true },
  // Not a tool you hold: one press pays to put back everything of yours that gym bros have wrecked.
  rebuild: { name: 'Rebuild', key: 'B', price: 'half price', how: HOW_REBUILD, keys: 'key B', action: true, shop: true },
  remove: { name: 'Remove', key: 'X', price: `${Math.round(TUNE.sellBack * 100)}% back`, how: HOW_REMOVE, keys: 'key X or Delete' },
};

/** What a building or part does and how to use it, for the tooltip and the card. */
const howOf = (k) => HOW[k] || BACK_HOW[k];

const one = (n) => (Math.round(n * 10) / 10).toString();

/**
 * @param {Object} input the input controller (tool, dir, hover, setTool)
 * @param {Object} session
 * @param {Object} [o]
 * @param {Object} [o.prefs] the player's screen choices (prefs.js): whether cards open by themselves
 * @param {() => void} [o.onCardsOff] the player has just turned the cards off with the card's button
 */
export function createBuildBar(input, session, { prefs = sharedPrefs(), onCardsOff = () => {} } = {}) {
  // With the cards turned off (0.4, the owner: "useful information, but only on rare occasion"), a
  // double click or double tap on a button shows its card this once (barPress in prefs.js): until
  // something else is held.
  let lastPress = null;
  let once = null;
  function press(k) {
    const now = performance.now();
    const what = barPress(lastPress, k, now, input.tool, prefs.get('cards'));
    lastPress = { k, at: now };
    if (what === 'card') { once = k; showInfo(k); return; }
    input.setTool(what === 'drop' ? null : k);
  }
  const tip = h('div', { class: 'tip hidden', role: 'tooltip', id: 'build-tip' });
  const buttons = new Map();
  // What each building costs in this game: a card can change it (0.3.01: shrinkflation,
  // staffdiscount, rentacop, sweatshop). Filled in by update() from the rules' buildPrice.
  const price = new Map();
  const priceOf = (k) => price.get(k) ?? BUILD[k].cost;
  /** "$5", and in a game whose cards change the price, what it normally is. */
  const priceNote = (k) => (priceOf(k) !== BUILD[k].cost ? ` (normally ${BUILD[k].cost}: this game's cards)` : '');

  function showTip(btn, k) {
    const def = BUILD[k];
    const lines = [];
    if (def) {
      const how = howOf(k);
      lines.push(h('div', { class: 'tip-head' }, h('b', null, def.name), h('span', { class: 'tip-cost' }, `${priceOf(k)}`)));
      if (priceNote(k)) lines.push(h('small', null, `${priceOf(k)}${priceNote(k)}`));
      lines.push(h('p', null, how ? worded(how.does) : def.desc));
      if (how) lines.push(h('p', { class: 'tip-use' }, h('b', null, 'How: '), worded(how.use)));
      const facts = [];
      if (how && how.maze) facts.push(how.maze.replace(/\.$/, ''));
      if (def.back) facts.push('The Back: shoppers never touch it');
      if (def.rot) facts.push('R rotates');
      if (def.size) facts.push(`${def.size[0]} x ${def.size[1]} tiles`);
      lines.push(h('small', null, `${facts.join(' · ')} · key ${hotkeyOf(k)}`));
    } else {
      const t = TOOLS[k];
      lines.push(h('div', { class: 'tip-head' }, h('b', null, t.name)));
      lines.push(h('p', null, worded(t.how.does)));
      lines.push(h('p', { class: 'tip-use' }, h('b', null, 'How: '), worded(t.how.use)));
      lines.push(h('small', null, t.keys));
    }
    tip.replaceChildren(...lines);
    tip.classList.remove('hidden');
    const r = btn.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const left = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    tip.style.left = `${left}px`;
    tip.style.bottom = `${innerHeight - r.top + 8}px`;
  }
  const hideTip = () => tip.classList.add('hidden');

  function makeButton(k, i) {
    const def = BUILD[k], t = TOOLS[k];
    const key = t ? t.key : hotkeyOf(k);
    const btn = h('button', {
      type: 'button', class: `bb-btn grp-${def ? def.group : 'tool'} tool-${k}`, 'aria-pressed': 'false',
      'aria-describedby': 'build-tip', 'data-k': k,
      'aria-label': def ? `${def.name}, $${def.cost}, key ${key}` : `${t.name} tool, key ${key}`,
      onclick: () => (t && t.action ? input.rebuild() : press(k)),
      // A finger has no hover, and a tapped button keeps focus on some phones: the tooltip comes
      // from a long press instead (below).
      onpointerenter: (e) => { if (e.pointerType !== 'touch') showTip(btn, k); }, onpointerleave: hideTip,
      onfocus: () => { if (!touchedLast()) showTip(btn, k); }, onblur: hideTip,
    },
    h('span', { class: 'hotkey', 'aria-hidden': 'true' }, key),
    h('span', { class: 'bb-icon', html: buildingIcon(k) }),
    h('span', { class: 'bb-name' }, def ? SHORT[k] || def.name : t.name),
    h('span', { class: 'bb-price' }, def ? `$${def.cost}` : t.price));
    longPress(btn, () => showTip(btn, k), hideTip);
    buttons.set(k, btn);
    return btn;
  }

  // The shop floor's two groups: its wall, then security (BUILD's `group`).
  const groups = ['walls', 'security'].map((g) => h('div', { class: `bb-group bb-${g}`, role: 'group', 'aria-label': g },
    h('span', { class: 'bb-label' }, g.toUpperCase()),
    h('div', { class: 'bb-btns' }, BUILD_KEYS.map((k, i) => (BUILD[k].group === g ? makeButton(k, i) : null)))));
  // The Back's parts (0.4): shown instead of the two groups above while The Back is looked at, in
  // two groups of their own, Belts and Machines (BACK_GROUPS in input.js).
  const backGroups = BACK_GROUPS.map((g) => h('div', { class: `bb-group bb-back bb-back-${g.id} hidden`, role: 'group', 'aria-label': g.label.toLowerCase() },
    h('span', { class: 'bb-label' }, g.label),
    h('div', { class: 'bb-btns' }, g.keys.map((k) => makeButton(k)))));
  const tools = h('div', { class: 'bb-group bb-tools', role: 'group', 'aria-label': 'tools' },
    h('span', { class: 'bb-label' }, 'TOOLS'), h('div', { class: 'bb-btns' }, ...Object.keys(TOOLS).map((k) => makeButton(k, -1))));

  const dirEl = h('b');
  const hint = h('div', { class: 'bb-hints' },
    h('div', null, 'Facing ', dirEl, ' · ', h('kbd', null, 'R'), ' rotate'),
    h('div', null, h('kbd', null, 'WASD'), ' move the view · ', h('kbd', null, 'Wheel'), ' zoom · ', h('kbd', null, 'H'), ' my entrance'),
    h('div', null, h('kbd', null, 'Right-click'), ' remove · ', h('kbd', null, 'Esc'), ' drop it'));

  // A card that stays up while a tool is held, explaining what it does and how to use it. It
  // floats just above the bar and must never be part of the bar's layout: when it was, the bar's
  // height changed with each building's description, the floor was resized and the view jumped.
  const info = h('aside', { class: `bb-info hidden${folded ? ' folded' : ''}`, 'aria-live': 'polite' });
  // The buttons scroll sideways on a narrow screen. On a wide one this wrapper is invisible to
  // the layout (display: contents), so the bar is laid out as it always was.
  const scroller = h('div', { class: 'bb-scroll' }, groups, backGroups, tools);
  const el = h('footer', { class: 'buildbar' }, scroller, info, hint);
  // A finger (or pen) can drag a building up out of its button onto the floor (0.3.03, input.js);
  // a sideways swipe still scrolls the bar (touch-action: pan-x in style.css).
  if (input.watchBar) input.watchBar(scroller, { onPick: hideTip });

  /** The button that folds the card down to its heading, for players who know the buildings. */
  function toggleFold() {
    folded = !folded;
    try { localStorage.setItem(FOLD_KEY, folded ? '1' : '0'); } catch { /* not remembered */ }
    setClass(info, 'folded', folded);
    const b = info.querySelector('.bbi-fold');
    if (b) { b.setAttribute('aria-expanded', String(!folded)); b.setAttribute('aria-label', folded ? 'Show what it does' : 'Hide the details'); }
  }
  const foldBtn = () => h('button', {
    type: 'button', class: 'bbi-fold', 'aria-label': folded ? 'Show what it does' : 'Hide the details', 'aria-expanded': String(!folded),
    onclick: (e) => { e.stopPropagation(); toggleFold(); },
  });
  // A folded card opens with a tap anywhere on it, not only on its small button.
  info.addEventListener('click', (e) => { if (folded && !e.target.closest('button')) toggleFold(); });
  let lastCash = null, lastTool, lastDir, lastRubble = '';
  const rebuildBtn = buttons.get('rebuild'), rebuildNote = rebuildBtn.querySelector('.bb-price');

  /** The card's "Don't show these" button (0.4): cards stay away until turned back on in settings. */
  const offBtn = () => h('button', {
    type: 'button', class: 'bbi-off', title: 'Stop this card opening whenever you pick something up. Double-click a button to see it anyway; Sound & settings turns cards back on.',
    onclick: (e) => { e.stopPropagation(); once = null; prefs.set('cards', false); onCardsOff(); },
  }, "Don't show these");

  function showInfo(k) {
    const def = BUILD[k];
    const how = def ? howOf(k) : TOOLS[k] ? TOOLS[k].how : null;
    // Turned off, the card shows only after a double click on its button (`once`).
    const want = !!how && (prefs.get('cards') || once === k);
    setClass(info, 'hidden', !want);
    setClass(hint, 'hidden', !!how);
    if (!want) return;
    info.replaceChildren(
      h('div', { class: 'bbi-head' },
        h('span', { class: 'bbi-icon', html: buildingIcon(k) }),
        h('b', null, def ? def.name : TOOLS[k].name),
        // What it means for the maze, in two words.
        def ? h('span', { class: 'bbi-maze' }, def.back ? 'The Back' : !def.blocks ? 'Walkable' : 'Blocks everyone') : null,
        def ? h('span', { class: 'bbi-cost' }, `${priceOf(k)}`) : null,
        prefs.get('cards') ? offBtn() : null,
        foldBtn()),
      h('p', null, worded(how.does)),
      h('p', null, h('b', null, 'How: '), worded(how.use)));
    // On a touch screen: how a finger places it (0.3.03). (The belt's "How" already says drag.)
    if (def && k !== 'conv' && isTouch()) info.append(h('p', { class: 'bbi-touch' }, PLACE_BY_TOUCH));
  }

  /** Lights up one button (the tutorial points at the tool to pick). Pass null to clear. */
  function highlight(k) {
    for (const [key, btn] of buttons) setClass(btn, 'teach', key === k);
    // On a phone the bar scrolls sideways: bring the button into sight. (On a big screen the
    // wrapper is not a box at all and has nothing to scroll.)
    const btn = k && buttons.get(k);
    if (btn && scroller.scrollWidth > scroller.clientWidth + 1) {
      const a = scroller.getBoundingClientRect(), b = btn.getBoundingClientRect();
      if (b.left < a.left || b.right > a.right) scroller.scrollLeft += b.left - a.left - (a.width - b.width) / 2;
    }
  }

  /** The prices on the buttons, for this game's cards (a new game from the lobby may have others). */
  let lastHand = null;
  function updatePrices(s) {
    const hand = `${s.training ? 't' : ''}${(s.cards || []).join(',')}`;
    if (hand === lastHand) return;
    lastHand = hand;
    lastCash = null;
    for (const [k, btn] of buttons) {
      const def = BUILD[k];
      if (!def) continue;
      const p = buildPrice(s, k);
      price.set(k, p);
      const tag = btn.querySelector('.bb-price');
      tag.textContent = `${p}`;
      setClass(tag, 'cheaper', p < def.cost);
      setClass(tag, 'dearer', p > def.cost);
      btn.setAttribute('aria-label', `${def.name}, ${p}${priceNote(k)}, key ${hotkeyOf(k)}`);
    }
    // The cheapest first level of reinforcement, as this game's cards price it.
    buttons.get('reinforce').querySelector('.bb-price').textContent = `from ${cheapestReinforce(s)}`;
    if (input.tool && BUILD[input.tool]) showInfo(input.tool);
  }

  let lastFloor = 0;
  function update(s) {
    updatePrices(s);
    // The floor being looked at (0.4): The Back's parts, or the shop's buildings and the Rebuild
    // tool, which belongs to the shop floor. (B still rebuilds from either floor.)
    if (input.floor !== lastFloor) {
      lastFloor = input.floor;
      const back = lastFloor === 1;
      for (const g of groups) setClass(g, 'hidden', back);
      for (const g of backGroups) setClass(g, 'hidden', !back);
      for (const [k, t] of Object.entries(TOOLS)) if (t.shop) setClass(buttons.get(k), 'hidden', back);
      setClass(el, 'on-back', back);
    }
    const cash = Math.floor(s.players[session.me]?.cash ?? 0);
    if (cash !== lastCash) {
      lastCash = cash;
      for (const [k, btn] of buttons) if (BUILD[k]) setClass(btn, 'poor', cash < priceOf(k));
    }
    if (input.tool !== lastTool) {
      lastTool = input.tool;
      // A card shown by a double click lasts while that building is held.
      if (once !== input.tool) once = null;
      for (const [k, btn] of buttons) {
        const on = k === input.tool;
        setClass(btn, 'on', on);
        btn.setAttribute('aria-pressed', String(on));
      }
      showInfo(input.tool);
    }
    // The Rebuild button says how much of yours is lying in pieces and what putting it back costs
    // (alert); with nothing to order but something paid for and waiting to go back, how many
    // (waiting, 0.3.04); otherwise nothing (idle).
    let n = 0, cost = 0, held = 0;
    // (Half of what was paid for each, all or nothing: rebuildDeal.)
    for (const r of s.rubble) {
      if (r.by !== undefined) { if (r.by === session.me) held++; continue; }
      if (r.o === session.me) { n++; cost += rebuildDeal(r, Infinity).pay; }
    }
    const sig = `${n},${cost},${held}`;
    if (sig !== lastRubble) {
      lastRubble = sig;
      rebuildNote.textContent = n ? `${n} for ${money(cost)}` : held ? `${held} waiting` : 'half price';
      setClass(rebuildBtn, 'idle', !n && !held);
      setClass(rebuildBtn, 'alert', n > 0);
      setClass(rebuildBtn, 'waiting', !n && held > 0);
    }
    if (input.dir !== lastDir) {
      lastDir = input.dir;
      dirEl.textContent = `${DIR_ARROWS[input.dir]} ${DIR_NAMES[input.dir]}`;
    }
  }

  // Cards turned on or off in the settings menu: the held tool's card follows at once.
  prefs.on(() => { if (prefs.get('cards')) once = null; showInfo(input.tool); });

  return { el, tip, info, update, highlight };
}
