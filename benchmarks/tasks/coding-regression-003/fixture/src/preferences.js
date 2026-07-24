export function updateUserTheme(state, userId, theme) {
  if (!state.users[userId]) return state;
  state.users[userId].preferences.theme = theme;
  return state;
}
