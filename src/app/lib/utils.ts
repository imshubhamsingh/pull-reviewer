import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Compose conditional classNames and merge conflicting Tailwind classes. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
