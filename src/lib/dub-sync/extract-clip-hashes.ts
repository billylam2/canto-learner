import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashesFromRawGray9x8, type FrameHash } from './frame-hash'
import type { ExtractClipHashesOptions } from './refine-alignment'

// Downloads a short low-res clip around centerSeconds and hashes its frames. Goes through a
// scratch temp file rather than piping yt-dlp straight into ffmpeg: yt-dlp's chosen codec/
// container varies per video, and some of them (e.g. AV1-in-MP4) aren't reliably parseable by
// ffmpeg when read from a pipe instead of a seekable file.
export async function extractClipHashes(options: ExtractClipHashesOptions): Promise<FrameHash[]> {
  const { videoId, centerSeconds, windowSeconds, fps } = options
  const start = Math.max(0, centerSeconds - windowSeconds)
  const end = centerSeconds + windowSeconds
  const url = `https://www.youtube.com/watch?v=${videoId}`

  const dir = await mkdtemp(join(tmpdir(), 'dub-sync-align-'))
  try {
    const clipPath = join(dir, 'clip.mp4')
    await run('yt-dlp', [
      '-f',
      'bestvideo[height<=240]/worst',
      '--download-sections',
      `*${start}-${end}`,
      '-o',
      clipPath,
      url,
    ])

    const chunks: Buffer[] = []
    await run(
      'ffmpeg',
      ['-i', clipPath, '-vf', `fps=${fps},scale=9:8,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'],
      (chunk) => chunks.push(chunk)
    )

    return hashesFromRawGray9x8(Buffer.concat(chunks))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function run(command: string, args: string[], onStdout?: (chunk: Buffer) => void): Promise<void> {
  const child = spawn(command, args)
  child.stderr.resume()
  if (onStdout) child.stdout.on('data', onStdout)
  else child.stdout.resume()
  return waitForExit(child, command)
}

function waitForExit(child: ChildProcess, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${name} exited with code ${code}`))
    })
  })
}
