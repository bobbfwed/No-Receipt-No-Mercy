// Holidays (0.3): the calendar, the game state's holiday, and DEB's holiday lines.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { holidayOn, holidayDate, holidayFor, easterSunday, outfitText, HOLIDAY_INFO, HOLIDAY_WINDOW } from '../src/content/holidays.js';
import { createDirector, TALK } from '../src/content/director.js';
import {
  LINES, INTRO, SUPER_INTRO, ESCAPE_REVIEWS, LEFT_REVIEWS, STAMPS, EMPLOYEES_OF_THE_WAVE, NOPE, FRIENDS, HOLIDAY_LINES,
  fill, textOf, weightOf, placeholders,
} from '../src/content/lines.js';
import { HostSession, ClientSession } from '../src/net/session.js';
import { memoryPair } from '../src/net/transports.js';
import { createGame, addPlayer, step, applyCommand, HOLIDAYS, TICK_HZ, bossTier, bossTitle } from '../src/sim/index.js';

/** A local date (the host's own computer's calendar). */
const day = (y, m, d) => new Date(y, m - 1, d);
/** A date some days from a [year, month, day]. */
const plus = ([y, m, d], n) => new Date(y, m - 1, d + n);

/** A seeded random number generator, so every run sees the same numbers. */
function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const says = (out) => out.filter((m) => m.t === 'say').map((m) => m.text);

// ---------------------------------------------------------------------------------------------
// The calendar

test('the nine holidays are the same everywhere: the rules\' list, the calendar and the lines', () => {
  assert.deepEqual(HOLIDAYS, ['xmas', 'thanksgiving', 'valentine', 'july4', 'halloween', 'stpat', 'easter', 'newyear', 'mardigras']);
  assert.deepEqual(Object.keys(HOLIDAY_INFO), HOLIDAYS);
  assert.deepEqual(Object.keys(HOLIDAY_LINES), HOLIDAYS);
  for (const k of HOLIDAYS) assert.match(outfitText(k), /^dressed (as|for) /, k);
  assert.equal(outfitText(undefined), '');
  assert.equal(outfitText('constructor'), '');
});

test('today, 24 November 2026, is Thanksgiving week', () => {
  assert.equal(holidayOn(day(2026, 11, 24)), 'thanksgiving');
  assert.deepEqual(holidayDate('thanksgiving', 2026), [2026, 11, 26]);
});

test('Easter and Mardi Gras fall on the right days, whatever the year', () => {
  const easter = {
    2008: [3, 23], 2011: [4, 24], 2019: [4, 21], 2024: [3, 31], 2025: [4, 20], 2026: [4, 5], 2027: [3, 28],
    2028: [4, 16], 2038: [4, 25], 2285: [3, 22],
  };
  for (const [y, md] of Object.entries(easter)) assert.deepEqual(easterSunday(Number(y)), md, `Easter ${y}`);
  const mardi = { 2024: [2, 13], 2025: [3, 4], 2026: [2, 17], 2027: [2, 9], 2028: [2, 29], 2038: [3, 9] };
  for (const [y, [m, d]] of Object.entries(mardi)) assert.deepEqual(holidayDate('mardigras', Number(y)), [Number(y), m, d], `Mardi Gras ${y}`);
  // Mardi Gras is always a Tuesday, Easter a Sunday.
  for (let y = 2000; y <= 2100; y++) {
    const [my, mm, md] = holidayDate('mardigras', y);
    assert.equal(new Date(my, mm - 1, md).getDay(), 2, `Mardi Gras ${y} is a Tuesday`);
    const [m, d] = easterSunday(y);
    assert.equal(new Date(y, m - 1, d).getDay(), 0, `Easter ${y} is a Sunday`);
  }
});

test('Thanksgiving is the fourth Thursday of November', () => {
  const want = { 2024: 28, 2025: 27, 2026: 26, 2027: 25, 2028: 23, 2029: 22, 2030: 28 };
  for (const [y, d] of Object.entries(want)) assert.deepEqual(holidayDate('thanksgiving', Number(y)), [Number(y), 11, d]);
  for (let y = 2000; y <= 2100; y++) {
    const [, m, d] = holidayDate('thanksgiving', y);
    assert.equal(new Date(y, m - 1, d).getDay(), 4, `${y} is a Thursday`);
    assert.ok(d >= 22 && d <= 28, `${y}: the 4th Thursday is the 22nd to the 28th, not ${d}`);
  }
});

