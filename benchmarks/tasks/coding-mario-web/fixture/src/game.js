/**
 * 实现并导出 createGame(canvas)。
 * 返回：
 * - setKey(code, down)：处理 ArrowLeft/ArrowRight/Space/ArrowUp
 * - step(dtMs)：推进物理与渲染
 * - getState()：{ player: { x, y, grounded }, won }
 *
 * 坐标系：canvas，y 向下为正。需要地面/平台碰撞，以及到达关卡右侧后的胜利。
 */
export function createGame(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    setKey() {},
    step() {
      ctx?.clearRect?.(0, 0, canvas.width, canvas.height);
    },
    getState() {
      return { player: { x: 40, y: 0, grounded: false }, won: false };
    },
  };
}
