import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { SpeechClient } from '@google-cloud/speech'
import { Storage } from '@google-cloud/storage'
import { spawn } from './spawn-process'
import { unlink } from './fs-process'

export interface TranscribedWord {
  text: string
  startTime: number
  endTime: number
}

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

function getGcsBucketName(): string {
  const bucket = process.env.DUB_SYNC_GCS_BUCKET
  if (!bucket) {
    throw new Error('DUB_SYNC_GCS_BUCKET must be set to a Google Cloud Storage bucket name')
  }
  return bucket
}

export async function uploadToGcs(filePath: string, bucketName: string): Promise<string> {
  const storage = new Storage()
  const objectName = `dub-sync/${randomUUID()}${path.extname(filePath)}`
  await storage.bucket(bucketName).upload(filePath, { destination: objectName })
  return `gs://${bucketName}/${objectName}`
}

export async function deleteFromGcs(gcsUri: string): Promise<void> {
  const [bucketName, ...objectParts] = gcsUri.replace('gs://', '').split('/')
  const objectName = objectParts.join('/')
  const storage = new Storage()
  await storage.bucket(bucketName).file(objectName).delete().catch(() => {})
}

export async function transcribeWords(audioFilePath: string, languageCode: string): Promise<TranscribedWord[]> {
  const bucketName = getGcsBucketName()
  const gcsUri = await uploadToGcs(audioFilePath, bucketName)

  try {
    const client = new SpeechClient()
    const [operation] = await client.longRunningRecognize({
      audio: { uri: gcsUri },
      config: {
        encoding: 'MP3',
        // Must match downloadAudio's forced output rate — Speech-to-Text doesn't reliably read the
        // MP3 header's actual rate and silently mis-decodes (near-total word loss) if this drifts.
        sampleRateHertz: 16000,
        audioChannelCount: 1,
        languageCode,
        enableWordTimeOffsets: true,
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
    }))
  } finally {
    await deleteFromGcs(gcsUri)
  }
}

function secondsFromDuration(
  duration?: { seconds?: number | string | null; nanos?: number | null } | null
): number {
  if (!duration) return 0
  const seconds = Number(duration.seconds ?? 0)
  const nanos = Number(duration.nanos ?? 0)
  return seconds + nanos / 1e9
}
