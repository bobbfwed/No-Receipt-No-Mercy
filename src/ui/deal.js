// A plain stand-in for the deal (0.3.01): while the game's cards are being revealed (phase
// 'cards'), a box in the middle of the floor lists each card as it comes, with a button to skip the
// rest. It only keeps the game from looking stuck; the real card display (cards flying into slots,
// the detail panel, the sounds) replaces it.
import { cardsShown } from '../sim/index.js';
import { cardText, SIDE_NAMES } from '../content/cards.js';
import { h, setText, setClass } from './dom.js';

/**
 * @param {Object} session
 * @param {Object} [o]
 * @param {(name: string) => void} [o.playSound]
 * @returns {{el: HTMLElement, update: (s: Object) => boolean}} update says whether it is showing
 */
export function createDealNotice(session, { playSound = () => {} } = {}) {
  const list = h('ol', { class: 'deal-list' });
  const skip = h('button', {
    type: 'button', class: 'btn-small deal-skip',
    onclick: () => {
      const me = session.state && session.state.players[session.me];
      playSound('click');
      session.send({ c: 'skipCards', on: !(me && me.skip) });
    },
  }, 'Skip');
  const el = h('section', { class: 'deal hidden', role: 'status', 'aria-live': 'polite' },
    h('h2', { class: 'deal-title' }, "THIS GAME'S CARDS"), list, skip);
  let sig = '';

  function update(s) {
    const on = !!s && s.phase === 'cards';
    setClass(el, 'hidden', !on);
    if (!on) { sig = ''; return false; }
    const shown = cardsShown(s);
    const me = s.players[session.me];
    const waiting = s.players.filter((p) => p.on && p.side !== 'office' && !p.skip).length;
    const now = `${shown},${me && me.skip ? 1 : 0},${waiting}`;
    if (now === sig) return true;
    sig = now;
    list.replaceChildren(...s.cards.slice(0, shown).map((id) => {
      const t = cardText(id);
      return h('li', { class: `deal-card deal-${t ? t.side : 'odd'}` },
        h('b', null, t ? t.name : id), h('small', null, t ? ` (${SIDE_NAMES[t.side]})` : ''),
        h('p', null, t ? t.rule : ''));
    }));
    setText(skip, me && me.skip ? (waiting ? `Waiting for ${waiting} more to skip` : 'Skipping') : 'Skip');
    return true;
  }

  return { el, update };
}
