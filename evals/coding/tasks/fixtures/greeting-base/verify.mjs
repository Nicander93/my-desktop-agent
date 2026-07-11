import { greet } from './src/greet.js';

if (greet('Ada') !== 'Hello, Ada!') {
  throw new Error('greet() returned the wrong value');
}

console.log('verified');
