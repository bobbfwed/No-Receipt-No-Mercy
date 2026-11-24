// The tutorial and help text are written for a mouse and keyboard. On a touch screen the same
// text is passed through forTouch(), which swaps the keyboard and mouse instructions for what
// the player actually has: the buttons in the bar and the sheet that opens when a building is
// tapped. Keeping it in one place means the lessons are written once.
//
// If you add a lesson that mentions a key, add its touch wording here; test/tutorial.test.js
// fails if any lesson or help text still mentions a key or the mouse after forTouch().

const RULES = [
  // Whole instructions first, most specific to least.
  [/Press Esc to put your tool away, point at the ([^.,]+?),? and press R until/g, 'Tap DROP to put your tool away, tap the $1, and tap Rotate until'],
  [/\(press B to rebuild it\)/g, '(the Rebuild button in the bar puts it back)'],
  [/Move the view with W, A, S and D, zoom with the mouse wheel, press F to see the whole floor and H to go back to your entrance\./g, 'Drag the floor with nothing picked to move the view, pinch with two fingers to zoom, tap MAP to see the whole floor and HOME to go back to your entrance.'],
  [/point at each of the two Sprinklers beside the gap and press U three times, until both show Damage (\d+\/\d+)\. \(Or click a Sprinkler and use its Damage button\.\)/g, 'tap each of the two Sprinklers beside the gap and tap its Damage button three times, until both show Damage $1.'],
  [/Point at the highlighted Sprinkler and press U\./g, 'Tap the highlighted Sprinkler and tap its Damage button.'],
  // Part 2 of the training: the forklift upgrade and the Rebuild button.
  [/point at the Forklift you just built past the gap and press U twice, until it shows Damage (\d+\/\d+)\. \(Or click it and use its Damage button\.\)/g, 'tap the Forklift you just built past the gap and tap its Damage button twice, until it shows Damage $1.'],
  [/Point at the highlighted Forklift and press U\./g, 'Tap the highlighted Forklift and tap its Damage button.'],
  [/Press B \(or the Rebuild button in the build bar\)/g, 'Tap the Rebuild button in the bar'],
  [/press B \(or the Rebuild button in the build bar\)/g, 'tap the Rebuild button in the bar'],
  [/Click a building and choose what to upgrade\./g, 'Tap a building and choose what to upgrade.'],
  [/press R before placing to turn it\./g, 'use the rotate button at the end of the bar before placing to turn it.'],
  [/drag belt over it again in the new direction, or point at it and press R\./g, 'drag belt over it again in the new direction, or tap it and choose Rotate.'],
  [/Press the mouse button on the first highlighted tile, drag straight down to the last one, and let go\./g, 'Put your finger on the first highlighted tile, drag straight down to the last one, and lift it.'],
  [/Press R until the arrow on the preview points DOWN\./g, 'Tap the rotate button at the end of the bar until its arrow points DOWN.'],
  [/Press R before placing to choose the side\./g, 'Use the rotate button at the end of the bar before placing to choose the side.'],
  [/\(press R to turn it\)/g, '(the rotate button at the end of the bar turns it)'],
  [/Press it \(or B\) once\./g, 'Tap it once.'],
  [/ \(Shift\+B, or its switch in the top bar\)/g, ' (its switch is in the top bar, under ☰ on a phone)'],
  [/Shift\+B switches on auto-rebuild/g, 'The AUTO-REBUILD switch in the top bar (under ☰ on a phone) turns on auto-rebuild'],
  [/Click or drag over buildings\. Right-clicking does the same without picking this tool\./g, 'Tap or drag over buildings. Tapping a building with nothing picked also offers Remove.'],
  [/right-click the highlighted belt to remove it/gi, 'tap the highlighted belt and choose Remove'],
  [/right-click the highlighted belt/gi, 'tap the highlighted belt and choose Remove'],
  [/Right-click it to remove it/g, 'Tap it and choose Remove'],
  [/Right-click to remove/g, 'Tap, then Remove'],
  // "(or press 2)", "(press 7)": the number keys.
  [/ \((?:or )?press \d\)/g, ''],
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
