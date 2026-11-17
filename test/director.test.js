// Tests for DEB's lines and the director that picks them. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirector, TALK } from '../src/content/director.js';
import {
  LINES, INTRO, SUPER_INTRO, ESCAPE_REVIEWS, LEFT_REVIEWS, STAMPS, EMPLOYEES_OF_THE_WAVE, NOPE, FRIENDS,
  SHOPPER_NOUNS, fill, textOf, weightOf, choose, placeholders, friendOf, nopeLine,
} from '../src/content/lines.js';
import { HostSession, ClientSession } from '../src/net/session.js';
import { memoryPair } from '../src/net/transports.js';
import { createGame, addPlayer, setPlayerOnline, TICK_HZ, TUNE, bossTier, bossTitle } from '../src/sim/index.js';

/** A seeded random number generator, so every run of these tests sees the same numbers. */
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

/** A game state with these players connected. */
function game(...names) {
  const state = createGame({ seed: 1 });
  for (const n of names) addPlayer(state, n);
  return state;
}

/** Every say text in a list of director messages. */
const says = (out) => out.filter((m) => m.t === 'say').map((m) => m.text);

// ---------------------------------------------------------------------------------------------
// The banks

/** The placeholders the director fills for each bank of LINES. */
const VARS = {
  waveStart: 'pw', dadLine: 'pn', manyEscapes: 'pn', grab: 'p', slip: 'p', kid: 'p', crawl: 'p',
  caught: 'p', caughtCarry: 'p', smash: 'p', smashOther: 'pk', dented: 'pkn', upgraded: 'pkn',
  upgradedBy: 'pkn', maxed: 'pkn', gave: 'pqn', rebuilt: 'pn', rebuiltShort: 'pnm', officeTaken: 'p',
  officeLeft: 'p', officeWave: 'pn', officeNoPlan: 'p', officeWaiting: 'p', storeWaiting: 'p',
  begun: 'p', cramped: 'pnm', superArrive: 'pk', mess: 'p', bolt: 'p', removed: 'p',
  removedOther: 'p', placed: 'p', firstSale: 'p', sale: 'p', buildEnding: 'p', joined: 'p', quit: 'p',
  won: 'p', lost: 'p', nearLimit: 'pn', report: 'p', reportNoStops: 'p', reportNoShips: 'p',
  reportPerfect: 'p', pee: 'pk', flash: 'pn', fall: 'p', pitchStop: 'pk', pitchRush: 'pk',
  kidtv: 'p', rail: 'pn', shield: 'p', bossIn: 'pk', bossOut: 'pkn', bossOutBy: 'pkn', bossEscape: 'pknm',
  pep: 'pkn', endless: 'p', endlessMark: 'pw', foodCourt: 'pw', early: 'pnm',
};

/** At least this many lines per bank: three times what each had before, and plenty for new ones. */
const AT_LEAST = {
  waveStart: 24, dadLine: 27, manyEscapes: 18, grab: 12, slip: 12, kid: 9, crawl: 9, smash: 9,
  smashOther: 12, upgraded: 9, maxed: 3, gave: 6, rebuilt: 6, officeTaken: 6, officeLeft: 6,
  officeWave: 9, officeNoPlan: 3, officeWaiting: 3, storeWaiting: 3, begun: 6, cramped: 3,
  superArrive: 3, mess: 6, bolt: 6, removed: 12, removedOther: 6, firstSale: 6, buildEnding: 6,
  joined: 6, quit: 6, won: 6, lost: 6, report: 21, reportNoStops: 3, reportNoShips: 3,
  reportPerfect: 3, dented: 9, caught: 6, caughtCarry: 6, rebuiltShort: 6, sale: 9, nearLimit: 9,
  pee: 9, flash: 9, fall: 9, pitchStop: 6, pitchRush: 6, kidtv: 6, rail: 12, shield: 9,
  // Version 0.2.06: the boss, endless games, the Food Court and opening early.
  'bossIn.manager': 8, 'bossIn.director': 8, 'bossIn.vp': 8, 'bossIn.ceo': 10, bossOut: 8,
  bossEscape: 12, pep: 12, endless: 8, endlessMark: 10, foodCourt: 12, early: 6,
};
const OLD_ESCAPES = { hunter: 5, clipper: 3, dad: 6, karen: 3, scooter: 2, teen: 3, mom: 3, blind: 3, gymbro: 2 };
const OLD_LEFT = { hunter: 3, clipper: 2, dad: 5, karen: 1, scooter: 1, teen: 2, mom: 2, blind: 1, gymbro: 2 };
const NEW_KINDS = ['dog', 'cosplay', 'flasher', 'drinker'];

/** Each bank of LINES as [name, list], with nested banks (placed, upgradedBy) flattened out. */
function lineBanks() {
  const out = [];
  for (const [key, bank] of Object.entries(LINES)) {
    if (Array.isArray(bank)) out.push([key, key, bank]);
    else for (const [sub, list] of Object.entries(bank)) out.push([`${key}.${sub}`, key, list]);
  }
  return out;
}

