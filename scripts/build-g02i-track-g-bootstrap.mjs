import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

import { thresholds } from '../packages/contracts/dist/index.js'
import {
  AssurancePanel,
  gatePrerequisites,
  resolveAssuranceLaneEligibility,
} from '../packages/assurance/dist/src/index.js'
import { canonicalHash, canonicalizeExact } from '../packages/core-hash/dist/index.js'

const MARKER_PATH = resolve('qualification-runs/g02i-track-g-bootstrap.json')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const requireInside = (root, path) => {
  const fromRoot = relative(root, path)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`PATH_OUTSIDE_ROOT:${path}`)
  }
}
const writeCanonical = async (path, value) => {
  await mkdir(resolve(path, '..'), { recursive: true })
  const bytes = Buffer.from(`${canonicalizeExact(value)}\n`, 'utf8')
  await writeFile(path, bytes)
  const readback = await readFile(path)
  if (!readback.equals(bytes)) throw new Error(`READBACK_MISMATCH:${path}`)
  return sha256(readback)
}

async function checksumMap(root, expectedCount) {
  const lines = (await readFile(resolve(root, 'artifact-sha256s.txt'), 'utf8')).split('\n').filter(Boolean)
  if (lines.length !== expectedCount) throw new Error('SOURCE_CHECKSUM_COUNT_MISMATCH')
  for (const line of lines) {
    const split = line.indexOf('  ')
    if (split < 0) throw new Error('SOURCE_CHECKSUM_FORMAT')
    const digest = line.slice(0, split)
    const name = line.slice(split + 2).replace(/^\.\//u, '')
    const path = resolve(root, name); requireInside(root, path)
    if (sha256(await readFile(path)) !== digest) throw new Error(`SOURCE_CHECKSUM_MISMATCH:${name}`)
  }
}

const reducedCodes = [
  'TRUTH_BRAND_SAFETY', 'SEMANTIC_ALIGNMENT', 'STORY_RETENTION', 'PACKAGING_CTR',
]
function registeredCritics() {
  return reducedCodes.map((code) => ({
    code,
    capabilityId: `registered-${code}`,
    qualificationState: 'REGISTERED',
    qualificationRunId: null,
    judge: async () => { throw new Error('BOOTSTRAP_MUST_NOT_DISPATCH') },
  }))
}

async function materialize(sourceArg, outputArg) {
  const marker = JSON.parse(await readFile(MARKER_PATH, 'utf8'))
  if (marker.workPackage !== 'G-02I-1B' || marker.namespace !== 'qualification'
    || marker.profile !== 'REDUCED' || marker.assuranceMode !== 'WARNING_ONLY'
    || marker.productionEligible !== false || marker.providerDispatch !== 'OFF'
    || marker.autoPublish !== 'OFF') throw new Error('INVALID_BOOTSTRAP_MARKER')
  const source = resolve(sourceArg), output = resolve(outputArg)
  await checksumMap(source, marker.source.checksumEntryCount)
  const sourceReplay = JSON.parse(await readFile(resolve(source, 'replay-receipt.json'), 'utf8'))
  const sourceReadiness = JSON.parse(await readFile(resolve(source, 'readiness.json'), 'utf8'))
  if (sourceReplay.providerCallsDuringReplay !== 0 || sourceReplay.productionEligible !== false
    || sourceReadiness.counts.anchorCandidates !== marker.source.anchorCandidates
    || sourceReadiness.counts.ownerJudgments !== marker.source.ownerJudgments
    || sourceReadiness.counts.realRejectedMasterCandidates !== marker.source.realRejectedMasterCandidates) {
    throw new Error('G02I1A_SOURCE_INVALID')
  }

  const panel = new AssurancePanel(registeredCritics())
  const common = {
    profile: 'REDUCED',
    profileSettings: thresholds.PROFILE.REDUCED,
    masterEvidenceHash: sourceReplay.canonicalOutputHash,
    temporalSampleRefs: ['review-media/anchor-voice-intelligibility-pass.mp3'],
    prerequisites: gatePrerequisites(['PASS', 'PASS']),
    rubric: {},
  }
  const warningResult = await panel.run({ ...common, runId: 'g02i-1b-warning', mode: 'WARNING_ONLY' })
  const hardGateResult = await panel.run({ ...common, runId: 'g02i-1b-hard-gate-control', mode: 'HARD_GATE' })
  const warningResolution = resolveAssuranceLaneEligibility(warningResult)
  const hardGateResolution = resolveAssuranceLaneEligibility(hardGateResult)
  if (!warningResolution.qualificationLaneEligible || warningResolution.releaseEligible
    || warningResolution.hardBlockers.length !== 0 || warningResult.providerCallCount !== 0
    || hardGateResolution.qualificationLaneEligible || hardGateResolution.releaseEligible
    || hardGateResolution.hardBlockers.length === 0 || hardGateResult.providerCallCount !== 0) {
    throw new Error('BOOTSTRAP_ELIGIBILITY_INVARIANT_FAILED')
  }

  const files = {}
  files['bootstrap-resolution.json'] = await writeCanonical(resolve(output, 'bootstrap-resolution.json'), {
    schemaVersion: 1,
    workPackage: 'G-02I-1B',
    warningOnly: { result: warningResult, resolution: warningResolution },
    hardGateControl: { result: hardGateResult, resolution: hardGateResolution },
  })
  files['source-readback.json'] = await writeCanonical(resolve(output, 'source-readback.json'), {
    schemaVersion: 1,
    source: marker.source,
    sourceState: sourceReadiness.state,
    sourceBlockers: sourceReadiness.blockers,
    checksumsVerified: marker.source.checksumEntryCount,
  })
  await writeCanonical(resolve(output, 'manifest.json'), {
    schemaVersion: 1,
    workPackage: 'G-02I-1B',
    namespace: 'qualification',
    state: 'TRACK_G_BOOTSTRAP_ELIGIBLE',
    profile: 'REDUCED',
    assuranceMode: 'WARNING_ONLY',
    qualificationLaneEligible: true,
    releaseEligible: false,
    providerCallCount: 0,
    productionEligible: false,
    providerDispatch: 'OFF',
    autoPublish: 'OFF',
    files,
  })
}

async function snapshot(rootArg) {
  const root = resolve(rootArg), files = {}
  for (const name of (await readdir(root)).filter((item) => item !== 'replay-receipt.json').sort()) {
    const path = resolve(root, name); requireInside(root, path)
    files[name] = sha256(await readFile(path))
  }
  return files
}
async function verifyReplay(firstArg, replayArg) {
  const [first, replay] = await Promise.all([snapshot(firstArg), snapshot(replayArg)])
  const firstHash = canonicalHash(first)
  if (firstHash !== canonicalHash(replay)) throw new Error('IDEMPOTENT_REPLAY_MISMATCH')
  await writeCanonical(resolve(firstArg, 'replay-receipt.json'), {
    schemaVersion: 1,
    workPackage: 'G-02I-1B',
    accepted: true,
    replayed: true,
    canonicalOutputHash: firstHash,
    providerCallsDuringReplay: 0,
    qualificationLaneEligible: true,
    releaseEligible: false,
    productionEligible: false,
    providerDispatch: 'OFF',
    autoPublish: 'OFF',
  })
}

const args = process.argv.slice(2)
if (args[0] === '--materialize' && args.length === 3) await materialize(args[1], args[2])
else if (args[0] === '--verify-replay' && args.length === 3) await verifyReplay(args[1], args[2])
else throw new Error('Usage: --materialize <g02i1a-source> <output> | --verify-replay <first> <replay>')
