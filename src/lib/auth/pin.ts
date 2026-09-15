import { hash, compare } from 'bcryptjs'

const SALT_ROUNDS = 10
const PIN_PATTERN = /^\d{4}$/

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin)
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN must be exactly 4 digits')
  }
  return hash(pin, SALT_ROUNDS)
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  return compare(pin, pinHash)
}
