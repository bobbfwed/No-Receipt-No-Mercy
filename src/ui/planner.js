// The Head Office planner. Shown in place of the build bar to the player who has taken the Head
// Office job (see src/sim/office.js): he spends a budget on groups of shoppers for the coming
// sales event and chooses, for each group, which entrance it uses and when it starts arriving.
//
// The plan he is editing lives here and is sent whole, with { c: 'plan', groups }, after every
// change. Nothing here can build a plan the rules would refuse: anything that would fail
// checkPlan() is disabled, and every change is checked before it is sent. If the host's copy
// differs and he has not touched the plan for a second (a refused command, a new build phase),
// the host's copy wins.
import { OFFICE, SHOPPERS, SUPERS, ST, TUNE, priceOf, planCost, canBuy, checkPlan } from '../sim/index.js';
import { SHOPPER_HELP, SUPER_HELP } from '../content/help.js';
import { drawShopper, createShopperSprites } from '../render/shoppers.js';
import { h, setText, setClass, setStyle, money, safeColor } from './dom.js';
import { longPress, touchedLast } from './touch.js';

const KINDS = Object.keys(OFFICE.kinds);
/** Names short enough for a card; the tooltip has the full one. */
const SHORT = {
  hunter: 'Hunter', dad: 'Dad', clipper: 'Clipper', mom: 'Mom+Kid', teen: 'Teenager',
  karen: 'Karen', blind: 'Guide Dog', gymbro: 'Gym Bro', scooter: 'Scooter',
  drinker: 'Drinker', dog: 'Stray Dog', flasher: 'Flasher', cosplay: 'Cosplayer',
};
const SUP_SHORT = {
  hunter: 'Doorbuster', dad: 'Mission Dad', clipper: 'Ext. Couponer', mom: 'Soccer Mom', teen: 'Influencer',
  karen: 'Karen Supreme', blind: 'Two Dogs', gymbro: 'Roid Rager', scooter: 'Turbo Scooter',
  drinker: 'Bruncher', dog: 'Great Dane', flasher: 'Nudist Nan', cosplay: 'Mech Suit',
};
/** Each shopper's trick in a few words (SHOPPER_HELP has the full sentence, shown in the tooltip). */
const TRICK = {
  hunter: 'Grabs samples', dad: 'Hops belts', clipper: 'Fast and weak',
  mom: 'Kid runs off', teen: 'Spills mess', karen: 'Slows towers', blind: 'Dog bolts',
  gymbro: 'Smashes stuff', scooter: 'Never slowed',
  drinker: 'Blocks aisles', dog: 'Pees on towers', flasher: 'Stops dads', cosplay: 'Soaks up shots',
};
/** How long after the last edit the host's copy of the plan may replace the one being edited. */
const SYNC_MS = 1000;
/** A ready press shows at once, before the host's next update confirms it. */
const ASK_MS = 1500;

const one = (n) => String(Math.round(n * 10) / 10);
const secs = (n) => `${one(n)}s`;
const gapOf = (k) => OFFICE.kinds[k].gap;
const tidy = (g) => ({ k: g.k, n: g.n, sup: g.sup ? 1 : 0, door: g.door, at: Math.round(g.at * 10) / 10 });
const copy = (groups) => (Array.isArray(groups) ? groups.map(tidy) : []);
const same = (a, b) => JSON.stringify(copy(a)) === JSON.stringify(copy(b));
const nameOf = (k, sup) => (sup ? SUPERS[k].name : SHOPPERS[k].name);

// ---- Shopper portraits ----------------------------------------------------------------------------

const PORTRAIT = 44; // logical size of a portrait, in the shoppers' drawing units
const RES = 2; // backing pixels per CSS pixel at the size the cards use
const spriteSets = new Map(); // scale -> sprite cache (each cache holds one scale)
/** How much to shrink each kind so it fits the square (the dog and the scooter are wide). */
const FIT = { blind: 0.62, scooter: 0.74, mom: 0.8, gymbro: 0.8, cosplay: 0.7 };