/** Every bank of every kind, as [name, list, allowed placeholders, longest allowed]. */
function allBanks() {
  const out = lineBanks().map(([name, key, list]) => [name, list, VARS[key], 200]);
  for (const [k, v] of Object.entries(INTRO)) out.push([`INTRO.${k}`, [].concat(v), 'p', 260]);
  for (const [k, v] of Object.entries(SUPER_INTRO)) out.push([`SUPER_INTRO.${k}`, [].concat(v), 'p', 260]);
  for (const [k, v] of Object.entries(ESCAPE_REVIEWS)) out.push([`ESCAPE_REVIEWS.${k}`, v, 'p', 150]);
  for (const [k, v] of Object.entries(LEFT_REVIEWS)) out.push([`LEFT_REVIEWS.${k}`, v, 'p', 150]);
  for (const [k, v] of Object.entries(NOPE)) out.push([`NOPE.${k}`, v, 'p', 160]);
  for (const [k, v] of Object.entries(STAMPS)) out.push([`STAMPS.${k}`, v, '', 22]);
  out.push(['EMPLOYEES_OF_THE_WAVE', EMPLOYEES_OF_THE_WAVE, '', 50]);
  for (const [who, banks] of Object.entries(FRIENDS)) {
    // A friend's boss lines stand in for the boss's announcement, which fills in his title.
    for (const [k, v] of Object.entries(banks)) out.push([`FRIENDS.${who}.${k}`, v, k === 'boss' ? 'pk' : 'p', 200]);
  }
  return out;
}

test('every bank has about three times the lines it had, and every new event and shopper has some', () => {
  for (const [name, key, list] of lineBanks()) {
    assert.ok(VARS[key], `${name}: add it to VARS in this test, with the placeholders the director fills`);
    // A bank inside a group (placed, upgradedBy, bossOutBy) wants 3 unless it is listed by name.
    const want = AT_LEAST[name] ?? (name !== key ? 3 : AT_LEAST[key]);
    assert.ok(want, `${name}: add it to AT_LEAST in this test`);
    assert.ok(list.length >= want, `${name} has ${list.length} lines, wants ${want}`);
  }
  const placed = Object.values(LINES.placed).reduce((n, l) => n + l.length, 0);
  assert.ok(placed >= 24, `${placed} lines for buildings placed`);
  for (const k of ['railgun', 'salesman']) assert.ok(LINES.placed[k]?.length >= 3, `placed ${k}`);
  assert.ok(LINES.placed.railgun.length >= 6, 'the Barcode Laser lost lines when it was renamed');
  // Every title gets at least 12 ways of storming off, and the boss has the shoppers' extras.
  assert.deepEqual(Object.keys(LINES.bossIn), Object.keys(LINES.bossOutBy));
  for (const [t, extra] of Object.entries(LINES.bossOutBy)) assert.ok(LINES.bossOut.length + extra.length >= 12, `bossOut for ${t}`);
  assert.ok(INTRO.boss && ESCAPE_REVIEWS.boss?.length >= 5 && LEFT_REVIEWS.boss?.length >= 3 && SHOPPER_NOUNS.boss);
  for (const [who, banks] of Object.entries(FRIENDS)) assert.ok(banks.boss?.length >= 3, `${who} has boss lines`);
  for (const t of ['dmg', 'spd', 'rng', 'dur', 'factory']) assert.ok(LINES.upgradedBy[t]?.length >= 3, `upgrade lines for ${t}`);

  for (const [k, n] of Object.entries(OLD_ESCAPES)) assert.ok(ESCAPE_REVIEWS[k].length >= 3 * n, `escape reviews for ${k}`);
  for (const [k, n] of Object.entries(OLD_LEFT)) assert.ok(LEFT_REVIEWS[k].length >= 3 * n, `left reviews for ${k}`);
  for (const k of NEW_KINDS) {
    assert.ok(INTRO[k] && SUPER_INTRO[k], `introductions for ${k}`);
    assert.ok(ESCAPE_REVIEWS[k]?.length >= 5 && LEFT_REVIEWS[k]?.length >= 3, `reviews for ${k}`);
    assert.ok(SHOPPER_NOUNS[k], `a noun for ${k}`);
  }
  assert.ok(STAMPS.top.length >= 12 && STAMPS.middle.length >= 12 && STAMPS.bottom.length >= 15);
  assert.ok(EMPLOYEES_OF_THE_WAVE.length >= 18);
  const oldNope = { cash: 3, blocked: 2, zone: 3 };
  for (const [k, list] of Object.entries(NOPE)) assert.ok(list.length >= 3 * (oldNope[k] || 1), `refusals for ${k}`);
  for (const k of ['fit', 'zone', 'max', 'noup']) assert.ok(NOPE[k]?.length >= 3, `refusal ${k}`);
});

