import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const inputs = JSON.parse(await readFile(join(here, 'inputs.json'), 'utf8'))
const sharpPath = process.env.SHARP_MODULE_PATH ?? ''
const outputRoot = resolve(process.argv[2] ?? join(here, 'results'))
await mkdir(outputRoot, { recursive: true })

const archetypes = ['title-card', 'split-panel', 'timeline', 'data-chart', 'quote-card', 'device-ui', 'webpage-scroll', 'kinetic-text']
const architectures = ['sharp-per-frame', 'render-once-filter-graph']

function runCase(architecture, archetype) {
  return new Promise((resolveCase, reject) => {
    const child = spawn(process.execPath, [join(here, 'runner.mjs'), architecture, archetype, outputRoot, sharpPath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolveCase(JSON.parse(stdout)) : reject(new Error(stderr)))
  })
}

const cases = []
for (const architecture of architectures) {
  for (const archetype of archetypes) cases.push(await runCase(architecture, archetype))
}

const benchmark = inputs.benchmark
const pixelFrameScale = (benchmark.production_width * benchmark.production_height * benchmark.production_fps)
  / (benchmark.width * benchmark.height * benchmark.fps)
const durationScale = benchmark.production_duration_seconds / benchmark.duration_seconds

function averageFor(architecture, field) {
  const values = cases.filter((entry) => entry.architecture === architecture).map((entry) => entry[field])
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const critic = inputs.stage14_fixture
const criticUnitUsd = critic.input_tokens_per_critic * critic.input_usd_per_million_tokens / 1_000_000
  + critic.output_tokens_per_critic * critic.output_usd_per_million_tokens / 1_000_000
const profiles = inputs.profiles.map((profile) => {
  const measuredWallMs = averageFor(profile.architecture, 'wallMs')
  const projectedComputeSeconds = measuredWallMs / 1000 * durationScale * pixelFrameScale * profile.deterministic_measurement_multiplier
  const mediaComputeUsd = projectedComputeSeconds * inputs.fly.usd_per_started_second_conservative
  const stage14Usd = profile.critics * criticUnitUsd
  const totalUsd = mediaComputeUsd + stage14Usd
  return {
    ...profile,
    projectedComputeSeconds: Number(projectedComputeSeconds.toFixed(3)),
    mediaComputeUsd: Number(mediaComputeUsd.toFixed(6)),
    stage14Usd: Number(stage14Usd.toFixed(6)),
    wp12bMeasuredScopeUsd: Number(totalUsd.toFixed(6)),
    underVideoCeiling: totalUsd <= 30,
    underScaledTarget: totalUsd <= 18
  }
})

const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  host: { platform: process.platform, arch: process.arch, node: process.version },
  inputs,
  cases,
  model: {
    pixelFrameScale,
    durationScale,
    criticUnitUsd,
    caveat: 'Measured scope covers media render compute plus a token-priced Stage 14 fixture. It excludes unqualified production providers, storage egress, TTS, stock, music and rework.'
  },
  profiles,
  conclusion: profiles.every((profile) => profile.underVideoCeiling)
    ? 'ALL_THREE_WITHIN_30_USD_FOR_MEASURED_SCOPE'
    : 'ONE_OR_MORE_EXCEED_30_USD_FOR_MEASURED_SCOPE'
}
const canonical = `${JSON.stringify(evidence, null, 2)}\n`
const hash = createHash('sha256').update(canonical).digest('hex')
await writeFile(join(outputRoot, 'evidence.json'), canonical)

const rows = cases.map((entry) => `| ${entry.archetype} | ${entry.architecture} | ${entry.wallMs.toFixed(1)} | ${entry.cpuSeconds.toFixed(3)} | ${(entry.peakRssBytes / 1048576).toFixed(1)} | ${entry.outputBytes} | ${entry.headlessChromiumRequired ? 'YES' : 'NO'} |`).join('\n')
const profileRows = profiles.map((entry) => `| ${entry.name} | ${entry.architecture} | ${entry.critics} | ${entry.projectedComputeSeconds.toFixed(1)} | $${entry.mediaComputeUsd.toFixed(4)} | $${entry.stage14Usd.toFixed(4)} | $${entry.wp12bMeasuredScopeUsd.toFixed(4)} | ${entry.underVideoCeiling ? 'YES' : 'NO'} |`).join('\n')
const report = `# WP-12B Cost Benchmark\n\nEvidence SHA-256: \`${hash}\`\n\n## Measured matrix\n\n| Archetype | Architecture | Wall ms | CPU s | Peak MiB | Output bytes | Chromium |\n|---|---|---:|---:|---:|---:|---|\n${rows}\n\n## Cost/video model\n\n| Profile | Architecture | Critics | Projected compute s | Media | Stage 14 | Measured scope total | ≤ $30 |\n|---|---|---:|---:|---:|---:|---:|---|\n${profileRows}\n\n## Numeric conclusion\n\n**${evidence.conclusion}**\n\nThis is a decision checkpoint, not production spend. The Stage 14 model is a pricing fixture and is explicitly **not QUALIFIED**. The total excludes every unqualified/unmeasured provider and rework; it cannot be represented as the final all-in factory cost. Owner numeric confirmation is still mandatory before WP-13.\n`
await writeFile(join(outputRoot, 'REPORT.md'), report)
process.stdout.write(`${JSON.stringify({ outputRoot, evidenceSha256: hash, conclusion: evidence.conclusion, profiles }, null, 2)}\n`)
