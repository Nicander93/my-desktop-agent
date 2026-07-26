/**
 * Harness-only behavioral verifier（不在 Agent 可见的 fixture 里）。
 * 从 process.cwd()（workspace）加载 src/game.js。
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mockCanvas(width = 800, height = 450) {
  return {
    width,
    height,
    getContext() {
      return {
        fillStyle: '',
        clearRect() {},
        fillRect() {},
        beginPath() {},
        fill() {},
        stroke() {},
        arc() {},
      };
    },
  };
}

function stepFrames(game, frames, dtMs = 16) {
  for (let i = 0; i < frames; i += 1) game.step(dtMs);
}

const gameModule = await import(pathToFileURL(join(process.cwd(), 'src/game.js')).href);
const { createGame } = gameModule;
assert(typeof createGame === 'function', 'src/game.js must export createGame');

const game = createGame(mockCanvas());
assert(game && typeof game.setKey === 'function', 'createGame must return setKey');
assert(typeof game.step === 'function', 'createGame must return step');
assert(typeof game.getState === 'function', 'createGame must return getState');

stepFrames(game, 90);
let state = game.getState();
assert(state?.player && typeof state.player.x === 'number', 'getState().player.x must be a number');
assert(typeof state.player.y === 'number', 'getState().player.y must be a number');
assert(state.player.grounded === true, 'player should become grounded after falling onto the ground/platform');

const startX = state.player.x;
game.setKey('ArrowRight', true);
stepFrames(game, 45);
state = game.getState();
assert(state.player.x > startX + 10, `ArrowRight should move player right (x ${startX} -> ${state.player.x})`);
game.setKey('ArrowRight', false);

const beforeJumpY = state.player.y;
assert(state.player.grounded === true, 'player should be grounded before jump');
game.setKey('Space', true);
stepFrames(game, 4);
game.setKey('Space', false);
stepFrames(game, 8);
state = game.getState();
assert(state.player.y < beforeJumpY - 5, `jump should move player up/decrease y (y ${beforeJumpY} -> ${state.player.y})`);

stepFrames(game, 90);
state = game.getState();
assert(state.player.grounded === true, 'player should land (collision) and become grounded after a jump');

game.setKey('ArrowRight', true);
stepFrames(game, 240);
game.setKey('ArrowRight', false);
stepFrames(game, 30);
state = game.getState();
assert(state.won === true, 'player should reach the win condition after moving far enough to the right');

console.log('mario verification passed');
