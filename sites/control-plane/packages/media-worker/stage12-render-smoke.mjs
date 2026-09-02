import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildStage12VideoFilter } from './stage12-runtime.mjs'

function run(executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) })
      else reject(new Error(Buffer.concat(stderr).toString('utf8').slice(-4000)))
    })
  })
}

const workRoot = await mkdtemp(join(tmpdir(), 'factory-stage12-render-smoke-'))
try {
  const filterPath = join(workRoot, 'video-filter.txt')
  const outputPath = join(workRoot, 'smoke.webm')
  const payload = {
    durationSec: 9,
    render: { width: 640, height: 360, fps: 30 },
    qa: { nearStaticMaxSec: 7 },
    timeline: { shots: [{
      startFrame: 0,
      endFrame: 270,
      headline: 'The alert arrives',
      background: '#071816',
      accent: '#71f6c5',
      signal: '#ffb84d',
    }] },
  }
  await writeFile(filterPath, buildStage12VideoFilter(payload), 'utf8')
  await run('ffmpeg', [
    '-hide_banner', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'color=c=0x071816:s=640x360:r=30:d=9',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=9',
    '-filter_complex_script', filterPath,
    '-map', '[vout]', '-map', '1:a',
    '-c:v', 'libvpx-vp9', '-deadline', 'realtime',
    '-c:a', 'libopus', '-ar', '48000', '-t', '9',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    outputPath,
  ], workRoot)
  const probe = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate',
    '-of', 'json', outputPath,
  ], workRoot)
  const streams = JSON.parse(probe.stdout.toString('utf8')).streams ?? []
  const video = streams.find((stream) => stream.codec_type === 'video')
  const audio = streams.find((stream) => stream.codec_type === 'audio')
  const scan = await run('ffmpeg', [
    '-hide_banner', '-nostdin', '-i', outputPath,
    '-vf', 'blackdetect,freezedetect=d=7', '-f', 'null', '-',
  ], workRoot)
  const scanLog = scan.stderr.toString('utf8')
  if (!video || !audio || video.width !== 640 || video.height !== 360
    || video.r_frame_rate !== '30/1' || (await readFile(outputPath)).byteLength === 0
    || scanLog.includes('black_start:') || scanLog.includes('freeze_start:')) {
    throw new Error(`Stage 12 renderer smoke output failed verification: ${JSON.stringify({
      video, audio: Boolean(audio), black: scanLog.includes('black_start:'),
      freeze: scanLog.includes('freeze_start:'),
    })}`)
  }
  process.stdout.write('STAGE12_RENDER_SMOKE_PASS\n')
} finally {
  await rm(workRoot, { recursive: true, force: true })
}
