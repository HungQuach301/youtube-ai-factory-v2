import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { correctStage12EncodedLoudness } from './stage12-runtime.mjs'

function run(executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      const result = { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }
      if (code === 0) resolve(result)
      else reject(new Error(result.stderr.toString('utf8').slice(-4000)))
    })
  })
}

function loudness(stderr) {
  const blocks = [...stderr.matchAll(/\{[\s\S]*?"target_offset"\s*:\s*"[^"]+"[\s\S]*?\}/gu)]
  const value = JSON.parse(blocks.at(-1)?.[0] ?? 'null')
  if (!value) throw new Error('Encoded loudness smoke measurement missing.')
  return { integratedLufs: Number(value.input_i), truePeakDbtp: Number(value.input_tp),
    loudnessRangeLu: Number(value.input_lra) }
}

const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage12-audio-smoke-'))
try {
  const preMasterPath = join(workRoot, 'pre-master.webm')
  await run('ffmpeg', [
    '-hide_banner', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'color=c=0x334455:s=640x360:r=30:d=20',
    '-f', 'lavfi', '-i', "sine=frequency=440:sample_rate=48000:duration=20,volume='if(lt(mod(t,10),5),0.12,0.25)':eval=frame",
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libvpx-vp9', '-deadline', 'realtime',
    '-c:a', 'libopus', '-ar', '48000', '-t', '20', preMasterPath,
  ], workRoot)
  const payload = { render: { sampleRateHz: 48000 }, qa: { loudness: {
    integratedLufs: -14, toleranceLufs: 1, truePeakMaxDbtp: -1, lraMin: 4, lraMax: 8,
  } } }
  await correctStage12EncodedLoudness(payload, preMasterPath, workRoot)
  const measured = loudness((await run('ffmpeg', [
    '-hide_banner', '-nostdin', '-i', preMasterPath,
    '-af', 'loudnorm=I=-14:TP=-1:LRA=7:print_format=json', '-f', 'null', '-',
  ], workRoot)).stderr.toString('utf8'))
  if (Math.abs(measured.integratedLufs + 14) > 1 || measured.truePeakDbtp > -1
    || measured.loudnessRangeLu < 4 || measured.loudnessRangeLu > 8) {
    throw new Error(`Stage 12 encoded loudness correction failed: ${JSON.stringify(measured)}`)
  }
  process.stdout.write('STAGE12_AUDIO_SMOKE_PASS\n')
} finally {
  await rm(workRoot, { recursive: true, force: true })
}
