/**
 * FileEditTool - Precise string replacement in files
 *
 * Matching ignores CR/LF differences; write-back keeps the file's original EOL.
 */

import { readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { defineTool } from './types.js'

function detectEol(content: string): '\r\n' | '\n' {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function applyEol(value: string, eol: '\r\n' | '\n'): string {
  return eol === '\n' ? value : value.split('\n').join(eol)
}

export const FileEditTool = defineTool({
  name: 'Edit',
  description:
    'Perform exact string replacements in files. The old_string must match the file content (indentation/whitespace matter; CR/LF differences are ignored). Use replace_all to change every occurrence.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to modify',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to find and replace',
      },
      new_string: {
        type: 'string',
        description: 'The replacement text',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences (default false)',
      },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  async call(input, context) {
    const filePath = resolve(context.cwd, input.file_path)
    const { old_string, new_string, replace_all } = input

    const normalizedOld = normalizeNewlines(old_string)
    const normalizedNew = normalizeNewlines(new_string)
    if (normalizedOld === normalizedNew) {
      return { data: 'Error: old_string and new_string are identical', is_error: true }
    }

    try {
      const original = await readFile(filePath, 'utf-8')
      const eol = detectEol(original)
      let normalizedContent = normalizeNewlines(original)

      if (!normalizedContent.includes(normalizedOld)) {
        return {
          data: `Error: old_string not found in ${filePath}. Make sure it matches exactly including whitespace.`,
          is_error: true,
        }
      }

      if (!replace_all) {
        const count = normalizedContent.split(normalizedOld).length - 1
        if (count > 1) {
          return {
            data: `Error: old_string appears ${count} times in the file. Provide more context to make it unique, or set replace_all: true.`,
            is_error: true,
          }
        }
        normalizedContent = normalizedContent.replace(normalizedOld, normalizedNew)
      } else {
        normalizedContent = normalizedContent.split(normalizedOld).join(normalizedNew)
      }

      await writeFile(filePath, applyEol(normalizedContent, eol), 'utf-8')
      return `File edited: ${filePath}`
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return { data: `Error: File not found: ${filePath}`, is_error: true }
      }
      return { data: `Error editing file: ${err.message}`, is_error: true }
    }
  },
})
