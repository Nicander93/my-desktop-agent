/**
 * 工具路径解析：cwd 相对路径 + Windows 下 Git Bash/MSYS 盘符路径。
 * 只改 Read/Write/Edit 等 Node 工具入参，不改 Bash 命令字符串。
 */
import path from 'node:path'

/** /d 或 /d/foo → D:\...；/usr、/workspace 首段不是单字母，原样返回 */
const MSYS_DRIVE = /^\/([a-zA-Z])(?:\/(.*))?$/
const CYGDRIVE = /^\/cygdrive\/([a-zA-Z])(?:\/(.*))?$/i

export function msysPathToHost(inputPath: string): string {
  const trimmed = inputPath.trim()
  const cyg = trimmed.match(CYGDRIVE)
  if (cyg) return toWinDrive(cyg[1], cyg[2])
  const msys = trimmed.match(MSYS_DRIVE)
  if (msys) return toWinDrive(msys[1], msys[2])
  return trimmed
}

function toWinDrive(letter: string, rest?: string): string {
  const tail = rest && rest.length > 0 ? rest.replace(/\//g, '\\') : ''
  return path.win32.normalize(`${letter.toUpperCase()}:\\${tail}`)
}

/**
 * 解析为宿主绝对路径。
 * win32：先做 MSYS 盘符；仍以 / 开头的 POSIX 绝对路径按 cwd 相对处理，
 * 避免 `/workspace/a` 变成 `D:\workspace\a` 逃出评测目录。
 */
export function resolveToolPath(
  cwd: string,
  inputPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const trimmed = inputPath.trim()
  if (platform === 'win32') {
    const normalized = msysPathToHost(trimmed)
    if (normalized.startsWith('/')) {
      return path.win32.resolve(cwd, normalized.replace(/^\/+/, ''))
    }
    return path.win32.resolve(cwd, normalized)
  }
  return path.posix.resolve(cwd, trimmed)
}
