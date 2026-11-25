// Rebuilding from the screen (0.2.15): the switch that has the game put a player's wrecked
// buildings back for him (Shift+B does the same; the rules are autoRebuild in
// src/sim/commands.js), and the big REBUILD button that floats over the floor while anything of
// his is wrecked, so nobody has to scroll the build bar on a phone to find out.
import { TUNE, BUILD, canPlace, rebuildDeal, footprint } from '../sim/index.js';
import { h, setClass, setText, money } from './dom.js';
import { buildingIcon } from './icons.js';

/** What the big button says when a rebuild would be refused right now, by canPlace's reason. */
const WHY = {
  shopper: 'Some idiot is standing in the hole',
  blocked: 'It would wall the shoppers in. Let them pass',
  bank: 'It would wall off a bank of tills',
  paused: 'The game is paused. Press play first',
};

/**
 * Whether this player has anything wrecked, and what pressing B would do about it right now.
 * Pure: it changes nothing, and checks what the 'rebuild' command checks (canPlace, then the
 * price from rebuildDeal), oldest wreck first, stopping at the first one that could go back.
 * @returns {null | {n: number, cost: number, can: boolean, why: string, auto: boolean}} null when
 *   there is nothing of his to rebuild (or he is Head Office, or the game is not being played).
 *   n: his wrecks; cost: putting them all back with every upgrade (half of what was spent);
 *   can: B would put at least one back now; why: if not, what to tell him; auto: his switch.
 */
export function rebuildStatus(s, me) {
  const p = s && s.players[me];
  if (!p || p.side === 'office' || (s.phase !== 'build' && s.phase !== 'wave')) return null;
  let n = 0, cost = 0, can = false, why = '';
  for (const r of s.rubble) {
    if (r.o !== me) continue;
    const x = r.i % s.w, y = (r.i / s.w) | 0;
    const tiles = footprint(s, r.k, x, y, r.d | 0);
    // Built over since: B only tidies it away, so it is not a hole any more.
    if (!tiles || tiles.some((t) => s.grid[t])) continue;
    n++;
    cost += rebuildDeal(r, Infinity).pay;
    if (can) continue;
    const no = canPlace(s, r.k, x, y, me, r.d | 0);
    if (!no && rebuildDeal(r, p.cash)) { can = true; continue; }
    if (!why) {
      why = !no || no === 'cash'
        ? `Too broke. Need ${money(Math.floor(BUILD[r.k].cost * TUNE.rebuildShare))}`
        : WHY[no] || 'Not right now';
    }
  }
  if (!n) return null;
  return { n, cost, can, why: can ? '' : why, auto: !!p.autoRebuild };
}

/**
 * The big REBUILD button over the floor, with the auto-rebuild switch beside it. Shown only while
 * this player has something wrecked; dimmed, with the reason, while B would be refused.
 * @param {Object} session
 * @param {Object} o
 * @param {() => void} o.rebuild does what B does
 * @param {(name: string) => void} [o.playSound]
 * @returns {{el: HTMLElement, update: (s: Object) => void}}
 */
export function createRebuildPop(session, { rebuild, playSound = () => {} }) {
  const count = h('b', { class: 'rp-count' });
  const sub = h('small', { class: 'rp-sub' });
  const btn = h('button', {
    type: 'button', class: 'rp-btn',
    title: 'Put back everything of yours the gym bros wrecked, at half of what you spent on it (key B)',
    onclick: () => rebuild(),
  },
  h('span', { class: 'hotkey', 'aria-hidden': 'true' }, 'B'),
  h('span', { class: 'rp-icon', html: buildingIcon('rebuild') }),
  h('span', { class: 'rp-text' }, count, sub));
  const auto = createAutoSwitch(session, { playSound, cls: 'rp-auto' });
  const el = h('div', { class: 'rebuild-pop hidden', role: 'group', 'aria-label': 'Rebuild' }, btn, auto.el);
  let key = '', shown = '';
  function update(s) {
    const p = s.players[session.me];
    // Checking a rebuild can cost a path search per wreck, so only when something that matters
    // has changed (and at most every sixth step, about five times a second at normal speed).
    const k = p ? `${s.phase},${s.rubble.length},${Math.floor(p.cash)},${p.autoRebuild ? 1 : 0},${p.side},${Math.floor(s.tick / 6)},${s.gridVer}` : '';
    auto.update(s);
    if (k === key) return;
    key = k;
    const st = rebuildStatus(s, session.me);
    const next = st ? JSON.stringify(st) : '';
    if (next === shown) return;
    shown = next;
    setClass(el, 'hidden', !st);
    if (!st) return;
    setText(count, `REBUILD ${st.n} · ${money(st.cost)}`);
    setText(sub, st.can ? (st.auto ? 'Auto is on. Or press now and skip the wait' : 'Your shit is broken. Fix it') : st.why);
    setClass(btn, 'dim', !st.can);
    btn.setAttribute('aria-label', `Rebuild ${st.n} wrecked for ${money(st.cost)}${st.can ? '' : `: ${st.why}`}`);
  }
  return { el, update };
}

/** The switch's tooltip. */
export const AUTO_TITLE = `Auto-rebuild (Shift+B): the store puts back whatever gym bros wreck of yours, at the usual half price, as soon as it is allowed, but never sooner than ${TUNE.autoRebuildSecs} seconds after it broke, so the crowd behind him still gets through. Oldest wreck first.`;

/**
 * A switch for this player's auto-rebuild, showing clearly whether it is on.
 * @param {Object} session
 * @param {Object} [o]
 * @param {(name: string) => void} [o.playSound]
 * @param {string} [o.cls] extra class, for where it sits
 * @returns {{el: HTMLElement, update: (s: Object) => void}}
 */
export function createAutoSwitch(session, { playSound = () => {}, cls = '' } = {}) {
  const state = h('b', { class: 'ab-state' }, 'OFF');
  const el = h('button', {
    type: 'button', class: `btn-auto ${cls}`.trim(), role: 'switch', 'aria-checked': 'false', title: AUTO_TITLE,
    onclick: () => {
      const me = session.state?.players[session.me];
      if (!me) return;
      playSound('click');
      session.send({ c: 'autoRebuild', on: !me.autoRebuild });
    },
  }, h('span', { class: 'ab-knob', 'aria-hidden': 'true' }), h('span', { class: 'ab-label' }, 'AUTO', h('span', { class: 'ab-long' }, '-REBUILD')), state);
  let last = null;
  function update(s) {
    const me = s.players[session.me];
    // Head Office does not build, so has nothing to rebuild.
    const sig = !me || me.side === 'office' ? 'none' : me.autoRebuild ? 'on' : 'off';
    if (sig === last) return;
    last = sig;
    setClass(el, 'hidden', sig === 'none');
    setClass(el, 'on', sig === 'on');
    el.setAttribute('aria-checked', String(sig === 'on'));
    setText(state, sig === 'on' ? 'ON' : 'OFF');
  }
  return { el, update };
}
