// The training shift panel: shows the current lesson's instructions, a live hint, and the buttons
// to move through the lessons. The lessons themselves are in src/tutorial/lessons.js.
import { h, setText, setClass } from './dom.js';
import { createTutorial, STEPS } from '../tutorial/lessons.js';

const DONE_PAUSE_MS = 1300; // how long the "Done" tick shows before the next lesson appears

/**
 * @param {Object} session a HostSession running a training game
 * @param {Object} o
 * @param {(where: 'solo'|'menu') => void} o.onExit leave training
 * @param {(k: string|null) => void} o.highlight light up a build-bar button (null for none)
 * @param {(name: string) => void} [o.playSound]
 */
export function createTutorialPanel(session, { onExit, highlight, playSound = () => {} }) {
  const count = h('span', { class: 'tut-count' });
  const fill = h('i');
  const title = h('h3', { class: 'tut-title' });
  const result = h('p', { class: 'tut-result hidden' });
  const body = h('div', { class: 'tut-body' });
  const hint = h('p', { class: 'tut-hint hidden', role: 'status', 'aria-live': 'polite' });
  const tick = h('div', { class: 'tut-tick hidden', 'aria-hidden': 'true' }, '✓ Done');

  const btnBack = h('button', { type: 'button', class: 'tut-btn', onclick: () => { cancelAdvance(); tut.back(); } }, 'Back');
  const btnSkip = h('button', { type: 'button', class: 'tut-btn', title: 'Does this step for you and moves on', onclick: () => { cancelAdvance(); tut.skip(); } }, 'Skip step');
  const btnNext = h('button', { type: 'button', class: 'tut-btn tut-primary', onclick: () => { cancelAdvance(); tut.next(); } }, 'Next');
  const btnPlay = h('button', { type: 'button', class: 'tut-btn tut-primary', onclick: () => onExit('solo') }, 'Play a real game');
  const btnMenu = h('button', { type: 'button', class: 'tut-btn', onclick: () => onExit('menu') }, 'Back to menu');
  const btnMin = h('button', {
    type: 'button', class: 'tut-min', 'aria-label': 'Shrink or expand the training panel', title: 'Shrink or expand',
    onclick: () => { el.classList.toggle('min'); btnMin.textContent = el.classList.contains('min') ? '+' : '–'; },
  }, '–');

  const el = h('section', { class: 'panel tutorial', 'aria-label': 'Training' },
    h('header', { class: 'tut-head' }, h('b', null, 'TRAINING SHIFT'), count, btnMin),
    h('div', { class: 'tut-progress', role: 'presentation' }, fill),
    h('div', { class: 'tut-main' }, title, result, body, hint, tick),
    h('footer', { class: 'tut-foot' }, btnBack, btnSkip, btnNext, btnMenu, btnPlay));

  let advancing = null; // timer while the "Done" tick is showing
  let shownIndex = -1;

  function cancelAdvance() {
    if (advancing) { clearTimeout(advancing); advancing = null; }
    tick.classList.add('hidden');
    el.classList.remove('done');
  }

  function render() {
    const st = tut.step;
    if (!st) return;
    const prev = STEPS[shownIndex];
    const cameFromWave = tut.index === shownIndex + 1 && prev && prev.wave && tut.lastWave;
    shownIndex = tut.index;
    setText(count, `${tut.index + 1} of ${tut.total}`);
    fill.style.width = `${((tut.index + 1) / tut.total) * 100}%`;
    setText(title, st.title);
    body.replaceChildren(...st.text.map((p) => {
      // "Do this:" paragraphs are the actual instruction; make them stand out.
      const task = p.startsWith('Do this:');
      return h('p', { class: task ? 'tut-task' : null }, task ? h('b', null, 'Do this: ') : null, task ? p.slice(9) : p);
    }));
    if (cameFromWave) {
      const w = tut.lastWave;
      setText(result, `Last wave: ${w.stopped} stormed off, ${w.escaped} got a refund.`);
      setClass(result, 'bad', w.escaped > 0);
    }
    setClass(result, 'hidden', !cameFromWave);
    setClass(btnBack, 'hidden', tut.index === 0);
    setClass(btnSkip, 'hidden', !!st.manual);
    setClass(btnNext, 'hidden', !st.manual || !!st.last);
    setClass(btnPlay, 'hidden', !st.last);
    setClass(btnMenu, 'hidden', !st.last);
    hint.classList.add('hidden');
    el.classList.remove('min');
    btnMin.textContent = '–';
    highlight(st.tool || null);
  }

  const tut = createTutorial(session, { onChange: render });

  return {
    el,
    tutorial: tut,
    start(step = 0) {
      if (step > 0) tut.autoplay(Math.min(step, tut.total - 1)); else tut.start();
    },
    /** Tiles to highlight on the floor right now. */
    marks() {
      return advancing ? [] : tut.marks();
    },
    /** Once per animation frame. */
    tick() {
      if (advancing || !tut.step) return;
      if (tut.check()) {
        el.classList.add('done');
        tick.classList.remove('hidden');
        hint.classList.add('hidden');
        highlight(null);
        playSound('tutorial');
        advancing = setTimeout(() => { advancing = null; tick.classList.add('hidden'); el.classList.remove('done'); tut.next(); }, DONE_PAUSE_MS);
        return;
      }
      const text = tut.hint();
      setClass(hint, 'hidden', !text);
      if (text) setText(hint, text);
    },
    destroy() { cancelAdvance(); tut.destroy(); },
  };
}
