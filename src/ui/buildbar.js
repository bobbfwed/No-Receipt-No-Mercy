// The build bar: one button per building, grouped Factory and Security, plus the Remove tool.
import { BUILD, TUNE } from '../sim/index.js';
import { h, setClass } from './dom.js';
import { buildingIcon } from './icons.js';
import { BUILD_KEYS, HOTKEYS } from './input.js';

const DIR_NAMES = ['east', 'south', 'west', 'north'];
/** Names short enough for a button; the tooltip has the full one. */
const SHORT = { chute: 'Chute', crate: 'Crates', sprinkler: 'Sprinkler', forklift: 'Forklift', wetfloor: 'Wet Floor', samples: 'Samples' };
const DIR_ARROWS =['→', '↓', '←', '↑'];

/**
 * @param {Object} input the input controller (tool, dir, setTool)
 */
export function createBuildBar(input) {
  const tip = h('div', { class: 'tip hidden', role: 'tooltip', id: 'build-tip' });
  const buttons = new Map();

  function showTip(btn, k) {
    const def = BUILD[k];
    const lines = [];
    if (def) {
      lines.push(h('div', { class: 'tip-head' }, h('b', null, def.name), h('span', { class: 'tip-cost' }, `$${def.cost}`)));
      lines.push(h('p', null, def.desc));
      const facts = [];
      if (def.blocks) facts.push('Blocks shoppers');
      else facts.push('Shoppers walk over it');
      if (def.rot) facts.push('Rotates (R)');
      if (def.range) facts.push(`Range ${def.range}`);
      lines.push(h('small', null, `${facts.join(' · ')} · key ${HOTKEYS[BUILD_KEYS.indexOf(k)]}`));
    } else {
      lines.push(h('div', { class: 'tip-head' }, h('b', null, 'Remove')));
      lines.push(h('p', null, `Sells a building back for ${Math.round(TUNE.sellBack * 100)}% of its price. Right-click does the same with any tool.`));
      lines.push(h('small', null, 'key X or Delete'));
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
    const def = BUILD[k];
    const key = k === 'remove' ? 'X' : HOTKEYS[i];
    const btn = h('button', {
      type: 'button', class: `bb-btn grp-${def ? def.group : 'tool'}`, 'aria-pressed': 'false',
      'aria-describedby': 'build-tip', 'data-k': k,
      'aria-label': def ? `${def.name}, $${def.cost}, key ${key}` : 'Remove tool, key X',
      onclick: () => input.setTool(input.tool === k ? null : k),
      onpointerenter: () => showTip(btn, k), onpointerleave: hideTip,
      onfocus: () => showTip(btn, k), onblur: hideTip,
    },
    h('span', { class: 'hotkey', 'aria-hidden': 'true' }, key),
    h('span', { class: 'bb-icon', html: buildingIcon(k) }),
    h('span', { class: 'bb-name' }, def ? SHORT[k] || def.name : 'Remove'),
    h('span', { class: 'bb-price' }, def ? `$${def.cost}` : `${Math.round(TUNE.sellBack * 100)}% back`));
    buttons.set(k, btn);
    return btn;
  }

  const groups = ['factory', 'security'].map((g) => h('div', { class: `bb-group bb-${g}`, role: 'group', 'aria-label': g },
    h('span', { class: 'bb-label' }, g.toUpperCase()),
    h('div', { class: 'bb-btns' }, BUILD_KEYS.map((k, i) => (BUILD[k].group === g ? makeButton(k, i) : null)))));
  const tools = h('div', { class: 'bb-group bb-tools', role: 'group', 'aria-label': 'tools' },
    h('span', { class: 'bb-label' }, 'TOOLS'), h('div', { class: 'bb-btns' }, makeButton('remove', -1)));

  const dirEl = h('b');
  const hint = h('div', { class: 'bb-hints' },
    h('div', null, 'Facing ', dirEl, ' · ', h('kbd', null, 'R'), ' rotate'),
    h('div', null, 'Drag to lay belts'),
    h('div', null, h('kbd', null, 'Right-click'), ' remove · ', h('kbd', null, 'Esc'), ' drop it'));

  const el = h('footer', { class: 'buildbar' }, groups, tools, hint);
  let lastCash = null, lastTool, lastDir;

  function update(s) {
    if (s.cash !== lastCash) {
      lastCash = s.cash;
      for (const [k, btn] of buttons) if (BUILD[k]) setClass(btn, 'poor', s.cash < BUILD[k].cost);
    }
    if (input.tool !== lastTool) {
      lastTool = input.tool;
      for (const [k, btn] of buttons) {
        const on = k === input.tool;
        setClass(btn, 'on', on);
        btn.setAttribute('aria-pressed', String(on));
      }
    }
    if (input.dir !== lastDir) {
      lastDir = input.dir;
      dirEl.textContent = `${DIR_ARROWS[input.dir]} ${DIR_NAMES[input.dir]}`;
    }
  }

  return { el, tip, update };
}
