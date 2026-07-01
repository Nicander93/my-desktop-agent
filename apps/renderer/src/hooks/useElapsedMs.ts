import { useEffect, useState } from 'react';

const TICK_MS = 500;

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