test('no line is repeated, every placeholder gets filled, and nothing is too long to read at a glance', () => {
  const seen = new Map();
  for (const [name, list, allowed, longest] of allBanks()) {
    for (const line of list) {
      const text = textOf(line);
      assert.equal(typeof text, 'string', `${name}: a line with no text`);
      assert.ok(text.trim() === text && text.length > 0, `${name}: "${text}" is blank or has spaces at the ends`);
      if (seen.has(text)) assert.fail(`"${text}" is in both ${seen.get(text)} and ${name}`);
      seen.set(text, name);
      for (const k of placeholders(text)) assert.ok(allowed.includes(k), `${name}: {${k}} is never filled in "${text}"`);
      const vars = { p: 'Bartholomew', n: 12, m: 3, w: 14, k: 'Forklift Turret', q: 'Kev' };
      const filled = fill(text, vars);
      assert.ok(!/\{\w\}/.test(filled), `${name}: "${filled}"`);
      assert.ok(filled.length <= longest, `${name} is ${filled.length} characters (most ${longest}): "${filled}"`);
      const w = weightOf(line);
      assert.ok(w > 0 && w <= 1, `${name}: weight ${w} for "${text}"`);
    }
  }
  // Reviews have their stars; stamps are plain text because the review screen compares them.
  for (const list of [...Object.values(ESCAPE_REVIEWS), ...Object.values(LEFT_REVIEWS)]) {
    for (const r of list) assert.ok(Array.isArray(r) && r[0] >= 1 && r[0] <= 5, `stars on "${r[1]}"`);
  }
  for (const list of Object.values(STAMPS)) for (const s of list) assert.equal(typeof s, 'string');
});

test('banks whose number or name can be missing still have lines that need neither', () => {
  const optional = {
    smashOther: 'k', dented: 'kn', upgraded: 'kn', maxed: 'kn', pee: 'k', flash: 'n', pitchStop: 'k', pitchRush: 'k', superArrive: 'k',
    bossOut: 'n', bossEscape: 'nm', pep: 'kn', early: 'm',
  };
  for (const [key, ks] of Object.entries(optional)) {
    const without = LINES[key].filter((l) => !placeholders(textOf(l)).some((k) => ks.includes(k)));
    assert.ok(without.length >= 1, `${key} needs a line without {${[...ks].join('}, {')}}`);
  }
  // "a {k}" must read right for every kind of shopper the salesman can stop.
  for (const noun of Object.values(SHOPPER_NOUNS)) assert.match(noun, /^[^aeiouAEIOU]/, noun);
});

test('every bank has common, uncommon and rare lines, and the friends have lines for every situation', () => {
  for (const key of ['waveStart', 'dadLine', 'manyEscapes', 'report', 'removed', 'smashOther', 'bossOut', 'bossEscape',
    'pep', 'endless', 'endlessMark', 'foodCourt', 'early', 'rail']) {
    const ws = LINES[key].map(weightOf);
    assert.ok(ws.some((w) => w === 1) && ws.some((w) => w < 0.5 && w > 0.2) && ws.some((w) => w <= 0.15), key);
  }
  for (const [who, banks] of Object.entries(FRIENDS)) {
    const all = Object.values(banks).flat();
    assert.ok(all.length >= 15, `${who} has ${all.length} lines`);
    for (const s of ['joined', 'quit', 'built', 'sold', 'losing', 'winning', 'report', 'idle', 'any']) {
      assert.ok(banks[s]?.length >= 2, `${who} has lines for ${s}`);
    }
    // The name is said in every line, so everyone knows who is being laughed at.
    for (const l of all) assert.ok(/\{p\}/.test(textOf(l)) || new RegExp(who, 'i').test(textOf(l)), `${who}: "${textOf(l)}"`);
  }
});

// ---------------------------------------------------------------------------------------------
// Choosing lines

test('common lines come up far more often than rare ones, and rare ones do come up', () => {
  const random = seeded(7);
  const bank = LINES.dadLine;
  const count = new Map();
  const picks = 40000;
  for (let i = 0; i < picks; i++) {
    const l = choose(bank, random);
    count.set(textOf(l), (count.get(textOf(l)) || 0) + 1);
  }
  const avg = (filter) => {
    const lines = bank.filter(filter);
    return lines.reduce((n, l) => n + (count.get(textOf(l)) || 0), 0) / lines.length;
  };
  const common = avg((l) => weightOf(l) === 1), rare = avg((l) => weightOf(l) <= 0.15);
  assert.ok(common > 6 * rare, `a common line came up ${common.toFixed(0)} times on average, a rare one ${rare.toFixed(0)}`);
  for (const l of bank) assert.ok(count.get(textOf(l)) > 0, `"${textOf(l)}" never came up`);
});

test('once a line has been used, its share of picks drops sharply', () => {
  const random = seeded(3);
  const bank = ['one', 'two', 'three', 'four'];
  const used = new Map([['one', 1]]);
  let one = 0, two = 0;
  for (let i = 0; i < 20000; i++) {
    const l = choose(bank, random, { used, record: false });
    if (l === 'one') one++;
    if (l === 'two') two++;
  }
  assert.ok(one * 5 < two, `used once: ${one} picks; never used: ${two}`);
  assert.ok(one > 0, 'but it is not impossible');
  // Used twice, it drops again.
  used.set('one', 2);
  let again = 0;
  for (let i = 0; i < 20000; i++) if (choose(bank, random, { used, record: false }) === 'one') again++;
  assert.ok(again * 4 < one, `used twice: ${again} picks`);
  // Choosing records the use.
  const fresh = new Map();
  const got = choose(bank, random, { used: fresh });
  assert.equal(fresh.get(got), 1);
});

