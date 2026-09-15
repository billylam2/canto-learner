import { USERNAME_BLOCKLIST } from './blocklist'

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/

export function isValidUsernameFormat(username: string): boolean {
  return USERNAME_PATTERN.test(username)
}

export function containsBlockedWord(username: string): boolean {
  const normalized = username.toLowerCase()
  return USERNAME_BLOCKLIST.some((word) => normalized.includes(word))
}

export function validateUsername(username: string): { valid: boolean; reason?: string } {
  if (!isValidUsernameFormat(username)) {
    return { valid: false, reason: 'Username must be 3-16 letters, numbers, or underscores' }
  }
  if (containsBlockedWord(username)) {
    return { valid: false, reason: 'Username is not allowed' }
  }
  return { valid: true }
}
