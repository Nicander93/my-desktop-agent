# 偏好设置更新 / Preference Update

修复 `src/preferences.js` 中的 `updateUserTheme(state, userId, theme)`。

Repair `updateUserTheme(state, userId, theme)` in `src/preferences.js`.

- 返回新的顶层 state 对象。 / Return a new top-level state object.
- 返回新的 `users` 对象和目标用户对象。 / Return a new `users` object and a new object for the targeted user.
- 其他用户和无关属性保持原引用。 / Preserve every other user and every unrelated property by reference.
- 只修改目标用户的 `preferences.theme`。 / Change only `preferences.theme` for the targeted user.
- 用户不存在时，原样返回原始 state 对象。 / If the user does not exist, return the original state object unchanged.
