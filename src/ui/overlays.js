// Full-screen overlays: the end of the game, losing the host, and the in-game "how to play".
import { TUNE, SHOPPERS, SUPERS, BUILD } from '../sim/index.js';
import { HOW, SHOPPER_HELP, SUPER_HELP } from '../content/help.js';
import { h, money, safeColor } from './dom.js';
import { debFace } from './icons.js';

/** The rules and controls, shared by the menu and the in-game help. */
export function howToPlay() {
  return h('div', { class: 'howto' },
    h('h3', null, 'The job'),
    h('p', null, `Shoppers come in through the entrances (one per player, mostly on the left) and head for the tills on the right. Every one who gets there takes a refund. ${TUNE.refundLimit} refunds (${TUNE.refundPerPlayer} more per extra player) and corporate shuts the store. Survive ${TUNE.waves} sales events.`),
    h('h3', null, 'Two halves'),
    h('ul', null,
      h('li', null, h('b', null, 'Factory makes cash. '), 'Unpackers spit out boxes, belts carry them, the Press and the Packer turn them into pricier goods, and a Shipping Chute sells whatever lands in it.'),
      h('li', null, h('b', null, 'Security makes them leave. '), 'Sprinklers, forklifts, wet floor signs and free samples wear down patience until shoppers storm out empty-handed.'),
      h('li', null, h('b', null, 'The factory is the maze. '), 'Nobody can walk through belts or machines, so lay your lines to make the walk long and painful. You cannot block the tills completely. Legal checked.'),
      h('li', null, h('b', null, 'Your money is yours. '), 'Each player has his own cash and pays for what he builds. Everything the store earns, and every refund, is split evenly between you, whoever built what. You can hand a colleague money from the list of players.'),
      h('li', null, h('b', null, 'Upgrade when the floor is full. '), 'Security can be upgraded to level 10. Each level costs nearly twice the last.'),
      h('li', null, h('b', null, 'It gets worse. '), 'From sales event 6, super versions of every shopper turn up: bigger, with a gold crown, and a double refund.'),
      h('li', null, h('b', null, 'Except dads. '), 'Dads arrive in a line, ignore free samples, and step straight over your belts. Only crates, machines and towers stop one. His patience runs out by itself, so waste his time: he ignores wet floor signs and slips on them.')),
    h('h3', null, 'Controls'),
    h('ul', { class: 'keys' },
      h('li', null, h('kbd', null, '1'), '–', h('kbd', null, '0'), ' pick a building, or click it in the bar'),
      h('li', null, h('kbd', null, 'Click'), ' build · ', h('kbd', null, 'Drag'), ' build a line; belts follow the drag'),
      h('li', null, h('kbd', null, 'R'), ' rotate what you are holding, or the building under the mouse when holding nothing'),
      h('li', null, h('kbd', null, 'Right-click'), ' or ', h('kbd', null, 'X'), ' remove (75% back) · ', h('kbd', null, 'Esc'), ' put it down'),
      h('li', null, h('kbd', null, 'U'), ' upgrade the security under the mouse, or pick the Upgrade tool · ', h('kbd', null, 'B'), ' rebuild what gym bros wrecked'),
      h('li', null, h('kbd', null, 'W'), h('kbd', null, 'A'), h('kbd', null, 'S'), h('kbd', null, 'D'), ' or arrows move the view · ', h('kbd', null, 'Wheel'), ' zoom · ', h('kbd', null, 'F'), ' whole map · ', h('kbd', null, 'H'), ' your entrance · click the small map to jump'),
      h('li', null, h('b', null, 'OPEN THE DOORS'), ' starts the next sales event early, for the impatient')));
}

/** Every kind of shopper: what makes it different and what works against it. */
function shopperGuide() {
  return h('div', null,
    h('h3', null, 'Who comes through the door'),
    h('dl', { class: 'guide' }, Object.entries(SHOPPER_HELP).map(([k, v]) => [
      h('dt', null, SHOPPERS[k] ? SHOPPERS[k].name : k),
      h('dd', null, v.trick, ' ', h('em', null, `Beat it with: ${v.beat}`),
        SUPER_HELP[k] && SUPERS[k] ? h('span', { class: 'guide-super' }, h('b', null, `Super (${SUPERS[k].name}, from event ${SHOPPERS[k].sup.from}): `), SUPER_HELP[k]) : null),
    ])));
}

