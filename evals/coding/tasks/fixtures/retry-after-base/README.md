# Retry-After parsing

`parseRetryAfter(value)` accepts a value expressed as a positive integer number of seconds.

- Return that integer for a number such as `5` or a string such as `'5'`.
- Return `undefined` for missing, empty, non-numeric, decimal, zero, negative, or non-finite values.
- Whitespace around a numeric string is allowed.
