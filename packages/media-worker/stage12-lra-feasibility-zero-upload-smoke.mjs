import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { STAGE12_LRA_FEASIBILITY_POLICY, buildStage12LraFeasibilityMap,
  verifyStage12LraFeasibilityCandidate } from './stage12-lra-feasibility-controller.mjs'

const root = await mkdtemp(join(tmpdir(), 'stage12-lra-feasibility-smoke-'))
try {
  const wav = join(root, 'immutable-local-reference.wav')
  const result = spawnSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i',
    'sine=frequency=997:duration=1','-c:a','pcm_f32le','-y',wav], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error('REAL_FFMPEG_SMOKE_FAILED')
  const sourceSha = createHash('sha256').update(await readFile(wav)).digest('hex')
  const measurements = STAGE12_LRA_FEASIBILITY_POLICY.lattice.map((macroDepthDb) => ({
    macroDepthDb, integratedLufs: -14, truePeakDbtp: -1.05, loudnessRangeLu: 4,
    limiterCeilingDbtp: -2.67, sourceSha }))
  const thresholds = { integratedLufs: -14, toleranceLufs: 1, truePeakMaxDbtp: -1,
    lraMin: 4, lraMax: 8 }
  if (buildStage12LraFeasibilityMap(measurements, thresholds).length !== 8
    || !verifyStage12LraFeasibilityCandidate(measurements[0], thresholds).pass)
    throw new Error('DETERMINISTIC_FEASIBILITY_SMOKE_FAILED')
  process.stdout.write('STAGE12_LRA_FEASIBILITY_REAL_FFMPEG_ZERO_UPLOAD_PASS\n')
} finally { await rm(root, { recursive: true, force: true }) }
