/** clsx + tailwind-merge */
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/** 合并 className，后者覆盖冲突的 Tailwind 类 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}