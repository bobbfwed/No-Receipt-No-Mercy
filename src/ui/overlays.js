// Full-screen overlays: the end of the game, losing the host, and the in-game "how to play".
import { TUNE } from '../sim/index.js';
import { h, money, safeColor } from './dom.js';
import { debFace } from './icons.js';

/** The rules and controls, shared by the menu and the in-game help. */
export function howToPlay() {
  return h('div', { class: 'howto' },
    h('h3', null, 'The job'),
    h('p', null, `Shoppers come in the doors on the left and head for the tills on the right. Every one who gets there takes a refund out of the team's cash. ${TUNE.refundLimit} refunds and corporate shuts the store. Survive ${TUNE.waves} sales events.`),
    h('h3', null, 'Two halves'),
    h('ul', null,
      h('li', null, h('b', null, 'Factory makes cash. '), 'Unpackers spit out boxes, belts carry them, the Press and the Packer turn them into pricier goods, and a Shipping Chute sells whatever lands in it.'),
      h('li', null, h('b', null, 'Security makes them leave. '), 'Sprinklers, forklifts, wet floor signs and free samples wear down patience until shoppers storm out empty-handed.'),
      h('li', null, h('b', null, 'The factory is the maze. '), 'Nobody can walk through belts or machines, so lay your lines to make the walk long and painful. You cannot block the tills completely. Legal checked.'),
      h('li', null, h('b', null, 'Except dads. '), 'Dads arrive in a line, ignore free samples, and step straight over your belts. Only crates, machines and towers stop one. His patience runs out by itself, so waste his time: he ignores wet floor signs and slips on them.')),
    h('h3', null, 'Controls'),
    h('ul', { class: 'keys' },
      h('li', null, h('kbd', null, '1'), '–', h('kbd', null, '0'), ' pick a building, or click it in the bar'),
      h('li', null, h('kbd', null, 'Click'), ' build · ', h('kbd', null, 'Drag'), ' build a line; belts follow the drag'),
      h('li', null, h('kbd', null, 'R'), ' rotate what you are holding, or the building under the mouse when holding nothing'),
      h('li', null, h('kbd', null, 'Right-click'), ' or ', h('kbd', null, 'X'), ' remove (75% back) · ', h('kbd', null, 'Esc'), ' put it down'),
      h('li', null, h('b', null, 'OPEN THE DOORS'), ' starts the next sales event early, for the impatient')));
}

function overlay(cls, ...children) {
  return h('div', { class: `overlay ${cls}`, role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'ov-card' }, ...children));
}

/**
 * Game over, one way or the other.
 * @param {Object} s the final state
 * @param {string|null} debLine DEB's last words
 */
export function endScreen(s, debLine) {
  const won = s.phase === 'won';
  const stat = (label, value) => h('div', { class: 'end-stat' }, h('small', null, label), h('b', null, value));
  const players = s.players.map((p) => h('tr', null,
    h('td', null, h('i', { class: 'chip', style: { background: safeColor(p.color) } }), ` ${p.name}`),
    h('td', null, p.role),
    h('td', null, String(p.all.shipped)),
    h('td', null, String(p.all.stopped)),
    h('td', null, money(p.all.earned)),
    h('td', null, money(p.all.spent)),
    h('td', null, String(p.all.built))));
  const btn = h('button', { type: 'button', class: 'btn-big btn-yellow', onclick: () => location.reload() }, 'New game');
  const el = overlay(`end ${won ? 'won' : 'lost'}`,
    h('div', { class: 'end-stamp' }, won ? 'STORE SURVIVED' : 'STORE CLOSED'),
    h('p', { class: 'end-sub' }, won
      ? `All ${TUNE.waves} sales events. Nobody is more surprised than HR.`
      : `Refund limit reached in sales event ${s.wave}. Hand in your lanyards.`),
    h('div', { class: 'end-stats' },
      stat('Sales event reached', `${s.wave} / ${TUNE.waves}`),
      stat('Refunds', `${s.refunds} / ${TUNE.refundLimit}`),
      stat('Cash left', money(s.cash))),
    h('table', { class: 'end-table' },
      h('thead', null, h('tr', null, ['Employee', 'Role', 'Shipped', 'Stopped', 'Earned', 'Wasted', 'Built'].map((t) => h('th', null, t)))),
      h('tbody', null, players)),
    debLine ? h('div', { class: 'end-deb' }, h('span', { class: 'end-deb-face', html: debFace(won ? 'smug' : 'angry') }), h('p', null, debLine)) : null,
    btn);
  setTimeout(() => btn.focus(), 50);
  return el;
}

/** A client lost the host, or was turned away. */
export function closedScreen(why) {
  const full = why === 'full';
  const btn = h('button', {
    type: 'button', class: 'btn-big btn-yellow',
    onclick: () => { location.href = location.pathname; },
  }, 'Back to the menu');
  setTimeout(() => btn.focus(), 50);
  return overlay('closed',
    h('div', { class: 'end-stamp' }, full ? 'THE GAME IS FULL' : 'THE HOST HAS LEFT'),
    h('p', { class: 'end-sub' }, full
      ? 'Six people already work here. HR will not approve a seventh disappointment.'
      : 'The store closed when your host did. Probably rage-quit. Possibly his mum needed the computer.'),
    btn);
}

/** The rules, over the game, closable. */
export function helpScreen(onClose) {
  const btn = h('button', { type: 'button', class: 'btn-big btn-yellow', onclick: onClose }, 'Got it');
  setTimeout(() => btn.focus(), 50);
  const el = overlay('help', h('h2', null, 'HOW THIS WORKS'), howToPlay(), btn);
  el.addEventListener('click', (e) => { if (e.target === el) onClose(); });
  return el;
}
