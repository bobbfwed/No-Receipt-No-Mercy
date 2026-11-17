// Saving a game so it can be carried on another day. Only the host's browser has the real game,
// so that is where it is kept: one save, in the browser's own storage, written every so often
// while a game is under way and when the page is closed. Whoever is host at the time has the
// save (after a host hand-over, that is the new host).
//
// Resuming makes that browser the host of the saved game again. Everyone else in it counts as
// away until he joins with the new room code; he gets his place and his money back by name.
import { MAP_DESIGNS, MAP_SIZES } from '../sim/index.js';
import { versionText } from '../version.js';

const KEY = 'returns-dept.save';
const EVERY_MS = 15000;

/** The browser's storage, or null where it is not allowed (private windows, some embedded pages). */
function browserStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/**
 * Whether a game state is worth keeping: a real game (not training, not still in the lobby),
 * not finished, and with something done in it.
 */
export function worthSaving(state) {
  if (!state || state.training) return false;
  if (state.phase !== 'build' && state.phase !== 'wave') return false;
  return state.wave > 0 || state.grid.some(Boolean);
}

/**
 * Writes the save.
 * @param {Object} state the host's game state
 * @param {Object} [o]
 * @param {'solo'|'online'|'local'} [o.kind] how the game was being played
 * @param {Object} [o.storage] somewhere to keep it (the browser's storage unless a test gives another)
 * @returns {boolean} true if it was written
 */
export function writeSave(state, { kind = 'solo', storage = browserStorage() } = {}) {
  if (!storage || !worthSaving(state)) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ v: 1, at: Date.now(), release: versionText(), kind, state }));
    return true;
  } catch {
    return false; // storage full or refused: playing matters more than saving
  }
}

/** Throws the save away (the game ended, or the player asked). */
export function clearSave({ storage = browserStorage() } = {}) {
  try { storage?.removeItem(KEY); } catch { /* nothing to clear */ }
}

/**
 * Reads the save, if there is a usable one.
 * @returns {null | {at: number, release: string, kind: string, state: Object, wave: number,
 *   waves: number, players: string[], host: string, store: string}} `store` and the rest are
 *   for showing the player what he would be resuming
 */
export function readSave({ storage = browserStorage() } = {}) {
  let save = null;
  try { save = JSON.parse(storage?.getItem(KEY) || 'null'); } catch { return null; }
  const s = save && save.state;
  // A save from a different version of the rules may not load properly: only trust what looks right.
  if (!save || save.v !== 1 || !s || s.v !== 3 || !worthSaving(s)) return null;
  if (!Array.isArray(s.players) || !s.players.length || !Array.isArray(s.grid) || s.grid.length !== s.w * s.h) return null;
  const host = s.players[s.host | 0] || s.players[0];
  const design = MAP_DESIGNS[s.map?.design], size = MAP_SIZES[s.map?.size];
  return {
    at: save.at, release: String(save.release || ''), kind: save.kind || 'solo', state: s,
    wave: s.phase === 'wave' ? s.wave : s.wave + 1, waves: s.waves,
    players: s.players.map((p) => p.name), host: host.name,
    store: design && size ? `${design.name}, ${size.name}` : 'the original store',
  };
}

/**
 * Keeps a host's game saved while it runs: every few seconds, when a wave ends, and when the
 * page is closed. Stops saving, and throws the save away, once the game is won or lost.
 * @param {Object} session a HostSession
 * @param {Object} [o]
 * @param {'solo'|'online'|'local'} [o.kind]
 * @returns {() => void} call it to stop
 */
export function keepSaved(session, { kind = 'solo' } = {}) {
  if (!session.isHost) return () => {};
  let done = false;
  const save = () => {
    const s = session.state;
    if (done || !s) return;
    if (s.phase === 'won' || s.phase === 'lost') { done = true; clearSave(); return; }
    writeSave(s, { kind });
  };
  const timer = setInterval(save, EVERY_MS);
  const offFx = session.on('fx', (events) => { if (events.some((e) => e.e === 'waveEnd' || e.e === 'won' || e.e === 'lost')) save(); });
  addEventListener('pagehide', save);
  return () => {
    clearInterval(timer);
    offFx();
    removeEventListener('pagehide', save);
  };
}

/** "today 21:14", "yesterday 09:05" or "12 Nov 21:14", for showing when a save was made. */
export function whenSaved(at, now = Date.now()) {
  const d = new Date(at), n = new Date(now);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days === 0) return `today ${time}`;
  if (days === 1) return `yesterday ${time}`;
  return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${time}`;
}