test('over a whole game, wave openings rarely repeat', () => {
  const director = createDirector(seeded(11));
  const state = game('Dave', 'Steve');
  const said = [];
  for (let w = 1; w <= 20; w++) {
    state.tick += 120 * TICK_HZ;
    state.wave = w;
    said.push(...says(director.handle([{ e: 'waveStart', wave: w, kinds: [], supers: [], dads: 0 }], state)));
  }
  assert.equal(said.length, 20, 'a wave starting is always announced');
  assert.ok(new Set(said).size >= 18, `${new Set(said).size} different openings in 20 waves`);
});

test('DEB thins out: routine things get fewer comments as the game goes on, but never none', () => {
  const director = createDirector(seeded(5));
  const state = game('Dave', 'Steve');
  const said = [];
  // A dad slips every 12 seconds for 50 minutes.
  for (let i = 0; i < 250; i++) {
    state.tick += 12 * TICK_HZ;
    said.push(says(director.handle([{ e: 'slip', x: 1, y: 1 }], state)).length);
  }
  const early = said.slice(0, 50).reduce((a, b) => a + b, 0);
  const late = said.slice(-100).reduce((a, b) => a + b, 0) / 2;
  assert.equal(said[0], 1, 'the first one is commented on');
  assert.ok(early >= 2 * late, `${early} comments in the first ten minutes, ${late} per ten minutes at the end`);
  assert.ok(late > 0, 'she still mentions it now and then');

  // The things that matter are still said every time, however late in the game.
  const must = [
    [{ e: 'waveStart', wave: 15, kinds: [], supers: [] }],
    [{ e: 'waveStart', wave: 16, kinds: ['dog'], supers: [] }],
    [{ e: 'won' }],
    [{ e: 'lost' }],
  ];
  for (const ev of must) {
    state.tick += 1;
    assert.equal(says(director.handle(ev, state)).length, 1, ev[0].e);
  }
  // As is the refund limit getting close.
  state.refundLimit = 40;
  state.refunds = 31;
  state.tick += 1;
  const near = says(director.handle([{ e: 'escape', k: 'hunter' }], state));
  assert.ok(near.some((t) => /\b9\b/.test(t)), `warned with refunds left: ${near}`);
  state.refunds = 32;
  state.tick += 1;
  assert.ok(!says(director.handle([{ e: 'escape', k: 'hunter' }], state)).some((t) => /refund/i.test(t) && /\b8\b/.test(t)), 'only once for each mark');
  // And the ten-second warning.
  state.phase = 'build';
  state.phaseT = 10 * TICK_HZ;
  assert.equal(says(director.idle(state)).length, 1);
});

test('the gap between remarks and the chance of one are tunable in one place', () => {
  for (const k of ['repeatPenalty', 'first', 'decay', 'floor', 'floorImportant', 'quiet', 'quietMax', 'friendShare', 'friendIdle']) {
    assert.equal(typeof TALK[k], 'number', k);
  }
});

// ---------------------------------------------------------------------------------------------
// The three friends

/** Every line of one friend's, filled in with the name as the player typed it. */
function friendLines(key, name) {
  return new Set(Object.values(FRIENDS[key]).flat().map((l) => fill(textOf(l), { p: name })));
}

/** A long run of events that name players, with time passing, plus the breaks between waves. */
function playGame(director, state, by = 1, waves = 20) {
  const said = [];
  for (let w = 1; w <= waves; w++) {
    state.wave = w;
    state.phase = 'wave';
    state.tick += 5 * TICK_HZ;
    said.push(...says(director.handle([{ e: 'waveStart', wave: w, kinds: [], supers: [], dads: 3 }], state)));
    for (let i = 0; i < 6; i++) {
      state.tick += 20 * TICK_HZ;
      said.push(...says(director.handle([
        { e: 'placed', k: 'crate', x: i, y: w, by },
        { e: 'upgraded', k: 'sprinkler', x: 2, y: 2, by, t: 'dmg', lv: 2 },
        { e: 'removed', k: 'crate', x: i, y: w, by, owner: by },
      ], state)));
    }
    state.tick += 5 * TICK_HZ;
    said.push(...director.handle([{ e: 'waveEnd', wave: w, bonus: 100 }], state).filter((m) => m.t === 'report').map((m) => m.deb));
    state.phase = 'build';
    for (let s = 45; s > 0; s--) {
      state.phaseT = s * TICK_HZ;
      state.tick += TICK_HZ;
      said.push(...says(director.idle(state)));
    }
  }
  return said;
}

