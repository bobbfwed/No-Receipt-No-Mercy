// The lobby: what players see between joining a game and the game starting. Everyone can look
// at the store (it is drawn behind, whole), the host can change its design and size, and each
// player presses Ready. The game starts when every connected player is ready.
import { MAP_DESIGNS, MAP_SIZES, ZONES } from '../sim/index.js';
import { h, setText, setClass, safeColor } from './dom.js';
import { createSettings, labelSizes } from './settings.js';

/**
 * @param {Object} session
 * @param {Object} o
 * @param {Object} o.renderer  to show the whole store whenever it changes
 * @param {(name: string) => void} [o.playSound]
 */
const where = () => [h('span', { class: 'wide-only' }, 'on the right'), h('span', { class: 'tall-only' }, 'above')];

export function createLobby(session, { renderer, playSound = () => {} }) {
  const host = session.isHost;
  const pick = () => session.send({ c: 'map', design: designIn.value, size: sizeIn.value });
  const designIn = h('select', { id: 'lobby-design', disabled: !host, onchange: pick },
    Object.entries(MAP_DESIGNS).map(([k, d]) => h('option', { value: k }, d.name)));
  const sizeIn = h('select', { id: 'lobby-size', disabled: !host, onchange: pick },
    Object.entries(MAP_SIZES).map(([k, z]) => h('option', { value: k },
      `${z.name} (${z.w}x${z.h}): ${z.players ? `${z.players} player${z.players > 1 ? 's' : ''}` : 'original'}`)));
  const about = h('p', { class: 'lobby-about' });
  // Length, difficulty and starting cash: the host's to change, everyone's to see.
  const settings = createSettings({
    idPrefix: 'lobby', disabled: !host, value: session.state || {},
    onChange: (v) => session.send({ c: 'settings', ...v }),
  });
  let setSig = '';
  const fit = h('p', { class: 'lobby-fit' });
  const list = h('ul', { class: 'lobby-players' });
  const status = h('p', { class: 'lobby-status' });
  const readyBtn = h('button', {
    type: 'button', class: 'btn-big btn-ready',
    onclick: () => {
      const me = session.state.players[session.me];
      playSound('click');
      session.send({ c: 'ready', on: !(me && me.ready) });
    },
  });
  const legend = h('ul', { class: 'lobby-legend' }, Object.values(ZONES).map((z) => h('li', null,
    h('i', { style: { background: z.color } }), `${z.name}: ${z.kind === 'chute' ? 'Shipping Chutes' : `${z.kind[0].toUpperCase()}${z.kind.slice(1)}s`}`)));

  const el = h('section', { class: 'panel lobby hidden', 'aria-label': 'Before the game starts' },
    h('h3', null, 'BEFORE WE OPEN'),
    // The store is drawn beside the panel, or above it on a phone held upright (style.css).
    h('p', { class: 'lobby-lead' }, host
      ? ['Pick the store. Everyone can see it ', where(), ' as you change it. The game starts when every player is ready.']
      : ['The host picks the store; you can see it ', where(), '. The game starts when every player is ready.']),
    h('div', { class: 'lobby-pick' },
      h('label', { for: 'lobby-design' }, h('span', null, 'Design'), designIn),
      h('label', { for: 'lobby-size' }, h('span', null, 'Size'), sizeIn)),
    about, fit,
    h('h4', null, 'THE GAME'), settings.el,
    h('h4', null, 'PAINTED FLOOR'), legend,
    h('h4', null, 'PLAYERS'), list,
    readyBtn, status);

  let shown = false, mapSig = '', listSig = '';

  /** Once per frame. Returns true while the lobby is showing. */
  function update(s) {
    const on = s.phase === 'lobby';
    if (on !== shown) {
      shown = on;
      setClass(el, 'hidden', !on);
      // The floor is drawn beside the panel in the lobby and full width afterwards.
      el.dispatchEvent(new CustomEvent('lobbychange', { bubbles: true, detail: { on } }));
    }
    if (!on) return false;

    const ss = `${s.waves},${s.startCash},${s.difficulty}`;
    if (ss !== setSig) { setSig = ss; settings.set(s); }
    const sig = `${s.map.design},${s.map.size},${s.players.filter((p) => p.on).length}`;
    if (sig !== mapSig) {
      const mapChanged = sig.split(',').slice(0, 2).join() !== mapSig.split(',').slice(0, 2).join();
      mapSig = sig;
      designIn.value = s.map.design;
      sizeIn.value = s.map.size;
      labelSizes(sizeIn, s.map.design);
      const z = MAP_SIZES[s.map.size];
      setText(about, MAP_DESIGNS[s.map.design].desc);
      const here = s.players.filter((p) => p.on).length;
      const suits = z.players || 1;
      setText(fit, here > suits
        ? `This size suits ${suits} player${suits > 1 ? 's' : ''} and there are ${here} of you. It will be crowded.`
        : here < suits ? `This size suits ${suits} players; there ${here > 1 ? 'are' : 'is'} ${here} of you. Plenty of room, and a long way to walk.`
          : `This size suits ${suits} player${suits > 1 ? 's' : ''}: right for you.`);
      setClass(fit, 'warn', here > suits);
      if (mapChanged) { renderer.resize(); renderer.fit(); }
    }

    const ls = JSON.stringify([s.host, s.players.map((p) => [p.name, p.on, p.ready, p.color])]);
    if (ls !== listSig) {
      listSig = ls;
      list.replaceChildren(...s.players.filter((p) => p.on).map((p) => h('li', { class: p.ready ? 'is-ready' : '' },
        h('span', { class: 'chip', style: { background: safeColor(p.color) } }),
        h('span', { class: 'lp-name' }, p.name, p.id === session.me ? h('em', null, ' (you)') : null, p.id === (s.host | 0) ? h('em', null, ' host') : null),
        h('b', { class: 'lp-state' }, p.ready ? 'READY' : 'not ready'))));
      const me = s.players[session.me];
      const waiting = s.players.filter((p) => p.on && !p.ready).map((p) => p.name);
      setText(readyBtn, me && me.ready ? 'NOT READY AFTER ALL' : 'READY');
      setClass(readyBtn, 'is-ready', !!(me && me.ready));
      setText(status, waiting.length ? `Waiting for: ${waiting.join(', ')}` : 'Everyone is ready. Starting...');
    }
    return true;
  }

  return { el, update };
}