/** Every building in one line each. Holding a building in the build bar shows the full version. */
function buildingGuide() {
  return h('div', null,
    h('h3', null, 'What the buildings do'),
    h('dl', { class: 'guide' }, Object.entries(HOW).map(([k, v]) => [
      h('dt', null, BUILD[k] ? `${BUILD[k].name} ($${BUILD[k].cost})` : k),
      h('dd', null, v.does),
    ])));
}

function overlay(cls, ...children) {
  return h('div', { class: `overlay ${cls}`, role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'ov-card' }, ...children));
}

/**
 * Game over, one way or the other.
 * @param {Object} s the final state
 * @param {string|null} debLine DEB's last words
 * @param {number} [me] this player's id. For the Head Office player the result is the other way
 *   round: he wins when the store closes.
 */
export function endScreen(s, debLine, me = -1) {
  const stored = s.phase === 'won';
  const boss = s.office ? s.players[s.office.pid] : null;
  const office = boss && boss.side === 'office' ? boss : null;
  const iAmOffice = !!office && office.id === me;
  // "won" is from this player's side: the store's result, flipped for Head Office.
  const won = iAmOffice ? !stored : stored;
  const stat = (label, value) => h('div', { class: 'end-stat' }, h('small', null, label), h('b', null, value));
  // Head Office stays in the table, marked, because the numbers are what he did before he left
  // the store; the store's cash leaves his out.
  let cashLeft = 0;
  for (const p of s.players) if (p !== office) cashLeft += p.cash;
  const players = s.players.map((p) => h('tr', { class: p === office ? 'end-office' : null },
    h('td', null, h('i', { class: 'chip', style: { background: safeColor(p.color) } }), ` ${p.name}`),
    h('td', null, p === office ? h('span', { class: 'ho-tag' }, 'HEAD OFFICE') : p.role),
    h('td', null, String(p.all.shipped)),
    h('td', null, String(p.all.stopped)),
    h('td', null, money(p.all.earned)),
    h('td', null, money(p.all.spent)),
    h('td', null, String(p.all.built))));
  const btn = h('button', { type: 'button', class: 'btn-big btn-yellow', onclick: () => location.reload() }, 'New game');
  let sub;
  if (iAmOffice) {
    sub = stored
      ? `You lose. The store lasted all ${TUNE.waves} sales events with ${s.refunds} of ${s.refundLimit} refunds.`
      : `You win. Your shoppers took the store to its refund limit in sales event ${s.wave}.`;
  } else {
    sub = stored
      ? `All ${TUNE.waves} sales events. Nobody is more surprised than HR.`
      : `Refund limit reached in sales event ${s.wave}. Hand in your lanyards.`;
  }
  const el = overlay(`end ${won ? 'won' : 'lost'}${iAmOffice ? ' as-office' : ''}`,
    iAmOffice ? h('div', { class: 'end-role' }, won ? 'HEAD OFFICE WINS' : 'HEAD OFFICE LOSES') : null,
    h('div', { class: 'end-stamp' }, stored ? 'STORE SURVIVED' : 'STORE CLOSED'),
    h('p', { class: 'end-sub' }, sub),
    office && !iAmOffice ? h('p', { class: 'end-office-note' }, h('span', { class: 'ho-tag' }, 'HEAD OFFICE'), ` ${office.name} ran the shoppers, and ${stored ? 'lost' : 'won'}.`) : null,
    h('div', { class: 'end-stats' },
      stat('Sales event reached', `${s.wave} / ${TUNE.waves}`),
      stat('Refunds', `${s.refunds} / ${s.refundLimit}`),
      stat(office ? "Store's cash left" : 'Cash left', money(Math.floor(cashLeft + 1e-6)))),
    h('table', { class: 'end-table' },
      h('thead', null, h('tr', null, ['Employee', 'Role', 'Shipped', 'Stopped', 'Earned', 'Wasted', 'Built'].map((t) => h('th', null, t)))),
      h('tbody', null, players)),
    debLine ? h('div', { class: 'end-deb' }, h('span', { class: 'end-deb-face', html: debFace(stored ? 'smug' : 'angry') }), h('p', null, debLine)) : null,
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
  // The close button sits at the top, so opening the help shows the start of it, not the end.
  const el = overlay('help', h('div', { class: 'help-head' }, h('h2', null, 'HOW THIS WORKS'), btn),
    h('div', { class: 'help-cols' }, howToPlay(), h('div', { class: 'howto' }, buildingGuide()), h('div', { class: 'howto' }, shopperGuide())));
  el.addEventListener('click', (e) => { if (e.target === el) onClose(); });
  return el;
}
