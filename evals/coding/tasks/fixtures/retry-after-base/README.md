# 解析 Retry-After / Retry-After Parsing

`parseRetryAfter(value)` 接受以正整数秒表示的值。

`parseRetryAfter(value)` accepts a value expressed as a positive integer number of seconds.

- 对 `5` 这样的数字或 `'5'` 这样的字符串返回对应整数。 / Return that integer for a number such as `5` or a string such as `'5'`.
- 对缺失、空、非数字、小数、零、负数或非有限值返回 `undefined`。 / Return `undefined` for missing, empty, non-numeric, decimal, zero, negative, or non-finite values.
- 数字字符串两侧可以有空白。 / Whitespace around a numeric string is allowed.
