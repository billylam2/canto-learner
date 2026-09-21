import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { SpeechClient } from '@google-cloud/speech'
import type { TranscribedWord } from './group-words-by-speaker'
import { spawn } from './spawn-process'
import { readFile, unlink } from './fs-process'

export async function downloadAudio(videoId: string): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `dub-sync-${videoId}-${randomUUID()}.mp3`)

  await new Promise<void>((resolve, reject) => {
    const child = spawn('yt-dlp', [
      '-x',
      '--audio-format',
      'mp3',
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

export async function transcribeWithDiarization(
  audioFilePath: string,
  languageCode: string
): Promise<TranscribedWord[]> {
  const client = new SpeechClient()
  const audioBytes = await readFile(audioFilePath)

  const [operation] = await client.longRunningRecognize({
    audio: { content: audioBytes.toString('base64') },
    config: {
      encoding: 'MP3',
      languageCode,
      enableWordTimeOffsets: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 6,
      },
    },
  })

  const [response] = await operation.promise()
  const results = response.results ?? []
  const lastResult = results[results.length - 1]
  const wordInfos = lastResult?.alternatives?.[0]?.words ?? []

  return wordInfos.map((wordInfo) => ({
    text: wordInfo.word ?? '',
    startTime: secondsFromDuration(wordInfo.startTime),
    endTime: secondsFromDuration(wordInfo.endTime),
    speakerTag: wordInfo.speakerTag ?? 0,
  }))
}

function secondsFromDuration(
  duration?: { seconds?: number | string | null; nanos?: number | null } | null
): number {
  if (!duration) return 0
  const seconds = Number(duration.seconds ?? 0)
  const nanos = Number(duration.nanos ?? 0)
  return seconds + nanos / 1e9
}
