// Public surface of the simulation. Everything outside src/sim imports from here.
export * from './constants.js';
export { createGame, migrateSave, STATE_VERSION, rand, addPlayer, setPlayerOnline, setMap, setSettings, cleanSettings, cardsOn, difficultyOf, isEndless, idxOf, inBounds, teamCash, heldFor, shareCount, doorOf, footprint, anchorOf, tilesOf, sizeOf, centreOf } from './state.js';
export { MAP_SIZES, MAP_DESIGNS, DECOR, makeMap, makeZones, mapSize, recommendedSize } from './maps.js';
export { TRACKS, tracksOf, defaultTrack, levelIn, maxIn, levelOf, levelCost, upgradeCost, spentOnTrack, spentOn, statsOf, rebuildDeal } from './upgrades.js';
export { getDist, getHopDist, getField, getFieldTo, modeOf, routeOf, smashReady, computeDist, tillBanks, banksOpen, walkable, UNREACHABLE, NORMAL, HOP, SMASH, GHOST } from './path.js';
export { applyCommand, canPlace, canUpgrade, canPutBack } from './commands.js';
export { step, waveSpec, beginWave, queueTrainingWave, setTrainingCash, patienceGrowth, patienceFor, patienceScaleAt, crowdShiftAt, babyPace, walkPace, edgeMul, kidFirst, bossTier, bossTitle, bossPatience, pitchStop, surgeHpAt, surgeCrowdAt } from './step.js';
export { priceOf, waveValue, officePlayer, canBuy, planCost, checkPlan } from './office.js';
export { applyDemoLayout, DEMO_LAYOUT } from './demo.js';
// The Midnight Release (0.3.01): which events have one, how big its mob is, and its entrance.
export { releaseNo, releaseSize, releaseDoor } from './step.js';
// The cards (0.3.01): the hand, the deal, and what each card does to the numbers.
export {
  dealCards, cleanHand, hasCard, cardKind, cardParts, cardKinds, cardsShown, revealTick, dealLength, dealTicks, DEAL_ORDER,
  idShare, cardPicks, buildPrice, cardPatience, cardSpeed, cardCrowd, cardSell, cardRefund,
  // (The cards that change how shoppers behave: who they pick, by id.)
  cardKidRuns, kidBack, pupsOf, trailsFlasher, supportDog, stopsToPet, drinks, boozeChance,
} from './cards.js';
export { getBackField } from './path.js';
// The Back (0.4): the floor under the shop and its belt engine.
export { JUNK, itemCode, itemType, itemTier, dropTicks, newPart, wants, give, stepBack, canPlaceBack, overpassDirs, beltShape } from './back.js';
export { makeDrops } from './maps.js';
export { freeWorth } from './upgrades.js';
