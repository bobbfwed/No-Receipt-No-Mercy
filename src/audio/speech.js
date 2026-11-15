// DEB's voice: the browser's built-in speech synthesis, set up to sound like a bored automated
// phone system (an English female voice if there is one, a bit fast, a bit low).
// Only ever one line at a time: a new line cancels the old one, nothing queues up.
// Everything is feature-detected; without speech synthesis every call quietly does nothing.

/** Words for symbols worth keeping; everything else that speech engines read out badly goes. */
export function cleanForSpeech(text) {
  return String(text ?? '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent')
    .replace(/[*_#~^|<>[\]{}\\=+`@]/g, ' ')
    .replace(/\//g, ' ')
    .replace(/\.{2,}/g, '... ')
    .replace(/\s+/g, ' ')
    .replace(/ ([?!.,:;])/g, '$1')
    .trim();
}

// Voice names that are female on common systems (Windows, macOS, Android, Chrome's own voices).
const FEMALE = /female|woman|zira|hazel|susan|aria|jenny|libby|sonia|emma|michelle|natasha|clara|samantha|victoria|karen|moira|tessa|fiona|serena|kate|allison|ava|nicky|catherine|google uk english female|google us english/i;

function chooseVoice(list) {
  const en = list.filter((v) => /^en([-_]|$)/i.test(v.lang || ''));
  const score = (v) => (FEMALE.test(v.name) ? 4 : 0) + (v.localService ? 2 : 0) + (/^en[-_](GB|US)/i.test(v.lang) ? 1 : 0);
  return en.sort((a, b) => score(b) - score(a))[0] || null;
}

/**
 * Returns { available, say(text, volume, hooks), cancel(), destroy() }.
 * hooks.onStart() / hooks.onEnd() are called around the line (onEnd exactly once per line, even
 * if the browser never reports the end; used to duck the music while she talks).
 */
export function createDebVoice() {
  const synth = globalThis.speechSynthesis;
  const Utterance = globalThis.SpeechSynthesisUtterance;
  const available = !!(synth && Utterance);
  let chosen = null;
  let current = null; // { u, finish, timer }

  const pick = () => {
    try { chosen = chooseVoice(synth.getVoices() || []); } catch { chosen = null; }
  };
  if (available) {
    pick();
    try { synth.addEventListener('voiceschanged', pick); } catch { /* old browsers */ }
  }

  function stopCurrent() {
    if (!current) return;
    const c = current;
    current = null;
    clearTimeout(c.timer);
    c.finish();
  }

  function cancel() {
    stopCurrent();
    if (!available) return;
    try { synth.cancel(); } catch { /* ignore */ }
  }

  function say(text, volume = 1, hooks = {}) {
    if (!available) return;
    const line = cleanForSpeech(text);
    if (!line) return;
    cancel();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { hooks.onEnd && hooks.onEnd(); } catch { /* ignore */ }
    };
    try {
      const u = new Utterance(line);
      if (chosen) { u.voice = chosen; u.lang = chosen.lang; } else u.lang = 'en-GB';
      u.rate = 1.12;
      u.pitch = 0.85;
      u.volume = Math.max(0, Math.min(1, volume));
      const entry = { u, finish, timer: 0 };
      const end = () => { if (current === entry) { clearTimeout(entry.timer); current = null; } finish(); };
      u.onend = end;
      u.onerror = end;
      // Some browsers never fire onend; give up waiting after a generous estimate of the length.
      entry.timer = setTimeout(end, 2000 + line.length * 90);
      current = entry;
      try { hooks.onStart && hooks.onStart(); } catch { /* ignore */ }
      synth.speak(u);
    } catch {
      current = null;
      finish();
    }
  }

  function destroy() {
    cancel();
    if (available) {
      try { synth.removeEventListener('voiceschanged', pick); } catch { /* ignore */ }
    }
  }

  return { available, say, cancel, destroy };
}
