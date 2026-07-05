#!/usr/bin/env node
import { execSync } from 'node:child_process';

function freePort(port: number): void {
  if (process.platform !== 'win32') return;

  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
    const pids = new Set<number>();

    for (const line of output.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid > 0) pids.add(pid);
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`[dev] 已释放端口 ${port} (PID ${pid})`);
      } catch {
        // ignore
      }
    }
  } catch {
    // port already free
  }
}

for (const port of [3000, 3001, 3002]) {
  freePort(port);
}
