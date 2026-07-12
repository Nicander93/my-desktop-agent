# 修复购物车数量计算 / Cart Quantity Repair

`subtotal(items)` 必须返回所有商品“价格乘以数量”之和。

`subtotal(items)` must return the sum of every item price multiplied by its quantity.

- 商品结构为 `{ price: number, quantity: number }`。 / An item is `{ price: number, quantity: number }`.
- 缺少 `quantity` 时按 `1` 处理。 / Missing `quantity` means `1`.
- 不要修改公开函数名或 verifier。 / Do not change public function names or edit the verifier.
