// The build bar: one button per building, grouped Factory and Security, plus the Upgrade and
// Remove tools.
import { BUILD, TUNE, ZONES, anchorOf, levelOf, rebuildDeal, buildPrice } from '../sim/index.js';
import { tracksInfo } from './upgradetext.js';
import { h, setClass, money } from './dom.js';
import { buildingIcon } from './icons.js';
import { BUILD_KEYS, HOTKEYS } from './input.js';
import { longPress, touchedLast } from './touch.js';
import { HOW, HOW_REMOVE, HOW_UPGRADE, HOW_REBUILD } from '../content/help.js';
import { worded, isTouch, PLACE_BY_TOUCH } from '../content/touch.js';

// On a phone the info card is a sheet over the floor; the player can fold it down to one line,
// and it stays folded for the next tool too.
const FOLD_KEY = 'returns-dept.info-folded';
// Until the player chooses, a phone on its side starts with it folded: there the card would
// cover half the floor.
let folded = typeof innerHeight === 'number' && innerHeight < 560;
try { const v = localStorage.getItem(FOLD_KEY); if (v !== null) folded = v === '1'; } catch { /* not remembered */ }

const DIR_NAMES = ['east', 'south', 'west', 'north'];
/** Names short enough for a button; the tooltip has the full one. */
const SHORT = { chute: 'Chute', crate: 'Crates', sprinkler: 'Sprinkler', forklift: 'Forklift', wetfloor: 'Wet Floor', samples: 'Samples', salesman: 'Salesman', railgun: 'Laser' };
const DIR_ARROWS = ['→', '↓', '←', '↑'];
/** The tools that are not buildings: label, hotkey, what the price line says, and the help text. */
const TOOLS = {
  upgrade: { name: 'Upgrade', key: 'U', price: 'anything', how: HOW_UPGRADE, keys: 'key U' },
  // Not a tool you hold: one press puts back everything of yours that gym bros have wrecked.
  rebuild: { name: 'Rebuild', key: 'B', price: 'half price', how: HOW_REBUILD, keys: 'key B · Shift+B switches auto-rebuild on or off', action: true },
  remove: { name: 'Remove', key: 'X', price: `${Math.round(TUNE.sellBack * 100)}% back`, how: HOW_REMOVE, keys: 'key X or Delete' },
};

const one = (n) => (Math.round(n * 10) / 10).toString();

/**
 * @param {Object} input the input controller (tool, dir, hover, setTool)
 * @param {Object} session
 */
