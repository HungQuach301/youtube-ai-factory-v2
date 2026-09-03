import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildStage12AudioP0CorrectionFilter, buildStage12RemediationAudioFilter,
  buildStage12RemediationVideoFilter, correctStage12EncodedLoudness } from './stage12-runtime.mjs'

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const stderr = []
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => code === 0
      ? resolve(Buffer.concat(stderr).toString('utf8'))
      : reject(new Error(Buffer.concat(stderr).toString('utf8').slice(-4000))))
  })
}

function loudness(log) {
  const block = [...log.matchAll(/\{[\s\S]*?"target_offset"\s*:\s*"[^"]+"[\s\S]*?\}/gu)].at(-1)?.[0]
  if (!block) throw new Error('Remediation loudness measurement missing.')
  const value = JSON.parse(block)
  return { integrated: Number(value.input_i), peak: Number(value.input_tp), lra: Number(value.input_lra) }
}

const root = await mkdtemp(join(tmpdir(), 'factory-stage12-remediation-smoke-'))
try {
  const output = join(root, 'corrected.webm')
  const payload = { durationSec: 12, render: { width: 640, height: 360, fps: 30, sampleRateHz: 48000 },
    qa: { nearStaticMaxSec: 7, loudness: { integratedLufs: -14, toleranceLufs: 1, truePeakMaxDbtp: -1,
      lraMin: 4, lraMax: 8 } } }
  await run(['-hide_banner', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=12',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=12',
    '-vf', buildStage12RemediationVideoFilter(payload),
    '-af', `volume='if(lt(mod(t,6),3),0.08,0.8)':eval=frame,${buildStage12RemediationAudioFilter(payload)}`,
    '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-c:a', 'libopus', '-ar', '48000',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', output], root)
  await correctStage12EncodedLoudness(payload, output, root)
  const scan = await run(['-hide_banner', '-nostdin', '-i', output,
    '-vf', 'blackdetect,freezedetect=d=7', '-f', 'null', '-'], root)
  const measured = loudness(await run(['-hide_banner', '-nostdin', '-i', output,
    '-af', 'loudnorm=I=-14:TP=-1:LRA=7:print_format=json', '-f', 'null', '-'], root))
  if (scan.includes('black_start:') || scan.includes('freeze_start:')
    || Math.abs(measured.integrated + 14) > 1 || measured.peak > -1
    || measured.lra < 4 || measured.lra > 8) {
    throw new Error(`Stage 12 remediation smoke failed: ${JSON.stringify({ measured,
      black: scan.includes('black_start:'), freeze: scan.includes('freeze_start:') })}`)
  }

  const audioSource = join(root, 'audio-p0-source.webm')
  const audioCorrected = join(root, 'audio-p0-corrected.webm')
  const audioPayload = { ...payload, durationSec: 36 }
  await run(['-hide_banner', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=36',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=36',
    '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-c:a', 'libopus', audioSource], root)
  await run(['-hide_banner', '-nostdin', '-y', '-i', audioSource,
    '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy',
    '-af', buildStage12AudioP0CorrectionFilter(audioPayload, 3),
    '-c:a', 'libopus', '-ar', '48000', audioCorrected], root)
  await correctStage12EncodedLoudness(audioPayload, audioCorrected, root, {
    truePeakTargetDbtp: -2, passLimit: 3, useMacroDynamics: true, requirePass: true,
  })
  const audioMeasured = loudness(await run(['-hide_banner', '-nostdin', '-i', audioCorrected,
    '-af', 'loudnorm=I=-14:TP=-1:LRA=6:print_format=json', '-f', 'null', '-'], root))
  if (Math.abs(audioMeasured.integrated + 14) > 1 || audioMeasured.peak > -1
    || audioMeasured.lra < 4 || audioMeasured.lra > 8) {
    throw new Error(`Stage 12 audio/P0 correction smoke failed: ${JSON.stringify(audioMeasured)}`)
  }
  process.stdout.write('STAGE12_REMEDIATION_SMOKE_PASS\n')
} finally {
  await rm(root, { recursive: true, force: true })
}
