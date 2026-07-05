/**
 * BashTool - Execute shell commands (platform-aware)
 */

import { spawn } from 'child_process'
import { defineTool } from './types.js'

const isWin32 = process.platform === 'win32'

function getShell() {
  if (isWin32) {
    return { cmd: 'powershell.exe', args: ['-NoProfile', '-Command', ''] }
  }
  return { cmd: 'bash', args: ['-c', ''] }
}

export const BashTool = defineTool({
  name: 'Bash',
  description: isWin32
    ? 'Execute a PowerShell command and return its output. On Windows, use PowerShell syntax (e.g. Get-ChildItem, Select-String). For bash-specific commands, wrap them in bash -c "..." explicitly.'
    : 'Execute a bash command and return its output. Use for running shell commands, scripts, and system operations.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: isWin32
          ? 'The PowerShell command to execute'
          : 'The bash command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Optional timeout in milliseconds (max 600000, default 120000)',
      },
    },
    required: ['command'],
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  async call(input, context) {
    const { command, timeout: userTimeout } = input
    const timeoutMs = Math.min(userTimeout || 120000, 600000)

    const shell = getShell()
    const args = isWin32
      ? ['-NoProfile', '-Command', command]
      : ['-c', command]

    return new Promise<string>((resolve) => {
      const chunks: Buffer[] = []
      const errChunks: Buffer[] = []

      const proc = spawn(shell.cmd, args, {
        cwd: context.cwd,
        env: context.subprocessEnv
          ? { ...process.env, ...context.subprocessEnv }
          : { ...process.env },
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      proc.stdout?.on('data', (data: Buffer) => chunks.push(data))
      proc.stderr?.on('data', (data: Buffer) => errChunks.push(data))

      if (context.abortSignal) {
        context.abortSignal.addEventListener('abort', () => {
          proc.kill('SIGTERM')
        }, { once: true })
      }

      proc.on('close', (code) => {
        const stdout = Buffer.concat(chunks).toString('utf-8')
        const stderr = Buffer.concat(errChunks).toString('utf-8')

        let output = ''
        if (stdout) output += stdout
        if (stderr) output += (output ? '\n' : '') + stderr
        if (code !== 0 && code !== null) {
          output += `\nExit code: ${code}`
        }

        // Truncate very large outputs
        if (output.length > 100000) {
          output = output.slice(0, 50000) + '\n...(truncated)...\n' + output.slice(-50000)
        }

        resolve(output || '(no output)')
      })

      proc.on('error', (err) => {
        resolve(`Error executing command: ${err.message}`)
      })
    })
  },
})
