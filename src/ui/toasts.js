// Customer review toasts (top right) and short notices such as players joining (top centre; on a
// phone both stand in one column at the top right, notices first, so they never overlap).
// A click or a tap on either sends it away at once (0.4, the owner: they were in the way of
// building). Each review carries a "Hide reviews" button: from then on no review pops up for this
// player, until he turns them back on in the sound and settings menu (prefs.js). The end-of-event
// performance review is something else (review.js) and always shows.
import { SHOPPERS, BOSS, bossTier, bossTitle } from '../sim/index.js';
import { h } from './dom.js';
import { SUNGLASSES } from './icons.js';
import { prefs as sharedPrefs } from './prefs.js';

/** How long a review stays: 25% shorter than the 6 seconds of 0.3 (the owner, 0.4). */
export const REVIEW_MS = 4500;
export const NOTICE_MS = 4500;
export const MAX_REVIEWS = 3;
/** What a notice says when reviews have just been hidden. */
export const REVIEWS_HIDDEN = 'Reviews hidden. They still hate you, you just will not have to read it. Sound & settings brings them back.';

/**
 * The timing of the toasts on screen, without the page: which are up, until when, and which go when.
 * Items are any objects; the list only adds `until` and `group` to its own records.
 */
export function createToastList() {
  const live = []; // { item, group, until }
  return {
    /** Adds an item for `ms`; returns the items pushed out because its group holds more than `max`. */
    add(item, group, now, ms, max = 0) {
      live.push({ item, group, until: now + ms });
      const mine = live.filter((x) => x.group === group);
      const out = [];
      while (max && mine.length > max) { const x = mine.shift(); live.splice(live.indexOf(x), 1); out.push(x.item); }
      return out;
    },
    /** Takes an item away at once (a click). True if it was up. */
    dismiss(item) {
      const i = live.findIndex((x) => x.item === item);
      if (i < 0) return false;
      live.splice(i, 1);
      return true;
    },
    /** Takes away every item of a group; returns them. */
    clear(group) {
      const out = live.filter((x) => x.group === group).map((x) => x.item);
      for (let i = live.length - 1; i >= 0; i--) if (live[i].group === group) live.splice(i, 1);
      return out;
    },
    /** Takes away whatever has had its time; returns them. */
    due(now) {
      const out = [];
      for (let i = live.length - 1; i >= 0; i--) if (now >= live[i].until) out.unshift(live.splice(i, 1)[0].item);
      return out;
    },
    count: (group) => live.filter((x) => group === undefined || x.group === group).length,
  };
}

/**
 * @param {Object} [o]
 * @param {() => Object|null} [o.getState] the game state, to tell which title a boss's review is signed with
 * @param {Object} [o.prefs] the player's screen choices (prefs.js); the page's own by default
 */
export function createToasts({ getState = () => null, prefs = sharedPrefs() } = {}) {
  const reviews = h('div', { class: 'reviews', 'aria-live': 'polite', 'aria-label': 'Customer reviews' });
  const notices = h('div', { class: 'notices', 'aria-live': 'polite' });
  // One box for both, so that on a phone they can share a column (style.css); on a big screen the
  // box takes no part in the layout and each keeps its own place.
  const el = h('div', { class: 'toasts' }, notices, reviews);
  const list = createToastList();

  function add(container, group, node, ms, max) {
    container.prepend(node);
    for (const out of list.add(node, group, performance.now(), ms, max)) leave(out);
  }
  /** Fades out a toast whose time is up. */
  function leave(node) {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 250);
  }
  /** A click or a tap: gone at once, so the floor under it is free straight away. */
  function dismiss(node) {
    if (list.dismiss(node)) node.remove();
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

  /** Stops reviews popping up (the button on each one). */
  function hideReviews() {
    prefs.set('reviews', false);
    for (const node of list.clear('review')) node.remove();
    notice(REVIEWS_HIDDEN);
  }

  /** { stars, text, kind } */
  function review(m) {
    if (!prefs.get('reviews')) return;
    const stars = Math.max(0, Math.min(5, Math.round(Number(m.stars) || 0)));
    const five = stars >= 5;
    const who = m.kind === 'boss' ? bossName(m) : SHOPPERS[m.kind]?.name || 'A shopper';
    const starEls = [];
    for (let i = 0; i < 5; i++) starEls.push(h('span', { class: i < stars ? 'st on' : 'st' }, i < stars ? '★' : '☆'));
    const hide = h('button', {
      type: 'button', class: 'rt-hide', title: 'Stop reviews popping up. Turn them back on in Sound & settings.',
      onclick: (e) => { e.stopPropagation(); hideReviews(); },
    }, 'Hide reviews');
    const node = h('article', {
      class: `review-toast ${five ? 'five' : 'low'}`, title: 'Tap to get rid of it',
      onclick: () => dismiss(node),
    },
    h('div', { class: 'rt-head' },
      h('span', { class: 'rt-label' }, five ? 'NEW REVIEW · VERIFIED SMUG' : 'NEW REVIEW'),
      five ? h('span', { class: 'rt-shades', html: SUNGLASSES }) : null,
      hide),
    h('div', { class: 'rt-stars', 'aria-label': `${stars} out of 5 stars` }, starEls),
    h('p', { class: 'rt-text' }, String(m.text ?? '')),
    h('div', { class: 'rt-who' }, `— ${who}${five ? ', got his refund' : ''}`));
    add(reviews, 'review', node, REVIEW_MS, MAX_REVIEWS);
  }

  /** { text } */
  function notice(text, kind = 'info') {
    const node = h('div', { class: `notice ${kind}`, onclick: () => dismiss(node) }, String(text ?? ''));
    add(notices, 'notice', node, NOTICE_MS, 3);
  }

  /**
   * A notice that stays until it is taken down (the host's game in the background, 0.4). Returns
   * a function that takes it down. A click does not dismiss it: it is true until it is taken down.
   */
  function standing(text, kind = 'warn') {
    const node = h('div', { class: `notice standing ${kind}`, role: 'status' }, String(text ?? ''));
    notices.append(node);
    return () => node.remove();
  }

  function tick(now) {
    for (const node of list.due(now)) leave(node);
  }

  return { el, reviews, notices, review, notice, standing, tick };
}
