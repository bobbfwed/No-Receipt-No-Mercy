// Full-screen overlays: the end of the game, losing the host, and the in-game "how to play".
import { TUNE, SHOPPERS, SUPERS, BUILD, SETTINGS, isEndless } from '../sim/index.js';
import { HOW, SHOPPER_HELP, SUPER_HELP, BOSS_HELP } from '../content/help.js';
import { bossFacts, fmt } from '../content/facts.js';
import { recordWhere } from './record.js';
import { h, money, safeColor } from './dom.js';
import { debFace } from './icons.js';

/** The rules and controls, shared by the menu and the in-game help. */
export function howToPlay() {
  return h('div', { class: 'howto' },
    h('h3', null, 'The job'),
    h('p', null, `Shoppers come in through the entrances (one per player, mostly on the left) and head for the tills on the right. Every one who gets there takes a refund. ${TUNE.refundLimit} refunds (${TUNE.refundPerPlayer} more per extra player) and corporate shuts the store. Survive every sales event (${TUNE.waves} unless the host changes it), or choose Endless and see how long you last.`),
    h('h3', null, 'Two halves'),
    h('ul', null,
      h('li', null, h('b', null, 'Factory makes cash. '), 'Unpackers spit out boxes, belts carry them, the Press and the Packer turn them into pricier goods, and a Shipping Chute sells whatever lands in it. Each of those four only goes on its own painted floor (Loading Bay, Press Shop, Gift Wrap, Shipping), so the belts between them are the factory.'),
      h('li', null, h('b', null, 'Security makes them leave. '), 'Sprinklers, forklifts and barcode lasers wear down patience until shoppers storm out empty-handed; wet floor signs, free samples and the TV salesman hold them in range for longer. Shoppers get more patient every sales event.'),
      h('li', null, h('b', null, 'The factory is the maze. '), 'Belts and machines are in the way of most shoppers, so lay your lines to make the walk long and painful. A few kinds of shopper get past things the rest cannot. You cannot block the tills completely. Legal checked.'),
      h('li', null, h('b', null, 'Your money is yours. '), 'Each player has his own cash and pays for what he builds. Everything the store earns, and every refund, is split evenly between you, whoever built what. You can hand a colleague money from the list of players.'),
      h('li', null, h('b', null, 'Everything can be upgraded. '), 'Click a building to see its upgrades: damage, speed, range and durability are bought separately, and each level costs more than the last. It gets more out of the floor space you have already built on.'),
      h('li', null, h('b', null, 'It gets worse. '), 'From sales event 6, super versions of every shopper turn up: bigger, with a gold crown, and a double refund. ',
        `Every ${ordinal(TUNE.bossEvery)} sales event a boss walks in as well, a little after the doors open: nothing slows him, his pep talks cheer up the shoppers around him, and if he reaches a till he counts as ${TUNE.bossRefunds} refunds.`),
      h('li', null, h('b', null, 'Except dads. '), 'Dads arrive in a line, ignore free samples, and step straight over your belts. Only crates, machines and towers stop one. His patience runs out by itself, so waste his time: he ignores wet floor signs and slips on them.')),
    h('h3', null, 'Controls'),
    // On a touch screen (only shown there): fingers instead of the mouse and keys.
    h('ul', { class: 'keys touch-only' },
      h('li', null, h('b', null, 'Tap a building'), ' in the bar to pick it up, tap it again to put it down'),
      h('li', null, h('b', null, 'Tap the floor'), ' to build · ', h('b', null, 'drag'), ' to build a line; belts follow your finger'),
      h('li', null, h('b', null, 'One finger'), ' with nothing held moves the view · ', h('b', null, 'two fingers'), ' move and zoom it, and never build'),
      h('li', null, h('b', null, '⟳'), ' rotates what you hold · ', h('b', null, '✋'), ' puts it down · ', h('b', null, '⤢'), ' whole map · ', h('b', null, '⌂'), ' your entrance'),
      h('li', null, h('b', null, 'Tap something you built'), ' with nothing held to upgrade, rotate or remove it'),
      h('li', null, h('b', null, 'AUTO-REBUILD'), ` (top bar, under ☰) puts back what gym bros wreck by itself, ${TUNE.autoRebuildSecs} seconds after each wreck · while anything of yours is wrecked, a big `, h('b', null, 'REBUILD'), ' button shows over the floor'),
      h('li', null, h('b', null, 'Hold a button'), ' in the bar to read what it does'),
      h('li', null, h('b', null, 'OPEN THE DOORS'), ' starts the next sales event early. It costs you nothing: the factory is paid at once for the time you skip')),
    h('ul', { class: 'keys key-only' },
      h('li', null, h('kbd', null, '1'), '–', h('kbd', null, '0'), ', ', h('kbd', null, '-'), ' and ', h('kbd', null, '='), ' pick a building, or click it in the bar'),
      h('li', null, h('kbd', null, 'Click'), ' build · ', h('kbd', null, 'Drag'), ' build a line; belts follow the drag'),
      h('li', null, h('kbd', null, 'R'), ' rotate what you are holding, or the building under the mouse when holding nothing'),
      h('li', null, h('kbd', null, 'Right-click'), ' or ', h('kbd', null, 'X'), ' remove (75% back) · ', h('kbd', null, 'Esc'), ' put it down'),
      h('li', null, h('kbd', null, 'Click'), ' a building with nothing held to see and buy its upgrades · ', h('kbd', null, 'U'), ' buys the first one for the building under the mouse'),
      h('li', null, h('kbd', null, 'B'), ' rebuild what gym bros wrecked, at half price · ', h('kbd', null, 'Shift'), '+', h('kbd', null, 'B'), ` auto-rebuild on or off (it waits ${TUNE.autoRebuildSecs} seconds after each wreck, then keeps trying) · the big REBUILD button over the floor does what B does`),
      h('li', null, h('kbd', null, 'W'), h('kbd', null, 'A'), h('kbd', null, 'S'), h('kbd', null, 'D'), ' or arrows move the view · ', h('kbd', null, 'Wheel'), ' zoom · ', h('kbd', null, 'F'), ' whole map · ', h('kbd', null, 'H'), ' your entrance · click the small map to jump'),
      h('li', null, h('kbd', null, 'Enter'), ' chat with the other players'),
      h('li', null, h('b', null, 'OPEN THE DOORS'), ' starts the next sales event early. It costs you nothing: the factory is paid at once for the time you skip')));
}

