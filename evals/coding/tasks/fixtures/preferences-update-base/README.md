# Preference update

Repair `updateUserTheme(state, userId, theme)` in `src/preferences.js`.

- Return a new top-level state object.
- Return a new `users` object and a new object for the targeted user.
- Preserve every other user and every unrelated property by reference.
- Change only `preferences.theme` for the targeted user.
- If the user does not exist, return the original state object unchanged.
