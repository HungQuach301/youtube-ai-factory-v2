import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

import { canonicalHash, canonicalizeExact } from '../packages/core-hash/dist/index.js'
import {
  createDualCalibrationPlan,
  evaluateDualCalibrationReadiness,
} from '../packages/human-evidence/dist/src/dual-calibration-plan.js'

const MARKER_PATH = resolve('qualification-runs/dual-calibration-plan.json')
const EXPECTED_WORK_PACKAGE = 'G-02G'
const EXPECTED_NAMESPACE = 'qualification'
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const requireInside = (root, path) => {
  const fromRoot = relative(root, path)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`OUTPUT_PATH_OUTSIDE_ROOT:${path}`)
  }
}

const writeExact = async (path, bytes) => {
  await writeFile(path, bytes)
  const readback = await readFile(path)
  if (!readback.equals(bytes)) throw new Error(`READBACK_MISMATCH:${path}`)
  return sha256(readback)
}

const writeCanonical = async (path, value) => writeExact(
  path,
  Buffer.from(`${canonicalizeExact(value)}\n`, 'utf8'),
)

const readMarker = async () => {
  const marker = JSON.parse(await readFile(MARKER_PATH, 'utf8'))
  if (marker.schemaVersion !== 1
    || marker.workPackage !== EXPECTED_WORK_PACKAGE
    || marker.namespace !== EXPECTED_NAMESPACE
    || marker.state !== 'OWNER_ACTION_REQUIRED'
    || marker.productionEligible !== false
    || marker.providerDispatch !== 'OFF'
    || marker.autoPublish !== 'OFF'
    || typeof marker.createdAt !== 'string') {
    throw new Error('INVALID_DUAL_CALIBRATION_PLAN_MARKER')
  }
  return marker
}

const ownerAction = (plan) => `# G-02G owner action\n\n` +
  `1. Open ${plan.corpus.datasetUrl}\n` +
  `2. Accept the dataset terms in the Mozilla Data Collective web UI.\n` +
  `3. Create an API credential in Profile > API.\n` +
  `4. Save it as the GitHub Actions secret \`MDC_API_KEY\`.\n\n` +
  `Do not paste the credential into chat, source code, issues, or pull requests.\n`

const materialize = async (outputArgument) => {
  const outputRoot = resolve(outputArgument)
  await mkdir(outputRoot, { recursive: true })
  const marker = await readMarker()
  const plan = createDualCalibrationPlan(marker.createdAt)
  const readiness = evaluateDualCalibrationReadiness(plan, {
    mdcTermsAccepted: false,
    mdcApiCredentialConfigured: false,
    elevenLabsApiCredentialConfigured: true,
    productionVoiceRegistered: true,
  })
  if (readiness.readyForExecution || readiness.providerDispatch !== 'OFF' || readiness.productionEligible) {
    throw new Error('OWNER_ACTION_REQUIRED_PLAN_MUST_FAIL_CLOSED')
  }

  const planPath = resolve(outputRoot, 'plan.json')
  const readinessPath = resolve(outputRoot, 'readiness.json')
  const ownerActionPath = resolve(outputRoot, 'OWNER-ACTION.md')
  for (const path of [planPath, readinessPath, ownerActionPath]) requireInside(outputRoot, path)
  const files = {
    'plan.json': await writeCanonical(planPath, plan),
    'readiness.json': await writeCanonical(readinessPath, readiness),
    'OWNER-ACTION.md': await writeExact(ownerActionPath, Buffer.from(ownerAction(plan), 'utf8')),
  }
  const manifest = {
    schemaVersion: 1,
    workPackage: EXPECTED_WORK_PACKAGE,
    namespace: EXPECTED_NAMESPACE,
    state: 'OWNER_ACTION_REQUIRED',
    createdAt: marker.createdAt,
    productionEligible: false,
    providerDispatch: 'OFF',
    autoPublish: 'OFF',
    providerCallCount: 0,
    files,
  }
  const manifestPath = resolve(outputRoot, 'manifest.json')
  const manifestSha256 = await writeCanonical(manifestPath, manifest)
  await writeCanonical(resolve(outputRoot, 'manifest.sha256.json'), {
    algorithm: 'sha256',
    file: 'manifest.json',
    sha256: manifestSha256,
  })
  process.stdout.write(`${canonicalizeExact({ manifestSha256, state: manifest.state, blockers: readiness.blockers })}\n`)
}

const outputSnapshot = async (rootArgument) => {
  const root = resolve(rootArgument)
  const names = (await readdir(root)).filter((name) => name !== 'replay-receipt.json').sort()
  const files = {}
  for (const name of names) {
    const path = resolve(root, name)
    requireInside(root, path)
    files[name] = sha256(await readFile(path))
  }
  return files
}

const verifyReplay = async (firstArgument, replayArgument) => {
  const [first, replay] = await Promise.all([outputSnapshot(firstArgument), outputSnapshot(replayArgument)])
  if (canonicalHash(first) !== canonicalHash(replay)) throw new Error('IDEMPOTENT_REPLAY_MISMATCH')
  const receipt = {
    schemaVersion: 1,
    workPackage: EXPECTED_WORK_PACKAGE,
    namespace: EXPECTED_NAMESPACE,
    accepted: true,
    replayed: true,
    fileCount: Object.keys(first).length,
    canonicalOutputHash: canonicalHash(first),
    providerCallCount: 0,
    providerDispatch: 'OFF',
    autoPublish: 'OFF',
    productionEligible: false,
    state: 'OWNER_ACTION_REQUIRED',
  }
  const receiptSha256 = await writeCanonical(resolve(firstArgument, 'replay-receipt.json'), receipt)
  process.stdout.write(`${canonicalizeExact({ ...receipt, receiptSha256 })}\n`)
}

const args = process.argv.slice(2)
if (args[0] === '--output' && args[1] !== undefined && args.length === 2) {
  await materialize(args[1])
} else if (args[0] === '--verify-replay' && args[1] !== undefined && args[2] !== undefined && args.length === 3) {
  await verifyReplay(args[1], args[2])
} else {
  throw new Error('Usage: --output <dir> | --verify-replay <first-dir> <replay-dir>')
}