test('the friends get their own lines when one of them is in the game, a few times a game', () => {
  for (const [key, typed] of [['bobb', 'Bobb'], ['bobb', 'bobb'], ['bobb', 'BOBB'], ['phantasm', 'Phantasm'], ['tusker', 'tusker']]) {
    const state = game('Dave', typed);
    const said = playGame(createDirector(seeded(21)), state);
    const mine = friendLines(key, typed);
    const his = said.filter((t) => mine.has(t));
    assert.ok(his.length >= 3, `${typed}: ${his.length} of his own lines in a game`);
    assert.ok(his.length < said.length / 3, `${typed}: ${his.length} of ${said.length} lines is too many`);
    assert.ok(his.every((t) => t.includes(typed)), 'his name is in every one');
  }
  // All three together: each gets his turn.
  const state = game('Bobb', 'Phantasm', 'Tusker');
  const said = playGame(createDirector(seeded(4)), state, 0);
  for (const [key, name] of [['bobb', 'Bobb'], ['phantasm', 'Phantasm'], ['tusker', 'Tusker']]) {
    assert.ok(said.some((t) => friendLines(key, name).has(t)), `${name} gets a line`);
  }
});

test('nobody else gets the friends\' lines, and a friend who has left gets no more of them', () => {
  for (const names of [['Dave', 'Steve'], ['Bob', 'Bobby'], ['Dave', 'Bobb the Builder']]) {
    const said = playGame(createDirector(seeded(9)), game(...names));
    assert.ok(said.length > 50);
    // Any friend's line, with the name of anyone in this game in it.
    const theirs = new Set();
    for (const key of Object.keys(FRIENDS)) for (const n of names) for (const l of friendLines(key, n)) theirs.add(l);
    assert.deepEqual(said.filter((t) => theirs.has(t)), [], names.join(', '));
  }
  assert.equal(friendOf('Bobby'), null);
  assert.equal(friendOf('constructor'), null);
  assert.ok(friendOf(' TUSKER '));

  // Bobb plays, then leaves. DEB may see him off with one of his lines, but none after that.
  const state = game('Dave', 'Bobb');
  const director = createDirector(seeded(2));
  playGame(director, state, 1, 2);
  setPlayerOnline(state, 1, false);
  state.tick += TICK_HZ;
  director.handle([{ e: 'quit', by: 1 }], state);
  const after = playGame(director, state, 0, 20);
  const bobb = friendLines('bobb', 'Bobb');
  assert.deepEqual(after.filter((t) => bobb.has(t)), []);
});

test('when Bobb leaves, the line seeing him off can be one of his', () => {
  let found = false;
  for (let seed = 1; seed < 40 && !found; seed++) {
    const state = game('Dave', 'Bobb');
    const director = createDirector(seeded(seed));
    setPlayerOnline(state, 1, false);
    const text = says(director.handle([{ e: 'quit', by: 1 }], state))[0];
    assert.ok(text.includes('Bobb'));
    found = friendLines('bobb', 'Bobb').has(text);
  }
  assert.ok(found);
});

// ---------------------------------------------------------------------------------------------
// Everyone hears the same thing

test('everyone in the game reads the same line from DEB, name and all', () => {
  const host = new HostSession({ name: 'Dave', seed: 5, director: createDirector(seeded(8)) });
  const [a, b] = memoryPair();
  host.accept(a);
  const client = new ClientSession(b, 'Bobb');
  const heard = { host: [], client: [] };
  host.on('say', (m) => heard.host.push(m.text));
  client.on('say', (m) => heard.client.push(m.text));
  host.state.wave = 1;
  for (let wave = 0; wave < 3; wave++) {
    host.send({ c: 'start' });
    host.fastForward(90 * TICK_HZ);
  }
  client.update(0);
  assert.ok(heard.host.length >= 3, `DEB said ${heard.host.length} things`);
  assert.deepEqual(heard.client, heard.host);
  // The line that greeted him named him, and the client was told it the same way.
  const joined = createDirector(() => 0).handle([{ e: 'joined', by: 1 }], host.state);
  assert.ok(says(joined)[0].includes('Bobb'));
});

// ---------------------------------------------------------------------------------------------
// New and odd events