/** "5th", "3rd", "21st". */
const ordinal = (n) => ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n]
  || `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

/** Every kind of shopper: what makes it different and what works against it. Then the boss. */
function shopperGuide() {
  const b = bossFacts();
  return h('div', null,
    h('h3', null, 'Who comes through the door'),
    h('dl', { class: 'guide' }, Object.entries(SHOPPER_HELP).map(([k, v]) => [
      h('dt', null, SHOPPERS[k] ? SHOPPERS[k].name : k),
      h('dd', null, v.trick, ' ', h('em', null, `Beat it with: ${v.beat}`),
        SUPER_HELP[k] && SUPERS[k] ? h('span', { class: 'guide-super' }, h('b', null, `Super (${SUPERS[k].name}, from event ${SHOPPERS[k].sup.from}): `), SUPER_HELP[k]) : null),
    ]),
    h('dt', { class: 'guide-boss' }, `The boss (every ${ordinal(b.every)} sales event)`),
    h('dd', null, BOSS_HELP.trick, ' ',
      `Pep talk every ${fmt(b.pepEvery)} s: shoppers within ${fmt(b.pepRange)} tiles get ${Math.round(b.pepHeal * 100)}% of their patience back. `,
      `At a till he counts as ${b.refunds} refunds and takes $${b.refund} times his rank. `,
      h('em', null, `Beat him with: ${BOSS_HELP.beat}`),
      h('span', { class: 'guide-super' }, h('b', null, 'Ranks: '), b.titles.map((t) => `${t.title} (event ${t.from}${t.tier === b.titles.length ? ' on' : ''})`).join(', '), '.'))));
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
 * @param {Object} [o]
 * @param {() => boolean} [o.onLobby] host of a multiplayer game: the main button takes everyone
 *   back to the lobby with this, over the same connections, instead of reloading the page
 * @param {boolean} [o.waitForHost] a joined player: only the host can start another round, so
 *   say so; the main button just leaves for the menu
 */
export function endScreen(s, debLine, me = -1, { onEndless = null, record = null, onLobby = null, waitForHost = false } = {}) {
  const stored = s.phase === 'won';
  const endless = isEndless(s);
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
  let btn;
  if (onLobby) {
    btn = h('button', {
      type: 'button', class: 'btn-big btn-yellow',
      title: 'Everyone goes back to the lobby, still connected: same code, same link. Change the store or the settings and go again.',
      onclick: () => {
        btn.disabled = true;
        btn.textContent = 'Rounding them up...';
        if (onLobby() === false) { btn.disabled = false; btn.textContent = 'Back to the lobby'; }
      },
    }, 'Back to the lobby');
  } else {
    // A joined player leaves the way he always could; reloading drops him out of the room.
    btn = h('button', { type: 'button', class: 'btn-big btn-yellow', onclick: () => location.reload() }, waitForHost ? 'Quit to the menu' : 'New game');
  }
  const wait = waitForHost ? h('p', { class: 'end-sub end-wait' },
    'Another round is up to the host. Sit tight: when he drags everyone back to the lobby, you go too. Or quit, like you quit everything else.') : null;
  // A store player may carry a won game on as an endless one; the screen goes away for everyone
  // when the rules put the game back into a build phase (src/ui/game.js).
  const mine = s.players[me];
  const canGoOn = stored && !endless && !iAmOffice && onEndless && mine && mine.on !== false && mine.side !== 'office';
  const more = canGoOn ? h('button', {
    type: 'button', class: 'btn-big btn-orange btn-endless',
    title: 'Carry this game on with no last sales event. It ends when the refunds close the store.',
    onclick: () => {
      more.disabled = true;
      more.textContent = 'Reopening...';
      onEndless();
      // If it was refused (somebody else already did it, or the game moved on), allow another try.
      setTimeout(() => { if (more.isConnected) { more.disabled = false; more.textContent = 'Keep going (endless)'; } }, 3000);
    },
  }, 'Keep going (endless)') : null;
  let sub;
  if (iAmOffice) {
    sub = stored
      ? `You lose. The store lasted all ${s.waves} sales events with ${s.refunds} of ${s.refundLimit} refunds.`
      : endless ? `You win. Your shoppers closed the store in sales event ${s.wave} of an endless game.`
        : `You win. Your shoppers took the store to its refund limit in sales event ${s.wave}.`;
  } else {
    sub = stored
      ? `All ${s.waves} sales events. Nobody is more surprised than HR.`
      : endless ? `Endless mode ended in sales event ${s.wave}. It was always going to. Hand in your lanyards.`
        : `Refund limit reached in sales event ${s.wave}. Hand in your lanyards.`;
  }
  // An endless game's best run is remembered in this browser (src/ui/record.js).
  const rec = record ? h('div', { class: `end-record${record.isNew ? ' is-new' : ''}` },
    record.isNew
      ? [h('b', null, 'NEW RECORD'), ` Sales event ${record.wave} on ${SETTINGS.difficulty[record.difficulty].name}. Frame it. Nobody else will.`]
      : [h('b', null, 'NO RECORD'), ` Your best on ${SETTINGS.difficulty[record.difficulty].name} is still sales event ${record.best.wave} (${recordWhere(record.best)}).`]) : null;
  const el = overlay(`end ${won ? 'won' : 'lost'}${iAmOffice ? ' as-office' : ''}`,
    iAmOffice ? h('div', { class: 'end-role' }, won ? 'HEAD OFFICE WINS' : 'HEAD OFFICE LOSES') : null,
    h('div', { class: 'end-stamp' }, stored ? 'STORE SURVIVED' : 'STORE CLOSED'),
    h('p', { class: 'end-sub' }, sub),
    rec,
    office && !iAmOffice ? h('p', { class: 'end-office-note' }, h('span', { class: 'ho-tag' }, 'HEAD OFFICE'), ` ${office.name} ran the shoppers, and ${stored ? 'lost' : 'won'}.`) : null,
    h('div', { class: 'end-stats' },
      stat('Sales event reached', endless ? `${s.wave} (endless)` : `${s.wave} / ${s.waves}`),
      stat('Refunds', `${s.refunds} / ${s.refundLimit}`),
      stat(office ? "Store's cash left" : 'Cash left', money(Math.floor(cashLeft + 1e-6)))),
    h('table', { class: 'end-table' },
      h('thead', null, h('tr', null, ['Employee', 'Role', 'Shipped', 'Stopped', 'Earned', 'Wasted', 'Built'].map((t) => h('th', null, t)))),
      h('tbody', null, players)),
    debLine ? h('div', { class: 'end-deb' }, h('span', { class: 'end-deb-face', html: debFace(stored ? 'smug' : 'angry') }), h('p', null, debLine)) : null,
    wait,
    more ? h('div', { class: 'end-btns' }, btn, more) : btn);
  setTimeout(() => btn.focus(), 50);
  return el;
}

/** The host has gone and another player's browser is taking the game over. */
export function handoverScreen() {
  return overlay('closed handover',
    h('div', { class: 'end-stamp' }, 'THE HOST HAS LEFT'),
    h('p', { class: 'end-sub' }, 'Somebody else is taking over as host. Reconnecting; this takes a few seconds, sometimes up to a minute.'),
    h('p', { class: 'end-sub' }, 'Stay on this page.'));
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
      ? 'Seven people already work here. HR will not approve an eighth disappointment.'
      : 'The store closed when your host did. Probably rage-quit. Possibly his mum needed the computer.'),
    btn);
}

/** The rules, over the game, closable. */
export function helpScreen(onClose, onHandbook = null) {
  const btn = h('button', { type: 'button', class: 'btn-big btn-yellow', onclick: onClose }, 'Got it');
  setTimeout(() => btn.focus(), 50);
  // The close button sits at the top, so opening the help shows the start of it, not the end.
  const el = overlay('help', h('div', { class: 'help-head' }, h('h2', null, 'HOW THIS WORKS'),
    onHandbook ? h('button', { type: 'button', class: 'btn-small hb-open', onclick: onHandbook }, '📖 Employee Handbook: all the numbers') : null, btn),
    h('div', { class: 'help-cols' }, howToPlay(), h('div', { class: 'howto' }, buildingGuide()), h('div', { class: 'howto' }, shopperGuide())));
  el.addEventListener('click', (e) => { if (e.target === el) onClose(); });
  return el;
}
