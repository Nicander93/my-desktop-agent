/**
 * 计时 hook：active 时按固定间隔刷新已过毫秒
 */
import { useEffect, useState } from 'react';

const TICK_MS = 500;

/** 返回自 startedAt 起的已过毫秒，未激活时为 undefined */
export function useElapsedMs(startedAt?: number, active = false): number | undefined {
  const [elapsed, setElapsed] = useState<number | undefined>(() => {
    if (!active || startedAt == null) return undefined;
    return Date.now() - startedAt;
  });

  useEffect(() => {
    if (!active || startedAt == null) {
      setElapsed(undefined);
      return;
    }

    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [active, startedAt]);

  return elapsed;
}
