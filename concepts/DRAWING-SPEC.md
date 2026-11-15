# Drawing spec for concept mock-up screens

Each concept in `concepts.js` has two screens. Each screen is one hand-written SVG file that should look like a **screenshot of a finished game in the middle of play**. These are shown to the project owner so he can pick which game ideas to pursue.

## Files
- Write `concepts/<slug>/screen1.svg` and `concepts/<slug>/screen2.svg`. Touch nothing else, except preview images in `concepts/_check/`.
- Root element: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">`. No width/height attributes.
- Fully self-contained: no external images, fonts, links, scripts or CSS imports. No `<foreignObject>`.
- Fonts: system fonts only, always with a fallback, e.g. `font-family="Segoe UI, Arial, sans-serif"`. Impact, Georgia, Consolas and Comic Sans MS are fine for flavour.
- Keep each file under about 45 KB. Use `<defs>` with `<symbol>`/`<use>`, `<pattern>` and gradients to repeat units, tiles and belts instead of copying shapes.

## What to draw
- Follow the screen's `draw` note in `concepts.js` closely. It lists what must be visible. Use the concept's `palette`, `pitch` and `feature` for context.
- Fill the whole 1280x720 frame with the game world. It must read as a game screenshot, not a wireframe, diagram or slide. No large empty areas.
- Style: flat, bold cartoon vector art with thick dark outlines, chunky shapes and simple faces. Give characters expressions. Lots of small detail: where the note says 25+ enemies, draw that many.
- HUD: draw it as a real game interface (semi-opaque panels, icons next to numbers, coloured player chips, buttons with prices). Use the exact numbers and labels from the note.
- Insult bubble: every screen has one line marked "saying exactly". Copy that line word for word, in a clear speech bubble with the speaker's portrait. It is the joke, so make it prominent and easy to read (18px or larger).
- Do not draw characters, logos or art from any existing game, show or brand, and no real people. No explicit nudity.

## Text rules (the most common failure)
- Minimum font size 13px; body text 15px or more.
- SVG text does not wrap. Break long lines yourself with `<tspan x=".." dy="..">`. Estimate width as `0.55 x font-size x characters` (0.6 for bold) and keep every line inside its box with at least 10px padding.
- Text must never overlap other text or run off the frame. Put a solid or semi-opaque panel behind text that sits over busy art.
- Escape `&` as `&amp;` and `<` as `&lt;` inside text. Curly quotes and the star characters are fine as literal UTF-8.

## Check your work (required)
Render each file to a PNG and look at it:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Apps\browser game\concepts\render.ps1" -Svg "C:\Apps\browser game\concepts\<slug>\screen1.svg" -Out "C:\Apps\browser game\concepts\_check\<slug>-screen1.png"
```

Then open the PNG with the Read tool and inspect it. Fix anything wrong: a blank or broken render (usually an XML error), text spilling out of a box, overlapping labels, unreadable text, missing items from the `draw` note, big empty areas. Render again after each fix. Do at least one render per screen and at most four rounds of fixes.

## Report back (short)
- Status: done / partial / blocked
- Files written
- Number of render rounds per screen, and anything from the `draw` note you left out or could not get right
