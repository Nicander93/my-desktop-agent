/** runtime 子模块统一导出，install / manager / policy 见各源文件 */
export {
  ensureBinariesInstalled,
  getBinariesRoot,
  getDefaultHomeDir,
  getDevResourcePaths,
  getInstalledPath,
  getPackagedResourcePaths,
  installRuntime,
  loadManifest,
  areAllRuntimesInstalled,
  isRuntimeInstalled,
  type BinaryInstallRecord,
  type EnsureBinariesOptions,
  type EnsureBinariesResult,
  type InstallProgressEvent,
  type RuntimeManifest,
  type RuntimeManifestEntry,
} from './install.js';

export {
  BinaryManager,
  getBinaryManager,
  getBinaryManagerPaths,
  getRuntimeInitError,
  isRuntimeReady,
  setBinaryManager,
  type BinaryManagerStatus,
} from './manager.js';

export {
  applyBaseRuntimeEnv,
  buildSubprocessEnv,
  createBundledCommandResolver,
  getAgentEnv,
  getDependencyScope,
  mergeRuntimeEnvIntoMcpServers,
  type DependencyScope,
} from './policy.js';
