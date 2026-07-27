/** 应用级运行时路径与 bundled 命令解析，从 paths.ts 再导出 */
export {
  APP_DIR_NAME,
  GIT_BASH_DIR,
  getAppRuntimePaths,
  getGitBashRoot,
  buildAppLevelEnv,
  buildCodingEnv,
  buildBundledPathEnv,
  getBundledPathSegments,
  resolveBundledCommand,
  resolveCommandIfBundled,
  BUNDLED_COMMAND_ALIASES,
  type AppRuntimePaths,
  type BundledCommandName,
} from './paths.js';
export {
  DEFAULT_PYTHON_VERSION,
  getPythonRuntimeRecordPath,
  getPythonShimsDir,
  readPythonRuntimeRecord,
  getPythonPathSegments,
  type PythonRuntimeRecord,
} from './python.js';
export {
  DESKTOP_AGENT_BASH_ENV,
  resolveGitBashPath,
  getGitShellPathSegments,
  buildGitBashEnv,
} from './shell.js';
