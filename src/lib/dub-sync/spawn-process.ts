// Node built-in modules are unreliable to mock directly in this project's Vitest setup — a
// direct `vi.mock('node:child_process', ...)` in transcribe.test.ts silently failed to intercept
// calls, running the real yt-dlp binary instead. Re-exporting through this thin wrapper makes it
// a plain user module, which mocks reliably.
export { spawn } from 'node:child_process'
