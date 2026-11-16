// In-game chat: a short list of recent messages and a box to type in. Shown whenever more than
// one player is, or has been, in the game (including the lobby).
// Enter opens the box, Enter again sends, Esc closes it.
import { h, safeColor } from './dom.js';

const KEEP = 40; // messages kept in the list
const FADE_MS = 12000; // how long a message stays visible while the box is closed

/**
 * @param {Object} session
 * @param {Object} [o]
 * @param {(name: string) => void} [o.playSound]
 */
export function createChat(session, { playSound = () => {} } = {}) {
  const list = h('ul', { class: 'chat-list', 'aria-live': 'polite' });
  const input = h('input', {
    type: 'text', class: 'chat-input', maxlength: '200', autocomplete: 'off', spellcheck: 'true',
    placeholder: 'Say something. Enter sends.', 'aria-label': 'Chat message', enterkeyhint: 'send',
  });
  const open = h('button', { type: 'button', class: 'chat-open', title: 'Chat with the other players (Enter)' }, 'Chat');
  const form = h('form', { class: 'chat-form' }, input, h('button', { type: 'submit', class: 'btn-small' }, 'Send'));
  const el = h('section', { class: 'chat hidden', 'aria-label': 'Chat' }, list, form, open);
  let active = false;

  function setActive(on) {
    active = on;
    el.classList.toggle('is-open', on);
    if (on) { input.focus(); list.scrollTop = list.scrollHeight; } else input.blur();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text) session.chat(text);
    input.value = '';
    // On a phone keep the keyboard up for the next line; with a real keyboard, get out of the way.
    if (!matchMedia('(pointer: coarse)').matches) setActive(false);
  });
  open.addEventListener('click', () => setActive(!active));
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); setActive(false); } });
  input.addEventListener('blur', () => { if (!input.value) setActive(false); });

  // Enter anywhere in the game opens the box.
  const onKey = (e) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || el.classList.contains('hidden')) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
    e.preventDefault();
    setActive(true);
  };
  addEventListener('keydown', onKey);

  const off = session.on('chat', (m) => {
    const line = h('li', null,
      h('b', { style: { color: safeColor(m.color) } }, `${m.name}: `),
      h('span', null, String(m.text)));
    list.append(line);
    while (list.children.length > KEEP) list.firstChild.remove();
    list.scrollTop = list.scrollHeight;
    setTimeout(() => line.classList.add('old'), FADE_MS);
    if (m.pid !== session.me) playSound('click');
  });

  /** Once per frame: chat appears once there is somebody to talk to. */
  function update(s) {
    const useful = s.players.length > 1;
    if (useful === el.classList.contains('hidden')) el.classList.toggle('hidden', !useful);
  }

  function destroy() {
    off();
    removeEventListener('keydown', onKey);
  }

  return { el, update, destroy };
}
