import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { runStage12LraFeasibilityController, STAGE12_LRA_FEASIBILITY_POLICY,
} from './stage12-lra-feasibility-controller.mjs'

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${executable} failed: ${result.stderr.slice(-1000)}`)
  return result
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function parseLoudnorm(stderr) {
  const blocks = [...stderr.matchAll(/\{[\s\S]*?"target_offset"\s*:\s*"[^"]+"[\s\S]*?\}/gu)]
  const parsed = JSON.parse(blocks.at(-1)?.[0] ?? 'null')
  if (!parsed) throw new Error('REAL_FFMPEG_LOUDNESS_MEASUREMENT_MISSING')
  return { integratedLufs: Number(parsed.input_i), integratedLufsExact: String(parsed.input_i),
    truePeakDbtp: Number(parsed.input_tp), truePeakDbtpExact: String(parsed.input_tp),
    loudnessRangeLu: Number(parsed.input_lra), loudnessRangeLuExact: String(parsed.input_lra),
    threshold: Number(parsed.input_thresh), offset: Number(parsed.target_offset) }
}

function macroFilter(macroDepthDb) {
  const periodSec = 1
  const gain = 10 ** (-macroDepthDb / 20)
  return `volume='if(lt(mod(t\\,${periodSec})\\,0.5)\\,${gain.toFixed(6)}\\,1)':eval=frame,`
}

async function executeController(root, source, runOrdinal) {
  let candidateCount = 0
  const thresholds = { integratedLufs: -14, toleranceLufs: 1, truePeakMaxDbtp: -1,
    lraMin: 4, lraMax: 8, nearStaticMaxSec: 0.25, sampleRateHz: 48000 }
  const result = await runStage12LraFeasibilityController({ thresholds,
    policy: STAGE12_LRA_FEASIBILITY_POLICY, anchorLimiterCeilingDbtp: -2.67,
    safeRollbackCandidate: { candidatePass: 5, macroDepthDb: 10.70625,
      integratedTargetLufs: -14, limiterCeilingDbtp: -2.67 },
    probe: async (plan) => {
      const candidate = join(root,
        `run-${runOrdinal}-${plan.phase.toLowerCase()}-${plan.phaseOrdinal}.webm`)
      const lraTarget = 6
      const target = `I=${plan.integratedTargetLufs.toFixed(6)}:TP=${plan.limiterCeilingDbtp.toFixed(6)}:LRA=${lraTarget}`
      const macro = macroFilter(plan.macroDepthDb)
      const analysis = run('ffmpeg', ['-hide_banner', '-nostdin', '-i', source,
        '-af', `${macro}loudnorm=${target}:print_format=json`, '-f', 'null', '-'], root)
      const measuredInput = parseLoudnorm(analysis.stderr)
      const limit = 10 ** (plan.limiterCeilingDbtp / 20)
      const correction = `${macro}loudnorm=${target}:measured_I=${measuredInput.integratedLufs}:measured_TP=${measuredInput.truePeakDbtp}:measured_LRA=${measuredInput.loudnessRangeLu}:measured_thresh=${measuredInput.threshold}:offset=${measuredInput.offset}:linear=false,alimiter=limit=${limit.toFixed(6)}:level=false`
      run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', source,
        '-map', '0:a:0', '-map_metadata', '-1', '-fflags', '+bitexact',
        '-flags:a', '+bitexact', '-af', correction, '-c:a', 'libopus',
        '-ar', '48000', candidate], root)
      const measuredOutput = run('ffmpeg', ['-hide_banner', '-nostdin', '-i', candidate,
        '-af', 'loudnorm=I=-14:TP=-1:LRA=6:print_format=json', '-f', 'null', '-'], root)
      const measurement = parseLoudnorm(measuredOutput.stderr)
      const frameMd5 = run('ffmpeg', ['-hide_banner', '-nostdin', '-i', candidate,
        '-map', '0:a:0', '-f', 'framemd5', '-'], root)
      candidateCount += 1
      return { ...measurement, candidateSha256: sha256(await readFile(candidate)),
        audioFrameMd5Sha256: sha256(Buffer.from(frameMd5.stdout)) }
    } })
  if (candidateCount !== result.candidateTrace.length
    || result.phaseBudgetUsed.LRA_MAP !== 8
    || result.phaseBudgetUsed.SAFE_ROLLBACK > 1
    || result.candidateTrace.some((candidate) => candidate.candidateSha256.length !== 64)) {
    throw new Error('REAL_FFMPEG_PHASE_LEDGER_INVALID')
  }
  return result
}

const root = await mkdtemp(join(tmpdir(), 'stage12-lra-feasibility-smoke-'))
try {
  const wav = join(root, 'immutable-local-reference.wav')
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'sine=frequency=997:duration=2', '-c:a', 'pcm_f32le', '-ar', '48000', '-y', wav], root)
  const sourceSha = sha256(await readFile(wav))
  let networkCalls = 0
  globalThis.fetch = async () => { networkCalls += 1; throw new Error('NETWORK_FORBIDDEN') }
  const first = await executeController(root, wav, 1)
  const second = await executeController(root, wav, 2)
  if (sourceSha !== sha256(await readFile(wav)) || networkCalls !== 0
    || first.outcome !== second.outcome || first.terminalReason !== second.terminalReason
    || JSON.stringify(first.phaseBudgetUsed) !== JSON.stringify(second.phaseBudgetUsed)
    || JSON.stringify(first.candidateTrace.map((candidate) => candidate.candidateSha256))
      !== JSON.stringify(second.candidateTrace.map((candidate) => candidate.candidateSha256))) {
    throw new Error('DETERMINISTIC_FEASIBILITY_ZERO_UPLOAD_SMOKE_FAILED')
  }
  process.stdout.write('STAGE12_LRA_FEASIBILITY_REAL_FFMPEG_ZERO_UPLOAD_PASS\n')
} finally { await rm(root, { recursive: true, force: true }) }