test('the director handles every new event, with all its fields or none, and ignores what it does not know', () => {
  const full = [
    { e: 'pee', i: 3, x: 1, y: 1, k: 'sprinkler' },
    { e: 'pee', i: 3, x: 1, y: 1, k: 'railgun' },
    { e: 'flash', x: 1, y: 1, n: 4 },
    { e: 'flash', x: 1, y: 1, n: 1 },
    { e: 'fall', x: 1, y: 1 },
    { e: 'pitch', x: 1, y: 1, k: 'dad', r: 'stop' },
    { e: 'pitch', x: 1, y: 1, k: 'karen', r: 'rush' },
    { e: 'kidtv', x: 1, y: 1 },
    { e: 'rail', i: 4, d: 1, len: 9, n: 7 },
    { e: 'shield', x: 1, y: 1 },
    { e: 'smash', i: 5, x: 1, y: 1, k: 'forklift', owner: 1, left: 0 },
    { e: 'smash', i: 5, x: 1, y: 1, k: 'salesman', owner: 1, left: 2 },
    { e: 'smash', i: 5, x: 1, y: 1, k: 'crate', owner: 1, left: 0 },
    { e: 'upgraded', k: 'forklift', x: 1, y: 1, by: 1, t: 'rng', lv: 3 },
    { e: 'upgraded', k: 'press', x: 1, y: 1, by: 1, t: 'spd', lv: 2 },
    { e: 'upgraded', k: 'railgun', x: 1, y: 1, by: 1, t: 'dur', lv: TUNE.maxLevel },
    { e: 'rebuilt', by: 1, n: 4, short: 2 },
    { e: 'rebuilt', by: 1, n: 4, short: 0 },
    { e: 'caught', x: 1, y: 1, carry: 1 },
    { e: 'caught', x: 1, y: 1, carry: 0 },
    { e: 'escape', k: 'dog', sup: 0 },
    { e: 'left', k: 'cosplay', sup: 1 },
    { e: 'bossIn', tier: 2, x: 1, y: 1 },
    { e: 'bossOut', tier: 3, x: 1, y: 1, bounty: 450 },
    { e: 'escape', k: 'boss', sup: 0, x: 1, y: 1, refund: 600, n: 5, tier: 4 },
    { e: 'left', k: 'boss', sup: 0, x: 1, y: 1, by: 0, why: 'shot' },
    { e: 'pep', x: 1, y: 1, n: 3 },
    { e: 'pep', x: 1, y: 1, n: 0 },
    { e: 'endless', by: 1 },
    { e: 'early', secs: 40, cash: 320, sold: 9 },
  ];
  // With a random function that always says yes, every one of them is commented on.
  for (const e of full) {
    const out = createDirector(() => 0).handle([e], game('Dave', 'Steve'));
    if (e.e === 'left') continue; // reviews of shoppers who leave are only now and then
    assert.ok(out.length >= 1, `nothing for ${JSON.stringify(e)}`);
    for (const m of out) {
      const text = m.t === 'say' || m.t === 'review' ? m.text : '';
      assert.ok(!/\{\w\}/.test(text) && !/undefined|null|NaN/.test(text), `${e.e}: "${text}"`);
    }
  }
  // A small barcode laser hit is not worth a word, and nor is a factory that earned next to nothing.
  assert.deepEqual(createDirector(() => 0).handle([{ e: 'rail', n: 2 }], game('Dave')), []);
  assert.deepEqual(createDirector(() => 0).handle([{ e: 'early', secs: 3, cash: 4, sold: 0 }], game('Dave')), []);
  // A shopper walking over to the TV Salesman's stand needs nothing said.
  assert.deepEqual(createDirector(() => 0).handle([{ e: 'watching', x: 1, y: 1, k: 'dad', i: 4 }], game('Dave')), []);
  // Destroyed and dented get different lines.
  const destroyed = says(createDirector(() => 0).handle([{ e: 'smash', k: 'forklift', owner: 0, left: 0 }], game('Dave')))[0];
  const dented = says(createDirector(() => 0).handle([{ e: 'smash', k: 'forklift', owner: 0, left: 1 }], game('Dave')))[0];
  assert.ok(LINES.smashOther.some((l) => fill(textOf(l), { p: 'Dave', k: 'Forklift Turret' }) === destroyed), destroyed);
  assert.ok(LINES.dented.some((l) => fill(textOf(l), { p: 'Dave', k: 'Forklift Turret', n: 1 }) === dented), dented);
  // The first appearance of each new kind of shopper, and of its super, is explained.
  const intro = says(createDirector(seeded(1)).handle([{ e: 'waveStart', wave: 9, kinds: NEW_KINDS, supers: NEW_KINDS }], game('Dave')));
  assert.equal(intro.length, 8);

  // Every event with its fields missing, plus nonsense, and nothing breaks.
  const names = ['pee', 'flash', 'fall', 'pitch', 'kidtv', 'rail', 'shield', 'smash', 'upgraded', 'rebuilt', 'caught',
    'waveStart', 'crawl', 'kid', 'begun', 'side', 'ready', 'gave', 'mess', 'bolt', 'escape', 'left', 'grab', 'slip', 'sale',
    'placed', 'removed', 'waveEnd', 'won', 'lost', 'joined', 'quit', 'bossIn', 'bossOut', 'pep', 'endless', 'early',
    'watching', 'somethingNew', undefined];
  for (const random of [() => 0, () => 0.999, seeded(1)]) {
    const director = createDirector(random);
    const state = game('Dave', 'Bobb');
    for (const e of names) {
      state.tick += 60 * TICK_HZ;
      const out = director.handle([{ e }], state);
      for (const m of out) if (m.t === 'say') assert.ok(!/\{\w\}|undefined/.test(m.text), `${e}: "${m.text}"`);
    }
    director.handle([null, 'x', 7, { e: 'smash', k: 'constructor', owner: 99 }, { e: 'pitch', k: '__proto__' }, { e: 'placed', k: 'toString' },
      { e: 'escape', k: 'boss', tier: 'big', n: -1 }, { e: 'bossIn', tier: 1e9 }, { e: 'bossOut', tier: NaN, bounty: 'lots' },
      { e: 'endless', by: 99 }], state);
    for (const m of director.handle([{ e: 'bossIn', tier: -3 }, { e: 'pep', n: 'x' }], state)) {
      if (m.t === 'say') assert.ok(!/\{\w\}|undefined|NaN/.test(m.text), m.text);
    }
    director.handle(undefined, state);
  }
});

