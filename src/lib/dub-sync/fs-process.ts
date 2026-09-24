// See spawn-process.ts — Node built-in modules are unreliable to mock directly in this
// project's Vitest setup. Re-exporting through this thin wrapper makes it a plain user module,
// which mocks reliably.
export { unlink } from 'node:fs/promises'
