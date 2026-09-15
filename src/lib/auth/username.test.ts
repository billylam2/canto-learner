import { describe, it, expect } from 'vitest'
import { isValidUsernameFormat, containsBlockedWord, validateUsername } from './username'

describe('isValidUsernameFormat', () => {
  it('accepts 3-16 letters, numbers, and underscores', () => {
    expect(isValidUsernameFormat('mimi_4')).toBe(true)
  })

  it('rejects usernames that are too short', () => {
    expect(isValidUsernameFormat('ab')).toBe(false)
  })

  it('rejects usernames that are too long', () => {
    expect(isValidUsernameFormat('a'.repeat(17))).toBe(false)
  })

  it('rejects spaces and special characters', () => {
    expect(isValidUsernameFormat('mimi mimi')).toBe(false)
    expect(isValidUsernameFormat('mimi!')).toBe(false)
  })
})

describe('containsBlockedWord', () => {
  it('detects a blocked word regardless of case', () => {
    expect(containsBlockedWord('SHITkid')).toBe(true)
  })

  it('allows clean usernames', () => {
    expect(containsBlockedWord('mimi_4')).toBe(false)
  })
})

describe('validateUsername', () => {
  it('accepts a valid, clean username', () => {
    expect(validateUsername('mimi_4')).toEqual({ valid: true })
  })

  it('rejects a badly formatted username with a reason', () => {
    expect(validateUsername('ab')).toEqual({
      valid: false,
      reason: 'Username must be 3-16 letters, numbers, or underscores',
    })
  })

  it('rejects a blocked username with a reason', () => {
    expect(validateUsername('shitkid')).toEqual({ valid: false, reason: 'Username is not allowed' })
  })
})
