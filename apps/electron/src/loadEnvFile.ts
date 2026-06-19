import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
  const eqIndex = withoutExport.indexOf('=');
  if (eqIndex <= 0) return null;

  const key = withoutExport.slice(0, eqIndex).trim();
  let value = withoutExport.slice(eqIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function loadEnvFile(...paths: string[]): void {
  for (const envPath of paths) {
    if (!existsSync(envPath)) continue;

    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;

      const [key, value] = parsed;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function loadProjectEnv(): void {
  loadEnvFile(
    join(__dirname, '../../../.env'),
    join(__dirname, '../../.env'),
    join(process.cwd(), '.env')
  );
}