test('each holiday is on from a week before it to the day after it, in 2026 and 2027', () => {
  assert.deepEqual(HOLIDAY_WINDOW, { before: 7, after: 1 });
  for (const y of [2026, 2027]) {
    for (const key of HOLIDAYS) {
      const date = holidayDate(key, y);
      assert.equal(holidayOn(plus(date, 0)), key, `${key} ${y}: the day`);
      assert.equal(holidayOn(plus(date, 1)), key, `${key} ${y}: the day after`);
      for (let n = -7; n <= 1; n++) {
        const got = holidayOn(plus(date, n));
        assert.ok(got, `${key} ${y}, ${n} days: some holiday`);
        // Another holiday can win part of the window only by being nearer (Valentine's and Mardi Gras).
        if (got !== key) {
          const at = plus(date, n);
          const today = Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
          // Days from that date to the winner's day, in the years around it.
          const its = [-1, 0, 1].map((dy) => holidayDate(got, at.getFullYear() + dy)).map(([a, b, c]) => Math.round((Date.UTC(a, b - 1, c) - today) / 864e5));
          const mine = -n;
          assert.ok(its.some((g) => Math.abs(g) < Math.abs(mine) || (Math.abs(g) === Math.abs(mine) && g > 0)), `${key} ${y}, ${n} days: ${got} won`);
        }
      }
      assert.notEqual(holidayOn(plus(date, -8)), key, `${key} ${y}: eight days before`);
      assert.notEqual(holidayOn(plus(date, 2)), key, `${key} ${y}: two days after`);
    }
  }
  // Ordinary days have none.
  for (const [y, m, d] of [[2026, 6, 1], [2026, 9, 15], [2027, 5, 20], [2026, 11, 18], [2026, 12, 17], [2027, 1, 3], [2026, 3, 19]]) {
    assert.equal(holidayOn(day(y, m, d)), null, `${y}-${m}-${d}`);
  }
});

test('Christmas and New Year\'s overlap: the nearer day wins, and on a tie the one still to come', () => {
  assert.equal(holidayOn(day(2026, 12, 18)), 'xmas', 'a week before Christmas');
  assert.equal(holidayOn(day(2026, 12, 24)), 'xmas');
  assert.equal(holidayOn(day(2026, 12, 25)), 'xmas', 'Christmas Day (New Year\'s is 7 days off)');
  assert.equal(holidayOn(day(2026, 12, 26)), 'xmas', 'Boxing Day (1 day after, 6 before)');
  assert.equal(holidayOn(day(2026, 12, 27)), 'newyear', 'two days after Christmas is out of its window');
  assert.equal(holidayOn(day(2026, 12, 31)), 'newyear', "New Year's Eve");
  assert.equal(holidayOn(day(2027, 1, 1)), 'newyear');
  assert.equal(holidayOn(day(2027, 1, 2)), 'newyear', 'the day after, in the new year');
  assert.equal(holidayOn(day(2027, 1, 3)), null);
  // Valentine's and Mardi Gras 2026 (14th and 17th of February): a tie on the 15th/16th goes by distance.
  assert.equal(holidayOn(day(2026, 2, 14)), 'valentine');
  assert.equal(holidayOn(day(2026, 2, 15)), 'valentine', '1 day after Valentine\'s, 2 before Mardi Gras');
  assert.equal(holidayOn(day(2026, 2, 16)), 'mardigras');
  assert.equal(holidayOn(day(2026, 2, 10)), 'valentine', '4 days before Valentine\'s, 7 before Mardi Gras');
  // A real tie: in 2021 Mardi Gras was on the 16th, so the 15th was a day after Valentine's and a
  // day before Mardi Gras. The one still to come wins.
  assert.deepEqual(holidayDate('mardigras', 2021), [2021, 2, 16]);
  assert.equal(holidayOn(day(2021, 2, 15)), 'mardigras');
  assert.equal(holidayOn(day(2021, 2, 14)), 'valentine');
  // Nonsense in, nothing out.
  assert.equal(holidayOn(new Date(NaN)), null);
  assert.equal(holidayOn('2026-12-25'), null);
});

