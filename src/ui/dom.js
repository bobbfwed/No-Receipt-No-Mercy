// Small DOM helpers. Text from the network always goes in through textContent, never as HTML.

/**
 * Creates an element.  h('button', { class: 'x', onclick: fn }, 'Label', childEl)
 * Props: class, style (object), on<event> (function), html (trusted markup only), anything else
 * becomes an attribute (true -> empty attribute; false/null/undefined -> left out).
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Sets text only when it changed, so per-frame updates do not churn the DOM. */
export function setText(el, text) {
  const t = String(text);
  if (el.textContent !== t) el.textContent = t;
}

/** Toggles a class only when needed. */
export function setClass(el, name, on) {
  if (el.classList.contains(name) !== !!on) el.classList.toggle(name, !!on);
}

/** Sets an inline style property only when it changed. */
export function setStyle(el, prop, value) {
  if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
}

// Dollars, "$1,234". The panels ask for the same few figures every frame, and a slowed-down phone
// spent a tenth of its busy time here when each call made a new number formatter
// (toLocaleString does; the stutter investigation of 2026-11-26). So one formatter is made once,
// and the last few hundred answers are kept.
const DOLLARS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const MONEY_KEEP = 256;
const moneyMemo = new Map();
export function money(n) {
  const v = Math.floor(n);
  let s = moneyMemo.get(v);
  if (s === undefined) {
    // (NaN and the infinities are formatted like any number, as toLocaleString did.)
    s = `$${DOLLARS.format(v)}`;
    if (moneyMemo.size >= MONEY_KEEP) moneyMemo.clear();
    moneyMemo.set(v, s);
  }
  return s;
}

/** Ticks (30 a second) as m:ss. */
export function clock(ticks) {
  const s = Math.max(0, Math.ceil(ticks / 30));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A colour from the network, accepted only if it is a plain hex colour. */
export function safeColor(c, fallback = '#9ca3af') {
  return typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback;
}

/** Copies text to the clipboard, with an old-fashioned fallback for plain http pages. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', left: '-1000px', top: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** A copy button that says "Copied" for a moment. */
export function copyButton(getText, label = 'Copy') {
  const btn = h('button', { type: 'button', class: 'btn-copy', 'aria-label': 'Copy room code' }, label);
  btn.addEventListener('click', async () => {
    const ok = await copyText(getText());
    btn.textContent = ok ? 'Copied' : 'Select it yourself';
    setTimeout(() => { btn.textContent = label; }, 1600);
  });
  return btn;
}

const NAME_KEY = 'returns-dept-name';
export function loadName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
export function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode: forget it */ }
}
