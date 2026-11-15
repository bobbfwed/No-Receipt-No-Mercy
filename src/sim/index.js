// Public surface of the simulation. Everything outside src/sim imports from here.
export * from './constants.js';
export { createGame, rand, addPlayer, setPlayerOnline, idxOf, inBounds } from './state.js';
export { getDist, getHopDist, getField, modeOf, computeDist, walkable, UNREACHABLE, NORMAL, HOP, SMASH } from './path.js';
export { applyCommand, canPlace } from './commands.js';
export { step, waveSpec, beginWave, queueTrainingWave, setTrainingCash } from './step.js';
export { applyDemoLayout, DEMO_LAYOUT } from './demo.js';
