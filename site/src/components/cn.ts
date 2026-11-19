/** Joins class names, skipping the falsy ones. */
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
