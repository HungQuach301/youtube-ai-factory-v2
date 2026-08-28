import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildVoiceEmbedding } from '../packages/design/dist/index.js'

const inputPath = resolve(process.argv[2] ?? 'voice-qualification-output/voice-fingerprint-30s.wav')
const outputPath = resolve(process.argv[3] ?? 'voice-qualification-output/voice-fingerprint.embedding.json')
const audio = await readFile(inputPath)
const decoded = spawnSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-i', inputPath,
  '-ar', '16000', '-ac', '1', '-f', 's16le', '-',
], { maxBuffer: 8 * 1024 * 1024 })
if (decoded.status !== 0) throw new Error(`VOICE_EMBEDDING_DECODE_FAILED: ${decoded.stderr}`)
const raw = Buffer.from(decoded.stdout)
const pcm = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
const embedding = buildVoiceEmbedding(pcm, audio)
await writeFile(outputPath, `${JSON.stringify(embedding, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({
  algorithm: embedding.algorithm,
  dimensions: embedding.dimensions,
  sourceAudioSha256: embedding.sourceAudioSha256,
})}\n`)
