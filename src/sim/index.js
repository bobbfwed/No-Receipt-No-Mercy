// Public surface of the simulation. Everything outside src/sim imports from here.
export * from './constants.js';
export { createGame, STATE_VERSION, rand, addPlayer, setPlayerOnline, setMap, setSettings, cleanSettings, cardsOn, difficultyOf, isEndless, idxOf, inBounds, teamCash, heldFor, shareCount, doorOf, footprint, anchorOf, tilesOf, sizeOf, centreOf } from './state.js';
export { MAP_SIZES, MAP_DESIGNS, DECOR, makeMap, mapSize, recommendedSize } from './maps.js';
export { tracksOf, levelIn, stockLevel, levelOf, spentOn, statsOf, rebuildDeal } from './upgrades.js';
export { getDist, getDadDist, getDadPlanDist, dadRoute, dadDecide, getField, getFieldTo, modeOf, routeOf, smashReady, computeDist, tillBanks, banksOpen, walkable, UNREACHABLE, NORMAL, DAD, SMASH, GHOST, DADPLAN } from './path.js';
export { applyCommand, canPlace, canPutBack } from './commands.js';
// Razor Wire and dads (0.4): what a building's wire covers (for any direction, to draw a preview),
// whether it is live, where all wire is, and the wire command's check. Reinforcing Crate Stacks.
export { wireTiles, wireCovers, wireLive, wireMap, carriesWire } from './wire.js';
export { canWire, canReinforce } from './commands.js';
export { reinforceCost } from './upgrades.js';
export { step, waveSpec, beginWave, queueTrainingWave, setTrainingCash, patienceGrowth, patienceFor, patienceScaleAt, crowdShiftAt, babyPace, walkPace, edgeMul, kidFirst, bossTier, bossTitle, bossPatience, pitchStop, surgeHpAt, surgeCrowdAt } from './step.js';
// Money (0.4): what beating a sales event pays, and the speed bonus on top.
export { eventPay, storePay, payHeads, speedPar, speedBonus } from './step.js';
export { priceOf, waveValue, officePlayer, canBuy, planCost, checkPlan } from './office.js';
export { applyDemoLayout, DEMO_LAYOUT } from './demo.js';
// The Midnight Release (0.3.01): which events have one, how big its mob is, and its entrance.
export { releaseNo, releaseSize, releaseDoor } from './step.js';
// The cards (0.3.01): the hand, the deal, and what each card does to the numbers.
export {
  dealCards, cleanHand, hasCard, cardKind, cardParts, cardKinds, cardsShown, revealTick, dealLength, dealTicks, DEAL_ORDER,
  idShare, cardPicks, buildPrice, cardPatience, cardSpeed, cardCrowd, cardRefund,
  // (The cards that change how shoppers behave: who they pick, by id.)
  cardKidRuns, kidBack, pupsOf, trailsFlasher, supportDog, stopsToPet, drinks, boozeChance,
} from './cards.js';
export { getBackField } from './path.js';
// The Back (0.4): the floor under the shop and its belt engine.
export { JUNK, itemCode, itemType, itemTier, dropTicks, newPart, wants, give, stepBack, canPlaceBack, overpassDirs, beltShape, feedsInto, takesFrom, addTrainingDrops } from './back.js';
export { makeDrops } from './maps.js';
// The Back's supplies (0.4, stage 3): stock on the security buildings, Dumbwaiters, the dropUp price.
export { SUPPLY_TRACKS, STOCK_TRACKS, usesPer, unitsIn, usesIn, takesSupply, addStock, useStock, useWork, syncLifts, stockCap, makeTicks, rebrandTicks } from './back.js';
export { dropUpCost } from './commands.js';
