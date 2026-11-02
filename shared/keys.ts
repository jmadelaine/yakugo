/** Rules a new translation key must follow. */
export const KEY_RULES = ['No spaces or other whitespace', 'Must not already exist in this project'] as const

/** Returns a message explaining why `key` is not allowed, or undefined when it is fine. */
export function validateKey(key: string, existing: readonly string[]): string | undefined {
  if (key === '') return 'Enter a key'
  if (/\s/.test(key)) return 'Keys cannot contain whitespace'
  if (existing.includes(key)) return 'This key already exists'
  return undefined
}
