import { spawn } from './spawn-process'

// Amplitude-only peaks don't need speech-quality sample rate — keeps ffmpeg's output (and thus
// how much PCM this has to buffer in memory) small.
export const SAMPLE_RATE = 8000
export const BUCKET_MS = 50

export async function extractWaveformPeaks(audioFilePath: string): Promise<number[]> {
  const pcm = await decodeToPcm(audioFilePath)
  const samplesPerBucket = Math.round((SAMPLE_RATE * BUCKET_MS) / 1000)
  const peaks: number[] = []
  for (let i = 0; i < pcm.length; i += samplesPerBucket) {
    let maxAbs = 0
    for (let j = i; j < Math.min(i + samplesPerBucket, pcm.length); j++) {
      maxAbs = Math.max(maxAbs, Math.abs(pcm[j]))
    }
    peaks.push(Math.round((maxAbs / 32768) * 1000) / 1000)
  }
  return peaks
}

function decodeToPcm(audioFilePath: string): Promise<Int16Array> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-i',
      audioFilePath,
      '-f',
      's16le',
      '-acodec',
      'pcm_s16le',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      '1',
      'pipe:1',
    ])
    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      reject(new Error(`ffmpeg not found or failed to start: ${error.message}`))
    })
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
        return
      }
      const buffer = Buffer.concat(chunks)
      resolve(new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2))
    })
  })
}