// ---------------------------------------------------------------------------------------------
// The boss, endless games, the Food Court

/** The boss's title as the lines say it ("CEO", not "The CEO"). */
const titleIn = (wave) => bossTitle(bossTier(wave)).replace(/^the /i, '');

/** One boss wave: the doors open, then he walks in. Returns everything DEB said. */
function bossWave(director, state, wave) {
  state.wave = wave;
  state.tick += 200 * TICK_HZ;
  const said = says(director.handle([{ e: 'waveStart', wave, kinds: ['hunter', 'boss'], supers: [], dads: 0, boss: bossTier(wave) }], state));
  state.tick += 12 * TICK_HZ;
  said.push(...says(director.handle([{ e: 'bossIn', tier: bossTier(wave), x: 1, y: 1 }], state)));
  return said;
}

test('the boss is announced once each visit, by the right title, and his trick is explained the first time', () => {
  for (const seed of [1, 2, 3]) {
    const director = createDirector(seeded(seed));
    const state = game('Dave', 'Steve');
    for (const wave of [5, 10, 15, 20, 25, 30, 35]) {
      const said = bossWave(director, state, wave);
      const title = titleIn(wave);
      const naming = said.filter((t) => t.toLowerCase().includes(title.toLowerCase()));
      assert.equal(naming.length, 1, `wave ${wave}: ${JSON.stringify(said)}`);
      // The opening itself does not name him: it is said before he walks in.
      assert.ok(!said[0].toLowerCase().includes(title.toLowerCase()), said[0]);
      assert.equal(said.includes(fill(INTRO.boss, {})), wave === 5, `wave ${wave}: the explanation`);
    }
  }
  assert.equal(titleIn(20), 'CEO');
  assert.equal(titleIn(45), 'CEO');
  // Each title's own bank names him in every line.
  for (const [bank, wave] of [['manager', 5], ['director', 10], ['vp', 15], ['ceo', 20]]) {
    for (const l of LINES.bossIn[bank]) assert.ok(textOf(l).includes(titleIn(wave)), `${bank}: "${textOf(l)}"`);
  }
  // A friend's stand-in line names him too.
  let friendLine = 0;
  for (let seed = 1; seed < 30; seed++) {
    const said = bossWave(createDirector(seeded(seed)), game('Tusker'), 10);
    const mine = new Set(FRIENDS.tusker.boss.map((l) => fill(textOf(l), { p: 'Tusker', k: 'Area Director' })));
    if (said.some((t) => mine.has(t))) friendLine++;
    assert.equal(said.filter((t) => t.includes('Area Director')).length, 1, JSON.stringify(said));
  }
  assert.ok(friendLine >= 3, `Tusker got his own boss line ${friendLine} times in 29`);
});

test('the boss storming off and the boss getting through are always remarked on, with the money', () => {
  const director = createDirector(seeded(6));
  const state = game('Dave', 'Steve');
  // A long, chatty game first, so DEB is as quiet as she gets.
  playGame(director, state, 1, 20);
  for (const wave of [25, 30, 35, 40]) {
    bossWave(director, state, wave);
    state.tick += 1;
    const out = director.handle([{ e: 'left', k: 'boss', sup: 0, by: 0 }, { e: 'bossOut', tier: bossTier(wave), x: 1, y: 1, bounty: 1234 }], state);
    const off = says(out);
    assert.equal(off.length, 1, `wave ${wave}: ${off}`);
    assert.ok(off[0].includes('CEO') && (off[0].includes('$1234') || !/\$/.test(off[0])), off[0]);
    assert.ok(out.some((m) => m.t === 'review' && m.kind === 'boss'), 'his review of the staff');
  }
  let withCash = 0;
  for (let i = 0; i < 12; i++) {
    state.tick += 1;
    state.refundLimit = 1000;
    const out = director.handle([{ e: 'escape', k: 'boss', sup: 0, x: 1, y: 1, refund: 750, n: 5, tier: 3 }], state);
    const through = says(out);
    assert.equal(through.length, 1, JSON.stringify(through));
    assert.ok(through[0].includes('Vice President of Returns'), through[0]);
    if (through[0].includes('$750') || /\b5\b/.test(through[0])) withCash++;
    assert.ok(out.some((m) => m.t === 'review' && m.kind === 'boss'));
  }
  assert.ok(withCash >= 9, `${withCash} of 12 said what it cost`);
});

test('the pep talk, every 7 seconds, gets only a handful of remarks in a game', () => {
  const director = createDirector(seeded(13));
  const state = game('Dave', 'Steve');
  bossWave(director, state, 5);
  let said = 0;
  for (let i = 0; i < 200; i++) {
    state.tick += 7 * TICK_HZ;
    const out = says(director.handle([{ e: 'pep', x: 1, y: 1, n: i % 4 }], state));
    said += out.length;
    for (const t of out) assert.ok(!/\{\w\}|undefined/.test(t), t);
  }
  assert.ok(said >= 1 && said <= 6, `${said} remarks about 200 pep talks`);
});

