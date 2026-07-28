/**
 * FileWriteTool - Write/create files
 */

import { writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { defineTool } from './types.js'
import { resolveToolPath } from '../utils/toolPath.js'

export const FileWriteTool = defineTool({
  name: 'Write',
  description: 'Write content to a file. Creates the file if it does not exist, or overwrites if it does. Creates parent directories as needed.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Path to write (prefer workspace-relative, e.g. output/a.json). Absolute Windows or Git Bash /d/... paths also work.',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['file_path', 'content'],
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  async call(input, context) {
    const filePath = resolveToolPath(context.cwd, input.file_path)

    try {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, input.content, 'utf-8')

      const lines = input.content.split('\n').length
      const bytes = Buffer.byteLength(input.content, 'utf-8')
      return `File written: ${filePath} (${lines} lines, ${bytes} bytes)`
    } catch (err: any) {
      return { data: `Error writing file: ${err.message}`, is_error: true }
    }
  },
})
