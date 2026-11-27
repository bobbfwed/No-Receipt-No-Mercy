// The end-of-wave performance review. It floats over the warehouse without stopping anything:
// the game runs on behind it, it can be closed at any time, and it closes itself when the doors open.
import { TUNE, TICK_HZ } from '../sim/index.js';
import { STAMPS } from '../content/lines.js';
import { h, setText, setStyle, money, clock, safeColor } from './dom.js';
import { badge, debFace, CLOCK } from './icons.js';

const STAMP_TILT = [-6, 4, -3, 5, -5, 2];

export function createReview(session, { onClose = () => {} } = {}) {
  const el = h('div', { class: 'pr-wrap hidden' });
  let report = null;
  let cdText = null, cdFill = null;

  function close() {
    if (!report) return;
    report = null;
    el.classList.add('hidden');
    el.replaceChildren();
    onClose();
  }

  function metric(label, value, max, cls, fmt = String) {
    const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0;
    return h('div', { class: 'pr-metric' },
      h('span', { class: 'pr-mlabel' }, label),
      h('span', { class: `pr-bar ${cls}` }, h('i', { style: { width: `${pct.toFixed(1)}%` } })),
      h('b', { class: 'pr-mval' }, fmt(value)));
  }

  /** { wave, pay, speed, took, rows, employee, deb, totals } */
  function show(m) {
    report = m;
    const rows = Array.isArray(m.rows) ? m.rows : [];
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const maxOf = (f) => Math.max(0, ...rows.map((r) => num(r[f])));
    const mBuilt = maxOf('built'), mStop = maxOf('stopped'), mSpent = maxOf('spent');
    const t = m.totals || {};

    const rowEls = rows.map((r, i) => {
      const mood = STAMPS.top.includes(r.stamp) ? 'happy' : STAMPS.bottom.includes(r.stamp) ? 'cross' : 'flat';
      return h('div', { class: `pr-row${r.pid === session.me ? ' me' : ''}` },
        h('div', { class: 'pr-badge', html: badge(r.color, mood) }),
        h('div', { class: 'pr-who' },
          h('b', null, String(r.name ?? '')),
          h('span', null, String(r.role ?? '')),
          h('i', { class: 'chip', style: { background: safeColor(r.color) } })),
        h('div', { class: 'pr-metrics' },
          metric('Things built', num(r.built), mBuilt, 'green'),
          metric('Shoppers stopped', num(r.stopped), mStop, 'blue'),
          metric('Cash wasted', num(r.spent), mSpent, 'red', money)),
        h('div', { class: 'pr-stamp-wrap' },
          h('div', { class: 'pr-stamp', style: { transform: `rotate(${STAMP_TILT[i % STAMP_TILT.length]}deg)` } }, String(r.stamp ?? ''))));
    });

    cdText = h('b');
    cdFill = h('i');
    const stat = (label, value, cls = '') => h('div', { class: `pr-stat ${cls}` }, h('small', null, label), h('b', null, value));

    el.replaceChildren(h('div', {
      class: 'pr-modal', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'pr-title',
    },
    h('header', { class: 'pr-head' },
      h('h2', { id: 'pr-title' }, `PERFORMANCE REVIEW - SALES EVENT ${num(m.wave)}`),
      h('button', { type: 'button', class: 'pr-x', 'aria-label': 'Close the review', onclick: close }, '×')),
    h('div', { class: 'pr-body' },
      h('p', { class: 'pr-note' }, 'Form HR-7B. Please do not fold, staple, or cry on this document.'),
      h('div', { class: 'pr-rows' }, rowEls),
      h('div', { class: 'pr-mid' },
        h('div', { class: 'pr-eotw' },
          h('small', null, 'EMPLOYEE OF THE WAVE'),
          h('div', { class: 'pr-eotw-body' }, h('span', { class: 'pr-frame', 'aria-hidden': 'true' }), h('b', null, String(m.employee ?? 'Nobody')))),
        h('div', { class: 'pr-deb' },
          h('small', null, 'DEB (HR) COMMENTS'),
          h('div', { class: 'pr-deb-body' },
            h('span', { class: 'pr-deb-face', html: debFace('smug') }),
            h('p', { class: 'pr-deb-text' }, String(m.deb ?? ''))))),
      h('div', { class: 'pr-totals' },
        stat('Refunds this event', String(num(t.escaped)), num(t.escaped) ? 'bad' : 'good'),
        stat('Shoppers stopped', String(num(t.stopped))),
        stat('Stock stolen', String(num(t.stolen)), num(t.stolen) ? 'bad' : ''),
        stat('Cash earned', money(num(t.earned))),
        // (0.4: what beating the event paid each player, and the speed bonus on top, with how long the
        // floor took to clear after the last shopper came in.)
        stat('Event pay', `+${money(num(m.pay))}`, 'good'),
        stat(`Speed bonus · ${clock(Math.round(num(m.took) * TICK_HZ))}`, `+${money(num(m.speed))}`, num(m.speed) ? 'good' : 'bad'),
        stat('Refunds so far', `${num(t.refunds)} / ${num(t.refundLimit) || TUNE.refundLimit}`)),
      h('div', { class: 'pr-foot' },
        h('button', { type: 'button', class: 'btn-clockin', onclick: close }, 'CLOCK BACK IN'),
        h('div', { class: 'pr-next' },
          h('span', { class: 'pr-clock', html: CLOCK }),
          h('span', null, 'Next sales event in ', cdText),
          h('span', { class: 'pr-next-bar' }, cdFill))))));
    el.classList.remove('hidden');
    update(session.state);
  }

  function update(s) {
    if (!report || !s) return;
    // The doors opened (or the game ended): the review has served its purpose.
    if (s.phase !== 'build' || s.wave > report.wave) { close(); return; }
    const full = TUNE.buildSecs * 30;
    if (s.phaseT < 0) {
      setText(cdText, 'whenever');
      setStyle(cdFill, 'width', '100%');
    } else {
      setText(cdText, clock(s.phaseT));
      setStyle(cdFill, 'width', `${Math.max(0, Math.min(100, (s.phaseT / full) * 100)).toFixed(1)}%`);
    }
  }

  return { el, show, update, close, get open() { return !!report; } };
}
