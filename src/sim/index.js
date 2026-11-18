// Public surface of the simulation. Everything outside src/sim imports from here.
export * from './constants.js';
export { createGame, rand, addPlayer, setPlayerOnline, setMap, setSettings, cleanSettings, difficultyOf, isEndless, idxOf, inBounds, teamCash, shareCount, doorOf, footprint, anchorOf, tilesOf, sizeOf, centreOf } from './state.js';
export { MAP_SIZES, MAP_DESIGNS, DECOR, makeMap, makeZones, recommendedSize } from './maps.js';
export { TRACKS, tracksOf, defaultTrack, levelIn, maxIn, levelOf, levelCost, upgradeCost, spentOnTrack, spentOn, statsOf, rebuildDeal } from './upgrades.js';
export { getDist, getHopDist, getField, getFieldTo, modeOf, computeDist, tillBanks, banksOpen, walkable, UNREACHABLE, NORMAL, HOP, SMASH, GHOST } from './path.js';
export { applyCommand, canPlace, canUpgrade } from './commands.js';
export { step, waveSpec, beginWave, queueTrainingWave, setTrainingCash, patienceGrowth, bossTier, bossTitle, bossPatience } from './step.js';
export { priceOf, waveValue, officePlayer, canBuy, planCost, checkPlan } from './office.js';
export { applyDemoLayout, DEMO_LAYOUT } from './demo.js';
