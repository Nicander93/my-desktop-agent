/**
 * GlobTool - File pattern matching
 */

import { resolve } from 'path'
import { defineTool } from './types.js'

export const GlobTool = defineTool({
  name: 'Glob',
  description: 'Find files matching a glob pattern. Returns matching file paths sorted by modification time. Supports patterns like "**/*.ts", "src/**/*.js".',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The glob pattern to match files against',
      },
      path: {
        type: 'string',
        description: 'The directory to search in (defaults to cwd)',
      },
    },
    required: ['pattern'],
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input, context) {
    const searchDir = input.path ? resolve(context.cwd, input.path) : context.cwd
    const { pattern } = input

    try {
      // Use Node.js glob (available in Node 22+) or fall back to bash find
      const { glob } = await import('fs/promises')

      // @ts-ignore - glob is available in Node 22+
      if (typeof glob === 'function') {
        const matches: string[] = []
        // @ts-ignore
        for await (const entry of glob(pattern, { cwd: searchDir })) {
          matches.push(entry)
          if (matches.length >= 500) break
        }
        if (matches.length === 0) {
          return `No files matching pattern "${pattern}" in ${searchDir}`
        }
        return matches.join('\n')
      }
    } catch {
      // Fall through to bash-based approach
    }

    // Fallback: use platform shell
    const { spawn } = await import('child_process')
    return new Promise<string>((resolvePromise) => {
      const isWin32 = process.platform === 'win32'
      let cmd: string
      let shellCmd: string
      let shellArgs: string[]
      if (isWin32) {
        shellCmd = 'powershell.exe'
        const psPattern = pattern.replace(/\*\*/g, '**').replace(/\*/g, '*')
        cmd = `Get-ChildItem -Path '${searchDir}' -Filter '${psPattern}' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 500 -ExpandProperty FullName`
        shellArgs = ['-NoProfile', '-Command', cmd]
      } else {
        shellCmd = 'bash'
        cmd = `shopt -s globstar nullglob 2>/dev/null; cd ${JSON.stringify(searchDir)} && ls -1d ${pattern} 2>/dev/null | head -500`
        shellArgs = ['-c', cmd]
      }
      const proc = spawn(shellCmd, shellArgs, {
        cwd: searchDir,
        timeout: 30000,
      })

      const chunks: Buffer[] = []
      proc.stdout?.on('data', (d: Buffer) => chunks.push(d))
      proc.on('close', () => {
        const result = Buffer.concat(chunks).toString('utf-8').trim()
        if (!result) {
          resolvePromise(`No files matching pattern "${pattern}" in ${searchDir}`)
        } else {
          resolvePromise(result)
        }
      })
      proc.on('error', () => {
        resolvePromise(`Error searching for files with pattern "${pattern}"`)
      })
    })
  },
})