test('the page address can force a holiday, or none, for testing', () => {
  assert.equal(holidayFor('xmas', day(2026, 6, 1)), 'xmas');
  assert.equal(holidayFor('none', day(2026, 11, 24)), null);
  assert.equal(holidayFor(null, day(2026, 11, 24)), 'thanksgiving');
  assert.equal(holidayFor('bogus', day(2026, 11, 24)), 'thanksgiving', 'an unknown one is ignored');
  assert.equal(holidayFor('__proto__', day(2026, 6, 1)), null);
});

// ---------------------------------------------------------------------------------------------
// The game state

test('createGame keeps a known holiday and drops anything else; with none the state has no field', () => {
  assert.equal(createGame({ holiday: 'easter' }).holiday, 'easter');
  for (const h of ['bogus', '', null, undefined, 7, 'toString', { k: 'xmas' }]) {
    const s = createGame({ holiday: h });
    assert.ok(!Object.hasOwn(s, 'holiday'), `${JSON.stringify(h)}`);
  }
  assert.ok(!Object.hasOwn(createGame(), 'holiday'), 'an old save, or a test game, has none');
  // JSON-safe: a saved and reloaded game keeps it.
  assert.equal(JSON.parse(JSON.stringify(createGame({ holiday: 'halloween', lobby: true }))).holiday, 'halloween');
});

test('the holiday changes no rule: the same game plays out the same with and without it', () => {
  const play = (holiday) => {
    const s = createGame({ seed: 9, holiday });
    addPlayer(s, 'Dave');
    s.players[0].cash = 5000;
    applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 12, y: 6 });
    applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 16, y: 9 });
    // Through five sales events, so the boss of event 5 walks in too.
    for (let w = 0; w < 5; w++) {
      if (s.phase === 'build') applyCommand(s, 0, { c: 'start' });
      for (let i = 0; i < 200 * TICK_HZ && s.phase === 'wave'; i++) step(s);
    }
    return s;
  };
  const plain = play(null), dressed = play('xmas');
  assert.equal(dressed.holiday, 'xmas');
  assert.ok(plain.wave >= 5 || plain.phase === 'lost', `reached event ${plain.wave}`);
  delete dressed.holiday;
  assert.deepEqual(dressed, plain);
});

test('the host passes the holiday to the game; players joining get it; back to the lobby takes today\'s', () => {
  const host = new HostSession({ name: 'Dave', seed: 3, holiday: 'stpat', director: createDirector(seeded(1)) });
  assert.equal(host.state.holiday, 'stpat');
  const [a, b] = memoryPair();
  host.accept(a);
  const client = new ClientSession(b, 'Steve');
  client.update(0);
  assert.equal(client.state.holiday, 'stpat', 'a joined player sees the same outfit');
  // A game carried on from a save keeps its own.
  const resumed = new HostSession({ name: 'Dave', state: JSON.parse(JSON.stringify(host.state)), resume: true, holiday: 'xmas' });
  assert.equal(resumed.state.holiday, 'stpat');
  // Back to the lobby once the game is over: the holiday main.js works out for today...
  host.state.phase = 'lost';
  assert.ok(host.backToLobby({ seed: 4, holiday: 'easter' }));
  assert.equal(host.state.holiday, 'easter');
  client.update(0);
  assert.equal(client.state.holiday, 'easter');
  // ...or none, if the holiday is over.
  host.state.phase = 'won';
  assert.ok(host.backToLobby({ seed: 5, holiday: null }));
  assert.ok(!Object.hasOwn(host.state, 'holiday'));
  // Left out, the old game's.
  const other = new HostSession({ name: 'Kev', holiday: 'july4' });
  other.state.phase = 'lost';
  other.backToLobby({ seed: 6 });
  assert.equal(other.state.holiday, 'july4');
});

// ---------------------------------------------------------------------------------------------
// The lines

