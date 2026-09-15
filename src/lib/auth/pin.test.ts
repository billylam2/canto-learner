import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin, isValidPinFormat } from './pin'

describe('isValidPinFormat', () => {
  it('accepts a 4-digit string', () => {
    expect(isValidPinFormat('1234')).toBe(true)
  })

  it('rejects non-4-digit input', () => {
    expect(isValidPinFormat('123')).toBe(false)
    expect(isValidPinFormat('12345')).toBe(false)
    expect(isValidPinFormat('abcd')).toBe(false)
  })
})

describe('hashPin / verifyPin', () => {
  it('produces a hash that verifies against the original PIN', async () => {
    const hash = await hashPin('4821')
    expect(await verifyPin('4821', hash)).toBe(true)
  })

  it('rejects an incorrect PIN', async () => {
    const hash = await hashPin('4821')
    expect(await verifyPin('9999', hash)).toBe(false)
  })

  it('throws for a malformed PIN', async () => {
    await expect(hashPin('12')).rejects.toThrow('PIN must be exactly 4 digits')
  })
})
