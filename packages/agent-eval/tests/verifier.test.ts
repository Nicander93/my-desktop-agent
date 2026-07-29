/** unchangedPaths 支持目录递归比对 */
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EvaluationTask } from '@desktop-agent/shared';
import { verifyTask } from '../src/verifier.js';

describe('verifyTask unchangedPaths', () => {
  it('passes when a protected directory is unchanged', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-eval-unchanged-'));
    const workspace = join(root, 'workspace');
    const baseline = join(root, 'baseline');
    await mkdir(join(workspace, 'downloads'), { recursive: true });
    await mkdir(join(baseline, 'downloads'), { recursive: true });
    await writeFile(join(workspace, 'downloads', 'a.txt'), 'same\n', 'utf8');
    await writeFile(join(baseline, 'downloads', 'a.txt'), 'same\n', 'utf8');
    await writeFile(join(workspace, 'out.txt'), 'ok\n', 'utf8');

    const verifier = await verifyTask(createTask(['downloads/']), workspace, baseline);
    expect(verifier.checks).toContainEqual(expect.objectContaining({
      id: 'unchanged:downloads/',
      passed: true,
    }));
  });

  it('fails when a protected directory file changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-eval-changed-'));
    const workspace = join(root, 'workspace');
    const baseline = join(root, 'baseline');
    await mkdir(join(workspace, 'downloads'), { recursive: true });
    await mkdir(join(baseline, 'downloads'), { recursive: true });
    await writeFile(join(workspace, 'downloads', 'a.txt'), 'changed\n', 'utf8');
    await writeFile(join(baseline, 'downloads', 'a.txt'), 'same\n', 'utf8');

    const verifier = await verifyTask(createTask(['downloads/']), workspace, baseline);
    expect(verifier.checks).toContainEqual(expect.objectContaining({
      id: 'unchanged:downloads/',
      passed: false,
    }));
  });
});

function createTask(unchangedPaths: string[]): EvaluationTask {
  return {
    schemaVersion: 1,
    id: 'dir-unchanged',
    version: '1.0.0',
    title: 'dir',
    prompt: 'x',
    profile: 'general',
    capabilities: [],
    fixture: 'fixture',
    verifier: { unchangedPaths },
  };
}