export function createBuildBar(input, session) {
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
      const how = HOW[k];
      lines.push(h('div', { class: 'tip-head' }, h('b', null, def.name), h('span', { class: 'tip-cost' }, `${priceOf(k)}`)));
      if (priceNote(k)) lines.push(h('small', null, `${priceOf(k)}${priceNote(k)}`));
      lines.push(h('p', null, how ? worded(how.does) : def.desc));
      if (how) lines.push(h('p', { class: 'tip-use' }, h('b', null, 'How: '), worded(how.use)));
      const facts = [];
      if (how && how.maze) facts.push(how.maze.replace(/\.$/, ''));
      if (def.zone) facts.push(`${ZONES[def.zone].name} floor only`);
      if (def.rot) facts.push('R rotates');
      if (def.size) facts.push(`${def.size[0]} x ${def.size[1]} tiles`);
      lines.push(h('small', null, `${facts.join(' · ')} · key ${HOTKEYS[BUILD_KEYS.indexOf(k)]}`));
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
    const key = t ? t.key : HOTKEYS[i];
    const btn = h('button', {
      type: 'button', class: `bb-btn grp-${def ? def.group : 'tool'} tool-${k}`, 'aria-pressed': 'false',
      'aria-describedby': 'build-tip', 'data-k': k,
      'aria-label': def ? `${def.name}, $${def.cost}, key ${key}` : `${t.name} tool, key ${key}`,
      onclick: () => (t && t.action ? input.rebuild() : input.setTool(input.tool === k ? null : k)),
      // A finger has no hover, and a tapped button keeps focus on some phones: the tooltip comes
      // from a long press instead (below).
      onpointerenter: (e) => { if (e.pointerType !== 'touch') showTip(btn, k); }, onpointerleave: hideTip,
      onfocus: () => { if (!touchedLast()) showTip(btn, k); }, onblur: hideTip,
    },
    h('span', { class: 'hotkey', 'aria-hidden': 'true' }, key),
    h('span', { class: 'bb-icon', html: buildingIcon(k) }),
    h('span', { class: 'bb-name' }, def ? SHORT[k] || def.name : t.name),
    h('span', { class: 'bb-price' }, def ? `$${def.cost}` : t.price));
    // The four factory machines wear the colour of the painted floor they go on.
    if (def && def.zone) {
      btn.classList.add('zoned');
      btn.style.setProperty('--zone', ZONES[def.zone].color);
    }
    longPress(btn, () => showTip(btn, k), hideTip);
    buttons.set(k, btn);
    return btn;
  }

  const groups = ['factory', 'security'].map((g) => h('div', { class: `bb-group bb-${g}`, role: 'group', 'aria-label': g },
    h('span', { class: 'bb-label' }, g.toUpperCase()),
    h('div', { class: 'bb-btns' }, BUILD_KEYS.map((k, i) => (BUILD[k].group === g ? makeButton(k, i) : null)))));
  const tools = h('div', { class: 'bb-group bb-tools', role: 'group', 'aria-label': 'tools' },
    h('span', { class: 'bb-label' }, 'TOOLS'), h('div', { class: 'bb-btns' }, makeButton('upgrade', -1), makeButton('rebuild', -1), makeButton('remove', -1)));

  const dirEl = h('b');
  const hint = h('div', { class: 'bb-hints' },
    h('div', null, 'Facing ', dirEl, ' · ', h('kbd', null, 'R'), ' rotate · ', h('kbd', null, 'U'), ' upgrade'),
    h('div', null, h('kbd', null, 'WASD'), ' move the view · ', h('kbd', null, 'Wheel'), ' zoom · ', h('kbd', null, 'H'), ' my entrance'),
    h('div', null, h('kbd', null, 'Right-click'), ' remove · ', h('kbd', null, 'Esc'), ' drop it'));

  // A card that stays up while a tool is held, explaining what it does and how to use it. It
  // floats just above the bar and must never be part of the bar's layout: when it was, the bar's
  // height changed with each building's description, the floor was resized and the view jumped.
  const info = h('aside', { class: `bb-info hidden${folded ? ' folded' : ''}`, 'aria-live': 'polite' });
  // The buttons scroll sideways on a narrow screen. On a wide one this wrapper is invisible to
  // the layout (display: contents), so the bar is laid out as it always was.
  const scroller = h('div', { class: 'bb-scroll' }, groups, tools);
  const el = h('footer', { class: 'buildbar' }, scroller, info, hint);
  // A finger (or pen) can drag a building up out of its button onto the floor (0.3.03, input.js);
  // a sideways swipe still scrolls the bar (touch-action: pan-x in style.css).
  if (input.watchBar) input.watchBar(scroller, { onPick: hideTip });

  /** The button that folds the card down to its heading, for players who know the buildings. */
  const foldBtn = () => h('button', {
    type: 'button', class: 'bbi-fold', 'aria-label': folded ? 'Show what it does' : 'Hide the details', 'aria-expanded': String(!folded),
    onclick: () => {
      folded = !folded;
      try { localStorage.setItem(FOLD_KEY, folded ? '1' : '0'); } catch { /* not remembered */ }
      setClass(info, 'folded', folded);
      const b = info.querySelector('.bbi-fold');
      if (b) { b.setAttribute('aria-expanded', String(!folded)); b.setAttribute('aria-label', folded ? 'Show what it does' : 'Hide the details'); }
    },
  });
  let lastCash = null, lastTool, lastDir, lastUp = '', lastRubble = '';
  const rebuildBtn = buttons.get('rebuild'), rebuildNote = rebuildBtn.querySelector('.bb-price');
  // A badge on the Rebuild button while auto-rebuild is on (the switch itself is in the top bar).
  const autoBadge = h('span', { class: 'bb-auto hidden', title: 'Auto-rebuild is on (Shift+B switches it off)' }, 'AUTO');
  rebuildBtn.append(autoBadge);
  let lastAuto = null;

  function showInfo(k) {
    const def = BUILD[k];
    const how = def ? HOW[k] : TOOLS[k] ? TOOLS[k].how : null;
    setClass(info, 'hidden', !how);
    setClass(hint, 'hidden', !!how);
    if (!how) return;
    info.replaceChildren(
      h('div', { class: 'bbi-head' },
        h('span', { class: 'bbi-icon', html: buildingIcon(k) }),
        h('b', null, def ? def.name : TOOLS[k].name),
        // What it means for the maze, in two words.
        def ? h('span', { class: 'bbi-maze' }, !def.blocks ? 'Walkable' : k === 'belt' ? 'Blocks all but dads' : 'Blocks everyone') : null,
        def && def.zone ? h('span', { class: 'bbi-maze bbi-zone', style: { background: ZONES[def.zone].color } }, `${ZONES[def.zone].name} only`) : null,
        def ? h('span', { class: 'bbi-cost' }, `${priceOf(k)}`) : null,
        foldBtn()),
      h('p', null, worded(how.does)),
      h('p', null, h('b', null, 'How: '), worded(how.use)));
    // On a touch screen: how a finger places it (0.3.03). (The belt's "How" already says drag.)
    if (def && k !== 'belt' && isTouch()) info.append(h('p', { class: 'bbi-touch' }, PLACE_BY_TOUCH));
  }

  /** With the upgrade tool held: what the building under the mouse has and what more it could have. */
  function showUpgrade(s, cash) {
    const t = input.hover;
    const ai = t && s.grid[t.y * s.w + t.x] ? anchorOf(s, t.y * s.w + t.x) : -1;
    const b = ai >= 0 ? s.grid[ai] : 0;
    const key = b ? `${ai},${b.k},${JSON.stringify(b.u || 0)},${cash}` : '';
    if (key === lastUp) return;
    lastUp = key;
    if (!b) { showInfo('upgrade'); return; }
    const def = BUILD[b.k], tracks = tracksInfo(b);
    const head = h('div', { class: 'bbi-head' },
      h('span', { class: 'bbi-icon', html: buildingIcon(b.k) }),
      h('b', null, levelOf(b) > 1 ? `${def.name}, ${levelOf(b) - 1} upgrade${levelOf(b) > 2 ? 's' : ''}` : def.name),
      foldBtn());
    const body = tracks.length
      ? [
        ...tracks.map((tr) => h('p', { class: 'bbi-track' }, h('b', null, `${tr.name} ${tr.lv}/${tr.max}: `), tr.gain,
          tr.cost ? h('span', { class: `bbi-cost${cash < tr.cost ? ' poor' : ''}` }, ` ${money(tr.cost)}`) : null)),
        h('p', null, touchedLast() ? 'Tap it to choose an upgrade.' : 'Click it to choose an upgrade. U buys the first one.'),
      ]
      : [h('p', null, 'This cannot be upgraded.')];
    info.replaceChildren(head, ...body);
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
      btn.setAttribute('aria-label', `${def.name}, ${p}${priceNote(k)}, key ${HOTKEYS[BUILD_KEYS.indexOf(k)]}`);
    }
    if (input.tool && BUILD[input.tool]) showInfo(input.tool);
  }

  function update(s) {
    updatePrices(s);
    const cash = Math.floor(s.players[session.me]?.cash ?? 0);
    if (cash !== lastCash) {
      lastCash = cash;
      for (const [k, btn] of buttons) if (BUILD[k]) setClass(btn, 'poor', cash < priceOf(k));
    }
    if (input.tool !== lastTool) {
      lastTool = input.tool;
      lastUp = '';
      for (const [k, btn] of buttons) {
        const on = k === input.tool;
        setClass(btn, 'on', on);
        btn.setAttribute('aria-pressed', String(on));
      }
      showInfo(input.tool);
    }
    if (input.tool === 'upgrade') showUpgrade(s, cash);
    // The Rebuild button says how much of yours is lying in pieces and what putting it back costs.
    let n = 0, cost = 0;
    // (Half of what had been spent on each; with less money it comes back with fewer upgrades.)
    for (const r of s.rubble) if (r.o === session.me) { n++; cost += rebuildDeal(r, Infinity).pay; }
    const sig = `${n},${cost},${cash >= cost}`;
    if (sig !== lastRubble) {
      lastRubble = sig;
      rebuildNote.textContent = n ? `${n} for ${money(cost)}` : 'half price';
      setClass(rebuildBtn, 'idle', n === 0);
      setClass(rebuildBtn, 'alert', n > 0);
    }
    const auto = !!s.players[session.me]?.autoRebuild;
    if (auto !== lastAuto) { lastAuto = auto; setClass(autoBadge, 'hidden', !auto); }
    if (input.dir !== lastDir) {
      lastDir = input.dir;
      dirEl.textContent = `${DIR_ARROWS[input.dir]} ${DIR_NAMES[input.dir]}`;
    }
  }

  return { el, tip, info, update, highlight };
}
