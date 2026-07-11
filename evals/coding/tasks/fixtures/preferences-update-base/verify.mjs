import { strict as assert } from 'node:assert';
import { updateUserTheme } from './src/preferences.js';

const state = {
  selectedUserId: 'ada',
  users: {
    ada: { name: 'Ada', preferences: { theme: 'light', density: 'compact' } },
    lin: { name: 'Lin', preferences: { theme: 'dark' } },
  },
};
const updated = updateUserTheme(state, 'ada', 'dark');
assert.notEqual(updated, state);
assert.notEqual(updated.users, state.users);
assert.notEqual(updated.users.ada, state.users.ada);
assert.equal(updated.users.lin, state.users.lin);
assert.equal(updated.users.ada.preferences.theme, 'dark');
assert.equal(updated.users.ada.preferences.density, 'compact');
assert.equal(state.users.ada.preferences.theme, 'light');
assert.equal(updateUserTheme(state, 'missing', 'dark'), state);
console.log('verified');