test('an endless game never mentions a last event, and marks the round numbers', () => {
  const lastEvent = /last (one|sales event|event)|final (sales )?event|every sales event|\bof 0\b/i;
  // Nothing anywhere that DEB can say in an endless game names a last event...
  const endlessBanks = ['waveStart', 'endless', 'endlessMark', 'foodCourt', 'bossOut', 'bossEscape', 'pep', 'early', 'report', 'nearLimit', 'lost'];
  for (const key of endlessBanks) for (const l of LINES[key]) assert.ok(!lastEvent.test(textOf(l)), `${key}: "${textOf(l)}"`);
  for (const l of Object.values(LINES.bossIn).flat()) assert.ok(!lastEvent.test(textOf(l)), textOf(l));

  // ...and in a long endless game she never says one.
  const director = createDirector(seeded(17));
  const state = game('Dave', 'Steve');
  state.waves = 0;
  const said = [];
  said.push(...says(director.handle([{ e: 'endless', by: 1 }], state)));
  assert.equal(said.length, 1, 'carrying a won game on is always remarked on');
  assert.ok(said[0].includes('Steve') || LINES.endless.some((l) => !textOf(l).includes('{p}') && textOf(l) === said[0]), said[0]);
  const marks = [];
  for (let wave = 1; wave <= 80; wave++) {
    state.wave = wave;
    state.tick += 200 * TICK_HZ;
    const out = says(director.handle([{ e: 'waveStart', wave, kinds: [], supers: [], dads: 2, boss: bossTier(wave) }], state));
    said.push(...out);
    if (LINES.endlessMark.some((l) => fill(textOf(l), { w: wave, p: 'Dave' }) === out[0] || fill(textOf(l), { w: wave, p: 'Steve' }) === out[0])) marks.push(wave);
    if (bossTier(wave)) {
      state.tick += 12 * TICK_HZ;
      said.push(...says(director.handle([{ e: 'bossIn', tier: bossTier(wave) }, { e: 'pep', n: 3 }], state)));
      state.tick += 30 * TICK_HZ;
      said.push(...says(director.handle([{ e: 'bossOut', tier: bossTier(wave), bounty: 600 }], state)));
    }
    said.push(...director.handle([{ e: 'waveEnd', wave, bonus: 100 }], state).filter((m) => m.t === 'report').map((m) => m.deb));
  }
  for (const t of said) assert.ok(!lastEvent.test(t), t);
  // Important, not must: the first always, about half of the later ones.
  assert.ok(marks.length >= 2 && marks.every((w) => w >= 20 && w % 10 === 0), `remarks at ${marks}`);
  assert.ok(marks.includes(20), 'the first round number is always marked');
  // A game with a set number of events gets no such remarks.
  const fixed = createDirector(seeded(17));
  const st = game('Dave');
  st.waves = 30;
  st.wave = 20;
  const t = says(fixed.handle([{ e: 'waveStart', wave: 20, kinds: [], supers: [] }], st))[0];
  assert.ok(LINES.waveStart.some((l) => fill(textOf(l), { w: 20, p: 'Dave' }) === t), t);
});

test('the Food Court lines come up on the Food Court and nowhere else', () => {
  const food = new Set();
  for (const name of ['Dave', 'Steve']) for (const l of LINES.foodCourt) for (let w = 1; w <= 30; w++) food.add(fill(textOf(l), { p: name, w }));
  const openings = (design) => {
    const director = createDirector(seeded(23));
    const state = game('Dave', 'Steve');
    state.map = { ...state.map, design };
    const said = [];
    for (let wave = 1; wave <= 30; wave++) {
      state.wave = wave;
      state.tick += 200 * TICK_HZ;
      said.push(...says(director.handle([{ e: 'waveStart', wave, kinds: [], supers: [], dads: 0 }], state)));
    }
    return said;
  };
  for (const design of ['warehouse', 'showroom', 'aisles', undefined]) {
    assert.deepEqual(openings(design).filter((t) => food.has(t)), [], `${design}`);
  }
  const there = openings('food');
  const n = there.filter((t) => food.has(t)).length;
  assert.equal(there.length, 30);
  assert.ok(n >= 5 && n <= 18, `${n} of 30 openings on the Food Court were its own`);
});

test('refusals: the same rules, and a refusal does not repeat straight away', () => {
  assert.equal(nopeLine('cash', 'Kev', () => 0), "You can't afford that. Add it to the list, Kev.");
  assert.ok(nopeLine('fit', 'Kev').includes('Kev'));
  assert.ok(nopeLine('constructor', 'Kev').length > 0);
  const random = seeded(12);
  let same = 0;
  let last = '';
  for (let i = 0; i < 200; i++) {
    const t = nopeLine('zone', 'Kev', random);
    if (t === last) same++;
    last = t;
  }
  assert.ok(same < 20, `the same refusal twice running ${same} times in 200`);
});
