/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'renderer-no-host',
      comment: 'Renderer must not import electron, agent-runtime, or open-agent-sdk',
      severity: 'error',
      from: { path: '^apps/renderer/' },
      to: {
        path: '^(@desktop-agent/agent-runtime|@desktop-agent/electron|@codeany/open-agent-sdk|electron)',
      },
    },
    {
      name: 'shared-no-upstream',
      comment: 'Shared contract layer must not import apps or other desktop packages',
      severity: 'error',
      from: { path: '^packages/shared/' },
      to: {
        path: '^(@desktop-agent/|@codeany/open-agent-sdk|apps/)',
      },
    },
    {
      name: 'sdk-no-desktop',
      comment: 'open-agent-sdk must not import desktop workspace packages',
      severity: 'error',
      from: { path: '^packages/open-agent-sdk/' },
      to: { path: '^@desktop-agent/' },
    },
    {
      name: 'runtime-no-electron',
      comment: 'agent-runtime must not import electron or renderer',
      severity: 'error',
      from: { path: '^packages/agent-runtime/' },
      to: {
        path: '^(electron|apps/electron|apps/renderer)',
      },
    },
    {
      name: 'electron-no-renderer',
      comment: 'Electron main process must not import renderer code',
      severity: 'error',
      from: { path: '^apps/electron/' },
      to: { path: '^apps/renderer/' },
    },
    {
      name: 'agent-eval-no-desktop-host',
      comment: 'The reusable headless evaluator must not depend on Electron or renderer code',
      severity: 'error',
      from: { path: '^packages/agent-eval/' },
      to: { path: '^(electron|apps/electron|apps/renderer)' },
    },
    {
      name: 'ui-no-features',
      comment: 'UI primitives must not import feature modules',
      severity: 'error',
      from: { path: '^apps/renderer/src/components/ui/' },
      to: { path: '^apps/renderer/src/features/' },
    },
  ],
  options: {
    tsConfig: {
      fileName: 'tsconfig.depcruise.json',
    },
    tsPreCompilationDeps: true,
    includeOnly: '^(apps|packages)/',
  },
};