/** Every line in lines.js that is not a holiday line, by text. */
function otherLines() {
  const all = [];
  const walk = (v) => {
    if (Array.isArray(v)) { for (const l of v) all.push(typeof l === 'string' || !Array.isArray(l) ? textOf(l) : l[1]); return; }
    if (typeof v === 'string') { all.push(v); return; }
    if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  for (const bank of [LINES, INTRO, SUPER_INTRO, ESCAPE_REVIEWS, LEFT_REVIEWS, STAMPS, EMPLOYEES_OF_THE_WAVE, NOPE, FRIENDS]) walk(bank);
  return new Set(all);
}

const PARTS = { in: 'pk', out: 'pkn', through: 'pknm', pause: 'p' };

test('every holiday has plenty of lines, each in the right shape, and none repeats anywhere', () => {
  const others = otherLines();
  const seen = new Map();
  for (const key of HOLIDAYS) {
    const banks = HOLIDAY_LINES[key];
    assert.deepEqual(Object.keys(banks), Object.keys(PARTS), key);
    const total = Object.values(banks).reduce((n, b) => n + b.length, 0);
    assert.ok(total >= 12, `${key} has ${total} lines`);
    assert.ok(banks.in.length >= 4 && banks.out.length >= 3 && banks.through.length >= 3 && banks.pause.length >= 6, key);
    for (const [part, bank] of Object.entries(banks)) {
      const ws = bank.map(weightOf);
      assert.ok(ws.some((w) => w === 1) && ws.some((w) => w < 1), `${key}.${part}: common and less common lines`);
      for (const line of bank) {
        const text = textOf(line);
        assert.equal(typeof text, 'string');
        assert.ok(text.trim() === text && text.length > 0, `${key}.${part}: "${text}"`);
        if (seen.has(text)) assert.fail(`"${text}" is in both ${seen.get(text)} and ${key}.${part}`);
        assert.ok(!others.has(text), `"${text}" is also an ordinary line`);
        seen.set(text, `${key}.${part}`);
        for (const k of placeholders(text)) assert.ok(PARTS[part].includes(k), `${key}.${part}: {${k}} is never filled in "${text}"`);
        // The boss's lines stand in for the usual ones, which always say which boss it is.
        if (part !== 'pause') assert.match(text, /\b[Tt]he \{k\}/, `${key}.${part} names him: "${text}"`);
        const filled = fill(text, { p: 'Bartholomew', n: 12, m: 3000, k: 'Vice President of Returns' });
        assert.ok(!/\{\w\}/.test(filled), filled);
        assert.ok(filled.length <= 200, `${key}.${part} is ${filled.length} characters: "${filled}"`);
        const w = weightOf(line);
        assert.ok(w > 0 && w <= 1, `${key}.${part}: weight ${w}`);
      }
    }
    // The bounty, refunds and cash can be missing from an event: some lines need none of them.
    assert.ok(banks.out.some((l) => !placeholders(textOf(l)).includes('n')), `${key}.out`);
    assert.ok(banks.through.some((l) => !placeholders(textOf(l)).some((k) => k === 'n' || k === 'm')), `${key}.through`);
    const rare = Object.values(banks).flat().filter((l) => weightOf(l) <= 0.15);
    assert.ok(rare.length >= 2, `${key} has ${rare.length} rare lines`);
  }
});

// ---------------------------------------------------------------------------------------------
// The director

/** A game with a holiday (or none) and two players. */
function game(holiday) {
  const state = createGame({ seed: 1, holiday });
  addPlayer(state, 'Dave');
  addPlayer(state, 'Steve');
  return state;
}

/** Every line of a holiday's banks, filled in every way this test fills them. */
function holidayTexts(keys, parts = Object.keys(PARTS)) {
  const out = new Set();
  for (const key of keys) {
    for (const part of parts) {
      for (const l of HOLIDAY_LINES[key][part]) {
        for (const p of ['Dave', 'Steve']) {
          for (let tier = 1; tier <= 4; tier++) {
            const k = bossTitle(tier).replace(/^the\s+/i, '');
            for (const [n, m] of [[600, undefined], [2, 750], [5, 300], [3, 300], [undefined, undefined]]) out.add(fill(textOf(l), { p, k, n, m }));
          }
        }
      }
    }
  }
  return out;
}

/**
 * Plays a long game through the director: every event's opening, the boss's visits (walking in,
 * a pep talk, storming off or getting through) and every build pause second by second.
 * Returns, per build pause, the lines said in it, and everything said.
 */
function playLong(director, state, events = 40) {
  const pauses = [];
  const all = [];
  for (let w = 1; w <= events; w++) {
    // The build pause before event w (the first one is 90 seconds, then 45).
    state.phase = 'build';
    state.wave = w - 1;
    const len = w === 1 ? 90 : 45;
    const mine = [];
    for (let t = len; t > 0; t--) {
      state.phaseT = t * TICK_HZ;
      state.tick += TICK_HZ;
      mine.push(...says(director.idle(state)));
    }
    pauses.push(mine);
    all.push(...mine);
    state.phase = 'wave';
    state.wave = w;
    state.tick += 5 * TICK_HZ;
    all.push(...says(director.handle([{ e: 'waveStart', wave: w, kinds: [], supers: [], dads: 2, boss: bossTier(w) }], state)));
    if (bossTier(w)) {
      const tier = bossTier(w);
      state.tick += 12 * TICK_HZ;
      all.push(...says(director.handle([{ e: 'bossIn', tier }], state)));
      state.tick += 20 * TICK_HZ;
      const end = w % 10 === 0 ? { e: 'escape', k: 'boss', tier, n: 2, refund: 750 } : { e: 'bossOut', tier, bounty: 600 };
      state.refundLimit = 1000;
      all.push(...says(director.handle([end], state)));
    }
    state.tick += 60 * TICK_HZ;
    director.handle([{ e: 'waveEnd', wave: w, bonus: 100 }], state);
  }
  return { pauses, all };
}

test('with no holiday DEB says nothing about one', () => {
  const every = holidayTexts(HOLIDAYS);
  for (const seed of [1, 2, 3]) {
    const { all } = playLong(createDirector(seeded(seed)), game(null));
    assert.ok(all.length > 20, `${all.length} lines`);
    assert.deepEqual(all.filter((t) => every.has(t)), [], `seed ${seed}`);
  }
});

test('in a holiday game the holiday lines come from that holiday only, and the boss is always announced by his title', () => {
  for (const key of HOLIDAYS) {
    const mine = holidayTexts([key]);
    const theirs = holidayTexts(HOLIDAYS.filter((k) => k !== key));
    let said = 0;
    for (const seed of [1, 2]) {
      const { all } = playLong(createDirector(seeded(seed * 31 + key.length)), game(key), 20);
      assert.deepEqual(all.filter((t) => theirs.has(t)), [], `${key}: another holiday's line`);
      said += all.filter((t) => mine.has(t)).length;
    }
    assert.ok(said >= 6, `${key}: ${said} holiday lines in two 20-event games`);
  }
});

test('the boss\'s holiday lines: always the first time, then a share of the time; the usual lines the rest', () => {
  const walkIn = (director, state, tier) => {
    state.tick += 1000 * TICK_HZ;
    return says(director.handle([{ e: 'bossIn', tier }], state));
  };
  const theIn = holidayTexts(['xmas'], ['in']);
  const theOut = holidayTexts(['xmas'], ['out']);
  const theThrough = holidayTexts(['xmas'], ['through']);
  // A random number that would refuse any share: the first of each is still a holiday line.
  const r = { v: 0.9999 };
  const director = createDirector(() => r.v);
  const state = game('xmas');
  const first = walkIn(director, state, 1);
  assert.equal(first.length, 2, 'his line, then his trick explained');
  assert.ok(theIn.has(first[0]), first[0]);
  assert.ok(first[0].includes('Regional Manager'));
  state.tick += 1000 * TICK_HZ;
  assert.ok(theOut.has(says(director.handle([{ e: 'bossOut', tier: 1, bounty: 600 }], state))[0]));
  state.tick += 1000 * TICK_HZ;
  state.refundLimit = 1000;
  assert.ok(theThrough.has(says(director.handle([{ e: 'escape', k: 'boss', tier: 2, n: 2, refund: 700 }], state))[0]));
  // After that, a random number over the share gets the usual line, still naming him...
  const next = walkIn(director, state, 2);
  assert.equal(next.length, 1);
  assert.ok(!theIn.has(next[0]) && next[0].includes('Area Director'), next[0]);
  // ...and one under it, a holiday line.
  r.v = TALK.holidayBoss - 1e-9;
  assert.ok(theIn.has(walkIn(director, state, 3)[0]));
  // The bounty may be missing; something is still said.
  const fresh = createDirector(() => 0.5);
  const st = game('mardigras');
  st.tick = 1e6;
  const out = says(fresh.handle([{ e: 'bossOut', tier: 4 }], st));
  assert.equal(out.length, 1);
  assert.ok(!/\{\w\}|undefined/.test(out[0]), out[0]);
});

test('holiday jokes in the build pauses fade over a game, and used lines rarely come back', () => {
  const PAUSES = 40;
  const per = new Array(PAUSES).fill(0);
  let lines = 0, repeats = 0, firstPause = 0;
  const seeds = 60;
  for (let seed = 1; seed <= seeds; seed++) {
    const key = HOLIDAYS[seed % HOLIDAYS.length];
    const pauseTexts = holidayTexts([key], ['pause']);
    const { pauses } = playLong(createDirector(seeded(seed)), game(key), PAUSES);
    const heard = [];
    pauses.forEach((said, i) => {
      const hol = said.filter((t) => pauseTexts.has(t));
      assert.ok(hol.length <= 1, 'one holiday joke a pause at most');
      per[i] += hol.length;
      heard.push(...hol);
    });
    if (pauses[0].some((t) => pauseTexts.has(t))) firstPause++;
    lines += heard.length;
    repeats += heard.length - new Set(heard).size;
  }
  const sum = (a, b) => per.slice(a, b).reduce((x, y) => x + y, 0);
  assert.ok(firstPause >= seeds * 0.85, `the first pause had one in ${firstPause} of ${seeds} games`);
  assert.ok(sum(0, 10) > 3 * sum(30, 40), `${sum(0, 10)} in the first ten pauses, ${sum(30, 40)} in the last ten`);
  assert.ok(sum(30, 40) > 0, 'but they never stop altogether');
  assert.ok(lines / seeds >= 2.5 && lines / seeds <= 8, `${(lines / seeds).toFixed(1)} a game`);
  assert.ok(repeats <= lines * 0.1, `${repeats} repeats in ${lines}`);
});

test('the holiday joke keeps clear of the end of the pause and of the training shift', () => {
  // Only once the pause has run TALK.holidayDelay seconds, and never with TALK.holidayLast or less left.
  const director = createDirector(() => 0);
  const state = game('xmas');
  state.phase = 'build';
  state.wave = 3;
  state.tick = 1e6;
  state.phaseT = 45 * TICK_HZ;
  assert.deepEqual(says(director.idle(state)), [], 'not the moment the pause starts');
  state.tick += (TALK.holidayDelay - 1) * TICK_HZ;
  state.phaseT -= (TALK.holidayDelay - 1) * TICK_HZ;
  assert.deepEqual(says(director.idle(state)), []);
  state.tick += 1 * TICK_HZ;
  state.phaseT -= 1 * TICK_HZ;
  const said = says(director.idle(state));
  assert.equal(said.length, 1);
  assert.ok(holidayTexts(['xmas'], ['pause']).has(said[0]), said[0]);
  // A pause started late, or opened early, gets none.
  const late = createDirector(() => 0);
  const s2 = game('xmas');
  s2.phase = 'build'; s2.wave = 4; s2.tick = 1e6; s2.phaseT = TALK.holidayLast * TICK_HZ;
  for (let i = 0; i < 30; i++) { s2.tick += TICK_HZ; s2.phaseT = Math.max(1, s2.phaseT - TICK_HZ); assert.ok(!says(late.idle(s2)).some((t) => holidayTexts(['xmas'], ['pause']).has(t))); }
  // The training shift does its own talking.
  const tr = createGame({ training: true, holiday: 'xmas' });
  addPlayer(tr, 'Dave');
  tr.phase = 'build'; tr.wave = 2; tr.tick = 1e6; tr.phaseT = 45 * TICK_HZ;
  const d3 = createDirector(() => 0);
  for (let i = 0; i < 20; i++) { tr.tick += TICK_HZ; tr.phaseT -= TICK_HZ; assert.deepEqual(says(d3.idle(tr)).filter((t) => holidayTexts(['xmas'], ['pause']).has(t)), []); }
});
