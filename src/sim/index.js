// Public surface of the simulation. Everything outside src/sim imports from here.
export * from './constants.js';
export { createGame, rand, addPlayer, setPlayerOnline, idxOf, inBounds, teamCash, shareCount, doorOf } from './state.js';
export { MAP_SIZES, MAP_DESIGNS, makeMap, makeZones, recommendedSize } from './maps.js';
export { levelOf, upgradeCost, spentOn, statsOf } from './upgrades.js';
export { getDist, getHopDist, getField, getFieldTo, modeOf, computeDist, walkable, UNREACHABLE, NORMAL, HOP, SMASH, GHOST } from './path.js';
export { applyCommand, canPlace, canUpgrade } from './commands.js';
export { step, waveSpec, beginWave, queueTrainingWave, setTrainingCash } from './step.js';
export { priceOf, waveValue, officePlayer, canBuy, planCost, checkPlan } from './office.js';
export { applyDemoLayout, DEMO_LAYOUT } from './demo.js';
