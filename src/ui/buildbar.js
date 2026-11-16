// The build bar: one button per building, grouped Factory and Security, plus the Upgrade and
// Remove tools.
import { BUILD, TUNE, ZONES, levelOf, upgradeCost, statsOf } from '../sim/index.js';
import { h, setClass, money } from './dom.js';
import { buildingIcon } from './icons.js';
import { BUILD_KEYS, HOTKEYS } from './input.js';
import { longPress, touchedLast } from './touch.js';
import { HOW, HOW_REMOVE, HOW_UPGRADE, HOW_REBUILD } from '../content/help.js';
import { worded } from '../content/touch.js';

// On a phone the info card is a sheet over the floor; the player can fold it down to one line,
// and it stays folded for the next tool too.
const FOLD_KEY = 'returns-dept.info-folded';
// Until the player chooses, a phone on its side starts with it folded: there the card would
// cover half the floor.
let folded = typeof innerHeight === 'number' && innerHeight < 560;
try { const v = localStorage.getItem(FOLD_KEY); if (v !== null) folded = v === '1'; } catch { /* not remembered */ }

const DIR_NAMES = ['east', 'south', 'west', 'north'];
/** Names short enough for a button; the tooltip has the full one. */
const SHORT = { chute: 'Chute', crate: 'Crates', sprinkler: 'Sprinkler', forklift: 'Forklift', wetfloor: 'Wet Floor', samples: 'Samples' };
const DIR_ARROWS = ['→', '↓', '←', '↑'];
/** The tools that are not buildings: label, hotkey, what the price line says, and the help text. */
const TOOLS = {
  upgrade: { name: 'Upgrade', key: 'U', price: 'security', how: HOW_UPGRADE, keys: 'key U' },
  // Not a tool you hold: one press puts back everything of yours that gym bros have wrecked.
  rebuild: { name: 'Rebuild', key: 'B', price: 'nothing wrecked', how: HOW_REBUILD, keys: 'key B', action: true },
  remove: { name: 'Remove', key: 'X', price: `${Math.round(TUNE.sellBack * 100)}% back`, how: HOW_REMOVE, keys: 'key X or Delete' },
};

const one = (n) => (Math.round(n * 10) / 10).toString();

/** What the next level changes, as short "name old → new" phrases. */
function gains(b) {
  const lv = levelOf(b), now = statsOf(b, lv), next = statsOf(b, lv + 1);
  const out = [];
  const add = (label, a, z) => { if (one(a) !== one(z)) out.push(`${label} ${one(a)} → ${one(z)}`); };
  if (b.k === 'sprinkler' || b.k === 'forklift') { add('hit', now.dmg, next.dmg); add('range', now.range, next.range); }
  if (b.k === 'samples') { add('stops them for', now.secs, next.secs); add('range', now.range, next.range); }
  if (b.k === 'wetfloor') {
    out.push(`walking speed ${Math.round(now.slow * 100)}% → ${Math.round(next.slow * 100)}%`);
    out.push(`dads slip ${Math.round(now.slip * 100)}% → ${Math.round(next.slip * 100)}%`);
  }
  return out.join(' · ');
}

/**
 * @param {Object} input the input controller (tool, dir, hover, setTool)
 * @param {Object} session
 */
export function createBuildBar(input, session) {
  const tip = h('div', { class: 'tip hidden', role: 'tooltip', id: 'build-tip' });
  const buttons = new Map();

  function showTip(btn, k) {
    const def = BUILD[k];
    const lines = [];
    if (def) {
      const how = HOW[k];
      lines.push(h('div', { class: 'tip-head' }, h('b', null, def.name), h('span', { class: 'tip-cost' }, `$${def.cost}`)));
      lines.push(h('p', null, how ? worded(how.does) : def.desc));
      if (how) lines.push(h('p', { class: 'tip-use' }, h('b', null, 'How: '), worded(how.use)));
      const facts = [];
      if (how && how.maze) facts.push(how.maze.replace(/\.$/, ''));
      if (def.zone) facts.push(`${ZONES[def.zone].name} floor only`);
      if (def.rot) facts.push('R rotates');
      if (def.up) facts.push('U upgrades');
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

  // A card in the build bar that stays up while a tool is held, explaining what it does and how
  // to use it. It takes the place of the control hints, so it never covers the floor.
  const info = h('aside', { class: `bb-info hidden${folded ? ' folded' : ''}`, 'aria-live': 'polite' });
  // The buttons scroll sideways on a narrow screen. On a wide one this wrapper is invisible to
  // the layout (display: contents), so the bar is laid out as it always was.
  const scroller = h('div', { class: 'bb-scroll' }, groups, tools);
  const el = h('footer', { class: 'buildbar' }, scroller, info, hint);

  /** The button that folds the info sheet on a phone (hidden on a big screen). */
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
        def ? h('span', { class: 'bbi-cost' }, `$${def.cost}`) : null,
        foldBtn()),
      h('p', null, worded(how.does)),
      h('p', null, h('b', null, 'How: '), worded(how.use)));
  }

  /** With the upgrade tool held: what upgrading the building under the mouse costs and gives. */
  function showUpgrade(s, cash) {
    const t = input.hover;
    const b = t ? s.grid[t.y * s.w + t.x] : 0;
    const key = b ? `${t.x},${t.y},${b.k},${levelOf(b)},${cash >= upgradeCost(b)}` : '';
    if (key === lastUp) return;
    lastUp = key;
    if (!b) { showInfo('upgrade'); return; }
    const def = BUILD[b.k], lv = levelOf(b), cost = upgradeCost(b);
    const head = h('div', { class: 'bbi-head' },
      h('span', { class: 'bbi-icon', html: buildingIcon(b.k) }),
      h('b', null, `${def.name}, level ${lv}`),
      cost ? h('span', { class: `bbi-cost${cash < cost ? ' poor' : ''}` }, money(cost)) : null,
      foldBtn());
    let body;
    if (!def.up) body = h('p', null, 'This cannot be upgraded. Only security can: sprinklers, forklifts, wet floor signs and free samples.');
    else if (!cost) body = h('p', null, `Level ${TUNE.maxLevel} is as far as it goes. It has peaked, like you.`);
    else {
      body = [
        h('p', null, h('b', null, `Level ${lv + 1}: `), gains(b)),
        h('p', null, cash < cost ? `You are ${money(cost - cash)} short. ` : touchedLast() ? 'Tap it again to upgrade. ' : 'Click to upgrade. ', `The level after costs ${money(Math.round(cost * TUNE.upGrowth))}.`),
      ];
    }
    info.replaceChildren(head, ...[].concat(body));
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

  function update(s) {
    const cash = Math.floor(s.players[session.me]?.cash ?? 0);
    if (cash !== lastCash) {
      lastCash = cash;
      for (const [k, btn] of buttons) if (BUILD[k]) setClass(btn, 'poor', cash < BUILD[k].cost);
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
    for (const r of s.rubble) if (r[3] === session.me) { n++; cost += BUILD[r[1]].cost; }
    const sig = `${n},${cost},${cash >= cost}`;
    if (sig !== lastRubble) {
      lastRubble = sig;
      rebuildNote.textContent = n ? `${n} for ${money(cost)}` : 'nothing wrecked';
      setClass(rebuildBtn, 'idle', n === 0);
      setClass(rebuildBtn, 'alert', n > 0);
    }
    if (input.dir !== lastDir) {
      lastDir = input.dir;
      dirEl.textContent = `${DIR_ARROWS[input.dir]} ${DIR_NAMES[input.dir]}`;
    }
  }

  return { el, tip, info, update, highlight };
}
