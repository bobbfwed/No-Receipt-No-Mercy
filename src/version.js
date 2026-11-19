// The game's version, shown on the menu so players can tell which build they are looking at
// (and whether the published site has caught up with the latest push).
//   VERSION  changes when the game changes in a big way. The owner decides when.
//   RELEASE  goes up by one with every commit that changes the game. Shown after the version
//            with two digits: version 0.1, release 7 reads "0.1.07". It starts again at 1
//            when VERSION changes.
export const VERSION = '0.2';
export const RELEASE = 9;

/** The whole thing as text, e.g. "0.1.07". */
export const versionText = () => `${VERSION}.${String(RELEASE).padStart(2, '0')}`;
