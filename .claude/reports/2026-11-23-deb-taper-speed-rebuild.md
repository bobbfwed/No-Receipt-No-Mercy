# History rewrite, quieter DEB, 5x speed, auto-rebuild and the REBUILD button (releases 0.2.14 and 0.2.15)

## Needs your attention
- **Three commits are not pushed**: auto-rebuild, the REBUILD button, and a release bump to 0.2.15. GitHub has everything up to the 5x speed commit (0.2.14). A normal push works now.
- **The release is 0.2.15, not 0.2.14, for the last two features.** You pushed 0.2.14 while they were being built, so by the once-per-push rule they belong to the next release. Their two commit subjects still end with "(0.2.14)". They are unpushed, so I can reword them if you say so (that is a history rewrite, so I did not do it unasked).
- **Auto-rebuild can throw away upgrades when cash is short.** Like the B key, a rebuild with too little money brings the building back with only the upgrades the player can afford; the rest are lost. Auto-rebuild does this as soon as he has half the building's base price, where a player might have waited. Tell me if auto-rebuild should wait for the full price instead.
- **DEB's "doors opening" line and ten-second warning now fade too**, so late in the game she often says neither. Say so if the ten-second warning should always be spoken.
- **Not tried on a real phone or touch screen.** The phone-width screenshot looks right, but nobody has tapped it.
- The local branch `backup/before-version-rewrite` (the history before the rewrite) can be deleted now that the rewritten history is on GitHub.
- The TO-DO in `CLAUDE.md` still holds your holiday-outfits item marked "Do not do now"; it was left alone.

## What was done
1. **History rewrite.** The six commits after the licence commit all name release 0.2.13, and none sets the release above 13. The files at the end were identical to before the rewrite. You have since force-pushed it.
2. **DEB gets quieter as the game goes on (0.2.14).** Each kind of notification is always said the first time; each time it is said its chance drops to 0.8 of what it was (0.85 when passed over), down to 2% (25% for dads, many escapes and a few others). Jokes: every joke told cuts all joke chances to 0.92, down to 15%. Never reduced: bosses, winning and losing, the refund limit getting close, players joining or leaving, Head Office, first appearance of a shopper kind. Measured in bot games: notifications per event around event 30 fell from 4.0 to 0.7, jokes from 0.62 to 0.16.
3. **5x speed (0.2.14).** The speed buttons are 1x, 2x, 3x, 5x. The host's limit on steps per frame went from 400 to 450 and the clients' from 120 to 200 so both keep up.
4. **Auto-rebuild switch (0.2.15).** Per player, off by default, in the top bar (under the menu button on a phone) and on Shift+B. While on, the host rebuilds that player's wrecked buildings with the same checks and price as B, never sooner than 2 seconds of game time after the break, oldest first, retrying until it is allowed. B itself is unchanged and has no delay.
5. **Big REBUILD button (0.2.15).** Whenever something of the player's is wrecked, an orange button floats at the bottom middle of the floor with the count and price, and a second auto-rebuild switch beside it. It greys out with the reason (for example "Too broke. Need $40") when a rebuild is refused.

## Test results
- `node --test`: 299 pass, 0 fail (rerun by me after the last commit).

## Screenshots
- Desktop: `.claude/reports/img/2026-11-23-rebuild-button-desktop.png`
- Phone width, greyed "Too broke" state: `.claude/reports/img/2026-11-23-rebuild-button-phone.png` (the negative cash and squashed top bar come from the temporary hack used to wreck buildings for the picture, not from the game).

## How to verify
1. Click 5x during a late event and watch that it stays smooth.
2. With auto-rebuild on, let a gym bro smash a crate: shoppers should pass the hole for 2 seconds, then it closes.
3. Check the REBUILD button appears, greys out with a reason when you are broke, and that B still rebuilds at once.
4. On a phone, check the button's position and that it is easy to tap.

## Files changed
Mainly `src/content/director.js` (DEB), `src/sim/commands.js`, `step.js`, `state.js`, `constants.js` (auto-rebuild), `src/net/session.js` (5x), new `src/ui/rebuild.js` plus `hud.js`, `input.js`, `buildbar.js`, `game.js`, `overlays.js`, `src/style.css` (controls), help, tutorial and DEB lines, `docs/architecture.md`, `PLAN.md`, `CLAUDE.md`, new `test/autorebuild.test.js` and additions to other tests.

Workers: two general-purpose workers on Opus (DEB: about 146,000 tokens; the three features: about 264,000 tokens). The conductor (Fable) did the history rewrite and the release bump itself, wrote the scopes, reran the tests and looked at the two screenshots; it did not read the feature diffs line by line.
