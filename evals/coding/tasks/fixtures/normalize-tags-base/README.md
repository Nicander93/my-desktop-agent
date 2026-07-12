# 标签标准化 / Tag Normalization

在 `src/tags.js` 中实现 `normalizeTags(values)`。 / Implement `normalizeTags(values)` in `src/tags.js`.

- 输入数组可能包含字符串、空字符串和非字符串值。 / The input array may contain strings, blank strings, and non-string values.
- 只保留字符串，并执行 trim 和小写转换。 / Keep strings only; trim and lowercase them.
- 删除空字符串和重复项，以不依赖 locale 的升序返回剩余值。 / Drop blank strings and duplicates, then return the remaining values in ascending locale-independent order.
- 不要修改输入数组。 / Do not mutate the input array.
