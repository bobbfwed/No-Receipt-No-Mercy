// Customer review toasts (top right) and short notices such as players joining (top centre).
import { SHOPPERS, BOSS, bossTier, bossTitle } from '../sim/index.js';
import { h } from './dom.js';
import { SUNGLASSES } from './icons.js';

const REVIEW_MS = 6000;
const NOTICE_MS = 4500;
const MAX_REVIEWS = 3;

/**
 * @param {Object} [o]
 * @param {() => Object|null} [o.getState] the game state, to tell which title a boss's review is signed with
 */
export function createToasts({ getState = () => null } = {}) {
  const reviews = h('div', { class: 'reviews', 'aria-live': 'polite', 'aria-label': 'Customer reviews' });
  const notices = h('div', { class: 'notices', 'aria-live': 'polite' });
  const live = []; // { el, until }

  function add(container, el, ms, max) {
    container.prepend(el);
    const item = { el, until: performance.now() + ms, container };
    live.push(item);
    const mine = live.filter((x) => x.container === container);
    while (max && mine.length > max) drop(mine.shift());
  }

  function drop(item) {
    const i = live.indexOf(item);
    if (i >= 0) live.splice(i, 1);
    item.el.classList.add('leaving');
    setTimeout(() => item.el.remove(), 250);
  }

  /**
   * The boss is not one of SHOPPERS: he signs with the title he has now. The review does not
   * carry his tier, so take it from the boss in the store, or from the sales event.
   */
  function bossName(m) {
    const s = getState();
    let tier = m.tier | 0;
    if (!tier && s) tier = s.shoppers?.find((x) => x.k === 'boss')?.tr || bossTier(s.wave) || 0;
    if (!tier) return BOSS.name;
    const title = bossTitle(tier);
    return /^The /.test(title) ? title : `The ${title}`;
  }

  /** { stars, text, kind } */
  function review(m) {
    const stars = Math.max(0, Math.min(5, Math.round(Number(m.stars) || 0)));
    const five = stars >= 5;
    const who = m.kind === 'boss' ? bossName(m) : SHOPPERS[m.kind]?.name || 'A shopper';
    const starEls = [];
    for (let i = 0; i < 5; i++) starEls.push(h('span', { class: i < stars ? 'st on' : 'st' }, i < stars ? '★' : '☆'));
    const el = h('article', { class: `review-toast ${five ? 'five' : 'low'}` },
      h('div', { class: 'rt-head' },
        h('span', { class: 'rt-label' }, five ? 'NEW REVIEW · VERIFIED SMUG' : 'NEW REVIEW'),
        five ? h('span', { class: 'rt-shades', html: SUNGLASSES }) : null),
      h('div', { class: 'rt-stars', 'aria-label': `${stars} out of 5 stars` }, starEls),
      h('p', { class: 'rt-text' }, String(m.text ?? '')),
      h('div', { class: 'rt-who' }, `— ${who}${five ? ', got his refund' : ''}`));
    add(reviews, el, REVIEW_MS, MAX_REVIEWS);
  }

  /** { text } */
  function notice(text, kind = 'info') {
    add(notices, h('div', { class: `notice ${kind}` }, String(text ?? '')), NOTICE_MS, 3);
  }

  function tick(now) {
    for (const item of [...live]) if (now >= item.until) drop(item);
  }

  return { reviews, notices, review, notice, tick };
}
