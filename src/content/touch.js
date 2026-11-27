// The tutorial and help text are written for a mouse and keyboard. On a touch screen the same
// text is passed through forTouch(), which swaps the keyboard and mouse instructions for what
// the player actually has: the buttons in the bar and the sheet that opens when a building is
// tapped. Keeping it in one place means the lessons are written once.
//
// If you add a lesson that mentions a key, add its touch wording here; test/tutorial.test.js
// fails if any lesson or help text still mentions a key or the mouse after forTouch().

const RULES = [
  // Whole instructions first, most specific to least.
  // The training shift's hints (0.3.03 follow-up): a building facing the wrong way, or something else
  // on a marked tile, is fixed through its card, and a finger holding a tool would build instead.
  [/Put down what you are holding \(Esc, or click its button again\), click the ([^,]+), and click ⟳ Rotate on its card/g, 'Tap DROP if you are holding something, tap the $1, and tap ⟳ Rotate on its card'],
  [/Something else is on the highlighted tile\. Right-click it to remove it,/g, 'Something else is on the highlighted tile. Tap DROP if you are holding something, then tap it and tap ✕ Remove,'],
  [/\(press B to rebuild it\)/g, '(the Rebuild button in the bar puts it back)'],
  [/Move the view with W, A, S and D, zoom with the mouse wheel, press F to see the whole floor and H to go back to your entrance\./g, 'Drag the floor with nothing picked to move the view, pinch with two fingers to zoom, tap MAP to see the whole floor and HOME to go back to your entrance.'],
  // Part 2 of the training: the Rebuild button.
  [/Press B \(or the Rebuild button in the build bar\)/g, 'Tap the Rebuild button in the bar'],
  [/press B \(or the Rebuild button in the build bar\)/g, 'tap the Rebuild button in the bar'],
  [/press R before placing to turn it\./g, 'use the rotate button at the end of the bar before placing to turn it.'],
  [/Press R before placing to turn it\./g, 'Use the rotate button at the end of the bar before placing to turn it.'],
  [/(drag|lay) belt over it again in the new direction, or point at it and press R\./g, '$1 belt over it again in the new direction.'],
  // Q puts down whatever is held (0.4.01); a finger has DROP at the end of the bar.
  [/ Right-click takes it off, and Q puts the tool down\./g, ' Tapping on round to off takes it off, or tap the building with nothing picked and use its card. ✋ DROP at the end of the bar puts the tool down.'],
  [/ Q puts the tool down\./g, ' ✋ DROP at the end of the bar puts the tool down.'],
  [/ Q puts down whatever you are holding\./g, ' ✋ DROP at the end of the bar puts down whatever you are holding.'],
  // Belt lines (0.4.01): press, drag, release.
  [/([Pp])ress on the first tile, drag to the last, let go/g, '$1ress a finger on the first tile, drag to the last, lift'],
  // (A big building in the wrong place or lying the wrong way: the training shift's hint, 0.3.03.)
  [/press R until the arrow on the preview points (\w+)/g, 'tap the rotate button at the end of the bar until its arrow points $1'],
  [/Press it \(or B\) once\./g, 'Tap it once.'],
  [/Click or drag over buildings\. Right-clicking does the same without picking this tool\./g, 'Tap a building to remove it, or slide your finger onto it and lift. Tapping a building with nothing picked also offers Remove.'],
  // The Wire tool's card (0.4): a tap steps the wire round, and round to off.
  [/ Right-click takes it off\./g, ' Tapping on round to off takes it off, or tap the building with nothing picked and use its card.'],
  // The training shift in The Back (0.4): the floor switch, and parts, which have no card on a
  // finger, so they come out with the Remove tool and go down again the right way round.
  [/\b[Pp]ress Tab \(or ([A-Z ]+), bottom right of the floor\)/g, 'Tap $1 (bottom right of the floor)'],
  [/[Rr]ight-click the highlighted (\w+) to take it out/g, 'Tap Remove in the bar, then tap the highlighted $1, to take it out'],
  [/Point at it with nothing held and press R to turn it\./g, 'Tap Remove in the bar, tap it, and place it again the right way round.'],
  [/Right-click it to remove it/g, 'Tap it and choose Remove'],
  [/Right-click to remove/g, 'Tap, then Remove'],
  // "(or press 2)", "(press 7)": the number keys (and - and =, the Laser's and the Salesman's), and
  // since 0.4 the letters of the Wire and Reinforce tools: "(or press Z)", "(press U)".
  [/ \((?:or )?press [\dA-Z=-]\)/g, ''],
  // What is left: single words.
  [/\bclicking\b/g, 'tapping'], [/\bClicking\b/g, 'Tapping'],
  [/\bclick\b/g, 'tap'], [/\bClick\b/g, 'Tap'],
  [/\bpoint at\b/g, 'tap'], [/\bPoint at\b/g, 'Tap'],
];

/** The same instruction, worded for a touch screen. */
export function forTouch(text) {
  let out = String(text);
  for (const [from, to] of RULES) out = out.replace(from, to);
  return out;
}

/** True on a device whose main pointer is a finger. */
export const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Words text for the device it is shown on. */
export const worded = (text) => (isTouch() ? forTouch(text) : text);

/** How a building is placed by touch (0.3.03), for the held building's card in the bar on a touch
 *  screen. (The training shift words its own lessons.) */
export const PLACE_BY_TOUCH = 'Tap the floor to build it there, or drag it (straight out of the bar too): it rides above your finger.';
