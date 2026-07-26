/** 应用级运行时路径与 bundled 命令解析，从 paths.ts 再导出 */
export {
  APP_DIR_NAME,
  getAppRuntimePaths,
  buildAppLevelEnv,
  buildCodingEnv,
  buildBundledPathEnv,
  resolveBundledCommand,
  resolveCommandIfBundled,
  BUNDLED_COMMAND_ALIASES,
  type AppRuntimePaths,
  type BundledCommandName,
} from './paths.js';
