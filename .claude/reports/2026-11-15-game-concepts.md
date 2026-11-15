# Game concepts: twelve ideas with mock-up screens

Date: 2026-11-15

## Needs your attention

- **Your decision is the next step.** Open `concepts/index.html` in a browser, mark each concept Yes / Maybe / No, add notes, press "Copy my picks" and paste the result back to Claude. Nothing further is planned until you choose.
- **Git identity.** Git had no name or email configured on this machine, so commits would have failed. I set them for this repository only: name `BNimon`, email your work address. Change with `git config user.name "..."` if you want a different name on the history.
- **Branch.** The first commit (CLAUDE.md) is on `main`. All concept work is on a branch named `concepts`, which is the branch currently checked out. Nothing was pushed or pulled.
- **CLAUDE.md.** While I was working you replaced CLAUDE.md with a template, so I filled in that template rather than my first version. Under "Ownership and change scope" I picked the "you are the owner and maintainer" option; change it if that is wrong.
- **Worker types.** The `builder`, `engineer`, `scout` and other worker files exist in `~/.claude/agents/` but were not available in this session (they were probably created after it started). I used general-purpose workers pinned to Sonnet instead, which is the same model. A new session should pick the named workers up.
- `c:\Apps\shared-libs` was added as a working directory but does not exist on disk. I did not need it.

## Outline

### 1. Twelve concepts are ready to review in one gallery page
`concepts/index.html` shows every concept with two mock-up screens, the pitch, the one feature that sets it apart, the goal, who does what, and sample insults. The screens are drawings of what the game could look like, not playable. Each card has Yes / Maybe / No buttons and a notes box; your marks are saved in the browser.

| # | Concept | Type | What makes it different |
|---|---|---|---|
| 1 | Returns Department | core | The factory is the maze the enemies walk through |
| 2 | HOA: Hostile Owners Association | core | Dig your own mine under the lawn; one elevator is the bottleneck |
| 3 | Gary's Insides | core | You are a 39-year-old's immune system and vote on his next bad decision |
| 4 | Farewell Tour | core | The base is a convoy of trailers you can reorder or cut loose |
| 5 | Peasants Are a Resource | core | Workshops and towers share the same 40 peasants |
| 6 | Meemaw's Roadkill BBQ | core | Kills feed the kitchen, and the kitchen feeds the towers |
| 7 | Nine Circles, One Fuse Box | core | One shared power grid; the game announces who blew the fuse |
| 8 | Worst Contact | wild | Reverse tower defense: you build and steer the waves |
| 9 | The Big Unit | wild | Everyone crews one giant robot, a room each |
| 10 | Alimony Station | wild | Factory players at base, action players out in rovers |
| 11 | Dead Men Tell Dick Jokes | big map | Isometric island; supplies travel by mule cart to three far-apart harbours |
| 12 | Zeus Is Not Helping | big map | Isometric mountain; forges at the top, the war at the bottom |

"Core" means tower defense plus automated production, as in your original idea. "Wild" stretches the brief. "Big map" is the pair you asked for mid-task: large isometric maps where each player scrolls to a different area, with a minimap showing where everyone is looking.

### 2. All 24 screens were checked by me, not just by the workers
- Every screen was re-rendered in headless Edge and looked at: 24 of 24 render, with text inside its boxes and the joke lines word for word.
- XML validity check over all 24 drawings: 24 valid, 0 invalid, 0 external links.
- One defect was found and fixed: concept 9's second screen had a one-character XML error from a worker's last edit and showed an error page. Fixed and re-checked.
- Weakest screen: concept 7's ring map is crowded. It is readable and shows the idea; I left it, since these are throwaway mock-ups.

### 3. CLAUDE.md now carries the project brief and git rules
It records what the game is (browser, one friend hosts, 1 to 6 players, tower defense plus automation, specialist roles), the adult tone, the current stage (concept selection, no detailed design yet), and the git rules: keep the folder under git, commit after every round of changes, never push or pull.

### 4. How the work was split
I wrote all twelve concepts and the gallery page myself. Twelve Sonnet workers drew the screens in parallel, one concept each, in separate folders. Total worker usage was about 1.17 million tokens.

## What changed (files)
- `CLAUDE.md` - project brief, tone, stage, git rules.
- `.gitignore` - ignores preview images in `concepts/_check/`.
- `concepts/concepts.js` - the text for all twelve concepts.
- `concepts/index.html` - the gallery page.
- `concepts/NN-name/screen1.svg`, `screen2.svg` - the 24 mock-up drawings.
- `concepts/DRAWING-SPEC.md`, `concepts/render.ps1` - the drawing rules given to workers and the script that renders a drawing to a PNG for checking. Only needed if screens are redrawn.

Commits on branch `concepts`: concept briefs and gallery; ten concepts' screens; two big-map concepts and this report.

## How to verify
Open `concepts/index.html` in any browser (double-click it; no server needed). All twelve cards should show two drawn screens each. Click a screen to enlarge it.

## Suggested next steps
1. Mark your picks in the gallery and paste them back.
2. If two or three ideas are close, say which parts to combine (for example the map idea from one with the insulter from another) and I will draw one merged concept before any planning.
3. Once one concept is chosen, the next round is the in-depth plan: core loop, the two or three roles in detail, and how one player hosts for the others.
