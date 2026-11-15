// DEB's speech bubble. Lines queue up: each one stays about 8 seconds, or at least 3.5 seconds when
// others are waiting, and none is ever dropped. Refusals ('nope') jump the queue but are limited to
// one every 2 seconds per reason, because dragging over bad tiles produces dozens.
import { h, setText } from './dom.js';
import { debFace } from './icons.js';

const SHOW_MS = 8000;
const MIN_MS = 3500;
const NOPE_MS = 4500;
const NOPE_GAP_MS = 2000;

export function createDeb() {
  const face = h('div', { class: 'deb-face' });
  const who = h('div', { class: 'deb-tag' }, 'DEB (HR)');
  const text = h('p', { class: 'deb-text' });
  const more = h('span', { class: 'deb-more' });
  const bubble = h('div', { class: 'deb-bubble' }, text, more);
  const el = h('section', {
    class: 'deb hidden', 'aria-live': 'polite', 'aria-label': 'DEB, the HR chatbot',
    title: 'Click to skip. She will not be offended. She cannot feel.',
  }, who, h('div', { class: 'deb-body' }, face, bubble));
  el.addEventListener('click', () => next(performance.now()));

  const queue = [];
  let cur = null;
  let since = 0;
  let mood = null;
  const lastNope = new Map();

  function show(msg, now) {
    cur = msg;
    since = now;
    if (msg.mood !== mood) {
      mood = msg.mood;
      face.innerHTML = debFace(mood);
    }
    setText(who, msg.who || 'DEB (HR)');
    setText(text, msg.text);
    el.classList.toggle('is-nope', msg.kind === 'nope');
    el.classList.remove('hidden');
    // Restart the pop-in animation.
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    updateMore();
  }

  function updateMore() {
    setText(more, queue.length ? `+${queue.length} more` : '');
  }

  function next(now) {
    if (queue.length) show(queue.shift(), now);
    else { cur = null; el.classList.add('hidden'); }
    updateMore();
  }

  /** A line from the host: { who, text, mood }. */
  function say(m, now = performance.now()) {
    const msg = { kind: 'say', who: m.who, text: String(m.text ?? ''), mood: m.mood || 'flat' };
    if (!cur) show(msg, now);
    else { queue.push(msg); updateMore(); }
  }

  /** The local player's command was refused. */
  function nope(why, text, now = performance.now()) {
    if (now - (lastNope.get(why) ?? -1e9) < NOPE_GAP_MS) return;
    lastNope.set(why, now);
    const msg = { kind: 'nope', who: 'DEB (HR)', text, mood: 'angry' };
    if (!cur || cur.kind === 'nope' || now - since >= MIN_MS) { show(msg, now); return; }
    // DEB is mid-sentence: this goes next, replacing any refusal already waiting.
    const i = queue.findIndex((q) => q.kind === 'nope');
    if (i >= 0) queue.splice(i, 1);
    queue.unshift(msg);
    updateMore();
  }

  function tick(now) {
    if (!cur) return;
    const age = now - since;
    const limit = cur.kind === 'nope' ? NOPE_MS : SHOW_MS;
    if ((queue.length && age >= MIN_MS) || age >= limit) next(now);
  }

  /** After a fast-forward: forget the backlog, show only the most recent line. */
  function collapse(now = performance.now()) {
    const last = queue.length ? queue[queue.length - 1] : cur;
    queue.length = 0;
    if (last) show(last, now);
  }

  return { el, say, nope, tick, collapse };
}
