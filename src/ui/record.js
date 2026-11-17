// The endless-mode record: the furthest sales event an endless game has reached before the store
// closed, kept in this browser per difficulty (a Brutal run and an Easy one are not the same
// thing), with the store and the number of players it was done with. Each player's browser keeps
// its own. Storage may be missing or refused (private windows): then nothing is remembered and
// nothing breaks.
import { SETTINGS, MAP_DESIGNS, MAP_SIZES, isEndless } from '../sim/index.js';

const KEY = 'returns-dept.records';

function browserStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** Every record kept, by difficulty: { normal: { wave, design, size, players, at }, ... }. */
export function readRecords({ storage = browserStorage() } = {}) {
  let all = null;
  try { all = JSON.parse(storage?.getItem(KEY) || 'null'); } catch { return {}; }
  if (!all || typeof all !== 'object') return {};
  const out = {};
  for (const k of Object.keys(SETTINGS.difficulty)) {
    const r = all[k];
    if (r && Number.isFinite(r.wave) && r.wave > 0) out[k] = r;
  }
  return out;
}

/** "Megastore Food Court, 2 players" for a record (or what is known of it). */
export function recordWhere(r) {
  const design = MAP_DESIGNS[r.design], size = MAP_SIZES[r.size];
  const store = design && size ? `${size.name} ${design.name}` : 'the original store';
  return `${store}, ${r.players} player${r.players === 1 ? '' : 's'}`;
}

/**
 * Notes how far a lost endless game got, and says whether that is a record.
 * @param {Object} state the final state (phase 'lost'); anything else is ignored
 * @returns {null | { wave, isNew, best, difficulty }} best is the record now held (this run if new)
 */
export function noteRecord(state, { storage = browserStorage(), now = Date.now() } = {}) {
  if (!state || state.training || !isEndless(state) || state.phase !== 'lost') return null;
  const difficulty = SETTINGS.difficulty[state.difficulty] ? state.difficulty : SETTINGS.defaults.difficulty;
  const all = readRecords({ storage });
  const old = all[difficulty];
  const players = Math.max(1, state.players.filter((p) => p.side !== 'office').length);
  const run = { wave: state.wave, design: state.map?.design || '', size: state.map?.size || '', players, at: now };
  const isNew = !old || run.wave > old.wave;
  if (isNew) {
    all[difficulty] = run;
    try { storage?.setItem(KEY, JSON.stringify(all)); } catch { /* not remembered; no harm */ }
  }
  return { wave: run.wave, isNew, best: isNew ? run : old, difficulty };
}

/** One quiet line for the menu ("Endless record: sales event 23 on Normal, ..."), or '' if none. */
export function recordLine({ storage = browserStorage() } = {}) {
  const all = readRecords({ storage });
  const keys = Object.keys(all);
  if (!keys.length) return '';
  if (keys.length === 1) {
    const r = all[keys[0]];
    return `Endless record: sales event ${r.wave} on ${SETTINGS.difficulty[keys[0]].name} (${recordWhere(r)}).`;
  }
  return `Endless records: ${keys.map((k) => `${SETTINGS.difficulty[k].name} ${all[k].wave}`).join(' · ')}.`;
}
