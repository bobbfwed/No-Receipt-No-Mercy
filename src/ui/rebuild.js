// Auto-rebuild (0.2.14): the switch that has the game put a player's wrecked buildings back for
// him (Shift+B does the same). The rules are in src/sim/commands.js (autoRebuild).
import { TUNE } from '../sim/index.js';
import { h, setClass, setText } from './dom.js';

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
  }, h('span', { class: 'ab-knob', 'aria-hidden': 'true' }), h('span', { class: 'ab-label' }, 'AUTO-REBUILD'), state);
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