/** A small canvas with one shopper standing still, as drawn on the floor. */
function portrait(k, sup, cls) {
  const c = h('canvas', { class: cls, 'aria-hidden': 'true' });
  const z = (FIT[k] || 0.88) * (sup ? 0.74 : 1);
  const scale = RES * z;
  c.width = PORTRAIT * RES;
  c.height = PORTRAIT * RES;
  let sprites = spriteSets.get(scale);
  if (!sprites) { sprites = createShopperSprites(); sprites.setScale(scale); spriteSets.set(scale, sprites); }
  const g = c.getContext('2d');
  if (!g) return c;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const w = PORTRAIT / z;
  // Feet near the bottom edge, figure in the middle (the guide dog walks ahead, so shift him).
  const sx = w / 2 - (k === 'blind' ? 14 : k === 'scooter' ? 4 : 2);
  const sy = w - 13;
  const sh = { id: 1, k, sup: sup ? 1 : 0, x: 0, y: 0, vx: 0, vy: 0, hp: 1, mhp: 1, st: ST.WALK, t: 0, cd: 0, kd: 0, bt: 0 };
  try { drawShopper(g, sh, sx, sy, 1, { time: 0, now: 0, alpha: 0 }, sprites); } catch { /* a blank square is fine */ }
  return c;
}

// ---- The planner ---------------------------------------------------------------------------------

/**
 * @param {Object} session
 * @param {Object} [o]
 * @param {(name: string) => void} [o.playSound]
 * @returns {{ el: HTMLElement, tip: HTMLElement, update(s): void, left(s): number }}
 */
