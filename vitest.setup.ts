import '@testing-library/jest-dom/vitest'

// Vitest's module runner evaluates each test file in its own vm context, so
// ArrayBuffers returned by Node's native crypto.subtle (created against a
// different realm) fail `instanceof ArrayBuffer` checks in that context.
// iron-webcrypto (used by iron-session) relies on that check, so we
// normalize SubtleCrypto's ArrayBuffer-returning methods to always return an
// ArrayBuffer constructed in this test file's own realm.
const subtle = globalThis.crypto?.subtle
if (subtle) {
  const patch =
    <Args extends unknown[]>(fn: (...args: Args) => Promise<ArrayBuffer>) =>
    async (...args: Args): Promise<ArrayBuffer> => {
      const result = await fn(...args)
      return Uint8Array.from(new Uint8Array(result)).buffer
    }

  subtle.sign = patch(subtle.sign.bind(subtle))
  subtle.encrypt = patch(subtle.encrypt.bind(subtle))
  subtle.decrypt = patch(subtle.decrypt.bind(subtle))
  subtle.digest = patch(subtle.digest.bind(subtle))
}
