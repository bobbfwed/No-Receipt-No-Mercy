// Customer review toasts (top right) and short notices such as players joining (top centre).
import { SHOPPERS } from '../sim/index.js';
import { h } from './dom.js';
import { SUNGLASSES } from './icons.js';

const REVIEW_MS = 6000;
const NOTICE_MS = 4500;
const MAX_REVIEWS = 3;

export function createToasts() {
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

  /** { stars, text, kind } */
  function review(m) {
    const stars = Math.max(0, Math.min(5, Math.round(Number(m.stars) || 0)));
    const five = stars >= 5;
    const who = SHOPPERS[m.kind]?.name || 'A shopper';
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
