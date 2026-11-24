// The holiday calendar: which festive outfit the bosses wear, and which jokes DEB adds about it.
// From the week before a holiday to the day after it (HOLIDAY_WINDOW), the host's own computer's
// date picks a holiday when a game is made, and it is stored in the game state (state.holiday),
// so every player sees and hears the same one, a saved game keeps it, and the bosses' outfits and
// DEB's holiday lines follow it. The simulation never looks at a clock: this file is outside
// src/sim and only the host's start-up code (src/main.js) asks it for today's holiday. The
// allowed keys are HOLIDAYS in src/sim/constants.js.

/** Days before the holiday its outfit starts, and days after it that it is still worn. */
export const HOLIDAY_WINDOW = { before: 7, after: 1 };

/**
 * Each holiday: its name, and how the boss bar says what the boss is wearing ("Regional Manager,
 * dressed as Santa"). The keys are HOLIDAYS in src/sim/constants.js, in the same order.
 */
export const HOLIDAY_INFO = {
  xmas: { name: 'Christmas', dressed: 'dressed as Santa' },
  thanksgiving: { name: 'Thanksgiving', dressed: 'dressed as a pilgrim' },
  valentine: { name: "Valentine's Day", dressed: 'dressed as Cupid' },
  july4: { name: 'the Fourth of July', dressed: 'dressed as Uncle Sam' },
  halloween: { name: 'Halloween', dressed: 'dressed as a sexy devil' },
  stpat: { name: "St. Patrick's Day", dressed: 'dressed as a leprechaun' },
  easter: { name: 'Easter', dressed: 'dressed as the Easter Bunny' },
  newyear: { name: "New Year's", dressed: "dressed for New Year's Eve" },
  mardigras: { name: 'Mardi Gras', dressed: 'dressed for Mardi Gras' },
};

/** A calendar date as a whole number of days, free of time zones and daylight saving. */
const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);

/** Easter Sunday of a year (Gregorian calendar, the anonymous algorithm in Meeus): [month, day]. */
export function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return [Math.floor(n / 31), (n % 31) + 1];
}

/** The day number of each holiday in a year. */
function holidayDays(y) {
  const [em, ed] = easterSunday(y);
  const easter = dayNumber(y, em, ed);
  // The fourth Thursday of November: November 1st's weekday (0 Sunday) tells how far the first is.
  const nov1 = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const thanksgiving = 1 + ((4 - nov1 + 7) % 7) + 21;
  return {
    xmas: dayNumber(y, 12, 25),
    thanksgiving: dayNumber(y, 11, thanksgiving),
    valentine: dayNumber(y, 2, 14),
    july4: dayNumber(y, 7, 4),
    halloween: dayNumber(y, 10, 31),
    stpat: dayNumber(y, 3, 17),
    easter,
    newyear: dayNumber(y, 1, 1),
    // Shrove Tuesday: 47 days before Easter Sunday.
    mardigras: easter - 47,
  };
}

/**
 * The date of a holiday in a year, as [year, month, day] (month 1 to 12).
 * @param {string} key a key of HOLIDAY_INFO
 */
export function holidayDate(key, y) {
  const n = holidayDays(y)[key];
  if (n === undefined) return null;
  const d = new Date(n * 86400000);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

/**
 * The holiday whose outfit is worn on a day, or null. A holiday's window is the seven days before
 * it, the day and the day after. Where two windows overlap (Christmas and New Year's), the holiday
 * whose day is nearer wins; on a tie, the one still to come.
 * @param {Date} [date] read in the computer's own time zone (default: now)
 * @returns {string|null} a key of HOLIDAY_INFO
 */
export function holidayOn(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const today = dayNumber(y, date.getMonth() + 1, date.getDate());
  let best = null, bestGap = Infinity, bestAhead = false;
  // The year before and after too: New Year's Day's window starts in December.
  for (const year of [y - 1, y, y + 1]) {
    for (const [key, day] of Object.entries(holidayDays(year))) {
      const ahead = day - today; // days until it (negative: it has passed)
      if (ahead > HOLIDAY_WINDOW.before || ahead < -HOLIDAY_WINDOW.after) continue;
      const gap = Math.abs(ahead);
      if (gap < bestGap || (gap === bestGap && ahead > 0 && !bestAhead)) {
        best = key; bestGap = gap; bestAhead = ahead > 0;
      }
    }
  }
  return best;
}

/** What the boss is wearing, as the boss bar says it ("dressed as Santa"), or '' for no holiday. */
export function outfitText(key) {
  return typeof key === 'string' && Object.hasOwn(HOLIDAY_INFO, key) ? HOLIDAY_INFO[key].dressed : '';
}

/**
 * The holiday a new game gets: one named in the page address (`&holiday=xmas`, or
 * `&holiday=none` for none) for testing, else today's.
 * @param {string|null} [asked] the address's value, if any
 */
export function holidayFor(asked = null, date = new Date()) {
  if (asked === 'none') return null;
  if (typeof asked === 'string' && Object.hasOwn(HOLIDAY_INFO, asked)) return asked;
  return holidayOn(date);
}
