import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { BinaryFileError, ToolError } from "@/core/errors.js";

export async function readTextFile(
  filePath: string,
  maxBytes: number,
): Promise<string> {
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new ToolError(`Path is not a file: ${filePath}`, "NOT_A_FILE");
  }
  if (info.size > maxBytes) {
    throw new ToolError(
      `File is too large for this text tool (${info.size} bytes > ${maxBytes} bytes): ${filePath}`,
      "FILE_TOO_LARGE",
    );
  }

  const content = await readFile(filePath, "utf8");
  if (content.includes("\u0000")) {
    throw new BinaryFileError(filePath);
  }
  return content;
}

/**
 * Uses rename-based replacement, falling back to remove-and-rename when Windows rejects replacement.
 */
export async function atomicWriteTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = `${filePath}.agent-tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, content, "utf8");

  try {
    try {
      await rename(tempPath, filePath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        process.platform !== "win32" ||
        (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES")
      ) {
        throw error;
      }
    }

    try {
      await unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(tempPath, filePath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Preserve the original write failure when temporary-file cleanup also fails.
    }
    throw error;
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    const handle = await open(filePath, "r");
    await handle.close();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
