import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { spawn } from './spawn-process'
import { unlink } from './fs-process'

export async function downloadAudio(videoId: string): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `dub-sync-${videoId}-${randomUUID()}.mp3`)

  await new Promise<void>((resolve, reject) => {
    const child = spawn('yt-dlp', [
      '-x',
      '--audio-format',
      'mp3',
      '--postprocessor-args',
      'ExtractAudio:-ar 16000 -ac 1',
      '-o',
      outputPath,
      `https://www.youtube.com/watch?v=${videoId}`,
    ])

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      reject(new Error(`yt-dlp not found or failed to start: ${error.message}`))
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`))
      }
    })
  })

  return outputPath
}

export async function deleteAudioFile(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => {})
}