export function createPlanner(session, { playSound = () => {} } = {}) {
  let local = []; // the plan being edited
  let editedAt = -1e9; // when he last changed it (performance.now)
  let planKey = ''; // which build phase the local plan is for
  let lastHost = null; // the host's plan as last seen in a build phase (null: no build phase seen yet)
  let wavePlan = null; // the plan running now: what the host had when the doors opened
  let waveSeen = -1; // the wave number wavePlan belongs to
  let waveStart = null; // the tick the doors opened (the rules record it in state.waveAt)
  let askedAt = -1e9; // when he pressed READY
  let rowsSig = '';
  let scrollToEnd = false;

  // ---- Budget and the READY button ----
  const leftVal = h('b', { class: 'plb-val' });
  const leftLbl = h('small', { class: 'plb-lbl' }, 'LEFT TO SPEND');
  const meterFill = h('i');
  const totalLine = h('div', { class: 'plb-line' });
  const carryLine = h('div', { class: 'plb-line plb-carry' });
  const readyMain = h('b', null, 'READY');
  const readySub = h('small');
  const readyBtn = h('button', {
    type: 'button', class: 'pl-ready',
    title: 'Tell the store you are done. The doors open as soon as the store players have pressed OPEN THE DOORS too, or when the clock runs out.',
    onclick: ready,
  }, readyMain, readySub);
  const budgetBox = h('section', {
    class: 'pl-group pl-budget', 'aria-label': 'Budget',
    title: `Your budget for the coming sales event. Half of whatever you do not spend (${Math.round(OFFICE.carry * 100)}%) is added to the next one, plus $${OFFICE.perRefund} for every shopper who got a refund.`,
  },
  h('span', { class: 'pl-label' }, 'HEAD OFFICE'),
  h('div', { class: 'plb-top' }, leftLbl, leftVal),
  h('div', { class: 'plb-meter', role: 'presentation' }, meterFill),
  totalLine, carryLine, readyBtn);

  // ---- Shopper cards ----
  const tip = h('div', { class: 'tip pl-tip hidden', role: 'tooltip', id: 'planner-tip' });
  const cards = new Map();
  for (const k of KINDS) cards.set(k, makeCard(k));
  const shopLabel = h('span', { class: 'pl-label' });
  const cardHint = h('div', { class: 'pl-card pl-card-hint' },
    h('span', null, h('b', null, 'Click:'), ' add one'),
    h('span', null, h('b', null, 'Shift-click:'), ' add the most'),
    h('span', null, h('b', null, '★'), ' buys the super'));
  const shopBox = h('section', { class: 'pl-group pl-shop', 'aria-label': 'Buy shoppers' },
    shopLabel, h('div', { class: 'pl-cards' }, [...cards.values()].map((c) => c.el), cardHint));

  // ---- How the wave is going (replaces the cards while the doors are open) ----
  const liveLabel = h('span', { class: 'pl-label' });
  const liveVal = {};
  const tile = (key, label, cls, title) => h('div', { class: `pll-tile ${cls}`, title },
    h('small', null, label), (liveVal[key] = h('b', null, '0')));
  const liveRefVal = h('b');
  const liveFill = h('i');
  const liveNote = h('p', { class: 'pll-note' });
  const liveBox = h('section', { class: 'pl-group pl-live hidden', 'aria-label': 'How your shoppers are doing' },
    liveLabel,
    h('div', { class: 'pll-tiles' },
      tile('escaped', 'GOT REFUNDS', 'good', 'Shoppers who reached the tills this sales event. Each one adds to the store\'s refund count.'),
      tile('stopped', 'GAVE UP', 'bad', 'Shoppers who ran out of patience and stormed out.'),
      tile('coming', 'STILL TO COME', '', 'Shoppers who have not come through the doors yet.'),
      tile('floor', 'ON THE FLOOR', '', 'Shoppers in the store right now.')),
    h('div', { class: 'pll-refunds', title: 'When the store reaches its refund limit it closes, and you win.' },
      h('span', null, 'Store refunds ', liveRefVal),
      h('div', { class: 'meter', role: 'presentation' }, liveFill)),
    liveNote);

  // ---- The plan: one row per group, with a timeline ----
  const planLabel = h('span', { class: 'pl-label' });
  const axis = h('div', { class: 'plr-axis' });
  const head = h('div', { class: 'plr plr-head', 'aria-hidden': 'true' },
    h('span', null, 'Shoppers'), h('span', null, 'How many'), h('span', null, 'Entrance'), h('span', null, 'Starts at'),
    h('span', { class: 'num', title: 'What the group costs, and how long it takes to come through the door' }, 'Cost/time'), axis, h('span'));
  const rows = h('div', { class: 'plr-rows' });
  const empty = h('div', { class: 'pl-empty' });
  const planBox = h('section', { class: 'pl-group pl-plan', 'aria-label': 'Your plan' }, planLabel, head, rows, empty);

  const el = h('footer', { class: 'planner hidden', 'aria-label': 'Head Office planner' }, budgetBox, shopBox, liveBox, planBox);

  // ---- Helpers ----
  const st = () => session.state;
  const isMine = (s) => !!(s && s.office && s.office.pid === session.me && s.players[session.me]?.side === 'office');
  const canEdit = (s) => isMine(s) && s.phase === 'build';
  const budgetOf = (s) => (s && s.office ? s.office.budget : 0);
  const left = (s = st()) => (s && s.office ? budgetOf(s) - (s.phase === 'build' ? planCost(local) : 0) : 0);

  /** The entrance a new group uses: that of the last group added, else the first store player's. */
  function defaultDoor(s) {
    if (local.length) return local[local.length - 1].door;
    for (let i = 0; i < s.open; i++) if (s.players[i] && s.players[i].side !== 'office') return i;
    return 0;
  }

  /** The most of a group's kind he could have in it, given what else he has bought. */
  function maxN(s, i) {
    const g = local[i];
    return Math.max(1, Math.min(OFFICE.maxSize, g.n + Math.floor(left(s) / priceOf(g.k, g.sup))));
  }

  /** Checks and sends a whole new plan. Returns false (and changes nothing) if it would be refused. */
  function commit(groups, sound = 'click') {
    const s = st();
    if (!canEdit(s)) return false;
    const next = copy(groups);
    if (checkPlan(s, next)) { playSound('nope'); return false; }
    local = next;
    editedAt = performance.now();
    session.send({ c: 'plan', groups: local });
    playSound(sound);
    render(s);
    return true;
  }

  const edit = (i, patch) => commit(local.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  function add(k, sup, many) {
    const s = st();
    if (!canEdit(s) || local.length >= OFFICE.maxGroups || !canBuy(k, sup, s.wave + 1)) return;
    const each = priceOf(k, sup);
    const can = Math.floor(left(s) / each);
    if (can < 1) { playSound('nope'); return; }
    scrollToEnd = true;
    commit([...local, { k, n: many ? Math.min(OFFICE.maxSize, can) : 1, sup, door: defaultDoor(s), at: 0 }], 'place');
  }

  function ready() {
    const s = st();
    if (!isMine(s) || s.phase !== 'build' || s.office.ready) return;
    askedAt = performance.now();
    playSound('click');
    session.send({ c: 'start' });
  }

  // ---- Cards ----
  function makeCard(k) {
    const main = h('button', {
      type: 'button', class: 'plc-main', 'aria-describedby': 'planner-tip',
      onclick: (e) => add(k, 0, e.shiftKey),
    },
    portrait(k, 0, 'plc-pic'),
    h('span', { class: 'plc-text' },
      h('b', { class: 'plc-name' }, SHORT[k]),
      h('span', { class: 'plc-trick' }, TRICK[k]),
      h('span', { class: 'plc-price' }, `$${priceOf(k, 0)}`)));
    const sup = h('button', {
      type: 'button', class: 'plc-sup', 'aria-describedby': 'planner-tip',
      'aria-label': `${SUPERS[k].name}, $${priceOf(k, 1)} each`,
      onclick: (e) => add(k, 1, e.shiftKey),
    }, '★ $', String(priceOf(k, 1)));
    const lock = h('span', { class: 'plc-lock' });
    const el = h('div', { class: 'pl-card' }, main, sup, lock);
    for (const [btn, isSup] of [[main, 0], [sup, 1]]) {
      // A finger has no hover: on a touch screen a long press shows the tooltip instead.
      btn.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') showTip(el, k, isSup); });
      btn.addEventListener('pointerleave', hideTip);
      btn.addEventListener('focus', () => { if (!touchedLast()) showTip(el, k, isSup); });
      btn.addEventListener('blur', hideTip);
      longPress(btn, () => showTip(el, k, isSup), hideTip);
    }
    return { el, main, sup, lock, sig: '' };
  }

  function showTip(card, k, sup) {
    const s = st();
    const wave = s ? s.wave + 1 : 1;
    const lines = [
      h('div', { class: 'tip-head' }, h('b', null, nameOf(k, sup)), h('span', { class: 'tip-cost' }, `$${priceOf(k, sup)} each`)),
      h('p', null, SHOPPER_HELP[k]?.trick || ''),
    ];
    if (sup) lines.push(h('p', { class: 'tip-use' }, h('b', null, 'Super: '), SUPER_HELP[k] || '', ' Takes a double refund.'));
    const kindFrom = OFFICE.kinds[k].from, supFrom = SHOPPERS[k].sup.from;
    const facts = [`a group arrives one every ${secs(gapOf(k))}`];
    if (wave < kindFrom) facts.unshift(`can be bought from sales event ${kindFrom}`);
    else if (!sup && wave < supFrom) facts.push(`super version (${SUPERS[k].name}) from sales event ${supFrom}`);
    else if (sup && wave < supFrom) facts.unshift(`can be bought from sales event ${supFrom}`);
    else if (!sup) facts.push(`super version: $${priceOf(k, 1)} each`);
    lines.push(h('small', null, `${facts.join(' · ')} · shift-click buys as many as you can afford`));
    tip.replaceChildren(...lines);
    tip.classList.remove('hidden');
    const r = card.getBoundingClientRect();
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2))}px`;
    tip.style.bottom = `${innerHeight - r.top + 8}px`;
  }
  function hideTip() { tip.classList.add('hidden'); }

  function updateCards(s) {
    const wave = s.wave + 1;
    const editable = canEdit(s);
    const cash = left(s);
    const full = local.length >= OFFICE.maxGroups;
    setText(shopLabel, full ? `BUY SHOPPERS · ${OFFICE.maxGroups} GROUPS IS THE MOST` : `BUY SHOPPERS FOR SALES EVENT ${wave} · PRICE EACH`);
    for (const [k, c] of cards) {
      const open = canBuy(k, 0, wave), supOpen = canBuy(k, 1, wave);
      const sig = `${open},${supOpen},${editable},${full},${cash >= priceOf(k, 0)},${cash >= priceOf(k, 1)}`;
      if (sig === c.sig) continue;
      c.sig = sig;
      setClass(c.el, 'locked', !open);
      setClass(c.el, 'poor', open && cash < priceOf(k, 0));
      c.main.disabled = !editable || !open || full || cash < priceOf(k, 0);
      c.main.setAttribute('aria-label', open
        ? `${SHOPPERS[k].name}, $${priceOf(k, 0)} each. ${TRICK[k]}.`
        : `${SHOPPERS[k].name}, locked until sales event ${OFFICE.kinds[k].from}`);
      // The super button shows once the kind itself is open; until the super arrives it says when.
      setClass(c.sup, 'hidden', !open || !supOpen);
      c.sup.disabled = !editable || !supOpen || full || cash < priceOf(k, 1);
      setClass(c.sup, 'poor', supOpen && cash < priceOf(k, 1));
      setClass(c.lock, 'hidden', open && supOpen);
      c.lock.textContent = !open ? `From event ${OFFICE.kinds[k].from}` : `★ from ${SHOPPERS[k].sup.from}`;
      setClass(c.lock, 'sup-lock', open);
    }
  }

  // ---- Rows ----
  /** The timeline's length: long enough for every group, rounded to a tidy number. */
  function spanOf(groups) {
    let end = 0;
    for (const g of groups) end = Math.max(end, g.at + g.n * gapOf(g.k));
    for (const t of [20, 30, 45, 60, 90, 120, 180, 240, 300, 450, 600, 900]) if (end <= t) return t;
    return Math.ceil(end / 300) * 300;
  }

  /** How many time labels fit over the timeline column at the current screen size. */
  function axisRoom() {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return Math.max(1, Math.min(6, Math.floor(axis.clientWidth / (2.3 * rem))));
  }

  function drawAxis(span, room) {
    const step = [5, 10, 15, 20, 30, 60, 120, 300, 600].find((x) => span / x <= room) || span;
    const marks = [];
    // The track starts at the moment the doors open; the labels mark the seconds after that.
    for (let t = step; t <= span + 1e-6; t += step) {
      marks.push(h('span', { class: `plr-tick${t + 1e-6 >= span ? ' last' : ''}`, style: { left: `${(t / span) * 100}%` } }, `${t}s`));
    }
    axis.replaceChildren(...marks, h('i', { class: 'plr-now hidden' }));
  }

  /** Who an entrance belongs to: entrance n opened for player n. */
  function doorOwner(s, i) {
    const p = s.players[i];
    return { name: p ? p.name : `Entrance ${i + 1}`, color: safeColor(p && p.color) };
  }

  function render(s) {
    const editing = canEdit(s);
    const groups = editing ? local : s.phase === 'build' ? local : wavePlan || [];
    const span = spanOf(groups);
    const doors = [];
    for (let i = 0; i < s.open; i++) doors.push(doorOwner(s, i));
    const room = axisRoom();
    const sig = JSON.stringify([editing, groups, doors, left(s), span, room]);
    if (sig === rowsSig) return;
    rowsSig = sig;

    // Keep the keyboard where it was across the rebuild.
    const focusKey = rows.contains(document.activeElement) ? document.activeElement.dataset.f : null;
    const scroll = rows.scrollTop;
    drawAxis(span, room);
    rows.replaceChildren(...groups.map((g, i) => makeRow(s, g, i, editing, span, doors)));
    if (focusKey) rows.querySelector(`[data-f="${focusKey}"]`)?.focus();
    rows.scrollTop = scrollToEnd ? rows.scrollHeight : scroll;
    scrollToEnd = false;

    const count = groups.reduce((n, g) => n + g.n, 0);
    setText(planLabel, s.phase === 'build'
      ? `YOUR PLAN · ${groups.length} ${groups.length === 1 ? 'GROUP' : 'GROUPS'} · ${count} SHOPPERS`
      : `SENT THIS SALES EVENT · ${count} SHOPPERS`);
    setClass(head, 'hidden', !groups.length);
    setClass(empty, 'hidden', groups.length > 0);
    if (!groups.length) {
      empty.replaceChildren(s.phase === 'build'
        ? h('p', null, h('b', null, 'Nothing bought yet. '), 'Click a shopper on the left to add a group, then choose its entrance and when it starts. If the plan is empty when the doors open, the usual crowd comes instead and your whole budget carries over at half.')
        : wavePlan
          ? h('p', null, h('b', null, 'You bought nothing, '), 'so the usual crowd came this time. Half your budget carries over.')
          : h('p', null, 'Your plan for this sales event was sent before you arrived.'));
    }
  }

  function makeRow(s, g, i, editing, span, doors) {
    const each = priceOf(g.k, g.sup);
    const takes = g.n * gapOf(g.k);
    const door = doors[g.door] || { name: `Entrance ${g.door + 1}`, color: '#9ca3af' };
    const kind = h('span', { class: `plr-kind${g.sup ? ' sup' : ''}`, title: `${nameOf(g.k, g.sup)}: $${each} each. ${SHOPPER_HELP[g.k]?.trick || ''}` },
      portrait(g.k, g.sup, 'plr-pic'), h('b', null, g.sup ? SUP_SHORT[g.k] : SHORT[g.k]));
    const bar = h('i', {
      class: 'plr-bar',
      style: { left: `${(g.at / span) * 100}%`, width: `${Math.max(1.5, (takes / span) * 100)}%`, background: door.color },
      title: `${g.n} ${nameOf(g.k, g.sup)} through ${door.name}'s entrance, arriving from ${secs(g.at)} to ${secs(g.at + takes)} after the doors open.`,
    });
    const track = h('span', { class: 'plr-track' }, bar, h('i', { class: 'plr-now hidden' }));
    const cost = h('span', { class: 'num plr-cost', title: `${money(g.n * each)} for ${g.n}; they come in one every ${secs(gapOf(g.k))}, so the group takes ${secs(takes)} to arrive.` },
      h('b', null, money(g.n * each)), h('small', null, secs(takes)));
    if (!editing) {
      return h('div', { class: 'plr' }, kind,
        h('span', { class: 'plr-ro' }, `× ${g.n}`),
        h('span', { class: 'plr-ro plr-door-ro' }, h('i', { class: 'chip', style: { background: door.color } }), ` ${door.name}`),
        h('span', { class: 'plr-ro' }, secs(g.at)), cost, track, h('span'));
    }
    const most = maxN(s, i);
    const b = (label, f, title, onclick, disabled = false) => h('button', { type: 'button', class: 'plr-btn', 'data-f': `${f}${i}`, title, 'aria-label': title, disabled, onclick }, label);
    const nIn = h('input', {
      type: 'number', class: 'plr-in', min: '1', max: String(most), step: '1', value: String(g.n), 'data-f': `n${i}`,
      'aria-label': `How many ${nameOf(g.k, g.sup)}`, title: `How many. Most you can afford here: ${most}.`,
    });
    nIn.addEventListener('change', () => {
      const v = Math.floor(Number(nIn.value));
      if (!Number.isFinite(v)) { nIn.value = String(g.n); return; }
      const n = Math.max(1, Math.min(maxN(st(), i), v));
      nIn.value = String(n);
      if (n !== g.n) edit(i, { n });
    });
    nIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nIn.blur(); });
    const count = h('span', { class: 'plr-n' },
      b('−', 'dn', 'One fewer (Shift: ten fewer)', (e) => edit(i, { n: Math.max(1, g.n - (e.shiftKey ? 10 : 1)) }), g.n <= 1),
      nIn,
      b('+', 'up', 'One more (Shift: ten more)', (e) => edit(i, { n: Math.min(maxN(st(), i), g.n + (e.shiftKey ? 10 : 1)) }), most <= g.n),
      b('MAX', 'mx', `As many as the budget allows (${most})`, () => edit(i, { n: maxN(st(), i) }), most <= g.n));
    count.querySelector('[data-f^="mx"]').classList.add('plr-max');

    const sel = h('select', { class: 'plr-sel', 'data-f': `d${i}`, 'aria-label': 'Entrance', title: 'Which entrance this group comes in through. Each entrance belongs to a player.' },
      doors.map((d, j) => h('option', { value: String(j), selected: j === g.door ? true : null }, d.name)));
    sel.value = String(g.door);
    sel.addEventListener('change', () => edit(i, { door: Number(sel.value) }));
    const doorCell = h('span', { class: 'plr-door', style: { '--door': door.color } }, h('i', { class: 'chip', style: { background: door.color } }), sel);

    const atIn = h('input', {
      type: 'number', class: 'plr-in plr-at-in', min: '0', max: String(OFFICE.maxAt), step: '1', value: one(g.at), 'data-f': `a${i}`,
      'aria-label': 'Seconds after the doors open', title: `Seconds after the doors open that the first one arrives (0 to ${OFFICE.maxAt}).`,
    });
    atIn.addEventListener('change', () => {
      const v = Number(atIn.value);
      if (!Number.isFinite(v)) { atIn.value = one(g.at); return; }
      const at = Math.max(0, Math.min(OFFICE.maxAt, Math.round(v * 10) / 10));
      atIn.value = one(at);
      if (at !== g.at) edit(i, { at });
    });
    atIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') atIn.blur(); });
    const at = h('span', { class: 'plr-at' },
      b('−', 'ad', 'One second sooner (Shift: five)', (e) => edit(i, { at: Math.max(0, Math.ceil(g.at) - (e.shiftKey ? 5 : 1)) }), g.at <= 0),
      atIn, h('span', { class: 'plr-unit' }, 's'),
      b('+', 'au', 'One second later (Shift: five)', (e) => edit(i, { at: Math.min(OFFICE.maxAt, Math.floor(g.at) + (e.shiftKey ? 5 : 1)) }), g.at >= OFFICE.maxAt));

    const x = h('button', {
      type: 'button', class: 'plr-x', 'data-f': `x${i}`, title: 'Remove this group', 'aria-label': 'Remove this group',
      onclick: () => commit(local.filter((_, j) => j !== i), 'remove'),
    }, '×');
    return h('div', { class: 'plr' }, kind, count, doorCell, at, cost, track, x);
  }

  // ---- Every frame ----
  function update(s) {
    if (!isMine(s)) {
      planKey = '';
      hideTip();
      return;
    }
    const now = performance.now();
    if (s.phase === 'build') {
      // A new build phase (the rules have cleared the plan), or the job was just taken: start from
      // the host's copy. Otherwise the host's copy wins once he has stopped editing for a moment.
      const key = `${s.wave}`;
      if (key !== planKey) { planKey = key; local = copy(s.office.plan); editedAt = -1e9; askedAt = -1e9; }
      else if (now - editedAt > SYNC_MS && !same(local, s.office.plan)) local = copy(s.office.plan);
      lastHost = copy(s.office.plan);
    } else if (s.phase === 'wave' && waveSeen !== s.wave) {
      waveSeen = s.wave;
      // Only trust the plan if this page saw the build phase that made it.
      wavePlan = lastHost;
      waveStart = s.waveAt;
      planKey = '';
    }

    const building = s.phase === 'build';
    setClass(el, 'is-wave', !building);
    setClass(shopBox, 'hidden', !building);
    setClass(liveBox, 'hidden', building);

    // Budget box.
    const budget = budgetOf(s);
    const spent = building ? planCost(local) : planCost(wavePlan || []);
    const rest = Math.max(0, budget - spent);
    if (building) {
      setText(leftLbl, 'LEFT TO SPEND');
      setText(leftVal, money(rest));
      setText(totalLine, `Budget ${money(budget)} · spent ${money(spent)}`);
      setText(carryLine, rest > 0 ? `Half carries over: +${money(Math.round(rest * OFFICE.carry))}` : 'All spent: nothing carries over');
    } else {
      setText(leftLbl, 'CARRIES OVER');
      setText(leftVal, money(s.office.bank));
      setText(totalLine, `Spent ${money(spent)} of ${money(budget)}`);
      setText(carryLine, `Plus $${OFFICE.perRefund} for each refund`);
    }
    setStyle(meterFill, 'width', `${budget > 0 ? ((rest / budget) * 100).toFixed(1) : 0}%`);
    setClass(meterFill.parentNode, 'hidden', !building);
    setClass(leftVal, 'zero', building && rest < priceOf('clipper', 0));

    // READY button.
    const asked = building && (s.office.ready || now - askedAt < ASK_MS);
    readyBtn.disabled = !building || asked;
    setClass(readyBtn, 'asked', asked);
    setClass(readyBtn, 'nudge', building && !asked && s.storeReady);
    setClass(readyBtn, 'closed', !building);
    if (!building) {
      setText(readyMain, s.phase === 'wave' ? 'DOORS OPEN' : 'GAME OVER');
      setText(readySub, s.phase === 'wave' ? 'plan again after this one' : s.phase === 'lost' ? 'the store closed' : 'the store survived');
    } else if (asked) {
      setText(readyMain, 'READY ✓');
      setText(readySub, s.storeReady ? 'opening the doors' : 'waiting for the store');
    } else {
      setText(readyMain, 'READY');
      setText(readySub, s.storeReady ? 'the store is waiting for you' : local.length ? 'send this plan' : 'empty plan: usual crowd');
    }

    if (building) updateCards(s);
    else {
      setText(liveLabel, s.phase === 'wave' ? `YOUR SHOPPERS · SALES EVENT ${s.wave}` : `YOUR SHOPPERS · SALES EVENT ${s.wave} · GAME OVER`);
      setText(liveVal.escaped, String(s.ws.escaped));
      setText(liveVal.stopped, String(s.ws.stopped));
      setText(liveVal.coming, String(s.spawnQ.length));
      let floor = 0;
      for (const sh of s.shoppers) if (sh.st !== ST.LEAVE) floor++;
      setText(liveVal.floor, String(floor));
      setText(liveRefVal, `${s.refunds} / ${s.refundLimit}`);
      const share = Math.max(0, Math.min(1, s.refunds / s.refundLimit));
      setStyle(liveFill, 'width', `${(share * 100).toFixed(1)}%`);
      setStyle(liveFill, 'background', `hsl(${Math.round(48 - 48 * share)} 90% ${Math.round(52 - 6 * share)}%)`);
      const auto = wavePlan && !wavePlan.length;
      setText(liveNote, auto ? 'You bought nothing, so this is the usual crowd.' : s.phase === 'wave' ? `${s.waves - s.wave} sales events after this one.` : '');
    }

    render(s);

    // While the doors are open, a line on the timeline shows how far into the event it is.
    const nowLines = el.querySelectorAll('.plr-now');
    const t = s.phase === 'wave' && waveStart !== null ? (s.tick - waveStart) / 30 : null;
    const span = spanOf(s.phase === 'build' ? local : wavePlan || []);
    for (const line of nowLines) {
      setClass(line, 'hidden', t === null || t > span);
      if (t !== null) setStyle(line, 'left', `${Math.min(100, (t / span) * 100).toFixed(2)}%`);
    }
  }

  return {
    el,
    tip,
    update,
    /** Budget left for the coming sales event, as the planner sees it (null if not Head Office). */
    left: (s = st()) => (isMine(s) ? left(s) : null),
    hideTip,
  };
}
