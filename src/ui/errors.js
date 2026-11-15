// Shows any uncaught error or unhandled promise rejection as a red banner across the top of the
// page, so problems are obvious to players and to automated screenshots alike.
// index.html loads this file as its own module before main.js, so it still works if main.js
// (or anything it imports) fails to load.

let banner = null;
const seen = new Map(); // message -> its row in the banner

function ensureBanner() {
  if (banner && banner.isConnected) return banner;
  banner = document.createElement('div');
  banner.className = 'err-banner';
  banner.setAttribute('role', 'alert');
  const head = document.createElement('div');
  head.className = 'err-head';
  const title = document.createElement('strong');
  title.textContent = 'Something broke. Not your fault, for once.';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Dismiss';
  close.addEventListener('click', () => { banner.remove(); seen.clear(); });
  head.append(title, close);
  banner.append(head);
  (document.body || document.documentElement).append(banner);
  return banner;
}

/** Puts an error message in the banner. The same message twice gets a counter, not a new line. */
export function showError(err) {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const where = err instanceof Error && err.stack ? String(err.stack).split('\n').slice(1, 3).join(' | ').trim() : '';
  const b = ensureBanner();
  const old = seen.get(text);
  if (old && old.isConnected) {
    old.dataset.n = String(Number(old.dataset.n || 1) + 1);
    old.querySelector('.err-count').textContent = ` (x${old.dataset.n})`;
    return;
  }
  const row = document.createElement('div');
  row.className = 'err-row';
  const msg = document.createElement('code');
  msg.textContent = text;
  const count = document.createElement('span');
  count.className = 'err-count';
  row.append(msg, count);
  if (where) {
    const w = document.createElement('small');
    w.textContent = where;
    row.append(w);
  }
  b.append(row);
  seen.set(text, row);
  // Keep the banner short: at most five distinct errors.
  const rows = b.querySelectorAll('.err-row');
  if (rows.length > 5) rows[0].remove();
}

if (!globalThis.__rdErrorsInstalled) {
  globalThis.__rdErrorsInstalled = true;
  addEventListener('error', (e) => {
    // Resource load failures (a missing script) arrive here with a target but no error object.
    if (e.error) showError(e.error);
    else if (e.message) showError(e.message);
    else if (e.target && e.target !== window && (e.target.src || e.target.href)) {
      showError(`Could not load ${e.target.src || e.target.href}`);
    }
  }, true);
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    showError(r instanceof Error ? r : `Unhandled promise rejection: ${String(r)}`);
  });
}
