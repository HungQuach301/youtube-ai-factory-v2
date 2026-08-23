import { spawn } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'

const require = createRequire(import.meta.url)
const [architecture, archetype, outputRoot, sharpOverride] = process.argv.slice(2)
if (!architecture || !archetype || !outputRoot) throw new Error('architecture, archetype and output root are required')

const config = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url), 'utf8')).benchmark
const sharp = sharpOverride ? require(sharpOverride) : require('sharp')
const frameRoot = join(outputRoot, `${architecture}-${archetype}-frames`)
const outputPath = join(outputRoot, `${architecture}-${archetype}.mp4`)
await mkdir(frameRoot, { recursive: true })

const colors = {
  'title-card': ['#081322', '#ffcc4d'],
  'split-panel': ['#0e2239', '#50e3c2'],
  timeline: ['#17243a', '#ff6f61'],
  'data-chart': ['#061d2b', '#45b7d1'],
  'quote-card': ['#24152e', '#d4a5ff'],
  'device-ui': ['#111827', '#60a5fa'],
  'webpage-scroll': ['#172554', '#f8fafc'],
  'kinetic-text': ['#18181b', '#f97316']
}
const [background, accent] = colors[archetype] ?? ['#111827', '#ffffff']

function svg(frame) {
  const progress = frame / Math.max(1, config.fps * config.duration_seconds - 1)
  const x = Math.round(40 + progress * (config.width - 240))
  const blocks = Array.from({ length: archetype === 'data-chart' ? 10 : 4 }, (_, index) => {
    const height = 35 + ((index * 29 + frame * 7) % 120)
    return `<rect x="${60 + index * 48}" y="${config.height - height - 48}" width="28" height="${height}" rx="5" fill="${accent}" opacity="${0.35 + index * 0.05}"/>`
  }).join('')
  return Buffer.from(`<svg width="${config.width}" height="${config.height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${background}"/>
    <circle cx="${x}" cy="70" r="34" fill="${accent}" opacity="0.82"/>
    ${blocks}
    <rect x="44" y="30" width="${config.width - 88}" height="${config.height - 60}" rx="20" fill="none" stroke="${accent}" opacity="0.4" stroke-width="3"/>
    <text x="60" y="130" font-family="sans-serif" font-size="30" font-weight="700" fill="#ffffff">${archetype.toUpperCase()}</text>
    <text x="60" y="164" font-family="sans-serif" font-size="16" fill="#dbeafe">deterministic frame ${String(frame).padStart(3, '0')}</text>
  </svg>`)
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-benchmark', '-nostdin', '-hide_banner', '-loglevel', 'info', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr))
      const match = stderr.match(/bench: utime=([0-9.]+)s stime=([0-9.]+)s rtime=([0-9.]+)s\s*\nbench: maxrss=([0-9]+)kB/u)
      resolve(match ? { userSeconds: Number(match[1]), systemSeconds: Number(match[2]), maxRssKb: Number(match[4]) } : { userSeconds: 0, systemSeconds: 0, maxRssKb: 0 })
    })
  })
}

const started = performance.now()
const cpuBefore = process.cpuUsage()
let sharpPeakRss = process.memoryUsage().rss
let ffmpegUsage

if (architecture === 'sharp-per-frame') {
  for (let frame = 0; frame < config.fps * config.duration_seconds; frame += 1) {
    await sharp({ create: { width: config.width, height: config.height, channels: 4, background } })
      .composite([{ input: svg(frame), top: 0, left: 0 }])
      .png({ compressionLevel: 6, adaptiveFiltering: false })
      .toFile(join(frameRoot, `${String(frame).padStart(5, '0')}.png`))
    sharpPeakRss = Math.max(sharpPeakRss, process.memoryUsage().rss)
  }
  ffmpegUsage = await ffmpeg(['-framerate', String(config.fps), '-i', join(frameRoot, '%05d.png'), '-map_metadata', '-1', '-c:v', 'libx264', '-threads', '1', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', outputPath])
} else if (architecture === 'render-once-filter-graph') {
  const stillPath = join(frameRoot, 'base.png')
  await sharp({ create: { width: config.width, height: config.height, channels: 4, background } })
    .composite([{ input: svg(0), top: 0, left: 0 }])
    .png({ compressionLevel: 6, adaptiveFiltering: false })
    .toFile(stillPath)
  sharpPeakRss = Math.max(sharpPeakRss, process.memoryUsage().rss)
  ffmpegUsage = await ffmpeg(['-loop', '1', '-framerate', String(config.fps), '-i', stillPath, '-vf', `zoompan=z='min(zoom+0.0015,1.06)':d=1:s=${config.width}x${config.height}:fps=${config.fps}`, '-t', String(config.duration_seconds), '-map_metadata', '-1', '-c:v', 'libx264', '-threads', '1', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', outputPath])
} else {
  throw new Error(`unknown architecture ${architecture}`)
}

const cpu = process.cpuUsage(cpuBefore)
const output = {
  architecture,
  archetype,
  headlessChromiumRequired: ['device-ui', 'webpage-scroll'].includes(archetype),
  wallMs: Number((performance.now() - started).toFixed(3)),
  cpuSeconds: Number(((cpu.user + cpu.system) / 1e6 + ffmpegUsage.userSeconds + ffmpegUsage.systemSeconds).toFixed(6)),
  peakRssBytes: Math.max(sharpPeakRss, ffmpegUsage.maxRssKb * 1024),
  outputBytes: (await stat(outputPath)).size,
  outputPath: basename(outputPath),
  sharpVersion: sharp.versions.sharp,
  libvipsVersion: sharp.versions.vips
}
await writeFile(join(outputRoot, `${architecture}-${archetype}.json`), `${JSON.stringify(output, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(output)}\n`)
